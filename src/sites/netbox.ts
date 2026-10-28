// What a site imports from NetBox (ADR 0023): one NetBox site, and for each
// NetBox device role the Netplan type its devices become. A role left out is
// ignored.
import type { DeviceType } from "../types/map";

/** The types a role can map to; NetBox racks are not devices. */
export const NETBOX_ROLE_TYPES = [
  "switch",
  "patch-panel",
  "wall-port",
  "pc",
  "endpoint",
] as const satisfies ReadonlyArray<DeviceType>;

export type NetBoxRoleType = (typeof NETBOX_ROLE_TYPES)[number];

export type NetBoxSite = { id: number; name: string };

export type NetBoxRoleMapping = {
  id: number;
  name: string;
  type: NetBoxRoleType;
};

export type NetBoxSettings = {
  site: NetBoxSite | null;
  roles: Array<NetBoxRoleMapping>;
  /** Whether each cycle pushes observed locations to NetBox (ADR 0027). */
  push?: boolean;
};

export const EMPTY_NETBOX_SETTINGS: NetBoxSettings = { site: null, roles: [] };

/** Whether a NetBox site answer is the chosen site under its id and name. */
export const sameNetBoxSite = (
  settings: NetBoxSettings,
  site: { id?: unknown; name?: unknown } | null,
): boolean =>
  settings.site !== null &&
  site?.id === settings.site.id &&
  typeof site.name === "string" &&
  site.name.trim() === settings.site.name.trim();

/**
 * Whether a NetBox at a new address is the one the settings were made with
 * (ADR 0034): the chosen site answers under its id, and either keeps its
 * name or most of the linked devices sampled answer under their ids with
 * their names, so a site renamed in NetBox is still recognised. A NetBox
 * without a chosen site cannot be recognised.
 */
export const sameNetBoxInstance = (
  settings: NetBoxSettings,
  site: { id?: unknown; name?: unknown } | null,
  devices: { sampled: number; matched: number },
): boolean =>
  settings.site !== null &&
  site?.id === settings.site.id &&
  (sameNetBoxSite(settings, site) ||
    (devices.sampled > 0 && devices.matched * 2 > devices.sampled));

/** A NetBox role as the settings list it, under its parent. */
export type NetBoxRole = { id: number; name: string; depth: number };

const isId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Why NetBox settings cannot be saved, in French, or `null`. */
export const netboxSettingsError = (
  settings: NetBoxSettings,
): string | null => {
  if (settings.site && !isId(settings.site.id)) {
    return "Ce site NetBox n'existe pas.";
  }
  const ids = settings.roles.map((role) => role.id);
  if (!ids.every(isId) || new Set(ids).size !== ids.length) {
    return "Chaque rôle NetBox ne peut avoir qu'un type.";
  }
  return null;
};
