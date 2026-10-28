import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import * as native from "undici";
import { api, components } from "./_generated/api";
import { createSignedInUser } from "./_test/auth.setup";
import type { TestBackend } from "./_test/auth.setup";
import { SITE, post, withMail, withMailRelay } from "./_test/mail.setup";
import {
  keycloakRoleNames,
  readKeycloakConfig,
  roleFromKeycloak,
} from "./lib/keycloak";

const ISSUER = "http://keycloak.test/realms/netplan";
const KEYCLOAK_ENV = {
  KEYCLOAK_ISSUER: ISSUER,
  KEYCLOAK_CLIENT_ID: "netplan",
  KEYCLOAK_CLIENT_SECRET: "test-client-secret", // gitleaks:allow
};

withMailRelay();

const jwt = (claims: Record<string, unknown>) =>
  [{ alg: "none" }, claims]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".") + ".signature";

// The Keycloak the next callback talks to: its discovery document, and a
// token endpoint that answers with the profile and realm roles below.
type Login = {
  sub: string;
  email: string;
  name: string;
  roles: Array<string>;
  groups?: Array<string>;
};
let nextLogin: Login = { sub: "", email: "", name: "", roles: [] };
const realFetch = globalThis.fetch;
// The test DOM's Request and Response drop Cookie and Set-Cookie as a
// browser's do; the OAuth state round trip needs the server's own.
const domClasses = {
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
};
beforeAll(() => {
  Object.assign(process.env, KEYCLOAK_ENV);
  Object.assign(globalThis, {
    Request: native.Request,
    Response: native.Response,
    Headers: native.Headers,
  });
  globalThis.fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${ISSUER}/.well-known/openid-configuration`) {
        return Promise.resolve(
          Response.json({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/protocol/openid-connect/auth`,
            token_endpoint: `${ISSUER}/protocol/openid-connect/token`,
            userinfo_endpoint: `${ISSUER}/protocol/openid-connect/userinfo`,
          }),
        );
      }
      if (url === `${ISSUER}/protocol/openid-connect/token`) {
        const { sub, email, name, roles, groups } = nextLogin;
        return Promise.resolve(
          Response.json({
            token_type: "Bearer",
            expires_in: 300,
            access_token: jwt({ sub, realm_access: { roles }, groups }),
            id_token: jwt({ sub, email, email_verified: true, name }),
          }),
        );
      }
      return realFetch(input, init);
    },
    realFetch,
  );
});
afterAll(() => {
  globalThis.fetch = realFetch;
  Object.assign(globalThis, domClasses);
  for (const key of Object.keys(KEYCLOAK_ENV)) delete process.env[key];
});

/**
 * Signs in through Keycloak as the login page does; answers the redirect and
 * the session cookie it sets.
 */
async function keycloakLogin(t: TestBackend, login: Login) {
  nextLogin = login;
  const start = await post(t, "/sign-in/oauth2", {
    providerId: "keycloak",
    callbackURL: "/",
    errorCallbackURL: "/login",
  });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state") ?? "";
  const callback = await t.fetch(
    `/api/auth/oauth2/callback/keycloak?${new URLSearchParams({ code: "code", state, iss: ISSUER })}`,
    { headers: { cookie: cookieOf(start) }, redirect: "manual" },
  );
  return {
    location: callback.headers.get("location") ?? "",
    cookie: cookieOf(callback),
  };
}

const cookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

const userByEmail = (t: TestBackend, email: string) =>
  t.run(
    async (ctx) =>
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "email", value: email }],
      })) as { _id: string; role: string; name: string } | null,
  );

async function asAdmin(t: TestBackend) {
  const admin = await createSignedInUser(t, "admin");
  return t.withIdentity(admin.identity);
}

const camille = {
  sub: "kc-camille",
  email: "camille@example.test",
  name: "Camille Keycloak",
};

describe("Keycloak sign-in", () => {
  it("lets an unknown user in as Lecteur and re-reads the mapped role at each login", async () => {
    const t = withMail();
    const admin = await asAdmin(t);

    expect(
      (await keycloakLogin(t, { ...camille, roles: ["netplan-editor"] }))
        .location,
    ).toBe("/");
    const created = await userByEmail(t, camille.email);
    expect(created).toMatchObject({ name: "Camille Keycloak", role: "reader" });
    const rows = await admin.query(api.users.list, {});
    expect(rows.find((row) => row.id === created?._id)?.kind).toBe("sso");

    await admin.mutation(api.authSettings.setKeycloakRoleMapping, {
      editorRole: "netplan-editor",
      adminRole: "netplan-admin",
      acceptGroups: false,
    });
    await keycloakLogin(t, { ...camille, roles: ["netplan-editor"] });
    expect((await userByEmail(t, camille.email))?.role).toBe("editor");
    await keycloakLogin(t, {
      ...camille,
      roles: ["netplan-editor", "netplan-admin"],
    });
    expect((await userByEmail(t, camille.email))?.role).toBe("admin");
    await keycloakLogin(t, { ...camille, roles: [] });
    expect((await userByEmail(t, camille.email))?.role).toBe("reader");
  });

  it("counts a group named like a role only when the admin accepts groups", async () => {
    const t = withMail();
    const admin = await asAdmin(t);
    const mapping = {
      editorRole: "netplan-editor",
      adminRole: "netplan-admin",
    };
    const inAdminGroup = { ...camille, roles: [], groups: ["/netplan-admin"] };

    await admin.mutation(api.authSettings.setKeycloakRoleMapping, {
      ...mapping,
      acceptGroups: false,
    });
    await keycloakLogin(t, inAdminGroup);
    expect((await userByEmail(t, camille.email))?.role).toBe("reader");

    await admin.mutation(api.authSettings.setKeycloakRoleMapping, {
      ...mapping,
      acceptGroups: true,
    });
    await keycloakLogin(t, inAdminGroup);
    expect((await userByEmail(t, camille.email))?.role).toBe("admin");
  });

  it("refuses a login whose email a local account uses", async () => {
    const t = withMail();
    const local = await createSignedInUser(t, "editor");
    const email = (
      (await t.run((ctx) =>
        ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "user",
          where: [{ field: "_id", value: local.userId }],
        }),
      )) as { email: string }
    ).email;

    const { location } = await keycloakLogin(t, {
      ...camille,
      email,
      roles: [],
    });
    expect(new URL(location, SITE).searchParams.get("error")).toBe(
      "account_not_linked",
    );
    const accounts = await t.run((ctx) =>
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "account",
        where: [{ field: "providerId", value: "keycloak" }],
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    );
    expect(accounts.page).toEqual([]);
  });

  it("refuses a disabled Keycloak user", async () => {
    const t = withMail();
    const admin = await asAdmin(t);
    await keycloakLogin(t, { ...camille, roles: [] });
    const user = await userByEmail(t, camille.email);
    await admin.mutation(api.users.setDisabled, {
      userId: user?._id ?? "",
      disabled: true,
    });

    const { location } = await keycloakLogin(t, { ...camille, roles: [] });
    expect(new URL(location, SITE).searchParams.get("error")).toBe(
      "BANNED_USER",
    );
  });

  it("tells the login page Keycloak is on, and offers no linking route", async () => {
    const t = withMail();
    const options = await t.fetch("/api/auth/sign-in-options");
    expect(await options.json()).toEqual({ keycloak: true });
    // Signed in, as linking requires: a local account linking a Keycloak
    // identity would keep its role at password logins.
    const { cookie } = await keycloakLogin(t, { ...camille, roles: [] });
    for (const [path, body] of [
      ["/oauth2/link", { providerId: "keycloak", callbackURL: "/" }],
      ["/link-social", { provider: "keycloak", callbackURL: "/" }],
    ] as const) {
      const response = await t.fetch(`/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: SITE, cookie },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(404);
    }
  });

  it("sends a login cancelled in Keycloak back to the login page", async () => {
    const t = withMail();
    const callback = await t.fetch(
      "/api/auth/oauth2/callback/keycloak?error=access_denied",
      { redirect: "manual" },
    );
    expect(callback.headers.get("location")).toStartWith(
      `${SITE}/login?error=access_denied`,
    );
  });

  it("is off without a client secret", async () => {
    const t = withMail();
    delete process.env.KEYCLOAK_CLIENT_SECRET;
    try {
      const options = await t.fetch("/api/auth/sign-in-options");
      expect(await options.json()).toEqual({ keycloak: false });
      const start = await post(t, "/sign-in/oauth2", {
        providerId: "keycloak",
        callbackURL: "/",
      });
      expect(start.ok).toBe(false);
    } finally {
      Object.assign(process.env, KEYCLOAK_ENV);
    }
  });
});

describe("Keycloak role mapping", () => {
  it("shows what to register and keeps blank names as none", async () => {
    const t = withMail();
    const admin = await asAdmin(t);
    await admin.mutation(api.authSettings.setKeycloakRoleMapping, {
      editorRole: " netplan-editor ",
      adminRole: " ",
      acceptGroups: false,
    });
    expect(await admin.query(api.authSettings.keycloak, {})).toEqual({
      issuer: ISSUER,
      clientId: "netplan",
      redirectUri: `${SITE}/api/auth/oauth2/callback/keycloak`,
      editorRole: "netplan-editor",
      adminRole: null,
      acceptGroups: false,
    });
  });

  it("refuses the same name for both roles", async () => {
    const t = withMail();
    const admin = await asAdmin(t);
    await expect(
      admin.mutation(api.authSettings.setKeycloakRoleMapping, {
        editorRole: "netplan",
        adminRole: "netplan",
        acceptGroups: false,
      }),
    ).rejects.toThrow("deux rôles différents");
  });
});

describe("Keycloak roles", () => {
  const token = (claims: Record<string, unknown>) => ({
    accessToken: jwt(claims),
  });

  it("reads realm and client roles, and groups only when accepted", () => {
    const tokens = {
      accessToken: jwt({
        realm_access: { roles: ["realm-role"] },
        resource_access: {
          netplan: { roles: ["client-role"] },
          other: { roles: ["other-client"] },
        },
      }),
      idToken: jwt({ roles: ["flat-role"], groups: ["/netplan-admins"] }),
    };
    const names = (acceptGroups: boolean) =>
      [...keycloakRoleNames(tokens, "netplan", { acceptGroups })].sort();
    expect(names(false)).toEqual(["client-role", "realm-role"]);
    expect(names(true)).toEqual(
      ["/netplan-admins", "client-role", "netplan-admins", "realm-role"].sort(),
    );
    expect(
      keycloakRoleNames(
        { accessToken: "not-a-jwt", idToken: null },
        "netplan",
        {
          acceptGroups: true,
        },
      ).size,
    ).toBe(0);
  });

  it("lets Admin win and gives Lecteur without a mapped name", () => {
    const mapping = { editorRole: "ed", adminRole: "ad", acceptGroups: false };
    const roleOf = (roles: Array<string>) =>
      roleFromKeycloak(
        keycloakRoleNames(
          token({ realm_access: { roles } }),
          "netplan",
          mapping,
        ),
        mapping,
      );
    expect(roleOf(["ed", "ad"])).toBe("admin");
    expect(roleOf(["ed"])).toBe("editor");
    expect(roleOf(["other"])).toBe("reader");
    expect(
      roleFromKeycloak(new Set(["ad"]), {
        editorRole: null,
        adminRole: null,
        acceptGroups: false,
      }),
    ).toBe("reader");
  });

  it("is on only with an issuer, a client id and a secret", () => {
    expect(
      readKeycloakConfig({ ...KEYCLOAK_ENV, KEYCLOAK_ISSUER: `${ISSUER}/` })
        ?.issuer,
    ).toBe(ISSUER);
    expect(
      readKeycloakConfig({ ...KEYCLOAK_ENV, KEYCLOAK_CLIENT_SECRET: " " }),
    ).toBeNull();
  });
});
