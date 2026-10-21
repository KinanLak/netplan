/** What stands on a floor, or on every floor of a building. */
export interface StructureContent {
  devices: number;
  wallBlocks: number;
  overlays: number;
}

export const EMPTY_CONTENT: StructureContent = {
  devices: 0,
  wallBlocks: 0,
  overlays: 0,
};

export const isEmptyContent = (content: StructureContent): boolean =>
  content.devices === 0 && content.wallBlocks === 0 && content.overlays === 0;

export const addContent = (
  a: StructureContent,
  b: StructureContent,
): StructureContent => ({
  devices: a.devices + b.devices,
  wallBlocks: a.wallBlocks + b.wallBlocks,
  overlays: a.overlays + b.overlays,
});

const counted = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * "9 équipements, 34 blocs de mur et 1 calque", or null when empty: what a
 * user must take off before the floor or building can go.
 */
export function describeContent(content: StructureContent): string | null {
  const parts = [
    content.devices > 0 &&
      counted(content.devices, "équipement", "équipements"),
    content.wallBlocks > 0 &&
      counted(content.wallBlocks, "bloc de mur", "blocs de mur"),
    content.overlays > 0 && counted(content.overlays, "calque", "calques"),
  ].filter((part) => typeof part === "string");
  if (parts.length === 0) return null;
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;
}
