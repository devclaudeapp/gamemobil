# Le Fournil — « L'accueil des nouveaux joueurs » : contrat de conception

Lot choisi par le joueur le 3 novembre 2026. Branche `nouveaux` (depuis origin/master 8de895f). Ce contrat est la référence du
constructeur : le lire en entier avant de coder. Copie commitée : `docs/accueil-contrat.md` (les deux restent identiques).

But : un nouveau copain accroche dès les premières minutes. Aujourd'hui tout s'affiche d'un coup. Demain : des premiers pas guidés
(environ 3 min), une carte « Ton premier jour » de 7 étapes avec une récompense, puis les boutons qui apparaissent quand ils servent,
avec une petite annonce, une à la fois. **Un joueur existant ne perd jamais rien et ne voit aucune annonce en rafale.**

---

## 0. Ce qui s'affiche aujourd'hui (master 8de895f), au premier lancement et dans la première heure

Relevé dans le code (src/page.html, src/ui.js, src/game.js, src/evenement.js, src/nouveautes.js) :

| Où | Élément | Aujourd'hui, sauvegarde vide |
|---|---|---|
| Haut | `#b-nouveautes` (cadeau) | visible ; **son point s'allume** (`NV.vueNeuve()` laisse la plus récente non vue) |
| Haut | `#b-etoiles` (★ et nouvelle boutique) | visible, « 0 » |
| Haut | `#b-classement` (classement + chat) | visible dès que le classement est configuré (`fournil/config.js`) |
| Haut | `#b-jetons` | caché hors d'une boutique de la chaîne (CSS) — inchangé |
| Coin de la scène | `#b-chaine` (Ma chaîne) | toujours visible (« elle commence à ta 2e boutique ») |
| Coin | `#b-atelier` (mini-jeux) | toujours visible |
| Coin | `#b-quartier`, `#b-hantee` | pendant la fenêtre de l'événement (`EVT.visible()`), + annonce `EVS.annoncer` 800 ms après le lancement |
| Scène | porte du fond (casino caché, 5 touches, `toquer`) | active dès le début |
| Scène | vitrine des trophées (`hitTrophees`) | si classement |
| Scène | boulanger (`hitBoulanger` → page Boulanger) | dès le début |
| Scène | client mystère | `mystereTimer` 150 s puis 150–350 s (toast « Un client mystère ! ») |
| Scène | événement de boutique (`#evenement`, toast) | `evTimer` 180 s puis toutes les 3–7 min |
| Scène | habitués (toast) | dans leur créneau, après quelques secondes |
| Tiroir | `.modes` ×1/×10/×100/Max, `#b-ameliorations` (Bonus, badge) | visibles |
| Tiroir | `#b-second` | dès la boutique n°5 (déjà géré) — inchangé |
| Tiroir | `#objectifs` (ticket objectifs du jour) | visible |
| Tiroir | `#boosts` | caché tant que la réserve est vide — inchangé |
| Tiroir | carte de la recette de saison | en tête de liste + toast « Nouvelle recette de saison » au **premier pas de jeu** (`out.saison`) |
| Tiroir | 8 cartes recettes + la carte verrouillée de la n°2 | visibles (play.cjs compte 9 cartes) — inchangé |
| Onglets | Boutique, Défis, Boulanger, Journal, Réglages | les cinq visibles ; Défis : objectifs, semaine, concours, Atelier ; Boulanger : talents, Ma chaîne + Mes décos, garde-robe, trophées, stats ; Journal : nouvelles et carnet |
| Bulle | `#indice` + doigt animé (`.main`, animation `tape`) | `st.tuto` / `INDICES` (7 étapes : baguette, améliorer, croissants, Léo, bravo/objectifs 8 s, point de talent, meuble) |
| Toasts | trophée « Première fournée » | dès la 1re vente |
| Lancement | feuille d'absence, récap du parcours, annonces du lot progression (`tenterAnnonces`), `EVS.annoncer`, `tenterCopains`, `verifierCadeaux` (3 s), `lireProjets` (4 s) | pas de feuille d'absence au tout premier lancement |
| Bandeau | `.maj` « Nouvelle version » (`verifierVersion`) | à 60 s puis toutes les 5 min si une version est sortie |
| Nouveautés | feuille `sheetNouveautes` | **ne s'ouvre jamais seule** (seulement par le cadeau) |
| Plus tard | chat (compagnon, à l'éclair), second (n°5), feuilles de la nouvelle boutique | inchangés |

Mesures (scripts du scratchpad `accueil/humain.js` et `accueil/jalons.js`) : un humain efficace (une touche toutes les 1,2 s) vend
à 0 min, améliore à 0,1 min, ouvre les croissants à 0,8–1,3 min, embauche Léo à **3–3,8 min**, fait ses 3 objectifs du jour vers 3 min
(objectifs calibrés au départ), atteint 6 000 € à 4 min, 100 000 € à 6–7 min, 1 M€ à 11–12 min, 10 M€ à 21 min, 100 M€ à 51 min.
Le joueur simulé de test/longevite.js est 3 à 5 fois plus rapide : les seuils ci-dessous sont pensés pour l'humain.

### Tests Playwright qui partent d'une sauvegarde vide (aucune clé `fournil.v2` posée avant le lancement)

`scene.cjs`, `atelier.cjs`, `fournil-activites-ecran.cjs`, `fournil-amenage.cjs`, `fournil-batterie.cjs`, `fournil-blackjack.cjs`,
`fournil-chat.cjs`, `fournil-clients3d.cjs`, `fournil-compagnons.cjs`, `fournil-decos.cjs`, `fournil-equipe3d.cjs`,
`fournil-hantee-activites.cjs`, `fournil-hantee-annonce.cjs`, `fournil-hantee-boutique.cjs`, `fournil-hd.cjs`, `fournil-meubles.cjs`,
`fournil-notifs.cjs`, `fournil-nouveautes.cjs`, `fournil-persos.cjs`, `fournil-planete.cjs`, `fournil-retours.cjs`, `fournil-roulette.cjs`,
`fournil-sons.cjs`, `fournil-standing.cjs`, `fournil-vignettes.cjs` ; et, pour leur première page au moins, `play.cjs` (partie neuve
jouée au doigt : il attend les textes « Touche la baguette », « améliore », « croissants », « Léo » de la bulle, 9 cartes visibles,
5 onglets, le ticket des objectifs, `#b-atelier` visible, le badge Journal…), `fournil-atelier.cjs`, `fournil-chaine.cjs`,
`fournil-classement.cjs`, `fournil-essai.cjs`, `fournil-garderobe.cjs`, `fournil-hantee.cjs`, `fournil-progression.cjs`,
`fournil-quartier.cjs`, `fournil-recettes-boutique.cjs`, `fournil-recompenses.cjs`, `fournil-reveil.cjs`, `fournil-triche.cjs`,
`fournil-version.cjs` (ceux-là modifient ensuite `__fournil.st` ou posent une sauvegarde). Presque tous supposent tout visible dès le
départ (coin, classement, cadeau, onglets, Bonus, porte du fond, annonces d'événement) et lisent le texte des toasts (la file des toasts
n'en garde que deux).

---

## 1. Décision pour les tests existants : un interrupteur, aucun test existant modifié

**L'accueil (guidage renforcé, déblocages, annonces, carte du premier jour, récompense) est éteint quand `navigator.webdriver` est
vrai** (Playwright le pose : vérifié, `navigator.webdriver === true` dans notre Chromium), sauf si la page le force :

```js
// src/ui.js, en tête de l'IIFE
const ACC = (() => { try { if (window.__accueil === true) return true; if (window.__accueil === false) return false; return !navigator.webdriver; } catch (e) { return true; } })();
```

- `window.__accueil = true` (posé par `addInitScript`) : l'allume sous Playwright — seul `test/fournil-accueil.cjs` le fait.
- `window.__accueil = false` : l'éteint partout (utile à la main).
- Éteint, le jeu se comporte **exactement comme master** : tout visible, `INDICES` d'origine (mêmes textes, sans « Passer », sans
  texte d'attente), aucun report d'événement, aucune annonce d'accueil, pas de carte du premier jour, pas de récompense. `st.accueil`
  existe quand même (newState) mais n'est ni lu ni écrit par l'interface.

Pourquoi : c'est le moins risqué. Adapter ~40 tests (chacun suppose tout ouvert et lit les toasts) multiplierait les risques et le
temps de CI ; un paramètre d'URL obligerait à toucher chaque `goto`. Le motif existe déjà (`window.__sansQuartier`). Un vrai joueur
n'a jamais `navigator.webdriver`. Les outils de capture du dépôt (outils/, Playwright) restent sur l'ancien comportement : voulu.
Les tests Node (`test/*.test.js`, `longevite.js`) n'ont pas d'interface : `newState` gagne seulement le champ `accueil`, qu'aucun test
ne compare (vérifié : `fournil-chaine.test.js` compare `newState().chaine`, `fournil-garderobe.test.js` compte les 4 pièces de base
**possédées** au départ — la tenue d'apprenti n'est pas possédée au départ).

Fichiers de test touchés : **aucun existant** ; nouveaux `test/fournil-accueil.test.js` (Node) et `test/fournil-accueil.cjs`
(Playwright), ajoutés à `.github/workflows/pages.yml` (§ 9).

Dans la suite, « accueil actif » = `ACC` vrai **et** `st.accueil.t === 0`.

---

## 2. L'état : `st.accueil` (forme compacte)

```js
st.accueil = { v: 1, o: 0, r: 0, d: 0, t: 0 }
```

- `v` : version du format (1).
- `o` : masque des 7 étapes du premier jour faites (bit k = étape k, § 4), 0 à 127 ; une étape faite le reste (OU binaire).
- `r` : 1 quand la récompense a été donnée (jamais deux fois).
- `d` : masque des déblocages ouverts (bit = `bit` du tableau § 5) ; un bit posé ne s'efface jamais. Les bits inconnus (une version
  future) sont gardés tels quels.
- `t` : 1 = « tout ouvert » (vieille sauvegarde) : tout est visible, pas de carte, pas d'annonce, pas de récompense.

Les premiers pas n'ont **pas** de champ à eux : ils restent `st.tuto` (index dans `INDICES`) — on ne double pas. Premiers pas finis
⇔ `st.tuto >= 4` ; passés (bouton « Passer ») ⇔ `st.tuto` mis à 5.

### 2.1 newState et réparation

- `GAME.newState` : `accueil: accueilNeuf()` (= `{ v: 1, o: 0, r: 0, d: 0, t: 0 }`).
- `GAME.accueil(st)` remet d'aplomb et rend l'objet (comme `garderobe(st)`) : pas un objet → `accueilAncien(st, st.now)` ; sinon
  `v = 1`, `o = entier 0..127` (sinon 0), `r = r ? 1 : 0`, `d = entier ≥ 0` (sinon 0), `t = t ? 1 : 0`. Appelée par toutes les
  fonctions de l'accueil (jamais d'exception sur une sauvegarde abîmée).

### 2.2 Vieilles sauvegardes (règle « un joueur existant ne perd jamais rien »)

Dans `lire(raw)` (src/ui.js), **avant** la boucle qui recopie les champs neufs : `const sansAccueil = !s.accueil || typeof s.accueil !== 'object';`
puis, après la boucle : `if (sansAccueil) s.accueil = G.accueilAncien(s, HORLOGE.maintenant()); G.accueil(s);`
(sinon la boucle y mettrait l'accueil neuf d'une partie neuve). `lire` sert aussi à l'essai (copie de la vraie partie) et au code de
sauvegarde importé : tous passent par là.

`GAME.accueilAncien(s, now)` :
- **ancienne** si l'un de : `s.tuto >= 4`, `s.boutiques >= 2`, `s.lifetime >= 1e5`, `s.etoiles >= 1`,
  `now - (s.created || 0) > 24 h`, `s.arriere && s.arriere.trouvee` → `{ v: 1, o: 127, r: 1, d: TOUS, t: 1 }` :
  tout ouvert, premiers pas et objectif considérés faits, **aucune récompense**, **aucune annonce**.
- sinon (une partie commencée il y a moins d'un jour, encore dans les premiers pas, sous 100 000 €) : une partie neuve qui reprend :
  `o` = les étapes déjà faites (§ 4), `d` = **les déblocages dont le seuil est déjà atteint, ouverts en silence** (pas d'annonce),
  `r: 0`, `t: 0`.

`TOUS` = `(1 << 15) - 1` (les 15 bits du § 5) ; un bit ajouté plus tard sera ajouté à `TOUS` **et** une vieille sauvegarde déjà
`t: 1` le voit ouvert par `t` (on ne relit jamais `d` quand `t` vaut 1).

---

## 3. Les premiers pas guidés (≈ 3 min)

On **reprend `INDICES`** (src/ui.js ~l. 838) et la bulle `#indice` avec son doigt animé (`.main`, déjà animé par `tape` / `tapeHaut`).
Accueil actif, chaque entrée gagne un texte d'attente (`attente`, montré quand `pret()` est faux, avec la même logique de cible) et la
bulle porte un bouton **« Passer »** sur les étapes 0 à 3. Éteint (`ACC` faux), `INDICES` reste tel quel.

| `st.tuto` | Texte (pret) | Texte d'attente (accueil actif) | Cible du doigt | Fin |
|---|---|---|---|---|
| 0 | Touche la baguette pour la cuire et la vendre ! *(inchangé)* | — | `.barre` de la carte 0 | `st.stats.ventes >= 1` |
| 1 | Avec tes euros, améliore la baguette : chaque niveau rapporte plus. *(inchangé)* | Encore ! Touche la baguette : il te faut {coût} pour l’améliorer. | pret : `[data-a="ameliorer"]` de la carte 0 ; attente : `.barre` de la carte 0 | `stations[0].niv >= 2` |
| 2 | Débloque les croissants : 20 € la fournée ! *(inchangé)* | Continue : les croissants s’ouvrent à {120 €}. | pret : `[data-a="debloquer"]` carte 1 ; attente : `.barre` carte 0 | `stations[1].niv >= 1` |
| 3 | Embauche Léo : il cuit les baguettes tout seul, même quand tu n’es pas là. *(inchangé)* | Cuis et vends encore : Léo s’embauche à {1 500 €}. | pret : `[data-a="embaucher"]` carte 0 ; attente : `.barre` de la carte la plus rentable non embauchée (0 ou 1) | `stations[0].staff` |
| 4 | **accueil actif :** Bravo, ta boulangerie tourne ! Voici ta carte du premier jour : 7 étapes, une tenue et un boost à la clé. *(éteint : le texte d'origine)* | — | `#debutant` (accueil actif) ; `#objectifs` (éteint) | 8 s (`hintUntil`, inchangé) |
| 5 | Le boulanger a un point de talent ! … *(inchangé)* | — | onglet Boulanger | `vuBoulanger` ; **accueil actif : aussi fini dès que l'annonce `boulanger` (§ 5) a été montrée** (pas deux bulles pour le même onglet) |
| 6 | Ton salon de thé ! … *(inchangé)* | — | zone `tables` de la scène | `stats.meubles > 0` |

Les textes « pret » des étapes 0 à 3 gardent les mots que `play.cjs` attend (« Touche la baguette », « améliore », « croissants »,
« Léo ») : même allumé, le parcours de `play.cjs` reste lisible. Les montants entre accolades sont formatés par `G.fmtEur`.

- **Une étape à la fois** : c'est déjà la règle de `indices()` (une seule entrée `INDICES[st.tuto]`).
- **Passer** : `<button type="button" class="passer" data-a="passer-tuto">Passer</button>` dans `#indice` (sous la bulle), seul
  élément cliquable de `#indice` (`#indice .passer { pointer-events: auto }`), cible tactile ≥ 44 × 32 px, montré seulement accueil
  actif et `st.tuto <= 3`. Toucher : `st.tuto = 5`, `hintStep = -1`, bulle cachée, `save()`. La carte du premier jour et les
  déblocages continuent normalement (on saute le guidage, pas le jeu).
- **Reprise après rechargement** : `st.tuto` est sauvé à chaque étape franchie (déjà : `save()` dans `indices()`) et chaque `fini()`
  se lit dans l'état : on reprend à l'étape en cours ; `hintDefile` repart à -1 (la liste redéfile une fois vers la cible).
- **Le tiroir fermé ou une autre page pendant les premiers pas** (accueil actif, étapes 0–3) : au lieu de cacher la bulle, elle
  pointe la poignée `#poignee` (« Remonte le tiroir pour voir tes recettes. ») ou l'onglet Boutique (« Reviens à la boutique pour
  continuer. »).
- **Le calme pendant les premiers pas** (accueil actif et `st.tuto < 4`), dans `frame()` avant `G.tick` :
  `st.evTimer = Math.max(st.evTimer, 30); st.mystereTimer = Math.max(st.mystereTimer, 30);` et `G.tick` reçoit
  `() => 0.999` comme générateur (comme pendant l'Atelier) : ni événement, ni client mystère, ni habitué. Le premier événement vient
  donc au plus tôt 30 s après les premiers pas. Le bandeau `.maj` attend (`verifierVersion` sort tout de suite). Le toast de la recette
  de saison attend son déblocage (§ 5). Les toasts de trophée restent (la « Première fournée » est une fête bienvenue).

---

## 4. L'objectif de débutant : « Ton premier jour » (7 étapes)

Montré dès que les premiers pas sont finis ou passés (`st.tuto >= 4`), accueil actif, tant que `r === 0`.

| k (bit) | Texte de l'étape | Faite quand (lu dans l'état, monotone grâce au bit) | Humain efficace |
|---|---|---|---|
| 0 | Débloque les pains au chocolat | `stations[2].niv >= 1` | ~4 min |
| 1 | Monte la baguette au niveau 25 : gains ×2 ! | `stations[0].niv >= 25` | ~4 min |
| 2 | Touche un client mystère | `stats.pourboires >= 1` | 5–10 min |
| 3 | Réussis un événement de la boutique | `stats.commandes + critiques + petrissages + pannes >= 1` | 5–15 min |
| 4 | Améliore un meuble du salon | `stats.meubles >= 1` | ~5 min (l'indice n°6 y mène) |
| 5 | Achète ton premier bonus | `Object.keys(st.ameliorations).length >= 1` (farine : 50 000 €) | ~10 min |
| 6 | Réussis les trois objectifs du jour | `stats.serieMax >= 1` | 3–30 min |

Toutes atteignables dans la première heure pour un joueur attentif ; un joueur occasionnel (deux sessions, 5 + 12 min) les finit dans
sa première journée (le hasard des événements et du client mystère peut pousser à la 2e session). Le joueur simulé de longevite.js
les finit toutes dans sa première session, aux trois profils et aux cinq départs (`accueil/recompense.js` : jour 0,31–0,34).

`GAME.ACCUEIL.etapes` : `[{ id, txt, fait(st) }]` dans cet ordre. `GAME.accueilPas(st)` : OU des bits des étapes faites (accueil non
`t`), rend `{ nouvelles: [k…], toutes: bool }`. Appelée par l'interface une fois par seconde (accueil actif) ; une étape nouvellement
faite : `toast('Premier jour : ✓ {txt} ({n}/7)')` (un seul toast, pas de fête) et la carte se redessine.

### 4.1 La carte `#debutant`

- Où : dans `#page-boutique`, **juste après `.barre-achat` et avant `#objectifs`** :
  `<button id="debutant" class="ticket debutant" type="button" aria-label="Ton premier jour" hidden></button>`.
  Même gabarit que le ticket des objectifs (une ligne de titre, une petite ligne, une pastille), hauteur ≤ 60 px à 360 px de large.
- Contenu : `Ton premier jour · {n}/7` ; petite ligne : la première étape pas faite (texte du tableau) ; 7 points (`.db-points i`,
  pleins pour les faites) ; pastille à droite : chevron, ou « Cadeau ! » (classe `pret`, pulsation douce, coupée par
  `prefers-reduced-motion`) quand les 7 sont faites.
- Toucher : la feuille « Ton premier jour » (`sheetDebutant`) : les 7 étapes (✓ ou à faire, la suivante en gras), la récompense
  annoncée (« Une tenue d’apprenti pour ta garde-robe et un boost ×2 de 30 minutes »), et, les 7 faites, le bouton
  **« Recevoir ma récompense »** (`data-a="db-recevoir"`).
- Visible : accueil actif, `st.tuto >= 4`, `r === 0`, page Boutique (pas dans une boutique de la chaîne). Après la récompense : caché
  pour toujours.

### 4.2 La récompense (exacte)

`GAME.recompenseAccueil(st)` (une seule fois : `r` passe à 1 dans la même fonction, avant de rendre) — refusée (`{ ok: false }`) si
`t === 1`, `r === 1` ou les 7 étapes ne sont pas faites :
1. **La tenue d'apprenti** : deux pièces nouvelles, collection `apprenti`, **sans bonus** (règle du jeu : les objets cosmétiques
   n'accélèrent pas la boulangerie), sans ensemble, rareté `rare` :
   - `apprenti-tablier` : « Tablier d’apprenti », pièce `haut`, forme `tablier`, desc « Bleu de travail, une poche pour le carnet de recettes. »
   - `apprenti-foulard` : « Foulard d’apprenti », pièce `accessoire`, forme `foulard`, desc « Noué le premier jour. Il sent encore la farine. »
   Données par `donnerVetement(st, id)` (compte `stats.vetements`, note au journal) **et portées d'office** (`equiperCollection(st, 'apprenti')`) :
   le boulanger change de tenue sous les yeux du joueur.
2. **Un boost ×2 de 30 minutes dans la réserve** : `donnerBoostReserve(st, 2, 1800)`.
3. `note(st, 'Premier jour réussi : tenue d’apprenti et boost ×2')`.
Rend `{ ok: true, vetements: [objets], boost: { mult: 2, secs: 1800 } }`.

Interface (`recevoirDebutant`) : confettis + `son.deblocage()`, puis la feuille de la récompense (le portrait du boulanger dans sa
nouvelle tenue `ICONS.boulanger(...)`, « Ta tenue d’apprenti est dans ta garde-robe (onglet Boulanger). ») avec
**« Lancer le boost ×2 »** (`G.lancerBoostReserve` sur son index, comme `feuilleCopain`) et **« Plus tard »** (le boost reste dans
`#boosts`). `renderBoosts()`, `save()`. Le déblocage `garderobe` (§ 5) suit dans la file.

Palettes de la collection `apprenti` (bleu de travail, liseré fraise) : `{ tissu: '#5D8FC9', fonce: '#2F5A8A', clair: '#BFD8F2', bijou: '#E1496C' }`
(3D, src/garderobe.js) et `['#5D8FC9', '#2F5A8A', '#BFD8F2']` (icônes, src/icons.js `TENUES`).

### 4.3 Simulation : la récompense ne change pas le rythme des étoiles

Script : `accueil/bruit.js` (scratchpad) — test/longevite.js rejoué aux 5 départs × 3 graines (11, 12, 13), 30 jours, sans puis avec le
boost ×2 de 30 min lancé dès les 7 étapes faites (une approximation généreuse : le joueur simulé les finit dans sa 1re session).

| Profil | Étoiles j30 sans → avec (moyenne) | Écart | Dispersion due aux seules graines (sans boost) | 1re nouvelle boutique |
|---|---|---|---|---|
| occasionnel | 1 400 → 1 391 | −0,6 % | 1 212 à 1 545 | jour 4,20 → 4,20 |
| régulier | 2 420 → 2 504 | +3,5 % | 1 949 à 2 687 | jour 4,07 → 4,00 |
| assidu | 4 010 → 4 221 | +5,2 % | 3 511 à 4 378 | jour 3,00 → 3,00 |

Les étoiles aux jours 7 et 14 bougent aussi dans le bruit (j7 : 18 → 18, 67 → 61, 66 → 59). Les écarts restent **dans la dispersion
d'une simple graine** (le joueur simulé décide de repartir sur des seuils : une petite perturbation déplace une décision, d'où ±15 %
d'une graine à l'autre) ; la valeur directe du boost, 30 minutes de gains du premier jour, est négligeable devant les gains de la
première boutique (le jour 4). **Conclusion : pas d'effet notable ; aucune borne de longevite.js à toucher.** Le constructeur relance
`node test/longevite.js --test` (inchangé : la simulation ne joue pas l'accueil).

---

## 5. Les déblocages au fil du jeu

`GAME.ACCUEIL.deblocages` : `[{ id, bit, seuil(st) }]`, **dans cet ordre (= l'ordre de priorité de la file)**. Les bits sont fixés à
jamais (ne jamais réutiliser un bit). Un élément gaté est visible ssi `!ACC || st.accueil.t || (st.accueil.d & (1 << bit))`
(`ouvertA(id)` dans ui.js ; `GAME.accueilOuvert(st, id)` pour la partie règles : `t || bit`). Tous les seuils exigent aussi
« premiers pas finis ou passés » (`st.tuto >= 4`) : rien ne s'ouvre pendant le guidage.

| bit | id | Ce qui apparaît | Seuil (en plus de `st.tuto >= 4`) | Humain | Annonce (bulle) · cible |
|---|---|---|---|---|---|
| 0 | `boulanger` | onglet Boulanger ; toucher le boulanger dans la scène (`hitBoulanger`) | `G.niveau(st) >= 2` ou `G.ptsTalents(st) > 0` | ~1 min (montré après les premiers pas) | « Nouveau : l’onglet Boulanger ! Tu as un point de talent à dépenser. » (sans point : « Ton niveau, tes talents et tes trophées. ») · onglet Boulanger |
| 1 | `defis` | onglet Défis ; ticket `#objectifs` | — (premiers pas finis) | ~3–4 min | « Nouveau : les Défis ! Trois objectifs par jour, une étoile quand tu les finis. » · onglet Défis |
| 2 | `modes` | `.modes` (×1/×10/×100/Max) | une recette au niveau 10 (`stations.some(s => s.niv >= 10)`) | ~3–4 min | « Achète par 10, par 100 ou au maximum : ça va plus vite ! » · `.modes` |
| 3 | `bonus` | `#b-ameliorations` (Bonus et Mobilier) | `st.lifetime >= 6000` (le premier meuble) | ~4 min | « Nouveau : Bonus et mobilier, pour multiplier tes gains. » · `#b-ameliorations` |
| 4 | `etoiles` | `#b-etoiles` | `st.etoiles >= 1` ou `G.etoilesGagnables(st) >= 1` ou `st.boutiques >= 2` | ~3–30 min (3 objectifs du jour) | « Ta première étoile ! Chacune ajoute des gains, pour toujours. » · `#b-etoiles` |
| 5 | `journal` | onglet Journal | un événement réussi ou un pourboire (`commandes+critiques+petrissages+pannes+pourboires >= 1`) ou `lifetime >= 1e5` | ~6 min | « Nouveau : le Journal, l’histoire de ta boutique au jour le jour. » · onglet Journal |
| 6 | `saison` | la carte de la recette de saison (et son toast) | `lifetime >= 1e5` | ~6 min | si une saison est en cours : « Nouveau : {nom de la recette}, jusqu’au {date} ! Elle se cuit à la main. » · la carte saison ; sinon **silencieuse** |
| 7 | `classement` | `#b-classement` (et le chat, la vitrine des trophées `hitTrophees`, le bandeau des votes `#vote-bandeau`) | `lifetime >= 2.5e5` | ~8 min | si classement configuré : « Nouveau : le classement ! Mesure-toi aux autres boulangers, chaque semaine. » · `#b-classement` ; sinon silencieuse |
| 8 | `atelier` | `#b-atelier` | `lifetime >= 1e6` | ~12 min | « Nouveau : l’Atelier, trois mini-jeux pour gagner un peu plus. » · `#b-atelier` |
| 9 | `decos` | carte « Mes décos » (Boulanger), `#b-decos` (barre d'aménagement) | `stats.meubles >= 3` ou `lifetime >= 1e7` | ~15–20 min | si `CE` : « Nouveau : Mes décos, dans l’onglet Boulanger : arrange ta boutique. » · onglet Boulanger ; sinon silencieuse |
| 10 | `evenements` | `#b-quartier`, `#b-hantee` ; `EVS.annoncer` (annonces et bilans) | `lifetime >= 1e7` | ~21 min | **silencieuse** ; si un événement est ouvert, son annonce à lui (`EVS.annoncer(true)`) prend la place de la bulle |
| 11 | `garderobe` | carte garde-robe (Boulanger, `GRU.carte`) | possède une pièce hors collection `base` | à la récompense | « Ta garde-robe est dans l’onglet Boulanger : essaie ta tenue d’apprenti ! » · onglet Boulanger |
| 12 | `nouveautes` | `#b-nouveautes` (cadeau) | `st.accueil.r === 1` ou `st.boutiques >= 2` | fin du 1er jour | **silencieuse** ; en ouvrant : `st.nouveautesVues = NV.derniere()` (pas de point : l'historique des mises à jour n'intéresse pas un nouveau) |
| 13 | `casino` | la porte du fond (`hitArriere` / `toquer`) | (`r === 1` et `lifetime >= 1e8`) ou `st.boutiques >= 2` | ~1 h, souvent 2e jour | « Psst… on entend battre des cartes derrière la petite porte du fond. » · zone `SCENE.zoneArriere()` (scène visible) |
| 14 | `chaine` | `#b-chaine`, carte « Ma chaîne » (Boulanger) | `st.boutiques >= 2` ou `CH.etat(st).b.length > 0` | jour 3–4 | « Nouveau : Ma chaîne ! Tes anciennes boutiques revivent sur ta petite planète. » · `#b-chaine` |

Ne changent pas (déjà gatés ou indispensables) : la solde, l'enseigne, les cartes recettes, `#b-second` (n°5), `#boosts` (réserve),
`#b-jetons` (chaîne), l'onglet Boutique, **l'onglet Réglages** (le son, la sauvegarde, l'aide : toujours là), Réglages › Repeindre
(l'indice n°6 y renvoie), le chat compagnon (à l'éclair), les trophées de la page Boulanger (visibles avec l'onglet, comme leurs toasts).
Pendant les premiers pas, il reste donc : la solde, l'enseigne, les recettes, les onglets Boutique et Réglages. `.barre-achat` sans
aucun bouton visible est cachée (classe `vide`), pour ne pas laisser une bande vide.

Les seuils sont monotones (`lifetime` ne baisse jamais ; `stations`, `ameliorations` repartent à chaque boutique, mais le bit posé reste).

### 5.1 La file des annonces (une à la fois, jamais de chevauchement)

- Élément : `<div id="annonce-accueil" role="status" aria-live="polite" hidden><div class="bulle"><span class="aa-txt"></span></div><svg class="main">…</svg></div>`
  (même gabarit et même doigt que `#indice`, couleur d'accent différente : fond `var(--lavande-fonce)` ou équivalent du thème, `z-index` 6).
- Toutes les secondes (accueil actif) : `G.accueilPas(st)` puis `dus = G.deblocagesDus(st)` (ids dont le seuil est atteint et le bit
  pas posé, dans l'ordre du tableau). Les annonces **silencieuses** sont ouvertes tout de suite (`G.marquerDeblocage(st, id)`, `save()`).
- Une annonce se montre seulement si : `st.tuto >= 5` (le « Bravo » est passé, ou Passer), aucune annonce en cours, **au moins
  `ECART` ms depuis la fin de la précédente** (`ECART = window.__accueilEcart || 20000` ; 3 000 ms pour la toute première après les
  premiers pas), `feuille.hidden`, `!document.hidden`, aucun écran (`MINIJEUX.ouvert`, `EVS.ouvert`, `AR.ouvert`, `CE.ouvert`,
  `visite`, `chaineVue`, `TC.ouvert`, `SCENE.amenager`), `!retourEnCours`, aucune annonce existante en vol (`annonceOuverte`,
  `lundiOuvert`, `copainsOuvert`, `progMinuteur` en attente), pas de bandeau `.maj`.
- On prend la **première** annonce due dont la cible peut se montrer (élément dans l'écran, pas sous le tiroir ni sous les onglets,
  page Boutique pour les cibles du tiroir — on peut afficher la page Boutique mais jamais forcer le tiroir ; une zone de la scène doit
  être au-dessus du tiroir). Une cible qui ne peut pas se montrer attend sans bloquer les suivantes.
- Montrer : poser le bit (l'élément apparaît, classe `accueil-neuf` : une petite pulsation 2 s), placer la bulle comme `indices()`
  (au-dessus ou au-dessous de la cible, bornée à l'écran), `save()`. **Pendant une annonce, `#indice` est caché** (l'annonce passe
  avant les indices 5 et 6 ; l'indice revient après).
- Fin : au premier toucher n'importe où après 800 ms (écouteur `pointerdown` en capture, sans empêcher le geste), ou après 6 s, ou si
  une feuille ou un écran s'ouvre. Puis `ECART` avant la suivante.
- Les toasts du jeu ne sont pas utilisés pour ces annonces (la file des toasts n'en garde que deux).
- Une sauvegarde `t: 1` : aucun calcul, aucune annonce. Une sauvegarde neuve qui reprend (§ 2.2) : ce qui était déjà atteint s'ouvre
  en silence ; seuls les nouveaux seuils s'annoncent.
- Annonce de l'événement (`evenements`) : les deux appels existants à `EVS.annoncer` (au lancement et toutes les 20 s) ne partent que
  si `ouvertA('evenements')` ; quand le bit se pose et qu'un événement est ouvert, `EVS.annoncer(true)` une fois (sa feuille), c'est
  tout. L'icône du coin suit `majCoinQuartier()` (`&& ouvertA('evenements')`).

---

## 6. Contrat par fichier et par fonction

### src/game.js (règles, sans DOM ; testées en Node)
- `GARDEROBE` : ajouter `apprenti-tablier` et `apprenti-foulard` (§ 4.2), après la tenue du parcours ; pas d'ensemble `apprenti`.
- `ACCUEIL` (gelé) : `{ etapes, deblocages, recompense: { vetements: ['apprenti-tablier', 'apprenti-foulard'], boost: { mult: 2, secs: 1800 } }, TOUS }`.
- `accueilNeuf()`, `accueil(st)` (réparation, § 2.1), `accueilAncien(s, now)` (§ 2.2).
- `accueilPas(st)` → `{ nouvelles, toutes }` (rien si `t`).
- `accueilOuvert(st, id)` → `t || bit`.
- `deblocagesDus(st)` → `[id…]` : `t` → `[]` ; `st.tuto < 4` → `[]` ; sinon les seuils atteints, bit pas posé, ordre du tableau.
- `marquerDeblocage(st, id)` → pose le bit (rend `true` s'il ne l'était pas).
- `recompenseAccueil(st)` (§ 4.2).
- `newState` : `accueil: accueilNeuf()`.
- Exporter : `ACCUEIL, accueilNeuf, accueil, accueilAncien, accueilPas, accueilOuvert, deblocagesDus, marquerDeblocage, recompenseAccueil`.
- Les seuils qui dépendent d'autres modules (`CH.etat(st).b`) : `deblocagesDus(st, o)` reçoit `o.chaine` (nombre de boutiques de la
  chaîne, 0 par défaut) ; game.js ne lit pas CHAINE.

### src/ui.js (interface)
- `ACC` (§ 1) ; `ouvertA(id)` ; `accueilActif()` = `ACC && st && !G.accueil(st).t`.
- `lire(raw)` : la migration (§ 2.2).
- `INDICES` : champs `attente` (accueil actif) ; texte de l'étape 4 selon l'accueil ; `fini` de l'étape 5 (§ 3).
- `indices()` : attente, Passer, tiroir fermé/autre page (§ 3), caché pendant une annonce (§ 5.1).
- `frame()` : le calme pendant les premiers pas (§ 3) ; une fois par seconde `pasAccueil()` (étapes, silencieuses, file).
- `pasAccueil()`, `montrerAnnonce(id)`, `finAnnonce()`, `placerBulle(el, cible)` (factoriser le placement de `indices()` pour les deux bulles).
- `majAccueil()` : applique `hidden` à ce qui n'a pas de mise à jour propre (`#b-atelier`, `#b-etoiles`, `#b-nouveautes`, `.modes`,
  `#b-ameliorations`, `.barre-achat.vide`, onglets Défis/Boulanger/Journal, `#objectifs`, `#debutant`) ; appelée au démarrage, à chaque
  bit posé et par `pasAccueil()` (sur une clé qui change).
- Les mises à jour existantes reçoivent la porte en **ET** (pas d'écrasement, pas de clignotement) : `majCoin()` (`#b-classement`),
  `majCoinChaine()` (`#b-chaine`), `majCoinQuartier()` (`#b-quartier`, `#b-hantee`), `pageBoulanger.html` (cartes Ma chaîne / Mes
  décos / garde-robe : `carteChaine()` et `GRU.carte`), `#b-decos`, `renderCards` (la carte saison), le toast `out.saison`, le
  `pointerdown` de la scène (`hitTrophees` : `ouvertA('classement')` ; `hitArriere` : `ouvertA('casino')` ; `hitBoulanger` :
  `ouvertA('boulanger')`), les deux `EVS.annoncer`, `verifierVersion` (rien pendant les premiers pas), `RT.init` (dep `accueil: () => ouvertA('classement')`).
- `renderDebutant()`, `sheetDebutant()`, `recevoirDebutant()` (§ 4).
- `#objectifs` : `renderObjectifs` ne force jamais `hidden = false` si `!ouvertA('defis')`.
- Les clés de cache (`hud` `lastHud`, `pageBoulanger.key`, `renderCards`) incluent `st.accueil.d`, `st.accueil.r`, `st.tuto >= 4`.
- `showPage(id)` vers un onglet fermé (un lien interne) : permis, l'onglet s'ouvre alors en silence (`marquerDeblocage`), pour ne
  jamais montrer une page sans onglet actif.
- `window.__fournil.accueil` (tests) : `{ actif: ACC, get etat() { return st.accueil; }, annonce: () => idEnCours || '', passer, pas: pasAccueil, ouvert: ouvertA, recevoir: recevoirDebutant, debutant: sheetDebutant }`.

### src/page.html
- `#debutant` (§ 4.1) entre `.barre-achat` et `#objectifs` ; `#annonce-accueil` (§ 5.1) après `#indice` ;
  le bouton `.passer` dans `#indice` (après `.bulle`), `hidden` par défaut.

### src/style.css
- `#indice .passer` (petit bouton clair sous la bulle, `pointer-events: auto`, ≥ 44 × 32), `#annonce-accueil` (gabarit de `#indice`),
  `.ticket.debutant` (+ `.db-points`, `.pret`), `.accueil-neuf` (pulsation 2 s, coupée par `prefers-reduced-motion`),
  `#onglets button[hidden] { display: none }`, `.barre-achat.vide { display: none }`.
- Tenir 360 × 640 : bulle et Passer entièrement dans l'écran, pas de défilement horizontal.

### src/garderobe.js
- `PERSOS.TENUES.apprenti` (palette 3D § 4.2), `COLLECTION.apprenti = 'Le premier jour'`, `QUELLE.apprenti = 'L’objectif du premier jour.'`.

### src/icons.js
- `TENUES.apprenti = ['#5D8FC9', '#2F5A8A', '#BFD8F2']`.

### src/chaine.js
- `OBTENIR_TENUE.apprenti = 'L’objectif du premier jour'` (le carnet « Mes décos » liste toutes les tenues). Pas de vignette générée
  (outils/vignettes) : le repli dessiné s'affiche — la régénérer seulement si l'outil tourne ici sans peine.

### src/equipe3d.js
- Vérifier le tablier et le foulard `apprenti` sur le boulanger 3D (capture) ; si la variante `metal` choisie par `varTablier` ne rend
  pas le bleu de travail, ajouter `apprenti` à la liste de `varTablier` comme `parcours`. Rien d'autre.

### src/retours.js
- `majBandeau()` : caché aussi si `d.accueil && !d.accueil()`.

### src/nouveautes.js
- En tête : `{ id: '2026-11-04-a', date: '2026-11-04', titre: 'Un meilleur accueil pour les nouveaux boulangers', points: [...] }`
  (si une autre entrée du 4 novembre arrive sur master avant la fusion : la lettre suivante, jamais un id déjà publié) :
  - « Les nouveaux boulangers sont guidés pas à pas : cuire, vendre, améliorer, embaucher. Un doigt montre où toucher, et « Passer » saute le guidage. »
  - « Puis une carte « Ton premier jour » : sept étapes, et à la fin une tenue d’apprenti pour la garde-robe et un boost ×2 de 30 minutes. »
  - « Les boutons (classement, Atelier, Ma chaîne, événements…) apparaissent au fil du jeu, quand ils servent, avec une petite bulle. »
  - « Si tu joues déjà : rien ne change pour toi, tout reste ouvert. »

### Fichiers produits
- `node build.js` (fournil/index.html, dist/artifact.html, fournil/version.json) et `node build.js --essai` avant le commit final ;
  ne jamais toucher zombies/, src-zombies/, poncin.

---

## 7. test/fournil-accueil.test.js (Node)

1. `newState().accueil` = `{ v: 1, o: 0, r: 0, d: 0, t: 0 }` ; `accueil(st)` répare `null`, un tableau, `{ o: 'x', d: -3 }`.
2. `accueilAncien` : `tuto 7` → `t: 1, r: 1, o: 127` ; `boutiques 2`, `lifetime 1e5`, `etoiles 1`, `created` il y a 2 jours,
   `arriere.trouvee` → `t: 1` ; une partie de 10 min (`tuto 2`, 300 €) → `t: 0` et `d` = seuils atteints (ex. rien), `o` = étapes faites.
3. Étapes : chaque `fait(st)` sur un état fabriqué ; `accueilPas` monotone (une boutique neuve qui remet `stations` à zéro ne retire
   aucun bit).
4. Déblocages : `deblocagesDus` vide tant que `tuto < 4` ; l'ordre du tableau ; les bits uniques, `TOUS` couvre tous les bits ; `t: 1` → `[]`.
5. Récompense : refusée avant 7/7 ; donnée une fois (`r: 1`, deux pièces possédées et portées, `boosts.reserve` gagne `{ mult: 2, secs: 1800 }`) ;
   un second appel → `{ ok: false }` et rien de plus (réserve inchangée) ; refusée si `t: 1`.
6. La garde-robe : les deux pièces existent, formes `tablier` / `foulard`, collection `apprenti`, bonus vide ; `bonusGardeRobe` inchangé en les portant.
7. Rythme : `longevite.simuler(profil, 1, { t0, chaqueSeconde })` aux 3 profils (départ 5 oct.) : les 7 étapes faites le premier jour.
8. `NV` : l'entrée `2026-11-04-a` en tête, ids uniques et triés.

Ajouté à la ligne « deploy » de `.github/workflows/pages.yml` (à côté de `node test/fournil-progression.test.js`).

## 8. test/fournil-accueil.cjs (Playwright, `PORT` libre, ex. 97xx ; `addInitScript(() => { window.__accueil = true; window.__accueilEcart = 1500; window.__sansEvenements = true; })`)

A. **Partie neuve au doigt, 390 × 844** (`isMobile`, `hasTouch`) :
   - Au lancement : `#indice` visible, « Touche la baguette », doigt visible et animé, « Passer » visible ; cachés : `#b-classement`,
     `#b-atelier`, `#b-chaine`, `#b-etoiles`, `#b-nouveautes`, `.modes`, `#b-ameliorations`, `#objectifs`, `#debutant`, onglets Défis,
     Boulanger, Journal ; visibles : onglets Boutique et Réglages, 9 cartes.
   - Chaque étape : vérifier que le doigt (`#indice .main`) pointe la cible (son centre x dans le rectangle de la cible ± 30 px),
     **toucher la cible avec `page.tap`** ; touches réelles de la baguette pour les étapes 0–1 (texte d'attente lu entre-temps) ; pour
     les étapes 2–3, `__fournil.give(n)` au plus juste puis la touche réelle du bouton pointé.
   - Recharger au milieu (étape 2) : la bulle reprend à l'étape 2.
   - Après Léo : « Bravo » puis `#debutant` visible « 0/7 » ou plus ; puis les annonces : jamais deux bulles à la fois (sondage
     toutes les 100 ms : `#annonce-accueil` et `#indice` jamais visibles ensemble), dans l'ordre du tableau, chaque élément apparaît
     avec son annonce (`boulanger`, `defis`, `modes`, `bonus`…), en poussant l'état par `give` et les helpers existants.
   - Les 7 étapes par le jeu (`__fournil.mystere()` puis toucher le client, `__fournil.ev('critique')` et servir, un meuble par la
     scène ou `__fournil.meuble`, un bonus par la feuille, les objectifs réclamés dans Défis) ; la carte passe à « Cadeau ! » ;
     toucher → feuille → « Recevoir ma récompense » : deux pièces `apprenti` possédées et portées, `boosts.reserve` contient
     `{ mult: 2, secs: 1800 }`, `#boosts` visible, `#debutant` caché, l'annonce `garderobe` suit.
   - Recharger : pas de seconde récompense (réserve inchangée), aucune annonce rejouée en 5 s, l'état gardé.
   - Aucune erreur de page.
B. **Passer** (contexte neuf) : toucher « Passer » → `st.tuto === 5`, `#indice` caché, `#debutant` visible, l'annonce `defis` vient.
C. **Vieille sauvegarde intacte** : une sauvegarde avancée **sans `accueil`** (fabriquée dans la page depuis `GAME.newState`, `tuto 7`,
   `boutiques 3`, `lifetime 1e9`, `created` il y a 30 jours ; posée dans `localStorage['fournil.v2']` avant le lancement) → tout visible
   comme sur master (`#b-atelier`, `#b-chaine`, `#b-etoiles`, `#b-nouveautes`, 5 onglets, `.modes`, Bonus, porte du fond), `accueil.t === 1`,
   aucune bulle d'annonce en 10 s, pas de `#debutant`, pas de pièce `apprenti`, réserve de boosts inchangée. Idem une sauvegarde
   `tuto 0` créée il y a 2 jours.
D. **Interrupteur** : sans `__accueil` (navigator.webdriver) : tout visible, la bulle d'origine sans « Passer », pas de `#debutant`.
E. **360 × 640** : partie neuve : bulle et « Passer » entièrement dans l'écran, la barre de la baguette visible au-dessus des onglets,
   `scrollWidth <= innerWidth` ; après les premiers pas : `#debutant` tient sur sa ligne (hauteur ≤ 60 px) et la carte de la baguette
   reste visible au cran « mi » du tiroir ; captures `test/shots/accueil-*.png`.

## 9. CI (.github/workflows/pages.yml)

- `node test/fournil-accueil.test.js` dans la ligne de la tâche deploy (et dans celle de l'essai).
- `node test/fournil-accueil.cjs` dans un **nouveau job** `fournil12` « Le Fournil, l'accueil des nouveaux joueurs (Playwright) »
  (copie du job `fournil9`, un seul test : la tâche fournil4 est déjà près de sa limite) et `fournil12` ajouté à `needs` du deploy.
- Les tests se lancent un par un en local (`TZ=Europe/Paris NODE_PATH=/opt/node22/lib/node_modules`), Chromium préinstallé.

## 10. Risques et parades

- **Un test existant qui casse** : l'interrupteur `navigator.webdriver` garde le comportement de master pour tous ; vérifier au moins
  `play.cjs`, `fournil-nouveautes.cjs`, `fournil-version.cjs`, `fournil-classement.cjs`, `fournil-chaine.cjs`, `fournil-progression.cjs`
  un par un ; un échec d'attente sous charge se compare à /home/user/master-ref avant de conclure.
- **Un joueur existant qui perd un bouton** : la migration dans `lire` (§ 2.2) est la seule porte ; `t: 1` court-circuite tout. Le test C
  le garde. Un doute sur une sauvegarde → ancienne (en cas de doute, tout ouvrir).
- **Des annonces qui se marchent dessus** : une seule file, une seule bulle, l'écart, et toutes les conditions de § 5.1 ; les feuilles
  de lancement existantes passent toujours avant.
- **Un nouveau bloqué** : « Passer » ; tout seuil est atteignable en jouant ; l'onglet Réglages reste toujours visible ; une page
  ouverte par un lien interne ouvre son onglet.
- **Visibilités en concurrence** (`majCoin`, `majCoinChaine`…) : la porte s'ajoute en ET dans chaque fonction existante, jamais un
  second `hidden = false` ailleurs.
- **Événement pendant les premiers pas** : reporté (§ 3), puis gaté à 10 M€ ; un nouveau qui arrive en pleine fenêtre d'événement le
  découvre vers 20 minutes (voulu : il a d'abord une boulangerie qui tourne).
- **La tenue en 3D** : forme existante (`tablier`, `foulard`), palette nouvelle ; à vérifier par une capture (equipe3d).
- **Taille de la page** : quelques centaines de lignes ; rien de lourd (pas d'image nouvelle).

---

## 11. Écarts de la construction (4 nov.)

- `#indice .passer` est placé **avant** `.bulle` (et non après) : la colonne flexible le met du côté opposé à la cible (au-dessus quand
  la bulle est au-dessus de la cible, au-dessous sinon), jamais entre la bulle et le doigt.
- Accueil actif, le doigt (`.main`) est décalé horizontalement au-dessus du centre de la cible quand la bulle bute contre le bord de
  l'écran (l'embauche de Léo, à droite) ; éteint, rien ne change.
- Les annonces `decos` et `garderobe` montrent l'onglet Boulanger : s'il n'était pas encore ouvert, il s'ouvre avec elles.
- Le « Bravo » (étape 4) finit aussi tiroir fermé ou sur une autre page (sinon un joueur qui garde le tiroir fermé ne recevait plus
  aucune annonce).
- `chaine` et `garderobe` sont silencieuses sans leur écran (`CE`, `GRU`), comme `decos`.
- Vignettes : `test/fournil-vignettes.test.js` exige une vignette pour chaque tenue ; l'outil `outils/vignettes/cuire.cjs` a tourné
  ici (`--seulement "tenues/apprenti-tablier,tenues/apprenti-foulard"`) : deux webp et `src/vignettes.js`.
- `src/equipe3d.js` inchangé : la variante `metal` rend bien le bleu de travail (vignette vérifiée) ; ajouter `apprenti` à `varTablier`
  l'aurait rendu blanc (le nom croise la variante des apprentis).
- Deux tests existants modifiés, au minimum : `test/fournil-progression.cjs` cherche sa nouveauté par son id (`2026-11-03-a`) au lieu
  de la première de la liste ; `test/fournil-equipe3d.cjs` compte 46 pièces de garde-robe (44 + la tenue d'apprenti).
- La tâche CI `fournil12` utilise le port 8897 (8891 est pris par `fournil-decos`).
