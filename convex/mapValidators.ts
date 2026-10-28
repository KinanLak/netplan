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
  // The network once saw the device, and no read vouches for it any more.
  v.literal("stale"),
);

export const wallColor = v.union(
  v.literal("sand"),
  v.literal("concrete"),
  v.literal("slate"),
);

export const position = v.object({ x: v.number(), y: v.number() });
export const size = v.object({ width: v.number(), height: v.number() });

export const deviceMetadata = v.object({
  status: v.optional(deviceStatus),
  lastUser: v.optional(v.string()),
  /** With a `stale` status: when the network last saw the device. */
  lastSeenAt: v.optional(v.number()),
});

export const portKind = v.union(
  v.literal("interface"),
  v.literal("front"),
  v.literal("rear"),
);

/** `DeviceSource` from `src/types/map.ts`. */
export const deviceSource = v.object({
  integration: integrationKind,
  externalId: v.string(),
  url: v.optional(v.string()),
  syncedAt: v.number(),
  /** Since when NetBox no longer returns the device (ADR 0039). */
  missingSince: v.optional(v.number()),
  /** While absent: since when the purge has seen it on no floor. */
  offPlanSince: v.optional(v.number()),
  /** Its `externalId` may name another device: only identity links it. */
  staleId: v.optional(v.boolean()),
});

/** `SourceRef`: the object of an integration a port or cable comes from. */
export const sourceRef = v.object({
  integration: integrationKind,
  externalId: v.string(),
});

/** `Port` from `src/types/map.ts`, as a person may create it. */
export const newPort = v.object({
  id: v.string(),
  deviceId: v.string(),
  name: v.string(),
  kind: portKind,
  order: v.number(),
  rearPortId: v.optional(v.string()),
  status: v.optional(deviceStatus),
  seen: v.optional(v.literal(true)),
});

export const port = v.object({
  ...newPort.fields,
  source: v.optional(sourceRef),
});

export const cableEnd = v.object({ deviceId: v.string(), portId: v.string() });

/** `Cable` from `src/types/map.ts`, as a person may create it. */
export const newCable = v.object({ id: v.string(), a: cableEnd, b: cableEnd });

export const cable = v.object({
  ...newCable.fields,
  source: v.optional(sourceRef),
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

/** A member of a group move, where it stands before the move. */
const groupMember = v.object({ deviceId: v.string(), position });

export const wallSegment = v.object({
  id: v.string(),
  floorId: v.string(),
  start: position,
  end: position,
  color: wallColor,
  geometryKey: v.string(),
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

/** A free text on a floor (C4, ADR 0029). */
export const mapLabel = v.object({
  id: v.string(),
  floorId: v.string(),
  text: v.string(),
  position,
});

export const labelPatch = v.object({
  text: v.optional(v.string()),
  position: v.optional(position),
});

export const mapOperation = v.union(
  v.object({
    kind: v.literal("device.create"),
    meta: operationMeta,
    // A source only when undo brings back a device NetBox dropped (ADR 0034).
    device: placedDevice,
    ports: v.optional(v.array(newPort)),
    cables: v.optional(v.array(newCable)),
  }),
  v.object({
    kind: v.literal("device.patch"),
    meta: operationMeta,
    deviceId: v.string(),
    patch: devicePatch,
    expected: v.optional(devicePatch),
  }),
  v.object({
    kind: v.literal("devices.move"),
    meta: operationMeta,
    from: v.array(groupMember),
    offset: position,
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
    expected: v.optional(devicePatch),
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
    kind: v.literal("label.create"),
    meta: operationMeta,
    label: mapLabel,
  }),
  v.object({
    kind: v.literal("label.patch"),
    meta: operationMeta,
    labelId: v.string(),
    patch: labelPatch,
    expected: v.optional(labelPatch),
  }),
  v.object({
    kind: v.literal("label.delete"),
    meta: operationMeta,
    labelId: v.string(),
  }),
  v.object({
    kind: v.literal("batch"),
    meta: operationMeta,
    operations: v.array(
      v.union(
        v.object({
          kind: v.literal("device.create"),
          device: placedDevice,
          ports: v.optional(v.array(newPort)),
          cables: v.optional(v.array(newCable)),
        }),
        v.object({
          kind: v.literal("device.patch"),
          deviceId: v.string(),
          patch: devicePatch,
          expected: v.optional(devicePatch),
        }),
        v.object({
          kind: v.literal("devices.move"),
          from: v.array(groupMember),
          offset: position,
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
          expected: v.optional(devicePatch),
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
        v.object({ kind: v.literal("label.create"), label: mapLabel }),
        v.object({
          kind: v.literal("label.patch"),
          labelId: v.string(),
          patch: labelPatch,
          expected: v.optional(labelPatch),
        }),
        v.object({ kind: v.literal("label.delete"), labelId: v.string() }),
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
  /** Cables an undone deletion could not lay again. */
  droppedCables: v.optional(v.number()),
});
