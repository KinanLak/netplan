---
title: Backup and restore
description: Two tested ways to back up and restore a Netplan installation.
---

# Backup and restore

Netplan's data is the Convex deployment: its tables live in Postgres, and its
file storage, deployed modules and search indexes in the `convex-data`
volume. Keycloak and Mailpit (profile `local`) hold nothing to keep.

Two procedures, both verified by a full round trip (back up, `down -v`,
restore, same document counts):

- **A, Convex export**: one zip with every table and file. The backend keeps
  running. Portable across backend versions; the way to
  [upgrade](upgrade.md) when an in-place migration fails.
- **B, Postgres dump and storage volume**: an exact copy of the two stores.
  The backend stops for its duration. Faster on large data; restores only on
  the same backend version.

Whichever you use, keep `deploy/.env` with the backups: the restored backend
needs the same `INSTANCE_SECRET`.

`deploy/convex.sh` runs the Convex CLI from the `convex-deploy` image with an
admin key derived from `INSTANCE_SECRET`. In the commands below, `$BACKUPS`
is an absolute path on the host; files written there belong to root.

## A, Convex export

Back up:

```sh
docker compose run --rm -T -v "$BACKUPS":/backups --entrypoint ./deploy/convex.sh \
  convex-deploy export --include-file-storage --path /backups/netplan.zip
```

The export is a snapshot of one instant; writes made while it runs are not in
it. Stop the app first (`docker compose stop app`) when that matters.

Restore, into a running stack, replacing every table:

```sh
docker compose run --rm -T -v "$BACKUPS":/backups --entrypoint ./deploy/convex.sh \
  convex-deploy import --replace-all -y /backups/netplan.zip
```

Function variables are not in the export; `convex-deploy` sets the ones in
`.env` on every start.

## B, Postgres dump and storage volume

Back up:

```sh
docker compose stop convex-backend
docker compose exec -T postgres pg_dump -U netplan -Fc netplan > "$BACKUPS/netplan.pgdump"
docker compose run --rm --no-deps -T -v "$BACKUPS":/backups --entrypoint tar \
  convex-backend -czf /backups/convex-data.tgz -C /convex/data .
docker compose start convex-backend
```

Stopping the backend makes the dump and the volume copy agree with each
other.

Restore, into empty volumes:

```sh
docker compose down -v
docker compose up -d --wait postgres
docker compose exec -T postgres pg_restore -U netplan -d netplan --no-owner < "$BACKUPS/netplan.pgdump"
docker compose run --rm --no-deps -T -v "$BACKUPS":/backups --entrypoint tar \
  convex-backend -xzf /backups/convex-data.tgz -C /convex/data
docker compose up -d --wait
```

## Checking a backup

Count the documents of a few tables before and after, for example (raise
`--limit` above the size of the largest table):

```sh
docker compose run --rm -T --entrypoint ./deploy/convex.sh \
  convex-deploy data devices --limit 10000 --format jsonLines | wc -l
```
