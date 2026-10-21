import type { IntegrationKind } from "../sites/integrations";

// ── Stable application ids ───────────────────────────────────────────────────

type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type ClientId = Brand<string, "ClientId">;
export type OperationId = Brand<string, "OperationId">;
export type DeviceId = Brand<string, "DeviceId">;
export type WallId = Brand<string, "WallId">;
export type FloorId = Brand<string, "FloorId">;
export type BuildingId = Brand<string, "BuildingId">;
export type PortId = Brand<string, "PortId">;
export type CableId = Brand<string, "CableId">;
export type SiteId = Brand<string, "SiteId">;
/** A calque image file, the object id of its `floorOverlayFiles` row. */
export type OverlayFileId = Brand<string, "OverlayFileId">;

export type ObjectId =
  | DeviceId
  | WallId
  | FloorId
  | BuildingId
  | PortId
  | CableId
  | SiteId;
export type ObjectKind = "building" | "floor" | "device" | "wall" | "cable";

// ── Domain enums ─────────────────────────────────────────────────────────────

export type DeviceType =
  | "rack"
  | "switch"
  | "patch-panel"
  | "pc"
  | "endpoint"
  | "wall-port";
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

/** What the network last reported about a device, as opposed to its identity. */
export interface DeviceMetadata {
  status?: DeviceStatus;
  lastUser?: string;
}

/** The integration that owns a device's identity (ADR 0022). */
export interface DeviceSource {
  integration: IntegrationKind;
  externalId: string;
  url?: string;
  /** When the source last changed what it owns, not when it was last read. */
  syncedAt: number;
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

/**
 * A site inventory device as placed on a floor. The inventory also holds
 * devices without a placement; the map never sees those.
 */
export interface Device {
  id: DeviceId;
  floorId: FloorId;
  type: DeviceType;
  name: string;
  hostname?: string;
  serial?: string;
  /** Lowercase and colon-separated, unique within the site. */
  macs: Array<string>;
  model?: string;
  ip?: string;
  notes?: string;
  source?: DeviceSource;
  position: Position;
  size: Size;
  metadata: DeviceMetadata;
}

/** A device as a user creates it: an integration's devices arrive by sync. */
export type NewDevice = Omit<Device, "source">;

export interface WallSegment {
  id: WallId;
  floorId: FloorId;
  start: Position;
  end: Position;
  color: WallColor;
  geometryKey: string;
}

/**
 * An interface of an active device, or a front or rear port of a passive one
 * (patch panel, wall socket); a front port passes through to its rear port.
 */
export type PortKind = "interface" | "front" | "rear";

/** The object of an integration that a port or a cable comes from. */
export interface SourceRef {
  integration: IntegrationKind;
  externalId: string;
}

export interface Port {
  id: PortId;
  deviceId: DeviceId;
  name: string;
  kind: PortKind;
  /** Position among the device's ports of the same kind. */
  order: number;
  rearPortId?: PortId;
  /** The link last observed, absent until a source reports it. */
  status?: DeviceStatus;
  /** A device of the site was seen on the port by its switch's last read. */
  seen?: true;
  source?: SourceRef;
}

export interface CableEnd {
  deviceId: DeviceId;
  portId: PortId;
}

/** Joins two ports of the site, possibly on different floors (ADR 0022). */
export interface Cable {
  id: CableId;
  a: CableEnd;
  b: CableEnd;
  source?: SourceRef;
}

/**
 * The floor's background image (ADR 0024). The image is drawn centred on
 * `center`, scaled by `scale` plan units per image pixel, then rotated
 * clockwise by `rotation` degrees.
 */
export interface FloorOverlay {
  floorId: FloorId;
  fileId: OverlayFileId;
  imageWidth: number;
  imageHeight: number;
  center: Position;
  scale: number;
  rotation: number;
  opacity: number;
  locked: boolean;
}

export interface MapDocumentSnapshot {
  floorId: FloorId;
  revision: number;
  devices: Array<Device>;
  walls: Array<WallSegment>;
  /** The ports of the floor's devices. */
  ports: Array<Port>;
  /** The cables with at least one end on a device of the floor. */
  cables: Array<Cable>;
  overlay: FloorOverlay | null;
}

// ── Operation metadata ───────────────────────────────────────────────────────

export interface OperationMeta {
  opId: OperationId;
  clientId: ClientId;
  clientSeq: number;
  createdAt: number;
}

// ── Drafts (input shapes for commands / engine) ──────────────────────────────

export type DeviceDraft = Omit<NewDevice, "id">;

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

/** A port pressed on the map, to draw a cable from or unplug. */
export interface CableDraft {
  deviceId: DeviceId;
  portId: PortId;
}

export interface MapInteractionState {
  currentBuildingId: BuildingId | null;
  currentFloorId: FloorId | null;
  selectedDeviceId: DeviceId | null;
  selectedDeviceIds: Array<DeviceId>;
  selectedDeviceIdSet: ReadonlySet<DeviceId>;
  hoveredDeviceId: DeviceId | null;
  isEditMode: boolean;
  isMultiSelectMode: boolean;
  /** The switch or patch panel whose cables were asked for (ADR 0025). */
  shownCablesDeviceId: DeviceId | null;
  /**
   * The port pressed on the map: a cable being drawn from it, or the one
   * plugged into it, to unplug (ADR 0025).
   */
  cableDraft: CableDraft | null;
  activeDrawTool: DrawTool;
  selectedWallColor: WallColor;
  wallEraserSize: number;
  /** The calque panel; while open, the calque is what the canvas edits. */
  isOverlayPanelOpen: boolean;
  /** The panel that places inventory devices on the floor (C2). */
  isPlacePanelOpen: boolean;
  /** Personal and per session: hiding the calque changes nothing for others. */
  isOverlayHidden: boolean;
  /** The calque as a gesture in progress shows it, committed on release. */
  overlayDraft: OverlayDraft | null;
  /** A two-point scale calibration being picked on the calque. */
  overlayCalibration: OverlayCalibration | null;
}

export type OverlayDraft = Partial<
  Pick<FloorOverlay, "center" | "scale" | "rotation" | "opacity">
>;

/**
 * The points picked so far, as pixels of the image they were picked on, so
 * they stay on the same spot of the plan if the calque moves meanwhile.
 */
export interface OverlayCalibration {
  fileId: OverlayFileId;
  points: Array<Position>;
}

export interface MapInteractionActions {
  setCurrentBuilding: (buildingId: BuildingId | null) => void;
  setCurrentFloor: (floorId: FloorId | null) => void;
  selectDevice: (deviceId: DeviceId | null) => void;
  setSelectedDevices: (deviceIds: Array<DeviceId>) => void;
  setHoveredDevice: (deviceId: DeviceId | null) => void;
  toggleEditMode: () => void;
  /** Drops the edit-only tools and multi-selection, keeping the edit-mode flag. */
  leaveEditTools: () => void;
  toggleMultiSelectMode: () => void;
  setActiveDrawTool: (tool: DrawTool) => void;
  setSelectedWallColor: (color: WallColor) => void;
  setWallEraserSize: (size: number) => void;
  showCables: (deviceId: DeviceId | null) => void;
  setCableDraft: (draft: CableDraft | null) => void;
  setOverlayPanelOpen: (open: boolean) => void;
  setPlacePanelOpen: (open: boolean) => void;
  toggleOverlayHidden: () => void;
  setOverlayDraft: (draft: OverlayDraft | null) => void;
  setOverlayCalibration: (calibration: OverlayCalibration | null) => void;
}

export type MapStore = MapInteractionState & MapInteractionActions;
