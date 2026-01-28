import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlugSocketIcon } from "@hugeicons/core-free-icons";
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

  const iconColors = {
    up: "text-emerald-500",
    down: "text-red-500",
    unknown: "text-slate-500",
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
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`mb-1 ${iconColors[status]}`}>
          <HugeiconsIcon icon={PlugSocketIcon} size={14} color="currentColor" strokeWidth={1.5} />
        </div>
        {/* Label inside */}
        <span className="text-2xs font-medium text-slate-600 truncate max-w-max px-0.5 leading-tight">
          {device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(WallPortNode);
