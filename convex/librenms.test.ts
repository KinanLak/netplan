import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { api } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
import { stubFetch } from "./_test/fetch";
import type { TestClient } from "./_test/auth.setup";

const TOKEN = "a-token-for-tests"; // gitleaks:allow
const LIBRENMS = "https://librenms.test";

// LibreNMS's `/api/v0/devices` answer, trimmed to the fields Netplan reads.
const DEVICES = [
  { device_id: 12, hostname: "10.0.0.12", sysName: "sw-etage" },
  { device_id: 4, hostname: "core.corp.test", sysName: "" },
  { hostname: "no-id" },
];

const librenms = (url: string) =>
  url.endsWith("/api/v0/devices")
    ? Response.json({ status: "ok", count: DEVICES.length, devices: DEVICES })
    : Response.json({ status: "ok", system: [{ local_ver: "25.10.0" }] });

let fetchStub: ReturnType<typeof stubFetch>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
  fetchStub = stubFetch(librenms);
});

afterEach(() => {
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
});

const connect = async (admin: TestClient, siteId: string, baseUrl = LIBRENMS) =>
  await admin.action(api.integrations.save, {
    siteId,
    kind: "librenms",
    baseUrl,
    enabled: false,
    token: TOKEN,
  });

const addDevice = async (
  admin: TestClient,
  siteId: string,
  deviceId: string,
  type: "switch" | "pc",
  name: string,
) =>
  await admin.mutation(api.devices.create, {
    siteId,
    deviceId,
    type,
    identity: { name, macs: [] },
  });

describe("LibreNMS settings", () => {
  it("lists LibreNMS's devices by name, even before LibreNMS is turned on", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    expect(await admin.query(api.librenms.settings, { siteId })).toBeNull();
    expect(await admin.action(api.librenms.options, { siteId })).toEqual({
      error: "LibreNMS n'est pas configuré.",
    });

    await connect(admin, siteId);
    expect(await admin.action(api.librenms.options, { siteId })).toEqual({
      baseUrl: LIBRENMS,
      devices: [
        { id: 4, name: "core.corp.test" },
        { id: 12, name: "sw-etage" },
      ],
    });
  });

  it("maps switches to devices, refuses other devices, and forgets them for another LibreNMS", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await addDevice(admin, siteId, "device:sw1", "switch", "Pile 1");
    await addDevice(admin, siteId, "device:sw2", "switch", "Pile 2");
    await addDevice(admin, siteId, "device:pc", "pc", "Poste");
    const stack = { id: 4, name: "core.corp.test" };
    const settings = {
      switches: [
        { switchId: "device:sw1", device: stack },
        { switchId: "device:sw2", device: stack },
      ],
    };
    await expect(
      admin.mutation(api.librenms.saveSettings, {
        siteId,
        baseUrl: LIBRENMS,
        settings,
      }),
    ).rejects.toThrow("Configurez d'abord");

    await connect(admin, siteId);
    await expect(
      admin.mutation(api.librenms.saveSettings, {
        siteId,
        baseUrl: LIBRENMS,
        settings: { switches: [{ switchId: "device:pc", device: stack }] },
      }),
    ).rejects.toThrow("plus dans l'inventaire");

    await admin.mutation(api.librenms.saveSettings, {
      siteId,
      baseUrl: LIBRENMS,
      settings,
    });
    expect(await admin.query(api.librenms.settings, { siteId })).toEqual({
      settings,
      switches: [
        { id: "device:sw1", name: "Pile 1" },
        { id: "device:sw2", name: "Pile 2" },
      ],
    });

    // A deleted switch drops out of the mapping.
    await admin.mutation(api.devices.remove, { deviceId: "device:sw2" });
    expect(
      (await admin.query(api.librenms.settings, { siteId }))?.settings,
    ).toEqual({ switches: [settings.switches[0]] });

    await connect(admin, siteId, "https://other-librenms.test");
    expect(
      (await admin.query(api.librenms.settings, { siteId }))?.settings,
    ).toEqual({ switches: [] });
    await expect(
      admin.mutation(api.librenms.saveSettings, {
        siteId,
        baseUrl: LIBRENMS,
        settings,
      }),
    ).rejects.toThrow("a changé");
  });
});
