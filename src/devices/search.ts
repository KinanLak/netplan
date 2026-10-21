import type { Device } from "@/types/map";

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

/**
 * Whether a device answers a search: every word of it, in any order, MACs
 * matched in any notation. `also` holds what a list shows of it besides its
 * identity: its type, its place.
 */
export function matchesDeviceSearch(
  device: Searchable,
  query: string,
  also: ReadonlyArray<string | undefined> = [],
) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = fold(
    [device.name, device.hostname, device.ip, device.serial, device.model]
      .concat(also)
      .filter(Boolean)
      .join("\n"),
  );
  const macs = device.macs.map((mac) => mac.replaceAll(":", ""));
  return words.every((word) => {
    if (text.includes(word)) return true;
    const hex = word.replaceAll(/[:.-]/g, "");
    return hex !== "" && macs.some((mac) => mac.includes(hex));
  });
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
