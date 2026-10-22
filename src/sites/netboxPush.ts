// The location push to NetBox (ADR 0027): the custom fields Netplan writes
// on a NetBox device, what they hold, and when a value is worth a PATCH.
// Convex bundles this file, so relative imports only.

/** Where the network last saw a device, as the push writes it. */
export type PushedValues = {
  site: string;
  /** Building and floor of the socket, when the port reaches one on a floor. */
  floor: string | null;
  socket: string | null;
  switchPort: string;
  lastSeen: number;
};

/** The names of a place, as history copies them. */
type NamedPlace = {
  switchName: string;
  portName: string;
  socketName?: string;
  floorName?: string;
  buildingName?: string;
};

export const pushValues = (
  siteName: string,
  place: NamedPlace,
  seenAt: number,
): PushedValues => ({
  site: siteName,
  floor:
    [place.buildingName, place.floorName].filter(Boolean).join(" · ") || null,
  socket: place.socketName ?? null,
  switchPort: `${place.switchName} · ${place.portName}`,
  lastSeen: seenAt,
});

/** The custom fields, as `scripts/netbox-custom-fields.ts` creates them. */
export const PUSH_FIELDS = [
  {
    name: "netplan_site",
    type: "text",
    label: "Site (NetPlan)",
    description: "Le site NetPlan où le réseau a vu l'équipement.",
  },
  {
    name: "netplan_floor",
    type: "text",
    label: "Étage (NetPlan)",
    description: "Le bâtiment et l'étage de la prise où il a été vu.",
  },
  {
    name: "netplan_socket",
    type: "text",
    label: "Prise (NetPlan)",
    description: "La prise murale où il a été vu.",
  },
  {
    name: "netplan_switch_port",
    type: "text",
    label: "Port de switch (NetPlan)",
    description: "Le switch et le port où il a été vu.",
  },
  {
    name: "netplan_last_seen",
    type: "datetime",
    label: "Vu le (NetPlan)",
    description: "La dernière fois que le réseau l'a vu.",
  },
] as const;

export type PushFieldName = (typeof PUSH_FIELDS)[number]["name"];

/** The `custom_fields` of the PATCH; NetBox takes whole seconds. */
export const customFields = (
  values: PushedValues,
): Record<PushFieldName, string | null> => ({
  netplan_site: values.site,
  netplan_floor: values.floor,
  netplan_socket: values.socket,
  netplan_switch_port: values.switchPort,
  netplan_last_seen: new Date(values.lastSeen)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z"),
});

/** PATCHes one run sends at most; the next cycle's run sends the rest. */
export const MAX_PUSHES_PER_RUN = 100;

/** How old a last-seen time sent for an online device may grow. */
export const LAST_SEEN_REFRESH_MS = 6 * 60 * 60_000;

const sameLocation = (a: PushedValues, b: PushedValues) =>
  a.site === b.site &&
  a.floor === b.floor &&
  a.socket === b.socket &&
  a.switchPort === b.switchPort;

/**
 * Whether NetBox should be sent `values`. A new location goes at once. The
 * last-seen time alone goes when the device is offline, the moment it was
 * last seen, or once the one sent is six hours old: an online device seen
 * every five minutes would otherwise add a changelog entry each cycle.
 */
export const pushDue = (
  values: PushedValues,
  sent: { values: PushedValues; at: number } | null,
  offline: boolean,
  now: number,
): boolean => {
  if (!sent || !sameLocation(values, sent.values)) return true;
  if (values.lastSeen === sent.values.lastSeen) return false;
  return offline || now - sent.at >= LAST_SEEN_REFRESH_MS;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** When a refused device is tried again: one minute, doubling to one hour. */
export const pushRetryAt = (failures: number, now: number): number =>
  now + Math.min(MINUTE * 2 ** Math.max(failures - 1, 0), HOUR);
