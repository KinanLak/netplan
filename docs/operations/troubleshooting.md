---
title: Troubleshooting
description: What each line of the Santé page means, why it says so, and what to do about it.
---

# Troubleshooting

**Administration › Santé** shows, for each site, its last collection cycle:
how fresh the data is, each source's step, each LibreNMS switch, and the
push to NetBox when it is on. Start there; the Convex backend's log
(`docker compose logs convex-backend`) has the detail of an unexpected
error, under `collection <site> <source>` or `netbox push <site>`.

## Freshness

The headline is measured from the **start** of the last cycle in which
every source answered.

| Headline                     | Meaning                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| "Plan dessiné à la main"     | No integration is enabled: nothing is collected.                                             |
| "Aucune donnée collectée"    | No cycle has succeeded yet. Read the step lines.                                             |
| "Données collectées il y a…" | Fine.                                                                                        |
| "Données en retard : …"      | Two failures in a row, or the second scheduled run after the last success is 2 minutes late. |

"Late" never applies to a paused server, a site without sources, or a site
whose automatic collection is off. With the default cadence a site is late
after about 12 minutes in business hours and about 2 hours otherwise.

The line under it says when the next cycle runs:

- **"Collecte en cours…"**: a cycle holds its 15-minute lease. A cycle
  that dies is given up when the lease runs out, and counts as a failure.
- **"Collecte suspendue sur le serveur"**, with a banner: the backend has
  `NETPLAN_COLLECTION_PAUSED=true` ([Configuration](configuration.md)).
  Manual cycles are refused too; statuses still expire.
- **"Collecte automatique désactivée"**: the site's setting is off; only
  "Actualiser" collects.
- **"Prochaine collecte en attente"**: a cycle was due more than 2 minutes
  ago and did not start. Every other reason has its own line, so the
  backend's minute cron or its scheduler is not running: check
  `convex-backend` and its log.

After a failure the next run backs off: 5, 10, 20, 40, 80, then 120 minutes,
never sooner than the cadence.

**"Échecs de suite"** counts consecutive cycles with a failed step, manual
ones included, and turns red at 2. A cycle that died without reporting
counts too, but the step lines then still show the cycle before it.

**"Import NetBox"**: "Jamais" until an import succeeds; automatic cycles
import at most every 15 minutes, so an age up to that is normal.

## Step lines

Each source's line reads `NetBox · …` or `LibreNMS · …`. Once the source
answered, the line starts with "Connexion réussie : <source> <version>."
and the rest is that step's report.

**Before the source is reached:**

- **"Le serveur n'a pas de clé de chiffrement valide (NETPLAN_SECRET_KEY)"**:
  the key is unset, not base64, or not 32 bytes
  ([Configuration](configuration.md)).
- **"Le jeton enregistré ne peut plus être déchiffré"**: no configured key
  opens the token. Usually a key rotated without
  `NETPLAN_SECRET_KEY_PREVIOUS`: restore it and re-encrypt, or enter the
  token again in **Intégrations**.
- **"… n'est pas configuré"** or **"… est désactivé"**: the integration
  changed while the cycle started; the next cycle follows the new settings.

**The source's answer.** Timeouts, network errors and 5xx answers are
retried 5 times over about 2.5 minutes before a cycle reports them; a 4xx
answer is final.

| Message                                  | Cause                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "… ne répond pas (délai dépassé)."       | Every attempt timed out (30 s each).                                                                        |
| "… est injoignable à cette adresse."     | DNS, connection refused, or TLS: test the address from the backend's container, not from a browser.         |
| "… refuse ce jeton (401)." / "(403)."    | Token wrong, expired or without the rights [Integrations](integrations.md) lists.                           |
| "Aucune API … à cette adresse (404)."    | Wrong base address. On a LibreNMS switch line, the switch's LibreNMS device no longer exists: map it again. |
| "L'adresse redirige (3xx) : …"           | Redirects are not followed: enter the final address, usually with `https://`.                               |
| "… a répondu 5xx." or another 4xx        | The source's own error after every retry; its log says why.                                                 |
| "… n'a pas répondu en JSON."             | A proxy or a login page answered.                                                                           |
| "Cette adresse ne répond pas comme …"    | Something else answers at that address.                                                                     |
| "Erreur inattendue pendant la collecte." | A bug or an answer of an unexpected shape: the backend's log has it.                                        |

**NetBox import:**

- **"Aucun site NetBox choisi : rien n'est importé."**: choose the NetBox
  site in **Import NetBox**.
- **"Aucun rôle NetBox n'a de type : rien n'est importé."**: map NetBox
  roles to device types there.
- **"NetBox renvoie trop d'objets."**: one list exceeds 200,000 objects.
- **"Import : N équipements (… à vérifier)."**: normal; "à vérifier" are
  suggestions and conflicts waiting in the inventory.
- If any list fails, the import changes nothing and the line gives that
  list's error.

**LibreNMS:**

- **"Aucun switch n'est interrogé."**: no switch of the site is mapped to a
  LibreNMS device in **Switchs LibreNMS**, or the mapped ones are not of
  type switch.
- **"N switchs lus, M MAC vues (…)"**: normal. "inconnues" are MAC
  addresses nobody carries; they wait in the inventory.

## LibreNMS switches

The list names LibreNMS devices, so one row may stand for several Netplan
switches. A row without notes reads "Lu". A row turns red when either the
discovery or the read failed, and the note says which:

- **An error from the table above**: LibreNMS failed to answer for this
  switch, before asking for its discovery or while reading the switch, its
  ports or its forwarding table. A failed read leaves its statuses as they
  were until they expire. An error from the discovery step alone does not:
  the read that follows it still updates them.
- **"Sa découverte n'a pas pu être lancée."**: the token may not ask for a
  discovery; a 4xx means it surely did not start. The switch is still read
  and its statuses updated, from a table that may be as old as its last
  discovery.
- **"Sa découverte n'a pas fini à temps."** (not red): `last_discovered` did
  not change within 2 minutes. A slow poller, or a LibreNMS that does not
  report it ([Integrations](integrations.md)).
- **"Sa dernière découverte n'a rafraîchi aucune entrée."** (not red):
  discoveries do not rewrite the forwarding table on this LibreNMS, and its
  devices go offline after two cycles. Run `scripts/check-librenms.ts
  --discover`.

**Switch counts.** "en ligne" and "hors ligne" are LibreNMS's own status:
"hors ligne" means LibreNMS cannot poll the switch, not that Netplan failed
to read it. "inconnu" means not mapped, no status from LibreNMS, or no
successful read for 2 × the longest cadence interval + 15 minutes (2 h 15
with the default cadence). Expiry runs every minute, even while collection
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
