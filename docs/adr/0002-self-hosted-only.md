---
status: accepted
date: 2026-10-15
title: Fully self-hosted in Docker; Vercel and the desktop app are dropped
---

# Fully self-hosted in Docker; Vercel and the desktop app are dropped

Netplan runs entirely on the operator's infrastructure; nothing depends on a
cloud service. The backend is the self-hosted Convex backend in Docker, on an
existing Postgres. The web app is a single Docker image whose configuration
(Convex URL, site URL) is read at runtime, so one image serves every
installation. Docker Compose is the first deployment target; Kubernetes may
follow with the same images.

Vercel hosting and the Electrobun desktop app are removed. The desktop app
served its own copy of the site on a loopback origin, which would have needed
its own SSO redirect URI and cookie rules (ADR 0003) for no user need.

## Consequences

- No Convex URL or other origin is baked into the bundle at build time; the
  client reads it from runtime configuration.
- The app image exposes `/health` for orchestrators.
- Agents and CI run the same convex-backend image as production
  (ADR 0018); `convex dev --local` is not used.
- The connector secret, the systemd units and the Vercel build command go
  away with the external agent (ADR 0012) and the Vercel config.

## Source

[Decision log](../history/decision-log.md): Q7, Q11, Q21, Q41.
