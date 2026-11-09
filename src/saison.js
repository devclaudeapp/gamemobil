/* LE FOURNIL — les saisons gratuites (docs/marche-contrat.md § 7) : le moteur générique de la « piste », sans DOM ni game.js (tourne aussi
   dans Node : test/fournil-saison.test.js). Une saison a une fiche (src/saison-automne.js, puis src/saison-hiver.js…) : ses dates, ses
   sources d'XP, ses crans (une récompense à vie chacun) et son titre. L'état vit dans st.piste (PAS st.saison, qui est la recette de saison
   de la boulangerie, ni G.SAISON) :
     st.piste = { v: 1, id: 'automne-2026', xp: 0, recus: 0, titre: 0,
                  j: { d: 'AAAA-MM-JJ', o, c, k, s, p },   les marqueurs du jour de Paris d : objectifs, journée, casino, série, paliers comptés
                  sem: '', veille: '', ev: { marche: 0 },  le défi déjà compté (clé de semaine), le dernier jour à objectif, les paliers comptés
                  passees: {},                             les saisons finies : { 'automne-2026': { xp, crans, titre } }
                  dus: null }                              la fin d'une saison, pas encore montrée : { id, nom, lots, xp, crans, titre } (finDue)
   recus : le masque des crans REÇUS (bit k − 1 = cran k) ; titre : 1 quand le titre de la saison est reçu.

   L'XP se compte PAR CONSTAT (pas(st, now, ctx), une fois par seconde par l'écran, et dans les simulations) : l'état du jeu est comparé aux
   marqueurs, ce qui est nouveau est crédité une seule fois, plafonné par jour (de Paris) ou par semaine ; jamais de pari, jamais d'argent ni
   de temps passé. Les sources (SOURCES, recopiées dans la fiche) :
     objectif  un objectif du jour réclamé (st.jour.objectifs[k].reclame)                  5 XP, 3 par jour
     journee   les trois du jour réclamés (st.jour.etoileDonnee)                           10 XP, 1 par jour
     defi      le défi de la semaine réclamé (st.semaine.reclame ; la clé de semaine)      75 XP, 1 par semaine
     serie     un jour DE SUITE dans la série : le classement (ctx.serie : { aujourdhui, jours ≥ 2 }, resume().serie) ; sans classement, un
               objectif du jour réclamé aujourd'hui ET hier (st.piste.veille)              10 XP, 1 par jour
     palier    un palier d'événement franchi et reçu (st[cle].paliers ; les clés : fiche.evenements, 'marche' en automne)   20 XP, sans plafond
     casino    un mini-objectif de l'arrière-salle réussi (st.arriere.casino.objectifs[k].fait, du jour)                    5 XP, 3 par jour
   Le premier pas d'une saison (la piste créée) compte ce qui est DÉJÀ réclamé (même règle pour tous, généreux : les objectifs du jour, le
   défi de la semaine, les paliers reçus ; comme outils/marche/saison.js, qui a réglé la piste) ; une saison qui enchaîne sur une autre
   garde le défi déjà compté ; une `j` abîmée repart avec les compteurs du moment (rien n'est compté deux fois).

   La piste : fiche.crans (une récompense par cran : { etoiles, boost: { mult, secs }, deco, vetement, trophee }), fiche.xpCran XP chacun ;
   le titre (fiche.titre : { xp, distinction }) fiche.titre.xp XP après le dernier. Un cran atteint et pas reçu est « à recevoir » pour
   toujours (aRecevoir) ; recevoir(st, n) le marque et rend son lot, que l'écran DISTRIBUE (verser(st, lot, G) le fait avec GAME : les
   étoiles, le boost dans la réserve, le vêtement, la distinction ; une déco ou le trophée n'ont rien à verser : possede(st, id) les lit
   sur la piste). Le titre se reçoit comme un cran de plus : n = crans.length + 1.

   La fin (fin(st, now), appelée par etat et pas) : au premier passage après la fin de sa saison (ou un id inconnu), les crans atteints et
   pas reçus (et le titre) sont donnés d'office : leur lot est rangé dans st.piste.dus (l'écran le DISTRIBUE et le montre : « La saison
   d'automne est finie : voici ce qui t'attendait », puis recevoirFin(st)) ; la saison rejoint passees, st.piste repart pour la saison
   active, ou id: '' s'il n'y en a pas. Une sauvegarde sans st.piste n'a rien avant le début d'une saison (rien n'est créé) ; pendant, elle
   est créée au premier passage ; après, rien (elle n'a pas joué). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SAISONS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── l'heure de Paris (la même règle que game.js, hantee.js, marche.js) ───
  function decalageParis(ms) {
    const a = new Date(ms).getUTCFullYear();
    const dernierDimanche = (mois) => { const d = new Date(Date.UTC(a, mois + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
    return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 * 3600e3 : 3600e3;
  }
  const paris = (ms) => new Date(ms + decalageParis(ms));
  function parisMs(a, m, j, h) { let t = Date.UTC(a, m - 1, j, h) - 3600e3; t = Date.UTC(a, m - 1, j, h) - decalageParis(t); return Date.UTC(a, m - 1, j, h) - decalageParis(t); }
  const dayKey = (ms) => { const d = paris(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
  const veilleDe = (jour) => new Date(Date.parse(jour + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
  const JOUR_OK = /^\d{4}-\d{2}-\d{2}$/;

  // ─── les sources d'XP (docs/marche-contrat.md § 7.2) : les mêmes pour toutes les saisons, sauf si une fiche les change ───
  const SOURCES = Object.freeze({
    objectif: Object.freeze({ xp: 5, parJour: 3, nom: 'Objectifs du jour', txt: 'un objectif du jour réclamé' }),
    journee: Object.freeze({ xp: 10, parJour: 1, nom: 'Journée complète', txt: 'les trois objectifs du jour réclamés' }),
    defi: Object.freeze({ xp: 75, parSemaine: 1, nom: 'Défi de la semaine', txt: 'le défi de la semaine réclamé' }),
    serie: Object.freeze({ xp: 10, parJour: 1, nom: 'Série', txt: 'un jour de plus dans ta série' }),
    palier: Object.freeze({ xp: 20, nom: 'Paliers d’événement', txt: 'un palier d’événement franchi' }),
    casino: Object.freeze({ xp: 5, parJour: 3, nom: 'Arrière-salle', txt: 'un mini-objectif de l’arrière-salle réussi' }),
  });
  const ORDRE = ['objectif', 'journee', 'defi', 'serie', 'palier', 'casino'];

  // ─── les fiches ───
  const FICHES = [];
  function ajouter(f) { // une saison : { id, nom, debut, fin, sources, crans, xpCran, titre: { xp, distinction }, evenements, couleurs, textes }
    if (!f || typeof f.id !== 'string' || !f.id || !Number.isFinite(f.debut) || !Number.isFinite(f.fin) || !(f.fin > f.debut) || !Array.isArray(f.crans) || !f.crans.length || !(f.xpCran > 0)) throw new Error('SAISONS.ajouter : fiche invalide');
    if (f.crans.length > 50) throw new Error('SAISONS.ajouter : 50 crans au plus (le masque des reçus)');
    if (FICHES.some((x) => x.id === f.id)) return fiche(f.id);
    if (FICHES.some((x) => f.debut < x.fin && x.debut < f.fin)) throw new Error('SAISONS.ajouter : deux saisons se chevauchent');
    const F = Object.assign({ sources: SOURCES, evenements: [], titre: null, couleurs: {}, textes: {} }, f);
    F.crans = f.crans.map((c, k) => Object.freeze(Object.assign({}, c, { n: k + 1 })));
    F.xpTitre = F.titre && F.titre.xp > 0 ? F.crans.length * F.xpCran + F.titre.xp : Infinity; // le titre : après le dernier cran
    FICHES.push(F); FICHES.sort((a, b) => a.debut - b.debut);
    return F;
  }
  const fiche = (id) => FICHES.find((f) => f.id === id) || null;
  const active = (now) => (Number.isFinite(now) ? FICHES.find((f) => f.debut <= now && now < f.fin) || null : null); // la saison du moment (une seule : jamais deux en même temps)

  // ─── l'état ───
  const entier = (x) => typeof x === 'number' && Number.isInteger(x) && x >= 0;
  const objet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const jVide = (d) => ({ d, o: 0, c: 0, k: 0, s: 0, p: 0, a: 0 }); // a : les ouvertures d'un lecteur du jour (l'Avent)
  function neuve(id, passees) { return { v: 1, id: id || '', xp: 0, recus: 0, titre: 0, j: jVide(''), sem: '', veille: '', ev: {}, passees: passees || {}, dus: null }; }
  // la piste d'une saison qui s'ouvre (ou créée pendant) : ce qui est déjà réclamé comptera au premier pas, la même règle pour tous (j vide :
  // les objectifs du jour ; ev à 0 : les paliers reçus ; sem vide : le défi de cette semaine, comme outils/marche/saison.js, qui a réglé la
  // piste) ; sem : celui de la saison d'avant, quand l'une enchaîne sur l'autre (le défi de la même semaine ne compte pas deux fois)
  function ouvrir(st, F, now, passees, dus, sem) {
    const n = neuve(F.id, passees); n.dus = dus || null; n.j = jVide(dayKey(now)); for (const cle of F.evenements) n.ev[cle] = 0; for (const cle of Object.keys(F.lecteurs || {})) n.ev[cle] = 0;
    n.sem = typeof sem === 'string' ? sem : ''; return n;
  }
  // ce que le jeu montre en ce moment (pour remettre d'aplomb sans rien compter deux fois)
  function constats(st, now, F) {
    const auj = dayKey(now), jr = objet(st.jour) && st.jour.date === auj && Array.isArray(st.jour.objectifs) ? st.jour : null;
    const o = jr ? jr.objectifs.filter((x) => x && x.reclame === true).length : 0, c = jr && jr.etoileDonnee === true ? 1 : 0;
    const ca = objet(st.arriere) && objet(st.arriere.casino) ? st.arriere.casino : null;
    const k = ca && Array.isArray(ca.objectifs) && (typeof ca.jour !== 'string' || ca.jour === auj || ca.jour === '') ? ca.objectifs.filter((x) => x && x.fait === true).length : 0;
    const sm = objet(st.semaine) && typeof st.semaine.key === 'string' ? st.semaine : null;
    const ev = {}; for (const cle of (F ? F.evenements : [])) ev[cle] = paliersDe(st, cle); for (const [cle, f] of Object.entries((F && F.lecteurs) || {})) ev[cle] = lireCompteur(f, st);
    return { auj, o, c, k, sem: sm && sm.reclame === true ? sm.key : null, ev };
  }
  function lireCompteur(f, st) { let n = 0; try { n = f(st); } catch (e) { n = 0; } return entier(n) ? n : 0; } // un lecteur (fiche.lecteurs) qui jette ou rend autre chose qu’un entier ≥ 0 : 0
  function paliersDe(st, cle) { const q = st[cle]; return objet(q) && Array.isArray(q.paliers) ? new Set(q.paliers.filter((n) => Number.isInteger(n) && n >= 1 && n <= 99)).size : 0; }
  function nettoyerPassees(p) {
    const o = {}; if (!objet(p)) return o;
    for (const [id, x] of Object.entries(p)) if (typeof id === 'string' && id && objet(x)) o[id] = { xp: Number.isFinite(x.xp) && x.xp >= 0 ? Math.floor(x.xp) : 0, crans: entier(x.crans) ? Math.min(x.crans, 50) : 0, titre: x.titre ? 1 : 0 };
    return o;
  }
  function reparer(st, now) { // remet st.piste d'aplomb (jamais d'exception) ; rend st.piste, ou null (rien et pas de saison : rien n'est créé)
    let p = st.piste;
    const F = active(now);
    if (p === undefined) { if (!F) return null; return (st.piste = ouvrir(st, F, now)); } // créée pendant la saison (une vieille sauvegarde, un nouveau joueur)
    if (!objet(p)) { p = st.piste = neuve(F ? F.id : ''); if (F) { const c = constats(st, now, F); p.j = { d: c.auj, o: c.o, c: c.c, k: c.k, s: 1, p: 0, a: 0 }; p.sem = c.sem || ''; p.ev = c.ev; } return p; } // abîmée : neuve, avec les compteurs du moment
    p.v = 1;
    if (typeof p.id !== 'string') p.id = F ? F.id : ''; // (abîmée pendant une saison : c'est la sienne, ses compteurs repris plus bas, rien n'est recompté)
    if (!(typeof p.xp === 'number' && Number.isFinite(p.xp) && p.xp >= 0)) p.xp = 0; else p.xp = Math.floor(p.xp);
    if (!(entier(p.recus) && p.recus < 2 ** 50)) p.recus = 0; // (les bits au-delà des crans sont gardés)
    p.titre = p.titre === 1 || p.titre === true ? 1 : 0;
    p.passees = nettoyerPassees(p.passees);
    const Fp = fiche(p.id), c = constats(st, now, Fp);
    if (!objet(p.j) || typeof p.j.d !== 'string' || !(p.j.d === '' || JOUR_OK.test(p.j.d)) || !['o', 'c', 'k', 's', 'p'].every((k) => entier(p.j[k]))) p.j = { d: c.auj, o: c.o, c: c.c, k: c.k, s: 1, p: 0, a: 0 }; // abîmée : les compteurs du moment
    if (!entier(p.j.a)) p.j.a = 0; // (une piste d'automne : pas de compteur des lecteurs)
    if (typeof p.sem !== 'string') p.sem = c.sem || '';
    if (!(typeof p.veille === 'string' && (p.veille === '' || JOUR_OK.test(p.veille)))) p.veille = '';
    if (!objet(p.ev)) p.ev = Object.assign({}, c.ev);
    for (const k of Object.keys(p.ev)) if (!entier(p.ev[k])) p.ev[k] = c.ev[k] != null ? c.ev[k] : 0;
    if (Fp) for (const cle of Fp.evenements.concat(Object.keys(Fp.lecteurs || {}))) if (!entier(p.ev[cle])) p.ev[cle] = c.ev[cle]; // (les lecteurs remis d'aplomb comme les paliers)
    if (p.dus != null && !(objet(p.dus) && typeof p.dus.id === 'string' && Array.isArray(p.dus.lots))) p.dus = null;
    if (p.dus === undefined) p.dus = null;
    return p;
  }
  function etat(st, now) { // répare, archive la saison finie (fin), crée celle du moment ; rend st.piste (null : pas de piste et pas de saison)
    if (!st || typeof st !== 'object') return null;
    const p = reparer(st, now); if (!p) return null;
    const F = active(now);
    if (p.id && (!F || p.id !== F.id)) fin(st, now); // la saison de la piste est finie (ou inconnue) : archivée, ses dus rangés
    else if (!p.id && F && !p.passees[F.id]) st.piste = ouvrir(st, F, now, p.passees, p.dus, p.sem); // une saison s'ouvre (jamais une saison déjà finie : une horloge reculée après la fin ne la rouvre pas)
    return st.piste;
  }

  // ─── la piste ───
  const N = (F) => (F ? F.crans.length : 0);
  const crans = (st) => { const p = st && st.piste, F = p && fiche(p.id); return F ? Math.min(N(F), Math.floor(p.xp / F.xpCran)) : 0; }; // les crans atteints
  const recu = (p, n) => n >= 1 && n <= 50 && Math.floor(p.recus / 2 ** (n - 1)) % 2 === 1; // (arithmétique : jusqu’à 50 crans ; une piste d’automne, < 2 ** 22, se lit à l’identique)
  function titre(st) { // { xp (le seuil), atteint, recu, distinction, nom, reste }
    const p = st && st.piste, F = p && fiche(p.id);
    if (!F || !F.titre) return { xp: Infinity, atteint: false, recu: false, distinction: null, nom: '', reste: Infinity };
    return { xp: F.xpTitre, atteint: p.xp >= F.xpTitre, recu: p.titre === 1, distinction: F.titre.distinction, nom: F.titre.nom || '', reste: Math.max(0, F.xpTitre - p.xp) };
  }
  function aRecevoir(st) { // les crans atteints, pas encore reçus (et le titre : n = crans.length + 1)
    const p = st && st.piste, F = p && fiche(p.id); if (!F) return [];
    const l = []; for (let n = 1; n <= crans(st); n++) if (!recu(p, n)) l.push(n);
    if (F.titre && p.xp >= F.xpTitre && p.titre !== 1) l.push(N(F) + 1);
    return l;
  }
  function lotDe(F, n) { // le lot du cran n (ou du titre), à distribuer
    if (n === N(F) + 1 && F.titre) return { n, titre: true, distinction: F.titre.distinction };
    const c = F.crans[n - 1]; return c ? Object.assign({}, c) : null;
  }
  function recevoir(st, n) { // marque le cran n reçu et rend son lot (que l'écran distribue : verser) ; null : pas atteint, déjà reçu, inconnu
    const p = st && st.piste, F = p && fiche(p.id); if (!F || !Number.isInteger(n)) return null;
    if (n === N(F) + 1) { if (!F.titre || p.xp < F.xpTitre || p.titre === 1) return null; p.titre = 1; return lotDe(F, n); }
    if (n < 1 || n > crans(st) || recu(p, n)) return null;
    p.recus += 2 ** (n - 1); return lotDe(F, n);
  }
  const toutRecevoir = (st) => aRecevoir(st).map((n) => recevoir(st, n)).filter(Boolean); // « Tout recevoir » : les lots, dans l'ordre
  // verser un lot dans la boulangerie (G : GAME) ; rend ce qui a été donné, pour la feuille. Les décos et le trophée : rien à verser (possede)
  function verser(st, lot, G) {
    const fait = { etoiles: 0, boost: null, vetement: null, distinction: null, deco: lot && lot.deco || null };
    if (!lot || !st) return fait;
    if (lot.etoiles > 0) { st.etoiles = (st.etoiles || 0) + lot.etoiles; fait.etoiles = lot.etoiles; }
    if (lot.boost && G && typeof G.donnerBoostReserve === 'function') fait.boost = G.donnerBoostReserve(st, lot.boost.mult, lot.boost.secs);
    if (lot.vetement && G && typeof G.donnerVetement === 'function') { try { G.donnerVetement(st, lot.vetement); fait.vetement = lot.vetement; } catch (e) { /* une pièce que la garde-robe ne connaît pas encore */ } }
    if (lot.distinction && G && typeof G.donnerDistinction === 'function') { G.donnerDistinction(st, lot.distinction); fait.distinction = lot.distinction; }
    return fait;
  }
  function possede(st, id) { // une récompense de piste (déco, vêtement, trophée, distinction) reçue, cette saison ou une saison passée (le carnet)
    const p = st && st.piste; if (!objet(p) || !id) return false;
    for (const F of FICHES) {
      const k = F.crans.findIndex((c) => c.deco === id || c.vetement === id || c.trophee === id); const estTitre = F.titre && F.titre.distinction === id;
      if (k < 0 && !estTitre) continue;
      if (p.id === F.id) { if (k >= 0 && recu(p, k + 1)) return true; if (estTitre && p.titre === 1) return true; }
      const x = objet(p.passees) && p.passees[F.id]; if (x) { if (k >= 0 && x.crans >= k + 1) return true; if (estTitre && x.titre) return true; }
    }
    return false;
  }

  // ─── le pas : l'XP par constat ───
  function pas(st, now, ctx) { // → { xp (gagnée), sources: { objectif… }, nouveaux: [crans atteints], titre (atteint à l'instant), fin (les dus d'une saison finie) }
    const out = { xp: 0, sources: {}, nouveaux: [], titre: false, fin: null };
    if (!st || !Number.isFinite(now)) return out;
    const p = etat(st, now); if (!p) return out;
    out.fin = p.dus || null;
    const F = fiche(p.id); if (!F || !(F.debut <= now && now < F.fin)) return out;
    const S = F.sources || SOURCES, c = constats(st, now, F);
    if (p.j.d !== c.auj) p.j = jVide(c.auj); // un nouveau jour de Paris
    const avantC = crans(st), avantT = p.xp >= F.xpTitre;
    const crediter = (src, n) => { if (!(n > 0) || !S[src]) return; const g = n * S[src].xp; p.xp += g; out.xp += g; out.sources[src] = (out.sources[src] || 0) + g; };
    const j = p.j, cap = (src) => (S[src] && S[src].parJour) || Infinity;
    // les objectifs du jour (et la série locale, qui en dépend)
    if (c.o > j.o) { const n = Math.min(c.o, cap('objectif')) - Math.min(j.o, cap('objectif')); crediter('objectif', n); j.o = c.o; }
    let serieLocale = false;
    if (c.o >= 1 && p.veille !== c.auj) { serieLocale = p.veille === veilleDe(c.auj); p.veille = c.auj; }
    if (c.c && !j.c) { crediter('journee', 1); j.c = 1; }
    // la série : le classement (s'il est là), sinon la série locale
    const sc = ctx && objet(ctx.serie) ? ctx.serie : null;
    const serieOk = sc ? (sc.aujourdhui === true || sc.auj === true) && ((Number(sc.jours) || Number(sc.n) || 0) >= 2) : serieLocale;
    if (serieOk && !j.s) { crediter('serie', 1); j.s = 1; }
    // le défi de la semaine
    if (c.sem && p.sem !== c.sem) { crediter('defi', 1); p.sem = c.sem; }
    // les paliers d'événement
    for (const cle of F.evenements) { const n = c.ev[cle] || 0, avant = entier(p.ev[cle]) ? p.ev[cle] : 0; if (n > avant) { crediter('palier', n - avant); j.p += n - avant; } p.ev[cle] = Math.max(avant, n); }
    // les lecteurs de la fiche (l'Avent en hiver) : l'augmentation du compteur, une fois (le marqueur p.ev[source]) ; ouverts aujourd'hui dans j.a
    for (const cle of Object.keys(F.lecteurs || {})) { const n = c.ev[cle] || 0, avant = entier(p.ev[cle]) ? p.ev[cle] : 0; if (n > avant) { crediter(cle, n - avant); j.a += n - avant; } p.ev[cle] = Math.max(avant, n); }
    // l'arrière-salle
    if (c.k > j.k) { const n = Math.min(c.k, cap('casino')) - Math.min(j.k, cap('casino')); crediter('casino', n); j.k = c.k; }
    const apres = crans(st); for (let n = avantC + 1; n <= apres; n++) out.nouveaux.push(n);
    out.titre = !avantT && p.xp >= F.xpTitre;
    return out;
  }
  // ce qu'il reste à prendre aujourd'hui, source par source (la ligne « D'où vient l'XP » de la feuille)
  function restes(st, now) {
    const p = st && st.piste, F = p && fiche(p.id); if (!F) return [];
    const S = F.sources || SOURCES, auj = dayKey(now), j = p.j && p.j.d === auj ? p.j : jVide(auj);
    return ORDRE.concat(Object.keys(F.lecteurs || {})).filter((k) => S[k]).map((k) => {
      const s = S[k]; let fait = 0, max = null;
      if (k === 'objectif') { fait = Math.min(j.o, s.parJour); max = s.parJour; } else if (k === 'journee') { fait = j.c; max = 1; } else if (k === 'serie') { fait = j.s; max = 1; } else if (k === 'casino') { fait = Math.min(j.k, s.parJour); max = s.parJour; }
      else if (k === 'defi') { const sm = objet(st.semaine) ? st.semaine : null; fait = sm && sm.key && p.sem === sm.key ? 1 : 0; max = 1; } else if (k === 'palier') { fait = j.p; max = null; } else if (F.lecteurs && F.lecteurs[k]) { fait = entier(j.a) ? j.a : 0; max = null; }
      return { id: k, nom: s.nom, txt: s.txt, xp: s.xp, fait, max, reste: max == null ? null : Math.max(0, max - fait), parSemaine: !!s.parSemaine };
    });
  }
  // tout ce que l'écran montre (la carte, la feuille) : { id, nom, xp, cran, crans, xpCran, dansCran, pour, aRecevoir, piste: [{ n, xp, lot, etat: 'recu' | 'aRecevoir' | 'aVenir' }], titre, resteMs, fiche }
  function vue(st, now) {
    const p = st && st.piste, F = p && fiche(p.id); if (!F) return null;
    const cr = crans(st), l = F.crans.map((c, k) => ({ n: k + 1, xp: (k + 1) * F.xpCran, lot: Object.assign({}, c), etat: recu(p, k + 1) ? 'recu' : k + 1 <= cr ? 'aRecevoir' : 'aVenir' }));
    return { id: F.id, nom: F.nom, xp: p.xp, cran: cr, crans: N(F), xpCran: F.xpCran, dansCran: cr >= N(F) ? F.xpCran : p.xp - cr * F.xpCran, pour: cr >= N(F) ? null : (cr + 1) * F.xpCran,
      aRecevoir: aRecevoir(st), piste: l, titre: titre(st), resteMs: Number.isFinite(now) ? Math.max(0, F.fin - now) : null, fiche: F };
  }

  // ─── la fin d'une saison ───
  function fin(st, now) { // la saison de st.piste est finie (ou inconnue) : les dus donnés d'office (rangés dans st.piste.dus), l'archive, la piste suivante
    const p = st && st.piste; if (!objet(p) || !p.id) return null;
    const F = fiche(p.id), Fa = active(now);
    if (F && Fa && Fa.id === F.id) return null; // pas finie
    if (F && Number.isFinite(now) && now < F.debut) return null; // (une horloge reculée avant le début : on attend)
    const lots = F ? toutRecevoir(st) : [];
    const res = { id: p.id, nom: F ? F.nom : p.id, lots, xp: p.xp, crans: F ? crans(st) : 0, titre: F && F.titre ? p.titre : 0 };
    const passees = Object.assign({}, p.passees), av = objet(passees[p.id]) ? passees[p.id] : null; // (une archive déjà là : fusionnée au plus haut, jamais écrasée)
    passees[p.id] = av ? { xp: Math.max(av.xp, res.xp), crans: Math.max(av.crans, res.crans), titre: av.titre || res.titre ? 1 : 0 } : { xp: res.xp, crans: res.crans, titre: res.titre };
    const n = Fa && !passees[Fa.id] ? ouvrir(st, Fa, now, passees, null, p.sem) : neuve('', passees); if (!n.id) n.sem = p.sem; // (le défi de la semaine déjà compté suit)
    n.dus = lots.length ? res : (p.dus || null); // (des dus d'avant pas encore montrés : gardés)
    if (lots.length && p.dus && Array.isArray(p.dus.lots)) res.lots = p.dus.lots.concat(lots);
    st.piste = n;
    return res;
  }
  const finDue = (st) => (st && objet(st.piste) && st.piste.dus) || null; // la feuille de fin à montrer (et ses lots à distribuer), ou null
  function recevoirFin(st) { const d = finDue(st); if (d) st.piste.dus = null; return d; } // montrée et distribuée : effacée

  return { SOURCES, ORDRE, FICHES, PISTE: Object.freeze({ v: 1, cle: 'piste', maxCrans: 50 }), ajouter, fiche, active, etat, reparer, pas, crans, aRecevoir, recevoir, toutRecevoir,
    verser, titre, fin, finDue, recevoirFin, possede, restes, vue, parisMs, dayKey, paris };
});
