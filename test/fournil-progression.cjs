// Le lot « progression », dans la vraie page (fournil/ servie en local), sur un téléphone en portrait (390 × 844, puis 360 × 640) :
// 1. une vieille sauvegarde à la boutique n°47 (d'avant les paliers) : au lancement, la feuille « Ton parcours » liste le palier n°40
//    (titre, objet rare, boost en réserve), une fois ; le second sans feuille au lancement (un point « nouveau » sur son bouton, l'annonce
//    au premier toucher, une fois) ; la carte « Prochain palier : n°50 » des Défis,
//    la section « Les paliers » de la feuille du parcours (le n°40 coché, le prochain, les suivants, « … sans fin »), le titre du Boulanger ;
// 2. la boutique n°39 : le défi de palier et sa soupape en petit, la soupape qui sert (« Défi contourné »), puis l'ouverture de la n°40 :
//    l'annonce du palier (la façade, l'objet rare, le boost), puis le nom de la boutique ;
// 3. le second : caché avant la n°5, annoncé à l'ouverture de la n°5 (après le nom) ; son bouton à côté de « Bonus », sa feuille (interrupteur, part de 10 à 90 %, recettes cochées), il
//    achète pendant le jeu (le mode d'achat du joueur intact, une recette décochée jamais achetée), la pastille « 2nd », le point vert ;
// 4. les trophées : le total (« +x % de gains »), les familles, les dorés (liseré), un secret « ??? », la fiche d'un trophée, le toast d'un
//    doré et celui de plusieurs dorés d'un coup (un seul), la pastille Boulanger des dorés pas encore vus ;
// 5. le concours : la carte des Défis (cinq lignes, la sienne en avant), la feuille, la visite d'une rivale (sans réseau) et le retour au
//    concours ; la semaine finie : la feuille du résultat au retour, la pastille des Défis, « Récupérer » (un boost en réserve, une fois) ;
// 6. le chantier du quartier : sans le SQL v6.8 (« pas-ouvert »), rien de cassé (« bientôt » dans la feuille du classement, rien dans les
//    Défis) ; avec, la carte (Défis et classement) et « Chantier fini » une seule fois ;
// 7. 360 × 640 : la barre d'achat (×1 ×10 ×100 Max, Bonus, Second) et les feuilles tiennent sans déborder ; aucune erreur de page.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-progression.cjs
//   (captures dans test/shots/progression/ ; PORT_PROGRESSION pour changer de port)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const G = require('../src/game.js');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_PROGRESSION || 8894, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'progression'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(100); } return false; };

// une sauvegarde : la boutique n, ses recettes, ses étoiles ; ancienne : sans aucun champ du lot (paliers, second, dores, secrets, rivales, projets)
function sauvegarde(n, o) {
  o = o || {}; const now = Date.now(), st = G.newState(now - 3600e3);
  st.boutiques = n; st.etoiles = o.etoiles || Math.max(10, n * 40); st.xp = 40000; st.lifetime = 4e20; st.lifetimeRun = o.lifetimeRun || 1e12; st.coins = o.coins || 1e9; st.tuto = 99; st.lastSeen = now - 20e3; st.specialite = 0;
  st.stations = st.stations.map((s, i) => ({ niv: i < Math.min(16, 7 + n) ? 120 - i * 5 : 0, staff: i < Math.min(16, 7 + n), prog: 0, actif: i < Math.min(16, 7 + n) }));
  st.mode = 1; st.nomBoutique = 'Au Bon Pain'; st.nouveautesVues = '2099-01-01-a'; st.tiroir = 'mi';
  for (const k of ['paliers', 'second', 'dores', 'secrets', 'rivales', 'projets', 'defi']) delete st[k];
  if (!o.ancienne) st.second = { vu: true }; // (l'annonce du second : seulement dans la partie 1)
  if (o.trophees) st.trophees = o.trophees;
  return Object.assign(st, o.plus || {});
}
const raw = (st) => JSON.stringify(st);
let browser;
async function ouvrir(st, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: o.vue || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript((r) => { window.__sansEvenements = true; try { if (!sessionStorage.getItem('semee')) { localStorage.setItem('fournil.v2', r); sessionStorage.setItem('semee', '1'); } } catch (e) { /* rien */ } }, raw(st));
  await ctx.route(/googleapis|gstatic/, (r) => r.abort());
  await ctx.route(new RegExp(SUPA.replace(/[.]/g, '[.]') + '.*'), (r) => { const u = r.request().url(); if (o.projets && /rpc\/fournil_projets/.test(u)) return o.projets(r); return r.abort(); });
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/fournil/?qualite=eco`);
  await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
  await sleep(400);
  return { ctx, page, erreurs, ev: (f, a) => page.evaluate(f, a) };
}
const texteFeuille = (p) => p.evaluate(() => { const f = document.querySelector('#feuille'); return f && !f.hidden ? document.querySelector('#feuille-contenu').textContent.replace(/\s+/g, ' ').trim() : ''; });
const fermer = (p) => p.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="sd-plus-tard"]'); if (b) b.click(); else { document.querySelector('#feuille').hidden = true; document.querySelector('#voile').hidden = true; } });
const toutFermer = async (p) => { for (let k = 0; k < 12; k++) { if (!(await texteFeuille(p))) { await sleep(300); if (!(await texteFeuille(p))) return; } await fermer(p); await sleep(350); } }; // les feuilles du lancement (« Ton parcours »…)
const deborde = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent).some((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > innerWidth + 0.5), sel);

(async () => {
  browser = await chromium.launch();
  const lot = await (async () => { const s = await ouvrir(sauvegarde(3)); const ok = await s.ev(() => typeof PROGRESSION !== 'undefined' && !!GAME.rattraperPaliers && !!GAME.FAMILLES); await s.ctx.close(); return ok; })();
  check(lot, 'le lot est dans la page : PROGRESSION (src/progression.js) et les paliers et trophées de GAME');
  if (!lot) { await browser.close(); server.close(); process.exit(1); }

  // ─── 1. une vieille sauvegarde à la n°47 : le palier n°40 rattrapé une fois, l'annonce du second, la carte et la feuille des paliers ───
  console.log('── 1. une sauvegarde n°47 d’avant les paliers ──');
  {
    const s = await ouvrir(sauvegarde(47, { etoiles: 3000, ancienne: true })), { page, ev } = s;
    const recap = await attendre(async () => /Palier n°40/.test(await texteFeuille(page)));
    const t1 = await texteFeuille(page), e1 = await ev(() => { const st = window.__fournil.st; return { recus: st.paliers.recus.slice(), titre: GAME.titreBoulanger(st), reserve: (st.boosts.reserve || []).filter((b) => b.mult === 5).length }; });
    check(recap && /Boulanger étoilé/.test(t1) && /Toque étoilée/.test(t1) && /boost ×5/.test(t1), `la feuille « Ton parcours » liste le palier n°40 : « ${t1.slice(0, 120)} »`);
    check(e1.recus.join() === '1' && e1.titre === 'Boulanger étoilé' && e1.reserve >= 1, `le palier n°40 donné une fois : reçus ${JSON.stringify(e1.recus)}, titre « ${e1.titre} », boost ×5 en réserve (${e1.reserve})`);
    await ev(() => { const x = document.querySelector('#feuille .pc-recap-palier'); if (x) x.scrollIntoView({ block: 'center' }); }); await sleep(250);
    await page.screenshot({ path: `${out}/1-recap-paliers.png` });
    await fermer(page); await sleep(3200);
    // le second d'une sauvegarde déjà au-delà de la n°5 : rien ne s'ouvre tout seul ; un mot, et le point « nouveau » sur son bouton
    const neuf = await ev(() => { const b = document.querySelector('#b-second'); return { vis: !b.hidden, neuf: b.classList.contains('neuf'), point: getComputedStyle(b.querySelector('.sd-point')).display, feuille: !document.querySelector('#feuille').hidden }; });
    check(neuf.vis && neuf.neuf && neuf.point === 'block' && !neuf.feuille, `le second : pas de feuille au lancement, le point « nouveau » sur son bouton (${JSON.stringify(neuf)})`);
    await ev(() => window.__fournil.tiroir('mi')); await sleep(300);
    await page.click('#b-second'); await sleep(400);
    check(/Un second t’attend/.test(await texteFeuille(page)), 'toucher le bouton : l’annonce du second, la première fois');
    await page.screenshot({ path: `${out}/2-second-annonce.png` });
    await fermer(page); await sleep(1800);
    check(!(await texteFeuille(page)) && await ev(() => window.__fournil.st.second.vu === true && window.__fournil.st.second.actif === false && !document.querySelector('#b-second').classList.contains('neuf')), 'l’annonce une seule fois (st.second.vu) ; le second reste au repos tant qu’on ne l’a pas réglé');
    // la carte des Défis : le prochain palier
    await ev(() => { window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); }); await sleep(500);
    const carte = await ev(() => { const c = document.querySelector('#page-defis .card.parcours'); return c ? c.textContent.replace(/\s+/g, ' ').trim() : ''; });
    check(/Prochain palier : n°50 · Légende de la farine/.test(carte) && /encore 3/.test(carte) && /Paon, un boost ×5/.test(carte), `la carte des Défis : « ${carte.slice(0, 140)} »`);
    check(/Récolte un pas : \+\d+ étoiles/.test(carte), 'dès la n°20, le conseil devient « Récolte un pas : +N étoiles »');
    await page.screenshot({ path: `${out}/3-defis-prochain-palier.png` });
    // la feuille du parcours : la section « Les paliers »
    await ev(() => window.__fournil.parcours()); await sleep(400);
    await ev(() => { const h = [...document.querySelectorAll('#feuille .titre-section')].find((x) => /Les paliers/.test(x.textContent)); if (h) h.scrollIntoView({ block: 'start' }); });
    await sleep(300);
    const pl = await ev(() => [...document.querySelectorAll('#feuille .pc-liste.paliers li')].map((l) => ({ cls: l.className, t: l.textContent.replace(/\s+/g, ' ').trim(), ok: !!l.querySelector('.pc-ok') })));
    check(pl.length === 5 && pl[0].ok && /Boulanger étoilé/.test(pl[0].t) && /actuelle/.test(pl[1].cls) && /Légende de la farine/.test(pl[1].t) && /Seigneur du levain/.test(pl[2].t) && /Prince de la mie/.test(pl[3].t) && /sans fin/.test(pl[4].t), `« Les paliers » : le n°40 coché, le prochain (n°50), les deux suivants, « … sans fin » (${pl.map((x) => x.t.slice(0, 22)).join(' | ')})`);
    check(/Pour l’ouvrir \(défi de la n°49\)/.test(pl[1].t), `le défi qui ouvre le prochain palier : « ${(pl[1].t.match(/Pour l’ouvrir[^|]*/) || [''])[0].slice(0, 90)} »`);
    await page.screenshot({ path: `${out}/4-feuille-paliers.png` });
    await fermer(page);
    // le titre : en-tête de la page Boulanger
    await ev(() => window.__fournil.boulanger()); await sleep(400);
    check(await ev(() => /Boulanger étoilé/.test(document.querySelector('#page-boulanger .boulanger-tete').textContent)), 'le titre « Boulanger étoilé » en tête de la page Boulanger');
    // une deuxième ouverture : rien de redonné, rien de réannoncé
    await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(2500);
    const e2 = await ev(() => ({ recus: window.__fournil.st.paliers.recus.slice(), reserve: (window.__fournil.st.boosts.reserve || []).filter((b) => b.mult === 5).length }));
    check(!(await texteFeuille(page)) && e2.recus.join() === '1' && e2.reserve === e1.reserve, 'au lancement suivant : ni feuille, ni palier, ni boost de plus');
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── 2. la boutique n°39 : le défi de palier, sa soupape, l'ouverture de la n°40 ───
  console.log('── 2. le défi de palier (n°39), la soupape, l’annonce du palier ──');
  {
    const s = await ouvrir(sauvegarde(39, { etoiles: 500, plus: { paliers: { recus: [], titre: '', pas: 50 } } })), { page, ev } = s;
    await toutFermer(page);
    await ev(() => { const f = window.__fournil, st = f.st; st.defi = GAME.creerDefi(st, 39); f.save(); f.page('defis'); f.tiroir('ouvert'); }); await sleep(600);
    const d = await ev(() => ({ defi: window.__fournil.st.defi, carte: document.querySelector('#page-defis .card.parcours').textContent.replace(/\s+/g, ' ').trim(), petit: (document.querySelector('#page-defis .card.parcours .soupape') || {}).textContent || '' }));
    check(d.defi && d.defi.palier === 1 && /Prochain palier : n°40 · Boulanger étoilé/.test(d.carte) && /Défi de passage : 12 commandes spéciales/.test(d.carte), `la carte : le palier n°40 et son défi (« ${(d.carte.match(/Défi de passage[^·]*/) || [''])[0]} »)`);
    check(/ou récolte/.test(d.petit), `la soupape en petit, sous le défi : « ${d.petit} »`);
    await page.screenshot({ path: `${out}/5-defi-palier-soupape.png` });
    // la soupape sert : 4 pas d'étoiles récoltables d'un coup
    await ev(() => { const f = window.__fournil; f.st.lifetimeRun = 1e18; f.rafraichir(); }); await sleep(700);
    const d2 = await ev(() => ({ dp: GAME.defiPassage(window.__fournil.st), carte: document.querySelector('#page-defis .card.parcours').textContent.replace(/\s+/g, ' ').trim(), badge: (() => { const b = document.querySelector('#onglets [data-page="defis"] .badge'); return b && !b.hidden ? b.className : ''; })() }));
    check(d2.dp.fait && d2.dp.soupape && /Défi contourné : 4 pas récoltés/.test(d2.carte), `la soupape a servi : « Défi contourné : 4 pas récoltés » (fait ${d2.dp.fait})`);
    check(/point/.test(d2.badge) || /badge$/.test(d2.badge), `la pastille des Défis (${d2.badge})`);
    // la feuille Étoiles → nouvelle boutique : l'annonce du palier, puis le nom
    await ev(() => window.__fournil.etoiles()); await sleep(300);
    await page.click('#feuille [data-a="prestige"]'); await sleep(300);
    await page.click('#feuille [data-a="oui"]');
    const ann = await attendre(async () => /Boulanger étoilé/.test(await texteFeuille(page)) && !!(await page.$('#feuille .palier-annonce')), 4000);
    const ta = await texteFeuille(page), fac = await ev(() => !!document.querySelector('#feuille .pa-facade svg'));
    check(ann && fac && /palier 1/.test(ta) && /Enseigne dorée/.test(ta) && /Toque étoilée/.test(ta) && /boost ×5 d’une heure/.test(ta), `l’annonce du palier : la façade, la finition, la toque étoilée, le boost (« ${ta.slice(0, 110)} »)`);
    await sleep(500); await page.screenshot({ path: `${out}/6-annonce-palier.png` });
    await page.click('#feuille [data-a="ok"]'); await sleep(400);
    check(/Boutique n°40/.test(await texteFeuille(page)), 'puis la feuille du nom de la boutique n°40');
    const e = await ev(() => ({ n: window.__fournil.st.boutiques, recus: window.__fournil.st.paliers.recus.slice(), defi: window.__fournil.st.defi && window.__fournil.st.defi.type }));
    check(e.n === 40 && e.recus.join() === '1', `boutique n°40, palier reçu (${JSON.stringify(e)})`);
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── 3. le second ───
  console.log('── 3. le second ──');
  {
    const s0 = await ouvrir(sauvegarde(4, { ancienne: true }));
    await sleep(1500);
    check(await s0.ev(() => document.querySelector('#b-second').hidden && !/second/.test(document.querySelector('#feuille-contenu').textContent)), 'avant la boutique n°5 : ni bouton, ni annonce');
    // l'ouverture de la boutique n°5 : le nom, puis l'annonce du second
    await toutFermer(s0.page); await s0.ev(() => window.__fournil.etoiles()); await sleep(300);
    await s0.page.click('#feuille [data-a="prestige"]'); await sleep(300); await s0.page.click('#feuille [data-a="oui"]'); await sleep(700);
    const nom5 = await texteFeuille(s0.page);
    await s0.ev(() => document.querySelector('#feuille [data-a="ok"]').click());
    const ann5 = await attendre(async () => /Un second t’attend/.test(await texteFeuille(s0.page)), 5000);
    check(/Boutique n°5/.test(nom5) && ann5 && await s0.ev(() => window.__fournil.st.boutiques === 5 && !document.querySelector('#b-second').hidden), 'la boutique n°5 ouverte : le nom, puis l’annonce du second, et son bouton');
    check(!s0.erreurs.length, `aucune erreur de page (${s0.erreurs.slice(0, 2).join(' · ')})`);
    await s0.ctx.close();
    const s = await ouvrir(sauvegarde(12, { coins: 1e15, plus: { second: { vu: true, actif: false, part: 50, off: [], t: 0, achats: 0 }, ameliorations: { farine: true } } })), { page, ev } = s;
    await toutFermer(page); await ev(() => window.__fournil.tiroir('mi')); await sleep(400);
    const b0 = await ev(() => { const b = document.querySelector('#b-second'), r = b.getBoundingClientRect(), a = document.querySelector('#b-ameliorations').getBoundingClientRect(); const ba = document.querySelector('.barre-achat'); return { vis: !b.hidden, apres: r.left >= a.right - 1, point: getComputedStyle(b.querySelector('.sd-point')).display, tient: ba.scrollWidth <= ba.clientWidth + 1 && r.right <= innerWidth, large: Math.round(r.width) }; });
    check(b0.vis && b0.apres && b0.point === 'none' && b0.tient && b0.large >= 44, `le bouton du second, à droite de « Bonus », sans point vert au repos ; la barre d’achat tient à 390 px (${JSON.stringify(b0)})`);
    await page.click('#b-second'); await sleep(300);
    const f1 = await texteFeuille(page);
    check(/Le second/.test(f1) && /50 %/.test(f1) && /Il garde toujours la moitié de ta caisse/.test(f1) && /jamais pendant ton absence/.test(f1) && /ne donnent pas de points/.test(f1), 'sa feuille : la part (50 %), « Il garde toujours la moitié de ta caisse », « jamais pendant ton absence », « pas de points »');
    const nRec = await ev(() => document.querySelectorAll('#feuille [data-sd]').length);
    check(nRec === 16 || nRec === await ev(() => window.__fournil.st.stations.filter((x) => x.niv > 0).length), `une ligne par recette débloquée (${nRec})`);
    await page.screenshot({ path: `${out}/7-second-feuille.png` });
    // l'allumer, baisser la part à 40 %, décocher la baguette (0)
    await page.click('#feuille [data-a="sd-actif"]'); await sleep(150);
    await page.click('#feuille [data-a="sd-moins"]'); await sleep(150);
    await page.click('#feuille [data-sd="0"]'); await sleep(150);
    const r1 = await ev(() => ({ s: Object.assign({}, window.__fournil.st.second), txt: document.querySelector('#feuille-contenu').textContent, sw0: document.querySelector('#feuille [data-sd="0"] .interrupteur').getAttribute('aria-checked') }));
    check(r1.s.actif && r1.s.part === 40 && r1.s.off.includes(0) && r1.sw0 === 'false' && /Il garde toujours 60 %/.test(r1.txt), `réglé : au travail, 40 %, la baguette décochée (${JSON.stringify({ actif: r1.s.actif, part: r1.s.part, off: r1.s.off })})`);
    // le bas de la part : 10 %, le bouton « − » grisé
    for (let k = 0; k < 5; k++) { await ev(() => document.querySelector('#feuille [data-a="sd-moins"]').click()); await sleep(80); } // (un toucher de trop sur « − » grisé : rien)
    check(await ev(() => window.__fournil.st.second.part === 10 && document.querySelector('#feuille [data-a="sd-moins"]').getAttribute('aria-disabled') === 'true'), 'la part s’arrête à 10 % (« − » grisé)');
    for (let k = 0; k < 3; k++) { await ev(() => document.querySelector('#feuille [data-a="sd-plus"]').click()); await sleep(80); }
    await fermer(page);
    // la réserve : un bonus encore à acheter (un achat clé) est à portée de caisse ; il attend, et sa feuille le dit
    await sleep(2600); await ev(() => window.__fournil.progression.second()); await sleep(200);
    const attend = await ev(() => ({ a: window.__fournil.st.second.attend, achats: window.__fournil.st.second.achats, txt: document.querySelector('#feuille-contenu').textContent }));
    check(attend.a === true && attend.achats === 0 && /il te laisse la caisse pour ton prochain gros achat/.test(attend.txt), 'un achat clé à portée (un bonus) : il attend, et sa feuille dit « il te laisse la caisse pour ton prochain gros achat »');
    await fermer(page);
    await ev(() => { const st = window.__fournil.st; for (const a of GAME.AMELIORATIONS) st.ameliorations[a.id] = true; }); // tous les bonus achetés : plus d'achat clé
    const avant = await ev(() => ({ achats: window.__fournil.st.second.achats, niv0: window.__fournil.st.stations[0].niv, mode: window.__fournil.st.mode, autres: window.__fournil.st.stations.reduce((a, x, i) => a + (i ? x.niv : 0), 0), coins: window.__fournil.st.coins }));
    const achete = await attendre(() => ev((n) => window.__fournil.st.second.achats > n, avant.achats), 9000);
    await sleep(400);
    const apres = await ev(() => ({ niv0: window.__fournil.st.stations[0].niv, mode: window.__fournil.st.mode, autres: window.__fournil.st.stations.reduce((a, x, i) => a + (i ? x.niv : 0), 0), achats: window.__fournil.st.second.achats, pastilles: document.querySelectorAll('#cartes .second-pastille').length, cartes: document.querySelectorAll('#cartes .carte:not([hidden]) .niv').length, point: getComputedStyle(document.querySelector('#b-second .sd-point')).display }));
    check(achete && apres.autres > avant.autres, `il achète pendant le jeu : ${apres.achats} achat(s), +${apres.autres - avant.autres} niveaux`);
    check(apres.niv0 === avant.niv0, 'la recette décochée (la baguette) n’est jamais achetée');
    check(apres.mode === avant.mode, `le mode d’achat du joueur intact (${apres.mode})`);
    check(apres.pastilles === apres.cartes - 1 && apres.point === 'block', `la pastille « 2nd » sur les recettes cochées (${apres.pastilles}), le point vert sur le bouton`);
    await ev(() => { document.querySelector('#cartes .carte[data-i="1"]').scrollIntoView({ block: 'center' }); }); await sleep(300);
    await page.screenshot({ path: `${out}/8-second-cartes.png` });
    // sous un écran couvrant (l'Atelier) : il s'arrête
    await ev(() => window.__fournil.ouvrirAtelier('four')); await sleep(400);
    const a0 = await ev(() => window.__fournil.st.second.achats), ouvert = await ev(() => !!window.__fournil.atelier().ouvert); await sleep(4500);
    const a1 = await ev(() => window.__fournil.st.second.achats); await ev(() => window.__fournil.fermerAtelier());
    check(ouvert && a1 === a0, `sous l’Atelier, il ne fait rien (${a0} → ${a1})`);
    // pendant l'absence : rien (G.absence ne l'appelle pas)
    const ab = await ev(() => { const f = window.__fournil, a = f.st.second.achats; f.absence(3 * 3600e3); return f.st.second.achats - a; });
    check(ab === 0, 'pendant l’absence, rien acheté');
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── 4. les trophées : le total, les familles, les dorés, un secret, la fiche, les toasts, la pastille ───
  console.log('── 4. les trophées ──');
  {
    const t = Date.now() - 864e5, tr = { premiere: t, cent: t, dixmille: t, million: t, equipe: t, bras: t, eclair: t, bricoleur: t, aube: t };
    const s = await ouvrir(sauvegarde(8, { trophees: tr, plus: { dores: { premiere: t }, stats: Object.assign(G.newState(Date.now()).stats, { ventes: 1.5e5 }) } })), { page, ev } = s;
    await toutFermer(page); await ev(() => window.__fournil.boulanger()); await ev(() => window.__fournil.tiroir('ouvert')); await sleep(600);
    const b = await ev(() => { const c = document.querySelector('#page-boulanger .trophees-carte'); return c ? { compte: c.querySelector('.compte').textContent, bonus: c.querySelector('.tr-bonus').textContent, fams: [...c.querySelectorAll(':scope > .tr-fam .tr-fam-t')].map((h) => h.textContent.replace(/\s+/g, ' ')), dores: c.querySelectorAll('.troph.dore').length, n: GAME.TROPHEES.length, bilan: GAME.bilanTrophees(window.__fournil.st) } : null; });
    check(b && b.n === 48 && new RegExp(`^${b.bilan.trophees}/48 · \\+`).test(b.compte) && /Tes trophées : \+[\d,]+ % de gains/.test(b.bonus), `l’en-tête : « ${b && b.compte} », « ${b && b.bonus} »`);
    check(b && b.fams.some((x) => /Les fournées.*4\/4.*\+0,3 %/.test(x)) && b.fams.some((x) => /Les mains.*3\/3/.test(x)), `les familles (complètes : +0,3 %) : ${b && b.fams.join(' | ')}`);
    check(b && b.dores === 1, `un trophée doré (liseré or) : ${b && b.dores}`);
    await ev(() => document.querySelector('#page-boulanger .trophees-carte').scrollIntoView({ block: 'start' })); await sleep(250);
    await page.screenshot({ path: `${out}/9-trophees-familles.png` });
    // les secrets : « ??? » tant qu'ils ne sont pas gagnés ; « Lève-tôt » gagné se montre
    await ev(() => document.querySelectorAll('#page-boulanger details.repli').forEach((d) => { d.open = true; })); await sleep(300);
    const sec = await ev(() => ({ caches: [...document.querySelectorAll('#page-boulanger .troph.secret')].map((x) => x.textContent), aube: [...document.querySelectorAll('#page-boulanger .troph')].some((x) => /Lève-tôt/.test(x.textContent)), fuite: [...document.querySelectorAll('#page-boulanger .troph')].some((x) => /Câlin express|Bonne année|Porte-bonheur/.test(x.textContent)) }));
    check(sec.caches.length === 7 && sec.caches.every((x) => /\?\?\?/.test(x) && /Trophée secret/.test(x)) && sec.aube && !sec.fuite, `les secrets : 7 « ??? · Trophée secret », « Lève-tôt » (gagné) visible, aucun nom dévoilé`);
    await ev(() => { const x = document.querySelector('#page-boulanger .troph.secret'); x.scrollIntoView({ block: 'center' }); }); await sleep(250);
    await page.screenshot({ path: `${out}/10-trophees-secrets.png` });
    // la fiche d'un trophée
    await ev(() => document.querySelector('#page-boulanger [data-trophee="cent"]').click()); await sleep(300);
    const fi = await texteFeuille(page);
    check(/Sa version dorée/.test(fi) && /300 000/.test(fi) && /Les fournées/.test(fi) && /4\/4/.test(fi), `la fiche : la version dorée, la famille (« ${fi.slice(0, 120)} »)`);
    await page.screenshot({ path: `${out}/11-fiche-trophee.png` });
    await fermer(page);
    await ev(() => document.querySelector('#page-boulanger .troph.secret').click()); await sleep(300);
    check(/\?\?\?/.test(await texteFeuille(page)) && !/Câlin|Bonne année|Porte-bonheur|Le retour du/.test(await texteFeuille(page)), 'la fiche d’un secret ne dit rien');
    await fermer(page);
    // un doré gagné en jouant : un toast ; plusieurs d'un coup : un seul toast ; la pastille de l'onglet Boulanger
    await ev(() => { window.__fournil.page('boutique'); }); await sleep(300);
    const toasts = []; const lire = async () => { const x = await ev(() => { const t = document.querySelector('.toast'); return t ? t.textContent : ''; }); if (x && !toasts.includes(x)) toasts.push(x); };
    // (les dorés se vérifient toutes les 10 s de jeu, GAME.verifierTrophees : on guette le toast jusqu'à 13 s)
    await ev(() => { window.__fournil.st.stats.ventes = 3.5e5; });
    for (let k = 0; k < 130 && !toasts.some((x) => /doré/.test(x)); k++) { await lire(); await sleep(100); }
    check(toasts.some((x) => /^Trophée doré : Cent fournées !$/.test(x) || /^Trophée doré : /.test(x)), `un doré : « ${toasts.join(' / ')} »`);
    toasts.length = 0; await sleep(2600);
    await ev(() => { window.__fournil.st.stats.ventes = 1.2e7; window.__fournil.st.trophees.genereux = Date.now(); });
    for (let k = 0; k < 130 && !toasts.some((x) => /doré/.test(x)); k++) { await lire(); await sleep(100); }
    for (let k = 0; k < 20; k++) { await lire(); await sleep(100); } // (et rien d'autre derrière)
    check(toasts.filter((x) => /doré/.test(x)).length === 1 && toasts.some((x) => /^\d+ trophées dorés !$/.test(x)), `plusieurs dorés d'un coup : un seul toast (« ${toasts.join(' / ')} »)`);
    await sleep(300);
    const pb = await ev(() => { const b = document.querySelector('#onglets [data-page="boulanger"] .badge'); return { n: b.hidden ? 0 : +b.textContent, talents: GAME.ptsTalents(window.__fournil.st), dores: Object.keys(window.__fournil.st.dores).length, vus: window.__fournil.st.vu.dores }; });
    check(pb.n === pb.talents + pb.dores - pb.vus && pb.dores - pb.vus >= 3, `la pastille de l’onglet Boulanger compte les dorés pas encore vus (${JSON.stringify(pb)})`);
    await ev(() => window.__fournil.boulanger()); await sleep(400);
    const pb2 = await ev(() => { const b = document.querySelector('#onglets [data-page="boulanger"] .badge'); return { n: b.hidden ? 0 : +b.textContent, talents: GAME.ptsTalents(window.__fournil.st) }; });
    check(pb2.n === pb2.talents, `la page Boulanger ouverte, les dorés sont vus : il ne reste que les points de talent (${JSON.stringify(pb2)})`);
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── 5. le concours des boulangeries rivales ───
  console.log('── 5. le concours ──');
  {
    const s = await ouvrir(sauvegarde(9)), { page, ev } = s;
    await toutFermer(page);
    const prev = await ev(() => { const st = window.__fournil.st, G = GAME, now = Date.now(), p = G.semaineKey(now - 7 * 864e5), pp = G.semaineKey(now - 14 * 864e5);
      G.pointsSemaine(st); st.points.semaines = [{ semaine: pp, points: 300 }, { semaine: p, points: 900 }];
      st.rivales = { semaine: G.semaineKey(now), ref: 300, medailles: { or: 0, argent: 1, bronze: 2 }, hist: [], aPayer: [], serie: 0, serieMax: 0 }; window.__fournil.save(); return p; });
    await ev(() => { window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); }); await sleep(500);
    await ev(() => document.querySelector('#page-defis .card.concours').scrollIntoView({ block: 'center' })); await sleep(300);
    const c = await ev(() => { const x = document.querySelector('#page-defis .card.concours'); return x ? { lignes: [...x.querySelectorAll('.cc-liste li')].map((l) => ({ moi: l.classList.contains('moi'), t: l.textContent })), txt: x.textContent, avantAtelier: !!(x.compareDocumentPosition(document.querySelector('#page-defis .atelier-carte')) & 4) && !!(document.querySelector('#page-defis .card.concours').previousElementSibling) } : null; });
    check(c && c.lignes.length === 5 && c.lignes.filter((l) => l.moi).length === 1 && c.lignes.some((l) => l.moi && /Au Bon Pain/.test(l.t)) && /jusqu’à dimanche/.test(c.txt), `la carte du concours : 5 lignes, la sienne en avant (« ${c && c.lignes.map((l) => l.t).join(' | ').slice(0, 160)} »)`);
    check(c && c.avantAtelier, 'entre le défi de la semaine et l’Atelier');
    await page.screenshot({ path: `${out}/12-defis-concours.png` });
    await page.click('#page-defis .card.concours'); await sleep(300);
    const fc = await texteFeuille(page), nv = await ev(() => document.querySelectorAll('#feuille [data-rivale]').length);
    check(/Concours de la semaine/.test(fc) && nv === 4 && /Tes médailles/.test(fc), `la feuille : les règles, quatre rivales à visiter (${nv}), les médailles`);
    await page.screenshot({ path: `${out}/13-feuille-concours.png` });
    const nomR = await ev(() => { const b = document.querySelector('#feuille [data-rivale]'); const n = b.closest('li').querySelector('.cc-nom').textContent; b.click(); return n; });
    const vis = await attendre(() => ev(() => !document.querySelector('#visite').hidden && !!window.__fournil.visite()), 4000);
    const vt = await ev(() => ({ titre: document.querySelector('#vi-titre').textContent, bas: document.querySelector('#vi-bas').textContent }));
    check(vis && vt.titre === nomR && /n’existe que dans ton téléphone/.test(vt.bas) && !/pourboire/i.test(vt.bas), `la visite d’une rivale, sans réseau : « ${vt.titre} »`);
    await sleep(600); await page.screenshot({ path: `${out}/14-visite-rivale.png` });
    await page.click('#vi-bas [data-vi="retour"]'); await sleep(400);
    check(/Concours de la semaine/.test(await texteFeuille(page)) && await ev(() => document.querySelector('#visite').hidden), 'Retour : la feuille du concours revient');
    await fermer(page);
    // la semaine finie : la feuille du résultat, la pastille, « Récupérer »
    await ev((p) => { const r = window.__fournil.st.rivales; r.semaine = p; r.ref = 300; window.__fournil.tiroir('ferme'); window.__fournil.progression.retour(60e3); }, prev);
    const res = await attendre(async () => /Médaille d’or/.test(await texteFeuille(page)), 5000); await sleep(600);
    const rr = await ev(() => ({ aPayer: window.__fournil.st.rivales.aPayer.length, or: window.__fournil.st.rivales.medailles.or, badge: document.querySelector('#onglets [data-page="defis"] .badge').textContent }));
    check(res && rr.aPayer === 1 && rr.or === 1 && +rr.badge >= 1, `au retour, le résultat : médaille d’or (aPayer ${rr.aPayer}, pastille des Défis ${rr.badge})`);
    await sleep(400); await page.screenshot({ path: `${out}/15-resultat-concours.png` });
    const avant = await ev(() => (window.__fournil.st.boosts.reserve || []).length);
    await page.click('#feuille [data-a="recuperer"]'); await sleep(400);
    const ap = await ev(() => ({ n: (window.__fournil.st.boosts.reserve || []).length, trois: (window.__fournil.st.boosts.reserve || []).some((b) => b.mult === 3), aPayer: window.__fournil.st.rivales.aPayer.length, badge: (() => { const b = document.querySelector('#onglets [data-page="defis"] .badge'); return b.hidden ? '' : b.textContent; })() }));
    check(ap.n === avant + 1 && ap.trois && ap.aPayer === 0, `« Récupérer » : un boost ×3 en réserve, une fois (${avant} → ${ap.n})`);
    await ev(() => window.__fournil.progression.retour(60e3)); await sleep(1800);
    check(!/Médaille/.test(await texteFeuille(page)) && (await ev(() => (window.__fournil.st.boosts.reserve || []).length)) === ap.n, 'un deuxième retour : rien de repayé');
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── 6. le chantier du quartier : sans le SQL (« pas-ouvert »), puis avec ───
  console.log('── 6. le chantier du quartier ──');
  {
    const s = await ouvrir(sauvegarde(9), { projets: (r) => r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) }) }), { page, ev } = s;
    await toutFermer(page); await ev(() => window.__fournil.progression.projets()); await sleep(500);
    await ev(() => { window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); }); await sleep(400);
    check(await ev(() => !document.querySelector('#page-defis .projet-carte')), 'sans le SQL v6.8 : rien dans les Défis');
    await ev(() => window.__fournil.feuilleClassement()); await sleep(800);
    const ft = await texteFeuille(page);
    check(/Les chantiers du quartier ouvrent bientôt/.test(ft) && !(await page.$('#feuille .projet-carte')), 'la feuille du classement dit seulement « bientôt »');
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }
  {
    const lundi = G.semaineKey(Date.now()), rep = { version: 1, semaine: lundi, cette_semaine: 5000, en_cours: { rang: 2, cout: 8000, total: 5000, pourcent: 62, actifs: 20, depuis: lundi }, finis: [{ rang: 1, semaine: lundi, fini: new Date().toISOString() }] };
    const st = sauvegarde(9);
    const s = await ouvrir(st, { projets: (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rep) }) }), { page, ev } = s;
    await toutFermer(page); await ev(() => window.__fournil.progression.projets());
    const fini = await attendre(async () => /Chantier fini : la fontaine/.test(await texteFeuille(page)), 6000);
    check(fini && await ev(() => window.__fournil.st.projets.vus.includes(1)), 'un chantier fini : « Chantier fini : la fontaine ! », une fois (st.projets.vus)');
    await sleep(300); await page.screenshot({ path: `${out}/16-chantier-fini.png` });
    await page.click('#feuille [data-a="ok"]'); await sleep(300);
    await ev(() => { window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); }); await sleep(500);
    const pc = await ev(() => { const x = document.querySelector('#page-defis .projet-carte'); return x ? x.textContent.replace(/\s+/g, ' ') : ''; });
    check(/Le chantier du quartier : le kiosque à musique/.test(pc) && /5 000 \/ 8 000/.test(pc) && /Cette semaine, tu as apporté/.test(pc), `la petite carte des Défis : « ${pc.slice(0, 120)} »`);
    await ev(() => document.querySelector('#page-defis .projet-carte').scrollIntoView({ block: 'center' })); await sleep(200);
    await page.screenshot({ path: `${out}/17-defis-chantier.png` });
    await ev(() => window.__fournil.feuilleClassement()); await sleep(800);
    check(!!(await page.$('#feuille .projet-carte')) && /croissants/.test(await texteFeuille(page)), 'la carte du chantier dans la feuille du classement, sous l’objectif commun');
    await page.screenshot({ path: `${out}/18-classement-chantier.png` });
    await fermer(page);
    await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
    await ev(() => window.__fournil.progression.projets()); await sleep(2500);
    check(!/Chantier fini/.test(await texteFeuille(page)), 'au lancement suivant : pas de deuxième annonce');
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── 7. 360 × 640 : la barre d'achat et les feuilles tiennent ───
  console.log('── 7. 360 × 640 ──');
  {
    const s = await ouvrir(sauvegarde(47, { etoiles: 3000, plus: { paliers: { recus: [1], titre: 'Boulanger étoilé', pas: 300 }, second: { vu: true, actif: true, part: 50, off: [], t: 0, achats: 3 } } }), { vue: { width: 360, height: 640 } }), { page, ev } = s;
    await toutFermer(page); await ev(() => window.__fournil.tiroir('mi')); await sleep(500);
    const barre = await ev(() => { const b = document.querySelector('.barre-achat'), r = b.getBoundingClientRect(), s2 = document.querySelector('#b-second').getBoundingClientRect(), am = document.querySelector('#b-ameliorations').getBoundingClientRect(); return { w: b.scrollWidth, cw: b.clientWidth, droite: s2.right, bonus: am.right <= s2.left + 1, haut: Math.round(r.height), sh: Math.round(s2.height), sl: Math.round(s2.width) }; });
    check(barre.w <= barre.cw + 1 && barre.droite <= 360 && barre.bonus && barre.sh >= 44 && barre.sl >= 44, `la barre d’achat tient à 360 px (${JSON.stringify(barre)})`);
    await page.screenshot({ path: `${out}/19-barre-360.png` });
    for (const [nom, f] of [['second', () => window.__fournil.progression.second()], ['concours', () => window.__fournil.progression.concours()], ['palier', () => window.__fournil.progression.palier(7)], ['parcours', () => window.__fournil.parcours()]]) {
      await ev(f); await sleep(400);
      const d = await deborde(page, '#feuille-contenu, #feuille-contenu .cc-liste li, #feuille-contenu .pc-ligne, #feuille-contenu .pa-ligne, #feuille-contenu .sd-part, #feuille-contenu .palier-annonce');
      check(!d, `la feuille « ${nom} » ne déborde pas à 360 px`);
      await page.screenshot({ path: `${out}/20-${nom}-360.png` });
      await fermer(page); await sleep(150);
    }
    await ev(() => { window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); }); await sleep(500);
    check(!(await deborde(page, '#page-defis .card')), 'les cartes des Défis (palier, concours) ne débordent pas à 360 px');
    await page.screenshot({ path: `${out}/21-defis-360.png` });
    await ev(() => window.__fournil.boulanger()); await sleep(500);
    check(!(await deborde(page, '#page-boulanger .card, #page-boulanger .troph')), 'les trophées ne débordent pas à 360 px');
    check(!s.erreurs.length, `aucune erreur de page (${s.erreurs.slice(0, 2).join(' · ')})`);
    await s.ctx.close();
  }

  // ─── les nouveautés ───
  const NV = require('../src/nouveautes.js'), n0 = NV.NOUVEAUTES[0];
  check(n0.id === '2026-11-03-a' && n0.titre.length <= 60 && /paliers|Paliers/.test(n0.titre), `la nouveauté du lot : ${n0.id} « ${n0.titre} » (${n0.titre.length} caractères)`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
