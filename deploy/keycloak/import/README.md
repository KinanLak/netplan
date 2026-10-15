# Keycloak realms

Every `*.json` realm export in this directory is imported when the `local`
profile's Keycloak starts (`start-dev --import-realm`); a realm that already
exists is skipped. Rebuild the image after changing one:
`docker compose up -d --build keycloak`.
