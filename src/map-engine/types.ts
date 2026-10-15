import type {
  Device,
  DeviceId,
  FloorId,
  FloorOverlay,
  DeviceMetadata,
  LinkDoc,
  LinkId,
  MapDocumentSnapshot,
  OperationMeta,
  Position,
  Size,
  WallId,
  WallSegment,
} from "@/types/map";

export interface DevicePatch {
  name?: string;
  hostname?: string;
  position?: Position;
  size?: Size;
  metadata?: DeviceMetadata;
}

export interface OverlayPatch {
  center?: Position;
  scale?: number;
  rotation?: number;
  opacity?: number;
  locked?: boolean;
}

export type AtomicMapOperation =
  | { kind: "device.create"; meta: OperationMeta; device: Device }
  | {
      kind: "device.patch";
      meta: OperationMeta;
      deviceId: DeviceId;
      patch: DevicePatch;
    }
  | { kind: "device.delete"; meta: OperationMeta; deviceId: DeviceId }
  | { kind: "link.create"; meta: OperationMeta; link: LinkDoc }
  | { kind: "link.delete"; meta: OperationMeta; linkId: LinkId }
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
    };

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
  | "missing-link"
  | "missing-wall"
  | "missing-endpoint"
  | "cross-floor-link"
  | "external-binding-conflict"
  | "duplicate-wall-geometry"
  | "missing-overlay"
  | "overlay-locked"
  | "invalid-overlay"
  | "wrong-floor"
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

export type { Device, FloorOverlay, LinkDoc, MapDocumentSnapshot, WallSegment };
