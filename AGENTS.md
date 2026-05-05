# Netplan

## Tooling rules

- You can use Context7 MCP for library/API docs, code generation, or configuration, without being asked.
- Run `bun run check` (tsgo + oxlint + oxfmt) **after the end of every code change**.
- **Bun only** (not npm/yarn): `bun run dev`, `bun run build`, `bun run preview`.
- Path alias: `@/` → `src/`.
- Don't manually edit package.json. Use `bun add` or `bun remove` to update dependencies.

## Tech stack

React 19, TypeScript, Vite, TailwindCSS V4, Zustand (persisted to `localStorage`), @xyflow/react.

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

- This is an unreleased project, all code must be canonical. Projet shape can be changed at any time, so avoid workarounds for backward compatibility.
- React Compiler is enabled, so useMemo aren't needed since all components are automatically memoized.
- If you encounter an unusual or hard-to-fix pattern, consider proposing an addition to AGENTS.md only when it would genuinely help share knowledge and prevent future issues.
