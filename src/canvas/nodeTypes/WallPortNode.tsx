import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "../../types/map";

type WallPortNodeType = Node<{ data: DeviceNodeData }>;

function WallPortNode({ data }: NodeProps<WallPortNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  const statusColors = {
    up: "border-emerald-400",
    down: "border-red-400",
    unknown: "border-slate-400",
  };

  const innerColors = {
    up: "bg-emerald-100",
    down: "bg-red-100",
    unknown: "bg-slate-100",
  };

  return (
    <div
      className={`
        relative rounded shadow cursor-grab active:cursor-grabbing bg-white
        border-2 transition-all duration-200
        ${isSelected ? "border-blue-500 shadow-[0_0_12px_3px_rgba(59,130,246,0.7)] ring-2 ring-blue-400" : isHighlighted ? "border-blue-400 shadow-[0_0_10px_2px_rgba(59,130,246,0.6)]" : statusColors[status]}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Content: RJ45 icon + label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
        {/* Small RJ45 port visualization */}
        <div className={`w-4 h-3 rounded-sm border border-slate-400 ${innerColors[status]} mb-1`}>
          <div className="flex justify-center gap-px pt-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-0.5 h-1 bg-amber-600" />
            ))}
          </div>
        </div>
        {/* Label inside */}
        <span className="text-[8px] font-medium text-slate-600 truncate max-w-full px-0.5 leading-tight">
          {device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(WallPortNode);
