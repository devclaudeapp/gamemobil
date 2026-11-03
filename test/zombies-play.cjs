// Dernier Rempart : de bout en bout sur un iPhone simulé (la vraie page zombies/index.html, construite par build.js).
// La Salle de jeux montre sa carte → le titre (la partie de démonstration tourne en 3D, le Jardin ouvert, le Parking et la Ferme verrouillés)
// → Jouer → le HUD (vie, vague, ferraille, armes, atelier) → le joystick au doigt fait courir le survivant → la vague arrive, il tire seul →
// une tourelle posée depuis l'atelier → pause (la partie est figée) et reprise → le survivant tombe → l'écran de fin, le record enregistré
// (zombies.v1), relu par le titre et par la Salle de jeux → les dégâts, les atouts, la grenade, les médailles et le Bunker → en portrait,
// « Tourne ton téléphone » et la pause → hors ligne (service worker), le jeu s'ouvre encore.
// Aucune erreur dans la page ; un budget d'appels de dessin avec une vague à l'écran. Captures dans test/shots/zombies (ou $CAPTURES).
// NODE_PATH=/opt/node22/lib/node_modules node test/zombies-play.cjs   (PORT_ZOMBIES : le port du serveur de test)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.glb': 'model/gltf-binary' };
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
  await page.waitForFunction(() => window.__zombies.stats().rendu.modeles === 'pret', null, { timeout: 30000 }).catch(() => {});
  const mod = await P(() => window.__zombies.stats().rendu);
  check(mod.modeles === 'pret' && mod.horde === 'kenney' && mod.survivant === 'kenney' && mod.defenses >= 1, `les modèles 3D sont chargés : horde et survivant Kenney, la tourelle de la démonstration en modèle Kenney (${mod.modeles}, ${mod.horde}, ${mod.defenses} défense)`);
  check(titre.arenes.join(',') === 'jardin:false:true,parking:true:false,ferme:true:false', `le Jardin est ouvert et choisi, le Parking et la Ferme verrouillés (${titre.arenes.join(', ')})`);
  await page.screenshot({ path: out + '/01-titre.png' });

  // ─── jouer ───
  await page.tap('#b-jouer'); await sleep(600);
  const hud = await P(() => ({ ecran: window.__zombies.ecran, hud: !document.querySelector('#hud').hidden, vie: document.querySelector('.h-vie-n').textContent, v: document.querySelector('.h-v').textContent, arme: document.querySelector('.h-arme-nom').textContent, slots: document.querySelectorAll('.h-slot').length, defs: document.querySelectorAll('.h-btn.def').length, ams: document.querySelectorAll('.h-btn.am').length }));
  check(hud.ecran === 'jeu' && hud.hud && hud.vie === '100' && hud.v === 'V1' && hud.arme === 'PISTOLET' && hud.slots === 2 && hud.defs === 10 && hud.ams === 5, `Jouer : le HUD (vie ${hud.vie}, ${hud.v}, ${hud.arme}, 2 armes, atelier de 10 équipements et 5 améliorations)`);
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
  // les chiffres de dégâts sur les zombies touchés
  await page.waitForFunction(() => ZHUD.chiffres.n > 0, null, { timeout: 20000 }).catch(() => {});
  const nums = await P(() => ZHUD.chiffres.derniers);
  check(nums.length > 0 && nums.every((t) => /^(−?\d+|NIVEAU \+1)$/.test(t)), `les dégâts s’affichent sur les zombies touchés (${nums.slice(0, 5).join(', ')})`);
  // le choix d'un atout : la partie attend, une carte touchée l'applique
  await P(() => { const j = window.__zombies.jeu; j.choix = { id: 'moi', options: ['multi', 'critique', 'vie'], niveau: 2 }; });
  await sleep(300);
  const choix = await P(() => ({ visible: !document.querySelector('.h-choix').hidden, cartes: [...document.querySelectorAll('.h-carte-atout b')].map((b) => b.textContent), titre: document.querySelector('.h-choix-t').textContent, t: window.__zombies.jeu.t }));
  await sleep(400);
  check(choix.visible && choix.cartes.join() === 'Tir double,Œil de lynx,Cuir épais' && /NIVEAU 2/.test(choix.titre) && (await P(() => window.__zombies.jeu.t)) === choix.t, `niveau 2 : trois atouts au choix (${choix.cartes.join(', ')}), la partie attend`);
  await page.screenshot({ path: out + '/02c-atout.png' });
  await P(() => { const p = window.__zombies.jeu.joueurs[0]; p.xp = -1e9; p.choixAttente = 1; }); // (pas d'autre niveau en attente derrière celui-ci)
  await page.tap('[data-atout="multi"]'); await sleep(300);
  check(await P(() => window.__zombies.jeu.joueurs[0].atouts.multi === 1 && !window.__zombies.jeu.choix && document.querySelector('.h-choix').hidden), 'toucher « Tir double » le prend, la partie repart');
  // la suite du parcours ne doit pas être coupée par un vrai passage de niveau (la CI tire vite) : plus d'expérience, et un choix en cours est pris
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.xp = -1e9; p.choixAttente = 0; if (j.choix) ZJEU.choisirAtout(j, j.choix.id, j.choix.options[0]); });
  await sleep(150);
  // l'arsenal : une arme de caisse (le fusil Tesla) se tient en modèle 3D (Blaster Kit), son icône au HUD ; l'éclair saute de zombie en zombie
  await page.waitForFunction(() => window.__zombies.stats().rendu.armes === 'pret', null, { timeout: 20000 }).catch(() => {});
  await P(() => { const p = window.__zombies.jeu.joueurs[0]; p.armes[1] = { id: 'tesla', mun: 80 }; p.main = 1; });
  await sleep(500);
  const ars = await P(() => ({ r: window.__zombies.stats().rendu, nom: document.querySelector('.h-arme-nom').textContent, ico: !!document.querySelector('.h-slot[data-i="1"] .ico-arme svg') }));
  check(ars.r.armes === 'pret' && ars.r.tenues.includes('tesla') && /TESLA/i.test(ars.nom) && ars.ico, `l’arme en main en modèle 3D (${ars.r.tenues.join(', ')}), son nom (« ${ars.nom} ») et son icône au HUD`);
  await P(() => { const p = window.__zombies.jeu.joueurs[0]; p.armes[1] = null; p.main = 0; });
  // la grenade
  await page.tap('.h-grenade'); await sleep(200);
  const gren = await P(() => ({ obus: window.__zombies.jeu.obus.some((o) => o.grenade), recharge: window.__zombies.jeu.joueurs[0].grenadeT > 0, prete: document.querySelector('.h-grenade').classList.contains('prete') }));
  check(gren.obus && gren.recharge && !gren.prete, 'le bouton grenade la lance, puis se recharge (grisé)');
  // les zombies en morceaux : un groupe soufflé par une grenade vole en éclats
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.grenadeT = 0; for (let k = 0; k < 6; k++) j.zombies.push({ id: 9700 + k, type: 'trainard', x: p.x + 5 + (k % 3) * 0.5, z: p.z + Math.floor(k / 3) * 0.5, vie: 20, vieMax: 20, vitesse: 0.01, rayon: 0.42, angle: Math.PI, chemin: null, ci: 0, repense: 99, coup: 99, crache: 99, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 }); });
  await page.tap('.h-grenade');
  const eclats = await page.waitForFunction(() => window.__zombies.stats().rendu.morceaux > 0 && window.__zombies.stats().rendu.morceaux, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => 0);
  check(eclats > 0, `la grenade fait voler les zombies en morceaux (${eclats} morceaux)`);
  // en paysage, le HUD tient sans chevauchement (vie, niveau, mini-carte, vague, atelier, armes, grenade)
  const paysage = await P(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect(), dans = (b) => b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1;
    const inter = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const l = { vie: r('.h-vie'), xp: r('.h-xp'), carte: r('.h-carte'), centre: r('.h-centre'), cols: r('.h-cols'), slots: r('.h-slots') };
    const paires = [['xp', 'carte'], ['centre', 'xp'], ['centre', 'carte'], ['cols', 'slots'], ['slots', 'carte'], ['centre', 'cols']].filter(([a, b]) => inter(l[a], l[b]));
    return { dans: Object.values(l).every(dans), paires: paires.map((p) => p.join('/')) };
  });
  check(paysage.dans && !paysage.paires.length, `en paysage, le HUD tient dans l’écran sans chevauchement${paysage.paires.length ? ' (' + paysage.paires.join(', ') + ')' : ''}`);
  // pause et reprise
  await page.tap('.h-pause'); await sleep(200);
  const t0 = await P(() => window.__zombies.jeu.t); await sleep(600); const t1 = await P(() => window.__zombies.jeu.t);
  check(await P(() => !document.querySelector('#ecran-pause').hidden && window.__zombies.enPause) && t1 === t0, 'Pause : l’écran de pause, la partie figée');
  await page.screenshot({ path: out + '/03-pause.png' });
  await page.tap('#b-reprendre'); await sleep(500);
  check(await P(() => document.querySelector('#ecran-pause').hidden && !window.__zombies.enPause) && (await P(() => window.__zombies.jeu.t)) > t1, 'Reprendre : la partie repart');
  // le survivant tombe : l'écran de fin, le record
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; j.choix = null; p.choixAttente = 0; p.vie = 1; p.vieMax = 100; p.invul = 0; for (const z of j.zombies) { z.x = p.x + 0.9; z.z = p.z; z.coup = 0; z.naissance = -9; } });
  await page.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 15000 }).catch(() => {});
  const fin = await P(() => ({ ecran: document.body.dataset.ecran, texte: document.querySelector('#ecran-fin').innerText, save: JSON.parse(localStorage.getItem('zombies.v1') || 'null') }));
  check(fin.ecran === 'fin' && /Submergé/.test(fin.texte) && /Vague atteinte/.test(fin.texte) && /Zombies/.test(fin.texte), 'le survivant tombe : l’écran de fin et ses chiffres');
  check(fin.save && fin.save.v === 1 && fin.save.records.jardin && fin.save.records.jardin.vague === 1 && fin.save.records.jardin.parties === 1 && fin.save.total.parties === 1, 'le record est enregistré (zombies.v1 : Jardin, vague 1, une partie)');
  check(/\+\d+ médailles? pour le Bunker/.test(fin.texte) && fin.save.meta && fin.save.meta.medailles >= 2, `l’écran de fin donne les médailles du Bunker (${fin.save.meta ? fin.save.meta.medailles : 0})`);
  await page.screenshot({ path: out + '/04-fin.png' });
  await page.tap('#b-menu'); await sleep(700);
  check(/Record : vague 1/.test(await P(() => document.querySelector('[data-arene="jardin"]').innerText)), 'le titre montre le record du Jardin');
  await page.goto(BASE); await sleep(500);
  const carte = await P(() => document.querySelector('[data-jeu="zombies"]').innerText);
  check(/Record : vague 1 dans le Jardin/.test(carte) && /1 partie/.test(carte) && /Continuer/.test(carte), 'la Salle de jeux relit le record (« Record : vague 1 dans le Jardin », « Continuer »)');

  // ─── le Bunker : 50 médailles, le Gilet renforcé acheté, la partie suivante commence avec 10 points de vie de plus ───
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 20000 }).catch(() => {});
  await P(() => { const s = JSON.parse(localStorage.getItem('zombies.v1')); s.meta = { medailles: 50, gagnees: 50, bunker: {} }; localStorage.setItem('zombies.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 20000 }).catch(() => {});
  check(/50/.test(await P(() => document.querySelector('#titre-medailles').textContent)), 'le titre montre les médailles');
  await page.tap('#b-bunker'); await sleep(300);
  const bunker = await P(() => ({ n: document.querySelectorAll('.amelio').length, visible: !document.querySelector('#ecran-bunker').hidden }));
  check(bunker.visible && bunker.n === 6, 'le Bunker propose ses 6 améliorations');
  await page.screenshot({ path: out + '/06-bunker.png' });
  await page.tap('[data-bunker="vie"]'); await sleep(200);
  const achat = await P(() => window.__zombies.save.meta);
  check(achat.bunker.vie === 1 && achat.medailles === 50 - 6, `acheter le Gilet renforcé : cran 1, 6 médailles dépensées (reste ${achat.medailles})`);
  await page.tap('#b-bunker-ok'); await sleep(200);
  check(await P(() => window.__zombies.demarrer('jardin', 9).joueurs[0].vieMax === 110), 'la partie suivante commence avec 110 points de vie');

  // ─── une partie à part : la vague 5 : le premier boss, le Golem squelette (KayKit), son nom dans la barre du boss
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && window.__zombies.stats().rendu.modeles === 'pret', null, { timeout: 30000 }).catch(() => {});
  await P(() => { const j = window.__zombies.demarrer('jardin', 7); j.joueurs[0].vie = j.joueurs[0].vieMax = 1e6; j.vague = 4; j.phase = 'vague'; j.aSortir = 0; });
  await page.waitForFunction(() => window.__zombies.jeu.phase === 'pause', null, { timeout: 10000 }).catch(() => {});
  await page.tap('.h-lancer'); await sleep(300);
  await page.waitForFunction(() => window.__zombies.stats().rendu.boss.includes('golem'), null, { timeout: 40000 }).catch(() => {});
  await sleep(600);
  const boss = await P(() => ({ v: window.__zombies.jeu.vague, rendu: window.__zombies.stats().rendu, barre: !document.querySelector('.h-boss').hidden, nom: document.querySelector('.h-boss span').textContent }));
  check(boss.v === 5 && boss.rendu.boss.includes('golem') && boss.barre && boss.nom === 'GOLEM SQUELETTE', `vague 5 : le Golem squelette arrive en modèle KayKit, sa barre de vie porte son nom (« ${boss.nom} »)`);
  check(boss.rendu.calls <= 70, `${boss.rendu.calls} appels de dessin avec le boss et la horde (≤ 70)`);
  await page.screenshot({ path: out + '/02b-boss.png' });
  // le coup de grâce : le boss tombe au ralenti, la caméra plonge
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.xp = -1e9; p.choixAttente = 0; j.choix = null; p.choix = null; for (const zb of j.zombies) if (zb.type !== 'golem') zb.vie = 0; j.zombies = j.zombies.filter((zb) => zb.vie > 0); const g = j.zombies.find((zb) => zb.type === 'golem'); if (g) { g.vie = 3; g.x = p.x + 4; g.z = p.z; g.naissance = -9; } });
  const grace = await page.waitForFunction(() => { const s = window.__zombies.stats(); return s.ralenti && s.rendu.cinema ? s : null; }, null, { timeout: 15000, polling: 50 }).then((h) => h.jsonValue()).catch(() => null);
  check(!!grace, 'le coup de grâce sur le boss : ralenti et plongée de la caméra');
  await page.screenshot({ path: out + '/02d-coup-de-grace.png' });
  // ─── à la manette (une manette simulée : Gamepad API) : le stick fait courir, Start met en pause, A reprend ───
  await P(() => {
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad; navigator.getGamepads = () => [pad]; window.dispatchEvent(new Event('gamepadconnected'));
    const j = window.__zombies.demarrer('jardin', 21); j.joueurs[0].vie = j.joueurs[0].vieMax = 1e6;
  });
  await sleep(300);
  const mx0 = await P(() => window.__zombies.jeu.joueurs[0].x);
  await P(() => { window.__pad.axes[0] = 1; }); await sleep(700); await P(() => { window.__pad.axes[0] = 0; });
  const mx1 = await P(() => window.__zombies.jeu.joueurs[0].x);
  await P(() => { window.__pad.buttons[9].pressed = true; }); await sleep(150); await P(() => { window.__pad.buttons[9].pressed = false; }); await sleep(150);
  const mPause = await P(() => window.__zombies.enPause);
  await P(() => { window.__pad.buttons[0].pressed = true; }); await sleep(150); await P(() => { window.__pad.buttons[0].pressed = false; }); await sleep(200);
  const repris = await P(() => !window.__zombies.enPause);
  check(mx1 > mx0 + 1.5 && mPause && repris, `à la manette : le stick fait courir (${mx0.toFixed(1)} → ${mx1.toFixed(1)} m), Start met en pause, A reprend`);
  await P(() => { navigator.getGamepads = () => []; });
  // le joystick fixe (Réglages) : sa base attend en bas à gauche, le pouce posé dessus fait courir
  await page.tap('.h-pause'); await sleep(150); await page.tap('#b-pause-reglages'); await sleep(150);
  await page.selectOption('#r-joy', 'fixe'); await page.selectOption('#r-joyt', 'grand'); await page.tap('#b-reglages-ok'); await sleep(150); await page.tap('#b-reprendre'); await sleep(250);
  const fixe = await P(() => { const j = document.querySelector('.joy'), r = j.getBoundingClientRect(); return { vu: !j.hidden && j.classList.contains('fixe'), x: r.left, y: r.top, k: getComputedStyle(j).getPropertyValue('--joy'), save: window.__zombies.save.reglages }; });
  const fx0 = await P(() => window.__zombies.jeu.joueurs[0].x);
  await toucher('touchStart', [[fixe.x, fixe.y, 5]]); await toucher('touchMove', [[fixe.x + 70, fixe.y, 5]]); await sleep(600); await toucher('touchEnd', []);
  const fx1 = await P(() => window.__zombies.jeu.joueurs[0].x);
  check(fixe.vu && fixe.x < 300 && fixe.y > 200 && +fixe.k > 1.2 && fixe.save.joy === 'fixe' && fixe.save.joyt === 'grand' && fx1 > fx0 + 1, `commandes réglables : joystick fixe en bas à gauche, en grand (${fx0.toFixed(1)} → ${fx1.toFixed(1)} m)`);
  await P(() => ZCONTROLES.regler({ fixe: false, taille: 'normal' }));
  // ─── en portrait : « Tourne ton téléphone », la partie attend en pause ───
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 20000 }).catch(() => {});
  await sleep(600);
  check(await P(() => getComputedStyle(document.querySelector('#tourne')).display !== 'none' && /Tourne ton téléphone/.test(document.querySelector('#tourne').innerText)), 'en portrait, l’écran « Tourne ton téléphone » couvre le jeu');
  await P(() => window.__zombies.demarrer('jardin', 5)); await sleep(800);
  check(await P(() => window.__zombies.enPause && window.__zombies.portrait), 'une partie lancée en portrait reste en pause');
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(500);
  check(await P(() => getComputedStyle(document.querySelector('#tourne')).display === 'none'), 'tourné à l’horizontale, l’écran disparaît');
  await page.tap('#b-reprendre');
  await page.waitForFunction(() => window.__zombies.jeu.t > 0.3, null, { timeout: 10000 }).catch(() => {});
  check(await P(() => !window.__zombies.enPause && window.__zombies.jeu.t > 0.3), 'et la partie reprend');
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  await page.screenshot({ path: out + '/05-portrait.png' });
  check(errors.length === 0, `aucune erreur dans la page${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await context.close();

  // ─── sans les modèles (fichiers absents) : le jeu garde ses formes faites main, sans erreur ───
  const ctx3 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  await ctx3.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); await ctx3.route(/\/modeles\//, (r) => r.fulfill({ status: 404, body: '' }));
  const p3 = await ctx3.newPage(); const err3 = []; p3.on('pageerror', (e) => err3.push(e.message));
  await p3.goto(BASE + 'zombies/'); await p3.waitForFunction(() => window.__zombies && window.__zombies.stats().rendu.modeles === 'erreur', null, { timeout: 20000 }).catch(() => {});
  await p3.evaluate(() => { const j = window.__zombies.demarrer('jardin', 2); j.chrono = 0.1; }); await sleep(4000);
  const repli = await p3.evaluate(() => ({ r: window.__zombies.stats().rendu, z: window.__zombies.jeu.zombies.length }));
  check(repli.r.modeles === 'erreur' && repli.r.horde === 'faite-main' && repli.r.survivant === 'fait-main' && repli.z > 0 && repli.r.calls > 0 && !err3.length, `sans les modèles, la partie tourne avec les formes faites main (${repli.z} zombies, aucune erreur)`);
  await ctx3.close();

  // ─── hors ligne : le service worker garde le jeu ───
  const ctx2 = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, locale: 'fr-FR' });
  await ctx2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + 'zombies/');
  const pret = await p2.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((res) => setTimeout(() => res(false), 15000))]); return r; });
  await sleep(800);
  const cache = await p2.evaluate(async () => { const ks = await caches.keys(), c = ks.find((k) => k.startsWith('zombies-jeu-')); if (!c) return []; return (await (await caches.open(c)).keys()).map((r) => new URL(r.url).pathname); });
  check(pret && cache.some((u) => /vendor\/three\.min\.js$/.test(u)) && cache.some((u) => /vendor\/fournil-hd\.min\.js$/.test(u)) && cache.some((u) => /modeles\/kenney\/zombie\.glb$/.test(u)) && cache.some((u) => /modeles\/kaykit\/golem\.glb$/.test(u)) && cache.some((u) => /zombies\/(index\.html)?$/.test(u)), `le service worker du jeu met la page, Three.js et les modèles 3D en cache (${cache.length} fichiers)`);
  await ctx2.setOffline(true);
  await p2.reload(); await p2.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 20000 }).catch(() => {});
  await sleep(800);
  await p2.waitForFunction(() => window.__zombies.stats().rendu.modeles !== 'charge', null, { timeout: 20000 }).catch(() => {});
  const horsLigne = await p2.evaluate(() => ({ titre: document.body.dataset.ecran, three: typeof THREE !== 'undefined', calls: window.__zombies ? window.__zombies.stats().rendu.calls : 0, modeles: window.__zombies.stats().rendu.modeles }));
  check(horsLigne.titre === 'titre' && horsLigne.three && horsLigne.calls > 0 && horsLigne.modeles === 'pret', 'hors ligne, le jeu s’ouvre encore (page, Three.js et modèles 3D servis par le cache)');
  await p2.evaluate(() => window.__zombies.demarrer('jardin', 1)); await sleep(1500);
  check(await p2.evaluate(() => window.__zombies.jeu && window.__zombies.jeu.t > 0.5), 'et on peut y jouer');
  await ctx2.close();

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s) (Dernier Rempart, Playwright)` : '\nTout passe (Dernier Rempart, Playwright).');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
