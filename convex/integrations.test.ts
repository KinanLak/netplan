import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
import { stubFetch } from "./_test/fetch";
import type { TestClient } from "./_test/auth.setup";

const TOKEN = "a-token-for-tests"; // gitleaks:allow
const newKey = () => randomBytes(32).toString("base64");

let fetchStub: ReturnType<typeof stubFetch>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = newKey();
  delete process.env.NETPLAN_SECRET_KEY_PREVIOUS;
  // Each call gets its own body, which can be read once.
  fetchStub = stubFetch(() => Response.json({ "netbox-version": "4.6.10" }));
});

afterEach(() => {
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
  delete process.env.NETPLAN_SECRET_KEY_PREVIOUS;
});

const refusal = async (call: Promise<unknown>) => {
  try {
    await call;
  } catch (error) {
    if (error instanceof ConvexError) return error.data as string;
    throw error;
  }
  return null;
};

const stored = (t: TestClient) =>
  t.run(async (ctx) => await ctx.db.query("integrations").collect());

const saveNetBox = (
  t: TestClient,
  siteId: string,
  input: { baseUrl?: string; token?: string } = { token: TOKEN },
) =>
  t.action(api.integrations.save, {
    siteId,
    kind: "netbox",
    baseUrl: input.baseUrl ?? "https://netbox.test/api/",
    enabled: true,
    token: input.token,
  });

describe("integrations", () => {
  it("stores the token encrypted, tests the connection, and never returns the token", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);

    expect(await saveNetBox(admin, siteId)).toEqual({
      ok: true,
      message: "Connexion réussie : NetBox 4.6.10.",
    });

    const [row] = await stored(admin);
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    const [url, init] = fetchStub.calls[0] ?? [];
    expect(url).toBe("https://netbox.test/api/status/");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Token ${TOKEN}`,
    );

    const listed = await admin.query(api.integrations.listForSite, { siteId });
    expect(listed).toEqual([
      {
        kind: "netbox",
        baseUrl: "https://netbox.test",
        enabled: true,
        lastCheck: {
          ok: true,
          message: "Connexion réussie : NetBox 4.6.10.",
          at: expect.any(Number),
        },
      },
    ]);
    expect(JSON.stringify(listed)).not.toContain(row.token.ciphertext);
  });

  it("keeps the token when it is left out, but not for a new address", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const [before] = await stored(admin);

    await saveNetBox(admin, siteId, { token: undefined });
    expect((await stored(admin))[0].token).toEqual(before.token);

    expect(
      await refusal(
        saveNetBox(admin, siteId, {
          baseUrl: "https://elsewhere.test",
          token: undefined,
        }),
      ),
    ).toContain("Saisissez à nouveau le jeton");
    expect((await stored(admin))[0]?.baseUrl).toBe("https://netbox.test");
  });

  it("needs a token to create a connection and a valid address", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    expect(await refusal(saveNetBox(admin, siteId, { token: undefined }))).toBe(
      "Saisissez le jeton.",
    );
    expect(
      await refusal(
        saveNetBox(admin, siteId, { baseUrl: "netbox", token: TOKEN }),
      ),
    ).toContain("URL complète");
    expect(await stored(admin)).toEqual([]);
  });

  it("refuses to save without an encryption key", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    delete process.env.NETPLAN_SECRET_KEY;
    expect(await refusal(saveNetBox(admin, siteId))).toContain(
      "NETPLAN_SECRET_KEY",
    );
  });

  it("says when the token can no longer be decrypted", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    process.env.NETPLAN_SECRET_KEY = newKey();

    expect(
      await admin.action(api.integrations.testConnection, {
        siteId,
        kind: "netbox",
      }),
    ).toEqual({
      ok: false,
      message:
        "Le jeton enregistré ne peut plus être déchiffré : saisissez-le à nouveau.",
    });
  });

  it("re-encrypts every token with the new key after a rotation", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const [before] = await stored(admin);

    process.env.NETPLAN_SECRET_KEY_PREVIOUS = process.env.NETPLAN_SECRET_KEY;
    process.env.NETPLAN_SECRET_KEY = newKey();
    expect(
      await admin.action(internal.integrations.reencryptTokens, {}),
    ).toEqual({ reencrypted: 1, current: 0, unreadable: [] });

    const [after] = await stored(admin);
    expect(after.token.keyId).not.toBe(before.token.keyId);
    delete process.env.NETPLAN_SECRET_KEY_PREVIOUS;
    await admin.action(api.integrations.testConnection, {
      siteId,
      kind: "netbox",
    });
    const [, init] = fetchStub.calls.at(-1) ?? [];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Token ${TOKEN}`,
    );
  });

  it("drops a test result when the connection was saved again meanwhile", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const [tested] = await stored(admin);
    await saveNetBox(admin, siteId, { token: "another-token-for-tests" }); // gitleaks:allow

    await admin.mutation(internal.integrations.recordCheck, {
      siteId,
      kind: "netbox",
      testedVersion: tested.updatedAt,
      check: { ok: false, message: "NetBox refuse ce jeton (403).", at: 0 },
    });

    const [row] = await stored(admin);
    expect(row.lastCheck?.message).toBe("Connexion réussie : NetBox 4.6.10.");
  });

  it("removes a site's integrations with the site", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    await admin.mutation(api.sites.remove, { siteId });
    expect(await stored(admin)).toEqual([]);
  });

  it("is for admins only", async () => {
    const editor = await signedInTest("editor");
    const siteId = await createTestSite(editor);
    const error: unknown = await saveNetBox(editor, siteId).catch(
      (failure: unknown) => failure,
    );
    expect(
      error instanceof ConvexError
        ? (error.data as { code?: string }).code
        : error,
    ).toBe("forbidden");
  });
});
