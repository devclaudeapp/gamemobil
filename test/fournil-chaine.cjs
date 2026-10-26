// « Ma chaîne de boutiques », l'écran, dans la vraie page du Fournil (fournil/ servi en local), sur un iPhone 390 × 844.
// Une vieille sauvegarde arrêtée à la boutique n°13 : ses 12 anciennes boutiques sont rouvertes à neuf, UNE seule fois (recharger ne les recrée
// pas). « Ma chaîne » : la petite planète et la liste. Entrer dans la n°10 : la scène montre la gare au standing 1 (G.quartier et G.standing de
// la vue), les clients de la boulangerie ne sont pas dans sa salle (VIE.basculer). Franchir un palier avec sa caisse, puis « Prendre 1 jeton ».
// Le premier gérant, offert. Une absence de 10 h : « Tes gérants ont rapporté… », exactement 8 h ; recharger ne repaie pas. La boutique des
// jetons (un boost par semaine) et le carnet « Mes décos » (poser, ranger). Une nouvelle boutique : l'ancienne dans la chaîne avec ses niveaux.
// La boulangerie n'a pas bougé (lifetime, lifetimeRun, points, jour, stats identiques). Le décor d'une boutique de la chaîne : ≤ 72 appels en
// éco. Le bandeau est hors de la scène : aucune déco ni petit décor du mur ou de la fenêtre dessous ; à 360 × 640, ni le nom ni la ligne du
// haut ne sont coupés. La déco d'office d'une boutique pendant une saison (c1 et c2 tenues) : le carnet dit « Pas de place ce mois-ci ».
// Trois allers-retours planète → boutique → boulangerie : la mémoire GPU (renderer.info.memory, relue stable) stable. La version d'essai côté écran :
// la vraie partie copiée sous les clés de l'essai (la sienne intacte), le bandeau ; sans vraie partie, la feuille « coller le code ».
// L'heure sûre en retard au lancement (12 h d'absence) : le gérant touche 8 h pour cette absence, pas plus, ni au saut d'heure, ni à
// l'ouverture de « Ma chaîne », ni à l'encaissement d'une minute plus tard (≈ 70 s d'attente).
// Aucune erreur dans la console. Captures dans test/shots/chaine/ (ou CAPTURES_CHAINE).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-chaine.cjs   (PORT_CHAINE, défaut 8890)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_CHAINE || 8890;
const out = process.env.CAPTURES_CHAINE || path.join(__dirname, 'shots', 'chaine'); fs.mkdirSync(out, { recursive: true });
const G = require(path.join(root, 'src', 'game.js'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await f()) return true; } catch (e) { /* la page se recharge */ } await sleep(150); } return false; };
let decalServeur = 0; // (l'heure du serveur, en avance d'autant : une vraie absence, le serveur et le téléphone avancent ensemble)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  res.setHeader('Date', new Date(Date.now() + decalServeur).toUTCString());
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);

// la vieille sauvegarde : arrêtée à la boutique n°13, d'avant le lot (pas de st.chaine), des étoiles, quelques recettes SANS apprenti (la
// boulangerie ne vend rien toute seule : son lifetime ne bouge pas pendant le test, on peut la comparer octet pour octet)
function vieille() {
  const t = Date.now(), s = G.newState(t - 60e3);
  s.boutiques = 13; s.etoiles = 180; s.xp = 4000; s.tuto = 99; s.lifetime = 4.2e12; s.lifetimeRun = 3.1e9; s.coins = 2.5e6; s.lastSeen = t - 60e3; s.nomBoutique = 'Chez Treize';
  s.stations.forEach((x, i) => { x.niv = i < 6 ? 30 + i : 0; x.staff = false; x.actif = false; x.prog = 0; });
  delete s.chaine; delete s.decos;
  return JSON.stringify(s);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const seed = vieille();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript((seed) => { window.__sansEvenements = true; window.__sansQuartier = true; try { if (!localStorage.getItem('fournil.v2') && !sessionStorage.getItem('graine')) { localStorage.setItem('fournil.v2', seed); sessionStorage.setItem('graine', '1'); } } catch (e) { /* rien */ } }, seed);
  await ctx.addInitScript(() => { window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true }); });
  await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  const fermerFeuille = () => ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); });
  const ouvrir = async (q) => {
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=${q || 'eco'}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900);
    await fermerFeuille(); await ev(() => { const f = window.__fournil; f.st.tuto = 99; f.st.chatAttente = 1e9; f.scene({ heure: 11 }); }); // (le chat de la porte ne vient pas : sa feuille couvrirait l'écran)
  };
  const capture = async (nom) => { await sleep(300); await page.screenshot({ path: path.join(out, nom + '.png') }); };
  // ce qui ne doit jamais bouger dans la boulangerie quand on joue dans la chaîne (contrat § 1.7)
  const boulangerie = () => ev(() => { const s = window.__fournil.st; return JSON.stringify({ lifetime: s.lifetime, lifetimeRun: s.lifetimeRun, coins: s.coins, points: s.points, jour: s.jour, stats: s.stats, apprentis: s.apprentis, xp: s.xp, stations: s.stations.map((x) => x.niv), mobilier: s.mobilier, amenagement: s.amenagement || null, boutiques: s.boutiques, etoiles: s.etoiles }); });

  // chaque mesure attend que renderer.info.memory ne bouge plus (deux lectures égales à 500 ms d'écart) : un modèle HD ou un décor fusionné
  // encore en route au moment de la lecture faisait varier le compte d'un tour à l'autre (la borne, elle, ne change pas)
  const memStable = async () => { let a = null; for (let k = 0; k < 24; k++) { const m = await ev(() => { const s = window.__fournil.SCENE.stats; return { g: s.geometries, t: s.textures }; }); if (a && a.g === m.g && a.t === m.t) return m; a = m; await sleep(500); } return a; };

  console.log('── la vieille sauvegarde à la n°13 : la chaîne recréée une seule fois ──');
  await ouvrir('eco');
  const e0 = await ev(() => { const c = window.__fournil.chaine.etat; return { n: c.b.map((b) => b.n), cree: c.cree, neuves: c.b.every((b) => b.s.length === 1 && b.s[0] === 1 && b.c === 0 && !b.g), q10: c.b.find((b) => b.n === 10).q, gare: window.__fournil.G.QUARTIERS.findIndex((q) => q.id === 'gare') }; });
  check(e0.n.length === 12 && e0.n[0] === 1 && e0.n[11] === 12 && e0.cree === 1 && e0.neuves, `12 boutiques rouvertes à neuf, n°1 à 12 (cree = ${e0.cree})`);
  check(e0.q10 === e0.gare, 'la n°10 rouvre dans son quartier d’aujourd’hui : la gare');
  await ev(() => { const c = window.__fournil.chaine.etat; c.b[0].c = 1234; window.__fournil.save(); });
  await ouvrir('eco');
  const e1 = await ev(() => { const c = window.__fournil.chaine.etat; return { n: c.b.length, c1: c.b[0].c }; });
  check(e1.n === 12 && e1.c1 === 1234, `recharger ne recrée rien : 12 boutiques, la caisse de la n°1 gardée (${e1.c1} €)`);
  const avant = await boulangerie();
  const coin = await ev(() => { const b = document.querySelector('#b-chaine'); return { vu: !!b && !b.hidden, label: b && b.getAttribute('aria-label') }; });
  check(coin.vu && /12 boutiques/.test(coin.label), `l’icône de la planète dans le coin de la boutique (« ${coin.label} »)`);

  console.log('── « Ma chaîne » : la planète en haut, la liste dessous ──');
  await page.tap('#b-chaine');
  check(await attendre(() => ev(() => window.__fournil.chaine.ecranOuvert && document.querySelectorAll('#chaine .ch-ligne').length === 12)), 'l’écran s’ouvre : 12 lignes dans la liste');
  const pl = await ev(() => ({ planete: CHAINE_ECRAN.planete, stats: PLANETE.stats ? { boutiques: PLANETE.stats.boutiques, calls: PLANETE.stats.calls } : null, note: document.querySelector('#chaine .ch-note').textContent }));
  check(pl.planete && pl.stats && pl.stats.boutiques === 12, `la petite planète montre les ${pl.stats && pl.stats.boutiques} boutiques (${pl.stats && pl.stats.calls} appels de dessin)`);
  check(/quartier d’aujourd’hui/.test(pl.note), 'une fois : « Tes anciennes boutiques rouvrent dans leur quartier d’aujourd’hui »');
  await sleep(1600); await capture('ma-chaine');
  // le premier gérant, offert (n°3)
  await page.tap('#chaine .ch-ligne[data-n="3"] [data-a="embaucher-gerant"]');
  const g3 = await ev(() => { const c = window.__fournil.chaine.etat; return { g: c.b.find((b) => b.n === 3).g, jetons: c.jetons }; });
  check(Array.isArray(g3.g) && g3.g[0] === 0 && g3.jetons === 0, 'le premier gérant est offert (n°3 : gérant au niveau 0, aucun jeton dépensé)');
  const ligne3 = await ev(() => document.querySelector('#chaine .ch-ligne[data-n="3"] .ch-gerant').textContent.replace(/\s+/g, ' '));
  check(/Un gérant la fait tourner/.test(ligne3) && /10 % du rythme · 8 h · encore 8 h/.test(ligne3), `sa ligne : « ${ligne3.trim().slice(0, 60)}… »`);
  await capture('ma-chaine-liste');

  console.log('── entrer dans la n°10 (la gare, standing 1) ──');
  const memAvant = await memStable();
  await ev(() => { const b = document.querySelector('#chaine .ch-ligne[data-n="10"]'); b.scrollIntoView({ block: 'center' }); });
  await sleep(400);
  await page.tap('#chaine .ch-ligne[data-n="10"] [data-a="entrer"]');
  check(await attendre(() => ev(() => window.__fournil.chaine.n === 10 && !window.__fournil.chaine.ecranOuvert)), 'la boutique n°10 s’ouvre, l’écran de la chaîne se referme');
  const v10 = await ev(() => { const f = window.__fournil, v = f.chaine.vue; return { estSt: v === f.st, q: f.G.QUARTIERS[f.G.quartier(v)].id, s: f.G.standing(v), mode: VIE.mode, clients: VIE.nClients, n: v.chaineN, visite: v.visite }; });
  check(!v10.estSt && v10.n === 10 && v10.visite, 'la vue n’est jamais st (chaineN 10, visite)');
  check(v10.q === 'gare' && v10.s === 1, `G.quartier(vue) : ${v10.q} ; G.standing(vue) : ${v10.s}`);
  check(v10.mode === 'chaine' && v10.clients === 0, `les clients de la boulangerie ne sont pas dans sa salle (VIE.mode ${v10.mode}, ${v10.clients} client)`);
  check(await attendre(() => ev(() => { const v = window.__fournil.SCENE.standingVu; return v.decor === 'gare-s1' && v.palier === 1; }), 20000), 'la scène montre la gare au standing 1 (décor gare-s1)');
  const hudTxt = await ev(() => ({ bandeau: document.querySelector('#chaine-bandeau').textContent.replace(/\s+/g, ' '), retour: document.querySelector('#chaine-bandeau [data-cb="retour"]').getAttribute('aria-label'), coins: document.querySelector('#coins').textContent, cartes: document.querySelectorAll('#chaine-cartes .carte:not([hidden])').length, principale: !document.querySelector('#cartes').hidden }));
  // (la ligne du haut : « N°10 · Ma chaîne », raccourcie pour tenir à 360 px ; « Boutique n°10 · Ma chaîne » y était coupée)
  check(/N°10 · Ma chaîne/.test(hudTxt.bandeau) && /Le Fournil de la Gare n°10/.test(hudTxt.bandeau) && hudTxt.retour === 'Revenir à ma boulangerie', `le bandeau : « ${hudTxt.bandeau.trim().slice(0, 70)} », et « ${hudTxt.retour} »`);
  check(hudTxt.cartes >= 8 && !hudTxt.principale && /^0/.test(hudTxt.coins), `ses cartes (${hudTxt.cartes} recettes), sa caisse (${hudTxt.coins}), les cartes de la boulangerie cachées`);
  await sleep(1200); await capture('boutique-chaine');
  // le bandeau est hors de la scène : six décos au mur et à la fenêtre (m1 à m4, r1, r2), et les petits décors (horloge, diplôme…), aucune dessous
  const sousBandeau = async (l) => {
    if (l) { await ev((l) => window.__fournil.SCENE.decos(l), l); await sleep(1500); }
    return ev(() => { const S = window.__fournil.SCENE, sc = document.querySelector('#scene').getBoundingClientRect(), bd = document.querySelector('#chaine-bandeau').getBoundingClientRect(), wrap = document.querySelector('#scene-wrap').getBoundingClientRect(), out = [];
      for (const [id, q] of Object.entries(S.decosBoites || {})) { const x = sc.left + q.x + q.w / 2, y = sc.top + q.y + q.h / 2, e = document.elementFromPoint(x, y); if (!e || e.closest('#chaine-bandeau')) out.push(id); }
      return { sous: out, n: Object.keys(S.decosBoites || {}).length, posees: (S.decosPosees || []).length, bas: Math.round(bd.bottom), haut: Math.round(wrap.top) }; });
  };
  const murs = [['souvenir-montagne', 'm1'], ['souvenir-gare', 'm2'], ['souvenir-cimes', 'm3'], ['souvenir-chateau', 'm4'], ['souvenir-mer', 'r1'], ['souvenir-ville', 'r2']];
  const sb = await sousBandeau(murs);
  check(sb.posees === 6 && sb.n >= 6 && sb.sous.length === 0 && sb.bas <= sb.haut, `le bandeau au-dessus de la scène (bas ${sb.bas} ≤ haut de la scène ${sb.haut}) : ${sb.posees} décos au mur et à la fenêtre, ${sb.n} boîtes, aucune dessous${sb.sous.length ? ' (' + sb.sous.join(', ') + ')' : ''}`);
  await capture('boutique-chaine-murs');
  await ev(() => { const f = window.__fournil; f.SCENE.decos(CHAINE.posesDe(f.chaine.vue.b)); }); await sleep(600);
  // le budget du décor dans une boutique de la chaîne (éco)
  const appels = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return decor; });
  check(appels <= 72, `le décor de la n°10 : ${appels} appels de dessin (≤ 72 en éco)`);

  // les clients servis sans place assise repartent tout de suite (ils ne s'arrêtent pas pour fêter leur achat, comme dans la Maison hantée)
  // (une affluence de coup de feu le temps de la mesure : assez de clients servis pour la voir, quel que soit le tirage)
  await ev(() => VIE.setRush(true));
  let sorts = 0, fetes = 0; const t0c = Date.now();
  while (Date.now() - t0c < 30000 && sorts < 4) { const r = await ev(() => { let s = 0, f = 0; for (const c of VIE.clients || []) if (c.etat === 'sort') { s++; if (c.joie > 0) f++; } return { s, f }; }); sorts += r.s; fetes += r.f; await sleep(250); }
  await ev(() => VIE.setRush(false));
  check(sorts > 0 && fetes === 0, `les clients servis repartent sans s’arrêter : ${fetes} sur ${sorts} relevés « sort » font la fête (la Maison hantée seule)`);

  console.log('── franchir un palier, puis « Prendre 1 jeton » ──');
  await ev(() => { const v = window.__fournil.chaine.vue; v.coins = 1e7; v.b.c = v.coins; });
  await page.tap('.modes button[data-mode="10"]');
  for (let k = 0; k < 3; k++) { await page.tap('#chaine-cartes .carte[data-i="0"] [data-a="ameliorer"]'); await sleep(150); }
  const p1 = await ev(() => { const v = window.__fournil.chaine.vue; return { niv: v.stations[0].niv, jp: v.b.jp, s0: v.b.s[0], bouton: !!document.querySelector('#chaine-bandeau [data-cb="prendre"]') }; });
  check(p1.niv === 31 && p1.s0 === 31 && p1.jp === 1 && p1.bouton, `la baguette de la n°10 passe au niveau ${p1.niv} (palier 25 franchi) : ${p1.jp} jeton à prendre, le bouton dans le bandeau`);
  check(await ev(() => window.__toasts.some((t) => /Palier franchi : \+1 jeton/.test(t))), 'le message « Palier franchi : +1 jeton à prendre »');
  await capture('boutique-chaine-palier');
  await page.tap('#chaine-bandeau [data-cb="prendre"]');
  const p2 = await ev(() => { const f = window.__fournil; return { jetons: f.chaine.etat.jetons, gagnes: f.chaine.etat.gagnes, jp: f.chaine.vue.b.jp, haut: document.querySelector('#b-jetons span').textContent }; });
  check(p2.jetons === 1 && p2.gagnes === 1 && p2.jp === 0 && p2.haut === '1', `« Prendre 1 jeton » : 1 jeton de chaîne (en haut : ${p2.haut})`);
  // une fournée à la main dans la vue : sa caisse monte, pas celle de la boulangerie
  const caisseAvant = await ev(() => window.__fournil.chaine.vue.coins);
  await page.tap('#chaine-cartes .carte[data-i="1"] [data-a="debloquer"]').catch(() => {});
  await page.tap('#chaine-cartes .carte[data-i="0"] .barre');
  await attendre(() => ev((c) => window.__fournil.chaine.vue.coins > c - 1e6 && !window.__fournil.chaine.vue.stations[0].actif, caisseAvant), 6000);
  check(await ev(() => window.__fournil.chaine.vue.coins === window.__fournil.chaine.vue.b.c), 'la caisse affichée est celle de la boutique (vue.coins = b.c)');

  console.log('── revenir à la boulangerie : la boulangerie n’a pas bougé ──');
  await page.tap('#chaine-bandeau [data-cb="retour"]');
  check(await attendre(() => ev(() => !window.__fournil.chaine.vue && VIE.mode === '' && !document.body.classList.contains('chaine-dans'))), 'retour : plus de vue, VIE revenue à la boulangerie, ses cartes revenues');
  const b10 = await ev(() => { const b = window.__fournil.chaine.etat.b.find((x) => x.n === 10); return { s: b.s, c: b.c }; });
  check(b10.s[0] === 31 && b10.c > 0, `la n°10 garde ses niveaux (baguette ${b10.s[0]}) et sa caisse (${Math.round(b10.c)} €) dans st.chaine`);
  check(await boulangerie() === avant, 'la boulangerie : lifetime, lifetimeRun, caisse, points, jour, stats, apprentis, xp, stations… identiques');

  console.log('── l’absence de 10 h : les gérants, exactement 8 h ; recharger ne repaie pas ──');
  await page.tap('#b-chaine'); await attendre(() => ev(() => window.__fournil.chaine.ecranOuvert));
  await ev(() => window.__fournil.chaine.fermerEcran());
  const abs = await ev(() => { const r = window.__fournil.chaine.absence(10 * 3600e3); return { total: r.enc.total, detail: r.enc.detail, feuille: document.querySelector('#feuille-contenu').textContent.replace(/\s+/g, ' ') }; });
  const d3 = abs.detail.find((d) => d.n === 3);
  check(abs.detail.length === 1 && d3 && d3.secs === 8 * 3600 && d3.gain > 0, `un seul gérant (n°3) : payé ${d3 && d3.secs / 3600} h sur 10 (${d3 && Math.round(d3.gain)} €)`);
  check(/Tes gérants ont rapporté/.test(abs.feuille) && /dans les caisses de ta chaîne/.test(abs.feuille), 'la feuille du retour : « Tes gérants ont rapporté… »');
  await capture('retour-gerants');
  const c3 = await ev(() => window.__fournil.chaine.etat.b.find((b) => b.n === 3).c);
  await ev(() => window.__fournil.save());
  await ouvrir('eco');
  const c3b = await ev(() => window.__fournil.chaine.etat.b.find((b) => b.n === 3).c), part = await ev(() => { const s = window.__fournil.st, b = window.__fournil.chaine.etat.b.find((x) => x.n === 3); return CHAINE.partGerant(b) * CHAINE.rythme(s, b); });
  check(c3b >= c3 && c3b - c3 < part * 120, `recharger ne repaie pas : +${Math.round(c3b - c3)} € (les secondes du rechargement, moins de 2 min de gérant)`);

  console.log('── la boutique des jetons, le carnet « Mes décos » ──');
  await ev(() => window.__fournil.chaine.donnerJetons(80));
  await ev(() => window.__fournil.chaine.jetons('boosts'));
  await page.tap('#feuille [data-b="x2"]');
  const bo = await ev(() => ({ reserve: window.__fournil.st.boosts.reserve.slice(-1)[0], restants: CHAINE.boostsRestants(window.__fournil.st, HORLOGE.maintenant()), txt: document.querySelector('#feuille-contenu').textContent }));
  check(bo.reserve && bo.reserve.mult === 2 && bo.reserve.secs === 1800 && bo.restants === 0 && /Pris cette semaine/.test(bo.txt), 'le boost ×2 de 30 min dans la réserve ; « Pris cette semaine » : un par semaine');
  await capture('boutique-jetons-boosts');
  await page.tap('#feuille [data-r="gerants"]'); await capture('boutique-jetons');
  await page.tap('#feuille [data-r="objets"]'); await page.tap('#feuille [data-o="chaine-cloche"]');
  check(await ev(() => window.__fournil.chaine.etat.objets.includes('chaine-cloche')), 'la cloche du gérant achetée (45 jetons) : elle rejoint le carnet');
  await fermerFeuille();
  await ev(() => window.__fournil.scene({ heure: 11, saison: [] })); await sleep(300); // (hors saison : la recette de saison ne tient pas c2, quel que soit le jour du test)
  await ev(() => window.__fournil.chaine.carnet(0));
  const cibles = await ev(() => [...document.querySelectorAll('#feuille .cn-btn')].map((b) => Math.round(b.getBoundingClientRect().height)));
  check(cibles.length > 0 && cibles.every((h) => h >= 44), `les « Poser » / « Ranger » du carnet : ${cibles.length} boutons de ${Math.min(...cibles)} px de haut au moins (≥ 44)`);
  const cn = await ev(() => ({ familles: document.querySelectorAll('#feuille .cn-famille:not(.avenir)').length, avenir: document.querySelectorAll('#feuille .cn-famille.avenir').length, origine: /plan d’origine/.test(document.querySelector('#feuille .cn-compte').textContent) }));
  check(cn.familles >= 10 && cn.avenir === 3 && cn.origine, `le carnet : ${cn.familles} familles avec leur compteur, 3 « à venir » ; la boulangerie au plan d’origine`);
  await page.tap('#feuille [data-poser="chaine-cloche"]');
  // (une place tenue par un décor automatique de la scène, la recette de saison en c2 ou les fleurs en c1, est marquée « prise » : on pose à l'autre)
  const choix = await ev(() => [...document.querySelectorAll('#feuille .cn-places [data-place]')].filter((b) => b.dataset.place).map((b) => ({ p: b.dataset.place, prise: b.classList.contains('prise'), auto: !!(window.__fournil.SCENE.placesDecos.find((q) => q.id === b.dataset.place) || {}).auto })));
  const ici = (choix.find((c) => !c.prise) || {}).p;
  check(choix.length === 2 && choix.every((c) => /^c/.test(c.p) && c.prise === c.auto) && !!ici, `deux places sur le comptoir : le carnet demande où (${choix.map((c) => c.p + (c.prise ? ' prise' : '')).join(', ')})`);
  const hPlaces = await ev(() => [...document.querySelectorAll('#feuille .cn-places .cn-place')].map((b) => Math.round(b.getBoundingClientRect().height)));
  check(hPlaces.length === 3 && hPlaces.every((h) => h >= 44), `le choix de la place : ${hPlaces.join(', ')} px de haut (≥ 44)`);
  await capture('carnet-place');
  await page.tap(`#feuille .cn-places [data-place="${ici}"]`);
  const pose = await ev(() => { const s = window.__fournil.st; return { d: s.decos && s.decos.d, liste: s.decos ? CHAINE.decosDepuisCode(s.decos.d) : null, compte: document.querySelector('#feuille .cn-compte').textContent }; });
  check(pose.liste && pose.liste.some((x) => x[0] === 'chaine-cloche' && x[1] === ici) && /1\/6 posées/.test(pose.compte), `la cloche posée sur le comptoir de la boulangerie, ${ici} (st.decos.d = « ${pose.d} », ${pose.compte})`);
  await capture('carnet');
  await page.tap('#feuille [data-ranger="chaine-cloche"]');
  check(await ev(() => /0\/6 posées/.test(document.querySelector('#feuille .cn-compte').textContent)), 'rangée : 0/6 posées');
  await ev(() => { document.querySelectorAll('#feuille details.repli').forEach((d) => { d.open = true; }); }); await ev(() => { document.querySelector('#feuille').scrollTop = 900; }); await capture('carnet-familles');
  await fermerFeuille();
  console.log('── la déco d’office pendant une saison ; le carnet d’une boutique ; le bandeau et « Ma chaîne » à 360 × 640 ──');
  {
    // la n°6 (le village : le petit moulin, sur le comptoir) pendant Halloween : la recette de saison tient c2 ; si les fleurs tiennent c1, le
    // moulin attend : le carnet le dit (« Pas de place ce mois-ci »), sinon il dit la place où il est vraiment
    await ev(() => { const f = window.__fournil; f.scene({ heure: 11, saison: ['halloween', 'feuilles'] }); f.chaine.ouvrir(6); }); await sleep(1800);
    const sc6 = await ev(() => { const S = window.__fournil.SCENE; return { office: CHAINE.posesDe(window.__fournil.chaine.vue.b), auto: S.placesDecos.filter((p) => p.auto).map((p) => p.id), attente: S.decosEnAttente, posees: S.decosPosees }; });
    await ev(() => window.__fournil.chaine.carnet(6)); await sleep(300);
    const cn6 = await ev(() => { const li = document.querySelector('#feuille [data-ranger="souvenir-village"]'), o = li && li.closest('.cn-objet'); return { txt: o ? o.querySelector('small').textContent : '', ou: document.querySelector('#feuille .cn-ici b').textContent, compte: document.querySelector('#feuille .cn-compte').textContent }; });
    const reel = (sc6.posees || []).find((x) => x[0] === 'souvenir-village');
    check(sc6.office.length === 1 && sc6.office[0][1] === 'c2' && sc6.auto.includes('c2'), `la déco d’office au comptoir : le moulin en c2 (la recette de saison la tient : ${sc6.auto.join(', ')} automatiques)`);
    check(sc6.attente.includes('souvenir-village') ? cn6.txt === 'Pas de place ce mois-ci' && /en attente/.test(cn6.compte) : !!reel && cn6.txt === `Posée : ${{ c1: 'le comptoir, aux fleurs', c2: 'le comptoir, à la recette' }[reel[1]]}`,
      `le carnet dit ce que montre la salle (${sc6.attente.length ? 'en attente' : 'posé en ' + (reel && reel[1])}) : « ${cn6.txt} », ${cn6.compte}`);
    check(cn6.ou === 'Au Fournil du Village n°6', `le carnet d’une boutique : « ${cn6.ou} » (son numéro une seule fois)`);
    await capture('carnet-office-saison');
    await fermerFeuille(); await ev(() => window.__fournil.chaine.fermer()); await ev(() => window.__fournil.scene({ heure: 11 })); await sleep(1100);
    // à 360 × 640, dans la n°8 (« Le Fournil de la Plage n°8 ») avec « Prendre 208 » : rien de coupé dans le bandeau, rien dessous
    await page.setViewportSize({ width: 360, height: 640 }); await sleep(500);
    await ev(() => { const f = window.__fournil, b = f.chaine.etat.b.find((x) => x.n === 8); b.jp = 208; f.chaine.ouvrir(8); }); await sleep(1600);
    const coupe = (sel) => ev((sel) => { const e = document.querySelector(sel); return e ? { w: e.scrollWidth - e.clientWidth, h: e.scrollHeight - e.clientHeight, txt: e.textContent } : null; }, sel);
    const nom = await coupe('#chaine-bandeau .cb-nom'), haut = await coupe('#chaine-bandeau .cb-titre small');
    check(nom && haut && nom.w <= 0 && nom.h <= 1 && haut.w <= 0, `à 360 × 640 : « ${haut && haut.txt} » et « ${nom && nom.txt} » entiers (dépassent de ${nom && nom.w}/${nom && nom.h} et ${haut && haut.w} px)`);
    const sb360 = await sousBandeau(murs);
    check(sb360.posees === 6 && sb360.sous.length === 0, `à 360 × 640 : les décos du mur et de la fenêtre, aucune sous le bandeau${sb360.sous.length ? ' (' + sb360.sous.join(', ') + ')' : ''}`);
    await capture('boutique-chaine-360');
    await ev(() => { const f = window.__fournil; f.chaine.vue.b.jp = 0; f.chaine.fermer(); }); await sleep(1100);
    await ev(() => window.__fournil.chaine.ecran()); await attendre(() => ev(() => window.__fournil.chaine.ecranOuvert)); await sleep(600);
    const sous = await coupe('#chaine .ch-sous');
    check(sous && sous.w <= 0 && /12 boutiques · 1 gérant/.test(sous.txt), `« Ma chaîne » à 360 × 640 : « ${sous && sous.txt} » entier`);
    await capture('ma-chaine-360');
    await ev(() => window.__fournil.chaine.fermerEcran()); await page.setViewportSize({ width: 390, height: 844 }); await sleep(800);
  }

  // le mode Déplacer (Aménager) : une déco posée se prend au doigt, aimantée à une place de son type (vert, CHAINE.peutPoser), et le lâcher
  // écrit st.decos (la fusion : ui.js → VIE.proposerDeco → SCENE.glisserDeco / setDeplacerDecos)
  const tiroirAvant = await ev(() => { const f = window.__fournil, t = f.tiroir(); f.tiroir('ferme'); f.st.decos = { v: 1, d: CHAINE.codeDecos([['chaine-statue', 's1']]) }; f.save(); f.SCENE.decos([['chaine-statue', 's1']]); f.amenager(true); return t; });
  await sleep(600);
  const hDecos = await ev(() => Math.round(document.querySelector('#b-decos').getBoundingClientRect().height));
  check(hDecos >= 44, `« Mes décos » dans Aménager : ${hDecos} px de haut (≥ 44)`);
  await ev(() => document.querySelector('#b-deplacer').click()); await sleep(400);
  const plD = await ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(), c = (id) => { const q = VIE.LAY.decos.find((x) => x.id === id).r; return [r.left + q.x + q.w / 2, r.top + q.y + q.h / 2]; }; return { s1: c('s1'), s3: c('s3') }; });
  await page.mouse.move(...plD.s1); await page.mouse.down(); await page.mouse.move(plD.s1[0] + 20, plD.s1[1] + 5, { steps: 4 }); await page.mouse.move(...plD.s3, { steps: 8 }); await sleep(300);
  const gd = await ev(() => { const S = window.__fournil.SCENE, g = S.glisseDeco; return { dd: S.deplacerDecos, place: g && g.place, ok: g && g.ok }; });
  await capture('decos-deplacer');
  await page.mouse.up(); await sleep(600);
  const gd2 = await ev(() => { const f = window.__fournil; return { dd: f.SCENE.deplacerDecos, poses: CHAINE.decosDepuisCode(f.st.decos.d), scene: f.SCENE.decosPosees }; });
  check(gd.dd && gd.place === 's3' && gd.ok && !gd2.dd && JSON.stringify(gd2.poses) === '[["chaine-statue","s3"]]' && (gd2.scene || []).some((x) => x[0] === 'chaine-statue' && x[1] === 's3'),
    `le mode Déplacer : la statue prise au doigt, en vert sur s3 (${gd.place}, ${gd.ok}), lâchée : st.decos = ${JSON.stringify(gd2.poses)}, la scène suit`);
  await ev((t) => { const f = window.__fournil; f.amenager(false); delete f.st.decos; f.SCENE.decos(null); f.save(); f.tiroir(t); }, tiroirAvant); await sleep(400);

  console.log('── trois allers-retours planète → boutique → boulangerie : la mémoire GPU stable ──');
  // la référence du premier tour : memBoucle, la boulangerie juste avant la boucle (et non plus memAvant, lue avant la n°10) : les contrôles
  // ajoutés entre les deux (six souvenirs au mur, la déco d'office, la statue) bâtissent des géométries que la scène garde en cache, 35 à 40
  // de plus selon le tirage ; ce n'est pas la boucle. La borne du premier tour (+40) et celle des tours suivants (+2, +1) ne changent pas.
  const memBoucle = await memStable(), mem = [];
  for (let k = 0; k < 3; k++) {
    await sleep(1100);
    await page.tap('#b-chaine'); await attendre(() => ev(() => window.__fournil.chaine.ecranOuvert && CHAINE_ECRAN.planete));
    await sleep(700);
    await ev(() => PLANETE.viser(7)); // la planète tourne et zoome, puis son étiquette et son « Entrer »
    check(await attendre(() => ev(() => PLANETE.stats && PLANETE.stats.etiquette), 6000), `${k + 1}) la n°7 touchée sur la planète : son étiquette`);
    if (k === 0) await capture('planete-etiquette');
    await page.tap('#chaine .pl-etiquette .pl-et-entrer');
    check(await attendre(() => ev(() => window.__fournil.chaine.n === 7)), `${k + 1}) « Entrer » : la boutique n°7`);
    await sleep(1300);
    await page.tap('#chaine-bandeau [data-cb="retour"]'); await attendre(() => ev(() => !window.__fournil.chaine.vue));
    await sleep(1500);
    mem.push(await memStable());
  }
  check(mem[2].g <= mem[0].g + 2 && mem[2].t <= mem[0].t + 1 && mem[0].g <= memBoucle.g + 40, `géométries ${memAvant.g} (avant la n°10), ${memBoucle.g} → ${mem.map((m) => m.g).join(' → ')} ; textures ${memAvant.t}, ${memBoucle.t} → ${mem.map((m) => m.t).join(' → ')}`);
  check(await ev(() => !PLANETE.ouvert), 'la planète refermée (son contexte WebGL rendu)');

  console.log('── une nouvelle boutique : l’ancienne rejoint la chaîne avec ses niveaux ──');
  const niveaux = await ev(() => window.__fournil.st.stations.map((x) => x.niv));
  await ev(() => { const s = window.__fournil.st; s.lifetimeRun = 5e15; s.defi = null; window.__fournil.etoiles(); });
  await page.tap('#feuille [data-a="prestige"]'); await sleep(200);
  check(await ev(() => /rejoint ta chaîne telle qu’elle est/.test(document.querySelector('#feuille-contenu').textContent)), 'la confirmation le dit : elle rejoint ta chaîne telle qu’elle est');
  await page.tap('#feuille [data-a="oui"]'); await sleep(500);
  const n13 = await ev(() => { const f = window.__fournil, b = f.chaine.etat.b.find((x) => x.n === 13); return { boutiques: f.st.boutiques, b: b ? { s: b.s, nm: b.nm, c: b.c } : null, total: f.chaine.etat.b.length }; });
  const attendu = niveaux.slice(); while (attendu.length > 1 && attendu[attendu.length - 1] === 0) attendu.pop();
  check(n13.boutiques === 14 && n13.total === 13 && n13.b && JSON.stringify(n13.b.s) === JSON.stringify(attendu) && n13.b.nm === 'Chez Treize', `la n°13 dans la chaîne, avec ses niveaux (${n13.b && n13.b.s.join(',')}) et son nom ; la boulangerie est la n°${n13.boutiques}`);
  await fermerFeuille(); await fermerFeuille();

  console.log('── la version d’essai, côté écran : la copie, le bandeau ; sans vraie partie, « coller le code » ──');
  {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await c2.addInitScript((seed) => {
      window.__sansEvenements = true; window.__sansQuartier = true;
      window.FOURNIL_ESSAI = { prefixe: 'fournil.essai.', db: 'fournil-essai', vraie: { cle: 'fournil.v2', db: 'fournil' } };
      window.FOURNIL_CLE = (k) => k.replace(/^fournil\./, 'fournil.essai.');
      try { if (!sessionStorage.getItem('graine')) { localStorage.setItem('fournil.v2', seed); localStorage.setItem('fournil.classement', JSON.stringify({ id: 'secret-id', jeton: 'secret-jeton', pseudo: 'Moi', podiums: [] })); sessionStorage.setItem('graine', '1'); } } catch (e) { /* rien */ }
    }, seed);
    await c2.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const p2 = await c2.newPage(); p2.on('pageerror', (e) => erreurs.push('essai : ' + e.message));
    await p2.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await p2.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(1500);
    const es = await p2.evaluate(() => { const f = window.__fournil; return { copie: !!f.st.essaiCopie, boutiques: f.st.boutiques, chaine: f.chaine.etat.b.length, vraie: localStorage.getItem('fournil.v2'), essai: !!localStorage.getItem('fournil.essai.v2'), cl: localStorage.getItem('fournil.essai.classement'), bandeau: !document.querySelector('#essai-bandeau').hidden, texte: document.querySelector('#essai-bandeau').textContent }; });
    check(es.copie && es.boutiques === 13 && es.chaine === 12 && es.essai, `l’essai copie la vraie partie (n°${es.boutiques}, 12 boutiques dans sa chaîne), sauvée sous fournil.essai.v2`);
    check(es.vraie === seed, 'la clé du vrai jeu (fournil.v2) reste identique, octet pour octet');
    check(!!es.cl && !/secret/.test(es.cl) && /Moi/.test(es.cl), 'les coupes copiées dans fournil.essai.classement, SANS id ni jeton');
    check(es.bandeau && /Version d’essai · ta vraie partie n’est pas touchée/.test(es.texte), 'le bandeau « Version d’essai · ta vraie partie n’est pas touchée »');
    const bases = await p2.evaluate(() => (indexedDB.databases ? indexedDB.databases().then((l) => l.map((d) => d.name)) : null));
    check(!bases || !bases.includes('fournil'), `aucune base « fournil » créée par l’essai (${bases ? bases.join(', ') : '—'})`);
    await p2.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
    // le « ? » : la zone qui répond vraiment au doigt (balayée par elementFromPoint), 44 px de large sur toute la hauteur du bandeau
    const q = await p2.evaluate(() => { const bd = document.querySelector('#essai-bandeau').getBoundingClientRect(), b = document.querySelector('#essai-bandeau [data-a="essai"]'); let n = 0, h = 0;
      for (let x = Math.floor(bd.left); x < bd.right; x++) { const e = document.elementFromPoint(x + 0.5, bd.top + bd.height / 2); if (e && (e === b || b.contains(e))) n++; }
      for (let y = Math.floor(bd.top); y < bd.bottom; y++) { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, y + 0.5); if (e && (e === b || b.contains(e))) h++; }
      return { n, h, haut: Math.round(bd.height) }; });
    check(q.n >= 44 && q.h >= q.haut, `le « ? » du bandeau d’essai : ${q.n} px de large sous le doigt (≥ 44), ${q.h} px de haut (tout le bandeau, ${q.haut} px)`);
    await p2.screenshot({ path: path.join(out, 'essai-bandeau.png') });
    await p2.tap('#essai-bandeau [data-a="essai"]'); await sleep(300); await p2.screenshot({ path: path.join(out, 'essai-feuille.png') });
    await c2.close();
    // sans vraie partie (un iPhone : le jeu de l'écran d'accueil garde sa sauvegarde à part)
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await c3.addInitScript(() => { window.__sansEvenements = true; window.FOURNIL_ESSAI = { prefixe: 'fournil.essai.', db: 'fournil-essai', vraie: { cle: 'fournil.v2', db: 'fournil' } }; window.FOURNIL_CLE = (k) => k.replace(/^fournil\./, 'fournil.essai.'); });
    await c3.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const p3 = await c3.newPage(); p3.on('pageerror', (e) => erreurs.push('essai vide : ' + e.message));
    await p3.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await p3.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
    check(await attendre(() => p3.evaluate(() => /Ta vraie partie n’est pas ici/.test(document.querySelector('#feuille-contenu').textContent) && !!document.querySelector('#feuille [data-r="entree"]')), 6000), 'sans vraie partie : la feuille « coller le code » (ou commencer une partie neuve)');
    await sleep(300); await p3.screenshot({ path: path.join(out, 'essai-coller-code.png') });
    await c3.close();
  }

  console.log('── l’heure sûre en retard au lancement : le gérant, 8 h pour une absence de 12 h, ni plus au saut, ni une minute après ──');
  {
    // le téléphone : son heure avance avec celle du serveur (test.tel, relue à chaque chargement) ; une vieille sauvegarde à la n°3, le gérant
    // offert à la n°1 ; puis 12 h d'absence, l'heure sûre retardée de 4,5 s au lancement (le jeu démarre sur l'heure du téléphone, le saut suit)
    const fauxTelephone = () => { let d = 0; try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* rien */ }
      const D = Date; class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } }
      window.Date = FauxDate; window.__sansEvenements = true; window.__sansQuartier = true; };
    const s0 = G.newState(Date.now() - 60e3); s0.boutiques = 3; s0.tuto = 99; s0.lastSeen = Date.now() - 60e3; delete s0.chaine;
    const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await c4.addInitScript(fauxTelephone);
    await c4.addInitScript((seed) => { try { if (!localStorage.getItem('fournil.v2') && !sessionStorage.getItem('graine')) { localStorage.setItem('fournil.v2', seed); sessionStorage.setItem('graine', '1'); } } catch (e) { /* rien */ } }, JSON.stringify(s0));
    await c4.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    let p4 = await c4.newPage(); p4.on('pageerror', (e) => erreurs.push('heure en retard : ' + e.message));
    const pret = async () => { await p4.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800); };
    await p4.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await pret();
    const e4 = await p4.evaluate(() => { const st = window.__fournil.st, r = CHAINE.embaucherGerant(st, 1, HORLOGE.maintenant()); window.__fournil.save(); return r.ok; });
    // la page fermée AVANT que l'heure du serveur avance (ouverte, elle redemanderait l'heure sûre et verrait le serveur sauter de 12 h : un
    // saut payé sur l'ancienne page, puis une autre absence au lancement — pas le cas mesuré ici) ; le téléphone avancera au prochain chargement
    await p4.evaluate((d) => { window.__fournil.save(); localStorage.setItem('test.tel', String(d)); }, 12 * 3600e3); await p4.close();
    decalServeur = 12 * 3600e3;
    p4 = await c4.newPage(); p4.on('pageerror', (e) => erreurs.push('heure en retard : ' + e.message));
    await p4.route('**/*heure=*', async (r) => { await sleep(4500); try { await r.continue(); } catch (e) { /* rien */ } });
    await p4.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await pret();
    const heures = () => p4.evaluate(() => { const st = window.__fournil.st, b = CHAINE.boutique(st, 1), r = CHAINE.partGerant(b) * CHAINE.rythme(st, b); const j = st.journalRetours || [], k = j.map((x) => x.r).lastIndexOf('lancement');
      return { h: b.c / r / 3600, src: HORLOGE.info().source, feuille: (document.querySelector('#feuille-contenu') || {}).textContent || '', lancement: k >= 0 ? j[k] : null, apres: k >= 0 ? j.slice(k + 1).map((x) => x.r) : [] }; });
    const h1 = await heures();
    // (le journal des retours dit sur quelle heure le lancement a compté : h = 0, celle du téléphone, l'heure sûre pas encore là)
    check(e4 && h1.lancement && h1.lancement.h === 0 && Math.abs(h1.h - 8) < 0.01 && /Tes gérants ont rapporté/.test(h1.feuille), `au lancement, sur l’heure du téléphone (journal : h = ${h1.lancement && h1.lancement.h}) : ${h1.h.toFixed(3)} h payées au gérant, la feuille du retour le dit`);
    await attendre(() => p4.evaluate(() => HORLOGE.info().source !== 'telephone'), 12000);
    const h2 = await heures();
    await p4.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); window.__fournil.chaine.ecran(); }); await sleep(1500);
    const h3 = await heures(); await p4.evaluate(() => window.__fournil.chaine.fermerEcran());
    check(h2.src !== 'telephone' && h2.h < 8 + 0.01 && h3.h < 8 + 0.01, `l’heure sûre arrivée (${h2.src}) : ${h2.h.toFixed(3)} h, rien de plus pour le saut de 4 h ; « Ma chaîne » ouverte : ${h3.h.toFixed(3)} h`);
    await sleep(66000); // l'encaissement d'une minute en jouant (la boucle de l'écran)
    const h4 = await heures();
    check(h4.h < 8 + 75 / 3600, `une minute de jeu plus tard : ${h4.h.toFixed(3)} h (8 h et la minute jouée, jamais le saut : 12 h avant la réparation)`);
    // un lancement lent (l'heure sûre attendue, la 3D bâtie : plus de 5 s sur un téléphone chargé) n'est pas une page gelée : aucun retour
    // derrière lui (il payait le reste du saut comme une nouvelle absence, à la boulangerie comme aux gérants)
    check(h4.apres.length === 0, `aucun retour lancé derrière le lancement (${h4.apres.join(', ') || 'aucun'})`);
    decalServeur = 0; await c4.close();
  }

  check(erreurs.length === 0, `aucune erreur dans la console${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est vert.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
