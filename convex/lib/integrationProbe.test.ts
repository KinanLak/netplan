import { afterEach, describe, expect, it } from "bun:test";
import { stubFetch } from "../_test/fetch";
import { defaultFetch } from "./httpRetry";
import { probeIntegration } from "./integrationProbe";
import type { IntegrationKind } from "../../src/sites/integrations";

const noWait = {
  attempts: 2,
  timeoutMs: 1_000,
  initialDelayMs: 0,
  maxDelayMs: 0,
  sleep: async () => {},
};

const NB = "https://nb.test";
const NMS = "https://nms.test";
const source = (kind: IntegrationKind, baseUrl: string, token = "tok") => ({
  kind,
  baseUrl,
  token,
  fetch: defaultFetch,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

let stub: ReturnType<typeof stubFetch> | null = null;
const answer = (...responses: Array<Response | Error>) => {
  stub = stubFetch(...responses);
  return stub.calls;
};

afterEach(() => {
  stub?.restore();
  stub = null;
});

describe("probeIntegration", () => {
  it("reads NetBox's version with the token in its header, never following a redirect", async () => {
    const calls = answer(json({ "netbox-version": "4.6.10" }));
    expect(await probeIntegration(source("netbox", NB), noWait)).toEqual({
      ok: true,
      message: "Connexion réussie : NetBox 4.6.10.",
    });

    const [url, init] = calls[0] ?? [];
    expect(url).toBe("https://nb.test/api/status/");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Token tok");
  });

  it("sends a NetBox v2 token as a bearer", async () => {
    const calls = answer(json({ "netbox-version": "4.6.10" }));
    await probeIntegration(
      source("netbox", NB, "nbt_key.secret"), // gitleaks:allow
      noWait,
    );
    const [, init] = calls[0] ?? [];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer nbt_key.secret", // gitleaks:allow
    );
  });

  it("reads LibreNMS's version", async () => {
    const calls = answer(
      json({ status: "ok", system: [{ local_ver: "25.9.1" }], count: 1 }),
    );
    expect(await probeIntegration(source("librenms", NMS), noWait)).toEqual({
      ok: true,
      message: "Connexion réussie : LibreNMS 25.9.1.",
    });
    const [url, init] = calls[0] ?? [];
    expect(url).toBe("https://nms.test/api/v0/system");
    expect(new Headers(init?.headers).get("X-Auth-Token")).toBe("tok");
  });

  it("sends its requests through the source's own fetch", async () => {
    const calls = answer();
    const urls: Array<string> = [];
    const result = await probeIntegration(
      {
        ...source("librenms", NMS),
        fetch: (url) => {
          urls.push(url);
          return Promise.resolve(json({ system: [{ local_ver: "26.9.1" }] }));
        },
      },
      noWait,
    );
    expect(result.ok).toBe(true);
    expect(urls).toEqual(["https://nms.test/api/v0/system"]);
    expect(calls).toEqual([]);
  });

  it("says why it failed, without the token", async () => {
    answer(json({ detail: "Invalid token" }, 403));
    const refused = await probeIntegration(source("netbox", NB), noWait);
    expect(refused).toEqual({
      ok: false,
      message: "NetBox refuse ce jeton (403).",
    });

    answer(
      new Response(null, {
        status: 302,
        headers: { Location: "https://elsewhere.test" },
      }),
    );
    expect(
      (await probeIntegration(source("netbox", NB), noWait)).message,
    ).toContain("redirige");

    answer(json({ hello: "world" }));
    expect(await probeIntegration(source("netbox", NB), noWait)).toEqual({
      ok: false,
      message: "Cette adresse ne répond pas comme NetBox.",
    });

    const timeout = new DOMException("timed out", "TimeoutError");
    answer(timeout, timeout);
    expect(await probeIntegration(source("librenms", NMS), noWait)).toEqual({
      ok: false,
      message: "LibreNMS ne répond pas (délai dépassé).",
    });
  });
});
