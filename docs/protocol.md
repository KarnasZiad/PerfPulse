# Protocole de collecte (v1)

Le SDK envoie des **lots** d'événements à `POST /v1/collect`. Le format est volontairement compact :
chaque octet compte dans le budget du SDK et dans la bande passante des visiteurs mobiles.

## Transport

- `navigator.sendBeacon(url, Blob)` quand la page est masquée (`visibilitychange` → `hidden`, ou
  `pagehide`) ; repli sur `fetch(..., { keepalive: true })`.
- `Content-Type: text/plain;charset=UTF-8` : c'est une requête « simple » au sens de CORS, sans
  pré-vol `OPTIONS`. Le corps est du JSON.
- Le navigateur ajoute l'en-tête `Origin`, que l'ingestion compare à la liste du projet.
- Réponse `204` sans corps, ou `4xx` / `429` / `503` ; le SDK ne réessaie jamais (une mesure perdue
  vaut mieux qu'une page ralentie).

## Lot

```json
{
  "v": 1,
  "k": "pk_9f2c...",
  "s": "Hk3n0x1Wq8m2v4c7Zb5Ra9",
  "p": "/produits/42",
  "r": "2026.10.3",
  "ev": [
    { "t": "view", "nt": "navigate" },
    { "t": "vital", "n": "LCP", "v": 2140.5 },
    { "t": "vital", "n": "CLS", "v": 0.04 },
    {
      "t": "error",
      "m": "Cannot read properties of undefined (reading 'id')",
      "st": "TypeError: ...",
      "src": "error"
    }
  ]
}
```

| Champ | Type    | Bornes                    | Rôle                                                 |
| ----- | ------- | ------------------------- | ---------------------------------------------------- |
| `v`   | entier  | `1`                       | Version du protocole                                 |
| `k`   | texte   | `pk_` + 32 caractères     | Clé **publique** du projet (visible dans la page)    |
| `s`   | texte   | 22 caractères base64url   | Session : aléatoire, par onglet, sans cookie         |
| `p`   | texte   | 1 à 512, commence par `/` | Chemin de la page, **sans** query string ni fragment |
| `r`   | texte   | 64 au plus, optionnel     | Release déployée, pour comparer avant et après       |
| `ev`  | tableau | 1 à 50 événements         | Événements de la vue de page                         |

## Événements

| `t`     | Champs                                                              | Notes                                                |
| ------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `view`  | `nt` : `navigate`, `reload`, `back-forward`, `prerender`, `restore` | Une par vue ; `restore` = page servie par le bfcache |
| `vital` | `n` : `LCP`, `INP`, `CLS`, `FCP`, `TTFB` ; `v` : nombre ≥ 0         | Millisecondes, sauf CLS (sans unité)                 |
| `error` | `m` (512), `st` (4 096), `src` : `error` ou `rejection`             | Tronqués par le SDK puis revalidés                   |

L'ingestion **ignore** les valeurs aberrantes plutôt que de rejeter le lot entier : un LCP de plus
de 60 s ou un CLS supérieur à 10 relève d'un onglet resté en arrière-plan, pas d'une vraie mesure.

## Seuils

Identiques à ceux de Google (75ᵉ percentile) :

| Métrique | Bon        | À améliorer | Mauvais    |
| -------- | ---------- | ----------- | ---------- |
| LCP      | ≤ 2 500 ms | ≤ 4 000 ms  | > 4 000 ms |
| INP      | ≤ 200 ms   | ≤ 500 ms    | > 500 ms   |
| CLS      | ≤ 0,1      | ≤ 0,25      | > 0,25     |
| FCP      | ≤ 1 800 ms | ≤ 3 000 ms  | > 3 000 ms |
| TTFB     | ≤ 800 ms   | ≤ 1 800 ms  | > 1 800 ms |

## Enrichissement côté serveur

L'ingestion ajoute le navigateur, le système et le type d'appareil (déduits du `User-Agent`), le
pays si un proxy de confiance le fournit, et l'horodatage de réception. **L'adresse IP sert
uniquement à la limitation de débit et n'est jamais écrite.**
