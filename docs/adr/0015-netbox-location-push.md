---
status: accepted
date: 2026-10-15
title: The observed location is pushed one way to NetBox custom fields
---

# The observed location is pushed one way to NetBox custom fields

When Netplan has located a device known to NetBox, it can write the observed
location (socket, room, floor, date) to custom fields of that NetBox device. The
push is one way: Netplan never reads these fields back as a source, and it is
the only write Netplan makes to NetBox (ADR 0007).

The feature is off by default and enabled per site. It is built late, once
localization is validated.

## Consequences

- The custom fields are created on the NetBox instance; Netplan writes nothing
  else.
- Tests write only to devices named `netplan-test-*`.

## Source

[Decision log](../history/decision-log.md): Q26, orchestrator journal "Where
does the NetBox location push write during tests?".
