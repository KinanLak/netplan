import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "../../types/map";

type RackNodeType = Node<{ data: DeviceNodeData }>;

function RackNode({ data }: NodeProps<RackNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isRotated = device.rotation === 90;

  const statusColors = {
    up: "bg-emerald-500",
    down: "bg-red-500",
    unknown: "bg-slate-400",
  };

  return (
    <div
      className={`
        relative bg-gradient-to-b from-slate-700 to-slate-800 rounded-lg shadow-lg cursor-grab active:cursor-grabbing
        border-2 ${isHighlighted ? "!border-blue-400 !shadow-[0_0_10px_2px_rgba(59,130,246,0.6)] animate-pulse" : "border-slate-600"}
      `}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Rack frame details */}
      <div className="absolute inset-1 border border-slate-500 rounded opacity-50" />

      {/* Status indicator */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusColors[status]}`} />

      {/* Rack slots visualization - adapts to orientation */}
      <div
        className={`absolute overflow-hidden ${isRotated ? "inset-2 left-6 flex flex-row gap-0.5" : "inset-2 top-6 flex flex-col gap-0.5"}`}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`bg-slate-600 rounded-sm border border-slate-500 ${isRotated ? "w-3 h-full" : "h-3 w-full"}`}
          />
        ))}
      </div>

      {/* Label */}
      <div className={`absolute text-center ${isRotated ? "bottom-1 left-1 right-1" : "bottom-1 left-1 right-1"}`}>
        <span className="text-[10px] font-medium text-white truncate block">{device.name}</span>
      </div>

      {/* Handles - position adapts to rotation */}
      <Handle type="target" position={isRotated ? Position.Left : Position.Top} className="opacity-0" />
      <Handle type="source" position={isRotated ? Position.Right : Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(RackNode);
