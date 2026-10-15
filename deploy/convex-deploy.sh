#!/usr/bin/env bash
# Deploys the Convex functions in this image to a self-hosted backend, then
# sets the Convex environment variables listed in convex-env.txt.
#
# The admin key is CONVEX_SELF_HOSTED_ADMIN_KEY when given, otherwise derived
# from the backend's INSTANCE_NAME and INSTANCE_SECRET.
set -euo pipefail

: "${CONVEX_SELF_HOSTED_URL:?CONVEX_SELF_HOSTED_URL is required}"
if [[ -z "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" ]]; then
  : "${INSTANCE_NAME:?INSTANCE_NAME or CONVEX_SELF_HOSTED_ADMIN_KEY is required}"
  : "${INSTANCE_SECRET:?INSTANCE_SECRET or CONVEX_SELF_HOSTED_ADMIN_KEY is required}"
  CONVEX_SELF_HOSTED_ADMIN_KEY="$(/convex/generate_key "$INSTANCE_NAME" "$INSTANCE_SECRET" 2>/dev/null)"
fi
export CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY

convex() { node node_modules/convex/bin/main.js "$@"; }

echo "convex-deploy: deploying functions to $CONVEX_SELF_HOSTED_URL"
convex deploy --yes --typecheck disable

while IFS= read -r name; do
  case "$name" in '' | '#'*) continue ;; esac
  if [[ -v "$name" ]]; then
    convex env set -- "$name" "${!name}" >/dev/null
    echo "convex-deploy: set $name"
  fi
done < deploy/convex-env.txt

echo "convex-deploy: done"
