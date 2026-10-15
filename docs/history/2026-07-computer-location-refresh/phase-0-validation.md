# Validation de la phase 0

## Statut

Validation réalisée le 17 juillet 2026 à partir du dépôt, du déploiement Convex configuré et des API NetBox et LibreNMS en lecture seule.

Cette page fige les décisions nécessaires à la phase 1. Les valeurs observées sont une baseline datée, pas des constantes métier.

## Identité confirmée

| Élément                 | Valeur                      |
| ----------------------- | --------------------------- |
| Clé stable du site      | `arles`                     |
| Nom d'affichage         | `Arles`                     |
| Fuseau                  | `Europe/Paris`              |
| Clé d'instance NetBox   | `netbox-main`               |
| Clé d'instance LibreNMS | `librenms-main`             |
| Site NetBox             | ID `1`, slug `arles`, actif |

Le bâtiment Convex actuel `building:default` et ses étages sont des données jetables. La phase 1 ne doit pas les migrer comme carte autoritaire d'Arles. Elle peut reconstruire le bâtiment et les étages avec leurs identités canoniques.

## Switches du site

LibreNMS contient quatre switches actifs à l'adresse du site d'Arles :

| Rôle  | Device ID | Hostname LibreNMS                       | `sysName`                  | Matériel           |
| ----- | --------- | --------------------------------------- | -------------------------- | ------------------ |
| Accès | `4`       | `access01-tnzpv-arles.cust.as49028.net` | `sw-access-01.as49028.net` | `WS-C3750X-48PF-S` |
| Accès | `5`       | `access02-tnzpv-arles.cust.as49028.net` | `sw-access-02.as49028.net` | `WS-C3750X-48PF-S` |
| Core  | `2`       | `core01-tnzpv-arles.cust.as49028.net`   | `sw-core-01`               | `N3K-C3064PQ-10GX` |
| Core  | `3`       | `core02-tnzpv-arles.cust.as49028.net`   | `sw-core-02`               | `N3K-C3064PQ-10GX` |

Les quatre équipements appartiennent au site. La cible du refresh de localisation reste cependant limitée aux deux switches d'accès logiques `4` et `5` : ce sont les seuls qui terminent les 134 chemins directs `Switch Access <-> Wall Socket` dans le snapshot NetBox actuel.

Correspondance avec les membres de stack NetBox :

| Switch logique | Membres NetBox                                                   | Liaisons directes |
| -------------- | ---------------------------------------------------------------- | ----------------- |
| LibreNMS `4`   | `device:534` (`sw-access-01-1`), `device:533` (`sw-access-01-2`) | 29 + 37 = 66      |
| LibreNMS `5`   | `device:703` (`sw-access-02-1`), `device:704` (`sw-access-02-2`) | 35 + 33 = 68      |
| Cores `2`, `3` | `device:987`, `device:988`                                       | 0                 |

La configuration de phase 1 doit donc distinguer les switches présents sur le site des switches ciblés par le discovery de localisation. Elle ne doit ni déduire la liste depuis un préfixe de hostname, ni déclencher les cores par défaut.

## Baseline datée

### Snapshot Convex publié

Le dernier snapshot inspecté a été capturé le 11 juillet 2026 vers 04h36, heure de Paris, avec NetBox `4.1.11`.

| Mesure                          | Valeur |
| ------------------------------- | ------ |
| Inventaire NetBox total         | 432    |
| Ordinateurs                     | 184    |
| Prises murales                  | 238    |
| Switches                        | 6      |
| Racks                           | 4      |
| Connexions physiques directes   | 134    |
| Connexions PC-prise résolues    | 94     |
| Résolutions FDB                 | 80     |
| Résolutions FDB confirmées LLDP | 14     |
| Ordinateurs placés sur la carte | 7      |
| Prises placées sur la carte     | 0      |

Les sept ordinateurs placés sont sur `floor:default:rdc`. Puisque la carte actuelle est déclarée jetable, ils ne constituent pas une donnée à migrer en phase 1.

### FDB LibreNMS observée le 17 juillet 2026

| Device ID | Rôle  | Lignes FDB | Plus ancienne mise à jour | Plus récente mise à jour |
| --------- | ----- | ---------- | ------------------------- | ------------------------ |
| `2`       | Core  | 329        | 7 juillet 2026            | 16 juillet 2026          |
| `3`       | Core  | 322        | 7 juillet 2026            | 16 juillet 2026          |
| `4`       | Accès | 306        | 7 juillet 2026            | 16 juillet 2026          |
| `5`       | Accès | 293        | 7 juillet 2026            | 16 juillet 2026          |

Les deux switches d'accès totalisent 599 lignes, cohérentes avec l'ordre de grandeur de 600 relevé pendant l'audit. L'amplitude des timestamps confirme qu'une lecture FDB brute mélange des observations de plusieurs discoveries. Le filtre par tentative décrit en phase 3 est donc un invariant fonctionnel, pas une optimisation.

La baseline initiale de l'audit reste également valable pour les catégories qui ne sont pas matérialisées dans le snapshot actuel : 177 ordinateurs sans conflit MAC, 154 `workstation`, 24 `render`, 212 prises câblées, 78 chemins de patch panel incomplets et 26 prises sans câble.

## Architecture actuelle vérifiée

Le chemin actif est :

```text
scripts/sync-integrations.ts
  -> connector.beginArlesSync
  -> téléchargement NetBox complet
  -> téléchargement LibreNMS global
  -> résolution en mémoire par topology.ts
  -> connector.pushArlesSnapshot
  -> remplacement transactionnel des deux snapshots
```

Les protections déjà présentes sont conservées comme acquis : secret du connecteur, timeout HTTP, contrôle d'origine de la pagination NetBox, validation des références, unicité des IDs dans un payload, publication transactionnelle et rejet d'un `syncId` remplacé.

Les limites confirmées sont :

- `Arles` est codé en dur dans le connecteur, les modèles, les queries, le script et l'UI ;
- NetBox et LibreNMS partagent un cycle et un état de synchronisation ;
- les identités externes et les bindings de placement ne sont pas isolés par site ;
- un snapshot structurellement valide mais vide peut remplacer un snapshot sain ;
- le resolver accepte une FDB ancienne et remplace un timestamp absent ou invalide par l'heure de sync ;
- LLDP seul peut actuellement créer une connexion ;
- les ambiguïtés et raisons non résolvables sont perdues avant publication ;
- aucun scheduler, historique, compteur d'absence ou génération NetBox immuable n'existe ;
- les métadonnées NetBox sont copiées dans les devices placés et vieillissent ;
- le domaine de carte ne sait pas relocaliser atomiquement un device entre deux étages.

Ces écarts sont des entrées des phases 1 à 5. Ils ne doivent pas être corrigés isolément pendant la phase 0.

## Contrat d'environnement

Aucune valeur ni aucun token ne doit être ajouté au dépôt.

| Variable                   | Propriétaire              | Usage                                                        |
| -------------------------- | ------------------------- | ------------------------------------------------------------ |
| `VITE_CONVEX_URL`          | Navigateur                | URL publique du déploiement Convex                           |
| `CONVEX_URL`               | Connecteur externe        | URL Convex ; le script utilise `VITE_CONVEX_URL` en fallback |
| `NETPLAN_CONNECTOR_SECRET` | Connecteur et Convex      | Authentification temporaire du connecteur externe            |
| `NETPLAN_SITE_KEY`         | Connecteur externe        | Clé du site à synchroniser ; `arles` par défaut              |
| `NETBOX_URL`               | Convex / outil de secours | URL serveur de l'instance `netbox-main`                      |
| `NETBOX_TOKEN`             | Convex / outil de secours | Token NetBox serveur                                         |
| `LIBRENMS_URL`             | Convex / outil de secours | URL API de l'instance `librenms-main`                        |
| `LIBRENMS_TOKEN`           | Convex / outil de secours | Token LibreNMS serveur                                       |

Les clés `arles`, `netbox-main` et `librenms-main`, le site NetBox `1` et les IDs LibreNMS ciblés ne sont pas des secrets. Ils appartiendront à la configuration durable du site en phase 1. Les tokens restent exclusivement dans l'environnement serveur.

## Niveaux de vérité retenus

- **Observé** : une MAC a été vue sur un port pendant le discovery de la tentative courante.
- **Résolu** : cette observation mène à une prise par un chemin NetBox complet et explicite.
- **Positionné** : la prise résolue possède une position sur un étage Netplan.

Un niveau ne prouve jamais le suivant. En particulier, les 94 connexions actuelles sont des résolutions produites par le resolver existant ; elles ne constituent pas encore 94 positions actuelles fiables, car le filtre de fraîcheur par tentative n'existe pas et aucune prise n'est placée.

## Sortie de phase

- [x] Vocabulaire et chaîne d'autorité confirmés.
- [x] Périmètre et exclusions confirmés.
- [x] Workflows NetBox et localisation reconnus comme indépendants dans la cible.
- [x] Identité stable du site et des instances confirmée.
- [x] Site NetBox confirmé.
- [x] Tous les switches d'Arles recensés et cibles de localisation distinguées.
- [x] Mapping de la carte actuelle décidé : données jetables, pas de migration.
- [x] Baseline de volumes capturée et datée.
- [x] Contrat des variables d'environnement documenté sans valeur.
- [x] Preuve opérationnelle du trigger conservée séparément.

La phase 1 peut créer l'identité durable `site`, reconstruire les bâtiments et introduire les clés composites. Aucun scheduler ne doit être développé avant cette fondation.
