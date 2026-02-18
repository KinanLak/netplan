# Netplan

## Tooling rules

- Always use Context7 MCP for library/API docs, code generation, or configuration — without being asked.
- Run `bun run check` (tsc + ESLint + Prettier) **after every code change**.
- **Bun only** (not npm/yarn): `bun run dev`, `bun run build`, `bun run preview`.
- Path alias: `@/` → `src/`.

## Tech stack

React 19, TypeScript, Vite, TailwindCSS V4, Zustand (persisted to `localStorage`), @xyflow/react.

## Key files

| Path                        | Role                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `src/routes/index.tsx`      | App composition                                                                             |
| `src/store/useMapStore.ts`  | Zustand store (source of truth) — persists `devices`, `currentBuildingId`, `currentFloorId` |
| `src/types/map.ts`          | `DeviceType` union                                                                          |
| `src/canvas/FlowCanvas.tsx` | React Flow canvas — edges intentionally disabled                                            |
| `src/canvas/nodeTypes/`     | Node components; `index.ts` registers them                                                  |
| `src/panels/`               | `Toolbar.tsx` (add devices), `DeviceDrawer.tsx` (device details)                            |

## React Flow node data shape (critical)

FlowCanvas passes `data: { data: { ...device, selected } }`. Node components read `const device = data.data`. Keep this nesting consistent or update all node components + typings together.

`nodeTypes` keys in `src/canvas/nodeTypes/index.ts` must match `DeviceType` strings exactly.

## Adding a new device type

1. Extend `DeviceType` in `src/types/map.ts`
2. Create component in `src/canvas/nodeTypes/<Name>.tsx`
3. Register in `src/canvas/nodeTypes/index.ts`
4. Add button + default size in `src/panels/Toolbar.tsx`
5. Add label in `src/panels/DeviceDrawer.tsx`

## Boundaries

- **Never** use Tailwind opacity modifiers on semantic colors (`bg-foreground/50`, `text-primary/80`). Use the right semantic color directly (`text-muted-foreground` not `text-foreground/50`). Only exception: overlays, gradients to transparent, intentional compositing.

## General guidelines

- This is an unreleased project, all the code need to be cannonical.
