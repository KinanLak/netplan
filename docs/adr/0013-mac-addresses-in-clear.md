---
status: accepted
date: 2026-10-15
title: MAC addresses are stored and shown in clear
---

# MAC addresses are stored and shown in clear

Netplan is an internal tool used by the team that runs the network. MAC
addresses are stored in clear and shown to every signed-in user. Hashing them
(HMAC) would complicate matching, merging (ADR 0008) and display for little
protection inside that audience.

## Consequences

- Access to MAC addresses is governed by login (ADR 0003), not by a
  per-field protection.
- Exports and backups contain MAC addresses; operators treat them as internal
  data.

## Source

[Decision log](../history/decision-log.md): Q17.
