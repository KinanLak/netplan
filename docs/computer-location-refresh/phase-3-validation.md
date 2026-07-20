# Validation de la phase 3

Date de validation locale et distante : 20 juillet 2026.

## Portée livrée

- Les lignes FDB ne sont actuelles que si leur timestamp explicite appartient aux bornes du discovery réussi du switch.
- Les deux switches doivent fournir un résultat complet ; une réponse partielle ou incohérente met le cycle en échec avant toute transition d'absence.
- Une chute à zéro ou à 20 % du dernier volume frais déclenche une seconde lecture FDB ciblée du switch. Convex revalide les lignes et leur contenu, pas seulement leur nombre.
- LLDP peut confirmer une FDB fraîche, mais ne crée jamais seul une présence.
- Les diagnostics distinguent conflit MAC, port switch inconnu, switch non configuré, prise sans câble et chemin de patch panel incomplet.
- Les états durables couvrent `online`, `resolved_unplaced`, `missing`, `offline`, `ambiguous`, `unresolvable` et `socket_conflict`.
- Deux absences publiées consécutives produisent `offline`; un retour remet immédiatement le compteur à zéro.
- La projection cartographique utilise une opération système typée, atomique et séparée de l'undo utilisateur.
- La relocation conserve les liens sur un étage et bloque explicitement un changement d'étage avec liens durables.
- Le worker de projection possède lease, fencing, retries à 1, 5 et 30 minutes, sweep et remplacement par un cycle plus récent.
- Une position historique est atténuée. Après 15 jours hors ligne, la présentation est masquée sans supprimer le device, son binding ou ses liens.
- Les réponses publiques de carte et d'inventaire n'exposent pas les MAC.

## Validation automatisée

`bun run check` est vert avec 411 tests. La suite couvre notamment :

- fraîcheur avant/après trigger, discovery et temps serveur ;
- timestamps absents, invalides ou sans offset explicite ;
- tentative retry retenue et exclusion d'une observation d'une autre tentative ;
- confirmation FDB ciblée identique, divergente, partielle ou mal formée ;
- ambiguïté, conflit de prise stable et égalité sans gagnant arbitraire ;
- absence, retour, passage hors ligne et expiration à 15 jours ;
- création sans doublon, collision device/mur et tailles modifiées par l'utilisateur ;
- déplacement même étage et relocation inter-étages atomique ;
- blocage inter-étages avec liens, retries, lease expiré et cycle obsolète ;
- conservation des champs carte et jointure fraîche des champs NetBox à la lecture ;
- absence de MAC dans les queries publiques.

`bun run build` et `git diff --check` sont également verts. Le build signale uniquement la base Browserslist ancienne et la taille de certains chunks existants.

## Validation réelle

Le déploiement de développement `clean-leopard-363` a reçu le schéma et les fonctions avec `bunx convex dev --once`. Le scheduler et le timer local ont été neutralisés pendant le rollout.

La migration a conservé la lecture des anciens snapshots ne contenant pas encore les preuves FDB et les détails de terminaison NetBox. Toutes les nouvelles publications exigent les champs complets.

Deux cycles directs consécutifs ont réussi sur `site:arles` :

### Premier cycle

- génération NetBox : 433 équipements et 212 câbles ou segments de chemin ;
- snapshot localisation : `ba8fd06f-2bb1-433d-b57b-d4866861742a` ;
- 651 observations ;
- switch 4 : 136 lignes FDB fraîches ;
- switch 5 : 128 lignes FDB fraîches ;
- 21 ordinateurs résolus sur une prise ;
- 7 présences non résolvables avec une raison explicite ;
- 157 premières absences `missing` ;
- aucune ambiguïté.

### Deuxième cycle

- génération NetBox : 433 équipements et 212 câbles ou segments de chemin ;
- cycle localisation : `48208654-c2c1-4497-8d03-cecb8f1b96bd` ;
- 651 observations ;
- switch 4 : 153 lignes FDB fraîches ;
- switch 5 : 138 lignes FDB fraîches ;
- 22 ordinateurs `resolved_unplaced` ;
- 7 ordinateurs `unresolvable` ;
- 156 ordinateurs `offline` après deux absences validées ;
- aucune ambiguïté et aucun retry.

Les 91 liaisons de l'ancien snapshot passif sont devenues 21 puis 22 liaisons actuelles. Cette baisse est attendue : les lignes FDB conservées par LibreNMS mais non rafraîchies pendant le cycle ne sont plus autoritaires.

## Projection réelle

La carte de validation ne contient aucune prise NetBox placée. Les 22 ordinateurs résolus restent donc `resolved_unplaced`, sans coordonnée inventée, sans `computerProjection` et sans device automatique. C'est le comportement attendu pour ce jeu de données.

La création, les déplacements même étage et inter-étages, les collisions, les liens, les révisions et l'expiration sont validés par les tests purs et les tests transactionnels Convex. Un smoke de relocation réelle deviendra possible dès qu'une prise sera placée sur la carte.

## État d'exploitation

- `INTEGRATION_SCHEDULER_ENABLED=true` ;
- `INTEGRATION_MANUAL_REFRESH_ENABLED=false` ;
- `netplan-integration-agent.timer` actif et activé au démarrage ;
- le service local rejoint uniquement les workflows réservés et termine sans effet lorsqu'il n'y a aucun travail ;
- les URLs et tokens source restent uniquement dans l'environnement local.
