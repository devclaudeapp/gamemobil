// La Halle du Marché d'automne (src/boutiquemarche.js) sur la vraie page du Fournil, téléphone en portrait (390 × 844), le samedi
// 14 novembre 2026 à 11 h (le Marché est ouvert, deuxième jour) : c'est le DÉFAUT de l'écran du Marché (?boutique=0 rend le repli sans 3D).
// Calqué sur test/fournil-hantee-boutique.cjs. On vérifie :
// · en éco : le thème « marche » procédural (VIE.DECORS.marche, MEUBLES.marche : les colombages, les tomettes, l'étal et son auvent, les
//   cagettes, le brasero, les lampions), les enfants déguisés en animaux de la forêt (les neuf sortes, à capuche), les amis de la forêt aux
//   trois postes embauchés les plus avancés, l'écureuil sur le comptoir ; aucun fichier du lot HD demandé ; le décor ≤ 72 appels de dessin ;
// · en haute : le préchargement (SCENE.precharger('marche') : le lot « marche ») puis l'ouverture directe en HD — la Halle KayKit et Kenney
//   cuite d'un bloc, la lumière dorée (huit lumières au plus), les enfants animés, toute l'équipe embauchée à ses postes, la marchande ; le
//   poids du lot (≤ 2,4 Mo, chaque fichier demandé une fois) ; ≤ 120 appels de dessin au pire (tout le mobilier, les huit postes, des clients
//   assis partout et en file, personnages skinnés compris), de jour et le soir ; le temps de calcul par image avec le processeur ralenti ×4 ;
// · l'API des activités (acteurs, client, servir, fache, apparition, apparitions, attraper, surToucher, fete, ambiance), appelée à la main ;
// · le retour à la boutique, propre ; trois allers-retours sans que la mémoire monte ; aucune erreur dans la page ;
// · dans la boutique : les décos du Marché gagnées, à leurs places d'origine (l'étagère aux peluches à la teinte de l'album), les décos de la
//   saison posées (leurs places typées), le pire cas du décor ≤ 72 en éco ; la visite d'un copain qui a les décos du Marché (sa photo, champ
//   dm, relue par CLASSEMENT.boutiqueDepuisPhoto, posée comme ui.js la pose) ;
// · ?boutique=0 : l'écran du Marché sans 3D (jamais le Manoir d'Halloween), l'API de la Halle ne fait rien.
// Captures dans test/shots/marche-boutique/ (et dans le dossier donné par SHOTS_MARCHE_BOUTIQUE, préfixées « scene- »).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-marche-boutique.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_MARCHE_BOUTIQUE || 8963;
const out = path.join(__dirname, 'shots', 'marche-boutique'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_MARCHE_BOUTIQUE ? (fs.mkdirSync(process.env.SHOTS_MARCHE_BOUTIQUE, { recursive: true }), process.env.SHOTS_MARCHE_BOUTIQUE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-11-14T11:00:00+01:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = [];
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString()); // (HORLOGE se fie à l'heure du serveur)
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
const SORTES = ['ecureuil', 'herisson', 'lapin', 'renard', 'blaireau', 'chouette', 'faon', 'marcassin', 'ourson'];
const EQUIPE = ['ami-ecureuil', 'ami-herisson', 'ami-blaireau', 'ami-chouette', 'ami-ours', 'ami-biche', 'ami-renard', 'ami-marcassin'];
const DECOS_MARCHE = ['cagettes', 'lampions', 'feuilles', 'tonneau', 'album', 'arbre-or', 'toque-feuille'];
const SAISON = [['couronne-feuilles', 'm3'], ['guirlande-feuilles', 'r1'], ['lanterne-automne', 'c2'], ['epouvantail', 's3'], ['trophee-automne-2026', 'c1']];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD en haute
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; }, decal);
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); if (m.type() === 'warning' && /Halle|Boutique/.test(m.text())) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const fermerFeuille = () => ev(() => { const b = document.querySelector('#feuille [data-a="pq-tard"], #feuille [data-a="close"], #feuille [data-a="pq-ok"]'); if (b) b.click(); });
    // le Marché déjà annoncé, cinq postes ouverts (le 4e sans son ami de la forêt), six paliers franchis (le 6e s'ouvre le 14, deuxième jour)
    await fermerFeuille(); await sleep(300); await fermerFeuille();
    await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12;
      [[60, 1], [40, 1], [25, 1], [12, 0], [6, 1]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5, 6]; F.save(); });
    await fermerFeuille(); await sleep(300); await fermerFeuille();
    return { ctx, page, erreurs, ev };
  }
  const shot = async (page, nom) => { await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f, timeout: 120000 }); if (out2) fs.copyFileSync(f, path.join(out2, 'scene-' + nom + '.png')); await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
  const decorAppels = (ev) => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0, tout = 0; for (const [k, v] of Object.entries(a)) { tout += v; if (k !== 'acteurs' && k !== 'chat') decor += v; } return { decor, tout, a }; });
  const vue = (ev) => ev(() => { const S = window.__fournil.SCENE, el = document.querySelector('#marche'); return { ev: S.evenement, stats: S.stats, ouvert: !el.hidden, ecran: el.dataset.ecran, classe: el.classList.contains('mc-boutique') || el.classList.contains('ht-boutique'), corps: document.body.classList.contains('mc-boutique') || document.body.classList.contains('ht-boutique'), cartes: document.querySelectorAll('#mc-cartes .carte').length, tiroir: getComputedStyle(document.querySelector('#tiroir')).visibility, canvas: getComputedStyle(document.querySelector('#mc-canvas')).visibility, clientsVie: VIE.clients.map((c) => c.deg || ''), mode: VIE.mode, theme: VIE.Q.id, t: VIE.t }; });
  const memoire = (ev) => ev(() => { const s = window.__fournil.SCENE.stats; return { g: s.geometries, t: s.textures }; });
  const fenetre = (ev) => ev(() => { const r = document.querySelector('#marche .pq-scene').getBoundingClientRect(), d = document.querySelector('#marche .pq-scene').previousElementSibling.getBoundingClientRect(); return { haut: d.bottom, bas: r.bottom, l: r.left, r: r.right }; });
  // tout le mobilier au max, les huit postes ouverts et embauchés, tous les paliers ; des clients assis partout, d'autres en file
  const complet = (ev) => ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); for (const m of F.G.MOBILIER) F.st.mobilier[m.id] = m.max; q.postes.forEach((s) => { s.niv = Math.max(s.niv, 30); s.staff = true; s.actif = true; }); q.paliers = Array.from({ length: 20 }, (x, i) => i + 1); });
  const remplir = (ev) => ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'table', 'table', 'bar', 'bar', 'banquette', 'terrasse', 'table', 'table']) S.installer(z, 600); for (let j = 0; j < 4; j++) VIE.vente(0, 10, '+10', true); });

  for (const qual of ['eco', 'haute']) {
    console.log(`── qualité ${qual} : le Marché d'automne, c'est la Halle (le défaut) ──`);
    demandes.length = 0;
    const { ctx, page, erreurs, ev } = await ouvrir(`?qualite=${qual}`);
    await ev(() => window.__fournil.scene({ heure: 11 }));
    const avant = await vue(ev);
    check(avant.theme !== 'marche' && !avant.ev && avant.mode === '', `la boutique d'abord, à son thème (${avant.theme})`);
    if (qual === 'haute') { // le préchargement (ui.js l'appelle quelques secondes après l'ouverture du jeu, l'événement en cours) : le lot de la Halle, puis ses personnages préparés
      check(await ev(() => window.__fournil.SCENE.precharger('marche')) === true, 'SCENE.precharger(\'marche\') lance le lot de la Halle');
      check(await attendre(() => ev(() => HDM.pret('marche')), 90000), 'le lot « marche » est chargé en arrière-plan, la boutique encore à l\'écran');
      await sleep(1200);
      check(!demandes.some((p) => /hd\/hantee\/|decor-hante/.test(p)), `ni le Manoir ni le décor de la boutique hantée ne sont demandés (${demandes.filter((p) => /hd\/hantee\/|decor-hante/.test(p)).length})`);
    }
    const t0 = Date.now();
    await ev(() => document.querySelector('#b-marche').click()); // l'icône du coin (la feuille d'érable)
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati) && e.clients > 0; }), 40000), 'l’icône du Marché ouvre la Halle : la scène de la boutique bascule sur l’événement, l’équipe est à son poste, des enfants entrent');
    if (qual === 'haute') { const ok = await attendre(() => ev(() => window.__fournil.SCENE.evenement.hd), 20000); check(ok, `préchargée, elle ouvre directement en HD (${((Date.now() - t0) / 1000).toFixed(1)} s, rendu logiciel)`); }
    await sleep(1500);
    let v = await vue(ev);
    check(v.ouvert && v.classe && v.corps, `l’écran du Marché est ouvert en mode boutique, sans ?boutique=1 (écran « ${v.ecran} », classes posées)`);
    check(v.ev.id === 'marche' && v.ev.theme === 'marche' && v.mode === 'marche' && v.stats.webgl && v.stats.calls > 0, `la scène tourne au thème « marche » (${v.stats.calls} appels de dessin, vie en mode ${v.mode})`);
    const t1 = v.t; check(await attendre(async () => (await vue(ev)).t > t1 + 0.1, 8000), 'la vie de la Halle avance');
    check(v.canvas === 'hidden' && v.tiroir === 'hidden', `le canvas d'avant de l'écran et le tiroir de la boutique sont masqués (${v.canvas}, ${v.tiroir})`);
    check(v.cartes === 9, `les cartes des huit douceurs et la recette du jour restent dans la liste de l’écran (${v.cartes})`);
    check(v.clientsVie.length > 0 && v.clientsVie.every((d) => SORTES.includes(d)) && v.ev.deguises === v.ev.clients, `les clients sont des enfants déguisés des neuf sortes (${v.clientsVie.join(', ')}), bâtis ainsi (${v.ev.deguises}/${v.ev.clients})`);
    check(v.ev.compagnon === 'ecureuil', `l’écureuil sur le comptoir (${v.ev.compagnon})`);
    const EQ3 = await ev(() => BOUTIQUE_MARCHE.HD.EQUIPE3);
    if (qual === 'eco') {
      check(!v.ev.hd && v.ev.bougies >= 5 && v.ev.tenue !== undefined, `le repli procédural : ${v.ev.bougies} lampions, la boulangerie en Halle (colombages, étal, auvent)`);
      const ids = v.ev.apprentis.map((a) => a.i).sort();
      check(JSON.stringify(ids) === '[1,2,4]' && v.ev.apprentis.every((a) => a.costume === EQUIPE[a.i]), `les apprentis : les amis de la forêt des trois postes embauchés les plus avancés (postes ${ids.join(', ')} : ${v.ev.apprentis.map((a) => a.costume).join(', ')})`);
    } else {
      const ids = v.ev.apprentis.map((a) => a.i);
      check(v.ev.hd && JSON.stringify(ids) === '[0,1,2,4]' && v.ev.apprentis.every((a) => a.costume === EQ3[a.i]), `en haute, toute l'équipe embauchée à ses postes (postes ${ids.join(', ')} : ${v.ev.apprentis.map((a) => a.costume).join(', ')}), pas le poste sans son ami`);
      check(v.ev.patronne && v.ev.lumieres > 0 && v.ev.lumieres <= 8 && v.ev.bougies >= 10, `la marchande derrière l'étal ; ${v.ev.lumieres} lumières (≤ 8) ; ${v.ev.bougies} halos`);
      const hd = demandes.filter((p) => /hd\/(marche|hantee3)\//.test(p)), uniques = new Set(hd), poids = [...uniques].reduce((a, p) => a + fs.statSync(path.join(root, p)).size, 0);
      check(hd.length === uniques.size && uniques.has('/fournil/hd/marche/decor-marche.glb') && poids <= 2.4e6, `le lot HD de la Halle : ${uniques.size} fichiers demandés une fois chacun (${[...uniques].map((p) => path.basename(p)).join(', ')}), ${(poids / 1e6).toFixed(2)} Mo (≤ 2,4 Mo)`);
      check(!demandes.some((p) => /decor-hante|hd\/hantee\/|\/mini\//.test(p)), 'ni le décor de la boutique hantée, ni le Manoir, ni les Mini Characters');
    }
    // embaucher l'ami du 4e poste
    await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.postes[3].staff = true; q.postes[3].actif = true; });
    const attendu = qual === 'eco' ? '[2,3,4]' : '[0,1,2,3,4]';
    check(await attendre(() => ev((x) => { const e = window.__fournil.SCENE.evenement; return JSON.stringify(e.apprentis.map((a) => a.i).sort()) === x && e.apprentis.every((a) => a.bati); }, attendu), 15000), `un ami embauché arrive à son poste (Hortense la chouette) : ${attendu}`);
    await remplir(ev); await sleep(qual === 'haute' ? 4000 : 2500);
    await attendre(async () => { await ev(() => VIE.vente(0, 10, '+10', true)); await sleep(400); return (await ev(() => BOUTIQUE_MARCHE.acteurs().filter((a) => a.etat === 'file').length)) >= 3; }, 20000); // pour la capture : du monde en file
    await shot(page, `${qual}-salle`);

    // ─── l'API des activités, appelée à la main ───
    const F0 = await fenetre(ev);
    const ac = await ev(() => BOUTIQUE_MARCHE.acteurs());
    const roles = new Set(ac.map((a) => a.role)), etats = new Set(ac.filter((a) => a.role === 'client').map((a) => a.etat));
    check(ac.length > 3 && roles.has('client') && roles.has('apprenti') && ac.every((a) => a.x >= F0.l - 1 && a.x <= F0.r + 1 && a.y >= F0.haut - 80 && a.y <= F0.bas) && ac.every((a) => ['client', 'apprenti', 'patronne'].includes(a.role)) && [...etats].every((e) => ['entre', 'file', 'assis', 'sort'].includes(e)),
      `acteurs() : ${ac.length} dans la fenêtre (${[...roles].join(', ')} ; clients ${[...etats].join(', ')}), le haut de la tête en pixels (ex. ${ac[0] && `${ac[0].id} ${ac[0].sorte} ${ac[0].x},${ac[0].y}`})`);
    check(etats.has('assis') && (await ev(() => window.__fournil.SCENE.assisEn.table)) > 0, 'des enfants assis aux tables');
    check(await attendre(() => ev(() => BOUTIQUE_MARCHE.acteurs().some((a) => a.etat === 'file')), 10000), 'et des enfants en file à l’étal');
    const enFile = await ev(() => BOUTIQUE_MARCHE.acteurs().find((a) => a.etat === 'file'));
    const cl = await ev((id) => BOUTIQUE_MARCHE.client(id), enFile.id);
    check(cl && cl.id === enFile.id && cl.role === 'client' && SORTES.includes(cl.sorte), `client(${enFile.id}) : ${cl && cl.sorte}, ${cl && cl.etat}`);
    const sv = await ev((id) => { const r = BOUTIQUE_MARCHE.servir(id), c = VIE.clients.find((x) => 'c' + x.id === id); return { r, etat: c && VIE.etatClient(c), humeur: c && c.humeur, joie: c && c.joie }; }, enFile.id);
    check(sv.r === true && sv.etat === 'sort' && sv.humeur === 'content' && sv.joie > 0, `servir(${enFile.id}) : il repart content (${sv.etat}, ${sv.humeur}, fête ${sv.joie && sv.joie.toFixed(1)} s)`);
    if (qual === 'haute') check(await attendre(() => ev((id) => { const a = BOUTIQUE_MARCHE.acteurs().find((x) => x.id === id); return !!a && a.clip === 'Cheer'; }, enFile.id), 3000), 'l’enfant servi fait Cheer avant de sortir');
    const autre = await ev(() => { const a = BOUTIQUE_MARCHE.acteurs().find((x) => x.role === 'client' && (x.etat === 'file' || x.etat === 'entre')); return a ? a.id : null; });
    if (autre) { const fa = await ev((id) => { const r = BOUTIQUE_MARCHE.fache(id), c = VIE.clients.find((x) => 'c' + x.id === id); return { r, humeur: c && c.humeur, etat: c && VIE.etatClient(c) }; }, autre); check(fa.r && fa.humeur === 'fache' && fa.etat === 'sort', `fache(${autre}) : il repart sans payer (${fa.etat})`); }
    check(await ev(() => BOUTIQUE_MARCHE.servir('c999999') === false && BOUTIQUE_MARCHE.client('c999999') === null), 'un client qui n\'existe pas : servir rend false, client rend null');
    // (les apparitions des règles attendent une heure : une qui passerait d'elle-même, sur une machine lente, fausserait le compte des trois de l'API)
    await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); if (q.manoir) q.manoir.prochaineApp = HORLOGE.maintenant() + 3600e3; for (const a of BOUTIQUE_MARCHE.apparitions()) BOUTIQUE_MARCHE.retirer(a.id); });
    // (une traversée d'une minute : elles avancent au temps réel, et une traversée de 6 à 10 s finissait pendant la capture qui suit, en haute)
    const ids = await ev(() => ['feuille', 'chataigne', 'champignon'].map((t) => BOUTIQUE_MARCHE.apparition(t, 60)));
    await sleep(700);
    let ap = await ev(() => BOUTIQUE_MARCHE.apparitions());
    check(ids.every((i) => typeof i === 'number') && ap.length === 3 && ap.every((a) => a.r >= 22 && Number.isFinite(a.x) && Number.isFinite(a.y)) && new Set(ap.map((a) => a.type)).size === 3, `trois apparitions : la feuille d'or, la châtaigne, le champignon (${ap.map((a) => `${a.type} ${a.x},${a.y} r${a.r}`).join(' ; ')})`);
    await shot(page, `${qual}-apparitions`);
    await ev(() => { window.__touches = []; BOUTIQUE_MARCHE.surToucher((t) => window.__touches.push(t)); });
    const toucherA = (x, y) => ev(([x, y]) => document.querySelector('#marche .pq-scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true })), [x, y]);
    ap = await ev(() => BOUTIQUE_MARCHE.apparitions()); const cible = ap.find((a) => a.y > F0.haut + 10 && a.y < F0.bas - 10 && a.x > 5 && a.x < 385) || ap[0];
    await toucherA(cible.x, cible.y);
    const clVu = await ev(() => { const ap = BOUTIQUE_MARCHE.apparitions(); return BOUTIQUE_MARCHE.acteurs().find((a) => a.role === 'client' && a.etat === 'assis' && ap.every((p) => Math.hypot(p.x - a.x, p.y - a.y - 14) > 50)); });
    if (clVu) await toucherA(clVu.x, clVu.y + 14);
    await toucherA(F0.l + 4, F0.haut + 4);
    const touches = await ev(() => window.__touches);
    check(touches[0] && touches[0].genre === 'apparition' && touches[0].id === cible.id, `surToucher : un toucher sur l'apparition ${cible.type} → ${JSON.stringify(touches[0])}`);
    check(!clVu || (touches[1] && touches[1].genre === 'client' && touches[1].id === clVu.id), `surToucher : un toucher sur un enfant assis → ${JSON.stringify(touches[1])}`);
    check(touches[touches.length - 1] && touches[touches.length - 1].genre === 'vide', `surToucher : un toucher dans le coin du mur → ${JSON.stringify(touches[touches.length - 1])}`);
    const pris = await ev((id) => BOUTIQUE_MARCHE.attraper(id), cible.id); await sleep(200);
    check(pris === true && (await ev(() => BOUTIQUE_MARCHE.apparitions().length)) === 2 && await ev((id) => !BOUTIQUE_MARCHE.attraper(id), cible.id), 'attraper(id) : l\'apparition éclate en étincelles et s\'en va (une seule fois)');
    check(await ev(() => BOUTIQUE_MARCHE.fete()) === true, 'fete() : les confettis, et les enfants font la fête');
    const lum = () => ev(() => { let k = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.isLight) k += o.intensity; }); return k; });
    await sleep(500); const l1 = await lum();
    await ev(() => BOUTIQUE_MARCHE.ambiance({ actif: 0 })); let l0 = l1; await attendre(async () => (l0 = await lum()) < l1 * 0.7, 5000);
    check(l0 < l1 * 0.7, `ambiance({ actif: 0 }) : la lumière baisse (${l1.toFixed(1)} → ${l0.toFixed(1)})`);
    await shot(page, `${qual}-ambiance-basse`);
    await ev(() => BOUTIQUE_MARCHE.ambiance({ actif: 1 })); await sleep(300);

    // le budget : tout au max, des clients partout, de jour et le soir (les lampions)
    await complet(ev); await sleep(qual === 'haute' ? 3000 : 2000); await remplir(ev); await sleep(2500);
    let pire = { decor: 0, tout: 0, calls: 0 };
    for (const h of [11, 18.5, 20.5]) { // (le jour ; le soir : les lampions s'allument à 18 h ; le crépuscule : tout allumé)
      await ev((h) => window.__fournil.scene({ heure: h }), h); await sleep(qual === 'haute' ? 1800 : 900);
      const a = await decorAppels(ev), calls = await ev(() => window.__fournil.SCENE.stats.calls); if (a.tout + calls > pire.tout + pire.calls) pire = Object.assign({ h, calls }, a);
      if (h > 12) await shot(page, `${qual}-${h < 20 ? 'soir' : 'crepuscule'}`);
    }
    if (qual === 'eco') check(pire.decor <= 72, `éco, la Halle au complet : au pire ${pire.decor} appels de dessin pour le décor (≤ 72, à ${pire.h} h) — ${Object.entries(pire.a).filter(([k]) => /^mc|marche|produits|deco|petits|lueurs$/.test(k)).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    else check(pire.tout <= 120 && pire.calls <= 120, `haute, la Halle au complet : ${pire.tout} maillages visibles (personnages skinnés compris : ${pire.a.acteurs} pour ${await ev(() => window.__fournil.SCENE.stats.acteurs)} personnages) et ${pire.calls} appels de dessin mesurés (≤ 120, à ${pire.h} h)`);
    console.log(`        budget ${qual} : décor ${pire.decor}, tout ${pire.tout}, appels mesurés ${pire.calls} (à ${pire.h} h)`);
    await shot(page, `${qual}-complet`);
    if (qual === 'haute') { // le processeur ralenti ×4 : le temps de calcul d'une image (simulation, enfants, rendu soumis)
      const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const m = await ev(async () => { const S = window.__fournil.SCENE, v = []; for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(r)); v.push(S.stats.cpu); } v.sort((a, b) => a - b); return { med: v[20], p90: v[36] }; });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      console.log(`        processeur ×4 : ${m.med.toFixed(1)} ms par image (médiane), ${m.p90.toFixed(1)} ms (90 %), rendu logiciel compris`);
      check(m.med < 40, `processeur ×4 : le calcul d'une image tient (${m.med.toFixed(1)} ms médiane)`);
    }
    await ev(() => window.__fournil.scene({ heure: 11 }));

    // le retour à la boutique : propre
    await ev(() => document.querySelector('#marche [data-pq="fermer"]').click());
    await attendre(() => ev(() => !window.__fournil.SCENE.evenement && VIE.Q.id !== 'marche' && !window.__fournil.SCENE.appelsParGroupe.marche && !window.__fournil.SCENE.appelsParGroupe.hd), 20000); await sleep(800);
    v = await vue(ev);
    check(!v.ouvert && !v.ev && v.mode === '' && v.theme !== 'marche' && !v.classe && !v.corps && v.tiroir === 'visible', `le retour : la boutique reprend son thème (${v.theme}), sa vie (mode « ${v.mode} »), son tiroir ; plus de classes de la Halle`);
    const lesRestes = () => ev(() => { let n = 0; const noms = []; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && (o.userData.hd3 || o.userData.mc)) { n++; if (noms.length < 4) noms.push(o.name || o.type); } }); return { n, noms, fog: !!window.__fournil.SCENE.trois.scene.fog, hd3: !!window.__fournil.SCENE.hd3 }; });
    let restes = await lesRestes(); await attendre(async () => { restes = await lesRestes(); return !restes.n && !restes.fog && !restes.hd3; }, 10000);
    check(v.clientsVie.every((d) => !d) && restes.n === 0 && !restes.fog && !restes.hd3, `plus aucun enfant déguisé ni personnage de la Halle dans la boutique (${v.clientsVie.length} clients ; restes ${restes.n}${restes.noms.length ? ' : ' + restes.noms.join(', ') : ''}, brouillard ${restes.fog}, HD de l'événement ${restes.hd3})`);
    const ap2 = await decorAppels(ev), maxB = qual === 'haute' ? 80 : 72;
    check(ap2.decor <= maxB && !ap2.a.marche, `la boutique au retour : ${ap2.decor} appels pour le décor (≤ ${maxB}), sans le décor de la Halle`);
    await shot(page, `${qual}-retour`);

    // trois allers-retours : la mémoire ne monte pas (les géométries et les textures, mesurées dans la boutique, au retour)
    const mems = [];
    for (let k = 1; k <= 3; k++) {
      await ev(() => window.__fournil.marche()); await attendre(() => ev((q) => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati) && (q !== 'haute' || e.hd); }, qual), 20000); await sleep(1200);
      const e = await ev(() => window.__fournil.SCENE.evenement);
      const tot = await ev(() => { const F = window.__fournil; F.fermerMarche(); const n = VIE.clients.length; // une vente et un habitué dans la même image, avant toute frame de la boutique
        for (let j = 0; j < 4; j++) F.SCENE.vente(0, 10, '+10', true); VIE.habitue({ id: 'essai-retour', nom: 'Essai', haut: '#88AACC', cheveux: '#553322', peau: '#F1C7A5', coiffure: 1 });
        return { mode: VIE.mode, vueEv: !!VIE.vueEv, theme: VIE.Q && VIE.Q.id, nouveaux: VIE.clients.slice(n).map((c) => c.deg || '') }; });
      if (k === 1) check(tot.mode === '' && !tot.vueEv && tot.theme !== 'marche' && tot.nouveaux.length > 0 && tot.nouveaux.every((d) => !d), `fermer puis vendre dans la même image : les clients entrent sans capuche d'animal (${tot.nouveaux.length}), au thème ${tot.theme}`);
      await attendre(() => ev(() => VIE.Q.id !== 'marche' && !window.__fournil.SCENE.appelsParGroupe.marche), 20000); await sleep(900);
      const m = await memoire(ev); mems.push(m); console.log(`        aller-retour ${k} : ${e.clients} clients bâtis, ${e.apprentis.length} amis de la forêt${e.hd ? ' (HD)' : ''} ; au retour ${m.g} géométries, ${m.t} textures`);
    }
    check(mems[2].t <= mems[0].t && mems[2].g <= mems[0].g + 6, `trois allers-retours : la mémoire est stable (géométries ${mems.map((m) => m.g).join(' → ')}, textures ${mems.map((m) => m.t).join(' → ')})`);
    if (qual === 'eco') check(!demandes.some((p) => /hd\/marche\//.test(p)), `en éco, aucun fichier du lot HD de la Halle demandé (${demandes.filter((p) => /hd\/marche\//.test(p)).length})`);

    // ─── dans la boutique : les décos du Marché gagnées (leurs places d'origine), la saison posée, la visite d'un copain ───
    if (qual === 'eco') {
      console.log('── la boutique : les décos du Marché et de la saison ──');
      await ev(() => { const F = window.__fournil; F.st.tuto = 99; for (const m of F.G.MOBILIER) F.st.mobilier[m.id] = m.max; F.scene({ heure: 11 }); F.tiroir('ferme'); });
      await ev((l) => window.__fournil.SCENE.decosMarche(l), DECOS_MARCHE.concat(['album-argent']));
      check(await attendre(() => ev((n) => window.__fournil.SCENE.decosMarcheVues.length === n, DECOS_MARCHE.length), 10000), 'les sept décos du Marché gagnées, dans la boutique');
      await sleep(1200);
      const dv = await ev(() => { const S = window.__fournil.SCENE; return { vues: S.decosMarcheVues, teinte: S.teinteAlbum, fusion: S.fusionVue, boites: S.decosBoites }; });
      check(dv.vues.join() === DECOS_MARCHE.join() && dv.teinte === 'argent', `à leurs places d'origine : ${dv.vues.join(', ')} ; l'étagère aux peluches à la teinte de l'album (${dv.teinte})`);
      check(dv.fusion.liste.every((x) => typeof x[1] === 'string' && !/^[mscrx]\d$/.test(x[1])) && dv.fusion.parts <= dv.fusion.maxParts, `chacune bâtie à sa place de toujours (aucune place typée ; ${dv.fusion.parts} parties vives sur ${dv.fusion.maxParts})`);
      const L = await ev(() => ({ W: VIE.LAY.W, H: VIE.LAY.H }));
      const hors = Object.entries(dv.boites).filter(([id]) => DECOS_MARCHE.includes(id)).filter(([, r]) => r.x < -2 || r.y < -2 || r.x + r.w > L.W + 2 || r.y + r.h > L.H + 2).map(([id]) => id);
      check(!hors.length, `aucune hors de l'écran ${hors.join(', ')}`);
      const a0 = await decorAppels(ev);
      check(a0.decor <= 72 && (a0.a.petits || 0) + (a0.a.lueurs || 0) <= 3, `tout le mobilier au max, avec les décos du Marché : ${a0.decor} appels pour le décor (≤ 72 ; le pire cas de la capitale : test/fournil-decos.cjs), ${(a0.a.petits || 0) + (a0.a.lueurs || 0)} pour les décos fusionnées`);
      await shot(page, 'boutique-decos-marche');
      await ev(() => window.__fournil.scene({ heure: 18.5 })); await sleep(1200); await shot(page, 'boutique-decos-marche-soir'); await ev(() => window.__fournil.scene({ heure: 11 }));
      // la saison : ses cinq décos posées à des places de leur type
      await ev((l) => window.__fournil.SCENE.decos(l), SAISON);
      check(await attendre(() => ev((n) => { const S = window.__fournil.SCENE, p = S.decosPosees || []; return p.length + (S.decosEnAttente || []).length === n; }, SAISON.length), 15000), 'les cinq décos de la saison posées (ou en attente de leur place)');
      await sleep(1200);
      const ps = await ev(() => { const S = window.__fournil.SCENE; return { p: S.decosPosees, att: S.decosEnAttente, a: S.appelsParGroupe, boites: S.decosBoites }; });
      const posees = ps.p.map((x) => x[0]);
      check(posees.length >= 4 && posees.every((id) => SAISON.some((s) => s[0] === id)) && posees.every((id) => ps.boites[id]), `la saison posée : ${ps.p.map((x) => x.join('@')).join(' ')}${ps.att.length ? ` (en attente : ${ps.att.join(', ')})` : ''}`);
      const a1 = await decorAppels(ev);
      check(a1.decor <= 72 && (a1.a.petits || 0) + (a1.a.lueurs || 0) <= 3, `avec la saison posée : ${a1.decor} appels pour le décor (≤ 72), les décos fusionnées en ${(a1.a.petits || 0) + (a1.a.lueurs || 0)} (≤ 3)`);
      await shot(page, 'boutique-decos-saison');
      await ev(() => window.__fournil.SCENE.decos(null));
      // la visite d'un copain qui a les décos du Marché : sa photo (CLASSEMENT.photo, champ dm), relue (boutiqueDepuisPhoto), posée comme ui.js
      await ev(() => window.__fournil.SCENE.decosMarche([]));
      const vis = await ev(() => { const F = window.__fournil, st = JSON.parse(JSON.stringify(F.st)); st.marche = { decos: ['cagettes', 'tonneau', 'arbre-or', 'album', 'album-argent', 'album-or'] };
        const ph = CLASSEMENT.photo(st, { G: F.G, coupes: [], badge: false, dh: [], dm: st.marche.decos }), b = CLASSEMENT.boutiqueDepuisPhoto(ph, { G: F.G, maintenant: HORLOGE.maintenant() });
        F.SCENE.decosQuartier(b.decosQuartier); F.SCENE.decosHantee(b.decosHantee); F.SCENE.decosMarche(b.decosMarche || []); return { dm: ph.dm, decos: b.decosMarche }; });
      check(await attendre(() => ev(() => window.__fournil.SCENE.decosMarcheVues.length === 4), 10000), `la visite d'un copain : sa photo porte ses décos du Marché (dm : ${JSON.stringify(vis.dm)})`);
      const vv = await ev(() => ({ vues: window.__fournil.SCENE.decosMarcheVues, teinte: window.__fournil.SCENE.teinteAlbum }));
      check(vv.vues.join() === 'cagettes,tonneau,album,arbre-or' && vv.teinte === 'or', `ses décos dans sa boutique : ${vv.vues.join(', ')}, l'étagère dorée (${vv.teinte})`);
      await sleep(800); await shot(page, 'visite-copain-decos-marche');
      await ev(() => window.__fournil.SCENE.decosMarche([]));
    }
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  console.log('── ?boutique=0 : l\'écran du Marché sans sa boutique (le repli, sans 3D) ──');
  {
    const { ctx, ev, erreurs } = await ouvrir('?qualite=eco&boutique=0');
    await ev(() => window.__fournil.marche()); await sleep(1500);
    const v = await vue(ev);
    check(v.ouvert && !v.classe && !v.ev && v.mode === '' && v.theme !== 'marche', `l'écran du Marché s'ouvre sans la Halle : ni 3D d'événement ni Manoir d'Halloween, la boutique n'est pas touchée (${v.theme})`);
    check(await ev(() => BOUTIQUE_MARCHE.acteurs().length === 0 && BOUTIQUE_MARCHE.apparition('feuille') === null), 'l\'API de la Halle ne fait rien sans elle');
    await ev(() => window.__fournil.fermerMarche()); await sleep(500);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est vert.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
