// Régressions ciblées : fin de saison pendant l'absence, voile levé en saison 2, confirmation visible depuis le carnet, fiche de la vasière, second doigt.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => { let p = req.url.split('?')[0]; if (p === '/') p = '/index.html'; fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); res.end(d); }); }).listen(8779);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8779/'); await sleep(500);
  await page.click('#page'); await sleep(300);
  await page.evaluate(() => window.__oeillets.setVh(29.999)); await sleep(800);
  await page.click('[data-a="close"]'); await sleep(300);
  // 1. fiche de la vasière reste ouverte après un toucher
  const vas = await page.evaluate(() => { const w = window.__oeillets; const r = w.R.cellRect(w.st, w.st.cells[0]); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
  await page.touchscreen.tap(vas.x, vas.y); await sleep(600);
  check(await page.evaluate(() => !document.querySelector('#feuille').hidden), 'la fiche de la vasière reste ouverte après le toucher');
  await page.click('[data-a="close"]'); await sleep(200);
  // 2. confirmation « Fermer le marais » visible depuis le carnet
  await page.evaluate(() => { const w = window.__oeillets; w.st.seasonStartMs -= 15 * 864e5; w.st.lastSimMs = w.simNow(); });
  await page.click('#b-carnet'); await sleep(400);
  await page.click('[data-a="fermer"]'); await sleep(400);
  const vis = await page.evaluate(() => { const f = document.querySelector('#feuille'); const r = f.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + 40); return { hidden: f.hidden, onTop: !!(el && f.contains(el)), pageHidden: document.querySelector('#page').hidden }; });
  check(!vis.hidden && vis.onTop, 'la confirmation est au premier plan : ' + JSON.stringify(vis));
  await page.click('[data-a="non"]'); await sleep(300);
  check(await page.evaluate(() => !document.querySelector('#page').hidden), 'renoncer ramène au carnet');
  await page.click('[data-a="close"]'); await sleep(300);
  // 3. fin de saison pendant l'absence : une seule page de retour, bilan non vide, puis hivernage
  await page.evaluate(() => { const w = window.__oeillets; w.st.seasonStartMs = w.simNow() - 31 * 864e5; w.st.lastSimMs = w.simNow() - 30 * 864e5; w.st.items.clapet = true; for (const k in w.st.gates) w.st.gates[k] = 1; w.redraw(); });
  await sleep(1500);
  const r1 = await page.evaluate(() => document.querySelector('#page-contenu').innerText);
  await sleep(1200);
  const r2 = await page.evaluate(() => document.querySelector('#page-contenu').innerText);
  check(r1 === r2 && /\d+ marées/.test(r1) && !/^0 marée/.test(r1.split('\n').find((l) => /marée/.test(l)) || '0 marée'), 'page de retour stable et non vide : ' + (r1.split('\n').find((l) => /marée/.test(l)) || '').slice(0, 90));
  await page.click('[data-a="close"]'); await sleep(3800);
  check(await page.evaluate(() => window.__oeillets.st.phase === 'hiver' && !document.querySelector('#page').hidden), 'hivernage automatique puis page d’hivernage');
  await page.click('[data-a="go"]'); await sleep(500);
  const geoH = await page.evaluate(() => { const w = window.__oeillets; const g = w.R.layout(w.st); const bar = document.querySelector('#hiver-bar').getBoundingClientRect(); return { gridBottom: g.gridBottom, barTop: bar.top }; });
  check(geoH.gridBottom < geoH.barTop, `la grille s'arrête au-dessus de la barre d'hiver (${geoH.gridBottom} < ${Math.round(geoH.barTop)})`);
  await page.click('[data-a="open"]'); await sleep(800);
  // 4. voile levé en saison 2 : le pixel au centre d'une case d'eau n'est pas assombri
  const st2 = await page.evaluate(() => { const w = window.__oeillets; return { phase: w.st.phase, season: w.st.seasonIndex, marge: document.querySelector('#marge').getBoundingClientRect().top, grid: w.R.layout(w.st).gridBottom }; });
  check(st2.phase === 'play' && st2.season === 2, 'saison 2 ouverte');
  check(Math.abs(st2.marge - st2.grid - 2) < 3, `marge repositionnée sous la grille (${Math.round(st2.marge)} vs ${st2.grid})`);
  const pix = await page.evaluate(() => { const w = window.__oeillets; w.st.cells[0].depth = 20; w.redraw(); return new Promise((res) => setTimeout(() => { const cv = document.querySelector('#marais'); const r = w.R.cellRect(w.st, w.st.cells[0]); const d = cv.getContext('2d').getImageData(Math.round((r.x + r.w / 2) * 2), Math.round((r.y + r.h / 2) * 2), 1, 1).data; res([d[0], d[1], d[2]]); }, 700)); });
  check(pix[1] > 90, `eau de la vasière lisible, pas noyée sous le voile (rgb ${pix.join(',')})`);
  // 5. second doigt pendant un geste : ignoré
  const cdp = await context.newCDPSession(page);
  const gatesBefore = await page.evaluate(() => JSON.stringify(window.__oeillets.st.gates));
  const gpos = await page.evaluate(() => { const w = window.__oeillets; const g = w.SIM.gatesOf(w.st)[0]; const s = w.R.gateSegment(w.st, g); return { x: s.mx, y: s.my }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 30, y: 400, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 30, y: 400, id: 1 }, { x: gpos.x, y: gpos.y, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 30, y: 400, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  check(await page.evaluate(() => JSON.stringify(window.__oeillets.st.gates)) === gatesBefore, 'un second doigt ne bascule pas de trappe');
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
