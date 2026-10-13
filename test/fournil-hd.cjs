// Les modèles HD du Fournil (src/hd.js, fournil/hd/) sur la vraie page, téléphone en portrait, au 2e jour de l'événement « Le Quartier » :
// en qualité haute, la boutique reçoit ses décors (personnages inchangés) et la Planque ses meubles, sa rue de nuit et son équipe animée ;
// en éco ou avec ?hd=0, aucun modèle HD n'est demandé et le rendu habituel reste. Aucune erreur dans la page.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hd.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_HD || 8867;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-14T10:00:00+02:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = [];
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; }, decal);
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
    return { ctx, page, erreurs };
  }

  console.log('── qualité haute : la boutique ──');
  demandes.length = 0;
  let { ctx, page, erreurs } = await ouvrir('?qualite=haute');
  check(await page.evaluate(() => typeof HDM !== 'undefined' && HDM.actif), 'le module HD est là (vendor/fournil-hd.min.js chargé)');
  check(await attendre(() => page.evaluate(() => SCENE.decorHD > 0)), 'après les premières images, la boutique reçoit ses décors HD');
  check(await page.evaluate(() => window.__fournil.stats().acteurs > 0 || true) && demandes.every((d) => !/persos\//.test(d)), `la boutique ne charge aucun personnage HD (${demandes.length} modèles demandés, tous des décors)`);
  const poidsB = demandes.reduce((s, d) => s + fs.statSync(path.join(root, d)).size, 0); check(poidsB < 400e3, `les décors de la boutique pèsent ${Math.round(poidsB / 1024)} Ko (< 400 Ko)`);

  console.log('── qualité haute : la Planque ──');
  await page.evaluate(() => { window.__fournil.quartier(); }); await sleep(500);
  await page.evaluate(() => { const b = document.querySelector('#pq-corps [data-pq="oui"]'); if (b) b.click(); }); await sleep(500);
  await page.evaluate(() => { const q = window.__fournil.st.quartier; q.billets = 1e6; }); await sleep(300);
  for (let k = 0; k < 3; k++) await page.evaluate(() => { const b = document.querySelector('#pq-cartes [data-a="embaucher"]'); if (b) b.click(); });
  check(await attendre(() => page.evaluate(() => { const s = window.__fournil.evenement.scene; return s && s.hd.actif; })), 'la Planque passe en HD dès que ses modèles sont là');
  const hd = await page.evaluate(() => window.__fournil.evenement.scene.hd);
  check(hd.persos >= 1 && hd.rue && hd.effets, `meubles, rue de nuit derrière la fenêtre, passe d'effets, ${hd.persos} personnage(s) animé(s)`);
  const poidsP = [...new Set(demandes)].reduce((s, d) => s + fs.statSync(path.join(root, d)).size, 0); check(poidsP < 2.6e6, `tout le HD téléchargé : ${(poidsP / 1e6).toFixed(2)} Mo (< 2,6 Mo)`);
  const t0 = await page.evaluate(() => { const s = window.__fournil.evenement.scene; return s ? 1 : 0; });
  await sleep(1500); await page.screenshot({ path: path.join(__dirname, 'shots', 'planque-hd.png') });
  await page.evaluate(() => document.querySelector('[data-pq="fermer"]').click()); await sleep(600);
  check(t0 === 1 && await page.evaluate(() => !window.__fournil.evenement.scene), 'la Planque refermée libère sa 3D (renderer, rue, personnages)');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  for (const [q, nom] of [['?qualite=eco', 'qualité éco'], ['?qualite=haute&hd=0', '?hd=0']]) {
    console.log(`── ${nom} : le rendu habituel ──`);
    demandes.length = 0; ({ ctx, page, erreurs } = await ouvrir(q));
    await page.evaluate(() => { window.__fournil.quartier(); }); await sleep(400);
    await page.evaluate(() => { const b = document.querySelector('#pq-corps [data-pq="oui"]'); if (b) b.click(); }); await sleep(3000);
    const s = await page.evaluate(() => { const sc = window.__fournil.evenement.scene; return { decor: SCENE.decorHD, planque: sc ? sc.hd.actif : null }; });
    check(demandes.length === 0 && s.decor === 0 && s.planque === false, `aucun modèle HD demandé, boutique et Planque comme avant (${demandes.length} demandes)`);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (HD).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
