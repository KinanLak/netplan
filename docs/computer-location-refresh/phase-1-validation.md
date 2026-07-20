# Validation de la phase 1

## Statut

La phase 1 introduit le modèle durable par site sans scheduler, trigger de discovery ni projection automatique. Ces comportements restent respectivement réservés aux phases 2 et 3.

## Fondations livrées

- Table `sites` avec identité stable, fuseau, horaires, références d'instances, site NetBox et inventaire complet des switches LibreNMS.
- Site initial `site:arles`, clé `arles`, NetBox `1/arles`, quatre switches LibreNMS et seulement les devices `4` et `5` ciblés pour la localisation.
- Relation obligatoire `building -> site`; un étage hérite toujours de son site par son bâtiment.
- Type domaine brandé `SiteId` et source externe identifiée par `siteId + provider + instanceKey + externalId`.
- Queries NetBox et LibreNMS obligatoirement filtrées par `siteId`.
- Suppression de toutes les constantes et fonctions métier nommées pour Arles dans le pipeline d'intégration.

## Workflows indépendants

NetBox et localisation possèdent chacun :

- un état courant réactif par site ;
- une tentative durable avec lease de deux minutes ;
- un fencing monotone ;
- une récupération qui marque la tentative expirée `abandoned` ;
- un dernier succès et un pointeur publié conservés pendant une nouvelle tentative ou après erreur ;
- une invalidation si la configuration du site change pendant le travail.

Un import NetBox ne modifie jamais l'état de localisation. Une tentative de localisation épingle atomiquement la génération NetBox active au démarrage.

## Générations et snapshots

Chaque import NetBox validé écrit en copy-on-write :

- une métadonnée `netboxGeneration` immuable ;
- son inventaire ;
- ses connexions physiques ;
- puis le pointeur actif dans la même mutation.

Les anciennes générations ne sont ni modifiées ni supprimées en phase 1. La rétention sera ajoutée en phase 4.

La publication refuse :

- un inventaire vide ;
- des IDs externes dupliqués ;
- un câble dont un endpoint manque ;
- une identité d'instance ou de site différente de la configuration ;
- une chute à 20 % ou moins de l'inventaire, des prises ou des connexions du dernier snapshot sain ;
- une collection NetBox absente ou mal formée.

Un snapshot de localisation référence toujours la génération épinglée. Il conserve les observations brutes, les résultats par switch et les liaisons de compatibilité nécessaires à l'UI actuelle. Les timestamps source absents restent absents dans les observations brutes.

## États préparés

Le schéma contient les fondations durables nécessaires aux phases suivantes :

- état par switch et verrou durable ;
- état courant d'un ordinateur et compteur d'absence ;
- statut de projection ;
- historique de cycle ;
- événements de localisation immuables.

La phase 1 n'écrit pas encore les décisions `online`, `missing`, `offline`, `ambiguous` ou `unresolvable`. Le resolver frais et leurs transitions appartiennent à la phase 3.

## Binding cartographique

`MapOperation` réserve désormais l'identité externe dans `externalObjectBindings` dans la même transaction que le device.

- Deux utilisateurs ne peuvent pas placer le même objet sur deux étages d'un site.
- Deux sites peuvent utiliser le même external ID sans conflit.
- Deux créations identiques dans un batch font échouer tout le batch.
- Un delete libère la réservation dans la même transaction.
- Une suppression d'étage ou de bâtiment nettoie également les bindings.
- Les queries d'inventaire lisent cette réservation autoritaire au lieu de scanner tous les devices.

La relocation inter-étages automatique reste hors phase 1. Elle sera une `MapOperation` dédiée en phase 3 et réutilisera la même réservation sans delete/recreate intermédiaire.

## Reconstruction initiale

La carte actuelle a été déclarée jetable pendant la phase 0. Elle ne doit pas recevoir artificiellement un `siteId`.

Avant le premier déploiement du schéma final, supprimer la carte de développement avec la version actuellement déployée :

```sh
bunx convex run buildings:clearMap '{}'
```

Après déploiement de la phase 1 :

```sh
bunx convex run sites:ensureDefault '{}'
bunx convex run buildings:createDefaultMap '{"siteId":"site:arles"}'
```

Les anciens snapshots couplés ne sont pas convertis en génération. Exécuter ensuite `scripts/sync-integrations.ts` pour produire une génération NetBox fraîche, puis un snapshot de localisation épinglé à cette génération.

## Validation

La suite couvre notamment :

- isolation de deux sites avec les mêmes external IDs ;
- unicité de l'état courant par site et workflow ;
- rejet d'un payload portant une autre identité de site ;
- publication copy-on-write et conservation du dernier succès ;
- génération NetBox épinglée pendant une publication concurrente ;
- rejet des snapshots vides ou fortement incomplets ;
- abandon, reprise et rejet d'un ancien worker ;
- unicité serveur des placements entre étages ;
- isolation des bindings entre sites ;
- atomicité des batches et nettoyage des bindings ;
- filtrage des queries frontend par site.

`bun run check` est vert avec 327 tests.
