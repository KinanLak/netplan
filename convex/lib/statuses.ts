// What a device's status rests on: the last read of a switch (ADR 0025).
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { cycleOf, LEASE_MS } from "./cycles";
import {
  freshSwitches,
  isOnline,
  readStaleAfterMs,
} from "../../src/sites/librenmsCycle";

type Status = "up" | "down" | undefined;
type Seen = { misses: number; switchId: string };

/** Devices whose status comes from where their MAC addresses are seen. */
export const PRESENT_TYPES: ReadonlySet<Doc<"devices">["type"]> = new Set([
  "pc",
  "endpoint",
]);

export const staleAfterOf = (site: Pick<Doc<"sites">, "cadence">) =>
  readStaleAfterMs(site.cadence, LEASE_MS);

/**
 * A present device's status from the MACs it was last seen with on a switch
 * whose read still vouches for it; none when there is no such MAC.
 */
export const statusFrom = (
  macs: ReadonlyArray<string>,
  seenOn: (mac: string) => Seen | undefined,
  fresh: ReadonlySet<string>,
): Status => {
  const missed = macs.flatMap((mac) => {
    const seen = seenOn(mac);
    return seen && fresh.has(seen.switchId) ? [seen.misses] : [];
  });
  if (missed.length === 0) return undefined;
  return isOnline(missed) ? "up" : "down";
};

/**
 * The metadata a device enters the inventory with, when it is created or an
 * undo brings it back. A status that rests on a read is the one that read
 * gives now: the cycle skips a read it already expired, so a stale status
 * brought back would otherwise stay. A status nothing observed, as on a
 * manual or seeded device, is kept.
 */
export const observedMetadata = async (
  ctx: QueryCtx,
  device: Pick<Doc<"devices">, "siteId" | "objectId" | "type" | "macs">,
  metadata: Doc<"devices">["metadata"],
): Promise<Doc<"devices">["metadata"]> => {
  const { siteId } = device;
  const cycle = await cycleOf(ctx, siteId);
  const site = await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
    .unique();
  if (!cycle || !site) return metadata;
  const reads = cycle.switchReads ?? [];
  const fresh = freshSwitches(reads, Date.now(), staleAfterOf(site));

  let status: Status | "unknown" = metadata.status;
  if (PRESENT_TYPES.has(device.type)) {
    const seen = new Map<string, Seen>();
    for (const mac of device.macs) {
      const row = await ctx.db
        .query("macSightings")
        .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
        .unique();
      if (row) seen.set(mac, row);
    }
    if (seen.size === 0) return metadata;
    status = statusFrom(device.macs, (mac) => seen.get(mac), fresh);
  } else if (device.type === "switch") {
    if (!reads.some((read) => read.switchId === device.objectId)) {
      return metadata;
    }
    if (!fresh.has(device.objectId)) status = undefined;
  } else {
    return metadata;
  }
  const { status: _previous, ...rest } = metadata;
  return status === undefined ? rest : { ...rest, status };
};
