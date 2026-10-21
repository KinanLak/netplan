---
status: accepted
date: 2026-10-21
title: Cables are React Flow edges between port handles, coloured by their link; device labels are names in capitals with the full name on hover; free text labels annotate the plan
---

# Cables are React Flow edges between port handles, coloured by their link; device labels are names in capitals with the full name on hover; free text labels annotate the plan

This records how the U3 lot of the UX review (2026-10-21) draws the map. It
keeps ADR 0025's rules on which paths show and when; it changes how they are
drawn, and how devices and rooms are named on the plan.

## Cables

A shown path is drawn with React Flow edges, not a layer of its own.

- Each node carries a handle where a cable meets it: one per shown port on a
  switch or a patch panel, inside the port's square; the icon of a wall
  socket; the status dot of a PC or an endpoint. A rear port that one front
  port passes through meets its cable at that front port. Handles are points
  that nobody connects through: cables are still drawn by the cable grip, and
  React Flow runs in loose connection mode only so an edge may join two
  handles of the same kind.
- An edge is a Bézier curve. Its ends leave and reach their nodes on the side
  facing the other end, whatever side the handle sits on, so a switch's
  cables fan out from their own ports instead of from one point.
- Edges render under the nodes, so a path never crosses a device's name.
- A cable takes the state of the switch port at either end of its trace:
  live (link up, or a device seen) in the "En ligne" colour with a flow
  moving along it, down in a quiet solid grey, and unknown in a dotted grey.
  An inactive link is normal, so it is quiet, as the port squares already
  are. The flow stops when the system asks for reduced motion.
- The segment from a located device to the socket where it was seen stays
  dashed and grey.

A label where a path ends (the port it reaches, a shared rear port, a device
on another floor or off the plan) sits under the device it ends on, else over
it, and is not drawn when both would cover another device. The path itself
still shows; the drawer and the port table name every end. Port names follow
the port table: a patch panel's ports say which side they are on, and a
device on no floor is « hors plan ».

## Device names and statuses

- A node shows the device's name, in capitals for legibility. A device with
  a hostname is named after it, so the plan, the sidebar, the drawer and the
  search all say the same thing.
- The name shrinks to fit its node down to a minimum size, then is cut with
  an ellipsis. The full name shows in a tooltip on hover and in the drawer on
  selection; it is never written under the node.
- Status colours are tokens (`--up`, `--down`, `--unknown`, and their
  backgrounds). "En ligne" is green, "Hors ligne" red, "Inconnu" grey. There
  is no legend. Another status takes a token pair of its own.
- Passive devices (wall sockets, patch panels, racks) have no status: no dot,
  a neutral border, and they are left out of status counts. A socket shows
  that a device was seen behind it through its icon.

## Text labels

A floor may carry free text labels: a short text at a position, such as a
room's name. They are map objects of their own, with no link to walls: a
room drawn or erased leaves its label where it is. They are added, edited,
moved and deleted in edit mode through map operations, with an inverse for
undo and the same server validation as every other operation. Every role
sees them.

## Consequences

- A node type that should carry cables must render a `CableHandle` for each
  place a cable may meet it; an edge to a missing handle falls back to the
  node's first one.
- A node whose ports change asks React Flow to measure its handles again.
- The map no longer draws paths in a `ViewportPortal`; only the end labels
  do, because they belong to a device rather than to an edge.

## Source

[UX audit decisions, 2026-10-21](../history/decision-log.md): A17, A37,
A102, A107, B7, B10, B13, C4, and the U3 journal.
