---
status: accepted
date: 2026-10-28
title: A page keeps its session and its Convex identity through an outage, says when the server cannot be reached, and recovers by itself
---

# A page keeps its session and its Convex identity through an outage, says when the server cannot be reached, and recovers by itself

ADR 0031 let the map queue edits for 30 seconds after the connection drops
and send them on its return. A verification of that lot (U8, item C1) found
the queue lost on the first page change of an outage: selecting a device
changes the URL, every page change asked the app's server for the session
token, the server could not reach Convex, and the root error screen replaced
the page. It unmounted the Convex provider, which cleared the client's
identity; the queued mutation then went out without one and was refused,
with no message. The same provider also dropped the identity for a moment
on every page load, when better-auth's session arrived after the token the
server had rendered with: a query evaluated in between failed as a lost
session and sent the user through the sign-in page (U7).

## Decision

**The session is read once per page.** Signing in and out reload the page,
so in the browser the root `beforeLoad` and loader answer from what the
page loaded with instead of asking the server again. A session that ends
while the page is open shows as Convex refusing it, and the signed-in
layout sends the user to the sign-in page as before.

**Convex's identity is constant for a page's life.** NetPlan hands Convex
its own `useAuth` instead of `ConvexBetterAuthProvider`'s: signed in or not
as the page loaded, never loading, and one `fetchAccessToken` that answers
null only when the server refuses the session. While the server cannot be
reached it keeps asking, with a backoff up to 5 seconds, so a token
refresh that falls in an outage waits for its end instead of signing the
page out.

**Errors stay below the session.** Every route has its own error screen,
so a page that fails leaves the signed-in layout, its connection banner and
the map's queued edits in place.

## Consequences

- A queued edit survives any page change during an outage and is sent when
  the backend returns; `e2e/offline.e2e.ts` holds that.
- The app no longer subscribes to better-auth's session in the browser. It
  still reads it on load and when the tab comes back, which slides the
  session and its cookie as ADR 0031 requires.
- A page loaded before a sign-in in another tab stays signed out until it
  reloads, as a page loaded before a sign-out already stayed signed in until
  Convex refused it.
