---
status: accepted
date: 2026-10-28
title: A selection of several devices moves by one offset, as one block that never passes through a wall
---

# A selection of several devices moves by one offset, as one block that never passes through a wall

Dragging a selection resolved each member on its own: each looked for the
free spot nearest its own target, and the members did not block one another.
Against a wall, the group deformed for good, a member jumped to the far side
of a wall or out of the building, and two members could end on each other,
which the server then refused as a whole. The server could not tell: it
received one `device.patch` per member and checked only where each landed.

## Decision

- **One operation, one offset.** A drag or an arrow nudge of the selection is
  a `devices.move`: the devices of one floor, each where it stood when the
  move was made (`from`), and the offset they all move by. The group cannot
  deform, since no member has a position of its own. A member no longer at
  its `from` refuses the move, as `expected` does for `device.patch` (ADR
  0025), so a drag never bends a group someone else has changed meanwhile;
  members already at `from + offset` mean the move is in, so a move still
  pending is not applied twice over a server document that holds it. The
  inverse moves back from where the move left them, and a held arrow key
  sums its steps into one move.
- **Never through a wall.** Each member slides in a straight line from where
  it stands to where it lands. The move is refused when a member lands on a
  wall or a device outside the group, or when its path touches a wall on the
  way. Members may take each other's spots, and the path may pass over other
  devices, as a single drag does. The server applies the same check
  (`src/map-engine/groupMove.ts`), so a client that skips it is refused.
- **The drag waits.** Under a cursor the group cannot follow, it waits at the
  nearest offset where every member fits, or where it last stood; each member
  shows the spot under the cursor it cannot take (A13). It never looks for a
  free spot member by member.
- **One device keeps its rules.** A single dragged device still follows the
  cursor to the nearest free spot, wherever that is. Aligning and spreading
  still give each device its own position, as a batch of `device.patch`.

## Consequences

- A group that must go round a wall, through a door, moves in two steps.
- A held arrow key's moves sum to one straight move along that key's axis,
  so the server checks the path the steps took.
