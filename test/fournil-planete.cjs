// La petite planète de « Ma chaîne » (src/planete.js, global PLANETE), seule sur sa page d'essai (outils/planete/page.cjs : Three.js, la HD,
// GAME, CHAINE quand src/chaine.js est là, VIE et PLANETE ; ni le jeu ni l'écran « Ma chaîne », qui la pilote par la même API), téléphone en
// portrait (390 × 844). On vérifie :
// · l'API du contrat : ouvrir(conteneur, fiches, { qualite, onToucher, onEntrer, heure }) avec les fiches de CHAINE.liste (la vraie forme :
//   CHAINE.etat puis CHAINE.liste quand les règles sont là ; sinon la même forme, faite main) ; une boutique et un fanion par fiche, de plus
//   en plus luxueuses (six standings) ; le kit (hd/planete/planete.glb) demandé une fois, ≤ 600 Ko ;
// · ≤ 60 appels de dessin et ≤ 40 000 triangles en haute, dans la vue d'arrivée et dans la pire des vues (chaque région devant, six zooms,
//   deux caps), à 30, 60 et 300 boutiques (toutes posées : au-delà de la centaine, les îlots et les places resserrées) ;
// · maj(fiches) sans rebâtir : un gérant embauché, des jetons à prendre, une Boutique d'or → le fanion (le point des jetons, l'or), le gérant
//   devant la vitrine, l'enseigne dorée sur le toit, l'étiquette ; les mêmes maillages (rien n'est rebâti) ;
// · au doigt (de vrais touchers, CDP Input.dispatchTouchEvent, la boucle de la planète suspendue : les images une à une, comme sur un écran à
//   60 i/s quelle que soit la lenteur de la machine) : un glissé fait tourner la planète, l'inertie la porte puis s'éteint ; pincer zoome, le
//   zoom trop poussé revient dans ses bornes ; la planète se redresse ;
// · toucher le fanion d'une boutique : onToucher(n), elle vient devant, de près, puis son étiquette (son n°, son quartier, son gérant, ses
//   jetons), qui tient dans le cadre de l'écran « Ma chaîne » (la boutique entre le titre et l'étiquette) ; « Entrer » : le plongeon, puis
//   onEntrer(n), une seule fois (pas d'entrée en rafale) ; l'écran qui referme la planète dans onEntrer (il entre dans la boutique) : elle
//   part proprement ; viser(n) ; toucher le ciel : l'étiquette part, la caméra recule ;
// · photo(q) : la carte postale d'une région (un JPEG), la vue rendue telle qu'elle était ;
// · l'heure : la nuit (les vitres allumées), le soir, le jour ;
// · cinq ouvertures et fermetures : la planète rebâtie à l'identique (géométries, textures), le sol et le décor repris du cache, son canvas
//   parti et son contexte WebGL rendu à chaque fois, le tas JS stable ;
// · en éco : ≤ 15 000 triangles dans la pire des vues (30, 60 et 300 boutiques), ni kit, ni nuages ; ?hd=0 : le sol et les boutiques
//   procéduraux seuls, aucune requête hd/planete ; une chaîne vide : la planète s'ouvre, sans fanion ;
// · aucune erreur dans la page. Trois captures (haute et éco, dans le cadre de l'écran) dans $CAPTURES_PLANETE (par défaut
//   <tmp>/planete-test) ; la vidéo et les planches : outils/planete/capture.cjs.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-planete.cjs   (port : PORT_PLANETE)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const { servir } = require('../outils/planete/page.cjs');
const ROOT = path.join(__dirname, '..'), PORT = +process.env.PORT_PLANETE || 8878;
const CAPTURES = process.env.CAPTURES_PLANETE || path.join(os.tmpdir(), 'planete-test');
const demandes = [], server = servir(ROOT, PORT, demandes); // (demandes : les fichiers hd/planete lus, avec leur poids)
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrirPage(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    // les contextes WebGL de la page, gardés ici (un canvas parti peut être ramassé avant que sa perte ne soit annoncée) : combien sont encore vivants
    await ctx.addInitScript(() => {
      const L = [], avant = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, o) { const g = avant.call(this, type, o); if (g && /webgl/.test(type) && !L.some((x) => x.c === this)) L.push({ c: this, g }); return g; };
      window.__contextes = () => ({ crees: L.length, vivants: L.filter((x) => !x.g.isContextLost()).length });
    });
    const page = await ctx.newPage(), erreurs = []; page.setDefaultTimeout(180000);
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/googleapis|gstatic|ERR_|404/.test(t + (m.location() && m.location().url))) erreurs.push(t); });
    demandes.length = 0;
    await page.goto(`http://localhost:${PORT}/fournil/planete-essai.html?${requete}`);
    await page.waitForFunction(() => window.ESSAI && typeof PLANETE !== 'undefined', null, { timeout: 60000 });
    const ev = (f, a) => page.evaluate(f, a);
    const cdp = await ctx.newCDPSession(page);
    // un toucher ; ts : son heure (en secondes), pour des gestes à la cadence d'un vrai écran quelle que soit la lenteur de la machine de test
    const touche = (type, pts, ts) => cdp.send('Input.dispatchTouchEvent', Object.assign({ type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) }, ts ? { timestamp: ts } : {}));
    const tas = async () => { await cdp.send('HeapProfiler.collectGarbage'); await dodo(100); await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
    const image = (n, dt) => ev(([n, dt]) => PLANETE.essai.image(dt, n), [n || 1, dt || 1 / 60]);
    // ouvrir la planète à la n°N (les fiches de N − 1 boutiques), la boucle suspendue, l'arrivée jouée ; en haute, le kit attendu
    const planete = async (N, o) => {
      const ok = await ev(([N, o]) => ESSAI.ouvrir(N, o), [N, Object.assign({ vraies: true }, o || {})]);
      if (ok && !/qualite=eco|hd=0/.test(requete)) await page.waitForFunction(() => PLANETE.stats && PLANETE.stats.kit, null, { timeout: 30000 }).catch(() => {});
      await ev(() => { PLANETE.essai.pause(true); PLANETE.essai.image(1 / 60, 100); });
      return ok;
    };
    return { ctx, page, ev, cdp, touche, tas, image, planete, erreurs };
  }
  // la pire des vues : chaque région devant, six zooms (penchée comme au repos de loin, de face de près), deux caps
  const pire = (ev) => ev(() => {
    let calls = 0, tri = 0, ou = '';
    for (let i = 0; i < PLANETE.REG.length; i++) for (const [z, pe] of [[0, 0.36], [0.2, 0.3], [0.4, 0.2], [0.55, 0.1], [0.72, 0], [0.9, 0]]) for (const tr of [0, 0.5]) {
      PLANETE.essai.regarder(i, z, pe); if (tr) PLANETE.essai.tourner(tr, 0); PLANETE.essai.image(1 / 60, 2);
      const s = PLANETE.stats; calls = Math.max(calls, s.calls); if (s.triangles > tri) { tri = s.triangles; ou = `${PLANETE.REG[i].id}, zoom ${z}${tr ? ', tournée' : ''}`; }
    }
    PLANETE.essai.repos(); PLANETE.essai.image(1 / 60, 2); return { calls, tri, ou };
  });
  const capture = async (K, nom) => { fs.mkdirSync(CAPTURES, { recursive: true }); await K.image(2); await dodo(400); const f = path.join(CAPTURES, nom + '.png'); await K.page.screenshot({ path: f }); console.log(`        capture ${f}`); };
  const quat = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))); // l'angle entre deux orientations

  // ─── 1. qualité haute, la HD permise ───
  const J = await ouvrirPage('qualite=haute&cadre=plein'), { ev, touche, image } = J;
  const api = await ev(() => ({ actif: PLANETE.actif, ouvert: PLANETE.ouvert, stats: PLANETE.stats, f: ['ouvrir', 'maj', 'viser', 'photo', 'fermer', 'heure'].filter((k) => typeof PLANETE[k] !== 'function'), chaine: ESSAI.chaine }));
  check(api.actif && !api.ouvert && api.stats === null && !api.f.length, 'l\'API PLANETE : ouvrir, maj, viser, photo, fermer, heure, stats (fermée : stats nul)');
  console.log(`        (les fiches : ${api.chaine ? 'CHAINE.liste, les vraies règles' : 'la forme de CHAINE.liste, faite main (src/chaine.js absent)'})`);
  const tas0 = await J.tas();
  check(await J.planete(31), 'ouvrir(conteneur, fiches de la n°31, { qualite: haute, heure: 12, onToucher, onEntrer }) : la planète est là');
  let s = await ev(() => PLANETE.stats);
  check(s.boutiques === 30 && s.placees === 30, `trente boutiques, toutes posées dans leur quartier (${s.placees}/${s.boutiques})`);
  const drap = await ev(() => ({ n: document.querySelectorAll('.pl-drap').length, vus: [...document.querySelectorAll('.pl-drap')].filter((d) => d.style.visibility !== 'hidden').length, std: [...new Set(ESSAI.vues.map((f) => f.standing))].length }));
  check(drap.n === 30 && drap.vus >= 8, `un fanion numéroté par boutique (${drap.n}, dont ${drap.vus} face à nous)`);
  check(drap.std === 6, 'les six standings sont là (de la boutique de quartier au palais)');
  check(s.kit, 'le kit de la planète est arrivé (qualité haute)');
  const poids = demandes.reduce((a, d) => a + d.n, 0), glb = demandes.filter((d) => /planete\.glb$/.test(d.p)).length;
  check(glb === 1 && poids <= 600 * 1024, `le kit demandé une fois, ${(poids / 1024).toFixed(0)} Ko (≤ 600 Ko)`);
  check(s.calls <= 60 && s.triangles <= 40000, `la vue d'arrivée : ${s.calls} appels de dessin (≤ 60), ${s.triangles} triangles (≤ 40 000)`);
  for (const N of [31, 61, 301]) {
    if (N !== 31) await J.planete(N);
    const pl = await ev(() => [PLANETE.stats.placees, PLANETE.stats.boutiques]), pv = await pire(ev);
    check(pl[0] === pl[1] && pv.calls <= 60 && pv.tri <= 40000, `${pl[1]} boutiques (${pl[0]} posées), la pire des vues : ${pv.calls} appels, ${pv.tri} triangles (${pv.ou})`);
  }

  // ─── maj(fiches) sans rebâtir : un gérant, des jetons, une Boutique d'or ───
  await J.planete(31);
  const maillages = () => ev(() => { const m = PLANETE.essai.scene().getObjectByProperty('type', 'Group'); return { uuid: m.children.map((o) => o.uuid).join(), geos: PLANETE.stats.geometries }; });
  const avantMaj = await maillages();
  await ev(() => {
    const l = ESSAI.vues.map((f) => Object.assign({}, f)), F = (n) => l.find((f) => f.n === n);
    Object.assign(F(2), { gerant: { rythme: 2, duree: 1, part: 0.18, heures: 10, reste: 4 * 3600 } }); // un gérant embauché
    Object.assign(F(4), { jetons: 3 }); // des jetons à prendre
    Object.assign(F(5), { or: true, jetons: 40, jauge: Object.assign({}, F(5).jauge, { fait: F(5).jauge.max }) }); // une Boutique d'or et son paquet
    Object.assign(F(1), { gerant: null, jetons: 0 });
    ESSAI.vues = l; PLANETE.maj(l); PLANETE.essai.image(1 / 60, 2);
  });
  const apresMaj = await maillages();
  check(apresMaj.uuid === avantMaj.uuid && apresMaj.geos === avantMaj.geos, `maj : rien n'est rebâti (les mêmes ${apresMaj.uuid.split(',').length} maillages, ${apresMaj.geos} géométries)`);
  const fan = await ev(() => { const d = (n) => [...document.querySelectorAll('.pl-drap')].find((e) => e.textContent.replace(/\D/g, '') === String(n)); return { or: !!(d(5) && d(5).classList.contains('or')), jet4: !!(d(4) && d(4).querySelector('.pl-jet')), jet1: !!(d(1) && d(1).querySelector('.pl-jet')) }; });
  check(fan.or && fan.jet4 && !fan.jet1, 'les fanions suivent : la n°5 dorée, le point des jetons à prendre sur la n°4, plus sur la n°1');
  const vue = async (n) => { await ev((n) => { PLANETE.viser(n); PLANETE.essai.image(1 / 30, 80); }, n); return ev(() => ({ s: PLANETE.stats, txt: document.querySelector('.pl-etiquette').textContent.replace(/\s+/g, ' ').trim(), or: !!document.querySelector('.pl-etiquette.or .pl-et-or') })); };
  let v = await vue(2);
  check(v.s.choisi === 2 && v.s.etiquette && /Gérant · encore (4 h|3 h 59)/.test(v.txt) && v.s.lod.gerants >= 1, `viser(2) : son gérant devant la vitrine, et dans l'étiquette (« ${v.txt} »)`);
  v = await vue(5);
  check(v.or && /Boutique d’or/.test(v.txt) && /40 jetons à prendre/.test(v.txt) && v.s.lod.ors >= 1, `viser(5) : la Boutique d'or, son enseigne dorée sur le toit (${v.s.lod.ors} visible) ; l'étiquette : « ${v.txt} »`);
  v = await vue(1);
  check(/Pas de gérant/.test(v.txt) && /Aucun jeton/.test(v.txt), `viser(1) : « ${v.txt} »`);
  await ev(() => { PLANETE.relacher(); PLANETE.essai.image(1 / 30, 40); });

  // ─── au doigt : tourner, l'inertie, pincer, le retour doux ───
  await ev(() => { PLANETE.essai.repos(); PLANETE.essai.image(1 / 60, 2); });
  const q0 = await ev(() => PLANETE.essai.etat().q);
  let ts = Date.now() / 1000; await touche('touchStart', [[150, 420]], ts);
  for (let k = 1; k <= 10; k++) { await touche('touchMove', [[150 + k * 14, 420 + k * 3]], ts += 1 / 60); await image(1); }
  await touche('touchEnd', [], ts += 1 / 60);
  const e1 = await ev(() => PLANETE.essai.etat()), tourne = quat(q0, e1.q);
  check(tourne > 0.4, `un glissé de 140 px fait tourner la planète (${(tourne * 180 / Math.PI).toFixed(0)}°)`);
  check(Math.abs(e1.vx) > 0.05, `l'inertie la porte au lâcher (${e1.vx.toFixed(2)} rad/s)`);
  await image(60);
  const e2 = await ev(() => PLANETE.essai.etat()), encore = quat(e1.q, e2.q);
  await image(240);
  const e3 = await ev(() => PLANETE.essai.etat());
  check(encore > 0.05 && e3.vx === 0 && e3.vy === 0, `elle continue sur son élan (${(encore * 180 / Math.PI).toFixed(0)}° de plus en 1 s), puis s'arrête`);
  const z0 = await ev(() => PLANETE.stats.z);
  ts = Date.now() / 1000; await touche('touchStart', [[180, 420], [210, 450]], ts);
  for (let k = 1; k <= 12; k++) { await touche('touchMove', [[180 - k * 9, 420 - k * 13], [210 + k * 9, 450 + k * 13]], ts += 1 / 60); await image(1); }
  const zp = await ev(() => PLANETE.stats.z);
  await touche('touchEnd', [], ts += 1 / 60);
  check(zp > z0 + 0.3, `pincer zoome (${z0} → ${zp})`);
  await image(90);
  const zr = await ev(() => PLANETE.stats.z);
  check(zr <= 1.0005 && zr > 0.9, `le zoom trop poussé revient doucement dans ses bornes (${zr})`);
  ts = Date.now() / 1000; await touche('touchStart', [[100, 300], [290, 560]], ts);
  for (let k = 1; k <= 14; k++) { await touche('touchMove', [[100 + k * 7, 300 + k * 9], [290 - k * 7, 560 - k * 9]], ts += 1 / 60); await image(1); }
  await touche('touchEnd', [], ts += 1 / 60); await image(120);
  const zd = await ev(() => PLANETE.stats.z);
  check(zd >= -0.0005 && zd < 0.2, `dézoomer ramène la vue d'ensemble, sans aller au-delà (${zd})`);
  await image(300);
  check(await ev(() => { const q = new THREE.Quaternion().fromArray(PLANETE.essai.etat().q), n = new THREE.Vector3(0, 1, 0).applyQuaternion(q); return Math.abs(Math.atan2(n.x, n.y)) < 0.08 || Math.hypot(n.x, n.y) < 0.3; }), 'au repos, la planète se redresse (son nord en haut)');

  // ─── toucher une boutique : onToucher, le zoom, puis l'étiquette ; « Entrer » ; toucher le ciel ───
  await ev(() => { PLANETE.essai.repos(); PLANETE.essai.image(1 / 60, 2); ESSAI.journal.length = 0; });
  const cible = await ev(() => { for (const n of [1, 6, 13, 3, 2, 5, 28, 8]) { const e = PLANETE.essai.ecran(n); if (e && e.vu && e.y > 120 && e.y < 700 && e.x > 20 && e.x < 360) return Object.assign({ n }, e); } return null; });
  check(!!cible, `une boutique visible à toucher (n°${cible && cible.n})`);
  if (cible) {
    await touche('touchStart', [[cible.x, cible.y]]); await touche('touchEnd', []);
    const t1 = await ev(() => ({ j: ESSAI.journal.slice(), s: PLANETE.stats }));
    check(t1.j.join() === `toucher ${cible.n}` && t1.s.choisi === cible.n && !t1.s.etiquette, `toucher son fanion : onToucher(${cible.n}), la planète part vers elle (l'étiquette attend la fin du tour)`);
    await image(90, 1 / 30);
    const et = await ev(() => { const e = document.querySelector('.pl-etiquette'); return { s: PLANETE.stats, num: e.querySelector('.pl-et-num').textContent, txt: e.textContent.replace(/\s+/g, ' ').trim(), r: e.getBoundingClientRect() }; });
    const q = await ev((n) => GAME.QUARTIERS[GAME.quartierDe(n)].nom, cible.n);
    check(et.s.etiquette && et.s.z > 0.5 && et.s.choisi === cible.n, `elle est devant, de près (zoom ${et.s.z}), puis l'étiquette paraît`);
    check(et.num === String(cible.n) && et.txt.toLowerCase().includes(q.toLowerCase()) && /gérant/i.test(et.txt) && /jeton/.test(et.txt) && /Entrer$/.test(et.txt), `l'étiquette : « ${et.txt} »`);
    check(et.r.top > 60 && et.r.bottom < 844 && et.r.left >= 0 && et.r.right <= 390, `l'étiquette tient dans l'écran (${Math.round(et.r.top)} → ${Math.round(et.r.bottom)})`);
    const b = await ev((n) => { const e = PLANETE.essai.ecran(n); return [e.bx, e.by - 20]; }, cible.n);
    await touche('touchStart', [b]); await touche('touchEnd', []); await image(2);
    check(await ev((n) => PLANETE.stats.choisi === n && PLANETE.stats.etiquette, cible.n), 'la toucher de nouveau ne la lâche pas');
    const bx = await ev(() => { const r = document.querySelector('.pl-et-entrer').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await touche('touchStart', [bx]); await touche('touchEnd', []);
    await touche('touchStart', [bx]); await touche('touchEnd', []); // (en rafale)
    const pl = await ev(() => ({ j: ESSAI.journal.slice(), entree: PLANETE.stats.entree, et: PLANETE.stats.etiquette }));
    check(pl.entree === cible.n && !pl.et && pl.j.length === 1, '« Entrer » : la caméra plonge vers sa porte, l\'étiquette part (onEntrer attend la fin du plongeon)');
    await image(30, 1 / 30);
    check((await ev(() => ESSAI.journal.slice())).join() === `toucher ${cible.n},entrer ${cible.n}`, `puis onEntrer(${cible.n}), une seule fois malgré deux touchers`);
    await dodo(1400); // (l'écran n'est pas entré : la planète revient vers l'étiquette ; une nouvelle entrée attend une seconde)
    const ret = await ev((n) => { PLANETE.essai.entrer(n); return PLANETE.stats.entree; }, cible.n);
    await image(30, 1 / 30);
    check(!ret && await ev(() => PLANETE.stats.etiquette), 'sans entrée de l\'écran, la planète revient à l\'étiquette ; une nouvelle entrée attend une seconde (pas de rafale)');
    await touche('touchStart', [[300, 140]]); await touche('touchEnd', []); await image(60, 1 / 30);
    check(await ev(() => !PLANETE.stats.etiquette && PLANETE.stats.choisi === 0 && PLANETE.stats.z < 0.2), 'toucher le ciel : l\'étiquette part, la caméra recule');
  }
  // de près : les budgets tiennent aussi
  await ev(() => { PLANETE.viser(30); PLANETE.essai.image(1 / 30, 80); });
  s = await ev(() => PLANETE.stats);
  check(s.etiquette && s.calls <= 60 && s.triangles <= 40000, `de près (viser(30)) : ${s.calls} appels, ${s.triangles} triangles`);
  // une carte postale (pour le carnet), la vue rendue telle qu'elle était
  const carte = await ev(() => { const e0 = JSON.stringify(PLANETE.essai.etat()); return PLANETE.photo('village').then((u) => ({ u: u ? u.slice(0, 23) : '', n: u ? u.length : 0, meme: JSON.stringify(PLANETE.essai.etat()) === e0 })); });
  check(carte.u === 'data:image/jpeg;base64,' && carte.n > 20000 && carte.meme, `photo('village') : la carte postale d'une région (${(carte.n / 1024).toFixed(0)} Ko en JPEG), la vue intacte`);
  check(await ev(() => PLANETE.photo(7).then((u) => !!u)) && !(await ev(() => PLANETE.photo('nulle-part'))), 'photo : une région par son indice aussi ; une région inconnue : rien');
  // ─── l'heure : la nuit, les vitres s'allument ; le soir ; midi ───
  await J.planete(31, { heure: 23 });
  const ciel = () => ev(() => ({ phase: PLANETE.stats.phase, lueur: PLANETE.stats.lueur, cl: document.querySelector('.pl-conteneur').className }));
  let h = await ciel();
  check(h.phase === 'nuit' && h.lueur === 1 && /pl-nuit/.test(h.cl), `à 23 h, la nuit : le ciel étoilé, les vitres allumées (lueur ${h.lueur} ; ${h.cl})`);
  await ev(() => PLANETE.heure(19)); h = await ciel();
  check(h.phase === 'soir' && h.lueur > 0 && h.lueur < 1 && /pl-soir/.test(h.cl) && !/pl-nuit/.test(h.cl), `à 19 h, le soir (lueur ${h.lueur} ; ${h.cl})`);
  await ev(() => PLANETE.heure(12)); h = await ciel();
  check(h.phase === 'jour' && h.lueur === 0 && !/pl-soir/.test(h.cl), `à midi, le jour (lueur ${h.lueur})`);

  // ─── « Entrer » dans le jeu : l'écran referme la planète dans onEntrer (il entre dans la boutique) ; elle part proprement ───
  await J.planete(31, { fermerEnEntrant: true });
  const ent = await ev(() => { ESSAI.journal.length = 0; PLANETE.viser(13); PLANETE.essai.image(1 / 30, 80); PLANETE.essai.entrer(13); PLANETE.essai.image(1 / 30, 30); return { j: ESSAI.journal.join(), ouvert: PLANETE.ouvert, reste: !!document.querySelector('.pl-toile, .pl-etiquette') }; });
  check(ent.j === 'entrer 13' && !ent.ouvert && !ent.reste && !J.erreurs.length, `l'écran referme la planète dans onEntrer : elle part proprement, sans erreur (${ent.j})`);

  // ─── fermer ; cinq ouvertures et fermetures : la mémoire reste ───
  await ev(() => ESSAI.fermer());
  check(await ev(() => !PLANETE.ouvert && PLANETE.stats === null && !document.querySelector('.pl-toile, .pl-drap, .pl-etiquette')), 'fermer : la planète part (son canvas, ses fanions, son étiquette)');
  const geos = [], tass = [], memo = [], temps = [];
  for (let k = 0; k < 5; k++) {
    temps.push(await ev(() => { const t0 = performance.now(); ESSAI.ouvrir(31, { vraies: true }); return Math.round(performance.now() - t0); }));
    await ev(() => { PLANETE.essai.pause(true); PLANETE.essai.image(1 / 60, 10); });
    geos.push(await ev(() => `${PLANETE.stats.geometries}/${PLANETE.stats.textures}`)); memo.push(await ev(() => PLANETE.stats.memo));
    await ev(() => ESSAI.fermer()); tass.push(await J.tas());
  }
  const ctxs = await ev(() => Object.assign({ canvas: document.querySelectorAll('canvas').length }, window.__contextes()));
  check(new Set(geos).size === 1, `la planète rebâtie à l'identique à chaque ouverture (géométries/textures : ${geos.join(' · ')})`);
  check(memo.every(Boolean), `le sol et le décor repris du cache à chaque réouverture (ouvrir : ${temps.join(', ')} ms)`);
  check(ctxs.canvas === 0 && ctxs.crees === 11 && ctxs.vivants === 0, `son canvas part avec elle, son contexte WebGL est rendu à chaque fermeture (${ctxs.crees} créés en onze ouvertures, ${ctxs.vivants} encore vivant)`);
  const dTas = (tass[4] - tass[0]) / 1024;
  check(dTas < 1536, `le tas JS stable sur cinq ouvertures (${(tass[0] / 1048576).toFixed(1)} → ${(tass[4] / 1048576).toFixed(1)} Mo, ${dTas >= 0 ? '+' : ''}${dTas.toFixed(0)} Ko ; avant la 1re : ${(tas0 / 1048576).toFixed(1)} Mo)`);
  check(!J.erreurs.length, `aucune erreur (${J.erreurs.slice(0, 3).join(' | ')})`);
  await J.ctx.close();

  // ─── 2. le cadre de l'écran « Ma chaîne » : la planète en haut (431 px), le titre dessus, l'étiquette compacte ───
  {
    const K = await ouvrirPage('qualite=haute&cadre=ecran');
    await K.planete(31); await K.ev(() => PLANETE.essai.touche());
    await capture(K, 'haute-ecran-30-boutiques');
    const r = await K.ev(() => { PLANETE.viser(27); PLANETE.essai.image(1 / 30, 90); const z = document.querySelector('.pl-conteneur').getBoundingClientRect(), et = document.querySelector('.pl-etiquette').getBoundingClientRect(), e = PLANETE.essai.ecran(27);
      return { zone: Math.round(z.height), et: [Math.round(et.top - z.top), Math.round(et.bottom - z.top)], pied: Math.round(e.by - z.top), compacte: document.querySelector('.pl-etiquette').classList.contains('pl-compacte'),
        coupes: [...document.querySelectorAll('.pl-et-nom, .pl-et-tete small, .pl-et-infos > span > span')].filter((x) => x.scrollWidth > x.clientWidth + 1).length }; });
    check(r.compacte && r.et[1] <= r.zone && r.et[0] > r.pied && r.pied > 72 && !r.coupes, `dans le cadre de l'écran (${r.zone} px) : la boutique sous le titre (son pied à ${r.pied} px), l'étiquette compacte dessous (${r.et[0]} → ${r.et[1]}), aucun texte coupé`);
    await capture(K, 'haute-ecran-boutique-n27');
    check(!K.erreurs.length, `aucune erreur dans le cadre de l'écran (${K.erreurs.slice(0, 3).join(' | ')})`);
    await K.ctx.close();
  }

  // ─── 3. en éco ───
  {
    const K = await ouvrirPage('qualite=eco&cadre=ecran');
    await K.planete(31);
    const se = await K.ev(() => Object.assign({ comptes: PLANETE.essai.comptes() }, PLANETE.stats));
    check(se.qualite === 'eco' && !se.kit && se.placees === 30 && !('nuages' in se.comptes), `en éco : trente boutiques, ni kit ni nuages (${se.qualite})`);
    check(se.triangles <= 15000 && se.calls <= 60, `en éco, la vue d'arrivée : ${se.triangles} triangles (≤ 15 000), ${se.calls} appels`);
    await K.ev(() => PLANETE.essai.touche()); await capture(K, 'eco-ecran-30-boutiques');
    for (const N of [31, 61, 301]) {
      if (N !== 31) await K.planete(N);
      const pl = await K.ev(() => [PLANETE.stats.placees, PLANETE.stats.boutiques]), pe = await pire(K.ev);
      check(pl[0] === pl[1] && pe.calls <= 60 && pe.tri <= 15000, `en éco, ${pl[1]} boutiques (${pl[0]} posées), la pire des vues : ${pe.calls} appels, ${pe.tri} triangles (${pe.ou})`);
    }
    check(!demandes.length, 'en éco : aucun fichier de la planète demandé');
    await K.ev(() => ESSAI.fermer());
    check(!K.erreurs.length, `aucune erreur en éco (${K.erreurs.slice(0, 3).join(' | ')})`);
    await K.ctx.close();
  }
  // ─── 4. ?hd=0 : la planète faite main, entière ; une chaîne vide ───
  {
    const K = await ouvrirPage('qualite=haute&hd=0&cadre=plein');
    await K.planete(16);
    const sh = await K.ev(() => PLANETE.stats);
    check(!sh.kit && sh.placees === 15 && sh.calls > 10, `?hd=0 : le sol et les quinze boutiques procéduraux (${sh.calls} appels, ${sh.triangles} triangles)`);
    check(!demandes.length, '?hd=0 : aucune requête hd/planete');
    await K.ev(() => { ESSAI.ouvrir(1, { fiches: [] }); PLANETE.essai.pause(true); PLANETE.essai.image(1 / 60, 30); });
    const vide = await K.ev(() => ({ ok: PLANETE.ouvert, n: PLANETE.stats.boutiques, d: document.querySelectorAll('.pl-drap').length, leg: document.querySelector('.pl-legende').textContent }));
    check(vide.ok && vide.n === 0 && vide.d === 0 && /Tourne la planète/.test(vide.leg), `une chaîne vide : la planète s'ouvre, sans fanion (« ${vide.leg} »)`);
    await K.ev(() => ESSAI.fermer());
    check(!K.erreurs.length, `aucune erreur sans HD (${K.erreurs.slice(0, 3).join(' | ')})`);
    await K.ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST VERT');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });
