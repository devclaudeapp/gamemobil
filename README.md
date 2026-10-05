# Le Fournil

Ta boulangerie de quartier, en jeu idle/tycoon simple et lumineux : **tu cuis, tu vends, tu améliores, tu embauches**, et tes apprentis continuent de vendre quand tu n'es pas là.

## Comment on joue

1. **Touche la baguette** : elle cuit, un client l'achète, tu gagnes 1 €.
2. **Améliore** un produit : chaque niveau rapporte plus. Aux niveaux 25, 50, 100, 200… les gains **doublent**.
3. **Débloque** de nouvelles recettes : croissant, pain au chocolat, tarte aux pommes, éclair, macarons, mille-feuille, pièce montée.
4. **Embauche** un apprenti par produit : il cuit tout seul, même pendant ton absence (jusqu'à 8 h).
5. **Bonus** : des recettes et des équipements qui multiplient tes gains pour toujours.
6. **Étoiles** : quand ta boutique a bien gagné, ouvre-en une nouvelle. Tu repars de zéro mais tu gardes tes étoiles, et chaque étoile donne +5 % de gains pour toujours.

Le haut de l'écran montre ta boutique : les clients entrent, achètent et repartent avec leur sac ; la lumière de la fenêtre suit l'heure réelle ; chaque recette débloquée ajoute un élément de décor.

## Lancer, tester, construire

Tout tient dans `index.html`, sans dépendance. Les sources sont dans `src/` et assemblées par :

```bash
node build.js            # produit index.html et dist/artifact.html
node test/econ.test.js   # rythme de l'économie (temps d'accès à chaque produit, absence, formats)
npx serve .              # puis ouvre l'adresse sur un téléphone du même réseau
```

`test/play.cjs` rejoue un parcours complet sur un iPhone simulé (Playwright) et produit des captures dans `test/shots/`.

### L'installer sur un téléphone

1. Héberge le dossier en HTTPS, par exemple avec GitHub Pages (*Settings → Pages → Deploy from a branch → `master` / racine*).
2. Ouvre l'URL sur le téléphone, puis : iPhone (Safari) → Partager → **Sur l'écran d'accueil** ; Android (Chrome) → menu ⋮ → **Installer l'application**.

Le service worker (`sw.js`) garde le jeu jouable hors ligne.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/game.js` | Économie et état : produits, paliers, bonus, étoiles, absence, formats de nombres. Tourne aussi dans Node |
| `src/scene.js` | La boutique en Canvas 2D : boulanger, clients, vitrine, décor, lumière du jour |
| `src/ui.js` | Cartes des produits, achats, indices du tutoriel, feuilles (bonus, étoiles, absence), sons, sauvegarde |
| `src/icons.js` | Icônes SVG en ligne (pâtisseries, apprentis) |
| `src/style.css`, `src/page.html` | Mise en page |

## Réglages de l'économie

Huit produits, coût de niveau multiplié par 1,07 à 1,15 à chaque achat, gains doublés à chaque palier. Un joueur attentif débloque les croissants en 30 s, la tarte en 5 min, les éclairs en 15 min, les macarons en 45 min, le mille-feuille vers 2 h ; la pièce montée demande plusieurs sessions. Une absence de 8 h rapporte à peu près ce qu'une session active de même durée aurait donné.
