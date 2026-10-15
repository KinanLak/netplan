---
status: accepted
date: 2026-10-15
title: Three global roles, with the SSO role named by the administrator
---

# Three global roles, with the SSO role named by the administrator

A user has exactly one role, valid on every site:

- **Lecteur** views the map and the inventory.
- **Éditeur** also edits maps, devices and cables, triggers a manual refresh,
  confirms remediation suggestions and sees history (ADR 0014).
- **Admin** also manages users, sites, integrations and their credentials,
  turns refreshes on and off per site, and sees integration health.

Roles are global, not per site: the installations we target are one team.

For local accounts the administrator sets the role. For SSO accounts the
administrator chooses, in the admin page, which Keycloak role name grants
Éditeur and which grants Admin; Netplan reads the user's roles from the OIDC
claims at each login and applies the mapping. A user with no recognised role
is let in as Lecteur. The role is re-read at every login, not at every token
refresh.

## Consequences

- Authorization is enforced in Convex functions; hiding a button is never the
  check.
- Removing a Keycloak role takes effect at the user's next login, at most 24
  hours later (session length, ADR 0003).
- Per-site permissions would need a new ADR and a data model change.

## Source

[Decision log](../history/decision-log.md): Q4, Q5, Q14, Q19.
