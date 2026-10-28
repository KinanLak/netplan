// The location push to NetBox (ADR 0027, ADR 0040): the custom fields
// Netplan writes on a NetBox device, what they hold, and when a value is worth
// a PATCH: only when the location changes.
// Convex bundles this file, so relative imports only.

/** Where the network last saw a device, as the push writes it. */
export type PushedValues = {
  site: string;
  /** Building and floor of the socket, when the port reaches one on a floor. */
  floor: string | null;
  socket: string | null;
  switchPort: string;
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
): PushedValues => ({
  site: siteName,
  floor:
    [place.buildingName, place.floorName].filter(Boolean).join(" · ") || null,
  socket: place.socketName ?? null,
  switchPort: `${place.switchName} · ${place.portName}`,
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
    name: "netplan_updated",
    type: "datetime",
    label: "Modifié par NetPlan le",
    description:
      "Quand NetPlan a écrit ces champs, la dernière fois que le lieu a changé.",
  },
] as const;

export type PushFieldName = (typeof PUSH_FIELDS)[number]["name"];

/**
 * The `custom_fields` of the PATCH a new location sends, stamped with when it
 * was sent; NetBox takes whole seconds. The stamp never goes alone.
 */
export const customFields = (
  values: PushedValues,
  sentAt: number,
): Record<PushFieldName, string | null> => ({
  netplan_site: values.site,
  netplan_floor: values.floor,
  netplan_socket: values.socket,
  netplan_switch_port: values.switchPort,
  netplan_updated: new Date(sentAt).toISOString().replace(/\.\d{3}Z$/, "Z"),
});

/** PATCHes one run sends at most; the next cycle's run sends the rest. */
export const MAX_PUSHES_PER_RUN = 100;

const sameLocation = (a: PushedValues, b: PushedValues) =>
  a.site === b.site &&
  a.floor === b.floor &&
  a.socket === b.socket &&
  a.switchPort === b.switchPort;

/**
 * Whether NetBox should be sent `values`: only a location it has not been
 * sent, so NetBox's changelog records moves and nothing else (ADR 0040).
 */
export const pushDue = (
  values: PushedValues,
  sent: PushedValues | null,
): boolean => !sent || !sameLocation(values, sent);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** When a refused device is tried again: one minute, doubling to one hour. */
export const pushRetryAt = (failures: number, now: number): number =>
  now + Math.min(MINUTE * 2 ** Math.max(failures - 1, 0), HOUR);
