# Keycloak for the compose profile `local`, with the realms in import/ baked
# in: a bind mount would need them readable by the container's user.
FROM quay.io/keycloak/keycloak:26.8.1
COPY --chown=keycloak:root --chmod=u=rwX,g=rX,o= import/ /opt/keycloak/data/import/
# Compose cannot require KEYCLOAK_ADMIN_PASSWORD only for this profile: it
# interpolates every service, so the check runs here.
ENTRYPOINT ["/bin/sh", "-c", "test -n \"$KC_BOOTSTRAP_ADMIN_PASSWORD\" || { echo 'keycloak: set KEYCLOAK_ADMIN_PASSWORD in .env' >&2; exit 1; }; exec /opt/keycloak/bin/kc.sh \"$@\"", "kc.sh"]
