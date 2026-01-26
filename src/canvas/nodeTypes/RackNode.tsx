import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "../../types/map";

function RackNode({ data }: NodeProps<{ data: DeviceNodeData }>) {
  const device = data.data;
  const status = device.metadata.status ?? "unknown";

  const statusColors = {
    up: "bg-emerald-500",
    down: "bg-red-500",
    unknown: "bg-slate-400",
  };

  return (
    <div
      className="relative bg-gradient-to-b from-slate-700 to-slate-800 rounded-lg border-2 border-slate-600 shadow-lg cursor-grab active:cursor-grabbing"
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Rack frame details */}
      <div className="absolute inset-1 border border-slate-500 rounded opacity-50" />

      {/* Status indicator */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusColors[status]}`} />

      {/* Rack slots visualization */}
      <div className="absolute inset-2 top-6 flex flex-col gap-0.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-600 rounded-sm border border-slate-500" />
        ))}
      </div>

      {/* Label */}
      <div className="absolute bottom-1 left-1 right-1 text-center">
        <span className="text-[10px] font-medium text-white truncate block">{device.name}</span>
      </div>

      {/* Handles for potential future connections */}
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(RackNode);
