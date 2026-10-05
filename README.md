# Le Fournil

Ta boulangerie de quartier, en jeu idle/tycoon simple et lumineux : **tu cuis, tu vends, tu améliores, tu embauches**, et tes apprentis continuent de vendre quand tu n'es pas là.

## Comment on joue

1. **Touche la baguette** : elle cuit, un client l'achète, tu gagnes 1 €.
2. **Améliore** un produit : chaque niveau rapporte plus. Aux niveaux 25, 50, 100, 200… les gains **doublent**.
3. **Débloque** de nouvelles recettes : croissant, pain au chocolat, tarte aux pommes, éclair, macarons, mille-feuille, pièce montée.
4. **Embauche** un apprenti par produit : il cuit tout seul, même pendant ton absence (jusqu'à 8 h).
5. **Bonus** : des recettes et des équipements qui multiplient tes gains pour toujours.
6. **Étoiles** : quand ta boutique a bien gagné, ouvre-en une nouvelle. Tu repars de zéro mais tu gardes tes étoiles, et chaque étoile donne +5 % de gains pour toujours.
7. **Objectifs du jour** : trois défis par jour, calibrés sur ta boutique (gagner tant, vendre tant de fournées, embaucher, débloquer une recette…). Chaque défi réussi donne une prime en euros ; les trois réussis donnent **une étoile** et prolongent ta série de jours.
8. **Le boulanger** : touche-le dans la boutique. Il gagne du **savoir-faire** à chaque défi, événement réussi, recette, embauche et nouvelle boutique, monte de niveau (Apprenti, Mitron, Boulanger, Compagnon, Maître boulanger, Meilleur Ouvrier de France) et reçoit **un point de talent par niveau**. Les neuf talents sont permanents, ils survivent aux changements de boutique : Bouche-à-oreille (fournées à la main ×1,5 par cran, pour des débuts plus rapides), Mains rapides (fournées −5 % de temps par cran), Mémoire des recettes (chaque nouvelle boutique démarre avec plus de recettes), Lève-tôt (absence 8 h → 12 h), Apprentis zélés, Négociateur, Charme (événements plus fréquents, primes +25 %), Pourboires, Carnet de commandes. Sa toque, sa moustache et son col changent avec son titre.

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

Le haut de l'écran montre ta boutique : les clients entrent, achètent et repartent avec leur sac ; la lumière de la fenêtre suit l'heure réelle ; chaque recette débloquée ajoute un élément de décor.

## Lancer, tester, construire

Tout tient dans `index.html`, sans dépendance. Les sources sont dans `src/` et assemblées par :

```bash
node build.js            # produit index.html et dist/artifact.html
node test/econ.test.js   # rythme de l'économie, objectifs du jour, événements, absence, formats
node test/longevite.js   # 60 jours de jeu simulés pour trois profils de joueur (--test : garde-fous du rythme)
npx serve .              # puis ouvre l'adresse sur un téléphone du même réseau
```

`test/play.cjs` rejoue un parcours complet sur un iPhone simulé (Playwright) et produit des captures dans `test/shots/`.

### L'installer sur un téléphone

Le jeu est en ligne sur **https://devclaudeapp.github.io/gamemobil/** : le workflow `.github/workflows/pages.yml` le redéploie à chaque push sur `master` (dans *Settings → Pages*, la source doit être **GitHub Actions**).

Ouvre l'URL sur le téléphone, puis : iPhone (Safari) → Partager → **Sur l'écran d'accueil** ; Android (Chrome) → menu ⋮ → **Installer l'application**. Le jeu s'ouvre alors en plein écran, avec son icône, et le service worker (`sw.js`) le garde jouable hors ligne.

### La sauvegarde

La boutique est enregistrée dans le téléphone toutes les 5 secondes, à chaque achat et quand l'app passe en arrière-plan, en double : localStorage et IndexedDB (le second résiste mieux quand iOS tue l'application). Au lancement, la plus avancée des deux est relue, et le jeu demande au navigateur un stockage persistant.

À savoir sur iPhone : **Safari et l'app installée sur l'écran d'accueil ont chacun leur propre sauvegarde**, et **supprimer l'app efface la sienne**. Pour mettre le jeu à jour, il suffit de le rouvrir (jamais besoin de le réinstaller). Pour passer d'un contexte à l'autre, la feuille Étoiles → **Sauvegarde et transfert** donne un code à copier ; au chargement, on peut soit remplacer toute la boutique, soit garder la sienne et ne récupérer que les étoiles du code. Ouvert dans une page intégrée à une autre app ou en navigation privée, le navigateur peut ne rien garder du tout.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/game.js` | Économie et état : produits, paliers, bonus, étoiles, boulanger (savoir-faire, niveaux, talents), objectifs du jour, événements, absence, formats de nombres. Tourne aussi dans Node |
| `src/scene.js` | La boutique en Canvas 2D : boulanger, clients, client mystère, coup de feu, four en panne, vitrine, décor, lumière du jour |
| `src/ui.js` | Cartes des produits, achats, carte des objectifs, cartes d'événement, indices du tutoriel, feuilles (bonus, étoiles, boulanger et talents, objectifs, absence, sauvegarde), sons, sauvegarde double et code de transfert |
| `src/icons.js` | Icônes SVG en ligne (pâtisseries, apprentis) |
| `src/style.css`, `src/page.html` | Mise en page |

## Rythme et durabilité

Huit produits, coût de niveau multiplié par 1,07 à 1,15 à chaque achat, gains doublés à chaque palier (25, 50, 100, 200…). Les trois premières recettes arrivent dans les dix premières minutes ; les suivantes s'étalent sur une dizaine de jours. `test/longevite.js` fait jouer trois profils pendant 60 jours, avec des sessions réalistes et des absences (gains plafonnés à 8 h) :

| | Occasionnel (17 min/jour) | Régulier (36 min/jour) | Assidu (80 min/jour) |
| --- | --- | --- | --- |
| Tarte aux pommes | jour 1 | jour 1 | jour 1 |
| Éclair au café | jour 1 | jour 1 | jour 1 |
| Macarons | jour 2 | jour 1 | jour 1 |
| Mille-feuille | jour 3 | jour 2 | jour 2 |
| Pièce montée | jour 13 | jour 9 | jour 8 |
| Première nouvelle boutique | jour 4 (+10 ★) | jour 3 (+10 ★) | jour 3 (+12 ★) |
| Boutiques suivantes | tous les 3 à 6 jours | tous les 2 à 6 jours | tous les 2 à 9 jours |
| Dernier bonus (franchise) | jour 41 | jour 37 | jour 28 |
| Étoiles au jour 30 | ~500 | ~900 | ~1 400 |
| Temps sans rien à acheter | 10 % | 22 % | 42 % |
| Jours aux trois objectifs | 54/60 | 57/60 | 56/60 |

Les étoiles d'une boutique valent √(gagné ÷ 2 Md €), et chaque tranche de 25 étoiles déjà possédées rend les suivantes deux fois plus chères : la boule de neige reste maîtrisée (en 60 jours, les montants restent sous le million de milliards de milliards, donc lisibles). Un objectif du jour devenu impossible (tout le monde embauché, toutes les recettes débloquées…) est remplacé par un autre ; en changeant de boutique, les objectifs pas encore réclamés sont retirés à la taille de la nouvelle. `node test/longevite.js --test` vérifie ces garde-fous à chaque déploiement.
