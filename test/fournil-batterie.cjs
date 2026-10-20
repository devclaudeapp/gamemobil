// La batterie : la boucle du jeu (src/ui.js) ne redessine plus la boutique à chaque rafraîchissement de l'écran (60, 120 Hz) : 30 images/s
// au plus en jouant, 10 après 15 s sans toucher, 30 de nouveau au premier toucher (ou au premier message du jeu). Sur la vraie page, téléphone
// en portrait : la cadence à l'ouverture, au repos, après un toucher ; pleine cadence quand on tire le tiroir ; un mini-jeu de l'Atelier
// (sa propre boucle) à pleine cadence ; la qualité de la scène ne prend pas la limite pour de la lenteur ; le détecteur de gel ne voit pas de
// gel à 10 images/s ; les gains d'une minute de jeu identiques (±1 %) à ceux d'une page sans limite (?cadence=0) ; aucune erreur.
// Le dessin WebGL est neutralisé (drawArrays / drawElements sans effet) : SwiftShader, sur une machine chargée, ne tient pas toujours 30 images/s,
// et c'est la boucle qu'on mesure ici, pas le processeur graphique. Une sonde compte les rafraîchissements que la page reçoit vraiment
// (requestAnimationFrame) : si la machine n'en donne pas 55 par seconde, les fourchettes de cadence ne sont pas exigées (on le dit).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-batterie.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_BATTERIE || 9701;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ouverts = [];
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sonde = 0; const sonde = () => { window.__sonde++; requestAnimationFrame(sonde); }; requestAnimationFrame(sonde); for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) C.prototype[m] = function () {}; });
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st && SCENE.webgl, null, { timeout: 30000 });
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.st.tuto = 99; });
    const cdp = await ctx.newCDPSession(page), o = { ctx, page, erreurs, cdp }; ouverts.push(o); return o;
  }
  const cadence = (p) => p.evaluate(() => window.__fournil.cadence());
  // les rendus de la scène, les images traitées par la boucle et les rafraîchissements reçus (la sonde), par seconde, sur ms
  async function mesurer(p, ms) {
    const lire = () => p.evaluate(() => [SCENE.stats.rendus, performance.now(), window.__sonde]);
    const a = await lire(); const vues = []; for (let t = 0; t < ms; t += 500) { await sleep(500); vues.push((await cadence(p)).mesuree); } const b = await lire();
    return { rendus: (b[0] - a[0]) / (b[1] - a[1]) * 1000, images: vues.reduce((s, v) => s + v, 0) / vues.length, raf: (b[2] - a[2]) / (b[1] - a[1]) * 1000 };
  }
  const fmt = (m) => `${m.rendus.toFixed(1)} rendus/s, ${m.images.toFixed(1)} images/s traitées, ${m.raf.toFixed(1)} rafraîchissements/s reçus`;
  const charge = (m, mini) => (m.raf < mini ? ` — machine chargée (${m.raf.toFixed(1)} rafraîchissements/s) : fourchette non exigée` : '');
  const toucher = async (cdp, x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const centre = (p, sel) => p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

  console.log('── sans limite (?cadence=0) : la boucle suit l\'écran ──');
  let { page, erreurs, cdp, ctx } = await ouvrir('?cadence=0');
  await sleep(1500);
  const avant = await mesurer(page, 3000), cAvant = await cadence(page);
  check(cAvant.limite === false && cAvant.cible === 0 && avant.images >= avant.raf * 0.85, `toutes les images de l'écran sont traitées (${fmt(avant)})`);
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── avec la limite : 30 images/s en jouant ──');
  ({ page, erreurs, cdp, ctx } = await ouvrir('?hd=0')); // (sans les décors HD : leur chargement ferait des à-coups pendant la mesure)
  const retour0 = await page.evaluate(() => window.__fournil.retour.dernier);
  await sleep(1500); // les premières images (les modèles, les matériaux) passées
  const jeu = await mesurer(page, 3000), cJeu = await cadence(page);
  check(cJeu.limite && cJeu.cible === 30 && !cJeu.repos, `à l'ouverture, la cible est 30 images/s (${JSON.stringify(cJeu)})`);
  check(jeu.rendus <= 32 && (jeu.raf < 55 || jeu.rendus >= 25), `la scène est rendue ~30 fois par seconde sur 3 s (${fmt(jeu)})${charge(jeu, 55)}`);

  console.log('── au repos : 10 images/s après 15 s sans toucher ──');
  check(await attendre(async () => (await cadence(page)).repos, 25000), 'après 15 s sans toucher, la boucle passe au repos');
  await sleep(1000);
  const repos = await mesurer(page, 3000), cRepos = await cadence(page);
  check(cRepos.cible === 10 && cRepos.repos, `la cible est 10 images/s (${JSON.stringify(cRepos)})`);
  check(repos.rendus <= 11 && (repos.raf < 15 || repos.rendus >= 8), `la scène est rendue ~10 fois par seconde sur 3 s (${fmt(repos)})${charge(repos, 15)}`);
  check(await page.evaluate((r) => window.__fournil.retour.dernier === r && !window.__fournil.retour.enCours, retour0), `le détecteur de gel ne voit pas de gel à 10 images/s (dernier retour : ${await page.evaluate(() => window.__fournil.retour.dernier)})`);

  console.log('── un toucher : 30 de nouveau, tout de suite ──');
  const [cx, cy] = await centre(page, '#coins');
  await toucher(cdp, cx, cy);
  const cTouche = await cadence(page);
  check(cTouche.cible === 30 && !cTouche.repos, `au premier toucher, la cible revient à 30 (${JSON.stringify(cTouche)})`);
  const apres = await mesurer(page, 2000);
  check(apres.rendus <= 32 && (apres.raf < 55 || apres.rendus >= 25), `et la scène est de nouveau rendue ~30 fois par seconde (${fmt(apres)})${charge(apres, 55)}`);

  console.log('── la poignée du tiroir tirée au doigt : pleine cadence ──');
  const [px, py] = await centre(page, '#poignee');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py, id: 1 }] });
  for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: py + k * 8, id: 1 }] }); await sleep(30); }
  const tire = await mesurer(page, 1000), cTire = await cadence(page);
  check(cTire.cible === 0 && tire.images >= tire.raf * 0.85 && (tire.raf < 40 || tire.images > 40), `doigt posé sur la poignée : aucune limite, chaque rafraîchissement est traité (${fmt(tire)})`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300);
  check((await cadence(page)).cible === 30, 'lâchée : 30 images/s de nouveau');

  console.log('── l\'Atelier : le mini-jeu a sa propre boucle, à pleine cadence ──');
  await page.evaluate(() => { window.__fournil.ouvrirAtelier('four'); });
  await sleep(300);
  await page.evaluate(() => document.querySelector('[data-at="jouer"]').click());
  check(await attendre(() => page.evaluate(() => { const a = window.__fournil.atelier(); return a.ecran === 'jeu' && a.vues > 5; }), 5000), 'l\'enfournement en rythme est lancé');
  // pleine cadence : le mini-jeu dessine à chaque rafraîchissement que la page reçoit (compté à côté par une sonde requestAnimationFrame)
  const atelierSur = (ms) => page.evaluate((ms) => new Promise((r) => { const a0 = window.__fournil.atelier().vues, t0 = performance.now(); let raf = 0; const f = () => { raf++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r({ vues: (window.__fournil.atelier().vues - a0) / (performance.now() - t0) * 1000, raf: raf / (performance.now() - t0) * 1000 }); }; requestAnimationFrame(f); }), ms);
  const at = await atelierSur(2000), cAt = await cadence(page);
  check(at.vues >= at.raf * 0.9 && (at.raf < 40 || at.vues > 40), `le mini-jeu est dessiné ${at.vues.toFixed(1)} fois par seconde, à chaque rafraîchissement de la page (${at.raf.toFixed(1)}/s) ; la boucle de la boutique, elle, vise ${cAt.cible}`);
  await page.evaluate(() => window.__fournil.fermerAtelier()); await sleep(500);
  check(!(await page.evaluate(() => window.__fournil.atelier().ouvert)), 'l\'Atelier refermé');

  console.log('── la qualité : la limite n\'est pas de la lenteur ──');
  // la qualité automatique (SwiftShader la fige en éco : on la libère, au palier moyen) ; l'ancienne mesure (l'intervalle entre deux images
  // traitées : 33 ms à 30 images/s, 100 ms au repos, au-dessus des 28 ms) l'aurait descendue dès la première fenêtre de 60 images
  await page.evaluate(() => SCENE.qualite('moyenne')); await sleep(4000); // les matériaux riches compilés d'abord (le palier change : un à-coup normal)
  await toucher(cdp, cx, cy); // en jeu (30 images/s)
  await page.evaluate(() => { const q = SCENE._qual; q.fixe = false; q.mesures = 0; q.somme = 0; q.verif = null; q.moy = 0; q.echecs = {}; q.calme = 0; });
  // la fenêtre mesurée suit l'intervalle réel des rafraîchissements (la sonde), pas celui de la cadence ; si la machine suit (moins de 20 ms
  // entre deux rafraîchissements), le palier ne bouge pas ; sinon, la lenteur est vraie et le palier peut descendre (comme sans limite)
  const suivre = async (ms) => { const vus = new Set(), a = await page.evaluate(() => [window.__sonde, performance.now()]); for (let t = 0; t < ms; t += 250) { vus.add(await page.evaluate(() => SCENE.stats.qualite)); await sleep(250); } const b = await page.evaluate(() => [window.__sonde, performance.now(), SCENE.stats.ms, SCENE._qual.fixe]); return { vus: [...vus], brut: (b[1] - a[1]) / Math.max(1, b[0] - a[0]), ms: b[2], fixe: b[3] }; };
  const qualiteOk = (s) => s.ms > 0 && (s.brut >= 20 || (s.ms < 28 && s.vus.join() === 'moyenne' && !s.fixe));
  const txtQ = (s) => `fenêtre mesurée : ${s.ms.toFixed(1)} ms par image, rafraîchissements réels : ${s.brut.toFixed(1)} ms ; vue : ${s.vus.join(', ')}${s.brut >= 20 ? ' — machine chargée : palier non exigé' : ''}`;
  const s30 = await suivre(5000), c30 = await cadence(page);
  check(c30.cible === 30 && qualiteOk(s30), `à 30 images/s (une image toutes les 33 ms), la qualité reste moyenne (${txtQ(s30)})`);
  check(await attendre(async () => (await cadence(page)).repos, 25000), 'puis au repos');
  await page.evaluate(() => { const q = SCENE._qual; q.mesures = 0; q.somme = 0; q.moy = 0; });
  const s10 = await suivre(7500), c10 = await cadence(page);
  check(c10.cible === 10 && qualiteOk(s10), `à 10 images/s (une image toutes les 100 ms), la qualité reste moyenne (${txtQ(s10)})`);
  await page.keyboard.press('Shift');
  check((await cadence(page)).cible === 30, 'une touche du clavier : 30 images/s de nouveau');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── les gains d\'une minute : avec la limite (30 puis 10 images/s) et sans (?cadence=0), côte à côte ──');
  const A = await ouvrir(''), B = await ouvrir('?cadence=0');
  // une boulangerie qui tourne seule : quatre produits, quatre apprentis ; ni événement, ni client mystère, ni chat (du hasard), le même
  // pain du jour ; le tiroir ouvert en grand, la scène cachée (SwiftShader chargé espacerait les images au-delà du plafond de 0,25 s par
  // image, et la page de derrière en reçoit moins que celle de devant : du temps perdu des deux côtés, pas pareil)
  const preparer = (p) => p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e9); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); st.evTimer = 1e9; st.mystereTimer = 1e9; st.chatAttente = 1e9; if (st.jour) st.jour.pain = 0; f.save(); f.tiroir('ouvert'); });
  // la caisse, plus la part déjà cuite des fournées en cours (la valeur exacte, sans l'arrondi d'une fournée)
  const valeur = (p) => p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; let v = st.coins; st.stations.forEach((s, i) => { if (s.niv > 0 && s.actif && s.staff) v += s.prog / G.temps(st, i) * G.revenuFournee(st, i); }); return { v, t: performance.now(), taux: G.tauxParSeconde(st), n: [...st.stations.map((s) => s.staff ? 1 : 0)].join('') }; });
  await Promise.all([preparer(A.page), preparer(B.page)]); await sleep(1500);
  const [a0, b0] = await Promise.all([valeur(A.page), valeur(B.page)]);
  const imagesA = [], imagesB = [];
  for (let t = 0; t < 60000; t += 2000) { await sleep(2000); const [ca, cb] = await Promise.all([cadence(A.page), cadence(B.page)]); imagesA.push(ca.mesuree); imagesB.push(cb.mesuree); }
  const [a1, b1] = await Promise.all([valeur(A.page), valeur(B.page)]);
  const ga = (a1.v - a0.v) / (a1.t - a0.t) * 1000, gb = (b1.v - b0.v) / (b1.t - b0.t) * 1000, ecart = Math.abs(ga / gb - 1);
  const moy = (l) => (l.reduce((s, v) => s + v, 0) / l.length).toFixed(1);
  console.log(`  avec la limite : ${moy(imagesA.slice(0, 7))} images/s les 15 premières secondes, ${moy(imagesA.slice(9))} ensuite ; sans : ${moy(imagesB)}`);
  check(a0.n.startsWith('1111') && a0.n === b0.n && a0.taux > 0 && Math.abs(a0.taux / b0.taux - 1) < 1e-6, `les deux boulangeries sont identiques (${a0.taux.toFixed(3)} et ${b0.taux.toFixed(3)} €/s annoncés, apprentis ${a0.n} et ${b0.n})`);
  check(ecart < 0.01, `les gains par seconde sur une minute : ${ga.toFixed(2)} €/s avec la limite, ${gb.toFixed(2)} €/s sans (écart ${(ecart * 100).toFixed(3)} %, < 1 %)`);
  // la même minute simulée image par image (G.tick sur une copie de la boulangerie, sans hasard) : 10, 30, 60 images/s, et 30 avec la gigue
  // de l'écran (des images de 16,7, 33,3 et 50 ms) ; la machine de test, elle, ne tient pas forcément 30 images/s avec quatre apprentis
  const simu = await A.page.evaluate(() => {
    const f = window.__fournil, G = f.G, base = JSON.stringify(f.st), res = {};
    const val = (st) => { let v = st.coins; st.stations.forEach((s, i) => { if (s.niv > 0 && s.actif && s.staff) v += s.prog / G.temps(st, i) * G.revenuFournee(st, i); }); return v; };
    for (const [nom, pas] of [['10 images/s', [100]], ['30 images/s', [1000 / 30]], ['60 images/s', [1000 / 60]], ['30 images/s avec gigue', [1000 / 60, 1000 / 30, 50, 1000 / 30]]]) {
      const st = JSON.parse(base); let t = st.now, ms = 0, k = 0; const v0 = val(st);
      while (ms < 60e3) { const d = Math.min(pas[k++ % pas.length], 60e3 - ms); ms += d; t += d; G.tick(st, d / 1000, t, () => 0.999); }
      res[nom] = val(st) - v0;
    }
    return res;
  });
  const ref = simu['60 images/s'], pire = Math.max(...Object.values(simu).map((v) => Math.abs(v / ref - 1)));
  check(ref > 0 && pire < 0.01, `une minute simulée : ${Object.entries(simu).map(([k, v]) => `${k} → ${Math.round(v)} €`).join(', ')} (écart ${(pire * 100).toFixed(4)} %)`);
  await A.page.evaluate(() => window.__fournil.xp(1e9)); // un niveau gagné : un message du jeu
  check(await attendre(async () => (await cadence(A.page)).cible === 30, 2000), 'une action du jeu (un niveau gagné, son message) ramène aussi les 30 images/s');
  check(A.erreurs.length === 0 && B.erreurs.length === 0, `aucune erreur dans les pages (${A.erreurs.concat(B.erreurs).slice(0, 3).join(' | ')})`);

  for (const o of ouverts) await o.ctx.close().catch(() => {});
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (batterie).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
