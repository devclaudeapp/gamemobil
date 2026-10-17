// Le standing des boutiques (17 octobre) : le décor monte en gamme tout seul toutes les cinq boutiques (GAME.standing, 6 paliers),
// en gardant l'identité du quartier (src/vie.js decor(q, s) ; src/meubles.js standing ; src/hd.js lots luxe1, luxe3, luxe5).
// 1) Sans navigateur : les bornes des paliers (n°1-5 → 0, 6-10 → 1… 26 et au-delà → 5), le palier fixé d'une visite, la photo (champ l).
// 2) Dans Chromium, téléphone 390 × 844 : chaque palier 0 à 5, au village et à la capitale, en haute et en éco → captures dans
//    test/shots/standing/ ; un décor distinct par palier ; les modèles cuits du palier en haute (fournil/hd/luxe/, ≤ 150 Ko, et la boutique
//    entière < 400 Ko) ; le budget d'appels de dessin au pire palier, tout le mobilier au max (éco ≤ 72, haute ≤ 80) ; l'annonce « Ta boutique
//    monte en gamme » au passage de la n°5 à la n°6 (et pas de la n°6 à la n°7) ; la ligne « Standing » des feuilles Étoiles et Parcours ;
//    la visite d'un copain au palier 3 ; une vieille photo (sans l) → palier 0 ; aucune erreur dans la page.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-standing.cjs
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_STANDING || 8874;
const out = path.join(__dirname, 'shots', 'standing'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };

// ─── 1) les règles, sans navigateur ───
console.log('── les paliers ──');
const G = require(path.join(root, 'src', 'game.js'));
global.GAME = G;
const CL = require(path.join(root, 'src', 'classement.js'));
const VIE = require(path.join(root, 'src', 'vie.js'));
const T = Date.UTC(2026, 9, 17, 10);
{
  const de = (n) => G.standing(Object.assign(G.newState(T), { boutiques: n }));
  const attendus = [[1, 0], [5, 0], [6, 1], [10, 1], [11, 2], [15, 2], [16, 3], [20, 3], [21, 4], [25, 4], [26, 5], [30, 5], [31, 5], [1e6, 5]];
  const ko = attendus.filter(([n, s]) => de(n) !== s);
  check(ko.length === 0 && G.STANDINGS.length === 6 && G.STANDINGS.every((x) => x.nom && x.phrase), `six paliers, un toutes les cinq boutiques (n°1-5 → 0 … n°26+ → 5) ${ko.map(([n]) => `n°${n} → ${de(n)}`).join(' ')}`);
  check([0, -3, NaN, null, undefined, 'x'].every((n) => G.standingDe(n) === 0) && G.standing({}) === 0 && G.standing(null) === 0, 'une valeur absurde (0, négative, absente) : palier 0');
  const v = Object.assign(G.newState(T), { boutiques: 2, standingFixe: 3 });
  check(G.standing(v) === 3 && G.standing(Object.assign(v, { standingFixe: 9 })) === 0 && G.standing(Object.assign(v, { standingFixe: 2.5 })) === 0, 'le palier fixé d’une visite (st.standingFixe) l’emporte, s’il est valide');
  const st = G.newState(T); st.boutiques = 9;
  for (let k = 0; k < 4; k++) { st.lifetimeRun = 1e30; st.defi = null; const r = G.nouvelleBoutique(st, T); if (!r.ok) { st.defi = { fait: true }; G.nouvelleBoutique(st, T); } }
  check(G.standing(st) === 2 && st.boutiques === 13, `ouvrir des boutiques fait monter le palier (n°${st.boutiques} : palier ${G.standing(st)})`);
}
console.log('── le décor de chaque palier ──');
{
  const village = G.QUARTIERS[0], cap = G.QUARTIERS.find((q) => q.id === 'capitale');
  const ids = [0, 1, 2, 3, 4, 5].map((s) => VIE.decor(village, s).id);
  check(new Set(ids).size === 6 && ids[0] === 'village' && ids[3] === 'village-s3' && VIE.decor(village, 3) === VIE.decor(village, 3), `un décor distinct par palier, mis en cache (${ids.join(', ')})`);
  const d5 = VIE.decor(cap, 5), d0 = VIE.decor(cap, 0);
  check(d5.base === 'capitale' && d5.accent === d0.accent && d5.vue === d0.vue && d5.objets.includes('statue') && d5.objets.includes('trophee') && !(d0.objets || []).includes('statue'), 'la capitale au palier 5 : ses couleurs et sa vue gardées, la statue et le trophée en plus');
  check(VIE.decor(village, 2).solStyle === 'chevrons' && VIE.decor(village, 4).solStyle === 'marbre2' && VIE.decor(cap, 2).solStyle === 'marbre' && VIE.decor(village, 1).lambris && VIE.decor(village, 3).pilastres, 'les sols et les murs montent en gamme (chevrons, marbre veiné ; lambris, pilastres), le marbre de la capitale reste du marbre');
  check(VIE.decor(village, -2).id === 'village' && VIE.decor(village, 99).id === 'village-s5' && VIE.decor(village).id === 'village', 'un palier hors bornes est ramené entre 0 et 5 (défaut 0)');
}
console.log('── la photo (champ l) ──');
{
  const st = G.newState(T); st.boutiques = 17; st.nomBoutique = 'Chez Lucas';
  const p = CL.photo(st, { G }); const b = CL.boutiqueDepuisPhoto(p, { G, maintenant: T });
  check(p && p.l === 3 && b && G.standing(b.st) === 3, `la photo porte le palier (n°17 → l = ${p && p.l}) et la boutique rebâtie le garde (${b && G.standing(b.st)})`);
  const vieille = Object.assign({}, p); delete vieille.l; const bv = CL.boutiqueDepuisPhoto(vieille, { G, maintenant: T });
  check(CL.nettoyerPhoto(vieille).l === 0 && bv && G.standing(bv.st) === 0, 'une vieille photo (sans l) : palier 0');
  check(CL.nettoyerPhoto(Object.assign({}, p, { l: 99 })).l === 5 && CL.nettoyerPhoto(Object.assign({}, p, { l: '<b>' })).l === 0 && CL.nettoyerPhoto(Object.assign({}, p, { l: -4 })).l === 0, 'une photo piégée : l borné entre 0 et 5');
}
if (process.argv.includes('--regles')) { console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nLes règles passent.'); process.exit(fails ? 1 : 0); }

// ─── 2) sur la vraie page ───
const { chromium } = require('playwright');
const demandes = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 5000)) { try { if (await f()) return true; } catch (e) { /* rien */ } await sleep(250); } return false; };
const QS = [['village', 0], ['capitale', G.QUARTIERS.findIndex((q) => q.id === 'capitale')]];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(q) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; Object.defineProperty(window, 'confetti', { configurable: true, get: () => () => null, set: () => {} }); }); // des confettis comptés mais pas dessinés (des captures nettes)
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=${q}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.give(1e13); f.scene({ heure: 11 }); f.tiroir('ferme'); });
    await page.addStyleTag({ content: '.toast { visibility: hidden !important; }' }); // les messages du moment (le niveau gagné…) : hors des captures
    return { ctx, page, erreurs, ev: (f, a) => page.evaluate(f, a) };
  }
  const poser = (ev, qi, s) => ev(([qi, s]) => { const f = window.__fournil; f.st.boutiques = 1 + 5 * s; f.st.quartierFixe = qi; delete f.st.standingFixe; f.tiroir('ferme'); }, [qi, s]);
  const decorAppels = (ev) => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, standing: a.standing || 0 }; });

  for (const qual of ['haute', 'eco']) {
    console.log(`── ${qual} : les six paliers, au village et à la capitale, tout le mobilier au max (le pire cas) ──`);
    const { ctx, page, erreurs, ev } = await ouvrir(qual);
    demandes.length = 0;
    await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } f.tiroir('ferme'); });
    if (qual === 'haute') check(await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 60000), 'en haute, les meubles de la salle en KayKit');
    let pire = { decor: 0 }; const max = qual === 'haute' ? 80 : 72;
    for (const [qn, qi] of QS) for (let s = 0; s <= 5; s++) {
      await poser(ev, qi, s);
      const ok = await attendre(() => ev(([s, hd]) => { const v = window.__fournil.SCENE.standingVu; return v.palier === s && (!s || v.mailles > 0) && (!hd || !s || v.hd); }, [s, qual === 'haute']), 60000);
      await sleep(qual === 'haute' ? 1800 : 900);
      const v = await ev(() => window.__fournil.SCENE.standingVu), a = await decorAppels(ev);
      if (a.decor > pire.decor) pire = Object.assign({ ou: `${qn}, palier ${s}` }, a);
      check(ok && v.decor === (s ? `${qn}-s${s}` : qn) && a.decor <= max, `${qn}, palier ${s} : décor ${v.decor}${s ? `, objets du standing en ${v.mailles} maillage(s)${qual === 'haute' ? (v.hd ? ', modèles cuits' : ', SANS les modèles cuits') : ''}` : ''} ; ${a.decor} appels pour le décor (≤ ${max}), dont ${a.standing} pour le standing`);
      await page.screenshot({ path: path.join(out, `${qn}-${s}-${qual}.png`) });
    }
    check(pire.decor <= max, `${qual} : le pire palier (${pire.ou}) fait ${pire.decor} appels de dessin pour le décor (≤ ${max}), dont ${pire.standing} pour le standing`);
    if (qual === 'haute') {
      const luxe = [...new Set(demandes.filter((d) => /\/hd\/luxe\//.test(d)))], poidsL = luxe.reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      const tout = [...new Set(demandes)], poidsB = tout.reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      const dossier = fs.readdirSync(path.join(root, 'fournil', 'hd', 'luxe')).filter((f) => f.endsWith('.glb')).reduce((n, f) => n + fs.statSync(path.join(root, 'fournil', 'hd', 'luxe', f)).size, 0);
      check(luxe.length >= 4 && poidsL <= 150 * 1024 && dossier <= 150 * 1024, `les modèles cuits du standing : ${luxe.length} demandés, ${Math.round(poidsL / 1024)} Ko (dossier fournil/hd/luxe : ${Math.round(dossier / 1024)} Ko ≤ 150 Ko)`);
      check(poidsB < 400e3, `la boutique en haute, standing compris : ${Math.round(poidsB / 1024)} Ko de modèles (< 400 Ko)`);
    } else check(demandes.length === 0, `en éco, aucun modèle HD demandé (${demandes.length})`);
    for (const [h, nom] of [[21.5, 'soir']]) { // le soir : les lanternes, les bougies des lustres s'allument
      await ev((h) => window.__fournil.scene({ heure: h }), h); await poser(ev, QS[1][1], 5); await sleep(2500);
      await page.screenshot({ path: path.join(out, `capitale-5-${qual}-${nom}.png`) }); await ev(() => window.__fournil.scene({ heure: 11 }));
    }
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  console.log('── l’annonce « Ta boutique monte en gamme » ──');
  {
    const { ctx, page, erreurs, ev } = await ouvrir('eco');
    const lire = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    const ouvrirBoutique = async () => {
      await ev(() => { const f = window.__fournil; f.st.lifetimeRun = 1e14; f.st.defi = null; f.etoiles(); }); await sleep(300);
      await ev(() => document.querySelector('#feuille [data-a="prestige"]').click()); await sleep(300);
      await ev(() => document.querySelector('#feuille [data-a="oui"]').click()); await sleep(900);
    };
    await ev(() => { const f = window.__fournil; f.st.boutiques = 5; f.st.quartierFixe = 4; }); await sleep(400);
    let t = await lire(); // (rien d'ouvert)
    await ev(() => window.__fournil.etoiles()); await sleep(300); t = await lire();
    check(/Standing\s*Boutique de quartier/.test(t) && /Prochain palier à la boutique n°6/.test(t), `la feuille Étoiles : « Standing · Boutique de quartier · prochain palier à la n°6 »`);
    await ev(() => { const l = document.querySelector('#feuille .sg-ligne'); if (l) l.scrollIntoView({ block: 'center' }); }); await sleep(300);
    await page.screenshot({ path: path.join(out, 'etoiles-standing.png') });
    const c0 = await ev(() => window.__confettis || 0);
    await ouvrirBoutique(); t = await lire();
    const st6 = await ev(() => ({ n: window.__fournil.st.boutiques, s: window.__fournil.G.standing(window.__fournil.st) }));
    check(st6.n === 6 && st6.s === 1 && /Ta boutique monte en gamme/.test(t) && /Belle boutique/.test(t), `de la n°5 à la n°6 : l’annonce du palier 1 (« ${t.split('\n').slice(0, 3).join(' · ')} »)`);
    await sleep(600);
    check((await ev(() => window.__confettis || 0)) >= c0 + 2, 'des confettis à l’ouverture, et encore pour le nouveau palier');
    await page.screenshot({ path: path.join(out, 'annonce-palier-1.png') });
    await ev(() => document.querySelector('#feuille [data-a="ok"]').click()); await sleep(400); t = await lire();
    check(/Boutique n°6/.test(t) && /Comment s’appelle ta boutique/.test(t), 'puis, comme avant, le nom de la nouvelle boutique');
    await ev(() => document.querySelector('#feuille [data-a="ok"]').click()); await sleep(400);
    await ouvrirBoutique(); t = await lire();
    check(/Boutique n°7/.test(t) && !/monte en gamme/.test(t), 'de la n°6 à la n°7 (même palier) : pas d’annonce, directement le nom');
    await ev(() => { document.querySelector('#feuille [data-a="ok"]').click(); }); await sleep(300);
    await ev(() => window.__fournil.parcours()); await sleep(400); t = await lire();
    check(/Standing\s*Belle boutique/.test(t) && /n°11/.test(t), 'la feuille du parcours montre le standing et le prochain palier (n°11)');
    await page.screenshot({ path: path.join(out, 'parcours-standing.png') });
    await ev(() => { const f = window.__fournil; f.st.boutiques = 29; f.st.quartierFixe = 9; f.monteeGamme(); }); await sleep(500);
    await page.screenshot({ path: path.join(out, 'annonce-palier-5.png') });
    check(/Palais du goût/.test(await lire()), 'l’annonce du dernier palier : « Palais du goût »');
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  console.log('── la visite d’un copain au palier 3 ; une vieille photo → palier 0 ──');
  {
    const { ctx, page, erreurs, ev } = await ouvrir('haute');
    const visite = async (palier) => {
      await ev((palier) => { const f = window.__fournil, c = f.classement(); if (!c) throw new Error('pas de classement');
        const s = f.G.newState(Date.now()); s.boutiques = 3; s.nomBoutique = 'Chez Zoé'; s.quartierFixe = 2; const ph = CLASSEMENT.photo(s, { G: f.G }); if (palier == null) delete ph.l; else ph.l = palier;
        c.boutique = async () => ({ etat: 'ok', data: { photo: ph, pseudo: 'Zoé' } }); f.visiter('Zoé'); }, palier);
      return attendre(() => ev(() => { const v = window.__fournil.visite(); return v && v.scene; }), 15000);
    };
    const ok = await visite(3);
    check(ok && await attendre(() => ev(() => { const v = window.__fournil.SCENE.standingVu; return v.palier === 3 && v.decor === 'mer-s3' && v.mailles > 0; }), 30000), `chez un copain (boutique n°3, photo l = 3) : sa boutique au palier 3 (${JSON.stringify(await ev(() => window.__fournil.SCENE.standingVu))})`);
    await sleep(1500); await page.screenshot({ path: path.join(out, 'visite-palier-3.png') });
    await ev(() => window.__fournil.finVisite(false)); await sleep(800);
    check(await attendre(() => ev(() => window.__fournil.SCENE.standingVu.palier === window.__fournil.G.standing(window.__fournil.st)), 10000), 'au retour, sa propre boutique à son palier');
    const ok2 = await visite(null);
    check(ok2 && await attendre(() => ev(() => { const v = window.__fournil.SCENE.standingVu; return v.palier === 0 && v.decor === 'mer'; }), 30000), 'une vieille photo (sans l) : la boutique du copain au palier 0');
    await ev(() => window.__fournil.finVisite(false)); await sleep(300);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (standing).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
