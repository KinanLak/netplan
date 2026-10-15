---
status: accepted
date: 2026-10-15
title: Netplan owns its inventory; NetBox and LibreNMS are optional per-site integrations
---

# Netplan owns its inventory; NetBox and LibreNMS are optional per-site integrations

The first version keyed devices on NetBox objects and hard-coded one site and
its switches. Netplan becomes tool-agnostic: it is useful for visual network
planning with no integration at all, and integrations enrich it.

- Netplan owns its inventory and the identity of each device: MAC addresses,
  hostname, serial number. A device can exist without being placed on a map.
- Sites and their integrations are configured in the admin UI; nothing about
  a site or a switch is hard-coded.
- NetBox and LibreNMS are integrations configured per site in the admin UI
  (URL, token, options). A site may use both, one or none.
- Any endpoint with a MAC address can be localized, not only computers known
  to NetBox.
- Device types include a generic endpoint and a patch panel. The mapping from
  a NetBox device role to a Netplan type is set in the admin UI; no name regex
  guesses it.
- Port names are matched without vendor-specific rules.

This is option B of the session; a plugin system (option C) may come later
and would get its own ADR.

## Consequences

- Imports create or update Netplan devices; they never become the identity.
  Merging with devices Netplan already knows follows ADR 0008.
- Fields that come from a source are read-only in Netplan (ADR 0007).
- Credentials stored per site are encrypted (ADR 0006).

## Source

[Decision log](../history/decision-log.md): Q12, Q22, Q22bis, Q28, Q31, Q33.
