// La boutique hantée (src/boutiquehantee.js) sur la vraie page du Fournil, téléphone en portrait (390 × 844), le mercredi 28 octobre 2026
// (la Maison hantée est ouverte) : c'est le DÉFAUT de l'écran de la Maison hantée (?boutique=0 rend le Manoir d'avant). On vérifie :
// · en éco : le thème « hantee » procédural (VIE.DECORS.hantee, MEUBLES.hantee), les clients en chibis déguisés (les neuf sortes), les
//   apprentis du Manoir aux trois postes embauchés les plus avancés ; aucun fichier du lot HD demandé ; le décor ≤ 72 appels de dessin ;
// · en haute : le préchargement (SCENE.precharger('hantee') : le lot « hantee3 ») puis l'ouverture directe en HD — le décor KayKit cuit
//   d'un bloc, la nuit (huit lumières au plus), les clients-monstres animés, toute l'équipe embauchée à ses postes, la patronne ;
//   le poids du lot (≤ 2,4 Mo, chaque fichier demandé une fois) ; ≤ 120 appels de dessin au pire (tout le mobilier, les huit postes, des
//   clients assis partout et en file, personnages skinnés compris) ; le temps de calcul par image avec le processeur ralenti ×4 ;
// · l'API des activités (acteurs, client, servir, fache, apparition, apparitions, attraper, surToucher, fete, ambiance), appelée à la main ;
// · le retour à la boutique, propre (son thème, ses clients sans costume ni monstre, son tiroir) ; trois allers-retours sans que la mémoire
//   monte (géométries et textures) ; aucune erreur dans la page. Captures éco et haute (clients assis et en file), ambiance basse, retour.
// Captures dans test/shots/hantee-boutique/ (et dans le dossier donné par SHOTS_HANTEE_BOUTIQUE, préfixées « scene- »).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hantee-boutique.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_HANTEE_BOUTIQUE || 8962;
const out = path.join(__dirname, 'shots', 'hantee-boutique'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_HANTEE_BOUTIQUE ? (fs.mkdirSync(process.env.SHOTS_HANTEE_BOUTIQUE, { recursive: true }), process.env.SHOTS_HANTEE_BOUTIQUE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-28T11:00:00+01:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = [];
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
const SORTES = ['squelette', 'squelette-sorcier', 'zombie', 'citrouille', 'fantome', 'momie', 'sorciere', 'vampire', 'loup'];
const EQUIPE = ['fantome2', 'momie2', 'squelette', 'vampire2', 'sorciere2', 'citrouille', 'loupgarou', 'dragonne'], EQUIPE3 = ['hubert', 'momie', 'squelette', 'vampire', 'sorciere', 'citrouille', 'loup', 'dragonne'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD en haute
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; }, decal);
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); if (m.type() === 'warning' && /Boutique hantée/.test(m.text())) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const fermerFeuille = () => ev(() => { const b = document.querySelector('#feuille [data-a="pq-tard"], #feuille [data-a="close"], #feuille [data-a="pq-ok"]'); if (b) b.click(); });
    // la Maison hantée déjà annoncée, cinq postes ouverts (le 4e sans son monstre), six paliers franchis
    // (v6.7 : 2e12 bonbons passent le 6e palier, ouvert le 28 ; il est marqué pour que sa feuille ne vienne pas couvrir la scène)
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12;
      [[60, 1], [40, 1], [25, 1], [12, 0], [6, 1]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5, 6]; F.save(); });
    await fermerFeuille(); await sleep(300); await fermerFeuille();
    return { ctx, page, erreurs, ev };
  }
  const shot = async (page, nom) => { await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, 'scene-' + nom + '.png')); await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
  const decorAppels = (ev) => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0, tout = 0; for (const [k, v] of Object.entries(a)) { tout += v; if (k !== 'acteurs' && k !== 'chat') decor += v; } return { decor, tout, a }; });
  const vue = (ev) => ev(() => { const S = window.__fournil.SCENE, el = document.querySelector('#hantee'); return { ev: S.evenement, stats: S.stats, ouvert: !el.hidden, ecran: el.dataset.ecran, classe: el.classList.contains('ht-boutique'), corps: document.body.classList.contains('ht-boutique'), cartes: document.querySelectorAll('#ht-cartes .carte').length, tiroir: getComputedStyle(document.querySelector('#tiroir')).visibility, canvasManoir: getComputedStyle(document.querySelector('#ht-canvas')).visibility, clientsVie: VIE.clients.map((c) => c.deg || ''), mode: VIE.mode, theme: VIE.Q.id, t: VIE.t }; });
  const memoire = (ev) => ev(() => { const s = window.__fournil.SCENE.stats; return { g: s.geometries, t: s.textures }; });
  const fenetre = (ev) => ev(() => { const r = document.querySelector('#hantee .pq-scene').getBoundingClientRect(), d = document.querySelector('#hantee .pq-scene').previousElementSibling.getBoundingClientRect(); return { haut: d.bottom, bas: r.bottom, l: r.left, r: r.right }; });
  // tout le mobilier au max, les huit postes ouverts et embauchés, tous les paliers ; des clients assis partout, d'autres en file
  const complet = (ev) => ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); for (const m of F.G.MOBILIER) F.st.mobilier[m.id] = m.max; q.postes.forEach((s) => { s.niv = Math.max(s.niv, 30); s.staff = true; s.actif = true; }); q.paliers = Array.from({ length: 20 }, (x, i) => i + 1); });
  const remplir = (ev) => ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'table', 'table', 'bar', 'bar', 'banquette', 'terrasse', 'table', 'table']) S.installer(z, 600); for (let j = 0; j < 4; j++) VIE.vente(0, 10, '+10', true); });

  for (const qual of ['eco', 'haute']) {
    console.log(`── qualité ${qual} : la Maison hantée, c'est la boutique hantée (le défaut) ──`);
    demandes.length = 0;
    const { ctx, page, erreurs, ev } = await ouvrir(`?qualite=${qual}`);
    await ev(() => window.__fournil.scene({ heure: 11 }));
    const avant = await vue(ev);
    check(avant.theme !== 'hantee' && !avant.ev && avant.mode === '', `la boutique d'abord, à son thème (${avant.theme})`);
    if (qual === 'haute') { // le préchargement (ui.js l'appelle 5 s après l'ouverture du jeu, l'événement en cours) : le lot de la boutique hantée, puis ses personnages préparés
      check(await ev(() => window.__fournil.SCENE.precharger('hantee')) === true, 'SCENE.precharger(\'hantee\') lance le lot de la boutique hantée');
      check(await attendre(() => ev(() => HDM.pret('hantee3')), 60000), 'le lot « hantee3 » est chargé en arrière-plan, la boutique encore à l\'écran');
      await sleep(1200);
      check(!demandes.some((p) => /hd\/hantee\//.test(p)), `le décor du Manoir d'avant n'est pas demandé (${demandes.filter((p) => /hd\/hantee\//.test(p)).length})`);
    }
    const t0 = Date.now();
    await ev(() => document.querySelector('#b-hantee').click()); // l'icône citrouille du coin
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati) && e.clients > 0; }), 30000), 'l’icône citrouille ouvre la Maison hantée : la scène de la boutique bascule sur l’événement, l’équipe est à son poste, des clients entrent');
    if (qual === 'haute') { const ok = await attendre(() => ev(() => window.__fournil.SCENE.evenement.hd), 15000); check(ok, `préchargée, elle ouvre directement en HD (${((Date.now() - t0) / 1000).toFixed(1)} s, rendu logiciel)`); }
    await sleep(1500);
    let v = await vue(ev);
    check(v.ouvert && v.ecran === 'manoir' && v.classe && v.corps, `l’écran de la Maison hantée est ouvert en mode boutique, sans ?boutique=1 (écran ${v.ecran}, classes posées)`);
    check(v.ev.theme === 'hantee' && v.mode === 'hantee' && v.stats.webgl && v.stats.calls > 0, `la scène tourne au thème « hantee » (${v.stats.calls} appels de dessin, vie en mode ${v.mode})`);
    const t1 = v.t; check(await attendre(async () => (await vue(ev)).t > t1 + 0.1, 8000), 'la vie de la boutique hantée avance');
    if (qual === 'eco') { // la cadence de la batterie (ui.js : 30 images/s en jouant, 10 au repos) passe par l'écran de l'événement jusqu'à SCENE.frame :
      // l'éco rend chaque image traitée (la cadence en saute déjà), et la qualité mesure l'intervalle réel des rafraîchissements, pas les 33 ou 100 ms voulus.
      // Le temps de la mesure, le dessin WebGL est neutralisé (comme test/fournil-batterie.cjs : c'est la boucle qu'on mesure, pas SwiftShader), puis rendu.
      await ev(() => { window.__dessin = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) { window.__dessin.push([C, m, C.prototype[m]]); C.prototype[m] = function () {}; } });
      await sleep(600);
      await ev(() => { if (!window.__sonde) { window.__sonde = 1; const s = () => { window.__sonde++; requestAnimationFrame(s); }; requestAnimationFrame(s); } const q = SCENE._qual; q.fixe = false; q.mesures = 0; q.somme = 0; q.verif = null; q.moy = 0; q.echecs = {}; q.calme = 0; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })); }); // en jeu : 30 images/s
      const lire = () => ev(() => [SCENE.stats.rendus, performance.now(), window.__sonde]), a = await lire(), vues = [];
      for (let t = 0; t < 4500; t += 500) { await sleep(500); vues.push((await ev(() => window.__fournil.cadence())).mesuree); }
      const b = await lire(), q = await ev(() => { const q = SCENE._qual, r = { moy: q.moy, niveau: SCENE.stats.qualite }; q.fixe = true; for (const [C, m, f] of window.__dessin) C.prototype[m] = f; return r; });
      const rendus = (b[0] - a[0]) / (b[1] - a[1]) * 1000, images = vues.reduce((s, x) => s + x, 0) / vues.length, raf = (b[2] - a[2]) / (b[1] - a[1]) * 1000, brut = 1000 / Math.max(1, raf);
      const charge = raf < 50 ? ` — machine chargée (${raf.toFixed(1)} rafraîchissements/s) : non exigé` : '';
      check(raf < 50 || (rendus >= images * 0.8 && q.moy > 0 && q.moy < 28 && q.niveau === 'eco'), `la cadence de la batterie : ${rendus.toFixed(1)} rendus/s pour ${images.toFixed(1)} images/s traitées, fenêtre mesurée ${q.moy.toFixed(1)} ms pour des rafraîchissements de ${brut.toFixed(1)} ms (qualité ${q.niveau})${charge}`);
    }
    check(v.canvasManoir === 'hidden' && v.tiroir === 'hidden', `le canvas du Manoir et le tiroir de la boutique sont masqués (${v.canvasManoir}, ${v.tiroir})`);
    check(v.cartes === 9, `les cartes des friandises (8) et la recette du jour restent dans la liste de l’écran (${v.cartes})`);
    check(v.clientsVie.length > 0 && v.clientsVie.every((d) => SORTES.includes(d)) && v.ev.deguises === v.ev.clients, `les clients sont des monstres des neuf sortes (${v.clientsVie.join(', ')}), bâtis ainsi (${v.ev.deguises}/${v.ev.clients})`);
    check(v.ev.compagnon === 'chat-noir', 'le chat noir dort sur le comptoir');
    if (qual === 'eco') {
      check(v.ev.decos.length === 4 && v.ev.bougies >= 5 && v.ev.tenue === 'hantee' && !v.ev.hd, `le repli procédural : ${v.ev.decos.join(', ')}, ${v.ev.bougies} bougies, le boulanger en tenue d’Halloween`);
      const ids = v.ev.apprentis.map((a) => a.i).sort();
      check(JSON.stringify(ids) === '[1,2,4]' && v.ev.apprentis.every((a) => a.costume === EQUIPE[a.i]), `les apprentis : les monstres des trois postes embauchés les plus avancés (postes ${ids.join(', ')} : ${v.ev.apprentis.map((a) => a.costume).join(', ')})`);
    } else {
      const ids = v.ev.apprentis.map((a) => a.i);
      check(v.ev.hd && JSON.stringify(ids) === '[0,1,2,4]' && v.ev.apprentis.every((a) => a.costume === EQUIPE3[a.i]), `en haute, toute l'équipe embauchée à ses postes (postes ${ids.join(', ')} : ${v.ev.apprentis.map((a) => a.costume).join(', ')}), pas le poste sans monstre`);
      check(v.ev.patronne && v.ev.lumieres > 0 && v.ev.lumieres <= 8 && v.ev.bougies >= 15, `la patronne derrière le comptoir ; ${v.ev.lumieres} lumières (≤ 8) ; ${v.ev.bougies} halos`);
      const hd = demandes.filter((p) => /hd\/hantee3\//.test(p)), uniques = new Set(hd), poids = [...uniques].reduce((a, p) => a + fs.statSync(path.join(root, p)).size, 0);
      check(hd.length === uniques.size && uniques.size === 12 && poids <= 2.4e6, `le lot HD de la Maison hantée : ${uniques.size} fichiers demandés une fois chacun, ${(poids / 1e6).toFixed(2)} Mo (≤ 2,4 Mo)`);
      check(!demandes.some((p) => /hantee2|hd\/hantee\/|\/mini\//.test(p)), 'ni l\'ancien décor cuit, ni le Manoir, ni les Mini Characters');
    }
    // embaucher le monstre du 4e poste
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.postes[3].staff = true; q.postes[3].actif = true; });
    const attendu = qual === 'eco' ? '[2,3,4]' : '[0,1,2,3,4]';
    check(await attendre(() => ev((x) => { const e = window.__fournil.SCENE.evenement; return JSON.stringify(e.apprentis.map((a) => a.i).sort()) === x && e.apprentis.every((a) => a.bati); }, attendu), 15000), `un monstre embauché arrive à son poste (Comte Vladimir, le vampire) : ${attendu}`);
    await remplir(ev); await sleep(qual === 'haute' ? 4000 : 2500);
    await attendre(async () => { await ev(() => VIE.vente(0, 10, '+10', true)); await sleep(400); return (await ev(() => BOUTIQUE_HANTEE.acteurs().filter((a) => a.etat === 'file').length)) >= 3; }, 20000); // pour la capture : du monde en file
    await shot(page, `${qual}-salle`);

    // ─── l'API des activités, appelée à la main ───
    const F0 = await fenetre(ev);
    const ac = await ev(() => BOUTIQUE_HANTEE.acteurs());
    const roles = new Set(ac.map((a) => a.role)), etats = new Set(ac.filter((a) => a.role === 'client').map((a) => a.etat));
    check(ac.length > 3 && roles.has('client') && roles.has('apprenti') && ac.every((a) => a.x >= F0.l - 1 && a.x <= F0.r + 1 && a.y >= F0.haut - 80 && a.y <= F0.bas) && ac.every((a) => ['client', 'apprenti', 'patronne'].includes(a.role)) && [...etats].every((e) => ['entre', 'file', 'assis', 'sort'].includes(e)),
      `acteurs() : ${ac.length} dans la fenêtre (${[...roles].join(', ')} ; clients ${[...etats].join(', ')}), le haut de la tête en pixels (ex. ${ac[0] && `${ac[0].id} ${ac[0].sorte} ${ac[0].x},${ac[0].y}`})`);
    check(etats.has('assis') && (await ev(() => window.__fournil.SCENE.assisEn.table)) > 0, 'des clients assis aux tables');
    check(await attendre(() => ev(() => BOUTIQUE_HANTEE.acteurs().some((a) => a.etat === 'file')), 10000), 'et des clients en file au comptoir');
    const enFile = await ev(() => BOUTIQUE_HANTEE.acteurs().find((a) => a.etat === 'file'));
    const cl = await ev((id) => BOUTIQUE_HANTEE.client(id), enFile.id);
    check(cl && cl.id === enFile.id && cl.role === 'client' && SORTES.includes(cl.sorte), `client(${enFile.id}) : ${cl && cl.sorte}, ${cl && cl.etat}`);
    const sv = await ev((id) => { const r = BOUTIQUE_HANTEE.servir(id), c = VIE.clients.find((x) => 'c' + x.id === id); return { r, etat: c && VIE.etatClient(c), humeur: c && c.humeur, joie: c && c.joie }; }, enFile.id);
    check(sv.r === true && sv.etat === 'sort' && sv.humeur === 'content' && sv.joie > 0, `servir(${enFile.id}) : il repart content (${sv.etat}, ${sv.humeur}, fête ${sv.joie && sv.joie.toFixed(1)} s)`);
    if (qual === 'haute') check(await attendre(() => ev((id) => { const a = BOUTIQUE_HANTEE.acteurs().find((x) => x.id === id); return !!a && (a.clip === 'Cheer' || a.clip === 'flotte'); }, enFile.id), 3000), 'le monstre servi fait Cheer avant de sortir (un fantôme, lui, sautille)');
    const autre = await ev(() => { const a = BOUTIQUE_HANTEE.acteurs().find((x) => x.role === 'client' && (x.etat === 'file' || x.etat === 'entre')); return a ? a.id : null; });
    if (autre) { const fa = await ev((id) => { const r = BOUTIQUE_HANTEE.fache(id), c = VIE.clients.find((x) => 'c' + x.id === id); return { r, humeur: c && c.humeur, etat: c && VIE.etatClient(c) }; }, autre); check(fa.r && fa.humeur === 'fache' && fa.etat === 'sort', `fache(${autre}) : il repart sans payer (${fa.etat})`); }
    check(await ev(() => BOUTIQUE_HANTEE.servir('c999999') === false && BOUTIQUE_HANTEE.client('c999999') === null), 'un client qui n\'existe pas : servir rend false, client rend null');
    // (les apparitions des règles attendent une heure : une qui passerait d'elle-même, sur une machine lente, fausserait le compte des trois de l'API)
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); if (q.manoir) q.manoir.prochaineApp = HORLOGE.maintenant() + 3600e3; for (const a of BOUTIQUE_HANTEE.apparitions()) BOUTIQUE_HANTEE.retirer(a.id); });
    const ids = await ev(() => ['fantome', 'citrouille', 'chauve-souris'].map((t) => BOUTIQUE_HANTEE.apparition(t)));
    await sleep(700);
    let ap = await ev(() => BOUTIQUE_HANTEE.apparitions());
    check(ids.every((i) => typeof i === 'number') && ap.length === 3 && ap.every((a) => a.r >= 22 && Number.isFinite(a.x) && Number.isFinite(a.y)) && new Set(ap.map((a) => a.type)).size === 3, `trois apparitions (${ap.map((a) => `${a.type} ${a.x},${a.y} r${a.r}`).join(' ; ')})`);
    await ev(() => { window.__touches = []; BOUTIQUE_HANTEE.surToucher((t) => window.__touches.push(t)); });
    const toucherA = (x, y) => ev(([x, y]) => document.querySelector('#hantee .pq-scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })), [x, y]);
    ap = await ev(() => BOUTIQUE_HANTEE.apparitions()); const cible = ap.find((a) => a.y > F0.haut + 10 && a.y < F0.bas - 10 && a.x > 5 && a.x < 385) || ap[0];
    await toucherA(cible.x, cible.y);
    const clVu = await ev(() => { const ap = BOUTIQUE_HANTEE.apparitions(); return BOUTIQUE_HANTEE.acteurs().find((a) => a.role === 'client' && a.etat === 'assis' && ap.every((p) => Math.hypot(p.x - a.x, p.y - a.y - 14) > 50)); });
    if (clVu) await toucherA(clVu.x, clVu.y + 14);
    await toucherA(F0.l + 4, F0.haut + 4);
    const touches = await ev(() => window.__touches);
    check(touches[0] && touches[0].genre === 'apparition' && touches[0].id === cible.id, `surToucher : un toucher sur l'apparition ${cible.type} → ${JSON.stringify(touches[0])}`);
    check(!clVu || (touches[1] && touches[1].genre === 'client' && touches[1].id === clVu.id), `surToucher : un toucher sur un client assis → ${JSON.stringify(touches[1])}`);
    check(touches[touches.length - 1] && touches[touches.length - 1].genre === 'vide', `surToucher : un toucher dans le coin du mur → ${JSON.stringify(touches[touches.length - 1])}`);
    const pris = await ev((id) => BOUTIQUE_HANTEE.attraper(id), cible.id); await sleep(200);
    check(pris === true && (await ev(() => BOUTIQUE_HANTEE.apparitions().length)) === 2 && await ev((id) => !BOUTIQUE_HANTEE.attraper(id), cible.id), 'attraper(id) : l\'apparition éclate en étincelles et s\'en va (une seule fois)');
    check(await ev(() => BOUTIQUE_HANTEE.fete()) === true, 'fete() : les confettis, et les monstres font Cheer');
    const lum = () => ev(() => { let k = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.isLight) k += o.intensity; }); return k; });
    await sleep(500); const l1 = await lum();
    await ev(() => BOUTIQUE_HANTEE.ambiance({ actif: 0 })); let l0 = l1; await attendre(async () => (l0 = await lum()) < l1 * 0.7, 5000);
    check(l0 < l1 * 0.7, `ambiance({ actif: 0 }) : la lumière baisse (${l1.toFixed(1)} → ${l0.toFixed(1)})`);
    await shot(page, `${qual}-ambiance-basse`);
    await ev(() => BOUTIQUE_HANTEE.ambiance({ actif: 1 })); await sleep(300);

    // le budget : tout au max, des clients partout
    await complet(ev); await sleep(qual === 'haute' ? 3000 : 2000); await remplir(ev); await sleep(2500);
    let pire = { decor: 0, tout: 0, calls: 0 };
    for (const h of [11, 20.5]) { await ev((h) => window.__fournil.scene({ heure: h }), h); await sleep(qual === 'haute' ? 1800 : 900); const a = await decorAppels(ev), calls = await ev(() => window.__fournil.SCENE.stats.calls); if (a.tout + calls > pire.tout + pire.calls) pire = Object.assign({ h, calls }, a); }
    if (qual === 'eco') check(pire.decor <= 72, `éco, la boutique hantée au complet : au pire ${pire.decor} appels de dessin pour le décor (≤ 72) — ${Object.entries(pire.a).filter(([k]) => /^ht|hantee|produits|deco$/.test(k)).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    else check(pire.tout <= 120 && pire.calls <= 120, `haute, la boutique hantée au complet : ${pire.tout} maillages visibles (personnages skinnés compris : ${pire.a.acteurs} pour ${await ev(() => window.__fournil.SCENE.stats.acteurs)} personnages) et ${pire.calls} appels de dessin mesurés (≤ 120)`);
    await shot(page, `${qual}-complet`);
    if (qual === 'haute') { // le processeur ralenti ×4 : le temps de calcul d'une image (simulation, monstres, rendu soumis)
      const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const m = await ev(async () => { const S = window.__fournil.SCENE, v = []; for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); v.push(S.stats.cpu); } v.sort((a, b) => a - b); return { med: v[20], p90: v[36] }; });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`        processeur ×4 : ${m.med.toFixed(1)} ms par image (médiane), ${m.p90.toFixed(1)} ms (90 %), rendu logiciel compris`);
      check(m.med < 40, `processeur ×4 : le calcul d'une image tient (${m.med.toFixed(1)} ms médiane)`);
    }
    await ev(() => window.__fournil.scene({ heure: 11 }));

    // le retour à la boutique : propre
    await ev(() => document.querySelector('#hantee [data-pq="fermer"]').click());
    await attendre(() => ev(() => !window.__fournil.SCENE.evenement && VIE.Q.id !== 'hantee' && !window.__fournil.SCENE.appelsParGroupe.hantee && !window.__fournil.SCENE.appelsParGroupe.ht3), 20000); await sleep(800);
    v = await vue(ev);
    check(!v.ouvert && !v.ev && v.mode === '' && v.theme !== 'hantee' && !v.classe && !v.corps && v.tiroir === 'visible', `le retour : la boutique reprend son thème (${v.theme}), sa vie (mode « ${v.mode} »), son tiroir ; plus de classes du mode hanté`);
    const mons = await ev(() => { let n = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && o.userData.hd3) n++; }); return { n, fog: !!window.__fournil.SCENE.trois.scene.fog, hd3: window.__fournil.SCENE.hd3 }; });
    check(v.clientsVie.every((d) => !d) && mons.n === 0 && !mons.fog && !mons.hd3, `plus aucun client déguisé ni monstre dans la boutique (${v.clientsVie.length} clients), plus de brouillard de nuit`);
    const ap2 = await decorAppels(ev), maxB = qual === 'haute' ? 80 : 72;
    check(ap2.decor <= maxB && !ap2.a.hantee && !ap2.a.ht3, `la boutique au retour : ${ap2.decor} appels pour le décor (≤ ${maxB}), sans le décor hanté`);
    await shot(page, `${qual}-retour`);

    // trois allers-retours : la mémoire ne monte pas (les géométries et les textures, mesurées dans la boutique, au retour)
    const mems = [];
    for (let k = 1; k <= 3; k++) {
      await ev(() => window.__fournil.hantee()); await attendre(() => ev((q) => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati) && (q !== 'haute' || e.hd); }, qual), 20000); await sleep(1200);
      const e = await ev(() => window.__fournil.SCENE.evenement);
      const tot = await ev(() => { const F = window.__fournil; F.fermerHantee(); const n = VIE.clients.length; // une vente et un habitué dans la même image, avant toute frame de la boutique (la boucle de ui.js vend avant de dessiner)
        for (let j = 0; j < 4; j++) F.SCENE.vente(0, 10, '+10', true); VIE.habitue({ id: 'essai-retour', nom: 'Essai', haut: '#88AACC', cheveux: '#553322', peau: '#F1C7A5', coiffure: 1 });
        return { mode: VIE.mode, vueEv: !!VIE.vueEv, theme: VIE.Q && VIE.Q.id, nouveaux: VIE.clients.slice(n).map((c) => c.deg || '') }; });
      if (k === 1) check(tot.mode === '' && !tot.vueEv && tot.theme !== 'hantee' && tot.nouveaux.length > 0 && tot.nouveaux.every((d) => !d), `fermer puis vendre dans la même image : les clients entrent sans costume (${tot.nouveaux.length}), au thème ${tot.theme}`);
      await attendre(() => ev(() => VIE.Q.id !== 'hantee' && !window.__fournil.SCENE.appelsParGroupe.hantee && !window.__fournil.SCENE.appelsParGroupe.ht3), 20000); await sleep(900);
      const m = await memoire(ev); mems.push(m); console.log(`        aller-retour ${k} : ${e.clients} clients bâtis, ${e.apprentis.length} monstres de l'équipe${e.hd ? ' (HD)' : ''} ; au retour ${m.g} géométries, ${m.t} textures`);
    }
    check(mems[2].t <= mems[0].t && mems[2].g <= mems[0].g + 6, `trois allers-retours : la mémoire est stable (géométries ${mems.map((m) => m.g).join(' → ')}, textures ${mems.map((m) => m.t).join(' → ')})`);
    if (qual === 'eco') check(!demandes.some((p) => /hantee3/.test(p)), `en éco, aucun fichier du lot HD de la boutique hantée demandé (${demandes.filter((p) => /hantee3/.test(p)).length})`);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  console.log('── ?boutique=0 : le Manoir d\'avant (pour déboguer) ──');
  {
    const { ctx, ev, erreurs } = await ouvrir('?qualite=eco&boutique=0');
    await ev(() => window.__fournil.hantee()); await sleep(1500);
    const v = await vue(ev), calls = await ev(() => { const s = window.__fournil.evHantee.scene; return s ? s.calls : 0; });
    check(v.ouvert && !v.classe && !v.ev && v.mode === '' && v.canvasManoir === 'visible' && calls > 0, `le Manoir a son propre décor 3D (${calls} appels), la boutique n’est pas touchée`);
    check(await ev(() => BOUTIQUE_HANTEE.acteurs().length === 0 && BOUTIQUE_HANTEE.apparition('fantome') === null), 'l\'API de la boutique hantée ne fait rien sans elle');
    await ev(() => window.__fournil.fermerHantee()); await sleep(500);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est vert.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
