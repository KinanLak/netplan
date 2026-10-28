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
import { readKeycloakConfig } from "./lib/keycloak";
import type { KeycloakConfig } from "./lib/keycloak";
import { setRoleFromTokens } from "./lib/keycloakRole";
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
 * account, and not to an SSO account or one handed to Keycloak: setting a
 * password would give it a second way in that its identity provider does
 * not control. An invited user who has not chosen a password yet has no
 * account at all and may.
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
  if (await runQuery(internal.keycloakHandovers.isPending, { userId })) {
    return false;
  }
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
  await setRoleFromTokens(
    { runQuery, runMutation },
    config.clientId,
    userId,
    account,
  );
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
  // The email of the user a Keycloak sign-in is creating in this request:
  // its account is the one link that needs no handover.
  let signingUpEmail: string | null = null;
  const signInState = (userId: string) =>
    ctx.runQuery(internal.keycloakHandovers.signInState, { userId });
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
      // Linking is on so that an account an admin handed to Keycloak can
      // attach; the account hook below refuses every other link (ADR 0036).
      // better-auth links only when Keycloak says the address is verified,
      // so nobody takes a waiting account by typing its address there.
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: false,
      },
    },
    // Linking from a signed-in session does not check the setting above, and
    // generic OAuth also registers Keycloak with the social linking route.
    // Without a per-address limit, asking whether a username is free would
    // list the accounts one by one; the sign-in page never asks (ADR 0036).
    // The routes that hand out Keycloak's tokens or profile also refresh
    // the tokens, without reading the role again; the hourly re-read would
    // then drop its answer as overtaken (ADR 0036). Netplan needs none.
    disabledPaths: [
      "/oauth2/link",
      "/link-social",
      "/is-username-available",
      "/get-access-token",
      "/refresh-token",
      "/account-info",
    ],
    // OAuth failures that happen before the sign-in state is read (Keycloak
    // answering access_denied, a lost state) go here, not to an English
    // library page; the login page explains the code.
    onAPIError: {
      errorURL: process.env.SITE_URL
        ? `${process.env.SITE_URL.replace(/\/+$/, "")}/login`
        : undefined,
    },
    databaseHooks: {
      user: {
        create: {
          before: (user, context) => {
            if (context?.path.startsWith("/oauth2/callback/")) {
              signingUpEmail = user.email.toLowerCase();
            }
            return Promise.resolve();
          },
        },
      },
      account: {
        create: {
          // A Keycloak account goes to the user this sign-in just created,
          // or to an account an admin handed to Keycloak; nowhere else. A
          // password never goes to an account waiting for Keycloak, even
          // from a reset that was already under way at the handover.
          before: async (account) => {
            if (account.providerId === "credential") {
              const state = await signInState(account.userId);
              // Nor to a Keycloak account, which a reset begun before its
              // handover completed would otherwise reach.
              if (state.hasKeycloak || state.awaitingKeycloak) {
                throw new APIError("FORBIDDEN", {
                  code: "AWAITING_KEYCLOAK",
                });
              }
              return;
            }
            if (account.providerId !== "keycloak") return;
            const { runQuery } = requireActionCtx(ctx);
            const user = (await runQuery(
              components.betterAuth.adapter.findOne,
              {
                model: "user",
                where: [{ field: "_id", value: account.userId }],
              },
            )) as { email: string } | null;
            if (user && user.email === signingUpEmail) return;
            const handedOver = await runQuery(
              internal.keycloakHandovers.isPending,
              { userId: account.userId },
            );
            if (!handedOver) {
              throw new APIError("FORBIDDEN", { code: "ACCOUNT_NOT_LINKED" });
            }
          },
        },
      },
      session: {
        // Activity extends a session up to 7 days after its login, which
        // bounds a stolen session (ADR 0031).
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
            // The hourly refresh reads a Keycloak role again (ADR 0036), in
            // the background so that Keycloak never slows a page down.
            if (keycloakConfig && "scheduler" in ctx) {
              await ctx.scheduler.runAfter(0, internal.keycloakRoles.refresh, {
                userId: current.session.userId,
              });
            }
            // The Convex adapter hands dates back as numbers.
            const cap =
              new Date(current.session.createdAt).getTime() + SESSION_MAX_MS;
            if (session.expiresAt.getTime() <= cap) return;
            return { data: { ...session, expiresAt: new Date(cap) } };
          },
        },
        create: {
          before: async (session, context) => {
            const viaKeycloak = context?.path.startsWith("/oauth2/callback/");
            // A password sign-in already checking its hash at the handover
            // would otherwise open a session after they were all closed. A
            // Keycloak sign-in is the one the account waits for: the account
            // hook let it link.
            const state = await signInState(session.userId);
            const awaiting = state.awaitingKeycloak;
            // A password session needs the password to still exist: one
            // checked before the handover deleted it opens nothing after.
            const viaPassword = context?.path.startsWith("/sign-in/") === true;
            if (
              (awaiting && !viaKeycloak) ||
              (viaPassword && !state.hasPassword)
            ) {
              throw new APIError("FORBIDDEN", { code: "AWAITING_KEYCLOAK" });
            }
            // The Keycloak sign-in the account waited for: what slipped in
            // during the wait goes before its own session is written.
            if (awaiting) {
              await requireActionCtx(ctx).runMutation(
                internal.keycloakHandovers.end,
                { userId: session.userId },
              );
            }
            if (keycloakConfig && viaKeycloak) {
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
                ...keycloak({
                  ...keycloakConfig,
                  pkce: true,
                  // An ordinary refresh token dies with Keycloak's session,
                  // 30 minutes idle by default; the offline one lives as
                  // long as Netplan reads the role with it (ADR 0036).
                  scopes: ["openid", "profile", "email", "offline_access"],
                }),
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
