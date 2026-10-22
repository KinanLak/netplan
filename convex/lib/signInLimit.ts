/** Sign-in attempts one identifier may make per window (ADR 0031). */
export const SIGN_IN_ATTEMPTS = 5;
export const SIGN_IN_WINDOW_MS = 60_000;

export type AttemptWindow = { windowStart: number; count: number };

/**
 * Counts one attempt against an identifier's window: a fixed window that
 * starts at its first attempt. `next` is what to store; a refused attempt
 * leaves the window as it was, so retrying does not push the end back.
 */
export function countAttempt(
  current: AttemptWindow | null,
  now: number,
): { allowed: boolean; next: AttemptWindow } {
  if (!current || now - current.windowStart >= SIGN_IN_WINDOW_MS) {
    return { allowed: true, next: { windowStart: now, count: 1 } };
  }
  if (current.count >= SIGN_IN_ATTEMPTS) {
    return { allowed: false, next: current };
  }
  return { allowed: true, next: { ...current, count: current.count + 1 } };
}

/** The same account whatever the case or spaces it is typed with. */
export const normalizeIdentifier = (identifier: string) =>
  identifier.trim().toLowerCase();
