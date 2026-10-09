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
