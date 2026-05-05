import { useEffect } from "react";
import type { MutableRefObject } from "react";
import type { DrawTool, WallSegment } from "@/types/map";
import type { WallToolsController } from "@/walls/useWallToolsController";
import { WallOverlay } from "@/canvas/components/WallOverlay";
import { WallToolHelpCard } from "@/canvas/components/WallToolHelpCard";
import { WallDebugPanel } from "@/canvas/components/WallDebugPanel";
import { useWallToolsController } from "@/walls/useWallToolsController";

export interface WallToolsLayerHandle {
  cancelTool: WallToolsController["cancelTool"];
  handlePaneMouseMove: WallToolsController["handlePaneMouseMove"];
  handlePaneClick: WallToolsController["handlePaneClick"];
  handleContextMenu: WallToolsController["handleContextMenu"];
}

interface WallToolsLayerProps {
  controllerRef: MutableRefObject<WallToolsLayerHandle | null>;
  floorWalls: Array<WallSegment>;
  activeDrawTool: DrawTool;
  isEditMode: boolean;
  isWallDebugPanelVisible: boolean;
  paneHoverFillColor: string;
  paneHoverStrokeColor: string;
  onPaneCursorClassChange: (paneCursorClass: string) => void;
}

export function WallToolsLayer({
  controllerRef,
  floorWalls,
  activeDrawTool,
  isEditMode,
  isWallDebugPanelVisible,
  paneHoverFillColor,
  paneHoverStrokeColor,
  onPaneCursorClassChange,
}: WallToolsLayerProps) {
  const wallTools = useWallToolsController({
    trackPointerPosition: isWallDebugPanelVisible,
  });

  useEffect(() => {
    controllerRef.current = {
      cancelTool: wallTools.cancelTool,
      handlePaneMouseMove: wallTools.handlePaneMouseMove,
      handlePaneClick: wallTools.handlePaneClick,
      handleContextMenu: wallTools.handleContextMenu,
    };

    return () => {
      controllerRef.current = null;
    };
  }, [
    controllerRef,
    wallTools.cancelTool,
    wallTools.handleContextMenu,
    wallTools.handlePaneClick,
    wallTools.handlePaneMouseMove,
  ]);

  useEffect(() => {
    onPaneCursorClassChange(wallTools.paneCursorClass);
  }, [onPaneCursorClassChange, wallTools.paneCursorClass]);

  return (
    <>
      <WallOverlay
        floorWalls={floorWalls}
        previewSegments={wallTools.previewSegments}
        erasePreviewKeys={wallTools.erasePreviewKeys}
        activeDrawTool={activeDrawTool}
        drawAnchor={wallTools.drawAnchor}
        hoverSnapPoint={wallTools.hoverSnapPoint}
        paneHoverFillColor={paneHoverFillColor}
        paneHoverStrokeColor={paneHoverStrokeColor}
      />

      <WallToolHelpCard
        isVisible={isEditMode && activeDrawTool !== "device"}
        drawMessage={wallTools.drawMessage}
      />

      <WallDebugPanel
        isVisible={isWallDebugPanelVisible}
        activeDrawTool={activeDrawTool}
        pointerPosition={wallTools.pointerPosition}
        hoverSnapPoint={wallTools.hoverSnapPoint}
        pointerSnapPoint={wallTools.pointerSnapPoint}
        drawAnchor={wallTools.drawAnchor}
        lastWallStartPoint={wallTools.lastWallStartPoint}
        erasePreviewCount={wallTools.erasePreviewKeys.length}
        drawMessage={wallTools.drawMessage}
      />
    </>
  );
}
