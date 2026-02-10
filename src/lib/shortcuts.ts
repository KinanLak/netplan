/**
 * Keyboard shortcuts configuration for NetPlan
 *
 * Each action can have multiple shortcuts.
 * Key names follow the standard KeyboardEvent.key values:
 * - Modifiers: Meta (Cmd on Mac), Alt (Option on Mac), Shift, Control
 * - Letters: a-z (lowercase)
 * - Special: Escape, Backspace, Delete, Enter, ArrowUp, ArrowDown, etc.
 */

export type ShortcutKey = {
  key: string;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  ctrl?: boolean;
};

export type ShortcutAction =
  // Global
  | "toggle-edit-mode"
  | "escape"
  | "delete"
  | "undo"
  | "redo"
  | "show-shortcuts"
  | "cycle-theme"
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
  | "floor-1"
  | "floor-2"
  | "floor-3"
  | "floor-4"
  | "floor-5"
  | "floor-6"
  | "floor-7"
  | "floor-8"
  | "floor-9"
  // Tools
  | "tool-wall"
  | "tool-room"
  | "tool-rack"
  | "tool-switch"
  | "tool-pc"
  | "tool-wall-port"
  // Device drawer
  | "close-drawer"
  | "delete-device"
  | "highlight-connections";

export type ShortcutConfig = {
  keys: Array<ShortcutKey>;
  label: string;
  description?: string;
  scope?: "global" | "canvas" | "drawer";
};

export const shortcuts: Record<ShortcutAction, ShortcutConfig> = {
  // Global actions
  "toggle-edit-mode": {
    keys: [{ key: "e" }],
    label: "Mode édition",
    description: "Activer/désactiver le mode édition",
    scope: "global",
  },
  escape: {
    keys: [{ key: "Escape" }],
    label: "Annuler",
    description: "Désélectionner ou annuler l'action en cours",
    scope: "global",
  },
  delete: {
    keys: [{ key: "Delete" }, { key: "Backspace" }],
    label: "Supprimer",
    description: "Supprimer l'élément sélectionné",
    scope: "global",
  },
  undo: {
    keys: [{ key: "z", meta: true }],
    label: "Annuler",
    description: "Annuler la dernière action",
    scope: "global",
  },
  redo: {
    keys: [
      { key: "z", meta: true, shift: true },
      { key: "y", meta: true },
    ],
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
    keys: [{ key: "t", shift: true }],
    label: "Thème",
    description: "Changer le thème (clair/sombre/système)",
    scope: "global",
  },

  // Navigation
  "zoom-in": {
    keys: [{ key: "+" }, { key: "=" }],
    label: "Zoom +",
    description: "Zoomer",
    scope: "canvas",
  },
  "zoom-out": {
    keys: [{ key: "-" }],
    label: "Zoom -",
    description: "Dézoomer",
    scope: "canvas",
  },
  "zoom-reset": {
    keys: [{ key: "0" }],
    label: "Réinitialiser zoom",
    description: "Remettre le zoom à 100%",
    scope: "canvas",
  },
  "pan-up": {
    keys: [{ key: "ArrowUp" }],
    label: "Haut",
    description: "Déplacer le canvas vers le haut",
    scope: "canvas",
  },
  "pan-down": {
    keys: [{ key: "ArrowDown" }],
    label: "Bas",
    description: "Déplacer le canvas vers le bas",
    scope: "canvas",
  },
  "pan-left": {
    keys: [{ key: "ArrowLeft" }],
    label: "Gauche",
    description: "Déplacer le canvas vers la gauche",
    scope: "canvas",
  },
  "pan-right": {
    keys: [{ key: "ArrowRight" }],
    label: "Droite",
    description: "Déplacer le canvas vers la droite",
    scope: "canvas",
  },
  "floor-up": {
    keys: [{ key: "ArrowUp", ctrl: true }],
    label: "Étage supérieur",
    description: "Aller à l'étage supérieur",
    scope: "global",
  },
  "floor-down": {
    keys: [{ key: "ArrowDown", ctrl: true }],
    label: "Étage inférieur",
    description: "Aller à l'étage inférieur",
    scope: "global",
  },
  "floor-1": {
    keys: [
      { key: "1", ctrl: true },
      { key: "&", ctrl: true },
    ],
    label: "Étage 1",
    description: "Aller à l'étage 1",
    scope: "global",
  },
  "floor-2": {
    keys: [
      { key: "2", ctrl: true },
      { key: "é", ctrl: true },
    ],
    label: "Étage 2",
    description: "Aller à l'étage 2",
    scope: "global",
  },
  "floor-3": {
    keys: [
      { key: "3", ctrl: true },
      { key: '"', ctrl: true },
    ],
    label: "Étage 3",
    description: "Aller à l'étage 3",
    scope: "global",
  },
  "floor-4": {
    keys: [
      { key: "4", ctrl: true },
      { key: "'", ctrl: true },
    ],
    label: "Étage 4",
    description: "Aller à l'étage 4",
    scope: "global",
  },
  "floor-5": {
    keys: [
      { key: "5", ctrl: true },
      { key: "(", ctrl: true },
    ],
    label: "Étage 5",
    description: "Aller à l'étage 5",
    scope: "global",
  },
  "floor-6": {
    keys: [
      { key: "6", ctrl: true },
      { key: "-", ctrl: true },
    ],
    label: "Étage 6",
    description: "Aller à l'étage 6",
    scope: "global",
  },
  "floor-7": {
    keys: [
      { key: "7", ctrl: true },
      { key: "è", ctrl: true },
    ],
    label: "Étage 7",
    description: "Aller à l'étage 7",
    scope: "global",
  },
  "floor-8": {
    keys: [
      { key: "8", ctrl: true },
      { key: "_", ctrl: true },
    ],
    label: "Étage 8",
    description: "Aller à l'étage 8",
    scope: "global",
  },
  "floor-9": {
    keys: [
      { key: "9", ctrl: true },
      { key: "ç", ctrl: true },
    ],
    label: "Étage 9",
    description: "Aller à l'étage 9",
    scope: "global",
  },

  // Tools - Walls & Rooms
  "tool-wall": {
    keys: [{ key: "w" }, { key: "1" }, { key: "&" }],
    label: "Mur",
    description: "Outil de dessin de mur",
    scope: "canvas",
  },
  "tool-room": {
    keys: [{ key: "l" }, { key: "2" }, { key: "é" }],
    label: "Salle",
    description: "Outil de dessin de salle",
    scope: "canvas",
  },

  // Tools - Devices
  "tool-rack": {
    keys: [{ key: "r" }, { key: "3" }, { key: '"' }],
    label: "Rack",
    description: "Ajouter un rack serveur",
    scope: "canvas",
  },
  "tool-switch": {
    keys: [{ key: "s" }, { key: "4" }, { key: "'" }],
    label: "Switch",
    description: "Ajouter un switch réseau",
    scope: "canvas",
  },
  "tool-pc": {
    keys: [{ key: "p" }, { key: "5" }, { key: "(" }],
    label: "PC",
    description: "Ajouter un poste de travail",
    scope: "canvas",
  },
  "tool-wall-port": {
    keys: [{ key: "o" }, { key: "6" }, { key: "-" }],
    label: "Prise",
    description: "Ajouter une prise murale",
    scope: "canvas",
  },

  // Device drawer
  "close-drawer": {
    keys: [{ key: "Escape" }],
    label: "Fermer",
    description: "Fermer le panneau de détails",
    scope: "drawer",
  },
  "delete-device": {
    keys: [{ key: "Delete" }, { key: "Backspace" }],
    label: "Supprimer",
    description: "Supprimer l'appareil sélectionné",
    scope: "drawer",
  },
  "highlight-connections": {
    keys: [{ key: "h" }],
    label: "Connexions",
    description: "Afficher/masquer les connexions",
    scope: "drawer",
  },
};

/**
 * Check if a keyboard event matches a shortcut key
 * If ignoreAlt is true, the Alt key state is not checked (allows shortcuts to work while Option is held)
 */
export function matchesShortcut(
  event: KeyboardEvent,
  shortcutKey: ShortcutKey,
  ignoreAlt = false,
): boolean {
  const keyMatches =
    event.key.toLowerCase() === shortcutKey.key.toLowerCase() ||
    event.key === shortcutKey.key;

  const metaMatches = shortcutKey.meta ? event.metaKey : !event.metaKey;
  // Alt is only checked strictly if the shortcut requires it, otherwise we allow it
  const altMatches = shortcutKey.alt
    ? event.altKey
    : ignoreAlt || !event.altKey;
  const shiftMatches = shortcutKey.shift ? event.shiftKey : !event.shiftKey;
  const ctrlMatches = shortcutKey.ctrl ? event.ctrlKey : !event.ctrlKey;

  return keyMatches && metaMatches && altMatches && shiftMatches && ctrlMatches;
}

/**
 * Check if an event matches any of the shortcuts for an action
 * If ignoreAlt is true, shortcuts without Alt modifier can still trigger when Alt is held
 */
export function matchesAction(
  event: KeyboardEvent,
  action: ShortcutAction,
  ignoreAlt = false,
): boolean {
  const config = shortcuts[action];
  return config.keys.some((key) => matchesShortcut(event, key, ignoreAlt));
}

/**
 * Format a shortcut key for display (macOS style)
 */
export function formatShortcutKey(shortcutKey: ShortcutKey): Array<string> {
  const parts: Array<string> = [];

  if (shortcutKey.ctrl) parts.push("⌃");
  if (shortcutKey.alt) parts.push("⌥");
  if (shortcutKey.shift) parts.push("⇧");
  if (shortcutKey.meta) parts.push("⌘");

  // Format the main key
  const keyMap: Record<string, string> = {
    Escape: "esc",
    Delete: "⌫",
    Backspace: "⌫",
    Enter: "↵",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    " ": "␣",
  };

  const displayKey = keyMap[shortcutKey.key] ?? shortcutKey.key.toUpperCase();
  parts.push(displayKey);

  return parts;
}

/**
 * Get the first shortcut keys for an action (for display)
 */
export function getShortcutDisplay(
  action: ShortcutAction,
): Array<Array<string>> {
  const config = shortcuts[action];
  return config.keys.map(formatShortcutKey);
}
