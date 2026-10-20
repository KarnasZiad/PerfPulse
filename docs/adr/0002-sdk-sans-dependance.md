# ADR 0002 — Un SDK sans dépendance, de moins de 5 Ko, qui envoie à la fermeture

- **Statut** : acceptée
- **Date** : 2026-10-20

## Contexte

Le SDK s'exécute sur des sites que nous ne contrôlons pas, souvent sur mobile. Un outil de mesure
qui dégrade ce qu'il mesure n'a aucune valeur. La bibliothèque `web-vitals` de Google est la
référence, mais elle couvre des cas (attribution détaillée) dont nous n'avons pas besoin et nous
voulons maîtriser chaque octet et chaque écouteur.

## Décision

- **Aucune dépendance d'exécution** ; les définitions de Google sont réimplémentées et testées sur
  des séquences d'entrées `PerformanceObserver` simulées.
- **Budget de 5 Ko** minifié et compressé (gzip), vérifié en CI par un script qui compresse le
  bundle : la CI échoue au moindre dépassement.
- **Collecte passive** (`PerformanceObserver` avec `buffered: true`), sans _polling_ ni travail au
  chargement. Les valeurs finales (LCP, CLS, INP) ne sont connues qu'à la fin de la vue.
- **Envoi à la fermeture** : `visibilitychange` vers `hidden` et `pagehide`, avec
  `navigator.sendBeacon` et un corps `text/plain`, requête « simple » sans pré-vol CORS. Repli sur
  `fetch` `keepalive`. **Jamais de nouvel essai** : une mesure perdue vaut mieux qu'une page
  ralentie ou une batterie vidée.
- **Robustesse** : chaque point d'entrée est entouré d'un `try/catch` ; une API absente (Safari
  sans INP, navigateur ancien) désactive simplement la métrique.
- Deux formats : module ES (`import { init }`) et script IIFE (`window.PerfPulse`).

## Alternatives écartées

- **Dépendre de `web-vitals`** : ~2 Ko de plus, un rythme de publication à suivre, et l'attribution
  inutilisée embarquée.
- **Envoi immédiat de chaque mesure** : une requête par métrique, sur des réseaux mobiles chers.

## Conséquences

- ✅ Le SDK pèse quelques kilo-octets et n'ajoute aucun travail sur le chemin critique.
- ⚠️ Les définitions évoluent (INP a remplacé FID en 2024) : les tests encodent les règles et
  servent de référence pour les mettre à jour.
- ⚠️ Les mesures d'une page fermée brutalement (crash, batterie) sont perdues : c'est vrai de tous
  les outils RUM.
