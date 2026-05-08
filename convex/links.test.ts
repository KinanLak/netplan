import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

async function setupFloorWithDevices(t: ReturnType<typeof convexTest>) {
  const buildingId = await t.mutation(api.buildings.create, { name: "Test" });
  const floors = await t.query(api.floors.listForBuilding, { buildingId });
  const floorId = floors[0]._id;
  const a = await t.mutation(api.devices.create, {
    floorId,
    type: "pc",
    name: "A",
    position: { x: 0, y: 0 },
    size: { width: 80, height: 80 },
    metadata: {},
  });
  const b = await t.mutation(api.devices.create, {
    floorId,
    type: "switch",
    name: "B",
    position: { x: 200, y: 0 },
    size: { width: 200, height: 60 },
    metadata: {},
  });
  const c = await t.mutation(api.devices.create, {
    floorId,
    type: "pc",
    name: "C",
    position: { x: 0, y: 200 },
    size: { width: 80, height: 80 },
    metadata: {},
  });
  return { floorId, a, b, c };
}

describe("links", () => {
  it("listForDevice returns both incoming and outgoing edges", async () => {
    const t = convexTest(schema, modules);
    const { floorId, a, b, c } = await setupFloorWithDevices(t);
    await t.mutation(api.links.create, {
      floorId,
      fromDeviceId: a,
      toDeviceId: b,
    });
    await t.mutation(api.links.create, {
      floorId,
      fromDeviceId: c,
      toDeviceId: b,
    });

    const forB = await t.query(api.links.listForDevice, { deviceId: b });
    expect(forB).toHaveLength(2);
    const forA = await t.query(api.links.listForDevice, { deviceId: a });
    expect(forA).toHaveLength(1);
  });

  it("listForFloor returns links scoped to a floor", async () => {
    const t = convexTest(schema, modules);
    const { floorId, a, b } = await setupFloorWithDevices(t);
    await t.mutation(api.links.create, {
      floorId,
      fromDeviceId: a,
      toDeviceId: b,
      label: "uplink",
    });
    const list = await t.query(api.links.listForFloor, { floorId });
    expect(list[0]?.label).toBe("uplink");
  });

  it("remove deletes a single link", async () => {
    const t = convexTest(schema, modules);
    const { floorId, a, b } = await setupFloorWithDevices(t);
    const id = await t.mutation(api.links.create, {
      floorId,
      fromDeviceId: a,
      toDeviceId: b,
    });
    await t.mutation(api.links.remove, { id });
    const list = await t.query(api.links.listForFloor, { floorId });
    expect(list).toHaveLength(0);
  });
});
