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
import { buildInverseOperation } from "./buildInverseOperation";
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

const device = (id: DeviceId): Device => ({
  id,
  floorId,
  type: "pc",
  name: "PC",
  position: { x: 0, y: 0 },
  size: { width: 80, height: 80 },
  macs: [],
  metadata: {},
});

const cabledPair = () => {
  const a = device(deviceId("device:a"));
  const b = { ...device(deviceId("device:b")), position: { x: 200, y: 0 } };
  const cable: Cable = {
    id: "cable:a" as CableId,
    a: { deviceId: a.id, portId: portIdOf(a.id, "interface", 1) },
    b: { deviceId: b.id, portId: portIdOf(b.id, "interface", 1) },
  };
  return {
    a,
    b,
    cable,
    snapshot: {
      floorId,
      revision: 0,
      devices: [a, b],
      walls: [],
      ports: [...defaultPorts(a.id, "pc"), ...defaultPorts(b.id, "pc")],
      cables: [cable],
      overlay: null,
    },
  };
};

describe("buildInverseOperation", () => {
  it("builds a move inverse that patches only position", () => {
    const original = device(deviceId("device:a"));
    const snapshot = {
      floorId,
      revision: 0,
      devices: [original],
      walls: [],
      ports: [],
      cables: [],
      overlay: null,
    };
    const move: MapOperation = {
      kind: "device.patch",
      meta: meta(0),
      deviceId: original.id,
      patch: { position: { x: 100, y: 100 } },
    };

    const inverse = buildInverseOperation(snapshot, move);

    expect(inverse).toEqual({
      kind: "device.patch",
      meta: move.meta,
      deviceId: original.id,
      patch: { position: { x: 0, y: 0 } },
    });
  });

  it("brings a deleted device back with its ports and cables", () => {
    const { a, snapshot } = cabledPair();
    const remove: MapOperation = {
      kind: "device.delete",
      meta: meta(1),
      deviceId: a.id,
    };

    const inverse = buildInverseOperation(snapshot, remove);
    const deleted = applyOperation(snapshot, remove).snapshot;

    expect(inverse?.kind).toBe("device.create");
    if (!inverse) return;
    const restored = applyOperation(deleted, inverse).snapshot;
    expect(restored.devices).toContainEqual(a);
    expect(new Set(restored.ports)).toEqual(new Set(snapshot.ports));
    expect(restored.cables).toEqual(snapshot.cables);
  });

  it("leaves a source's cable to its next sync when bringing a device back", () => {
    const { a, snapshot } = cabledPair();
    const source = { integration: "netbox" as const, externalId: "42" };
    const sourced = {
      ...snapshot,
      ports: snapshot.ports.map((port) => ({ ...port, source })),
      cables: snapshot.cables.map((cable) => ({ ...cable, source })),
    };

    const inverse = buildInverseOperation(sourced, {
      kind: "device.delete",
      meta: meta(1),
      deviceId: a.id,
    });

    expect(inverse).toMatchObject({ kind: "device.create", cables: [] });
    if (inverse?.kind !== "device.create") return;
    expect(inverse.ports?.some((port) => "source" in port)).toBe(false);
  });

  it("puts an unplaced device back, and takes a placed one off", () => {
    const { a, snapshot } = cabledPair();
    const unplace: MapOperation = {
      kind: "device.unplace",
      meta: meta(1),
      deviceId: a.id,
    };

    const inverse = buildInverseOperation(snapshot, unplace);
    const unplaced = applyOperation(snapshot, unplace).snapshot;

    // Its cables stayed with it in the inventory: placing it is enough.
    expect(inverse).toEqual({ kind: "device.place", meta: meta(1), device: a });
    if (!inverse) return;
    const restored = applyOperation(unplaced, inverse).snapshot;
    expect(restored.devices).toContainEqual(a);
    expect(buildInverseOperation(unplaced, inverse)).toEqual({
      kind: "device.unplace",
      meta: meta(1),
      deviceId: a.id,
    });
  });

  it("reverses batch operations in reverse order", () => {
    const a = device(deviceId("device:a"));
    const snapshot = {
      floorId,
      revision: 0,
      devices: [a],
      walls: [],
      ports: [],
      cables: [],
      overlay: null,
    };
    const batch: MapOperation = {
      kind: "batch",
      meta: meta(2),
      operations: [
        {
          kind: "device.patch",
          deviceId: a.id,
          patch: { position: { x: 40, y: 0 } },
        },
        {
          kind: "device.patch",
          deviceId: a.id,
          patch: { size: { width: 120, height: 80 } },
        },
      ],
    };

    const inverse = buildInverseOperation(snapshot, batch);

    expect(inverse?.kind).toBe("batch");
    if (inverse?.kind !== "batch") return;
    const afterBatch = applyOperation(snapshot, batch).snapshot;
    const restored = applyOperation(afterBatch, inverse).snapshot;
    expect(restored.devices[0]).toEqual(a);
  });

  it("restores deleted wall snapshots", () => {
    const wall = {
      id: wallId("wall:a"),
      floorId,
      start: { x: 0, y: 0 },
      end: { x: 40, y: 0 },
      color: "sand" as const,
      geometryKey: "0:0:40:0",
    };

    const inverse = buildInverseOperation(
      {
        floorId,
        revision: 0,
        devices: [],
        walls: [wall],
        ports: [],
        cables: [],
        overlay: null,
      },
      { kind: "walls.delete", meta: meta(5), wallIds: [wall.id] },
    );

    expect(inverse).toEqual({
      kind: "walls.add",
      meta: meta(5),
      walls: [wall],
    });
  });
});
