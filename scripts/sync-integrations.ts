import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { buildNetBoxSnapshot } from "../convex/netbox";
import { buildLibreNmsDiscoveries } from "../convex/librenms";

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} n'est pas configuré`);
  return value;
};

const convexUrl =
  process.env.CONVEX_URL?.trim() || requiredEnv("VITE_CONVEX_URL");
const connectorSecret = requiredEnv("NETPLAN_CONNECTOR_SECRET");
const client = new ConvexHttpClient(convexUrl);
const syncId = crypto.randomUUID();
const startedAt = Date.now();

const runSync = async () => {
  try {
    await client.action(api.connector.beginArlesSync, {
      secret: connectorSecret,
      syncId,
      startedAt,
    });
    const netbox = await buildNetBoxSnapshot();
    const discoveries = await buildLibreNmsDiscoveries({
      inventory: netbox.inventory.map((item) => ({
        externalId: item.externalId,
        type: item.type,
        name: item.name,
        macs: item.macs,
      })),
      physicalConnections: netbox.connections,
    });
    return await client.action(api.connector.pushArlesSnapshot, {
      secret: connectorSecret,
      syncId,
      startedAt,
      capturedAt: Date.now(),
      sourceVersion: netbox.sourceVersion,
      inventory: netbox.inventory,
      physicalConnections: netbox.connections,
      discoveries,
    });
  } catch (error: unknown) {
    try {
      const outcome = await client.action(api.connector.failArlesSync, {
        secret: connectorSecret,
        syncId,
        startedAt,
        completedAt: Date.now(),
      });
      if (outcome.status === "ready") {
        return {
          inventoryCount: outcome.inventoryCount,
          physicalConnectionCount: outcome.physicalConnectionCount,
          discoveredConnectionCount: outcome.discoveredConnectionCount,
        };
      }
    } catch (statusError: unknown) {
      console.error("Impossible d'enregistrer l'échec", statusError);
    }
    throw error;
  }
};

const result = await runSync();

console.log(
  `Arles synchronisé : ${result.inventoryCount} équipements, ${result.physicalConnectionCount} câbles, ${result.discoveredConnectionCount} liaisons PC-prise.`,
);
