---
status: accepted
date: 2026-10-15
title: Rebuild the target architecture now, with data restarting from zero
---

# Rebuild the target architecture now, with data restarting from zero

Netplan is not in production. The app that existed on 2026-10-15 was a map
editor with a NetBox and LibreNMS integration keyed on NetBox objects, hosted
on Convex Cloud and Vercel, with an Electrobun desktop shell and an external
integration agent run by systemd. The target described in ADRs 0002 to 0017
changes most of that: hosting, identity, the domain model and the integration
runtime.

We build that target directly instead of migrating towards it in compatible
steps. No data is migrated: every deployment, table and container may be
deleted and recreated, and the first self-hosted deployment starts empty.
Dependencies stay on their latest release, majors included.

## Consequences

- A change takes the canonical shape of the target, even when that breaks the
  current app's behaviour; no transitional layer, flag or legacy code path is
  kept "just in case".
- Schema changes need no backfill or migration while this ADR stands. The
  first real installation ends it: a later ADR will say how data is migrated
  from then on.
- `bun add <pkg>@latest` is the default for every dependency change.

## Source

[Decision log](../history/decision-log.md): Q22bis, Q35.
