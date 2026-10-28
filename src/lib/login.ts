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

type AuthFailure = { status?: number; code?: string; retryAfter?: number };

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

// An identifier in a format no account can have (a dash, too short, a
// malformed email) is refused before any lookup; it reads like any wrong
// identifier, not like a passing failure to retry.
const WRONG_CREDENTIALS = new Set([
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_USERNAME_OR_PASSWORD",
  "INVALID_USERNAME",
  "USERNAME_TOO_SHORT",
  "USERNAME_TOO_LONG",
  "INVALID_EMAIL",
]);

/**
 * How long the server asks to wait (ADR 0036), in whole minutes: the waits
 * are minutes, and a countdown in seconds would read as a threat.
 */
function waitText(retryAfter: number | undefined): string {
  if (retryAfter === undefined || retryAfter <= 60) return "dans une minute";
  return `dans ${Math.ceil(retryAfter / 60)} minutes`;
}

export function loginErrorMessage(error: AuthFailure): string {
  if (error.status === 429) {
    return `Trop de tentatives. Réessayez ${waitText(error.retryAfter)}.`;
  }
  if (error.code === "BANNED_USER") {
    return "Ce compte est désactivé. Contactez un administrateur.";
  }
  if (error.code !== undefined && WRONG_CREDENTIALS.has(error.code)) {
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
    return "Un compte NetPlan utilise déjà l'adresse e-mail de ce compte Keycloak. Connectez-vous avec son identifiant et son mot de passe.";
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

export function forgotPasswordErrorMessage(error: AuthFailure): string {
  if (error.status === 429) {
    return `Trop de demandes. Réessayez ${waitText(error.retryAfter)}.`;
  }
  return "La demande a échoué. Réessayez.";
}

export function resetPasswordErrorMessage(error: {
  status?: number;
  code?: string;
}): string {
  if (error.status === 429) {
    return "Trop de tentatives. Réessayez dans un instant.";
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

export type SessionLostReason = "expired" | "disabled";

/** Why the session ended, as the server says it; expired when it does not. */
export function sessionLostReason(error: unknown): SessionLostReason {
  const reason =
    error instanceof ConvexError
      ? (error.data as { reason?: unknown } | null)?.reason
      : undefined;
  return reason === "disabled" ? "disabled" : "expired";
}

/** What the sign-in page says above the form after a session ended. */
export const SESSION_LOST_MESSAGES: Record<SessionLostReason, string> = {
  expired: "Votre session a pris fin. Reconnectez-vous pour continuer.",
  disabled: "Ce compte a été désactivé. Contactez un administrateur.",
};

export const isSessionLostReason = (
  value: unknown,
): value is SessionLostReason => value === "expired" || value === "disabled";

/** The error a Convex function throws when the caller's role is too low. */
export function isForbidden(error: unknown): boolean {
  return authErrorCode(error) === "forbidden";
}

function authErrorCode(error: unknown): unknown {
  return error instanceof ConvexError
    ? (error.data as { code?: unknown } | null)?.code
    : undefined;
}
