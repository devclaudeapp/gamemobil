// Les clients 3D de la boutique (src/clients3d.js) sur la vraie page, téléphone en portrait (390 × 844), le mercredi 28 octobre 2026 (la
// Maison hantée est ouverte). On vérifie :
// · en qualité haute : le lot « clients » demandé après celui de la boutique (après les premières images), chaque fichier une fois, six
//   personnages et leurs clips en 500 Ko au plus ; leur programme compilé avant qu'ils n'apparaissent ; tous les clients en personnages 3D, un
//   appel de dessin chacun ; puis la vie, le temps piloté image par image (la boucle du jeu suspendue, comme outils/clients3d/boutique.cjs) :
//   l'entrée en saluant de la main (Wave), l'attente debout (les pieds au sol), servi (la joie : Victory), la sortie le sac à la main et le
//   salut à la porte ; assis à table, au bar, au coin salon et en terrasse (le pantalon sur le siège), le croissant ou la tasse à la main qui
//   monte à la bouche, le sac posé par terre ; se lever en ramassant son sac (PickUp) ; le client mystère (son personnage tout en or, son halo,
//   l'impatience, touché par sa boîte 3D : oui de la tête et le sac ; oublié : non de la tête, les mains vides) ; l'habitué (son personnage,
//   ses lunettes, oui de la tête, son prénom à la hauteur de sa tête, debout et assis) ; l'hiver (les bonnets), la marinière ; le budget
//   (le décor ≤ 80 appels de dessin ; le temps processeur d'une image, ×4, face aux mêmes clients en chibis) ; la HD coupée dans les
//   Réglages (les chibis tout de suite, la mémoire rendue après 10 s, les clients 3D de retour, la réserve refaite à petits pas, chauffée
//   de nouveau) ; la visite de la boutique d'un copain (Supabase simulé : les clients 3D y passent) ; trois allers-retours boutique ↔ Maison
//   hantée en HD (ses monstres, aucun client 3D) sans que la mémoire monte (géométries, textures, acteurs) ;
// · la boutique hantée procédurale (son lot HD absent) : ses clients restent des chibis déguisés, les clients 3D prêts ou non ;
// · en qualité moyenne aussi (leur jumeau MeshStandard) ; les replis : un personnage manquant (omis : cinq), l'hiver le lot réduit aux
//   personnages à chapeau ou à crête (les clients en bonnet vont tête nue, la scène continue ; un client sans personnage possible reste un
//   chibi, bâti une fois), les clips manquants (le lot échoue : les chibis, sans erreur), ?clients=0 et la qualité éco (aucun fichier des
//   clients demandé, les chibis). Aucune erreur dans la page, aucun avertissement de three.js (KHR_parallel_shader_compile : compileAsync
//   seulement si le pilote compile en parallèle).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-clients3d.cjs   (port : PORT_CLIENTS3D)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_CLIENTS3D || 8877, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-28T13:00:00+01:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
let demandes = [], bloques = []; // les fichiers hd/ demandés (dans l'ordre) ; ceux qu'on refuse (404), pour les replis
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  if (bloques.some((b) => b.test(p))) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
const PERSONNAGES = ['Casual_Female', 'Casual2_Male', 'Doctor_Female_Old', 'OldClassy_Male', 'Suit_Male', 'Worker_Female'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD en haute
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => {
      const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F;
      // le détecteur de gel du jeu (ui.js, verifierReveil) : le temps piloté suspend la boucle, il croirait à un retour d'absence
      const si = window.setInterval; window.setInterval = function (fn, ms, ...r) { if (fn && fn.name === 'verifierReveil') return 0; return si.call(window, fn, ms, ...r); };
      // le temps piloté : la boucle du jeu suspendue (ses rappels attendent), le test appelle SCENE.frame lui-même ; l'avance rapide sans dessin
      const raf = window.requestAnimationFrame.bind(window); let manuel = false; const file = [];
      window.__rafManuel = (on) => { manuel = on; if (!on) for (const cb of file.splice(0)) raf(cb); };
      window.requestAnimationFrame = (cb) => { if (!manuel) return raf(cb); file.push(cb); return file.length; };
      window.__dessin = (on) => {
        if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
        for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {};
      };
      // n images de dt s ; la dernière dessinée si dessin ; fn (une expression) avant chaque image ; rend ce que suivre(liste) garde de chaque image
      window.__pas = (n, dessin, suivre) => { const F = window.__fournil, S = F.SCENE, out = []; window.__dessin(false); try { for (let i = 0; i < n; i++) { if (dessin && i === n - 1) window.__dessin(true); S.frame(1 / 30, F.st, Date.now(), 33, false); if (suivre) out.push(suivre(S.clients3d)); } } finally { window.__dessin(true); } return out; };
    }, decal);
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [], avertissements = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(t + (m.location() && m.location().url))) erreurs.push(t); if (m.type() === 'warning' && /Clients 3D|HD :|THREE\./.test(t)) avertissements.push(t); }); // (THREE. : ceux de three.js, comme « KHR_parallel_shader_compile extension not supported »)
    demandes.length = 0;
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 60000 }); await sleep(600);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    for (let k = 0; k < 4; k++) { await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a$="tard"], #feuille [data-a="ok"]'); if (b) b.click(); }); await sleep(250); }
    // la boutique au complet : quatre recettes, quatre apprentis, tout le mobilier au maximum ; midi, sans saison ; ni événement ni mystère au hasard
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; F.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) F.meuble(m.id); st.tuto = 99; st.mystereTimer = 1e9; st.evTimer = 1e9; F.scene({ heure: 13, saison: [] }); F.save(); });
    await ev(() => window.__fournil.tiroir('ferme'));
    return { ctx, page, erreurs, avertissements, ev };
  }
  const pret3d = (ev) => ev(() => { const c = window.__fournil.SCENE.clients3d; return !!c && c.pret && c.compile === 2; });
  // un client de plus, à coup sûr (VIE.vente n'en amène qu'une fois sur deux, et pas quand la file est pleine) : celui de VIE.accueillir, qui
  // attend comme un autre (1,2 à 2,7 s) ; rend son id
  const nouveau = (ev) => ev(() => { const id = VIE.accueillir(); const c = VIE.clients.find((x) => x.id === id); if (c) { c.garde = false; c.wait = 1.2 + Math.random() * 1.5; } return c ? id : null; });
  const un = (ev, id) => ev((id) => (window.__fournil.SCENE.clients3d.liste.find((c) => c.id === id) || null), id);
  // le bas et le haut du corps d'un client 3D (y monde, ses sommets posés par les os), et le haut de sa tête que lit le calque
  const corps = (ev, id) => ev((id) => { let r = null; window.__fournil.SCENE.trois.scene.traverse((g) => { const a = g.userData && g.userData.c3d; if (a && a.c === id) { const m = CLIENTS3D.mesure(a), t = CLIENTS3D.tete(a); r = { bas: +m.bas.toFixed(2), haut: +m.haut.toFixed(2), tete: +t.y.toFixed(2) }; } }); return r; }, id);
  const memoire = (ev) => ev(() => { const s = window.__fournil.SCENE.stats, c = window.__fournil.SCENE.clients3d; return { g: s.geometries, t: s.textures, acteurs: c ? c.etat.acteurs : 0 }; });

  // ═══════════════════════════════ qualité haute ═══════════════════════════════
  console.log('── qualité haute : le lot des clients, après celui de la boutique ──');
  let { ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute');
  check(await attendre(() => ev(() => typeof CLIENTS3D !== 'undefined' && CLIENTS3D.actif && HDM.pret('boutique')), 60000), 'le module des clients 3D est là, et la boutique a ses décors HD');
  check(await attendre(() => ev(() => HDM.pret('clients')), 60000), 'le lot « clients » arrive ensuite, de lui-même');
  for (let k = 0; k < 3; k++) await nouveau(ev); // (des clients : la boucle du jeu prépare les clients 3D, les compile, puis les pose)
  check(await attendre(async () => (await pret3d(ev)) && (await ev(() => window.__fournil.SCENE.clients3d.glb > 0)), 90000), 'cuits à petits pas, leur programme compilé : les clients deviennent des personnages 3D');
  {
    const iB = demandes.findIndex((p) => /\/hd\/meubles2\//.test(p)), iC = demandes.findIndex((p) => /\/hd\/clients\//.test(p)), dernierB = demandes.reduce((m, p, i) => (/\/hd\/meubles2\//.test(p) ? i : m), -1);
    const cl = demandes.filter((p) => /\/hd\/clients\//.test(p)), uniques = [...new Set(cl)], poids = uniques.reduce((s, p) => s + fs.statSync(path.join(root, p)).size, 0);
    check(iB >= 0 && iC > dernierB, `les fichiers des clients sont demandés après ceux de la boutique (n° ${iC} après le n° ${dernierB} sur ${demandes.length})`);
    check(uniques.length === 7 && cl.length === 7 && PERSONNAGES.every((n) => uniques.some((p) => p.endsWith(`/clients/${n}.glb`))) && uniques.some((p) => p.endsWith('/clients/anims.glb')), `six personnages et leurs clips (anims.glb), chacun demandé une fois (${cl.length} demandes)`);
    check(poids <= 500 * 1024, `leur poids : ${Math.round(poids / 1024)} Ko (≤ 500 Ko)`);
    const e = await ev(() => { const c = window.__fournil.SCENE.clients3d; return { info: c.info, etat: c.etat }; });
    check(e.info.modeles.length === 6 && e.info.modeles.every((m) => m.tris > 2000 && m.tris < 5000 && m.os === 23), `six personnages cuits (${e.info.modeles.map((m) => `${m.nom} ${m.tris} triangles`).join(', ')})`);
    check(e.etat.acteurs >= 24 && e.etat.chauffes === 1, `la réserve : ${e.etat.acteurs} acteurs, chauffés une fois ; la cuisson : ${e.etat.msCuisson} ms en ${e.etat.images} images, le plus long pas ${e.etat.pasMax} ms (${e.etat.pasLent})`);
  }

  console.log('── le temps piloté : la boutique au complet, tous les clients en 3D ──');
  await ev(() => window.__rafManuel(true)); await sleep(300);
  await ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'table', 'bar', 'bar', 'banquette', 'banquette', 'banquette', 'terrasse', 'terrasse']) S.installer(z, 600); });
  for (let k = 0; k < 4; k++) await nouveau(ev);
  // le temps avance par paquets jusqu'à ce que les places soient prises (une machine lente n'en a que 8 au bout de 60 pas)
  const assisPrets = () => ev(() => { const L = window.__fournil.SCENE.clients3d.liste.filter((x) => x.etat === 'assis' && !x.leve && x.assisK >= 1); return L.length >= 10 && new Set(L.map((x) => x.siege)).size === 4; });
  await ev(() => window.__pas(60, true));
  for (let k = 0; k < 27 && !(await assisPrets()); k++) await ev(() => window.__pas(20, true));
  {
    const c = await ev(() => window.__fournil.SCENE.clients3d);
    check(c.glb === await ev(() => VIE.clients.length) && c.chibis === 0, `tous les clients en personnages 3D (${c.glb}, aucun chibi)`);
    check(c.liste.every((x) => x.mailles === 1), `un maillage chacun (un appel de dessin par client) : ${[...new Set(c.liste.map((x) => x.mailles))].join(', ')}`);
    const noms = new Set(c.liste.map((x) => x.nom)); check(noms.size >= 4, `des personnages variés (${[...noms].join(', ')})`);
    // assis : le dessous du pantalon sur le siège (chaises et tabourets à 16, le coin salon à 12)
    const assis = c.liste.filter((x) => x.etat === 'assis' && !x.leve && x.assisK >= 1), H = await ev(() => CLIENTS3D.ASSISE), ko = assis.filter((x) => Math.abs(x.assise - H[x.siege]) > 1.5);
    check(assis.length >= 10 && ko.length === 0 && new Set(assis.map((x) => x.siege)).size === 4, `assis à table, au bar, au coin salon, en terrasse (${assis.length}) : sur le siège, à ±1,5 près (${ko.map((x) => `${x.nom} ${x.siege} ${x.assise}`).join(', ') || 'tous'})`);
    check(assis.every((x) => x.clip === 'SitDown' && (x.croissant || x.tasse) && x.sacLieu === 'sol' && x.sacY < 16), `assis : le croissant ou la tasse à la main, le sac posé par terre (${assis.map((x) => `${x.croissant ? 'c' : 't'}${x.sacY}`).join(' ')})`);
    check(assis.filter((x) => x.siege === 'bar').every((x) => x.tasse), 'au bar, une tasse');
    // le décor : ≤ 80 appels de dessin en haute
    const a = await ev(() => window.__fournil.SCENE.appelsParGroupe); let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v;
    const st = await ev(() => window.__fournil.SCENE.stats);
    check(decor <= 80, `le décor : ${decor} appels de dessin (≤ 80) ; en tout ${st.calls} appels, ${Math.round(st.triangles / 1000)} k triangles, ${c.glb} clients`);
  }
  // la bouchée : la main (et ce qu'elle tient) monte à la bouche de temps en temps
  {
    const suivi = await ev(() => window.__pas(90, false, (c) => c.liste.filter((x) => x.etat === 'assis' && !x.leve && x.objetY != null && x.tete).map((x) => [x.id, x.objetY, x.tete.y])));
    const par = new Map(); for (const im of suivi) for (const [id, y, t] of im) { const p = par.get(id) || { min: 1e9, max: -1e9, t }; p.min = Math.min(p.min, y); p.max = Math.max(p.max, y); par.set(id, p); }
    const bouchees = [...par.values()].filter((p) => p.max - p.min > 8 && p.max > p.t - 22);
    check(bouchees.length >= Math.min(4, par.size - 2), `assis, la main monte à la bouche (${bouchees.length} clients sur ${par.size} en 3 s : le croissant ou la tasse s'élève de ${[...par.values()].map((p) => Math.round(p.max - p.min)).join(', ')})`);
  }
  // debout dans la file : les pieds au sol
  {
    const id = await nouveau(ev); await ev((id) => { VIE.clients.find((x) => x.id === id).wait = 30; }, id); await ev(() => window.__pas(150, false));
    const x = await un(ev, id), b = await corps(ev, id);
    check(x && x.etat === 'attend' && x.clip === 'Idle' && b && Math.abs(b.bas) < 0.6, `dans la file : debout (${x && x.etat}, ${x && x.clip}), les semelles au sol (le bas du corps à y = ${b && b.bas})`);
    await ev((id) => { const c = VIE.clients.find((x) => x.id === id); if (c) c.wait = 0.05; }, id);
  }

  console.log('── un client, de la porte à la sortie : le salut, la joie, le sac ──');
  {
    await ev(() => { window.__fournil.scene({ heure: 13, saison: [], zone: 'aucune' }); for (const c of VIE.clients) if (c.etat === 'attend') c.wait = 0.05; }); await ev(() => window.__pas(60, false));
    const id = await nouveau(ev); await ev((id) => { const c = VIE.clients.find((x) => x.id === id); c.wait = 1.5; }, id);
    const s = await ev((id) => window.__pas(330, false, (c3) => { const x = c3.liste.find((y) => y.id === id); const c = VIE.clients.find((y) => y.id === id); return x ? [x.etat, x.clip, x.salut, x.joie, x.sacLieu, x.sacY, c ? c.wp : -1, c ? c.chemin.length : 0, x.geste, c ? c.alpha : 0, c ? !!c.glisse : false] : null; }), id);
    const entree = s.filter((x) => x && x[0] === 'entre'), attente = s.filter((x) => x && x[0] === 'attend' && !x[10]), sortie = s.filter((x) => x && x[0] === 'sort');
    check(entree.length > 0 && entree.some((x) => x[1] === 'Walk') && Math.max(...entree.map((x) => x[2])) > 0.6, `il entre en marchant et salue de la main en passant la porte (Wave : ${Math.max(...entree.map((x) => x[2])).toFixed(2)})`);
    check(attente.length > 20 && attente.slice(10).every((x) => x[1] === 'Idle'), 'il attend son tour, debout (Idle)');
    const i0 = s.findIndex((x) => x && x[0] === 'sort');
    check(i0 > 0 && s.slice(i0, i0 + 8).some((x) => x && x[3]), 'servi : la joie (les bras levés de Victory), en quittant la file');
    const enMain = sortie.filter((x) => x[9] > 0.99);
    const ys = enMain.map((x) => x[5]).sort((a, b) => a - b), med = ys[Math.floor(ys.length / 2)];
    const kH = (await ev(() => CLIENTS3D.HAUT)) / 74; // (les hauteurs suivent la taille des clients : mesurées à 74, rapetissés à 62 le 23 oct.)
    check(enMain.length > 10 && enMain.every((x) => x[4] === 'main' && x[5] > 16.5 * kH) && med > 20 * kH, `il repart le sac à la main droite (le haut de l'anse à y ${Math.round(ys[0])} à ${Math.round(ys[ys.length - 1])}, ${Math.round(med)} en médiane ; posé par terre, sous 16)`);
    check(sortie.filter((x) => x[6] >= x[7] - 2).some((x) => x[2] > 0.5), 'et salue de la main en passant la porte');
    check(s[s.length - 1] === null, 'puis il sort (il n\'est plus dans la boutique)');
  }

  console.log('── s\'asseoir, manger, se lever en ramassant son sac ──');
  {
    await ev(() => window.__fournil.scene({ heure: 13, saison: [], zone: 'table', assis: true }));
    const id = await nouveau(ev); await ev((id) => { const c = VIE.clients.find((x) => x.id === id); c.wait = 0.3; }, id);
    const s = await ev((id) => window.__pas(330, false, (c3) => { const x = c3.liste.find((y) => y.id === id), c = VIE.clients.find((y) => y.id === id); if (c && c.etat === 'assis') c.mange = Math.max(c.mange, 60); return x ? [x.etat, x.clip, x.croissant || x.tasse, x.sacLieu, x.sacY, x.assise, x.leve] : null; }), id); // (assis, il y reste : le test le fera se lever)
    const va = s.filter((x) => x && x[0] === 'vaTable'), assis = s.filter((x) => x && x[0] === 'assis' && !x[6]);
    check(va.length > 5 && va.every((x) => x[1] === 'Walk' && x[2] && x[3] === 'mainG'), `il va s'asseoir, son croissant ou sa tasse à la main, son sac dans l'autre (${va.length} images)`);
    check(assis.length > 30 && assis.slice(-10).every((x) => x[1] === 'SitDown' && x[2] && x[3] === 'sol' && x[4] < 16) && Math.abs(assis[assis.length - 1][5] - 16) < 1.5, `assis (SitDown) sur la chaise : le pantalon à y = ${assis.length ? assis[assis.length - 1][5] : '?'} (siège à 16), le sac posé par terre`);
    // repu : il se lève (VIE lui laisse 0,9 s), en ramassant son sac (PickUp), et repart avec
    await ev((id) => { const c = VIE.clients.find((x) => x.id === id); if (c) c.mange = 0; }, id);
    const l = await ev((id) => window.__pas(150, false, (c3) => { const x = c3.liste.find((y) => y.id === id), c = VIE.clients.find((y) => y.id === id); return x ? [x.etat, x.clip, x.sacLieu, x.sacY, x.leve, c ? c.alpha : 0] : null; }), id);
    const kL = (await ev(() => CLIENTS3D.HAUT)) / 74; // (la taille des clients)
    const leve = l.filter((x) => x && x[4]), apres = l.filter((x) => x && x[0] === 'sort' && x[5] > 0.99), iMain = leve.findIndex((x) => x[2] === 'main');
    check(leve.length > 10 && leve.every((x) => x[1] === 'PickUp'), `repu, il se lève en ramassant son sac (PickUp, ${leve.length} images)`);
    check(leve[0] && leve[0][2] === 'sol' && iMain > 0 && leve.slice(iMain).every((x) => x[2] === 'main') && apres.length > 5 && apres.every((x) => x[2] === 'main' && x[3] > 16.5 * kL), `le sac quitte le sol pour sa main (à la ${iMain + 1}e image du lever), et il repart avec`);
  }

  console.log('── le client mystère : touché, puis oublié ──');
  {
    await ev(() => window.__fournil.scene({ heure: 13, saison: [], zone: 'aucune' }));
    check(await ev(() => VIE.mystere()), 'un client mystère arrive');
    await ev(() => window.__pas(150, false));
    let m = await ev(() => window.__fournil.SCENE.clients3d.liste.find((x) => x.or) || null);
    check(m && m.nom === 'OldClassy_Male' && m.etat === 'attend' && m.halo && m.mailles === 1, `son personnage (${m && m.nom}), tout en or, attend dans son halo`);
    await ev(() => window.__pas(130, false)); m = await ev(() => window.__fournil.SCENE.clients3d.liste.find((x) => x.or) || null);
    check(m && m.attente > 6, `plus de 6 s sans être touché : il s'impatiente (${m && m.attente} s)`);
    // touché sur sa boîte 3D, hors du rectangle du plan (VIE.hit : ±24 × taille) : la scène le prend quand même
    const t = await ev(() => { const c = VIE.mystereEnAttente(), K = VIE.K; if (!c) return null; const x = c.x + 25 * K * c.taille, y = c.y - 30 * K; return { plan: VIE.hit(x, y), scene: window.__fournil.SCENE.hit(x, y), pris: c.pris }; });
    check(t && !t.plan && t.scene && t.pris, 'touché sur sa silhouette 3D (hors du rectangle du plan) : la scène le prend');
    const s = await ev(() => window.__pas(60, false, (c3) => { const x = c3.liste.find((y) => y.or); return x ? [x.etat, x.geste, x.sac, x.halo] : null; }));
    check(s.some((x) => x && x[1] === 'oui') && s.filter((x) => x && x[0] === 'sort').every((x) => x[2] && !x[3]), 'il dit oui de la tête et repart avec son sac, sans son halo');
    await ev(() => window.__pas(240, false));
    check(await ev(() => VIE.mystere()), 'un autre client mystère');
    const o = await ev(() => window.__pas(400, false, (c3) => { const x = c3.liste.find((y) => y.or); return x ? [x.etat, x.geste, x.sac] : null; }));
    check(o.some((x) => x && x[1] === 'non') && o.filter((x) => x && x[0] === 'sort').length > 5 && o.filter((x) => x && x[0] === 'sort').every((x) => !x[2]), 'oublié (8 s), il secoue la tête et repart les mains vides');
  }

  console.log('── l\'habitué : son personnage, son prénom à la hauteur de sa tête ──');
  {
    await ev(() => { window.__fournil.scene({ heure: 13, saison: [], zone: 'aucune' }); for (const c of VIE.clients) if (c.siege && c.siege.zone === 'banquette') c.mange = 0; });
    await ev(() => window.__pas(90, false)); // (le coin salon se libère)
    check(await ev(() => { window.__fournil.habitue('dupuis'); return VIE.clients.some((c) => c.hab === 'dupuis'); }), 'Mme Dupuis arrive');
    await ev(() => window.__pas(100, true));
    const id = await ev(() => VIE.clients.find((c) => c.hab === 'dupuis').id);
    let h = await un(ev, id), b = await corps(ev, id);
    check(h && h.nom === 'Doctor_Female_Old' && h.lunettes && h.hab === 'dupuis', `son personnage (${h && h.nom}), ses lunettes`);
    check(h && b && h.etat === 'attend' && Math.abs(b.tete - b.haut) < 2.5, `debout : le prénom se pose sur le haut de sa tête (le calque à y monde ${b && b.tete}, le haut de ses cheveux ${b && b.haut})`);
    // servie la première (les autres de la file attendent un peu), elle s'installe au coin salon, et y reste
    await ev((id) => { for (const c of VIE.clients) if (c.etat === 'attend' || c.etat === 'entre') c.wait = c.id === id ? 0.1 : Math.max(c.wait, 8); window.__fournil.scene({ heure: 13, saison: [], zone: 'banquette', assis: true }); }, id);
    const s = await ev((id) => window.__pas(300, false, (c3) => { const x = c3.liste.find((y) => y.id === id), c = VIE.clients.find((y) => y.id === id); if (c && c.etat === 'assis') c.mange = Math.max(c.mange, 60); return x ? [x.etat, x.geste] : null; }), id);
    check(s.some((x) => x && x[0] !== 'attend' && x[1] === 'oui'), 'servie, elle dit oui de la tête');
    await ev(() => { window.__fournil.scene({ heure: 13, saison: [], zone: 'aucune' }); window.__pas(200, true); }); h = await un(ev, id); b = await corps(ev, id);
    const ecr = await ev((id) => ({ pieds: VIE.clients.find((x) => x.id === id).y }), id); // (le point du plan où il est : ses pieds à l'écran)
    check(h && h.etat === 'assis' && h.siege === 'banquette' && Math.abs(b.tete - b.haut) < 2.5 && h.tete.ecran > ecr.pieds - 60 && h.tete.ecran < ecr.pieds - 15, `assise au coin salon (${h && h.etat} ${h && h.siege}) : le prénom suit sa tête, plus bas (le haut de la tête à ${h && Math.round(h.tete.ecran)} px, sa place à ${Math.round(ecr.pieds)} px)`);
  }

  console.log('── l\'hiver et le bord de mer : les bonnets, la marinière ──');
  {
    await ev(() => { window.__fournil.scene({ heure: 13, saison: ['neige'], zone: 'aucune' }); for (const c of VIE.clients) { c.wait = 0.05; c.mange = 0; } }); await ev(() => window.__pas(240, false));
    const ids = []; for (let k = 0; k < 6; k++) { const id = await nouveau(ev); if (id != null) ids.push(id); await ev((id) => { const c = VIE.clients.find((x) => x.id === id); c.coiffure = 3; c.lunettes = id % 2 === 0; c.wait = 20; if (id % 3 === 0) { c.haut = '#FFFFFF'; c.mariniere = true; } }, id); }
    await ev(() => window.__pas(40, true));
    const l = (await ev(() => window.__fournil.SCENE.clients3d.liste)).filter((x) => ids.includes(x.id));
    check(l.length === ids.length && l.every((x) => x.bonnet && !['OldClassy_Male', 'Worker_Female', 'Casual2_Male'].includes(x.nom)), `l'hiver, les clients en bonnet le portent (${l.map((x) => x.nom).join(', ')} : aucun chapeau ni crête dessous)`);
    check(l.every((x) => x.lunettes === (x.id % 2 === 0)), 'les lunettes de ceux qui en ont');
    check(l.filter((x) => x.id % 3 === 0).every((x) => x.raye) && l.filter((x) => x.id % 3 !== 0).every((x) => !x.raye), 'la marinière : le haut blanc rayé de bleu');
    await ev(() => { window.__fournil.scene({ heure: 13, saison: [], zone: 'aucune' }); for (const c of VIE.clients) c.wait = 0.05; }); await ev(() => window.__pas(300, false));
  }

  console.log('── le budget : le temps processeur d\'une image (×4 : un téléphone quatre fois plus lent) ──');
  {
    await ev(() => { window.__fournil.scene({ heure: 13, saison: [] }); const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'table', 'table', 'bar', 'banquette', 'terrasse']) S.installer(z, 600); });
    for (let k = 0; k < 4; k++) { const id = await nouveau(ev); await ev((id) => { const c = VIE.clients.find((x) => x.id === id); if (c) c.wait = 60; }, id); }
    await ev(() => window.__pas(30, true));
    // le temps PROCESSEUR du fil principal de la page (/proc/<pid>/task/<pid>/schedstat, comme outils/clients3d/boutique.cjs) : SwiftShader
    // dessine sur les autres cœurs et la machine est partagée, une montre (performance.now) mesurerait surtout l'attente. Des lots de 15
    // images dessinées (la file du processeur graphique vidée avant chacune), les clients 3D puis les mêmes en chibis — CLIENTS3D.permis
    // refusé un instant : le décor HD reste —, en alternance, quatre fois ; la médiane des lots de chacun. ×4 : quatre fois ce temps
    const cmd = (p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); } catch (e) { return ''; } };
    const cpuNs = (p) => { try { return +fs.readFileSync(`/proc/${p}/task/${p}/schedstat`, 'utf8').split(' ')[0]; } catch (e) { return 0; } };
    let rp = 0; try { const b = await browser.newBrowserCDPSession(), pi = await b.send('SystemInfo.getProcessInfo'); rp = pi.processInfo.filter((x) => x.type === 'renderer').map((x) => x.id).filter((p) => cmd(p).includes('--type=renderer')).sort((a, b2) => cpuNs(b2) - cpuNs(a))[0] || 0; } catch (e) { rp = 0; }
    if (!rp || !cpuNs(rp)) console.log('        (pas de /proc ici : la mesure du temps processeur est sautée)');
    else {
      const lot = async () => { const c0 = cpuNs(rp); await ev(() => { const F = window.__fournil, S = F.SCENE, gl = document.querySelector('#scene').getContext('webgl2'); for (let i = 0; i < 15; i++) { gl.finish(); S.frame(1 / 30, F.st, Date.now(), 33, false); } }); return (cpuNs(rp) - c0) / 1e6 / 15; };
      const chibis = (on) => ev((on) => { if (on) { CLIENTS3D.__permis = CLIENTS3D.permis; CLIENTS3D.permis = () => false; } else if (CLIENTS3D.__permis) { CLIENTS3D.permis = CLIENTS3D.__permis; delete CLIENTS3D.__permis; } window.__pas(3, true); return window.__fournil.SCENE.clients3d; }, on);
      const m = { c3: [], ch: [] }; let vus = null;
      for (let k = 0; k < 4; k++) for (const mode of ['c3', 'ch']) { const c = await chibis(mode === 'ch'); if (mode === 'c3' && !vus) vus = c; await lot(); m[mode].push(await lot()); } // (un lot de chauffe après chaque bascule)
      await chibis(false);
      const med = (l) => { const v = l.slice().sort((a, b) => a - b); return (v[1] + v[2]) / 2; }, r = { c3: med(m.c3), ch: med(m.ch) };
      console.log(`        temps processeur d'une image : ${vus.glb} clients 3D ${r.c3.toFixed(2)} ms (×4 : ${(4 * r.c3).toFixed(1)} ms) ; les mêmes en chibis ${r.ch.toFixed(2)} ms (×4 : ${(4 * r.ch).toFixed(1)} ms) ; lots ${m.c3.map((x) => x.toFixed(2)).join(', ')} / ${m.ch.map((x) => x.toFixed(2)).join(', ')}`);
      check(vus.glb >= 10 && 4 * r.c3 < 33 && r.c3 <= r.ch * 1.5 + 0.5, `${vus.glb} clients 3D : ${(4 * r.c3).toFixed(1)} ms par image le processeur ×4 (< 33 ms : 30 images par seconde), pas plus de 50 % au-dessus des mêmes en chibis (${(4 * r.ch).toFixed(1)} ms)`);
    }
  }

  console.log('── la HD coupée dans les Réglages : les chibis, la mémoire rendue, puis le retour ──');
  {
    const m0 = await memoire(ev);
    await ev(() => HDM.couper('joueur')); await ev(() => window.__pas(2, true));
    let c = await ev(() => window.__fournil.SCENE.clients3d);
    check(c.glb === 0 && c.chibis > 0 && !c.permis, `coupée : tous les clients redeviennent des chibis à l'image suivante (${c.chibis})`);
    await ev(() => window.__pas(30 * 11, false)); await ev(() => window.__pas(2, true));
    c = await ev(() => window.__fournil.SCENE.clients3d); const m1 = await memoire(ev);
    check(c.etat.liberes === 1 && c.etat.acteurs === 0 && m0.acteurs >= 24, `après 10 s : la réserve rend sa mémoire (${m0.acteurs} → ${c.etat.acteurs} acteurs ; le rendu : ${m0.g} → ${m1.g} géométries, ${m0.t} → ${m1.t} textures, décor HD et clients 3D compris)`);
    await ev(() => HDM.remettre()); const n = await ev(() => window.__pas(3, true, (c3) => c3.etat.acteurs));
    c = await ev(() => window.__fournil.SCENE.clients3d);
    check(c.glb > 0 && c.chibis === 0, `remise : les clients 3D reviennent (${c.glb})`);
    const r = await ev(() => window.__pas(60, false, (c3) => c3.etat.acteurs)), pas = r.slice(1).map((x, i) => x - r[i]);
    check(Math.max(...pas) <= 1 && r[r.length - 1] >= 24, `la réserve se refait à petits pas, un acteur par image au plus (${n[0]} → ${r[r.length - 1]})`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  console.log('── la visite de la boutique d\'un copain (Supabase simulé) : les clients 3D y passent ──');
  {
    await ev(() => window.__rafManuel(false)); await sleep(500);
    const ph = await ev(() => { const F = window.__fournil, p = CLASSEMENT.photo(F.st, { G: F.G }); p.q = 1; p.nom = 'Chez Mamie Jo'; return p; });
    await page.route(SUPA + '/rest/v1/rpc/fournil_boutique', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, erreur: null, pseudo: 'Mamie Jo', photo: ph, maj: new Date(vrai()).toISOString(), en_ligne: true }) }));
    const avant = await ev(() => VIE.Q.id);
    await ev(() => window.__fournil.visiter('Mamie Jo'));
    check(await attendre(() => ev(() => { const v = window.__fournil.visite(); return v && v.scene && VIE.Q.id === 'paris'; }), 30000), `la visite : la vraie scène montre sa boutique (${avant} → paris)`);
    for (let k = 0; k < 3; k++) await nouveau(ev);
    check(await attendre(() => ev(() => { const c = window.__fournil.SCENE.clients3d; return c.glb >= 3 && c.chibis === 0; }), 30000), 'ses clients sont des personnages 3D');
    await ev(() => window.__fournil.finVisite()); await sleep(800);
    check(await attendre(() => ev(() => !window.__fournil.visite() && VIE.Q.id === 'village' && window.__fournil.SCENE.clients3d.chibis === 0), 20000), 'le retour chez soi : sa boutique, ses clients 3D');
  }

  console.log('── trois allers-retours boutique ↔ Maison hantée (en HD) : la mémoire ne monte pas ──');
  {
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12; [[60, 1], [40, 1], [25, 1]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5, 6]; F.save(); });
    check(await ev(() => window.__fournil.SCENE.precharger('hantee')) === true && await attendre(() => ev(() => HDM.pret('hantee3')), 90000), 'le lot de la boutique hantée est préchargé');
    await ev(() => { for (const c of VIE.clients) { c.mange = 0; c.wait = 0.05; } }); await attendre(() => ev(() => VIE.clients.length <= 6), 40000); // (la boutique se vide un peu : la réserve suffit)
    const mems = [];
    for (let k = 1; k <= 3; k++) {
      await ev(() => window.__fournil.hantee());
      const ok = await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.hd && e.clients > 0; }), 40000); await sleep(1500);
      const vus = await ev(() => { let c3 = 0, m = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && o.userData.c3d && o.visible && o.parent) c3++; if (o.userData && o.userData.hd3) m++; }); return { c3, m }; });
      if (k === 1) check(ok && vus.c3 === 0 && vus.m > 0, `la Maison hantée en HD : ses monstres (${vus.m}), aucun client 3D dans la scène`);
      await ev(() => window.__fournil.fermerHantee());
      await attendre(() => ev(() => !window.__fournil.SCENE.evenement && VIE.Q.id !== 'hantee'), 20000);
      for (let j = 0; j < 3; j++) await nouveau(ev);
      await attendre(() => ev(() => window.__fournil.SCENE.clients3d.glb >= 3), 20000); await sleep(1200);
      const m = await memoire(ev); mems.push(m); console.log(`        aller-retour ${k} : au retour ${m.g} géométries, ${m.t} textures, ${m.acteurs} acteurs (${await ev(() => window.__fournil.SCENE.clients3d.glb)} clients 3D)`);
    }
    check(mems[2].g <= mems[0].g + 6 && mems[2].t <= mems[0].t && mems[2].acteurs === mems[0].acteurs, `trois allers-retours : la mémoire est stable (géométries ${mems.map((m) => m.g).join(' → ')}, textures ${mems.map((m) => m.t).join(' → ')}, acteurs ${mems.map((m) => m.acteurs).join(' → ')})`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  check(avertissements.length === 0, `aucun avertissement des clients 3D, de la HD ni de three.js (${avertissements.slice(0, 2).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ la boutique hantée procédurale ═══════════════════════════════
  console.log('── la boutique hantée sans son lot HD : les clients restent des chibis déguisés ──');
  bloques = [/\/hd\/hantee3\//];
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute'));
  {
    for (let k = 0; k < 3; k++) await nouveau(ev);
    check(await attendre(async () => (await pret3d(ev)) && (await ev(() => window.__fournil.SCENE.clients3d.glb > 0)), 90000), 'dans la boutique, les clients 3D sont là');
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12; F.save(); });
    await ev(() => window.__fournil.hantee());
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && !e.hd && e.clients >= 2; }), 40000), 'la Maison hantée ouvre sa boutique procédurale (son lot HD refusé)');
    for (let k = 0; k < 3; k++) await nouveau(ev); await sleep(2500);
    const e = await ev(() => ({ ev: window.__fournil.SCENE.evenement, c3: window.__fournil.SCENE.clients3d }));
    check(e.c3.glb === 0 && e.c3.chibis === e.ev.clients && e.ev.deguises >= e.ev.clients - 1, `ses clients : ${e.ev.clients} chibis, ${e.ev.deguises} déguisés, aucun client 3D`);
    await ev(() => window.__fournil.fermerHantee());
    check(await attendre(() => ev(() => !window.__fournil.SCENE.evenement && window.__fournil.SCENE.clients3d.glb > 0 && window.__fournil.SCENE.clients3d.chibis === 0), 30000), 'au retour, les clients 3D reprennent la boutique');
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close(); bloques = [];

  // ═══════════════════════════════ les replis ═══════════════════════════════
  console.log('── en qualité moyenne, un personnage manquant : omis, les cinq autres ──');
  bloques = [/\/hd\/clients\/Suit_Male\.glb$/];
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=moyenne'));
  for (let k = 0; k < 3; k++) await nouveau(ev);
  check(await attendre(async () => (await pret3d(ev)) && (await ev(() => window.__fournil.SCENE.clients3d.glb > 0)), 90000), 'en qualité moyenne aussi, les clients sont des personnages 3D (un personnage manquant n\'y change rien)');
  check(await ev(() => { let ok = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.isSkinnedMesh && o.parent && o.parent.userData && o.material && o.material.isMeshStandardMaterial) ok++; }); return ok > 0 && window.__fournil.SCENE.stats.qualite === 'moyenne'; }), 'leur matériau : le jumeau MeshStandard du rendu riche');
  {
    const i = await ev(() => window.__fournil.SCENE.clients3d.info);
    check(i.modeles.length === 5 && !i.modeles.some((m) => m.nom === 'Suit_Male'), `cinq personnages (${i.modeles.map((m) => m.nom).join(', ')})`);
    check(avertissements.some((t) => /client manquant/.test(t)), 'un avertissement le dit (console.warn)');
    check(avertissements.every((t) => /client manquant Suit_Male/.test(t)), `et aucun autre, de three.js non plus (${avertissements.filter((t) => !/client manquant/.test(t)).slice(0, 2).join(' | ') || 'aucun'})`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── l\'hiver, le lot réduit aux personnages à chapeau ou à crête : les clients en bonnet vont tête nue ──');
  bloques = [/\/hd\/clients\/(Casual_Female|Doctor_Female_Old|Suit_Male)\.glb$/]; // (restent Casual2_Male, sa crête ; OldClassy_Male et Worker_Female, leur chapeau)
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute'));
  await ev(() => window.__fournil.scene({ heure: 13, saison: ['neige'] }));
  for (let k = 0; k < 2; k++) await nouveau(ev);
  check(await attendre(async () => (await pret3d(ev)) && (await ev(() => window.__fournil.SCENE.clients3d.glb > 0)), 90000), 'les clients sont des personnages 3D (trois personnages chargés)');
  {
    const i = await ev(() => window.__fournil.SCENE.clients3d.info), noms = i.modeles.map((m) => m.nom);
    check(noms.length === 3 && ['Casual2_Male', 'OldClassy_Male', 'Worker_Female'].every((n) => noms.includes(n)) && await ev((noms) => noms.every((n) => CLIENTS3D.PERSONNAGES[n].chapeau || CLIENTS3D.PERSONNAGES[n].crete), noms), `trois personnages, tous à chapeau ou à crête (${noms.join(', ')})`);
    await ev(() => window.__rafManuel(true)); await sleep(300);
    const ids = []; for (let k = 0; k < 3; k++) { const id = await nouveau(ev); if (id != null) ids.push(id); await ev((id) => { const c = VIE.clients.find((x) => x.id === id); c.coiffure = 3; c.wait = 20; }, id); } // (en bonnet chez les chibis)
    await ev(() => window.__pas(30, true));
    const c = await ev(() => window.__fournil.SCENE.clients3d), l = c.liste.filter((x) => ids.includes(x.id)), s = await ev(() => ({ webgl: window.__fournil.SCENE.webgl, panneau: !document.getElementById('sans-3d').hidden, n: VIE.clients.length, rendus: window.__fournil.SCENE.stats.rendus }));
    check(s.webgl && !s.panneau && s.rendus > 0, `la scène 3D continue (WebGL ${s.webgl ? 'actif' : 'ARRÊTÉ'}, le panneau « sans 3D » ${s.panneau ? 'AFFICHÉ' : 'caché'}, ${s.rendus} images rendues)`);
    check(ids.length === 3 && l.length === 3 && l.every((x) => x.coiffure === 3 && !x.bonnet) && c.glb === s.n && c.chibis === 0, `les ${l.length} clients en bonnet sont des personnages 3D, tête nue (${l.map((x) => `${x.nom}${x.bonnet ? ' EN BONNET' : ''}`).join(', ')}) ; tous les clients en 3D (${c.glb} sur ${s.n})`);
    // par prudence : un client pour qui aucun personnage n'est possible (le lot vidé un instant) n'a pas d'acteur, sans erreur ; src/scene.js
    // lui garde alors son chibi (bâti une fois, pas à chaque image) et la scène continue
    const r = await ev(() => {
      const S = window.__fournil.SCENE, P = CLIENTS3D.PROTOS.splice(0); let nul, err = '';
      try { nul = CLIENTS3D.acteur({ id: 1e6, coiffure: 3, etat: 'entre' }); } catch (e) { err = String((e && e.message) || e); } finally { CLIENTS3D.PROTOS.push(...P); }
      const id = VIE.accueillir(), c = VIE.clients.find((x) => x.id === id); if (!c) return null; c.wait = 20;
      const A = CLIENTS3D.acteur, creer = PERSOS.creer, batis = [];
      CLIENTS3D.acteur = (x) => (x.id === id ? null : A(x)); // (ce client-là seulement)
      PERSOS.creer = function (o) { const g = creer.apply(this, arguments); if (o && !o.toque && o.haut === c.haut && o.peau === c.peau && o.cheveux === c.cheveux) batis.push(g); return g; };
      try { window.__pas(30, true); } finally { CLIENTS3D.acteur = A; PERSOS.creer = creer; }
      window.__pas(5, true);
      const c3 = S.clients3d;
      return { nul, err, batis: batis.length, enScene: batis.length > 0 && !!batis[0].parent, webgl: S.webgl, glb: c3.glb, chibis: c3.chibis, n: VIE.clients.length, en3d: c3.liste.some((x) => x.id === id) };
    });
    check(r && r.nul === null && !r.err, `aucun personnage possible : pas d'acteur, sans erreur (${r && (r.err || String(r.nul))})`);
    check(r && r.batis === 1 && r.enScene && !r.en3d && r.webgl && r.chibis === 1 && r.glb === r.n - 1, `son chibi, bâti une fois en 35 images (${r && r.batis}), reste dans la scène ; les autres en 3D (${r && r.glb} sur ${r && r.n}), la scène continue`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  check(avertissements.every((t) => /client manquant/.test(t)), `aucun autre avertissement que les trois personnages manquants (${avertissements.filter((t) => !/client manquant/.test(t)).slice(0, 2).join(' | ') || 'aucun'})`);
  await ctx.close();

  console.log('── les clips manquants : le lot échoue, les chibis restent ──');
  bloques = [/\/hd\/clients\/anims\.glb$/];
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute'));
  for (let k = 0; k < 3; k++) await nouveau(ev);
  check(await attendre(() => ev(() => HDM.etat.clients && !!HDM.etat.clients.erreur), 60000), `le lot « clients » échoue (${await ev(() => HDM.etat.clients && HDM.etat.clients.erreur)})`);
  await sleep(2500);
  {
    const c = await ev(() => window.__fournil.SCENE.clients3d), n = await ev(() => VIE.clients.length), d = await ev(() => window.__fournil.SCENE.stats);
    check(!c.pret && c.glb === 0 && c.chibis === n && n > 0 && d.calls > 0, `la boutique garde ses chibis (${c.chibis} clients), la scène tourne (${d.calls} appels)`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close(); bloques = [];

  for (const [q, nom] of [['?qualite=haute&clients=0', '?clients=0'], ['?qualite=eco', 'la qualité éco']]) {
    console.log(`── ${nom} : les chibis, aucun fichier des clients demandé ──`);
    ({ ctx, page, erreurs, avertissements, ev } = await ouvrir(q));
    for (let k = 0; k < 4; k++) await nouveau(ev);
    await sleep(6000);
    const c = await ev(() => window.__fournil.SCENE.clients3d), n = await ev(() => VIE.clients.length);
    check(demandes.every((p) => !/\/hd\/clients\//.test(p)) && (!c || (c.glb === 0 && c.chibis === n)) && n > 0, `${n} clients en chibis, aucun fichier des clients demandé (${demandes.length} fichiers HD demandés)`);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (clients 3D).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
