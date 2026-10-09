# Salle de jeux · Le Fournil

Ce dépôt est une **salle de jeux pour le téléphone** : l'adresse du site ouvre un **écran d'accueil** (`index.html`, à la racine) qui liste les jeux, chacun dans son dossier. Le premier est **Le Fournil** (`fournil/`) ; une place attend le suivant.

### L'écran d'accueil

Une carte par jeu, avec la partie en cours lue dans sa sauvegarde (pour Le Fournil : nom de la boutique ou enseigne du quartier, numéro, étoiles, dernière visite ; localStorage, et IndexedDB en lecture seule si la base existe déjà) et un bouton Jouer ou Continuer ; une carte en pointillés pour le prochain jeu. Il s'installe sur le téléphone comme une application (« Salle de jeux ») et s'ouvre hors ligne : `sw.js` à la racine ne s'occupe que de l'accueil, et l'accueil enregistre aussi le service worker de chaque jeu, qui marche donc sans réseau même jamais ouvert. Dans Le Fournil, Réglages → **Salle de jeux** y ramène.

Une icône du Fournil installée avant l'accueil continue d'ouvrir directement le jeu : en plein écran sans `?app=accueil`, l'accueil redirige vers `fournil/` (jamais depuis un dossier de jeu, pour ne pas boucler), et le manifeste du Fournil garde l'identifiant de l'ancienne application (`"id": "/gamemobil/"`), si bien qu'Android la met à jour vers `fournil/`. Sa portée (`"scope": "../"`) couvre l'accueil, qui s'ouvre donc dans la même fenêtre. La page du jeu, servie hors de `fournil/` par une vieille copie en cache, y retourne d'elle-même.

**Les sauvegardes** vivent dans le stockage du navigateur, par domaine. Sur iPhone, chaque icône de l'écran d'accueil a le sien, séparé de Safari : une partie commencée dans Safari ne suit pas l'icône installée (l'accueil le dit quand l'icône n'a encore aucune partie) ; le code de Réglages → Sauvegarde et transfert la fait passer de l'un à l'autre.

**Ajouter un jeu** :
1. un dossier à son nom à la racine, avec son `index.html`, son `manifest.webmanifest` (sans `id` relatif : il se résout contre la racine du domaine) et, s'il doit marcher hors ligne, son `sw.js` dont les caches portent un préfixe à lui ;
2. une entrée dans la liste `JEUX` en bas d'`index.html` : nom, genre, phrase, dossier, icône, couleur, son service worker (`sw`) et au besoin une fonction qui lit sa sauvegarde pour afficher la partie en cours, sans jamais l'écrire ni créer sa base ;
3. son icône dans `SHELL` du `sw.js` de la racine, et `CACHE` passé à la version suivante (`accueil-v2`…), pour que l'accueil hors ligne la montre.

Three.js est partagé dans `vendor/`. Chaque jeu choisit une clé de sauvegarde à son nom (`fournil.v2` pour Le Fournil).

## Le Fournil

Ta boulangerie de quartier, en jeu idle/tycoon simple et lumineux : **tu cuis, tu vends, tu améliores, tu embauches**, et tes apprentis continuent de vendre quand tu n'es pas là.

## L'écran

- **En haut** : ton solde et le gain par seconde, la **cloche** (elle s'anime quand un événement est en cours, et mène aux Défis sinon), le compteur d'**étoiles** (il ouvre la nouvelle boutique).
- **La boutique remplit l'écran** entre l'en-tête et les onglets, avec son **enseigne** (touche-la pour renommer) et le bouton **Aménager** en haut à droite, qui entoure chaque meuble améliorable de son nom, de ses crans et du prix du cran suivant ; hors de ce mode, chaque meuble porte une petite pastille de niveau, et une pastille jaune quand un cran est abordable. Les pages vivent dans **un tiroir que tu tires par sa poignée**, avec trois crans : fermé (toute la boutique), mi-hauteur, ouvert (la page prend tout). Toucher un onglet ou le ticket des objectifs ouvre le tiroir au moins à mi-hauteur ; retoucher l'onglet actif remonte sa page. Quand un événement arrive, une **bannière** se pose au-dessus du tiroir : un chrono ou un bouton à marteler, et elle se déplie d'une touche pour lire la consigne. La position du tiroir est mémorisée.
- **Cinq onglets** en bas, chacun avec son icône et un badge quand quelque chose t'attend : **Boutique** (les produits, la barre ×1/×10/×100/Max, le bouton Bonus, et le ticket des objectifs du jour), **Défis** (objectifs du jour et leurs primes, pain du jour, défi de la semaine, la liste des sept événements), **Boulanger** (niveau, savoir-faire et talents ; un point à dépenser allume un badge lavande), **Journal** (records, habitués, trophées, derniers événements, partage ; un badge jaune compte les trophées pas encore vus), **Réglages** (sons, vibrations, nom et spécialité de la boutique, sauvegarde et transfert, partage, remise à zéro).

## Comment on joue

1. **Touche la baguette** : elle cuit, un client l'achète, tu gagnes 1 €.
2. **Améliore** un produit : chaque niveau rapporte plus. Aux niveaux 25, 50, 100, 200… les gains **doublent** : chaque carte montre le prochain palier, le multiplicateur qu'il apporte et une jauge de progression, et le bouton Améliorer annonce quand l'achat franchit le palier.
3. **Débloque** de nouvelles recettes : croissant, pain au chocolat, tarte aux pommes, éclair, macarons, mille-feuille, pièce montée.
4. **Embauche** un apprenti par produit : il cuit tout seul, même pendant ton absence (8 h, davantage avec le talent Lève-tôt et la chambre froide). Dans la boutique, chaque apprenti fait la navette entre le four et le comptoir avec son plateau.
5. **Bonus et mobilier** : des recettes et des équipements qui multiplient tes gains (jusqu'à la prochaine boutique), et **six meubles à améliorer cran par cran** en les touchant dans la boutique ou depuis le volet Mobilier de la feuille Bonus : tables et chaises (un vrai salon de thé où les clients s'assoient, tous les gains ×1,08 par cran), four (fournées 3 % plus rapides par cran), vitrine (fournées à la main +25 % de clients), caisse enregistreuse (pourboires ×1,3 et client mystère plus fréquent), chambre froide (+1 h d'absence), décoration (primes +15 %). Chaque meuble change d'aspect à chaque cran ; une pastille jaune signale un cran abordable. Le mobilier repart de zéro à chaque nouvelle boutique.
6. **Étoiles** : quand ta boutique a bien gagné, ouvre-en une nouvelle. Tu repars de zéro mais tu gardes tes étoiles, et chaque étoile donne +5 % de gains pour toujours.
7. **Objectifs du jour** : trois défis par jour, calibrés sur ta boutique (gagner tant, vendre tant de fournées, embaucher, débloquer une recette…). Chaque défi réussi donne une prime en euros ; les trois réussis donnent **une étoile** et prolongent ta série de jours.
8. **Le boulanger** : touche-le dans la boutique, ou ouvre l'onglet Boulanger. Il gagne du **savoir-faire** à chaque défi, événement réussi, recette, embauche et nouvelle boutique, monte de niveau (Apprenti, Mitron, Boulanger, Compagnon, Maître boulanger, Meilleur Ouvrier de France) et reçoit **un point de talent par niveau**. Les neuf talents sont permanents, ils survivent aux changements de boutique : Bouche-à-oreille (fournées à la main ×1,5 par cran, pour des débuts plus rapides), Mains rapides (fournées −5 % de temps par cran), Mémoire des recettes (chaque nouvelle boutique démarre avec plus de recettes), Lève-tôt (absence 8 h → 12 h), Apprentis zélés, Négociateur, Charme (événements plus fréquents, primes +25 %), Pourboires, Carnet de commandes. Sa toque, sa moustache et son col changent avec son titre.

## Chaque jour, chaque semaine

- **Pain du jour** : un produit tiré selon la date rapporte ×1,5 toute la journée (étiquette sur sa carte).
- **Défi de la semaine** : un seul défi plus long, du lundi au dimanche (livrer 8 commandes, conquérir 3 critiques, 12 pourboires, 15 événements, 4 jours aux trois objectifs, ouvrir une boutique). Réussi : une étoile, du savoir-faire et une prime.
- **Les habitués** : Mme Dupuis le matin, Marco le midi, Léna en fin de journée. Chacun passe une fois par jour pendant son créneau, avec son étiquette et sa phrase. Servi cinq jours de suite, il offre un cadeau.
- **La spécialité** : à chaque ouverture de boutique, tu choisis son produit fétiche, qui rapporte ×2 le temps de la boutique.
- **Journal, trophées et partage** (onglet Journal) : records, fidélité des habitués, 30 trophées qui donnent du savoir-faire, les vingt derniers événements, et un bouton pour partager une image de ta boutique avec sa légende.

## Ce qui se passe en jouant

- **Coup de feu** : pendant 60 s, toutes les ventes sont ×3 et les clients affluent. Plus fréquent aux vraies heures de pointe (le matin, midi, la sortie du travail).
- **Commande spéciale** : un client commande N fournées d'un produit à livrer en 3 min, pour une prime qui vaut six fois leur prix. Cuis-les, puis touche **Livrer**.
- **Le critique est là** : sers-lui trois recettes en touchant leurs cartes (elles sont marquées) avant 2 min. Conquis, il publie une bonne critique : **tout ×2 pendant 5 min**.
- **Le meunier passe** : pendant 90 s, niveaux et recettes sont à **−40 %**. C'est le moment d'acheter.
- **Concours de pétrissage** : 30 touches en 20 s sur le bouton **Pétris !** pour une prime (quatre minutes de gains).
- **Panne de four** : un produit s'arrête et le four fume. Huit touches sur **Répare !** le remettent en route avec une petite prime ; sinon il repart tout seul au bout d'une minute.
- **Goûter d'anniversaire** : un produit rapporte **×5 pendant 2 min**.
- **Client mystère** : un client doré entre et attend 8 s devant le comptoir. Touche-le dans la boutique : il laisse un gros pourboire.
- **Jour de marché** : le samedi et le dimanche, tous les gains sont ×1,5.
- Un événement toutes les 3 à 7 minutes de jeu actif, jamais deux fois le même d'affilée ; en absence, les apprentis vendent au rythme normal.

Le haut de l'écran montre ta boutique **en vraie 3D, vue d'en haut en plongée 3/4** (Three.js, style low-poly arrondi pastel : des volumes simples aux arêtes adoucies, des couleurs plates, des ombres douces) : le fournil à gauche (chambre froide, four, plan de travail), le comptoir et sa vitrine au centre avec le boulanger derrière, le salon de thé à droite, la porte au fond. Les clients entrent par la porte, font la queue devant la vitrine, repartent avec leur sac ou vont s'asseoir à une table ; le client mystère attend près du comptoir, les habitués portent leur prénom. Les apprentis font la navette four → comptoir avec leurs plateaux. Toucher le boulanger ouvre sa page, toucher un meuble ouvre sa fiche. **Chaque nouvelle boutique change de quartier** : le village (bois et crème, collines par la fenêtre), le coin de rue parisien (zinc, damier noir et blanc, immeubles et tour Eiffel), le bord de mer (bleu et blanc, vagues, voilier, mouette), le chalet de montagne (rondins, sommets enneigés, neige qui tombe), la grande ville (marbre, laiton, gratte-ciel allumés la nuit). Tu nommes chaque boutique à son ouverture, le nom s'affiche sur l'enseigne. La boutique grandit avec toi : pains sur les étagères, plante, lampe, cadre, chat, horloge à l'heure réelle, diplôme du boulanger, ardoise, fleurs sur le comptoir, boîtes à gâteaux, et le mobilier qui monte en gamme cran par cran. La lumière suit l'heure réelle (aube, jour, soir, crépuscule, nuit avec les lampes allumées et les fenêtres éclairées dehors), des passants traversent devant la fenêtre, et **les saisons suivent la date** : neige et guirlande de Noël en décembre, galette des rois en janvier, cœurs à la Saint-Valentin, œufs et pétales à Pâques, glaces l'été, fanions du 14 juillet, citrouille et feuilles mortes à l'automne.


### La 3D

La scène est rendue par **Three.js r158** (`vendor/three.min.js`, licence MIT, vendu dans le dépôt : pas d'outillage ni de CDN ; pour le régénérer : `npm pack three@0.158.0`, puis copier `package/build/three.min.js` dans `vendor/` ; ce build classique, chargeable par une simple balise `<script>`, est déprécié depuis la r150 et disparaît des versions récentes, d'où la r158). La page le charge en fichier séparé, mis en cache par le service worker ; l'artefact Claude l'inline pour rester autonome. Au chargement, Three.js affiche un avertissement de dépréciation de ce build : il est attendu et sans effet.

La simulation (clients, file, sièges, apprentis, événements) vit dans `src/vie.js`, en pixels d'écran, exactement comme avant ; la vue 3D (`src/scene.js`) projette ce plan dans une pièce en volumes avec une **caméra orthographique fixe, plongée de 52°**, cadrée pour que chaque point du plan tombe à son pixel : les zones de touche, le tiroir à mi-hauteur et les tests n'ont pas bougé. Les meubles et la salle viennent de `src/meubles.js`, les personnages et les pâtisseries de `src/persos.js`, les briques (boîtes arrondies biseautées, matériaux mats partagés, fusion de pièces colorées, textures peintes) de `src/modeles.js`. Un calque 2D (`#scene-ui`) porte les textes, les pastilles, le mode Aménager et les confettis. La lumière suit l'heure réelle (aube, jour, soir, crépuscule, nuit : les appliques, la lampe et les bougies du salon s'allument le soir et la nuit ; le four rougeoie quand il cuit), le paysage derrière la fenêtre et la porte est une texture repeinte dix fois par seconde (passants, neige, feuilles, pétales). La **qualité s'adapte** au temps de frame mesuré (trois paliers : résolution, ombres, une image sur deux) ; `?qualite=haute|moyenne|eco` la force. Sans WebGL, ou si `vendor/three.min.js` ne se charge pas, un panneau le dit et la boutique continue de vivre sans image : fournées, apprentis, clients et habitués comptent toujours. Les clients qui repartent sont libérés de la mémoire ; seuls les apprentis sont recyclés.
## Lancer, tester, construire

Le jeu tient dans `fournil/index.html` plus `vendor/three.min.js`. Ses sources sont dans `src/` et assemblées par :

```bash
node build.js            # produit fournil/index.html et dist/artifact.html
node test/econ.test.js   # rythme de l'économie, objectifs du jour, événements, absence, formats
node test/longevite.js   # 60 jours de jeu simulés pour trois profils de joueur (--test : garde-fous du rythme)
npx serve .              # puis ouvre l'adresse sur un téléphone du même réseau : l'accueil, puis Le Fournil
```

`test/play.cjs` rejoue un parcours complet sur un iPhone simulé (Playwright) et produit des captures dans `test/shots/` (il vérifie aussi que la 3D tourne, et que le jeu reste jouable sans WebGL et sans Three.js) ; `test/scene.cjs` capture la boutique dans les cinq quartiers, à quatre heures de la journée et aux saisons, tiroir fermé, à mi-hauteur et ouvert, en mode Aménager, avec bannière et sur petits écrans ; `test/atelier.cjs` photographie un meuble, un personnage ou la salle entière à n'importe quel cran, avec la caméra et la lumière de la vraie scène (`node test/atelier.cjs specs.json`).

### L'installer sur un téléphone

La salle de jeux est en ligne sur **https://devclaudeapp.github.io/gamemobil/** et Le Fournil sur **https://devclaudeapp.github.io/gamemobil/fournil/** : le workflow `.github/workflows/pages.yml` le redéploie à chaque push sur `master` (dans *Settings → Pages*, la source doit être **GitHub Actions**).

Ouvre l'URL sur le téléphone, puis : iPhone (Safari) → Partager → **Sur l'écran d'accueil** ; Android (Chrome) → menu ⋮ → **Installer l'application**. Installé depuis l'accueil, c'est la salle de jeux qui s'ouvre ; installé depuis `fournil/`, c'est le jeu directement. Chacun s'ouvre en plein écran avec son icône, et son service worker (`sw.js` pour l'accueil, `fournil/sw.js` pour le jeu, chacun avec ses propres caches) le garde jouable hors ligne.

### La sauvegarde

La boutique est enregistrée dans le téléphone toutes les 5 secondes, à chaque achat et quand l'app passe en arrière-plan, en double : localStorage et IndexedDB (le second résiste mieux quand iOS tue l'application). Au lancement, la plus avancée des deux est relue, et le jeu demande au navigateur un stockage persistant.

À savoir sur iPhone : **Safari et l'app installée sur l'écran d'accueil ont chacun leur propre sauvegarde**, et **supprimer l'app efface la sienne**. Pour mettre le jeu à jour, il suffit de le rouvrir (jamais besoin de le réinstaller). Pour passer d'un contexte à l'autre, Réglages → **Sauvegarde et transfert** donne un code à copier ; au chargement, on peut soit remplacer toute la boutique, soit garder la sienne et ne récupérer que les étoiles du code. Ouvert dans une page intégrée à une autre app ou en navigation privée, le navigateur peut ne rien garder du tout.

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html`, `sw.js`, `manifest.webmanifest`, `icons/accueil*` | L'écran d'accueil de la salle de jeux, écrit à la main : la liste `JEUX`, son service worker et son manifeste |
| `fournil/` | Le Fournil tel qu'il est servi : `index.html` (généré par `build.js`), `sw.js`, `manifest.webmanifest` |
| `src/game.js` | Économie et état : produits, paliers, bonus, mobilier, étoiles, boulanger (savoir-faire, niveaux, talents), objectifs du jour, événements, absence, formats de nombres. Tourne aussi dans Node |
| `src/vie.js` | La vie de la boutique, sans dessin : le plan (bloc haut à l'échelle, salon qui descend dans le sol en plus, sièges conservés), clients en file et à table, apprentis en navette, client mystère, habitués, textes qui flottent, vapeurs, confettis, passants et météo ; les zones de touche du plan |
| `src/modeles.js` | Les briques de la 3D : géométries arrondies en cache, matériaux mats partagés, fusion de pièces colorées en un seul maillage, textures peintes, libération |
| `src/meubles.js` | La salle (sol, mur, fenêtre, porte, extérieur) et le mobilier par cran : chambre froide, four, comptoir et vitrine, caisse, tables et chaises, décoration, plan de travail, présentoir, ardoise, étagère, cadres, horloge, appliques, lampe, props de saison |
| `src/persos.js` | Les personnages (clients variés, apprentis, boulanger selon son titre, client mystère), leurs poses et animations, les huit pâtisseries |
| `src/scene.js` | La vue 3D : caméra fixe en plongée, correspondance plan → monde, lumière du jour et de la nuit, reconstruction de ce qui change (cran, quartier, saison), personnages posés là où la vie les met, zones de touche par boîtes projetées, calque 2D (textes, pastilles, mode Aménager, confettis), qualité adaptative |
| `vendor/three.min.js` | Three.js r158 (UMD, MIT) |
| `src/ui.js` | Le tiroir des pages (poignée, trois crans, geste au doigt), barre d'onglets et pages (Boutique, Défis, Boulanger, Journal, Réglages), cartes des produits, fiches des meubles et volet Mobilier, ticket des objectifs, bannière d'événement et cloche, badges, indices du tutoriel, feuilles (bonus, étoiles, nom, spécialité, absence, sauvegarde), sons, sauvegarde double et code de transfert |
| `src/icons.js` | Icônes SVG en ligne : pâtisseries, apprentis, boulanger, meubles, et la famille d'icônes d'interface (onglets, cloche, bonus, réglages…) au même trait |
| `src/style.css`, `src/page.html` | Mise en page |

## Rythme et durabilité

Huit produits. Débloquer une recette est un cap (de 120 € pour les croissants à 40 Bn € pour la pièce montée), mais ensuite chaque niveau coûte quelques fournées seulement et se rembourse vite : 4 fournées pour la baguette, 11 pour l'éclair, 28 pour la pièce montée au premier niveau. Le coût d'un niveau est multiplié par 1,07 à 1,15 à chaque achat, et les gains doublent à chaque palier (25, 50, 100, 200…) : un produit finit toujours par plafonner, c'est le suivant qui prend le relais. `test/longevite.js` fait jouer trois profils pendant 60 jours, avec des sessions réalistes, des absences (gains plafonnés à 8 h, plus avec Lève-tôt et la chambre froide), les talents du boulanger et le mobilier (acheté quand il ne coûte qu'une petite part de la cagnotte) :

| | Occasionnel (17 min/jour) | Régulier (36 min/jour) | Assidu (80 min/jour) |
| --- | --- | --- | --- |
| Mille-feuille | — | jour 3 | — |
| Pièce montée | jour 8 | jour 7 | jour 8 |
| Première nouvelle boutique | jour 5 (+9 ★) | jour 4 (+8 ★) | jour 3 (+7 ★) |
| Dernier bonus (franchise) | jour 27 | jour 21 | jour 20 |
| Étoiles au jour 30 | ~650 | ~1 020 | ~1 140 |
| Boulanger au jour 30 | niveau 16 | niveau 18 | niveau 20 |
| Temps sans rien à acheter | 12 % | 26 % | 42 % |
| Jours aux trois objectifs | 56/60 | 56/60 | 53/60 |

Les étoiles d'une boutique valent √(gagné ÷ 40 Md €), et chaque tranche de 25 étoiles déjà possédées rend les suivantes deux fois plus chères : la boule de neige reste maîtrisée. Un objectif du jour devenu impossible est remplacé par un autre ; en changeant de boutique, les objectifs pas encore réclamés sont retirés à la taille de la nouvelle. `node test/longevite.js --test` vérifie ces garde-fous à chaque déploiement, et `test/econ.test.js` vérifie qu'un niveau se rembourse toujours en 30 fournées au plus au premier niveau, et en 100 au plus au niveau 25 pour les quatre premiers produits.
