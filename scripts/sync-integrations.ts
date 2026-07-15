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
  process.env.CONVEX_URL?.trim() ?? requiredEnv("VITE_CONVEX_URL");
const connectorSecret = requiredEnv("NETPLAN_CONNECTOR_SECRET");

const netbox = await buildNetBoxSnapshot();
const capturedAt = Date.now();
const discoveries = await buildLibreNmsDiscoveries({
  inventory: netbox.inventory.map((item) => ({
    externalId: item.externalId,
    type: item.type,
    name: item.name,
    macs: item.macs,
  })),
  physicalConnections: netbox.connections,
  syncedAt: capturedAt,
});

const client = new ConvexHttpClient(convexUrl);
const result = await client.action(api.connector.pushArlesSnapshot, {
  secret: connectorSecret,
  capturedAt,
  sourceVersion: netbox.sourceVersion,
  inventory: netbox.inventory,
  physicalConnections: netbox.connections,
  discoveries,
});

console.log(
  `Arles synchronisé : ${result.inventoryCount} équipements, ${result.physicalConnectionCount} câbles, ${result.discoveredConnectionCount} liaisons PC-prise.`,
);
