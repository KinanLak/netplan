import { useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MouseRightClick04Icon } from "@hugeicons/core-free-icons";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { nodeTypes } from "./nodeTypes";
import type { Node, OnNodesChange } from "@xyflow/react";
import type { Device, Position, Size, WallSegment } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { useHotkeyDirect, useShortcut } from "@/hooks/use-shortcuts";
import { Kbd } from "@/components/ui/kbd";
import {
  GRID_SIZE,
  WALL_COLOR_ORDER,
  WALL_COLOR_TONES,
  arePositionsEqual,
  createOrthogonalWallSegment,
  createRoomWallSegments,
  getWallRect,
  snapPositionToWallGrid,
} from "@/lib/walls";
import {
  computeMergedWallGroups,
  computeSingleWallPath,
} from "@/lib/wallGeometry";
import { cn } from "@/lib/utils";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];

type DeviceNode = Node<{ data: Device }>;
type DraftWallSegment = Omit<WallSegment, "id">;
// Find the nearest valid position when there's a collision
const findNearestValidPosition = (
  deviceId: string,
  targetPos: Position,
  size: Size,
  lastValidPos: Position,
  checkCollision: (id: string, pos: Position, size: Size) => boolean,
): Position => {
  // If no collision at target, return target
  if (!checkCollision(deviceId, targetPos, size)) {
    return targetPos;
  }

  // Search in expanding circles for nearest valid position
  const maxRadius = 200; // Max search radius
  for (let radius = GRID_SIZE; radius <= maxRadius; radius += GRID_SIZE) {
    // Check positions in a circle pattern around the target
    const positions: Array<Position> = [];
    for (let dx = -radius; dx <= radius; dx += GRID_SIZE) {
      for (let dy = -radius; dy <= radius; dy += GRID_SIZE) {
        // Only check positions at approximately this radius
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= radius - GRID_SIZE && dist < radius + GRID_SIZE) {
          positions.push({
            x: Math.round((targetPos.x + dx) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((targetPos.y + dy) / GRID_SIZE) * GRID_SIZE,
          });
        }
      }
    }

    // Sort by distance to target position
    positions.sort((a, b) => {
      const distA = Math.abs(a.x - targetPos.x) + Math.abs(a.y - targetPos.y);
      const distB = Math.abs(b.x - targetPos.x) + Math.abs(b.y - targetPos.y);
      return distA - distB;
    });

    // Find first valid position
    for (const pos of positions) {
      if (!checkCollision(deviceId, pos, size)) {
        return pos;
      }
    }
  }

  // No valid position found, return last valid
  return lastValidPos;
};

export default function FlowCanvas() {
  // State subscriptions — granular selectors prevent re-renders from unrelated changes
  const devices = useMapStore((s) => s.devices);
  const walls = useMapStore((s) => s.walls);
  const currentFloorId = useMapStore((s) => s.currentFloorId);
  const selectedDeviceId = useMapStore((s) => s.selectedDeviceId);
  const selectedWallId = useMapStore((s) => s.selectedWallId);
  const hoveredDeviceId = useMapStore((s) => s.hoveredDeviceId);
  const isEditMode = useMapStore((s) => s.isEditMode);
  const highlightedDeviceIds = useMapStore((s) => s.highlightedDeviceIds);
  const activeDrawTool = useMapStore((s) => s.activeDrawTool);
  const selectedWallColor = useMapStore((s) => s.selectedWallColor);

  // Actions — stable references in Zustand, never trigger re-renders
  const selectDevice = useMapStore((s) => s.selectDevice);
  const selectWall = useMapStore((s) => s.selectWall);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);
  const setHighlightedDevices = useMapStore((s) => s.setHighlightedDevices);
  const updateDevicePosition = useMapStore((s) => s.updateDevicePosition);
  const checkCollision = useMapStore((s) => s.checkCollision);
  const addWallSegment = useMapStore((s) => s.addWallSegment);
  const addRoom = useMapStore((s) => s.addRoom);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const reactFlow = useReactFlow();

  // Store last valid positions and last grid cell for optimization
  const lastValidPositions = useRef<Map<string, Position>>(new Map());
  const lastGridCell = useRef<Map<string, string>>(new Map());

  const [drawAnchor, setDrawAnchor] = useState<Position | null>(null);
  const [pointerPreview, setPointerPreview] = useState<Position | null>(null);
  const [hoverSnapPoint, setHoverSnapPoint] = useState<Position | null>(null);
  const [drawMessage, setDrawMessage] = useState<string | null>(null);
  const [isCursorDragging, setIsCursorDragging] = useState(false);

  const canEditDevices = isEditMode && activeDrawTool === "device";

  // Zoom and pan shortcuts
  useShortcut("zoom-in", () => {
    reactFlow.zoomIn({ duration: 200 });
  });
  useShortcut("zoom-out", () => {
    reactFlow.zoomOut({ duration: 200 });
  });
  useShortcut("zoom-reset", () => {
    reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  });

  const floorWalls = walls.filter((wall) => wall.floorId === currentFloorId);

  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNode>([]);

  // Sync nodes when devices or floor change — selection/highlight handled separately
  useEffect(() => {
    const selectedId = useMapStore.getState().selectedDeviceId;
    const nextNodes = devices.reduce<Array<DeviceNode>>((acc, device) => {
      if (device.floorId !== currentFloorId) {
        return acc;
      }

      acc.push({
        id: device.id,
        type: device.type,
        position: device.position,
        data: { data: device },
        selected: device.id === selectedId,
        draggable: canEditDevices,
      });

      return acc;
    }, []);

    nextNodes.forEach((node) => {
      lastValidPositions.current.set(node.id, node.position);
    });

    setNodes(nextNodes);
  }, [devices, currentFloorId, canEditDevices, setNodes]);

  // Lightweight selection sync — only updates the `selected` flag on nodes,
  // preserving `data` references so memo() on node components is effective.
  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const shouldBeSelected = node.id === selectedDeviceId;
        return node.selected === shouldBeSelected
          ? node
          : { ...node, selected: shouldBeSelected };
      }),
    );
  }, [selectedDeviceId, setNodes]);

  // Reset draw state when context changes (React "set state during render" pattern)
  // See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const drawContextKey = `${activeDrawTool}:${currentFloorId}:${isEditMode}`;
  const [prevDrawContext, setPrevDrawContext] = useState(drawContextKey);

  if (prevDrawContext !== drawContextKey) {
    setPrevDrawContext(drawContextKey);
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setDrawMessage(null);
  }

  // Deselect wall when switching away from device tool (external state, ok in effect)
  useEffect(() => {
    if (activeDrawTool !== "device") {
      selectWall(null);
    }
  }, [activeDrawTool, currentFloorId, isEditMode, selectWall]);

  // Cancel draw tool with Escape key
  const cancelDrawTool = () => {
    setActiveDrawTool("device");
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setDrawMessage(null);
  };

  useHotkeyDirect("escape", cancelDrawTool, {
    scope: "canvas",
    enabled: isEditMode && activeDrawTool !== "device",
  });

  const getWallSnappedPanePosition = (event: React.MouseEvent): Position => {
    const flowPosition = reactFlow.screenToFlowPosition(
      { x: event.clientX, y: event.clientY },
      { snapToGrid: false },
    );
    return snapPositionToWallGrid(flowPosition);
  };

  const previewSegments: Array<DraftWallSegment> = (() => {
    if (
      !drawAnchor ||
      !pointerPreview ||
      !currentFloorId ||
      activeDrawTool === "device"
    ) {
      return [];
    }

    if (activeDrawTool === "wall") {
      const segment = createOrthogonalWallSegment(
        drawAnchor,
        pointerPreview,
        currentFloorId,
        selectedWallColor,
      );
      return segment ? [segment] : [];
    }

    return createRoomWallSegments(
      drawAnchor,
      pointerPreview,
      currentFloorId,
      selectedWallColor,
    );
  })();

  const mergedWallGroups = computeMergedWallGroups(floorWalls).sort(
    (a, b) =>
      WALL_COLOR_ORDER.indexOf(a.color) - WALL_COLOR_ORDER.indexOf(b.color),
  );

  const hasPreview = previewSegments.length > 0;

  const combinedMergedWallGroups = hasPreview
    ? computeMergedWallGroups([...floorWalls, ...previewSegments]).sort(
        (a, b) =>
          WALL_COLOR_ORDER.indexOf(a.color) - WALL_COLOR_ORDER.indexOf(b.color),
      )
    : mergedWallGroups;

  const existingPathByColor = new Map(
    mergedWallGroups.map((g) => [g.color, g.path] as const),
  );

  const selectedWallPath = (() => {
    if (!selectedWallId) return null;
    const wall = floorWalls.find((w) => w.id === selectedWallId);
    if (!wall) return null;
    return computeSingleWallPath(wall);
  })();

  const paneCursorClass = (() => {
    if (!isEditMode || activeDrawTool === "device") {
      return "canvas-cursor-default";
    }

    if (activeDrawTool === "room") {
      return "wall-cursor-crosshair";
    }

    if (!drawAnchor || !pointerPreview) {
      return "wall-cursor-crosshair";
    }

    if (arePositionsEqual(pointerPreview, drawAnchor)) {
      return "wall-cursor-crosshair";
    }

    const dx = pointerPreview.x - drawAnchor.x;
    const dy = pointerPreview.y - drawAnchor.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? "wall-cursor-e" : "wall-cursor-w";
    }

    return dy >= 0 ? "wall-cursor-s" : "wall-cursor-n";
  })();

  const getWallAtFlowPosition = (position: Position): WallSegment | null => {
    const wallsByDrawOrder = [...floorWalls].reverse();
    const matchingWall = wallsByDrawOrder.find((wall) => {
      const rect = getWallRect(wall);
      return (
        position.x >= rect.x &&
        position.x <= rect.x + rect.width &&
        position.y >= rect.y &&
        position.y <= rect.y + rect.height
      );
    });

    return matchingWall ?? null;
  };

  // Handle node changes (drag, select, etc.)
  const handleNodesChange: OnNodesChange<DeviceNode> = (changes) => {
    // Process changes and check for collisions during drag
    const processedChanges = changes.map((change) => {
      if (change.type === "position" && change.position && change.dragging) {
        // Snap position to grid
        const snappedPosition = {
          x: Math.round(change.position.x / GRID_SIZE) * GRID_SIZE,
          y: Math.round(change.position.y / GRID_SIZE) * GRID_SIZE,
        };

        // Check if we moved to a new grid cell (optimization)
        const currentCell = `${Math.floor(snappedPosition.x / GRID_SIZE)},${Math.floor(snappedPosition.y / GRID_SIZE)}`;
        const prevCell = lastGridCell.current.get(change.id);

        // Only recalculate if grid cell changed
        if (currentCell !== prevCell) {
          lastGridCell.current.set(change.id, currentCell);

          // Find the device being dragged
          const device = devices.find((d) => d.id === change.id);
          if (device) {
            const lastValid =
              lastValidPositions.current.get(change.id) ?? device.position;

            // Find nearest valid position
            const validPosition = findNearestValidPosition(
              change.id,
              snappedPosition,
              device.size,
              lastValid,
              checkCollision,
            );

            // Update last valid position
            lastValidPositions.current.set(change.id, validPosition);

            return {
              ...change,
              position: validPosition,
            };
          }
        } else {
          // Same cell, use last valid position
          const lastValid = lastValidPositions.current.get(change.id);
          if (lastValid) {
            return {
              ...change,
              position: lastValid,
            };
          }
        }
      }

      // Handle drag end - ensure final position is valid
      if (change.type === "position" && change.position && !change.dragging) {
        const device = devices.find((d) => d.id === change.id);
        if (device) {
          const lastValid = lastValidPositions.current.get(change.id);
          if (lastValid) {
            // Always use the last valid position when drag ends
            return {
              ...change,
              position: lastValid,
            };
          }
        }
      }

      return change;
    });

    onNodesChange(processedChanges);

    // Update positions in store after drag ends (only in edit mode)
    if (canEditDevices) {
      processedChanges.forEach((change) => {
        if (change.type === "position" && change.position && !change.dragging) {
          // Use the processed position which is guaranteed to be valid
          updateDevicePosition(change.id, change.position);
        }
      });
    }
  };

  // Handle node click
  const handleNodeClick = (_: React.MouseEvent, node: DeviceNode) => {
    if (activeDrawTool !== "device") {
      return;
    }
    selectWall(null);
    selectDevice(node.id);
  };

  // Handle node mouse enter (for hover-based shortcuts)
  const handleNodeMouseEnter = (_: React.MouseEvent, node: DeviceNode) => {
    setHoveredDevice(node.id);
  };

  // Handle node mouse leave
  const handleNodeMouseLeave = () => {
    setHoveredDevice(null);
  };

  const handleMoveStart = () => {
    setIsCursorDragging(true);
  };

  const handleMoveEnd = () => {
    setIsCursorDragging(false);
  };

  const handleNodeDragStart = () => {
    setIsCursorDragging(true);
  };

  const handleNodeDragStop = () => {
    setIsCursorDragging(false);
  };

  useEffect(() => {
    const resetDraggingCursor = () => {
      setIsCursorDragging(false);
    };

    window.addEventListener("mouseup", resetDraggingCursor);
    window.addEventListener("blur", resetDraggingCursor);

    return () => {
      window.removeEventListener("mouseup", resetDraggingCursor);
      window.removeEventListener("blur", resetDraggingCursor);
    };
  }, []);

  // Handle H key to highlight connections for hovered or selected device
  const handleHighlightHoveredConnections = () => {
    // If devices are already highlighted and no device is selected (no drawer), de-highlight
    if (highlightedDeviceIds.length > 0 && !selectedDeviceId) {
      setHighlightedDevices([]);
      return;
    }

    // Determine target device: hovered (if no drawer open) or selected
    const targetDeviceId = selectedDeviceId || hoveredDeviceId;
    if (!targetDeviceId) return;

    const device = devices.find((d) => d.id === targetDeviceId);
    if (!device?.metadata.connectedDeviceIds?.length) return;

    // Toggle highlight
    const connectedIds = device.metadata.connectedDeviceIds;
    // Include the hovered/selected device itself in the highlight
    const allIdsToHighlight = [targetDeviceId, ...connectedIds];
    const isCurrentlyHighlighted = allIdsToHighlight.every((id) =>
      highlightedDeviceIds.includes(id),
    );

    if (isCurrentlyHighlighted) {
      setHighlightedDevices([]);
    } else {
      setHighlightedDevices(allIdsToHighlight);
    }
  };

  // Register H shortcut for highlighting connections (when not in drawer)
  useShortcut(
    "highlight-connections",
    handleHighlightHoveredConnections,
    // Enable when:
    // 1. There's a hovered device and no drawer open, OR
    // 2. There are highlighted devices and no drawer open (to de-highlight)
    {
      enabled:
        (!!hoveredDeviceId || highlightedDeviceIds.length > 0) &&
        !selectedDeviceId,
    },
  );

  const handlePaneMouseMove = (event: React.MouseEvent) => {
    if (!isEditMode || activeDrawTool === "device" || !currentFloorId) {
      return;
    }

    const snappedPoint = getWallSnappedPanePosition(event);

    if (drawAnchor) {
      setPointerPreview(snappedPoint);
    } else {
      setPointerPreview(null);
    }

    if (activeDrawTool === "wall" && !drawAnchor) {
      setHoverSnapPoint(snappedPoint);
      return;
    }

    setHoverSnapPoint(null);
  };

  // Handle pane click for draw tools / deselect
  const handlePaneClick = (event: React.MouseEvent) => {
    if (!currentFloorId) {
      selectDevice(null);
      selectWall(null);
      return;
    }

    if (!isEditMode) {
      selectDevice(null);
      selectWall(null);
      return;
    }

    if (activeDrawTool === "device") {
      const flowPosition = reactFlow.screenToFlowPosition(
        { x: event.clientX, y: event.clientY },
        { snapToGrid: false },
      );
      const clickedWall = getWallAtFlowPosition(flowPosition);

      if (clickedWall) {
        selectDevice(null);
        selectWall(clickedWall.id);
        return;
      }

      selectDevice(null);
      selectWall(null);
      return;
    }

    const clickedPoint =
      activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint
        ? hoverSnapPoint
        : getWallSnappedPanePosition(event);
    setPointerPreview(clickedPoint);
    selectDevice(null);
    selectWall(null);

    if (activeDrawTool === "wall") {
      if (!drawAnchor) {
        setDrawAnchor(clickedPoint);
        setDrawMessage(null);
        return;
      }

      if (arePositionsEqual(clickedPoint, drawAnchor)) {
        setDrawAnchor(null);
        setPointerPreview(null);
        setDrawMessage(null);
        return;
      }

      const newSegment = createOrthogonalWallSegment(
        drawAnchor,
        clickedPoint,
        currentFloorId,
        selectedWallColor,
      );

      if (!newSegment) {
        setDrawMessage("Segment de mur invalide.");
        return;
      }

      const created = addWallSegment(newSegment);
      if (!created) {
        setDrawMessage("Mur refusé: collision device/mur ou déjà existant.");
        return;
      }

      setDrawAnchor(null);
      setPointerPreview(null);
      setHoverSnapPoint(null);
      setDrawMessage(null);
      return;
    }

    if (!drawAnchor) {
      setDrawAnchor(clickedPoint);
      setDrawMessage(null);
      return;
    }

    if (arePositionsEqual(clickedPoint, drawAnchor)) {
      setDrawAnchor(null);
      setPointerPreview(null);
      setDrawMessage(null);
      return;
    }

    const created = addRoom({
      floorId: currentFloorId,
      start: drawAnchor,
      end: clickedPoint,
      color: selectedWallColor,
    });

    if (!created) {
      setDrawMessage(
        "Salle refusée: rectangle vide, collision device/mur ou déjà présent.",
      );
      return;
    }

    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setDrawMessage(null);
  };

  const handlePaneContextMenu = (event: React.MouseEvent | MouseEvent) => {
    if (!isEditMode || activeDrawTool === "device") {
      return;
    }

    event.preventDefault();
    setActiveDrawTool("device");
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setDrawMessage(null);
    selectWall(null);
  };

  const handleNodeContextMenu = (event: React.MouseEvent) => {
    if (!isEditMode || activeDrawTool === "device") {
      return;
    }

    event.preventDefault();
    setActiveDrawTool("device");
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setDrawMessage(null);
    selectWall(null);
  };

  const handleZoomInClick = () => {
    reactFlow.zoomIn({ duration: 200 });
  };

  const handleZoomOutClick = () => {
    reactFlow.zoomOut({ duration: 200 });
  };

  const handleCenterViewportClick = () => {
    reactFlow.fitView({ padding: 0.2, duration: 250 });
  };

  return (
    <div className="relative h-full w-full">
      <ReactFlow<DeviceNode>
        nodes={nodes}
        edges={[]}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onPaneMouseMove={handlePaneMouseMove}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={SNAP_GRID}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        nodesDraggable={canEditDevices}
        className={cn(
          paneCursorClass,
          isCursorDragging && "canvas-cursor-grabbing",
        )}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1.5}
          color="#94a3b8"
        />

        <ViewportPortal>
          <div className="pointer-events-none absolute inset-0">
            <svg className="absolute inset-0 h-full w-full overflow-visible">
              {/* ---- SVG defs: preview masks ---- */}
              <defs>
                {hasPreview &&
                  combinedMergedWallGroups.map((group) => {
                    const existingPath = existingPathByColor.get(group.color);

                    return (
                      <mask
                        id={`wall-mask-${group.color}`}
                        key={`mask-${group.color}`}
                      >
                        <path d={group.path} fill="#808080" />
                        {existingPath && <path d={existingPath} fill="white" />}
                      </mask>
                    );
                  })}
              </defs>

              {/* ---- Wall color layers (z-order: sand → concrete → slate) ---- */}
              {combinedMergedWallGroups.map((group) => {
                const tone = WALL_COLOR_TONES[group.color];

                return (
                  <g key={group.color}>
                    {/* Fill — masked for preview opacity */}
                    <g
                      mask={
                        hasPreview
                          ? `url(#wall-mask-${group.color})`
                          : undefined
                      }
                    >
                      <path
                        d={group.path}
                        fill={tone.fill}
                        shapeRendering="geometricPrecision"
                      />
                    </g>
                    {/* Stroke — always fully visible (outside mask) */}
                    <path
                      d={group.path}
                      fill="none"
                      stroke={tone.stroke}
                      strokeWidth={2}
                      shapeRendering="geometricPrecision"
                    />
                  </g>
                );
              })}

              {/* ---- Selected wall highlight ---- */}
              {selectedWallPath ? (
                <path
                  d={selectedWallPath}
                  fill="var(--input)"
                  fillOpacity={0.25}
                  stroke="none"
                  shapeRendering="geometricPrecision"
                />
              ) : null}

              {drawAnchor && activeDrawTool !== "device" ? (
                <circle
                  cx={drawAnchor.x}
                  cy={drawAnchor.y}
                  r={5}
                  fill="rgba(15, 23, 42, 0.8)"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ) : null}

              {activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint ? (
                <circle
                  cx={hoverSnapPoint.x}
                  cy={hoverSnapPoint.y}
                  r={4}
                  fill="rgba(59, 130, 246, 0.16)"
                  stroke="rgba(59, 130, 246, 0.85)"
                  strokeWidth={1.5}
                />
              ) : null}
            </svg>
          </div>
        </ViewportPortal>
      </ReactFlow>

      <div className="absolute bottom-4 left-4 z-20 overflow-hidden rounded-md border border-border bg-card shadow-md">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={handleZoomInClick}
            className="grid h-8 w-8 place-items-center border-b border-border text-foreground transition-colors hover:bg-muted"
            aria-label="Zoom avant"
            title="Zoom avant"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOutClick}
            className="grid h-8 w-8 place-items-center border-b border-border text-foreground transition-colors hover:bg-muted"
            aria-label="Zoom arrière"
            title="Zoom arrière"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleCenterViewportClick}
            className="grid h-8 w-8 place-items-center text-foreground transition-colors hover:bg-muted"
            aria-label="Centrer la vue"
            title="Centrer la vue"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Build mode help */}
      {isEditMode && activeDrawTool !== "device" ? (
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
      ) : null}

      {/* Edit mode vignette overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${
          isEditMode ? "opacity-100" : "opacity-0"
        }`}
        style={{
          boxShadow: "inset 0 0 50px 20px rgba(46, 126, 255, 0.3)",
        }}
      />
    </div>
  );
}
