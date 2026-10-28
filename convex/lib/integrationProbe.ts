// Authenticated reads from a tool, answered in French for the admin, and
// "Tester la connexion" on top of them. The token never appears in a message.
import { certificateRefusal, fetchWithRetry } from "./httpRetry";
import type { Fetch, RetryOptions } from "./httpRetry";
import { INTEGRATION_LABELS } from "../../src/sites/integrations";
import type { IntegrationKind } from "../../src/sites/integrations";

export type ConnectionCheck = { ok: boolean; message: string };

/** One integration's tool, as its requests reach it. */
export type Source = {
  kind: IntegrationKind;
  baseUrl: string;
  token: string;
  fetch: Fetch;
};

/**
 * How a site's requests reach its tools: `lenient`, for an integration that
 * ignores certificate errors, is a Node action's (ADR 0028).
 */
export type Transport = { lenient: Fetch };

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
    return `L'adresse redirige ailleurs (${status}).`;
  }
  return `${label} a répondu ${status}.`;
};

/** Why a request that got no answer failed, in French. */
export const unansweredMessage = (
  kind: IntegrationKind,
  error: unknown,
): string => {
  const label = INTEGRATION_LABELS[kind];
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `${label} ne répond pas (délai dépassé).`;
  }
  const refusal = certificateRefusal(error);
  if (refusal !== null) {
    return `Le certificat TLS de ${label} est refusé (${refusal}).`;
  }
  return `${label} est injoignable à cette adresse.`;
};

export type SourceAnswer =
  | { ok: true; body: unknown }
  /** `status` is set when the tool answered, rather than timed out. */
  | { ok: false; message: string; status?: number };

/**
 * One authenticated JSON read from the tool, with retries, or the French
 * reason it failed.
 */
export async function sourceGet(
  source: Source,
  path: string,
  retry: RetryOptions,
): Promise<SourceAnswer> {
  const label = INTEGRATION_LABELS[source.kind];
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${source.baseUrl}${path}`,
      // A redirect could carry the token to another host.
      { headers: authHeaders(source.kind, source.token), redirect: "manual" },
      retry,
      source.fetch,
    );
  } catch (error) {
    return { ok: false, message: unansweredMessage(source.kind, error) };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return {
      ok: false,
      message: failureMessage(label, response.status),
      status: response.status,
    };
  }
  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, message: `${label} n'a pas répondu en JSON.` };
  }
}

export async function probeIntegration(
  source: Source,
  retry: RetryOptions = PROBE_RETRY,
): Promise<ConnectionCheck> {
  const label = INTEGRATION_LABELS[source.kind];
  const answer = await sourceGet(source, PROBE_PATH[source.kind], retry);
  if (!answer.ok) return { ok: false, message: answer.message };
  const version = versionOf(source.kind, answer.body);
  if (!version) {
    return {
      ok: false,
      message: `Cette adresse ne répond pas comme ${label}.`,
    };
  }
  return { ok: true, message: `Connecté à ${label} ${version}.` };
}
