import { describe, expect, it } from "bun:test";
import type { Device, DeviceId, FloorId, PortId } from "@/types/map";
import { reconcileEphemeralState } from "./reconcileEphemeralState";

const floorId = "floor:a" as FloorId;
const device = (id: string): Device => ({
  id: id as DeviceId,
  floorId,
  type: "pc",
  name: id,
  position: { x: 0, y: 0 },
  size: { width: 80, height: 80 },
  macs: [],
  metadata: {},
});

describe("reconcileEphemeralState", () => {
  it("clears selected, hovered, and cable-showing ids missing from document", () => {
    const patch = reconcileEphemeralState(
      {
        floorId,
        revision: 0,
        devices: [device("device:a")],
        walls: [],
        ports: [],
        cables: [],
        overlay: null,
      },
      {
        selectedDeviceId: "device:missing" as DeviceId,
        selectedDeviceIds: ["device:a", "device:missing"] as Array<DeviceId>,
        hoveredDeviceId: "device:hover" as DeviceId,
        shownCablesDeviceId: "device:missing" as DeviceId,
        cableDraft: {
          deviceId: "device:missing" as DeviceId,
          portId: "port:missing" as PortId,
        },
      },
    );

    expect(patch?.selectedDeviceId).toBe("device:a");
    expect(patch?.selectedDeviceIds).toEqual(["device:a"]);
    expect(patch?.hoveredDeviceId).toBe(null);
    expect(patch?.shownCablesDeviceId).toBe(null);
    expect(patch?.cableDraft).toBe(null);
  });

  it("returns null when ephemeral ids are still valid", () => {
    expect(
      reconcileEphemeralState(
        {
          floorId,
          revision: 0,
          devices: [device("device:a")],
          walls: [],
          ports: [],
          cables: [],
          overlay: null,
        },
        {
          selectedDeviceId: "device:a" as DeviceId,
          selectedDeviceIds: ["device:a"] as Array<DeviceId>,
          hoveredDeviceId: null,
          shownCablesDeviceId: "device:a" as DeviceId,
          cableDraft: null,
        },
      ),
    ).toBe(null);
  });
});
