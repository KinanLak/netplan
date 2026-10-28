import { describe, expect, it } from "bun:test";
import { checkHealth } from "@/lib/health";
import type { HealthDeps } from "@/lib/health";

const env = {
  CONVEX_URL: "http://convex.test",
  CONVEX_SITE_URL: "http://convex-site.test",
};

const deps = (
  fetch: HealthDeps["fetch"],
  overrides: Partial<HealthDeps> = {},
): HealthDeps => ({ env, fetch, timeoutMs: 1000, ...overrides });

describe("checkHealth", () => {
  it("is ok when the configuration is valid and the backend answers", async () => {
    const requested: Array<string> = [];
    const report = await checkHealth(
      deps((url) => {
        requested.push(url);
        return Promise.resolve(new Response("1.0.0"));
      }),
    );
    expect(requested).toEqual([
      "http://convex.test/version",
      "http://convex-site.test/api/auth/ok",
    ]);
    expect(report).toEqual({
      status: "ok",
      checks: [
        { name: "config", status: "ok" },
        { name: "convex", status: "ok" },
        { name: "convex-site", status: "ok" },
      ],
    });
  });

  it("is ko when only the site URL, where sessions are read, does not answer", async () => {
    const report = await checkHealth(
      deps((url) =>
        Promise.resolve(
          url.startsWith("http://convex-site.test")
            ? new Response("down", { status: 502 })
            : new Response("1.0.0"),
        ),
      ),
    );
    expect(report.status).toBe("ko");
    expect(report.checks[2]).toEqual({
      name: "convex-site",
      status: "ko",
      detail: "backend answered 502",
    });
  });

  it("is ko without calling the backend when the configuration is invalid", async () => {
    let called = false;
    const report = await checkHealth(
      deps(
        () => {
          called = true;
          return Promise.resolve(new Response());
        },
        { env: { CONVEX_SITE_URL: env.CONVEX_SITE_URL } },
      ),
    );
    expect(called).toBe(false);
    expect(report).toEqual({
      status: "ko",
      checks: [
        { name: "config", status: "ko", detail: "CONVEX_URL is not set." },
      ],
    });
  });

  it("is ko when the backend answers with an error", async () => {
    const report = await checkHealth(
      deps(() => Promise.resolve(new Response("down", { status: 502 }))),
    );
    expect(report.status).toBe("ko");
    expect(report.checks[1]).toEqual({
      name: "convex",
      status: "ko",
      detail: "backend answered 502",
    });
  });

  it("is ko when the backend cannot be reached", async () => {
    const report = await checkHealth(
      deps(() => Promise.reject(new TypeError("Unable to connect"))),
    );
    expect(report.status).toBe("ko");
    expect(report.checks[1]).toEqual({
      name: "convex",
      status: "ko",
      detail: "Unable to connect",
    });
  });

  it("gives the backend request a deadline", async () => {
    const report = await checkHealth(
      deps(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason));
          }),
        { timeoutMs: 5 },
      ),
    );
    expect(report.status).toBe("ko");
    expect(report.checks[1]?.name).toBe("convex");
  });
});
