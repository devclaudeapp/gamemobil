/* LE FOURNIL — le calendrier de l'Avent 2026 (docs/noel-contrat.md § 2) : les règles, sans DOM ni game.js (tourne aussi dans Node :
   test/fournil-avent.test.js, qui les compare à la référence outils/noel/avent.js). L'écran (la carte #avent, la feuille-calendrier) est
   dans ui.js ; il lit tout par vue() et ouvre par ouvrir() puis verser() dans le même geste.

   LA RÈGLE (dite telle quelle dans le jeu : TEXTES.regle) : « Chaque jour, ouvre la case du jour. Tu en as oublié ? Tu peux en rattraper
   une par jour, jusqu'au 31 décembre. »
     · du 1er au 24 décembre (heure de Paris), le jour D : la case D s'ouvre (si elle ne l'est pas), et UNE case passée non ouverte (k < D),
       au choix : au plus deux ouvertures ce jour-là ;
     · du 25 au 31 décembre : plus de case du jour, encore un rattrapage par jour ; le 1er janvier à 0 h, le calendrier se range ;
     · jamais deux fois la même case ; jamais une case future (n > D) ; jamais deux rattrapages le même jour, ni un rattrapage un jour
       d'avant le dernier (une horloge qui recule ne rend pas un rattrapage : r ≥ aujourd'hui refuse) ;
     · le jour se lit sur l'heure SÛRE quand elle est connue (sure = HORLOGE.etat().sure : t = min(now, sure), comme MARCHE.fenetreSure) :
       avancer l'heure du téléphone hors ligne n'ouvre pas la case de demain ; sans heure sûre (l'artefact Claude), le « maintenant » du jeu.
   L'état : st.avent = { v: 1, id: 'avent-2026', o: 0, r: '' } (o : le masque des cases ouvertes, bit n − 1 = case n, en arithmétique ;
   r : le dernier jour de Paris, 'AAAA-MM-JJ', d'un RATTRAPAGE) ; l'annonce vue : st.aventAnnonce (hors de st.avent, comme st.pisteAnnonce).
   Chaque case : une friandise (un dessin, FRIANDISES, aucun état) et 10 XP de saison (la fiche d'hiver lit nOuvertes : src/saison-hiver.js) ;
   en plus le lot de LOTS : 8 ★, 3 boosts, 5 décos, 4 pièces de la tenue de Noël (sans bonus), le renne « Grelot », l'aura des flocons. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./saison.js'));
  else root.AVENT = factory(root.SAISONS);
})(typeof self !== 'undefined' ? self : this, function (SA) {
  'use strict';
  const ID = 'avent-2026', ANNEE = 2026, CASES = 24;
  const DEBUT = SA.parisMs(2026, 12, 1, 0), FIN_CASES = SA.parisMs(2026, 12, 25, 0), FIN = SA.parisMs(2027, 1, 1, 0);
  const M = 1800; // trente minutes
  // les 24 cases (docs/noel-contrat.md § 2.3, la copie de outils/noel/avent.js) ; speciale : les cases 6, 12, 18, 24
  const LOTS = Object.freeze([
    { n: 1, etoiles: 1 },
    { n: 2, deco: 'couronne-avent' },                          // la couronne de l'Avent et ses quatre bougies (le comptoir, une lueur)
    { n: 3, boost: { mult: 2, secs: M } },
    { n: 4 },
    { n: 5, vetement: 'avent-bonnet' },                        // le bonnet de Noël (rouge, pompon blanc)
    { n: 6, speciale: true, compagnon: 'renne', etoiles: 1 },  // la Saint-Nicolas : le petit renne « Grelot »
    { n: 7 },
    { n: 8, deco: 'chaussettes' },                             // la guirlande de chaussettes (le rebord)
    { n: 9, etoiles: 1 },
    { n: 10 },
    { n: 11, vetement: 'avent-echarpe' },                      // l'écharpe rayée rouge et blanche
    { n: 12, speciale: true, deco: 'village-noel', etoiles: 1 }, // le village de Noël miniature (le comptoir, une lueur)
    { n: 13 },
    { n: 14, boost: { mult: 2, secs: M } },
    { n: 15, deco: 'bonhomme-neige' },                         // le bonhomme de neige (le sol)
    { n: 16 },
    { n: 17, vetement: 'avent-pull' },                         // le pull de Noël aux flocons
    { n: 18, speciale: true, deco: 'boule-neige', etoiles: 1 }, // la boule à neige (le comptoir)
    { n: 19 },
    { n: 20, etoiles: 1 },
    { n: 21 },
    { n: 22, boost: { mult: 3, secs: M } },
    { n: 23 },
    { n: 24, speciale: true, vetement: 'avent-chaussons', aura: 'flocons', etoiles: 2 }, // le réveillon : les chaussons (la tenue complète), l'aura des flocons
  ].map((l) => Object.freeze(Object.assign({}, l, l.boost ? { boost: Object.freeze(Object.assign({}, l.boost)) } : {}))));
  // les friandises (un dessin, ICONS.AVENT.friandise(id, teinte) ; aucun état) : la case n montre FRIANDISES[(n − 1) % 8] dans la teinte ⌊(n − 1) / 8⌋
  const FRIANDISES = Object.freeze(['sucre-orge', 'papillote', 'bonhomme-pain-epices', 'clementine', 'etoile-chocolat', 'guimauve', 'nougat', 'coeur-pain-epices']);
  // l'ordre des cases sur la feuille (mélangé, le même pour tous ; les spéciales sur deux colonnes)
  const ORDRE_CASES = Object.freeze([12, 3, 19, 7, 22, 1, 15, 9, 6, 17, 2, 21, 10, 24, 5, 14, 20, 8, 13, 23, 4, 18, 11, 16]);
  const NOMS = Object.freeze({ // pour la feuille du lot et Mes récompenses
    'couronne-avent': 'la couronne de l’Avent, pour le comptoir', chaussettes: 'la guirlande de chaussettes, pour le rebord', 'village-noel': 'le village de Noël, pour le comptoir',
    'bonhomme-neige': 'le bonhomme de neige, pour la boutique', 'boule-neige': 'la boule à neige, pour le comptoir',
    'avent-bonnet': 'le bonnet de Noël', 'avent-echarpe': 'l’écharpe rayée', 'avent-pull': 'le pull de Noël', 'avent-chaussons': 'les chaussons de feutre (la tenue de Noël complète)',
    renne: 'Grelot, le petit renne', flocons: 'l’aura des flocons',
    'sucre-orge': 'un sucre d’orge', papillote: 'une papillote', 'bonhomme-pain-epices': 'un bonhomme en pain d’épices', clementine: 'une clémentine', 'etoile-chocolat': 'une étoile en chocolat',
    guimauve: 'une guimauve', nougat: 'un nougat', 'coeur-pain-epices': 'un cœur en pain d’épices',
  });
  const TEXTES = Object.freeze({
    titre: 'Calendrier de l’Avent', carnet: 'Calendrier de l’Avent 2026', famille: 'Le calendrier de l’Avent 2026',
    regle: 'Chaque jour, ouvre la case du jour. Tu en as oublié ? Tu peux en rattraper une par jour, jusqu’au 31 décembre.',
    heure: 'Ton téléphone n’a pas encore retrouvé l’heure : la case du jour s’ouvre dès qu’il est en ligne.',
    rattrapage: 'Tu as déjà rattrapé une case aujourd’hui : la suivante demain.',
    future: (n) => `Patience ! Cette case s’ouvre le ${n === 1 ? '1er' : n} décembre.`,
    deja: 'Cette case est déjà ouverte.', ferme: 'Le calendrier de l’Avent est rangé.',
    xp: '+10 XP de saison', ruban: 'À rattraper', boite: (k) => `Ta boîte à friandises : ${k}/${CASES}`, restant: (j) => `encore ${j} j`,
    renne: 'Grelot le petit renne t’attend dans Les compagnons',
  });
  const XP_CASE = 10; // (la source « avent » de la fiche d'hiver ; ici pour la feuille)

  const objet = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const JOUR_OK = /^\d{4}-\d{2}-\d{2}$/;
  const masque = (a) => (objet(a) && Number.isSafeInteger(a.o) && a.o >= 0 && a.o < 2 ** CASES ? a.o : 0); // (abîmé : rien d'ouvert, sans rien écrire)
  const ouverte = (a, n) => n >= 1 && n <= CASES && Math.floor(masque(a) / 2 ** (n - 1)) % 2 === 1;
  const nOuvertes = (a) => { let k = 0; for (let n = 1; n <= CASES; n++) if (ouverte(a, n)) k++; return k; }; // le lecteur de la fiche d'hiver (ne fait que monter)
  const tSur = (now, sure) => (Number.isFinite(sure) && sure > 0 ? Math.min(now, sure) : now);
  // le jour de l'Avent : 0 avant le 1er déc., 1 à 31 en décembre (Paris), 0 à partir du 1er janvier ; sur l'heure sûre quand elle est connue
  function jour(now, sure) {
    const t = tSur(now, sure);
    if (!Number.isFinite(t) || t < DEBUT || t >= FIN || now >= FIN) return 0;
    return SA.paris(t).getUTCDate();
  }
  const ouvert = (now) => Number.isFinite(now) && now >= DEBUT && now < FIN; // la fenêtre (la carte, l'annonce, le déblocage)
  function neuf() { return { v: 1, id: ID, o: 0, r: '' }; }
  function reparer(st, now) { // jamais d'exception ; un état abîmé : ce qui se lit est gardé (jamais une case rouverte)
    let a = st.avent;
    if (!objet(a)) { a = st.avent = neuf(); return a; }
    a.v = 1; if (a.id !== ID) { if (typeof a.id === 'string' && a.id) { st.avent = neuf(); return st.avent; } a.id = ID; } // (un autre id : une version future, neuf)
    if (!(Number.isSafeInteger(a.o) && a.o >= 0 && a.o < 2 ** CASES)) a.o = 0;
    if (!(typeof a.r === 'string' && (a.r === '' || JOUR_OK.test(a.r)))) a.r = Number.isFinite(now) ? SA.dayKey(now) : ''; // (abîmé : pas de rattrapage avant demain ; jamais deux le même jour)
    return a;
  }
  // rien n'est créé hors de la fenêtre (avant le 1er déc., à partir du 1er janv.) ; dedans, st.avent créé au premier appel ; null : pas d'Avent
  function etat(st, now) { if (!st || typeof st !== 'object') return null; if (st.avent === undefined && !ouvert(now)) return null; return reparer(st, now); }
  // ce qui peut s'ouvrir maintenant : { jour, du: n ou 0 (la case du jour), rattrapage: [k…] (les cases oubliées, si le rattrapage du jour est libre) }
  function ouvrables(st, now, sure) {
    const D = jour(now, sure), a = st && objet(st.avent) ? st.avent : null, o = { jour: D, du: 0, rattrapage: [] };
    if (!D) return o; const A = a || neuf(), auj = SA.dayKey(tSur(now, sure));
    if (D <= CASES && !ouverte(A, D)) o.du = D;
    if (!(typeof A.r === 'string' && A.r && A.r >= auj)) for (let k = 1; k <= Math.min(D - 1, CASES); k++) if (!ouverte(A, k)) o.rattrapage.push(k);
    return o;
  }
  // ouvrir la case n : marque ET rend son lot (que l'écran distribue aussitôt, dans le même geste : verser) ; { ok, lot, rattrapage } ou { ok: false, raison }
  function ouvrir(st, n, now, sure) {
    if (!Number.isInteger(n) || n < 1 || n > CASES) return { ok: false, raison: 'inconnue' };
    const a = etat(st, now); if (!a) return { ok: false, raison: 'ferme' };
    const D = jour(now, sure); if (!D) return { ok: false, raison: 'ferme' };
    if (ouverte(a, n)) return { ok: false, raison: 'deja' };
    if (n > D) return { ok: false, raison: 'future' };
    const auj = SA.dayKey(tSur(now, sure));
    if (n !== D) { if (a.r && a.r >= auj) return { ok: false, raison: 'rattrapage' }; a.r = auj; }
    a.o += 2 ** (n - 1);
    return { ok: true, lot: lotDe(n), rattrapage: n !== D };
  }
  const lotDe = (n) => { const l = LOTS[n - 1]; return l ? Object.assign({}, l, l.boost ? { boost: Object.assign({}, l.boost) } : {}) : null; };
  const friandise = (n) => ({ id: FRIANDISES[(n - 1) % FRIANDISES.length], teinte: Math.floor((n - 1) / FRIANDISES.length) });
  // verser un lot dans la boulangerie (G : GAME) : les étoiles, le boost dans la réserve, le vêtement, l'aura (portée d'office la première
  // fois, comme celles des paliers) ; la déco et le renne n'ont rien à verser (possede les lit sur le masque). Rend ce qui a été donné
  function verser(st, lot, G) {
    const fait = { etoiles: 0, boost: null, vetement: null, aura: null, deco: (lot && lot.deco) || null, compagnon: (lot && lot.compagnon) || null };
    if (!lot || !st) return fait;
    if (lot.etoiles > 0) { st.etoiles = (st.etoiles || 0) + lot.etoiles; fait.etoiles = lot.etoiles; }
    if (lot.boost && G && typeof G.donnerBoostReserve === 'function') fait.boost = G.donnerBoostReserve(st, lot.boost.mult, lot.boost.secs);
    if (lot.vetement && G && typeof G.donnerVetement === 'function') { try { if (G.donnerVetement(st, lot.vetement).objet) fait.vetement = lot.vetement; } catch (e) { /* une pièce que la garde-robe ne connaît pas encore */ } }
    if (lot.aura && G && typeof G.donnerAura === 'function') { try { if (G.donnerAura(st, lot.aura).aura) fait.aura = lot.aura; } catch (e) { /* rien */ } }
    return fait;
  }
  // un écran tombé entre ouvrir et verser : au prochain lancement, les cases ouvertes dont la pièce (ou l'aura) n'est pas dans la garde-robe ;
  // rend leurs lots réduits à ce qui manque (verser les redonne ; étoiles et boosts, versés avant la sauvegarde qui suit ouvrir, jamais)
  function aVerser(st, G) {
    const a = st && objet(st.avent) ? st.avent : null; if (!a || a.id !== ID) return [];
    let g = null; try { g = G && typeof G.garderobe === 'function' ? G.garderobe(st) : null; } catch (e) { g = null; }
    if (!g) return [];
    const l = [];
    for (const lot of LOTS) {
      if (!ouverte(a, lot.n)) continue;
      const x = { n: lot.n };
      if (lot.vetement && G.vetement && G.vetement(lot.vetement) && !(g.objets && g.objets[lot.vetement])) x.vetement = lot.vetement;
      if (lot.aura && G.AURAS && G.AURAS[lot.aura] && !(Array.isArray(g.auras) && g.auras.includes(lot.aura))) x.aura = lot.aura;
      if (x.vetement || x.aura) l.push(x);
    }
    return l;
  }
  // une récompense de l'Avent reçue (une déco, le renne, l'aura, une pièce) : par le masque, à vie (même après le 1er janvier)
  function possede(st, id) {
    const a = st && st.avent; if (!objet(a) || a.id !== ID || !id) return false;
    const lot = LOTS.find((l) => l.deco === id || l.compagnon === id || l.aura === id || l.vetement === id);
    return !!lot && ouverte(a, lot.n);
  }
  const DECOS = Object.freeze(LOTS.filter((l) => l.deco).map((l) => l.deco));
  const VETEMENTS = Object.freeze(LOTS.filter((l) => l.vetement).map((l) => l.vetement));
  // tout ce que montrent la carte et la feuille ; null : pas d'Avent (avant le 1er déc. sans état, ou après le 1er janv. sans l'avoir joué)
  //   { id, jour (sur l'heure sûre), jourJeu (sur le « maintenant »), attendHeure, actif (la fenêtre), cases (la feuille : 1 à 24 ; dans l'ordre
  //     d'affichage : ordre), ouvertes, friandises, du, rattrapage, rattrapageLibre, pastille, restant (jours pour rattraper, ce jour compris) }
  //   une case : { n, etat: 'ouverte' | 'du' | 'rattrapage' | 'fermee' (oubliée, le rattrapage du jour déjà pris) | 'future' | 'rangee',
  //     friandise, teinte, lot, speciale, ouvrable, raison (si pas ouvrable) }
  function vue(st, now, sure) {
    if (!st || typeof st !== 'object') return null;
    const a = ouvert(now) ? etat(st, now) : objet(st.avent) && st.avent.id === ID ? st.avent : null; if (!a) return null;
    const D = jour(now, sure), Dj = jour(now), ou = ouvrables(st, now, sure), actif = ouvert(now), libre = !!D && !(a.r && a.r >= SA.dayKey(tSur(now, sure)));
    const cases = LOTS.map((l) => {
      const n = l.n, f = friandise(n), o = ouverte(a, n);
      const e = o ? 'ouverte' : !actif ? 'rangee' : !D ? 'future' : n === ou.du ? 'du' : n > D ? 'future' : libre ? 'rattrapage' : 'fermee';
      const raison = o ? 'deja' : !D ? 'ferme' : n > D ? 'future' : e === 'fermee' ? 'rattrapage' : null;
      return { n, etat: e, friandise: f.id, teinte: f.teinte, lot: lotDe(n), speciale: !!l.speciale, ouvrable: e === 'du' || e === 'rattrapage', raison };
    });
    const k = nOuvertes(a);
    return { id: ID, jour: D, jourJeu: Dj, attendHeure: Dj > D, actif, cases, ordre: ORDRE_CASES.slice(), ouvertes: k, friandises: k, total: CASES, du: ou.du, rattrapage: ou.rattrapage.slice(),
      rattrapageLibre: libre, pastille: !!(ou.du || ou.rattrapage.length), restant: D ? 32 - D : 0, fin: FIN, finCases: FIN_CASES };
  }
  return { ID, ANNEE, DEBUT, FIN_CASES, FIN, CASES, XP_CASE, LOTS, FRIANDISES, ORDRE_CASES, NOMS, TEXTES, DECOS, VETEMENTS,
    jour, ouvert, neuf, reparer, etat, ouvrables, ouvrir, lotDe, friandise, verser, aVerser, possede, ouverte, nOuvertes, vue };
});
