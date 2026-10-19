---
status: accepted
date: 2026-10-19
title: Every request to a source runs in Node, and an integration may ignore certificate errors when its admin says so
---

# Every request to a source runs in Node, and an integration may ignore certificate errors when its admin says so

Lot 6 validates against the real LibreNMS everything lots 2 to 5 could only
build against fixtures, since that LibreNMS was unreachable until now
(ADR 0023). It moved to a public address whose certificate still names its
old host: a strict client refuses it (`ERR_TLS_CERT_ALTNAME_INVALID`), and
the owner accepts skipping the check on this internal network.

## The option

Each integration of a site, NetBox or LibreNMS, has its own "Ignorer les
erreurs de certificat TLS", off by default. It is stored on the integration
row, saved with the address and the token, and applies only to that
integration's requests: Netplan has no global or environment-wide switch for
it, so one site's tolerance never weakens another's.

Turning it on means the token goes to whoever answers at that address, since
nothing proves the server's identity any more. The admin form says so next to
the box, and **Administration › Santé** shows a warning on each site that has
an integration with the option on, so it is not forgotten once the
certificate is fixed. Changing the option invalidates the last connection
test, as changing the address or the token does.

A narrower option (check the chain but not the name, or pin the
certificate's fingerprint) would be safer but asks the admin for something
they rarely have at hand; it can come later without changing this one.

## Where requests run

The default Convex runtime's `fetch` cannot skip certificate checks. Node's
can, through an undici dispatcher, so every function that calls NetBox or
LibreNMS is a Node action, registered together in `convex/sources.ts`:
saving and testing a connection, the admin's NetBox and LibreNMS choices,
the collection cycle and the push to NetBox. One runtime for every source
request keeps a single code path: a strict integration and a lenient one
differ only by the dispatcher of their requests.

- The rest of each feature stays where it was, as plain functions taking the
  connection; `convex/sources.ts` holds only the registrations and the
  choice of transport. Only that file imports `undici`, so no other module
  is bundled for Node.
- A connection opened for an integration carries the `fetch` its requests
  use: Node's own for a strict one, and for a lenient one undici's `fetch`
  with an `Agent` that does not reject unauthorized certificates. Node's
  built-in `fetch` refuses a dispatcher from a newer undici
  (`UND_ERR_INVALID_ARG`), so the lenient path uses undici's `fetch` and its
  `Agent` together.
- A certificate error is an answer, not an outage: it is not retried, and
  the admin reads that the certificate was refused and that the option
  exists, rather than "injoignable".
- The self-hosted backend image ships Node 22, and a Node action calls the
  backend back at `CONVEX_CLOUD_ORIGIN`. In `deploy/compose.yaml` that URL
  resolves inside the network to the edge; `dev:agent` publishes the
  backend on a per-worktree host port, so its container relays that port to
  the backend's own.
- `scripts/check-librenms.ts` takes `--insecure` for the same purpose, with
  Bun's own option, since it runs outside Convex.

## What is checked against the real LibreNMS

The checklists lots 2 to 5 left open: `check-librenms` with a discovery,
port names and their order by interface index, switch statuses and their
expiry, real cycles at the product cadence putting devices online and
offline, unknown MACs and their remediation, the Santé page's per-switch
list, port-name adoption for manual switches, undo refused after a cycle's
move, the daily snapshots, and a move reaching the history and the NetBox
push. Each difference between the real answers and the fixtures becomes a
test with a sanitised recording: no token, no SNMP credentials (LibreNMS
returns them with a device), and no MAC address or host name that is not a
harmless infrastructure name.

## Consequences

- Every source request pays a Node action's cold start once per call of
  those functions, not once per request; cycles run every five minutes at
  most, so this is negligible.
- `undici` is a runtime dependency of the functions.
- A certificate an admin chose to ignore stays ignored after it is fixed,
  until they untick the box; the Santé warning is there for that.
