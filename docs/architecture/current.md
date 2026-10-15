---
title: Current architecture
description: Netplan as it stands now, partway through the rebuild.
---

# Current architecture

Netplan is a collaborative map editor for buildings: floors, walls and network
devices (racks, switches, PCs, wall sockets) with the cables between them. On
top of the map sits a localization pipeline that places each PC at the wall
socket where the network last saw it.

## Pieces

- **Web app** (`src/`): TanStack Start with React 19, rendered client-side for
  the map route. The canvas is `@xyflow/react` (`src/canvas/`); panels,
  toolbar and drawer live in `src/panels/`. Zustand (`src/store/`) holds only
  ephemeral UI state such as selection and tool mode.
- **Backend** (`convex/`): Convex functions and schema. Convex owns every
  durable fact: sites, buildings, floors, devices, walls, links, presence,
  and the integration tables.
- **Hosting**: moving to a self-hosted Docker deployment (lot 0, ADR 0002,
  ADR 0020). The Vercel configuration and the Electrobun desktop app are gone.

## Map editing

A durable change is a `MapOperation` (`src/map-engine/types.ts`). The client
applies it optimistically through `src/map-engine/`, queues it in an outbox
(`src/map-session/`) and sends it to `api.mapOperations.apply`. The server
re-plans the operation against its own state and is authoritative: floors,
object ids, collisions, link endpoints, orthogonal wall geometry and
device-delete link cleanup are all validated there. Undo is an inverse
operation built by `buildInverseOperation`. Each floor carries a revision that
clients use to reconcile.

Walls are stored as one 20×20 block per grid cell (`src/walls/`), keyed by a
geometry key so that two blocks never occupy the same cell.

Identity is a random pseudonym stored in `localStorage` under
`netplan-identity`; there are no accounts and anyone who can reach the app can
edit it. Presence (`convex/presences.ts`) shows who else is on a floor.

## Localization pipeline

The pipeline follows MAC → LibreNMS forwarding table → switch port → NetBox
cable → wall socket → socket placed on the map → PC position:

- `convex/netbox*.ts` import a generation of NetBox inventory and cables.
- `convex/librenms*.ts` read forwarding tables and port status from LibreNMS.
- `convex/localization*.ts` and `computerLocations` resolve each MAC to a
  socket; `convex/computerProjection.ts` moves the PC on the map through the
  same map operations as a user.
- `convex/integrationOrchestration.ts` reserves cycles from a cron, behind
  the `INTEGRATION_SCHEDULER_ENABLED` and
  `INTEGRATION_MANUAL_REFRESH_ENABLED` switches. It only records attempts and
  per-switch states: nothing inside Convex runs the collection yet.

Because Convex Cloud cannot reach LibreNMS on the internal network, the real
work is done by an external agent (`scripts/sync-integrations.ts`, `scripts/librenms-agent.ts`,
`ops/systemd/`) runs on a workstation, reads both tools and pushes results
through `convex/connector.ts`, authenticated by `NETPLAN_CONNECTOR_SECRET`.

The site is a single hardcoded default (`convex/sites.ts`), and device
identity is keyed on NetBox ids. The French plan that built this pipeline is
frozen in
[`docs/history/2026-07-computer-location-refresh/`](../history/2026-07-computer-location-refresh/README.md).

## Development and delivery

Built by lot F (ADRs 0018 and 0019).

- `bun run check` is read-only (typecheck, lint, format, tests, Convex
  codegen freshness against a local backend); `bun run verify` adds the
  production build. CI on every pull request runs a gitleaks history scan,
  `verify` against a self-hosted backend service container, a dependency
  audit, and an end-to-end job that seeds that backend, builds the app and
  drives it with Playwright (`e2e/`).
- `bun run dev:agent` runs one self-hosted Convex backend per worktree in
  Docker, with SQLite in a volume, ports derived from the worktree path, and a
  generated `.env.local`. It seeds a fictional, disabled demo site through
  `applyMapOperation`, the same path as user edits, behind `ALLOW_DEV_SEED`.
- zipzoup reviews each pull request when it is marked ready; agents merge
  their own once CI is green and no P0 or P1 finding is open.
