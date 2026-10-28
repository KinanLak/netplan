---
title: Current architecture
description: Netplan as it stands now, at the end of the rebuild.
---

# Current architecture

Netplan is a collaborative map editor for buildings: floors, walls and network
devices (racks, switches, patch panels, PCs, endpoints, wall sockets) with the
cables between them. Each site owns an inventory of devices, placed on a floor
or not, which a collection cycle inside Convex fills from NetBox and keeps
online or offline from LibreNMS (ADRs 0022 and 0023). The cycle also keeps 30
days of history and can write where it saw each device back to NetBox (ADR
0027).

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
without a session to `/login` before any page loads. There is no sign-up; a
session lasts 24 hours from its last use and 7 days from login at most
(ADR 0031), and sign-in and password-reset attempts wait longer and longer
per identifier typed, with no limit shared between people (ADR 0036).

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
  goes to a Keycloak account. Disabling is a better-auth ban. Only an
  invitation never accepted can be deleted (C5): a used account is disabled,
  so its name stays in the history. A session hook records each sign-in in
  `signIns` for the users page. The first admin comes from
  `BOOTSTRAP_ADMIN_*` at deploy time.
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

## Sites and integrations

Built by lot 2 (ADR 0023). Admins create, configure and remove sites under
`/admin`. A site holds its name, unique ignoring case, its time zone, which
dates its history, and the one interval of its collection cycle, day and
night (ADR 0038); `src/sites/settings.ts` holds the rules both
the form and the server apply. A site with a building cannot be removed;
one no longer used is archived instead (ADR 0033): out of the picker, read
only through `requireOpenSite` and `useCanEditSite`, never collected, and
brought back as it was. The map shows the site the `?site=` parameter names,
the first one not archived by name otherwise, and the sidebar switches
between them; `?floor=` and `?device=` name the floor and selected device
(ADR 0030).

A site may connect one NetBox and one LibreNMS (`integrations`): an address
and a token, which actions encrypt with `NETPLAN_SECRET_KEY` before storing
and no function returns. Every request to a source runs in a Node action
(`convex/sources.ts`), which may skip certificate checks for a connection
whose admin ticked "Ignorer les erreurs de certificat TLS" (ADR 0028). The
admin tests what the form shows and saves it only once the source answers,
then maps the
NetBox site and the Netplan type of each NetBox role, and each Netplan switch
to its LibreNMS device. Settings are keyed by the source's ids, so changing
a LibreNMS address forgets its mapping. A new NetBox address is first asked
for the configured site and roles by id (ADR 0034): the same instance keeps
everything; another one, once the admin confirms how many devices are
linked, forgets the site and roles and makes those devices absent, bound
to the former instance so that only MAC, serial or hostname can link them
again, with their ports and NetBox cables turned manual. [`docs/operations/integrations.md`](../operations/integrations.md)
says how to check a real LibreNMS.

## Inventory, ports and cables

Built by lot 2 (ADRs 0005, 0007 and 0022). A device belongs to its site;
its placement (floor, position, size) is optional. Placing, unplacing and
moving are map operations (`device.place`, `device.unplace`, `device.patch`,
`devices.move`), so they are undoable and an operation touches one floor.
Identity (name, hostname, serial, MACs, model, IP) is edited through
site-scoped mutations from the drawer or the inventory page
(`/inventory`), which also creates and deletes devices. The map's « Placer »
panel lists the unplaced ones, places one by a click or a drop, and creates
new ones; it stays open while a floor fills up. A
MAC belongs to at most one device of a site (`deviceMacs`). A device with
a hostname is named after it (`namedAfterHostname`, ADR 0029), unless a
source owns its name. A device a
source brought records it, and the fields that source owns
(`src/devices/identity.ts`) are read-only in the UI and refused by the
server.

Devices have ports (`ports`), and a cable joins two ports, one cable per
port (`cables`). A front port of a patch panel points at its rear port, so
the device drawer's port table traces a switch port through patch panels
to its wall socket. Éditeurs cable and unplug ports from that table; a
floor's document carries the cables of its devices, including those whose
other end is elsewhere.

## Collection

Each site's collection cycle (`convex/collection.ts`) runs every interval or
on demand, one at a time per site under a lease (`siteCycles`), and records
what each source answered for the admin page. `NETPLAN_COLLECTION_PAUSED`
stops every cycle on a server.

- **NetBox** (`convex/netbox*.ts`, the merge in `src/sites/netboxImport.ts`):
  at most every 15 minutes, always on a manual run, the cycle reads the
  devices of the mapped roles with their MACs, ports and cables, and one
  mutation merges them into the inventory. A MAC or serial match without
  contradiction binds a manual device; a hostname-only match waits as an
  Éditeur suggestion, an ambiguous one as an admin conflict
  (`importReviews`), both settled from the inventory page. A device NetBox
  no longer lists stays bound, absent since `source.missingSince` (ADR
  0039): NetBox returning it, under its id or by MAC or serial, clears it;
  a daily job purges one that has been absent, and on no floor, for 30
  days, measured up to the last import. The push skips absent devices.
- **LibreNMS** (`convex/librenmsCycle.ts`, the pure rules in
  `src/sites/librenmsCycle.ts`): at most every 5 minutes the cycle asks each
  polled switch to rediscover, then reads its ports and forwarding table.
  Only entries the discovery refreshed count: a discovery that leaves the table's newest entry unchanged refreshed nothing, nor do later reads until a discovery moves it.
  The comparison stays within the table's own timestamps, so a switch's
  first read takes one reading before its discovery. Entries count only on
  edge ports: a port
  cabled to a wall socket, or an uncabled one with at most four MACs. Each
  MAC seen goes to `macSightings`. A pc or endpoint is online when one of its
  MACs is seen and offline after two cycles without; one seen at a new
  socket, or while on no floor, is placed next to it through
  `applyMapOperation` with the client id `librenms`. A MAC no device carries
  is listed in the inventory, where an Éditeur turns it into an endpoint.

A LibreNMS step keeps each polled switch's result (`switches`: name, ok,
notes) next to its message; the message alone stays readable on the site
page, and the admin health page reads the list.

The plan of the deleted localization pipeline is frozen in
[`docs/history/2026-07-computer-location-refresh/`](../history/2026-07-computer-location-refresh/README.md).

## Experience

Built by lot 4 (ADR 0026).

- **Freshness.** `collection.freshness` is a reader query; the client ages
  it against its own clock with the pure rules of `src/sites/freshness.ts`
  (`siteCycles.lastSuccessAt`, the interval, failures in a row), so a page
  turns late without a query re-running. One `CollectionFreshness` block
  shows it on the map and in the inventory, with "Actualiser" and its
  shortcut for Éditeurs.
- **Messages.** Every refusal is a French sentence, map-operation
  rejections included, and `failureMessage` (`src/lib/errors.ts`) turns any
  failure into one. The authenticated layout holds the app's only toaster,
  bottom centre.
- **Inventory views.** Search, filters and order live in the URL
  (`src/inventory/filters.ts`), so links such as the sidebar's « hors plan » count
  (`?placement=unplaced`) and Back restore a list; counts follow the other filters. Per-type coverage
  cards filter to what is left to place. Unknown MACs have their own tab
  (`?view=unknown`, Éditeurs only); `ignore` and `restore` take a list, all or
  none, and `ignoredMacs` keeps where each MAC was last seen.
- **Dates and times** are always shown in the reader's zone and the
  browser's locale on a 24-hour clock, the zone on hover (`src/lib/time.ts`,
  `<Time>`); relative words (« il y a 3 min », « Aujourd'hui ») stay French
  with the interface. A site's zone only schedules its cycles and snapshot
  slots.
- **Buildings and floors.** Éditeurs create, rename and remove them through
  `convex/buildings.ts` and `convex/floors.ts`, outside the map's undo, so
  removal is refused unless nothing stands on the floor. Names are unique
  among siblings, ignoring case and accents.
- **Admin health.** `/admin/health`, the admin's landing page, reads
  `health.overview`: every site's freshness, last cycle, NetBox import age,
  switch counts by status and per-switch LibreNMS results.

## Shell

Built by the UX lot U1 (ADR 0031) and reworked by U8 (ADR 0037).

- **Theme and errors.** A script in `<head>` sets the theme class before the
  first paint and `ThemeProvider` lives at the root, so every page, the
  sign-in ones included, follows it. The root's `shellComponent` keeps the
  document around `ErrorScreen`, the French screen every route falls back
  to. In the browser, the root `beforeLoad` and loader answer from what the
  page loaded with, and Convex gets a constant identity from
  `src/lib/session-token.ts` that survives an outage (ADR 0037).
- **Sign-in.** better-auth's address-keyed limiter is off; a `before` hook
  counts sign-in and reset attempts per identifier in `authAttempts`, and
  an `after` hook wipes them on a successful sign-in (ADR 0036). A
  session slides 24 hours from its last use, capped at 7 days from login by
  a session update hook. A function refusing a lost session says whether
  the account was disabled, and the sign-in page says so.
- **Offline.** `ConnectionBanner`, mounted once in the signed-in layout,
  follows Convex's socket and `navigator.onLine` (`src/lib/connection.ts`).
  The moment either drops, `useConnectionStore.isOffline` stops every
  write: the map session refuses new operations, and changes made outside
  the map go through `useOnlineMutation`, which refuses them with a
  message. After 2 s `isMapFrozen` follows: `useIsEditMode()` and the
  shortcut runtime read it, open tools and the structure dialog close, and
  a discreet line says so with the count of edits sent but unconfirmed.
  Convex's client sends those again on reconnection (ADR 0037).

## Map

Built by lot 3b (ADR 0025) and redrawn by the UX lot U3 (ADR 0029).

- **Observed facts.** The LibreNMS step records each switch's last good
  read (`siteCycles.switchReads`). A switch's status, its ports' link and
  "Appareil vu", and the status of every device last seen on it rest on
  that read. Past two intervals plus the lease, 25 minutes by default, the
  minute cron expires them (`expireStaleReads`): port facts go, and a device or switch
  the network did see turns `stale`, « Plus de nouvelles depuis … », with
  `metadata.lastSeenAt` (ADR 0032), so a dead LibreNMS shows as such rather
  than freezing the map. « Inconnu » means never seen.
  `convex/lib/statuses.ts` derives the same from the sightings for what an
  undo or a create brings back. `devices.lastSeen` gives every role the
  newest sighting, the drawer's « Vu sur le réseau ». A manual
  switch whose ports still carry their default names takes LibreNMS's.
- **Ports and dots.** Switches and patch panels draw their real ports, coloured
  by `src/devices/portState.ts`. Every device with a status carries a dot.
- **Paths.** `src/canvas/cablePaths.ts` traces, in the browser and from the
  floor document, a path through patch panels to the switch port. A PC is
  joined to the socket where it was last seen by a dashed segment. Hovering
  or selecting a PC, endpoint or socket shows its path. A switch or panel
  shows all of its paths only on demand (menu, drawer or H) until it is
  hidden or another device's are shown. A trace stops rather than guess, at
  a loop, a hop limit, or a shared rear port; a hop off the floor ends on a
  label. Paths are React Flow edges (ADR 0029) between the handles nodes
  carry at their ports, socket icons and status dots, curved and coloured by
  the link at the switch end; end labels show only where they cover no
  other device.
- **Cable editing.** In edit mode a port is a grip
  (`src/canvas/cableDrawing.ts`): a free one draws a cable to another device
  of the floor, and a cabled one offers to unplug it. Both go through
  `useCableCommands`, the port table's mutations and its "Annuler" toast,
  outside the map's undo; Ctrl+Z right after a cable change shows that
  toast again rather than undoing an older map edit. Cables an integration made, and cables to another
  floor, stay with the port table. Undoing a device's deletion lays its
  cables again where they still fit, and says how many could not
  (`droppedCables` in the operation's result).
- **Text labels.** A floor carries free text labels (`mapLabels`, ADR
  0029), such as room names, with no link to its walls. They are map
  operations (`label.create`, `label.patch`, `label.delete`) with an inverse
  and the same server planning as the rest; the « Texte » tool (5 or T)
  puts one where the plan is clicked. They go with a deleted floor, whose
  confirmation names them.
- **View, keys and selection (ADR 0030).** Each floor's view lives in
  `sessionStorage`; a first visit fits devices, walls and calque at most at
  100 %, and the view zooms out at least far enough to show them whole. A device selected from outside the plan goes through
  `locateDevice`, which the canvas answers once the floor shows. One
  shortcut listener in the authenticated layout routes keys by
  `src/lib/shortcut-intents.ts`; React Flow's own keyboard handling is off.
  The selection is the store's set: a drag or the arrows move it as one
  `devices.move`, one offset for every member that no member's path may take
  through a wall (ADR 0034); a held arrow key sums its steps into one move on
  release. Delete takes the selection off the plan as one batch.
- **Moves made by others.** The cycle moves devices through
  `applyMapOperation`, so they reach every client and enter no history. An
  undo or redo carries where it expects the device (`expected` on
  `device.patch` and `device.unplace`, `from` on `devices.move`), and the engine and server refuse it
  once someone else, the cycle included, has moved the device since.

## History and the push to NetBox

Built by lot 5 (ADR 0027).

- **History** is what the network observed, written only by the LibreNMS
  step, so it has no map operation and no undo. `deviceEvents` records,
  for pcs and endpoints, a `located` event when a device is first seen or
  seen on none of the ports its latest sighting saw, and `online`/`offline`
  when its derived status changes; a status turned stale because its read
  grew old records nothing. Each event copies the names it shows, so renaming or
  deleting a socket never rewrites the past.
- **Snapshots.** At 08, 12, 14, 16 and 19h site time, the first cycle whose
  LibreNMS step reads within the slot's window claims a `historySlots` row
  in its own mutation, then its action writes the MACs it saw to
  `historySlotEntries`, 500 per mutation, and marks the slot complete. An
  incomplete or missing slot reads "Pas de relevé"; nothing fills it later.
- **Reading it.** `history.forSite` and `history.slotEntries` search before
  paging (every word, any MAC notation, device and place names) and the page
  reads on until it fills; dates narrow the index range. The page groups
  events under the reader's days and merges an arrival's `located` and
  `online` for display only (`src/history/timeline.ts`); a device's
  snapshots fold into runs per MAC and place (`snapshotRuns`). View, filters,
  day and slot live in the URL.
- **Access and retention.** Every history query is an `editorQuery`; a
  Lecteur is refused by the server. A daily cron deletes events and slots
  older than 30 days in pages of 500.
- **Push.** With the site's switch on, a cycle that ends schedules one push
  run under a lease on its `siteCycles` row. It compares each NetBox
  device's location with what `netboxPushes` says was last sent to that
  NetBox id and PATCHes five `netplan_*` custom fields where they differ,
  at most 100 per run. Each attempt first asks whether the push is still on
  and the lease still held; changing or removing the NetBox forgets the
  rows and the lease, so nothing from the old NetBox is recorded. A refusal
  waits from one minute doubling to an hour; a network failure or 5xx ends
  the run. `health.overview` shows the last run and the devices still
  failing.

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
