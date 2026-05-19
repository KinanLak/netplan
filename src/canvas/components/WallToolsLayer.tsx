import type { DrawTool, WallSegment } from "@/types/map";
import type { WallToolSession } from "@/walls/useWallToolSession";
import { WallOverlay } from "@/canvas/components/WallOverlay";
import { WallToolHelpCard } from "@/canvas/components/WallToolHelpCard";
import { WallDebugPanel } from "@/canvas/components/WallDebugPanel";

interface WallToolsLayerProps {
  session: WallToolSession;
  floorWalls: Array<WallSegment>;
  activeDrawTool: DrawTool;
  isEditMode: boolean;
  paneHoverFillColor: string;
  paneHoverStrokeColor: string;
}

export function WallToolsLayer({
  session,
  floorWalls,
  activeDrawTool,
  isEditMode,
  paneHoverFillColor,
  paneHoverStrokeColor,
}: WallToolsLayerProps) {
  return (
    <>
      <WallOverlay
        floorWalls={floorWalls}
        previewSegments={session.previewSegments}
        erasePreviewKeys={session.erasePreviewKeys}
        erasePreviewPointer={session.erasePreviewPointer}
        wallEraserSize={session.wallEraserSize}
        activeDrawTool={activeDrawTool}
        drawAnchor={session.drawAnchor}
        hoverSnapPoint={session.hoverSnapPoint}
        paneHoverFillColor={paneHoverFillColor}
        paneHoverStrokeColor={paneHoverStrokeColor}
      />

      <WallToolHelpCard
        isVisible={isEditMode && activeDrawTool !== "device"}
        drawMessage={session.drawMessage}
      />

      <WallDebugPanel
        isVisible={session.isDebugPanelVisible}
        activeDrawTool={activeDrawTool}
        pointerPosition={session.pointerPosition}
        hoverSnapPoint={session.hoverSnapPoint}
        pointerSnapPoint={session.pointerSnapPoint}
        drawAnchor={session.drawAnchor}
        lastWallStartPoint={session.lastWallStartPoint}
        erasePreviewCount={session.erasePreviewKeys.length}
        drawMessage={session.drawMessage}
      />
    </>
  );
}
