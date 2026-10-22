---
status: accepted
date: 2026-10-22
title: An archived site leaves the picker, refuses every change to its plan and inventory, and is never collected, until an admin brings it back
---

# An archived site leaves the picker, refuses every change to its plan and inventory, and is never collected, until an admin brings it back

A site could only be deleted, and only once its buildings were gone, so a
site no longer in use had to keep its plan in everyone's picker and its
collection running, or lose the plan. The owner chose an archive flag (UX
audit, C8 option a): hidden from the picker, read only, not collected, and
reversible.

## Decision

- **A flag, not a copy.** `sites.archivedAt` holds when the site was
  archived. Nothing else changes and nothing is deleted: bringing a site
  back is the same site, with its plan, inventory, history, integrations and
  mappings. Only an admin archives or brings back (`sites:setArchived`).
- **Out of the picker, not out of reach.** `sites.list` still returns an
  archived site, flagged. The picker leaves it out unless the page shows it,
  and a page without a site in its URL opens the first site not archived. A
  link, such as « Voir le plan » from the admin, still opens it, labelled
  « (archivé) ».
- **Read only on the server.** Every function that changes a site's plan,
  inventory or collection checks the site first (`requireOpenSite`):
  buildings, floors, devices, cables, unknown and ignored MACs, NetBox
  import reviews, « Actualiser », and `mapOperations.apply`, which records an
  archived site's operation as rejected with « Ce site est archivé : il est
  en lecture seule. ». The dev seed and the collection keep calling the map
  engine directly, so the rule is the user's, not the engine's.
- **Read only in the interface.** The map and the inventory provide whether
  their site is archived; `useCanEditSite` folds it into the role, so every
  edit control already gated on editing disappears, as for a Lecteur. History
  stays readable to Éditeurs and Admins.
- **No collection.** The minute cron skips an archived site, « Actualiser »
  is refused, and its freshness says « Site archivé : aucune collecte »
  rather than going late. Statuses still expire, since nothing keeps them
  true. Santé leaves archived sites out. The NetBox push follows cycles, so
  it stops too. Brought back, a site whose cycle is long overdue is
  collected within the minute.
- **Admin settings stay editable.** An archived site's name, cadence,
  integrations and mappings can still be changed, so it can be prepared
  before it comes back. Deleting still requires an empty site.

## Consequences

- A new function that writes to a site must call `requireOpenSite`; the
  authorization test lists every public function, which is where a reviewer
  sees it.
- An archived site keeps its rows: its devices, MACs and history count
  against nothing but storage, and history purging still runs.
- The sites list shows archived sites last, with a badge; their freshness is
  not shown, since it would only age.
