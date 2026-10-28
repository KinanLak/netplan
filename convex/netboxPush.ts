// The location push to NetBox (ADR 0027): after each cycle of a site whose
// admin turned it on, one run writes where the network last saw each device
// NetBox brought to that NetBox device's custom fields, one PATCH per device
// whose values are due. Netplan never reads them back.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { placeNamer } from "./history";
import { openConnection } from "./integrations";
import { cycleOf, LEASE_MS } from "./lib/cycles";
import { RetryStopped, SOURCE_RETRY } from "./lib/httpRetry";
import { netboxPatch } from "./lib/netboxApi";
import type { Transport } from "./lib/integrationProbe";
import { pushedValues, pushRun } from "./siteValidators";
import {
  customFields,
  MAX_PUSHES_PER_RUN,
  pushDue,
  pushRetryAt,
  pushValues,
} from "../src/sites/netboxPush";
import type { PushedValues } from "../src/sites/netboxPush";

/** Devices one read of the plan looks at. */
const PLAN_PAGE = 100;

const netboxRow = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("integrations")
    .withIndex("by_site_kind", (q) =>
      q.eq("siteId", siteId).eq("kind", "netbox"),
    )
    .unique();

export const pushEnabled = async (ctx: QueryCtx, siteId: string) => {
  const row = await netboxRow(ctx, siteId);
  if (row?.enabled !== true || row.netbox?.push !== true) return false;
  // An archived site writes nothing anywhere, NetBox included (ADR 0033).
  const site = await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
    .unique();
  return site?.archivedAt === undefined;
};

/** Called as a cycle ends: the push follows it when it is on. */
export const schedulePush = async (ctx: MutationCtx, siteId: string) => {
  if (await pushEnabled(ctx, siteId)) {
    await ctx.scheduler.runAfter(0, internal.sources.pushToNetBox, { siteId });
  }
};

const pushRowOf = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("netboxPushes")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .unique();

/**
 * What the push knew of a site's devices; it forgets them with NetBox. A run
 * still going loses its lease, so nothing it hears back is recorded.
 */
export const deletePushes = async (ctx: MutationCtx, siteId: string) => {
  const rows = await ctx.db
    .query("netboxPushes")
    .withIndex("by_site_retry", (q) => q.eq("siteId", siteId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
  const cycle = await cycleOf(ctx, siteId);
  if (cycle?.pushRunning) {
    await ctx.db.patch(cycle._id, { pushRunning: undefined });
  }
};

/** A device the import removed or unbound: nothing will push to it again. */
export const deletePush = async (ctx: MutationCtx, deviceId: string) => {
  const row = await pushRowOf(ctx, deviceId);
  if (row) await ctx.db.delete(row._id);
};

/**
 * The sighting that says where a device is now: the one seen in the fewest
 * cycles ago, the newest of those. `getFloorDevices` picks it the same way.
 */
const latestSighting = async (ctx: QueryCtx, device: Doc<"devices">) => {
  let latest: Doc<"macSightings"> | null = null;
  for (const mac of device.macs) {
    const row = await ctx.db
      .query("macSightings")
      .withIndex("by_site_mac", (q) =>
        q.eq("siteId", device.siteId).eq("mac", mac),
      )
      .unique();
    if (!row) continue;
    if (
      !latest ||
      row.misses < latest.misses ||
      (row.misses === latest.misses && row.seenAt > latest.seenAt)
    ) {
      latest = row;
    }
  }
  return latest;
};

/** Takes the site's push lease; `null` when a run holds it or push is off. */
export const claim = internalMutation({
  args: { siteId: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { siteId }) => {
    const now = Date.now();
    const cycle = await cycleOf(ctx, siteId);
    if (!cycle || !(await pushEnabled(ctx, siteId))) return null;
    if (cycle.pushRunning && cycle.pushRunning.leaseUntil > now) return null;
    const runId = crypto.randomUUID();
    await ctx.db.patch(cycle._id, {
      pushRunning: { runId, leaseUntil: now + LEASE_MS },
    });
    return runId;
  },
});

const dueDevice = v.object({
  deviceId: v.string(),
  netboxId: v.number(),
  values: pushedValues,
});

/**
 * One page of the site's NetBox devices with the values due to NetBox. A
 * device not seen yet has nothing to push, and a refused one waits for its
 * `retryAt`.
 */
export const due = internalQuery({
  args: {
    siteId: v.string(),
    cursor: v.union(v.null(), v.string()),
    now: v.number(),
  },
  returns: v.object({
    devices: v.array(dueDevice),
    cursor: v.string(),
    done: v.boolean(),
  }),
  handler: async (ctx, { siteId, cursor, now }) => {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    const page = await ctx.db
      .query("devices")
      .withIndex("by_site_source", (q) =>
        q.eq("siteId", siteId).eq("source.integration", "netbox"),
      )
      .paginate({ numItems: PLAN_PAGE, cursor });
    if (!site) return { devices: [], cursor: page.continueCursor, done: true };
    const placeOf = placeNamer(ctx);
    const devices = [];
    for (const device of page.page) {
      // NetBox no longer returns it: there is nothing there to write to
      // (ADR 0039).
      if (device.source?.missingSince !== undefined) continue;
      const netboxId = Number(device.source?.externalId);
      if (!Number.isSafeInteger(netboxId)) continue;
      const sighting = await latestSighting(ctx, device);
      if (!sighting) continue;
      const values = pushValues(
        site.name,
        await placeOf(sighting),
        sighting.seenAt,
      );
      const row = await pushRowOf(ctx, device.objectId);
      if (row?.retryAt !== undefined && row.retryAt > now) continue;
      // Values sent to another NetBox device say nothing of this one.
      const sent =
        row?.sent && row.sentAt !== undefined && row.netboxId === netboxId
          ? { values: row.sent, at: row.sentAt }
          : null;
      const offline = device.metadata.status === "down";
      if (pushDue(values, sent, offline, now)) {
        devices.push({ deviceId: device.objectId, netboxId, values });
      }
    }
    return {
      devices,
      cursor: page.continueCursor,
      done: page.isDone,
    };
  },
});

const holdsLease = (cycle: Doc<"siteCycles"> | null, runId: string) =>
  cycle?.pushRunning?.runId === runId;

const mayGoOn = async (ctx: QueryCtx, siteId: string, runId: string) =>
  holdsLease(await cycleOf(ctx, siteId), runId) &&
  (await pushEnabled(ctx, siteId));

/** Whether the run may still write: asked before each PATCH attempt. */
export const stillPushing = internalQuery({
  args: { siteId: v.string(), runId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { siteId, runId }) => await mayGoOn(ctx, siteId, runId),
});

/**
 * Records what NetBox answered for one device. Returns whether the run may
 * go on: turning the push off, or losing the lease, stops it at once, and
 * the answer is then dropped: it may come from a NetBox the site left.
 */
export const record = internalMutation({
  args: {
    siteId: v.string(),
    runId: v.string(),
    deviceId: v.string(),
    netboxId: v.number(),
    values: pushedValues,
    refused: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!(await mayGoOn(ctx, args.siteId, args.runId))) return false;
    const now = Date.now();
    const row = await pushRowOf(ctx, args.deviceId);
    // What went to another NetBox device says nothing of this one.
    const forgotten =
      row && row.netboxId !== args.netboxId
        ? { sent: undefined, sentAt: undefined }
        : {};
    const outcome = args.refused
      ? {
          ...forgotten,
          failures: (row?.failures ?? 0) + 1,
          message: args.refused,
          failingSince: row?.failingSince ?? now,
          retryAt: pushRetryAt((row?.failures ?? 0) + 1, now),
        }
      : {
          sent: args.values,
          sentAt: now,
          failures: 0,
          message: undefined,
          failingSince: undefined,
          retryAt: undefined,
        };
    if (row) {
      await ctx.db.patch(row._id, { netboxId: args.netboxId, ...outcome });
    } else {
      await ctx.db.insert("netboxPushes", {
        siteId: args.siteId,
        deviceId: args.deviceId,
        netboxId: args.netboxId,
        ...outcome,
      });
    }
    return true;
  },
});

export const finish = internalMutation({
  args: { siteId: v.string(), runId: v.string(), result: pushRun },
  returns: v.null(),
  handler: async (ctx, { siteId, runId, result }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (!cycle || !holdsLease(cycle, runId)) return null;
    await ctx.db.patch(cycle._id, { pushRunning: undefined, lastPush: result });
    return null;
  },
});

type Tally = { sent: number; refused: number; error?: string };

const pushDevices = async (
  ctx: ActionCtx,
  siteId: string,
  runId: string,
  tally: Tally,
  transport: Transport,
) => {
  const connection = await openConnection(ctx, siteId, "netbox", transport);
  if ("error" in connection) {
    tally.error = connection.error;
    return;
  }
  // Each PATCH attempt, the first and the retries over minutes, is sent only
  // while the push is on and the site's NetBox is the one this run opened.
  const retry = {
    ...SOURCE_RETRY,
    stillWanted: () =>
      ctx.runQuery(internal.netboxPush.stillPushing, { siteId, runId }),
  };
  let cursor: string | null = null;
  for (;;) {
    const page: {
      devices: Array<{
        deviceId: string;
        netboxId: number;
        values: PushedValues;
      }>;
      cursor: string;
      done: boolean;
    } = await ctx.runQuery(internal.netboxPush.due, {
      siteId,
      cursor,
      now: Date.now(),
    });
    for (const device of page.devices) {
      if (tally.sent + tally.refused >= MAX_PUSHES_PER_RUN) return;
      let answer;
      try {
        answer = await netboxPatch(
          connection,
          `/api/dcim/devices/${device.netboxId}/`,
          { custom_fields: customFields(device.values) },
          retry,
        );
      } catch (error) {
        if (error instanceof RetryStopped) return;
        throw error;
      }
      // Unreachable, or failing on its side: the next device would fare the
      // same, so the next cycle's run tries again.
      if (!answer.ok && (answer.status === undefined || answer.status >= 500)) {
        tally.error = answer.message;
        return;
      }
      if (answer.ok) tally.sent += 1;
      else tally.refused += 1;
      const goOn = await ctx.runMutation(internal.netboxPush.record, {
        siteId,
        runId,
        ...device,
        ...(answer.ok ? {} : { refused: answer.message }),
      });
      if (!goOn) return;
    }
    if (page.done) return;
    cursor = page.cursor;
  }
};

/** One push to a site's NetBox, registered in `sources.ts`. */
export const runPush = async (
  ctx: ActionCtx,
  siteId: string,
  transport: Transport,
): Promise<null> => {
  const runId = await ctx.runMutation(internal.netboxPush.claim, { siteId });
  if (runId === null) return null;
  const startedAt = Date.now();
  const tally: Tally = { sent: 0, refused: 0 };
  try {
    await pushDevices(ctx, siteId, runId, tally, transport);
  } catch (error) {
    // The token is never part of an error the source code builds.
    console.error(`netbox push ${siteId}`, error);
    tally.error = "Erreur inattendue pendant l'envoi vers NetBox.";
  }
  await ctx.runMutation(internal.netboxPush.finish, {
    siteId,
    runId,
    result: { startedAt, finishedAt: Date.now(), ...tally },
  });
  return null;
};
