import type {
  Cable,
  Device,
  DeviceId,
  FloorId,
  FloorOverlay,
  LabelId,
  MapDocumentSnapshot,
  MapLabel,
  NewDevice,
  OperationMeta,
  Port,
  Position,
  Size,
  WallId,
  WallSegment,
} from "@/types/map";
import type { LabelPatch } from "./labels";

export type { LabelPatch } from "./labels";

/** The map edits only where a device stands; its identity is edited apart. */
export interface DevicePatch {
  position?: Position;
  size?: Size;
}

export interface OverlayPatch {
  center?: Position;
  scale?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
}

export type AtomicMapOperation =
  | {
      kind: "device.create";
      meta: OperationMeta;
      device: NewDevice;
      /** Its ports; without them, the defaults of its type (`defaultPorts`). */
      ports?: Array<Port>;
      /** Cables from its ports, as when undo brings a deleted device back. */
      cables?: Array<Cable>;
    }
  | {
      kind: "device.patch";
      meta: OperationMeta;
      deviceId: DeviceId;
      patch: DevicePatch;
      /**
       * What the patch expects to replace. An undo or a redo carries it, so
       * that it does not put back a device someone has moved since, the
       * cycle included (ADR 0025).
       */
      expected?: DevicePatch;
    }
  | { kind: "device.delete"; meta: OperationMeta; deviceId: DeviceId }
  | {
      /**
       * Puts an inventory device on a floor. It carries the whole device so
       * the map can show it at once; the server takes only where it stands.
       */
      kind: "device.place";
      meta: OperationMeta;
      device: Device;
    }
  | {
      /** Takes a device off its floor; it stays in the inventory, cables included. */
      kind: "device.unplace";
      meta: OperationMeta;
      deviceId: DeviceId;
      /** Where the unplace expects the device, as for `device.patch`. */
      expected?: DevicePatch;
    }
  | { kind: "walls.add"; meta: OperationMeta; walls: Array<WallSegment> }
  | { kind: "walls.delete"; meta: OperationMeta; wallIds: Array<WallId> }
  | {
      /** Places, replaces or (with `null`) removes the floor's calque. */
      kind: "overlay.set";
      meta: OperationMeta;
      floorId: FloorId;
      overlay: FloorOverlay | null;
    }
  | {
      kind: "overlay.patch";
      meta: OperationMeta;
      floorId: FloorId;
      patch: OverlayPatch;
    }
  | { kind: "label.create"; meta: OperationMeta; label: MapLabel }
  | {
      kind: "label.patch";
      meta: OperationMeta;
      labelId: LabelId;
      patch: LabelPatch;
      /** What an undo or a redo expects to replace, as for `device.patch`. */
      expected?: LabelPatch;
    }
  | { kind: "label.delete"; meta: OperationMeta; labelId: LabelId };

type DistributiveOmit<T, K extends keyof T> = T extends T ? Omit<T, K> : never;

export type BatchSubOperation = DistributiveOmit<AtomicMapOperation, "meta">;

export type MapOperation =
  | AtomicMapOperation
  | {
      kind: "batch";
      meta: OperationMeta;
      operations: Array<BatchSubOperation>;
    };

export type ApplyOperationReason =
  | "already-exists"
  | "conflict"
  | "missing-device"
  | "missing-wall"
  | "invalid-ports"
  | "duplicate-wall-geometry"
  | "missing-overlay"
  | "missing-label"
  | "invalid-label"
  | "overlay-locked"
  | "invalid-overlay"
  | "wrong-floor"
  | "source-owned"
  | "invalid-batch";

export interface ApplyOperationResult {
  snapshot: MapDocumentSnapshot;
  applied: boolean;
  reason?: ApplyOperationReason;
}

export interface HistoryEntry {
  label: string;
  undoOperation: MapOperation;
  affectedObjectIds: Array<string>;
}

export type { Device, FloorOverlay, MapDocumentSnapshot, WallSegment };
