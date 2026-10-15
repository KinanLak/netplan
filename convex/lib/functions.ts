// The only builders public Convex functions may use (ADR 0021). Each one
// loads the signed-in user through better-auth, which checks the session in
// the database, and refuses callers below the required role. The raw
// `query`, `mutation` and `action` builders are banned elsewhere by lint.
// oxlint-disable-next-line no-restricted-imports
import { action, mutation, query } from "../_generated/server";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import { authComponent } from "../auth";
import { hasRole, roleOf } from "./roles";
import type { Role } from "./roles";

export type SignedInUser = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
};

export type AuthErrorCode = "unauthenticated" | "forbidden";

export async function getSignedInUser(
  ctx: QueryCtx | ActionCtx,
): Promise<SignedInUser | null> {
  const doc = await authComponent.safeGetAuthUser(ctx);
  if (!doc || doc.banned === true) return null;
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    username: doc.username ?? null,
    role: roleOf(doc.role),
  };
}

async function requireRole(
  ctx: QueryCtx | ActionCtx,
  required: Role,
): Promise<SignedInUser> {
  const user = await getSignedInUser(ctx);
  if (!user) {
    throw new ConvexError({ code: "unauthenticated" satisfies AuthErrorCode });
  }
  if (!hasRole(user.role, required)) {
    throw new ConvexError({ code: "forbidden" satisfies AuthErrorCode });
  }
  return user;
}

const withRole = (required: Role) =>
  customCtx(async (ctx: QueryCtx | ActionCtx) => ({
    user: await requireRole(ctx, required),
  }));

/**
 * Records the role a builder requires on each function it builds, so a test
 * can check every public function against the policy table.
 */
function requiring<Builder>(role: Role, builder: Builder): Builder {
  const build = builder as unknown as (definition: unknown) => object;
  const tagged = (definition: unknown) =>
    Object.assign(build(definition), { requiredRole: role });
  return tagged as unknown as Builder;
}

/** Any signed-in user: every role can read (ADR 0004). */
export const readerQuery = requiring(
  "reader",
  customQuery(query, withRole("reader")),
);
export const readerMutation = requiring(
  "reader",
  customMutation(mutation, withRole("reader")),
);

/** Éditeur and Admin: maps, devices, cables, manual refresh, history. */
export const editorQuery = requiring(
  "editor",
  customQuery(query, withRole("editor")),
);
export const editorMutation = requiring(
  "editor",
  customMutation(mutation, withRole("editor")),
);
export const editorAction = requiring(
  "editor",
  customAction(action, withRole("editor")),
);

/** Admin: users, sites, integrations. */
export const adminQuery = requiring(
  "admin",
  customQuery(query, withRole("admin")),
);
export const adminMutation = requiring(
  "admin",
  customMutation(mutation, withRole("admin")),
);
export const adminAction = requiring(
  "admin",
  customAction(action, withRole("admin")),
);
