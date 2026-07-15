import { describe, expect, it } from "bun:test";
import type { Device, DeviceId, FloorId } from "@/types/map";
import { sortGroupPositionUpdates } from "@/canvas/groupMovement";

const floorId = "floor:1" as FloorId;
const device = (id: string, x: number): Device => ({
  id: id as DeviceId,
  floorId,
  type: "pc",
  name: id,
  position: { x, y: 0 },
  size: { width: 40, height: 40 },
  metadata: {},
});

describe("group movement", () => {
  it("moves the leading devices first so old positions do not block the batch", () => {
    const devices = [device("left", 0), device("right", 40)];
    const updates = sortGroupPositionUpdates(devices, [
      { deviceId: "left" as DeviceId, position: { x: 40, y: 0 } },
      { deviceId: "right" as DeviceId, position: { x: 80, y: 0 } },
    ]);

    expect(updates.map((update) => update.deviceId)).toEqual(["right", "left"]);
  });
});
