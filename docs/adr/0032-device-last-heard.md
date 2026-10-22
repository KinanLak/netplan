---
status: accepted
date: 2026-10-21
title: A device the network once saw keeps a "stale" status that says when it was last heard from, and everyone sees where it was last seen
---

# A device the network once saw keeps a "stale" status that says when it was last heard from, and everyone sees where it was last seen

ADR 0025 removed a status once no recent switch read vouched for it, so the
device read « Inconnu ». On the real site, 339 of 447 devices were
« Inconnu », mixing devices never seen with devices seen until LibreNMS
stopped answering. The technician's question on a Monday morning, « where was
this PC last seen? », had an answer only in the history, which Lecteurs do not
see. The owner chose a distinct status and a « Vu sur le réseau » section
(UX audit, item C7).

## The status

`metadata.status` gains a fourth value, `stale`, shown « Plus de nouvelles
depuis HH:MM », with `metadata.lastSeenAt`, the time the network last saw the
device. It replaces ADR 0025's removal in every case where the network did see
the device:

- A `pc` or an `endpoint` whose MACs were last seen on switches none of whose
  reads vouches any more is `stale`, since the newest of those sightings.
  One seen nowhere has no status: « Inconnu » now means never seen.
- A switch LibreNMS gave a status to is `stale` once its read expires, since
  that read.
- Online and offline are unchanged: they rest on a fresh read, as before.
  Offline still does not decay into anything else while its read is fresh.
- Forgetting a LibreNMS integration deletes its sightings, and with them what
  the statuses rested on: devices go back to no status.

The cycle and the minute cron write `stale` and its time together, only when
they change, so a stale device is not rewritten by each cycle. Creating a
device, or bringing one back by undo, computes it the same way from the
sightings at hand. Santé counts a stale switch with the unknown ones.

## Where it was last seen

`devices.lastSeen` returns, to every role, the newest sighting of a device's
MACs: the switch, the port, the socket and its floor when the cabling reaches
one, and the time. The drawer shows it as « Vu sur le réseau ». It is a fact
the map already implies by placing devices next to their sockets; the
history, with every move and the daily snapshots, stays with Éditeurs and
Admins (ADR 0027).

## Consequences

- A status filter or count that listed three statuses lists four; a stale
  device is neither online nor offline.
- The map shows `stale` in the unknown colour, as a hollow dot, so it stays
  quiet next to the statuses that need attention.
- A dead LibreNMS now shows as « Plus de nouvelles depuis … » across the map
  within the delay of ADR 0025, instead of « Inconnu ».
