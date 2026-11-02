/* LE FOURNIL — le catalogue des vignettes (outils/vignettes) : pour chaque objet du carnet « Mes décos » qui a un objet 3D, comment le bâtir
   seul avec le vrai code du jeu, et comment il se pose dans le studio (src : outils/vignettes/studio.js).
   · les décos (le Quartier, la Maison hantée, le classement, Ma chaîne) : MEUBLES.DECOS[id].faire puis MEUBLES.fusion, comme la scène ; la
     vitrine des coupes : MEUBLES.trophees ; le scooter, peint en 2D dans la boutique (src/scene.js), bâti ici en volumes de la même façon ;
   · les compagnons : PERSOS.compagnon, assis ; le pigeon voyageur, qui n'a pas de modèle dans le jeu, bâti ici à la manière des oiseaux de
     PERSOS (la poule, le canard) ;
   · les recettes de saison : PERSOS.patisserieSaison ;
   · la garde-robe : le boulanger 3D (src/equipe3d.js, le lot HD « equipe ») habillé de la pièce, dont on ne garde que la pièce (ses kits, et
     le tissu du corps qu'elle recolore : le sweat, la veste, la robe sous la cape ; les chaussures) ; l'aura : le boulanger entier ;
   · les trophées de la boutique et de l'arrière-salle : un petit objet chacun, en primitives de src/modeles.js (objets-trophees.js) ;
   · les habillages de l'arrière-salle : le tapis, le dos des cartes, les jetons (objets-trophees.js), la roue (ARRIERE.ROUE.creer, la vraie).
   Les titres, les cartes postales et le croupier n'ont pas d'objet 3D : ils gardent leur icône (le croupier, son dessin SVG). */
const VIG = (() => {
  'use strict';
  const T = THREE, G = GAME, M = MODELES, CH = CHAINE, C = CASINO, TAU = Math.PI * 2, HP = Math.PI / 2;
  // ─── le contexte des meubles (test/atelier.html, ctxDe) : la boutique du village, 390 × 714, la caméra de la scène ───
  const W = 390, H = 714, PITCH = 52 * Math.PI / 180, SY = Math.sin(PITCH), CY = Math.cos(PITCH);
  VIE.resize(W, H, 354); const LAY = VIE.LAY;
  const ctx = { LAY, K: VIE.K, W, H, Q: VIE.DECORS.village, wz: (ys) => (ys - LAY.murH) / SY, wy: (px) => px / CY, wd: (px) => px / SY, SY, CY, tags: [], rush: false, t: 0, sk: VIE.ciel(13),
    crans: { tables: 0, four: 0, vitrine: 0, caisse: 0, froid: 0, deco: 0 }, niv: [1, 1, 1, 1, 0, 0, 0, 0], staffs: 2, bonus: 0, rang: 2 };
  // l'instant des parties vives : la même pour toutes (les aiguilles à 10 h 10, les lueurs à mi-soir, la queue du chien, les ailes du moulin…)
  const E = { t: 0.4, lampes: 0.5, d: new Date(Date.UTC(2026, 9, 8, 10, 10)), nuit: false, chaud: true, caisseFlash: 0, rush: false };
  const grp = (...o) => { const g = new T.Group(); for (const x of o) if (x) g.add(x); return g; };

  // ═══ les décos ═══
  const MUR_LACET = STUDIO.AZ * 0.65, PEINTES = new Set(['graffiti', 'toiles']); // (peintes ou tendues à même le mur : sans ombre)
  function deco(id) {
    if (id === 'vitrine-coupes') return { g: grp(MEUBLES.trophees(['or', 'argent', 'bronze'], ctx)), appui: 'sol' }; // (les trois coupes du podium)
    if (id === 'scooter') return { g: OBJ.scooter(), appui: 'sol' };
    const x = MEUBLES.DECOS[id]; if (!x || !x.faire) return null;
    const place = id === 'toiles' ? LAY.decos.find((p) => p.id === 'r1') : null; // (la toile : une seule, tendue dans le coin de sa place ; sans place, la boutique en tend deux, aux deux bouts du mur)
    const d = x.faire(ctx, place, {}), f = MEUBLES.fusion([{ d, place: null }]), mur = x.type === 'mur' || id === 'toiles', g = grp(f.petits, f.lueurs);
    if (mur) g.rotation.y = MUR_LACET; // (ce qui s'accroche au mur se tourne un peu vers nous : vu presque de face, comme dans la boutique)
    return { g, appui: PEINTES.has(id) ? 'aucun' : mur ? 'mur' : 'sol', apres: () => f.anime(E) };
  }
  // ═══ les compagnons ═══
  function compagnon(id) {
    const g = id === 'pigeon' ? OBJ.pigeon() : PERSOS.compagnon(id);
    if (id !== 'pigeon') PERSOS.animerCompagnon(g, { etat: 'assis', phase: 0, t: 0.4 });
    g.rotation.y = -0.2; return { g: grp(g), appui: 'sol' };
  }
  // ═══ les recettes de saison ═══
  function saison(id) { const m = PERSOS.patisserieSaison(id); m.rotation.y = 0.35; return { g: grp(m), appui: 'sol' }; }

  // ═══ la garde-robe : le boulanger 3D, sa tenue portée, dont on ne montre que la pièce ═══
  const EQ = { st: null };
  function preparerEquipe() { // (rend vrai quand l'équipe 3D est prête : le lot chargé, les corps et les kits cuits)
    if (typeof EQUIPE3D === 'undefined' || !EQUIPE3D.actif) return 'absente';
    if (!EQ.st) { EQ.st = G.newState(0); HDM.charger('equipe'); }
    if (HDM.etat.equipe && HDM.etat.equipe.erreur) return 'erreur : ' + HDM.etat.equipe.erreur;
    if (!HDM.pret('equipe')) return 'lot';
    for (let k = 0; k < 400 && !EQUIPE3D.pret && !EQUIPE3D.erreur; k++) EQUIPE3D.preparer(EQ.st, 2, '');
    return EQUIPE3D.erreur ? 'erreur : ' + EQUIPE3D.erreur : EQUIPE3D.pret ? 'prete' : 'cuisson';
  }
  const PIECES = ['tete', 'haut', 'pieds', 'accessoire'], EMP = { tete: 'T', haut: 'H', pieds: 'P', accessoire: 'A' };
  // ce qui se montre de chaque pièce : ses kits (son emplacement) et les rôles du corps qui la portent ou qu'elle teint ; le reste du corps est
  // caché (la pièce « sur un mannequin invisible ») : le haut, sur la veste du Chef (le tablier par-dessus ; le sweat, la robe sous la cape et
  // la veste de patron la recolorent) ; les chaussures, avec le dessus et la semelle du pied ; le foulard, avec le col qu'il noue
  const VESTE = ['veste', 'poignet', 'ourletV', 'boutons', 'foulard'], ROLES = { haut: VESTE, pieds: ['chaussure', 'semelleM', 'botte'], foulard: ['foulard'] };
  function tenue(id) {
    if (!EQUIPE3D.pret) throw new Error('équipe 3D pas prête');
    const aura = id.startsWith('aura-'), O = G.GARDEROBE.objets, v = aura ? null : O[id]; if (!aura && !v) return null;
    // la tenue, comme GAME.tenueBoulanger la décrit : la pièce, les autres de base (pas d'accessoire) ; une aura : la tenue de base, l'aura portée
    const ids = {}; for (const p of PIECES) ids[p] = v && v.piece === p ? id : p === 'accessoire' ? '' : G.GARDEROBE.base[p];
    const garde = { aura: aura ? id.slice(5) : null }; for (const p of PIECES) { const x = O[ids[p]]; garde[p] = x ? { forme: x.forme, metal: x.collection === 'base' ? null : x.collection } : null; }
    garde.cle = PIECES.map((p) => ids[p]).join('|') + (garde.aura ? `|aura:${garde.aura}` : '');
    const a = EQUIPE3D.boulanger(2, garde, 'Le Fournil', null); if (!a) throw new Error('pas de boulanger');
    // la pose : Idle à 0,8 s, quelle que soit la vignette d'avant (le mélangeur remis à l'heure, une image)
    const poser = () => EQUIPE3D.poserBoulanger(a, { t: 0.8, hop: 0, rush: false, vue: true }, 1 / 30, { K: a.pr.hauteur / EQUIPE3D.HAUT, x: 0, y: 0, z: 0, yaw: 0 });
    poser(); a.mixer.setTime(0.8 - 1 / 30); poser(); // (la première fois, poserBoulanger lance Idle ; puis le temps du clip est posé)
    a.g.rotation.set(0, 0, 0); a.yaw = 0; a.g.updateMatrixWorld(true);
    const geo = a.S.geometry, h = a.habit, avant = geo.index, n = geo.attributes.position.count, garder = new Uint8Array(n);
    if (aura) garder.fill(1);
    else {
      const emp = v.forme === 'lunettes' ? 'A' : EMP[v.piece];
      const sans = v.forme === 'foulard' ? ['A.clair', 'A.bijou'].map((r) => EQUIPE3D.ROLES.indexOf(r)) : []; // (le foulard : sans ses rayures, pois et chiffres brodés, un peu plus larges que ses pans ; portés, la veste derrière les cache)
      for (const k of h.kits) if (k.emp === emp) for (let i = k.v0; i < k.v1; i++) if (!sans.includes(h.R[i])) garder[i] = 1;
      const ri = (ROLES[v.forme === 'foulard' ? 'foulard' : v.piece] || []).map((r) => EQUIPE3D.ROLES.indexOf(r)).filter((i) => i >= 0);
      for (let i = 0; i < h.nCorps; i++) if (ri.includes(h.R[i])) garder[i] = 1;
    }
    const tris = []; for (let k = 0; k < avant.count; k += 3) { const x = avant.getX(k), y = avant.getX(k + 1), z = avant.getX(k + 2); if (garder[x] && garder[y] && garder[z]) tris.push(x, y, z); }
    geo.setIndex(new T.BufferAttribute(n > 65535 ? new Uint32Array(tris) : new Uint16Array(tris), 1));
    if (a.aura) a.aura.userData.horsCadre = true; // (l'aura : un halo autour de lui, pas dans le cadre ni dans l'ombre)
    const g = grp(a.g); g.rotation.y = v && v.piece === 'pieds' ? -0.55 : 0.1; // (presque de face : ce qui se porte devant se lit ; les chaussures, de trois quarts profil)
    // sans le corps, le vêtement se voit aussi de l'intérieur (l'encolure, les pans du foulard de biais) : ses faces des deux côtés
    const apres = () => { a.S.material.side = T.DoubleSide; };
    return { g, appui: 'sol', marge: aura ? 0.14 : undefined, apres, fin: () => { geo.setIndex(avant); a.S.material.side = T.FrontSide; g.remove(a.g); } };
  }

  // ═══ le catalogue : les familles du carnet (src/chaine.js, avec celles de l'arrière-salle), ce qui a une vignette, et comment la bâtir ═══
  const FAB = {
    quartier: deco, hantee: deco, podium: deco, chaine: deco, compagnons: compagnon, saison, tenues: tenue,
    trophees: (id) => OBJ.trophee(id), 'casino-trophees': (id) => OBJ.tropheeCasino(id), 'casino-skins': (id) => OBJ.skin(id),
  };
  const SANS = { titres: 'pas d’objet 3D : l’icône des titres', cartes: 'pas d’objet 3D : l’icône des cartes postales' };
  // les habillages par défaut ne sont pas au carnet (on les a d'office) mais le carnet du croupier montre leur aperçu : ils ont leur vignette
  const DEFAUTS = Object.entries(C.SKINS).map(([cat, l]) => l.find((s) => s.defaut)).map((s, k) => `${Object.keys(C.SKINS)[k]}-${s.id}`);
  function familles() { return [...CH.FAMILLES, ...CH.familleCasino(C)].map((f) => ({ id: f.id, nom: f.nom, items: f.items.map((x) => ({ id: x.id, nom: x.nom })) })); }
  function liste() { // [{ famille, id, nom }] : tout ce qui a une vignette ; et ce qui garde son icône, avec la raison
    const out = [], sans = [];
    for (const f of familles()) {
      if (SANS[f.id]) { for (const x of f.items) sans.push({ famille: f.id, id: x.id, raison: SANS[f.id] }); continue; }
      const items = f.id === 'casino-skins' ? [...DEFAUTS.map((id) => ({ id, nom: id })), ...f.items] : f.items;
      for (const x of items) { if (f.id === 'casino-skins' && x.id.startsWith('croupier-')) { sans.push({ famille: f.id, id: x.id, raison: 'pas de croupier en 3D : son dessin SVG (src/arriere.js, croupierSVG)' }); continue; } out.push({ famille: f.id, id: x.id, nom: x.nom }); }
    }
    return { liste: out, sans };
  }
  function rendre(famille, id, o) {
    const fab = FAB[famille]; if (!fab) throw new Error('famille sans vignette : ' + famille);
    const x = fab(id); if (!x) throw new Error(`objet inconnu : ${famille}/${id}`);
    try {
      return STUDIO.rendre(x.g, Object.assign({ appui: x.appui, apres: x.apres }, x.marge != null ? { marge: x.marge } : {}, o || {}));
    } finally {
      if (x.fin) x.fin();
      x.g.traverse((m) => { if (m.isMesh && m.geometry && !m.geometry.userData.cache && !m.isSkinnedMesh && !m.geometry.userData.partagee) m.geometry.dispose(); });
    }
  }
  // ─── la planche de contrôle : chaque famille, chaque vignette en grand sur un damier (sa transparence), puis à 64 px et à 44 px sur le
  //     blanc du carnet, et grisée à 44 px (une vignette pas encore gagnée) ; son id dessous ───
  async function planche(fams) {
    const COL = 8, TW = 150, TH = 214, TETE = 34, W2 = COL * TW, H2 = fams.reduce((h, f) => h + TETE + Math.ceil(f.items.length / COL) * TH, 0) + 10;
    const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2; const x = cv.getContext('2d'); x.fillStyle = '#FFF7EC'; x.fillRect(0, 0, W2, H2);
    const charger = (src) => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });
    const blanc = (x0, y0, c) => { x.fillStyle = '#FFFFFF'; x.beginPath(); x.roundRect(x0, y0, c, c, c * 0.27); x.fill(); x.strokeStyle = '#EADFD6'; x.lineWidth = 1; x.stroke(); };
    let y = 4;
    for (const f of fams) {
      x.fillStyle = '#4A3328'; x.font = '700 18px sans-serif'; x.textBaseline = 'middle'; x.fillText(`${f.id} · ${f.items.length}`, 10, y + TETE / 2); y += TETE;
      for (let i = 0; i < f.items.length; i++) {
        const it = f.items[i], x0 = (i % COL) * TW, y0 = y + Math.floor(i / COL) * TH, im = await charger(it.src);
        for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) { x.fillStyle = (a + b) % 2 ? '#EFE6DC' : '#FAF5EF'; x.fillRect(x0 + 9 + a * 11, y0 + 4 + b * 11, 11, 11); }
        x.drawImage(im, x0 + 9, y0 + 4, 132, 132);
        blanc(x0 + 6, y0 + 142, 64); x.drawImage(im, x0 + 6, y0 + 142, 64, 64);
        blanc(x0 + 76, y0 + 142, 44); x.drawImage(im, x0 + 76, y0 + 142, 44, 44);
        blanc(x0 + 124, y0 + 162, 24); x.save(); x.filter = 'grayscale(1)'; x.globalAlpha = 0.5; x.drawImage(im, x0 + 124, y0 + 162, 24, 24); x.restore();
        x.fillStyle = '#4A3328'; x.font = '600 11px sans-serif'; x.textBaseline = 'alphabetic'; const t = it.id.length > 22 ? it.id.slice(0, 21) + '…' : it.id; x.fillText(t, x0 + 76, y0 + 200);
      }
      y += Math.ceil(f.items.length / COL) * TH;
    }
    return cv.toDataURL('image/png');
  }
  return { liste, familles, rendre, preparerEquipe, planche, ctx, E, DEFAUTS };
})();
