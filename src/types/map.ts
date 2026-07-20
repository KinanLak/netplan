// ── Stable application ids ───────────────────────────────────────────────────

type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type ClientId = Brand<string, "ClientId">;
export type SessionId = Brand<string, "SessionId">;
export type OperationId = Brand<string, "OperationId">;
export type DeviceId = Brand<string, "DeviceId">;
export type WallId = Brand<string, "WallId">;
export type FloorId = Brand<string, "FloorId">;
export type BuildingId = Brand<string, "BuildingId">;
export type LinkId = Brand<string, "LinkId">;
export type SiteId = Brand<string, "SiteId">;

export type ObjectId =
  | DeviceId
  | WallId
  | FloorId
  | BuildingId
  | LinkId
  | SiteId;
export type ObjectKind = "building" | "floor" | "device" | "wall" | "link";

// ── Domain enums ─────────────────────────────────────────────────────────────

export type DeviceType = "rack" | "switch" | "pc" | "wall-port";
export type DrawTool = "device" | "wall" | "wall-brush" | "wall-erase" | "room";
export type WallColor = "sand" | "concrete" | "slate";
export type DeviceStatus = "up" | "down" | "unknown";

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface PortInfo {
  id: string;
  number: number;
  status: DeviceStatus;
}

export interface ExternalDeviceSource {
  provider: "netbox";
  siteId: SiteId;
  instanceKey: string;
  externalId: string;
  url: string;
  location?: string;
  locationPath: Array<string>;
  role: string;
  lifecycleStatus: string;
  syncedAt: number;
}

export interface DeviceMetadata {
  ip?: string;
  status?: DeviceStatus;
  model?: string;
  ports?: Array<PortInfo>;
  lastUser?: string;
  macs?: Array<string>;
  source?: ExternalDeviceSource;
  localization?: {
    state:
      | "online"
      | "resolved_unplaced"
      | "missing"
      | "offline"
      | "ambiguous"
      | "unresolvable"
      | "socket_conflict";
    reason?: string;
    positionState: "current" | "historical";
    projectionStatus:
      | "idle"
      | "pending"
      | "running"
      | "success"
      | "blocked"
      | "error";
    targetFloorId?: FloorId;
    targetPosition?: Position;
    errorCode?: string;
    nextAttemptAt?: number;
  };
}

// ── Domain documents ─────────────────────────────────────────────────────────

export interface Building {
  id: BuildingId;
  siteId: SiteId;
  name: string;
  order: number;
}

export interface Site {
  id: SiteId;
  configKey: string;
  displayName: string;
  timezone: string;
  enabled: boolean;
}

export interface Floor {
  id: FloorId;
  buildingId: BuildingId;
  name: string;
  order: number;
}

export interface Device {
  id: DeviceId;
  floorId: FloorId;
  type: DeviceType;
  name: string;
  hostname?: string;
  position: Position;
  size: Size;
  metadata: DeviceMetadata;
}

export interface WallSegment {
  id: WallId;
  floorId: FloorId;
  start: Position;
  end: Position;
  color: WallColor;
  geometryKey: string;
}

export interface LinkDoc {
  id: LinkId;
  floorId: FloorId;
  fromDeviceId: DeviceId;
  fromPort?: string;
  toDeviceId: DeviceId;
  toPort?: string;
  label?: string;
}

export type Link = LinkDoc;

export interface MapDocumentSnapshot {
  floorId: FloorId;
  revision: number;
  devices: Array<Device>;
  walls: Array<WallSegment>;
  links: Array<LinkDoc>;
}

// ── Operation metadata ───────────────────────────────────────────────────────

export interface OperationMeta {
  opId: OperationId;
  clientId: ClientId;
  clientSeq: number;
  createdAt: number;
}

// ── Drafts (input shapes for commands / engine) ──────────────────────────────

export interface DeviceDraft {
  floorId: FloorId;
  type: DeviceType;
  name: string;
  hostname?: string;
  position: Position;
  size: Size;
  metadata: DeviceMetadata;
}

export interface WallDraft {
  floorId: FloorId;
  start: Position;
  end: Position;
  color: WallColor;
}

export interface RoomDraft {
  floorId: FloorId;
  start: Position;
  end: Position;
  color: WallColor;
}

// ── Wall command results (consumed by the wall interaction state machine) ────

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
  floorId: FloorId;
  pointer: Position;
  snappedPoint: Position;
  eraserSize: number;
}

export interface WallStrokeInput {
  floorId: FloorId;
  fromPointer: Position;
  fromSnappedPoint: Position;
  toPointer: Position;
  toSnappedPoint: Position;
  eraserSize: number;
}

// ── UI store (Zustand): only ephemeral interaction state ─────────────────────

export interface MapInteractionState {
  currentBuildingId: BuildingId | null;
  currentFloorId: FloorId | null;
  selectedDeviceId: DeviceId | null;
  selectedDeviceIds: Array<DeviceId>;
  selectedDeviceIdSet: ReadonlySet<DeviceId>;
  hoveredDeviceId: DeviceId | null;
  isEditMode: boolean;
  isMultiSelectMode: boolean;
  highlightedDeviceIds: Array<DeviceId>;
  highlightedDeviceIdSet: ReadonlySet<DeviceId>;
  activeDrawTool: DrawTool;
  selectedWallColor: WallColor;
  wallEraserSize: number;
}

export interface MapInteractionActions {
  setCurrentBuilding: (buildingId: BuildingId | null) => void;
  setCurrentFloor: (floorId: FloorId | null) => void;
  selectDevice: (deviceId: DeviceId | null) => void;
  setSelectedDevices: (deviceIds: Array<DeviceId>) => void;
  setHoveredDevice: (deviceId: DeviceId | null) => void;
  toggleEditMode: () => void;
  toggleMultiSelectMode: () => void;
  setActiveDrawTool: (tool: DrawTool) => void;
  setSelectedWallColor: (color: WallColor) => void;
  setWallEraserSize: (size: number) => void;
  setHighlightedDevices: (deviceIds: Array<DeviceId>) => void;
}

export type MapStore = MapInteractionState & MapInteractionActions;
