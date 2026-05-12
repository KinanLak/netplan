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
  metadata: {},
});

describe("buildInverseOperation", () => {
  it("builds a move inverse that patches only position", () => {
    const original = device(deviceId("device:a"));
    const snapshot = { floorId, devices: [original], walls: [], links: [] };
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
    const snapshot = { floorId, devices: [a, b], walls: [], links: [link] };

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

  it("reverses batch operations in reverse order", () => {
    const a = device(deviceId("device:a"));
    const snapshot = { floorId, devices: [a], walls: [], links: [] };
    const batch: MapOperation = {
      kind: "batch",
      meta: meta(2),
      operations: [
        {
          kind: "device.patch",
          meta: meta(3),
          deviceId: a.id,
          patch: { position: { x: 40, y: 0 } },
        },
        {
          kind: "device.patch",
          meta: meta(4),
          deviceId: a.id,
          patch: { name: "Moved" },
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
      { floorId, devices: [], walls: [wall], links: [] },
      { kind: "walls.delete", meta: meta(5), wallIds: [wall.id] },
    );

    expect(inverse).toEqual({
      kind: "walls.add",
      meta: meta(5),
      walls: [wall],
    });
  });
});
