// A site's NetBox and LibreNMS connections (ADR 0023). Tokens are encrypted
// in actions and only internal functions ever return the ciphertext; no
// function returns a token.
import { ConvexError, v } from "convex/values";
import type { ObjectType } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/functions";
import { configuredKeys, decryptSecret, encryptSecret } from "./lib/secrets";
import type { EncryptedSecret } from "./lib/secrets";
import { defaultFetch } from "./lib/httpRetry";
import { probeIntegration } from "./lib/integrationProbe";
import type {
  ConnectionCheck,
  Source,
  Transport,
} from "./lib/integrationProbe";
import { releaseLibreNMS } from "./librenmsCycle";
import { releaseNetBox } from "./netboxImport";
import { requireSite } from "./sites";
import {
  connectionCheck,
  encryptedSecret,
  integrationKind,
} from "./siteValidators";
import {
  INTEGRATION_LABELS,
  normalizeBaseUrl,
  tokenError,
} from "../src/sites/integrations";
import type { IntegrationKind } from "../src/sites/integrations";

const integrationSummary = v.object({
  kind: integrationKind,
  baseUrl: v.string(),
  enabled: v.boolean(),
  ignoreCertificateErrors: v.boolean(),
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
      ignoreCertificateErrors: row.ignoreCertificateErrors ?? false,
      lastCheck: row.lastCheck ?? null,
    }));
  },
});

/** What the admin's form shows: the connection to test, or to save. */
export const draftArgs = {
  siteId: v.string(),
  kind: integrationKind,
  baseUrl: v.string(),
  ignoreCertificateErrors: v.boolean(),
  /** Left out to use the stored token, which only goes to its own address. */
  token: v.optional(v.string()),
};

export const saveArgs = { ...draftArgs, enabled: v.boolean() };

type Draft = ObjectType<typeof draftArgs>;
type Stored = NonNullable<
  FunctionReturnType<typeof internal.integrations.credentials>
>;

/**
 * The draft's normalized address and clear token, and whether it is the
 * stored connection itself. Throws, in French, what the form must fix.
 */
const resolveDraft = async (
  ctx: ActionCtx,
  draft: Draft,
): Promise<{
  baseUrl: string;
  token: string | null;
  stored: Stored | null;
  unchanged: boolean;
}> => {
  const normalized = normalizeBaseUrl(draft.kind, draft.baseUrl);
  if ("error" in normalized) throw new ConvexError(normalized.error);
  const baseUrl = normalized.url;
  const stored = await ctx.runQuery(internal.integrations.credentials, {
    siteId: draft.siteId,
    kind: draft.kind,
  });
  if (draft.token !== undefined) {
    const refused = tokenError(draft.token);
    if (refused) throw new ConvexError(refused);
    return { baseUrl, token: draft.token.trim(), stored, unchanged: false };
  }
  if (!stored) throw new ConvexError("Saisissez le jeton.");
  if (stored.baseUrl !== baseUrl) {
    throw new ConvexError(
      "Saisissez à nouveau le jeton : il n'est envoyé qu'à l'adresse pour laquelle il a été saisi.",
    );
  }
  return {
    baseUrl,
    // Read only for a test: switching a source off needs no key.
    token: null,
    stored,
    unchanged: stored.ignoreCertificateErrors === draft.ignoreCertificateErrors,
  };
};

const probeDraft = async (
  draft: Draft,
  resolved: { baseUrl: string; token: string | null; stored: Stored | null },
  transport: Transport,
): Promise<ConnectionCheck> => {
  const token =
    resolved.token ??
    (resolved.stored
      ? await decryptStored(resolved.stored, resolved.stored.token)
      : null);
  return token
    ? await probeIntegration(
        sourceOf(
          {
            kind: draft.kind,
            baseUrl: resolved.baseUrl,
            ignoreCertificateErrors: draft.ignoreCertificateErrors,
          },
          token,
          transport,
        ),
      )
    : UNREADABLE_TOKEN;
};

/**
 * Saves what the form shows. A new address, token or certificate option is
 * tested first and saved only when the test succeeds; `null` when only the
 * collection switch changed, which needs no test. Registered in `sources.ts`.
 */
export const saveConnection = async (
  ctx: ActionCtx,
  args: ObjectType<typeof saveArgs>,
  transport: Transport,
): Promise<ConnectionCheck | null> => {
  const resolved = await resolveDraft(ctx, args);
  const { baseUrl, stored } = resolved;
  const fields = {
    siteId: args.siteId,
    kind: args.kind,
    baseUrl,
    enabled: args.enabled,
    ignoreCertificateErrors: args.ignoreCertificateErrors,
  };
  // Saved by someone else since the form read it: the test, or the lack of
  // one, said nothing about their connection.
  const expectedVersion = stored ? { expectedVersion: stored.updatedAt } : {};
  if (resolved.unchanged) {
    await ctx.runMutation(internal.integrations.store, {
      ...fields,
      ...expectedVersion,
    });
    return null;
  }
  const result = await probeDraft(args, resolved, transport);
  if (!result.ok) return result;
  const token =
    args.token === undefined
      ? undefined
      : await encryptSecret(
          (await keys()).current,
          args.token.trim(),
          boundTo(args.siteId, args.kind, baseUrl),
        );
  await ctx.runMutation(internal.integrations.store, {
    ...fields,
    token,
    lastCheck: { ...result, at: Date.now() },
    ...expectedVersion,
  });
  return result;
};

/**
 * "Tester", on what the form shows. Only a test of the stored connection
 * itself becomes its last check. Registered in `sources.ts`.
 */
export const testConnection = async (
  ctx: ActionCtx,
  draft: Draft,
  transport: Transport,
): Promise<ConnectionCheck> => {
  const resolved = await resolveDraft(ctx, draft);
  const result = await probeDraft(draft, resolved, transport);
  if (resolved.unchanged && resolved.stored) {
    await ctx.runMutation(internal.integrations.recordCheck, {
      siteId: draft.siteId,
      kind: draft.kind,
      testedVersion: resolved.stored.updatedAt,
      check: { ...result, at: Date.now() },
    });
  }
  return result;
};

const sourceOf = (
  stored: {
    kind: IntegrationKind;
    baseUrl: string;
    ignoreCertificateErrors: boolean;
  },
  token: string,
  transport: Transport,
): Source => ({
  kind: stored.kind,
  baseUrl: stored.baseUrl,
  token,
  fetch: stored.ignoreCertificateErrors ? transport.lenient : defaultFetch,
});

/**
 * The source Netplan calls, with its clear token, or a French reason it
 * cannot. Only a collection cycle needs the source enabled: an admin sets a
 * source up before turning it on.
 */
export const openConnection = async (
  ctx: ActionCtx,
  siteId: string,
  kind: IntegrationKind,
  transport: Transport,
  { enabledOnly = true }: { enabledOnly?: boolean } = {},
): Promise<Source | { error: string }> => {
  const stored = await ctx.runQuery(internal.integrations.credentials, {
    siteId,
    kind,
  });
  if (!stored) {
    return { error: `${INTEGRATION_LABELS[kind]} n'est pas configuré.` };
  }
  if (enabledOnly && !stored.enabled) {
    return { error: `${INTEGRATION_LABELS[kind]} est désactivé.` };
  }
  let token: string | null;
  try {
    token = await decryptStored(stored, stored.token);
  } catch (error) {
    if (error instanceof ConvexError) return { error: String(error.data) };
    throw error;
  }
  return token
    ? sourceOf(stored, token, transport)
    : { error: UNREADABLE_TOKEN.message };
};

export const remove = adminMutation({
  args: { siteId: v.string(), kind: integrationKind },
  returns: v.null(),
  handler: async (ctx, { siteId, kind }) => {
    const row = await find(ctx, siteId, kind);
    if (row) await ctx.db.delete(row._id);
    if (kind === "netbox") await releaseNetBox(ctx, siteId);
    if (kind === "librenms") await releaseLibreNMS(ctx, siteId);
    return null;
  },
});

export const store = internalMutation({
  args: {
    siteId: v.string(),
    kind: integrationKind,
    baseUrl: v.string(),
    enabled: v.boolean(),
    ignoreCertificateErrors: v.optional(v.boolean()),
    token: v.optional(encryptedSecret),
    /** The test that let this connection be saved. */
    lastCheck: v.optional(connectionCheck),
    /** The `updatedAt` the saved connection had when it was tested. */
    expectedVersion: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { siteId, kind, baseUrl, enabled, token, lastCheck } = args;
    const ignoreCertificateErrors = args.ignoreCertificateErrors ?? false;
    await requireSite(ctx, siteId);
    const existing = await find(ctx, siteId, kind);
    const updatedAt = Date.now();
    if (!existing) {
      if (args.expectedVersion !== undefined) {
        throw new ConvexError("Cette connexion a été retirée pendant le test.");
      }
      if (!token) throw new ConvexError("Saisissez le jeton.");
      await ctx.db.insert("integrations", {
        siteId,
        kind,
        baseUrl,
        enabled,
        ...(ignoreCertificateErrors && { ignoreCertificateErrors }),
        token,
        ...(lastCheck && { lastCheck }),
        updatedAt,
      });
      return null;
    }
    if (
      args.expectedVersion !== undefined &&
      existing.updatedAt !== args.expectedVersion
    ) {
      throw new ConvexError(
        "Cette connexion a été modifiée entre-temps : rechargez la page.",
      );
    }
    if (!token && existing.baseUrl !== baseUrl) {
      throw new ConvexError(
        "Saisissez à nouveau le jeton : il n'est envoyé qu'à l'adresse pour laquelle il a été saisi.",
      );
    }
    const changed =
      token !== undefined ||
      existing.baseUrl !== baseUrl ||
      ignoreCertificateErrors !== (existing.ignoreCertificateErrors ?? false);
    if (kind === "netbox" && existing.baseUrl !== baseUrl) {
      await releaseNetBox(ctx, siteId);
    }
    await ctx.db.patch(existing._id, {
      baseUrl,
      enabled,
      ignoreCertificateErrors: ignoreCertificateErrors || undefined,
      ...(token ? { token } : {}),
      // The last check described the old connection.
      ...(lastCheck ? { lastCheck } : changed ? { lastCheck: undefined } : {}),
      // Another NetBox has other sites and roles under the same ids, and
      // another LibreNMS other devices.
      ...(existing.baseUrl !== baseUrl
        ? { netbox: undefined, librenms: undefined }
        : {}),
      // Strictly later, even within a millisecond: a test result is recorded
      // only if no save came after the one it tested.
      updatedAt: Math.max(updatedAt, existing.updatedAt + 1),
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
      ignoreCertificateErrors: v.boolean(),
      token: encryptedSecret,
      updatedAt: v.number(),
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
          ignoreCertificateErrors: row.ignoreCertificateErrors ?? false,
          token: row.token,
          updatedAt: row.updatedAt,
        }
      : null;
  },
});

export const recordCheck = internalMutation({
  args: {
    siteId: v.string(),
    kind: integrationKind,
    /** The `updatedAt` of the connection that was tested. */
    testedVersion: v.number(),
    check: connectionCheck,
  },
  returns: v.null(),
  handler: async (ctx, { siteId, kind, testedVersion, check }) => {
    const row = await find(ctx, siteId, kind);
    // Saved again while the test ran: the result is about the old address
    // or token.
    if (!row || row.updatedAt !== testedVersion) return null;
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
    /** The ciphertext that was re-encrypted. */
    previous: encryptedSecret,
    token: encryptedSecret,
  },
  returns: v.boolean(),
  handler: async (ctx, { siteId, kind, baseUrl, previous, token }) => {
    const row = await find(ctx, siteId, kind);
    // Saved again since it was read, possibly with the same key: keep the
    // newer token. Each encryption has its own IV, so equal ciphertexts are
    // the same save.
    if (
      !row ||
      row.baseUrl !== baseUrl ||
      row.token.ciphertext !== previous.ciphertext ||
      row.token.iv !== previous.iv
    ) {
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
    /** Saved with an older key during every pass: run it again. */
    pending: v.array(v.string()),
  }),
  handler: async (ctx): Promise<ReencryptResult> => {
    const { current } = await keys();
    return await reencryptInPasses(current.id, {
      read: async (): Promise<Array<StoredToken>> =>
        await ctx.runQuery(internal.integrations.allTokens, {}),
      reencrypt: async (row): Promise<ReencryptOutcome> => {
        const plaintext = await decryptStored(row, row.token);
        if (plaintext === null) return "unreadable";
        const replaced: boolean = await ctx.runMutation(
          internal.integrations.replaceToken,
          {
            siteId: row.siteId,
            kind: row.kind,
            baseUrl: row.baseUrl,
            previous: row.token,
            token: await encryptSecret(
              current,
              plaintext,
              boundTo(row.siteId, row.kind, row.baseUrl),
            ),
          },
        );
        return replaced ? "replaced" : "saved-meanwhile";
      },
    });
  },
});

type StoredToken = {
  siteId: string;
  kind: IntegrationKind;
  baseUrl: string;
  token: EncryptedSecret;
};

type ReencryptOutcome = "replaced" | "unreadable" | "saved-meanwhile";

type ReencryptResult = {
  reencrypted: number;
  current: number;
  unreadable: Array<string>;
  pending: Array<string>;
};

const REENCRYPT_PASSES = 3;

// A save still encrypting with the previous key can land between a pass's
// read and its replacement; the replacement yields to it, and the next pass
// reads it again.
export const reencryptInPasses = async (
  currentKeyId: string,
  io: {
    read: () => Promise<Array<StoredToken>>;
    reencrypt: (row: StoredToken) => Promise<ReencryptOutcome>;
  },
): Promise<ReencryptResult> => {
  let reencrypted = 0;
  let alreadyCurrent: number | null = null;
  for (let pass = 1; ; pass += 1) {
    const rows = await io.read();
    const stale = rows.filter((row) => row.token.keyId !== currentKeyId);
    alreadyCurrent ??= rows.length - stale.length;
    const unreadable: Array<string> = [];
    const pending: Array<string> = [];
    for (const row of stale) {
      const outcome = await io.reencrypt(row);
      if (outcome === "replaced") reencrypted += 1;
      else
        (outcome === "unreadable" ? unreadable : pending).push(
          `${row.siteId} ${row.kind}`,
        );
    }
    if (pending.length === 0 || pass >= REENCRYPT_PASSES) {
      return { reencrypted, current: alreadyCurrent, unreadable, pending };
    }
  }
};

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
