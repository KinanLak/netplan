---
status: accepted
date: 2026-10-15
title: Thirty days of location history, visible to Éditeur and Admin
---

# Thirty days of location history, visible to Éditeur and Admin

Netplan keeps 30 days of device location history: movements, online and
offline periods, and snapshots of the MAC addresses seen at 08:00, 12:00,
14:00, 16:00 and 19:00. Older entries are purged.

History reveals when people's machines move and when they are online, so only
Éditeur and Admin can see it (ADR 0004); a Lecteur sees the current state only.

## Consequences

- History queries check the role on the server.
- The retention purge runs as a Convex cron.

## Source

[Decision log](../history/decision-log.md): Q18.
