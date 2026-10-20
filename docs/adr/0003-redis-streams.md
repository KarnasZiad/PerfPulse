# ADR 0003 — Redis Streams entre l'ingestion et le stockage

- **Statut** : acceptée
- **Date** : 2026-10-20

## Contexte

Le trafic d'un site suit son audience : pics le soir, pendant une campagne, au lancement d'une
fonctionnalité. Écrire chaque lot directement en base lie la latence de l'ingestion à celle de
TimescaleDB et de MongoDB, et transforme le moindre ralentissement des bases en mesures perdues.

## Décision

- L'ingestion écrit chaque lot validé dans le **stream Redis `pp:events`** (`XADD`, `MAXLEN ~`) et
  répond aussitôt. Un lot reste un seul message : un `XADD` par requête, pas par événement.
- Le **processeur** lit en groupe de consommateurs (`XREADGROUP`, 200 lots), écrit par lots dans les
  bases, puis acquitte (`XACK`).
- Les messages d'un processeur arrêté sont repris par un autre après 60 s (`XAUTOCLAIM`) ; après
  5 livraisons, un message est copié dans `pp:events:dead` puis acquitté.
- Livraison **au moins une fois** : un doublon rare est accepté.

## Alternatives écartées

- **Kafka / Redpanda** : la référence pour des volumes beaucoup plus élevés, mais une
  infrastructure entière à exploiter pour une équipe qui a déjà Redis.
- **RabbitMQ** : très bon pour router des messages, moins adapté à la relecture et à la lecture
  par lots ; pas de rétention bornée en mémoire aussi simple que `MAXLEN`.
- **BullMQ** : une file de jobs, pensée pour des tâches unitaires avec reprises, pas pour des flux
  continus lus par lots de centaines d'éléments.
- **Écriture directe en base** : simple, mais couple la disponibilité de l'ingestion à celle des
  bases.

## Conséquences

- ✅ L'ingestion reste rapide et sans état ; un pic se résorbe dans le stream.
- ✅ Le processeur se met à l'échelle en ajoutant des consommateurs au groupe.
- ⚠️ La mémoire de Redis borne la file : au-delà de `MAXLEN`, les plus anciens lots non lus sont
  perdus. La longueur du stream et le retard du groupe sont exposés en métriques.
- ⚠️ Redis devient critique : persistance AOF activée.
