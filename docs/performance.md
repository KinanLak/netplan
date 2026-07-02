# Performance — re-renders et session de document

Audit et optimisation des re-renders (juillet 2026). Ce document décrit les
problèmes trouvés, les correctifs, et les mesures avant/après. Les benchmarks
sont reproductibles :

```sh
bun run perf:render   # compte les commits React par sous-arbre (5 scénarios)
bun run bench:engine  # micro-benchmarks mitata des fonctions chaudes
```

Les scénarios de `test/perf/renderCounts.test.tsx` tournent aussi dans
`bun test` avec des plafonds de commits en assertion : toute régression de
re-render casse la suite.

## Problèmes corrigés

1. **`setState` à chaque mousemove avec un outil mur actif.**
   `moveWallPointer` retournait toujours un nouvel objet, même sans changement
   sémantique → re-render de `FlowCanvas` (et de tout React Flow) à la
   fréquence du pointeur (~60–250 Hz). Correctif : les gestes passent par
   `stabilizeWallInteractionState`, qui préserve l'identité de l'état quand la
   valeur est identique (`src/walls/wallInteraction/`).

2. **Contexte `MapDocumentSession` monolithique.** Chaque consommateur
   (`MapWorkspace`, `Sidebar` via undo/redo, `Toolbar`, `FlowCanvas`,
   `DeviceDrawer`, `MapDocumentStatus`) re-rendait à chaque changement de
   n'importe quel champ : op en attente, ack, flicker d'outbox, historique,
   message de rejet. Correctif : découpage en cinq contextes — données
   (`useMapDocumentData`), readiness (`useMapDocumentReady`), statut de
   synchro (`useMapDocumentSyncStatus`), historique (`useMapDocumentHistory`)
   et actions (`useMapDocumentActions`). Les actions sont construites une
   seule fois et lisent la session via des refs : identité stable à vie, zéro
   re-render pour les consommateurs d'actions.

3. **Boucle de rendu infinie sur réconciliation.** Quand une opération
   appliquée était observée (`observePending`) alors que l'abonnement au
   document était en retard, l'effet de réconciliation reposait un tableau
   filtré _au contenu identique mais à l'identité nouvelle_ à chaque
   microtâche → boucle re-render/effet jusqu'au rattrapage du document
   (~1 580 commits/s mesurés, de tout l'arbre). Correctif : tous les filtres
   de `pendingOperations.ts` préservent l'identité du tableau quand rien
   n'est retiré, donc `setPendingEntries` peut bail out.

4. **Churn d'identité à l'ack.** Chaque ack réécrivait `pendingEntries`
   (champ `ackedRevision`) → rematérialisation du document → re-render de
   tous les consommateurs de données sans changement visible. Correctif :
   les révisions ack vivent dans une ref (`ackedRevisionsRef`), et le retrait
   des entrées est déclenché explicitement (à l'ack et au changement de
   révision serveur) avec des helpers qui préservent l'identité.

5. **Dérivations à identité stable dans le provider.** `queriedDocument`,
   `serverDocument`, `pendingOperations`, `document` et les valeurs de
   contexte sont mémoïsés explicitement — le provider est la frontière
   d'abonnement de toute l'app, ces identités définissent qui re-rend, on ne
   dépend donc pas du React Compiler pour cette garantie. Quand aucune op
   n'est en attente, `document === serverDocument` (pas de copie).

6. **`MapWorkspace` lisait hover/highlight/outil pour de simples raccourcis.**
   Chaque hover d'un device re-rendait tout l'espace de travail. Correctif :
   lecture paresseuse via `useMapStore.getState()` dans les handlers, et
   `getDocument()` (accessor impératif des actions) pour les liens.

## Stats avant/après — commits React par scénario

Harnais : provider réel + sondes miroirs des vrais consommateurs, Convex
mocké de façon déterministe, comptage par `React.Profiler`. Document de
150 devices / 200 murs / 30 liens. (Sans React Compiler — comme `bun test` ;
les scénarios 1, 4 et 5 sont indépendants du compiler car les identités
d'état changeaient réellement.)

| Scénario                                              | Sous-arbre                       |                                      Avant |                              Après |
| ----------------------------------------------------- | -------------------------------- | -----------------------------------------: | ---------------------------------: |
| S1a — 300 mousemove outil mur, même cellule           | canvas                           |                       300 commits / 195 ms |             **2 commits / 1,5 ms** |
| S1b — 60 mousemove traversant les cellules            | canvas                           |                                 60 commits | 59 commits (comportement préservé) |
| S2 — 50 déplacements de device (dispatch + ack + doc) | toolbar                          |                                        100 |                              **0** |
|                                                       | workspace                        |                                        100 |                              **0** |
|                                                       | sidebar (undo/redo)              |                                        100 |                             **50** |
|                                                       | status                           |                                        100 |            100 (isSaving légitime) |
|                                                       | canvas                           |                                        150 |            150 (données légitimes) |
|                                                       | racine (durée)                   |                                      57 ms |                              54 ms |
| S3 — 20 mises à jour distantes du document            | canvas                           |                                         40 |                      40 (légitime) |
|                                                       | toolbar/sidebar/workspace/status |                                  40 chacun |                       **0 chacun** |
| S4 — 200 hovers de devices                            | workspace                        |                                        200 |                              **0** |
| S5 — doc en retard sur un ack (fenêtre de 100 ms)     | tout l'arbre                     | **158 commits (boucle infinie, ~1 580/s)** |                      **2 commits** |

## Micro-benchmarks (mitata, `bun run bench:engine`)

| Benchmark                                     |                 Avant |                                                                    Après |
| --------------------------------------------- | --------------------: | -----------------------------------------------------------------------: |
| `moveWallPointer` (même cellule)              |               24,7 ns | 32,7 ns (+8 ns : comparaison structurelle — 1/20 000ᵉ d'un commit évité) |
| `moveWallPointer` réutilise l'état (identité) |                   non |                                                                  **oui** |
| Réconciliation préserve l'identité du tableau |                   non |                                                                  **oui** |
| `materializeDocument` 1/10/50/100 ops         | 0,48/4,4/24,5/56,3 µs |                                                                 inchangé |
| `toDeviceNodes` (150 devices)                 |               1,43 µs |                                                                 inchangé |
