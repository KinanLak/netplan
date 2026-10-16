import { describe, expect, it } from "bun:test";
import type {
  Cable,
  CableId,
  Device,
  DeviceId,
  FloorId,
  WallId,
} from "@/types/map";
import { defaultPorts, portIdOf } from "@/devices/ports";
import { applyOperation } from "./applyOperation";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;
const deviceId = (value: string) => value as DeviceId;
const wallId = (value: string) => value as WallId;

const meta = (seq: number): MapOperation["meta"] => ({
  opId: `op:test:${seq}` as MapOperation["meta"]["opId"],
  clientId: "client:test" as MapOperation["meta"]["clientId"],
  clientSeq: seq,
  createdAt: seq,
});

const device = (id: DeviceId, x = 0): Device => ({
  id,
  floorId,
  type: "pc",
  name: `Device ${id}`,
  position: { x, y: 0 },
  size: { width: 80, height: 80 },
  macs: [],
  metadata: {},
});

const emptySnapshot = {
  floorId,
  revision: 0,
  devices: [],
  walls: [],
  ports: [],
  cables: [],
  overlay: null,
};

/** Joins the only interface of two PCs. */
const cableBetween = (a: Device, b: Device): Cable => ({
  id: "cable:a" as CableId,
  a: { deviceId: a.id, portId: portIdOf(a.id, "interface", 1) },
  b: { deviceId: b.id, portId: portIdOf(b.id, "interface", 1) },
});

const cabledPair = (aSource?: Device["source"]) => {
  const a: Device = { ...device(deviceId("device:a")), source: aSource };
  const b = device(deviceId("device:b"), 200);
  return {
    a,
    b,
    snapshot: {
      ...emptySnapshot,
      devices: [a, b],
      ports: [...defaultPorts(a.id, "pc"), ...defaultPorts(b.id, "pc")],
      cables: [cableBetween(a, b)],
    },
  };
};

describe("applyOperation", () => {
  it("applies device.create and is idempotent for the same payload", () => {
    const created = device(deviceId("device:a"));
    const operation: MapOperation = {
      kind: "device.create",
      meta: meta(0),
      device: created,
    };

    const first = applyOperation(emptySnapshot, operation);
    const second = applyOperation(first.snapshot, operation);

    expect(first.snapshot.devices).toEqual([created]);
    expect(second.snapshot.devices).toEqual([created]);
    expect(second.reason).toBe("already-exists");
  });

  it("reports conflict for device.create with same id and different payload", () => {
    const first = device(deviceId("device:a"));
    const operation: MapOperation = {
      kind: "device.create",
      meta: meta(0),
      device: { ...first, name: "Changed" },
    };

    const result = applyOperation(
      { ...emptySnapshot, devices: [first] },
      operation,
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("conflict");
    expect(result.snapshot.devices).toEqual([first]);
  });

  it("updates only patched device fields", () => {
    const original = device(deviceId("device:a"));

    const result = applyOperation(
      { ...emptySnapshot, devices: [original] },
      {
        kind: "device.patch",
        meta: meta(1),
        deviceId: original.id,
        patch: { position: { x: 100, y: 120 } },
      },
    );

    expect(result.snapshot.devices[0]).toEqual({
      ...original,
      position: { x: 100, y: 120 },
    });
  });

  it("refuses a patch that finds the device elsewhere than it expects", () => {
    const original = device(deviceId("device:a"));
    const snapshot = { ...emptySnapshot, devices: [original] };
    const putBack = (expected: { x: number; y: number }): MapOperation => ({
      kind: "device.patch",
      meta: meta(1),
      deviceId: original.id,
      patch: { position: { x: 100, y: 120 } },
      expected: { position: expected },
    });

    const where = applyOperation(snapshot, putBack({ x: 0, y: 0 }));
    const elsewhere = applyOperation(snapshot, putBack({ x: 40, y: 0 }));

    expect(where.applied).toBe(true);
    expect(elsewhere.applied).toBe(false);
    expect(elsewhere.reason).toBe("conflict");
    expect(elsewhere.snapshot.devices).toEqual([original]);
  });

  it("creating a device gives it its type's ports unless it brings its own", () => {
    const created = device(deviceId("device:a"));
    const ports = defaultPorts(created.id, "switch").slice(0, 2);

    const byDefault = applyOperation(emptySnapshot, {
      kind: "device.create",
      meta: meta(1),
      device: created,
    });
    const given = applyOperation(emptySnapshot, {
      kind: "device.create",
      meta: meta(1),
      device: created,
      ports,
    });

    expect(byDefault.snapshot.ports).toEqual(defaultPorts(created.id, "pc"));
    expect(given.snapshot.ports).toEqual(ports);
  });

  it("refuses a device whose ports are not its own or whose cable misses it", () => {
    const { a, b } = cabledPair();
    const create = (
      extra: Pick<
        Extract<MapOperation, { kind: "device.create" }>,
        "ports" | "cables"
      >,
    ) =>
      applyOperation(
        { ...emptySnapshot, devices: [b], ports: defaultPorts(b.id, "pc") },
        { kind: "device.create", meta: meta(1), device: a, ...extra },
      );

    expect(create({ ports: defaultPorts(b.id, "pc") }).reason).toBe(
      "invalid-ports",
    );
    expect(
      create({
        cables: [
          {
            ...cableBetween(a, b),
            a: { deviceId: b.id, portId: portIdOf(b.id, "interface", 1) },
          },
        ],
      }).reason,
    ).toBe("invalid-ports");
    expect(create({ cables: [cableBetween(a, b)] }).snapshot.cables).toEqual([
      cableBetween(a, b),
    ]);
  });

  it("lays a new device's cables only where they still fit, trusting the server off this floor", () => {
    const { a, b, snapshot } = cabledPair();
    const c = device(deviceId("device:c"), 400);
    const far = device(deviceId("device:far"));
    const into = (other: Device) => ({
      ...cableBetween(c, other),
      id: `cable:c-${other.id}` as CableId,
    });

    const result = applyOperation(snapshot, {
      kind: "device.create",
      meta: meta(1),
      device: c,
      // `a`'s port already holds a cable; `far` is on another floor.
      cables: [into(a), into(far)],
    });

    expect(result.applied).toBe(true);
    expect(result.snapshot.cables.map((cable) => cable.id)).toEqual([
      cableBetween(a, b).id,
      into(far).id,
    ]);
  });

  it("deleting a device removes its ports and cables", () => {
    const { a, b, snapshot } = cabledPair();

    const result = applyOperation(snapshot, {
      kind: "device.delete",
      meta: meta(2),
      deviceId: a.id,
    });

    expect(result.snapshot.devices).toEqual([b]);
    expect(result.snapshot.ports).toEqual(defaultPorts(b.id, "pc"));
    expect(result.snapshot.cables).toEqual([]);
  });

  it("refuses to delete a device its integration owns", () => {
    const sourced: Device = {
      ...device(deviceId("device:a")),
      source: { integration: "netbox", externalId: "42", syncedAt: 1 },
    };
    const snapshot = { ...emptySnapshot, devices: [sourced] };

    const result = applyOperation(snapshot, {
      kind: "device.delete",
      meta: meta(2),
      deviceId: sourced.id,
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("source-owned");
    expect(result.snapshot).toBe(snapshot);
  });

  it("unplacing a device keeps its cables, even for a sourced one", () => {
    const { a, b, snapshot } = cabledPair({
      integration: "netbox",
      externalId: "42",
      syncedAt: 1,
    });

    const result = applyOperation(snapshot, {
      kind: "device.unplace",
      meta: meta(2),
      deviceId: a.id,
    });

    expect(result.snapshot.devices).toEqual([b]);
    expect(result.snapshot.ports).toEqual(defaultPorts(b.id, "pc"));
    // The far end is still on the floor, so the cable stays in view.
    expect(result.snapshot.cables).toEqual([cableBetween(a, b)]);
  });

  it("placing a device already where it stands is a no-op, elsewhere a conflict", () => {
    const placed = device(deviceId("device:a"));
    const snapshot = { ...emptySnapshot, devices: [placed] };
    const placeAt = (x: number): MapOperation => ({
      kind: "device.place",
      meta: meta(3),
      device: { ...device(placed.id, x), name: "Renamed" },
    });

    const same = applyOperation(snapshot, placeAt(0));
    const elsewhere = applyOperation(snapshot, placeAt(200));
    const fresh = applyOperation(emptySnapshot, placeAt(0));

    expect(same.reason).toBe("already-exists");
    expect(elsewhere.reason).toBe("conflict");
    expect(fresh.snapshot.devices.map((item) => item.id)).toEqual([placed.id]);
  });

  it("walls.add deduplicates geometry keys", () => {
    const wall = {
      id: wallId("wall:a"),
      floorId,
      start: { x: 0, y: 0 },
      end: { x: 40, y: 0 },
      color: "concrete" as const,
      geometryKey: "0:0:40:0",
    };
    const duplicate = { ...wall, id: wallId("wall:b") };

    const result = applyOperation(emptySnapshot, {
      kind: "walls.add",
      meta: meta(4),
      walls: [wall, duplicate],
    });

    expect(result.snapshot.walls).toEqual([wall]);
  });

  it("walls.delete is idempotent", () => {
    const result = applyOperation(emptySnapshot, {
      kind: "walls.delete",
      meta: meta(5),
      wallIds: [wallId("missing")],
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("missing-wall");
  });

  it("batch applies sub-operations in order", () => {
    const created = device(deviceId("device:a"));
    const result = applyOperation(emptySnapshot, {
      kind: "batch",
      meta: meta(6),
      operations: [
        { kind: "device.create", device: created },
        {
          kind: "device.patch",
          deviceId: created.id,
          patch: { position: { x: 200, y: 0 } },
        },
      ],
    });

    expect(result.snapshot.devices[0]?.position).toEqual({ x: 200, y: 0 });
  });

  it("batch rolls back when a later sub-operation is rejected", () => {
    const created = device(deviceId("device:a"));
    const result = applyOperation(emptySnapshot, {
      kind: "batch",
      meta: meta(9),
      operations: [
        { kind: "device.create", device: created },
        {
          kind: "device.patch",
          deviceId: deviceId("device:missing"),
          patch: { position: { x: 200, y: 0 } },
        },
      ],
    });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("missing-device");
    expect(result.snapshot.devices).toEqual([]);
  });

  it("batch keeps server-safe no-op deletes idempotent", () => {
    const created = device(deviceId("device:a"));
    const result = applyOperation(emptySnapshot, {
      kind: "batch",
      meta: meta(12),
      operations: [
        {
          kind: "device.delete",
          deviceId: deviceId("device:missing"),
        },
        { kind: "device.create", device: created },
      ],
    });

    expect(result.applied).toBe(true);
    expect(result.snapshot.devices).toEqual([created]);
  });
});
