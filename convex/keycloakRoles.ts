import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { readKeycloakConfig, refreshKeycloakTokens } from "./lib/keycloak";
import { setRoleFromTokens } from "./lib/keycloakRole";
import { endSessions } from "./lib/sessions";

// Two tabs refreshing one session, or two sessions refreshing together, must
// not spend the same refresh token twice: a realm that rotates them would
// refuse the second and end the user's sessions.
const RECENTLY_REFRESHED_MS = 5 * 60 * 1000;

type KeycloakAccount = {
  _id: string;
  refreshToken?: string | null;
  scope?: string | null;
  updatedAt: number;
};

/**
 * Takes the stored refresh token for one refresh, unless another took it in
 * the last five minutes. A mutation, so two claims at once cannot both win.
 */
export const claim = internalMutation({
  args: { userId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      accountId: v.string(),
      refreshToken: v.string(),
      offline: v.boolean(),
    }),
  ),
  handler: async (ctx, { userId }) => {
    const account = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "userId", value: userId },
        { field: "providerId", value: "keycloak" },
      ],
    })) as KeycloakAccount | null;
    const now = Date.now();
    if (!account?.refreshToken) return null;
    if (now - account.updatedAt < RECENTLY_REFRESHED_MS) return null;
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "account",
        where: [{ field: "_id", value: account._id }],
        update: { updatedAt: now },
      },
    });
    return {
      accountId: account._id,
      refreshToken: account.refreshToken,
      // better-auth stores the granted scopes joined by commas.
      offline: (account.scope ?? "").split(/[\s,]+/).includes("offline_access"),
    };
  },
});

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
    const claimed = await ctx.runMutation(internal.keycloakRoles.claim, {
      userId,
    });
    if (!claimed) return null;

    const result = await refreshKeycloakTokens(config, claimed.refreshToken);
    if (result.kind === "unavailable") return null;
    if (result.kind === "revoked") {
      // An ordinary refresh token, from a client without the offline scope,
      // dies with Keycloak's idle session: that says nothing about the user.
      if (claimed.offline) await endSessions(ctx, userId);
      return null;
    }
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "account",
        where: [{ field: "_id", value: claimed.accountId }],
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
          updatedAt: Date.now(),
        },
      },
    });
    await setRoleFromTokens(ctx, config.clientId, userId, result);
    return null;
  },
});
