---
status: accepted
date: 2026-10-21
title: The theme and errors live at the root, sessions slide with activity, sign-in attempts count per identifier, and the map freezes 30 seconds after the connection drops
---

# The theme and errors live at the root, sessions slide with activity, sign-in attempts count per identifier, and the map freezes 30 seconds after the connection drops

The owner's review of the interface (UX lot U1) left decisions about the
shell around every page: what loads before the app, what a failure looks
like, how long a session lasts, how sign-in is throttled and what the map
allows without a connection. This record amends ADR 0021 on session length
and sign-in limits, and ADR 0004 on when a Keycloak role removal lands.

## The shell

The theme belongs to the document, not to the signed-in pages: a script in
`<head>` sets the `light` or `dark` class from the stored choice or the
system's before the first paint, and the provider takes over once hydrated.
The sign-in, password and not-found pages follow the theme too, and so does
the logo, whose light variant appears only in the light theme and dark
variant only in the dark theme. The brand is written « NetPlan » in
everything a user reads; the development logo page is gone.

A page that fails to load shows one French screen with « Réessayer » and
« Retour au plan », saying whether the device is offline or the server does
not answer, and it retries by itself when the network comes back. Moving
between pages offline does not fail: the session cannot have changed while
the browser could not reach the server, and the signed-in layout still
notices a session lost meanwhile.

Tab titles name what the page shows (« Étage 1 · Bâtiment A »,
« Inventaire ») without the brand, which the favicon already carries.

## Sessions

A session lasts 24 hours from its last use rather than from login: an active
user is no longer signed out in the middle of a task. Using the app refreshes
the session at most once an hour. A session still ends 7 days after login
whatever its activity, so a role removed in Keycloak lands within a week, or
at once when an admin disables the account, which revokes its sessions. A
user whose session ends is told why on the sign-in page: expired, or account
disabled.

## Sign-in attempts

better-auth counts attempts per client address, and Netplan's servers do not
see one they can trust: the edge proxies the app, which proxies the Convex
site through the edge again. Every user shared one bucket of three attempts
per ten seconds. Attempts now count per identifier, the username or email
typed (an account's two identifiers count apart), five per minute, so a
stranger can slow down one account but not lock
everyone out. A global ceiling stays, high enough for a team arriving in the
morning, against an attempt spread over many identifiers. The message says
to wait a minute, which is the longest wait either limit imposes.

## Offline

Every page shows a discreet banner as long as the server cannot be reached,
with the number of changes waiting to be sent. The map stays editable for 30
seconds after the connection drops, which covers a Wi-Fi handover or a VPN
reconnecting, then freezes: edit mode pauses, edit controls leave as they do
for a Lecteur, and the banner says the plan is read-only until the
connection returns. Edits made during the grace period stay queued and are
sent on reconnection, as before, and editing resumes where it was.

Thirty seconds bounds how far a user's queued edits can drift from what
others see while keeping a short drop invisible. A longer grace would let
conflicts grow unnoticed; freezing at once would interrupt work for a
two-second blip.

## Consequences

- A Keycloak role removal takes effect at the user's next login, at most 7
  days later for an active user, instead of 24 hours (ADR 0004).
- `signInAttempts` holds one short-lived row per identifier tried.
- The map's edit state depends on the connection as well as the role and the
  user's choice; `useIsEditMode()` already carries all three.
