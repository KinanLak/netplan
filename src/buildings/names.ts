// Building and floor names, checked alike by the dialogs and the server.

export const STRUCTURE_NAME_LIMIT = 60;

export type StructureKind = "building" | "floor";

const OF: Record<StructureKind, string> = {
  building: "du bâtiment",
  floor: "de l'étage",
};

export const normalizeStructureName = (name: string): string =>
  name.trim().replace(/\s+/g, " ");

/** Why a normalized name cannot be used, or null. */
export const structureNameError = (
  kind: StructureKind,
  name: string,
): string | null => {
  if (!name) return `Le nom ${OF[kind]} est obligatoire.`;
  if (name.length > STRUCTURE_NAME_LIMIT) {
    return `Le nom ${OF[kind]} dépasse ${STRUCTURE_NAME_LIMIT} caractères.`;
  }
  return null;
};

// "Étage 1" and "étage 1" would read as the same floor in the sidebar.
const collator = new Intl.Collator("fr", { sensitivity: "base" });

export const sameStructureName = (a: string, b: string): boolean =>
  collator.compare(a, b) === 0;
