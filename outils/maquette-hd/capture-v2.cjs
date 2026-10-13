// Captures de la maquette HD : node capture-hd.cjs <sortie> <port> [hd=1|0] ; TIROIR=mi|ferme, HEURE=13, VIDEO=1 (30 images pour une vidéo)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/home/user/gamemobil-hd', HDW = path.join(__dirname, 'www');
const [out, port, hd] = [process.argv[2], +(process.argv[3] || 8821), process.argv[4] !== '0'];
const T = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.png': 'image/png', '.json': 'application/json', '.bin': 'application/octet-stream', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = p.startsWith('/hd/') ? path.join(HDW, p.slice(4)) : path.join(ROOT, p);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(port);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await context.addInitScript((r) => { if (!r.planque) window.__sansQuartier = true; window.__hdReglages = r; let s = 12345; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }, Object.assign(JSON.parse(process.env.REGLAGES || '{}'), { planque: process.env.MODE === 'planque' }));
  const page = await context.newPage(); const erreurs = []; page.on('pageerror', (e) => erreurs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto(`http://localhost:${port}/fournil/?qualite=haute${hd ? '&hd=1' : ''}`); await sleep(1500);
  await page.evaluate((h) => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; for (let k = 0; k < 6; k++) if (st.stations[k]) st.stations[k].niv = Math.max(st.stations[k].niv, 25); f.scene({ heure: h, assis: true }); }, +(process.env.HEURE || 13));
  await page.evaluate((t) => window.__fournil.tiroir(t), process.env.TIROIR || 'mi');
  if (hd) await page.waitForFunction(() => typeof HDM !== 'undefined' && (HDM.pret || HDM.erreur), null, { timeout: 120000 });
  if (process.env.MODE === 'planque') {
    await sleep(1500); await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
    await page.evaluate(() => window.__fournil.quartier()); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#pq-corps [data-pq="oui"]'); if (b) b.click(); }); await sleep(500);
    await page.evaluate(() => { const qq = window.__fournil.st.quartier; qq.billets = 5e6; window.__fournil.save(); }); // assez pour tout débloquer
    for (let k = 0; k < 40; k++) { await page.evaluate(() => { for (const b of document.querySelectorAll('#pq-cartes button')) if (!b.disabled) b.click(); }); await sleep(150); }
  }
  await sleep(+(process.env.ATTENTE || 9000));
  const nom = `${process.env.MODE || 'boutique'}-${hd ? 'hd' : 'actuel'}-${process.env.TIROIR || 'mi'}-${process.env.HEURE || 13}h`;
  if (process.env.VIDEO) { fs.mkdirSync(`${out}/${nom}-images`, { recursive: true }); for (let k = 0; k < +process.env.VIDEO; k++) { await page.screenshot({ path: `${out}/${nom}-images/${String(k).padStart(3, '0')}.png`, clip: { x: 0, y: 0, width: 390, height: 520 } }); await sleep(120); } }
  await page.screenshot({ path: `${out}/${nom}.png` });
  const st = await page.evaluate(() => Object.assign({ hd: typeof HDM !== 'undefined' ? { pret: HDM.pret, err: HDM.erreur } : null }, window.__fournil.stats()));
  console.log(nom, JSON.stringify(st), erreurs.slice(0, 5));
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
