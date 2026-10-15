// A site's NetBox and LibreNMS connections (ADR 0023). Tokens are encrypted
// in actions and only internal functions ever return the ciphertext; no
// function returns a token.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { adminAction, adminMutation, adminQuery } from "./lib/functions";
import { configuredKeys, decryptSecret, encryptSecret } from "./lib/secrets";
import type { EncryptedSecret } from "./lib/secrets";
import { probeIntegration } from "./lib/integrationProbe";
import type { ConnectionCheck } from "./lib/integrationProbe";
import { requireSite } from "./sites";
import {
  connectionCheck,
  connectionResult,
  encryptedSecret,
  integrationKind,
} from "./siteValidators";
import { normalizeBaseUrl, tokenError } from "../src/sites/integrations";
import type { IntegrationKind } from "../src/sites/integrations";

const integrationSummary = v.object({
  kind: integrationKind,
  baseUrl: v.string(),
  enabled: v.boolean(),
  lastCheck: v.union(v.null(), connectionCheck),
});

// The ciphertext decrypts only for the site, tool and address it was
// entered for, so it is never sent anywhere else.
const boundTo = (siteId: string, kind: IntegrationKind, baseUrl: string) =>
  `netplan:integration:${siteId}:${kind}:${baseUrl}`;

const find = async (ctx: QueryCtx, siteId: string, kind: IntegrationKind) =>
  await ctx.db
    .query("integrations")
    .withIndex("by_site_kind", (q) => q.eq("siteId", siteId).eq("kind", kind))
    .unique();

const keys = async () => {
  try {
    return await configuredKeys();
  } catch {
    throw new ConvexError(
      "Le serveur n'a pas de clé de chiffrement valide (NETPLAN_SECRET_KEY) : voir la documentation d'exploitation.",
    );
  }
};

const decryptStored = async (
  stored: { siteId: string; kind: IntegrationKind; baseUrl: string },
  token: EncryptedSecret,
): Promise<string | null> => {
  try {
    return await decryptSecret(
      (await keys()).all,
      token,
      boundTo(stored.siteId, stored.kind, stored.baseUrl),
    );
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    return null;
  }
};

const UNREADABLE_TOKEN: ConnectionCheck = {
  ok: false,
  message:
    "Le jeton enregistré ne peut plus être déchiffré : saisissez-le à nouveau.",
};

export const listForSite = adminQuery({
  args: { siteId: v.string() },
  returns: v.array(integrationSummary),
  handler: async (ctx, { siteId }) => {
    const rows = await ctx.db
      .query("integrations")
      .withIndex("by_site_kind", (q) => q.eq("siteId", siteId))
      .collect();
    return rows.map((row) => ({
      kind: row.kind,
      baseUrl: row.baseUrl,
      enabled: row.enabled,
      lastCheck: row.lastCheck ?? null,
    }));
  },
});

/**
 * Saves a connection, then tests it. The token may be left out to keep the
 * stored one, unless the address changes.
 */
export const save = adminAction({
  args: {
    siteId: v.string(),
    kind: integrationKind,
    baseUrl: v.string(),
    enabled: v.boolean(),
    token: v.optional(v.string()),
  },
  returns: connectionResult,
  handler: async (ctx, args): Promise<ConnectionCheck> => {
    const normalized = normalizeBaseUrl(args.kind, args.baseUrl);
    if ("error" in normalized) throw new ConvexError(normalized.error);
    const baseUrl = normalized.url;
    let token: EncryptedSecret | undefined;
    if (args.token !== undefined) {
      const refused = tokenError(args.token);
      if (refused) throw new ConvexError(refused);
      token = await encryptSecret(
        (await keys()).current,
        args.token.trim(),
        boundTo(args.siteId, args.kind, baseUrl),
      );
    }
    await ctx.runMutation(internal.integrations.store, {
      siteId: args.siteId,
      kind: args.kind,
      baseUrl,
      enabled: args.enabled,
      token,
    });
    return await runCheck(ctx, args.siteId, args.kind);
  },
});

export const testConnection = adminAction({
  args: { siteId: v.string(), kind: integrationKind },
  returns: connectionResult,
  handler: async (ctx, { siteId, kind }): Promise<ConnectionCheck> =>
    await runCheck(ctx, siteId, kind),
});

const runCheck = async (
  ctx: ActionCtx,
  siteId: string,
  kind: IntegrationKind,
): Promise<ConnectionCheck> => {
  const stored = await ctx.runQuery(internal.integrations.credentials, {
    siteId,
    kind,
  });
  if (!stored) throw new ConvexError("Cette intégration n'existe plus.");
  const token = await decryptStored(stored, stored.token);
  const result = token
    ? await probeIntegration(kind, stored.baseUrl, token)
    : UNREADABLE_TOKEN;
  await ctx.runMutation(internal.integrations.recordCheck, {
    siteId,
    kind,
    baseUrl: stored.baseUrl,
    check: { ...result, at: Date.now() },
  });
  return result;
};

export const remove = adminMutation({
  args: { siteId: v.string(), kind: integrationKind },
  returns: v.null(),
  handler: async (ctx, { siteId, kind }) => {
    const row = await find(ctx, siteId, kind);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const store = internalMutation({
  args: {
    siteId: v.string(),
    kind: integrationKind,
    baseUrl: v.string(),
    enabled: v.boolean(),
    token: v.optional(encryptedSecret),
  },
  returns: v.null(),
  handler: async (ctx, { siteId, kind, baseUrl, enabled, token }) => {
    await requireSite(ctx, siteId);
    const existing = await find(ctx, siteId, kind);
    const updatedAt = Date.now();
    if (!existing) {
      if (!token) throw new ConvexError("Saisissez le jeton.");
      await ctx.db.insert("integrations", {
        siteId,
        kind,
        baseUrl,
        enabled,
        token,
        updatedAt,
      });
      return null;
    }
    if (!token && existing.baseUrl !== baseUrl) {
      throw new ConvexError(
        "Saisissez à nouveau le jeton : il n'est envoyé qu'à l'adresse pour laquelle il a été saisi.",
      );
    }
    const changed = token !== undefined || existing.baseUrl !== baseUrl;
    await ctx.db.patch(existing._id, {
      baseUrl,
      enabled,
      ...(token ? { token } : {}),
      // The last check described the old connection.
      ...(changed ? { lastCheck: undefined } : {}),
      updatedAt,
    });
    return null;
  },
});

/** The connection with its encrypted token, for actions only. */
export const credentials = internalQuery({
  args: { siteId: v.string(), kind: integrationKind },
  returns: v.union(
    v.null(),
    v.object({
      siteId: v.string(),
      kind: integrationKind,
      baseUrl: v.string(),
      enabled: v.boolean(),
      token: encryptedSecret,
    }),
  ),
  handler: async (ctx, { siteId, kind }) => {
    const row = await find(ctx, siteId, kind);
    return row
      ? {
          siteId,
          kind,
          baseUrl: row.baseUrl,
          enabled: row.enabled,
          token: row.token,
        }
      : null;
  },
});

export const recordCheck = internalMutation({
  args: {
    siteId: v.string(),
    kind: integrationKind,
    baseUrl: v.string(),
    check: connectionCheck,
  },
  returns: v.null(),
  handler: async (ctx, { siteId, kind, baseUrl, check }) => {
    const row = await find(ctx, siteId, kind);
    // Saved again while the test ran: the result is about the old address.
    if (!row || row.baseUrl !== baseUrl) return null;
    await ctx.db.patch(row._id, { lastCheck: check });
    return null;
  },
});

export const allTokens = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      siteId: v.string(),
      kind: integrationKind,
      baseUrl: v.string(),
      token: encryptedSecret,
    }),
  ),
  handler: async (ctx) =>
    (await ctx.db.query("integrations").collect()).map((row) => ({
      siteId: row.siteId,
      kind: row.kind,
      baseUrl: row.baseUrl,
      token: row.token,
    })),
});

export const replaceToken = internalMutation({
  args: {
    siteId: v.string(),
    kind: integrationKind,
    baseUrl: v.string(),
    previousKeyId: v.string(),
    token: encryptedSecret,
  },
  returns: v.boolean(),
  handler: async (ctx, { siteId, kind, baseUrl, previousKeyId, token }) => {
    const row = await find(ctx, siteId, kind);
    // Saved again since it was read: the new token is already current.
    if (!row || row.baseUrl !== baseUrl || row.token.keyId !== previousKeyId) {
      return false;
    }
    await ctx.db.patch(row._id, { token });
    return true;
  },
});

/**
 * After a key rotation, re-encrypts every token with the current key, so the
 * previous one can be dropped. Run with `convex run
 * integrations:reencryptTokens` (docs/operations/configuration.md).
 */
export const reencryptTokens = internalAction({
  args: {},
  returns: v.object({
    reencrypted: v.number(),
    current: v.number(),
    unreadable: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const { current } = await keys();
    const rows = await ctx.runQuery(internal.integrations.allTokens, {});
    let reencrypted = 0;
    let alreadyCurrent = 0;
    const unreadable: Array<string> = [];
    for (const row of rows) {
      if (row.token.keyId === current.id) {
        alreadyCurrent += 1;
        continue;
      }
      const plaintext = await decryptStored(row, row.token);
      if (plaintext === null) {
        unreadable.push(`${row.siteId} ${row.kind}`);
        continue;
      }
      const replaced = await ctx.runMutation(
        internal.integrations.replaceToken,
        {
          siteId: row.siteId,
          kind: row.kind,
          baseUrl: row.baseUrl,
          previousKeyId: row.token.keyId,
          token: await encryptSecret(
            current,
            plaintext,
            boundTo(row.siteId, row.kind, row.baseUrl),
          ),
        },
      );
      if (replaced) reencrypted += 1;
    }
    return { reencrypted, current: alreadyCurrent, unreadable };
  },
});

/** Stores a connection for the dev seed, which runs with the admin key. */
export const seedConnection = async (
  ctx: ActionCtx,
  input: {
    siteId: string;
    kind: IntegrationKind;
    baseUrl: string;
    token: string;
  },
): Promise<void> => {
  const normalized = normalizeBaseUrl(input.kind, input.baseUrl);
  if ("error" in normalized) throw new ConvexError(normalized.error);
  await ctx.runMutation(internal.integrations.store, {
    siteId: input.siteId,
    kind: input.kind,
    baseUrl: normalized.url,
    enabled: true,
    token: await encryptSecret(
      (await keys()).current,
      input.token.trim(),
      boundTo(input.siteId, input.kind, normalized.url),
    ),
  });
};
