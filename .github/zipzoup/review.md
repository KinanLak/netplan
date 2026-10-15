Netplan is a self-hosted, collaborative map of buildings for network teams:
floors, walls, racks, switches, wall sockets and PCs, with their cables, and
each PC placed where NetBox and LibreNMS last saw it. Convex backend, TanStack
Start web app, French interface, English repository. It is being rebuilt
(docs/architecture/target.md); docs/adr holds the decisions. AGENTS.md has the
full rules; these are the ones a review has to enforce.

## Priority floors

- P0: a secret, token or credential committed, logged or sent to the client
  bundle; code that writes to NetBox outside a `netplan-test-*` object or
  deletes or modifies a real device, cable or interface there; a Convex
  function that lets a caller do what their role forbids once roles exist
  (ADR 0004); map data lost or corrupted.
- P1 at least: a broken map invariant below; a schema change existing
  documents do not satisfy; a seed or dev-only function reachable without
  the `ALLOW_DEV_SEED` guard (ADR 0018); a durable map change that bypasses
  `useMapDocument()` or `api.mapOperations.apply`.

## Map domain (src/map-engine, src/map-session, convex/mapOperations.ts)

- Durable changes are `MapOperation`s. A new one ships with its pure engine
  behaviour, its inverse for undo, its server application and tests.
- The server re-validates everything it applies: floor, object ids,
  collisions, link endpoints on the same floor, orthogonal walls with a
  `geometryKey` matching their normalized geometry, and link cleanup when a
  device is deleted. Client-only validation is a P1.
- Convex `_id` never leaves `convex/`; UI and domain code use branded
  `objectId`s from `src/types/map.ts`.
- Zustand holds only ephemeral UI state; durable state belongs in Convex.

## Integrations (NetBox, LibreNMS)

- NetBox and LibreNMS are real production tools. Reads are free; writes are
  minimal, behind a feature switch, and never touch a real device, cable or
  interface. LibreNMS discovery is triggered at most once per five minutes
  per site.
- Fields owned by a source are read-only in Netplan (ADR 0007).
- Network calls retry on timeouts and 5xx, and a failed cycle is recorded,
  not swallowed.

## Web app (src)

- Interface strings are French; code, comments and identifiers English.
- `VITE_*` values are compiled into the bundle: never a secret there.
- React Compiler is on: flag `useMemo`/`useCallback` added only for
  memoization. Flag `any`.
- No Tailwind opacity modifiers on semantic colours (`text-primary/80`).
- A user-facing action usually exists on several surfaces (canvas, panels,
  shortcuts, undo): flag a change that covers one and misses the others.
- `src/routeTree.gen.ts` and `convex/_generated` are generated: flag hand
  edits, not regenerated content.

## Tooling and CI

- `bun run check` stays read-only; anything that writes belongs in `fix`.
- Scripts that start processes or containers kill only what they started
  (never by name pattern) and touch only Docker resources labelled
  `netplan.*`.
- Dependencies are added with `bun add`, at their latest version.

## Docs

- docs/adr records and docs/history snapshots are never rewritten; a new
  record supersedes. Lots only append their journal to
  docs/history/decision-log.md.
- AGENTS.md and docs/architecture describe the current state: a change that
  makes them false updates them in the same pull request.
