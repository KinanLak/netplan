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
  const [devices, walls, ports, cables, revision] = await Promise.all([
    t.query(api.mapDocument.getFloorDevices, { floorId }),
    t.query(api.mapDocument.getFloorWalls, { floorId }),
    t.query(api.mapDocument.getFloorPorts, { floorId }),
    t.query(api.mapDocument.getFloorCables, { floorId }),
    t.query(api.mapDocument.getFloorRevision, { floorId }),
  ]);
  return { floorId, revision, devices, walls, ports, cables };
}

async function freshFloor(t: TestClient, siteId?: string) {
  counter += 1;
  siteId ??= await createTestSite(t);
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
    objectId: `building:ops:${counter}`,
    name: `Ops ${counter}`,
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

const portOf = (deviceId: string) => `port:${deviceId}:interface:1`;

/** A cable between the only interface of two PCs. */
const cable = (id: string, from: string, to: string) => ({
  id,
  a: { deviceId: from, portId: portOf(from) },
  b: { deviceId: to, portId: portOf(to) },
});

/** A PC created with a cable to one already there. */
const cabledTo = (id: string, floorId: string, x: number, to: string) => ({
  kind: "device.create" as const,
  device: device(id, floorId, x),
  cables: [cable(`cable:${id}`, id, to)],
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
    expect(result.error).toBe(
      "Cet équipement existe déjà avec d'autres valeurs.",
    );
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
    expect(result.error).toBe("L'équipement chevauche un autre équipement.");
  });

  describe("devices.move", () => {
    /** Two PCs left of a wall from (210, 10) to (210, 190), one more apart. */
    const groupRoom = async (t: TestClient) => {
      const floorId = await freshFloor(t);
      const walls = addLine({
        walls: [],
        floorId: floorId as FloorId,
        color: "concrete",
        start: { x: 210, y: 10 },
        end: { x: 210, y: 190 },
        generateWallId: (() => {
          let index = 0;
          return () => `wall:group:${counter}:${++index}` as WallId;
        })(),
      }).nextWalls;
      await t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "batch",
          meta: meta(40),
          operations: [
            { kind: "walls.add", walls },
            {
              kind: "device.create",
              device: device("device:g1", floorId, 100, 0),
            },
            {
              kind: "device.create",
              device: device("device:g2", floorId, 100, 100),
            },
            {
              kind: "device.create",
              device: device("device:g3", floorId, 0, 300),
            },
          ],
        },
      });
      return floorId;
    };
    /** Where `groupRoom` puts them. */
    const seeded = (ids: Array<string>) =>
      ids.map((deviceId) => ({
        deviceId,
        position: {
          "device:g1": { x: 100, y: 0 },
          "device:g2": { x: 100, y: 100 },
          "device:g3": { x: 0, y: 300 },
        }[deviceId] ?? { x: 0, y: 0 },
      }));
    const positionsOf = async (t: TestClient, floorId: string) =>
      Object.fromEntries(
        (await getFloorDocument(t, floorId)).devices.map((d) => [
          d.id,
          d.position,
        ]),
      );

    it("moves every member by one offset, in one revision", async () => {
      const t = await signedInTest();
      const floorId = await groupRoom(t);
      const before = await getFloorDocument(t, floorId);

      const result = await t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "devices.move",
          meta: meta(41),
          from: seeded(["device:g1", "device:g2"]),
          offset: { x: 20, y: 0 },
        },
      });

      expect(result.status).toBe("applied");
      expect(result.appliedRevision).toBe(before.revision + 1);
      expect(await positionsOf(t, floorId)).toEqual({
        "device:g1": { x: 120, y: 0 },
        "device:g2": { x: 120, y: 100 },
        "device:g3": { x: 0, y: 300 },
      });
    });

    it("refuses a member passing through a wall, and one landing on it", async () => {
      const t = await signedInTest();
      const floorId = await groupRoom(t);
      const apply = (offset: { x: number; y: number }, seq: number) =>
        expectApplicationRejected(() =>
          t.mutation(api.mapOperations.apply, {
            operation: {
              kind: "devices.move",
              meta: meta(seq),
              from: seeded(["device:g1", "device:g2"]),
              offset,
            },
          }),
        );

      expect((await apply({ x: 160, y: 0 }, 42)).error).toBe(
        "Un équipement du groupe traverserait un mur.",
      );
      expect((await apply({ x: 40, y: 0 }, 43)).error).toBe(
        "L'équipement chevauche un mur.",
      );
      expect((await positionsOf(t, floorId))["device:g1"]).toEqual({
        x: 100,
        y: 0,
      });
    });

    it("lets members take each other's spots, and refuses a group over floors", async () => {
      const t = await signedInTest();
      const floorId = await groupRoom(t);
      const moved = await t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "devices.move",
          meta: meta(44),
          from: seeded(["device:g1", "device:g2"]),
          offset: { x: 0, y: 40 },
        },
      });
      expect(moved.status).toBe("applied");

      const otherFloor = await freshFloor(t);
      await t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "device.create",
          meta: meta(45),
          device: device("device:elsewhere", otherFloor, 0),
        },
      });
      await expectApplicationRejected(() =>
        t.mutation(api.mapOperations.apply, {
          operation: {
            kind: "devices.move",
            meta: meta(46),
            from: [
              ...seeded(["device:g3"]),
              { deviceId: "device:elsewhere", position: { x: 0, y: 0 } },
            ],
            offset: { x: 20, y: 0 },
          },
        }),
      );
      expect((await positionsOf(t, floorId))["device:g3"]).toEqual({
        x: 0,
        y: 300,
      });
    });

    it("refuses a move, or its undo, once a member has moved since", async () => {
      const t = await signedInTest();
      const floorId = await groupRoom(t);
      await t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "device.patch",
          meta: meta(47),
          deviceId: "device:g2",
          patch: { position: { x: 100, y: 200 } },
        },
      });

      const result = await expectApplicationRejected(() =>
        t.mutation(api.mapOperations.apply, {
          operation: {
            kind: "devices.move",
            meta: meta(48),
            from: seeded(["device:g1", "device:g2"]),
            offset: { x: -20, y: 0 },
          },
        }),
      );
      expect(result.error).toBe(
        "Cet équipement a été déplacé depuis, par une autre personne ou par la collecte.",
      );
      expect(await positionsOf(t, floorId)).toMatchObject({
        "device:g1": { x: 100, y: 0 },
      });
    });
  });

  it("rejects putting back a device that has moved since", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(30),
        device: device("device:moved", floorId, 0),
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(31),
        deviceId: "device:moved",
        patch: { position: { x: 300, y: 0 } },
      },
    });

    // An undo of a move to 100, made before the device went to 300.
    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(32),
        deviceId: "device:moved",
        patch: { position: { x: 0, y: 0 } },
        expected: { position: { x: 100, y: 0 } },
      },
    });
    const document = await getFloorDocument(t, floorId);

    expect(result.status).toBe("rejected");
    expect(result.error).toBe(
      "Cet équipement a été déplacé depuis, par une autre personne ou par la collecte.",
    );
    expect(document.devices[0].position).toEqual({ x: 300, y: 0 });
  });

  it("refuses any change to an archived site's plan, and takes them again once it is back", async () => {
    const t = await signedInTest("admin");
    const siteId = await createTestSite(t);
    const floorId = await freshFloor(t, siteId);
    await t.mutation(api.sites.setArchived, { siteId, archived: true });

    const refused = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(40),
        device: device("device:archived", floorId, 0),
      },
    });
    expect(refused).toMatchObject({
      status: "rejected",
      error: "Ce site est archivé : il est en lecture seule.",
    });
    await expect(
      t.mutation(api.floors.rename, { id: floorId, name: "Autre" }),
    ).rejects.toThrow("archivé");
    await expect(
      t.mutation(api.floors.move, { id: floorId, direction: "up" }),
    ).rejects.toThrow("archivé");
    await expect(
      t.mutation(api.buildings.create, {
        siteId,
        objectId: "building:late",
        name: "Late",
      }),
    ).rejects.toThrow("archivé");

    await t.mutation(api.sites.setArchived, { siteId, archived: false });
    const placed = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(41),
        device: device("device:archived", floorId, 0),
      },
    });
    expect(placed.status).toBe("applied");
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
    expect(result.error).toBe("L'équipement chevauche un mur.");
  });

  it("lays a cable to another floor of the site, shown on both, and leaves out one to another site", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorA = await freshFloor(t, siteId);
    const floorB = await freshFloor(t, siteId);
    const otherSite = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(11),
        device: device("device:a", floorA, 0),
      },
    });

    const across = await t.mutation(api.mapOperations.apply, {
      operation: {
        ...cabledTo("device:b", floorB, 0, "device:a"),
        meta: meta(12),
      },
    });
    const elsewhere = await t.mutation(api.mapOperations.apply, {
      operation: {
        ...cabledTo("device:c", otherSite, 0, "device:a"),
        meta: meta(13),
      },
    });

    expect(across.status).toBe("applied");
    const [docA, docB] = await Promise.all([
      getFloorDocument(t, floorA),
      getFloorDocument(t, floorB),
    ]);
    expect(docA.cables.map((item) => item.id)).toEqual(["cable:device:b"]);
    expect(docB.cables.map((item) => item.id)).toEqual(["cable:device:b"]);
    expect(docA.ports.map((item) => item.id)).toEqual([portOf("device:a")]);
    expect(elsewhere.status).toBe("applied");
    const docOther = await getFloorDocument(t, otherSite);
    expect(docOther.devices.map((item) => item.id)).toEqual(["device:c"]);
    expect(docOther.cables).toEqual([]);
  });

  it("refuses ports that are not the device's and cables it cannot hold", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(14),
        operations: [
          { kind: "device.create", device: device("device:hub", floorId, 0) },
          cabledTo("device:first", floorId, 200, "device:hub"),
        ],
      },
    });
    const foreignPort = () => ({
      id: portOf("device:hub"),
      deviceId: "device:hub",
      name: "1",
      kind: "interface" as const,
      order: 1,
    });
    const attempt = (
      seq: number,
      extra: {
        ports?: Array<ReturnType<typeof foreignPort>>;
        cables?: Array<ReturnType<typeof cable>>;
      },
    ) =>
      t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "device.create",
          meta: meta(seq),
          device: device(`device:try-${seq}`, floorId, seq * 100),
          ...extra,
        },
      });

    const stolenPort = await attempt(5, { ports: [foreignPort()] });
    // `device:hub:interface`'s own port 1 has the id of the hub's port 1.
    const takenPort = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(9),
        device: device("device:hub:interface", floorId, 900),
        ports: [{ ...foreignPort(), deviceId: "device:hub:interface" }],
      },
    });
    const occupied = await attempt(6, {
      cables: [cable("cable:occupied", "device:try-6", "device:hub")],
    });
    const badId = await attempt(7, {
      cables: [cable("link:7", "device:try-7", "device:first")],
    });
    const notPlugged = await attempt(8, {
      cables: [cable("cable:8", "device:first", "device:hub")],
    });

    expect(stolenPort.error).toBe(
      "Les ports de cet équipement sont invalides.",
    );
    expect(takenPort.error).toBe("Les ports de cet équipement sont invalides.");
    expect(badId.error).toBe("Les câbles de cet équipement sont invalides.");
    expect(notPlugged.error).toBe(
      "Les câbles de cet équipement sont invalides.",
    );
    // A cable into a port that holds another is left out, not refused.
    expect(occupied.status).toBe("applied");
    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id).sort()).toEqual([
      "device:first",
      "device:hub",
      "device:try-6",
    ]);
    expect(document.cables.map((item) => item.id)).toEqual([
      "cable:device:first",
    ]);
  });

  it("deleting a device removes its ports and cables, and undo brings them back", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(15),
        operations: [
          { kind: "device.create", device: device("device:a", floorId, 0) },
          cabledTo("device:b", floorId, 200, "device:a"),
        ],
      },
    });
    const before = await getFloorDocument(t, floorId);

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.delete",
        meta: meta(18),
        deviceId: "device:a",
      },
    });

    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id)).toEqual(["device:b"]);
    expect(document.ports.map((item) => item.id)).toEqual([portOf("device:b")]);
    expect(document.cables).toEqual([]);

    // What the engine's inverse sends: the device with its ports and cables.
    const undo = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(19),
        device: device("device:a", floorId, 0),
        ports: before.ports.filter((item) => item.deviceId === "device:a"),
        cables: before.cables.map(({ source: _, ...item }) => item),
      },
    });
    expect(undo.status).toBe("applied");
    expect(undo.droppedCables).toBeUndefined();
    const restored = await getFloorDocument(t, floorId);
    expect(restored.ports.map((item) => item.id).sort()).toEqual(
      before.ports.map((item) => item.id).sort(),
    );
    expect(restored.cables).toEqual(before.cables);
  });

  it("undo of a deletion brings the device back without a cable whose far end has gone", async () => {
    const t = await signedInTest();
    const siteId = await createTestSite(t);
    const floorA = await freshFloor(t, siteId);
    const floorB = await freshFloor(t, siteId);
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(40),
        device: device("device:a", floorA, 0),
      },
    });
    await t.mutation(api.mapOperations.apply, {
      operation: {
        ...cabledTo("device:b", floorB, 0, "device:a"),
        meta: meta(41),
      },
    });
    const before = await getFloorDocument(t, floorB);
    for (const [seq, deviceId] of [
      [42, "device:b"],
      [43, "device:a"],
    ] as const) {
      await t.mutation(api.mapOperations.apply, {
        operation: { kind: "device.delete", meta: meta(seq), deviceId },
      });
    }

    // Undo on floor B, whose cable's far end left with `device:a`.
    const undoOperation = {
      kind: "device.create" as const,
      meta: meta(44),
      device: device("device:b", floorB, 0),
      ports: before.ports.filter((item) => item.deviceId === "device:b"),
      cables: before.cables.map(({ source: _, ...item }) => item),
    };
    const undo = await t.mutation(api.mapOperations.apply, {
      operation: undoOperation,
    });

    expect(undo.status).toBe("applied");
    // The user hears how many cables did not come back (4.1), a replay too.
    expect(undo.droppedCables).toBe(1);
    const replay = await t.mutation(api.mapOperations.apply, {
      operation: undoOperation,
    });
    expect(replay.droppedCables).toBe(1);
    const restored = await getFloorDocument(t, floorB);
    expect(restored.devices.map((item) => item.id)).toEqual(["device:b"]);
    expect(restored.ports.map((item) => item.id)).toEqual([portOf("device:b")]);
    expect(restored.cables).toEqual([]);
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
    expect(result.error).toBe("Le mur chevauche un équipement.");
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
            ...cabledTo(
              "device:batch-cabled",
              floorId,
              200,
              "device:batch-created",
            ),
            cables: [
              cable(
                "link:batch",
                "device:batch-cabled",
                "device:batch-created",
              ),
            ],
          },
        ],
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toBe("Les câbles de cet équipement sont invalides.");
    const document = await getFloorDocument(t, floorId);
    expect(document.devices).toEqual([]);
    expect(document.ports).toEqual([]);
    expect(document.cables).toEqual([]);
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
        cabledTo("device:batch-b", floorId, 200, "device:batch-a"),
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
    expect(document.cables.map((item) => item.id)).toEqual([
      "cable:device:batch-b",
    ]);
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
    expect(result.error).toBe("Trop de modifications en une fois.");
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
          ...cabledTo("device:retry-cabled", floorId, 200, "device:missing"),
          cables: [
            cable("link:retry", "device:retry-cabled", "device:missing"),
          ],
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
      expect(await ctx.db.query("ports").collect()).toHaveLength(0);
      expect(await ctx.db.query("cables").collect()).toHaveLength(0);
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
    expect(result.error).toBe("La forme du mur est invalide.");
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
      expect(deviceResult.error).toBe("La position est invalide.");

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
      expect(wallResult.error).toBe("La forme du mur est invalide.");
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
      expect(result.error).toBe("La taille doit être positive.");
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
      expect(result.error).toBe("La taille est invalide.");
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
    expect(batch.error).toBe(
      "Une modification ne peut toucher qu'un seul étage.",
    );
    expect(wallsAdd.status).toBe("rejected");
    expect(wallsAdd.error).toBe(
      "Une modification ne peut toucher qu'un seul étage.",
    );
    expect(wallsDelete.status).toBe("rejected");
    expect(wallsDelete.error).toBe(
      "Une modification ne peut toucher qu'un seul étage.",
    );
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
    expect(missingDevice.error).toBe("Cet équipement n'existe plus.");
    expect(missingWall.status).toBe("rejected");
    expect(missingWall.error).toBe("Ce mur n'existe plus.");
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
      error: "Cet équipement n'existe plus.",
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
    expect(overCap.error).toBe("Trop de murs en une seule modification.");
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

  it("names a drawn device after its hostname, and replays the same create", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const drawn = {
      ...device("device:named", floorId, 0),
      name: "Poste 3",
      hostname: "pc-003",
    };

    await create(t, 1, drawn);
    // A retry of the same operation under a new id is the same device.
    const replay = await create(t, 2, drawn);

    const [row] = await t.query(api.devices.listForFloor, { floorId });
    expect(row).toMatchObject({ name: "pc-003", hostname: "pc-003" });
    expect(replay.status).toBe("applied");
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
      error: "Une adresse MAC appartient déjà à un autre équipement du site.",
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

    expect(duplicate.error).toBe("Une adresse MAC est en double.");
    expect(uppercase.error).toBe("Une adresse MAC est invalide.");
  });

  it("rejects a device whose identity breaks the drawer's limits", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);

    const longName = await create(t, 1, {
      ...device("device:long", floorId, 0, 0),
      name: "x".repeat(254),
    });

    expect(longName.error).toContain("Trop long");
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
      error:
        "Cet équipement vient d'une intégration : il ne peut pas être supprimé.",
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
      error: "Cet équipement n'existe plus.",
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

  it("takes a device off its floor, and keeps it in the inventory with its cables", async () => {
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
          cabledTo("device:peer", floorId, 200, "device:kept"),
        ],
      },
    });
    const before = await getFloorDocument(t, floorId);

    const result = await unplace(t, 2, "device:kept");

    expect(result.status).toBe("applied");
    const after = await getFloorDocument(t, floorId);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.devices.map((item) => item.id)).toEqual(["device:peer"]);
    expect(after.ports.map((item) => item.id)).toEqual([portOf("device:peer")]);
    // Its far end is still on the floor, so the cable stays in view.
    expect(after.cables).toEqual(before.cables);
    const ports = await t.run((ctx) => ctx.db.query("ports").collect());
    expect(ports).toHaveLength(2);
    const row = await deviceRow(t, "device:kept");
    expect(row?.placement).toBeUndefined();
    expect(row?.macs).toEqual([MAC]);
    const macs = await t.run((ctx) => ctx.db.query("deviceMacs").collect());
    expect(macs.map((item) => item.deviceId)).toEqual(["device:kept"]);
  });

  it("puts an unplaced device back, its ports and cables with it", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:back", floorId, 0));
    await t.mutation(api.mapOperations.apply, {
      operation: {
        ...cabledTo("device:other", floorId, 200, "device:back"),
        meta: meta(2),
      },
    });
    const before = await getFloorDocument(t, floorId);
    await unplace(t, 4, "device:back");

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.place",
        meta: meta(5),
        device: device("device:back", floorId, 0),
      },
    });

    expect(result.status).toBe("applied");
    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id).sort()).toEqual([
      "device:back",
      "device:other",
    ]);
    expect(document.ports).toEqual(before.ports);
    expect(document.cables).toEqual(before.cables);
  });

  it("does not take off a device that has moved since it was placed", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await create(t, 1, device("device:placed", floorId, 0));
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(2),
        deviceId: "device:placed",
        patch: { position: { x: 300, y: 0 } },
      },
    });

    const result = await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.unplace",
        meta: meta(3),
        deviceId: "device:placed",
        expected: {
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
        },
      },
    });

    expect(result).toMatchObject({
      status: "rejected",
      error:
        "Cet équipement a été déplacé depuis, par une autre personne ou par la collecte.",
    });
    const document = await getFloorDocument(t, floorId);
    expect(document.devices.map((item) => item.id)).toEqual(["device:placed"]);
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
      error: "Cet équipement est déjà sur le plan.",
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
      error: "Cet équipement appartient à un autre site.",
    });
    expect(unknown).toMatchObject({
      status: "rejected",
      error: "Cet équipement n'existe plus.",
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
