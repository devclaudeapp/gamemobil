// Opération Poncin — la caméra subjective, l'arme et les avatars sur la vraie page (C1, C2, C3, C7 et § 2 « le regard affiché ») :
// Playwright, téléphone simulé en paysage, poncin/index.html construit, la vraie carte. La boucle de la page ne dessine plus (le rendu
// logiciel ne tient pas 60 images/s) : le test avance la simulation de 1/60 s (window.__poncin.pas) et appelle PRENDU.image avec le
// même dt, comme la boucle à 60 images/s. Un joueur suit au « joystick à fond » (avant = 1, regard vers le point du chemin à 1,5 m) des
// chemins de navigation : une ligne droite sur la place (l'arène), la rue du Mazet (jusqu'à 30 %) dans les deux sens. Chaque trajet est
// joué deux fois, balancement « normal » puis « aucun » (PRENDU.reglages) : la différence est le balancement seul.
// Seuils (conception § 14) : balancement vertical entre 2 et 3,5 Hz, ≤ 1,3 cm de crête à crête à 5,2 m/s ; passe-haut 0,5 s de la
// caméra ≤ 1,0 cm rms sur la place, ≤ 1,5 cm rue du Mazet ; à-coups de vitesse verticale > 0,25 m/s : 0 sur la place, ≤ 2 rue du Mazet ;
// l'arme au même rythme que la caméra, sans cassure (pas de |cos|) ; robots et chibis sur la même foulée ; « doux » divise par 2 ;
// la position affichée est interpolée (alpha) et le regard affiché ajoute PCONTROLES.enAttente() ; sur un pont, l'œil est à la
// chaussée + 1,6 m. Captures dans test/shots/poncin-camera/.
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-camera.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(__dirname, 'shots', 'poncin-camera'); fs.mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p)); if (!f.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(0);
let echecs = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else echecs++; return !!ok; };
const TAU = Math.PI * 2, F = 60, cm = (v) => (v * 100).toFixed(2) + ' cm', f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

// ─── analyses (celles de la conception : outils-mesure.js) ───
function passeHaut(s, w) { // le signal moins sa moyenne glissante centrée sur w s
  const h = Math.max(1, Math.round(w * F / 2)), o = new Float64Array(s.length); let somme = 0, nb = 0;
  for (let i = 0; i <= Math.min(h, s.length - 1); i++) { somme += s[i]; nb++; }
  for (let i = 0; i < s.length; i++) { o[i] = s[i] - somme / nb; const e = i + h + 1, so = i - h; if (e < s.length) { somme += s[e]; nb++; } if (so >= 0) { somme -= s[so]; nb--; } }
  return o;
}
const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / Math.max(1, a.length)); };
const crete = (a) => { let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; };
function frequenceDominante(s) { // transformée de Fourier discrète sur 0,5 à 15 Hz, pas de 0,1 Hz
  let best = 0, bf = 0; const m = s.reduce((a, v) => a + v, 0) / s.length;
  for (let q = 0.5; q <= 15; q += 0.1) { let re = 0, im = 0; for (let i = 0; i < s.length; i++) { const a = TAU * q * i / F; re += (s[i] - m) * Math.cos(a); im += (s[i] - m) * Math.sin(a); } const p = re * re + im * im; if (p > best) { best = p; bf = q; } }
  return Math.round(bf * 10) / 10;
}
function acoups(y, seuil) { // changements de vitesse verticale de plus de seuil m/s d'une image à la suivante
  let n = 0, max = 0, vp = null;
  for (let i = 1; i < y.length; i++) { const v = (y[i] - y[i - 1]) * F; if (vp !== null) { const d = Math.abs(v - vp); if (d > seuil) n++; if (d > max) max = d; } vp = v; }
  return { n, max };
}
// la « cassure » : la plus forte dérivée seconde rapportée à celle d'une sinusoïde de même crête et de même fréquence (1 pour une
// sinusoïde ; ~5 pour le rebond en |cos| d'avant)
function cassure(s, f) { let m = 0; for (let i = 1; i + 1 < s.length; i++) m = Math.max(m, Math.abs(s[i + 1] - 2 * s[i] + s[i - 1])); const a = crete(s) / 2, w = TAU * f / F; return a > 0 ? m / (a * w * w) : 0; }

const ROUTES = {
  place: { nom: 'la place (arène), en ligne droite', pts: [[86, -5], [118, 30]], images: 300 },
  mazetMonte: { nom: 'rue du Mazet ↑ (≤ 30 %)', pts: [[213, -18], [236, 3], [252, 27], [252, 55]], images: 900 },
  mazetDescend: { nom: 'rue du Mazet ↓', pts: [[252, 55], [252, 27], [236, 3], [213, -18]], images: 900 },
};

(async () => {
  const navigateur = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await navigateur.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_CERT|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${serveur.address().port}/poncin/?qualite=eco`);
  await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 90000 });
  const dem = await page.evaluate(() => { const r = window.__poncin.demarrer({ bots: 3, niveau: 'facile', graine: 5 }); return { ok: !!r, idMoi: r && r.idMoi, corps: typeof PCORPS !== 'undefined', reglages: typeof PRENDU.reglages === 'function' }; });
  check(dem.ok && dem.corps && dem.reglages, `partie lancée (moi = ${dem.idMoi}), PCORPS chargé, PRENDU.reglages présent`);
  // la page ne mène plus les images ni le rendu : le test le fait, à 1/60 s
  await page.evaluate(() => { const P = window.__poncin; if (P.manuel) P.manuel(true); P.rendu(false); const j = P.jeu(); if (j.monde) j.monde.limite = null; P.pas(1); });

  // un trajet joué une fois : à chaque image, un pas de 1/60 s puis PRENDU.image(jeu, moi, 1/60, t) ; les robots sont écartés
  const jouer = (cle, bal) => page.evaluate(([R, bal]) => {
    const P = window.__poncin, j = P.jeu(), nav = j.nav, I = PRENDU._interne, idMoi = P.etat().idMoi;
    const chemin = []; for (let i = 0; i + 1 < R.pts.length; i++) { const c = nav.chemin(R.pts[i][0], R.pts[i][1], R.pts[i + 1][0], R.pts[i + 1][1]); if (!c) return { erreur: 'pas de chemin ' + R.pts[i] }; for (const p of c) chemin.push(p); }
    const a = nav.proche(R.pts[0][0], R.pts[0][1]), m = P.joueur(); let k = 0;
    const cap = () => { while (k < chemin.length - 1 && Math.hypot(chemin[k][0] - m.x, chemin[k][1] - m.z) < 1.5) k++; return Math.atan2(-(chemin[k][0] - m.x), -(chemin[k][1] - m.z)); };
    P.tp(a[0], a[1], 0); m.vx = m.vz = m.vy = 0; m.auSol = true; m.invincible = 1e9; m.ax = m.x; m.ay = m.y; m.az = m.z; m.yaw = cap(); m.pitch = 0;
    PRENDU.reglages({ balancement: bal }); if (I.CAM.f) I.CAM.f.remettre();
    P.entree({ avant: 1, cote: 0 });
    const o = { x: [], z: [], y: [], camY: [], fpY: [], fpX: [], phi: [], v: [] };
    for (let i = 0; i < R.images; i++) {
      for (const e of j.entites) if (e.bot) { e.x = 300; e.z = 300; e.vivant = false; e.mortDepuis = 1e9; }
      m.yaw = cap(); m.invincible = 1e9; m.vie = 100;
      const x0 = m.x, z0 = m.z; P.pas(1);
      PRENDU.image(j, idMoi, 1 / 60, i / 60, 1);
      o.x.push(m.x); o.z.push(m.z); o.y.push(m.y); o.camY.push(I.camera.position.y); o.fpY.push(I.FP.groupe.position.y); o.fpX.push(I.FP.groupe.position.x); o.phi.push(I.CAM.phi); o.v.push(Math.hypot(m.x - x0, m.z - z0) * 60);
    }
    P.entree(null);
    return o;
  }, [ROUTES[cle], bal]);

  const res = {};
  for (const cle of Object.keys(ROUTES)) {
    const R = ROUTES[cle], A = await jouer(cle, 'normal'), B = await jouer(cle, 'aucun'), D = await jouer(cle, 'doux');
    if (A.erreur || B.erreur) { check(false, `${R.nom} : ${A.erreur || B.erreur}`); continue; }
    let ecartTrajet = 0; for (let i = 0; i < A.x.length; i++) ecartTrajet = Math.max(ecartTrajet, Math.abs(A.x[i] - B.x[i]) + Math.abs(A.z[i] - B.z[i]) + Math.abs(A.y[i] - B.y[i]));
    const debut = 60, n = A.camY.length; // après la mise en vitesse (1 s)
    const bob = A.camY.slice(debut).map((v, i) => v - B.camY[i + debut]), bobD = D.camY.slice(debut).map((v, i) => v - B.camY[i + debut]);
    const vMoy = A.v.slice(debut).reduce((s, v) => s + v, 0) / (n - debut);
    const hp = passeHaut(Float64Array.from(A.camY), 0.5).slice(debut), hpB = passeHaut(Float64Array.from(B.camY), 0.5).slice(debut);
    const fpY = passeHaut(Float64Array.from(A.fpY), 0.5).slice(debut), oeilVrai = A.y.map((y) => y + 1.6);
    let ecartOeil = 0; for (let i = debut; i < n; i++) ecartOeil = Math.max(ecartOeil, Math.abs(B.camY[i] - oeilVrai[i]));
    const r = res[cle] = { ecartTrajet, vMoy, fBob: frequenceDominante(bob), cBob: crete(bob), cBobDoux: crete(bobD), hpRms: rms(hp), hpCrete: crete(hp), fCam: frequenceDominante(hp), hpRmsSans: rms(hpB),
      acoups: acoups(A.camY.slice(debut), 0.25), acoupsOeil: acoups(oeilVrai.slice(debut), 0.25), fArme: frequenceDominante(fpY), cArme: crete(fpY), ecartOeil };
    r.cassureArme = cassure(fpY, r.fArme || 3);
    console.log(`── ${R.nom} : ${n} images, ${f2(vMoy)} m/s, dénivelé ${f2(A.y[n - 1] - A.y[0])} m`);
    console.log(`   balancement seul : ${r.fBob} Hz, crête à crête ${cm(r.cBob)} (doux ${cm(r.cBobDoux)}) ; caméra passe-haut 0,5 s : ${cm(r.hpRms)} rms / ${cm(r.hpCrete)} crête à ${r.fCam} Hz (sans balancement ${cm(r.hpRmsSans)}) ;`
      + ` à-coups vy > 0,25 m/s : caméra ${r.acoups.n} (max ${f2(r.acoups.max)} m/s), œil de la simulation ${r.acoupsOeil.n} (max ${f2(r.acoupsOeil.max)}) ; écart à l'œil ${cm(r.ecartOeil)} ;`
      + ` arme ${r.fArme} Hz, crête ${cm(r.cArme)}, cassure ${f2(r.cassureArme)}`);
    check(ecartTrajet < 1e-9, `${R.nom} : le même trajet avec et sans balancement (écart ${ecartTrajet.toExponential(1)} m)`);
    check(vMoy > 4.9, `${R.nom} : à fond, ${f2(vMoy)} m/s`);
    check(r.fBob >= 2 && r.fBob <= 3.5 && r.cBob <= 0.013 && r.cBob > 0.004, `${R.nom} : balancement vertical à ${r.fBob} Hz (2 à 3,5), ${cm(r.cBob)} crête à crête (≤ 1,3 cm)`);
    check(Math.abs(r.cBobDoux - r.cBob / 2) < 0.001, `${R.nom} : « doux » divise le balancement par 2 (${cm(r.cBobDoux)})`);
    check(r.hpRms <= (cle === 'place' ? 0.010 : 0.015), `${R.nom} : passe-haut de la caméra ${cm(r.hpRms)} rms (≤ ${cle === 'place' ? '1,0' : '1,5'} cm)`);
    check(r.acoups.n <= (cle === 'place' ? 0 : 2), `${R.nom} : à-coups de vitesse verticale de la caméra ${r.acoups.n} (≤ ${cle === 'place' ? 0 : 2} ; l'œil de la simulation en a ${r.acoupsOeil.n})`);
    check(r.ecartOeil <= 0.035, `${R.nom} : l'œil lissé reste à ${cm(r.ecartOeil)} de l'œil de la simulation (≤ 3,5 cm)`);
    check(Math.abs(r.fArme - r.fBob) <= 0.3 && r.cArme <= 0.008 && r.cassureArme < 2.5, `${R.nom} : l'arme au même rythme (${r.fArme} Hz), ${cm(r.cArme)} crête à crête, sans cassure (${f2(r.cassureArme)} < 2,5)`);
  }
  await page.evaluate(() => PRENDU.reglages({ balancement: 'normal' }));

  // ─── le regard et la position affichés (§ 2) ───
  const vue = await page.evaluate(() => {
    const P = window.__poncin, j = P.jeu(), I = PRENDU._interne, idMoi = P.etat().idMoi, m = P.joueur(), r = {};
    P.tp(100, 10, 0.5); m.pitch = 0.1; P.pas(1); m.ax = m.x - 1; m.az = m.z + 0.5; m.ay = m.y;
    PRENDU.image(j, idMoi, 1 / 60, 10, 0.25); r.dx = I.camera.position.x - m.x; r.dz = I.camera.position.z - m.z;
    PRENDU.image(j, idMoi, 1 / 60, 10, 1); r.dx1 = I.camera.position.x - m.x; r.dz1 = I.camera.position.z - m.z;
    m.ax = m.x - 30; PRENDU.image(j, idMoi, 1 / 60, 10, 0.25); r.tele = I.camera.position.x - m.x; m.ax = m.x;
    const avant = PCONTROLES.enAttente; PCONTROLES.enAttente = () => ({ dyaw: 0.2, dpitch: -0.05 });
    try { PRENDU.image(j, idMoi, 1 / 60, 10, 1); r.yaw = I.camera.rotation.y - m.yaw; r.pitch = I.camera.rotation.x - m.pitch; } finally { PCONTROLES.enAttente = avant; }
    PRENDU.image(j, idMoi, 1 / 60, 10, 1); r.yaw0 = I.camera.rotation.y - m.yaw;
    return r;
  });
  check(Math.abs(vue.dx + 0.75) < 0.02 && Math.abs(vue.dz - 0.375) < 0.02 && Math.abs(vue.dx1) < 0.02 && Math.abs(vue.dz1) < 0.02, `position affichée = a + (x − a)·alpha (alpha 0,25 : ${f2(vue.dx)}, ${f2(vue.dz)} m ; alpha 1 : ${f2(vue.dx1)}, ${f2(vue.dz1)})`);
  check(Math.abs(vue.tele) < 0.02, `pas d'interpolation à travers une téléportation (${f2(vue.tele)} m)`);
  check(Math.abs(vue.yaw - 0.2) < 1e-6 && Math.abs(vue.pitch + 0.05) < 1e-6 && Math.abs(vue.yaw0) < 1e-6, `regard affiché = e.yaw/e.pitch + PCONTROLES.enAttente() (${f2(vue.yaw)}, ${f2(vue.pitch)} rad ; sans attente ${f2(vue.yaw0)})`);

  // ─── les avatars sur la foulée (C3) : un robot et un chibi qui avancent à 5,2 m/s ───
  const av = await page.evaluate(() => {
    const ent = (o) => Object.assign({ id: 'essai', nom: 'Essai', couleur: '#FF6B8B', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, auSol: true, accroupi: false, vivant: true, invincible: 0, arme: 'rafale' }, o), r = {};
    for (const [cle, e] of [['robot', ent({ id: 'r', bot: true, humain: false })], ['chibi', ent({ id: 'h', bot: false, humain: true })]]) {
      const a = PAVATARS.creer(e), ys = [], jambe = [];
      for (let i = 0; i < 300; i++) { e.z -= 5.2 / 60; PAVATARS.animer(a, e, 1 / 60, i / 60); ys.push(a.robot ? a.haut.position.y : a.P.haut.position.y * a.perso.scale.y); jambe.push(a.robot ? a.jambes[0].rotation.x : a.P.jambes[0].rotation.x); }
      // et avec une position affichée passée à part (rendu.js interpole) : e.x reste, le groupe suit x, y, z donnés
      PAVATARS.animer(a, e, 1 / 60, 5, 3, 0.5, e.z); r[cle + 'Pos'] = [a.groupe.position.x, a.groupe.position.y];
      PAVATARS.liberer(a); r[cle] = { ys, jambe };
    }
    return r;
  });
  for (const cle of ['robot', 'chibi']) {
    const ys = av[cle].ys.slice(60), f = frequenceDominante(passeHaut(Float64Array.from(ys), 0.5)), c = crete(ys), fj = frequenceDominante(av[cle].jambe.slice(60)), lim = cle === 'robot' ? 0.02 : 0.025;
    console.log(`── ${cle} à 5,2 m/s : haut du corps ${f} Hz, ${cm(c)} crête à crête ; jambes ${fj} Hz`);
    check(f >= 2 && f <= 3.5 && c <= lim + 1e-4 && c > lim * 0.8 && Math.abs(fj * 2 - f) <= 0.3, `${cle} : le haut du corps à ${f} Hz (une fois par pas, 2 à 3,5 Hz), ${cm(c)} (≤ ${cm(lim)}), deux fois le rythme des jambes (${fj} Hz)`);
    check(Math.abs(av[cle + 'Pos'][0] - 3) < 1e-9 && Math.abs(av[cle + 'Pos'][1] - 0.5) < 1e-9, `${cle} : PAVATARS.animer prend la position affichée (${av[cle + 'Pos'].map(f2)})`);
  }

  // ─── sur un pont (C7) : l'œil est à la chaussée + 1,6 m ───
  const pont = await page.evaluate(() => {
    const P = window.__poncin, j = P.jeu(), I = PRENDU._interne, idMoi = P.etat().idMoi, m = P.joueur(), T = j.monde.tabliers[0];
    const x = (T.ax + T.bx) / 2, z = (T.az + T.bz) / 2; P.tp(x, z, Math.atan2(-T.ux, -T.uz)); m.ax = m.x; m.az = m.z; m.ay = m.y; if (I.CAM.f) I.CAM.f.remettre();
    for (let i = 0; i < 30; i++) { P.pas(1); PRENDU.image(j, idMoi, 1 / 60, i / 60, 1); }
    return { y: m.y, chaussee: j.monde.chaussee(m.x, m.z), relief: j.monde.relief(m.x, m.z), cam: I.camera.position.y };
  });
  check(Math.abs(pont.y - pont.chaussee) < 1e-6 && Math.abs(pont.cam - pont.chaussee - 1.6) < 0.01, `pont du Veyron : le joueur sur la chaussée (${f2(pont.y - pont.relief)} m au-dessus du relief), la caméra à ${f2(pont.cam - pont.chaussee)} m de la chaussée`);

  // ─── captures (le rendu rallumé) : la place en marchant, un robot sur le pont vu de la rive ───
  const capture = async (nom, f) => { await page.evaluate(f); await page.screenshot({ path: path.join(out, nom + '.png') }); };
  await page.evaluate(() => window.__poncin.rendu(true));
  await capture('place-marche', () => { const P = window.__poncin, j = P.jeu(), id = P.etat().idMoi; P.tp(86, -5, -2.2); P.entree({ avant: 1 }); for (let i = 0; i < 40; i++) { P.pas(1); PRENDU.image(j, id, 1 / 60, i / 60, 1); } P.entree(null); });
  await capture('pont-robot', () => {
    const P = window.__poncin, j = P.jeu(), id = P.etat().idMoi, T = j.monde.tabliers[0], b = j.entites.find((e) => e.bot), m = P.joueur();
    const x = (T.ax + T.bx) / 2, z = (T.az + T.bz) / 2; b.vivant = true; b.x = x; b.z = z; b.y = j.monde.hauteur(x, z); b.ax = b.x; b.ay = b.y; b.az = b.z; b.yaw = 0;
    const px = x + T.vx * 9 - T.ux * 3, pz = z + T.vz * 9 - T.uz * 3; P.tp(px, pz, Math.atan2(-(x - px), -(z - pz))); m.pitch = -0.08; m.ax = m.x; m.ay = m.y; m.az = m.z;
    for (let i = 0; i < 3; i++) { b.x = x; b.z = z; b.y = j.monde.hauteur(x, z); b.ax = b.x; b.ay = b.y; b.az = b.z; PRENDU.image(j, id, 1 / 60, i / 60, 1); }
  });
  check(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
  console.log(`\nCaptures : ${path.relative(root, out)}/ ; ${oks} ok, ${echecs} en échec`);
  await navigateur.close(); serveur.close();
  process.exit(echecs ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
