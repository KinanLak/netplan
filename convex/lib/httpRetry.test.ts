import { afterEach, describe, expect, it } from "bun:test";
import { stubFetch } from "../_test/fetch";
import { certificateRefusal, fetchWithRetry, RetryStopped } from "./httpRetry";

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

  it("retries a body that breaks off after the headers", async () => {
    stub = stubFetch(
      () =>
        new Response(
          new ReadableStream({
            start: (controller) =>
              controller.error(new TypeError("terminated")),
          }),
        ),
      () => new Response('{"ok":true}'),
    );
    const response = await fetchWithRetry("https://x.test", {}, options);

    expect(await response.json()).toEqual({ ok: true });
    expect(stub.calls).toHaveLength(2);
    expect(pauses).toEqual([2_000]);
  });

  it("stops before a retry nobody wants any more", async () => {
    const calls = answers(503, 200);
    let wanted = true;
    const stopping = {
      ...options,
      sleep: () => {
        wanted = false;
        return Promise.resolve();
      },
      stillWanted: () => Promise.resolve(wanted),
    };
    const stopped = await fetchWithRetry("https://x.test", {}, stopping).catch(
      (error: unknown) => error,
    );
    expect(stopped).toBeInstanceOf(RetryStopped);
    expect(calls).toHaveLength(1);
  });

  it("sends nothing nobody wants any more", async () => {
    const calls = answers(200);
    const stopped = await fetchWithRetry(
      "https://x.test",
      {},
      { ...options, stillWanted: () => Promise.resolve(false) },
    ).catch((error: unknown) => error);
    expect(stopped).toBeInstanceOf(RetryStopped);
    expect(calls).toHaveLength(0);
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

  // As Node's fetch and undici's refuse a certificate that names another host.
  it("never retries a refused certificate", async () => {
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("Hostname/IP does not match"), {
        code: "ERR_TLS_CERT_ALTNAME_INVALID",
      }),
    });
    const calls = answers(refused, 200);
    await expect(fetchWithRetry("https://x.test", {}, options)).rejects.toBe(
      refused,
    );
    expect(calls).toHaveLength(1);
    expect(pauses).toEqual([]);
  });
});

describe("certificateRefusal", () => {
  it("reads the code where Node, undici and Bun put it", () => {
    const bun = Object.assign(new TypeError("unable to verify"), {
      code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    });
    const node = new TypeError("fetch failed", {
      cause: { code: "DEPTH_ZERO_SELF_SIGNED_CERT" },
    });
    expect(certificateRefusal(bun)).toBe("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
    expect(certificateRefusal(node)).toBe("DEPTH_ZERO_SELF_SIGNED_CERT");
    const refused = new TypeError("fetch failed", {
      cause: { code: "ECONNREFUSED" },
    });
    expect(certificateRefusal(refused)).toBeNull();
    expect(certificateRefusal("ERR_TLS_CERT_ALTNAME_INVALID")).toBeNull();
  });
});
