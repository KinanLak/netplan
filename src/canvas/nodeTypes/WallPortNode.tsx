import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "../../types/map";

function WallPortNode({ data }: NodeProps<{ data: DeviceNodeData }>) {
  const device = data.data;
  const status = device.metadata.status ?? "unknown";

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
        relative rounded border-2 shadow cursor-grab active:cursor-grabbing
        bg-white ${statusColors[status]}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* RJ45 port visualization */}
      <div className="absolute inset-2 flex items-center justify-center">
        <div className={`w-4 h-3 rounded-sm border border-slate-400 ${innerColors[status]}`}>
          {/* Port contacts */}
          <div className="flex justify-center gap-px pt-0.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-0.5 h-1 bg-amber-600" />
            ))}
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[9px] font-medium text-slate-500 bg-white/80 px-0.5 rounded">{device.name}</span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(WallPortNode);
