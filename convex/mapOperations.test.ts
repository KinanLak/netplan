import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

const meta = (seq: number) => ({
  opId: `op:test:${counter}:${seq}`,
  clientId: "client:test",
  clientSeq: seq,
  createdAt: seq,
});

async function freshFloor(t: ReturnType<typeof convexTest>) {
  counter += 1;
  const buildingId = await t.mutation(api.buildings.create, {
    objectId: `building:ops:${counter}`,
    name: "Ops",
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:ops:${counter}`,
    buildingId,
    name: "Floor",
  });
}

const device = (id: string, floorId: string, x: number, y = 0) => ({
  id,
  floorId,
  type: "pc" as const,
  name: id,
  position: { x, y },
  size: { width: 80, height: 80 },
  metadata: {},
});

describe("mapOperations.apply", () => {
  it("is idempotent by opId and writes one operation log row", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const operation = {
      kind: "device.create" as const,
      meta: meta(0),
      device: device("device:idempotent", floorId, 0),
    };

    const first = await t.mutation(api.mapOperations.apply, { operation });
    const second = await t.mutation(api.mapOperations.apply, { operation });

    expect(first.status).toBe("applied");
    expect(first.opId).toBe(operation.meta.opId);
    expect(first.appliedRevision).toBe(1);
    expect(second).toEqual(first);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("clientOperations").collect()).toHaveLength(1);
      expect(await ctx.db.query("devices").collect()).toHaveLength(1);
    });
    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.revision).toBe(first.appliedRevision);
  });

  it("treats duplicate create with same object id and payload as safe", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const first = {
      kind: "device.create" as const,
      meta: meta(1),
      device: device("device:duplicate", floorId, 0),
    };
    const duplicate = { ...first, meta: meta(2) };

    await t.mutation(api.mapOperations.apply, { operation: first });
    const result = await t.mutation(api.mapOperations.apply, {
      operation: duplicate,
    });

    expect(result.status).toBe("applied");
    await t.run(async (ctx) => {
      expect(await ctx.db.query("devices").collect()).toHaveLength(1);
    });
  });

  it("rejects duplicate create with same object id and different payload", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(3),
        device: device("device:conflict", floorId, 0),
      },
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(4),
        device: { ...device("device:conflict", floorId, 0), name: "Other" },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("different payload");
  });

  it("rejects moving into another device", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(5),
        device: device("device:a", floorId, 0),
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(6),
        device: device("device:b", floorId, 200),
      },
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(7),
        deviceId: "device:b",
        patch: { position: { x: 40, y: 0 } },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("another device");
  });

  it("rejects moving into a wall", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(8),
        walls: [
          {
            id: "wall:blocker",
            floorId,
            start: { x: 0, y: 40 },
            end: { x: 80, y: 40 },
            color: "concrete",
            geometryKey: "0:40:80:40",
          },
        ],
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(9),
        device: device("device:mover", floorId, 200),
      },
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(10),
        deviceId: "device:mover",
        patch: { position: { x: 0, y: 0 } },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("wall");
  });

  it("rejects linking across floors", async () => {
    const t = convexTest(schema, modules);
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(11),
        device: device("device:a", floorA, 0),
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(12),
        device: device("device:b", floorB, 0),
      },
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "link.create",
        meta: meta(13),
        link: {
          id: "link:cross",
          floorId: floorA,
          fromDeviceId: "device:a",
          toDeviceId: "device:b",
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("same floor");
  });

  it("deleting a device removes connected links", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(14),
        operations: [
          {
            kind: "device.create",
            device: device("device:a", floorId, 0),
          },
          {
            kind: "device.create",
            device: device("device:b", floorId, 200),
          },
          {
            kind: "link.create",
            link: {
              id: "link:ab",
              floorId,
              fromDeviceId: "device:a",
              toDeviceId: "device:b",
            },
          },
        ],
      },
    });

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.delete",
        meta: meta(18),
        deviceId: "device:a",
      },
    });

    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.devices.map((item) => item.id)).toEqual(["device:b"]);
    expect(document.links).toEqual([]);
  });

  it("rejects walls.add atomically without inserting earlier valid walls", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(19),
        device: device("device:blocker", floorId, 0),
      },
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(20),
        walls: [
          {
            id: "wall:safe-before-reject",
            floorId,
            start: { x: 200, y: 200 },
            end: { x: 280, y: 200 },
            color: "sand",
            geometryKey: "200:200:280:200",
          },
          {
            id: "wall:collides",
            floorId,
            start: { x: 0, y: 40 },
            end: { x: 80, y: 40 },
            color: "concrete",
            geometryKey: "0:40:80:40",
          },
        ],
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("device");
    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.walls).toEqual([]);
  });

  it("rejects batches atomically when a later sub-operation is invalid", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(21),
        operations: [
          {
            kind: "device.create",
            device: device("device:batch-created", floorId, 0),
          },
          {
            kind: "link.create",
            link: {
              id: "link:invalid-batch",
              floorId,
              fromDeviceId: "device:batch-created",
              toDeviceId: "device:missing",
            },
          },
        ],
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("endpoint");
    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.devices).toEqual([]);
    expect(document.links).toEqual([]);
  });

  it("applies all writes for a valid batch", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    const operation = {
      kind: "batch" as const,
      meta: meta(24),
      operations: [
        {
          kind: "device.create" as const,
          device: device("device:batch-a", floorId, 0),
        },
        {
          kind: "device.create" as const,
          device: device("device:batch-b", floorId, 200),
        },
        {
          kind: "link.create" as const,
          link: {
            id: "link:batch-ab",
            floorId,
            fromDeviceId: "device:batch-a",
            toDeviceId: "device:batch-b",
          },
        },
      ],
    };

    const result = await t.mutation(api.mapOperations.apply, { operation });
    const replay = await t.mutation(api.mapOperations.apply, { operation });

    expect(result.status).toBe("applied");
    expect(replay).toEqual(result);
    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.devices.map((item) => item.id).sort()).toEqual([
      "device:batch-a",
      "device:batch-b",
    ]);
    expect(document.links.map((item) => item.id)).toEqual(["link:batch-ab"]);
  });

  it("rejects batch sub-operations with hidden metadata", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const operation = {
      kind: "batch" as const,
      meta: meta(35),
      operations: [
        {
          kind: "device.create" as const,
          meta: meta(36),
          device: device("device:hidden-meta", floorId, 0),
        },
      ],
    };

    let rejected = false;
    try {
      await t.mutation(api.mapOperations.apply, { operation });
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it("rejects oversized batches before applying writes", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const operation = {
      kind: "batch" as const,
      meta: meta(37),
      operations: Array.from({ length: 101 }, (_, index) => ({
        kind: "device.create" as const,
        device: device(`device:oversized:${index}`, floorId, index * 100),
      })),
    };

    const result = await t.mutation(api.mapOperations.apply, { operation });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Too many operations");
    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.devices).toEqual([]);
  });

  it("returns stored rejections for repeated rejected opIds without writing", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const operation = {
      kind: "batch" as const,
      meta: meta(28),
      operations: [
        {
          kind: "device.create" as const,
          device: device("device:retry-rejected", floorId, 0),
        },
        {
          kind: "link.create" as const,
          link: {
            id: "link:retry-rejected",
            floorId,
            fromDeviceId: "device:retry-rejected",
            toDeviceId: "device:missing",
          },
        },
      ],
    };

    const first = await t.mutation(api.mapOperations.apply, { operation });
    const second = await t.mutation(api.mapOperations.apply, { operation });

    expect(first.status).toBe("rejected");
    expect(second).toEqual(first);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("clientOperations").collect()).toHaveLength(1);
      expect(await ctx.db.query("devices").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
    });
  });

  it("rejects non-canonical wall geometry keys", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(31),
        walls: [
          {
            id: "wall:canonical",
            floorId,
            start: { x: 0, y: 0 },
            end: { x: 20, y: 0 },
            color: "sand",
            geometryKey: "bogus-a",
          },
        ],
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("wall geometry");
  });

  it("persists canonical wall endpoints for reversed equivalent input", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(32),
        walls: [
          {
            id: "wall:reversed",
            floorId,
            start: { x: 20, y: 0 },
            end: { x: 0, y: 0 },
            color: "concrete",
            geometryKey: "0:0:20:0",
          },
        ],
      },
    });

    expect(result.status).toBe("applied");
    const document = await t.query(api.mapDocument.getFloorDocument, {
      floorId,
    });
    expect(document.walls[0]?.start).toEqual({ x: 0, y: 0 });
    expect(document.walls[0]?.end).toEqual({ x: 20, y: 0 });
    expect(document.walls[0]?.geometryKey).toBe("0:0:20:0");
  });

  it("rejects malformed device sizes and positions", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    const badSize = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(33),
        device: {
          ...device("device:bad-size", floorId, 0),
          size: { width: 0, height: 80 },
        },
      },
    });
    const badPosition = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(34),
        device: {
          ...device("device:bad-position", floorId, 0),
          position: { x: -1, y: 0 },
        },
      },
    });

    expect(badSize.status).toBe("rejected");
    expect(badPosition.status).toBe("rejected");
  });
});
