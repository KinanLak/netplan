import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
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

const keycloakAccount = async (ctx: MutationCtx, userId: string) =>
  (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "account",
    where: [
      { field: "userId", value: userId },
      { field: "providerId", value: "keycloak" },
    ],
  })) as KeycloakAccount | null;

/**
 * Takes the stored refresh token for one refresh, unless another took it in
 * the last five minutes. A mutation, so two claims at once cannot both win.
 */
export const claim = internalMutation({
  args: { userId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ refreshToken: v.string(), offline: v.boolean() }),
  ),
  handler: async (ctx, { userId }) => {
    const account = await keycloakAccount(ctx, userId);
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
      refreshToken: account.refreshToken,
      // better-auth stores the granted scopes joined by commas.
      offline: (account.scope ?? "").split(/[\s,]+/).includes("offline_access"),
    };
  },
});

/**
 * Applies what Keycloak answered, unless a login replaced the refresh token
 * meanwhile: that login read a newer role, which an older answer must not
 * undo, and its token is not the one Keycloak refused.
 */
export const apply = internalMutation({
  args: {
    userId: v.string(),
    clientId: v.string(),
    claimedRefreshToken: v.string(),
    outcome: v.union(
      v.object({ kind: v.literal("revoked") }),
      v.object({
        kind: v.literal("tokens"),
        accessToken: v.string(),
        refreshToken: v.union(v.string(), v.null()),
        idToken: v.union(v.string(), v.null()),
        accessTokenExpiresAt: v.union(v.number(), v.null()),
        refreshTokenExpiresAt: v.union(v.number(), v.null()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { userId, clientId, claimedRefreshToken, outcome }) => {
    const account = await keycloakAccount(ctx, userId);
    if (account?.refreshToken !== claimedRefreshToken) return null;
    if (outcome.kind === "revoked") {
      await endSessions(ctx, userId);
      return null;
    }
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "account",
        where: [{ field: "_id", value: account._id }],
        update: {
          accessToken: outcome.accessToken,
          idToken: outcome.idToken,
          accessTokenExpiresAt: outcome.accessTokenExpiresAt,
          // Keycloak may keep the same refresh token and not send it again.
          ...(outcome.refreshToken
            ? {
                refreshToken: outcome.refreshToken,
                refreshTokenExpiresAt: outcome.refreshTokenExpiresAt,
              }
            : {}),
          updatedAt: Date.now(),
        },
      },
    });
    await setRoleFromTokens(ctx, clientId, userId, outcome);
    return null;
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
    // An ordinary refresh token, from a client without the offline scope,
    // dies with Keycloak's idle session: that says nothing about the user.
    if (result.kind === "revoked" && !claimed.offline) return null;
    await ctx.runMutation(internal.keycloakRoles.apply, {
      userId,
      clientId: config.clientId,
      claimedRefreshToken: claimed.refreshToken,
      outcome: result,
    });
    return null;
  },
});
