import { isMac, shortcuts } from "@/lib/shortcuts";
import type { ShortcutAction, ShortcutScope } from "@/lib/shortcuts";
import type { ShortcutKeyBinding } from "@/lib/shortcut-types";
import type { DrawTool } from "@/types/map";

export type ShortcutIntentEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export type ShortcutIntentRuntime = {
  activeDrawTool: DrawTool;
  /** The user may change this site's map: their role, and not archived. */
  canEdit: boolean;
  /** Their role alone, for what only reads (`byRoleOnly`); `canEdit` if unset. */
  hasEditorRole?: boolean;
  currentFloorId: string | null;
  /** Edit mode as the user sees it: their choice, and only if `canEdit`. */
  isEditMode: boolean;
  isInputFocused: boolean;
  /** The key comes from a dialog or an open menu, which owns its keys. */
  isWidgetFocused: boolean;
  selectedDeviceId: string | null;
  /** How many devices are selected, one or several. */
  selectionCount: number;
  /** The key comes from the map or the page itself, not from a control. */
  isMapFocused: boolean;
};

export type ShortcutIntentRegistration = {
  action: ShortcutAction;
  enabled: boolean;
  id: string;
};

export type ShortcutIntentMatch = {
  action: ShortcutAction;
  registrationId: string;
};

type ShortcutModifiers = {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  mod?: boolean;
  shift?: boolean;
};

const shortcutRoutingPriority: Array<ShortcutAction> = [
  "close-drawer",
  "edit-device-identity",
  "unplace-device",
  "show-port-cables",
  "show-device-history",
  "cancel-wall-tool",
  "toggle-device-cables",
  "escape",
  "delete",
  "nudge-selection",
  "select-all",
  "undo",
  "redo",
  "show-shortcuts",
  "cycle-theme",
  "refresh-site",
  "sidebar-toggle",
  "toggle-edit-mode",
  "toggle-wall-debug",
  "wall-eraser-size-increase",
  "wall-eraser-size-decrease",
  "zoom-in",
  "zoom-out",
  "zoom-reset",
  "fit-view",
  "focus-device-search",
  "find-device",
  "floor-up",
  "floor-down",
  "tool-wall",
  "tool-room",
  "tool-wall-brush",
  "tool-wall-erase",
  "tool-label",
  "place-device",
  "toggle-overlay-panel",
  "toggle-overlay-visibility",
  "toggle-overlay-lock",
  "calibrate-overlay",
];

const shortcutPriority = new Map(
  shortcutRoutingPriority.map((action, index) => [action, index]),
);

const toolShortcutActions = new Set<ShortcutAction>([
  "tool-wall",
  "tool-room",
  "tool-wall-brush",
  "tool-wall-erase",
  "tool-label",
]);

const hasNoExtraModifiers = (event: ShortcutIntentEvent): boolean => {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
};

const matchesKey = (
  event: ShortcutIntentEvent,
  key: string,
  code?: string,
): boolean => {
  if (code && event.code !== code) {
    return false;
  }

  if (event.key === key) {
    return true;
  }

  if (
    key.length === 1 &&
    event.key.length === 1 &&
    event.key.toLowerCase() === key.toLowerCase()
  ) {
    return true;
  }

  if (key.length !== 1) {
    return false;
  }

  const upperKey = key.toUpperCase();
  return (
    event.code === `Key${upperKey}` ||
    event.code === `Digit${key}` ||
    event.code === `Numpad${key}`
  );
};

const matchesModifiers = (
  event: ShortcutIntentEvent,
  modifiers: ShortcutModifiers,
): boolean => {
  const requiredCtrl = Boolean(modifiers.ctrl || (modifiers.mod && !isMac));
  const requiredMeta = Boolean(modifiers.meta || (modifiers.mod && isMac));

  return (
    event.altKey === Boolean(modifiers.alt) &&
    event.ctrlKey === requiredCtrl &&
    event.metaKey === requiredMeta &&
    event.shiftKey === Boolean(modifiers.shift)
  );
};

const parseStringBinding = (
  binding: string,
): { key: string; modifiers: ShortcutModifiers } | null => {
  const parts = binding.split("+");
  const key = parts.at(-1);

  if (!key) {
    return null;
  }

  return {
    key,
    modifiers: {
      alt: parts.includes("Alt"),
      ctrl: parts.includes("Control") || parts.includes("Ctrl"),
      meta: parts.includes("Meta"),
      mod: parts.includes("Mod"),
      shift: parts.includes("Shift"),
    },
  };
};

export const matchesShortcutBinding = (
  event: ShortcutIntentEvent,
  binding: ShortcutKeyBinding,
): boolean => {
  if (typeof binding !== "string") {
    return (
      matchesModifiers(event, binding) &&
      matchesKey(event, binding.key, binding.code)
    );
  }

  const parsed = parseStringBinding(binding);
  if (!parsed) {
    return false;
  }

  return (
    matchesModifiers(event, parsed.modifiers) && matchesKey(event, parsed.key)
  );
};

export const isShortcutInputTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
};

// Dialogs, menus, popovers and lists handle their own keys: Escape in a menu
// closes the menu and nothing else (ADR 0030).
const WIDGET_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="sheet-content"]',
  '[role="dialog"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="context-menu-sub-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="select-content"]',
  '[data-slot="combobox-content"]',
  '[role="menu"]',
  '[role="listbox"]',
].join(", ");

/** The page itself or the map, as opposed to a sidebar or toolbar control. */
export const isShortcutMapTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return true;
  }
  return (
    target === document.body ||
    target === document.documentElement ||
    target.closest(".react-flow") !== null
  );
};

export const isShortcutWidgetTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest(WIDGET_SELECTOR) !== null;
};

const isScopeActive = (
  scope: ShortcutScope,
  runtime: ShortcutIntentRuntime,
): boolean => {
  switch (scope) {
    case "global":
      return true;
    case "canvas":
      return runtime.selectedDeviceId === null;
    case "drawer":
      return runtime.selectedDeviceId !== null;
  }
};

const isToolShortcutAction = (action: ShortcutAction): boolean => {
  return toolShortcutActions.has(action);
};

const isActionAllowedByContext = (
  action: ShortcutAction,
  runtime: ShortcutIntentRuntime,
): boolean => {
  switch (action) {
    case "cancel-wall-tool":
      return runtime.isEditMode && runtime.activeDrawTool !== "device";
    case "edit-device-identity":
    case "unplace-device":
      return runtime.isEditMode;
    case "toggle-wall-debug":
      return runtime.isEditMode && runtime.activeDrawTool !== "device";
    case "wall-eraser-size-increase":
    case "wall-eraser-size-decrease":
      return (
        runtime.isEditMode &&
        runtime.activeDrawTool === "wall-erase" &&
        runtime.currentFloorId !== null
      );
    case "undo":
    case "redo":
      return runtime.isEditMode;
    case "delete":
      return runtime.isEditMode && runtime.selectionCount > 0;
    case "nudge-selection":
      // From a sidebar button, an arrow key belongs to the browser.
      return (
        runtime.isEditMode &&
        runtime.activeDrawTool === "device" &&
        runtime.selectionCount > 0 &&
        runtime.isMapFocused
      );
    case "select-all":
      return (
        runtime.isEditMode &&
        runtime.activeDrawTool === "device" &&
        runtime.currentFloorId !== null
      );
    case "place-device":
    case "toggle-overlay-panel":
    case "toggle-overlay-lock":
    case "calibrate-overlay":
      return runtime.isEditMode && runtime.currentFloorId !== null;
    case "toggle-overlay-visibility":
      return runtime.currentFloorId !== null;
    default:
      if (isToolShortcutAction(action)) {
        return runtime.isEditMode && runtime.currentFloorId !== null;
      }

      return true;
  }
};

const getActionPriority = (action: ShortcutAction): number => {
  return shortcutPriority.get(action) ?? shortcutRoutingPriority.length;
};

const hasEnabledRegistration = (
  action: ShortcutAction,
  registrations: Array<ShortcutIntentRegistration>,
): ShortcutIntentRegistration | null => {
  return (
    registrations.find(
      (registration) => registration.action === action && registration.enabled,
    ) ?? null
  );
};

export const resolveShortcutIntent = ({
  event,
  registrations,
  runtime,
}: {
  event: ShortcutIntentEvent;
  registrations: Array<ShortcutIntentRegistration>;
  runtime: ShortcutIntentRuntime;
}): ShortcutIntentMatch | null => {
  if (runtime.isInputFocused || runtime.isWidgetFocused) {
    return null;
  }

  const matchingActions = Object.entries(shortcuts)
    .filter(([, config]) =>
      config.keys.some((key) => matchesShortcutBinding(event, key)),
    )
    .map(([action]) => action as ShortcutAction)
    .filter((action) => {
      const config = shortcuts[action];

      return (
        (!config.requiresEdit ||
          (config.byRoleOnly
            ? (runtime.hasEditorRole ?? runtime.canEdit)
            : runtime.canEdit)) &&
        isScopeActive(config.scope, runtime) &&
        isActionAllowedByContext(action, runtime) &&
        hasEnabledRegistration(action, registrations) !== null
      );
    })
    .toSorted((a, b) => getActionPriority(a) - getActionPriority(b));

  const action = matchingActions.at(0);
  if (!action) {
    return null;
  }

  const registration = hasEnabledRegistration(action, registrations);
  if (!registration) {
    return null;
  }

  return { action, registrationId: registration.id };
};

export const isPlainShortcutEvent = (event: ShortcutIntentEvent): boolean => {
  return hasNoExtraModifiers(event);
};
