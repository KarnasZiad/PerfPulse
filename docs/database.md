# Modèle de données

## TimescaleDB — mesures et projets

| Table / vue          | Type                | Contenu                                                                                        | Rétention |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| `projects`           | table               | Nom, slug, clé publique, origines autorisées                                                   | —         |
| `api_tokens`         | table               | Jetons de lecture : empreinte HMAC, projet, révocation                                         | —         |
| `web_vitals`         | hypertable (1 jour) | Une ligne par mesure : métrique, valeur, notation, bucket, page, appareil, navigateur, release | 30 jours  |
| `page_views`         | hypertable (1 jour) | Une ligne par vue de page                                                                      | 30 jours  |
| `vitals_hourly`      | agrégat continu     | Comptes par heure, projet, métrique, appareil et bucket d'histogramme                          | 400 jours |
| `vitals_daily_pages` | agrégat continu     | Comptes par jour, projet, métrique, page et bucket                                             | 400 jours |
| `page_views_daily`   | agrégat continu     | Vues par jour, projet, page et appareil                                                        | 400 jours |

- **Compression** des hypertables après 7 jours, segmentées par `project_id, metric` : les requêtes
  du tableau de bord filtrent toujours sur ces colonnes.
- Les agrégats continus sont en **temps réel** (`materialized_only = false`) : la dernière heure non
  matérialisée est lue depuis les données brutes.
- Index `web_vitals (project_id, metric, time DESC)` pour les lectures récentes.

### Percentiles par histogramme logarithmique

TimescaleDB (sans l'extension _toolkit_) ne sait pas agréger un percentile dans un agrégat continu.
Chaque mesure reçoit donc un **bucket** : `floor(ln(v) / ln(1,05))`, la valeur `v` étant en
millisecondes (CLS × 1 000). Les agrégats comptent les mesures par bucket ; le p75 d'une période se
calcule en additionnant les comptes, puis en cherchant le bucket où le cumul atteint 75 %.

- Erreur relative au plus de ± 2,5 % (largeur d'un bucket : 5 %), sous la précision utile.
- Les agrégats se combinent sur n'importe quelle période ou dimension, ce qu'un percentile
  pré-calculé ne permet pas. Voir l'[ADR 0004](adr/0004-timescaledb-histogrammes.md).

## MongoDB — erreurs

| Collection     | `_id`                      | Contenu                                                                 | Rétention      |
| -------------- | -------------------------- | ----------------------------------------------------------------------- | -------------- |
| `error_groups` | empreinte (SHA-1)          | Projet, type, message, première/dernière apparition, total, navigateurs | —              |
| `error_events` | ObjectId                   | Exemples : pile, page, navigateur, release, date                        | 14 jours (TTL) |
| `error_daily`  | `<empreinte>:<AAAA-MM-JJ>` | Occurrences par jour                                                    | —              |

Index : `error_groups (projectId, lastSeen DESC)`, `error_events (fingerprint, at DESC)`,
`error_daily (projectId, day)`.

L'empreinte combine le projet, le type, le message **normalisé** (nombres, identifiants
hexadécimaux, UUID, URL et chaînes entre guillemets remplacés) et les trois premières lignes de la
pile sans numéros de ligne ni query string.

## Redis

| Clé                                  | Contenu                                    | TTL                  |
| ------------------------------------ | ------------------------------------------ | -------------------- |
| `pp:events`                          | Stream des lots reçus, groupe `processors` | `MAXLEN ~ 1 000 000` |
| `pp:events:dead`                     | Lots écartés après 5 échecs                | `MAXLEN ~ 10 000`    |
| `pp:rate:<projet>:<source>:<minute>` | Compteur de limitation de débit            | 60 s                 |
