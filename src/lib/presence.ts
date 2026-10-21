import type { FloorId } from "@/types/map";

/** A presence row as returned by `api.presences.list`, one per open page. */
export interface RawPresence {
  clientId: string;
  userId: string;
  displayName: string;
  colorHue: number;
  floorId: string;
  /** When the page last arrived on its floor or was brought back to view. */
  activeAt: number;
  /** Its last heartbeat. */
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
 * Collapse raw presences to one live entry per user: among the pages whose
 * heartbeat is newer than `now - staleAfterMs`, the one the user was active
 * on last. When this page is on a floor, the user's entry is this page's, so
 * it follows the current floor without waiting for a round-trip.
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
    if (current && current.activeAt >= presence.activeAt) continue;
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
      activeAt: now,
      updatedAt: now,
      isSelf: true,
    });
  }

  return Array.from(byUser.values());
}

/**
 * The other users in a place, alphabetically: the signed-in user already
 * knows where they are, and the current floor is highlighted.
 */
export function othersOn(
  presences: ReadonlyArray<ActivePresence>,
  isHere: (presence: ActivePresence) => boolean,
): Array<ActivePresence> {
  return presences
    .filter((presence) => !presence.isSelf && isHere(presence))
    .toSorted((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
}
