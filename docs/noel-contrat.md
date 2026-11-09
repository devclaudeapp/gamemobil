# Le Fournil — point 7 : « Noël » — le calendrier de l'Avent, la saison d'hiver et le Marché de Noël : contrat de conception

Choix du joueur du 9 novembre 2026. Branche `noel` (depuis origin/master 1db1e38). Ce contrat est la référence des constructeurs des **deux
livraisons** : le lire en entier avant de coder, avec `docs/marche-contrat.md` (le point 6, dont tout ceci reprend le moteur, et ses § 12
« écarts », qui disent ce qui a été appris). Rien n'est construit dans le jeu : seuls ce document, les outils de simulation (`outils/noel/`)
et le patch SQL (`supabase/fournil-classement-v70.sql`, essayé dans PGlite, pas encore recopié dans le fichier complet) sont commités.

**En une phrase.** Le mardi 1er décembre à 0 h (Paris) s'ouvrent ensemble le **calendrier de l'Avent** (24 cases, une par jour, une case
oubliée se rattrape, jusqu'au 31) et la **saison d'hiver** (une piste gratuite de 46 crans, jusqu'au 3 janvier) ; du vendredi 18 décembre à
midi au vendredi 25 décembre à 20 h, la boutique devient **« le Chalet »**, un marché de Noël chaleureux pour tous les âges (chocolat chaud,
bûches, pain d'épices, sapin, boules, neige), sur le moteur exact de la Halle et du Manoir.

| | Dates (heure de Paris) | À avoir en ligne avant |
|---|---|---|
| **Livraison 1** : l'Avent + la saison d'hiver | mise en ligne (master) **au plus tard le sam. 28 nov.** (CI ≈ 45 min) | — |
| Fin de la saison d'automne | lun. 30 nov. 23 h 59 59 (`fin` = 1er déc. 0 h) | |
| Le calendrier de l'Avent | cases du **mar. 1er déc. 0 h au jeu. 24 déc.** ; rattrapages jusqu'au **jeu. 31 déc. 23 h 59 59** ; rangé le 1er janv. 0 h | Livraison 1 |
| La saison d'hiver | **mar. 1er déc. 0 h → dim. 3 janv. 2027 23 h 59 59** (`fin` = 4 janv. 0 h) | Livraison 1 |
| **Livraison 2** : le Marché de Noël + SQL v7.0 | mise en ligne **au plus tard le mer. 16 déc.** | — |
| Patch SQL v7.0 collé par le joueur | **avant le ven. 18 déc. 12 h** | — |
| Le Marché de Noël | **ven. 18 déc. 12 h → ven. 25 déc. 20 h** (176 h, 8 jours de Paris) ; serveur : +1 h de grâce, podium figé à 21 h | Livraison 2 + SQL |
| Onglet « Noël » du classement | du 18 déc. 12 h au **ven. 8 janv. 2027 20 h** (fin + 14 j) | |

---

## 0. Les chiffres clés (simulés : `outils/noel/`)

- **L'Avent** : la règle « **Chaque jour, ouvre la case du jour. Tu en as oublié ? Tu peux en rattraper une par jour, jusqu'au 31 décembre.** »
  24 cases, **chacune une friandise** (un dessin pour la boîte à friandises) **et 10 XP de saison** ; en plus : **8 ★**, **3 petits boosts**
  (×2, ×2, ×3, 30 min), **5 décos de Noël**, **4 pièces de la tenue de Noël** (cosmétiques), et aux cases spéciales 6, 12, 18, 24 : le
  **petit renne « Grelot »** (le 6, la Saint-Nicolas), le **village de Noël** (le 12), la **boule à neige** (le 18), les **chaussons qui
  complètent la tenue et l'aura des flocons** (le 24). Simulé : l'occasionnel quatre jours sur sept ouvre **22 cases le 24** et les **24 le 31** ;
  un nouveau joueur du 15 décembre en ouvre 14 (quotidien : 24) ; jamais plus de deux le même jour.
- **La saison d'hiver** : **46 crans de 45 XP** (2 070 XP), le titre **« Flocon d'or 2026 » à 2 320 XP** (+250). Sur le vrai moteur (prototypé :
  `outils/noel/saison-proto.js`), récompenses versées : quotidien 1 h → **finie le 31 déc.** ; assidu 2 h → le 27 (+ le titre) ; très actif →
  le 24 (+ le titre) ; **occasionnel 4 j/7 → 31/46 (67 %)** (28/46, 61 %, arrivé le 1er déc.) ; occasionnel tous les jours 42/46 ; nouveau le
  15 déc. : quotidien 34/46, occasionnel 18/46. Récompenses : 13 ★, 4 petits boosts, 6 décos d'hiver, le trophée, une collection de flocons (cosmétique), le titre.
- **L'enchaînement automne → hiver** est joué dans la simulation (le même `st.piste`) : l'automne archivé le 1er déc. à 0 h (`passees`,
  `finDue`), l'hiver ouvert au même pas, le défi de la semaine du 30 nov. jamais compté deux fois, aucun trou.
- **Le Marché de Noël** : les chiffres du Marché d'automne (même fenêtre de 176 h, même moteur) : paliers 10 / 14 / 16 / 20 (occasionnel,
  quotidien, assidu, très actif, médiane sur 8 graines, `outils/noel/rythme-resultats.txt`) ; **enveloppe** (ligne `'noel'`, pas de 6 h, 31 log10) :
  `{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.95,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.95,18,18.05,18.1,18.15,18.15,18.2}`
  (identique à la ligne `'marche'` de la v6.9) : marge **×2,20** au plus juste sur 24 marathons, **×2,22** sur 24 jamais vus, **×14,1 / ×14,9**
  au plus large après 7 h 15. **SQL v7.0 : 34 vérifications PGlite, toutes vertes** (collé deux fois par-dessus la v6.9).
- **La longévité** (`test/longevite.js`, 4 graines moyennées) : voir § 8.3 ; verdict : **aucun effet notable** pour les joueurs déjà là, un
  coup de pouce mesuré pour le nouveau joueur occasionnel de décembre (§ 8.3, question § 15.1).
- **Le poids** : la page passe de **2 046 Ko** à environ **2 240 Ko** (Livraison 1 ≈ +55 Ko, Livraison 2 ≈ +135 Ko avec la fabrique partagée,
  ≈ +225 Ko sans) : sous la borne de 3 000 Ko avec ≈ 760 Ko de marge. **Les vignettes, elles, ne tiennent pas** : il reste **32,6 Ko** sur
  1 536 Ko pour ≈ 36 objets (≈ 195 Ko) : recuisson du carnet en qualité 50 (§ 9.3, question § 15.2).

---

## 1. Ce qu'on réutilise

| Pièce | Ce qui existe (master 1db1e38) | Point 7 |
|---|---|---|
| Moteur des saisons `src/saison.js` | fiches, XP par constat, `pas`, `recevoir`, `verser`, `fin`, `finDue`, `recevoirFin`, `possede`, `restes`, `vue` ; 30 crans au plus | **deux changements** (§ 3.2) : 50 crans ; les « lecteurs » d'une fiche (l'XP de l'Avent) ; la fiche `src/saison-hiver.js` |
| L'écran de la saison (`#piste`, la feuille, `SAI`, `st.pisteAnnonce`) | ui.js, style.css | inchangé, il lit `SAISONS.vue` : 46 crans, la source « Calendrier de l'Avent » dans « D'où vient l'XP », les flocons |
| Calendrier de l'Avent | rien | **nouveau** : `src/avent.js` (règles, sans DOM) ; la carte `#avent`, la feuille-calendrier (ui.js) ; la référence : `outils/noel/avent.js` |
| Moteur d'événement (`src/hantee.js` → `src/marche.js`) | copié pour le Marché | **une fabrique** : `MARCHE.fabriquer(D)` dans `src/marche.js` ; `src/noel.js` = les seules données de Noël (§ 4.1) |
| Écran d'événement (`src/evenement.js`) | `ficheBoutique(R, T)`, `HABILLAGE_HANTEE`, `HABILLAGE_MARCHE`, `liste` | `HABILLAGE_NOEL`, `ficheNoel()`, `liste = [quartier, hantee, marche, noel]`, le motif `'noel'` des mini-jeux |
| Activités (`src/hanteeactivites.js`, `src/activites.js`) | génériques depuis le point 6 (`F.p`, `F.scene3`, `F.ico`, `F.compagnon`) | rien, la fiche suffit |
| Le tiroir (`src/tiroir.js` + celui de `src/evenement.js`) | trois crans, poignée **et** barre | **RÈGLE PERMANENTE** : l'écran du Chalet a le tiroir du Manoir, jamais un tiroir propre ; son test se calque sur `test/fournil-hantee-activites.cjs` |
| Boutique transformée | `src/boutiquehantee.js`, `src/boutiquemarche.js` (même API) | `src/boutiquenoel.js` (C), même API |
| ui.js par événement | `EVS.liste` : coin, minuteurs, onglets, réglage « Masquer », podium, visite, `envoiEvenement`, `NOM_EVT_LONG`, `deEvt` | une entrée de plus ; rien à généraliser |
| Classement | `EVTS = ['hantee','marche']`, `NOMS_EVT`, `TITRES`, photo `dh`/`dm`, `RECOMPENSES_EVT` (15 premiers) | `'noel'`, la photo `dn`, `TITRES['legende-noel']`, `TITRES['flocon-or-2026']` |
| Serveur | v6.9 : `fournil_evts()` lignes `'hantee'`, `'marche'` | v7.0 : + `'noel'`, `fournil_evt_titre('noel')` (§ 5) |
| Décembre dans la boutique | déjà : le tag `'noel'` (mois 12, `src/game.js` l. 453) pose un sapin et la guirlande de Noël ; la recette de saison « Bûche de Noël » (jusqu'au 31 déc.) | **rien n'y touche** ; aucune déco du point 7 ne s'appelle `sapin` ni `guirlande` (`objet(E, 'sapin')` existe déjà) ; les recettes du Chalet ne s'appellent pas `buche` côté boulangerie (espace `st.noel`) |

**Les identifiants déjà pris** (vérifiés) : le compagnon `pingouin`, le produit `croquembouche`, la recette de saison `buche`, les ids `.mc`,
`.marche`, `.nl` (aucun) ; les préfixes libres : `av-` (l'Avent), `nx-` (le Chalet, écran `#noel`, classe d'écran `nxl`), `hv-` (rien à
préfixer côté saison : `#piste` sert déjà). Tous les nouveaux ids de décos, pièces, compagnons ci-dessous sont libres (grep fait le 9 nov.).

---

## 2. Le calendrier de l'Avent (`src/avent.js`, Livraison 1, constructeur A ; écran : B)

### 2.1 La règle (à dire telle quelle dans le jeu)
> **Chaque jour, ouvre la case du jour. Tu en as oublié ? Tu peux en rattraper une par jour, jusqu'au 31 décembre.**

- Le jour D (1 à 24 décembre, heure de Paris) : la case D s'ouvre si elle ne l'est pas, **et une** case passée non ouverte (k < D), au choix
  du joueur : au plus **deux** ouvertures ce jour-là.
- Du 25 au 31 décembre : plus de case du jour ; **un** rattrapage par jour. Le 1er janvier à 0 h, le calendrier se range (la carte disparaît,
  la feuille reste lisible depuis Mes récompenses : « Calendrier de l'Avent 2026 : 22/24 »).
- **Jamais** deux fois la même case ; **jamais** une case future (n > D) ; **jamais** deux rattrapages le même jour, **ni** un rattrapage un
  jour d'avant le dernier (une horloge qui recule ne rend pas un rattrapage : `r ≥ aujourd'hui` refuse).
- Pourquoi celle-ci et pas « la case du jour et celle d'hier » : deux jours d'absence ne coûtent rien pour toujours, un enfant qui ne joue que
  le mercredi et le week-end ouvre tout (22 le 24, 24 le 31, simulé) ; et elle tient en une phrase. Elle n'ouvre pas plus de deux cases par
  jour, et un nouveau joueur du 15 n'en rattrape qu'une par jour (14 cases au 31 pour l'occasionnel) : pas de rafale de récompenses.

### 2.2 L'heure sûre (contre le changement d'heure)
`jour(now, sure)` lit le jour sur **l'heure sûre** quand elle est connue (`now` = `HORLOGE.maintenant()`, `sure` = `HORLOGE.etat().sure`) :
`t = sure > 0 ? min(now, sure) : now` (comme `MARCHE.fenetreSure`). Avancer l'heure du téléphone hors ligne n'ouvre donc pas la case de
demain (au plus, l'horloge du jeu avance d'une absence, 8 h, mais pas l'heure sûre). Sans heure sûre (l'artefact Claude), le « maintenant » du
jeu. Le jour du rattrapage (`r`) est la clé du jour de `t`. Message quand `jour(now) > jour(now, sure)` : « Ton téléphone n'a pas encore
retrouvé l'heure : la case du jour s'ouvre dès qu'il est en ligne. »

### 2.3 Les 24 cases (`AVENT.LOTS`, la copie de `outils/noel/avent.js` à la livraison, ou de la table ci-dessous si elle diffère)

| Case | Lot (en plus de la friandise et des 10 XP de saison) | | Case | Lot |
|---|---|---|---|---|
| 1 | 1 ★ | | 13 | — |
| 2 | déco `couronne-avent` (la couronne de l'Avent et ses quatre bougies, comptoir, lueur) | | 14 | boost ×2 30 min |
| 3 | boost ×2 30 min | | 15 | déco `bonhomme-neige` (sol) |
| 4 | — | | 16 | — |
| 5 | `avent-bonnet` (le bonnet de Noël rouge à pompon blanc, tête, forme `bonnet`) | | 17 | `avent-pull` (le pull de Noël aux flocons, haut, forme `sweat`) |
| **6** | **le petit renne « Grelot »** (compagnon) **+ 1 ★** (la Saint-Nicolas) | | **18** | **déco `boule-neige`** (la boule à neige, comptoir) **+ 1 ★** |
| 7 | — | | 19 | — |
| 8 | déco `chaussettes` (la guirlande de chaussettes, rebord) | | 20 | 1 ★ |
| 9 | 1 ★ | | 21 | — |
| 10 | — | | 22 | boost ×3 30 min |
| 11 | `avent-echarpe` (l'écharpe rayée rouge et blanche, accessoire, forme `foulard`) | | 23 | — |
| **12** | **déco `village-noel`** (le village de Noël miniature, comptoir, lueur) **+ 1 ★** | | **24** | **`avent-chaussons`** (les chaussons de feutre, pieds, forme `chaussures` : **la tenue de Noël complète**), **l'aura `flocons`**, **2 ★** |

Total : **8 ★, 3 boosts** (réserve), 5 décos, 4 pièces (collection `avent`, ensemble « Tenue de Noël » **sans bonus**, comme la tenue de
saison d'automne), le renne, l'aura, 24 friandises, 240 XP de saison. « — » : la friandise et les 10 XP seulement. Les **friandises** :
`FRIANDISES = ['sucre-orge', 'papillote', 'bonhomme-pain-epices', 'clementine', 'etoile-chocolat', 'guimauve', 'nougat', 'coeur-pain-epices']`,
la case n montre `FRIANDISES[(n − 1) % 8]` dans sa teinte `(n − 1) / 8` (trois teintes) : un dessin (C : `ICONS.AVENT.friandise(id, teinte)`),
aucun état, aucune vignette ; « Ta boîte à friandises : 9/24 » dans la feuille.
Pourquoi si peu d'étoiles : la première version (19 ★, 4 boosts) faisait gagner +30 % d'étoiles au 30e jour (l'Avent seul, 4 graines) au nouveau joueur
occasionnel arrivé le 1er décembre ; +49 % avec la piste d'hiver de la v1 (27 ★, 8 boosts) (§ 8.3).

### 2.4 L'état : `st.avent` et la réparation
```js
st.avent = { v: 1, id: 'avent-2026', o: 0, r: '' }  // o : masque des cases ouvertes (bit n − 1 = case n, arithmétique : 2 ** (n − 1)) ; r : le dernier jour (Paris) d'un RATTRAPAGE
st.aventAnnonce = 'avent-2026'                     // (hors de st.avent, comme st.pisteAnnonce) l'annonce vue
```
- `AVENT.etat(st, now)` : rien n'est créé hors de la fenêtre (avant le 1er déc. ou à partir du 1er janv.) ; dedans, `st.avent` créé au premier
  appel. **Réparation** (`reparer(st, now)`, jamais d'exception) : pas un objet / un tableau → neuf ; un autre `id` (une version future) →
  neuf ; `o` pas un entier sûr dans [0, 2²⁴[ → 0 ; `r` pas `''` ni `AAAA-MM-JJ` → **le jour de `now`** (pas de rattrapage ce jour-là, il revient
  le lendemain : jamais deux) ; les cases gardées, jamais rouvertes.
- `ouvrir(st, n, now, sure)` → `{ ok, lot, rattrapage }` ou `{ ok: false, raison: 'inconnue' | 'ferme' | 'deja' | 'future' | 'rattrapage' }` :
  **marque et rend le lot dans le même geste** ; l'écran le verse aussitôt (`verser(st, lot, G)` : étoiles, boost dans la réserve, vêtement ;
  le reste se lit par `possede`). Un écran qui tombe entre les deux : au prochain lancement, `AVENT.aVerser(st)` (les cases ouvertes dont la
  pièce n'est pas dans la garde-robe) les redonne ; étoiles et boosts sont versés **avant** la sauvegarde qui suit `ouvrir` (même tour).
- `ouvrables(st, now, sure)` → `{ jour, du, rattrapage: [k…] }` (la carte, la pastille, les cases qui brillent) ; `possede(st, id)` (une déco,
  le renne, l'aura : par le masque) ; `vue(st, now, sure)` (tout ce que montrent la carte et la feuille : cases, état, friandise, lot, ouvrable,
  raison, `restant` le 31) ; `LOTS`, `FRIANDISES`, `ORDRE_CASES`, `CASES = 24`, `DEBUT`, `FIN_CASES` (25 déc. 0 h), `FIN` (1er janv. 0 h).
- **Vieilles sauvegardes** : pas de `st.avent` → rien avant le 1er déc. ; pendant, créé au premier appel ; après le 1er janv., rien (pas
  d'Avent joué). `st.avent === null` : traité comme abîmé (neuf, rien à rendre).
- **Nouveaux joueurs** (`st.accueil`) : un déblocage `avent` (**bit 16**, ajouté à `ACCUEIL.deblocages` et donc à `TOUS`), seuil
  `(st, a) => a.r === 1 || st.lifetime >= 1e6` (comme `piste`) **et** la fenêtre ouverte (comme `pisteAttend` : un nouveau joueur qui passe
  1 M€ le 30 novembre voit sa bulle le 1er déc.). Avant le déblocage, la carte est cachée mais rien n'est perdu (les cases du jour non
  ouvertes deviennent des cases oubliées). Une vieille sauvegarde (`t: 1`) la voit tout de suite.
- **Tests** : comme la saison, l'Avent est éteint sous `navigator.webdriver` sauf `window.__avent === true` (seul `test/fournil-avent.cjs` la
  pose) : aucun test existant ne voit la carte ni l'annonce.

### 2.5 L'XP de saison de l'Avent
La fiche d'hiver lit l'Avent par un **lecteur** (§ 3.2) : `lecteurs: { avent: (st) => AVENT.nOuvertes(st.avent) }`, la source
`avent: { xp: 10, nom: 'Calendrier de l'Avent', txt: 'une case du calendrier ouverte' }` (sans plafond de plus : la règle borne à deux par
jour). 24 cases = 240 XP. Une case ouverte avant la création de la piste (impossible : les deux s'ouvrent le 1er à 0 h) compterait au premier pas.

### 2.6 L'écran de l'Avent (B)
- **La carte** `#avent` dans le tiroir de la boulangerie, **au-dessus de `#piste`** (du 1er au 31 déc.) : « Calendrier de l'Avent · 7/24 · la
  case du jour t'attend » ; la pastille quand `ouvrables` n'est pas vide ; un toucher ouvre la feuille. Elle ne compte pas comme une carte
  recette (comme `#piste`).
- **La feuille-calendrier** (`pq-sheet`, `#av-feuille`) : une grande carte illustrée (un chalet sous la neige, C : `ICONS.AVENT.fond`), **24 cases
  en 4 colonnes**, dans l'ordre mélangé fixe `ORDRE_CASES = [12, 3, 19, 7, 22, 1, 15, 9, 6, 17, 2, 21, 10, 24, 5, 14, 20, 8, 13, 23, 4, 18, 11, 16]`
  (le même pour tous), les quatre spéciales sur deux colonnes ; ≥ 72 px de côté à 360 px, sans défilement horizontal. États : fermée (le
  numéro), **du jour** (elle luit doucement), **à rattraper** (un ruban « À rattraper », seulement si le rattrapage du jour est libre), ouverte
  (la friandise, l'icône du lot), future (le numéro, grisé ; toucher : « Patience ! Cette case s'ouvre le 14 décembre. »). Ouvrir : les
  deux volets s'écartent (0,4 s, sans animation si mouvement réduit), le lot, « +10 XP de saison », le son de la cloche ; les spéciales : des
  confettis de flocons et la feuille du lot (« Grelot le petit renne t'attend dans Les compagnons »). Refus : « Tu as déjà rattrapé une case
  aujourd'hui : la suivante demain. » En bas : la règle (§ 2.1), « Ta boîte à friandises : 9/24 », « encore 4 j ».
- **L'annonce** (une fois, le 1er déc. ou au premier lancement après) : **une seule annonce pour décembre**, « Le calendrier de l'Avent et la
  saison d'hiver » (deux points, deux boutons « Ouvrir la case 1 » / « Plus tard ») ; dans la file `tenterAnnonces`, **après** la feuille de fin
  de la saison d'automne (`finDue`) ; jamais deux annonces à la fois. `st.aventAnnonce` et `st.pisteAnnonce = 'hiver-2026'` posés ensemble.
- **Nouveautés** (`src/nouveautes.js`) : `{ id: '2026-11-28-a', date: '2026-11-28', titre: 'Décembre au Fournil : le calendrier de l'Avent et la saison d'hiver', points: [
  « Dès le 1er décembre, une case par jour : une friandise, des étoiles, des décos de Noël, une tenue de Noël et un petit renne. »,
  « Une case oubliée ? Tu peux en rattraper une par jour, jusqu'au 31 décembre. », « La saison d'hiver : une nouvelle piste gratuite jusqu'au
  3 janvier. Le calendrier, les objectifs du jour, le défi de la semaine, ta série et le Marché de Noël la font avancer. », « Tout ce que tu
  reçois reste à vie. » ] }` (**à re-dater le jour de la mise en ligne** : `test/fournil-nouveautes.cjs` refuse une date d'avance).
- **Mes récompenses** et **Mes décos** : la famille `avent` (« Le calendrier de l'Avent 2026 »), la tenue `avent` dans la garde-robe, le renne
  dans Les compagnons (« Gagné au calendrier de l'Avent », verrou « La case du 6 décembre »).

---

## 3. La saison d'hiver (`src/saison-hiver.js` + deux changements de `src/saison.js`, Livraison 1, A ; écran : B)

### 3.1 La fiche
```js
SAISONS.ajouter({ id: 'hiver-2026', nom: 'La saison d’hiver', court: 'Saison d’hiver', annee: 2026,
  debut: SAISONS.parisMs(2026, 12, 1, 0), fin: SAISONS.parisMs(2027, 1, 4, 0),          // le 3 janv. à 23 h 59 59
  sources: Object.assign({}, SAISONS.SOURCES, { avent: { xp: 10, nom: 'Calendrier de l’Avent', txt: 'une case du calendrier ouverte' } }),
  lecteurs: { avent: (st) => (typeof AVENT !== 'undefined' ? AVENT : require('./avent.js')).nOuvertes(st.avent) },
  crans: CRANS /* § 3.3 */, xpCran: 45, titre: { xp: 250, distinction: 'flocon-or-2026', nom: 'Flocon d’or 2026' },
  evenements: ['noel'],                                                                  // les paliers du Marché de Noël (st.noel.paliers), 20 XP chacun
  famille: 'piste-hiver', tenue: null, couleurs: { fond: '#F2F6FB', accent: '#2B4C7E', or: '#E8B33A', vert: '#2E7D4F', texte: '#1E2A3A', doux: '#6B7C93' },
  noms: NOMS, textes: { titre: 'La saison d’hiver', carte: 'Saison d’hiver', annonceTitre: 'Nouveau : la saison d’hiver !',
    annonce: 'Jusqu’au 3 janvier, une piste de récompenses gratuite : le calendrier de l’Avent, les objectifs du jour, le défi de la semaine, ta série et le Marché de Noël la font avancer. Tout ce que tu reçois reste à vie.',
    fin: 'La saison d’hiver est finie : voici ce qui t’attendait.', carnet: 'Saison d’hiver 2026', recevoir: 'Recevoir', toutRecevoir: 'Tout recevoir' } });
```
Ordre de `build.js` : `… 'saison.js', 'saison-automne.js', 'saison-hiver.js', 'avent.js', …` (des règles, avant `classement.js` et `ui.js`).

### 3.2 Les deux changements du moteur (A ; prototypés mot pour mot dans `outils/noel/saison-proto.js`)
1. **Jusqu'à 50 crans** (46 ici : le masque de 32 bits n'en tenait que 30) : `recu = (p, n) => n >= 1 && n <= 50 && Math.floor(p.recus / 2 ** (n − 1)) % 2 === 1`,
   `recevoir` : `p.recus += 2 ** (n − 1)` (après le test « pas reçu ») ; `reparer` : `entier(p.recus) && p.recus < 2 ** 50` ; `ajouter` refuse
   au-delà de 50 ; `nettoyerPassees` borne `crans` à 50 ; `PISTE.maxCrans: 50`. **Une piste d'automne (< 2²²) se lit à l'identique** (test).
2. **Les lecteurs d'une fiche** (`fiche.lecteurs : { source: (st) => compteur qui ne fait que monter }`) : `constats` les lit (`ev[source]`,
   un lecteur qui jette ou rend autre chose qu'un entier ≥ 0 compte 0), `ouvrir` les pose à 0 (ce qui est déjà fait compte au premier pas),
   `reparer` les remet d'aplomb comme les paliers, `pas` crédite l'augmentation (`crediter(source, n − avant)`, marqueur `p.ev[source]`),
   `restes` ajoute la ligne (après `palier`, `max: null`, `fait` = ouverts aujourd'hui, lu dans `j.a` : un compteur du jour de plus dans `j`,
   réparé comme les autres). `ORDRE` devient `ORDRE.concat(Object.keys(F.lecteurs || {}))` dans `restes`.
Rien d'autre ne change : les six sources, leurs plafonds et la règle « par constat » sont ceux de l'automne (choix du joueur).

### 3.3 La piste : 46 crans de 45 XP, puis le titre

| Cran | Lot | | Cran | Lot | | Cran | Lot |
|---|---|---|---|---|---|---|---|
| 1 | boost ×2 30 min | | 17 | déco `guirlande-givre` (la guirlande de flocons, rebord, lueur) | | 33 | flocon |
| 2 | 1 ★ | | 18 | 1 ★ | | 34 | 1 ★ |
| 3 | flocon | | 19 | flocon | | 35 | déco `patins` (les patins à glace, mur) |
| 4 | flocon | | 20 | flocon | | 36 | flocon |
| 5 | déco `luge` (la luge de bois, sol) | | 21 | flocon | | 37 | boost ×3 30 min |
| 6 | 1 ★ | | 22 | 1 ★ | | 38 | 1 ★ |
| 7 | flocon | | 23 | déco `traineau` (le traîneau chargé de paquets, sol) | | 39 | flocon |
| 8 | flocon | | 24 | flocon | | 40 | flocon |
| 9 | flocon | | 25 | boost ×2 1 h | | 41 | flocon |
| 10 | 1 ★ | | 26 | 1 ★ | | 42 | 1 ★ |
| 11 | déco `lanterne-givre` (la lanterne givrée, comptoir, lueur) | | 27 | flocon | | 43 | flocon |
| 12 | flocon | | 28 | flocon | | 44 | flocon |
| 13 | boost ×2 30 min | | 29 | déco `cheminee` (la cheminée et ses bûches, mur, lueur) | | 45 | flocon |
| 14 | 1 ★ | | 30 | 1 ★ | | **46** | **le trophée `trophee-hiver-2026`** (comptoir + vitrine) **+ 2 ★** |
| 15 | flocon | | 31 | flocon | | titre | 2 320 XP : **« Flocon d'or 2026 »** (au classement, à côté du pseudo) |
| 16 | flocon | | 32 | flocon | | | |

Total : **13 ★, 4 boosts** (×2, ×2, ×2 1 h, ×3), 6 décos, le trophée, le titre, aucune heure de gains, aucune tenue (décembre en a déjà
deux : celle de l'Avent et celle du Chalet). **Le flocon** (`{ flocon: n }`) : un flocon de neige **unique**, dessiné à partir de son numéro
(symétrie d'ordre 6, branches tirées d'une graine `n`, C : `ICONS.flocon(n)`, ≈ 1 Ko de code, aucune vignette), collectionné dans la feuille
(« Mes flocons : 12/24 — il n'y en a pas deux pareils ») ; rien à verser.
Pourquoi 46 : le quotidien 1 h finit le 31 déc. (trois jours de marge, comme l'automne : fini le 25 pour une fin le 30) ; à 48, il finirait le
2 janv., au moindre jour manqué jamais. L'occasionnel 4 j/7 est à 61-67 % (plus que « vers la moitié » : l'Avent rattrapé lui rapporte
autant qu'au quotidien, 240 XP, et la piste dure cinq défis de la semaine) ; à 5 XP la case, il perdrait 3 crans, mais le quotidien ne
finirait que le 2 janv. (§ 15.3).

### 3.4 L'enchaînement avec l'automne (sans trou ni double compte)
- Les fenêtres se touchent : automne `[13 nov. 12 h, 1er déc. 0 h[`, hiver `[1er déc. 0 h, 4 janv. 0 h[` ; `ajouter` refuse un chevauchement.
- Au premier `pas` à partir du 1er déc. 0 h (ou au premier lancement après, même le 10) : `etat` → `fin(automne)` (les crans dus rangés
  dans `st.piste.dus`, l'archive `passees['automne-2026']`) → `ouvrir(hiver)` dans le même appel (`passees`, `dus` et `sem` suivent) : **le
  défi de la semaine du lundi 30 nov. déjà compté à l'automne ne compte pas pour l'hiver** (`sem` gardé) ; un défi de cette semaine réclamé
  après le 1er compte pour l'hiver. Les objectifs du 30 nov. : à l'automne (le jour de Paris change à minuit, `j` repart).
- La feuille de fin d'automne (`finDue` → versée → `recevoirFin`) passe **avant** l'annonce de décembre (§ 2.6).
- Une horloge reculée après le 1er déc. ne rouvre pas l'automne (déjà vrai : `passees`) ; avancée au 4 janv. hors ligne, l'heure sûre
  n'ouvre pas la fin de l'hiver plus tôt que le « maintenant » du jeu : la fin se lit sur `now` (comme le Marché), sans gain possible (les
  crans dus sont ceux déjà gagnés).
- La fin de l'hiver (4 janv. 0 h) : dus d'office, archive `passees['hiver-2026']`, `id: ''` (pas de saison au printemps pour l'instant).
- Testé sur le prototype : `outils/noel/hiver.js` joue les joueurs depuis le 1er nov. : la piste d'automne (22/22 le 25 nov. pour le
  quotidien) puis celle d'hiver dans le même `st.piste`.

### 3.5 Mes décos, le titre
La famille `piste-hiver` (« La saison d'hiver 2026 ») de `src/chaine.js` lit `SAISONS.possede` (6 décos + le trophée), **en dernier** dans
`FAMILLES` ; `DISTINCTIONS['flocon-or-2026']` « Flocon d'or 2026 » ; `TITRES['flocon-or-2026']` (classement.js). Le carnet de la saison :
« Saison d'hiver 2026 : 46/46, Flocon d'or ».

---

## 4. Le Marché de Noël (`src/noel.js`, Livraison 2, A ; écran : B ; scène : C)

### 4.1 Une fiche sur le moteur de la Halle (la fabrique)
`src/marche.js` est découpé en deux, **sans rien changer à la Halle** : `function fabriquer(D)` (tout le moteur d'aujourd'hui, lisant ses
dates, sa graine, ses noms et sa fiche dans `D`) et `const MARCHE = fabriquer(D_MARCHE)` ; `MARCHE.fabriquer` est exporté. `src/noel.js` ne
porte **que les données** (`NOEL = MARCHE.fabriquer(D_NOEL)`, Node : `require('./marche.js').fabriquer`), ≈ 14 Ko compressés au lieu de 48.
Garde-fou (`test/fournil-marche.test.js`, avant toute autre ligne de Noël) : `Object.keys(MARCHE)` identiques, et **`MARCHE.simuler` rend la même
chose octet pour octet** avant/après le découpage (4 profils × 2 graines + le marathon, Astuces offertes : les traces JSON comparées à un
fichier figé avant le découpage, `test/fournil-marche-trace.json`) ; tous les tests de la Halle verts sans changement.
Ce que `D` porte : `id`/`cle` (`'noel'`), `DEBUT`, `FIN`, `mois`/`jour0` des ouvertures (`parisMs(2026, 12, 17 + p.jour, 0)`), la graine
(« |noel|manoir »), les noms et `desc` des recettes, apprentis, postes, Astuces, coups de pouce, les **récompenses** des paliers (§ 4.5),
`VETEMENTS`, `VETEMENTS_OR`, `DECOS`, `TROPHEE`, la clé du compagnon de la collection (`q.oursBlanc`), `FICHE`. **Les chiffres du moteur**
(coûts, revenus, temps, croissances, prix, multiplicateurs, seuils et jours des paliers, `EVEIL`, `CLIENTS`, `PARFAIT`, `APPARITIONS`,
`COMMANDES`, `BESTIAIRE`) **restent ceux de la Halle** : l'enveloppe du serveur en dépend (§ 5). Si A juge le découpage trop risqué, le
repli est la copie (`src/noel.js` = `src/marche.js` copié, comme au point 6 : +34 Ko).

### 4.2 La fenêtre et l'état
`DEBUT = parisMs(2026, 12, 18, 12)`, `FIN = parisMs(2026, 12, 25, 20)` (176 h), `JOURS = 8` (ven. 18 = 1 … jeu. 24 = 7, le réveillon ; ven. 25
= 8), `GRACE = 3600e3`, `CLASSEMENT_JUSQUA = FIN + 14 j` (ven. 8 janv. 2027 20 h), `fenetreSure`, `envoiBonbons`/`envoiBillets` inchangés.
L'état vit dans **`st.noel`** (`neuf`, `etat`, réparation : ceux du Manoir et de la Halle ; `majeur: true`). Pas de chevauchement avec le
Marché d'automne (fini le 20 nov., grâce comprise) : un test le vérifie pour les trois fenêtres.

### 4.3 La fiche (`NOEL.FICHE`)
```
id: 'noel', nom: 'Le Marché de Noël', lieu: 'le Chalet', Lieu: 'Le Chalet', adulte: false, cle: 'noel',
classement: { periode: 'noel', onglet: 'Noël', evt: 'noel' },
devise: { nom: 'sucres d’orge', un: 'sucre d’orge', icone: 'sucre-orge', svg: SUCRE_ORGE_SVG },
couleurs: { fond: '#FFF8F0', carte: '#FFFFFF', accent: '#C8102E' (rouge de Noël), clair: '#B8A08A', vert: '#2E7D4F' (sapin), or: '#E8B33A',
            nuit: '#2B4C7E', texte: '#3A1E1E', doux: '#8C6E64' },
dates: { debut, fin, texteDebut: 'vendredi 18 décembre à midi', texteFin: 'vendredi 25 décembre à 20 h' }, chat: null
```
Textes : titre « Le Marché de Noël », sousTitre « Le Chalet · Noël », annonceTitre « Le Marché de Noël ouvre ses chalets ! », annonce
« Jusqu'au vendredi 25 décembre à 20 h : une boutique à part, « le Chalet », où tout le monde part de zéro. Ses sucres d'orge rapportent des
récompenses pour ta boulangerie : étoiles, boosts, décos de Noël, une tenue de lutin à vie et un ourson blanc. », ouvrir « Entrer dans le
Chalet », fermer « Retour à la boulangerie », ameliorations « Astuces », equipe « Les lutins du Chalet », manuel « Touche ! », palier12 « Le
maître du Chalet, c'est toi. Tout ça reste à vie, même après Noël. », bilanTitre « Bilan du Marché de Noël », bilan « Le Chalet a éteint ses
guirlandes. Tout ce que tu as gagné reste à vie. », ferme « Le Chalet est fermé. », classementInfo « Les sucres d'orge gagnés au Chalet ·
podium final le 25 déc. à 20 h », classementFini « Le Marché de Noël est fini : le podium final est figé », vide « Personne encore au
Chalet », videSous « Les sucres d'orge du Chalet arrivent avec le prochain envoi. », podium « 1er du Chalet », podiumFinal « Podium final du
Marché de Noël : la tenue de lutin en or est dans ta garde-robe ! », départ fâché « Il est reparti faire des bonshommes de neige ».
**Les tests lisent ces textes dans la fiche** (jamais recopiés en dur : au point 6, dix échecs venaient de textes du Manoir restés dans les tests).

### 4.4 Les huit recettes (noms ; chiffres = la Halle)

| # | id | nom | apprenti (lutin) | poste |
|---|---|---|---|---|
| 1 | `chocolat` | Chocolats chauds (tasses de chocolat chaud) | Pompon | Le chaudron de chocolat |
| 2 | `bredele` | Petits sablés de Noël (bredele) | Clochette | Le four aux bredele |
| 3 | `pain-epices` | Pains d'épices en cœur | Cannelle | Le comptoir du pain d'épices |
| 4 | `mannele` | Petits bonshommes briochés (de la Saint-Nicolas) | Biscotte | La boulange de Saint-Nicolas |
| 5 | `buche-chalet` | Bûches du Chalet | Praline | L'atelier des bûches |
| 6 | `coffret` | Coffrets de friandises | Nougat | L'étal des coffrets |
| 7 | `papillote` (après le 13e) | Papillotes et nougats | Guimauve | Le comptoir des confiseurs |
| 8 | `kouglof` (après le 16e) | Kouglofs du réveillon | Réglisse | Le moule à kouglof |

Rien d'alcoolisé (pas de vin chaud) ; `desc`/`staffDesc` : une phrase douce chacune (« Pompon goûte chaque tasse. Pour vérifier, dit-il. »).

### 4.5 Astuces, coups de pouce, paliers
- **Astuces** (mêmes coûts, cibles, effets) : `bouilloire` La bouilloire qui chante (Chocolat ×3) · `emporte-piece` Les emporte-pièces en étoile
  (Sablés ×3) · `traineau-moteur` Le traîneau à moteur (Tout ×2) · `epices` Le coffre à épices (Pain d'épices ×3) · `petrin-nicolas` Le pétrin de
  Saint-Nicolas (Bonshommes ×3) · `feu-bois` Le feu de cheminée (Chocolat et sablés ×5) · `lettre` La lettre au Père Noël (Tout ×2) ·
  `roulade` La roulade parfaite (Bûches ×3) · `rubans` Les rubans dorés (Coffrets ×3) · `reveillon` Le grand réveillon (Tout ×3) ; après le 12e :
  `cloche` La cloche du marché (niveaux à moitié prix) · `bonhomme-garde` Le bonhomme de neige gardien (8 touches, 5 %) · `couverture` La
  couverture en laine (absence 12 h à 20 %) · `papier-or` Le papier doré (Papillotes ×3) · `aurore-boreale` L'aurore boréale (l'heure dorée
  2 min 30) · `traineau-facteur` Le traîneau du facteur (la brouette attend 20 s, son panier ×3) · `moule-kouglof` Le moule en terre (Kouglofs ×3).
- **Coups de pouce** (clés de mécanique du Quartier) : `descente` **Les boules de neige !** « Des garnements visent l'étal : protège les
  sucres d'orge, vite ! » ; `grosclient` **La chorale de Noël** « La chorale commande pour l'entracte ! » ; `soiree` **La parade des lumières**
  « Les guirlandes s'allument sur la place : tout se vend ×2 ! » ; `scooter` **Le traîneau du facteur** « Le traîneau du facteur passe :
  attrape le paquet ! ». Stats : Ventes, Boules de neige évitées, Chorales servies, Paquets attrapés.
- **Les vingt paliers** : seuils et jours **de la Halle** (§ 2.6 du contrat du point 6 : 3, 3, 3, 3, 2, 2, 2, 2 par jour ; vérifiés sur le
  prototype de Noël : 10 / 14 / 16 / 20), récompenses aux mêmes rangs : 1 ★ + ×2 30 min (« Premiers sucres d'orge ») · déco `cadeaux` + prime
  1 h · `noel-bonnet` · 1 ★ + déco `etoile-berger` · `noel-gilet` + prime 2 h · déco `casse-noisette` · `noel-bottes` + 1 ★ + ×5 15 min · déco
  `maison-pain-epices` + prime 3 h · `noel-corbeille` (la tenue complète) · … · 20e : `noel-couronne`, 8 ★, ×10 1 h, prime 24 h, déco `sapin-or`,
  aura `aurore`, distinction `legende-noel` (« La légende du Marché de Noël »). Étoiles, boosts et primes : ceux de la Halle à l'identique.
  `PALIERS_BOSS = 12`, `TROPHEE = 'noel-couronne'`, `VETEMENTS = ['noel-bonnet', 'noel-gilet', 'noel-bottes', 'noel-corbeille']`,
  `VETEMENTS_OR = ['noel-or-bonnet', …]`, `DECOS = ['cadeaux', 'etoile-berger', 'casse-noisette', 'maison-pain-epices']`, pas d'`ANCIENS`.

### 4.6 Les activités du Chalet (le lot 6 réhabillé ; chiffres identiques)
- **Le ×6 qui s'endort** : « Le Chalet bat son plein : ×6 avec toi », « Le Chalet s'assoupit… », « Le Chalet somnole : touche ! ».
- **Les clients** : des enfants **déguisés en personnages de Noël** : `SORTES = ['lutin', 'renne', 'bonhomme-neige', 'sapin', 'pain-epices',
  'ours-polaire', 'pingouin', 'etoile', 'casse-noisette']` (« Le lutin »… ; courts « Lutin »…).
- **Les apparitions** : `TYPES_APPARITION = ['flocon', 'boule', 'cadeau']` (un flocon qui tombe en tournant, une boule qui roule, un petit
  paquet qui sautille) ; série « ×1,5 ».
- **La commande du réveillon** (= la commande de la nuit) : « La commande du réveillon », « Livrer ! ».
- **La collection, « Le livre des costumes »** (= le bestiaire, mêmes chiffres) : `decoId: 'boite-musique'` (la boîte à musique au 5e ;
  `boite-musique-argent`, `-or` la teignent), compagnon au 9e : **l'ourson blanc** (`'ours-blanc'`, « Guimauve »). Clé interne
  `q.oursBlanc` (la seule renommée, comme `q.ecureuil`).
- **Mini-jeux** : `guet` « Le guet » (« Touche quand le renne passe devant la fenêtre »), `compte` « Le compte » (des boules de Noël), `tournee`
  « La tournée » (des paquets numérotés) ; `decor: { motif: 'noel', fond: '#1E2A3A', sol: '#3A2A20', accent: '#C8102E', accent2: '#E8B33A',
  clair: '#F4EDE4', texte: '#FFF8F0' }` ; contrats (« Évite N boules de neige », « Sers N chorales », « Attrape N paquets », « Profite de N
  parades ») ; opérations « La tournée du quartier » (5 min), « Le marché de la ville voisine » (15 min), « La grande nuit de Noël » (1 h).
- **La recette du jour** (8, 20 à 55 s) : `orangettes` (20), `truffes` (25), `petits-pains-anis` (30), `meringues-sapin` (35), `pommes-four`
  (40), `brioche-etoile` (45), `buche-glacee` (50), `tarte-clementine` (55) ; à la 500e fournée : `recetteDeco: 'toque-houx'`.

### 4.7 Garde-robe, aura, distinction, compagnons (`src/game.js`)
- **Avent** (L1) : `avent-bonnet` (tête, `bonnet`), `avent-echarpe` (accessoire, `foulard`), `avent-pull` (haut, `sweat`), `avent-chaussons`
  (pieds, `chaussures`) : collection `avent`, **sans bonus**, rares ; ensemble `avent` « Tenue de Noël » sans bonus. `AURAS.flocons` « Aura des
  flocons » (`#DCEBFA`, des flocons qui tombent doucement autour du boulanger). `COMPAGNONS` : `{ id: 'renne', nom: 'Petit renne', espece:
  'renne', prix: null, condition: (st) => AVENT.possede(st, 'renne'), gagne: 'Gagné au calendrier de l’Avent', verrou: 'La case du 6 décembre',
  nomDefaut: 'Grelot', cri: 'grelot', bonus: (celui de l'écureuil), phrase: 'Il fait tinter son grelot à chaque client.' }`.
- **Hiver** (L1) : `DISTINCTIONS['flocon-or-2026']` « Flocon d'or 2026 ».
- **Noël** (L2) : `noel-bonnet` (le bonnet de lutin pointu à grelot, tête, forme **nouvelle** `lutin`), `noel-gilet` (le gilet de lutin vert
  à boutons dorés, haut, `sweat`), `noel-bottes` (les bottes de lutin, pieds, `bottes`, bout recourbé), `noel-corbeille` (la corbeille de
  cadeaux, accessoire, `panier`) : collection `noel`, **les bonus de `marche-*` à l'identique** ; `noel-or-*` (podium, ceux de `marche-or-*`) ;
  `noel-couronne` (tête, `couronne` en houx givré, le 20e) ; ensembles `noel` « Tenue de lutin », `noel-or` « Tenue de lutin en or » (ceux de
  la Halle) ; `AURAS.aurore` « Aura de l'aurore boréale » ; `DISTINCTIONS['legende-noel']` « Légende du Marché de Noël » ; `COMPAGNONS.ours-blanc`
  (« Gagné au livre des costumes », « Les neuf costumes du livre », `nomDefaut: 'Guimauve'`, condition `st.noel && st.noel.oursBlanc`).
- **Décos** (posables, place d'origine comme celles de la Halle) : Avent `couronne-avent` (comptoir, lueur), `chaussettes` (rebord), `village-noel`
  (comptoir, lueur), `bonhomme-neige` (sol), `boule-neige` (comptoir) ; hiver `luge` (sol), `lanterne-givre` (comptoir, lueur), `guirlande-givre`
  (rebord, lueur), `traineau` (sol), `cheminee` (mur, lueur), `patins` (mur), `trophee-hiver-2026` (comptoir) ; Noël `cadeaux` (sol),
  `etoile-berger` (mur, lueur), `casse-noisette` (sol), `maison-pain-epices` (comptoir), `boite-musique` (+argent, or), `sapin-or` (sol, lueur),
  `toque-houx` (mur).

---

## 5. Le classement du Marché de Noël, l'enveloppe et le SQL v7.0

### 5.1 Classement et acharnés
`p_evt = 'noel'`, onglet « Noël » jusqu'au 8 janv. ; `RECOMPENSES_EVT` tel quel (7, 6, 5 ★ et ×5 1 h ; 4e-6e 4 ★ ×3 1 h ; 7e-10e 3 ★ ×3 30 min ;
11e-15e 2 ★ ×2 30 min ; une fois, `evtPayes: 'noel'`) ; les trois premiers : la tenue de lutin en or ; « Tu as fini 7e du Marché de Noël sur
12 » (`deEvt` : « du ») ; l'acharné (20e) : le titre « Légende du Marché de Noël » (`TITRES['legende-noel']`, la photo `ti`), l'aura de
l'aurore, le sapin d'or, la couronne de houx. Du 18 déc. au 8 janv. : quatre onglets (Semaine · Tous · Noël · Chat), l'onglet « Marché » a
fini le 4 déc.

### 5.2 La table (`outils/noel/rythme.js --plancher`)
La méthode du point 6 (§ 4.1 de son contrat) sur le prototype de Noël, puis relevée **au moins à la table v6.9 du Marché d'automne** (le même
moteur sur la même fenêtre) : `{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.95,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.95,18,18.05,18.1,18.15,18.15,18.2}`
(la retirée seule différait de la v6.9 d'un pas : 16,9 à 48 h). Marges : ×2,20 / ×2,22 (jamais vus) au plus juste, ≤ ×14,9 après 7 h 15.
Le constructeur A la **refait sur les vraies règles** (`TZ=Europe/Paris node outils/noel/rythme.js --reel --plancher`) dans
`test/fournil-noel.test.js` ; si un pas monte, il recopie la table dans le patch **et** le fichier complet, et le dit au § 14.

### 5.3 Le patch `supabase/fournil-classement-v70.sql` (écrit, essayé)
Ce qu'il fait, et rien d'autre : `fournil_evts()` = les lignes `'hantee'` et `'marche'` **inchangées** + la ligne `'noel'` (18 déc. 12 h →
25 déc. 20 h, Europe/Paris, pas 6, la table) ; `fournil_evt_titre('noel')` = « le Marché de Noël » (les notifications « Le Marché de Noël ouvre
ses portes ! Viens jouer. » / « C'est fini pour le Marché de Noël : viens voir le podium ! ») ; mêmes signatures, langage, volatilité,
`search_path`, droits internes. Garde-fou : sans la v6.6+, il refuse. Un serveur resté en 6.8 reçoit la ligne `'marche'` avec lui. Requête de
contrôle en bas (événements `hantee, marche, noel`, 31 valeurs, borne 0 avant le 18 à midi, log10 18,17 à la fin, le titre).

### 5.4 L'essai dans PGlite (`outils/noel/sql-v70.cjs`, **34 vérifications, toutes vertes** : `outils/noel/sql-v70-resultats.txt`)
```sh
npm install --prefix "$SCRATCH/pglite" --no-save --no-package-lock @electric-sql/pglite@0.5.8
TZ=Europe/Paris node outils/noel/sql-v70.cjs "$SCRATCH/pglite"
```
Le fichier complet (v6.9) collé, la Maison hantée et le Marché d'automne joués et figés, des sucres d'orge ignorés sous la v6.9 (rien ne
casse) ; le patch **deux fois** (aucune donnée, aucune autre fonction, aucun droit ne bouge ; `'hantee'` et `'marche'` identiques) ; anon et
authenticated refusés ; la borne = son miroir JS ; le Marché de Noël joué en anon (rien avant midi ; 3e12 compté ; 1e19 ramené à la borne) ;
le classement du Marché d'automne ne le voit pas ; le marathon du prototype envoyé toutes les 10 min (**1 056 envois, aucun plafonné**) ; figé
à 21 h (16 lignes, deux 2e, deux 15e, 19 joueurs), `evenements.noel`, la médaille ; les annonces `noel:ouverture` et `noel:fin` ; le podium du
Marché d'automne intact (celui de la Maison hantée part avec ses joueurs inactifs depuis le 1er nov. : le ménage habituel, déjà là en v6.9).

### 5.5 Le fichier complet
Convention du dépôt : A recopie la v7.0 dans `supabase/fournil-classement.sql` (la ligne `'noel'`, le titre, l'en-tête « Version 7.0 »), garde
la v6.9 complète actuelle dans `test/fournil-classement-v69-complet.sql` (la base de l'essai), ajoute la section v7.0 de
`test/fournil-classement-sql.cjs` (= `outils/noel/sql-v70.cjs` transposé + « le fichier complet porte le même code »), une ligne au
`supabase/README.md`. **Le joueur colle le patch** avant le 18 à midi ; sinon les sucres d'orge sont ignorés (`evt: null`), l'onglet reste vide,
rien ne casse, et le prochain envoi après le collage compte (borné à l'instant de l'envoi).

---

## 6. Les écrans (B)

### 6.1 Livraison 1
L'Avent (§ 2.6) ; la saison d'hiver : l'écran de la piste **inchangé** (il lit `SAISONS.vue`) sauf : 46 crans (la piste défile ; le cran en
cours centré), la ligne « Calendrier de l'Avent » dans « D'où vient l'XP » (ouverts aujourd'hui / 2), le flocon des crans `flocon` (son dessin,
« Un flocon pour ta collection »), « Mes flocons : 12/24 », les couleurs d'hiver de la fiche (variables `--pi-*` lues dans `fiche.couleurs`).

### 6.2 Livraison 2
- `src/evenement.js` : `HABILLAGE_NOEL` (préfixe `nx`, racine `#noel`, `ICONS.NOEL`, `BOUTIQUE_NOEL`, `SCENE.decosNoel`, sons, textes, vidéo
  `noel.mp4` / `noel-affiche.jpg`), `ficheNoel = () => ficheBoutique(NR, HABILLAGE_NOEL)`, `noel` dans `liste` et l'export ; motif `'noel'` des
  mini-jeux (le guet : un renne derrière la fenêtre ; le compte : des boules ; la tournée : des paquets) ; touches de Noël dans `habiller` (une
  guirlande lumineuse dans l'en-tête, de la neige qui tombe près de la poignée, coupée si mouvement réduit).
- `src/page.html` : `#b-noel` (coin, une étoile de Noël, `ICONS.UI.noel`) et `#noel` cloné de `#marche` (ids `nx-…`, classe d'écran `nxl`).
- `src/style.css` : `:is(#hantee, #marche, #noel)` partout où il y a `:is(#hantee, #marche)` ; les variables `--mh-*` de `#noel` (crème
  `#FFF8F0`, texte `#3A1E1E`, accent `#C8102E`, or, vert sapin) ; `#noel.nx-boutique { background: transparent }`.
- `src/ui.js` : rien de générique à écrire (point 6) : `NOM_EVT_LONG.noel = 'le Marché de Noël'`, `SCENE.decosNoel(st.noel ? st.noel.decos : [])`,
  `__fournil.noel`, `fermerNoel`, `evNoel`, `NX` ; le réglage « Masquer le Marché de Noël » ; la vidéo.
- Nouveautés `2026-12-16-a` (à re-dater) : « Du 18 au 25 décembre, ta boutique devient le Chalet : chocolat chaud, bûches, pain d'épices, et des
  enfants déguisés en lutins, rennes et bonshommes de neige. », « Vingt paliers, le livre des costumes, un ourson blanc à gagner, et le
  classement : les quinze premiers sont récompensés. », « Ses paliers font avancer la saison d'hiver. », « Tout ce que tu gagnes reste à vie. ».
- **Les annonces de décembre** dans la file : (1) la fin d'automne, (2) décembre (Avent + hiver), (3) le Marché de Noël (le 18), (4) le bilan
  du Marché de Noël (après le 25 à 20 h) ; jamais deux à la fois ; un joueur absent du 1er au 20 les voit dans cet ordre, une par lancement
  ou à la fermeture de la précédente.

---

## 7. La scène, les décos, les vignettes

### 7.1 Livraison 1 (pas de constructeur C : les objets vont à A et à B, § 11)
- Décos procédurales (`src/meubles.js`, `MEUBLES.DECOS_AVENT` et `DECOS_HIVER`, à part de `NEUVES` comme `DECOS_SAISON`) : 12 (§ 4.7),
  chacune fusionnée (**1 appel**, 2 avec une part vive : lueur), ≤ 3 000 triangles, **tenant dans sa place** (la boîte calculée sur la
  géométrie tournée : la leçon de la lanterne d'automne).
- `src/persos.js` : l'espèce `renne` (bois, nez, grelot au cou ; cri « grelot »), les quatre pièces (bonnet rouge = `bonnet` recoloré ;
  `foulard` rayé ; `sweat` aux flocons ; `chaussures` de feutre), l'aura `flocons` ; `src/equipe3d.js` : le boulanger 3D les porte
  (≤ 10 500 triangles) ; `src/garderobe.js` : `PERSOS.TENUES.avent` (formes, palettes).
- `src/icons.js` : `ICONS.AVENT` (le fond, la porte de case, les 8 friandises × 3 teintes, le ruban, `ICONS.UI.avent` : une petite porte
  étoilée), `ICONS.flocon(n)`, `ICONS.UI.piste` d'hiver (un flocon), le renne, les pièces dessinées, `ICONS.CARNET.avent` et `piste-hiver`.
- `src/chaine.js` : familles `avent` (« Le calendrier de l'Avent 2026 », lit `AVENT.possede`) et `piste-hiver`, **en dernier** ;
  `OBTENIR_TENUE.avent` « Le calendrier de l'Avent, cases 5, 11, 17 et 24 ».
- Vignettes : 18 (12 décos, 4 pièces, l'aura, le renne) — § 9.3.

### 7.2 Livraison 2 (C)
- `src/boutiquenoel.js` : `BOUTIQUE_NOEL`, **la même API** que `BOUTIQUE_MARCHE`. Le Chalet : **le soir d'hiver** (17 h, la nuit tombe tôt) ;
  le comptoir en chalet de bois au toit enneigé, guirlandes lumineuses chaudes, un sapin de place, la neige qui tombe derrière la vitrine, le
  chaudron de chocolat qui fume ; les clients : enfants chibis **déguisés** (bonnet de lutin, bois de renne, bonhomme de neige, sapin, pain
  d'épices, ours polaire, pingouin, étoile, casse-noisette) et une écharpe ; l'équipe : les huit lutins (bonnet pointu, tablier) ; l'ourson blanc
  sur le comptoir. Apparitions : flocon, boule, cadeau, **au temps réel** (§ 10.2).
- **HD** (lot `noel` de `src/hd.js`, `fournil/hd/noel/`) : seulement du **CC0** — Kenney **Holiday Kit** (sapins, cadeaux, bonhommes de neige,
  sucres d'orge, guirlandes), Kenney Food Kit, KayKit Restaurant/Furniture (déjà sur la branche `rendu-assets`), les personnages du lot
  `hantee3` reteints ; cuits en couleurs de sommets, fusionnés (`outils/noel/faire-hd.mjs`, copie de `outils/marche/faire-hd.mjs`), ≤ 0,8 Mo avec
  les personnages. Si le téléchargement est refusé (proxy) : l'éco suffit pour la mise en ligne.
- `src/persos.js` : forme `lutin`, les 9 costumes (`PERSOS.DEGUISEMENTS` de Noël), l'espèce `ours-blanc`, l'aura `aurore` ; `src/equipe3d.js`,
  `src/garderobe.js` (`noel`, `noel-or`, `noel-couronne`) ; `src/icons.js` `ICONS.NOEL` (sucre d'orge, 8 douceurs, 4 coups de pouce, 3 apparitions,
  palier, livre, chalet, `H1`, `monstres` : les 9 costumes), `ICONS.UI.noel` ; `src/scene.js` `decosNoel`, `NDECO`, `decosNoelVues` ;
  `src/vie.js` `DECORS.noel` ; `src/meubles.js` `MEUBLES.noel` + 7 décos ; `src/chaine.js` famille `noel`, `OBTENIR_TENUE.noel*` ; `src/sons.js`
  `JEUX.noel` (les sons neutres ; option : un grelot CC0) ; la vidéo `outils/annonce-noel/video.cjs` → `fournil/media/noel.mp4` (≤ 1,5 Mo,
  H.264 muette) et `noel-affiche.jpg` (≤ 80 Ko).
- Vignettes : 18 (7 décos, 9 pièces, l'aura, l'ourson) — § 9.3.

---

## 8. Les simulations (reproductibles, `outils/noel/`)

| Outil | Ce qu'il mesure | Durée (4 cœurs) |
|---|---|---|
| `proto.js` | le prototype du Marché de Noël : `src/marche.js` lu sur le disque, dates, ouvertures, graine, id remplacés | — |
| `rythme.js [--vite] [--reel] [--plancher] [--json f] [--table "{…}"]` | paliers des 4 profils (8 graines), enveloppe (12+12 marathons), marges | ~2 min 40 |
| `avent.js` | la référence des règles de l'Avent et ses 13 scénarios (`node outils/noel/avent.js`) | < 1 s |
| `saison-proto.js` | le moteur des saisons avec les deux changements du § 3.2, et la fiche d'automne dessus | < 1 s |
| `hiver.js [--piste] [--longevite] [--crans N] [--titre X] [--graines …] [--departs …] [--profils …] [--variantes …] [--lots-avent f] [--lots-hiver f] [--json f]` | la piste d'hiver et l'Avent sur 5 profils et 4 nouveaux joueurs ; la longévité | 2 min ; 4 à 8 min |
| `sql-v70.cjs <pglite>` | le patch v7.0 dans PGlite | ~40 s |
| `poids.cjs [A] [B]` | ce qu'un lot a coûté à la page, fichier par fichier, compressé comme build.js (terser 5.51.2) | ~30 s |
| `vignettes-budget.cjs <brut> [n]` | la place restante des vignettes, le coût d'une vignette selon la qualité, sur de vrais rendus | ~5 s |

### 8.1 Le rythme du Marché de Noël (`rythme-resultats.txt`)
| Profil | min/j | plus haut (médiane, étendue) | le 12e | par jour (graine 1) | sucres d'orge (médiane) |
|---|---|---|---|---|---|
| occasionnel | 17 | 10 (10-10) | — | 1 1 2 2 2 1 1 0 | 1,6e14 |
| quotidien | 60 | 14 (14-14) | jour 5 | 3 3 3 2 2 1 0 0 | 2,2e15 |
| assidu | 120 | 16 (16-17) | jour 4 | 3 3 3 3 2 2 0 1 | 5,4e15 |
| très actif | 480 | 20 (le 20e le 8e jour) | jour 4 | 3 3 3 3 2 2 2 2 | 9,6e16 |

### 8.2 La piste d'hiver et l'Avent (`hiver-piste-resultats.txt`, `.json`)
Le joueur de `test/longevite.js` parti le 1er nov. (déjà là ; il joue aussi la piste d'automne), récompenses versées (boosts lancés aussitôt).

| Profil | XP d'hiver | crans | finie | titre | Avent (le 24 / le 31, au plus par jour) | automne |
|---|---|---|---|---|---|---|
| occasionnel 17 min, 4 j/7 | 1 415 | 31/46 (67 %) | — | non | 22 / 24, 2 | 16/22 |
| quotidien 1 h | 2 245 | 46/46 | **31 déc.** | non | 24 / 24, 1 | 22/22 le 25 nov. |
| assidu 2 h | 2 475 | 46/46 | 27 déc. | oui | 24 / 24 | 22/22 le 23 nov. |
| très actif 8 h | 2 705 | 46/46 | 24 déc. | oui | 24 / 24 | 22/22 le 21 nov. |
| (repère) occasionnel 7 j/7 | 1 920 | 42/46 | — | non | 24 / 24 | 22/22 le 30 nov. |
| occasionnel, nouveau le 1er déc. | 1 265 | 28/46 | — | non | 22 / 24, 2 | — |
| quotidien, nouveau le 1er déc. | 2 245 | 46/46 | 1er janv. | non | 24 / 24 | — |
| occasionnel, nouveau le 15 déc. | 850 | 18/46 (39 %) | — | non | 10 / 14, 2 | — |
| quotidien, nouveau le 15 déc. | 1 535 | 34/46 (74 %) | — | non | 20 / 24, 2 | — |

Sources du quotidien : objectifs 510, journées 340, défis 375 (cinq semaines), série 330, paliers du Marché de Noël 280, arrière-salle 170,
Avent 240 ; de l'occasionnel 4 j/7 : objectifs 300, journées 200, défis 375, série 100, paliers 200, Avent 240. L'XP dépend peu de
l'avancement du joueur (des sources plafonnées par jour), sauf le défi de la semaine : l'occasionnel en réussit 3 à 5 sur 5 selon sa
partie (avec les lots de la v1, plus généreux, il n'en faisait que 3 : 28/46) ; d'où **61 à 67 %** (§ 15.3). Le quotidien arrivé le 1er déc.
finit le 1er janv. (le 31 déc. pour celui arrivé en novembre).

### 8.3 La longévité (`hiver-longevite-resultats.txt`, `hiver-longevite-occasionnel-8graines.txt`, les essais écartés : `hiver-longevite-essais.txt`)
Les joueurs de `test/longevite.js` aux trois départs qui voient décembre : le 5 oct. (91 jours, jusqu'au 4 janv. ; ses garde-fous de fin de
partie, réglés pour 60 jours, ne s'y lisent pas), le 1er nov. et le 1er déc. (60 jours, tous les garde-fous). Trois parties chacun : **sans**
(la piste d'automne versée : le jeu d'aujourd'hui), **avec l'Avent**, **avec tout** (Avent + piste d'hiver) ; étoiles versées, boosts **lancés
aussitôt** (le pire cas). Le joueur simulé ouvre une boutique sur des seuils : une partie seule est chaotique (une étoile de plus, un boost de
30 min, décalent une ouverture et changent les étoiles de la fin de plusieurs pour cent). D'où, nouveau au point 7 : **chaque partie rejouée
sur 4 graines du hasard de `test/longevite.js`, les résumés moyennés**, et le bruit mesuré (une étoile de plus le 2, 8, 14 ou 20 déc.).

| Départ, profil | Avent / crans d'hiver | boutiques | franchise | étoiles j30 (sans → tout) | étoiles fin (sans → Avent → tout) | bruit d'1 ★ |
|---|---|---|---|---|---|---|
| 5 oct., occasionnel (91 j) | 24 / 26 | 19,8 → 19,5 | j21,3 → j21,3 | 1 399 → 1 399 | 16 760 → 15 887 → 15 905 (−5,1 %) | 5,3 % |
| 5 oct., régulier (91 j) | 24 / 46 | 21,3 → 21,3 | j21 → j21 | 2 471 → 2 471 | 18 732 → 18 710 → 18 724 (−0,0 %) | 0,1 % |
| 5 oct., assidu (91 j) | 24 / 46 | 22,3 → 22,3 | j18,5 → j18,5 | 4 174 → 4 174 | 23 310 → 23 333 → 23 368 (+0,2 %) | 0,0 % |
| 1er nov., occasionnel | 24 / 27 | 17 → 17 | j21,8 → j21,8 | 1 440 → 1 440 | 8 557 → 8 480 → 8 610 (+0,6 %) | 5,4 % |
| 1er nov., régulier | 24 / 44 | 18,3 → 18,3 | j20,5 → j20,5 | 2 443 → 2 443 | 10 842 → 11 529 → 10 916 (+0,7 %) | 0,1 % |
| 1er nov., assidu | 24 / 46 | 20,5 → 20,5 | j18,8 → j18,8 | 3 972 → 3 972 | 15 904 → 15 986 → 15 960 (+0,4 %) | 0,1 % |
| **1er déc., occasionnel** | 24 / 28 | 17,5 → 16,8 | **j25,8 → j22,5** | **1 115 → 1 512 (+35,6 %)** | 8 199 → 8 056 → 8 362 (+2,0 %) | 14,4 % |
| 1er déc., régulier | 24 / 46 | 19,5 → 19,5 | j19 → j19,3 | 2 595 → 2 594 | 12 003 → 11 664 → 11 882 (−1,0 %) | 5,5 % |
| 1er déc., assidu | 24 / 46 | 20,3 → 19,5 | j18,8 → j17,8 | 4 392 → 4 468 (+1,7 %) | 14 717 → 14 681 → 15 074 (+2,4 %) | 4,7 % |

**Verdict.** Pour tous les joueurs déjà là (départs du 5 oct. et du 1er nov.) et pour le régulier et l'assidu arrivés le 1er déc. : **aucun
effet notable** (au plus 2,4 %, sous le bruit ; boutiques, première boutique et franchise inchangées à la journée près), tous les garde-fous
`CIBLES` de `test/longevite.js` tenus. **Une exception, voulue modeste** : l'occasionnel (17 min par jour) arrivé le 1er décembre a plus
d'étoiles au 30e jour (+35,6 % sur 4 graines ; **+16,9 % sur 8 graines**, 1 251 → 1 462, `hiver-longevite-occasionnel-8graines.txt`), plus
rien au 60e (+0,4 %), sa franchise 1,2 jour plus tôt (8 graines) : il partait plus lentement que les joueurs d'octobre et de novembre
(franchise j21 à j22) et les rejoint ; garde-fous tenus. L'outil, qui garde les seuils du point 6 (6 % au-delà du bruit), écrit donc
« À REVOIR » à cause de lui seul : au joueur de trancher (§ 15.1). Les essais écartés : la v1 (Avent 19 ★ 4 boosts, hiver 27 ★ 8 boosts) :
+49 % au 30e jour pour ce même joueur (4 graines), +17,8 % à la fin pour l'assidu du 1er déc. (1 graine) ; l'Avent de la v1 sans ses boosts ou
sans ses étoiles : autant d'effet l'un que l'autre (le chaos des seuils), d'où l'allègement des deux.
`node test/longevite.js --test` (inchangé) : vert (aucun fichier du jeu n'est touché).

---

## 9. Le poids

### 9.1 Ce qu'a coûté le point 6 (mesuré : `outils/noel/poids.cjs b5202a1 e134eea`)
+230,7 Ko compressés : `marche.js` +47,7, `boutiquemarche.js` +44,0, `icons.js` +28,8, `ui.js` +18,0, `meubles.js` +17,5, `evenement.js` +13,6,
`style.css` +13,3, `persos.js` +11,9, `saison.js` +9,7, `equipe3d.js` +7,8, `scene.js` +4,2, `game.js` +3,0, le reste < 2,5 chacun. Une part
(ui, evenement, style) généralisait le moteur d'écran : elle ne se repaie pas.

### 9.2 L'estimation du point 7 (compressé, comme `build.js`)
| Livraison | Estimation | Détail |
|---|---|---|
| 1 : Avent + hiver | **≈ +55 Ko** | `avent.js` 5, `saison.js` +0,6, `saison-hiver.js` 2,5, `game.js` +2,5, `ui.js` +8, `style.css` +5, `icons.js` +8 (calendrier, friandises, flocons), `meubles.js` +12 (12 décos), `persos.js` +4, `equipe3d.js` +3, `chaine.js`/`garderobe.js`/`vignettes.js`/`nouveautes.js`/`page.html` +4 |
| 2 : Marché de Noël, **avec la fabrique** (§ 4.1) | **≈ +135 Ko** | `noel.js` 14, `boutiquenoel.js` 35 (la copie élaguée de ce que le Chalet n'emploie pas), `icons.js` +25, `meubles.js` +18, `persos.js` +10, `evenement.js` +6, `ui.js` +6, `style.css` +5, `equipe3d.js` +6, `scene.js` +3, `game.js` +3, le reste +4 |
| 2, en copiant comme au point 6 | ≈ +225 Ko | `noel.js` 48, `boutiquenoel.js` 44, le reste comme le Marché |
| **Page** | **2 046 → ≈ 2 240 Ko** (copie : ≈ 2 325) | borne 3 000 Ko (`test/fournil-hantee-annonce.cjs`) : ≈ 760 Ko de marge ; l'artefact ≈ 2,75 → 2,95 Mo (borne 3,9) |

**La proposition** : (1) la fabrique pour les règles (−34 Ko, et une seule copie du moteur à entretenir) ; (2) `src/boutiquenoel.js` copié
mais **élagué** (C supprime ce que le Chalet n'emploie pas : ≤ 35 Ko compressés) ; (3) les friandises et les flocons **dessinés** (pas de
vignettes, pas d'état) ; (4) aucune image ni vidéo dans la page (la vidéo dans `fournil/media/`, la HD dans `fournil/hd/noel/`, chargées à la
demande : hors de la page) ; (5) chaque constructeur mesure son lot avec `outils/noel/poids.cjs <avant> HEAD` et l'écrit au § 14 ; au-delà de
+80 Ko (L1) ou +170 Ko (L2), il s'arrête et le dit. Plus tard (pas nécessaire) : la Maison hantée sur la même fabrique (−35 Ko).

### 9.3 Les vignettes : elles ne tiennent pas en l'état
`fournil/img/carnet/` : 203 vignettes, **1 503,4 Ko** sur 1 536 : **reste 32,6 Ko**. Mesuré sur les 27 vrais rendus du Marché
(`outils/noel/vignettes-budget.cjs`) : une vignette 256 × 256 coûte 8,2 Ko en qualité 70/alpha 80, 6,3 en 55/72, **5,4 en 50/65**, 5,1 en 45/60.
Le point 7 en apporte ≈ **36** (L1 : 18, L2 : 18) : ≈ 195 Ko en 50/65. La proposition (A, Livraison 1, dans `outils/vignettes/cuire.cjs`) :
**recuire tout le carnet en qualité 50, alpha 65** (≈ −35 % sur les 1 300 Ko d'avant le Marché, ≈ −450 Ko) et cuire les nouvelles pareil ;
contrôle à l'œil sur la planche (44 et 64 px, grisé), `test/fournil-vignettes.test.js` vert ; le service worker remplace chaque vignette à sa
prochaine vue (nouvelle empreinte). Le dossier finirait vers **1 250 Ko**. Repli si la planche déçoit : relever la borne à 2 Mo dans le test
(le dossier n'est pas dans la page ; il se charge à la vue) — **au joueur de choisir** (§ 15.2).

---

## 10. Les leçons du Marché d'automne (à lire avant de coder)

1. **Les tests tiennent sur les machines lentes de GitHub.**
   - `FOURNIL_CPU=n` ralentit le processeur de chaque page n fois (CDP `Emulation.setCPUThrottlingRate`) : essayer **en local avec 4 et 6** avant
     de pousser (les échecs du 7 nov. ne se voyaient qu'ainsi). `FOURNIL_ATTENTE=k` multiplie toutes les attentes (3 par défaut sous CI).
   - **Toute attente s'arrête dès que la condition est vraie** : `attendre(fn, ms, pas)` (`test/fournil-marche-activites.cjs`), jamais un
     `sleep` fixe pour « laisser le temps » ; un délai long ne coûte rien quand tout va bien.
   - **Jamais une fausse horloge qui avance `Date` et `performance.now()` sans l'horodatage de `requestAnimationFrame`** : `faux(d)` de
     `test/fournil-marche-activites.cjs` enveloppe `requestAnimationFrame` (`cb(t + plus)`) ; sans cela ui.js (qui mêle `performance.now()` et
     l'horodatage de rAF) voyait chaque image « trop tôt » et gelait (7 nov.). Avancer par images (`__avancerParImage(total, pas)`, ≤ 5 s par
     image : au-delà le jeu croit la page gelée et compte un retour).
   - Les tests de l'Avent et de la saison changent de **jour** (le 5 → le 6 déc.) : par `HORLOGE` fixée (comme `test/fournil-saison.cjs`),
     jamais en avançant la fausse horloge de 24 h.
2. **La scène des apparitions avance au temps réel** (fbff2d7, 102020c) : une apparition suit le temps écoulé depuis sa naissance (jamais moins
   que `dt`), pas le `dt` plafonné à 0,25 s d'ui.js ; la visée couvre le chemin des trois dernières images (2,5 s au plus). Le Chalet le reprend
   tel quel (`boutiquenoel.js` copie ces deux fonctions).
3. **Les budgets de dessin** (mesurés par `test/fournil-marche-boutique.cjs`, à reprendre pour le Chalet) : éco, le décor ≤ 72 appels ; haute
   ≤ 120 appels, ≤ 8 lumières, processeur ×4 médiane < 40 ms par image ; trois allers-retours sans que la mémoire monte (géométries, textures) ;
   une déco posée seule = 1 appel (2 avec une lueur), ≤ 3 000 triangles ; dans la boutique, toutes les décos d'événement posées ≤ 72 appels (éco),
   ≤ 80 (haute) ; le boulanger 3D ≤ 10 500 triangles. **L'ambiance de la pièce (PMREM)** réglée phase par phase (la Halle était délavée à 1 ;
   0,3 / 0,2 / 0,1) : le Chalet du soir ≤ 0,2.
4. **Les vignettes** : `outils/vignettes/cuire.cjs` (deterministe, `--seulement famille/*` pour un tour partiel), ≤ 12 Ko chacune, dossier
   ≤ 1,5 Mo : **la place est déjà prise** (§ 9.3) ; une déco recuite change d'empreinte.
5. **Une déco tient dans sa place** : la boîte d'une déco se calcule sur les boîtes de ses pièces ; une pièce tournée par sa matrice gonfle la
   boîte (la lanterne d'automne : +41 %) : tourner dans la géométrie. `test/fournil-decos.cjs` en 390 × 844 et 360 × 640.
6. **Les noms déjà pris** : `.mc` (le casino), `.marche` (une pastille), `pingouin`, `croquembouche`, `sapin`, `guirlande`, `buche` : grep
   avant de nommer (§ 1).
7. **Les tests lisent les textes de la fiche**, jamais une copie : dix échecs du Marché venaient de phrases du Manoir restées dans les tests.
8. **Simuler sur le vrai moteur, récompenses versées** : l'outil du point 6 annonçait 13/22 pour l'occasionnel, le vrai moteur 10/22 (les
   récompenses changent le joueur). Ici `outils/noel/hiver.js` verse tout ; A refait la piste sur `src/saison-hiver.js` dans
   `test/fournil-saison.test.js`, et la longévité **avec plusieurs graines moyennées** (une partie seule est chaotique : § 8.3).
9. **L'horloge** : une saison finie ne se rouvre jamais (`passees`) ; un nouveau joueur qui franchit un seuil avant l'ouverture attend
   l'ouverture (`pisteAttend`) ; l'Avent lit l'heure sûre (§ 2.2).
10. **La grammaire** : « du Marché de Noël » (`deEvt`), jamais « de le ».
11. **Le fond de l'écran en mode boutique est transparent** (`#noel.nx-boutique`) : un test qui veut le fond crème le lit hors boutique
    (`?boutique=0`).
12. **Nouveautés** : datée du jour de la mise en ligne (le test refuse une date d'avance), après les entrées des autres lots.
13. **Opération Poncin a quitté le dépôt** : `node build.js` ne doit réécrire que `fournil/index.html`, `dist/artifact.html` (et l'essai) ;
    s'il touche autre chose, le remettre. Jamais `zombies/` ni `src-zombies/`.
14. **Pousser souvent** (le conteneur redémarre) : commit + `git push origin <branche>` après chaque étape ; une poussée sur master relance
    toute la CI (~45 min) : regrouper.

---

## 11. Contrat par fichier

**Fichiers partagés** (un seul les édite à la fois, fusion soignée) : `build.js` (A), `.github/workflows/pages.yml` (B, à la fin, toutes les
lignes d'un coup), `src/page.html` et `src/style.css` (B), `src/icons.js` (B en L1, C en L2), `src/game.js` (A), `src/chaine.js` (A en L1, C en
L2), `src/ui.js` (B), `src/classement.js` (A). **Ordre** : A pousse le jour 1 des **amorces** (`src/avent.js` complet ou presque, les deux
changements de `src/saison.js`, `src/saison-hiver.js`, `build.js` avec l'ordre final ; en L2 : la fabrique, `src/noel.js`, `src/boutiquenoel.js`
vide qui rend `actif() → false`) ; B et C partent de là.

### LIVRAISON 1 — l'Avent et la saison d'hiver (en ligne au plus tard le sam. 28 nov. ; 2 constructeurs)

**A — règles et objets**
- `src/avent.js` (§ 2 ; la référence `outils/noel/avent.js` : mêmes fonctions, mêmes lots ; plus `vue`, `possede`, `aVerser`, `ORDRE_CASES`,
  `FRIANDISES`) ; global `AVENT`, `module.exports`.
- `src/saison.js` : les deux changements (§ 3.2), rien d'autre ; `src/saison-hiver.js` (§ 3.1, 3.3).
- `src/game.js` : `GARDEROBE` (`avent-*`, ensemble `avent` sans bonus), `AURAS.flocons`, `DISTINCTIONS['flocon-or-2026']`, `COMPAGNONS.renne`,
  `ACCUEIL.deblocages` + `avent` (bit 16) ; `newState` inchangé.
- `src/classement.js` : `TITRES['flocon-or-2026']`.
- `src/meubles.js` : les 12 décos (§ 4.7, § 7.1) ; `src/chaine.js` : familles `avent`, `piste-hiver`, `OBTENIR_TENUE.avent`.
- `outils/vignettes/cuire.cjs` (la recuisson § 9.3, les 18 nouvelles), `src/vignettes.js`, `fournil/img/carnet/`.
- `build.js` : `… 'saison.js', 'saison-automne.js', 'saison-hiver.js', 'avent.js', …`.
- Tests : `test/fournil-avent.test.js`, `test/fournil-saison.test.js` (l'hiver ajouté), `test/fournil-saison-sim.js` (l'hiver, l'Avent),
  les nouvelles décos dans `test/fournil-decos.cjs`, `test/fournil-vignettes.test.js` vert.

**B — écran et personnages**
- `src/ui.js` (§ 2.6, § 6.1 : la carte `#avent`, la feuille-calendrier, l'annonce de décembre, `AVENT.ouvrir`+`verser` dans le même geste,
  `aVerser` au lancement, l'accueil `avent`, `window.__avent`, `__fournil.avent: { etat, ouvrir, vue, feuille }`) ; l'écran de la piste (46 crans,
  la source Avent, les flocons) ; `src/page.html` (`#avent`, `#av-feuille`), `src/style.css` (360 × 640 sans défilement horizontal),
  `src/nouveautes.js`.
- `src/icons.js` (§ 7.1), `src/persos.js` (le renne, les quatre pièces, l'aura), `src/equipe3d.js`, `src/garderobe.js` (`PERSOS.TENUES.avent`),
  `src/sons.js` (le son d'ouverture d'une case : un carillon CC0 ou un son existant).
- Tests : `test/fournil-avent.cjs`, `test/fournil-saison.cjs` (l'hiver ajouté), `test/fournil-garderobe.cjs`, `test/fournil-equipe3d.cjs`,
  `test/fournil-compagnons.cjs` (le renne) ; `pages.yml`.

### LIVRAISON 2 — le Marché de Noël et le SQL v7.0 (en ligne au plus tard le mer. 16 déc. ; 3 constructeurs)

**A — règles et serveur**
- `src/marche.js` : la fabrique (§ 4.1) **d'abord**, avec la trace figée (`test/fournil-marche-trace.json`) et la Halle verte ; puis `src/noel.js`
  (§ 4.2 à 4.6 ; `PROFILS`, `simuler`).
- `src/game.js` (§ 4.7 : `noel-*`, `noel-or-*`, `noel-couronne`, ensembles, `AURAS.aurore`, `DISTINCTIONS['legende-noel']`, `COMPAGNONS['ours-blanc']`).
- `src/classement.js` : `EVTS = ['hantee', 'marche', 'noel']`, `NOMS_EVT.noel`, `TITRES['legende-noel']`, la photo `dn`, `decosNoel`.
- `supabase/fournil-classement-v70.sql` (la table confirmée sur les vraies règles), `supabase/fournil-classement.sql` (« Version 7.0 »),
  `test/fournil-classement-v69-complet.sql`, `supabase/README.md`.
- `build.js` : `… 'hantee.js', 'marche.js', 'noel.js', 'boutiquehantee.js', 'boutiquemarche.js', 'boutiquenoel.js', 'hanteeactivites.js', …`.
- Tests : `test/fournil-noel.test.js`, `test/fournil-noel-graines.js`, la trace de la Halle dans `test/fournil-marche.test.js`, la section
  v7.0 de `test/fournil-classement-sql.cjs`.

**B — écran**
- `src/evenement.js`, `src/ui.js`, `src/page.html`, `src/style.css`, `src/nouveautes.js` (§ 6.2).
- Tests : `test/fournil-noel.cjs`, `test/fournil-noel-activites.cjs` (calqué **geste pour geste** sur `test/fournil-marche-activites.cjs`) ; `pages.yml`.

**C — scène, décos, vignettes**
- `src/boutiquenoel.js`, `src/scene.js`, `src/vie.js`, `src/meubles.js` (`MEUBLES.noel`, 7 décos), `src/persos.js`, `src/icons.js`, `src/hd.js`
  (lot `noel`), `src/sons.js`, `src/garderobe.js`, `src/equipe3d.js`, `src/chaine.js` (famille `noel`), `outils/vignettes/` (les 18),
  `fournil/hd/noel/`, `outils/noel/faire-hd.mjs`, `outils/annonce-noel/video.cjs`, `fournil/media/noel.mp4`, `noel-affiche.jpg`.
- Tests : `test/fournil-noel-boutique.cjs` (calqué sur `test/fournil-marche-boutique.cjs`), les décos dans `test/fournil-decos.cjs`.

---

## 12. Les tests à écrire

**Node** (`TZ=Europe/Paris`) :
1. `test/fournil-avent.test.js` (L1) : les 13 scénarios de `outils/noel/avent.js` joués sur `src/avent.js` (fermé le 30 nov. 23 h 59 ; le 1er à
   0 h ; jamais deux fois ; jamais une future ; la case du jour + une oubliée, pas deux ; heure sûre en retard → fermé / la case attend ;
   horloge qui recule → pas de rattrapage ; du 25 au 31 un par jour ; rangé le 1er janv.) ; `LOTS` = la table § 2.3 (8 ★, 3 boosts, spéciales
   6/12/18/24) ; réparation (`null`, `[]`, `'x'`, `{ o: -1, r: 3 }`, `{ id: 'avent-2031' }`) ; `verser` (étoiles, boost en réserve, la pièce dans
   la garde-robe ; le renne, l'aura, les décos par `possede`) ; `aVerser` ; le déblocage `avent` (bit 16, fenêtre) ; la simulation des
   ouvertures (occasionnel 4 j/7 : 22 le 24, 24 le 31 ; jamais plus de deux par jour) ; `AVENT` et `outils/noel/avent.js` rendent la même chose
   sur 1 000 scénarios tirés (les cases, les jours, l'heure sûre).
2. `test/fournil-saison.test.js` (L1, en plus de l'automne) : 46 crans acceptés, 51 refusés ; une piste d'automne (`recus < 2²²`) lue à
   l'identique ; `recus` = 2⁴⁶ − 1 réparé tel quel, 2⁵⁰ refusé ; les lecteurs (un lecteur qui jette compte 0 ; l'Avent : 10 XP par case,
   une fois) ; `SAISONS.active` aux bornes (30 nov. 23:59:59 → automne ; 1er déc. 0 h → hiver ; 3 janv. 23:59:59 → hiver ; 4 janv. 0 h → rien) ;
   **l'enchaînement** (dus d'automne rangés, hiver ouvert au même pas, le défi du 30 nov. pas recompté, la feuille de fin avant l'annonce) ; le
   recul d'horloge du 1er déc. ; la piste simulée sur le vrai moteur (quotidien finie du 30 déc. au 1er janv., occasionnel 4 j/7 de 50 à 70 %,
   très actif avant le 26, ≤ 13 ★ et ≤ 4 boosts) ; **la longévité** avec 4 graines moyennées (§ 8.3, les seuils de `outils/noel/hiver.js`).
3. `test/fournil-noel.test.js` (L2) : la fabrique (l'API de `NOEL` = celle de `MARCHE` clé pour clé, mêmes types) ; la fenêtre (18 déc. 12 h →
   25 déc. 20 h, 8 jours, grâce, onglet jusqu'au 8 janv. ; aucun chevauchement des trois événements) ; la fiche (ids uniques, 8 recettes,
   17 Astuces, 20 paliers, 9 sortes, 8 recettes du jour, récompenses § 4.5) ; `st.noel` réparée ; le rythme (8 graines : 9-11, 13-15, 15-17,
   20 le jour 8) ; l'enveloppe (la ligne `'noel'` lue dans le SQL : marathon ≥ ×2,2 dessous sur 10 graines, Astuces offertes, ≤ ×20 après 7 h 15,
   croissante, jamais sous la ligne `'marche'`, la fenêtre du SQL = celle du jeu).
4. `test/fournil-marche.test.js` (L2) : la trace figée de la Halle, octet pour octet, après la fabrique.
5. `node test/longevite.js --test` inchangé, vert.

**PGlite** : la section v7.0 de `test/fournil-classement-sql.cjs` (= `outils/noel/sql-v70.cjs` transposé, sur `test/fournil-classement-v69-complet.sql`).

**Playwright** (Chromium préinstallé, un par un, `NODE_PATH=/opt/node22/lib/node_modules`, jamais `playwright install` ; essayés aussi avec
`FOURNIL_CPU=4` et `6`) :
1. `test/fournil-avent.cjs` (L1, 390 × 844, `window.__avent = true`, `HORLOGE` fixée au 5 déc. 2026 10 h puis au 6, au 25, au 1er janv.) : la
   carte et sa pastille, l'annonce de décembre (une seule, après la fin d'automne), la feuille (24 cases, l'ordre mélangé, la case du jour qui
   luit, 360 × 640 sans défilement horizontal), ouvrir la case 5 (le bonnet dans la garde-robe, +10 XP dans la piste), rattraper la 3 (le
   ruban disparaît des autres), refus d'une seconde, la future (« Patience ! »), le 6 : le renne dans Les compagnons, la heure sûre en retard
   (le message), le 25 : un rattrapage, le 1er janv. : la carte disparaît, Mes décos (famille Avent) ; une vieille sauvegarde sans `st.avent` ;
   un nouveau joueur (`__accueil = true`) : carte cachée puis la bulle au déblocage ; aucune erreur de page.
2. `test/fournil-saison.cjs` (L1) : le 1er déc. à 0 h la feuille de fin d'automne puis l'annonce de décembre ; la piste d'hiver (46 crans, la
   ligne Avent, un flocon reçu, « Mes flocons »), le titre « Flocon d'or 2026 » ; le 4 janv. la feuille de fin d'hiver.
3. `test/fournil-noel.cjs` (L2, le sam. 19 déc. 2026 à 11 h) : comme `test/fournil-marche.cjs` (l'icône, l'annonce, entrer, **le tiroir du
   Manoir** en 390 × 844, 375 × 812, 360 × 640 : trois crans, poignée et barre, la liste défile, tirée vers le bas en haut la referme), les
   paliers (« s'ouvre dimanche 20 »), l'onglet « Noël » (Supabase simulé : `p_evt: 'noel'`), le bilan après le 25 à 20 h, la place d'acharné, la
   tenue en or, « du Marché de Noël » ; la Halle et le Manoir restent lisibles.
4. `test/fournil-noel-activites.cjs` (L2) : geste pour geste `test/fournil-marche-activites.cjs` (la même fausse horloge **avec rAF**), haute puis éco.
5. `test/fournil-noel-boutique.cjs` (L2, C) : le Chalet en haute et en éco, budgets (§ 10.3), décos posées, la visite d'un copain (photo `dn`).

**CI** (`.github/workflows/pages.yml`) : L1 : `node test/fournil-avent.test.js` dans la ligne « deploy » et celle de l'essai (`fournil-saison.test.js`
y est déjà) ; `fournil-avent.cjs` dans `fournil2` (`PORT_AVENT: '8898'`) ; L2 : `node test/fournil-noel.test.js` (deploy, essai) ;
`fournil-noel.cjs` dans `fournil2` (`PORT_NOEL: '8899'` ; sa limite à 45 min si besoin) ; `fournil-noel-activites.cjs` dans une **nouvelle tâche**
`fournil14` (comme `fournil13`, `PORT_NOEL_ACTIVITES: '8900'`), dans les `needs` du déploiement ; `fournil-noel-boutique.cjs` (8964) à côté de
`fournil-marche-boutique.cjs` (hors tâche, comme lui). Ports vérifiés libres le 9 nov.

### Les captures attendues (`test/shots/avent/`, `test/shots/saison/`, `test/shots/noel/`)
L1 : la carte de l'Avent (case du jour, rien à ouvrir) · la feuille-calendrier le 1er, le 5 (un rattrapage), le 24 (tout ouvert), en 390 × 844
et 360 × 640 · l'ouverture d'une case ordinaire et d'une spéciale (le renne) · le refus « Patience » · l'annonce de décembre · la feuille de fin
d'automne · la piste d'hiver (cran 0, 13, 46, titre), un flocon, Mes flocons · Mes décos (familles Avent, Saison d'hiver) · la garde-robe
(tenue de Noël) · le boulanger 3D en tenue de Noël avec l'aura des flocons · le renne dans la boutique · les 12 décos posées.
L2 : l'annonce du Marché de Noël · le Chalet en haute (17 h) et en éco · tiroir haut / mi / fermé · paliers · livre des costumes (bronze,
argent) · une fête · la commande du réveillon · les trois mini-jeux · bilan · onglet « Noël » · « Tu as fini 7e du Marché de Noël » · la tenue
de lutin, en or, la couronne · l'ourson blanc sur le comptoir · les décos posées.

---

## 13. Risques et parades
- **Le calendrier serré** (L1 : 19 jours, deux constructeurs, des objets 3D sans constructeur C) : les décos procédurales simples d'abord
  (une silhouette juste, 1 appel), les vignettes en dernier ; si le 26 nov. tout n'y est pas, livrer l'Avent et la piste avec les objets
  dessinés (le repli des vignettes) plutôt que rien.
- **Un bug de l'Avent après le 1er déc.** : il ne doit jamais retirer une case ; un correctif ne relit que `o` et `r` ; un lot non versé se
  rattrape par `aVerser`. Mettre en ligne **avant** le 28 nov. laisse deux jours pour un correctif.
- **La fin d'automne et l'annonce de décembre le même lancement** : la file (§ 2.6), testée.
- **La fabrique de `src/marche.js`** (L2) : la trace figée d'abord ; si elle bouge, revenir à la copie (+34 Ko, § 4.1).
- **Le SQL pas collé le 18 à midi** : sans gravité (§ 5.5) ; le rappeler au joueur le 16 et le 17.
- **Les vignettes** : la recuisson change toutes les empreintes (un téléchargement d'≈ 1,2 Mo étalé sur les vues du carnet) ; le repli
  (borne à 2 Mo) est une ligne de test.
- **Le Chalet et la Halle en même temps dans la CI** : la Halle est finie, mais ses tests restent ; `test/fournil-marche*.cjs` verts sans
  changement (leurs dates sont fixées en novembre).
- **Décembre dans la boutique** : le sapin et la guirlande d'office (tag `'noel'`) restent ; les décos du point 7 ne les remplacent pas
  (budgets mesurés avec eux, dans `test/fournil-decos.cjs` à une date de décembre).
- **Le nouveau joueur de décembre** reçoit un coup de pouce net (§ 8.3) : voulu modeste, au joueur de trancher (§ 15.1).

## 14. Résultats recopiés et écarts
- 9 nov. (conception) : `outils/noel/rythme.js --plancher` (8 graines, 24 + 24 marathons, 155 s), `outils/noel/hiver.js --piste` (122 s) et
  `--longevite` (plusieurs réglages, § 8.3), `outils/noel/avent.js` (13/13), `outils/noel/sql-v70.cjs` (34/34), `outils/noel/poids.cjs`,
  `outils/noel/vignettes-budget.cjs`. Les résultats bruts sont à côté des outils (`*-resultats.*`).
- (les constructeurs ajoutent ici leurs écarts au contrat, datés, et le poids mesuré de leur lot)

## 15. Les questions pour le joueur (avec la recommandation)
1. **Le coup de pouce du nouveau joueur occasionnel de décembre.** Avec les lots allégés (Avent : 8 ★ et 3 boosts ; hiver : 13 ★ et 4
   boosts), les joueurs déjà là ne bougent pas, mais l'occasionnel (17 min par jour) arrivé le 1er décembre a **+17 % d'étoiles au 30e jour**
   (8 graines), qui s'effacent au 60e (+0,4 %), et sa dernière amélioration 1,2 jour plus tôt : il rejoint le rythme des joueurs arrivés en
   octobre ou novembre (il partait plus lentement), tous les garde-fous de `test/longevite.js` tenus. **Recommandé : garder** (un calendrier de
   l'Avent doit faire plaisir à qui arrive en décembre) ; sinon, l'Avent sans aucune étoile (les friandises, les décos, la tenue, le renne, les
   boosts seulement).
2. **Les vignettes du carnet** (il reste 32,6 Ko pour ≈ 195 Ko d'objets nouveaux). **Recommandé : recuire tout le carnet en qualité 50**
   (≈ −450 Ko, sans différence visible à 44 et 64 px, vérifié sur la planche par A) et garder la borne de 1,5 Mo ; sinon, relever la borne à
   2 Mo (le dossier n'est pas dans la page, il se charge à la vue).
3. **L'occasionnel quatre jours sur sept à 61-67 % de la piste d'hiver** (et non « vers la moitié ») : l'Avent, rattrapé, lui rapporte autant
   qu'au quotidien (240 XP). **Recommandé : garder 46 crans à 45 XP et 10 XP la case** (le quotidien finit le 31 déc., trois jours avant la
   fin) ; sinon 5 XP la case (l'occasionnel perd 3 crans, ≈ 55-60 %, mais le quotidien ne finit que le 2 janvier, sans marge).
