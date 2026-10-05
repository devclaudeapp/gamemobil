// Parcours automatique du Fournil sur un iPhone simulé : touches, améliorations, embauche, feuilles, absence, nouvelle boutique.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(8781);
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|googleapis|gstatic|404/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8781/'); await sleep(800);
  await page.screenshot({ path: out + '/01-debut.png' });
  const W = () => page.evaluate(() => { const s = window.__fournil.st; return { coins: +s.coins.toFixed(1), niv: s.stations.map((x) => x.niv).join(','), staff: s.stations.map((x) => +x.staff).join(''), tuto: s.tuto, ventes: s.stats.ventes, indice: document.querySelector('#indice').hidden ? '' : document.querySelector('#indice-txt').textContent }; });
  console.log('début', await W());
  check((await W()).indice.includes('Touche la baguette'), 'premier indice : toucher la baguette');
  // toucher la baguette 6 fois (1 s chacune)
  for (let k = 0; k < 6; k++) { await page.tap('.carte[data-i="0"] .barre'); await sleep(1150); }
  console.log('après 6 touches', await W());
  check((await W()).ventes >= 5, 'des baguettes vendues');
  await page.screenshot({ path: out + '/02-touches.png' });
  check((await W()).indice.includes('améliore'), 'indice : améliorer');
  await page.tap('.carte[data-i="0"] [data-a="ameliorer"]'); await sleep(300);
  check((await W()).niv.startsWith('2'), 'baguette niveau 2');
  // accélérer : on crédite 5 000 € et on suit les indices
  await page.evaluate(() => window.__fournil.give(5000)); await sleep(400);
  console.log('crédité', await W());
  check((await W()).indice.includes('croissants'), 'indice : débloquer les croissants');
  await page.tap('.carte[data-i="1"] [data-a="debloquer"]'); await sleep(500);
  await page.screenshot({ path: out + '/03-croissant.png' });
  check((await W()).niv.split(',')[1] === '1', 'croissants débloqués');
  check((await W()).indice.includes('Léo'), 'indice : embaucher Léo');
  await page.tap('.carte[data-i="0"] [data-a="embaucher"]'); await sleep(500);
  check((await W()).staff.startsWith('1'), 'Léo embauché');
  await sleep(2500);
  console.log('auto', await W());
  check((await W()).ventes >= 8, 'les baguettes se vendent toutes seules');
  await page.screenshot({ path: out + '/04-apprenti.png' });
  // mode ×10 puis Max, achats
  await page.tap('.modes [data-mode="max"]'); await sleep(200);
  await page.tap('.carte[data-i="1"] [data-a="ameliorer"]'); await sleep(300);
  console.log('max', await W());
  await page.tap('.modes [data-mode="1"]'); await sleep(200);
  await page.evaluate(() => window.__fournil.give(5e6)); await sleep(300);
  for (const i of [2, 3, 4]) { await page.tap(`.carte[data-i="${i}"] [data-a="debloquer"]`); await sleep(250); }
  for (const i of [1, 2, 3]) { await page.tap(`.carte[data-i="${i}"] [data-a="embaucher"]`); await sleep(250); }
  await sleep(1500);
  await page.screenshot({ path: out + '/05-boutique.png' });
  // améliorations
  await page.tap('#b-ameliorations', { force: true }); await sleep(400); await page.screenshot({ path: out + '/06-ameliorations.png' });
  await page.tap('[data-id="farine"]'); await sleep(300);
  check(await page.evaluate(() => !!window.__fournil.st.ameliorations.farine), 'farine de tradition achetée');
  await page.touchscreen.tap(195, 40); await sleep(300);
  check(await page.evaluate(() => document.querySelector('#feuille').hidden), 'la feuille se ferme sur le voile');
  // absence
  await page.evaluate(() => window.__fournil.absence(3 * 3600 * 1000)); await sleep(500);
  await page.screenshot({ path: out + '/07-absence.png' });
  const absTxt = await page.evaluate(() => document.querySelector('#feuille-contenu').innerText);
  check(/Pendant ton absence/.test(absTxt) && /3 h/.test(absTxt), 'feuille d’absence : ' + absTxt.split('\n').slice(0, 3).join(' / '));
  await page.tap('[data-a="close"]'); await sleep(300);
  // étoiles
  await page.evaluate(() => { window.__fournil.st.lifetimeRun = 5e9; }); await sleep(100);
  await page.tap('#b-etoiles', { force: true }); await sleep(400); await page.screenshot({ path: out + '/08-etoiles.png' });
  await page.tap('[data-a="prestige"]'); await sleep(400); await page.tap('[data-a="oui"]'); await sleep(600);
  const s2 = await W(); console.log('boutique 2', s2);
  check(s2.niv === '1,0,0,0,0,0,0,0' && await page.evaluate(() => window.__fournil.st.etoiles > 0), 'nouvelle boutique : produits remis à zéro, étoiles gardées');
  await page.screenshot({ path: out + '/09-boutique2.png' });
  // rechargement : la sauvegarde tient
  await page.reload(); await sleep(800);
  const s3 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s3.boutiques === 2 && s3.etoiles > 0, 'sauvegarde rechargée : ' + JSON.stringify(s3));
  // petit écran
  const p2 = await (await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR' })).newPage();
  await p2.goto('http://localhost:8781/'); await sleep(700); await p2.screenshot({ path: out + '/10-petit-ecran.png' });
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'pas de défilement horizontal à 360 px');
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
