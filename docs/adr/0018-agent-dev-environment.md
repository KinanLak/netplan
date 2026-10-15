---
status: accepted
date: 2026-10-15
title: Each worktree runs its own local Convex backend with seeded data, and CI runs the same backend
---

# Each worktree runs its own local Convex backend with seeded data, and CI runs the same backend

Agents work in parallel, each in its own git worktree, and must see the app
they change in a real browser. A shared deployment would let one agent's
schema push or test data break another's, and Convex Cloud is excluded by
ADR 0002. So every worktree gets a private backend:

- `bun run dev:agent` starts one `ghcr.io/get-convex/convex-backend`
  container per worktree path, with SQLite in a Docker volume of the same
  name. The image is pinned to the commit tag of the newest precompiled
  release, one constant shared with CI.
- Its ports, and the web app's, are derived from a hash of the worktree path
  and bound to `127.0.0.1`, so worktrees never collide and nothing is exposed
  on the network.
- It writes a `.env.local` marked as generated, holding the self-hosted URL
  and admin key. It refuses to overwrite an unmarked one, so a checkout that
  points somewhere real is never clobbered, and it refuses any non-loopback
  Convex URL.
- It sets `ALLOW_DEV_SEED=true` on that backend only, pushes the functions,
  seeds a fictional site when the backend is empty, then runs `convex dev`
  and Vite and prints a banner with the URLs.
- The container is labelled `netplan.worktree=<path>` and survives the
  command; `--down` removes it with its volume, and each run removes labelled
  containers and volumes whose worktree no longer exists.

The seed goes through the same server validation as user edits, so it can
never hold a map the app would reject. It invents everything: no real
hostname, MAC or NetBox id, and integration schedulers stay disabled. Every
seeding function refuses to run unless `ALLOW_DEV_SEED` is `true`, which no
real installation sets; the seeded test accounts of ADR 0003 join it in the
auth lot.

CI's end-to-end job starts the same image as a service container with a
throwaway secret, deploys, seeds, builds the app and drives it with
Playwright.

Per-pull-request preview deployments were considered and left out: a
self-hosted backend per pull request needs a host to run on, and the
per-worktree backend already gives each agent an isolated live app.

## Consequences

- An agent verifies UI changes against its own backend, never against a
  shared or real one. The `test-netplan-app` skill describes how.
- Seed data must stay valid under the server rules; a validation change that
  breaks it fails `dev:agent` and the end-to-end job, not a user.
- Docker is a development requirement.
- Codegen freshness is checked in CI against the service container; locally
  `bun run check` checks it only when the worktree's backend answers.

## Source

[Decision log](../history/decision-log.md): Q40, orchestrator journal
"Per-worktree dev backend storage?", and the F — Foundations journal.
