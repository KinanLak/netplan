import type {
  Connection,
  Device,
  MapDocument,
  Position,
  RoomDraft,
  Size,
  WallCommandReason,
  WallDraft,
  WallPointerInput,
  WallStrokeInput,
} from "@/types/map";

export interface CheckDeviceCollisionInput {
  floorId: string;
  deviceId: string;
  position: Position;
  size: Size;
}

export interface AddDeviceInput {
  device: Omit<Device, "id">;
  candidatePositions?: Array<Position>;
  deviceId?: string;
}

export interface MoveDeviceInput {
  deviceId: string;
  floorId: string;
  position: Position;
}

export interface DeleteDeviceInput {
  deviceId: string;
}

export interface AddConnectionInput {
  connection: Omit<Connection, "id">;
  connectionId?: string;
}

export interface DeleteConnectionInput {
  connectionId: string;
}

export interface AddWallLineInput {
  wall: WallDraft;
  generateWallId?: () => string;
}

export interface AddWallRoomInput {
  room: RoomDraft;
  generateWallId?: () => string;
}

export interface EraseWallAtPointerInput {
  input: WallPointerInput;
}

export interface EraseWallStrokeInput {
  input: WallStrokeInput;
}

export type DeviceCommandFailureReason =
  | "device-not-found"
  | "floor-not-found"
  | "collision"
  | "floor-mismatch"
  | "no-valid-position";

export type ConnectionCommandFailureReason =
  | "connection-not-found"
  | "device-not-found"
  | "port-not-found"
  | "same-endpoint"
  | "cross-floor"
  | "duplicate-connection";

export type WallCommandFailureReason =
  | Exclude<WallCommandReason, "applied" | "preview-hit" | "preview-miss">
  | "floor-not-found";

export type MapCommandResult<TFailureReason extends string> =
  | {
      ok: true;
      document: MapDocument;
      affectedIds?: Array<string>;
      reason: "applied";
    }
  | {
      ok: false;
      document: MapDocument;
      reason: TFailureReason;
    };
