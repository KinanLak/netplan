---
status: accepted
date: 2026-10-15
title: Devices learned later by a source are merged by MAC or serial, otherwise reviewed
---

# Devices learned later by a source are merged by MAC or serial, otherwise reviewed

A device often appears in Netplan before NetBox knows it: it is plugged in, its
MAC is seen on a switch port, and someone creates it from the list of unknown
MAC addresses. When NetBox later learns the same device, the two records must
become one without a conflict.

- A MAC address or serial number match merges automatically: the Netplan
  device keeps its identity, placement and history, and gains the source
  binding and its read-only fields (ADR 0007).
- A hostname-only match is a suggestion that an Éditeur confirms or rejects.
- An ambiguous case (several candidates, contradictory identifiers) becomes a
  conflict for an administrator; nothing is merged until it is resolved.

Unknown MAC addresses seen on the network are listed with a "create device"
action.

## Consequences

- Merges are idempotent and recorded, so a re-sync never duplicates a device.
- The admin UI has a conflicts view.

## Source

[Decision log](../history/decision-log.md): Q30, Q30bis.
