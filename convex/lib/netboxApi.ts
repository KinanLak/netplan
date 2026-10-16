// Reads from the NetBox REST API. Lists are read page by page with offsets
// rather than by following `next`, whose address NetBox builds from the
// request's headers and could point the token elsewhere behind a proxy.
import { sourceGet } from "./integrationProbe";
import type { RetryOptions } from "./httpRetry";

const PAGE = 1000;
// A safety stop well above any site: 200 000 objects.
const MAX_PAGES = 200;

export type NetBoxObject = Record<string, unknown>;

const NOT_NETBOX = "Cette adresse ne répond pas comme NetBox.";

const isObject = (value: unknown): value is NetBoxObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every object of a list endpoint, or the French reason it failed. */
export async function netboxList(
  baseUrl: string,
  token: string,
  path: string,
  retry: RetryOptions,
): Promise<
  { ok: true; items: Array<NetBoxObject> } | { ok: false; message: string }
> {
  const items: Array<NetBoxObject> = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await sourceGet(
      "netbox",
      baseUrl,
      `${path}${separator}limit=${PAGE}&offset=${items.length}`,
      token,
      retry,
    );
    if (!answer.ok) return answer;
    const { body } = answer;
    if (!isObject(body) || !Array.isArray(body.results)) {
      return { ok: false, message: NOT_NETBOX };
    }
    const results = body.results.filter(isObject);
    items.push(...results);
    const count = typeof body.count === "number" ? body.count : items.length;
    if (results.length === 0 || items.length >= count) {
      return { ok: true, items };
    }
  }
  return { ok: false, message: "NetBox renvoie trop d'objets." };
}

export const idOf = (item: NetBoxObject): number | null =>
  typeof item.id === "number" && Number.isSafeInteger(item.id) ? item.id : null;

export const nameOf = (item: NetBoxObject): string =>
  typeof item.name === "string" && item.name
    ? item.name
    : typeof item.display === "string"
      ? item.display
      : String(item.id);
