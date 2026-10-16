import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { createSignedInUser, testBackend } from "./_test/auth.setup";
import type { TestBackend } from "./_test/auth.setup";
import { RETENTION_MS } from "./history";

const DAY = 24 * 60 * 60_000;

const addEvents = async (
  t: TestBackend,
  events: Array<{ deviceId: string; at: number; siteId?: string }>,
) =>
  await t.run(async (ctx) => {
    for (const { deviceId, at, siteId = "site:a" } of events) {
      await ctx.db.insert("deviceEvents", {
        siteId,
        deviceId,
        deviceName: deviceId,
        at,
        kind: "online",
      });
    }
  });

const page = { numItems: 2, cursor: null };

describe("history", () => {
  it("is refused to a Lecteur and read by an Éditeur, newest first, a page at a time", async () => {
    const t = testBackend();
    const now = Date.now();
    await addEvents(t, [
      { deviceId: "device:pc", at: now - 3_000 },
      { deviceId: "device:pc", at: now - 2_000 },
      { deviceId: "device:pc", at: now - 1_000 },
      { deviceId: "device:other", at: now, siteId: "site:b" },
    ]);
    const reader = t.withIdentity(
      (await createSignedInUser(t, "reader")).identity,
    );
    const refusal = await reader
      .query(api.history.forDevice, {
        deviceId: "device:pc",
        paginationOpts: page,
      })
      .then(
        () => "ok",
        (error: unknown) =>
          error instanceof ConvexError
            ? (error.data as { code?: string }).code
            : error,
      );
    expect(refusal).toBe("forbidden");

    const editor = t.withIdentity(
      (await createSignedInUser(t, "editor")).identity,
    );
    const first = await editor.query(api.history.forDevice, {
      deviceId: "device:pc",
      paginationOpts: page,
    });
    expect(first.page.map(({ at }) => now - at)).toEqual([1_000, 2_000]);
    const second = await editor.query(api.history.forDevice, {
      deviceId: "device:pc",
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page.map(({ at }) => now - at)).toEqual([3_000]);
    expect(second.isDone).toBe(true);

    // A site's history holds only its own devices.
    const site = await editor.query(api.history.forSite, {
      siteId: "site:b",
      paginationOpts: page,
    });
    expect(site.page.map(({ deviceId }) => deviceId)).toEqual(["device:other"]);
  });

  it("forgets what is older than 30 days, a batch at a time", async () => {
    const t = testBackend();
    const now = Date.now();
    const old = Array.from({ length: 1_201 }, (_, n) => ({
      deviceId: `device:${n % 7}`,
      at: now - RETENTION_MS - DAY - n,
    }));
    await addEvents(t, [
      ...old,
      { deviceId: "device:kept", at: now - RETENTION_MS + DAY },
    ]);
    await t.mutation(internal.history.purge, {});
    await t.finishAllScheduledFunctions(() => {});
    const left = await t.run(
      async (ctx) => await ctx.db.query("deviceEvents").collect(),
    );
    expect(left.map(({ deviceId }) => deviceId)).toEqual(["device:kept"]);

    // Running it again changes nothing.
    await t.mutation(internal.history.purge, {});
    await t.finishAllScheduledFunctions(() => {});
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query("deviceEvents").collect()).length,
      ),
    ).toBe(1);
  });
});
