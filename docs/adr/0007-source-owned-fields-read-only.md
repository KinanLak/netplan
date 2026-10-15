---
status: accepted
date: 2026-10-15
title: Fields that come from a source are read-only in Netplan
---

# Fields that come from a source are read-only in Netplan

When an integration (ADR 0005) provides a field of a device (its name in
NetBox, its MAC addresses, its serial number, its role), Netplan shows it but
does not let a user edit it. The value is corrected in the source and comes
back at the next synchronisation. Fields no source provides, and devices with
no source, stay editable by an Éditeur.

Two writers for one field would need a conflict policy for every field and
would let Netplan drift silently from the source of truth. Keeping the source
authoritative also pushes teams to keep NetBox clean.

## Consequences

- Each field knows whether it is source-owned for a given device; the UI and
  the server both enforce it.
- The one write Netplan makes to NetBox is the observed location push of
  ADR 0015, into fields Netplan owns there.

## Source

[Decision log](../history/decision-log.md): Q29.
