import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "../../types/map";

type RackNodeType = Node<{ data: DeviceNodeData }>;

function RackNode({ data }: NodeProps<RackNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  const statusColors = {
    up: "bg-emerald-500",
    down: "bg-red-500",
    unknown: "bg-slate-400",
  };

  return (
    <div
      className={`
        relative bg-linear-to-b from-slate-700 to-slate-800 rounded-lg shadow-lg cursor-grab active:cursor-grabbing
        border-2 transition-all duration-200
        ${isSelected ? "border-blue-500 shadow-[0_0_12px_3px_rgba(59,130,246,0.7)] ring-2 ring-blue-400" : isHighlighted ? "border-blue-400 shadow-[0_0_10px_2px_rgba(59,130,246,0.6)]" : "border-slate-600"}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Rack frame details */}
      <div className="absolute inset-1 border border-slate-500 rounded opacity-50" />

      {/* Header with label and status */}
      <div className="absolute top-1 left-1 right-1 flex items-center justify-between px-1">
        <span className="text-[8px] font-medium text-white truncate">{device.name}</span>
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusColors[status]}`} />
      </div>

      {/* Rack slots visualization */}
      <div className="absolute inset-2 top-5 flex flex-col gap-0.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-slate-600 rounded-sm border border-slate-500 h-3 w-full" />
        ))}
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(RackNode);
