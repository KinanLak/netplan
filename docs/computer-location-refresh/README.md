# Plan complet de localisation automatique des ordinateurs

## Statut

Ce dossier est le plan de référence pour implémenter la localisation des ordinateurs à partir de NetBox et LibreNMS.

Il est destiné à un agent d'implémentation. Il décrit le produit attendu, les invariants, les étapes, les critères d'acceptation, les scénarios d'erreur et les points de contrôle. Il ne remplace pas les tests ni les règles de `AGENTS.md`.

## But

Netplan doit pouvoir répondre de manière rapide et fiable à la question suivante :

> Sur quelle prise réseau et à quel endroit du plan se trouve actuellement cet ordinateur ?

La chaîne d'autorité est :

```text
MAC de l'ordinateur
  -> table FDB du switch dans LibreNMS
  -> port du switch
  -> câble physique documenté dans NetBox
  -> prise murale
  -> prise placée dans Netplan
  -> position de l'ordinateur sur la carte
```

Chaque maillon doit rester explicite. Le système ne doit jamais inventer un câble, une prise ou une position pour masquer une donnée manquante.

## Pourquoi ce projet est nécessaire

Le système actuel sait importer l'inventaire NetBox et résoudre certaines observations LibreNMS, mais il présente plusieurs limites :

- La FDB LibreNMS est normalement redécouverte toutes les six heures.
- Le snapshot Netplan peut rester ancien si le connecteur externe n'est pas exécuté.
- LibreNMS conserve des entrées FDB anciennes pendant environ dix jours.
- Le resolver actuel ne filtre pas ces entrées anciennes.
- NetBox et LibreNMS sont synchronisés dans un seul gros cycle alors que leurs cadences sont différentes.
- L'état de synchronisation ne conserve que le dernier cycle.
- Il n'existe ni scheduler Convex, ni historique de localisation, ni refresh utilisateur.
- Une observation réseau n'entraîne pas encore une localisation durable sur le plan.

## Résultats de l'audit de départ

Les nombres suivants servent de baseline et non de constantes métier :

- 184 ordinateurs ciblés dans NetBox.
- 177 ordinateurs identifiables sans conflit d'inventaire par leur MAC.
- 154 `workstation`, chacun avec au maximum une MAC.
- 24 équipements `render`, chacun avec deux ou trois MAC.
- 238 prises murales.
- 212 prises avec un câble NetBox.
- 134 liaisons directes `Switch Access <-> Wall Socket` utilisables par le resolver.
- 78 liaisons `Patch Panel <-> Wall Socket` sans chemin documenté jusqu'au switch.
- 26 prises sans câble.
- Deux switches d'accès logiques dans LibreNMS.
- Environ 600 entrées FDB sur les switches d'accès.
- Un discovery complet observé en 42 à 50 secondes par switch.
- Un trigger API validé en production sur un switch.
- 202 lignes FDB réellement rafraîchies lors du test, alors que 106 anciennes lignes sont restées présentes.
- 16 workers de discovery, aucun job en attente pendant l'audit.
- Aucune prise et aucun ordinateur d'inventaire actuellement placé dans la base Convex inspectée.

## Décisions produit confirmées

### Cadence

- Cycle automatique toutes les cinq minutes entre 07h00 et 20h00, fuseau `Europe/Paris`.
- Cycle automatique toutes les heures la nuit, les week-ends et les jours fériés.
- Le cycle est calculé depuis la dernière tentative, pas depuis le dernier succès.
- Un cycle déjà actif empêche le lancement du suivant.
- Le refresh manuel peut traverser le backoff automatique, mais ne déclenche rien tant qu'un switch est `uncertain` ou `blocked`.

Cette cadence vise une fraîcheur proche de cinq minutes en fonctionnement nominal. Ce n'est pas une garantie mathématique stricte inférieure à cinq minutes : le discovery lui-même prend environ une minute et les pannes peuvent prolonger le délai.

### Déclenchement et concurrence

- Les deux switches sont déclenchés en parallèle.
- Tous les utilisateurs partagent le même job par site.
- Un seul job Netplan peut être actif par site.
- Un snapshot de moins de deux minutes déclenche une confirmation avant un nouveau refresh manuel.
- La fenêtre de deux minutes est une garde de confirmation, pas un blocage absolu après confirmation.
- La publication du résultat est atomique pour le site : tout ou rien.
- Si un seul switch échoue, le retry concerne uniquement ce switch.
- Chaque tentative dispose d'un timeout de deux minutes.
- Après les retries, le backoff est de 4, 8, 16 puis 30 minutes.
- Le backoff ne rend jamais le planning plus rapide : la prochaine exécution est le maximum entre l'échéance nominale et la fin d'échec augmentée du backoff.

### Données et historique

- NetBox est synchronisé toutes les quinze minutes.
- Un câblage NetBox précédemment valide peut être utilisé silencieusement pendant 24 heures après un échec.
- Après 24 heures, il reste utilisable, mais l'UI et l'historique affichent un avertissement persistant.
- Les cycles et résultats par switch sont conservés pendant 30 jours.
- Les statistiques FDB sont conservées pour chaque cycle.
- Un snapshot détaillé des observations MAC est conservé à 08h, 12h, 14h, 16h et 19h, à partir du cycle frais le plus proche.
- Aucun appel FDB passif supplémentaire n'est nécessaire entre les cycles actifs.

### Localisation

- Une absence pendant deux cycles frais fait passer le poste à `hors ligne`.
- La dernière position reste visible en atténué pendant 15 jours.
- Après 15 jours, le poste quitte la carte et rejoint une section `Hors ligne`.
- Une ancienne observation ne peut jamais redevenir une position actuelle.
- Seul un cycle complet, validé et publié pour les deux switches peut incrémenter l'absence ou modifier l'état en ligne/hors ligne.
- En cas de plusieurs prises également fraîches, la position précédente est conservée uniquement si elle reste candidate.
- Pour deux postes frais sur une même prise, la transition Netplan absent -> présent la plus récente est prioritaire ; une égalité reste un conflit explicite.
- Les MAC multiples d'un équipement `render` sont fusionnées au niveau de l'équipement.

### UX

- Le refresh est accessible depuis la barre de carte, le panneau d'inventaire, le panneau ordinateur et l'administration.
- Pendant le refresh, l'ancienne position reste visible.
- La barre du bouton représente une progression interpolée sur 60 secondes.
- Le détail par switch est disponible dans une vue dépliable.
- Un refresh manuel réussi transforme le bouton en succès pendant 15 secondes et affiche un toast.
- Les cycles automatiques réussis sont silencieux.
- Les erreurs automatiques commencent par un indicateur discret puis deviennent une bannière persistante.
- L'âge est masqué lorsque la donnée est fraîche, visible simplement au survol et toujours visible dans les détails.

## Distinction indispensable : observé, résolu et positionné

Le plan doit conserver trois niveaux séparés :

1. **Observé** : LibreNMS a vu une MAC sur un port pendant le dernier discovery.
2. **Résolu** : le port correspond à une prise par un chemin NetBox valide.
3. **Positionné** : cette prise possède une position sur une carte Netplan.

Exemple :

```text
MAC vue sur Gi1/0/12
  -> observation valide
Gi1/0/12 relié à Wall Socket 042
  -> localisation réseau résolue
Wall Socket 042 non placée dans Netplan
  -> ordinateur non positionnable sur la carte
```

Le produit doit afficher la raison exacte du dernier niveau atteint.

## Principes non négociables

- Convex possède l'état durable partagé.
- Zustand reste réservé à l'état d'interface éphémère.
- Les secrets LibreNMS et NetBox ne sont jamais transmis au navigateur.
- Les changements durables de carte utilisent le domaine `MapOperation` et ses validations.
- Un cycle épingle une génération NetBox immuable et l'utilise jusqu'à sa publication ou son échec.
- Le résultat brut de chaque switch est figé dès que ce switch réussit.
- Un retry ne redéclenche jamais un switch tant que sa tentative précédente est active ou incertaine.
- Le serveur est autoritaire pour la concurrence, les timestamps, la fraîcheur et les transitions d'état.
- Une réponse vide, partielle ou incohérente d'une source ne doit pas effacer un snapshot sain.
- Les données anciennes restent consultables comme historique mais ne sont pas présentées comme actuelles.
- Chaque phase ajoute ses tests et se termine par `bun run check` vert.

## Ordre d'exécution

| Phase | Document                                                                         | Résultat principal                                             |
| ----- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0     | [00-cadrage-et-etat-actuel.md](./00-cadrage-et-etat-actuel.md)                   | Compréhension partagée et critères mesurables                  |
| 1     | [01-fondations-sites-et-donnees.md](./01-fondations-sites-et-donnees.md)         | Modèle durable par site et séparation des sources              |
| 2     | [02-orchestration-des-refreshs.md](./02-orchestration-des-refreshs.md)           | Scheduler, trigger API, concurrence, retry et backoff          |
| 3     | [03-resolution-et-projection-carte.md](./03-resolution-et-projection-carte.md)   | Résolution fraîche, états hors ligne et placement sur la carte |
| 4     | [04-historique-et-retention.md](./04-historique-et-retention.md)                 | Audit 30 jours, snapshots MAC et nettoyage borné               |
| 5     | [05-experience-utilisateur.md](./05-experience-utilisateur.md)                   | Boutons, progression, détails, erreurs et accessibilité        |
| 6     | [06-exploitation-et-securite.md](./06-exploitation-et-securite.md)               | Secrets, supervision, incidents et charge réseau               |
| 7     | [07-tests-deploiement-et-validation.md](./07-tests-deploiement-et-validation.md) | Couverture, rollout et preuve de bon fonctionnement            |

Les phases sont ordonnées. Une phase peut préparer la suivante, mais elle ne doit pas exposer une fonctionnalité utilisateur reposant sur des invariants non encore implémentés.

## Définition globale de terminé

Le projet est terminé lorsque :

- Un cycle automatique fonctionne selon les horaires décidés.
- Un utilisateur peut demander un refresh partagé depuis chaque surface prévue.
- Les deux switches sont déclenchés et suivis sans chevauchement.
- Seules les lignes FDB du nouveau cycle peuvent produire une position actuelle.
- Un échec d'une source ne détruit jamais le dernier snapshot valide.
- Les états `frais`, `en cours`, `périmé`, `hors ligne`, `ambigu` et `non résolvable` sont cohérents entre backend et UI.
- La position réseau est distinguée de la position cartographique.
- Les ordinateurs positionnables suivent leur prise selon les règles de carte.
- Les prises non placées et les chemins NetBox incomplets sont explicitement signalés.
- L'historique et sa rétention sont bornés et vérifiés.
- Les secrets restent côté serveur.
- Les erreurs et backoffs sont observables.
- Les tests couvrent les scénarios nominaux et les pannes.
- `bun run check` et le build sont verts.
- Un smoke test réel confirme le workflow sur les deux switches.
