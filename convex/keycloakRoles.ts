import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  keycloakRoleNames,
  readKeycloakConfig,
  refreshKeycloakTokens,
  roleFromKeycloak,
} from "./lib/keycloak";
import { endSessions } from "./lib/sessions";

// Two tabs refreshing one session, or two sessions refreshing together, would
// spend the same refresh token twice; a realm that rotates them would then
// refuse the second and end the user's sessions.
const RECENTLY_REFRESHED_MS = 5 * 60 * 1000;

/**
 * Reads a Keycloak account's role again with its stored refresh token, when
 * better-auth extends one of its sessions, which use does at most once an
 * hour (ADR 0036). A login Keycloak no longer vouches for ends every session
 * of the user; an outage changes nothing and the next refresh tries again.
 */
export const refresh = internalAction({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const config = readKeycloakConfig(process.env);
    if (!config) return null;
    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "userId", value: userId },
        { field: "providerId", value: "keycloak" },
      ],
    })) as {
      _id: string;
      refreshToken?: string | null;
      updatedAt: number;
    } | null;
    if (!account?.refreshToken) return null;
    const now = Date.now();
    if (now - account.updatedAt < RECENTLY_REFRESHED_MS) return null;

    const result = await refreshKeycloakTokens(config, account.refreshToken);
    if (result.kind === "unavailable") return null;
    if (result.kind === "revoked") {
      await endSessions(ctx, userId);
      return null;
    }
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "account",
        where: [{ field: "_id", value: account._id }],
        update: {
          accessToken: result.accessToken,
          idToken: result.idToken,
          accessTokenExpiresAt: result.accessTokenExpiresAt,
          // Keycloak may keep the same refresh token and not send it again.
          ...(result.refreshToken
            ? {
                refreshToken: result.refreshToken,
                refreshTokenExpiresAt: result.refreshTokenExpiresAt,
              }
            : {}),
          updatedAt: now,
        },
      },
    });
    const mapping = await ctx.runQuery(
      internal.authSettings.keycloakRoleMapping,
      {},
    );
    const role = roleFromKeycloak(
      keycloakRoleNames(result, config.clientId, mapping),
      mapping,
    );
    const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: userId }],
    })) as { role?: string } | null;
    // Every open page of the user follows the role row, so it is only
    // written when it changes.
    if (user && user.role !== role) {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "_id", value: userId }],
          update: { role, updatedAt: now },
        },
      });
    }
    return null;
  },
});
