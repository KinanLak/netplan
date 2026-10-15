import { afterEach, describe, expect, it } from "bun:test";
import { stubFetch } from "../_test/fetch";
import { fetchWithRetry } from "./httpRetry";

const pauses: Array<number> = [];
const options = {
  attempts: 4,
  timeoutMs: 1_000,
  initialDelayMs: 2_000,
  maxDelayMs: 5_000,
  sleep: (ms: number) => {
    pauses.push(ms);
    return Promise.resolve();
  },
};

let stub: ReturnType<typeof stubFetch> | null = null;
const answers = (...steps: Array<number | Error>) => {
  stub = stubFetch(
    ...steps.map((step) =>
      step instanceof Error ? step : () => new Response("{}", { status: step }),
    ),
  );
  return stub.calls;
};

afterEach(() => {
  pauses.length = 0;
  stub?.restore();
  stub = null;
});

describe("fetchWithRetry", () => {
  it("retries timeouts and 5xx with a doubling pause, up to the cap", async () => {
    const calls = answers(
      new DOMException("timed out", "TimeoutError"),
      503,
      502,
      200,
    );
    const response = await fetchWithRetry("https://x.test", {}, options);

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(4);
    expect(pauses).toEqual([2_000, 4_000, 5_000]);
  });

  it("returns a 4xx at once", async () => {
    answers(403);
    expect((await fetchWithRetry("https://x.test", {}, options)).status).toBe(
      403,
    );
    expect(pauses).toEqual([]);
  });

  it("gives the last answer or error once the attempts run out", async () => {
    answers(500, 500, 500, 500);
    expect((await fetchWithRetry("https://x.test", {}, options)).status).toBe(
      500,
    );

    answers(...Array.from({ length: 4 }, () => new TypeError("refused")));
    await expect(fetchWithRetry("https://x.test", {}, options)).rejects.toThrow(
      "refused",
    );
  });
});
