# Le Fournil — point 6 : « Le Marché d'automne » et la première saison gratuite « Automne » : contrat de conception

Choix du joueur du 4 novembre 2026. Branche `marche` (depuis origin/master b5202a1). Ce contrat est la référence des **trois
constructeurs** (règles + serveur ; écran ; scène + décos + vignettes) : le lire en entier avant de coder. Rien n'est construit dans le
jeu : seuls ce document, les outils de simulation (`outils/marche/`) et le patch SQL (`supabase/fournil-classement-v69.sql`, essayé,
pas encore recopié dans le fichier complet) sont commités.

**En une phrase.** Du vendredi 13 novembre 2026 à midi au vendredi 20 novembre à 20 h (Paris), la boutique devient « la Halle », un
marché d'automne chaleureux pour tous les âges (châtaignes, pommes, champignons, vendanges, paniers, feuilles mortes), sur le moteur
exact de la Maison hantée ; en même temps s'ouvre la première **saison gratuite**, « Automne » (jusqu'au 30 novembre 23 h 59), une piste
de 22 crans de récompenses à vie, nourrie d'XP plafonnée. La saison d'hiver (l'Avent, point 7) partira le 1er décembre sur le même module.

| | Dates (heure de Paris) | Ce qu'il faut avoir en ligne avant |
|---|---|---|
| Patch SQL v6.9 collé par le joueur | **avant le ven. 13 nov. 12 h** | — |
| Mise en ligne du jeu (master) | **au plus tard le jeu. 12 nov. au soir** (CI ≈ 45 min) | le patch, ou au pire juste après (§ 4.4) |
| Le Marché d'automne | ven. 13 nov. 12 h → ven. 20 nov. 20 h ; serveur : +1 h de grâce, podium figé à 21 h | |
| Onglet « Marché » du classement | du 13 nov. 12 h au ven. 4 déc. 20 h (fin + 14 j, comme Halloween) | |
| La saison « Automne » | ven. 13 nov. 12 h → lun. 30 nov. 23 h 59 59 | |
| La saison d'hiver (point 7) | à partir du mar. 1er déc. 0 h | une fiche `src/saison-hiver.js` |

---

## 0. Les chiffres clés (simulés : `outils/marche/`)

- **Paliers du Marché** (médiane sur 8 graines, `outils/marche/rythme-resultats.txt`) : occasionnel 17 min/j → **10** ; quotidien 1 h/j →
  **14** (le 12e le 5e jour) ; assidu 2 h/j → **16** (16 à 17 ; le 12e le 4e jour) ; très actif 8 h/j → **20**, le 8e et dernier jour (deux
  par jour à la fin). Paliers par jour : 3, 3, 3, 3, 2, 2, 2, 2.
- **Enveloppe** (ligne `'marche'` de `fournil_evts()`, pas de 6 h, 31 log10) :
  `{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.9,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05,18.1,18.15,18.15,18.2}`.
  Marathon (23 h 48/j, tout au mieux, Astuces achetées **et** offertes) : ×2,20 sous la table au plus juste (24 tirages), ×2,21 sur 24 tirages
  jamais vus, ×14,6 au plus large après 7 h 15 ; marathon le plus haut à la fin : 6,6e17 noisettes (log10 17,82). Croissante, recollable.
- **Piste « Automne »** : 22 crans de 50 XP (1 100 XP), le titre de la saison à 1 350 XP. Joueur déjà là depuis le 5 oct. : quotidien 1 h
  → **finie le 28 nov.** ; assidu 2 h → le 26 (+ le titre) ; très actif → le 24 (+ le titre) ; occasionnel 17 min 4 j/7 → **13/22 (59 %)**
  (17 min tous les jours : 18/22). Nouveau joueur le 13 : pareil ; nouveau le 20 : quotidien 13/22, occasionnel 7/22.
- **Longévité** : avec toutes les récompenses de la piste (12 étoiles, 3 boosts lancés aussitôt, 14 h de primes), les boutiques de
  `test/longevite.js` ne bougent pas (§ 8.3) ; avec 5 boosts jusqu'à ×5 (première version), le régulier parti le 1er nov. gagnait 12 %
  d'étoiles et sortait de ses garde-fous : les boosts ont été réduits.

---

## 1. Ce qu'on réutilise, et ce qui est propre à « hantee » et doit être généralisé

Le Marché est **un troisième événement générique** sur le moteur du Quartier et de la Maison hantée. Relevé dans master b5202a1 :

| Fichier | Aujourd'hui (propre à la Maison hantée) | À faire (constructeur) |
|---|---|---|
| `src/hantee.js` | les règles, dates en dur (`DEBUT`, `FIN`, `parisMs(2026, 10, 26 + p.jour, 0)` dans `OUVERTURES`), `id: 'hantee'` dans `ACT.equiper` | **copié** en `src/marche.js` (A, § 2) : même API mot pour mot, seules les données et la fiche changent |
| `src/evenement.js` l. 76 | `if (F.cle === 'hantee' \|\| F.p === 'ht') st0 = …` | `F.st0` posé pour toute fiche qui a `F.activites` (B) |
| `src/evenement.js` l. 1613-1781 | `HR`, `ficheHantee()`, `gabarits` (`.mh-*`), `habiller` (ids `#ht-eveil`, `#ht-serie`, `#ht-commande`, `#ht-bestiaire`, `#ht-cartes`), `ICONS.HANTEE`, `SCENE.decosHantee`, `BOUTIQUE_HANTEE`, `HANTEE_ACTIVITES`, la vidéo `maison-hantee.mp4` | une fabrique `ficheBoutique(R, T)` (T : l'habillage : préfixe, racine, icônes, scène, décos, sons, textes, vidéo) ; `ficheHantee()` = `ficheBoutique(HR, HABILLAGE_HANTEE)`, `ficheMarche()` = `ficheBoutique(MR, HABILLAGE_MARCHE)` ; ids `#${F.p}-…` (B) |
| `src/evenement.js` l. 920-1020 | mini-jeux dessinés selon `D.motif === 'hantee'` / `'quartier'` | un cas `'marche'` (le guet : un écureuil derrière les cagettes ; le compte : des châtaignes ; la tournée : des paniers numérotés) ; sinon les formes neutres déjà prévues (B) |
| `src/evenement.js` l. 1783-1792 | `liste = [quartier, hantee]`, `return { quartier, hantee, liste, … }` | `marche = fabriquer(MR ? ficheMarche() : { R: null })`, `liste = [quartier, hantee, marche]`, exporté (B) |
| `src/hanteeactivites.js` | `B()` = `BOUTIQUE_HANTEE`, `icoHt` = `ICONS.HANTEE`, ids `#ht-*` | la scène et les icônes lues sur la fiche (`F.scene3`, `F.ico`), les ids sur `F.p` ; `HANTEE_ACTIVITES` reste le nom (alias `EVT_ACTIVITES`) ; le Marché passe le même module (B) |
| `src/boutiquehantee.js` | la boutique hantée (HD KayKit de nuit, monstres) | **copié** en `src/boutiquemarche.js` (C, § 6) avec la même API |
| `src/ui.js` l. 723, 753 | réglage « Masquer la Maison hantée » | une ligne par événement ouvert de `EVS.liste` (`E.F.nom`, `st[E.cle].masque`) (B) |
| `src/ui.js` l. 1457-1463 | `HTE`, `HT`, `envoiHantee()` | `envoiEvenement()` : l'événement de `EVS.liste` dont `R.envoiBillets(t)` est vrai (jamais deux : fenêtres disjointes, la grâce de la Maison hantée a fini le 2 nov. 21 h) ; `{ evenement: () => ({ id, score, valeur }) }` ; garde `[cle]: …` pour chacun (B) |
| `src/ui.js` l. 1520-1524 | `ongletHantee()`, `periodes()` : l'onglet « Halloween » | les onglets de chaque `E` de `EVS.liste` dont `CLM.PERIODES` connaît `E.cle`, nom `E.R.FICHE.classement.onglet` (« Halloween », « Marché ») ; noms courts déjà gérés (> 3 onglets : du 13 au 16 nov., Semaine · Tous · Halloween · Marché) (B) |
| `src/ui.js` l. 1535, 1557 | `majCoinQuartier()`, `majMinuteurs()` : `#b-quartier`, `#b-hantee` en dur | une boucle sur `EVS.liste` : le bouton `#b-${E.cle}` (`#b-marche` ajouté à page.html), son minuteur `.ev-reste` (B) |
| `src/ui.js` l. 1670-1680 | la liste du classement : `hantee ? … bonbons … 'Personne encore au manoir'` | lus sur la fiche : `F.fmt`, `T.classementInfo`, `T.classementFini`, `T.vide`, `T.videSous` (B) |
| `src/ui.js` l. 1794-1795 | la tenue en or du podium final : `HTE` seul, « Podium final de la Maison hantée » | pour chaque `E` : `G.donnerCollection(st, \`${E.cle}-or\`)`, toast `T.podiumFinal` (B) |
| `src/ui.js` l. 1897-1902 | `NOM_EVT_LONG = { hantee }`, l'icône `ICONS.UI.hantee` de la feuille « Tu as fini 7e de … » | `NOM_EVT_LONG.marche = 'le Marché d'automne'`, icône `ICONS.UI[id]` (B) |
| `src/ui.js` l. 2075, 2141, 2162 | `SCENE.decosHantee(…)` (la boutique, la visite, le retour) | + `SCENE.decosMarche(st.marche ? st.marche.decos : [])`, `v.b.decosMarche` (B ; la fonction : C) |
| `src/ui.js` l. 2223 | la visite d'un lieu : `E.cle === 'quartier' ? porte : ICONS.HANTEE.manoir` | `E.F.ico.lieu` (B) |
| `src/ui.js` l. 2911, 2992 | `#b-hantee` → `HTE.ouvrir()`, `SCENE.precharger('hantee')` | pour chaque `E` (B) |
| `src/ui.js` l. 3033 | `__fournil.hantee`, `fermerHantee`, `evHantee`, `HT` (tests) | + `marche`, `fermerMarche`, `evMarche`, `MC`, `piste` (§ 9) (B) |
| `src/classement.js` l. 134, 175, 192, 466, 569 | `EVTS = ['hantee']`, `NOMS_EVT`, `TITRES`, la photo `dh` (décos du Manoir), `decosHantee` | `EVTS = ['hantee', 'marche']`, `NOMS_EVT.marche`, `TITRES['legende-marche']`, `TITRES['feuille-or-2026']`, la photo `dm` (décos du Marché) et `decosMarche` (A) |
| `src/chaine.js` l. 360-395 | familles `hantee`, `OBTENIR_TENUE.hantee*` | familles `marche` et `piste-automne` **ajoutées en dernier** (le code des photos, `ORDRE`, ne change pas pour les décos d'avant), `OBTENIR_TENUE` (C) |
| `src/scene.js` l. 321, 1059-1064 | `decosHantee`, `HDECO`, `decosHanteeVues` | `decosMarche`, `MDECO`, `decosMarcheVues` (C) |
| `supabase/` | `fournil_evts()` : la seule ligne `'hantee'` | + la ligne `'marche'`, `fournil_evt_titre` (A, § 4) |

**RÈGLE PERMANENTE du tiroir** (rappel, s'applique à l'écran de la Halle) : le tiroir est celui du Manoir (`src/tiroir.js` + le tiroir de
`src/evenement.js`) : trois crans (haut, mi, fermé), poignée **et** barre ; la liste défile à mi-hauteur et en haut ; tirée vers le bas quand
elle est en haut, elle referme le tiroir ; les bandeaux (coup de pouce, commande du marché) au-dessus du tiroir ; la colonne Mini-jeux /
Contrats / Opération en haut à droite de la scène ; **aucune fiche ne refait son propre tiroir** ; le test du Marché se calque sur
`test/fournil-hantee-activites.cjs` (mêmes gestes, mêmes tailles d'écran, mêmes tolérances).

---

## 2. Le Marché d'automne : les règles (`src/marche.js`, constructeur A)

`src/marche.js` = `src/hantee.js` copié, **même API mot pour mot** (la liste exportée identique, clé par clé : un test la compare), global
`MARCHE`, `module.exports` en Node. Ce qui change, et seulement ça :

### 2.1 La fenêtre et l'état
- `DEBUT = parisMs(2026, 11, 13, 12)`, `FIN = parisMs(2026, 11, 20, 20)` (176 h), `JOURS = 8` (jours de Paris : ven. 13 = 1 … ven. 20 = 8),
  `GRACE = 3600e3`, `CLASSEMENT_JUSQUA = FIN + 14 * JOUR` (ven. 4 déc. 20 h), `fenetre`, `fenetreSure`, `envoiBonbons`/`envoiBillets` inchangés.
- `OUVERTURES` : `parisMs(2026, 11, 12 + p.jour, 0)` (jour 1 : à l'ouverture ; les autres à minuit).
- L'état vit dans **`st.marche`** (`neuf`, `etat` identiques ; `majeur: true`, pas de porte). Les clés internes de l'état restent celles du
  Manoir (`billets`, `total`, `manoir`, `bestiaire…`, `paliers`, `vetements`, `decos`) : le moteur d'écran les lit telles quelles.
- `ACT.equiper({ id: 'marche', … })` (les graines des mini-jeux et de la recette du jour en dépendent).
- `PROFILS` (simulation) : ceux de `outils/marche/proto.js` (occasionnel 17 min, quotidien 1 h, assidu 2 h, très actif 8 h, marathon 23 h 48).

### 2.2 La fiche (`MARCHE.FICHE`)
```
id: 'marche', nom: 'Le Marché d'automne', lieu: 'la Halle', Lieu: 'La Halle', adulte: false, cle: 'marche',
classement: { periode: 'marche', onglet: 'Marché', evt: 'marche' },
devise: { nom: 'noisettes', un: 'noisette', icone: 'noisettes', svg: NOISETTE_SVG },
couleurs: { fond: '#FFF4E4', carte: '#FFFFFF', accent: '#D9622B' (rouille-citrouille), clair: '#B08A68', vert: '#7A9A3A' (mousse),
            or: '#E8B33A' (feuille d'or), chataigne: '#7B4A2A', texte: '#4A2E1C', doux: '#9C7B5E' },
dates: { debut, fin, texteDebut: 'vendredi 13 novembre à midi', texteFin: 'vendredi 20 novembre à 20 h' }, chat: null
```
Textes (`FICHE.textes`) : titre « Le Marché d'automne », sousTitre « La Halle · l'automne », annonceTitre « Le Marché d'automne ouvre ses
étals ! », annonce « Jusqu'au vendredi 20 novembre à 20 h : une boutique à part, « la Halle », où tout le monde part de zéro. Ses
noisettes rapportent des récompenses pour ta boulangerie : étoiles, boosts, décos d'automne, une tenue à vie et un écureuil. », ouvrir
« Entrer dans la Halle », fermer « Retour à la boulangerie », ameliorations « Astuces », equipe « Les amis de la forêt », manuel « Touche ! »,
palier12 « Le maître de la Halle, c'est toi. Tout ça reste à vie, même après le marché. », bilanTitre « Bilan du Marché d'automne », bilan
« La Halle a rangé ses étals. Tout ce que tu as gagné reste à vie. », ferme « La Halle est fermée. », classementInfo « Les noisettes gagnées
à la Halle · podium final le 20 nov. à 20 h », classementFini « Le Marché d'automne est fini : le podium final est figé », vide « Personne
encore à la Halle », videSous « Les noisettes de la Halle arrivent avec le prochain envoi. », podium (rang) « 1er de la Halle »,
podiumFinal « Podium final du Marché d'automne : la tenue d'automne en or est dans ta garde-robe ! », paliersNote (comme la Maison hantée,
« la tenue d'automne », « l'écureuil se choisit dans Les compagnons »).

### 2.3 Les huit recettes (chiffres **identiques** à la Maison hantée : l'enveloppe en dépend)

| # | id | nom (pl.) | cout | debloquer | rev | temps | croiss | staff (prix) | apprenti | poste |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `chataigne` | Châtaignes grillées (cornets de châtaignes grillées) | 4 | 0 | 1 | 1,5 | 1,07 | 1 500 | Gaspard l'écureuil | Le brasero du coin de la rue |
| 2 | `jus` | Jus de pomme pressé (bouteilles de jus de pomme) | 60 | 120 | 20 | 3 | 1,14 | 22 500 | Rosalie la hérissonne | Le pressoir du verger |
| 3 | `tarte` | Tartes aux pommes | 720 | 1 440 | 150 | 6 | 1,13 | 150 000 | Madame Blaireau | Le four à bois de la Halle |
| 4 | `champignon` | Paniers de champignons (cèpes et girolles) | 8 640 | 17 280 | 1 200 | 12 | 1,12 | 750 000 | Hortense la chouette | Le coin des sous-bois |
| 5 | `raisin` | Grappes des vendanges | 1e5 | 2e8 | 10 000 | 24 | 1,11 | 4e8 | Bruno l'ours | La tonnelle des vendanges |
| 6 | `panier` | Paniers garnis de l'automne | 1,2e6 | 1e10 | 9e4 | 96 | 1,1 | 3e10 | Céleste la biche | L'étal des paniers |
| 7 | `marron` (après le 13e) | Marrons glacés | 1e12 | 2e13 | 72 000 | 120 | 1,02 | 5e13 | Roux le renard | Le comptoir des confiseurs |
| 8 | `pain-epices` (après le 16e) | Pains d'épices de la Saint-Martin | 1e13 | 2e14 | 1 050 000 | 240 | 1,025 | 5e14 | Sacha le marcassin | Le moulin à épices |

Les `desc` / `staffDesc` : une phrase douce chacune (ex. châtaignes « Chaudes dans le cornet : elles réchauffent les doigts. » ; Gaspard
« Il range une châtaigne sur trois dans sa joue. Pour l'hiver, dit-il. »). Rien d'alcoolisé : pas de cidre ni de vin à vendre (le cidre et
les vendanges restent un décor : le tonneau du pressoir, la tonnelle).

### 2.4 Les Astuces (= les Sortilèges ; mêmes coûts, cibles, multiplicateurs, effets, primes, étoiles)
`braise` Les braises bien chaudes (Châtaignes ×3, 5e4) · `pressoir` Le grand pressoir (Jus ×3, 6e5) · `brouette` La brouette à moteur (Tout ×2,
3e6) · `four-bois` Le four à bois (Tartes ×3, 8e6) · `osier` Les paniers d'osier (Champignons ×3, 6e7) · `soleil` Le soleil d'automne
(Châtaignes et jus ×5, 1,5e8) · `almanach` L'almanach des saisons (Tout ×2, 4e8) · `hotte` La hotte des vendangeurs (Raisins ×3, 3e9) ·
`tresse` L'osier tressé main (Paniers garnis ×3, 6e10) · `recoltes` La fête des récoltes (Tout ×3, 1e12) ; après le 12e : `criee` La criée
(niveaux à moitié prix, 6e14, prime 4, 1 ★) · `epouvantail` L'épouvantail à pies (8 touches, 5 % ; 8e14) · `plaid` Le plaid à carreaux
(absence 12 h à 20 % ; 1,5e15) · `sucre` Le sucre glace (Marrons ×3 ; après le 13e ; 2e15) · `ete-indien` L'été indien (l'heure dorée
2 min 30 ; 3e15) · `triporteur` Le triporteur (la brouette attend 20 s, son panier ×3 ; 6e15) · `moulin` Le moulin à épices (Pains d'épices
×3 ; après le 16e ; 9e15).

### 2.5 Les coups de pouce (clés de mécanique du Quartier, habillage `FICHE.evenements`)
- `descente` **Les pies voleuses !** « Des pies chipent les noisettes : chasse-les, vite ! » (12 touches en 15 s ; sinon 10 % emportés) ;
- `grosclient` **La cantine de l'école** « La cantine commande pour le goûter ! » (N produits en 3 min, payés ×6) ;
- `soiree` **L'heure dorée** « Le soleil d'automne dore la Halle : tout se vend ×2 ! » (2 min) ;
- `scooter` **La brouette du fermier** « La brouette du fermier passe : attrape le panier ! » (10 s).
`FICHE.genres`/`actions` : ceux du Quartier. `stats` de l'écran : Ventes, Pies chassées, Cantines servies, Paniers attrapés.

### 2.6 Les vingt paliers (seuils et jours **réglés par la simulation**, `outils/marche/proto.js`)

| n | total (noisettes) | jour | récompense pour la boulangerie | titre |
|---|---|---|---|---|
| 1 | 5e7 | 1 | 1 ★, boost ×2 30 min | Premières noisettes |
| 2 | 5e9 | 1 | déco `cagettes`, prime 1 h | Les cagettes du perron |
| 3 | 5e10 | 1 | vêtement `marche-bonnet` | Le bonnet à pompon |
| 4 | 2,5e11 | 2 | 1 ★, déco `lampions` | Les lampions de la Halle |
| 5 | 8e11 | 2 | vêtement `marche-gilet`, prime 2 h | Le gilet de laine |
| 6 | 1,6e12 | 2 | déco `feuilles` | Le tas de feuilles mortes |
| 7 | 3e12 | 3 | vêtement `marche-bottes`, 1 ★, boost ×5 15 min | Les bottes de pluie |
| 8 | 6e12 | 3 | déco `tonneau`, prime 3 h | Le tonneau du pressoir |
| 9 | 1,2e13 | 3 | vêtement `marche-panier` (la tenue complète) | Le panier d'osier |
| 10 | 6e13 | 4 | 2 ★, boost ×2 1 h | La Halle affiche complet |
| 11 | 3e14 | 4 | 1 ★, boost ×2 30 min, prime 4 h | La fête des récoltes |
| 12 | 5e14 | 4 | 4 ★, boost ×5 1 h, prime 6 h | Le maître de la Halle |
| 13 | 8e14 | 5 | (bonus) 2 ★, boost ×5 30 min, prime 4 h | Gaspard fait des heures sup' |
| 14 | 1,4e15 | 5 | 2 ★, prime 6 h | Les pommes t'applaudissent |
| 15 | 2,6e15 | 6 | 3 ★, boost ×5 45 min | Hortense hulule de joie |
| 16 | 3,6e15 | 6 | 3 ★, prime 8 h | Madame Blaireau sort sa plus belle nappe |
| 17 | 5,5e15 | 7 | 3 ★, boost ×10 30 min | Bruno danse la bourrée |
| 18 | 9e15 | 7 | 4 ★, prime 12 h | Toute la forêt fait la fête |
| 19 | 1,5e16 | 8 | 4 ★, boost ×10 45 min | L'été indien rien que pour toi |
| 20 | 2,6e16 | 8 | vêtement `marche-couronne`, 8 ★, boost ×10 1 h, prime 24 h, déco `arbre-or`, aura `feuilles`, distinction `legende-marche` | La légende du Marché |

`PALIERS_BOSS = 12`, `TROPHEE = 'marche-couronne'`, `VETEMENTS = ['marche-bonnet', 'marche-gilet', 'marche-bottes', 'marche-panier']`,
`VETEMENTS_OR = ['marche-or-bonnet', 'marche-or-gilet', 'marche-or-bottes', 'marche-or-panier']`, `DECOS = ['cagettes', 'lampions', 'feuilles',
'tonneau']`. Pas d'`ANCIENS` (pas de version 1 des récompenses : `recompensesV2: true` d'office, `revueRecompenses` ne rend rien).
Récompenses totales (comme la Maison hantée) : 10 ★ aux douze premiers, 29 ★ aux huit bonus ; même nombre de boosts et d'heures de primes.

### 2.7 Les activités de la Halle (le lot 6 du Manoir, réhabillé ; chiffres identiques : `EVEIL`, `CLIENTS`, `PARFAIT`, `APPARITIONS`, `COMMANDES`)
- **Le ×6 qui s'endort** : jauge « Le marché bat son plein : ×6 avec toi », « Le marché s'assoupit… », « Le marché somnole : touche ! ».
- **Les clients** : des enfants **déguisés en animaux de la forêt** (la fête des feuilles) ; `SORTES = ['ecureuil', 'herisson', 'lapin',
  'renard', 'blaireau', 'chouette', 'faon', 'marcassin', 'ourson']` (noms : « L'écureuil »… ; courts : « Écureuil »…).
- **Les fournées parfaites** : inchangées (« Fournée parfaite ! ×2 »).
- **Les apparitions** : `TYPES_APPARITION = ['feuille', 'chataigne', 'champignon']` (une feuille d'or qui tombe en virevoltant, une
  châtaigne qui roule, un champignon qui pousse) ; série « ×1,5 ».
- **La commande du marché** (= la commande de la nuit) : « La commande du marché », « Livrer ! ».
- **La collection, « L'album de la forêt »** (= le bestiaire ; `BESTIAIRE` aux mêmes chiffres : bronze 10 servis, argent 30, or 140 ;
  étoiles 1,1,1,1,2,1,1,1,2 puis +1 et +2 par sorte) : `decoId: 'album'` (l'étagère aux peluches de la forêt, au 5e), `album-argent`,
  `album-or` (elles remplacent la précédente), compagnon au 9e : **l'écureuil** (`'ecureuil'`, « Pirouette »).
- **Les activités communes** (`src/activites.js`, `FICHE.activites`) : mini-jeux `guet` « Le guet » (« Touche quand l'écureuil passe devant la
  lanterne »), `compte` « Le compte » (des châtaignes), `tournee` « La tournée » (des paniers numérotés) ; `decor: { motif: 'marche', fond:
  '#3A2A1E', sol: '#5B4330', accent: '#D9622B', accent2: '#E8B33A', clair: '#E9D5BC', texte: '#FFF4E4' }` ; contrats (« Chasse N pies »,
  « Sers N cantines », « Attrape N fois le panier », « Profite de N heures dorées »…) ; opérations « Le tour du village » (5 min), « Le
  marché du canton » (15 min), « La grande foire d'automne » (1 h) ; saisie « Des pies gourmandes ont chipé … ».
- **La recette du jour** : **huit** recettes (une par jour), 20 à 55 s : `soupe-potiron` La soupe de potiron (20), `crepes-chataigne` Les
  crêpes à la farine de châtaigne (25), `chaussons-pommes` Les chaussons aux pommes (30), `cake-noix` Le cake aux noix (35), `poires-chocolat`
  Les poires au chocolat (40), `clafoutis-raisin` Le clafoutis aux raisins (45), `tarte-tatin` La tarte Tatin (50), `chocolat-chaud` Le
  chocolat chaud aux épices (55) ; à la 500e fournée : `recetteDeco: 'toque-feuille'` (la toque brodée de feuilles d'or).

### 2.8 Garde-robe, aura, distinction, compagnon (`src/game.js`, A)
- `GARDEROBE` : `marche-bonnet` (tête, collection `marche`, forme `bonnet`, `{ gains: { produit: 'tarte', pct: 8 } }`, rare), `marche-gilet`
  (haut, `sweat`, gains 2,5 %), `marche-bottes` (pieds, `bottes`, vitesse 1,5), `marche-panier` (accessoire, `panier`, absence 0,5) ;
  `marche-or-*` (collection `marche-or`, mêmes formes, légendaire, les bonus de `hantee-or-*`) ; `marche-couronne` (tête, collection
  `marche-couronne`, forme `couronne`, vitesse 1, épique, « Le palier 20 de la Halle. Des feuilles d'or qui ne tombent jamais. »).
- Ensembles : `marche` « Tenue d'automne » (gains 6 %, vitesse 2, absence 1) ; `marche-or` « Tenue d'automne en or » (8 %, 3, 1).
- `AURAS.feuilles` : « Aura des feuilles d'or » (couleur `#E8B33A`, des feuilles qui tournoient doucement autour du boulanger).
- `DISTINCTIONS['legende-marche']` « Légende du Marché » (le 20e palier) ; `DISTINCTIONS['feuille-or-2026']` « Feuille d'or 2026 » (le titre de la saison, § 7).
- `COMPAGNONS` : `{ id: 'ecureuil', nom: 'Écureuil roux', espece: 'ecureuil', prix: null, condition: (st) => !!(st.marche && st.marche.ecureuil),
  gagne: 'Gagné à l'album de la forêt', verrou: 'Les neuf déguisements de l'album', nomDefaut: 'Pirouette', cri: 'couic', bonus: (celui de
  la chauve-souris), phrase: 'Il grimpe aux étagères et cache des noisettes dans les tiroirs.' }` (après `chauve-souris`).
- Les décos du Marché (posables, `chaine.js` famille `marche`, possédées : `st.marche.decos`) : `cagettes` (sol), `lampions` (rebord, lueur),
  `feuilles` (sol), `tonneau` (sol), `album` (mur ; variantes argent/or), `arbre-or` (sol, lueur, le 20e), `toque-feuille` (mur, la recette du jour).

---

## 3. Le classement du Marché et les acharnés

- Le téléphone envoie ses noisettes avec `p_evt = 'marche'`, `p_score` (le moteur v5 de `src/classement.js` : `evenement()` → `{ id: 'marche',
  score, valeur }`), pendant la fenêtre et l'heure de grâce. Onglet « Marché » jusqu'au 4 décembre.
- **Récompenses dégressives du 1er au 15e** : `RECOMPENSES_EVT` (classement.js) telles quelles (7, 6, 5 ★ et ×5 1 h ; 4e-6e 4 ★ ×3 1 h ; 7e-10e
  3 ★ ×3 30 min ; 11e-15e 2 ★ ×2 30 min), une fois par événement (`evtPayes` : `'marche'`) ; les trois premiers : la tenue d'automne en or.
  Rien à changer au barème : `evtAPayer` et `phraseEvt` itèrent `EVTS` (« Tu as fini 7e du Marché d'automne sur 12 »).
- **L'acharné** (palier 20) : le titre « Légende du Marché » à côté du pseudo (`TITRES['legende-marche']`, la photo `ti`), l'aura des
  feuilles d'or, l'arbre aux feuilles d'or dans la boutique, la couronne.

---

## 4. L'enveloppe et le SQL v6.9

### 4.1 Comment la table est tirée (`outils/marche/rythme.js`)
Le marathon (23 h 48 par jour : deux sessions de 714 min, l'une à midi), joué au mieux (le ×6 jamais endormi, chaque client servi, chaque
apparition, chaque fournée parfaite, chaque commande, la recette du jour, les mini-jeux, contrats et opérations au mieux), Astuces achetées
**et** offertes dès le 12e (le pire cas), sur 12 graines × 2, minute par minute. À chaque pas de 6 h : le plus haut total atteint × 2,2,
arrondi au 0,05 supérieur du log10, croissant ; puis relevé (la valeur de fin du pas) partout où l'interpolation passerait sous ×2,2 ; la
valeur d'ouverture reste celle de la Maison hantée (11,65 : un tricheur ne part pas de haut). Contrôle sur 12 × 2 tirages jamais vus.

Résultat (31 valeurs, 0 à 180 h) : `{11.65,16.05,16.05,16.3,16.5,16.65,16.75,16.85,16.9,17,17.05,17.1,17.15,17.2,17.2,17.3,17.35,17.4,17.5,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05,18.1,18.15,18.15,18.2}`
— marge **×2,20** au plus juste (graine 7, Astuces offertes, à 143,9 h), **×2,21** sur les tirages jamais vus, **×14,6** au plus large après
7 h 15 (≤ ×20 demandé), croissante. Le constructeur A **refait tourner** la simulation sur `src/marche.js` (les vraies règles) dans
`test/fournil-marche.test.js` : si l'écart au prototype dépasse 0,05 en log10 à un pas, il retire la table de la même façon et la recopie dans
le patch **et** le fichier complet (et le dit dans `docs/marche-contrat.md § 12`).

### 4.2 Le patch `supabase/fournil-classement-v69.sql` (écrit, essayé)
Ce qu'il fait, et rien d'autre : `fournil_evts()` = la ligne `'hantee'` **inchangée** + la ligne `'marche'` (13 nov. 12 h → 20 nov. 20 h,
Europe/Paris, pas 6, la table ci-dessus) ; `fournil_evt_titre` connaît « le Marché d'automne » (les notifications d'ouverture et de fin) ;
mêmes signatures, langage, volatilité, `search_path` ; droits internes (revoke). Garde-fou en tête : sans la v6.6+, il refuse et ne change
rien. Tout le reste suit depuis la v5/6.6 : `fournil_publier` (borne par `fournil_evt_borne`), `fournil_classement('marche')`,
`fournil_evt_figer` (les 15 premiers, ex æquo, `joueurs`, à 21 h), `fournil_recompenses` (`evenements.marche`), `fournil_annoncer`.

**Requête de contrôle** (en bas du patch) : `evenements = 'hantee, marche'`, la table du Marché, `marche_valeurs = 31`, la borne en ce moment
(0 avant le 13 à midi) et son log10, la borne de la fin (log10 18,17), le titre.

### 4.3 L'essai dans PGlite (`outils/marche/sql-v69.cjs`, 30 vérifications, toutes vertes : `outils/marche/sql-v69-resultats.txt`)
PGlite n'est pas dans le dépôt ; version exacte, hors du dépôt :
```sh
npm install --prefix "$SCRATCH/pglite" --no-save --no-package-lock @electric-sql/pglite@0.5.8
TZ=Europe/Paris node outils/marche/sql-v69.cjs "$SCRATCH/pglite"
```
Il colle le fichier complet (v6.8), joue et fige la Maison hantée, colle le patch **deux fois** (aucune donnée, aucune autre fonction, aucun
droit ne bouge ; `'hantee'` identique ; la table = `rythme-resultats.json`), refuse `fournil_evts` et `fournil_evt_titre` à anon et
authenticated, vérifie la borne contre son miroir JS, joue le Marché en anon (rien avant midi ; 3e12 compté ; 1e19 ramené à la borne),
rejoue le marathon du prototype envoyé toutes les 10 min (1 056 envois, **aucun plafonné**), puis fige le podium à 21 h (16 lignes, deux 2e,
deux 15e, `joueurs` 19), `evenements.marche` dans `fournil_recompenses`, la médaille dans le classement.

### 4.4 Le fichier complet : la convention du dépôt
La convention (patchs 6.2 → 6.8) : **le fichier complet porte le même tableau et le même code** que le patch, et `test/fournil-classement-sql.cjs`
éprouve le patch deux fois par-dessus la version d'avant puis compare au fichier complet. Ici le patch est **écrit et essayé mais pas
recopié** dans `supabase/fournil-classement.sql` (choix demandé tant que la table n'est pas validée sur les vraies règles). Le constructeur A
le recopie (§ 3 ter : la ligne `'marche'` dans `fournil_evts()`, `fournil_evt_titre`, l'en-tête « Version 6.9 ») et ajoute la section v6.9 au
test PGlite, dès que `test/fournil-marche.test.js` confirme la table. Le joueur colle **le patch** (pas le fichier complet).
Si le patch n'est pas collé à midi le 13 : les noisettes envoyées sont ignorées (`evt: null`), l'onglet « Marché » reste vide, rien ne casse ;
une fois collé, le prochain envoi compte le score (borné à l'instant de l'envoi : rien n'est perdu).

---

## 5. L'écran du Marché (constructeur B)

- **L'icône** `#b-marche` (coin, sous `#b-hantee`) : une feuille d'érable rousse (`ICONS.UI.marche`, C) et son minuteur `.ev-reste`
  (« 6 j 4 h », puis « 2 h 15 », « 40 min »), visible pendant la fenêtre si pas masqué et `ouvertA('evenements')`.
- **L'annonce** (une fois, à l'ouverture, `EVS.annoncer` : jamais deux annonces à la fois ; le bilan de la Maison hantée s'il est encore dû
  passe d'abord) : la vidéo `fournil/media/marche.mp4` si C la fournit (sinon la scène dessinée : la Halle, des feuilles qui tombent),
  « Comment jouer » en six points (Sers les enfants déguisés · Le ×6 s'assoupit · L'album de la forêt · 20 paliers au fil des jours · Le
  classement (les 15 premiers) · Jusqu'au vendredi 20 novembre, 20 h), « Entrer dans la Halle » / « Plus tard ».
- **L'écran** `#marche` (`role="dialog"`, `data-ecran`, préfixe `mc`) : le même gabarit que `#hantee` (en-tête crème, solde, ×6, scène pleine
  largeur, bandeaux, colonne des activités, **le tiroir du Manoir** § 1), couleurs du Marché (variables `--mh-*` redéfinies sur `#marche` :
  crème `#FFF4E4`, texte `#4A2E1C`, accent `#D9622B`, or `#E8B33A`, vert `#7A9A3A`). Les règles CSS `#hantee …` deviennent
  `:is(#hantee, #marche) …` (même spécificité), sauf le bloc des variables. Touches d'automne dans `habiller` : une guirlande de feuilles
  dans l'en-tête, deux feuilles qui tombent près de la poignée.
- Feuilles : paliers (« s'ouvre samedi 14 »…), Astuces (pastille du nombre achetable), album de la forêt, fêtes, commande, bilan, « Comment
  ça marche ? » : les gabarits de la Maison hantée, textes de la fiche.
- **Le classement** : onglet « Marché » (§ 1) ; la feuille « Tu as fini 7e du Marché d'automne sur 12 » ; la tenue d'automne en or au podium.
- **Mes récompenses** : les places d'événement listées par `evtPlaces` (déjà générique) ; icône par événement.
- **Nouveautés** (`src/nouveautes.js`) : `{ id: '2026-11-13-a', date: '2026-11-13', titre: 'Le Marché d'automne et la saison d'automne', points: [
  « Jusqu'au 20 novembre, ta boutique devient la Halle : châtaignes, tartes aux pommes, paniers, et des enfants déguisés en animaux de la forêt. »,
  « Vingt paliers au fil des jours, l'album de la forêt, un écureuil à gagner, et le classement : les quinze premiers sont récompensés. »,
  « Nouveau : la saison d'automne, une piste de récompenses gratuite jusqu'au 30 novembre. Les objectifs du jour, le défi de la semaine, ta
  série et les paliers du Marché la font avancer. », « Tout ce que tu gagnes reste à vie. » ] }` (id suivant si un autre du 13 existe).

---

## 6. La scène, les décos, les vignettes (constructeur C)

- `src/boutiquemarche.js` : `BOUTIQUE_MARCHE`, **même API** que `BOUTIQUE_HANTEE` (actif, scene, ouverte, precharger, SORTES, acteurs, client,
  entrer, servir, fache, apparition, apparitions, attraper, retirer, surToucher, fete, ambiance, detruire). La vraie boutique transformée :
  **de jour**, lumière dorée de fin d'après-midi ; le comptoir en étal (auvent rayé rouille et crème), cagettes de pommes et de courges, bottes
  de paille, guirlandes de feuilles et de lampions, châtaignes sur le brasero ; les clients : enfants chibis avec **une capuche d'animal**
  (oreilles, couleur, museau ; 9 sortes) et une écharpe ; l'équipe : les huit amis de la forêt (chibis à capuche d'animal plus grande, tablier) ;
  le boulanger en tenue d'automne (s'il la porte) ; l'écureuil sur le comptoir. Apparitions : feuille d'or, châtaigne, champignon.
- **HD** (qualité haute/moyenne, lot `marche` de `src/hd.js`, `fournil/hd/marche/`) : seulement des modèles **CC0** (Kenney Food Kit : pomme,
  citrouille, champignon, raisin, tarte ; Kenney Nature Kit : feuilles, souches, arbres d'automne ; KayKit Restaurant/Furniture : cagettes,
  tonneau, étals), cuits en couleurs de sommets et fusionnés comme `hantee3`. Si un téléchargement est impossible (réseau du conteneur) : le
  repli éco suffit pour la mise en ligne (thème `VIE.DECORS.marche`, `MEUBLES.marche`, chibis `PERSOS.DEGUISEMENTS`), la HD vient après.
- `src/persos.js` : formes `bonnet` (à pompon), `panier` (osier, à la main), `couronne` (de feuilles) ; `gilet` = `sweat` recoloré, `bottes`
  existantes ; les 9 capuches d'animaux ; l'espèce `ecureuil` (compagnon : queue en panache, tient une noisette) ; l'aura `feuilles`.
- `src/icons.js` : `ICONS.MARCHE` (noisette, noisettes, les 8 produits, les 4 coups de pouce, les 3 apparitions, palier, album, halle,
  `H1`), `ICONS.UI.marche`, `ICONS.UI.piste` (une feuille et une étoile), `TENUES.marche`, `marche-or`, `marche-couronne`, `automne`
  (§ 7.3), l'icône du compagnon `ecureuil`.
- Les décos 3D (procédurales, `src/meubles.js` `NEUVES`, posables) : Marché `cagettes`, `lampions`, `feuilles`, `tonneau`, `album`
  (+ argent, or), `arbre-or`, `toque-feuille` ; saison `couronne-feuilles` (mur), `guirlande-feuilles` (rebord), `lanterne-automne`
  (comptoir, lueur), `epouvantail` (sol), `trophee-automne-2026` (comptoir). Chacune ≤ 1 appel de dessin (fusionnées).
- `src/chaine.js` : familles `marche` (« Le Marché d'automne ») et `piste-automne` (« La saison d'automne 2026 »), **en dernier** dans
  `FAMILLES` ; `OBTENIR_TENUE.marche` « Le Marché d'automne, paliers 3, 5, 7 et 9 », `marche-or` « Le podium final du Marché d'automne »,
  `marche-couronne` « Le Marché d'automne, palier 20 », `automne` « La saison d'automne 2026, crans 5, 9, 13 et 17 ».
- Vignettes du carnet : `outils/vignettes/cuire.cjs` pour les 14 nouvelles décos et les 13 nouvelles pièces (sinon le repli dessiné).
- Sons (`src/sons.js`, `JEUX.marche`) : les sons communs suffisent ; option : un carillon de marché, des feuilles froissées (CC0).

---

## 7. La saison gratuite « Automne » (`src/saison.js` + `src/saison-automne.js`, constructeur A ; écran : B)

### 7.1 Le module
- `src/saison.js` (global `SAISONS`, Node : `module.exports`) : le moteur générique, **sans DOM** : `ajouter(fiche)`, `active(now)` (la fiche dont
  `debut ≤ now < fin`), `etat(st, now)` (répare, crée, archive), `pas(st, now, ctx)` (l'XP par constat, § 7.2), `crans(st)`, `aRecevoir(st)`,
  `recevoir(st, n)` → le lot (ce que l'écran distribue), `titre(st)`, `fin(st, now)` (archive), `possede(st, id)` (le carnet), `PISTE`.
- `src/saison-automne.js` : `SAISONS.ajouter({ id: 'automne-2026', nom: 'La saison d'automne', debut: parisMs(2026, 11, 13, 12), fin:
  parisMs(2026, 12, 1, 0), sources: SOURCES, crans: CRANS, xpCran: 50, titre: { xp: 250, distinction: 'feuille-or-2026' }, couleurs, textes })`.
  Le point 7 ajoutera `src/saison-hiver.js` (`id: 'hiver-2026'`, du 1er déc. 0 h) sans toucher au moteur.
- Ordre dans `build.js` : `saison.js` et `saison-automne.js` juste après `progression.js` (des règles ; avant `classement.js` et `ui.js`).

### 7.2 L'XP de saison : des mini-objectifs plafonnés, **comptés par constat** (jamais de pari)
`SAISONS.pas(st, now, ctx)` (appelée par ui.js une fois par seconde, comme `pasAccueil`, et dans les simulations Node) compare l'état aux
marqueurs de `st.piste` et crédite ce qui est nouveau, une seule fois, borné par jour (jour de Paris) :

| Source | XP | Plafond | Lu dans |
|---|---|---|---|
| `objectif` : un objectif du jour réclamé | 5 | 3 / jour | `st.jour.objectifs[k].reclame` (marqueur `j.o`) |
| `journee` : les trois du jour réclamés | 10 | 1 / jour | `st.jour.etoileDonnee` (`j.c`) |
| `defi` : le défi de la semaine réclamé | 75 | 1 / semaine | `st.semaine.reclame` (marqueur `sem` = la clé de la semaine) |
| `serie` : un jour **de suite** dans la série | 10 | 1 / jour | classement : `resume().serie.auj && serie ≥ 2` (`ctx.serie`) ; sans classement : un objectif du jour réclamé aujourd'hui **et** hier (`veille`) |
| `palier` : un palier d'événement franchi | 20 | 4 / jour | `st.marche.paliers.length` (marqueur `ev.marche`) ; l'Avent ajoutera sa clé |
| `casino` : un mini-objectif de l'arrière-salle réussi | 5 | 3 / jour | `st.arriere.casino.objectifs[k].fait` (`j.k`) : leurs mises sont déjà ≤ 0,5 % de la caisse (src/casino.js) |

Maximum hors événement : 65 XP par jour (+75 le jour du défi) ; le Marché ajoute au plus 80 par jour (400 en tout). Rien d'autre ne donne
d'XP (ni l'argent, ni le temps passé, ni les mises). Le 13 novembre, ce qui est déjà réclamé le matin compte au premier `pas` (généreux et
simple : même règle pour tous) ; une `j` réparée (abîmée) recompte à partir de l'état du moment (jamais deux fois).

### 7.3 La piste : 22 crans de 50 XP, puis le titre

| Cran | XP | Récompense (à vie) | | Cran | XP | Récompense |
|---|---|---|---|---|---|---|
| 1 | 50 | boost ×2 30 min | | 12 | 600 | 3 h de gains |
| 2 | 100 | 1 ★ | | 13 | 650 | `automne-pull` (pull jacquard, haut, forme `sweat`) |
| 3 | 150 | déco `couronne-feuilles` (la porte) | | 14 | 700 | 2 ★ |
| 4 | 200 | 1 h de gains | | 15 | 750 | déco `lanterne-automne` (comptoir) |
| 5 | 250 | `automne-gavroche` (casquette de tweed, tête, forme `casquette`) | | 16 | 800 | 2 h de gains |
| 6 | 300 | 1 ★, 1 h de gains | | 17 | 850 | `automne-bottines` (pieds, forme `chaussures`) : la tenue de saison complète |
| 7 | 350 | déco `guirlande-feuilles` (rebord) | | 18 | 900 | 2 ★, 4 h de gains |
| 8 | 400 | 2 h de gains | | 19 | 950 | déco `epouvantail` (sol) |
| 9 | 450 | `automne-echarpe` (écharpe tricotée, accessoire, forme `foulard`) | | 20 | 1 000 | boost ×3 30 min |
| 10 | 500 | 1 ★, boost ×2 30 min | | 21 | 1 050 | 3 ★ |
| 11 | 550 | 1 h de gains | | 22 | 1 100 | **le trophée de fin de saison** `trophee-automne-2026` (déco + vitrine) et 2 ★ |
| titre | 1 350 | la distinction **« Feuille d'or 2026 »** (au classement, à côté du pseudo) | | | | |

Total : 12 ★ (+60 % de gains d'un débutant, < 1 % d'une partie de 30 jours), 3 boosts (×2, ×2, ×3, 30 min), 14 h de primes, la tenue de saison (4 pièces
**cosmétiques, sans bonus** : collection `automne`, ensemble sans bonus, comme l'apprenti), 5 décos, le trophée, le titre. Aucun achat,
aucune piste payante, aucune monnaie : la piste ne se « paie » jamais.

### 7.4 L'état : `st.piste` (**pas** `st.saison`, qui est la recette de saison)
```js
st.piste = { v: 1, id: 'automne-2026', xp: 0, recus: 0, titre: 0,
             j: { d: 'AAAA-MM-JJ', o: 0, c: 0, k: 0, s: 0, p: 0 },   // les marqueurs du jour (objectifs, journée, casino, série, paliers)
             sem: '', veille: '', ev: { marche: 0 },                 // le défi déjà compté (clé de semaine), le dernier jour à objectif, les paliers comptés
             passees: {} }                                          // les saisons finies : { 'automne-2026': { xp, crans, titre } }
```
- `recus` : masque des crans **reçus** (bit k-1 = cran k) ; un cran atteint et pas reçu est « à recevoir » (`aRecevoir`), pour toujours.
- **Réparation** (`SAISONS.etat`, jamais d'exception) : pas un objet / tableau → neuf ; `xp` pas un nombre fini ≥ 0 → 0 ; `recus` pas un entier
  ≥ 0 → 0 (les bits au-delà des crans gardés) ; `j` abîmée → neuve **avec les compteurs du moment** (rien de compté deux fois) ; `ev`, `sem`,
  `veille`, `passees` remis d'aplomb un à un ; `id` inconnu ou d'une saison finie → archivé (§ 7.5).
- **Vieilles sauvegardes** : pas de `st.piste` → rien n'est créé avant le 13 nov. 12 h ; pendant la saison, créée au premier `pas`. Une vieille
  sauvegarde rouverte après le 30 novembre sans `st.piste` n'a rien à recevoir (elle n'a pas joué la saison).

### 7.5 La fin de la saison
Au premier `pas` après la fin (ou à l'ouverture de l'appli) : les crans atteints et pas reçus sont **donnés d'office** (une feuille « La saison
d'automne est finie : voici ce qui t'attendait »), puis `passees['automne-2026'] = { xp, crans, titre }` et `st.piste` repart pour la saison
active (l'hiver le 1er déc.) ou `id: ''` s'il n'y en a pas. Le carnet lit `passees` (« Saison d'automne 2026 : 22/22, Feuille d'or »).

### 7.6 L'écran de la saison (B)
- **La carte** `#piste` dans le tiroir de la boulangerie, sous `#objectifs` : un ticket « Saison d'automne · cran 7/22 · 340/400 XP » (barre),
  la pastille « Recevoir » quand un cran attend ; un toucher ouvre la feuille.
- **La feuille** : la piste horizontale (22 crans, défile au doigt, le cran en cours centré), chaque cran sa vignette et son état (reçu,
  à recevoir, à venir), « Recevoir » (un cran) / « Tout recevoir », la ligne « D'où vient l'XP » (les six sources, ce qui reste à prendre
  aujourd'hui), « encore 9 j » ; au-delà du 22e, la jauge du titre.
- **L'annonce** (une fois, joueurs existants) : après l'annonce du Marché, jamais en même temps (file `tenterAnnonces`).
- **Nouveaux joueurs** (l'accueil) : un déblocage `piste` (bit 15, `ACCUEIL.deblocages`, ajouté à `TOUS`) : seuil `a.r === 1 || st.lifetime >= 1e6`
  (après « Ton premier jour » réussi, ou à 1 M€, ~12 min de jeu) ; son annonce dans la file de l'accueil. **L'XP compte dès le début, carte
  cachée** : à son apparition, les crans déjà atteints sont « à recevoir ». Une vieille sauvegarde (`t: 1`) la voit tout de suite.
- **Tests** : comme l'accueil, la saison est éteinte sous `navigator.webdriver` sauf `window.__saison === true` (seul `test/fournil-saison.cjs`
  la pose) : aucun test existant ne voit la carte ni l'annonce. Éteinte, `SAISONS.pas` ne tourne pas ; `st.piste` n'est pas créée.
- Le carnet (« Mes décos ») : les familles `piste-automne` et `marche`, la tenue `automne` dans la garde-robe, le titre dans « Les titres ».

---

## 8. Les simulations (reproductibles, `outils/marche/`)

| Outil | Ce qu'il mesure | Durée |
|---|---|---|
| `proto.js` | le prototype : `src/hantee.js` lu sur le disque, dates, paliers, profils, id remplacés | — |
| `rythme.js [--vite] [--json f]` | paliers des 4 profils (8 graines), enveloppe (12+12 marathons), marges | ~3 min (4 cœurs) |
| `saison.js [--json f]` | la piste sur 4 profils + nouveaux joueurs (le 13, le 20) | ~2 min |
| `longevite-saison.js` | `test/longevite.js` sans/avec la piste, bruit d'une étoile, CIBLES | ~5 min |
| `sql-v69.cjs <pglite>` | le patch dans PGlite | ~20 s |

### 8.1 Le rythme des paliers (`rythme-resultats.txt`)
| Profil | min/j | plus haut (médiane, étendue) | le 12e | paliers par jour | noisettes (médiane) |
|---|---|---|---|---|---|
| occasionnel | 17 | 10 (10-10) | — | 1 1 2 2 2 1 1 0 | 1,7e14 |
| quotidien | 60 | 14 (14-14) | jour 5 | 3 3 3 2 2 1 0 0 | 2,2e15 |
| assidu | 120 | 16 (16-17) | jour 4 | 3 3 3 3 2 2 0 1 | 5,4e15 |
| très actif | 480 | 20 | jour 4 | 3 3 3 3 2 2 2 2 (le 20e le 8e jour) | 9,6e16 |
Avec les seuils de la Maison hantée tels quels : 11 / 15 / 17 / 20 (un jour de plus) ; relevés à partir du 11e pour garder le « juste milieu ».

### 8.2 La piste (`saison-resultats.txt`)
| Profil | XP | crans | finie | titre |
|---|---|---|---|---|
| occasionnel 17 min, 4 j/7 | 650 | 13/22 (59 %) | — | non |
| (repère) occasionnel 17 min, 7 j/7 | 910 | 18/22 | — | non |
| quotidien 1 h | 1 215 | 22/22 | **28 nov.** | non |
| assidu 2 h | 1 365 | 22/22 | 26 nov. | oui |
| très actif 8 h | 1 590 | 22/22 | 24 nov. | oui |
| quotidien, nouveau le 13 | 1 215 | 22/22 | 28 nov. | non |
| quotidien / occasionnel, nouveaux le 20 | 660 / 370 | 13 / 7 | — | non |
Sources du quotidien : objectifs 270, journées 180, défis 225, série 170, paliers 280, casino 90.

### 8.3 La longévité (`longevite-saison-resultats.txt`)
Voir § 12 (résultat recopié après la dernière exécution). `node test/longevite.js --test` (inchangé) passe sur master.

---

## 9. Contrat par fichier (trois constructeurs en parallèle)

**Ordre** : A pousse d'abord (jour 1) des **amorces** de tous les nouveaux fichiers (`src/marche.js` complet ou presque, `src/saison.js`,
`src/saison-automne.js`, `src/boutiquemarche.js` vide qui rend `actif() → false`) et `build.js` avec l'ordre final ; B et C partent de là.
Fichiers partagés (un seul les édite à la fois, fusion soignée) : `build.js` (A), `.github/workflows/pages.yml` (B, à la fin, toutes les lignes
d'un coup), `src/page.html` et `src/style.css` (B ; C n'y ajoute que ses classes de scène, en fin de fichier), `src/icons.js` (C),
`src/game.js` (A), `src/chaine.js` (C), `src/ui.js` (B), `src/classement.js` (A). Jamais `zombies/`, `src-zombies/`, `poncin`.

### A — règles et serveur
- `src/marche.js` (§ 2) ; `MARCHE.simuler`, `PROFILS`, la fiche complète (textes, `manoir`, `activites`, `evenements`).
- `src/saison.js`, `src/saison-automne.js` (§ 7) : `ajouter, active, etat, pas, crans, aRecevoir, recevoir, titre, fin, possede, SOURCES, PISTE`.
- `src/game.js` : `GARDEROBE` (§ 2.8, § 7.3 : 13 pièces, 3 ensembles `marche`, `marche-or`, `automne` sans bonus), `AURAS.feuilles`,
  `DISTINCTIONS` (2), `COMPAGNONS.ecureuil`, `ACCUEIL.deblocages` + `piste` (bit 15) ; `newState` **inchangé**.
- `src/classement.js` : `EVTS`, `NOMS_EVT`, `TITRES`, la photo (`dm`), `decosMarche`.
- `build.js` : `… 'progression.js', 'saison.js', 'saison-automne.js', …, 'hantee.js', 'marche.js', 'boutiquehantee.js', 'boutiquemarche.js', 'hanteeactivites.js', …`.
- `supabase/fournil-classement.sql` : la v6.9 recopiée (§ 4.4) ; `supabase/README.md` : une ligne « v6.9 : le Marché d'automne ».
- Tests : `test/fournil-marche.test.js`, `test/fournil-marche-graines.js`, `test/fournil-saison.test.js`, la section v6.9 de
  `test/fournil-classement-sql.cjs`.

### B — écran
- `src/evenement.js` (§ 1 : `ficheBoutique`, `ficheMarche`, `liste`, motif `marche`), `src/hanteeactivites.js` (par fiche), `src/ui.js` (§ 1,
  § 5, § 7.6 : `envoiEvenement`, onglets, coin, minuteurs, réglages, Mes récompenses, podium, visite, `SCENE.decosMarche`, la carte et la
  feuille de la piste, l'annonce, `SAI`, `SAISONS.pas` dans `frame`, `__fournil.marche`, `fermerMarche`, `evMarche`, `MC`, `piste: { etat,
  pas, recevoir, feuille }`), `src/page.html` (`#b-marche`, `#marche` cloné de `#hantee` avec les ids `mc-`, `#piste`), `src/style.css`
  (`:is(#hantee, #marche)`, le thème, `#piste`, la feuille ; 360 × 640 sans défilement horizontal), `src/nouveautes.js`.
- Tests : `test/fournil-marche.cjs`, `test/fournil-marche-activites.cjs`, `test/fournil-saison.cjs` ; `pages.yml`.

### C — scène, décos, vignettes
- `src/boutiquemarche.js`, `src/scene.js` (`decosMarche`, `MDECO`, `decosMarcheVues`, le thème), `src/vie.js` (`DECORS.marche`),
  `src/meubles.js` (`MEUBLES.marche`, 14 décos), `src/persos.js`, `src/icons.js`, `src/hd.js` (lot `marche`), `src/sons.js`,
  `src/garderobe.js` (`PERSOS.TENUES` des collections `marche`, `marche-or`, `marche-couronne`, `automne` ; `COLLECTION`, `QUELLE`),
  `src/chaine.js` (familles, `OBTENIR_TENUE`), `src/vignettes.js` + `outils/vignettes/`, `fournil/hd/marche/`, `fournil/media/` (option).
- Tests : `test/fournil-marche-boutique.cjs` (calqué sur `test/fournil-hantee-boutique.cjs`), les nouvelles décos dans `test/fournil-decos.cjs`.

---

## 10. Les tests à écrire

**Node** (`TZ=Europe/Paris`) :
1. `test/fournil-marche.test.js` : fenêtre (13 nov. 12 h → 20 nov. 20 h, 8 jours, ven. 13 = 1, ven. 20 = 8, grâce, onglet jusqu'au 4 déc.) ;
   l'API **mot pour mot** (`Object.keys(MARCHE)` ⊇ `Object.keys(HANTEE)`, mêmes types) ; la fiche (ids uniques, 8 recettes, 17 Astuces,
   20 paliers croissants, jours 3,3,3,3,2,2,2,2, récompenses § 2.6, 9 sortes, 8 recettes du jour) ; absence ; paliers donnés une fois ;
   l'album (bronze/argent/or, l'écureuil) ; vieille/abîmée `st.marche` réparée ; **le rythme** en médiane sur 8 graines (occasionnel 9-11,
   quotidien 13-15, assidu 15-17, très actif 20 le jour 8) ; **l'enveloppe** : la ligne `'marche'` lue dans le SQL (le patch tant que le
   fichier complet ne l'a pas, puis le fichier complet), marathon ≥ ×2,2 dessous (10 graines, Astuces offertes), ≤ ×20 après 7 h 15,
   croissante, la fenêtre du SQL = celle du jeu ; la Maison hantée et le Marché ne se chevauchent pas (grâce comprise).
2. `test/fournil-saison.test.js` : `SAISONS.active` aux bornes (13 nov. 11:59:59 → rien ; 12:00 → automne ; 30 nov. 23:59:59 → automne ;
   1er déc. 0 h → rien tant que l'hiver n'existe pas) ; `pas` idempotent (deux appels, rien de plus), chaque source et son plafond, le défi
   une fois par semaine, la série (aujourd'hui et hier), les paliers du Marché ; réparation (`null`, `[]`, `{ xp: 'x', recus: -1, j: 3 }`) ;
   `recevoir` une fois par cran, le lot exact (§ 7.3), le titre à 1 350 ; la fin (crans dus donnés, archivés) ; la simulation de la piste
   (la logique de `outils/marche/saison.js` sur le vrai moteur) : quotidien fini du 27 au 29 nov., occasionnel 4 j/7 de 40 à 65 %, très actif
   avant le 26 ; et la longévité (`outils/marche/longevite-saison.js` sur le vrai moteur : aucun effet notable).
3. `node test/longevite.js --test` inchangé, toujours vert.

**PGlite** : la section v6.9 de `test/fournil-classement-sql.cjs` (local ; la CI n'a pas ce test Fournil) = `outils/marche/sql-v69.cjs`
transposé, plus « le fichier complet porte le même tableau et le même code ».

**Playwright** (Chromium préinstallé, un par un, `NODE_PATH=/opt/node22/lib/node_modules`, jamais `playwright install`) :
1. `test/fournil-marche.cjs` (390 × 844, le sam. 14 nov. 2026 à 11 h, `HORLOGE` fixée) : l'icône et son minuteur, l'annonce (une seule),
   entrer, le tiroir (§ 1 : trois crans en 390 × 844, 375 × 812, 360 × 640, glisser poignée et barre, la liste défile, tirée vers le bas en
   haut la referme), la feuille des paliers (« s'ouvre dimanche 15 »), un palier reçu (étoiles, déco posée, bonnet dans la garde-robe),
   l'onglet « Marché » du classement (Supabase simulé : `p_evt: 'marche'`), le réglage « Masquer », le bilan après le 20 nov. 20 h, la place
   d'acharné (7e : 3 ★ et le boost, une fois), la tenue en or (2e), aucune erreur de page ; la Maison hantée reste lisible (son onglet jusqu'au 16).
2. `test/fournil-marche-activites.cjs` : calqué **geste pour geste** sur `test/fournil-hantee-activites.cjs` (jauge, client servi, fournée
   parfaite, apparitions, commande, ×6 qui s'assoupit, album, bulles, colonne, tiroir), en haute puis en éco.
3. `test/fournil-marche-boutique.cjs` (C) : la Halle en haute et en éco, les décos posées, la visite d'un copain qui a les décos du Marché.
4. `test/fournil-saison.cjs` (`window.__saison = true`) : la carte, la feuille, recevoir un cran puis tout, le titre ; une vieille sauvegarde
   sans `st.piste` ; un nouveau joueur (`__accueil = true`) : carte cachée puis annoncée au déblocage, crans à recevoir ; après le 30 nov. :
   la feuille de fin, l'archive ; 360 × 640 sans défilement horizontal.

**CI** (`.github/workflows/pages.yml`) : `node test/fournil-marche.test.js && node test/fournil-saison.test.js` dans la ligne « deploy » (et
celle de l'essai) ; `fournil-marche.cjs`, `fournil-saison.cjs` dans `fournil2` (ports `PORT_MARCHE: '8884'`, `PORT_SAISON: '8885'`) ;
`fournil-marche-activites.cjs` dans une **nouvelle tâche** `fournil13` (comme `fournil9` pour le Manoir : ~30 min) ;
`fournil-marche-boutique.cjs` avec `fournil-hantee-boutique.cjs`.

### Les captures attendues (`test/shots/marche/`, `test/shots/saison/`)
annonce du Marché · la Halle en haute (jour, 11 h) et en éco · le soir (17 h, lampions) · tiroir haut / mi / fermé en 390 × 844 et 360 × 640 ·
feuille des paliers · album de la forêt (bronze, argent) · fête d'une sorte · commande du marché · les trois mini-jeux habillés · bilan ·
onglet « Marché » du classement · « Tu as fini 7e du Marché d'automne » · la carte de la piste · la feuille de la piste (cran 0, 7, 22, titre) ·
l'annonce de saison · Mes décos (familles Marché et Saison) · la garde-robe (tenue d'automne, en or, couronne, tenue de saison) · le
boulanger 3D en tenue d'automne · les décos posées dans la boutique · l'écureuil sur le comptoir.

---

## 11. Risques et parades
- **Le temps** (9 jours avant le 13) : l'éco suffit pour la mise en ligne ; la HD et la vidéo peuvent suivre (sans casser l'API de la scène).
- **La CI** : une tâche de plus (~30 min) ; regrouper les poussées sur master (chaque poussée relance tout).
- **Le SQL pas collé à temps** : sans gravité (§ 4.4) ; le rappeler au joueur la veille.
- **La généralisation de `#hantee` en CSS / `evenement.js`** : la Maison hantée est finie, mais son bilan, son onglet (jusqu'au 16 nov.),
  sa visite, ses décos et ses tests restent : `test/fournil-hantee*.cjs` doivent rester verts sans changement.
- **La piste et les tests existants** : éteinte sous webdriver (§ 7.6) ; la carte `#piste` ne compte pas comme une carte recette.
- **`st.saison` existe déjà** (la recette de saison) : tout est dans `st.piste` ; jamais `st.saison` ni `G.SAISON` touchés.
- **Le mot « marche »** sert déjà (l'animation de marche des personnages, `MARCHE_MULT`, le projet « marché couvert », l'ancien Sortilège) :
  le global des règles est `MARCHE`, l'état `st.marche`, les ids `mc-`, les classes CSS `#marche`/`.mc` ; aucun `marche:` de persos.js touché.
- **La série** dépend du classement : sans classement (l'artefact, un joueur non inscrit), la série locale (§ 7.2) la remplace.
- **Les simulations** : prototype construit sur `src/hantee.js` : si A change un chiffre du moteur, il refait `rythme.js` et la table.

## 12. Résultats recopiés et écarts
(rempli par la dernière exécution des outils ; puis par les constructeurs)
