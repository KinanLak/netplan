// Every site's collection at a glance, for the admin (ADR 0026).
import { v } from "convex/values";
import {
  freshnessOf,
  siteFreshness,
  withoutRemovedSources,
} from "./collection";
import { cycleOf } from "./lib/cycles";
import { adminQuery } from "./lib/functions";
import type { QueryCtx } from "./_generated/server";
import { cycleRun, integrationKind, pushRun } from "./siteValidators";

/** Failing devices the page lists; past that it says how many more. */
const FAILING_SHOWN = 20;

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const failingPushes = async (ctx: QueryCtx, siteId: string) => {
  const failing = [];
  let more = false;
  const rows = ctx.db
    .query("netboxPushes")
    .withIndex("by_site_retry", (q) => q.eq("siteId", siteId).gt("retryAt", 0));
  // Rows of devices removed since are skipped, so the page counts only
  // devices still pushed to.
  for await (const row of rows) {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", row.deviceId))
      .unique();
    if (!device?.source || device.source.integration !== "netbox") continue;
    if (failing.length === FAILING_SHOWN) {
      more = true;
      break;
    }
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
  return { failing, more };
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
      /** The statuses the site's switches carry, from their last read. */
      switches: v.object({
        up: v.number(),
        down: v.number(),
        unknown: v.number(),
      }),
      /**
       * How the last LibreNMS step read the site's switches, and when the
       * oldest status still shown was read; `null` without LibreNMS.
       */
      switchReads: v.union(
        v.null(),
        v.object({
          read: v.number(),
          failed: v.number(),
          notPolled: v.number(),
          oldestReadAt: v.union(v.null(), v.number()),
        }),
      ),
      /** The integrations that ignore certificate errors (ADR 0028). */
      ignoringCertificates: v.array(integrationKind),
    }),
  ),
  handler: async (ctx) => {
    const sites = (await ctx.db.query("sites").collect()).sort((a, b) =>
      byName.compare(a.name, b.name),
    );
    return await Promise.all(
      sites.map(async (site) => {
        const siteId = site.objectId;
        const [cycle, integrations, devices] = await Promise.all([
          cycleOf(ctx, siteId),
          ctx.db
            .query("integrations")
            .withIndex("by_site_kind", (q) => q.eq("siteId", siteId))
            .collect(),
          ctx.db
            .query("devices")
            .withIndex("by_site", (q) => q.eq("siteId", siteId))
            .collect(),
        ]);
        const netbox = integrations.find((row) => row.kind === "netbox");
        const librenms = integrations.find((row) => row.kind === "librenms");
        const switches = { up: 0, down: 0, unknown: 0 };
        const switchIds: Array<string> = [];
        for (const device of devices) {
          if (device.type !== "switch") continue;
          // A switch with no news counts with those whose state is unknown.
          const status = device.metadata.status ?? "unknown";
          switches[status === "stale" ? "unknown" : status] += 1;
          switchIds.push(device.objectId);
        }
        const polled = new Set(
          (librenms?.librenms?.switches ?? [])
            .filter(({ device }) => device !== null)
            .map(({ switchId }) => switchId),
        );
        const results =
          withoutRemovedSources(cycle?.last, integrations)?.steps.find(
            (step) => step.source === "librenms",
          )?.switches ?? [];
        const reads = (cycle?.switchReads ?? []).filter(
          (entry) => !entry.expired,
        );
        return {
          id: siteId,
          name: site.name,
          freshness: await freshnessOf(ctx, site, cycle),
          last: withoutRemovedSources(cycle?.last, integrations),
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
          switchReads: librenms
            ? {
                read: results.filter((entry) => entry.ok).length,
                failed: results.filter((entry) => !entry.ok).length,
                notPolled: switchIds.filter((id) => !polled.has(id)).length,
                oldestReadAt:
                  reads.length > 0
                    ? Math.min(...reads.map((entry) => entry.readAt))
                    : null,
              }
            : null,
          ignoringCertificates: integrations
            .filter((row) => row.ignoreCertificateErrors)
            .map((row) => row.kind),
        };
      }),
    );
  },
});
