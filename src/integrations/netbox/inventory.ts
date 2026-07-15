import type { DeviceType } from "@/types/map";

export interface NetBoxInventoryFilterItem {
  type: DeviceType;
  name: string;
  hostname?: string;
  model?: string;
  role: string;
  ip?: string;
  locationPath: Array<string>;
  placement?: { deviceId: string; floorId: string };
}

export type NetBoxTypeFilter = DeviceType | "all";

export const isNetBoxValueDefined = (
  value: string | undefined,
): value is string => Boolean(value && !/^undefined\d*$/i.test(value.trim()));

export const netBoxLocationLabel = (
  locationPath: ReadonlyArray<string>,
): string => locationPath.join(" › ") || "Sans emplacement";

export const netBoxLifecycleLabel = (status: string): string => {
  const labels: Record<string, string> = {
    active: "Actif",
    inventory: "En inventaire",
    failed: "En panne",
    offline: "Hors service",
    staged: "En préparation",
    planned: "Planifié",
    decommissioning: "En retrait",
  };
  return labels[status] ?? status;
};

export const netBoxEquipmentLabel = (
  role: string,
  type: DeviceType,
  model?: string,
): string => {
  if (isNetBoxValueDefined(model)) return model;
  if (isNetBoxValueDefined(role)) return role;
  const labels: Record<DeviceType, string> = {
    pc: "Poste de travail",
    "wall-port": "Prise réseau",
    switch: "Switch réseau",
    rack: "Rack",
  };
  return labels[type];
};

export const matchesNetBoxInventoryFilters = (
  item: NetBoxInventoryFilterItem,
  filters: {
    query: string;
    type: NetBoxTypeFilter;
    location: string;
    hidePlaced: boolean;
  },
): boolean => {
  if (filters.hidePlaced && item.placement) return false;
  if (filters.type !== "all" && item.type !== filters.type) return false;
  const location = netBoxLocationLabel(item.locationPath);
  if (filters.location !== "all" && location !== filters.location) return false;
  const query = filters.query.trim().toLocaleLowerCase("fr");
  if (!query) return true;
  return [item.name, item.hostname, item.model, item.role, item.ip, location]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase("fr").includes(query));
};
