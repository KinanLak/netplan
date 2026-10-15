// A site's integrations (ADR 0023): the rules the admin form and the server
// share. Imported by `convex/`, so relative imports only.

export const INTEGRATION_KINDS = ["netbox", "librenms"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const INTEGRATION_LABELS: Record<IntegrationKind, string> = {
  netbox: "NetBox",
  librenms: "LibreNMS",
};

export const TOKEN_MAX_LENGTH = 512;

// The API path each tool serves under its base URL. An admin may paste
// either the tool's address or its API's, so both are accepted.
const API_PATHS: Record<IntegrationKind, RegExp> = {
  netbox: /\/api\/?$/,
  librenms: /\/api(\/v0)?\/?$/,
};

/**
 * The base URL an integration is stored with, without its API path or a
 * trailing slash, or a French reason it is refused.
 */
export function normalizeBaseUrl(
  kind: IntegrationKind,
  raw: string,
): { url: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "L'adresse doit être une URL complète (https://…)." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "L'adresse doit commencer par https:// ou http://." };
  }
  // The token goes in a header; a password in the URL would sit in clear in
  // the database.
  if (url.username || url.password) {
    return { error: "L'adresse ne doit pas contenir d'identifiants." };
  }
  if (url.search || url.hash) {
    return { error: "L'adresse ne doit pas contenir de paramètres." };
  }
  const path = url.pathname.replace(API_PATHS[kind], "").replace(/\/+$/, "");
  return { url: `${url.origin}${path}` };
}

/** A French reason the token is refused, or `null`. */
export function tokenError(token: string): string | null {
  if (token.trim() === "") return "Saisissez le jeton.";
  if (token.trim().length > TOKEN_MAX_LENGTH) return "Ce jeton est trop long.";
  if (/\s/.test(token.trim())) return "Un jeton ne contient pas d'espace.";
  return null;
}
