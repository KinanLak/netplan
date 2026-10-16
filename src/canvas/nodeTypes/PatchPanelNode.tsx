import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { shownPorts } from "@/devices/portState";
import { PORT_ID_ATTRIBUTE, useCableGrip } from "@/canvas/hooks/useCableGrip";
import { cn } from "@/lib/utils";
import type { DeviceId } from "@/types/map";

type PatchPanelNodeType = Node<DeviceNodeData>;

// A panel's ports sit in rows of 24, as on the rack.
const PANEL_COLUMNS = 24;

// A patch panel is passive: it has no status of its own, and nothing
// observes its ports, only the cables passing through them.
function PatchPanelNode({ data: device, id }: NodeProps<PatchPanelNodeType>) {
  const ports = shownPorts(device.ports);
  const grip = useCableGrip(id as DeviceId);
  return (
    <NetworkNode
      id={id}
      status="unknown"
      width={device.size.width}
      height={device.size.height}
      className="bg-linear-to-b from-secondary to-secondary/80"
    >
      <div className="flex items-center border-b border-border px-2 py-0.5">
        <span className="truncate text-[9px] font-bold tracking-wider text-muted-foreground uppercase">
          {device.name}
        </span>
      </div>
      <div
        className="grid gap-0.5 overflow-hidden p-1"
        onPointerDown={grip.onPointerDown}
        style={{
          gridTemplateColumns: `repeat(${PANEL_COLUMNS}, minmax(0, 1fr))`,
        }}
      >
        {ports.map((port) => (
          <div
            key={port.id}
            {...{ [PORT_ID_ATTRIBUTE]: port.id }}
            className={cn(
              "h-2 rounded-xs border border-border bg-muted",
              // In edit mode a port draws a cable rather than moving the panel.
              grip.isGrip && "nodrag cursor-crosshair hover:bg-primary",
            )}
            title={port.name}
          />
        ))}
      </div>

      <Handle type="target" position={Position.Left} className="opacity-0" />
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(PatchPanelNode, areDeviceNodePropsEqual);
