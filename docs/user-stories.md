# User stories

Priorisation MoSCoW. Les critères marqués 🔒 sont aussi des exigences de sécurité ou de vie privée
couvertes par des tests automatisés.

## Epic 1 — Collecter sans gêner

**US-01 · Intégrer le SDK en une ligne** — _Must_

> En tant que développeur front-end, je veux mesurer mes pages sans ralentir mon site.

- Une balise `<script>` ou un import npm suivi de `init({ key })` suffit.
- Le SDK fait moins de 5 Ko minifié et compressé ; la CI échoue au-delà.
- Rien n'est envoyé pendant le chargement : l'envoi se fait quand la page est masquée.
- 🔒 Une erreur interne du SDK n'atteint jamais la page hôte.

**US-02 · Mesurer les Web Vitals comme Google** — _Must_

- LCP, INP, CLS, FCP et TTFB sont mesurés avec les définitions et les seuils de Google
  (« bon », « à améliorer », « mauvais »).
- Le CLS suit la règle des fenêtres de session (écart de 1 s, fenêtre de 5 s au plus).
- Une page restaurée depuis le _back/forward cache_ est mesurée comme une nouvelle vue.

**US-03 · Capturer les erreurs JavaScript** — _Must_

- Les erreurs non interceptées et les promesses rejetées sans gestionnaire sont envoyées avec leur
  pile d'appels tronquée.
- Au plus 10 erreurs par vue de page ; une erreur répétée n'est envoyée qu'une fois.

**US-04 · Respecter la vie privée des visiteurs** — _Must_

- 🔒 L'URL est réduite à son chemin : ni query string ni fragment, qui contiennent souvent des
  jetons ou des e-mails.
- 🔒 L'adresse IP n'est jamais stockée ; aucun cookie n'est déposé ; l'identifiant de session est
  aléatoire et ne survit pas à l'onglet.
- Le développeur peut réduire le volume par échantillonnage (`sampleRate`).

## Epic 2 — Ingérer de façon fiable

**US-05 · Refuser les données qui ne viennent pas de mon site** — _Must_

- 🔒 Une requête dont l'`Origin` n'est pas autorisée pour le projet est refusée (`403`).
- 🔒 Clé inconnue, corps de plus de 64 Ko, lot de plus de 50 événements, champ hors bornes : `4xx`.
- 🔒 Un débit anormal par projet et par source est limité (`429`).

**US-06 · Ne rien perdre en cas d'incident** — _Must_

- L'ingestion répond dès que le lot est écrit dans Redis, sans attendre les bases.
- Un processeur arrêté au milieu d'un lot le voit repris par un autre après 60 s.
- Un lot qui échoue cinq fois est mis de côté dans une file d'erreurs, consultable.

## Epic 3 — Comprendre la performance

**US-07 · Voir l'état de mon site en un coup d'œil** — _Must_

> En tant que tech lead, je veux savoir si mes utilisateurs ont une bonne expérience.

- Pour chaque métrique : p75 sur la période, part de « bon / à améliorer / mauvais », évolution par
  rapport à la période précédente.
- Filtres : 24 h, 7 jours, 30 jours ; mobile, tablette, ordinateur.

**US-08 · Suivre une métrique dans le temps** — _Must_

- Série du p75 par heure (24 h) ou par jour (7 et 30 jours), avec les seuils de Google.

**US-09 · Trouver les pages lentes** — _Should_

- Pages classées par nombre de vues, avec leur p75 LCP, INP et CLS.

## Epic 4 — Corriger les erreurs

**US-10 · Voir les erreurs regroupées** — _Must_

- Une erreur qui ne diffère que par un identifiant, un nombre ou une URL forme un seul groupe.
- Pour chaque groupe : message, nombre d'occurrences sur la période, première et dernière
  apparition, navigateurs touchés.

**US-11 · Comprendre une erreur** — _Should_

- Détail : pile d'appels d'exemples récents, page, navigateur, release ; occurrences par jour.

## Epic 5 — Accéder au tableau de bord

**US-12 · Ouvrir le tableau de bord d'un projet** — _Must_

- L'exploitant crée un projet et un jeton de lecture en ligne de commande ; le jeton n'est affiché
  qu'une fois et n'est stocké qu'en empreinte.
- 🔒 Le jeton est échangé contre une session (cookie `HttpOnly`, `SameSite=Strict`) : il ne reste
  pas dans le navigateur.
- 🔒 Une session ne donne accès qu'aux projets de ses jetons ; un autre projet répond `404`.
