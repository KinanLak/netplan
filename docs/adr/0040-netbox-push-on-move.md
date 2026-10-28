---
status: accepted
date: 2026-10-28
title: The push to NetBox writes only when a device's location changes, stamped with « Modifié par NetPlan le », and no longer writes when it was last seen
supersedes: 0027
---

# The push to NetBox writes only when a device's location changes, stamped with « Modifié par NetPlan le », and no longer writes when it was last seen

This replaces the last-seen part of ADR 0027's "The push to NetBox": the
`netplan_last_seen` field and the rule "The last-seen time alone is pushed
when the device is offline, … or when the value sent is more than six hours
old". The rest of ADR 0027 stands: the operator creates the fields, one run
follows each cycle, at most 100 `PATCH`es per run, failures back off, and off
means stop.

The owner does not need NetBox to know when the network last saw a machine,
and every such write added an entry to NetBox's changelog: one per online
device every six hours, one per device going offline (decision log, second
round of 2026-10-28, 5.2).

## Decision

- **A write is a change of place.** A run sends a device's `PATCH` only when
  the site, floor, socket or switch port it would show differs from what was
  last sent to that NetBox device, or nothing was: a move, or a place renamed
  in NetPlan, whose old name NetBox would otherwise keep. A newer sighting at
  the same place, or a device going offline, sends nothing. A field edited on
  NetBox's side is no longer put back by a periodic rewrite.
- **`netplan_updated`**, a date and time field labelled « Modifié par NetPlan
  le », takes the place of `netplan_last_seen` among the five fields. It holds
  when the `PATCH` was sent, and travels only inside a `PATCH` a move already
  sends: never on its own, never to refresh it.
- **`netplan_last_seen` is left in NetBox.** NetPlan stops writing it.
  Neither the app nor `scripts/netbox-custom-fields.ts` changes or deletes a
  custom field; the operator removes the old one if they want, and runs the
  script to create the new one.

## Consequences

- `netboxPushes.sent` no longer holds a sighting time and is compared on the
  place alone; the `lastSeen` of rows sent before stays optional in the schema
  so they deploy as they are, and is never read.
- A NetBox without `netplan_updated` refuses the `PATCH` (400), which Santé
  shows with NetBox's detail until the field exists, as for any missing field.

## Source

[Decision log](../history/decision-log.md): lot U11 journal; owner decisions
of 2026-10-28, second round, 5.2.
