import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
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

  return (
    <div
      className={`
        relative rounded-lg border-2 shadow-md cursor-grab active:cursor-grabbing
        ${statusColors[status]}
        ${isHighlighted ? "!border-blue-400 !shadow-[0_0_10px_2px_rgba(59,130,246,0.6)] animate-pulse" : ""}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Content - hostname and lastUser inside */}
      <div className="absolute inset-1 flex flex-col justify-between overflow-hidden">
        {/* Top: small PC icon + status */}
        <div className="flex items-center justify-between">
          <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <div className={`w-2 h-2 rounded-full ${statusDot[status]}`} />
        </div>

        {/* Middle: hostname */}
        <div className="flex-1 flex items-center justify-center px-0.5">
          <span className="text-[9px] font-medium text-slate-700 truncate text-center leading-tight">
            {device.hostname ?? device.name}
          </span>
        </div>

        {/* Bottom: last user */}
        {device.metadata.lastUser ? (
          <div className="flex items-center gap-0.5 justify-center">
            <svg className="w-2 h-2 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            <span className="text-[8px] text-blue-600 truncate">{device.metadata.lastUser}</span>
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
