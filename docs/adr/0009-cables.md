---
status: accepted
date: 2026-10-15
title: Cables are a port-level model, edited on the map or in a port table, never all drawn at once
---

# Cables are a port-level model, edited on the map or in a port table, never all drawn at once

A cable connects two ports, not two devices. Sources feed the same model:
"this MAC is seen on that switch port" (LibreNMS) and "that port is cabled to
this socket" (NetBox), and so does manual editing.

Editing is hybrid. On one floor, an Éditeur draws a cable between two ports
on the map. Across floors, and for patch panels with many ports, cables are
edited in a port table.

Display never shows every cable at once:

- hovering an endpoint (a computer, a socket) shows its cable path;
- a switch or a patch panel shows its cables only after an explicit action.

## Consequences

- The map stays readable on floors with hundreds of sockets.
- Link rendering, hover state and the explicit "show cables" action are
  separate concerns of the map layer.

## Source

[Decision log](../history/decision-log.md): Q20, Q27, Q32, Q32bis.
