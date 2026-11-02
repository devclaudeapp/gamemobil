// Dernier Rempart : de bout en bout sur un iPhone simulé (la vraie page zombies/index.html, construite par build.js).
// La Salle de jeux montre sa carte → le titre (la partie de démonstration tourne en 3D, le Jardin ouvert, le Parking et la Ferme verrouillés)
// → Jouer → le HUD (vie, vague, ferraille, armes, atelier) → le joystick au doigt fait courir le survivant → la vague arrive, il tire seul →
// une tourelle posée depuis l'atelier → pause (la partie est figée) et reprise → le survivant tombe → l'écran de fin, le record enregistré
// (zombies.v1), relu par le titre et par la Salle de jeux → en portrait, rien ne déborde → hors ligne (service worker), le jeu s'ouvre encore.
// Aucune erreur dans la page ; un budget d'appels de dessin avec une vague à l'écran. Captures dans test/shots/zombies (ou $CAPTURES).
// NODE_PATH=/opt/node22/lib/node_modules node test/zombies-play.cjs   (PORT_ZOMBIES : le port du serveur de test)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css' };
const PORT = +process.env.PORT_ZOMBIES || 8894;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = process.env.CAPTURES || path.join(__dirname, 'shots', 'zombies'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const BASE = `http://localhost:${PORT}/`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // pas de réseau extérieur dans les tests
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_FAILED|ERR_CERT/.test(m.text() + ((m.location() && m.location().url) || ''))) errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p[0], y: p[1], id: p[2] || 1 })) });
  const P = (f, a) => page.evaluate(f, a);

  // ─── la Salle de jeux : la carte de Dernier Rempart ───
  await page.goto(BASE); await sleep(500);
  const accueil = await P(() => { const c = document.querySelector('[data-jeu="zombies"]'); return { carte: c ? c.innerText : '', href: c ? c.getAttribute('href') : '', bientot: document.querySelectorAll('.jeu.bientot').length, jeux: document.querySelectorAll('a.jeu').length, icone: c && c.querySelector('img').complete && c.querySelector('img').naturalWidth > 0 }; });
  check(/Dernier Rempart/.test(accueil.carte) && /zombies/i.test(accueil.carte) && /Jouer/.test(accueil.carte) && accueil.href === 'zombies/' && accueil.icone, 'la Salle de jeux montre la carte de Dernier Rempart (icône, genre, « Jouer »)');
  check(accueil.bientot === 0 && accueil.jeux === 3, 'elle remplace la case « Bientôt un nouveau jeu » (trois jeux)');
  await page.screenshot({ path: out + '/00-accueil.png' });
  await page.tap('[data-jeu="zombies"]'); await page.waitForURL(/\/zombies\/$/);

  // ─── le titre ───
  await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const titre = await P(() => ({ texte: document.body.innerText, stats: window.__zombies.stats(), demo: !!window.__zombies.demo, arenes: [...document.querySelectorAll('.arene')].map((b) => [b.dataset.arene, b.disabled, b.getAttribute('aria-checked')].join(':')) }));
  check(/DERNIER/.test(titre.texte) && /REMPART/.test(titre.texte) && /Jouer/.test(titre.texte), 'l’écran titre s’affiche');
  check(titre.stats.rendu.webgl && titre.stats.rendu.calls > 0 && titre.demo, `la partie de démonstration tourne en 3D derrière le titre (${titre.stats.rendu.calls} appels de dessin)`);
  check(titre.arenes.join(',') === 'jardin:false:true,parking:true:false,ferme:true:false', `le Jardin est ouvert et choisi, le Parking et la Ferme verrouillés (${titre.arenes.join(', ')})`);
  await page.screenshot({ path: out + '/01-titre.png' });

  // ─── jouer ───
  await page.tap('#b-jouer'); await sleep(600);
  const hud = await P(() => ({ ecran: window.__zombies.ecran, hud: !document.querySelector('#hud').hidden, vie: document.querySelector('.h-vie-n').textContent, v: document.querySelector('.h-v').textContent, arme: document.querySelector('.h-arme-nom').textContent, slots: document.querySelectorAll('.h-slot').length, defs: document.querySelectorAll('.h-btn.def').length, ams: document.querySelectorAll('.h-btn.am').length }));
  check(hud.ecran === 'jeu' && hud.hud && hud.vie === '100' && hud.v === 'V1' && hud.arme === 'PISTOLET' && hud.slots === 2 && hud.defs === 5 && hud.ams === 5, `Jouer : le HUD (vie ${hud.vie}, ${hud.v}, ${hud.arme}, 2 armes, atelier de 5 défenses et 5 améliorations)`);
  // le joystick : un doigt posé à gauche glisse vers la gauche, le survivant court vers l'ouest
  const x0 = await P(() => window.__zombies.jeu.joueurs[0].x);
  await toucher('touchStart', [[200, 250]]);
  for (let k = 1; k <= 6; k++) { await toucher('touchMove', [[200 - k * 12, 250]]); await sleep(30); }
  const joy = await P(() => ({ ...ZCONTROLES.joystick, visible: !document.querySelector('.joy').hidden }));
  await sleep(700);
  const x1 = await P(() => window.__zombies.jeu.joueurs[0].x);
  await toucher('touchEnd', []);
  check(joy.actif && joy.visible && joy.x < -0.8, `le joystick flottant naît sous le doigt et suit le pouce (${joy.x.toFixed(2)})`);
  check(x1 < x0 - 1.5, `le survivant court vers la gauche (${x0.toFixed(1)} → ${x1.toFixed(1)} m)`);
  await sleep(200); check(!(await P(() => ZCONTROLES.joystick.actif)) && await P(() => document.querySelector('.joy').hidden), 'doigt levé : le joystick disparaît');
  // la vague arrive, il tire tout seul
  await page.waitForFunction(() => window.__zombies.jeu.vague >= 1 && window.__zombies.jeu.zombies.length > 3, null, { timeout: 20000 }).catch(() => {});
  await P(() => { const p = window.__zombies.jeu.joueurs[0]; p.vieMax = p.vie = 5000; }); // invincible le temps de regarder
  await page.waitForFunction(() => window.__zombies.jeu.stats.tues > 0, null, { timeout: 30000 }).catch(() => {});
  const vague = await P(() => ({ v: window.__zombies.jeu.vague, z: window.__zombies.jeu.zombies.length, tues: window.__zombies.jeu.stats.tues, rest: document.querySelector('.h-rest').textContent, tirs: window.__zombies.jeu.stats.tirs, calls: window.__zombies.stats().rendu.calls }));
  check(vague.v === 1 && /RESTANTS/.test(vague.rest) && vague.tirs > 0 && vague.tues > 0, `la vague 1 : « ${vague.rest} », le survivant tire seul (${vague.tirs} balles, ${vague.tues} zombies abattus)`);
  check(vague.calls > 0 && vague.calls <= 60, `${vague.calls} appels de dessin avec ${vague.z} zombies à l’écran (≤ 60 : les zombies sont instanciés)`);
  await page.screenshot({ path: out + '/02-vague.png' });
  // l'atelier : une tourelle
  await P(() => { window.__zombies.jeu.joueurs[0].ferraille = 40; });
  await sleep(150);
  await page.tap('[data-def="tourelle"]'); await sleep(300);
  const atelier = await P(() => ({ defs: window.__zombies.jeu.defenses.map((d) => d.type), fer: window.__zombies.jeu.joueurs[0].ferraille, nb: document.querySelector('[data-def="tourelle"] .nb').textContent, etat: document.querySelector('[data-def="tourelle"]').dataset.etat, info: document.querySelector('.h-info').innerText }));
  check(atelier.defs.join() === 'tourelle' && atelier.fer === 25 && atelier.nb === '1/1' && atelier.etat === 'max' && /Tourelle/.test(atelier.info), `toucher la tourelle la pose (15 de ferraille, « ${atelier.nb} », la fiche s’affiche)`);
  await page.tap('[data-def="tourelle"]'); await sleep(200);
  check(/maximum/.test(await P(() => document.querySelector('.h-toast').textContent)), 'une deuxième tourelle à la vague 1 : refusée, avec un message');
  await page.tap('.h-poignee'); await sleep(350);
  check(await P(() => !document.querySelector('.h-atelier').classList.contains('ouvert') && localStorage.getItem('zombies.atelier') === 'ferme'), 'la poignée replie l’atelier (et s’en souvient)');
  await page.tap('.h-poignee'); await sleep(300);
  // pause et reprise
  await page.tap('.h-pause'); await sleep(200);
  const t0 = await P(() => window.__zombies.jeu.t); await sleep(600); const t1 = await P(() => window.__zombies.jeu.t);
  check(await P(() => !document.querySelector('#ecran-pause').hidden && window.__zombies.enPause) && t1 === t0, 'Pause : l’écran de pause, la partie figée');
  await page.screenshot({ path: out + '/03-pause.png' });
  await page.tap('#b-reprendre'); await sleep(500);
  check(await P(() => document.querySelector('#ecran-pause').hidden && !window.__zombies.enPause) && (await P(() => window.__zombies.jeu.t)) > t1, 'Reprendre : la partie repart');
  // le survivant tombe : l'écran de fin, le record
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.vie = 1; p.vieMax = 100; p.invul = 0; for (const z of j.zombies) { z.x = p.x + 0.9; z.z = p.z; z.coup = 0; z.naissance = -9; } });
  await page.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 15000 }).catch(() => {});
  const fin = await P(() => ({ ecran: document.body.dataset.ecran, texte: document.querySelector('#ecran-fin').innerText, save: JSON.parse(localStorage.getItem('zombies.v1') || 'null') }));
  check(fin.ecran === 'fin' && /Submergé/.test(fin.texte) && /Vague atteinte/.test(fin.texte) && /Zombies/.test(fin.texte), 'le survivant tombe : l’écran de fin et ses chiffres');
  check(fin.save && fin.save.v === 1 && fin.save.records.jardin && fin.save.records.jardin.vague === 1 && fin.save.records.jardin.parties === 1 && fin.save.total.parties === 1, 'le record est enregistré (zombies.v1 : Jardin, vague 1, une partie)');
  await page.screenshot({ path: out + '/04-fin.png' });
  await page.tap('#b-menu'); await sleep(700);
  check(/Record : vague 1/.test(await P(() => document.querySelector('[data-arene="jardin"]').innerText)), 'le titre montre le record du Jardin');
  await page.goto(BASE); await sleep(500);
  const carte = await P(() => document.querySelector('[data-jeu="zombies"]').innerText);
  check(/Record : vague 1 dans le Jardin/.test(carte) && /1 partie/.test(carte) && /Continuer/.test(carte), 'la Salle de jeux relit le record (« Record : vague 1 dans le Jardin », « Continuer »)');

  // ─── en portrait ───
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 20000 }).catch(() => {});
  await sleep(600);
  const portraitTitre = await P(() => ({ large: document.documentElement.scrollWidth <= innerWidth + 1, jouer: (() => { const r = document.querySelector('#b-jouer').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })() }));
  check(portraitTitre.large && portraitTitre.jouer, 'en portrait, le titre tient dans l’écran (bouton Jouer visible, rien ne déborde)');
  await P(() => window.__zombies.demarrer('jardin', 5)); await sleep(800);
  const portrait = await P(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect(), dans = (b) => b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1;
    const inter = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const at = r('.h-cols'), ar = r('.h-slots'), ca = r('.h-carte'), ce = r('.h-centre'), vi = r('.h-vie');
    return { dans: [at, ar, ca, ce, vi].every(dans), chevauche: inter(at, ar) || inter(ca, ar) || inter(ce, vi) || inter(ca, at), large: document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  check(portrait.dans && !portrait.chevauche && portrait.large, 'en portrait, le HUD tient dans l’écran sans chevauchement (vie, vague, mini-carte, atelier, armes)');
  await page.screenshot({ path: out + '/05-portrait.png' });
  check(errors.length === 0, `aucune erreur dans la page${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await context.close();

  // ─── hors ligne : le service worker garde le jeu ───
  const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + 'zombies/');
  const pret = await p2.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((res) => setTimeout(() => res(false), 15000))]); return r; });
  await sleep(800);
  const cache = await p2.evaluate(async () => { const ks = await caches.keys(), c = ks.find((k) => k.startsWith('zombies-jeu-')); if (!c) return []; return (await (await caches.open(c)).keys()).map((r) => new URL(r.url).pathname); });
  check(pret && cache.some((u) => /vendor\/three\.min\.js$/.test(u)) && cache.some((u) => /zombies\/(index\.html)?$/.test(u)), `le service worker du jeu met la page et Three.js en cache (${cache.length} fichiers)`);
  await ctx2.setOffline(true);
  await p2.reload(); await p2.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 20000 }).catch(() => {});
  await sleep(800);
  const horsLigne = await p2.evaluate(() => ({ titre: document.body.dataset.ecran, three: typeof THREE !== 'undefined', calls: window.__zombies ? window.__zombies.stats().rendu.calls : 0 }));
  check(horsLigne.titre === 'titre' && horsLigne.three && horsLigne.calls > 0, 'hors ligne, le jeu s’ouvre encore (page et Three.js servis par le cache, la 3D tourne)');
  await p2.evaluate(() => window.__zombies.demarrer('jardin', 1)); await sleep(1500);
  check(await p2.evaluate(() => window.__zombies.jeu && window.__zombies.jeu.t > 0.5), 'et on peut y jouer');
  await ctx2.close();

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s) (Dernier Rempart, Playwright)` : '\nTout passe (Dernier Rempart, Playwright).');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
