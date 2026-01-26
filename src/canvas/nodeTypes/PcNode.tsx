import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "../../types/map";

function PcNode({ data }: NodeProps<{ data: DeviceNodeData }>) {
  const device = data.data;
  const status = device.metadata.status ?? "unknown";

  const statusColors = {
    up: "border-emerald-400 bg-emerald-400/10",
    down: "border-red-400 bg-red-400/10",
    unknown: "border-slate-400 bg-slate-400/10",
  };

  const statusDot = {
    up: "bg-emerald-400",
    down: "bg-red-400",
    unknown: "bg-slate-400",
  };

  return (
    <div
      className={`
        relative rounded-lg border-2 shadow-md cursor-grab active:cursor-grabbing
        bg-gradient-to-br from-slate-100 to-slate-200
        ${statusColors[status]}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* PC Icon */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Monitor */}
        <div className="w-8 h-6 bg-slate-700 rounded-t border border-slate-600 flex items-center justify-center">
          <div className="w-6 h-4 bg-gradient-to-br from-blue-400 to-blue-600 rounded-sm" />
        </div>
        {/* Stand */}
        <div className="w-2 h-1 bg-slate-600" />
        <div className="w-4 h-0.5 bg-slate-600 rounded-b" />
      </div>

      {/* Status indicator */}
      <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${statusDot[status]}`} />

      {/* Hostname label */}
      <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[10px] font-medium text-slate-600 bg-white/80 px-1 rounded shadow-sm">
          {device.hostname ?? device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(PcNode);
