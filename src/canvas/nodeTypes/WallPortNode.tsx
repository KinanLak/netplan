import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import NetworkNode from "./NetworkNode";
import { CableHandle } from "./CableHandle";
import { SOCKET_HANDLE } from "@/canvas/cablePaths";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceId, DeviceStatus } from "@/types/map";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { cn } from "@/lib/utils";
import { PORT_ID_ATTRIBUTE, useCableGrip } from "@/canvas/hooks/useCableGrip";

type WallPortNodeType = Node<DeviceNodeData>;

function WallPortNode({ data: device, id }: NodeProps<WallPortNodeType>) {
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const grip = useCableGrip(id as DeviceId);
  // A socket has one front port: its icon is where a cable is drawn from.
  const socket = device.ports.at(0);

  return (
    <NetworkNode
      id={id}
      status={status}
      width={device.size.width}
      height={device.size.height}
      className="bg-card"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          {...(socket ? { [PORT_ID_ATTRIBUTE]: socket.id } : {})}
          onPointerDown={grip.onPointerDown}
          className={cn(
            "relative mb-1 rounded-xs",
            grip.isGrip &&
              socket &&
              "nodrag cursor-crosshair hover:ring-2 hover:ring-primary",
            status === "up" && "text-up",
            status === "down" && "text-down",
            status === "unknown" && "text-unknown",
          )}
        >
          <HugeiconsIcon
            icon={PlugSocketIcon}
            size={14}
            color="currentColor"
            strokeWidth={1.5}
          />
          <CableHandle id={SOCKET_HANDLE} />
        </div>
        {/* Label inside */}
        <span className="text-3xs max-w-max truncate px-0.5 leading-tight font-medium text-muted-foreground">
          {device.name}
        </span>
      </div>
    </NetworkNode>
  );
}

export default memo(WallPortNode, areDeviceNodePropsEqual);
