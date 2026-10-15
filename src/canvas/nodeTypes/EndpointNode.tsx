import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DeviceAccessIcon } from "@hugeicons/core-free-icons";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceStatus } from "@/types/map";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { StatusDot } from "@/components/StatusDot";

type EndpointNodeType = Node<DeviceNodeData>;

// Any device with a MAC address that is not a workstation: printer, phone,
// server, access point.
function EndpointNode({ data: device, id }: NodeProps<EndpointNodeType>) {
  const status: DeviceStatus = device.metadata.status ?? "unknown";

  return (
    <NetworkNode
      id={id}
      status={status}
      width={device.size.width}
      height={device.size.height}
      className="bg-card"
    >
      <div className="absolute inset-1.5 flex flex-col justify-between overflow-hidden">
        <div className="flex items-start justify-between">
          <span className="text-muted-foreground">
            <HugeiconsIcon
              icon={DeviceAccessIcon}
              size={14}
              color="currentColor"
              strokeWidth={1.5}
            />
          </span>
          <StatusDot status={status} />
        </div>
        <span className="text-3xs truncate text-center leading-tight font-semibold text-foreground">
          {device.hostname ?? device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(EndpointNode, areDeviceNodePropsEqual);
