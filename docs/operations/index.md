---
title: Operations
description: Installing, configuring, upgrading, backing up and monitoring a Netplan installation.
---

# Operations

Netplan runs as a Docker Compose stack (`deploy/compose.yaml`, ADR 0020).

- **[Install](install.md)**: the first start, the URLs, the admin key.
- **[Configuration](configuration.md)**: every variable of `deploy/.env`.
- **[Upgrade](upgrade.md)**: a new Netplan release, a new Convex backend.
- **[Backup and restore](backup.md)**: two procedures, both tested end to
  end.
- **[Integrations](integrations.md)**: connecting a site to NetBox and
  LibreNMS, checking a LibreNMS before relying on it, and writing locations
  back to NetBox.
- **[Monitoring](monitoring.md)**: `/health` and the containers' health
  checks.

Every command below runs from `deploy/`.
