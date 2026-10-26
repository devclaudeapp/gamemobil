// « Tout déplaçable » dans la vraie page du Fournil (fournil/ servi en local), sur un iPhone 390 × 844, AU DOIGT : toutes les touches et les
// glisser passent par de vrais évènements tactiles (CDP Input.dispatchTouchEvent : touchStart, touchMove, touchEnd), comme sur un téléphone.
// Parcours : Réglages → « Repeindre la boutique » (le mode Aménager) → « Déplacer » ; une table prise au doigt suit le doigt, aimantée à la
// grille, verte là où elle peut aller ; lâchée, elle y reste (st.amenagement, sauvé, la 3D reconstruite, ses voies recalculées) ; un client
// assis à une table déplacée se lève et repart (personne ne reste assis dans le vide) ; une table posée sur l'allée est rouge, avec la raison,
// et revient à sa place ; le bar, le coin salon et une table de la terrasse se déplacent aussi ; un meuble pas encore acheté ne se prend pas ;
// l'aménagement survit au rechargement et à une nouvelle boutique (les meubles repartent de zéro, leurs places restent) ; la boutique d'un
// copain (sa photo, champ a) montre SON aménagement ; « Plan d'origine » (avec confirmation) remet tout comme au premier jour.
// Captures dans test/shots/amenage/.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-amenage.cjs   (PORT_AMENAGE, défaut 8875)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_AMENAGE || 8875;
const out = path.join(__dirname, 'shots', 'amenage'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await f()) return true; } catch (e) { /* la page se recharge */ } await sleep(150); } return false; };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);

function doigt(p, cdp) { // les touches et les glisser, comme sur un téléphone
  const ev = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const toucher = async (x, y) => { await ev('touchStart', [[x, y]]); await ev('touchEnd', []); };
  const centre = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }, sel);
  // avant de toucher un élément : attendre qu'il soit immobile (deux images de suite à la même place : sous charge, le tiroir glisse encore,
  // transition CSS, quand tiroir() dit déjà 'mi'), entièrement dans la fenêtre, et que ce soit bien lui sous le doigt (elementFromPoint) ;
  // une feuille ouverte entre-temps par-dessus (une annonce, un retour) est refermée. Au bout de 5 s, on touche quand même : l'appelant vérifie
  const pret = (sel) => p.evaluate((s) => new Promise((ok) => {
    const t0 = performance.now(); let avant = null;
    const tour = () => {
      const e = document.querySelector(s); if (!e) { ok(null); return; }
      const f = document.querySelector('#feuille'); if (f && !f.hidden && !f.contains(e)) { const x = f.querySelector('[data-a="close"]'); if (x) x.click(); }
      const b = e.getBoundingClientRect(), c = { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
      const fixe = !!avant && avant.x === c.x && avant.y === c.y, dedans = b.width > 0 && b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth;
      const sous = dedans ? document.elementFromPoint(c.x, c.y) : null, lui = !!sous && (sous === e || e.contains(sous));
      if ((fixe && dedans && lui) || performance.now() - t0 > 5000) { ok(c); return; }
      avant = c; requestAnimationFrame(tour);
    };
    requestAnimationFrame(tour);
  }), sel);
  const toucherEl = async (sel) => { const c = await pret(sel); if (!c) throw new Error('introuvable : ' + sel); await toucher(c.x, c.y); return c; };
  // un glisser : on pose le doigt, on le traîne en n pas, on attend (pendant : appelé doigt posé, au bout du chemin), on lève
  async function glisser(de, vers, o = {}) {
    const n = o.pas || 12; await ev('touchStart', [[de.x, de.y]]); await sleep(60);
    for (let k = 1; k <= n; k++) { await ev('touchMove', [[de.x + (vers.x - de.x) * k / n, de.y + (vers.y - de.y) * k / n]]); await sleep(25); }
    await sleep(250); const r = o.pendant ? await o.pendant() : null; await ev('touchEnd', []); await sleep(200); return r;
  }
  return { toucher, toucherEl, centre, glisser };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; });
  // les messages vus, dès leur apparition (un toast ne vit que 1,7 à 2,4 s : lu après coup sur une machine chargée, il serait déjà parti)
  await ctx.addInitScript(() => { window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true }); });
  let photoCopain = null; // la photo que le faux serveur rend pour la visite
  await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
  await ctx.route( // (enregistrée après : elle passe avant l'autre)
    /supabase\.co\/rest\/v1\/rpc\/fournil_boutique/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pseudo: 'Copain', photo: photoCopain, maj: new Date().toISOString(), en_ligne: false }) }));
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
  const cdp = await ctx.newCDPSession(page), d = doigt(page, cdp), ev = (f, a) => page.evaluate(f, a);
  const ouvrir = async () => {
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.scene({ heure: 11 }); f.tiroir('ferme'); }); await sleep(500);
  };
  await ouvrir();
  await ev(() => { const f = window.__fournil; f.give(1e13); for (const id of ['tables', 'bar', 'banquette']) for (let k = 0; k < 6; k++) f.meuble(id); f.meuble('terrasse'); f.meuble('terrasse'); /* deux tables dehors : la troisième n'est pas achetée */ });
  await sleep(600);
  // l'écran : où tombe un point du plan (scène) sur la page
  const ecran = (p) => ev((p) => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, p);
  const mobile = (id) => ev((id) => { const m = VIE.LAY.mobiles.find((o) => o.id === id); return { x: m.x, y: m.y, r: m.r }; }, id);
  const lieu = (id, de, filtre) => ev(({ id, de, filtre }) => { // une case où ce meuble peut aller (la plus proche d'un but), et une où il ne peut pas
    const g = VIE.LAY.grille, st = window.__fournil.st, ok = [], non = [];
    for (let r = -2; r < g.rangs; r++) for (let c = 0; c < g.cols; c++) { const x = g.x0 + (c + 0.5) * g.pas, y = g.y0 + (r + 0.5) * g.pas, p = VIE.proposer(st, id, x, y); if (!p) continue; (p.ok ? ok : non).push({ x, y, c, r, raison: p.raison, d: Math.hypot(x - de.x, y - de.y) }); }
    const f = filtre ? new Function('p', 'return ' + filtre) : () => true; return { ok: ok.filter((p) => p.d > (filtre === 'proche' ? 0.4 : 2) * g.pas && (filtre === 'proche' || f(p))).sort((a, b) => a.d - b.d)[0] || null, non };
  }, { id, de, filtre });

  console.log('── le mode Déplacer, dans Aménager ──');
  // sous charge, la page des Réglages arrive lentement et le tiroir glisse encore : jusqu'à quatre essais, chacun attend que le bouton soit là
  // (toucherEl : immobile, dans l'écran, sous le doigt) et que le mode Aménager prenne
  for (let essai = 0; essai < 4 && !(await ev(() => window.__fournil.SCENE.amenager)); essai++) {
    if (essai) console.log(`        (pas d’Aménager au toucher n°${essai} ; on recommence)`);
    await ev(() => window.__fournil.page('reglages'));
    await attendre(() => ev(() => { const b = document.querySelector('[data-a="repeindre"]'); return !!(b && b.offsetParent); }), 5000);
    await ev(() => document.querySelector('[data-a="repeindre"]').scrollIntoView({ block: 'center' }));
    await d.toucherEl('[data-a="repeindre"]'); // (toucherEl attend que le bouton soit immobile, dans l'écran, et bien sous le doigt)
    await attendre(() => ev(() => window.__fournil.SCENE.amenager), 3000);
  }
  await attendre(() => ev(() => !document.querySelector('#amenage-barre').hidden && !document.querySelector('#b-deplacer').hidden), 3000);
  check(await ev(() => window.__fournil.SCENE.amenager && !document.querySelector('#amenage-barre').hidden && !document.querySelector('#b-deplacer').hidden), 'Repeindre la boutique : le mode Aménager montre le bouton « Déplacer »');
  await d.toucherEl('#b-deplacer'); await sleep(500);
  check(await ev(() => window.__fournil.SCENE.deplacer && document.querySelector('#b-deplacer').getAttribute('aria-pressed') === 'true'), '« Déplacer » touché : le mode Déplacer (la grille, les meubles déplaçables entourés)');
  await page.screenshot({ path: path.join(out, '1-mode-deplacer.png') });

  console.log('── une table au doigt ──');
  await ev(() => { window.__fournil.scene({ heure: 11 }); window.__fournil.SCENE.installer('table', 600); }); await sleep(800); // un client installé à la table 1
  const assis0 = await ev(() => { const s = VIE.LAY.sieges.find((x) => x.occ && x.occ.etat === 'assis'); return s ? { id: s.id, client: s.occ.id } : null; });
  check(assis0 && /^table1\./.test(assis0.id), `un client est assis à la table 1 (${assis0 && assis0.id})`);
  const t1 = await mobile('table1'), but1 = await lieu('table1', { x: t1.x - 60, y: t1.y + 110 }, null);
  check(!!but1.ok, `une place libre pour la table 1 (case ${but1.ok && but1.ok.c}, ${but1.ok && but1.ok.r})`);
  const vert = await d.glisser(await ecran(t1), await ecran(but1.ok), { pendant: async () => { const g = await ev(() => window.__fournil.SCENE.glisse); await page.screenshot({ path: path.join(out, '2-glisse-vert.png') }); return g; } });
  check(vert && vert.id === 'table1' && vert.ok === true, `la table suit le doigt, aimantée à la grille, en vert (${JSON.stringify(vert && { id: vert.id, ok: vert.ok, x: Math.round(vert.x), y: Math.round(vert.y) })})`);
  check(vert && Math.abs(vert.x - but1.ok.x) < 0.5 && Math.abs(vert.y - but1.ok.y) < 0.5, 'son centre tombe pile au centre de la case visée');
  await attendre(() => ev(() => !!VIE.LAY.sig), 5000); // la frame suivante applique le plan
  const apres1 = await ev(() => ({ a: window.__fournil.st.amenagement, sig: VIE.LAY.sig, t: VIE.LAY.tables[0], glisse: window.__fournil.SCENE.glisse }));
  check(apres1.a && apres1.a.tables[0] && apres1.a.tables[0][0] === but1.ok.c && apres1.a.tables[0][1] === but1.ok.r && apres1.a.tables.slice(1).every((x) => x === null), `lâchée : elle y reste (st.amenagement.tables[0] = [${apres1.a && apres1.a.tables[0]}], les autres à l’origine)`);
  check(apres1.sig && Math.abs(apres1.t.x - but1.ok.x) < 0.5 && Math.abs(apres1.t.y - but1.ok.y) < 0.5 && !apres1.glisse, `le plan suit (LAY.sig ${apres1.sig}), le fantôme du glisser disparaît`);
  const leve = await ev((c) => { const cl = VIE.clients.find((x) => x.id === c); return cl ? { etat: cl.etat, siege: cl.siege && cl.siege.id } : { etat: 'parti' }; }, assis0 && assis0.client);
  check(leve.etat === 'sort' || leve.etat === 'parti', `le client assis à la table déplacée se lève et repart (${leve.etat})`);
  check(await ev(() => VIE.clients.filter((c) => c.etat === 'assis').every((c) => c.siege && Math.abs(c.x - c.siege.x) < 0.5 && Math.abs(c.y - c.siege.y) < 0.5)), 'personne ne reste assis dans le vide : chaque client assis est sur sa chaise');
  const voie = await ev(() => { const s = VIE.LAY.sieges.find((x) => x.id === 'table1.g'); return { v0: s.voie[0], allee: VIE.LAY.allee }; });
  check(Math.abs(voie.v0.x - voie.allee) < 0.01, 'sa voie recalculée part de l’allée');
  await attendre(() => ev(() => window.__fournil.SCENE.appelsParGroupe.tables > 0), 3000); await sleep(600);
  await page.screenshot({ path: path.join(out, '3-table-deplacee.png') });

  console.log('── une place interdite : refusée, avec la raison ──');
  const t2 = await mobile('table2'), allee = await ev(() => VIE.LAY.allee);
  const surAllee = (await lieu('table2', t2, null)).non.filter((p) => /allée/.test(p.raison)).sort((a, b) => Math.abs(a.y - t2.y) - Math.abs(b.y - t2.y))[0];
  check(!!surAllee, `une case sur l’allée (x ${surAllee && Math.round(surAllee.x)}, l’allée à ${Math.round(allee)})`);
  const rouge = await d.glisser(await ecran(t2), await ecran(surAllee), { pendant: async () => { const g = await ev(() => window.__fournil.SCENE.glisse); await page.screenshot({ path: path.join(out, '4-glisse-rouge.png') }); return g; } });
  check(rouge && rouge.ok === false && rouge.raison === 'Ça bloque l’allée.', `sur l’allée : rouge, « ${rouge && rouge.raison} »`);
  const apres2 = await ev(() => ({ a: window.__fournil.st.amenagement, t: VIE.LAY.tables[1], toast: (document.querySelector('.toast') || {}).textContent || '' }));
  check(apres2.a.tables[1] === null && Math.abs(apres2.t.x - t2.x) < 0.5 && Math.abs(apres2.t.y - t2.y) < 0.5, 'lâchée là : elle revient à sa place (rien d’enregistré)');
  check(/allée/.test(apres2.toast), `et le message le dit : « ${apres2.toast} »`);
  const chev = await ev(() => { const t = VIE.LAY.mobiles.find((o) => o.id === 'table1'); return VIE.proposer(window.__fournil.st, 'table3', t.x, t.y); });
  check(chev && !chev.ok && chev.raison === 'Ça touche la table 1.', `sur une autre table : « ${chev && chev.raison} »`);
  const file = await ev(() => { const g = VIE.LAY.grille; return VIE.proposer(window.__fournil.st, 'bar', VIE.LAY.W * 0.5, g.y0 - g.pas); });
  check(file && !file.ok && /file d’attente/.test(file.raison), `le bar poussé jusqu’à la file : « ${file && file.raison} »`);

  console.log('── le bar, le coin salon, la terrasse ; un meuble pas encore acheté ──');
  const sal = await mobile('salon'), butS = await lieu('salon', { x: sal.x - 140, y: sal.y + 40 }, 'p.x < VIE.LAY.allee');
  check(!!butS.ok, `une place pour le coin salon à gauche de l’allée (${butS.ok && butS.ok.c}, ${butS.ok && butS.ok.r})`);
  if (butS.ok) await d.glisser(await ecran({ x: sal.x, y: sal.y }), await ecran(butS.ok));
  const ter = await mobile('terrasse1'), butT = await lieu('terrasse1', { x: ter.x - 70, y: ter.y }, null);
  if (butT.ok) await d.glisser(await ecran({ x: ter.x, y: ter.y }), await ecran(butT.ok));
  const bar = await mobile('bar'), butB = await lieu('bar', { x: bar.x, y: bar.y - 20 }, 'proche'); // le bar est large : une place proche (les tables l'entourent)
  if (butB.ok) await d.glisser(await ecran({ x: bar.x, y: bar.y }), await ecran(butB.ok));
  const tout = await ev(() => window.__fournil.st.amenagement);
  check(tout.salon && tout.terrasse[0] != null && tout.bar, `le coin salon (${tout.salon}), une table de la terrasse (${tout.terrasse[0]}, en x seulement) et le bar (${tout.bar}) déplacés`);
  const ter3 = await mobile('terrasse3'), avant3 = JSON.stringify(tout); await ev(() => { window.__toasts = []; });
  const pris3 = await d.glisser(await ecran({ x: ter3.x, y: ter3.y }), await ecran({ x: ter3.x + 40, y: ter3.y }), { pas: 4, pendant: () => ev(() => ({ g: window.__fournil.SCENE.glisse })) });
  check(pris3.g === null, 'pendant le glisser, rien ne suit le doigt');
  // le message du geste, relevé à son apparition (window.__toasts) : sous charge, le glisser peut durer plus que le toast
  await attendre(() => ev(() => window.__toasts.some((t) => /pas encore achet/.test(t))), 3000); pris3.toast = await ev(() => window.__toasts.find((t) => /pas encore achet/.test(t)) || window.__toasts.join(' / '));
  const r3 = await ev((a) => JSON.stringify(window.__fournil.st.amenagement) === a, avant3);
  check(r3 && /pas encore achet/.test(pris3.toast), `la troisième table de la terrasse (pas achetée) ne se prend pas : « ${pris3.toast} »`);
  await ev(() => { window.__fournil.scene({ heure: 11, assis: true }); for (const z of ['bar', 'banquette', 'terrasse', 'table']) window.__fournil.SCENE.installer(z, 600); }); await sleep(1500);
  check(await ev(() => window.__fournil.SCENE.assis >= 3 && window.__fournil.SCENE.couverts >= 3), 'des clients installés au bar, au salon et dehors, leurs couverts devant eux, à leurs nouvelles places');
  await page.screenshot({ path: path.join(out, '5-tout-deplace.png') });
  const zs = await ev(() => { const t = document.querySelector('#tiroir').getBoundingClientRect(), sc = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones(); return ['tables', 'bar', 'banquette', 'terrasse'].map((id) => ({ id, w: Math.round(z[id].w), h: Math.round(z[id].h), bas: Math.round(sc.top + z[id].y + z[id].h), tiroir: Math.round(t.top) })); });
  check(zs.every((z) => z.w >= 44 && z.h >= 44 && z.bas <= z.tiroir + 1), `aménagé : les zones de touche de la salle font au moins 44 px et restent au-dessus du tiroir fermé (${zs.map((z) => `${z.id} ${z.w}×${z.h}`).join(', ')})`);
  const nb = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return decor; });
  check(nb <= 72, `éco, aménagé : ${nb} appels de dessin pour le décor (≤ 72)`);
  { // « Mes décos » (lot de la chaîne) : les 6 décos les plus lourdes posées dans la boutique aménagée, fusionnées avec les petits décors (src/meubles.js
    // fusion) : le budget reste le même ; leurs places (src/vie.js LAY.decos : au mur, à la fenêtre, au pied du fournil, le coin du chien) ne touchent aucun meuble déplacé
    const LOURDES = [['chaudron', 's1'], ['legende', 's3'], ['citrouilles', 's2'], ['neon', 'm2'], ['bestiaire', 'm1'], ['toiles', 'r1']];
    await ev((l) => window.__fournil.SCENE.decos(l), LOURDES); await attendre(() => ev(() => (window.__fournil.SCENE.decosPosees || []).length === 6), 8000); await sleep(800);
    const r = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe, L = VIE.LAY; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v;
      const inter = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h, sol = L.decos.filter((p) => p.type === 'sol');
      return { decor, decos: (a.petits || 0) + (a.lueurs || 0), touche: L.mobiles.filter((m) => m.dedans && sol.some((p) => inter(m.r, p.r))).map((m) => m.id) }; });
    check(r.decor <= 72 && r.decos <= 3 && !r.touche.length, `éco, aménagé, les 6 décos les plus lourdes posées : ${r.decor} appels pour le décor (≤ 72), dont ${r.decos} pour les décos ; aucune place du sol sous un meuble déplacé ${r.touche.join(' ')}`);
    await page.screenshot({ path: path.join(out, '5b-tout-deplace-decos.png') });
    await ev(() => window.__fournil.SCENE.decos(null)); await sleep(400);
  }
  await d.toucherEl('#b-fini'); await sleep(500);
  check(await ev(() => !window.__fournil.SCENE.amenager && !window.__fournil.SCENE.deplacer && document.querySelector('#amenage-barre').hidden), '« Terminé » : on quitte Aménager (et Déplacer)');
  // un client qui vient s'asseoir passe par sa nouvelle voie
  const finale = await ev(() => window.__fournil.st.amenagement);

  console.log('── gardé : au rechargement, à la boutique suivante ──');
  await ev(() => window.__fournil.save()); await ouvrir();
  check(await ev((a) => JSON.stringify(window.__fournil.st.amenagement) === JSON.stringify(a) && VIE.LAY.sig === window.__fournil.G.codeAmenagement(a), finale), 'rechargée : la boutique garde son aménagement');
  const nb2 = await ev(() => { const f = window.__fournil, st = f.st; st.lifetimeRun = 1e13; st.lifetime = Math.max(st.lifetime, 1e13); const r = f.G.nouvelleBoutique(st, Date.now()); return { ok: r.ok, mobilier: Object.keys(st.mobilier).length, a: st.amenagement }; });
  check(nb2.ok && nb2.mobilier === 0 && JSON.stringify(nb2.a) === JSON.stringify(finale), 'G.nouvelleBoutique : les meubles repartent de zéro, leurs places restent');
  await ev(() => { const f = window.__fournil; f.give(1e13); for (let k = 0; k < 3; k++) f.meuble('tables'); }); await sleep(800);
  const tb = await ev(() => ({ t: VIE.LAY.tables[0], m: VIE.LAY.mobiles.find((o) => o.id === 'table1') }));
  check(Math.abs(tb.t.x - but1.ok.x) < 0.5 && Math.abs(tb.t.y - but1.ok.y) < 0.5, 'les tables rachetées reviennent à la place choisie');
  await page.screenshot({ path: path.join(out, '6-boutique-suivante.png') });

  console.log('── la boutique d’un copain : sa photo (champ a) ──');
  photoCopain = await ev(() => { // un copain qui a déplacé ses tables 4 et 5 et une table de la terrasse (des places valides sur cet écran)
    const f = window.__fournil, G = f.G, s = G.newState(Date.now()), g = VIE.LAY.grille; s.nomBoutique = 'Chez Copain'; for (const m of G.MOBILIER) s.mobilier[m.id] = m.max;
    for (const [id, x, y] of [['table4', 0.30, 1], ['table5', 0.10, 1], ['terrasse1', 0.66, 0]]) { let best = null; for (let r = 0; r < g.rangs; r++) for (let c = 0; c < g.cols; c++) { const p = VIE.proposer(s, id, g.x0 + (c + 0.5) * g.pas, g.y0 + (r + 0.5) * g.pas); const e = p && p.ok ? Math.hypot(p.x - VIE.LAY.W * x, (p.y - VIE.LAY.devanture.y) * y) : 1e9; if (e < (best ? best.e : 1e9)) best = { e, a: p.a }; } if (best) s.amenagement = best.a; }
    return CLASSEMENT.photo(s, { G }); });
  check(photoCopain && /^[0-9a-z-]{19}$/.test(photoCopain.a || '') && photoCopain.a !== '-'.repeat(19), `sa photo porte a = '${photoCopain && photoCopain.a}'`);
  await ev(() => window.__fournil.visiter('Copain')); const vu = await attendre(() => ev(() => { const v = window.__fournil.visite(); return v && v.scene; }), 15000); await sleep(1200);
  const vis = await ev(() => ({ sig: VIE.LAY.sig }));
  check(vu && vis.sig === photoCopain.a, `en visite, la scène montre SON aménagement (LAY.sig ${vis.sig})`);
  await page.screenshot({ path: path.join(out, '7-boutique-copain.png') });
  await ev(() => window.__fournil.finVisite()); await attendre(() => ev(() => !window.__fournil.visite()), 5000); await sleep(800);
  check(await ev((a) => VIE.LAY.sig === window.__fournil.G.codeAmenagement(a), finale), 'retour chez soi : son propre aménagement revient');

  console.log('── « Plan d’origine » ──');
  await ev(() => window.__fournil.amenager(true)); await sleep(300); await d.toucherEl('#b-deplacer'); await sleep(400);
  check(await ev(() => !document.querySelector('#b-origine').hidden), '« Plan d’origine » est là (un aménagement existe)');
  await d.toucherEl('#b-origine'); await sleep(500);
  const conf = await ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  check(/plan d’origine/i.test(conf), `une confirmation d’abord : « ${conf.split('\n')[0]} »`);
  await page.screenshot({ path: path.join(out, '8-plan-origine-confirmation.png') });
  await d.toucherEl('#feuille [data-a="non"]'); await sleep(300);
  check(await ev(() => !!window.__fournil.st.amenagement), '« Non » : l’aménagement reste');
  await d.toucherEl('#b-origine'); await sleep(400); await d.toucherEl('#feuille [data-a="oui"]'); await sleep(600);
  await attendre(() => ev(() => VIE.LAY.sig === ''), 5000); // la frame suivante rend le plan
  const orig = await ev(() => ({ a: window.__fournil.st.amenagement, sig: VIE.LAY.sig, t: VIE.LAY.tables[0], W: VIE.LAY.W, yA: VIE.LAY.rangees[0], cache: document.querySelector('#b-origine').hidden }));
  check(orig.a === undefined && orig.sig === '' && Math.abs(orig.t.x - orig.W * 0.56) < 1e-9 && orig.t.y === orig.yA && orig.cache, '« Oui » : st.amenagement effacé, le plan d’origine exact revient (table 1 à 56 % de la largeur, rangée du haut)');
  await sleep(500); await page.screenshot({ path: path.join(out, '9-plan-origine.png') });
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  console.log('── 360 × 640 : les boutons du mode tiennent ──');
  const c2 = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await c2.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; }); await c2.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
  const p2 = await c2.newPage(); const err2 = []; p2.on('pageerror', (e) => err2.push(e.message));
  await p2.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await p2.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
  await p2.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.give(1e13); for (const id of ['tables', 'bar', 'banquette', 'terrasse']) for (let k = 0; k < 6; k++) f.meuble(id); f.tiroir('ferme'); f.amenager(true); });
  await sleep(400); await p2.evaluate(() => document.querySelector('#b-deplacer').click()); await sleep(300);
  await p2.evaluate(() => { const st = window.__fournil.st, g = VIE.LAY.grille; for (let r = 0; r < g.rangs; r++) { const p = VIE.proposer(st, 'table3', g.x0 + 0.5 * g.pas + g.pas, g.y0 + (r + 0.5) * g.pas); if (p && p.ok && p.a.tables[2]) { st.amenagement = window.__fournil.G.nettoyerAmenagement(p.a); break; } } }); await sleep(400);
  await p2.evaluate(() => { window.__fournil.amenager(false); window.__fournil.amenager(true); document.querySelector('#b-deplacer').click(); }); await sleep(500);
  const bt = await p2.evaluate(() => ['#b-deplacer', '#b-origine', '#b-fini'].map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { s, x0: r.left, x1: r.right, y0: r.top, y1: r.bottom, h: r.height, vu: !document.querySelector(s).hidden }; }));
  const sep = (a, b) => a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
  check(bt.every((b) => b.vu && b.x0 >= 0 && b.x1 <= 360 && b.h >= 40) && sep(bt[0], bt[2]) && sep(bt[1], bt[2]) && sep(bt[0], bt[1]), `Déplacer, Plan d’origine et Terminé tiennent sur l’écran, sans se chevaucher, 40 px de haut au moins (${bt.map((b) => `${b.s} ${Math.round(b.x0)}–${Math.round(b.x1)}`).join(', ')})`);
  await p2.screenshot({ path: path.join(out, '10-deplacer-360.png') });
  check(err2.length === 0, `aucune erreur dans la page en 360 × 640 (${err2.slice(0, 3).join(' | ')})`);
  await c2.close();
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (aménagement).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
