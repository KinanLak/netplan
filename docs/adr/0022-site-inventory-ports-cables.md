---
status: accepted
date: 2026-10-15
title: Devices are a site inventory with ports and cables, optionally placed on a floor
---

# Devices are a site inventory with ports and cables, optionally placed on a floor

This records how lot 2 builds ADR 0005, ADR 0007, ADR 0008 and the data side
of ADR 0009.

## Devices

A device belongs to a site. Its placement (floor, position, size) is
optional: a device imported from NetBox or created from an unknown MAC starts
unplaced. Identity is top-level: name, hostname, serial, MAC addresses,
model, IP. MAC addresses are unique within a site.

Types are `rack`, `switch`, `patch-panel`, `wall-port`, `pc` and `endpoint`
(a generic device with a MAC address: printer, phone, server…).

A device created by a source carries a source binding (integration, external
id, link to the source, last sync). Each provider owns a fixed list of fields
(NetBox: name, type, serial, MACs, model, IP); one shared list drives both
the read-only fields in the UI, with a badge naming the source, and the
server's refusal to change them. Hostname, notes and placement stay editable.
A device with a source cannot be deleted in Netplan, only unplaced.

## Map operations and inventory mutations

Map operations stay floor documents (ADR 0001's operation model) and keep
geometry: `device.create` (creates and places a manual device),
`device.place` and `device.unplace` (inverses of each other), `device.patch`
(position, size), `device.delete` (removes a manual device with its ports and
cables; its inverse restores them), and walls.

Identity, ports and cables are site facts edited through Éditeur mutations
from the device drawer and the inventory page. Destructive ones offer an
"Annuler" toast that applies their inverse; they are not part of the map's
undo history, which belongs to one floor.

## Ports and cables

A port belongs to a device and has a name, a kind (`interface`, `front`,
`rear`), an order, and for a front port its rear port. A new manual device
gets default ports for its type; a sourced device's ports come from the
source and are read-only.

A cable joins two ports, one cable per port, anywhere in the site, so a cable
may cross floors. Cables from a source are read-only; when a source brings a
cable for a port that has a manual one, the source's replaces it. Links
between devices and their operations are removed; drawing cables on the map
comes with the map lot.

A trace starts at a port, follows its cable, crosses from a front port to its
rear port and back, and stops at a wall socket. "This switch port is cabled
to that socket" is the result of a trace, whatever patch panels lie between.

## Observations

A sighting says that a MAC address was seen on a switch port during a cycle.
Sightings count only on edge ports: ports whose trace reaches a socket, and
uncabled ports with at most four MAC addresses. A `pc` or `endpoint` whose
MAC is sighted becomes online at that socket, and offline after two cycles
without a sighting. When its socket changes, or when it is sighted while
unplaced, it is placed next to the socket on the socket's floor; a position
set by a person is kept while the socket stays the same.

A MAC sighted on an edge port that no device of the site carries is an
unknown MAC. The inventory lists them with "Créer l'équipement", which
creates an endpoint with that MAC next to its socket.

## Merging imports (ADR 0008)

When an import brings a device Netplan does not have, its candidates are the
site's devices without a source that share a MAC or a serial with it.
Placeholder serials ("System Serial Number" and the like) and any MAC or serial
shared by several devices of the import are ignored.

- One candidate, no contradiction (different serials, or disjoint MAC sets
  where both have MACs): the candidate gains the binding and its source
  fields.
- No identifier match, one hostname match: a suggestion that an Éditeur
  confirms (merge) or rejects (import as new). The device is not imported
  until then.
- Several candidates or a contradiction: an admin conflict, resolved by
  choosing the candidate or importing as new.

A device that disappears from its source is deleted when unplaced; when
placed, it loses its binding and becomes a manual device.

## Consequences

- Data restarts from zero: the NetBox-keyed tables, links, and the projection
  of computers are dropped without migration.
- Every query and mutation on devices, ports and cables is scoped by site.
- The drawer shows a port table; the map's switch shows the inventory's real
  ports.
- Port names are matched to LibreNMS without vendor rules (ADR 0023).

## Source

[Decision log](../history/decision-log.md): L2 journal; Q20, Q29, Q30, Q32.
