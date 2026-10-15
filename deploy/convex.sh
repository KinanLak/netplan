#!/usr/bin/env bash
# Runs the Convex CLI against a self-hosted backend, e.g.
#   docker compose run --rm --entrypoint ./deploy/convex.sh convex-deploy export --path /backups/x.zip
#
# The admin key is CONVEX_SELF_HOSTED_ADMIN_KEY when given, otherwise derived
# from the backend's INSTANCE_NAME and INSTANCE_SECRET.
set -euo pipefail

: "${CONVEX_SELF_HOSTED_URL:?CONVEX_SELF_HOSTED_URL is required}"
if [[ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]]; then
  : "${INSTANCE_NAME:?INSTANCE_NAME or CONVEX_SELF_HOSTED_ADMIN_KEY is required}"
  : "${INSTANCE_SECRET:?INSTANCE_SECRET or CONVEX_SELF_HOSTED_ADMIN_KEY is required}"
  CONVEX_SELF_HOSTED_ADMIN_KEY="$(/convex/generate_key "$INSTANCE_NAME" "$INSTANCE_SECRET" 2>/dev/null)" || true
  # generate_key fails silently on a malformed secret.
  : "${CONVEX_SELF_HOSTED_ADMIN_KEY:?no admin key: INSTANCE_SECRET must be hex, e.g. openssl rand -hex 32}"
fi
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

exec node /netplan/node_modules/convex/bin/main.js "$@"
