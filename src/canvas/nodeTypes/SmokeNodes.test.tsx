import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import RackNode from "./RackNode";
import SwitchNode from "./SwitchNode";
import WallPortNode from "./WallPortNode";
import type { Device, DeviceId, Port } from "@/types/map";
import { numberedPorts } from "@/devices/ports";
import type { DeviceNodeData } from "@/devices/reactFlowDeviceAdapter";
import { buildDevice, seedMapStore } from "../../../test/storeHarness";

const renderWithFlow = (node: React.ReactElement) => {
  seedMapStore({
    isEditMode: true,
    selectedDeviceId: null,
    highlightedDeviceIds: [],
    highlightedDeviceIdSet: new Set(),
  });
  return render(<ReactFlowProvider>{node}</ReactFlowProvider>);
};

const nodeProps = (device: Device, ports: Array<Port> = []) => ({
  id: device.id,
  type: device.type,
  data: { ...device, ports } satisfies DeviceNodeData,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
  selected: false,
  dragging: false,
  zIndex: 0,
  isConnectable: false,
  deletable: false,
  draggable: true,
  selectable: true,
});

afterEach(() => {
  cleanup();
});

describe("device node smoke renders", () => {
  it("RackNode shows the device name", () => {
    const device = buildDevice({
      id: "rack-1" as DeviceId,
      type: "rack",
      name: "Rack-A",
      size: { width: 80, height: 160 },
      metadata: { status: "up" },
    });
    renderWithFlow(<RackNode {...nodeProps(device)} />);
    expect(screen.getByText("Rack-A")).toBeTruthy();
  });

  it("SwitchNode shows its first 24 interfaces with their status", () => {
    const device = buildDevice({
      id: "switch-1" as DeviceId,
      type: "switch",
      name: "Switch-A",
      hostname: "sw-a",
      size: { width: 200, height: 60 },
      metadata: { status: "up" },
    });

    const ports = numberedPorts(
      device.id,
      "interface",
      48,
      (n) => `Gi1/0/${n}`,
    );
    ports[0] = { ...ports[0], status: "up" };

    const { container } = renderWithFlow(
      <SwitchNode {...nodeProps(device, ports)} />,
    );
    expect(screen.getByText("sw-a")).toBeTruthy();

    expect(container.querySelectorAll('[title^="Gi1/0/"]').length).toBe(24);
    expect(
      container.querySelector('[title="Gi1/0/1 : En ligne"]'),
    ).toBeTruthy();
  });

  it("WallPortNode renders the device name", () => {
    const device = buildDevice({
      id: "wp-1" as DeviceId,
      type: "wall-port",
      name: "WP-1",
      size: { width: 40, height: 40 },
      metadata: { status: "down" },
    });
    renderWithFlow(<WallPortNode {...nodeProps(device)} />);
    expect(screen.getByText("WP-1")).toBeTruthy();
  });
});
