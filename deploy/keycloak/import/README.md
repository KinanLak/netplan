# Keycloak realms

Every `*.json` realm export in this directory is imported when the `local`
profile's Keycloak starts (`start-dev --import-realm`); a realm that already
exists is skipped. Rebuild the image after changing one:
`docker compose up -d --build keycloak`.

`netplan-realm.json` is for evaluation and tests only: its client secret and
passwords are public. Its client `netplan` accepts the default compose URL
and any `127.0.0.1` or `localhost` port. Its users all have the password
`netplan-dev`:

| User         | Realm roles                       | Netplan role once mapped                                                               |
| ------------ | --------------------------------- | -------------------------------------------------------------------------------------- |
| `kc.lecteur` | none                              | Lecteur                                                                                |
| `kc.editeur` | `netplan-editor`                  | Éditeur                                                                                |
| `kc.admin`   | `netplan-admin`, `netplan-editor` | Admin                                                                                  |
| `kc.doublon` | none                              | refused while a local account has its email (`editeur@netplan.test`, a seeded account) |

Every user also holds `default-roles-netplan`, which carries
`offline_access`: Netplan asks for it to read roles again every hour (ADR
0036), and a realm import that lists a user's roles without it leaves that
user unable to sign in.

Map `netplan-editor` and `netplan-admin` on Netplan's users page.
