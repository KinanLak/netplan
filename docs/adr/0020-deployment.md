---
status: accepted
date: 2026-10-15
title: One runtime-configured app image, deployed with Docker Compose behind a host-routing edge
---

# One runtime-configured app image, deployed with Docker Compose behind a host-routing edge

ADR 0002 makes Netplan self-hosted in Docker. This record says how.

**The app image.** One image serves every installation. It holds only the
Nitro server output (`.output/`) and runs it with Bun. Nothing
origin-specific is in the bundle: the server reads `CONVEX_URL` and
`CONVEX_SITE_URL` from its environment at request time, the root route's
loader hands them to the browser, and the browser builds its
`ConvexReactClient` from them. These variables have no `VITE_` prefix, so a
build can never inline them.

**Health.** `GET /health` answers `200` with `{"status":"ok"}` when the
configuration is valid and the Convex backend answers its `/version`
endpoint, and `503` with `{"status":"ko"}` otherwise; each check is listed
with its result. It is not cached and needs no login, so Zabbix or Uptime Kuma
can poll it. Later lots add their checks (integration freshness) to the same
response.

**Functions.** The Convex functions ship in a second image, built from the
pinned `convex-backend` image (it already carries Node and the admin-key
generator) plus the functions and their dependencies. Run once per release,
it derives an admin key from the instance name and secret, runs
`convex deploy`, and sets the Convex environment variables whose names are
listed in `deploy/convex-env.txt`. In Compose it is a one-shot service; in
Kubernetes it would be a Job.

**The stack.** `deploy/compose.yaml` runs Postgres, the Convex backend on
Postgres, the Convex dashboard, the app, the functions one-shot and a Caddy
edge; the `local` profile adds Keycloak (dev mode, realm imported at start)
and Mailpit for evaluation and testing. Only the edge publishes a port. It
routes by host name (`netplan.<domain>`, `convex.<domain>`, …) and carries a
Docker network alias for each public host name, so a public URL resolves to
the edge both from browsers and from containers. One set of URLs is
therefore valid everywhere: the app server checks the backend through its
public URL, and the backend reaches Keycloak and its own HTTP actions through
theirs. Locally the domain is `netplan.localhost`, which browsers resolve to
the loopback address without any DNS change. Bun does the same for every
`*.localhost` name, even inside a container, so the app shares the edge's
network namespace: its loopback port is the edge's.

Postgres is version 17, the version upstream tests the backend with. Every
image is pinned to an exact version.

## Consequences

- An installation is a `.env` file and `docker compose up`; upgrading is
  changing image tags. Procedures live in `docs/operations/`.
- `bun run dev:agent`, the end-to-end test and the image all pass the Convex
  URLs as server environment variables, never at build time.
- Code that needs the Convex URLs on the server reads them through
  `src/lib/runtimeConfig.ts`; code in the browser gets them from the root
  route's loader data.
- A backup is a Postgres dump plus the backend's storage volume (files,
  modules, search indexes), or a `convex export` that holds both.
- Production installations that already run a reverse proxy may put it in
  front of the edge, or replace the edge if their containers can reach the
  public URLs.
- Vercel's configuration and the Electrobun desktop app are deleted.

## Source

[Decision log](../history/decision-log.md): Q7, Q8, Q11, Q21; lot L0 journal.
