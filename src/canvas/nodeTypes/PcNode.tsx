import { memo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, UserIcon } from "@hugeicons/core-free-icons";
import NetworkNode from "./NetworkNode";
import { CableHandle } from "./CableHandle";
import { STATUS_HANDLE } from "@/canvas/cablePaths";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceStatus } from "@/types/map";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { StatusDot } from "@/components/StatusDot";
import { CARD_LABEL, NodeLabel } from "./NodeLabel";

type PcNodeType = Node<DeviceNodeData>;

function PcNode({ data: device, id }: NodeProps<PcNodeType>) {
  const status: DeviceStatus = device.metadata.status ?? "unknown";

  return (
    <NetworkNode
      id={id}
      status={status}
      width={device.size.width}
      height={device.size.height}
      className="bg-card"
    >
      {/* Content - hostname and lastUser inside */}
      <div className="absolute inset-1.5 flex flex-col justify-between overflow-hidden">
        {/* Top: small PC icon + status */}
        <div className="flex items-start justify-between">
          <span className="text-muted-foreground">
            <HugeiconsIcon
              icon={ComputerIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
          </span>
          <span className="relative">
            <StatusDot status={status} />
            <CableHandle id={STATUS_HANDLE} />
          </span>
        </div>

        {/* Middle: name */}
        <div className="flex flex-1 items-center justify-center px-0.5">
          <NodeLabel
            name={device.name}
            box={CARD_LABEL}
            className="text-center font-bold text-foreground"
          />
        </div>

        {/* Bottom: last user */}
        {device.metadata.lastUser ? (
          <div className="flex items-center justify-center gap-0.5 text-primary">
            <HugeiconsIcon
              icon={UserIcon}
              size={10}
              color="currentColor"
              strokeWidth={1.5}
            />
            <span className="truncate text-[8px]">
              {device.metadata.lastUser}
            </span>
          </div>
        ) : (
          <div className="h-2.5" />
        )}
      </div>
    </NetworkNode>
  );
}

export default memo(PcNode, areDeviceNodePropsEqual);
