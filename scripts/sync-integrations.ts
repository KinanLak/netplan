import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { buildNetBoxSnapshot } from "../convex/netbox";
import {
  buildLibreNmsDiscoveries,
  libreNmsClientFromEnvironment,
} from "../convex/librenms";
import { refreshLibreNmsDevices } from "./librenms-agent";

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} n'est pas configuré`);
  return value;
};

const convexUrl =
  process.env.CONVEX_URL?.trim() || requiredEnv("VITE_CONVEX_URL");
const connectorSecret = requiredEnv("NETPLAN_CONNECTOR_SECRET");
const siteKey = process.env.NETPLAN_SITE_KEY?.trim() || "arles";
const client = new ConvexHttpClient(convexUrl);
const triggerDiscoveries = Bun.argv.includes("--discover");
const agentMode = Bun.argv.includes("--agent");

const runNetBoxImport = async (origin: "manual" | "scheduled" = "manual") => {
  const attemptId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const started = await client.action(api.connector.beginNetBoxImport, {
    secret: connectorSecret,
    siteKey,
    attemptId,
    leaseId,
    origin,
  });
  if (started.status !== "running") {
    throw new Error("La tentative NetBox est déjà terminée");
  }

  try {
    const snapshot = await buildNetBoxSnapshot({
      externalSiteId: started.config.netboxExternalSiteId,
      externalSiteSlug: started.config.netboxExternalSiteSlug,
    });
    const generationId = crypto.randomUUID();
    const result = await client.action(api.connector.publishNetBoxGeneration, {
      secret: connectorSecret,
      siteId: started.siteId,
      attemptId: started.attemptId,
      leaseId: started.leaseId,
      fence: started.fence,
      generationId,
      instanceKey: started.config.netboxInstanceKey,
      externalSiteId: started.config.netboxExternalSiteId,
      externalSiteSlug: started.config.netboxExternalSiteSlug,
      capturedAt: Date.now(),
      sourceVersion: snapshot.sourceVersion,
      inventory: snapshot.inventory,
      connections: snapshot.connections,
    });
    return { ...started, publishedId: result.generationId, result };
  } catch (error: unknown) {
    await client.action(api.connector.failNetBoxImport, {
      secret: connectorSecret,
      siteId: started.siteId,
      attemptId: started.attemptId,
      leaseId: started.leaseId,
      fence: started.fence,
    });
    throw error;
  }
};

const runLocalizationImport = async (
  discover = triggerDiscoveries,
  origin: "manual" | "scheduled" = "manual",
) => {
  const attemptId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const started = await client.action(api.connector.beginLocalizationImport, {
    secret: connectorSecret,
    siteKey,
    attemptId,
    leaseId,
    origin,
  });
  if (!started.pinnedNetBoxGenerationId) {
    throw new Error("Aucune génération NetBox épinglée");
  }

  try {
    let refreshedDevices:
      | Awaited<ReturnType<typeof refreshLibreNmsDevices>>
      | undefined;
    let lastHeartbeatAt = Date.now();
    const heartbeat = async () => {
      if (Date.now() - lastHeartbeatAt < 20_000) return;
      await client.action(api.connector.heartbeatImport, {
        secret: connectorSecret,
        siteId: started.siteId,
        workflow: "localization",
        attemptId: started.attemptId,
        leaseId: started.leaseId,
        fence: started.fence,
      });
      lastHeartbeatAt = Date.now();
    };
    if (discover) {
      refreshedDevices = await refreshLibreNmsDevices(
        libreNmsClientFromEnvironment(),
        started.config.localizationTargetDeviceIds,
        started.attemptId,
        { onPoll: heartbeat },
      );
      await heartbeat();
      console.log(
        `Discoveries terminés : ${refreshedDevices.map((result) => `${result.deviceId} (${result.lastDiscoveredTimetaken ?? "?"} s)`).join(", ")}.`,
      );
    }
    const topology = await client.action(api.connector.readNetBoxGeneration, {
      secret: connectorSecret,
      siteId: started.siteId,
      generationId: started.pinnedNetBoxGenerationId,
    });
    const previousFreshFdbCounts = await client.action(
      api.connector.readLocalizationBaseline,
      { secret: connectorSecret, siteId: started.siteId },
    );
    const librenms = await buildLibreNmsDiscoveries({
      inventory: topology.inventory.map((item) => ({
        externalId: item.externalId,
        type: item.type,
        name: item.name,
        macs: item.macs,
        cabledTerminationCount: item.cabledTerminationCount,
      })),
      physicalConnections: topology.connections,
      configuredSwitches: started.config.libreNmsSwitches,
      targetDeviceIds: started.config.localizationTargetDeviceIds,
      freshnessBounds: (refreshedDevices ?? []).map((device) => ({
        externalId: device.deviceId,
        triggerStartedAt: device.triggerStartedAt,
        discoveryCompletedAt: Date.parse(device.lastDiscovered),
        serverObservedAt: device.serverObservedAt,
      })),
      previousFreshFdbCounts,
    });
    return await client.action(api.connector.publishLocalizationSnapshot, {
      secret: connectorSecret,
      siteId: started.siteId,
      attemptId: started.attemptId,
      leaseId: started.leaseId,
      fence: started.fence,
      snapshotId: crypto.randomUUID(),
      netboxGenerationId: started.pinnedNetBoxGenerationId,
      libreNmsInstanceKey: started.config.libreNmsInstanceKey,
      capturedAt: Date.now(),
      switchResults: librenms.switchResults.map((result) => {
        const refreshed = refreshedDevices?.find(
          (device) => device.deviceId === result.externalId,
        );
        return {
          ...result,
          discoveryGeneration: refreshed?.lastDiscovered,
          capturedAt: refreshed?.completedAt,
        };
      }),
      observations: librenms.observations,
      discoveries: librenms.discoveries,
      diagnostics: librenms.diagnostics,
    });
  } catch (error: unknown) {
    await client.action(api.connector.failLocalizationImport, {
      secret: connectorSecret,
      siteId: started.siteId,
      attemptId: started.attemptId,
      leaseId: started.leaseId,
      fence: started.fence,
    });
    throw error;
  }
};

if (agentMode) {
  const sites = await client.query(api.sites.list, {});
  const site = sites.find((candidate) => candidate.configKey === siteKey);
  if (!site) throw new Error(`Site ${siteKey} introuvable`);
  const [netboxState, localizationState] = await Promise.all([
    client.query(api.integrations.getState, {
      siteId: site.id,
      workflow: "netbox",
    }),
    client.query(api.integrations.getState, {
      siteId: site.id,
      workflow: "localization",
    }),
  ]);
  const completed: Array<string> = [];
  if (netboxState?.status === "running") {
    const netbox = await runNetBoxImport("scheduled");
    completed.push(
      `NetBox ${netbox.result.inventoryCount}/${netbox.result.connectionCount}`,
    );
  }
  if (localizationState?.status === "running") {
    const localization = await runLocalizationImport(true, "scheduled");
    completed.push(`localisation ${localization.linkCount}`);
  }
  console.log(
    completed.length > 0
      ? `${siteKey} agent : ${completed.join(", ")}.`
      : `${siteKey} agent : aucun workflow actif.`,
  );
} else {
  const netbox = await runNetBoxImport();
  const localization = await runLocalizationImport(true);
  console.log(
    `${siteKey} synchronisé : ${netbox.result.inventoryCount} équipements, ${netbox.result.connectionCount} câbles, ${localization.linkCount} liaisons PC-prise.`,
  );
}
