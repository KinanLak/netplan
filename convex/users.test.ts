import { describe, expect, it } from "bun:test";
import { api, components } from "./_generated/api";
import { createSignedInUser } from "./_test/auth.setup";
import type { TestBackend } from "./_test/auth.setup";
import {
  outbox,
  post,
  tokenFromLink,
  withMailRelay,
  withMail,
} from "./_test/mail.setup";
import { accountKind, invitationError, mailFailure } from "./lib/userAccounts";

const PASSWORD = "chosen-password-1"; // gitleaks:allow

withMailRelay();

async function asAdmin(t: TestBackend) {
  const admin = await createSignedInUser(t, "admin");
  return { ...admin, as: t.withIdentity(admin.identity) };
}

function addAccount(t: TestBackend, userId: string, providerId: string) {
  return t.run((ctx) =>
    ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "account",
        data: {
          userId,
          accountId: `${providerId}-${userId}`,
          providerId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    }),
  );
}

const sessionsOf = (t: TestBackend, userId: string) =>
  t.run(async (ctx) => {
    const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "session",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { cursor: null, numItems: 10 },
    });
    return page.page;
  });

describe("users.list", () => {
  it("tells local, Keycloak and invited accounts apart", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const local = await createSignedInUser(t, "editor");
    await addAccount(t, local.userId, "credential");
    const sso = await createSignedInUser(t, "reader");
    await addAccount(t, sso.userId, "keycloak");
    const invited = await createSignedInUser(t, "reader", { banned: true });

    const rows = await as.query(api.users.list, {});
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(local.userId)).toMatchObject({
      kind: "local",
      role: "editor",
      disabled: false,
    });
    expect(byId.get(sso.userId)?.kind).toBe("sso");
    expect(byId.get(invited.userId)).toMatchObject({
      kind: "invited",
      disabled: true,
    });
  });
});

describe("users.setRole", () => {
  it("changes a local account's role", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const target = await createSignedInUser(t, "reader");
    await addAccount(t, target.userId, "credential");

    await as.mutation(api.users.setRole, {
      userId: target.userId,
      role: "editor",
    });
    expect(
      await t.withIdentity(target.identity).query(api.users.me, {}),
    ).toMatchObject({ role: "editor" });
  });

  it("refuses the admin's own role and a Keycloak account's", async () => {
    const t = withMail();
    const { as, userId } = await asAdmin(t);
    const sso = await createSignedInUser(t, "reader");
    await addAccount(t, sso.userId, "keycloak");

    await expect(
      as.mutation(api.users.setRole, { userId, role: "reader" }),
    ).rejects.toThrow("votre propre rôle");
    await expect(
      as.mutation(api.users.setRole, { userId: sso.userId, role: "admin" }),
    ).rejects.toThrow("correspondance des rôles");
  });
});

describe("users.setDisabled", () => {
  it("shuts a disabled account out and lets it back in once enabled", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const target = await createSignedInUser(t, "editor");

    await as.mutation(api.users.setDisabled, {
      userId: target.userId,
      disabled: true,
    });
    await expect(
      t.withIdentity(target.identity).query(api.users.me, {}),
    ).rejects.toThrow();
    expect(await sessionsOf(t, target.userId)).toEqual([]);

    await as.mutation(api.users.setDisabled, {
      userId: target.userId,
      disabled: false,
    });
    const rows = await as.query(api.users.list, {});
    expect(rows.find((row) => row.id === target.userId)?.disabled).toBe(false);
  });

  it("refuses to disable the admin's own account", async () => {
    const t = withMail();
    const { as, userId } = await asAdmin(t);
    await expect(
      as.mutation(api.users.setDisabled, { userId, disabled: true }),
    ).rejects.toThrow("votre propre compte");
  });
});

describe("users.invite", () => {
  it("mails a link where the invited user chooses a password, then signs in by username or email", async () => {
    const t = withMail();
    const { as, name } = await asAdmin(t);

    const userId = await as.action(api.users.invite, {
      name: "Camille Martin",
      email: " Camille@Example.test ",
      username: "Camille.M",
      role: "editor",
    });
    const [mail] = await outbox(t);
    expect(mail.to).toBe("camille@example.test");
    expect(mail.text).toContain(name);
    expect(
      (await as.query(api.users.list, {})).find((row) => row.id === userId),
    ).toMatchObject({ kind: "invited", role: "editor", username: "Camille.M" });

    const { path, token } = await tokenFromLink(t, mail);
    expect(path).toBe("/reset-password");
    expect(
      (await post(t, "/reset-password", { token, newPassword: PASSWORD }))
        .status,
    ).toBe(200);
    expect(
      (
        await post(t, "/sign-in/username", {
          username: "camille.m",
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(t, "/sign-in/email", {
          email: "camille@example.test",
          password: PASSWORD,
        })
      ).status,
    ).toBe(200);
    expect(
      (await as.query(api.users.list, {})).find((row) => row.id === userId)
        ?.kind,
    ).toBe("local");
  });

  it("refuses a taken email or username and invalid input", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const invite = (fields: { email: string; username?: string }) =>
      as.action(api.users.invite, {
        name: "Dominique",
        role: "reader",
        ...fields,
      });
    await invite({ email: "dominique@example.test", username: "dominique" });

    await expect(invite({ email: "DOMINIQUE@example.test" })).rejects.toThrow(
      "adresse e-mail",
    );
    await expect(
      invite({ email: "other@example.test", username: "Dominique" }),
    ).rejects.toThrow("déjà pris");
    await expect(invite({ email: "not-an-email" })).rejects.toThrow(
      "pas valide",
    );
    await expect(
      as.action(api.users.invite, {
        name: " ",
        email: "x@example.test",
        role: "reader",
      }),
    ).rejects.toThrow("Indiquez le nom");
  });

  it("keeps the account and says so when the relay is not configured", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const host = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      await expect(
        as.action(api.users.invite, {
          name: "Eden",
          email: "eden@example.test",
          role: "reader",
        }),
      ).rejects.toThrow("Mail is not configured: set SMTP_HOST.");
    } finally {
      process.env.SMTP_HOST = host;
    }
    expect(
      (await as.query(api.users.list, {})).some(
        (row) => row.email === "eden@example.test",
      ),
    ).toBe(true);
  });
});

describe("users.resendInvitation", () => {
  it("mails a new link to an invited account only", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const invited = await createSignedInUser(t, "reader");
    const local = await createSignedInUser(t, "reader");
    await addAccount(t, local.userId, "credential");

    await as.action(api.users.resendInvitation, { userId: invited.userId });
    const [mail] = await outbox(t);
    expect((await tokenFromLink(t, mail)).token).toBeTruthy();

    await expect(
      as.action(api.users.resendInvitation, { userId: local.userId }),
    ).rejects.toThrow("déjà choisi");
  });

  it("refuses a disabled account", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const disabled = await createSignedInUser(t, "reader", { banned: true });
    await expect(
      as.action(api.users.resendInvitation, { userId: disabled.userId }),
    ).rejects.toThrow("Réactivez");
  });
});

describe("users.sendTestMail", () => {
  it("mails the admin and answers with their address", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const to = await as.action(api.users.sendTestMail, {});
    expect((await outbox(t)).map((mail) => mail.to)).toEqual([to]);
  });

  it("says why when the relay is not configured", async () => {
    const t = withMail();
    const { as } = await asAdmin(t);
    const from = process.env.SMTP_FROM;
    delete process.env.SMTP_FROM;
    try {
      await expect(as.action(api.users.sendTestMail, {})).rejects.toThrow(
        "L'e-mail n'est pas parti : Mail is not configured: set SMTP_FROM.",
      );
    } finally {
      process.env.SMTP_FROM = from;
    }
  });
});

describe("userAccounts", () => {
  it("reads the account kind from the providers", () => {
    expect(accountKind(["credential", "keycloak"])).toBe("local");
    expect(accountKind(["keycloak"])).toBe("sso");
    expect(accountKind([])).toBe("invited");
  });

  it("accepts the usernames sign-in accepts", () => {
    const check = (username?: string) =>
      invitationError({ name: "A", email: "a@example.test", username });
    expect(check()).toBeNull();
    expect(check("a.b_c9")).toBeNull();
    expect(check("ab")).not.toBeNull();
    expect(check("with-dash")).not.toBeNull();
  });

  it("keeps the relay's reason from an action's error", () => {
    expect(
      mailFailure(
        new Error(
          "[Request ID: 1] Server Error\nUncaught Error: Mail is not configured: set SMTP_HOST\n    at handler",
        ),
      ),
    ).toBe("Mail is not configured: set SMTP_HOST.");
  });
});
