import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import { useCanEditSite } from "@/sites/useCurrentSite";
import { useConnectionStore } from "@/store/useConnectionStore";

/**
 * The way in when there is no floor to draw on, for those who may take it;
 * a Lecteur sees the empty plan (ADR 0041).
 */
export function MapEmptyState({
  siteId,
  building,
}: {
  siteId: string;
  building: { id: string; name: string } | null;
}) {
  const canEdit = useCanEditSite();
  // Structure edits pause with the map's while the connection is lost.
  const isMapFrozen = useConnectionStore((state) => state.isMapFrozen);
  const open = useStructureDialog((state) => state.open);
  if (!canEdit) return null;

  const action = building
    ? {
        label: "Ajouter un étage",
        run: () =>
          open({
            kind: "add-floor",
            buildingId: building.id,
            buildingName: building.name,
          }),
      }
    : {
        label: "Créer un bâtiment",
        run: () => open({ kind: "create-building", siteId }),
      };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <Button
        className="pointer-events-auto shadow-lg"
        onClick={action.run}
        disabled={isMapFrozen}
      >
        <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} />
        {action.label}
      </Button>
    </div>
  );
}
