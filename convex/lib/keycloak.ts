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
