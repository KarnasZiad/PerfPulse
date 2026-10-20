# Pipeline d'ingestion

## D'une page à la base

```mermaid
sequenceDiagram
  participant P as Page + SDK
  participant I as Ingestion
  participant R as Redis
  participant W as Processeur
  participant T as TimescaleDB
  participant M as MongoDB

  P->>P: PerformanceObserver (LCP, CLS, INP, FCP, TTFB), error, unhandledrejection
  P->>I: visibilitychange → hidden : sendBeacon(lot)
  I->>I: clé connue ? Origin autorisée ? schéma ? (projets en mémoire)
  I->>R: INCR débit (projet, source), EXPIRE 60 s
  I->>R: XADD pp:events MAXLEN ~ 1 000 000 (lot enrichi)
  I-->>P: 204
  loop toutes les 2 s ou 200 lots
    W->>R: XREADGROUP GROUP processors
    W->>W: notation, bucket d'histogramme, empreinte des erreurs
    W->>T: INSERT ... (lignes du lot)
    W->>M: bulkWrite (groupes, occurrences, compteurs du jour)
    W->>R: XACK
  end
```

## Garanties

| Situation                        | Comportement                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Pic de trafic                    | L'ingestion répond en quelques ms ; le stream absorbe, le processeur rattrape |
| Processeur arrêté pendant un lot | Le lot reste en attente (PEL) ; un autre le reprend après 60 s (`XAUTOCLAIM`) |
| Lot qui échoue à chaque fois     | Après 5 livraisons, copié dans `pp:events:dead` puis acquitté                 |
| Base indisponible                | Le lot n'est pas acquitté ; les nouveaux s'accumulent dans le stream          |
| Stream plein (`MAXLEN`)          | Les plus anciens lots non lus sont évincés : la mémoire de Redis est bornée   |

La livraison est **au moins une fois** : un lot repris après un crash peut être écrit deux fois.
Pour des percentiles sur des milliers de mesures, un doublon rare est négligeable ; les compteurs
d'erreurs, eux, pourraient être légèrement surestimés. C'est le compromis assumé de l'[ADR 0003](../adr/0003-redis-streams.md).

## Bornes

| Borne                                   | Valeur          | Au-delà                    |
| --------------------------------------- | --------------- | -------------------------- |
| Corps d'une requête                     | 64 Ko           | `413`                      |
| Événements par lot                      | 50              | `400`                      |
| Requêtes par minute (projet, source)    | 600             | `429`                      |
| Longueur du stream                      | ~1 000 000 lots | éviction des plus anciens  |
| Lots lus par itération                  | 200             | lus à l'itération suivante |
| Exemples d'erreur par groupe et par lot | 5               | comptés mais non conservés |
