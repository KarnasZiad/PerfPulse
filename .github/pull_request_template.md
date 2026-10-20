## Objectif

<!-- Problème résolu, user story ou issue (ex. US-04, #42). -->

## Changements

-

## Comment tester

<!-- Étapes reproductibles pour le relecteur. -->

## Checklist de l'auteur

- [ ] Titre en Conventional Commits (`feat(sdk): ...`)
- [ ] Tests ajoutés ou mis à jour ; `pnpm test` et `pnpm lint` passent en local
- [ ] Documentation et ADR mis à jour si une décision change

## Checklist SDK (si `packages/sdk` change)

- [ ] Budget respecté : moins de 5 Ko minifié et compressé (`pnpm --filter @perfpulse/sdk size`)
- [ ] Aucune donnée personnelle collectée : pas de query string, pas de texte saisi, pas d'IP
- [ ] Aucune exception ne peut remonter dans la page hôte ; aucun impact sur le chargement

## Checklist sécurité

- [ ] Toute entrée externe (événements collectés, paramètres de l'API) est validée par un schéma Zod borné
- [ ] Un projet ne lit jamais les données d'un autre projet
- [ ] Aucun secret ni donnée personnelle dans les logs, les erreurs ou les fixtures

## Checklist performance

- [ ] L'ingestion répond sans attendre l'écriture en base (Redis Streams)
- [ ] Écritures par lots ; nouvelles requêtes sur un index ou un agrégat continu
- [ ] Les requêtes du tableau de bord bornent leur période et leur nombre de lignes
