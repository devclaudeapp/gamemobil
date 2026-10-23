// La batterie : la boucle du jeu (src/ui.js) ne redessine plus la boutique à chaque rafraîchissement de l'écran (60, 120 Hz) : 30 images/s
// au plus en jouant, 10 après 15 s sans toucher, 30 de nouveau au premier toucher (ou au premier message du jeu). Sur la vraie page, téléphone
// en portrait : la cadence à l'ouverture, au repos, après un toucher ; pleine cadence quand on tire le tiroir ; un mini-jeu de l'Atelier
// (sa propre boucle) à pleine cadence ; la qualité de la scène ne prend pas la limite pour de la lenteur ; le détecteur de gel ne voit pas de
// gel à 10 images/s ; les gains d'une minute de jeu identiques (±1 %) à ceux d'une page sans limite (?cadence=0) ; aucune erreur.
// Les choix du joueur (Réglages › Le jeu) : « Images par seconde » (Économie 30/10, Fluide 60/20, Maximum sans limite) et « Qualité
// graphique » (Auto, Haute, Moyenne, Éco : un palier fixe que la mesure ne touche plus, Auto qui la rétablit) ; gardés après un
// rechargement ; une vieille sauvegarde (sans ces champs, ou avec des valeurs inconnues) revient à Auto et Économie. Pour la qualité, la
// page se fait passer pour un vrai processeur graphique (SwiftShader figerait Auto en éco) ; une « charge » (40 ms de calcul à chaque
// rafraîchissement) simule un téléphone lent, qui fait descendre Auto et pas un palier fixe. L'arrière-salle (BlackJack, roulette) n'est
// jamais bridée : en Économie et en qualité Éco, salle ouverte, la boucle traite chaque rafraîchissement (pas de repos à 10), la boutique
// cachée ne se dessine pas, la roue garde sa finesse (2 pixels par point) ; refermée, la boutique reprend 30 images/s, puis son repos.
// Les mesures « au repos » se font dans une boutique calme : un message du jeu (un événement, un client mystère, un habitué à son créneau
// du matin, du midi ou du soir, le chat à la porte) ramène les 30 images/s, comme il se doit ; ces sources tirées au hasard ou à l'heure
// sont repoussées dès l'ouverture (window.__fournil.st, comme la mesure des gains), et un journal des messages est cité dans chaque mesure.
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
  async function ouvrir(requete, gpu, finesse) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(finesse ? { deviceScaleFactor: finesse } : {}), hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    // le journal des messages du jeu (chacun ramène la cadence de jeu) : cité dans les mesures, pour savoir qui a réveillé la boucle
    await ctx.addInitScript(() => { window.__messages = []; let der = ''; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent !== der) { der = t.textContent; window.__messages.push(`${Math.round(performance.now())} ms : ${der}`); } else if (!t) der = ''; }).observe(document, { subtree: true, childList: true, characterData: true }); });
    await ctx.addInitScript(() => { window.__sonde = 0; const sonde = () => { window.__sonde++; requestAnimationFrame(sonde); }; requestAnimationFrame(sonde); for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) C.prototype[m] = function () {}; });
    if (gpu) await ctx.addInitScript((nom) => { for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) { const gp = C.prototype.getParameter; C.prototype.getParameter = function (k) { return k === 0x9246 ? nom : gp.call(this, k); }; } }, gpu); // UNMASKED_RENDERER_WEBGL
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st && SCENE.webgl, null, { timeout: 30000 });
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.st.tuto = 99; });
    await calme(page);
    const cdp = await ctx.newCDPSession(page), o = { ctx, page, erreurs, cdp }; ouverts.push(o); return o;
  }
  const cadence = (p) => p.evaluate(() => window.__fournil.cadence());
  // une boutique calme : ni événement, ni client mystère, ni chat à la porte, et les habitués du jour déjà passés (leur créneau dépend de
  // l'heure de Paris : 7 h-10 h, 12 h-14 h 30, 17 h-20 h) ; sinon leur message ramène les 30 images/s au milieu d'une mesure « au repos »
  const calme = (p) => p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st, jour = G.dayKey(st.now); st.evTimer = 1e9; st.mystereTimer = 1e9; st.chatAttente = 1e9; st.habitues = st.habitues || {}; for (const h of G.HABITUES) st.habitues[h.id] = Object.assign({ jours: 0, dernier: '' }, st.habitues[h.id], { vuLe: jour }); });
  const messages = (p, n) => p.evaluate((n) => window.__messages.slice(n), n);
  // les rendus de la scène, les images traitées par la boucle et les rafraîchissements reçus (la sonde), par seconde, sur ms
  async function mesurer(p, ms) {
    const lire = () => p.evaluate(() => [SCENE.stats.rendus, performance.now(), window.__sonde, window.__messages.length]);
    const a = await lire(); const vues = []; for (let t = 0; t < ms; t += 500) { await sleep(500); vues.push((await cadence(p)).mesuree); } const b = await lire();
    return { rendus: (b[0] - a[0]) / (b[1] - a[1]) * 1000, images: vues.reduce((s, v) => s + v, 0) / vues.length, raf: (b[2] - a[2]) / (b[1] - a[1]) * 1000, messages: await messages(p, a[3]) };
  }
  const fmt = (m) => `${m.rendus.toFixed(1)} rendus/s, ${m.images.toFixed(1)} images/s traitées, ${m.raf.toFixed(1)} rafraîchissements/s reçus${m.messages && m.messages.length ? ` ; messages du jeu pendant la mesure : ${m.messages.join(' | ')}` : ''}`;
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
  const suivre = async (ms) => { const vus = new Set(), a = await page.evaluate(() => [window.__sonde, performance.now(), window.__messages.length]); for (let t = 0; t < ms; t += 250) { vus.add(await page.evaluate(() => SCENE.stats.qualite)); await sleep(250); } const b = await page.evaluate(() => [window.__sonde, performance.now(), SCENE.stats.ms, SCENE._qual.fixe]); return { vus: [...vus], brut: (b[1] - a[1]) / Math.max(1, b[0] - a[0]), ms: b[2], fixe: b[3], messages: await messages(page, a[2]) }; };
  const qualiteOk = (s) => s.ms > 0 && (s.brut >= 20 || (s.ms < 28 && s.vus.join() === 'moyenne' && !s.fixe));
  const txtQ = (s) => `fenêtre mesurée : ${s.ms.toFixed(1)} ms par image, rafraîchissements réels : ${s.brut.toFixed(1)} ms ; vue : ${s.vus.join(', ')}${s.brut >= 20 ? ' — machine chargée : palier non exigé' : ''}${s.messages.length ? ` ; messages du jeu : ${s.messages.join(' | ')}` : ''}`;
  const s30 = await suivre(5000), c30 = await cadence(page);
  check(c30.cible === 30 && qualiteOk(s30), `à 30 images/s (une image toutes les 33 ms), la qualité reste moyenne (${txtQ(s30)})`);
  check(await attendre(async () => (await cadence(page)).repos, 25000), 'puis au repos');
  // la fenêtre à 10 images/s part des mêmes conditions que celle à 30 : palier moyen, mesure remise à zéro, « calme » compris (dix fenêtres
  // calmes de suite font remonter Auto d'un palier, c'est voulu ; comptées depuis la fenêtre à 30 images/s, elles tombaient au milieu de cette
  // mesure dès que la boucle était restée un peu plus longtemps à 30 : la qualité vue passait de moyenne à haute, sans lenteur ni limite en cause).
  // Si une vraie lenteur de la machine l'a fait changer pendant l'attente du repos (non mesurée), on la remet au palier moyen, figée le temps
  // de recompiler ses matériaux, sans toucher l'écran (la boucle reste au repos)
  const qAvant10 = await page.evaluate(() => SCENE.stats.qualite);
  if (qAvant10 !== 'moyenne') { console.log(`  (pendant l'attente du repos, la qualité est passée à « ${qAvant10} » : remise au palier moyen avant la mesure)`); await page.evaluate(() => { SCENE._qual.fixe = true; SCENE.qualite('moyenne'); }); await sleep(4000); }
  await page.evaluate(() => { const q = SCENE._qual; q.fixe = false; q.mesures = 0; q.somme = 0; q.verif = null; q.moy = 0; q.echecs = {}; q.calme = 0; });
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
  await A.ctx.close(); await B.ctx.close();

  console.log('── Réglages › Le jeu : les deux choix ──');
  ({ page, erreurs, cdp, ctx } = await ouvrir('?hd=0', 'Apple GPU'));
  await page.evaluate(() => window.__fournil.page('reglages')); await sleep(500);
  const reglages = await page.evaluate(() => {
    const q = document.querySelector('#page-reglages [data-choix="qualite"]'), im = document.querySelector('#page-reglages [data-choix="images"]'), carte = q && q.closest('.card');
    const radios = (el) => [...el.querySelectorAll('[role="radio"]')].map((b) => `${b.textContent}${b.getAttribute('aria-checked') === 'true' ? '*' : ''}`).join(' · ');
    return { groupe: carte && carte.previousElementSibling ? carte.previousElementSibling.textContent.trim() : '', memeCarte: !!im && im.closest('.card') === carte, sons: !!(carte && carte.querySelector('[data-a="son"]')), q: q ? radios(q) : '', im: im ? radios(im) : '', aide: im ? im.querySelector('small').textContent : '', titres: [q, im].map((e) => (e ? e.querySelector('b').textContent : '')).join(' / '), large: document.documentElement.scrollWidth <= 390 };
  });
  check(reglages.groupe === 'Le jeu' && reglages.memeCarte && reglages.sons, `les deux choix sont dans Réglages › Le jeu, avec les sons (${reglages.titres})`);
  check(reglages.q === 'Auto* · Haute · Moyenne · Éco' && reglages.im === 'Économie* · Fluide · Maximum', `par défaut : Auto et Économie (${reglages.q} | ${reglages.im})`);
  check(/batterie dure le plus longtemps/.test(reglages.aide) && reglages.large, `la ligne d'aide : « ${reglages.aide} » ; rien ne déborde à 390 px`);
  const choisir = (cle, v) => page.evaluate(([c, x]) => { document.querySelector(`#page-reglages [data-${c}="${x}"]`).click(); const b = document.querySelector(`#page-reglages [data-${c}="${x}"]`); return { st: window.__fournil.st[c], coche: b.getAttribute('aria-checked'), focus: document.activeElement === b, aide: b.closest('.reglage').querySelector('small').textContent }; }, [cle, v]);
  const [gx, gy] = await centre(page, '#coins');
  console.log('── Réglages › Le jeu : la qualité graphique ──');
  const qual = () => page.evaluate(() => { const q = SCENE._qual; return { palier: SCENE.palier, choix: SCENE.choixQualite, fixe: q.fixe, mesures: q.mesures, moy: q.moy || 0 }; });
  const charger = (on) => page.evaluate((on) => { window.__charge = on; if (!on) return; const f = () => { if (!window.__charge) return; const t = performance.now(); while (performance.now() - t < 40) { /* un téléphone lent */ } requestAnimationFrame(f); }; requestAnimationFrame(f); }, on);
  await sleep(3000); let q0 = await qual(); // plus de 60 images : une fenêtre mesurée
  check(q0.choix === 'auto' && (q0.moy > 0 || q0.mesures > 0), `Auto au lancement (un vrai processeur graphique) : la mesure tourne et choisit le palier (${JSON.stringify(q0)})`);
  let r = await choisir('qualite', 'eco'); await sleep(300); q0 = await qual();
  check(r.st === 'eco' && r.coche === 'true' && q0.palier === 'eco' && q0.choix === 'eco' && q0.fixe, `Éco : la scène passe au palier éco tout de suite (${JSON.stringify(q0)}) ; aide : « ${r.aide} »`);
  await page.evaluate(() => { const q = SCENE._qual; q.moy = 0; q.mesures = 0; q.somme = 0; });
  await sleep(4000); q0 = await qual(); // plus de 60 images : la mesure aurait rendu son verdict
  check(q0.palier === 'eco' && q0.fixe && q0.mesures === 0 && q0.moy === 0, `et n'en bouge plus : la mesure est arrêtée (${JSON.stringify(q0)})`);
  r = await choisir('qualite', 'haute'); await toucher(cdp, gx, gy); await charger(true);
  const vusH = new Set(); for (let t = 0; t < 6000; t += 200) { vusH.add((await qual()).palier); await sleep(200); }
  q0 = await qual();
  check(r.st === 'haute' && [...vusH].join() === 'haute' && q0.fixe, `Haute, sur un téléphone lent (40 ms par rafraîchissement, 6 s) : le palier reste haute (vus : ${[...vusH].join(', ')})`);
  await charger(false); await sleep(500);
  r = await choisir('qualite', 'auto'); q0 = await qual();
  check(r.st === 'auto' && q0.choix === 'auto' && !q0.fixe && q0.palier === 'haute' && /S’adapte à ton téléphone/.test(r.aide), `Auto : la mesure reprend, du palier en cours (${JSON.stringify(q0)}) ; aide : « ${r.aide} »`);
  await toucher(cdp, gx, gy); await charger(true);
  const vusA = new Set(); for (let t = 0; t < 12000 && vusA.size < 2; t += 200) { vusA.add((await qual()).palier); await sleep(200); }
  await charger(false);
  check(vusA.size >= 2, `et le téléphone lent la fait descendre (vus : ${[...vusA].join(', ')} ; ${JSON.stringify(await qual())})`);
  await choisir('qualite', 'eco');

  console.log('── Réglages › Le jeu : les images par seconde ──');
  await sleep(1500); // (la boucle mesurée, pas le rendu : la scène reste en éco, choisie juste avant)
  r = await choisir('images', 'fluide'); await toucher(cdp, gx, gy);
  const cFl = await cadence(page);
  check(r.st === 'fluide' && r.coche === 'true' && r.focus && cFl.cible === 60 && cFl.mode === 'fluide' && !cFl.repos, `Fluide : coché, la cible passe à 60 images/s tout de suite (${JSON.stringify(cFl)}) ; aide : « ${r.aide} »`);
  const fl = await mesurer(page, 3000);
  check(fl.images <= 63 && (fl.raf < 55 || fl.images >= 50), `en jouant, ~60 images traitées par seconde (${fmt(fl)})${charge(fl, 55)}`);
  check(await attendre(async () => (await cadence(page)).repos, 25000), 'puis au repos (15 s sans toucher)');
  await sleep(1000);
  const flR = await mesurer(page, 3000), cFlR = await cadence(page);
  check(cFlR.cible === 20 && flR.images <= 21.5 && (flR.raf < 25 || flR.images >= 16), `Fluide au repos : ~20 images/s (${fmt(flR)})${charge(flR, 25)}`);
  r = await choisir('images', 'max'); // (un clic sans toucher : la page reste « au repos » côté gestes)
  const cMax = await cadence(page), mx = await mesurer(page, 2000);
  check(r.st === 'max' && cMax.cible === 0 && !cMax.limite && !cMax.repos && mx.images >= mx.raf * 0.85 && (mx.raf < 40 || mx.images > 40), `Maximum : aucune limite, même 15 s après le dernier toucher ; chaque rafraîchissement est traité (${fmt(mx)})`);
  r = await choisir('images', 'economie'); await sleep(1200); // (la fenêtre d'une seconde des images comptées : sans celles d'avant)
  const cEco = await cadence(page), ecoR = await mesurer(page, 2000);
  check(r.st === 'economie' && cEco.cible === 10 && cEco.repos && ecoR.images <= 11 && (ecoR.raf < 15 || ecoR.images >= 8), `Économie, toujours au repos : 10 images/s (${fmt(ecoR)})${charge(ecoR, 15)}`);
  await toucher(cdp, gx, gy);
  const ecoJ = await mesurer(page, 2000), cEcoJ = await cadence(page);
  check(cEcoJ.cible === 30 && ecoJ.images <= 32 && (ecoJ.raf < 55 || ecoJ.images >= 25), `Économie en jouant : 30 images/s (${fmt(ecoJ)})${charge(ecoJ, 55)}`);

  console.log('── gardés après un rechargement ; une vieille sauvegarde : Auto et Économie ──');
  await choisir('qualite', 'moyenne'); await choisir('images', 'fluide');
  await page.evaluate(() => window.__fournil.save()); await sleep(500);
  const relancer = async () => { await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st && SCENE.webgl, null, { timeout: 30000 }); await page.evaluate(() => window.__fournil.page('reglages')); await sleep(800); };
  const etat = () => page.evaluate(() => { const coche = (c) => { const b = document.querySelector(`#page-reglages [data-${c}][aria-checked="true"]`); return b ? b.textContent : ''; }; return { qualite: window.__fournil.st.qualite, images: window.__fournil.st.images, palier: SCENE.palier, choix: SCENE.choixQualite, fixe: SCENE._qual.fixe, cible: window.__fournil.cadence().cible, cases: `${coche('qualite')} · ${coche('images')}` }; });
  await relancer(); await toucher(cdp, gx, gy);
  let e = await etat();
  check(e.qualite === 'moyenne' && e.images === 'fluide' && e.palier === 'moyenne' && e.choix === 'moyenne' && e.fixe && e.cible === 60 && e.cases === 'Moyenne · Fluide', `après rechargement : Moyenne et Fluide, appliqués dès le lancement (${JSON.stringify(e)})`);
  await page.evaluate(() => { const st = window.__fournil.st; delete st.qualite; delete st.images; window.__fournil.save(); }); await sleep(500);
  await relancer(); await toucher(cdp, gx, gy);
  e = await etat();
  check(e.qualite === 'auto' && e.images === 'economie' && e.choix === 'auto' && e.cible === 30 && e.cases === 'Auto · Économie', `une sauvegarde sans ces champs : Auto et Économie (${JSON.stringify(e)})`);
  await page.evaluate(() => { const st = window.__fournil.st; st.qualite = 'ultra'; st.images = 'turbo'; window.__fournil.save(); }); await sleep(500);
  await relancer(); e = await etat();
  check(e.qualite === 'auto' && e.images === 'economie' && e.choix === 'auto', `des valeurs inconnues : réparées en Auto et Économie (${JSON.stringify(e)})`);
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  await ctx.close();

  console.log('── l\'arrière-salle (BlackJack, roulette) : jamais bridée, même en Économie et en qualité Éco ──');
  // un iPhone (finesse 3) en Économie (30 puis 10 images/s) et en qualité Éco (la boutique à 1 pixel par point), choisis dans les Réglages
  ({ page, erreurs, cdp, ctx } = await ouvrir('?hd=0', null, 3));
  await page.evaluate(() => window.__fournil.page('reglages')); await sleep(400);
  await page.evaluate(() => { document.querySelector('#page-reglages [data-qualite="eco"]').click(); document.querySelector('#page-reglages [data-images="economie"]').click(); window.__fournil.page('boutique'); });
  const vueScene = () => page.evaluate(() => { const c = document.querySelector('#scene'); return { palier: SCENE.palier || SCENE.stats.qualite, finesse: c.clientWidth ? c.width / c.clientWidth : 0 }; });
  const sc0 = await vueScene();
  check(await page.evaluate(() => window.__fournil.st.qualite === 'eco' && window.__fournil.st.images === 'economie') && sc0.palier === 'eco' && Math.abs(sc0.finesse - 1) < 0.02, `Économie et Éco choisis : la boutique est à 1 pixel par point (${JSON.stringify(sc0)})`);
  check(await attendre(async () => (await cadence(page)).repos, 25000), 'la boutique passe au repos (10 images/s) après 15 s sans toucher');
  const cR0 = await cadence(page);
  check(cR0.cible === 10 && cR0.repos, `au repos dans la boutique : 10 images/s (${JSON.stringify(cR0)})`);
  // la salle trouvée (la petite porte), le mot de la première fois lu au doigt
  await page.evaluate(() => window.__fournil.ouvrirArriere()); await sleep(300);
  if (await page.evaluate(() => !!document.querySelector('[data-ar="asseoir"]'))) { const [ax, ay] = await centre(page, '[data-ar="asseoir"]'); await toucher(cdp, ax, ay); await sleep(300); }
  const cAr = await cadence(page);
  check((await page.evaluate(() => window.__fournil.arriere().ouvert)) && cAr.cible === 0 && !cAr.repos, `la salle ouverte : aucune limite, pas de repos (${JSON.stringify(cAr)})`);
  // sans toucher l'écran plus de 15 s : toujours à pleine cadence ; la boutique, cachée, ne se dessine pas
  await sleep(16000);
  const ar = await mesurer(page, 3000), cAr2 = await cadence(page);
  check(cAr2.cible === 0 && !cAr2.repos && ar.images >= ar.raf * 0.85 && (ar.raf < 40 || ar.images > 40), `16 s sans toucher dans la salle : chaque rafraîchissement est traité, ~60 images/s, pas de repos à 10 (${fmt(ar)})`);
  check(ar.rendus === 0, `la boutique cachée derrière ne se dessine pas (${ar.rendus.toFixed(1)} rendus/s) ; sa passe d'effets est rendue (${JSON.stringify(await page.evaluate(() => SCENE.stats.effets))})`);
  // la roulette : sa roue 3D garde sa pleine finesse (2 pixels par point au plus, comme toujours), même en qualité Éco
  { const [bx, by] = await centre(page, '.ar-bascule [data-table="roulette"]'); await toucher(cdp, bx, by); }
  check(await attendre(() => page.evaluate(() => { const e = window.__fournil.arriere(); return e.table === 'roulette' && e.roulette.rendu === 'webgl'; }), 8000), 'la roulette ouverte, sa roue 3D bâtie');
  await sleep(500);
  const roue = await page.evaluate(() => { const c = document.querySelector('#ar-roue canvas'); return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, dpr: devicePixelRatio } : null; });
  const sc1 = await vueScene();
  check(roue && roue.cw > 100 && roue.w === Math.round(roue.cw * Math.min(2, roue.dpr)) && roue.h === Math.round(roue.ch * Math.min(2, roue.dpr)) && sc1.palier === 'eco', `la roue est nette : ${roue && `${roue.w} × ${roue.h} pixels pour ${roue.cw} × ${roue.ch} points (finesse ${roue.dpr})`}, la boutique restant en Éco (${JSON.stringify(sc1)})`);
  const cAr3 = await cadence(page), arR = await mesurer(page, 2000);
  check(cAr3.cible === 0 && !cAr3.repos && arR.images >= arR.raf * 0.85 && (arR.raf < 40 || arR.images > 40), `à la roulette aussi, pleine cadence (${fmt(arR)})`);
  // refermée : la boutique reprend sa cadence (30 images/s en jouant, la scène de nouveau dessinée), puis son repos à 10
  { const [fx, fy] = await centre(page, '#arriere [data-ar="fermer"]'); await toucher(cdp, fx, fy); } await sleep(300);
  const cF = await cadence(page);
  check(!(await page.evaluate(() => window.__fournil.arriere().ouvert)) && cF.cible === 30 && !cF.repos, `la salle refermée : la boutique revient à 30 images/s (${JSON.stringify(cF)})`);
  await sleep(1200); // (la fenêtre d'une seconde des images comptées : sans celles de la salle, à pleine cadence)
  const bq = await mesurer(page, 2000);
  check(bq.rendus > 0 && bq.rendus <= 32 && bq.images <= 32 && (bq.raf < 55 || bq.rendus >= 25), `et la scène de la boutique est de nouveau rendue ~30 fois par seconde (${fmt(bq)})${charge(bq, 55)}`);
  check(await attendre(async () => (await cadence(page)).repos, 25000) && (await cadence(page)).cible === 10, 'puis, 15 s sans toucher, son repos à 10 images/s');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  for (const o of ouverts) await o.ctx.close().catch(() => {});
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (batterie).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
