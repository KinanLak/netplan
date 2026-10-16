import { describe, expect, it } from "bun:test";
import type { Device, DeviceId, FloorId, LinkId, WallId } from "@/types/map";
import { applyOperation } from "./applyOperation";
import { buildInverseOperation } from "./buildInverseOperation";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;
const deviceId = (value: string) => value as DeviceId;
const wallId = (value: string) => value as WallId;
const linkId = (value: string) => value as LinkId;
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

describe("buildInverseOperation", () => {
  it("builds a move inverse that patches only position", () => {
    const original = device(deviceId("device:a"));
    const snapshot = {
      floorId,
      revision: 0,
      devices: [original],
      walls: [],
      links: [],
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

  it("restores deleted devices and connected links as a batch", () => {
    const a = device(deviceId("device:a"));
    const b = device(deviceId("device:b"));
    const link = {
      id: linkId("link:a"),
      floorId,
      fromDeviceId: a.id,
      toDeviceId: b.id,
    };
    const snapshot = {
      floorId,
      revision: 0,
      devices: [a, b],
      walls: [],
      links: [link],
      overlay: null,
    };

    const inverse = buildInverseOperation(snapshot, {
      kind: "device.delete",
      meta: meta(1),
      deviceId: a.id,
    });

    expect(inverse?.kind).toBe("batch");
    if (inverse?.kind !== "batch") return;
    expect(inverse.operations.map((operation) => operation.kind)).toEqual([
      "device.create",
      "link.create",
    ]);
  });

  it("puts an unplaced device back with its links, and takes a placed one off", () => {
    const a = device(deviceId("device:a"));
    const b = { ...device(deviceId("device:b")), position: { x: 200, y: 0 } };
    const link = {
      id: linkId("link:a"),
      floorId,
      fromDeviceId: a.id,
      toDeviceId: b.id,
    };
    const snapshot = {
      floorId,
      revision: 0,
      devices: [a, b],
      walls: [],
      links: [link],
      overlay: null,
    };
    const unplace: MapOperation = {
      kind: "device.unplace",
      meta: meta(1),
      deviceId: a.id,
    };

    const inverse = buildInverseOperation(snapshot, unplace);
    const unplaced = applyOperation(snapshot, unplace).snapshot;

    expect(inverse?.kind).toBe("batch");
    if (!inverse) return;
    const restored = applyOperation(unplaced, inverse).snapshot;
    expect(restored.devices).toContainEqual(a);
    expect(restored.links).toEqual([link]);
    expect(buildInverseOperation(unplaced, inverse)).toMatchObject({
      kind: "batch",
      operations: [
        { kind: "link.delete", linkId: link.id },
        { kind: "device.unplace", deviceId: a.id },
      ],
    });
  });

  it("reverses batch operations in reverse order", () => {
    const a = device(deviceId("device:a"));
    const snapshot = {
      floorId,
      revision: 0,
      devices: [a],
      walls: [],
      links: [],
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
        links: [],
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
