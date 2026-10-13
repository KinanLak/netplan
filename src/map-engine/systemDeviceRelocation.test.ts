import { describe, expect, it } from "bun:test";
import type {
  Device,
  DeviceId,
  FloorId,
  LinkId,
  MapDocumentSnapshot,
  WallId,
} from "@/types/map";
import { applySystemDeviceRelocation } from "./systemDeviceRelocation";
import type { SystemDeviceRelocationOperation } from "./systemDeviceRelocation";

const floorA = "floor:a" as FloorId;
const floorB = "floor:b" as FloorId;
const deviceId = (value: string) => value as DeviceId;

const device = (
  id: DeviceId,
  floorId: FloorId,
  position = { x: 0, y: 0 },
  size = { width: 80, height: 80 },
): Device => ({
  id,
  floorId,
  type: "pc",
  name: "Workstation",
  hostname: "ws-001",
  position,
  size,
  metadata: { ip: "192.0.2.10", macs: ["00:11:22:33:44:55"] },
});

const snapshot = (
  floorId: FloorId,
  devices: Array<Device> = [],
): MapDocumentSnapshot => ({
  floorId,
  revision: 7,
  devices,
  walls: [],
  links: [],
});

const relocation = (input: {
  device: Device;
  source: SystemDeviceRelocationOperation["source"];
  targetFloorId: FloorId;
  targetPosition: { x: number; y: number };
}): SystemDeviceRelocationOperation => ({
  kind: "system.device.relocate",
  origin: "integration",
  expectedCycleId: "cycle:42",
  device: input.device,
  source: input.source,
  target: {
    floorId: input.targetFloorId,
    position: input.targetPosition,
  },
});

describe("applySystemDeviceRelocation", () => {
  it("creates a device on the target floor", () => {
    const target = snapshot(floorA);
    const newDevice = device(deviceId("device:new"), floorB, { x: 1, y: 2 });
    const result = applySystemDeviceRelocation(
      [target],
      relocation({
        device: newDevice,
        source: null,
        targetFloorId: floorA,
        targetPosition: { x: 120, y: 160 },
      }),
    );

    expect(result.applied).toBe(true);
    expect(result.snapshots[0]?.devices).toEqual([
      { ...newDevice, floorId: floorA, position: { x: 120, y: 160 } },
    ]);
    expect(result.affectedFloors).toEqual([
      {
        floorId: floorA,
        effect: "device-created",
        before: target,
        after: result.snapshots[0],
      },
    ]);
    expect(result.snapshots[0]?.revision).toBe(7);
  });

  it("moves on one floor without changing connected links", () => {
    const moving = device(deviceId("device:moving"), floorA);
    const neighbor = device(deviceId("device:neighbor"), floorA, {
      x: 300,
      y: 0,
    });
    const link = {
      id: "link:a" as LinkId,
      floorId: floorA,
      fromDeviceId: moving.id,
      toDeviceId: neighbor.id,
      label: "uplink",
    };
    const before = { ...snapshot(floorA, [moving, neighbor]), links: [link] };
    const result = applySystemDeviceRelocation(
      [before],
      relocation({
        device: moving,
        source: { floorId: floorA, position: moving.position },
        targetFloorId: floorA,
        targetPosition: { x: 120, y: 120 },
      }),
    );

    expect(result.applied).toBe(true);
    expect(result.snapshots[0]?.devices[0]?.position).toEqual({
      x: 120,
      y: 120,
    });
    expect(result.snapshots[0]?.links).toBe(before.links);
    expect(result.affectedFloors[0]?.effect).toBe("device-moved");
  });

  it("moves atomically across floors and preserves device-owned data", () => {
    const original = device(deviceId("device:moving"), floorA, {
      x: 20,
      y: 40,
    });
    const operationDevice = {
      ...original,
      name: "Integration must not overwrite this",
      metadata: {},
    };
    const source = snapshot(floorA, [original]);
    const target = snapshot(floorB);
    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: operationDevice,
        source: { floorId: floorA, position: original.position },
        targetFloorId: floorB,
        targetPosition: { x: 200, y: 240 },
      }),
    );

    expect(result.applied).toBe(true);
    expect(result.snapshots[0]?.devices).toEqual([]);
    expect(result.snapshots[1]?.devices).toEqual([
      { ...original, floorId: floorB, position: { x: 200, y: 240 } },
    ]);
    expect(
      result.affectedFloors.map(({ floorId, effect }) => ({ floorId, effect })),
    ).toEqual([
      { floorId: floorA, effect: "device-removed" },
      { floorId: floorB, effect: "device-added" },
    ]);
    expect(result.affectedFloors[0]?.before).toBe(source);
    expect(result.affectedFloors[1]?.before).toBe(target);
  });

  it("blocks a cross-floor move with a durable link", () => {
    const moving = device(deviceId("device:moving"), floorA);
    const neighbor = device(deviceId("device:neighbor"), floorA, {
      x: 300,
      y: 0,
    });
    const source = {
      ...snapshot(floorA, [moving, neighbor]),
      links: [
        {
          id: "link:a" as LinkId,
          floorId: floorA,
          fromDeviceId: moving.id,
          toDeviceId: neighbor.id,
        },
      ],
    };
    const target = snapshot(floorB);
    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: moving,
        source: { floorId: floorA, position: moving.position },
        targetFloorId: floorB,
        targetPosition: { x: 100, y: 100 },
      }),
    );

    expect(result).toEqual({
      snapshots: [source, target],
      applied: false,
      affectedFloors: [],
      reason: "blocked-by-links",
    });
  });

  it("rejects target collisions without changing either floor", () => {
    const moving = device(deviceId("device:moving"), floorA);
    const occupied = device(deviceId("device:occupied"), floorB, {
      x: 100,
      y: 100,
    });
    const source = snapshot(floorA, [moving]);
    const target = snapshot(floorB, [occupied]);
    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: moving,
        source: { floorId: floorA, position: moving.position },
        targetFloorId: floorB,
        targetPosition: { x: 120, y: 120 },
      }),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("device-collision");
    expect(result.snapshots[0]).toBe(source);
    expect(result.snapshots[1]).toBe(target);
    expect(result.affectedFloors).toEqual([]);
  });

  it("uses a durable resized device for target device collision", () => {
    const moving = device(
      deviceId("device:moving"),
      floorA,
      { x: 0, y: 0 },
      { width: 200, height: 200 },
    );
    const occupied = device(deviceId("device:occupied"), floorB, {
      x: 260,
      y: 100,
    });
    const source = snapshot(floorA, [moving]);
    const target = snapshot(floorB, [occupied]);

    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: { ...moving, size: { width: 80, height: 80 } },
        source: { floorId: floorA, position: moving.position },
        targetFloorId: floorB,
        targetPosition: { x: 100, y: 100 },
      }),
    );

    expect(result.reason).toBe("device-collision");
    expect(result.snapshots).toEqual([source, target]);
  });

  it("uses wall collision validation for creation", () => {
    const target = {
      ...snapshot(floorA),
      walls: [
        {
          id: "wall:a" as WallId,
          floorId: floorA,
          start: { x: 0, y: 40 },
          end: { x: 80, y: 40 },
          color: "concrete" as const,
          geometryKey: "0:40:80:40",
        },
      ],
    };
    const result = applySystemDeviceRelocation(
      [target],
      relocation({
        device: device(deviceId("device:new"), floorA),
        source: null,
        targetFloorId: floorA,
        targetPosition: { x: 0, y: 0 },
      }),
    );

    expect(result.reason).toBe("wall-collision");
    expect(result.snapshots[0]).toBe(target);
  });

  it("uses the same wall collision validation for relocation", () => {
    const moving = device(deviceId("device:moving"), floorA);
    const source = snapshot(floorA, [moving]);
    const target = {
      ...snapshot(floorB),
      walls: [
        {
          id: "wall:target" as WallId,
          floorId: floorB,
          start: { x: 100, y: 140 },
          end: { x: 180, y: 140 },
          color: "concrete" as const,
          geometryKey: "100:140:180:140",
        },
      ],
    };

    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: moving,
        source: { floorId: floorA, position: moving.position },
        targetFloorId: floorB,
        targetPosition: { x: 100, y: 100 },
      }),
    );

    expect(result.reason).toBe("wall-collision");
    expect(result.snapshots).toEqual([source, target]);
  });

  it("uses a durable resized device for target wall collision", () => {
    const moving = device(
      deviceId("device:moving"),
      floorA,
      { x: 0, y: 0 },
      { width: 200, height: 200 },
    );
    const source = snapshot(floorA, [moving]);
    const target = {
      ...snapshot(floorB),
      walls: [
        {
          id: "wall:target" as WallId,
          floorId: floorB,
          start: { x: 260, y: 100 },
          end: { x: 260, y: 300 },
          color: "concrete" as const,
          geometryKey: "260:100:260:300",
        },
      ],
    };

    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: { ...moving, size: { width: 80, height: 80 } },
        source: { floorId: floorA, position: moving.position },
        targetFloorId: floorB,
        targetPosition: { x: 100, y: 100 },
      }),
    );

    expect(result.reason).toBe("wall-collision");
    expect(result.snapshots).toEqual([source, target]);
  });

  it("is idempotent after a cross-floor move", () => {
    const moving = device(deviceId("device:moving"), floorA);
    const operation = relocation({
      device: moving,
      source: { floorId: floorA, position: moving.position },
      targetFloorId: floorB,
      targetPosition: { x: 100, y: 100 },
    });
    const first = applySystemDeviceRelocation(
      [snapshot(floorA, [moving]), snapshot(floorB)],
      operation,
    );
    const second = applySystemDeviceRelocation(first.snapshots, operation);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(second.reason).toBe("already-applied");
    expect(second.snapshots).toBe(first.snapshots);
    expect(second.affectedFloors).toEqual([]);
  });

  it("rejects a stale source position", () => {
    const moving = device(deviceId("device:moving"), floorA, { x: 40, y: 40 });
    const source = snapshot(floorA, [moving]);
    const target = snapshot(floorB);
    const result = applySystemDeviceRelocation(
      [source, target],
      relocation({
        device: moving,
        source: { floorId: floorA, position: { x: 0, y: 0 } },
        targetFloorId: floorB,
        targetPosition: { x: 100, y: 100 },
      }),
    );

    expect(result.reason).toBe("source-mismatch");
    expect(result.snapshots[0]).toBe(source);
    expect(result.snapshots[1]).toBe(target);
  });
});
