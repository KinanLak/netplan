"use node";

// Every function that sends a request to NetBox or LibreNMS (ADR 0028). They
// run in Node, whose undici can skip certificate checks for an integration
// whose admin turned on "Ignorer les erreurs de certificat TLS"; their logic
// stays with each feature.
import { v } from "convex/values";
import { Agent, fetch as undiciFetch } from "undici";
import { internalAction } from "./_generated/server";
import { runCycle } from "./collection";
import {
  draftArgs,
  saveArgs,
  saveConnection,
  testConnection,
} from "./integrations";
import { adminAction } from "./lib/functions";
import type { Fetch } from "./lib/httpRetry";
import type { ConnectionCheck, Transport } from "./lib/integrationProbe";
import { devicesResult, listDevices } from "./librenms";
import { choicesResult, listChoices } from "./netbox";
import { runPush } from "./netboxPush";
import { connectionResult } from "./siteValidators";

// Node's own fetch refuses a dispatcher from a newer undici, so the lenient
// requests use undici's fetch with its own Agent.
const lenientAgent = new Agent({ connect: { rejectUnauthorized: false } });

const lenient: Fetch = async (url, init) =>
  (await undiciFetch(url, {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: lenientAgent,
  })) as unknown as Response;

const transport: Transport = { lenient };

export const saveIntegration = adminAction({
  args: saveArgs,
  returns: v.union(v.null(), connectionResult),
  handler: async (ctx, args): Promise<ConnectionCheck | null> =>
    await saveConnection(ctx, args, transport),
});

export const testIntegration = adminAction({
  args: draftArgs,
  returns: connectionResult,
  handler: async (ctx, args): Promise<ConnectionCheck> =>
    await testConnection(ctx, args, transport),
});

export const librenmsDevices = adminAction({
  args: { siteId: v.string() },
  returns: devicesResult,
  handler: async (ctx, { siteId }) => await listDevices(ctx, siteId, transport),
});

export const netboxChoices = adminAction({
  args: { siteId: v.string() },
  returns: choicesResult,
  handler: async (ctx, { siteId }) => await listChoices(ctx, siteId, transport),
});

export const collect = internalAction({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => await runCycle(ctx, args, transport),
});

export const pushToNetBox = internalAction({
  args: { siteId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId }) => await runPush(ctx, siteId, transport),
});
