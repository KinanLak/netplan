import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

let counter = 0;

const meta = () => {
  counter += 1;
  return {
    opId: `op:labels:${counter}`,
    clientId: "client:labels",
    clientSeq: counter,
    createdAt: counter,
  };
};

async function floor(t: TestClient) {
  counter += 1;
  const siteId = await createTestSite(t);
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
    objectId: `building:labels:${counter}`,
    name: `Labels ${counter}`,
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:labels:${counter}`,
    buildingId,
    name: "RDC",
  });
}

const apply = (t: TestClient, operation: object) =>
  t.mutation(api.mapOperations.apply, {
    // The validator checks the shape; each test builds a valid one.
    operation: { meta: meta(), ...operation } as never,
  });

const labelsOf = (t: TestClient, floorId: string) =>
  t.query(api.mapDocument.getFloorLabels, { floorId });

describe("free text labels", () => {
  it("are created, renamed, moved and deleted through map operations", async () => {
    const t = await signedInTest();
    const floorId = await floor(t);
    const label = {
      id: "label:a",
      floorId,
      text: "Salle de réunion",
      position: { x: 100, y: 40 },
    };

    expect(await apply(t, { kind: "label.create", label })).toMatchObject({
      status: "applied",
    });
    expect(await labelsOf(t, floorId)).toEqual([label]);

    await apply(t, {
      kind: "label.patch",
      labelId: "label:a",
      patch: { text: "Salle Rhône", position: { x: 120, y: 60 } },
    });
    expect(await labelsOf(t, floorId)).toEqual([
      { ...label, text: "Salle Rhône", position: { x: 120, y: 60 } },
    ]);

    await apply(t, { kind: "label.delete", labelId: "label:a" });
    expect(await labelsOf(t, floorId)).toEqual([]);
  });

  it("refuses an empty, an unnormalised or a too long text", async () => {
    const t = await signedInTest();
    const floorId = await floor(t);
    const create = (text: string) =>
      apply(t, {
        kind: "label.create",
        label: {
          id: `label:${text.length}`,
          floorId,
          text,
          position: { x: 0, y: 0 },
        },
      });
    expect((await create("   ")).status).toBe("rejected");
    expect((await create("  Accueil ")).status).toBe("rejected");
    expect((await create("x".repeat(81))).status).toBe("rejected");
    expect(await labelsOf(t, floorId)).toEqual([]);
  });

  it("refuses an undo of a label someone has changed since", async () => {
    const t = await signedInTest();
    const floorId = await floor(t);
    await apply(t, {
      kind: "label.create",
      label: {
        id: "label:b",
        floorId,
        text: "Archives",
        position: { x: 0, y: 0 },
      },
    });
    await apply(t, {
      kind: "label.patch",
      labelId: "label:b",
      patch: { text: "Stock" },
    });
    // An undo of a rename to « Réserve » that never happened here.
    const undo = await apply(t, {
      kind: "label.patch",
      labelId: "label:b",
      patch: { text: "Archives" },
      expected: { text: "Réserve" },
    });
    expect(undo.status).toBe("rejected");
    expect((await labelsOf(t, floorId))[0]?.text).toBe("Stock");
  });

  it("go with their floor, which they do not keep from being deleted", async () => {
    const t = await signedInTest();
    const floorId = await floor(t);
    await apply(t, {
      kind: "label.create",
      label: { id: "label:c", floorId, text: "Hall", position: { x: 0, y: 0 } },
    });
    await t.mutation(api.floors.remove, { id: floorId });
    expect(await t.run((ctx) => ctx.db.query("mapLabels").collect())).toEqual(
      [],
    );
  });
});
