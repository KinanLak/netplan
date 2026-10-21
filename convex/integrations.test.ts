import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { makeFunctionReference } from "convex/server";
import { internalAction } from "./_generated/server";
import {
  createSignedInUser,
  createTestSite,
  signedInTest,
  testBackend,
} from "./_test/auth.setup";
import { reencryptInPasses, testConnection } from "./integrations";
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
  input: {
    baseUrl?: string;
    token?: string;
    ignoreCertificateErrors?: boolean;
  } = { token: TOKEN },
) =>
  t.action(api.sources.saveIntegration, {
    siteId,
    kind: "netbox",
    baseUrl: input.baseUrl ?? "https://netbox.test/api/",
    enabled: true,
    ignoreCertificateErrors: input.ignoreCertificateErrors ?? false,
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
        ignoreCertificateErrors: false,
        lastCheck: {
          ok: true,
          message: "Connexion réussie : NetBox 4.6.10.",
          at: expect.any(Number),
        },
      },
    ]);
    expect(JSON.stringify(listed)).not.toContain(row.token.ciphertext);
  });

  it("sends an integration's requests leniently only when its admin says so", async () => {
    const lenientCalls: Array<string> = [];
    const t = testBackend({
      "./lenientProbe.ts": () =>
        Promise.resolve({
          probe: internalAction({
            args: { siteId: v.string(), lenient: v.boolean() },
            handler: async (ctx, { siteId, lenient }) =>
              await testConnection(
                ctx,
                {
                  siteId,
                  kind: "netbox",
                  baseUrl: "https://netbox.test",
                  ignoreCertificateErrors: lenient,
                },
                {
                  lenient: (url) => {
                    lenientCalls.push(url);
                    return Promise.resolve(
                      Response.json({ "netbox-version": "4.6.10" }),
                    );
                  },
                },
              ),
          }),
        }),
    });
    const admin = t.withIdentity(
      (await createSignedInUser(t, "admin")).identity,
    );
    const siteId = await createTestSite(admin);
    const probe = makeFunctionReference<"action">("lenientProbe:probe");

    await saveNetBox(admin, siteId);
    await t.action(probe, { siteId, lenient: false });
    expect(lenientCalls).toEqual([]);

    await t.action(probe, { siteId, lenient: true });
    expect(lenientCalls).toEqual(["https://netbox.test/api/status/"]);
  });

  it("tests what the form shows, and records only a test of the saved connection", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const [saved] = await stored(admin);
    fetchStub.restore();
    fetchStub = stubFetch(() => new Response(null, { status: 403 }));

    expect(
      await admin.action(api.sources.testIntegration, {
        siteId,
        kind: "netbox",
        baseUrl: "https://other-netbox.test",
        ignoreCertificateErrors: false,
        token: "another-token-for-tests", // gitleaks:allow
      }),
    ).toEqual({ ok: false, message: "NetBox refuse ce jeton (403)." });
    expect(String(fetchStub.calls[0]?.[0])).toBe(
      "https://other-netbox.test/api/status/",
    );
    expect((await stored(admin))[0]).toEqual(saved);

    await admin.action(api.sources.testIntegration, {
      siteId,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      ignoreCertificateErrors: false,
    });
    expect((await stored(admin))[0]?.lastCheck?.message).toBe(
      "NetBox refuse ce jeton (403).",
    );
  });

  it("never sends the saved token to another address", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const calls = fetchStub.calls.length;

    expect(
      await refusal(
        admin.action(api.sources.testIntegration, {
          siteId,
          kind: "netbox",
          baseUrl: "https://elsewhere.test",
          ignoreCertificateErrors: false,
        }),
      ),
    ).toContain("Saisissez à nouveau le jeton");
    expect(fetchStub.calls.length).toBe(calls);
  });

  it("saves a new connection only when its test succeeds", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    fetchStub.restore();
    fetchStub = stubFetch(() => new Response(null, { status: 403 }));

    expect(await saveNetBox(admin, siteId)).toEqual({
      ok: false,
      message: "NetBox refuse ce jeton (403).",
    });
    expect(await stored(admin)).toEqual([]);
  });

  it("keeps the saved connection when a new address fails its test", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const [saved] = await stored(admin);
    fetchStub.restore();
    fetchStub = stubFetch(() => new Response(null, { status: 403 }));

    expect(
      (
        await saveNetBox(admin, siteId, {
          baseUrl: "https://elsewhere.test",
          token: "another-token-for-tests", // gitleaks:allow
        })
      )?.ok,
    ).toBe(false);
    expect((await stored(admin))[0]).toEqual(saved);
  });

  it("turns a connection off without testing it", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const calls = fetchStub.calls.length;

    expect(
      await admin.action(api.sources.saveIntegration, {
        siteId,
        kind: "netbox",
        baseUrl: "https://netbox.test",
        enabled: false,
        ignoreCertificateErrors: false,
      }),
    ).toBeNull();
    expect(fetchStub.calls.length).toBe(calls);
    const [row] = await stored(admin);
    expect(row.enabled).toBe(false);
    expect(row.lastCheck?.ok).toBe(true);
  });

  it("forgets the last test when the certificate option changes", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    await admin.mutation(internal.integrations.store, {
      siteId,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      enabled: true,
      ignoreCertificateErrors: true,
    });
    const [row] = await stored(admin);
    expect(row.lastCheck).toBeUndefined();
    expect(
      (await admin.query(api.integrations.listForSite, { siteId }))[0]
        ?.ignoreCertificateErrors,
    ).toBe(true);
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
      await admin.action(api.sources.testIntegration, {
        siteId,
        kind: "netbox",
        baseUrl: "https://netbox.test",
        ignoreCertificateErrors: false,
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
    ).toEqual({ reencrypted: 1, current: 0, unreadable: [], pending: [] });

    const [after] = await stored(admin);
    expect(after.token.keyId).not.toBe(before.token.keyId);
    delete process.env.NETPLAN_SECRET_KEY_PREVIOUS;
    await admin.action(api.sources.testIntegration, {
      siteId,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      ignoreCertificateErrors: false,
    });
    const [, init] = fetchStub.calls.at(-1) ?? [];
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      `Token ${TOKEN}`,
    );
  });

  it("re-reads a token saved with the previous key while the rotation ran", async () => {
    const token = (keyId: string) => ({ keyId, iv: "iv", ciphertext: "c" });
    let row = {
      siteId: "s",
      kind: "netbox" as const,
      baseUrl: "u",
      token: token("old"),
    };
    let saves = 0;
    const result = await reencryptInPasses("new", {
      read: () => Promise.resolve([row]),
      reencrypt: () => {
        // The first replacement meets a save made with the old key.
        if (saves++ === 0) return Promise.resolve("saved-meanwhile");
        row = { ...row, token: token("new") };
        return Promise.resolve("replaced");
      },
    });

    expect(result).toEqual({
      reencrypted: 1,
      current: 0,
      unreadable: [],
      pending: [],
    });
    expect(row.token.keyId).toBe("new");
  });

  it("reports a token still pending once the passes run out", async () => {
    const row = {
      siteId: "s",
      kind: "netbox" as const,
      baseUrl: "u",
      token: { keyId: "old", iv: "iv", ciphertext: "c" },
    };
    expect(
      await reencryptInPasses("new", {
        read: () => Promise.resolve([row]),
        reencrypt: () => Promise.resolve("saved-meanwhile"),
      }),
    ).toEqual({
      reencrypted: 0,
      current: 0,
      unreadable: [],
      pending: ["s netbox"],
    });
  });

  it("keeps a token saved while the rotation re-encrypted the older one", async () => {
    const admin = await signedInTest("admin");
    const siteId = await createTestSite(admin);
    await saveNetBox(admin, siteId);
    const [read] = await stored(admin);
    // Same key, so only the ciphertext tells the two saves apart.
    await saveNetBox(admin, siteId, { token: "another-token-for-tests" }); // gitleaks:allow
    const [newer] = await stored(admin);

    expect(
      await admin.mutation(internal.integrations.replaceToken, {
        siteId,
        kind: "netbox",
        baseUrl: read.baseUrl,
        previous: read.token,
        token: read.token,
      }),
    ).toBe(false);
    expect((await stored(admin))[0]?.token).toEqual(newer.token);
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
