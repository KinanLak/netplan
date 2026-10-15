import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { createAuthEndpoint } from "better-auth/api";
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

const SESSION_SECONDS = 24 * 60 * 60;
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
    keycloakRoleNames(account, config.clientId),
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
      // ADR 0004 bounds a Keycloak role removal by the session length, so the
      // 24 hours run from login and activity does not extend them.
      disableSessionRefresh: true,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      // The limit guards credentials. These two run on every page load with a
      // valid session cookie, and counting them would write a row each time
      // and, behind an edge that does not set X-Forwarded-For, lock every
      // user out together.
      customRules: {
        "/convex/token": false,
        "/get-session": false,
        // The app server asks on behalf of every visitor of the login page.
        "/sign-in-options": false,
        // Only starts the redirect to Keycloak, which guards the password;
        // the strict sign-in rule would turn a team's morning logins away.
        "/sign-in/oauth2": { window: 10, max: 100 },
      },
    },
    account: {
      // A Keycloak login whose email a local account already uses is refused
      // (ADR 0021): linking would let the identity provider into an account
      // its admin created with a password, under that account's role.
      accountLinking: { enabled: false },
    },
    // Linking from a signed-in session does not check the setting above, and
    // generic OAuth also registers Keycloak with the social linking route.
    disabledPaths: ["/oauth2/link", "/link-social"],
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
        create: {
          before: async (session, context) => {
            if (
              keycloakConfig &&
              context?.path.startsWith("/oauth2/callback/")
            ) {
              await applyKeycloakRole(ctx, keycloakConfig, session.userId);
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
        await requireActionCtx(ctx).scheduler.runAfter(0, internal.mail.send, {
          to: user.email,
          ...resetPasswordMail({ name: user.name, url }),
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
