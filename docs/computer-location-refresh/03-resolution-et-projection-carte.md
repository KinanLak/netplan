# Phase 3 - Résolution et projection sur la carte

## Objectif

Transformer uniquement les observations FDB du cycle courant en états de localisation fiables, puis projeter ces états sur la carte lorsque les prises correspondantes sont placées.

## Invariant de fraîcheur

Une ligne FDB n'est actuelle que si elle a été rafraîchie par le discovery du cycle.

La règle ne doit pas être un simple `âge < N minutes`, car :

- deux switches peuvent terminer à des heures différentes ;
- un cycle peut être retardé ;
- les horloges Convex et LibreNMS peuvent avoir un léger décalage ;
- une ligne ancienne peut rester moins vieille que le seuil arbitraire.

Le cycle mémorise l'ancien et le nouveau `last_discovered` de chaque tentative switch. Pour une entrée FDB de timestamp `updated_at`, la règle autoritaire est :

- `updated_at` doit être présent et parseable dans le fuseau renvoyé par LibreNMS ;
- `updated_at` est strictement postérieur à l'ancien `last_discovered` ;
- `updated_at` est inférieur ou égal au nouveau `last_discovered` plus 60 secondes de tolérance ;
- `updated_at` n'est pas futur par rapport au temps serveur LibreNMS observé ;
- la ligne appartient au switch et à la tentative réussie ;
- en l'absence d'ancien `last_discovered`, la borne basse est l'heure du trigger moins 60 secondes.

Une ligne sans timestamp valide est rejetée comme observation actuelle. Ne jamais remplacer un `updated_at` absent par l'heure de téléchargement.

Lors d'un retry, utiliser uniquement les bornes de la tentative qui a produit le résultat staged retenu.

## Pipeline de résolution

### 1. Construire l'inventaire des ordinateurs

- Normaliser les MAC NetBox.
- Refuser les MAC affectées à plusieurs équipements différents.
- Fusionner les MAC appartenant au même équipement.
- Conserver le rôle de l'équipement pour l'UX et les règles multi-interface.

### 2. Construire les chemins physiques NetBox

Cas résolvable :

```text
Switch Access <-> Wall Socket
```

Cas non résolvables actuels :

```text
Patch Panel <-> Wall Socket sans liaison vers un switch
Wall Socket sans câble
Port ou device absent du snapshot
```

Ne jamais déduire la suite du chemin par convention de nommage.

### 3. Normaliser LibreNMS

- MAC sans ponctuation et en majuscules.
- Noms courts de ports Cisco cohérents avec NetBox.
- Noms de switches sans domaine.
- Membres de stack ramenés au switch logique selon la règle existante.
- Device LibreNMS obligatoirement dans la configuration du site.

### 4. Filtrer le cycle

- Exclure toutes les lignes anciennes.
- Exclure les switches qui n'ont pas réussi le cycle.
- Exclure les ports qui ne correspondent pas à un port NetBox direct.
- Conserver les données brutes nécessaires à l'explication, sans exposer les MAC inutilement dans l'UI.

LLDP peut corroborer une observation FDB fraîche et améliorer sa confiance. LLDP seul ne peut pas créer une position actuelle, déplacer un ordinateur ou remettre son compteur d'absence à zéro.

### 4.1 Valider la complétude sans confondre vide et cassé

La complétude technique est différente du nombre de MAC :

- la réponse doit contenir les collections et champs attendus ;
- tous les switches configurés doivent être présents ;
- leur inventaire de ports doit être disponible ;
- les identifiants de ports FDB doivent référencer des ports connus ;
- pour chaque switch, comparer le nombre de lignes fraîches après filtre au nombre de lignes fraîches de ce même switch dans le dernier cycle publié ;
- une valeur courante nulle ou inférieure ou égale à 20 % de la précédente déclenche une lecture de confirmation via l'endpoint FDB ciblé du switch ;
- si les deux lectures valides confirment le même vide après un discovery réussi, accepter ce vide comme état métier ;
- si les lectures sont incohérentes ou incomplètes, mettre le cycle en quarantaine et ne modifier aucun compteur d'absence.

Le seuil sert à demander une confirmation, pas à interdire un changement légitime.

### 5. Décider une localisation par équipement

Ordre de décision :

1. Regrouper les observations fraîches par équipement.
2. Regrouper leurs prises candidates.
3. Si une seule prise reste, la choisir.
4. Si plusieurs prises restent et que la dernière position confirmée est candidate, la conserver.
5. Sinon marquer `ambiguous`.

Pour les équipements `render`, plusieurs interfaces sont normales. Les observations sont fusionnées au niveau du device. Une machine ne doit pas être dupliquée sur la carte parce qu'elle possède plusieurs ports.

### 6. Gérer plusieurs ordinateurs sur une prise

Si plusieurs équipements frais ciblent la même prise :

- comparer leur transition Netplan la plus récente de l'état absent vers présent sur cette prise ;
- retenir le plus récemment apparu pour la projection principale ;
- conserver les autres observations dans les détails et l'historique ;
- si le départage reste impossible, produire un conflit explicite plutôt qu'un ordre dépendant du tableau.

Ne pas utiliser `ports_fdb.created_at` comme preuve unique : LibreNMS peut conserver et rafraîchir une ligne existante. Cette règle ne doit pas supprimer les données sources. Elle décide uniquement quel ordinateur est affiché comme occupant actuel de la prise.

Le gagnant reste `online`. Les autres équipements deviennent `socket_conflict`, ne reçoivent pas de projection active et conservent leur dernière position en atténué dans les détails. Si les transitions absent -> présent sont égales, aucun gagnant n'est choisi et tous les candidats deviennent `socket_conflict`.

## États d'un ordinateur

### En ligne et localisé

Au moins une MAC fraîche, une prise unique résolue et un cycle complet réussi.

### Résolu mais non positionnable

La prise est résolue dans NetBox mais n'est pas placée dans Netplan. L'état durable est `resolved_unplaced`, pas `unresolvable`.

Message exemple :

> Vu sur la prise WS-042, mais cette prise n'est pas encore placée sur la carte.

### Non résolvable

Une MAC est vue, mais le chemin physique est incomplet.

Raisons affichables :

- prise reliée à un patch panel sans suite documentée ;
- prise sans câble ;
- port switch inconnu dans NetBox ;
- switch absent de la configuration du site ;
- inventaire MAC conflictuel.

### Ambigu

Plusieurs prises fraîches ne peuvent pas être départagées par la position précédente.

### Conflit de prise

Plusieurs équipements revendiquent la même prise et la règle de transition ne permet pas de les projeter tous comme occupant actuel.

### Manquant

Première absence après un cycle frais. La dernière position est conservée, mais l'état n'est pas encore `hors ligne`.

### Hors ligne

Deux cycles de site complets, validés et publiés consécutivement sans aucune MAC de l'équipement. Un cycle partiel, quarantiné, échoué, abandonné ou calculé avec une source non autorisée ne modifie pas le compteur d'absence.

Le terme est un choix produit. Les détails peuvent préciser que LibreNMS ne voit plus le poste, sans prétendre diagnostiquer alimentation, câble ou stockage.

## Transition temporelle

Exemple :

```text
08:00  poste vu sur WS-042 -> en ligne
08:05  aucune MAC          -> manquant, position conservée
08:10  aucune MAC          -> hors ligne, position atténuée
J+15   toujours absent     -> retiré de la carte, section Hors ligne
```

Un retour en ligne remet immédiatement le compteur d'absence à zéro après publication d'un cycle frais.

## Projection sur la carte

### Prérequis

Une prise doit être placée sur un étage Netplan. NetBox ne fournit actuellement pas de coordonnées exploitables.

Le placement initial des prises est donc un travail de configuration du plan. L'UI doit afficher la progression de couverture :

```text
prises NetBox totales
prises avec chemin direct
prises placées
ordinateurs réseau résolus
ordinateurs positionnables
```

### Autorité de la prise

La prise placée est l'ancre cartographique autoritaire. Sa position ne doit jamais être déplacée automatiquement par LibreNMS.

L'ordinateur est positionné selon une règle déterministe autour de cette ancre, avec validation de collision. La règle doit être stable pour éviter que les nodes bougent visuellement à chaque cycle identique.

### Ordinateur non encore placé

Si l'ordinateur est résolu et la prise placée :

- créer sa représentation durable au voisinage de la prise ;
- copier uniquement les champs de source nécessaires ;
- enregistrer que la position provient de la localisation automatique ;
- ne pas créer de doublon si le device existe déjà sur un autre étage.

### Ordinateur déjà placé

Si la prise confirmée change :

- déplacer l'ordinateur vers la nouvelle prise ;
- gérer un éventuel changement d'étage atomiquement ;
- préserver les champs appartenant à l'utilisateur ou à la carte ;
- appliquer les règles de collisions et de liens ;
- enregistrer le mouvement dans l'historique de localisation.

La publication de localisation et la projection cartographique sont deux étapes durables distinctes. La localisation peut réussir alors que la projection échoue. Dans ce cas, conserver sur l'état de l'ordinateur :

- `projectionStatus` ;
- étage et position cibles ;
- cycle de la dernière projection réussie ;
- catégorie d'erreur ;
- prochaine tentative de réconciliation.

Tant que la projection n'a pas réussi, l'ancienne position ne doit pas être présentée comme actuelle : elle est atténuée et accompagnée de la cible réseau correcte.

### Worker de projection

La publication planifie durablement une réconciliation de projection pour chaque décision modifiée. Les états sont `pending`, `running`, `success`, `blocked` et `error`.

- réservation idempotente par ordinateur et cycle ;
- lease récupérable après crash ;
- retries après 1, 5 puis 30 minutes ;
- sweep périodique des projections `pending` ou expirées ;
- `blocked_by_links` reste bloqué jusqu'à modification des liens ou intervention ;
- un cycle plus récent remplace la cible d'une projection ancienne ;
- le worker vérifie le cycle attendu avant chaque écriture.

### MapOperation dédiée

Le déplacement durable doit passer par une opération de domaine explicite, pas par une mutation ad hoc depuis un composant.

Cette opération doit couvrir :

- déplacement dans le même étage ;
- déplacement entre étages ;
- révisions des deux documents ;
- validation de la cible ;
- collision ;
- comportement des liens existants ;
- inverse et historique utilisateur lorsque pertinent ;
- origine système distincte d'une action utilisateur.

Le modèle actuel limite une opération à un étage et ne permet pas de patcher `floorId`. Introduire une opération typée de relocation système avec :

- entrée contenant device, source, cible et cycle attendu ;
- application pure sur deux documents d'étage ;
- transaction serveur unique et deux révisions ;
- idempotence par cycle et device ;
- métadonnée d'origine `integration` ;
- résultat détaillé par étage ;
- absence d'ajout automatique dans l'undo utilisateur.

Un delete/recreate non atomique n'est pas acceptable.

### Liens de carte

Politique retenue :

- déplacement dans le même étage : conserver les liens ;
- déplacement inter-étages sans lien durable : autoriser la relocation atomique ;
- déplacement inter-étages avec au moins un lien durable : bloquer la projection avec la raison `blocked_by_links` ;
- ne jamais supprimer ou recréer silencieusement un lien.

Une extension future pourra définir des liens inter-étages. Elle n'est pas nécessaire à cette livraison.

## Données NetBox copiées dans les devices placés

Aujourd'hui, les métadonnées NetBox sont copiées au moment du placement puis vieillissent. La cible utilise une jointure à la lecture pour les champs source NetBox frais. Le device durable conserve uniquement l'identité de liaison et les champs nécessaires au fonctionnement hors snapshot.

Ne jamais écraser position, taille, liens ou champs édités appartenant à la carte.

## Expiration cartographique après 15 jours

L'expiration est une règle de présentation, pas une suppression du device durable :

- le device et sa dernière position restent stockés ;
- les queries de projection active excluent les postes hors ligne depuis 15 jours ;
- la section `Hors ligne` les interroge séparément ;
- les liens ne sont pas supprimés ;
- un retour en ligne rend de nouveau le device actif puis réconcilie sa position ;
- un job temporel applique la transition même en l'absence d'un nouveau cycle réussi.

## Exemples complets

### Poste déplacé

```text
Cycle N   : MAC sur SW-A/Gi1/0/12 -> WS-042 -> étage RDC
Cycle N+1 : MAC sur SW-B/Gi1/0/31 -> WS-118 -> étage 1
Résultat  : nouvelle localisation publiée et déplacement atomique vers WS-118
```

### Ancienne FDB concurrente

```text
WS-042 : updated_at ancien de trois jours
WS-118 : updated_at du cycle courant
Résultat : WS-118 uniquement ; aucune ambiguïté
```

### Patch panel incomplet

```text
MAC vue sur un port
NetBox connaît Wall Socket -> Patch Panel
NetBox ne connaît pas Patch Panel -> Switch
Résultat : non résolvable, raison de câblage incomplète
```

## Tests obligatoires

- Une ligne ancienne n'est jamais actuelle.
- Une MAC déplacée choisit uniquement la prise du cycle courant.
- Une position précédente n'est conservée que parmi les candidates fraîches.
- Deux absences successives produisent `hors ligne`.
- Une absence suivie d'un retour ne produit pas `hors ligne`.
- Les 15 jours sont calculés depuis la dernière présence confirmée.
- Les MAC multiples d'un `render` ne créent qu'un équipement.
- Deux équipements sur une prise appliquent une règle stable.
- Une égalité de transition produit `socket_conflict` sans gagnant arbitraire.
- Chaque raison non résolvable est distinguée.
- Une prise non placée donne une localisation réseau mais aucune coordonnée inventée.
- Une relocation même étage et inter-étages respecte le moteur de carte.
- Les collisions et liens restent valides.
- Une relocation inter-étages avec liens est bloquée et explicitée, jamais destructive.
- Un échec de projection crée une réconciliation et atténue l'ancienne position.
- Un échec de projection cartographique ne corrompt pas le snapshot de localisation.

## Critères d'acceptation

- Aucune FDB ancienne n'est présentée comme actuelle.
- Tous les ordinateurs possèdent un état explicable.
- La carte ne contient aucun placement inventé lorsque la prise n'est pas placée.
- Un ordinateur ne peut apparaître qu'une fois malgré plusieurs MAC.
- Le passage hors ligne est stable et réversible.
- Les déplacements durables respectent le domaine `MapOperation`.
- `bun run check` est vert.
