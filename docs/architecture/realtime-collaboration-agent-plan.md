# Agent Implementation Plan: Robust Realtime Collaboration

This file is the step-by-step execution plan for implementing the architecture described in `docs/architecture/realtime-collaboration-architecture.md`.

Follow this plan in order. Do not skip tests. Do not preserve backwards compatibility with the current PR implementation unless this document explicitly says to keep something. This project is unreleased and should prefer canonical architecture over compatibility shims.

## Before Starting

Read these files first:

- `docs/architecture/realtime-collaboration-architecture.md`
- `AGENTS.md`
- `src/types/map.ts`
- `src/store/useMapCommands.ts`
- `src/store/mapHistory.ts`
- `src/store/useMapStore.ts`
- `src/canvas/FlowCanvas.tsx`
- `src/canvas/hooks/useCanvasDeviceNodes.ts`
- `src/panels/Toolbar.tsx`
- `src/panels/DeviceDrawer.tsx`
- `src/walls/useWallToolSession.ts`
- `convex/schema.ts`
- `convex/devices.ts`
- `convex/walls.ts`
- `convex/links.ts`
- `convex/presences.ts`

Run the existing test suite before changes if feasible:

```sh
bun run tsc
bun test
```

Run `bun run check` after code changes are complete.

## Phase 1: Introduce Stable Domain IDs

Goal: client/domain code stops depending on Convex `_id`.

Tasks:

- Add application id aliases in `src/types/map.ts`.
- Rename client-facing ids to plain `id` where practical.
- Keep Convex `_id` only in repository/Convex boundary types.
- Add or update identity utilities so the client can generate stable object ids and operation ids before dispatch.
- Persist the counters or use UUIDs. Do not use `Date.now() + Math.random()` for durable ids.

Suggested files:

- `src/lib/identity.ts`
- `src/lib/objectIds.ts`
- `src/types/map.ts`

Expected API:

```ts
export function createObjectId(
  kind: ObjectKind,
  identity: LocalIdentity,
): ObjectId;
export function createOperationMeta(identity: LocalIdentity): OperationMeta;
```

Tests:

- Id generation is stable and unique across calls.
- Operation ids are unique and include client identity.
- Invalid persisted identity recovers cleanly.

Stop condition:

- New domain operations can be built without Convex `_id`.

## Phase 2: Add Pure Map Engine

Goal: document changes are represented by pure operations that can run on client and server.

Create:

- `src/map-engine/types.ts`
- `src/map-engine/applyOperation.ts`
- `src/map-engine/applyOperation.test.ts`
- `src/map-engine/buildInverseOperation.ts`
- `src/map-engine/buildInverseOperation.test.ts`
- `src/map-engine/materializeDocument.ts`
- `src/map-engine/materializeDocument.test.ts`
- `src/map-engine/validation.ts`
- `src/map-engine/validation.test.ts`

Implementation requirements:

- No React imports.
- No Convex imports except shared serializable type aliases if unavoidable. Prefer no Convex imports.
- No Zustand imports.
- No React Flow imports.
- Use explicit operation unions.
- Use explicit patch types.
- Return structured results instead of throwing for expected domain conflicts.

Tests to write before or with implementation:

- `device.create` applies and is idempotent for same payload.
- `device.create` same id with conflicting payload returns conflict.
- `device.patch(position)` updates only position.
- `device.delete` removes connected links.
- `link.create` requires endpoints.
- `walls.add` deduplicates geometry keys.
- `walls.delete` is idempotent.
- `batch` applies sub-operations in order.
- `buildInverseOperation` for device move preserves unrelated later properties.
- `materializeDocument(server, pending)` reapplies pending local operations over stale server snapshots.

Stop condition:

- The pure engine can model all current map mutations without UI/Convex dependencies.

## Phase 3: Update Convex Schema And Repositories

Goal: Convex stores object ids and applies idempotent operations.

Tasks:

- Add `objectId` fields to `buildings`, `floors`, `devices`, `walls`, `links`.
- Add indexes by `objectId` and floor indexes using object ids.
- Add `clientOperations` table indexed by `opId` and `clientId/clientSeq`.
- Add a Convex mutation module, suggested `convex/mapOperations.ts`.
- Decode operation inputs into typed server operations.
- Validate server invariants before writes.
- Make duplicate `opId` return the previous result.
- Convert Convex rows to `MapDocumentSnapshot` using application ids.

Suggested query:

```ts
api.mapDocument.getFloorDocument({ floorId });
```

It should return one document snapshot containing devices, walls, and links for the floor, already converted to app ids.

Suggested mutation:

```ts
api.mapOperations.apply({ operation });
```

Tests:

- Applying same operation twice is idempotent.
- Duplicate create with same object id and same payload is safe.
- Duplicate create with same object id and different payload rejects.
- Move collision rejects.
- Wall collision rejects.
- Link across floors rejects.
- Delete device removes/tombstones connected links.
- Operation log row is written once.

Stop condition:

- Convex can apply all operation kinds through the operation endpoint.

## Phase 4: Build `MapDocumentProvider`

Goal: one session owner controls document state, pending ops, outbox, and history.

Create:

- `src/map-session/MapDocumentProvider.tsx`
- `src/map-session/useMapDocument.ts`
- `src/map-session/outbox.ts`
- `src/map-session/history.ts`
- `src/map-session/reconcileEphemeralState.ts`

Responsibilities:

- Query `api.mapDocument.getFloorDocument`.
- Store pending operations in provider state/ref.
- Materialize visible document with `materializeDocument`.
- Provide commands for UI.
- Enqueue operations in the outbox.
- Flush operations sequentially.
- Remove pending operations by `opId` on ACK.
- Keep pending operations on network failure.
- Handle rejection by removing pending op and exposing a rejected state.
- Push undo history at local dispatch time.
- Reconcile selected/highlighted ids against visible document.

Provider API should be stable and simple:

```ts
const { document, isReady, isSaving, commands, undo, redo } = useMapDocument();
```

Tests:

- Dispatch appends pending op and updates visible doc immediately.
- ACK removes pending op without visual jump.
- Stale server snapshot plus pending op does not flicker.
- Rejected op is removed and visible doc rolls back intentionally.
- Outbox flushes sequentially.
- Retry reuses the same `opId`.

Stop condition:

- UI can read a materialized document and dispatch operations without direct Convex mutation hooks.

## Phase 5: Migrate UI To The Provider

Goal: remove scattered direct map command hooks.

Update:

- `src/routes/index.tsx` to wrap the map UI in `MapDocumentProvider`.
- `src/canvas/FlowCanvas.tsx` to use `useMapDocument()` for devices/walls/commands.
- `src/canvas/hooks/useCanvasDeviceNodes.ts` to use domain ids.
- `src/panels/Toolbar.tsx` to call provider commands.
- `src/panels/DeviceDrawer.tsx` to read selected device from provider document.
- `src/walls/useWallToolSession.ts` to call provider commands.
- `src/hooks/use-undo-redo.ts` to delegate to provider or session-level history, not global scattered refs.

Remove or retire:

- `src/store/useMapCommands.ts` if fully replaced.
- Old inverse-command runners in `src/store/mapHistory.ts` if replaced.
- `zundo` dependency if no longer used.
- Any use of Convex `_id` in UI selection, links, presence, React Flow nodes, and tests.

Rules:

- UI components must not call Convex map mutations directly.
- UI components must not instantiate command hooks with independent history state.
- React Flow node ids must be application object ids.

Tests:

- Toolbar add device renders immediately with stable id.
- Device can be selected immediately after local create.
- Device can be dragged immediately after local create.
- Device can be deleted immediately after local create.
- Undo/redo buttons reflect provider history.
- Drawer closes when selected device disappears.

Stop condition:

- There is exactly one active document session owner for map commands.

## Phase 6: Presence And Drag Polish

Goal: preserve low latency without spamming durable document writes.

Tasks:

- Migrate presence references to application object ids.
- Add optional edit lease/drag preview presence state.
- During device drag, update local UI at frame speed.
- Publish drag preview via presence throttled around 15-30Hz.
- Send one durable `device.patch(position)` operation on drag stop.
- Prevent accidental same-device drag when another active lease exists.

Tests:

- Dragging does not enqueue durable ops per pointer move.
- Drag stop enqueues exactly one durable position op.
- Remote drag preview renders from presence and does not change durable snapshot.
- Expired leases do not block editing.

Stop condition:

- Drag feels instant locally and clean remotely.

## Phase 7: Seed And Regression Recovery

Goal: preserve product richness from the original local mock data.

Tasks:

- Recreate previous mock buildings/floors/devices in Convex seed.
- Convert old `metadata.connectedDeviceIds` relationships into `links` rows.
- Preserve metadata: IP, status, model, ports, last user.
- Make seed idempotent by application object id.

Tests:

- Seed creates expected building and floors.
- Seed creates representative devices on both floors.
- Seed creates links equivalent to previous connected devices.
- Running seed twice does not duplicate objects.

Stop condition:

- First-run map is at least as useful as `main` mock data.

## Phase 8: Final Hardening

Required checks:

```sh
bun run check
```

Manual QA:

- Open two browser sessions on same floor.
- Create, immediately drag, then delete before ACK.
- Drag different devices concurrently.
- Attempt same-device drag and verify lease UX.
- Delete selected device from another client and verify drawer closes.
- Undo move after remote rename and verify rename survives.
- Undo delete with links and verify links restore if endpoints still exist.
- Disconnect network, create/change objects, reconnect, and verify pending ops apply or reject cleanly.

Final review checklist:

- No UI domain code depends on Convex `_id`.
- No generated ids inside Convex optimistic update callbacks.
- No multiple independent map command hooks.
- Server validates collisions and links.
- Operation log idempotency exists and is tested.
- Pending local operation overlay prevents flicker.
- Undo/redo creates new operations and handles stale targets safely.
- Presence is separate from durable document state.
- `zundo` is removed if unused.
- `AGENTS.md` is updated if architectural rules changed.

## Suggested Commit/PR Structure

If implementing in multiple commits, keep changes reviewable:

1. Add architecture docs and pure operation types.
2. Add pure operation engine with tests.
3. Add Convex object ids and operation endpoint with tests.
4. Add MapDocumentProvider and outbox with tests.
5. Migrate canvas/toolbar/drawer/wall tools to provider.
6. Add presence drag preview and leases.
7. Restore seed/demo data.
8. Remove obsolete code/dependencies and update docs.

Do not mix large UI migration and server operation semantics in the same commit if avoidable.
