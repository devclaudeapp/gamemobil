// Les meubles de la salle du Fournil (lot A) : le plan (src/vie.js, LAY.sieges) et les clients qui s'y installent, sur la vraie page.
// 1) Sans navigateur : sur iPhone 390 × 844 et 360 × 640, chaque chemin vers une place (et le retour) longe les meubles sans les traverser,
//    et tout le plan tient au-dessus du tiroir fermé.
// 2) Dans Chromium : bar, coin salon et terrasse achetés, un client vient s'asseoir à chacun (au bar, sur la banquette, en terrasse) ;
//    les couverts restent cachés tant que personne n'est assis ; les zones de touche ouvrent la fiche de chaque meuble ; le budget
//    d'appels de dessin du décor tient, en éco et en haute (meubles KayKit, fournil/hd/meubles2/) ; aucune erreur dans la page.
// 1 ter) Les constats de la relecture du lot 4 : le doigt au centre d'un meuble le prend (pas celui de dessous), le coin du chat loin de l'allée,
//    le chat et le client en route recasés quand un meuble bouge, un plan qui ne tient pas sur l'écran (Déplacer part du plan affiché),
//    un écran large (grille bornée au code compact), les colonnes et les cordons du trottoir sans recouvrement.
// Les décos de la Maison hantée gagnées (citrouilles, toiles, chaudron, fantôme, toque, et l'étagère aux bocaux de monstres du bestiaire)
// posées en plus, tout au max : le budget tient encore ; et la lanterne de la légende (le 20e palier, lot 6) : deux appels de plus, au plus
// (captures acharnes-*.png dans SHOTS_ACHARNES). Captures 390×844 dans test/shots/meubles/ (et, celle des bocaux, dans SHOTS_BESTIAIRE).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-meubles.cjs   (--plan : la partie 1 seule)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_MEUBLES || 8870;
const out = path.join(__dirname, 'shots', 'meubles'); fs.mkdirSync(out, { recursive: true });
const out3 = process.env.SHOTS_BESTIAIRE ? (fs.mkdirSync(process.env.SHOTS_BESTIAIRE, { recursive: true }), process.env.SHOTS_BESTIAIRE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };

// ─── 1) le plan, sans navigateur ───
global.GAME = require(path.join(root, 'src', 'game.js'));
const VIE = require(path.join(root, 'src', 'vie.js'));
const SY = Math.sin(52 * Math.PI / 180);
function obstacles(L) { // l'emprise au sol de chaque meuble (en pixels du plan : x, et y projeté) : { nom, dedans(x, y) }
  const K = L.K, o = [], disque = (nom, x, y, r) => o.push({ nom, dedans: (px, py) => ((px - x) / r) ** 2 + ((py - y) / (r * SY)) ** 2 < 1 });
  const rect = (nom, x, y, w, d) => o.push({ nom, dedans: (px, py) => Math.abs(px - x) < w / 2 && Math.abs(py - y) < d * SY / 2 });
  L.tables.forEach((t, i) => { disque(`table ${i + 1}`, t.x, t.y, 16 * K); for (const s of t.sieges) rect(s.id, s.x, s.y, 13 * K, 14 * K); });
  L.terrasse.forEach((t, i) => { disque(`terrasse ${i + 1}`, t.x, t.y, 12 * K); for (const s of t.sieges) rect(s.id, s.x, s.y, 13 * K, 14 * K); });
  const b = L.bar; rect('bar', (b.x0 + b.x1) / 2, b.y - 2 * K, b.x1 - b.x0, 15 * K);
  for (const s of L.sieges) if (s.zone === 'bar') disque(s.id, s.x, s.y, 6 * K);
  const q = L.banquette, f = L.sieges.find((s) => s.id === 'fauteuil');
  rect('banquette', q.x, q.y - 3 * SY, 54 * K, 22 * K); rect('table basse', q.table.x, q.table.y, 28 * K, 16 * K); rect('fauteuil', f.x, f.y, 22 * K, 22 * K); disque('lampe', q.lampe.x, q.lampe.y, 6 * K);
  const dv = L.devanture; o.push({ nom: 'devanture', dedans: (px, py) => Math.abs(py - dv.y) < 4 && (px < dv.porte.x0 + 3 || px > dv.porte.x1 - 3) });
  const p = L.presentoir; o.push({ nom: 'présentoir', dedans: (px, py) => px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h });
  disque('plante', L.plante.x, L.plante.y, 9);
  for (const x of L.standingSol || []) o.push({ nom: x.nom, dedans: (px, py) => px > x.r.x && px < x.r.x + x.r.w && py > x.r.y && py < x.r.y + x.r.h }); // le standing : les colonnes et les cordons du trottoir
  return o;
}
function traverse(L, chemin, permis) { // le premier meuble qu'un chemin (liste de points) traverse, en dehors de ceux permis (sa place, sa table)
  const obs = obstacles(L).filter((x) => !permis.includes(x.nom));
  for (let i = 1; i < chemin.length; i++) {
    const a = chemin[i - 1], b = chemin[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
    for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n; for (const ob of obs) if (ob.dedans(x, y)) return `${ob.nom} (${x | 0}, ${y | 0})`; }
  }
  return null;
}
for (const [w, h, mi, nom] of [[390, 716, 356, 'iPhone 390 × 844'], [360, 514, 229, 'iPhone 360 × 640']]) {
  console.log(`── le plan, ${nom} (scène ${w} × ${h}) ──`);
  VIE.resize(w, h, mi); const L = VIE.LAY;
  const parZone = {}; for (const s of L.sieges) parZone[s.zone] = (parZone[s.zone] || 0) + 1;
  check(parZone.table === 12 && parZone.bar === 4 && parZone.banquette === 3 && parZone.terrasse === 6 && L.sieges.every((s) => s.id && s.meuble && s.rang >= 0 && Array.isArray(s.voie)),
    `25 places nommées : ${JSON.stringify(parZone)} (12 aux tables, 4 tabourets, 3 au salon, 6 dehors)`);
  const ko = [];
  for (const s of L.sieges) {
    const permis = [s.id, s.zone === 'bar' ? 'bar' : '', s.table && s.zone === 'table' ? `table ${L.tables.indexOf(s.table) + 1}` : '', s.zone === 'terrasse' ? `terrasse ${L.terrasse.indexOf(s.table) + 1}` : '', s.zone === 'banquette' ? (s.id === 'fauteuil' ? 'fauteuil' : 'banquette') : ''].filter(Boolean);
    const aller = [{ x: L.allee, y: L.T * 0.76 }, ...s.voie, { x: s.x, y: s.y }];
    const retour = s.zone === 'terrasse' ? [{ x: s.x, y: s.y }, { x: s.x, y: L.trottoir.rue }, { x: s.x < w * 0.6 ? -20 : w + 20, y: L.trottoir.rue }] : [{ x: s.x, y: s.y }, ...s.voie.slice().reverse(), { x: L.allee, y: L.alleeHaut }];
    const t1 = traverse(L, aller, permis), t2 = traverse(L, retour, permis);
    if (t1 || t2) ko.push(`${s.id} : ${t1 ? 'aller → ' + t1 : ''} ${t2 ? 'retour → ' + t2 : ''}`);
  }
  check(ko.length === 0, `aucun chemin ne traverse un meuble (allées, porte de la devanture, rue) ${ko.slice(0, 4).join(' | ')}`);
  const bas = Math.max(...Object.values(L.emplacements).map((r) => r.y + r.h), L.trottoir.bord);
  check(bas <= h - 37, `tout le plan (jusqu'au bord du trottoir, ${bas | 0} px) tient au-dessus du tiroir fermé (${h - 37} px)`);
  check(L.rangees[0] + 4 < L.trottoir.y && L.bar.y < L.devanture.y && L.devanture.y < L.terrasse[0].y && L.terrasse[0].y < L.trottoir.bord, 'de haut en bas : les tables, le bar, la devanture, la terrasse, le bord du trottoir');
}

// ─── 1 bis) « tout déplaçable » (st.amenagement) : le plan d'origine inchangé ; 30 aménagements tirés au hasard (un meuble à la fois, comme
//     au doigt), chacun validé par VIE.proposer puis appliqué par la frame, gardent TOUS les invariants ci-dessus ; les places interdites
//     sont refusées avec leur raison ; un aménagement qui ne tient pas sur l'écran (la photo d'un autre téléphone) vaut le plan d'origine ───
const MAINTENANT = Date.UTC(2026, 9, 17, 9);
const IDS_MOBILES = ['table1', 'table2', 'table3', 'table4', 'table5', 'table6', 'bar', 'salon', 'terrasse1', 'terrasse2', 'terrasse3'];
function invariants(L, w, h, ids0) { // les mêmes vérifications que le plan d'origine ; rend la liste des fautes
  const ko = [], parZone = {}; for (const s of L.sieges) parZone[s.zone] = (parZone[s.zone] || 0) + 1;
  if (!(parZone.table === 12 && parZone.bar === 4 && parZone.banquette === 3 && parZone.terrasse === 6)) ko.push('places ' + JSON.stringify(parZone));
  if (L.sieges.map((s) => s.id).join() !== ids0) ko.push('ids des sièges changés');
  for (const s of L.sieges) {
    const permis = [s.id, s.zone === 'bar' ? 'bar' : '', s.table && s.zone === 'table' ? `table ${L.tables.indexOf(s.table) + 1}` : '', s.zone === 'terrasse' ? `terrasse ${L.terrasse.indexOf(s.table) + 1}` : '', s.zone === 'banquette' ? (s.id === 'fauteuil' ? 'fauteuil' : 'banquette') : ''].filter(Boolean);
    const aller = [{ x: L.allee, y: L.T * 0.76 }, ...s.voie, { x: s.x, y: s.y }];
    const retour = s.zone === 'terrasse' ? [{ x: s.x, y: s.y }, { x: s.x, y: L.trottoir.rue }, { x: s.x < w * 0.6 ? -20 : w + 20, y: L.trottoir.rue }] : [{ x: s.x, y: s.y }, ...s.voie.slice().reverse(), { x: L.allee, y: L.alleeHaut }];
    const t1 = traverse(L, aller, permis), t2 = traverse(L, retour, permis); if (t1 || t2) ko.push(`${s.id} : ${t1 ? 'aller → ' + t1 : ''} ${t2 ? 'retour → ' + t2 : ''}`);
    if (Math.abs(s.voie[0].x - L.allee) > 0.01) ko.push(`${s.id} : sa voie ne part pas de l’allée`);
  }
  const bas = Math.max(...Object.values(L.emplacements).map((r) => r.y + r.h), L.trottoir.bord); if (bas > h - 37) ko.push(`bas du plan ${bas | 0} > ${h - 37}`);
  if (!(L.rangees[0] + 4 < L.trottoir.y && L.bar.y < L.devanture.y && L.devanture.y < L.terrasse[0].y && L.terrasse[0].y < L.trottoir.bord)) ko.push('ordre vertical');
  if (L.terrasse.some((t) => Math.abs(t.y - L.terrasse[0].y) > 1e-9)) ko.push('une table de la terrasse a quitté sa rangée');
  for (const m of L.mobiles) for (const x of L.standingSol || []) if (m.r.x < x.r.x + x.r.w && x.r.x < m.r.x + m.r.w && m.r.y < x.r.y + x.r.h && x.r.y < m.r.y + m.r.h) ko.push(`${m.id} sur ${x.nom} (standing)`);
  return ko;
}
for (const [w, h, mi, nom] of [[390, 716, 356, 'iPhone 390 × 844'], [360, 514, 229, 'iPhone 360 × 640']]) {
  console.log(`── tout déplaçable, ${nom} ──`);
  VIE.resize(w, h, mi); const st = GAME.newState(MAINTENANT); VIE.frame(0.016, st, MAINTENANT);
  const L0 = VIE.LAY, ids0 = L0.sieges.map((s) => s.id).join(), photo0 = JSON.stringify(L0.sieges.map((s) => [s.id, s.x, s.y, s.voie])) + JSON.stringify([L0.tapis, L0.emplacements, L0.bar, L0.banquette]);
  const T0 = L0.tables, yA = L0.rangees[0], yB = L0.rangees[1], K = L0.K;
  check(L0.sig === '' && VIE.valider(st, null).ok && [0.56, 0.34, 0.12, 0.56, 0.34, 0.12].every((f, i) => T0[i].x === w * f && T0[i].y === (i < 3 ? yA : yB)) && L0.bar.x0 === w * 0.08 && L0.bar.x1 === w * 0.56 && L0.banquette.x === w - 30 * K && L0.banquette.y === yA && [0.40, 0.88, 0.16].every((f, i) => L0.terrasse[i].x === w * f)
    && L0.sieges.find((s) => s.id === 'table1.g').voie[1].y === yA + 20 * K && L0.sieges.find((s) => s.id === 'banquette.d').voie[1].x === w - 14 * K, 'sans aménagement : le plan d’origine exact (tables, bar, salon, terrasse, voies dessinées à la main), et il est valide');
  let seed = w * 7919 + 13; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const vus = new Set(), fautes = []; let essais = 0, refus = 0;
  while (vus.size < 30 && essais < 4000) {
    essais++; const id = IDS_MOBILES[Math.floor(rnd() * IDS_MOBILES.length)], m = VIE.LAY.mobiles.find((o) => o.id === id), g = VIE.LAY.grille;
    const p = VIE.proposer(st, id, m.x + (rnd() - 0.5) * 9 * g.pas, m.y + (rnd() - 0.5) * 7 * g.pas); if (!p.ok) { refus++; if (!p.raison) fautes.push('refus sans raison'); continue; }
    st.amenagement = GAME.nettoyerAmenagement(p.a); VIE.frame(0.016, st, MAINTENANT); const L = VIE.LAY;
    if (L.sig !== GAME.codeAmenagement(st.amenagement)) { fautes.push(`proposé valide mais pas appliqué : ${GAME.codeAmenagement(st.amenagement)}`); continue; }
    vus.add(L.sig); for (const f of invariants(L, w, h, ids0)) fautes.push(`${L.sig} ${f}`);
  }
  check(vus.size === 30 && fautes.length === 0, `30 aménagements tirés au doigt (${essais} essais, ${refus} refusés avec leur raison), tous appliqués : 25 places aux ids stables, aucun chemin ne traverse un meuble, voies depuis l’allée, tout au-dessus du tiroir fermé, l’ordre vertical ${fautes.slice(0, 3).join(' | ')}`);
  const dernier = JSON.parse(JSON.stringify(st.amenagement)), K1 = VIE.LAY.K, g = VIE.LAY.grille, Y0 = g.y0;
  // des places interdites, chacune avec sa raison
  const tb = VIE.LAY.mobiles.find((o) => o.id === 'table1'), tb2 = VIE.LAY.mobiles.find((o) => o.id === 'table2');
  const refusAvec = [
    ['table1', VIE.LAY.allee, tb.y, /allée/, 'sur l’allée'],
    ['table1', tb2.x, tb2.y, /touche la table 2/, 'sur la table 2'],
    ['table1', w * 0.5, Y0 - g.pas, /file d’attente/, 'dans la file'],
    ['table1', w * 0.1, Y0 - 2 * g.pas, /passage des apprentis/, 'chez les apprentis'],
    ['table1', w * 0.84, Y0 - 2 * g.pas, /porte du fond/, 'devant la porte du fond'],
    ['table1', (VIE.LAY.devanture.porte.x0 + VIE.LAY.devanture.porte.x1) / 2, VIE.LAY.devanture.y - g.pas / 3, /porte de la devanture|allée/, 'contre la porte de la devanture (au bout de l’allée)'],
    ['terrasse1', VIE.LAY.allee, 0, /porte de la devanture/, 'la terrasse devant la porte'],
    ['salon', 0, VIE.LAY.mobiles.find((o) => o.id === 'salon').y, /sort de la salle|touche|plante/, 'le salon contre le mur de gauche'],
  ].map(([id, x, y, re, quoi]) => { const p = VIE.proposer(st, id, x, y); return { ok: !!p && !p.ok && re.test(p.raison), quoi, raison: p && p.raison }; });
  check(refusAvec.every((r) => r.ok), `refusées, avec la raison : ${refusAvec.map((r) => `${r.quoi} « ${r.raison} »`).join(' ; ')}`);
  { // le standing (paliers 3-4) : les colonnes et les cordons du trottoir ont leur place gardée ; une table de terrasse promenée sur toute la rangée ne les touche jamais
    const balayage = []; for (let c = 0; c < g.cols; c++) { const p = VIE.proposer(st, 'terrasse1', (c + 0.5) * g.pas, 0); balayage.push(p.ok ? 'ok' : p.raison); }
    check(VIE.LAY.standingSol && VIE.LAY.standingSol.length === 4 && balayage.some((r) => r === 'ok') && balayage.every((r) => r === 'ok' || !/colonnes|cordons/.test(r)), `le standing sur le trottoir (colonnes, cordons) : sa place gardée, la terrasse déjà tenue à l’écart par la porte (${balayage.filter((r) => r === 'ok').length}/${g.cols} colonnes libres)`); }
  check(VIE.valider(st, { v: 1, tables: [[1, 2], [1, 2], null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] }).raison === 'Ça touche la table 2.' && !VIE.valider(st, { v: 1, tables: 'x' }).ok && VIE.valider(st, null).ok, 'valider : deux tables sur la même case refusées ; un plan abîmé refusé ; l’origine acceptée');
  // un aménagement qui ne tient pas sur cet écran : le plan d'origine (la photo d'un copain sur un autre téléphone)
  st.amenagement = { v: 1, tables: [[g.cols - 1, 3], null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] }; VIE.frame(0.016, st, MAINTENANT);
  check(VIE.LAY.sig === '' && VIE.amenagementDemande !== '', 'un aménagement impossible ici (une table sur le coin salon) : la scène garde le plan d’origine');
  st.amenagement = dernier; VIE.frame(0.016, st, MAINTENANT); check(VIE.LAY.sig === GAME.codeAmenagement(dernier), 'le dernier aménagement revient');
  delete st.amenagement; VIE.frame(0.016, st, MAINTENANT); const L2 = VIE.LAY;
  check(L2.sig === '' && JSON.stringify(L2.sieges.map((s) => [s.id, s.x, s.y, s.voie])) + JSON.stringify([L2.tapis, L2.emplacements, L2.bar, L2.banquette]) === photo0, 'aménagement effacé (« Plan d’origine ») : le plan revient à l’identique, voies comprises');
}

// ─── 1 ter) les constats de la relecture du lot 4 : chacun a son test ───
const interR = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
const nouveau = () => { const st = GAME.newState(MAINTENANT); st.coins = 1e18; for (const id of ['tables', 'bar', 'banquette', 'terrasse']) for (let k = 0; k < 6; k++) GAME.ameliorerMeuble(st, id); return st; };
function plansAuHasard(st, n, graine) { // n aménagements acceptés, tirés au doigt comme en 1 bis ; rend leurs codes (VIE.LAY suit le dernier)
  let seed = graine; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648), codes = [];
  for (let e = 0; codes.length < n && e < 3000; e++) {
    const id = IDS_MOBILES[Math.floor(rnd() * IDS_MOBILES.length)], m = VIE.LAY.mobiles.find((o) => o.id === id), g = VIE.LAY.grille;
    const p = VIE.proposer(st, id, m.x + (rnd() - 0.5) * 9 * g.pas, m.y + (rnd() - 0.5) * 7 * g.pas); if (!p.ok) continue;
    st.amenagement = GAME.nettoyerAmenagement(p.a); VIE.frame(0.016, st, MAINTENANT); codes.push(VIE.LAY.sig);
  }
  return codes;
}
const casesVertes = (st, id) => { const g = VIE.LAY.grille; let n = 0; for (let r = 0; r < g.rangs; r++) for (let c = 0; c < g.cols; c++) { const p = VIE.proposer(st, id, (c + 0.5) * g.pas, g.y0 + (r + 0.5) * g.pas); if (p && p.ok) n++; } return n; };
const casesTerrasse = (st, id) => { const g = VIE.LAY.grille; let n = 0; for (let c = 0; c < g.cols; c++) { const p = VIE.proposer(st, id, (c + 0.5) * g.pas, 0); if (p && p.ok) n++; } return n; };
const vertes = (st, id) => (/^terrasse/.test(id) ? casesTerrasse(st, id) : casesVertes(st, id));
for (const [w, h, mi, nom] of [[390, 716, 356, 'iPhone 390 × 844'], [360, 514, 229, 'iPhone 360 × 640']]) {
  console.log(`── les constats du lot 4, ${nom} ──`);
  VIE.resize(w, h, mi); let st = nouveau(); VIE.frame(0.016, st, MAINTENANT);
  { const S = VIE.LAY.standingSol, ko = []; for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) if (interR(S[i].r, S[j].r)) ko.push(`${S[i].nom} × ${S[j].nom}`);
    check(S.length === 4 && !ko.length, `le standing du trottoir : les colonnes et les poteaux des cordons ne se recouvrent pas ${ko.join(' | ')}`); }
  // la prise au doigt : le centre de chaque meuble prend CE meuble, même avec un autre posé juste dessous
  { const ko = [], codes = plansAuHasard(st, 40, w * 31 + 7);
    st.amenagement = GAME.amenagementDepuisCode('----------43-------'); VIE.frame(0.016, st, MAINTENANT); if (VIE.LAY.sig) codes.push(VIE.LAY.sig);
    for (const code of codes) { st.amenagement = GAME.amenagementDepuisCode(code); VIE.frame(0.016, st, MAINTENANT);
      for (const m of VIE.LAY.mobiles) for (const [x, y] of [[m.r.x + m.r.w / 2, m.r.y + m.r.h / 2], [m.x, m.y]]) { const o = VIE.mobileSous(x, y, false); if (!o || o.id !== m.id) ko.push(`${code} : centre de ${m.id} → ${o ? o.id : 'rien'}`); } }
    check(codes.length >= 30 && !ko.length, `${codes.length} aménagements : le doigt au centre d’un meuble prend toujours ce meuble ${ko.slice(0, 3).join(' | ')}`); }
  // le coin du chat et ses spots d'un plan aménagé : loin de l'allée (plus de 30·K de l'axe), hors du couloir des clients
  { const ko = [], codes = plansAuHasard(st, 40, w * 17 + 3);
    for (const code of codes) { st.amenagement = GAME.amenagementDepuisCode(code); VIE.frame(0.016, st, MAINTENANT); const L = VIE.LAY, K = L.K, ch = L.emplacements.chat;
      if (interR(ch, { x: L.allee - 12 * K, y: L.grille.y0, w: 24 * K, h: L.devanture.y - L.grille.y0 })) ko.push(`${code} : le coin du chat dans l’allée`);
      for (const k of [0, 1]) if (Math.abs(L.chatSpots[k].x - L.allee) < 30 * K - 1e-6) ko.push(`${code} : spot ${k} à ${Math.abs(L.chatSpots[k].x - L.allee) | 0} px de l’allée`); }
    check(codes.length >= 30 && !ko.length, `${codes.length} aménagements : le coin du chat et ses spots loin de l’allée ${ko.slice(0, 3).join(' | ')}`); }
  delete st.amenagement; VIE.frame(0.016, st, MAINTENANT);
  // le chat assis là où l'on pose une table : il se lève et va à un coin libre
  { st.chat = { nom: 'Mimi', caresses: 0, dernier: 0, adopte: MAINTENANT }; VIE.frame(0.016, st, MAINTENANT); const c = VIE.chat, L = VIE.LAY, sp = L.chatSpots[0];
    Object.assign(c, { haut: false, etat: 'assis', x: sp.x, y: sp.y, t: 30, saut: 0, cible: null });
    const g = L.grille; let pose = null; for (let r = 0; r < g.rangs && !pose; r++) for (let k = 0; k < g.cols && !pose; k++) { const p = VIE.proposer(st, 'table1', (k + 0.5) * g.pas, g.y0 + (r + 0.5) * g.pas); if (p.ok && interR(p.rect, { x: sp.x - 1, y: sp.y - 1, w: 2, h: 2 })) pose = p; }
    if (pose) { st.amenagement = GAME.nettoyerAmenagement(pose.a); VIE.frame(0.016, st, MAINTENANT); for (let i = 0; i < 60; i++) VIE.frame(1 / 30, st, MAINTENANT); }
    const pt = (x, y) => ({ x: x - 0.5, y: y - 0.5, w: 1, h: 1 }), horsTable = pose && !interR(pose.rect, pt(c.x, c.y)), cible = c.cible || { x: c.x, y: c.y };
    const cibleLibre = !VIE.LAY.mobiles.some((m) => m.dedans && interR(m.r, pt(cible.x, cible.y)));
    check(!!pose && horsTable && cibleLibre, `le chat assis à son coin, une table posée dessus : en 2 s il est sorti de la table, vers un coin libre (${pose ? `${c.etat} en ${c.x | 0}, ${c.y | 0} → ${cible.x | 0}, ${cible.y | 0}` : 'aucune place de table sur le chat'})`);
    delete st.chat; delete st.amenagement; VIE.frame(0.016, st, MAINTENANT); }
  // le client en route vers une table qu'on déplace : il fait demi-tour, à pied, et s'efface en sortant (pas d'un coup au milieu de la salle)
  { VIE.forcer({}); const n0 = VIE.clients.length; VIE.installer('table', 60); const c = VIE.clients[VIE.clients.length - 1], s = c.siege, L = VIE.LAY;
    c.etat = 'vaTable'; c.chemin = [{ x: L.allee, y: L.T * 0.76 }, ...s.voie, { x: s.x, y: s.y }]; c.wp = 1; c.x = L.allee; c.y = L.T * 0.76 + 2;
    const ti = +/^table(\d)/.exec(s.id)[1], m = L.mobiles.find((o) => o.id === 'table' + ti), g = L.grille; let pose = null;
    for (let r = 0; r < g.rangs && !pose; r++) for (let k = 0; k < g.cols && !pose; k++) { const p = VIE.proposer(st, 'table' + ti, (k + 0.5) * g.pas, g.y0 + (r + 0.5) * g.pas); if (p.ok && Math.hypot(p.x - m.x, p.y - m.y) > 2 * g.pas) pose = p; }
    st.amenagement = GAME.nettoyerAmenagement(pose.a); VIE.frame(0.016, st, MAINTENANT);
    const apres = { etat: c.etat, n: c.chemin.length, la: VIE.clients.includes(c) }; VIE.frame(0.05, st, MAINTENANT); const encore = VIE.clients.includes(c);
    let t = 0, amin = 1; while (VIE.clients.includes(c) && t < 20) { VIE.frame(0.05, st, MAINTENANT); t += 0.05; amin = Math.min(amin, c.alpha); }
    check(n0 >= 0 && apres.etat === 'sort' && apres.n >= 3 && apres.la && encore && t > 0.5 && amin < 0.5, `un client en route vers la table ${ti}, déplacée : il repart à pied (${apres.n} étapes, ${t.toFixed(1)} s) et s’efface en sortant (alpha ${amin.toFixed(2)})`);
    delete st.amenagement; VIE.frame(0.016, st, MAINTENANT); }
  // un aménagement qui ne tient pas sur cet écran : le mode Déplacer part du plan affiché (le plan d'origine), chaque meuble a des cases vertes
  for (const [quoi, a] of [['fait sur un écran de 1280 px (la table 1 en colonne 35)', { v: 1, tables: [[35, 1], null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] }], ['la table 4 en (1, 4)', GAME.amenagementDepuisCode('------14-----------')]]) {
    st.amenagement = a; VIE.frame(0.016, st, MAINTENANT);
    if (VIE.LAY.sig !== '') { check(true, `(${quoi} tient sur cet écran : rien à vérifier)`); continue; }
    const v = VIE.valider(st), n = Object.fromEntries(IDS_MOBILES.map((id) => [id, vertes(st, id)]));
    check(!v.ok && VIE.amenagementDemande !== '' && IDS_MOBILES.every((id) => n[id] > 0), `un aménagement ${quoi} qui ne tient pas ici (« ${v.raison} ») : la scène au plan d’origine, et le mode Déplacer en part — des cases vertes pour chaque meuble ${JSON.stringify(n)}`);
  }
  delete st.amenagement; VIE.frame(0.016, st, MAINTENANT);
}
{ // un grand écran (1280 × 800, la scène 1280 × 668) : la grille s'arrête où le code compact s'arrête (colonne 35) ; jamais de case verte au-delà
  console.log('── les constats du lot 4, écran large 1280 × 800 ──');
  VIE.resize(1280, 668, 300); const st = nouveau(); VIE.frame(0.016, st, MAINTENANT); const g = VIE.LAY.grille, ko = [];
  for (const id of ['salon', 'table1', 'terrasse2']) for (let r = 0; r < g.rangs; r++) for (let c = 0; c < Math.ceil(1280 / g.pas); c++) { const p = VIE.proposer(st, id, (c + 0.5) * g.pas, /^terrasse/.test(id) ? 0 : g.y0 + (r + 0.5) * g.pas); if (p && p.ok && !GAME.nettoyerAmenagement(p.a)) ko.push(`${id} (${c}, ${r})`); if (/^terrasse/.test(id)) break; }
  const loin = VIE.valider(st, { v: 1, tables: [[40, 2], null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] });
  check(g.cols <= GAME.AMEN_MAX + 1 && g.rangs <= GAME.AMEN_MAX + 1 && !ko.length && !loin.ok, `la grille : ${g.cols} colonnes (≤ ${GAME.AMEN_MAX + 1}) ; aucune case verte que le plan ne sait pas écrire ${ko.slice(0, 3).join(' ')} ; une case au-delà de 35 refusée (« ${loin.raison} »)`);
}
VIE.resize(390, 716, 356);

if (process.argv.includes('--plan')) { console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nLe plan passe.'); process.exit(fails ? 1 : 0); } // le plan seul (rapide)

// ─── 2) sur la vraie page ───
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(q, w, h) {
    const ctx = await browser.newContext({ viewport: { width: w || 390, height: h || 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=${q}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.give(1e13); f.scene({ heure: 11 }); f.tiroir('ferme'); });
    return { ctx, page, erreurs, ev: (f, a) => page.evaluate(f, a) };
  }
  const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { if (await f()) return true; } catch (e) { /* rien */ } await sleep(250); } return false; };
  // le constat 17 de la relecture : chaque couvert repose sur le dessus réel de son plateau (MEUBLES.HAUT, la même mesure pour bâtir le meuble et
  // poser les couverts). Un client à chaque place, puis, sous l'assiette et sous la tasse de chaque couvert, un rayon vertical lancé d'un peu
  // au-dessus : il doit toucher le plateau (tables, bar, table basse, terrasse) à HAUT ± 0,3 (ni couvert qui flotte, ni couvert enfoncé)
  // la scène 3D de la boutique et sa caméra (que SCENE ne montre pas) : prises au vol à la prochaine image, quand le renderer met à jour leurs matrices
  const prendreScene = (ev) => ev(() => {
    const O = THREE.Object3D.prototype, u = O.updateMatrixWorld; let vue = false; window.__scene3 = window.__camera3 = null; window.__scenesVues = 0;
    O.updateMatrixWorld = function (...a) {
      if (this.isScene) window.__scenesVues++;
      if (this.isScene && this.children.some((g) => g.userData.nom === 'couverts')) { window.__scene3 = this; vue = true; } else if (vue && (this.isOrthographicCamera || this.isPerspectiveCamera)) { window.__camera3 = this; O.updateMatrixWorld = u; }
      return u.apply(this, a);
    };
  });
  async function plateaux(ev, nom) {
    await ev(() => { for (let k = 0; k < VIE.LAY.sieges.length; k++) if (!window.__fournil.SCENE.installer(null, 600)) break; });
    await prendreScene(ev); await attendre(() => ev(() => !!(window.__scene3 && window.__camera3)), 10000); await sleep(300);
    const r = await ev(() => {
      const S = window.__scene3, L = VIE.LAY, H = MEUBLES.HAUT, K = L.K, g = (n) => S && S.children.find((x) => x.userData.nom === n);
      if (!g('couverts')) return { n: 0, ko: [`scène introuvable (${window.__scenesVues} scènes mises à jour, page ${window.__fournil.page ? '' : '?'}${document.querySelector('#feuille').hidden ? 'sans feuille' : 'feuille ouverte'})`], zones: {} };
      const im = g('couverts').userData.im, cibles = ['tables', 'bar', 'banquette', 'terrasse'].map(g).filter(Boolean);
      const rc = new THREE.Raycaster(), m = new THREE.Matrix4(), v = new THREE.Vector3(), bas = new THREE.Vector3(0, -1, 0), res = { n: 0, ko: [], zones: {} };
      L.sieges.forEach((s, i) => {
        if (i >= im.count) return; im.getMatrixAt(i, m); const e = m.elements; if (Math.abs(e[0]) + Math.abs(e[2]) < 1e-6) return; // personne : couvert caché
        const y0 = e[13]; res.n++; res.zones[s.zone] = (res.zones[s.zone] || 0) + 1;
        for (const [lx, lz, quoi] of [[-5 * K, 0, 'assiette'], [4 * K, -3 * K, 'tasse']]) {
          v.set(lx, 0, lz).applyMatrix4(m); rc.set(new THREE.Vector3(v.x, y0 + 1, v.z), bas);
          const h = rc.intersectObjects(cibles, true)[0], y = h ? h.point.y : null;
          if (y0 !== H[s.zone] || y === null || Math.abs(y - y0) > 0.3) res.ko.push(`${s.id} (${quoi}) posé à ${y0}, plateau à ${y === null ? 'rien' : y.toFixed(2)}`);
        }
      });
      return res;
    });
    check(r.n >= 20 && r.ko.length === 0, `${nom} : les ${r.n} couverts reposent sur leur plateau, à MEUBLES.HAUT ± 0,3 (${JSON.stringify(r.zones)}) ${r.ko.slice(0, 4).join(' | ')}`);
  }

  console.log('── éco : acheter, s’asseoir ──');
  let { ctx, page, erreurs, ev } = await ouvrir('eco');
  check(await ev(() => { const z = window.__fournil.SCENE.zones(); return ['tables', 'bar', 'banquette', 'terrasse'].every((id) => z[id] && z[id].w >= 44 && z[id].h >= 44); }), 'pas encore achetés : chaque meuble de la salle a sa zone de touche (son emplacement en pointillés)');
  check(await ev(() => window.__fournil.SCENE.couverts === 0), 'personne d’assis : aucun couvert sur les tables');
  for (const id of ['bar', 'banquette', 'terrasse']) { // toucher l'emplacement ouvre la fiche du meuble (ui.js, sheetMeuble)
    const p = await ev((id) => { const r = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones()[id]; return { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2, hit: window.__fournil.SCENE.hitMeuble(z.x + z.w / 2, z.y + z.h / 2), nom: (window.__fournil.G.MOBILIER.find((m) => m.id === id) || {}).nom }; }, id);
    check(p.hit === id, `le doigt sur l’emplacement « ${id} » désigne ce meuble (hitMeuble : ${p.hit})`);
    const lire = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    await page.touchscreen.tap(p.x, p.y); await sleep(500);
    let fiche = await lire();
    if (!fiche) { // le premier toucher de la page peut tomber pendant que le tiroir finit de se replier : on dit ce qu'il y avait sous le doigt, et on recommence une fois
      const sous = await ev(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) + '' : '?'; }, p);
      console.log(`        (pas de fiche au premier toucher ; sous le doigt : ${sous}, tiroir ${await ev(() => window.__fournil.tiroir())} ; on recommence)`);
      await sleep(800); await page.touchscreen.tap(p.x, p.y); await sleep(600); fiche = await lire();
    }
    check(!!p.nom && fiche.includes(p.nom), `et sa fiche s’ouvre : « ${fiche.split('\n')[0]} »`);
    await ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.tiroir('ferme'); }); await sleep(300);
  }
  await page.screenshot({ path: path.join(out, 'apres-min-eco.png') });
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } });
  const places = await ev(() => window.__fournil.G.places(window.__fournil.st));
  check(places.tables === 6 && places.bar === 4 && places.banquette === 3 && places.terrasse === 6, `tout le mobilier au max : ${JSON.stringify(places)}`);
  for (const [zone, nom] of [['bar', 'au bar, sur un tabouret'], ['banquette', 'sur la banquette du coin salon'], ['terrasse', 'en terrasse']]) {
    await ev((z) => window.__fournil.scene({ heure: 11, assis: true, zone: z }), zone);
    const ok = await attendre(() => ev((z) => window.__fournil.SCENE.assisEn[z] > 0, zone), 90000);
    check(ok, `un client servi vient s’asseoir ${nom} (par l’allée${zone === 'terrasse' ? ' et la porte de la devanture' : ''})`);
  }
  { // un couvert devant chaque client assis : on compare au même instant (sur une machine lente, le client du bar a pu finir et repartir pendant qu'on attendait celui de la terrasse)
    const c = await ev(() => ({ couverts: window.__fournil.SCENE.couverts, assis: window.__fournil.SCENE.assis }));
    check(c.assis >= 1 && c.couverts >= c.assis, `les couverts sont posés devant les clients assis (${c.couverts} couverts, ${c.assis} assis)`); }
  await page.screenshot({ path: path.join(out, 'apres-clients-eco.png') });
  const ap = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, salle: a.tables + a.bar + a.banquette + a.terrasse + a.couverts }; });
  check(ap.decor <= 72 && ap.salle <= 7, `éco, tout au max : ${ap.decor} appels de dessin pour le décor (≤ 72), dont ${ap.salle} pour les tables, le bar, le salon, la terrasse et tous les couverts`);
  { // les décos de la Maison hantée, toutes gagnées (le bestiaire compris : l'étagère aux bocaux de monstres), en plus de tout le reste
    const appels = () => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, bocaux: a['ht-bestiaire'] || 0, vues: window.__fournil.SCENE.decosHanteeVues }; });
    await ev(() => window.__fournil.SCENE.decosHantee(['bestiaire'])); await sleep(1500); const seule = await appels();
    check(seule.vues.includes('bestiaire') && seule.bocaux === 1 && seule.decor <= 72 && seule.decor <= ap.decor + 1, `éco, tout au max et l’étagère aux bocaux de monstres (le bestiaire) : ${seule.decor} appels de dessin pour le décor (≤ 72), dont ${seule.bocaux} pour elle`);
    await ev(() => window.__fournil.SCENE.decosHantee(['citrouilles', 'toiles', 'chaudron', 'fantome', 'toque-citrouille'])); await sleep(1500); const sans = await appels();
    await ev(() => window.__fournil.SCENE.decosHantee(['citrouilles', 'toiles', 'chaudron', 'fantome', 'toque-citrouille', 'bestiaire'])); await sleep(1500); const aph = await appels();
    // (les décos des paliers de la Maison hantée, d'avant le bestiaire, dépassent déjà les 72 ensemble : l'étagère n'y ajoute qu'un appel)
    check(aph.vues.includes('bestiaire') && aph.decor === sans.decor + 1, `avec toutes les décos de la Maison hantée : ${sans.decor} → ${aph.decor} appels (l’étagère aux bocaux n’en ajoute qu’un ; ${aph.vues.join(', ')})`);
    const fz = await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(), L = VIE.LAY.fenetre; return { x: r.left + L.x, y: r.top, w: L.w }; });
    await page.screenshot({ path: path.join(out, 'decos-hantee-eco.png') });
    await page.screenshot({ path: path.join(out, 'bocaux-eco.png'), clip: { x: 0, y: Math.max(0, fz.y), width: 260, height: 160 } });
    if (out3) { fs.copyFileSync(path.join(out, 'decos-hantee-eco.png'), path.join(out3, 'bestiaire-decor-boutique.png')); fs.copyFileSync(path.join(out, 'bocaux-eco.png'), path.join(out3, 'bestiaire-decor.png')); }
    // le bestiaire continue (27 octobre) : les neuf en argent, puis en or : la même étagère, à la teinte du plus beau métal gagné (l'or
    // remplace l'argent, qui remplaçait le bronze), toujours un seul appel de dessin
    for (const [l, t] of [[['bestiaire', 'bestiaire-argent'], 'argent'], [['bestiaire', 'bestiaire-argent', 'bestiaire-or'], 'or']]) {
      await ev((x) => window.__fournil.SCENE.decosHantee(['citrouilles', 'toiles', 'chaudron', 'fantome', 'toque-citrouille'].concat(x)), l); await sleep(1500); const m = await appels(), te = await ev(() => window.__fournil.SCENE.teinteBocaux);
      check(te === t && m.bocaux === 1 && m.decor === aph.decor, `les neuf en ${t} : l’étagère ${t === 'or' ? 'dorée' : 'aux bocaux d’argent'} à la place (teinte ${te}), ${m.decor} appels (${m.bocaux} pour elle, comme le bronze)`);
      await page.screenshot({ path: path.join(out, `bocaux-${t}-eco.png`), clip: { x: 0, y: Math.max(0, fz.y), width: 260, height: 160 } });
      if (out3) fs.copyFileSync(path.join(out, `bocaux-${t}-eco.png`), path.join(out3, `bestiaire-decor-${t}.png`));
    }
    // les acharnés (lot 6) : la lanterne de la légende (le 20e palier de la Maison hantée), seule puis avec toutes les autres : deux appels de plus
    const appelsL = () => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, lanterne: a['ht-legende'] || 0, vues: window.__fournil.SCENE.decosHanteeVues }; });
    await ev(() => window.__fournil.SCENE.decosHantee(['legende'])); await sleep(1500); const leg = await appelsL();
    check(leg.vues.includes('legende') && leg.lanterne === 2 && leg.decor <= 72 && leg.decor <= ap.decor + 2, `éco, tout au max et la lanterne de la légende : ${leg.decor} appels de dessin pour le décor (≤ 72), dont ${leg.lanterne} pour elle (le fer, la flamme)`);
    await ev(() => window.__fournil.SCENE.decosHantee(['citrouilles', 'toiles', 'chaudron', 'fantome', 'toque-citrouille', 'bestiaire', 'legende'])); await sleep(1500); const tout = await appelsL();
    check(tout.vues.includes('legende') && tout.decor === aph.decor + 2, `avec toutes les décos de la Maison hantée et la lanterne : ${aph.decor} → ${tout.decor} appels (la lanterne n’en ajoute que deux)`);
    { const L = await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(), l = VIE.LAY, li = VIE.LAY.lanes; return { top: r.top, murH: l.murH, plan: l.plan, lanes: li, fs: l.fourSlots, grille: l.grille.y0 }; });
      check(L.plan.y > L.murH + 60 && L.grille > L.murH + 80 && L.fs[0] > 390 * 0.045 + 25, `la lanterne (au pied du fournil, à gauche) : hors de la grille des meubles (qui commence à ${Math.round(L.grille)} px) et loin des apprentis (le premier four à ${Math.round(L.fs[0])} px)`);
      const dir = process.env.SHOTS_ACHARNES; if (dir) { fs.mkdirSync(dir, { recursive: true }); await page.screenshot({ path: path.join(dir, 'acharnes-decos-toutes.png') }); await page.screenshot({ path: path.join(dir, 'acharnes-lanterne.png'), clip: { x: 0, y: Math.max(0, L.top + L.murH - 40), width: 200, height: 170 } }); } }
    await ev(() => window.__fournil.SCENE.decosHantee([])); await sleep(500);
  }
  { // § 2.b de la base saine : l'enseigne néon (le Quartier) et l'étagère aux bocaux (le bestiaire) partagent la fenêtre ; les deux gagnées, le néon
    // remonte au-dessus des couvercles. Les boîtes des deux groupes, projetées à l'écran par la vraie caméra, ne se recoupent pas
    const boites = async () => {
      await prendreScene(ev); await attendre(() => ev(() => !!(window.__scene3 && window.__camera3)), 10000);
      return ev(() => {
        const S = window.__scene3, cam = window.__camera3, r = document.querySelector('#scene').getBoundingClientRect(), b = new THREE.Box3(), v = new THREE.Vector3();
        const ecran = (nom) => { const g = S && S.children.find((x) => x.userData.nom === nom); if (!g || !cam) return null; b.setFromObject(g); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(cam); const px = r.left + (v.x + 1) / 2 * r.width, py = r.top + (1 - v.y) / 2 * r.height; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
          return { x0, y0, x1, y1 }; };
        return { neon: ecran('neon'), bocaux: ecran('bocaux') };
      });
    };
    const recoupe = (a, b) => !!(a && b) && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1, txt = (a) => (a ? `${Math.round(a.y0)}-${Math.round(a.y1)} px` : 'absent');
    await ev(() => { window.__fournil.SCENE.decosQuartier(['neon']); window.__fournil.SCENE.decosHantee([]); }); await sleep(1200); const seul = await boites();
    await ev(() => window.__fournil.SCENE.decosHantee(['bestiaire'])); await sleep(1500); const deux = await boites();
    check(seul.neon && !seul.bocaux && deux.neon && deux.bocaux && !recoupe(deux.neon, deux.bocaux) && deux.neon.y1 <= deux.bocaux.y0,
      `le néon et les bocaux du bestiaire, tous deux gagnés : le néon (${txt(deux.neon)}) au-dessus des bocaux (${txt(deux.bocaux)}), sans recouvrement à l’écran (néon seul : ${txt(seul.neon)})`);
    const fz = await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(), L = VIE.LAY.fenetre; return { y: r.top + L.y }; });
    // et le néon reste dans la fenêtre : son fond noir ne passe pas au-dessus du cadre, sur le mur (seul, ou remonté au-dessus des bocaux)
    check(seul.neon && deux.neon && seul.neon.y0 >= fz.y && deux.neon.y0 >= fz.y, `le néon reste dans la fenêtre (haut de la vitre à ${Math.round(fz.y)} px ; néon seul de ${txt(seul.neon)}, avec les bocaux de ${txt(deux.neon)})`);
    await page.screenshot({ path: path.join(out, 'neon-bocaux-eco.png') });
    await page.screenshot({ path: path.join(out, 'neon-bocaux-fenetre-eco.png'), clip: { x: 0, y: Math.max(0, fz.y - 10), width: 220, height: 150 } });
    await ev(() => { window.__fournil.SCENE.decosQuartier([]); window.__fournil.SCENE.decosHantee([]); }); await sleep(500);
  }
  check(await attendre(() => ev(() => typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret), 30000), 'éco : les meubles Kenney sont là');
  await plateaux(ev, 'éco, meubles Kenney');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── éco sans Kenney (?kenney=0) : les meubles faits main ──');
  ({ ctx, page, erreurs, ev } = await ouvrir('eco&kenney=0'));
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ }); await sleep(1200);
  check(await ev(() => !(typeof KENNEY !== 'undefined' && KENNEY && KENNEY.pret) && window.__fournil.SCENE.meublesHD.length === 0), 'ni Kenney ni KayKit : les meubles faits main');
  await plateaux(ev, 'éco, meubles faits main');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── haute : les meubles KayKit ──');
  ({ ctx, page, erreurs, ev } = await ouvrir('haute'));
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ });
  check(await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 90000), `en haute, les quatre meubles de la salle passent en KayKit (${(await ev(() => window.__fournil.SCENE.meublesHD)).join(', ')})`);
  await ev(() => { for (const z of ['bar', 'banquette', 'terrasse', 'table']) window.__fournil.SCENE.installer(z, 600); }); await sleep(2500);
  const as = await ev(() => window.__fournil.SCENE.assisEn);
  check(as.bar && as.banquette && as.terrasse && as.table, `des clients installés partout : ${JSON.stringify(as)}`);
  const aph = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, salle: a.tables + a.bar + a.banquette + a.terrasse + a.couverts }; });
  check(aph.decor <= 80 && aph.salle <= 7, `haute, tout au max : ${aph.decor} appels de dessin pour le décor (≤ 80, décors HD compris), ${aph.salle} pour la salle et les couverts`);
  await page.screenshot({ path: path.join(out, 'apres-clients-haute.png') });
  await plateaux(ev, 'haute, meubles KayKit');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── 360 × 640 : tout au-dessus du tiroir fermé ──');
  ({ ctx, page, erreurs, ev } = await ouvrir('eco', 360, 640));
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ f.tiroir('ferme'); }); await sleep(1200);
  const z360 = await ev(() => { const t = document.querySelector('#tiroir').getBoundingClientRect(), s = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones(); return ['tables', 'bar', 'banquette', 'terrasse'].map((id) => [id, Math.round(s.top + z[id].y + z[id].h), Math.round(t.top)]); });
  check(z360.every(([, b, t]) => b <= t + 1), `les zones de la salle restent au-dessus du tiroir fermé : ${z360.map(([id, b]) => id + ' ' + b).join(', ')} (tiroir à ${z360[0][2]})`);
  await page.screenshot({ path: path.join(out, 'apres-max-360.png') });
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (meubles).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
