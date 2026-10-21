import { isCanonicalMac } from "@/devices/mac";
import { describe, expect, it } from "bun:test";
import { applyOperation } from "@/map-engine/applyOperation";
import { validateDevicePlacement } from "@/map-engine/validation";
import type { MapDocumentSnapshot } from "@/map-engine/types";
import type { ClientId, OperationId } from "@/types/map";
import {
  WALL_GRID_OFFSET,
  getWallGeometryKey,
} from "@/walls/gridGeometry/cells";
import { GRID_SIZE } from "@/lib/grid";
import { buildDemoFloors } from "./demoMap";

const META = {
  opId: "op:demo" as OperationId,
  clientId: "client:demo" as ClientId,
  clientSeq: 1,
  createdAt: 1,
};

const seededSnapshot = (floor: ReturnType<typeof buildDemoFloors>[number]) => {
  const empty: MapDocumentSnapshot = {
    floorId: floor.id,
    revision: 0,
    devices: [],
    walls: [],
    ports: [],
    cables: [],
    overlay: null,
    labels: [],
  };
  return applyOperation(empty, {
    kind: "batch",
    meta: META,
    operations: floor.operations,
  });
};

describe("demo map", () => {
  const floors = buildDemoFloors();

  it("fits each floor in one batch within the server limits", () => {
    for (const floor of floors) {
      expect(floor.operations.length).toBeLessThanOrEqual(100);
      for (const operation of floor.operations) {
        if (operation.kind === "walls.add") {
          expect(operation.walls.length).toBeLessThanOrEqual(500);
        }
      }
    }
  });

  it("applies cleanly with walls, devices and cables on its own floor", () => {
    for (const floor of floors) {
      const result = seededSnapshot(floor);
      expect(result.applied).toBe(true);
      expect(result.reason).toBeUndefined();
      const { devices, walls, cables } = result.snapshot;
      expect(walls.length).toBeGreaterThan(0);
      expect(devices.length).toBeGreaterThan(0);
      expect(cables.length).toBeGreaterThan(0);
      for (const item of [...devices, ...walls]) {
        expect(item.floorId).toBe(floor.id);
      }
    }
  });

  it("draws walls as single cells on the wall grid", () => {
    for (const floor of floors) {
      for (const wall of seededSnapshot(floor).snapshot.walls) {
        expect(wall.start).toEqual(wall.end);
        expect((wall.start.x - WALL_GRID_OFFSET) % GRID_SIZE).toBe(0);
        expect((wall.start.y - WALL_GRID_OFFSET) % GRID_SIZE).toBe(0);
        expect(wall.geometryKey).toBe(getWallGeometryKey(wall) ?? "");
      }
    }
  });

  it("places no device over another device or a wall", () => {
    for (const floor of floors) {
      const { snapshot } = seededSnapshot(floor);
      for (const device of snapshot.devices) {
        expect({
          device: device.id,
          ...validateDevicePlacement(snapshot, device),
        }).toEqual({ device: device.id, valid: true });
      }
    }
  });

  it("lays each cable between two free ports of the devices it names", () => {
    for (const floor of floors) {
      const { ports, cables } = seededSnapshot(floor).snapshot;
      const portById = new Map(ports.map((port) => [port.id, port]));
      const cabled = new Set<string>();
      for (const cable of cables) {
        for (const end of [cable.a, cable.b]) {
          expect(portById.get(end.portId)?.deviceId).toBe(end.deviceId);
          expect(cabled.has(end.portId)).toBe(false);
          cabled.add(end.portId);
        }
      }
    }
  });

  it("invents its addresses: documentation IPs and locally administered MACs", () => {
    const documentationRange = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/;
    for (const floor of floors) {
      for (const device of seededSnapshot(floor).snapshot.devices) {
        if (device.ip) {
          expect(device.ip).toMatch(documentationRange);
        }
        for (const mac of device.macs) {
          // Bit 1 of the first octet marks a locally administered address.
          expect(Number.parseInt(mac.slice(0, 2), 16) & 0b10).toBe(0b10);
        }
      }
    }
  });

  it("gives each device of the site its own canonical MACs", () => {
    const macs = floors.flatMap((floor) =>
      seededSnapshot(floor).snapshot.devices.flatMap((device) => device.macs),
    );
    expect(macs.every(isCanonicalMac)).toBe(true);
    expect(new Set(macs).size).toBe(macs.length);
  });
});
