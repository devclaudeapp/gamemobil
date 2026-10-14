// Opération Poncin — l'heure et la météo du salon (PRENDU.ambiance, § 8 de la conception) et la clôture de la zone, Playwright, iPhone en
// paysage (844×390, deviceScaleFactor 2), carte réelle : pour chaque qualité (haute, éco ; moyenne sur demande) et chaque heure × météo
// (jour, soir, nuit × clair, brouillard, pluie), des captures (une rue du bourg, la place, les adversaires de près) et :
// - les budgets de l'image entière (≤ 110 / 90 / 70 appels de dessin, ≤ 300k / 200k / 120k triangles), et les appels ajoutés par
//   l'ambiance (stats.ambiance.appels : nuit ≤ 6, pluie ≤ 2 ; 0 en éco, le repli « teintes et brouillard seulement ») ; jamais plus
//   d'appels que le jour clair de la même vue, à ces ajouts et à un appel près (3 le soir en haute : la passe d'ombre du soleil rasant) ;
// - les vraies lumières de la nuit (4 en haute, 2 en moyenne, 0 en éco), la lampe torche, la pluie (2000 / 1200 / 0 traits), la brume ;
// - la nuit lisible : chaque adversaire de la vue « persos » reste visible (son torse éclairé, ou nettement plus clair que le fond ou
//   d'une autre couleur) ;
// - renderer.info.programs constant après le compte à rebours : l'ambiance posée et compilée, puis tirs, impacts, confettis, postures
//   ne créent aucun programme ;
// - en éco, pas plus de 10 % d'images par seconde en moins qu'au jour (temps d'image médian, attendu jusqu'au dernier pixel) ;
// - les réglages de la partie (jeu.reglages) donnent l'ambiance sans appel ; le décor allume ses lanternes et ses candélabres ;
// - la clôture suit jeu.zone.limite (arêtes, cercles), sinon monde.limite : ruban et piquets à moins de 60 m, 2 appels ;
// - les sons de l'ambiance (pluie, vent de nuit, gouttes, tonnerre, hibou) et des manches (gong, fanfare, éliminé).
// Le rendu est logiciel (SwiftShader) : le temps d'image n'est comparé qu'entre ambiances d'une même page.
// Usage : node test/poncin-ambiances.cjs [--qualite=haute,eco] [--ambiances=nuit:clair,jour:pluie] [--scenes=rue,place,persos]
// (NODE_PATH=/opt/node22/lib/node_modules si Playwright est installé globalement). Captures dans test/shots/poncin-ambiances/ ou SHOTS ;
// port : PORT_AMBIANCES (sinon un port libre).
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const out = path.resolve(process.env.SHOTS || path.join(__dirname, 'shots', 'poncin-ambiances')); fs.mkdirSync(out, { recursive: true });
const QUALITES = arg('qualite', 'haute,eco').split(','), SCENES = arg('scenes', 'rue,place,persos').split(',');
const HEURES = ['jour', 'soir', 'nuit'], METEOS = ['clair', 'brouillard', 'pluie'];
const AMBIANCES = arg('ambiances', HEURES.flatMap((h) => METEOS.map((m) => h + ':' + m)).join(',')).split(',').map((a) => a.split(':'));
const BUDGET = { haute: { calls: 110, triangles: 300000 }, moyenne: { calls: 90, triangles: 200000 }, eco: { calls: 70, triangles: 120000 } };
const LUMIERES = { haute: 4, moyenne: 2, eco: 0 }, GOUTTES = { haute: 2000, moyenne: 1200, eco: 0 };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(+process.env.PORT_AMBIANCES || 0);
let echecs = 0, oks = 0;
const verif = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else echecs++; };
const mediane = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const TABLEAU = [];
(async () => {
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const port = serveur.address().port;
  for (const qualite of QUALITES) {
    console.log(`── carte réelle, qualité ${qualite} ──`);
    const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push('console: ' + m.text()); });
    await page.goto(`http://localhost:${port}/test/poncin-atelier.html?carte=reelle&qualite=${qualite}`);
    const pret = await page.evaluate(() => atelier.pret);
    verif(pret && pret.ok && pret.stats.qualite === qualite, `WebGL et décor prêts (qualité ${pret && pret.stats.qualite})`);
    if (!pret || !pret.ok) { await ctx.close(); continue; }
    // le décor de la nuit : lanternes murales et candélabres (choix de style), en nombre borné, leurs points lumineux pour le rendu
    const dec = await page.evaluate(() => { const D = PRENDU._interne.decor, s = D.stats; return { lanternes: s.lanternes.length, candelabres: s.candelabres.length, lumieres: D.lumieres.length, proches: Math.min(...s.candelabres.map((c) => Math.min(...s.lanternes.concat(s.candelabres.filter((o) => o !== c)).map((o) => Math.hypot(o[0] - c[0], o[1] - c[1]))))), ok: typeof D.nuit === 'function' }; });
    verif(dec.ok && dec.lanternes >= 20 && dec.candelabres >= 5 && dec.candelabres <= 40 && dec.lumieres === dec.lanternes + dec.candelabres && dec.lumieres <= 200 && dec.proches >= 12.9,
      `le bourg s'éclaire : ${dec.lanternes} lanternes murales et ${dec.candelabres} candélabres le long des rues (${dec.lumieres} points lumineux, jamais deux à moins de 13 m d'un candélabre : ${dec.proches.toFixed(1)} m)`);
    // le jour clair d'abord : la référence de chaque vue
    const ref = {};
    for (const [heure, meteo] of [['jour', 'clair']].concat(AMBIANCES.filter((a) => !(a[0] === 'jour' && a[1] === 'clair')))) {
      const a = await page.evaluate(([h, m]) => { const r = atelier.ambiance(h, m); return { r, s: PRENDU.stats.ambiance }; }, [heure, meteo]);
      const tag = `${heure}/${meteo}`.padEnd(15);
      verif(a.r.heure === heure && a.r.meteo === meteo && a.s.heure === heure && a.s.meteo === meteo, `${tag} PRENDU.ambiance appliquée et compilée en ${a.s.compile} ms (brume ${a.s.brume.map((x) => Math.round(x)).join('–')} m, ombres ${a.s.ombres ? 'oui' : 'non'})`);
      const nuit = heure === 'nuit', pluie = meteo === 'pluie', eco = qualite === 'eco', permis = eco ? 0 : (nuit ? 2 : 0) + (pluie ? 2 : 0), ombre = heure === 'soir' && meteo === 'clair' && qualite === 'haute' ? 3 : 0; // le soleil rasant du soir : la passe d'ombre ramasse quelques objets de plus
      for (const nom of SCENES) {
        const s = await page.evaluate((n) => { const s = atelier.scene(n); s.clartes = n === 'persos' ? ['ami', 'b1', 'b2', 'b3'].map((id) => atelier.clarte(id)) : null; return s; }, nom);
        await page.screenshot({ path: path.join(out, `${qualite}-${heure}-${meteo}-${nom}.png`), timeout: 180000 });
        if (heure === 'jour' && meteo === 'clair') ref[nom] = s;
        const A = s.ambiance, b = BUDGET[qualite], r0 = ref[nom] || s;
        verif(s.calls <= b.calls && s.triangles <= b.triangles && A.appels <= permis && (nuit ? A.appels <= 6 : true) && s.calls <= r0.calls + permis + ombre + 1,
          `${tag} ${nom.padEnd(7)} ${s.calls} appels (jour : ${r0.calls}, ambiance + ${A.appels}${ombre ? `, ombres longues ≤ + ${ombre}` : ''}), ${(s.triangles / 1000).toFixed(1)}k triangles (budget ${b.calls} / ${b.triangles / 1000}k)`);
        TABLEAU.push([qualite, heure, meteo, nom, s.calls, Math.round(s.triangles / 100) / 10, A.appels, A.lumieres, A.gouttes]);
        if (nom === 'persos' && nuit) { // la nuit lisible : on voit les adversaires (torse assez clair et distinct du fond)
          const c = s.clartes.filter(Boolean), vus = c.filter((o) => o.corps >= 22 && (o.corps >= 45 || o.ecart >= 20 || Math.abs(o.corps - o.fond) >= 12));
          verif(c.length === 4 && vus.length === 4, `${tag} les adversaires se voient la nuit : torse / fond ${c.map((o) => `${o.corps.toFixed(0)}/${o.fond.toFixed(0)} (écart ${o.ecart.toFixed(0)})`).join(', ')} (luminance 0–255, écart de couleur RGB)`);
        }
      }
      const A = (await page.evaluate(() => PRENDU.stats.ambiance));
      verif(A.lumieres === (nuit ? LUMIERES[qualite] : 0) && A.lampe === (nuit && !eco) && A.gouttes === (pluie ? GOUTTES[qualite] : 0),
        `${tag} ${A.lumieres} vraies lumières, lampe torche ${A.lampe ? 'oui' : 'non'}, ${A.gouttes} traits de pluie${eco ? ' (éco : teintes et brouillard seulement)' : ''}`);
      // le nombre de programmes ne bouge plus après le compte à rebours (l'ambiance compilée, quelques images) : tirs, impacts, confettis…
      const pg = await page.evaluate(() => { atelier.scene('place'); const p0 = PRENDU.stats.ambiance.programmes; for (const n of ['tir', 'impacts', 'confettis', 'postures', 'persos', 'rue']) atelier.scene(n); return { p0, p1: PRENDU.stats.ambiance.programmes }; });
      verif(pg.p1 === pg.p0, `${tag} programmes constants après le compte à rebours (${pg.p0} → ${pg.p1}) : aucune recompilation en partie`);
    }
    if (qualite === 'eco') { // le repli éco : pas plus de 10 % d'images par seconde en moins qu'au jour (temps d'image médian, attendu jusqu'au dernier pixel)
      const ms = await page.evaluate(async (ambs) => {
        const gl = PRENDU._interne.renderer.getContext(), r = {}, px = new Uint8Array(4);
        const mesure = () => { atelier.scene('place'); atelier.image(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const t = []; for (let i = 0; i < 8; i++) { const a = performance.now(); atelier.image(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); } t.sort((x, y) => x - y); return t[t.length >> 1]; };
        for (let tour = 0; tour < 5; tour++) for (const [h, m] of ambs) { atelier.ambiance(h, m); const k = h + '/' + m; (r[k] = r[k] || []).push(mesure()); } // des tours entrelacés : le bruit du rendu logiciel touche tout le monde
        for (const k in r) { const t = r[k].sort((x, y) => x - y); r[k] = t[t.length >> 1]; }
        atelier.ambiance('jour', 'clair'); return r;
      }, [['jour', 'clair']].concat(AMBIANCES));
      const j = ms['jour/clair'], pires = Object.entries(ms).filter(([k, v]) => v > j * 1.1 + 0.3);
      verif(!pires.length, `éco : temps d'image médian du jour ${j.toFixed(1)} ms ; ${Object.entries(ms).filter(([k]) => k !== 'jour/clair').map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')} (≤ jour + 10 %)`);
    }
    // les réglages de la partie donnent l'ambiance (sans appel), puis le dernier appel revient hors partie
    const auto = await page.evaluate(() => { atelier.ambiance('jour', 'clair'); atelier.jeu.reglages = { heure: 'nuit', meteo: 'pluie' }; atelier.scene('place'); const a = PRENDU.stats.ambiance; delete atelier.jeu.reglages; atelier.image(0, true); const b = PRENDU.stats.ambiance; atelier.scene('place'); return { a: a.heure + '/' + a.meteo, b: b.heure + '/' + b.meteo, n: PRENDU._interne.decor.nuit() }; });
    verif(auto.a === 'nuit/pluie' && auto.b === 'jour/clair' && auto.n === 0, `jeu.reglages → ${auto.a} à la première image de la partie ; hors partie, le dernier appel : ${auto.b} (lanternes éteintes : ${auto.n})`);
    // la clôture : jeu.zone.limite (arêtes autour de la place, puis une union de cercles), sinon monde.limite (le cercle de l'arène)
    const clo = await page.evaluate(() => {
      const R = atelier.vues().place, r = [], cx = R.x, cz = R.z - 6, h = 24, carre = [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]], ar = [];
      for (let i = 0; i < 4; i++) ar.push(carre[i][0], carre[i][1], carre[(i + 1) % 4][0], carre[(i + 1) % 4][1]);
      const cas = [['arêtes', { limite: { forme: 'poly', aretes: ar } }], ['cercles', { limite: { forme: 'cercles', cercles: [[cx - 15, cz, 22], [cx + 15, cz, 22]] } }], ['monde.limite', null]];
      for (const [nom, z] of cas) { atelier.zone(z); atelier.scene('place'); if (!z) { const L = atelier.monde.limite, a = Math.atan2(R.z - L.centre[1], R.x - L.centre[0]); atelier.camera(L.centre[0] + Math.cos(a) * (L.rayon - 12), L.centre[1] + Math.sin(a) * (L.rayon - 12), 0, 0); atelier.etape(1 / 60, 2); } const s = PRENDU.stats; r.push({ nom, c: s.ambiance.cloture, calls: s.calls, ruban: PRENDU._interne.CLOT.ruban.visible, piquets: PRENDU._interne.CLOT.piquets.visible }); }
      return r;
    });
    for (const c of clo) verif(c.c.tranches > 0 && c.c.piquets > 0 && c.ruban && c.piquets && (c.nom === 'arêtes' ? c.c.forme === 'aretes' && c.c.aretes === 4 : c.nom === 'cercles' ? c.c.forme === 'cercles' : c.c.forme === 'cercle'),
      `clôture (${c.nom}) : forme ${c.c.forme}, ${c.c.aretes} arêtes, ${c.c.tranches} tranches de ruban et ${c.c.piquets} piquets à moins de 60 m (bord à ${c.c.distance} m)`);
    await page.evaluate(() => { const R = atelier.vues().place, h = 24; atelier.zone({ limite: { forme: 'poly', poly: [[R.x - h, R.z - 6 - h], [R.x + h, R.z - 6 - h], [R.x + h, R.z - 6 + h], [R.x - h, R.z - 6 + h]] } }); atelier.ambiance('nuit', 'clair'); atelier.scene('place'); atelier.camera(R.x + 14, R.z - 6 + 12, Math.atan2(-14, -12) + Math.PI, -0.05); atelier.etape(1 / 60, 2); });
    await page.screenshot({ path: path.join(out, `${qualite}-cloture-nuit.png`), timeout: 180000 });
    await page.evaluate(() => { atelier.zone(null); atelier.ambiance('jour', 'clair'); });
    if (qualite === QUALITES[0]) { // les sons : les nouveaux sons se rendent (hors ligne), les boucles d'ambiance naissent avec la partie et s'éteignent sans elle
      await page.addScriptTag({ path: path.join(racine, 'src-poncin', 'sons.js') });
      const so = await page.evaluate(async () => {
        const r = { mesures: {} }; for (const n of ['goutte', 'tonnerre', 'hibou', 'manche', 'mancheFin', 'elimine']) r.mesures[n] = await PSONS.mesurer(n, 3);
        PSONS.debloquer(); await new Promise((f) => setTimeout(f, 300)); r.etat = PSONS.contexte ? PSONS.contexte.state : 'aucun';
        const jeu = { entites: [{ id: 'moi', x: 0, z: 0, yaw: 0, vivant: true, arme: 'ak74', posture: 'debout' }], reglages: { heure: 'nuit', meteo: 'pluie' } };
        PSONS.evenements([{ t: 'manche', quoi: 'debut', n: 1 }, { t: 'elimine', id: 'b1' }], jeu, 'moi'); r.amb = PSONS.ambiance();
        jeu.reglages = { heure: 'jour', meteo: 'clair' }; await new Promise((f) => setTimeout(f, 300)); PSONS.evenements([], jeu, 'moi'); r.ambJour = PSONS.ambiance(); return r;
      });
      const m = so.mesures, mal = Object.entries(m).filter(([, v]) => !v || !(v.pic > 0.01) || !(v.duree > 0.05));
      verif(!mal.length, `sons rendus : ${Object.entries(m).map(([k, v]) => `${k} ${v ? (v.duree.toFixed(2) + ' s, pic ' + v.pic.toFixed(2)) : '—'}`).join(' ; ')}`);
      verif(so.etat !== 'running' || (so.amb.boucles && so.amb.pluie > 0.1 && so.amb.vent > 0 && so.amb.heure === 'nuit' && so.ambJour.pluie === 0 && so.ambJour.vent === 0),
        `ambiance sonore (contexte ${so.etat}) : nuit de pluie → pluie ${so.amb.pluie}, vent ${so.amb.vent} ; le jour clair → ${so.ambJour.pluie}, ${so.ambJour.vent}`);
    }
    const fin = await page.evaluate(() => PRENDU.stats);
    verif(fin.erreurs === 0, `aucune erreur interne du rendu (${fin.erreurs}${fin.derniereErreur ? ' : ' + fin.derniereErreur : ''})`);
    verif(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
  await navigateur.close(); serveur.close();
  console.log('\nqualité  heure  météo       vue      appels  ktri  +amb  lum.  pluie');
  for (const l of TABLEAU) console.log(`${l[0].padEnd(8)} ${l[1].padEnd(6)} ${l[2].padEnd(11)} ${l[3].padEnd(8)} ${String(l[4]).padStart(6)} ${String(l[5]).padStart(5)} ${String(l[6]).padStart(5)} ${String(l[7]).padStart(5)} ${String(l[8]).padStart(6)}`);
  console.log(`\n${oks} ok, ${echecs} en échec — captures dans ${out}/`);
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); serveur.close(); process.exit(1); });
