import { defaultAc } from "better-auth/plugins/admin/access";

// better-auth's admin permissions for each Netplan role. Admins manage users
// and sessions but cannot impersonate, set a password or change an email:
// passwords go through invitations, and SSO accounts belong to Keycloak.
// Listing sessions is left out: better-auth returns their bearer tokens.
export const authRoles = {
  reader: defaultAc.newRole({ user: [], session: [] }),
  editor: defaultAc.newRole({ user: [], session: [] }),
  admin: defaultAc.newRole({
    user: ["create", "list", "set-role", "ban", "delete", "get", "update"],
    session: ["revoke", "delete"],
  }),
};
