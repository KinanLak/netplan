import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { username } from "better-auth/plugins/username";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { authRoles } from "./lib/authRoles";
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

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
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
      customRules: { "/convex/token": false, "/get-session": false },
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
      convex({ authConfig }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
