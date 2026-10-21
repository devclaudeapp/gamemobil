// Le standing des boutiques (17 octobre) : le décor monte en gamme tout seul toutes les cinq boutiques (GAME.standing, 6 paliers),
// en gardant l'identité du quartier (src/vie.js decor(q, s) ; src/meubles.js standing ; src/hd.js lots luxe1, luxe3, luxe5).
// 1) Sans navigateur : les bornes des paliers (n°1-5 → 0, 6-10 → 1… 26 et au-delà → 5), le palier fixé d'une visite, la photo (champ l).
// 2) Dans Chromium, téléphone 390 × 844 : chaque palier 0 à 5, au village et à la capitale, en haute et en éco → captures dans
//    test/shots/standing/ ; un décor distinct par palier ; les modèles cuits du palier en haute (fournil/hd/luxe/, ≤ 150 Ko, et la boutique
//    entière < 400 Ko) ; le budget d'appels de dessin au pire palier, tout le mobilier au max (éco ≤ 72, haute ≤ 80) ; l'annonce « Ta boutique
//    monte en gamme » au passage de la n°5 à la n°6 (et pas de la n°6 à la n°7) ; la ligne « Standing » des feuilles Étoiles et Parcours ;
//    la visite d'un copain au palier 3 ; une vieille photo (sans l) → palier 0 ; aucune erreur dans la page.
// 2 bis) Le soir et à Noël (budgets) ; le cache des textures de salle borné ; en 390 × 844 et 360 × 640, les pièces du standing (colonnes,
//    poteaux, statue, trophée) et les décors HD ne s’interpénètrent pas, rien dans le vide, hors de l’écran ni sur la chambre froide.
// 3) Avec « tout déplaçable » (lot 4) : un aménagement libre au palier 5, village et capitale, haute et éco (valide, rien sur les colonnes ni
//    les cordons du trottoir, voies depuis l’allée, zones de touche ≥ 44 px, budgets tenus) ; le mode Déplacer pendant un glisser au doigt.
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
  async function ouvrir(q, taille) {
    const ctx = await browser.newContext({ viewport: taille || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
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
    // les textures du sol et du mur : un décor par quartier ET par palier (12 vus ici) ; le cache n'en garde que les 3 derniers (sol + mur)
    const enCache = await ev(() => MEUBLES.sallesEnCache);
    check(enCache <= 6, `après 12 décors, le cache des salles garde ${enCache} textures de sol et de mur (≤ 6 : les 3 derniers décors vus)`);
    // le soir (21 h 30) : les lanternes s'allument, la lueur DANS le maillage du standing (pas d'appel de dessin en plus) ; le budget tient
    { await ev(() => window.__fournil.scene({ heure: 21.5 })); let pireS = { decor: 0 };
      for (let s = 0; s <= 5; s++) {
        await poser(ev, QS[1][1], s);
        await attendre(() => ev(([s, hd]) => { const v = window.__fournil.SCENE.standingVu; return v.palier === s && (!s || v.mailles > 0) && (!hd || !s || v.hd); }, [s, qual === 'haute']), 60000);
        await sleep(qual === 'haute' ? 1800 : 900); const a = await decorAppels(ev); if (a.decor > pireS.decor) pireS = Object.assign({ s }, a);
        if (s === 5) await page.screenshot({ path: path.join(out, `capitale-5-${qual}-soir.png`) });
      }
      check(pireS.decor <= max && pireS.standing <= 1, `${qual}, le soir, capitale, paliers 0 à 5 : au pire (palier ${pireS.s}) ${pireS.decor} appels pour le décor (≤ ${max}), dont ${pireS.standing} pour le standing, lueur des lanternes comprise (≤ 1)`); }
    // Noël (le sapin et la guirlande : 6 appels) : un budget de saison, documenté. Sur master, mesuré comme ici, éco 76 et haute 80 :
    // éco dépassait déjà 72 ; le standing y ajoute son maillage et, au palier 1+, les fleurs (qu'un joueur à trois améliorations a déjà) : +2 au plus.
    { const maxNoel = qual === 'haute' ? 82 : 78; let pireN = { decor: 0 };
      for (const h of qual === 'haute' ? [11, 21.5] : [11]) for (const s of [0, 3, 5]) {
        await ev((h) => window.__fournil.scene({ heure: h, saison: ['noel'] }), h); await poser(ev, QS[1][1], s);
        await attendre(() => ev(([s, hd]) => { const v = window.__fournil.SCENE.standingVu; return v.palier === s && (!s || v.mailles > 0) && (!hd || !s || v.hd); }, [s, qual === 'haute']), 60000);
        await sleep(qual === 'haute' ? 1800 : 900); const a = await decorAppels(ev); if (a.decor > pireN.decor) pireN = Object.assign({ s, h }, a);
      }
      check(pireN.decor <= maxNoel, `${qual}, à Noël, capitale : au pire (palier ${pireN.s}, ${pireN.h} h) ${pireN.decor} appels pour le décor (budget de saison ≤ ${maxNoel})`);
      await ev(() => window.__fournil.scene({ heure: 11 })); }
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
    { const fin = await ev(() => window.__fournil.G.PARCOURS_FIN); // le nombre de boutiques lu dans les règles, jamais écrit en dur
      check(new RegExp(`${fin} boutiques, une récompense à chacune`).test(t) && !/Trente boutiques/.test(t), `le sous-titre du parcours : « ${fin} boutiques, une récompense à chacune » (G.PARCOURS_FIN)`); }
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
  console.log('── les pièces du standing en place : rien ne s’interpénètre, rien dans le vide, rien hors de l’écran ni sur une zone de touche ──');
  for (const taille of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { ctx, page, erreurs, ev } = await ouvrir('haute', taille), nomT = `${taille.width} × ${taille.height}`;
    await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); f.scene({ heure: 11, saison: ['halloween'] }); f.tiroir('ferme'); });
    await poser(ev, QS[1][1], 5);
    const pret = await attendre(() => ev(() => { const S = window.__fournil.SCENE, v = S.standingVu; return v.palier === 5 && v.hd && S.decorHDBoites.some((b) => b.nom === 'pumpkin_yellow_small'); }), 90000);
    await sleep(1500);
    const r = await ev(() => {
      const S = window.__fournil.SCENE, E = S.standingVu.emprises, hd = S.decorHDBoites, W = VIE.W, froid = S.zones().froid;
      const sol = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1 && a.y0 < b.y1 && b.y0 < a.y1; // deux boîtes monde qui se recouvrent
      const ko = [];
      for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) { const a = E[i], b = E[j]; if (sol(a, b)) ko.push(`${a.nom} × ${b.nom}`); }
      for (const b of hd) for (const e of E) if (sol(b, e)) ko.push(`${b.nom} (HD) × ${e.nom}`);
      const vide = E.filter((e) => e.pied && e.appui && e.appui < e.pied).map((e) => `${e.nom} : pied ${e.pied.toFixed(1)} sur ${e.appui}`);
      const hors = E.filter((e) => e.x0 < 0 || e.x1 > W).map((e) => `${e.nom} ${e.x0.toFixed(1)}..${e.x1.toFixed(1)}`);
      const tr = E.find((e) => e.nom === 'trophee'), surFroid = tr && tr.x0 < froid.x + froid.w && tr.haut < froid.y + froid.h;
      return { ko, vide, hors, surFroid, tr: tr && { x0: tr.x0, haut: tr.haut }, froidBas: froid.y + froid.h, citrouille: hd.find((b) => b.nom === 'pumpkin_yellow_small') };
    });
    check(pret && !r.ko.length && !r.vide.length && !r.hors.length && !r.surFroid, `${nomT}, palier 5, haute, Halloween : les colonnes, les poteaux des cordons, la statue, le trophée et les décors HD (la citrouille de la porte) ne s’interpénètrent pas ${r.ko.join(' | ')} ; rien n’est posé dans le vide ${r.vide.join(' | ')} ; rien ne sort de l’écran ${r.hors.join(' | ')} ; le trophée sous la chambre froide (haut ${r.tr ? r.tr.haut.toFixed(1) : '?'} ≥ ${r.froidBas.toFixed(1)}, sa pastille dégagée)`);
    await page.screenshot({ path: path.join(out, `capitale-5-haute-${taille.width}.png`) });
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  console.log('── le standing et « tout déplaçable » ensemble : un aménagement libre au palier 5 ──');
  for (const qual of ['haute', 'eco']) {
    const { ctx, page, erreurs, ev } = await ouvrir(qual), cdp = await ctx.newCDPSession(page), max = qual === 'haute' ? 80 : 72;
    const touche = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
    await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } f.tiroir('ferme'); });
    if (qual === 'haute') await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 60000);
    for (const [qn, qi] of QS) {
      await poser(ev, qi, 5);
      // un aménagement libre : des tables, le coin salon et deux tables de la terrasse déplacés, chacun sur une place valide loin de la sienne
      // (la terrasse, en x seulement, n'a que quelques colonnes libres entre la porte et ses voisines : elle bouge d'une colonne au moins)
      const { code, rates } = await ev(() => { const f = window.__fournil, st = f.st, g = VIE.LAY.grille, rates = []; delete st.amenagement; VIE.frame(0.016, st, Date.now());
        for (const id of ['terrasse1', 'terrasse3', 'table1', 'table5', 'salon', 'table3', 'table6']) {
          const m = VIE.LAY.mobiles.find((o) => o.id === id), ok = [], ter = /^terrasse/.test(id);
          for (let r = 0; r < (ter ? 1 : g.rangs); r++) for (let c = 0; c < g.cols; c++) { const x = (c + 0.5) * g.pas, y = ter ? m.y : g.y0 + (r + 0.5) * g.pas, p = VIE.proposer(st, id, x, y); if (p && p.ok) ok.push({ p, d: Math.hypot(p.x - m.x, p.y - m.y) }); }
          const loin = ok.filter((o) => o.d > (ter ? 0.4 : 1.5) * g.pas).sort((a, b) => a.d - b.d); const pr = ter ? loin[loin.length - 1] : loin[Math.floor(loin.length / 2)];
          if (pr) { st.amenagement = f.G.nettoyerAmenagement(pr.p.a); VIE.frame(0.016, st, Date.now()); } else rates.push(id);
        }
        f.save(); return { code: f.G.codeAmenagement(st.amenagement), rates }; });
      const pret = await attendre(() => ev(([code, hd]) => { const v = window.__fournil.SCENE.standingVu; return VIE.LAY.sig === code && v.palier === 5 && v.mailles > 0 && (!hd || v.hd); }, [code, qual === 'haute']), 90000); // en haute, les modèles cuits du palier aussi (la CI les charge lentement)
      await sleep(qual === 'haute' ? 2000 : 1000);
      const r = await ev(() => { const L = VIE.LAY, st = window.__fournil.st, z = window.__fournil.SCENE.zones(), a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v;
        const inter = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        const surStanding = L.mobiles.filter((m) => (L.standingSol || []).some((x) => inter(m.r, x.r))).map((m) => m.id);
        const petites = ['tables', 'bar', 'banquette', 'terrasse'].filter((id) => z[id] && (z[id].w < 44 || z[id].h < 44));
        const sous = L.mobiles.filter((m) => VIE.mobileAchete(m)).every((m) => { const o = VIE.mobileSous(m.r.x + m.r.w / 2, m.r.y + m.r.h - 2, true); return o && (o.id === m.id || inter(o.r, m.r)); });
        const assis = L.sieges.filter((s) => s.zone !== 'terrasse').every((s) => Array.isArray(s.voie) && s.voie.length && Math.abs(s.voie[0].x - L.allee) < 0.01);
        // le trottoir du standing : une table de la terrasse amenée sur chaque colonne, chaque cordon est refusée (le standing, ou la porte, qui passe avant)
        const refusTrottoir = (L.standingSol || []).map((x) => VIE.proposer(st, 'terrasse1', x.r.x + x.r.w / 2, L.terrasse[0].y)).every((p) => p && !p.ok && /colonnes|cordons|porte/.test(p.raison));
        // les places d'honneur (statue, trophée) : au pied du fournil, au-dessus de la salle (leur bas à l'écran sous Y0) ; aucun meuble de la salle n'y monte
        const hon = window.__fournil.SCENE.standingVu.emprises.filter((e) => e.nom === 'statue' || e.nom === 'trophee'), g = L.grille;
        const honneur = hon.length === 2 && hon.every((e) => e.bas <= g.y0) && L.mobiles.every((m) => !m.dedans || m.r.y >= g.y0) && !VIE.proposer(st, 'table1', L.W / 2, g.y0 - g.pas).ok;
        return { valide: VIE.valider(st).ok, surStanding, refusTrottoir, petites, sous, assis, decor, standing: a.standing || 0, hd: window.__fournil.SCENE.standingVu.hd, honneur };
      });
      check(pret && code && !rates.length && code.slice(16) !== '---' && r.valide && !r.surStanding.length && r.refusTrottoir && !r.petites.length && r.sous && r.assis && r.honneur && r.decor <= max && (qual !== 'haute' || r.hd),
        `${qn}, palier 5, ${qual}, aménagement libre « ${code} » (tables, salon et deux tables de la terrasse déplacés${rates.length ? ' ; SANS PLACE : ' + rates.join(' ') : ''}) : appliqué et valide, aucun meuble sur les colonnes ou les cordons ${r.surStanding.join(' ')}, la terrasse refusée sur chacun, la statue et le trophée au-dessus de la salle (aucune table n’y monte), voies depuis l’allée, zones de touche ≥ 44 px ${r.petites.join(' ')}, chaque meuble se reprend au doigt ; ${r.decor} appels pour le décor (≤ ${max}), dont ${r.standing} pour le standing${qual === 'haute' ? (r.hd ? ', modèles cuits' : ', SANS les modèles cuits') : ''}`);
      await page.screenshot({ path: path.join(out, `${qn}-5-amenage-${qual}.png`) });
    }
    if (qual === 'haute') { // le mode Déplacer au palier 5, pendant un glisser au doigt
      await ev(() => { const f = window.__fournil; f.amenager(true); document.querySelector('#b-deplacer').click(); }); await sleep(600);
      const de = await ev(() => { // la table 2, prise par le bas de son emprise, emmenée vers la place libre la plus proche (à plus d'une case)
        const m = VIE.LAY.mobiles.find((o) => o.id === 'table2'), g = VIE.LAY.grille, b = document.querySelector('#scene').getBoundingClientRect(), st = window.__fournil.st; let mieux = null;
        for (let r = 0; r < g.rangs; r++) for (let c = 0; c < g.cols; c++) { const x = (c + 0.5) * g.pas, y = g.y0 + (r + 0.5) * g.pas, p = VIE.proposer(st, 'table2', x, y), d = Math.hypot(x - m.x, y - m.y); if (p && p.ok && d > 1.2 * g.pas && (!mieux || d < mieux.d)) mieux = { x: p.x, y: p.y, d }; }
        const py = m.r.y + m.r.h - 6; return { x: b.left + m.x, y: b.top + py, dx: mieux ? mieux.x - m.x : -g.pas, dy: mieux ? mieux.y - m.y : 0 }; });
      await touche('touchStart', [[de.x, de.y]]); await sleep(80);
      for (let k = 1; k <= 10; k++) { await touche('touchMove', [[de.x + de.dx * k / 10, de.y + de.dy * k / 10]]); await sleep(30); }
      await sleep(500); const pendant = await ev(() => ({ deplacer: window.__fournil.SCENE.deplacer, glisse: window.__fournil.SCENE.glisse }));
      await page.screenshot({ path: path.join(out, 'deplacer-palier-5.png') });
      await touche('touchEnd', []); await sleep(400);
      const posee = await ev(() => window.__fournil.st.amenagement && window.__fournil.st.amenagement.tables[1]);
      check(pendant.deplacer && pendant.glisse && pendant.glisse.id === 'table2' && pendant.glisse.ok && posee, `le mode Déplacer au palier 5 : la table 2 suit le doigt, verte sur une place libre, et s’y pose (${pendant.glisse ? (pendant.glisse.ok ? 'verte' : 'rouge : ' + pendant.glisse.raison) : 'rien'} ; case ${JSON.stringify(posee)})`);
      await ev(() => window.__fournil.amenager(false)); await sleep(300);
    }
    await ev(() => { delete window.__fournil.st.amenagement; window.__fournil.save(); });
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (standing).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
