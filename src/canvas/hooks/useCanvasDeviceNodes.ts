import { useCallback, useEffect, useRef, useState } from "react";
import { useNodesState } from "@xyflow/react";
import type { OnNodesChange } from "@xyflow/react";
import type {
  Device,
  DeviceId,
  DeviceMetadata,
  DrawTool,
  FloorId,
  Port,
  Position,
  Size,
} from "@/types/map";
import { useDevicePlacement } from "@/devices/useDevicePlacement";
import { toDeviceNodes } from "@/devices/reactFlowDeviceAdapter";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";
import { portsByDevice } from "@/devices/ports";
import { GRID_SIZE } from "@/lib/grid";
import { useConnectionStore } from "@/store/useConnectionStore";
import { createGroupDrag } from "@/canvas/groupDrag";
import type { GroupDrag } from "@/canvas/groupDrag";
import type { GroupMember } from "@/map-engine/types";

interface UseCanvasDeviceNodesParams {
  devices: Array<Device>;
  ports: Array<Port>;
  currentFloorId: FloorId | null;
  selectedDeviceId: DeviceId | null;
  selectedDeviceIdSet: ReadonlySet<DeviceId>;
  isMultiSelectMode: boolean;
  activeDrawTool: DrawTool;
  canEditDevices: boolean;
  checkCollision: (
    floorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
    ignoredDeviceIds?: ReadonlySet<DeviceId>,
  ) => boolean;
  updateDevicePosition: (deviceId: DeviceId, position: Position) => void;
  /** Moves a group as one block (ADR 0034); false when refused. */
  moveDevices: (from: ReadonlyArray<GroupMember>, offset: Position) => boolean;
  canMoveDevices: (
    from: ReadonlyArray<GroupMember>,
    offset: Position,
  ) => boolean;
  selectDevice: (deviceId: DeviceId | null) => void;
  setSelectedDevices: (deviceIds: Array<DeviceId>) => void;
  setHoveredDevice: (deviceId: DeviceId | null) => void;
}

/** Where a dragged device cannot go: the spot under the cursor (A13, A22). */
export type BlockedSpot = {
  deviceId: DeviceId;
  position: Position;
  size: Size;
};

interface UseCanvasDeviceNodesResult {
  nodes: Array<DeviceNode>;
  blockedSpots: ReadonlyArray<BlockedSpot>;
  handleNodesChange: OnNodesChange<DeviceNode>;
  handleNodeClick: (event: React.MouseEvent, node: DeviceNode) => void;
  handleNodeMouseEnter: (_: React.MouseEvent, node: DeviceNode) => void;
  handleNodeMouseLeave: () => void;
}

const arePositionsEqual = (a: Position, b: Position) =>
  a.x === b.x && a.y === b.y;

/** The spots with `deviceId`'s replaced, the same array when nothing moved. */
const withBlockedSpot = (
  current: ReadonlyArray<BlockedSpot>,
  deviceId: DeviceId,
  spot: BlockedSpot | null,
): ReadonlyArray<BlockedSpot> => {
  const previous = current.find((entry) => entry.deviceId === deviceId);
  if (!previous && !spot) return current;
  if (previous && spot && arePositionsEqual(previous.position, spot.position)) {
    return current;
  }
  const others = current.filter((entry) => entry.deviceId !== deviceId);
  return spot ? [...others, spot] : others;
};

const snapToGrid = ({ x, y }: Position): Position => ({
  x: Math.round(x / GRID_SIZE) * GRID_SIZE,
  y: Math.round(y / GRID_SIZE) * GRID_SIZE,
});

const areSizesEqual = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height;

const arePortsEqual = (a: ReadonlyArray<Port>, b: ReadonlyArray<Port>) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((port, index) => {
    const other = b[index];
    return (
      port.id === other.id &&
      port.name === other.name &&
      port.status === other.status &&
      port.seen === other.seen &&
      port.rearPortId === other.rearPortId
    );
  });
};

const areMetadataEqual = (a: DeviceMetadata, b: DeviceMetadata) => {
  return a.status === b.status && a.lastUser === b.lastUser;
};

const areNodeDataEqual = (a: DeviceNode["data"], b: DeviceNode["data"]) => {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.name === b.name &&
    a.hostname === b.hostname &&
    a.model === b.model &&
    a.ip === b.ip &&
    a.floorId === b.floorId &&
    arePositionsEqual(a.position, b.position) &&
    areSizesEqual(a.size, b.size) &&
    areMetadataEqual(a.metadata, b.metadata) &&
    arePortsEqual(a.ports, b.ports)
  );
};

const areMeasuredEqual = (
  a: DeviceNode["measured"],
  b: DeviceNode["measured"],
) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.width === b.width && a.height === b.height;
};

const areNodesEqual = (a: DeviceNode, b: DeviceNode) => {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.selected === b.selected &&
    a.draggable === b.draggable &&
    a.dragging === b.dragging &&
    arePositionsEqual(a.position, b.position) &&
    areMeasuredEqual(a.measured, b.measured) &&
    areNodeDataEqual(a.data, b.data)
  );
};

const areNodeListsEqual = (a: Array<DeviceNode>, b: Array<DeviceNode>) => {
  if (a.length !== b.length) return false;
  return a.every((node, index) => areNodesEqual(node, b[index]));
};

type GroupDragSession = {
  /** The members where the drag found them: React Flow drags from there. */
  from: ReadonlyArray<GroupMember>;
  startOf: ReadonlyMap<string, Position>;
  drag: GroupDrag;
};

/**
 * The group being dragged: the selection's devices on the floor, where the
 * drag started. Its offset is always measured from there, and the move is
 * refused if a member has moved since, as someone else may.
 */
const startGroupDrag = (
  devices: ReadonlyArray<Device>,
  floorId: FloorId,
  selectedDeviceIdSet: ReadonlySet<DeviceId>,
  canMoveDevices: UseCanvasDeviceNodesParams["canMoveDevices"],
): GroupDragSession => {
  const from = devices
    .filter(
      (device) =>
        device.floorId === floorId && selectedDeviceIdSet.has(device.id),
    )
    .map((device) => ({ deviceId: device.id, position: device.position }));
  return {
    from,
    startOf: new Map(from.map((member) => [member.deviceId, member.position])),
    drag: createGroupDrag((offset) => canMoveDevices(from, offset)),
  };
};

export function useCanvasDeviceNodes({
  devices,
  ports,
  currentFloorId,
  selectedDeviceId,
  selectedDeviceIdSet,
  isMultiSelectMode,
  activeDrawTool,
  canEditDevices,
  checkCollision,
  updateDevicePosition,
  moveDevices,
  canMoveDevices,
  selectDevice,
  setSelectedDevices,
  setHoveredDevice,
}: UseCanvasDeviceNodesParams): UseCanvasDeviceNodesResult {
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNode>([]);
  const devicePlacement = useDevicePlacement(checkCollision);
  const draggingDeviceIdsRef = useRef<Set<DeviceId>>(new Set());
  const groupDragRef = useRef<GroupDragSession | null>(null);
  const [blockedSpots, setBlockedSpots] = useState<ReadonlyArray<BlockedSpot>>(
    [],
  );

  useEffect(() => {
    const nextNodes = toDeviceNodes(
      devices,
      currentFloorId,
      selectedDeviceId,
      canEditDevices,
      selectedDeviceIdSet,
      portsByDevice(ports),
    );

    setNodes((currentNodes) => {
      const draggingDeviceIds = draggingDeviceIdsRef.current;
      const currentNodesById = new Map(
        currentNodes.map((node) => [node.id, node]),
      );

      const syncedNodes = nextNodes.map((node) => {
        const currentNode = currentNodesById.get(node.id);
        if (!currentNode) return node;

        const position = draggingDeviceIds.has(node.id as DeviceId)
          ? currentNode.position
          : node.position;

        return {
          ...currentNode,
          ...node,
          data: { ...node.data, position },
          dragging: currentNode.dragging,
          measured: currentNode.measured,
          position,
        };
      });

      return areNodeListsEqual(currentNodes, syncedNodes)
        ? currentNodes
        : syncedNodes;
    });
  }, [
    devices,
    ports,
    currentFloorId,
    selectedDeviceId,
    selectedDeviceIdSet,
    canEditDevices,
    setNodes,
  ]);

  // A drag belongs to the selection it started with.
  useEffect(() => {
    groupDragRef.current = null;
  }, [selectedDeviceIdSet]);

  const handleNodesChange: OnNodesChange<DeviceNode> = useCallback(
    (changes) => {
      const committedPositions = new Map<DeviceId, Position>();
      // Set from within the map below, where the drag ends.
      const ended: {
        group: { from: ReadonlyArray<GroupMember>; offset: Position } | null;
      } = { group: null };
      const isGroupMember = (deviceId: DeviceId) =>
        selectedDeviceIdSet.size > 1 && selectedDeviceIdSet.has(deviceId);

      const processedChanges = changes.map((change) => {
        if (change.type !== "position" || !change.position) return change;
        const deviceId = change.id as DeviceId;
        const device = devices.find((candidate) => candidate.id === deviceId);

        // A selection of several moves by one offset, or not at all: its
        // members never look for a free spot each (ADR 0034).
        if (device && isGroupMember(deviceId)) {
          const group = (groupDragRef.current ??= startGroupDrag(
            devices,
            device.floorId,
            selectedDeviceIdSet,
            canMoveDevices,
          ));
          const start = group.startOf.get(deviceId) ?? device.position;
          if (change.dragging) {
            draggingDeviceIdsRef.current.add(deviceId);
            const wanted = {
              x: change.position.x - start.x,
              y: change.position.y - start.y,
            };
            const offset = group.drag.resolve(wanted);
            const snapped = snapToGrid(change.position);
            const position = { x: start.x + offset.x, y: start.y + offset.y };
            setBlockedSpots((current) =>
              withBlockedSpot(
                current,
                deviceId,
                arePositionsEqual(snapped, position)
                  ? null
                  : { deviceId, position: snapped, size: device.size },
              ),
            );
            return { ...change, position };
          }

          draggingDeviceIdsRef.current.delete(deviceId);
          setBlockedSpots((current) =>
            withBlockedSpot(current, deviceId, null),
          );
          ended.group ??= { from: group.from, offset: group.drag.offset() };
          // Refused at the last moment (someone else moved a member), the
          // group stays where the server has it.
          const position = canMoveDevices(group.from, ended.group.offset)
            ? {
                x: start.x + ended.group.offset.x,
                y: start.y + ended.group.offset.y,
              }
            : device.position;
          return { ...change, position };
        }

        if (change.dragging) {
          draggingDeviceIdsRef.current.add(deviceId);
          if (device) {
            const result = devicePlacement.resolve({
              kind: "drag",
              deviceId,
              floorId: device.floorId,
              requestedPosition: change.position,
              size: device.size,
              startPosition: device.position,
            });

            if (result.ok) {
              // The device never overlaps an obstacle: it waits at the
              // nearest free spot, and the spot under the cursor shows it
              // cannot go there.
              const wanted = snapToGrid(change.position);
              const spot = arePositionsEqual(wanted, result.position)
                ? null
                : { deviceId: device.id, position: wanted, size: device.size };
              setBlockedSpots((current) =>
                withBlockedSpot(current, device.id, spot),
              );
              return {
                ...change,
                position: result.position,
              };
            }
          }
          return change;
        }

        draggingDeviceIdsRef.current.delete(deviceId);
        setBlockedSpots((current) => withBlockedSpot(current, deviceId, null));
        const committedPosition = devicePlacement.commitDrag(deviceId);
        if (committedPosition) {
          committedPositions.set(deviceId, committedPosition);
          return {
            ...change,
            position: committedPosition,
          };
        }
        return change;
      });

      if (ended.group) groupDragRef.current = null;
      onNodesChange(processedChanges);

      if (!canEditDevices || useConnectionStore.getState().isOffline) {
        // The connection dropped during the drag (ADR 0037): nothing is
        // sent, so the devices dropped go back to where the plan has them.
        const deviceById = new Map(devices.map((item) => [item.id, item]));
        const dropped = processedChanges.flatMap((change) =>
          change.type === "position" && !change.dragging ? [change.id] : [],
        );
        if (dropped.length > 0) {
          onNodesChange(
            dropped.flatMap((deviceId) => {
              const device = deviceById.get(deviceId as DeviceId);
              return device
                ? [
                    {
                      id: deviceId,
                      type: "position" as const,
                      position: device.position,
                      dragging: false,
                    },
                  ]
                : [];
            }),
          );
        }
        return;
      }
      if (ended.group) moveDevices(ended.group.from, ended.group.offset);
      committedPositions.forEach((position, deviceId) => {
        updateDevicePosition(deviceId, position);
      });
    },
    [
      canEditDevices,
      canMoveDevices,
      devicePlacement,
      devices,
      moveDevices,
      onNodesChange,
      selectedDeviceIdSet,
      updateDevicePosition,
    ],
  );

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: DeviceNode) => {
      if (activeDrawTool !== "device") {
        return;
      }

      const deviceId = node.id as DeviceId;
      // Shift (or Ctrl, ⌘) adds the device to the selection or takes it out
      // (ADR 0030); a selection of several is an editing tool.
      if (
        canEditDevices &&
        (event.shiftKey || event.ctrlKey || event.metaKey)
      ) {
        setSelectedDevices(
          selectedDeviceIdSet.has(deviceId)
            ? [...selectedDeviceIdSet].filter((id) => id !== deviceId)
            : [...selectedDeviceIdSet, deviceId],
        );
        return;
      }

      if (isMultiSelectMode) return;

      selectDevice(deviceId);
    },
    [
      activeDrawTool,
      canEditDevices,
      isMultiSelectMode,
      selectDevice,
      selectedDeviceIdSet,
      setSelectedDevices,
    ],
  );

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      setHoveredDevice(node.id as DeviceId);
    },
    [setHoveredDevice],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredDevice(null);
  }, [setHoveredDevice]);

  return {
    nodes,
    blockedSpots,
    handleNodesChange,
    handleNodeClick,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
  };
}
