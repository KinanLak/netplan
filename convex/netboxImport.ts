// Imports a site's devices from NetBox during a collection cycle (ADR 0022,
// ADR 0023): the action reads NetBox, one mutation merges what it read into
// the inventory, so a failure half-way changes nothing.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
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
  importSummary,
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
  // read, and the empty import still retires what earlier roles brought.
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
  if (noRole && counts.removed === 0) {
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
  removed: v.number(),
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
      })),
    );
    const byId = new Map(inventory.map((device) => [device.objectId, device]));
    const now = Date.now();

    for (const deviceId of plan.remove) {
      const device = byId.get(deviceId);
      if (!device) continue;
      await deleteDeviceMacs(ctx, deviceId);
      await deleteDeviceCabling(ctx, deviceId);
      await deletePush(ctx, deviceId);
      await ctx.db.delete(device._id);
    }
    for (const deviceId of plan.unbind) {
      const device = byId.get(deviceId);
      if (device) await ctx.db.patch(device._id, { source: undefined });
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

    for (const deviceId of plan.unbind) await unbindPorts(ctx, deviceId);
    const portIds = await importPorts(ctx, siteId, written, args.ports);
    await importCables(ctx, siteId, portIds, args.cables, now);
    await replaceReviews(ctx, siteId, plan, now);
    await ctx.db.patch(cycle._id, { netboxImportedAt: now });
    return {
      imported: devices.length,
      created: plan.create.length,
      merged: plan.update.filter((entry) => entry.bind).length,
      removed: plan.remove.length + plan.unbind.length,
      review: plan.suggest.length + plan.conflict.length,
    };
  },
});

/**
 * Releases the devices, ports and cables bound to the site's NetBox, which
 * become manual, and drops its pending reviews: another NetBox reuses the
 * same ids for other devices, so a binding means nothing once the address
 * changes.
 */
export const releaseNetBox = async (ctx: MutationCtx, siteId: string) => {
  const bound = await ctx.db
    .query("devices")
    .withIndex("by_site_source", (q) =>
      q.eq("siteId", siteId).eq("source.integration", "netbox"),
    )
    .collect();
  for (const device of bound) {
    await ctx.db.patch(device._id, { source: undefined });
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
  device.source.externalId !== fields.source.externalId ||
  device.source.url !== fields.source.url ||
  OWNED.some(
    (key) => JSON.stringify(device[key]) !== JSON.stringify(fields[key]),
  );

const netbox = (externalId: string) => ({
  integration: "netbox" as const,
  externalId,
});

/** A device NetBox dropped keeps its ports as manual ones. */
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
 * lists goes; one NetBox lays on a port with a manual cable replaces it.
 */
const importCables = async (
  ctx: MutationCtx,
  siteId: string,
  located: ReadonlyMap<string, { deviceId: string; portId: string }>,
  cables: ReadonlyArray<ImportedCable>,
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
    if (!kept.has(externalId)) await ctx.db.delete(row._id);
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
