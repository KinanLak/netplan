---
status: accepted
date: 2026-10-16
title: History is recorded by the collection cycle as events and five daily MAC snapshots, purged after 30 days, and the NetBox push follows each cycle
---

# History is recorded by the collection cycle as events and five daily MAC snapshots, purged after 30 days, and the NetBox push follows each cycle

This records how lot 5 builds ADR 0014 (history) and ADR 0015 (location
push to NetBox) on the collection cycle of ADR 0023.

## What history records

History is what the network observed, written only by the LibreNMS step of a
collection cycle. No person writes it, so it has no map operation and no
inverse: it is not part of undo, and a person undoing a move does not erase
the move from history.

- **Events** (`deviceEvents`), for `pc` and `endpoint` devices only, the
  types the network vouches for (ADR 0025):
  - `located`: the first sighting of a device, and every sighting where none
    of the switch ports its MACs are seen on now is a port its latest
    sighting saw it on. The rule follows ports rather than sockets, so a
    device on an edge port with no socket still has a history. It is the same
    rule the cycle uses to place a device next to a new socket (ADR 0022),
    applied to ports.
  - `online` and `offline`: a change of status the cycle derives, when it
    differs from the device's previous presence event. A status the cycle
    clears because its switch read grew old (ADR 0025) records nothing, so
    online, unknown, online is a single `online`. `offline` carries the time
    the device was last seen, which is two cycles before the cycle that
    concludes it is offline.

  Each event copies the names it shows (device, switch, port, socket, floor
  and building) when it is written. Renaming or deleting a socket later does
  not rewrite where a device was, and a deleted device's history stays
  readable in the site's timeline until it ages out.

- **MAC snapshots** at 08:00, 12:00, 14:00, 16:00 and 19:00 in the site's
  time zone. A slot is taken by the first cycle whose LibreNMS step records
  sightings between five minutes before and ten minutes after its time. No
  discovery is ever asked for a snapshot. The slot row (`historySlots`)
  claims the slot inside the cycle's own mutation. Its entries
  (`historySlotEntries`, one per MAC seen by that cycle, owned or not, with
  the same copied names) are then written by the cycle's action from the
  sightings it read itself, 500 per mutation. A site of several thousand MACs
  therefore stays far below Convex's 16,000 writes per transaction, and the
  recording mutation writes no more than before.

  The entries copy the cycle's own observations, not `macSightings`. A later
  cycle, or the removal of LibreNMS, can then rewrite current state while a
  snapshot is being written without mixing into it. The slot is marked
  complete after its last page. A capture cut short, because the action
  failed, leaves an incomplete slot that is shown as "pas de relevé".

  A slot no cycle took has no row. The interface shows it as "pas de relevé"
  once its window has closed, so an absent snapshot is never filled later
  with older data. At the hourly cadence outside business hours (ADR 0010),
  a cycle rarely lands in a fifteen-minute window, so weekend slots are
  usually missing. That is accepted: business-hours slots are the ones that
  answer "where was this machine at 14:00".

## Retention

A Convex cron runs every day and deletes events, slots and slot entries
older than 30 days. It goes through a time index, 500 rows per mutation, and
schedules itself again while old rows remain. Every page is idempotent, and
current state (devices, `macSightings`) is never touched.

## Who reads it

History reveals when people's machines move and are on, so every history
query is an `editorQuery`: Éditeur and Admin read it, a Lecteur is refused
by the server (ADR 0004). Queries are per device or per site, paginated
or bounded by one slot, and never scan a whole table. The device drawer opens
a device's history; the site's history page lists its events and lets one
open a slot.

## The push to NetBox

When an admin turns it on for a site (off by default), Netplan writes the
observed location of each device NetBox brought to five custom fields of that
NetBox device:

| Field                 | Type          | Value                            |
| --------------------- | ------------- | -------------------------------- |
| `netplan_site`        | text          | the Netplan site                 |
| `netplan_floor`       | text          | building and floor of the socket |
| `netplan_socket`      | text          | the wall socket                  |
| `netplan_switch_port` | text          | switch and port                  |
| `netplan_last_seen`   | date and time | the last sighting                |

- **Fields are created by the operator**, with
  `scripts/netbox-custom-fields.ts` or by hand following
  `docs/operations/integrations.md`, not by the app. The site's NetBox token
  must then be allowed to change devices. Netplan never reads these fields
  back and writes nothing else to NetBox (ADR 0007).
- **One run after each cycle.** A cycle that ends with the push on schedules
  one push run for its site. A lease on the site's cycle row keeps runs from
  overlapping. The run compares what each device should show with what was
  last sent (`netboxPushes`, one row per device) and sends one `PATCH` per
  device that differs, at most 100 per run.
- **What differs.** A different location is pushed at once. The last-seen
  time alone is pushed when the device is offline, which gives the exact time
  it was last seen, or when the value sent is more than six hours old. An
  online device therefore does not add a NetBox changelog entry every five
  minutes.
- **Failures.** Each request uses the NetBox retry policy (5 attempts, 2 s
  to 30 s). A device whose `PATCH` is refused records the message and waits
  before its next attempt: one minute after the first failure, doubling up to
  one hour. A network failure ends the run, since the next device would fail
  the same way. The admin health page shows the last run and every device
  still failing with its message: a missing custom field, a token without
  write permission, a device deleted in NetBox.
- **Off means stop.** Turning the push off, or changing the NetBox address
  (which forgets the site's NetBox settings), stops writes. What was written
  stays in NetBox: the push is one way and never clears a field.

## Consequences

- `recordSightings` writes events and claims slots. Its tests cover the
  move, first-sighting, online and offline rules; slot capture, paging and
  the purge have tests of their own.
- The schema gains `deviceEvents`, `historySlots`, `historySlotEntries` and
  `netboxPushes`. The NetBox settings gain `push`, and the cycle row gains
  the push run's lease and last result.
- `docs/operations/` documents creating the custom fields, the token's
  permission, and reading push failures on the health page.
- During tests the push writes only to NetBox devices named
  `netplan-test-L5-<n>` and tagged `netplan-test` (ADR 0015).
