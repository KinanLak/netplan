// What a device's status rests on: the last read of a switch (ADR 0025).
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { cycleOf, LEASE_MS } from "./cycles";
import {
  freshSwitches,
  isOnline,
  readStaleAfterMs,
} from "../../src/sites/librenmsCycle";

type Seen = { misses: number; switchId: string; seenAt: number };

/**
 * What the network says of a device: online or offline while a fresh read
 * vouches for it; once none does, when it was last seen (ADR 0032). None
 * when it was never seen.
 */
export type Observation =
  | { status: "up" | "down" }
  | { status: "stale"; lastSeenAt: number }
  | undefined;

/** Devices whose status comes from where their MAC addresses are seen. */
export const PRESENT_TYPES: ReadonlySet<Doc<"devices">["type"]> = new Set([
  "pc",
  "endpoint",
]);

export const staleAfterOf = (site: Pick<Doc<"sites">, "cadence">) =>
  readStaleAfterMs(site.cadence, LEASE_MS);

/**
 * A present device's status from the MACs it was last seen with on a switch
 * whose read still vouches for it; when no read does, when it was last seen;
 * none when it never was.
 */
export const statusFrom = (
  macs: ReadonlyArray<string>,
  seenOn: (mac: string) => Seen | undefined,
  fresh: ReadonlySet<string>,
): Observation => {
  const seen = macs.flatMap((mac) => {
    const one = seenOn(mac);
    return one ? [one] : [];
  });
  const missed = seen
    .filter((one) => fresh.has(one.switchId))
    .map((one) => one.misses);
  if (missed.length > 0) return { status: isOnline(missed) ? "up" : "down" };
  if (seen.length === 0) return undefined;
  return {
    status: "stale",
    lastSeenAt: Math.max(...seen.map((one) => one.seenAt)),
  };
};

/** The metadata `observation` leaves a device with. */
export const withObservation = (
  metadata: Doc<"devices">["metadata"],
  observation: Observation,
): Doc<"devices">["metadata"] => {
  const { status: _status, lastSeenAt: _lastSeenAt, ...rest } = metadata;
  if (!observation) return rest;
  return observation.status === "stale"
    ? { ...rest, status: "stale", lastSeenAt: observation.lastSeenAt }
    : { ...rest, status: observation.status };
};

/** Whether a device already carries `observation`. */
export const carries = (
  metadata: Doc<"devices">["metadata"],
  observation: Observation,
): boolean =>
  metadata.status === observation?.status &&
  metadata.lastSeenAt ===
    (observation?.status === "stale" ? observation.lastSeenAt : undefined);

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
  const claimed = metadata.status;
  const fresh = await freshSwitchesOf(ctx, device.siteId);
  let observation: Observation;
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
    observation = statusFrom(device.macs, (mac) => seen.get(mac), fresh);
  } else if (device.type === "switch" && fresh.has(device.objectId)) {
    // What LibreNMS said of it in that read, which the switch carried.
    observation =
      claimed === "up" || claimed === "down" ? { status: claimed } : undefined;
  }
  return withObservation(metadata, observation);
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
