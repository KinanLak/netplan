---
status: accepted
date: 2026-10-28
title: Sign-in waits grow per identifier with no shared limit, a Keycloak role is read again every hour, and an admin can sign a user out everywhere or hand a local account to Keycloak
---

# Sign-in waits grow per identifier with no shared limit, a Keycloak role is read again every hour, and an admin can sign a user out everywhere or hand a local account to Keycloak

A review of the agents' account decisions (owner, 2026-10-28) found four
gaps. Shared sign-in ceilings still let one stranger lock everyone out. A
role removed in Keycloak took up to a week to land, and an admin could not
make it land sooner without disabling the account. A local account blocked
Keycloak for its address for good. And a Keycloak group named like a role
granted that role. This record amends ADR 0021 and ADR 0031 on these
points, and ADR 0004 on when a Keycloak role change lands.

## Sign-in and password-reset attempts

Netplan's servers see no client address they can trust (ADR 0031), so
better-auth's address-keyed limiter put every visitor in one bucket per
endpoint. It is off. Nothing is shared between people.

Attempts count per identifier typed: the username or email for a sign-in,
the address for a password-reset request. The first four attempts in a row
never wait. The fifth imposes a one-minute wait before the next, and each
further attempt doubles it, up to 15 minutes. A successful sign-in wipes the
identifier's record; reset requests have no success and are forgotten like
the rest, an hour after the last attempt. An attempt refused during a wait
changes nothing, so retrying neither gets through nor lengthens the wait.

The count happens before better-auth looks the identifier up, so an
identifier without an account counts, waits and answers exactly like one
with. The refusal carries the wait in seconds, and the forms say it in
minutes.

Without a limiter, a route that says whether an account exists would list
them all, so the username plugin's `/is-username-available` is off.

Someone who knows an identifier can still keep its owner waiting, at the
cost of one attempt per wait. That is the price of a limit without
addresses. Each identifier counts alone, so the other one an account has
still works.

## Keycloak roles every hour

A Keycloak account's role is read again at each hourly session refresh, not
only at login. When better-auth extends a session, which use does at most
once an hour, a hook schedules an action. The action asks Keycloak's token
endpoint for new tokens with the stored refresh token, then sets the role
from them with the admin's mapping, as at login.

Keycloak ends an ordinary refresh token with its session, 30 minutes idle by
default, so an hourly refresh would almost always find it dead. Netplan
therefore asks for the `offline_access` scope. Keycloak grants it by
default, through the realm's default roles and the client's optional
scopes. The offline token lives as long as Netplan uses it, and Keycloak
refuses it as soon as the user is disabled or deleted, or an admin revokes
the offline session.

What Keycloak answers decides what happens:

- **New tokens:** the role follows them.
- **`invalid_grant` on an offline token:** Keycloak no longer vouches for
  that login, so every Netplan session of the user ends. The next sign-in
  goes through Keycloak and reads the role again. On an ordinary refresh
  token, from a client that does not offer the offline scope, it only means
  Keycloak's session idled out, and nothing happens.
- **Anything else** (Keycloak down, a timeout, a 5xx): nothing changes and
  nobody is told. The next hourly refresh tries again. A role is never
  lowered or raised on a guess.

Two refreshes never spend one token: a mutation claims it, so a realm that
rotates refresh tokens does not refuse the second.

The 7-day cap of ADR 0031 stays. It no longer bounds a role change, but it
still bounds a stolen session.

## « Déconnecter partout »

An admin can end every session of another account without disabling it.
The account signs in again at once if it can: with its password, or through
Keycloak, which reads its role again. It is how an admin makes a Keycloak
role change land now rather than within the hour, and how a lost laptop's
session ends. Admins still cannot list sessions (ADR 0021): only their
number comes back.

## Handing a local account to Keycloak

« Passer ce compte sur Keycloak » removes an account's password and its
pending password links. It ends its sessions and marks the account as
waiting for Keycloak. The user row stays, so its role history, its
sign-ins and everything attributed to it stay too.

The next Keycloak sign-in with that account's email attaches to it. From
then on it is a Keycloak account and its role follows the mapping. While it
waits, the account cannot sign in. Forgotten-password mails are not sent to
it. The admin can cancel the handover, which leaves an account without a
password that needs a new invitation.

Implicit linking stays off for everyone else. better-auth's account linking
is on, but a hook on account creation refuses every link except two: to a
user that the same sign-in has just created, or to an account waiting for
Keycloak. A local account with a password, or an invitation that was never
used, still refuses a Keycloak sign-in with its email. The sign-in page then
says to ask an administrator to hand the account over. better-auth links
only when Keycloak says the address is verified, so someone who types a
waiting account's address into their own Keycloak profile does not get it.
A disabled account cannot be handed over: its Keycloak sign-in would be
refused only after the link was made.

## Which Keycloak claims count

Only realm roles (`realm_access.roles`) and the client's roles
(`resource_access.<client>.roles`) grant a role by default. A group is often
creatable by people who cannot manage roles. A checkbox in the Keycloak
section, « Accepter aussi les groupes », off by default, adds the `groups`
claim, with or without its leading slash. The flat `roles` claim that a realm
can add with a mapper is no longer read: it can carry anything, groups
included, and realm roles already arrive in `realm_access`.

## Consequences

- A Keycloak role change lands within an hour of use, or at once after
  « Déconnecter partout ». ADR 0004's « re-read at each login » becomes
  « at each login and each hourly refresh ».
- Keycloak must keep granting `offline_access` to Netplan's users. A realm
  that removes it from the default roles refuses their sign-in.
- `authAttempts` holds one row per identifier and kind tried, purged an
  hour after its last attempt. It replaces `signInAttempts`, which a
  deployment may still hold and which nothing reads. The better-auth
  `rateLimit` table is gone.
- No route has an address-keyed limit any more, so the username plugin's
  `/is-username-available`, which would answer which accounts exist, is
  disabled.
- A local account can move to Keycloak without losing its history. There is
  no move back to a password other than cancelling a pending handover.
- A realm that granted Netplan roles through groups or the flat `roles`
  claim must tick the checkbox or map realm or client roles.

## Source

[Decision log](../history/decision-log.md): U12 journal.
