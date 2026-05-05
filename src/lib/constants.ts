import type { DeviceType } from "@/types/map";

// Shortcuts
export const OVERLAY_VISIBILITY_DELAY_MS = 50;
export const OVERLAY_MODIFIER_KEY_BY_PLATFORM = {
  mac: "Meta",
  nonMac: "Control",
} as const;

// Shortcuts UI
export const SHORTCUT_GROUP_HEADER_WEIGHT = 1;
export const SHORTCUT_GROUP_GRID_COLUMN_COUNT = 2;

// Toolbar
export const TOOLBAR_ICON_SIZE_CLASS = "size-6";
export const UNDO_REDO_EVENT_NAME = "netplan:undo-redo";
export const UNDO_REDO_FLASH_DURATION_MS = 500;
export const TOOLBAR_WALL_COLOR_SELECTION_ENABLED = false;
export const TOOLBAR_DEVICE_COLLISION_OFFSETS = [
  { x: 100, y: 0 },
  { x: 0, y: 100 },
  { x: -100, y: 0 },
  { x: 0, y: -100 },
  { x: 100, y: 100 },
  { x: -100, y: 100 },
  { x: -100, y: -100 },
  { x: 100, y: -100 },
  { x: 200, y: 0 },
  { x: 0, y: 200 },
] as const;
export const TOOLBAR_DEVICE_BUTTONS_INITIAL_STATE: Record<DeviceType, null> = {
  rack: null,
  switch: null,
  pc: null,
  "wall-port": null,
};

// Flow canvas
export const FLOW_CANVAS_ZOOM_DURATION_MS = 200;
export const FLOW_CANVAS_RESET_DURATION_MS = 300;
export const FLOW_CANVAS_CENTER_DURATION_MS = 250;
export const FLOW_CANVAS_FIT_VIEW_PADDING = 0.2;
export const FLOW_CANVAS_MIN_ZOOM = 0.3;
export const FLOW_CANVAS_MAX_ZOOM = 2;
export const FLOW_CANVAS_BACKGROUND_DOT_SIZE = 1.5;
export const FLOW_CANVAS_BACKGROUND_COLOR = "#94a3b8";
export const FLOW_CANVAS_HALO_SHADOWS = {
  erase: "inset 0 0 50px 20px rgba(239, 68, 68, 0.32)",
  draw: "inset 0 0 50px 20px rgba(46, 126, 255, 0.3)",
} as const;
export const FLOW_CANVAS_PANE_HOVER_COLORS = {
  erase: {
    fill: "rgba(220, 38, 38, 0.22)",
    stroke: "rgba(220, 38, 38, 0.9)",
  },
  draw: {
    fill: "rgba(59, 130, 246, 0.16)",
    stroke: "rgba(59, 130, 246, 0.85)",
  },
} as const;
export const FLOW_CANVAS_TOGGLE_DEBUG_HOTKEY = {
  key: "D",
  shift: true,
} as const;

// Canvas devices
export const CANVAS_DEVICE_NEAREST_POSITION_MAX_RADIUS = 200;

// Responsive
export const MOBILE_BREAKPOINT = 768;

// Sidebar
export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const SIDEBAR_WIDTH = "16rem";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_WIDTH_ICON = "3rem";

// Canvas panning
export const PAN_AMOUNT = 50;
