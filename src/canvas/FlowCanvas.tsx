import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ViewportPortal,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { nodeTypes } from "./nodeTypes";
import type { Node, OnNodesChange } from "@xyflow/react";
import type { DeviceNodeData, Position, Size, WallSegment } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import {
  GRID_SIZE,
  WALL_COLOR_TONES,
  WALL_THICKNESS,
  arePositionsEqual,
  createOrthogonalWallSegment,
  createRoomWallSegments,
  getWallRect,
  isPointConnectedToWalls,
  isPointOnWall,
  snapPositionToGrid,
} from "@/lib/walls";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];

type DeviceNode = Node<{ data: DeviceNodeData }>;
type DraftWallSegment = Omit<WallSegment, "id">;
type WallRenderable = Pick<WallSegment, "start" | "end" | "color">;

const getPointKey = (position: Position): string => `${position.x}:${position.y}`;

const collectJunctionPoints = (
  candidateSegments: Array<WallRenderable>,
  allSegments: Array<WallRenderable>,
): Array<{ point: Position; color: WallSegment["color"] }> => {
  const jointMap = new Map<string, { point: Position; color: WallSegment["color"] }>();

  const candidates = candidateSegments.flatMap((segment) => [
    { point: segment.start, color: segment.color },
    { point: segment.end, color: segment.color },
  ]);

  candidates.forEach((candidate) => {
    const key = getPointKey(candidate.point);
    if (jointMap.has(key)) {
      return;
    }

    const touchingSegments = allSegments.filter((segment) =>
      isPointOnWall(candidate.point, segment),
    );
    if (touchingSegments.length < 2) {
      return;
    }

    jointMap.set(key, {
      point: candidate.point,
      color: candidate.color,
    });
  });

  return Array.from(jointMap.values());
};

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
  const {
    devices,
    walls,
    currentFloorId,
    selectedDeviceId,
    selectDevice,
    updateDevicePosition,
    isEditMode,
    highlightedDeviceIds,
    checkCollision,
    activeDrawTool,
    selectedWallColor,
    addWallSegment,
    addRoom,
    setActiveDrawTool,
  } = useMapStore();
  const reactFlow = useReactFlow();

  // Store last valid positions and last grid cell for optimization
  const lastValidPositions = useRef<Map<string, Position>>(new Map());
  const lastGridCell = useRef<Map<string, string>>(new Map());

  const [drawAnchor, setDrawAnchor] = useState<Position | null>(null);
  const [pointerPreview, setPointerPreview] = useState<Position | null>(null);
  const [hoverSnapPoint, setHoverSnapPoint] = useState<Position | null>(null);
  const [drawMessage, setDrawMessage] = useState<string | null>(null);

  const canEditDevices = isEditMode && activeDrawTool === "device";

  const floorWalls = useMemo(
    () => walls.filter((wall) => wall.floorId === currentFloorId),
    [walls, currentFloorId],
  );

  // Filter devices for current floor and convert to React Flow nodes
  const initialNodes = useMemo((): Array<DeviceNode> => {
    const nodes = devices
      .filter((d) => d.floorId === currentFloorId)
      .map(
        (device): DeviceNode => ({
          id: device.id,
          type: device.type,
          position: device.position,
          data: {
            data: {
              ...device,
              selected: device.id === selectedDeviceId,
              highlighted: highlightedDeviceIds.includes(device.id),
            },
          },
          selected: device.id === selectedDeviceId,
          draggable: canEditDevices,
        }),
      );

    // Update last valid positions
    nodes.forEach((node) => {
      lastValidPositions.current.set(node.id, node.position);
    });

    return nodes;
  }, [
    devices,
    currentFloorId,
    selectedDeviceId,
    canEditDevices,
    highlightedDeviceIds,
  ]);

  const [nodes, setNodes, onNodesChange] =
    useNodesState<DeviceNode>(initialNodes);

  // Sync nodes when floor changes or devices update
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setDrawMessage(null);
  }, [activeDrawTool, currentFloorId, isEditMode]);

  useEffect(() => {
    if (!isEditMode || activeDrawTool === "device") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setActiveDrawTool("device");
      setDrawAnchor(null);
      setPointerPreview(null);
      setHoverSnapPoint(null);
      setDrawMessage(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditMode, activeDrawTool, setActiveDrawTool]);

  const getWallSnappedPanePosition = useCallback(
    (event: React.MouseEvent): Position => {
      const flowPosition = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      return snapPositionToGrid(flowPosition);
    },
    [reactFlow],
  );

  const previewSegments = useMemo((): Array<DraftWallSegment> => {
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
  }, [
    drawAnchor,
    pointerPreview,
    currentFloorId,
    activeDrawTool,
    selectedWallColor,
  ]);

  const floorWallJunctions = useMemo(
    () => collectJunctionPoints(floorWalls, floorWalls),
    [floorWalls],
  );

  const previewJunctions = useMemo(() => {
    if (previewSegments.length === 0) {
      return [];
    }
    const combined: Array<WallRenderable> = [...floorWalls, ...previewSegments];
    return collectJunctionPoints(previewSegments, combined);
  }, [previewSegments, floorWalls]);

  const isSnapHovering =
    activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint !== null;

  const paneCursorClass = useMemo(() => {
    if (!isEditMode || activeDrawTool === "device") {
      return undefined;
    }

    if (activeDrawTool === "room") {
      return "wall-cursor-crosshair";
    }

    if (!drawAnchor || !pointerPreview) {
      return isSnapHovering ? "wall-cursor-crosshair" : undefined;
    }

    const dx = pointerPreview.x - drawAnchor.x;
    const dy = pointerPreview.y - drawAnchor.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? "wall-cursor-e" : "wall-cursor-w";
    }

    return dy >= 0 ? "wall-cursor-s" : "wall-cursor-n";
  }, [
    isEditMode,
    activeDrawTool,
    drawAnchor,
    pointerPreview,
    isSnapHovering,
  ]);

  // Handle node changes (drag, select, etc.)
  const handleNodesChange: OnNodesChange<DeviceNode> = useCallback(
    (changes) => {
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
          if (
            change.type === "position" &&
            change.position &&
            !change.dragging
          ) {
            // Use the processed position which is guaranteed to be valid
            updateDevicePosition(change.id, change.position);
          }
        });
      }
    },
    [
      onNodesChange,
      updateDevicePosition,
      canEditDevices,
      devices,
      checkCollision,
    ],
  );

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      if (activeDrawTool !== "device") {
        return;
      }
      selectDevice(node.id);
    },
    [selectDevice, activeDrawTool],
  );

  const handlePaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
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
        if (floorWalls.length === 0) {
          setHoverSnapPoint(snappedPoint);
          return;
        }

        setHoverSnapPoint(
          isPointConnectedToWalls(snappedPoint, floorWalls)
            ? snappedPoint
            : null,
        );
        return;
      }

      setHoverSnapPoint(null);
    },
    [
      isEditMode,
      activeDrawTool,
      drawAnchor,
      currentFloorId,
      getWallSnappedPanePosition,
      floorWalls,
    ],
  );

  // Handle pane click for draw tools / deselect
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!isEditMode || !currentFloorId || activeDrawTool === "device") {
        selectDevice(null);
        return;
      }

      const clickedPoint =
        activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint
          ? hoverSnapPoint
          : getWallSnappedPanePosition(event);
      setPointerPreview(clickedPoint);
      selectDevice(null);

      if (activeDrawTool === "wall") {
        if (!drawAnchor) {
          if (
            floorWalls.length > 0 &&
            !isPointConnectedToWalls(clickedPoint, floorWalls)
          ) {
            setDrawMessage("Le mur doit démarrer sur un mur existant.");
            return;
          }

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
          setDrawMessage(
            "Mur refusé: collision device/mur, non connecté, ou déjà existant.",
          );
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
          "Salle refusée: rectangle vide, collision device/mur, non connecté ou déjà présent.",
        );
        return;
      }

      setDrawAnchor(null);
      setPointerPreview(null);
      setHoverSnapPoint(null);
      setDrawMessage(null);
    },
    [
      isEditMode,
      currentFloorId,
      activeDrawTool,
      selectDevice,
      getWallSnappedPanePosition,
      drawAnchor,
      hoverSnapPoint,
      floorWalls,
      selectedWallColor,
      addWallSegment,
      addRoom,
    ],
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      if (!isEditMode || activeDrawTool === "device") {
        return;
      }

      event.preventDefault();
      setActiveDrawTool("device");
      setDrawAnchor(null);
      setPointerPreview(null);
      setHoverSnapPoint(null);
      setDrawMessage(null);
    },
    [isEditMode, activeDrawTool, setActiveDrawTool],
  );

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!isEditMode || activeDrawTool === "device") {
        return;
      }

      event.preventDefault();
      setActiveDrawTool("device");
      setDrawAnchor(null);
      setPointerPreview(null);
      setHoverSnapPoint(null);
      setDrawMessage(null);
    },
    [isEditMode, activeDrawTool, setActiveDrawTool],
  );

  const drawHint = useMemo(() => {
    if (activeDrawTool === "wall") {
      if (drawAnchor) {
        return "Cliquez le point d'arrivée du mur.";
      }
      if (floorWalls.length === 0) {
        return "Cliquez sur la grille pour poser le premier mur.";
      }
      return "Survolez un mur existant (cercle) puis cliquez pour démarrer.";
    }

    if (activeDrawTool === "room") {
      return drawAnchor
        ? "Cliquez le coin opposé pour créer la salle rectangulaire."
        : "Cliquez le premier coin de la salle.";
    }

    return null;
  }, [activeDrawTool, drawAnchor, floorWalls.length]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow<DeviceNode>
        nodes={nodes}
        edges={[]}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onPaneMouseMove={handlePaneMouseMove}
        onPaneContextMenu={handlePaneContextMenu}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={SNAP_GRID}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={null}
        nodesDraggable={canEditDevices}
        className={paneCursorClass}
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
              {floorWalls.map((wall) => {
                const rect = getWallRect(wall);
                const tone = WALL_COLOR_TONES[wall.color];
                return (
                  <rect
                    key={wall.id}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={2}
                    shapeRendering="geometricPrecision"
                  />
                );
              })}

              {floorWallJunctions.map((junction) => {
                const tone = WALL_COLOR_TONES[junction.color];
                return (
                  <rect
                    key={`junction-${junction.point.x}-${junction.point.y}`}
                    x={junction.point.x - WALL_THICKNESS / 2}
                    y={junction.point.y - WALL_THICKNESS / 2}
                    width={WALL_THICKNESS}
                    height={WALL_THICKNESS}
                    fill={tone.fill}
                    stroke={tone.stroke}
                    strokeWidth={2}
                    shapeRendering="geometricPrecision"
                  />
                );
              })}

              {previewSegments.map((segment, index) => {
                const rect = getWallRect(segment);
                const tone = WALL_COLOR_TONES[segment.color];
                return (
                  <rect
                    key={`preview-${index}`}
                    x={rect.x}
                    y={rect.y}
                    width={rect.width}
                    height={rect.height}
                    fill={tone.fill}
                    fillOpacity={0.5}
                    stroke={tone.stroke}
                    strokeOpacity={0.8}
                    strokeWidth={2}
                    shapeRendering="geometricPrecision"
                  />
                );
              })}

              {previewJunctions.map((junction) => {
                const tone = WALL_COLOR_TONES[junction.color];
                return (
                  <rect
                    key={`preview-junction-${junction.point.x}-${junction.point.y}`}
                    x={junction.point.x - WALL_THICKNESS / 2}
                    y={junction.point.y - WALL_THICKNESS / 2}
                    width={WALL_THICKNESS}
                    height={WALL_THICKNESS}
                    fill={tone.fill}
                    fillOpacity={0.5}
                    stroke={tone.stroke}
                    strokeOpacity={0.8}
                    strokeWidth={2}
                    shapeRendering="geometricPrecision"
                  />
                );
              })}

              {drawAnchor && activeDrawTool !== "device" && (
                <circle
                  cx={drawAnchor.x}
                  cy={drawAnchor.y}
                  r={5}
                  fill="rgba(15, 23, 42, 0.8)"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}

              {activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint && (
                <circle
                  cx={hoverSnapPoint.x}
                  cy={hoverSnapPoint.y}
                  r={4}
                  fill="rgba(59, 130, 246, 0.16)"
                  stroke="rgba(59, 130, 246, 0.85)"
                  strokeWidth={1.5}
                />
              )}
            </svg>
          </div>
        </ViewportPortal>

        <Controls showInteractive={false} />
      </ReactFlow>

      {/* Build mode help */}
      {isEditMode && activeDrawTool !== "device" && drawHint && (
        <div className="absolute top-4 right-4 z-20 max-w-80 rounded-md border bg-card/95 px-3 py-2 text-xs shadow-md backdrop-blur">
          <p className="font-semibold">
            {activeDrawTool === "wall" ? "Mode Mur" : "Mode Salle"}
          </p>
          <p className="mt-1 text-muted-foreground">{drawHint}</p>
          <p className="mt-1 text-muted-foreground">
            Echap ou clic droit: quitter le mode construction.
          </p>
          {drawMessage && (
            <p className="mt-1 text-destructive">{drawMessage}</p>
          )}
        </div>
      )}

      {/* Edit mode vignette overlay */}
      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${
          isEditMode ? "opacity-100" : "opacity-0"
        }`}
        style={{
          boxShadow: "inset 0 0 50px 40px rgba(46, 126, 255, 0.3)",
        }}
      />
    </div>
  );
}
