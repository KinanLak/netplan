import type {
  Device,
  DeviceId,
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

export type MapOperation =
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
  | { kind: "batch"; meta: OperationMeta; operations: Array<MapOperation> };

export type ApplyOperationReason =
  | "already-exists"
  | "conflict"
  | "missing-device"
  | "missing-link"
  | "missing-wall"
  | "missing-endpoint"
  | "cross-floor-link"
  | "duplicate-wall-geometry"
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

export type { Device, LinkDoc, MapDocumentSnapshot, WallSegment };
