// A site's LibreNMS settings (ADR 0023): the LibreNMS device each Netplan
// switch stands for, picked from what LibreNMS lists.
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { openConnection } from "./integrations";
import { PROBE_RETRY, sourceGet } from "./lib/integrationProbe";
import type { Transport } from "./lib/integrationProbe";
import {
  adminMutation,
  adminQuery,
  editorMutation,
  editorQuery,
} from "./lib/functions";
import { cycleOf } from "./lib/cycles";
import { deviceOf as inventoryDevice, portNamesPlan } from "./librenmsCycle";
import { requireOpenSite, requireSite } from "./sites";
import { librenmsSettings } from "./siteValidators";
import {
  EMPTY_LIBRENMS_SETTINGS,
  librenmsId,
  librenmsSettingsError,
} from "../src/sites/librenms";
import type { LibreNMSDevice } from "../src/sites/librenms";

const librenmsRow = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("integrations")
    .withIndex("by_site_kind", (q) =>
      q.eq("siteId", siteId).eq("kind", "librenms"),
    )
    .unique();

const switchesOf = async (ctx: QueryCtx, siteId: string) =>
  (
    await ctx.db
      .query("devices")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect()
  ).filter((device) => device.type === "switch");

/**
 * The site's switches and the LibreNMS device of each; `null` while the
 * site has no LibreNMS. A mapping whose switch is gone is left out.
 */
export const settings = adminQuery({
  args: { siteId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      settings: librenmsSettings,
      switches: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          hostname: v.optional(v.string()),
          /** Where it is placed, to tell switches of one name apart. */
          floor: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const row = await librenmsRow(ctx, siteId);
    if (!row) return null;
    const devices = await switchesOf(ctx, siteId);
    const floorNames = new Map<string, string>();
    for (const device of devices) {
      const floorId = device.placement?.floorId;
      if (!floorId || floorNames.has(floorId)) continue;
      const floor = await ctx.db
        .query("floors")
        .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
        .unique();
      if (floor) floorNames.set(floorId, floor.name);
    }
    const switches = devices
      .map((device) => {
        const floor = floorNames.get(device.placement?.floorId ?? "");
        return {
          id: device.objectId,
          name: device.name,
          ...(device.hostname ? { hostname: device.hostname } : {}),
          ...(floor ? { floor } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const present = new Set(switches.map((device) => device.id));
    const saved = row.librenms ?? EMPTY_LIBRENMS_SETTINGS;
    return {
      settings: {
        switches: saved.switches.filter(({ switchId }) =>
          present.has(switchId),
        ),
      },
      switches,
    };
  },
});

/**
 * `baseUrl` is the LibreNMS the form's choices came from: another LibreNMS
 * has other devices under the same ids.
 */
export const saveSettings = adminMutation({
  args: {
    siteId: v.string(),
    baseUrl: v.string(),
    settings: librenmsSettings,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSite(ctx, args.siteId);
    const row = await librenmsRow(ctx, args.siteId);
    if (!row) throw new ConvexError("Connectez d'abord LibreNMS.");
    if (row.baseUrl !== args.baseUrl) {
      throw new ConvexError(
        "L'adresse de LibreNMS a changé, rouvrez ce formulaire.",
      );
    }
    const refused = librenmsSettingsError(args.settings);
    if (refused) throw new ConvexError(refused);
    const switches = new Set(
      (await switchesOf(ctx, args.siteId)).map((device) => device.objectId),
    );
    if (
      !args.settings.switches.every(({ switchId }) => switches.has(switchId))
    ) {
      throw new ConvexError("Ce switch n'est plus dans l'inventaire du site.");
    }
    await ctx.db.patch(row._id, { librenms: args.settings });
    return null;
  },
});

/** LibreNMS names a device by its SNMP sysName, else by how it is polled. */
const deviceOf = (item: unknown): LibreNMSDevice | null => {
  if (typeof item !== "object" || item === null) return null;
  const fields = item as Record<string, unknown>;
  const id = librenmsId(fields.device_id);
  if (id === null) return null;
  const name = [fields.sysName, fields.display, fields.hostname].find(
    (value): value is string => typeof value === "string" && value !== "",
  );
  return { id, name: name ?? `#${id}` };
};

export const devicesResult = v.union(
  v.object({ error: v.string() }),
  v.object({
    baseUrl: v.string(),
    devices: v.array(v.object({ id: v.number(), name: v.string() })),
  }),
);

/**
 * The devices LibreNMS polls, for the admin to pick from. Registered in
 * `sources.ts`.
 */
export const listDevices = async (
  ctx: ActionCtx,
  siteId: string,
  transport: Transport,
): Promise<Infer<typeof devicesResult>> => {
  const connection = await openConnection(ctx, siteId, "librenms", transport, {
    enabledOnly: false,
  });
  if ("error" in connection) return connection;
  const answer = await sourceGet(connection, "/api/v0/devices", PROBE_RETRY);
  if (!answer.ok) return { error: answer.message };
  const listed =
    typeof answer.body === "object" && answer.body !== null
      ? (answer.body as Record<string, unknown>).devices
      : undefined;
  if (!Array.isArray(listed)) {
    return { error: "LibreNMS n'a pas listé ses équipements." };
  }
  return {
    baseUrl: connection.baseUrl,
    devices: listed
      .flatMap((item) => deviceOf(item) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, "fr")),
  };
};

/** The names LibreNMS offers a switch, while it may still take them. */
const offerFor = async (ctx: QueryCtx, deviceId: string) => {
  const device = await inventoryDevice(ctx, deviceId);
  if (device?.type !== "switch") return null;
  const cycle = await cycleOf(ctx, device.siteId);
  const offer = cycle?.portNameOffers?.find(
    ({ switchId }) => switchId === deviceId,
  );
  if (!offer) return null;
  const adoption = await portNamesPlan(ctx, device.siteId, offer);
  return adoption ? { device, offer, ...adoption } : null;
};

/**
 * How many port names LibreNMS offers a manual switch whose ports still
 * carry their default names, for the drawer to propose (ADR 0038).
 */
export const portNameOffer = editorQuery({
  args: { deviceId: v.string() },
  returns: v.union(v.null(), v.object({ count: v.number() })),
  handler: async (ctx, { deviceId }) => {
    const found = await offerFor(ctx, deviceId);
    return found ? { count: found.offer.names.length } : null;
  },
});

/**
 * Gives the switch LibreNMS's port names (ADR 0025's adoption): by
 * position, so each port keeps its id and cable; ports LibreNMS has beyond
 * are added, uncabled ones beyond its are removed.
 */
export const adoptPortNames = editorMutation({
  args: { deviceId: v.string() },
  returns: v.number(),
  handler: async (ctx, { deviceId }) => {
    const found = await offerFor(ctx, deviceId);
    if (!found) {
      throw new ConvexError(
        "LibreNMS ne propose plus de noms pour les ports de ce switch.",
      );
    }
    const { device, offer, plan, rows } = found;
    await requireOpenSite(ctx, device.siteId);
    const rowOf = new Map(rows.map((row) => [row.objectId, row]));
    for (const { id, name } of plan.rename) {
      const row = rowOf.get(id);
      if (row) await ctx.db.patch(row._id, { name });
    }
    for (const id of plan.remove) {
      const row = rowOf.get(id);
      if (row) await ctx.db.delete(row._id);
    }
    for (const { id, name, order } of plan.add) {
      await ctx.db.insert("ports", {
        objectId: id,
        siteId: device.siteId,
        deviceId,
        name,
        kind: "interface",
        order,
      });
    }
    return offer.names.length;
  },
});
