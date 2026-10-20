# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique. Utilisez le formulaire privé de GitHub :
[Security → Report a vulnerability](https://github.com/KarnasZiad/PerfPulse/security/advisories/new).

Indiquez la version ou le commit concerné, les étapes pour reproduire et l'impact estimé. L'objectif
est d'accuser réception sous 72 heures et de publier un correctif accompagné d'un avis de sécurité.

## Périmètre

- SDK : exécution de code, fuite de données personnelles ou ralentissement de la page qui l'intègre
- Ingestion : contournement de la liste d'origines autorisées, saturation, injection de données dans
  un autre projet
- API et tableau de bord : lecture des données d'un projet sans jeton valide

## Documentation de sécurité

- [Modèle de menaces](docs/security/threat-model.md)
- [Données collectées et vie privée](docs/privacy.md)
- [Décisions d'architecture](docs/adr/)
