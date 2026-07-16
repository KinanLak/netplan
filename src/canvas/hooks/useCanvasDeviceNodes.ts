import { useCallback, useEffect, useRef } from "react";
import { useNodesState } from "@xyflow/react";
import type { OnNodesChange } from "@xyflow/react";
import type {
  Device,
  DeviceId,
  DeviceMetadata,
  DrawTool,
  FloorId,
  PortInfo,
  Position,
  Size,
} from "@/types/map";
import { useDevicePlacement } from "@/devices/useDevicePlacement";
import { toDeviceNodes } from "@/devices/reactFlowDeviceAdapter";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";

interface UseCanvasDeviceNodesParams {
  devices: Array<Device>;
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
  updateDevicePositions: (
    updates: Array<{ deviceId: DeviceId; position: Position }>,
  ) => void;
  selectDevice: (deviceId: DeviceId | null) => void;
  setHoveredDevice: (deviceId: DeviceId | null) => void;
}

interface UseCanvasDeviceNodesResult {
  nodes: Array<DeviceNode>;
  handleNodesChange: OnNodesChange<DeviceNode>;
  handleNodeClick: (_: React.MouseEvent, node: DeviceNode) => void;
  handleNodeMouseEnter: (_: React.MouseEvent, node: DeviceNode) => void;
  handleNodeMouseLeave: () => void;
}

const arePositionsEqual = (a: Position, b: Position) =>
  a.x === b.x && a.y === b.y;

const areSizesEqual = (a: Size, b: Size) =>
  a.width === b.width && a.height === b.height;

const arePortsEqual = (a?: Array<PortInfo>, b?: Array<PortInfo>) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((port, index) => {
    const other = b[index];
    return (
      port.id === other.id &&
      port.number === other.number &&
      port.status === other.status
    );
  });
};

const areMetadataEqual = (a: DeviceMetadata, b: DeviceMetadata) => {
  return (
    a.ip === b.ip &&
    a.status === b.status &&
    a.model === b.model &&
    a.lastUser === b.lastUser &&
    arePortsEqual(a.ports, b.ports)
  );
};

const areNodeDataEqual = (a: DeviceNode["data"], b: DeviceNode["data"]) => {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.name === b.name &&
    a.hostname === b.hostname &&
    a.floorId === b.floorId &&
    arePositionsEqual(a.position, b.position) &&
    areSizesEqual(a.size, b.size) &&
    areMetadataEqual(a.metadata, b.metadata)
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

export function useCanvasDeviceNodes({
  devices,
  currentFloorId,
  selectedDeviceId,
  selectedDeviceIdSet,
  isMultiSelectMode,
  activeDrawTool,
  canEditDevices,
  checkCollision,
  updateDevicePosition,
  updateDevicePositions,
  selectDevice,
  setHoveredDevice,
}: UseCanvasDeviceNodesParams): UseCanvasDeviceNodesResult {
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNode>([]);
  const devicePlacement = useDevicePlacement((...args) =>
    checkCollision(
      ...args,
      isMultiSelectMode ? selectedDeviceIdSet : undefined,
    ),
  );
  const draggingDeviceIdsRef = useRef<Set<DeviceId>>(new Set());

  useEffect(() => {
    const nextNodes = toDeviceNodes(
      devices,
      currentFloorId,
      selectedDeviceId,
      canEditDevices,
      selectedDeviceIdSet,
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
    currentFloorId,
    selectedDeviceId,
    selectedDeviceIdSet,
    canEditDevices,
    setNodes,
  ]);

  const handleNodesChange: OnNodesChange<DeviceNode> = useCallback(
    (changes) => {
      const committedPositions = new Map<DeviceId, Position>();
      const processedChanges = changes.map((change) => {
        if (change.type === "position" && change.position && change.dragging) {
          draggingDeviceIdsRef.current.add(change.id as DeviceId);
          const device = devices.find(
            (candidate) => candidate.id === change.id,
          );
          if (device) {
            const result = devicePlacement.resolve({
              kind: "drag",
              deviceId: change.id as DeviceId,
              floorId: device.floorId,
              requestedPosition: change.position,
              size: device.size,
              startPosition: device.position,
            });

            if (result.ok) {
              return {
                ...change,
                position: result.position,
              };
            }
          }
        }

        if (change.type === "position" && change.position && !change.dragging) {
          draggingDeviceIdsRef.current.delete(change.id as DeviceId);
          const committedPosition = devicePlacement.commitDrag(
            change.id as DeviceId,
          );
          if (committedPosition) {
            committedPositions.set(change.id as DeviceId, committedPosition);
            return {
              ...change,
              position: committedPosition,
            };
          }
        }

        return change;
      });

      onNodesChange(processedChanges);

      if (canEditDevices) {
        if (committedPositions.size > 1) {
          updateDevicePositions(
            [...committedPositions].map(([deviceId, position]) => ({
              deviceId,
              position,
            })),
          );
        } else {
          committedPositions.forEach((position, deviceId) => {
            updateDevicePosition(deviceId, position);
          });
        }
      }
    },
    [
      canEditDevices,
      devicePlacement,
      devices,
      onNodesChange,
      updateDevicePosition,
      updateDevicePositions,
    ],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      if (activeDrawTool !== "device") {
        return;
      }

      if (isMultiSelectMode) return;

      selectDevice(node.id as DeviceId);
    },
    [activeDrawTool, isMultiSelectMode, selectDevice],
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
    handleNodesChange,
    handleNodeClick,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
  };
}
