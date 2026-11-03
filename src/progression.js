/* LE FOURNIL — le lot « progression » : le second (il achète les niveaux pendant qu'on joue), le concours des boulangeries rivales (sans
   serveur) et les projets de quartier (les règles côté téléphone). Aucune dépendance au DOM : tourne aussi dans Node.
   Global PROGRESSION, chargé dans build.js juste après chaine.js : il lit GAME et n'écrit que ses propres champs d'état (st.second,
   st.rivales, st.projets), la réserve de boosts (GAME.donnerBoostReserve) et, par GAME.acheter(…, { second: true }), les niveaux achetés.
   Les paliers au-delà de la n°30, le pas d'étoiles et les trophées qui rapportent vivent dans game.js (le parcours et revenuBase les lisent).
   Conception, simulation et réglages : le contrat du lot « progression » (§ 2, 4, 5, 6) ; test : test/fournil-progression.test.js.

   Décisions du joueur (2 nov.), qui font foi :
   - le second : dès la boutique n°5, 50 % de la caisse par défaut (10 à 90 %), une réserve de 10 min de gains pour les achats clés ; ses
     achats ne comptent ni pour le classement ni pour les objectifs du jour « améliore N fois » ;
   - les rivales : quatre boulangeries fictives réglées sur SON propre niveau (contrat § 4), sans serveur ;
   - les projets de quartier : le SQL fournil-projets-v68 (le joueur le collera) ; tant qu'il ne l'est pas, le téléphone n'affiche rien
     (le moteur du classement reçoit une erreur et ne rend rien : recevoirProjets n'est pas appelé, le décor garde ce qu'il a déjà vu).

   Toutes les fonctions sont pures (pas de DOM, pas de Date.now() hors repli : st.now, ou l'heure passée en paramètre), les réparations
   idempotentes, et rien ne se paie deux fois (aPayer, vus).
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./game.js'));
  } else root.PROGRESSION = factory(root.GAME);
})(typeof self !== 'undefined' ? self : this, function (G) {
  'use strict';
  const entier = (v, min, max, def) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
  const objet = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;
  const maintenant = (st) => (st && Number.isFinite(st.now) ? st.now : Date.now());

  // ═══ 1. Le second : il achète les niveaux des recettes cochées pendant qu'on joue (contrat § 2) ═══════════════════════════════
  // Débloqué à la boutique n°5, à vie ; éteint par défaut, le joueur l'allume dans sa feuille. Un interrupteur général et un par recette
  // (st.second.off : les recettes DÉCOCHÉES, pour qu'une recette nouvelle soit cochée d'office). Toutes les 2 s de jeu (secondPas, appelé
  // par la boucle de l'écran après GAME.tick ; jamais pendant l'absence ni sous un écran couvrant), il dépense au plus part % de la caisse
  // du début du passage, en 3 achats au plus de 1 à 10 niveaux, chaque fois le meilleur rapport gain/prix parmi les recettes cochées déjà
  // débloquées. Il ne débloque rien, n'embauche personne, n'achète ni bonus, ni meuble, ni saison : ce sont des choix.
  // La réserve (mesurée : sans elle, à 50 %, il faisait PERDRE 10 à 45 % d'étoiles au 30e jour en vidant la caisse que le joueur gardait
  // pour un achat bien plus rentable) : quand un achat clé (débloquer la recette suivante gagnée, embaucher, un bonus ouvert) coûte moins
  // que la caisse + 10 min de gains, il attend (st.second.attend) et laisse la caisse au joueur.
  // Inspirations : les autobuyers d'Antimatter Dimensions (intervalle, achat groupé, interrupteur), AutoUpgrades de Trimps (part de la caisse).
  const SECOND = { boutique: 5, partDefaut: 50, partMin: 10, partMax: 90, pas: 10, intervalle: 2, achatsMax: 3, nivMax: 10, reserve: 600 };
  const secondDebloque = (st) => (st.boutiques || 1) >= SECOND.boutique;
  const secondNeuf = () => ({ vu: false, actif: false, part: SECOND.partDefaut, off: [], t: 0, achats: 0, attend: false });
  function second(st) { // l'état remis d'aplomb : { vu, actif, part, off: [i…], t, achats, attend }
    let s = st.second;
    if (!objet(s)) s = st.second = secondNeuf();
    s.vu = !!s.vu; s.actif = !!s.actif && secondDebloque(st); s.attend = !!s.attend && s.actif;
    s.part = Math.round(entier(s.part, SECOND.partMin, SECOND.partMax, SECOND.partDefaut) / SECOND.pas) * SECOND.pas;
    s.off = (Array.isArray(s.off) ? s.off : []).filter((i, k, a) => Number.isInteger(i) && i >= 0 && i < G.PRODUITS.length && a.indexOf(i) === k);
    s.t = Number(s.t) >= 0 && Number(s.t) < SECOND.intervalle ? Number(s.t) : 0;
    s.achats = entier(s.achats, 0, 1e12, 0);
    return s;
  }
  const secondCoche = (st, i) => !second(st).off.includes(i);
  function secondCocher(st, i, oui) { // cocher (oui) ou décocher la recette i ; rend son état
    const s = second(st); if (!(Number.isInteger(i) && i >= 0 && i < G.PRODUITS.length)) return false;
    s.off = s.off.filter((x) => x !== i); if (!oui) s.off.push(i); return !s.off.includes(i);
  }
  function secondRegler(st, o) { // { actif, part } ; la part bornée de 10 à 90 au pas de 10
    const s = second(st);
    if (o && 'actif' in o) s.actif = !!o.actif && secondDebloque(st);
    if (o && 'part' in o) { s.part = entier(o.part, SECOND.partMin, SECOND.partMax, s.part); second(st); }
    if (!s.actif) s.attend = false;
    return s;
  }
  // l'annonce (une fois) : à la boutique n°5, ou au chargement d'une sauvegarde qui y est déjà
  const secondAnnonce = (st) => secondDebloque(st) && !second(st).vu;
  function secondVu(st) { second(st).vu = true; }
  // le prix du prochain achat clé (débloquer la recette suivante gagnée, embaucher un apprenti, un bonus ouvert), Infinity s'il n'y en a pas
  function achatCle(st) {
    let c = Infinity; const next = st.stations.findIndex((s, i) => s.niv === 0 && G.recetteGagnee(st, i));
    if (next > 0 && st.stations[next - 1].niv > 0) c = Math.min(c, G.PRODUITS[next].debloquer * G.remise(st));
    st.stations.forEach((s, i) => { if (s.niv > 0 && !s.staff) c = Math.min(c, G.prixStaff(st, i)); });
    for (const a of G.AMELIORATIONS) if (!st.ameliorations[a.id] && G.ameliorationOuverte(st, a)) c = Math.min(c, G.prixBonus(st, a));
    return c;
  }
  const DERNIER = new WeakMap(); // le dernier achat, pour l'écran (« +n » sur la carte) : non sauvegardé
  function secondAgir(st) { // un passage ; rend la liste des achats [{ i, n, prix }]
    const s = second(st); if (!s.actif || !secondDebloque(st)) return [];
    if (achatCle(st) <= st.coins + SECOND.reserve * G.tauxParSeconde(st)) { s.attend = true; return []; } // il garde la caisse pour l'achat clé
    s.attend = false;
    let budget = st.coins * s.part / 100; const out = [];
    for (let k = 0; k < SECOND.achatsMax; k++) {
      let best = -1, bestR = 0, bestN = 0;
      for (let i = 0; i < G.PRODUITS.length; i++) {
        const x = st.stations[i]; if (!x || x.niv <= 0 || s.off.includes(i)) continue;
        const n = Math.min(SECOND.nivMax, G.maxNiveaux(i, x.niv, budget / G.remise(st))); if (n < 1) continue;
        const prix = G.prixNiveaux(st, i, n); if (!(prix <= budget)) continue;
        const P = G.PRODUITS[i], gain = (P.rev * (x.niv + n) * G.palierMult(x.niv + n) - P.rev * x.niv * G.palierMult(x.niv)) * G.ameliorationMult(st, i) / P.temps * (x.staff ? 1 : 0.3);
        const r = gain / prix; if (r > bestR) { bestR = r; best = i; bestN = n; }
      }
      if (best < 0) break;
      const a = G.acheter(st, best, { n: bestN, second: true }); if (!a.ok) break;
      budget -= a.prix; s.achats++; out.push({ i: best, n: bestN, prix: a.prix });
    }
    if (out.length) DERNIER.set(st, Object.assign({ t: maintenant(st) }, out[out.length - 1]));
    return out;
  }
  function secondPas(st, dt) { // appelé par la boucle de l'écran avec le dt de jeu (jamais par GAME.absence) ; rend les achats faits
    const s = second(st); if (!s.actif) return [];
    s.t += Math.max(0, Math.min(Number(dt) || 0, 5)); if (s.t < SECOND.intervalle) return [];
    s.t = 0; return secondAgir(st);
  }
  const secondDernier = (st) => DERNIER.get(st) || null;

  // ═══ 2. Le concours des boulangeries rivales : chaque semaine, contre 4 rivales fictives (contrat § 4, sans serveur) ═══════════
  // Le score : les points de boulanger de la semaine (GAME.pointsSemaine : déjà plafonnés, 989 au plus), qu'on soit inscrit au classement en
  // ligne ou non. Les rivales sont réglées sur SON PROPRE niveau : ref = la moyenne de ses 3 dernières semaines jouées (st.points.semaines),
  // 100 au moins, figée à la première ouverture de la semaine ; leurs scores de fin de semaine, ref × 0,85 / 1 / 1,12 / 1,3 (± 8 %), chacun
  // plafonné sous le maximum de la semaine (70 / 80 / 88 / 94 % de 989). Jouer comme d'habitude ≈ le bronze, un peu plus l'argent, une belle
  // semaine l'or ; qui fait le plein bat tout le monde. Résultat payé à la première ouverture de la semaine suivante : or boost ×3 1 h,
  // argent ×2 1 h, bronze ×2 30 min, en réserve. Rien de perdu à la 4e ou 5e place, ni sans jouer.
  const RIVALES = [
    { id: 'petrin-argent', nom: 'Le Pétrin d’Argent', q: 3, l: 4 }, { id: 'mamie-lucette', nom: 'Chez Mamie Lucette', q: 0, l: 1 },
    { id: 'brioche-filante', nom: 'La Brioche Filante', q: 2, l: 2 }, { id: 'levain-malin', nom: 'Au Levain Malin', q: 1, l: 3 },
    { id: 'mitrons-presses', nom: 'Les Mitrons Pressés', q: 4, l: 2 }, { id: 'croute-doree', nom: 'La Croûte Dorée', q: 5, l: 5 },
    { id: 'four-gaston', nom: 'Le Four de Gaston', q: 6, l: 3 }, { id: 'miette-joyeuse', nom: 'La Miette Joyeuse', q: 0, l: 0 },
    { id: 'trois-epis', nom: 'Aux Trois Épis', q: 7, l: 4 }, { id: 'sucre-glace', nom: 'Sucre et Glace', q: 8, l: 5 },
  ];
  const RIV = { facteurs: [0.85, 1, 1.12, 1.3], plafonds: [0.7, 0.8, 0.88, 0.94], jitter: 0.08, refMin: 100, semainesRef: 3, hist: 12,
    prix: { 1: { medaille: 'or', mult: 3, secs: 3600 }, 2: { medaille: 'argent', mult: 2, secs: 3600 }, 3: { medaille: 'bronze', mult: 2, secs: 1800 } } };
  const maxSemaine = () => (G.POINTS && G.POINTS.semaine) || 989;
  function refJoueur(historique) { // historique : [{ semaine, points }] des semaines FINIES ; celles à 0 ne comptent pas
    const h = (Array.isArray(historique) ? historique : []).filter((x) => x && x.points > 0).slice(-RIV.semainesRef);
    return h.length ? Math.max(RIV.refMin, Math.round(h.reduce((a, x) => a + x.points, 0) / h.length)) : RIV.refMin;
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function tirage(semaine, graine) { // les 4 rivales de la semaine, leur facteur et leurs poids par jour, déterministes (la même semaine : les mêmes)
    const rnd = mulberry32(hash(`${semaine}|${graine}`));
    const ids = RIVALES.map((x) => x.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, 4).map((id, k) => ({ id, f: RIV.facteurs[k] * (1 + RIV.jitter * (2 * rnd() - 1)), jours: Array.from({ length: 7 }, () => 0.6 + 0.8 * rnd()) }));
  }
  function semaineRivales(semaine, ref, graine) { // [{ id, nom, q, l, cible, jours }] de la plus faible à la plus forte
    const M = maxSemaine();
    return tirage(semaine, graine).map((x, k) => Object.assign({}, RIVALES.find((y) => y.id === x.id), { cible: Math.round(Math.min(ref * x.f, M * RIV.plafonds[k])), jours: x.jours }));
  }
  function scoreRivale(r, part) { // part de la semaine écoulée (0 : lundi 0 h, 1 : dimanche 24 h) → son score, qui monte jour après jour, de 8 h à 22 h
    part = Math.max(0, Math.min(1, Number(part) || 0));
    const tot = r.jours.reduce((a, b) => a + b, 0); let acc = 0; const j = Math.min(6, Math.floor(part * 7)), dans = part * 7 - j;
    for (let k = 0; k < j; k++) acc += r.jours[k];
    acc += r.jours[j] * Math.max(0, Math.min(1, (dans * 24 - 8) / 14));
    return Math.round(r.cible * Math.min(1, acc / tot));
  }
  const rangFinal = (points, liste) => 1 + liste.filter((r) => r.cible > points).length; // à égalité, le joueur passe devant
  const rivalesNeuves = () => ({ semaine: '', ref: 0, medailles: { or: 0, argent: 0, bronze: 0 }, hist: [], aPayer: [], serie: 0, serieMax: 0 });
  const ligneOk = (x) => objet(x) && JOUR_ISO.test(String(x.semaine)) && Number.isInteger(x.rang) && x.rang >= 1 && x.rang <= 5;
  const ligne = (x) => ({ semaine: x.semaine, rang: x.rang, points: entier(x.points, 0, 1e4, 0) });
  function rivales(st) { // l'état remis d'aplomb : { semaine, ref, medailles: { or, argent, bronze }, hist: [{ semaine, rang, points }] (12), aPayer (4), serie, serieMax }
    let r = st.rivales; if (!objet(r)) r = st.rivales = rivalesNeuves();
    if (!objet(r.medailles)) r.medailles = { or: 0, argent: 0, bronze: 0 };
    for (const k of Object.keys(r.medailles)) if (!['or', 'argent', 'bronze'].includes(k)) delete r.medailles[k];
    for (const k of ['or', 'argent', 'bronze']) r.medailles[k] = entier(r.medailles[k], 0, 1e5, 0);
    r.hist = (Array.isArray(r.hist) ? r.hist : []).filter(ligneOk).map(ligne).slice(-RIV.hist);
    r.aPayer = (Array.isArray(r.aPayer) ? r.aPayer : []).filter((x) => ligneOk(x) && x.rang <= 3).map(ligne).slice(-4);
    r.ref = entier(r.ref, 0, 1e4, 0); r.serie = entier(r.serie, 0, 1e4, 0); r.serieMax = Math.max(r.serie, entier(r.serieMax, 0, 1e4, 0));
    if (typeof r.semaine !== 'string' || !(r.semaine === '' || JOUR_ISO.test(r.semaine))) r.semaine = '';
    return r;
  }
  // à l'ouverture et au changement de jour (l'écran) : une nouvelle semaine fige le résultat de la précédente et tire les rivales de celle-ci ;
  // rend le résultat de la semaine finie { semaine, rang, points, classee } (classee : faux pour une semaine à 0 point, sans message), ou null
  function rivalesPas(st, nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : maintenant(st);
    const r = rivales(st), sem = G.semaineKey(now); if (r.semaine === sem) return null;
    // l'heure du jeu qui recule au-dessus d'un lundi (src/horloge.js : le jeu ramené à l'heure sûre) : une semaine passée ne réécrit jamais
    // r.semaine, sinon la même semaine serait payée deux fois quand l'heure revient (médaille et boost)
    if (r.semaine && sem < r.semaine) return null;
    if (!(st.now >= now)) st.now = now; // (le carnet de points range la semaine finie à l'heure du jeu)
    G.pointsSemaine(st); // range d'abord la semaine finie dans st.points.semaines
    const hist = (st.points && Array.isArray(st.points.semaines)) ? st.points.semaines : [];
    let fin = null;
    if (r.semaine && r.ref && r.semaine < sem) {
      const x = hist.find((h) => h.semaine === r.semaine), pts = x ? x.points : 0, liste = semaineRivales(r.semaine, r.ref, st.created || 0);
      const rang = pts > 0 ? rangFinal(pts, liste) : 5;
      fin = { semaine: r.semaine, rang, points: pts };
      r.hist.push(fin); r.hist = r.hist.slice(-RIV.hist);
      if (rang <= 3) { r.aPayer.push(fin); r.aPayer = r.aPayer.slice(-4); r.medailles[RIV.prix[rang].medaille]++; r.serie++; r.serieMax = Math.max(r.serieMax, r.serie); } else r.serie = 0;
      fin = Object.assign({ classee: pts > 0 }, fin);
    }
    r.semaine = sem; r.ref = refJoueur(hist.filter((h) => h.semaine < sem));
    return fin;
  }
  function payerRivales(st) { // la feuille « Résultat du concours » (Récupérer) : les boosts en réserve ; rend ce qui est payé (une fois)
    const r = rivales(st), out = r.aPayer.splice(0);
    for (const x of out) { const p = RIV.prix[x.rang]; G.donnerBoostReserve(st, p.mult, p.secs); x.prix = Object.assign({}, p); }
    return out;
  }
  const prixRivale = (rang) => (RIV.prix[rang] ? Object.assign({}, RIV.prix[rang]) : null);
  function partSemaine(nowMs) { const d = G.paris(nowMs); return (((d.getUTCDay() + 6) % 7) + G.heureParis(nowMs) / 24) / 7; } // lundi 0 h → 0, dimanche 24 h → 1
  function tableauRivales(st, nowMs) { // pour l'écran : les 5 lignes triées { id, nom, score, moi, rang }
    const now = Number.isFinite(nowMs) ? nowMs : maintenant(st), r = rivales(st), sem = G.semaineKey(now), part = partSemaine(now);
    const ref = r.semaine === sem && r.ref ? r.ref : refJoueur(((st.points && st.points.semaines) || []).filter((h) => h.semaine < sem));
    const liste = semaineRivales(sem, ref, st.created || 0).map((x) => ({ id: x.id, nom: x.nom, score: scoreRivale(x, part), moi: false }));
    liste.push({ id: 'moi', nom: G.nomBoutique(st), score: G.pointsSemaine(st), moi: true });
    liste.sort((a, b) => b.score - a.score || (b.moi ? 1 : 0) - (a.moi ? 1 : 0));
    liste.forEach((x, k) => { x.rang = k + 1; });
    return liste;
  }
  // une rivale à visiter : une photo au format du classement (src/classement.js, photo), pour CLASSEMENT.boutiqueDepuisPhoto. Ses postes
  // suivent son niveau (ref : plus le joueur marque de points, plus elle est montée) ; aucun réseau.
  function photoRivale(r, ref) {
    const x = typeof r === 'string' ? RIVALES.find((y) => y.id === r) : r; if (!x) return null;
    const R = Math.max(RIV.refMin, Math.min(maxSemaine(), Number(ref) || RIV.refMin)), k = R / maxSemaine(); // 0,1 à 1
    const recettes = Math.max(4, Math.min(G.PRODUITS.length, Math.round(4 + 12 * k))), haut = Math.round(60 + 540 * k);
    const p = G.PRODUITS.slice(0, 16).map((_, i) => (i < recettes ? [Math.max(1, Math.round(haut * (1 - 0.6 * i / G.PRODUITS.length))), 1, Math.max(1, Math.min(5, 1 + Math.round(4 * k) - (i >= 8 ? 1 : 0)))] : [0, 0, 1]));
    const cran = (m) => Math.max(0, Math.min(m.max, Math.round(m.max * k)));
    const meubles = {}; for (const m of G.MOBILIER) meubles[m.id] = cran(m);
    return { v: 1, nom: x.nom, q: x.q % (G.QUARTIERS ? G.QUARTIERS.length : 5), s: null, p, m: meubles, t: [], c: null, dq: [], dh: [], g: Math.max(1, Math.round(5 + 25 * k)), k: [], o: 0, l: Math.max(0, Math.min(5, x.l)) };
  }

  // ═══ 3. Les projets de quartier : des chantiers financés par les points de TOUS les joueurs (contrat § 5) ═════════════════════
  // Le serveur (fournil_projets, patch v6.8) verse dans le chantier en cours le total des points de boulanger de chaque semaine (le même
  // total que l'objectif commun, déjà plafonné par joueur) ; un chantier rempli change le décor de tout le monde. Son prix est fixé à son
  // ouverture : base(rang) × les joueurs actifs, bornés de 5 à 60. Le téléphone ne connaît que des rangs : le nom, le décor et la
  // récompense de chaque rang sont ici. « Bâtisseur » (trophée) : avoir mis 30 points ou plus la semaine où le chantier s'est rempli, lu
  // sur SON téléphone (st.points.semaines) : pas de table de gagnants au serveur.
  const PROJETS = [
    { id: 'fontaine', nom: 'La fontaine', phrase: 'Une fontaine de pierre sur la place, où les enfants font des ricochets.' },
    { id: 'kiosque', nom: 'Le kiosque à musique', phrase: 'Le dimanche, une fanfare joue devant toutes les boulangeries.' },
    { id: 'marche', nom: 'Le marché couvert', phrase: 'Une halle de fer et de verre : les clients arrivent les bras chargés.' },
    { id: 'reverberes', nom: 'Les réverbères', phrase: 'La rue s’allume le soir, d’une lumière dorée.' },
    { id: 'jardin', nom: 'Le jardin public', phrase: 'Des bancs, des tilleuls et un bac à sable.' },
    { id: 'horloge', nom: 'L’horloge de la place', phrase: 'Elle sonne l’heure des fournées.' },
    { id: 'manege', nom: 'Le manège', phrase: 'Des chevaux de bois qui tournent en musique.' },
    { id: 'statue', nom: 'La statue du Boulanger inconnu', phrase: 'En l’honneur de tous ceux qui se lèvent tôt.' },
  ];
  // les mêmes nombres que le SQL (fournil_projet_base, fournil_projets) : la base 1 200 × 1,08^(rang − 1), les actifs bornés de 5 à 60,
  // 20 chantiers finis au plus par appel ; part : les points de la semaine pour être « bâtisseur » ; decor : les objets montrés dehors
  const PROJ = { baseDepart: 1200, croissance: 1.08, actifsMin: 5, actifsMax: 60, tours: 20, part: 30, decor: 4, finis: 200 };
  const baseProjet = (rang) => Math.round(PROJ.baseDepart * Math.pow(PROJ.croissance, Math.max(0, Math.floor(rang) - 1)));
  const coutProjet = (rang, actifs) => baseProjet(rang) * Math.max(PROJ.actifsMin, Math.min(PROJ.actifsMax, Math.floor(actifs) || 0));
  const RENOVES = ['dorée', 'de marbre', 'de cristal'];
  function projetDe(rang) { // au-delà des huit : la même liste, rénovée (« La fontaine (dorée) », puis de marbre, de cristal, puis numérotés)
    rang = Math.max(1, Math.floor(rang) || 1);
    const L = PROJETS.length, x = PROJETS[(rang - 1) % L], tour = Math.floor((rang - 1) / L);
    return Object.assign({}, x, { rang, tour, nom: tour ? `${x.nom} (${RENOVES[Math.min(RENOVES.length, tour) - 1]}${tour > RENOVES.length ? ' ' + G.romain(tour - RENOVES.length + 1) : ''})` : x.nom });
  }
  // La règle du SQL (fournil_projets), en JS, pour les tests : UN appel. lignes : la table fournil_projets, [{ rang, cout, actifs, debut,
  // deja, fini, semaine_fin }] (les semaines en nombres : 0, 1, 2…) ; totalDe(w) : le total des points de la semaine w (figé pour une semaine
  // passée, la somme vivante pour la semaine en cours) ; lundi : la semaine de l'appel ; actifs : fournil_projet_actifs(lundi) au moment de
  // l'appel ; fini : la valeur à écrire dans « fini ». Rend { lignes (mises à jour, nouvelles), en_cours, finis, cette_semaine }, comme le SQL.
  function avancerProjets(lignes, totalDe, lundi, actifs, fini) {
    const L = (Array.isArray(lignes) ? lignes : []).map((x) => Object.assign({}, x));
    const ouvrir = (rang, debut, deja) => { if (!L.some((x) => x.rang === rang)) L.push({ rang, cout: coutProjet(rang, actifs), actifs: Math.max(0, Math.floor(actifs) || 0), debut, deja: Math.min(2e9, deja), fini: null, semaine_fin: null }); };
    if (!L.length) ouvrir(1, lundi, 0);
    let p = null, acc = 0, tours = 0;
    for (;;) {
      p = L.filter((x) => x.fini == null).sort((a, b) => a.rang - b.rang)[0] || null;
      if (!p) break;
      acc = 0; let w = p.debut, fin = null;
      while (w <= lundi) {
        const dispo = Math.max(0, Math.max(0, Math.floor(totalDe(w)) || 0) - (w === p.debut ? p.deja : 0));
        if (acc + dispo >= p.cout) { fin = w; break; }
        acc += dispo; w++;
      }
      if (fin === null || tours >= PROJ.tours) break;
      p.fini = fini == null ? true : fini; p.semaine_fin = fin;
      ouvrir(p.rang + 1, fin, (fin === p.debut ? p.deja : 0) + (p.cout - acc));
      tours++;
    }
    const finis = L.filter((x) => x.fini != null).sort((a, b) => a.rang - b.rang).slice(-PROJ.finis).map((x) => ({ rang: x.rang, semaine: x.semaine_fin }));
    const en_cours = p ? { rang: p.rang, cout: p.cout, total: Math.min(acc, p.cout), pourcent: Math.min(99, Math.floor(100 * acc / p.cout)), actifs: p.actifs, depuis: p.debut } : null;
    return { lignes: L.sort((a, b) => a.rang - b.rang), en_cours, finis, cette_semaine: Math.max(0, Math.floor(totalDe(lundi)) || 0) };
  }
  // st.projets : { finis: [{ rang, id, tour, semaine, aide }] (le décor, gardé pour jouer hors ligne), vus: [rang…] (annonce faite),
  //   aides (chantiers où l'on a mis ≥ 30 points la semaine de la fin : trophée « Bâtisseur »), maj (dernière réponse reçue, ms) }
  const projetsNeufs = () => ({ finis: [], vus: [], aides: 0, maj: 0 });
  function projets(st) { // remis d'aplomb ; ne donne rien
    let p = st.projets; if (!objet(p)) p = st.projets = projetsNeufs();
    const vus = new Set();
    p.finis = (Array.isArray(p.finis) ? p.finis : []).filter((x) => objet(x) && Number.isInteger(x.rang) && x.rang >= 1 && x.rang <= 1e5 && !vus.has(x.rang) && vus.add(x.rang))
      .sort((a, b) => a.rang - b.rang).slice(-PROJ.finis)
      .map((x) => { const d = projetDe(x.rang); return { rang: x.rang, id: d.id, tour: d.tour, semaine: JOUR_ISO.test(String(x.semaine)) ? x.semaine : '', aide: !!x.aide }; });
    p.vus = (Array.isArray(p.vus) ? p.vus : []).filter((n, k, a) => Number.isInteger(n) && n >= 1 && a.indexOf(n) === k).slice(-PROJ.finis);
    p.aides = Math.max(entier(p.aides, 0, 1e5, 0), p.finis.filter((x) => x.aide).length); // (les plus anciens peuvent être sortis de la liste)
    p.maj = Number.isFinite(p.maj) && p.maj >= 0 ? p.maj : 0;
    return p;
  }
  // la réponse (nettoyée par le classement) de fournil_projets → rend les chantiers finis à annoncer (pas encore vus) : [{ …projetDe(rang), aide }].
  // Le premier appel (une sauvegarde d'avant ce lot, ou un chantier fini pendant l'absence) : tout ce qui est fini, à annoncer en UNE feuille ;
  // « Bâtisseur » seulement pour une semaine que le téléphone connaît (la semaine en cours, ou les 12 de st.points.semaines).
  function recevoirProjets(st, d) {
    const p = projets(st); if (!objet(d) || !Array.isArray(d.finis)) return [];
    const now = maintenant(st), sem = G.semaineKey(now), hist = (st.points && Array.isArray(st.points.semaines)) ? st.points.semaines : [];
    const pointsDe = (s) => (s === sem ? G.pointsSemaine(st) : ((hist.find((h) => h.semaine === s) || {}).points || 0));
    for (const f of d.finis) {
      if (!objet(f) || !Number.isInteger(f.rang) || f.rang < 1 || f.rang > 1e5 || p.finis.some((x) => x.rang === f.rang)) continue;
      const x = projetDe(f.rang); p.finis.push({ rang: f.rang, id: x.id, tour: x.tour, semaine: JOUR_ISO.test(String(f.semaine)) ? f.semaine : '', aide: false });
    }
    p.finis.sort((a, b) => a.rang - b.rang); p.finis = p.finis.slice(-PROJ.finis);
    for (const x of p.finis) if (!x.aide && x.semaine && pointsDe(x.semaine) >= PROJ.part) { x.aide = true; p.aides++; } // (la semaine en cours : il peut encore y arriver)
    p.maj = now;
    return p.finis.filter((x) => !p.vus.includes(x.rang)).map((x) => Object.assign(projetDe(x.rang), { aide: x.aide, semaine: x.semaine }));
  }
  function voirProjets(st, rangs) { // l'annonce faite (sheetProjetFini) : ces chantiers ne s'annoncent plus
    const p = projets(st); for (const n of (Array.isArray(rangs) ? rangs : [rangs])) if (Number.isInteger(n) && !p.vus.includes(n)) p.vus.push(n);
    p.vus = p.vus.slice(-PROJ.finis); return p.vus.length;
  }
  const projetsNonVus = (st) => { const p = projets(st); return p.finis.filter((x) => !p.vus.includes(x.rang)).map((x) => Object.assign(projetDe(x.rang), { aide: x.aide, semaine: x.semaine })); };
  // ce que la scène pose dehors : les PROJ.decor derniers chantiers finis { id, tour, rang } (tour > 0 : la variante rénovée, une teinte)
  const decorProjets = (st) => { const p = st && st.projets; return (p && Array.isArray(p.finis) ? p.finis : []).filter((x) => objet(x) && Number.isInteger(x.rang)).slice(-PROJ.decor).map((x) => { const d = projetDe(x.rang); return { id: d.id, tour: d.tour, rang: x.rang }; }); };

  // ═══ la sauvegarde : les champs de ce module et leur réparation (appelée par lire, ui.js, après GAME.parcours) ═══════════════════
  function etat(st) { // remet d'aplomb st.second, st.rivales, st.projets (une vieille sauvegarde n'en a aucun) ; ne donne rien, ne paie rien
    second(st); rivales(st); projets(st);
    return st;
  }

  return { SECOND, secondDebloque, second, secondCoche, secondCocher, secondRegler, secondAnnonce, secondVu, achatCle, secondAgir, secondPas, secondDernier,
    RIVALES, RIV, refJoueur, semaineRivales, scoreRivale, rangFinal, rivales, rivalesPas, payerRivales, prixRivale, partSemaine, tableauRivales, photoRivale,
    PROJETS, PROJ, baseProjet, coutProjet, projetDe, avancerProjets, projets, recevoirProjets, voirProjets, projetsNonVus, decorProjets,
    etat };
});
