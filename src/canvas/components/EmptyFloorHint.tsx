import { HugeiconsIcon } from "@hugeicons/react";
import {
  Layers01Icon,
  PackageIcon,
  SquareIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useCanEdit } from "@/hooks/use-current-user";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import { useIsEditMode } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";

/**
 * Where to start on a floor with nothing on it (A25): draw a room, place a
 * device, or import a calque. A Lecteur only learns that it is empty.
 */
export function EmptyFloorHint() {
  const { document } = useMapDocumentData();
  const canEdit = useCanEdit();
  const isEditMode = useIsEditMode();
  const toggleEditMode = useMapStore((s) => s.toggleEditMode);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const setPlacePanelOpen = useMapStore((s) => s.setPlacePanelOpen);
  const setOverlayPanelOpen = useMapStore((s) => s.setOverlayPanelOpen);

  // Once one of its actions is under way, the card stays out of the way.
  const isBusy = useMapStore(
    (s) =>
      s.activeDrawTool !== "device" ||
      s.isLabelToolActive ||
      s.isPlacePanelOpen ||
      s.isOverlayPanelOpen,
  );

  const isEmpty =
    !isBusy &&
    document.devices.length === 0 &&
    document.walls.length === 0 &&
    document.labels.length === 0 &&
    document.overlay?.floorId !== document.floorId;
  if (!isEmpty) return null;

  const inEditMode = (run: () => void) => () => {
    if (!isEditMode) toggleEditMode();
    run();
  };
  const actions = [
    {
      label: "Dessiner une salle",
      icon: SquareIcon,
      run: inEditMode(() => setActiveDrawTool("room")),
    },
    {
      label: "Placer un équipement",
      icon: PackageIcon,
      run: inEditMode(() => setPlacePanelOpen(true)),
    },
    {
      label: "Importer un calque",
      icon: Layers01Icon,
      run: inEditMode(() => setOverlayPanelOpen(true)),
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4 text-center text-sm shadow-md">
        <p className="text-muted-foreground">Cet étage est encore vide.</p>
        {canEdit ? (
          <div className="flex flex-wrap justify-center gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                size="sm"
                onClick={action.run}
              >
                <HugeiconsIcon icon={action.icon} strokeWidth={2} />
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
