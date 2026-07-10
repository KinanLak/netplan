import type { FloorId } from "@/types/map";

/** A presence row as returned by `api.presences.list`. */
export interface RawPresence {
  sessionId: string;
  clientId: string;
  displayName: string;
  colorHue: number;
  floorId: string;
  updatedAt: number;
}

/** A live presence, deduped by client and flagged when it is the local user. */
export interface ActivePresence extends RawPresence {
  isSelf: boolean;
}

/** The local user, used to inject a fresh self entry into the live list. */
export interface SelfPresence {
  sessionId: string;
  clientId: string;
  displayName: string;
  colorHue: number;
  floorId: FloorId | null;
}

export const PRESENCE_STALE_AFTER_MS = 5_000;

/**
 * Collapse raw presences to one live entry per client, dropping rows older than
 * `now - staleAfterMs`. When `self` is on a floor we override its row with fresh
 * data so the local user always reflects its current floor without waiting for
 * the next heartbeat round-trip.
 */
export function activePresences(
  presences: ReadonlyArray<RawPresence>,
  self: SelfPresence | null,
  now: number,
  staleAfterMs: number = PRESENCE_STALE_AFTER_MS,
): Array<ActivePresence> {
  const cutoff = now - staleAfterMs;
  const byClient = new Map<string, ActivePresence>();

  for (const presence of presences) {
    if (presence.updatedAt < cutoff) continue;
    const current = byClient.get(presence.clientId);
    if (current && current.updatedAt >= presence.updatedAt) continue;
    byClient.set(presence.clientId, {
      ...presence,
      isSelf: self?.clientId === presence.clientId,
    });
  }

  if (self && self.floorId) {
    byClient.set(self.clientId, {
      sessionId: self.sessionId,
      clientId: self.clientId,
      displayName: self.displayName,
      colorHue: self.colorHue,
      floorId: self.floorId,
      updatedAt: now,
      isSelf: true,
    });
  }

  return Array.from(byClient.values());
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
