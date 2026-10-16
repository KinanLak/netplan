// Every site's collection at a glance, for the admin (ADR 0026).
import { v } from "convex/values";
import { freshnessOf, siteFreshness } from "./collection";
import { cycleOf } from "./lib/cycles";
import { adminQuery } from "./lib/functions";
import { cycleRun } from "./siteValidators";

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

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
        v.object({ importedAt: v.union(v.null(), v.number()) }),
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
            ? { importedAt: cycle?.netboxImportedAt ?? null }
            : null,
          switches,
        };
      }),
    );
  },
});
