import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { buildNetBoxSnapshot } from "./netbox";

const GLOBAL_TIMEOUT_MS = 105_000;

const detail = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500);

export const runCycle = internalAction({
  args: {
    siteId: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.integrations.heartbeat, {
        ...args,
        workflow: "netbox",
      });
      const config = await ctx.runQuery(
        internal.integrationOrchestration.getWorkerConfig,
        { siteId: args.siteId },
      );
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("NetBox global timeout")),
        GLOBAL_TIMEOUT_MS,
      );
      let snapshot: Awaited<ReturnType<typeof buildNetBoxSnapshot>>;
      try {
        snapshot = await buildNetBoxSnapshot(
          {
            externalSiteId: config.netboxExternalSiteId,
            externalSiteSlug: config.netboxExternalSiteSlug,
          },
          controller.signal,
        );
      } finally {
        clearTimeout(timeout);
      }
      await ctx.runMutation(internal.integrations.heartbeat, {
        ...args,
        workflow: "netbox",
      });
      await ctx.runMutation(internal.netboxModel.publishGeneration, {
        ...args,
        generationId: `generation:${args.attemptId}`,
        instanceKey: config.netboxInstanceKey,
        externalSiteId: config.netboxExternalSiteId,
        externalSiteSlug: config.netboxExternalSiteSlug,
        capturedAt: Date.now(),
        ...snapshot,
      });
    } catch (error) {
      try {
        await ctx.runMutation(internal.integrations.fail, {
          ...args,
          workflow: "netbox",
          publicError: "NetBox inaccessible",
          privateErrorCode: "netbox_unreachable",
          privateErrorDetail: detail(error),
        });
      } catch {
        // A replaced or expired worker must not alter the newer cycle.
      }
    }
    return null;
  },
});
