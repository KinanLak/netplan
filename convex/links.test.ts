import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

const meta = () => ({
  opId: `op:links:${counter}`,
  clientId: "client:links",
  clientSeq: counter,
  createdAt: counter,
});

async function setupFloorWithDevices(t: ReturnType<typeof convexTest>) {
  counter += 1;
  const buildingId = await t.mutation(api.buildings.create, {
    objectId: `building:links:${counter}`,
    name: "Test",
  });
  const floorId = await t.mutation(api.floors.create, {
    objectId: `floor:links:${counter}`,
    buildingId,
    name: "Floor",
  });
  const a = `device:links:${counter}:a`;
  const b = `device:links:${counter}:b`;
  const c = `device:links:${counter}:c`;
  counter += 1;
  await t.mutation(api.mapOperations.apply, {
    operation: {
      kind: "batch",
      meta: meta(),
      operations: [
        {
          kind: "device.create",
          meta: meta(),
          device: {
            id: a,
            floorId,
            type: "pc",
            name: "A",
            position: { x: 0, y: 0 },
            size: { width: 80, height: 80 },
            metadata: {},
          },
        },
        {
          kind: "device.create",
          meta: meta(),
          device: {
            id: b,
            floorId,
            type: "switch",
            name: "B",
            position: { x: 200, y: 0 },
            size: { width: 200, height: 60 },
            metadata: {},
          },
        },
        {
          kind: "device.create",
          meta: meta(),
          device: {
            id: c,
            floorId,
            type: "pc",
            name: "C",
            position: { x: 0, y: 200 },
            size: { width: 80, height: 80 },
            metadata: {},
          },
        },
      ],
    },
  });
  return { floorId, a, b, c };
}

const createLink = async (
  t: ReturnType<typeof convexTest>,
  floorId: string,
  id: string,
  fromDeviceId: string,
  toDeviceId: string,
  label?: string,
) => {
  counter += 1;
  await t.mutation(api.mapOperations.apply, {
    operation: {
      kind: "link.create",
      meta: meta(),
      link: { id, floorId, fromDeviceId, toDeviceId, label },
    },
  });
};

describe("links", () => {
  it("listForDevice returns both incoming and outgoing edges", async () => {
    const t = convexTest(schema, modules);
    const { floorId, a, b, c } = await setupFloorWithDevices(t);
    await createLink(t, floorId, "link:ab", a, b);
    await createLink(t, floorId, "link:cb", c, b);

    const forB = await t.query(api.links.listForDevice, { deviceId: b });
    expect(forB).toHaveLength(2);
    const forA = await t.query(api.links.listForDevice, { deviceId: a });
    expect(forA).toHaveLength(1);
  });

  it("listForFloor returns links scoped to a floor", async () => {
    const t = convexTest(schema, modules);
    const { floorId, a, b } = await setupFloorWithDevices(t);
    await createLink(t, floorId, "link:floor", a, b, "uplink");

    const list = await t.query(api.links.listForFloor, { floorId });
    expect(list[0]?.label).toBe("uplink");
    expect(list[0]?.id).toBe("link:floor");
  });

  it("reflects link deletion applied through mapOperations", async () => {
    const t = convexTest(schema, modules);
    const { floorId, a, b } = await setupFloorWithDevices(t);
    await createLink(t, floorId, "link:remove", a, b);
    counter += 1;

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "link.delete",
        meta: meta(),
        linkId: "link:remove",
      },
    });

    const list = await t.query(api.links.listForFloor, { floorId });
    expect(list).toHaveLength(0);
  });
});
