import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";

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
    <div
      className={cn(
        "relative bg-linear-to-b from-secondary to-secondary/80 rounded-lg shadow-xl cursor-grab active:cursor-grabbing",
        "border-2 transition-all duration-200",
        isSelected && "border-ring shadow-[0_0_12px_3px_var(--ring)] ring-2 ring-ring",
        isHighlighted && !isSelected && "border-ring/70 shadow-[0_0_10px_2px_var(--ring)]",
        !isSelected && !isHighlighted && "border-border",
      )}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Top bar with status */}
      <div className="flex items-center justify-between border-border px-2 py-1 border-b">
        <span className="font-bold text-muted-foreground uppercase tracking-wider truncate text-[9px] max-w-30">
          {device.hostname ?? device.name}
        </span>
        <div
          className={cn(
            "rounded-full shadow-sm w-2 h-2",
            status === "up" && "bg-chart-2",
            status === "down" && "bg-destructive",
            status === "unknown" && "bg-muted-foreground",
          )}
        />
      </div>

      {/* Ports grid */}
      <div
        className="p-1 gap-0.5"
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
              "rounded-sm shadow-sm hover:scale-125 transition-transform cursor-pointer w-3 h-3",
              port.status === "up" && "bg-chart-2 shadow-chart-2/50",
              port.status === "down" && "bg-destructive shadow-destructive/50",
              port.status === "unknown" && "bg-muted-foreground",
            )}
            title={`Port ${port.number}: ${port.status}`}
          />
        ))}
      </div>

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

export default memo(SwitchNode);
