import { useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, WasteIcon } from "@hugeicons/core-free-icons";
import { WALL_COLOR_TONES } from "@/lib/walls";
import { useMapStore } from "@/store/useMapStore";
import { useDrawerScope, useShortcut } from "@/hooks/use-shortcuts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

export default function WallDrawer() {
  const { walls, selectedWallId, selectWall, deleteWall, isEditMode } =
    useMapStore();

  const wall = walls.find((segment) => segment.id === selectedWallId);

  const handleCloseDrawer = useCallback(() => {
    selectWall(null);
  }, [selectWall]);

  // Manage drawer scope - enables drawer shortcuts when open
  useDrawerScope(!!wall);

  // Register keyboard shortcuts
  useShortcut("close-drawer", handleCloseDrawer);

  if (!wall) {
    return null;
  }

  const isHorizontal = wall.start.y === wall.end.y;
  const orientation = isHorizontal ? "Horizontal" : "Vertical";
  const length = isHorizontal
    ? Math.abs(wall.end.x - wall.start.x)
    : Math.abs(wall.end.y - wall.start.y);
  const tone = WALL_COLOR_TONES[wall.color];

  return (
    <aside className="absolute top-0 right-0 z-20 flex h-full w-80 flex-col border-l border-border bg-card shadow-xl">
      <header className="space-y-3 bg-linear-to-t from-muted to-card px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-foreground">
              Segment de mur
            </h2>
            <p className="text-sm text-muted-foreground">{orientation}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCloseDrawer}
            className="flex h-8 items-center gap-1.5 px-2"
          >
            <Kbd>esc</Kbd>
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={18}
              color="currentColor"
              strokeWidth={1.5}
            />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span
            className="h-4 w-4 rounded-full border"
            style={{ backgroundColor: tone.fill, borderColor: tone.stroke }}
          />
          <span className="text-muted-foreground">{tone.label}</span>
        </div>
      </header>

      <div className="flex-1 space-y-4 px-4 py-4">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Géométrie
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Départ</span>
              <span className="font-mono text-foreground">
                {wall.start.x}, {wall.start.y}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Arrivée</span>
              <span className="font-mono text-foreground">
                {wall.end.x}, {wall.end.y}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Longueur</span>
              <span className="font-mono text-foreground">{length}px</span>
            </div>
          </div>
        </section>
      </div>

      {isEditMode && (
        <footer className="space-y-2 border-t border-border bg-muted p-4">
          <Button
            variant="destructive"
            onClick={() => {
              deleteWall(wall.id);
              selectWall(null);
            }}
            className="w-full gap-2"
          >
            <HugeiconsIcon
              icon={WasteIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
            Supprimer
          </Button>
        </footer>
      )}
    </aside>
  );
}
