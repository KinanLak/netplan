# Preuve opérationnelle du trigger LibreNMS

## Portée

Cette preuve conserve le résultat du test réel effectué pendant l'audit initial. Elle n'est pas exécutée par les tests locaux et ne contient ni token, ni réponse HTTP brute, ni MAC.

## Environnement observé

- LibreNMS `25.7`.
- Switch d'accès d'Arles anonymisé dans cette trace.
- Dispatcher actif avec 16 workers.
- Aucun job en attente observé au moment du test.

## Requête validée

```text
GET /api/v0/devices/{hostname-ou-id}/discover
X-Auth-Token: <secret serveur>
Cache-Control: no-store
```

L'endpoint a un effet malgré la méthode `GET`. Il doit rester exclusivement côté serveur, sans cache, préchargement ni redirection vers un autre hôte.

## Résultat observé

1. L'API répond immédiatement `Device will be rediscovered`.
2. `last_discovered` passe à `null`.
3. Le Dispatcher exécute le discovery.
4. Un nouveau `last_discovered` apparaît environ 42 secondes plus tard.
5. La FDB est effectivement mise à jour.

Après le discovery :

| Mesure                            | Valeur |
| --------------------------------- | ------ |
| Lignes FDB présentes              | 308    |
| Lignes rafraîchies par le cycle   | 202    |
| Anciennes lignes encore présentes | 106    |

Cette observation démontre simultanément que le trigger fonctionne et que la présence d'une ligne dans la FDB ne prouve pas sa fraîcheur. La phase 3 doit comparer `updated_at` aux bornes de la tentative qui a produit le résultat.

## Usage futur

- Les tests automatisés simulent ce contrat sans appeler l'instance réelle.
- Les smoke tests de déploiement répètent explicitement le scénario sur les switches d'accès configurés.
- Un timeout avec `last_discovered = null` reste `uncertain` et ne doit jamais provoquer un second trigger immédiat.
- Les logs conservent le cycle, le device et la catégorie de résultat, jamais le token ou la réponse brute.
