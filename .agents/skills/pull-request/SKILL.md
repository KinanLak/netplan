---
name: pull-request
description: >
  Use when opening, writing or updating a Netplan pull request, adding
  screenshots or a video to it, handling its zipzoup review and checks, or
  merging it or a stack.
---

# Pull requests in Netplan

The delivery rules (branch, draft, what must be green, who merges) are in
AGENTS.md, "Git and delivery"; ADR 0019 is the source.

## Writing it

- English. Title: a conventional commit subject stating the effect, not the
  edit: `fix(walls): a room drawn over a socket is now rejected`.
- Body: Problem (what was wrong or missing, for whom), Change (what and why
  this approach), Scope (what was deliberately left out), Verification (what
  was run, and what was checked in which environment with which account).
  Short; a simple change is a few sentences. Say which entries of "Hit every
  surface" applied.
- A decision that must outlive the pull request goes in `docs/`; the body
  links to it.

## Screenshots and video

A visible change carries a before/after screenshot; motion needs a short
video. Upload them, never commit them: `preview_snapshot` with `save: true`
gives the file, then `gh pr edit <n> --body-file <body> --attach <file>`
with `![alt](./file.png)` alone in its paragraph in the body.

## Review and checks

- Marking ready starts a zipzoup review; `/zipzoup` reruns it after a later
  logic push, `/zipzoup force` on an already reviewed commit.
- zipzoup posts findings tagged P0 to P2 and titles its check
  `Reviewed <sha>`. Check each finding against the source: fix the real ones,
  answer false positives in their thread with the reason. A green check that
  reads `not since` has not reviewed the head.
- Wait for checks and reviews with T3 Code's `watch_pull_request` and end the
  turn; never poll with loops or sleeps.

## Merging a stack

Bottom-up, one layer at a time:

1. Note the layer's tip SHA. Run from a worktree, `gh pr merge
   --delete-branch` also deletes the local branch, so its name is gone
   afterwards.
2. `gh pr edit <next> --base main` **before** merging: deleting the merged
   branch first makes GitHub close the next pull request instead of
   retargeting it.
3. `gh pr merge <this> --squash --delete-branch`.
4. Rebase the next layer: `git rebase --onto origin/main <noted SHA>`, push,
   and let its checks run again.

A pull request closed this way comes back by pushing the old branch tip,
`gh pr reopen`, then `gh pr edit --base main`.
