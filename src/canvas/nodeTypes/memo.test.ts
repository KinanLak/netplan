import { describe, expect, it } from "bun:test";
import type { Node, NodeProps } from "@xyflow/react";
import type { Device } from "@/types/map";
import { buildDevice } from "../../../test/storeHarness";
import { areDeviceNodePropsEqual } from "./memo";

type DeviceNode = Node<Device>;

const nodeProps = (
  overrides: Partial<NodeProps<DeviceNode>> = {},
): NodeProps<DeviceNode> => ({
  id: "device-1",
  type: "pc",
  data: buildDevice({ id: "device-1" }),
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
    const data = buildDevice({ id: "device-1" });

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
