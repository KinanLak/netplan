import type { Doc, Id } from "../../convex/_generated/dataModel";

// ── Re-exports of Convex types for app-wide use ──────────────────────────────
export type Device = Doc<"devices">;
export type WallSegment = Doc<"walls">;
export type Floor = Doc<"floors">;
export type Building = Doc<"buildings">;
export type LinkDoc = Doc<"links">;

export type DeviceId = Id<"devices">;
export type WallId = Id<"walls">;
export type FloorId = Id<"floors">;
export type BuildingId = Id<"buildings">;
export type LinkId = Id<"links">;

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

export type DeviceMetadata = Device["metadata"];

// ── Drafts (input shapes for mutations / engine) ─────────────────────────────
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

// ── Wall command results (consumed by the wall interaction state machine) ───
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
}

export interface WallStrokeInput {
  floorId: FloorId;
  fromPointer: Position;
  fromSnappedPoint: Position;
  toPointer: Position;
  toSnappedPoint: Position;
}

// ── History (inverse-command undo/redo) ─────────────────────────────────────
export interface WallSegmentSnapshot {
  start: Position;
  end: Position;
  color: WallColor;
}

export type InverseCommand =
  | { kind: "createDevice"; draft: DeviceDraft }
  | { kind: "removeDevice"; deviceId: DeviceId; snapshot: DeviceDraft }
  | { kind: "moveDevice"; deviceId: DeviceId; from: Position; to: Position }
  | {
      kind: "addWalls";
      floorId: FloorId;
      segments: ReadonlyArray<WallSegmentSnapshot>;
    }
  | {
      kind: "removeWalls";
      floorId: FloorId;
      ids: ReadonlyArray<WallId>;
      snapshots: ReadonlyArray<WallSegmentSnapshot>;
    };

// ── UI store (Zustand): only ephemeral interaction state ─────────────────────
export interface MapInteractionState {
  currentBuildingId: BuildingId | null;
  currentFloorId: FloorId | null;
  selectedDeviceId: DeviceId | null;
  hoveredDeviceId: DeviceId | null;
  isEditMode: boolean;
  highlightedDeviceIds: Array<DeviceId>;
  highlightedDeviceIdSet: ReadonlySet<DeviceId>;
  activeDrawTool: DrawTool;
  selectedWallColor: WallColor;
  undoStack: ReadonlyArray<InverseCommand>;
  redoStack: ReadonlyArray<InverseCommand>;
}

export interface MapInteractionActions {
  setCurrentBuilding: (buildingId: BuildingId | null) => void;
  setCurrentFloor: (floorId: FloorId | null) => void;
  selectDevice: (deviceId: DeviceId | null) => void;
  setHoveredDevice: (deviceId: DeviceId | null) => void;
  toggleEditMode: () => void;
  setActiveDrawTool: (tool: DrawTool) => void;
  setSelectedWallColor: (color: WallColor) => void;
  setHighlightedDevices: (deviceIds: Array<DeviceId>) => void;
  pushHistory: (command: InverseCommand) => void;
  takeUndo: () => InverseCommand | null;
  takeRedo: () => InverseCommand | null;
  queueRedo: (command: InverseCommand) => void;
  queueUndo: (command: InverseCommand) => void;
  clearHistory: () => void;
}

export type MapStore = MapInteractionState & MapInteractionActions;
