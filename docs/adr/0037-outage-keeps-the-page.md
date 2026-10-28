---
status: accepted
date: 2026-10-28
title: Editing stops the moment the connection drops, a page keeps its session and its Convex identity through an outage, and everything comes back by itself
supersedes: 0031
---

# Editing stops the moment the connection drops, a page keeps its session and its Convex identity through an outage, and everything comes back by itself

This record replaces the « Offline » section of ADR 0031. The rest of ADR
0031 (the shell, sessions, sign-in attempts) stands.

ADR 0031 let the map queue edits for 30 seconds after the connection
dropped and send them on its return. A verification (lot U8, items C1 and
A44) found that queue lost on the first page change of an outage: every
page change asked the app's server for the session, that request failed
while Convex was down, and the root error screen replaced the page. It
unmounted the Convex provider, which cleared the client's identity, so the
queued mutation went out without one and was refused. The same provider
dropped the identity for a moment on every page load too, when
better-auth's session arrived after the server-rendered token, and a query
evaluated in between sent the user through the sign-in page (U7).

The owner then dropped offline editing altogether: a grace period and a
queue of edits made without a connection are complexity that buys nothing.

## Decision

**No editing without a connection.** The map turns read-only the moment
Convex's socket closes or the browser loses its network, and editable again
when both are back. Reading, moving around the plan and between pages go on
as before. An edit already sent when the connection drops is either
confirmed when it returns or rolled back with the refusal message; it is
never dropped silently, and leaving the page while it is unconfirmed asks
first.

**Quiet about the network.** One discreet line says the page is offline,
after two seconds so a reconnecting socket shows nothing, and says how many
edits await confirmation. No toast, no alert: what matters is that the page
recovers by itself.

**The session is read once per page.** Signing in and out reload the page,
so in the browser the root `beforeLoad` and loader answer from what the
page loaded with instead of asking the server again. A session that ends
while the page is open shows as Convex refusing it, and the signed-in
layout sends the user to the sign-in page as before.

**Convex's identity is constant for a page's life.** NetPlan hands Convex
its own `useAuth` instead of `ConvexBetterAuthProvider`'s: signed in or not
as the page loaded, never loading, and one `fetchAccessToken` that answers
null only when the server refuses the session. While the server cannot be
reached it keeps asking, every few seconds and at once when the network
returns, so a token refresh that falls in an outage waits for its end
instead of signing the page out.

**Errors stay below the session.** Every route has its own error screen,
so a page that fails leaves the signed-in layout and the Convex client in
place.

## Consequences

- `e2e/offline.e2e.ts` holds that a page change during an outage keeps the
  page, and that editing works again once the backend returns.
- The app no longer subscribes to better-auth's session in the browser. It
  still reads it on load and when the tab comes back, which slides the
  session and its cookie as ADR 0031 requires.
- A page loaded before a sign-in in another tab stays signed out until it
  reloads, as a page loaded before a sign-out already stayed signed in until
  Convex refused it.
