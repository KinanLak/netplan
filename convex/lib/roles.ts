export const ROLES = ["reader", "editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { reader: 0, editor: 1, admin: 2 };

export function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" &&
    (ROLES as ReadonlyArray<string>).includes(value)
  );
}

/** A missing or unknown stored role counts as the lowest one. */
export function roleOf(value: unknown): Role {
  return isRole(value) ? value : "reader";
}

export function hasRole(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
