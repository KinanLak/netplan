import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import { useCanEdit } from "@/hooks/use-current-user";
import { useConnectionStore } from "@/store/useConnectionStore";

/**
 * What the map says when there is no floor to draw on: Éditeurs get the way
 * in, others learn who can give them one (ADR 0026).
 */
export function MapEmptyState({
  siteId,
  building,
}: {
  siteId: string;
  building: { id: string; name: string } | null;
}) {
  const canEdit = useCanEdit();
  // Structure edits pause with the map's while the connection is lost.
  const isMapFrozen = useConnectionStore((state) => state.isMapFrozen);
  const open = useStructureDialog((state) => state.open);

  const [title, detail, action] = building
    ? [
        `${building.name} n'a aucun étage`,
        canEdit
          ? "Ajoutez un étage pour dessiner son plan."
          : "Un éditeur peut lui ajouter un étage.",
        {
          label: "Ajouter un étage",
          run: () =>
            open({
              kind: "add-floor",
              buildingId: building.id,
              buildingName: building.name,
            }),
        },
      ]
    : [
        "Aucun bâtiment sur ce site",
        canEdit
          ? "Créez un premier bâtiment et son étage pour dessiner le plan."
          : "Un éditeur peut créer le premier bâtiment de ce site.",
        {
          label: "Créer un bâtiment",
          run: () => open({ kind: "create-building", siteId }),
        },
      ];

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 text-center shadow-lg">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {canEdit ? (
          <Button onClick={action.run} disabled={isMapFrozen}>
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} />
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
