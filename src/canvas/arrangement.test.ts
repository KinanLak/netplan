import { describe, expect, it } from "bun:test";
import {
  alignDevices,
  arrangedDevicesOverlap,
  distributeDevices,
  nudgeDevices,
} from "@/canvas/arrangement";
import type { ArrangedDevice } from "@/canvas/arrangement";
import type { DeviceId } from "@/types/map";

const device = (
  id: string,
  x: number,
  y: number,
  width = 80,
  height = 80,
): ArrangedDevice => ({
  id: id as DeviceId,
  position: { x, y },
  size: { width, height },
});

describe("arranging a selection", () => {
  it("aligns on the group's edges and centre, on the grid", () => {
    const devices = [device("a", 0, 0), device("b", 200, 100, 40, 40)];
    expect(alignDevices(devices, "top")).toEqual([
      { deviceId: "b" as DeviceId, position: { x: 200, y: 0 } },
    ]);
    expect(alignDevices(devices, "right")).toEqual([
      { deviceId: "a" as DeviceId, position: { x: 160, y: 0 } },
    ]);
    expect(alignDevices(devices, "center-y")).toEqual([
      // Both centres land on y = 80, the group's middle rounded to the grid.
      { deviceId: "a" as DeviceId, position: { x: 0, y: 40 } },
      { deviceId: "b" as DeviceId, position: { x: 200, y: 60 } },
    ]);
  });

  it("spreads three or more with equal gaps, the ends staying put", () => {
    const devices = [
      device("a", 0, 0),
      device("c", 400, 0),
      device("b", 100, 0),
    ];
    expect(distributeDevices(devices, "horizontal")).toEqual([
      { deviceId: "b" as DeviceId, position: { x: 200, y: 0 } },
    ]);
    expect(distributeDevices(devices.slice(0, 2), "horizontal")).toEqual([]);
  });

  it("moves every device by the same step, and sees overlaps among them", () => {
    const devices = [device("a", 0, 0), device("b", 100, 0)];
    expect(nudgeDevices(devices, { x: 20, y: 0 })).toEqual([
      { deviceId: "a" as DeviceId, position: { x: 20, y: 0 } },
      { deviceId: "b" as DeviceId, position: { x: 120, y: 0 } },
    ]);
    expect(arrangedDevicesOverlap(devices, alignDevices(devices, "left"))).toBe(
      true,
    );
    expect(arrangedDevicesOverlap(devices, alignDevices(devices, "top"))).toBe(
      false,
    );
  });
});
