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
