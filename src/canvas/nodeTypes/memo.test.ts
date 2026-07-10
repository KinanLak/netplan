import { describe, expect, it } from "bun:test";
import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceId } from "@/types/map";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { buildDevice } from "../../../test/storeHarness";
import { areDeviceNodePropsEqual } from "./memo";

const did = (s: string) => s as DeviceId;

type DeviceNode = Node<DeviceNodeData>;

const nodeProps = (
  overrides: Partial<NodeProps<DeviceNode>> = {},
): NodeProps<DeviceNode> => ({
  id: "device-1",
  type: "pc",
  data: buildDevice({ id: did("device-1") }) as DeviceNodeData,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  selected: false,
  dragging: false,
  zIndex: 0,
  isConnectable: false,
  deletable: false,
  draggable: true,
  selectable: true,
  ...overrides,
});

describe("device node memo comparator", () => {
  it("only compares node id and data identity", () => {
    const data = buildDevice({ id: did("device-1") }) as DeviceNodeData;

    expect(
      areDeviceNodePropsEqual(
        nodeProps({ data, selected: false }),
        nodeProps({ data, selected: true }),
      ),
    ).toBe(true);
    expect(
      areDeviceNodePropsEqual(
        nodeProps({ data }),
        nodeProps({ id: "device-2", data }),
      ),
    ).toBe(false);
    expect(
      areDeviceNodePropsEqual(
        nodeProps({ data }),
        nodeProps({ data: { ...data } }),
      ),
    ).toBe(false);
  });
});
