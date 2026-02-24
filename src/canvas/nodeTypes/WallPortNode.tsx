import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import NetworkNode from "./NetworkNode";
import { areDeviceNodePropsEqual } from "./memo";
import type { Node, NodeProps } from "@xyflow/react";
import type { Device, DeviceStatus } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";

type WallPortNodeType = Node<{ data: Device }>;

function WallPortNode({ data, id }: NodeProps<WallPortNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isSelected = useMapStore((s) => s.selectedDeviceId === id);
  const isHighlighted = useMapStore((s) => s.highlightedDeviceIds.includes(id));

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
        <span className="text-3xs max-w-max truncate px-0.5 leading-tight font-medium text-muted-foreground">
          {device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </NetworkNode>
  );
}

export default memo(WallPortNode, areDeviceNodePropsEqual);
