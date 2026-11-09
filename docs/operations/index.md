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
- **[Troubleshooting](troubleshooting.md)**: what each line of the Santé
  page means and what to do about it.
- **[The owner's instance](owner-instance.md)**: the stack the owner tests
  on, served on their tailnet, and how to redeploy it.

Every command below runs from `deploy/`.
