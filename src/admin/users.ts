// The users page's filters and wording, kept apart from the page so they
// can be tested.
import type { Role } from "../../convex/lib/roles";

export type UserStatus = "active" | "invited" | "disabled";

export interface ListedUser {
  name: string;
  email: string;
  username: string | null;
  role: Role;
  disabled: boolean;
  kind: "local" | "sso" | "invited";
}

export const statusOf = (user: ListedUser): UserStatus =>
  user.disabled ? "disabled" : user.kind === "invited" ? "invited" : "active";

export interface UserFilter {
  search: string;
  role: Role | "all";
  status: UserStatus | "all";
}

export const NO_FILTER: UserFilter = { search: "", role: "all", status: "all" };

// Accents and case never decide a match: « eleonore » finds « Éléonore ».
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");

export function matchesFilter(user: ListedUser, filter: UserFilter): boolean {
  if (filter.role !== "all" && user.role !== filter.role) return false;
  if (filter.status !== "all" && statusOf(user) !== filter.status) {
    return false;
  }
  const words = fold(filter.search).split(/\s+/).filter(Boolean);
  const haystack = fold([user.name, user.email, user.username ?? ""].join(" "));
  return words.every((word) => haystack.includes(word));
}

/** A page with a heartbeat this recent is still open. */
export const ONLINE_MS = 90_000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long ago, in words that need no time zone. */
export function describeSince(at: number, now: number): string {
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "à l'instant";
  if (elapsed < HOUR) return `il y a ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `il y a ${Math.floor(elapsed / HOUR)} h`;
  const days = Math.floor(elapsed / DAY);
  return days < 31 ? `il y a ${days} j` : "il y a plus d'un mois";
}

/** How long a link stays valid: a fresh seven-day link reads « 7 j ». */
export function describeUntil(at: number, now: number): string {
  const left = Math.max(0, at - now);
  if (left >= DAY) return `${Math.round(left / DAY)} j`;
  if (left >= HOUR) return `${Math.floor(left / HOUR)} h`;
  return `${Math.max(1, Math.floor(left / MINUTE))} min`;
}
