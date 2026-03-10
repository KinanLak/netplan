import { describe, expect, it } from "bun:test";
import type { Device, MapDocument } from "@/types/map";
import { addConnection } from "@/domain/map/commands/connections";
import {
  addDevice,
  deleteDevice,
  moveDevice,
} from "@/domain/map/commands/devices";
import { createMockMapDocument } from "@/mock/document";

const createFloorCollisionDocument = (): MapDocument => ({
  buildings: [
    {
      id: "building-1",
      name: "HQ",
      floors: [
        { id: "floor-1", name: "Floor 1" },
        { id: "floor-2", name: "Floor 2" },
      ],
    },
  ],
  devices: [
    {
      id: "floor-1-device",
      type: "pc",
      name: "Floor 1 device",
      floorId: "floor-1",
      position: { x: 0, y: 0 },
      size: { width: 20, height: 20 },
      metadata: {},
    },
    {
      id: "floor-2-anchor",
      type: "pc",
      name: "Floor 2 anchor",
      floorId: "floor-2",
      position: { x: 40, y: 0 },
      size: { width: 20, height: 20 },
      metadata: {},
    },
    {
      id: "floor-2-target",
      type: "pc",
      name: "Floor 2 target",
      floorId: "floor-2",
      position: { x: 80, y: 0 },
      size: { width: 20, height: 20 },
      metadata: {},
    },
  ],
  walls: [],
  connections: [],
});

describe("map domain commands", () => {
  it("deleting a device removes all of its connections", () => {
    const document = createMockMapDocument();

    const result = deleteDevice(document, { deviceId: "switch-2" });

    expect(result.ok).toBe(true);
    expect(
      result.document.devices.some((device) => device.id === "switch-2"),
    ).toBe(false);
    expect(
      result.document.connections.some(
        (connection) =>
          connection.a.deviceId === "switch-2" ||
          connection.b.deviceId === "switch-2",
      ),
    ).toBe(false);
  });

  it("refuses adding a device when every candidate position collides", () => {
    const document = createMockMapDocument();
    const rack = document.devices.find((device) => device.id === "rack-1");
    if (!rack) {
      throw new Error("Missing rack-1 fixture");
    }

    const newDevice: Omit<Device, "id"> = {
      type: "rack",
      name: "Blocked rack",
      floorId: "floor-1",
      position: rack.position,
      size: rack.size,
      metadata: {},
    };

    const result = addDevice(document, {
      device: newDevice,
      candidatePositions: [
        rack.position,
        { x: 200, y: 100 },
        { x: 200, y: 180 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-valid-position");
    expect(result.document).toBe(document);
  });

  it("checks movement collisions against the explicit floorId only", () => {
    const document = createFloorCollisionDocument();

    const crossFloorMove = moveDevice(document, {
      deviceId: "floor-2-target",
      floorId: "floor-2",
      position: { x: 0, y: 0 },
    });
    const sameFloorCollision = moveDevice(document, {
      deviceId: "floor-2-target",
      floorId: "floor-2",
      position: { x: 40, y: 0 },
    });

    expect(crossFloorMove.ok).toBe(true);
    expect(sameFloorCollision.ok).toBe(false);
    expect(sameFloorCollision.reason).toBe("collision");
  });

  it("rejects invalid connection creation reasons", () => {
    const document = createMockMapDocument();

    const missingDevice = addConnection(document, {
      connection: {
        floorId: "floor-1",
        a: { deviceId: "switch-1" },
        b: { deviceId: "missing-device" },
      },
    });
    const missingPort = addConnection(document, {
      connection: {
        floorId: "floor-1",
        a: { deviceId: "switch-1", portId: "missing-port" },
        b: { deviceId: "pc-1" },
      },
    });
    const sameEndpoint = addConnection(document, {
      connection: {
        floorId: "floor-1",
        a: { deviceId: "switch-1" },
        b: { deviceId: "switch-1" },
      },
    });
    const crossFloor = addConnection(document, {
      connection: {
        floorId: "floor-1",
        a: { deviceId: "switch-1" },
        b: { deviceId: "switch-3" },
      },
    });

    expect(missingDevice.ok).toBe(false);
    expect(missingDevice.reason).toBe("device-not-found");
    expect(missingPort.ok).toBe(false);
    expect(missingPort.reason).toBe("port-not-found");
    expect(sameEndpoint.ok).toBe(false);
    expect(sameEndpoint.reason).toBe("same-endpoint");
    expect(crossFloor.ok).toBe(false);
    expect(crossFloor.reason).toBe("cross-floor");
  });
});
