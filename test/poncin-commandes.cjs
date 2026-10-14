// Opération Poncin : la boucle à pas fixe et le cumul des commandes (conception § 2, correction C4), sur la vraie page, iPhone en paysage.
// - pas fixe : sur 2 s d'images irrégulières, nombre de pas = temps / (1/60) à ±1 ; une image de 300 ms fait au plus 4 pas (le reste est perdu) ;
//   les positions ne dépendent pas de la cadence des images (30, 60, 120 Hz, irrégulière) ;
// - cumul : un glissé pendant des images sans pas n'est pas perdu (PCONTROLES.enAttente le montre, le pas suivant l'applique tout entier) ;
// - fronts : un saut ou un appui bref sur Tir donnés pendant une image sans pas, ou avant une image de 2 pas, partent une fois et une seule ;
// - le réglage « Balancement » est sauvegardé et transmis au rendu (PRENDU.reglages) ;
// - l'aide à la visée à 120 Hz : un glissé sur une cible ne fait jamais reculer le regard affiché de plus de 0,15° (PCONTROLES.attenuer).
// Commandes v2 (conception § 10, contrat de la livraison 2) :
// - l'entrée v2 { …, accroupi, course, couche, vise, arme: null | 0 | 1, changer } ; la course au joystick poussé à fond (≥ 0,92, ≤ 40° ;
//   sortie sous 0,85 ou au-delà de 50°) avec l'anneau jaune, qui efface la bascule accroupi et la visée ; le bouton Courir en option ;
// - Accroupi : toucher = accroupi tout de suite ; en courant = glissade (la simulation glisse, puis l'on se relève en courant) ; appui long
//   (350 ms) = couché ; toucher couché = accroupi ; un refus efface la bascule couché ;
// - Viser : bascule au doigt (ou maintenu, réglage), clic droit maintenu à la souris ; la vue tourne × (1/z)^0,9 × la sensibilité en visée ;
// - clavier : Maj (courir), C (accroupi), X (couché), 1 / 2 (emplacement), Q (changer) ; les pastilles d'armes du HUD (changer, recharger) ;
// - HUD v2 : pastilles « 30 | 120 » et « ∞ », icône de posture, point rouge et lunette selon A.visee.viseur, le refus ;
// - réglages (sensibilité en visée, visée, course) sauvegardés dans poncin.v2, et la reprise de poncin.v1.
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-commandes.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const PORT = +process.env.PORT || 0; // 0 : un port libre (d’autres tests peuvent tourner en même temps)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'poncin'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const PAS = 1 / 60;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_CERT/.test(m.text() + ((m.location() && m.location().url) || ''))) errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);
  const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p[0], y: p[1], id: p[2] })) });
  const P = (f, a) => page.evaluate(f, a);
  const centre = (sel) => P((s) => { const b = document.querySelector(s); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);

  await page.goto(`http://localhost:${server.address().port}/poncin/`);
  await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 30000 }).catch(() => {});
  check(await P(() => document.body.dataset.ecran === 'titre'), 'la page est prête (écran titre)');

  // ─── le réglage « Balancement » ───
  await P(() => { window.__bal = []; if (typeof PRENDU !== 'undefined' && !PRENDU.reglages) PRENDU.reglages = (o) => { window.__bal.push(o && o.balancement); }; else if (typeof PRENDU !== 'undefined') { const v = PRENDU.reglages; PRENDU.reglages = (o) => { window.__bal.push(o && o.balancement); return v.call(PRENDU, o); }; } });
  await P(() => window.__poncin.montrer('reglages'));
  const seg = await centre('.seg[data-r="balancement"] button[data-v="doux"]');
  check(!!seg, 'les réglages proposent « Balancement : normal / doux / aucun »');
  if (seg) await page.mouse.click(seg[0], seg[1]);
  await sleep(100);
  const bal = await P(() => ({ sauv: window.__poncin.sauvegarde().reglages.balancement, vu: window.__bal.slice(), appuye: document.querySelector('.seg[data-r="balancement"] button[data-v="doux"]').getAttribute('aria-pressed') }));
  check(bal.sauv === 'doux' && bal.appuye === 'true', `« doux » est choisi et sauvegardé (poncin.v1 : ${bal.sauv})`);
  check(bal.vu[bal.vu.length - 1] === 'doux', `le rendu le reçoit par PRENDU.reglages({ balancement }) (${bal.vu.join(', ')})`);
  await page.screenshot({ path: out + '/commandes-reglages.png' });
  const s2 = await centre('.seg[data-r="balancement"] button[data-v="normal"]'); if (s2) await page.mouse.click(s2[0], s2[1]);
  await P(() => window.__poncin.montrer('titre'));

  // ─── une partie, les images menées par le test ───
  const demarrer = (graine) => P((g) => {
    const p = window.__poncin; p.manuel(true);
    const st = p.demarrer({ bots: 3, niveau: 'facile', graine: g });
    const j = p.jeu(), m = p.joueur();
    if (!j.__aide) j.__aide = j.aideVisee; j.aideVisee = null; // pas d'aide à la visée : on compare des angles exacts (gardée pour plus bas)
    for (const e of j.entites) if (e.bot) { e.x += 300; e.z += 300; } // les robots au loin, pour ne pas être dérangé
    m.invincible = 999;
    p.images([1 / 60, 1 / 60, 1 / 60], { remettre: true }); // quelques pas pour se poser
    return !!st;
  }, graine);
  check(await demarrer(7), 'une partie démarre, la boucle est menée par le test (manuel)');

  // pas fixe : 2 s d'images irrégulières (4 à 50 ms)
  const fixe = await P((PAS) => {
    const p = window.__poncin; let s = 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const dts = []; let tot = 0; while (tot < 2) { const d = Math.min(2 - tot, 0.004 + rnd() * 0.046); dts.push(d); tot += d; }
    const t0 = p.jeu().temps, r = p.images(dts);
    const pic = p.images([0.3]); // une image de 300 ms : au plus 4 pas, le reste est perdu
    const lent = p.images(Array(10).fill(1 / 30)), vite = p.images(Array(40).fill(1 / 240));
    return { n: dts.length, pas: r.pas, attendu: tot / PAS, dtemps: r.temps - t0, alpha: r.alpha, pic: pic.pas, lent: lent.pas, vite: vite.pas };
  }, PAS);
  check(Math.abs(fixe.pas - fixe.attendu) <= 1, `pas fixe : ${fixe.pas} pas pour ${fixe.attendu.toFixed(1)} attendus sur 2 s (${fixe.n} images irrégulières)`);
  check(Math.abs(fixe.dtemps - fixe.pas * PAS) < 1e-6, `la partie avance de ${fixe.dtemps.toFixed(4)} s = pas × 1/60`);
  check(fixe.alpha >= 0 && fixe.alpha < 1, `alpha dans [0, 1[ (${fixe.alpha.toFixed(3)})`);
  check(fixe.pic === 4, `une image de 300 ms fait ${fixe.pic} pas (au plus 4 : le temps en trop est perdu)`);
  check(fixe.lent === 20 && Math.abs(fixe.vite - 10) <= 1, `30 Hz : 2 pas par image (${fixe.lent} pas / 10 images) ; 240 Hz : un pas toutes les 4 images (${fixe.vite} pas / 40 images)`);

  // la même course à 30, 60, 120 Hz et irrégulière : la même position
  const trace = async (dts) => { await demarrer(11); return P((dts) => { const p = window.__poncin; p.entree({ avant: 1, cote: 0.3 }); p.images(dts, { remettre: true }); p.entree(null); const m = p.joueur(); return { x: m.x, z: m.z, temps: p.jeu().temps }; }, dts); };
  const cadences = { '30 Hz': Array(90).fill(1 / 30), '60 Hz': Array(180).fill(1 / 60), '120 Hz': Array(360).fill(1 / 120) };
  { let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; const v = []; let t = 0; while (t < 3 - 1e-9) { const d = Math.min(3 - t, [1 / 60, 1 / 30, 1 / 120, 0.022, 0.009][Math.floor(rnd() * 5)]); v.push(d); t += d; } cadences['irrégulière'] = v; }
  await P(() => window.__poncin.rendu(false)); // la 3D coupée pendant les traces (la simulation seule compte)
  const pos = {}; for (const k in cadences) pos[k] = await trace(cadences[k]);
  await P(() => window.__poncin.rendu(true));
  const ref = pos['60 Hz']; let ecart = 0; for (const k in pos) ecart = Math.max(ecart, Math.hypot(pos[k].x - ref.x, pos[k].z - ref.z));
  check(ecart < 1e-9 && ref.temps > 2.9, `les positions ne dépendent pas de la cadence des images (écart ${ecart.toExponential(1)} m après ${ref.temps.toFixed(2)} s ; ${Object.keys(pos).join(', ')})`);

  // ─── le cumul : glisser pendant des images sans pas ───
  await demarrer(7);
  const avant = await P(() => { const p = window.__poncin; p.images([0.01], { remettre: true }); return { yaw: p.joueur().yaw, pitch: p.joueur().pitch }; }); // acc = 10 ms : pas de pas
  const N = 4, DX = -20; // 4 glissés de 20 px vers la gauche sur la moitié droite
  await toucher('touchStart', [[600, 200, 5]]);
  for (let k = 1; k <= N; k++) { await toucher('touchMove', [[600 + DX * k, 200, 5]]); await P(() => window.__poncin.images([0.001])); } // 4 images d'1 ms : toujours pas de pas
  await toucher('touchEnd', []);
  const milieu = await P(() => { const p = window.__poncin, a = PCONTROLES.enAttente(); return { yaw: p.joueur().yaw, attente: a.dyaw, pas: p.compteurs().acc }; });
  const theorie = N * Math.abs(DX) * 0.22 * Math.PI / 180 * Math.pow(Math.abs(DX), 0.15); // la courbe du doigt, glissé par glissé (au moins ça si le navigateur regroupe les glissés)
  check(milieu.yaw === avant.yaw, 'pendant les images sans pas, la vue simulée n’a pas bougé');
  check(milieu.attente > 0 && Math.abs(milieu.attente - theorie) / theorie < 0.15, `rien de perdu : enAttente().dyaw = ${(milieu.attente * 180 / Math.PI).toFixed(2)}° (théorie ${(theorie * 180 / Math.PI).toFixed(2)}°)`);
  const apres = await P(() => { const p = window.__poncin, r = p.images([0.01]); return { yaw: p.joueur().yaw, pas: r.pas, attente: PCONTROLES.enAttente().dyaw }; });
  const tourne = Math.atan2(Math.sin(apres.yaw - avant.yaw), Math.cos(apres.yaw - avant.yaw)); // le yaw est ramené dans ]−π, π]
  check(apres.pas === 1 && Math.abs(tourne - milieu.attente) < 1e-9, `le pas suivant applique tout le glissé (${(tourne * 180 / Math.PI).toFixed(2)}°, en 1 pas)`);
  check(apres.attente === 0, 'puis le cumul est vide');

  // ─── les fronts : saut et tir, jamais perdus ni doublés ───
  await P(() => { // on compte les entrées vues par la partie, et les événements
    const p = window.__poncin, j = p.jeu(), vrai = j.etape; window.__vu = { saut: 0, tir: 0, sautEv: 0, tirEv: 0, pas: 0 };
    j.etape = function (dt, en) { const e = en && en[p.etat().idMoi]; const v = window.__vu; v.pas++; if (e && e.saut) v.saut++; if (e && e.tir) v.tir++; const evs = vrai.call(this, dt, en); for (const x of evs || []) { if (x.t === 'saut' && x.id === 'moi') v.sautEv++; if (x.t === 'tir' && x.id === 'moi') v.tirEv++; } return evs; };
  });
  const remise = () => P(() => { const v = window.__vu; v.saut = v.tir = v.sautEv = v.tirEv = v.pas = 0; });
  const vu = () => P(() => Object.assign({}, window.__vu));
  const sautB = await centre('.pc-saut'), tirB = await centre('.pc-tir');
  check(!!sautB && !!tirB, 'les boutons Saut et Tir sont là');
  // 1) saut tapé pendant une image sans pas
  await P(() => window.__poncin.images(Array(30).fill(1 / 60))); // bien au sol
  await P(() => window.__poncin.images([0.004], { remettre: true })); await remise();
  await toucher('touchStart', [[sautB[0], sautB[1], 7]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([0.004, 0.004])); // pas de pas
  const v0 = await vu();
  await P(() => window.__poncin.images(Array(12).fill(1 / 60)));
  const v1 = await vu();
  check(v0.pas === 0 && v1.saut === 1 && v1.sautEv === 1, `saut pendant une image sans pas : vu par ${v1.saut} pas sur ${v1.pas}, ${v1.sautEv} saut`);
  // 2) saut tapé juste avant une image de 2 pas
  await P(() => window.__poncin.images(Array(60).fill(1 / 60))); await P(() => window.__poncin.images([0.001], { remettre: true })); await remise();
  await toucher('touchStart', [[sautB[0], sautB[1], 8]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([2 / 60, 1 / 60, 1 / 60]));
  const v2 = await vu();
  check(v2.pas === 4 && v2.saut === 1 && v2.sautEv === 1, `saut avant une image de 2 pas : vu par ${v2.saut} pas sur ${v2.pas}, ${v2.sautEv} saut (pas doublé)`);
  // 3) appui bref sur Tir (posé et levé entre deux images) pendant une image sans pas
  await P(() => window.__poncin.images(Array(60).fill(1 / 60))); await P(() => window.__poncin.images([0.004], { remettre: true })); await remise();
  await toucher('touchStart', [[tirB[0], tirB[1], 9]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([0.004]));
  await P(() => window.__poncin.images([2 / 60, 1 / 60, 1 / 60, 1 / 60]));
  const v3 = await vu();
  check(v3.tir === 1 && v3.tirEv === 1, `appui bref sur Tir entre deux images : vu par ${v3.tir} pas sur ${v3.pas}, ${v3.tirEv} tir (ni perdu ni doublé)`);
  // 4) Tir tenu : un niveau, présent à chaque pas tant qu'il est tenu
  await remise();
  await toucher('touchStart', [[tirB[0], tirB[1], 10]]);
  await P(() => window.__poncin.images([2 / 60, 1 / 60, 3 / 60]));
  await toucher('touchEnd', []);
  await P(() => window.__poncin.images([1 / 60, 1 / 60]));
  const v4 = await vu();
  check(v4.tir === 6 && v4.pas === 8, `Tir tenu : vu par ${v4.tir} pas sur ${v4.pas} (les 6 pas où il est tenu)`);
  // 5) une image sans pas garde le cumul : saut + glissé, puis 3 images sans pas, puis un pas
  await P(() => window.__poncin.images(Array(60).fill(1 / 60))); await P(() => window.__poncin.images([0.002], { remettre: true })); await remise();
  await toucher('touchStart', [[sautB[0], sautB[1], 11]]); await toucher('touchEnd', []);
  await P(() => window.__poncin.images([0.002, 0.002, 0.002]));
  const v5a = await vu();
  await P(() => window.__poncin.images([0.01]));
  const v5 = await vu();
  check(v5a.pas === 0 && v5.pas === 1 && v5.saut === 1, `trois images sans pas gardent le saut pour le premier pas (${v5.saut} sur ${v5.pas})`);

  // ─── l'aide à la visée à 120 Hz : le regard affiché ne recule jamais (le regard en attente est ralenti comme le pas l'appliquera) ───
  await P(() => { // une cible à 15 m, un peu à droite du viseur ; l'aide à la visée en service, au doigt
    const p = window.__poncin, j = p.jeu(), m = p.joueur(), b = j.entites.find((e) => e !== m);
    if (j.__aide) j.aideVisee = j.__aide;
    PCONTROLES.modeTactile(true);
    p.tp(100, 10, 0); m.pitch = 0; m.ax = m.x; m.az = m.z; m.ay = m.y; m.vx = m.vz = 0; m.invincible = 1e9;
    b.bot = false; b.x = m.x - 0.6; b.z = m.z - 15; b.y = j.monde.hauteur(b.x, b.z); b.ax = b.x; b.az = b.z; b.ay = b.y; b.vivant = true; b.invincible = 0; b.vie = 1e6;
    p.viser(b.id); m.yaw += 0.06;
    p.images([1 / 120, 1 / 120], { remettre: true });
  });
  const aideLa = await P(() => { const p = window.__poncin, j = p.jeu(); return typeof j.aideVisee === 'function'; });
  if (aideLa) {
    let gx = 560; await toucher('touchStart', [[gx, 120, 12]]); await P(() => window.__poncin.images([1 / 120]));
    const vus = []; let ral = 0;
    for (let i = 0; i < 90; i++) { gx += 1; await toucher('touchMove', [[gx, 120, 12]]); const r = await P(() => { const p = window.__poncin; p.images([1 / 120]); const a = p.jeu().aideVisee(p.etat().idMoi, 1); return { y: PRENDU._interne.camera.rotation.y, ral: a ? a.ralentir : 0 }; }); vus.push(r.y); if (r.ral > ral) ral = r.ral; }
    await toucher('touchEnd', []);
    let recul = 0, n = 0; for (let i = 1; i < vus.length; i++) { const d = vus[i] - vus[i - 1]; if (d > 0) { n++; recul = Math.max(recul, d); } }
    check(ral > 0 && recul * 180 / Math.PI <= 0.15, `120 Hz, glissé sur une cible (aide ${ral.toFixed(2)}) : le regard affiché recule au plus de ${(recul * 180 / Math.PI).toFixed(3)}° (≤ 0,15° ; ${n} image(s) sur ${vus.length - 1})`);
    await P(() => PCONTROLES.modeTactile(false));
  } else check(false, "l'aide à la visée est là (jeu.aideVisee)");

  // ═══════════════════════════ commandes v2 ═══════════════════════════
  await P(() => { const j = window.__poncin.jeu(); if (j.__aide) j.aideVisee = null; PCONTROLES.modeTactile(true); window.__poncin.rendu(false); }); // (la 3D coupée : la simulation, les commandes et le HUD seuls)
  // un endroit dégagé : 24 m de ligne droite libre devant soi, à plat (course, glissade, couché)
  const place = await P(() => {
    const p = window.__poncin, j = p.jeu(), M = j.monde;
    for (let r = 0; r < 60; r += 4) for (let a = 0; a < 16; a++) {
      const x = 99 + r * Math.cos(a * 0.7), z = 1.5 + r * Math.sin(a * 0.7);
      for (let k = 0; k < 16; k++) {
        const yaw = k * Math.PI / 8; let ok = !M.bloque(x, z, 1.2);
        for (let d = 1; d <= 24 && ok; d += 1) ok = !M.bloque(x - Math.sin(yaw) * d, z - Math.cos(yaw) * d, 1.0) && Math.abs(M.hauteur(x - Math.sin(yaw) * d, z - Math.cos(yaw) * d) - M.hauteur(x, z)) < 1.2;
        if (ok) return { x, z, yaw };
      }
    }
    return null;
  });
  check(!!place, `un endroit dégagé pour courir (${place ? place.x.toFixed(0) + ', ' + place.z.toFixed(0) : '—'})`);
  const aPlace = () => P((pl) => { const p = window.__poncin, m = p.joueur(); PCONTROLES.reinit(); p.tp(pl.x, pl.z, pl.yaw); m.pitch = 0; m.vx = m.vz = 0; m.ax = m.x; m.az = m.z; m.ay = m.y; m.invincible = 1e9; m.vie = 100; p.images(Array(30).fill(1 / 60)); }, place);
  const moiV2 = () => P(() => { const m = window.__poncin.joueur(); return { posture: m.posture, vers: m.vers, course: !!m.course, vise: m.vise || 0, arme: m.arme, armes: m.armes.slice(), slot: m.slot, equip: m.equip, v: Math.hypot(m.vx || 0, m.vz || 0), mun: Object.assign({}, m.munitions) }; });
  const cumulV = () => P(() => { const c = PCONTROLES.lire(); return { accroupi: c.accroupi, course: c.course, couche: c.couche, vise: c.vise, arme: c.arme, changer: c.changer }; });
  const images = (n) => P((n) => window.__poncin.images(Array(n).fill(1 / 60)), n);
  // un toucher d'un second doigt pendant que le pouce tient le joystick (un PointerEvent : relâcher un seul doigt par CDP n'est pas possible)
  const tapDoigt = (sel, id) => P(([sel, id]) => { const b = document.querySelector(sel), r = b.getBoundingClientRect(), o = { pointerId: id, pointerType: 'touch', isPrimary: false, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    b.dispatchEvent(new PointerEvent('pointerdown', o)); b.dispatchEvent(new PointerEvent('pointerup', o)); }, [sel, id]);
  await aPlace();
  // l'entrée v2
  const en0 = await P(() => { const p = window.__poncin, j = p.jeu(), vrai = j.etape; let vu = null; j.etape = function (dt, en) { if (!vu) vu = Object.assign({}, en[p.etat().idMoi]); return vrai.call(this, dt, en); }; p.images([1 / 60]); j.etape = vrai; return vu; });
  check(en0 && ['accroupi', 'course', 'couche', 'vise', 'changer'].every((k) => typeof en0[k] === 'boolean') && en0.arme === null && 'tir' in en0 && 'saut' in en0 && 'recharge' in en0, `l'entrée v2 a ses niveaux et ses fronts (${en0 ? Object.keys(en0).join(', ') : '—'})`);
  const eq0 = await moiV2();
  check(!!eq0.equip && eq0.armes.length === 2 && eq0.arme === eq0.armes[0], `le joueur a ses deux emplacements, la principale en main (${eq0.armes.join(' + ')})`);

  // ─── courir : le joystick poussé à fond ───
  const J0 = [160, 300];
  await toucher('touchStart', [[J0[0], J0[1], 30]]);
  await toucher('touchMove', [[J0[0], J0[1] - 40, 30]]); await images(1);
  const c50 = await cumulV();
  await toucher('touchMove', [[J0[0], J0[1] - 59, 30]]); await images(1); // (au-delà du rayon, la base suivrait le pouce)
  const c100 = await cumulV(), anneau = await P(() => document.querySelector('.pc-joy').classList.contains('course'));
  await toucher('touchMove', [[J0[0] + 59 * Math.sin(0.785), J0[1] - 59 * Math.cos(0.785), 30]]); await images(1);
  const c45 = await cumulV();
  await toucher('touchMove', [[J0[0] + 59 * Math.sin(0.96), J0[1] - 59 * Math.cos(0.96), 30]]); await images(1);
  const c55 = await cumulV();
  await toucher('touchMove', [[J0[0] + 59 * Math.sin(0.785), J0[1] - 59 * Math.cos(0.785), 30]]); await images(1);
  const c45b = await cumulV();
  check(!c50.course && c100.course && anneau, `joystick à 2/3 : on marche ; poussé à fond : on court, l'anneau jaune s'allume`);
  check(c45.course && !c55.course && !c45b.course, `à 45° on court encore (sortie au-delà de 50°), à 55° plus, et revenir à 45° ne suffit pas (entrée ≤ 40°)`);
  await toucher('touchMove', [[J0[0], J0[1] - 70, 30]]); await images(40);
  const court = await moiV2();
  check(court.course && court.v > 6.2, `la simulation court (${court.v.toFixed(2)} m/s)`);
  // la glissade : Accroupi touché en courant
  const accB = await centre('.pc-accroupi');
  await tapDoigt('.pc-accroupi', 931);
  const gl = []; for (let k = 0; k < 90; k++) { await images(1); const m = await moiV2(); gl.push(m.vers); }
  const glisse = gl.indexOf('glisse'), fini = gl.lastIndexOf('glisse');
  const finGl = await moiV2(), cApres = await cumulV();
  check(glisse >= 0 && glisse < 4, `Accroupi en courant : la glissade part tout de suite (au pas ${glisse}), dure ${((fini - glisse + 1) / 60).toFixed(2)} s`);
  check(!cApres.accroupi && finGl.vers === "debout" && finGl.course, `à la fin de la glissade, le joystick toujours poussé : on se relève et l’on court (${finGl.vers}, course ${finGl.course})`);
  // commencer à courir efface la bascule accroupi
  await toucher('touchMove', [[J0[0], J0[1] - 20, 30]]); await images(5);
  await tapDoigt('.pc-accroupi', 932); await images(20);
  const acc1 = await cumulV(), accM = await moiV2();
  await toucher('touchMove', [[J0[0], J0[1] - 70, 30]]); await images(2);
  const acc2 = await cumulV();
  check(acc1.accroupi && accM.posture === 'accroupi' && !acc2.accroupi, `toucher Accroupi en marchant : accroupi ; pousser le joystick à fond l'efface (${acc1.accroupi} → ${acc2.accroupi})`);
  await toucher('touchEnd', []); await images(30);
  check(!(await cumulV()).course, 'lâcher le joystick arrête la course');

  // ─── couché : appui long ; toucher couché → accroupi ───
  await aPlace();
  await toucher('touchStart', [[accB[0], accB[1], 33]]); await sleep(450); await images(1);
  const vib = await P(() => document.querySelector('.pc-accroupi').getAttribute('aria-pressed'));
  await toucher('touchEnd', []); await images(50);
  const cou = await moiV2(), cCou = await cumulV(), icoCou = await P(() => document.querySelector('.pc-accroupi').dataset.p === 'couche');
  check(cCou.couche && cou.posture === 'couche' && icoCou && vib === 'true', `appui long sur Accroupi (450 ms) : couché (${cou.posture} ; niveau couché ${cCou.couche}, bouton ${vib}), l'icône du bouton suit`);
  const hudPost = await P(() => document.querySelector('.h-posture').dataset.p);
  check(hudPost === 'couche', `le HUD montre l'icône de posture (${hudPost})`);
  await toucher('touchStart', [[accB[0], accB[1], 34]]); await toucher('touchEnd', []); await images(40);
  const dec = await moiV2(), cDec = await cumulV();
  check(!cDec.couche && cDec.accroupi && dec.posture === 'accroupi', `toucher Accroupi couché : accroupi (${dec.posture})`);
  await toucher('touchStart', [[accB[0], accB[1], 35]]); await toucher('touchEnd', []); await images(20);
  check((await moiV2()).posture === 'debout', 'un autre toucher : debout');
  // un refus de la simulation efface la bascule couché, et le HUD le dit
  await P(() => { const p = window.__poncin, j = p.jeu(), M = j.monde, m = p.joueur(); M.__bloque = M.bloque; M.bloque = (x, z, r) => (r >= 0.8 ? true : M.__bloque(x, z, r)); });
  await toucher('touchStart', [[accB[0], accB[1], 36]]); await sleep(450); await images(1); await toucher('touchEnd', []); await images(10);
  const refus = await P(() => { const M = window.__poncin.jeu().monde; M.bloque = M.__bloque; return { txt: document.querySelector('.h-refus').textContent, vu: document.querySelector('.h-refus').classList.contains('vu'), posture: window.__poncin.joueur().posture }; });
  const cRef = await cumulV();
  check(refus.vu && /Pas la place de te coucher/.test(refus.txt) && !cRef.couche && refus.posture !== 'couche', `pas la place : « ${refus.txt} », la bascule couché s'efface`);
  await toucher('touchStart', [[accB[0], accB[1], 37]]); await toucher('touchEnd', []); await images(20); // (l'appui avait aussi basculé accroupi)

  // ─── viser : bascule au doigt ; la vue tourne moins vite ; courir annule la visée ───
  await aPlace();
  const viseB = await centre('.pc-vise');
  check(!!viseB, 'le bouton Viser est là');
  await toucher('touchStart', [[viseB[0], viseB[1], 40]]); await toucher('touchEnd', []); await images(30);
  const mv1 = await moiV2(), cv1 = await cumulV(), vOn = await P(() => document.querySelector('.pc-vise').getAttribute('aria-pressed'));
  check(cv1.vise && mv1.vise === 1 && vOn === 'true', `toucher Viser : la visée monte et reste (vise ${mv1.vise.toFixed(2)}, bouton ${vOn})`);
  const zoomA = await P(() => { const m = window.__poncin.joueur(), A = PREGLES.arme(m.arme); return A.visee && A.visee.zoom || 1; });
  const glisse20 = async () => { await toucher('touchStart', [[600, 150, 41]]); await toucher('touchMove', [[620, 150, 41]]); await toucher('touchEnd', []); const d = await P(() => PCONTROLES.enAttente().dyaw); await images(1); return d; };
  const dVise = await glisse20();
  await toucher('touchStart', [[viseB[0], viseB[1], 42]]); await toucher('touchEnd', []); await images(40);
  const dHanche = await glisse20();
  const kTheo = Math.pow(1 / zoomA, 0.9);
  check(Math.abs(dVise / dHanche - kTheo) < 0.02, `en visée (zoom ${zoomA}), un même glissé tourne × ${(dVise / dHanche).toFixed(3)} (théorie (1/z)^0,9 = ${kTheo.toFixed(3)})`);
  await P(() => PCONTROLES.regler({ sensibiliteVisee: 0.5 }));
  await toucher('touchStart', [[viseB[0], viseB[1], 43]]); await toucher('touchEnd', []); await images(30);
  const dVise2 = await glisse20();
  check(Math.abs(dVise2 / dHanche - kTheo * 0.5) < 0.02, `sensibilité en visée 0,5 : × ${(dVise2 / dHanche).toFixed(3)}`);
  await P(() => PCONTROLES.regler({ sensibiliteVisee: 1 }));
  await toucher('touchStart', [[J0[0], J0[1], 44]]); await toucher('touchMove', [[J0[0], J0[1] - 70, 44]]); await images(2);
  const cv2 = await cumulV();
  await toucher('touchEnd', []); await images(30);
  check(!cv2.vise && cv2.course, 'se mettre à courir annule la visée');
  // réglage « maintenir » : la visée ne dure que l'appui
  await P(() => PCONTROLES.regler({ visee: 'maintenir' }));
  await toucher('touchStart', [[viseB[0], viseB[1], 45]]); await images(2); const tenu = await cumulV(); await toucher('touchEnd', []); await images(2); const lache = await cumulV();
  check(tenu.vise && !lache.vise, 'réglage « maintenir » : on vise tant que le doigt reste sur Viser');
  await P(() => PCONTROLES.regler({ visee: 'auto' }));

  // ─── le bouton Courir (réglage) ───
  await P(() => PCONTROLES.regler({ course: 'bouton' }));
  const courB = await centre('.pc-course'), visible = await P(() => getComputedStyle(document.querySelector('.pc-course')).display !== 'none');
  await toucher('touchStart', [[J0[0], J0[1], 46]]); await toucher('touchMove', [[J0[0], J0[1] - 70, 46]]); await images(2);
  const sansBouton = await cumulV();
  await tapDoigt('.pc-course', 947); await images(2);
  const avecBouton = await cumulV();
  await toucher('touchEnd', []); await images(2);
  const relache = await cumulV();
  check(visible && !sansBouton.course && avecBouton.course && !relache.course, `course « bouton » : le bouton Courir apparaît ; le joystick seul ne court plus, le bouton oui ; lâcher le joystick l'éteint`);
  await P(() => PCONTROLES.regler({ course: 'joystick' }));
  check(await P(() => getComputedStyle(document.querySelector('.pc-course')).display === 'none'), 'course « joystick » : pas de bouton Courir');

  // ─── les armes : pastilles du HUD (changer, recharger) ───
  await aPlace();
  const pastilles = await P(() => Array.from(document.querySelectorAll('.h-arme')).map((b) => ({ texte: b.querySelector('.h-mun').textContent, main: b.classList.contains('main'), svg: !!b.querySelector('svg'), r: (() => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })() })));
  check(pastilles.length === 2 && pastilles[0].main && pastilles.every((x) => x.svg) && /^\d+\s*\|\s*\d+$/.test(pastilles[0].texte.trim()) && /\|\s*∞$/.test(pastilles[1].texte.trim()), `deux pastilles : « ${pastilles.map((x) => x.texte.trim()).join(' » et « ')} »`);
  await toucher('touchStart', [[pastilles[1].r[0], pastilles[1].r[1], 50]]); await toucher('touchEnd', []); await images(40);
  const sec = await moiV2(), main2 = await P(() => document.querySelectorAll('.h-arme')[1].classList.contains('main'));
  check(sec.slot === 1 && sec.arme === sec.armes[1] && main2, `toucher la seconde pastille : la secondaire en main (${sec.arme})`);
  await P(() => { const p = window.__poncin; p.entree({ tir: true }); p.images(Array(30).fill(1 / 60)); p.entree({ tir: false }); p.images([1 / 60]); p.entree(null); });
  const avantR = await moiV2();
  await P(() => { const v = window.__evR = []; const j = window.__poncin.jeu(), vrai = j.etape; j.etape = function (dt, en) { const r = vrai.call(this, dt, en); for (const e of r || []) if (e.t === 'recharge' && e.id === window.__poncin.etat().idMoi) v.push(e); return r; }; });
  await toucher('touchStart', [[pastilles[1].r[0], pastilles[1].r[1], 51]]); await toucher('touchEnd', []); await images(5);
  const recharge = await P(() => window.__evR.length);
  const plein = await P((id) => PREGLES.arme(id).chargeur, avantR.arme); // le chargeur plein de l'arme en main (P226 : 15)
  check(avantR.mun[avantR.arme] < plein && recharge === 1, `toucher la pastille en main recharge (${avantR.mun[avantR.arme]} balles, ${recharge} recharge)`);
  // clavier : 1 / 2, Q, Maj, C, X
  await P(() => PCONTROLES.modeTactile(false));
  await page.keyboard.press('Digit1'); await images(40);
  const k1 = await moiV2();
  await page.keyboard.press('KeyQ'); const kq = await cumulV(); await images(40);
  const k2 = await moiV2();
  check(k1.slot === 0 && kq.changer && k2.slot === 1, `clavier : 1 → la principale, Q → l'autre emplacement (${k1.arme} → ${k2.arme})`);
  await page.keyboard.down('ShiftLeft'); const kmaj = await cumulV(); await page.keyboard.up('ShiftLeft'); const kmaj2 = await cumulV();
  await page.keyboard.press('KeyX'); const kx = await cumulV(); await page.keyboard.press('KeyX'); const kx2 = await cumulV();
  await page.keyboard.press('KeyC'); const kc = await cumulV(); await page.keyboard.press('KeyC'); const kc2 = await cumulV();
  check(kmaj.course && !kmaj2.course && kx.couche && !kx2.couche && kc.accroupi && !kc2.accroupi, 'clavier : Maj maintenue = courir, X = couché, C = accroupi (bascules)');
  await P(() => PCONTROLES.modeTactile(true)); await images(30);

  // ─── HUD v2 : point rouge et lunette selon le viseur de l'arme ───
  const viseurs = await P(() => { const o = {}; for (const A of PREGLES.ARMES) { const v = A.visee && A.visee.viseur; const k = v === 'lunette' ? 'lunette' : v === 'point' || v === 'point rouge' ? 'point' : 'fer'; if (!o[k]) o[k] = A.id; } return o; });
  const essaiViseur = (id) => P((id) => {
    const p = window.__poncin, m = p.joueur(), A = PREGLES.arme(id);
    m.armes[0] = id; m.munitions[id] = A.chargeur; m.reserve[id] = A.reserve; m.arme = null; p.entree({ arme: 0 }); p.images(Array(40).fill(1 / 60));
    p.entree({ vise: true }); const r = []; for (let k = 0; k < 30; k++) { p.images([1 / 60]); r.push({ v: m.vise, lun: document.querySelector('.h-lunette').classList.contains('vu'), pr: document.querySelector('.h-pr').classList.contains('vu'), o: +getComputedStyle(document.querySelector('.h-v1')).opacity }); }
    p.entree({ vise: false }); p.images(Array(30).fill(1 / 60)); p.entree(null);
    return r;
  }, id);
  if (viseurs.lunette) {
    const r = await essaiViseur(viseurs.lunette); const premier = r.find((x) => x.lun), fin = r[r.length - 1];
    check(premier && premier.v >= 0.85 && !r.some((x) => x.lun && x.v < 0.85) && fin.lun && fin.o === 0, `lunette (${viseurs.lunette}) : elle apparaît à vise ${premier ? premier.v.toFixed(2) : '—'} (≥ 0,85), le viseur de hanche disparaît`);
    check(!(await P(() => document.querySelector('.h-lunette').classList.contains('vu'))), 'la lunette disparaît quand on ne vise plus');
  } else check(false, 'une arme à lunette dans PREGLES.ARMES');
  if (viseurs.point) {
    const r = await essaiViseur(viseurs.point); const premier = r.find((x) => x.pr);
    check(premier && premier.v >= 0.7 && !r.some((x) => x.lun), `point rouge (${viseurs.point}) : il apparaît à vise ${premier ? premier.v.toFixed(2) : '—'} (≥ 0,7)`);
  } else check(false, 'une arme à point rouge dans PREGLES.ARMES');
  if (viseurs.fer) {
    const r = await essaiViseur(viseurs.fer); const fin = r[r.length - 1], op = await P(() => getComputedStyle(document.querySelector('.h-viseur')).getPropertyValue('--op').trim());
    check(!r.some((x) => x.lun || x.pr) && fin.o === 0, `organes de visée (${viseurs.fer}) : ni lunette ni point rouge, les branches s'effacent (le petit point reste)`);
  }

  // ─── HUD v2 : la limite de la zone, le chrono sans limite, « Encore en lice » ───
  const hud2 = await P(() => {
    const p = window.__poncin, j = p.jeu(), M = j.monde, L = M.limite, m = p.joueur(), r = {};
    if (L && L.centre && L.rayon > 0) {
      let ok = null; for (let a = 0; a < 32 && !ok; a++) { const x = L.centre[0] + Math.cos(a * 0.2) * (L.rayon - 1.5), z = L.centre[1] + Math.sin(a * 0.2) * (L.rayon - 1.5); if (!M.bloque(x, z, 0.5)) ok = [x, z]; }
      if (ok) { p.tp(ok[0], ok[1]); p.images(Array(20).fill(1 / 60)); r.bord = !document.querySelector('.h-limite').hidden; p.tp(L.centre[0], L.centre[1]); p.images(Array(20).fill(1 / 60)); r.centre = !document.querySelector('.h-limite').hidden; }
    }
    // une partie sans limite (jeu.reste indéfini) et sans réapparition, au contrat des règles (jeu.reglages normalisés), le temps de 3 images
    const g0 = j.reglages, d0 = Object.getOwnPropertyDescriptor(j, 'reste');
    j.reglages = Object.assign({}, g0 || j.options, { duree: 0, reapparition: 'aucune' }); Object.defineProperty(j, 'reste', { get: () => undefined, configurable: true });
    p.images(Array(3).fill(1 / 60));
    r.chrono = document.querySelector('.h-chrono b').textContent; r.objectif = document.querySelector('.h-chrono small').textContent;
    if (g0 === undefined) delete j.reglages; else j.reglages = g0; if (d0) Object.defineProperty(j, 'reste', d0); else delete j.reste;
    p.images([1 / 60]);
    return r;
  });
  check(hud2.bord === true && hud2.centre === false, `« Limite de la zone » à moins de 3 m du bord, pas au centre (${hud2.bord}, ${hud2.centre})`);
  check(hud2.chrono === '∞' && /Encore en lice : \d/.test(hud2.objectif), `sans limite de durée le chrono affiche « ${hud2.chrono} » ; sans réapparition : « ${hud2.objectif} »`);

  // ─── les réglages v2 sauvegardés (poncin.v2), et la reprise de poncin.v1 ───
  await P(() => { window.__poncin.rendu(true); window.__poncin.manuel(false); });
  await P(() => window.__poncin.menu()); await P(() => window.__poncin.montrer('reglages')); await sleep(200);
  const sv = await centre('.seg[data-r="visee"] button[data-v="maintenir"]'), sc = await centre('.seg[data-r="course"] button[data-v="bouton"]');
  check(!!sv && !!sc && !!(await centre('input[data-r="sensibiliteVisee"]')), 'les réglages proposent la sensibilité en visée, la visée (auto / appui / maintenir) et la course (joystick / bouton)');
  if (sv) await page.mouse.click(sv[0], sv[1]); if (sc) await page.mouse.click(sc[0], sc[1]);
  await P(() => { const i = document.querySelector('input[data-r="sensibiliteVisee"]'); i.value = '0.75'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  const reg = await P(() => ({ s: window.__poncin.sauvegarde(), v2: JSON.parse(localStorage.getItem('poncin.v2')), v1: JSON.parse(localStorage.getItem('poncin.v1')), c: Object.assign({}, PCONTROLES.reglages) }));
  check(reg.v2 && reg.v2.v === 2 && reg.v2.reglages.visee === 'maintenir' && reg.v2.reglages.course === 'bouton' && reg.v2.reglages.sensibiliteVisee === 0.75, `sauvegardés dans poncin.v2 (visée ${reg.v2 && reg.v2.reglages.visee}, course ${reg.v2 && reg.v2.reglages.course}, sensibilité en visée ${reg.v2 && reg.v2.reglages.sensibiliteVisee})`);
  check(reg.c.visee === 'maintenir' && reg.c.course === 'bouton' && reg.c.sensibiliteVisee === 0.75, 'et transmis aux commandes');
  check(reg.v1 && reg.v1.v === 1 && reg.v1.records && reg.v1.records.arene, 'une copie v1 (records) reste écrite pour la Salle de jeux');
  // la reprise : une vieille sauvegarde v1 seule
  await page.goto(`http://localhost:${server.address().port}/poncin/manifest.webmanifest`); // une page du même site sans le jeu (en partant, le jeu sauvegarde : pagehide)
  await P(() => { localStorage.removeItem('poncin.v2'); localStorage.setItem('poncin.v1', JSON.stringify({ v: 1, reglages: { sensibilite: 1.7, balancement: 'doux', nom: 'Vieux' }, records: { arene: { meilleur: 321, parties: 4, eliminations: 9, victoires: 1, serie: 2 } }, choix: { format: 'solo', bots: 5, niveau: 'fort' }, derniere: 12345 })); });
  await page.goto(`http://localhost:${server.address().port}/poncin/`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 60000 }).catch(() => {});
  const rep = await P(() => window.__poncin.sauvegarde());
  check(rep.v === 2 && rep.reglages.sensibilite === 1.7 && rep.reglages.balancement === 'doux' && rep.reglages.nom === 'Vieux' && rep.records.arene.meilleur === 321 && rep.choix.reglages && rep.choix.reglages.niveau === 'fort' && rep.choix.reglages.bots === 5 && rep.choix.reglages.v === 2 && rep.reglages.visee === 'auto' && rep.choix.equip && rep.choix.equip.p, `poncin.v1 repris dans poncin.v2 (sensibilité ${rep.reglages.sensibilite}, record ${rep.records.arene.meilleur}, anciens choix devenus choix.reglages : ${rep.choix.reglages && rep.choix.reglages.bots} robots ${rep.choix.reglages && rep.choix.reglages.niveau}, équipement ${rep.choix.equip && rep.choix.equip.p} + ${rep.choix.equip && rep.choix.equip.s})`);
  await page.goto(`http://localhost:${server.address().port}/poncin/manifest.webmanifest`);
  await P(() => { localStorage.removeItem('poncin.v1'); localStorage.removeItem('poncin.v2'); });
  await page.goto(`http://localhost:${server.address().port}/poncin/`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForFunction(() => window.__poncin && document.body.dataset.ecran === 'titre', null, { timeout: 60000 }).catch(() => {});
  await demarrer(7);

  // ─── la boucle normale reprend ───
  await P(() => window.__poncin.manuel(false)); await sleep(500);
  const c1 = await P(() => ({ c: window.__poncin.compteurs(), t: window.__poncin.jeu().temps, s: performance.now() })); await sleep(1500);
  const c2 = await P(() => ({ c: window.__poncin.compteurs(), t: window.__poncin.jeu().temps, s: performance.now(), fps: window.__poncin.stats().fps }));
  const dJeu = c2.t - c1.t, dReel = (c2.s - c1.s) / 1000, dPas = c2.c.pas - c1.c.pas;
  // (sans GPU, une image prend souvent plus de 4 pas : la partie ralentit plutôt que de s'emballer)
  check(dPas > 0 && Math.abs(dJeu - dPas * PAS) < 1e-6 && dJeu <= dReel + PAS, `la boucle de requestAnimationFrame avance la partie par pas de 1/60 s (${dPas} pas, ${dJeu.toFixed(2)} s de jeu en ${dReel.toFixed(2)} s, ${c2.fps} images/s ici)`);
  await page.screenshot({ path: out + '/commandes-partie.png' });

  console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : 'ERRORS none');
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  await browser.close(); server.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
