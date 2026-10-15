---
title: Decision records
description: Numbered records of choices that are expensive to revisit.
---

# Decision records

Each record states a decision, why it was taken, and what follows from it.
A record is not edited to reflect a later change of mind: a new record
supersedes it and says so in its frontmatter (`supersedes: NNNN`). The
reasoning behind 0001–0019 is in the [decision log](../history/decision-log.md).

- **[0001 — Rebuild the target architecture now, with data restarting from zero](0001-rebuild-from-zero.md)**
- **[0002 — Fully self-hosted in Docker; Vercel and the desktop app are dropped](0002-self-hosted-only.md)**
- **[0003 — Authentication with better-auth inside Convex, password and Keycloak OIDC](0003-better-auth.md)**
- **[0004 — Three global roles, with the SSO role named by the administrator](0004-global-roles.md)**
- **[0005 — Netplan owns its inventory; NetBox and LibreNMS are optional per-site integrations](0005-tool-agnostic-model.md)**
- **[0006 — Integration tokens stored in Convex, encrypted with an environment master key](0006-encrypted-integration-tokens.md)**
- **[0007 — Fields that come from a source are read-only in Netplan](0007-source-owned-fields-read-only.md)**
- **[0008 — Devices learned later by a source are merged by MAC or serial, otherwise reviewed](0008-device-remediation.md)**
- **[0009 — Cables are a port-level model, edited on the map or in a port table, never all drawn at once](0009-cables.md)**
- **[0010 — Refresh cadence is set per site, by default 5 minutes in business hours and hourly otherwise](0010-refresh-cadence.md)**
- **[0011 — Each floor can carry a calibrated background "calque"](0011-floor-overlay.md)**
- **[0012 — Integration workers run inside Convex; the external agent is removed](0012-integrations-run-in-convex.md)**
- **[0013 — MAC addresses are stored and shown in clear](0013-mac-addresses-in-clear.md)**
- **[0014 — Thirty days of location history, visible to Éditeur and Admin](0014-history.md)**
- **[0015 — The observed location is pushed one way to NetBox custom fields](0015-netbox-location-push.md)**
- **[0016 — The repository is in English, the interface in French](0016-language.md)**
- **[0017 — The repository stays public, reviewed by zipzoup on maintainers' pull requests](0017-github-review.md)**
- **[0018 — Each worktree runs its own local Convex backend with seeded data, and CI runs the same backend](0018-agent-dev-environment.md)**
- **[0019 — Agents ship through stacked pull requests, a CI gate and zipzoup review, and merge their own work](0019-delivery-workflow.md)**
