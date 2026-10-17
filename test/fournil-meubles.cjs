// Les meubles de la salle du Fournil (lot A) : le plan (src/vie.js, LAY.sieges) et les clients qui s'y installent, sur la vraie page.
// 1) Sans navigateur : sur iPhone 390 × 844 et 360 × 640, chaque chemin vers une place (et le retour) longe les meubles sans les traverser,
//    et tout le plan tient au-dessus du tiroir fermé.
// 2) Dans Chromium : bar, coin salon et terrasse achetés, un client vient s'asseoir à chacun (au bar, sur la banquette, en terrasse) ;
//    les couverts restent cachés tant que personne n'est assis ; les zones de touche ouvrent la fiche de chaque meuble ; le budget
//    d'appels de dessin du décor tient, en éco et en haute (meubles KayKit, fournil/hd/meubles2/) ; aucune erreur dans la page.
// Captures 390×844 dans test/shots/meubles/.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-meubles.cjs   (--plan : la partie 1 seule)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_MEUBLES || 8870;
const out = path.join(__dirname, 'shots', 'meubles'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };

// ─── 1) le plan, sans navigateur ───
global.GAME = require(path.join(root, 'src', 'game.js'));
const VIE = require(path.join(root, 'src', 'vie.js'));
const SY = Math.sin(52 * Math.PI / 180);
function obstacles(L) { // l'emprise au sol de chaque meuble (en pixels du plan : x, et y projeté) : { nom, dedans(x, y) }
  const K = L.K, o = [], disque = (nom, x, y, r) => o.push({ nom, dedans: (px, py) => ((px - x) / r) ** 2 + ((py - y) / (r * SY)) ** 2 < 1 });
  const rect = (nom, x, y, w, d) => o.push({ nom, dedans: (px, py) => Math.abs(px - x) < w / 2 && Math.abs(py - y) < d * SY / 2 });
  L.tables.forEach((t, i) => { disque(`table ${i + 1}`, t.x, t.y, 16 * K); for (const s of t.sieges) rect(s.id, s.x, s.y, 13 * K, 14 * K); });
  L.terrasse.forEach((t, i) => { disque(`terrasse ${i + 1}`, t.x, t.y, 12 * K); for (const s of t.sieges) rect(s.id, s.x, s.y, 13 * K, 14 * K); });
  const b = L.bar; rect('bar', (b.x0 + b.x1) / 2, b.y - 2 * K, b.x1 - b.x0, 15 * K);
  for (const s of L.sieges) if (s.zone === 'bar') disque(s.id, s.x, s.y, 6 * K);
  const q = L.banquette, f = L.sieges.find((s) => s.id === 'fauteuil');
  rect('banquette', q.x, q.y - 3 * SY, 54 * K, 22 * K); rect('table basse', q.table.x, q.table.y, 28 * K, 16 * K); rect('fauteuil', f.x, f.y, 22 * K, 22 * K); disque('lampe', q.lampe.x, q.lampe.y, 6 * K);
  const dv = L.devanture; o.push({ nom: 'devanture', dedans: (px, py) => Math.abs(py - dv.y) < 4 && (px < dv.porte.x0 + 3 || px > dv.porte.x1 - 3) });
  const p = L.presentoir; o.push({ nom: 'présentoir', dedans: (px, py) => px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h });
  disque('plante', L.plante.x, L.plante.y, 9);
  return o;
}
function traverse(L, chemin, permis) { // le premier meuble qu'un chemin (liste de points) traverse, en dehors de ceux permis (sa place, sa table)
  const obs = obstacles(L).filter((x) => !permis.includes(x.nom));
  for (let i = 1; i < chemin.length; i++) {
    const a = chemin[i - 1], b = chemin[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
    for (let k = 0; k <= n; k++) { const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n; for (const ob of obs) if (ob.dedans(x, y)) return `${ob.nom} (${x | 0}, ${y | 0})`; }
  }
  return null;
}
for (const [w, h, mi, nom] of [[390, 716, 356, 'iPhone 390 × 844'], [360, 514, 229, 'iPhone 360 × 640']]) {
  console.log(`── le plan, ${nom} (scène ${w} × ${h}) ──`);
  VIE.resize(w, h, mi); const L = VIE.LAY;
  const parZone = {}; for (const s of L.sieges) parZone[s.zone] = (parZone[s.zone] || 0) + 1;
  check(parZone.table === 12 && parZone.bar === 4 && parZone.banquette === 3 && parZone.terrasse === 6 && L.sieges.every((s) => s.id && s.meuble && s.rang >= 0 && Array.isArray(s.voie)),
    `25 places nommées : ${JSON.stringify(parZone)} (12 aux tables, 4 tabourets, 3 au salon, 6 dehors)`);
  const ko = [];
  for (const s of L.sieges) {
    const permis = [s.id, s.zone === 'bar' ? 'bar' : '', s.table && s.zone === 'table' ? `table ${L.tables.indexOf(s.table) + 1}` : '', s.zone === 'terrasse' ? `terrasse ${L.terrasse.indexOf(s.table) + 1}` : '', s.zone === 'banquette' ? (s.id === 'fauteuil' ? 'fauteuil' : 'banquette') : ''].filter(Boolean);
    const aller = [{ x: L.allee, y: L.T * 0.76 }, ...s.voie, { x: s.x, y: s.y }];
    const retour = s.zone === 'terrasse' ? [{ x: s.x, y: s.y }, { x: s.x, y: L.trottoir.rue }, { x: s.x < w * 0.6 ? -20 : w + 20, y: L.trottoir.rue }] : [{ x: s.x, y: s.y }, ...s.voie.slice().reverse(), { x: L.allee, y: L.alleeHaut }];
    const t1 = traverse(L, aller, permis), t2 = traverse(L, retour, permis);
    if (t1 || t2) ko.push(`${s.id} : ${t1 ? 'aller → ' + t1 : ''} ${t2 ? 'retour → ' + t2 : ''}`);
  }
  check(ko.length === 0, `aucun chemin ne traverse un meuble (allées, porte de la devanture, rue) ${ko.slice(0, 4).join(' | ')}`);
  const bas = Math.max(...Object.values(L.emplacements).map((r) => r.y + r.h), L.trottoir.bord);
  check(bas <= h - 37, `tout le plan (jusqu'au bord du trottoir, ${bas | 0} px) tient au-dessus du tiroir fermé (${h - 37} px)`);
  check(L.rangees[0] + 4 < L.trottoir.y && L.bar.y < L.devanture.y && L.devanture.y < L.terrasse[0].y && L.terrasse[0].y < L.trottoir.bord, 'de haut en bas : les tables, le bar, la devanture, la terrasse, le bord du trottoir');
}

if (process.argv.includes('--plan')) { console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nLe plan passe.'); process.exit(fails ? 1 : 0); } // le plan seul (rapide)

// ─── 2) sur la vraie page ───
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(q, w, h) {
    const ctx = await browser.newContext({ viewport: { width: w || 390, height: h || 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=${q}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.give(1e13); f.scene({ heure: 11 }); f.tiroir('ferme'); });
    return { ctx, page, erreurs, ev: (f, a) => page.evaluate(f, a) };
  }
  const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { if (await f()) return true; } catch (e) { /* rien */ } await sleep(250); } return false; };

  console.log('── éco : acheter, s’asseoir ──');
  let { ctx, page, erreurs, ev } = await ouvrir('eco');
  check(await ev(() => { const z = window.__fournil.SCENE.zones(); return ['tables', 'bar', 'banquette', 'terrasse'].every((id) => z[id] && z[id].w >= 44 && z[id].h >= 44); }), 'pas encore achetés : chaque meuble de la salle a sa zone de touche (son emplacement en pointillés)');
  check(await ev(() => window.__fournil.SCENE.couverts === 0), 'personne d’assis : aucun couvert sur les tables');
  for (const id of ['bar', 'banquette', 'terrasse']) { // toucher l'emplacement ouvre la fiche du meuble (ui.js, sheetMeuble)
    const p = await ev((id) => { const r = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones()[id]; return { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2, hit: window.__fournil.SCENE.hitMeuble(z.x + z.w / 2, z.y + z.h / 2), nom: (window.__fournil.G.MOBILIER.find((m) => m.id === id) || {}).nom }; }, id);
    check(p.hit === id, `le doigt sur l’emplacement « ${id} » désigne ce meuble (hitMeuble : ${p.hit})`);
    const lire = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    await page.touchscreen.tap(p.x, p.y); await sleep(500);
    let fiche = await lire();
    if (!fiche) { // le premier toucher de la page peut tomber pendant que le tiroir finit de se replier : on dit ce qu'il y avait sous le doigt, et on recommence une fois
      const sous = await ev(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.className || e.tagName) + '' : '?'; }, p);
      console.log(`        (pas de fiche au premier toucher ; sous le doigt : ${sous}, tiroir ${await ev(() => window.__fournil.tiroir())} ; on recommence)`);
      await sleep(800); await page.touchscreen.tap(p.x, p.y); await sleep(600); fiche = await lire();
    }
    check(!!p.nom && fiche.includes(p.nom), `et sa fiche s’ouvre : « ${fiche.split('\n')[0]} »`);
    await ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.tiroir('ferme'); }); await sleep(300);
  }
  await page.screenshot({ path: path.join(out, 'apres-min-eco.png') });
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } });
  const places = await ev(() => window.__fournil.G.places(window.__fournil.st));
  check(places.tables === 6 && places.bar === 4 && places.banquette === 3 && places.terrasse === 6, `tout le mobilier au max : ${JSON.stringify(places)}`);
  for (const [zone, nom] of [['bar', 'au bar, sur un tabouret'], ['banquette', 'sur la banquette du coin salon'], ['terrasse', 'en terrasse']]) {
    await ev((z) => window.__fournil.scene({ heure: 11, assis: true, zone: z }), zone);
    const ok = await attendre(() => ev((z) => window.__fournil.SCENE.assisEn[z] > 0, zone), 90000);
    check(ok, `un client servi vient s’asseoir ${nom} (par l’allée${zone === 'terrasse' ? ' et la porte de la devanture' : ''})`);
  }
  { // un couvert devant chaque client assis : on compare au même instant (sur une machine lente, le client du bar a pu finir et repartir pendant qu'on attendait celui de la terrasse)
    const c = await ev(() => ({ couverts: window.__fournil.SCENE.couverts, assis: window.__fournil.SCENE.assis }));
    check(c.assis >= 1 && c.couverts >= c.assis, `les couverts sont posés devant les clients assis (${c.couverts} couverts, ${c.assis} assis)`); }
  await page.screenshot({ path: path.join(out, 'apres-clients-eco.png') });
  const ap = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, salle: a.tables + a.bar + a.banquette + a.terrasse + a.couverts }; });
  check(ap.decor <= 72 && ap.salle <= 7, `éco, tout au max : ${ap.decor} appels de dessin pour le décor (≤ 72), dont ${ap.salle} pour les tables, le bar, le salon, la terrasse et tous les couverts`);
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── haute : les meubles KayKit ──');
  ({ ctx, page, erreurs, ev } = await ouvrir('haute'));
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ });
  check(await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 90000), `en haute, les quatre meubles de la salle passent en KayKit (${(await ev(() => window.__fournil.SCENE.meublesHD)).join(', ')})`);
  await ev(() => { for (const z of ['bar', 'banquette', 'terrasse', 'table']) window.__fournil.SCENE.installer(z, 600); }); await sleep(2500);
  const as = await ev(() => window.__fournil.SCENE.assisEn);
  check(as.bar && as.banquette && as.terrasse && as.table, `des clients installés partout : ${JSON.stringify(as)}`);
  const aph = await ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, salle: a.tables + a.bar + a.banquette + a.terrasse + a.couverts }; });
  check(aph.decor <= 80 && aph.salle <= 7, `haute, tout au max : ${aph.decor} appels de dessin pour le décor (≤ 80, décors HD compris), ${aph.salle} pour la salle et les couverts`);
  await page.screenshot({ path: path.join(out, 'apres-clients-haute.png') });
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── 360 × 640 : tout au-dessus du tiroir fermé ──');
  ({ ctx, page, erreurs, ev } = await ouvrir('eco', 360, 640));
  await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); /* tout le mobilier au max */ f.tiroir('ferme'); }); await sleep(1200);
  const z360 = await ev(() => { const t = document.querySelector('#tiroir').getBoundingClientRect(), s = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones(); return ['tables', 'bar', 'banquette', 'terrasse'].map((id) => [id, Math.round(s.top + z[id].y + z[id].h), Math.round(t.top)]); });
  check(z360.every(([, b, t]) => b <= t + 1), `les zones de la salle restent au-dessus du tiroir fermé : ${z360.map(([id, b]) => id + ' ' + b).join(', ')} (tiroir à ${z360[0][2]})`);
  await page.screenshot({ path: path.join(out, 'apres-max-360.png') });
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (meubles).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
