---
status: accepted
date: 2026-10-15
title: Cables are a port-level model, edited on the map or in a port table, never all drawn at once
---

# Cables are a port-level model, edited on the map or in a port table, never all drawn at once

A cable connects two ports, not two devices. A source such as NetBox ("that
port is cabled to this socket") and manual editing feed the same model.
Observations such as "this MAC is seen on that switch port" (LibreNMS) are not
cables; they are matched against them to locate a device.

Editing is hybrid. On one floor, an Éditeur draws a cable between two ports
on the map. Across floors, and for patch panels with many ports, cables are
edited in a port table.

Display never shows every cable at once:

- hovering an endpoint shows its cable path;
- a switch or a patch panel shows its cables only after an explicit action.

Ports and states follow the same idea: a switch shows its real ports from the
inventory, coloured where a device has been seen on them. An endpoint's dot
shows online, offline or unknown; other devices stay "unknown" until a source
provides a state (a switch's state from LibreNMS when available).

## Consequences

- The map stays readable on floors with hundreds of sockets.
- Link rendering, hover state and the explicit "show cables" action are
  separate concerns of the map layer.

## Source

[Decision log](../history/decision-log.md): Q20, Q27, Q32, Q32bis.
