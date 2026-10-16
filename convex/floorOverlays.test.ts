import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  createSignedInUser,
  createTestSite,
  testBackend,
} from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

let counter = 0;

const meta = (seq: number) => ({
  opId: `op:overlay:${counter}:${seq}`,
  clientId: "client:test",
  clientSeq: seq,
  createdAt: seq,
});

const png = (width: number, height: number): ArrayBuffer => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes.buffer;
};

async function setup() {
  counter += 1;
  const t = testBackend();
  const editor = t.withIdentity(
    (await createSignedInUser(t, "editor")).identity,
  );
  const reader = t.withIdentity(
    (await createSignedInUser(t, "reader")).identity,
  );
  const siteId = await createTestSite(editor);
  const buildingId = await editor.mutation(api.buildings.create, {
    siteId,
    objectId: `building:overlay:${counter}`,
    name: "Calque",
  });
  const floorId = await editor.mutation(api.floors.create, {
    objectId: `floor:overlay:${counter}`,
    buildingId,
    name: "RDC",
  });
  return { t, editor, reader, floorId };
}

const placement = (floorId: string, fileId: string) => ({
  floorId,
  fileId,
  imageWidth: 1200,
  imageHeight: 800,
  center: { x: 500, y: 400 },
  scale: 0.5,
  rotation: 0,
  opacity: 0.6,
  locked: false,
});

const fileRow = (t: TestClient, fileId: string) =>
  t.run((ctx) =>
    ctx.db
      .query("floorOverlayFiles")
      .withIndex("by_object_id", (q) => q.eq("objectId", fileId))
      .unique(),
  );

const errorCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConvexError)
      return (error.data as { code: string }).code;
    throw error;
  }
  return null;
};

describe("calque files", () => {
  it("stores a checked image and hands its URL to any signed-in user", async () => {
    const { editor, reader } = await setup();
    const file = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "  plan-rdc.pdf  ",
    });
    expect(file).toMatchObject({ width: 1200, height: 800 });

    const image = await reader.query(api.floorOverlays.imageUrl, {
      fileId: file.fileId,
    });
    expect(image?.name).toBe("plan-rdc.pdf");
    expect(image?.url).toBeString();
    expect((await fileRow(editor, file.fileId))?.contentType).toBe("image/png");
  });

  it("refuses readers, non-images and oversized images", async () => {
    const { editor, reader } = await setup();
    expect(
      await errorCode(
        reader.action(api.floorOverlays.upload, {
          bytes: png(10, 10),
          name: "x",
        }),
      ),
    ).toBe("forbidden");

    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(
      await errorCode(
        editor.action(api.floorOverlays.upload, {
          bytes: svg.buffer,
          name: "evil.svg",
        }),
      ),
    ).toBe("overlay-file-not-image");
    expect(
      await errorCode(
        editor.action(api.floorOverlays.upload, {
          bytes: png(20_000, 100),
          name: "huge.png",
        }),
      ),
    ).toBe("overlay-image-too-large");
  });
});

describe("calque operations", () => {
  it("places, locks and removes a calque, releasing its file", async () => {
    const { editor, reader, floorId } = await setup();
    const { fileId } = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "plan.png",
    });
    expect((await fileRow(editor, fileId))?.releasedAt).toBeNumber();

    const placed = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(1),
        floorId,
        overlay: placement(floorId, fileId),
      },
    });
    expect(placed.status).toBe("applied");
    expect(
      await reader.query(api.mapDocument.getFloorOverlay, { floorId }),
    ).toEqual(placement(floorId, fileId));
    expect((await fileRow(editor, fileId))?.releasedAt).toBeUndefined();

    await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.patch",
        meta: meta(2),
        floorId,
        patch: { locked: true },
      },
    });
    const moved = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.patch",
        meta: meta(3),
        floorId,
        patch: { center: { x: 0, y: 0 } },
      },
    });
    expect(moved).toMatchObject({
      status: "rejected",
      error: "Le calque est verrouillé.",
    });
    const faded = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.patch",
        meta: meta(4),
        floorId,
        patch: { opacity: 0.2 },
      },
    });
    expect(faded.status).toBe("applied");
    const removedWhileLocked = await editor.mutation(api.mapOperations.apply, {
      operation: { kind: "overlay.set", meta: meta(5), floorId, overlay: null },
    });
    expect(removedWhileLocked.error).toBe("Le calque est verrouillé.");

    const removed = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(6),
        operations: [
          { kind: "overlay.patch", floorId, patch: { locked: false } },
          { kind: "overlay.set", floorId, overlay: null },
        ],
      },
    });
    expect(removed.status).toBe("applied");
    expect(
      await reader.query(api.mapDocument.getFloorOverlay, { floorId }),
    ).toBeNull();
    expect((await fileRow(editor, fileId))?.releasedAt).toBeNumber();
  });

  it("does not rewrite the calque for a patch that changes nothing", async () => {
    const { editor, floorId } = await setup();
    const { fileId } = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "plan.png",
    });
    await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(1),
        floorId,
        overlay: placement(floorId, fileId),
      },
    });
    const row = () =>
      editor.run((ctx) => ctx.db.query("floorOverlays").first());
    const before = await row();
    const result = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.patch",
        meta: meta(2),
        floorId,
        patch: { opacity: 0.6 },
      },
    });
    expect(result.status).toBe("applied");
    expect(await row()).toEqual(before);
  });

  it("refuses a calque whose file is unknown or of another size", async () => {
    const { editor, floorId } = await setup();
    const { fileId } = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "plan.png",
    });

    const unknown = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(1),
        floorId,
        overlay: placement(floorId, "overlay-file:missing"),
      },
    });
    expect(unknown.error).toBe("L'image du calque n'existe plus.");

    const resized = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(2),
        floorId,
        overlay: { ...placement(floorId, fileId), imageWidth: 600 },
      },
    });
    expect(resized.error).toBe(
      "La taille du calque ne correspond pas à son image.",
    );

    const invalid = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(3),
        floorId,
        overlay: { ...placement(floorId, fileId), opacity: 0 },
      },
    });
    expect(invalid.error).toBe("Le placement du calque est invalide.");

    const otherFloor = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(4),
        floorId,
        overlay: placement("floor:elsewhere", fileId),
      },
    });
    expect(otherFloor.error).toBe("Ce calque appartient à un autre étage.");
  });

  it("keeps one row per floor when a batch replaces the calque twice", async () => {
    const { editor, floorId } = await setup();
    const first = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "a.png",
    });
    const second = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "b.png",
    });
    const result = await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "batch",
        meta: meta(1),
        operations: [
          {
            kind: "overlay.set",
            floorId,
            overlay: placement(floorId, first.fileId),
          },
          {
            kind: "overlay.set",
            floorId,
            overlay: placement(floorId, second.fileId),
          },
          { kind: "overlay.patch", floorId, patch: { rotation: 90 } },
        ],
      },
    });
    expect(result.status).toBe("applied");
    const rows = await editor.run((ctx) =>
      ctx.db.query("floorOverlays").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ fileId: second.fileId, rotation: 90 });
    expect((await fileRow(editor, first.fileId))?.releasedAt).toBeNumber();
    expect((await fileRow(editor, second.fileId))?.releasedAt).toBeUndefined();
  });

  it("releases a removed calque's file and deletes files unused for a week", async () => {
    const { editor, floorId } = await setup();
    const { fileId } = await editor.action(api.floorOverlays.upload, {
      bytes: png(1200, 800),
      name: "plan.png",
    });
    const unused = await editor.action(api.floorOverlays.upload, {
      bytes: png(10, 10),
      name: "fresh.png",
    });
    await editor.mutation(api.mapOperations.apply, {
      operation: {
        kind: "overlay.set",
        meta: meta(1),
        floorId,
        overlay: placement(floorId, fileId),
      },
    });

    // The calque holds the floor until it is taken off.
    await expect(
      editor.mutation(api.floors.remove, { id: floorId }),
    ).rejects.toThrow("porte encore un calque");
    await editor.mutation(api.mapOperations.apply, {
      operation: { kind: "overlay.set", meta: meta(2), floorId, overlay: null },
    });
    await editor.mutation(api.floors.remove, { id: floorId });
    expect(
      await editor.run((ctx) => ctx.db.query("floorOverlays").collect()),
    ).toHaveLength(0);
    const released = await fileRow(editor, fileId);
    expect(released?.releasedAt).toBeNumber();

    const weekAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await editor.run(async (ctx) => {
      if (released) await ctx.db.patch(released._id, { releasedAt: weekAgo });
    });
    await editor.mutation(internal.floorOverlays.deleteReleasedFiles, {});

    expect(await fileRow(editor, fileId)).toBeNull();
    expect(
      await editor.run((ctx) => ctx.storage.getUrl(released!.storageId)),
    ).toBeNull();
    // Released less than a week ago: kept for undo.
    expect(await fileRow(editor, unused.fileId)).not.toBeNull();
  });
});
