// Development data. Every function here refuses to run unless the deployment
// sets ALLOW_DEV_SEED=true, which `bun run dev:agent` and the CI end-to-end
// job do and no real installation does (ADR 0018).
import { ConvexError, v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { applyMapOperation } from "./mapOperations";
import { placeNamer } from "./history";
import { insertSite } from "./sites";
import { seedConnection } from "./integrations";
import { createAuth } from "./auth";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev-seed/accounts";
import { DEMO_BUILDING, buildDemoFloors } from "../src/dev-seed/demoMap";
import { INTEGRATION_KINDS } from "../src/sites/integrations";
import { siteDay, slotAt } from "../src/sites/snapshots";
import type { BatchSubOperation } from "../src/map-engine/types";

const SEED_CLIENT_ID = "dev-seed";

const DEMO_SITE = {
  objectId: "site:demo",
  name: "Site de démonstration",
  timezone: "Europe/Paris",
};

export const assertSeedable = () => {
  if (process.env.ALLOW_DEV_SEED !== "true") {
    throw new ConvexError(
      "Seeding is disabled: ALLOW_DEV_SEED is not true on this deployment",
    );
  }
};

// An existing demo site is kept as it is, so a user's change to it does not
// make every later start fail.
const ensureSite = async (ctx: MutationCtx): Promise<string> => {
  const existing = await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", DEMO_SITE.objectId))
    .unique();
  return existing ? existing.objectId : await insertSite(ctx, DEMO_SITE);
};

const ensureBuilding = async (ctx: MutationCtx, siteId: string) => {
  const existing = await ctx.db
    .query("buildings")
    .withIndex("by_object_id", (q) => q.eq("objectId", DEMO_BUILDING.id))
    .unique();
  if (existing) return;
  await ctx.db.insert("buildings", {
    objectId: DEMO_BUILDING.id,
    siteId,
    name: DEMO_BUILDING.name,
    order: 0,
  });
};

const ensureFloor = async (
  ctx: MutationCtx,
  floor: { id: string; name: string; order: number },
) => {
  const existing = await ctx.db
    .query("floors")
    .withIndex("by_object_id", (q) => q.eq("objectId", floor.id))
    .unique();
  if (existing) return;
  await ctx.db.insert("floors", {
    objectId: floor.id,
    buildingId: DEMO_BUILDING.id,
    name: floor.name,
    order: floor.order,
  });
};

const floorIsEmpty = async (ctx: MutationCtx, floorId: string) => {
  const [device, wall] = await Promise.all([
    ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .first(),
    ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .first(),
  ]);
  return !device && !wall;
};

const lastSeedSeq = async (ctx: MutationCtx) => {
  const last = await ctx.db
    .query("clientOperations")
    .withIndex("by_client_seq", (q) => q.eq("clientId", SEED_CLIENT_ID))
    .order("desc")
    .first();
  return last?.clientSeq ?? 0;
};

/**
 * Writes what the demo's devices and ports observed. A device or port enters
 * the inventory with only what a fresh switch read vouches for (ADR 0025),
 * and the demo stands in for cycles that never ran.
 */
const writeSeededFacts = async (
  ctx: MutationCtx,
  operations: ReadonlyArray<BatchSubOperation>,
) => {
  for (const operation of operations) {
    if (operation.kind !== "device.create") continue;
    const row = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", operation.device.id))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { metadata: operation.device.metadata });
    }
    for (const port of operation.ports ?? []) {
      const portRow = await ctx.db
        .query("ports")
        .withIndex("by_object_id", (q) => q.eq("objectId", port.id))
        .unique();
      if (portRow) {
        await ctx.db.patch(portRow._id, {
          status: port.status,
          seen: port.seen,
        });
      }
    }
  }
};

/**
 * Loads the demo site, building and map, filling only what is missing: a
 * floor is drawn while it is empty, so a cleared map comes back and a user's
 * edits stay. A change to the demo data reaches an existing backend through
 * `dev:agent --reseed`. The map goes through `applyMapOperation`, so it obeys
 * the same rules as a user's edits.
 */
export const seed = internalMutation({
  args: {},
  returns: v.object({ buildingId: v.string(), floorIds: v.array(v.string()) }),
  handler: async (ctx) => {
    assertSeedable();
    const siteId = await ensureSite(ctx);
    await ensureBuilding(ctx, siteId);
    const floors = buildDemoFloors();
    // Operation ids are never reused, or a cleared floor's batch would be
    // answered from the record of the first seed and draw nothing.
    let seq = await lastSeedSeq(ctx);
    for (const floor of floors) {
      await ensureFloor(ctx, floor);
      if (!(await floorIsEmpty(ctx, floor.id))) continue;
      seq += 1;
      const result = await applyMapOperation(ctx, {
        kind: "batch",
        meta: {
          opId: `${SEED_CLIENT_ID}:${seq}`,
          clientId: SEED_CLIENT_ID,
          clientSeq: seq,
          createdAt: Date.now(),
        },
        operations: floor.operations,
      });
      if (result.status === "rejected") {
        throw new ConvexError(
          `The seed of ${floor.id} was rejected: ${result.error ?? "unknown error"}`,
        );
      }
      await writeSeededFacts(ctx, floor.operations);
    }
    return {
      buildingId: DEMO_BUILDING.id,
      floorIds: floors.map((floor) => floor.id),
    };
  },
});

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** The instant `time` of `day` shows in `timezone`, a quarter hour at a time. */
const instantOf = (timezone: string, day: string, time: string) => {
  const guess = Date.parse(`${day}T${time}:00Z`);
  for (let quarter = -14 * 4; quarter <= 14 * 4; quarter += 1) {
    const slot = slotAt(timezone, guess + quarter * 15 * 60_000);
    if (slot?.day === day && slot.time === time) return slot.at;
  }
  return null;
};

/**
 * A week of history for the demo's workstations and printers, standing in
 * for collection cycles that never ran: each was seen at one socket, went
 * offline, and came back at the next one; the last three days have
 * snapshots, with yesterday's 16:00 missing. Skipped once the demo site has
 * any history.
 */
export const seedHistory = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    assertSeedable();
    const siteId = DEMO_SITE.objectId;
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    const existing = await ctx.db
      .query("deviceEvents")
      .withIndex("by_site_at", (q) => q.eq("siteId", siteId))
      .first();
    if (!site || existing) return 0;
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    const present = devices.filter(
      ({ type, macs }) => (type === "pc" || type === "endpoint") && macs[0],
    );
    const sockets = devices.filter(({ type }) => type === "wall-port");
    const switchRow = devices.find(({ type }) => type === "switch");
    if (!switchRow || sockets.length < 2) return 0;
    const ports = (
      await ctx.db
        .query("ports")
        .withIndex("by_device", (q) => q.eq("deviceId", switchRow.objectId))
        .collect()
    ).toSorted((a, b) => a.order - b.order);
    const placeOf = placeNamer(ctx);
    if (ports.length === 0) return 0;
    const placeAt = async (n: number) =>
      await placeOf({
        switchId: switchRow.objectId,
        portId: ports[n % ports.length].objectId,
        socketId: sockets[n % sockets.length].objectId,
      });

    const now = Date.now();
    let written = 0;
    for (const [n, device] of present.entries()) {
      const first = await placeAt(n);
      const second = await placeAt(n + present.length);
      const event = {
        siteId,
        deviceId: device.objectId,
        deviceName: device.name,
      };
      const seenAt = now - 6 * DAY + n * HOUR;
      const offAt = now - 3 * DAY + n * HOUR;
      const backAt = now - 2 * DAY + n * HOUR;
      await ctx.db.insert("deviceEvents", {
        ...event,
        at: seenAt,
        kind: "located",
        place: first,
      });
      await ctx.db.insert("deviceEvents", {
        ...event,
        at: seenAt,
        kind: "online",
      });
      await ctx.db.insert("deviceEvents", {
        ...event,
        at: offAt,
        kind: "offline",
        lastSeenAt: offAt - 10 * 60_000,
      });
      await ctx.db.insert("deviceEvents", {
        ...event,
        at: backAt,
        kind: "located",
        place: second,
      });
      await ctx.db.insert("deviceEvents", {
        ...event,
        at: backAt,
        kind: "online",
      });
      written += 5;
    }

    for (const daysAgo of [2, 1, 0]) {
      const day = siteDay(site.timezone, now - daysAgo * DAY);
      for (const time of ["08:00", "12:00", "14:00", "16:00"]) {
        if (daysAgo === 1 && time === "16:00") continue;
        const at = instantOf(site.timezone, day, time);
        if (at === null || at > now) continue;
        const slotId = await ctx.db.insert("historySlots", {
          siteId,
          day,
          time,
          at,
          takenAt: at + 2 * 60_000,
          entries: present.length,
        });
        for (const [n, device] of present.entries()) {
          const place = await placeAt(
            at < now - 2 * DAY ? n : n + present.length,
          );
          await ctx.db.insert("historySlotEntries", {
            slotId,
            siteId,
            slotAt: at,
            mac: device.macs[0] ?? "",
            deviceId: device.objectId,
            deviceName: device.name,
            place,
          });
          written += 1;
        }
      }
    }
    return written;
  },
});

/**
 * Creates one account per role with the shared dev password. An existing
 * account is left as it is, whatever was changed on it since.
 */
export const seedAccounts = internalAction({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    assertSeedable();
    const auth = createAuth(ctx);
    const created: Array<string> = [];
    for (const account of DEV_ACCOUNTS) {
      const existing = await ctx.runQuery(
        components.betterAuth.adapter.findOne,
        { model: "user", where: [{ field: "email", value: account.email }] },
      );
      if (existing) continue;
      await auth.api.createUser({
        body: {
          email: account.email,
          password: DEV_PASSWORD,
          name: account.name,
          role: account.role,
          data: { username: account.username },
        },
      });
      created.push(account.username);
    }
    return created;
  },
});

const seedConnectionArgs = v.optional(
  v.object({ url: v.string(), token: v.string() }),
);

/**
 * Connects the demo site to real tools, for `dev:agent --integrations`,
 * which passes what it read from its own environment. A connection the demo
 * site already has is left as it is.
 */
export const seedIntegrations = internalAction({
  args: { netbox: seedConnectionArgs, librenms: seedConnectionArgs },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    assertSeedable();
    const created: Array<string> = [];
    for (const kind of INTEGRATION_KINDS) {
      const connection = args[kind];
      if (!connection) continue;
      const existing = await ctx.runQuery(internal.integrations.credentials, {
        siteId: DEMO_SITE.objectId,
        kind,
      });
      if (existing) continue;
      await seedConnection(ctx, {
        siteId: DEMO_SITE.objectId,
        kind,
        baseUrl: connection.url,
        token: connection.token,
      });
      created.push(kind);
    }
    return created;
  },
});
