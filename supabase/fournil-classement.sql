-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--  Le Fournil — le classement en ligne entre amis, en POINTS DE BOULANGER (version 6 : + les copains et les notifications)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--  À coller TEL QUEL dans Supabase : SQL Editor → New query → coller tout → Run.
--  On peut le recoller autant de fois qu'on veut, et par-dessus la version 2, 3, 4 ou 5 : les joueurs déjà inscrits, le palmarès,
--  les points, les billets, les bonbons et les podiums restent, les fonctions sont remplacées par la nouvelle version, les droits
--  sont remis d'aplomb.
--
--  Version 6.5 (19 oct. 2026) : LES PLACES DE LA SEMAINE, jusqu'au 15e, et les récompenses qui ne se perdent plus en route
--  (le même code que le patch supabase/fournil-classement-v65.sql). Collée par-dessus la v6 (ou la 6.2 à 6.4) : rien ne se perd.
--    · le palmarès de chaque semaine finie garde les QUINZE premiers (points > 0, ex æquo au même rang), et fournil_semaines le
--      nombre de joueurs classés cette semaine-là (joueurs : « 7e sur 12 » ; null pour une semaine figée avant la 6.5, qui garde
--      ses trois premiers). Les rangs 1 à 3 gagnent toujours la tenue et la coupe (podiums, derniere et la toque du classement ne
--      parlent que d'eux) ; fournil_recompenses rend en plus places : [{ semaine, rang (1 à 15), joueurs }]. Les étoiles et les
--      boosts de chaque place sont donnés par le téléphone (src/classement.js, RECOMPENSES_RANG), une fois par semaine ;
--    · une notification 'semaine' (le lundi à 9 h, heure de Paris, pour les abonnés qui ont gardé la case « objectif commun »),
--      mise dans la file par fournil_figer pour chaque joueur classé de la semaine qui vient de finir ;
--    · les pourboires reçus et la récompense de l'objectif commun ne sont plus marqués à la lecture : fournil_recompenses les rend
--      tant que le téléphone ne les a pas accusés (fournil_vu_pourboires, et la nouvelle fournil_vu_objectif), ce qu'il fait
--      après les avoir rangés et sauvés. Une réponse perdue : ils reviennent à la lecture suivante, le téléphone reconnaît ceux qu'il
--      a déjà rangés (rien n'est payé deux fois) ;
--    · un téléphone de la v6 est toujours servi : les mêmes champs, places en plus ; il ne lit que les rangs 1 à 3.
--
--  Version 6 (15 oct. 2026) : LES COPAINS et LES NOTIFICATIONS. Collée par-dessus la v5 : rien ne se perd (joueurs, points,
--  palmarès, billets, bonbons, podiums), et un téléphone de la v5 est toujours accepté (p_photo est facultatif).
--    · la PHOTO de sa boutique : fournil_publier prend p_photo (facultatif), un petit objet JSON (nom, quartier, postes, mobilier,
--      tenue, chat…) ; 2 Ko compacts côté téléphone ; le serveur mesure le texte jsonb, qui ajoute des espaces, et tolère 3 Ko ;
--      plus gros, pas un objet, ou moins de 10 min après la précédente : ignorée, sans refuser l'envoi ; la réponse dit photo_maj.
--      fournil_boutique(p_pseudo) la rend à tous (on visite la boutique d'un copain depuis le classement) ;
--    · le POURBOIRE (fournil_pourboire) : un par jour et par copain, 3 par jour en tout (jour de Paris). Le donneur gagne une
--      étoile dans son jeu (version 6.1 ; en 6.0, un point de la semaine, compté à part dans points_bonus, qui reste pour l'historique). Le receveur le trouve dans fournil_recompenses (pourboires, rendus tant
--      que fournil_vu_pourboires ne les a pas accusés, depuis la version 6.5), et une notification part s'il l'a demandé ;
--    · l'OBJECTIF COMMUN de la semaine (fournil_objectif) : la somme des points de la semaine de tous les joueurs, contre un but de
--      150 × les joueurs actifs de la semaine précédente, de 300 à 6 000 (fixé une fois pour la semaine). Figé avec le palmarès, à
--      la première requête de la semaine suivante ; réussi, ceux qui y ont mis 30 points ou plus trouvent leur récompense dans
--      fournil_recompenses (objectif, jusqu'à ce que fournil_vu_objectif l'accuse), et une notification part ;
--    · les NOTIFICATIONS (Web Push) : fournil_abonner / fournil_desabonner (5 appareils au plus par joueur, ses 4 préférences),
--      fournil_planifier (« Ta boulangerie déborde » à l'heure où son absence est pleine), fournil_notif_essai. Une file
--      (fournil_notifs) que vide la fonction d'envoi (supabase/functions/notifier, réveillée toutes les 5 min par
--      supabase/fournil-notifs-cron.sql) par fournil_notifs_dues et fournil_notifs_faites, RÉSERVÉES AU RÔLE DE SERVICE : ni anon
--      ni authenticated ne peuvent les appeler. Les ouvertures et fins d'événements (fournil_evts et le Quartier) s'annoncent
--      d'elles-mêmes, une fois, dans l'heure qui suit ;
--    · le ménage : les notifications de plus de 7 jours, les pourboires de plus de 30 jours ; un joueur qui part (retrait, ménage des
--      90 jours) emporte sa photo, ses pourboires, ses appareils et ses notifications (clés étrangères « on delete cascade »).
--
--  Version 5 (15 oct. 2026) : les ÉVÉNEMENTS GÉNÉRIQUES, et le premier d'entre eux, « LA MAISON HANTÉE » (Halloween, du mardi
--  27 octobre 2026 à midi au lundi 2 novembre 2026 à 20 h, heure de Paris ; src/hantee.js). Collée par-dessus la v4 : rien ne se
--  perd, et le Quartier reste lisible tel quel (ses colonnes, son classement 'quartier', son podium final, ses champs de réponse).
--    · un événement = une ligne de fournil_evts() (partie 3 ter) : son identifiant ('hantee'), sa fenêtre, et l'enveloppe de son
--      score (une table de log10 à pas fixe, tirée de la simulation de son fichier de règles, marge d'au moins ×2) ; en ajouter un
--      autre plus tard, c'est ajouter une ligne, rien d'autre ;
--    · le téléphone envoie son score (les bonbons) avec p_evt = 'hantee' et p_score (facultatifs) ; le score ne fait que monter,
--      jamais au-delà de l'enveloppe, et ne compte que dans la fenêtre (plus une heure de grâce) ; il vit dans fournil_evt_scores
--      (une ligne par joueur et par événement : la colonne evt et son score) ;
--    · un classement à part par événement (p_periode = 'hantee'), et un podium final figé une fois après la fin
--      (fournil_evt_podium), rendu par fournil_recompenses (evenements : { hantee: { rang, podium } }) ;
--    · « EN LIGNE » : fournil_joueurs.vu (l'heure du serveur du dernier signe de vie : un envoi accepté de fournil_publier, ou un
--      battement de la nouvelle fonction fournil_vu, qui ne compte rien) ; le classement rend pour chaque ligne en_ligne (vu il y a
--      moins de 4 minutes), et en_ligne_n (combien de joueurs de cette liste sont en ligne) ; jamais l'heure elle-même ;
--    · un téléphone de la v4 (sans p_evt) est toujours accepté ; un téléphone de la v5 face à une v4 renvoie sans p_evt.
--
--  Version 4 (12 oct. 2026) : l'ÉVÉNEMENT « LE QUARTIER » (du mardi 13 octobre 2026 à midi au mardi 27 octobre à midi, heure de
--  Paris ; src/quartier.js) : le téléphone envoie en plus les billets gagnés dans sa Planque (p_quartier, facultatif) ; un classement
--  à part (p_periode = 'quartier') ; le podium final figé après la fin, rendu par fournil_recompenses (quartier : son rang,
--  quartier_podium : les trois premiers). Collée par-dessus la v3 : rien ne se perd (joueurs, pseudos, palmarès, points).
--    · les billets ne font que monter (la plus haute valeur envoyée), et jamais au-delà de l'ENVELOPPE DU QUARTIER : ce qu'un joueur
--      24 h sur 24 aurait pu gagner depuis l'ouverture (fournil_quartier_borne : une table de quinze valeurs, un log10 par jour,
--      tirée de la simulation de test/fournil-quartier.test.js, avec une marge d'au moins ×2 ; un tricheur qui envoie 1e24 ne
--      fait au mieux que doubler le joueur parfait) ; hors de la fenêtre (une heure de grâce après la fin), rien n'est compté ;
--    · un téléphone de la v3 (sans p_quartier) est toujours accepté : ses billets ne bougent pas.
--
--  Version 3 (12 oct. 2026) : on classe en POINTS DE BOULANGER, indépendants du niveau (voir « Les points » plus bas) ;
--  la fortune reste comptée comme avant, pour information. Collée par-dessus la v2 : chacun garde sa ligne, son pseudo et son
--  palmarès ; les points partent de zéro au collage et arrivent avec la nouvelle version du jeu (un téléphone encore en v2
--  continue d'envoyer sa fortune, sans points).
--
--  Ce qu'il installe :
--    · public.fournil_joueurs : un joueur = une ligne (pseudo, points de la semaine et depuis son arrivée, argent gagné depuis
--      son arrivée et cette semaine, et de quoi juger si ses gains sont plausibles) ;
--    · public.fournil_palmares : les quinze premiers de chaque semaine finie (les trois premiers avant la version 6.5), en points (ex
--      æquo compris), figés une fois pour toutes ;
--    · public.fournil_semaines : les semaines déjà figées (même celles où personne n'a joué), et combien de joueurs y étaient classés ;
--    · public.fournil_portes : les inscriptions des dernières 24 h, par source (seulement une empreinte de l'adresse) ;
--    · public.fournil_quartier_podium : les trois premiers de l'événement « Le Quartier », figés après sa fin ;
--    · public.fournil_evenements : les événements dont le podium est figé ;
--    · public.fournil_evt_scores : le score de chaque joueur à chaque événement générique (version 5) ;
--    · public.fournil_evt_podium : les podiums finaux des événements génériques, figés après leur fin ;
--    · version 6 : public.fournil_photos, fournil_pourboires, fournil_objectif, fournil_objectif_gagnants, fournil_abonnements,
--      fournil_notif_prefs, fournil_notifs (la file des notifications), fournil_annonces (les événements déjà annoncés) ;
--    · les fonctions appelées par le jeu : fournil_publier, fournil_classement, fournil_retirer, fournil_recompenses,
--      fournil_heure, fournil_vu ; et depuis la version 6 : fournil_boutique, fournil_pourboire, fournil_vu_pourboires,
--      fournil_objectif, fournil_abonner, fournil_desabonner, fournil_planifier, fournil_notif_essai ; et depuis la 6.5 : fournil_vu_objectif ;
--    · deux fonctions pour la fonction d'envoi seulement (rôle service_role) : fournil_notifs_dues, fournil_notifs_faites.
--  Personne ne lit ni n'écrit les tables directement : tout passe par ces fonctions, qui vérifient tout.
--
--  Les points (ce qui classe) :
--    · le jeu compte ses points de boulanger (src/game.js), du lundi au dimanche, heure de Paris : journée complète (les trois
--      objectifs du jour) 10 ; défi de la semaine 30 ; événement réussi (pétrissage, commande livrée, four réparé, bonne
--      critique, pourboire du client mystère) 2, au plus 20 par jour ; Atelier : le meilleur score de la semaine de chaque
--      mini-jeu, de 0 à 20 points ; améliorations : 1 point par tranche d'achats valant 10 minutes de SES PROPRES gains,
--      + 5 par palier ×2 franchi, au plus 30 par jour. Au plus 60 points par jour, 510 par semaine (7 × 60 + 30 + 3 × 20) ;
--    · le téléphone envoie ses points de la semaine (p_points) avec le lundi de cette semaine (p_lundi) : seule la semaine du
--      serveur compte (un téléphone en retard ou en avance de quelques minutes sur minuit ne mélange pas deux semaines) ;
--    · le serveur ne compte que ce qui DÉPASSE les points déjà comptés cette semaine, et pas au-delà des plafonds :
--        - depuis lundi : 60 × (jours de la semaine commencés, heure de Paris) + 100 (le défi et l'Atelier, 90, peuvent tomber
--          dès le premier jour), et 510 au plus (le barème d'une semaine entière : le jeu lui-même ne compte jamais plus) ;
--          c'est ce plafond qui borne la croissance par le temps réel (l'horloge du serveur) : 160 le lundi, 220 le mardi… ;
--      l'envoi est accepté, le compte plafonné ; comme le téléphone renvoie chaque fois son total de la semaine, ce qui dépasse
--      se compte plus tard, quand le plafond a grandi (un joueur honnête n'y perd rien : test/fournil-classement-sql.cjs
--      rejoue ceux de test/longevite.js, jamais plafonnés). Un tricheur qui bricole ses points depuis la console ne fait donc
--      jamais mieux que le meilleur joueur possible : au plus 510, ex æquo avec lui ;
--    · « Cette semaine » = les points depuis lundi (le podium, la tenue et la coupe se jouent là-dessus) ;
--    · « Tous les temps » = tous les points comptés depuis l'arrivée au classement (la semaine d'arrivée comprise) ;
--    · un ancien téléphone (sans p_points) est toujours accepté : sa fortune compte, ses points ne bougent pas.
--
--  La fortune (affichée en petit, pour information) :
--    · le téléphone envoie sa FORTUNE TOTALE (tout l'argent gagné depuis le début de la partie) ; le serveur n'en compte que
--      ce qui est PLAUSIBLE : entre deux envois, le gain compté est plafonné par ce que le temps réel écoulé (l'horloge du
--      serveur, pas celle du téléphone) permet de gagner. L'excès est perdu pour toujours (l'envoi est accepté, le compte
--      plafonné). Avancer l'heure du téléphone, bricoler sa sauvegarde ou envoyer 1e24 depuis la console ne rapporte donc
--      au plus que ce qu'un boulanger hors norme aurait pu gagner pendant ce temps-là (l'enveloppe, partie 3) ;
--    · l'argent de « Tous les temps » = gagné DEPUIS L'ARRIVÉE AU CLASSEMENT (la toute première publication ne compte rien :
--      on part de zéro, quelle que soit la fortune de la sauvegarde) ;
--    · l'argent de « Cette semaine » = gagné depuis lundi minuit, heure de Paris (même règle de plausibilité) ;
--    · seul compte ce qui DÉPASSE la plus haute fortune déjà envoyée (colonne sommet) : une fortune qui baisse (partie
--      effacée, vieux code de sauvegarde, onglet en retard) puis remonte ne compte jamais deux fois. Pour repartir vraiment
--      de zéro après une partie effacée exprès, on quitte le classement puis on le rejoint ;
--
--  Le palmarès et le reste :
--    · le palmarès : à la première requête d'une nouvelle semaine (quelle qu'elle soit), les quinze premiers de la semaine
--      finie, EN POINTS (points > 0, ex æquo au même rang), sont figés une fois pour toutes. Les trois premiers gagnent la tenue et la
--      coupe du podium (or, argent, bronze), portées la semaine suivante puis gardées à vie sur le téléphone ; chacun des quinze, des
--      étoiles et un boost (version 6.5, donnés par le téléphone). Une semaine où personne n'a de
--      points (la dernière de la v2, quand on recolle la v3 le lundi avant qu'elle soit figée ; ou une semaine où seuls des
--      téléphones de la v2 ont joué) est classée à l'argent, comme en v2 : son podium n'est pas perdu ;
--    · chaque joueur a un pseudo (2 à 16 caractères : lettres, accents compris, chiffres, espace, - _ ' .), unique sans
--      tenir compte des majuscules ;
--    · chaque joueur garde sur son téléphone un jeton secret ; ici on ne garde que son empreinte (sha256), jamais le jeton :
--      sans le jeton, impossible d'écraser le score de quelqu'un d'autre, de lire ses récompenses ni de le retirer.
--
--  Les garde-fous (pour qu'un petit malin ne puisse ni tricher ni tout remplir) :
--    · une fortune doit être un vrai nombre, positif, et sous 1e24 € ; ce qui en est compté est plafonné (ci-dessus) ;
--    · un envoi pris en compte toutes les 10 secondes au plus par joueur (les autres répondent « trop_vite » sans rien changer) ;
--    · par source (l'adresse vue par Cloudflare, en-tête cf-connecting-ip ; en IPv6, tout le bloc /64) : 10 inscriptions par
--      heure et 20 par jour au plus ;
--    · pour tout le monde ensemble : 60 nouveaux joueurs par heure au plus, et 2 000 joueurs au plus en tout ;
--      les inscriptions passent une à une (verrou), pour que ces plafonds ne se contournent pas en rafale ;
--    · le ménage se fait tout seul, au premier envoi suivant de n'importe quel joueur : une ligne sans nouvelles depuis
--      90 jours est effacée (son pseudo et sa place se libèrent, son palmarès part avec elle), et une ligne jamais mise à
--      jour depuis son inscription l'est au bout de 7 jours. Le boulanger revient tout seul à son prochain envoi, comme une
--      nouvelle inscription (il repart de zéro) ;
--    · les paramètres sont typés, aucun texte n'est jamais assemblé en SQL : pas d'injection possible.
--
--  Supabase (Postgres 15 ou plus récent), aucune extension nécessaire : sha256() est intégré à Postgres.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. Les tables ──────────────────────────────────────────────────────────────────────────────
create table if not exists public.fournil_joueurs (
  id        uuid primary key,                          -- tiré au hasard par le téléphone, jamais affiché
  jeton     text not null,                             -- EMPREINTE sha256 (hexadécimale) du jeton secret, pas le jeton
  pseudo    text not null,                             -- le nom affiché dans le classement
  fortune   double precision not null default 0,       -- la fortune envoyée au dernier envoi (pour mémoire)
  sommet    double precision not null default 0,       -- la plus haute fortune envoyée : seul ce qui la dépasse peut compter
  plausible double precision not null default 0,       -- la fortune d'arrivée + tout ce qui a été compté : l'échelle de la borne
  reserve   double precision not null default 86400,   -- le temps d'enveloppe pas encore utilisé, en secondes (24 h au plus)
  total     double precision not null default 0,       -- « Tous les temps » : gagné depuis l'arrivée au classement
  gain      double precision not null default 0,       -- « Cette semaine » : gagné pendant la semaine de la colonne semaine
  semaine   date not null,                             -- le lundi (heure de Paris) de la semaine du gain et des points
  cree      timestamptz not null default now(),        -- inscription
  maj       timestamptz not null default now(),        -- dernier envoi pris en compte (heure du serveur)
  points    integer not null default 0,                -- « Cette semaine » : les points comptés pendant la semaine de la colonne semaine
  points_total integer not null default 0,             -- « Tous les temps » : les points comptés depuis l'arrivée au classement
  points_jour date                                     -- le jour (heure de Paris) du dernier envoi de points (null : jamais)
);
-- recoller ce fichier par-dessus une version plus ancienne : les colonnes manquantes sont ajoutées (chacun repart de zéro
-- pour « Tous les temps » et pour la semaine, avec sa plus haute fortune comme échelle), l'ancienne base de la semaine disparaît
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'fournil_joueurs' and column_name = 'sommet') then
    alter table public.fournil_joueurs add column sommet double precision not null default 0;
    update public.fournil_joueurs set sommet = fortune;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'fournil_joueurs' and column_name = 'plausible') then
    alter table public.fournil_joueurs add column plausible double precision not null default 0;
    update public.fournil_joueurs set plausible = least(greatest(sommet, fortune), 1e20); -- l'échelle d'arrivée plafonnée (partie 3)
  end if;
end
$$;
alter table public.fournil_joueurs add column if not exists reserve double precision not null default 86400;
alter table public.fournil_joueurs add column if not exists total   double precision not null default 0;
alter table public.fournil_joueurs add column if not exists gain    double precision not null default 0;
alter table public.fournil_joueurs drop column if exists base_semaine;
-- version 3 : les points (une ligne de la v2 garde tout le reste, ses points partent de zéro)
alter table public.fournil_joueurs add column if not exists points       integer not null default 0;
alter table public.fournil_joueurs add column if not exists points_total integer not null default 0;
alter table public.fournil_joueurs add column if not exists points_jour  date;
-- version 4 : les billets de l'événement « Le Quartier » (la plus haute valeur plausible envoyée) et l'heure de ce dernier envoi
alter table public.fournil_joueurs add column if not exists quartier     double precision not null default 0;
alter table public.fournil_joueurs add column if not exists quartier_maj timestamptz;
-- version 5 : le dernier signe de vie (heure du serveur), pour « en ligne » ; jamais rendu tel quel
alter table public.fournil_joueurs add column if not exists vu           timestamptz;
-- version 6 : les points de la semaine gagnés en donnant des pourboires (déjà comptés dans points et points_total) ; à part, pour que
-- l'envoi suivant du téléphone (qui ne les connaît pas) ne les absorbe pas
alter table public.fournil_joueurs add column if not exists points_bonus integer not null default 0;

comment on table public.fournil_joueurs is
  'Le Fournil : le classement entre amis. Accès uniquement par les fonctions du jeu (fournil_publier, fournil_classement, fournil_retirer, fournil_recompenses, fournil_vu, fournil_boutique, fournil_pourboire…).';

-- un pseudo ne sert qu'une fois, sans tenir compte des majuscules (« Marie » et « MARIE » sont le même pseudo)
create unique index if not exists fournil_joueurs_pseudo on public.fournil_joueurs (lower(pseudo));

-- le palmarès : les quinze premiers (ex æquo compris ; les trois premiers avant la version 6.5) de chaque semaine finie, avec le
-- pseudo, les points et le gain de ce moment-là
create table if not exists public.fournil_palmares (
  semaine date not null,                               -- le lundi de la semaine finie
  rang    integer not null check (rang between 1 and 15),
  id      uuid not null,                               -- le joueur (jamais renvoyé au jeu)
  pseudo  text not null,
  valeur  double precision not null,                   -- son gain (en euros) de cette semaine-là
  points  integer,                                     -- ses points de cette semaine-là (null : semaine figée en version 2, classée à l'argent)
  primary key (semaine, id)
);
alter table public.fournil_palmares add column if not exists points integer;
-- version 6.5 : du 1er au 15e (une table d'avant n'acceptait que 1 à 3 ; ses lignes restent telles quelles)
alter table public.fournil_palmares drop constraint if exists fournil_palmares_rang_check;
alter table public.fournil_palmares add constraint fournil_palmares_rang_check check (rang between 1 and 15);
create index if not exists fournil_palmares_id on public.fournil_palmares (id);
comment on table public.fournil_palmares is
  'Le Fournil : les podiums des semaines finies, figés une fois. Accès uniquement par les fonctions du jeu.';

-- les semaines déjà figées, même vides : une semaine n'est figée qu'une fois
create table if not exists public.fournil_semaines (
  semaine date primary key,
  figee   timestamptz not null,
  joueurs integer                                      -- version 6.5 : les joueurs classés cette semaine-là (« 7e sur 12 ») ; null avant
);
alter table public.fournil_semaines add column if not exists joueurs integer;
comment on table public.fournil_semaines is
  'Le Fournil : les semaines dont le palmarès est figé. Accès uniquement par les fonctions du jeu.';

-- l'événement « Le Quartier » : le podium final (les trois premiers en billets, ex æquo compris), figé une fois pour toutes à la
-- première requête qui suit la fin ; et la liste des événements figés (même quand personne n'a joué)
create table if not exists public.fournil_quartier_podium (
  id      uuid primary key,                             -- le joueur (jamais renvoyé au jeu)
  rang    integer not null check (rang between 1 and 3),
  pseudo  text not null,
  valeur  double precision not null                    -- ses billets à la fin
);
comment on table public.fournil_quartier_podium is
  'Le Fournil : le podium final de l’événement « Le Quartier », figé une fois. Accès uniquement par les fonctions du jeu.';
create table if not exists public.fournil_evenements (
  nom   text primary key,
  figee timestamptz not null
);
comment on table public.fournil_evenements is
  'Le Fournil : les événements dont le podium est figé. Accès uniquement par les fonctions du jeu.';

-- version 5 : les événements génériques (fournil_evts, partie 3 ter). Un score par joueur et par événement (evt : son identifiant,
-- 'hantee' ; valeur : la plus haute valeur plausible envoyée), et le podium final de chaque événement, figé une fois après sa fin.
create table if not exists public.fournil_evt_scores (
  evt    text not null,                                -- l'événement ('hantee')
  id     uuid not null,                                -- le joueur (jamais renvoyé au jeu)
  valeur double precision not null default 0,          -- son score (les bonbons de la Maison hantée)
  maj    timestamptz not null,                         -- le dernier envoi qui l'a fait monter (heure du serveur)
  primary key (evt, id)
);
create index if not exists fournil_evt_scores_id on public.fournil_evt_scores (id);
comment on table public.fournil_evt_scores is
  'Le Fournil : les scores des événements (un par joueur et par événement). Accès uniquement par les fonctions du jeu.';
create table if not exists public.fournil_evt_podium (
  evt    text not null,
  id     uuid not null,                                -- le joueur (jamais renvoyé au jeu)
  rang   integer not null check (rang between 1 and 3),
  pseudo text not null,
  valeur double precision not null,                    -- son score à la fin
  primary key (evt, id)
);
create index if not exists fournil_evt_podium_id on public.fournil_evt_podium (id);
comment on table public.fournil_evt_podium is
  'Le Fournil : les podiums finaux des événements, figés une fois. Accès uniquement par les fonctions du jeu.';

-- ─── version 6 : les copains et les notifications ───
-- Chaque ligne appartient à un joueur : elle part avec lui (retrait, ménage des 90 jours), par la clé étrangère.

-- la photo de sa boutique (un petit objet JSON, 3 Ko de texte jsonb au plus), une par joueur, mise à jour au plus toutes les 10 min
create table if not exists public.fournil_photos (
  id    uuid primary key references public.fournil_joueurs (id) on delete cascade,
  photo jsonb not null,
  maj   timestamptz not null                           -- la dernière photo gardée (heure du serveur)
);
comment on table public.fournil_photos is
  'Le Fournil : la photo de la boutique de chaque joueur (visite entre copains). Accès uniquement par les fonctions du jeu.';

-- les pourboires : un par jour (de Paris) et par copain, 3 par jour en tout pour un donneur ; gardés 30 jours
create table if not exists public.fournil_pourboires (
  de    uuid not null references public.fournil_joueurs (id) on delete cascade,   -- le donneur
  a     uuid not null references public.fournil_joueurs (id) on delete cascade,   -- le receveur
  jour  date not null,                                  -- le jour du don, heure de Paris
  quand timestamptz not null,
  vu    timestamptz,                                    -- quand le receveur l'a reçu (fournil_recompenses) ; null : pas encore
  primary key (de, a, jour)
);
create index if not exists fournil_pourboires_a on public.fournil_pourboires (a, vu);
create index if not exists fournil_pourboires_jour on public.fournil_pourboires (de, jour);
comment on table public.fournil_pourboires is
  'Le Fournil : les pourboires entre copains (30 jours). Accès uniquement par les fonctions du jeu.';

-- l'objectif commun : une ligne par semaine, son but fixé une fois, puis figé (total, joueurs actifs, réussi) au début de la suivante
create table if not exists public.fournil_objectif (
  semaine date primary key,                             -- le lundi
  but     integer not null,                             -- 150 × les joueurs actifs de la semaine précédente, de 300 à 6 000
  total   integer,                                      -- la somme des points de la semaine (null tant qu'elle n'est pas figée)
  joueurs integer,                                      -- les joueurs actifs de la semaine (au moins 1 point ; null avant)
  reussi  boolean,                                      -- null tant qu'elle n'est pas figée
  fige    timestamptz
);
comment on table public.fournil_objectif is
  'Le Fournil : l’objectif commun de chaque semaine. Accès uniquement par les fonctions du jeu.';
-- ceux qui ont mis 30 points ou plus dans une semaine réussie ; recu : quand fournil_recompenses le leur a rendu
create table if not exists public.fournil_objectif_gagnants (
  semaine date not null,
  id      uuid not null references public.fournil_joueurs (id) on delete cascade,
  recu    timestamptz,
  primary key (semaine, id)
);
create index if not exists fournil_objectif_gagnants_id on public.fournil_objectif_gagnants (id);
comment on table public.fournil_objectif_gagnants is
  'Le Fournil : les récompenses de l’objectif commun. Accès uniquement par les fonctions du jeu.';

-- les appareils abonnés aux notifications (Web Push) : 5 au plus par joueur ; un appareil (son endpoint) n'a qu'un joueur
create table if not exists public.fournil_abonnements (
  endpoint text primary key,                            -- l'adresse du service de notifications du navigateur (https, 1 000 caractères au plus)
  joueur   uuid not null references public.fournil_joueurs (id) on delete cascade,
  p256dh   text not null,                               -- la clé publique de l'appareil (base64url)
  auth     text not null,                               -- son secret d'authentification (base64url)
  cree     timestamptz not null
);
create index if not exists fournil_abonnements_joueur on public.fournil_abonnements (joueur, cree);
comment on table public.fournil_abonnements is
  'Le Fournil : les appareils abonnés aux notifications. Accès uniquement par les fonctions du jeu et la fonction d’envoi.';
-- ses préférences : les quatre cas, gardés par joueur
create table if not exists public.fournil_notif_prefs (
  id         uuid primary key references public.fournil_joueurs (id) on delete cascade,
  pleine     boolean not null default true,             -- « Ta boulangerie déborde »
  evenements boolean not null default true,             -- ouverture et fin d'un événement
  pourboires boolean not null default true,             -- « X t'a laissé un pourboire »
  objectif   boolean not null default true,             -- l'objectif commun réussi
  maj        timestamptz not null
);
comment on table public.fournil_notif_prefs is
  'Le Fournil : les préférences de notifications de chaque joueur. Accès uniquement par les fonctions du jeu.';
-- la file : une ligne par notification à envoyer (type 'pleine', 'pourboire', 'evenement', 'objectif', 'essai', et depuis la 6.5
-- 'semaine' ; 'retour' et 'vote' viennent de fournil-retours.sql) ; gardée 7 jours
create table if not exists public.fournil_notifs (
  id      bigint generated by default as identity primary key,
  joueur  uuid not null references public.fournil_joueurs (id) on delete cascade,
  type    text not null check (type in ('pleine', 'pourboire', 'evenement', 'objectif', 'essai', 'retour', 'vote', 'semaine')),
  titre   text not null,
  texte   text not null,
  url     text not null,
  due     timestamptz not null,                         -- à envoyer à partir de cette heure
  envoyee timestamptz,                                  -- envoyée (null : pas encore)
  cree    timestamptz not null,
  prise   timestamptz                                   -- prise par la fonction d'envoi (pour que deux tournées n'envoient pas deux fois)
);
-- version 6.5 : la liste des types, remise à jour sur une file d'avant (celle de la v6, ou celle élargie par fournil-retours.sql)
alter table public.fournil_notifs drop constraint if exists fournil_notifs_type_check;
alter table public.fournil_notifs add constraint fournil_notifs_type_check
  check (type in ('pleine', 'pourboire', 'evenement', 'objectif', 'essai', 'retour', 'vote', 'semaine'));
create index if not exists fournil_notifs_due on public.fournil_notifs (due) where envoyee is null;
create index if not exists fournil_notifs_joueur on public.fournil_notifs (joueur, type);
comment on table public.fournil_notifs is
  'Le Fournil : la file des notifications. Accès uniquement par les fonctions du jeu et la fonction d’envoi.';
-- les ouvertures et fins d'événements déjà annoncées (cle : « hantee:ouverture », « quartier:fin »…)
create table if not exists public.fournil_annonces (
  cle   text primary key,
  quand timestamptz not null
);
comment on table public.fournil_annonces is
  'Le Fournil : les événements déjà annoncés par notification. Accès uniquement par les fonctions du jeu.';

-- les portes : une ligne par inscription réussie, avec l'empreinte de sa source (sha256 de « ip:<adresse> »), gardée 24 h.
-- Elle sert à limiter les inscriptions par source, pour qu'un seul robot ne bloque pas les amis qui arrivent.
create table if not exists public.fournil_portes (
  empreinte text not null,
  quand     timestamptz not null
);
create index if not exists fournil_portes_empreinte on public.fournil_portes (empreinte, quand);
comment on table public.fournil_portes is
  'Le Fournil : les inscriptions des dernières 24 h par source (empreinte seulement). Accès uniquement par fournil_publier.';

-- la sécurité ligne par ligne est activée SANS aucune règle : personne ne voit ni ne touche ces tables par l'API.
-- On enlève les règles qui auraient pu être ajoutées à la main, pour que ce soit toujours vrai.
alter table public.fournil_joueurs enable row level security;
alter table public.fournil_palmares enable row level security;
alter table public.fournil_semaines enable row level security;
alter table public.fournil_portes enable row level security;
alter table public.fournil_quartier_podium enable row level security;
alter table public.fournil_evenements enable row level security;
alter table public.fournil_evt_scores enable row level security;
alter table public.fournil_evt_podium enable row level security;
alter table public.fournil_photos enable row level security;
alter table public.fournil_pourboires enable row level security;
alter table public.fournil_objectif enable row level security;
alter table public.fournil_objectif_gagnants enable row level security;
alter table public.fournil_abonnements enable row level security;
alter table public.fournil_notif_prefs enable row level security;
alter table public.fournil_notifs enable row level security;
alter table public.fournil_annonces enable row level security;
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_catalog.pg_policies
            where schemaname = 'public'
              and tablename in ('fournil_joueurs', 'fournil_palmares', 'fournil_semaines', 'fournil_portes', 'fournil_quartier_podium', 'fournil_evenements',
                                'fournil_evt_scores', 'fournil_evt_podium', 'fournil_photos', 'fournil_pourboires', 'fournil_objectif',
                                'fournil_objectif_gagnants', 'fournil_abonnements', 'fournil_notif_prefs', 'fournil_notifs', 'fournil_annonces') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- aucun droit direct sur les tables pour les visiteurs (anon) ni pour les comptes (authenticated) :
-- Supabase en donne par défaut aux nouvelles tables, on les retire explicitement.
revoke all on table public.fournil_joueurs, public.fournil_palmares, public.fournil_semaines, public.fournil_portes,
  public.fournil_quartier_podium, public.fournil_evenements, public.fournil_evt_scores, public.fournil_evt_podium,
  public.fournil_photos, public.fournil_pourboires, public.fournil_objectif, public.fournil_objectif_gagnants,
  public.fournil_abonnements, public.fournil_notif_prefs, public.fournil_notifs, public.fournil_annonces
  from public, anon, authenticated;
revoke all on sequence public.fournil_notifs_id_seq from public, anon, authenticated;

-- les fonctions d'une version plus ancienne dont la forme a changé (une ancienne forme laissée en place rendrait l'appel
-- ambigu pour l'API : on la retire avant de créer la nouvelle)
drop function if exists public.fournil_reponse(text, uuid, date);
drop function if exists public.fournil_reponse(text, uuid, date, double precision, boolean);
drop function if exists public.fournil_publier(uuid, text, text, double precision);
-- version 3 → 4 : fournil_publier prend p_quartier, fournil_reponse rend les billets et le rang de l'événement
drop function if exists public.fournil_reponse(text, uuid, date, double precision, boolean, integer, boolean);
drop function if exists public.fournil_publier(uuid, text, text, double precision, integer, date);
-- version 4 → 5 : fournil_publier prend p_evt et p_score, fournil_reponse rend le score de l'événement
drop function if exists public.fournil_reponse(text, uuid, date, double precision, boolean, integer, boolean, boolean);
drop function if exists public.fournil_publier(uuid, text, text, double precision, integer, date, double precision);
-- version 5 → 6 : fournil_publier prend p_photo
drop function if exists public.fournil_publier(uuid, text, text, double precision, integer, date, double precision, text, double precision);


-- ─── 2. Les petites fonctions internes (le jeu ne peut pas les appeler) ─────────────────────────

-- l'heure du serveur, en un seul endroit (les tests la remplacent pour simuler le temps qui passe ;
-- recoller ce fichier la remet à l'heure vraie)
create or replace function public.fournil_maintenant()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now()
$$;

-- le lundi de la semaine, heure de Paris : la semaine change le lundi à minuit à Paris, heure d'été comme d'hiver
create or replace function public.fournil_lundi(p_quand timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('week', p_quand at time zone 'Europe/Paris')::date
$$;

-- le jour, heure de Paris
create or replace function public.fournil_jour(p_quand timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_quand at time zone 'Europe/Paris')::date
$$;

-- le plafond des points : ce que le barème permet en p_jours jours commencés (heure de Paris), avec une petite marge.
-- Le barème (src/game.js, POINTS) : au plus 60 points par jour (journée 10, événements 20, améliorations 30) ; une fois par
-- semaine, le défi (30) et l'Atelier (3 × 20) ; soit 510 sur une semaine. Jour par jour : 60 × jours + 100 (le défi et
-- l'Atelier peuvent tomber dès le premier jour, plus 10 de marge pour un minuit approximatif) ; sur la semaine : 510 tout
-- rond, sans marge (le jeu plafonne lui-même ses points à 510 : un tricheur ne peut au mieux qu'égaler le joueur parfait).
create or replace function public.fournil_points_plafond(p_jours integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(510, 60 * least(greatest(coalesce(p_jours, 1), 1), 7) + 100)
$$;

-- le pseudo nettoyé, ou null s'il n'est pas valable :
--   · forme Unicode composée (é tapé en deux morceaux devient un seul é) ;
--   · apostrophes typographiques ’ ‘ ʼ ` ´ → ' (le clavier des iPhone les met tout seul) ;
--   · les blancs (espaces, tabulations, espaces insécables…) deviennent une seule espace, rien au début ni à la fin ;
--   · 2 à 16 caractères : lettres A-Z, lettres accentuées (latin et latin étendu A, de À à ž, sans × ni ÷ ni les lettres
--     qui imitent l, i ou la ponctuation : ı Ĳ ĳ ĸ Ŀ ŀ ŉ ſ et tout le latin étendu B, comme ǀ ou ǃ), chiffres, espace, - _ ' . ;
--   · au moins une lettre ou un chiffre (pas de pseudo fait que de points ou de tirets).
create or replace function public.fournil_pseudo_propre(p_pseudo text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_pseudo is null or length(p_pseudo) > 64 then
    return null;
  end if;
  v := normalize(p_pseudo, NFC);
  v := translate(v, E'’‘ʼ`´', '''''''''''');
  v := btrim(regexp_replace(v, E'[[:space:]   -     　﻿]+', ' ', 'g'));
  if char_length(v) < 2 or char_length(v) > 16 then
    return null;
  end if;
  if v !~ E'^[0-9A-Za-zÀ-ÖØ-öø-İĴ-ķĹ-ľŁ-ňŊ-ž _''.-]+$' then
    return null;
  end if;
  if v !~ E'[0-9A-Za-zÀ-ÖØ-öø-İĴ-ķĹ-ľŁ-ňŊ-ž]' then
    return null;
  end if;
  return v;
end
$$;

-- un jeton bien formé : 32 à 128 caractères parmi chiffres, lettres, - et _ (le jeu envoie 64 chiffres hexadécimaux)
create or replace function public.fournil_jeton_valable(p_jeton text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_jeton is not null and p_jeton ~ '^[0-9A-Za-z_-]{32,128}$'
$$;

-- l'empreinte gardée en base : sha256 du jeton, en hexadécimal
create or replace function public.fournil_empreinte(p_jeton text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_jeton, 'UTF8')), 'hex')
$$;


-- ─── 3. L'enveloppe : ce qu'un boulanger peut plausiblement gagner en un temps donné ─────────────
--
-- R(L) est le rythme de gain (€ par seconde) qu'on accepte d'un boulanger dont la fortune plausible vaut L. Il est donné par
-- des paliers {log10 L, log10 R} ; entre deux paliers, R varie comme une puissance de L (une droite en échelle log-log) ;
-- sous le premier palier, R est constant (le plancher : 500 000 €/s jusqu'à 10 000 €) ; au-delà du dernier, même pente.
-- La borne d'un envoi suit cette enveloppe pas à pas (dL/dt = R(L)) : les gains qui en rapportent d'autres sont comptés.
--
-- D'où viennent ces chiffres (simulations de test/longevite.js et src/game.js rejouées seconde par seconde) :
--   · vingt trajectoires de 60 à 120 jours, aux quatre dates de départ du test de longévité (5 oct., 1er nov., 1er mars,
--     7 juin : saisons, marché du samedi et du dimanche ×1,5 compris) : les trois profils du jeu (occasionnel 17 min,
--     régulier 36 min, assidu 80 min par jour), un « acharné » (16 h par jour, 120 jours) et un « marathon » (23 h 48 sur 24,
--     60 jours). Tout y est : gains d'absence (8 h et plus), coups de feu ×3, critiques ×2, anniversaires ×5, commandes payées
--     6 fois, pain du jour, spécialité, recette de saison, pourboires, défis du jour et de la semaine, habitués, boutiques ;
--   · pour chaque tranche de fortune, le plus fort gain en UNE HEURE observé chez n'importe lequel de ces joueurs (ce sont
--     l'acharné et le marathon qui fixent la limite), pris une demi-décade plus haut et arrondi vers le haut à chaque décade ;
--   · puis l'algorithme ci-dessous (avec sa réserve de 24 h) a été rejoué sur chaque trajectoire : envois toutes les 10 s,
--     toutes les 5 min, une fois par session ou une fois par jour, en arrivant au jour 0, 10 ou 40. En DIVISANT ces rythmes,
--     le premier envoi plafonné n'apparaît qu'à ÷3,9 pour le marathon 24 h/24, ÷4,8 pour l'acharné, ÷17 pour l'assidu, ÷19
--     pour le régulier et ÷20 pour l'occasionnel : la marge est d'au moins ×3,9 sur le joueur le plus acharné qu'on puisse
--     imaginer, et de ×17 sur les profils du jeu. Un joueur honnête n'est jamais plafonné.
--
--   fortune L        rythme accepté R(L)     repères (joueurs simulés)
--   ≤ 1e4 €          5e5 €/s (le plancher)   au premier jour, tout le monde passe 1e7 € en un quart d'heure
--   1e10 €           1,3e7 €/s               l'assidu au jour 2, le marathon après quelques heures
--   1e13 €           5e9 €/s                 l'assidu au jour 5
--   1e16 €           2,5e12 €/s              l'assidu au jour 10, le marathon au jour 9
--   1e19 €           1,3e14 €/s              l'assidu au jour 60, le marathon au jour 25
--   1e20 €           4e14 €/s                l'acharné au jour 50 ; au-delà, R grandit comme L (+1,4 % par heure)
--
-- La réserve : le temps d'enveloppe qu'un envoi n'a pas utilisé est gardé (24 h au plus) pour les envois suivants. Elle
-- absorbe les gros coups d'un instant (prime du défi de la semaine, trois défis du jour réclamés d'un coup, commande livrée)
-- sans élargir le rythme de fond : sur la durée, rien ne dépasse R. On arrive au classement avec une réserve pleine : sans
-- elle, un joueur honnête qui rejoint en pleine partie (au jour 40, juste avant une prime) n'aurait plus qu'une marge de ×1,5
-- (×3,1 avec une heure de réserve à l'arrivée, ×3,9 avec 24 h).
--
-- L'échelle de la borne est la fortune PLAUSIBLE (fortune d'arrivée + tout ce qui a été compté), pas la plus haute fortune
-- envoyée : un saut inventé, plafonné, ne fait pas grandir la borne des envois suivants.
--
-- La fortune d'arrivée, elle, n'est prouvée par rien (une sauvegarde se bricole) : comme échelle, elle est plafonnée à 1e20 €.
-- Sans ce plafond, un tricheur qui arrive avec 7e23 € compterait 2,9e23 € dix secondes plus tard (au-delà de 1e20, R grandit
-- comme L). 1e20 est le plus bas plafond qui garde la marge : rejoués en arrivant aux jours 0, 10, 40, 59 et 90 (l'acharné
-- dépasse 1e20 vers le jour 50, 9e20 au jour 120), les honnêtes gardent une marge d'au moins ×3,8 (×1,6 avec un plafond à 1e19).
--
-- Ce qu'il reste à un tricheur obstiné (il envoie sans arrêt, toujours à la limite) : au mieux ~4 fois le joueur parfait
-- 24 h/24. Réserve pleine de l'arrivée comprise, en arrivant avec une fausse fortune de 1e6 € : 1e18 € tout de suite (ce que
-- l'enveloppe ajoute en 24 h), 8e18 € au bout d'un jour, 2e20 € au bout d'une semaine ; en arrivant avec 1e20 € ou plus (le
-- pire cas) : 4e19 € tout de suite, 1e20 € au bout d'un jour, 1,5e21 € au bout d'une semaine (il faut deux mois à l'assidu
-- pour 1e19 €, 25 jours au marathon). C'est la limite de ce qu'un serveur peut savoir sans voir la partie ; un intrus se
-- retire à la main.

-- les paliers {log10 fortune, log10 rythme en €/s}
create or replace function public.fournil_paliers()
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select '{{4,5.7},{5,5.8},{6,5.9},{7,6.0},{8,6.1},{9,6.5},{10,7.1},{11,7.7},{12,8.7},{13,9.7},{14,10.4},{15,11.1},{16,12.4},{17,13.2},{18,13.7},{19,14.1},{20,14.6},{24,18.6}}'::double precision[]
$$;

-- le segment k de l'enveloppe (0 = sous le premier palier, n = au-delà du dernier) : de « de » à « a », R = c · L^b
create or replace function public.fournil_segment(p_k integer, out de double precision, out a double precision,
                                                  out b double precision, out c double precision)
language plpgsql
immutable
set search_path = ''
as $$
declare
  p double precision[] := public.fournil_paliers();
  n integer := array_length(p, 1);
  k integer := least(greatest(p_k, 0), n);
  j integer;
begin
  if k = 0 then
    de := 0; a := power(10::double precision, p[1][1]); b := 0; c := power(10::double precision, p[1][2]);
    return;
  end if;
  j := least(k, n - 1); -- au-delà du dernier palier : la pente du dernier segment
  b := (p[j + 1][2] - p[j][2]) / (p[j + 1][1] - p[j][1]);
  if abs(b - 1) < 1e-9 then b := 1; elsif abs(b) < 1e-9 then b := 0; end if; -- presque 1 (ou 0) : 1 (ou 0), sinon le calcul perd sa précision
  de := power(10::double precision, p[k][1]);
  a := case when k < n then power(10::double precision, p[k + 1][1]) else 'infinity'::double precision end;
  c := power(10::double precision, p[k][2] - b * p[k][1]);
end
$$;

-- le temps (en secondes) que met l'enveloppe pour aller de p_de à p_a
create or replace function public.fournil_duree(p_de double precision, p_a double precision)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := array_length(public.fournil_paliers(), 1);
  s record;
  x double precision;
  y double precision;
  t double precision := 0;
begin
  if p_de is null or p_a is null or not (p_a > p_de) then
    return 0;
  end if;
  for k in 0..n loop
    s := public.fournil_segment(k);
    continue when p_de >= s.a;
    exit when p_a <= s.de;
    x := greatest(p_de, s.de);
    y := least(p_a, s.a);
    if s.b = 1 then
      t := t + ln(y / x) / s.c;
    else
      t := t + (power(y, 1 - s.b) - power(x, 1 - s.b)) / ((1 - s.b) * s.c);
    end if;
  end loop;
  return t;
end
$$;

-- la plus haute fortune que l'enveloppe atteint en p_secondes depuis p_de (au plus 1e30 : jamais de débordement)
create or replace function public.fournil_borne(p_de double precision, p_secondes double precision)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := array_length(public.fournil_paliers(), 1);
  s record;
  x double precision := greatest(coalesce(p_de, 0), 0);
  u double precision := greatest(coalesce(p_secondes, 0), 0);
  t double precision;
  base double precision;
begin
  if x >= 1e30 then
    return x;
  end if;
  for k in 0..n loop
    s := public.fournil_segment(k);
    continue when x >= s.a;
    x := greatest(x, s.de);
    -- le temps pour aller au bout de ce segment
    if s.a = 'infinity'::double precision then
      t := 'infinity'::double precision;
    elsif s.b = 1 then
      t := ln(s.a / x) / s.c;
    else
      t := (power(s.a, 1 - s.b) - power(x, 1 - s.b)) / ((1 - s.b) * s.c);
    end if;
    if u < t then
      -- on s'arrête dans ce segment
      if s.b = 1 then
        if ln(x) + s.c * u > ln(1e30::double precision) then
          return 1e30;
        end if;
        return x * exp(s.c * u);
      end if;
      base := power(x, 1 - s.b) + (1 - s.b) * s.c * u;
      if base <= 0 then
        return case when s.b > 1 then 1e30 else x end; -- (pente > 1 : l'enveloppe s'emballe ; sinon x = 0 et u = 0)
      end if;
      if log(base) / (1 - s.b) > 30 then
        return 1e30;
      end if;
      return power(base, 1 / (1 - s.b));
    end if;
    u := u - t;
    x := s.a;
  end loop;
  return least(x, 1e30);
end
$$;


-- ─── 3 bis. L'événement « Le Quartier » : sa fenêtre, et l'enveloppe de ses billets ─────────────
-- Du mardi 13 octobre 2026 à midi au mardi 27 octobre 2026 à midi, heure de Paris (les mêmes bornes que src/quartier.js).
create or replace function public.fournil_quartier_fenetre(out debut timestamptz, out fin timestamptz)
language sql
immutable
set search_path = ''
as $$
  select '2026-10-13 12:00:00 Europe/Paris'::timestamptz, '2026-10-27 12:00:00 Europe/Paris'::timestamptz
$$;

-- l'enveloppe des billets : le log10 de ce qu'un joueur qui ne lâche jamais sa Planque (23 h 48 sur 24, tous les coups de pouce,
-- toutes les bonnes décisions) aurait gagné k jours après l'ouverture, k de 0 à 14, avec une marge d'au moins ×2 (simulation de
-- test/fournil-quartier.test.js, qui vérifie cette table). Entre deux jours, interpolation du log10 ; au-delà du 14e, constante.
create or replace function public.fournil_quartier_table()
returns double precision[]
language sql
immutable
set search_path = ''
as $$
  select '{12.5,14.5,16.55,17.15,17.45,17.65,17.8,17.9,18,18.1,18.2,18.25,18.3,18.4,18.45}'::double precision[] -- v6.4 : le sirop ×4, le cristal ×2 (v6.3 : {12.5,14.5,16.4,16.9,17.15,17.3,17.45,17.55,17.65,17.75,17.8,17.85,17.9,18,18.05} ; v6.2 : {12.5,14.5,16.35,16.7,16.9,17.05,17.15,17.25,17.35,17.4,17.45,17.5,17.55,17.6,17.65})
$$;

-- la plus haute valeur de billets acceptée à l'instant p_quand (0 avant l'ouverture)
create or replace function public.fournil_quartier_borne(p_quand timestamptz)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  f record := public.fournil_quartier_fenetre();
  t double precision[] := public.fournil_quartier_table();
  j double precision;
  k integer;
begin
  if p_quand is null or p_quand < f.debut then
    return 0;
  end if;
  j := least(extract(epoch from (p_quand - f.debut)) / 86400.0, 14.0);
  k := floor(j)::int;
  if k >= 14 then
    return power(10::double precision, t[15]);
  end if;
  return power(10::double precision, t[k + 1] + (t[k + 2] - t[k + 1]) * (j - k));
end
$$;

-- le podium final de l'événement : figé une fois, à la première requête qui suit la fin de l'heure de grâce (les trois premiers en
-- billets, ex æquo au même rang, billets > 0). Deux requêtes simultanées ne figent jamais deux fois : la ligne de fournil_evenements fait verrou.
create or replace function public.fournil_quartier_figer(p_maintenant timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  f record := public.fournil_quartier_fenetre();
  v_n integer;
begin
  if p_maintenant < f.fin + interval '1 hour' or exists (select 1 from public.fournil_evenements where nom = 'quartier') then
    return;
  end if;
  insert into public.fournil_evenements (nom, figee) values ('quartier', p_maintenant) on conflict (nom) do nothing;
  get diagnostics v_n = row_count;
  if v_n = 1 then
    insert into public.fournil_quartier_podium (id, rang, pseudo, valeur)
    select r.id, r.rang, r.pseudo, r.quartier
      from (select j.id, j.pseudo, j.quartier, rank() over (order by j.quartier desc)::int as rang
              from public.fournil_joueurs j where j.quartier > 0) r
     where r.rang <= 3
    on conflict (id) do nothing;
  end if;
end
$$;


-- ─── 3 ter. Les événements génériques (version 5) : la liste, l'enveloppe de leur score, le podium final ───
-- Un événement = une ligne : son identifiant (jamais 'quartier', ni 'semaine' ni 'total' : ce sont des périodes du classement),
-- sa fenêtre (les mêmes bornes que son fichier de règles), et l'enveloppe de son score : le log10 de ce qu'un joueur qui ne lâche
-- jamais l'événement (23 h 48 sur 24, tous les coups de pouce, toutes les bonnes décisions) aurait gagné k pas après l'ouverture
-- (pas : en heures), avec une marge d'au moins ×2, tirée de la simulation du fichier de règles (son test vérifie cette table).
-- Entre deux pas, interpolation du log10 ; au-delà du dernier, constante. Les fenêtres de deux événements génériques ne se
-- chevauchent jamais, et chacun garde son score à part.
--   · 'hantee' : « La Maison hantée » (src/hantee.js, test/fournil-hantee.test.js), du mardi 27 octobre 2026 à midi au lundi
--     2 novembre 2026 à 20 h, heure de Paris ; un pas de 6 heures (27 valeurs : 6 j 12 h).
create or replace function public.fournil_evts()
returns table (nom text, debut timestamptz, fin timestamptz, pas double precision, tableau double precision[])
language sql
immutable
set search_path = ''
as $$
  values ('hantee'::text, '2026-10-27 12:00:00 Europe/Paris'::timestamptz, '2026-11-02 20:00:00 Europe/Paris'::timestamptz, 6::double precision,
          '{11.65,14.05,16.05,16.2,16.55,16.8,17,17.15,17.25,17.35,17.45,17.55,17.6,17.65,17.7,17.75,17.8,17.85,17.9,17.95,18,18,18.05,18.1,18.1,18.15,18.15}'::double precision[]) -- v6.4 : les gâteaux ×4, les œufs ×1,5 (v6.3 : {11.65,14.05,16.05,16.1,16.35,16.6,16.75,16.9,17,17.1,17.2,17.25,17.35,17.4,17.45,17.5,17.55,17.55,17.6,17.65,17.65,17.7,17.75,17.75,17.8,17.8,17.8} ; v6.2 : {11.65,14.05,16.05,16.1,16.3,16.45,16.6,16.65,16.75,16.8,16.9,16.95,17,17,17.05,17.1,17.15,17.15,17.2,17.2,17.25,17.25,17.3,17.3,17.35,17.35,17.35})
$$;

-- la plus haute valeur de score acceptée pour l'événement p_evt à l'instant p_quand (0 avant l'ouverture, ou pour un événement inconnu)
create or replace function public.fournil_evt_borne(p_evt text, p_quand timestamptz)
returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  e record;
  n integer;
  j double precision;
  k integer;
begin
  select * into e from public.fournil_evts() x where x.nom = p_evt;
  if not found or p_quand is null or p_quand < e.debut then
    return 0;
  end if;
  n := array_length(e.tableau, 1);
  j := least(extract(epoch from (p_quand - e.debut)) / (e.pas * 3600.0), (n - 1)::double precision);
  k := floor(j)::int;
  if k >= n - 1 then
    return power(10::double precision, e.tableau[n]);
  end if;
  return power(10::double precision, e.tableau[k + 1] + (e.tableau[k + 2] - e.tableau[k + 1]) * (j - k));
end
$$;

-- les podiums finaux : chaque événement fini (après son heure de grâce) est figé une fois, à la première requête qui suit (les trois
-- premiers au score, ex æquo au même rang, score > 0). La ligne de fournil_evenements fait verrou, comme pour le Quartier.
create or replace function public.fournil_evt_figer(p_maintenant timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  e record;
  v_n integer;
begin
  for e in select x.nom from public.fournil_evts() x
            where p_maintenant >= x.fin + interval '1 hour'
              and not exists (select 1 from public.fournil_evenements f where f.nom = x.nom) loop
    insert into public.fournil_evenements (nom, figee) values (e.nom, p_maintenant) on conflict (nom) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      insert into public.fournil_evt_podium (evt, id, rang, pseudo, valeur)
      select e.nom, r.id, r.rang, r.pseudo, r.valeur
        from (select s.id, j.pseudo, s.valeur, rank() over (order by s.valeur desc)::int as rang
                from public.fournil_evt_scores s join public.fournil_joueurs j on j.id = s.id
               where s.evt = e.nom and s.valeur > 0) r
       where r.rang <= 3
      on conflict (evt, id) do nothing;
    end if;
  end loop;
end
$$;


-- ─── 3 quater. Les copains et les notifications (version 6) : les petites fonctions internes ───

-- une heure en texte ISO, temps universel (« 2026-10-15T08:00:00.000Z ») : ce que lit Date.parse sur le téléphone
create or replace function public.fournil_iso(p_quand timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_quand at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- le nom d'un événement dans une phrase (« la Maison hantée », « le Quartier ») ; un événement à venir sans nom : son identifiant
create or replace function public.fournil_evt_titre(p_evt text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_evt when 'hantee' then 'la Maison hantée' when 'quartier' then 'le Quartier' else coalesce(p_evt, 'l''événement') end
$$;

-- une adresse d'abonnement plausible : https, 1 000 caractères au plus, et seulement chez les services de notifications des
-- navigateurs (Google/Chrome, Mozilla/Firefox, Apple/Safari, Microsoft/Edge) : la fonction d'envoi ne poste jamais ailleurs
create or replace function public.fournil_endpoint_valable(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_endpoint is not null and char_length(p_endpoint) <= 1000
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)/[!-~]*$'
$$;

-- ce joueur veut-il ce type de notification ? (au moins un appareil abonné, et le cas coché ; l'essai : un appareil suffit).
-- Les deux types de fournil-retours.sql y sont aussi (recoller ce fichier après lui ne les perd pas) : 'vote' suit la case
-- « événements » ; 'retour' (réservé aux admins) : un appareil suffit. Version 6.5 : 'semaine' (sa place du lundi) suit la case
-- « objectif commun »
create or replace function public.fournil_notif_permise(p_joueur uuid, p_type text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.fournil_abonnements a where a.joueur = p_joueur)
     and (p_type in ('essai', 'retour') or coalesce((select case p_type when 'pleine' then p.pleine when 'pourboire' then p.pourboires
                                                           when 'evenement' then p.evenements when 'vote' then p.evenements
                                                           when 'objectif' then p.objectif when 'semaine' then p.objectif else false end
                                          from public.fournil_notif_prefs p where p.id = p_joueur), false))
$$;

-- mettre une notification dans la file (seulement si le joueur la veut) ; vrai si elle y est
create or replace function public.fournil_notif_mettre(p_joueur uuid, p_type text, p_texte text, p_due timestamptz)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if not public.fournil_notif_permise(p_joueur, p_type) then
    return false;
  end if;
  insert into public.fournil_notifs (joueur, type, titre, texte, url, due, cree)
  values (p_joueur, p_type, 'Le Fournil', p_texte, './', p_due, public.fournil_maintenant());
  return true;
end
$$;

-- le but de l'objectif commun d'une semaine : fixé une fois (la première fois qu'on le demande), 150 × les joueurs actifs (au moins
-- 1 point) de la semaine précédente, de 300 à 6 000. Sans semaine précédente figée (la première semaine de la version 6) : les
-- joueurs qui ont des points cette semaine-là ou la précédente.
create or replace function public.fournil_objectif_but(p_lundi date)
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_but    integer;
  v_actifs integer;
begin
  select o.but into v_but from public.fournil_objectif o where o.semaine = p_lundi;
  if found then
    return v_but;
  end if;
  select o.joueurs into v_actifs from public.fournil_objectif o where o.semaine = p_lundi - 7 and o.joueurs is not null;
  if not found then
    select count(*)::int into v_actifs from public.fournil_joueurs j where j.semaine between p_lundi - 7 and p_lundi and j.points > 0;
  end if;
  v_but := least(greatest(150 * coalesce(v_actifs, 0), 300), 6000);
  insert into public.fournil_objectif (semaine, but) values (p_lundi, v_but) on conflict (semaine) do nothing;
  select o.but into v_but from public.fournil_objectif o where o.semaine = p_lundi;
  return v_but;
end
$$;

-- figer l'objectif d'une semaine finie (appelée par fournil_figer, une fois, quand la semaine est figée : tous les joueurs y ont
-- encore leurs points). Réussie (et p_recompenser : la semaine qui vient de finir, pas une plus ancienne rattrapée au réveil du
-- projet) : ceux qui y ont mis 30 points ou plus sont inscrits pour la récompense, et prévenus s'ils l'ont demandé.
create or replace function public.fournil_objectif_figer(p_semaine date, p_maintenant timestamptz, p_recompenser boolean)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_but   integer := public.fournil_objectif_but(p_semaine);
  v_total integer;
  v_n     integer;
  v_ok    boolean;
  v_k     integer;
  g       record;
begin
  select coalesce(sum(j.points), 0)::int, (count(*) filter (where j.points > 0))::int into v_total, v_n
    from public.fournil_joueurs j where j.semaine = p_semaine;
  v_ok := v_total >= v_but;
  update public.fournil_objectif set total = v_total, joueurs = v_n, reussi = v_ok, fige = p_maintenant
   where semaine = p_semaine and fige is null;
  get diagnostics v_k = row_count;
  if v_k = 1 and v_ok and p_recompenser then
    for g in insert into public.fournil_objectif_gagnants (semaine, id)
             select p_semaine, j.id from public.fournil_joueurs j where j.semaine = p_semaine and j.points >= 30
             on conflict (semaine, id) do nothing
             returning id loop
      perform public.fournil_notif_mettre(g.id, 'objectif', 'Objectif commun réussi ! Une récompense t''attend.', p_maintenant);
    end loop;
  end if;
end
$$;

-- annoncer les ouvertures et les fins d'événements (le Quartier et ceux de fournil_evts) passées depuis moins d'une heure et pas
-- encore annoncées : une notification par joueur qui veut les événements. Appelée par fournil_notifs_dues (toutes les 5 min).
create or replace function public.fournil_annoncer(p_maintenant timestamptz)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  e   record;
  j   record;
  v_n integer;
  v_t text;
begin
  for e in
    select x.nom, x.genre from (
      select 'quartier'::text as nom, f.debut as quand, 'ouverture'::text as genre from public.fournil_quartier_fenetre() f
      union all select 'quartier', f.fin, 'fin' from public.fournil_quartier_fenetre() f
      union all select v.nom, v.debut, 'ouverture' from public.fournil_evts() v
      union all select v.nom, v.fin, 'fin' from public.fournil_evts() v) x
     where p_maintenant >= x.quand and p_maintenant < x.quand + interval '1 hour'
     order by x.quand
  loop
    insert into public.fournil_annonces (cle, quand) values (e.nom || ':' || e.genre, p_maintenant) on conflict (cle) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_t := public.fournil_evt_titre(e.nom);
      v_t := case when e.genre = 'ouverture' then upper(left(v_t, 1)) || substr(v_t, 2) || ' ouvre ses portes ! Viens jouer.'
                  else 'C''est fini pour ' || v_t || ' : viens voir le podium !' end;
      for j in select distinct a.joueur from public.fournil_abonnements a loop
        perform public.fournil_notif_mettre(j.joueur, 'evenement', v_t, p_maintenant);
      end loop;
    end if;
  end loop;
end
$$;


-- ─── 4. Le palmarès : chaque semaine finie est figée une fois, à la première requête qui suit ───
-- Appelée au début de chaque fonction du jeu. Les semaines à figer : celle qui vient de finir (même vide), et toute semaine
-- plus ancienne dont des joueurs gardent encore le gain (personne n'est venu depuis). Deux requêtes simultanées ne figent
-- jamais deux fois : la ligne de fournil_semaines fait office de verrou (la seconde attend la première, puis ne fait rien).
-- Version 6.5 : les quinze premiers, le nombre de joueurs classés, et pour la semaine qui vient de finir, la notification du lundi.
create or replace function public.fournil_figer(p_lundi date)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_s date;
  v_n integer;
  v_pts boolean;
  v_j integer;
  v_due timestamptz;
  g record;
begin
  perform public.fournil_quartier_figer(public.fournil_maintenant()); -- l'événement « Le Quartier », une fois fini
  perform public.fournil_evt_figer(public.fournil_maintenant());      -- les événements génériques (version 5), une fois finis
  if exists (select 1 from public.fournil_semaines where semaine = p_lundi - 7) then
    return; -- le chemin de tous les jours : la semaine passée est déjà figée, donc toutes les précédentes aussi
  end if;
  for v_s in
    select distinct j.semaine from public.fournil_joueurs j
     where j.semaine < p_lundi
       and not exists (select 1 from public.fournil_semaines f where f.semaine = j.semaine)
    union
    select p_lundi - 7
    order by 1
  loop
    insert into public.fournil_semaines (semaine, figee) values (v_s, public.fournil_maintenant())
      on conflict (semaine) do nothing;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      -- les quinze premiers EN POINTS (ex æquo au même rang ; les trois premiers avant la version 6.5) ; leur gain en euros est
      -- gardé pour information. Une semaine où personne n'a de points (la dernière semaine de la v2, pas encore figée quand on
      -- recolle la v3 ; ou une semaine où seuls des téléphones de la v2 ont joué) est classée à l'argent, comme en v2 : son
      -- podium n'est pas perdu.
      v_pts := exists (select 1 from public.fournil_joueurs where semaine = v_s and points > 0);
      insert into public.fournil_palmares (semaine, rang, id, pseudo, valeur, points)
      select v_s, r.rang, r.id, r.pseudo, r.gain, case when v_pts then r.points end
        from (select j.id, j.pseudo, j.gain, j.points,
                     rank() over (order by case when v_pts then j.points::double precision else j.gain end desc)::int as rang
                from public.fournil_joueurs j
               where j.semaine = v_s and (case when v_pts then j.points > 0 else j.gain > 0 end)) r
       where r.rang <= 15
      on conflict (semaine, id) do nothing;
      -- version 6.5 : combien de joueurs étaient classés cette semaine-là (« 7e sur 12 »)
      select count(*)::int into v_j from public.fournil_joueurs j
       where j.semaine = v_s and (case when v_pts then j.points > 0 else j.gain > 0 end);
      update public.fournil_semaines set joueurs = v_j where semaine = v_s;
      -- l'objectif commun de cette semaine-là (version 6), figé en même temps : récompensé seulement pour la semaine qui vient de finir
      perform public.fournil_objectif_figer(v_s, public.fournil_maintenant(), v_s = p_lundi - 7);
      -- version 6.5 : la semaine qui vient de finir (pas une plus ancienne rattrapée au réveil du projet) : à chaque joueur classé
      -- qui l'a demandé, sa place, le lundi à 9 h (heure de Paris), ou tout de suite s'il est plus tard
      if v_s = p_lundi - 7 then
        v_due := greatest(public.fournil_maintenant(), (p_lundi::timestamp + interval '9 hours') at time zone 'Europe/Paris');
        for g in select p.id, p.rang from public.fournil_palmares p where p.semaine = v_s order by p.rang loop
          begin
            perform public.fournil_notif_mettre(g.id, 'semaine',
              'Semaine finie : tu es ' || case when g.rang = 1 then '1er' else g.rang || 'e' end || ' sur ' || v_j
              || case when g.rang <= 3 then ' ! Ta tenue, ta coupe et ta récompense t''attendent.' else ' ! Ta récompense t''attend.' end,
              v_due);
          exception when check_violation then
            null; -- une file qui ne connaît pas encore 'semaine' (un vieux fournil-retours.sql recollé après) : pas de notification, rien ne casse
          end;
        end loop;
      end if;
    end if;
  end loop;
  perform public.fournil_objectif_but(p_lundi); -- le but de la semaine qui commence, fixé une fois
end
$$;

-- la réponse de fournil_publier : ok/erreur, et, si p_id est donné, les rangs de ce joueur (en points), ses points, ce qui a été
-- compté (argent et points), ses billets de l'événement « Le Quartier » (quartier, rang_quartier, quartier_plafonne), et son score à
-- l'événement générique envoyé (evt, evt_score, rang_evt, evt_plafonne ; null sans p_evt) ; version 6 : photo_maj, l'heure de la
-- photo de sa boutique gardée sur le serveur (null : aucune)
create or replace function public.fournil_reponse(p_erreur text, p_id uuid, p_lundi date,
                                                  p_compte double precision, p_plafonne boolean,
                                                  p_points_comptes integer, p_points_plafonnes boolean,
                                                  p_quartier_plafonne boolean default null,
                                                  p_evt text default null, p_evt_plafonne boolean default null)
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'ok', p_erreur is null,
    'erreur', p_erreur,
    'version', 6,
    'photo_maj', (select public.fournil_iso(f.maj) from public.fournil_photos f where f.id = p_id),
    'evt', case when p_evt is not null and exists (select 1 from public.fournil_evts() x where x.nom = p_evt) then p_evt end,
    'evt_score', (select s.valeur from public.fournil_evt_scores s where p_evt is not null and s.evt = p_evt and s.id = p_id),
    'rang_evt', (
      select (select count(*) from public.fournil_evt_scores a where a.evt = p_evt and a.valeur > m.valeur)::int + 1
      from public.fournil_evt_scores m
      where p_evt is not null and m.evt = p_evt and m.id = p_id and m.valeur > 0),
    'evt_plafonne', p_evt_plafonne,
    'quartier', (select m.quartier from public.fournil_joueurs m where m.id = p_id),
    'rang_quartier', (
      select (select count(*) from public.fournil_joueurs a where a.quartier > m.quartier)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id and m.quartier > 0),
    'quartier_plafonne', p_quartier_plafonne,
    'rang_semaine', (
      select (select count(*) from public.fournil_joueurs a where a.semaine = p_lundi and a.points > m.points)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id and m.semaine = p_lundi),
    'rang_total', (
      select (select count(*) from public.fournil_joueurs a where a.points_total > m.points_total)::int + 1
      from public.fournil_joueurs m
      where m.id = p_id),
    'joueurs', (select count(*)::int from public.fournil_joueurs),
    'joueurs_total', (select count(*)::int from public.fournil_joueurs),
    'joueurs_semaine', (select count(*)::int from public.fournil_joueurs where semaine = p_lundi),
    'semaine', to_char(p_lundi, 'YYYY-MM-DD'),
    'points_semaine', (select m.points from public.fournil_joueurs m where m.id = p_id and m.semaine = p_lundi),
    'points_total', (select m.points_total from public.fournil_joueurs m where m.id = p_id),
    'points_comptes', p_points_comptes,
    'points_plafonnes', p_points_plafonnes,
    'compte', p_compte,
    'plafonne', p_plafonne
  )
$$;


-- ─── 5. fournil_publier : rejoindre le classement, puis envoyer ses points, sa fortune et ses billets ───────
-- p_points : ses points de boulanger de la semaine ; p_lundi : le lundi (heure de Paris, sur l'horloge du jeu) de ces points.
-- Les deux sont facultatifs : un téléphone de la version 2 les omet (sa fortune compte, ses points ne bougent pas).
-- p_quartier (facultatif, version 4) : les billets gagnés dans la Planque de l'événement « Le Quartier » ; comptés seulement pendant
-- la fenêtre de l'événement (une heure de grâce après la fin), jamais en baisse, jamais au-delà de l'enveloppe (partie 3 bis).
-- p_evt, p_score (facultatifs, version 5) : l'identifiant d'un événement générique ('hantee') et son score (les bonbons) ; comptés
-- seulement pendant sa fenêtre (une heure de grâce après la fin), jamais en baisse, jamais au-delà de son enveloppe (partie 3 ter) ;
-- un événement inconnu est ignoré. Un envoi accepté pose aussi le signe de vie (vu : « en ligne »).
-- p_photo (facultatif, version 6) : la photo de sa boutique, un objet JSON ; gardée si l'envoi est accepté, si c'est un objet de
-- 3 Ko au plus (texte jsonb ; le téléphone l'envoie sous 2 Ko compacts) et si la précédente a 10 min ou plus ; sinon ignorée, sans
-- refuser l'envoi.
-- Réponse : { ok, erreur: null | 'pseudo_pris' | 'pseudo_invalide' | 'jeton' | 'valeur' | 'trop_vite' | 'complet', version: 6,
--             photo_maj : l'heure (ISO, temps universel) de la photo gardée sur le serveur, null s'il n'y en a pas ;
--             evt : l'événement envoyé (null s'il est inconnu ou absent), evt_score : son score compté, rang_evt : son rang à cet
--             événement (null sans score), evt_plafonne : vrai si une partie du score n'a pas été comptée (null hors fenêtre) ;
--             quartier : ses billets comptés, rang_quartier : son rang à l'événement (null sans billets), quartier_plafonne : vrai si
--             une partie des billets n'a pas été comptée (null si rien n'était envoyé) ;
--             rang_semaine, rang_total (en points), joueurs et joueurs_total (tous les temps), joueurs_semaine, semaine: 'AAAA-MM-JJ',
--             points_semaine, points_total : ses points comptés ; points_comptes : les points comptés par cet envoi,
--             points_plafonnes : vrai si une partie n'a pas été comptée ;
--             compte : l'argent compté par cet envoi (null si refusé), plafonne : vrai si une partie n'a pas été comptée }
-- Premier envoi d'un identifiant : le joueur est inscrit ; aucun argent n'est compté (on part de zéro, sa fortune sert
-- d'échelle) ; ses points de la semaine, eux, comptent (dans les plafonds) : la semaine d'arrivée fait partie de « Tous les temps ».
-- Envois suivants : le jeton doit correspondre ; le pseudo peut changer (s'il est libre) ;
--   · les points comptés : min( p_points, plafond depuis lundi ) − points déjà comptés (jamais négatif), seulement si p_lundi
--     est la semaine du serveur ;
--   · le gain compté vaut min( fortune − sommet (jamais négatif) , ce que l'enveloppe ajoute en (réserve + temps réel écoulé
--     depuis l'envoi précédent) ).
-- Un identifiant effacé par le ménage (90 jours sans nouvelles) repasse simplement par l'inscription.
create or replace function public.fournil_publier(p_id uuid, p_jeton text, p_pseudo text, p_fortune double precision,
                                                  p_points integer default null, p_lundi date default null,
                                                  p_quartier double precision default null,
                                                  p_evt text default null, p_score double precision default null,
                                                  p_photo jsonb default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi      date := public.fournil_lundi(v_maintenant);
  v_jour       date := public.fournil_jour(v_maintenant);
  v_pseudo     text := public.fournil_pseudo_propre(p_pseudo);
  v_fortune    double precision;
  v_empreinte  text;
  v_contrainte text;
  v_ip         text;
  v_porte      text;
  v_inscrit    boolean;
  v_credit     double precision;
  v_voulu      double precision;
  v_permis     double precision;
  v_compte     double precision;
  v_plafonne   boolean;
  v_pts        boolean;                              -- ses points comptent-ils à cet envoi ? (la semaine du serveur, un nombre donné)
  v_pts_cible  integer;
  v_pts_compte integer;
  v_pts_plaf   boolean;
  v_q          boolean;                              -- ses billets du quartier comptent-ils à cet envoi ? (un nombre donné, dans la fenêtre)
  v_q_borne    double precision;
  v_q_plaf     boolean;
  v_fenetre    record := public.fournil_quartier_fenetre();
  v_e          boolean;                              -- le score de l'événement générique compte-t-il à cet envoi ? (connu, dans sa fenêtre)
  v_e_borne    double precision;
  v_e_plaf     boolean;
  v_evt        record;
  j            public.fournil_joueurs%rowtype;
begin
  perform public.fournil_figer(v_lundi);
  -- 1. l'identité : un identifiant et un jeton bien formés
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return public.fournil_reponse('jeton', null, v_lundi, null, null, null, null);
  end if;
  -- 2. le pseudo
  if v_pseudo is null then
    return public.fournil_reponse('pseudo_invalide', null, v_lundi, null, null, null, null);
  end if;
  -- 3. la fortune : un vrai nombre (ni NaN ni infini), positif, sous la borne (NaN échoue aussi à la comparaison)
  if p_fortune is null or not (p_fortune >= 0 and p_fortune <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  -- les points : un nombre entier positif, sous 100 000 (le barème en permet 510 par semaine)
  if p_points is not null and not (p_points >= 0 and p_points <= 100000) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  -- les billets du quartier : un vrai nombre positif sous 1e24 (sinon : refusé comme une fortune absurde)
  if p_quartier is not null and not (p_quartier >= 0 and p_quartier <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  -- le score d'un événement : de même
  if p_score is not null and not (p_score >= 0 and p_score <= 1e24) then
    return public.fournil_reponse('valeur', null, v_lundi, null, null, null, null);
  end if;
  v_fortune := p_fortune + 0; -- un éventuel « −0 » devient 0
  -- les billets ne comptent que pendant l'événement (et une heure de grâce après sa fin, le temps du dernier envoi)
  v_q := p_quartier is not null and v_maintenant >= v_fenetre.debut and v_maintenant < v_fenetre.fin + interval '1 hour';
  v_q_borne := public.fournil_quartier_borne(least(v_maintenant, v_fenetre.fin));
  v_q_plaf := null;
  -- le score d'un événement générique : seulement un événement connu, pendant sa fenêtre (et une heure de grâce), sous son enveloppe
  select x.debut, x.fin into v_evt from public.fournil_evts() x where p_evt is not null and x.nom = p_evt;
  v_e := found and p_score is not null and v_maintenant >= v_evt.debut and v_maintenant < v_evt.fin + interval '1 hour';
  v_e_borne := case when v_e then public.fournil_evt_borne(p_evt, least(v_maintenant, v_evt.fin)) else 0 end;
  v_e_plaf := null;
  -- seuls comptent les points de la semaine du serveur : à minuit le lundi, un téléphone en retard (ou en avance) de quelques
  -- minutes ne mélange pas deux semaines ; un ancien téléphone (sans points) ne change pas les siens
  v_pts := p_points is not null and p_lundi is not null and p_lundi = v_lundi;
  v_empreinte := public.fournil_empreinte(p_jeton);

  select * into j from public.fournil_joueurs where id = p_id for update;
  v_inscrit := found;

  -- le ménage, à chaque envoi :
  --   · les boulangers sans nouvelles depuis 90 jours sortent du classement : leur pseudo et leur place se libèrent, leur
  --     palmarès part avec eux (un téléphone ouvert envoie toutes les 5 minutes) ;
  --   · une inscription jamais suivie d'un autre envoi sort au bout de 7 jours (les robots qui s'inscrivent et s'en vont).
  -- Le joueur qui appelle n'est jamais effacé ici : il garde sa ligne, sous le contrôle de son jeton. Une ligne qu'un autre
  -- envoi tient en ce moment est laissée de côté (skip locked) : le ménage n'attend jamais personne, donc aucun interblocage.
  with partis as (
    delete from public.fournil_joueurs
     where id in (select o.id from public.fournil_joueurs o
                   where o.id <> p_id
                     and (o.maj < v_maintenant - interval '90 days' or (o.maj = o.cree and o.cree < v_maintenant - interval '7 days'))
                     for update skip locked)
    returning id
  )
  delete from public.fournil_palmares where id in (select id from partis);
  delete from public.fournil_quartier_podium where id in (select id from public.fournil_quartier_podium q where not exists (select 1 from public.fournil_joueurs x where x.id = q.id));
  delete from public.fournil_evt_scores s where not exists (select 1 from public.fournil_joueurs x where x.id = s.id);
  delete from public.fournil_evt_podium q where not exists (select 1 from public.fournil_joueurs x where x.id = q.id);

  if v_inscrit then
    -- ── un joueur déjà inscrit ──
    if j.jeton <> v_empreinte then
      return public.fournil_reponse('jeton', null, v_lundi, null, null, null, null);
    end if;
    if v_maintenant < j.maj + interval '10 seconds' then
      return public.fournil_reponse('trop_vite', p_id, v_lundi, null, null, null, null); -- rien ne change, mais on redonne ses rangs
    end if;
    if lower(v_pseudo) <> lower(j.pseudo)
       and exists (select 1 from public.fournil_joueurs where lower(pseudo) = lower(v_pseudo) and id <> p_id) then
      return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null);
    end if;
    -- une nouvelle semaine : le gain et les points repartent de zéro (ceux de la semaine finie sont déjà figés dans le palmarès)
    if j.semaine <> v_lundi then
      j.gain := 0;
      j.points := 0;
      j.points_bonus := 0;
      j.semaine := v_lundi;
    end if;
    -- les points : seulement ce qui dépasse ceux déjà comptés cette semaine, dans les plafonds du barème (les points des pourboires
    -- donnés, version 6, sont à part : le téléphone ne les connaît pas, ils ne se mélangent pas aux siens)
    v_pts_compte := 0;
    v_pts_plaf := false;
    if v_pts then
      -- (pas de second plafond « depuis l'envoi précédent » : chaque envoi le remettrait à zéro, toutes les 10 s, sans rien
      -- borner ; et un joueur honnête peut prendre 150 points en quelques minutes : Atelier, défi, journée, améliorations)
      v_pts_cible := least(p_points, public.fournil_points_plafond(v_jour - v_lundi + 1));
      v_pts_compte := greatest(v_pts_cible - (j.points - j.points_bonus), 0);
      v_pts_plaf := p_points > (j.points - j.points_bonus) + v_pts_compte;
      j.points := j.points + v_pts_compte;
      j.points_total := j.points_total + v_pts_compte;
      j.points_jour := v_jour;
    end if;
    -- ce qui peut compter : seulement ce qui dépasse la plus haute fortune déjà envoyée…
    v_voulu := greatest(v_fortune - j.sommet, 0);
    -- … et pas plus que ce que l'enveloppe ajoute en (réserve + temps réel écoulé, à l'horloge du serveur)
    v_credit := greatest(j.reserve, 0) + greatest(extract(epoch from (v_maintenant - j.maj))::double precision, 0);
    v_permis := greatest(public.fournil_borne(j.plausible, v_credit) - j.plausible, 0);
    v_compte := least(v_voulu, v_permis);
    v_plafonne := v_compte < v_voulu;
    -- le temps d'enveloppe utilisé sort de la réserve ; le reste est gardé, 24 h au plus
    if v_compte > 0 then
      v_credit := v_credit - public.fournil_duree(j.plausible, j.plausible + v_compte);
    end if;
    j.reserve := least(greatest(v_credit, 0), 86400);
    j.plausible := j.plausible + v_compte;
    j.total := j.total + v_compte;
    j.gain := j.gain + v_compte;
    -- l'excès plafonné est perdu pour toujours : le sommet monte quand même
    j.sommet := greatest(j.sommet, v_fortune);
    -- les billets du quartier : la plus haute valeur envoyée, sous l'enveloppe du moment
    if v_q then
      v_q_plaf := p_quartier > v_q_borne;
      if least(p_quartier, v_q_borne) > j.quartier then
        j.quartier := least(p_quartier, v_q_borne);
        j.quartier_maj := v_maintenant;
      end if;
    end if;
    begin
      update public.fournil_joueurs
         set pseudo = v_pseudo, fortune = v_fortune, sommet = j.sommet, plausible = j.plausible, reserve = j.reserve,
             total = j.total, gain = j.gain, semaine = j.semaine, maj = v_maintenant,
             points = j.points, points_total = j.points_total, points_jour = j.points_jour, points_bonus = j.points_bonus,
             quartier = j.quartier, quartier_maj = j.quartier_maj, vu = v_maintenant
       where id = p_id;
    exception when unique_violation then
      return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null); -- un autre a pris ce pseudo au même instant
    end;
  else
    -- ── une inscription ──
    -- une inscription à la fois : chaque appel est une transaction, le verrou tient jusqu'à sa fin, donc l'inscription
    -- suivante compte la ligne déjà validée (sinon des envois simultanés passent tous sous les plafonds)
    perform pg_catalog.pg_advisory_xact_lock(7231001);
    -- par source d'abord : l'adresse que Cloudflare réécrit à chaque requête (cf-connecting-ip ; jamais x-forwarded-for,
    -- que le téléphone peut remplir lui-même). Sans cet en-tête, seuls les plafonds communs jouent.
    v_ip := nullif(btrim(coalesce(
              (nullif(pg_catalog.current_setting('request.headers', true), '')::json) ->> 'cf-connecting-ip', '')), '');
    delete from public.fournil_portes where quand < v_maintenant - interval '1 day';
    if v_ip is not null then
      -- en IPv6, une même box ou un même téléphone dispose de tout un bloc /64 : on compte le bloc, pas l'adresse
      begin
        v_ip := case when pg_catalog.family(v_ip::inet) = 6 then pg_catalog.network(pg_catalog.set_masklen(v_ip::inet, 64))::text
                     else pg_catalog.host(v_ip::inet) end;
      exception when others then
        null; -- une adresse illisible : on la compte telle quelle
      end;
      v_porte := public.fournil_empreinte('ip:' || v_ip);
      if (select count(*) from public.fournil_portes where empreinte = v_porte and quand > v_maintenant - interval '1 hour') >= 10
         or (select count(*) from public.fournil_portes where empreinte = v_porte) >= 20 then
        return public.fournil_reponse('trop_vite', null, v_lundi, null, null, null, null);
      end if;
    end if;
    -- puis pour tout le monde ensemble
    if (select count(*) from public.fournil_joueurs) >= 2000 then
      return public.fournil_reponse('complet', null, v_lundi, null, null, null, null);
    end if;
    if (select count(*) from public.fournil_joueurs where cree > v_maintenant - interval '1 hour') >= 60 then
      return public.fournil_reponse('trop_vite', null, v_lundi, null, null, null, null);
    end if;
    if exists (select 1 from public.fournil_joueurs where lower(pseudo) = lower(v_pseudo)) then
      return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null);
    end if;
    begin
      -- l'argent part de zéro : rien n'est compté ; la fortune envoyée sert de sommet et d'échelle (plafonnée à 1e20 €, voir
      -- la partie 3 : rien ne prouve la fortune d'arrivée), la réserve est pleine. Les points de la semaine comptent, dans le
      -- plafond depuis lundi.
      v_pts_compte := case when v_pts then least(p_points, public.fournil_points_plafond(v_jour - v_lundi + 1)) else 0 end;
      v_pts_plaf := v_pts and p_points > v_pts_compte;
      if v_q then
        v_q_plaf := p_quartier > v_q_borne;
      end if;
      insert into public.fournil_joueurs (id, jeton, pseudo, fortune, sommet, plausible, reserve, total, gain, semaine, cree, maj,
                                          points, points_total, points_jour, quartier, quartier_maj, vu)
      values (p_id, v_empreinte, v_pseudo, v_fortune, v_fortune, least(v_fortune, 1e20), 86400, 0, 0,
              v_lundi, v_maintenant, v_maintenant,
              v_pts_compte, v_pts_compte, case when v_pts then v_jour end,
              case when v_q then least(p_quartier, v_q_borne) else 0 end, case when v_q then v_maintenant end, v_maintenant);
      if v_porte is not null then
        insert into public.fournil_portes (empreinte, quand) values (v_porte, v_maintenant);
      end if;
    exception when unique_violation then
      -- deux envois au même instant : même pseudo pris par un autre, ou le même joueur envoyé deux fois
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'fournil_joueurs_pseudo' then
        return public.fournil_reponse('pseudo_pris', null, v_lundi, null, null, null, null);
      end if;
      return public.fournil_reponse('trop_vite', null, v_lundi, null, null, null, null);
    end;
    v_compte := 0;
    v_plafonne := false;
  end if;

  -- le score de l'événement générique (inscription comme envoi suivant) : la plus haute valeur envoyée, sous l'enveloppe du moment
  if v_e then
    v_e_plaf := p_score > v_e_borne;
    insert into public.fournil_evt_scores (evt, id, valeur, maj) values (p_evt, p_id, least(p_score, v_e_borne), v_maintenant)
    on conflict (evt, id) do update set valeur = excluded.valeur, maj = excluded.maj
      where excluded.valeur > public.fournil_evt_scores.valeur;
  end if;

  -- la photo de sa boutique (version 6) : un objet, 3 Ko de texte jsonb au plus, au plus une toutes les 10 min ; sinon ignorée
  if p_photo is not null and jsonb_typeof(p_photo) = 'object' and octet_length(p_photo::text) <= 3072 then
    insert into public.fournil_photos (id, photo, maj) values (p_id, p_photo, v_maintenant)
    on conflict (id) do update set photo = excluded.photo, maj = excluded.maj
      where public.fournil_photos.maj <= excluded.maj - interval '10 minutes';
  end if;

  return public.fournil_reponse(null, p_id, v_lundi, v_compte, v_plafonne, v_pts_compte, v_pts_plaf, v_q_plaf, p_evt, v_e_plaf);
end
$$;


-- ─── 6. fournil_classement : lire le classement ─────────────────────────────────────────────────
-- p_periode : 'semaine' (les points depuis lundi, seulement ceux qui ont envoyé cette semaine), 'total' (depuis l'arrivée),
-- 'quartier' (l'événement « Le Quartier » : les billets de la Planque, ceux qui en ont ; points : null ; podium : le rang au podium
-- FINAL, une fois l'événement fini et figé, sinon null), ou l'identifiant d'un événement générique de fournil_evts() ('hantee' : les
-- bonbons de la Maison hantée, ceux qui en ont ; points : null ; podium : le rang à son podium final, une fois figé).
-- p_id : son propre identifiant (facultatif), pour se retrouver même hors des premiers.
-- p_limite : le nombre de lignes (50 par défaut, 100 au plus).
-- Réponse : { version: 6, semaine: 'AAAA-MM-JJ', periode, joueurs, en_ligne_n,
--             lignes: [{ rang, pseudo, points, valeur, moi, podium, en_ligne }], moi: { rang, points, valeur, podium, en_ligne } | null }
-- Le rang se fait sur les POINTS (de la semaine, ou depuis l'arrivée) ; valeur : l'argent gagné sur la même période, pour
-- information (un téléphone de la version 2 l'affiche encore comme avant, dans l'ordre des points).
-- podium : 1, 2 ou 3 si ce joueur était sur le podium de la semaine PASSÉE (sa toque à côté du pseudo), sinon null (version 6.5 : le
-- palmarès garde les quinze premiers, mais seuls les trois premiers ont une toque).
-- en_ligne : vrai si ce joueur a donné signe de vie il y a moins de 4 minutes (un envoi accepté, ou fournil_vu) ; en_ligne_n :
-- combien de joueurs de toute cette liste (pas seulement des lignes rendues) sont en ligne. Jamais l'heure elle-même.
-- Les ex æquo ont le même rang (puis l'ordre des pseudos) ; jamais d'identifiant ni de jeton dans la réponse.
create or replace function public.fournil_classement(p_periode text, p_id uuid default null, p_limite integer default 50)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi  date := public.fournil_lundi(v_maintenant);
  v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_evt    boolean := p_periode is not null and p_periode not in ('semaine', 'total', 'quartier')
                      and exists (select 1 from public.fournil_evts() x where x.nom = p_periode);
  v_res    json;
begin
  if p_periode is null or (p_periode not in ('semaine', 'total', 'quartier') and not v_evt) then
    raise exception using errcode = '22023', message = 'fournil_classement : période inconnue (« semaine », « total », « quartier » ou un événement)';
  end if;
  perform public.fournil_figer(v_lundi);

  with valeurs as (
    select j.id, j.pseudo,
           case when p_periode = 'semaine' then j.points when p_periode = 'total' then j.points_total else null end as points,
           case when p_periode = 'semaine' then j.gain when p_periode = 'total' then j.total when p_periode = 'quartier' then j.quartier else s.valeur end as valeur,
           case when p_periode = 'quartier' then q.rang when v_evt then e.rang else p.rang end as podium,
           coalesce(j.vu > v_maintenant - interval '4 minutes' and j.vu <= v_maintenant + interval '1 minute', false) as en_ligne
      from public.fournil_joueurs j
      left join public.fournil_palmares p on p.id = j.id and p.semaine = v_lundi - 7 and p.rang <= 3
      left join public.fournil_quartier_podium q on q.id = j.id
      left join public.fournil_evt_scores s on v_evt and s.evt = p_periode and s.id = j.id
      left join public.fournil_evt_podium e on v_evt and e.evt = p_periode and e.id = j.id
     where (p_periode = 'total') or (p_periode = 'semaine' and j.semaine = v_lundi) or (p_periode = 'quartier' and j.quartier > 0)
        or (v_evt and s.valeur > 0)
  ), rangs as (
    select id, pseudo, points, valeur, podium, en_ligne,
           rank() over (order by case when p_periode = 'quartier' or v_evt then valeur else points::double precision end desc)::int as rang,
           row_number() over (order by case when p_periode = 'quartier' or v_evt then valeur else points::double precision end desc, lower(pseudo), id) as ordre
      from valeurs
  )
  select json_build_object(
           'version', 6,
           'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
           'periode', p_periode,
           'joueurs', (select count(*)::int from rangs),
           'en_ligne_n', (select count(*)::int from rangs where en_ligne),
           'lignes', coalesce((select json_agg(json_build_object('rang', r.rang, 'pseudo', r.pseudo, 'points', r.points, 'valeur', r.valeur,
                                                                 'moi', coalesce(r.id = p_id, false), 'podium', r.podium, 'en_ligne', r.en_ligne)
                                               order by r.ordre)
                                 from rangs r where r.ordre <= v_limite), '[]'::json),
           'moi', (select json_build_object('rang', r.rang, 'points', r.points, 'valeur', r.valeur, 'podium', r.podium, 'en_ligne', r.en_ligne) from rangs r where r.id = p_id)
         )
    into v_res;
  return v_res;
end
$$;


-- ─── 7. fournil_retirer : quitter le classement ─────────────────────────────────────────────────
-- Réponse : { ok: true } (retiré, ou déjà absent) ou { ok: false, erreur: 'jeton' } (ce n'est pas son jeton).
-- Son palmarès part avec lui, ses scores et ses places aux podiums des événements aussi (ses coupes et ses tenues restent sur son téléphone).
-- Version 6 : sa photo, ses pourboires (donnés et reçus), ses appareils abonnés, ses préférences et ses notifications partent aussi
-- (clés étrangères « on delete cascade »).
create or replace function public.fournil_retirer(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  perform public.fournil_figer(public.fournil_lundi(public.fournil_maintenant()));
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id for update;
  if not found then
    return json_build_object('ok', true, 'erreur', null);
  end if;
  if v_jeton <> public.fournil_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  delete from public.fournil_palmares where id = p_id;
  delete from public.fournil_quartier_podium where id = p_id;
  delete from public.fournil_evt_scores where id = p_id;
  delete from public.fournil_evt_podium where id = p_id;
  delete from public.fournil_joueurs where id = p_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 8. fournil_recompenses : ses podiums, ses places, le podium de la semaine passée, le podium final de l'événement ───
-- Réponse : { ok, erreur: null | 'jeton',
--             podiums: [{ semaine: 'AAAA-MM-JJ' (le lundi de la semaine du podium), rang: 1 | 2 | 3 }], du plus ancien au plus récent,
--             places: [{ semaine, rang: 1 à 15, joueurs: les joueurs classés cette semaine-là | null (semaine figée avant la 6.5) }]
--             (version 6.5 : toutes ses places au palmarès, podiums compris, du plus ancien au plus récent),
--             derniere: { semaine, podium: [{ rang, pseudo, points, valeur }] } | null (null : personne n'a marqué la semaine passée ;
--             les trois premiers seulement),
--             quartier: 1 | 2 | 3 | null (son rang au podium FINAL de l'événement « Le Quartier », une fois figé),
--             quartier_podium: [{ rang, pseudo, valeur }] | null (le podium final, figé ; null tant que l'événement n'est pas fini),
--             evenements: { <evt>: { rang: 1 | 2 | 3 | null, podium: [{ rang, pseudo, valeur }] } } (version 5 : un champ par événement
--             générique dont le podium final est figé, 'hantee' compris ; {} tant qu'aucun n'est fini),
--             pourboires: [{ de: pseudo, quand: ISO }] (version 6 : les pourboires reçus pas encore accusés, du plus ancien au plus
--             récent, les 20 plus récents au plus ; version 6.5 : la lecture ne les marque plus, le téléphone les accuse avec
--             fournil_vu_pourboires une fois rangés et sauvés : une réponse perdue les rend de nouveau à la lecture suivante),
--             objectif: { semaine: 'AAAA-MM-JJ', reussi: true, recompense: true } | null (version 6 : l'objectif commun d'une semaine
--             finie réussie à laquelle il a mis 30 points ou plus, la plus récente pas encore accusée ; version 6.5 : rendu jusqu'à
--             ce que fournil_vu_objectif l'accuse) }
-- Un identifiant inconnu (jamais inscrit, ou effacé par le ménage) : ok, aucun podium. Le jeton d'un autre : 'jeton', rien.
create or replace function public.fournil_recompenses(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lundi    date := public.fournil_lundi(public.fournil_maintenant());
  v_jeton    text;
  v_inscrit  boolean;
  v_derniere json;
  v_pourboires json;
  v_objectif   json;
begin
  perform public.fournil_figer(v_lundi);
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton', 'podiums', '[]'::json, 'places', '[]'::json, 'derniere', null, 'quartier', null, 'quartier_podium', null, 'evenements', '{}'::json, 'pourboires', '[]'::json, 'objectif', null);
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id;
  v_inscrit := found;
  if v_inscrit and v_jeton <> public.fournil_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton', 'podiums', '[]'::json, 'places', '[]'::json, 'derniere', null, 'quartier', null, 'quartier_podium', null, 'evenements', '{}'::json, 'pourboires', '[]'::json, 'objectif', null);
  end if;
  -- les pourboires reçus pas encore accusés (les 20 plus récents) ; version 6.5 : la lecture ne les marque plus
  select coalesce(json_agg(json_build_object('de', x.pseudo, 'quand', public.fournil_iso(x.quand)) order by x.quand), '[]'::json)
    into v_pourboires
    from (select j.pseudo, p.quand from public.fournil_pourboires p join public.fournil_joueurs j on j.id = p.de
           where v_inscrit and p.a = p_id and p.vu is null
           order by p.quand desc limit 20) x;
  -- la récompense de l'objectif commun (la plus récente semaine pas encore accusée) ; version 6.5 : la lecture ne la marque plus
  select json_build_object('semaine', to_char(max(g.semaine), 'YYYY-MM-DD'), 'reussi', true, 'recompense', true)
    into v_objectif
    from public.fournil_objectif_gagnants g
   where v_inscrit and g.id = p_id and g.recu is null
  having count(*) > 0;
  select json_build_object('semaine', to_char(v_lundi - 7, 'YYYY-MM-DD'),
                           'podium', json_agg(json_build_object('rang', p.rang, 'pseudo', p.pseudo, 'points', p.points, 'valeur', p.valeur)
                                              order by p.rang, lower(p.pseudo)))
    into v_derniere
    from public.fournil_palmares p
   where p.semaine = v_lundi - 7 and p.rang <= 3
  having count(*) > 0;
  return json_build_object(
    'ok', true,
    'erreur', null,
    'podiums', coalesce((select json_agg(json_build_object('semaine', to_char(p.semaine, 'YYYY-MM-DD'), 'rang', p.rang)
                                         order by p.semaine)
                           from public.fournil_palmares p
                          where v_inscrit and p.id = p_id and p.rang <= 3), '[]'::json),
    'places', coalesce((select json_agg(json_build_object('semaine', to_char(p.semaine, 'YYYY-MM-DD'), 'rang', p.rang, 'joueurs', s.joueurs)
                                        order by p.semaine)
                          from public.fournil_palmares p left join public.fournil_semaines s on s.semaine = p.semaine
                         where v_inscrit and p.id = p_id), '[]'::json),
    'derniere', v_derniere,
    'quartier', (select q.rang from public.fournil_quartier_podium q where v_inscrit and q.id = p_id),
    'quartier_podium', case when exists (select 1 from public.fournil_evenements where nom = 'quartier')
      then coalesce((select json_agg(json_build_object('rang', q.rang, 'pseudo', q.pseudo, 'valeur', q.valeur) order by q.rang, lower(q.pseudo))
                       from public.fournil_quartier_podium q), '[]'::json) end,
    'evenements', coalesce((
      select json_object_agg(x.nom, json_build_object(
               'rang', (select e.rang from public.fournil_evt_podium e where v_inscrit and e.evt = x.nom and e.id = p_id),
               'podium', coalesce((select json_agg(json_build_object('rang', e.rang, 'pseudo', e.pseudo, 'valeur', e.valeur) order by e.rang, lower(e.pseudo))
                                     from public.fournil_evt_podium e where e.evt = x.nom), '[]'::json)))
        from public.fournil_evts() x
       where exists (select 1 from public.fournil_evenements f where f.nom = x.nom)), '{}'::json),
    'pourboires', v_pourboires,
    'objectif', v_objectif
  );
end
$$;


-- ─── 9. fournil_heure : l'heure du serveur ──────────────────────────────────────────────────────
-- Réponse : { ms } (millisecondes depuis le 1er janvier 1970, temps universel) : une source d'heure sûre pour le jeu
-- (l'heure du téléphone, elle, se change dans les réglages).
create or replace function public.fournil_heure()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
begin
  perform public.fournil_figer(public.fournil_lundi(v_maintenant));
  return json_build_object('ms', floor(extract(epoch from v_maintenant) * 1000)::bigint);
end
$$;


-- ─── 9 bis. fournil_vu : un signe de vie (version 5), pour « en ligne » ─────────────────────────
-- Le téléphone l'appelle toutes les 2 minutes tant que le jeu est au premier plan (et au retour au premier plan) : elle vérifie le
-- jeton et pose vu = l'heure du serveur, rien d'autre (aucun compte, aucun palmarès, pas de ménage). Le classement en tire en_ligne
-- (vu il y a moins de 4 minutes), jamais l'heure elle-même.
-- Réponse : { ok: true } ou { ok: false, erreur: 'jeton' (identifiant ou jeton mal formé, ou le jeton d'un autre) | 'inconnu'
-- (pas inscrit, ou effacé par le ménage : le prochain envoi de fournil_publier le réinscrit) }.
create or replace function public.fournil_vu(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id;
  if not found then
    return json_build_object('ok', false, 'erreur', 'inconnu');
  end if;
  if v_jeton <> public.fournil_empreinte(p_jeton) then
    return json_build_object('ok', false, 'erreur', 'jeton');
  end if;
  update public.fournil_joueurs set vu = public.fournil_maintenant() where id = p_id;
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 9 ter. Les copains et les notifications (version 6) ──────────────────────────────────────────
-- Toutes vérifient le jeton (p_id + p_jeton, comme fournil_publier), sauf fournil_boutique et fournil_objectif, lisibles par tous.
-- Les erreurs communes : 'jeton' (identifiant ou jeton mal formé, ou le jeton d'un autre), 'inconnu' (pas inscrit au classement, ou
-- effacé par le ménage : le prochain envoi de fournil_publier le réinscrit).

-- vérifier un joueur (et tenir sa ligne jusqu'à la fin de l'appel : ses appels simultanés passent un à un) : null si c'est bien lui,
-- sinon 'jeton' ou 'inconnu'
create or replace function public.fournil_joueur_verifie(p_id uuid, p_jeton text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_jeton text;
begin
  if p_id is null or not public.fournil_jeton_valable(p_jeton) then
    return 'jeton';
  end if;
  select jeton into v_jeton from public.fournil_joueurs where id = p_id for update;
  if not found then
    return 'inconnu';
  end if;
  if v_jeton <> public.fournil_empreinte(p_jeton) then
    return 'jeton';
  end if;
  return null;
end
$$;

-- ─── 9 ter a. fournil_boutique : la boutique d'un copain (sa photo), lisible par tous ───
-- p_pseudo : son pseudo (sans tenir compte des majuscules). p_id, p_jeton (facultatifs) : les siens, pour savoir s'il peut encore lui
-- laisser un pourboire aujourd'hui.
-- Réponse : { ok: true, erreur: null, pseudo, photo: l'objet envoyé par son téléphone | null (pas encore de photo), maj: ISO | null,
--             en_ligne: booléen (signe de vie il y a moins de 4 minutes), restants: 0 à 3 | null (sans p_id/p_jeton valables),
--             deja: vrai s'il lui a déjà laissé un pourboire aujourd'hui | null }
--           ou { ok: false, erreur: 'inconnu' } (aucun joueur de ce pseudo). Jamais d'identifiant ni de jeton.
-- La photo vient du téléphone de ce joueur : le jeu l'affiche comme du texte, jamais comme du HTML.
create or replace function public.fournil_boutique(p_pseudo text, p_id uuid default null, p_jeton text default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_jour       date := public.fournil_jour(v_maintenant);
  v_moi        boolean;
  b            record;
begin
  perform public.fournil_figer(public.fournil_lundi(v_maintenant));
  if p_pseudo is null or char_length(p_pseudo) > 64 then
    return json_build_object('ok', false, 'erreur', 'inconnu');
  end if;
  select j.id, j.pseudo, j.vu, f.photo, f.maj into b
    from public.fournil_joueurs j left join public.fournil_photos f on f.id = j.id
   where lower(j.pseudo) = lower(btrim(p_pseudo));
  if not found then
    return json_build_object('ok', false, 'erreur', 'inconnu');
  end if;
  v_moi := p_id is not null and public.fournil_jeton_valable(p_jeton)
           and exists (select 1 from public.fournil_joueurs m where m.id = p_id and m.jeton = public.fournil_empreinte(p_jeton));
  return json_build_object(
    'ok', true,
    'erreur', null,
    'pseudo', b.pseudo,
    'photo', b.photo,
    'maj', public.fournil_iso(b.maj),
    'en_ligne', coalesce(b.vu > v_maintenant - interval '4 minutes' and b.vu <= v_maintenant + interval '1 minute', false),
    'restants', case when v_moi then greatest(3 - (select count(*) from public.fournil_pourboires p where p.de = p_id and p.jour = v_jour), 0)::int end,
    'deja', case when v_moi then exists (select 1 from public.fournil_pourboires p where p.de = p_id and p.a = b.id and p.jour = v_jour) end
  );
end
$$;

-- ─── 9 ter b. fournil_pourboire : laisser un pourboire à un copain ───
-- Un par jour (heure de Paris) et par copain, 3 par jour en tout. Le donneur gagne 1 point de la semaine (points et points_total ;
-- gardé aussi dans points_bonus, pour que l'envoi suivant de son téléphone ne l'absorbe pas) ; le receveur le trouvera dans
-- fournil_recompenses (pourboires) et reçoit une notification s'il l'a demandé.
-- Réponse : { ok, erreur: null | 'jeton' | 'inconnu' (le donneur n'est pas inscrit, ou aucun joueur de ce pseudo) | 'soi' (son propre
--             pseudo) | 'deja' (déjà donné aujourd'hui à ce copain) | 'quota' (3 aujourd'hui), restants: ce qu'il peut encore donner
--             aujourd'hui (null si le jeton est refusé), points_semaine: ses points de la semaine (null si refusé) }
create or replace function public.fournil_pourboire(p_id uuid, p_jeton text, p_pour text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_lundi      date := public.fournil_lundi(v_maintenant);
  v_jour       date := public.fournil_jour(v_maintenant);
  v_erreur     text;
  v_n          integer;
  v_k          integer;
  v_a          uuid;
  v_pseudo     text;
  v_points     integer;
begin
  perform public.fournil_figer(v_lundi);
  v_erreur := public.fournil_joueur_verifie(p_id, p_jeton); -- tient sa ligne : ses pourboires simultanés passent un à un
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'restants', null, 'points_semaine', null);
  end if;
  v_n := (select count(*) from public.fournil_pourboires where de = p_id and jour = v_jour);
  select id into v_a from public.fournil_joueurs
   where p_pour is not null and char_length(p_pour) <= 64 and lower(pseudo) = lower(btrim(p_pour));
  if v_a is null then
    return json_build_object('ok', false, 'erreur', 'inconnu', 'restants', greatest(3 - v_n, 0), 'points_semaine', null);
  end if;
  if v_a = p_id then
    return json_build_object('ok', false, 'erreur', 'soi', 'restants', greatest(3 - v_n, 0), 'points_semaine', null);
  end if;
  if exists (select 1 from public.fournil_pourboires where de = p_id and a = v_a and jour = v_jour) then
    return json_build_object('ok', false, 'erreur', 'deja', 'restants', greatest(3 - v_n, 0), 'points_semaine', null);
  end if;
  if v_n >= 3 then
    return json_build_object('ok', false, 'erreur', 'quota', 'restants', 0, 'points_semaine', null);
  end if;
  insert into public.fournil_pourboires (de, a, jour, quand) values (p_id, v_a, v_jour, v_maintenant) on conflict do nothing;
  get diagnostics v_k = row_count;
  if v_k = 0 then
    return json_build_object('ok', false, 'erreur', 'deja', 'restants', greatest(3 - v_n, 0), 'points_semaine', null);
  end if;
  -- version 6.1 : plus de point de classement pour le donneur (il gagne une étoile dans son jeu : « etoile » dans la réponse) ;
  -- points_semaine rend ses points de la semaine, inchangés
  select pseudo, case when semaine = v_lundi then points else 0 end into v_pseudo, v_points from public.fournil_joueurs where id = p_id;
  perform public.fournil_notif_mettre(v_a, 'pourboire', v_pseudo || ' t''a laissé un pourboire 🥐', v_maintenant);
  return json_build_object('ok', true, 'erreur', null, 'restants', greatest(3 - v_n - 1, 0), 'points_semaine', v_points, 'etoile', 1);
end
$$;

-- ─── 9 ter c. fournil_vu_pourboires : accuser les pourboires reçus ───
-- Marque vus tous ceux reçus jusqu'à p_jusqua (null : maintenant). Depuis la version 6.5, fournil_recompenses ne les marque plus : le
-- téléphone les accuse ainsi une fois rangés et sauvés (p_jusqua : le plus récent qu'il a reçu). Réponse : { ok, erreur: null | 'jeton'
-- | 'inconnu' }.
create or replace function public.fournil_vu_pourboires(p_id uuid, p_jeton text, p_jusqua timestamptz default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_joueur_verifie(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  update public.fournil_pourboires set vu = v_maintenant
   where a = p_id and vu is null and quand <= least(coalesce(p_jusqua, v_maintenant), v_maintenant);
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── 9 ter c bis. fournil_vu_objectif : accuser la récompense de l'objectif commun (version 6.5) ───
-- Le téléphone l'appelle une fois la récompense rangée et sauvée : toutes ses semaines réussies jusqu'à p_semaine (le lundi rendu par
-- fournil_recompenses) sont marquées reçues. Réponse : { ok, erreur: null | 'jeton' | 'inconnu' }.
create or replace function public.fournil_vu_objectif(p_id uuid, p_jeton text, p_semaine date)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_joueur_verifie(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  update public.fournil_objectif_gagnants set recu = public.fournil_maintenant()
   where id = p_id and recu is null and semaine <= p_semaine;
  return json_build_object('ok', true, 'erreur', null);
end
$$;

-- ─── 9 ter d. fournil_objectif : l'objectif commun de la semaine, lisible par tous ───
-- Réponse : { semaine: 'AAAA-MM-JJ' (le lundi), but: 300 à 6 000 (150 × les joueurs actifs de la semaine précédente, fixé une fois),
--             total: la somme des points de la semaine de tous les joueurs (affichée en « croissants »), joueurs: ceux qui ont au moins
--             1 point cette semaine, reussi: total ≥ but, pourcent: 0 à 100,
--             precedente: { semaine, but, total, reussi } | null (la semaine passée, figée) }
create or replace function public.fournil_objectif()
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lundi date := public.fournil_lundi(public.fournil_maintenant());
  v_but   integer;
  v_total integer;
  v_n     integer;
  v_prec  json;
begin
  perform public.fournil_figer(v_lundi);
  v_but := public.fournil_objectif_but(v_lundi);
  select coalesce(sum(j.points), 0)::int, (count(*) filter (where j.points > 0))::int into v_total, v_n
    from public.fournil_joueurs j where j.semaine = v_lundi;
  select json_build_object('semaine', to_char(o.semaine, 'YYYY-MM-DD'), 'but', o.but, 'total', o.total, 'reussi', o.reussi) into v_prec
    from public.fournil_objectif o where o.semaine = v_lundi - 7 and o.fige is not null;
  return json_build_object(
    'semaine', to_char(v_lundi, 'YYYY-MM-DD'),
    'but', v_but,
    'total', v_total,
    'joueurs', v_n,
    'reussi', v_total >= v_but,
    'pourcent', least(100, floor(100.0 * v_total / v_but))::int,
    'precedente', v_prec
  );
end
$$;

-- ─── 9 ter e. fournil_abonner / fournil_desabonner : les notifications de cet appareil ───
-- p_sub : l'abonnement du navigateur (PushSubscription.toJSON()) : { endpoint, keys: { p256dh, auth } }, 2 Ko au plus ; l'endpoint en
-- https, 1 000 caractères au plus, chez un service de notifications de navigateur (fournil_endpoint_valable). 5 appareils au plus par
-- joueur : au-delà, le plus ancien est remplacé. Un appareil déjà abonné par un autre joueur (même navigateur, autre partie) passe à
-- celui-ci.
-- p_prefs (facultatif) : { pleine, evenements, pourboires, objectif } (des booléens ; une clé absente ne change rien ; tout est
-- coché au premier abonnement). Gardées par joueur, pour tous ses appareils.
-- Réponse : { ok, erreur: null | 'jeton' | 'inconnu' | 'abonnement' (p_sub mal formé) | 'preferences' (p_prefs pas un objet),
--             prefs: { pleine, evenements, pourboires, objectif } | null, appareils: combien de ses appareils sont abonnés }
create or replace function public.fournil_abonner(p_id uuid, p_jeton text, p_sub jsonb, p_prefs jsonb default null)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_joueur_verifie(p_id, p_jeton);
  v_end        text;
  v_p256dh     text;
  v_auth       text;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'prefs', null, 'appareils', null);
  end if;
  if p_sub is null or jsonb_typeof(p_sub) <> 'object' or octet_length(p_sub::text) > 2048 then
    return json_build_object('ok', false, 'erreur', 'abonnement', 'prefs', null, 'appareils', null);
  end if;
  v_end := p_sub ->> 'endpoint';
  v_p256dh := p_sub #>> '{keys,p256dh}';
  v_auth := p_sub #>> '{keys,auth}';
  if not public.fournil_endpoint_valable(v_end)
     or not coalesce(v_p256dh ~ '^[A-Za-z0-9_+/-]{40,200}={0,2}$', false)
     or not coalesce(v_auth ~ '^[A-Za-z0-9_+/-]{8,64}={0,2}$', false) then
    return json_build_object('ok', false, 'erreur', 'abonnement', 'prefs', null, 'appareils', null);
  end if;
  if p_prefs is not null and jsonb_typeof(p_prefs) <> 'object' then
    return json_build_object('ok', false, 'erreur', 'preferences', 'prefs', null, 'appareils', null);
  end if;
  insert into public.fournil_notif_prefs (id, maj) values (p_id, v_maintenant) on conflict (id) do nothing;
  update public.fournil_notif_prefs
     set pleine     = case when jsonb_typeof(p_prefs -> 'pleine') = 'boolean' then (p_prefs ->> 'pleine')::boolean else pleine end,
         evenements = case when jsonb_typeof(p_prefs -> 'evenements') = 'boolean' then (p_prefs ->> 'evenements')::boolean else evenements end,
         pourboires = case when jsonb_typeof(p_prefs -> 'pourboires') = 'boolean' then (p_prefs ->> 'pourboires')::boolean else pourboires end,
         objectif   = case when jsonb_typeof(p_prefs -> 'objectif') = 'boolean' then (p_prefs ->> 'objectif')::boolean else objectif end,
         maj = v_maintenant
   where id = p_id;
  insert into public.fournil_abonnements (endpoint, joueur, p256dh, auth, cree) values (v_end, p_id, v_p256dh, v_auth, v_maintenant)
  on conflict (endpoint) do update set joueur = excluded.joueur, p256dh = excluded.p256dh, auth = excluded.auth, cree = excluded.cree;
  delete from public.fournil_abonnements
   where joueur = p_id
     and endpoint in (select a.endpoint from public.fournil_abonnements a where a.joueur = p_id order by a.cree desc, a.endpoint offset 5);
  return json_build_object(
    'ok', true,
    'erreur', null,
    'prefs', (select json_build_object('pleine', p.pleine, 'evenements', p.evenements, 'pourboires', p.pourboires, 'objectif', p.objectif)
                from public.fournil_notif_prefs p where p.id = p_id),
    'appareils', (select count(*)::int from public.fournil_abonnements a where a.joueur = p_id)
  );
end
$$;

-- p_endpoint : l'appareil à retirer (null : tous ses appareils). Réponse : { ok, erreur: null | 'jeton' | 'inconnu', retires: n }.
create or replace function public.fournil_desabonner(p_id uuid, p_jeton text, p_endpoint text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_erreur text := public.fournil_joueur_verifie(p_id, p_jeton);
  v_n      integer;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'retires', 0);
  end if;
  delete from public.fournil_abonnements where joueur = p_id and (p_endpoint is null or endpoint = p_endpoint);
  get diagnostics v_n = row_count;
  return json_build_object('ok', true, 'erreur', null, 'retires', v_n);
end
$$;

-- ─── 9 ter f. fournil_planifier : « Ta boulangerie déborde », à l'heure où son absence est pleine ───
-- Le téléphone l'appelle en quittant le jeu (p_pleine_a : l'heure où ses apprentis auront fini, G.heuresAbsence), et avec null au
-- retour. Elle remplace sa notification 'pleine' en attente ; une heure dans moins de 10 min ou dans plus de 24 h est ignorée (les
-- apprentis travaillent de 8 h à une quinzaine d'heures avec les talents et le mobilier).
-- Réponse : { ok, erreur: null | 'jeton' | 'inconnu', planifiee: vrai si une notification attend (il est abonné, le cas est coché) }
create or replace function public.fournil_planifier(p_id uuid, p_jeton text, p_pleine_a timestamptz)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_joueur_verifie(p_id, p_jeton);
  v_ok         boolean := false;
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur, 'planifiee', false);
  end if;
  delete from public.fournil_notifs where joueur = p_id and type = 'pleine' and envoyee is null;
  if p_pleine_a is not null and p_pleine_a >= v_maintenant + interval '10 minutes' and p_pleine_a <= v_maintenant + interval '24 hours' then
    v_ok := public.fournil_notif_mettre(p_id, 'pleine', 'Ta boulangerie déborde ! Tes apprentis t''attendent.', p_pleine_a);
  end if;
  return json_build_object('ok', true, 'erreur', null, 'planifiee', v_ok);
end
$$;

-- ─── 9 ter g. fournil_notif_essai : « M'envoyer un essai » ───
-- Une notification 'essai' due tout de suite (partie au plus 5 min plus tard, à la prochaine tournée de la fonction d'envoi), au plus
-- une toutes les 2 minutes. Réponse : { ok, erreur: null | 'jeton' | 'inconnu' | 'abonnement' (aucun appareil abonné) | 'trop_vite' }
create or replace function public.fournil_notif_essai(p_id uuid, p_jeton text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_erreur     text := public.fournil_joueur_verifie(p_id, p_jeton);
begin
  if v_erreur is not null then
    return json_build_object('ok', false, 'erreur', v_erreur);
  end if;
  if not exists (select 1 from public.fournil_abonnements where joueur = p_id) then
    return json_build_object('ok', false, 'erreur', 'abonnement');
  end if;
  if exists (select 1 from public.fournil_notifs where joueur = p_id and type = 'essai' and cree > v_maintenant - interval '2 minutes') then
    return json_build_object('ok', false, 'erreur', 'trop_vite');
  end if;
  perform public.fournil_notif_mettre(p_id, 'essai', 'Ça marche ! Le Fournil te préviendra ici.', v_maintenant);
  return json_build_object('ok', true, 'erreur', null);
end
$$;


-- ─── 9 quater. La fonction d'envoi (supabase/functions/notifier) : RÉSERVÉES AU RÔLE DE SERVICE ───────
-- Jamais ouvertes à anon ni à authenticated : seule la fonction d'envoi, avec la clé de service que Supabase lui donne dans son
-- environnement, les appelle.

-- les notifications dues : d'abord le ménage (notifications de plus de 7 jours, celles restées 6 h sans partir, pourboires de plus
-- de 30 jours), le palmarès et l'objectif du lundi (fournil_figer : même si personne n'ouvre le jeu), les annonces d'événements ;
-- puis au plus p_limite (1 à 500, 100 par défaut) notifications dues, prises pour 2 minutes (deux tournées ne les envoient pas deux
-- fois ; pas accusées à temps, elles repartent), seulement celles que leur joueur veut encore (les autres sont retirées).
-- Réponse : [{ notif_id, type, titre, texte, url, subs: [{ endpoint, p256dh, auth }] }] (du plus ancien au plus récent).
create or replace function public.fournil_notifs_dues(p_limite integer default 100)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_ids        bigint[];
  v_res        json;
begin
  perform public.fournil_figer(public.fournil_lundi(v_maintenant));
  delete from public.fournil_notifs where cree < v_maintenant - interval '7 days';
  delete from public.fournil_notifs where envoyee is null and due < v_maintenant - interval '6 hours';
  delete from public.fournil_pourboires where quand < v_maintenant - interval '30 days';
  delete from public.fournil_objectif_gagnants where semaine < public.fournil_lundi(v_maintenant) - 35;
  delete from public.fournil_annonces where quand < v_maintenant - interval '30 days';
  perform public.fournil_annoncer(v_maintenant);
  delete from public.fournil_notifs n
   where n.envoyee is null and n.due <= v_maintenant and not public.fournil_notif_permise(n.joueur, n.type);
  with prises as (
    select n.id from public.fournil_notifs n
     where n.envoyee is null and n.due <= v_maintenant and (n.prise is null or n.prise < v_maintenant - interval '2 minutes')
     order by n.due, n.id
     limit least(greatest(coalesce(p_limite, 100), 1), 500)
       for update skip locked
  ), maj as (
    update public.fournil_notifs n set prise = v_maintenant from prises p where n.id = p.id returning n.id
  )
  select array_agg(id) into v_ids from maj;
  select coalesce(json_agg(json_build_object(
           'notif_id', n.id, 'type', n.type, 'titre', n.titre, 'texte', n.texte, 'url', n.url,
           'subs', coalesce((select json_agg(json_build_object('endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth) order by a.cree, a.endpoint)
                               from public.fournil_abonnements a where a.joueur = n.joueur), '[]'::json))
           order by n.due, n.id), '[]'::json)
    into v_res
    from public.fournil_notifs n where n.id = any(coalesce(v_ids, '{}'::bigint[]));
  return v_res;
end
$$;

-- après l'envoi : p_ids, les notifications traitées (envoyées, ou essayées sans succès : elles ne repartent pas) ; p_morts, les
-- appareils que le service de notifications dit disparus (404, 410), retirés. Réponse : { ok, faites: n, retires: n }.
create or replace function public.fournil_notifs_faites(p_ids bigint[], p_morts text[])
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := public.fournil_maintenant();
  v_f integer;
  v_r integer;
begin
  update public.fournil_notifs set envoyee = v_maintenant where id = any(coalesce(p_ids, '{}'::bigint[])) and envoyee is null;
  get diagnostics v_f = row_count;
  delete from public.fournil_abonnements where endpoint = any(coalesce(p_morts, '{}'::text[]));
  get diagnostics v_r = row_count;
  return json_build_object('ok', true, 'faites', v_f, 'retires', v_r);
end
$$;


-- ─── 10. Les droits : le jeu n'appelle que ses fonctions ────────────────────────────────────────
-- Postgres et Supabase donnent par défaut le droit d'exécuter les nouvelles fonctions à tout le monde :
-- on le retire partout, puis on le rend seulement pour les fonctions du jeu (anon et authenticated), et pour les deux fonctions
-- de la fonction d'envoi (service_role seulement).
revoke all on function public.fournil_maintenant() from public, anon, authenticated;
revoke all on function public.fournil_lundi(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_jour(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_points_plafond(integer) from public, anon, authenticated;
revoke all on function public.fournil_pseudo_propre(text) from public, anon, authenticated;
revoke all on function public.fournil_jeton_valable(text) from public, anon, authenticated;
revoke all on function public.fournil_empreinte(text) from public, anon, authenticated;
revoke all on function public.fournil_paliers() from public, anon, authenticated;
revoke all on function public.fournil_segment(integer) from public, anon, authenticated;
revoke all on function public.fournil_duree(double precision, double precision) from public, anon, authenticated;
revoke all on function public.fournil_borne(double precision, double precision) from public, anon, authenticated;
revoke all on function public.fournil_figer(date) from public, anon, authenticated;
revoke all on function public.fournil_reponse(text, uuid, date, double precision, boolean, integer, boolean, boolean, text, boolean) from public, anon, authenticated;
revoke all on function public.fournil_quartier_fenetre() from public, anon, authenticated;
revoke all on function public.fournil_quartier_table() from public, anon, authenticated;
revoke all on function public.fournil_quartier_borne(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_quartier_figer(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_evts() from public, anon, authenticated;
revoke all on function public.fournil_evt_borne(text, timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_evt_figer(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_iso(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_evt_titre(text) from public, anon, authenticated;
revoke all on function public.fournil_endpoint_valable(text) from public, anon, authenticated;
revoke all on function public.fournil_notif_permise(uuid, text) from public, anon, authenticated;
revoke all on function public.fournil_notif_mettre(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_objectif_but(date) from public, anon, authenticated;
revoke all on function public.fournil_objectif_figer(date, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.fournil_annoncer(timestamptz) from public, anon, authenticated;
revoke all on function public.fournil_joueur_verifie(uuid, text) from public, anon, authenticated;

revoke all on function public.fournil_publier(uuid, text, text, double precision, integer, date, double precision, text, double precision, jsonb) from public;
revoke all on function public.fournil_classement(text, uuid, integer) from public;
revoke all on function public.fournil_retirer(uuid, text) from public;
revoke all on function public.fournil_recompenses(uuid, text) from public;
revoke all on function public.fournil_heure() from public;
revoke all on function public.fournil_vu(uuid, text) from public;
grant execute on function public.fournil_publier(uuid, text, text, double precision, integer, date, double precision, text, double precision, jsonb) to anon, authenticated;
grant execute on function public.fournil_classement(text, uuid, integer) to anon, authenticated;
grant execute on function public.fournil_retirer(uuid, text) to anon, authenticated;
grant execute on function public.fournil_recompenses(uuid, text) to anon, authenticated;
grant execute on function public.fournil_heure() to anon, authenticated;
grant execute on function public.fournil_vu(uuid, text) to anon, authenticated;
-- version 6 : les copains et les notifications
revoke all on function public.fournil_boutique(text, uuid, text) from public;
revoke all on function public.fournil_pourboire(uuid, text, text) from public;
revoke all on function public.fournil_vu_pourboires(uuid, text, timestamptz) from public;
revoke all on function public.fournil_vu_objectif(uuid, text, date) from public;
revoke all on function public.fournil_objectif() from public;
revoke all on function public.fournil_abonner(uuid, text, jsonb, jsonb) from public;
revoke all on function public.fournil_desabonner(uuid, text, text) from public;
revoke all on function public.fournil_planifier(uuid, text, timestamptz) from public;
revoke all on function public.fournil_notif_essai(uuid, text) from public;
grant execute on function public.fournil_boutique(text, uuid, text) to anon, authenticated;
grant execute on function public.fournil_pourboire(uuid, text, text) to anon, authenticated;
grant execute on function public.fournil_vu_pourboires(uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.fournil_vu_objectif(uuid, text, date) to anon, authenticated; -- version 6.5
grant execute on function public.fournil_objectif() to anon, authenticated;
grant execute on function public.fournil_abonner(uuid, text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.fournil_desabonner(uuid, text, text) to anon, authenticated;
grant execute on function public.fournil_planifier(uuid, text, timestamptz) to anon, authenticated;
grant execute on function public.fournil_notif_essai(uuid, text) to anon, authenticated;
-- la fonction d'envoi seulement : jamais anon ni authenticated
revoke all on function public.fournil_notifs_dues(integer) from public, anon, authenticated;
revoke all on function public.fournil_notifs_faites(bigint[], text[]) from public, anon, authenticated;
grant execute on function public.fournil_notifs_dues(integer) to service_role;
grant execute on function public.fournil_notifs_faites(bigint[], text[]) to service_role;

commit;

-- l'API de Supabase (PostgREST) relit la liste des fonctions tout de suite
notify pgrst, 'reload schema';
