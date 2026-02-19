import type { ShortcutAction } from "@/lib/shortcuts";

export type ShortcutGroup = {
  id: string;
  title: string;
  actions: Array<ShortcutAction>;
  orderPriority?: number;
};

export const shortcutGroups: Array<ShortcutGroup> = [
  {
    id: "general",
    title: "Général",
    orderPriority: 100,
    actions: [
      "undo",
      "redo",
      "toggle-edit-mode",
      "escape",
      "delete",
      "cycle-theme",
      "show-shortcuts",
    ],
  },
  {
    id: "device-tools",
    title: "Outils - Équipements",
    orderPriority: 90,
    actions: ["tool-rack", "tool-switch", "tool-pc", "tool-wall-port"],
  },
  {
    id: "device-drawer",
    title: "Panneau de détails",
    orderPriority: 80,
    actions: ["close-drawer", "delete-device", "highlight-connections"],
  },
  {
    id: "zoom",
    title: "Zoom",
    orderPriority: 70,
    actions: ["zoom-in", "zoom-out", "zoom-reset"],
  },
  {
    id: "build-tools",
    title: "Outils - Construction",
    orderPriority: 60,
    actions: ["tool-wall", "tool-room", "tool-wall-brush", "tool-wall-erase"],
  },
  {
    id: "floor-navigation",
    title: "Navigation étages",
    orderPriority: 50,
    actions: ["floor-up", "floor-down"],
  },
];

const GROUP_HEADER_WEIGHT = 1;

const compareGroups = (a: ShortcutGroup, b: ShortcutGroup): number => {
  const priorityDiff = (b.orderPriority ?? 0) - (a.orderPriority ?? 0);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const sizeDiff = b.actions.length - a.actions.length;
  if (sizeDiff !== 0) {
    return sizeDiff;
  }

  return a.title.localeCompare(b.title, "fr");
};

export const buildBalancedShortcutGrid = (
  groups: Array<ShortcutGroup>,
  columnCount = 2,
): Array<ShortcutGroup> => {
  if (columnCount <= 1) {
    return [...groups].sort(compareGroups);
  }

  const columns = Array.from({ length: columnCount }, () => ({
    groups: [] as Array<ShortcutGroup>,
    weight: 0,
  }));

  const sortedGroups = [...groups].sort(compareGroups);

  sortedGroups.forEach((group) => {
    const targetColumn = columns.reduce((lightest, column) =>
      column.weight < lightest.weight ? column : lightest,
    );

    targetColumn.groups.push(group);
    targetColumn.weight += group.actions.length + GROUP_HEADER_WEIGHT;
  });

  const rowCount = Math.max(
    ...columns.map((column) => column.groups.length),
    0,
  );
  const rowMajorGroups: Array<ShortcutGroup> = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const group = columns[columnIndex].groups.at(rowIndex);
      if (group) {
        rowMajorGroups.push(group);
      }
    }
  }

  return rowMajorGroups;
};
