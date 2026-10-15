import { afterEach, describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";
import { buildDemoFloors } from "../src/dev-seed/demoMap";

afterEach(() => {
  delete process.env.ALLOW_DEV_SEED;
});

const countFloor = async (
  t: ReturnType<typeof convexTest>,
  floorId: string,
) => {
  const [devices, walls, links] = await Promise.all([
    t.query(api.mapDocument.getFloorDevices, { floorId }),
    t.query(api.mapDocument.getFloorWalls, { floorId }),
    t.query(api.mapDocument.getFloorLinks, { floorId }),
  ]);
  return { devices: devices.length, walls: walls.length, links: links.length };
};

describe("dev seed", () => {
  it("refuses to run unless ALLOW_DEV_SEED is true", async () => {
    const t = convexTest(schema, modules);
    process.env.ALLOW_DEV_SEED = "1";
    await expect(t.mutation(internal.dev.seed, {})).rejects.toThrow(
      /ALLOW_DEV_SEED/,
    );
    expect(await t.query(api.sites.list, {})).toEqual([]);
  });

  it("loads a disabled demo site whose map passes server validation", async () => {
    const t = convexTest(schema, modules);
    process.env.ALLOW_DEV_SEED = "true";
    const { buildingId, floorIds } = await t.mutation(internal.dev.seed, {});

    const sites = await t.query(api.sites.list, {});
    expect(sites.map((site) => [site.id, site.enabled])).toEqual([
      ["site:demo", false],
    ]);
    expect(sites[0]?.libreNmsDevices).toEqual([]);
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    expect(floors.map((floor) => floor.id).sort()).toEqual(
      [...floorIds].sort(),
    );

    for (const floor of buildDemoFloors()) {
      const expected = { devices: 0, walls: 0, links: 0 };
      for (const operation of floor.operations) {
        if (operation.kind === "device.create") expected.devices += 1;
        if (operation.kind === "walls.add") {
          expected.walls += operation.walls.length;
        }
        if (operation.kind === "link.create") expected.links += 1;
      }
      expect(await countFloor(t, floor.id)).toEqual(expected);
    }
  });

  it("changes nothing when run again", async () => {
    const t = convexTest(schema, modules);
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
});
