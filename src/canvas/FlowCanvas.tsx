import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type OnNodesChange,
  BackgroundVariant,
} from "@xyflow/react";
import { useMapStore } from "../store/useMapStore";
import { nodeTypes } from "./nodeTypes";
import type { DeviceNodeData } from "../types/map";

const SNAP_GRID: [number, number] = [20, 20];

export default function FlowCanvas() {
  const { devices, currentFloorId, selectedDeviceId, selectDevice, updateDevicePosition } = useMapStore();

  // Filter devices for current floor and convert to React Flow nodes
  const initialNodes = useMemo(() => {
    return devices
      .filter((d) => d.floorId === currentFloorId)
      .map(
        (device): Node<{ data: DeviceNodeData }> => ({
          id: device.id,
          type: device.type,
          position: device.position,
          data: { data: { ...device, selected: device.id === selectedDeviceId } },
          selected: device.id === selectedDeviceId,
        }),
      );
  }, [devices, currentFloorId, selectedDeviceId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  // Sync nodes when floor changes or devices update
  useMemo(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Handle node changes (drag, select, etc.)
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);

      // Update positions in store after drag
      changes.forEach((change) => {
        if (change.type === "position" && change.position && !change.dragging) {
          updateDevicePosition(change.id, change.position);
        }
      });
    },
    [onNodesChange, updateDevicePosition],
  );

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectDevice(node.id);
    },
    [selectDevice],
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    selectDevice(null);
  }, [selectDevice]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={handleNodesChange}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      snapToGrid={true}
      snapGrid={SNAP_GRID}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeStrokeColor={(n) => {
          if (n.type === "rack") return "#475569";
          if (n.type === "switch") return "#1e293b";
          if (n.type === "pc") return "#64748b";
          return "#94a3b8";
        }}
        nodeColor={(n) => {
          if (n.type === "rack") return "#64748b";
          if (n.type === "switch") return "#334155";
          if (n.type === "pc") return "#e2e8f0";
          return "#f1f5f9";
        }}
        nodeBorderRadius={4}
        maskColor="rgba(0, 0, 0, 0.1)"
        className="!bg-slate-100 !border-slate-200"
      />
    </ReactFlow>
  );
}
