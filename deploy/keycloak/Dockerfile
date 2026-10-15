# Keycloak for the compose profile `local`, with the realms in import/ baked
# in: a bind mount would need them readable by the container's user.
FROM quay.io/keycloak/keycloak:26.8.1
COPY --chown=keycloak:root --chmod=u=rwX,g=rX,o= import/ /opt/keycloak/data/import/
