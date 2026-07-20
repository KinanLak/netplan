# Validation de la phase 2

Date de validation locale : 17 juillet 2026.

## Portée livrée

- Un cron Convex global scanne les échéances chaque minute.
- Le calendrier pur applique cinq minutes en journée ouvrée, une heure la nuit, le week-end et les jours fériés France métropolitaine.
- Le calcul couvre les transitions 07h00/20h00 et évite le doublon d'heure locale au changement d'heure d'automne.
- NetBox possède un worker interne indépendant, une cadence de quinze minutes et un timeout global borné.
- La réservation transactionnelle crée le cycle, avance l'échéance et planifie durablement le worker dans le même commit.
- Les deux switches LibreNMS sont verrouillés et planifiés en parallèle.
- Le client LibreNMS refuse les redirections, désactive le cache du trigger et utilise un paramètre de cycle unique.
- Chaque switch mémorise son `last_discovered`, suit la nouvelle génération, capture son timing et stage un résultat immuable.
- Un échec définitif retente uniquement le switch concerné. Un trigger accepté ou incertain n'est jamais redéclenché.
- Un switch incertain conserve un verrou indépendant pendant dix minutes, puis est libéré sur une nouvelle génération ou passe `blocked`.
- La publication exige tous les résultats staged, la génération NetBox épinglée, les fences courants et une fenêtre de capture maximale de cinq minutes.
- Le backoff localisation progresse à 4, 8, 16 puis 30 minutes et revient à zéro après succès.
- Le refresh manuel applique l'ordre `joined_existing`, verrou switch, confirmation du snapshot récent, puis réservation.
- Les catégories publiques restent génériques ; les détails source sont conservés uniquement dans l'état privé et les logs serveur.

## Rollout sûr

Deux variables Convex contrôlent séparément les effets réseau :

```text
INTEGRATION_SCHEDULER_ENABLED=true
INTEGRATION_MANUAL_REFRESH_ENABLED=true
```

Une valeur absente ou différente de `true` désactive le chemin correspondant. Le déploiement initial conserve les deux variables désactivées. Le cron peut donc être présent sans déclencher NetBox ou LibreNMS, et la mutation manuelle retourne `disabled` tant que son switch n'est pas activé.

L'activation automatique doit attendre la validation du filtre de fraîcheur FDB de phase 3. Le resolver historique reste disponible pour le connecteur de secours, mais il ne doit pas devenir une autorité automatique avant cette étape.

## Validation automatisée

Les tests ajoutés couvrent notamment :

- calendrier jour, nuit, week-end, jours fériés, transitions et DST ;
- options HTTP du trigger, refus, redirection, timeout et `last_discovered = null` ;
- single-flight et indépendance entre sites ;
- planification durable simultanée des deux switches ;
- priorités du refresh manuel et kill switch de rollout ;
- échéance automatique sautée pendant un cycle actif ;
- override manuel du backoff et progression 4/8/16/30 ;
- retry du seul switch en échec ;
- récupération conservatrice d'un worker expiré après trigger ;
- verrou `uncertain`, suivi borné et passage `blocked` ;
- staging immuable et fenêtre maximale de cinq minutes ;
- exécution réelle du finalizer Convex et publication atomique ;
- préservation et fencing des fondations de phase 1.

Résultat local : `bun run check` vert avec 349 tests et aucun appel aux instances réelles depuis les tests.

## Validation distante

Le modèle de phase 1 a publié une génération NetBox réelle sur le déploiement de développement :

- 433 objets d'inventaire ;
- 134 connexions ;
- génération active `48ad7cc3-2695-461a-8d3f-40d098fe0dd8` au moment du test.

Le premier smoke LibreNMS n'a pas déclenché de discovery : `LIBRENMS_URL` pointait vers la racine et le client appelait donc `/devices`, qui répondait `401 Unauthenticated`, au lieu de `/api/v0/devices`. La normalisation accepte désormais une URL racine ou une URL API. La lecture passive du bon endpoint répond `200`. Le workflow distant était passé proprement à `error` sans déplacer le dernier snapshot valide.

La validation opérationnelle restante est :

1. Activer temporairement `INTEGRATION_MANUAL_REFRESH_ENABLED=true` après accord explicite pour déclencher les switches.
2. Lancer un cycle manuel Arles et vérifier les deux nouvelles générations `last_discovered`.
3. Vérifier les deux résultats staged, la fenêtre de capture et la publication atomique.
4. Remettre le switch manuel à `false` ou le supprimer.
5. Après la phase 3, activer temporairement le scheduler en cadence surveillée.

### Smoke du 17 juillet 2026

Un cycle manuel réel a été autorisé puis lancé sur Arles. Les deux workers ont démarré en parallèle, mais chacun a expiré sur la lecture initiale du device avant tout appel au trigger. Les retries ciblés ont également expiré ; le fencing a laissé un seul worker fermer le cycle et le dernier snapshot valide est resté inchangé.

Le client a ensuite reçu un transport Node imposant explicitement IPv4 au niveau de la socket, sans modifier le hostname TLS. Un second cycle réel a confirmé que l'IPv6 n'était pas en cause : Convex Cloud a tenté l'adresse IPv4 publique sur le port 443 et a reçu `connect ETIMEDOUT`, alors que la même lecture API depuis l'environnement local répond `200` en moins de 100 ms.

Le blocage restant se situe donc entre les sorties Convex Cloud et le frontal LibreNMS, par exemple une règle de pare-feu ou une allowlist. Le refresh manuel a été remis à `false`. Aucun discovery n'a été déclenché pendant ces cycles, car les workers n'ont jamais dépassé la lecture initiale du device.

### Validation de l'agent local

Le pont sortant est disponible avec `bun run scripts/sync-integrations.ts --discover`. En exploitation sur la machine actuelle, le timer utilisateur `netplan-integration-agent.timer` lance chaque minute le mode `--agent`. Convex réserve durablement les workflows manuels ou planifiés, sans programmer d'action réseau cloud. Le service local rejoint le lease actif, exécute NetBox ou les deux switches, puis publie via le connecteur authentifié.

Le test réel a confirmé :

- les deux switches sont passés simultanément à `last_discovered = null` ;
- le switch 5 a terminé en 42,194 secondes ;
- le switch 4 a terminé en 47,105 secondes ;
- la dernière capture de validation contient 718 observations, 91 liaisons PC-prise et les deux switches en succès ;
- la génération NetBox associée contient 433 équipements et 134 câbles ;
- le workflow final est `success`, sans backoff, et l'ancien snapshot valide n'a été remplacé qu'après publication complète.

La validation du service installé a confirmé deux chaînes indépendantes :

- réservation NetBox `running`, conservation pendant cinq secondes sans worker cloud, puis publication locale 433/134 ;
- réservation manuelle de localisation, prise en charge par systemd, discoveries parallèles en 48,383 et 44,899 secondes, publication 718/91 et libération des deux verrous switch.

Le scheduler Convex est activé et ne fait que réserver les workflows. Le refresh manuel public reste désactivé. Les tokens et URLs NetBox/LibreNMS ont été retirés de Convex et restent dans l'environnement local. Convex ne conserve que `NETPLAN_CONNECTOR_SECRET` et les deux kill switches.

L'installation versionnée se trouve dans `ops/systemd/`. Le secret local est stocké avec le mode `0600` dans `.netplan-connector-secret.local`, ignoré par Git. Le timer est activé dans le service systemd utilisateur et survit aux redémarrages de la session utilisateur via son activation persistante.

## Risques reportés explicitement

- Le filtre autoritaire des lignes FDB par bornes de discovery appartient à la phase 3.
- L'authentification et l'autorisation utilisateur du bouton manuel doivent être finalisées avant son exposition par l'UX de phase 5/6. Le kill switch reste désactivé jusque-là.
- Le timeout global NetBox borne le résultat du worker, mais les requêtes source utilisent encore leurs propres signaux et ne partagent pas un unique `AbortController` global.
- Le smoke réel des deux switches reste obligatoire ; il n'est pas lancé sans accord explicite car l'endpoint de discovery a un effet.
