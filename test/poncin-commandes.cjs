// Opération Poncin : la boucle à pas fixe et le cumul des commandes (conception § 2, correction C4), sur la vraie page, iPhone en paysage.
// - pas fixe : sur 2 s d'images irrégulières, nombre de pas = temps / (1/60) à ±1 ; une image de 300 ms fait au plus 4 pas (le reste est perdu) ;
//   les positions ne dépendent pas de la cadence des images (30, 60, 120 Hz, irrégulière) ;
// - cumul : un glissé pendant des images sans pas n'est pas perdu (PCONTROLES.enAttente le montre, le pas suivant l'applique tout entier) ;
// - fronts : un saut ou un appui bref sur Tir donnés pendant une image sans pas, ou avant une image de 2 pas, partent une fois et une seule ;
// - le réglage « Balancement » est sauvegardé et transmis au rendu (PRENDU.reglages).
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-commandes.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORT = 8794;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'poncin'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const PAS = 1 / 60;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_CERT/.test(m.text() + ((m.location() && m.location().url) || ''))) errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p[0], y: p[1], id: p[2] })) });
  const P = (f, a) => page.evaluate(f, a);
  const centre = (sel) => P((s) => { const b = document.querySelector(s); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

  await page.goto(`http://localhost:${PORT}/poncin/`);
  await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  check(await P(() => document.body.dataset.ecran === 'titre'), 'la page est prête (écran titre)');

  // ─── le réglage « Balancement » ───
  await P(() => { window.__bal = []; if (typeof PRENDU !== 'undefined' && !PRENDU.reglages) PRENDU.reglages = (o) => { window.__bal.push(o && o.balancement); }; else if (typeof PRENDU !== 'undefined') { const v = PRENDU.reglages; PRENDU.reglages = (o) => { window.__bal.push(o && o.balancement); return v.call(PRENDU, o); }; } });
  await P(() => window.__poncin.montrer('reglages'));
  const seg = await centre('.seg[data-r="balancement"] button[data-v="doux"]');
  check(!!seg, 'les réglages proposent « Balancement : normal / doux / aucun »');
  if (seg) await page.mouse.click(seg[0], seg[1]);
  await sleep(100);
  const bal = await P(() => ({ sauv: window.__poncin.sauvegarde().reglages.balancement, vu: window.__bal.slice(), appuye: document.querySelector('.seg[data-r="balancement"] button[data-v="doux"]').getAttribute('aria-pressed') }));
  check(bal.sauv === 'doux' && bal.appuye === 'true', `« doux » est choisi et sauvegardé (poncin.v1 : ${bal.sauv})`);
  check(bal.vu[bal.vu.length - 1] === 'doux', `le rendu le reçoit par PRENDU.reglages({ balancement }) (${bal.vu.join(', ')})`);
  await page.screenshot({ path: out + '/commandes-reglages.png' });
  const s2 = await centre('.seg[data-r="balancement"] button[data-v="normal"]'); if (s2) await page.mouse.click(s2[0], s2[1]);
  await P(() => window.__poncin.montrer('titre'));

  // ─── une partie, les images menées par le test ───
  const demarrer = (graine) => P((g) => {
    const p = window.__poncin; p.manuel(true);
    const st = p.demarrer({ bots: 3, niveau: 'facile', graine: g });
    const j = p.jeu(), m = p.joueur();
    j.aideVisee = null; // pas d'aide à la visée : on compare des angles exacts
    for (const e of j.entites) if (e.bot) { e.x += 300; e.z += 300; } // les robots au loin, pour ne pas être dérangé
    m.invincible = 999;
    p.images([1 / 60, 1 / 60, 1 / 60], { remettre: true }); // quelques pas pour se poser
    return !!st;
  }, graine);
  check(await demarrer(7), 'une partie démarre, la boucle est menée par le test (manuel)');

  // pas fixe : 2 s d'images irrégulières (4 à 50 ms)
  const fixe = await P((PAS) => {
    const p = window.__poncin; let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const dts = []; let tot = 0; while (tot < 2) { const d = Math.min(2 - tot, 0.004 + rnd() * 0.046); dts.push(d); tot += d; }
    const t0 = p.jeu().temps, r = p.images(dts);
    const pic = p.images([0.3]); // une image de 300 ms : au plus 4 pas, le reste est perdu
    const lent = p.images(Array(10).fill(1 / 30)), vite = p.images(Array(40).fill(1 / 240));
    return { n: dts.length, pas: r.pas, attendu: tot / PAS, dtemps: r.temps - t0, alpha: r.alpha, pic: pic.pas, lent: lent.pas, vite: vite.pas };
  }, PAS);
  check(Math.abs(fixe.pas - fixe.attendu) <= 1, `pas fixe : ${fixe.pas} pas pour ${fixe.attendu.toFixed(1)} attendus sur 2 s (${fixe.n} images irrégulières)`);
  check(Math.abs(fixe.dtemps - fixe.pas * PAS) < 1e-6, `la partie avance de ${fixe.dtemps.toFixed(4)} s = pas × 1/60`);
  check(fixe.alpha >= 0 && fixe.alpha < 1, `alpha dans [0, 1[ (${fixe.alpha.toFixed(3)})`);
  check(fixe.pic === 4, `une image de 300 ms fait ${fixe.pic} pas (au plus 4 : le temps en trop est perdu)`);
  check(fixe.lent === 20 && Math.abs(fixe.vite - 10) <= 1, `30 Hz : 2 pas par image (${fixe.lent} pas / 10 images) ; 240 Hz : un pas toutes les 4 images (${fixe.vite} pas / 40 images)`);

  // la même course à 30, 60, 120 Hz et irrégulière : la même position
  const trace = async (dts) => { await demarrer(11); return P((dts) => { const p = window.__poncin; p.entree({ avant: 1, cote: 0.3 }); p.images(dts, { remettre: true }); p.entree(null); const m = p.joueur(); return { x: m.x, z: m.z, temps: p.jeu().temps }; }, dts); };
  const cadences = { '30 Hz': Array(90).fill(1 / 30), '60 Hz': Array(180).fill(1 / 60), '120 Hz': Array(360).fill(1 / 120) };
  { let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const v = []; let t = 0; while (t < 3 - 1e-9) { const d = Math.min(3 - t, [1 / 60, 1 / 30, 1 / 120, 0.022, 0.009][Math.floor(rnd() * 5)]); v.push(d); t += d; } cadences['irrégulière'] = v; }
  await P(() => window.__poncin.rendu(false)); // la 3D coupée pendant les traces (la simulation seule compte)
  const pos = {}; for (const k in cadences) pos[k] = await trace(cadences[k]);
  await P(() => window.__poncin.rendu(true));
  const ref = pos['60 Hz']; let ecart = 0; for (const k in pos) ecart = Math.max(ecart, Math.hypot(pos[k].x - ref.x, pos[k].z - ref.z));
  check(ecart < 1e-9 && ref.temps > 2.9, `les positions ne dépendent pas de la cadence des images (écart ${ecart.toExponential(1)} m après ${ref.temps.toFixed(2)} s ; ${Object.keys(pos).join(', ')})`);

  // ─── le cumul : glisser pendant des images sans pas ───
  await demarrer(7);
  const avant = await P(() => { const p = window.__poncin; p.images([0.01], { remettre: true }); return { yaw: p.joueur().yaw, pitch: p.joueur().pitch }; }); // acc = 10 ms : pas de pas
  const N = 4, DX = -20; // 4 glissés de 20 px vers la gauche sur la moitié droite
  await toucher('touchStart', [[600, 200, 5]]);
  for (let k = 1; k <= N; k++) { await toucher('touchMove', [[600 + DX * k, 200, 5]]); await P(() => window.__poncin.images([0.001])); } // 4 images d'1 ms : toujours pas de pas
  await toucher('touchEnd', []);
  const milieu = await P(() => { const p = window.__poncin, a = PCONTROLES.enAttente(); return { yaw: p.joueur().yaw, attente: a.dyaw, pas: p.compteurs().acc }; });
  const theorie = N * Math.abs(DX) * 0.22 * Math.PI / 180 * Math.pow(Math.abs(DX), 0.15); // la courbe du doigt, glissé par glissé (au moins ça si le navigateur regroupe les glissés)
  check(milieu.yaw === avant.yaw, 'pendant les images sans pas, la vue simulée n’a pas bougé');
  check(milieu.attente > 0 && Math.abs(milieu.attente - theorie) / theorie < 0.15, `rien de perdu : enAttente().dyaw = ${(milieu.attente * 180 / Math.PI).toFixed(2)}° (théorie ${(theorie * 180 / Math.PI).toFixed(2)}°)`);
  const apres = await P(() => { const p = window.__poncin, r = p.images([0.01]); return { yaw: p.joueur().yaw, pas: r.pas, attente: PCONTROLES.enAttente().dyaw }; });
  const tourne = Math.atan2(Math.sin(apres.yaw - avant.yaw), Math.cos(apres.yaw - avant.yaw)); // le yaw est ramené dans ]−π, π]
  check(apres.pas === 1 && Math.abs(tourne - milieu.attente) < 1e-9, `le pas suivant applique tout le glissé (${(tourne * 180 / Math.PI).toFixed(2)}°, en 1 pas)`);
  check(apres.attente === 0, 'puis le cumul est vide');

  // ─── les fronts : saut et tir, jamais perdus ni doublés ───
  await P(() => { // on compte les entrées vues par la partie, et les événements
    const p = window.__poncin, j = p.jeu(), vrai = j.etape; window.__vu = { saut: 0, tir: 0, sautEv: 0, tirEv: 0, pas: 0 };
    j.etape = function (dt, en) { const e = en && en[p.etat().idMoi]; const v = window.__vu; v.pas++; if (e && e.saut) v.saut++; if (e && e.tir) v.tir++; const evs = vrai.call(this, dt, en); for (const x of evs || []) { if (x.t === 'saut' && x.id === 'moi') v.sautEv++; if (x.t === 'tir' && x.id === 'moi') v.tirEv++; } return evs; };
  });
  const remise = () => P(() => { const v = window.__vu; v.saut = v.tir = v.sautEv = v.tirEv = v.pas = 0; });
  const vu = () => P(() => Object.assign({}, window.__vu));
  const sautB = await centre('.pc-saut'), tirB = await centre('.pc-tir');
  check(!!sautB && !!tirB, 'les boutons Saut et Tir sont là');
  // 1) saut tapé pendant une image sans pas
  await P(() => window.__poncin.images(Array(30).fill(1 / 60))); // bien au sol
  await P(() => window.__poncin.images([0.004], { remettre: true })); await remise();
  await toucher('touchStart', [[sautB[0], sautB[1], 7]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([0.004, 0.004])); // pas de pas
  const v0 = await vu();
  await P(() => window.__poncin.images(Array(12).fill(1 / 60)));
  const v1 = await vu();
  check(v0.pas === 0 && v1.saut === 1 && v1.sautEv === 1, `saut pendant une image sans pas : vu par ${v1.saut} pas sur ${v1.pas}, ${v1.sautEv} saut`);
  // 2) saut tapé juste avant une image de 2 pas
  await P(() => window.__poncin.images(Array(60).fill(1 / 60))); await P(() => window.__poncin.images([0.001], { remettre: true })); await remise();
  await toucher('touchStart', [[sautB[0], sautB[1], 8]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([2 / 60, 1 / 60, 1 / 60]));
  const v2 = await vu();
  check(v2.pas === 4 && v2.saut === 1 && v2.sautEv === 1, `saut avant une image de 2 pas : vu par ${v2.saut} pas sur ${v2.pas}, ${v2.sautEv} saut (pas doublé)`);
  // 3) appui bref sur Tir (posé et levé entre deux images) pendant une image sans pas
  await P(() => window.__poncin.images(Array(60).fill(1 / 60))); await P(() => window.__poncin.images([0.004], { remettre: true })); await remise();
  await toucher('touchStart', [[tirB[0], tirB[1], 9]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([0.004]));
  await P(() => window.__poncin.images([2 / 60, 1 / 60, 1 / 60, 1 / 60]));
  const v3 = await vu();
  check(v3.tir === 1 && v3.tirEv === 1, `appui bref sur Tir entre deux images : vu par ${v3.tir} pas sur ${v3.pas}, ${v3.tirEv} tir (ni perdu ni doublé)`);
  // 4) Tir tenu : un niveau, présent à chaque pas tant qu'il est tenu
  await remise();
  await toucher('touchStart', [[tirB[0], tirB[1], 10]]);
  await P(() => window.__poncin.images([2 / 60, 1 / 60, 3 / 60]));
  await toucher('touchEnd', []);
  await P(() => window.__poncin.images([1 / 60, 1 / 60]));
  const v4 = await vu();
  check(v4.tir === 6 && v4.pas === 8, `Tir tenu : vu par ${v4.tir} pas sur ${v4.pas} (les 6 pas où il est tenu)`);
  // 5) une image sans pas garde le cumul : saut + glissé, puis 3 images sans pas, puis un pas
  await P(() => window.__poncin.images(Array(60).fill(1 / 60))); await P(() => window.__poncin.images([0.002], { remettre: true })); await remise();
  await toucher('touchStart', [[sautB[0], sautB[1], 11]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([0.002, 0.002, 0.002]));
  const v5a = await vu();
  await P(() => window.__poncin.images([0.01]));
  const v5 = await vu();
  check(v5a.pas === 0 && v5.pas === 1 && v5.saut === 1, `trois images sans pas gardent le saut pour le premier pas (${v5.saut} sur ${v5.pas})`);

  // ─── la boucle normale reprend ───
  await P(() => window.__poncin.manuel(false)); await sleep(500);
  const c1 = await P(() => ({ c: window.__poncin.compteurs(), t: window.__poncin.jeu().temps, s: performance.now() })); await sleep(1500);
  const c2 = await P(() => ({ c: window.__poncin.compteurs(), t: window.__poncin.jeu().temps, s: performance.now(), fps: window.__poncin.stats().fps }));
  const dJeu = c2.t - c1.t, dReel = (c2.s - c1.s) / 1000, dPas = c2.c.pas - c1.c.pas;
  // (sans GPU, une image prend souvent plus de 4 pas : la partie ralentit plutôt que de s'emballer)
  check(dPas > 0 && Math.abs(dJeu - dPas * PAS) < 1e-6 && dJeu <= dReel + PAS, `la boucle de requestAnimationFrame avance la partie par pas de 1/60 s (${dPas} pas, ${dJeu.toFixed(2)} s de jeu en ${dReel.toFixed(2)} s, ${c2.fps} images/s ici)`);
  await page.screenshot({ path: out + '/commandes-partie.png' });

  console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'ERRORS none');
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  await browser.close(); server.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
