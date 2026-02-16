Plan : Undo/Redo avec zundo
Architecture
Approche snapshot-based via zundo (middleware Zustand). Chaque mutation de devices ou walls sauvegarde un snapshot complet de ces deux tableaux. L'undo restaure le snapshot precedent. Cela resout nativement le probleme de coherence : pas de commandes inversees qui pourraient cibler des entites disparues.
Fichiers modifies (5)
| Fichier | Modification |
|---|---|
| package.json | Ajout dep zundo |
| src/store/useMapStore.ts | Ajout middleware temporal |
| src/hooks/use-undo-redo.ts | Nouveau : hook useUndoRedo |
| src/routes/index.tsx | Cablage useShortcut("undo"/"redo") |
| src/components/shortcuts-dialog.tsx | Ajout undo/redo au groupe "General" |
Etape 1 : Installer zundo
bun add zundo
Etape 2 : Ajouter le middleware temporal au store
Wrapping : persist(temporal(stateCreator, temporalConfig), persistConfig)
Configuration du temporal :

- partialize : { devices, walls } seulement (pas le state UI)
- limit : 100 snapshots
- equality : comparaison par reference (pastState.devices === currentState.devices && pastState.walls === currentState.walls). Performant et correct car chaque action creatrice d'historique produit un nouvel array via spread ([...state.devices, newDevice]). Les actions UI-only (select, hover, toggleEditMode) ne touchent pas ces references donc ne sont jamais enregistrees.
- wrapTemporal : persist(storeInitializer, { name: "netplan-temporal" }) pour persister l'historique dans localStorage
  Etape 3 : Creer le hook useUndoRedo
  Nouveau fichier src/hooks/use-undo-redo.ts avec la logique suivante :
  handleUndo / handleRedo :

1. Verifier que pastStates/futureStates n'est pas vide
2. Capturer l'etat actuel (before)
3. Appeler temporal.undo() / temporal.redo()
4. Capturer le nouvel etat (after)
5. Diffier before/after pour trouver le floorId affecte
6. Si affectedFloor !== currentFloorId -> setCurrentFloor(affectedFloor)
7. Cleanup : invalider selectedDeviceId/selectedWallId/highlightedDeviceIds
   si les entites referencees n'existent plus dans le nouvel etat
   La fonction findAffectedFloorId compare les deux snapshots :

- Devices ajoutes/supprimes (diff par ID) -> retourne leur floorId
- Devices modifies (meme ID, reference differente) -> retourne leur floorId
- Meme logique pour les walls
  Pourquoi le cleanup UI ne cree pas de nouvelles entrees d'historique : les actions selectDevice(null), selectWall(null), setCurrentFloor(), setHighlightedDevices() ne modifient que des champs UI (selectedDeviceId, currentFloorId, etc.), jamais devices ni walls. Donc le equality de zundo les ignore.
  Etape 4 : Cabler les raccourcis
  Dans routes/index.tsx :
  const { handleUndo, handleRedo } = useUndoRedo();
  useShortcut("undo", handleUndo); // meta+z (deja defini dans shortcuts.ts)
  useShortcut("redo", handleRedo); // meta+shift+z / meta+y
  Etape 5 : Ajouter au dialog raccourcis
  Dans shortcuts-dialog.tsx, ajouter "undo" et "redo" au groupe "General".
  Edge cases couverts
  | Edge case | Solution |
  |---|---|
  | Undo sur un autre etage | findAffectedFloorId + auto-navigation via setCurrentFloor |
  | Device/Wall selectionne supprime par undo | Cleanup post-undo : selectDevice(null) / selectWall(null) si l'entite n'existe plus |
  | highlightedDeviceIds stale | Filtrage des IDs invalides post-undo |
  | Collision rejetee (no-op) | updateDevicePosition retourne avant set() si collision, donc aucun snapshot enregistre |
  | Actions UI-only (select, hover, theme) | L'equality par reference les ignore car devices/walls ne changent pas |
  | "Vider plan" dans Sidebar | Efface deja tous les netplan-\* de localStorage (inclut netplan-temporal), puis reload |
  | Drag en cours pendant undo | Le drag met a jour le state React Flow local. Le prochain drag-end ecrira updateDevicePosition qui sera coherent avec le nouvel etat du store |
  | localStorage plein | Limite a 100 snapshots (~1.8 MB max). Bien en dessous des limites navigateur |
