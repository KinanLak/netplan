# Netplan

## Tooling rules

- You can use Context7 MCP for library/API docs, code generation, or configuration, without being asked.
- Run `bun run check` (tsgo + oxlint + oxfmt + test suite) **after the end of every code change**.
- **Bun only** (not npm/yarn): `bun run dev`, `bun run build`, `bun run preview`.
- Path alias: `@/` → `src/`.
- Don't manually edit package.json. Use `bun add` or `bun remove` to update dependencies.

## Tech stack

React 19, TypeScript, Vite, TailwindCSS V4, @xyflow/react. Durable domain state lives in **Convex cloud** (`convex/`); Zustand only holds ephemeral UI slices (current building/floor, selection, hover, draw tool, edit mode, highlights). The document session owns pending operations, outbox, and undo/redo. The only map identity `localStorage` key is `netplan-identity` (client id, session id, counters, display name, colour hue).

## Convex layer

- `convex/schema.ts` defines durable rows with `objectId` string fields. Convex `_id` stays inside Convex functions and repository/query boundaries only; UI/domain code uses the canonical branded aliases (`DeviceId`, `FloorId`, …) in `src/types/map.ts`.
- `src/map-session/MapDocumentProvider.tsx` is the single active owner for map command dispatch, pending operations, sequential outbox, and undo/redo. UI components consume `useMapDocument()` and must not call Convex map mutations directly.
- Local optimistic state is the materialized projection `applyOperations(serverDocument, pendingOperations)` from `src/map-engine/`. Do not generate durable ids in Convex optimistic callbacks; the session generates object ids and op ids before dispatch.
- All durable map writes go through `api.mapOperations.apply`, which is idempotent by `opId` and validates server invariants. New domain mutation? Add a typed operation, pure engine behavior, inverse generation, server application, and tests together.
- Live cursors and edit leases run through the custom `presences` table at 30 Hz with a 30 s TTL — see `convex/presences.ts` and `src/canvas/PresenceCursors.tsx`. Presence references application object ids, never Convex `_id`.

## Tradeoffs (MVP, no auth)

- **Property-level last-write-wins.** Concurrent patches converge through the server-authoritative operation order; local pending operations remain overlaid until ACK to avoid flicker.
- **Undo/redo is per-session and operation-based.** Undo and redo dispatch fresh normal operations. If a target disappeared because of a remote edit, the session reports a safe rejection instead of throwing.
- **Server-side validation is required.** Device/wall collisions, link endpoints, floor existence, object id uniqueness, and device-delete link cleanup are enforced in Convex mutations, not only in the UI.
- **No auth.** Anyone with the deploy URL can write. Identity is a `localStorage` UUID + a random "Adjectif Animal" pair purely for display.

## Adding a new device type

Extend the `DeviceType` union in `src/types/map.ts` — TypeScript + `deviceKindRegistry.test.ts` will then guide you through registry, adapter, and catalog updates.

## Testing

Tests ship with the code, not after. Every change touching logic adds or updates a `*.test.ts(x)` colocated with the source. A change is not done until it's green.

## Boundaries

- **Never** use Tailwind opacity modifiers on semantic colors (`bg-foreground/50`, `text-primary/80`). Use the right semantic color directly (`text-muted-foreground` not `text-foreground/50`). Only exception: overlays, gradients to transparent, intentional compositing.

## General guidelines

- This is an unreleased project, all code must be canonical. Projet shape can be changed at any time, so avoid workarounds for backward compatibility.
- React Compiler is enabled, so useMemo aren't needed since all components are automatically memoized.
- If you encounter an unusual or hard-to-fix pattern, consider proposing an addition to AGENTS.md only when it would genuinely help share knowledge and prevent future issues.
- Avoid using `any` or `unknown` in TypeScript. If you find a case where it's necessary, consider if it indicates a missing type definition or if the code can be refactored for better type safety. `unknown` is allowed in catch blocks.
- Always use Context7 or web search when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.
