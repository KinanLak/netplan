# Netplan

## Tooling

- Use Context7 or web search for library/API docs, generation, setup, or config.
- Use Bun only.
- Run `bun run check` after every code change.
- Use `@/` for `src/` imports.
- Do not manually edit `package.json`; use `bun add` or `bun remove`.

## Stack

TanStack Start, React 19, TypeScript, Vite, TailwindCSS V4, Convex, Zustand, @xyflow/react.

Convex owns durable map state. Zustand only owns ephemeral UI state. The only map identity `localStorage` key is `netplan-identity`.

## Map Domain

- UI code dispatches durable map changes through `useMapDocument()` from `src/map-session/MapDocumentProvider.tsx`; do not call Convex map mutations directly from components.
- Durable changes are `MapOperation`s from `src/map-engine/types.ts`, applied locally by `src/map-engine/` and on the server by `api.mapOperations.apply`.
- Convex tables use `objectId`; keep Convex `_id` inside `convex/` and use branded ids from `src/types/map.ts` in UI/domain code.
- Server validation is authoritative for floors, object ids, collisions, links, wall geometry, and device-delete link cleanup.
- New durable mutation: add the typed operation, pure engine behavior, inverse/history handling, server application, and tests together.
- Online users use `convex/presences.ts` and `src/panels/ConnectedUsers.tsx`.

## Patterns

- Tests ship with logic changes; a change is done only after `bun run check` is green.
- New device type: extend `DeviceType`; registry/catalog tests guide the remaining updates.
- React Compiler is enabled; do not add `useMemo`/`useCallback` only for memoization.
- Avoid `any`; use `unknown` only at real dynamic boundaries such as JSON parsing or catch blocks.
- This project is unreleased, so prefer canonical changes over backward-compatibility workarounds unless explicitly needed.
- If you encounter an unusual or hard-to-fix pattern, consider proposing an addition to AGENTS.md only when it would genuinely help share knowledge and prevent future issues. Ask the user first before doing it.

## Styling

- Never use Tailwind opacity modifiers on semantic colors (`bg-foreground/50`, `text-primary/80`). Use the right semantic color directly (`text-muted-foreground`). Exceptions: overlays, gradients to transparent, intentional compositing.
