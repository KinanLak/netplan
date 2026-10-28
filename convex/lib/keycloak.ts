// Keycloak sign-in (ADR 0004, ADR 0021): when it is on, and which Netplan
// role a Keycloak login gets.
import type { Role } from "./roles";

export type KeycloakConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
};

/** Keycloak sign-in is on only when the issuer and client are all set. */
export function readKeycloakConfig(
  env: Readonly<Record<string, string | undefined>>,
): KeycloakConfig | null {
  const issuer = env.KEYCLOAK_ISSUER?.trim().replace(/\/+$/, "");
  const clientId = env.KEYCLOAK_CLIENT_ID?.trim();
  const clientSecret = env.KEYCLOAK_CLIENT_SECRET?.trim();
  if (!issuer || !clientId || !clientSecret) return null;
  return { issuer, clientId, clientSecret };
}

/**
 * The Keycloak role names an admin chose, null granting nothing, and
 * whether a group of that name counts as well (ADR 0036).
 */
export type KeycloakRoleMapping = {
  editorRole: string | null;
  adminRole: string | null;
  acceptGroups: boolean;
};

function jwtClaims(token: string | null | undefined): Record<string, unknown> {
  const payload = token?.split(".")[1];
  if (!payload) return {};
  try {
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return claims !== null && typeof claims === "object"
      ? (claims as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringsAt(value: unknown, path: ReadonlyArray<string>): Array<string> {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return [];
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current)
    ? current.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * The names a Keycloak user carries that may grant a role: realm roles and
 * this client's roles, plus groups when the admin accepts them (ADR 0036).
 * A group is often creatable by people who cannot manage roles, and the
 * flat `roles` claim a mapper adds can carry anything, so neither counts by
 * default. The signatures are not checked: Netplan received these tokens
 * from the token endpoint itself, over the connection it opened.
 */
export function keycloakRoleNames(
  tokens: { accessToken?: string | null; idToken?: string | null },
  clientId: string,
  { acceptGroups }: { acceptGroups: boolean },
): Set<string> {
  const names = new Set<string>();
  for (const claims of [
    jwtClaims(tokens.accessToken),
    jwtClaims(tokens.idToken),
  ]) {
    for (const name of [
      ...stringsAt(claims, ["realm_access", "roles"]),
      ...stringsAt(claims, ["resource_access", clientId, "roles"]),
    ]) {
      names.add(name);
    }
    if (!acceptGroups) continue;
    for (const name of stringsAt(claims, ["groups"])) {
      names.add(name);
      // Keycloak's group mapper writes full paths ("/netplan-admins").
      if (name.startsWith("/")) names.add(name.slice(1));
    }
  }
  return names;
}

/** ADR 0004: Admin wins over Éditeur, and no recognised name is Lecteur. */
export function roleFromKeycloak(
  names: ReadonlySet<string>,
  mapping: KeycloakRoleMapping,
): Role {
  if (mapping.adminRole && names.has(mapping.adminRole)) return "admin";
  if (mapping.editorRole && names.has(mapping.editorRole)) return "editor";
  return "reader";
}

/** What an admin typed for a role name; blank means none. */
export function roleNameOrNull(value: string | null): string | null {
  const name = value?.trim();
  return name ? name : null;
}

/** What Keycloak's token endpoint made of a stored refresh token. */
export type KeycloakRefresh =
  | {
      kind: "tokens";
      accessToken: string;
      refreshToken: string | null;
      idToken: string | null;
      accessTokenExpiresAt: number | null;
      refreshTokenExpiresAt: number | null;
    }
  /** Keycloak no longer vouches for that login (ADR 0036). */
  | { kind: "revoked" }
  /** Unreachable or answering something else: nothing can be concluded. */
  | { kind: "unavailable" };

const REFRESH_TIMEOUT_MS = 10_000;

/**
 * Trades a stored refresh token for new tokens. Only `invalid_grant` means
 * the login is over: the user was disabled or deleted, or the session was
 * revoked or idled out. A wrong client secret or an outage says nothing
 * about the user.
 */
export async function refreshKeycloakTokens(
  config: KeycloakConfig,
  refreshToken: string,
  now = Date.now(),
): Promise<KeycloakRefresh> {
  let response: Response;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), REFRESH_TIMEOUT_MS);
  try {
    response = await fetch(`${config.issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      redirect: "error",
      signal: abort.signal,
    });
  } catch {
    clearTimeout(timer);
    return { kind: "unavailable" };
  }
  const body: unknown = await response.json().catch(() => null);
  clearTimeout(timer);
  const field = (name: string): unknown =>
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)[name]
      : undefined;
  if (!response.ok) {
    return response.status === 400 && field("error") === "invalid_grant"
      ? { kind: "revoked" }
      : { kind: "unavailable" };
  }
  const accessToken = field("access_token");
  if (typeof accessToken !== "string") return { kind: "unavailable" };
  const text = (name: string) => {
    const value = field(name);
    return typeof value === "string" ? value : null;
  };
  // Keycloak says 0 for a refresh token that never expires on its own.
  const expiry = (name: string) => {
    const seconds = field(name);
    return typeof seconds === "number" && seconds > 0
      ? now + seconds * 1000
      : null;
  };
  return {
    kind: "tokens",
    accessToken,
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: expiry("expires_in"),
    refreshTokenExpiresAt: expiry("refresh_expires_in"),
  };
}
