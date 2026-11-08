# Salle de jeux (gamemobil) : règles communes à toutes les conversations

Plusieurs conversations Claude travaillent en même temps sur ce dépôt :
- **Le Fournil** : branche de travail `poncin` et branches de lot ; la conversation démarre depuis la branche **`main`** ;
- **Dernier Rempart** (zombies) : branche `zombies` ; la conversation démarre depuis la branche **`master`**.

## Branches à ne jamais supprimer ni renommer
- **`main`** et **`master`**. Une conversation démarre en clonant sa branche de départ. Si cette branche disparaît, la conversation ne peut plus démarrer : l'app affiche « La branche sur laquelle cette session était basée n'existe plus », et on ne peut plus y écrire. C'est arrivé le 4 nov. 2026, quand `main` a disparu.
- On ne supprime **aucune** branche distante sans demande explicite du joueur : pas de `git push --delete`, pas de `git push origin :branche`, pas de « nettoyage » des branches.
- `main` n'a pas besoin d'être à jour : elle doit seulement exister. `master` est la branche publiée (GitHub Pages).

## Travail à plusieurs
- Chacun travaille sur sa branche, puis fusionne dans `master` (`--no-ff`). Avant chaque mise en ligne, fusionner proprement les fichiers partagés : `build.js`, `index.html`, `sw.js`, `.github/workflows/pages.yml`.
- **Pas de force-push**, jamais de réécriture de l'historique de `master` ou de la branche d'un autre.
- Une poussée sur `master` relance tout `pages.yml` (environ 45 min) et annule le run en cours (`cancel-in-progress`) : regrouper ses envois.
- On ne modifie pas le code de l'autre jeu. Si la CI échoue seulement sur l'autre jeu, on le signale au joueur.

## Sécurité
- Seulement la clé **publique** Supabase (dans `fournil/config.js` et `zombies/config.js`), jamais de clé secrète.
- Le SQL est collé par le joueur dans Supabase ; aucun secret ne passe par le dépôt.
