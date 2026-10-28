/**
 * What asking the app's server for a Convex token can answer: a token, no
 * session (signed out, expired, disabled), or nothing usable this time, when
 * the server or the backend behind it cannot be reached.
 */
export type TokenAnswer =
  | { kind: "token"; token: string }
  | { kind: "signedOut" }
  | { kind: "unreachable" };

/**
 * Reads the auth client's reply to `/convex/token`. Only a refusal of the
 * session counts as signed out: the app's server answers 5xx when Convex is
 * down behind it, and the request rejects when the server itself is.
 */
export function tokenAnswer(reply: {
  data?: { token?: string | null } | null;
  error?: { status?: number } | null;
}): TokenAnswer {
  const token = reply.data?.token;
  if (token) return { kind: "token", token };
  const status = reply.error?.status;
  return status === 401 || status === 403
    ? { kind: "signedOut" }
    : { kind: "unreachable" };
}

export interface SessionTokens {
  /** Whether the page loaded with a session; fixed for the page's life. */
  readonly signedIn: boolean;
  /** Convex's `fetchAccessToken`: one function for the page's life. */
  readonly fetchAccessToken: (args?: {
    forceRefreshToken?: boolean;
  }) => Promise<string | null>;
}

const FIRST_RETRY_MS = 1_000;
// Short: when the backend returns, a token refresh that failed meanwhile
// holds the socket, and with it the queued edits, until its next try.
const MAX_RETRY_MS = 5_000;

/** Waits `ms`, or less when the browser gets its network back. */
const waitOrOnline = (ms: number) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    window.addEventListener("online", done);
  });

/**
 * The Convex token of a page's session (ADR 0034).
 *
 * Convex re-authenticates whenever `fetchAccessToken` changes or returns
 * null: it drops the identity, then sends the new one. Queries evaluated in
 * between run signed out and fail as a lost session, and a mutation queued
 * during an outage is sent without identity and refused. So the function
 * never changes, and it answers null only when the server says the session
 * is gone. While the server cannot be reached it keeps asking, so a token
 * refresh that falls during an outage waits for the server instead of
 * signing the page out.
 */
export function createSessionTokens({
  initialToken,
  requestToken,
  wait = waitOrOnline,
}: {
  initialToken: string | null;
  requestToken: () => Promise<TokenAnswer>;
  wait?: (ms: number) => Promise<void>;
}): SessionTokens {
  let cached = initialToken;
  let pending: Promise<string | null> | null = null;

  const fetchFresh = async () => {
    let delay = FIRST_RETRY_MS;
    let answer = await requestToken();
    while (answer.kind === "unreachable") {
      await wait(delay);
      delay = Math.min(delay * 2, MAX_RETRY_MS);
      answer = await requestToken();
    }
    return answer.kind === "token" ? answer.token : null;
  };

  return {
    signedIn: initialToken !== null,
    fetchAccessToken: ({ forceRefreshToken = false } = {}) => {
      if (cached && !forceRefreshToken) return Promise.resolve(cached);
      pending ??= fetchFresh()
        .then((token) => (cached = token))
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
