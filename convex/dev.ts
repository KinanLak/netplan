// Development data. Every function here refuses to run unless the deployment
// sets ALLOW_DEV_SEED=true, which `bun run dev:agent` and the CI end-to-end
// job do and no real installation does (ADR 0018).
import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { applyMapOperation } from "./mapOperations";
import { insertSite } from "./sites";
import type { SiteInput } from "./sites";
import { DEMO_BUILDING, buildDemoFloors } from "../src/dev-seed/demoMap";

const SEED_CLIENT_ID = "dev-seed";

// Disabled, with no LibreNMS switch and no NetBox site behind its keys: the
// integrations never run against it.
const DEMO_SITE = {
  objectId: "site:demo",
  configKey: "demo",
  displayName: "Site de démonstration",
  timezone: "Europe/Paris",
  enabled: false,
  dayStartMinute: 7 * 60,
  dayEndMinute: 20 * 60,
  netboxInstanceKey: "netbox-demo",
  netboxExternalSiteId: "demo",
  netboxExternalSiteSlug: "demo",
  libreNmsInstanceKey: "librenms-demo",
  libreNmsDevices: [],
} satisfies SiteInput;

export const assertSeedable = () => {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    throw new ConvexError(
      "Seeding is disabled: ALLOW_DEV_SEED is not true on this deployment",
    );
  }
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

/**
 * Loads the demo site, building and map. The map goes through
 * `applyMapOperation`, so it obeys the same rules as a user's edits. Running
 * it again changes nothing: each floor's batch has a fixed operation id.
 */
export const seed = internalMutation({
  args: {},
  returns: v.object({ buildingId: v.string(), floorIds: v.array(v.string()) }),
  handler: async (ctx) => {
    assertSeedable();
    const siteId = await insertSite(ctx, DEMO_SITE);
    await ensureBuilding(ctx, siteId);
    const floors = buildDemoFloors();
    for (const [index, floor] of floors.entries()) {
      await ensureFloor(ctx, floor);
      const result = await applyMapOperation(ctx, {
        kind: "batch",
        meta: {
          opId: `${SEED_CLIENT_ID}:${floor.id}`,
          clientId: SEED_CLIENT_ID,
          clientSeq: index + 1,
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
