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

## Ce qui se passe en jouant

- **Coup de feu** : pendant 60 s, toutes les ventes sont ×3 et les clients affluent. Plus fréquent aux vraies heures de pointe (le matin, midi, la sortie du travail).
- **Commande spéciale** : un client commande N fournées d'un produit à livrer en 3 min, pour une prime qui vaut six fois leur prix. Cuis-les, puis touche **Livrer**.
- **Client mystère** : un client doré entre et attend 8 s devant le comptoir. Touche-le dans la boutique : il laisse un gros pourboire.
- **Jour de marché** : le samedi et le dimanche, tous les gains sont ×1,5.
- Les événements n'arrivent que quand tu joues (toutes les 4 à 8 min) ; en absence, les apprentis vendent au rythme normal.

Le haut de l'écran montre ta boutique : les clients entrent, achètent et repartent avec leur sac ; la lumière de la fenêtre suit l'heure réelle ; chaque recette débloquée ajoute un élément de décor.

## Lancer, tester, construire

Tout tient dans `index.html`, sans dépendance. Les sources sont dans `src/` et assemblées par :

```bash
node build.js            # produit index.html et dist/artifact.html
node test/econ.test.js   # rythme de l'économie, objectifs du jour, événements, absence, formats
npx serve .              # puis ouvre l'adresse sur un téléphone du même réseau
```

`test/play.cjs` rejoue un parcours complet sur un iPhone simulé (Playwright) et produit des captures dans `test/shots/`.

### L'installer sur un téléphone

Le jeu est en ligne sur **https://devclaudeapp.github.io/gamemobil/** : le workflow `.github/workflows/pages.yml` le redéploie à chaque push sur `master` (dans *Settings → Pages*, la source doit être **GitHub Actions**).

Ouvre l'URL sur le téléphone, puis : iPhone (Safari) → Partager → **Sur l'écran d'accueil** ; Android (Chrome) → menu ⋮ → **Installer l'application**. Le jeu s'ouvre alors en plein écran, avec son icône, et le service worker (`sw.js`) le garde jouable hors ligne. La sauvegarde est dans le téléphone (localStorage) : elle tient tant que tu ne supprimes pas l'application.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/game.js` | Économie et état : produits, paliers, bonus, étoiles, objectifs du jour, événements, absence, formats de nombres. Tourne aussi dans Node |
| `src/scene.js` | La boutique en Canvas 2D : boulanger, clients, client mystère, coup de feu, vitrine, décor, lumière du jour |
| `src/ui.js` | Cartes des produits, achats, carte des objectifs, cartes d'événement, indices du tutoriel, feuilles (bonus, étoiles, objectifs, absence), sons, sauvegarde |
| `src/icons.js` | Icônes SVG en ligne (pâtisseries, apprentis) |
| `src/style.css`, `src/page.html` | Mise en page |

## Réglages de l'économie

Huit produits, coût de niveau multiplié par 1,07 à 1,15 à chaque achat, gains doublés à chaque palier. Un joueur attentif débloque les croissants en 30 s, la tarte en 4 min, les éclairs en 10 min, les macarons en 35 min, le mille-feuille vers 1 h 15 ; la pièce montée demande plusieurs sessions. En 3 h de jeu actif, il croise une vingtaine de coups de feu et de commandes et une quarantaine de clients mystères. Une absence de 8 h rapporte à peu près ce qu'une session active de même durée aurait donné.
