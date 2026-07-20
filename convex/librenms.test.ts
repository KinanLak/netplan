import { describe, expect, it } from "bun:test";
import type { LibreNmsClientError } from "./librenms";
import {
  createLibreNmsClient,
  libreNmsApiBaseUrl,
  parseDevices,
  parseFdb,
  parseLldp,
  parsePorts,
  parseTargetedDeviceFdb,
} from "./librenms";

describe("LibreNMS source validation", () => {
  it("normalizes root and API URLs to the LibreNMS API base", () => {
    expect(libreNmsApiBaseUrl("https://librenms.example").href).toBe(
      "https://librenms.example/api/v0/",
    );
    expect(libreNmsApiBaseUrl("https://librenms.example/api/v0/").href).toBe(
      "https://librenms.example/api/v0/",
    );
  });

  it("rejects missing source collections", () => {
    expect(() => parseDevices({})).toThrow("devices");
    expect(() => parsePorts({ ports: null })).toThrow("ports");
  });

  it("rejects malformed rows instead of turning them into absence", () => {
    expect(() => parseDevices({ devices: [{}] })).toThrow("Device");
    expect(() => parsePorts({ ports: [{ device_id: 4, port_id: 1 }] })).toThrow(
      "Port",
    );
    expect(() =>
      parseFdb({ ports_fdb: [{ device_id: 4, port_id: 1 }] }),
    ).toThrow("FDB");
    expect(() =>
      parseLldp({
        links: [
          {
            protocol: "lldp",
            local_device_id: 4,
            local_port_id: 1,
          },
        ],
      }),
    ).toThrow("LLDP");
  });

  it("uses ifDescr when LibreNMS has no ifName", () => {
    expect(
      parsePorts({
        ports: [
          {
            device_id: 4,
            port_id: 1,
            ifName: null,
            ifDescr: "GigabitEthernet1/0/1",
          },
        ],
      }),
    ).toEqual([{ deviceId: 4, portId: 1, ifName: "GigabitEthernet1/0/1" }]);
  });

  it("assigns compact device-port responses to their requested switch", () => {
    expect(
      parsePorts(
        {
          ports: [
            { port_id: 1, ifName: "Gi1/0/1" },
            { port_id: 2, ifName: "Gi1/0/2" },
          ],
        },
        4,
      ),
    ).toEqual([
      { deviceId: 4, portId: 1, ifName: "Gi1/0/1" },
      { deviceId: 4, portId: 2, ifName: "Gi1/0/2" },
    ]);
  });

  it("rejects malformed FDB MAC lengths", () => {
    expect(() =>
      parseFdb({
        ports_fdb: [
          { device_id: 4, port_id: 1, mac_address: "AA:BB:CC:DD:EE" },
        ],
      }),
    ).toThrow("FDB");
  });

  it("ignores explicitly non-LLDP link protocols", () => {
    expect(parseLldp({ links: [{ protocol: "cdp" }] })).toEqual([]);
  });

  it("rejects malformed or partial targeted FDB confirmations", () => {
    const row = {
      device_id: 4,
      port_id: 10,
      mac_address: "AA:BB:CC:DD:EE:FF",
      updated_at: "2026-07-20T10:00:00Z",
    };
    expect(() => parseTargetedDeviceFdb({ ports_fdb: [row] }, "4")).toThrow(
      "statut ok",
    );
    expect(() =>
      parseTargetedDeviceFdb({ status: "ok", ports_fdb: { ...row } }, "4"),
    ).toThrow("ports_fdb");
    expect(() =>
      parseTargetedDeviceFdb(
        {
          status: "ok",
          ports_fdb: [{ ...row, updated_at: undefined }],
        },
        "4",
      ),
    ).toThrow("mal formée");
    expect(() =>
      parseTargetedDeviceFdb({ status: "ok", count: 2, ports_fdb: [row] }, "4"),
    ).toThrow("partielle");
    expect(() =>
      parseTargetedDeviceFdb(
        { status: "ok", ports_fdb: [{ ...row, device_id: 5 }] },
        "4",
      ),
    ).toThrow("mal formée");
  });
});

describe("LibreNMS HTTP client", () => {
  it("triggers discovery server-side without cache or redirects", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const client = createLibreNmsClient({
      baseUrl: "https://librenms.example/api/v0",
      token: "secret",
      fetchImpl: (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return Promise.resolve(Response.json({ status: "ok" }));
      },
    });

    await client.triggerDiscovery("4", "cycle:1");

    expect(requestedUrl).toContain("/devices/4/discover?");
    expect(requestedUrl).toContain("netplan_cycle=cycle%3A1");
    expect(requestedInit?.redirect).toBe("manual");
    expect(requestedInit?.cache).toBe("no-store");
    expect(new Headers(requestedInit?.headers).get("Cache-Control")).toBe(
      "no-store",
    );
  });

  it("categorizes refused, redirected, and uncertain triggers", async () => {
    const clientFor = (
      fetchImpl: (
        input: string | URL | Request,
        init?: RequestInit,
      ) => Promise<Response>,
    ) =>
      createLibreNmsClient({
        baseUrl: "https://librenms.example/api/v0",
        token: "secret",
        fetchImpl,
      });
    const refused = clientFor(() =>
      Promise.resolve(new Response("no", { status: 401 })),
    );
    const redirected = clientFor(() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { Location: "https://other.example" },
        }),
      ),
    );
    const uncertain = clientFor(() =>
      Promise.reject(new DOMException("timed out", "TimeoutError")),
    );

    await expect(
      refused.triggerDiscovery("4", "cycle:1"),
    ).rejects.toMatchObject({
      code: "trigger_refused",
    } satisfies Partial<LibreNmsClientError>);
    await expect(
      redirected.triggerDiscovery("4", "cycle:1"),
    ).rejects.toMatchObject({ code: "trigger_refused" });
    await expect(
      uncertain.triggerDiscovery("4", "cycle:1"),
    ).rejects.toMatchObject({ code: "trigger_uncertain" });
  });

  it("parses nullable discovery state and timing", async () => {
    let lastDiscovered: string | null = null;
    const client = createLibreNmsClient({
      baseUrl: "https://librenms.example/api/v0",
      token: "secret",
      fetchImpl: () =>
        Promise.resolve(
          Response.json({
            devices: [
              {
                device_id: 4,
                last_discovered: lastDiscovered,
                last_discovered_timetaken: "42.5",
              },
            ],
          }),
        ),
    });

    expect(await client.getDevice("4")).toMatchObject({
      deviceId: 4,
      lastDiscovered: undefined,
      lastDiscoveredTimetaken: 42.5,
    });
    lastDiscovered = "2026-07-17 10:00:00";
    expect((await client.getDevice("4")).lastDiscovered).toBe(lastDiscovered);
  });

  it("reads confirmation from the targeted per-device FDB endpoint", async () => {
    let requestedUrl = "";
    const client = createLibreNmsClient({
      baseUrl: "https://librenms.example/api/v0",
      token: "secret",
      fetchImpl: (input) => {
        requestedUrl = String(input);
        return Promise.resolve(
          Response.json({
            status: "ok",
            count: 1,
            ports_fdb: [
              {
                device_id: 4,
                port_id: 10,
                mac_address: "AA:BB:CC:DD:EE:FF",
                updated_at: "2026-07-20T10:00:00Z",
              },
            ],
          }),
        );
      },
    });

    await expect(client.getDeviceFdb("4")).resolves.toMatchObject({
      rows: [
        {
          deviceId: 4,
          portId: 10,
          macAddress: "AA:BB:CC:DD:EE:FF",
          updatedAt: "2026-07-20T10:00:00Z",
        },
      ],
    });
    expect(requestedUrl).toBe("https://librenms.example/api/v0/devices/4/fdb");
  });
});
