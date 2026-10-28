---
title: Monitoring
description: The /health endpoint and the containers' own health checks.
---

# Monitoring

## `/health`

`GET <app URL>/health` needs no login and is never cached
(`Cache-Control: no-store`). It answers `200` when Netplan can serve and
`503` otherwise, with each check and, on failure, why:

```json
{
  "status": "ok",
  "checks": [
    { "name": "config", "status": "ok" },
    { "name": "convex", "status": "ok" },
    { "name": "convex-site", "status": "ok" }
  ]
}
```

```json
{
  "status": "ko",
  "checks": [
    { "name": "config", "status": "ok" },
    { "name": "convex", "status": "ko", "detail": "backend answered 502" },
    { "name": "convex-site", "status": "ko", "detail": "backend answered 502" }
  ]
}
```

- `config`: `CONVEX_URL` and `CONVEX_SITE_URL` are set and valid.
- `convex`: the backend answers `/version` at its public URL within three
  seconds, which also proves the edge routes it.
- `convex-site`: the backend's HTTP actions answer at `CONVEX_SITE_URL`,
  where the app's server reads sessions, within three seconds.

Point Zabbix (web scenario, required status `200`) or Uptime Kuma (HTTP
monitor) at it, every minute. The status code is the signal; `checks` is for
the person investigating. Later lots add checks, such as integration
freshness, to the same response.

## Containers

Every long-running service has a Docker health check, and every service
restarts by itself (`restart: unless-stopped`):

```sh
docker compose ps        # STATUS shows (healthy) or (unhealthy)
docker compose logs -f <service>
```

`convex-deploy` is a one-shot: `Exited (0)` is its normal state. If it exits
with another code, the app does not start on `docker compose up`; its log
says why (a schema that existing data does not match, an unreachable
backend).

Disk to watch: the `postgres-data` and `convex-data` volumes grow with the
maps and their history.
