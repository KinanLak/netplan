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
    links: [],
    overlay: null,
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

  it("applies cleanly with walls, devices and links on its own floor", () => {
    for (const floor of floors) {
      const result = seededSnapshot(floor);
      expect(result.applied).toBe(true);
      expect(result.reason).toBeUndefined();
      const { devices, walls, links } = result.snapshot;
      expect(walls.length).toBeGreaterThan(0);
      expect(devices.length).toBeGreaterThan(0);
      expect(links.length).toBeGreaterThan(0);
      for (const item of [...devices, ...walls, ...links]) {
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

  it("cables switch ports that exist", () => {
    for (const floor of floors) {
      const { devices, links } = seededSnapshot(floor).snapshot;
      const portsByDevice = new Map(
        devices.map((device) => [
          device.id,
          new Set(device.metadata.ports?.map((port) => port.id)),
        ]),
      );
      for (const link of links) {
        if (link.fromPort) {
          expect(portsByDevice.get(link.fromDeviceId)?.has(link.fromPort)).toBe(
            true,
          );
        }
        if (link.toPort) {
          expect(portsByDevice.get(link.toDeviceId)?.has(link.toPort)).toBe(
            true,
          );
        }
      }
    }
  });

  it("invents its addresses: documentation IPs and locally administered MACs", () => {
    const documentationRange = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/;
    for (const floor of floors) {
      for (const device of seededSnapshot(floor).snapshot.devices) {
        if (device.metadata.ip) {
          expect(device.metadata.ip).toMatch(documentationRange);
        }
        for (const mac of device.metadata.macs ?? []) {
          // Bit 1 of the first octet marks a locally administered address.
          expect(Number.parseInt(mac.slice(0, 2), 16) & 0b10).toBe(0b10);
        }
      }
    }
  });
});
