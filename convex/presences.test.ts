import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { api } from "./_generated/api";
import {
  createSignedInUser,
  createTestSite,
  testBackend,
} from "./_test/auth.setup";
import type { TestBackend } from "./_test/auth.setup";
import type { Role } from "./lib/roles";
import { colorHueFor } from "./lib/presence";

let counter = 0;

async function signedIn(t: TestBackend, role: Role = "reader") {
  const user = await createSignedInUser(t, role);
  return { ...user, client: t.withIdentity(user.identity) };
}

async function freshFloor(t: TestBackend) {
  counter += 1;
  const { client: editor } = await signedIn(t, "admin");
  const siteId = await createTestSite(editor);
  const buildingId = await editor.mutation(api.buildings.create, {
    siteId,
    objectId: `building:presence:${counter}`,
    name: "B",
  });
  return await editor.mutation(api.floors.create, {
    objectId: `floor:presence:${counter}`,
    buildingId,
    name: "Floor",
  });
}

const rows = (t: TestBackend) =>
  t.run((ctx) => ctx.db.query("presences").collect());

afterEach(() => {
  setSystemTime();
});

describe("presences", () => {
  it("shows each signed-in user under their own name and colour", async () => {
    const t = testBackend();
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);
    const alice = await signedIn(t);
    const bob = await signedIn(t, "editor");

    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:alice",
      floorId: floorA,
      active: false,
    });
    await bob.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:bob",
      floorId: floorB,
      active: false,
    });

    const byUser = new Map(
      (await alice.client.query(api.presences.list, {})).map((p) => [
        p.userId,
        p,
      ]),
    );
    expect(byUser.size).toBe(2);
    expect(byUser.get(alice.userId)).toMatchObject({
      displayName: alice.name,
      colorHue: colorHueFor(alice.userId),
      floorId: floorA,
    });
    expect(byUser.get(bob.userId)?.displayName).toBe(bob.name);
    expect(byUser.get(bob.userId)?.floorId).toBe(floorB);
  });

  it("keeps one row per page and lists every open page", async () => {
    const t = testBackend();
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);
    const alice = await signedIn(t);

    for (const [clientId, floorId] of [
      ["client:tab-1", floorA],
      ["client:tab-1", floorA],
      ["client:tab-2", floorB],
    ]) {
      await alice.client.mutation(api.presences.updateOnlineUser, {
        clientId,
        floorId,
        active: false,
      });
    }

    expect(await rows(t)).toHaveLength(2);
    const presences = await alice.client.query(api.presences.list, {});
    expect(presences.map((p) => p.clientId).toSorted()).toEqual([
      "client:tab-1",
      "client:tab-2",
    ]);
  });

  it("marks a page active when it arrives, changes floor or is brought back, not at each heartbeat", async () => {
    const t = testBackend();
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);
    const alice = await signedIn(t);
    const start = Date.now();
    const beat = async (at: number, floorId: string, active: boolean) => {
      setSystemTime(start + at);
      await alice.client.mutation(api.presences.updateOnlineUser, {
        clientId: "client:tab",
        floorId,
        active,
      });
      const [row] = await rows(t);
      return { activeAt: row.activeAt, updatedAt: row.updatedAt };
    };

    expect(await beat(0, floorA, false)).toEqual({
      activeAt: start,
      updatedAt: start,
    });
    expect(await beat(2_000, floorA, false)).toEqual({
      activeAt: start,
      updatedAt: start + 2_000,
    });
    expect((await beat(4_000, floorA, true)).activeAt).toBe(start + 4_000);
    expect((await beat(6_000, floorB, false)).activeAt).toBe(start + 6_000);
  });

  it("clears a user's abandoned pages at their next heartbeat, not others'", async () => {
    const t = testBackend();
    const floorId = await freshFloor(t);
    const alice = await signedIn(t);
    const bob = await signedIn(t);
    await t.run(async (ctx) => {
      for (const [userId, clientId] of [
        [alice.userId, "client:alice-closed"],
        [bob.userId, "client:bob-closed"],
      ]) {
        await ctx.db.insert("presences", {
          clientId,
          userId,
          displayName: "Old",
          floorId,
          activeAt: 0,
          updatedAt: 0,
        });
      }
    });

    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:alice-open",
      floorId,
      active: false,
    });

    expect((await rows(t)).map((p) => p.clientId).toSorted()).toEqual([
      "client:alice-open",
      "client:bob-closed",
    ]);
  });

  it("removes only the caller's own page", async () => {
    const t = testBackend();
    const floorId = await freshFloor(t);
    const alice = await signedIn(t);
    const bob = await signedIn(t);

    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:alice",
      floorId,
      active: false,
    });
    await bob.client.mutation(api.presences.remove, {
      clientId: "client:alice",
    });
    expect(await rows(t)).toHaveLength(1);

    await alice.client.mutation(api.presences.remove, {
      clientId: "client:alice",
    });
    expect(await rows(t)).toHaveLength(0);
  });

  it("rejects unknown floors", async () => {
    const t = testBackend();
    const alice = await signedIn(t);

    let message = "";
    try {
      await alice.client.mutation(api.presences.updateOnlineUser, {
        clientId: "client:alice",
        floorId: "floor:missing",
        active: false,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("Floor not found");
  });
});
