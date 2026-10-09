// Opération Poncin : parcours de bout en bout sur un téléphone simulé en paysage (la vraie page poncin/index.html, la vraie carte).
// Titre → Arène solo → joystick, visée au doigt, tir sur un robot → élimination → fin de partie → record lu par la Salle de jeux.
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-play.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORT = 8791;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'poncin'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const URL0 = `http://localhost:${PORT}/poncin/`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_CERT/.test(m.text() + ((m.location() && m.location().url) || ''))) errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] != null ? p[2] : i })) });
  const glisser = async (x0, y0, x1, y1, n = 8, id = 1) => { await toucher('touchStart', [[x0, y0, id]]); for (let k = 1; k <= n; k++) { await toucher('touchMove', [[x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, id]]); await sleep(30); } return () => toucher('touchEnd', []); };
  const P = (f, a) => page.evaluate(f, a);

  // ─── le titre ───
  await page.goto(URL0); await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const titre = await P(() => ({ ecran: document.body.dataset.ecran, texte: document.body.innerText, stats: window.__poncin && window.__poncin.stats() }));
  check(titre.ecran === 'titre' && /Opération/i.test(titre.texte) && /Poncin/i.test(titre.texte) && /Jouer/i.test(titre.texte), 'l’écran titre s’affiche');
  check(titre.stats && titre.stats.rendu && titre.stats.rendu.webgl && titre.stats.rendu.calls > 0, `le survol 3D de Poncin tourne (WebGL, ${titre.stats && titre.stats.rendu ? titre.stats.rendu.calls : 0} appels de dessin)`);
  const source = await P(() => { const j = window.__poncin; return j && document.querySelector('#carte-provisoire') ? document.querySelector('#carte-provisoire').hidden : null; });
  check(source === true, 'la vraie carte de Poncin est chargée (pas la carte provisoire)');
  await page.screenshot({ path: out + '/01-titre.png' });

  // ─── la partie : Arène solo, 3 robots faciles, graine fixe ───
  const st0 = await P(() => window.__poncin.demarrer({ bots: 3, niveau: 'facile', graine: 7 }));
  check(!!st0, 'une partie d’Arène démarre (3 robots faciles)');
  await P(() => window.__poncin.pas(2)); await sleep(800);
  const j0 = await P(() => { const m = window.__poncin.joueur(), jeu = window.__poncin.jeu(); return { x: m.x, z: m.z, yaw: m.yaw, bots: jeu.entites.filter((e) => e.bot).length, arene: jeu.arene ? { c: jeu.arene.centre, r: jeu.arene.rayon } : null, ecran: document.body.dataset.ecran }; });
  check(j0.bots === 3 && j0.ecran === 'partie', `en partie, avec ${j0.bots} robots`);
  check(j0.arene && Math.hypot(j0.arene.c[0] - 99, j0.arene.c[1] - 1.5) < 5, 'l’arène est sur la place Xavier-Bichat de la vraie carte');
  await page.screenshot({ path: out + '/02-partie.png' });

  // joystick : on avance (pouce gauche vers le haut)
  const libere = await glisser(150, 300, 150, 230, 6, 11);
  for (let k = 0; k < 8; k++) { await P(() => window.__poncin.pas(10)); await sleep(40); }
  await libere();
  const j1 = await P(() => { const m = window.__poncin.joueur(); return { x: m.x, z: m.z, yaw: m.yaw }; });
  const avance = Math.hypot(j1.x - j0.x, j1.z - j0.z);
  check(avance > 1.5, `le joystick fait avancer (${avance.toFixed(1)} m)`);
  const dansMur = await P(() => { const m = window.__poncin.joueur(), jeu = window.__poncin.jeu(); return jeu.monde.bloque(m.x, m.z, 0.3); });
  check(!dansMur, 'jamais dans un mur');

  // visée : glisser le pouce droit vers la gauche fait tourner vers la gauche (yaw augmente)
  const yawAvant = j1.yaw;
  const libere2 = await glisser(600, 200, 520, 200, 6, 12); await libere2();
  await P(() => window.__poncin.pas(1));
  const yawApres = await P(() => window.__poncin.joueur().yaw);
  check(Math.abs(yawApres - yawAvant) > 0.05, `glisser à droite de l’écran fait tourner la vue (${((yawApres - yawAvant) * 180 / Math.PI).toFixed(0)}°)`);

  // un robot à portée : on se place face à lui, on vise, on tire au bouton
  const cible = await P(() => {
    const p = window.__poncin, jeu = p.jeu(), b = jeu.entites.find((e) => e.bot && e.vivant);
    // le robot ne bouge plus pendant le test : on le pose à 8 m devant nous, sur un point libre
    const m = p.joueur(); let ok = null;
    for (let a = 0; a < 16 && !ok; a++) { const yaw = a * Math.PI / 8, x = m.x - Math.sin(yaw) * 8, z = m.z - Math.cos(yaw) * 8; if (!jeu.monde.bloque(x, z, 0.5) && jeu.monde.vue(m.x, m.y + 1.6, m.z, x, jeu.monde.hauteur(x, z) + 1.2, z)) ok = [x, z]; }
    if (!ok) return null;
    b.x = ok[0]; b.z = ok[1]; b.y = jeu.monde.hauteur(ok[0], ok[1]); b.invincible = 0; b.vie = 100; b.armure = 0;
    p.viser(b.id); return { id: b.id, nom: b.nom };
  });
  check(!!cible, 'un robot posé à 8 m, dans le viseur');
  const tir = await page.evaluate(() => { const b = document.querySelector('.pc-tir'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  check(!!tir, 'le bouton Tir est là');
  let touche = false, elimine = false;
  if (cible && tir) {
    const vie0 = await P((id) => window.__poncin.jeu().entites.find((e) => e.id === id).vie, cible.id);
    await toucher('touchStart', [[tir[0], tir[1], 21]]);
    for (let k = 0; k < 40 && !elimine; k++) {
      await P((id) => { window.__poncin.viser(id); window.__poncin.pas(3); }, cible.id);
      const b = await P((id) => { const e = window.__poncin.jeu().entites.find((x) => x.id === id); return { vie: e.vie, vivant: e.vivant }; }, cible.id);
      if (b.vie < vie0) touche = true; if (!b.vivant) elimine = true;
    }
    await toucher('touchEnd', []);
  }
  check(touche, 'le bouton Tir touche le robot');
  check(elimine, 'le robot est repeint (éliminé)');
  await sleep(300); await page.screenshot({ path: out + '/03-elimination.png' });
  const fil = await P(() => document.querySelector('#hud') ? document.querySelector('#hud').innerText : '');
  check(cible && fil.includes(cible.nom), 'le fil des éliminations le dit : ' + (fil.split('\n').find((l) => cible && l.includes(cible.nom)) || '—'));

  // les robots jouent : 20 s de partie, sans erreur
  for (let k = 0; k < 12; k++) await P(() => window.__poncin.pas(100));
  const vie = await P(() => { const jeu = window.__poncin.jeu(); return { temps: jeu.temps, morts: jeu.entites.reduce((s, e) => s + e.score.morts, 0), erreurs: jeu.erreurs || 0 }; });
  check(vie.temps > 20 && !vie.erreurs, `les robots jouent (${vie.temps.toFixed(0)} s, ${vie.morts} repeints au total, sans erreur)`);
  const st = await P(() => window.__poncin.stats());
  const r = st.rendu || {};
  check(r.calls > 0 && r.calls <= 110 && r.triangles <= 300000, `budget du rendu tenu (${r.calls} appels, ${Math.round((r.triangles || 0) / 1000)}k triangles, qualité ${r.qualite})`);
  await page.screenshot({ path: out + '/04-combat.png' });

  // la fin : écran de fin, record enregistré
  await P(() => window.__poncin.finir()); await sleep(800);
  const fin = await P(() => ({ ecran: document.body.dataset.ecran, texte: document.body.innerText, sauv: window.__poncin.sauvegarde() }));
  check(/Rejouer/i.test(fin.texte), 'l’écran de fin propose de rejouer');
  check(fin.sauv.records.arene.parties >= 1 && fin.sauv.records.arene.eliminations >= 1, `le record est enregistré (${fin.sauv.records.arene.meilleur} points, ${fin.sauv.records.arene.eliminations} repeint)`);
  await page.screenshot({ path: out + '/05-fin.png' });

  // la Salle de jeux montre le record
  await page.goto(`http://localhost:${PORT}/?app=accueil`); await sleep(800);
  const carte = await P(() => (document.querySelector('[data-jeu="poncin"]') || {}).innerText || '');
  check(/Record Arène/.test(carte) && /Continuer/.test(carte), 'la Salle de jeux montre le record d’Opération Poncin : ' + (carte.split('\n').find((l) => /Record/.test(l)) || '—'));

  // en portrait : « Tourne ton téléphone »
  const p2 = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' })).newPage();
  await p2.goto(URL0); await p2.waitForFunction(() => window.__poncin, null, { timeout: 30000 }).catch(() => {});
  await p2.evaluate(() => window.__poncin.demarrer({ bots: 3, niveau: 'facile', graine: 3 })); await sleep(700);
  check(await p2.evaluate(() => { const t = document.querySelector('#tourne'); return !!t && getComputedStyle(t).display !== 'none' && t.offsetHeight > 0; }), 'en portrait, en partie : « Tourne ton téléphone »');
  await p2.screenshot({ path: out + '/06-portrait.png' });

  console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'ERRORS none');
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  await browser.close(); server.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
