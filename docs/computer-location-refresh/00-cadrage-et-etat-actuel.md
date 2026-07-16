# Phase 0 - Cadrage et état actuel

## Objectif

Établir une compréhension commune du comportement actuel avant de modifier le modèle ou l'interface. Cette phase évite de construire le scheduler sur des hypothèses fausses concernant LibreNMS, NetBox ou la carte.

## Architecture actuelle

Le pipeline actuel est piloté par `scripts/sync-integrations.ts` :

```text
Processus Bun externe
  -> marque NetBox et LibreNMS en synchronisation
  -> télécharge tout NetBox
  -> télécharge devices, ports, FDB et LLDP LibreNMS
  -> résout les connexions
  -> remplace les deux snapshots dans une mutation Convex atomique
```

Les responsabilités principales sont réparties ainsi :

- `convex/netbox.ts` télécharge et transforme NetBox.
- `convex/librenms.ts` télécharge LibreNMS.
- `convex/topology.ts` résout MAC, switch, port et prise.
- `convex/connector.ts` protège et publie le snapshot combiné.
- `convex/netboxModel.ts` et `convex/librenmsModel.ts` remplacent les données.
- `convex/schema.ts` contient uniquement l'état courant des intégrations.
- `src/integrations/netbox/` affiche l'inventaire et les relations découvertes.

## Ce qui fonctionne déjà

- Authentification du connecteur par secret serveur.
- Timeouts HTTP par requête.
- Pagination NetBox.
- Normalisation des MAC, ports Cisco et noms de switches.
- Résolution des liens physiques directs NetBox.
- Remplacement atomique NetBox + LibreNMS.
- Conservation de l'ancien snapshot lorsque le cycle échoue avant publication.
- Protection par `syncId` contre un push ancien après un nouveau cycle.
- Tests de rollback transactionnel.

## Ce qui doit changer

### Cadences couplées

NetBox décrit un inventaire et un câblage relativement statiques. LibreNMS décrit une présence dynamique. Les synchroniser systématiquement ensemble oblige à télécharger les câbles NetBox, endpoint observé autour de huit secondes, pour chaque refresh de localisation.

La cible est :

```text
NetBox : toutes les 15 minutes
LibreNMS : toutes les 5 minutes en journée, toutes les heures hors plage
```

### Site codé en dur

`Arles` est codé en dur dans les modules Convex, le script et l'UI. Le plan doit utiliser l'identité de site déjà portée par Netplan sans lancer une refonte générale des cartes.

Le modèle cible reste simple. Netplan introduit une entité durable `site`, et chaque bâtiment possède un `siteId` :

- une carte appartient à un site par son bâtiment ;
- un site peut contenir plusieurs bâtiments ;
- un site possède une configuration d'intégration ;
- les jobs, snapshots, gardes de refresh et historiques sont isolés par site ;
- une instance LibreNMS partagée peut servir plusieurs sites ;
- les switches ciblés sont configurés par site.

### Pas de scheduler

Le dépôt ne contient actuellement ni `convex/crons.ts`, ni scheduler durable, ni rétention périodique. La nouvelle orchestration devra donc introduire ce pattern et ses tests.

### Fraîcheur FDB absente

LibreNMS met à jour `ports_fdb.updated_at` pour les MAC réellement vues et conserve les autres lignes jusqu'au nettoyage quotidien. Le resolver actuel accepte les deux catégories.

Le test réel a démontré :

```text
308 lignes après discovery
202 lignes rafraîchies par le discovery
106 lignes anciennes toujours présentes
```

La fraîcheur doit devenir un invariant du resolver, pas seulement une indication visuelle.

### Pas d'historique

Les tables actuelles sont des snapshots remplaçables. Elles ne peuvent pas répondre à :

- Quand ce poste a-t-il été vu pour la dernière fois ?
- Quand a-t-il changé de prise ?
- Pourquoi n'est-il pas positionné ?
- Quel switch a échoué ?
- Depuis combien de cycles est-il absent ?

### Pas de position cartographique automatique

Une `discoveredConnection` relie un ordinateur à une prise mais ne contient ni étage ni coordonnées. Aujourd'hui, l'UI peut placer une prise à côté d'un ordinateur, mais ne déplace pas l'ordinateur vers une prise autoritaire.

De plus, la base inspectée contient actuellement zéro prise placée. Le système doit donc accepter une couverture progressive :

- localisation réseau résolue mais prise non placée ;
- prise placée mais ordinateur hors ligne ;
- localisation complète et projetable sur la carte.

## Périmètre fonctionnel

### Inclus

- Trigger officiel LibreNMS par API pour chaque switch du site.
- Scheduler Convex.
- Refresh manuel partagé.
- Séparation NetBox et LibreNMS.
- Fraîcheur par cycle.
- Résolution actuelle et dernière position connue.
- Projection sur la carte lorsque la prise est placée.
- Historique et rétention.
- États UX détaillés.
- Architecture par site.
- Préparation des permissions futures sans implémenter le SSO.

### Non inclus

- Modification des switches.
- Écriture dans NetBox ou LibreNMS, à l'exception du trigger de discovery LibreNMS.
- Déduction automatique des 78 chemins de patch panel manquants.
- Terminal ou scraping de l'interface LibreNMS.
- Remplacement de LibreNMS par un collecteur SNMP maison.
- SSO complet dans cette livraison.
- Garantie de fraîcheur pendant une panne de LibreNMS, NetBox ou des switches.

## Terminologie à utiliser partout

| Terme                   | Définition                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------- |
| Cycle                   | Tentative complète de produire un snapshot de localisation pour un site            |
| Tentative switch        | Trigger et attente d'un discovery sur un switch                                    |
| Observation fraîche     | Ligne FDB confirmée par le discovery du cycle courant                              |
| Observation ancienne    | Ligne FDB conservée par LibreNMS mais non confirmée par le cycle courant           |
| Localisation résolue    | Association ordinateur -> prise validée par NetBox                                 |
| Position cartographique | Étage et coordonnées d'une prise placée dans Netplan                               |
| Snapshot valide         | Dernier ensemble publié atomiquement pour le site                                  |
| Périmé                  | Snapshot conservé mais plus assez récent pour être présenté comme actuel           |
| Hors ligne              | Aucune MAC de l'équipement vue pendant deux cycles frais consécutifs               |
| Résolu non placé        | Chaîne réseau complète jusqu'à une prise qui n'a pas encore de coordonnées Netplan |
| Non résolvable          | Observation présente mais chaîne NetBox ou inventaire incomplet                    |
| Ambigu                  | Plusieurs résultats équivalents ne peuvent pas être départagés de façon fiable     |

## Préconditions avant la phase 1

- Confirmer les identifiants LibreNMS des deux switches d'accès dans une configuration serveur.
- Créer l'identité durable du site Arles et associer les bâtiments existants à ce site.
- Confirmer le site NetBox externe associé au site Netplan.
- Documenter les variables d'environnement nécessaires sans leurs valeurs.
- Capturer la baseline de volumes dans un document ou un test de fixture.
- Conserver le test réel de trigger comme preuve opérationnelle, sans l'automatiser dans la suite locale.

## Critères d'acceptation

- Les termes ci-dessus sont utilisés dans les noms d'états et textes UX.
- L'agent sait expliquer séparément observation, résolution et placement.
- Le périmètre n'inclut aucune déduction de câblage non documentée.
- Les rythmes NetBox et LibreNMS sont traités comme deux workflows indépendants.
- Aucun développement de scheduler ne commence tant que l'identité de site n'est pas définie.
