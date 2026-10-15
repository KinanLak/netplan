import { hasRole, roleOf } from "../../convex/lib/roles";
import type { Role } from "../../convex/lib/roles";

export const ROLE_LABELS: Record<Role, string> = {
  reader: "Lecteur",
  editor: "Éditeur",
  admin: "Admin",
};

/** Éditeur and Admin change the map; the server enforces the same rule. */
export function canEditMap(role: unknown): boolean {
  return hasRole(roleOf(role), "editor");
}

/** Admin manages users, sites and integrations; the server enforces it. */
export function isAdmin(role: unknown): boolean {
  return hasRole(roleOf(role), "admin");
}
