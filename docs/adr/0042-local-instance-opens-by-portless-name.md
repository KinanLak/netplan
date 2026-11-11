---
status: accepted
date: 2026-11-11
title: Where Portless is installed, the local instance opens by Portless names only, one label per worktree and service
---

# Where Portless is installed, the local instance opens by Portless names only, one label per worktree and service

ADR 0018 gives each worktree its own backend on loopback ports. On the
agents' host every development app opens as `https://<name>.<domain>`
through Portless, from that machine and from the owner's other devices,
never by a port. Its wildcard certificate covers one label, so Portless's
default worktree name, `<worktree>.netplan`, does not pass. This adds to
0018, whose loopback ports stay underneath.

- `bun run dev:agent` runs the app under `portless run` wherever the
  `portless` command exists and `PORTLESS` is not `0`. Vite dies with the
  command, so Portless owns the app's route and removes it when it stops.
- `portless.json` names the project `netplan` and flattens worktrees
  (`"hostnameTemplate": "{name}-{worktree}"`): `netplan` in the main
  checkout, `netplan-<branch>` in a worktree. A worktree with a detached
  HEAD, as T3 Code creates them, has no branch and would get the main
  checkout's name; it takes its directory's, through `PORTLESS_PREFIX`.
- The browser also opens the Convex API and the Mailpit inbox. Each gets a
  `portless alias` one label beside the app, `<name>-convex` and
  `<name>-mail`. Their containers outlive the command, so the aliases do
  too: they are registered whenever the backend is ensured, and removed with
  it by `--down`, `--reseed` and the collection of a worktree that is gone,
  only while they still lead to that backend's port. A name that already
  leads to another port is never taken over.
- Every port stays on `127.0.0.1`; nothing is published with `tailscale
  serve`, and there is no sharing option, since the Portless names already
  open from the tailnet. The banner and `--status` print only Portless URLs.
- Without Portless, as in CI, or with `PORTLESS=0`, the instance keeps the
  loopback ports and the `.localhost` app name of 0018.

## Consequences

- One stable URL per checkout and service; another device opens the same
  names, and two worktrees never share cookies.
- Two branches whose last segment is the same aim at the same name, and so
  does a branch named `convex` or `mail` with the main checkout's aliases:
  the second stops with a message instead of taking the first one's route.
- Only `bun run dev:agent` names a detached worktree; `portless` run by hand
  there takes the main checkout's name.
- A backend removed outside `dev:agent` leaves its aliases, which answer 502;
  `portless alias --remove <name>` clears them.
- `.env.local` and the Convex CLI keep loopback URLs; only the browser sees
  the Portless names.
