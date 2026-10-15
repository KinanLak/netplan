import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { addLine } from "../src/walls/engine";
import type { FloorId, WallId } from "../src/types/map";
import { signedInTest, createTestSite } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

let counter = 0;

const meta = (seq: number) => ({
  opId: `op:test:${counter}:${seq}`,
  clientId: "client:test",
  clientSeq: seq,
  createdAt: seq,
});

async function getFloorDocument(t: TestClient, floorId: string) {
  const [devices, walls, links, revision] = await Promise.all([
    t.query(api.mapDocument.getFloorDevices, { floorId }),
    t.query(api.mapDocument.getFloorWalls, { floorId }),
    t.query(api.mapDocument.getFloorLinks, { floorId }),
    t.query(api.mapDocument.getFloorRevision, { floorId }),
  ]);
  return { floorId, revision, devices, walls, links };
}

async function freshFloor(t: TestClient, siteId?: string) {
  counter += 1;
  siteId ??= await createTestSite(t);
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
    objectId: `building:ops:${counter}`,
    name: "Ops",
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:ops:${counter}`,
    buildingId,
    name: "Floor",
  });
}

const device = (
  id: string,
  floorId: string,
  x: number,
  y = 0,
  macs: Array<string> = [],
) => ({
  id,
  floorId,
  type: "pc" as const,
  name: id,
  position: { x, y },
  size: { width: 80, height: 80 },
  macs,
  metadata: {},
});

const wall = (id: string, floorId: string, x: number, y: number) => ({
  id,
  floorId,
  start: { x, y },
  end: { x: x + 20, y },
  color: "sand" as const,
  geometryKey: `${x}:${y}:${x + 20}:${y}`,
});

const expectApplicationRejected = async (
  action: () => Promise<{ status: "applied" | "rejected"; error?: string }>,
) => {
  const result = await action();
  expect(result.status).toBe("rejected");
  return result;
};

describe("mapOperations.apply", () => {
  it("is idempotent by opId and writes one operation log row", async () => {
    const t = await signedInTest();
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
    const document = await getFloorDocument(t, floorId);
    expect(document.revision).toBe(first.appliedRevision);
  });

  it("treats duplicate create with same object id and payload as safe", async () => {
    const t = await signedInTest();
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
    const t = await signedInTest();
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
    const t = await signedInTest();
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
    const t = await signedInTest();
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
    const t = await signedInTest();
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
    const t = await signedInTest();
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

    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id)).toEqual(["device:b"]);
    expect(document.links).toEqual([]);
  });

  it("rejects walls.add atomically without inserting earlier valid walls", async () => {
    const t = await signedInTest();
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
    const document = await getFloorDocument(t, floorId);
    expect(document.walls).toEqual([]);
  });

  it("rejects batches atomically when a later sub-operation is invalid", async () => {
    const t = await signedInTest();
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
    const document = await getFloorDocument(t, floorId);
    expect(document.devices).toEqual([]);
    expect(document.links).toEqual([]);
  });

  it("applies all writes for a valid batch", async () => {
    const t = await signedInTest();
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
    expect(result.floorId).toBe(floorId);
    expect(replay).toEqual(result);
    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id).sort()).toEqual([
      "device:batch-a",
      "device:batch-b",
    ]);
    expect(document.links.map((item) => item.id)).toEqual(["link:batch-ab"]);
  });

  it("rejects batch sub-operations with hidden metadata", async () => {
    const t = await signedInTest();
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
    const t = await signedInTest();
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
    const document = await getFloorDocument(t, floorId);
    expect(document.devices).toEqual([]);
  });

  it("returns stored rejections for repeated rejected opIds without writing", async () => {
    const t = await signedInTest();
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
    const t = await signedInTest();
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

  it("accepts wall segments produced by the wall engine", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const generated = addLine({
      walls: [],
      floorId: floorId as FloorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 50, y: 10 },
      generateWallId: (() => {
        let index = 0;
        return () => `wall:ui:${++index}` as WallId;
      })(),
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(30),
        walls: generated.nextWalls,
      },
    });

    expect(result.status).toBe("applied");
    const document = await getFloorDocument(t, floorId);
    expect(document.walls.map((item) => item.geometryKey)).toEqual([
      "10:10:10:10",
      "30:10:30:10",
      "50:10:50:10",
    ]);
  });

  it("persists canonical wall endpoints for reversed equivalent input", async () => {
    const t = await signedInTest();
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
    const document = await getFloorDocument(t, floorId);
    expect(document.walls[0]?.start).toEqual({ x: 0, y: 0 });
    expect(document.walls[0]?.end).toEqual({ x: 20, y: 0 });
    expect(document.walls[0]?.geometryKey).toBe("0:0:20:0");
  });

  it("accepts finite negative positions for devices and walls", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);

    const created = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(33),
        device: device("device:negative", floorId, -200, -200),
      },
    });
    const patched = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(34),
        deviceId: "device:negative",
        patch: { position: { x: -400, y: -400 } },
      },
    });
    const wallResult = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(35),
        walls: [wall("wall:negative", floorId, -100, -100)],
      },
    });

    expect(created.status).toBe("applied");
    expect(patched.status).toBe("applied");
    expect(wallResult.status).toBe("applied");
  });

  it("rejects non-finite device and wall positions", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const values = [NaN, Infinity, -Infinity];

    for (const [index, value] of values.entries()) {
      const deviceResult = await expectApplicationRejected(() =>
        t.mutation(api.mapOperations.apply, {
          operation: {
            kind: "device.create",
            meta: meta(40 + index),
            device: {
              ...device(`device:bad-position:${index}`, floorId, index * 100),
              position: { x: value, y: 0 },
            },
          },
        }),
      );
      expect(deviceResult.error).toContain("finite numbers");

      const wallResult = await expectApplicationRejected(() =>
        t.mutation(api.mapOperations.apply, {
          operation: {
            kind: "walls.add",
            meta: meta(50 + index),
            walls: [
              {
                ...wall(`wall:bad-position:${index}`, floorId, index * 40, 0),
                start: { x: value, y: 0 },
                geometryKey: `${value}:0:${index * 40 + 20}:0`,
              },
            ],
          },
        }),
      );
      expect(wallResult.error).toContain("wall geometry");
    }
  });

  it("rejects invalid device sizes", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const applicationRejectedSizes = [
      { width: -1, height: 80 },
      { width: 0, height: 80 },
      { width: 80, height: -1 },
      { width: 80, height: 0 },
    ];
    for (const [index, size] of applicationRejectedSizes.entries()) {
      const result = await expectApplicationRejected(() =>
        t.mutation(api.mapOperations.apply, {
          operation: {
            kind: "device.create",
            meta: meta(60 + index),
            device: {
              ...device(`device:bad-size:${index}`, floorId, index * 100),
              size,
            },
          },
        }),
      );
      expect(result.error).toContain("greater than zero");
    }

    for (const [index, size] of [
      { width: NaN, height: 80 },
      { width: Infinity, height: 80 },
    ].entries()) {
      const result = await expectApplicationRejected(() =>
        t.mutation(api.mapOperations.apply, {
          operation: {
            kind: "device.create",
            meta: meta(70 + index),
            device: {
              ...device(
                `device:bad-finite-size:${index}`,
                floorId,
                index * 100,
              ),
              size,
            },
          },
        }),
      );
      expect(result.error).toContain("finite numbers");
    }
  });

  it("rejects cross-floor operations", async () => {
    const t = await signedInTest();
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);

    const batch = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(70),
        operations: [
          {
            kind: "device.create",
            device: device("device:floor-a", floorA, 0),
          },
          {
            kind: "device.create",
            device: device("device:floor-b", floorB, 0),
          },
        ],
      },
    });
    const wallsAdd = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(71),
        walls: [
          wall("wall:floor-a", floorA, 0, 0),
          wall("wall:floor-b", floorB, 0, 0),
        ],
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(72),
        walls: [wall("wall:delete-a", floorA, 40, 0)],
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.add",
        meta: meta(73),
        walls: [wall("wall:delete-b", floorB, 40, 0)],
      },
    });
    const wallsDelete = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.delete",
        meta: meta(74),
        wallIds: ["wall:delete-a", "wall:delete-b"],
      },
    });

    expect(batch.status).toBe("rejected");
    expect(batch.error).toContain("exactly one floor");
    expect(wallsAdd.status).toBe("rejected");
    expect(wallsAdd.error).toContain("exactly one floor");
    expect(wallsDelete.status).toBe("rejected");
    expect(wallsDelete.error).toContain("exactly one floor");
  });

  it("rejects new deletes for missing objects but replays applied delete opIds", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(80),
        operations: [
          {
            kind: "device.create",
            device: device("device:delete", floorId, 0),
          },
          {
            kind: "device.create",
            device: device("device:link-target", floorId, 200),
          },
          {
            kind: "link.create",
            link: {
              id: "link:delete",
              floorId,
              fromDeviceId: "device:delete",
              toDeviceId: "device:link-target",
            },
          },
          { kind: "walls.add", walls: [wall("wall:delete", floorId, 0, 200)] },
        ],
      },
    });

    const deleteOperation = {
      kind: "device.delete" as const,
      meta: meta(81),
      deviceId: "device:delete",
    };
    const firstDelete = await t.mutation(api.mapOperations.apply, {
      operation: deleteOperation,
    });
    const replayDelete = await t.mutation(api.mapOperations.apply, {
      operation: deleteOperation,
    });
    const missingDevice = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.delete",
        meta: meta(82),
        deviceId: "device:delete",
      },
    });
    const missingLink = await t.mutation(api.mapOperations.apply, {
      operation: { kind: "link.delete", meta: meta(83), linkId: "link:delete" },
    });
    const missingWall = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.delete",
        meta: meta(84),
        wallIds: ["wall:missing"],
      },
    });

    expect(firstDelete.status).toBe("applied");
    expect(replayDelete).toEqual(firstDelete);
    expect(missingDevice.status).toBe("rejected");
    expect(missingDevice.error).toContain("Device not found");
    expect(missingLink.status).toBe("rejected");
    expect(missingLink.error).toContain("Link not found");
    expect(missingWall.status).toBe("rejected");
    expect(missingWall.error).toContain("Wall not found");
  });

  it("observes applied and rejected pending operation log rows by op id", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const appliedOperation = {
      kind: "device.create" as const,
      meta: meta(90),
      device: device("device:observed", floorId, 0),
    };
    const rejectedOperation = {
      kind: "device.delete" as const,
      meta: meta(91),
      deviceId: "device:missing-observed",
    };
    await t.mutation(api.mapOperations.apply, { operation: appliedOperation });
    await t.mutation(api.mapOperations.apply, { operation: rejectedOperation });

    const observed = await t.query(api.mapOperations.observePending, {
      opIds: [appliedOperation.meta.opId, rejectedOperation.meta.opId],
    });

    expect(observed.map((item) => item.opId).sort()).toEqual(
      [appliedOperation.meta.opId, rejectedOperation.meta.opId].sort(),
    );
    expect(
      observed.find((item) => item.opId === appliedOperation.meta.opId),
    ).toMatchObject({
      status: "applied",
      floorId,
      appliedRevision: 1,
    });
    expect(
      observed.find((item) => item.opId === rejectedOperation.meta.opId),
    ).toMatchObject({
      status: "rejected",
      error: "Device not found",
    });
  });

  it("bounds walls.delete payload size", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const walls = Array.from({ length: 500 }, (_, index) =>
      wall(`wall:cap:${index}`, floorId, 0, index * 20),
    );
    await t.mutation(api.mapOperations.apply, {
      operation: { kind: "walls.add", meta: meta(100), walls },
    });

    const atCap = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.delete",
        meta: meta(101),
        wallIds: walls.map((item) => item.id),
      },
    });
    const overCap = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.delete",
        meta: meta(102),
        wallIds: Array.from(
          { length: 501 },
          (_, index) => `wall:over:${index}`,
        ),
      },
    });

    expect(atCap.status).toBe("applied");
    expect(overCap.status).toBe("rejected");
    expect(overCap.error).toContain("Too many walls");
  });
});

describe("mapOperations.apply on the site inventory", () => {
  const MAC = "02:ab:cd:00:00:01";

  const create = (
    t: TestClient,
    seq: number,
    item: ReturnType<typeof device>,
  ) =>
    t.mutation(api.mapOperations.apply, {
      operation: { kind: "device.create", meta: meta(seq), device: item },
    });

  it("files a created device under its floor's site", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorId = await freshFloor(t, siteId);

    await create(t, 1, device("device:site", floorId, 0, 0, [MAC]));

    const [row, macs] = await t.run(async (ctx) => [
      await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", "device:site"))
        .unique(),
      await ctx.db.query("deviceMacs").collect(),
    ]);
    expect(row).toMatchObject({
      siteId,
      macs: [MAC],
      placement: { floorId, position: { x: 0, y: 0 } },
    });
    expect(macs).toMatchObject([{ siteId, mac: MAC, deviceId: "device:site" }]);
  });

  it("keeps a MAC address to one device of a site", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorA = await freshFloor(t, siteId);
    const floorB = await freshFloor(t, siteId);
    const otherSiteFloor = await freshFloor(t);

    await create(t, 1, device("device:first", floorA, 0, 0, [MAC]));
    const sameSite = await create(
      t,
      2,
      device("device:second", floorB, 0, 0, [MAC]),
    );
    const otherSite = await create(
      t,
      3,
      device("device:elsewhere", otherSiteFloor, 0, 0, [MAC]),
    );

    expect(sameSite).toMatchObject({
      status: "rejected",
      error: "MAC address belongs to another device of the site",
    });
    expect(otherSite.status).toBe("applied");
  });

  it("rejects duplicate and non-canonical MAC addresses", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);

    const duplicate = await create(
      t,
      1,
      device("device:dup", floorId, 0, 0, [MAC, MAC]),
    );
    const uppercase = await create(
      t,
      2,
      device("device:upper", floorId, 0, 0, [MAC.toUpperCase()]),
    );

    expect(duplicate.error).toBe("Duplicate MAC address");
    expect(uppercase.error).toBe("Invalid MAC address");
  });

  it("rejects a device whose identity breaks the drawer's limits", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);

    const longName = await create(t, 1, {
      ...device("device:long", floorId, 0, 0),
      name: "x".repeat(121),
    });

    expect(longName.error).toBe("Invalid device identity");
  });

  it("frees the MAC addresses of a deleted device, within one batch too", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:old", floorId, 0, 0, [MAC]));

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(2),
        operations: [
          { kind: "device.delete", deviceId: "device:old" },
          {
            kind: "device.create",
            device: device("device:new", floorId, 0, 0, [MAC]),
          },
        ],
      },
    });

    expect(result.status).toBe("applied");
    const macs = await t.run((ctx) => ctx.db.query("deviceMacs").collect());
    expect(macs.map((row) => row.deviceId)).toEqual(["device:new"]);
  });

  it("refuses to delete a device its integration owns", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorId = await freshFloor(t, siteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:sourced",
        siteId,
        type: "switch",
        name: "sw-1",
        macs: [],
        placement: {
          floorId,
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
        },
        source: { integration: "netbox", externalId: "7", syncedAt: 1 },
        metadata: {},
        updatedAt: 1,
        updatedBy: "sync",
      });
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.delete",
        meta: meta(1),
        deviceId: "device:sourced",
      },
    });

    expect(result).toMatchObject({
      status: "rejected",
      error: "Device is owned by its source",
    });
  });

  it("does not reuse the id of a device that is off the map", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorId = await freshFloor(t, siteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:unplaced",
        siteId,
        type: "pc",
        name: "Stored",
        macs: [],
        metadata: {},
        updatedAt: 1,
        updatedBy: "test",
      });
    });

    const created = await create(t, 1, device("device:unplaced", floorId, 0));
    const moved = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(2),
        deviceId: "device:unplaced",
        patch: { position: { x: 100, y: 0 } },
      },
    });

    expect(created.status).toBe("rejected");
    expect(moved).toMatchObject({
      status: "rejected",
      error: "Device not found",
    });
  });
  const unplace = (t: TestClient, seq: number, deviceId: string) =>
    t.mutation(api.mapOperations.apply, {
      operation: { kind: "device.unplace", meta: meta(seq), deviceId },
    });

  const place = (t: TestClient, seq: number, item: ReturnType<typeof device>) =>
    t.mutation(api.mapOperations.apply, {
      operation: { kind: "device.place", meta: meta(seq), device: item },
    });

  const deviceRow = (t: TestClient, objectId: string) =>
    t.run((ctx) =>
      ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
        .unique(),
    );

  it("takes a device off its floor with its links, and keeps it in the inventory", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(1),
        operations: [
          {
            kind: "device.create",
            device: device("device:kept", floorId, 0, 0, [MAC]),
          },
          {
            kind: "device.create",
            device: device("device:peer", floorId, 200),
          },
          {
            kind: "link.create",
            link: {
              id: "link:kept",
              floorId,
              fromDeviceId: "device:kept",
              toDeviceId: "device:peer",
            },
          },
        ],
      },
    });
    const before = await getFloorDocument(t, floorId);

    const result = await unplace(t, 2, "device:kept");

    expect(result.status).toBe("applied");
    const after = await getFloorDocument(t, floorId);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.devices.map((item) => item.id)).toEqual(["device:peer"]);
    expect(after.links).toEqual([]);
    const row = await deviceRow(t, "device:kept");
    expect(row?.placement).toBeUndefined();
    expect(row?.macs).toEqual([MAC]);
    const macs = await t.run((ctx) => ctx.db.query("deviceMacs").collect());
    expect(macs.map((item) => item.deviceId)).toEqual(["device:kept"]);
  });

  it("puts an unplaced device back, and its links with it as undo does", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:back", floorId, 0));
    await create(t, 2, device("device:other", floorId, 200));
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "link.create",
        meta: meta(3),
        link: {
          id: "link:back",
          floorId,
          fromDeviceId: "device:back",
          toDeviceId: "device:other",
        },
      },
    });
    await unplace(t, 4, "device:back");

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(5),
        operations: [
          {
            kind: "device.place",
            device: device("device:back", floorId, 0),
          },
          {
            kind: "link.create",
            link: {
              id: "link:back",
              floorId,
              fromDeviceId: "device:back",
              toDeviceId: "device:other",
            },
          },
        ],
      },
    });

    expect(result.status).toBe("applied");
    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id).sort()).toEqual([
      "device:back",
      "device:other",
    ]);
    expect(document.links.map((item) => item.id)).toEqual(["link:back"]);
  });

  it("takes only where a placed device stands, never its identity", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:identity", floorId, 0, 0, [MAC]));
    await unplace(t, 2, "device:identity");

    const result = await place(t, 3, {
      ...device("device:identity", floorId, 100, 40),
      name: "Renamed",
    });

    expect(result.status).toBe("applied");
    const row = await deviceRow(t, "device:identity");
    expect(row).toMatchObject({
      name: "device:identity",
      macs: [MAC],
      placement: { floorId, position: { x: 100, y: 40 } },
    });
  });

  it("accepts placing a device again where it stands, and refuses elsewhere", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:twice", floorId, 0));

    const same = await place(t, 2, device("device:twice", floorId, 0));
    const elsewhere = await place(t, 3, device("device:twice", floorId, 200));

    expect(same.status).toBe("applied");
    expect(elsewhere).toMatchObject({
      status: "rejected",
      error: "Device is already placed",
    });
  });

  it("refuses to place a device of another site or one it does not know", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const otherFloor = await freshFloor(t);
    await create(t, 1, device("device:foreign", otherFloor, 0));
    await unplace(t, 2, "device:foreign");

    const foreign = await place(t, 3, device("device:foreign", floorId, 0));
    const unknown = await place(t, 4, device("device:unknown", floorId, 0));

    expect(foreign).toMatchObject({
      status: "rejected",
      error: "Device belongs to another site",
    });
    expect(unknown).toMatchObject({
      status: "rejected",
      error: "Device not found",
    });
  });

  it("refuses to place a device over another", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:moved", floorId, 0));
    await create(t, 2, device("device:there", floorId, 300));
    await unplace(t, 3, "device:moved");

    const result = await place(t, 4, device("device:moved", floorId, 300));

    expect(result.status).toBe("rejected");
    expect((await deviceRow(t, "device:moved"))?.placement).toBeUndefined();
  });

  it("takes a device its integration owns off the map", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorId = await freshFloor(t, siteId);
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:sourced-off",
        siteId,
        type: "switch",
        name: "sw-2",
        macs: [],
        placement: {
          floorId,
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
        },
        source: { integration: "netbox", externalId: "8", syncedAt: 1 },
        metadata: {},
        updatedAt: 1,
        updatedBy: "sync",
      });
    });

    const result = await unplace(t, 1, "device:sourced-off");

    expect(result.status).toBe("applied");
    const row = await deviceRow(t, "device:sourced-off");
    expect(row?.placement).toBeUndefined();
    expect(row?.source?.externalId).toBe("8");
  });
});
