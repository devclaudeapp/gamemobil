// Opération Poncin : parcours de bout en bout sur un téléphone simulé en paysage (la vraie page poncin/index.html, la vraie carte).
// Titre → Arène solo → le panneau des réglages de la partie (onglets Carte : zone et sa vignette, heure, météo ; Partie : format,
// réapparition ou « dernier debout » et manches, durée, score, vie, tir allié, objets, aide ; Robots ; Armes), sauvegardé dans poncin.v2
// et passé au jeu normalisé → le HUD de la partie réglée (manches, « Encore en lice », tir auto grisé) → « Par défaut » → le choix de
// l'équipement (principale + secondaire parmi les armes permises, libellés de PREGLES.ARMES) → joystick, visée au doigt, tir sur un robot →
// élimination → le HUD des manches, de la zone et du tableau à 6 lignes (sur un jeu factice au contrat des règles) → fin de partie →
// record lu par la Salle de jeux → en portrait : le panneau, puis « Tourne ton téléphone ».
// Captures du panneau (paysage 844 × 390 et portrait 390 × 844) dans test/shots/poncin, ou dans $CAPTURES.
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-play.cjs   (PORT_PLAY : le port du serveur de test)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORT = +process.env.PORT_PLAY || 9091; // (8791 + 300 : plusieurs groupes testent en même temps)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'poncin'); fs.mkdirSync(out, { recursive: true });
const capt = process.env.CAPTURES || out; fs.mkdirSync(capt, { recursive: true }); // les captures du panneau des réglages
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

  // ─── les réglages de la partie en solo : Modes → le panneau (onglets), sauvegardés, passés au jeu normalisés ───
  await P(() => window.__poncin.montrer('modes')); await sleep(300);
  const resume0 = await P(() => Array.from(document.querySelectorAll('#resume-solo .rp-l')).map((b) => ({ o: b.dataset.onglet, t: b.textContent.trim() })));
  check(resume0.map((r) => r.o).join(',') === 'carte,partie,robots,armes', `la carte Arène résume les réglages, une ligne par onglet (${resume0.map((r) => r.t.replace(/\s+/g, ' ')).join(' | ')})`);
  await page.screenshot({ path: capt + '/panneau-paysage-0-menu.png' });
  await page.tap('#resume-solo [data-onglet="carte"]'); await sleep(400);
  const vg = () => P(() => { const c = document.querySelector('#op-vignette'); if (!c || !c.width) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0, n = 0; const vus = new Set(); for (let i = 0; i < d.length; i += 4 * 97) { h = (h * 31 + d[i] * 3 + d[i + 1] * 7 + d[i + 2]) >>> 0; vus.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); n++; } return { h, couleurs: vus.size, w: c.width, nom: document.querySelector('#op-vignette-nom').textContent }; });
  const op0 = await P(() => ({ ecran: document.body.dataset.ecran, onglet: document.querySelector('#e-options [role="tab"][aria-selected="true"]').dataset.onglet, zones: Array.from(document.querySelectorAll('#op-zones .op-zone')).map((b) => ({ v: b.dataset.v, nom: b.querySelector('b').textContent, on: b.getAttribute('aria-pressed') === 'true' })), lecture: !document.querySelector('#op-lecture').hidden, pages: Array.from(document.querySelectorAll('#e-options .op-page')).filter((p) => !p.hidden).map((p) => p.dataset.page) }));
  const v0 = await vg();
  check(op0.ecran === 'options' && op0.onglet === 'carte' && op0.pages.join() === 'carte' && !op0.lecture, 'la ligne « Carte » ouvre le panneau sur l’onglet Carte (réglable : on est seul)');
  check(op0.zones.length === 6 && op0.zones.find((z) => z.on).v === 'centre', `six zones, « ${(op0.zones.find((z) => z.on) || {}).nom} » par défaut (${op0.zones.map((z) => z.nom).join(', ')})`);
  check(v0 && v0.couleurs > 12 && /village/i.test(v0.nom), `la vignette montre la zone sur la carte (${v0 ? v0.couleurs : 0} couleurs, « ${v0 && v0.nom} »)`);
  await page.screenshot({ path: capt + '/panneau-paysage-1-carte.png' });
  await page.tap('#op-zones [data-v="eglise"]'); await sleep(200);
  await page.tap('#e-options [data-k="heure"][data-v="nuit"]'); await page.tap('#e-options [data-k="meteo"][data-v="pluie"]'); await sleep(200);
  const v1 = await vg();
  check(v1 && v1.h !== v0.h && /église/i.test(v1.nom), `une autre zone, une autre vignette (« ${v1 && v1.nom} »)`);
  await page.screenshot({ path: capt + '/panneau-paysage-2-carte-eglise-nuit.png' });
  // Partie : « dernier debout » en 5 manches, ∞, costaud, en équipes avec tir allié, sans objets, sans aide
  await page.tap('#e-options [data-onglet="partie"]'); await sleep(250);
  const p0 = await P(() => ({ manches: document.querySelector('#e-options [data-k="manches"][data-v="5"]').disabled, tir: document.querySelector('#e-options [data-k="tirAllie"][data-v="true"]').disabled, score: document.querySelector('#e-options [data-k="score"][data-v="10"]').disabled }));
  check(p0.manches && p0.tir && !p0.score, 'Partie : « Manches » grisées sans « Dernier debout », « Tir allié » grisé chacun pour soi');
  for (const [k, v] of [['reapparition', 'aucune'], ['manches', '5'], ['duree', '0'], ['vie', 'costaud'], ['equipes', 'true'], ['tirAllie', 'true'], ['objets', 'false'], ['aide', 'false']]) { await page.tap(`#e-options [data-k="${k}"][data-v="${v}"]`); await sleep(120); }
  const p1 = await P(() => ({ score: document.querySelector('#e-options [data-k="score"][data-v="10"]').disabled, presses: Array.from(document.querySelectorAll('#e-options .op-partie [aria-pressed="true"]')).map((b) => b.dataset.k + '=' + b.dataset.v) }));
  check(p1.score && ['reapparition=aucune', 'manches=5', 'duree=0', 'vie=costaud', 'equipes=true', 'tirAllie=true', 'objets=false', 'aide=false'].every((x) => p1.presses.indexOf(x) >= 0), `Partie réglée (${p1.presses.join(', ')}) ; « Premier à » grisé en « Dernier debout »`);
  await page.screenshot({ path: capt + '/panneau-paysage-3-partie.png' });
  await page.tap('#e-options [data-onglet="robots"]'); await sleep(250);
  const r0 = await P(() => Array.from(document.querySelectorAll('#e-options button[data-k="bots"]')).map((b) => b.dataset.v).join(','));
  check(r0 === '1,2,3,4,5', `Robots : de 1 à 5 en solo (6 joueurs au plus) (${r0})`);
  await page.tap('#e-options [data-k="bots"][data-v="2"]'); await page.tap('#e-options [data-k="niveau"][data-v="fort"]'); await sleep(200);
  await page.screenshot({ path: capt + '/panneau-paysage-4-robots.png' });
  await page.tap('#e-options [data-onglet="armes"]'); await sleep(250);
  check(await P(() => document.querySelectorAll('#op-armes .ar-choisir').length === PREGLES.ARMES.length && !document.querySelector('#op-armes').hidden), 'Armes : l’écran des armes permises, dans le panneau');
  await page.screenshot({ path: capt + '/panneau-paysage-5-armes.png' });
  const deb = await P(() => { const r = document.querySelector('#e-options').getBoundingClientRect(), out = []; for (const o of ['carte', 'partie', 'robots']) { const pg = document.querySelector(`#e-options .op-page[data-page="${o}"]`); pg.hidden = false; for (const b of pg.querySelectorAll('button')) { const q = b.getBoundingClientRect(); if (q.width && (q.right > r.right + 1 || q.left < r.left - 1)) out.push(o + ':' + b.textContent); } pg.hidden = o !== 'armes'; } document.querySelector('#op-armes').hidden = false; return out; });
  check(!deb.length, `paysage : aucun bouton ne déborde du panneau${deb.length ? ' (' + deb.join(', ') + ')' : ''}`);
  const sv = await P(() => ({ s: window.__poncin.sauvegarde().choix.reglages, ls: JSON.parse(localStorage.getItem('poncin.v2')).choix.reglages }));
  const attendu = { v: 2, zone: 'eglise', heure: 'nuit', meteo: 'pluie', reapparition: 'aucune', manches: 5, duree: 0, vie: 'costaud', equipes: true, tirAllie: true, objets: false, aide: false, bots: 2, niveau: 'fort' };
  check(Object.keys(attendu).every((k) => sv.s[k] === attendu[k] && sv.ls[k] === attendu[k]), `sauvegardés dans poncin.v2 (choix.reglages : ${Object.keys(attendu).map((k) => k + ' ' + sv.ls[k]).join(', ')})`);
  await page.tap('#e-options [data-a="options-retour"]'); await sleep(300);
  const resume1 = await P(() => ({ ecran: document.body.dataset.ecran, l: Array.from(document.querySelectorAll('#resume-solo .rp-v')).map((b) => b.textContent), phrase: document.querySelector('#resume-arene').textContent }));
  check(resume1.ecran === 'modes' && /église/.test(resume1.l[0]) && /Nuit/.test(resume1.l[0]) && /Pluie/.test(resume1.l[0]) && /dernier debout, 5 manches/.test(resume1.l[1]) && /2 robots redoutables/.test(resume1.l[2]) && /robot allié/.test(resume1.phrase), `retour au menu, qui les résume (${resume1.l.join(' | ')} ; « ${resume1.phrase} »)`);
  // la partie réglée : PJEU.creer reçoit les réglages normalisés ; le HUD montre la manche et « Encore en lice »
  await P(() => { window.__creer = null; const c = PJEU.creer; PJEU.creer = (o) => { window.__creer = JSON.parse(JSON.stringify(o.options)); PJEU.creer = c; return c(o); }; });
  await page.tap('#b-lancer'); await sleep(300);
  await P(() => { window.__poncin.pas(1); const m = window.__poncin.joueur(); if (m) m.invincible = 60; }); await sleep(300);
  const opts = await P(() => window.__creer);
  check(opts && Object.keys(attendu).every((k) => opts[k] === attendu[k]) && Array.isArray(opts.armes) && opts.armes.length > 1, `le jeu reçoit les réglages normalisés (options : ${opts ? Object.keys(attendu).map((k) => k + ' ' + opts[k]).join(', ') : '—'})`);
  const hud1 = await P(() => { const j = window.__poncin.jeu(); return { manche: document.querySelector('#hud .h-manche').textContent, mancheVue: !document.querySelector('#hud .h-manche').hidden, obj: document.querySelector('#hud .h-chrono small').textContent, chrono: document.querySelector('#hud .h-chrono b').textContent, reste: typeof j.reste, bots: j.entites.filter((e) => e.bot).length, equipes: !!j.options.equipes }; });
  check(hud1.bots === 2 && hud1.equipes, `la partie a 2 robots, en équipes`);
  check(hud1.mancheVue && hud1.manche === 'Manche 1/5' && /Encore en lice : 3/.test(hud1.obj), `HUD « dernier debout » : « ${hud1.manche} », « ${hud1.obj} »`);
  check(hud1.reste === 'number' ? /^\d+:\d\d$/.test(hud1.chrono) : hud1.chrono === '∞', `chrono : « ${hud1.chrono} » (${hud1.reste === 'number' ? 'le jeu compte encore son temps : la durée 0 attend jeu.reglages du groupe des règles' : 'sans limite'})`);
  await page.screenshot({ path: capt + '/hud-partie-reglee.png' });
  await P(() => window.__poncin.pause()); await sleep(200); await page.tap('#e-pause [data-a="reglages"]'); await sleep(300);
  const ta = await P(() => { const l = document.querySelector('#reg-tirauto'); return { dis: l.querySelector('input').disabled, txt: l.querySelector('small').textContent }; });
  check(ta.dis && /coupée/i.test(ta.txt), `aide à la visée coupée : le tir auto est grisé (« ${ta.txt} »)`);
  await P(() => window.__poncin.menu()); await sleep(200);
  // « Par défaut » : tout revient au défaut (les armes permises restent)
  await P(() => window.__poncin.montrer('modes')); await sleep(200);
  await page.tap('#resume-solo [data-onglet="partie"]'); await sleep(300); await page.tap('#op-defaut'); await sleep(200);
  const def = await P(() => window.__poncin.sauvegarde().choix.reglages);
  check(def.zone === 'centre' && def.reapparition === 'rapide' && def.duree === 180 && def.aide === true && def.bots === 4 && def.heure === 'jour', `« Par défaut » remet les réglages (zone ${def.zone}, ${def.bots} robots ${def.niveau}, réapparition ${def.reapparition})`);
  await page.tap('#e-options [data-a="options-retour"]'); await sleep(200);

  // ─── le choix de l'équipement : Modes → l'onglet Armes ; une arme décochée n'est plus permise ───
  await P(() => window.__poncin.montrer('modes')); await sleep(300);
  await page.tap('#resume-solo [data-onglet="armes"]'); await sleep(300);
  const ar = await P(() => ({ ecran: document.body.dataset.ecran, p: Array.from(document.querySelectorAll('#ar-principales .ar-choisir')).map((b) => ({ id: b.dataset.id, nom: b.querySelector('b').textContent, ok: !b.disabled })), s: Array.from(document.querySelectorAll('#ar-secondaires .ar-choisir')).map((b) => ({ id: b.dataset.id, nom: b.querySelector('b').textContent, ok: !b.disabled })),
    ref: PREGLES.ARMES.map((a) => ({ id: a.id, nom: a.nom, role: a.role })), permises: document.querySelectorAll('#e-options .ar-permise').length }));
  const refP = ar.ref.filter((a) => a.role === 'principale'), refS = ar.ref.filter((a) => a.role === 'secondaire');
  check(ar.ecran === 'options' && ar.p.length === refP.length && ar.s.length === refS.length && ar.p.every((c, i) => c.id === refP[i].id && c.nom === refP[i].nom), `l’écran des armes : ${ar.p.length} principales, ${ar.s.length} secondaires, libellés de PREGLES.ARMES (${ar.p.map((c) => c.nom).join(', ')})`);
  check(ar.permises === ar.p.length + ar.s.length, 'en solo, chaque arme a sa case « permise »');
  const choixP = ar.p.filter((c) => c.ok)[1] || ar.p[0], choixS = ar.s.filter((c) => c.ok).slice(-1)[0] || ar.s[0], interdite = ar.p.filter((c) => c.ok && c.id !== choixP.id).slice(-1)[0];
  await page.tap(`#ar-principales .ar-choisir[data-id="${choixP.id}"]`); await page.tap(`#ar-secondaires .ar-choisir[data-id="${choixS.id}"]`);
  if (interdite) await page.tap(`#ar-principales .ar-permise[data-id="${interdite.id}"]`);
  await sleep(200);
  const ar2 = await P((x) => ({ sauv: window.__poncin.sauvegarde().choix, choisies: Array.from(document.querySelectorAll('#e-options .ar-carte.choisie .ar-choisir')).map((b) => b.dataset.id), interdite: x ? document.querySelector(`#ar-principales .ar-choisir[data-id="${x}"]`).disabled : true }), interdite && interdite.id);
  check(ar2.sauv.equip.p === choixP.id && ar2.sauv.equip.s === choixS.id && ar2.choisies.indexOf(choixP.id) >= 0 && ar2.choisies.indexOf(choixS.id) >= 0, `choisies et sauvegardées : ${choixP.nom} + ${choixS.nom}`);
  check(!interdite || (ar2.interdite && ar2.sauv.reglages.armes.indexOf(interdite.id) < 0), `décochée, ${interdite ? interdite.nom : '—'} n’est plus permise (ni prenable)`);
  await page.screenshot({ path: out + '/01b-armes.png' });
  await page.tap('#e-options [data-a="options-retour"]'); await sleep(300);
  const pil = await P(() => ({ ecran: document.body.dataset.ecran, txt: document.querySelector('#resume-solo [data-onglet="armes"]').textContent }));
  check(pil.ecran === 'modes' && pil.txt.includes(choixP.nom) && pil.txt.includes(choixS.nom), `retour au menu, qui le rappelle : « ${pil.txt} »`);
  await P(() => window.__poncin.montrer('titre'));

  // ─── la partie : Arène solo, 3 robots faciles, graine fixe ───
  const st0 = await P(() => window.__poncin.demarrer({ bots: 3, niveau: 'facile', graine: 7 }));
  check(!!st0, 'une partie d’Arène démarre (3 robots faciles)');
  // protégé dès le départ (jusqu'à notre premier tir) : armés de vraies armes, les robots nous élimineraient pendant le parcours du
  // joystick (une pompe tue d'un coup à moins de 8 m) et l'on tirerait en attendant de réapparaître, puis loin de la cible
  await P(() => { window.__poncin.joueur().invincible = 60; window.__poncin.pas(2); }); await sleep(800);
  const j0 = await P(() => { const m = window.__poncin.joueur(), jeu = window.__poncin.jeu(); return { x: m.x, z: m.z, yaw: m.yaw, bots: jeu.entites.filter((e) => e.bot).length, arene: jeu.arene ? { c: jeu.arene.centre, r: jeu.arene.rayon } : null, ecran: document.body.dataset.ecran }; });
  check(j0.bots === 3 && j0.ecran === 'partie', `en partie, avec ${j0.bots} robots`);
  const eqPartie = await P(() => { const m = window.__poncin.joueur(); return { equip: m.equip, armes: m.armes.slice(), arme: m.arme, hud: Array.from(document.querySelectorAll('#hud .h-arme')).map((b) => b.getAttribute('aria-label')) }; });
  check(eqPartie.equip && eqPartie.armes[0] === choixP.id && eqPartie.armes[1] === choixS.id && eqPartie.arme === choixP.id, `on part avec son équipement, la principale en main (${eqPartie.armes.join(' + ')})`);
  check(eqPartie.hud.length === 2 && eqPartie.hud[0].includes(choixP.nom) && eqPartie.hud[1].includes(choixS.nom), `le HUD montre les deux emplacements (${eqPartie.hud.join(' ; ')})`);
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
    // on le pose à 8 m de nous, sur un point libre et en vue (il bouge ensuite : la visée le suit)
    const m = p.joueur(); if (!m.vivant) return null; let ok = null;
    for (let a = 0; a < 16 && !ok; a++) { const yaw = a * Math.PI / 8, x = m.x - Math.sin(yaw) * 8, z = m.z - Math.cos(yaw) * 8; if (!jeu.monde.bloque(x, z, 0.5) && jeu.monde.vue(m.x, m.y + 1.6, m.z, x, jeu.monde.hauteur(x, z) + 1.2, z)) ok = [x, z]; }
    if (!ok) return null;
    b.x = ok[0]; b.z = ok[1]; b.y = jeu.monde.hauteur(ok[0], ok[1]); b.invincible = 0; b.vie = 100; b.armure = 0;
    // les autres robots, loin dès maintenant : le doigt posé sur Tir, la boucle d'images tire (et lève la protection) avant le premier
    // pas de l'essai ; un robot resté près de nous (une pompe à moins de 8 m) nous repeindrait dans ce pas-là
    for (const o of jeu.entites) if (o.bot && o !== b) { o.x = m.x + 90; o.z = m.z + 90; }
    p.viser(b.id); return { id: b.id, nom: b.nom };
  });
  check(!!cible, 'en vie, un robot posé à 8 m, dans le viseur');
  const tir = await page.evaluate(() => { const b = document.querySelector('.pc-tir'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  check(!!tir, 'le bouton Tir est là');
  let touche = false, elimine = false;
  if (cible && tir) {
    const vie0 = await P((id) => window.__poncin.jeu().entites.find((e) => e.id === id).vie, cible.id);
    await toucher('touchStart', [[tir[0], tir[1], 21]]);
    for (let k = 0; k < 40 && !elimine; k++) {
      // notre premier tir lève la protection : on tient les autres robots loin pendant tout l'essai
      await P((id) => { const p = window.__poncin, m = p.joueur(); for (const o of p.jeu().entites) if (o.bot && o.id !== id) { o.x = m.x + 90; o.z = m.z + 90; } p.viser(id); p.pas(3); }, cible.id);
      const b = await P((id) => { const e = window.__poncin.jeu().entites.find((x) => x.id === id); return { vie: e.vie, vivant: e.vivant }; }, cible.id);
      if (b.vie < vie0) touche = true; if (!b.vivant) elimine = true;
    }
    await toucher('touchEnd', []);
  }
  check(touche, 'le bouton Tir touche le robot');
  check(elimine, 'le robot est repeint (éliminé)');
  await sleep(300); await page.screenshot({ path: out + '/03-elimination.png' });
  const fil = await P(() => document.querySelector('#hud') ? document.querySelector('#hud').innerText : '');
  check(cible && fil.split('\n').some((l) => l.includes(cible.nom) && /Tu as repeint/.test(l)), 'le fil des éliminations le dit : ' + (fil.split('\n').find((l) => cible && l.includes(cible.nom)) || '—'));

  // ─── le HUD des manches, de la zone et du tableau des scores, sur un jeu factice au contrat des règles (jeu.reglages, jeu.manche,
  // jeu.zone, événements 'manche') : la boucle est arrêtée le temps de l'essai, puis le HUD revient à la vraie partie ───
  await P(() => window.__poncin.manuel(true));
  const faux = await P(() => {
    const vrai = window.__poncin.jeu(), m = window.__poncin.joueur();
    const es = vrai.entites.map((e) => Object.assign({}, e, { score: Object.assign({}, e.score) }));
    for (let k = 0; es.length < 6; k++) { const b = Object.assign({}, es[1 + (k % 3)], { id: 'faux' + k, nom: ['Gyro', 'Pixel'][k] || 'Robot', score: { kills: k, morts: 1, points: 100 * k, manches: 0 } }); es.push(b); }
    es.forEach((e, i) => { e.score.manches = i === 1 ? 1 : 0; });
    const f = { entites: es, temps: 30, monde: vrai.monde, mode: vrai.mode, options: vrai.options, reglages: Object.assign({}, vrai.options, { reapparition: 'aucune', manches: 3, duree: 0, score: 25 }),
      manche: { n: 2, total: 3, enLice: [m.id, es[1].id, es[2].id] }, zone: { id: 'rivieres', limite: { forme: 'cercles', cercles: [[m.x + 50, m.z, 52], [m.x + 120, m.z + 10, 45]] }, englobant: { centre: [m.x + 80, m.z], rayon: 110 } } };
    window.__faux = f;
    PHUD.reinit({ equipes: false, reglages: f.reglages });
    PHUD.maj(f, m.id, [], null);
    const zone = PHUD.zone, limite = !document.querySelector('#hud .h-limite').hidden;
    PHUD.maj(f, m.id, [{ t: 'manche', quoi: 'debut', n: 2, total: 3 }, { t: 'annonce', texte: 'Manche 2 !' }], null);
    const debut = { t: document.querySelector('#hud .h-bandeau-t').textContent, s: document.querySelector('#hud .h-bandeau-s').textContent, vu: document.querySelector('#hud .h-bandeau').classList.contains('vu'), annonce: document.querySelector('#hud .h-annonce').classList.contains('vu') };
    const haut = { manche: document.querySelector('#hud .h-manche').textContent, obj: document.querySelector('#hud .h-chrono small').textContent, chrono: document.querySelector('#hud .h-chrono b').textContent };
    f.temps += 0.5; f.manche.enLice = [m.id, es[1].id];
    PHUD.maj(f, m.id, [{ t: 'manche', quoi: 'fin', n: 2, total: 3, vainqueur: es[1].id }], null);
    const fin = { t: document.querySelector('#hud .h-bandeau-t').textContent, s: document.querySelector('#hud .h-bandeau-s').textContent, obj: document.querySelector('#hud .h-chrono small').textContent };
    // la limite v2 en arêtes : à 1 m d'une arête, l'avertissement
    f.zone = { id: 'tout', limite: { aretes: [[m.x - 20, m.z + 1, m.x + 20, m.z + 1]], dedans: () => true } }; f.temps += 0.5;
    PHUD.maj(f, m.id, [], null);
    const aretes = { limite: !document.querySelector('#hud .h-limite').hidden, zone: PHUD.zone };
    f.zone = { id: 'rivieres', limite: { forme: 'cercles', cercles: [[m.x + 50, m.z, 52], [m.x + 120, m.z + 10, 45]] }, englobant: { centre: [m.x + 80, m.z], rayon: 110 } }; f.temps += 0.5;
    PHUD.maj(f, m.id, [{ t: 'manche', quoi: 'debut', n: 2, total: 3 }], null);
    return { zone, limite, debut, haut, fin, aretes, n: es.length };
  });
  check(faux.zone && Math.abs(faux.zone.englobant.r - 110) < 1e-6 && faux.zone.fond === faux.zone.cle && /;/.test(faux.zone.cle), `minicarte : la zone de jeu.zone (deux cercles) est peinte, le fond suit son englobant (${faux.zone && faux.zone.englobant.r} m)`);
  check(faux.limite, '« Limite de la zone » à 2 m du bord d’une zone en cercles');
  check(faux.aretes.limite && faux.aretes.zone && /^\|\|\|4:/.test(faux.aretes.zone.cle), `« Limite de la zone » à 1 m d’une limite en arêtes (forme v2 ; ${faux.aretes.zone && faux.aretes.zone.cle})`);
  check(faux.haut.manche === 'Manche 2/3' && faux.haut.obj === 'Encore en lice : 3' && faux.haut.chrono === '∞', `en haut : « ${faux.haut.manche} », « ${faux.haut.obj} », chrono « ${faux.haut.chrono} » (jeu.reste indéfini, durée 0)`);
  check(faux.debut.vu && faux.debut.t === 'Manche 2/3' && !faux.debut.annonce, `bandeau de début : « ${faux.debut.t} · ${faux.debut.s} » (l’annonce du même pas n’est pas doublée)`);
  check(/gagne la manche/.test(faux.fin.t) && /Manche 2\/3/.test(faux.fin.s) && faux.fin.obj === 'Encore en lice : 2', `bandeau de fin : « ${faux.fin.t} · ${faux.fin.s} », « ${faux.fin.obj} »`);
  await sleep(500); await page.screenshot({ path: capt + '/hud-manche-paysage.png' });
  const tab = await P(() => { PHUD.scores(true); const t = document.querySelector('#hud .h-scores-carte'); return { lignes: t.querySelectorAll('tbody tr').length, obj: (t.querySelector('.h-obj') || {}).textContent, cols: Array.from(t.querySelectorAll('thead th')).map((h) => h.textContent).join(','), haut: t.getBoundingClientRect().height, h: innerHeight }; });
  check(tab.lignes === 6 && /Manches/.test(tab.cols) && /Dernier debout · manche 2\/3/.test(tab.obj) && tab.haut <= tab.h, `tableau des scores : 6 lignes, ${tab.cols}, « ${tab.obj} », tient dans l’écran (${Math.round(tab.haut)} px sur ${tab.h})`);
  await sleep(200); await page.screenshot({ path: capt + '/hud-scores-6-paysage.png' });
  const tab2 = await P(() => { PHUD.scores(false); const f = window.__faux; f.reglages = Object.assign({}, f.reglages, { reapparition: 'rapide', score: 10 }); delete f.manche; f.reste = 95; PHUD.reinit({ reglages: f.reglages }); PHUD.maj(f, window.__poncin.joueur().id, [], null); PHUD.scores(true); const t = document.querySelector('#hud .h-scores-carte'); const r = { obj: t.querySelector('.h-obj').textContent, lignes: t.querySelectorAll('tbody tr').length, haut: document.querySelector('#hud .h-chrono small').textContent }; PHUD.scores(false); return r; });
  check(tab2.lignes === 6 && /^Premier à 10 repeints · 1:35/.test(tab2.obj) && /premier à 10/.test(tab2.haut), `sans « dernier debout » : « ${tab2.obj} », en haut « ${tab2.haut} »`);
  await P(() => { const j = window.__poncin.jeu(); PHUD.reinit({ equipes: false, reglages: j.reglages || j.options }); window.__poncin.manuel(false); });

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
  await p2.goto(URL0); await p2.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await p2.evaluate(() => { window.__poncin.rendu(false); window.__poncin.montrer('modes'); }); await sleep(300);
  await p2.screenshot({ path: capt + '/panneau-portrait-0-menu.png' });
  for (const o of ['carte', 'partie', 'robots', 'armes']) {
    await p2.tap(`#resume-solo [data-onglet="${o}"]`); await sleep(350);
    await p2.screenshot({ path: `${capt}/panneau-portrait-${o}.png` });
    if (o === 'partie') { await p2.evaluate(() => { const e = document.querySelector('#e-options'); e.scrollTop = e.scrollHeight; }); await sleep(150); await p2.screenshot({ path: `${capt}/panneau-portrait-partie-bas.png` }); }
    const ok = await p2.evaluate((x) => { const e = document.querySelector('#e-options'), r = e.getBoundingClientRect(); const pg = document.querySelector(`#e-options .op-page[data-page="${x}"]`); return document.body.dataset.ecran === 'options' && !pg.hidden && document.documentElement.scrollWidth <= innerWidth && Array.from(pg.querySelectorAll('button')).every((b) => { const q = b.getBoundingClientRect(); return q.right <= r.right + 1 && q.left >= r.left - 1; }); }, o);
    check(ok, `portrait : l’onglet ${o} tient en largeur (aucun bouton ne déborde)`);
    await p2.tap('#e-options [data-a="options-retour"]'); await sleep(250);
  }
  await p2.evaluate(() => window.__poncin.rendu(true));
  await p2.evaluate(() => window.__poncin.demarrer({ bots: 3, niveau: 'facile', graine: 3 })); await sleep(700);
  check(await p2.evaluate(() => { const t = document.querySelector('#tourne'); return !!t && getComputedStyle(t).display !== 'none' && t.offsetHeight > 0; }), 'en portrait, en partie : « Tourne ton téléphone »');
  await p2.screenshot({ path: out + '/06-portrait.png' });

  console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'ERRORS none');
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  await browser.close(); server.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
