---
title: The owner's instance
description: The long-running Compose stack on the owner's workstation, served on the tailnet, and how to redeploy it.
---

# The owner's instance

The owner tests Netplan on a Compose stack that runs all the time on their
workstation, ordi-86. It is not a worktree's `dev:agent` instance: it is the
production setup of [Install](install.md), connected to the real NetBox and
LibreNMS.

## Where it runs

- Compose project `netplan-l0`, from the detached checkout `~/l5-smoke`. Its
  `deploy/.env` holds the secrets and the bootstrap admin (mode 0600).
  Removing that checkout breaks the edge's bind mounts.
- Its site "Arles" polls LibreNMS devices 2 to 5, with the certificate
  option on (see [Integrations](integrations.md)) and the NetBox push off.
  Because it is the poller of those devices, a `dev:agent` site keeps its
  automatic collection off: two pollers would double every discovery.
- It is served only on the owner's tailnet, at
  `https://ordi-86.tailbabbb0.ts.net:8480`. Ports 8481 to 8484 are the
  Convex API, the Convex site, Keycloak and Mailpit.

## The untracked files

The tailnet setup lives in files of `~/l5-smoke/deploy/` that git ignores:

- `compose.override.yaml`: the public URLs, the edge's ports 8481 to 8484,
  and the edge's alias for the tailnet name.
- `ts/Caddyfile`: TLS on each port.
- `ts/certs/`: the certificate from `tailscale cert`, valid until
  2027-01-25. To renew it, run
  `tailscale cert --cert-file deploy/ts/certs/cert.pem --key-file deploy/ts/certs/key.pem ordi-86.tailbabbb0.ts.net`,
  then restart the edge.
- `ts/keycloak/`: the image `netplan-keycloak-ts:local`, which is the
  repository's realm plus the tailnet callback. Rebuild
  `netplan-keycloak:local` from `deploy/keycloak` first.

`tailscale serve --tcp` forwards 8480 to 8484 to `127.0.0.1`, on the
tailnet only. Port 8317 on the same machine belongs to another service:
never touch it.

## Redeploying

1. Back up first with procedure A of [Backup and restore](backup.md), using
   `-p netplan-l0` and `BACKUPS=~/l5-backups`.
2. Move `~/l5-smoke` to the commit to deploy.
3. Build the images outside Compose, because `docker compose up --build`
   hangs in `bun install` on this machine (BuildKit has no DNS there):
   ```sh
   docker build --network=host --target app -t netplan-app:local .
   docker build --network=host --target functions -t netplan-functions:local .
   ```
4. From `deploy/`, run `docker compose -p netplan-l0 up -d --no-build --wait`.

Netplan is not released yet, so schema changes ship without migrations. If
`convex-deploy` fails schema validation, follow these steps:

1. Make the field optional in a temporary copy of `convex/`, and add a
   one-off `internalMutation` that fixes the data.
2. Deploy that copy:
   `docker compose run -v <copy>:/netplan/convex convex-deploy`.
3. Run the mutation with `--entrypoint ./deploy/convex.sh … run`.
4. Redeploy from the commit you meant to deploy.

If sources turn "injoignable" after a redeploy, the backend kept stale DNS.
See [Troubleshooting](troubleshooting.md).
