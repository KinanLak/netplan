// Device types for network equipment
export type DeviceType = "rack" | "switch" | "pc" | "wall-port";
export type DrawTool = "device" | "wall" | "wall-brush" | "wall-erase" | "room";
export type WallColor = "sand" | "concrete" | "slate";

export type DeviceStatus = "up" | "down" | "unknown";

export interface DeviceMetadata {
  ip?: string;
  status?: DeviceStatus;
  model?: string;
  ports?: Array<PortInfo>;
  lastUser?: string;
  connectedDeviceIds?: Array<string>;
}

export interface PortInfo {
  id: string;
  number: number;
  status: DeviceStatus;
  connectedTo?: string;
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

// Building & Floor types
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

// React Flow node data — selection/highlight is read from the store by each node
export type DeviceNodeData = Device;

// Store types
export interface MapState {
  buildings: Array<Building>;
  devices: Array<Device>;
  walls: Array<WallSegment>;
  currentBuildingId: string | null;
  currentFloorId: string | null;
  selectedDeviceId: string | null;
  hoveredDeviceId: string | null;
  isEditMode: boolean;
  highlightedDeviceIds: Array<string>;
  activeDrawTool: DrawTool;
  selectedWallColor: WallColor;
}

export interface MapActions {
  setCurrentBuilding: (buildingId: string) => void;
  setCurrentFloor: (floorId: string) => void;
  selectDevice: (deviceId: string | null) => void;
  setHoveredDevice: (deviceId: string | null) => void;
  addDevice: (device: Omit<Device, "id">) => void;
  updateDevicePosition: (deviceId: string, position: Position) => void;
  deleteDevice: (deviceId: string) => void;
  addWallLine: (line: WallDraft) => WallCommandResult;
  addWallRoom: (room: RoomDraft) => WallCommandResult;
  eraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  eraseWallStroke: (input: WallStrokeInput) => WallCommandResult;
  previewEraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  toggleEditMode: () => void;
  setActiveDrawTool: (tool: DrawTool) => void;
  setSelectedWallColor: (color: WallColor) => void;
  setHighlightedDevices: (deviceIds: Array<string>) => void;
  checkCollision: (deviceId: string, position: Position, size: Size) => boolean;
}

export type MapStore = MapState & MapActions;
