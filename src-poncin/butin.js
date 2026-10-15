/* OPÉRATION PONCIN — le butin et le coffre personnel. Le mode Extraction s'en sert aujourd'hui ; « Défense de Poncin » et « Raid sur
   les QG robots » s'en serviront ensuite (l'Arène, jamais : elle reste équitable). Module pur (aucun DOM, aucun THREE) : tourne aussi
   dans Node ; le hasard vient d'un rnd() passé en paramètre (mulberry32).
   - Les raretés des coffres (commun, rare, épique, légendaire : gris, bleu, violet, or) et leur contenu (munitions, soins, armure, une
     meilleure arme principale, des objets de valeur aux noms du coin).
   - Le sac d'une partie : des cases ; il porte des objets de valeur (1 à 3 cases) et des consommables ('soin', 'armure', 'munitions' :
     1 case), rangés par leur id (sac.objets = ['montre', 'soin', …]).
   - Le coffre personnel (sauvegarde 'poncin.v2', champ coffre ; format v2 documenté dans src-poncin/ARCHITECTURE.md « Extraction ») :
     les pièces, les objets de valeur gardés (non vendus), le MATÉRIEL ramené (armes réelles avec leur rareté, armures, soins, munitions),
     la collection (tout ce qu'on a déjà trouvé), les achats faits dans le catalogue (aujourd'hui les améliorations de l'Extraction,
     demain les défenses de la base), le record et des compteurs. Toutes les fonctions du coffre sont pures : elles rendent un coffre
     NEUF (lireCoffre de l'entrée, jamais modifiée).
   API :
   RARETES, RARETE[r] = { id, nom, couleur, rang } ; VALEURS[id] = { id, nom, rarete, valeur, cases } ; CONSOMMABLES[id] = { id, nom,
     cases, prix } ; valeur(id) → pièces (0 pour un consommable) ; nomDe(id) ; tirerContenu(rarete, rnd, { armes, special }) → [{ type:
     'valeur', id } | { type: 'munitions' | 'soin' | 'armure' | 'silencieux' | 'cle' } | { type: 'arme', arme, rarete }] (special
     'coffre-fort' : le trésor de la mairie ; 'cle' : la clé du coffre-fort) ;
     raretes(n) → n raretés (les plus rares d'abord) ;
   le sac : sacVide(cases) → { cases, objets } ; place(sac) ; tient(sac, id) ; ajouter(sac, id) → bool ; retirer(sac, i) → id | null ;
     valeurSac(sac), valeurDe(ids), casesDe(ids), consommablesDe(ids) ;
   le coffre : VERSION (2) ; coffreVide() ; lireCoffre(o) → coffre v2 borné (reprend un coffre v1 { pieces, objets }) ;
     deposer(coffre, { objets, materiel, score, extrait, primes, zoneSemaine }, { vendre = true }) → { coffre, gain, record, score } : ce
       qui est sorti d'une partie (objets de valeur vendus contre des pièces, ou gardés avec vendre: false ; primes versées si extrait ;
       +25 % dans la zone de la semaine ; matériel rangé ; collection et record) — une ligne de PEXTRACTION.resultat().extraction.joueurs ;
     lister(coffre, filtre?) → [{ ref, type: 'valeur' | 'arme' | 'armure' | 'soin' | 'munitions', id, arme?, rarete, n, nom, prix }]
       (filtre : un type, ou une fonction) ; prendre(coffre, [{ ref, n }]) → { ok, coffre, pris: [articles] } (sortir pour une partie) ;
       rendre(coffre, articles) → { coffre } (ce qui revient) ; perdre(coffre, articles) → { coffre } (ce qui est tombé : compté) ;
       vendre(coffre, ref, n?) → { ok, coffre, gain } ; prixVente(article) ; depenser(coffre, pieces, motif) → { ok, coffre } ;
     le catalogue : CATALOGUE[nom][id] = { id, nom, texte, prix: [par niveau], effet: [niveau 0, 1, …] } ; ajouterCatalogue(nom, articles) ;
       niveau(coffre, id, catalogue?) ; prix(coffre, id, catalogue?) → pièces du niveau suivant | null ; acheter(coffre, id, catalogue?)
       → { ok, coffre, prix, raison: null | 'inconnue' | 'max' | 'pieces' } (catalogue par défaut : 'extraction') ;
     les améliorations de l'Extraction : AMELIORATIONS (= CATALOGUE.extraction), bornerAmeliorations(a), effets(a) → { cases,
       ouverture, armure, chargeurs } ; POINTS (éliminations) ; score({ valeur, points, primes }) ;
   le calendrier (heure de Paris, pur : règle européenne de l'heure d'été) : jourDeParis(ms) → 'AAAA-MM-JJ' ; semaineDeParis(ms) →
     numéro de la semaine (lundi 0 h) ; zoneDeLaSemaine(ms) → id de zone (rotation parmi ZONES_SEMAINE ; +25 % de pièces : BONUS_SEMAINE) ;
   les contrats du jour : contratsDuJour(ms | 'AAAA-MM-JJ') → 3 contrats { type: 'ramener' (id) | 'sortie' (point) | 'coffres' (rarete,
     n) | 'robots' (n) | 'valeur' (x), texte, but, recompense } ; progression(coffre, ligne, ms) → { coffre, avances: [i] } (l'état du
     jour dans coffre.contrats) ; reclamer(coffre, i, ms) → { ok, coffre, gain }. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PBUTIN = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const fin = (v) => typeof v === 'number' && v - v === 0;
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

  // ─── les raretés (la couleur du coffre et de sa lueur) ───
  const RARETES = ['commun', 'rare', 'epique', 'legendaire'];
  const RARETE = {
    commun: { id: 'commun', nom: 'Commun', couleur: '#A7AEB8', rang: 0 },
    rare: { id: 'rare', nom: 'Rare', couleur: '#4F8DFF', rang: 1 },
    epique: { id: 'epique', nom: 'Épique', couleur: '#A45CFF', rang: 2 },
    legendaire: { id: 'legendaire', nom: 'Légendaire', couleur: '#FFC23D', rang: 3 },
  };
  // la part de chaque rareté parmi les coffres d'une zone (au moins un légendaire)
  const PARTS = { legendaire: 0.07, epique: 0.15, rare: 0.28 };

  // ─── les objets de valeur à ramener (noms du coin ; valeur en pièces ; cases prises dans le sac) ───
  const V = (id, nom, rarete, valeur, cases) => ({ id, nom, rarete, valeur, cases });
  const LISTE = [
    V('cartes', 'Cartes postales du vieux Poncin', 'commun', 10, 1),
    V('cerdon', 'Bouteille de Cerdon', 'commun', 14, 1),
    V('etain', 'Couverts en étain', 'commun', 16, 1),
    V('transistor', 'Vieux transistor', 'commun', 18, 1),
    V('moulin', 'Moulin à café', 'commun', 20, 1),
    V('montre', 'Montre à gousset', 'rare', 45, 1),
    V('appareil', 'Appareil photo argentique', 'rare', 55, 1),
    V('cuivre', 'Bassine en cuivre', 'rare', 50, 2),
    V('pendule', 'Pendule de cheminée', 'rare', 65, 2),
    V('bijoux', 'Coffret à bijoux', 'epique', 120, 1),
    V('jeannette', 'Croix de Savoie en or', 'epique', 140, 1),
    V('ecus', 'Écus de Savoie', 'epique', 130, 1),
    V('statuette', 'Statuette de saint Martin', 'epique', 160, 2),
    V('lingot', 'Lingot d’or', 'legendaire', 320, 2),
    V('calice', 'Calice en vermeil', 'legendaire', 380, 2),
    V('tresor', 'Le trésor de la mairie', 'legendaire', 500, 3),
  ];
  const VALEURS = Object.create(null); for (const v of LISTE) VALEURS[v.id] = v;
  const PAR_RARETE = {}; for (const r of RARETES) PAR_RARETE[r] = LISTE.filter((v) => v.rarete === r && v.id !== 'tresor');
  const valeur = (id) => (own(VALEURS, id) ? VALEURS[id].valeur : 0);

  // ─── le contenu des coffres ───
  // chaque coffre : des objets de valeur (sa rareté, parfois celle d'en dessous), et des consommables ; les rares et mieux, parfois une
  // meilleure principale (rare : fusil ou mitraillette ; épique : fusil, mitraillette, pompe ou fusil de précision ; légendaire : toujours)
  const TABLES = {
    commun: { valeurs: [1, 1], basse: 0.45, conso: [1, 2], arme: 0, classes: [], silencieux: 0 },
    rare: { valeurs: [1, 2], basse: 0.4, conso: [1, 2], arme: 0.25, classes: ['fusil', 'mitraillette'], silencieux: 0.15 },
    epique: { valeurs: [2, 2], basse: 0.35, conso: [1, 2], arme: 0.5, classes: ['fusil', 'mitraillette', 'pompe', 'sniper'], silencieux: 0.3 },
    legendaire: { valeurs: [2, 3], basse: 0.4, conso: [2, 2], arme: 1, classes: ['sniper', 'fusil'], silencieux: 0.4 },
  };
  const CONSOS = ['munitions', 'munitions', 'soin', 'armure']; // les munitions deux fois plus souvent
  const entre = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
  function armesPrincipales(armes) {
    const l = REGLES.armesPermises(Array.isArray(armes) ? armes : null);
    return l.filter((id) => REGLES.arme(id).role === 'principale');
  }
  function tirerContenu(rarete, rnd, o) {
    if (!own(TABLES, rarete)) rarete = 'commun';
    if (typeof rnd !== 'function') rnd = REGLES.mulberry32(1);
    const T = TABLES[rarete], rang = RARETE[rarete].rang, out = [];
    // les objets de valeur
    const nV = entre(rnd, T.valeurs[0], T.valeurs[1]);
    const sp = o && o.special;
    if (sp === 'coffre-fort' || sp === 'mairie') out.push({ type: 'valeur', id: 'tresor' }); // le coffre-fort : le trésor de la mairie
    if (sp === 'cle') out.push({ type: 'cle' });                                            // la clé du coffre-fort
    for (let k = 0; k < nV; k++) {
      const r = rang > 0 && rnd() < T.basse ? RARETES[rang - 1] : rarete, l = PAR_RARETE[r];
      out.push({ type: 'valeur', id: l[Math.floor(rnd() * l.length)].id });
    }
    // une meilleure principale
    if (T.arme > 0 && rnd() < T.arme) {
      const prin = armesPrincipales(o && o.armes), l = prin.filter((id) => T.classes.indexOf(REGLES.arme(id).classe) >= 0), liste = l.length ? l : prin;
      if (liste.length) out.push({ type: 'arme', arme: liste[Math.floor(rnd() * liste.length)], rarete });
    }
    // un silencieux (rare et mieux : il se fixe à l'arme en main)
    if (T.silencieux > 0 && rnd() < T.silencieux) out.push({ type: 'silencieux' });
    // les consommables
    const nC = entre(rnd, T.conso[0], T.conso[1]);
    for (let k = 0; k < nC; k++) out.push({ type: CONSOS[Math.floor(rnd() * CONSOS.length)] });
    return out;
  }
  // n raretés : au moins un légendaire, puis les parts ; les plus rares d'abord
  function raretes(n) {
    n = Math.max(0, Math.round(+n) || 0);
    const nl = n > 0 ? Math.max(1, Math.round(n * PARTS.legendaire)) : 0, ne = Math.round(n * PARTS.epique), nr = Math.round(n * PARTS.rare), out = [];
    for (let k = 0; k < n; k++) out.push(k < nl ? 'legendaire' : k < nl + ne ? 'epique' : k < nl + ne + nr ? 'rare' : 'commun');
    return out;
  }


  // ─── les consommables (dans un coffre, dans le sac, au coffre personnel) ───
  const CONSOMMABLES = {
    soin: { id: 'soin', nom: 'Trousse de soin', cases: 1, prix: 10 },
    armure: { id: 'armure', nom: 'Plaque d’armure', cases: 1, prix: 15 },
    munitions: { id: 'munitions', nom: 'Caisse de munitions', cases: 1, prix: 8 },
  };
  const estConso = (id) => own(CONSOMMABLES, id);
  const nomDe = (id) => (own(VALEURS, id) ? VALEURS[id].nom : estConso(id) ? CONSOMMABLES[id].nom : REGLES.estArme(id) ? REGLES.arme(id).nom : String(id));

  // ─── le sac : des cases ───
  const SAC = { cases: 8, max: 16 };
  const casesDe1 = (id) => (own(VALEURS, id) ? VALEURS[id].cases : estConso(id) ? CONSOMMABLES[id].cases : 1);
  function sacVide(cases) { return { cases: fin(+cases) ? Math.max(1, Math.min(SAC.max, Math.round(+cases))) : SAC.cases, objets: [] }; }
  function casesDe(ids) { let n = 0; for (const id of ids || []) n += casesDe1(id); return n; }
  function valeurDe(ids) { let n = 0; for (const id of ids || []) n += valeur(id); return n; }
  const consommablesDe = (ids) => (ids || []).filter(estConso);
  const place = (sac) => (sac ? sac.cases - casesDe(sac.objets) : 0);
  const tient = (sac, id) => !!sac && (own(VALEURS, id) || estConso(id)) && casesDe1(id) <= place(sac);
  function ajouter(sac, id) { if (!tient(sac, id)) return false; sac.objets.push(id); return true; }
  function retirer(sac, i) { if (!sac || !(i >= 0 && i < sac.objets.length)) return null; return sac.objets.splice(i | 0, 1)[0]; }
  const valeurSac = (sac) => (sac ? valeurDe(sac.objets) : 0);

  // ─── le catalogue : ce qu'on achète avec les pièces (extensible : ajouterCatalogue('defense', { … }) pour la base) ───
  const CATALOGUE = {
    extraction: { // les améliorations permanentes de l'Extraction (jamais en Arène)
      sac: { id: 'sac', nom: 'Sac plus grand', texte: '+2 cases par niveau', prix: [150, 400, 900], effet: [0, 2, 4, 6] },
      ouverture: { id: 'ouverture', nom: 'Ouverture plus rapide', texte: 'les coffres s’ouvrent plus vite', prix: [120, 350, 800], effet: [1.2, 1.0, 0.85, 0.7] },
      armure: { id: 'armure', nom: 'Armure de départ', texte: 'on part avec de l’armure', prix: [200, 500, 1000], effet: [0, 15, 30, 50] },
      chargeur: { id: 'chargeur', nom: 'Deuxième chargeur', texte: 'un chargeur de plus en réserve pour chaque arme', prix: [250], effet: [0, 1] },
    },
  };
  const NOM_CATALOGUE = /^[a-z][a-z0-9-]{0,23}$/;
  // un catalogue de plus (ou des articles de plus) : { id: { nom, texte, prix: [par niveau], effet: [niveau 0, 1, …] } } ; rend le catalogue
  function ajouterCatalogue(nom, articles) {
    if (!NOM_CATALOGUE.test(nom) || !articles || typeof articles !== 'object') return null;
    const c = own(CATALOGUE, nom) ? CATALOGUE[nom] : (CATALOGUE[nom] = {});
    for (const id of Object.keys(articles)) {
      const a = articles[id]; if (!NOM_CATALOGUE.test(id) || !a || !Array.isArray(a.prix) || !a.prix.every((x) => fin(x) && x >= 0)) continue;
      c[id] = { id, nom: String(a.nom || id), texte: String(a.texte || ''), prix: a.prix.slice(), effet: Array.isArray(a.effet) ? a.effet.slice() : a.prix.map((x, i) => i).concat(a.prix.length) };
    }
    return c;
  }
  const AMELIORATIONS = CATALOGUE.extraction;
  const IDS_AMELIORATIONS = Object.keys(AMELIORATIONS);
  function bornerAmeliorations(a) {
    const out = {};
    for (const id of IDS_AMELIORATIONS) { const v = a && typeof a === 'object' ? Math.round(+a[id]) : 0; out[id] = fin(v) ? Math.max(0, Math.min(AMELIORATIONS[id].prix.length, v)) : 0; }
    return out;
  }
  // les effets d'un jeu d'améliorations : cases du sac, durée d'ouverture d'un coffre (s), armure de départ, chargeurs en plus
  function effets(a) {
    const b = bornerAmeliorations(a), A = AMELIORATIONS;
    return { cases: SAC.cases + A.sac.effet[b.sac], ouverture: A.ouverture.effet[b.ouverture], armure: A.armure.effet[b.armure], chargeurs: A.chargeur.effet[b.chargeur] };
  }

  // ─── le score d'une partie : la valeur extraite, plus les éliminations ───
  const POINTS = { gardien: 10, joueur: 25 };
  const score = (r) => Math.max(0, Math.round((r && fin(+r.valeur) ? +r.valeur : 0) + (r && fin(+r.points) ? +r.points : 0) + (r && fin(+r.primes) ? +r.primes : 0)));

  // ─── le calendrier de Paris (pur : UTC+1, UTC+2 du dernier dimanche de mars au dernier dimanche d'octobre, à 1 h UTC) ───
  function dernierDimanche(an, mois) { const d = new Date(Date.UTC(an, mois + 1, 0)); return Date.UTC(an, mois, d.getUTCDate() - d.getUTCDay(), 1); }
  function decalageParis(ms) { const an = new Date(ms).getUTCFullYear(); return ms >= dernierDimanche(an, 2) && ms < dernierDimanche(an, 9) ? 2 : 1; }
  const jourLocal = (ms) => Math.floor((ms + decalageParis(ms) * 3600000) / 86400000); // jours depuis le 1er janvier 1970, à Paris
  const msDe = (ms) => (fin(+ms) ? +ms : ms instanceof Date ? ms.getTime() : 0);
  function jourDeParis(ms) { const d = new Date(jourLocal(msDe(ms)) * 86400000); return d.toISOString().slice(0, 10); }
  const semaineDeParis = (ms) => Math.floor((jourLocal(msDe(ms)) - 4) / 7); // le 5 janvier 1970 était un lundi
  const ZONES_SEMAINE = ['bourg', 'rivieres', 'tout', 'centre'], BONUS_SEMAINE = 0.25;
  function zoneDeLaSemaine(ms) { const s = semaineDeParis(ms), n = ZONES_SEMAINE.length; return ZONES_SEMAINE[((s % n) + n) % n]; } // une rotation : chaque zone revient toutes les 4 semaines

  // ─── les contrats du jour (3, tirés de la date de Paris) ───
  const TYPES_CONTRATS = ['ramener', 'sortie', 'coffres', 'robots', 'valeur'];
  function contratsDuJour(quand) {
    const jour = typeof quand === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(quand) ? quand : jourDeParis(quand), rnd = REGLES.mulberry32(REGLES.hash('contrats ' + jour));
    const types = TYPES_CONTRATS.slice(); for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = types[i]; types[i] = types[j]; types[j] = t; }
    return types.slice(0, 3).map((type) => {
      if (type === 'ramener') { const l = LISTE.filter((v) => v.rarete === 'rare' || v.rarete === 'epique'), v = l[Math.floor(rnd() * l.length)]; return { type, id: v.id, but: 1, recompense: v.rarete === 'epique' ? 150 : 100, texte: `Ramener : ${v.nom}` }; }
      if (type === 'sortie') { const pt = rnd() < 0.5 ? 'pont' : 'cale'; return { type, point: pt, but: 1, recompense: 60, texte: pt === 'pont' ? 'Sortir par le pont' : 'Sortir par la cale de la rivière' }; }
      if (type === 'coffres') { const ep = rnd() < 0.4, n = ep ? 2 + Math.floor(rnd() * 2) : 4 + Math.floor(rnd() * 3); return { type, rarete: ep ? 'epique' : 'rare', n, but: n, recompense: ep ? 110 : 80, texte: `Ouvrir ${n} coffres ${ep ? 'épiques' : 'rares'} (ou mieux)` }; }
      if (type === 'robots') { const n = 5 + Math.floor(rnd() * 6); return { type, n, but: n, recompense: 50 + 6 * n, texte: `Éliminer ${n} robots` }; }
      const x = 150 + 50 * Math.floor(rnd() * 6); return { type: 'valeur', x, but: 1, recompense: Math.round(x * 0.4), texte: `Sortir avec au moins ${x} pièces de valeur` };
    });
  }
  // l'état des contrats du coffre, remis à neuf s'il n'est pas d'aujourd'hui
  function contratsDe(c, jour) {
    if (!c.contrats || c.contrats.jour !== jour) c.contrats = { jour, etats: contratsDuJour(jour).map(() => ({ prog: 0, fait: false, reclame: false })) };
    return c.contrats;
  }
  // une partie jouée (une ligne de PEXTRACTION.resultat().extraction.joueurs) fait avancer les contrats du jour
  function progression(coffre, r, quand) {
    const c = lireCoffre(coffre), jour = jourDeParis(quand), defs = contratsDuJour(jour), et = contratsDe(c, jour).etats, avances = [];
    if (!r || typeof r !== 'object') return { coffre: c, avances };
    const ids = Array.isArray(r.objets) ? r.objets : [], cp = r.coffresPar && typeof r.coffresPar === 'object' ? r.coffresPar : {};
    defs.forEach((d, i) => {
      const e = et[i]; if (!e || e.fait) return;
      let v = 0;
      if (d.type === 'ramener') v = r.extrait && ids.indexOf(d.id) >= 0 ? 1 : 0;
      else if (d.type === 'sortie') v = r.extrait && r.point === d.point ? 1 : 0;
      else if (d.type === 'valeur') v = r.extrait && +r.valeur >= d.x ? 1 : 0;
      else if (d.type === 'coffres') { for (const k of RARETES) if (RARETE[k].rang >= RARETE[d.rarete].rang) v += entier(cp[k], 999); }
      else if (d.type === 'robots') v = entier(r.killsRobots, 999);
      if (v > 0) { e.prog = Math.min(d.but, e.prog + v); if (e.prog >= d.but) e.fait = true; avances.push(i); }
    });
    return { coffre: c, avances };
  }
  function reclamer(coffre, i, quand) {
    const c = lireCoffre(coffre), jour = jourDeParis(quand), defs = contratsDuJour(jour), et = contratsDe(c, jour).etats, e = et[i];
    if (!e || !e.fait || e.reclame) return { ok: false, coffre: c, gain: 0 };
    e.reclame = true; c.pieces = Math.min(MAX_PIECES, c.pieces + defs[i].recompense);
    return { ok: true, coffre: c, gain: defs[i].recompense };
  }

  // ─── le coffre personnel (format v2) ───
  // { v: 2, pieces, objets: [{ id, n }] (objets de valeur gardés), materiel: [{ ref, type: 'arme' | 'armure' | 'soin' | 'munitions',
  //   arme? (id réel), rarete, n }] (une arme par entrée, n = 1 ; les consommables empilés par type), collection: [{ id, n }] (déjà
  //   trouvés), achats: { catalogue: { id: niveau } }, ameliorations (= achats.extraction, bornées), record, parties, extractions,
  //   perdus (articles perdus en partie), suivant (le prochain numéro de ref) }
  const VERSION = 2, MAX_PIECES = 1e9, MAX_MATERIEL = 200, MAX_N = 9999;
  const TYPES_MATERIEL = ['arme', 'armure', 'soin', 'munitions'];
  const PRIX_ARME = { commun: 20, rare: 40, epique: 80, legendaire: 150 };
  const entier = (v, max) => (fin(+v) ? Math.max(0, Math.min(max || MAX_PIECES, Math.floor(+v))) : 0);
  function coffreVide() {
    return { v: VERSION, pieces: 0, objets: [], materiel: [], collection: [], achats: { extraction: bornerAmeliorations(null) }, ameliorations: bornerAmeliorations(null),
      record: 0, parties: 0, extractions: 0, perdus: 0, suivant: 1, contrats: null };
  }
  const empiler = (l, id, n) => { const x = l.find((y) => y.id === id); if (x) x.n = Math.min(MAX_N, x.n + n); else l.push({ id, n: Math.min(MAX_N, n) }); };
  const rangValeur = (a, b) => RARETE[VALEURS[b.id].rarete].rang - RARETE[VALEURS[a.id].rarete].rang || VALEURS[b.id].valeur - VALEURS[a.id].valeur || (a.id < b.id ? -1 : 1);
  // un article de matériel valide (ou null) : { type, arme?, rarete, n }
  function lireArticle(m) {
    if (!m || typeof m !== 'object' || TYPES_MATERIEL.indexOf(m.type) < 0) return null;
    const rarete = own(RARETE, m.rarete) ? m.rarete : 'commun';
    if (m.type === 'arme') return REGLES.estArme(m.arme) ? { type: 'arme', arme: m.arme, rarete, n: 1 } : null;
    const n = m.n == null ? 1 : entier(m.n, MAX_N); return n > 0 ? { type: m.type, rarete: 'commun', n } : null;
  }
  // ranger un article dans le matériel (les consommables s'empilent)
  function ranger(c, a) {
    if (a.type !== 'arme') { const x = c.materiel.find((y) => y.type === a.type); if (x) { x.n = Math.min(MAX_N, x.n + a.n); return; } }
    if (c.materiel.length >= MAX_MATERIEL) return;
    const m = { ref: 'm' + c.suivant++, type: a.type, rarete: a.rarete, n: a.n }; if (a.type === 'arme') m.arme = a.arme;
    c.materiel.push(m);
  }
  // la copie bornée de ce qu'on a lu (localStorage) ; un coffre v1 ({ pieces, objets, ameliorations, record… }) est repris tel quel
  function lireCoffre(o) {
    const c = coffreVide(); if (!o || typeof o !== 'object') return c;
    c.pieces = entier(o.pieces); c.record = entier(o.record); c.parties = entier(o.parties); c.extractions = entier(o.extractions); c.perdus = entier(o.perdus);
    c.suivant = Math.max(1, entier(o.suivant));
    const achats = o.achats && typeof o.achats === 'object' ? o.achats : {};
    for (const nom of Object.keys(CATALOGUE)) {
      const a = achats[nom] && typeof achats[nom] === 'object' ? achats[nom] : nom === 'extraction' ? o.ameliorations : null, out = {};
      for (const id of Object.keys(CATALOGUE[nom])) { const v = a ? Math.round(+a[id]) : 0; out[id] = fin(v) ? Math.max(0, Math.min(CATALOGUE[nom][id].prix.length, v)) : 0; }
      c.achats[nom] = out;
    }
    for (const nom of Object.keys(achats)) if (!own(c.achats, nom) && NOM_CATALOGUE.test(nom) && achats[nom] && typeof achats[nom] === 'object') { // un catalogue pas encore chargé : gardé tel quel (borné)
      const out = {}; for (const id of Object.keys(achats[nom]).slice(0, 50)) if (NOM_CATALOGUE.test(id)) out[id] = entier(achats[nom][id], 99); c.achats[nom] = out;
    }
    c.ameliorations = Object.assign({}, c.achats.extraction);
    const v1 = !(o.v >= 2), garder = Array.isArray(o.objets) ? o.objets : [];
    for (const x of garder) if (x && own(VALEURS, x.id) && entier(x.n, MAX_N) > 0) empiler(v1 ? c.collection : c.objets, x.id, entier(x.n, MAX_N)); // v1 : les objets étaient déjà vendus
    if (Array.isArray(o.collection)) for (const x of o.collection) if (x && own(VALEURS, x.id) && entier(x.n, MAX_N) > 0) empiler(c.collection, x.id, entier(x.n, MAX_N));
    c.objets.sort(rangValeur); c.collection.sort(rangValeur);
    const refs = new Set();
    if (Array.isArray(o.materiel)) for (const m of o.materiel) {
      const a = lireArticle(m); if (!a) continue;
      const ref = typeof m.ref === 'string' && /^m\d{1,9}$/.test(m.ref) && !refs.has(m.ref) ? m.ref : null;
      if (ref) { const k = +ref.slice(1); if (k >= c.suivant) c.suivant = k + 1; }
      if (a.type !== 'arme' && c.materiel.some((y) => y.type === a.type)) { ranger(c, a); continue; }
      if (c.materiel.length >= MAX_MATERIEL) continue;
      const mm = { ref: ref || '', type: a.type, rarete: a.rarete, n: a.n }; if (a.type === 'arme') mm.arme = a.arme;
      if (ref) refs.add(ref); c.materiel.push(mm);
    }
    for (const m of c.materiel) if (!m.ref) m.ref = 'm' + c.suivant++;
    const ct = o.contrats; // l'état des contrats du jour (repris tel quel s'il est bien formé)
    if (ct && typeof ct.jour === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ct.jour) && Array.isArray(ct.etats) && ct.etats.length === 3) {
      const defs = contratsDuJour(ct.jour);
      c.contrats = { jour: ct.jour, etats: ct.etats.map((e, i) => { const p = Math.min(defs[i].but, entier(e && e.prog, 999)); return { prog: p, fait: p >= defs[i].but, reclame: !!(e && e.reclame) && p >= defs[i].but }; }) };
    }
    return c;
  }
  // déposer ce qui est sorti d'une partie : r = { objets: [ids du sac : objets de valeur et consommables], materiel: [{ type, arme?,
  // rarete, n? }], score, extrait } ; les objets de valeur sont vendus (vendre: true, le défaut) ou gardés ; la collection et le record
  function deposer(coffre, r, o) {
    const c = lireCoffre(coffre), vendreV = !(o && o.vendre === false);
    const ids = r && Array.isArray(r.objets) ? r.objets : [], valeurs = ids.filter((id) => own(VALEURS, id));
    let gain = 0;
    for (const id of valeurs) { empiler(c.collection, id, 1); if (vendreV) gain += VALEURS[id].valeur; else empiler(c.objets, id, 1); }
    if (r && r.extrait && fin(+r.primes) && r.primes > 0) gain += Math.min(10000, Math.round(+r.primes)); // les primes : versées seulement si l'on est sorti
    if (r && r.zoneSemaine && gain > 0) gain = Math.round(gain * (1 + BONUS_SEMAINE));                // la zone de la semaine : +25 %
    for (const id of ids) if (estConso(id)) ranger(c, { type: id, rarete: 'commun', n: 1 });
    if (r && Array.isArray(r.materiel)) for (const m of r.materiel) { const a = lireArticle(m); if (a) ranger(c, a); }
    c.pieces = Math.min(MAX_PIECES, c.pieces + gain); c.parties++; if (r && r.extrait) c.extractions++;
    c.objets.sort(rangValeur); c.collection.sort(rangValeur);
    const s = r && fin(+r.score) ? Math.max(0, Math.round(+r.score)) : valeurDe(valeurs), record = s > c.record;
    if (record) c.record = s;
    return { coffre: c, gain, record, score: s };
  }
  function prixVente(a) {
    if (!a) return 0;
    if (a.type === 'valeur') return valeur(a.id);
    if (a.type === 'arme') return PRIX_ARME[a.rarete] || PRIX_ARME.commun;
    return estConso(a.type) ? CONSOMMABLES[a.type].prix : 0;
  }
  // la liste du coffre (objets de valeur gardés, puis matériel) ; ref : 'v:<id>' pour un objet de valeur, 'm<n>' pour le matériel
  function lister(coffre, filtre) {
    const c = lireCoffre(coffre), out = [];
    for (const x of c.objets) out.push({ ref: 'v:' + x.id, type: 'valeur', id: x.id, rarete: VALEURS[x.id].rarete, n: x.n, nom: VALEURS[x.id].nom, prix: VALEURS[x.id].valeur });
    for (const m of c.materiel) {
      const a = { ref: m.ref, type: m.type, id: m.type === 'arme' ? m.arme : m.type, rarete: m.rarete, n: m.n, nom: nomDe(m.type === 'arme' ? m.arme : m.type) };
      if (m.type === 'arme') a.arme = m.arme; a.prix = prixVente(a); out.push(a);
    }
    return typeof filtre === 'function' ? out.filter(filtre) : typeof filtre === 'string' ? out.filter((a) => a.type === filtre) : out;
  }
  // retirer n exemplaires d'une ref ; rend l'article retiré (ou null)
  function oter(c, ref, n) {
    n = n == null ? 1 : entier(n, MAX_N); if (n <= 0 || typeof ref !== 'string') return null;
    if (ref.slice(0, 2) === 'v:') {
      const id = ref.slice(2), x = c.objets.find((y) => y.id === id); if (!x || x.n < n) return null;
      x.n -= n; if (!x.n) c.objets.splice(c.objets.indexOf(x), 1);
      return { type: 'valeur', id, rarete: VALEURS[id].rarete, n };
    }
    const i = c.materiel.findIndex((m) => m.ref === ref); if (i < 0) return null;
    const m = c.materiel[i]; if (m.n < n) return null;
    m.n -= n; if (!m.n) c.materiel.splice(i, 1);
    const a = { type: m.type, rarete: m.rarete, n, ref: m.ref }; if (m.type === 'arme') a.arme = m.arme;
    return a;
  }
  // sortir du coffre pour une partie (tout ou rien) : demandes = [{ ref, n? }] → pris = [articles { type, id? | arme?, rarete, n, ref }]
  function prendre(coffre, demandes) {
    const c = lireCoffre(coffre), pris = [];
    for (const d of Array.isArray(demandes) ? demandes : []) { const a = oter(c, d && d.ref, d && d.n); if (!a) return { ok: false, coffre: lireCoffre(coffre), pris: [] }; pris.push(a); }
    return { ok: true, coffre: c, pris };
  }
  // ce qui revient d'une partie (des articles pris, ou trouvés) : rangé de nouveau
  function rendre(coffre, articles) {
    const c = lireCoffre(coffre);
    for (const a of Array.isArray(articles) ? articles : []) {
      if (a && a.type === 'valeur' && own(VALEURS, a.id)) empiler(c.objets, a.id, Math.max(1, entier(a.n == null ? 1 : a.n, MAX_N)));
      else { const b = lireArticle(a); if (b) ranger(c, b); }
    }
    c.objets.sort(rangValeur);
    return { coffre: c };
  }
  // ce qui est tombé en partie (déjà sorti du coffre par prendre) : seulement compté
  function perdre(coffre, articles) {
    const c = lireCoffre(coffre); let n = 0;
    for (const a of Array.isArray(articles) ? articles : []) if (a && typeof a === 'object') n += a.type === 'arme' ? 1 : Math.max(1, entier(a.n == null ? 1 : a.n, MAX_N));
    c.perdus = entier(c.perdus + n); return { coffre: c, n };
  }
  function vendre(coffre, ref, n) {
    const c = lireCoffre(coffre), a = oter(c, ref, n);
    if (!a) return { ok: false, coffre: lireCoffre(coffre), gain: 0 };
    const gain = prixVente(a) * (a.type === 'arme' ? 1 : a.n);
    c.pieces = Math.min(MAX_PIECES, c.pieces + gain);
    return { ok: true, coffre: c, gain };
  }
  function depenser(coffre, pieces, motif) {
    const c = lireCoffre(coffre), p = entier(pieces);
    if (!(fin(+pieces) && +pieces >= 0) || c.pieces < p) return { ok: false, coffre: c, motif: motif || null };
    c.pieces -= p; return { ok: true, coffre: c, motif: motif || null };
  }
  const cat = (nom) => (typeof nom === 'string' && own(CATALOGUE, nom) ? nom : 'extraction');
  function niveau(coffre, id, catalogue) { const c = lireCoffre(coffre), n = cat(catalogue); return own(CATALOGUE[n], id) ? c.achats[n][id] | 0 : 0; }
  function prix(coffre, id, catalogue) {
    const n = cat(catalogue); if (!own(CATALOGUE[n], id)) return null;
    const niv = niveau(coffre, id, n), P = CATALOGUE[n][id].prix;
    return niv < P.length ? P[niv] : null;
  }
  function acheter(coffre, id, catalogue) {
    const c = lireCoffre(coffre), n = cat(catalogue);
    if (!own(CATALOGUE[n], id)) return { ok: false, coffre: c, prix: null, raison: 'inconnue' };
    const p = prix(c, id, n);
    if (p == null) return { ok: false, coffre: c, prix: null, raison: 'max' };
    if (c.pieces < p) return { ok: false, coffre: c, prix: p, raison: 'pieces' };
    c.pieces -= p; c.achats[n][id] = (c.achats[n][id] | 0) + 1; c.ameliorations = Object.assign({}, c.achats.extraction);
    return { ok: true, coffre: c, prix: p, raison: null };
  }

  return {
    RARETES, RARETE, PARTS, VALEURS, LISTE, CONSOMMABLES, TABLES, valeur, nomDe, tirerContenu, raretes, armesPrincipales,
    SAC, sacVide, casesDe, valeurDe, consommablesDe, place, tient, ajouter, retirer, valeurSac,
    CATALOGUE, ajouterCatalogue, AMELIORATIONS, IDS_AMELIORATIONS, bornerAmeliorations, effets, POINTS, score,
    jourDeParis, semaineDeParis, zoneDeLaSemaine, ZONES_SEMAINE, BONUS_SEMAINE, TYPES_CONTRATS, contratsDuJour, progression, reclamer,
    VERSION, TYPES_MATERIEL, PRIX_ARME, coffreVide, lireCoffre, deposer, lister, prendre, rendre, perdre, vendre, prixVente, depenser, niveau, prix, acheter,
  };
});
