---
name: test-netplan-app
description: >
  Run Netplan locally in this worktree and check a change in a real browser
  against the seeded demo map. Use before marking a pull request ready, when a
  change touches anything a user sees, or when asked to try, test, preview or
  screenshot the app.
---

# Test the Netplan app

Each worktree has its own Convex backend (a Docker container) and its own
ports, so this never touches another worktree or a shared deployment.

## 1. Start or reuse the instance

```sh
bun run dev:agent --status
```

- `running` with an `App` line that answers: reuse it, do not start another.
  `--status` checks that the server at that URL serves this worktree.
- Otherwise start it in the background and wait for the banner:

  ```sh
  bun run dev:agent > /tmp/netplan-dev-agent-<worktree>.log 2>&1
  ```

  Run it as a background task and keep its task or process id: that is the
  only process you may stop. The banner prints the `App` and `Convex` URLs,
  and `Mail`: the Mailpit inbox of every mail the app sends (invitations,
  password resets).
  The first run pulls the image and creates the backend; later runs reuse
  them.
- Every run puts back what is missing from the seed: a cleared map, a deleted
  floor. `--reseed` starts again from an empty backend; it refuses while the
  app runs, so stop your process first. `--down` removes the backend and its
  data.

Expected noise: React Flow's attribution warning, React Scan's update notice
and a software-renderer notice in a headless browser. Anything else in the
console is worth reading.

## 2. Look at it

Open the `App` URL in your own T3 Code preview tab (`preview_open`), with
the host replaced by `<worktree-name>.localhost` (same port): cookies are
shared by host, not port, so on `127.0.0.1` another worktree's login replaces
your session and the app bounces you to the login page. Then
drive it with `preview_click`, `preview_type`, `preview_drag` and check it with
`preview_snapshot`. Save a screenshot (`save: true`) of each state a reviewer
should see, and upload it to the pull request rather than committing it.

The seed is the same in every worktree, so its names are stable selectors:

- Site "Site de démonstration" (disabled: no integration runs).
- "Bâtiment A", floors "Rez-de-chaussée" and "Étage 1".
- Ground floor: a technical room with two racks and the switches
  `sw-demo-coeur` and `sw-demo-acces-rdc`; an open space with sockets
  "Prise B-01" to "Prise B-08" and eight PCs with mixed statuses; a meeting
  room.
- Floor 1: a room with switch `sw-demo-acces-e1`, sockets "Prise C-01" to
  "Prise C-06" and six PCs; a break room with an unused socket.
- Every switch port is cabled to a socket and each socket to a PC, in data:
  the canvas does not draw links yet.

The UI is in French; look for French labels. Test what you changed on both
floors, and in a second tab when the change should reach other users live.

## 3. Leave it clean

- Undo what you broke on purpose, or stop your process and `--reseed`, so the
  next check starts from the seed.
- Stop only the process you started. Never kill by name or pattern; another
  worktree's Vite and Convex look exactly like yours.
- Leave the backend running unless asked: the next run reuses it, and
  `dev:agent` removes the backends of deleted worktrees.
