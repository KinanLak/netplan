# Performance — re-renders, session de document et rendu des murs

## État actuel (juillet 2026)

Les garanties en vigueur, toutes verrouillées par des assertions dans
`bun test` (7 scénarios, `test/perf/renderCounts.test.tsx`) :

- Le shell canvas (et donc les nodes devices) ne re-rend **jamais** pendant
  les mouvements de souris/traits — l'interaction murs vit dans
  `WallInteractionLayer` derrière `WallPaneEventBridge`.
- Un trait continu reste **une seule** opération en attente (coalescence) ;
  la matérialisation est linéaire.
- Toute la géométrie murs (fusion, gomme) est **O(cellules concernées)** via
  rasterisation sur la grille et index spatiaux, avec cache par identité du
  document.
- Session découpée en 5 contextes (data/ready/syncStatus/history/actions),
  actions à identité stable à vie, identités de collections préservées de
  bout en bout (serveur → memos).
- Serveur Convex : mutations scoppées à l'étage (`collectOperationScope`),
  document servi en 4 requêtes par collection (une édition ne pousse que sa
  collection + la révision).

Reproduire les mesures :

```sh
bun run perf:render   # commits React par sous-arbre (7 scénarios S1–S7)
bun run bench:engine  # micro-benchmarks mitata (géométrie, gomme, moteur)
```

Backlog connu, non corrigé : index spatial des devices côté serveur pour
`planWallsAdd`/`validateDevicePlacement` (borné à 500×500 par mutation) ;
`applyBatch`/inverse en O(sous-ops × snapshot) (atténué par la coalescence).

Les volets ci-dessous sont l'**historique** des trois passes d'optimisation,
avec leurs mesures avant/après telles que capturées à l'époque de chaque
passe (les noms de sous-arbres du volet 1, « canvas », correspondent
aujourd'hui à `canvas-shell` + `wall-layer`).

---

## Volet 3 — audit proactif : gomme, serveur Convex, composants (juillet 2026)

Audit systématique (complexités, abonnements, identités) sans symptôme
rapporté. Corrigé :

1. **Gomme O(chemin × murs) par mousemove.** `eraseStroke` rejouait un scan
   de tous les murs (avec recopie du tableau) pour chaque cellule du chemin ;
   la préview scannait tout l'étage à chaque survol. Correctif : index
   spatial par cellule (`buildWallEraseIndex`), mis en cache par identité du
   document dans les actions de session — chaque lookup gomme devient
   O(cellules sous la gomme), le tableau des murs n'est filtré qu'une fois
   par trait. Mesures (~1250 murs) : préview **29 µs → 1,9 µs**/move, stroke
   rapide (12 cellules) **1,21 ms → 115 µs**/événement ; construction de
   l'index 130 µs, une fois par modification du document.

2. **`buildPlanningState` (Convex) chargeait TOUTE la base à chaque
   mutation** — tous les étages, tous les bâtiments — pour valider une seule
   opération, faisant de chaque mutation un conflit potentiel avec toutes les
   autres (OCC). Correctif : `collectOperationScope` résout les objets
   référencés par point-lookups indexés (`by_object_id`) puis ne charge que
   les étages affectés (`by_floor`). Lectures par op : O(base) → O(étage).

3. **`collidesWithBlock` re-filtrait tous les devices pour CHAQUE bloc**
   (pinceau : par mousemove ; salle : par périmètre). Correctif : filtre
   hissé hors du callback.

4. **`DeviceDrawer` : O(liens × devices) par render** (`devices.find` dans la
   boucle des liens, à chaque édition du document tant qu'un device est
   ouvert). Correctif : `Map` par id — O(liens + devices).

5. **`useOptionHeld` à la racine de la sidebar** : chaque appui sur
   Ctrl/Cmd (donc chaque Ctrl+Z) re-rendait toute la sidebar pour un
   indice clavier. Correctif : `SidebarFloorShortcutHint` isolé.

6. Divers : timeout du flash undo/redo de la Toolbar non nettoyé (fuite de
   `setState` après démontage) ; valeur du `ShortcutIntentContext` non
   mémoïsée.

7. **`getFloorDocument` renvoyait le document entier à chaque édition** —
   déplacer un device re-transmettait tous les murs et liens de l'étage à
   chaque client abonné. Correctif : découpage en quatre requêtes
   (`getFloorDevices` / `getFloorWalls` / `getFloorLinks` /
   `getFloorRevision`) — Convex n'invalide que les requêtes dont le read-set
   a changé, donc une édition ne pousse que sa collection (+ la révision), et
   les résultats restent cohérents entre eux au même timestamp logique. Effet
   client bonus : les identités de tableaux non touchés sont préservées de
   bout en bout (un déplacement de device ne re-déclenche plus rien côté
   murs).

---

## Volet 2 — interactions murs et passage à l'échelle (juillet 2026)

Symptômes traités : un long trait au pinceau ralentissait progressivement ;
poser des blocs ralentissait avec le nombre de blocs existants ; bouger la
souris re-rendait le canvas entier (donc les nodes) ; l'historique re-rendait
toute la sidebar.

### Causes et correctifs

1. **`computeRectUnionPath` était O(n³)** (grille de coordonnées uniques ×
   scan de tous les rects par cellule), recalculé à chaque pose de bloc et, en
   préview, à chaque mousemove sur la totalité des murs. Correctif : les murs
   vivent sur la grille de 20 px → rasterisation exacte en cellules occupées
   (clés numériques packées) et traçage des contours en O(cellules), avec
   repli sur l'algo générique pour les rects animés non alignés
   (`src/walls/gridGeometry/render.ts`).

2. **Le merge géométrique fusionnait toutes les couleurs à chaque préview.**
   `WallOverlay` merge maintenant par couleur sur des tranches à identité
   stable (`useContentStableArray`) : un trait ou une préview ne re-fusionne
   que la couleur touchée.

3. **Chaque point d'un trait ajoutait une opération en attente** →
   rematérialisation O(points²) sur la durée du trait. Correctif :
   `appendPendingOperation` fusionne les opérations murales différées
   consécutives d'un même trait en UNE opération (le groupe d'historique et
   l'outbox restent inchangés) — vérifié par assertion : 60 points = 1 op.

4. **La session de pointeur vivait dans `FlowCanvas`** → chaque mousemove
   re-rendait le shell, `<ReactFlow>` et son arbre interne (nodes compris).
   Correctif : `WallInteractionLayer` (enfant de ReactFlow) héberge la
   session ; le shell passe à ReactFlow des callbacks pont à identité stable
   (`WallPaneEventBridge`) et la classe curseur est appliquée impérativement
   au conteneur. Le shell ne re-rend plus jamais au mousemove — vérifié par
   assertion (`canvas-shell === 0` pendant les scénarios de survol).

5. **La sidebar entière s'abonnait à l'historique** pour deux boutons.
   Correctif : composant `SidebarUndoRedo` isolé ; `AppSidebar` ne consomme
   plus aucun contexte de session.

### Avant/après (volet 2)

| Scénario                                                    |                     Avant |                   Après |
| ----------------------------------------------------------- | ------------------------: | ----------------------: |
| S6 — trait de 60 points (~620 blocs existants), points 1–30 |                    147 ms |                   44 ms |
| S6 — même trait, points 31–60 (dérive quadratique)          |        **220 ms (+50 %)** |      **33 ms (stable)** |
| S7 — 10 mousemove de préview au-dessus de ~1250 blocs       | **107 ms (10,7 ms/move)** | **11 ms (1,1 ms/move)** |
| Merge géométrique de 1152 murs (mitata)                     |                   3,89 ms |   **0,69 ms**, linéaire |
| Shell canvas re-rendu pendant survol/préview                |        à chaque mousemove |                   **0** |
| Sidebar re-rendue par édition (undo/redo)                   |                   entière |       boutons seulement |

---

## Volet 1 — re-renders et session de document

### Problèmes corrigés

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

### Stats avant/après — commits React par scénario

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

### Micro-benchmarks (mitata, `bun run bench:engine`)

| Benchmark                                     |                 Avant |                                                                    Après |
| --------------------------------------------- | --------------------: | -----------------------------------------------------------------------: |
| `moveWallPointer` (même cellule)              |               24,7 ns | 32,7 ns (+8 ns : comparaison structurelle — 1/20 000ᵉ d'un commit évité) |
| `moveWallPointer` réutilise l'état (identité) |                   non |                                                                  **oui** |
| Réconciliation préserve l'identité du tableau |                   non |                                                                  **oui** |
| `materializeDocument` 1/10/50/100 ops         | 0,48/4,4/24,5/56,3 µs |                                                                 inchangé |
| `toDeviceNodes` (150 devices)                 |               1,43 µs |                                                                 inchangé |
