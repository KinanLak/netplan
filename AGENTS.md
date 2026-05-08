# Netplan

## Tooling rules

- You can use Context7 MCP for library/API docs, code generation, or configuration, without being asked.
- Run `bun run check` (tsgo + oxlint + oxfmt + test suite) **after the end of every code change**.
- **Bun only** (not npm/yarn): `bun run dev`, `bun run build`, `bun run preview`.
- Path alias: `@/` → `src/`.
- Don't manually edit package.json. Use `bun add` or `bun remove` to update dependencies.

## Tech stack

React 19, TypeScript, Vite, TailwindCSS V4, @xyflow/react. Domain state lives in **Convex cloud** (`convex/`); Zustand only holds ephemeral UI slices (selection, hover, draw tool, edit mode, undo/redo stacks). The only `localStorage` key the app writes is `netplan-identity` (random session id + display name + colour hue).

## Convex layer

- `convex/schema.ts` defines `buildings`, `floors`, `devices`, `walls`, `links`, `presences`. All ids are branded `Id<"...">` from `convex/_generated/dataModel`; the canonical aliases (`DeviceId`, `FloorId`, …) live in `src/types/map.ts`.
- `src/store/useMapCommands.ts` is the only place that calls Convex mutations for the map domain. Latency-sensitive mutations (`devices.create`, `devices.updatePosition`, `devices.remove`, `walls.addStroke`, `walls.eraseStroke`) ship with `withOptimisticUpdate` callbacks — keep new write paths consistent.
- After every successful mutation, `useMapCommands` pushes an `InverseCommand` onto `useMapStore.undoStack`. `useUndoRedo` (`src/hooks/use-undo-redo.ts`) pops and runs the inverse via `executeInverseCommand` (`src/store/mapHistory.ts`); the result lands on `redoStack`. New domain mutation? Extend `InverseCommand` and the runner map together.
- Live cursors run through the custom `presences` table at 30 Hz with a 30 s TTL — see `convex/presences.ts` and `src/canvas/PresenceCursors.tsx`.

## Tradeoffs (MVP, no auth)

- **Last-write-wins on concurrent device drag.** Two clients dragging the same device race on `updatePosition`; accepted for the MVP.
- **Undo is per-session and not CRDT-safe.** If peer B deletes a device that peer A's undo stack references, A's undo will throw — fire-and-forget, the UI keeps going.
- **No server-side collision validation.** A scripted client can persist overlapping walls/devices. The UI enforces it; the server trusts the client.
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
