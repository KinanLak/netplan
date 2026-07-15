import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { connectionInput, inventoryInput } from "./netboxModel";
import { discoveredConnectionInput } from "./librenmsModel";

declare const process: { env: Record<string, string | undefined> };

const safeEqual = (left: string, right: string): boolean => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

export const pushArlesSnapshot = action({
  args: {
    secret: v.string(),
    capturedAt: v.number(),
    sourceVersion: v.optional(v.string()),
    inventory: v.array(inventoryInput),
    physicalConnections: v.array(connectionInput),
    discoveries: v.array(discoveredConnectionInput),
  },
  returns: v.object({
    inventoryCount: v.number(),
    physicalConnectionCount: v.number(),
    discoveredConnectionCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    inventoryCount: number;
    physicalConnectionCount: number;
    discoveredConnectionCount: number;
  }> => {
    const expectedSecret = process.env.NETPLAN_CONNECTOR_SECRET;
    if (!expectedSecret || !safeEqual(args.secret, expectedSecret)) {
      throw new ConvexError("Connecteur non autorisé");
    }
    const startedAt = Date.now();
    const netboxResult = await ctx.runMutation(
      internal.netboxModel.replaceSnapshot,
      {
        site: "Arles",
        startedAt,
        completedAt: args.capturedAt,
        sourceVersion: args.sourceVersion,
        inventory: args.inventory,
        connections: args.physicalConnections,
      },
    );
    const libreNmsResult = await ctx.runMutation(
      internal.librenmsModel.replaceDiscoveries,
      {
        startedAt,
        completedAt: args.capturedAt,
        discoveries: args.discoveries,
      },
    );
    return {
      inventoryCount: netboxResult.inventoryCount,
      physicalConnectionCount: netboxResult.connectionCount,
      discoveredConnectionCount: libreNmsResult.connectionCount,
    };
  },
});
