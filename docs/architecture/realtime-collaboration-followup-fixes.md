# Realtime Collaboration Follow-Up Fixes

Status: implementation follow-up after the first architecture rewrite.

Audience: an implementation agent with no prior conversation context.

Read first:

- `docs/architecture/realtime-collaboration-architecture.md`
- `docs/architecture/realtime-collaboration-agent-plan.md`
- `AGENTS.md`

The current staged implementation already adds stable application ids, a pure map engine, `MapDocumentProvider`, a sequential outbox, operation-based undo/redo, and Convex `mapOperations.apply`. The remaining work below must be done before the architecture can be considered robust.

## Current Verification State

The following was true before this follow-up document was created:

- `bun run tsc` passed.
- `bun test` passed.
- `bun run check` passed after adding temporary dev controls.
- The app now has temporary dev controls for `Create default map` and `Clear map` in the sidebar.

Do not remove the temporary dev controls unless the user explicitly asks. They are a practical development tool while the map bootstrap/onboarding story is still temporary.

## Fix 1: Make `mapOperations.apply` Atomic On Rejection

Severity: blocking.

Problem:

- `convex/mapOperations.ts` currently returns `{ status: "rejected" }` after a helper has already performed some writes.
- Convex commits the mutation because no exception is thrown.
- This can produce partially applied rejected operations.

Known risky paths:

- `applyWallsAdd` inserts walls inside a loop and can return an error on a later wall.
- `batch` applies sub-operations in order and can return an error after earlier sub-operations have already written.

Required behavior:

- A rejected operation must leave durable map state unchanged.
- The operation log may record the rejection.
- No partial device, wall, or link writes are allowed for rejected operations.

Recommended implementation approach:

- Split validation/planning from writing.
- Build a pure server-side plan before writing anything.
- Only execute writes after the entire operation or batch validates.
- For batch, validate all sub-operations against a simulated snapshot or a planned state before writing.
- If this is too large, start by making server helpers collect all validation errors before any insert/delete/patch for each operation kind, then handle batch with a transaction plan.

Acceptable plan shape:

```ts
type WritePlan = Array<
  | { kind: "insertDevice"; value: DeviceInsert }
  | { kind: "patchDevice"; rowId: Id<"devices">; value: DevicePatch }
  | { kind: "deleteDevice"; rowId: Id<"devices"> }
  | { kind: "insertWall"; value: WallInsert }
  | { kind: "deleteWall"; rowId: Id<"walls"> }
  | { kind: "insertLink"; value: LinkInsert }
  | { kind: "deleteLink"; rowId: Id<"links"> }
  | { kind: "patchPresence"; rowId: Id<"presences">; value: PresencePatch }
>;
```

Required tests:

- A `walls.add` containing one valid wall followed by one wall colliding with a device returns `rejected` and inserts zero walls.
- A `batch` containing a valid `device.create` followed by an invalid `link.create` returns `rejected` and inserts zero devices and zero links.
- A `batch` containing multiple valid operations still applies all writes.
- Repeating a rejected `opId` returns the stored rejection and still does not write anything.

Files likely involved:

- `convex/mapOperations.ts`
- `convex/mapOperations.test.ts`

Acceptance criteria:

- No rejected operation can leave partial durable writes behind.
- Existing idempotency tests still pass.
- `bun run check` passes.

## Fix 2: Remove Or Restrict Legacy Map Mutation Backdoors

Severity: high.

Problem:

- `convex/devices.ts`, `convex/walls.ts`, and `convex/links.ts` still expose direct public write mutations.
- These bypass `api.mapOperations.apply`, `clientOperations`, operation idempotency, and the stricter server invariants.
- With no auth, any deploy user can call them from a client or script.

Required behavior:

- Durable map writes must go through `api.mapOperations.apply`.
- Direct legacy map writes must not remain public production write paths.

Recommended implementation options:

- Preferred: delete public legacy write mutations that are no longer used by UI/tests.
- Acceptable temporary option: keep read queries but convert legacy write mutations into internal functions if tests or dev tooling still need them.
- If a compatibility write must remain public temporarily, make it delegate to `mapOperations.apply` with generated operation metadata and document why. This is not preferred.

Likely public legacy write functions to remove or restrict:

- `api.devices.create`
- `api.devices.updatePosition`
- `api.devices.rename`
- `api.devices.updateMetadata`
- `api.devices.remove`
- `api.walls.addStroke`
- `api.walls.eraseStroke`
- `api.walls.removeAll`
- `api.links.create`
- `api.links.remove`
- building/floor dev/bootstrap mutations can remain public for now because they are explicit dev controls, but avoid expanding this exception.

Required tests:

- Update or remove tests that call legacy mutations directly.
- Ensure no `src/` code imports or calls these legacy write mutations.
- Keep read queries if UI/tests still use them, or replace them with `mapDocument.getFloorDocument` where appropriate.

Useful search commands:

```sh
rg "api\.(devices|walls|links)\." src convex test
rg "export const (create|updatePosition|rename|updateMetadata|remove|addStroke|eraseStroke|removeAll)" convex
```

Acceptance criteria:

- There is no public direct map write path outside `api.mapOperations.apply`, except clearly marked temporary dev map controls.
- `AGENTS.md` remains truthful: all durable map writes go through `api.mapOperations.apply`.
- `bun run check` passes.

## Fix 3: Canonicalize Wall Geometry Server-Side

Severity: medium-high.

Problem:

- Server wall deduplication trusts `wall.geometryKey` from the client.
- A scripted client can send the same geometry with a different key and bypass uniqueness.

Required behavior:

- The server must recompute canonical wall geometry keys from `floorId`, `start`, and `end`.
- The server should ignore or overwrite the client-provided `geometryKey`.
- Duplicate geometry on the same floor must remain idempotent/no-op, not create duplicate walls.

Implementation notes:

- Match the client canonical logic from `src/walls/gridGeometry/cells.ts`.
- Convex code cannot import from `src/`, so duplicate a small pure helper in `convex/mapOperations.ts` or a Convex-local helper.
- Normalize start/end order before generating the key.
- Prefer one canonical format everywhere. The current client wall engine uses `getWallBlockKey`, which includes floor id. The server index also includes floor id, so either key format is acceptable as long as it is consistent and recomputed server-side.

Required tests:

- Creating a wall with a bogus `geometryKey` persists the canonical key.
- Creating the same wall again with a different bogus key does not duplicate it.
- Creating a wall with reversed start/end also deduplicates against the original.

Files likely involved:

- `convex/mapOperations.ts`
- `convex/mapOperations.test.ts`
- Possibly `convex/mapValidators.ts` if `geometryKey` becomes optional or removed from operation input.
- Possibly `src/walls/engine/commands.ts` only if you choose to align client operation shape.

Acceptance criteria:

- Wall uniqueness cannot be bypassed by client-provided keys.
- Existing wall UI still renders and erases correctly.
- `bun run check` passes.

## Fix 4: Keep Undo History Consistent When Operations Are Rejected

Severity: high.

Problem:

- `MapDocumentProvider` records undo history before the operation is acknowledged.
- If the server rejects the operation, the pending operation is removed, but the undo entry remains.
- A user can undo something that was never accepted by the server.

Required behavior:

- Rejected operations must not remain as successful undo history entries.
- Rejections should be visible to the user.
- Undo/redo stacks must remain coherent after rejection.

Implementation options:

- Track `historyEntryId` or `opId` on history entries.
- On rejection, remove any undo entry associated with the rejected operation or group.
- For grouped history, remove or update the group if one sub-operation is rejected.
- Consider delaying history finalization until ACK, while still retaining enough local inverse info to support immediate undo if the user triggers undo before ACK. If this is too large, start with rejection cleanup.

Required tests:

- Dispatch a move that is rejected by the outbox; undo stack does not contain that move afterward.
- Dispatch a grouped wall operation that is rejected; undo stack does not contain the group afterward.
- A successful operation still appears in undo history.

Files likely involved:

- `src/map-session/MapDocumentProvider.tsx`
- `src/map-session/history.ts`
- Add a provider/session test if feasible. Existing tests only cover helper modules; consider extracting history/outbox orchestration to a testable module if component testing is too heavy.

Acceptance criteria:

- Rejected operations do not create stale undo actions.
- Undo/redo still works for accepted operations.
- `bun run check` passes.

## Fix 5: Surface Rejected Operations In The UI

Severity: medium.

Problem:

- `MapDocumentProvider` exposes `hasRejectedOperations` and `rejectedMessage`.
- No visible component consumes these fields.
- A rejected operation can visually rollback with no clear explanation.

Required behavior:

- Users must get a small, polished, non-blocking message when an operation is rejected.
- The message should not spam repeatedly for the same operation.
- The message can be temporary and minimal for now.

Implementation suggestions:

- Add a small absolute status/toast near the canvas or sidebar footer.
- Text examples:
  - `Action refusée: collision avec un autre élément.`
  - `Impossible d'annuler: l'élément a été modifié par un autre utilisateur.`
- Add a dismiss or auto-clear after a short delay.
- Avoid introducing a full toast dependency unless the repo already has one.

Files likely involved:

- `src/routes/index.tsx`
- `src/map-session/MapDocumentProvider.tsx`
- Possibly a tiny component under `src/map-session/MapDocumentStatus.tsx` or `src/components/`.

Required tests:

- If component testing is practical, assert the rejection message renders when provider/session exposes one.
- If not, test any extracted message state helper and rely on manual QA for render.

Acceptance criteria:

- Rejected durable operations are visible to users.
- Message is polished enough for development preview.
- `bun run check` passes.

## Optional Fix 6: Make Dev Map Controls Safer And Clearly Temporary

Severity: low.

The current dev controls are intentionally temporary. Improve them only if it is quick and does not distract from blocking correctness work.

Possible improvements:

- Show them only in `import.meta.env.DEV`, except keep `Create default map` visible when DB is empty.
- Add a second confirmation for `Clear map` if the DB contains devices.
- Add a small comment in code explaining they are temporary dev controls.
- Expand `createDefaultMap` later to restore the rich old mock dataset, but do not do this before fixing operation atomicity.

## Final Review Checklist

Before handing work back for review, verify:

- `bun run check` passes.
- `git diff --check` passes.
- No public direct map write path remains outside `api.mapOperations.apply`, except explicitly temporary dev map controls.
- Rejected server operations cannot partially write durable map rows.
- Wall geometry uniqueness is enforced from server-computed canonical keys.
- Rejected operations do not leave stale undo entries.
- Rejected operations are visible in the UI.
- Existing docs in `AGENTS.md` remain accurate.
