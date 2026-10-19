/* LE FOURNIL — la boutique hantée : pendant la Maison hantée (src/hantee.js), avec ?boutique=1 dans l'adresse, l'écran de l'événement
   (src/evenement.js) ne bâtit plus le Manoir (sceneManoir) : il montre la VRAIE scène de la boutique (src/scene.js, src/vie.js,
   src/meubles.js, src/persos.js, src/hd.js), habillée pour Halloween. Sans ?boutique=1, rien ne change.
   · Le thème « hantee » (VIE.DECORS.hantee) : papier peint violet nuit et ses chauves-souris, parquet sombre, cadres sombres, le jardin
     du manoir par la fenêtre ; les décos de la Maison hantée (citrouilles, toiles, chaudron, petit fantôme) toutes posées ; des bougies
     et des lanternes (MEUBLES.hantee, modèles KayKit Halloween cuits en haute) ; les citrouilles d'octobre (décors HD, tag halloween).
   · Les clients viennent déguisés (sorcière, vampire, fantôme, momie : PERSOS.DEGUISEMENTS) ; les apprentis sont l'équipe du Manoir
     (Hubert le fantôme, Ramsès la momie… : le monstre de chaque poste embauché, sa friandise sur le plateau) ; le boulanger porte le
     chapeau pointu, la cape et les bottes ; le chat noir dort sur le comptoir.
   · L'adaptateur : l'état q de l'événement devient un état de boutique en lecture seule (etatVue : GAME.newState, jamais sauvé, comme
     la visite d'un copain), dont les stations sont les postes du Manoir (niveaux, fournées actives, monstres embauchés) ; le mobilier
     est celui de la boutique, complété par ce que l'événement a gagné (des tables de plus à chaque monstre…). SCENE.setEvenement(vue)
     bascule la scène (la vie de la boutique attend de côté) ; detruire() appelle SCENE.setEvenement(null) : tout revient.
   · L'écran : la scène se voit par une fenêtre (la place du canvas du Manoir) entre le haut de l'écran et le tiroir des cartes ; la
     boutique, ses boutons et son tiroir sont masqués dessous. Une feuille de style ajoutée une fois porte ces règles (classes
     .ht-boutique sur #hantee et sur body). */
const BOUTIQUE_HANTEE = (() => {
  'use strict';
  const G = typeof GAME !== 'undefined' ? GAME : null;
  // l'équipe du Manoir, poste par poste (src/hantee.js, PRODUITS : staffNom), et ce que porte chaque poste (PERSOS : 'ht-acidule'…)
  const EQUIPE = ['fantome2', 'momie2', 'squelette', 'vampire2', 'sorciere2', 'citrouille', 'loupgarou', 'dragonne'];
  const CLIENTS = ['sorciere', 'vampire', 'fantome', 'momie'];
  const GARDE = { tete: { forme: 'chapeau', metal: 'hantee' }, haut: { forme: 'cape', metal: 'hantee' }, pieds: { forme: 'bottes', metal: 'hantee' }, accessoire: null, cle: 'hantee' };
  const R = () => (typeof HANTEE !== 'undefined' ? HANTEE : null);
  // l'interrupteur : ?boutique=1, la scène de la boutique en 3D, et le canvas de l'écran de la Maison hantée (pas celui d'une visite)
  const demande = () => typeof location !== 'undefined' && /[?&]boutique=1(&|$)/.test(location.search);
  const actif = (cv) => demande() && typeof SCENE !== 'undefined' && !!SCENE.webgl && !!SCENE.setEvenement && !!G && !!R() && (!cv || !!(cv.closest && cv.closest('#hantee')));

  // ─── l'adaptateur : l'état de l'événement → un état de boutique (ses stations, son mobilier) ───
  function mobilier(reel, q) { // le mobilier de la boutique, et au moins ce que le Manoir a gagné (il se remplit au fil des monstres et des paliers)
    const n = q.postes.filter((s) => s.niv > 0).length, e = q.postes.filter((s) => s.staff).length, p = (q.paliers || []).length;
    const min = { tables: 2 + e, four: 1 + Math.floor(n / 2), vitrine: 1 + Math.floor(n / 3), caisse: 1 + Math.floor(p / 4), froid: 1 + Math.floor(e / 3), deco: 1 + Math.floor(p / 3), bar: 1 + Math.floor(e / 3), banquette: 1 + Math.floor(p / 4), terrasse: 1 + Math.floor(p / 5) };
    const m = {}; for (const x of G.MOBILIER) m[x.id] = Math.min(x.max, Math.max(G.mobilierCran(reel, x.id), min[x.id] || 0)); return m;
  }
  function stations(st, q) { // les postes du Manoir sont les stations : niveau, fournée en cours (actif, prog), monstre embauché
    q.postes.forEach((s, i) => { const t = st.stations[i]; if (!t) return; t.niv = s.niv; t.staff = !!s.staff; t.actif = !!s.actif; t.prog = s.prog || 0; });
    st.mobilier = mobilier(st.reel, q); return st;
  }
  function etatVue(reel, q, now) {
    const st = G.newState(now);
    Object.defineProperty(st, 'reel', { value: reel, enumerable: false }); // (jamais sauvé : la vue n'est qu'à l'écran)
    st.visite = true; st.nomBoutique = reel.nomBoutique; st.amenagement = reel.amenagement || null; // ses meubles à leur place
    st.chat = { nom: 'Minuit', caresses: 0, dernier: 0, adopte: now }; st.chatNoir = true;
    st.evTimer = 1e9; st.mystereTimer = 1e9; st.chatAttente = null; // rien ne surgit
    st.vueEv = { decor: 'hantee', tags: ['halloween', 'feuilles'], deguisements: CLIENTS };
    st.stations = R().PRODUITS.map(() => ({ niv: 0, staff: false, prog: 0, actif: false }));
    return stations(st, q);
  }
  const vueDe = () => ({ id: 'hantee', compagnon: 'chat-noir', garde: GARDE, equipe: EQUIPE, friandises: R().PRODUITS.map((p) => 'ht-' + p.id), noms: R().PRODUITS.map((p) => p.staffNom), cadre: { haut: 0, bas: 0 } });

  // ─── l'écran : la fenêtre sur la scène ───
  let style = null;
  function feuille() {
    if (style || typeof document === 'undefined') return; style = document.createElement('style'); style.id = 'ht-boutique-style';
    style.textContent = `body.ht-boutique #tiroir, body.ht-boutique #scene-wrap > :not(canvas) { visibility: hidden; }
#hantee.ht-boutique { background: transparent; }
#hantee.ht-boutique > .at-haut { background: var(--ht-fond); }
#hantee.ht-boutique > .pq-solde { background: var(--ht-fond); margin: 0; padding-bottom: 10px; border-radius: 0 0 20px 20px; box-shadow: 0 6px 14px rgba(21, 17, 31, .45); position: relative; z-index: 1; }
#hantee.ht-boutique > .pq-scene { flex: 0 0 auto; height: clamp(220px, 38vh, 340px); margin: -20px 0 -22px; border-radius: 0; background: transparent; box-shadow: none; }
#hantee.ht-boutique > .pq-scene > canvas { visibility: hidden; }
#hantee.ht-boutique > .pq-scene > .pq-ev { z-index: 2; bottom: 30px; }
#hantee.ht-boutique > .pq-scene ~ * { background: var(--ht-fond); }
#hantee.ht-boutique > .pq-scene + * { position: relative; border-radius: 22px 22px 0 0; padding-top: 12px; box-shadow: 0 -6px 16px rgba(21, 17, 31, .45); }
#hantee.ht-boutique > .pq-cartes-liste { flex: 1 1 0; min-height: 190px; }`;
    document.head.appendChild(style);
  }

  // ─── la « scène » de l'écran de l'événement : la même API que sceneManoir (frame, redim, vente, fete, coup, equipe, detruire…) ───
  function scene(cv, X) {
    if (!actif(cv)) return null;
    const reel = X && X.st ? X.st() : null, q0 = X && X.q ? X.q() : null; if (!reel || !q0) return null;
    const el = cv.closest('#hantee'), fenetre = cv.parentElement, can = document.getElementById('scene');
    const st = etatVue(reel, q0, q0.now || Date.now()), vue = vueDe();
    feuille(); el.classList.add('ht-boutique'); document.body.classList.add('ht-boutique');
    let tCadre = 0, fini = false;
    function redim() { // la fenêtre de l'écran, en px du canvas de la boutique : la scène y descend
      if (!fenetre || !can) return; const f = fenetre.getBoundingClientRect(), c = can.getBoundingClientRect(), dessus = fenetre.previousElementSibling; if (!c.height) return;
      const haut = Math.max(0, Math.round((dessus ? dessus.getBoundingClientRect().bottom : f.top) - c.top - 2)), bas = Math.max(0, Math.round(f.bottom - c.top)); // le mur commence juste sous le bandeau du haut
      if (haut !== vue.cadre.haut || bas !== vue.cadre.bas) { vue.cadre.haut = haut; vue.cadre.bas = bas; SCENE.setEvenement(vue); }
    }
    SCENE.setEvenement(vue); redim();
    const fmt = (n) => (R().fmtEur ? R().fmtEur(n) : String(Math.round(n)));
    return {
      get perdu() { return 0; }, // le contexte est celui de la boutique (src/scene.js le surveille)
      get hd() { const e = SCENE.evenement; return { actif: !!(e && e.hd), boutique: true, persos: e ? e.apprentis.length : 0, costumes: e ? e.apprentis.map((a) => a.costume) : [] }; },
      get vue() { return vue; }, get etat() { return st; },
      redim,
      frame(dt, qq) {
        if (fini) return; stations(st, qq || q0);
        if ((tCadre -= dt) <= 0) { tCadre = 0.5; redim(); } // la fenêtre suit la mise en page (le tiroir des activités, une rotation)
        const t = (qq && qq.now) || Date.now(); st.now = t; SCENE.frame(dt, st, t);
      },
      equipe: () => {}, // les monstres embauchés arrivent d'eux-mêmes à leur poste (les stations)
      vente: (gros) => { if (gros > 0) SCENE.vente(0, gros, '+' + fmt(gros), false); }, // le texte qui flotte ; le bouche-à-oreille amène du monde
      fete: () => SCENE.fete(), coup: () => {},
      detruire() { if (fini) return; fini = true; SCENE.setEvenement(null); el.classList.remove('ht-boutique'); document.body.classList.remove('ht-boutique'); },
      get calls() { return SCENE.stats.calls; },
    };
  }
  return { actif, demande, scene, etatVue, stations, mobilier, EQUIPE, CLIENTS, GARDE };
})();
if (typeof module !== 'undefined') module.exports = BOUTIQUE_HANTEE;
