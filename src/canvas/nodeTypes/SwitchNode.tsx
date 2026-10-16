import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceStatus, DeviceId } from "@/types/map";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { StatusDot } from "@/components/StatusDot";
import {
  PORT_STATE_CLASSES,
  PORT_STATE_LABELS,
  portColumns,
  portState,
  shownPorts,
} from "@/devices/portState";
import { cn } from "@/lib/utils";
import { PORT_ID_ATTRIBUTE, useCableGrip } from "@/canvas/hooks/useCableGrip";

type SwitchNodeType = Node<DeviceNodeData>;

function SwitchNode({ data: device, id }: NodeProps<SwitchNodeType>) {
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const ports = shownPorts(device.ports);
  const grip = useCableGrip(id as DeviceId);

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
        className="nodrag grid justify-items-center gap-0.5 overflow-hidden p-1"
        onPointerDown={grip.onPointerDown}
        style={{
          gridTemplateColumns: `repeat(${portColumns(ports.length)}, minmax(0, 1fr))`,
        }}
      >
        {ports.map((port) => (
          <div
            key={port.id}
            {...{ [PORT_ID_ATTRIBUTE]: port.id }}
            className={cn(
              "aspect-square w-full max-w-3 rounded-xs shadow-sm transition-transform hover:scale-125",
              grip.isGrip && "cursor-crosshair",
              PORT_STATE_CLASSES[portState(port)],
            )}
            title={`${port.name} : ${PORT_STATE_LABELS[portState(port)]}`}
          />
        ))}
      </div>

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(SwitchNode, areDeviceNodePropsEqual);
