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
- **Hosting**: self-hosted with Docker Compose (ADRs 0002 and 0020), described
  below.

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

Every page needs a better-auth login (ADR 0021), and every public Convex
function checks the caller's role (Lecteur, Éditeur, Admin; ADR 0004) on the
server; `convex/authorization.test.ts` lists the level of each one. The
integration connector authenticates with a shared secret instead. A
Lecteur's map is read-only, and presence (`convex/presences.ts`) shows each
signed-in user's name, one entry per user however many tabs they have open.

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

## Deployment

Built by lot 0 (ADR 0020); procedures in [`docs/operations/`](../operations/index.md).

- One `Dockerfile` builds two images. `app` is the Nitro server output on
  distroless Bun, run as an unprivileged user; it reads `CONVEX_URL` and
  `CONVEX_SITE_URL` at request time (`src/lib/runtimeConfig.ts`) and hands
  them to the browser through the root loader, so one image serves every
  installation. `functions` is the pinned `convex-backend` image plus the
  functions and their production dependencies; its `deploy/convex.sh`
  derives an admin key from the instance secret and runs the Convex CLI.
- `GET /health` reports the configuration and whether the backend answers,
  `200` or `503`, uncached and without login.
- `deploy/compose.yaml` runs Postgres 17, the Convex backend on it, the
  dashboard, the app and a Caddy edge, plus a `convex-deploy` one-shot that
  pushes the functions and the variables listed in `deploy/convex-env.txt`
  before the app starts. The `local` profile adds Keycloak (dev mode, realm
  imported from `deploy/keycloak/import/`) and Mailpit.
- Only the edge publishes a port. It routes by host name
  (`netplan.<domain>`, `convex.<domain>`, …) and carries a network alias for
  each, so the public URLs work from browsers and containers alike; the app
  shares the edge's network namespace because Bun sends `*.localhost` to
  loopback.
- CI builds both images, deploys the functions to a backend service and
  checks the app's `/health`; nothing is pushed to a registry.

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
