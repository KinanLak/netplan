---
title: Current architecture
description: Netplan as it stands now, partway through the rebuild.
---

# Current architecture

Netplan is a collaborative map editor for buildings: floors, walls and network
devices (racks, switches, PCs, wall sockets) with the cables between them.
Lot 2 is replacing the old NetBox/LibreNMS localization pipeline (deleted) with
a site inventory and a collection cycle inside Convex (ADRs 0022 and 0023).
The cycle runs and imports devices from NetBox; LibreNMS is only probed.

## Pieces

- **Web app** (`src/`): TanStack Start with React 19, rendered client-side for
  the map route. The canvas is `@xyflow/react` (`src/canvas/`); panels,
  toolbar and drawer live in `src/panels/`. Zustand (`src/store/`) holds only
  ephemeral UI state such as selection and tool mode.
- **Backend** (`convex/`): Convex functions and schema. Convex owns every
  durable fact: sites, buildings, floors, devices, walls, ports, cables
  and presence.
- **Hosting**: self-hosted with Docker Compose (ADRs 0002 and 0020), described
  below.

## Map editing

A durable change is a `MapOperation` (`src/map-engine/types.ts`). The client
applies it optimistically through `src/map-engine/`, queues it in an outbox
(`src/map-session/`) and sends it to `api.mapOperations.apply`. The server
re-plans the operation against its own state and is authoritative: floors,
object ids, collisions, cable endpoints, orthogonal wall geometry and
device-delete cable cleanup are all validated there. Undo is an inverse
operation built by `buildInverseOperation`. Each floor carries a revision that
clients use to reconcile.

Walls are stored as one 20×20 block per grid cell (`src/walls/`), keyed by a
geometry key so that two blocks never occupy the same cell.

## Accounts

Built by lot 1 (ADRs 0003, 0004 and 0021). better-auth runs inside Convex as
a locally installed component (`convex/betterAuth/`, `convex/auth.ts`); the
app server proxies `/api/auth/*` to the Convex site and sends a visitor
without a session to `/login` before any page loads. There is no sign-up and
a session lasts 24 hours from login, never extended.

- **Roles.** `reader`, `editor` and `admin` on the better-auth user, shown as
  Lecteur, Éditeur and Admin. Public Convex functions are built only with the
  role builders of `convex/lib/functions.ts` (a lint rule forbids the raw
  ones), which refuse a missing, expired or banned session;
  `convex/authorization.test.ts` lists the level of each function. A
  Lecteur's map is read-only, and presence (`convex/presences.ts`) shows each
  signed-in user's name, one entry per user however many tabs they have open.
- **Local accounts.** Sign-in by email or username and password. An admin
  invites a user from **Administration › Utilisateurs**: the account is
  created without a password and the mail carries a seven-day password-reset
  link. Forgotten password reuses that page with a one-hour link, which never
  goes to a Keycloak account. Disabling is a better-auth ban. The first admin
  comes from `BOOTSTRAP_ADMIN_*` at deploy time.
- **Keycloak.** Generic OAuth with PKCE, on when `KEYCLOAK_ISSUER`,
  `_CLIENT_ID` and `_CLIENT_SECRET` are set; the login page asks
  `/api/auth/sign-in-options` whether to offer it. At each Keycloak login a
  session hook sets the role from the token's roles and groups and the two
  names an admin stores in `authSettings` from the users page (Admin wins, no
  match is Lecteur), so the users page never edits a Keycloak account's role.
  A Keycloak identity never links to a local account: the same email is
  refused and the linking routes are disabled. OAuth errors land on `/login`,
  which explains them in French. Signing out does not end the Keycloak
  session.
- **Mail.** A Node action sends invitations, reset links and the admin's test
  mail through the `SMTP_*` relay.

## Floor overlay

Built by lot 3a (ADR 0024, after ADR 0011). A floor may carry one calque: a
PNG or JPEG in Convex storage, recorded in `floorOverlayFiles`, placed by its
`floorOverlays` row and changed only through the `overlay.set` and
`overlay.patch` map operations. The browser turns every import into a raster
before upload: pdf.js for a PDF page, an `<img>` for an SVG. pdf.js's
decoders, fonts and CMaps ship inside the app bundle rather than coming from
a CDN. The plan has a fixed scale of 100 units per metre
(`PLAN_UNITS_PER_METRE`).

The canvas draws the calque under the walls in a React Flow `ViewportPortal`
(`src/overlay/`). The move, resize and rotate gizmo and the two-point
calibration share that portal and appear only while the Calque panel is open.
A gesture previews through a Zustand draft and commits one patch, so it is one
undo step. The viewport sets `pointer-events: none` and the portal inherits
it, so anything clickable placed there needs `pointer-events-auto`.

## Sites

Admins create, configure and remove sites under `/admin` (ADR 0023). A site
holds its name, unique ignoring case, its time zone and the cadence of its
collection cycle; `src/sites/settings.ts` holds the rules both the
form and the server apply. A site with a building cannot be removed. The map
shows the site the `?site=` parameter names, the first one by name otherwise,
and the sidebar switches between them. A site may connect one NetBox and one
LibreNMS: the admin enters an address and a token, which actions encrypt with
`NETPLAN_SECRET_KEY` before storing and no function returns, and the page tests
the connection.

Each site's collection cycle (`convex/collection.ts`) runs on that cadence or on
demand, one cycle at a time per site, and records what each
source answered. With a NetBox site and role types chosen, the cycle imports
the devices of those roles at most every 15 minutes (always on a manual run)
and merges them into the inventory by the rules of ADR 0022: an import is one
mutation, discarded if the address, site or roles changed while NetBox was
read. Bindings are to one NetBox: changing its address or removing it turns
its devices back into manual ones. The
plan of the deleted localization pipeline is frozen in
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
  generated `.env.local`; a Mailpit next to it catches every mail it sends. It
  seeds a fictional demo site through
  `applyMapOperation`, the same path as user edits, behind `ALLOW_DEV_SEED`.
- zipzoup reviews each pull request when it is marked ready; agents merge
  their own once CI is green and no P0 or P1 finding is open.
