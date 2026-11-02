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

- `page.html` charge le vrai code du jeu (`src/*.js`, le lot HD `fournil/hd/equipe/` pour la garde-robe) ; `objets.js` bâtit chaque objet **seul** comme la boutique le bâtit (`MEUBLES.DECOS[id].faire` puis `MEUBLES.fusion`, `MEUBLES.trophees`, `PERSOS.compagnon`, `PERSOS.patisserieSaison`, le boulanger d'`EQUIPE3D` habillé de la pièce, `ARRIERE.ROUE.creer`) ; `objets-trophees.js` bâtit ce qui n'a pas de modèle (un objet par trophée, sur son socle ; le tapis, le dos des cartes, les jetons ; le scooter, peint en 2D dans la boutique ; le pigeon voyageur), en primitives de `src/modeles.js`, aux couleurs du jeu.
- `studio.js` les photographie tous pareil : caméra orthographique de trois quarts (30° de côté, 38° de plongée), la lumière du rendu riche de la boutique (ciel, soleil, pièce d'ambiance, jumeaux MeshStandard), le contour cartoon et la correction chaude du palier haut, une ombre de contact douce (sous l'objet, ou sur le mur pour ce qui s'y accroche), fond transparent, cadré sur les sommets de l'objet avec une marge régulière. Rendu 512 × 512.
- `cuire.cjs` réduit chaque rendu à 256 × 256 (lanczos3) et l'écrit en webp (qualité 70, alpha 80 : l'ombre reste lisse ; ≈ 7,5 Ko en moyenne) dans `fournil/img/carnet/<famille>/<id>.webp`, puis écrit `src/vignettes.js` (la table : famille → id → empreinte du fichier) et une planche de contrôle (chaque vignette en grand sur un damier, à 64 px, à 44 px, grisée).
- Relançable et déterministe : mêmes sources, mêmes fichiers, octet pour octet (aucun hasard, aucune horloge ; le grain du feutre est semé). Un tour partiel (`--seulement`) ne refait que ce qu'on lui donne ; la table reprend tout ce qui est sur le disque. Un tour complet efface les fichiers d'objets retirés du jeu.

## Ce qui garde son icône

Les titres (des distinctions, sans objet) et les cartes postales (des photos de la petite planète) : leur icône dessinée. Les tenues du croupier : son dessin SVG (`src/arriere.js`, `croupierSVG`), il n'existe pas en 3D.

## Ajouter un objet

Un objet ajouté à une famille du carnet (`src/chaine.js`, `CASINO`) apparaît au catalogue tout seul : s'il se bâtit comme ceux de sa famille, relancer l'outil suffit ; sinon, lui donner sa fabrique dans `objets.js` ou `objets-trophees.js`. Le test `test/fournil-vignettes.test.js` vérifie que chaque vignette de la table a son fichier (256 × 256) et que le tout tient dans 1,5 Mo.
