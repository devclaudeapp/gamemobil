// Dernier Rempart : les vignettes des arènes (zombies/vignettes/<arène>.webp, 360 × 200), photographiées dans le jeu lui-même.
// Pour chaque arène : la partie de démonstration de l'écran titre en plan rapproché (le survivant, sa tourelle, les premiers zombies), l'interface masquée,
// une capture du milieu de l'écran, réduite et encodée en WebP par le navigateur. À relancer quand une arène change d'allure.
// node build.js && NODE_PATH=/opt/node22/lib/node_modules node outils/zombies/faire-vignettes.cjs   (ARENES=jardin,port : seulement celles-là)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..'), dossier = path.join(root, 'zombies', 'vignettes');
fs.mkdirSync(dossier, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const PORT = +process.env.PORT_VIGNETTES || 8899;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vm = require('vm'), ctx = {}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'src-zombies', 'donnees.js'), 'utf8') + ';this.D = ZDONNEES;', ctx);
const ARENES = process.env.ARENES ? process.env.ARENES.split(',') : ctx.D.ORDRE_ARENES;
const L = 360, H = 200;

(async () => {
  const browser = await chromium.launch();
  for (const id of ARENES) {
    const context = await browser.newContext({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1, locale: 'fr-FR', serviceWorkers: 'block' });
    await context.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
    // une sauvegarde où toutes les arènes sont ouvertes, celle-ci choisie, le son coupé
    const records = {}; for (const a of ctx.D.ORDRE_ARENES) records[a] = { vague: 99, score: 1, tues: 1, parties: 1 };
    await context.addInitScript((s) => { try { localStorage.setItem('zombies.v1', JSON.stringify(s)); } catch (e) { /* rien */ } }, { v: 1, records, total: { parties: 1, tues: 1, temps: 1 }, derniere: 0, arene: id, reglages: { son: false, vibre: false, eco: false } });
    const page = await context.newPage();
    await page.goto(`http://localhost:${PORT}/zombies/`);
    await page.waitForFunction(() => window.__zombies && window.__zombies.stats().rendu.modeles === 'pret' && window.__zombies.stats().rendu.armes === 'pret', null, { timeout: 60000 });
    await page.evaluate(() => { document.querySelector('#ecran-titre').style.visibility = 'hidden'; window.__zombies.rendu.vitrine(true, 0.5, 0.56, 1.05); });
    await sleep(7000); // (le plan rapproché sur le survivant ; les premiers zombies arrivent, la tourelle tire)
    const png = await page.screenshot({ clip: { x: 900 / 2 - 405, y: 500 / 2 - 225, width: 810, height: 450 } });
    const webp = await page.evaluate(async ({ b64, L, H }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = L; c.height = H; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, L, H); return c.toDataURL('image/webp', 0.78).split(',')[1];
    }, { b64: png.toString('base64'), L, H });
    const fichier = path.join(dossier, `${id}.webp`); fs.writeFileSync(fichier, Buffer.from(webp, 'base64'));
    console.log(`${id} : ${Math.round(fs.statSync(fichier).size / 1024)} Ko`);
    await context.close();
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
