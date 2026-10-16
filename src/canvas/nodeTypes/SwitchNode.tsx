import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceStatus } from "@/types/map";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { StatusDot } from "@/components/StatusDot";
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import { cn } from "@/lib/utils";

type SwitchNodeType = Node<DeviceNodeData>;

function SwitchNode({ data: device, id }: NodeProps<SwitchNodeType>) {
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  // Two rows of twelve fit the node; the drawer lists them all.
  const shownPorts = device.ports
    .filter((port) => port.kind === "interface")
    .slice(0, 24);

  return (
    <NetworkNode
      id={id}
      status={status}
      width={device.size.width}
      height={device.size.height}
      className="bg-linear-to-b from-secondary to-secondary/80"
    >
      {/* Top bar with status */}
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="max-w-30 truncate text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
          {device.hostname ?? device.name}
        </span>
        <StatusDot status={status} className="shadow-sm" />
      </div>

      {/* Ports grid */}
      <div
        className="nodrag gap-0.5 p-1"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        }}
      >
        {shownPorts.map((port) => (
          <div
            key={port.id}
            className={cn(
              "h-3 w-3 cursor-pointer rounded-xs shadow-sm transition-transform hover:scale-125",
              port.status === "up" && "bg-up",
              port.status === "down" && "bg-down",
              (port.status ?? "unknown") === "unknown" && "bg-unknown",
            )}
            title={`${port.name} : ${DEVICE_STATUS_LABELS[port.status ?? "unknown"]}`}
          />
        ))}
      </div>

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(SwitchNode, areDeviceNodePropsEqual);
