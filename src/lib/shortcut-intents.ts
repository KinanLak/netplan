import { deviceToolShortcutActions } from "@/devices/deviceKindRegistry";
import { isMac, shortcuts } from "@/lib/shortcuts";
import type { ShortcutAction, ShortcutScope } from "@/lib/shortcuts";
import type { ShortcutKeyBinding } from "@/lib/shortcut-types";
import type { Device, DrawTool } from "@/types/map";

export type ShortcutIntentEvent = Pick<
  KeyboardEvent,
  "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export type ShortcutIntentRuntime = {
  activeDrawTool: DrawTool;
  currentFloorId: string | null;
  isEditMode: boolean;
  isInputFocused: boolean;
  isModalFocused: boolean;
  selectedDeviceId: string | null;
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

export type ConnectionHighlightShortcutState = {
  devices: Array<Pick<Device, "id" | "metadata">>;
  highlightedDeviceIds: Array<string>;
  hoveredDeviceId: string | null;
  selectedDeviceId: string | null;
};

type ShortcutModifiers = {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  mod?: boolean;
  shift?: boolean;
};

const deviceToolShortcutActionSet = new Set<ShortcutAction>(
  deviceToolShortcutActions,
);

const shortcutRoutingPriority: Array<ShortcutAction> = [
  "close-drawer",
  "delete-device",
  "cancel-wall-tool",
  "highlight-connections",
  "escape",
  "delete",
  "undo",
  "redo",
  "show-shortcuts",
  "cycle-theme",
  "sidebar-toggle",
  "toggle-edit-mode",
  "toggle-wall-debug",
  "zoom-in",
  "zoom-out",
  "zoom-reset",
  "pan-up",
  "pan-down",
  "pan-left",
  "pan-right",
  "floor-up",
  "floor-down",
  "tool-wall",
  "tool-room",
  "tool-wall-brush",
  "tool-wall-erase",
  ...deviceToolShortcutActions,
];

const shortcutPriority = new Map(
  shortcutRoutingPriority.map((action, index) => [action, index]),
);

const wallToolShortcutActions = new Set<ShortcutAction>([
  "tool-wall",
  "tool-room",
  "tool-wall-brush",
  "tool-wall-erase",
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

export const isShortcutModalTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  return target.closest('[data-slot="dialog-content"]') !== null;
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
  return (
    wallToolShortcutActions.has(action) ||
    deviceToolShortcutActionSet.has(action)
  );
};

const isActionAllowedByContext = (
  action: ShortcutAction,
  runtime: ShortcutIntentRuntime,
): boolean => {
  switch (action) {
    case "cancel-wall-tool":
      return runtime.isEditMode && runtime.activeDrawTool !== "device";
    case "delete-device":
      return runtime.isEditMode;
    case "toggle-wall-debug":
      return runtime.isEditMode && runtime.activeDrawTool !== "device";
    case "undo":
    case "redo":
      return runtime.isEditMode;
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
  if (runtime.isInputFocused || runtime.isModalFocused) {
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

export const getNextConnectionHighlightIds = ({
  devices,
  highlightedDeviceIds,
  hoveredDeviceId,
  selectedDeviceId,
}: ConnectionHighlightShortcutState): Array<string> | null => {
  const targetDeviceId = selectedDeviceId ?? hoveredDeviceId;

  if (!targetDeviceId) {
    return highlightedDeviceIds.length > 0 ? [] : null;
  }

  const device = devices.find((candidate) => candidate.id === targetDeviceId);
  const connectedDeviceIds = device?.metadata.connectedDeviceIds;

  if (!connectedDeviceIds?.length) {
    return highlightedDeviceIds.length > 0 ? [] : null;
  }

  const idsToHighlight = [targetDeviceId, ...connectedDeviceIds];
  const isCurrentlyHighlighted = idsToHighlight.every((id) =>
    highlightedDeviceIds.includes(id),
  );

  return isCurrentlyHighlighted ? [] : idsToHighlight;
};
