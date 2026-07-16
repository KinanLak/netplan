# Phase 7 - Tests, déploiement et validation

## Objectif

Prouver que le système est correct avant d'activer les discoveries permanents, puis le déployer sans perdre le dernier snapshot valide.

## Stratégie de tests

Chaque phase ajoute ses tests au moment de l'implémentation. Ne pas reporter toute la couverture à la fin.

## Tests purs de domaine

### Calendrier

- Cadence cinq minutes entre 07h et 20h.
- Cadence horaire la nuit.
- Week-end et jours fériés.
- Fuseau `Europe/Paris`.
- Passages heure d'été et heure d'hiver.
- Calcul depuis la dernière tentative.
- Échéance sautée lorsque le cycle est actif.
- Transitions 07h00 et 20h00.
- Un refresh manuel recale la prochaine échéance.
- Le backoff ne raccourcit pas la cadence nominale.

### Résolution

- Normalisation MAC, port et switch.
- Filtre strict par cycle.
- Ancienne ligne FDB exclue.
- Timestamp FDB absent, invalide ou futur exclu.
- LLDP seul ne produit aucune position actuelle.
- Une prise directe résolue.
- Patch panel incomplet non résolvable.
- Prise sans câble non résolvable.
- Position précédente candidate.
- Ambiguïté persistante.
- Fusion multi-MAC `render`.
- Conflit de plusieurs postes sur une prise.
- Deux absences puis hors ligne.
- Retour en ligne.
- Expiration 15 jours.

### Backoff et état

- Progression 4, 8, 16, 30 minutes.
- Réinitialisation après succès.
- Override manuel.
- Confirmation obligatoire sous deux minutes, puis override explicite accepté.
- Retry du seul switch échoué.
- Timeout de deux minutes par tentative.
- Verrou switch maintenu pendant une tentative incertaine et blocage après dix minutes.

## Tests Convex

### Modèle

- Isolation par site.
- Unicité des états courants.
- Générations NetBox.
- Publication atomique des deux switches.
- Staging immuable du résultat de chaque switch.
- Génération NetBox épinglée malgré un sync NetBox concurrent.
- Rejet d'un worker ancien.
- Conservation du snapshot après erreur.
- Récupération d'un cycle abandonné.
- Refus des snapshots anormaux.

### Scheduler

- Sélection des sites arrivés à échéance.
- Aucune création de doublon.
- Deux sites indépendants.
- Site désactivé ignoré.
- Cycle actif ignoré.
- Planification du prochain passage.

### Historique

- Écriture du cycle immuable.
- Slot détaillé finalisé avec le cycle admissible le plus proche ou l'état `missing`.
- Requêtes paginées.
- Nettoyage à 30 jours.
- Lots idempotents.
- Préservation de l'état courant.

### Carte

- Placement déterministe autour d'une prise.
- Déplacement même étage.
- Déplacement inter-étages.
- Révisions cohérentes.
- Collisions refusées ou résolues selon la politique.
- Liens préservés selon leur sémantique.
- Inverse et historique si l'opération est annulable.
- Réconciliation de projection reprise après crash et fencing par cycle.

Mettre à jour `convex/_test/modules.ts` pour chaque nouveau module.

## Tests des actions réseau

Extraire un client LibreNMS testable avec des réponses simulées :

- trigger accepté ;
- trigger 4xx/5xx ;
- timeout ;
- `last_discovered = null` puis nouveau timestamp ;
- timestamp jamais renouvelé ;
- aucun second trigger tant que le premier discovery est incertain ;
- réponse malformée ;
- redirection externe refusée ;
- FDB vide ou partielle ;
- un switch réussit et l'autre échoue.

Les tests locaux ne doivent jamais appeler l'instance réelle.

## Tests frontend

- Bouton partagé entre les surfaces.
- Confirmation si snapshot récent.
- Progression globale et détail switch.
- Interpolation 60 secondes.
- Anciennes positions conservées.
- Succès manuel 15 secondes.
- Toast manuel et silence automatique.
- Indicateur puis bannière.
- Tooltips de fraîcheur.
- Liste hors ligne.
- Raisons non résolvables.
- Couverture des prises.
- Desktop et mobile.
- Navigation clavier et lecteurs d'écran.

## Scénarios d'acceptation bout en bout

### Scénario A - Cycle nominal

1. Le scheduler sélectionne Arles.
2. Les deux switches sont déclenchés.
3. Ils terminent dans la fenêtre prévue.
4. Les lignes anciennes sont exclues.
5. Le snapshot est publié atomiquement.
6. L'UI se met à jour sans toast automatique.
7. Le cycle apparaît dans l'historique.

### Scénario B - Déplacement d'un poste

1. Le poste est sur une prise A au cycle N.
2. Il est branché sur une prise B.
3. LibreNMS conserve encore A comme ligne ancienne.
4. Le cycle N+1 ne retient que B.
5. La carte reflète B si la prise est placée.
6. L'historique contient le mouvement A -> B.

### Scénario C - Poste éteint

1. Le poste est présent.
2. Il manque au cycle suivant : état manquant.
3. Il manque au second : hors ligne.
4. Il reste atténué pendant 15 jours.
5. Il rejoint ensuite la section Hors ligne.
6. Son retour le replace après un cycle frais.

### Scénario D - Un switch échoue

1. Switch A réussit.
2. Switch B retourne un échec définitif avant ou après une tentative terminée.
3. Seul B est retenté.
4. Si B réussit, publication atomique.
5. Sinon, ancien snapshot conservé et backoff.

### Scénario D2 - État switch incertain

1. Switch A réussit.
2. Switch B reste avec `last_discovered = null` après le timeout.
3. Aucun second discovery B n'est déclenché.
4. Le cycle échoue sans publication.
5. Le verrou B reste suivi pendant dix minutes.
6. Si B termine, le verrou est libéré mais l'ancien cycle ne publie pas.
7. Si B reste incertain, le site est bloqué et signale une intervention nécessaire.

### Scénario E - NetBox indisponible

1. NetBox échoue.
2. Le câblage précédent a moins de 24 heures.
3. Le cycle LibreNMS peut publier avec cette génération.
4. Après 24 heures, la publication reste possible avec un avertissement persistant.

### Scénario F - Prise non placée

1. L'ordinateur est résolu vers une prise.
2. La prise n'est pas sur la carte.
3. Aucune coordonnée n'est inventée.
4. L'UI explique comment compléter la couverture.

## Déploiement progressif

La décision produit est d'activer les deux switches ensemble, mais le déploiement technique reste contrôlé :

1. Déployer le modèle et les queries sans scheduler actif.
2. Importer ou reconstruire le snapshot actuel.
3. Tester le refresh manuel des deux switches.
4. Vérifier filtre FDB et publication atomique.
5. Activer le cron en cadence horaire temporaire.
6. Observer erreurs, durées et charge.
7. Passer à cinq minutes pendant une plage surveillée.
8. Activer la cadence jour/nuit complète.
9. Activer les surfaces UX générales.

Cette progression ne change pas la portée fonctionnelle finale. Elle réduit le risque opérationnel.

## Smoke tests réels

À exécuter explicitement, jamais dans `bun run check` :

- trigger des deux switches ;
- suivi de leurs nouveaux `last_discovered` ;
- comparaison lignes fraîches/anciennes ;
- vérification d'un poste connu ;
- vérification d'une absence ;
- vérification d'une prise patch panel ;
- observation CPU/poller LibreNMS ;
- test d'un deuxième clic concurrent ;
- test de refresh depuis deux navigateurs.

## Commandes de vérification

Après chaque changement :

```sh
bun run check
```

Avant validation finale :

```sh
bun run build
```

Exécuter aussi les tests ciblés pendant le développement, notamment les tests Convex, topology, moteur de carte et composants ajoutés.

## Checklist finale

- [ ] Modèle par site et index composites.
- [ ] NetBox et LibreNMS découplés.
- [ ] Scheduler et calendrier.
- [ ] Trigger API serveur sans cache.
- [ ] Single-flight, confirmation récente, retry et backoff.
- [ ] Filtre FDB par cycle.
- [ ] Publication atomique.
- [ ] États ordinateur et raisons non résolvables.
- [ ] Projection cartographique et relocation durable.
- [ ] Historique 30 jours et cinq snapshots quotidiens.
- [ ] Nettoyage borné.
- [ ] UX sur toutes les surfaces.
- [ ] Toasts, bannière et accessibilité.
- [ ] Secrets Convex documentés.
- [ ] Rollback testé.
- [ ] `bun run check` vert.
- [ ] `bun run build` vert.
- [ ] Smoke test des deux switches réussi.
- [ ] Charge réseau acceptée après observation.

## Critères de sortie

La fonctionnalité peut être considérée comme livrée lorsque tous les scénarios d'acceptation sont démontrés, que la cadence fonctionne pendant plusieurs cycles réels sans chevauchement, et que la désactivation du scheduler laisse immédiatement le dernier snapshot disponible.
