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

/** The switches whose read still vouches for what rests on it. */
export const freshSwitchesOf = async (ctx: QueryCtx, siteId: string) => {
  const cycle = await cycleOf(ctx, siteId);
  const site = await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
    .unique();
  if (!cycle?.switchReads || !site) return new Set<string>();
  return freshSwitches(cycle.switchReads, Date.now(), staleAfterOf(site));
};

/**
 * The metadata a device enters the inventory with, when it is created or an
 * undo brings it back. Only a read sets a status (ADR 0025), and the cron
 * never revisits a read it expired, so a status the device brings along is
 * dropped: it gets the one a fresh read gives it now, if any.
 */
export const observedMetadata = async (
  ctx: QueryCtx,
  device: Pick<Doc<"devices">, "siteId" | "objectId" | "type" | "macs">,
  metadata: Doc<"devices">["metadata"],
): Promise<Doc<"devices">["metadata"]> => {
  const { status: claimed, ...rest } = metadata;
  const fresh = await freshSwitchesOf(ctx, device.siteId);
  let status: Status;
  if (PRESENT_TYPES.has(device.type)) {
    const seen = new Map<string, Seen>();
    for (const mac of device.macs) {
      const row = await ctx.db
        .query("macSightings")
        .withIndex("by_site_mac", (q) =>
          q.eq("siteId", device.siteId).eq("mac", mac),
        )
        .unique();
      if (row) seen.set(mac, row);
    }
    status = statusFrom(device.macs, (mac) => seen.get(mac), fresh);
  } else if (device.type === "switch" && fresh.has(device.objectId)) {
    // What LibreNMS said of it in that read, which the switch carried.
    status = claimed === "up" || claimed === "down" ? claimed : undefined;
  }
  return status === undefined ? rest : { ...rest, status };
};

/**
 * A port entering the inventory, as an undo brings back a switch: what a read
 * observed on it stays only while that read still vouches for it.
 */
export const observedPort = async <
  Row extends Pick<Doc<"ports">, "siteId" | "deviceId" | "status" | "seen">,
>(
  ctx: QueryCtx,
  port: Row,
): Promise<Row> => {
  if (port.status === undefined && port.seen === undefined) return port;
  const fresh = await freshSwitchesOf(ctx, port.siteId);
  if (fresh.has(port.deviceId)) return port;
  return { ...port, status: undefined, seen: undefined };
};
