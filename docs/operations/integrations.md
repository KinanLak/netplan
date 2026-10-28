---
title: Integrations
description: Connecting a site to NetBox and LibreNMS, checking that a LibreNMS gives the collection what it needs, and writing observed locations back to NetBox.
---

# Integrations

Each site reads its own NetBox and LibreNMS (ADR 0022). An admin connects
them in **Administration › Sites › <site> › Intégrations**: the address,
then an API token, which is stored encrypted and never shown again.
"Tester la connexion" tries what the form shows without saving it; "Enregistrer et
tester" tries it and saves it only when the source answers, so a typo never
replaces a working connection. A connection that cannot be reached can still
be switched off: unticking "Collecter depuis …" saves without a
test. The "Collecte" section below shows the last cycle's report, step by
step, and when the next one runs.

A NetBox token only reads, unless the site writes locations back to NetBox
(below). LibreNMS needs a token that may read devices, ports and forwarding
tables and ask for a discovery: each cycle asks for one per polled switch,
at most every five minutes.

"Ignorer les erreurs de certificat TLS", on each connection, is for a
source whose certificate does not match its address, typically one that
moved to a new host and kept the old certificate (ADR 0028). It is off by
default and applies to that connection only. With it on, the token goes to
whoever answers at that address, so **Administration › Santé** keeps a
warning on the site until it is unticked. A certificate from an internal CA
needs no option: give the backend that CA instead ([Install](install.md)).

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
bun scripts/check-librenms.ts --insecure               # accepting any certificate
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

1. **Intégrations**: LibreNMS saved and tested, "Connecté à
   LibreNMS <version>".
2. **Switchs LibreNMS**: each switch of the site mapped to its LibreNMS
   device; the suggestions follow the switch's hostname or name.
3. "Actualiser" on the map's sidebar (Shift+R), then **Collecte**: the
   report's LibreNMS step reads "N switchs lus, M MAC vues", with no failure
   on a switch.
4. On the map, a PC known to be on: "En ligne" in its drawer. One that has
   been off for two cycles: "Hors ligne".
5. A PC with no place on the map, or moved to another socket: after a
   cycle, next to the socket it is seen at.
6. **Inventaire** as an Éditeur: "Adresses MAC inconnues" lists what the
   network sees and no device carries; "Créer l'équipement" on one places
   an endpoint next to its socket.

The automatic cycles then run at the site's interval, every five minutes by
default, day and night.

## Writing locations back to NetBox

A site can write where the network last saw each device NetBox brought into
five custom fields of that NetBox device (ADR 0027, ADR 0040):
`netplan_site`, `netplan_floor`, `netplan_socket`, `netplan_switch_port`
(text) and `netplan_updated` (date and time, « Modifié par NetPlan le »: when
NetPlan wrote them). It writes only when the place it shows changes, a move
or a place renamed in NetPlan, so NetBox's changelog records nothing else. It is off by default and
one way: Netplan never reads these fields back, writes nothing else, and
never clears what it wrote. A NetBox that has the older `netplan_last_seen`
keeps it, no longer written; remove it there if you want, the script never
does.

1. **Create the fields once per NetBox**, from a checkout, with a token
   allowed to add custom fields:

   ```sh
   export NETBOX_URL=https://netbox.example.org NETBOX_TOKEN=...
   bun scripts/netbox-custom-fields.ts --check   # only say what is missing
   bun scripts/netbox-custom-fields.ts           # create what is missing
   ```

   It creates them on `dcim.device`, in the group "Netplan", not editable in
   NetBox's interface, since Netplan would overwrite an edit. A field of that
   name with another type is reported and left alone. By hand, give each
   field the name and type above and the object type "DCIM > Device".

2. **Let the site's token change devices**: in NetBox, a permission on
   `dcim.device` with the `change` action for the token's user, or a write
   token.
3. **Turn it on** in **Administration › Sites › <site> › Import NetBox**:
   "Écrire dans NetBox où le réseau voit chaque équipement".

After the next cycle, **Administration › Santé** shows the site's last push
("Envoi vers NetBox") and each device NetBox refused, with NetBox's reason
and when it is tried again (one minute after the first refusal, doubling up
to an hour):

- **"NetBox refuse ce jeton (403)"**: the token cannot change devices
  (step 2).
- **"NetBox refuse ces valeurs (400)"** followed by NetBox's detail: usually
  a field missing or of another type; `--check` says which.
- **"Cet équipement n'existe plus dans NetBox (404)"**: the device was
  deleted in NetBox after Netplan imported it.
- **NetBox unreachable or failing (5xx)**: the run stops at the first such
  answer and the next cycle's run tries again; the line shows the error.

A run writes at most 100 devices; the rest follow on the next cycles. A device
seen again where NetBox already shows it, or going offline, is not written.
