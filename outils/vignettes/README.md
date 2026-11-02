# Les vignettes du carnet

Les images de « Mes décos » (le carnet de Ma chaîne), de l'étagère des trophées (onglet Boulanger) et du carnet du croupier (arrière-salle) : **des rendus des vrais objets du jeu**, cuits ici une fois pour toutes, sans image générée.

```bash
npm install --prefix /chemin/outils-vignettes sharp@0.33.5          # une fois, hors du dépôt
node build.js
NODE_PATH=/opt/node22/lib/node_modules:/chemin/outils-vignettes/node_modules \
  node outils/vignettes/cuire.cjs [--port 9711] [--seulement "tenues/*,trophees/ronron"] [--brut dossier] [--planche planche.png] [--qualite 70]
```

Il faut Playwright et son Chromium (rendu logiciel SwiftShader) et sharp. Une minute environ pour tout.

## Ce que fait l'outil

- `page.html` charge le vrai code du jeu (`src/*.js`, le lot HD `fournil/hd/equipe/` pour la garde-robe) ; `objets.js` bâtit chaque objet **seul** comme la boutique le bâtit (`MEUBLES.DECOS[id].faire` puis `MEUBLES.fusion`, `MEUBLES.trophees`, `PERSOS.compagnon`, `PERSOS.patisserieSaison`, le boulanger d'`EQUIPE3D` habillé de la pièce, `ARRIERE.ROUE.creer`) ; `objets-trophees.js` bâtit ce qui n'a pas de modèle (un objet par trophée, sur son socle ; le tapis, le dos des cartes, les jetons ; le scooter, peint en 2D dans la boutique), en primitives de `src/modeles.js`, aux couleurs du jeu. Ce qui se montre en boutique y est pris tel quel : le pigeon voyageur est celui de `PERSOS.compagnon`, la carte du carnet promet ce que le joueur verra.
- `studio.js` les photographie tous pareil : caméra orthographique de trois quarts (30° de côté, 38° de plongée), la lumière du rendu riche de la boutique (ciel, soleil, pièce d'ambiance, jumeaux MeshStandard), le contour cartoon et la correction chaude du palier haut, une ombre de contact douce (sous l'objet, ou sur le mur pour ce qui s'y accroche), fond transparent, cadré sur les sommets de l'objet avec une marge régulière (`recadre` n'en garde qu'une part, pour ce qui ne se lirait pas à 44 px : le tag sans ses gouttes, le buste du boulanger dans son aura). Rendu 512 × 512.
- `cuire.cjs` réduit chaque rendu à 256 × 256 (lanczos3) et l'écrit en webp (qualité 70, alpha 80 : l'ombre reste lisse ; ≈ 7,6 Ko en moyenne ; 12 Ko au plus chacune : au-delà, l'alpha descend d'un cran à la fois, puis la qualité, jusqu'au premier réglage qui tient, et l'outil dit lequel — l'aura à l'alpha 77, les toiles à 76, sans différence visible) dans `fournil/img/carnet/<famille>/<id>.webp`, puis écrit `src/vignettes.js` (la table : famille → id → empreinte du fichier) et une planche de contrôle (chaque vignette en grand sur un damier, à 64 px, à 44 px, grisée).
- Relançable et déterministe : mêmes sources, mêmes fichiers, octet pour octet (aucun hasard, aucune horloge ; le grain du feutre est semé). Un tour partiel (`--seulement`) ne refait que ce qu'on lui donne ; la table reprend tout ce qui est sur le disque. Un tour complet efface les fichiers d'objets retirés du jeu.

## Ce qui garde son icône

Les titres (des distinctions, sans objet) et les cartes postales (des photos de la petite planète) : leur icône dessinée. Les tenues du croupier : son dessin SVG (`src/arriere.js`, `croupierSVG`), il n'existe pas en 3D.

## Dans le jeu

- `src/vignettes.js` (générée) : `VIGNETTES.img(famille, id, gagne, repli)` rend l'image (grisée tant que ce n'est pas gagné) et garde le HTML d'avant dans un `<template>`. Si l'image ne se charge pas, ce HTML reprend sa place : celle du bloc marqué `data-vig` qui la contient (la carte de l'étagère, la pastille d'un trophée du croupier, l'aperçu d'un skin), sinon celle de l'image seule.
- Le service worker (`fournil/sw.js`) les met en cache à la première vue, jamais d'avance, et n'en garde qu'une copie par objet : une vignette recuite change d'empreinte (`?v=`), la nouvelle remplace l'ancienne. Pas besoin de changer `CACHE` après une recuisson. Hors ligne, une vignette pas encore vue reçoit une réponse vide (204) : son repli s'affiche, sans erreur dans la console.
- Mes décos ne montre les deux familles de l'arrière-salle qu'une fois la petite porte trouvée, comme l'étagère des trophées.

## Ajouter un objet

Un objet ajouté à une famille du carnet (`src/chaine.js`, `CASINO`) apparaît au catalogue tout seul : s'il se bâtit comme ceux de sa famille, relancer l'outil suffit ; sinon, lui donner sa fabrique dans `objets.js` ou `objets-trophees.js`. Le test `test/fournil-vignettes.test.js` vérifie que chaque vignette de la table a son fichier (256 × 256) et que le tout tient dans 1,5 Mo.
