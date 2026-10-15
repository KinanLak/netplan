import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";

type PatchPanelNodeType = Node<DeviceNodeData>;

// A patch panel is passive: it has no status of its own, only the ports a
// cable passes through.
function PatchPanelNode({ data: device, id }: NodeProps<PatchPanelNodeType>) {
  return (
    <NetworkNode
      id={id}
      status="unknown"
      width={device.size.width}
      height={device.size.height}
      className="bg-linear-to-b from-secondary to-secondary/80"
    >
      <div className="flex items-center border-b border-border px-2 py-0.5">
        <span className="truncate text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
          {device.name}
        </span>
      </div>
      <div
        className="gap-0.5 p-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
        }}
      >
        {Array.from({ length: 24 }, (_, index) => (
          <div
            key={index}
            className="h-2 rounded-xs border border-border bg-muted"
          />
        ))}
      </div>

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(PatchPanelNode, areDeviceNodePropsEqual);
