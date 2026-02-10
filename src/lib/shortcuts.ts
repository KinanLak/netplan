/**
 * Keyboard shortcuts configuration for NetPlan
 *
 * Uses react-hotkeys-hook string format:
 * - Modifiers: meta (Cmd on Mac), alt, shift, ctrl
 * - Use 'mod' for cross-platform (Cmd on Mac, Ctrl on Windows)
 * - Combine with '+': 'meta+z', 'ctrl+shift+s'
 * - Multiple keys: 'delete, backspace' or ['delete', 'backspace']
 */

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
  /** Hotkey string(s) in react-hotkeys-hook format */
  hotkey: string | Array<string>;
  /** Display label */
  label: string;
  /** Longer description */
  description?: string;
  /** Scope for activation */
  scope: ShortcutScope;
};

export const shortcuts: Record<ShortcutAction, ShortcutConfig> = {
  // Global actions
  "toggle-edit-mode": {
    hotkey: "e",
    label: "Mode édition",
    description: "Activer/désactiver le mode édition",
    scope: "global",
  },
  escape: {
    hotkey: "escape",
    label: "Annuler",
    description: "Désélectionner ou annuler l'action en cours",
    scope: "global",
  },
  delete: {
    hotkey: ["delete", "backspace"],
    label: "Supprimer",
    description: "Supprimer l'élément sélectionné",
    scope: "global",
  },
  undo: {
    hotkey: "meta+z",
    label: "Annuler",
    description: "Annuler la dernière action",
    scope: "global",
  },
  redo: {
    hotkey: ["meta+shift+z", "meta+y"],
    label: "Rétablir",
    description: "Rétablir l'action annulée",
    scope: "global",
  },
  "show-shortcuts": {
    hotkey: "shift+?",
    label: "Raccourcis",
    description: "Afficher la liste des raccourcis clavier",
    scope: "global",
  },
  "cycle-theme": {
    hotkey: "shift+t",
    label: "Thème",
    description: "Changer le thème (clair/sombre/système)",
    scope: "global",
  },

  // Navigation
  "zoom-in": {
    hotkey: ["=", "+"],
    label: "Zoom +",
    description: "Zoomer",
    scope: "canvas",
  },
  "zoom-out": {
    hotkey: "-",
    label: "Zoom -",
    description: "Dézoomer",
    scope: "canvas",
  },
  "zoom-reset": {
    hotkey: "0",
    label: "Réinitialiser zoom",
    description: "Remettre le zoom à 100%",
    scope: "canvas",
  },
  "pan-up": {
    hotkey: "up",
    label: "Haut",
    description: "Déplacer le canvas vers le haut",
    scope: "canvas",
  },
  "pan-down": {
    hotkey: "down",
    label: "Bas",
    description: "Déplacer le canvas vers le bas",
    scope: "canvas",
  },
  "pan-left": {
    hotkey: "left",
    label: "Gauche",
    description: "Déplacer le canvas vers la gauche",
    scope: "canvas",
  },
  "pan-right": {
    hotkey: "right",
    label: "Droite",
    description: "Déplacer le canvas vers la droite",
    scope: "canvas",
  },
  "floor-up": {
    hotkey: "ctrl+up",
    label: "Étage supérieur",
    description: "Aller à l'étage supérieur",
    scope: "global",
  },
  "floor-down": {
    hotkey: "ctrl+down",
    label: "Étage inférieur",
    description: "Aller à l'étage inférieur",
    scope: "global",
  },
  // Floor shortcuts - supporting both QWERTY and AZERTY layouts
  "floor-1": {
    hotkey: ["ctrl+1", "ctrl+&"],
    label: "Étage 1",
    description: "Aller à l'étage 1",
    scope: "global",
  },
  "floor-2": {
    hotkey: ["ctrl+2", "ctrl+é"],
    label: "Étage 2",
    description: "Aller à l'étage 2",
    scope: "global",
  },
  "floor-3": {
    hotkey: ["ctrl+3", "ctrl+\""],
    label: "Étage 3",
    description: "Aller à l'étage 3",
    scope: "global",
  },
  "floor-4": {
    hotkey: ["ctrl+4", "ctrl+'"],
    label: "Étage 4",
    description: "Aller à l'étage 4",
    scope: "global",
  },
  "floor-5": {
    hotkey: ["ctrl+5", "ctrl+("],
    label: "Étage 5",
    description: "Aller à l'étage 5",
    scope: "global",
  },
  "floor-6": {
    hotkey: ["ctrl+6", "ctrl+-"],
    label: "Étage 6",
    description: "Aller à l'étage 6",
    scope: "global",
  },
  "floor-7": {
    hotkey: ["ctrl+7", "ctrl+è"],
    label: "Étage 7",
    description: "Aller à l'étage 7",
    scope: "global",
  },
  "floor-8": {
    hotkey: ["ctrl+8", "ctrl+_"],
    label: "Étage 8",
    description: "Aller à l'étage 8",
    scope: "global",
  },
  "floor-9": {
    hotkey: ["ctrl+9", "ctrl+ç"],
    label: "Étage 9",
    description: "Aller à l'étage 9",
    scope: "global",
  },

  // Tools - Walls & Rooms (supporting letter + number + AZERTY)
  "tool-wall": {
    hotkey: ["w", "1", "&"],
    label: "Mur",
    description: "Outil de dessin de mur",
    scope: "canvas",
  },
  "tool-room": {
    hotkey: ["l", "2", "é"],
    label: "Salle",
    description: "Outil de dessin de salle",
    scope: "canvas",
  },

  // Tools - Devices
  "tool-rack": {
    hotkey: ["r", "3", "\""],
    label: "Rack",
    description: "Ajouter un rack serveur",
    scope: "canvas",
  },
  "tool-switch": {
    hotkey: ["s", "4", "'"],
    label: "Switch",
    description: "Ajouter un switch réseau",
    scope: "canvas",
  },
  "tool-pc": {
    hotkey: ["p", "5", "("],
    label: "PC",
    description: "Ajouter un poste de travail",
    scope: "canvas",
  },
  "tool-wall-port": {
    hotkey: ["o", "6", "-"],
    label: "Prise",
    description: "Ajouter une prise murale",
    scope: "canvas",
  },

  // Device drawer
  "close-drawer": {
    hotkey: "escape",
    label: "Fermer",
    description: "Fermer le panneau de détails",
    scope: "drawer",
  },
  "delete-device": {
    hotkey: ["delete", "backspace"],
    label: "Supprimer",
    description: "Supprimer l'appareil sélectionné",
    scope: "drawer",
  },
  "highlight-connections": {
    hotkey: "h",
    label: "Connexions",
    description: "Afficher/masquer les connexions",
    scope: "drawer",
  },
};

/**
 * Format a hotkey string for display (macOS style)
 * Converts 'meta+shift+z' to ['⌘', '⇧', 'Z']
 */
export function formatHotkey(hotkey: string): Array<string> {
  const parts = hotkey.toLowerCase().split("+");
  const result: Array<string> = [];

  for (const part of parts) {
    switch (part) {
      case "meta":
      case "mod":
        result.push("⌘");
        break;
      case "ctrl":
        result.push("⌃");
        break;
      case "alt":
        result.push("⌥");
        break;
      case "shift":
        result.push("⇧");
        break;
      case "escape":
        result.push("esc");
        break;
      case "delete":
      case "backspace":
        result.push("⌫");
        break;
      case "enter":
        result.push("↵");
        break;
      case "up":
        result.push("↑");
        break;
      case "down":
        result.push("↓");
        break;
      case "left":
        result.push("←");
        break;
      case "right":
        result.push("→");
        break;
      case "space":
        result.push("␣");
        break;
      case "plus":
      case "=":
        result.push("+");
        break;
      default:
        result.push(part.toUpperCase());
    }
  }

  return result;
}

/**
 * Get formatted display for the first hotkey of an action
 */
export function getShortcutDisplay(action: ShortcutAction): Array<Array<string>> {
  const config = shortcuts[action];
  const hotkeys = Array.isArray(config.hotkey)
    ? config.hotkey
    : [config.hotkey];
  return hotkeys.map(formatHotkey);
}

/**
 * Get the hotkey string(s) for an action
 */
export function getHotkey(action: ShortcutAction): string | Array<string> {
  return shortcuts[action].hotkey;
}

/**
 * Get the scope for an action
 */
export function getScope(action: ShortcutAction): ShortcutScope {
  return shortcuts[action].scope;
}
