import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";
import type { Node, NodeProps } from "@xyflow/react";
import { StatusDot } from "@/components/StatusDot";

type RackNodeType = Node<DeviceNodeData>;

function RackNode({ data, id }: NodeProps<RackNodeType>) {
  const device = data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";

  return (
    <NetworkNode
      id={id}
      status={status}
      width={device.size.width}
      height={device.size.height}
      className="bg-linear-to-b from-secondary to-secondary/80"
    >
      {/* Rack frame details */}
      <div className="absolute inset-1 rounded border border-border opacity-50" />

      {/* Header with label and status */}
      <div className="absolute top-1 right-1 left-1 flex items-center justify-between px-1">
        <span className="truncate text-[8px] font-medium text-foreground">
          {device.name}
        </span>
        <StatusDot status={status} />
      </div>

      {/* Rack slots visualization */}
      <div className="absolute inset-2 top-5 flex flex-col gap-0.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-3 w-full rounded-sm border border-border bg-muted"
          />
        ))}
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(RackNode, areDeviceNodePropsEqual);
