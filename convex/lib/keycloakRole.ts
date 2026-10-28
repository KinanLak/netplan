import { components, internal } from "../_generated/api";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import { keycloakRoleNames, roleFromKeycloak } from "./keycloak";

/**
 * Sets a Keycloak user's role from tokens Keycloak just gave, with the
 * admin's mapping: at login and at each hourly refresh alike (ADR 0004, ADR
 * 0036). Every open page of the user follows the role row, so it is only
 * written when it changes.
 */
export async function setRoleFromTokens(
  ctx: Pick<ActionCtx | MutationCtx, "runQuery" | "runMutation">,
  clientId: string,
  userId: string,
  tokens: { accessToken?: string | null; idToken?: string | null },
) {
  const mapping = await ctx.runQuery(
    internal.authSettings.keycloakRoleMapping,
    {},
  );
  const role = roleFromKeycloak(
    keycloakRoleNames(tokens, clientId, mapping),
    mapping,
  );
  const user = (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [{ field: "_id", value: userId }],
  })) as { role?: string } | null;
  if (!user || user.role === role) return;
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "_id", value: userId }],
      update: { role, updatedAt: Date.now() },
    },
  });
}
