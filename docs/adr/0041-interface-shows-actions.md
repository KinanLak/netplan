---
status: accepted
date: 2026-10-28
title: The interface shows what the user can do and does not explain itself
supersedes: 0026
---

# The interface shows what the user can do and does not explain itself

This replaces the « Empty states » paragraph of ADR 0026. The rest of 0026
stands.

The owner asked on 2026-10-28 for every screen to be swept with one rule:
every sentence is something the user reads before acting, so a sentence stays
only when the user would make a real mistake without it.

## The rules

- **Name the action, not the feature.** A heading, a control and its label
  say what a screen is for. A specific verb with its object (« Créer un
  bâtiment », « Inviter un utilisateur ») replaces a generic one (« Nouveau »,
  « Gérer », « Configurer », « OK ») and the sentence that explained it.
- **One consequence.** When an action has several effects, the most critical
  one is stated and the rest dropped. An irreversible or destructive effect
  (data deleted, a user signed out, something written to NetBox) is always
  the one kept.
- **No backend.** What is stored, logged, synced, cached or run in the
  background is not said.
- **No undo through the same control.** A checkbox that turns something off
  turns it back on.
- **Nothing the page already says.** A title, the navigation or a section
  heading is not repeated in a sentence.
- **Nothing that does not exist.** An empty list shows its action, not « Aucun
  … pour l'instant ». A Lecteur's empty plan shows nothing, not who could fill
  it. The exception is a restriction the user would otherwise try and fail at,
  in one short line led by an icon.
- **Show the way in.** What becomes available by connecting, configuring or
  ticking something gets the button or the link that does it, not a sentence
  saying where to go.
- **No paragraphs.** What must stay is split into short lines, each led by an
  icon (`IconNote`, `src/components/icon-note.tsx`). Arrows, pipes, colons and
  symbols are not separators; spacing and icons are.

## Empty states

Each page shows the way in to those who may take it, and nothing else. No
site: Admins get « Créer un site ». No building or floor: Éditeurs get
« Créer un bâtiment » or « Ajouter un étage »; a Lecteur sees the empty
plan. No device: the inventory offers « Créer un équipement ».

## Consequences

- Help text, dialog descriptions and empty-state sentences shrink or go
  across the app; the server's refusals keep their one sentence each.
- A dialog with nothing left to describe keeps a visually hidden description
  for assistive technology only when its title alone would be ambiguous.
- The shortcuts dialog and `aria-label`s are not help text: they stay.
