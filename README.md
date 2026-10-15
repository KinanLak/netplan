# Netplan

Netplan is a collaborative map of buildings for network teams. You draw floors
and walls, place racks, switches, wall sockets and PCs, and connect them with
cables. Netplan can then read NetBox and LibreNMS to show where each PC was
last seen on the network. Several people can edit the same floor at once. The
interface is in French.

> Netplan is being rebuilt to be fully self-hosted, with accounts and roles
> and a tool-agnostic inventory. See
> [`docs/architecture/target.md`](docs/architecture/target.md) for where it is
> heading and [`docs/adr/`](docs/adr/index.md) for why.

## Development

Requirements: [Bun](https://bun.sh) and Docker.

```sh
bun install
bun run dev:agent   # local Convex backend in Docker, demo data, Vite
bun run check       # typecheck, lint, format, tests
```

`bun run dev:agent` prints the app's URL once it is ready. Each checkout gets
its own backend and ports, so several can run side by side.

## Running it

```sh
cd deploy
cp .env.example .env   # then fill in the secrets
docker compose up -d --build --wait
```

[`docs/operations/`](docs/operations/index.md) covers installation,
configuration, upgrades, backups and monitoring.

## Documentation

- [`AGENTS.md`](AGENTS.md): how to work in this repository, for people and
  coding agents alike.
- [`docs/adr/`](docs/adr/index.md): the decisions that shape the product.
- [`docs/architecture/`](docs/architecture/index.md): how it is built today
  and the target.
- [`docs/operations/`](docs/operations/index.md): running an installation.
- [`docs/history/`](docs/history/index.md): frozen records, including the
  decision log of the rebuild.
