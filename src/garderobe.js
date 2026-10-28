/* LE FOURNIL — la garde-robe : la carte dans l'onglet Boulanger (les quatre emplacements et le bonus porté) et la feuille (choisir quoi
   porter pièce par pièce, voir les bonus, améliorer en étoiles, les ensembles). Les règles sont dans src/game.js (GAME.GARDEROBE, equiper,
   ameliorerVetement, bonusGardeRobe…) ; l'interface reçoit de ui.js un contexte { st, openSheet, closeSheet, on, feuille, save, toast,
   son, buzz, apres } et ne touche à rien d'autre. */
const GARDEROBE_UI = (() => {
  'use strict';
  const G = GAME, GR = G.GARDEROBE;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PIECES = [['tete', 'Couvre-chef', 'Tête'], ['haut', 'Haut', 'Haut'], ['pieds', 'Chaussures', 'Pieds'], ['accessoire', 'Accessoire', 'Accessoire']];
  const NOM_PIECE = Object.fromEntries(PIECES.map(([id, nom]) => [id, nom]));
  const RARETE = { commun: 'de toujours', rare: 'rare', epique: 'épique', legendaire: 'légendaire' };
  // les trophées des paliers bonus (20e) : leurs palettes pour la 3D du boulanger, posées ici (persos.js est partagé avec Poncin, qu'on
  // laisse tel quel) : la casquette néon (rose et cyan) et le chapeau phosphorescent (vert qui brille dans la nuit) ; le parcours ; la chaîne
  if (typeof PERSOS !== 'undefined' && PERSOS && PERSOS.TENUES) {
    const T = PERSOS.TENUES;
    if (!T['quartier-neon']) T['quartier-neon'] = { tissu: '#FF2E9A', fonce: '#2EF2FF', clair: '#FF8AD0', bijou: '#2EF2FF' };
    if (!T.parcours) T.parcours = { tissu: '#2F4A7A', fonce: '#C77B30', clair: '#7FA0E0', bijou: '#C77B30' }; // la tenue du parcours du boulanger : bleu nuit et cuivre
    if (!T['hantee-lueur']) T['hantee-lueur'] = { tissu: '#2E2547', fonce: '#7CFF6B', clair: '#B8FF9E', bijou: '#7CFF6B' };
    if (!T.chaine) T.chaine = { tissu: '#7B2D42', fonce: '#D9A23A', clair: '#A8506A', bijou: '#FFC84A' }; // la tenue du patron de « Ma chaîne » : grenat et or
  }
  const COLLECTION = { base: 'La tenue de toujours', or: 'Podium d’or', argent: 'Podium d’argent', bronze: 'Podium de bronze', quartier: 'Le Quartier', 'quartier-or': 'Le Quartier, podium final', hantee: 'La Maison hantée', 'hantee-or': 'La Maison hantée, podium final', 'quartier-neon': 'Le Quartier, palier 20', 'hantee-lueur': 'La Maison hantée, palier 20', parcours: 'Le parcours du boulanger' };
  const QUELLE = { or: 'Termine 1er de la semaine au classement.', argent: 'Termine 2e de la semaine au classement.', bronze: 'Termine 3e de la semaine au classement.', quartier: 'Les paliers de l’événement « Le Quartier ».', 'quartier-or': 'Le podium final de l’événement « Le Quartier ».', hantee: 'Les paliers de l’événement « La Maison hantée ».', 'hantee-or': 'Le podium final de « La Maison hantée ».', 'quartier-neon': 'Le palier bonus 20 de l’événement « Le Quartier ».', 'hantee-lueur': 'Le palier bonus 20 de « La Maison hantée ».', parcours: 'Les boutiques n°11, 17, 23 et 29 du parcours du boulanger.' };
  // une collection d'un événement écarté (le Quartier, QUARTIER.ECARTE, depuis le 27 oct. ; réintroduction plus tard) : ses pièces gagnées
  // restent à porter ; un ensemble dont on n'a rien ne se montre plus (plus moyen de l'avoir : pas de « Les paliers du Quartier » à qui est arrivé après)
  const ecartee = (c) => /^quartier(-|$)/.test(c) && typeof QUARTIER !== 'undefined' && !!QUARTIER.ECARTE;
  let pieceOuverte = 'tete';
  // le boulanger en 3D (src/equipe3d.js) : la vue « Mon boulanger », depuis la carte et la feuille, quand l'équipe 3D est possible (la HD permise :
  // qualité haute ou moyenne, pas coupée dans les Réglages, le lot pas en échec) ; en éco, pas de bouton
  const E3 = typeof EQUIPE3D !== 'undefined' && EQUIPE3D && EQUIPE3D.actif ? EQUIPE3D : null, vue3D = () => (E3 && E3.dispo() ? E3.vue : null);
  const BOUTON_3D = (attr) => (vue3D() ? `<button type="button" class="btn large lavande" ${attr} style="margin-bottom:10px"><b>Voir mon boulanger en 3D</b></button>` : '');
  const virg = (n) => String(+n.toFixed(2)).replace('.', ',');
  const etoiles = (n) => `${'★'.repeat(n)}${'☆'.repeat(GR.nivMax - n)}`;
  const icone = (v) => ICONS.vetement(v.forme, v.collection === 'base' ? 'base' : v.collection);
  // ce que portent les quatre emplacements, résumé en une phrase de bonus : « Tous les gains +12 % · cuisson 4 % plus vite · +1 h d’absence »
  function resumeBonus(st) {
    const b = G.bonusGardeRobe(st), t = [];
    if (b.gainsTous > 1) t.push(`Tous les gains +${virg((b.gainsTous - 1) * 100)} %`);
    for (const id of Object.keys(b.gains)) { const p = G.PRODUITS.find((q) => q.id === id); if (p && b.gains[id] > 1) t.push(`${p.pl[0].toUpperCase() + p.pl.slice(1)} +${virg((b.gains[id] - 1) * 100)} %`); }
    if (b.vitesse < 1) t.push(`Cuisson ${virg((1 - b.vitesse) * 100)} % plus rapide`);
    if (b.absenceH > 0) t.push(`+${virg(b.absenceH)} h d’absence`);
    return t;
  }
  const possedees = (st) => Object.keys(G.garderobe(st).objets).filter((id) => G.GARDEROBE.objets[id].collection !== 'base').length;
  // ─── la carte de l'onglet Boulanger ───
  function carte(st) {
    const g = G.garderobe(st), bonus = resumeBonus(st), ens = G.ensembleComplet(st), n = possedees(st);
    const cases = PIECES.map(([p, nom]) => { const v = G.vetement(g.equipe[p]); return `<button type="button" class="gr-case" data-gr-ouvrir="${p}" aria-label="${nom} : ${v ? esc(v.nom) : 'rien'}"><span class="gr-ico">${v ? icone(v) : ICONS.UI[p]}</span><small>${nom}</small><b>${v ? esc(v.nom) : 'Rien'}</b>${v && v.collection !== 'base' ? `<i class="gr-niv">${g.objets[v.id].niv}</i>` : ''}</button>`; }).join('');
    return `<div class="card gr-carte" data-garderobe><div class="c-tete"><span class="pic peche">${ICONS.UI.garderobe}</span><h3>Garde-robe</h3><span class="compte ${ens ? 'or' : ''}">${ens ? esc(GR.ensembles[ens].nom) : n ? `${n} pièce${n > 1 ? 's' : ''}` : 'tenue de toujours'}</span></div>
      <div class="gr-cases">${cases}</div>
      <p class="gr-bonus">${bonus.length ? bonus.join(' · ') : 'Pas encore de bonus : les tenues des podiums, des événements et du parcours du boulanger en donnent.'}</p>
      ${BOUTON_3D('data-gr-3d')}<button type="button" class="btn large clair" data-gr-ouvrir="tete"><b>Ouvrir la garde-robe</b></button></div>`;
  }
  // ─── la feuille : la pièce choisie en segments, ce qu'on possède, porter, améliorer, puis les ensembles ───
  // le compagnon de la boutique (GAME.COMPAGNONS) : l'animal montré, et la feuille « Les compagnons » pour en changer (le chat noir gagné à la
  // Maison hantée s'y choisit, comme les autres ; pendant l'événement, un chat est noir d'office). ctx.compagnon vient de ui.js.
  let ctxComp = null;
  function blocCompagnon(st, c) {
    if (!c || !st.chat) return '';
    const id = c.id(), comp = G.compagnon(id);
    return `<h3 class="titre-section">Le compagnon de la boutique</h3><div class="gr-liste"><button type="button" class="gr-piece gr-chat" data-gr-compagnons><span class="gr-ico">${ICONS.compagnon(id)}</span><span class="gr-txt"><b>${esc(c.nom())}, ${esc(comp ? comp.nom.toLowerCase() : 'chat roux')}</b><small>Changer de compagnon : du chat roux au mini-dragon</small></span><span class="gr-ok">›</span></button></div>${c.force() ? '<p class="note centre">Pendant la Maison hantée, un chat de la boutique est noir. Le choix revient après.</p>' : ''}`;
  }
  // l'aura (le 20e palier de la Maison hantée : l'aura phosphorescente, GAME.AURAS) : sans bonus, à porter ou retirer d'un toucher, en plus des
  // quatre pièces ; la section n'apparaît qu'une fois une aura gagnée
  const AURA_ICO = (c) => `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="${c}" opacity=".22"/><circle cx="24" cy="24" r="14" fill="${c}" opacity=".4"/><circle cx="24" cy="24" r="7.5" fill="#F2FFE0"/><path d="M24 15.5c3 3.6 4.4 6.4 4.4 8.6a4.4 4.4 0 0 1-8.8 0c0-2.2 1.4-5 4.4-8.6z" fill="${c}"/></svg>`;
  function blocAura(st) {
    const g = G.garderobe(st); if (!G.AURAS || !g.auras || !g.auras.length) return '';
    const l = g.auras.map((id) => { const a = G.AURAS[id], porte = g.aura === id; return `<button type="button" class="gr-piece gr-aura ${porte ? 'porte' : ''}" data-gr-aura="${porte ? '' : id}" aria-pressed="${porte}" aria-label="${esc(a.nom)} : ${porte ? 'portée, toucher pour la retirer' : 'toucher pour la porter'}"><span class="gr-ico">${AURA_ICO(a.couleur)}</span><span class="gr-txt"><b>${esc(a.nom)}</b><small>${esc(a.desc)}</small><small class="gr-b">${porte ? 'Portée : touche pour la retirer' : 'Rangée : touche pour la porter'}</small></span>${porte ? '<span class="gr-ok">Portée ✓</span>' : ''}</button>`; }).join('');
    return `<h3 class="titre-section">L’aura</h3><div class="gr-liste" data-gr-auras>${l}</div>`;
  }
  function html(st) {
    const g = G.garderobe(st), p = pieceOuverte, porte = g.equipe[p], bonus = resumeBonus(st), ens = G.ensembleComplet(st);
    const seg = `<div class="segments gr-seg" role="tablist" aria-label="Emplacement">${PIECES.map(([id, , court]) => `<button type="button" role="tab" data-gr-piece="${id}" aria-selected="${p === id}" class="${p === id ? 'actif' : ''}">${court}</button>`).join('')}</div>`;
    const liste = Object.values(GR.objets).filter((v) => v.piece === p && g.objets[v.id]);
    const rien = p === 'accessoire' ? `<button type="button" class="gr-piece ${porte === null ? 'porte' : ''}" data-gr-porter="" aria-pressed="${porte === null}"><span class="gr-ico vide">${ICONS.UI.accessoire}</span><span class="gr-txt"><b>Rien</b><small>Le cou libre, comme au premier jour.</small></span>${porte === null ? '<span class="gr-ok">Porté ✓</span>' : ''}</button>` : '';
    const cartes = liste.map((v) => {
      const o = g.objets[v.id], base = v.collection === 'base', actuel = porte === v.id, max = o.niv >= GR.nivMax, cout = G.coutVetement(st, v.id), ok = cout > 0 && st.etoiles >= cout;
      const now = G.texteBonus(G.bonusPiece(v.id, o.niv)), suivant = max || base ? [] : G.texteBonus(G.bonusPiece(v.id, o.niv + 1));
      return `<div class="gr-piece ${actuel ? 'porte' : ''} ${v.collection}"><button type="button" class="gr-choisir" data-gr-porter="${v.id}" aria-pressed="${actuel}"><span class="gr-ico">${icone(v)}</span><span class="gr-txt"><b>${esc(v.nom)}</b><small>${esc(COLLECTION[v.collection] || v.collection)}${base ? '' : ` · ${RARETE[v.rarete] || v.rarete}`}</small>${base ? '' : `<small class="gr-etoiles" aria-label="niveau ${o.niv} sur ${GR.nivMax}">${etoiles(o.niv)}</small>`}<small class="gr-b">${base ? esc(v.desc) : now.join(' · ')}</small>${suivant.length ? `<small class="gr-suivant">Niveau ${o.niv + 1} : ${suivant.join(' · ')}</small>` : ''}</span>${actuel ? '<span class="gr-ok">Porté ✓</span>' : ''}</button>
        ${base ? '' : max ? '<span class="gr-max">Niveau max ✓</span>' : `<button type="button" class="btn ${ok ? 'beurre' : 'non'} gr-ameliorer" data-gr-ameliorer="${v.id}" aria-label="Améliorer ${esc(v.nom)} : ${cout} étoile${cout > 1 ? 's' : ''}"><small>Améliorer</small><b>${cout} ★</b></button>`}</div>`;
    }).join('');
    const indice = liste.length <= 1 && p !== 'accessoire' ? `<p class="note centre">Une seule pièce ici pour l’instant. Les podiums du classement, les événements et le parcours du boulanger en offrent d’autres.</p>` : '';
    const ensembles = Object.keys(GR.ensembles).filter((c) => !ecartee(c) || Object.values(GR.objets).some((v) => v.collection === c && g.objets[v.id])).map((c) => {
      const pieces = Object.values(GR.objets).filter((v) => v.collection === c), eues = pieces.filter((v) => g.objets[v.id]).length, portees = pieces.filter((v) => g.equipe[v.piece] === v.id).length, complet = ens === c;
      return `<div class="gr-ensemble ${c} ${complet ? 'complet' : ''} ${eues ? '' : 'absent'}"><span class="gr-minis" aria-hidden="true">${pieces.map((v) => `<i class="${g.objets[v.id] ? '' : 'manque'}">${icone(v)}</i>`).join('')}</span><span class="gr-txt"><b>${esc(GR.ensembles[c].nom)}</b><small>${complet ? 'Ensemble complet porté : ' + G.texteBonus(GR.ensembles[c].bonus).join(' · ') : eues ? `${eues === 4 ? `${portees}/4 portée${portees > 1 ? 's' : ''}` : `${eues}/4 pièce${eues > 1 ? 's' : ''}`} · au complet : ${G.texteBonus(GR.ensembles[c].bonus).join(' · ').toLowerCase()}` : esc(QUELLE[c] || '')}</small></span>${eues === 4 && !complet ? `<button type="button" class="btn clair gr-tout" data-gr-ensemble="${c}"><b>Tout porter</b></button>` : complet ? '<span class="gr-ok">✓</span>' : ''}</div>`;
    }).join('');
    return `<div class="cl gr" data-cl="garderobe"><div class="cl-tete"><span class="pic">${ICONS.UI.garderobe}</span><div><h2>Garde-robe</h2><p class="sous">Choisis ce que porte ton boulanger, pièce par pièce. Les étoiles améliorent chaque pièce (niveaux 1 à 5).</p></div></div>
      <div class="gr-tete"><span class="gr-portrait" aria-hidden="true">${ICONS.boulanger(G.rangTitre(st), G.tenueBoulanger(st))}</span><div><b>${bonus.length ? bonus.join(' · ') : 'Aucun bonus porté'}</b><small>${ens ? `${esc(GR.ensembles[ens].nom)} au complet.` : 'Les quatre pièces d’une même collection : un bonus d’ensemble en plus.'}</small><small class="gr-solde">${G.fmt(st.etoiles)} étoile${st.etoiles > 1 ? 's' : ''} à dépenser · une étoile dépensée ne compte plus dans les +5 % par étoile</small></div></div>
      ${BOUTON_3D('data-gr-3d-feuille')}${seg}<div class="gr-liste" role="list" aria-label="${esc(NOM_PIECE[p])}">${rien}${cartes}</div>${indice}
      ${blocAura(st)}<h3 class="titre-section">Les ensembles</h3><div class="gr-ensembles">${ensembles}</div>${blocCompagnon(st, ctxComp)}
      <button type="button" class="btn large sombre" data-a="gr-fermer" style="margin-top:14px"><b>Retour</b></button></div>`;
  }
  function ouvrir(ctx, piece) {
    if (GR.pieces.includes(piece)) pieceOuverte = piece; ctxComp = ctx.compagnon || null;
    ctx.openSheet(html(ctx.st)); lier(ctx);
  }
  function redessiner(ctx, cible) { // la feuille se redessine sur place, sans remonter, le bouton touché garde le focus
    const y = ctx.feuille.scrollTop; ctx.openSheet(html(ctx.st)); lier(ctx); ctx.feuille.scrollTop = y;
    if (cible) { const b = ctx.feuille.querySelector(cible); if (b) b.focus(); }
  }
  function lier(ctx) {
    const st = ctx.st;
    ctx.on('[data-gr-piece]', (b) => { if (b.dataset.grPiece === pieceOuverte) return; ctx.son.tap(); pieceOuverte = b.dataset.grPiece; redessiner(ctx, `[data-gr-piece="${pieceOuverte}"]`); });
    ctx.on('[data-gr-porter]', (b) => {
      const id = b.dataset.grPorter || null, r = G.equiper(st, pieceOuverte, id);
      if (!r.ok) { ctx.son.non(); return; }
      ctx.son.tap(); ctx.buzz(8); ctx.save(); ctx.apres(); redessiner(ctx, `[data-gr-porter="${b.dataset.grPorter}"]`);
    });
    ctx.on('[data-gr-ameliorer]', (b) => {
      const id = b.dataset.grAmeliorer, r = G.ameliorerVetement(st, id);
      if (!r.ok) { ctx.son.non(); ctx.toast(r.max ? 'Cette pièce est déjà au niveau maximum.' : `Il faut ${r.cout} étoile${r.cout > 1 ? 's' : ''} : tu en as ${G.fmt(st.etoiles)}.`); return; }
      ctx.son.deblocage(); ctx.buzz([10, 30, 10]); ctx.toast(`${r.objet.nom} au niveau ${r.niv} : ${G.texteBonus(G.bonusPiece(id, r.niv)).join(', ')}`); ctx.save(); ctx.apres(); redessiner(ctx, `[data-gr-ameliorer="${id}"]`);
    });
    ctx.on('[data-gr-aura]', (b) => { // porter l'aura, ou la retirer (data-gr-aura vide)
      const id = b.dataset.grAura || null, r = G.porterAura(st, id); if (!r.ok) { ctx.son.non(); return; }
      ctx.son.tap(); ctx.buzz(8); ctx.toast(id ? `${G.AURAS[id].nom} : portée.` : 'Aura retirée : elle reste dans ta garde-robe.'); ctx.save(); ctx.apres(); redessiner(ctx, '[data-gr-aura]');
    });
    ctx.on('[data-gr-ensemble]', (b) => { const n = G.equiperCollection(st, b.dataset.grEnsemble); if (!n) { ctx.son.non(); return; } ctx.son.deblocage(); ctx.buzz([10, 30, 10]); ctx.toast(`${GR.ensembles[b.dataset.grEnsemble].nom} : les quatre pièces portées.`); ctx.save(); ctx.apres(); redessiner(ctx); });
    ctx.on('[data-a="gr-fermer"]', () => { ctx.son.tap(); ctx.closeSheet(); });
    ctx.on('[data-gr-3d-feuille]', () => { const v = vue3D(); if (!v) return; ctx.son.tap(); ctx.closeSheet(); v.ouvrir(Object.assign({}, ctx, { ferme: () => ouvrir(ctx, pieceOuverte) }), pieceOuverte); }); // (la vue fermée, la feuille revient)
    ctx.on('[data-gr-compagnons]', () => { if (!ctx.compagnon) return; ctx.son.tap(); ctx.compagnon.ouvrir(() => ouvrir(ctx, pieceOuverte)); }); // « Retour » revient ici
  }
  function bind(sec, ctx) { sec.querySelectorAll('[data-gr-ouvrir]').forEach((b) => b.addEventListener('click', () => { ctx.son.tap(); ouvrir(ctx, b.dataset.grOuvrir); })); sec.querySelectorAll('[data-gr-3d]').forEach((b) => b.addEventListener('click', () => { const v = vue3D(); if (!v) return; ctx.son.tap(); v.ouvrir(ctx); })); }
  return { carte, html, ouvrir, bind, resumeBonus, NOM_PIECE, COLLECTION, get piece() { return pieceOuverte; }, get vue3D() { return !!vue3D(); } };
})();
