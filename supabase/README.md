# Brancher Supabase (Opération Poncin)

Supabase sert au jeu en ligne d'Opération Poncin : comptes sans e-mail, salons entre copains, coffre et classements. Les parties elles-mêmes passent directement d'un téléphone à l'autre (WebRTC) ; Supabase ne sert qu'à se retrouver et à garder les scores, ce qui tient largement dans l'offre gratuite.

Le jeu marche sans Supabase : solo contre les bots, et à plusieurs onglets sur le même appareil.

## Créer le projet (une dizaine de minutes)

1. Sur **supabase.com**, crée un compte (la connexion avec GitHub marche), puis **New project** :
   - nom : `salle-de-jeux` ;
   - région : **Europe** (West EU / Paris, ou Central EU / Frankfurt) ;
   - offre : **Free** ;
   - garde le mot de passe de la base pour toi (le jeu n'en a pas besoin).
2. **Authentication → Sign In / Providers** : active **Allow anonymous sign-ins**. Les joueurs ont un compte sans e-mail ni mot de passe.
3. **Project Settings → API** (ou **API Keys**) : copie
   - l'**URL du projet** (`https://xxxx.supabase.co`) ;
   - la **clé publique** : `anon` ou `sb_publishable_…`.
   
   Ces deux valeurs sont faites pour être dans la page du jeu : envoie-les à Claude, ou mets-les dans `poncin/config.js`.
   **Jamais** la clé `service_role` / `sb_secret_…` : elle donne tous les droits sur la base et ne doit apparaître nulle part dans le dépôt.
4. Plus tard (comptes et classements) : **SQL Editor → New query**, colle le contenu de `supabase/schema.sql`, puis **Run**. Le fichier sera fourni prêt.
5. Dans les réglages de l'environnement Claude (menu de l'environnement → Modifier → Accès réseau → Domaines autorisés), ajoute `*.supabase.co` et `supabase.com`, pour que Claude puisse tester le jeu en ligne.

## À savoir

- Un projet gratuit **se met en pause après 7 jours sans activité** : on le réveille depuis le tableau de bord. Le solo marche toujours.
- L'offre gratuite limite le temps réel à environ 100 messages par seconde et 200 connexions simultanées : c'est pour ça que les parties passent de téléphone à téléphone et pas par Supabase.

## Le jeu en ligne : par où passent les messages

- **Se retrouver** : chaque salon est un canal Realtime public `poncin:CODE` (le code de 4 lettres). La **présence** de Supabase donne la liste des joueurs (pseudo, couleur, prêt, ancienneté) ; l'**hôte** est le plus ancien arrivé (le créateur du salon). Aucune table, aucun compte : la clé publique suffit.
- **Jouer** : les téléphones se relient ensuite **directement** (WebRTC, en étoile autour de l'hôte). Le canal Supabase ne sert qu'à échanger l'offre et la réponse WebRTC (deux messages par joueur).
- **Repli « relais »** : si le direct ne s'ouvre pas en ~8 s (certains réseaux 4G l'empêchent), les messages passent par le canal Supabase, bridés à **5 envois par seconde** par joueur (le dernier état de chaque type, et tous les messages fiables, groupés). Le jeu reste jouable, un peu moins fluide ; le direct est retenté de temps en temps.
- **Budget** (offre gratuite : ~100 messages Realtime par seconde pour tout le projet, chaque message compte une fois par destinataire) : une partie en direct coûte presque rien (présence, pings de signalisation) ; une partie à 4 entièrement en relais coûte de l'ordre de 40 à 60 messages par seconde. Une ou deux parties relayées à la fois tiennent dans l'offre gratuite.
- **Pas de serveur TURN** : il n'y en a pas de gratuit et fiable ; le relais Supabase en tient lieu.

## Le tester

- Dans le conteneur de Claude (sans Supabase) : `NODE_PATH=/opt/node22/lib/node_modules node test/poncin-reseau.cjs` éprouve le même code WebRTC entre trois pages (voies `local` et `webrtc-local`, relais forcé, coupures, départ de l'hôte).
- Pour de vrai : le workflow **En ligne** (`.github/workflows/en-ligne.yml`) tourne à chaque push sur la branche `en-ligne-test` (ou à la main, onglet Actions) : trois navigateurs séparés rejoignent un salon par Supabase, se relient en WebRTC, échangent, puis recommencent en relais forcé ; le résumé (débits, latences, pings) s'affiche dans la page du workflow.
- Dans le jeu : `poncin/?relais=1` empêche le pair-à-pair (pour essayer le relais entre copains) ; `poncin/?reseau=local` joue entre onglets du même navigateur, sans Supabase.
- Si plus rien ne se connecte : le projet s'est peut-être **mis en pause** (7 jours sans activité) ; le réveiller depuis le tableau de bord Supabase, puis relancer le workflow En ligne.

## Le classement du Fournil

Le Fournil a un classement entre amis, sur la **fortune totale** (tout l'argent gagné depuis le début, toutes boutiques confondues) : l'onglet **Cette semaine** (remis à zéro chaque lundi à minuit, heure de Paris) et l'onglet **Tous les temps**.

« Cette semaine » ne compte que ce qui **dépasse la plus haute fortune déjà atteinte** : une fortune qui baisse (partie effacée, vieux code de sauvegarde, onglet en retard) affiche 0 € cette semaine, jamais un gain négatif, et la remonter (code rechargé) ne fait rien gagner de plus. Une partie effacée exprès, sans recharger son code, ne repart donc pas de zéro dans « Cette semaine » : pour cela, il faut **quitter puis rejoindre** le classement. Chacun y apparaît sous un pseudo choisi en rejoignant. Il passe par le même projet Supabase que Poncin (`jklbitrlkfrktmnarejc`) et sa clé publique, déjà dans `fournil/config.js`.

### L'installer (une seule fois, 3 minutes)

1. **Ouvrir l'éditeur SQL** : sur **supabase.com**, ouvre le projet du jeu, puis dans la colonne de gauche **SQL Editor** → **New query** (une page blanche).
2. **Coller le fichier et le lancer** : ouvre [`supabase/fournil-classement.sql`](https://github.com/devclaudeapp/gamemobil/blob/master/supabase/fournil-classement.sql) sur GitHub, clique sur l'icône **Copy raw file** (les deux petits carrés, en haut à droite du fichier), colle tout dans la page blanche de Supabase, puis **Run** (ou Ctrl + Entrée). La réponse attendue : *Success. No rows returned*.
   Si Supabase demande une confirmation (« destructive operation »), réponds **Run this query** : le fichier ne fait que remplacer ses propres fonctions et retirer d'éventuelles règles d'accès posées à la main sur la table du classement ; il n'efface aucun joueur.
3. **Vérifier** : sur GitHub, onglet **Actions** → **Classement** → **Run workflow**. Deux coches vertes (« SQL » et « Supabase réel ») : c'est en place. Le résumé de la page dit aussi quels en-têtes la clé publique accepte. Côté jeu, rien à faire : le classement s'affiche dès que les fonctions répondent.

Le fichier se **recolle sans risque** (une nouvelle version, ou en cas de doute) : les joueurs inscrits restent, les fonctions et les droits sont remis d'aplomb, les colonnes et tables ajoutées depuis sont créées. **Après chaque modification du fichier, il faut le recoller** : le test réel dit si l'ancienne version est encore en place. Les pseudos déjà enregistrés ne sont pas revérifiés.

### Ce que ça coûte dans l'offre gratuite

Rien, et de très loin :

- **Base** : une petite table, moins de 500 octets par joueur (index compris) ; même pleine (2 000 joueurs au plus), elle pèse moins de 1 Mo sur les 500 Mo offerts. Plus une table minuscule des inscriptions des dernières 24 h (`fournil_portes`), vidée au fur et à mesure.
- **Requêtes** : leur nombre n'est pas limité dans l'offre gratuite. Un téléphone envoie sa fortune toutes les 5 minutes quand le jeu est ouvert (environ 1 Ko) et lit le classement quand on ouvre la feuille (environ 5 Ko). Vingt amis qui jouent une heure par jour, c'est quelques dizaines de Mo de trafic par mois, sur les 5 Go inclus.
- **Ni temps réel, ni comptes, ni fichiers** : le classement n'utilise que la base, par trois fonctions.
- Comme pour Poncin, un projet sans activité pendant 7 jours **se met en pause** : le jeu continue normalement, le classement attend qu'on réveille le projet depuis le tableau de bord.

### Comment il est protégé

- Tout passe par trois fonctions (`fournil_publier`, `fournil_classement`, `fournil_retirer`) ; personne ne peut lire ni modifier les tables `fournil_joueurs` et `fournil_portes` directement (sécurité ligne par ligne activée sans aucune règle, aucun droit pour `anon` ni `authenticated`).
- Chaque téléphone garde un **jeton secret** ; la base n'en garde que l'empreinte (sha256). Sans lui, impossible d'écraser le score de quelqu'un ni de le retirer du classement. Le classement ne montre que le rang, le pseudo et la fortune.
- Garde-fous : un envoi pris en compte toutes les 10 secondes par joueur, une fortune positive et sous 1e24 € (un joueur très assidu atteint environ 1e21 € en un an), un pseudo de 2 à 16 caractères (lettres, accents compris, chiffres, espace, `-` `_` `'` `.`), unique sans tenir compte des majuscules. Les lettres qui imitent `l`, `i` ou la ponctuation (`ǀ`, `ı`, `ǃ`… : le latin étendu B et quelques lettres du latin étendu A) sont refusées, pour qu'on ne puisse pas se faire passer pour « Paul » avec « Pauǀ ».
- Inscriptions : **par source** (l'adresse vue par Cloudflare, en-tête `cf-connecting-ip` ; en IPv6, tout le bloc /64), 10 par heure et 20 par jour au plus ; puis, pour tout le monde ensemble, 60 par heure et 2 000 joueurs au plus. Ainsi un robot seul ne bloque plus les amis qui arrivent. La base ne garde que l'empreinte (sha256) de l'adresse, 24 h, jamais l'adresse elle-même. Les inscriptions passent une à une (un verrou), pour que des envois simultanés ne dépassent pas ces plafonds. Si Supabase ne transmettait pas `cf-connecting-ip` (le test réel le dit), seuls les plafonds communs joueraient.
- **Ménage automatique** : un boulanger sans nouvelles depuis **90 jours** (jeu jamais rouvert, téléphone changé, données effacées par le navigateur) sort du classement au premier envoi suivant de n'importe quel joueur : son pseudo et sa place se libèrent. Une inscription jamais suivie d'un autre envoi sort au bout de **7 jours**. S'il revient avec le même téléphone, il réapparaît tout seul avec sa fortune (sa semaine repart de zéro) ; si son pseudo a été repris entre-temps, le jeu lui en fait choisir un autre. Le plafond de 2 000 joueurs ne peut donc plus fermer le classement pour toujours.
- Ce qui reste hors de portée : la fortune vient du téléphone, donc quelqu'un qui bricole les appels peut toujours déclarer jusqu'à 1e24 € (et, en rejoignant à 0 puis en envoyant 1e24, autant dans « Cette semaine »). Un tel intrus se retire à la main (ci-dessous).
- Le contrat (réponses, erreurs `pseudo_pris`, `pseudo_invalide`, `jeton`, `valeur`, `trop_vite`, `complet`) est décrit en tête de chaque fonction dans le fichier SQL.
- Les conseils de sécurité du tableau de bord (**Advisors**) peuvent signaler « RLS enabled, no policy » sur `fournil_joueurs` et `fournil_portes`, ou des fonctions `SECURITY DEFINER` appelables par `anon` : c'est voulu, c'est justement comme ça que la table reste fermée et que seules les trois fonctions y touchent.

### À la main, si besoin

- **Retirer un joueur** (un pseudo déplacé, un intrus) : **Table Editor** → `fournil_joueurs` → coche la ligne → **Delete**. Ou dans le SQL Editor : `delete from public.fournil_joueurs where lower(pseudo) = lower('Le pseudo');`
- **Après une inondation** (des dizaines de faux joueurs d'un coup) : dans le SQL Editor, en remplaçant le motif des pseudos et la date du début :
  ```sql
  delete from public.fournil_joueurs where cree > '2026-10-09 18:00+02' and pseudo ilike 'robot%';
  delete from public.fournil_portes;
  ```
  (Pour voir d'abord ce qui serait effacé : `select pseudo, fortune, cree from public.fournil_joueurs order by cree desc limit 100;`)
- **Tout désinstaller** : dans le SQL Editor,
  ```sql
  drop function if exists public.fournil_publier(uuid, text, text, double precision), public.fournil_classement(text, uuid, integer),
    public.fournil_retirer(uuid, text), public.fournil_reponse(text, uuid, date), public.fournil_empreinte(text),
    public.fournil_jeton_valable(text), public.fournil_pseudo_propre(text), public.fournil_lundi(timestamptz), public.fournil_maintenant();
  drop table if exists public.fournil_joueurs, public.fournil_portes;
  ```

### Le tester

- **Le SQL, sans Supabase** (dans le conteneur de Claude ou sur n'importe quel ordinateur) : le fichier est collé dans un vrai Postgres en WebAssembly (PGlite), avec les rôles de Supabase, puis chaque fonction est jouée en tant qu'`anon` (inscription, mauvais jeton, pseudos et sosies, valeurs absurdes, trop vite, semaines et changements d'heure, triches sur « Cette semaine », rangs et ex æquo, limites communes et par source, ménage à 7 et 90 jours, retrait, accès direct refusé) :
  ```sh
  npm install --prefix /tmp/pglite --no-save --no-package-lock @electric-sql/pglite@0.5.8
  node test/fournil-classement-sql.cjs /tmp/pglite
  ```
- **Pour de vrai** : le workflow **Classement** (`.github/workflows/classement.yml`), à la main depuis l'onglet Actions ou à chaque push sur la branche `classement-test`. Sa tâche « Supabase réel » (`test/fournil-classement-ci.cjs`) vérifie que les fonctions sont installées (sinon elle le dit : colle le fichier SQL), quels en-têtes marchent avec la clé `sb_publishable_`, que la table est fermée, puis joue un scénario avec deux joueurs de test (`test-ci-…`) : « Cette semaine » ne se gonfle pas quand la fortune baisse puis remonte (sinon, c'est l'ancienne version du SQL : la recoller). Elle inscrit enfin quelques joueurs de test de plus jusqu'au premier « trop_vite », pour vérifier la limite par source (si elle ne vient jamais, le résumé le signale : `cf-connecting-ip` n'arrive pas jusqu'à Postgres). Elle **retire toujours** tous ses joueurs de test à la fin. Elle inscrit au plus 12 joueurs par lancement ; avec 20 inscriptions par jour et par source, un troisième lancement le même jour depuis la même machine peut être refusé (« trop_vite » dès le début) : relancer le lendemain.
