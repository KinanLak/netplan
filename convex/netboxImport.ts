// Imports a site's devices from NetBox during a collection cycle (ADR 0022,
// ADR 0023): the action reads NetBox, one mutation merges what it read into
// the inventory, so a failure half-way changes nothing.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { cycleOf } from "./lib/cycles";
import { deletePush, deletePushes } from "./netboxPush";
import { SOURCE_RETRY } from "./lib/httpRetry";
import { netboxList } from "./lib/netboxApi";
import type { Source } from "./lib/integrationProbe";
import {
  cableRow,
  cableRowAt,
  deleteDeviceCabling,
  portRowsOf,
} from "./lib/ports";
import {
  importedCable,
  importedDevice,
  importedPort,
  netboxSettings,
} from "./siteValidators";
import {
  absencePurgeDue,
  importSummary,
  withPlacementClock,
  newDeviceKey,
  planDevicePorts,
  planNetBoxImport,
  readNetBoxCabling,
  readNetBoxDevices,
  sameImport,
} from "../src/sites/netboxImport";
import type {
  ImportedCable,
  ImportedDevice,
  ImportedPort,
} from "../src/sites/netboxImport";

// NetBox changes when people edit it, which is rare next to what LibreNMS
// sees, so an automatic cycle imports it at most this often.
const IMPORT_EVERY_MS = 15 * 60_000;

const IMPORTED_BY = "netbox";

/** What the cycle imports, or why it imports nothing this time. */
export const importSettings = internalQuery({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.union(
    v.object({ due: v.literal(false), skip: v.string() }),
    v.object({
      due: v.literal(true),
      baseUrl: v.string(),
      settings: netboxSettings,
    }),
  ),
  handler: async (ctx, { siteId, cycleId }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== cycleId)
      return { due: false as const, skip: "" };
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_site_kind", (q) =>
        q.eq("siteId", siteId).eq("kind", "netbox"),
      )
      .unique();
    if (!row?.netbox?.site) {
      return {
        due: false as const,
        skip: "Aucun site NetBox choisi : rien n'est importé.",
      };
    }
    const since = Date.now() - (cycle.netboxImportedAt ?? 0);
    if (!cycle.running.manual && since < IMPORT_EVERY_MS)
      return { due: false as const, skip: "" };
    return { due: true as const, baseUrl: row.baseUrl, settings: row.netbox };
  },
});

/** Reads the site's devices from NetBox and merges them into the inventory. */
export const importFromNetBox = async (
  ctx: ActionCtx,
  siteId: string,
  cycleId: string,
  connection: Source,
): Promise<{ ok: boolean; message: string }> => {
  const wanted = await ctx.runQuery(internal.netboxImport.importSettings, {
    siteId,
    cycleId,
  });
  if (!wanted.due) return { ok: true, message: wanted.skip };
  const { settings } = wanted;
  const site = settings.site;
  // The settings changed between the connection and now.
  if (!site || wanted.baseUrl !== connection.baseUrl) {
    return { ok: true, message: "" };
  }
  const { baseUrl } = connection;

  // Without a role NetBox would list every device of the site, so nothing is
  // read, and the empty import still marks absent what earlier roles brought.
  const noRole = settings.roles.length === 0;
  const roleFilter = settings.roles.map((role) => `&role_id=${role.id}`);
  const lists = noRole
    ? []
    : await Promise.all(
        [
          `/api/dcim/devices/?site_id=${site.id}${roleFilter.join("")}`,
          `/api/dcim/interfaces/?site_id=${site.id}`,
          `/api/dcim/front-ports/?site_id=${site.id}`,
          `/api/dcim/rear-ports/?site_id=${site.id}`,
          `/api/dcim/cables/?site_id=${site.id}`,
        ].map((path) => netboxList(connection, path, SOURCE_RETRY)),
      );
  const items = [];
  for (const list of lists) {
    if (!list.ok) return { ok: false, message: list.message };
    items.push(list.items);
  }
  const [
    devices = [],
    interfaces = [],
    frontPorts = [],
    rearPorts = [],
    cables = [],
  ] = items;

  const imported = readNetBoxDevices(devices, interfaces, settings.roles);
  const counts = await ctx.runMutation(internal.netboxImport.apply, {
    siteId,
    cycleId,
    baseUrl,
    settings,
    devices: imported,
    ...readNetBoxCabling(imported, {
      interfaces,
      frontPorts,
      rearPorts,
      cables,
    }),
  });
  if (!counts) return { ok: true, message: "" };
  if (noRole && counts.missing === 0) {
    return {
      ok: true,
      message: "Aucun rôle NetBox n'a de type : rien n'est importé.",
    };
  }
  return { ok: true, message: importSummary(counts) };
};

const importCounts = v.object({
  imported: v.number(),
  created: v.number(),
  merged: v.number(),
  missing: v.number(),
  returned: v.number(),
  review: v.number(),
});

/** Merges an import into the inventory; `null` when it no longer applies. */
export const apply = internalMutation({
  args: {
    siteId: v.string(),
    cycleId: v.string(),
    baseUrl: v.string(),
    settings: netboxSettings,
    devices: v.array(importedDevice),
    ports: v.array(importedPort),
    cables: v.array(importedCable),
  },
  returns: v.union(v.null(), importCounts),
  handler: async (ctx, args) => {
    const { siteId, devices } = args;
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== args.cycleId) return null;
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_site_kind", (q) =>
        q.eq("siteId", siteId).eq("kind", "netbox"),
      )
      .unique();
    // The admin changed what the site imports while NetBox was read: an
    // import of other roles would remove devices the new mapping keeps.
    if (
      row?.baseUrl !== args.baseUrl ||
      !row.netbox ||
      !sameImport(row.netbox, args.settings)
    ) {
      return null;
    }

    const inventory = await ctx.db
      .query("devices")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    const plan = planNetBoxImport(
      devices,
      inventory.map((device) => ({
        id: device.objectId,
        netboxId: device.source
          ? device.source.integration === "netbox"
            ? device.source.externalId
            : null
          : undefined,
        name: device.name,
        hostname: device.hostname,
        serial: device.serial,
        macs: device.macs,
        placed: device.placement !== undefined,
        missingSince: device.source?.missingSince,
        staleId: device.source?.staleId,
      })),
    );
    const byId = new Map(inventory.map((device) => [device.objectId, device]));
    const now = Date.now();

    // Nothing NetBox stops returning is deleted or released here: it stays
    // bound, absent since now, until NetBox returns it or the purge takes it
    // (ADR 0039).
    for (const deviceId of plan.missing) {
      const device = byId.get(deviceId);
      if (!device?.source) continue;
      await ctx.db.patch(device._id, {
        source: withPlacementClock(
          { ...device.source, missingSince: now },
          device.placement !== undefined,
          now,
        ),
        updatedAt: now,
        updatedBy: IMPORTED_BY,
      });
      // Nothing is pushed to it any more, so a failure it had is moot.
      await deletePush(ctx, deviceId);
    }

    // Every MAC the import moves is freed before any is claimed again.
    const written = [
      ...plan.update.map(({ deviceId, device }) => ({
        deviceId,
        device,
        macs: plan.macs.get(deviceId) ?? [],
      })),
      ...plan.create.map((device) => ({
        deviceId: `device:${crypto.randomUUID()}`,
        device,
        macs: plan.macs.get(newDeviceKey(device)) ?? [],
      })),
    ];
    for (const { deviceId, macs } of written) {
      const kept = new Set(macs);
      for (const held of await macRowsOf(ctx, deviceId)) {
        if (!kept.has(held.mac)) await ctx.db.delete(held._id);
      }
    }
    for (const { deviceId, device, macs } of written) {
      const held = new Set(
        (await macRowsOf(ctx, deviceId)).map((entry) => entry.mac),
      );
      for (const mac of macs) {
        if (!held.has(mac)) {
          await ctx.db.insert("deviceMacs", { siteId, mac, deviceId });
        }
      }
      const fields = sourceFields(device, macs, now);
      const existing = byId.get(deviceId);
      if (existing) {
        if (changes(existing, fields)) {
          await ctx.db.patch(existing._id, {
            ...fields,
            updatedAt: now,
            updatedBy: IMPORTED_BY,
          });
        }
      } else {
        await ctx.db.insert("devices", {
          objectId: deviceId,
          siteId,
          ...fields,
          metadata: {},
          updatedAt: now,
          updatedBy: IMPORTED_BY,
        });
      }
    }

    const portIds = await importPorts(ctx, siteId, written, args.ports);
    const relinked = new Set(written.map((entry) => entry.deviceId));
    const absent = new Set([
      ...plan.missing,
      ...inventory
        .filter(
          (device) =>
            device.source?.missingSince !== undefined &&
            !relinked.has(device.objectId),
        )
        .map((device) => device.objectId),
    ]);
    await importCables(ctx, siteId, portIds, args.cables, absent, now);
    await replaceReviews(ctx, siteId, plan, now);
    await ctx.db.patch(cycle._id, { netboxImportedAt: now });
    const wasAbsent = (deviceId: string) =>
      byId.get(deviceId)?.source?.missingSince !== undefined;
    return {
      imported: devices.length,
      created: plan.create.length,
      merged: plan.update.filter(
        (entry) => entry.bind && !wasAbsent(entry.deviceId),
      ).length,
      missing: plan.missing.length,
      returned: plan.update.filter((entry) => wasAbsent(entry.deviceId)).length,
      review: plan.suggest.length + plan.conflict.length,
    };
  },
});

// Deletions per mutation, so a site with many absent devices stays within a
// mutation's limits; the rest follow in the next run.
const PURGE_BATCH = 100;

/**
 * Deletes the devices absent from NetBox for 30 days and on no floor for as
 * long, with their MACs, ports, cables and push row, as an import once did
 * at once (ADR 0039). Daily; an archived site keeps everything.
 */
export const purgeAbsent = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const site of await ctx.db.query("sites").collect()) {
      if (site.archivedAt !== undefined) continue;
      await ctx.scheduler.runAfter(0, internal.netboxImport.purgeSite, {
        siteId: site.objectId,
      });
    }
    return null;
  },
});

export const purgeSite = internalMutation({
  args: { siteId: v.string() },
  returns: v.number(),
  handler: async (ctx, { siteId }) => {
    // Archived since this run was scheduled: it keeps everything (ADR 0033).
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    if (!site || site.archivedAt !== undefined) return 0;
    const importedAt = (await cycleOf(ctx, siteId))?.netboxImportedAt;
    if (importedAt === undefined) return 0;
    const now = Date.now();
    const absent = (
      await ctx.db
        .query("devices")
        .withIndex("by_site_source", (q) =>
          q.eq("siteId", siteId).eq("source.integration", "netbox"),
        )
        .collect()
    ).filter((device) => device.source?.missingSince !== undefined);
    // A safety net: placement writes keep the clock, but a device written
    // otherwise still gets it.
    for (const device of absent) {
      const { source } = device;
      if (!source) continue;
      const placed = device.placement !== undefined;
      if (placed === (source.offPlanSince === undefined)) continue;
      const { offPlanSince: _, ...rest } = source;
      await ctx.db.patch(device._id, {
        source: placed ? rest : { ...source, offPlanSince: now },
      });
    }
    const due = absent.filter((device) =>
      absencePurgeDue(
        {
          placed: device.placement !== undefined,
          missingSince: device.source?.missingSince,
          offPlanSince: device.source?.offPlanSince,
        },
        importedAt,
      ),
    );
    for (const device of due.slice(0, PURGE_BATCH)) {
      await deleteDeviceMacs(ctx, device.objectId);
      await deleteDeviceCabling(ctx, device.objectId);
      await deletePush(ctx, device.objectId);
      await ctx.db.delete(device._id);
    }
    if (due.length > PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.netboxImport.purgeSite, {
        siteId,
      });
    }
    return Math.min(due.length, PURGE_BATCH);
  },
});

type DeviceSourceRow = NonNullable<Doc<"devices">["source"]>;

/**
 * Rewrites the binding of each device bound to the site's NetBox (`null`
 * leaves it as it is), turns every NetBox port and cable of the site manual,
 * and drops its reviews and push rows: they were about that NetBox.
 */
const releaseBindings = async (
  ctx: MutationCtx,
  siteId: string,
  rebind: (source: DeviceSourceRow) => DeviceSourceRow | undefined | null,
  stamp: Record<string, unknown> = {},
) => {
  const bound = await ctx.db
    .query("devices")
    .withIndex("by_site_source", (q) =>
      q.eq("siteId", siteId).eq("source.integration", "netbox"),
    )
    .collect();
  for (const device of bound) {
    if (!device.source) continue;
    const source = rebind(device.source);
    if (source === null) continue;
    await ctx.db.patch(device._id, { source, ...stamp });
    await unbindPorts(ctx, device.objectId);
  }
  const cables = await ctx.db
    .query("cables")
    .withIndex("by_site_source", (q) =>
      q.eq("siteId", siteId).eq("source.integration", "netbox"),
    )
    .collect();
  for (const cable of cables) {
    await ctx.db.patch(cable._id, { source: undefined });
  }
  await deleteImportReviews(ctx, siteId);
  await deletePushes(ctx, siteId);
};

/**
 * The site now reads another NetBox instance (ADR 0034): every device bound
 * to the previous one becomes absent, its binding kept for its fields and
 * date but marked `staleId`, never matched by id again, and its ports and
 * NetBox cables become manual, since their ids mean nothing in the new
 * NetBox.
 */
export const leaveNetBoxInstance = async (ctx: MutationCtx, siteId: string) => {
  const now = Date.now();
  await releaseBindings(
    ctx,
    siteId,
    ({ url: _, ...source }) =>
      source.staleId
        ? null
        : {
            ...source,
            missingSince: source.missingSince ?? now,
            staleId: true,
          },
    { updatedAt: now, updatedBy: IMPORTED_BY },
  );
};

/** The devices bound to the site's current NetBox, with their NetBox ids. */
export const linkedToNetBox = async (ctx: QueryCtx, siteId: string) =>
  (
    await ctx.db
      .query("devices")
      .withIndex("by_site_source", (q) =>
        q.eq("siteId", siteId).eq("source.integration", "netbox"),
      )
      .collect()
  ).flatMap((device) =>
    device.source && !device.source.staleId
      ? [{ externalId: device.source.externalId, name: device.name }]
      : [],
  );

/**
 * Releases the devices, ports and cables bound to the site's NetBox, which
 * become manual, and drops its pending reviews, when the site leaves NetBox
 * (« Retirer »).
 */
export const releaseNetBox = async (ctx: MutationCtx, siteId: string) => {
  await releaseBindings(ctx, siteId, () => undefined);
};

export const deleteImportReviews = async (ctx: MutationCtx, siteId: string) => {
  const rows = await ctx.db
    .query("importReviews")
    .withIndex("by_site", (q) =>
      q.eq("siteId", siteId).eq("integration", "netbox"),
    )
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
};

export const sourceFields = (
  device: ImportedDevice,
  macs: Array<string>,
  syncedAt: number,
) => ({
  type: device.type,
  name: device.name,
  serial: device.serial,
  macs,
  model: device.model,
  ip: device.ip,
  source: {
    integration: "netbox" as const,
    externalId: device.externalId,
    url: device.url,
    syncedAt,
  },
});

const OWNED = ["type", "name", "serial", "macs", "model", "ip"] as const;

/**
 * Whether NetBox changed what it owns; an unchanged device is not written, so
 * an import every 15 minutes does not wake every page showing it.
 */
const changes = (
  device: Doc<"devices">,
  fields: ReturnType<typeof sourceFields>,
) =>
  device.source?.integration !== "netbox" ||
  device.source.missingSince !== undefined ||
  device.source.externalId !== fields.source.externalId ||
  device.source.url !== fields.source.url ||
  OWNED.some(
    (key) => JSON.stringify(device[key]) !== JSON.stringify(fields[key]),
  );

const netbox = (externalId: string) => ({
  integration: "netbox" as const,
  externalId,
});

/** A released device keeps its ports as manual ones. */
const unbindPorts = async (ctx: MutationCtx, deviceId: string) => {
  for (const port of await portRowsOf(ctx, deviceId)) {
    if (port.source) await ctx.db.patch(port._id, { source: undefined });
  }
};

/**
 * Gives each written device NetBox's ports, and returns where each NetBox
 * port now is. A port that goes takes its cable with it.
 */
const importPorts = async (
  ctx: MutationCtx,
  siteId: string,
  written: ReadonlyArray<{ deviceId: string; device: ImportedDevice }>,
  ports: ReadonlyArray<ImportedPort>,
) => {
  const wantedBy = Map.groupBy(ports, (port) => port.deviceExternalId);
  const located = new Map<string, { deviceId: string; portId: string }>();
  for (const { deviceId, device } of written) {
    const rows = await portRowsOf(ctx, deviceId);
    const plan = planDevicePorts(
      deviceId,
      rows.map((row) => ({
        id: row.objectId,
        name: row.name,
        kind: row.kind,
        netboxId:
          row.source?.integration === "netbox" ? row.source.externalId : null,
      })),
      wantedBy.get(device.externalId) ?? [],
    );
    const rowOf = new Map(rows.map((row) => [row.objectId, row]));
    for (const portId of plan.remove) {
      const cable = await cableRowAt(ctx, portId);
      if (cable) await ctx.db.delete(cable._id);
      const row = rowOf.get(portId);
      if (row) await ctx.db.delete(row._id);
    }
    const idOf = new Map(
      plan.ports.map(({ id, port }) => [port.externalId, id] as const),
    );
    for (const { id, port, order } of plan.ports) {
      located.set(port.externalId, { deviceId, portId: id });
      const fields = {
        name: port.name,
        kind: port.kind,
        order,
        rearPortId: port.rearExternalId && idOf.get(port.rearExternalId),
        source: netbox(port.externalId),
      };
      const row = rowOf.get(id);
      if (!row) {
        await ctx.db.insert("ports", {
          objectId: id,
          siteId,
          deviceId,
          ...fields,
        });
      } else if (
        row.name !== fields.name ||
        row.kind !== fields.kind ||
        row.order !== fields.order ||
        row.rearPortId !== fields.rearPortId ||
        row.source?.externalId !== port.externalId
      ) {
        await ctx.db.patch(row._id, fields);
      }
    }
  }
  return located;
};

/**
 * Lays NetBox's cables between the ports it placed. A cable NetBox no longer
 * lists goes, unless it touches an absent device, which keeps its cabling
 * until it comes back or is purged; one NetBox lays on a port with a manual
 * cable replaces it.
 */
const importCables = async (
  ctx: MutationCtx,
  siteId: string,
  located: ReadonlyMap<string, { deviceId: string; portId: string }>,
  cables: ReadonlyArray<ImportedCable>,
  absent: ReadonlySet<string>,
  now: number,
) => {
  const existing = await ctx.db
    .query("cables")
    .withIndex("by_site_source", (q) =>
      q.eq("siteId", siteId).eq("source.integration", "netbox"),
    )
    .collect();
  const byId = new Map(
    existing.map((row) => [row.source?.externalId ?? "", row]),
  );
  const kept = new Set<string>();
  for (const cable of cables) {
    const a = located.get(cable.a);
    const b = located.get(cable.b);
    if (!a || !b) continue;
    const row = byId.get(cable.externalId);
    const ends = [a.portId, b.portId].sort().join(" ");
    if (row && [row.aPortId, row.bPortId].sort().join(" ") === ends) {
      kept.add(cable.externalId);
      continue;
    }
    if (row) await ctx.db.delete(row._id);
    byId.delete(cable.externalId);
    for (const portId of [a.portId, b.portId]) {
      const other = await cableRowAt(ctx, portId);
      if (!other) continue;
      await ctx.db.delete(other._id);
      if (other.source) byId.delete(other.source.externalId);
    }
    await ctx.db.insert("cables", {
      ...cableRow(
        siteId,
        { id: `cable:${crypto.randomUUID()}`, a, b },
        now,
        IMPORTED_BY,
      ),
      source: netbox(cable.externalId),
    });
    kept.add(cable.externalId);
  }
  for (const [externalId, row] of byId) {
    if (kept.has(externalId)) continue;
    if (absent.has(row.aDeviceId) || absent.has(row.bDeviceId)) continue;
    await ctx.db.delete(row._id);
  }
};

export const macRowsOf = async (ctx: MutationCtx, deviceId: string) =>
  await ctx.db
    .query("deviceMacs")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .collect();

const deleteDeviceMacs = async (ctx: MutationCtx, deviceId: string) => {
  for (const row of await macRowsOf(ctx, deviceId)) {
    await ctx.db.delete(row._id);
  }
};

/** The site's NetBox reviews become the ones this import left. */
const replaceReviews = async (
  ctx: MutationCtx,
  siteId: string,
  plan: ReturnType<typeof planNetBoxImport>,
  now: number,
) => {
  await deleteImportReviews(ctx, siteId);
  const reviews = [
    ...plan.suggest.map((entry) => ({ ...entry, kind: "suggestion" as const })),
    ...plan.conflict.map((entry) => ({ ...entry, kind: "conflict" as const })),
  ];
  for (const { kind, device, candidateIds } of reviews) {
    await ctx.db.insert("importReviews", {
      siteId,
      integration: "netbox",
      kind,
      device,
      candidateIds,
      updatedAt: now,
    });
  }
};
