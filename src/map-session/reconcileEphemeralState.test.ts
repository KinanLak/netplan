import { describe, expect, it } from "bun:test";
import type { Device, DeviceId, FloorId } from "@/types/map";
import { reconcileEphemeralState } from "./reconcileEphemeralState";

const floorId = "floor:a" as FloorId;
const device = (id: string): Device => ({
  id: id as DeviceId,
  floorId,
  type: "pc",
  name: id,
  position: { x: 0, y: 0 },
  size: { width: 80, height: 80 },
  metadata: {},
});

describe("reconcileEphemeralState", () => {
  it("clears selected, hovered, and highlighted ids missing from document", () => {
    const patch = reconcileEphemeralState(
      { floorId, devices: [device("device:a")], walls: [], links: [] },
      {
        selectedDeviceId: "device:missing" as DeviceId,
        hoveredDeviceId: "device:hover" as DeviceId,
        highlightedDeviceIds: ["device:a", "device:missing"] as Array<DeviceId>,
      },
    );

    expect(patch?.selectedDeviceId).toBe(null);
    expect(patch?.hoveredDeviceId).toBe(null);
    expect(patch?.highlightedDeviceIds).toEqual(["device:a"]);
  });

  it("returns null when ephemeral ids are still valid", () => {
    expect(
      reconcileEphemeralState(
        { floorId, devices: [device("device:a")], walls: [], links: [] },
        {
          selectedDeviceId: "device:a" as DeviceId,
          hoveredDeviceId: null,
          highlightedDeviceIds: ["device:a"] as Array<DeviceId>,
        },
      ),
    ).toBe(null);
  });
});
