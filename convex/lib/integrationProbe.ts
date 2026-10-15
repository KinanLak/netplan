// "Tester la connexion": one authenticated read from the tool, answered in
// French for the admin. The token never appears in a message.
import { fetchWithRetry } from "./httpRetry";
import type { RetryOptions } from "./httpRetry";
import { INTEGRATION_LABELS } from "../../src/sites/integrations";
import type { IntegrationKind } from "../../src/sites/integrations";

export type ConnectionCheck = { ok: boolean; message: string };

// An admin is waiting on the answer: fewer and shorter tries than a cycle.
export const PROBE_RETRY: RetryOptions = {
  attempts: 3,
  timeoutMs: 15_000,
  initialDelayMs: 1_000,
  maxDelayMs: 4_000,
};

/** The headers that authenticate a request to the tool. */
export const authHeaders = (
  kind: IntegrationKind,
  token: string,
): Record<string, string> => ({
  Accept: "application/json",
  "User-Agent": "Netplan",
  ...(kind === "netbox"
    ? { Authorization: netboxAuthorization(token) }
    : { "X-Auth-Token": token }),
});

// NetBox 4.5 added v2 tokens, `nbt_<key>.<token>`, sent as a bearer; the
// older ones keep the `Token` scheme.
const netboxAuthorization = (token: string) =>
  token.startsWith("nbt_") ? `Bearer ${token}` : `Token ${token}`;

const PROBE_PATH: Record<IntegrationKind, string> = {
  netbox: "/api/status/",
  librenms: "/api/v0/system",
};

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;

const versionOf = (kind: IntegrationKind, body: unknown): string | null => {
  const version =
    kind === "netbox"
      ? field(body, "netbox-version")
      : field(
          (field(body, "system") as Array<unknown> | undefined)?.[0],
          "local_ver",
        );
  return typeof version === "string" && version ? version : null;
};

const failureMessage = (label: string, status: number): string => {
  if (status === 401 || status === 403) {
    return `${label} refuse ce jeton (${status}).`;
  }
  if (status === 404) return `Aucune API ${label} à cette adresse (404).`;
  if (status >= 300 && status < 400) {
    return `L'adresse redirige (${status}) : saisissez l'adresse finale de ${label}.`;
  }
  return `${label} a répondu ${status}.`;
};

export async function probeIntegration(
  kind: IntegrationKind,
  baseUrl: string,
  token: string,
  retry: RetryOptions = PROBE_RETRY,
): Promise<ConnectionCheck> {
  const label = INTEGRATION_LABELS[kind];
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${baseUrl}${PROBE_PATH[kind]}`,
      // A redirect could carry the token to another host.
      { headers: authHeaders(kind, token), redirect: "manual" },
      retry,
    );
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return {
      ok: false,
      message: timedOut
        ? `${label} ne répond pas (délai dépassé).`
        : `${label} est injoignable à cette adresse.`,
    };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return { ok: false, message: failureMessage(label, response.status) };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: `${label} n'a pas répondu en JSON.` };
  }
  const version = versionOf(kind, body);
  if (!version) {
    return {
      ok: false,
      message: `Cette adresse ne répond pas comme ${label}.`,
    };
  }
  return { ok: true, message: `Connexion réussie : ${label} ${version}.` };
}
