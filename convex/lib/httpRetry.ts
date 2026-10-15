// Requests to NetBox and LibreNMS retry what is likely to pass a moment later
// (a timeout, a refused connection, a 5xx) with a growing pause, and nothing
// else: a 4xx is an answer.

export type RetryOptions = {
  attempts: number;
  timeoutMs: number;
  /** The first pause; each next one doubles, up to `maxDelayMs`. */
  initialDelayMs: number;
  maxDelayMs: number;
  /** Replaced in tests, which never wait. */
  sleep?: (ms: number) => Promise<void>;
};

export const SOURCE_RETRY: RetryOptions = {
  attempts: 5,
  timeoutMs: 30_000,
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
};

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions,
): Promise<Response> {
  const sleep = options.sleep ?? pause;
  let delay = options.initialDelayMs;
  for (let attempt = 1; ; attempt += 1) {
    const last = attempt >= options.attempts;
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (response.status < 500 || last) return response;
      await response.body?.cancel();
    } catch (error) {
      if (last) throw error;
    }
    await sleep(delay);
    delay = Math.min(delay * 2, options.maxDelayMs);
  }
}
