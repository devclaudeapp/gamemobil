# Œillets

Un jeu mobile de patience sur une page de carnet imprimée en risographie. Tu es paludier sur la presqu'île de Guérande : **la mer monte deux fois par jour avec la vraie lune, le soleil évapore, et le sel ne vient que si tu as compris comment l'eau circule dans ton marais.** Pas de multiplicateur, pas de minuteur : ta seule montée en puissance, c'est la géométrie de tes bassins, la réserve d'eau que tu gardes pour les mortes-eaux et ta lecture du ciel.

## Ce qui le distingue des idle/tycoon habituels

| Dans la plupart des jeux idle | Dans Œillets |
| --- | --- |
| Des producteurs avec un débit et des multiplicateurs à acheter | **Une seule simulation d'eau** : profondeur, salinité et algues par parcelle. Le rendement est une propriété émergente de la forme du marais. Un œillet creusé au mauvais endroit ne rend rien |
| Un chronomètre interne | **L'heure réelle du téléphone.** Les marées sont les vraies (elles glissent de 50 min par jour, faiblissent aux mortes-eaux, selon la vraie lune). La nuit, l'eau se repose |
| Une météo décorative ou aléatoire | **Une météo partagée**, tirée de la date : tout le monde a la même averse le même mardi à 14 h. Le baromètre se lit 24 h à l'avance |
| Des gains hors ligne qui s'accumulent linéairement | **L'absence est rejouée** pas à pas par la simulation. Le sel tiré au mulon est à l'abri, le sel couché dans un œillet se redissout sous la pluie. « Mettre en eau » est un état sûr que tu choisis avant de partir |
| Un prestige qui multiplie tout | **L'hivernage** : quand la lune revient à sa phase de départ, l'hiver noie le marais, le record est pochoiré sur un sac, et tu redessines librement ta géométrie pour affronter un **climat nommé** (1976 sécheresse, 1983 été pourri, 2003 canicule…) |
| Un score en heures passées | Le seul score est le **kilo de sel par œillet et par jour** : une mesure de compréhension |

## Comment jouer

- **Ouvre l'étier** quand la mer dépasse le seuil : la vasière se remplit. Sans clapet (25 €), referme-le quand la mer redescend.
- **Ouvre les trappes** : l'eau descend de bassin en bassin, du fond haut vers le fond bas. Vasière → cobier → fare → aderne → œillet. Une trappe n'existe que si le dénivelé est de 10 cm au plus.
- Les couleurs disent tout : **canard** = eau jeune, **violet** (trame rose sur canard) = en chemin, **rose** = presque, **points blancs** = sel.
- **Glisse le pouce sur un œillet blanc** : le sel file au mulon. **Porte-le à la coopérative** (0,80 €/kg ; fleur de sel 12 €/kg).
- **Creuse** avec tes euros : chaque type de bassin a un rôle (réserve, chauffe, distribution, récolte). Environ six parts d'eau en amont pour une part d'œillet.
- **Lis le carnet** : heures des pleines mers, prévision, réserve en jours, observations écrites à partir de ton propre marais.

La première journée se joue en dix minutes (× 144). Ensuite, le marais vit à l'heure réelle.

### Bestiaire des bassins

| Bassin | Fond | Eau max | Surface | Rôle |
| --- | --- | --- | --- | --- |
| Vasière | 0 cm | 40 cm (×1,5 par agrandissement) | 8 parts | Réserve d'eau de mer, remplie par l'étier |
| Cobier | −5 cm | 20 cm | 4 parts | Réserve pour les mortes-eaux |
| Fare | −10 cm | 10 cm | 3 parts | Chauffe l'eau de 50 à 150 g/L |
| Aderne | −15 cm | 5 cm | 2 parts | Tient la saumure rose, nourrit jusqu'à trois œillets |
| Œillet | −20 cm | 2 cm | 1 part | La récolte : le sel précipite au-dessus de 260 g/L |

## Lancer, tester, construire

Tout tient dans `index.html`, sans dépendance. Les sources sont dans `src/` et assemblées par :

```bash
node build.js          # produit index.html et dist/artifact.html
node test/sim.test.js  # vérifie la simulation hors navigateur
npx serve .            # puis ouvre l'adresse sur un téléphone du même réseau
```

`test/play.cjs` rejoue un parcours complet sur un iPhone simulé (Playwright) et produit des captures dans `test/shots/`.

**Horloge de test** : ouvrir `index.html#x120` fait tourner la simulation 120 fois plus vite (une journée en douze minutes), pour voir une saison entière sans attendre un mois. `#x1` rétablit l'heure réelle.

### L'installer sur un téléphone

1. Héberge le dossier en HTTPS, par exemple avec GitHub Pages (*Settings → Pages → Deploy from a branch → `master` / racine*).
2. Ouvre l'URL sur le téléphone, puis :
   - iPhone (Safari) : Partager → **Sur l'écran d'accueil** ;
   - Android (Chrome) : menu ⋮ → **Installer l'application**.

Le service worker (`sw.js`) garde le jeu consultable hors ligne.

## Structure

| Fichier | Rôle |
| --- | --- |
| `src/sim.js` | Simulation pure : marée, lune, météo partagée, hydrologie, économie, absence, hivernage. Tourne aussi dans Node |
| `src/render.js` | Rendu Canvas 2D : papier kraft, trois encres en aplat, trames en surimpression, repérage décalé |
| `src/sheets.js` | Feuilles et pages : fiche de parcelle, creuser, carnet, coopérative, retour, hivernage, garde |
| `src/ui.js` | Horloge, boucle, HUD, action suggérée (marge et anneau), tutoriel, entrées tactiles, sauvegarde |
| `src/copy.js` | Tous les textes français, dictons, climats |
| `src/style.css`, `src/page.html` | Mise en page |
| `scratch/econ-sim.js` | Simulateur économique headless qui a servi à régler les constantes |

## Coupes volontaires

- Pas de notification (« la mer est haute dans 30 min ») : le jeu ne réclame rien, et une page web installée ne peut pas la garantir. La marge et le carnet donnent les heures de marée.
- Pas de son, pas de succès, pas de récompenses quotidiennes : le mur de sacs et le record kg/œillet/jour sont les seuls souvenirs.
- Sur les très petits écrans, les cellules descendent à 42 px quand la grille atteint 11 rangées (saison 4 et au-delà).

## Pistes pour la suite

- Strates colorées du mulon selon la météo, export image du marais à l'hivernage.
- D'autres sites de marais avec une silhouette de grille différente.
- Publication App Store / Play Store en enveloppant la page avec Capacitor.
