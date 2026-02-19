# Netplan

## Tooling rules

- Always use Context7 MCP for library/API docs, code generation, or configuration — without being asked.
- Run `bun run check` (tsc + ESLint + Prettier) **after every code change**.
- **Bun only** (not npm/yarn): `bun run dev`, `bun run build`, `bun run preview`.
- Path alias: `@/` → `src/`.

## Tech stack

React 19, TypeScript, Vite, TailwindCSS V4, Zustand (persisted to `localStorage`), @xyflow/react.

## Key files

| Path                                  | Role                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/routes/index.tsx`                | App composition                                                                                        |
| `src/store/useMapStore.ts`            | Zustand store (source of truth) — persists `devices`, `walls`, floor/building context and UI draw mode |
| `src/types/map.ts`                    | `DeviceType` union                                                                                     |
| `src/canvas/FlowCanvas.tsx`           | React Flow canvas — edges intentionally disabled                                                       |
| `src/canvas/hooks/`                   | Canvas-specific hooks extracted from `FlowCanvas` logic                                                |
| `src/walls/useWallToolsController.ts` | Wall tool orchestration (pointer, preview, commit, erase)                                              |
| `src/walls/engine/`                   | Wall command engine (pure wall add/erase/preview logic)                                                |
| `src/canvas/nodeTypes/`               | Node components; `index.ts` registers them                                                             |
| `src/panels/`                         | `Toolbar.tsx` (add devices), `DeviceDrawer.tsx` (device details)                                       |
| `src/mock/availableDevices.ts`        | Device catalog presets (including default sizes)                                                       |

## React Flow node data shape (critical)

`useCanvasDeviceNodes` builds nodes with `data: { data: device }`. Node components read `const device = data.data`. Keep this nesting consistent or update all node components + typings together.

`selected` is a React Flow node field (not nested inside `data`).

`nodeTypes` keys in `src/canvas/nodeTypes/index.ts` must match `DeviceType` strings exactly.

## Adding a new device type

1. Extend `DeviceType` in `src/types/map.ts`
2. Create component in `src/canvas/nodeTypes/<Name>.tsx`
3. Register in `src/canvas/nodeTypes/index.ts`
4. Add device presets (including default size) in `src/mock/availableDevices.ts`
5. Add toolbar action in `src/panels/Toolbar.tsx`
6. Add label in `src/panels/DeviceDrawer.tsx`

## Boundaries

- **Never** use Tailwind opacity modifiers on semantic colors (`bg-foreground/50`, `text-primary/80`). Use the right semantic color directly (`text-muted-foreground` not `text-foreground/50`). Only exception: overlays, gradients to transparent, intentional compositing.

## General guidelines

- This is an unreleased project, all code must be canonical.
