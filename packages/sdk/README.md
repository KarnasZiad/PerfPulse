# @perfpulse/sdk

SDK de _Real User Monitoring_ : Web Vitals (LCP, INP, CLS, FCP, TTFB) et erreurs JavaScript de vos
vrais visiteurs. **Environ 2,5 Ko** minifié et compressé, sans dépendance, sans cookie.

## Intégration

Module ES :

```ts
import { init } from '@perfpulse/sdk';

init({
  key: 'pk_...', // clé publique du projet
  endpoint: 'https://rum.example.ma/v1/collect',
  release: import.meta.env.VITE_RELEASE, // optionnel : comparer avant / après un déploiement
  sampleRate: 0.5, // optionnel : mesurer une session sur deux
});
```

Balise `<script>`, à placer dans le `<head>` pour ne manquer aucune mesure :

```html
<script src="https://rum.example.ma/perfpulse.iife.js"></script>
<script>
  PerfPulse.init({ key: 'pk_...', endpoint: 'https://rum.example.ma/v1/collect' });
</script>
```

`init()` renvoie une fonction qui arrête la mesure et retire tous les écouteurs.

## Ce que fait le SDK, et ce qu'il ne fait pas

- Il observe passivement les entrées de performance du navigateur (`PerformanceObserver`) et les
  erreurs non interceptées, puis envoie **un seul lot** quand la page est masquée
  (`navigator.sendBeacon`).
- Il ne modifie jamais le DOM, ne réessaie jamais un envoi et n'émet aucune exception dans la page.
- Il ne collecte **ni query string, ni fragment, ni adresse IP, ni contenu saisi** : voir la
  [politique de données](../../docs/privacy.md).
- Une métrique non prise en charge par le navigateur (INP sur un ancien Safari, par exemple) est
  simplement absente.

## Limites connues

- Une application monopage (SPA) est mesurée comme **une seule vue** : les changements de route ne
  créent pas de nouvelle vue (prévu en v2).
- Une page restaurée depuis le _back/forward cache_ crée une vue `restore`, mesurée sur CLS et INP.

## Budget

`pnpm --filter @perfpulse/sdk size` affiche la taille des deux formats ; la CI échoue au-delà de
5 Ko compressés.
