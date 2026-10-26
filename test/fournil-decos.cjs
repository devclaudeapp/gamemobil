// « Mes décos » (lot « Ma chaîne de boutiques », la scène) : les petits décors fixes et les décos fusionnés en deux maillages (src/meubles.js
// fusion : « petits » et « lueurs »), les 12 places typées (src/vie.js LAY.decos), la disposition (SCENE.decos), le mode Déplacer des décos.
// Dans Chromium, téléphone 390 × 844 (et 360 × 640) :
// 1) le plan d'origine (SCENE.decos(null)) : toutes les décos d'événement gagnées, chacune à sa place de toujours, rendue identique après un
//    aller-retour par une disposition ; le pire cas (capitale palier 1, tout au max) avec elles ≤ 72 en éco (il en faisait 93 avant la fusion) ;
// 2) poser, ranger, déplacer (vert ou rouge par CHAINE.peutPoser quand les règles sont là, « Plan d'origine »), la 7e refusée, l'échange, le
//    décor automatique prioritaire (la recette de saison en c2, le sapin en s2 à Noël) ;
// 3) le PIRE CAS avec les 6 décos les plus lourdes posées (chaudron, lanterne, néon, citrouilles, toiles, bestiaire) : éco ≤ 72, haute ≤ 80
//    (modèles HD chargés), Noël ≤ 78 / 82 ; les décos ≤ 3 appels de dessin (petits + lueurs) ;
// 4) les 15 décos neuves de « Ma chaîne » : procédurales, ≤ 300 triangles chacune, posées à leurs places : rien dans le vide, ni hors de
//    l'écran, ni hors de leur place (390 × 844 et 360 × 640, captures) ; la disposition d'une photo (champ dc, CHAINE.decosDepuisCode) ;
// 5) la mémoire stable (poser, ranger cinq fois), VIE.basculer('chaine'), le catalogue d'accord avec les règles (CHAINE), aucune erreur.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-decos.cjs
// (SHOTS_DECOS=<dossier> : les captures y sont copiées ; PORT_DECOS : le port du serveur)
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_DECOS || 8879;
const out = path.join(__dirname, 'shots', 'decos'); fs.mkdirSync(out, { recursive: true });
const copie = process.env.SHOTS_DECOS; if (copie) fs.mkdirSync(copie, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await f()) return true; } catch (e) { /* rien */ } await sleep(250); } return false; };
const LOURDES = [['chaudron', 's1'], ['legende', 's3'], ['citrouilles', 's2'], ['neon', 'm2'], ['bestiaire', 'm1'], ['toiles', 'r1']];
const TOUTES_Q = ['graffiti', 'neon', 'scooter', 'chien', 'toque-or'], TOUTES_H = ['citrouilles', 'toiles', 'chaudron', 'toque-citrouille', 'bestiaire', 'legende'];
// les 15 décos neuves, en cinq dispositions (chacune à une place de son type ; une seule sur le comptoir : la capitale y a ses fleurs, en c1)
const NEUVES = [
  [['souvenir-village', 'c2'], ['souvenir-paris', 's1'], ['souvenir-mer', 'r1'], ['souvenir-montagne', 'm1'], ['souvenir-ville', 'r2'], ['souvenir-gare', 'm4']],
  [['souvenir-ile', 'c2'], ['souvenir-chateau', 'm1'], ['souvenir-cimes', 'm3'], ['chaine-statue', 's3'], ['chaine-enseigne', 'm2']],
  [['souvenir-capitale', 'c2'], ['chaine-plan', 'm4'], ['chaine-statue', 's1'], ['souvenir-mer', 'r2']],
  [['chaine-cloche', 'c2'], ['souvenir-montagne', 'm3'], ['souvenir-paris', 's3']],
  [['chaine-globe', 'c2'], ['souvenir-cimes', 'm4'], ['souvenir-ville', 'r1']],
];
const capture = async (page, nom) => { const f = path.join(out, nom); await page.screenshot({ path: f }); if (copie) fs.copyFileSync(f, path.join(copie, nom)); };

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(q, taille) {
    const ctx = await browser.newContext({ viewport: taille || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; Object.defineProperty(window, 'confetti', { configurable: true, get: () => () => null, set: () => {} }); });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=${q}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.give(1e13); f.scene({ heure: 11, saison: ['halloween', 'fete'] }); f.tiroir('ferme'); });
    await page.addStyleTag({ content: '.toast { visibility: hidden !important; }' });
    const ev = (f, a) => page.evaluate(f, a);
    // le pire cas du test de standing : tout le mobilier au max, chaque poste ouvert et son apprenti, la capitale (palier 1 : la n°6)
    await ev(() => { const f = window.__fournil; for (const m of f.G.MOBILIER) for (let k = 0; k < m.max; k++) f.meuble(m.id); for (const s of f.st.stations) { s.niv = Math.max(1, s.niv); s.staff = true; } f.st.boutiques = 6; f.st.quartierFixe = f.G.QUARTIERS.findIndex((x) => x.id === 'capitale'); delete f.st.standingFixe; f.tiroir('ferme'); });
    return { ctx, page, erreurs, ev };
  }
  const appels = (ev) => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, decos: (a.petits || 0) + (a.lueurs || 0), petits: a.petits || 0, lueurs: a.lueurs || 0 }; });
  const palier = (ev, s, hd) => attendre(() => ev(([s, hd]) => { const S = window.__fournil.SCENE, v = S.standingVu; return v.palier === s && v.mailles > 0 && (!hd || (v.hd && S.meublesHD.length === 4)); }, [s, hd]), 90000);
  // poser une disposition (null : le plan d'origine), puis attendre que la scène l'ait bâtie
  const poser = async (ev, l, n) => { await ev((l) => window.__fournil.SCENE.decos(l), l); await attendre(() => ev(([l, n]) => { const S = window.__fournil.SCENE, p = S.decosPosees; return l === null ? p === null : !!p && p.length === (n == null ? l.length : n); }, [l, n]), 10000); await sleep(700); };
  // chaque déco posée : à l'écran, dans sa place (8 px de marge), dans l'écran ; sur son appui (le sol, le comptoir, l'appui de la fenêtre, contre le mur)
  const enPlace = (ev) => ev(() => {
    const S = window.__fournil.SCENE, L = VIE.LAY, b = S.decosBoites, m = S.decosMonde, ko = [], m8 = 8;
    for (const [id, pl] of S.decosPosees || []) {
      if (id === 'scooter') continue; const p = L.decos.find((x) => x.id === pl), r = b[id], w = m.boites[id] || (id === 'vitrine-coupes' ? { y0: 0, z0: 0 } : null);
      if (!r || !w) { ko.push(`${id} : absente`); continue; }
      const q = p.r, cx = r.x + r.w / 2;
      if (r.x < q.x - m8 || r.x + r.w > q.x + q.w + m8 || r.y < q.y - m8 - (p.type === 'sol' ? 12 : 0) || r.y + r.h > q.y + q.h + m8 + (p.type === 'sol' ? 6 : 0)) ko.push(`${id} hors de ${pl} (${r.x.toFixed(0)},${r.y.toFixed(0)} ${r.w.toFixed(0)}×${r.h.toFixed(0)} pour ${q.x.toFixed(0)},${q.y.toFixed(0)} ${q.w.toFixed(0)}×${q.h.toFixed(0)})`);
      if (r.x < 0 || r.x + r.w > L.W || r.y < 0 || r.y + r.h > L.H) ko.push(`${id} hors de l'écran`);
      const xp = p.type === 'comptoir' ? Math.max(L.comptoir.x + 13, Math.min(L.comptoir.x + L.comptoir.w - 13, p.x)) : p.x; // (le comptoir ramène un point trop près de son bord)
      if (id !== 'toiles' && Math.abs(cx - xp) > 4) ko.push(`${id} pas au milieu de ${pl} (${cx.toFixed(1)} pour ${xp.toFixed(1)})`);
      if (p.type === 'sol' && Math.abs(w.y0) > 1) ko.push(`${id} pas posée au sol (pied à ${w.y0.toFixed(2)})`);
      if (p.type === 'comptoir' && Math.abs(w.y0 - m.dessusY) > 1) ko.push(`${id} pas posée sur le comptoir (pied à ${w.y0.toFixed(2)}, dessus à ${m.dessusY.toFixed(2)})`);
      if (p.type === 'rebord' && id !== 'toiles') { const ap = (L.murH - p.y) / Math.cos(52 * Math.PI / 180); if (Math.abs(w.y0 - ap) > 1) ko.push(`${id} pas sur l'appui de la fenêtre (pied à ${w.y0.toFixed(2)}, appui à ${ap.toFixed(2)})`); }
      if ((p.type === 'mur' || p.type === 'rebord') && w.z0 < -0.6) ko.push(`${id} entre dans le mur (z ${w.z0.toFixed(2)})`);
    }
    return ko;
  });

  // ─── éco, 390 × 844 ───
  {
    console.log('── éco, 390 × 844 : le plan d’origine ──');
    const { ctx, page, erreurs, ev } = await ouvrir('eco');
    check(await palier(ev, 1, false), 'la capitale au palier 1, tout au max');
    await sleep(1500);
    const a0 = await appels(ev);
    check(a0.decor <= 72 && a0.decos <= 3 && a0.petits === 1 && a0.lueurs === 1, `plan d’origine, sans déco : ${a0.decor} appels pour le décor (≤ 72 ; 71 avant la fusion), dont ${a0.petits} + ${a0.lueurs} pour les petits décors fixes fusionnés (cadre, horloge, plante, plan, ardoise, fleurs, paillasson, lampe : 12 appels avant)`);
    await ev(([q, h]) => { const S = window.__fournil.SCENE; S.decosQuartier(q); S.decosHantee(h); S.recompenses({ coupes: ['or', 'argent', 'bronze', 'or'], coupe: 'or', equipe: true }); }, [TOUTES_Q, TOUTES_H]);
    await attendre(() => ev(() => window.__fournil.SCENE.decosHanteeVues.length === 6 && window.__fournil.SCENE.decosVues.length === 5), 10000); await sleep(1000);
    const vues = await ev(() => { const S = window.__fournil.SCENE; return { q: S.decosVues, h: S.decosHanteeVues, r: S.recompensesVues, f: S.fusionVue }; });
    check(vues.q.join() === 'graffiti,neon,scooter,chien,toque-or' && vues.h.join() === 'citrouilles,toiles,chaudron,toque-citrouille,bestiaire,legende' && vues.r.equipe && vues.r.coupes === 4 && vues.r.coupe === 'or', `toutes les décos d’événement gagnées, au plan d’origine : ${vues.q.join(', ')} ; ${vues.h.join(', ')} ; la rosette, la vitrine et la coupe`);
    check(vues.f.liste.every((x) => typeof x[1] === 'string' && !/^[mscrx]\d$/.test(x[1])) && vues.f.parts <= vues.f.maxParts, `au plan d’origine, chacune bâtie à sa place de toujours (aucune place typée ; ${vues.f.parts} parties vives sur ${vues.f.maxParts})`);
    const at = await appels(ev);
    check(at.decor <= 72 && at.decos <= 3, `le pire cas avec TOUTES les décos d’événement gagnées : ${at.decor} appels pour le décor (≤ 72 ; 93 avant la fusion), dont ${at.decos} pour les décos et petits décors fusionnés`);
    // leurs places de toujours (les mesures de src/meubles.js, ramenées à l'écran) : chaque boîte autour de son repère
    const ou = await ev(() => {
      const S = window.__fournil.SCENE, L = VIE.LAY, b = S.decosBoites, W = L.W, K = L.K, f = L.fenetre, a = L.arriere, ko = [];
      const pres = (id, x0, x1) => { const r = b[id]; if (!r) { ko.push(id + ' absente'); return; } const cx = r.x + r.w / 2; if (cx < x0 || cx > x1) ko.push(`${id} à ${cx.toFixed(1)} (attendu ${x0.toFixed(1)}..${x1.toFixed(1)})`); };
      pres('graffiti', W * 0.79 - 4, W * 0.79 + 4); pres('neon', f.x + f.w / 2 - 4, f.x + f.w / 2 + 4); pres('bestiaire', f.x + f.w / 2 - 4, f.x + f.w / 2 + 4); pres('toque-or', a.x, a.x + a.w); pres('toque-citrouille', a.x, a.x + a.w);
      pres('chaudron', W * 0.085 - 4, W * 0.085 + 4); pres('legende', W * 0.05 - 3, W * 0.05 + 9 * K); pres('citrouilles', W * 0.29, W * 0.38); pres('chien', L.chien.x - 4, L.chien.x + 10 * K); pres('rosette', (L.horloge.x + L.diplome.x) / 2 - 6 * K, (L.horloge.x + L.diplome.x) / 2 + 2 * K);
      pres('horloge', L.horloge.x - 1, L.horloge.x + 1); pres('cadre', L.cadre.x - 1, L.cadre.x + 1); pres('plan', L.plan.x + L.plan.w / 2 - 3, L.plan.x + L.plan.w / 2 + 3);
      const n = b.neon, bo = b.bestiaire; if (n && bo && n.y + n.h > bo.y + 0.5) ko.push('le néon descend sur les bocaux');
      return ko;
    });
    check(!ou.length, `chacune à sa place de toujours : le tag sous l’étagère, le néon au-dessus des bocaux dans la fenêtre, les toques à la porte du fond, le chaudron, la lanterne, les citrouilles, le chien, la rosette ; l’horloge, le cadre, le plan de travail ${ou.join(' | ')}`);
    await capture(page, 'origine-toutes-eco.png');
    const boitesAvant = await ev(() => JSON.stringify(window.__fournil.SCENE.decosBoites));
    await poser(ev, LOURDES); await poser(ev, null);
    check(await ev((av) => JSON.stringify(window.__fournil.SCENE.decosBoites) === av, boitesAvant), '« Plan d’origine » (SCENE.decos(null)) : après une disposition, tout revient à l’identique, au pixel');

    console.log('── poser, ranger, déplacer ──');
    await ev(() => { const S = window.__fournil.SCENE; S.decosQuartier([]); S.decosHantee([]); S.recompenses({}); });
    await poser(ev, LOURDES);
    const a6 = await appels(ev), ko6 = await enPlace(ev), p6 = await ev(() => window.__fournil.SCENE.decosPosees);
    check(JSON.stringify(p6) === JSON.stringify(LOURDES), `les 6 décos les plus lourdes posées à leurs places : ${p6.map((x) => x.join('@')).join(' ')}`);
    check(!ko6.length, `chacune dans sa place, sur son appui, dans l’écran ${ko6.join(' | ')}`);
    check(a6.decor <= 72 && a6.decos <= 3, `PIRE CAS éco, capitale palier 1, tout au max, 6 décos les plus lourdes : ${a6.decor} appels pour le décor (≤ 72), dont ${a6.decos} pour les décos (≤ 3 : petits + lueurs)`);
    await capture(page, 'six-lourdes-eco.png');
    const chaine = await ev(() => typeof CHAINE !== 'undefined' && !!CHAINE.peutPoser);
    // ranger : la toile retirée de la liste
    await poser(ev, LOURDES.filter((x) => x[0] !== 'toiles'));
    check(await ev(() => !window.__fournil.SCENE.decosHanteeVues.includes('toiles') && !window.__fournil.SCENE.decosBoites.toiles), 'ranger : la toile d’araignée retirée, elle n’est plus dans la boutique');
    // déplacer : VIE.proposerDeco (le doigt aimanté à la place la plus proche de son type)
    const dep = await ev(([l]) => {
      const L = VIE.LAY, c = (id) => { const p = L.decos.find((x) => x.id === id); return [p.r.x + p.r.w / 2, p.r.y + p.r.h / 2]; };
      const a = VIE.proposerDeco(l, 'neon', ...c('m4')), b = VIE.proposerDeco(l, 'chaudron', ...c('c1')), e = VIE.proposerDeco(l, 'chaudron', ...c('s3'));
      const six = l.concat([['toiles', 'r1']]), sept = VIE.proposerDeco(six, 'graffiti', ...c('m3')), remplace = VIE.proposerDeco(six, 'graffiti', ...c('m1'));
      return { a, b, e, sept, remplace, vertes: null };
    }, [LOURDES.filter((x) => x[0] !== 'toiles')]);
    check(dep.a.ok && dep.a.place === 'm4' && dep.a.poses.some((x) => x[0] === 'neon' && x[1] === 'm4'), `déplacer le néon au mur entre l’horloge et le diplôme : vert (${dep.a.place}, ${dep.a.raison || 'ici ✓'})`);
    check(dep.b.place !== 'c1' && dep.b.place.startsWith('s'), `le chaudron glissé sur le comptoir : aimanté à la place de SON type la plus proche (${dep.b.place}), jamais au comptoir`);
    check(dep.e.ok && dep.e.place === 's3' && dep.e.poses.some((x) => x[0] === 'legende' && x[1] === 's1'), `le chaudron sur la place de la lanterne : elles échangent leurs places (${dep.e.poses.map((x) => x.join('@')).join(' ')})`);
    check(!dep.sept.ok && /6 décos au plus/.test(dep.sept.raison) && dep.sept.poses.length === 6, `la 7e déco refusée, en rouge : « ${dep.sept.raison} »${chaine ? ' (CHAINE.peutPoser)' : ' (sans les règles : VIE.validerDeco)'}`);
    check(dep.remplace.ok && dep.remplace.remplace === 'bestiaire' && dep.remplace.poses.length === 6, `une 7e posée sur une place prise : elle remplace celle qui y était (${dep.remplace.remplace}), six au plus`);
    // le mode Déplacer : les places dessinées, celle visée en vert ou en rouge
    await ev(([l]) => { const S = window.__fournil.SCENE, L = VIE.LAY, p = L.decos.find((x) => x.id === 'm4'); S.setDeplacerDecos(true); const g = VIE.proposerDeco(l, 'neon', p.r.x + p.r.w / 2, p.r.y + p.r.h / 2); S.glisserDeco(Object.assign(g, { x: p.r.x, y: p.r.y })); }, [LOURDES.filter((x) => x[0] !== 'toiles')]);
    await sleep(600); const gl = await ev(() => window.__fournil.SCENE.glisseDeco);
    check(gl && gl.ok && gl.vertes.length >= 2 && gl.vertes.includes('m4'), `le mode Déplacer : le néon au doigt, ses places vertes (${gl && gl.vertes.join(', ')})`);
    await capture(page, 'deplacer-vert-eco.png');
    await ev(([l]) => { const S = window.__fournil.SCENE, L = VIE.LAY, p = L.decos.find((x) => x.id === 'm3'); const six = l.concat([['toiles', 'r1']]); S.decos(six); const g = VIE.proposerDeco(six, 'graffiti', p.r.x + p.r.w / 2, p.r.y + p.r.h / 2); S.glisserDeco(Object.assign(g, { x: p.r.x, y: p.r.y })); }, [LOURDES.filter((x) => x[0] !== 'toiles')]);
    await sleep(600); const gr = await ev(() => window.__fournil.SCENE.glisseDeco);
    check(gr && !gr.ok && gr.raison, `la 7e au doigt : rouge, « ${gr && gr.raison} »`);
    await capture(page, 'deplacer-rouge-eco.png');
    await ev(() => window.__fournil.SCENE.setDeplacerDecos(false));
    check(await ev(() => window.__fournil.SCENE.decoSous(VIE.LAY.decos[4].r.x + 5, VIE.LAY.decos[4].r.y + 5) === 'chaudron'), 'la déco posée sous le doigt (decoSous) : le chaudron, à sa place');

    console.log('── le décor automatique garde sa place ──');
    await ev(() => window.__fournil.SCENE.decos([['souvenir-capitale', 'c2'], ['souvenir-ile', 'c1']])); await sleep(1500);
    const conf = await ev(() => { const S = window.__fournil.SCENE; return { p: S.decosPosees, att: S.decosEnAttente, pl: S.placesDecos.filter((p) => p.auto).map((p) => p.id) }; });
    check(conf.pl.includes('c2') && !conf.p.some((x) => x[1] === 'c2') && conf.p.length + conf.att.length === 2, `Halloween : la recette de saison garde c2 (${conf.pl.join(', ')}) ; la tour Eiffel prend la place libre suivante, sinon elle attend (${conf.p.map((x) => x.join('@')).join(' ') || 'aucune'} ; en attente : ${conf.att.join(', ') || 'aucune'})`);

    console.log('── Noël, palier 3 ──');
    await ev(() => { window.__fournil.st.boutiques = 16; window.__fournil.scene({ heure: 11, saison: ['noel'] }); });
    check(await palier(ev, 3, false), 'la capitale au palier 3, à Noël');
    await poser(ev, LOURDES, 5); await sleep(800);
    const an = await appels(ev), noel = await ev(() => ({ p: window.__fournil.SCENE.decosPosees, att: window.__fournil.SCENE.decosEnAttente }));
    check(!noel.p.some((x) => x[1] === 's2') && noel.att.length === 1, `à Noël, le sapin garde s2 : ${noel.p.length} décos posées, ${noel.att.join(', ')} attend (les trois places du sol : le sapin en prend une)`);
    check(an.decor <= 78 && an.decos <= 3, `Noël, palier 3, les décos les plus lourdes : ${an.decor} appels pour le décor (≤ 78 ; 77 avant, sans aucune déco), dont ${an.decos} pour les décos`);
    await ev(([q, h]) => { const S = window.__fournil.SCENE; S.decos(null); S.decosQuartier(q); S.decosHantee(h); S.recompenses({ coupes: ['or', 'argent'], coupe: 'or', equipe: true }); }, [TOUTES_Q, TOUTES_H]); await sleep(1800);
    const ano = await appels(ev);
    check(ano.decor <= 78, `Noël, palier 3, plan d’origine et toutes les décos gagnées : ${ano.decor} appels (≤ 78)`);
    await capture(page, 'noel-origine-eco.png');
    await ev(() => { const S = window.__fournil.SCENE; S.decosQuartier([]); S.decosHantee([]); S.recompenses({}); window.__fournil.st.boutiques = 6; window.__fournil.scene({ heure: 11, saison: [] }); });
    await palier(ev, 1, false);

    console.log('── les 15 décos neuves de « Ma chaîne » ──');
    const tri = await ev(() => Object.keys(MEUBLES.NEUVES).map((id) => { const d = MEUBLES.NEUVES[id](), n = (p) => (p ? (p.geo.index ? p.geo.index.count : p.geo.attributes.position.count) / 3 : 0); let t = 0; for (const p of d.fixe) t += n(p); for (const v of d.vifs) for (const p of v.pr) t += n(p); t += 2 * d.tex.length; return [id, Math.round(t)]; }));
    check(tri.length === 15 && tri.every(([, t]) => t > 0 && t <= 300), `15 décos procédurales, ≤ 300 triangles chacune : ${tri.map(([id, t]) => `${id} ${t}`).join(', ')}`);
    for (let k = 0; k < NEUVES.length; k++) {
      await poser(ev, NEUVES[k]); const ko = await enPlace(ev), p = await ev(() => window.__fournil.SCENE.decosPosees), a = await appels(ev);
      check(p.length === NEUVES[k].length && NEUVES[k].every((x) => p.some((y) => y[0] === x[0] && y[1] === x[1])) && !ko.length && a.decos <= 3, `disposition ${k + 1} : ${p.map((x) => x.join('@')).join(' ')} — chacune dans sa place, sur son appui, dans l’écran ${ko.join(' | ')} ; ${a.decos} appels pour les décos`);
      await capture(page, `neuves-${k + 1}-eco-390.png`);
    }
    await ev(() => window.__fournil.scene({ heure: 21.5, saison: [] })); await poser(ev, NEUVES[0]); await sleep(800); await capture(page, 'neuves-1-eco-390-soir.png'); await ev(() => window.__fournil.scene({ heure: 11, saison: [] }));

    console.log('── la photo d’un copain (champ dc) ; la mémoire ; la chaîne ; les règles ──');
    if (chaine) {
      const dc = await ev(() => { const l = [['souvenir-gare', 'm2'], ['chaudron', 's3'], ['souvenir-ile', 'c2'], ['toiles', 'r2']], code = CHAINE.codeDecos(l), r = CHAINE.decosDepuisCode(code); window.__fournil.SCENE.decos(r); return { code, r }; });
      await attendre(() => ev((n) => (window.__fournil.SCENE.decosPosees || []).length === n, dc.r.length), 8000); await sleep(800);
      const ko = await enPlace(ev), p = await ev(() => window.__fournil.SCENE.decosPosees);
      check(dc.code.length === 12 && JSON.stringify(p) === JSON.stringify(dc.r) && !ko.length, `une photo avec dc = « ${dc.code} » (CHAINE.decosDepuisCode) : les décos du copain à leurs places ${ko.join(' | ')}`);
      await capture(page, 'photo-dc-eco.png');
      const acc = await ev(() => { const ko = [], L = VIE.LAY; for (const f of CHAINE.FAMILLES) if (f.posable) for (const x of f.items) { const d = MEUBLES.DECOS[x.id]; if (!d || d.type !== x.place) ko.push(`${x.id} (${x.place} / ${d && d.type})`); } for (const p of CHAINE.PLACES) { const q = L.decos.find((y) => y.id === p.id); if (!q || q.type !== p.type || q.code !== p.code) ko.push('place ' + p.id); } return { ko, n: L.decos.length, nr: CHAINE.PLACES.length }; });
      check(!acc.ko.length && acc.n === 12 && acc.nr === 12, `le catalogue de la scène d’accord avec les règles : chaque déco posable a son modèle et le même type de place ; les 12 places (types, codes) ${acc.ko.join(' | ')}`);
    } else console.log('  (les règles, src/chaine.js, ne sont pas dans cette page : la photo et l’accord avec le catalogue se vérifient après leur fusion)');
    const mem = [];
    // (les clients vont et viennent : le compte bouge de quelques géométries ; une fuite des deux maillages fusionnés en ajouterait 2 à chaque fois)
    for (let k = 0; k < 12; k++) { await poser(ev, k % 2 ? LOURDES : NEUVES[0]); mem.push(await ev(() => window.__fournil.SCENE.stats.geometries)); }
    check(mem[11] - mem[1] <= 6 && mem[10] - mem[0] <= 6, `poser et changer de disposition douze fois : la mémoire graphique ne grandit pas (géométries ${mem.join(' → ')})`);
    const bas = await ev(async () => {
      const f = window.__fournil, avant = VIE.clients.length + VIE.apprentis.length; VIE.basculer('chaine'); const vide = VIE.clients.length + VIE.apprentis.length, mode = VIE.mode;
      await new Promise((r) => setTimeout(r, 400)); VIE.basculer(''); return { avant, vide, mode, apres: VIE.clients.length + VIE.apprentis.length, retour: VIE.mode };
    });
    check(bas.mode === 'chaine' && bas.vide === 0 && bas.retour === '' && bas.apres >= bas.avant, `VIE.basculer('chaine') : la salle de la boulangerie (${bas.avant} clients et apprentis) mise de côté, rendue au retour (${bas.apres})`);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  // ─── haute, 390 × 844, les modèles HD chargés ───
  {
    console.log('── haute, 390 × 844 : le pire cas, modèles HD chargés ──');
    const { ctx, page, erreurs, ev } = await ouvrir('haute');
    check(await palier(ev, 1, true), 'la capitale au palier 1, tout au max, les meubles KayKit et les modèles cuits du standing chargés');
    await sleep(2000); const h0 = await appels(ev);
    await poser(ev, LOURDES); await sleep(1500); const h6 = await appels(ev), ko = await enPlace(ev);
    check(h6.decor <= 80 && h6.decos <= 3 && !ko.length, `PIRE CAS haute, 6 décos les plus lourdes : ${h6.decor} appels pour le décor (≤ 80 ; ${h0.decor} sans déco, 78 avant la fusion), dont ${h6.decos} pour les décos ${ko.join(' | ')}`);
    await capture(page, 'six-lourdes-haute.png');
    await ev(([q, h]) => { const S = window.__fournil.SCENE; S.decos(null); S.decosQuartier(q); S.decosHantee(h); S.recompenses({ coupes: ['or', 'argent', 'bronze'], coupe: 'or', equipe: true }); }, [TOUTES_Q, TOUTES_H]); await sleep(2500);
    const ht = await appels(ev);
    check(ht.decor <= 80, `haute, plan d’origine, toutes les décos d’événement gagnées : ${ht.decor} appels (≤ 80 ; 100 avant la fusion)`);
    await ev(() => { const S = window.__fournil.SCENE; S.decosQuartier([]); S.decosHantee([]); S.recompenses({}); window.__fournil.st.boutiques = 16; });
    let pire = 0;
    for (const h of [11, 21.5]) { await ev((h) => window.__fournil.scene({ heure: h, saison: ['noel'] }), h); await palier(ev, 3, true); await poser(ev, LOURDES, 5); await sleep(1800); pire = Math.max(pire, (await appels(ev)).decor); }
    check(pire <= 82, `haute, Noël, palier 3, les décos les plus lourdes, à 11 h et le soir : au pire ${pire} appels (≤ 82)`);
    await capture(page, 'noel-haute-soir.png');
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  // ─── 360 × 640 : les places tiennent sur un petit écran ───
  {
    console.log('── éco, 360 × 640 ──');
    const { ctx, page, erreurs, ev } = await ouvrir('eco', { width: 360, height: 640 });
    await palier(ev, 1, false); await ev(() => window.__fournil.scene({ heure: 11, saison: [] }));
    for (const [nom, l] of [['lourdes', LOURDES], ...NEUVES.map((l, k) => [`neuves-${k + 1}`, l])]) {
      await poser(ev, l); const ko = await enPlace(ev), a = await appels(ev);
      check(!ko.length && a.decor <= 72, `360 × 640, ${nom} : chacune dans sa place, sur son appui, dans l’écran ${ko.join(' | ')} ; ${a.decor} appels (≤ 72)`);
      await capture(page, `${nom}-eco-360.png`);
    }
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (décos).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
