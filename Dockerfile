# syntax=docker/dockerfile:1

# Two images from one build (ADR 0020):
# - `app` (default): the web server. Configured at runtime only.
# - `functions`: deploys the Convex functions to a backend, once per release.
#
# Keep BUN_VERSION equal to `packageManager` in package.json and
# CONVEX_BACKEND_IMAGE equal to scripts/lib/convexBackend.ts
# (scripts/lib/deploy.test.ts checks both).
ARG BUN_VERSION=1.4.2
ARG CONVEX_BACKEND_IMAGE=ghcr.io/convex/convex-backend:72ce13c379fe6dbdfc305bc8ad699c5663c68c2a

FROM oven/bun:${BUN_VERSION} AS deps
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:${BUN_VERSION} AS production-deps
WORKDIR /src
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production

# The backend image already carries Node and the admin key generator.
FROM ${CONVEX_BACKEND_IMAGE} AS functions
WORKDIR /netplan
COPY --from=production-deps /src/node_modules ./node_modules
COPY package.json convex.json tsconfig.json ./
COPY convex ./convex
COPY src ./src
COPY deploy/convex.sh deploy/convex-deploy.sh deploy/convex-env.txt ./deploy/
ENTRYPOINT ["./deploy/convex-deploy.sh"]

FROM oven/bun:${BUN_VERSION}-distroless AS app
WORKDIR /app
COPY --from=build /src/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
USER nonroot
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["run", ".output/server/index.mjs"]
