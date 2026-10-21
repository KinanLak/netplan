/** Editing goes on this long after the connection drops (ADR 0031). */
export const OFFLINE_GRACE_MS = 30_000;
/** A drop shorter than this, as when the socket reconnects, shows nothing. */
export const BANNER_DELAY_MS = 2_000;
/** How long a first connection may take before the page says it failed. */
export const FIRST_CONNECTION_MS = 5_000;

export type ConnectionPhase =
  /** Connected, or not for long enough to say anything. */
  | "connected"
  /** Never connected since the page opened. */
  | "unreachable"
  /** Lost, and edits still queue. */
  | "grace"
  /** Lost for longer than the grace: the map is read-only. */
  | "frozen";

/**
 * What the shell shows for the connection to Convex, and in how many
 * milliseconds that changes if nothing else does. `since` is when the
 * connection last changed, or when the page opened.
 */
export function connectionPhase({
  connected,
  hasEverConnected,
  since,
  now,
}: {
  connected: boolean;
  hasEverConnected: boolean;
  since: number;
  now: number;
}): { phase: ConnectionPhase; changesIn: number | null } {
  if (connected) return { phase: "connected", changesIn: null };
  const elapsed = now - since;
  if (!hasEverConnected) {
    return elapsed < FIRST_CONNECTION_MS
      ? { phase: "connected", changesIn: FIRST_CONNECTION_MS - elapsed }
      : { phase: "unreachable", changesIn: null };
  }
  if (elapsed < BANNER_DELAY_MS) {
    return { phase: "connected", changesIn: BANNER_DELAY_MS - elapsed };
  }
  if (elapsed < OFFLINE_GRACE_MS) {
    return { phase: "grace", changesIn: OFFLINE_GRACE_MS - elapsed };
  }
  return { phase: "frozen", changesIn: null };
}
