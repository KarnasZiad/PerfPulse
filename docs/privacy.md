# Données collectées et vie privée

PerfPulse mesure **des pages, pas des personnes**. Le SDK s'exécute sur les sites de nos clients,
devant leurs visiteurs : la collecte doit être défendable devant un DPO, la CNDP (loi 09-08) ou une
autorité européenne (RGPD), sans bannière de consentement spécifique.

| Donnée                          | Collectée | Pourquoi / comment                                             |
| ------------------------------- | --------- | -------------------------------------------------------------- |
| Web Vitals, type de navigation  | oui       | L'objet même du service                                        |
| Chemin de la page               | oui       | Sans query string ni fragment, qui portent jetons et e-mails   |
| Message et pile d'une erreur    | oui       | Tronqués (512 et 4 096 caractères) ; aucun texte saisi         |
| Navigateur, système, appareil   | oui       | Catégories déduites du `User-Agent`, qui n'est pas conservé    |
| Pays                            | si fourni | Uniquement depuis l'en-tête d'un proxy de confiance            |
| Identifiant de session          | oui       | Aléatoire, en `sessionStorage` : il disparaît avec l'onglet    |
| Adresse IP                      | **non**   | Utilisée en mémoire pour la limitation de débit, jamais écrite |
| Cookies, identifiant persistant | **non**   | Aucun suivi d'un visiteur d'une visite à l'autre               |
| Contenu de la page, saisies     | **non**   | Ni DOM, ni valeur de champ, ni capture d'écran                 |

## Durées de conservation

| Données                          | Durée                     | Mécanisme                                    |
| -------------------------------- | ------------------------- | -------------------------------------------- |
| Mesures brutes et vues de page   | 30 jours                  | Politique de rétention TimescaleDB           |
| Agrégats horaires et quotidiens  | 400 jours                 | Politique de rétention des agrégats continus |
| Occurrences d'erreurs (exemples) | 14 jours                  | Index TTL MongoDB                            |
| Groupes d'erreurs                | tant que le projet existe | Message et pile d'exemple seulement          |

## Ce que doit faire l'intégrateur

- Ne pas mettre de donnée personnelle dans le **chemin** des URL (`/users/jean.dupont@...`).
- Préférer des messages d'erreur sans donnée utilisateur ; le SDK ne peut pas tout détecter.
- Mentionner la mesure d'audience technique dans sa politique de confidentialité.
