import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import NetworkNode from "./NetworkNode";
import { CableHandle } from "./CableHandle";
import { SOCKET_HANDLE } from "@/canvas/cablePaths";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceId } from "@/types/map";
import { socketLabel } from "@/canvas/nodeLabel";
import { useIsSocketSeen } from "@/canvas/seenSockets";
import { NodeLabel, SOCKET_LABEL } from "./NodeLabel";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { cn } from "@/lib/utils";
import { PORT_ID_ATTRIBUTE, useCableGrip } from "@/canvas/hooks/useCableGrip";

type WallPortNodeType = Node<DeviceNodeData>;

function WallPortNode({ data: device, id }: NodeProps<WallPortNodeType>) {
  // A socket is passive (B13): its icon says only that the network saw a
  // device behind it.
  const isSeen = useIsSocketSeen(id);
  const grip = useCableGrip(id as DeviceId);
  // A socket has one front port: its icon is where a cable is drawn from.
  const socket = device.ports.at(0);

  return (
    <NetworkNode
      id={id}
      status={null}
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
            isSeen ? "text-up" : "text-muted-foreground",
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
        <NodeLabel
          name={socketLabel(device.name)}
          box={SOCKET_LABEL}
          className="text-center font-medium text-foreground"
        />
      </div>
    </NetworkNode>
  );
}

export default memo(WallPortNode, areDeviceNodePropsEqual);
