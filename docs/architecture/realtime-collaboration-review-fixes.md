# Realtime Collaboration Review Fixes

Status: follow-up fixes after review of the hardening worktree.

Audience: an implementation agent with no prior context.

Goal: fix the remaining review findings before this realtime collaboration refactor can be considered robust enough to merge.

Read first:

- `docs/architecture/realtime-collaboration-hardening-plan.md`
- `docs/architecture/realtime-collaboration-architecture.md`

## Decisions

These choices are already decided. Do not re-open them unless the user explicitly asks.

- Canvas coordinates may be negative. Reject non-finite numbers, but allow finite negative `x`/`y` positions.
- Durable device sizes must stay strictly positive and finite.
- A single map operation or batch must affect exactly one floor. Cross-floor operations are not supported in this pass.
- Delete operations targeting missing objects should be rejected clearly, not accepted as fake successful no-ops.
- Pending operations for background floors should be cleaned through an observed operation-log/ACK query, not only when the user navigates back to that floor.

## Priority Order

Fix in this order.

1. Wall `geometryKey` client/server mismatch.
2. Negative coordinate validation regression.
3. Cross-floor operation rejection.
4. Missing delete semantics.
5. Background pending cleanup through op-log observation.
6. Bound `walls.delete` payload size.
7. Add missing tests and run verification.

## Fix 1: Align Wall Geometry Keys

Problem:

- `src/walls/engine/commands.ts` creates walls with `geometryKey: getWallBlockKey(block)`.
- `getWallBlockKey` returns `${floorId}:${center.x}:${center.y}`.
- `convex/mapOperations.ts` now requires `geometryKey` to be `${start.x}:${start.y}:${end.x}:${end.y}`.
- Result: walls drawn by the UI can be optimistically shown, then rejected by the server.

Implementation:

- Make the client wall engine generate the same canonical geometry key the server expects.
- Prefer using `getWallGeometryKey(block)` from `src/walls/gridGeometry/cells.ts` for persisted `WallSegment.geometryKey`.
- Keep `getWallBlockKey` if it is still useful for UI erase/preview deduplication, but do not persist it as `geometryKey`.
- Audit code that compares `geometryKey` directly. It should compare canonical persisted keys, or explicit UI block keys if that is what the interaction needs.
- Server should keep canonicalizing and validating the wall before insert.

Files likely involved:

- `src/walls/engine/commands.ts`
- `src/walls/gridGeometry/cells.ts`
- `src/walls/gridGeometry/*.test.ts`
- `src/map-engine/applyOperation.ts`
- `convex/mapOperations.ts`
- `convex/mapOperations.test.ts`

Tests:

- Wall engine creates `WallSegment.geometryKey` as `start:end`, not `floor:center`.
- A wall produced by `addLine` can be sent to `api.mapOperations.apply` and is accepted.
- Reversed endpoints are persisted canonically by the server.
- Duplicate wall geometry is still deduped.
- Erase preview/erase stroke still work after separating persisted geometry key from UI block key.

Acceptance:

- Drawing a wall from the UI cannot be rejected solely because of client/server geometry-key mismatch.

## Fix 2: Allow Finite Negative Positions

Problem:

- `convex/mapOperations.ts` currently uses `isFiniteNonNegative` for positions.
- A pan/zoom canvas should allow objects and walls at negative coordinates.
- Rejecting negative positions is a UX regression unless the whole UI clamps the canvas, which is not desired.

Implementation:

- Replace position validation with a finite-number check.
- Keep size validation strict: width and height must be finite and greater than zero.
- Wall endpoints may be finite negative coordinates.
- Collision math should continue to work with negative coordinates.
- Client-side validation may mirror this, but server validation is the required boundary.

Files likely involved:

- `convex/mapOperations.ts`
- `src/map-engine/validation.ts`
- `convex/mapOperations.test.ts`
- `src/map-engine/validation.test.ts`

Tests:

- Device create with `position: { x: -100, y: -100 }` is accepted if no collision.
- Device patch to a negative finite position is accepted if no collision.
- Wall add with negative finite endpoints is accepted if canonical geometry matches.
- `NaN`, `Infinity`, and `-Infinity` positions are rejected.
- Negative width, zero width, negative height, zero height, `NaN`, and `Infinity` sizes are rejected.

Acceptance:

- Finite negative coordinates are valid durable map state.
- Non-finite coordinates and invalid sizes cannot enter durable state.

## Fix 3: Reject Cross-Floor Operations

Problem:

- Current operation result carries only one `floorId` and one `appliedRevision`.
- A `walls.add`, `walls.delete`, or `batch` could affect multiple floors.
- Supporting that correctly requires revision maps by floor, which is unnecessary for the current UI.

Implementation:

- Add a server-side planning invariant: each operation must affect exactly one floor.
- Reject batches whose sub-operations resolve to different floors.
- Reject `walls.add` if wall segments contain multiple `floorId`s.
- Reject `walls.delete` if ids resolve to walls across multiple floors.
- For operations whose floor is implicit (`device.patch`, `device.delete`, `link.delete`, `walls.delete`), resolve the existing object and use its floor.
- Ensure `operationFloorId` returns the same floor used for revision bump/logging.
- Keep the protocol simple: one operation result equals one affected floor and one applied revision.

Files likely involved:

- `convex/mapOperations.ts`
- `convex/mapValidators.ts` if validation shape needs helper constraints
- `convex/mapOperations.test.ts`
- `src/map-engine/types.ts` only if client types need clearer floor derivation

Tests:

- Batch with two `device.create` operations on different floors is rejected.
- Batch with device and link operations on the same floor is accepted.
- `walls.add` containing walls from two floors is rejected.
- `walls.delete` targeting walls from two floors is rejected.
- Accepted operations return the affected floor and revision for that same floor.

Acceptance:

- No applied operation can bump multiple floor revisions in this pass.
- The client can safely treat `appliedRevision` as belonging to exactly one floor.

## Fix 4: Reject Deletes For Missing Objects

Problem:

- Current delete planning treats missing devices/links/walls as successful no-ops in some paths.
- That can return `appliedRevision: 0` or no observed revision, which weakens the pending-removal protocol.
- Product decision: a delete targeting a missing object should reject clearly.

Implementation:

- `device.delete` should reject when the device id does not exist.
- `link.delete` should reject when the link id does not exist.
- `walls.delete` should reject when any requested wall id does not exist.
- Make rejection messages user-safe enough for `MapDocumentStatus` to display as “element no longer available”.
- Keep idempotent retry by `opId`: if the exact same delete op already applied, repeat calls with the same `opId` return the stored applied result from `clientOperations`.
- Do not confuse idempotent replay with a new delete operation targeting an already missing object.

Files likely involved:

- `convex/mapOperations.ts`
- `convex/mapOperations.test.ts`
- `src/map-engine/applyOperation.ts`
- `src/map-engine/applyOperation.test.ts`

Tests:

- New `device.delete` for missing id is rejected.
- New `link.delete` for missing id is rejected.
- New `walls.delete` for missing id is rejected.
- Replaying the same already-applied delete `opId` returns the stored applied result.
- Rejected delete removes pending client state and does not create undo/redo corruption.

Acceptance:

- Missing-object deletes cannot produce fake success with no observable revision.

## Fix 5: Clean Background Pending Through Observed Op-Log

Problem:

- `MapDocumentProvider` only observes the active floor document revision.
- ACKed pending entries for background floors remain until that floor is active again.
- This can keep `isSaving` / `hasBackgroundPendingOperations` true after the server has already applied everything.

Implementation:

- Add a Convex query that lets the client observe applied/rejected operation log rows for its pending `opId`s.
- Query by explicit op ids if Convex validator limits allow it, or by `clientId` plus recent/pending seq range.
- The provider should keep pending entries until it observes either:
  - server document revision for the active floor reaches `ackedRevision`, or
  - operation log confirms the op is applied/rejected with enough floor/revision data.
- Applied op-log observation should remove pending entries for background floors without needing to visit those floors.
- Rejected op-log observation should remove pending, clean history for that source op, and surface a rejection if still relevant.
- Avoid unbounded query args. Cap pending op ids or split if necessary.

Files likely involved:

- `convex/mapOperations.ts` or new `convex/clientOperations.ts`
- `convex/mapValidators.ts`
- `convex/schema.ts` if indexes need adjustment
- `src/map-session/MapDocumentProvider.tsx`
- `src/map-session/pendingOperations.ts`
- `src/map-session/pendingOperations.test.ts`

Tests:

- ACKed operation for inactive floor is removed when op-log observation reports applied.
- Background applied operation clears `hasBackgroundPendingOperations` without floor navigation.
- Rejected background operation is removed and associated history entry is removed.
- Active floor still uses observed revision to avoid flicker.
- Query handles multiple pending op ids and does not require an active floor.

Acceptance:

- Background pending operations do not keep the UI in saving state after they are observed applied/rejected.
- The active floor still has no ACK flicker.

## Fix 6: Bound `walls.delete` Payloads

Problem:

- `walls.add` and `batch` have caps, but `walls.delete.wallIds` remains unbounded.

Implementation:

- Add a maximum count for `walls.delete.wallIds`.
- Use a named constant near `MAX_WALLS_PER_OPERATION`.
- Reject payloads above the cap with a clear error.
- Consider whether duplicate ids should count against the cap before or after dedupe. Prefer before dedupe to limit raw payload size.

Files likely involved:

- `convex/mapOperations.ts`
- `convex/mapOperations.test.ts`

Tests:

- `walls.delete` over the cap is rejected.
- `walls.delete` at the cap is accepted when ids exist and share one floor.

Acceptance:

- All wall array operations have bounded server planning work.

## Required Regression Tests

Add tests with the fixes, not after.

Must cover:

- UI-produced wall segments are accepted by server map operations.
- Finite negative coordinates accepted.
- Non-finite coordinates rejected.
- Invalid sizes rejected comprehensively.
- Cross-floor operations rejected.
- Missing deletes rejected.
- Idempotent replay by same `opId` still works.
- Background pending cleanup through op-log observation.
- `walls.delete` cap.

Prefer pure tests where possible:

- Server invariants in `convex/mapOperations.test.ts`.
- Pending cleanup in `src/map-session/pendingOperations.test.ts`.
- Wall geometry key generation in wall/grid tests.
- Provider behavior can be extracted to pure helpers if testing `MapDocumentProvider` directly is too heavy.

## Verification

Run after implementation:

```bash
bun run check
bun run build
```

Expected:

- `bun run check` passes.
- `bun run build` passes.
- Existing chunk-size warning is acceptable unless made materially worse.

## Final Acceptance Checklist

- Drawing walls through the UI path persists successfully.
- Negative canvas coordinates work.
- Cross-floor operations are rejected consistently.
- Missing-object deletes reject clearly.
- Background pending operations clear after observed op-log state.
- No fake `appliedRevision: 0` success path remains for normal operations.
- Server operation payloads are bounded.
- The app remains green on check/build.
