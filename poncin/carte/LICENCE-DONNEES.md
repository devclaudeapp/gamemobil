# Données de la carte de Poncin

`poncin.json`, `sol-2048.jpg`, `sol-1024.jpg`, `sol-arene-2048.jpg` ont été produits le 2026-10-09 par `outils/carte/construire.js` (carré de 800 m centré sur 46.086077, 5.406078) à partir de données ouvertes. Aucune donnée Google (ni Street View) n'est utilisée.

## Sources

- **OpenStreetMap** — © contributeurs OpenStreetMap 2026, base de données ouverte sous licence **ODbL 1.0** (<https://opendatacommons.org/licenses/odbl/1-0/>), <https://www.openstreetmap.org/copyright>. Rues et leurs noms, eau, ponts, végétation, arbres (positions, espèces), noms de lieux, compléments des bâtiments (noms, église, mairie, château, matériaux et formes de toit quand ils sont tagués), zone privée du château, revêtements du sol, murs, clôtures et portails, haies, mobilier urbain (lampadaires, bancs, fontaines, monuments, croix, arrêts de bus…), commerces et services nommés (enseignes).
- **IGN – Géoplateforme** — © IGN 2026, sous **Licence Ouverte Etalab 2.0** (<https://www.etalab.gouv.fr/licence-ouverte-open-licence/>) :
  - **BD TOPO®** (service WFS : `BDTOPO_V3:batiment`, `BDTOPO_V3:zone_de_vegetation`, `BDTOPO_V3:haie`, `BDTOPO_V3:construction_ponctuelle`, `BDTOPO_V3:construction_lineaire`, `BDTOPO_V3:cimetiere`, `BDTOPO_V3:terrain_de_sport`) : emprises, hauteurs, nombre d'étages et matériaux des murs et des toitures des bâtiments (codes issus des fichiers fonciers) ; zones de végétation (feuillus, conifères, peupleraies, vergers, vignes), haies, cimetières, terrains de sport, murs et calvaires absents d'OSM ;
  - **RGE ALTI®** (service WMS-R / API altimétrique) : relief, grille de 10 m ; relief lointain de l'horizon (16 km de côté, pas de 125 m) ;
  - **LiDAR HD** (service WMS-R `IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G`) : hauteur de la canopée, pour trouver les arbres et mesurer leur hauteur et celle des haies ;
  - **BD ORTHO®** (service WMTS `ORTHOIMAGERY.ORTHOPHOTOS` et `ORTHOIMAGERY.ORTHOPHOTOS.IRC` en infrarouge couleur) : photographies aériennes du sol (adoucies, couleurs un peu saturées, masquées sous les emprises des bâtiments), couleur des toits, couronnes des arbres (indice de végétation), sens des rangs des vignes et des vergers.

## Licences des fichiers

- `poncin.json` est une **base de données dérivée** d'OpenStreetMap (combinée à la BD TOPO, au RGE ALTI, au LiDAR HD et à la BD ORTHO) : elle est diffusée sous **ODbL 1.0**, avec la même obligation de partage à l'identique. Les éléments issus de l'IGN restent réutilisables sous Licence Ouverte 2.0.
- `sol-2048.jpg`, `sol-1024.jpg`, `sol-arene-2048.jpg` sont des images dérivées de la BD ORTHO® (Licence Ouverte 2.0) ; le masque des bâtiments vient de la BD TOPO® et d'OpenStreetMap (« œuvre produite » au sens de l'ODbL : seule l'attribution est due).

## Attribution à afficher

> © IGN 2026 – BD ORTHO®, BD TOPO®, RGE ALTI®, LiDAR HD · © contributeurs OpenStreetMap 2026

Le jeu l'affiche dans ses crédits.
