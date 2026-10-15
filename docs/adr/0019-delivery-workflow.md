---
status: accepted
date: 2026-10-15
title: Agents ship through stacked pull requests, a CI gate and zipzoup review, and merge their own work
---

# Agents ship through stacked pull requests, a CI gate and zipzoup review, and merge their own work

The rebuild is done by agents working in parallel under an autonomous
mandate, so the merge decision has to rest on checks rather than on the
owner reading every change.

- **Scripts.** `bun run check` is read-only and fast: lint, format check,
  typecheck, tests and Convex codegen freshness. `bun run fix` applies the
  automatic lint fixes and formatting. `bun run verify` is `check` plus a
  production build. The package manager is pinned in `package.json`.
- **CI** runs on GitHub-hosted `ubuntu-latest` for every pull request and for
  `main`: secret scan of the whole history with gitleaks, `verify`, codegen
  freshness, `bun audit` failing on high severity, and the end-to-end job of
  ADR 0018.
- **Pull requests** are small and stacked within a lot. Each starts as a
  draft, follows the template (Problem, Change, Scope, Verification), and a
  lot's design is an ADR in its first pull request.
- **Review.** The author runs a review pass and fixes P0 and P1 findings, then
  marks the pull request ready, which triggers zipzoup with the rubric in
  `.github/zipzoup/review.md`.
- **Merge.** The author squash-merges when CI is green, no P0 or P1 finding
  is open and the branch is up to date with `main`. Stacks merge bottom-up;
  the next pull request is rebased onto `main` and retargeted.

## Consequences

- The owner is not a gate. ADRs and the decision log keep the reasoning
  readable after the fact.
- A check that is flaky or slow blocks every agent, so `check` stays local and
  deterministic and the slow work lives in `verify` and CI.
- Generated files (`convex/_generated`, `src/routeTree.gen.ts`) are committed
  and CI fails when they are stale.

## Source

[Decision log](../history/decision-log.md): Q37, Q39, Q40, Q41, "After Q41 —
autonomous mandate", orchestrator journal "Who merges PRs?" and "Do design
docs wait for owner validation?".
