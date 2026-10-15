---
title: Configuration
description: The variables of deploy/.env and where each one goes.
---

# Configuration

Compose reads `deploy/.env`; `deploy/.env.example` lists every variable.
Changes take effect with `docker compose up -d`, which recreates the services
whose configuration changed and reruns `convex-deploy`.

## Stack

| Variable               | Default             | Meaning                                                                          |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `COMPOSE_PROFILES`     | `local` in example  | `local` adds Keycloak and Mailpit. Empty in production.                          |
| `NETPLAN_SCHEME`       | `http`              | Scheme of the public URLs.                                                       |
| `NETPLAN_DOMAIN`       | `netplan.localhost` | The app is at this domain, the other services at its sub-domains (`convex.`, …). |
| `NETPLAN_PORT`         | `8480`              | Port of the public URLs, and the one the edge publishes.                         |
| `NETPLAN_BIND_ADDRESS` | `127.0.0.1`         | Address the edge listens on. `0.0.0.0` for every interface.                      |
| `NETPLAN_VERSION`      | `local`             | Tag of the `netplan-app` and `netplan-functions` images built or pulled.         |

The app's `CONVEX_URL` and `CONVEX_SITE_URL`, and the backend's
`CONVEX_CLOUD_ORIGIN` and `CONVEX_SITE_ORIGIN`, are derived from the first
three: `<scheme>://convex.<domain>:<port>` and
`<scheme>://convex-site.<domain>:<port>`.

## Secrets

Generate each with `openssl rand -hex 32`.

| Variable                  | Used by                         | Notes                                                               |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`       | Postgres, Convex backend        | Read by Postgres only when its volume is created.                   |
| `INSTANCE_SECRET`         | Convex backend, `convex-deploy` | Admin keys derive from it. Changing it invalidates every admin key. |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak (`local`)              | Password of Keycloak's `admin` user.                                |

## Convex function variables

The names listed in `deploy/convex-env.txt` are set on the Convex deployment
by `convex-deploy` on every start. An empty value leaves the deployment's
current value alone, so a variable set from the dashboard survives until
`.env` gives it a value.

| Variable                                                                    | Meaning                                                                                                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `NETBOX_URL`, `NETBOX_TOKEN`                                                | NetBox API used by the localization pipeline.                                                                                           |
| `LIBRENMS_URL`, `LIBRENMS_TOKEN`                                            | LibreNMS API used by the localization pipeline.                                                                                         |
| `NETPLAN_CONNECTOR_SECRET`                                                  | Shared secret of the external integration agent.                                                                                        |
| `INTEGRATION_SCHEDULER_ENABLED`                                             | `true` lets the cron reserve integration cycles.                                                                                        |
| `INTEGRATION_MANUAL_REFRESH_ENABLED`                                        | `true` allows refreshes requested from the interface.                                                                                   |
| `ALLOW_DEV_SEED`                                                            | `true` allows the fictional demo site to be seeded. Never in production.                                                                |
| `BETTER_AUTH_SECRET`                                                        | Signs sessions and tokens. Required; generate it like the secrets above.                                                                |
| `SITE_URL`                                                                  | The app's public URL, trusted for sign-in and redirects. Defaults to `<scheme>://<domain>:<port>`.                                      |
| `TRUSTED_ORIGINS`                                                           | Other origins allowed to sign in, comma-separated.                                                                                      |
| `AUTH_JWKS_URL`                                                             | Where the backend fetches its own signing keys, when its public site URL does not answer from inside its container. Empty with compose. |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` | The first admin, created by `convex-deploy` while no admin exists. Sign-up is closed, so nobody can sign in before it.                  |

A new variable read by `convex/` goes in `convex-env.txt`, in the
`convex-deploy` environment of `compose.yaml` and in `.env.example`;
`scripts/lib/deploy.test.ts` fails until the first two list it.
