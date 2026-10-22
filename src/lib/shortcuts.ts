/**
 * Keyboard shortcuts configuration for NetPlan
 *
 * Uses NetPlan's shortcut key format:
 * - Modifiers: Mod (Cmd on Mac, Ctrl on Windows), Control, Alt, Shift, Meta
 * - Combine with '+': 'Mod+Z', 'Mod+Shift+Z'
 * - Keys use event.key names: 'Escape', 'ArrowUp', 'Delete', 'Backspace'
 * - Single character keys also match physical event.code for letters, digits,
 *   and numpad digits so tool shortcuts survive layout changes.
 */

import type { ShortcutKeyBinding } from "@/lib/shortcut-types";

export type ShortcutScope = "global" | "canvas" | "drawer";

export type ShortcutAction =
  // Global
  | "toggle-edit-mode"
  | "escape"
  | "delete"
  | "nudge-selection"
  | "select-all"
  | "undo"
  | "redo"
  | "show-shortcuts"
  | "cycle-theme"
  | "refresh-site"
  | "sidebar-toggle"
  | "toggle-wall-debug"
  // Navigation
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset"
  | "fit-view"
  | "floor-up"
  | "floor-down"
  | "focus-device-search"
  | "find-device"
  | "cancel-wall-tool"
  // Tools - Walls (numbers + letter aliases)
  | "tool-wall"
  | "tool-wall-brush"
  | "tool-wall-erase"
  | "wall-eraser-size-increase"
  | "wall-eraser-size-decrease"
  | "tool-room"
  | "tool-label"
  | "place-device"
  // Calque
  | "toggle-overlay-panel"
  | "toggle-overlay-visibility"
  | "toggle-overlay-lock"
  | "calibrate-overlay"
  // Device drawer
  | "close-drawer"
  | "edit-device-identity"
  | "unplace-device"
  | "show-port-cables"
  | "show-device-history"
  | "toggle-device-cables";

export type ShortcutConfig = {
  /** Shortcut key bindings — one per physical/logical binding */
  keys: [ShortcutKeyBinding, ...Array<ShortcutKeyBinding>];
  /** Display label */
  label: string;
  /** Longer description */
  description?: string;
  /** Logical scope (used for enabled conditions) */
  scope: ShortcutScope;
  /**
   * Only for a role that may edit the map: a Lecteur neither triggers it nor
   * sees it in the shortcuts dialog (ADR 0030).
   */
  requiresEdit?: boolean;
  /**
   * With `requiresEdit`: the role is enough, even where the site is read
   * only (an archived site, ADR 0033). For what reads, not what changes.
   */
  byRoleOnly?: boolean;
};

export const shortcuts: Record<ShortcutAction, ShortcutConfig> = {
  // Global actions
  "toggle-edit-mode": {
    keys: ["E"],
    label: "Mode édition",
    description: "Basculer dans le mode édition",
    scope: "global",
    requiresEdit: true,
  },
  escape: {
    keys: ["Escape"],
    label: "Fermer",
    description: "Fermer, abandonner ou désélectionner",
    scope: "global",
  },
  delete: {
    keys: ["Delete", "Backspace"],
    label: "Retirer du plan",
    description:
      "Retirer la sélection du plan ; elle reste dans l'inventaire du site",
    scope: "global",
    requiresEdit: true,
  },
  "nudge-selection": {
    keys: [
      { key: "ArrowUp", display: "↑↓←→" },
      { key: "ArrowDown", hiddenFromDisplay: true },
      { key: "ArrowLeft", hiddenFromDisplay: true },
      { key: "ArrowRight", hiddenFromDisplay: true },
      { key: "ArrowUp", shift: true, hiddenFromDisplay: true },
      { key: "ArrowDown", shift: true, hiddenFromDisplay: true },
      { key: "ArrowLeft", shift: true, hiddenFromDisplay: true },
      { key: "ArrowRight", shift: true, hiddenFromDisplay: true },
    ],
    label: "Décaler",
    description: "Décaler la sélection d'une case (Shift : quatre)",
    scope: "global",
    requiresEdit: true,
  },
  "select-all": {
    keys: ["Mod+A"],
    label: "Tout sélectionner",
    description: "Sélectionner tous les équipements de l'étage",
    scope: "global",
    requiresEdit: true,
  },
  undo: {
    keys: ["Mod+Z"],
    label: "Annuler",
    description: "Annuler la dernière action",
    scope: "global",
    requiresEdit: true,
  },
  redo: {
    keys: ["Mod+Shift+Z", "Mod+Y"],
    label: "Rétablir",
    description: "Rétablir l'action annulée",
    scope: "global",
    requiresEdit: true,
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
    description: "Basculer entre thème clair et sombre",
    scope: "global",
  },
  "refresh-site": {
    keys: ["Shift+R"],
    label: "Actualiser les données",
    description: "Lancer une collecte du site maintenant",
    scope: "global",
    requiresEdit: true,
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
    requiresEdit: true,
  },

  // Navigation
  "zoom-in": {
    keys: [
      "Mod+=",
      { key: "=", mod: true, shift: true, hiddenFromDisplay: true },
      { key: "+", code: "NumpadAdd", hiddenFromDisplay: true },
    ],
    label: "Zoom +",
    description: "Zoomer",
    scope: "global",
  },
  "zoom-out": {
    keys: [
      "Mod+-",
      { key: "-", code: "NumpadSubtract", hiddenFromDisplay: true },
    ],
    label: "Zoom -",
    description: "Dézoomer",
    scope: "global",
  },
  "zoom-reset": {
    keys: ["Mod+0", { key: "0", code: "Numpad0", hiddenFromDisplay: true }],
    label: "Zoom 100 %",
    description: "Remettre le zoom à 100 % autour du centre",
    scope: "global",
  },
  "fit-view": {
    keys: [{ key: "1", code: "Digit1", shift: true }],
    label: "Centrer la vue",
    description: "Cadrer tout l'étage",
    scope: "global",
  },
  "focus-device-search": {
    keys: ["Mod+K"],
    label: "Rechercher",
    description: "Rechercher un équipement du site",
    scope: "global",
  },
  "find-device": {
    keys: ["Mod+F"],
    label: "Trouver sur le plan",
    description: "Trouver un équipement sur le plan par son nom",
    scope: "global",
  },
  "floor-up": {
    keys: ["Mod+ArrowUp"],
    label: "Étage au-dessus",
    description: "Monter d'un étage",
    scope: "global",
  },
  "floor-down": {
    keys: ["Mod+ArrowDown"],
    label: "Étage en dessous",
    description: "Descendre d'un étage",
    scope: "global",
  },
  "cancel-wall-tool": {
    keys: ["Escape"],
    label: "Annuler outil",
    description: "Annuler l'outil de dessin en cours",
    scope: "canvas",
    requiresEdit: true,
  },

  // Tools - Walls & Rooms (numbers + letter aliases)
  "tool-wall": {
    keys: ["1", "W"],
    label: "Mur",
    description: "Outil de dessin de mur",
    scope: "canvas",
    requiresEdit: true,
  },
  "tool-room": {
    keys: ["2", "L"],
    label: "Salle",
    description: "Outil de dessin de salle",
    scope: "canvas",
    requiresEdit: true,
  },
  "tool-wall-brush": {
    keys: ["3", "B"],
    label: "Pinceau murs",
    description: "Peindre des blocs de mur",
    scope: "canvas",
    requiresEdit: true,
  },
  "tool-wall-erase": {
    keys: ["4", "X"],
    label: "Suppression murs",
    description: "Effacer des blocs de mur",
    scope: "canvas",
    requiresEdit: true,
  },
  "tool-label": {
    keys: ["5", "T"],
    label: "Texte",
    description: "Poser une étiquette de texte sur le plan",
    scope: "canvas",
    requiresEdit: true,
  },
  "wall-eraser-size-increase": {
    keys: [
      { key: "+", shift: true },
      { key: "=", code: "Equal", shift: true, hiddenFromDisplay: true },
      { key: "+", code: "NumpadAdd", shift: true, hiddenFromDisplay: true },
    ],
    label: "Gomme +",
    description: "Agrandir la zone de gomme",
    scope: "canvas",
    requiresEdit: true,
  },
  "wall-eraser-size-decrease": {
    keys: [
      { key: "-", shift: true },
      { key: "_", shift: true, hiddenFromDisplay: true },
      { key: "_", code: "Minus", shift: true, hiddenFromDisplay: true },
      {
        key: "-",
        code: "NumpadSubtract",
        shift: true,
        hiddenFromDisplay: true,
      },
    ],
    label: "Gomme -",
    description: "Réduire la zone de gomme",
    scope: "canvas",
    requiresEdit: true,
  },

  "place-device": {
    keys: ["P"],
    label: "Placer un équipement",
    description: "Placer sur l'étage un équipement de l'inventaire",
    scope: "canvas",
    requiresEdit: true,
  },

  // Calque
  "toggle-overlay-panel": {
    keys: ["C"],
    label: "Calque",
    description: "Ouvrir/fermer le panneau du calque",
    scope: "canvas",
    requiresEdit: true,
  },
  "toggle-overlay-visibility": {
    keys: ["Shift+C"],
    label: "Afficher le calque",
    description: "Afficher/masquer le calque de l'étage",
    scope: "global",
  },
  "toggle-overlay-lock": {
    keys: ["Shift+L"],
    label: "Verrouiller le calque",
    description: "Verrouiller/déverrouiller le calque (panneau ouvert)",
    scope: "canvas",
    requiresEdit: true,
  },
  "calibrate-overlay": {
    keys: ["Shift+E"],
    label: "Étalonner le calque",
    description:
      "Mettre le calque à l'échelle par deux points (panneau ouvert)",
    scope: "canvas",
    requiresEdit: true,
  },

  // Device drawer
  "close-drawer": {
    keys: ["Escape"],
    label: "Fermer",
    description: "Fermer le panneau de détails",
    scope: "drawer",
  },
  "edit-device-identity": {
    keys: ["I"],
    label: "Identité",
    description: "Modifier le nom, les adresses et les notes de l'appareil",
    scope: "drawer",
    requiresEdit: true,
  },
  "unplace-device": {
    keys: ["U"],
    label: "Retirer du plan",
    description:
      "Retirer l'appareil du plan ; il reste dans l'inventaire du site",
    scope: "drawer",
    requiresEdit: true,
  },
  "show-port-cables": {
    keys: ["K"],
    label: "Ports et câbles",
    description: "Voir les câbles de chaque port et où ils mènent",
    scope: "drawer",
  },
  "show-device-history": {
    keys: ["J"],
    label: "Historique",
    description:
      "Voir où le réseau a vu l'appareil et quand il était en ligne, sur 30 jours",
    scope: "drawer",
    requiresEdit: true,
    byRoleOnly: true,
  },
  "toggle-device-cables": {
    keys: ["H"],
    label: "Câbles sur le plan",
    description:
      "Afficher ou masquer les câbles du switch ou du panneau de brassage sélectionné ou survolé",
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
      return "Échap";
    case "Delete":
      return "Suppr";
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
