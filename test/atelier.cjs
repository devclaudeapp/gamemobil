// L'atelier 3D : rend des meubles, des personnages ou la salle à chaque cran et les photographie dans test/shots/atelier/.
// Usage : NODE_PATH=/opt/node22/lib/node_modules node test/atelier.cjs [fichier-de-specs.json]   (sans argument : la liste SPECS ci-dessous)
// Une spec : { nom, faire: 'MEUBLES.four', args: [3, '$ctx'], q: 'paris', position?: [x,y,z], ctx?: {…}, t?: secondes, zone?: true, sansSol?: true }
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); }); }).listen(+process.env.ATELIER_PORT || 8786);
const out = path.join(__dirname, 'shots', 'atelier'); fs.mkdirSync(out, { recursive: true });
const SPECS = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : [
  { nom: 'salle-village', faire: 'MEUBLES.salle', args: ['$ctx'], q: 'village' },
  { nom: 'four-0', faire: 'MEUBLES.four', args: [0, '$ctx'] }, { nom: 'four-4', faire: 'MEUBLES.four', args: [4, '$ctx'] },
  { nom: 'client', faire: 'PERSOS.creer', args: [{ haut: '#FF9FB2', peau: '#FFD7B5', cheveux: '#4A3328', coiffure: 1 }], position: [195, 0, 350] },
];
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 714 }, deviceScaleFactor: 2 })).newPage();
  const erreurs = []; page.on('pageerror', (e) => { erreurs.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|404|ERR_CERT/.test(m.text())) { erreurs.push(m.text()); console.log('CONSOLE', m.text()); } });
  await page.goto(`http://localhost:${+process.env.ATELIER_PORT || 8786}/test/atelier.html`); await page.waitForTimeout(600);
  for (const spec of SPECS) {
    try {
      const r = await page.evaluate((s) => { const r = window.atelier.montrer(s); if (s.zone) r.rect = window.atelier.rect(window.atelier.groupe.children[window.atelier.groupe.children.length - 1]); return r; }, spec);
      await page.waitForTimeout(80);
      await page.locator('#wrap').screenshot({ path: `${out}/${spec.nom}.png` });
      console.log(spec.nom, 'boîte', r.min.map((v) => Math.round(v)), r.max.map((v) => Math.round(v)), 'calls', r.calls, r.rect ? 'rect ' + JSON.stringify(Object.fromEntries(Object.entries(r.rect).map(([k, v]) => [k, Math.round(v)]))) : '');
    } catch (e) { console.log(spec.nom, 'ERREUR', e.message.split('\n')[0]); erreurs.push(e.message); }
  }
  await browser.close(); server.close();
  console.log(erreurs.length ? `ERREURS ${erreurs.length}` : 'ERREURS aucune');
})();
