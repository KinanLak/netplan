// Every site's collection at a glance, for the admin (ADR 0026).
import { v } from "convex/values";
import { freshnessOf, siteFreshness } from "./collection";
import { cycleOf } from "./lib/cycles";
import { adminQuery } from "./lib/functions";
import type { QueryCtx } from "./_generated/server";
import { cycleRun, pushRun } from "./siteValidators";

/** Failing devices the page lists; past that it says how many more. */
const FAILING_SHOWN = 20;

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const failingPushes = async (ctx: QueryCtx, siteId: string) => {
  const rows = await ctx.db
    .query("netboxPushes")
    .withIndex("by_site_retry", (q) => q.eq("siteId", siteId).gt("retryAt", 0))
    .take(FAILING_SHOWN + 1);
  const failing = [];
  for (const row of rows.slice(0, FAILING_SHOWN)) {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", row.deviceId))
      .unique();
    // A device removed since: nothing will push to it again.
    if (!device?.source || device.source.integration !== "netbox") continue;
    failing.push({
      deviceId: row.deviceId,
      deviceName: device.name,
      message: row.message ?? "",
      failures: row.failures,
      failingSince: row.failingSince ?? row.retryAt ?? 0,
      retryAt: row.retryAt ?? 0,
    });
  }
  failing.sort((a, b) => a.failingSince - b.failingSince);
  return { failing, more: rows.length > FAILING_SHOWN };
};

export const overview = adminQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      freshness: siteFreshness,
      /** The last cycle that ended, with each source's and switch's result. */
      last: v.union(v.null(), cycleRun),
      /** `null` without an enabled NetBox; `importedAt` before the first import. */
      netbox: v.union(
        v.null(),
        v.object({
          importedAt: v.union(v.null(), v.number()),
          /** `null` while the push to NetBox is off (ADR 0027). */
          push: v.union(
            v.null(),
            v.object({
              last: v.union(v.null(), pushRun),
              /** Devices NetBox refuses, the longest failing first. */
              failing: v.array(
                v.object({
                  deviceId: v.string(),
                  deviceName: v.string(),
                  message: v.string(),
                  failures: v.number(),
                  failingSince: v.number(),
                  retryAt: v.number(),
                }),
              ),
              /** Whether more devices fail than `failing` lists. */
              more: v.boolean(),
            }),
          ),
        }),
      ),
      switches: v.object({
        up: v.number(),
        down: v.number(),
        unknown: v.number(),
      }),
    }),
  ),
  handler: async (ctx) => {
    const sites = (await ctx.db.query("sites").collect()).sort((a, b) =>
      byName.compare(a.name, b.name),
    );
    return await Promise.all(
      sites.map(async (site) => {
        const siteId = site.objectId;
        const [cycle, netbox, devices] = await Promise.all([
          cycleOf(ctx, siteId),
          ctx.db
            .query("integrations")
            .withIndex("by_site_kind", (q) =>
              q.eq("siteId", siteId).eq("kind", "netbox"),
            )
            .unique(),
          ctx.db
            .query("devices")
            .withIndex("by_site", (q) => q.eq("siteId", siteId))
            .collect(),
        ]);
        const switches = { up: 0, down: 0, unknown: 0 };
        for (const device of devices) {
          if (device.type !== "switch") continue;
          switches[device.metadata.status ?? "unknown"] += 1;
        }
        return {
          id: siteId,
          name: site.name,
          freshness: await freshnessOf(ctx, site, cycle),
          last: cycle?.last ?? null,
          netbox: netbox?.enabled
            ? {
                importedAt: cycle?.netboxImportedAt ?? null,
                push: netbox.netbox?.push
                  ? {
                      last: cycle?.lastPush ?? null,
                      ...(await failingPushes(ctx, siteId)),
                    }
                  : null,
              }
            : null,
          switches,
        };
      }),
    );
  },
});
