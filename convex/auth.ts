import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import type { BetterAuthOptions } from "better-auth/minimal";
import { admin } from "better-auth/plugins/admin";
import { username } from "better-auth/plugins/username";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { authRoles } from "./lib/authRoles";

const SESSION_SECONDS = 24 * 60 * 60;

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  { local: { schema: authSchema } },
);

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
    emailAndPassword: { enabled: true, disableSignUp: true },
    plugins: [
      username(),
      admin({ roles: authRoles, defaultRole: "reader", adminRoles: ["admin"] }),
      convex({ authConfig }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));
