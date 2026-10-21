import { memo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DeviceAccessIcon } from "@hugeicons/core-free-icons";
import NetworkNode from "./NetworkNode";
import { CableHandle } from "./CableHandle";
import { STATUS_HANDLE } from "@/canvas/cablePaths";
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
          <span className="relative">
            <StatusDot status={status} />
            <CableHandle id={STATUS_HANDLE} />
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center px-0.5">
          <span className="text-2xs text-center leading-tight font-bold break-all text-foreground uppercase">
            {device.hostname ?? device.name}
          </span>
        </div>
      </div>
    </NetworkNode>
  );
}

export default memo(EndpointNode, areDeviceNodePropsEqual);
