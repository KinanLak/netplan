#!/usr/bin/env bash
# Deploys the Convex functions in this image to a self-hosted backend, then
# sets the Convex environment variables listed in convex-env.txt and creates
# the first admin. An unset or empty variable is left as it is on the
# deployment. convex.sh says where the admin key comes from.
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

# Sign-up is closed, so the first admin must exist before anyone can sign in.
# Does nothing once an admin exists, or while BOOTSTRAP_ADMIN_* is unset.
# Assigned first: inside echo's arguments a failure would not stop the script.
first_admin="$(./deploy/convex.sh run bootstrap:ensureFirstAdmin)"
echo "convex-deploy: first admin: $first_admin"

echo "convex-deploy: done"
