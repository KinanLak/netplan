---
name: test-netplan-app
description: >
  Use when checking a Netplan change in a browser or writing a verification
  or UI-review brief: how to run this worktree's instance, its URL, the demo
  accounts and data, and the known pitfalls.
---

# Testing Netplan in a browser

The check itself goes through the global `browser-verify` skill: a GPT-6.1
Terra subagent at high effort, briefed in full, on this worktree's instance.
Never drive the browser yourself to verify your own change. This is the data
its brief needs.

## Instance

Each worktree has its own Convex backend in Docker and its own ports
(AGENTS.md, "Local instance"; ADR 0018).

- `bun run dev:agent --status`: if it reports `running` with an `App` line
  that answers, reuse it. Otherwise run `bun run dev:agent` as a background
  task, keep that task's id (the only process you may stop), and wait for the
  banner.
- The banner prints `App` (a `<worktree>-<hash>.localhost` URL: give the
  verifier that one), `Convex`, and `Mail`, the Mailpit inbox of every mail the
  app sends (invitations, password resets).
- Every run puts back what is missing from the seed. `--reseed` starts from an
  empty backend and refuses while the app runs: stop your process first.
- Before delegating, check that the worktree is at the commit to verify and
  that the app was started from it.

## Accounts

The password of every account is `DEV_PASSWORD` in `src/dev-seed/accounts.ts`
(public on purpose: these accounts exist only on throwaway backends).
Sign in with the username or the email:

- `lecteur` (lecteur@netplan.test): Lecteur, never sees an edit action.
- `editeur` (editeur@netplan.test): Éditeur.
- `admin` (admin@netplan.test): Admin, with the admin pages and Santé.

## Data

The seed is the same in every worktree, so its names are stable targets:

- Site « Site de démonstration » (disabled: no integration runs unless
  `--integrations`).
- « Bâtiment A », floors « Rez-de-chaussée » and « Étage 1 ».
- Ground floor: a technical room with two racks and the switches
  `sw-demo-coeur` and `sw-demo-acces-rdc`; an open space with sockets
  « Prise B-01 » to « Prise B-08 » and eight PCs with mixed statuses; a
  meeting room.
- Étage 1: a room with switch `sw-demo-acces-e1`, sockets « Prise C-01 » to
  « Prise C-06 » and six PCs; a break room with an unused socket.
- Every switch port is cabled to a socket and each socket to a PC.

The UI is in French. A change that other users should see live needs a
second tab, signed in as another account.

## Known noise

Not to report: React Flow's attribution warning, React Scan's notice, the
software-renderer notice in a headless browser, and better-auth's IP warning.

## Pitfalls

- **Signed out at random.** Cookies are scoped by host, not port: on
  `127.0.0.1`, another worktree's sign-in replaces yours. Always use the
  banner's `.localhost` URL. Right after `--reseed`, that host can get a 403
  on sign-in until `dev:agent` is restarted normally.
- **Clicks land on nothing.** The React Scan toolbar (`#react-scan-root`)
  sits over the page in development. Have the verifier remove it first with
  `preview_evaluate`: `document.getElementById('react-scan-root')?.remove()`.
- **Every request to `/api/auth/convex/token` returns 500 « Failed to decrypt
  private key ».** The backend's JWKS row was encrypted with another secret.
  Delete only the rows of the `jwks` model in the `betterAuth` component
  (`adapter:deleteMany`); better-auth makes a fresh key on the next request,
  and sessions and data stay.
- **The page reloads mid-check.** Vite hot-reloads on any edit: do not touch
  the worktree while a verifier runs.
- **`ERR_NETWORK_CHANGED` or a failed dynamic import on the first load.**
  The backend was still starting: wait for the banner, reload once.
- **Old UI.** A delegate started with `isolation: "worktree"` checks out the
  parent's commit, not `origin/main`. Verify in this worktree
  (`isolation: "shared"`), at the commit you mean.
- **What the T3 preview has failed at**: Shift+click (try `preview_act`
  with `modifiers` first), Ctrl+wheel and drag-to-select. For those, and for locales, offline states or precise
  timings, the verifier writes a Playwright script under `/tmp/<task>/`
  against the same URL, with exact role-based locators (« Étage 1 » matches
  more than one element otherwise).
- **Integrations** (`--integrations`): LibreNMS's certificate names another
  host, so the site needs its per-integration certificate option; never
  write to a real NetBox or LibreNMS object (AGENTS.md).

## Screenshots

`preview_snapshot` with `save: true` returns the file's path. Upload the ones
a reviewer should see to the pull request (`gh pr edit <n> --body-file
<body> --attach <file>`), never commit them.
