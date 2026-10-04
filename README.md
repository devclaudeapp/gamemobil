# Filament des abysses

Un jeu mobile à un seul doigt. Tu es un filament de lumière dans les abysses : glisse le doigt pour tracer, **croise ta propre traîne pour fermer une boucle**, et tout ce qui se trouve à l'intérieur est capturé. Chaque capture joue une note calée sur le tempo : ta partie compose sa propre musique.

## Pourquoi il ne ressemble pas aux autres

| Ce que font la plupart des jeux mobiles | Ce que fait Filament |
| --- | --- |
| Bouton « tap », joystick virtuel | Un geste unique, le **lasso**, avec une vraie profondeur : forme, taille et timing de chaque boucle |
| Musique de fond en boucle | **Musique générative** : les captures sont quantifiées à la double-croche, sur l'accord en cours. Plus la boucle est grosse et le combo haut, plus l'arpège monte |
| Niveaux fixes, améliorations « +5 % » | **16 mutations qui changent les règles** (écho fantôme, réaction en chaîne, sonar rythmique, onde de gel…) : chaque plongée se construit différemment |
| Ennemis à éviter | Un **écosystème** : on attire les baudroies qui nous chassent pour mieux les encercler, on laisse les méduses pondre du plancton pour faire une énorme boucle, on brise les nautiles en groupe |
| Pubs, énergie, compte, notifications | Rien de tout ça. Hors ligne, gratuit, parties de 2 à 5 minutes. **Lâcher l'écran suspend le temps**, le jeu ne punit jamais une interruption |
| Défis quotidiens à débloquer | **Défi du jour** : la même plongée pour tout le monde, avec une « loi du jour » différente chaque jour, et une série de jours consécutifs |

## Comment jouer

- **Glisse** n'importe où : le filament suit ton geste (comme un pavé tactile), ton doigt ne cache jamais l'action.
- **Ferme une boucle** en recroisant ta traîne. Points = valeur des prises × nombre de prises × combo.
- **Enchaîne** les boucles en moins de 3 s pour faire monter le combo.
- **Descends** : chaque prise remplit la jauge. Tous les 100 m, choisis une mutation parmi trois.
- **Lâche l'écran** : le temps s'arrête. Repose le doigt pour reprendre.

### Bestiaire

| Créature | Valeur | Comportement |
| --- | --- | --- |
| Plancton | 1 | Inoffensif, arrive parfois en bancs |
| Baudroie | 2 | Te traque. La toucher coûte une vie, l'encercler rapporte |
| Méduse | 3 | Pond du plancton tant qu'elle vit (dès −100 m) |
| Espadon | 3 | Vise, puis fonce sur toi et tranche ta traîne (dès −200 m) |
| Nautile | 5 | Coquille : il faut l'encercler avec au moins deux autres créatures (dès −300 m) |
| Calmar doré | 6 | Rare et fuyant, s'échappe au bout de 10 s. Le capturer rend une vie |

## Lancer le jeu

Tout tient dans `index.html`, sans dépendance ni étape de build.

```bash
npx serve .            # ou : python3 -m http.server 8000
```

Puis ouvre l'adresse affichée, idéalement sur un téléphone du même réseau.

### L'installer sur un téléphone

1. Héberge le dossier en HTTPS, par exemple avec GitHub Pages : *Settings → Pages → Deploy from a branch → `master` / racine*.
2. Ouvre l'URL sur le téléphone, puis :
   - iPhone (Safari) : Partager → **Sur l'écran d'accueil** ;
   - Android (Chrome) : menu ⋮ → **Installer l'application**.

Le jeu s'ouvre alors en plein écran et fonctionne hors ligne grâce au service worker (`sw.js`).

## Structure

| Fichier | Rôle |
| --- | --- |
| `index.html` | Le jeu complet : rendu Canvas 2D, simulation, musique Web Audio, interface |
| `manifest.webmanifest` | Installation en application (PWA) |
| `sw.js` | Cache hors ligne |
| `icons/` | Icônes de l'application (SVG source et PNG générés) |

Dans `index.html`, le script est découpé en sections : outils géométriques, stockage local, moteur musical, créatures et mutations, monde, traîne et boucles, simulation, rendu, interface, entrées, boucle principale.

## Pistes pour la suite

- Publier sur l'App Store et le Play Store en enveloppant le jeu avec Capacitor.
- Classement en ligne du défi du jour.
- Nouveaux paliers visuels sous −1 000 m (zone hadale), nouvelles créatures.
- Mode « composition » sans ennemis, pour jouer de la musique en traçant.
