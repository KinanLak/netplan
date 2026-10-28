const FIRST_PROBE_MS = 2_000;
const MAX_PROBE_MS = 30_000;

/**
 * Resolves true once `probe` says the servers answer again, asking after a
 * delay that doubles from 2 s to 30 s; false when cancelled first. `wait`
 * may return early, as when the network comes back.
 */
export async function untilServerAnswers({
  probe,
  wait,
  cancelled,
}: {
  probe: () => Promise<boolean>;
  wait: (ms: number) => Promise<void>;
  cancelled: () => boolean;
}): Promise<boolean> {
  for (
    let delay = FIRST_PROBE_MS;
    ;
    delay = Math.min(delay * 2, MAX_PROBE_MS)
  ) {
    await wait(delay);
    if (cancelled()) return false;
    if (await probe()) return !cancelled();
  }
}
