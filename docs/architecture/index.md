---
title: Architecture
description: How Netplan is built today and the shape the rebuild is heading to.
---

# Architecture

- **[Current](current.md)** — the code as it stands: map editor, map
  operations, the Docker deployment, and the development and delivery tooling.
- **[Target](target.md)** — where the lots of the rebuild take it: accounts
  and roles, a Netplan-owned inventory with optional integrations running
  inside Convex.

Decisions behind both pages are in [`docs/adr/`](../adr/index.md). When a lot
lands, it moves what it built from Target to Current.
