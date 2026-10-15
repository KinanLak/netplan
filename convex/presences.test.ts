import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { api } from "./_generated/api";
import {
  createSignedInUser,
  ensureDefaultSite,
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
  const siteId = await ensureDefaultSite(editor);
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
    });
    await bob.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:bob",
      floorId: floorB,
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

  it("keeps one row per page and lists a user once across tabs", async () => {
    const t = testBackend();
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);
    const alice = await signedIn(t);

    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:tab-1",
      floorId: floorA,
    });
    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:tab-1",
      floorId: floorA,
    });
    setSystemTime(Date.now() + 1_000);
    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:tab-2",
      floorId: floorB,
    });

    expect(await rows(t)).toHaveLength(2);
    const presences = await alice.client.query(api.presences.list, {});
    expect(presences).toHaveLength(1);
    expect(presences[0]?.clientId).toBe("client:tab-2");
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
          updatedAt: 0,
        });
      }
    });

    await alice.client.mutation(api.presences.updateOnlineUser, {
      clientId: "client:alice-open",
      floorId,
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
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("Floor not found");
  });
});
