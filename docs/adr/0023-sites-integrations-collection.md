---
status: accepted
date: 2026-10-15
title: Sites and their integrations are configured in the admin, and one Convex cycle per site collects from them
---

# Sites and their integrations are configured in the admin, and one Convex cycle per site collects from them

This records how lot 2 builds ADR 0005, ADR 0006, ADR 0010 and ADR 0012.

## Sites

A site has a name, an IANA time zone and its cadence: an interval in business
hours (5 minutes), an interval otherwise (60 minutes), business hours (07:00
to 20:00) and days (Monday to Friday). Automatic cycles and manual refresh can
each be turned off. Buildings belong to a site; the app shows one site at a
time, chosen in the URL, and nothing names a site in code.

## Integrations

A site has at most one NetBox and one LibreNMS integration, each with a base
URL, a token and an enabled flag.

- **Tokens** are encrypted with AES-256-GCM in Convex actions, with the
  `NETPLAN_SECRET_KEY` environment variable (32 random bytes, base64). The
  additional data binds a ciphertext to its integration. During a rotation
  `NETPLAN_SECRET_KEY_PREVIOUS` still decrypts, and an admin action
  re-encrypts every token with the new key. No query returns a token or its
  ciphertext.
- **NetBox** settings are the NetBox site, picked from the list NetBox
  returns, and the mapping from each NetBox device role to a Netplan type or
  "ignorer" (the default).
- **LibreNMS** settings are the switches to poll: each LibreNMS device is
  mapped to the Netplan switches it stands for (several for a stack), with
  suggestions by name.

## The cycle

A cron runs every minute and starts a cycle for each site whose next run is
due, under a per-site lease so cycles never overlap. A manual refresh starts
one at once unless a cycle is running.

1. NetBox, when its last import is 15 minutes old or the refresh is manual:
   devices of mapped roles with their interfaces, front and rear ports, MAC
   addresses and cables, merged into the inventory (ADR 0022).
2. LibreNMS: ask each mapped switch for a discovery unless one was asked in
   the last five minutes, wait up to two minutes for it to finish, read ports
   and forwarding tables, and record sightings and locations.

LibreNMS port names are matched to inventory ports first exactly, ignoring
case, on the interface name or description; otherwise when the parts after the
leading letters are identical and one leading part abbreviates the other
(`Gi1/0/18`, `GigabitEthernet1/0/18`). A match must be unique among the ports
of the switches mapped to that LibreNMS device.

The next run is one interval after the start in the site's time zone; after a
failure it backs off. Requests to a source retry timeouts and 5xx answers with
backoff. Each cycle records its outcome per source and per switch for the
admin.

## Consequences

- The external agent, its connector actions and shared secret, the
  integration scheduler with its holiday calendar, and `ops/systemd` are
  deleted. The integration environment variables are replaced by the site
  configuration; `NETPLAN_SECRET_KEY` is required wherever integrations are
  used.
- The owner's Q13 order was changed by the agent: the old pipeline is
  deleted at the start of the lot rather than after the new cycle passes the
  real test (ADR 0012). The reason: it is keyed on NetBox objects and cannot
  run on the new inventory, nothing was deployed, and the agent's timer was
  inactive. The lot is not finished until the cycle has passed that test
  against the real NetBox and LibreNMS.
- Losing the key means re-entering every token; the procedure is in
  `docs/operations/`.
- A site with no integration still works as a hand-drawn plan.

## Source

[Decision log](../history/decision-log.md): L2 journal; Q13, Q19, Q22, Q23,
Q34.
