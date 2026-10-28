---
title: Troubleshooting
description: What each line of the Santé page means, why it says so, and what to do about it.
---

# Troubleshooting

**Administration › Santé** shows, for each site, its last collection cycle:
how fresh the data is, each source's step, each LibreNMS switch, and the
push to NetBox when it is on. Sites in trouble come first, and each card
links to the part of the site's page that fixes it. Start there; the Convex backend's log
(`docker compose logs convex-backend`) has the detail of an unexpected
error, under `collection <site> <source>` or `netbox push <site>`.

A site whose connection has "Ignorer les erreurs de certificat TLS" ticked
carries an amber warning, "… est interrogé sans vérifier son certificat TLS",
with a link to the connection, until it is unticked: its token goes to whoever answers at that address.

## Freshness

The headline is measured from the **start** of the last cycle in which
every source answered.

| Headline                     | Meaning                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| "Plan dessiné à la main"     | No integration is enabled: nothing is collected.                                                         |
| "Aucune donnée collectée"    | No cycle has succeeded yet, and none read any source. Read the step lines.                               |
| "Collecte partielle …"       | No cycle has fully succeeded, but the last one read some sources; the failing ones are named. Amber dot. |
| "Données collectées il y a…" | Fine.                                                                                                    |
| "Données en retard, …"       | Two failures in a row, or the second scheduled run after the last success is 2 minutes late.             |

"Late" never applies to a paused server, a site without sources, or a site
whose automatic collection is off. At the default interval a site is late
after about 12 minutes.

The line under it says when the next cycle runs:

- **"Collecte en cours…"**: a cycle holds its 15-minute lease. A cycle
  that dies is given up when the lease runs out, and counts as a failure.
- **"Collecte suspendue"**, with a banner: the backend has
  `NETPLAN_COLLECTION_PAUSED=true` ([Configuration](configuration.md)).
  Manual cycles are refused too; statuses still expire.
- **"Collecte automatique désactivée"**: the site's setting is off; only
  "Actualiser" collects.
- **"Prochaine collecte en attente"**: a cycle was due more than 2 minutes
  ago and did not start. Every other reason has its own line, so the
  backend's minute cron or its scheduler is not running: check
  `convex-backend` and its log.

After a failure the next run backs off: 5, 10, 20, 40, 80, then 120 minutes,
never sooner than the site's interval.

**"Échecs de suite"** counts consecutive cycles with a failed step, manual
ones included, and turns red at 2. A cycle that died without reporting
counts too, but the step lines then still show the cycle before it.

**"Import NetBox"**: "Jamais" until an import succeeds; automatic cycles
import at most every 15 minutes, so an age up to that is normal.

## Step lines

Each source's line reads `NetBox …` or `LibreNMS …`: the step's report,
or "Connecté à <source> <version>." when it had nothing else to say. The LibreNMS line only counts ("2 switchs lus sur 3, …"); each switch's
trouble is in the list under it, and "Revoir la correspondance des switchs"
appears when LibreNMS answered 404 for one ("n'existe plus dans LibreNMS").

**Before the source is reached:**

- **"La clé de chiffrement du serveur (NETPLAN_SECRET_KEY) est invalide."**:
  the key is unset, not base64, or not 32 bytes
  ([Configuration](configuration.md)).
- **"Le jeton enregistré est illisible."**: no configured key
  opens the token. Usually a key rotated without
  `NETPLAN_SECRET_KEY_PREVIOUS`: restore it and re-encrypt, or enter the
  token again in **Intégrations**.
- **"… n'est pas configuré"** or **"… est désactivé"**: the integration
  changed while the cycle started; the next cycle follows the new settings.

**The source's answer.** Timeouts, network errors and 5xx answers are
retried 5 times over about 2.5 minutes before a cycle reports them; a 4xx
answer and a refused certificate are final.

| Message                                     | Cause                                                                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| "… ne répond pas (délai dépassé)."          | Every attempt timed out (30 s each).                                                                             |
| "… est injoignable à cette adresse."        | DNS or connection refused: test the address from the backend's container, not from a browser. See below for DNS. |
| "Le certificat TLS de … est refusé (CODE)." | See below.                                                                                                       |
| "… refuse ce jeton (401)." / "(403)."       | Token wrong, expired or without the rights [Integrations](integrations.md) lists.                                |
| "Aucune API … à cette adresse (404)."       | Wrong base address. On a LibreNMS switch line, the switch's LibreNMS device no longer exists: map it again.      |
| "L'adresse redirige ailleurs (3xx)."        | Redirects are not followed: enter the final address, usually with `https://`.                                    |
| "… a répondu 5xx." or another 4xx           | The source's own error after every retry; its log says why.                                                      |
| "… n'a pas répondu en JSON."                | A proxy or a login page answered.                                                                                |
| "Cette adresse ne répond pas comme …"       | Something else answers at that address.                                                                          |
| "Erreur inattendue pendant la collecte."    | A bug or an answer of an unexpected shape: the backend's log has it.                                             |

**"… est injoignable à cette adresse."** on an address the host itself
reaches: a container keeps the DNS servers the host had when the container
was created. After the host's DNS changes (a VPN, a new network), recreate
the backend: `docker compose up -d --force-recreate convex-backend`.

**"Le certificat TLS de … est refusé (CODE)"**: the certificate does not
match the address, has expired, or comes from a CA the backend does not
trust; CODE says which. Give the backend an internal CA
([Install](install.md)). A certificate that names another host, as after a
move that kept the old certificate, is what the connection's "Ignorer les
erreurs de certificat TLS" is for ([Integrations](integrations.md)).

**NetBox import:**

- **"Aucun site NetBox choisi."**: choose the NetBox
  site in **Import NetBox**.
- **"Aucun rôle NetBox à importer."**: map NetBox
  roles to device types there.
- **"NetBox renvoie trop d'objets."**: one list exceeds 200,000 objects.
- **"N équipements importés (… à vérifier)."**: normal; "à vérifier" are
  suggestions and conflicts waiting in the inventory.
- If any list fails, the import changes nothing and the line gives that
  list's error.

**LibreNMS:**

- **"Aucun switch associé."**: no switch of the site is mapped to a
  LibreNMS device in **Switchs LibreNMS**, or the mapped ones are not of
  type switch.
- **"N switchs lus, M MAC vues (…)"**: normal. "inconnues" are MAC
  addresses nobody carries; they wait in the inventory.

## LibreNMS switches

The list names LibreNMS devices, so one row may stand for several Netplan
switches. A row without notes reads "Lu". A row turns red when its read
failed, amber when it was read with a remark:

- **An error from the table above**: LibreNMS failed to answer for this
  switch while reading it, its ports or its forwarding table. A failed read
  leaves its statuses as they were until they expire.
- **"N'existe plus dans LibreNMS (404)."**: the device was deleted or renumbered in LibreNMS; pick its
  new device in the site's LibreNMS mapping.
- **"Découverte refusée (401)."** or **"(403)."** (amber): LibreNMS answered
  401 or 403, so the token may not ask for a discovery. The switch is still
  read and its statuses updated, from a table that may be as old as its last
  discovery.

A discovery LibreNMS was too busy to take (a 5xx, a 429, a timeout) or that
did not finish within 2 minutes says no more than the muted line below and
fails nothing: the switch is read anyway and the next cycle asks again.

- **"Table MAC non rafraîchie"** (muted, after "Lu"): the last
  discovery asked for did not finish, or finished and moved nothing in the
  forwarding table. In the second case none of its entries counts and the devices
  behind the switch go offline after two cycles. It clears by itself with
  the next discovery that refreshes the table; if it stays, run
  `scripts/check-librenms.ts --discover`.
- **"Table MAC non datée"** (muted): LibreNMS gave the entries no
  timestamps, so the whole table counts, old entries included, and a device
  switched off may stay online.

**Switch counts.** The first line counts the site's switches by how the
last cycle read them: "lus", "en échec" for a mapped switch it could not
read, and "non interrogé" for a switch with no LibreNMS device in the
mapping; a stack sharing one device counts each of its switches; "Statut le plus ancien lu" is the age of the oldest read still
vouching for a status. Under it, "en ligne" and "hors ligne" are LibreNMS's own status:
"hors ligne" means LibreNMS cannot poll the switch, not that Netplan failed
to read it. "inconnu" means not mapped, no status from LibreNMS, or no
successful read for 2 × the site's interval + 15 minutes (25 minutes at the
default interval). Expiry runs every minute, even while collection
is paused, and also clears the statuses of the PCs last seen only on that
switch.

## Push to NetBox

The "Envoi vers NetBox" block appears when the site writes locations back
to NetBox; [Integrations](integrations.md) explains each refusal. Two
things it does not say:

- A run stops at the first NetBox that times out or answers 5xx, and the
  next cycle's run tries again. A refused device is tried again only by a
  run that follows a cycle, so "nouvel essai après" is the earliest time.
- Push failures do not count in "Échecs de suite" or in freshness. "Et
  d'autres équipements en échec." means more than 20 devices are failing.

## History

**Historique** is for Éditeur and Admin. Each daily snapshot slot (08, 12,
14, 16 and 19h in the site's time zone) is taken by the first LibreNMS cycle
that reads between 5 minutes before and 10 minutes after it and sees at
least one MAC address.

- **"À venir"**: the window is still open.
- **"En cours"**: being written, for up to 10 minutes.
- **"Pas de relevé"**: no cycle qualified (collection paused, failing,
  automatic collection off, the LibreNMS step failed, or no MAC seen), or
  a capture started and died: look in the backend's log at that time.

A cron deletes events and snapshots older than 30 days every night at 03:41
UTC; nothing else is ever deleted by it.
