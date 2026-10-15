---
status: accepted
date: 2026-10-15
title: Accounts are enforced by Convex function wrappers, with roles mapped at Keycloak login and invitations through password reset
---

# Accounts are enforced by Convex function wrappers, with roles mapped at Keycloak login and invitations through password reset

This records how lot 1 builds ADR 0003 and ADR 0004.

## Versions

`@convex-dev/better-auth` stays on latest, and better-auth stays on the latest
release inside the component's peer range (1.6.x today). The component is
installed locally, so the auth schema is generated in `convex/betterAuth/`
with the admin and username plugins.

## Roles

Roles are stored as `reader`, `editor` and `admin` on the better-auth user
(admin plugin `role`) and shown as Lecteur, Éditeur and Admin. New users get
`reader`.

## Authorization

`convex/lib/functions.ts` defines the only builders public functions may use,
one per role level (`readerQuery`, `editorMutation`, `adminMutation`, …).
Each loads the user through the better-auth component, so the session is
checked in the database, refuses banned users and puts the user in the
function context. A lint rule forbids the raw `query`, `mutation` and
`action` builders outside that file. A test lists every public function with
its level and fails when one is added or changes level without the list
saying so; behaviour tests cover each role.

Levels follow ADR 0004: reads need Lecteur; map, building and floor edits and
manual refresh need Éditeur; sites, integrations, users and role mapping need
Admin; presence needs a signed-in user, which every Lecteur is, and only
touches that user's rows.

## Sessions

Sessions last 24 hours from login and are not extended by activity, so a
Keycloak role change always lands within 24 hours.

## Keycloak

SSO uses better-auth's generic OAuth plugin with its Keycloak helper; it is
active when its issuer, client id and secret are set. better-auth does not let
a provider profile set the role, so the mapping runs in a session-creation
hook: when Keycloak creates the session, the hook reads the access and ID
tokens just received from the token endpoint, collects realm roles, client
roles, `roles` and `groups`, and sets the user's role from the two role names
the admin chose (Admin wins). No match gives `reader`. A Keycloak login never
links to an existing local account with the same email; it is refused with a
message.

## Invitations, password reset and the first admin

An admin creates a local user without a password; Netplan issues a
better-auth password-reset token valid seven days and mails a link to a page
where the user chooses a password. Forgotten password uses the same page with
a one-hour token, is never sent to an account without a password (an SSO
account), and revokes the user's other sessions. Disabling a user is a
better-auth ban.

The first admin comes from `BOOTSTRAP_ADMIN_*` Convex environment variables,
applied by an internal function that does nothing once an admin exists; the
deploy step and a script run it.

Mail goes through a Node action with nodemailer, configured by `SMTP_*`
Convex environment variables.

## The app server

The app server proxies `/api/auth/*` to the Convex site URL
(`CONVEX_SITE_URL`) and reads the session cookie before rendering, so a
signed-out visitor is sent to the login page before any map loads. The
Convex token outlives a session ended elsewhere, so the signed-in layout
sends the user back to the login page as soon as a function refuses the
session.

better-auth rate-limits sign-in by client IP, which it reads from a
single-address `X-Forwarded-For`; the edge must set that header. Token and
session reads are not rate-limited: they need a valid session and run on
every page load.

## Identity on the client

The `netplan-identity` local storage entry and the pseudonym lists are gone.
The client keeps a random id per page load for object and operation ids;
presence takes name and colour from the signed-in user on the server.

## Consequences

- A new public Convex function cannot skip authorization without a lint
  exception, which review sees.
- The connector actions keep their shared-secret check and a lint exception
  until lot 2 deletes them.
- Without an edge that sets `X-Forwarded-For`, every sign-in attempt shares
  one rate-limit bucket.
- Moving to better-auth 1.7 changes the Keycloak redirect URI
  (`/api/auth/oauth2/callback/keycloak` today).

## Source

[Decision log](../history/decision-log.md): L1 journal.
