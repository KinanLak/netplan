import { memo } from "react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import type { Node, NodeProps } from "@xyflow/react";
import { NodeLabel, RACK_LABEL } from "./NodeLabel";

type RackNodeType = Node<DeviceNodeData>;

function RackNode({ data: device, id }: NodeProps<RackNodeType>) {
  return (
    <NetworkNode
      id={id}
      status={null}
      width={device.size.width}
      height={device.size.height}
      className="bg-linear-to-b from-secondary to-secondary/80"
    >
      {/* Rack frame details */}
      <div className="absolute inset-1 rounded border border-border opacity-50" />

      {/* Header with label: a rack is passive, so it has no status */}
      <div className="absolute top-1 right-1 left-1 flex items-center justify-between px-1">
        <NodeLabel
          name={device.name}
          box={RACK_LABEL}
          className="font-medium text-foreground"
        />
      </div>

      {/* Rack slots visualization */}
      <div className="absolute inset-2 top-5 flex flex-col gap-0.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-3 w-full rounded-sm border border-border bg-muted"
          />
        ))}
      </div>
    </NetworkNode>
  );
}

export default memo(RackNode, areDeviceNodePropsEqual);
