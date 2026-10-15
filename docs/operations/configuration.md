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

| Variable                                                                    | Meaning                                                                                                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ALLOW_DEV_SEED`                                                            | `true` allows the fictional demo site to be seeded. Never in production.                                                                                        |
| `BETTER_AUTH_SECRET`                                                        | Signs sessions and tokens. Required; generate it like the secrets above.                                                                                        |
| `SITE_URL`                                                                  | The app's public URL, trusted for sign-in and redirects. Defaults to `<scheme>://<domain>:<port>`.                                                              |
| `TRUSTED_ORIGINS`                                                           | Other origins allowed to sign in, comma-separated.                                                                                                              |
| `AUTH_JWKS_URL`                                                             | Where the backend fetches its own signing keys, when its public site URL does not answer from inside its container. Empty with compose.                         |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_NAME` | The first admin, created by `convex-deploy` while no admin exists. Sign-up is closed, so nobody can sign in before it.                                          |
| `SMTP_HOST`, `SMTP_PORT`                                                    | The relay Netplan sends invitations and password resets through. Port `587` by default; `mailpit`, `1025` with profile `local`. Without a host, no mail leaves. |
| `SMTP_SECURE`                                                               | `true` for implicit TLS, `false` for STARTTLS when the relay offers it. Defaults to `true` on port `465` only.                                                  |
| `SMTP_USER`, `SMTP_PASSWORD`                                                | The relay's login, when it needs one.                                                                                                                           |
| `SMTP_FROM`                                                                 | The sender, as `Name <address>`. Defaults to `Netplan <netplan@<domain>>`.                                                                                      |
| `NETPLAN_SECRET_KEY`, `NETPLAN_SECRET_KEY_PREVIOUS`                         | Encrypt the integration tokens; the previous key only decrypts, during a rotation (below).                                                                      |

`NETPLAN_SECRET_KEY` (base64 of 32 random bytes, `openssl rand -base64 32`)
encrypts the NetBox and LibreNMS tokens admins enter for each site; no
function ever returns one. Back it up with the database: losing it means
entering every token again on each site's admin page, which says so when a
test fails. To rotate it:

1. Set `NETPLAN_SECRET_KEY_PREVIOUS` to the current key and
   `NETPLAN_SECRET_KEY` to a new one, then `docker compose up -d`.
2. Run `bun x convex run integrations:reencryptTokens` against the
   deployment. It answers how many tokens it re-encrypted and lists any it
   could not read.
3. Remove the previous key from the deployment
   (`bun x convex env remove NETPLAN_SECRET_KEY_PREVIOUS`) and empty it in
   `.env`; an empty value alone leaves it set.

A new variable read by `convex/` goes in `convex-env.txt`, in the
`convex-deploy` environment of `compose.yaml` and in `.env.example`;
`scripts/lib/deploy.test.ts` fails until the first two list it.
