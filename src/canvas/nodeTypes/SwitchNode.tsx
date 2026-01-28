import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
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
    <div
      className={cn(
        "from-secondary to-secondary/80 relative cursor-grab rounded-lg bg-linear-to-b shadow-xl active:cursor-grabbing",
        "border-2 transition-all duration-200",
        isSelected &&
          "border-ring ring-ring shadow-[0_0_12px_3px_var(--ring)] ring-2",
        isHighlighted &&
          !isSelected &&
          "border-ring/70 shadow-[0_0_10px_2px_var(--ring)]",
        !isSelected && !isHighlighted && "border-border",
      )}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Top bar with status */}
      <div className="border-border flex items-center justify-between border-b px-2 py-1">
        <span className="text-muted-foreground max-w-30 truncate text-[9px] font-bold tracking-wider uppercase">
          {device.hostname ?? device.name}
        </span>
        <div
          className={cn(
            "h-2 w-2 rounded-full shadow-sm",
            status === "up" && "bg-chart-2",
            status === "down" && "bg-destructive",
            status === "unknown" && "bg-muted-foreground",
          )}
        />
      </div>

      {/* Ports grid */}
      <div
        className="gap-0.5 p-1"
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
              "h-3 w-3 cursor-pointer rounded-sm shadow-sm transition-transform hover:scale-125",
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
