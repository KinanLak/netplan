// Searching what a list shows: every word of the query, in any order, without
// accents, MACs in any notation. Imported by `convex/`, so relative imports.
import type { Device } from "../types/map";

type Searchable = Pick<
  Device,
  "name" | "hostname" | "ip" | "serial" | "model" | "macs"
>;

/** Lower case without accents, so « etage » finds « Étage ». */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Whether every word of `query` is in one of `fields` or one of `macs`. */
export function matchesSearch(
  fields: ReadonlyArray<string | null | undefined>,
  macs: ReadonlyArray<string>,
  query: string,
) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold(fields.filter(Boolean).join("\n"));
  const hexes = macs.map((mac) => mac.replaceAll(":", "").toLowerCase());
  return words.every((word) => {
    if (text.includes(word)) return true;
    const hex = word.replaceAll(/[:.-]/g, "");
    return hex !== "" && hexes.some((mac) => mac.includes(hex));
  });
}

/**
 * Whether a device answers a search. `also` holds what a list shows of it
 * besides its identity: its type, its place.
 */
export function matchesDeviceSearch(
  device: Searchable,
  query: string,
  also: ReadonlyArray<string | undefined> = [],
) {
  return matchesSearch(
    [
      device.name,
      device.hostname,
      device.ip,
      device.serial,
      device.model,
      ...also,
    ],
    device.macs,
    query,
  );
}

/** Whether a device's name or hostname holds the query, for the map's find. */
export function matchesDeviceName(
  device: Pick<Device, "name" | "hostname">,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return [device.name, device.hostname].some((value) =>
    value?.toLowerCase().includes(needle),
  );
}

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/**
 * The devices that answer a query, those whose name starts with it first,
 * then by name.
 */
export function rankDeviceMatches<T extends Pick<Device, "name">>(
  devices: ReadonlyArray<T>,
  query: string,
  matches: (device: T, query: string) => boolean,
): Array<T> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const startsWith = (device: T) =>
    device.name.toLowerCase().startsWith(needle) ? 0 : 1;
  return devices
    .filter((device) => matches(device, query))
    .toSorted(
      (a, b) => startsWith(a) - startsWith(b) || byName.compare(a.name, b.name),
    );
}
