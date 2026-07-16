# Phase 1 - Fondations sites et données

## Objectif

Créer un modèle durable capable de représenter plusieurs sites, des cycles indépendants NetBox et LibreNMS, la fraîcheur, l'historique opérationnel et l'état courant d'un ordinateur.

Cette phase ne déclenche encore aucun discovery automatique. Elle construit les invariants nécessaires aux phases suivantes.

## Principe de modélisation

Séparer cinq catégories de données :

1. Configuration du site et de ses sources.
2. Snapshot statique NetBox.
3. Snapshot brut du dernier cycle LibreNMS.
4. Localisation courante résolue par ordinateur.
5. Historique des cycles et snapshots archivés.

Ne pas surcharger une table unique avec tous ces usages.

## Identité du site

Le dépôt possède déjà des bâtiments et étages, mais pas de table `site` explicite. L'implémentation doit introduire une identité stable de site. Chaque bâtiment reçoit un `siteId` durable et chaque étage hérite du site de son bâtiment. Un site peut contenir plusieurs bâtiments.

Le premier site est Arles. Le modèle ne doit cependant pas encoder `Arles` dans les noms de fonctions ou les requêtes.

### Propriétés minimales d'un site

- Identifiant durable interne.
- Nom d'affichage.
- Clé de configuration stable.
- Fuseau, initialement `Europe/Paris`.
- Référence du site NetBox externe.
- Liste des devices LibreNMS ciblés.
- Horaires jour/nuit.
- État activé ou désactivé.

Les secrets restent en variables Convex. La base peut stocker des clés de référence vers ces variables, jamais les tokens eux-mêmes.

### Association carte-site

Le site est dérivé sans choix ambigu par la relation durable `floor -> building -> site`. Ajouter un type `SiteId` brandé côté UI/domaine et conserver les `_id` Convex dans `convex/`.

Contraintes :

- Un refresh déclenché depuis un étage affecte tout le site.
- Deux sites peuvent se rafraîchir en parallèle.
- Un même job est partagé par tous les utilisateurs du site.
- Les requêtes d'inventaire et de localisation doivent toujours être filtrées par site.
- La création d'un bâtiment exige un site explicite ou le site par défaut pendant la migration initiale.
- La suppression d'un site est refusée tant qu'il contient des bâtiments ou des données d'intégration.

## Identité externe composite

Les identifiants NetBox numériques peuvent se répéter entre déploiements ou sites. Les index et jointures ne doivent plus supposer que `device:123` est globalement unique.

La clé logique doit contenir au minimum :

```text
provider + site + externalId
```

Si plusieurs instances NetBox sont prévues à terme, inclure également une identité d'instance. Dans la cible décidée, LibreNMS est partagé, mais le site reste nécessaire pour filtrer les switches et isoler les jobs.

## États durables à introduire

### État courant du refresh de site

Un document unique par site doit exposer :

- état `idle`, `running`, `success`, `error`, `backoff` ou `disabled` ;
- identifiant du cycle actif ;
- origine `scheduled` ou `manual` ;
- heure de la tentative ;
- dernier succès ;
- prochain lancement prévu ;
- seuil de confirmation des snapshots récents ;
- niveau de backoff ;
- erreur publique générique ;
- référence au dernier snapshot publié ;
- progression de chaque switch ;
- version de configuration utilisée.

Cette donnée est la source réactive de l'UI. Elle ne doit pas être dupliquée dans Zustand.

### État d'une tentative switch

Pour chaque switch du cycle :

- identifiant externe du switch ;
- état `pending`, `triggered`, `refreshing`, `success`, `error`, `timeout`, `uncertain` ou `blocked` ;
- ancien `last_discovered` ;
- nouveau `last_discovered` ;
- nombre de tentatives ;
- début et fin ;
- durée ;
- nombre de lignes FDB fraîches ;
- code d'erreur interne et message public séparés.
- verrou durable par site et switch, indépendant de la durée de vie du cycle.

Le libellé UI reste `Actualisation en cours` entre trigger et fin, car l'API ne prouve pas si le job attend un worker ou s'exécute déjà.

### État du scheduler NetBox

Le workflow NetBox possède un état distinct par site :

- identifiant de tentative et lease ;
- état `idle`, `running`, `success`, `error` ou `backoff` ;
- dernier essai, dernier succès et prochain essai ;
- timeout global ;
- génération active ;
- erreur publique et détails privés ;
- âge de la génération active ;
- niveau de retry/backoff si une politique de retry est retenue.

Une échéance NetBox est sautée si un cycle NetBox est déjà actif. Un cycle abandonné perd le droit de publier et peut être repris par une nouvelle tentative.

### Localisation courante d'un ordinateur

Créer un état durable par ordinateur et par site contenant :

- identité NetBox de l'ordinateur ;
- MAC ayant conduit à la décision ;
- prise, switch et port retenus ;
- état `online`, `resolved_unplaced`, `missing`, `offline`, `ambiguous`, `unresolvable` ou `socket_conflict` ;
- raison précise si non résolvable ;
- premier et dernier cycle de présence ;
- nombre de cycles consécutifs absents ;
- dernière position confirmée ;
- fraîcheur de l'observation ;
- dernière position cartographique connue si elle existe ;
- date d'expiration visuelle à 15 jours.

Le document doit permettre de conserver une dernière position sans présenter une observation ancienne comme actuelle.

Signification stricte :

- `resolved_unplaced` : chaîne réseau complète jusqu'à une prise qui n'a pas encore de coordonnées Netplan ;
- `unresolvable` : chaîne réseau ou inventaire incomplet ;
- `ambiguous` : un équipement possède plusieurs prises candidates équivalentes ;
- `socket_conflict` : plusieurs équipements revendiquent la même prise sans victoire fiable.

### Historique de cycle

Un cycle terminé devient immuable et contient :

- horaires et origine ;
- résultat global ;
- résultats des switches ;
- compteurs de résolution ;
- statistiques d'erreurs ;
- référence au snapshot détaillé éventuel ;
- informations de retry et backoff.

### Événements de localisation

Le schéma de cette phase inclut les événements immuables nécessaires dès la phase de résolution : apparition, déplacement, disparition, passage hors ligne, retour, ambiguïté et expiration. La phase 4 ajoutera leurs queries, snapshots planifiés et nettoyage, mais la phase 3 doit déjà pouvoir écrire ces événements atomiquement avec la décision de localisation.

## Générations NetBox immuables

Le remplacement en place actuel n'est pas suffisant. Une localisation doit continuer à lire exactement le câblage qu'elle a épinglé, même si un nouveau sync NetBox termine pendant le discovery LibreNMS.

Le workflow NetBox utilise un modèle copy-on-write :

1. Écrire une nouvelle génération complète sans toucher à la génération active.
2. Valider cette génération.
3. Basculer atomiquement le pointeur actif du site.
4. Garder les anciennes générations tant qu'un cycle actif les référence, puis pendant une marge de sécurité d'une heure.
5. Matérialiser dans le résultat publié les preuves de câblage nécessaires à l'audit.
6. Supprimer ensuite le contenu de génération par la politique de rétention, tout en gardant ses métadonnées 30 jours.

Au démarrage, un cycle de localisation épingle l'identifiant de la génération NetBox active. Toutes ses résolutions lisent uniquement les lignes de cette génération.

Conserver toutes les générations complètes pendant 30 jours multiplierait inutilement le volume NetBox. L'historique garde donc l'identifiant de génération et les endpoints de câble effectivement utilisés pour chaque décision archivée. Les contenus complets restent temporaires ; les métadonnées de génération restent 30 jours.

## Séparer NetBox et LibreNMS

Le modèle actuel `integrationSyncs` couple les providers. La cible doit permettre :

- un cycle NetBox toutes les quinze minutes ;
- un cycle de localisation indépendant ;
- un échec NetBox sans empêcher immédiatement LibreNMS d'utiliser le dernier câblage valide ;
- un avertissement après 24 heures sans succès NetBox ;
- un snapshot de localisation atomique construit avec une version identifiée du snapshot NetBox.

Chaque snapshot NetBox valide doit posséder un identifiant ou une génération. Le cycle de localisation enregistre la génération utilisée. Cela permet d'expliquer ultérieurement une position calculée avec un ancien câblage.

Après 24 heures sans succès NetBox, cette génération reste utilisable mais devient explicitement `warning`. Toute localisation publiée enregistre cet âge et l'UI affiche un avertissement. Il n'y a pas de blocage automatique au seuil de 24 heures dans la première livraison.

## Binding unique des objets placés

Le serveur doit empêcher deux placements du même objet externe, y compris lors d'une course entre placement manuel et projection automatique.

Introduire une identité de placement unique par :

```text
provider + instance/site + externalId
```

La réservation de cette identité et la création ou relocation du device ont lieu dans la même transaction de domaine. Les scans frontend actuels par `externalId` ne sont pas une garantie suffisante.

## Protection contre les snapshots destructifs

Avant de remplacer un snapshot sain :

- valider que la réponse source contient les collections attendues ;
- vérifier l'identité du site ;
- refuser les doublons de clés externes ;
- appliquer des seuils de cohérence par rapport au dernier snapshot ;
- distinguer une vraie collection vide d'une réponse partielle ;
- ne jamais publier un cycle incomplet sous l'état `success`.

Les seuils ne doivent pas bloquer un changement légitime. Ils servent à transformer une chute brutale et inexpliquée en erreur opérable plutôt qu'en suppression massive.

Exemples :

- 238 prises deviennent zéro sans changement de configuration : échec.
- Un switch attendu disparaît de la réponse LibreNMS : échec du cycle.
- Une MAC n'est plus vue dans un discovery réussi : absence valide, pas erreur source.

## Migration canonique

Le produit n'est pas encore publié. Préférer une migration vers le nouveau modèle plutôt qu'une couche permanente de compatibilité Arles.

Ordre recommandé :

1. Introduire le site et les nouveaux index.
2. Rendre les fonctions existantes paramétrables par site.
3. Migrer ou reconstruire les snapshots actuels.
4. Retirer les constantes et fonctions nommées `Arles`.
5. Garder temporairement le connecteur externe uniquement comme outil de secours jusqu'à validation du scheduler Convex.
6. Le supprimer ou le réduire à un outil opérationnel explicite après rollout.

## Fichiers probablement concernés

- `convex/schema.ts`
- `convex/connector.ts`
- `convex/netbox.ts`
- `convex/netboxModel.ts`
- `convex/librenms.ts`
- `convex/librenmsModel.ts`
- `convex/topology.ts`
- `convex/buildings.ts`
- `convex/floors.ts`
- `src/types/map.ts`
- `convex/_test/modules.ts`

De nouveaux modules dédiés au site, aux cycles et aux localisations sont préférables à l'accumulation de responsabilités dans `connector.ts`.

## Tests obligatoires

- Isolation de deux sites ayant des external IDs identiques.
- Unicité logique de l'état courant par site.
- Refus d'un payload contenant un autre site.
- Publication associée à une génération NetBox précise.
- Un cycle continue à lire sa génération épinglée pendant la publication concurrente d'une nouvelle génération NetBox.
- Bascule atomique du pointeur de génération active.
- Unicité serveur du placement d'un objet externe sur tous les étages du site.
- Conservation du dernier succès pendant un nouveau cycle et après erreur.
- Refus d'un snapshot vide ou fortement incomplet.
- Rejet d'un ancien cycle après le démarrage d'un plus récent.
- Récupération d'un cycle abandonné.
- Requêtes frontend strictement filtrées par site.

## Critères d'acceptation

- Aucun nom de fonction métier n'est spécifique à Arles.
- Toutes les clés externes sont isolées par site.
- NetBox et localisation ont des états et cadences séparés.
- L'UI peut connaître le dernier succès même après un échec récent.
- Le serveur peut expliquer quel snapshot NetBox a servi à une localisation.
- Un cycle ne peut jamais mélanger deux générations NetBox.
- Une réponse source anormale ne peut pas vider silencieusement les données.
- Les nouveaux modules sont enregistrés dans le harness Convex.
- `bun run check` est vert.
