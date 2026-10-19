// Requests to NetBox and LibreNMS retry what is likely to pass a moment later
// (a timeout, a refused connection, a 5xx) with a growing pause, and nothing
// else: a 4xx is an answer. The body is read inside the attempt, so a
// connection that stalls or drops after the headers is retried too.

/** How a request reaches a source; `fetch`, unless the source says otherwise. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// Looked up at each call, so a test's replacement of `fetch` applies.
export const defaultFetch: Fetch = (url, init) => fetch(url, init);

export type RetryOptions = {
  attempts: number;
  timeoutMs: number;
  /** The first pause; each next one doubles, up to `maxDelayMs`. */
  initialDelayMs: number;
  maxDelayMs: number;
  /** Replaced in tests, which never wait. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Asked before each attempt, the first included: `false` stops with
   * `RetryStopped` rather than send something nobody wants sent any more.
   */
  stillWanted?: () => Promise<boolean>;
};

export class RetryStopped extends Error {
  constructor() {
    super("The request was no longer wanted.");
    this.name = "RetryStopped";
  }
}

export const SOURCE_RETRY: RetryOptions = {
  attempts: 5,
  timeoutMs: 30_000,
  initialDelayMs: 2_000,
  maxDelayMs: 30_000,
};

export const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Statuses whose response cannot carry a body.
const NULL_BODY = new Set([101, 204, 205, 304]);

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions,
  send: Fetch = defaultFetch,
): Promise<Response> {
  const sleep = options.sleep ?? pause;
  let delay = options.initialDelayMs;
  for (let attempt = 1; ; attempt += 1) {
    const last = attempt >= options.attempts;
    if (options.stillWanted && !(await options.stillWanted())) {
      throw new RetryStopped();
    }
    try {
      const response = await send(url, {
        ...init,
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (response.status < 500 || last) {
        const body = await response.arrayBuffer();
        return new Response(NULL_BODY.has(response.status) ? null : body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      await response.body?.cancel();
    } catch (error) {
      if (last) throw error;
    }
    await sleep(delay);
    delay = Math.min(delay * 2, options.maxDelayMs);
  }
}
