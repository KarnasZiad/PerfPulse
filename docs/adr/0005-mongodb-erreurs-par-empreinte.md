# ADR 0005 — MongoDB pour les erreurs, regroupées par empreinte

- **Statut** : acceptée
- **Date** : 2026-10-20

## Contexte

Une même erreur JavaScript arrive des milliers de fois avec des variations sans importance :
identifiant d'objet, URL avec paramètres, numéro de ligne d'un bundle minifié. Le développeur veut
voir **une ligne par problème**, avec son volume, et quelques exemples récents. La forme d'une
erreur (pile, contexte) varie selon le navigateur.

## Décision

- Une **empreinte** SHA-1 de : projet, type, message normalisé (nombres, hexadécimal, UUID, URL et
  chaînes entre guillemets remplacés) et trois premières lignes de pile sans position ni query string.
- **MongoDB** : `error_groups` (un document par empreinte, mis à jour par `$inc`, `$max`, `$min`),
  `error_events` (exemples, index TTL de 14 jours) et `error_daily` (compteurs par jour).
- Écritures du processeur en `bulkWrite` non ordonné : un lot de 200 messages = quelques requêtes.

## Alternatives écartées

- **Tout dans TimescaleDB** : possible en `jsonb`, mais les mises à jour par groupe (compteurs,
  dernière apparition) sont des écritures aléatoires que les hypertables gèrent mal.
- **Pas de regroupement** : une liste de 10 000 erreurs identiques n'aide personne.

## Conséquences

- ✅ Le tableau de bord lit quelques dizaines de groupes au lieu de milliers d'occurrences.
- ✅ Les exemples expirent seuls (TTL) ; seuls les groupes et les compteurs restent.
- ⚠️ La normalisation peut fusionner deux erreurs distinctes au message très générique ; la pile
  dans l'empreinte limite ce risque.
- ⚠️ Sans source maps (v2), les piles de bundles minifiés restent peu lisibles.
