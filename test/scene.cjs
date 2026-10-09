// Captures de la boutique en 3D : cinq quartiers, quatre heures, cinq saisons, tiroir fermé / à mi / ouvert, mode Aménager, bannière, petits écrans.
// La qualité est forcée au palier haut (?qualite=haute) pour que les captures aient les ombres ; les deux canvas (#scene et #scene-ui) sont photographiés ensemble via #scene-wrap.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200); res.end(d); }); }).listen(8784);
const out = path.join(__dirname, 'shots', 'scene'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAISONS = { aucune: [], noel: ['neige', 'noel'], paques: ['paques'], ete: ['ete', 'fete'], automne: ['halloween', 'feuilles'] };
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://localhost:8784/fournil/?qualite=haute'); await sleep(900);
  // une boutique bien installée : tout le mobilier, quatre recettes, trois apprentis
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; f.scene({ assis: true }); });
  await page.evaluate(() => window.__fournil.tiroir('ferme')); await sleep(2500);
  const coh = await page.evaluate(() => { const f = window.__fournil, z = f.SCENE.zones(), r = document.querySelector('#scene').getBoundingClientRect(), T = f.SCENE.hautBloc(r.width, r.height); return { ok: f.SCENE.webgl && z.mystere.y + z.mystere.h <= T + 1 && Object.values(z).every((q) => q.y + q.h <= r.height + 1), T: Math.round(T), stats: f.stats() }; });
  console.log(coh.ok ? 'ok   ' : 'FAIL ', 'la 3D tourne et les zones tiennent dans le bloc haut / le canvas', JSON.stringify(coh));
  const quartiers = ['village', 'paris', 'mer', 'montagne', 'ville'];
  for (let q = 0; q < 5; q++) {
    await page.evaluate((q) => { window.__fournil.st.boutiques = q + 1; }, q);
    for (const h of [7, 13, 19, 23]) for (const [nom, tags] of Object.entries(SAISONS)) {
      if ((h !== 13 && nom !== 'aucune') || (nom !== 'aucune' && q > 0 && nom !== 'noel')) continue; // une sélection : toutes les heures en saison neutre, les saisons à midi
      await page.evaluate(([h, tags]) => window.__fournil.scene({ heure: h, saison: tags, assis: true }), [h, tags]); await sleep(1300);
      await page.locator('#scene-wrap').screenshot({ path: `${out}/${quartiers[q]}-h${h}-${nom}.png` });
    }
  }
  await page.evaluate(() => { window.__fournil.st.boutiques = 1; window.__fournil.scene({ heure: 13, assis: true }); });
  // les crans de départ : la boutique neuve
  await page.evaluate(() => { const st = window.__fournil.st; st.mobilier = {}; }); await sleep(800); await page.locator('#scene-wrap').screenshot({ path: `${out}/village-neuf.png` });
  await page.evaluate(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) while (f.G.mobilierCran(f.st, m.id) < m.max) f.meuble(m.id); });
  // le lot 1 : apprentis au grade 5, le chat endormi puis assis, les six recettes de saison sur le comptoir
  await page.evaluate(() => { const f = window.__fournil; f.G.adopterChat(f.st, 'Brioche'); f.scene({ heure: 13, assis: true, grades: 5, chat: 'dort' }); }); await sleep(1300); await page.locator('#scene-wrap').screenshot({ path: `${out}/grades-chat-dort.png` });
  await page.evaluate(() => window.__fournil.scene({ heure: 13, assis: true, grades: 5, chat: 'assis' })); await sleep(1300); await page.locator('#scene-wrap').screenshot({ path: `${out}/chat-assis.png` });
  for (const id of ['citrouille', 'buche', 'galette', 'crepe', 'paques', 'glace']) {
    await page.evaluate((id) => { const f = window.__fournil; f.saison(id); f.st.saison.niv = Math.max(1, f.st.saison.niv); f.scene({ heure: 13, assis: true }); }, id); await sleep(1100);
    const r = await page.evaluate(() => { const b = document.querySelector('#scene-wrap').getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: Math.min(300, b.height) }; });
    await page.screenshot({ path: `${out}/saison-${id}.png`, clip: r });
  }
  await page.evaluate(() => { window.__fournil.G.forcerRecette(null); window.__fournil.scene({ heure: 13, assis: true }); });
  // le mode Aménager, le coup de feu et sa bannière (tiroir fermé puis à mi), le tiroir à mi et ouvert
  await page.evaluate(() => window.__fournil.amenager(true)); await sleep(400); await page.locator('#scene-wrap').screenshot({ path: `${out}/amenager.png` }); await page.evaluate(() => window.__fournil.amenager(false));
  await page.evaluate(() => window.__fournil.rush()); await sleep(1500); await page.screenshot({ path: `${out}/rush-ferme.png` });
  await page.evaluate(() => window.__fournil.tiroir('mi')); await sleep(600); await page.screenshot({ path: `${out}/rush-mi.png` });
  await page.evaluate(() => { window.__fournil.st.ev.fin = Date.now() - 1; }); await sleep(600); await page.screenshot({ path: `${out}/mi.png` });
  await page.evaluate(() => window.__fournil.tiroir('ouvert')); await sleep(600); await page.screenshot({ path: `${out}/ouvert.png` });
  // petits écrans : 360×640 (tiroir fermé puis à mi) et 360×555 (fermé)
  for (const [w, h] of [[360, 640], [360, 555]]) {
    const p2 = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
    await p2.goto('http://localhost:8784/fournil/?qualite=haute'); await sleep(900);
    await p2.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 3; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; f.scene({ heure: 13, assis: true }); f.tiroir('ferme'); });
    await sleep(2500); await p2.screenshot({ path: `${out}/petit-${w}x${h}-ferme.png` });
    if (h === 640) { await p2.evaluate(() => window.__fournil.tiroir('mi')); await sleep(600); await p2.screenshot({ path: `${out}/petit-${w}x${h}-mi.png` }); }
  }
  const stats = await page.evaluate(() => window.__fournil.stats()); console.log('3D', JSON.stringify(stats));
  console.log('captures dans', out);
  await browser.close(); server.close();
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
