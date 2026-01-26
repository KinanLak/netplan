# Cahier des charges — Frontend Cartographie Physique Réseau

## 1) Objectif

Développer une application web permettant de :

* visualiser un **plan physique réseau** (bâtiment / étage)
* placer manuellement des équipements IT
* éditer leur position via drag & drop
* consulter les métadonnées d’un équipement
* simuler l’intégration future avec Netbox / LibreNMS via données mockées

Le projet est **frontend-only** pour cette phase.

---

## 2) Stack technique

### Runtime & build

* Bun (runtime)
* Vite
* React 19
* TypeScript

### UI

* TailwindCSS
* shadcn/ui (drawer, dialog, buttons)

### Canvas

* React Flow (SVG renderer)

### State

* Zustand (ou équivalent léger)

---

## 3) Architecture globale

```
src/
 ├── app/
 │    └── App.tsx
 │
 ├── canvas/
 │    ├── FlowCanvas.tsx
 │    ├── nodeTypes/
 │    │      ├── RackNode.tsx
 │    │      ├── SwitchNode.tsx
 │    │      ├── PcNode.tsx
 │    │      └── WallPortNode.tsx
 │
 ├── panels/
 │    └── DeviceDrawer.tsx
 │
 ├── store/
 │    └── useMapStore.ts
 │
 ├── mock/
 │    ├── buildings.ts
 │    └── devices.ts
 │
 └── types/
      └── map.ts
```

---

## 4) Modèle de données (mock)

### Building / Floor

```ts
Building {
  id: string
  name: string
  floors: Floor[]
}

Floor {
  id: string
  name: string
  backgroundImage?: string
}
```

---

### Device (objet placé sur plan)

```ts
Device {
  id: string
  type: "rack" | "switch" | "pc" | "wall-port"
  name: string
  hostname?: string
  floorId: string

  position: {
    x: number
    y: number
  }

  size: {
    width: number
    height: number
  }

  metadata: {
    ip?: string
    status?: "up" | "down"
    model?: string
  }
}
```

---

## 5) Fonctionnalités principales

---

# 5.1 Navigation hiérarchique

UI :

* Sidebar gauche
* Liste :

  * bâtiments
  * étages

Fonction :

* sélectionner un étage charge son canvas React Flow
* vide si aucun device

---

# 5.2 Canvas React Flow

### Paramètres obligatoires

* Snap to grid activé
* Grid visible
* Zoom + pan
* Désactivation des edges

### Comportement :

* drag node → met à jour position store
* clic node → ouvre panneau détails

---

# 5.3 Placement d’objets

UI :

* Toolbar (haut ou droite)

Boutons :

* Ajouter Rack
* Ajouter Switch
* Ajouter PC
* Ajouter Prise murale

Fonction :

* crée un device mock
* l’ajoute au centre du viewport

---

# 5.4 Types de nodes

---

## Rack Node

Affichage :

* rectangle vertical
* label du rack
* indicateur nombre d’éléments (mock)

Interaction :

* clic → drawer détails

---

## Switch Node

Affichage :

* rectangle horizontal
* 24 ports visuels (grid 2x12)
* ports colorés selon état mock

Interaction :

* clic port → highlight
* clic node → drawer

---

## PC Node

Affichage :

* icône PC
* hostname visible

---

## Wall Port Node

Affichage :

* petite prise murale stylisée

---

# 5.5 Panneau de détails (Drawer)

Quand clic sur un objet :

Affiche :

* Nom
* Type
* Hostname
* IP
* Modèle
* Statut

Boutons :

* Supprimer
* Fermer

---

# 5.6 Persistance locale

Pour cette phase :

* Sauvegarde dans `localStorage`
* Chargement au démarrage

Structure :

```
floors
devices
viewport state
```

---

# 5.7 Mode édition

Toujours actif (pas de mode view pour l’instant).

Fonctions :

* drag
* delete
* multi-select (bonus)
* ctrl+wheel zoom

---

## 6) Contraintes UX

* Snappy (pas d’animations lourdes)
* Snap grid obligatoire
* Pas d’auto-layout
* Pas de connexions logiques

---

## 7) Contraintes techniques React Flow

À implémenter :

* custom nodeTypes
* controlled nodes state
* onNodesChange
* onNodeDragStop
* viewport persistence

---

## 8) Faux dataset initial

Créer :

### Exemple :

* 1 bâtiment
* 2 étages
* par étage :

  * 1 rack
  * 2 switches
  * 5 PCs
  * 4 wall ports

---

## 9) Bonus (optionnel mais utile)

Si temps dispo :

* Export JSON du plan
* Import JSON
* Mini-map React Flow
* Background image par étage (plan PNG)

---

## 10) Résultat attendu

Application web :

* fonctionnelle
* drag & drop fluide
* visuellement propre
* extensible vers backend réel

---

## 11) Points d’extension futurs (non implémentés)

* Sync Netbox
* état LibreNMS live
* WebSocket multi-user
* droits utilisateurs
* versioning des plans
