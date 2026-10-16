// A site's NetBox settings (ADR 0023): the NetBox site it imports and the
// Netplan type of each NetBox device role, picked from what NetBox lists.
import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import { openConnection } from "./integrations";
import { PROBE_RETRY } from "./lib/integrationProbe";
import { adminAction, adminMutation, adminQuery } from "./lib/functions";
import { idOf, nameOf, netboxList } from "./lib/netboxApi";
import { requireSite } from "./sites";
import { netboxSettings } from "./siteValidators";
import {
  EMPTY_NETBOX_SETTINGS,
  netboxSettingsError,
} from "../src/sites/netbox";
import type { NetBoxRole, NetBoxSite } from "../src/sites/netbox";

const netboxRow = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("integrations")
    .withIndex("by_site_kind", (q) =>
      q.eq("siteId", siteId).eq("kind", "netbox"),
    )
    .unique();

/** `null` while the site has no NetBox. */
export const settings = adminQuery({
  args: { siteId: v.string() },
  returns: v.union(v.null(), netboxSettings),
  handler: async (ctx, { siteId }) => {
    const row = await netboxRow(ctx, siteId);
    return row ? (row.netbox ?? EMPTY_NETBOX_SETTINGS) : null;
  },
});

/**
 * `baseUrl` is the NetBox the form's choices came from: another NetBox has
 * other sites and roles under the same ids.
 */
export const saveSettings = adminMutation({
  args: { siteId: v.string(), baseUrl: v.string(), settings: netboxSettings },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSite(ctx, args.siteId);
    const row = await netboxRow(ctx, args.siteId);
    if (!row)
      throw new ConvexError("Configurez d'abord la connexion à NetBox.");
    if (row.baseUrl !== args.baseUrl) {
      throw new ConvexError(
        "L'adresse de NetBox a changé : rouvrez ce formulaire.",
      );
    }
    const refused = netboxSettingsError(args.settings);
    if (refused) throw new ConvexError(refused);
    const { site, roles } = args.settings;
    // The push has its own switch, which this form does not show.
    const push = row.netbox?.push;
    await ctx.db.patch(row._id, {
      netbox: { site, roles, ...(push !== undefined && { push }) },
    });
    return null;
  },
});

/**
 * Turns on or off the push of observed locations to NetBox (ADR 0027). Off
 * stops writes at once; what was written stays in NetBox.
 */
export const setPush = adminMutation({
  args: { siteId: v.string(), push: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { siteId, push }) => {
    await requireSite(ctx, siteId);
    const row = await netboxRow(ctx, siteId);
    if (!row)
      throw new ConvexError("Configurez d'abord la connexion à NetBox.");
    await ctx.db.patch(row._id, {
      netbox: { ...(row.netbox ?? EMPTY_NETBOX_SETTINGS), push },
    });
    return null;
  },
});

const choice = v.object({ id: v.number(), name: v.string() });

/** The sites and device roles NetBox lists, for the admin to pick from. */
export const options = adminAction({
  args: { siteId: v.string() },
  returns: v.union(
    v.object({ error: v.string() }),
    v.object({
      baseUrl: v.string(),
      sites: v.array(choice),
      roles: v.array(v.object({ ...choice.fields, depth: v.number() })),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const connection = await openConnection(ctx, siteId, "netbox", {
      enabledOnly: false,
    });
    if ("error" in connection) return connection;
    const { baseUrl, token } = connection;
    const [sites, roles] = await Promise.all([
      netboxList(baseUrl, token, "/api/dcim/sites/?brief=1", PROBE_RETRY),
      netboxList(
        baseUrl,
        token,
        "/api/dcim/device-roles/?brief=1",
        PROBE_RETRY,
      ),
    ]);
    if (!sites.ok) return { error: sites.message };
    if (!roles.ok) return { error: roles.message };
    const picked = <T>(
      item: Record<string, unknown>,
      more: (id: number) => T,
    ) => {
      const id = idOf(item);
      return id === null ? [] : [more(id)];
    };
    return {
      baseUrl,
      sites: sites.items
        .flatMap((item) =>
          picked(item, (id): NetBoxSite => ({ id, name: nameOf(item) })),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
      // NetBox lists nested roles in tree order, each under its parent.
      roles: roles.items.flatMap((item) =>
        picked(item, (id): NetBoxRole => ({
          id,
          name: nameOf(item),
          depth: typeof item._depth === "number" ? item._depth : 0,
        })),
      ),
    };
  },
});
