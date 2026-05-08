import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import PcNode from "./PcNode";
import type { Device } from "@/types/map";
import { buildDevice, seedMapStore } from "../../../test/storeHarness";

const renderPcNode = (overrides: Partial<Device> = {}) => {
  const device = buildDevice({
    type: "pc",
    name: "Workstation Alpha",
    hostname: "alpha-01",
    metadata: { status: "up", lastUser: "alice" },
    ...overrides,
  });

  seedMapStore({
    isEditMode: true,
    selectedDeviceId: null,
    highlightedDeviceIds: [],
    highlightedDeviceIdSet: new Set(),
  });

  return render(
    <ReactFlowProvider>
      <PcNode
        id={device.id}
        type={device.type}
        data={device}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        selected={false}
        dragging={false}
        zIndex={0}
        isConnectable={false}
        deletable={false}
        draggable={true}
        selectable={true}
      />
    </ReactFlowProvider>,
  );
};

afterEach(() => {
  cleanup();
});

describe("PcNode", () => {
  it("displays the hostname when defined and falls back to name otherwise", () => {
    renderPcNode({ hostname: "alpha-01" });
    expect(screen.getByText("alpha-01")).toBeTruthy();
    cleanup();

    renderPcNode({ hostname: undefined, name: "Backup PC" });
    expect(screen.getByText("Backup PC")).toBeTruthy();
  });

  it("shows the last user when present in metadata", () => {
    renderPcNode({ metadata: { status: "up", lastUser: "alice" } });
    expect(screen.getByText("alice")).toBeTruthy();
  });

  it("omits the last user block when metadata.lastUser is missing", () => {
    renderPcNode({ metadata: { status: "down" } });
    expect(screen.queryByText("alice")).toBe(null);
  });
});
