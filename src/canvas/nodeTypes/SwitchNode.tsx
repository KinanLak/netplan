import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";

type SwitchNodeType = Node<DeviceNodeData>;

function SwitchNode({ data, id }: NodeProps<SwitchNodeType>) {
  const device = data;
  const ports = device.metadata.ports ?? [];
  const status: DeviceStatus = device.metadata.status ?? "unknown";

  // Generate 24 ports
  const displayPorts =
    ports.length > 0
      ? ports
      : Array.from({ length: 24 }, (_, i) => ({
          id: `port-${i + 1}`,
          number: i + 1,
          status: "unknown" as DeviceStatus,
        }));

  return (
    <NetworkNode
      id={id}
      status={status}
      width={device.size.width}
      height={device.size.height}
      className="bg-linear-to-b from-secondary to-secondary/80"
    >
      {/* Top bar with status */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="max-w-30 truncate text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
          {device.hostname ?? device.name}
        </span>
        <StatusDot status={status} className="shadow-sm" />
      </div>

      {/* Ports grid */}
      <div
        className="nodrag gap-0.5 p-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        }}
      >
        {displayPorts.slice(0, 24).map((port) => (
          <div
            key={port.id}
            className={cn(
              "h-3 w-3 cursor-pointer rounded-xs shadow-sm transition-transform hover:scale-125",
              port.status === "up" && "bg-up",
              port.status === "down" && "bg-down",
              port.status === "unknown" && "bg-unknown",
            )}
            title={`Port ${port.number}: ${port.status}`}
          />
        ))}
      </div>

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(SwitchNode, areDeviceNodePropsEqual);
