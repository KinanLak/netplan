import type { Device } from "@/types/map";

type Searchable = Pick<
  Device,
  "name" | "hostname" | "ip" | "serial" | "model" | "macs"
>;

/** Whether a device answers a search, MACs matched in any notation. */
export function matchesDeviceSearch(device: Searchable, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const text = [
    device.name,
    device.hostname,
    device.ip,
    device.serial,
    device.model,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  if (text.includes(needle)) return true;
  const hex = needle.replaceAll(/[\s:.-]/g, "");
  return (
    hex !== "" &&
    device.macs.some((mac) => mac.replaceAll(":", "").includes(hex))
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
