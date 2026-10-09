# Opération Poncin — architecture du moteur

FPS cartoon sur la vraie carte de Poncin (01450). Ce fichier est le **contrat** entre les modules : chaque module respecte exactement les noms, les formes de données et les unités ci-dessous. Tout est en JavaScript « vanilla » (pas de bundler, pas de TypeScript), commenté en français comme le reste du dépôt.

## Conventions

- **Unités** : mètres, secondes, radians. **Axes** : `x` vers l'est, `z` vers le **sud** (le nord est vers `-z`), `y` vers le haut (comme Three.js). Le monde s'étend de `-L/2` à `+L/2` en `x` et en `z` (`L = carte.taille`).
- **Angles** : `yaw` = cap, 0 regarde vers le nord (`-z`), positif vers l'ouest (rotation Three.js autour de `y`, sens direct) ; direction du regard `d = (-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch))`. `pitch` ∈ [-1.45, 1.45], positif vers le haut.
- **Hasard** : jamais `Math.random()` dans les modules purs ; un générateur `rnd()` (mulberry32) est passé en paramètre, pour que les tests et le réseau rejouent la même chose.
- **Modules purs** (`regles.js`, `monde.js`, `nav.js`, `bots.js`, `jeu.js`, `arene.js`, `carte-provisoire.js`) : aucun DOM, aucun THREE ; ils tournent dans Node. Gabarit UMD (comme `src/game.js`) :
  ```js
  (function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
    else root.PJEU = factory(root.PREGLES);
  })(typeof self !== 'undefined' ? self : this, function (REGLES) { 'use strict'; /* … */ return { /* API */ }; });
  ```
- **Globales du navigateur** : `PREGLES`, `PCARTEPROV`, `PMONDE`, `PNAV`, `PBOTS`, `PJEU`, `PARENE`, `PAVATARS`, `PRENDU`, `PSONS`, `PCONTROLES`, `PHUD`, `PUI`. Three.js (r158, global `THREE`) et `MODELES` (`src/modeles.js`, réutilisé tel quel : `boite`, `capsule`, `sphere`, `cylindre`, `cone`, `mat`, `MAT`, `part`, `assembler`, `maille`, `mesh`, `texture`, `dispose`, `partager`…) sont chargés avant. Sans WebGL ou sans Three.js, le jeu affiche un panneau clair au lieu de planter.
- **Ordre de construction** (`build.js`) : `src/modeles.js`, `src/persos.js`, puis `regles.js`, `carte-provisoire.js`, `monde.js`, `nav.js`, `bots.js`, `jeu.js`, `arene.js`, `avatars.js`, `rendu.js`, `sons.js`, `controles.js`, `hud.js`, `ui.js` (point d'entrée).
- **Style** : low-poly arrondi pastel comme Le Fournil (`src/modeles.js`) ; blasters à peinture, impacts de peinture colorés, robots rigolos ; jamais de sang.
- **Écran** : on joue **en paysage** (en portrait, un panneau « Tourne ton téléphone » ; les menus marchent dans les deux sens). Marges `env(safe-area-inset-*)`, joystick décalé du bord (le geste retour de Safari).
- **Faits réels** : tout nom, toute forme particulière vient des données (OSM, BD TOPO) ; rien d'inventé (pas de portes de ville, pas d'intérieurs) ; le château et ses jardins (privés) ne sont visibles que de la rue, jamais accessibles.

## La carte (`carte`, format v1)

Fichier `poncin/carte/poncin.json` produit par `outils/carte-poncin.js` (IGN + OpenStreetMap), ou objet produit par `PCARTEPROV.creer()` (carte provisoire, même format) tant que les données réelles manquent.

```js
{
  v: 1, nom: 'Poncin', source: 'ign-osm' | 'provisoire',
  attribution: '© IGN – © contributeurs OpenStreetMap',
  origine: { lat: 46.0875, lon: 5.4069 },         // le point (0, 0)
  taille: 600,                                       // côté du carré joué, en m
  relief: { pas: 10, n: 61, h: [/* n*n altitudes en m, ligne par ligne : h[j*n+i] à x = -L/2 + i*pas, z = -L/2 + j*pas */] },
  batiments: [{ p: [[x, z], …], h: 9.5, t: 'maison' | 'eglise' | 'chateau' | 'mairie' | 'tour' | 'annexe' | 'commerce' }],
  rues: [{ l: [[x, z], …], w: 6, t: 'route' | 'rue' | 'chemin', n: 'Place Bichat' }],
  eau: [{ p: [[x, z], …], t: 'riviere' | 'ruisseau' }],      // infranchissable, sauf sur un pont
  ponts: [{ l: [[x, z], [x, z]], w: 7 }],
  vegetation: [{ p: [[x, z], …], t: 'bois' | 'vigne' | 'pre' | 'jardin' }],
  arbres: [[x, z, h], …],
  interdit: [{ p: [[x, z], …], n: 'Château (propriété privée)' }],  // bloque comme un mur ; affiché, clôturé
  noms: [{ n: 'Église Saint-Martin', x, z }],
  sol: { image: 'sol-2048.jpg', petite: 'sol-1024.jpg' } | null,     // photo aérienne couvrant tout le carré (null : sol peint)
  zones: {
    arene: { centre: [x, z], rayon: 110 },              // la zone jouée en Arène (murs invisibles au-delà)
    apparitions: [[x, z], …],                            // ≥ 12 points libres
    armes: [{ x, z, arme: 'pompe' | 'precision' | 'soin' | 'armure' }],
    extraction: [[x, z], …], base: [x, z]                // modes suivants
  }
}
```
Les polygones n'ont pas de point répété à la fin ; l'orientation est quelconque (le chargeur normalise). Les bâtiments partent du terrain (altitude minimale du relief sous leur emprise, moins 0,5 m) et montent jusqu'à cette base + `h`.

**Relief : une seule triangulation partagée.** La cellule (i, j)–(i+1, j+1) de la grille est coupée par la diagonale (i+1, j)–(i, j+1) : triangles [(i,j), (i,j+1), (i+1,j)] et [(i,j+1), (i+1,j+1), (i+1,j)] (i en x, j en z). `monde.hauteur` interpole dans ces triangles (barycentrique) et `rendu.js` maille le sol avec exactement ces triangles : les pieds ne s'enfoncent jamais.

## `regles.js` → `PREGLES`

```js
{
  JOUEUR: { rayon: 0.35, taille: 1.8, oeil: 1.6, vitesse: 5.2, vitesseAccroupi: 2.4, saut: 5.0, gravite: 14, vie: 100, armureMax: 50 },
  ARMES: [ { id: 'rafale', nom, degats, plombs: 1, cadence /* tirs/s */, chargeur, recharge /* s */, dispersion /* rad */, portee, chute: [debut, fin, minimum], tete: 1.5, recul, couleur }, { id: 'pompe', … plombs: 8 }, { id: 'precision', … } ],
  arme(id) → définition,
  degatsA(arme, distance, tete) → nombre,                 // avec la chute de dégâts
  MODES: { arene: { duree: 180, reapparition: 3, scoreVictoire: 25, bots: { min: 3, max: 5 }, invincible: 1.5 } },
  OBJETS: { pompe: { type: 'arme', arme, retour }, precision: {…}, soin: { type: 'soin', vie, retour }, armure: { type: 'armure', armure, retour } },
  BOTS: { facile: { reaction, erreur, resserre, precision, vise, champ }, normal: {…}, fort: {…} },  // réaction (s), erreur de visée (rad) qui se resserre (/s), probabilité de tirer, vitesse de visée (rad/s), champ de vision (rad)
  NOMS_BOTS: [...], COULEURS: [...],
  mulberry32(graine) → rnd, hash(texte) → entier
}
Les chiffres exacts sont dans `regles.js` (source de vérité).
```

## `monde.js` → `PMONDE`

```js
const monde = PMONDE.creer(carte);
monde.L                                   // côté (m)
monde.hauteur(x, z) → y                   // relief interpolé dans les triangles du maillage (voir « Relief »), sans les bâtiments
monde.bloque(x, z, r) → bool              // le cercle (x, z, r) touche un bâtiment, une zone interdite, l'eau hors pont, ou sort du carré / de la zone limite
monde.deplacer(x, z, dx, dz, r) → [x2, z2]  // déplacement d'un cercle qui glisse le long des murs (jamais à travers), en sous-pas si besoin
monde.rayon(ox, oy, oz, dx, dy, dz, max) → { t, x, y, z, nx, ny, nz, quoi: 'mur' | 'toit' | 'sol', i } | null   // premier obstacle (bâtiments = prismes, toits plats ; terrain) ; d normalisé
monde.vue(ax, ay, az, bx, by, bz) → bool    // ligne de vue libre
monde.libre(rnd, centre?, rayon?) → [x, z]  // un point libre au hasard
monde.limite = { centre: [x, z], rayon } | null   // fixé par le mode (Arène : la zone de l'arène)
monde.batiments                             // [{ p, h, t, base, aabb: [x0, z0, x1, z1] }] normalisés
```
Implémentation : grille spatiale (cellules ~12 m) des arêtes de bâtiments, des zones interdites et de l'eau ; cercle contre segments ; rayon contre prismes (test dans le plan xz puis bornes en y) et marche sur le terrain.

## `nav.js` → `PNAV`

```js
const nav = PNAV.creer(monde, { pas: 1.5, marge: 0.45 });
nav.chemin(ax, az, bx, bz) → [[x, z], …] | null   // A* 8 voisins (heuristique octile) puis lissage par lignes de vue ; ≤ 4 ms sur la carte entière
nav.libre(x, z) → bool ; nav.proche(x, z) → [x, z]   // le point navigable le plus proche
```

## `jeu.js` → `PJEU` (la simulation d'une partie, autoritaire chez l'hôte)

```js
const jeu = PJEU.creer({ monde, mode: PARENE, graine, options: { bots: 4, niveau: 'normal', equipes: false } });
jeu.ajouterJoueur({ id: 'moi', nom, couleur, equipe, humain: true }) → entite
jeu.etape(dt, entrees) → evenements        // entrees : { [id]: entree } ; les bots sont pilotés en interne par PBOTS ; dt borné à 1/20 s
jeu.entites                                 // tableau d'entités (ci-dessous)
jeu.temps, jeu.fini, jeu.classement()        // tri par score
jeu.aideVisee(id, force) → { dyaw, dpitch, surCible: bool, ralentir: 0..1 }   // au doigt : à ≤ 4° d'une cible à ≤ 40 m en vue, la visée ralentit (ralentir ≈ 0,4) et s'aimante doucement (≤ 2,5° × (1 − d/50)) ; surCible = cône de 1,5° sur un ennemi en vue (tir auto après ~120 ms)
```
**Entité** : `{ id, nom, couleur, equipe, humain, bot: bool, x, y, z, vy, yaw, pitch, auSol, accroupi, vie, armure, vivant, mortDepuis, invincible, arme: 'rafale', armes: ['rafale'], munitions: { rafale: 30 }, reserve: { rafale: 90 }, rechargeJusqua, prochainTir, score: { kills, morts, points }, serie }`.

**Entrée** (une par image et par joueur, même forme pour les bots) : `{ avant: -1..1, cote: -1..1, dyaw, dpitch, tir: bool, saut: bool, accroupi: bool, recharge: bool, arme: null | 'rafale' | 'pompe' | 'precision' }` (`dyaw`/`dpitch` : variations depuis l'image précédente).

**Événements** (rendus, sons, HUD, réseau) :
```js
{ t: 'tir', id, arme, o: [x, y, z], fin: [x, y, z], impact: { x, y, z, nx, ny, nz, quoi } | null }
{ t: 'touche', de, a, degats, tete, mort: bool }
{ t: 'mort', a, par, arme }      { t: 'reapparition', id }
{ t: 'ramasse', id, objet }      { t: 'recharge', id }      { t: 'saut', id }      { t: 'pas', id }
{ t: 'annonce', texte }          { t: 'fin', classement }
```
Tirs : à balle instantanée, depuis l'œil (`y + oeil`, ou `y + 1.0` accroupi), dans la direction du regard plus une dispersion tirée par `rnd` ; le premier touché parmi le monde (`monde.rayon`) et les capsules des entités vivantes (rayon 0.4, du pied à `taille`, tête = 0.35 m du haut) ; dégâts par `PREGLES.degatsA`.

## `arene.js` → `PARENE` (un mode = des crochets appelés par `jeu`)

```js
{ id: 'arene', nom: 'Arène',
  init(jeu), tick(jeu, dt, evs), surMort(jeu, victime, tueur, evs), apparition(jeu, entite) → [x, z, yaw],
  objets(jeu) → [{ id, x, z, objet, dispo }],    // armes et soins à ramasser, qui réapparaissent
  fini(jeu) → bool, resultat(jeu) → { classement, gagnant, duree } }
```

## `bots.js` → `PBOTS`

```js
PBOTS.penser(bot, jeu, dt, rnd) → entree     // même forme qu'une entrée humaine : le bot « joue » au joystick
```
États : patrouille (chemin `nav` vers un point libre ou un objet), chasse (dernière position vue), combat (vise avec un retard de réaction et une erreur selon `PREGLES.BOTS[niveau]`, tire par rafales, se déplace de côté), fuite à faible vie vers un soin. Ils ne voient qu'en ligne de vue (`monde.vue`) et dans un cône de 110°.

## `rendu.js` → `PRENDU` (Three.js)

```js
PRENDU.init(canvas, carte, monde, { qualite }) → bool   // false sans WebGL
PRENDU.taille(w, h)                                       // CSS px ; la résolution suit la qualité
PRENDU.image(jeu, idCamera, dt, t)                         // place caméra et entités, rend ; jeu = null → survol cinématique de Poncin (écran titre, menus)
PRENDU.evenements(evs, jeu)                                 // éclairs, traînées, impacts de peinture, morts
PRENDU.qualite(q?) ; PRENDU.stats → { webgl, qualite, calls, triangles, geometries, textures, ms }
PRENDU.projeter(x, y, z) → { x, y, devant }                 // pour le HUD (noms au-dessus des têtes)
```
Le décor : sol = relief maillé (triangulation partagée) avec la photo aérienne (`carte.sol`, chemin relatif à `poncin/carte/`) ou un sol peint sur canvas à partir des rues, de l'eau et de la végétation ; bâtiments extrudés et **fusionnés** par tuiles de 150 m (≤ 16 maillages, chacun un appel de dessin, éliminés hors du champ) : un quad par arête de mur, toit à deux pans pour les emprises presque rectangulaires de moins de 400 m², en croupe pour les convexes de ≤ 8 sommets, plat avec acrotère sinon ; fenêtres en quads légèrement décollés tous les 3 m par étage de 2,8 m ; murs pastel (palette par hachage), toits tuile/ardoise ; bas des murs assombri (fausse occlusion). Eau translucide animée, ponts, arbres en `InstancedMesh`, ciel dégradé, brouillard selon la qualité ; château et zones interdites clôturés. Personnages (`avatars.js`) : joueurs = chibis de `PERSOS.creer` (src/persos.js, lecture seule ; 1 unité = 1 px du Fournil → mise à l'échelle vers 1,6 m) casqués aux couleurs de leur équipe, blaster à la main ; bots = robots arrondis pastel (antenne, yeux LED), animés sans allocation. Arme en vue subjective dans une **scène à part** (caméra proche, rendue après le monde avec `clearDepth`) : balancement, recul, recharge, éclair. Effets en pools : traînées, éclairs, impacts de peinture (`InstancedMesh` en anneau, orientés par la normale), confettis à l'élimination. Qualité adaptative (haute / moyenne / éco) reprise de `src/scene.js` (`?qualite=`, SwiftShader en éco ; ombres seulement en haute ; DPR plafonné) ; budgets : ≤ 110 / 90 / 70 appels de dessin, ≤ 300k / 200k / 120k triangles ; aucune allocation par image dans les chemins chauds ; contexte WebGL perdu → la simulation continue, le décor se reconstruit au retour.

## `controles.js` → `PCONTROLES`, `hud.js` → `PHUD`, `sons.js` → `PSONS`, `ui.js` → `PUI`

- `PCONTROLES.init(racine, { tactile })` ; `PCONTROLES.lire() → entree` (remet les deltas à zéro) ; Pointer Events suivis par `pointerId`, `touch-action: none` ; joystick flottant à gauche (apparaît sous le pouce, rayon 60 px, zone morte 8 %), glisser à droite pour viser (≈ 0,22°/px, courbe d^1,15, Y inversable), bouton Tir (84 px, en bas à droite) qui vise aussi quand on le glisse, Saut, Recharge, Accroupi, emplacements d'armes ; tir automatique quand `jeu.aideVisee` dit `surCible` (réglage, activé par défaut au doigt) ; clavier par `event.code` (KeyW/A/S/D : marche aussi en AZERTY), Espace, R, C, 1-3, souris en pointer lock (≈ 0,0022 rad/px), Échap = pause, Tab = scores.
- `PHUD.init(racine)`, `PHUD.maj(jeu, idJoueur, evs)` : viseur (s'élargit avec la dispersion, rouge sur une cible), marqueur de touche, vie/armure, munitions, chrono, fil des éliminations, minicarte, indicateur de direction des dégâts, tableau des scores, écran de fin.
- `PSONS` : WebAudio synthétisé (comme Le Fournil) : tirs par arme, impacts, touche, élimination, pas, recharge, ramassage ; vibrations.
- `PUI` : menus (choix du mode — Arène jouable, Extraction et Jour / Nuit « bientôt » —, solo : nombre et niveau des bots), pause, réglages (sensibilité, qualité, son), crédits « © IGN – © contributeurs OpenStreetMap », retour à la Salle de jeux (`window.PONCIN_ACCUEIL`), sauvegarde `poncin.v1` (réglages, records), crochets de test `window.__poncin`.

## Tests

- `test/poncin.test.js` (Node, dans la CI) : règles, collisions, rayons, A*, bots, une partie d'Arène simulée de bout en bout (bots contre bots, sans erreur, scores cohérents, rejouable à l'identique avec la même graine).
- `test/poncin-play.cjs` (Playwright, iPhone simulé) et `test/poncin-scene.cjs` (captures).

## Authenticité (extension du format de carte v1 : champs facultatifs, rétrocompatibles)

Le but : que Poncin ressemble au vrai, avec des données réelles et ouvertes (jamais Google ni Street View). Les personnages et les blasters restent cartoon ; le décor devient « réaliste stylisé » (matériaux, végétation, mobilier vrais, couleurs justes, un peu saturées). Chaque champ ci-dessous est **facultatif** : le rendu garde un repli propre quand il manque (carte provisoire, vieille carte).

```js
batiments[i]: { …, mur: 'pierre' | 'crepi' | 'brique' | 'beton' | 'bois' | 'mixte',      // BD TOPO materiaux_des_murs, sinon déduit
                   toit: 'tuiles' | 'ardoise' | 'zinc' | 'beton' | 'verre',                 // BD TOPO materiaux_de_la_toiture, sinon couleur de la photo
                   teinteToit: '#rrggbb', etages: 2, forme: '2pans' | 'croupe' | 'plat' | 'pavillon' | 'fleche' }   // forme : OSM roof:shape s'il existe
arbres: [[x, z, h, r, e], …]   // r = rayon de la couronne (m), e = 'feuillu' | 'conifere' | 'peuplier' | 'platane' | 'tilleul' | 'fruitier' | 'saule' ; les anciennes entrées [x, z, h] restent valides
haies: [{ l: [[x, z], …], h: 1.6, w: 1.0 }]
vegetation[i].sens: angle (rad) des rangs pour t: 'vigne' | 'verger'
surfaces: [{ p: [[x, z], …], t: 'asphalte' | 'paves' | 'gravier' | 'herbe' | 'terre' | 'parking' | 'cimetiere' | 'terrain' }]   // le sol sous la photo, pour les textures de détail de près
murs: [{ l: [[x, z], …], h: 1.8, e: 0.5, t: 'pierre' | 'cloture' | 'soutenement' | 'enceinte' | 'portail' }]   // OSM barrier=wall|city_wall|retaining_wall|fence|gate
mobilier: [{ x, z, t: 'lampadaire' | 'banc' | 'fontaine' | 'monument' | 'abribus' | 'poubelle' | 'borne' | 'croix' | 'panneau' | 'boite' | 'table', yaw, n }]   // OSM, rien d'inventé
enseignes: [{ b: indexBatiment, n: 'Bar des Sports', t: 'bar' | 'boulangerie' | 'poste' | 'banque' | 'pharmacie' | 'mairie' | 'tabac' | 'commerce' | …, x, z, yaw }]   // sur la façade la plus proche du point OSM, face à la rue
horizon: { pas: 125, n: 129, h: [/* altitudes absolues, n*n, centré sur (0, 0) */] }   // le relief lointain (≈ 16 km de côté) pour les vraies montagnes du Bugey à l'horizon
sol.arene: { image: 'sol-arene-2048.jpg', centre: [x, z], taille: 400 }   // photo aérienne fine (~0,2 m/px) autour de l'arène
```

Modules de rendu de l'authenticité (navigateur, THREE ; chacun avec son API, appelés par `rendu.js`) :
- `textures.js` → `PTEXTURES` : textures procédurales sur canvas, carrelables, mises en cache et partagées (`M.partager`), avec mipmaps : `facade(mur, teinte)`, `toit(toit, teinte)`, `sol(type)` (asphalte, pavés, gravier, herbe, terre), `details()` (encadrements, volets, chaînes d'angle) ; un atlas d'enseignes `enseigne(texte, type)` ; aucune image externe.
- `vegetation.js` → `PVEGETATION.creer(carte, monde, { qualite }) → { groupe, maj(camera, t), liberer(), stats }` : arbres par espèce (troncs avec écorce, couronnes en grappes de feuillage texturé à découpe alpha, conifères en étages), instanciés, avec niveaux de détail (proche détaillé, loin en imposteur) et vent dans le vertex shader ; haies, rangs de vigne, vergers ; touffes d'herbe instanciées près de la caméra.
- `decor.js` → `PDECOR.creer(carte, monde, { qualite }) → { groupe, maj(camera, t), liberer(), stats }` : murs de pierre et clôtures, mobilier urbain (lampadaires anciens, bancs, fontaine, monument aux morts, abribus…), enseignes des commerces (vrais noms OSM) sur leurs façades, plaques de rue bleues aux angles (noms OSM), montagnes de l'horizon (relief réel, couleur de brume).
- `rendu.js` reste le chef d'orchestre : il applique `PTEXTURES` aux murs et aux toits (UV en mètres), mélange les textures de détail au sol selon `surfaces` (de près seulement) sous la photo, charge `sol.arene`, et branche `PVEGETATION` et `PDECOR`. Les murs et les troncs bloquent aussi les déplacements et les tirs (`monde.js`).
- Budgets inchangés (≤ 110 / 90 / 70 appels de dessin ; ≤ 300k / 200k / 120k triangles), plus un budget de mémoire de textures (≤ 96 / 64 / 32 Mo) ; en éco, la végétation et le mobilier se simplifient.

### Passages voûtés et bâtiments remarquables (demande du joueur)

Le bourg de Poncin a des **passages voûtés** qui traversent les maisons pour rejoindre la place : dans OSM, des voies qui passent sous un bâtiment (`tunnel=building_passage`, ou une voie dont le tracé traverse une emprise), par exemple « Porte Bouvent » (sous le bâtiment près de la place Xavier-Bichat) et « Impasse du Bonheur ». Format :

```js
passages: [{ l: [[x, z], [x, z]], w: 3.2, h: 3.4, b: [indices des bâtiments traversés], n: 'Porte Bouvent' }]   // couloir sous les bâtiments, voûte en berceau de hauteur h
```
- `monde.js` : dans un passage, les murs du bâtiment ne bloquent ni le joueur ni les tirs sous la voûte (y < base + h) ; au-dessus, le bâtiment reste plein ; `nav.js` y fait passer les chemins.
- `rendu.js` : arcade en plein cintre découpée dans les deux façades, intérieur voûté en pierre (berceau, piédroits, pavés), éclairage plus sombre dedans.
- **Bâtiments remarquables**, reconnaissables d'après les données (OSM `name`, `shop`, `amenity`) : la mairie (« Hôtel de ville de Poncin » : drapeaux tricolores, inscription MAIRIE, horloge), le bureau de tabac (« Bureau de Tabac Presse » : losange rouge « carotte » TABAC et bandeau PRESSE), la banque (« Crédit Agricole » : bandeau au nom, sans logo de marque), La Poste, le Bar des Sports (terrasse), la boulangerie « Aux Pains Dorés », le Petit Casino, l'office de tourisme, la pharmacie… ; l'église Saint-Martin et le château gardent leur traitement à part.
- Références visuelles autorisées : les données ouvertes, les images de rue libres **Panoramax** (Licence Ouverte ou CC-BY-SA, comme référence de formes et de couleurs) et les photos que le joueur fournit lui-même. **Jamais Google Maps ni Street View** (leurs conditions interdisent d'en extraire ou d'en dériver du contenu).

## Le jeu en ligne (salons entre copains, 2 à 4 joueurs + robots)

**Transport** (`reseau.js` → `PRESEAU`, navigateur) : voir l'en-tête du fichier. Étoile autour de l'hôte (le plus ancien arrivé dans le salon). `via: 'local'` (BroadcastChannel, tests et onglets) est écrit ; `via: 'supabase'` : présence et signalisation par Supabase Realtime (canal public `poncin:CODE`, `window.PONCIN_CONFIG` = { supabaseUrl, supabaseKey } publique), puis WebRTC (STUN publics, ICE non « trickle », deux DataChannels par client : `etat` non fiable et non ordonné, `evts` fiable), repli **relais** par Supabase Broadcast si le pair-à-pair échoue en ~8 s (débit borné : l'offre gratuite limite à ~100 messages/s pour tout le projet). Lien d'invitation `poncin/?salle=ABCD` ; `?reseau=local` force la voie locale (tests).

**Synchronisation** (`enligne.js` → `PENLIGNE`, glue entre `PRESEAU`, `PJEU` et l'interface) : l'**hôte fait autorité** (il simule toute la partie avec `PJEU`, robots compris) ; chaque client envoie ses commandes et affiche l'état reçu.
- `reglages` (hôte → tous, fiable) : { mode: 'arene', bots, niveau, equipes } ; les clients signalent `pret` par `salon.majMoi`.
- `lancer` (hôte → tous, fiable) : { graine, options, joueurs: [{ id, pseudo, couleur, equipe }], depart } → compte à rebours commun.
- `entree` (client → hôte, non fiable, 30 Hz) : { n, avant, cote, yaw, pitch (absolus), tir, saut, accroupi, recharge, arme, x, z (position prédite, pour contrôle) } ; l'hôte garde la dernière reçue et l'applique à chaque pas (`PJEU` accepte `yaw`/`pitch` absolus dans une entrée en plus de `dyaw`/`dpitch`).
- `etat` (hôte → tous, non fiable, 20 Hz) : { n, t, e: [[id, x, y, z, yaw, pitch, vie, armure, drapeaux, arme, kills, morts, points], …], o: objets disponibles, reste } (nombres arrondis) ; les clients affichent les autres avec ~100 ms de retard interpolé, et **prédisent leur propre déplacement** localement (même physique que `PJEU`), recalés en douceur sur l'hôte (net si l'écart dépasse 2 m).
- `evts` (hôte → tous, fiable, groupés par pas) : les événements utiles à l'image et au son (tir, touche, mort, reapparition, ramasse, annonce) ; `fin` : le résultat.
- Tirs : l'hôte les résout avec **compensation de latence** (il « rembobine » les autres joueurs de rtt/2 + 100 ms grâce à un historique d'1 s des positions) ; le client montre tout de suite l'éclair et la traînée, le marqueur de touche arrive avec `evts`.
- Départs : un client muet 10 s est retiré ; si l'hôte part, les clients voient « L'hôte a quitté la partie » et l'écran de fin.
- Interface : « Avec les copains » → Créer un salon (gros code, Partager le lien, Copier) / Rejoindre (taper le code) → salon (joueurs, ping et voie, l'hôte règle robots / niveau / équipes et lance) → partie (même HUD) → fin (l'hôte peut relancer). Pseudo par défaut tiré de listes (« Castor Turbo 42 »), modifiable dans les réglages.
