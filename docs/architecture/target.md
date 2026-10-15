---
title: Target architecture
description: The shape the rebuild lots are building towards.
---

# Target architecture

The rebuild replaces the current design in place, with no transitional layers
and data restarting from zero (ADR 0001). Order: F, then lots 0 and 1 in
parallel, then lot 2 alongside lot 3a, then 3b, 4 and 5. Lot F is done and
described in [Current](current.md).

## Infrastructure (lot 0)

- One Docker image for the web app. Configuration, including the Convex URL,
  is read at runtime, so the same image runs everywhere; `/health` reports
  readiness.
- A compose stack with the self-hosted Convex backend on Postgres, the Convex
  dashboard, the app, Keycloak and Mailpit (ADR 0002).
- Vercel and the Electrobun desktop app are removed.

## Accounts (lot 1)

- better-auth inside Convex: password accounts invited by an admin, and
  Keycloak OIDC; no sign-up, 24-hour sessions, login required everywhere
  (ADR 0003).
- Global roles Lecteur, Éditeur and Admin checked by every Convex function;
  the SSO role comes from a Keycloak role name chosen by the admin (ADR 0004).
- Presence shows real users; `netplan-identity` goes away.
- An admin page for users, invitations and role mapping, and SMTP for mail.

## Domain model (lot 2)

- Netplan owns its inventory and identity (MAC, hostname, serial). Devices may
  exist without a place on the map (ADR 0005).
- Sites and their integrations are configured in the admin page; integration
  tokens are encrypted with an environment master key and write-only
  (ADR 0006).
- NetBox and LibreNMS become optional per-site sources. Fields they own are
  read-only in Netplan (ADR 0007); devices they learn later are merged by MAC
  or serial, otherwise reviewed (ADR 0008).
- Cables are modelled port to port (ADR 0009). Collection runs inside Convex
  at a per-site cadence (ADR 0010, ADR 0012); the external agent, connector
  and systemd units are deleted.

## Floor overlay (lot 3a, alongside lot 2)

A calibrated background "calque" per floor (ADR 0011).

## Map (lot 3b, after lot 2)

Real switch ports coloured by observation, status dots, cables shown only on
demand, and hybrid cable editing (ADR 0009).

## Experience (lot 4)

Refresh and freshness, errors and toasts, empty states, the offline section,
the coverage view and the admin health view.

## History and operations (lot 5)

Thirty days of location history for Éditeur and Admin (ADR 0014), the one-way
location push to NetBox (ADR 0015), and operations documentation.
