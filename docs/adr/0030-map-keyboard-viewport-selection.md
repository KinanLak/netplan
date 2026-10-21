---
status: accepted
date: 2026-10-21
title: The map's keys act on the selection, never pan the view, and each floor keeps its own view in the URL and the session
---

# The map's keys act on the selection, never pan the view, and each floor keeps its own view in the URL and the session

The owner's UX review (2026-10-21) found the map's keyboard and viewport
surprising: arrow keys panned the map from anywhere, React Flow moved a
focused node without saving it, Escape left edit mode, the view was lost on
reload, and a selection of several devices could not be deleted or nudged.
This records the model lot U2 builds.

## One listener, in the authenticated shell

Every shortcut goes through one capture listener, mounted by the
authenticated layout, so a global shortcut such as the theme works on every
page. A page registers the actions it handles; an action nobody registered
does nothing and lets the browser have the key.

A key is ignored when it comes from a text field, a dialog, or an open menu,
listbox or popover: the widget owns its keys. Escape in a menu closes the
menu and nothing else.

The shortcuts dialog lists only what the user's role and the current page
allow. A Lecteur never sees an editing shortcut.

## Keys on the map

- **Arrow keys never pan.** In edit mode, with a selection and the focus on
  the map (not in the sidebar or a control), they move the selection by one
  grid cell, four with Shift. Holding a key is one durable, undoable move,
  sent when the key is released. Otherwise they are left to the browser.
- **The wheel zooms** the map around the pointer; it never scrolls it.
  Ctrl+= and Ctrl+- zoom the map, not the page. Ctrl+0 sets 100 % around the
  centre of the view, and Shift+1 fits the floor.
- **Escape** abandons, closes or deselects, in that order: a cable being
  drawn, the calibration, the calque panel, the cables shown, the selection.
  It never leaves edit mode; "Terminer" and E do.
- **Delete and Backspace** take the selection off the plan, as "Retirer du
  plan": the devices stay in the inventory and undo puts them back. More
  than one asks for confirmation first. Deleting a device for good is a menu
  action and always asks.
- **Ctrl+A** selects every device of the floor, in edit mode.
- React Flow's own keyboard handling is off: it moved nodes without saving
  them, and Tab walked through every device. Tab goes through the sidebar,
  the help button and the floating map controls, never through devices.
- The shortcut badges appear only when Ctrl (⌘) is held alone for 350 ms,
  and any other key, click or wheel cancels them, so Ctrl+wheel and Ctrl+Z
  no longer flash them.

## Selection

The selection is a set of devices in the store; the drawer opens when it
holds exactly one. A click selects a device, Shift+click adds or removes
one, and Shift+drag draws a selection box without changing tool. Two or more
selected devices can be moved together, nudged, aligned and distributed,
each as one batch operation, so one undo step. There is no copy, paste or
duplicate: a device is an inventory object whose identity comes from NetBox
and LibreNMS, and a copy would have none.

## The view

The URL names the floor and the selected device next to the site, so a link
or a reload opens the same place, and floors in the sidebar are real links
(a middle-click opens one in a new tab). Each floor's last view is kept in
`sessionStorage` and restored when the floor opens again. A floor seen for
the first time is fitted to everything drawn on it (devices, walls and the
calque), never closer than 100 %, and is not refitted when its devices
arrive. A device selected from elsewhere than the plan (inventory, search,
sidebar) is brought into the visible part of the map, beside the drawer,
with a short eased camera move and a brief highlight.

## Consequences

- A shortcut is added in `src/lib/shortcuts.ts` with its scope and context
  rule in `src/lib/shortcut-intents.ts`; whether the dialog lists it follows
  from the same rule.
- Keyboard nudges and drags share the server's collision check: a nudge into
  a wall or another device is refused as a drag would be.
- Nothing about the view is durable: it lives in the URL and the tab's
  session, never in Convex or `localStorage`.
