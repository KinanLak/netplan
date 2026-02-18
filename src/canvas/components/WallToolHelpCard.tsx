import { HugeiconsIcon } from "@hugeicons/react";
import { MouseRightClick04Icon } from "@hugeicons/core-free-icons";
import { Kbd } from "@/components/ui/kbd";

interface WallToolHelpCardProps {
  isVisible: boolean;
  drawMessage: string | null;
}

export function WallToolHelpCard({
  isVisible,
  drawMessage,
}: WallToolHelpCardProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 z-20 max-w-80 rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <Kbd>Esc</Kbd>
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
