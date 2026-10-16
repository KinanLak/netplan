---
status: accepted
date: 2026-10-16
title: The map shows observed ports and statuses that expire, cable paths on hover or on demand, and draws cables within a floor
---

# The map shows observed ports and statuses that expire, cable paths on hover or on demand, and draws cables within a floor

This records how lot 3b builds the display and editing side of ADR 0009 on
the inventory of ADR 0022 and the cycle of ADR 0023.

## Statuses

A device has one status, `metadata.status`: online, offline, or absent, which
reads "Inconnu". There is no separate "stale" value. Only the cycle sets
statuses, and it removes one it can no longer vouch for.

- A `pc` or an `endpoint` is online or offline from its sightings, as in
  ADR 0022.
- A switch that LibreNMS polls takes its status from the LibreNMS device:
  up is online, down is offline. A switch that no source polls has no status.
- Other devices have no status.

Each Netplan switch has a last successful read, which the cycle records with
the site's other cycle state. A status rests on the read of a switch: a
switch's own status, the statuses of its ports, and the status of every device
whose MAC addresses were last seen on it. When that read is older than
twice the site's longest cycle interval plus the cycle lease, these statuses
are removed. That happens whether LibreNMS failed, the switch dropped out of
the mapping, or cycles stopped. The minute cron applies the rule, so it holds
even when no cycle runs. The next good read sets them again.

Offline does not turn into unknown with time: a switch that was read and did
not see a device is a fact.

## Ports

A switch or a patch panel shows its real ports from the inventory, in their
order, whatever their kind. A real NetBox models switch ports as rear ports,
so a switch that only has rear ports shows them. A patch panel shows its
front ports, which pair with its rear ones.

A port has two observed facts, both written by the cycle only when they
change:

- its link, from the LibreNMS port's operational status: up, down, or absent
  when nothing reads it;
- whether a device is seen on it: a MAC address of the site sighted on that
  port in the switch's last read.

A port is coloured as "Appareil vu" when a device is seen on it, "Lien actif"
when its link is up, "Lien inactif" when its link is down, and "Inconnu"
otherwise. These facts expire with the switch's read, as statuses do.

### Default port names

A manual switch gets ports named "1" to "24". When LibreNMS polls it and its
ports still all carry those default names in order, the cycle adopts the
LibreNMS device's physical Ethernet ports, ordered by interface index. The
port at each position takes the LibreNMS name. Ports LibreNMS has beyond
Netplan's are added. Default-named ports beyond LibreNMS's are removed when
uncabled. Port ids, and so cables, stay with their positions. Once a person or
a source has named a switch's ports, the cycle never renames them, and name
matching (ADR 0023) applies.

## Cable display

The map never draws every cable. It draws a path, which is a trace of
ADR 0022 laid over the floor:

- Hovering or selecting a `pc`, an `endpoint` or a wall socket shows its path.
  A device located at a socket by the network has no cable to it, so its path
  starts with a dashed segment to the socket where it was last seen. Its
  cables follow, through patch panels, to the switch port.
- A switch or a patch panel shows the paths of all its ports only after an
  explicit "Afficher les câbles": from the context menu, the device drawer,
  or a shortcut. It stays shown until "Masquer les câbles", Escape, or another
  device's.

Paths are traced in the browser from the floor document. A hop to a device
that is not on this floor ends the drawn path on a label naming that device
and its floor. A trace stops instead of guessing:

- at a loop;
- after a hop limit;
- at a port with no cable;
- at a rear port that several front ports share (a breakout or a multi-position
  panel), on the server too, where the trace used to take the first front.

A cable between two rear ports needs no special case.

## Cable editing

Cables stay site facts outside the map's undo history (ADR 0022), whichever
screen edits them. On one floor, an Éditeur in edit mode drags from a port
of a device to another device. When the target has several free ports, the
Éditeur picks one. A drawn cable can be deleted from the map. Both go through
the same mutations as the port table, with its "Annuler" toast. Across floors,
and for patch-panel paths, the port table in the device drawer remains the
way to edit cables.

## Moves made by the cycle

A device the cycle places next to a socket is moved by an observation, not by
a person. The move enters nobody's undo history. An undo or a redo that
would move a device someone else has moved since, the cycle included, is
refused with a message rather than putting the device back on stale grounds.

## Consequences

- The floor document carries the facts a path needs: ports with their
  observed facts, cables, and for a located device the socket it was last
  seen at.
- A dead LibreNMS shows as "Inconnu" across the map within about two hours
  with the default cadence, instead of the last known statuses.
- The admin health view (lot 4) reads switch statuses and last reads from
  the same fields the map uses.
- What stays unverified until a real LibreNMS is reachable: its device and
  port status values, port ordering by interface index, and how quickly a
  stopped LibreNMS is noticed.

## Source

[Decision log](../history/decision-log.md): Q20, Q27, Q32bis, and the lot 3b
journal.
