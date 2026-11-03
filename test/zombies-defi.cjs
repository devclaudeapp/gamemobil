// Dernier Rempart : le défi du jour de bout en bout (la vraie page zombies/index.html), avec un FAUX supabase-js servi à la place de
// vendor/supabase.min.js (un petit classement en mémoire : aucun réseau). Le bouton du titre (le mutateur du jour) → l'écran du défi
// (mutateur, arène, classement vide, pseudo) → la partie : l'arène, la graine et le mutateur du jour, sans les bonus du Bunker →
// le survivant tombe → la fin : « Défi du jour : … pts · 2e sur 2 », le meilleur score gardé (zombies.v1), parti au classement, les
// records de l'arène intacts → le titre montre le meilleur du jour → l'écran du défi : ma ligne, l'onglet « Cette semaine » →
// le SQL pas collé sur le projet : un message, et le jeu marche. Puis l'Ascension : son écran, une partie, la victoire, l'échelon suivant.
// NODE_PATH=/opt/node22/lib/node_modules node test/zombies-defi.cjs   (PORT_ZOMBIES_DEFI : le port du serveur de test)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const J = require('../src-zombies/jeu.js'), C = require('../src-zombies/classement.js'), D = require('../src-zombies/donnees.js');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const PORT = +process.env.PORT_ZOMBIES_DEFI || 8896;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = process.env.CAPTURES || path.join(__dirname, 'shots', 'zombies'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const BASE = `http://localhost:${PORT}/`;
const JOUR = C.jourParis(Date.now()), DEFI = J.defiDu(JOUR);

// le faux supabase-js : zombies_publier et zombies_classement sur un classement en mémoire (un rival déjà à 999 999 points)
const FAUX = `window.supabase = { createClient: function () { return { rpc: async function (nom, a) {
  var F = window.__faux || (window.__faux = { mode: 'ok', joueurs: { rival: 'Rival' }, scores: { 'rival|${JOUR}': { id: 'rival', jour: '${JOUR}', score: 999999, vague: 40, parties: 3 } }, appels: [] });
  F.appels.push({ nom: nom, a: a });
  if (F.mode === 'pas-installe') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + nom }, status: 404 };
  var du = function (j) { return Object.keys(F.scores).map(function (k) { return F.scores[k]; }).filter(function (s) { return s.jour === j; }).sort(function (x, y) { return y.score - x.score; }); };
  if (nom === 'zombies_publier') {
    F.joueurs[a.p_id] = a.p_pseudo;
    if (!a.p_jour) return { data: { ok: true, erreur: null, jour: '${JOUR}' }, error: null };
    var k = a.p_id + '|' + a.p_jour, o = F.scores[k], record = !o || a.p_score > o.score;
    if (record) F.scores[k] = { id: a.p_id, jour: a.p_jour, score: a.p_score, vague: a.p_vague, parties: (o ? o.parties : 0) + 1 }; else o.parties++;
    var m = F.scores[k], l = du(a.p_jour);
    return { data: { ok: true, erreur: null, jour: a.p_jour, record: record, meilleur: m.score, vague: m.vague, parties: m.parties, rang: l.filter(function (s) { return s.score > m.score; }).length + 1, joueurs: l.length }, error: null };
  }
  if (nom === 'zombies_classement') {
    var lignes = du(a.p_jour || '${JOUR}').map(function (s, i) { return { rang: i + 1, pseudo: F.joueurs[s.id], score: s.score, vague: s.vague, parties: s.parties, moi: s.id === a.p_id }; });
    return { data: { version: 1, periode: a.p_periode, jour: '${JOUR}', lundi: '${C.lundiDe(JOUR)}', joueurs: lignes.length, lignes: lignes, moi: lignes.filter(function (x) { return x.moi; })[0] || null }, error: null };
  }
  return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' }, status: 404 };
} }; } };`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  await context.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  await context.route(/vendor\/supabase\.min\.js/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAUX }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_FAILED|supabase/.test(m.text() + ((m.location() && m.location().url) || ''))) errors.push(m.text()); });
  const P = (f, a) => page.evaluate(f, a);

  // un Bunker déjà bien rempli : le défi doit s'en passer
  await page.goto(BASE + 'zombies/');
  await P(() => localStorage.setItem('zombies.v1', JSON.stringify({ v: 1, records: {}, total: { parties: 0, tues: 0, temps: 0 }, reglages: { son: false, vibre: false, eco: false }, meta: { medailles: 0, gagnees: 0, bunker: { vie: 3, arme: 1 } } })));
  await page.reload();
  await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await sleep(500);
  const sous = await P(() => document.querySelector('.defi-sous').textContent);
  check(sous.includes(DEFI.nom) && /pas encore joué/.test(sous), `le titre : « Défi du jour », le mutateur du jour (${sous})`);

  // l'écran du défi
  await page.tap('#b-defi'); await sleep(400);
  await page.waitForFunction(() => !/Chargement/.test(document.querySelector('.defi-etat').textContent), null, { timeout: 8000 }).catch(() => {});
  const ecr = await P(() => ({ ecran: document.body.dataset.ecran, mut: document.querySelector('.defi-mut').textContent, texte: document.querySelector('.defi-texte').textContent, arene: document.querySelector('.defi-arene').textContent, lignes: [...document.querySelectorAll('.defi-liste li')].map((l) => l.innerText.replace(/\s+/g, ' ')), etat: document.querySelector('.defi-etat').textContent }));
  check(ecr.ecran === 'defi' && ecr.mut === DEFI.nom && ecr.texte === DEFI.texte && ecr.arene.includes(D.ARENES[DEFI.arene].nom) && /Bunker/.test(ecr.arene), `l’écran du défi : ${DEFI.nom} (${DEFI.texte}), ${D.ARENES[DEFI.arene].nom}, sans le Bunker`);
  check(ecr.lignes.length === 1 && /Rival/.test(ecr.lignes[0]) && /choisis un pseudo/.test(ecr.etat), `le classement du jour : ${ecr.lignes.join(' | ')} ; « ${ecr.etat} »`);
  await page.screenshot({ path: out + '/10-defi.png' });
  // dans l'écran du défi, en paysage, tout tient sans défiler la page
  check(await P(() => { const r = document.querySelector('#b-defi-jouer').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), 'le bouton « Relever le défi » est à l’écran');

  // la partie du défi
  await page.fill('#d-pseudo', 'Testeur');
  await page.tap('#b-defi-jouer'); await sleep(600);
  const partie = await P(() => { const z = window.__zombies, j = z.jeu, p = j.joueurs[0]; return { ecran: z.ecran, arene: j.arene, graine: j.graine, mod: j.mod, vieMax: p.vieMax, armes: p.armes.map((a) => a && a.id), defi: z.defi && z.defi.jour, pseudo: z.save.pseudo, annonce: document.body.innerText }; });
  check(partie.ecran === 'jeu' && partie.defi === JOUR && partie.arene === DEFI.arene && partie.graine === DEFI.graine && Object.keys(DEFI.mod).every((k) => k === 'id' || k === 'nom' || k === 'texte' || partie.mod[k] === DEFI.mod[k]), `la partie : l’arène, la graine et le mutateur du jour (${DEFI.mutateur})`);
  check(partie.vieMax === 100 && (DEFI.mod.arme ? partie.armes[1] === DEFI.mod.arme : !partie.armes[1]) && partie.pseudo === 'Testeur', `sans les bonus du Bunker (vie ${partie.vieMax}, armes ${partie.armes.join('/')}) ; le pseudo retenu`);
  // le survivant tombe (avec 5 000 points d'avance)
  await P(() => { const j = window.__zombies.jeu; j.chrono = 0; j.joueurs[0].xp = -1e9; });
  await page.waitForFunction(() => window.__zombies.jeu.zombies.length > 0, null, { timeout: 15000 }).catch(() => {});
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.score += 5000; p.vie = 1; p.invul = 0; for (const z of j.zombies) { z.x = p.x + 0.9; z.z = p.z; z.coup = 0; z.naissance = -9; } });
  await page.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => /sur \d/.test(document.querySelector('.fin-defi').textContent), null, { timeout: 8000 }).catch(() => {});
  const fin = await P(() => ({ ecran: document.body.dataset.ecran, defi: document.querySelector('.fin-defi').textContent, visible: !document.querySelector('.fin-defi').hidden, record: document.querySelector('.fin-record').hidden, save: window.__zombies.save, appels: window.__faux.appels.filter((a) => a.nom === 'zombies_publier').map((a) => a.a) }));
  const sd = fin.save.defi || {};
  check(fin.ecran === 'fin' && fin.visible && /Défi du jour : [\d ]+ pts · 2e sur 2/.test(fin.defi), `la fin : « ${fin.defi} »`);
  check(sd.jour === JOUR && sd.meilleur >= 5000 && sd.parties === 1 && sd.envoye === true && fin.appels.length === 1 && fin.appels[0].p_score === sd.meilleur && fin.appels[0].p_jour === JOUR && fin.appels[0].p_pseudo === 'Testeur', `le meilleur du jour gardé (zombies.v1 : ${sd.meilleur} pts, vague ${sd.vague}) et parti au classement`);
  check(!fin.save.records[DEFI.arene] && fin.record && fin.save.total.parties === 1, 'les records de l’arène ne bougent pas (le défi ne débloque rien), la partie est comptée');
  await page.screenshot({ path: out + '/11-defi-fin.png' });

  // Menu → le titre montre le meilleur du jour ; l'écran du défi : ma ligne
  await page.tap('#b-menu'); await sleep(600);
  const sous2 = await P(() => document.querySelector('.defi-sous').textContent);
  check(/ton meilleur : [\d ]+/.test(sous2), `le titre : « ${sous2} »`);
  await page.tap('#b-defi'); await sleep(300);
  await page.waitForFunction(() => document.querySelectorAll('.defi-liste li').length === 2, null, { timeout: 8000 }).catch(() => {});
  const ecr2 = await P(() => ({ lignes: [...document.querySelectorAll('.defi-liste li')].map((l) => [l.className, l.innerText.replace(/\s+/g, ' ')]), perso: document.querySelector('.defi-perso').textContent, pseudo: document.querySelector('#d-pseudo').value }));
  check(ecr2.lignes.length === 2 && ecr2.lignes[1][0] === 'moi' && /Testeur/.test(ecr2.lignes[1][1]) && /Ton meilleur aujourd’hui/.test(ecr2.perso) && ecr2.pseudo === 'Testeur', `ma ligne au classement (${ecr2.lignes.map((l) => l[1]).join(' | ')})`);
  await page.tap('[data-periode="semaine"]'); await sleep(400);
  check(await P(() => document.querySelector('[data-periode="semaine"]').getAttribute('aria-selected') === 'true' && window.__faux.appels.some((a) => a.nom === 'zombies_classement' && a.a.p_periode === 'semaine') && /jours?/.test(document.querySelector('.defi-liste li small').textContent)), 'l’onglet « Cette semaine » relit le classement de la semaine');
  await page.screenshot({ path: out + '/12-defi-classement.png' });

  // le SQL pas encore collé sur le projet : un message, et le jeu marche
  await P(() => { window.__faux.mode = 'pas-installe'; });
  await page.tap('[data-periode="jour"]'); await sleep(500);
  check(/pas encore ouvert/.test(await P(() => document.querySelector('.defi-etat').textContent)) && await P(() => document.querySelectorAll('.defi-liste li').length === 0), 'le classement pas encore installé : « pas encore ouvert », ton score est gardé');
  await page.tap('#b-defi-jouer'); await sleep(800);
  check(await P(() => window.__zombies.ecran === 'jeu' && window.__zombies.jeu.t > 0.2 && !!window.__zombies.defi), 'et le défi se joue quand même');

  // ─── l'Ascension : le bouton du titre, l'écran de l'échelon, la partie (objectif au HUD), la victoire, la progression gardée ───
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await sleep(400);
  check(/Échelon 1/.test(await P(() => document.querySelector('.asc-sous').textContent)), 'le titre : « L’Ascension · Échelon 1 »');
  await page.tap('#b-ascension'); await sleep(300);
  const ae = await P(() => ({ ecran: document.body.dataset.ecran, n: document.querySelector('.asc-n').textContent, carte: document.querySelector('.asc-carte').innerText, rec: document.querySelector('.asc-recomp').textContent }));
  check(ae.ecran === 'ascension' && /Échelon 1/.test(ae.n) && /Objectif/.test(ae.carte) && /Météo/.test(ae.carte) && /Règle/.test(ae.carte) && /médailles/.test(ae.rec), `l’écran de l’échelon : objectif, arène, météo, règle, horde, récompense (${ae.carte.split('\n')[1]})`);
  await page.screenshot({ path: out + '/13-ascension.png' });
  await page.tap('#b-asc-jouer'); await sleep(600);
  const aj = await P(() => ({ asc: window.__zombies.ascension && window.__zombies.ascension.n, obj: window.__zombies.jeu.objectif, hud: !document.querySelector('.h-objectif').hidden && document.querySelector('.h-objectif').textContent }));
  check(aj.asc === 1 && aj.obj && aj.hud, `la partie : l’objectif suivi au HUD (« ${aj.hud} »)`);
  const med0 = await P(() => window.__zombies.save.meta.medailles);
  await P(() => { const j = window.__zombies.jeu, O = j.objectif; j.joueurs[0].vie = j.joueurs[0].vieMax = 1e6; if (O.type === 'chrono') j.tempsVague = O.s; else if (O.type === 'tues') j.stats.tues = O.n; else j.vaguesFinies = O.n || 9; });
  await page.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  const af = await P(() => ({ titre: document.querySelector('.fin-titre').textContent, rec: document.querySelector('.fin-medailles').textContent.trim(), bouton: document.querySelector('#b-rejouer').textContent, save: window.__zombies.save }));
  check(/Échelon 1 réussi/.test(af.titre) && af.save.ascension.echelon === 2 && af.save.ascension.reussis === 1 && af.save.meta.medailles > med0 && /Échelon 2/.test(af.bouton), `la victoire : « ${af.titre} », ${af.rec}, l’échelon 2 s’ouvre`);
  await page.screenshot({ path: out + '/14-ascension-fin.png' });
  await page.tap('#b-rejouer'); await sleep(500);
  check(await P(() => window.__zombies.ascension && window.__zombies.ascension.n === 2 && window.__zombies.ecran === 'jeu'), '« Échelon 2 » : on monte');
  // ─── la collection : un survivant acheté en médailles et porté, une finition gagnée à l'Ascension, une émote achetée puis lancée en partie ───
  await P(() => { const s = JSON.parse(localStorage.getItem('zombies.v1')); s.meta.medailles = 100; s.ascension.finitions = 2; localStorage.setItem('zombies.v1', JSON.stringify(s)); });
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => ZMODELES.persosPrets, null, { timeout: 30000 }).catch(() => {});
  await page.tap('#b-collection'); await sleep(300);
  const c0 = await P(() => ({ ecran: document.body.dataset.ecran, cartes: document.querySelectorAll('[data-skin]').length, secrets: [...document.querySelectorAll('[data-skin] .nom')].filter((n) => n.textContent === '???').length }));
  check(c0.ecran === 'collection' && c0.cartes >= 19 && c0.secrets >= 2, `la Collection : ${c0.cartes} survivants (${c0.secrets} secrets « ??? »)`);
  await page.tap('[data-skin="marcel"]'); await sleep(300);
  const c1 = await P(() => ({ col: window.__zombies.save.collection, med: window.__zombies.save.meta.medailles, demo: window.__zombies.demo && window.__zombies.demo.joueurs[0].skin }));
  check(c1.col.skin === 'marcel' && c1.col.skins.includes('marcel') && c1.med === 80 && c1.demo === 'marcel', 'acheter Marcel (20 médailles) : il est porté, et le survivant de la démonstration le montre');
  await page.tap('[data-onglet="finitions"]'); await sleep(200); await page.selectOption('.col-armes select', 'revolver'); await sleep(150);
  const fins = await P(() => [...document.querySelectorAll('[data-fin]')].map((b) => b.querySelector('.nom').textContent));
  await page.tap('[data-fin="onyx"]'); await sleep(200); await page.tap('[data-fin="givre"]'); await sleep(200);
  const c2 = await P(() => window.__zombies.save.collection.parArme);
  check(fins.includes('Or') && fins.includes('Onyx') && fins.filter((f) => f === '???').length === 10 && c2.revolver === 'onyx', `les finitions : 2 gagnées à l’Ascension, 10 secrètes ; Onyx sur le revolver (${JSON.stringify(c2)})`);
  await page.tap('[data-onglet="emotes"]'); await sleep(200); await page.tap('[data-emo="feu"]'); await sleep(200);
  check(await P(() => window.__zombies.save.collection.emotes.includes('feu') && window.__zombies.save.meta.medailles === 65), 'acheter l’émote « En feu » (15 médailles)');
  await page.tap('#b-col-retour'); await sleep(300);
  await P(() => { const j = window.__zombies.demarrer('jardin', 3); j.joueurs[0].armes[1] = { id: 'revolver', mun: 40 }; j.joueurs[0].main = 1; });
  await sleep(1200);
  const c3 = await P(() => ({ j: window.__zombies.jeu.joueurs[0], tenues: window.__zombies.stats().rendu.tenues }));
  check(c3.j.skin === 'marcel' && c3.j.finitions.revolver === 'onyx' && c3.tenues.includes('revolver'), 'en partie : Marcel, et son revolver en Onyx');
  await page.tap('.h-emote'); await sleep(200);
  const em = await P(() => [...document.querySelectorAll('.h-emotes [data-emote]')].map((b) => b.dataset.emote));
  await page.tap('.h-emotes [data-emote="feu"]'); await sleep(300);
  const bulle = await P(() => { const b = [...document.querySelectorAll('.h-bulles span')].find((x) => !x.hidden); return b ? b.textContent : ''; });
  check(em.includes('feu') && !em.includes('crane') && bulle === '🔥', `les émotes en partie : celles qu’on a (${em.join(', ')}), la bulle au-dessus du survivant (${bulle})`);
  await page.screenshot({ path: out + '/15-emote.png' });
  // ─── missions, pass de saison, coffre du jour ───
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await sleep(300);
  check(/coffre du jour/.test(await P(() => document.querySelector('#b-progression small').textContent)), 'le titre signale le coffre du jour');
  await page.tap('#b-progression'); await sleep(300);
  const pm = await P(() => ({ ecran: document.body.dataset.ecran, missions: [...document.querySelectorAll('.prog-mission b')].map((b) => b.textContent), prog: window.__zombies.save.prog }));
  check(pm.ecran === 'progression' && pm.missions.length === 3 && pm.prog.saison === new Date().toISOString().slice(0, 7), `trois missions (${pm.missions.join(' ; ')})`);
  await page.tap('[data-onglet="pass"]'); await sleep(200);
  check(/palier \d+ \/ 100/.test(await P(() => document.querySelector('.prog-titre').textContent)) && await P(() => document.querySelectorAll('.prog-paliers li').length === 6), 'le pass de saison : 100 paliers, les prochaines récompenses');
  await page.tap('[data-onglet="coffre"]'); await sleep(200);
  const med1 = await P(() => window.__zombies.save.meta.medailles);
  await page.tap('#b-coffre'); await sleep(300);
  const cf = await P(() => ({ med: window.__zombies.save.meta.medailles, prog: window.__zombies.save.prog, bouton: !!document.querySelector('#b-coffre') }));
  check(cf.med >= med1 + 8 && cf.prog.serie === 1 && !cf.bouton, `le coffre du jour : +${cf.med - med1} médailles, série de 1 jour, une seule fois par jour`);
  await page.tap('#b-prog-retour'); await sleep(200);
  // une partie : la mission « zombies » avance, le pass gagne des points
  const m0 = await P(() => JSON.parse(JSON.stringify(window.__zombies.save.prog)));
  await P(() => { const j = window.__zombies.demarrer('jardin', 8); j.chrono = 0; });
  await page.waitForFunction(() => window.__zombies.jeu.zombies.length > 2, null, { timeout: 15000 }).catch(() => {});
  await P(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.score += 4000; p.tues += 60; j.stats.crits += 30; p.vie = 1; p.invul = 0; for (const z of j.zombies) { z.x = p.x + 0.9; z.z = p.z; z.coup = 0; z.naissance = -9; } });
  await page.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 15000 }).catch(() => {});
  const m1 = await P(() => window.__zombies.save.prog);
  const avance = m1.missions.some((m) => { const a = m0.missions.find((x) => x.id === m.id); return a && m.fait > a.fait; }) || m1.rang > m0.rang;
  check(avance && (m1.xp > m0.xp || m1.palier > m0.palier), `après la partie : les missions avancent, le pass passe à ${m1.palier} palier(s) et ${m1.xp} points`);
  // ─── les modes : l'écran, puis l'Infection (toi en zombie, le HUD, un survivant mordu, le bond, la fin) ───
  await page.goto(BASE + 'zombies/'); await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  await sleep(300); await page.tap('#b-modes'); await sleep(300);
  check(await P(() => document.body.dataset.ecran === 'modes' && document.querySelectorAll('.mode-carte').length === 3 && /Bronze/.test(document.querySelector('.duel-div').textContent)), 'l’écran des modes : Infection, Chacun pour soi, Duel (ta division)');
  await page.tap('#b-mode-inf'); await sleep(800);
  const inf = await P(() => ({ mode: window.__zombies.jeu.mode, hud: !document.querySelector('#hud-inf').hidden && document.querySelector('#hud').hidden, reste: document.querySelector('.hi-reste b').textContent, chrono: document.querySelector('.hi-chrono').textContent, survivants: window.__zombies.stats().rendu.survivant }));
  check(inf.mode === 'infection' && inf.hud && inf.reste === '6' && /^2:[0-9]{2}$/.test(inf.chrono), `Infection : son HUD (6 survivants, ${inf.chrono})`);
  await P(() => { const j = window.__zombies.jeu, b = j.joueurs[0]; j.moiZ.x = b.x - 0.5; j.moiZ.z = b.z; });
  await page.waitForFunction(() => window.__zombies.jeu.mordus >= 1, null, { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check(await P(() => window.__zombies.jeu.mordus >= 1 && document.querySelector('.hi-reste b').textContent === '5' && window.__zombies.jeu.zombies.length >= 2), 'un survivant mordu : il passe de ton côté');
  await page.screenshot({ path: out + '/16-infection.png' });
  await page.tap('.hi-bond'); await sleep(100);
  check(await P(() => window.__zombies.jeu.bondT > 0), 'le bouton « Bondir » : un bond, puis il se recharge');
  await P(() => { const j = window.__zombies.jeu; for (const b of j.joueurs) { b.vivant = false; b.parti = true; } });
  await page.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  const fi = await P(() => ({ t: document.querySelector('.fin-titre').textContent, inf: window.__zombies.save.infection }));
  check(/épidémie a gagné/.test(fi.t) && fi.inf.victoires === 1, `la fin : « ${fi.t} »`);
  check(errors.length === 0, `aucune erreur dans la page${errors.length ? ' : ' + errors.join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s) (Dernier Rempart, défi du jour)` : '\nTout passe (Dernier Rempart, défi du jour).');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
