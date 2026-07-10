import { v } from "convex/values";

export const deviceType = v.union(
  v.literal("rack"),
  v.literal("switch"),
  v.literal("pc"),
  v.literal("wall-port"),
);

export const deviceStatus = v.union(
  v.literal("up"),
  v.literal("down"),
  v.literal("unknown"),
);

export const wallColor = v.union(
  v.literal("sand"),
  v.literal("concrete"),
  v.literal("slate"),
);

export const position = v.object({ x: v.number(), y: v.number() });
export const size = v.object({ width: v.number(), height: v.number() });

export const portInfo = v.object({
  id: v.string(),
  number: v.number(),
  status: deviceStatus,
});

export const deviceMetadata = v.object({
  ip: v.optional(v.string()),
  status: v.optional(deviceStatus),
  model: v.optional(v.string()),
  ports: v.optional(v.array(portInfo)),
  lastUser: v.optional(v.string()),
});

export const operationMeta = v.object({
  opId: v.string(),
  clientId: v.string(),
  clientSeq: v.number(),
  createdAt: v.number(),
});

export const device = v.object({
  id: v.string(),
  floorId: v.string(),
  type: deviceType,
  name: v.string(),
  hostname: v.optional(v.string()),
  position,
  size,
  metadata: deviceMetadata,
});

export const devicePatch = v.object({
  name: v.optional(v.string()),
  hostname: v.optional(v.string()),
  position: v.optional(position),
  size: v.optional(size),
  metadata: v.optional(deviceMetadata),
});

export const wallSegment = v.object({
  id: v.string(),
  floorId: v.string(),
  start: position,
  end: position,
  color: wallColor,
  geometryKey: v.string(),
});

export const link = v.object({
  id: v.string(),
  floorId: v.string(),
  fromDeviceId: v.string(),
  fromPort: v.optional(v.string()),
  toDeviceId: v.string(),
  toPort: v.optional(v.string()),
  label: v.optional(v.string()),
});

export const mapOperation = v.union(
  v.object({ kind: v.literal("device.create"), meta: operationMeta, device }),
  v.object({
    kind: v.literal("device.patch"),
    meta: operationMeta,
    deviceId: v.string(),
    patch: devicePatch,
  }),
  v.object({
    kind: v.literal("device.delete"),
    meta: operationMeta,
    deviceId: v.string(),
  }),
  v.object({ kind: v.literal("link.create"), meta: operationMeta, link }),
  v.object({
    kind: v.literal("link.delete"),
    meta: operationMeta,
    linkId: v.string(),
  }),
  v.object({
    kind: v.literal("walls.add"),
    meta: operationMeta,
    walls: v.array(wallSegment),
  }),
  v.object({
    kind: v.literal("walls.delete"),
    meta: operationMeta,
    wallIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("batch"),
    meta: operationMeta,
    operations: v.array(
      v.union(
        v.object({
          kind: v.literal("device.create"),
          device,
        }),
        v.object({
          kind: v.literal("device.patch"),
          deviceId: v.string(),
          patch: devicePatch,
        }),
        v.object({
          kind: v.literal("device.delete"),
          deviceId: v.string(),
        }),
        v.object({ kind: v.literal("link.create"), link }),
        v.object({
          kind: v.literal("link.delete"),
          linkId: v.string(),
        }),
        v.object({
          kind: v.literal("walls.add"),
          walls: v.array(wallSegment),
        }),
        v.object({
          kind: v.literal("walls.delete"),
          wallIds: v.array(v.string()),
        }),
      ),
    ),
  }),
);

export const mapOperationResult = v.object({
  status: v.union(v.literal("applied"), v.literal("rejected")),
  opId: v.string(),
  appliedRevision: v.optional(v.number()),
  floorId: v.optional(v.string()),
  error: v.optional(v.string()),
});
