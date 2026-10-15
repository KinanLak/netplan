---
title: Architecture
description: How Netplan is built today and the shape the rebuild is heading to.
---

# Architecture

- **[Current](current.md)** — the code as it stands at the start of the
  rebuild: map editor, map operations, and the NetBox/LibreNMS localization
  pipeline with its external agent.
- **[Target](target.md)** — where the lots of the rebuild take it: self-hosted
  Docker, accounts and roles, a Netplan-owned inventory with optional
  integrations running inside Convex.

Decisions behind both pages are in [`docs/adr/`](../adr/index.md). When a lot
lands, it moves what it built from Target to Current.
