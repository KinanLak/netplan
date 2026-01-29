import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import NetworkNode from "./NetworkNode";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";
import { cn } from "@/lib/utils";

type SwitchNodeType = Node<{ data: DeviceNodeData }>;

function SwitchNode({ data }: NodeProps<SwitchNodeType>) {
  const device = data.data;
  const ports = device.metadata.ports ?? [];
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

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
      status={status}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      width={device.size.width}
      height={device.size.height}
      className="from-secondary to-secondary/80 bg-linear-to-b"
    >
      {/* Top bar with status */}
      <div className="border-border flex items-center justify-between border-b px-2 py-1">
        <span className="text-muted-foreground max-w-30 truncate text-[9px] font-bold tracking-wider uppercase">
          {device.hostname ?? device.name}
        </span>
        <div
          className={cn(
            "h-2 w-2 rounded-full shadow-sm",
            status === "up" && "bg-up",
            status === "down" && "bg-down",
            status === "unknown" && "bg-unknown",
          )}
        />
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

export default memo(SwitchNode);
