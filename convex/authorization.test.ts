import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ConvexError } from "convex/values";
import { api, components } from "./_generated/api";
import { createSignedInUser, testBackend } from "./_test/auth.setup";
import type { TestBackend } from "./_test/auth.setup";
import type { Role } from "./lib/roles";

// ADR 0004 levels for every public function. A new public function fails the
// first test until it is listed here with the level it needs.
const POLICY: Record<string, Role> = {
  "authSettings:keycloak": "admin",
  "authSettings:setKeycloakRoleMapping": "admin",
  "buildings:create": "editor",
  "buildings:list": "reader",
  "buildings:listForSite": "reader",
  "buildings:remove": "editor",
  "buildings:rename": "editor",
  "cables:connect": "editor",
  "cables:disconnect": "editor",
  "cables:portTable": "reader",
  "collection:freshness": "reader",
  "collection:refresh": "editor",
  "collection:status": "admin",
  "devices:create": "editor",
  "devices:listForFloor": "reader",
  "devices:listForSite": "reader",
  "devices:unplacedCount": "reader",
  "devices:lastSeen": "reader",
  "devices:remove": "editor",
  "devices:updateIdentity": "editor",
  "floorOverlays:imageUrl": "reader",
  "floorOverlays:upload": "editor",
  "floors:create": "editor",
  "floors:listAll": "reader",
  "floors:listForBuilding": "reader",
  "floors:remove": "editor",
  "floors:rename": "editor",
  "health:overview": "admin",
  "history:forDevice": "editor",
  "history:forSite": "editor",
  "history:slotEntries": "editor",
  "history:slotsForDay": "editor",
  "history:snapshotsForDevice": "editor",
  "importReviews:listForSite": "editor",
  "importReviews:resolve": "editor",
  "integrations:listForSite": "admin",
  "integrations:remove": "admin",
  "librenms:saveSettings": "admin",
  "librenms:settings": "admin",
  "mapDocument:getFloorCables": "reader",
  "mapDocument:getFloorDevices": "reader",
  "mapDocument:getFloorLabels": "reader",
  "mapDocument:getFloorOverlay": "reader",
  "mapDocument:getFloorPathEnds": "reader",
  "mapDocument:getFloorPorts": "reader",
  "mapDocument:getFloorRevision": "reader",
  "mapDocument:getFloorSeenSockets": "reader",
  "mapDocument:getFloorWalls": "reader",
  "mapOperations:apply": "editor",
  "mapOperations:observePending": "reader",
  "netbox:importedCount": "admin",
  "netbox:saveSettings": "admin",
  "netbox:setPush": "admin",
  "netbox:settings": "admin",
  "presences:list": "reader",
  "presences:remove": "reader",
  "presences:updateOnlineUser": "reader",
  "sites:create": "admin",
  "sites:getSettings": "admin",
  "sites:list": "reader",
  "sites:listSettings": "admin",
  "sites:remove": "admin",
  "sites:structure": "admin",
  "sites:update": "admin",
  "sources:librenmsDevices": "admin",
  "sources:netboxChoices": "admin",
  "sources:saveIntegration": "admin",
  "sources:testIntegration": "admin",
  "unknownMacs:createDevice": "editor",
  "unknownMacs:ignore": "editor",
  "unknownMacs:listForSite": "editor",
  "unknownMacs:listIgnored": "editor",
  "unknownMacs:restore": "editor",
  "users:cancelInvitation": "admin",
  "users:invite": "admin",
  "users:list": "admin",
  "users:me": "reader",
  "users:resendInvitation": "admin",
  "users:sendTestMail": "admin",
  "users:setDisabled": "admin",
  "users:setRole": "admin",
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
          : "unguarded";
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

const errorData = async (call: Promise<unknown>) => {
  try {
    await call;
    return null;
  } catch (error) {
    if (error instanceof ConvexError) return error.data as unknown;
    throw error;
  }
};

const as = async (
  t: TestBackend,
  role: Role,
  options?: { banned?: boolean; expired?: boolean },
) => t.withIdentity((await createSignedInUser(t, role, options)).identity);

const SITE = { name: "Arles", timezone: "Europe/Paris" };

const building = (key: string, siteId = "site:missing") => ({
  siteId,
  objectId: `building:authorization:${key}`,
  name: key,
});

describe("authorization", () => {
  it("every public function requires the role ADR 0004 gives it", async () => {
    expect(await publicFunctions()).toEqual(POLICY);
  });

  it("refuses a caller without a session", async () => {
    const t = testBackend();
    expect(await errorCode(t.query(api.buildings.list, {}))).toBe(
      "unauthenticated",
    );
    expect(await errorCode(t.mutation(api.sites.create, SITE))).toBe(
      "unauthenticated",
    );
  });

  it("refuses a disabled user and an expired session, and says which", async () => {
    const t = testBackend();
    const banned = await as(t, "admin", { banned: true });
    const expired = await as(t, "admin", { expired: true });
    expect(await errorData(banned.query(api.buildings.list, {}))).toEqual({
      code: "unauthenticated",
      reason: "disabled",
    });
    expect(await errorData(expired.query(api.buildings.list, {}))).toEqual({
      code: "unauthenticated",
      reason: "expired",
    });
  });

  it("lets a reader read and refuses their edits", async () => {
    const t = testBackend();
    const reader = await as(t, "reader");
    expect(await errorCode(reader.query(api.buildings.list, {}))).toBe("ok");
    expect(
      await errorCode(reader.mutation(api.buildings.create, building("r"))),
    ).toBe("forbidden");
  });

  it("lets an editor and an admin edit, and only an admin create a site", async () => {
    const t = testBackend();
    const editor = await as(t, "editor");
    const admin = await as(t, "admin");
    expect(await errorCode(editor.mutation(api.sites.create, SITE))).toBe(
      "forbidden",
    );
    const siteId = await admin.mutation(api.sites.create, SITE);
    for (const [key, caller] of Object.entries({ editor, admin })) {
      expect(
        await errorCode(
          caller.mutation(api.buildings.create, building(key, siteId)),
        ),
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
      sso: false,
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
    expect(await errorCode(caller.mutation(api.sites.create, SITE))).toBe(
      "forbidden",
    );
  });
});
