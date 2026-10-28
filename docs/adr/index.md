---
title: Decision records
description: Numbered records of choices that are expensive to revisit.
---

# Decision records

Each record states a decision, why it was taken, and what follows from it.
A record is not edited to reflect a later change of mind: a new record
supersedes it and says so in its frontmatter (`supersedes: NNNN`). Each
record's Source section points to its questions in the
[decision log](../history/decision-log.md).

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
- **[0020 — One runtime-configured app image, deployed with Docker Compose behind a host-routing edge](0020-deployment.md)**
- **[0021 — Accounts are enforced by Convex function wrappers, with roles mapped at Keycloak login and invitations through password reset](0021-accounts-implementation.md)**
- **[0022 — Devices are a site inventory with ports and cables, optionally placed on a floor](0022-site-inventory-ports-cables.md)**
- **[0023 — Sites and their integrations are configured in the admin, and one Convex cycle per site collects from them](0023-sites-integrations-collection.md)**
- **[0024 — The calque is a raster image in Convex storage, placed by map operations, and the plan has a fixed scale of 100 units per metre](0024-floor-overlay-implementation.md)**
- **[0025 — The map shows observed ports and statuses that expire, cable paths on hover or on demand, and draws cables within a floor](0025-map-ports-statuses-cables.md)**
- **[0026 — Freshness is shown to everyone and refreshed by Éditeurs, errors are French toasts, and the inventory carries the offline, coverage and ignored-MAC views](0026-experience.md)**
- **[0027 — History is recorded by the collection cycle as events and five daily MAC snapshots, purged after 30 days, and the NetBox push follows each cycle](0027-history-and-location-push.md)**
- **[0028 — Every request to a source runs in Node, and an integration may ignore certificate errors when its admin says so](0028-real-librenms-and-certificate-opt-in.md)**
- **[0029 — Cables are React Flow edges between port handles, coloured by their link; device labels are names in capitals with the full name on hover; free text labels annotate the plan](0029-map-rendering-and-labels.md)**
- **[0030 — The map's keys act on the selection, never pan the view, and each floor keeps its own view in the URL and the session](0030-map-keyboard-viewport-selection.md)**
- **[0031 — The theme and errors live at the root, sessions slide with activity, sign-in attempts count per identifier, and the map freezes 30 seconds after the connection drops](0031-shell-sessions-and-offline-grace.md)**
- **[0032 — A device the network once saw keeps a "stale" status that says when it was last heard from, and everyone sees where it was last seen](0032-device-last-heard.md)**
- **[0033 — An archived site leaves the picker, refuses every change to its plan and inventory, and is never collected, until an admin brings it back](0033-site-archive.md)**
- **[0034 — A selection of several devices moves by one offset, as one block that never passes through a wall](0034-rigid-group-moves.md)**
- **[0038 — A site is collected at one interval day and night, its readings expire after two intervals and the lease, and the collection says its doubts quietly](0038-one-cadence-and-quiet-collection.md)** (supersedes 0010)
