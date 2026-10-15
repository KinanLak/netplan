# Netplan

A collaborative map of buildings for network teams: floors, walls, racks,
switches, wall sockets and PCs, with the cables between them, and each PC
placed where the network last saw it. Self-hosted. The interface is in French;
everything in the repository (code, comments, docs, ADRs, commits, PRs) is in
English.

Stack: TanStack Start, React 19, TypeScript 7, Vite, Tailwind CSS v4, Convex,
Zustand, `@xyflow/react`, Bun.

- `src/`: the web app. `canvas/` (React Flow map), `panels/`, `map-engine/`
  (pure operation logic), `map-session/` (outbox, history, the document
  provider), `walls/`, `devices/`, `store/` (Zustand).
- `convex/`: schema and functions. Convex owns every durable fact.
- `docs/adr/`: decisions; `docs/architecture/`: current and target shape;
  `docs/history/`: frozen records, including the decision log.

The project is mid-rebuild (ADR 0001): `docs/architecture/target.md` says
where it is heading and in which lot. It is unreleased, so prefer the
canonical change over compatibility shims.

## Commands

- `bun install`; Bun only, never npm, pnpm or yarn.
- `bun run check` after every change. It is read-only: typecheck, lint,
  format check, tests, and Convex codegen freshness when a local self-hosted
  backend answers (CI always checks it). A change is done only when it is
  green.
- `bun run fix` applies lint fixes and formatting; run it, then `check`.
- `bun run verify` is `check` plus the production build and the route tree it
  writes. CI runs it; run it before marking a pull request ready.
- `bun test <path>` for one file.
- `bun run build && bun run test:e2e`: the Playwright smoke test (`e2e/`)
  against the production build. The server reads `CONVEX_URL` at run time,
  locally from the `.env.local` that `dev:agent` writes, so start that first.
- `bun run dev:agent`: this worktree's own local instance (below). `bun run
  dev` is for a checkout already configured against another deployment.
- Never edit `package.json` by hand: `bun add <pkg>@latest`, `bun remove`, or
  `bun pm pkg set` for fields that are not dependencies. Dependencies stay on
  their latest version, majors included. CI fails on a high or critical
  advisory; one that cannot be fixed yet is accepted with an `--ignore` and
  its reason in `.github/workflows/ci.yml`.
- The app ships as a bundle, so a new package is a `bun add -d`.
  `dependencies` holds only what `convex/` imports: the functions image
  installs it, and `scripts/lib/deploy.test.ts` keeps it that way.
- `convex/_generated/` and `src/routeTree.gen.ts` are generated and tracked.
  Never edit them by hand; commit what the tools regenerate.
- Use Context7 (`ctx7`) or web search for library and API documentation
  rather than memory.

## Local instance

`bun run dev:agent` gives each checkout its own self-hosted Convex backend in
Docker (ADR 0018), seeds a demo site, and runs Convex and Vite on ports derived
from the worktree path. It prints a banner with the app URL; `--status`
prints it again, `--reseed` (app stopped) starts from an empty backend,
`--down` removes the
backend and its data. The skill `test-netplan-app` says how to check a change
in a browser with it.

- It writes `.env.local` with a marker line and refuses to touch one it did
  not write. Never point `.env.local` at a shared deployment by hand.
- The seed (`convex/dev.ts`, data in `src/dev-seed/`) runs only where
  `ALLOW_DEV_SEED=true` and goes through `applyMapOperation`, so it obeys the
  same validation as users. It fills only what is missing, so a change to the
  demo data needs `--reseed`. A new seed function must be idempotent and is
  listed in `scripts/dev-agent.ts`.
- `src/` files imported by `convex/` use relative imports: Convex bundles
  them without the `@/` alias.
- The backend keeps running when the command stops, so the next run is fast;
  its container and volume are labelled `netplan.worktree=<path>` and
  `netplan.owner=<uid>`, and removed once that path is gone.

## The three ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | xargs kill`, or kill a
   PID found by matching a name or path: your own agent has this worktree's
   path in its argv, and this host runs other people's stacks. Kill only a PID
   you captured at spawn, or the owner of your port after checking that
   `/proc/<pid>/cwd` is your worktree.
2. **Touching what is not yours.** Docker on this host also runs CI runners
   and other projects. Only touch containers, volumes, networks and images you
   created, label them `netplan.*`, and never `docker system prune`. NetBox
   and LibreNMS are real production tools: read freely, write the minimum,
   never modify or delete a real device, cable or interface. Test objects in
   NetBox are named `netplan-test-<lot>-<n>`, tagged `netplan-test`, and
   deleted when you are done. Trigger at most one LibreNMS discovery cycle per
   five minutes per site.
3. **Leaking secrets.** Never print, log, commit or paste a secret value, not
   even in a PR body or a test fixture. Load them inside the command
   (`set -a; . file; set +a`). gitleaks scans the whole history on every
   pull request; a fake value in a test carries a `gitleaks:allow` comment.

## Map domain

- UI code dispatches durable map changes through `useMapDocumentActions()`
  (`src/map-session/useMapDocument.ts`, provided by `MapDocumentProvider`);
  never call Convex map mutations directly from components.
- Durable changes are `MapOperation`s (`src/map-engine/types.ts`), applied
  locally by `src/map-engine/` and on the server by `api.mapOperations.apply`.
- Server validation is authoritative for floors, object ids, collisions,
  links, wall geometry and device-delete link cleanup. The client's
  validation is a courtesy.
- A new durable mutation ships together: the typed operation, pure engine
  behaviour, its inverse for undo, server application, and tests.
- Convex tables use `objectId`. Convex `_id` stays inside `convex/`; UI and
  domain code use the branded ids from `src/types/map.ts`.
- Convex owns durable state; Zustand holds only ephemeral UI state (selection,
  tool, viewport). Who the user is comes from the session
  (`useCurrentUser()`), never from `localStorage`.
- Edit controls follow `useIsEditMode()`, which is already false for a
  Lecteur; `useCanEdit()` answers whether the role may edit at all.
- Walls are one 20×20 block per grid cell, keyed by `geometryKey`.
- New device type: extend `DeviceType`; the registry and catalog tests point
  at the remaining places.
- Online users: `convex/presences.ts`, `src/hooks/use-presence.ts`, shown in
  the sidebar.

## Hit every surface

The most common defect is a change that works on the path you tried and is
missing everywhere else. Before calling a change done, walk this list and say
in the PR which entries applied:

- **Canvas**: drag, resize, multi-select, group moves, every floor.
- **Panels**: sidebar, toolbar, device drawer, and their empty states.
- **Keybindings and command palette**: an action reachable from a button
  usually has a shortcut (`src/hooks/use-shortcuts.tsx`, listed in the
  shortcuts dialog) and belongs in the command palette when there is one.
- **Undo and redo**: every durable change has an inverse, and undoing it
  leaves no orphan (links of a deleted device, walls of a room).
- **Server validation**: the server rejects what the client prevents, and the
  client shows the rejection.
- **Other users**: a second tab sees the change live; presence follows.
- **Reverse states**: a way in needs a way out and a way to see it.
- **Admin and integrations**: a change to devices or sites may change what an
  integration writes or reads.
- **Docs**: does an ADR, `docs/architecture/` or this file now say something
  false?

## Testing

- Tests ship with logic changes; backend behaviour changes ship with focused
  tests of that behaviour.
- Test observable behaviour and meaningful logic. Do not render components to
  assert props, or write tests that mirror the implementation.
- Never wait on sleeps in a test. A test that needs a timeout to pass is wrong.
- An empty database is a bad test of the UI. Verify a user-visible change in a
  real browser, never against a deployment other people use.

## Code

- `@/` for imports from `src/`.
- React Compiler is on: no `useMemo` or `useCallback` only for memoization.
- Avoid `any`; use `unknown` only at real dynamic boundaries (JSON parsing,
  `catch`).
- Never use Tailwind opacity modifiers on semantic colours
  (`bg-foreground/50`, `text-primary/80`); use the right semantic colour
  (`text-muted-foreground`). Exceptions: overlays, gradients to transparent,
  intentional compositing.
- Comments say why, not what, and move with the code.

## Documentation

Most changes need no documentation change; agents can read the code.

- A lasting choice gets an ADR in `docs/adr/` (frontmatter `status`, `date`,
  `title`, optionally `supersedes`; a body; `## Consequences`), listed in
  `docs/adr/index.md`. An ADR is never rewritten after a change of mind; a new
  one supersedes it. A lot's design is an ADR in its first pull request.
- `docs/architecture/` describes the system's shape. When a lot lands, move
  what it built from `target.md` to `current.md`, rewriting rather than
  appending.
- `docs/history/` is frozen. Each lot appends its question journal to
  `docs/history/decision-log.md` in its last pull request; nothing else there
  changes.
- Do not document every feature, list files, narrate control flow or append
  PR summaries. Ask what a maintainer would get wrong without the paragraph.
- Never commit plans, research notes or scratch files.
- Propose a new rule for this file only when it would prevent a real repeated
  mistake.

## Git and delivery

ADR 0019 is the source; the short version:

- Never commit on `main`. Branch, and after the first commit push and open a
  draft pull request. Conventional commit subjects, no co-author or
  generated-with footer.
- One concern per pull request. Work too large for one ships as stacked pull
  requests, each green on its own.
- Before marking ready: `bun run check` green, the change verified as a user
  would see it, and a review pass of your own with P0 and P1 findings fixed.
  Marking ready starts a zipzoup review; `/zipzoup` reruns it after a later
  logic push, `/zipzoup force` on an already reviewed commit.
- zipzoup posts findings tagged P0 to P2 and titles its check
  `Reviewed <sha>`. Check each finding against the source: fix the real ones,
  answer false positives in their thread with the reason. A green check that
  reads `not since` has not reviewed the head.
- Wait for checks and reviews with T3 Code's `watch_pull_request` and end the
  turn; never poll with loops or sleeps.
- Squash-merge your own pull request when CI is green, no P0 or P1 finding is
  open and the branch is up to date with `main`. Merge stacks bottom-up, then
  rebase the next layer onto `main` and retarget it. Delete the branch after
  merging.

## Writing a pull request

- English. Title: a conventional commit subject stating the effect, not the
  edit: `fix(walls): a room drawn over a socket is now rejected`.
- Body: Problem (what was wrong or missing, for whom), Change (what and why
  this approach), Scope (what was deliberately left out), Verification (what
  was run, and what was checked in which environment with which account).
  Short; a simple change is a few sentences.
- A visible change carries a before/after screenshot; motion needs a short
  video. Upload them to the pull request, never commit them.
- A decision that must outlive the pull request goes in `docs/`; the body
  links to it.
