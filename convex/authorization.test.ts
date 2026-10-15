import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ConvexError } from "convex/values";
import { api, components } from "./_generated/api";
import { createSignedInUser, testBackend } from "./_test/auth";
import type { TestBackend } from "./_test/auth";
import type { Role } from "./lib/roles";

// ADR 0004 levels for every public function. A new public function fails the
// first test until it is listed here with the level it needs.
const POLICY: Record<string, Role | "connector"> = {
  "buildings:clearMap": "editor",
  "buildings:create": "editor",
  "buildings:createDefaultMap": "editor",
  "buildings:list": "reader",
  "buildings:listForSite": "reader",
  "buildings:rename": "editor",
  "connector:beginLocalizationImport": "connector",
  "connector:beginNetBoxImport": "connector",
  "connector:failLocalizationImport": "connector",
  "connector:failNetBoxImport": "connector",
  "connector:heartbeatImport": "connector",
  "connector:publishLocalizationSnapshot": "connector",
  "connector:publishNetBoxGeneration": "connector",
  "connector:readLocalizationBaseline": "connector",
  "connector:readNetBoxGeneration": "connector",
  "devices:listForFloor": "reader",
  "floors:create": "editor",
  "floors:listAll": "reader",
  "floors:listForBuilding": "reader",
  "floors:rename": "editor",
  "integrationOrchestration:requestManualLocalization": "editor",
  "integrations:getState": "reader",
  "librenms:getSyncState": "reader",
  "librenms:listDiscoveredConnections": "reader",
  "links:listForDevice": "reader",
  "links:listForFloor": "reader",
  "mapDocument:getFloorDevices": "reader",
  "mapDocument:getFloorLinks": "reader",
  "mapDocument:getFloorRevision": "reader",
  "mapDocument:getFloorWalls": "reader",
  "mapOperations:apply": "editor",
  "mapOperations:observePending": "reader",
  "netbox:getSyncState": "reader",
  "netbox:listConnections": "reader",
  "netbox:listInventory": "reader",
  "presences:list": "reader",
  "presences:remove": "reader",
  "presences:updateOnlineUser": "reader",
  "sites:ensureDefault": "editor",
  "sites:get": "reader",
  "sites:getForFloor": "reader",
  "sites:list": "reader",
  "users:me": "reader",
  "walls:listForFloor": "reader",
};

type Exported = { isPublic?: unknown; requiredRole?: unknown };

const publicFunctions = async () => {
  const found: Record<string, string> = {};
  const glob = new Bun.Glob("*.ts");
  for await (const file of glob.scan(import.meta.dir)) {
    if (file.endsWith(".test.ts") || file.endsWith(".config.ts")) continue;
    const module = (await import(join(import.meta.dir, file))) as Record<
      string,
      unknown
    >;
    for (const [name, value] of Object.entries(module)) {
      const exported = value as Exported | null;
      if (exported?.isPublic !== true) continue;
      found[`${file.slice(0, -3)}:${name}`] =
        typeof exported.requiredRole === "string"
          ? exported.requiredRole
          : "connector";
    }
  }
  return found;
};

const errorCode = async (call: Promise<unknown>) => {
  try {
    await call;
    return "ok";
  } catch (error) {
    if (error instanceof ConvexError) {
      return (error.data as { code?: string }).code ?? "other";
    }
    throw error;
  }
};

const as = async (
  t: TestBackend,
  role: Role,
  options?: { banned?: boolean; expired?: boolean },
) => t.withIdentity((await createSignedInUser(t, role, options)).identity);

describe("authorization", () => {
  it("every public function requires the role ADR 0004 gives it", async () => {
    expect(await publicFunctions()).toEqual(POLICY);
  });

  it("refuses a caller without a session", async () => {
    const t = testBackend();
    expect(await errorCode(t.query(api.buildings.list, {}))).toBe(
      "unauthenticated",
    );
    expect(await errorCode(t.mutation(api.sites.ensureDefault, {}))).toBe(
      "unauthenticated",
    );
  });

  it("refuses a disabled user and an expired session", async () => {
    const t = testBackend();
    const banned = await as(t, "admin", { banned: true });
    const expired = await as(t, "admin", { expired: true });
    expect(await errorCode(banned.query(api.buildings.list, {}))).toBe(
      "unauthenticated",
    );
    expect(await errorCode(expired.query(api.buildings.list, {}))).toBe(
      "unauthenticated",
    );
  });

  it("lets a reader read and refuses their edits", async () => {
    const t = testBackend();
    const reader = await as(t, "reader");
    expect(await errorCode(reader.query(api.buildings.list, {}))).toBe("ok");
    expect(await errorCode(reader.mutation(api.sites.ensureDefault, {}))).toBe(
      "forbidden",
    );
  });

  it("lets an editor and an admin edit", async () => {
    const t = testBackend();
    for (const role of ["editor", "admin"] as const) {
      const caller = await as(t, role);
      expect(
        await errorCode(caller.mutation(api.sites.ensureDefault, {})),
      ).toBe("ok");
    }
  });

  it("gives the function the signed-in user", async () => {
    const t = testBackend();
    const { identity, name } = await createSignedInUser(t, "editor");
    expect(await t.withIdentity(identity).query(api.users.me, {})).toEqual({
      id: identity.subject,
      name,
      role: "editor",
    });
  });

  it("treats a stored role it does not know as a reader", async () => {
    const t = testBackend();
    const { identity } = await createSignedInUser(t, "reader");
    await t.run(async (ctx) => {
      await ctx.runMutation(components.betterAuth.adapter.updateOne, {
        input: {
          model: "user",
          where: [{ field: "_id", value: identity.subject }],
          update: { role: "superuser" },
        },
      });
    });
    const caller = t.withIdentity(identity);
    expect((await caller.query(api.users.me, {})).role).toBe("reader");
    expect(await errorCode(caller.mutation(api.sites.ensureDefault, {}))).toBe(
      "forbidden",
    );
  });
});
