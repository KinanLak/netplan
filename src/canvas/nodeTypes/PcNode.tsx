import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, UserIcon } from "@hugeicons/core-free-icons";
import type { DeviceNodeData, DeviceStatus } from "../../types/map";

type PcNodeType = Node<{ data: DeviceNodeData }>;

function PcNode({ data }: NodeProps<PcNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;

  const statusColors = {
    up: "border-emerald-400 bg-emerald-50",
    down: "border-red-400 bg-red-50",
    unknown: "border-slate-300 bg-slate-50",
  };

  const statusDot = {
    up: "bg-emerald-500",
    down: "bg-red-500",
    unknown: "bg-slate-400",
  };

  const isSelected = device.selected;

  return (
    <div
      className={`
        relative rounded-lg border-2 shadow-md cursor-grab active:cursor-grabbing transition-all duration-200
        ${statusColors[status]}
        ${isSelected ? "border-blue-500! shadow-[0_0_12px_3px_rgba(59,130,246,0.7)]! ring-2 ring-blue-400" : isHighlighted ? "border-blue-400! shadow-[0_0_10px_2px_rgba(59,130,246,0.6)]!" : ""}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Content - hostname and lastUser inside */}
      <div className="absolute inset-1 flex flex-col justify-between overflow-hidden">
        {/* Top: small PC icon + status */}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">
            <HugeiconsIcon icon={ComputerIcon} size={16} color="currentColor" strokeWidth={1.5} />
          </span>
          <div className={`w-2 h-2 rounded-full ${statusDot[status]}`} />
        </div>

        {/* Middle: hostname */}
        <div className="flex-1 flex items-center justify-center px-0.5">
          <span className="text-xs uppercase font-bold text-slate-700 truncate text-center leading-tight">
            {device.hostname ?? device.name}
          </span>
        </div>

        {/* Bottom: last user */}
        {device.metadata.lastUser ? (
          <div className="flex items-center gap-0.5 justify-center text-blue-600">
            <HugeiconsIcon icon={UserIcon} size={10} color="currentColor" strokeWidth={1.5} />
            <span className="text-[8px] truncate">{device.metadata.lastUser}</span>
          </div>
        ) : (
          <div className="h-2.5" />
        )}
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(PcNode);
