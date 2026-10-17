// Les nouveautés du Fournil : la liste (src/nouveautes.js, vérifiée dans Node), puis la vraie page (fournil/ servie en local) sur un
// téléphone en portrait : la pastille cadeau à côté de la cloche et son point, la feuille « Nouveautés » (la plus récente dépliée, le
// badge « Nouveau », la date en français, les points, Retour), le point qui s'éteint une fois la feuille ouverte, une sauvegarde dont
// nouveautesVues est ancienne (le point, les badges sur les bonnes entrées), une mise à jour par le bandeau « Nouvelle version » qui
// apporte une entrée (le point revient), le haut sans débordement à 360 et 390 px, aucune erreur dans la page.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-nouveautes.cjs   (captures dans test/shots/nouveautes/)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const NV = require('../src/nouveautes.js'), L = NV.NOUVEAUTES;
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };

// ─── 1. la liste, dans Node ───
console.log('── la liste ──');
check(Array.isArray(L) && L.length >= 5, `${L.length} entrées`);
check(new Set(L.map((n) => n.id)).size === L.length, 'des id uniques');
check(L.every((n) => /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(n.id) && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && n.id.startsWith(n.date + '-') && !Number.isNaN(Date.parse(n.date + 'T12:00:00Z'))), 'chaque id : sa date (aaaa-mm-jj) et une lettre');
check(L.every((n, k) => k === 0 || (n.id < L[k - 1].id && n.date <= L[k - 1].date)), 'triées de la plus récente à la plus ancienne (dates et id)');
{ const auj = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }); // la date de la mise en ligne, jamais d'avance (un id du lendemain cacherait les nouveautés ajoutées le jour même)
  check(L.every((n) => n.date <= auj), `aucune nouveauté datée après aujourd’hui (${auj}, heure de Paris) ${L.filter((n) => n.date > auj).map((n) => n.id).join(' ')}`); }
check(L.every((n) => typeof n.titre === 'string' && n.titre.trim().length > 2 && n.titre.length <= 60), 'chaque entrée a un titre court');
check(L.every((n) => Array.isArray(n.points) && n.points.length >= 1 && n.points.every((p) => typeof p === 'string' && p.trim().length > 10)), 'chaque entrée a ses points');
const jargon = /\b(SQL|commit|Playwright|Supabase|WebGL|PGlite|API|CI)\b|\.js\b|\bv\d\b/;
check(L.every((n) => !jargon.test(n.titre) && n.points.every((p) => !jargon.test(p))), 'pas de jargon technique');
check(NV.dateFr('2026-10-16') === 'vendredi 16 octobre' && NV.dateFr('2026-10-17') === 'samedi 17 octobre' && NV.dateFr('2026-11-01') === 'dimanche 1er novembre', `les dates en français : « ${NV.dateFr('2026-10-16')} »`);
check(NV.dateFr('2027-01-04', 2026) === 'lundi 4 janvier 2027' && NV.dateFr('2026-10-12', 2026) === 'lundi 12 octobre' && NV.dateFr('n’importe quoi') === '', "l'année seulement si ce n'est pas celle d'aujourd'hui");
check(NV.derniere() === L[0].id && NV.vueNeuve() === L[1].id, 'la plus récente ; une sauvegarde neuve voit tout sauf elle');
check(NV.nonVues(NV.vueNeuve()).length === 1 && NV.nonVues(NV.derniere()).length === 0 && NV.nonVues(undefined).length === L.length && NV.nonVues('2000-01-01-a').length === L.length, 'nonVues : 1 pour une sauvegarde neuve, 0 à jour, toutes sans valeur');
const ancienne = L[Math.min(5, L.length - 1)].id, attendues = L.filter((n) => n.id > ancienne).map((n) => n.id);
check(NV.nonVues(ancienne).map((n) => n.id).join() === attendues.join() && attendues.length >= 2, `une sauvegarde à « ${ancienne} » : ${attendues.length} nouveautés`);
const B = fs.readFileSync(path.join(root, 'build.js'), 'utf8');
check(/'nouveautes\.js', 'ui\.js'\]/.test(B), 'build.js : nouveautes.js juste avant ui.js');
const PAGE = fs.readFileSync(path.join(root, 'fournil', 'index.html'), 'utf8');
check(PAGE.includes('/* ── nouveautes.js ── */') && PAGE.includes(`id: '${L[0].id}'`) && PAGE.includes('id="b-nouveautes"'), 'la page bâtie contient la liste et la pastille (node build.js)');

// ─── 2. la vraie page ───
const { chromium } = require('playwright');
const PORT = +process.env.PORT_NOUVEAUTES || 9688, BASE = `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary' };
const VRAIE = JSON.parse(fs.readFileSync(path.join(root, 'fournil', 'version.json'), 'utf8')).v;
// une mise à jour simulée : la page servie gagne une entrée en tête (comme une nouvelle version), version.json annonce autre chose
const INJECTEE = { id: '2099-01-01-a', date: '2099-01-01', titre: 'Une nouveauté toute fraîche', points: ['Elle arrive avec la mise à jour.'] };
let enLigne = VRAIE, injecter = false;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/fournil/version.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ v: enLigne })); return; }
  if (p === '/fournil/index.html' && injecter) {
    const html = PAGE.replace('const NOUVEAUTES = [', `const NOUVEAUTES = [${JSON.stringify(INJECTEE)},`);
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(html); return;
  }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'nouveautes'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const nouveauContexte = async (w, h) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await ctx.route('**/*supabase.co/**', (r) => r.abort()); // pas de classement ici
    await ctx.addInitScript(() => { window.__sansEvenements = true; });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`${w} px : ${e}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/supabase|Failed to load resource|net::ERR/i.test(m.text())) erreurs.push(`${w} px, console : ${m.text()}`); });
    return { ctx, page };
  };
  const pret = (page) => page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }).then(() => sleep(900));
  const fermerFeuille = (page) => page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); });
  const point = (page) => page.evaluate(() => !document.querySelector('#b-nouveautes .point').hidden);
  const feuille = (page) => page.evaluate(() => {
    const f = document.querySelector('#feuille'); if (f.hidden) return null;
    return { titre: (f.querySelector('h2') || {}).textContent, entrees: [...f.querySelectorAll('details.nv')].map((d) => ({ id: d.dataset.nv, open: d.open, titre: d.querySelector('.nv-tete b').textContent, date: d.querySelector('.nv-tete small').textContent, nouveau: !!d.querySelector('.nv-badge'), points: [...d.querySelectorAll('.nv-points li')].map((li) => li.textContent) })), retour: !!f.querySelector('[data-a="close"]') && /Retour/.test(f.querySelector('[data-a="close"]').textContent) };
  });

  // 2a. une sauvegarde neuve : la pastille à côté de la cloche, son point (la plus récente seulement)
  console.log('── la pastille ──');
  let { ctx, page } = await nouveauContexte(390, 844);
  await page.goto(BASE + '/fournil/'); await pret(page);
  await fermerFeuille(page); await page.evaluate(() => { const f = window.__fournil; f.st.tuto = 99; f.save(); });
  check(await page.evaluate(() => window.__fournil.st.nouveautesVues) === L[1].id, `une sauvegarde neuve : nouveautesVues = « ${L[1].id} » (tout vu, sauf la plus récente)`);
  const pos = await page.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const c = r('#b-cloche'), n = r('#b-nouveautes'), e = r('#b-etoiles'); return { c: [c.left, c.right, c.top, c.width, c.height], n: [n.left, n.right, n.top, n.width, n.height], e: [e.left, e.top], vis: getComputedStyle(document.querySelector('#b-nouveautes')).display !== 'none', ico: !!document.querySelector('#b-nouveautes svg') }; });
  check(pos.vis && pos.ico && pos.n[3] >= 44 && pos.n[4] >= 44, `la pastille Nouveautés, ronde avec son icône (${Math.round(pos.n[3])}×${Math.round(pos.n[4])})`);
  check(Math.abs(pos.n[2] - pos.c[2]) < 2 && pos.n[0] > pos.c[1] && pos.n[0] - pos.c[1] <= 12 && pos.e[0] > pos.n[1], 'à côté de la cloche, sur la même ligne, avant les étoiles');
  check(await point(page), 'le point : la plus récente pas encore vue');
  check(/1 mise à jour/.test(await page.getAttribute('#b-nouveautes', 'aria-label')), `aria-label : « ${await page.getAttribute('#b-nouveautes', 'aria-label')} »`);
  await page.screenshot({ path: path.join(out, 'haut-390.png'), clip: { x: 0, y: 0, width: 390, height: 140 } });

  // 2b. la feuille
  console.log('── la feuille ──');
  await page.tap('#b-nouveautes'); await sleep(500);
  let f = await feuille(page);
  check(f && f.titre === 'Nouveautés', `la feuille s'ouvre : « ${f && f.titre} »`);
  check(f && f.entrees.length === L.length && f.entrees.every((e, k) => e.id === L[k].id && e.titre === L[k].titre && e.points.length === L[k].points.length), `${f && f.entrees.length} entrées, dans l'ordre, avec leurs points en liste`);
  check(f && f.entrees[0].open && f.entrees.slice(1).every((e) => !e.open), 'la plus récente dépliée en tête, les autres repliées');
  check(f && f.entrees[0].nouveau && f.entrees.slice(1).every((e) => !e.nouveau), 'le badge « Nouveau » sur la seule non vue');
  check(f && f.entrees[0].date === NV.dateFr(L[0].date) && /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d+(er)? [a-zéû]+$/.test(f.entrees[0].date), `la date en français : « ${f && f.entrees[0].date} »`);
  check(f && f.retour, 'un bouton Retour');
  check(!(await point(page)) && await page.evaluate(() => window.__fournil.st.nouveautesVues) === NV.derniere(), 'ouvrir la feuille marque tout comme vu : le point disparaît');
  await page.screenshot({ path: path.join(out, 'feuille-390.png') });
  await page.tap('#feuille details.nv:nth-of-type(2) summary'); await sleep(300);
  check(await page.evaluate(() => document.querySelectorAll('#feuille details.nv')[1].open), 'une autre entrée se déplie au doigt');
  await page.evaluate(() => { const d = document.querySelector('#feuille [data-a="close"]'); d.scrollIntoView({ block: 'center' }); }); await sleep(200);
  await page.tap('#feuille [data-a="close"]'); await sleep(400);
  check(await page.evaluate(() => document.querySelector('#feuille').hidden), 'Retour referme la feuille');
  await page.reload(); await pret(page); await fermerFeuille(page);
  check(!(await point(page)), 'après un rechargement : toujours vu (sauvé)');

  // 2c. une sauvegarde dont nouveautesVues est ancienne
  console.log('── une sauvegarde ancienne ──');
  await page.evaluate((a) => { const f = window.__fournil; f.st.nouveautesVues = a; f.save(); }, ancienne);
  await page.reload(); await pret(page); await fermerFeuille(page);
  check(await point(page), `nouveautesVues = « ${ancienne} » : le point`);
  check(new RegExp(`${attendues.length} mises à jour`).test(await page.getAttribute('#b-nouveautes', 'aria-label')), `aria-label : « ${await page.getAttribute('#b-nouveautes', 'aria-label')} »`);
  await page.tap('#b-nouveautes'); await sleep(500);
  f = await feuille(page);
  check(f && f.entrees.filter((e) => e.nouveau).map((e) => e.id).join() === attendues.join(), `« Nouveau » sur les bonnes entrées : ${f && f.entrees.filter((e) => e.nouveau).map((e) => e.id).join(', ')}`);
  check(f && f.entrees[0].open && f.entrees.filter((e) => e.open).length === 1, 'seule la plus récente est dépliée');
  await page.screenshot({ path: path.join(out, 'feuille-ancienne-390.png') });
  await fermerFeuille(page); await sleep(300);
  check(!(await point(page)), 'feuille vue : plus de point');

  // 2d. une mise à jour par le bandeau « Nouvelle version » apporte une entrée : le point revient
  console.log('── une mise à jour ──');
  injecter = true; enLigne = 'abcdef123456';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // un retour dans le jeu : la version relue 4 s après
  check(await attendre(() => page.$('.maj'), 9000), 'le bandeau « Nouvelle version du Fournil »');
  await Promise.all([page.waitForNavigation({ timeout: 15000 }).catch(() => null), page.tap('.maj')]);
  await pret(page); await fermerFeuille(page); enLigne = VRAIE;
  check(await page.evaluate((id) => window.__fournil && NV.derniere() === id, INJECTEE.id), 'la page rechargée connaît la nouvelle entrée');
  check(await point(page), 'après la mise à jour : le point sur la pastille');
  await page.tap('#b-nouveautes'); await sleep(500);
  f = await feuille(page);
  check(f && f.entrees[0].id === INJECTEE.id && f.entrees[0].open && f.entrees[0].nouveau && f.entrees.filter((e) => e.nouveau).length === 1, 'la nouvelle entrée en tête, dépliée, seule « Nouveau »');
  check(f && f.entrees[0].date === 'jeudi 1er janvier 2099', `une autre année : « ${f && f.entrees[0].date} »`);
  await fermerFeuille(page); injecter = false;
  await ctx.close();

  // 2e. le haut sans débordement, à 390 et 360 px : solde, sous-titre, cloche, nouveautés, étoiles (des valeurs longues, les deux points)
  console.log('── le haut ──');
  for (const w of [390, 360]) {
    ({ ctx, page } = await nouveauContexte(w, w === 360 ? 640 : 844));
    await page.goto(BASE + '/fournil/'); await pret(page); await fermerFeuille(page);
    // [solde, étoiles, recettes ouvertes (niveau, avec apprenti), facteur des gains de la boutique (les étoiles à récolter)] :
    // le tout début (« Touche la baguette ! »), une boutique moyenne, une très grande, l'extrême (« 9,9 Bd € », « 1234 · +494 »)
    for (const [coins, etoiles, niv, lr] of [[0, 0, 0, 0], [999999, 99, 120, 3], [1.23e12, 999, 400, 50], [9.87e15, 1234, 1500, 50]]) {
      await page.evaluate(([c, e, niv, lr]) => {
        const f = window.__fournil, st = f.st; st.tuto = 99; st.coins = c; st.etoiles = e; st.lifetimeRun = Math.max(st.lifetimeRun, c * lr);
        st.stations.forEach((s, k) => { s.niv = niv ? Math.max(1, niv - k * 10) : (k ? 0 : s.niv); s.staff = niv > 0; });
        st.nouveautesVues = ''; st.vu.journal = 0; st.carnetEv = (st.carnetEv || []).concat([{ t: st.now, txt: 'Essai du haut' }]); f.rafraichir();
      }, [coins, etoiles, niv, lr]);
      await sleep(400);
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect(), haut = document.querySelector('#haut'), btns = r('.haut-btns');
        const texte = (s) => { const rg = document.createRange(); rg.selectNodeContents(document.querySelector(s)); const b = rg.getBoundingClientRect(); return { l: b.left, r: b.right }; }; // le texte lui-même, pas sa boîte
        // le rythme et ses bandeaux (marché, critique, boost) se relaient toutes les 4 s : chacun est mesuré, montré un instant
        const spans = [...document.querySelectorAll('#taux > span')], avant = spans.map((sp) => sp.style.display);
        const relais = spans.map((sp) => { spans.forEach((x) => { x.style.display = x === sp ? '' : 'none'; }); const rg = document.createRange(); rg.selectNodeContents(sp); const b = rg.getBoundingClientRect(); return { l: b.left, r: b.right, txt: sp.innerText }; });
        spans.forEach((x, k) => { x.style.display = avant[k]; });
        const textes = [texte('#coins'), ...relais];
        const boutons = ['#b-cloche', '#b-nouveautes', '#b-etoiles'].map((s) => { const b = r(s); return { s, l: b.left, r: b.right, t: b.top, w: b.width, h: b.height }; });
        return { w: innerWidth, sw: haut.scrollWidth, cw: haut.clientWidth, docW: document.documentElement.scrollWidth, h: r('#haut').height, btnsL: btns.left, textes, boutons, coins: document.querySelector('#coins').textContent, taux: relais.map((x) => x.txt).join(' | '), etoiles: document.querySelector('#etoiles-n').textContent, points: [!document.querySelector('#b-cloche .point').hidden, !document.querySelector('#b-nouveautes .point').hidden] };
      });
      const dedans = m.boutons.every((b) => b.l >= 0 && b.r <= m.w + 0.5 && b.w >= 44 && b.h >= 44) && m.boutons.every((b) => Math.abs(b.t - m.boutons[0].t) < 2);
      const fin = Math.max(...m.textes.map((t) => t.r));
      check(m.sw <= m.cw && m.docW <= m.w && dedans && m.textes.every((t) => t.l >= 0) && fin <= m.btnsL + 0.5 && m.points.every(Boolean) && m.h < 80,
        `${w} px, « ${m.coins} », « ${m.taux} », « ${m.etoiles} » : rien ne déborde (texte jusqu'à ${Math.round(fin)}, pastilles dès ${Math.round(m.btnsL)}, la dernière finit à ${Math.round(m.boutons[2].r)}/${m.w}, haut ${Math.round(m.h)} px)`);
      if (niv === 1500 || niv === 0) await page.screenshot({ path: path.join(out, `haut-${w}-${niv ? 'long' : 'debut'}.png`), clip: { x: 0, y: 0, width: w, height: 140 } });
    }
    await page.tap('#b-nouveautes'); await sleep(500);
    check(await page.evaluate(() => { const f = document.querySelector('#feuille'); return !f.hidden && f.scrollWidth <= f.clientWidth && document.documentElement.scrollWidth <= innerWidth; }), `${w} px : la feuille tient en largeur`);
    if (w === 360) await page.screenshot({ path: path.join(out, 'feuille-360.png') });
    await ctx.close();
  }

  check(!erreurs.length, `aucune erreur dans la page ${erreurs.join(' | ')}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
