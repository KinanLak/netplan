import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { modules } from "./_test/modules";

const snapshot = {
  syncId: "sync:old",
  startedAt: 100,
  capturedAt: 200,
  sourceVersion: "4.4.1",
  inventory: [
    {
      externalId: "device:pc",
      type: "pc" as const,
      name: "PC",
      role: "Workstation",
      site: "Arles",
      locationPath: ["Bureau"],
      macs: ["AA:BB:CC:DD:EE:FF"],
      interfaceCount: 1,
      lifecycleStatus: "active",
      url: "https://netbox.example/devices/pc",
    },
  ],
  physicalConnections: [
    {
      externalId: "cable:1",
      fromExternalId: "device:pc",
      toExternalId: "device:socket",
    },
  ],
  discoveries: [
    {
      externalId: "discovery:1",
      computerExternalId: "device:pc",
      socketExternalId: "device:socket",
      switchExternalId: "device:switch",
      switchPort: "Gi1/0/1",
      method: "fdb" as const,
      confidence: "high" as const,
      observedAt: 150,
    },
  ],
};

describe("integration connector", () => {
  it("replaces NetBox and LibreNMS data in one mutation", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.connector.markArlesSyncing, {
      syncId: snapshot.syncId,
      startedAt: snapshot.startedAt,
    });

    const result = await t.mutation(
      internal.connector.replaceArlesSnapshot,
      snapshot,
    );

    expect(result).toEqual({
      inventoryCount: 1,
      physicalConnectionCount: 1,
      discoveredConnectionCount: 1,
    });
    const completedOutcome = await t.mutation(
      internal.connector.markArlesFailed,
      {
        syncId: snapshot.syncId,
        startedAt: snapshot.startedAt,
        completedAt: 300,
      },
    );
    expect(completedOutcome).toEqual({
      status: "ready",
      inventoryCount: 1,
      physicalConnectionCount: 1,
      discoveredConnectionCount: 1,
    });
    const state = await t.run(async (ctx) => ({
      inventory: await ctx.db.query("externalInventory").collect(),
      physical: await ctx.db.query("externalConnections").collect(),
      discoveries: await ctx.db.query("discoveredConnections").collect(),
      syncs: await ctx.db.query("integrationSyncs").collect(),
    }));
    expect(state.inventory).toHaveLength(1);
    expect(state.physical).toHaveLength(1);
    expect(state.discoveries).toHaveLength(1);
    expect(
      state.syncs.map(({ provider, status }) => ({ provider, status })),
    ).toEqual([
      { provider: "netbox", status: "ready" },
      { provider: "librenms", status: "ready" },
    ]);
  });

  it("rolls back both snapshots when the combined mutation fails", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("integrationSyncs", {
        provider: "netbox",
        site: "Arles",
        syncId: snapshot.syncId,
        status: "syncing",
        startedAt: snapshot.startedAt,
        inventoryCount: 0,
        connectionCount: 0,
      });
      const duplicateSync = {
        provider: "librenms" as const,
        site: "Arles",
        syncId: snapshot.syncId,
        status: "syncing" as const,
        startedAt: snapshot.startedAt,
        inventoryCount: 0,
        connectionCount: 0,
      };
      await ctx.db.insert("integrationSyncs", duplicateSync);
      await ctx.db.insert("integrationSyncs", duplicateSync);
    });

    await expect(
      t.mutation(internal.connector.replaceArlesSnapshot, snapshot),
    ).rejects.toThrow();

    const state = await t.run(async (ctx) => ({
      inventory: await ctx.db.query("externalInventory").collect(),
      physical: await ctx.db.query("externalConnections").collect(),
      discoveries: await ctx.db.query("discoveredConnections").collect(),
      syncs: await ctx.db.query("integrationSyncs").collect(),
    }));
    expect(state.inventory).toEqual([]);
    expect(state.physical).toEqual([]);
    expect(state.discoveries).toEqual([]);
    expect(state.syncs).toHaveLength(3);
    expect(state.syncs.every((sync) => sync.status === "syncing")).toBe(true);
  });

  it("prevents an older sync from replacing or failing a newer one", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.connector.markArlesSyncing, {
      syncId: snapshot.syncId,
      startedAt: 100,
    });
    await t.mutation(internal.connector.markArlesSyncing, {
      syncId: "sync:new",
      startedAt: 100,
    });

    await expect(
      t.mutation(internal.connector.replaceArlesSnapshot, snapshot),
    ).rejects.toThrow("a été remplacée");
    const failed = await t.mutation(internal.connector.markArlesFailed, {
      syncId: snapshot.syncId,
      startedAt: snapshot.startedAt,
      completedAt: 400,
    });

    expect(failed).toEqual({ status: "ignored" });
    const state = await t.run(async (ctx) => ({
      inventory: await ctx.db.query("externalInventory").collect(),
      syncs: await ctx.db.query("integrationSyncs").collect(),
    }));
    expect(state.inventory).toEqual([]);
    expect(
      state.syncs.map(({ syncId, status }) => ({ syncId, status })),
    ).toEqual([
      { syncId: "sync:new", status: "syncing" },
      { syncId: "sync:new", status: "syncing" },
    ]);
  });

  it("stores only a generic public error for a failed run", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.connector.markArlesSyncing, {
      syncId: snapshot.syncId,
      startedAt: snapshot.startedAt,
    });

    const failed = await t.mutation(internal.connector.markArlesFailed, {
      syncId: snapshot.syncId,
      startedAt: snapshot.startedAt,
      completedAt: 200,
    });

    expect(failed).toEqual({ status: "failed" });
    const syncs = await t.run((ctx) =>
      ctx.db.query("integrationSyncs").collect(),
    );
    expect(syncs.map((sync) => sync.error)).toEqual([
      "La synchronisation des intégrations a échoué",
      "La synchronisation des intégrations a échoué",
    ]);
  });
});
