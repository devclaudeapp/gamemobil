# Opération Poncin — architecture du moteur

FPS cartoon sur la vraie carte de Poncin (01450). Ce fichier est le **contrat** entre les modules : chaque module respecte exactement les noms, les formes de données et les unités ci-dessous. Tout est en JavaScript « vanilla » (pas de bundler, pas de TypeScript), commenté en français comme le reste du dépôt.

## Conventions

- **Unités** : mètres, secondes, radians. **Axes** : `x` vers l'est, `z` vers le **sud** (le nord est vers `-z`), `y` vers le haut (comme Three.js). Le monde s'étend de `-L/2` à `+L/2` en `x` et en `z` (`L = carte.taille`).
- **Angles** : `yaw` = cap, 0 regarde vers le nord (`-z`), positif vers l'ouest (rotation Three.js autour de `y`, sens direct) ; direction du regard `d = (-sin(yaw)·cos(pitch), sin(pitch), -cos(yaw)·cos(pitch))`. `pitch` ∈ [-1.45, 1.45], positif vers le haut.
- **Hasard** : jamais `Math.random()` dans les modules purs ; un générateur `rnd()` (mulberry32) est passé en paramètre, pour que les tests et le réseau rejouent la même chose.
- **Modules purs** (`regles.js`, `monde.js`, `nav.js`, `corps.js`, `armes.js`, `zones.js`, `butin.js`, `classement.js` (son réseau passe par un supabase-js qu'on lui donne), `bots.js`, `jeu.js`, `arene.js`, `extraction.js`, `carte-provisoire.js`) : aucun DOM, aucun THREE ; ils tournent dans Node. Gabarit UMD (comme `src/game.js`) :
  ```js
  (function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
    else root.PJEU = factory(root.PREGLES);
  })(typeof self !== 'undefined' ? self : this, function (REGLES) { 'use strict'; /* … */ return { /* API */ }; });
  ```
- **Globales du navigateur** : `PREGLES`, `PCARTEPROV`, `PMONDE`, `PNAV`, `PCORPS`, `PARMES`, `PZONES`, `PBUTIN`, `PCLASSEMENT`, `PBOTS`, `PJEU`, `PARENE`, `PEXTRACTION`, `PAVATARS`, `PRENDU`, `PSONS`, `PCONTROLES`, `PHUD`, `PUI`. Three.js (r158, global `THREE`) et `MODELES` (`src/modeles.js`, réutilisé tel quel : `boite`, `capsule`, `sphere`, `cylindre`, `cone`, `mat`, `MAT`, `part`, `assembler`, `maille`, `mesh`, `texture`, `dispose`, `partager`…) sont chargés avant. Sans WebGL ou sans Three.js, le jeu affiche un panneau clair au lieu de planter.
- **Ordre de construction** (`build.js`) : `src/modeles.js`, `src/persos.js`, puis `regles.js`, `carte-provisoire.js`, `monde.js`, `nav.js`, `corps.js`, `armes.js`, `zones.js`, `butin.js`, `classement.js`, `bots.js`, `jeu.js`, `arene.js`, `extraction.js`, `avatars.js`, `textures.js`, `vegetation.js`, `decor.js`, `rendu.js`, `sons.js`, `controles.js`, `hud.js`, `reseau.js`, `enligne.js`, `ui.js` (point d'entrée). La page charge aussi `../vendor/three.min.js`, `../vendor/supabase.min.js` et `config.js`.
- **Style** : low-poly arrondi pastel comme Le Fournil (`src/modeles.js`) ; depuis la livraison 2, de **vraies armes** (modèles GLB de `poncin/armes/`) et des impacts réalistes (trous de balle, poussière, étincelles, douilles, traceurs discrets), robots rigolos ; **jamais de sang** (une touche sur un corps : un marqueur, un flash rouge chez celui qui est touché) ; le ton reste un jeu entre copains.
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
    armes: [{ x, z, arme: 'pompe' | 'precision' | 'soin' | 'armure' | 'munitions' | <id d'une principale> }],   // 'precision' : un fusil de précision (livraison 2)
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
  ARMES: [ { id: 'ak74', nom: 'AK-74', classe: 'fusil', role: 'principale', modele: 'ak74', degats, plombs: 1, cadence /* tirs/s */, chargeur, reserve, recharge /* s */, dispersion /* rad */, portee, chute: [debut, fin, minimum], tete: 1.5, recul, vitesse, changement, gonfle, visee: {…}, couleur }, … ],  // les 9 vraies armes (livraison 2, ci-dessous)
  ARMES_ID, CLASSES: { fusil, mitraillette, pompe, sniper, pistolet } (libellés), arme(id) → définition (un id inconnu : l'AK-74),
  degatsA(arme, distance, tete) → nombre,                 // avec la chute de dégâts
  MODES: { arene: { duree: 180, reapparition: 3, scoreVictoire: 25, bots: { min: 3, max: 5 }, invincible: 1.5 } },
  OBJETS: { ak74: { type: 'arme', arme: 'ak74', retour }, … (une par principale), munitions: { type: 'munitions', retour: 15 }, soin: { type: 'soin', vie, retour }, armure: { type: 'armure', armure, retour }, precision: { alias: true, arme: 'm24' } /* vieilles cartes */ },
  BOTS: { facile: { reaction, erreur, resserre, precision, vise, champ }, normal: {…}, fort: {…} },  // réaction (s), erreur de visée (rad) qui se resserre (/s), probabilité de tirer, vitesse de visée (rad/s), champ de vision (rad)
  NOMS_BOTS: [...], COULEURS: [...],
  mulberry32(graine) → rnd, hash(texte) → entier
}
Les chiffres exacts sont dans `regles.js` (source de vérité).
```
Depuis le lot Gameplay, `PREGLES` porte aussi `JOUEUR` v2 (postures…), `ARMES_ID`, `OBJETS.munitions`, `SALON`, `DEFAUT_REGLAGES`, `DEFAUT_EQUIP`, `normaliserReglages`, `equipementDe`, et depuis la livraison 2 les 9 vraies armes, `CLASSES` et `equipementRobot` : voir « Lot Gameplay : contrat » et « Livraison 2 » plus bas.

## `monde.js` → `PMONDE`

```js
const monde = PMONDE.creer(carte);
monde.L                                   // côté (m)
monde.hauteur(x, z) → y                   // le sol où l'on marche : relief interpolé dans les triangles du maillage (voir « Relief »), sans les bâtiments,
                                          // ou la chaussée d'un pont si elle est plus haute (C7 : les pieds ne s'enfoncent plus dans le tablier)
monde.relief(x, z) → y                    // le maillage seul (le sol dessiné)
monde.chaussee(x, z) → y | −Infinity      // la chaussée d'un tablier de pont (−Infinity hors des tabliers)
monde.tabliers                            // [{ ax, az, bx, bz, ux, uz, vx, vz, len, w, demi, n, prof (Float64Array n + 1), max }] : le profil que rendu.js dessine ;
                                          // chaussée = prof + PMONDE.CHAUSSEE (0,06 m) ; maçonnerie PMONDE.SUR_TABLIER (0,08 m) au-dessus du relief aux deux bouts
monde.bloque(x, z, r) → bool              // le cercle (x, z, r) touche un bâtiment, une zone interdite, l'eau hors pont, ou sort du carré / de la zone limite
monde.deplacer(x, z, dx, dz, r) → [x2, z2]  // déplacement d'un cercle qui glisse le long des murs (jamais à travers), en sous-pas si besoin
monde.rayon(ox, oy, oz, dx, dy, dz, max) → { t, x, y, z, nx, ny, nz, quoi: 'mur' | 'toit' | 'sol', i, de, k } | null   // premier obstacle (bâtiments = prismes ; voûtes ; troncs, murs, mobilier massif ; terrain) ; d normalisé
                                            // de : 'batiment' | 'voute' | 'arbre' | 'mur' | 'mobilier' | 'terrain' ; k : indice dans carte.arbres / murs / mobilier, ou du passage
monde.vue(ax, ay, az, bx, by, bz) → bool    // ligne de vue libre
monde.libre(rnd, centre?, rayon?) → [x, z]  // un point libre au hasard
monde.limite = { centre: [x, z], rayon } | limite v2 (PMONDE.limiteDe) | null   // fixé par la zone de la partie (PZONES ; voir « Livraison 3 »)
monde.batiments                             // [{ p, h, t, base, sommet, aabb: [x0, z0, x1, z1] }] normalisés (p à aire signée > 0)
monde.passe(ax, az, bx, bz, r) → bool ; monde.dedans(x, z) → bool ; monde.pente(x, z) → [dh/dx, dh/dz] (partagé)
monde.sousVoute(x, z) → indice du passage dont on est sous la voûte, sinon −1 ; monde.arche(p, x, z) → y de l'intrados du passage p
monde.passages                              // normalisés pour rendu.js : [{ n, l, w, h, u, long, sol: [ya, yb], b, bats: [{ i, entree, sortie, coupes }] }]
monde.couloirs (ponts), monde.interdits, monde.stats ; monde.accessible(x, z), branché par PNAV.creer (libre() évite les cours fermées)
```
Implémentation : grille spatiale (cellules ~12 m) des arêtes (épaisses ou non) : murs des bâtiments, clôtures des zones interdites, berges hors des ponts, bord du carré, troncs des arbres mesurés (`[x, z, h, r, e]` ; rayon clamp(0,12 + 0,025·h ; 0,2 ; 0,6), le feuillage des feuillus laisse passer les tirs au-dessus de max(2,5 ; h/2) m, celui des conifères arrête tirs et vues sans gêner les pas), `carte.murs` (un muret ≤ 45 cm se franchit comme une marche), mobilier massif (fontaine, monument en cylindres étagés, croix, abribus) et les 4 bancs de la place (`monde.bancs [[x, z, yaw]]`, posés par monde.js, dessinés par decor.js) ; cercle contre segments ; rayon contre prismes (test dans le plan xz puis bornes en y) et marche sur le terrain. Le détail (voûtes en plein cintre, piédroits) est dans l'en-tête de `monde.js`.

## `nav.js` → `PNAV`

```js
const nav = PNAV.creer(monde, { pas: 1.5, marge: 0.45 });
nav.chemin(ax, az, bx, bz) → [[x, z], …] | null   // A* 8 voisins (heuristique octile) puis lissage par lignes de vue ; ≤ 4 ms sur la carte entière
nav.libre(x, z) → bool ; nav.proche(x, z) → [x, z]   // le point navigable le plus proche
```

## `jeu.js` → `PJEU` (la simulation d'une partie, autoritaire chez l'hôte)

```js
const jeu = PJEU.creer({ monde, mode: PARENE, graine, options: { bots: 4, niveau: 'normal', equipes: false } });
jeu.ajouterJoueur({ id: 'moi', nom, couleur, equipe, humain: true, equip: { p, s } | 'p+s' }) → entite   // equip validé contre options.armes ; sans lui : l'équipement par défaut permis
jeu.etape(dt, entrees) → evenements        // entrees : { [id]: entree } ; les bots sont pilotés en interne par PBOTS ; dt borné à 1/20 s
jeu.entites                                 // tableau d'entités (ci-dessous)
jeu.temps, jeu.fini, jeu.classement()        // tri par score
jeu.aideVisee(id, force) → { dyaw, dpitch, surCible: bool, ralentir: 0..1 }   // au doigt : à ≤ 4° d'une cible à ≤ 40 m en vue, la visée ralentit (ralentir ≈ 0,4) et s'aimante doucement (≤ 2,5° × (1 − d/50)) ; surCible = cône de 1,5° sur un ennemi en vue (tir auto après ~120 ms)
```
**Entité** : `{ id, nom, couleur, equipe, humain, bot: bool, x, y, z, vy, yaw, pitch, auSol, accroupi, vie, armure, vivant, mortDepuis, invincible, arme: 'ak74', armes: ['ak74', 'p226'], slot: 0, equip: { p, s }, munitions: { ak74: 30, p226: 15 }, reserve: { ak74: 120, p226: 45 }, rechargeJusqua, prochainTir, score: { kills, morts, points }, serie }` + les champs v2 (« Entité v2 » plus bas).

**Entrée** (une par image et par joueur, même forme pour les bots) : l'entrée v2 (plus bas : `avant, cote, dyaw, dpitch, tir, saut, accroupi, couche, course, vise, recharge, arme: null | 0 | 1, changer`). Une entrée sans les niveaux `course` / `couche` / `vise` est jouée en v2, ces niveaux à `false`.

**Événements** (rendus, sons, HUD, réseau) :
```js
{ t: 'tir', id, arme, o: [x, y, z], fin: [x, y, z], impact: { x, y, z, nx, ny, nz, quoi, mat, id? } | null }   // un par plomb ; détail : « Livraison 2 »
{ t: 'touche', de, a, degats, tete, mort: bool, arme }   { t: 'refus', id, quoi: 'couche' }
{ t: 'mort', a, par, arme }      { t: 'reapparition', id }
{ t: 'ramasse', id, objet }      { t: 'recharge', id }      { t: 'saut', id }      { t: 'pas', id }
{ t: 'annonce', texte }          { t: 'fin', classement }
```
Tirs : à balle instantanée, depuis l'œil (`y + e.oeil`, selon la posture), dans la direction du regard plus une dispersion tirée par `rnd` ; le premier touché parmi le monde (`monde.rayon`) et les capsules des entités vivantes (`PCORPS.capsule` : par posture, la tête en haut) ; dégâts par `PREGLES.degatsA`.

## `arene.js` → `PARENE` (un mode = des crochets appelés par `jeu`)

```js
{ id: 'arene', nom: 'Arène',
  init(jeu), tick(jeu, dt, evs), surMort(jeu, victime, tueur, evs), apparition(jeu, entite) → [x, z, yaw],
  objets(jeu) → [{ id, x, z, objet, dispo }],    // armes et soins à ramasser, qui réapparaissent
  fini(jeu) → bool, resultat(jeu) → { classement, gagnant, duree } }
```

## `bots.js` → `PBOTS`

```js
PBOTS.penser(bot, jeu, dt, rnd) → entree     // une entrée v2, même forme qu'une entrée humaine : le bot « joue » au joystick
PBOTS.BANDE[id], PBOTS.PORTEE[id]             // la distance qu'il garde et sa portée de tir, par arme (selon la classe)
```
États : patrouille (chemin `nav` vers un point libre ou un objet ; il court sur plus de 15 m), chasse (dernière position vue), combat (vise avec un retard de réaction et une erreur selon `PREGLES.BOTS[niveau]`, tire par rafales, se déplace de côté), fuite à faible vie vers un soin. Ils ne voient qu'en ligne de vue (`monde.vue`) et dans un cône de 110° (45 m, 90 m un fusil de précision en main). Livraison 2 : équipés comme les humains (l'Arène tire `PREGLES.equipementRobot` parmi les armes permises), ils visent au-delà de 12 m (dans leur bande) et toujours au fusil de précision, qu'ils ne tirent qu'une fois la lunette posée ; ils s'accroupissent pour tirer de loin au fusil d'assaut (normal et fort, une fois sur deux) et pour recharger à l'abri, se couchent au fusil de précision (« fort », de loin, s'ils ne sont pas pris pour cible, et s'il y a la place) ; ils passent à la secondaire quand la principale est vide (chargeur vide et cible à moins de 15 m, ou plus rien) ou ne convient pas (fusil de précision à moins de 8 m, pompe à plus de 20 m), au plus toutes les 1,5 s, et reprennent la principale hors combat.

## `rendu.js` → `PRENDU` (Three.js)

```js
PRENDU.init(canvas, carte, monde, { qualite }) → bool   // false sans WebGL
PRENDU.taille(w, h)                                       // CSS px ; la résolution suit la qualité
PRENDU.image(jeu, idCamera, dt, t, alpha?)                 // place caméra et entités, rend ; jeu = null → survol cinématique de Poncin (écran titre, menus)
                                                           // alpha ∈ [0, 1] (défaut 1) : la fraction du pas fixe en cours ; position affichée = a + (x − a)·alpha
                                                           // (ax, ay, az, aoeil posés au début de chaque pas ; pas d'interpolation à travers une téléportation > 4 m)
PRENDU.reglages({ balancement: 'normal' | 'doux' | 'aucun' }) → { balancement }   // le réglage du joueur (×1, ×0,5, ×0) transmis à PCORPS.camera
PRENDU.evenements(evs, jeu)                                 // éclairs, traînées, impacts de peinture, morts
PRENDU.qualite(q?) ; PRENDU.stats → { webgl, qualite, calls, triangles, geometries, textures, ms }
PRENDU.projeter(x, y, z) → { x, y, devant }                 // pour le HUD (noms au-dessus des têtes)
```
Le décor : sol = relief maillé (triangulation partagée) avec la photo aérienne (`carte.sol`, chemin relatif à `poncin/carte/`) ou un sol peint sur canvas à partir des rues, de l'eau et de la végétation ; bâtiments extrudés et **fusionnés** par tuiles de 150 m (≤ 16 maillages, chacun un appel de dessin, éliminés hors du champ), habillés selon leur matière réelle par `PTEXTURES` (voir « Authenticité ») ; les deux **passages voûtés** creusés en arcade (voir plus bas) ; végétation par `PVEGETATION`, mobilier, enseignes et horizon par `PDECOR`. Eau translucide animée, ponts de pierre, ciel peint, brume selon la qualité ; château et zones interdites clôturés. Le détail à jour est dans l'en-tête de `rendu.js`. Personnages (`avatars.js`) : joueurs = chibis de `PERSOS.creer` (src/persos.js, lecture seule ; 1 unité = 1 px du Fournil → mise à l'échelle vers 1,6 m) casqués aux couleurs de leur équipe, blaster à la main ; bots = robots arrondis pastel (antenne, yeux LED), animés sans allocation. Arme en vue subjective dans une **scène à part** (caméra proche, rendue après le monde avec `clearDepth`) : balancement sur la même phase de foulée que la caméra (C3), recul, recharge, éclair. Caméra du joueur (C1, C2) : `PCORPS.camera` sur la position affichée ; le regard affiché = celui de la simulation + `PCONTROLES.enAttente()` (visée sans latence). Avatars : `PAVATARS.animer(av, e, dt, t, x?, y?, z?)` (x, y, z : la position affichée), robots et chibis sur la phase de foulée (C3). Effets en pools : traînées, éclairs, impacts de peinture (`InstancedMesh` en anneau, orientés par la normale), confettis à l'élimination. Qualité adaptative (haute / moyenne / éco) reprise de `src/scene.js` (`?qualite=`, SwiftShader en éco ; ombres seulement en haute ; DPR plafonné) ; budgets : ≤ 110 / 90 / 70 appels de dessin, ≤ 300k / 200k / 120k triangles ; aucune allocation par image dans les chemins chauds ; contexte WebGL perdu → la simulation continue, le décor se reconstruit au retour.

## `controles.js` → `PCONTROLES`, `hud.js` → `PHUD`, `sons.js` → `PSONS`, `ui.js` → `PUI`

- `PCONTROLES.init(racine, { tactile })` ; boucle à pas fixe (§ 2) : `PCONTROLES.lire() → cumul` une fois par **image** (variations dyaw/dpitch additionnées, fronts saut / recharge / arme / appui bref sur Tir combinés par OU, niveaux avant / cote / tir / accroupi gardés), `PCONTROLES.consommer() → entree` une fois par **pas** (le premier pas de l'image prend variations et fronts, les suivants n'ont que les niveaux ; une image sans pas garde tout le cumul), `PCONTROLES.enAttente() → { dyaw, dpitch }` (les variations pas encore consommées, que le rendu ajoute au regard affiché), `PCONTROLES.attenuer(k)` (ui.js : k = 1 − ralentir de l'aide à la visée ; le regard en attente est montré × k, pour qu'il ne recule jamais au pas suivant — 120 Hz) ; objets réutilisés ; Pointer Events suivis par `pointerId`, `touch-action: none` ; joystick flottant à gauche (apparaît sous le pouce, rayon 60 px, zone morte 8 %), glisser à droite pour viser (≈ 0,22°/px, courbe d^1,15, Y inversable), bouton Tir (84 px, en bas à droite) qui vise aussi quand on le glisse, Saut, Recharge, Accroupi, emplacements d'armes ; tir automatique quand `jeu.aideVisee` dit `surCible` (réglage, activé par défaut au doigt) ; clavier par `event.code` (KeyW/A/S/D : marche aussi en AZERTY), Espace, R, C, 1-3, souris en pointer lock (≈ 0,0022 rad/px), Échap = pause, Tab = scores.
- `PHUD.init(racine)`, `PHUD.maj(jeu, idJoueur, evs, aide)` (aide : `jeu.aideVisee` du dernier pas, gardée aussi pour les images où seul `avantImage` rend des événements) : viseur (s'élargit avec la dispersion, rouge sur une cible), marqueur de touche, vie/armure, munitions, chrono, fil des éliminations, minicarte, indicateur de direction des dégâts, tableau des scores, écran de fin.
- `PSONS` : WebAudio synthétisé (comme Le Fournil) : tirs par arme, impacts, touche, élimination, pas, recharge, ramassage ; vibrations.
- `PUI` : menus (choix du mode — Arène jouable, Extraction et Jour / Nuit « bientôt » —, solo : nombre et niveau des bots), pause, réglages (sensibilité, qualité, son), crédits « © IGN – © contributeurs OpenStreetMap », retour à la Salle de jeux (`window.PONCIN_ACCUEIL`), sauvegarde `poncin.v1` (réglages dont `balancement`, records), crochets de test `window.__poncin` (dont `manuel(oui)` : les images sont menées par le test ; `images(dts, { remettre })` : des images de durées données, chacune avec l'heure t synthétique, aussi passée à `avantImage` ; `compteurs()` → { pas, alpha, acc, pasDuree, max }).
- **La boucle** (`ui.js`, § 2) : à chaque image, `PCONTROLES.lire()`, puis `PJEU.pasFixe({ pas: 1/60, max: 4 })` (au-delà de 4 pas de retard, le temps est perdu), puis en ligne chez le client `jeu.avantImage(now)` avec `now` = **l'horodatage de requestAnimationFrame** (pas `performance.now()` après les pas : son écart irrégulier ferait trembler les autres), puis `PRENDU.image(…, alpha)`.

## Tests

- `test/poncin.test.js` (Node, dans la CI) lance `poncin-carte`, `poncin-monde`, `poncin-corps`, `poncin-armes`, `poncin-salon`, `poncin-zones`, `poncin-jeu`, `poncin-bots`, `poncin-enligne-sim`, `poncin-butin`, `poncin-extraction`, `poncin-enligne-extraction` et `poncin-classement` (`*.test.js`) : règles, collisions, rayons, A*, bots, postures et caméra, armes, réglages, zones, une partie d'Arène simulée de bout en bout (bots contre bots, sans erreur, scores cohérents, rejouable à l'identique avec la même graine), et le jeu en ligne simulé (enligne.js tel quel dans vm, faux salon direct / relais / mauvais : à-coups des autres, recalages, rejets, appuis brefs sur Tir, tricheurs, gigue de l'heure d'image ; ~5 s).
- Playwright (`NODE_PATH=/opt/node22/lib/node_modules node test/….cjs`) : `poncin-play` (iPhone simulé), `poncin-scene` (captures), `poncin-camera` (balancement 2–3,5 Hz, œil lissé, arme au même rythme), `poncin-commandes` (pas fixe, cumul, fronts, réglage Balancement, aide à la visée à 120 Hz), `poncin-enligne` (trois pages, voie locale ; aussi `RESEAU=webrtc-local` et, sur GitHub Actions, `RESEAU=supabase`), `poncin-reseau`, `poncin-en-ligne-ci` (Supabase réel, workflow `en-ligne.yml`, qui lance aussi `poncin-commandes` et `poncin-camera`).

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
- `monde.js` : dans un passage, les morceaux de façade compris dans le couloir disparaissent au sol et ses côtés deviennent des piédroits ; les tirs passent sous l'intrados en plein cintre (naissance à h − w/2, clé à h) et le bâtiment reste plein au-dessus ; `sousVoute(x, z)` et `arche(p, x, z)` servent au rendu (l'arme s'assombrit dessous) ; `nav.js` y fait passer les chemins. La fabrique de carte (`outils/carte/construire.js --passages`) les produit à partir d'OSM.
- `rendu.js` : arcade en plein cintre découpée dans les façades d'entrée et de sortie (`monde.passages[].bats[].coupes`), archivolte de pierre de taille, intérieur voûté en moellons (berceau, piédroits, pavés) dans un maillage à part que seul le ciel éclaire, plus sombre dedans.
- **Bâtiments remarquables**, reconnaissables d'après les données (OSM `name`, `shop`, `amenity`) : la mairie (« Hôtel de ville de Poncin » : drapeaux tricolores, inscription MAIRIE, horloge), le bureau de tabac (« Bureau de Tabac Presse » : losange rouge « carotte » TABAC et bandeau PRESSE), la banque (« Crédit Agricole » : bandeau au nom, sans logo de marque), La Poste, le Bar des Sports (terrasse), la boulangerie « Aux Pains Dorés », le Petit Casino, l'office de tourisme, la pharmacie… ; l'église Saint-Martin et le château gardent leur traitement à part.
- Références visuelles autorisées : les données ouvertes, les images de rue libres **Panoramax** (Licence Ouverte ou CC-BY-SA, comme référence de formes et de couleurs) et les photos que le joueur fournit lui-même. **Jamais Google Maps ni Street View** (leurs conditions interdisent d'en extraire ou d'en dériver du contenu).

## Le jeu en ligne (salons entre copains, 2 à 4 joueurs + robots)

**Transport** (`reseau.js` → `PRESEAU`, navigateur) : voir l'en-tête du fichier. Étoile autour de l'hôte (le plus ancien arrivé dans le salon). `via: 'local'` (BroadcastChannel, tests et onglets) est écrit ; `via: 'supabase'` : présence et signalisation par Supabase Realtime (canal public `poncin:CODE`, `window.PONCIN_CONFIG` = { supabaseUrl, supabaseKey } publique), puis WebRTC (STUN publics, ICE non « trickle », deux DataChannels par client : `etat` non fiable et non ordonné, `evts` fiable), repli **relais** par Supabase Broadcast si le pair-à-pair échoue en ~8 s (débit borné : l'offre gratuite limite à ~100 messages/s pour tout le projet). Lien d'invitation `poncin/?salle=ABCD` ; `?reseau=local` force la voie locale (tests).

**Synchronisation** (`enligne.js` → `PENLIGNE`, glue entre `PRESEAU`, `PJEU` et l'interface) : l'**hôte fait autorité** (il simule toute la partie avec `PJEU`, robots compris) ; chaque client envoie ses commandes et affiche l'état reçu.
- `reglages` (hôte → tous, fiable) : { mode: 'arene', bots, niveau, equipes } ; les clients signalent `pret` par `salon.majMoi`.
- `lancer` (hôte → tous, fiable) : { graine, options, joueurs: [{ id, pseudo, couleur, equipe }], depart } → compte à rebours commun.
- `entree` (client → hôte, non fiable, tous les 2 pas de 1/60 s = 30 Hz ; ~185 o en direct, ~340 o en relais) : `{ k, n, tc /* ms, horloge du client */, av, co, ya, pi /* regard absolu */, ti /* a tiré depuis l'entrée d'avant */, nt /* tirs montrés depuis le début */, sa, ac, re, ar, x, y, z, vy, sol, m, v, tv, ae, ad, tr: [[Δtc, x, y, z, po], …] }` ; les champs nuls (co, ti, sa, ac, re, ar, tr) sont omis et lus comme 0 / false / null ; `tr` : les positions des pas depuis l'entrée précédente (en relais, les 270 dernières ms, un pas sur deux) ; saut, recharge et arme sont tenus 150 ms (450 ms en relais).
- **Piste chez l'hôte** (C5, § 9.1) : 32 échantillons par client, datés à son horloge, validés à l'arrivée — vitesse à l'horloge du client (`(vmax × 1,25 + 1)·Δtc`), **et un seau rempli au temps de l'hôte** (`vmax × 1,15 + 0,3` m/s, 3 m au plus) où chaque déplacement accepté puise sa distance (un tc qui court devant, une reprise sur deux, des `v = 0` : aucune vitesse en plus ; un client sans tc passe par le même seau), pas dans un mur, hauteur, mêmes morts ; un refus = accusé négatif et reprise de la simulation de l'hôte au dernier point valide. Lecture retardée de `max(45 ms ; 1,3 × intervalle + 2,5 × gigue)` à une heure qui avance d'environ dt (±5 %), prolongée 100 ms puis tenue ; sans nouvelles depuis 250 ms l'hôte reprend sa simulation. Un `v = 0` alors que l'hôte le voit vivant est ignoré (la piste est tenue).
- **Tirs comptés** : le client compte les tirs qu'il montre (`nt`) ; l'hôte en fait autant (`en.tir` tant que `nt` > tirs faits, un tir par pas au plus quel que soit le nombre de plombs) : un appui bref perdu, reçu dans le désordre ou écrasé par le relais n'est plus perdu, un appui tenu n'est pas doublé ; une dette impayable en 600 ms (mort, recharge) s'éteint. Un client sans `nt` est servi au niveau `ti`.
- `etat` (hôte → tous, non fiable, 20 Hz) : { n, t, e: [[id, x, y, z, yaw, pitch, vie, armure, drapeaux, arme, kills, morts, points, …munitions, ack], …], o: objets disponibles, reste } (nombres arrondis) ; les clients **prédisent leur propre déplacement** (même physique que `PJEU`, un pas fixe à la fois), recalés en douceur sur l'hôte (net au-delà de 2 m, 8 m s'il est accusé).
- **Horloge douce chez le client** (C6, § 9.2) : `jeu.avantImage(maintenant) → événements` (façade du client, appelée par ui.js à chaque image avec l'heure de l'image) suit l'horloge de l'hôte à ±5 % (net au-delà de 0,25 s), fait glisser le retard d'interpolation (±5 % de dt, ≥ 100 ms) et interpole les autres à cette heure (`ax = x` : le rendu ne les interpole pas une seconde fois) ; `jeu.etape(1/60)` ne fait plus que la prédiction et l'entrée (sans `avantImage`, etape fait tout comme avant). L'hôte en arrière-plan rattrape par pas fixes de 1/60 s (au plus 1 s).
- `partie.stats()` : chez l'hôte `{ hote: true, messagesParClientParS, envoyes, t, clients: [{ id, rtt, adopte, retard, intervalle, piste, D, gigue, rejets, teleports, prolonge, seau, tirs, dette }] }` ; chez le client `{ hote: false, recusParS, envoyesParS, recus, envoyes, t, cale, retard, tampon, recalage, cales, douces, delai, delaiEff, sautsHorloge, prolonge, parImage, intervalle }`.
- `evts` (hôte → tous, fiable, groupés par pas) : les événements utiles à l'image et au son (tir, touche, mort, reapparition, ramasse, annonce) ; `fin` : le résultat.
- Tirs : l'hôte les résout avec **compensation de latence** (il « rembobine » les autres joueurs de rtt/2 + 100 ms grâce à un historique d'1 s des positions) ; le client montre tout de suite l'éclair et la traînée, le marqueur de touche arrive avec `evts`.
- Départs : un client muet 10 s est retiré ; si l'hôte part, les clients voient « L'hôte a quitté la partie » et l'écran de fin.
- Interface : « Avec les copains » → Créer un salon (gros code, Partager le lien, Copier) / Rejoindre (taper le code) → salon (joueurs, ping et voie, l'hôte règle robots / niveau / équipes et lance) → partie (même HUD) → fin (l'hôte peut relancer). Pseudo par défaut tiré de listes (« Castor Turbo 42 »), modifiable dans les réglages.

## Lot Gameplay : contrat

Déplacements fluides, postures, nouvelles armes à deux emplacements, visée, réglages du salon (6 joueurs), zones de la carte, heure et météo. Les **chiffres** et leurs mesures sont dans la conception du lot Gameplay (§ 1 à 14, avec les décisions du joueur) : ce chapitre n'en reprend que les noms et les formes. Légende : **[branché]** = en service dans la partie d'aujourd'hui ; **[prêt]** = écrit et testé dans Node, pas encore appelé par l'interface ; **[lot 2/2]** = à faire.

**Règle de cette phase** : la partie se joue comme avant (mêmes armes, mêmes chiffres, mêmes écrans), sauf l'accélération devenue indépendante du pas (`k = 1 − e^(−14·dt)` au sol, `1 − e^(−2,2·dt)` en l'air, au lieu de `min(1, 14·dt)`) et la **livraison 1 « Fluidité »** (C1–C7 : balancement calé sur la foulée et réglage Balancement, œil lissé, arme et avatars sur la même foulée, pas fixe de 1/60 s et interpolation du rendu, piste chez l'hôte, horloge douce chez le client, sol des ponts). Le reste attend que les commandes v2 envoient ses niveaux.

### Modules et ordre de construction

| élément | état |
|---|---|
| `corps.js` → `PCORPS`, `armes.js` → `PARMES`, `zones.js` → `PZONES` (modules purs) | **[branché]** (jeu.js passe par eux) |
| `build.js` : … `regles`, `carte-provisoire`, `monde`, `nav`, **`corps`, `armes`, `zones`**, `bots`, `jeu`, `arene`, `avatars`, … `ui` | **[branché]** |
| `PJEU.deplacer` = `PCORPS.deplacer` ; `PJEU.dispersion` = `PARMES.dispersion` ; `PJEU.tirVisuel` = `PARMES.tirVisuel` | **[branché]** |
| `PJEU.pasFixe` (boucle à pas fixe) ; `PCONTROLES.lire()` (cumul) / `consommer()` / `enAttente()` / `attenuer(k)` | **[branché]** (livraison 1 « Fluidité ») |
| `PCORPS.camera` (C1 + C2), arme et avatars sur la phase de foulée (C3), `PRENDU.image(…, alpha)`, `PRENDU.reglages({ balancement })` | **[branché]** |
| piste chez l'hôte (C5), horloge douce et `jeu.avantImage` (C6), tirs comptés (`nt`), seau de déplacement | **[branché]** (format d'entrée v1 + `tc`, `tr`, `nt`) |
| sol des ponts (C7) : `monde.hauteur` suit les tabliers ; `monde.relief`, `monde.chaussee`, `monde.tabliers` | **[branché]** |
| `PJEU.creer` : options = réglages normalisés, paramètre `zone` ; `jeu.peutBlesser`, `jeu.vieMax`, `jeu.armureMax` ; crochet de mode `apresNav` | **[branché]** (livraison 3, « Le salon » : voir plus bas) |
| instantané v2 (`ligneDe` / `lireLigne`, § 9.3 : arme, emplacements, munitions, posture) | **[branché]** dans jeu.js (livraison 2 ; `ARMES_ID` reparti à zéro : `PRESEAU` VERSION 2 à poser par l'intégrateur) |
| régime v2 pour tous dans le jeu (équipement, entrée v2 forcée), 9 vraies armes, objets réels et caisses de munitions, robots équipés, événements de tir enrichis (`mat`) | **[branché]** (livraison 2, voir plus bas) |
| entrée réseau v2 (cr, cc, vi, po, oe ; validation de posture ; `en.origine`) | **[lot 2/2]** |
| `PMONDE.limiteDe` et `monde.limite` v2 ; les six zones (`PZONES`) | **[branché]** (livraison 3) |
| `PRENDU.ambiance({ heure, meteo })` ; commandes v2 (course, couché, visée, emplacements dans le même cumul) ; HUD v2 ; `PRESEAU` VERSION 2, salon de 6, budget de relais (`httpSend` sur `poncin:CODE:h`, `relaisComptesParS`) | **[lot 2/2]** |

### La boucle à pas fixe (§ 2) — `PJEU.pasFixe` [branché]

```js
const boucle = PJEU.pasFixe({ pas: 1 / 60, max: 4 });
const alpha = boucle.avancer(dtImage, (pas) => { /* un pas de simulation : jeu.etape(pas, entrees) */ }); // acc = min(acc + dt, max·pas) ; tant que acc ≥ pas : fnPas(pas), acc −= pas ; alpha = acc / pas ∈ [0, 1[
boucle.remettre();   // acc = 0 (pause, reprise)
```
Au début de **chaque pas**, `jeu.etape` copie `(x, y, z, oeil)` de chaque entité dans `(ax, ay, az, aoeil)` ; une téléportation (`placer` à l'apparition, un saut de plus de 4 m dans `lireLigne`) fait `ax = x`. Le rendu montre `a + (x − a)·alpha`. Les commandes d'une image : variations additionnées, fronts combinés par OU, niveaux gardés (§ 2). `DT_MAX` (1/20 s) reste pour `etape` appelé directement.

### Le corps (§ 3) — `PCORPS` (corps.js)

```js
PCORPS.deplacer(e, en, dt, monde, A) → MV { dep, saut, glisse /* début de glissade */, atterrit /* vy à l'atterrissage ou 0 */, refus /* 'couche' | null */ }  // MV réutilisé
PCORPS.capsule(e) → { ax, ay, az, bx, by, bz, r, tete: { haut } | { x, y, z, r } }    // objet réutilisé ; debout / accroupi / glissade : axe vertical ; couché : axe le long du regard + sphère de tête
PCORPS.rayon(ox, oy, oz, dx, dy, dz, e, tMax) → t | −1    // PCORPS.TOUCHE = { y, tete, cx, cy, cz } (point de l'axe le plus proche : la normale de l'impact)
PCORPS.oeil(e), PCORPS.haut(e), PCORPS.vitesseMax(e, A, monde, dx?, dz?), PCORPS.peutCoucher(e, monde), PCORPS.changerPosture(e, vers, duree)
PCORPS.POSTURES = ['debout', 'accroupi', 'glisse', 'couche'], PCORPS.NEUTRE, PCORPS.estV2(en)
PCORPS.camera(opts?) → f(e, dt) → { y, cote, roulis, k, phase }   // opts.balancement : 'normal' | 'doux' | 'aucun' ; f.regler(opts), f.remettre() ; objet rendu réutilisé
```
- **Deux régimes, choisis par l'entrée.** Entrée *historique* (aucun des niveaux `course`, `couche`, `vise`) : le déplacement d'avant, accroupi immédiat (2,4 m/s, œil 1,0, capsule 1,2), seul `k` a changé (gardé pour les vieux tests et `PJEU.deplacer` appelé avec une entrée v1 : **jeu.js ne le prend plus**, livraison 2). Entrée *v2* (au moins un de ces niveaux, même à `false`) : postures et transitions linéaires (0,18 s accroupi, 0,6 / 0,45 s couché, 0,1 s pour se relever en sautant), course à 7,0 m/s (avant ≥ 0,7, ≤ 40°, vise < 0,1 et pas demandée, sans tir ; tirer la coupe et `e.remonte = 0,18 s`), glissade (front accroupi en course à ≥ 6 m/s, attente 0,8 s), couché (place 0,8 m, pente ≤ 35 %, refus `{ t: 'refus', id, quoi: 'couche' }`), réception (vy < −7 → ×0,5 pendant 0,25 s), facteurs arme / visée / pente **[prêt]**. `e.corpsV2` dit quel régime a joué le dernier pas ; `PCORPS.oeil` / `haut` / `capsule` d'une entité historique se lisent sur `e.accroupi`.
- Les minuteries du corps (`relanceA`, `receptionA`, `remonte`) sont des **durées restantes** (s), pas des dates : la prédiction du client n'a pas besoin d'horloge.
- **Caméra** : y = œil lissé (Holt, `a = 1 − e^(−dt/0,05)`, `b = 1 − e^(−dt/0,09)`, net au-delà de 0,6 m) − A·(1 − cos 2φ)/2 + creux d'atterrissage (−min(0,10 ; 0,02·|vy|), ressort ω = 14/s) ; φ += π·d/(0,75 + 0,2·v) ; A = 1,2 cm debout, 1,8 en course, 0,6 accroupi, 0 couché ou en glissade, ×0,2 en visée ; côté 0,6 cm·sin φ, roulis 0,0025·sin φ. `phase` sert à l'arme subjective et aux avatars (C3). Le tir part toujours de l'œil de la simulation.

**Entité v2** (valeurs par défaut posées par `ajouterJoueur` et `placer` ; livraison 2 : `corpsV2` vrai et `equip` posé pour tous) : `posture`, `vers`, `transition` (s restantes), `oeil`, `hautCapsule`, `corpsV2` ; `course`, `gv`, `gdx`, `gdz` (glissade), `relanceA`, `receptionA`, `remonte` ; `vise` (0..1), `viseStable` (s) ; `accroupiPrec`, `couchePrec` (fronts) ; `ax`, `ay`, `az`, `aoeil` ; `armes`, `slot` (0 | 1), `equip` (`{ p, s }` ; `null` = équipement historique, plus jamais dans le jeu), `changeJusqua`, `changeReste`, `lampe`. `e.accroupi` reste (`posture ≠ 'debout'`).

**Entrée v2** : `{ avant, cote, dyaw, dpitch | yaw, pitch, tir, saut, accroupi, couche, course, vise, recharge, arme: null | 0 | 1 (emplacement) | id (compat), changer (front), origine? }`. Accroupi, couché, course et visée sont des **niveaux** (une entrée perdue ne perd rien ; la simulation trouve elle-même le front accroupi de la glissade). `origine` (tir d'un client depuis sa position) : **[lot 2/2]**.

### Les armes (§ 4, § 5) — `PARMES` (armes.js) et `PREGLES.ARMES`

```js
PARMES.dispersion(e, A), PARMES.tirer(e, jeu, out), PARMES.tirVisuel(e, monde, entites, rnd, out),
PARMES.majVisee(e, en, dt), PARMES.changer(e, slot | id, jeu) → bool, PARMES.recharger(e, jeu, out), PARMES.finirRecharge(e), PARMES.equiper(e, equip, reglages),
PARMES.agir(e, en, dt, jeu, out)   // un pas d'armes : changement, fin de recharge, recharge, tir, recharge auto, viseur qui se referme
PARMES.utile(e, O), PARMES.prendre(e, O, jeu)   // objets 'arme' et 'munitions' (soin et armure restent dans jeu.js)
PARMES.peutTirer(e), PARMES.secours(e)          // pas de tir en course, pendant la remontée de l'arme, ni en transition vers / depuis couché ; l'arme jamais à sec
```
- Le tir utilise `jeu.temps`, `jeu.dt` (le pas en cours), `jeu.rnd`, `jeu.monde`, `jeu.entites`, `jeu.ennemis` et des crochets exposés par `PJEU` pour ce module : `jeu.rembobiner(tireur)`, `jeu.restaurer()`, `jeu.blesser(cible, de, degats, tete, arme, out)`, `jeu.faireBruit(e, portee)`. L'historique de compensation de latence garde la posture, la hauteur de capsule et le yaw.
- **Régime historique** (`e.equip === null`, `PARMES.equiper(e, null)`) : gardé dans le module pour les vieux tests, **plus aucun chemin du jeu ne le prend** (livraison 2) : l'arme de base (`DEFAUT_EQUIP.p`) au départ, armes ramassées ajoutées, arme vide de tout lâchée, l'arme de base jamais à sec, changement en 0,3 s, dispersion d'avant la visée (`dispersionAvantVisee` a disparu avec les blasters).
- **Emplacements** (`ajouterJoueur({ …, equip })`) **[branché]** (livraison 2, tout le monde) : `e.armes = [principale, secondaire]`, secondaire jamais sous un chargeur de réserve, changement en `A.changement` (annule recharge et visée), arme ramassée = nouvelle principale jusqu'à la mort, objet `munitions` = deux réserves pleines, dispersion v2 (§ 4 : posture, visée, stabilisation de la lunette en 0,35 s, mouvement ×(1 − 0,5·vise), recul ×(1 − 0,3·vise)).
- **Armes** : les 9 vraies armes de la livraison 2 (plus bas). Champs : `id, nom, classe, role ('principale' | 'secondaire'), modele (= id), degats, plombs, cadence, semiAuto, chargeur, reserve, recharge, dispersion, dispersionMouvement, portee, chute, tete, recul, vitesse, changement, gonfle, visee: { viseur: 'lunette' | 'point' | 'fer', zoom, dispersion (facteur), vitesse (facteur), entree (s), oeil (point de mire du modèle : null, mesuré par le rendu) }, couleur`. `GONFLE` de jeu.js est remplacé par `A.gonfle`.
- Duels robot contre robot (§ 14) et choix d'arme des robots (§ 11) : **[branché]** (livraison 2 ; `test/poncin-armes.test.js`).

### Réglages du salon (§ 6) — `PREGLES`

```js
SALON = { max: 6, zones, durees: [180, 300, 600, 0], scores: [10, 25, 50], heures, meteos, vies: { normale, unCoup, costaud }, reapparitions: { rapide: 3, normale: 6, lente: 10, aucune: -1 }, manches: [1, 3, 5] }
DEFAUT_REGLAGES = { v: 2, mode: 'arene', zone: 'centre', duree: 180, score: 25, heure: 'jour', meteo: 'clair', equipes: false, bots: 4, niveau: 'normal',
  tirAllie: false, vie: 'normale', reapparition: 'rapide', manches: 3 /* « dernier debout » : lu seulement si reapparition = 'aucune' */, objets: true, aide: true,
  armes: ['ak74', 'm4', 'ump', 'mp9', 'pompe', 'm24', 'awm', 'm1911', 'p226'] }
DEFAUT_EQUIP = { p: 'ak74', s: 'p226' }
normaliserReglages(r, { humains }) → copie bornée   // inconnu → défaut ; booléens stricts ; bots ≤ 6 − humains ; armes ⊂ ARMES (ordre du réseau), au moins une principale et une secondaire
equipementDe(demande /* { p, s } ou 'p+s' */, reglages) → { p, s }   // DEFAUT_EQUIP s'il est permis, sinon la première arme permise de l'emplacement
armesPermises(liste) → liste normalisée
equipementRobot(rnd, reglages, niveau) → { p, s }     // au hasard rejouable parmi les armes permises : fusils 3, mitraillettes et pompe 2, fusils de précision 1 (2 en « fort »), pistolets 1
```
**[branché]** : `PJEU.creer({ options })` les normalise et les applique tous (livraison 3 : durée 0, score, vie, tir allié, réapparition dont « aucune » en manches, aide, objets, zone, heure et météo ; voir « Livraison 3 »). `normaliserReglages(r, { humains: 0 })` est permis (une partie de robots seuls : robots ≤ 6).

### Zones (§ 7) — `PZONES` (zones.js)

```js
PZONES.preparer(carte, monde, nav, id, rnd, reglages?) → { id, demande, nom, limite, englobant: { centre, rayon }, apparitions: [[x, z], …], objets: [[x, z, objet], …], aire, joueurs, avertissement? }
PZONES.definition(carte, monde, id), PZONES.adopter(z, monde), PZONES.pourReseau(z), PZONES.distanceReapparition(zone) → clamp(0,32 · rayon englobant, 15, 60)
PZONES.IDS, PZONES.NOMS, PZONES.JOUEURS
```
`rnd` = `mulberry32(graine ^ 0x2F6E2B1)` (à part, pour que `jeu.rnd` reste le même chez l'hôte et la façade). **[branché]** (livraison 3) : les six zones, 'centre' telle quelle (`zones.arene`, `apparitions`, `armes`) ; détail et mesures dans « Livraison 3 » plus bas.

### Instantané v2 (§ 9.3) — **[branché]** dans jeu.js (livraison 2)

Ligne `[id, x, y, z, yaw, pitch, vie, armure, drapeaux, arme, kills, morts, points]` (`arme` : l'arme en main, indice dans `ARMES_ID`), plus pour les humains `[p, s, mP, rP, mS, rS, recharge restante, ack]` (p, s : les armes des deux emplacements, indices dans `ARMES_ID` ; p peut être une arme ramassée ; mP / rP, mS / rS : munitions et réserves). Drapeaux : 1 vivant, 2 au sol, 4 accroupi (posture ≠ debout), 8 invincible, 16 en recharge, 32 couché (posture visée), 64 glissade, 128 course, 256 vise ≥ 0,5, 512 en transition, 1024 lampe. `lireLigne` (« corps ») relit la posture visée (couché, glissade, accroupi, debout : `posture = vers`, œil et capsule de la table, sans transition : le rendu lisse), `course`, `vise` (0 | 1), `enTransition`, `lampe`, l'arme en main et `slot` ; (« état ») les deux emplacements, munitions et réserves. Comme `ARMES_ID` repart à zéro, `PRESEAU` passe en VERSION 2 (« Mets le jeu à jour : recharge la page ») : **à faire par l'intégrateur** (reseau.js, enligne.js).

### Récapitulatif (§ 13)

| élément | changement |
|---|---|
| Nouveaux modules purs | corps.js → PCORPS ; armes.js → PARMES ; zones.js → PZONES **[branché]** |
| Ordre de build.js | … regles, carte-provisoire, monde, nav, **corps, armes, zones**, bots, jeu, arene, avatars, … ui **[branché]** |
| PJEU.creer | options = réglages normalisés ; paramètre zone **[branché]** (livraison 3) |
| Entités | ajouterJoueur({ …, equip }) ; entité v2 **[branché]** (livraison 2 : tout le monde équipé, corps v2) |
| PJEU.deplacer | alias de PCORPS.deplacer **[branché]** |
| PJEU.pasFixe | boucle à pas fixe **[branché]** |
| Instantané | ligneDe / lireLigne v2 **[branché]** (jeu.js ; VERSION 2 du réseau : intégrateur) |
| Nouveaux champs du jeu | jeu.peutBlesser, jeu.vieMax, jeu.armureMax, jeu.zone, jeu.reglages, jeu.manche, jeu.visibilite **[branché]** (livraison 3) ; jeu.dt, jeu.rembobiner / restaurer / blesser / faireBruit **[branché]** |
| Façade en ligne | jeu.avantImage(maintenant) **[branché]** |
| Mode | crochet apresNav, drapeau zones **[branché]** (livraison 3) |
| Rendu | PRENDU.image(jeu, id, dt, t, alpha), PRENDU.reglages({ balancement }), PCORPS.camera **[branché]** ; PRENDU.ambiance({ heure, meteo }) ; PRENDU.stats.ambiance **[lot 2/2]** |
| Monde | monde.hauteur suit les tabliers de pont ; monde.relief, monde.chaussee, monde.tabliers **[branché]** ; monde.limite v2 et PMONDE.limiteDe **[branché]** (livraison 3) |
| Commandes | PCONTROLES.lire() (cumul), consommer(), enAttente() → { dyaw, dpitch }, attenuer(k) **[branché]** ; niveaux v2 (course, couche, vise, emplacement, changer) dans le même cumul **[lot 2/2]** |
| HUD | PHUD.maj lit l'entité v2 **[lot 2/2]** |
| Réseau | PRESEAU VERSION 2 ; salon limité à 6 ; budget de relais **[lot 2/2]** |
| En ligne | 'reglages', 'lancer', 'entree', 'etat' en v2 **[lot 2/2]** |

Les anciens champs (`accroupi`, `JOUEUR.oeil`, `oeilAccroupi`, `taille`, `tailleAccroupi`, `vitesseAccroupi`, l'entrée `arme: id`) restent lisibles pendant tout le lot.

**Notes** : `A.dispersionAvantVisee` a disparu avec les blasters (livraison 2) : le HUD lit `PJEU.dispersion(moi, A)`. `enligne.js` lit `PREGLES.arme(id).gonfle`.

## Livraison 2 « Vraies armes, corps et visée » : l'arsenal et les impacts

**Le régime.** Dans le jeu, tout le monde est en régime v2 : `ajouterJoueur` pose `e.equip = PREGLES.equipementDe(d.equip, options)` (défaut : l'équipement par défaut permis) et `placer` équipe (`PARMES.equiper`) ; `jeu.etape` joue chaque entrée en v2 (une entrée sans `course` / `couche` / `vise` les reçoit à `false`, copiée dans un objet réutilisé). `PJEU.creer({ options })` lit `armes` (permises par l'hôte, normalisées par `PREGLES.armesPermises` ; défaut : les 9) et `objets` (faux : aucun objet au sol).

**L'arsenal** (`PREGLES.ARMES`, ordre du réseau = `ARMES_ID`, reparti à zéro) ; temps pour éliminer 100 PV au corps, sans armure, à portée utile, mesurés par les duels de `test/poncin-armes.test.js` :

| id | nom | classe | rôle | dégâts × balles | cadence (/s) | chargeur / réserve | viseur, zoom | temps pour éliminer |
|---|---|---|---|---|---|---|---|---|
| ak74 | AK-74 | fusil | principale | 24 × 5 | 8,5 | 30 / 120 | point 1,5× | 0,48 s à 20 m |
| m4 | M4 | fusil | principale | 22 × 5 | 8,8 | 30 / 120 | point 1,5× | 0,47 s à 20 m |
| ump | UMP | mitraillette | principale | 22 × 5 | 10 | 25 / 125 | point 1,45× | 0,42 s à 8 m (0,62 s à 25 m) |
| mp9 | MP9 | mitraillette | principale | 15 × 7 | 15 | 30 / 120 | point 1,4× | 0,42 s à 8 m (0,82 s à 25 m) |
| pompe | Fusil à pompe | pompe | principale | 9 plombs × 15 | 1,2 | 6 / 30 | fer 1,25× | un coup jusqu'à 8 m, jamais à 12 m |
| m24 | M24 | sniper | principale | 75 (tête × 2) | 0,8 | 5 / 25 | lunette 4× | un coup à la tête, deux au corps (1,27 s) |
| awm | AWM | sniper | principale | 90 (tête × 2) | 0,75 | 5 / 20 | lunette 4× | un coup à la tête, deux au corps (1,35 s) |
| m1911 | M1911 | pistolet | secondaire | 30 × 4 | 3,3 | 7 / 35 | fer 1,25× | 0,92 s |
| p226 | P226 | pistolet | secondaire | 22 × 5 | 4,5 | 15 / 45 | fer 1,25× | 0,9 s |

Les autres chiffres (recharge, dispersions, chute, recul, vitesse, changement, gonfle, mise en joue) sont dans `regles.js`, source de vérité. `PREGLES.CLASSES` donne les libellés des classes (HUD, menus) ; `A.couleur` une couleur de pastille par classe ; `A.modele` = `A.id` (`poncin/armes/<id>.glb`). La visée au fusil de précision : 0,06 rad à la hanche (inutile), × 0,02 lunette posée (stabilisée en 0,35 s d'immobilité, deux fois plus vite couché).

**Objets au sol** (`PARENE.objets`, `OBJETS`) : les armes de `carte.zones.armes` deviennent de vraies armes permises (`'precision'`, l'ancien nom des cartes, devient un fusil de précision permis ; une arme non permise, une arme permise de sa classe, sinon une principale permise), soin et armure comme avant, plus une caisse de munitions (`'munitions'` : les deux réserves pleines, 15 s) pour deux armes au sol (deux au moins), à 12 m au moins des autres objets. Une arme ramassée remplace la principale jusqu'à la mort ; une arme non permise ne se ramasse pas. L'événement `ramasse` porte l'id réel (`objet: 'awm'`).

**Événements de tir pour les impacts** (`PARMES.tirer` et `PARMES.tirVisuel`, un événement par plomb) :
```js
{ t: 'tir', id, arme /* id de l'arme : classe, son, traceur, douille */, o: [x, y, z] /* l'œil du tireur */, fin: [x, y, z] /* le bout du rayon */,
  impact: null /* dans le vide, à la portée */ | {
    x, y, z,          // le point d'impact (m)
    nx, ny, nz,       // la normale de la surface touchée, unitaire, tournée vers le tireur (corps : depuis l'axe de la capsule)
    quoi: 'mur' | 'toit' | 'sol' | 'entite',      // (compatibilité)
    mat: 'mur' | 'metal' | 'sol' | 'corps',       // la matière, pour l'effet : éclats et poussière, étincelles, poussière de terre, marqueur (jamais de sang)
    id                // l'entité touchée (mat 'corps' seulement)
  }, local? /* tirVisuel : le tir montré tout de suite par le client */ }
{ t: 'touche', de, a, degats, tete, mort, arme }  // le marqueur de touche du tireur, le flash rouge de la victime
```
La matière (`PARMES.matiere(h, monde)` sur le résultat de `monde.rayon`) : terrain et chaussée → `'sol'` ; toit de zinc (`batiments[i].toit === 'zinc'`), clôture et portail (`carte.murs[k].t`), banc, croix, abribus et petit mobilier → `'metal'` ; murs de bâtiments, voûtes, murs de pierre, troncs, fontaine et monument → `'mur'` ; une entité → `'corps'`. `monde.carte` (la carte d'origine, nouvelle dans monde.js) donne `murs` et `mobilier`. **À faire par l'intégrateur** : `enligne.js` (sérialisation de `evts`, `case 'tir'`) doit recopier `impact.mat` (aujourd'hui il ne garde que x, y, z, nx, ny, nz, quoi, id) ; le rendu peut retomber sur `quoi` quand `mat` manque.

## Livraison 3 « Le salon » : zones et règles de partie (groupe B)

Le jeu reçoit les réglages du salon (§ 6 de la conception) et les applique tous ; la partie se joue dans l'une des six zones de la carte (§ 7, décision du joueur : « rivières » = le Veyron dans le bourg et ses deux ponts). Fichiers : `regles.js`, `monde.js`, `nav.js`, `zones.js`, `jeu.js`, `arene.js`, `bots.js` (et deux lignes d'`armes.js` : le tir allié). Tests : `poncin-zones`, `poncin-salon` (parties simulées), `poncin-jeu`, `poncin-bots` (nouveau).

### `PJEU.creer` : les réglages, la zone, les robots

```js
const jeu = PJEU.creer({ monde, carte, mode: PARENE, graine,
  options,            // les réglages (PREGLES.normaliserReglages) : normalisés encore ici (idempotent)
  humains?,           // le nombre d'humains (0 par défaut) : robots ≤ 6 − humains
  zone?,              // une zone reçue ('lancer' : PZONES.pourReseau(jeu.zone) de l'hôte) ; sinon préparée ici depuis options.zone et la graine
  robots?,            // [{ id, nom, couleur, equipe, equip: 'p+s' | { p, s }, niveau }] : les robots listés par l'hôte (jeu.arene.robots), ajoutés tels quels
  nav? });            // false : pas de navigation pour les robots (la zone, elle, la construit quand même : même zone partout)
```
Ordre : réglages → zone (avant `mode.init`, si `mode.zones` : PARENE) → `mode.init` (apparitions et objets de la zone, robots) → navigation (en cache sur le monde : celle de la zone) → `mode.apresNav(jeu)`.

| champ | sens |
|---|---|
| `jeu.reglages` (=== `jeu.options`) | les réglages normalisés `{ v: 2, mode, zone, duree, score, heure, meteo, equipes, bots, niveau, tirAllie, vie, reapparition, manches, objets, aide, armes }` ; `bots` = le nombre de robots listés quand `robots` est donné |
| `jeu.zone` | `{ id, demande, nom, limite, englobant: { centre, rayon }, apparitions: [[x, z], …], objets: [[x, z, objet], …], aire (m² joignables), joueurs: [min, max], avertissement? }` (null sans mode à zones) ; `monde.limite === jeu.zone.limite` |
| `jeu.vieMax`, `jeu.armureMax` | `SALON.vies[vie]` : normale 100 / 50, unCoup 1 / 0, costaud 200 / 100 ; apparition à `vieMax`, soin et armure bornés ; en « un coup », ni soin ni armure au sol |
| `jeu.peutBlesser(a, b)` | `a ≠ b` et (équipes différentes ou `tirAllie`) : `PARMES.tirer` ne touche que là (sans tir allié, les balles traversent un équipier) ; repeindre un équipier : −100 points, pas de repeint, `{ t: 'mort', …, allie: true }` |
| `jeu.ennemis(a, b)` | inchangé (équipes différentes) : ce que visent l'aide à la visée et les robots |
| `jeu.aideVisee(id, force)` | `+ permise` (= `reglages.aide`) ; faux : ni ralenti ni aimant (`dyaw = dpitch = ralentir = 0`), `surCible` reste pour le viseur rouge (le tir auto : `ui.js` ne l'arme pas) |
| `jeu.duree`, `jeu.reste`, `jeu.debutChrono` | `duree` = `reglages.duree` (0 : sans limite, `reste` undefined, `instantane().r = −1`) ; `reste = duree − (temps − debutChrono)` (le chrono d'une manche) |
| `jeu.arene.victoire`, `.reapparition`, `.distance`, `.dernier`, `.robots` | score à atteindre ; délai de réapparition (3 / 6 / 10 s ; −1 : dernier debout) ; distance idéale de réapparition `clamp(0,32 · rayon englobant, 15, 60)` ; « dernier debout » ; la liste des robots pour 'lancer' |
| `jeu.manche` | « dernier debout » seulement (sinon null) : `{ n, total, enLice: [ids des vivants], gagnees: { camp: n }, debut, fin: null \| t, vainqueur: camp \| null }` ; camp = l'id (chacun pour soi) ou l'équipe 0 / 1 |
| `jeu.treve` | vrai entre deux manches (4 s) : personne n'est blessé |
| `e.score.manches` | les manches gagnées (le score de la partie en dernier debout ; chaque membre du camp vainqueur) ; `jeu.classement()` et `resume()` trient d'abord par elles (0 hors dernier debout : rien ne change) |
| `jeu.visibilite`, `jeu.visibiliteLampe`, `jeu.lampes` | la vue des robots (m) d'après heure et météo : nuit 25, brouillard 30, sinon `Infinity` ; une cible dont la lampe éclaire le robot à ±35° : 45 m la nuit (30 dans le brouillard) ; `lampes` (la nuit) : `e.lampe` vrai pour tous (drapeau 1024 de l'instantané) |

**Événements nouveaux** (« dernier debout ») :
```js
{ t: 'manche', quoi: 'debut', n, total }                                       // au premier pas de chaque manche (+ une annonce « Manche 2/3 : dernier debout ! »)
{ t: 'manche', quoi: 'fin', n, total, vainqueur /* camp | null */, nom, equipes, gagnees: { camp: n } }   // + annonce « Boulon gagne la manche 1 ! »
{ t: 'elimine', id, par, enLice /* vivants restants */ }                        // « Encore en lice : N » (+ « Duel final ! » à deux)
```
Règles : une manche finit quand il ne reste qu'un camp en lice (après 5 s de jeu ; il faut au moins deux camps dans la partie), ou au bout de la durée (le camp qui a le plus de joueurs en lice, puis le plus de vie + armure ; à égalité, nul) ; trêve de 4 s ; puis tout le monde réapparaît (événements 'reapparition'), objets remis, chrono reparti. La partie finit 2 s après la dernière manche, ou dès que le premier ne peut plus être rattrapé (3 manches : premier à 2) ; `PARENE.resultat(jeu)` : `gagnant` au plus de manches (à égalité : null), `scores` (équipes) = manches gagnées, `manches: { total, jouees, gagnees }`. Le score de repeints ne finit pas une partie en dernier debout ; les points (élimination, tête, séries) départagent.

### `PMONDE.limiteDe(def)` et `monde.limite` v2

```js
def = { forme: 'cercle', centre: [x, z], rayon } | { forme: 'cercles', cercles: [[x, z, r], …] /* leur union */ } | { forme: 'poly', p: [[x, z], …] } | { forme: 'carre', centre: [x, z], cote }
PMONDE.limiteDe(def) → { v: 2, forme, def /* JSON : ce qui voyage */, centre, rayon /* cercle englobant */, boite: [x0, z0, x1, z1],
  aretes: Float64Array [ax, az, bx, bz, …] /* le bord, ≤ 1500 : la clôture du rendu, la minicarte */, n, aire /* m², masque */, cercles?,
  dedans(x, z), distance(x, z) /* au bord, > 0 dedans */, pres(x, z, r), touche(ax, az, bx, bz, r), rassembler(x0, z0, x1, z1) → nombre (dans cand) } | null
PMONDE.limiteV2(l) → bool   // une limite lue par ses arêtes (toutes les formes sauf 'cercle')
```
- Cercles : cordes de 3 m, coupées là où un autre cercle les recouvre ; arêtes rangées dans une grille à part (8 m, inscrites à 2 m près) ; `dedans` lit un masque de 4 m (plein, vide, ou mêlé : vrai test).
- `monde.limite` : `{ centre, rayon }` (et la forme 'cercle' de limiteDe) gardent le chemin rapide d'avant ; une limite v2 bloque `bloque` (dehors, ou plus près d'une arête que r), `deplacer` (les arêtes sont des murs fins ; parti dedans, on y reste), `passe` et la navigation (`nav.js` couvre sa boîte ; cases libres : dedans à plus de la marge des arêtes), **jamais les tirs ni les vues** ; `monde.libre` tire dans sa boîte.
- Le HUD lit `limite.distance(x, z)` (« Limite de la zone » à moins de 3 m) ; le rendu et la minicarte dessinent `limite.aretes` (pour 'centre', un cercle de 231 arêtes).

### Les six zones (`PZONES.preparer`) — mesures sur la vraie carte (Node, graine 1)

| id | nom | limite | aire joignable | apparitions (espacement) | objets | calcul (navigation comprise) |
|---|---|---|---|---|---|---|
| place | Place Bichat | cercle 55 m autour de `zones.arene.centre` | 0,37 ha | 25 (14 m) | 4 | ≈ 15–45 ms |
| centre | Cœur du village (défaut) | `zones.arene` (99 ; 1,5), r 110 : apparitions et objets de la carte, tels quels | 1,92 ha | 20 (carte) | 8 (carte) + caisses | ≈ 20–60 ms |
| eglise | Autour de l'église | cercle 70 m autour de « Église Saint-Martin » (`carte.noms`) | 0,84 ha | 30 (18 m) | 4 | ≈ 10–20 ms |
| bourg | Tout le bourg | cercle 190 m centré entre la place et le barycentre des bâtiments à moins de 200 m d'elle (114 ; 6) | 7,54 ha | 180 (18 m, au plus 180) | 16 | ≈ 45–80 ms |
| rivieres | Le Veyron | 26 cercles de 45 m tous les 30 m sur les berges du Veyron, entre ses deux ponts (74 ; 162) et (346 ; 199), 35 m au-delà ; 357 arêtes | 2,66 ha | 77 (18 m), sur les deux rives | 11 | ≈ 50–65 ms |
| tout | Tout Poncin | le carré, marge de 8 m (`carre`, 4 arêtes) | 44,9 ha | 180 (18 m) | 16 | ≈ 230–250 ms |

Apparitions : `monde.libre(rnd)` dans la zone, joignables (`nav.accessible`), à 1 m des murs et de la limite, espacées de 18 m (14 m pour 'place') jusqu'à 400 échecs de suite, 12 au moins (l'espacement se resserre s'il le faut), 180 au plus. Objets : `clamp(arrondi(aire joignable / 2500 m²), 4, 16)`, à 8 m des apparitions et 12 m l'un de l'autre (moins s'il le faut), soin, armure, munitions puis une principale permise, à tour de rôle. Sans rivière ni pont (carte provisoire sans nom, vieille carte), une zone impossible retombe sur 'centre' avec `avertissement`.

**Réseau** : `PZONES.pourReseau(jeu.zone)` → `{ id, nom, limite: def, englobant, apparitions, objets, aire }` (JSON, ≈ 2 à 4 Ko ; 'tout' et 'bourg' : 180 apparitions) ; chez les autres, `PJEU.creer({ zone: celle-là, robots: jeu.arene.robots, … })` (ou `PZONES.adopter(z, monde)`). Sans `zone`, la façade prépare la même zone depuis la graine (même résultat, navigation construite : jusqu'à ≈ 0,3 s pour 'tout').

### Pour l'intégrateur (enligne.js, reseau.js)
- `PJEU.creer` chez l'hôte : `options` = réglages normalisés avec le nombre d'humains, et `humains: L.joueurs.length` (sinon le jeu borne les robots à 6 seulement).
- 'lancer' : `zone: PZONES.pourReseau(jeu.zone)` et `robots: jeu.arene.robots` (après création chez l'hôte) ; la façade : `PJEU.creer({ …, zone, robots, nav: false })`.
- `evts` : relayer aussi 'manche', 'elimine' et `allie` de 'mort' ; chez le client, `jeu.manche` (n, total, enLice, gagnees, fin, vainqueur), `jeu.treve`, `jeu.debutChrono` et `e.score.manches` sont à tenir à jour d'après ces événements (la façade ne simule pas le mode) ; `instantane().r` est déjà le reste de la manche.
- `PJEU.tirVisuel` (le tir montré tout de suite par le client) traverse encore les équipiers : avec le tir allié, la traînée locale peut passer à travers un équipier que l'hôte, lui, touche.

## Extraction (groupe X1 : la simulation)

Le mode Extraction : 8 min (5 / 8 / 12) dans une zone (défaut 'bourg' ; conseillées 'bourg' et 'tout'), des coffres à ouvrir, des robots gardiens, deux points d'extraction (le pont, la cale de la rivière) qui s'ouvrent à mi-partie ; ce qui sort va au coffre personnel. Fichiers : `regles.js` (MODES.extraction, SALON.modes, normalisation), `zones.js` (coffres, extractions, départ, lieux, largage), `butin.js` (**nouveau**, `PBUTIN`), `extraction.js` (**nouveau**, `PEXTRACTION`), `jeu.js` (crochets de mode), `bots.js` (gardiens), deux lignes de `corps.js` (`e.ralenti`) et d'`armes.js` (le silencieux), `build.js` (… `zones`, `butin`, `bots`, `jeu`, `arene`, `extraction` …). Tests : `poncin-butin`, `poncin-extraction` (vraie carte, ~1,5 s ; dont une partie simulée complète). **L'Arène n'en a rien** : sans `mode.nouveau` / `place` / `agir` / `trier`, PJEU joue comme avant (ses tests restent verts).

### Réglages (`PREGLES`)
```js
SALON.modes = ['arene', 'extraction']
MODES.extraction = { duree: 480, durees: [300, 480, 720], zone: 'bourg', zones: ['bourg', 'tout'], humains: [1, 3], invincible: 1.5,
  coffres: { aire: 2500, min: 20, max: 40, ecart: 10 }, ouverture: { duree: 1.2, distance: 1.8, bouge: 0.6 }, ramasser: { duree: 0.5, distance: 1.6 },
  extraction: { duree: 8, rayon: 10, ouvre: 0.5 }, relever: { duree: 4, distance: 2, delai: 30, vie: 0.3 },
  gardiens: { facile | normal | fort: { legendaire, epique, rare, patrouilles, max }, parHumain: 2, plafond: 24 },
  formats: ['ensemble', 'equipes', 'chacun'], nEquipes: [2, 3], largage: { decalage: 30, gardes: 2, arrivee: 20, legendaire: 0.4 }, coffreFort: { duree: 4 },
  boss: { vie: 6, armure: 1, ralenti: 0.3, renforts: 0.5, nRenforts: { facile: 1, normal: 2, fort: 3 }, points: 100 },
  poids: { seuil: 4, parCase: 0.025, max: 0.2 }, bruits: { ouvrir: 18, coffreFort: 30, tirSilencieux: 8, tir: 30 },
  prime: { periode: 30, premier: 60, seuil: 150, part: 0.25, min: 25, max: 250 } }
normaliserReglages : + formatExtraction ('ensemble' | 'equipes' | 'chacun', défaut 'ensemble'), equipesExtraction (2 | 3) ; en extraction :
  zone par défaut 'bourg', duree ∈ durees (défaut 480, jamais 0), equipes = (format ≠ 'chacun') ; l'Arène inchangée.
```

### La zone (`PZONES.preparer(…, reglages)` avec `reglages.mode === 'extraction'`)
La même zone que l'Arène (même graine, même hasard), puis `PZONES.extraction(carte, monde, nav, zone, rnd, reglages)` ajoute (un générateur tiré du premier `rnd()`) :
- `zone.extractions = [{ id: 'pont' | 'cale' | 'sortieN', nom, x, z, rayon: 10 }]` : **le pont** = le milieu d'un pont de `carte.ponts` dans la zone, joignable (le plus près du centre) ; **la cale de la rivière** = un point de berge d'une `carte.eau` 'riviere' (2,5 à 6 m hors de l'eau, joignable) à clamp(0,6 · rayon englobant, 80, 220) m du pont au mieux (≥ 60 m). Repli (zone sans pont ni rivière, 'centre', 'place') : les apparitions les plus éloignées du départ, nommées « Sortie » + la rue nommée la plus proche (sinon le côté). Mesures (graine 1) : 'bourg' pont (74,3 ; 162,1), cale (188,6 ; 179,5) à 117 m, départ (150 ; −176) ; 'tout' pont et cale (−135 ; 228) ; 'rivieres' le pont de l'est et la cale ; 'centre' « Sortie Rue du 11 Novembre 1918 », « Sortie Place de Verdun ».
- `zone.depart = [x, z]` : l'apparition la plus éloignée des deux sorties (sans elles : la plus proche du centre).
- `zone.coffres = [[x, z, rarete, special?], …]` : n = clamp(arrondi(aire joignable / 2 500 m²), 20, 40) ('bourg' 30, 'tout' 40, 'centre' 20), joignables, à 10 m l'un de l'autre, 20 m du départ, hors des cercles (+5 m), de préférence contre un mur ; 7 % légendaires (≥ 1), 15 % épiques, 28 % rares, les plus rares le plus loin du départ. `special` : `'coffre-fort'` (verrouillé), `'cle'` (la clé, dans un rare ou mieux à ≥ 60 m du coffre-fort).
- `zone.lieux = [{ id: 'coffre-fort', nom, x, z, lieu }, { id: 'gardien', nom: 'Le Gardien', x, z, lieu: null }]` : **un emplacement propre pour les « lieux »** (aucun intérieur supposé ; le lot des intérieurs pourra y brancher mairie, église, tabac, banque) : le coffre-fort devant l'hôtel de ville (`carte.noms`, sinon `carte.enseignes` 'mairie'), sinon la banque, la poste ; repli : le légendaire le plus loin du départ (« Coffre verrouillé »).
- `zone.largage = [x, z] | null` : un point dégagé, ≥ 50 m du départ, 30 m des sorties, 10 m des coffres.
- `pourReseau` / `adopter` portent `coffres`, `extractions`, `depart`, `lieux`, `largage` (bourg ≈ 4,5 Ko).

### `PJEU` : les crochets de mode (facultatifs) et ce qui change
`mode.nouveau(jeu, e, d)` (dans `ajouterJoueur`, avant la première apparition ; `d` = les données passées : `ameliorations`, `garde`, `boss`, `equipe`), `mode.place(jeu, e)` (fin de chaque `placer`), `mode.agir(jeu, e, en, dt, evs)` (après l'entrée de chaque humain vivant), `mode.trier(a, b)` (le classement). `jeu.humains` (params.humains), `jeu.maintenant` (`params.maintenant` : l'heure réelle en ms, pour la zone de la semaine), un objet du mode `unique` ne revient pas, robots listés jusqu'à `gardiens.plafond`, instantané : drapeaux 2048 (à terre), 4096 (extrait). `PCORPS.vitesseMax` × (1 − `e.ralenti`) (≤ 0,5) ; `PARMES.tirer` : bruit 8 m au lieu de 30 si `e.silencieux === e.arme`.

### `PEXTRACTION` (extraction.js) : un mode comme PARENE
```js
{ id: 'extraction', nom: 'Extraction', zones: true, init, nouveau, place, apparition, agir, tick, surMort, objets, fini, resultat, trier,
  etat(jeu), lireEtat(jeu, etat), plusProche(jeu, x, z) → { point, d }, signauxPour(jeu, id), bilan(e, A), renforts(…), COULEUR_GARDIENS, COULEUR_BOSS, SIGNAUX }
const jeu = PJEU.creer({ monde, carte, mode: PEXTRACTION, graine, humains, maintenant: Date.now(), options: { mode: 'extraction', … } });
jeu.ajouterJoueur({ id, nom, couleur, equip, equipe?, ameliorations: coffre.ameliorations });
```
**`jeu.extraction`** : `{ zone, coffres: [{ id: 'c0'…, x, y, z, rarete, special, verrou, contenu, ouvert, par, ouvertA }], extractions: [{ id, nom, x, y, z, rayon }], format, nEquipes, depart, departs, lieux, ouvreA, ouvertes, largage: { x, z, A, annonce, tombe, coffre } | null, sacs: [{ id: 's0'…, x, y, z, objets, de, dispo, cle }], objets (mode.objets : consommables et armes posés, unique, rarete), signaux: [{ id, de, equipe, type, x, y, z, jusqua }], prime: { prochainA, id, valeur, montant }, zoneSemaine, robots, boss, termine, finA }` ; `jeu.arene = { robots }` (enligne.js).

**Entité** (humain) : `sac: { cases, objets: [ids] }`, `ameliorations`, `dureeOuverture`, `interaction: { quoi: 'coffre' | 'sac' | 'relever', cible, t, prog (0..1), duree } | null` (la jauge), `sortie` (s passées dans le cercle), `sortiePoint`, `aTerre`, `aTerreJusqua`, `extrait`, `elimine`, `perdu`, `cle`, `silencieux` (id d'arme | null), `ralenti`, `lampe`, `armeTrouvee: { arme, rarete } | null`, `rang`, `butin: { coffres, coffresPar, extrait, materiel, perdu, materielPerdu, point, valeurExtraite, valeurPerdue, killsRobots, killsJoueurs, boss, primes }`. Robot : `equipe: 'gardiens'`, `garde: { x, z, cx, cz, laisse, ronde: [[x, z], …] | null, depart, arrivee? }`, le Gardien `boss: { nom, vieMax, renforts }` (la barre de vie : `e.vie / e.boss.vieMax`).

**Entrées en plus** (des fronts, dans l'entrée v2) : `lacher: i` (l'objet i du sac au sol), `utiliser: i` (un consommable du sac), `lampe: true` (allumer / éteindre, la nuit), `signal: { type: 'coffre' | 'ennemi' | 'sortie' | 'ici', x, y, z }`. Ouvrir, ramasser, relever : **sans bouton**, en restant immobile (< 0,6 m/s) à côté (1,8 m / 1,6 m / 2 m) ; priorité relever > coffre > sac.

**Règles** : départ ensemble (petit cercle autour de `zone.depart` ; un départ par équipe en 'equipes', par joueur en 'chacun', ≥ 40–60 m l'un de l'autre). Camps : 'ensemble' 0, 'equipes' 0..n−1 (la moins nombreuse, ou `d.equipe`), 'chacun' l'id ; tir allié = `tirAllie` dans un camp. Ouvrir : 1,2 s (amélioration jusqu'à 0,7 s), coupé si l'on bouge ou si l'on est touché, bruit 18 m toutes les 0,5 s (coffre-fort : 4 s, 30 m, il faut `e.cle` ; sinon événement 'verrou'). Contenu : objets de valeur → sac (sinon un sac au sol à côté) ; soin / armure / munitions → appliqués s'ils servent, sinon rangés dans le sac (1 case), sinon posés ; arme → posée à 1,5 m du côté opposé (avec sa rareté ; ramassée au passage par PJEU, elle devient `armeTrouvee`) ; silencieux → fixé à l'arme en main (pas la pompe) ; clé → `e.cle`. Poids : au-delà de 4 cases, −2,5 %/case, −20 % au plus. Extractions à `duree × 0,5` : 8 s dans le cercle (10 m) sans être touché (touché : remis à zéro ; plusieurs joueurs peuvent y être). Largage à ouverture + 30 s (annoncé 15 s avant) : un coffre `id: 'largage'` épique (60 %) ou légendaire ajouté à `coffres` ; 2 gardiens arrivent 20 s après. Le Gardien (près du coffre-fort) : vie × 6, armure pleine, −30 % de vitesse, niveau fort, AK-74 ; renforts (1 / 2 / 3) à 50 %. Mort : le sac (et la clé) tombe au sol (`de` = l'ancien propriétaire ; n'importe qui le ramasse) ; avec un équipier en jeu : à terre 30 s (relevé en 4 s à côté, 30 % de vie), sinon éliminé. Fin : le temps (ceux qui ne sont pas sortis perdent ce qu'ils portent) ou plus aucun humain en jeu (+2 s). Prime ('equipes', 'chacun') : toutes les 30 s dès 60 s, le plus riche (≥ 150 pièces portées) révélé ; l'éliminer : 25 % de ce qu'il porte (25 à 250) au tueur, versés s'il sort. Points : gardien 10, Gardien 100, joueur 25 ; score = valeur extraite + points + primes versées.

**Gardiens** (`gardiens()`, ou `jeu.robots` listés par l'hôte, tels quels) : le Gardien, puis par légendaire / épique / rare autant que `gardiens[niveau]` (postes à 3–7 m, laisse 40 / 35 / 30 m), des patrouilles à deux sur une ronde de 4 coffres voisins (laisse 70 m), plafond `max + 2 × (humains − 1)` (≤ 24) ; 'bourg' normal : 15 robots. `PBOTS` : hors combat, le gardien tient son poste (y revient, guette en balayant le côté opposé à ce qu'il garde) ou marche sa ronde (pause à chaque point) ; ni « flair » ni objets ; chasse jusqu'à sa laisse puis retourne ; en combat, n'avance plus au-delà de laisse + 10 m. Ils entendent tirs (30 m, 8 au silencieux), pas (10 / 16 m), ouvertures (18 / 30 m).

**Événements** (en plus de ceux de PJEU) :
```js
{ t: 'ouverture', id, quoi: 'coffre' | 'sac' | 'relever' | 'extraction', cible, duree, etat: 'debut' | 'coupe' | 'fin' }
{ t: 'coffre', id, par, rarete, special, x, z, contenu: [...] }      { t: 'verrou', id, coffre }      { t: 'cle', id, quoi: 'trouvee' | 'utilisee', coffre? | sac? }
{ t: 'butin', id, quoi: 'valeur' | 'soin' | 'armure' | 'munitions' | 'silencieux', objet, valeur?, coffre? | sac?, de?, utilise? }      { t: 'plein', id, objet }
{ t: 'sac', quoi: 'pose' | 'pris' | 'vide', sac, x?, z?, objets, de, par?, pris?, cle }
{ t: 'extractions', quoi: 'ouvertes', points: [{ id, nom, x, z, rayon }] }
{ t: 'largage', quoi: 'annonce', x, z, dans } | { t: 'largage', quoi: 'tombe', id: 'largage', x, z, rarete }      { t: 'renforts', quoi: 'largage' | 'boss', robots: [entrées de robots] }
{ t: 'extrait', id, point, nom, valeur, objets, materiel, primes }      { t: 'perdu', id, raison: 'mort' | 'temps', valeur, objets, arme }
{ t: 'a-terre', id, par, jusqua }      { t: 'releve', id, par }      { t: 'elimine', id, par, enLice }
{ t: 'prime', quoi: 'revele', id, x, z, valeur, prime } | { t: 'prime', quoi: 'gagnee', id, cible, prime }
{ t: 'signal', id, de, equipe, type, x, y, z, duree: 12 }   (à n'afficher qu'aux joueurs du même `equipe`)      { t: 'lampe', id, allumee }      { t: 'annonce', texte }
```

**Résultat** (`resultat(jeu)`, aussi l'événement 'fin' par `jeu.resume()` trié par `trier`) : `{ classement, gagnant (id, ou l'équipe en 'equipes'), duree, equipes, scores, extraction: { format, zone, zoneSemaine, joueurs: [ligne], equipes: [{ equipe, membres, valeur, score }] | null, coffres: { total, ouverts }, valeurExtraite, points } }` ; **ligne** (par humain, pour `PBUTIN.deposer` / `progression` et le futur classement « Butin ») : `{ id, nom, couleur, equipe, format, zoneSemaine, extrait, point, objets, materiel, valeur, perdu, materielPerdu, valeurPerdue, porte, coffres, coffresPar, kills, killsRobots, killsJoueurs, boss, morts, primesGagnees, primes (versées), points, score }`.

**Réseau** (pour l'intégrateur) : 'lancer' : `zone: PZONES.pourReseau(jeu.zone)` (avec coffres, extractions, lieux, largage) et `robots: jeu.arene.robots` (avec `garde`, `boss`) ; la façade `PJEU.creer({ mode: PEXTRACTION, zone, robots, nav: false, options })` a les mêmes coffres (même contenu : un hasard à part, `mulberry32(graine ^ 0xC0FF3E)`, tiré dans l'ordre des coffres puis la caisse du largage) et les mêmes robots. L'hôte fait autorité : `PEXTRACTION.etat(jeu)` (≈ 0,5–1,5 Ko : coffres ouverts, extractions, largage, sacs au sol, par joueur sac / drapeaux / jauge / sortie / silencieux, prime, signaux) à envoyer à ~2–4 Hz ou à chaque événement du mode, `lireEtat(facade, etat)` chez le client ; relayer aussi les événements ci-dessus ('renforts' : la façade ajoute les robots par `jeu.ajouterJoueur(r)` avec `bot: true` — ou attend l'instantané) ; les objets posés (`mode.objets`) grandissent pendant la partie : l'instantané `o` les suit par indice ; les entrées en plus (`lacher`, `utiliser`, `lampe`, `signal`) à transmettre ; `ameliorations` de chaque joueur dans 'lancer' (joueurs), sinon le joueur part sans.

### `PBUTIN` (butin.js) : butin, sac, coffre personnel
Raretés (`RARETES`, `RARETE[r] = { nom, couleur: gris #A7AEB8 / bleu #4F8DFF / violet #A45CFF / or #FFC23D, rang }`), 16 objets de valeur aux noms du coin (`VALEURS[id] = { nom, rarete, valeur, cases }` : Cartes postales du vieux Poncin 10 … Le trésor de la mairie 500, 3 cases), consommables (`CONSOMMABLES` : soin, armure, munitions, 1 case, prix 10 / 15 / 8), `tirerContenu(rarete, rnd, { armes, special })` (valeurs ; arme : rare 25 %, épique 50 %, légendaire 100 %, de la rareté du coffre ; silencieux 15 / 30 / 40 % ; consommables), sac (`sacVide(cases)`, 8 cases, ≤ 16 ; `ajouter`, `retirer`, `place`, `tient`, `valeurSac`).

**Le coffre personnel — format de sauvegarde v2** (`poncin.v2` → champ `coffre` ; `PBUTIN.VERSION = 2`) :
```js
{ v: 2, pieces,                                   // les pièces
  objets: [{ id, n }],                            // objets de valeur gardés (non vendus)
  materiel: [{ ref: 'm12', type: 'arme' | 'armure' | 'soin' | 'munitions', arme?, rarete, n }],   // une arme par entrée (n = 1, avec sa rareté) ; consommables empilés
  collection: [{ id, n }],                        // tout ce qu'on a déjà trouvé (déposé)
  achats: { extraction: { sac, ouverture, armure, chargeur }, <catalogue>: { <id>: niveau } },  ameliorations,   // = achats.extraction (lu par l'Extraction)
  record, parties, extractions, perdus, suivant,  // record = meilleur score ; suivant = prochain numéro de ref
  contrats: { jour: 'AAAA-MM-JJ', etats: [{ prog, fait, reclame }] × 3 } | null }
```
`lireCoffre(o)` rend toujours un coffre v2 borné (un v1 `{ pieces, objets, ameliorations, record… }` est repris : ses `objets`, déjà vendus, vont à la collection ; un catalogue inconnu est gardé tel quel). Toutes les fonctions sont **pures** (elles rendent un coffre neuf) : `deposer(coffre, ligne, { vendre = true })` → `{ coffre, gain, record, score }` (objets de valeur vendus ou gardés, consommables et `materiel` rangés, primes versées si `extrait`, +25 % si `zoneSemaine`) ; pour les modes suivants (Défense, Raid) : `lister(coffre, filtre?)` → `[{ ref ('v:<id>' | 'm<n>'), type, id, arme?, rarete, n, nom, prix }]`, `prendre(coffre, [{ ref, n }])` → `{ ok, coffre, pris }` (tout ou rien), `rendre(coffre, articles)`, `perdre(coffre, articles)` (compté), `vendre(coffre, ref, n?)` → `{ ok, coffre, gain }` (arme 20 / 40 / 80 / 150 selon la rareté), `depenser(coffre, pieces, motif)`. **Catalogue** extensible : `CATALOGUE.extraction` (sac 150 / 400 / 900 → +2 / +4 / +6 cases ; ouverture 120 / 350 / 800 → 1,0 / 0,85 / 0,7 s ; armure de départ 200 / 500 / 1000 → 15 / 30 / 50 ; deuxième chargeur 250), `ajouterCatalogue('defense', { mur: { nom, texte, prix: [...], effet: [...] } })`, `niveau / prix / acheter(coffre, id, catalogue = 'extraction')` → `{ ok, coffre, prix, raison: null | 'inconnue' | 'max' | 'pieces' }`, `effets(ameliorations)` → `{ cases, ouverture, armure, chargeurs }` (jamais lu par l'Arène).

**Calendrier et contrats** (purs, heure de Paris par la règle européenne de l'heure d'été) : `jourDeParis(ms)` → 'AAAA-MM-JJ', `semaineDeParis(ms)` (change le lundi à 0 h), `zoneDeLaSemaine(ms)` → rotation de `ZONES_SEMAINE` ('bourg', 'rivieres', 'tout', 'centre') ; `BONUS_SEMAINE` 0,25. `contratsDuJour(ms | jour)` → 3 contrats de types différents tirés de `hash('contrats ' + jour)` : `ramener` (un objet rare / épique), `sortie` (le pont / la cale), `coffres` (N rares ou épiques, ou mieux), `robots` (N), `valeur` (sortir avec ≥ X pièces), `{ type, …, texte, but, recompense }` ; `progression(coffre, ligne, ms)` (cumulée sur la journée ; ramener / sortie / valeur : seulement en sortant) → `{ coffre, avances }` ; `reclamer(coffre, i, ms)` → `{ ok, coffre, gain }` (une fois).

### Pour l'interface (X2) et l'intégrateur
- Fin de partie : pour le joueur local, `l = resultat.extraction.joueurs.find(j => j.id === moi)` ; `c = PBUTIN.deposer(sauv.coffre, l).coffre` ; `c = PBUTIN.progression(c, l, Date.now()).coffre` ; sauvegarder `sauv.coffre = c` ; afficher `l.objets`, `l.materiel` (sorti), `l.perdu` (perdu), `l.primes`.
- Lancement : `ajouterJoueur({ …, ameliorations: sauv.coffre.ameliorations })` ; `PJEU.creer({ …, maintenant: Date.now() })`.
- HUD : `e.interaction.prog`, `e.sortie / 8`, `PEXTRACTION.plusProche(jeu, x, z)`, `jeu.extraction.extractions / ouvertes / coffres (rarete, ouvert, verrou) / sacs / largage / signaux`, `e.boss`, `e.cle`, `e.ralenti`.

## Classement du butin (`classement.js` → `PCLASSEMENT`, `supabase/poncin-butin.sql`)

Après chaque partie d'Extraction, le téléphone publie la **ligne** du joueur (`resultat.extraction.joueurs`, ci-dessus) ; le serveur range, entre amis : **cette semaine** (du lundi 0 h au dimanche, heure de Paris, à l'horloge du serveur) la somme des pièces (comptées **exactement comme `PBUTIN.deposer` compte le gain** : sorti, `(valeur + primes) × 1,25` dans la zone de la semaine, arrondi ; pas sorti, 0), les parties et les extractions réussies ; les **records** : le meilleur `score` d'une partie et le total des pièces depuis l'arrivée ; la pastille **en ligne** (vu il y a moins de 4 min), comme au Fournil. Module pur (UMD, après `butin.js` dans `build.js`) : sans `poncin/config.js` rempli, sans `window.supabase` ou sans réseau, rien ne part et le jeu marche comme avant.

```js
PCLASSEMENT.publier(ligne, { pseudo })  // ligne = resultat.extraction.joueurs[i] (lit extrait, valeur, primes, zoneSemaine, score) ; ligne null : rejoindre / changer de pseudo
  → { ok, erreur, pseudo, compte: { pieces, score, record } | null, semaine: { lundi, rang, joueurs, pieces, parties, extractions },
      records: { rang, joueurs, record, total, parties }, partiesJour }
PCLASSEMENT.lire('semaine' | 'records') → { ok, erreur, periode, semaine: 'AAAA-MM-JJ', joueurs, enLigneN,
      lignes: [{ rang, pseudo, pieces, parties, extractions, record, total, moi, enLigne }], moi: { rang, pieces, … } | null }
      // 'semaine' : rangé aux pièces de la semaine ; 'records' : au record, puis au total (pieces = total, parties et extractions depuis l'arrivée)
PCLASSEMENT.vu() → { ok, erreur, saute? }   // un signe de vie (au plus un par minute ; seulement si l'on a rejoint)
PCLASSEMENT.retirer() → { ok, erreur }       // la ligne effacée du serveur, l'identité oubliée
PCLASSEMENT.etat() → { rejoint, pseudo, disponible } ; .disponible() ; .creer(env) (un moteur à part : tests) ;
  outils purs : gainDe(ligne), argsDe(ligne), pseudoPour(brut), verifierPseudo(p), BORNES
```
Toutes les promesses **résolvent** (jamais de rejet) ; `erreur` : `null`, `'absent'` (pas de configuration ou de supabase-js), `'hors-ligne'`, `'lent'` (8 s), `'pas-installe'` (le SQL pas collé), `'erreur'`, `'ligne'`, `'periode'`, ou celle du serveur : `'jeton'`, `'pseudo_invalide'`, `'pseudo_pris'`, `'valeur'`, `'trop_vite'`, `'quota'`, `'complet'`, `'inconnu'` (`'trop_vite'` et `'quota'` redonnent `semaine` et `records`). **Le pseudo** : celui du jeu en ligne (`pseudoJoueur()` de `ui.js`) passé à `publier` ; `pseudoPour` le rend acceptable (2 à 16 caractères, mêmes règles que le Fournil ; trop long : le premier et le dernier mot, « Bouquetin Express 42 » → « Bouquetin 42 ») ; `'pseudo_pris'` : demander un autre pseudo. **L'identité** (un uuid et un jeton de 64 chiffres hexadécimaux ; le serveur n'en garde que l'empreinte sha256) vit dans `localStorage['poncin.classement']`, **pas** dans `poncin.v2` (ui.js réécrit la sauvegarde entière depuis sa copie en mémoire, et le jeton n'a pas à voyager avec elle).

**Serveur** (`supabase/poncin-butin.sql`, à coller dans le SQL Editor, recollable sans rien perdre, indépendant du Fournil) : tables `poncin_joueurs`, `poncin_portes` (sécurité ligne par ligne fermée, aucun droit direct) ; seules `poncin_publier(p_id, p_jeton, p_pseudo, p_valeur, p_primes, p_extrait, p_bonus, p_score)` (entiers et booléens, tous facultatifs sauf l'identité et le pseudo), `poncin_classement(p_periode, p_id, p_limite)`, `poncin_vu(p_id, p_jeton)`, `poncin_retirer(p_id, p_jeton)` sont ouvertes à `anon`. **Garde-fous** (le téléphone fait autorité, on borne ; `poncin_bornes()`, recalculées depuis `regles.js` et `butin.js` par le test) : valeur ≤ 3 040 (16 cases × 190, le Calice), primes ≤ 5 750 (23 révélations × 250 sur 12 min), score entre valeur + primes et 12 770 (+ 3 980 points : 29 robots dont le Gardien, une élimination de joueur toutes les 5 s), pas sorti → ni valeur ni primes, donc ≤ 10 988 pièces par partie ; une partie comptée toutes les 120 s par joueur (`'trop_vite'`), 60 par jour de Paris (`'quota'`) ; un pseudo seul toutes les 10 s ; inscriptions : 10 par heure et 20 par jour par source (`cf-connecting-ip`, IPv6 en /64), 60 par heure et 2 000 en tout ; ménage : 90 jours sans nouvelles, ou 7 jours sans aucune partie. Tests : `test/poncin-classement.test.js` (le module, faux supabase-js ; dans `poncin.test.js`) et `test/poncin-butin-sql.cjs` (PGlite, par-dessus le SQL du Fournil, workflow `classement.yml`).

**Pour l'intégrateur** (l'écran dans ui.js) : en fin d'Extraction, après `PBUTIN.deposer`, `PCLASSEMENT.publier(l, { pseudo: pseudoJoueur() })` sans attendre (le résultat sert à afficher « +N pièces au classement · 3e cette semaine ») ; l'écran du classement : deux onglets `lire('semaine')` / `lire('records')`, la pastille `enLigne`, `vu()` à l'ouverture puis toutes les 2 min tant qu'il est affiché ; « Quitter le classement » : `retirer()`.
