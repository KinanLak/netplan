---
status: accepted
date: 2026-10-16
title: Freshness is shown to everyone and refreshed by Éditeurs, errors are French toasts, and the inventory carries the offline, coverage and ignored-MAC views
---

# Freshness is shown to everyone and refreshed by Éditeurs, errors are French toasts, and the inventory carries the offline, coverage and ignored-MAC views

This records how lot 4 builds the experience around ADR 0010, ADR 0022 and
ADR 0023.

## Freshness and "Actualiser"

Every signed-in user sees how fresh a site's data is: on the map, in the
inventory and in the admin, from one reader-level query and one shared
component. The data is fresh as of the start of the last cycle in which
every source answered. It is late once two scheduled cycles have passed
since then, computed from the site's cadence (10 minutes at the default
business-hours cadence, about two hours otherwise), or after two failed
cycles in a row. A late site shows a warning on the map and in the inventory.

Éditeurs and Admins may press "Actualiser"; a Lecteur sees freshness only.
This follows the role split of lot 1 (reads to Lecteur, map edits and manual
refresh to Éditeur). There is no confirmation: the server already refuses a
second cycle while one runs, and asks LibreNMS for a discovery at most every
five minutes (ADR 0023), so pressing twice cannot load the switches. The
person who pressed gets a toast when that cycle ends. Automatic cycles stay
silent, and their failures show only through the warning.

The next cycle is never shown as a date in the past. A due date that has
passed shows "imminente" for the two minutes the cron needs to pick it up,
then "en attente". A site whose automatic cycles are off, whose collection is
paused on the server, or which has no active integration says so instead of
showing a date.

## Errors and toasts

Every message a user reads is a French sentence. Server functions refuse with
French `ConvexError`s, and map operations now reject with French sentences
too, so the client shows the server's words instead of guessing from English
ones. One helper turns any failure into a message: the server's sentence,
the role refusal, or "La modification a échoué. Réessayez."

The authenticated layout holds the only toaster, so the map, the inventory and
the admin share it, at the bottom centre: the corners hold the map's status
card, the zoom controls and React Scan's toolbar in development. Toasts are
the channel for results and refusals. Inline errors stay for form fields.

## Unknown MACs can be ignored

An Éditeur may ignore an unknown MAC, for a phone or a visitor's laptop that
should never become a device. The fact is durable and site-scoped: a row in
`ignoredMacs` (site, MAC, who, when). It outlives sightings, which come and
go with each cycle. Ignoring and restoring are inverse Éditeur mutations,
like the other inventory edits (ADR 0022). Ignoring offers "Annuler", and the
ignored list, folded under the unknown MACs, restores one. The server
normalizes the MAC, refuses one that a device of the site carries, and treats
ignoring twice or restoring a MAC that is not ignored as a no-op, so an undo
can be replayed. A MAC that later gets a device leaves both lists, whatever
its row says.

## Offline, coverage and empty states

- **Offline.** The sidebar lists the site's devices that are offline, by
  name, and opens each on its floor. The inventory gains a status column and
  filter. Status is `metadata.status` alone: a status the collection can no
  longer vouch for is cleared and reads "Inconnu" (lot 3b).
- **Coverage.** The inventory opens with, per device type, how many are
  placed out of how many there are. Each count filters the list to the
  unplaced ones, so a socket or PC still to draw is one click away.
- **Empty states.** Each page says what is missing and offers the way in only
  to those who may take it. No site: Admins get a link to create one. No
  building or floor: Éditeurs create a building with its first floor, or add
  a floor; an empty building or floor can be removed. No integration:
  freshness says the plan is drawn by hand, with a link to the site's
  integrations for Admins. No device: the inventory offers to create one.
  The development-only "Create default map" and "Clear map" buttons go: the
  seed fills a local instance, and clearing a site's map is not something an
  Éditeur should reach by mistake.

## Admin health

An admin page summarizes every site on one screen: the last cycle and its
outcome per source, failures in a row, the next cycle, how old the last
NetBox import is, each polled switch's result in the last LibreNMS read, and
how many switches are up, down or unknown. To show per-switch results, a
cycle step keeps them as structured data next to its message instead of only
inside its text.

## Consequences

- `siteCycles` records when the last fully successful cycle started.
  Freshness is computed on the client from that time, the cadence and the
  clock, so it ages without a query re-running.
- The server's map-operation rejection messages change language. The client's
  English-matching translation goes away.
- Building and floor creation, renaming and removal of empty ones become
  validated Éditeur mutations. `createDefaultMap` and `clearMap` are deleted.
- A command palette does not exist yet. "Actualiser" gets a keyboard shortcut,
  listed in the shortcuts dialog.

## Source

[Decision log](../history/decision-log.md): L4 journal; Q8, Q16, Q19, Q30.
