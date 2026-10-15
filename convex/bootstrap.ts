import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { createAuth } from "./auth";

/**
 * Creates the first admin from arguments or `BOOTSTRAP_ADMIN_*` Convex env,
 * and does nothing once any admin exists. The deploy step runs it.
 */
export const ensureFirstAdmin = internalAction({
  args: {
    email: v.optional(v.string()),
    password: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  returns: v.union(
    v.literal("created"),
    v.literal("exists"),
    v.literal("unconfigured"),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "role", value: "admin" }],
    });
    if (existing) return "exists";
    const email = args.email ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
    const password = args.password ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!email || !password) return "unconfigured";
    await createAuth(ctx).api.createUser({
      body: {
        email,
        password,
        name: args.name ?? process.env.BOOTSTRAP_ADMIN_NAME ?? "Administrateur",
        role: "admin",
      },
    });
    return "created";
  },
});
