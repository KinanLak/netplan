# Phase 4 - Historique et rétention

## Objectif

Conserver assez d'information pour expliquer les mouvements et diagnostiquer les refreshs, sans enregistrer plusieurs millions de lignes inutiles.

## Deux historiques distincts

### Historique opérationnel des cycles

Conserver chaque cycle pendant 30 jours.

Contenu :

- site ;
- origine automatique ou manuelle ;
- horaires ;
- résultat global ;
- détail de chaque switch ;
- durée et nombre de tentatives ;
- timeout ou catégorie d'erreur ;
- niveau de backoff avant et après ;
- génération NetBox utilisée ;
- nombre total de lignes FDB ;
- nombre de lignes fraîches et anciennes ;
- ordinateurs vus, localisés, ambigus, non résolvables, manquants et hors ligne ;
- nombre de mouvements ;
- nombre de prises placées utilisables.

Cet historique répond à :

> Le système fonctionnait-il correctement à 14h ?

### Snapshots détaillés MAC

Conserver un snapshot détaillé cinq fois par jour :

- 08h00 ;
- 12h00 ;
- 14h00 ;
- 16h00 ;
- 19h00 ;
- fuseau `Europe/Paris`.

Ne pas déclencher de discovery supplémentaire. Créer cinq slots quotidiens par site. Chaque slot est finalisé dix minutes après son horaire :

- sélectionner le cycle réussi le plus proche dans la fenêtre `[horaire - 5 min, horaire + 10 min]` ;
- utiliser comme timestamp du cycle le maximum des deux nouveaux `last_discovered`, c'est-à-dire la fin de la fenêtre d'observation réseau, et non l'heure de réservation ou de publication ;
- en cas d'égalité, préférer le cycle antérieur à l'horaire ;
- si aucun cycle frais n'existe dans la fenêtre, enregistrer explicitement le slot `missing` ;
- ne jamais remplir plus tard un slot manquant avec une donnée très ancienne.

Le snapshot contient les observations nécessaires à l'audit :

- équipement ;
- MAC normalisée ou empreinte selon la politique de confidentialité ;
- switch et port ;
- prise résolue éventuelle ;
- état et raison ;
- timestamps source ;
- snapshot NetBox utilisé.

Cet historique répond à :

> Où ce poste était-il observé à 14h ?

## Historique des changements

En plus des snapshots planifiés, conserver des événements compacts pour les transitions importantes :

- première apparition ;
- changement de prise ;
- passage manquant ;
- passage hors ligne ;
- retour en ligne ;
- début ou fin d'ambiguïté ;
- passage non résolvable ;
- expiration après 15 jours.

Ces événements facilitent l'UI et évitent de comparer deux snapshots complets à chaque consultation.

## Rétention

### 30 jours

- cycles ;
- détails par switch ;
- statistiques ;
- snapshots MAC planifiés ;
- événements de localisation.
- métadonnées des générations NetBox et preuves de câblage matérialisées par ces cycles.

### État courant sans expiration

- dernier snapshot valide par site ;
- localisation courante par équipement ;
- dernière position connue nécessaire à la carte ;
- état de scheduler et backoff.

### Générations NetBox temporaires

- conserver la génération active ;
- conserver toute génération épinglée par un cycle actif ;
- conserver une génération désactivée pendant une marge d'une heure ;
- conserver 30 jours les métadonnées de génération et les preuves de câblage matérialisées, pas nécessairement toutes ses lignes d'inventaire et de câble.

### Après 15 jours hors ligne

- retirer la projection active de la carte ;
- garder l'équipement dans la section `Hors ligne` ;
- conserver dernière prise, dernière position et dernière détection ;
- ne pas supprimer l'équipement NetBox.

## Nettoyage

Introduire un job de nettoyage borné :

- utiliser des index par timestamp et site ;
- supprimer par petits lots ;
- planifier la continuation si d'autres lignes restent ;
- rendre chaque lot idempotent ;
- ne jamais scanner toute la table dans une seule mutation ;
- ne jamais supprimer l'état courant ;
- enregistrer les erreurs de nettoyage sans bloquer les refreshs.

Le batch exact doit être choisi après vérification des limites Convex de la version utilisée. Ne pas copier une limite supposée depuis un autre projet.

## Volumétrie attendue

Avec cinq snapshots par jour et environ 600 lignes FDB :

```text
5 x 30 x 600 = environ 90 000 observations détaillées sur 30 jours
```

Ce volume est très inférieur à un snapshot complet toutes les cinq minutes :

```text
12 x 24 x 30 x 600 = plus de 5 millions d'observations
```

Le modèle et les queries doivent néanmoins être paginés. Une interface ne doit pas charger les 90 000 lignes pour afficher un poste.

## Accès aux données

Les données publiques se limitent à la fraîcheur et aux agrégats. Les requêtes détaillées nécessitent une autorisation serveur ; elles ne sont pas exposées tant que le SSO n'est pas livré.

Prévoir des requêtes ciblées et autorisées :

- derniers cycles d'un site ;
- historique d'un ordinateur ;
- snapshot d'un horaire ;
- erreurs d'un switch ;
- mouvements sur une période ;
- liste des postes hors ligne ;
- statistiques agrégées.

Toutes les requêtes sont bornées et paginées.

## Confidentialité

Les MAC sont des identifiants techniques. Les snapshots historiques ne conservent pas la MAC en clair : ils utilisent `HMAC-SHA-256(site + MAC normalisée)`, produit avec un secret serveur et accompagné de la version de clé. La clé et les MAC brutes ne quittent jamais le serveur.

- ne pas les afficher dans les toasts ;
- éviter les logs applicatifs en clair ;
- réserver le détail aux vues techniques ;
- réserver ces vues aux utilisateurs autorisés une fois le SSO disponible ;
- ne jamais stocker les tokens dans l'historique ;
- ne pas conserver les réponses HTTP brutes.

## Tests obligatoires

- Sélection du cycle le plus proche de chaque horaire.
- Slot `missing` lorsqu'aucun cycle n'est disponible dans la fenêtre.
- Respect de `Europe/Paris`, heure d'été et heure d'hiver.
- Aucun discovery supplémentaire pour l'archivage.
- Rétention exacte à 30 jours.
- Nettoyage par lots et continuation.
- Préservation de l'état courant.
- Pagination des historiques.
- Événements de déplacement et hors ligne sans doublons.
- Isolation stricte des sites.
- Une relance de cleanup est idempotente.

## Critères d'acceptation

- Les cycles sont auditables pendant 30 jours.
- Les cinq slots quotidiens existent sans charge SNMP supplémentaire et indiquent explicitement une éventuelle absence de snapshot.
- L'historique d'un ordinateur est consultable sans scan global.
- Le stockage reste borné.
- Les postes expirés restent retrouvables dans `Hors ligne`.
- `bun run check` est vert.
