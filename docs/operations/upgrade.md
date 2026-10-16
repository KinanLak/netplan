---
title: Upgrade
description: Moving to a new Netplan release, and to a new Convex backend version.
---

# Upgrade

Take a [backup](backup.md) first, every time.

## A new Netplan release

```sh
git pull   # or check out the release tag
docker compose up -d --build --wait
```

Compose rebuilds the images, reruns `convex-deploy` (which pushes the new
functions and schema before the new app starts) and recreates what changed.
The app is unavailable for the few seconds between its old and new
container.

Convex refuses a schema that existing documents do not match: then
`convex-deploy` fails and its log says why. The installation is then down:
compose has already replaced the old app container with a new one that waits
for `convex-deploy` and never starts. Check out the previous release and run
the same command to bring it back; its schema still matches the data.

## A new Convex backend

A Netplan release may change the `convex-backend` and `convex-dashboard`
image tags in `compose.yaml` (they always move together, and with
`CONVEX_BACKEND_IMAGE` in the `Dockerfile`). The release notes say so.
Upstream offers [two ways](https://github.com/convex/convex-backend/blob/main/self-hosted/advanced/upgrading.md):

**In place**, the default. `docker compose up -d --build --wait` starts the
new backend on the existing database, which migrates it. Follow its log until
the migration reports completion:

```sh
docker compose logs -f convex-backend   # wait for "MigrationComplete(<n>)"
```

**Export and import**, when an in-place migration fails. It starts from an
empty database:

1. Stop the traffic: `docker compose stop app`.
2. Back up with procedure A of [Backup and restore](backup.md): the export
   and the function variables.
3. `docker compose down -v`, change the image tags, then
   `docker compose up -d --build --wait`.
4. Restore both (procedure A).

The downtime is roughly the time of an export plus an import; time one on the
running installation to know.

## Postgres

`postgres:17.x` patch releases are a tag change and a restart. A new major
version needs a dump and restore (procedure B of
[Backup and restore](backup.md)) into a fresh volume.
