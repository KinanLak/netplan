import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "../../types/map";

function SwitchNode({ data }: NodeProps<{ data: DeviceNodeData }>) {
  const device = data.data;
  const ports = device.metadata.ports ?? [];
  const status = device.metadata.status ?? "unknown";

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

  // Generate 24 ports in 2x12 grid
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
      className="relative bg-gradient-to-b from-slate-800 to-slate-900 rounded-lg border-2 border-slate-600 shadow-xl cursor-grab active:cursor-grabbing"
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Top bar with status */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-slate-600">
        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-wider truncate max-w-[120px]">
          {device.hostname ?? device.name}
        </span>
        <div className={`w-2 h-2 rounded-full ${statusColors[status]} shadow-sm`} />
      </div>

      {/* Ports grid - 2 rows x 12 columns */}
      <div className="p-1.5 grid grid-rows-2 grid-cols-12 gap-0.5">
        {displayPorts.slice(0, 24).map((port) => (
          <div
            key={port.id}
            className={`
              w-3 h-3 rounded-sm ${portStatusColors[port.status]}
              shadow-sm hover:scale-125 transition-transform
              cursor-pointer
            `}
            title={`Port ${port.number}: ${port.status}${port.connectedTo ? ` → ${port.connectedTo}` : ""}`}
          />
        ))}
      </div>

      {/* Model label */}
      {device.metadata.model && (
        <div className="absolute bottom-0.5 left-1 right-1 text-center">
          <span className="text-[8px] text-slate-500 truncate block">{device.metadata.model}</span>
        </div>
      )}

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

export default memo(SwitchNode);
