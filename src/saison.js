/* LE FOURNIL — les saisons gratuites (la piste) : BOUCHON DU CONSTRUCTEUR B (l'écran), pour ses tests seulement.
   L'API de docs/marche-contrat.md § 7.1 (ajouter, active, etat, pas, crans, aRecevoir, recevoir, titre, fin, possede, SOURCES, PISTE),
   écrite au plus simple. La version du constructeur A (règles) le REMPLACE à la fusion : ne rien y corriger ici.
   Ce que l'écran (src/ui.js, SAI) en attend, et qu'il lit avec tolérance :
   · active(now) → la fiche { id, nom, debut, fin, crans: [{ n, etoiles?, boost?: { mult, secs }, vetement?, deco?, trophee? }], xpCran,
     titre: { xp, distinction }, textes } ou null ;
   · etat(st, now) → st.piste (réparée, créée pendant une saison) ou null ; pas(st, now, ctx) → l'XP gagnée à ce pas (0 : rien) ;
   · crans(st) → le nombre de crans atteints ; aRecevoir(st) → les numéros des crans atteints et pas reçus ;
   · recevoir(st, n) → le lot du cran n (une fois ; null sinon) : { n, etoiles, boost, vetement, deco, trophee } ;
   · titre(st) → vrai si le titre de la saison est gagné (l'XP du titre atteinte) ;
   · fin(st, now) → après la fin : { id, nom, lots (les crans dus, donnés d'office), crans, xp, titre } une fois, null sinon. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SAISONS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FICHES = [];
  const SOURCES = {
    objectif: { xp: 5, plafond: 3, par: 'jour', nom: 'Un objectif du jour réclamé' },
    journee: { xp: 10, plafond: 1, par: 'jour', nom: 'Les trois objectifs du jour' },
    defi: { xp: 75, plafond: 1, par: 'semaine', nom: 'Le défi de la semaine' },
    serie: { xp: 10, plafond: 1, par: 'jour', nom: 'Un jour de plus dans ta série' },
    palier: { xp: 20, plafond: 0, par: 'evenement', nom: 'Un palier du Marché' },
    casino: { xp: 5, plafond: 3, par: 'jour', nom: 'Un mini-objectif de l’arrière-salle' },
  };
  function decalageParis(ms) { const a = new Date(ms).getUTCFullYear(); const dd = (m) => { const d = new Date(Date.UTC(a, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); }; return ms >= dd(2) && ms < dd(9) ? 2 * 3600e3 : 3600e3; }
  const dayKey = (ms) => { const d = new Date(ms + decalageParis(ms)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
  const ajouter = (f) => { if (f && f.id && !FICHES.some((x) => x.id === f.id)) FICHES.push(f); return f; };
  const fiche = (id) => FICHES.find((f) => f.id === id) || null;
  const active = (now) => FICHES.find((f) => now >= f.debut && now < f.fin) || null;
  const nbCrans = (f) => (f ? f.crans.length : 0);
  const fini = (x) => typeof x === 'number' && Number.isFinite(x);
  function neuve(id) { return { v: 1, id, xp: 0, recus: 0, titre: 0, j: { d: '', o: 0, c: 0, k: 0, s: 0, p: 0 }, sem: '', veille: '', ev: { marche: 0 }, passees: {} }; }
  function reparer(st) {
    let p = st.piste;
    if (!p || typeof p !== 'object' || Array.isArray(p)) p = st.piste = neuve('');
    if (!fini(p.xp) || p.xp < 0) p.xp = 0;
    if (!Number.isInteger(p.recus) || p.recus < 0) p.recus = 0;
    if (!p.j || typeof p.j !== 'object' || Array.isArray(p.j)) p.j = { d: '', o: 0, c: 0, k: 0, s: 0, p: 0 };
    if (!p.ev || typeof p.ev !== 'object') p.ev = { marche: 0 };
    if (typeof p.sem !== 'string') p.sem = ''; if (typeof p.veille !== 'string') p.veille = '';
    if (!p.passees || typeof p.passees !== 'object' || Array.isArray(p.passees)) p.passees = {};
    if (typeof p.id !== 'string') p.id = '';
    p.titre = p.titre ? 1 : 0;
    return p;
  }
  function etat(st, now) {
    if (!st) return null; const f = active(now);
    if (!st.piste && !f) return null;
    const p = reparer(st);
    if (f && p.id !== f.id) { if (p.id && fiche(p.id)) archiver(st, p); Object.assign(p, neuve(f.id), { passees: p.passees }); p.ev.marche = 0; }
    return p;
  }
  const crans = (st) => { const p = st && st.piste, f = p && fiche(p.id); return f ? Math.min(nbCrans(f), Math.floor(p.xp / f.xpCran)) : 0; };
  const aRecevoir = (st) => { const n = crans(st), l = []; for (let k = 1; k <= n; k++) if (!(st.piste.recus & (1 << (k - 1)))) l.push(k); return l; };
  function recevoir(st, n) {
    const p = st && st.piste, f = p && fiche(p.id); if (!f || !(n >= 1 && n <= crans(st)) || (p.recus & (1 << (n - 1)))) return null;
    p.recus |= 1 << (n - 1); return Object.assign({ n }, f.crans[n - 1]);
  }
  function titre(st) { const p = st && st.piste, f = p && fiche(p.id); if (!f) return false; if (!p.titre && p.xp >= f.titre.xp + f.xpCran * nbCrans(f)) p.titre = 1; return !!p.titre; }
  function archiver(st, p) { const f = fiche(p.id); if (!f) return; p.passees[p.id] = { xp: p.xp, crans: crans(st), titre: p.titre }; }
  function fin(st, now) {
    const p = st && st.piste; if (!p || !p.id) return null; const f = fiche(p.id); if (!f || now < f.fin) return null;
    const lots = aRecevoir(st).map((n) => recevoir(st, n)).filter(Boolean); titre(st);
    const r = { id: f.id, nom: f.nom, lots, crans: crans(st), total: nbCrans(f), xp: p.xp, titre: !!p.titre };
    archiver(st, p); const g = active(now); Object.assign(p, neuve(g ? g.id : ''), { passees: p.passees });
    return r;
  }
  const possede = (st, id) => { const p = st && st.piste; if (!p) return false; for (const [sid, x] of Object.entries(Object.assign({}, p.passees, p.id ? { [p.id]: null } : {}))) { const f = fiche(sid); if (!f) continue; for (const c of f.crans) { if (c.deco !== id && c.trophee !== id) continue; if (x ? x.crans >= c.n : (p.recus & (1 << (c.n - 1)))) return true; } } return false; };
  function pas(st, now, ctx) {
    const f = active(now); if (!f) { if (st && st.piste && st.piste.id) { const r = fin(st, now); if (r) st.piste.finie = r; } return 0; }
    const p = etat(st, now); if (!p) return 0;
    const d = dayKey(now), av = p.xp;
    const jr = st.jour && st.jour.date === d ? st.jour : null;
    const recl = jr ? jr.objectifs.filter((o) => o.reclame).length : 0, compl = jr && jr.etoileDonnee ? 1 : 0;
    const cas = st.arriere && st.arriere.casino && Array.isArray(st.arriere.casino.objectifs) ? st.arriere.casino.objectifs.filter((o) => o && o.fait).length : 0;
    if (p.j.d !== d) { p.j = { d, o: 0, c: 0, k: 0, s: 0, p: 0 }; }
    const add = (src, n) => { if (n > 0) p.xp += n * SOURCES[src].xp; };
    { const n = Math.min(3, recl) - p.j.o; if (n > 0) { add('objectif', n); p.j.o += n; } }
    if (compl && !p.j.c) { add('journee', 1); p.j.c = 1; }
    { const n = Math.min(3, cas) - p.j.k; if (n > 0) { add('casino', n); p.j.k += n; } }
    if (st.semaine && st.semaine.reclame && p.sem !== st.semaine.key) { add('defi', 1); p.sem = st.semaine.key; }
    const hier = dayKey(now - 864e5);
    const serie = ctx && ctx.serie != null ? !!ctx.serie : recl > 0 && p.veille === hier;
    if (recl > 0 && p.veille !== d) { if (!p.j.s && serie) { add('serie', 1); p.j.s = 1; } p.veille = d; }
    const npal = st.marche && Array.isArray(st.marche.paliers) ? st.marche.paliers.length : 0;
    if (npal > p.ev.marche) { add('palier', npal - p.ev.marche); p.j.p += npal - p.ev.marche; p.ev.marche = npal; }
    titre(st);
    return p.xp - av;
  }
  return { ajouter, active, fiche, etat, pas, crans, aRecevoir, recevoir, titre, fin, possede, SOURCES, get PISTE() { return FICHES; }, dayKey, BOUCHON: true };
});
