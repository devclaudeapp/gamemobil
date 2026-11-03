// Le standing des boutiques (17 octobre) : le décor monte en gamme tout seul toutes les cinq boutiques (GAME.standing, 6 paliers),
// en gardant l'identité du quartier (src/vie.js decor(q, s) ; src/meubles.js standing ; src/hd.js lots luxe1, luxe3, luxe5).
// 1) Sans navigateur : les bornes des paliers (n°1-5 → 0, 6-10 → 1… 26 et au-delà → 5), le palier fixé d'une visite, la photo (champ l).
// 2) Dans Chromium, téléphone 390 × 844 : chaque palier 0 à 5, au village et à la capitale, en haute et en éco → captures dans
//    test/shots/standing/ ; un décor distinct par palier ; les modèles cuits du palier en haute (fournil/hd/luxe/, ≤ 150 Ko, et les décors de
//    la boutique entière < 400 Ko ; ses clients 3D, leur lot à part, ≤ 500 Ko ; son boulanger et ses apprentis 3D, leur lot à part, ≤ 200 Ko ;
//    le tout < 900 Ko, 400 Ko avant les clients 3D) ; le budget
//    d'appels de dessin au pire palier, tout le mobilier au max ET, depuis « Mes décos » (lot de la chaîne), les 6 décos les plus lourdes
//    posées (chaudron, lanterne, citrouilles, néon, bestiaire, toiles : fusionnées avec les petits décors fixes, src/meubles.js fusion) :
//    éco ≤ 72, haute ≤ 80, les mêmes budgets (mesurés : 59 et 66 au pire, contre 72 et 79 sans déco avant la fusion) ; l'annonce « Ta boutique
//    monte en gamme » au passage de la n°5 à la n°6 (et pas de la n°6 à la n°7) ; la ligne « Standing » des feuilles Étoiles et Parcours ;
//    la visite d'un copain au palier 3 ; une vieille photo (sans l) → palier 0 ; aucune erreur dans la page.
// 2 bis) Le soir et à Noël (budgets) ; le cache des textures de salle borné ; en 390 × 844 et 360 × 640, les pièces du standing (colonnes,
//    poteaux, statue, trophée) et les décors HD ne s’interpénètrent pas, rien dans le vide, hors de l’écran ni sur la chambre froide.
// 2 ter) Les finitions au-delà de la n°30 (lot « progression » : GAME.finitionDe, src/vie.js decor(q, 5, k)) : sans navigateur, les sept
//    décors cumulés, les étoiles au-delà de la 7e, le rang fixé d’une visite (st.finitionFixe), la photo (tp, lot « serveur ») ; dans
//    Chromium, haute et éco (et 360 × 640), f1 à f7 puis 12 étoiles, au village et à la capitale → captures finition-*.png : les triangles du
//    décor ≤ ceux du palier 5 + 15 %, les appels ≤ 80 / 72, rien ne s’interpénètre ni ne sort de l’écran, les zones de touche visibles ; les
//    chantiers du quartier finis, dehors (quatre au plus, les derniers ; la variante rénovée) → captures dehors-*.png ; le soir.
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
// les finitions au-delà de la n°30 (lot « progression » : GAME.FINITIONS, GAME.finitionDe) : decor(q, 5, k), k le rang du palier
console.log('── les finitions au-delà de la n°30 ──');
{
  const village = G.QUARTIERS[0], cap = G.QUARTIERS.find((q) => q.id === 'capitale'), d5 = VIE.decor(village, 5), F = [1, 2, 3, 4, 5, 6, 7].map((f) => VIE.decor(village, 5, f));
  check(G.FINITIONS.length === 7 && F.every((d, i) => d.id === `village-s5-f${i + 1}` && d.finition === i + 1 && d.etoilesEnseigne === i + 1 && d.enseigneOr && d.standing === 5 && d.base === 'village' && d5.objets.every((o) => d.objets.includes(o))) && VIE.decor(village, 5, 3) === F[2] && d5.finition === 0,
    `sept finitions, cumulées sur le décor du palier 5, chacune son décor en cache (${F.map((d) => d.id).join(', ')})`);
  const a = (f, o) => F[f - 1].objets.includes(o);
  check(a(1, 'enseigne') && a(1, 'lanterneFer') && !a(3, 'lustres') && a(4, 'lustres') && !a(4, 'vitraux') && a(5, 'vitraux') && !a(6, 'coupole') && a(7, 'coupole') && F.every((d) => d.objets.includes('enseigne') && d.objets.includes('statue')),
    'chaque finition ajoute ses pièces et garde les précédentes : l’enseigne dorée et la lanterne de fer forgé (1), les lustres (4), les vitraux (5), la coupole (7)');
  check(F[0].bois === d5.bois && F[1].bois === '#5A3A22' && !F[0].laiton && F[1].laiton && F[1].comptoir === d5.comptoir && F[2].comptoir === '#E3B873' && !F[1].comptoirTranslucide && F[2].comptoirTranslucide && F[4].solStyle === d5.solStyle && F[5].solStyle === 'nacre' && !F[4].platine && F[5].platine === '#E5E4E2' && F[6].platine === '#E5E4E2',
    'les matières : le noyer et les poignées de laiton (2), le comptoir d’onyx qui laisse passer la lumière (3), la nacre au sol et les filets de platine (6)');
  const k12 = VIE.decor(cap, 5, 12);
  check(k12.id === 'capitale-s5-f7-k12' && k12.finition === 7 && k12.etoilesEnseigne === 12 && k12.objets.join() === VIE.decor(cap, 5, 7).objets.join() && VIE.decor(cap, 5, 8).id === 'capitale-s5-f7-k8' && k12.vue === VIE.decor(cap, 0).vue && k12.accent === VIE.decor(cap, 0).accent,
    `au-delà de la 7e : la 7e, et le rang du palier en étoiles sur l’enseigne (${k12.id} : ${k12.etoilesEnseigne} étoiles) ; la capitale garde sa vue et ses couleurs`);
  check(VIE.decor(village, 3, 4).id === 'village-s3' && VIE.decor(village, 0, 2).id === 'village' && VIE.decor(village, 5, -1).id === 'village-s5' && VIE.decor(village, 5, 'x').id === 'village-s5' && VIE.decor(village, 5, 0) === d5, 'une finition sans le palier 5, ou absurde : ignorée');
  // le rang de finition d'une boutique : GAME.finitionDe (n°40 → 1, n°50 → 2… 0 avant), ou celui fixé d'une visite (st.finitionFixe, s'il est valide)
  const fn = (n, fixe) => VIE.finition(Object.assign(G.newState(T), { boutiques: n }, fixe === undefined ? {} : { finitionFixe: fixe }));
  check(fn(30) === 0 && fn(39) === 0 && fn(40) === 1 && fn(49) === 1 && fn(50) === 2 && fn(100) === 7 && fn(110) === 8 && fn(1e6) <= 1e4 && fn(3, 4) === 4 && fn(45, 0) === 0 && fn(45, -1) === 1 && fn(45, 2.5) === 1 && fn(45, '3') === 1,
    'le rang de finition : celui du numéro de la boutique (n°40 → 1, n°50 → 2, n°110 → 8 ; 0 avant la n°40), ou celui fixé d’une visite (st.finitionFixe), s’il est valide');
  // la photo et la visite : le rang de finition voyage dans la photo (champ tp, lot « serveur ») ; tant qu'il n'y est pas, la boutique d'un copain
  // se montre sans finition (son numéro n'est pas dans la photo : celui de son quartier)
  const st = G.newState(T); st.boutiques = 72; st.nomBoutique = 'Chez Lou';
  const p = CL.photo(st, { G }), b = CL.boutiqueDepuisPhoto(p, { G, maintenant: T });
  if (p && p.tp != null) check(p.tp === 4 && b && b.st.finitionFixe === 4 && VIE.finition(b.st) === 4 && VIE.finition(CL.boutiqueDepuisPhoto(Object.assign({}, p, { tp: undefined }), { G, maintenant: T }).st) === 0, `la photo porte le rang de finition (n°72 → tp = ${p.tp}) et la boutique rebâtie le garde (st.finitionFixe = ${b && b.st.finitionFixe}) ; sans tp : aucune`);
  else check(b && G.standing(b.st) === 5 && VIE.finition(b.st) === 0, `la photo ne porte pas encore le rang de finition (tp : lot « serveur ») : chez un copain, son standing (palier ${b && G.standing(b.st)}) sans finition`);
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
// les 6 décos les plus lourdes d'avant la fusion (5, 2, 2, 3, 1 et 3 appels de dessin chacune), posées à des places de leur type (src/vie.js LAY.decos)
const LOURDES = [['chaudron', 's1'], ['legende', 's3'], ['citrouilles', 's2'], ['neon', 'm2'], ['bestiaire', 'm1'], ['toiles', 'r1']];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(q, taille) {
    const ctx = await browser.newContext({ viewport: taille || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; Object.defineProperty(window, 'confetti', { configurable: true, get: () => () => null, set: () => {} }); }); // des confettis comptés mais pas dessinés (des captures nettes)
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.setDefaultTimeout(120000); // (le rendu logiciel est lent quand la machine est chargée : les captures attendent plus longtemps)
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
    await ev((l) => window.__fournil.SCENE.decos(l), LOURDES); // les 6 décos les plus lourdes posées, tout du long (à Noël, le sapin garde sa place : 5)
    if (qual === 'haute') check(await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 180000), 'en haute, les meubles de la salle en KayKit');
    let pire = { decor: 0 }; const max = qual === 'haute' ? 80 : 72;
    for (const [qn, qi] of QS) for (let s = 0; s <= 5; s++) {
      await poser(ev, qi, s);
      const ok = await attendre(() => ev(([s, hd]) => { const v = window.__fournil.SCENE.standingVu; return v.palier === s && (!s || v.mailles > 0) && (!hd || !s || v.hd); }, [s, qual === 'haute']), 60000);
      await sleep(qual === 'haute' ? 1800 : 900);
      const v = await ev(() => window.__fournil.SCENE.standingVu), a = await decorAppels(ev);
      if (a.decor > pire.decor) pire = Object.assign({ ou: `${qn}, palier ${s}` }, a);
      const nd = await ev(() => (window.__fournil.SCENE.decosPosees || []).length);
      check(ok && v.decor === (s ? `${qn}-s${s}` : qn) && a.decor <= max && nd === 6, `${qn}, palier ${s} : décor ${v.decor}${s ? `, objets du standing en ${v.mailles} maillage(s)${qual === 'haute' ? (v.hd ? ', modèles cuits' : ', SANS les modèles cuits') : ''}` : ''} ; ${nd} décos posées ; ${a.decor} appels pour le décor (≤ ${max}), dont ${a.standing} pour le standing`);
      await page.screenshot({ path: path.join(out, `${qn}-${s}-${qual}.png`) });
    }
    check(pire.decor <= max, `${qual} : le pire palier (${pire.ou}), avec les 6 décos les plus lourdes, fait ${pire.decor} appels de dessin pour le décor (≤ ${max}), dont ${pire.standing} pour le standing`);
    if (qual === 'haute') {
      const luxe = [...new Set(demandes.filter((d) => /\/hd\/luxe\//.test(d)))], poidsL = luxe.reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      // (les décors : tout sauf les lots des personnages, qui ont chacun leur budget : les clients 3D, src/clients3d.js, vérifiés juste après ;
      // le boulanger et les apprentis 3D, src/equipe3d.js, demandés après les clients, ensuite)
      const tout = [...new Set(demandes.filter((d) => !/\/hd\/(clients|equipe)\//.test(d)))], poidsB = tout.reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      const dossier = fs.readdirSync(path.join(root, 'fournil', 'hd', 'luxe')).filter((f) => f.endsWith('.glb')).reduce((n, f) => n + fs.statSync(path.join(root, 'fournil', 'hd', 'luxe', f)).size, 0);
      check(luxe.length >= 4 && poidsL <= 150 * 1024 && dossier <= 150 * 1024, `les modèles cuits du standing : ${luxe.length} demandés, ${Math.round(poidsL / 1024)} Ko (dossier fournil/hd/luxe : ${Math.round(dossier / 1024)} Ko ≤ 150 Ko)`);
      check(poidsB < 400e3, `la boutique en haute, standing compris : ${Math.round(poidsB / 1024)} Ko de modèles pour les décors (< 400 Ko)`);
      const okC = await attendre(() => ev(() => HDM.pret('clients')), 30000), cl = demandes.filter((d) => /\/hd\/clients\//.test(d)), clU = [...new Set(cl)], poidsC = clU.reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      check(okC && clU.length === 7 && cl.length === 7 && poidsC <= 500 * 1024, `et ses clients 3D, leur lot à part : ${clU.length} fichiers, chacun demandé une fois (${cl.length} demandes), ${Math.round(poidsC / 1024)} Ko (≤ 500 Ko)`);
      // puis le boulanger et les apprentis 3D, leur lot à part (« equipe ») : quatre fichiers, une fois chacun, ≤ 200 Ko ; attendus ici, pour
      // que le total les compte toujours
      const okE = await attendre(() => ev(() => HDM.pret('equipe')), 60000), eq = demandes.filter((d) => /\/hd\/equipe\//.test(d)), eqU = [...new Set(eq)], poidsE = eqU.reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      check(okE && eqU.length === 4 && eq.length === 4 && poidsE <= 200 * 1024, `et son boulanger et ses apprentis 3D, leur lot à part : ${eqU.length} fichiers, chacun demandé une fois (${eq.length} demandes), ${Math.round(poidsE / 1024)} Ko (≤ 200 Ko)`);
      // le tout, ce que le téléphone télécharge pour la boutique en haute : 400 Ko au plus avant les clients 3D ; leur lot fait relever ce
      // budget total à 900 Ko (les décors < 400 Ko, les clients ≤ 500 Ko), qui tient l'équipe 3D comprise
      const poidsT = [...new Set(demandes)].reduce((n, d) => n + fs.statSync(path.join(root, d)).size, 0);
      check(poidsT < 900e3, `en tout, la boutique en haute télécharge ${Math.round(poidsT / 1024)} Ko de modèles, décors, standing, clients et équipe 3D compris (< 900 Ko ; le budget total était de 400 Ko avant les clients 3D)`);
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
    // Depuis la fusion des décos, avec les décos les plus lourdes posées (le sapin garde s2 : 5 d'entre elles), mesuré 66 et 70.
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
  // ─── les finitions au-delà de la n°30 (lot « progression ») : f1 à f7 (n°40 à n°100), puis les étoiles (n°150 : 12) ; et les chantiers du
  //     quartier finis, dehors (PROGRESSION.decorProjets : st.projets.finis). Tout le mobilier au max et les 6 décos les plus lourdes, comme plus
  //     haut. Le budget : les triangles du décor (tous ses groupes, sans le boulanger ni les couverts des clients assis, qui vont et viennent)
  //     ≤ ceux de la n°26 (palier 5) + 15 % ; les appels de dessin ≤ 80 / 72, le standing un seul de plus (le voile de lumière de la coupole,
  //     la 7e, éteint la nuit), la place dehors un ; les pièces ne s'interpénètrent pas, ne sortent pas de l'écran, ne cachent aucune zone de
  //     touche (ni son centre, ni plus de 30 % de sa surface) ; dehors : sur la place, entre le bord du trottoir et le tiroir fermé, côte à
  //     côte (un petit écran n'a pas la place : rien) → captures finition-*.png, dehors-*.png
  console.log('── les finitions au-delà de la n°30 (f1 à f7, puis les étoiles) et les chantiers du quartier dehors ──');
  for (const [qual, taille] of [['haute'], ['eco'], ['eco', { width: 360, height: 640 }]]) {
    const { ctx, page, erreurs, ev } = await ouvrir(qual, taille), max = qual === 'haute' ? 80 : 72, nomT = taille ? `${taille.width} × ${taille.height}, ` : '', suf = taille ? '-' + taille.width : '';
    // (le chat adopté d'avance : sa feuille « Un chat miaule à la porte » ne vient pas couvrir les captures ; il n'est pas compté dans le décor)
    await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } if (!f.st.chat) f.G.adopterChat(f.st, ''); f.tiroir('ferme'); });
    await ev((l) => window.__fournil.SCENE.decos(l), LOURDES);
    if (qual === 'haute') await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 180000);
    const triangles = () => ev(() => { const t = window.__fournil.SCENE.trianglesParGroupe; let n = 0; for (const [k, v] of Object.entries(t)) if (k !== 'boulanger' && k !== 'couverts') n += v; return n; });
    const aller = async (qi, n, rangs) => { // la boutique n°n du quartier qi ; rangs : les chantiers finis (déjà vus : pas d'annonce)
      rangs = rangs || []; const k = G.finitionDe(n), fin = Math.min(7, k); // (k : le rang du palier, autant d'étoiles sur l'enseigne ; il change à chaque pas, la finition non : n°100 puis n°150)
      await ev(([qi, n, rangs]) => { const f = window.__fournil; f.st.boutiques = n; f.st.quartierFixe = qi; delete f.st.standingFixe; delete f.st.finitionFixe; f.st.projets = { finis: rangs.map((rang) => ({ rang })), vus: rangs.slice(), aides: 0, maj: 0 }; f.tiroir('ferme'); }, [qi, n, rangs]);
      // (la liste dehors attendue, celle des règles : PROGRESSION.decorProjets ; la scène la relit une fois par seconde de son horloge, plus lente qu'une seconde sur une machine chargée)
      const ok = await attendre(() => ev(([fin, k, hd]) => { const S = window.__fournil.SCENE, v = S.standingVu, P = typeof PROGRESSION !== 'undefined' ? PROGRESSION : null, att = P ? P.decorProjets(window.__fournil.st).slice(-4).map((x) => x.id + (x.tour ? '~' + x.tour : '')).join() : '';
        return v.palier === 5 && v.finition === fin && v.etoiles === k && v.mailles > 0 && (!hd || v.hd) && S.dehorsVu.liste.join() === att; }, [fin, k, qual === 'haute']), 60000);
      await sleep(qual === 'haute' ? 1800 : 900); return ok;
    };
    const examiner = () => ev(() => {
      const S = window.__fournil.SCENE, v = S.standingVu, E = v.emprises, W = VIE.W, z = S.zones(), ko = [], cache = [], FIN = ['enseigne', 'lanterneFer', 'lustre', 'vitraux'];
      const sol = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1 && a.y0 < b.y1 && b.y0 < a.y1; // deux boîtes monde qui se recouvrent
      for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) if (sol(E[i], E[j])) ko.push(`${E[i].nom} × ${E[j].nom}`);
      for (const b of S.decorHDBoites) for (const e of E) if (sol(b, e)) ko.push(`${b.nom} (HD) × ${e.nom}`);
      const vide = E.filter((e) => e.pied && e.appui && e.appui < e.pied).map((e) => e.nom), hors = E.filter((e) => e.x0 < 0 || e.x1 > W || e.haut < 0).map((e) => `${e.nom} ${e.x0.toFixed(1)}..${e.x1.toFixed(1)}`);
      let pire = { p: 0, ou: '' }; // les zones de touche : la part de chacune que couvre une pièce des finitions (à l'écran), et son centre
      for (const e of E.filter((x) => FIN.includes(x.nom))) for (const id of ['boulanger', 'four', 'froid', 'caisse', 'deco', 'mystere', 'vitrine']) {
        const r = z[id]; if (!r || !r.w || !r.h) continue;
        const w = Math.min(e.x1, r.x + r.w) - Math.max(e.x0, r.x), h = Math.min(e.bas, r.y + r.h) - Math.max(e.haut, r.y); if (w <= 0 || h <= 0) continue;
        const p = w * h / (r.w * r.h), cx = r.x + r.w / 2, cy = r.y + r.h / 2, centre = cx > e.x0 && cx < e.x1 && cy > e.haut && cy < e.bas;
        if (p > pire.p) pire = { p, ou: `${e.nom} × ${id}` };
        if (centre || p > 0.3) cache.push(`${e.nom} × ${id} (${Math.round(100 * p)} %${centre ? ', son centre' : ''})`);
      }
      const a = S.appelsParGroupe; let decor = 0; for (const [k, n] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += n;
      return { decor: v.decor, finition: v.finition, etoiles: v.etoiles, noms: E.map((e) => e.nom), ko, vide, hors, cache, pire, appels: decor, standing: a.standing || 0 };
    });
    const dehorsVu = () => ev(() => { const S = window.__fournil.SCENE, d = S.dehorsVu, W = VIE.W, E = d.emprises, ko = [];
      for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) if (E[i].x0 < E[j].x1 && E[j].x0 < E[i].x1) ko.push(`${E[i].nom} × ${E[j].nom}`);
      return { liste: d.liste, mailles: d.mailles, n: E.length, place: d.place, ko, hors: E.filter((e) => e.x0 < 0 || e.x1 > W).map((e) => e.nom), haut: E.length ? Math.min(...E.map((e) => e.haut)) : 0, bas: E.length ? Math.max(...E.map((e) => e.bas)) : 0,
        bord: VIE.LAY.trottoir.bord, vis: VIE.H - 37, tris: S.trianglesParGroupe.dehors || 0, appels: S.appelsParGroupe.dehors || 0 }; });
    for (const [qn, qi] of QS) {
      const ok5 = await aller(qi, 26), t5 = await triangles(), r5 = await examiner(), budget = Math.floor(t5 * 1.15);
      check(ok5 && r5.decor === `${qn}-s5` && r5.finition === 0, `${nomT}${qn}, ${qual}, la n°26 (palier 5, sans finition) : ${t5} triangles pour le décor (le budget des finitions : ${budget}, + 15 %), ${r5.appels} appels, dont ${r5.standing} pour le standing`);
      for (const [n, f, k] of taille ? [[100, 7, 7], [150, 7, 12]] : [[40, 1, 1], [50, 2, 2], [60, 3, 3], [70, 4, 4], [80, 5, 5], [90, 6, 6], [100, 7, 7], [150, 7, 12]]) {
        const ok = await aller(qi, n), t = await triangles(), r = await examiner(), id = `${qn}-s5-f${f}${k > f ? '-k' + k : ''}`;
        check(ok && r.decor === id && r.finition === f && r.etoiles === k && t <= budget && r.appels <= max && r.standing <= r5.standing + (f >= 7 ? 1 : 0) && !r.ko.length && !r.vide.length && !r.hors.length && !r.cache.length,
          `${nomT}${qn}, ${qual}, n°${n} : ${r.decor}${r.decor !== id ? ` (attendu : ${id})` : ''} (${r.etoiles} étoile${r.etoiles > 1 ? 's' : ''} sur l’enseigne) ; ${t} triangles (≤ ${budget} : ${t >= t5 ? '+' : ''}${(100 * (t / t5 - 1)).toFixed(1)} %) ; ${r.appels} appels pour le décor (≤ ${max}), dont ${r.standing} pour le standing ; rien ne s’interpénètre ${r.ko.join(' | ')}, rien dans le vide ${r.vide.join(' ')}, rien hors de l’écran ${r.hors.join(' ')} ; les zones de touche visibles (au plus ${Math.round(100 * r.pire.p)} % couverts${r.pire.ou ? ' : ' + r.pire.ou : ''}) ${r.cache.join(' | ')}`);
        await page.screenshot({ path: path.join(out, `finition-${qn}-${k > f ? 'k' + k : 'f' + f}-${qual}${suf}.png`) });
      }
      // les chantiers finis, dehors : quatre (le marché, le manège ; le kiosque et la statue rénovés, tour 1 : dorés)
      const okD = await aller(qi, 100, [3, 7, 10, 16]), tD = await triangles(), rD = await examiner(), d = await dehorsVu();
      const placeOk = taille && !d.place ? d.mailles === 0 && d.appels === 0 && d.n === 0 // (un petit écran : pas la place entre le trottoir et le tiroir)
        : d.mailles === 1 && d.appels === 1 && d.n === 4 && !d.ko.length && !d.hors.length && d.haut >= d.bord && d.bas <= d.vis;
      check(okD && d.liste.join() === 'marche,manege,kiosque~1,statue~1' && placeOk && tD <= budget && rD.appels <= max,
        `${nomT}${qn}, ${qual}, n°100 et quatre chantiers finis (${d.liste.join(', ')}) : ${d.place ? `dehors sur la place, un maillage, ${d.appels} appel, ${d.tris} triangles, entre le bord du trottoir et le tiroir fermé (écran ${d.haut.toFixed(0)} à ${d.bas.toFixed(0)}, dans ${d.bord.toFixed(0)}–${d.vis}), côte à côte ${d.ko.join(' | ')}, dans l’écran ${d.hors.join(' ')}` : `pas la place entre le trottoir (${d.bord.toFixed(0)}) et le tiroir fermé (${d.vis}) : rien de bâti`} ; avec les finitions : ${tD} triangles (≤ ${budget} : +${(100 * (tD / t5 - 1)).toFixed(1)} %), ${rD.appels} appels pour le décor (≤ ${max})`);
      await page.screenshot({ path: path.join(out, `dehors-${qn}-${qual}${suf}.png`) });
      if (!taille) { // huit chantiers finis : les quatre derniers dehors ; plus aucun : la place n'est plus bâtie
        const ok8 = await aller(qi, 100, [1, 2, 3, 4, 5, 6, 7, 8]), l8 = (await dehorsVu()).liste.join(), ok0 = await aller(qi, 100, []), d0 = await dehorsVu();
        check(ok8 && l8 === 'jardin,horloge,manege,statue' && ok0 && d0.mailles === 0 && d0.appels === 0, `${qn}, ${qual} : huit chantiers finis, les quatre derniers dehors (${l8}) ; aucun, la place n’est pas bâtie`);
      }
    }
    if (!taille) { // le soir : les verres des finitions et des réverbères s'allument dans leurs maillages ; le voile de la coupole s'éteint (un appel de moins)
      await ev(() => window.__fournil.scene({ heure: 21.5 }));
      const ok = await aller(QS[1][1], 100, [4, 6, 12, 15]), r = await examiner(), d = await dehorsVu();
      check(ok && r.decor === 'capitale-s5-f7' && r.standing === 1 && r.appels <= max && d.liste.join() === 'reverberes,horloge,reverberes~1,manege~1' && d.appels === 1, `${qual}, le soir, capitale, n°100 et quatre chantiers dehors (dont les réverbères) : ${r.appels} appels pour le décor (≤ ${max}), dont ${r.standing} pour le standing (le voile de la coupole éteint) et ${d.appels} pour la place`);
      await page.screenshot({ path: path.join(out, `finition-capitale-f7-soir-${qual}.png`) });
      await ev(() => { const f = window.__fournil; f.scene({ heure: 11 }); delete f.st.projets; });
    }
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  console.log('── le standing et « tout déplaçable » ensemble : un aménagement libre au palier 5 ──');
  for (const qual of ['haute', 'eco']) {
    const { ctx, page, erreurs, ev } = await ouvrir(qual), cdp = await ctx.newCDPSession(page), max = qual === 'haute' ? 80 : 72;
    const touche = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
    await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } f.tiroir('ferme'); });
    await ev((l) => window.__fournil.SCENE.decos(l), LOURDES); // (les décos posées : leurs places au mur, au sol, à la fenêtre, jamais sur la grille des meubles)
    if (qual === 'haute') await attendre(() => ev(() => window.__fournil.SCENE.meublesHD.length === 4), 180000);
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
