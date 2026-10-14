// Les gestes des chibis (src/persos.js) sur la vraie page : la joie d'un client servi, l'impatience dans la file, la bouchée à table, le salut
// à la porte, le pétrissage des apprentis, les gestes du patron ; la tête tourne sur son cou. Puis la boutique tourne sans erreur.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-persos.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_PERSOS || 8871;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__sansQuartier = true; });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const g = PERSOS.creer({ haut: '#5FD3A4', sac: true }), P = g.userData.parts, base = { marche: false, assis: false, phase: 0, t: 1, blink: 0, expression: 'neutre' };
    const pose = (o) => { PERSOS.animer(g, Object.assign({}, base, o)); return { hy: P.haut.position.y, bgx: P.bras[0].rotation.x, bgz: P.bras[0].rotation.z, bdx: P.bras[1].rotation.x, bdz: P.bras[1].rotation.z, jdx: P.jambes[1].rotation.x, cy: P.cou.rotation.y, cx: P.cou.rotation.x }; };
    const plage = (o, champ) => { let mn = Infinity, mx = -Infinity; for (let t = 0; t < 6; t += 0.05) { const v = pose(Object.assign({}, o, { t }))[champ]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return [mn, mx]; };
    const out = { cou: !!P.cou && P.tete.parent === P.cou && P.visage.parent === P.cou };
    out.repos = pose({}); out.joie = pose({ joie: 0.5 }); out.impatient = pose({ attente: 8 }); out.salut = pose({ geste: 'salut', marche: true, phase: 1 });
    out.tape = plage({ attente: 8 }, 'jdx'); out.mange = plage({ assis: true, geste: 'mange' }, 'bdx'); out.petrit = plage({ geste: 'petrit' }, 'bgx');
    let regard = 0; for (let t = 0; t < 30; t += 0.1) regard = Math.max(regard, Math.abs(pose({ t, graine: 1.3 }).cy)); out.regard = regard;
    { let mn = Infinity, mx = -Infinity; for (let ph = 0; ph < 7; ph += 0.1) { const y = pose({ marche: true, phase: ph }).hy; mn = Math.min(mn, y); mx = Math.max(mx, y); } out.marche = [mn, mx]; }
    const b = PERSOS.boulanger(0), Pb = b.userData.parts; let front = 0; for (let t = 0; t < 12; t += 0.05) { PERSOS.animerBoulanger(b, { t, hop: 0, blink: 0 }); front = Math.min(front, Pb.bras[1].rotation.x); } out.front = front;
    PERSOS.animerBoulanger(b, { t: 3, hop: 1, blink: 0 }); out.hop = { y: Pb.racine.position.y, bz: Pb.bras[1].rotation.z };
    return out;
  });
  check(r.cou, 'la tête et le visage tournent ensemble sur le cou');
  check(r.joie.hy > r.repos.hy + 2 && r.joie.bgz < -1.5 && r.joie.bdz > 1.5, `servi : un petit saut bras levés (haut +${(r.joie.hy - r.repos.hy).toFixed(1)}, bras ${r.joie.bdz.toFixed(2)} rad)`);
  check(r.impatient.bgx < -1 && r.impatient.bgz > 0.5 && r.impatient.bdz < -0.5 && r.tape[0] < -0.2 && r.tape[1] > -0.01, `plus de 6 s dans la file : bras croisés, le pied tape (${r.tape.map((x) => x.toFixed(2)).join(' → ')})`);
  check(r.mange[0] < -2 && r.mange[1] > -0.6, `à table : la main monte à la bouche (${r.mange.map((x) => x.toFixed(2)).join(' → ')})`);
  check(r.salut.bdz > 2, 'à la porte : la main salue');
  check(r.petrit[1] - r.petrit[0] > 0.5 && r.petrit[1] < -0.6, `au four : l'apprenti pétrit (${r.petrit.map((x) => x.toFixed(2)).join(' → ')})`);
  check(r.regard > 0.2, `debout : le regard balaie la salle (${r.regard.toFixed(2)} rad)`);
  check(r.marche[1] - r.marche[0] > 2, 'en marche : le rebond du pas');
  check(r.front < -1.5, `le patron s'essuie le front de temps en temps (${r.front.toFixed(2)})`);
  check(r.hop.y > 4 && r.hop.bz > 2, 'le patron saute de joie, bras levés');
  // la boutique tourne : des clients, des apprentis, aucune erreur
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e9); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); st.tuto = 99; f.save(); });
  await sleep(6000);
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (persos).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
