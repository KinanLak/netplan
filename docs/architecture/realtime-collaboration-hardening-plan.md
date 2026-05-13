# Realtime Collaboration Hardening Plan

Status: implementation plan for hardening PR #4 before merge.

Primary target commit: `78e922e1a2528c33f33d6af1d5403b8c8e15e9a3`.

Audience: an implementation agent with no prior conversation context.

Goal: keep the good architecture from the refactor while removing the remaining concurrency, async, latency, and UX risks. The target product quality is a polished Figma-like multiplayer editor: instant local edits, no flicker, explicit recovery, robust retry, and no silent data loss.

## Decisions

Use these choices unless the user explicitly changes direction.

- Multi-tab identity: use a per-tab/per-page instance id. Keep a stable user/client identity for display, but `sessionId` must be unique per tab and durable `opId`/object ids must include an instance namespace or otherwise be collision-proof across tabs.
- Floor changes with pending work: use an outbox scoped per floor/document. Switching floors must not clear unsent or in-flight operations. Pending operations continue to flush in the background or remain resumable when the user returns.
- Pending operation removal: do not remove a local pending operation merely because the mutation promise resolved. Remove it only after the client observes a server snapshot/revision that includes the operation's effect, or an equivalent observed applied revision.
- Retry policy: after transient network/mutation failures, retry automatically with backoff and jitter while the operation remains pending. Also retry immediately when the WebSocket reconnects.
- Batch protocol: batches have one external `meta`. Sub-operations do not carry independent `meta` and cannot be submitted or deduped independently inside a batch.
- Readiness UX: combine a small visible loading/saving indicator with disabled actions. No command should silently no-op because the document is still loading.

## Current Good Direction

Keep these parts of the refactor.

- `MapDocumentProvider` is the single owner for map command dispatch, pending operations, outbox, and undo/redo.
- React UI consumes `useMapDocument()` instead of calling Convex map mutations directly.
- Durable map state uses application object ids instead of Convex `_id` outside Convex boundaries.
- The visible document is a materialized projection of server snapshot plus local pending operations.
- Server-side map operation validation is centralized through `api.mapOperations.apply`.
- Presence is separate from durable document state.

## Required Fixes

### 1. Make Identity Safe Across Tabs

Problem: `src/lib/identity.ts` currently persists `sessionId`, `nextObjectCounter`, and `nextOperationCounter` in `netplan-identity`. Two tabs can load the same counters, generate identical `opId`s/object ids, and overwrite the same presence row.

Implement:

- Generate a fresh per-tab `sessionId` or `instanceId` for each page load/tab.
- Ensure durable ids are unique across tabs. Preferred format examples:
  - `op:${clientId}:${sessionId}:${seq}`
  - `${kind}:${clientId}:${sessionId}:${counter}`
- Keep stable display identity in `netplan-identity`: client id, display name, color hue, and any persisted user-facing metadata.
- If keeping counters, scope them to the per-tab instance. Do not share a mutable in-memory counter across tabs without a uniqueness namespace.
- Presence must use the per-tab `sessionId`, so two tabs from the same browser render as two independent sessions.
- Add migration behavior for old `netplan-identity` entries. This project is unreleased, so keep the migration simple and canonical, not backwards-compatible ceremony.

Tests:

- Simulate two identities loaded from the same persisted storage and prove generated `opId`s differ.
- Simulate two tabs and prove generated object ids differ.
- Prove presence session ids are distinct while display identity can remain stable.

Acceptance:

- No two tabs can produce the same `opId` or object id through normal code paths.
- No two tabs overwrite each other's presence row.

### 2. Preserve Pending Work Across Floor Changes

Problem: `src/map-session/MapDocumentProvider.tsx:216-224` clears pending operations, history, rejected state, and `outbox.clear()` during floor changes. This can silently drop offline or in-flight edits.

Implement:

- Replace the current floor-change reset with state scoped by `floorId`.
- Pending operations for non-visible floors must not be discarded.
- The visible document for the active floor should materialize only that floor's pending operations.
- The outbox may be one global sequential queue with floor-tagged operations or one queue per floor. The important invariant is no silent drop on navigation.
- Undo/redo history should be scoped consistently. At minimum, do not expose undo entries for a floor different from the active floor unless the UX clearly supports cross-floor undo.
- Rejected operations should remain associated with the floor/document they came from.

Tests:

- Dispatch an operation, switch floors before ACK, and prove the operation is still queued/pending.
- Switch back and prove the materialized document still includes the pending edit.
- Simulate a network failure, switch floors, retry, and prove the original operation uses the same `opId`.
- Verify switching floors does not call `clear()` on an in-flight queue in a way that drops the operation.

Acceptance:

- Floor navigation never loses unsent edits.
- The UI can show pending/saving state for background floors or at least not claim everything is saved when background floor work remains.

### 3. Remove Pending Ops Only After Observed Server State

Problem: `src/map-session/MapDocumentProvider.tsx:193-196` removes pending operations on mutation ACK. If the reactive server snapshot has not caught up, the materialized document can briefly fall back to stale server state.

Implement:

- Add an observed server-state signal that lets the client know an ACKed operation is represented in the server snapshot.
- Preferred concrete implementation:
  - Add a per-floor/document revision that increments for every applied map operation that affects the document.
  - `api.mapOperations.apply` returns the applied revision for accepted operations.
  - `api.mapDocument.getFloorDocument` includes the current revision.
  - Pending entries track `ackedRevision` after mutation success.
  - Remove a pending entry only when `serverDocument.revision >= ackedRevision`.
- Rejected operations should still be removed immediately, with visible rejection feedback.
- No-op-but-applied operations need a deterministic removal path. If no document data changes, either still advance a document revision or attach an observed op marker that the snapshot query can see.
- Do not rely only on timing assumptions from Convex mutation promises.

Tests:

- Simulate ACK before snapshot update and prove the visible document does not flicker backward.
- Simulate snapshot update after ACK and prove the pending op is then removed.
- Cover create, patch, delete, wall add/delete, and no-op/idempotent applied cases.
- Add at least one UI-level or provider-level regression test if practical; otherwise extract a pure reducer/state machine and test that directly.

Acceptance:

- A local edit remains visible until the server snapshot has caught up.
- Adding and immediately selecting a device cannot close the drawer because the device temporarily disappeared.
- Dragging a device cannot snap back because ACK arrived before the query update.

### 4. Make Outbox Retry Robust

Problem: `src/map-session/outbox.ts:69-75` keeps the failed operation but stops flushing. It retries only when `isWebSocketConnected` changes or another caller manually triggers retry.

Implement:

- Add automatic retry with exponential backoff and jitter after transient failures.
- Keep the same operation and same `opId` for every retry.
- Retry immediately on WebSocket reconnect.
- Stop timers cleanly when a queue/floor session is disposed.
- Do not retry validation rejections. Rejections are terminal for that operation.
- Expose enough state for UX: pending, retrying, last failure, next retry time if useful.

Tests:

- Network failure keeps the operation at the head of the queue.
- Retry happens automatically without a new user action or reconnect.
- Retry uses the same `opId`.
- Reconnect triggers immediate retry.
- Validation rejection does not retry.
- Clearing/disposal cancels timers and ignores stale in-flight responses.

Acceptance:

- Transient failure while the socket remains connected cannot leave the queue stuck forever.
- User sees saving/retrying state instead of silent failure.

### 5. Canonicalize Batch Operations

Problem: batches currently allow sub-operations with their own `meta`. The server logs only the outer batch `opId`, so nested metadata is misleading and not independently idempotent.

Implement:

- Redefine map operation types so `batch` has one `meta` and contains sub-operations without `meta`.
- Disallow nested batches unless a clear need exists. Prefer no nested batch for now.
- Update Convex validators to reject nested metadata inside batch operations.
- Update client inverse/history code so metadata is applied at dispatch time to the outer operation only.
- Server planning should receive the effective batch meta from the parent and use it for timestamps/updatedBy.
- Operation log should record the batch as one atomic operation.

Tests:

- Validator rejects a batch with sub-operation `meta`.
- Server applies a valid batch atomically.
- Replaying the same batch `opId` is idempotent.
- A sub-operation from a batch cannot later be replayed as an independent operation using hidden nested metadata.
- Undo/redo batch operations still build correct inverses.

Acceptance:

- Batch idempotency semantics are unambiguous.
- There is exactly one operation identity per batch.

### 6. Harden Server Validation

Problem: server validators accept arbitrary numbers and sizes. Negative or zero dimensions can bypass collision logic. Some constraints are currently implicit or duplicated.

Implement:

- Validate all positions/sizes that reach durable mutations.
- Reject non-finite numbers, `NaN`, `Infinity`, negative sizes, and zero sizes where the domain requires visible devices.
- Validate wall geometry strictly:
  - Orthogonal only.
  - Canonical start/end persisted, not just canonical `geometryKey`.
  - Geometry key format must match the canonical server representation.
- Validate link endpoints and floors against the planned state.
- Consider per-operation array limits for walls/batches to prevent unbounded mutation payloads.
- Avoid trusting client timestamps for durable `updatedAt` or operation `appliedAt`. Use server time for durable audit/update fields. Client-created time can be stored separately if useful.

Tests:

- Reject negative, zero, `NaN`, and infinite sizes/positions.
- Reject diagonal wall geometry.
- Persist canonical wall endpoints for reversed equivalent input.
- Reject or safely cap oversized batches/wall arrays.
- Prove collisions cannot be bypassed with malformed sizes.

Acceptance:

- Durable rows cannot contain malformed geometry or invalid device sizes through `api.mapOperations.apply`.
- Server remains the authoritative invariant boundary.

### 7. Fix History Group Rejection Handling

Problem: rejected operations are removed from undo/redo stacks, but not from an open `historyGroupRef`. A later `endHistoryGroup()` can push an inverse for an operation that was rejected.

Implement:

- Track rejected source op ids inside the active history group and remove them before committing the group.
- If a group becomes empty after rejection, do not push a history entry.
- If a group contains mixed accepted/rejected operations, only accepted operations should remain undoable.
- Ensure rejection during wall brush/erase grouping cannot leave stale undo history.

Tests:

- Begin group, dispatch op, reject op, end group: no undo entry.
- Begin group, dispatch two ops, reject one, end group: undo contains only the accepted operation.
- Rejection before `endHistoryGroup()` does not create a redo/undo corrupt state.

Acceptance:

- Undo/redo never tries to reverse an operation the server rejected.

### 8. Make Readiness UX Explicit

Problem: toolbar and wall interactions can no-op silently when the document is not ready. Bootstrapping only waits for buildings/floors, not the floor document.

Implement:

- Surface a small loading/saving/retrying indicator in or near the canvas while the active document is loading or pending.
- Disable toolbar actions, device add, wall tools, drag commits, delete, undo/redo, and shortcuts when the active document is not ready.
- Do not let the user open a device picker that cannot add a device.
- If an action is attempted while disabled, prefer explicit disabled UI over handler-level no-op.
- Wall tool state should not advance locally if commands are unavailable.
- Keyboard shortcuts should respect the same readiness/edit-mode gates as visible controls.

Tests:

- Toolbar actions are disabled while `isReady === false`.
- Device picker cannot silently no-op during loading.
- Wall click/drag does not advance anchors/state while document is unavailable.
- Undo/redo keyboard shortcuts do not mutate when edit mode/readiness says they are unavailable.
- Loading/saving/retrying status renders in the workspace.

Acceptance:

- The user always understands whether the document is loading, saving, retrying, rejected, or ready.
- No loading-state command fails silently.

## Test Plan

Add tests with the implementation, not after.

Required coverage areas:

- Identity multi-tab uniqueness.
- Outbox retry state machine.
- Pending removal after observed server revision/snapshot.
- Floor-scoped pending operation preservation.
- Batch validator and server apply semantics.
- Server validation for malformed geometry/device sizes.
- History group rejection behavior.
- UI readiness gating for toolbar, wall tools, undo/redo, and device add.

Suggested test shape:

- Prefer pure unit tests for operation/session/outbox state machines.
- Use Convex tests for server invariants and idempotency.
- Use React Testing Library only for UI behavior that cannot be reduced to pure logic.
- If `MapDocumentProvider` is too hard to test directly, extract a small pure session reducer and test the reducer thoroughly.

## Manual QA Scenarios

Run these after automated tests pass.

- Open two tabs, create devices rapidly in both, verify no id collisions and both presences appear independently.
- Add a device and immediately select/drag/delete it before the network round-trip finishes.
- Drag a device with throttled network and verify it never snaps backward after ACK.
- Disconnect network, create/move a device, switch floors, reconnect, and verify the edit applies or rejects visibly without data loss.
- Draw a wall stroke while another client moves a device into the same space; verify server rejection is clear and undo history remains sane.
- Create and undo a batch-like action, then redo it after a remote edit to the same floor.
- Load a floor from cold start and verify actions are disabled until the document is ready.

## Verification

The implementation is not done until all checks are green.

Run:

```bash
bun run check
bun run build
```

Expected result:

- `bun run check` passes with typecheck, lint, format, and tests.
- `bun run build` passes. Existing chunk-size warnings are acceptable unless the implementation makes them materially worse.

## Non-goals

- Do not introduce Yjs/CRDT infrastructure for this hardening pass.
- Do not add auth/permissions in this pass.
- Do not keep legacy compatibility layers unless a current persisted-data need is proven.
- Do not move durable map writes back into individual UI components.

## Final Acceptance Checklist

- Local edits remain instant.
- Pending local edits never flicker backward after server ACKs.
- Multi-tab editing cannot collide on ids or presence.
- Floor navigation cannot silently drop pending operations.
- Transient outbox failures retry automatically.
- Server validation rejects malformed durable state.
- Undo/redo cannot include rejected operations.
- Loading/readiness states are visible and action gates are consistent.
- The branch passes `bun run check` and `bun run build`.
