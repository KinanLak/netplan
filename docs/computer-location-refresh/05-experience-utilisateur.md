# Phase 5 - Expérience utilisateur

## Objectif

Rendre la fraîcheur et les limites de la localisation compréhensibles sans exposer la complexité LibreNMS par défaut.

L'interface doit rester utilisable pendant les refreshs et les pannes.

## Composant de refresh partagé

Créer une source UX commune utilisée dans :

- la barre de carte ;
- le panneau inventaire ;
- le panneau de détail d'un ordinateur ;
- la future zone administration.

Toutes les surfaces observent le même état Convex. Elles ne maintiennent pas chacune leur propre pending state métier.

## États du bouton

### Prêt

- Icône refresh.
- Âge masqué si frais.
- Tooltip avec dernière actualisation et prochaine exécution.

### Confirmation requise

Si le snapshot a moins de deux minutes :

> Les données ont été actualisées récemment. Un nouveau discovery sollicite les switches. Forcer l'actualisation ?

Utiliser le composant `AlertDialog` existant, pas `window.confirm`.

### En cours

- Bouton non cliquable.
- Anciennes positions conservées.
- Fond du bouton utilisé comme barre de progression.
- Progression interpolée sur 60 secondes.
- Ne pas atteindre visuellement 100 % avant la réussite réelle.
- Si le cycle dépasse 60 secondes, rester proche de la fin avec une animation d'activité.

### Succès manuel

- État visuel de succès pendant 15 secondes.
- Bouton non cliquable pendant ce feedback.
- Toast de confirmation.
- L'âge revient ensuite à l'affichage normal.

### Erreur

- Dernier snapshot conservé.
- État périmé clairement visible.
- Message actionnable sans détail sensible.
- Clic manuel disponible selon le single-flight et la garde de snapshot récent.

## Progression globale et détail

### Vue compacte

Afficher seulement :

- progression globale ;
- `Actualisation en cours` ;
- éventuellement `1/2 switches terminés`.

### Vue détaillée dépliable

Pour chaque switch :

- actualisation en cours ;
- succès et heure ;
- retry ;
- timeout ou erreur ;
- durée ;
- nombre d'observations fraîches.

Ne pas afficher `en attente Dispatcher` ou `discovery démarré` comme faits si l'API ne permet pas de les distinguer.

## Toasts et notifications

Le dépôt ne possède pas encore de système de toast. Introduire une convention globale plutôt qu'un composant spécifique au refresh.

Règles :

- succès manuel : toast ;
- succès automatique : silencieux ;
- premier échec automatique : indicateur discret ;
- échecs persistants ou snapshot périmé : bannière ;
- échec manuel : toast et détail disponible ;
- retour à la normale : disparition de la bannière et éventuellement notification discrète.

Toutes les notifications importantes utilisent `aria-live` de façon non intrusive.

## Fraîcheur

Seuils initiaux :

- plage de jour : frais jusqu'à 10 minutes après le dernier succès ;
- plage réduite : frais jusqu'à 75 minutes ;
- NetBox : avertissement après 24 heures sans succès ;
- bannière après deux cycles automatiques consécutifs échoués ou dès que le snapshot dépasse son seuil de fraîcheur ;
- un cycle en cours conserve l'état du dernier snapshot jusqu'à publication.

### Donnée fraîche

- Aucun badge permanent.
- Tooltip simple : `Actualisé il y a 3 min`.

### Donnée vieillissante

- Accent visuel discret au survol.
- Détail avec date relative et date exacte au tooltip.

### Donnée périmée

- Badge visible.
- Anciennes positions atténuées.
- Texte expliquant que le dernier refresh a échoué ou n'a pas encore eu lieu.

Ne jamais utiliser uniquement la couleur pour transmettre l'état.

## État d'un ordinateur

### En ligne

Afficher prise, switch/port dans les détails, heure d'observation et confiance.

### Manquant

Conserver la position sans affirmer immédiatement `hors ligne`. Le détail indique qu'une première absence a été observée.

### Hors ligne

Après deux cycles absents :

- position atténuée ;
- libellé `Hors ligne` ;
- dernière détection ;
- dernière prise ;
- compte du temps depuis la dernière présence.

Après 15 jours :

- retirer du plan actif ;
- afficher dans une section `Hors ligne` ;
- permettre de retrouver et focaliser la dernière position connue.

Le retrait après 15 jours est un filtre de la vue active. Il ne supprime ni le device durable ni ses liens.

### Non résolvable

Afficher la raison précise :

- patch panel incomplet ;
- prise sans câble ;
- port inconnu ;
- MAC conflictuelle.

Une prise résolue mais non placée utilise l'état distinct `Résolu, prise non placée`. Une observation ambiguë utilise l'état distinct `Ambigu`. Un conflit de plusieurs postes sur une prise utilise `Conflit de prise`.

### Ambigu

Ne pas montrer une position arbitraire. Afficher les candidates dans le détail technique.

## Couverture des prises

Comme aucune prise n'est actuellement placée, ajouter une vue de progression :

- total de prises ;
- prises avec câble direct ;
- prises placées ;
- prises patch panel incomplètes ;
- prises sans câble ;
- ordinateurs localisés réseau ;
- ordinateurs positionnables sur le plan.

Cette vue transforme un prérequis manuel en travail mesurable plutôt qu'en échec mystérieux.

## Placement des prises

Le panneau inventaire doit faciliter le placement progressif des prises :

- filtre `prises non placées` ;
- groupement par location NetBox ;
- indication de la couverture ;
- prévention des doublons par site ;
- mise à jour immédiate des ordinateurs devenus positionnables.

Le refresh de localisation ne doit pas créer une prise à une coordonnée arbitraire.

## Mode édition et permissions

Aujourd'hui, tous les utilisateurs peuvent agir et `isEditMode` n'est pas une permission.

Pour cette livraison :

- le bouton est visible aux utilisateurs actuels ;
- faute d'authentification, les actions d'administration de site sont également accessibles aux utilisateurs actuels ;
- le serveur impose quand même single-flight, confirmation et validation ;
- l'origine anonyme disponible peut être journalisée sans être considérée comme une identité de sécurité.

Cette ouverture temporaire doit être explicite dans l'UI et couverte côté serveur. L'arrivée du SSO remplacera cette politique centrale sans modifier les composants.

Préparer une fonction centrale de permission afin que le futur SSO puisse restreindre le refresh selon les groupes, sans réécrire chaque bouton.

## Administration incluse

La surface administration fait partie de cette livraison. Elle permet :

- consulter sites, sources, switches et horaires ;
- voir dernier et prochain cycle, backoff et erreurs ;
- déclencher un refresh manuel ;
- activer ou désactiver les cycles automatiques du site ;
- consulter couverture, historique et snapshots planifiés.

Elle ne permet pas d'éditer ou d'afficher les tokens.

## Mobile et responsive

- Le bouton compact reste utilisable sur mobile.
- Le détail s'ouvre dans un sheet adapté.
- La barre ne dépasse pas la largeur de la carte.
- Les tooltips possèdent une alternative accessible au toucher.
- Les listes historiques et hors ligne sont virtualisées ou paginées.

## Scénarios UX

### Ouverture normale

```text
L'utilisateur ouvre Netplan
Le dernier cycle a moins de cinq minutes
La carte s'affiche immédiatement
Aucun toast et aucun refresh supplémentaire
```

### Refresh manuel

```text
L'utilisateur clique
Le bouton progresse, ancienne carte visible
Un switch finit puis le second
Le snapshot est publié
Le bouton devient succès 15 secondes
Un toast confirme l'actualisation
```

### Échec automatique

```text
Premier échec : indicateur discret
Retry échoué : backoff
Snapshot conservé et âge visible
Échecs persistants : bannière
Clic manuel : tentative immédiate
```

### Prise non placée

```text
L'ordinateur est vu et résolu vers WS-042
WS-042 n'a pas de coordonnées Netplan
Le détail affiche la prise et la raison
L'ordinateur apparaît dans la liste des localisés non positionnables
```

## Tests obligatoires

- Toutes les surfaces reflètent le même cycle.
- Confirmation lorsque le snapshot a moins de deux minutes.
- Progression interpolée sans faux 100 %.
- Succès verrouillé 15 secondes.
- Cycles automatiques silencieux.
- Bannière après erreurs persistantes.
- Affichage ancien pendant refresh et erreur.
- Fraîcheur masquée ou visible selon état.
- Raisons non résolvables exactes.
- Transition manquant, hors ligne, expiration 15 jours.
- Accessibilité clavier, focus, `aria-live` et contraste.
- Responsive desktop et mobile.

## Critères d'acceptation

- L'utilisateur comprend si une position est actuelle, ancienne ou impossible.
- L'interface ne bloque jamais toute la carte pendant un refresh.
- Les surfaces ne déclenchent pas plusieurs jobs.
- L'absence de coordonnées de prise est clairement distinguée d'une panne LibreNMS.
- Le feedback automatique n'est pas bruyant.
- `bun run check` est vert.
