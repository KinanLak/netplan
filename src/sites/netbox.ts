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
