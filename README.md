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

Requirements: [Bun](https://bun.sh) and, for a local backend, Docker.

```sh
bun install
bun run dev      # Convex dev deployment + Vite
bun run check    # typecheck, lint, format, tests
```

`bun run dev` needs a Convex deployment configured in `.env.local`.

## Documentation

- [`AGENTS.md`](AGENTS.md): how to work in this repository, for people and
  coding agents alike.
- [`docs/adr/`](docs/adr/index.md): the decisions that shape the product.
- [`docs/architecture/`](docs/architecture/index.md): how it is built today
  and the target.
- [`docs/history/`](docs/history/index.md): frozen records, including the
  decision log of the rebuild.
