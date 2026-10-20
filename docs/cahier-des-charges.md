# Cahier des charges — PerfPulse

## 1. Contexte

Les équipes web mesurent la performance en local (Lighthouse) ou en CI, sur une machine rapide et
un réseau stable. Leurs utilisateurs, eux, naviguent sur des téléphones d'entrée de gamme en 4G :
les chiffres du laboratoire ne disent rien de ce qu'ils vivent. Google classe pourtant les pages
selon les **Core Web Vitals mesurés sur le terrain** (LCP, INP, CLS).

Les outils de _Real User Monitoring_ du marché sont coûteux à l'événement, hébergés hors du pays et
alourdissent les pages avec des scripts de plusieurs dizaines de kilo-octets.

PerfPulse est une solution de **RUM auto-hébergée** : un SDK de moins de 5 Ko collecte les Web
Vitals et les erreurs JavaScript des vrais utilisateurs, une chaîne d'ingestion absorbe les pics,
et un tableau de bord montre le 75ᵉ percentile par page, appareil et version.

## 2. Objectifs

| Objectif                          | Indicateur de succès                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| Ne pas ralentir les sites clients | SDK < 5 Ko minifié et compressé, aucun travail pendant le chargement |
| Absorber les pics de trafic       | Ingestion > 2 000 requêtes/s par instance, p99 < 20 ms (test k6)     |
| Mesurer comme Google              | LCP, INP, CLS, FCP, TTFB ; seuils et p75 identiques à ceux de Google |
| Regrouper les erreurs utilement   | Une même erreur, quel que soit l'identifiant variable, = un groupe   |
| Respecter la vie privée           | Aucune donnée personnelle : ni IP, ni query string, ni texte saisi   |

## 3. Acteurs

| Acteur                    | Description                                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| **Visiteur d'un site**    | Navigue ; le SDK mesure sa page sans qu'il le remarque                    |
| **Développeur front-end** | Intègre le SDK, suit les Web Vitals et les erreurs après chaque release   |
| **Tech lead / produit**   | Suit les tendances, priorise les pages lentes                             |
| **Exploitant**            | Crée les projets, déploie et dimensionne la chaîne                        |
| _Attaquant_               | Injection de fausses mesures, saturation de l'ingestion, fuite de données |

## 4. Périmètre

### MVP (v1)

- **SDK** TypeScript sans dépendance : Web Vitals (LCP, INP, CLS, FCP, TTFB), erreurs
  (`error`, `unhandledrejection`), vues de page ; envoi groupé par `sendBeacon` quand la page est
  masquée ; échantillonnage ; budget de 5 Ko vérifié en CI.
- **Ingestion** Fastify : clé publique de projet, liste d'origines autorisées, limitation de débit,
  validation stricte, enrichissement (navigateur, système, type d'appareil), écriture dans un
  **Redis Stream**, réponse immédiate.
- **Processeur** : groupe de consommateurs Redis Streams, écritures par lots dans **TimescaleDB**
  (hypertables, agrégats continus, compression, rétention) et dans **MongoDB** pour les erreurs
  regroupées par empreinte ; reprise des messages orphelins, file des messages en échec.
- **API** de lecture : vue d'ensemble par métrique, séries temporelles du p75, pages les plus
  lentes, groupes d'erreurs et leur détail ; accès par jeton de lecture échangé contre une session.
- **Tableau de bord** Vue 3 + ECharts.

### Hors périmètre v1 (feuille de route)

- Source maps pour déminifier les piles d'appels.
- Alertes (seuil de p75 dépassé, nouvelle erreur après une release) vers Slack ou e-mail.
- Comptes utilisateurs et rôles ; marquage d'une erreur comme résolue.
- Suivi des parcours (_long tasks_, _resource timing_ détaillé), replay de session.

## 5. Exigences non fonctionnelles

| Domaine     | Exigence                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------- |
| Performance | L'ingestion ne touche aucune base de données sur le chemin de la requête                    |
| Robustesse  | Un processeur arrêté ne perd aucun événement : reprise via la liste des messages en attente |
| Robustesse  | Un message qui échoue cinq fois part dans une file dédiée sans bloquer les autres           |
| Sécurité    | Un projet ne lit et n'écrit jamais les données d'un autre ; entrées bornées et validées     |
| Vie privée  | IP jamais stockée ; URL réduite à son chemin ; messages d'erreur tronqués                   |
| Coût        | Données brutes compressées après 7 jours et supprimées après 30 ; agrégats gardés 400 jours |
| Qualité     | TypeScript strict, couverture > 80 %, CI avec scans de sécurité et budget de taille du SDK  |

## 6. Livrables

Code source, SDK publiable, tests automatisés, pipeline CI/CD, images Docker, scénario de charge
k6, documentation (ce cahier des charges, user stories, protocole, C4, ADR, modèle de menaces,
politique de données).
