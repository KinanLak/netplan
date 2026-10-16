---
title: Integrations
description: Connecting a site to NetBox and LibreNMS, and checking that a LibreNMS gives the collection what it needs.
---

# Integrations

Each site reads its own NetBox and LibreNMS (ADR 0022). An admin connects
them in **Administration › Sites › <site> › Intégrations**: the address,
then an API token, which is stored encrypted and never shown again.
"Enregistrer et tester" proves the address and the token before the first
collection; the "Collecte" section below it shows the last cycle's report,
step by step, and when the next one runs.

Both tokens only read. NetBox needs no write right. LibreNMS needs a token
that may read devices, ports and forwarding tables and ask for a discovery:
each cycle asks for one per polled switch, at most every five minutes.

## Checking a LibreNMS before relying on it

A collection cycle assumes three things of LibreNMS that only a real
instance can confirm: that its answers read as expected, that the switch
ports it names match the ports in Netplan, and that a discovery refreshes
the forwarding table, which is how a cycle tells a device seen now from one
seen yesterday. `scripts/check-librenms.ts` checks them with the cycle's own
requests and readers. It runs from a checkout of the repository, with Bun,
on a machine that reaches LibreNMS:

```sh
export LIBRENMS_URL=https://librenms.example.org LIBRENMS_TOKEN=...
bun scripts/check-librenms.ts                          # the API and its devices
bun scripts/check-librenms.ts --device 12 --device 13  # two switches
bun scripts/check-librenms.ts --device 12 --discover   # and one discovery
```

Take the device ids from the LibreNMS web interface (the number in a
device's URL). The script only reads, except with `--discover`, which asks
for one discovery per switch and waits up to two minutes for each: leave
five minutes between two runs, as a cycle would. It prints counts and the
format of values with their digits masked, never the address, the token, a
name or a MAC address, so its output can be pasted into an issue. It exits
`1` when a check fails.

What a warning means:

- **No readable `updated_at`**: a cycle cannot tell fresh entries from old
  ones and counts every entry as seen. Statuses stay online as long as
  LibreNMS keeps an entry.
- **The newest entry is far from the last discovery**: either discoveries
  do not rewrite the forwarding table, or the two dates come from different
  clocks or time zones. The latter is harmless, since a cycle compares
  entries with each other; `--discover` tells the two apart.
- **The discovery refreshed no entry**: discoveries do not rewrite the
  forwarding table on this LibreNMS. A cycle then sees nothing on that
  switch, and its devices go offline after two cycles.
- **Entries on ports the port list does not have**: those MAC addresses are
  never placed or counted.
- **No `last_discovered`**: a cycle cannot tell when a discovery finished,
  waits the full two minutes for each, then reads the table anyway. One in a
  date format the script does not read is harmless to a cycle, which only
  watches it change; the script then cannot compare it with the table.

## Checking a site in the app

After the script passes, with an admin account and one site:

1. **Intégrations**: LibreNMS saved and tested, "Connexion réussie :
   LibreNMS <version>".
2. **Switchs LibreNMS**: each switch of the site mapped to its LibreNMS
   device; the suggestions follow the switch's hostname or name.
3. **Collecte** › "Lancer une collecte": the report's LibreNMS step reads
   "N switchs lus, M MAC vues", with no failure on a switch.
4. On the map, a PC known to be on: "En ligne" in its drawer. One that has
   been off for two cycles: "Hors ligne".
5. A PC with no place on the map, or moved to another socket: after a
   cycle, next to the socket it is seen at.
6. **Inventaire** as an Éditeur: "Adresses MAC inconnues" lists what the
   network sees and no device carries; "Créer l'équipement" on one places
   an endpoint next to its socket.

The automatic cycles then follow the site's cadence, by default every five
minutes from 07:00 to 20:00 on weekdays in the site's time zone, and hourly
otherwise.
