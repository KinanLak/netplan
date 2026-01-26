# Copilot instructions (netplan)

## Project snapshot

- Frontend-only network “physical map” editor built with **React 19 + Vite + TypeScript**.
- Interactive canvas uses **@xyflow/react (React Flow)**; UI styling is **TailwindCSS**.
- Global app state is **Zustand** persisted to `localStorage`.

## How the app is wired

- App composition lives in `src/App.tsx`: `Sidebar` (building/floor picker) + `FlowCanvas` (React Flow) + `Toolbar` (add devices) + `DeviceDrawer` (selected device details).
- Source of truth is the Zustand store in `src/store/useMapStore.ts`:
    - Starts from mocks (`src/mock/*`) but persists to `localStorage` key `netplan-storage`.
    - Persisted fields are **only** `devices`, `currentBuildingId`, `currentFloorId` (`partialize`); buildings come from mocks.
    - To “factory reset” during development, clear `localStorage.netplan-storage` in the browser.
- Canvas nodes are derived from `devices` filtered by `currentFloorId` inside `src/canvas/FlowCanvas.tsx`.
    - Edges are intentionally disabled: `edges={[]}` and `deleteKeyCode={null}`.
    - Dragging updates store via `updateDevicePosition(id, position)` on the final `position` change.

## React Flow node conventions (important)

- Device types are modeled in `src/types/map.ts` as `DeviceType = "rack" | "switch" | "pc" | "wall-port"`.
- React Flow `nodeTypes` mapping is in `src/canvas/nodeTypes/index.ts` and must match `DeviceType` strings.
- Node components (`src/canvas/nodeTypes/*.tsx`) currently expect a **nested** payload shape:
    - `FlowCanvas` sets `data: { data: { ...device, selected } }`, so node components read `const device = data.data`.
    - When changing node data, keep this shape consistent (or update all node components + typings together).

## Adding a new device/node type (example-driven checklist)

1. Extend `DeviceType` in `src/types/map.ts`.
2. Add the node component in `src/canvas/nodeTypes/<NewNode>.tsx`.
3. Register it in `src/canvas/nodeTypes/index.ts`.
4. Update creation defaults in `src/panels/Toolbar.tsx`:
    - Add a button entry and a default `size` in `defaultSizes`.
    - If it needs ports/extra metadata, populate `device.metadata` here.
5. Update labels/details in `src/panels/DeviceDrawer.tsx` (e.g., `typeLabels`).

## Dev workflow

- Install deps: repo includes `bun.lock` (Bun is expected), but npm/pnpm should also work.
- Run dev server: `bun run dev` (Vite).
- Production build: `bun run build` (runs `tsc -b` then `vite build`).
- Preview build: `bun run preview`.

## Styling + global CSS

- Tailwind is configured in `tailwind.config.js`; global styles live in `src/index.css`.
- React Flow base CSS is imported via `@import "@xyflow/react/dist/style.css";` in `src/index.css`.

## Path aliases

- TypeScript path alias is configured in `tsconfig.json`: import from `@/…` to reference `src/…`.
