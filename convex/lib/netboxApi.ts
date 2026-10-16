// Reads from the NetBox REST API. Lists are read page by page with offsets
// rather than by following `next`, whose address NetBox builds from the
// request's headers and could point the token elsewhere behind a proxy.
import { fetchWithRetry, RetryStopped } from "./httpRetry";
import { authHeaders, sourceGet } from "./integrationProbe";
import type { SourceAnswer } from "./integrationProbe";
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

const DETAIL_MAX = 300;

/**
 * What NetBox said about a refused write, flattened: it answers with
 * `detail`, or with the messages of each field it refused.
 */
const refusalDetail = (body: unknown): string => {
  const messages: Array<string> = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") messages.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (isObject(value)) Object.values(value).forEach(walk);
  };
  walk(body);
  const detail = messages.join(" ");
  return detail.length > DETAIL_MAX
    ? `${detail.slice(0, DETAIL_MAX - 1)}…`
    : detail;
};

const refusal = (status: number): string => {
  if (status === 401 || status === 403) {
    return `NetBox refuse ce jeton (${status}) : il doit pouvoir modifier les équipements.`;
  }
  if (status === 404) return "Cet équipement n'existe plus dans NetBox (404).";
  if (status === 400) return "NetBox refuse ces valeurs (400).";
  if (status >= 300 && status < 400) {
    return `L'adresse redirige (${status}) : saisissez l'adresse finale de NetBox.`;
  }
  return `NetBox a répondu ${status}.`;
};

/**
 * One JSON `PATCH` to NetBox, with retries, or the French reason it failed:
 * `status` is set when NetBox answered, with what it said. Throws the
 * `RetryStopped` of a `beforeRetry` that says no.
 */
export async function netboxPatch(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
  retry: RetryOptions,
): Promise<SourceAnswer> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${baseUrl}${path}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders("netbox", token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        // A redirect could carry the token to another host.
        redirect: "manual",
      },
      retry,
    );
  } catch (error) {
    if (error instanceof RetryStopped) throw error;
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return {
      ok: false,
      message: timedOut
        ? "NetBox ne répond pas (délai dépassé)."
        : "NetBox est injoignable à cette adresse.",
    };
  }
  let answer: unknown = null;
  try {
    answer = await response.json();
  } catch {
    // An empty or HTML body: the status says enough.
  }
  if (response.ok) return { ok: true, body: answer };
  // Only a 400 says something the status does not: which field, and why.
  const detail = response.status === 400 ? refusalDetail(answer) : "";
  return {
    ok: false,
    message: [refusal(response.status), detail].filter(Boolean).join(" "),
    status: response.status,
  };
}
