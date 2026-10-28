import type { ConnectionState } from "convex/browser";

/** A drop shorter than this, as when the socket reconnects, shows nothing. */
export const OFFLINE_LINE_DELAY_MS = 2_000;
/** How long a first connection may take before the page says it failed. */
export const FIRST_CONNECTION_MS = 5_000;

/** The connection as the shell tracks it (ADR 0034). */
export interface ConnectionClock {
  state: ConnectionState;
  /** `navigator.onLine`: false says for sure the browser has no network. */
  online: boolean;
  /** When the connection last went up or down, or when the page opened. */
  since: number;
  now: number;
}

/**
 * Up when Convex's socket is open and the browser has a network: the socket
 * can take a minute to notice a lost network, and a half-open link (a VPN, a
 * dropped uplink) never closes it. The map is editable only while up.
 */
export const isUp = (clock: ConnectionClock) =>
  clock.state.isWebSocketConnected && clock.online;

/** `since` restarts only when the connection goes up or down. */
export function advanceClock(
  current: ConnectionClock,
  patch: Partial<Pick<ConnectionClock, "state" | "online">>,
  now: number,
): ConnectionClock {
  const next = { ...current, ...patch, now };
  return isUp(next) === isUp(current) ? next : { ...next, since: now };
}

/**
 * Whether the page says it is offline, and in how many milliseconds that
 * changes if nothing else does. It waits a moment, so a socket that
 * reconnects at once shows nothing, and longer for the first connection.
 */
export function offlineLine(clock: ConnectionClock): {
  shown: boolean;
  changesIn: number | null;
} {
  if (isUp(clock)) return { shown: false, changesIn: null };
  const delay = clock.state.hasEverConnected
    ? OFFLINE_LINE_DELAY_MS
    : FIRST_CONNECTION_MS;
  const elapsed = clock.now - clock.since;
  return elapsed < delay
    ? { shown: false, changesIn: delay - elapsed }
    : { shown: true, changesIn: null };
}
