import { describe, expect, it } from "bun:test";
import { createDevicePlacement } from "./devicePlacement";
import {
  placeAround,
  unplacedDeviceOf,
  viewportCentre,
} from "./placeFromInventory";
import type { UnplacedDevice } from "./placeFromInventory";
import type { DeviceId, FloorId } from "@/types/map";

const floorId = "floor:a" as FloorId;
const printer: UnplacedDevice = {
  id: "device:printer" as DeviceId,
  type: "endpoint",
  name: "Imprimante",
  macs: ["02:6e:70:00:03:01"],
  metadata: {},
};

describe("placing an inventory device", () => {
  it("finds the middle of the visible canvas in flow coordinates", () => {
    expect(
      viewportCentre({ width: 1000, height: 600, transform: [100, -50, 2] }),
    ).toEqual({ x: 200, y: 175 });
  });

  it("centres the device on the view at its type's size", () => {
    const placement = createDevicePlacement({ checkCollision: () => false });

    const device = placeAround(printer, floorId, { x: 200, y: 200 }, placement);

    expect(device).toEqual({
      ...printer,
      floorId,
      position: { x: 160, y: 160 },
      size: { width: 80, height: 80 },
    });
  });

  it("moves aside from what already stands at the centre", () => {
    const taken = (x: number, y: number) => x === 160 && y === 160;
    const placement = createDevicePlacement({
      checkCollision: (_floor, _id, position) => taken(position.x, position.y),
    });

    const device = placeAround(printer, floorId, { x: 200, y: 200 }, placement);

    expect(device?.position).not.toEqual({ x: 160, y: 160 });
  });

  it("gives up when no spot is free in reach", () => {
    const placement = createDevicePlacement({ checkCollision: () => true });

    expect(placeAround(printer, floorId, { x: 0, y: 0 }, placement)).toBeNull();
  });
});

describe("unplacedDeviceOf", () => {
  it("keeps the identity and leaves what only the list shows", () => {
    const device = unplacedDeviceOf({
      id: "device:pc",
      type: "pc",
      name: "Poste",
      hostname: "pc-1",
      macs: ["02:6e:70:00:01:05"],
      metadata: { status: "up" },
      // Fields of the inventory row that a map operation refuses.
      ...{ location: null, seenAt: 1_000 },
    });
    expect(device).toEqual({
      id: "device:pc",
      type: "pc",
      name: "Poste",
      hostname: "pc-1",
      macs: ["02:6e:70:00:01:05"],
      metadata: { status: "up" },
    });
  });
});
