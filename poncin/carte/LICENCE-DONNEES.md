# Données de la carte de Poncin

`poncin.json`, `sol-2048.jpg` et `sol-1024.jpg` ont été produits le 2026-10-09 par `outils/carte/construire.js` (carré de 600 m centré sur 46.0875, 5.4069) à partir de données ouvertes. Aucune donnée Google n'est utilisée.

## Sources

- **OpenStreetMap** — © contributeurs OpenStreetMap 2026, base de données ouverte sous licence **ODbL 1.0** (<https://opendatacommons.org/licenses/odbl/1-0/>), <https://www.openstreetmap.org/copyright>. Rues et leurs noms, eau, ponts, végétation, arbres, noms de lieux, compléments des bâtiments (noms, église, mairie, château), zone privée du château.
- **IGN – Géoplateforme** — © IGN 2026, sous **Licence Ouverte Etalab 2.0** (<https://www.etalab.gouv.fr/licence-ouverte-open-licence/>) :
  - **BD TOPO®** (service WFS `BDTOPO_V3:batiment`) : emprises et hauteurs des bâtiments ;
  - **RGE ALTI®** (service WMS-R / API altimétrique) : relief, grille de 10 m ;
  - **BD ORTHO®** (service WMTS `ORTHOIMAGERY.ORTHOPHOTOS`) : photographies aériennes du sol, adoucies (couleurs pastel) et masquées sous les emprises des bâtiments.

## Licences des fichiers

- `poncin.json` est une **base de données dérivée** d'OpenStreetMap (combinée à la BD TOPO) : elle est diffusée sous **ODbL 1.0**, avec la même obligation de partage à l'identique. Les éléments issus de l'IGN restent réutilisables sous Licence Ouverte 2.0.
- `sol-2048.jpg` et `sol-1024.jpg` sont des images dérivées de la BD ORTHO® (Licence Ouverte 2.0) ; le masque des bâtiments vient de la BD TOPO® et d'OpenStreetMap (« œuvre produite » au sens de l'ODbL : seule l'attribution est due).

## Attribution à afficher

> © IGN 2026 – BD ORTHO®, BD TOPO®, RGE ALTI® · © contributeurs OpenStreetMap 2026

Le jeu l'affiche dans ses crédits.
