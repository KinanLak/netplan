import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import NetworkNode from "./NetworkNode";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";
import { cn } from "@/lib/utils";

type WallPortNodeType = Node<{ data: DeviceNodeData }>;

function WallPortNode({ data }: NodeProps<WallPortNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  return (
    <NetworkNode
      status={status}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      width={device.size.width}
      height={device.size.height}
      className="bg-card"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn(
            "mb-1",
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
        </div>
        {/* Label inside */}
        <span className="text-3xs text-muted-foreground max-w-max truncate px-0.5 leading-tight font-medium">
          {device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(WallPortNode);
