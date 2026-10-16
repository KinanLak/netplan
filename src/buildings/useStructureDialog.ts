import { create } from "zustand";
import type { StructureKind } from "@/buildings/names";

/** What an Éditeur asked to do to the site's buildings and floors. */
export type StructureAction =
  | { kind: "create-building"; siteId: string }
  | { kind: "add-floor"; buildingId: string; buildingName: string }
  | { kind: "rename"; target: StructureKind; id: string; name: string }
  | { kind: "remove"; target: StructureKind; id: string; name: string };

/**
 * The open building or floor dialog, shared so the sidebar and the empty map
 * open the same one.
 */
export const useStructureDialog = create<{
  action: StructureAction | null;
  open: (action: StructureAction) => void;
  close: () => void;
}>((set) => ({
  action: null,
  open: (action) => set({ action }),
  close: () => set({ action: null }),
}));
