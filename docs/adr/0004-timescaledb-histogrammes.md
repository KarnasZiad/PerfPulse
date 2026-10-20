# ADR 0004 — TimescaleDB, et des percentiles par histogramme logarithmique

- **Statut** : acceptée
- **Date** : 2026-10-20

## Contexte

Le tableau de bord affiche le **75ᵉ percentile** de chaque métrique, comme Google, sur des périodes
de 24 h à 30 jours et par appareil, page ou release. Calculer un percentile exact sur les mesures
brutes de 30 jours est coûteux, et un percentile ne s'additionne pas : le p75 d'une journée ne se
déduit pas des p75 de ses heures.

## Décision

- **TimescaleDB** (PostgreSQL 17) : hypertables partitionnées par jour, compression après 7 jours,
  rétention de 30 jours sur les mesures brutes ; SQL standard et écosystème PostgreSQL.
- Chaque mesure reçoit un **bucket d'histogramme logarithmique** : `floor(ln(v) / ln(1,05))`, avec
  `v` en millisecondes (CLS × 1 000).
- Des **agrégats continus** (horaire par appareil, quotidien par page) comptent les mesures par
  bucket et par notation. Ils sont en temps réel et conservés 400 jours.
- Le p75 se calcule à la lecture : somme des comptes par bucket sur la période, cumul, premier
  bucket où le cumul atteint 75 %, valeur au milieu du bucket.

## Alternatives écartées

- **Extension TimescaleDB Toolkit** (`percentile_agg`, UDDSketch) : la solution « officielle », mais
  absente de l'image communautaire légère ; l'image HA qui la contient pèse près de 1 Go.
- **`percentile_cont` sur les données brutes** : exact, mais un parcours complet à chaque affichage,
  et impossible au-delà des 30 jours de rétention.
- **Percentile pré-calculé par heure** : rapide mais faux dès qu'on combine des heures ou des
  dimensions.

## Conséquences

- ✅ Les agrégats se combinent sur n'importe quelle période et dimension ; les requêtes lisent des
  centaines de lignes au lieu de millions.
- ✅ Erreur relative au plus de ± 2,5 %, bien sous ce que l'œil distingue sur un graphique.
- ⚠️ La base 1,05 est fixée : la changer impose de recalculer les buckets (nouvelle colonne).
- ⚠️ Les valeurs inférieures à 1 ms partagent le bucket 0 ; c'est sans importance pour ces métriques.
