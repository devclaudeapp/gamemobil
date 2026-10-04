// Parcours automatisé sur un iPhone simulé : garde, première journée, temps réel, absence, hivernage.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(8777);
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push('pageerror: ' + e.message); console.log('PAGEERROR', e.message, e.stack && e.stack.split('\n')[1]); });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|googleapis|gstatic/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:8777/');
  await sleep(900);
  await page.screenshot({ path: out + '/01-garde.png' });
  await page.click('#page');
  await sleep(700);
  const shot = async (n) => { await page.evaluate(() => window.__oeillets.redraw()); await sleep(600); await page.screenshot({ path: `${out}/${n}.png` }); };
  const W = () => page.evaluate(() => { const w = window.__oeillets, st = w.st; const oe = st.cells.find((c) => c.type === 'oeillet'), vas = st.cells.find((c) => c.type === 'vasiere'); return { phase: st.phase, vh: st.tutorialVh, etier: st.etierOpen, vas: +vas.depth.toFixed(1), oeS: Math.round(w.SIM.salinity(oe)), oeKg: +w.SIM.kgOf(oe.crust).toFixed(1), mulon: +st.mulon.toFixed(1), cash: +st.cash.toFixed(2), marge: document.querySelector('#marge-txt').textContent, gates: st.gates }; });
  const setVh = (v) => page.evaluate((v) => window.__oeillets.setVh(v), v);
  const tapEtier = async () => { const p = await page.evaluate(() => window.__oeillets.R.etierPoint(window.__oeillets.st)); await page.touchscreen.tap(p.x, p.y); await sleep(250); };
  const tapGate = async (key) => { const p = await page.evaluate((key) => { const w = window.__oeillets; const g = w.SIM.gatesOf(w.st).find((x) => x.key === key); const s = w.R.gateSegment(w.st, g); return { x: s.mx, y: s.my }; }, key); await page.touchscreen.tap(p.x, p.y); await sleep(250); };
  const cellCenter = (pred) => page.evaluate((pred) => { const w = window.__oeillets; const c = w.st.cells.find(new Function('c', 'return ' + pred)); const r = w.R.cellRect(w.st, c); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }, pred);

  console.log('début', await W());
  await shot('02-tuto-debut');
  await setVh(7.2); await sleep(700); console.log('mer haute', (await W()).marge);
  await tapEtier(); await sleep(1500); console.log('étier ouvert', await W());
  await setVh(8.9); await sleep(700); await tapEtier(); console.log('étier fermé', await W());
  await setVh(10.1); await sleep(700);
  for (const k of ['0,0|1,3', '1,3|2,3', '2,3|3,3', '3,3|4,3']) await tapGate(k);
  await sleep(1200); console.log('trappes ouvertes', await W());
  await shot('03-tuto-eau-descend');
  await setVh(13.5); await sleep(1500); console.log('midi', await W());
  await shot('04-tuto-blanc');
  await setVh(17.6); await sleep(1500); console.log('17h30', await W());
  // tirer le sel : glisser sur l'œillet
  const oe = await cellCenter("c.type==='oeillet'");
  const cdp = await context.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', oe.x - 20, oe.y); for (let i = 1; i <= 8; i++) { await touch('touchMove', oe.x - 20 + i * 6, oe.y + i); await sleep(20); } await touch('touchEnd', 0, 0);
  await sleep(500); console.log('tiré', await W());
  await shot('05-tuto-tire');
  await page.click('#b-coop'); await sleep(500); await shot('06-coop');
  await page.click('[data-a="sell"]'); await sleep(400); await page.click('[data-a="close"]'); await sleep(300);
  console.log('vendu', await W());
  await setVh(19.5); await sleep(700); await tapEtier(); await setVh(21.6); await sleep(700);
  await shot('07-tuto-nuit');
  await tapEtier(); await setVh(23.3); await sleep(1200); console.log('pluie', await W());
  await shot('08-tuto-pluie');
  await tapGate('3,3|4,3');
  await setVh(29.995); await sleep(1500); console.log('fin', await W());
  await shot('09-carnet-premiere-page');
  await page.click('[data-a="close"]'); await sleep(400);
  // fiche de parcelle
  const ad = await cellCenter("c.type==='aderne'"); await page.touchscreen.tap(ad.x, ad.y); await sleep(500); await shot('10-fiche');
  await page.click('[data-a="close"]'); await sleep(300);
  // temps réel accéléré ×600 : une journée en 2,4 min
  await page.evaluate(() => { window.__oeillets.st.cash += 400; window.__oeillets.setSpeed(600); });
  await sleep(4000); console.log('x600 après 4 s', await W());
  await page.click('#b-creuser'); await sleep(400); await shot('11-creuser-mode');
  const free = await page.evaluate(() => { const w = window.__oeillets; const r = w.R.freeRect(w.st, 4, 2); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
  await page.touchscreen.tap(free.x, free.y); await sleep(500); await shot('12-creuser-feuille');
  await page.click('[data-type="oeillet"]'); await sleep(200); await page.click('[data-a="dig"]'); await sleep(400);
  const free2 = await page.evaluate(() => { const w = window.__oeillets; const r = w.R.freeRect(w.st, 2, 2); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; });
  await page.touchscreen.tap(free2.x, free2.y); await sleep(400); await page.click('[data-type="aderne"]'); await sleep(200); await page.click('[data-a="dig"]'); await sleep(400);
  await page.click('#b-creuser'); await sleep(300);
  console.log('creusé', await page.evaluate(() => window.__oeillets.st.cells.map((c) => c.type[0] + c.num + '@' + c.r + ',' + c.c).join(' ')));
  await page.evaluate(() => { const w = window.__oeillets; for (const k in w.st.gates) w.st.gates[k] = 1; w.redraw(); });
  await sleep(6000); await shot('13-x600-jeu');
  await page.click('#b-carnet'); await sleep(500); await shot('14-carnet');
  await page.click('[data-a="close"]'); await sleep(300);
  // absence de 3 jours : rattrapage et page de retour
  await page.evaluate(() => { const w = window.__oeillets; w.setSpeed(1); w.st.lastSimMs = w.simNow() - 3 * 864e5; w.redraw(); });
  await sleep(1200); await shot('15-retour');
  console.log('retour visible', await page.evaluate(() => !document.querySelector('#page').hidden));
  await page.click('[data-a="close"]'); await sleep(400);
  // hivernage
  await page.evaluate(() => window.__oeillets.startHivernage(false)); await sleep(3500); await shot('16-hivernage');
  await page.click('[data-a="go"]'); await sleep(500); await shot('17-rhabillage');
  const st2 = await page.evaluate(() => ({ phase: window.__oeillets.st.phase, rows: window.__oeillets.st.rows, bank: window.__oeillets.st.winterBank, probs: window.__oeillets.SIM.winterProblems(window.__oeillets.st).length }));
  console.log('hiver', st2);
  await page.click('[data-a="open"]'); await sleep(800);
  console.log('saison 2', await W());
  await shot('18-saison2');
  console.log('ERRORS', errors.length ? errors : 'none');
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
