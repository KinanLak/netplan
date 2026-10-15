#!/usr/bin/env bash
# Deploys the Convex functions in this image to a self-hosted backend, then
# sets the Convex environment variables listed in convex-env.txt. An unset or
# empty variable is left as it is on the deployment. convex.sh says where the
# admin key comes from.
set -euo pipefail

: "${CONVEX_SELF_HOSTED_URL:?CONVEX_SELF_HOSTED_URL is required}"

echo "convex-deploy: deploying functions to $CONVEX_SELF_HOSTED_URL"
./deploy/convex.sh deploy --yes --typecheck disable

while IFS= read -r name; do
  case "$name" in '' | '#'*) continue ;; esac
  if [[ -n "${!name:-}" ]]; then
    ./deploy/convex.sh env set -- "$name" "${!name}"
  fi
done < deploy/convex-env.txt

echo "convex-deploy: done"
