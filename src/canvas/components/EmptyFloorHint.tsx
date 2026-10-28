import { HugeiconsIcon } from "@hugeicons/react";
import { useCanEditSite } from "@/sites/useCurrentSite";
import {
  Layers01Icon,
  PackageIcon,
  SquareIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import { useIsEditMode } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";

/**
 * Where to start on a floor with nothing on it (A25): draw a room, place a
 * device, or import a calque. A Lecteur sees the empty plan (ADR 0041).
 */
export function EmptyFloorHint() {
  const { document } = useMapDocumentData();
  const canEdit = useCanEditSite();
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
  if (!isEmpty || !canEdit) return null;

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
      <div className="pointer-events-auto flex flex-wrap justify-center gap-2 rounded-lg border border-border bg-card p-4 shadow-md">
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
    </div>
  );
}
