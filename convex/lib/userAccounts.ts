// How the users page reads and checks better-auth accounts.

/**
 * `local` signs in with a password, `sso` through Keycloak, and `invited`
 * has no way in yet: the invitation link is how it chooses a password.
 */
export type AccountKind = "local" | "sso" | "invited";

export function accountKind(providerIds: ReadonlyArray<string>): AccountKind {
  if (providerIds.includes("credential")) return "local";
  return providerIds.length > 0 ? "sso" : "invited";
}

// better-auth's username plugin defaults, so an invitation never stores a
// username that sign-in would refuse.
const USERNAME = /^[a-zA-Z0-9_.]{3,30}$/;

/** Usernames sign in case-insensitively, as the username plugin stores them. */
export function normalizeUsername(username: string): string {
  return username.toLowerCase();
}

export function invitationError({
  name,
  email,
  username,
}: {
  name: string;
  email: string;
  username?: string;
}): string | null {
  if (!name) return "Indiquez le nom de la personne invitée.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Cette adresse e-mail n'est pas valide.";
  }
  if (username !== undefined && !USERNAME.test(username)) {
    return "L'identifiant compte 3 à 30 caractères : lettres, chiffres, point ou tiret bas.";
  }
  return null;
}

/** The relay's reason, without the frame Convex adds to an action's error. */
export function mailFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const reason = (message.split("Uncaught Error: ").at(-1) ?? message)
    .split("\n")[0]
    .trim();
  return reason.endsWith(".") ? reason : `${reason}.`;
}
