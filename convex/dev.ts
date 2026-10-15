// Development data. Every function here refuses to run unless the deployment
// sets ALLOW_DEV_SEED=true, which `bun run dev:agent` and the CI end-to-end
// job do and no real installation does (ADR 0018).
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { applyMapOperation } from "./mapOperations";
import { insertSite } from "./sites";
import { seedConnection } from "./integrations";
import { createAuth } from "./auth";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev-seed/accounts";
import { DEMO_BUILDING, buildDemoFloors } from "../src/dev-seed/demoMap";
import { INTEGRATION_KINDS } from "../src/sites/integrations";

const SEED_CLIENT_ID = "dev-seed";

const DEMO_SITE = {
  objectId: "site:demo",
  name: "Site de démonstration",
  timezone: "Europe/Paris",
};

export const assertSeedable = () => {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    throw new ConvexError(
      "Seeding is disabled: ALLOW_DEV_SEED is not true on this deployment",
    );
  }
};

// An existing demo site is kept as it is, so a user's change to it does not
// make every later start fail.
const ensureSite = async (ctx: MutationCtx): Promise<string> => {
  const existing = await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", DEMO_SITE.objectId))
    .unique();
  return existing ? existing.objectId : await insertSite(ctx, DEMO_SITE);
};

const ensureBuilding = async (ctx: MutationCtx, siteId: string) => {
  const existing = await ctx.db
    .query("buildings")
    .withIndex("by_object_id", (q) => q.eq("objectId", DEMO_BUILDING.id))
    .unique();
  if (existing) return;
  await ctx.db.insert("buildings", {
    objectId: DEMO_BUILDING.id,
    siteId,
    name: DEMO_BUILDING.name,
    order: 0,
  });
};

const ensureFloor = async (
  ctx: MutationCtx,
  floor: { id: string; name: string; order: number },
) => {
  const existing = await ctx.db
    .query("floors")
    .withIndex("by_object_id", (q) => q.eq("objectId", floor.id))
    .unique();
  if (existing) return;
  await ctx.db.insert("floors", {
    objectId: floor.id,
    buildingId: DEMO_BUILDING.id,
    name: floor.name,
    order: floor.order,
  });
};

const floorIsEmpty = async (ctx: MutationCtx, floorId: string) => {
  const [device, wall] = await Promise.all([
    ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .first(),
    ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .first(),
  ]);
  return !device && !wall;
};

const lastSeedSeq = async (ctx: MutationCtx) => {
  const last = await ctx.db
    .query("clientOperations")
    .withIndex("by_client_seq", (q) => q.eq("clientId", SEED_CLIENT_ID))
    .order("desc")
    .first();
  return last?.clientSeq ?? 0;
};

/**
 * Loads the demo site, building and map, filling only what is missing: a
 * floor is drawn while it is empty, so a cleared map comes back and a user's
 * edits stay. A change to the demo data reaches an existing backend through
 * `dev:agent --reseed`. The map goes through `applyMapOperation`, so it obeys
 * the same rules as a user's edits.
 */
export const seed = internalMutation({
  args: {},
  returns: v.object({ buildingId: v.string(), floorIds: v.array(v.string()) }),
  handler: async (ctx) => {
    assertSeedable();
    const siteId = await ensureSite(ctx);
    await ensureBuilding(ctx, siteId);
    const floors = buildDemoFloors();
    // Operation ids are never reused, or a cleared floor's batch would be
    // answered from the record of the first seed and draw nothing.
    let seq = await lastSeedSeq(ctx);
    for (const floor of floors) {
      await ensureFloor(ctx, floor);
      if (!(await floorIsEmpty(ctx, floor.id))) continue;
      seq += 1;
      const result = await applyMapOperation(ctx, {
        kind: "batch",
        meta: {
          opId: `${SEED_CLIENT_ID}:${seq}`,
          clientId: SEED_CLIENT_ID,
          clientSeq: seq,
          createdAt: Date.now(),
        },
        operations: floor.operations,
      });
      if (result.status === "rejected") {
        throw new ConvexError(
          `The seed of ${floor.id} was rejected: ${result.error ?? "unknown error"}`,
        );
      }
    }
    return {
      buildingId: DEMO_BUILDING.id,
      floorIds: floors.map((floor) => floor.id),
    };
  },
});

/**
 * Creates one account per role with the shared dev password. An existing
 * account is left as it is, whatever was changed on it since.
 */
export const seedAccounts = internalAction({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    assertSeedable();
    const auth = createAuth(ctx);
    const created: Array<string> = [];
    for (const account of DEV_ACCOUNTS) {
      const existing = await ctx.runQuery(
        components.betterAuth.adapter.findOne,
        { model: "user", where: [{ field: "email", value: account.email }] },
      );
      if (existing) continue;
      await auth.api.createUser({
        body: {
          email: account.email,
          password: DEV_PASSWORD,
          name: account.name,
          role: account.role,
          data: { username: account.username },
        },
      });
      created.push(account.username);
    }
    return created;
  },
});

const seedConnectionArgs = v.optional(
  v.object({ url: v.string(), token: v.string() }),
);

/**
 * Connects the demo site to real tools, for `dev:agent --integrations`,
 * which passes what it read from its own environment. A connection the demo
 * site already has is left as it is.
 */
export const seedIntegrations = internalAction({
  args: { netbox: seedConnectionArgs, librenms: seedConnectionArgs },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    assertSeedable();
    const created: Array<string> = [];
    for (const kind of INTEGRATION_KINDS) {
      const connection = args[kind];
      if (!connection) continue;
      const existing = await ctx.runQuery(internal.integrations.credentials, {
        siteId: DEMO_SITE.objectId,
        kind,
      });
      if (existing) continue;
      await seedConnection(ctx, {
        siteId: DEMO_SITE.objectId,
        kind,
        baseUrl: connection.url,
        token: connection.token,
      });
      created.push(kind);
    }
    return created;
  },
});
