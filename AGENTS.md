# Netplan

## Tooling rules

- You can use Context7 MCP for library/API docs, code generation, or configuration, without being asked.
- Run `bun run check` (tsgo + oxlint + oxfmt + test suite) **after the end of every code change**.
- **Bun only** (not npm/yarn): `bun run dev`, `bun run build`, `bun run preview`.
- Path alias: `@/` → `src/`.
- Don't manually edit package.json. Use `bun add` or `bun remove` to update dependencies.

## Tech stack

React 19, TypeScript, Vite, TailwindCSS V4, Zustand (persisted to `localStorage`), @xyflow/react.

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
