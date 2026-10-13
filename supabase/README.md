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

Le Fournil a un classement entre amis, en **points de boulanger** (version 3 du SQL, version 4 avec l'événement « Le Quartier ») : ils récompensent la façon de jouer, pas l'ancienneté. Un débutant et une grande boutique qui jouent pareil marquent autant (vérifié par `test/fournil-points.test.js`). Le barème, compté par le jeu (`src/game.js`) du lundi au dimanche, heure de Paris :

- **journée complète** (les trois objectifs du jour) : 10 points ;
- **défi de la semaine** : 30 points ;
- **événement réussi** (pétrissage, commande livrée, four réparé, bonne critique, pourboire du client mystère) : 2 points, 20 au plus par jour ;
- **Atelier** : le meilleur score de la semaine de chaque mini-jeu, de 0 à 20 points ;
- **améliorations** : 1 point par tranche d'achats (niveaux, embauches, bonus, mobilier, recette de saison) valant 10 minutes de **ses propres** gains, + 5 à chaque palier ×2 franchi (niveaux 25, 50, 100…), 30 au plus par jour.

Soit 60 points au plus par jour, 510 par semaine. Deux onglets :

- **Cette semaine** : les points depuis lundi minuit, heure de Paris (le podium se joue là-dessus) ;
- **Tous les temps** : les points comptés **depuis l'arrivée au classement** (la semaine d'arrivée comprise).

L'argent gagné (depuis lundi, depuis l'arrivée) s'affiche en petit à côté, pour information ; il ne classe plus. Chacun y apparaît sous un pseudo choisi en rejoignant.

**Les points ne se gonflent pas.** Le serveur ne compte que les points de **sa** semaine (le téléphone envoie aussi le lundi de ses points) et jamais au-delà du barème : 60 × (jours commencés depuis lundi, à l'horloge du serveur) + 100, et 510 au plus sur la semaine (le maximum du jeu). Un tricheur qui bricole ses points depuis la console ne fait donc jamais mieux que le meilleur joueur possible : au mieux ex æquo avec lui, à 510. Un joueur honnête n'y perd rien : le téléphone renvoie chaque fois son total de la semaine, et ce qui dépasserait un plafond se compte dès qu'il a grandi. Il passe par le même projet Supabase que Poncin (`jklbitrlkfrktmnarejc`) et sa clé publique, déjà dans `fournil/config.js`.

**Pour l'argent affiché, seuls les gains plausibles comptent.** Le téléphone envoie aussi sa fortune totale ; le serveur ne compte que ce qui dépasse la plus haute fortune déjà envoyée, et **pas plus que ce que le temps réel écoulé permet de gagner** (mesuré à l'horloge du serveur, pas à celle du téléphone). Le surplus n'est pas refusé : l'envoi est accepté, le compte est plafonné, et ce surplus est perdu pour toujours. Avancer l'heure du téléphone, bricoler sa sauvegarde ou envoyer une fortune inventée ne rapporte donc rien de plus que ce qu'un boulanger hors norme aurait gagné pendant ce temps-là. Les limites ont été tirées de l'économie du jeu (des joueurs simulés de 17 minutes à près de 24 heures par jour, pendant 60 à 120 jours, gains d'absence, coups de feu, critiques, commandes et marché du samedi compris) avec une marge d'au moins ×3,9 sur le plus acharné d'entre eux : un joueur honnête n'est jamais plafonné. Les chiffres et leur justification sont en tête de la partie 3 du fichier SQL.

Une fortune qui baisse (partie effacée, vieux code de sauvegarde, onglet en retard) ne retire rien, et la remonter (code rechargé) ne fait rien gagner de plus. Pour repartir vraiment de zéro, on **quitte puis rejoint** le classement.

**Le palmarès et les récompenses.** Chaque lundi, à la première requête de la semaine (n'importe laquelle), les **trois premiers de la semaine finie, en points,** sont figés une fois pour toutes (ex æquo au même rang, au moins 1 point). Une semaine où personne n'a de points (la dernière semaine de la version 2, si on recolle la version 3 avant qu'elle soit figée ; ou une semaine où seuls des téléphones encore en version 2 ont joué) est classée à l'argent, comme en version 2 : son podium n'est pas perdu ; une semaine où personne n'a rien gagné n'a pas de podium. Ils gagnent la **tenue** (toque et tablier or, argent ou bronze) et la **coupe** du podium : le jeu les fait porter d'office la semaine suivante, puis les garde à vie dans sa collection et sa vitrine des trophées. Pendant cette semaine-là, une petite toque à la couleur du podium s'affiche à côté de leur pseudo dans le classement. Le serveur garde le palmarès de chaque joueur tant qu'il reste au classement ; ses coupes et ses tenues, elles, restent sur son téléphone.

**L'heure du serveur.** Le jeu peut aussi demander l'heure au serveur (`fournil_heure`) : une source d'heure que les réglages du téléphone ne changent pas.

**L'événement « Le Quartier » (version 4 du SQL).** Du mardi 13 octobre 2026 à midi au mardi 27 octobre 2026 à midi (heure de Paris), le jeu ouvre une boutique à part, la Planque (`src/quartier.js`, `src/evenement.js`), avec sa monnaie : les billets. Le téléphone envoie en plus les billets gagnés dans la Planque (`p_quartier`, facultatif) et le classement a un troisième onglet, **Événement** (`p_periode = 'quartier'`), rangé aux billets. Les billets ne font que monter et jamais au-delà de l'**enveloppe du quartier** (`fournil_quartier_borne` : ce qu'un joueur 24 h sur 24 aurait pu gagner depuis l'ouverture, tiré de la simulation de `test/fournil-quartier.test.js`, marge d'au moins ×2) ; hors de la fenêtre (une heure de grâce après la fin), rien n'est compté. Après la fin, la première requête fige le **podium final** (`fournil_quartier_podium`) ; `fournil_recompenses` rend alors `quartier` (son rang, 1 à 3) et `quartier_podium` ; le jeu donne aux trois premiers la tenue du quartier en or (garde-robe, à vie). Un téléphone de la version 3 (sans `p_quartier`) est toujours accepté. La version 4 se colle par-dessus la version 3 sans rien perdre (joueurs, pseudos, points, palmarès : vérifié dans `test/fournil-classement-sql.cjs` avec `test/fournil-classement-v3.sql`, le fichier tel que collé).

### L'installer (une seule fois, 3 minutes)

1. **Ouvrir l'éditeur SQL** : sur **supabase.com**, ouvre le projet du jeu, puis dans la colonne de gauche **SQL Editor** → **New query** (une page blanche).
2. **Coller le fichier et le lancer** : ouvre [`supabase/fournil-classement.sql`](https://github.com/devclaudeapp/gamemobil/blob/master/supabase/fournil-classement.sql) sur GitHub, clique sur l'icône **Copy raw file** (les deux petits carrés, en haut à droite du fichier), colle tout dans la page blanche de Supabase, puis **Run** (ou Ctrl + Entrée). La réponse attendue : *Success. No rows returned*.
   Si Supabase demande une confirmation (« destructive operation »), réponds **Run this query** : le fichier ne fait que remplacer ses propres fonctions et retirer d'éventuelles règles d'accès posées à la main sur ses tables ; il n'efface aucun joueur ni aucun podium.
3. **Vérifier** : sur GitHub, onglet **Actions** → **Classement** → **Run workflow**. Deux coches vertes (« SQL » et « Supabase réel ») : c'est en place. Le résumé de la page dit aussi quels en-têtes la clé publique accepte et l'écart entre l'heure du serveur et la vraie. Côté jeu, rien à faire : le classement s'affiche dès que les fonctions répondent.

Le fichier se **recolle sans risque** (une nouvelle version, ou en cas de doute) : les joueurs inscrits et le palmarès restent (recollé par-dessus la version 2 : chacun garde sa ligne, son pseudo et ses podiums, les points partent de zéro), les fonctions et les droits sont remis d'aplomb, les colonnes et tables ajoutées depuis sont créées. **Après chaque modification du fichier, il faut le recoller** : le test réel dit si une ancienne version est encore en place (une version 2 est reconnue : il demande de recoller). Le jeu, lui, supporte une version 2 encore en place : il envoie alors sa fortune seule et affiche le classement à l'argent, comme avant ; et un téléphone encore en version 2 reste accepté par la version 3 (sa fortune compte, ses points ne bougent pas). Les pseudos déjà enregistrés ne sont pas revérifiés.

### Ce que ça coûte dans l'offre gratuite

Rien, et de très loin :

- **Base** : une petite table, moins de 500 octets par joueur (index compris) ; même pleine (2 000 joueurs au plus), elle pèse moins de 1 Mo sur les 500 Mo offerts. Le palmarès ajoute trois lignes par semaine (un peu plus avec des ex æquo), quelques Ko par an. Plus une table minuscule des inscriptions des dernières 24 h (`fournil_portes`), vidée au fur et à mesure.
- **Requêtes** : leur nombre n'est pas limité dans l'offre gratuite. Un téléphone envoie ses points et sa fortune toutes les 5 minutes quand le jeu est ouvert (environ 1 Ko), lit le classement quand on ouvre la feuille (environ 5 Ko), et demande de temps en temps l'heure ou ses récompenses (quelques centaines d'octets). Vingt amis qui jouent une heure par jour, c'est quelques dizaines de Mo de trafic par mois, sur les 5 Go inclus.
- **Ni temps réel, ni comptes, ni fichiers** : le classement n'utilise que la base, par cinq fonctions.
- Comme pour Poncin, un projet sans activité pendant 7 jours **se met en pause** : le jeu continue normalement, le classement attend qu'on réveille le projet depuis le tableau de bord. Le palmarès d'une semaine pendant laquelle le projet dormait est figé au réveil.

### Comment il est protégé

- Tout passe par cinq fonctions (`fournil_publier`, `fournil_classement`, `fournil_retirer`, `fournil_recompenses`, `fournil_heure`) ; personne ne peut lire ni modifier les tables `fournil_joueurs`, `fournil_palmares`, `fournil_semaines` et `fournil_portes` directement (sécurité ligne par ligne activée sans aucune règle, aucun droit pour `anon` ni `authenticated`), ni appeler les fonctions internes (l'enveloppe des gains, le palmarès).
- Chaque téléphone garde un **jeton secret** ; la base n'en garde que l'empreinte (sha256). Sans lui, impossible d'écraser le score de quelqu'un, de lire ses récompenses ni de le retirer du classement. Le classement ne montre que le rang, le pseudo, les points, l'argent gagné et la toque du podium.
- **Les points du barème et les gains plausibles** (ci-dessus) : ce que le serveur compte est plafonné par le temps réel, à son horloge à lui (jours de Paris pour les points, enveloppe des gains pour l'argent).
- Garde-fous : un envoi pris en compte toutes les 10 secondes par joueur, une fortune positive et sous 1e24 €, un pseudo de 2 à 16 caractères (lettres, accents compris, chiffres, espace, `-` `_` `'` `.`), unique sans tenir compte des majuscules. Les lettres qui imitent `l`, `i` ou la ponctuation (`ǀ`, `ı`, `ǃ`… : le latin étendu B et quelques lettres du latin étendu A) sont refusées, pour qu'on ne puisse pas se faire passer pour « Paul » avec « Pauǀ ».
- Inscriptions : **par source** (l'adresse vue par Cloudflare, en-tête `cf-connecting-ip` ; en IPv6, tout le bloc /64), 10 par heure et 20 par jour au plus ; puis, pour tout le monde ensemble, 60 par heure et 2 000 joueurs au plus. Ainsi un robot seul ne bloque pas les amis qui arrivent. La base ne garde que l'empreinte (sha256) de l'adresse, 24 h, jamais l'adresse elle-même. Les inscriptions passent une à une (un verrou), pour que des envois simultanés ne dépassent pas ces plafonds. Si Supabase ne transmettait pas `cf-connecting-ip` (le test réel le dit), seuls les plafonds communs joueraient.
- **Ménage automatique** : un boulanger sans nouvelles depuis **90 jours** (jeu jamais rouvert, téléphone changé, données effacées par le navigateur) sort du classement au premier envoi suivant de n'importe quel joueur : son pseudo et sa place se libèrent, son palmarès part avec lui. Une inscription jamais suivie d'un autre envoi sort au bout de **7 jours**. S'il revient avec le même téléphone, il réapparaît tout seul, comme un nouvel arrivé (il repart de zéro) ; si son pseudo a été repris entre-temps, le jeu lui en fait choisir un autre. Le plafond de 2 000 joueurs ne peut donc pas fermer le classement pour toujours.
- Ce qui reste hors de portée : le serveur ne voit pas la partie. Un tricheur obstiné qui envoie sans arrêt une fortune inventée, toujours à la limite, gagne au mieux environ 4 fois ce que gagnerait le joueur parfait jouant 24 h sur 24 : avec une petite fortune d'arrivée inventée, environ 1e18 € dès son arrivée (24 h d'avance, la réserve que tout nouveau venu reçoit pour qu'un honnête qui rejoint en pleine partie ne soit jamais plafonné), 8e18 € en un jour, 2e20 € en une semaine ; avec une énorme fortune d'arrivée inventée (une sauvegarde bricolée), au pire 4e19 € dès son arrivée, 1e20 € en un jour, 1,5e21 € en une semaine, car la fortune d'arrivée ne sert d'échelle que jusqu'à 1e20 € (sinon, arrivé avec 7e23 €, il compterait 2,9e23 € en dix secondes). Un joueur assidu met deux mois pour 1e19 €. Un tel intrus se retire à la main (ci-dessous).
- Le contrat (réponses, erreurs `pseudo_pris`, `pseudo_invalide`, `jeton`, `valeur`, `trop_vite`, `complet`, et ce qui a été compté par chaque envoi : `points_comptes`, `points_plafonnes`, `compte`, `plafonne`) est décrit en tête de chaque fonction dans le fichier SQL.
- Les conseils de sécurité du tableau de bord (**Advisors**) peuvent signaler « RLS enabled, no policy » sur les tables `fournil_…`, ou des fonctions `SECURITY DEFINER` appelables par `anon` : c'est voulu, c'est justement comme ça que les tables restent fermées et que seules les cinq fonctions y touchent.

### À la main, si besoin

- **Retirer un joueur** (un pseudo déplacé, un intrus) : dans le SQL Editor, en remplaçant le pseudo (son palmarès part avec lui) :
  ```sql
  delete from public.fournil_palmares where id in (select id from public.fournil_joueurs where lower(pseudo) = lower('Le pseudo'));
  delete from public.fournil_joueurs where lower(pseudo) = lower('Le pseudo');
  ```
  (Le **Table Editor** → `fournil_joueurs` → coche la ligne → **Delete** marche aussi, mais laisse ses anciens podiums dans `fournil_palmares`.)
- **Après une inondation** (des dizaines de faux joueurs d'un coup) : dans le SQL Editor, en remplaçant le motif des pseudos et la date du début :
  ```sql
  delete from public.fournil_palmares where id in (select id from public.fournil_joueurs where cree > '2026-10-09 18:00+02' and pseudo ilike 'robot%');
  delete from public.fournil_joueurs where cree > '2026-10-09 18:00+02' and pseudo ilike 'robot%';
  delete from public.fournil_portes;
  ```
  (Pour voir d'abord ce qui serait effacé : `select pseudo, total, gain, cree from public.fournil_joueurs order by cree desc limit 100;`)
- **Voir le palmarès** : `select semaine, rang, pseudo, points, valeur from public.fournil_palmares order by semaine desc, rang;` (les semaines figées en version 2 n'ont pas de points)
- **Tout désinstaller** : dans le SQL Editor,
  ```sql
  drop function if exists public.fournil_publier(uuid, text, text, double precision, integer, date), public.fournil_publier(uuid, text, text, double precision),
    public.fournil_classement(text, uuid, integer), public.fournil_retirer(uuid, text), public.fournil_recompenses(uuid, text), public.fournil_heure(),
    public.fournil_reponse(text, uuid, date, double precision, boolean, integer, boolean),
    public.fournil_reponse(text, uuid, date, double precision, boolean), public.fournil_reponse(text, uuid, date),
    public.fournil_jour(timestamptz), public.fournil_points_plafond(integer),
    public.fournil_figer(date), public.fournil_borne(double precision, double precision),
    public.fournil_duree(double precision, double precision), public.fournil_segment(integer), public.fournil_paliers(),
    public.fournil_empreinte(text), public.fournil_jeton_valable(text), public.fournil_pseudo_propre(text),
    public.fournil_lundi(timestamptz), public.fournil_maintenant();
  drop table if exists public.fournil_joueurs, public.fournil_palmares, public.fournil_semaines, public.fournil_portes;
  ```

### Le tester

- **Le SQL, sans Supabase** (dans le conteneur de Claude ou sur n'importe quel ordinateur) : le fichier est collé dans un vrai Postgres en WebAssembly (PGlite), avec les rôles de Supabase — par-dessus la version 2 telle qu'elle a été collée sur Supabase (`test/fournil-classement-v2.sql`), avec des joueurs et un palmarès, qui doivent rester, et aussi le lundi matin avant que la dernière semaine de la version 2 soit figée (son podium, à l'argent, doit rester) —, puis chaque fonction est jouée en tant qu'`anon`, le temps étant simulé : les points (plafonds du barème par jour et par semaine, semaine du serveur, anciens téléphones sans points, rang aux points et non à l'argent, joueurs honnêtes jamais plafonnés, tricheur borné), inscription (aucun argent compté), mauvais jeton, pseudos et sosies, valeurs absurdes, trop vite ; le plafond (un saut de fortune énorme n'est compté qu'à la limite, puis le surplus est perdu) ; des joueurs honnêtes de `test/longevite.js` rejoués à leur rythme réel, jamais plafonnés ; semaines et changements d'heure ; le palmarès (figé une fois, ex æquo, semaine sans joueur, joueur qui a sauté une semaine), les récompenses, la toque dans le classement, l'heure du serveur ; rangs et ex æquo, limites communes et par source, ménage à 7 et 90 jours, retrait (qui efface le palmarès), accès direct refusé. Une demi-minute :
  ```sh
  npm install --prefix /tmp/pglite --no-save --no-package-lock @electric-sql/pglite@0.5.8
  TZ=Europe/Paris node test/fournil-classement-sql.cjs /tmp/pglite
  ```
- **Pour de vrai** : le workflow **Classement** (`.github/workflows/classement.yml`), à la main depuis l'onglet Actions ou à chaque push sur la branche `classement-test`. Sa tâche « Supabase réel » (`test/fournil-classement-ci.cjs`) vérifie que les fonctions sont installées **dans leur dernière version** (une version 2 encore en place est reconnue : elle demande de recoller le fichier SQL), quels en-têtes marchent avec la clé `sb_publishable_`, que l'heure du serveur est la vraie, que les tables sont fermées, puis joue un scénario avec deux joueurs de test (`test-ci-…`) : leurs points de la semaine comptent dès l'arrivée (l'argent part de zéro), des points d'une autre semaine sont ignorés, 99 999 points sont plafonnés au barème du jour, un ancien téléphone sans points est encore accepté, l'envoi suivant est compté, une fortune qui baisse puis remonte ne compte pas deux fois, les récompenses ne se lisent qu'avec son jeton, et une fortune inventée de 1e24 € est acceptée mais plafonnée (ce joueur de test est retiré aussitôt). Elle inscrit enfin quelques joueurs de test de plus jusqu'au premier « trop_vite », pour vérifier la limite par source (si elle ne vient jamais, le résumé le signale : `cf-connecting-ip` n'arrive pas jusqu'à Postgres). Elle **retire toujours** tous ses joueurs de test à la fin. Elle inscrit au plus 12 joueurs par lancement ; avec 20 inscriptions par jour et par source, un troisième lancement le même jour depuis la même machine peut être refusé (« trop_vite » dès le début) : relancer le lendemain.
