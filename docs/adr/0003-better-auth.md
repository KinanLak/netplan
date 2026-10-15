---
status: accepted
date: 2026-10-15
title: Authentication with better-auth inside Convex, password and Keycloak OIDC
---

# Authentication with better-auth inside Convex, password and Keycloak OIDC

Users sign in with better-auth through `@convex-dev/better-auth`, in its
local-install mode so that Netplan owns the auth schema (the admin plugin's
`role` and `banned` fields are not in the packaged schema). Two methods:

- email or username and password, for local accounts;
- generic OIDC, configured for Keycloak, for SSO.

There is no public sign-up: an administrator invites local accounts, and SSO
accounts are created at their first login. Login is required for every page
and every Convex function. Sessions last 24 hours. Outgoing mail (invitations,
forgotten password, the admin's test email) goes through an SMTP relay
configured by environment variables.

better-auth was chosen over Convex Auth (beta, no roles or user management),
a hand-written OIDC and session stack (security-sensitive, large) and hosted
providers (user data outside the installation, contrary to ADR 0002).

## Consequences

- Every public Convex function checks the caller's session and role on the
  server (ADR 0004). The random pseudonym stored in `netplan-identity` is
  replaced by the signed-in user, and presence shows real names.
- better-auth follows ADR 0001 and stays on the latest version
  `@convex-dev/better-auth` supports. An upgrade that changes the OIDC
  callback path is planned work, because the redirect URI registered in
  Keycloak changes with it.
- The first admin is created at first start, by a command or an environment
  variable.
- Development runs a local Keycloak realm and Mailpit; seeded test accounts
  exist only where `ALLOW_DEV_SEED` is set (ADR 0018).

## Source

[Decision log](../history/decision-log.md): Q2, Q3, Q6, Q10, Q15, Q24, Q37,
orchestrator journal "Which Keycloak for SSO tests?" and "Which SMTP for
local tests?".
