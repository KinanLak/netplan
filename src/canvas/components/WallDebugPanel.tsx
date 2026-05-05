import type { ReactNode } from "react";
import type { DrawTool, Position } from "@/types/map";
import { WALL_GRID_OFFSET, GRID_SIZE } from "@/lib/walls";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { useSelectedWallColor } from "@/store/selectors";

interface WallDebugPanelProps {
  isVisible: boolean;
  activeDrawTool: DrawTool;
  pointerPosition: Position | null;
  hoverSnapPoint: Position | null;
  pointerSnapPoint: Position | null;
  drawAnchor: Position | null;
  lastWallStartPoint: Position | null;
  erasePreviewCount: number;
  drawMessage: string | null;
}

const formatNumber = (value: number): string => {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return value.toFixed(2);
};

const formatPoint = (point: Position | null): string => {
  if (!point) {
    return "n/a";
  }

  return `${formatNumber(point.x)}, ${formatNumber(point.y)}`;
};

const formatWallGrid = (point: Position | null): string => {
  if (!point) {
    return "n/a";
  }

  return `${formatNumber((point.x - WALL_GRID_OFFSET) / GRID_SIZE)}, ${formatNumber((point.y - WALL_GRID_OFFSET) / GRID_SIZE)}`;
};

const formatWallGridDelta = (
  from: Position | null,
  to: Position | null,
): string => {
  if (!from || !to) {
    return "n/a";
  }

  return `${formatNumber((to.x - from.x) / GRID_SIZE)}, ${formatNumber((to.y - from.y) / GRID_SIZE)}`;
};

const toToolLabel = (tool: DrawTool): string => {
  switch (tool) {
    case "wall":
      return "Mur";
    case "room":
      return "Salle";
    case "wall-brush":
      return "Pinceau";
    case "wall-erase":
      return "Gomme";
    case "device":
      return "Device";
  }
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-foreground">{value}</span>
    </div>
  );
}

export function WallDebugPanel({
  isVisible,
  activeDrawTool,
  pointerPosition,
  hoverSnapPoint,
  pointerSnapPoint,
  drawAnchor,
  lastWallStartPoint,
  erasePreviewCount,
  drawMessage,
}: WallDebugPanelProps) {
  const selectedWallColor = useSelectedWallColor();
  const hasAnchor = activeDrawTool === "wall" || activeDrawTool === "room";
  const showTrace = hasAnchor && drawAnchor !== null;
  const showWallState =
    activeDrawTool === "wall" && lastWallStartPoint !== null;

  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute top-24 right-4 z-20 w-[25rem] rounded-md border border-border bg-card px-3 py-2 text-[11px] shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-foreground">Debug outils peinture</p>
        <Kbd>Shift + D</Kbd>
      </div>

      <div className="space-y-3 text-[11px]">
        <div className="space-y-1.5">
          <SectionTitle>Contexte</SectionTitle>
          <Row label="Outil" value={toToolLabel(activeDrawTool)} />
          <Row label="Couleur" value={selectedWallColor} />
        </div>

        <Separator />

        <div className="space-y-1.5">
          <SectionTitle>Curseur</SectionTitle>
          <Row label="Souris" value={formatPoint(pointerPosition)} />
          <Row label="Souris mur" value={formatWallGrid(pointerPosition)} />
          <Row label="Snap" value={formatPoint(hoverSnapPoint)} />
          <Row label="Snap mur" value={formatWallGrid(hoverSnapPoint)} />
        </div>

        {showTrace ? (
          <>
            <Separator />

            <div className="space-y-1.5">
              <SectionTitle>Trace</SectionTitle>
              <Row label="Ancre" value={formatPoint(drawAnchor)} />
              <Row label="Ancre mur" value={formatWallGrid(drawAnchor)} />
              <Row
                label="Delta"
                value={formatWallGridDelta(drawAnchor, pointerSnapPoint)}
              />
            </div>
          </>
        ) : null}

        {showWallState ? (
          <>
            <Separator />

            <div className="space-y-1.5">
              <SectionTitle>Mur</SectionTitle>
              <Row label="Depart" value={formatPoint(lastWallStartPoint)} />
            </div>
          </>
        ) : null}

        {activeDrawTool === "wall-erase" ? (
          <>
            <Separator />

            <div className="space-y-1.5">
              <SectionTitle>Effacement</SectionTitle>
              <Row
                label="Preview"
                value={`${erasePreviewCount} bloc${erasePreviewCount > 1 ? "s" : ""}`}
              />
            </div>
          </>
        ) : null}

        {drawMessage ? (
          <>
            <Separator />

            <div className="space-y-1.5">
              <SectionTitle>Message</SectionTitle>
              <p className="text-destructive">{drawMessage}</p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
