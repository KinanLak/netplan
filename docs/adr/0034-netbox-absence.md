---
status: accepted
date: 2026-10-28
title: A device NetBox stops returning becomes absent, is kept while on a plan, purged after 30 days off it, and linked again when NetBox returns it; a new NetBox address keeps everything when it reaches the same instance
supersedes: 0022
---

# A device NetBox stops returning becomes absent, is kept while on a plan, purged after 30 days off it, and linked again when NetBox returns it; a new NetBox address keeps everything when it reaches the same instance

This replaces the end of ADR 0022's "Merging imports" ("A device that
disappears from its source is deleted when unplaced; when placed, it loses its
binding and becomes a manual device") and the rule of ADR 0023 and lot 2's
journal that saving another NetBox address forgets the settings and releases
the inventory. The rest of ADR 0022 stands.

Each import applied whatever NetBox listed, every 15 minutes, in one
transaction. A device missing from the list was deleted if unplaced, with its
MACs, cables and notes, and made manual if placed. NetBox leaves a device out
for many reasons besides a decommission: someone deleted it by mistake, its
role is not mapped in NetPlan or changed in NetBox, a restricted token filters
it out. A new address for the same NetBox, such as a move to HTTPS, released
all 447 devices of the real site. The owner decided how absence works on
2026-10-28 (fix plan, "NetBox absence", points 1 to 9).

## Absence

- **One trigger.** A device bound to NetBox that an import no longer lists,
  whatever the reason, is never deleted or released by that import. Its
  binding stays and gains `source.missingSince`, the time of the first import
  that missed it; later imports keep that date.
- **Coming back.** When NetBox lists the device again under its id, the
  import updates it and clears the absence. When NetBox lists it under
  another id, because it was deleted and created again, the usual identity
  rules of ADR 0022 apply with the absent device as a candidate, like a manual
  one: a MAC or serial without contradiction links it, a name alone is an
  Éditeur suggestion, an ambiguity an admin conflict. A port whose NetBox port
  is gone keeps its id, and its cables, when the new port has its kind and
  name.
- **What it keeps.** Its identity stays read-only, as NetBox's. It keeps its
  MACs, which no other device can take while it is absent, its ports and its
  cables: a NetBox cable that touches an absent device stays until the device
  comes back or goes, since NetBox may still have it under a role NetPlan does
  not import.
- **Off the plan: purged after 30 days.** A daily job deletes an absent device
  that is on no floor once 30 days separate the site's last NetBox import
  from the later of `missingSince` and `source.offPlanSince`, with its MACs,
  ports, cables and push row, as an import used to at once. The job itself
  sets `offPlanSince` the first time it finds an absent device on no floor,
  and clears it when the device is placed again, so a device absent for long
  and taken off a plan today still has 30 days. Measuring up to the last
  import rather than to now means a NetBox that no longer answers, or that a
  site stops reading, never makes anything look absent for longer than it
  confirmed. An archived site keeps everything (ADR 0033).
- **On a plan: kept.** A placed absent device is never purged. The map draws
  it greyed; the drawer and the inventory say « Absent de NetBox depuis le … ».
  An Éditeur may delete it, from the map or, once it is off every plan, from
  the inventory. Undo brings it back absent with its date, its ports and its
  cables, the NetBox ones as manual; its binding is then marked `staleId`,
  like after a change of instance below, since a person sent it back. Off
  the plan, the 30 days of the previous point apply.
- **No threshold.** An import that makes many devices absent is applied: absence
  is reversible for 30 days, and Santé shows how many devices are absent.
- **Push.** The push to NetBox (ADR 0027) skips an absent device, and forgets
  what it last sent to it: NetBox has nothing under that id to write to.
- **Localisation.** The LibreNMS cycle still localises an absent device: it is
  still where the network sees it, and the map keeps telling the truth about
  it. A sighting places an absent device that was on no floor, as for any pc
  or endpoint, and a placed device is not purged: the network has just shown
  it exists.
- **« Retirer » NetBox** is unchanged: every device NetBox brought, absent or
  not, becomes manual (point 8).

## A new NetBox address

Saving the NetBox connection with another address first asks the new address
whether it is the same instance: it reads the configured NetBox site by id.
The instance is the same when that site answers and either keeps its name or
most of a sample of the linked devices answer under their ids with their
names, so a site renamed in NetBox is still recognised. `/api/status/` is not
compared: its version changes with an upgrade of the same instance.

- **Same instance.** Everything stays: the bindings, the NetBox site, the
  roles, the push and the LibreNMS mapping. The next import updates each
  device's link to NetBox.
- **Another instance.** The form asks for a confirmation that says how many
  devices are linked to NetBox. Once confirmed, the site and roles are
  forgotten, since their ids name other things in the new NetBox, and every
  linked device becomes absent, with its binding marked `staleId` so that
  only the identity rules can link it again, never its old id. Its ports and
  NetBox cables become manual: their ids mean nothing in the new NetBox. With
  no linked device there is nothing to confirm; with linked devices but no
  NetBox site chosen, the instance cannot be recognised and the admin
  confirms.

## Santé and the import message

- Santé shows, per site, how many devices are absent from NetBox, and lists
  the site's NetBox roles that have no type yet with their number of devices.
  The import reads every device of the NetBox site to count them and keeps the
  mapped ones.
- The import message counts the devices that became absent, those that came
  back, and the manual cables a NetBox cable replaced, for example « 2 câbles
  saisis à la main remplacés par NetBox ».

## Consequences

- `devices.source` carries `missingSince`, `offPlanSince` for the purge, and
  `staleId` after a confirmed change of instance or an undo; the import, the
  reviews, the deletion rules, the purge, the push and the display read them.
- An absent device's binding is not a release: its fields stay read-only, and
  making it editable means deleting it or removing the NetBox integration.
- A device kept on a plan after it left NetBox for good stays until someone
  deletes it; the greyed node is how it gets noticed.

## Source

[Decision log](../history/decision-log.md): lot U11 journal; owner decisions
of 2026-10-28, NetBox absence.
