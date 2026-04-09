import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, UserIcon } from "@hugeicons/core-free-icons";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";
import { StatusDot } from "@/components/StatusDot";

type PcNodeType = Node<DeviceNodeData>;

function PcNode({ data, id }: NodeProps<PcNodeType>) {
  const device = data.data;
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
          <StatusDot status={status} />
        </div>

        {/* Middle: hostname */}
        <div className="flex flex-1 items-center justify-center px-0.5">
          <span className="text-2xs text-center leading-tight font-bold text-foreground uppercase">
            {device.hostname ?? device.name}
          </span>
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

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(PcNode, areDeviceNodePropsEqual);
