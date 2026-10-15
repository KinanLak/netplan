import type { FloorId } from "@/types/map";

/** A presence row as returned by `api.presences.list`, one per user. */
export interface RawPresence {
  clientId: string;
  userId: string;
  displayName: string;
  colorHue: number;
  floorId: string;
  updatedAt: number;
}

/** A live presence, flagged when it is the signed-in user. */
export interface ActivePresence extends RawPresence {
  isSelf: boolean;
}

/** The signed-in user on this page, used to inject a fresh self entry. */
export interface SelfPresence {
  clientId: string;
  userId: string;
  displayName: string;
  colorHue: number;
  floorId: FloorId | null;
}

export const PRESENCE_STALE_AFTER_MS = 5_000;

/**
 * Collapse raw presences to one live entry per user, dropping rows older than
 * `now - staleAfterMs`. When this page is on a floor, the user's entry is
 * replaced with this page's, so it follows the current floor without waiting
 * for a heartbeat round-trip, even if another of their tabs spoke last.
 */
export function activePresences(
  presences: ReadonlyArray<RawPresence>,
  self: SelfPresence | null,
  now: number,
  staleAfterMs: number = PRESENCE_STALE_AFTER_MS,
): Array<ActivePresence> {
  const cutoff = now - staleAfterMs;
  const byUser = new Map<string, ActivePresence>();

  for (const presence of presences) {
    if (presence.updatedAt < cutoff) continue;
    const current = byUser.get(presence.userId);
    if (current && current.updatedAt >= presence.updatedAt) continue;
    byUser.set(presence.userId, {
      ...presence,
      isSelf: self?.userId === presence.userId,
    });
  }

  if (self && self.floorId) {
    byUser.set(self.userId, {
      clientId: self.clientId,
      userId: self.userId,
      displayName: self.displayName,
      colorHue: self.colorHue,
      floorId: self.floorId,
      updatedAt: now,
      isSelf: true,
    });
  }

  return Array.from(byUser.values());
}

/** Self first, then alphabetically by display name. */
export function sortPresences(
  presences: ReadonlyArray<ActivePresence>,
): Array<ActivePresence> {
  return [...presences].toSorted((a, b) => {
    if (a.isSelf) return -1;
    if (b.isSelf) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}
