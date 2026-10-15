import { ConvexError } from "convex/values";

/**
 * Where to go after signing in: only a path on this site, so a crafted link
 * cannot send a user elsewhere once they have typed their password.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  // Checked as the browser parses it: it drops tabs and newlines and reads a
  // backslash as a slash, so `/\t/evil.example` would leave the site.
  const url = new URL(value, LOCAL_ORIGIN);
  if (url.origin !== LOCAL_ORIGIN) return undefined;
  // Normalizing can itself make a host: `/a/..//evil.example` becomes
  // `//evil.example`.
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith("//") ? undefined : path;
}

const LOCAL_ORIGIN = "http://netplan.invalid";

/** An email signs in by email; anything else is a username. */
export function isEmail(identifier: string): boolean {
  return identifier.includes("@");
}

type AuthFailure = { status?: number; code?: string };

/**
 * The failure of an auth client request, or null once it succeeded. The client
 * rejects when the connection drops instead of returning an `error`, which
 * would leave a form pending with no message, so that counts as a failure too.
 */
export async function requestFailure<E extends AuthFailure>(
  request: Promise<{ error: E | null }>,
): Promise<E | AuthFailure | null> {
  try {
    return (await request).error;
  } catch {
    return { status: 0 };
  }
}

export function loginErrorMessage(error: {
  status?: number;
  code?: string;
}): string {
  if (error.status === 429) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  if (error.code === "BANNED_USER") {
    return "Ce compte est désactivé. Contactez un administrateur.";
  }
  if (
    error.code === "INVALID_EMAIL_OR_PASSWORD" ||
    error.code === "INVALID_USERNAME_OR_PASSWORD"
  ) {
    return "Identifiant ou mot de passe incorrect.";
  }
  return "La connexion a échoué. Réessayez.";
}

/**
 * The `error` a failed Keycloak sign-in brings back to the login page: a
 * better-auth code, or the provider's own such as `access_denied`.
 */
export function keycloakErrorMessage(code: string): string {
  if (code === "account_not_linked") {
    return "Un compte Netplan utilise déjà l'adresse e-mail de ce compte Keycloak. Connectez-vous avec son identifiant et son mot de passe.";
  }
  if (code === "BANNED_USER") {
    return loginErrorMessage({ code });
  }
  if (code === "access_denied") {
    return "La connexion avec Keycloak a été annulée.";
  }
  return "La connexion avec Keycloak a échoué. Réessayez ou contactez un administrateur.";
}

/** better-auth's default, which Netplan keeps. */
export const MIN_PASSWORD_LENGTH = 8;

export function forgotPasswordErrorMessage(error: { status?: number }): string {
  if (error.status === 429) {
    return "Trop de demandes. Réessayez dans quelques minutes.";
  }
  return "La demande a échoué. Réessayez.";
}

export function resetPasswordErrorMessage(error: {
  status?: number;
  code?: string;
}): string {
  if (error.status === 429) {
    return "Trop de tentatives. Réessayez dans quelques minutes.";
  }
  if (error.code === "PASSWORD_TOO_SHORT") {
    return `Le mot de passe doit compter au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (error.code === "PASSWORD_TOO_LONG") {
    return "Ce mot de passe est trop long.";
  }
  return "Le mot de passe n'a pas pu être enregistré. Réessayez.";
}

/**
 * The error a Convex function throws once the session behind a still-valid
 * token is gone: signed out elsewhere, expired or disabled.
 */
export function isSessionLost(error: unknown): boolean {
  return authErrorCode(error) === "unauthenticated";
}

/** The error a Convex function throws when the caller's role is too low. */
export function isForbidden(error: unknown): boolean {
  return authErrorCode(error) === "forbidden";
}

function authErrorCode(error: unknown): unknown {
  return error instanceof ConvexError
    ? (error.data as { code?: unknown } | null)?.code
    : undefined;
}
