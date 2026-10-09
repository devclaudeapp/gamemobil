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
