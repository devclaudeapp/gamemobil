// La mise à jour du Fournil, dans la vraie page (fournil/ servie en local, service worker compris), sur un téléphone en portrait.
// build.js écrit la version dans la page (window.FOURNIL_VERSION) et dans fournil/version.json ; le jeu relit ce fichier, jamais en cache.
// Parcours : même version = pas de bandeau ; une version nouvelle en ligne = le bandeau « Nouvelle version du Fournil » ; le toucher sauve
// la partie et recharge ; version.json absent ou réseau coupé = rien ; le service worker ne garde jamais version.json.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-version.cjs   (captures dans test/shots/version/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_VERSION || 9687, BASE = `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const VRAIE = JSON.parse(fs.readFileSync(path.join(root, 'fournil', 'version.json'), 'utf8')).v;
let enLigne = VRAIE, demandes = 0; // ce que le serveur annonce ; null = pas de fichier (404)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/fournil/version.json') {
    demandes++;
    if (enLigne === null) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=600' }); res.end(JSON.stringify({ v: enLigne })); return; // max-age : comme GitHub Pages, le jeu doit passer outre
  }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'version'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };

(async () => {
  const page0 = fs.readFileSync(path.join(root, 'fournil', 'index.html'), 'utf8');
  check(/^[0-9a-f]{12}$/.test(VRAIE), `version.json : ${VRAIE}`);
  check(page0.includes(`window.FOURNIL_VERSION = '${VRAIE}'`), 'la page connaît la même version');
  check(!fs.readFileSync(path.join(root, 'dist', 'artifact.html'), 'utf8').includes('window.FOURNIL_VERSION = '), "l'artefact n'a pas de version (aucune vérification)");

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('**/*supabase.co/**', (r) => r.abort()); // pas de classement ici
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', (e) => erreurs.push(String(e)));
  await page.goto(BASE + '/fournil/');
  await page.waitForFunction(() => document.querySelector('#hud') && navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => {});
  if (!(await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)))) { await page.reload(); await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {}); }
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'le service worker tient la page');
  const retour = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // un retour dans le jeu : vérification 4 s après

  // 1. même version : rien
  demandes = 0; await retour(); await attendre(() => demandes > 0, 7000); await sleep(500);
  check(demandes === 1, `un retour = une lecture de version.json (${demandes})`);
  check(!(await page.$('.maj')), 'même version : pas de bandeau');

  // 2. une lecture au plus par minute
  demandes = 0; await retour(); await sleep(5000);
  check(demandes === 0, `pas de nouvelle lecture avant une minute (${demandes})`);

  // 3. une nouvelle version en ligne : le bandeau (le service worker n'a rien gardé : max-age ignoré)
  await page.evaluate(() => { const t = performance.now; performance.now = () => t.call(performance) + 120e3; }); // une minute de plus pour le jeu
  enLigne = 'abcdef123456'; demandes = 0; await retour();
  check(await attendre(() => page.$('.maj'), 7000), 'nouvelle version : le bandeau apparaît');
  check(demandes === 1, `version.json lue au réseau malgré le service worker et max-age (${demandes})`);
  const txt = await page.$eval('.maj', (b) => b.textContent);
  check(/Nouvelle version du Fournil/.test(txt) && /Touche pour mettre à jour/.test(txt), `le texte : « ${txt} »`);
  await sleep(600); // la fin de l'entrée animée
  const boite = await page.$eval('.maj', (b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, h: innerHeight, w: innerWidth }; });
  check(boite.l >= 0 && boite.r <= boite.w && boite.b <= boite.h, `le bandeau tient dans l'écran ${JSON.stringify(boite)}`);
  await page.screenshot({ path: path.join(out, 'bandeau.png') });
  demandes = 0; await page.evaluate(() => { const t = performance.now; performance.now = () => t.call(performance) + 120e3; }); await retour(); await sleep(5000);
  check(demandes === 0 && (await page.$$('.maj')).length === 1, 'bandeau affiché : plus de lecture, un seul bandeau');

  // 4. le toucher : la partie sauvée, la page rechargée
  await page.evaluate(() => { localStorage.removeItem('fournil.v2'); window.__avant = 1; });
  enLigne = VRAIE;
  await Promise.all([page.waitForNavigation({ timeout: 10000 }).catch(() => null), page.tap('.maj')]);
  await page.waitForFunction(() => document.querySelector('#hud'), null, { timeout: 15000 }).catch(() => {});
  check(await page.evaluate(() => window.__avant === undefined), 'la page s\'est rechargée');
  check(await page.evaluate(() => !!localStorage.getItem('fournil.v2')), 'la partie était sauvée avant');
  check(!(await page.$('.maj')), 'après la mise à jour : pas de bandeau');

  // 5. version.json absent, puis réseau coupé : rien, sans erreur
  await page.evaluate(() => { const t = performance.now; performance.now = () => t.call(performance) + 120e3; });
  enLigne = null; demandes = 0; await retour(); await attendre(() => demandes > 0, 7000); await sleep(500);
  check(demandes === 1 && !(await page.$('.maj')), 'version.json absent : rien');
  await page.evaluate(() => { const t = performance.now; performance.now = () => t.call(performance) + 240e3; });
  await ctx.setOffline(true); enLigne = 'abcdef123456'; await retour(); await sleep(5500);
  check(!(await page.$('.maj')), 'hors ligne : rien');
  await ctx.setOffline(false);

  // 6. le cache du service worker ne contient pas version.json
  const enCache = await page.evaluate(async () => { for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) if (/version\.json/.test(r.url)) return r.url; } return ''; });
  check(!enCache, `version.json jamais en cache ${enCache}`);
  check(!erreurs.length, `aucune erreur dans la page ${erreurs.join(' | ')}`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
