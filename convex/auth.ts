import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
} from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { genericOAuth, keycloak } from "better-auth/plugins/generic-oauth";
import type { BetterAuthPlugin } from "better-auth/types";
import { username } from "better-auth/plugins/username";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { authRoles } from "./lib/authRoles";
import {
  keycloakRoleNames,
  readKeycloakConfig,
  roleFromKeycloak,
} from "./lib/keycloak";
import type { KeycloakConfig } from "./lib/keycloak";
import { resetPasswordMail } from "./lib/mailTemplates";
import type { AttemptKind } from "./lib/signInLimit";
import { noteSignIn } from "./lib/signIns";

// A session ends after 24 hours without use, and 7 days after login
// whatever its use (ADR 0031). Use extends it at most once an hour.
const SESSION_SECONDS = 24 * 60 * 60;
const SESSION_REFRESH_SECONDS = 60 * 60;
const SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const RESET_PASSWORD_SECONDS = 60 * 60;

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  { local: { schema: authSchema } },
);

/**
 * Whether a forgotten-password mail may go to this user. Not to a disabled
 * account, and not to an SSO account: setting a password would give it a
 * second way in that its identity provider does not control. An invited
 * user who has not chosen a password yet has no account at all and may.
 */
async function mayResetPassword(
  ctx: GenericCtx<DataModel>,
  userId: string,
): Promise<boolean> {
  const { runQuery } = requireActionCtx(ctx);
  const user = await runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: userId }],
  });
  if (!user || user.banned === true) return false;
  const account = (providerId?: string) =>
    runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "userId", value: userId },
        ...(providerId ? [{ field: "providerId", value: providerId }] : []),
      ],
    });
  return (await account("credential")) !== null || !(await account());
}

/**
 * Sets a Keycloak user's role from the tokens of the login creating this
 * session (ADR 0004). The callback stores the tokens it just received from
 * the token endpoint on the account before it creates the session, so a
 * role removed in Keycloak lands at the next login.
 */
async function applyKeycloakRole(
  ctx: GenericCtx<DataModel>,
  config: KeycloakConfig,
  userId: string,
) {
  const { runMutation, runQuery } = requireActionCtx(ctx);
  const account = await runQuery(components.betterAuth.adapter.findOne, {
    model: "account",
    where: [
      { field: "userId", value: userId },
      { field: "providerId", value: "keycloak" },
    ],
  });
  if (!account) return;
  const mapping = await runQuery(internal.authSettings.keycloakRoleMapping, {});
  const role = roleFromKeycloak(
    keycloakRoleNames(account, config.clientId, mapping),
    mapping,
  );
  await runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "_id", value: userId }],
      update: { role, updatedAt: Date.now() },
    },
  });
}

/**
 * The attempt a request makes on an identifier, for the endpoints that
 * check a password or send a mail to an address (ADR 0036).
 */
function limitedAttempt(
  path: string | undefined,
  body: unknown,
): { kind: AttemptKind; identifier: string } | null {
  const [kind, field] =
    path === "/sign-in/username"
      ? (["sign-in", "username"] as const)
      : path === "/sign-in/email"
        ? (["sign-in", "email"] as const)
        : path === "/request-password-reset"
          ? (["password-reset", "email"] as const)
          : [];
  if (!kind) return null;
  const identifier: unknown = (body as Record<string, unknown> | undefined)?.[
    field
  ];
  return typeof identifier === "string" ? { kind, identifier } : null;
}

/**
 * `GET /api/auth/sign-in-options`: what the login page offers, read before
 * anyone is signed in.
 */
const signInOptions = (keycloakEnabled: boolean) =>
  ({
    id: "netplan-sign-in-options",
    endpoints: {
      signInOptions: createAuthEndpoint(
        "/sign-in-options",
        { method: "GET" },
        (endpoint) =>
          Promise.resolve(endpoint.json({ keycloak: keycloakEnabled })),
      ),
    },
  }) satisfies BetterAuthPlugin;

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const keycloakConfig = readKeycloakConfig(process.env);
  return {
    baseURL: process.env.SITE_URL,
    // SITE_URL plus TRUSTED_ORIGINS (comma-separated), which dev:agent sets
    // for the end-to-end server.
    trustedOrigins: [process.env.SITE_URL, process.env.TRUSTED_ORIGINS]
      .flatMap((value) => value?.split(",") ?? [])
      .map((origin) => origin.trim())
      .filter(Boolean),
    database: authComponent.adapter(ctx),
    session: {
      expiresIn: SESSION_SECONDS,
      updateAge: SESSION_REFRESH_SECONDS,
    },
    // better-auth counts per client address, and Netplan's servers see none
    // they can trust: every visitor would share one bucket, which one
    // stranger could empty for everyone. Attempts count per identifier in
    // the hooks below instead (ADR 0036).
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (endpoint) => {
        const limited = limitedAttempt(endpoint.path, endpoint.body);
        if (!limited) return;
        const result = await requireActionCtx(ctx).runMutation(
          internal.authAttempts.consume,
          limited,
        );
        if (!result.allowed) {
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "TOO_MANY_ATTEMPTS",
            message: "Too many attempts for this identifier.",
            retryAfter: Math.ceil(result.retryAfterMs / 1000),
          });
        }
      }),
      after: createAuthMiddleware(async (endpoint) => {
        const limited = limitedAttempt(endpoint.path, endpoint.body);
        if (limited?.kind !== "sign-in" || !endpoint.context.newSession) {
          return;
        }
        await requireActionCtx(ctx).runMutation(
          internal.authAttempts.clear,
          limited,
        );
      }),
    },
    account: {
      // A Keycloak login whose email a local account already uses is refused
      // (ADR 0021): linking would let the identity provider into an account
      // its admin created with a password, under that account's role.
      accountLinking: { enabled: false },
    },
    // Linking from a signed-in session does not check the setting above, and
    // generic OAuth also registers Keycloak with the social linking route.
    // Without a per-address limit, asking whether a username is free would
    // list the accounts one by one; the sign-in page never asks (ADR 0036).
    disabledPaths: ["/oauth2/link", "/link-social", "/is-username-available"],
    // OAuth failures that happen before the sign-in state is read (Keycloak
    // answering access_denied, a lost state) go here, not to an English
    // library page; the login page explains the code.
    onAPIError: {
      errorURL: process.env.SITE_URL
        ? `${process.env.SITE_URL.replace(/\/+$/, "")}/login`
        : undefined,
    },
    databaseHooks: {
      session: {
        // Activity extends a session up to 7 days after its login, so a
        // role removed in Keycloak lands within a week (ADR 0031).
        update: {
          before: async (session, endpoint) => {
            if (!(session.expiresAt instanceof Date)) return;
            const token = endpoint
              ? await endpoint.getSignedCookie(
                  endpoint.context.authCookies.sessionToken.name,
                  endpoint.context.secret,
                )
              : null;
            const current = token
              ? await endpoint?.context.internalAdapter.findSession(token)
              : null;
            // Refusing the update would end the session: better-auth signs
            // out when it fails. The browser sends the cookie, and the
            // bearer plugin turns a token into one.
            if (!current) return;
            // The Convex adapter hands dates back as numbers.
            const cap =
              new Date(current.session.createdAt).getTime() + SESSION_MAX_MS;
            if (session.expiresAt.getTime() <= cap) return;
            return { data: { ...session, expiresAt: new Date(cap) } };
          },
        },
        create: {
          before: async (session, context) => {
            if (
              keycloakConfig &&
              context?.path.startsWith("/oauth2/callback/")
            ) {
              await applyKeycloakRole(ctx, keycloakConfig, session.userId);
            }
          },
          // Sign-ins come through HTTP actions; a test or the seed may create
          // a session from a mutation.
          after: async (session) => {
            if ("db" in ctx && "scheduler" in ctx) {
              await noteSignIn(ctx, session.userId);
            } else {
              await requireActionCtx(ctx).runMutation(
                internal.users.recordSignIn,
                { userId: session.userId },
              );
            }
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      resetPasswordTokenExpiresIn: RESET_PASSWORD_SECONDS,
      // A reset is how a stolen session is taken back.
      revokeSessionsOnPasswordReset: true,
      // better-auth answers the same whether or not a mail leaves, so the
      // form says nothing about which addresses have an account.
      sendResetPassword: async ({ user, url }) => {
        if (!(await mayResetPassword(ctx, user.id))) return;
        // The landing page names the account for password managers, from
        // the account itself rather than from what the request said.
        const link = new URL(url);
        link.searchParams.set(
          "callbackURL",
          `/reset-password?${new URLSearchParams({ login: user.email }).toString()}`,
        );
        await requireActionCtx(ctx).scheduler.runAfter(0, internal.mail.send, {
          to: user.email,
          ...resetPasswordMail({ name: user.name, url: link.toString() }),
        });
      },
    },
    plugins: [
      username(),
      admin({ roles: authRoles, defaultRole: "reader", adminRoles: ["admin"] }),
      genericOAuth({
        config: keycloakConfig
          ? [
              {
                ...keycloak({ ...keycloakConfig, pkce: true }),
                // Keycloak leaves `name` out for a user without first and
                // last names, and better-auth refuses a login without one.
                mapProfileToUser: (profile) => ({
                  name:
                    [profile.name, profile.preferred_username, profile.email]
                      .find((value) => typeof value === "string" && value)
                      ?.toString() ?? "",
                }),
              },
            ]
          : [],
      }),
      signInOptions(keycloakConfig !== null),
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
