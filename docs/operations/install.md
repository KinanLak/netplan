---
title: Install
description: Running Netplan with Docker Compose for the first time.
---

# Install

Requirements: Docker with the Compose plugin, and the repository checked out
at the release to run.

```sh
cd deploy
cp .env.example .env
chmod 600 .env
```

Fill the three secrets in `.env` with `openssl rand -hex 32` each:
`POSTGRES_PASSWORD`, `INSTANCE_SECRET` and, with the `local` profile,
`KEYCLOAK_ADMIN_PASSWORD`. [Configuration](configuration.md) describes the
rest. Then:

```sh
docker compose up -d --build --wait
```

The first start builds three images (`netplan-app`, `netplan-functions`,
`netplan-keycloak`), creates the database, deploys the Convex functions
through the `convex-deploy` one-shot, and starts the app once that deploy has
succeeded. `--wait` returns when every service is healthy.

## URLs

With the defaults, everything is on `127.0.0.1:8480`, told apart by host
name:

| URL                                              | Service                                  |
| ------------------------------------------------ | ---------------------------------------- |
| `http://netplan.localhost:8480`                  | Netplan                                  |
| `http://netplan.localhost:8480/health`           | [Health](monitoring.md)                  |
| `http://convex.netplan.localhost:8480`           | Convex API, used by the browser          |
| `http://convex-site.netplan.localhost:8480`      | Convex HTTP actions                      |
| `http://convex-dashboard.netplan.localhost:8480` | Convex dashboard                         |
| `http://keycloak.netplan.localhost:8480`         | Keycloak (`local` profile), user `admin` |
| `http://mail.netplan.localhost:8480`             | Mailpit (`local` profile)                |

Browsers resolve `*.localhost` to the machine itself. On another domain,
every name in this table needs a DNS record pointing to the host.

## The Convex dashboard

The dashboard asks for an admin key. Print one with:

```sh
docker compose exec convex-backend ./generate_admin_key.sh
```

The key gives full control of the data; treat it as a secret. It stays valid
as long as `INSTANCE_SECRET` does not change.

## Production

- Leave `COMPOSE_PROFILES` empty: Keycloak in dev mode and Mailpit are for
  evaluation and tests. Production uses its own identity provider and mail
  relay.
- Set `NETPLAN_DOMAIN` to a domain whose sub-domains listed above resolve to
  the host, and `NETPLAN_BIND_ADDRESS=0.0.0.0` to accept connections from
  the network.
- For HTTPS, set `NETPLAN_SCHEME=https` and `NETPLAN_PORT=443`: Caddy
  obtains and renews certificates itself, keeping them in the `edge-data`
  volume. The names must resolve publicly and port 443 be reachable from the
  internet. A certificate from an internal CA needs a `tls` line in each site
  of `deploy/Caddyfile`, and the containers must trust that CA, since they
  call the public URLs too: `app` through `NODE_EXTRA_CA_CERTS` (the CA's
  certificate), `convex-backend` through `SSL_CERT_FILE` (the system bundle
  with the CA appended), each mounted from a `compose.override.yaml`.
  Without the latter, signing in works but the backend cannot fetch its
  signing keys, so it refuses every session's token, no data loads, and its
  log reports `Could not fetch JWKS`.
- A reverse proxy already in front of the host must pass TLS through to the
  edge unterminated (TCP, routed by SNI). Terminating TLS before the edge does
  not work: the public URLs carry the scheme and port, and containers reach
  those same URLs through the edge, so the edge must serve exactly what the
  browser sees.
- Keep `deploy/.env` with the [backups](backup.md): without
  `INSTANCE_SECRET`, a restored backend cannot be administered.

## Stopping

`docker compose down` stops and removes the containers and keeps the data.
`docker compose down -v` also deletes the volumes, that is every map.
