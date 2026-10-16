import { v } from "convex/values";

/**
 * Where the network saw a device, with the names as they were then (ADR
 * 0027), so that renaming or deleting a socket later does not rewrite it.
 */
export const historyPlace = v.object({
  switchId: v.string(),
  switchName: v.string(),
  portId: v.string(),
  portName: v.string(),
  socketId: v.optional(v.string()),
  socketName: v.optional(v.string()),
  floorId: v.optional(v.string()),
  floorName: v.optional(v.string()),
  buildingName: v.optional(v.string()),
});

export const deviceEventKind = v.union(
  v.literal("located"),
  v.literal("online"),
  v.literal("offline"),
);

/** A history event as queries return it. */
export const publicDeviceEvent = v.object({
  siteId: v.string(),
  deviceId: v.string(),
  deviceName: v.string(),
  at: v.number(),
  kind: deviceEventKind,
  place: v.optional(historyPlace),
  lastSeenAt: v.optional(v.number()),
});

/** A MAC address a cycle saw on an edge port. */
export const macSighting = v.object({
  mac: v.string(),
  portId: v.string(),
  switchId: v.string(),
  socketId: v.optional(v.string()),
});

/** One of a site's five daily snapshots, as queries return it. */
export const publicSnapshotSlot = v.object({
  day: v.string(),
  time: v.string(),
  at: v.number(),
  /** When the cycle that took the slot read the network. */
  takenAt: v.number(),
  /** MAC addresses it holds; absent while it is being written. */
  entries: v.optional(v.number()),
});

/** Where a MAC address was at a snapshot. */
export const publicSnapshotEntry = v.object({
  slotAt: v.number(),
  mac: v.string(),
  deviceId: v.optional(v.string()),
  deviceName: v.optional(v.string()),
  place: historyPlace,
});
