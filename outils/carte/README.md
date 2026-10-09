# La vraie carte de Poncin

`construire.js` fabrique la carte d'**Opération Poncin** à partir de données ouvertes, sans rien inventer :

| Source | Licence | Ce qu'on en tire |
| --- | --- | --- |
| **OpenStreetMap** (Overpass) | ODbL 1.0 | rues et leurs noms, eau, ponts, végétation, arbres, noms de lieux, église / mairie / château, jardins privés du château |
| **IGN – BD TOPO®** (WFS `BDTOPO_V3:batiment`) | Licence Ouverte Etalab 2.0 | emprises et hauteurs des bâtiments |
| **IGN – RGE ALTI®** (WMS-R `ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES`, ou l'API altimétrique) | Licence Ouverte Etalab 2.0 | relief, grille de 10 m |
| **IGN – BD ORTHO®** (WMTS `ORTHOIMAGERY.ORTHOPHOTOS`) | Licence Ouverte Etalab 2.0 | photo aérienne du sol |

Google est exclu : ses conditions interdisent d'extraire ou de mettre en cache ses données.

Sortie dans `poncin/carte/` : `poncin.json` (la **carte v1** de `src-poncin/ARCHITECTURE.md`, que le jeu lit telle quelle), `sol-2048.jpg` et `sol-1024.jpg`, `LICENCE-DONNEES.md` (sources, licences, attribution « © IGN – BD ORTHO®, BD TOPO®, RGE ALTI® · © contributeurs OpenStreetMap » avec l'année).

## Où ça tourne

Le réseau du poste de développement est fermé : la construction tourne sur **GitHub Actions** (`.github/workflows/carte.yml`). Un push sur la branche **`carte`** qui touche `outils/carte/**` ou le workflow lance la construction ; le workflow commite ensuite `poncin/carte/` sur la même branche (avec `github-actions[bot]` : ce commit ne relance rien). On peut aussi la relancer à la main (« Run workflow »). On récupère enfin `poncin/carte/` dans la branche du jeu.

```bash
npm i --no-save --no-package-lock --prefix outils/carte jpeg-js@0.4.4   # seule dépendance (Node 22, fetch global)
node outils/carte/construire.js --essai    # tout le pipeline HORS LIGNE sur un faux Poncin synthétique, avec ~36 vérifications
node outils/carte/construire.js            # la vraie carte (il faut Internet)
```

Options : `--sortie <dossier>` (par défaut `poncin/carte/`, ou un dossier temporaire pour l'essai), `--sans-cache`.

Le mode `--essai` remplace le réseau par un faux serveur (Overpass dont le premier serveur est en panne, WFS paginé qui rend des coordonnées lat,lon en 3D, WMS-R en BIL 32 bits, API altimétrique, tuiles WMTS peintes avec les toits exactement aux emprises) et vérifie : projection et Web Mercator, découpe, simplification, axes et pagination de la BD TOPO, relief, format v1, types et hauteurs des bâtiments, noms, ponts (dont les ponts déduits), zone interdite, zones de jeu, **alignement de la photo** (les toits photographiés tombent sous les emprises, puis sont masqués), licence, cache. Le workflow le lance avant la vraie construction.

## Le pipeline

1. **decouvrir** — une requête Overpass autour de 46,0875 N – 5,4069 E (mairie, place Bichat) liste le lieu « Poncin », `historic=castle`, `amenity=townhall|place_of_worship`, `place=square` et les `waterway=river|stream`. Le centre et la taille du carré (600 m, jusqu'à 800 m si nécessaire, multiple de 50 m) sont choisis pour couvrir la place de l'arène avec son rayon de 110 m, la mairie, l'église, le château vu de dehors et les berges de l'Ain et du Veyron (point le plus proche et confluence). Le rapport est imprimé dans les journaux. `centre` et `taille` peuvent être imposés dans `poncin.config.json`.
2. **osm** — Overpass (`overpass-api.de`, repli `overpass.kumi.systems`) en `[out:json][bbox:…]` : bâtiments et parties, voies, eau, occupation du sol, loisirs, bois, broussailles, prairies, arbres, patrimoine, équipements, barrières, ponts, accès privés, lieux et noms ; `out body geom`. Les multipolygones sont recousus (chemins joints bout à bout ; un anneau coupé par la bbox est rejoint au bout le plus proche).
3. **bdtopo** — WFS `https://data.geopf.fr/wfs/ows` : `GetCapabilities` confirme le nom de la couche, puis `GetFeature` en `application/json`, `SRSNAME=EPSG:4326`, `BBOX` (lat,lon puis lon,lat si rien ne vient), pagination `COUNT`/`STARTINDEX`. L'ordre des axes des coordonnées rendues est détecté (latitude ≈ 46, longitude ≈ 5,4). On garde `hauteur`, `nombre_d_etages`, `altitude_minimale_sol`, `nature`, `usage_1`.
4. **alti** — WMS-R (`GetCapabilities` pour la couche, puis `GetMap` en `image/x-bil;bits=32`, ~2 m par pixel, boutisme détecté), chaque nœud de la grille de 10 m étant la moyenne d'un carré de 10 m ; en repli, l'API altimétrique (lots de 100 points séparés par `|`, ≤ 5 requêtes/s) ; en dernier recours, sol plat.
5. **assembler** — projection sur le **plan tangent local** : `x = (λ−λ0)·N·cos φ0` vers l'est, `z = −(φ−φ0)·M` vers le sud (rayons WGS84 à φ0), découpe au carré, simplification Douglas-Peucker (0,3 m pour les bâtiments, 1 m pour les rues, l'eau et la végétation), polygones valides (sinon la forme non simplifiée, sinon l'enveloppe convexe, comptée dans le rapport). Bâtiments BD TOPO prioritaires (hauteur, sinon étages × 3 + 1, sinon 6 m), enrichis des tags OSM qui les recouvrent (nom, église, mairie, château, commerces) ; bâtiments OSM ajoutés seulement s'ils ne recouvrent rien. Eau : surfaces OSM, plus les rivières et ruisseaux en ligne élargis là où aucune surface ne les couvre (les parties busées ou souterraines sont sautées). Ponts : `man_made=bridge` (rectangle minimal) et voies `bridge=yes` ; là où une voie franchit un ruisseau élargi sans pont tagué, un pont est déduit (jamais sur une grande rivière). Zone interdite : les surfaces `access=private` qui touchent `historic=castle` (en repli, le domaine du château lui-même). Noms : `name` OSM uniquement. Zones de jeu calculées : **arène** = la place publique principale (`place=square` la plus proche de la mairie, sinon une zone piétonne, sinon l'espace dégagé devant la mairie ou l'église), rayon 110 m ; **apparitions** (20) et **objets** (8 : 2 pompes dans les coins serrés, 2 long-tirs dans les espaces ouverts, 2 soins, 2 armures) tirés parmi les points libres et **accessibles** (parcours en largeur sur une grille de 2 m depuis le centre), bien répartis ; **extraction** = les routes qui sortent du carré et les ponts ; **base** = une autre place (ou une zone piétonne, un parking).
6. **ortho** — tuiles WMTS (`TILEMATRIXSET=PM`, zoom 19, repli 18), décodées par jpeg-js, rééchantillonnées (2 × 2 échantillons par pixel) dans le repère local, adoucies (flou léger, saturation, chaleur, ombres relevées : un peu de pastel), et les **toits photographiés masqués** sous les emprises (couleur de pavé), puisque les bâtiments 3D sont posés dessus. Pixel `(u, v)` de l'image de côté `N` : `x = −L/2 + (u + 0,5)·L/N`, `z = −L/2 + (v + 0,5)·L/N` (ligne 0 = nord, colonne 0 = ouest).

Avant d'écrire quoi que ce soit, la carte est vérifiée (format v1, points dans le carré, polygones sans point final répété, zones sur des points libres) ; une carte invalide arrête tout, et le workflow ne commite rien.

## Bon voisinage

User-Agent `gamemobil-poncin-carte/1.0 (+https://github.com/devclaudeapp/gamemobil)`, 4 requêtes en parallèle au plus (Overpass : une seule à la fois), réessais avec attente croissante (429, 408, 5xx), cadence de l'API altimétrique bornée. Les réponses brutes valides sont gardées dans `outils/carte/cache/` (ignoré par git ; conservé entre deux exécutions du workflow par `actions/cache`) : changer `versionCache` dans `poncin.config.json` force un nouveau téléchargement.

## Réglages (`poncin.config.json`)

`approx` (point de départ de la découverte), `centre` / `taille` (`"auto"` ou imposés), `tailleMin` / `tailleMax`, `pasRelief`, `zoomOrtho`, `sol` (côtés des images), `qualiteJpeg`, `graine` (tirages rejouables), `versionCache`, adresses et couches des services, `arene` (rayon, nombres d'apparitions et d'objets), `arbresBois` (espacement et nombre maximal des arbres semés dans les bois OSM), `style` (flou, saturation, chaleur, éclaircissement, gamma, couleur de pavé).
