import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { api } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
import { stubFetch } from "./_test/fetch";
import type { TestClient } from "./_test/auth.setup";

const TOKEN = "a-token-for-tests"; // gitleaks:allow
const NETBOX = "https://netbox.test";

/** A NetBox list endpoint's page, as NetBox answers `limit` and `offset`. */
const page = (url: string, all: Array<Record<string, unknown>>) => {
  const query = new URL(url).searchParams;
  const offset = Number(query.get("offset"));
  const limit = Number(query.get("limit"));
  return Response.json({
    count: all.length,
    results: all.slice(offset, offset + limit),
  });
};

const SITES = [
  { id: 7, name: "Siège", display: "Siège" },
  { id: 3, name: "Annexe", display: "Annexe" },
];
// More roles than a page holds, so the list is read in two.
const ROLES = [
  { id: 1, name: "Switch", _depth: 0 },
  { id: 2, name: "Switch cœur", _depth: 1 },
  ...Array.from({ length: 1000 }, (_, i) => ({
    id: 100 + i,
    name: `Rôle ${i}`,
    _depth: 0,
  })),
];

const netbox = (url: string) =>
  url.includes("/api/dcim/sites/")
    ? page(url, SITES)
    : url.includes("/api/dcim/device-roles/")
      ? page(url, ROLES)
      : Response.json({ "netbox-version": "4.6.10" });

let fetchStub: ReturnType<typeof stubFetch>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
  fetchStub = stubFetch(netbox);
});

afterEach(() => {
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
});

const connect = async (
  admin: TestClient,
  siteId: string,
  baseUrl = NETBOX,
  enabled = true,
) =>
  await admin.action(api.integrations.save, {
    siteId,
    kind: "netbox",
    baseUrl,
    enabled,
    token: TOKEN,
  });

const SETTINGS = {
  site: { id: 7, name: "Siège" },
  roles: [
    { id: 1, name: "Switch", type: "switch" as const },
    { id: 2, name: "Switch cœur", type: "switch" as const },
  ],
};

describe("NetBox settings", () => {
  it("lists NetBox's sites and roles, page by page, even before NetBox is turned on", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    expect(await admin.query(api.netbox.settings, { siteId })).toBeNull();
    expect(await admin.action(api.netbox.options, { siteId })).toEqual({
      error: "NetBox n'est pas configuré.",
    });

    await connect(admin, siteId, NETBOX, false);
    const before = fetchStub.calls.length;
    const options = await admin.action(api.netbox.options, { siteId });
    if ("error" in options) throw new Error(options.error);
    expect(options.sites).toEqual([
      { id: 3, name: "Annexe" },
      { id: 7, name: "Siège" },
    ]);
    expect(options.roles).toHaveLength(ROLES.length);
    expect(options.roles.slice(0, 2)).toEqual([
      { id: 1, name: "Switch", depth: 0 },
      { id: 2, name: "Switch cœur", depth: 1 },
    ]);
    const roleOffsets = fetchStub.calls
      .slice(before)
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname === "/api/dcim/device-roles/")
      .map((url) => url.searchParams.get("offset"));
    expect(roleOffsets).toEqual(["0", "1000"]);
  });

  it("answers NetBox's refusal in French", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await connect(admin, siteId);
    fetchStub.restore();
    fetchStub = stubFetch(new Response("", { status: 403 }));
    expect(await admin.action(api.netbox.options, { siteId })).toEqual({
      error: "NetBox refuse ce jeton (403).",
    });
  });

  it("saves the site and role mapping, and forgets them for another NetBox", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await expect(
      admin.mutation(api.netbox.saveSettings, {
        siteId,
        baseUrl: NETBOX,
        settings: SETTINGS,
      }),
    ).rejects.toThrow("Configurez d'abord");

    await connect(admin, siteId);
    expect(await admin.query(api.netbox.settings, { siteId })).toEqual({
      site: null,
      roles: [],
    });
    await expect(
      admin.mutation(api.netbox.saveSettings, {
        siteId,
        baseUrl: NETBOX,
        settings: {
          ...SETTINGS,
          roles: [...SETTINGS.roles, { id: 1, name: "Switch", type: "pc" }],
        },
      }),
    ).rejects.toThrow("qu'un type");

    await admin.mutation(api.netbox.saveSettings, {
      siteId,
      baseUrl: NETBOX,
      settings: SETTINGS,
    });
    expect(await admin.query(api.netbox.settings, { siteId })).toEqual(
      SETTINGS,
    );

    // Saving the same connection again keeps them.
    await admin.action(api.integrations.save, {
      siteId,
      kind: "netbox",
      baseUrl: NETBOX,
      enabled: false,
    });
    expect(await admin.query(api.netbox.settings, { siteId })).toEqual(
      SETTINGS,
    );

    await connect(admin, siteId, "https://other-netbox.test");
    expect(await admin.query(api.netbox.settings, { siteId })).toEqual({
      site: null,
      roles: [],
    });
    // A form opened on the first NetBox cannot save its ids on the other.
    await expect(
      admin.mutation(api.netbox.saveSettings, {
        siteId,
        baseUrl: NETBOX,
        settings: SETTINGS,
      }),
    ).rejects.toThrow("a changé");
  });
});
