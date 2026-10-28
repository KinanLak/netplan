---
status: accepted
date: 2026-10-28
title: A site is collected at one interval day and night, its readings expire after two intervals and the lease, and the collection says its doubts quietly
supersedes: 0010
---

# A site is collected at one interval day and night, its readings expire after two intervals and the lease, and the collection says its doubts quietly

ADR 0010 gave each site two cadences: 5 minutes in business hours, 07:00 to
20:00 on weekdays in the site's time zone, and hourly otherwise. The owner
dropped that on 2026-10-28: one cadence, all the time, the weekday daytime
one. Business hours, the off-hours interval and the working days go, with
every setting, field and line of code tied to them.

The same review settled how the LibreNMS step behaves where its readings are
doubtful. The standing rule applies: infrastructure noise stays quiet, a
message appears only when someone lost something or must act, and everything
recovers by itself once the network answers again.

## One interval

- A site keeps a single interval between cycles, `intervalMinutes`, 5 by
  default, from 5 minutes (LibreNMS is asked for at most one discovery per
  five minutes) to 24 hours. The admin's « Collecte » block shows it with the
  two existing checkboxes. Q34bis's reason still holds: the load a cycle puts on
  switches is each network's own, so the interval stays per site; only the
  business-hours split goes.
- The next cycle is one interval after the last one started, whatever the
  day or hour. The back-off after failures is unchanged.
- The site's time zone stays: the five daily snapshots (ADR 0027) and the
  history's days are in it. At the default interval every snapshot slot is
  taken, weekends included.
- No migration: sites in the old shape are refused by the schema, and a
  deployment restarts its sites as ADR 0001 allows.

## Readings expire after two intervals and the lease

A switch's read vouches for the statuses resting on it for two of the site's
intervals plus the cycle lease: 25 minutes by default, day and night. The
`max` of the two old intervals, which kept a dead LibreNMS's statuses green
for 2 h 15 in daytime, is gone with them. « En retard » follows the same
interval: two scheduled cycles and two minutes.

## The MAC table's freshness rule says when it falls back

ADR 0022's rule counts only the entries the latest discovery refreshed. It
has two fallbacks, which the switch's line in Santé now names in a short,
muted phrase, without the amber dot of a remark:

- « Table MAC non datée »: LibreNMS gave no timestamps, so the whole table
  counts.
- « Table MAC non rafraîchie »: the discovery moved nothing, so no entry
  counts until one does.

Neither raises an alert, a toast or a banner, and neither counts as a remark.
The next discovery that dates or refreshes the table clears it.

## How a device was seen

The thresholds stay: an uncabled port with more than four addresses leads
elsewhere, and a device is offline after two cycles without a sighting. The
drawer's « Vu sur le réseau » tells the two ways a sighting places a device:
« vu via un câble » when the port's cabling reaches a socket, « vu sur un
port non documenté » when the port is uncabled and quiet enough to count.

## Several new sockets in one cycle

A device seen in one cycle at several sockets, none of them where it was last
seen, moves to the socket whose LibreNMS entry is clearly the most recent:
newer than every other by more than two minutes, the spread of one cycle's
discoveries (`FDB_FRESH_MS`). When the entries are about as recent, or carry
no time, it stays where it is and a later cycle decides. There is no new
state and no message. A sighting always records what was seen, which
switch included, so presence and expiry rest on current evidence; when the
device's place follows another socket, or none yet while it is held, the
sighting says so (`decided`), and the next cycle compares with that rather
than with an arbitrary one of the sockets. The history records a location
where the cycle decides the device is: none while it is held or stays,
and the new socket when it moves, even when the plan cannot draw it there
(a socket off the plan, no free spot), since the network did see it there.

## LibreNMS's port names are proposed, not adopted

A manual switch whose ports still carry their default names « 1 » to « n »
no longer takes LibreNMS's names during a cycle: a shift of one position
would rename every port, cables included, without anyone seeing it. The
drawer proposes it instead, to an Éditeur only, for example « Adopter les
52 noms de LibreNMS », from the names the last read saw. The adoption itself
keeps ADR 0025's rule: by position, ports beyond added, uncabled ones beyond
removed. Until it is adopted, the default names match none of LibreNMS's
ports, so nothing is seen behind them: the button is the way out.

## Consequences

- `sites.cadence` becomes `sites.intervalMinutes`; `src/sites/cadence.ts`
  takes an interval and no time zone.
- ADR 0010 is superseded. ADR 0023's business hours and days, ADR 0025's
  "longest interval", ADR 0026's two-hour lateness and ADR 0027's missing
  weekend slots no longer apply.
- A LibreNMS that stops answering turns the map's statuses `stale` after
  about 25 minutes at any hour.

## Source

[Decision log](../history/decision-log.md): Q34bis, owner decisions of
2026-10-28 (5.1, 3.1 to 3.5), lot U13.
