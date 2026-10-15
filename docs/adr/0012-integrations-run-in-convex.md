---
status: accepted
date: 2026-10-15
title: Integration workers run inside Convex; the external agent is removed
---

# Integration workers run inside Convex; the external agent is removed

The first version ran NetBox and LibreNMS synchronisation in an external agent
(`scripts/sync-integrations.ts`, started by systemd timers) because Convex
Cloud could not reach LibreNMS. With a self-hosted backend on the same network
(ADR 0002), Convex actions reach both sources directly.

The in-Convex workers, scheduled by Convex crons with the per-site cadence
(ADR 0010), become the only integration runtime. They are validated against
the real NetBox and LibreNMS before the external agent, its connector actions,
its shared secret and its systemd units are deleted.

## Consequences

- An installation runs no process besides the Docker images.
- Source credentials come from the per-site configuration (ADR 0006), not
  from environment variables.

## Source

[Decision log](../history/decision-log.md): Q7, Q13, Q13 (corrected).
