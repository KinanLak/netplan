---
status: accepted
date: 2026-10-15
title: Refresh cadence is set per site, by default 5 minutes in business hours and hourly otherwise
---

# Refresh cadence is set per site, by default 5 minutes in business hours and hourly otherwise

Locating devices triggers SNMP discoveries through LibreNMS, which loads the
switches and LibreNMS itself. The cadence exists to bound that load, not to
save Convex quotas (the backend is self-hosted, ADR 0002).

Each site has its own cadence. The defaults are a cycle every 5 minutes during
business hours, 07:00–20:00 Monday to Friday in the site's time zone, and
every hour otherwise. There is no holiday calendar.

## Consequences

- The scheduler runs inside Convex (ADR 0012) and reads the cadence from the
  site.
- An Admin can turn automatic cycles and manual refresh off per site; the
  environment kill switches stay as a fallback.
- Agents and tests trigger at most one cycle per 5 minutes per site against
  the real LibreNMS.

## Source

[Decision log](../history/decision-log.md): Q19, Q34, Q34bis, orchestrator journal
"Can agents trigger LibreNMS discoveries?".
