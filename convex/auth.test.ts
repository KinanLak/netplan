import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";
import { components, internal } from "./_generated/api";
import { createSignedInUser, testBackend } from "./_test/auth.setup";
import type { TestBackend } from "./_test/auth.setup";

const SITE = "http://netplan.test";
const PASSWORD = "first-password-1"; // gitleaks:allow
const NEW_PASSWORD = "second-password-2"; // gitleaks:allow

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

// The relay `mail.send` talks to: it records instead of connecting.
const sent: Array<SentMail> = [];
void mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: (mail: SentMail) => {
        sent.push(mail);
        return Promise.resolve({});
      },
      close: () => {},
    }),
  },
}));

const env = {
  SITE_URL: SITE,
  BETTER_AUTH_SECRET: "test-secret-for-better-auth-only-0123456789", // gitleaks:allow
  SMTP_HOST: "relay.test",
  SMTP_FROM: "Netplan <netplan@example.test>",
};
const saved = { ...process.env };
beforeAll(() => {
  Object.assign(process.env, env);
});
afterAll(() => {
  for (const key of Object.keys(env)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});
beforeEach(() => {
  sent.length = 0;
});

const withMail = () => testBackend({ "./mail.ts": () => import("./mail") });

const post = (t: TestBackend, path: string, body: unknown) =>
  t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE },
    body: JSON.stringify(body),
  });

const requestReset = (t: TestBackend, email: string) =>
  post(t, "/request-password-reset", { email, redirectTo: "/reset-password" });

/** The mails the relay received once every scheduled send has run. */
const outbox = async (t: TestBackend) => {
  // Real timers: this only yields until the scheduled sends have run.
  await t.finishAllScheduledFunctions(() => {});
  return sent;
};

async function userWithPassword(t: TestBackend) {
  await t.action(internal.bootstrap.ensureFirstAdmin, {
    email: "owner@example.test",
    password: PASSWORD,
    name: "Owner",
  });
  return "owner@example.test";
}

async function emailOf(t: TestBackend, userId: string) {
  const user = (await t.run((ctx) =>
    ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: userId }],
    }),
  )) as { email: string };
  return user.email;
}

describe("forgotten password", () => {
  it("mails a one-hour link that sets a new password and ends the other sessions", async () => {
    const t = withMail();
    const email = await userWithPassword(t);
    const signIn = (password: string) =>
      post(t, "/sign-in/email", { email, password });
    expect((await signIn(PASSWORD)).status).toBe(200);

    expect((await requestReset(t, email)).status).toBe(200);
    const [mail] = await outbox(t);
    expect(mail.to).toBe(email);
    expect(mail.text).toContain("Bonjour Owner");
    const link = /https?:\/\/\S+/.exec(mail.text)?.[0] ?? "";
    expect(link.startsWith(`${SITE}/api/auth/reset-password/`)).toBe(true);

    // The link checks the token and lands on the app's page with it.
    const landing = await t.fetch(link.slice(SITE.length), {
      redirect: "manual",
    });
    const page = new URL(landing.headers.get("location") ?? "");
    expect(page.pathname).toBe("/reset-password");
    const token = page.searchParams.get("token");
    expect(token).toBeTruthy();

    expect(
      (await post(t, "/reset-password", { token, newPassword: NEW_PASSWORD }))
        .status,
    ).toBe(200);
    const sessions = await t.run((ctx) =>
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "session",
        where: [],
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    );
    expect(sessions.page).toHaveLength(0);
    expect((await signIn(PASSWORD)).status).toBe(401);
    expect((await signIn(NEW_PASSWORD)).status).toBe(200);

    // A link works once.
    expect(
      (await post(t, "/reset-password", { token, newPassword: PASSWORD }))
        .status,
    ).toBe(400);
  });

  it("answers the same but mails nobody for an unknown, SSO or disabled account", async () => {
    const t = withMail();
    const sso = await createSignedInUser(t, "reader");
    await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            userId: sso.userId,
            accountId: "keycloak-subject",
            providerId: "keycloak",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      }),
    );
    const disabled = await createSignedInUser(t, "editor", { banned: true });

    for (const email of [
      "nobody@example.test",
      await emailOf(t, sso.userId),
      await emailOf(t, disabled.userId),
    ]) {
      const response = await requestReset(t, email);
      expect(response.status).toBe(200);
    }
    expect(await outbox(t)).toEqual([]);
  });

  it("mails an invited user who has not chosen a password yet", async () => {
    const t = withMail();
    const invited = await createSignedInUser(t, "reader");
    const email = await emailOf(t, invited.userId);

    await requestReset(t, email);
    expect((await outbox(t)).map((mail) => mail.to)).toEqual([email]);
  });
});
