import { afterEach, describe, expect, it } from "bun:test";
import { stubFetch } from "../_test/fetch";
import { probeIntegration } from "./integrationProbe";

const noWait = {
  attempts: 2,
  timeoutMs: 1_000,
  initialDelayMs: 0,
  maxDelayMs: 0,
  sleep: async () => {},
};

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
    expect(
      await probeIntegration("netbox", "https://nb.test", "tok", noWait),
    ).toEqual({ ok: true, message: "Connexion réussie : NetBox 4.6.10." });

    const [url, init] = calls[0] ?? [];
    expect(url).toBe("https://nb.test/api/status/");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Token tok");
  });

  it("reads LibreNMS's version", async () => {
    const calls = answer(
      json({ status: "ok", system: [{ local_ver: "25.9.1" }], count: 1 }),
    );
    expect(
      await probeIntegration("librenms", "https://nms.test", "tok", noWait),
    ).toEqual({ ok: true, message: "Connexion réussie : LibreNMS 25.9.1." });
    const [url, init] = calls[0] ?? [];
    expect(url).toBe("https://nms.test/api/v0/system");
    expect(new Headers(init?.headers).get("X-Auth-Token")).toBe("tok");
  });

  it("says why it failed, without the token", async () => {
    answer(json({ detail: "Invalid token" }, 403));
    const refused = await probeIntegration(
      "netbox",
      "https://nb.test",
      "tok",
      noWait,
    );
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
      (await probeIntegration("netbox", "https://nb.test", "tok", noWait))
        .message,
    ).toContain("redirige");

    answer(json({ hello: "world" }));
    expect(
      await probeIntegration("netbox", "https://nb.test", "tok", noWait),
    ).toEqual({
      ok: false,
      message: "Cette adresse ne répond pas comme NetBox.",
    });

    const timeout = new DOMException("timed out", "TimeoutError");
    answer(timeout, timeout);
    expect(
      await probeIntegration("librenms", "https://nms.test", "tok", noWait),
    ).toEqual({
      ok: false,
      message: "LibreNMS ne répond pas (délai dépassé).",
    });
  });
});
