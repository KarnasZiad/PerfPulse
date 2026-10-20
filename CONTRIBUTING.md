# Contribuer à PerfPulse

## Flux de travail

1. Créer une branche depuis `main` : `feat/<sujet>`, `fix/<sujet>`, `docs/<sujet>`, `chore/<sujet>`.
2. Commiter en [Conventional Commits](https://www.conventionalcommits.org/fr/), vérifié par commitlint.
3. Ouvrir une pull request en remplissant le template (checklists SDK, sécurité et performance).
4. La CI doit être verte : format, lint, typecheck, tests et couverture, budget de taille du SDK,
   build, tests d'intégration Testcontainers, images Docker scannées, CodeQL, Trivy et revue des
   dépendances.
5. Fusion en _squash merge_. `main` est protégée : pas de push direct, pull request et checks CI
   obligatoires. Le dépôt a un seul mainteneur, donc aucune approbation n'est exigée ; en équipe,
   la règle passe à une approbation d'un code owner (`CODEOWNERS`).

## Prérequis

- Node.js 22 (`.nvmrc`), pnpm 10 via Corepack (`corepack enable`)
- Docker pour TimescaleDB, MongoDB et Redis en local et pour les tests d'intégration

## Commandes

| Commande                            | Rôle                                                        |
| ----------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                          | Ingestion, processeur, API et tableau de bord en mode watch |
| `pnpm lint`                         | ESLint avec règles typées, zéro avertissement toléré        |
| `pnpm typecheck`                    | TypeScript strict sur tous les packages                     |
| `pnpm test:coverage`                | Tests unitaires et HTTP avec seuils de couverture           |
| `pnpm test:integration`             | TimescaleDB, MongoDB et Redis réels avec Testcontainers     |
| `pnpm --filter @perfpulse/sdk size` | Taille du SDK minifié et compressé, budget de 5 Ko          |

## Règles propres au SDK

Le SDK s'exécute sur les sites des clients : il doit être **invisible**.

- Aucune dépendance d'exécution, aucune API indisponible sur les navigateurs ciblés sans repli.
- Aucune exception ne doit atteindre la page hôte : chaque point d'entrée est protégé.
- Aucun travail pendant le chargement : collecte passive par `PerformanceObserver`, envoi groupé au
  moment où la page est masquée.
- Aucune donnée personnelle : l'URL est réduite à son chemin, les messages d'erreur sont tronqués.

## Revue de code

Le relecteur vérifie en priorité : validation et bornage des entrées, cloisonnement par projet,
absence de donnée personnelle, coût par événement (allocation, requêtes) et taille du SDK.
