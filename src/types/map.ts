export type DeviceType = "rack" | "switch" | "pc" | "wall-port";
export type DrawTool = "device" | "wall" | "wall-brush" | "wall-erase" | "room";
export type WallColor = "sand" | "concrete" | "slate";

export type DeviceStatus = "up" | "down" | "unknown";

export interface PortInfo {
  id: string;
  number: number;
  status: DeviceStatus;
}

export interface DeviceMetadata {
  ip?: string;
  status?: DeviceStatus;
  model?: string;
  ports?: Array<PortInfo>;
  lastUser?: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  hostname?: string;
  floorId: string;
  position: Position;
  size: Size;
  metadata: DeviceMetadata;
}

export interface WallSegment {
  id: string;
  floorId: string;
  start: Position;
  end: Position;
  color: WallColor;
}

export interface ConnectionEndpoint {
  deviceId: string;
  portId?: string;
}

export interface Connection {
  id: string;
  floorId: string;
  a: ConnectionEndpoint;
  b: ConnectionEndpoint;
  status?: DeviceStatus;
  label?: string;
}

export interface Floor {
  id: string;
  name: string;
  backgroundImage?: string;
}

export interface Building {
  id: string;
  name: string;
  floors: Array<Floor>;
}

export interface MapDocument {
  buildings: Array<Building>;
  devices: Array<Device>;
  walls: Array<WallSegment>;
  connections: Array<Connection>;
}

export type WallDraft = Omit<WallSegment, "id">;

export interface RoomDraft {
  floorId: string;
  start: Position;
  end: Position;
  color: WallColor;
}

export type WallCommandReason =
  | "applied"
  | "invalid-line"
  | "invalid-room"
  | "already-exists"
  | "collision-with-device"
  | "no-wall-at-pointer"
  | "empty-stroke"
  | "preview-hit"
  | "preview-miss";

export interface WallCommandResult {
  changed: boolean;
  nextWalls: Array<WallSegment>;
  affectedKeys: Array<string>;
  reason: WallCommandReason;
}

export interface WallPointerInput {
  floorId: string;
  pointer: Position;
  snappedPoint: Position;
}

export interface WallStrokeInput {
  floorId: string;
  fromPointer: Position;
  fromSnappedPoint: Position;
  toPointer: Position;
  toSnappedPoint: Position;
}

// React Flow node data must keep the device nested under `data.data`.
export type DeviceNodeData = Record<string, unknown> & {
  data: Device;
};
