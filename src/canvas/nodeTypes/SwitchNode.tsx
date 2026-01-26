import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "../../types/map";

type SwitchNodeType = Node<{ data: DeviceNodeData }>;

function SwitchNode({ data }: NodeProps<SwitchNodeType>) {
  const device = data.data;
  const ports = device.metadata.ports ?? [];
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  const statusColors: Record<DeviceStatus, string> = {
    up: "bg-emerald-400",
    down: "bg-red-400",
    unknown: "bg-slate-400",
  };

  const portStatusColors: Record<DeviceStatus, string> = {
    up: "bg-emerald-500 shadow-emerald-500/50",
    down: "bg-red-500 shadow-red-500/50",
    unknown: "bg-slate-500",
  };

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
      className={`
        relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-lg shadow-xl cursor-grab active:cursor-grabbing
        border-2 transition-all duration-200
        ${isSelected ? "border-blue-500 shadow-[0_0_12px_3px_rgba(59,130,246,0.7)] ring-2 ring-blue-400" : isHighlighted ? "border-blue-400 shadow-[0_0_10px_2px_rgba(59,130,246,0.6)]" : "border-slate-600"}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Top bar with status */}
      <div className="flex items-center justify-between border-slate-600 px-2 py-1 border-b">
        <span className="font-bold text-slate-300 uppercase tracking-wider truncate text-[9px] max-w-[120px]">
          {device.hostname ?? device.name}
        </span>
        <div className={`rounded-full ${statusColors[status]} shadow-sm w-2 h-2`} />
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
            className={`
              rounded-sm ${portStatusColors[port.status]}
              shadow-sm hover:scale-125 transition-transform
              cursor-pointer w-3 h-3
            `}
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
