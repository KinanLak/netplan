import { ConvexError } from "convex/values";

/**
 * Where to go after signing in: only a path on this site, so a crafted link
 * cannot send a user elsewhere once they have typed their password.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}

/** An email signs in by email; anything else is a username. */
export function isEmail(identifier: string): boolean {
  return identifier.includes("@");
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
 * The error a Convex function throws once the session behind a still-valid
 * token is gone: signed out elsewhere, expired or disabled.
 */
export function isSessionLost(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    (error.data as { code?: unknown } | null)?.code === "unauthenticated"
  );
}
