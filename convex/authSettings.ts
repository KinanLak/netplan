import { ConvexError, v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { adminMutation, adminQuery } from "./lib/functions";
import { readKeycloakConfig, roleNameOrNull } from "./lib/keycloak";
import type { KeycloakRoleMapping } from "./lib/keycloak";

async function roleMapping(ctx: QueryCtx): Promise<KeycloakRoleMapping> {
  const settings = await ctx.db.query("authSettings").first();
  return {
    editorRole: settings?.keycloakEditorRole ?? null,
    adminRole: settings?.keycloakAdminRole ?? null,
    acceptGroups: settings?.keycloakAcceptGroups ?? false,
  };
}

const mapping = v.object({
  editorRole: v.union(v.string(), v.null()),
  adminRole: v.union(v.string(), v.null()),
  acceptGroups: v.boolean(),
});

/** Read by the sign-in hook at each Keycloak login. */
export const keycloakRoleMapping = internalQuery({
  args: {},
  returns: mapping,
  handler: roleMapping,
});

/**
 * The Keycloak section of the users page: whether sign-in is on, what to
 * register in Keycloak, and the role mapping.
 */
export const keycloak = adminQuery({
  args: {},
  returns: v.object({
    issuer: v.union(v.string(), v.null()),
    clientId: v.union(v.string(), v.null()),
    redirectUri: v.string(),
    ...mapping.fields,
  }),
  handler: async (ctx) => {
    const config = readKeycloakConfig(process.env);
    const site = (process.env.SITE_URL ?? "").replace(/\/+$/, "");
    return {
      issuer: config?.issuer ?? null,
      clientId: config?.clientId ?? null,
      redirectUri: `${site}/api/auth/oauth2/callback/keycloak`,
      ...(await roleMapping(ctx)),
    };
  },
});

/**
 * Sets the Keycloak role names that grant Éditeur and Admin, and whether
 * groups of those names grant them too.
 */
export const setKeycloakRoleMapping = adminMutation({
  args: mapping.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const editorRole = roleNameOrNull(args.editorRole);
    const adminRole = roleNameOrNull(args.adminRole);
    if (editorRole !== null && editorRole === adminRole) {
      throw new ConvexError(
        "Choisissez deux rôles différents : Admin l'emporterait toujours.",
      );
    }
    const settings = {
      keycloakEditorRole: editorRole,
      keycloakAdminRole: adminRole,
      keycloakAcceptGroups: args.acceptGroups,
      updatedAt: Date.now(),
    };
    const current = await ctx.db.query("authSettings").first();
    if (current) await ctx.db.patch(current._id, settings);
    else await ctx.db.insert("authSettings", settings);
    return null;
  },
});
