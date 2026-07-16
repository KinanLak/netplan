# Phase 2 - Orchestration des refreshs

## Objectif

Déclencher et suivre les discoveries LibreNMS depuis Convex, automatiquement et manuellement, sans exposer de secret, sans chevauchement et sans dépendre d'un terminal sur la VM du FAI.

## API LibreNMS validée

Sur LibreNMS 25.7, le trigger disponible est :

```text
GET /api/v0/devices/{hostname-ou-id}/discover
```

Malgré la méthode `GET`, cet endpoint a un effet : il remet `last_discovered` à `NULL`. Le Dispatcher actif détecte alors le device et lance un discovery complet.

Le test réel a confirmé :

- réponse API immédiate `Device will be rediscovered` ;
- transition visible vers `last_discovered = null` ;
- nouveau `last_discovered` après environ 42 secondes ;
- mise à jour effective de la FDB.

### Précautions HTTP

Parce que l'endpoint a un effet malgré sa méthode :

- l'appeler uniquement côté serveur ;
- désactiver explicitement tout cache ;
- ajouter un paramètre de requête unique si nécessaire pour traverser les proxies ;
- ne jamais précharger cette URL ;
- ne jamais l'exposer comme lien navigable ;
- journaliser l'identifiant du cycle, pas le token ;
- accepter uniquement l'URL LibreNMS configurée, sans redirection vers un autre hôte.

## Déroulement d'un cycle nominal

```text
Scheduler ou utilisateur
  -> demande un cycle pour le site
  -> mutation serveur de single-flight et réservation
  -> la même mutation planifie durablement le travail interne
  -> le cycle épingle une génération NetBox immuable
  -> lit les deux last_discovered actuels
  -> déclenche les deux switches en parallèle
  -> suit chaque switch jusqu'à un nouveau last_discovered
  -> capture immédiatement le résultat brut de chaque switch réussi
  -> filtre les observations du cycle
  -> résout avec la génération NetBox épinglée
  -> valide le snapshot complet
  -> publie atomiquement
  -> enregistre historique et prochain cycle
```

## Single-flight par site

La décision de démarrer doit être transactionnelle.

Cas attendus :

- Aucun cycle actif : créer le cycle et le démarrer.
- Cycle actif du même site : retourner son identifiant au demandeur.
- Cycle actif d'un autre site : autoriser le nouveau cycle.
- Cycle actif mais expiré : le marquer abandonné avant de reprendre.
- Cycle en backoff et trigger automatique : ne rien lancer.
- Cycle en backoff et trigger manuel : autoriser une tentative immédiate.

Le navigateur ne décide jamais seul qu'un job peut démarrer. La mutation qui réserve un cycle doit également planifier le travail interne avant de terminer. Une action publique ne doit pas réserver puis espérer continuer elle-même : un crash entre les deux laisserait un cycle sans worker.

Chaque action réseau écrit sa progression via des mutations protégées par l'identifiant du cycle et un jeton de fencing. Un worker ancien ou relancé ne peut plus modifier ni publier un cycle remplacé.

## Cadence automatique

### Journée

- Toutes les cinq minutes.
- Entre 07h00 inclus et 20h00 exclu.
- Fuseau du site, initialement `Europe/Paris`.

### Nuit, week-end et jours fériés

- Toutes les heures.
- Le refresh manuel reste immédiat.
- La logique de calendrier doit être testable indépendamment du scheduler.

### Calcul du prochain cycle

Le prochain cycle nominal est calculé depuis la réservation de la dernière tentative de cycle. Les retries d'un switch ne comptent pas comme de nouveaux cycles. Un cycle long ne doit pas engendrer immédiatement plusieurs exécutions de rattrapage.

Le calcul est une fonction pure `nextNominalAttempt` :

- cadence selon l'heure locale du site ;
- prochaine échéance au plus tard à une transition de plage, afin qu'un cycle de nuit à 06h58 n'empêche pas la reprise à 07h00 ;
- jours fériés selon un calendrier France métropolitaine identifié et testable ;
- passage heure d'été/hiver sans exécution dupliquée ;
- un refresh manuel réussi ou échoué devient la dernière tentative et recale la prochaine échéance nominale ;
- une échéance manquée pendant un cycle actif est sautée, jamais rejouée en rafale.

Si un cycle est encore actif à l'échéance suivante, cette échéance est sautée. Elle n'est pas mise en file.

## Déclenchement depuis Convex

Introduire un scheduler Convex et des actions internes dédiées.

Le scheduler périodique peut s'exécuter fréquemment et sélectionner les sites arrivés à échéance. Il ne doit pas créer un cron statique distinct pour chaque site si cela complique l'ajout futur de sites.

Séparer :

- décision courte et transactionnelle de démarrage ;
- action réseau longue ;
- mutations courtes de progression ;
- publication finale atomique.

Ne pas garder une mutation ouverte pendant des appels HTTP.

## Suivi d'un switch

Pour chaque switch :

1. Lire le device et mémoriser son `last_discovered`.
2. Appeler le trigger avec un timeout HTTP court.
3. Marquer `triggered` si LibreNMS accepte.
4. Interroger périodiquement le device.
5. Observer éventuellement `last_discovered = null`.
6. Terminer lorsque `last_discovered` est défini et différent de la valeur initiale.
7. Capturer `last_discovered_timetaken` et les horaires.
8. Échouer si le délai de deux minutes est dépassé.

La progression publique ne prétend pas connaître la file Dispatcher. Le texte reste `Actualisation en cours`.

Un timeout ne prouve pas que LibreNMS a arrêté le discovery. Si `last_discovered` reste `null` ou si l'état est incertain, ne jamais redéclencher ce switch. Continuer un suivi borné pour connaître l'issue, puis échouer le cycle si l'état ne peut pas être confirmé. Un retry est autorisé uniquement lorsque la tentative précédente est définitivement terminée ou n'a définitivement pas été acceptée.

Le suivi étendu d'une tentative `uncertain` dure au maximum dix minutes après le timeout utilisateur. Pendant cette période :

- le cycle est déjà considéré comme échoué et aucun snapshot n'est publié ;
- le verrou durable du switch reste actif ;
- aucun cycle automatique ou manuel ne peut retrigger ce switch ;
- les cycles du site rejoignent l'état bloqué au lieu d'appeler LibreNMS.

Si un nouveau `last_discovered` apparaît, libérer le verrou sans publier l'ancien cycle. S'il reste `null` après dix minutes, passer le verrou à `blocked`, suspendre les cycles automatiques du site et demander une intervention. Un refresh manuel ne contourne pas un verrou switch `blocked` ; il sert uniquement à retester après retour à un état LibreNMS non nul ou après déblocage administratif explicite.

## Parallélisme

Les deux switches d'un site sont déclenchés en parallèle.

Raisons :

- Ils sont indépendants.
- Le Dispatcher possède 16 workers.
- La file était vide pendant l'audit.
- Le temps global reste proche du switch le plus lent.

Chaque site possède son propre job. Aucun verrou global ne bloque les autres sites. Une limite globale pourra être ajoutée plus tard si plusieurs sites provoquent une charge mesurable.

## Capture et staging par switch

Dès qu'un switch obtient un nouveau `last_discovered` :

1. Télécharger les données nécessaires.
2. Filtrer immédiatement les lignes de ce switch appartenant à cette tentative.
3. Écrire un résultat brut immuable et temporaire associé au cycle et à la tentative.
4. Enregistrer son heure de capture et sa génération de discovery.

La publication finale exige deux résultats staged du même cycle et la même génération NetBox épinglée. Elle bascule le snapshot courant dans une transaction unique.

La fenêtre maximale entre les captures des deux switches est de cinq minutes. Si le résultat du premier switch est plus ancien au moment où le second finit son retry, le cycle échoue et un nouveau cycle repartira avec les deux switches.

## Retry

Si un switch réussit et l'autre échoue :

- conserver le résultat staged immuable du switch réussi ;
- relancer uniquement le switch échoué ;
- ne rien publier tant que les deux résultats ne sont pas disponibles ;
- vérifier que le résultat conservé n'a pas dépassé la fenêtre de cohérence autorisée ;
- publier ensemble après succès du retry.

Chaque tentative dispose de deux minutes. Le refresh peut donc durer jusqu'à environ quatre minutes en cas de retry.

Le retry de discovery est autorisé uniquement pour un échec définitif : trigger explicitement refusé, tentative terminée avec `last_discovered` revenu à un état stable, ou récupération FDB échouée après une fin de discovery confirmée. Un timeout de réponse au trigger ou un `last_discovered = null` prolongé est `uncertain` et suit le verrou décrit plus haut, sans retry.

Si seul le téléchargement FDB échoue après un discovery confirmé, retenter d'abord ce téléchargement sans lancer un nouveau discovery.

## Backoff

Après épuisement du retry :

```text
échec 1 -> 4 minutes
échec 2 -> 8 minutes
échec 3 -> 16 minutes
échec 4+ -> 30 minutes
```

Un succès remet le niveau à zéro.

Le backoff est un délai minimum, pas une nouvelle cadence plus rapide. L'échéance réelle est :

```text
max(prochaine échéance nominale, fin de l'échec + backoff)
```

Ainsi, un backoff de quatre minutes ne crée pas de cycles toutes les quatre minutes pendant la nuit.

Le clic manuel interrompt le backoff pour une tentative. Un nouvel échec manuel ne doit pas créer une boucle de clics : le single-flight et la confirmation de snapshot récent restent appliqués.

## Contrat du refresh manuel

- La mutation serveur évalue atomiquement âge, cycle actif et confirmation.
- Priorité 1 : si un cycle est actif, retourner `joined_existing`, quel que soit l'âge du snapshot.
- Priorité 2 : si un switch est `uncertain` ou `blocked`, retourner l'état de blocage sans trigger.
- Priorité 3 : si le snapshot a moins de deux minutes et la confirmation est absente, retourner `confirmation_required`.
- Priorité 4 : vérifier la configuration et réserver un nouveau cycle.
- Si l'utilisateur annule : retourner au snapshot existant.
- Si l'utilisateur confirme : autoriser le cycle malgré l'âge récent après application des priorités précédentes.
- La fenêtre de deux minutes est une garde de confirmation, pas un deuxième verrou contradictoire.
- Après succès manuel : bouton non cliquable pendant 15 secondes pour le feedback visuel, sans modifier le scheduler métier.

Le feedback UX de 15 secondes et la fenêtre métier de confirmation de deux minutes sont deux concepts distincts.

## Détection de charge

L'API de cette version n'expose pas la file Dispatcher. Ne pas scraper la page Poller.

Les garde-fous disponibles sont :

- single-flight Netplan ;
- absence de chevauchement sur les switches ciblés ;
- temps de discovery observé ;
- taux d'erreur ;
- timeout ;
- backoff ;
- possibilité de désactiver un site ;
- verrou durable d'une tentative switch incertaine.

Si la durée augmente fortement ou que les timeouts deviennent récurrents, le système doit ralentir via le backoff et rendre l'incident visible.

## Synchronisation NetBox indépendante

Le cycle NetBox s'exécute toutes les quinze minutes :

1. Télécharger le site, les devices, interfaces, câbles, racks et locations.
2. Valider la cohérence du snapshot.
3. Publier une nouvelle génération atomique.
4. Conserver la génération précédente en cas d'échec.
5. Autoriser la localisation à utiliser silencieusement la dernière génération pendant 24 heures.
6. Après 24 heures sans succès, continuer avec cette génération mais signaler le câblage périmé dans l'UI et l'historique.

Un refresh manuel de localisation ne doit pas attendre NetBox si une génération autorisée existe.

Le workflow NetBox possède un single-flight et un timeout global de deux minutes. Il ne fait pas de retry immédiat : après un échec, il conserve la génération active et attend l'échéance nominale suivante quinze minutes plus tard. Trois échecs consécutifs déclenchent l'alerte persistante. Un cycle NetBox concurrent ne modifie jamais la génération déjà épinglée par un cycle de localisation.

## Erreurs publiques et logs privés

L'UI reçoit des catégories stables :

- LibreNMS inaccessible ;
- trigger refusé ;
- discovery expiré ;
- switch manquant ;
- FDB incomplète ;
- NetBox trop ancien ;
- snapshot incohérent ;
- erreur interne.

Les détails HTTP, réponses brutes et stack traces restent dans les logs serveur.

## Tests obligatoires

- Deux demandes simultanées partagent le même cycle.
- Deux sites peuvent démarrer en parallèle.
- Un cycle actif fait sauter l'échéance automatique suivante.
- Un trigger manuel traverse le backoff.
- Un snapshot de moins de deux minutes exige confirmation côté UX mais reste protégé côté serveur.
- Les deux switches démarrent en parallèle.
- Le retry ne relance que le switch échoué.
- Un switch encore `last_discovered = null` n'est jamais redéclenché.
- Chaque résultat switch est staged avant un éventuel retry de l'autre switch.
- Un résultat staged âgé de plus de cinq minutes empêche la publication.
- Le timeout produit un échec borné.
- Le backoff progresse puis se réinitialise après succès.
- Un cycle abandonné est récupérable.
- Un ancien worker ne peut pas publier après un cycle plus récent.
- Les horaires jour, nuit, week-end, jours fériés et changement d'heure sont corrects.
- L'endpoint de trigger n'est jamais appelé depuis le navigateur.

## Critères d'acceptation

- Le trigger réel fonctionne sans terminal FAI.
- Aucun secret n'est présent dans le bundle web.
- Un seul cycle existe par site.
- La publication reste tout-ou-rien.
- Le scheduler respecte les deux cadences.
- Le dernier snapshot valide survit à tous les échecs.
- Le refresh manuel et automatique utilisent exactement la même orchestration.
- `bun run check` est vert.
