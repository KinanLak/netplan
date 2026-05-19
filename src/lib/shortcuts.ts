/**
 * Keyboard shortcuts configuration for NetPlan
 *
 * Uses NetPlan's shortcut key format:
 * - Modifiers: Mod (Cmd on Mac, Ctrl on Windows), Control, Alt, Shift, Meta
 * - Combine with '+': 'Mod+Z', 'Mod+Shift+Z'
 * - Keys use event.key names: 'Escape', 'ArrowUp', 'Delete', 'Backspace'
 * - Single character keys also match physical event.code for letters, digits,
 *   and numpad digits so hotbar shortcuts survive layout changes.
 */

import { deviceKinds } from "@/devices/deviceKindRegistry";
import type { DeviceToolShortcutAction } from "@/devices/deviceKindRegistry";
import type { ShortcutKeyBinding } from "@/lib/shortcut-types";

export type ShortcutScope = "global" | "canvas" | "drawer";

export type ShortcutAction =
  // Global
  | "toggle-edit-mode"
  | "escape"
  | "delete"
  | "undo"
  | "redo"
  | "show-shortcuts"
  | "cycle-theme"
  | "sidebar-toggle"
  | "toggle-wall-debug"
  // Navigation
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "pan-up"
  | "pan-down"
  | "pan-left"
  | "pan-right"
  | "floor-up"
  | "floor-down"
  | "cancel-wall-tool"
  // Tools - Walls (numbers + letter aliases)
  | "tool-wall"
  | "tool-wall-brush"
  | "tool-wall-erase"
  | "wall-eraser-size-increase"
  | "wall-eraser-size-decrease"
  | "tool-room"
  // Tools - Devices (number hotbar)
  | DeviceToolShortcutAction
  // Device drawer
  | "close-drawer"
  | "delete-device"
  | "highlight-connections";

export type ShortcutConfig = {
  /** Shortcut key bindings — one per physical/logical binding */
  keys: [ShortcutKeyBinding, ...Array<ShortcutKeyBinding>];
  /** Display label */
  label: string;
  /** Longer description */
  description?: string;
  /** Logical scope (used for enabled conditions) */
  scope: ShortcutScope;
};

const deviceToolShortcuts = deviceKinds.reduce(
  (acc, kind) => {
    acc[kind.shortcut.action] = {
      keys: kind.shortcut.keys,
      label: kind.shortcut.label,
      description: kind.shortcut.description,
      scope: "canvas",
    };
    return acc;
  },
  {} as Record<DeviceToolShortcutAction, ShortcutConfig>,
);

export const shortcuts: Record<ShortcutAction, ShortcutConfig> = {
  // Global actions
  "toggle-edit-mode": {
    keys: ["E"],
    label: "Mode édition",
    description: "Basculer dans le mode édition",
    scope: "global",
  },
  escape: {
    keys: ["Escape"],
    label: "Annuler",
    description: "Annuler l'action en cours",
    scope: "global",
  },
  delete: {
    keys: ["Delete", "Backspace"],
    label: "Supprimer",
    description: "Supprimer l'élément sélectionné",
    scope: "global",
  },
  undo: {
    keys: ["Mod+Z"],
    label: "Annuler",
    description: "Annuler la dernière action",
    scope: "global",
  },
  redo: {
    keys: ["Mod+Shift+Z", "Mod+Y"],
    label: "Rétablir",
    description: "Rétablir l'action annulée",
    scope: "global",
  },
  "show-shortcuts": {
    keys: [{ key: "?", shift: true }],
    label: "Raccourcis",
    description: "Afficher la liste des raccourcis clavier",
    scope: "global",
  },
  "cycle-theme": {
    keys: ["Shift+T"],
    label: "Thème",
    description: "Changer le thème",
    scope: "global",
  },
  "sidebar-toggle": {
    keys: ["Mod+B"],
    label: "Sidebar",
    description: "Afficher/masquer le panneau latéral",
    scope: "global",
  },
  "toggle-wall-debug": {
    keys: [{ key: "D", shift: true }],
    label: "Debug murs",
    description: "Afficher/masquer le debug des murs",
    scope: "canvas",
  },

  // Navigation
  "zoom-in": {
    keys: [
      "Mod+=",
      { key: "=", mod: true, shift: true },
      { key: "+", code: "NumpadAdd", display: "Num +" },
    ],
    label: "Zoom +",
    description: "Zoomer",
    scope: "global",
  },
  "zoom-out": {
    keys: ["Mod+-", { key: "-", code: "NumpadSubtract", display: "Num -" }],
    label: "Zoom -",
    description: "Dézoomer",
    scope: "global",
  },
  "zoom-reset": {
    keys: ["Mod+0", { key: "0", code: "Numpad0", display: "Num 0" }],
    label: "Réinitialiser zoom",
    description: "Remettre le zoom à 100%",
    scope: "global",
  },
  "pan-up": {
    keys: ["ArrowUp"],
    label: "Haut",
    description: "Déplacer le canvas vers le haut",
    scope: "global",
  },
  "pan-down": {
    keys: ["ArrowDown"],
    label: "Bas",
    description: "Déplacer le canvas vers le bas",
    scope: "global",
  },
  "pan-left": {
    keys: ["ArrowLeft"],
    label: "Gauche",
    description: "Déplacer le canvas vers la gauche",
    scope: "global",
  },
  "pan-right": {
    keys: ["ArrowRight"],
    label: "Droite",
    description: "Déplacer le canvas vers la droite",
    scope: "global",
  },
  "floor-up": {
    keys: ["Mod+ArrowUp"],
    label: "Étage précédent",
    description: "Aller à l'étage précédent",
    scope: "global",
  },
  "floor-down": {
    keys: ["Mod+ArrowDown"],
    label: "Étage suivant",
    description: "Aller à l'étage suivant",
    scope: "global",
  },
  "cancel-wall-tool": {
    keys: ["Escape"],
    label: "Annuler outil",
    description: "Annuler l'outil de dessin en cours",
    scope: "canvas",
  },

  // Tools - Walls & Rooms (hotbar numbers + letter aliases)
  "tool-wall": {
    keys: ["1", "W"],
    label: "Mur",
    description: "Outil de dessin de mur",
    scope: "canvas",
  },
  "tool-room": {
    keys: ["2", "L"],
    label: "Salle",
    description: "Outil de dessin de salle",
    scope: "canvas",
  },
  "tool-wall-brush": {
    keys: ["3", "B"],
    label: "Pinceau murs",
    description: "Peindre des blocs de mur",
    scope: "canvas",
  },
  "tool-wall-erase": {
    keys: ["4", "X"],
    label: "Suppression murs",
    description: "Effacer des blocs de mur",
    scope: "canvas",
  },
  "wall-eraser-size-increase": {
    keys: [
      { key: "+", shift: true, display: "Shift +" },
      { key: "=", code: "Equal", shift: true, hiddenFromDisplay: true },
      {
        key: "+",
        code: "NumpadAdd",
        shift: true,
        display: "Shift Num +",
      },
    ],
    label: "Gomme +",
    description: "Agrandir la zone de gomme",
    scope: "canvas",
  },
  "wall-eraser-size-decrease": {
    keys: [
      { key: "-", shift: true, display: "Shift -" },
      { key: "_", shift: true, hiddenFromDisplay: true },
      { key: "_", code: "Minus", shift: true, hiddenFromDisplay: true },
      {
        key: "-",
        code: "NumpadSubtract",
        shift: true,
        display: "Shift Num -",
      },
    ],
    label: "Gomme -",
    description: "Réduire la zone de gomme",
    scope: "canvas",
  },

  // Tools - Devices (number hotbar)
  ...deviceToolShortcuts,

  // Device drawer
  "close-drawer": {
    keys: ["Escape"],
    label: "Fermer",
    description: "Fermer le panneau de détails",
    scope: "drawer",
  },
  "delete-device": {
    keys: ["Delete", "Backspace"],
    label: "Supprimer",
    description: "Supprimer l'appareil sélectionné",
    scope: "drawer",
  },
  "highlight-connections": {
    keys: ["H"],
    label: "Connexions",
    description: "Afficher/masquer les connexions",
    scope: "global",
  },
};

/**
 * Detect if the current platform is macOS
 */
export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/**
 * Format a hotkey string for display
 * Parses TanStack key format (Mod+Shift+Z) into platform-appropriate symbols.
 */
function formatHotkeyPart(part: string): string {
  switch (part) {
    case "Meta":
      return "⌘";
    case "Mod":
      return isMac ? "⌘" : "Ctrl";
    case "Control":
      return isMac ? "⌃" : "Ctrl";
    case "Alt":
      return isMac ? "⌥" : "Alt";
    case "Shift":
      return isMac ? "⇧" : "Shift";
    case "Escape":
      return "esc";
    case "Delete":
    case "Backspace":
      return "⌫";
    case "Enter":
      return "↵";
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    case "Space":
      return "␣";
    case "=":
    case "Add":
      return "+";
    case "Subtract":
      return "-";
    default:
      return part;
  }
}

export function formatHotkey(hotkey: ShortcutKeyBinding): Array<string> {
  if (typeof hotkey === "string") {
    const parts = hotkey.split("+");
    return parts.map(formatHotkeyPart);
  }

  if (hotkey.display) {
    return [hotkey.display];
  }

  const result: Array<string> = [];

  if (hotkey.mod) {
    result.push(formatHotkeyPart("Mod"));
  }
  if (hotkey.ctrl) {
    result.push(formatHotkeyPart("Control"));
  }
  if (hotkey.alt) {
    result.push(formatHotkeyPart("Alt"));
  }
  if (hotkey.shift) {
    result.push(formatHotkeyPart("Shift"));
  }
  if (hotkey.meta) {
    result.push(formatHotkeyPart("Meta"));
  }

  result.push(formatHotkeyPart(hotkey.key));

  return result;
}

/**
 * Get formatted display for all key bindings of an action
 */
export function getShortcutDisplay(
  action: ShortcutAction,
): Array<Array<string>> {
  const config = shortcuts[action];
  const seen = new Set<string>();

  return config.keys
    .filter((hotkey) => {
      return typeof hotkey === "string" || !hotkey.hiddenFromDisplay;
    })
    .map(formatHotkey)
    .filter((combo) => {
      const id = combo.join("+");
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
}
