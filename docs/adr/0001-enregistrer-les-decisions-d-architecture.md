# ADR 0001 — Enregistrer les décisions d'architecture

- **Statut** : acceptée
- **Date** : 2026-10-20

## Contexte

Une chaîne de mesure fait des compromis qui surprennent : percentiles approchés, livraison au moins
une fois, données brutes supprimées après 30 jours. Ils doivent être expliqués, pas découverts.

## Décision

Chaque décision structurante est consignée dans un ADR au format de Michael Nygard (contexte,
décision, conséquences, alternatives), versionné avec le code et relu dans la pull request qui
l'introduit. Un ADR accepté n'est jamais réécrit : un nouvel ADR le remplace.

## Conséquences

- Un nouveau contributeur retrouve la justification des choix sans fouiller l'historique.
- Le modèle de menaces et la politique de données référencent les ADR.
