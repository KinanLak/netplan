import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";
import {
  expireVisuals,
  projectionPositions,
  publishProjectionTarget,
} from "./computerProjection";
import { publishComputerLocations } from "./localizationModel";
import { applyIntegrationDeviceRelocation } from "./mapOperations";
import schema from "./schema";

let sequence = 0;
const computerExternalId = "netbox:computer:1";
const socketExternalId = "netbox:socket:1";

const computer = {
  instanceKey: "netbox-main",
  name: "Managed workstation",
  hostname: "pc-001",
  ip: "192.0.2.10",
  model: "Tiny",
  url: "https://netbox.example/devices/1",
  location: "Office",
  locationPath: ["Office"],
  role: "Workstation",
  lifecycleStatus: "active",
  syncedAt: 1,
};

const deviceRow = (
  objectId: string,
  floorId: string,
  type: "pc" | "wall-port",
  position: { x: number; y: number },
) => ({
  objectId,
  floorId,
  type,
  name: objectId,
  hostname: type === "pc" ? objectId : undefined,
  position,
  size:
    type === "wall-port"
      ? { width: 40, height: 40 }
      : { width: 80, height: 80 },
  metadata: type === "pc" ? { lastUser: "preserve-me" } : {},
  updatedAt: 1,
  updatedBy: "test",
});

async function setup() {
  sequence += 1;
  const t = convexTest(schema, modules);
  const siteId = await t.mutation(api.sites.ensureDefault, {});
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
    objectId: `building:projection:${sequence}`,
    name: "Projection",
  });
  const floorA = await t.mutation(api.floors.create, {
    buildingId,
    objectId: `floor:projection:${sequence}:a`,
    name: "A",
  });
  const floorB = await t.mutation(api.floors.create, {
    buildingId,
    objectId: `floor:projection:${sequence}:b`,
    name: "B",
  });
  const socketId = `device:socket:${sequence}`;
  const socket = deviceRow(socketId, floorB, "wall-port", { x: 400, y: 400 });
  await t.run(async (ctx) => {
    await ctx.db.insert("devices", socket);
    await ctx.db.insert("externalObjectBindings", {
      siteId,
      provider: "netbox",
      instanceKey: "netbox-main",
      externalId: socketExternalId,
      deviceId: socketId,
      floorId: floorB,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return { t, siteId, floorA, floorB, socket };
}

async function seedWork(
  fixture: Awaited<ReturnType<typeof setup>>,
  options: {
    cycleId?: string;
    existingFloorId?: string;
    existingPosition?: { x: number; y: number };
    targetPosition?: { x: number; y: number };
  } = {},
) {
  const cycleId = options.cycleId ?? `cycle:${sequence}`;
  const targetPosition =
    options.targetPosition ?? projectionPositions(fixture.socket)[0];
  let existingDeviceId: string | undefined;
  await fixture.t.run(async (ctx) => {
    if (options.existingFloorId && options.existingPosition) {
      existingDeviceId = `device:computer:${sequence}`;
      await ctx.db.insert(
        "devices",
        deviceRow(
          existingDeviceId,
          options.existingFloorId,
          "pc",
          options.existingPosition,
        ),
      );
      await ctx.db.insert("externalObjectBindings", {
        siteId: fixture.siteId,
        provider: "netbox",
        instanceKey: "netbox-main",
        externalId: computerExternalId,
        deviceId: existingDeviceId,
        floorId: options.existingFloorId,
        createdAt: 1,
        updatedAt: 1,
      });
    }
    await ctx.db.insert("computerLocations", {
      siteId: fixture.siteId,
      computerExternalId,
      state: "online",
      socketExternalId,
      firstPresentCycleId: cycleId,
      lastPresentCycleId: cycleId,
      consecutiveAbsences: 0,
      lastConfirmedSocketExternalId: socketExternalId,
      projectionStatus: "pending",
      projectionCycleId: cycleId,
      lastPresenceAt: 1,
      visualExpiresAt: Date.now() + 1_000_000,
      updatedAt: 1,
    });
    await ctx.db.insert("computerProjections", {
      siteId: fixture.siteId,
      computerExternalId,
      cycleId,
      state: "pending",
      fence: 0,
      attemptCount: 0,
      nextAttemptAt: 0,
      socketExternalId,
      socketDeviceId: fixture.socket.objectId,
      sourceFloorId: options.existingFloorId,
      sourcePosition: options.existingPosition,
      targetFloorId: fixture.floorB,
      targetPosition,
      computer,
      createdAt: 1,
      updatedAt: 1,
    });
  });
  return { cycleId, existingDeviceId, targetPosition };
}

async function runWork(
  fixture: Awaited<ReturnType<typeof setup>>,
  cycleId: string,
  leaseId = `lease:${sequence}`,
) {
  const claim = await fixture.t.mutation(internal.computerProjection.claim, {
    siteId: fixture.siteId,
    computerExternalId,
    cycleId,
    leaseId,
  });
  expect(claim.status).toBe("claimed");
  if (claim.fence === undefined) throw new Error("Projection was not fenced");
  const result = await fixture.t.mutation(internal.computerProjection.execute, {
    siteId: fixture.siteId,
    computerExternalId,
    cycleId,
    leaseId,
    fence: claim.fence,
  });
  return { result, fence: claim.fence };
}

const projectionRow = async (fixture: Awaited<ReturnType<typeof setup>>) =>
  await fixture.t.run(
    async (ctx) => await ctx.db.query("computerProjections").unique(),
  );

describe("computer map projection", () => {
  it("creates one bound computer and records success only after the map write", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture);
    expect((await projectionRow(fixture))?.state).toBe("pending");

    expect((await runWork(fixture, work.cycleId)).result).toBe("success");

    await fixture.t.run(async (ctx) => {
      const devices = (await ctx.db.query("devices").collect()).filter(
        (row) => row.type === "pc",
      );
      const bindings = await ctx.db
        .query("externalObjectBindings")
        .withIndex("by_external", (q) =>
          q
            .eq("siteId", fixture.siteId)
            .eq("provider", "netbox")
            .eq("instanceKey", "netbox-main")
            .eq("externalId", computerExternalId),
        )
        .collect();
      const location = await ctx.db.query("computerLocations").unique();
      expect(devices).toHaveLength(1);
      expect(bindings).toHaveLength(1);
      expect(location).toMatchObject({
        projectionStatus: "success",
        lastKnownFloorId: fixture.floorB,
        lastKnownPosition: devices[0]?.position,
        lastProjectedCycleId: work.cycleId,
      });
      expect(await ctx.db.query("documentRevisions").unique()).toMatchObject({
        floorId: fixture.floorB,
        revision: 1,
      });
      const history = await ctx.db.query("integrationMapOperations").unique();
      expect(history).toMatchObject({
        origin: "integration",
        expectedCycleId: work.cycleId,
        deviceId: devices[0]?.objectId,
        status: "applied",
        floors: [
          {
            floorId: fixture.floorB,
            effect: "device-created",
            revision: 1,
          },
        ],
      });
      expect(await ctx.db.query("clientOperations").collect()).toHaveLength(0);
      expect(devices[0]?.metadata.macs).toBeUndefined();
      const projection = await ctx.db.query("computerProjections").unique();
      expect(Object.hasOwn(projection?.computer ?? {}, "macs")).toBe(false);
    });
    const presented = await fixture.t.query(api.mapDocument.getFloorDevices, {
      floorId: fixture.floorB,
    });
    expect(
      presented.find((device) => device.type === "pc")?.metadata.localization,
    ).toMatchObject({
      state: "online",
      positionState: "current",
      projectionStatus: "success",
      targetFloorId: fixture.floorB,
      targetPosition: work.targetPosition,
    });
  });

  it("moves on one floor without changing user fields or links", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, {
      existingFloorId: fixture.floorB,
      existingPosition: { x: 0, y: 0 },
    });
    await fixture.t.run(async (ctx) => {
      const neighbor = deviceRow(
        `device:neighbor:${sequence}`,
        fixture.floorB,
        "pc",
        { x: 900, y: 900 },
      );
      await ctx.db.insert("devices", neighbor);
      await ctx.db.insert("links", {
        objectId: `link:${sequence}`,
        floorId: fixture.floorB,
        fromDeviceId: work.existingDeviceId as string,
        toDeviceId: neighbor.objectId,
        label: "keep",
        updatedAt: 1,
        updatedBy: "user",
      });
    });

    expect((await runWork(fixture, work.cycleId)).result).toBe("success");
    await fixture.t.run(async (ctx) => {
      const device = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) =>
          q.eq("objectId", work.existingDeviceId as string),
        )
        .unique();
      expect(device).toMatchObject({
        name: work.existingDeviceId,
        metadata: { lastUser: "preserve-me" },
        floorId: fixture.floorB,
        position: work.targetPosition,
      });
      expect(await ctx.db.query("links").collect()).toHaveLength(1);
    });
  });

  it("moves across floors atomically and bumps both revisions", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, {
      existingFloorId: fixture.floorA,
      existingPosition: { x: 0, y: 0 },
    });

    expect((await runWork(fixture, work.cycleId)).result).toBe("success");
    await fixture.t.run(async (ctx) => {
      const device = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) =>
          q.eq("objectId", work.existingDeviceId as string),
        )
        .unique();
      const binding = await ctx.db
        .query("externalObjectBindings")
        .withIndex("by_device", (q) =>
          q.eq("deviceId", work.existingDeviceId as string),
        )
        .unique();
      const revisions = await ctx.db.query("documentRevisions").collect();
      expect(device?.floorId).toBe(fixture.floorB);
      expect(binding?.floorId).toBe(fixture.floorB);
      expect(new Set(revisions.map((row) => row.floorId))).toEqual(
        new Set([fixture.floorA, fixture.floorB]),
      );
      expect(
        revisions.find((row) => row.floorId === fixture.floorA)?.revision,
      ).toBe(2);
      expect(
        revisions.find((row) => row.floorId === fixture.floorB)?.revision,
      ).toBe(1);
      expect(
        await ctx.db.query("integrationMapOperations").unique(),
      ).toMatchObject({
        status: "applied",
        floors: [
          {
            floorId: fixture.floorA,
            effect: "device-removed",
            revision: 2,
          },
          {
            floorId: fixture.floorB,
            effect: "device-added",
            revision: 1,
          },
        ],
      });
    });
  });

  it("blocks a linked cross-floor move without any destructive write", async () => {
    const fixture = await setup();
    const sourcePosition = { x: 0, y: 0 };
    const work = await seedWork(fixture, {
      existingFloorId: fixture.floorA,
      existingPosition: sourcePosition,
    });
    await fixture.t.run(async (ctx) => {
      const neighbor = deviceRow(
        `device:neighbor:${sequence}`,
        fixture.floorA,
        "pc",
        { x: 200, y: 0 },
      );
      await ctx.db.insert("devices", neighbor);
      await ctx.db.insert("links", {
        objectId: `link:${sequence}`,
        floorId: fixture.floorA,
        fromDeviceId: work.existingDeviceId as string,
        toDeviceId: neighbor.objectId,
        updatedAt: 1,
        updatedBy: "user",
      });
    });

    expect((await runWork(fixture, work.cycleId)).result).toBe("blocked");
    await fixture.t.run(async (ctx) => {
      const device = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) =>
          q.eq("objectId", work.existingDeviceId as string),
        )
        .unique();
      expect(device).toMatchObject({
        floorId: fixture.floorA,
        position: sourcePosition,
      });
      expect(await ctx.db.query("links").collect()).toHaveLength(1);
      expect(await ctx.db.query("documentRevisions").collect()).toEqual([
        expect.objectContaining({ floorId: fixture.floorA, revision: 2 }),
      ]);
      expect(
        await ctx.db.query("integrationMapOperations").unique(),
      ).toMatchObject({
        status: "rejected",
        reason: "blocked-by-links",
        floors: [],
      });
      expect(await ctx.db.query("computerProjections").unique()).toMatchObject({
        state: "blocked",
        errorCode: "blocked_by_links",
      });
    });
    const retained = await fixture.t.query(api.mapDocument.getFloorDevices, {
      floorId: fixture.floorA,
    });
    expect(
      retained.find((device) => device.id === work.existingDeviceId)?.metadata
        .localization,
    ).toMatchObject({
      state: "online",
      positionState: "historical",
      projectionStatus: "blocked",
      targetFloorId: fixture.floorB,
      targetPosition: work.targetPosition,
      errorCode: "blocked_by_links",
    });

    const blockedCycle = await fixture.t.run(
      async (ctx) =>
        await publishProjectionTarget(ctx, {
          siteId: fixture.siteId,
          computerExternalId,
          cycleId: "cycle:new-same-target",
          socketExternalId,
          socketDevice: {
            ...fixture.socket,
            _id: (await ctx.db
              .query("devices")
              .withIndex("by_object_id", (q) =>
                q.eq("objectId", fixture.socket.objectId),
              )
              .unique())!._id,
            _creationTime: 1,
          },
          computer,
          occurredAt: Date.now(),
          canKeepSuccess: false,
          canKeepBlocked: true,
        }),
    );
    expect(blockedCycle).toMatchObject({
      published: false,
      status: "blocked",
      cycleId: work.cycleId,
      errorCode: "blocked_by_links",
    });
    expect(await projectionRow(fixture)).toMatchObject({
      state: "blocked",
      cycleId: work.cycleId,
      attemptCount: 1,
    });
  });

  it("chooses a deterministic free slot and retries collisions at 1, 5, 30 minutes", async () => {
    const fixture = await setup();
    const candidates = projectionPositions(fixture.socket);
    await fixture.t.run(async (ctx) => {
      for (const [index, position] of candidates.entries()) {
        await ctx.db.insert(
          "devices",
          deviceRow(
            `device:blocker:${sequence}:${index}`,
            fixture.floorB,
            "pc",
            position,
          ),
        );
      }
    });
    const work = await seedWork(fixture, { targetPosition: candidates[0] });
    const expectedDelays = [60_000, 5 * 60_000, 30 * 60_000, undefined];
    for (const [index, expectedDelay] of expectedDelays.entries()) {
      if (index > 0) {
        await fixture.t.run(async (ctx) => {
          const row = await ctx.db.query("computerProjections").unique();
          if (!row) throw new Error("Missing projection");
          await ctx.db.patch(row._id, { nextAttemptAt: 0 });
        });
      }
      const before = Date.now();
      expect(
        (await runWork(fixture, work.cycleId, `retry:${index}`)).result,
      ).toBe("error");
      const row = await projectionRow(fixture);
      expect(row).toMatchObject({
        state: "error",
        errorCode: "device_collision",
      });
      if (expectedDelay === undefined)
        expect(row?.nextAttemptAt).toBeUndefined();
      else {
        expect((row?.nextAttemptAt ?? 0) - before).toBeGreaterThanOrEqual(
          expectedDelay,
        );
        expect((row?.nextAttemptAt ?? 0) - before).toBeLessThan(
          expectedDelay + 2_000,
        );
      }
    }
  });

  it("rejects projection positions that collide with walls", async () => {
    const fixture = await setup();
    const candidates = projectionPositions(fixture.socket);
    await fixture.t.run(async (ctx) => {
      for (const [index, position] of candidates.entries()) {
        const point = { x: position.x + 40, y: position.y + 40 };
        await ctx.db.insert("walls", {
          objectId: `wall:projection:${sequence}:${index}`,
          floorId: fixture.floorB,
          start: point,
          end: point,
          color: "concrete",
          geometryKey: `${point.x}:${point.y}:${point.x}:${point.y}`,
          updatedAt: 1,
          updatedBy: "test",
        });
      }
    });
    const work = await seedWork(fixture);

    expect((await runWork(fixture, work.cycleId)).result).toBe("error");
    expect(await projectionRow(fixture)).toMatchObject({
      state: "error",
      errorCode: "wall_collision",
    });
    await fixture.t.run(async (ctx) => {
      expect(
        (await ctx.db.query("devices").collect()).filter(
          (row) => row.type === "pc",
        ),
      ).toHaveLength(0);
    });
  });

  it("enforces wall collision inside the internal map-domain operation", async () => {
    const fixture = await setup();
    const targetPosition = projectionPositions(fixture.socket)[0];
    const work = await seedWork(fixture, { targetPosition });
    const claim = await fixture.t.mutation(internal.computerProjection.claim, {
      siteId: fixture.siteId,
      computerExternalId,
      cycleId: work.cycleId,
      leaseId: "lease:wall-domain",
    });
    await fixture.t.run(async (ctx) => {
      const location = await ctx.db.query("computerLocations").unique();
      expect(location).toMatchObject({
        projectionStatus: "running",
        projectionTargetFloorId: fixture.floorB,
        projectionTargetPosition: targetPosition,
      });
      expect(location?.projectionErrorCode).toBeUndefined();
      expect(location?.projectionNextAttemptAt).toBeUndefined();
    });
    const point = {
      x: targetPosition.x + 40,
      y: targetPosition.y + 40,
    };
    await fixture.t.run(async (ctx) => {
      await ctx.db.insert("walls", {
        objectId: `wall:domain:${sequence}`,
        floorId: fixture.floorB,
        start: point,
        end: point,
        color: "concrete",
        geometryKey: `${point.x}:${point.y}:${point.x}:${point.y}`,
        updatedAt: 1,
        updatedBy: "test",
      });
    });

    const result = await fixture.t.run((ctx) =>
      applyIntegrationDeviceRelocation(ctx, {
        kind: "system.device.relocate",
        origin: "integration",
        operationId: `projection:wall-domain:${sequence}`,
        expectedCycleId: work.cycleId,
        expectedFence: claim.fence as number,
        siteId: fixture.siteId,
        computerExternalId,
        device: {
          id: `device:auto:${encodeURIComponent(fixture.siteId)}:netbox-main:${encodeURIComponent(computerExternalId)}`,
          name: computer.name,
          hostname: computer.hostname,
          size: { width: 80, height: 80 },
          metadata: {
            source: {
              provider: "netbox",
              siteId: fixture.siteId,
              instanceKey: computer.instanceKey,
              externalId: computerExternalId,
              url: computer.url,
              location: computer.location,
              locationPath: computer.locationPath,
              role: computer.role,
              lifecycleStatus: computer.lifecycleStatus,
              syncedAt: computer.syncedAt,
            },
          },
        },
        source: null,
        target: { floorId: fixture.floorB, position: targetPosition },
        occurredAt: Date.now(),
      }),
    );

    expect(result).toMatchObject({
      status: "rejected",
      reason: "wall-collision",
      floors: [],
    });
    expect(await projectionRow(fixture)).toMatchObject({ state: "running" });
    await fixture.t.run(async (ctx) => {
      expect(
        await ctx.db.query("integrationMapOperations").unique(),
      ).toMatchObject({
        origin: "integration",
        status: "rejected",
        reason: "wall-collision",
      });
      expect(
        (await ctx.db.query("devices").collect()).filter(
          (row) => row.type === "pc",
        ),
      ).toHaveLength(0);
    });
  });

  it("uses a durable 200x200 size for server device and wall collisions", async () => {
    for (const collision of ["device", "wall"] as const) {
      const fixture = await setup();
      const work = await seedWork(fixture, {
        cycleId: `cycle:resized:${collision}`,
        existingFloorId: fixture.floorA,
        existingPosition: { x: 0, y: 0 },
      });
      const claim = await fixture.t.mutation(
        internal.computerProjection.claim,
        {
          siteId: fixture.siteId,
          computerExternalId,
          cycleId: work.cycleId,
          leaseId: `lease:resized:${collision}`,
        },
      );
      await fixture.t.run(async (ctx) => {
        const moving = await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) =>
            q.eq("objectId", work.existingDeviceId as string),
          )
          .unique();
        if (!moving) throw new Error("Missing resized device");
        await ctx.db.patch(moving._id, {
          size: { width: 200, height: 200 },
        });
        if (collision === "device") {
          await ctx.db.insert(
            "devices",
            deviceRow(
              `device:resized-blocker:${sequence}`,
              fixture.floorB,
              "pc",
              {
                x: work.targetPosition.x + 160,
                y: work.targetPosition.y,
              },
            ),
          );
        } else {
          const x = work.targetPosition.x + 160;
          await ctx.db.insert("walls", {
            objectId: `wall:resized-blocker:${sequence}`,
            floorId: fixture.floorB,
            start: { x, y: work.targetPosition.y },
            end: { x, y: work.targetPosition.y + 200 },
            color: "concrete",
            geometryKey: `${x}:${work.targetPosition.y}:${x}:${work.targetPosition.y + 200}`,
            updatedAt: 1,
            updatedBy: "test",
          });
        }
      });

      const result = await fixture.t.run((ctx) =>
        applyIntegrationDeviceRelocation(ctx, {
          kind: "system.device.relocate",
          origin: "integration",
          operationId: `projection:resized:${collision}:${sequence}`,
          expectedCycleId: work.cycleId,
          expectedFence: claim.fence as number,
          siteId: fixture.siteId,
          computerExternalId,
          device: {
            id: work.existingDeviceId as string,
            name: computer.name,
            hostname: computer.hostname,
            size: { width: 80, height: 80 },
            metadata: {},
          },
          source: { floorId: fixture.floorA, position: { x: 0, y: 0 } },
          target: {
            floorId: fixture.floorB,
            position: work.targetPosition,
          },
          occurredAt: Date.now(),
        }),
      );

      expect(result).toMatchObject({
        status: "rejected",
        reason: `${collision}-collision`,
        floors: [],
      });
      await fixture.t.run(async (ctx) => {
        const moving = await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) =>
            q.eq("objectId", work.existingDeviceId as string),
          )
          .unique();
        expect(moving).toMatchObject({
          floorId: fixture.floorA,
          position: { x: 0, y: 0 },
          size: { width: 200, height: 200 },
        });
      });
    }
  });

  it("fences a stale cycle before map writes", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, { cycleId: "cycle:old" });
    const claim = await fixture.t.mutation(internal.computerProjection.claim, {
      siteId: fixture.siteId,
      computerExternalId,
      cycleId: work.cycleId,
      leaseId: "lease:old",
    });
    await fixture.t.run(async (ctx) => {
      const projection = await ctx.db.query("computerProjections").unique();
      const location = await ctx.db.query("computerLocations").unique();
      if (!projection || !location) throw new Error("Missing work");
      await ctx.db.patch(projection._id, {
        cycleId: "cycle:new",
        state: "pending",
        fence: projection.fence + 1,
      });
      await ctx.db.patch(location._id, { projectionCycleId: "cycle:new" });
    });

    expect(
      await fixture.t.mutation(internal.computerProjection.execute, {
        siteId: fixture.siteId,
        computerExternalId,
        cycleId: work.cycleId,
        leaseId: "lease:old",
        fence: claim.fence as number,
      }),
    ).toBe("stale");
    await fixture.t.run(async (ctx) => {
      expect(
        (await ctx.db.query("devices").collect()).filter(
          (row) => row.type === "pc",
        ),
      ).toHaveLength(0);
      expect(await ctx.db.query("documentRevisions").collect()).toHaveLength(0);
    });
  });

  it("recomputes placement from the current socket position at execution", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture);
    const claim = await fixture.t.mutation(internal.computerProjection.claim, {
      siteId: fixture.siteId,
      computerExternalId,
      cycleId: work.cycleId,
      leaseId: "lease:moved-socket",
    });
    const movedSocketPosition = { x: 1_400, y: 800 };
    await fixture.t.run(async (ctx) => {
      const socket = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) =>
          q.eq("objectId", fixture.socket.objectId),
        )
        .unique();
      if (!socket) throw new Error("Missing socket");
      await ctx.db.patch(socket._id, { position: movedSocketPosition });
    });

    expect(
      await fixture.t.mutation(internal.computerProjection.execute, {
        siteId: fixture.siteId,
        computerExternalId,
        cycleId: work.cycleId,
        leaseId: "lease:moved-socket",
        fence: claim.fence as number,
      }),
    ).toBe("success");
    const expectedPosition = projectionPositions({
      ...fixture.socket,
      position: movedSocketPosition,
    })[0];
    await fixture.t.run(async (ctx) => {
      const projected = (await ctx.db.query("devices").collect()).find(
        (device) => device.type === "pc",
      );
      expect(projected?.position).toEqual(expectedPosition);
      expect(projected?.position).not.toEqual(work.targetPosition);
      expect(await ctx.db.query("computerProjections").unique()).toMatchObject({
        targetPosition: expectedPosition,
      });
    });
  });

  it("rejects the wrong lease and recovers an expired lease in the bounded sweep", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture);
    const claim = await fixture.t.mutation(internal.computerProjection.claim, {
      siteId: fixture.siteId,
      computerExternalId,
      cycleId: work.cycleId,
      leaseId: "lease:right",
    });
    expect(
      await fixture.t.mutation(internal.computerProjection.execute, {
        siteId: fixture.siteId,
        computerExternalId,
        cycleId: work.cycleId,
        leaseId: "lease:wrong",
        fence: claim.fence as number,
      }),
    ).toBe("stale");
    await fixture.t.run(async (ctx) => {
      const row = await ctx.db.query("computerProjections").unique();
      if (!row) throw new Error("Missing projection");
      await ctx.db.patch(row._id, { leaseExpiresAt: 1 });
    });

    expect(
      await fixture.t.mutation(internal.computerProjection.sweep, {}),
    ).toMatchObject({ claimed: 1 });
    const recovered = await projectionRow(fixture);
    expect(recovered).toMatchObject({ state: "running" });
    expect(recovered?.fence).toBeGreaterThan(claim.fence as number);
  });

  it("expires presentation once and a return restores the same durable device and link", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, {
      existingFloorId: fixture.floorB,
      existingPosition: { x: 0, y: 0 },
    });
    await fixture.t.run(async (ctx) => {
      const neighbor = deviceRow(
        `device:neighbor:${sequence}`,
        fixture.floorB,
        "pc",
        { x: 900, y: 900 },
      );
      await ctx.db.insert("devices", neighbor);
      await ctx.db.insert("links", {
        objectId: `link:${sequence}`,
        floorId: fixture.floorB,
        fromDeviceId: work.existingDeviceId as string,
        toDeviceId: neighbor.objectId,
        updatedAt: 1,
        updatedBy: "user",
      });
      const location = await ctx.db.query("computerLocations").unique();
      if (!location) throw new Error("Missing location");
      await ctx.db.patch(location._id, {
        state: "offline",
        consecutiveAbsences: 2,
        visualExpiresAt: 1,
        projectionStatus: "idle",
        projectionCycleId: undefined,
      });
    });

    expect(
      await fixture.t.query(api.mapDocument.getFloorDevices, {
        floorId: fixture.floorB,
      }),
    ).toHaveLength(3);
    await fixture.t.mutation(internal.computerProjection.sweep, {});
    await fixture.t.mutation(internal.computerProjection.sweep, {});
    expect(
      await fixture.t.query(api.mapDocument.getFloorDevices, {
        floorId: fixture.floorB,
      }),
    ).toHaveLength(2);
    expect(
      await fixture.t.query(api.mapDocument.getFloorLinks, {
        floorId: fixture.floorB,
      }),
    ).toHaveLength(0);
    const replacementId = `device:replacement:${sequence}`;
    expect(
      await fixture.t.mutation(api.mapOperations.apply, {
        operation: {
          kind: "device.create",
          meta: {
            opId: `op:replacement:${sequence}`,
            clientId: "client:test",
            clientSeq: 1,
            createdAt: Date.now(),
          },
          device: {
            id: replacementId,
            floorId: fixture.floorB,
            type: "pc",
            name: "Replacement",
            position: { x: 0, y: 0 },
            size: { width: 80, height: 80 },
            metadata: {},
          },
        },
      }),
    ).toMatchObject({ status: "applied" });
    await fixture.t.run(async (ctx) => {
      expect(await ctx.db.query("devices").collect()).toHaveLength(4);
      expect(await ctx.db.query("links").collect()).toHaveLength(1);
      expect(
        (await ctx.db.query("localizationEvents").collect()).filter(
          (event) => event.kind === "expired",
        ),
      ).toHaveLength(1);
      const location = await ctx.db.query("computerLocations").unique();
      if (!location) throw new Error("Missing location");
      await ctx.db.patch(location._id, {
        state: "online",
        consecutiveAbsences: 0,
        expiredAt: undefined,
        projectionStatus: "pending",
        projectionCycleId: "cycle:return",
        lastPresentCycleId: "cycle:return",
        visualExpiresAt: Date.now() + 1_000_000,
      });
      await ctx.db.insert("computerProjections", {
        siteId: fixture.siteId,
        computerExternalId,
        cycleId: "cycle:return",
        state: "pending",
        fence: 0,
        attemptCount: 0,
        nextAttemptAt: 0,
        socketExternalId,
        socketDeviceId: fixture.socket.objectId,
        sourceFloorId: fixture.floorB,
        sourcePosition: { x: 0, y: 0 },
        targetFloorId: fixture.floorB,
        targetPosition: work.targetPosition,
        computer,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    expect(
      (await runWork(fixture, "cycle:return", "lease:return")).result,
    ).toBe("success");
    const active = await fixture.t.query(api.mapDocument.getFloorDevices, {
      floorId: fixture.floorB,
    });
    expect(active.some((device) => device.id === work.existingDeviceId)).toBe(
      true,
    );
    await fixture.t.run(async (ctx) => {
      expect(
        (await ctx.db.query("devices").collect()).filter(
          (row) => row.type === "pc",
        ),
      ).toHaveLength(3);
      expect(await ctx.db.query("links").collect()).toHaveLength(1);
      const replacement = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", replacementId))
        .unique();
      const returning = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) =>
          q.eq("objectId", work.existingDeviceId as string),
        )
        .unique();
      expect(replacement?.position).toEqual({ x: 0, y: 0 });
      expect(returning?.position).toEqual(work.targetPosition);
    });
  });

  it("expires exactly fifteen days after last presence without undefined-index starvation", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, {
      existingFloorId: fixture.floorB,
      existingPosition: { x: 0, y: 0 },
    });
    const lastPresenceAt = 10_000;
    const expiresAt = lastPresenceAt + 15 * 24 * 60 * 60 * 1000;
    await fixture.t.run(async (ctx) => {
      const due = await ctx.db.query("computerLocations").unique();
      if (!due) throw new Error("Missing due location");
      await ctx.db.patch(due._id, {
        state: "offline",
        lastPresenceAt,
        visualExpiresAt: expiresAt,
      });
      await ctx.db.insert("computerLocations", {
        siteId: fixture.siteId,
        computerExternalId: "computer:never-present",
        state: "missing",
        consecutiveAbsences: 1,
        projectionStatus: "idle",
        updatedAt: 1,
      });
    });

    expect(
      await fixture.t.run((ctx) => expireVisuals(ctx, expiresAt - 1)),
    ).toBe(0);
    expect(await fixture.t.run((ctx) => expireVisuals(ctx, expiresAt))).toBe(1);
    expect(
      await fixture.t.run((ctx) => expireVisuals(ctx, expiresAt + 1)),
    ).toBe(0);
    await fixture.t.run(async (ctx) => {
      const location = await ctx.db
        .query("computerLocations")
        .withIndex("by_site_computer", (q) =>
          q
            .eq("siteId", fixture.siteId)
            .eq("computerExternalId", computerExternalId),
        )
        .unique();
      expect(location?.expiredAt).toBe(expiresAt);
      expect(
        (await ctx.db.query("localizationEvents").collect()).filter(
          (event) => event.kind === "expired",
        ),
      ).toHaveLength(1);
      expect(work.existingDeviceId).toBeDefined();
    });
  });

  it("keeps an online computer visible through a fifteen-day source outage", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, {
      existingFloorId: fixture.floorB,
      existingPosition: { x: 0, y: 0 },
    });
    const overdue = Date.now() - 15 * 24 * 60 * 60 * 1000;
    await fixture.t.run(async (ctx) => {
      const location = await ctx.db.query("computerLocations").unique();
      if (!location) throw new Error("Missing location");
      await ctx.db.patch(location._id, {
        state: "online",
        visualExpiresAt: overdue,
      });
    });

    expect(await fixture.t.run((ctx) => expireVisuals(ctx, Date.now()))).toBe(
      0,
    );
    expect(
      await fixture.t.query(api.mapDocument.getFloorDevices, {
        floorId: fixture.floorB,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: work.existingDeviceId }),
      ]),
    );
    await fixture.t.run(async (ctx) => {
      expect(await ctx.db.query("computerLocations").unique()).toMatchObject({
        state: "online",
      });
      expect(
        (await ctx.db.query("computerLocations").unique())?.expiredAt,
      ).toBeUndefined();
      expect(await ctx.db.query("localizationEvents").collect()).toHaveLength(
        0,
      );
    });
  });

  it("reconciles a newer cycle without creating a duplicate external device", async () => {
    const fixture = await setup();
    const first = await seedWork(fixture, { cycleId: "cycle:first" });
    await runWork(fixture, first.cycleId, "lease:first");
    await fixture.t.run(async (ctx) => {
      const projection = await ctx.db.query("computerProjections").unique();
      const location = await ctx.db.query("computerLocations").unique();
      const binding = await ctx.db
        .query("externalObjectBindings")
        .withIndex("by_external", (q) =>
          q
            .eq("siteId", fixture.siteId)
            .eq("provider", "netbox")
            .eq("instanceKey", "netbox-main")
            .eq("externalId", computerExternalId),
        )
        .unique();
      const device = binding ? await ctx.db.get(binding._id) : null;
      const placedDevice = binding
        ? await ctx.db
            .query("devices")
            .withIndex("by_object_id", (q) =>
              q.eq("objectId", binding.deviceId),
            )
            .unique()
        : null;
      if (!projection || !location || !binding || !placedDevice || !device) {
        throw new Error("Missing first projection result");
      }
      await ctx.db.patch(location._id, {
        projectionStatus: "pending",
        projectionCycleId: "cycle:second",
        lastPresentCycleId: "cycle:second",
      });
      await ctx.db.replace(projection._id, {
        siteId: fixture.siteId,
        computerExternalId,
        cycleId: "cycle:second",
        state: "pending",
        fence: projection.fence + 1,
        attemptCount: 0,
        nextAttemptAt: 0,
        socketExternalId,
        socketDeviceId: fixture.socket.objectId,
        sourceFloorId: placedDevice.floorId,
        sourcePosition: placedDevice.position,
        targetFloorId: fixture.floorB,
        targetPosition: placedDevice.position,
        computer,
        createdAt: projection.createdAt,
        updatedAt: Date.now(),
      });
    });
    expect(
      (await runWork(fixture, "cycle:second", "lease:second")).result,
    ).toBe("success");
    await fixture.t.run(async (ctx) => {
      expect(
        (await ctx.db.query("devices").collect()).filter(
          (row) => row.type === "pc",
        ),
      ).toHaveLength(1);
      expect(
        await ctx.db
          .query("externalObjectBindings")
          .withIndex("by_external", (q) =>
            q
              .eq("siteId", fixture.siteId)
              .eq("provider", "netbox")
              .eq("instanceKey", "netbox-main")
              .eq("externalId", computerExternalId),
          )
          .collect(),
      ).toHaveLength(1);
    });
  });

  it("keeps a map-owned position for an unchanged successful socket", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, { cycleId: "cycle:stable" });
    await runWork(fixture, work.cycleId, "lease:stable");
    const mapOwnedPosition = { x: 1_000, y: 120 };
    await fixture.t.run(async (ctx) => {
      const device = (await ctx.db.query("devices").collect()).find(
        (row) => row.type === "pc",
      );
      if (!device) throw new Error("Missing projected device");
      await ctx.db.patch(device._id, { position: mapOwnedPosition });
    });

    const result = await fixture.t.run(
      async (ctx) =>
        await publishProjectionTarget(ctx, {
          siteId: fixture.siteId,
          computerExternalId,
          cycleId: "cycle:new-observation",
          socketExternalId,
          socketDevice: await ctx.db
            .query("devices")
            .withIndex("by_object_id", (q) =>
              q.eq("objectId", fixture.socket.objectId),
            )
            .unique()
            .then((row) => {
              if (!row) throw new Error("Missing socket");
              return row;
            }),
          computer,
          occurredAt: Date.now(),
          canKeepSuccess: true,
          canKeepBlocked: false,
        }),
    );

    expect(result.published).toBe(false);
    expect(result.targetPosition).toEqual(mapOwnedPosition);
    expect(await projectionRow(fixture)).toMatchObject({
      cycleId: "cycle:stable",
      state: "success",
    });
    await fixture.t.run(async (ctx) => {
      const device = (await ctx.db.query("devices").collect()).find(
        (row) => row.type === "pc",
      );
      expect(device?.position).toEqual(mapOwnedPosition);
    });
  });

  it("invalidates old projection work when a complete inventory drops the computer", async () => {
    const fixture = await setup();
    const work = await seedWork(fixture, { cycleId: "cycle:old-inventory" });
    const claim = await fixture.t.mutation(internal.computerProjection.claim, {
      siteId: fixture.siteId,
      computerExternalId,
      cycleId: work.cycleId,
      leaseId: "lease:old-inventory",
    });

    await fixture.t.run(
      async (ctx) =>
        await publishComputerLocations(ctx, {
          siteId: fixture.siteId,
          cycleId: "cycle:new-inventory",
          occurredAt: Date.now(),
          inventory: [],
          observations: [],
          switchResults: [],
          candidates: [],
          diagnostics: [],
        }),
    );

    expect(await projectionRow(fixture)).toBeNull();
    expect(
      await fixture.t.mutation(internal.computerProjection.execute, {
        siteId: fixture.siteId,
        computerExternalId,
        cycleId: work.cycleId,
        leaseId: "lease:old-inventory",
        fence: claim.fence as number,
      }),
    ).toBe("stale");
    await fixture.t.run(async (ctx) => {
      expect(await ctx.db.query("computerLocations").unique()).toMatchObject({
        state: "missing",
        consecutiveAbsences: 1,
      });
      await publishComputerLocations(ctx, {
        siteId: fixture.siteId,
        cycleId: "cycle:second-missing-inventory",
        occurredAt: Date.now() + 1,
        inventory: [],
        observations: [],
        switchResults: [],
        candidates: [],
        diagnostics: [],
      });
    });
    await fixture.t.run(async (ctx) => {
      expect(await ctx.db.query("computerLocations").unique()).toMatchObject({
        state: "offline",
        consecutiveAbsences: 2,
        reason: "absent_from_current_inventory",
        projectionStatus: "idle",
      });
      expect(
        (await ctx.db.query("devices").collect()).filter(
          (row) => row.type === "pc",
        ),
      ).toHaveLength(0);
    });
  });
});
