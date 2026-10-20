# ADR 0006 — Fastify, postgres.js et politique de versions

- **Statut** : acceptée
- **Date** : 2026-10-20

## Contexte

L'ingestion est sur le chemin de chaque page vue de chaque client : son coût par requête compte.
Le processeur insère des centaines de lignes à la fois.

## Décision

- **Fastify 5** pour l'ingestion et l'API : parmi les frameworks Node.js les plus rapides, avec
  limitation de débit, Helmet et cookies officiels. **Zod 4** valide le format de collecte, partagé
  avec le SDK par le package `@perfpulse/protocol`.
- **postgres.js** : insertions multi-lignes paramétrées en une instruction (`sql(rows, columns)`),
  pipeline de requêtes, migrations SQL lisibles (TimescaleDB s'exprime en SQL, pas en ORM).
- **ioredis** pour les streams, **driver MongoDB officiel**.
- **Vue 3 + ECharts** pour le tableau de bord (`echarts/core` importé par module).
- **esbuild** pour le SDK : bundle minifié en quelques millisecondes.
- **ESM natif** et TypeScript `nodenext` côté serveur.

| Dépendance    | Version              | Raison                                                   |
| ------------- | -------------------- | -------------------------------------------------------- |
| Node.js       | 22 LTS               | LTS jusqu'en avril 2027                                  |
| TypeScript    | 5.9                  | typescript-eslint ne supporte pas encore TypeScript 7    |
| Fastify       | 5                    | Version courante                                         |
| TimescaleDB   | 2.30 (PostgreSQL 17) | Image communautaire, compression et agrégats continus    |
| MongoDB       | 8                    | Version courante de MongoDB Atlas                        |
| Redis         | 7.4                  | Streams, `XAUTOCLAIM`                                    |
| ioredis       | 5                    | Version éprouvée ; la v6 sera évaluée dans une PR dédiée |
| Vue / ECharts | 3.5 / 6              | Versions courantes                                       |

Dependabot propose les mises à jour mineures et correctives chaque semaine ; les versions majeures
font l'objet d'une pull request dédiée.

## Conséquences

- ⚠️ ESM impose des extensions `.js` dans les imports TypeScript.
- ⚠️ Sans ORM, le schéma vit dans les migrations SQL : les requêtes sont couvertes par des tests
  d'intégration sur un vrai TimescaleDB.
