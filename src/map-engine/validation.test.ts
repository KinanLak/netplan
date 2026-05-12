import { describe, expect, it } from "bun:test";
import type { Device, DeviceId, FloorId, WallId } from "@/types/map";
import { validateOperation } from "./validation";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;
const deviceId = (value: string) => value as DeviceId;
const wallId = (value: string) => value as WallId;
const meta: MapOperation["meta"] = {
  opId: "op:test:0" as MapOperation["meta"]["opId"],
  clientId: "client:test" as MapOperation["meta"]["clientId"],
  clientSeq: 0,
  createdAt: 0,
};

const device = (id: DeviceId, x: number): Device => ({
  id,
  floorId,
  type: "pc",
  name: "PC",
  position: { x, y: 0 },
  size: { width: 80, height: 80 },
  metadata: {},
});

describe("validation", () => {
  it("rejects device placement over another device", () => {
    const existing = device(deviceId("device:a"), 0);
    const result = validateOperation(
      { floorId, devices: [existing], walls: [], links: [] },
      {
        kind: "device.create",
        meta,
        device: device(deviceId("device:b"), 40),
      },
    );

    expect(result).toEqual({ valid: false, error: "device-collision" });
  });

  it("rejects device placement over a wall", () => {
    const result = validateOperation(
      {
        floorId,
        devices: [],
        walls: [
          {
            id: wallId("wall:a"),
            floorId,
            start: { x: 0, y: 40 },
            end: { x: 80, y: 40 },
            color: "concrete",
            geometryKey: "0:40:80:40",
          },
        ],
        links: [],
      },
      {
        kind: "device.create",
        meta,
        device: device(deviceId("device:a"), 0),
      },
    );

    expect(result).toEqual({ valid: false, error: "wall-collision" });
  });
});
