// « Ma chaîne de boutiques », l'écran, dans la vraie page du Fournil (fournil/ servi en local), sur un iPhone 390 × 844.
// Une vieille sauvegarde arrêtée à la boutique n°13 : ses 12 anciennes boutiques sont rouvertes à neuf, UNE seule fois (recharger ne les recrée
// pas). « Ma chaîne » : la petite planète et la liste. Entrer dans la n°10 : la scène montre la gare au standing 1 (G.quartier et G.standing de
// la vue), les clients de la boulangerie ne sont pas dans sa salle (VIE.basculer). Franchir un palier avec sa caisse, puis « Prendre 1 jeton ».
// Le premier gérant, offert. Une absence de 10 h : « Tes gérants ont rapporté… », exactement 8 h ; recharger ne repaie pas. La boutique des
// jetons (un boost par semaine) et le carnet « Mes décos » (poser, ranger). Une nouvelle boutique : l'ancienne dans la chaîne avec ses niveaux.
// La boulangerie n'a pas bougé (lifetime, lifetimeRun, points, jour, stats identiques). Le décor d'une boutique de la chaîne : ≤ 72 appels en
// éco. Trois allers-retours planète → boutique → boulangerie : la mémoire GPU (renderer.info.memory) stable. La version d'essai côté écran :
// la vraie partie copiée sous les clés de l'essai (la sienne intacte), le bandeau ; sans vraie partie, la feuille « coller le code ».
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
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
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
    await fermerFeuille(); await ev(() => { const f = window.__fournil; f.st.tuto = 99; f.scene({ heure: 11 }); });
  };
  const capture = async (nom) => { await sleep(300); await page.screenshot({ path: path.join(out, nom + '.png') }); };
  // ce qui ne doit jamais bouger dans la boulangerie quand on joue dans la chaîne (contrat § 1.7)
  const boulangerie = () => ev(() => { const s = window.__fournil.st; return JSON.stringify({ lifetime: s.lifetime, lifetimeRun: s.lifetimeRun, coins: s.coins, points: s.points, jour: s.jour, stats: s.stats, apprentis: s.apprentis, xp: s.xp, stations: s.stations.map((x) => x.niv), mobilier: s.mobilier, amenagement: s.amenagement || null, boutiques: s.boutiques, etoiles: s.etoiles }); });

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
  const memAvant = await ev(() => { const s = window.__fournil.SCENE.stats; return { g: s.geometries, t: s.textures }; });
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
  check(/Boutique n°10 · Ma chaîne/.test(hudTxt.bandeau) && /Le Fournil de la Gare n°10/.test(hudTxt.bandeau) && hudTxt.retour === 'Revenir à ma boulangerie', `le bandeau : « ${hudTxt.bandeau.trim().slice(0, 70)} », et « ${hudTxt.retour} »`);
  check(hudTxt.cartes >= 8 && !hudTxt.principale && /^0/.test(hudTxt.coins), `ses cartes (${hudTxt.cartes} recettes), sa caisse (${hudTxt.coins}), les cartes de la boulangerie cachées`);
  await sleep(1200); await capture('boutique-chaine');
  // le budget du décor dans une boutique de la chaîne (éco)
  const appels = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return decor; });
  check(appels <= 72, `le décor de la n°10 : ${appels} appels de dessin (≤ 72 en éco)`);

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
  await ev(() => window.__fournil.chaine.carnet(0));
  const cn = await ev(() => ({ familles: document.querySelectorAll('#feuille .cn-famille:not(.avenir)').length, avenir: document.querySelectorAll('#feuille .cn-famille.avenir').length, origine: /plan d’origine/.test(document.querySelector('#feuille .cn-compte').textContent) }));
  check(cn.familles >= 10 && cn.avenir === 3 && cn.origine, `le carnet : ${cn.familles} familles avec leur compteur, 3 « à venir » ; la boulangerie au plan d’origine`);
  await page.tap('#feuille [data-poser="chaine-cloche"]');
  const choix = await ev(() => [...document.querySelectorAll('#feuille .cn-places [data-place]')].map((b) => b.dataset.place).filter(Boolean));
  check(choix.length === 2 && choix.every((p) => /^c/.test(p)), `deux places libres sur le comptoir : le carnet demande où (${choix.join(', ')})`);
  await capture('carnet-place');
  await page.tap(`#feuille .cn-places [data-place="${choix[1]}"]`);
  const pose = await ev(() => { const s = window.__fournil.st; return { d: s.decos && s.decos.d, liste: s.decos ? CHAINE.decosDepuisCode(s.decos.d) : null, compte: document.querySelector('#feuille .cn-compte').textContent }; });
  check(pose.liste && pose.liste.some((x) => x[0] === 'chaine-cloche' && x[1] === 'c2') && /1\/6 posées/.test(pose.compte), `la cloche posée sur le comptoir de la boulangerie (st.decos.d = « ${pose.d} », ${pose.compte})`);
  await capture('carnet');
  await page.tap('#feuille [data-ranger="chaine-cloche"]');
  check(await ev(() => /0\/6 posées/.test(document.querySelector('#feuille .cn-compte').textContent)), 'rangée : 0/6 posées');
  await ev(() => { document.querySelectorAll('#feuille details.repli').forEach((d) => { d.open = true; }); }); await ev(() => { document.querySelector('#feuille').scrollTop = 900; }); await capture('carnet-familles');
  await fermerFeuille();

  console.log('── trois allers-retours planète → boutique → boulangerie : la mémoire GPU stable ──');
  const mem = [];
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
    mem.push(await ev(() => { const s = window.__fournil.SCENE.stats; return { g: s.geometries, t: s.textures }; }));
  }
  check(mem[2].g <= mem[0].g + 2 && mem[2].t <= mem[0].t + 1 && mem[0].g <= memAvant.g + 40, `géométries ${memAvant.g} → ${mem.map((m) => m.g).join(' → ')} ; textures ${memAvant.t} → ${mem.map((m) => m.t).join(' → ')}`);
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

  check(erreurs.length === 0, `aucune erreur dans la console${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est vert.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
