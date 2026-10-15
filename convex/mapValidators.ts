import { v } from "convex/values";
import { integrationKind } from "./siteValidators";

export const deviceType = v.union(
  v.literal("rack"),
  v.literal("switch"),
  v.literal("patch-panel"),
  v.literal("pc"),
  v.literal("endpoint"),
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
  status: v.optional(deviceStatus),
  ports: v.optional(v.array(portInfo)),
  lastUser: v.optional(v.string()),
});

/** `DeviceSource` from `src/types/map.ts`. */
export const deviceSource = v.object({
  integration: integrationKind,
  externalId: v.string(),
  url: v.optional(v.string()),
  syncedAt: v.number(),
});

/** A device's identity in the site inventory (ADR 0022). */
export const deviceIdentityFields = {
  type: deviceType,
  name: v.string(),
  hostname: v.optional(v.string()),
  serial: v.optional(v.string()),
  macs: v.array(v.string()),
  model: v.optional(v.string()),
  ip: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const devicePlacement = v.object({
  floorId: v.string(),
  position,
  size,
});

export const operationMeta = v.object({
  opId: v.string(),
  clientId: v.string(),
  clientSeq: v.number(),
  createdAt: v.number(),
});

/** `NewDevice`: what `device.create` carries; a source arrives only by sync. */
export const device = v.object({
  id: v.string(),
  floorId: v.string(),
  ...deviceIdentityFields,
  position,
  size,
  metadata: deviceMetadata,
});

/** `Device`: a placed device as the map reads it. */
export const placedDevice = v.object({
  ...device.fields,
  source: v.optional(deviceSource),
});

export const devicePatch = v.object({
  position: v.optional(position),
  size: v.optional(size),
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

export const floorOverlay = v.object({
  floorId: v.string(),
  fileId: v.string(),
  imageWidth: v.number(),
  imageHeight: v.number(),
  center: position,
  scale: v.number(),
  rotation: v.number(),
  opacity: v.number(),
  locked: v.boolean(),
});

export const overlayPatch = v.object({
  center: v.optional(position),
  scale: v.optional(v.number()),
  rotation: v.optional(v.number()),
  opacity: v.optional(v.number()),
  locked: v.optional(v.boolean()),
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
  v.object({
    kind: v.literal("device.place"),
    meta: operationMeta,
    device: placedDevice,
  }),
  v.object({
    kind: v.literal("device.unplace"),
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
    kind: v.literal("overlay.set"),
    meta: operationMeta,
    floorId: v.string(),
    overlay: v.union(floorOverlay, v.null()),
  }),
  v.object({
    kind: v.literal("overlay.patch"),
    meta: operationMeta,
    floorId: v.string(),
    patch: overlayPatch,
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
        v.object({
          kind: v.literal("device.place"),
          device: placedDevice,
        }),
        v.object({
          kind: v.literal("device.unplace"),
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
        v.object({
          kind: v.literal("overlay.set"),
          floorId: v.string(),
          overlay: v.union(floorOverlay, v.null()),
        }),
        v.object({
          kind: v.literal("overlay.patch"),
          floorId: v.string(),
          patch: overlayPatch,
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
