import { HugeiconsIcon } from "@hugeicons/react";
import { MouseRightClick04Icon } from "@hugeicons/core-free-icons";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { useSelectedDeviceId } from "@/store/selectors";
import type { DrawTool } from "@/types/map";

/** One short line on each tool's gesture, and nothing more (A14). */
const GESTURES: Record<Exclude<DrawTool, "device">, string> = {
  wall: "Glissez ou cliquez d'un bout du mur à l'autre.",
  room: "Glissez ou cliquez d'un coin au coin opposé.",
  "wall-brush": "Glissez pour peindre des murs.",
  "wall-erase": "Glissez sur les murs à supprimer.",
};

interface WallToolHelpCardProps {
  isVisible: boolean;
  tool: DrawTool;
  drawMessage: string | null;
}

export function WallToolHelpCard({
  isVisible,
  tool,
  drawMessage,
}: WallToolHelpCardProps) {
  const hasRightDrawerOpen = useSelectedDeviceId() !== null;
  if (!isVisible || tool === "device") {
    return null;
  }

  return (
    <div
      className={cn(
        // Under the map's top bar, which may span the whole width (A14).
        "absolute top-18 z-20 max-w-80 rounded-md border bg-card px-3 py-2 text-xs shadow-md",
        hasRightDrawerOpen ? "right-4 md:right-84" : "right-4",
      )}
    >
      <p className="mb-1 text-foreground">{GESTURES[tool]}</p>
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <Kbd>Échap</Kbd>
        <span>ou</span>
        <HugeiconsIcon
          icon={MouseRightClick04Icon}
          size={18}
          color="currentColor"
          strokeWidth={1.8}
        />
        <span>pour quitter</span>
      </div>
      {drawMessage ? (
        <p className="mt-1 text-destructive">{drawMessage}</p>
      ) : null}
    </div>
  );
}
