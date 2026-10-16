import { afterEach, describe, expect, it } from "bun:test";
import { api, internal } from "./_generated/api";
import { buildDemoFloors } from "../src/dev-seed/demoMap";
import { defaultPorts } from "../src/devices/ports";
import { signedInTest } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

afterEach(() => {
  delete process.env.ALLOW_DEV_SEED;
});

const countFloor = async (t: TestClient, floorId: string) => {
  const [devices, walls, ports, cables] = await Promise.all([
    t.query(api.mapDocument.getFloorDevices, { floorId }),
    t.query(api.mapDocument.getFloorWalls, { floorId }),
    t.query(api.mapDocument.getFloorPorts, { floorId }),
    t.query(api.mapDocument.getFloorCables, { floorId }),
  ]);
  return {
    devices: devices.length,
    walls: walls.length,
    ports: ports.length,
    cables: cables.length,
  };
};

describe("dev seed", () => {
  it("refuses to run unless ALLOW_DEV_SEED is true", async () => {
    const t = await signedInTest();
    process.env.ALLOW_DEV_SEED = "1";
    await expect(t.mutation(internal.dev.seed, {})).rejects.toThrow(
      /ALLOW_DEV_SEED/,
    );
    expect(await t.query(api.sites.list, {})).toEqual([]);
  });

  it("loads a demo site whose map passes server validation", async () => {
    const t = await signedInTest();
    process.env.ALLOW_DEV_SEED = "true";
    const { buildingId, floorIds } = await t.mutation(internal.dev.seed, {});

    const sites = await t.query(api.sites.list, {});
    expect(sites.map((site) => [site.id, site.name])).toEqual([
      ["site:demo", "Site de démonstration"],
    ]);
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    expect(floors.map((floor) => floor.id).sort()).toEqual(
      [...floorIds].sort(),
    );

    for (const floor of buildDemoFloors()) {
      // The demo cables stay on their floor, so each counts once there.
      const expected = { devices: 0, walls: 0, ports: 0, cables: 0 };
      for (const operation of floor.operations) {
        if (operation.kind === "device.create") {
          expected.devices += 1;
          expected.ports += (
            operation.ports ??
            defaultPorts(operation.device.id, operation.device.type)
          ).length;
          expected.cables += operation.cables?.length ?? 0;
        }
        if (operation.kind === "walls.add") {
          expected.walls += operation.walls.length;
        }
      }
      expect(await countFloor(t, floor.id)).toEqual(expected);

      // The demo stands in for a cycle, so its statuses stay.
      const statusOf = (
        devices: ReadonlyArray<{ id: string; metadata: { status?: string } }>,
      ) =>
        Object.fromEntries(
          devices.map((device) => [device.id, device.metadata.status]),
        );
      expect(
        statusOf(
          await t.query(api.mapDocument.getFloorDevices, { floorId: floor.id }),
        ),
      ).toEqual(
        statusOf(
          floor.operations.flatMap((operation) =>
            operation.kind === "device.create" ? [operation.device] : [],
          ),
        ),
      );
    }
  });

  it("changes nothing when run again", async () => {
    const t = await signedInTest();
    process.env.ALLOW_DEV_SEED = "true";
    const { floorIds } = await t.mutation(internal.dev.seed, {});
    const before = await Promise.all(floorIds.map((id) => countFloor(t, id)));
    const revisionsBefore = await Promise.all(
      floorIds.map((floorId) =>
        t.query(api.mapDocument.getFloorRevision, { floorId }),
      ),
    );

    await t.mutation(internal.dev.seed, {});

    expect(await Promise.all(floorIds.map((id) => countFloor(t, id)))).toEqual(
      before,
    );
    expect(
      await Promise.all(
        floorIds.map((floorId) =>
          t.query(api.mapDocument.getFloorRevision, { floorId }),
        ),
      ),
    ).toEqual(revisionsBefore);
    expect(await t.query(api.sites.list, {})).toHaveLength(1);
  });

  it("draws a cleared map again and keeps a changed demo site", async () => {
    const t = await signedInTest();
    process.env.ALLOW_DEV_SEED = "true";
    const { floorIds } = await t.mutation(internal.dev.seed, {});
    const seeded = await Promise.all(floorIds.map((id) => countFloor(t, id)));
    await t.mutation(api.buildings.clearMap, { siteId: "site:demo" });
    await t.run(async (ctx) => {
      const site = await ctx.db
        .query("sites")
        .withIndex("by_object_id", (q) => q.eq("objectId", "site:demo"))
        .unique();
      if (site) await ctx.db.patch(site._id, { name: "Démo modifiée" });
    });

    await t.mutation(internal.dev.seed, {});

    expect(await Promise.all(floorIds.map((id) => countFloor(t, id)))).toEqual(
      seeded,
    );
    const sites = await t.query(api.sites.list, {});
    expect(sites.map((site) => [site.id, site.name])).toEqual([
      ["site:demo", "Démo modifiée"],
    ]);
  });
});
