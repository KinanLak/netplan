// How often one identifier may try to sign in or ask for a password reset
// (ADR 0036). Netplan's servers see no client address they can trust, so
// nothing is counted per address and no limit is shared between people.

/** What is being tried: a password, or a reset mail. */
export type AttemptKind = "sign-in" | "password-reset";

/** Attempts in a row that never wait. */
export const FREE_ATTEMPTS = 4;
const FIRST_WAIT_MS = 60_000;
const LONGEST_WAIT_MS = 15 * 60_000;
/** An identifier left alone this long starts again from nothing. */
export const ATTEMPTS_FORGOTTEN_AFTER_MS = 60 * 60_000;

export type AttemptRecord = {
  /** Attempts since the last success, or since the record was forgotten. */
  count: number;
  lastAttemptAt: number;
  /** No attempt counts before then. */
  nextAllowedAt: number;
};

/**
 * The wait the `count`-th attempt in a row imposes before the next one: none
 * for the first four, then a minute from the fifth, doubling up to 15.
 */
export function waitAfter(count: number): number {
  if (count <= FREE_ATTEMPTS) return 0;
  return Math.min(
    FIRST_WAIT_MS * 2 ** (count - FREE_ATTEMPTS - 1),
    LONGEST_WAIT_MS,
  );
}

/**
 * Counts one attempt. A refused attempt leaves the record as it was, so
 * hammering during a wait neither lengthens it nor gets through.
 */
export function countAttempt(
  current: AttemptRecord | null,
  now: number,
):
  | { allowed: true; next: AttemptRecord }
  | { allowed: false; retryAfterMs: number } {
  if (current && now < current.nextAllowedAt) {
    return { allowed: false, retryAfterMs: current.nextAllowedAt - now };
  }
  const count =
    current && now - current.lastAttemptAt < ATTEMPTS_FORGOTTEN_AFTER_MS
      ? current.count + 1
      : 1;
  return {
    allowed: true,
    next: { count, lastAttemptAt: now, nextAllowedAt: now + waitAfter(count) },
  };
}

/** The same account whatever the case or spaces it is typed with. */
export const normalizeIdentifier = (identifier: string) =>
  identifier.trim().toLowerCase();
