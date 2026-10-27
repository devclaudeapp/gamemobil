// La maquette du boulanger et des apprentis en personnages 3D (src/equipe3d.js, seulement avec ?boulanger3d=1 dans l'adresse) sur la vraie
// page, téléphone en portrait (390 × 844), le mardi 27 octobre 2026. On vérifie :
// · sans le paramètre, rien ne change : le module inactif, aucun fichier de l'équipe demandé, le boulanger et les apprentis en chibis ;
// · avec, en qualité haute : le lot « equipe » demandé après celui des clients, chaque fichier une fois, 600 Ko au plus ; le boulanger et les
//   apprentis en personnages 3D (un maillage chacun, plus le plateau de celui qui porte ; à la taille des clients : 62 × K à 5 % près) ; le
//   boulanger porte la tenue de la garde-robe (sa clé, GAME.tenueBoulanger), une pièce changée se voit à l'image suivante (la forme de
//   chaque pièce), la mémoire ne monte pas ; les grades des apprentis (l'étoile dès le grade 3) ; le cycle des apprentis (pétrir au four,
//   porter le plateau, le poser, revenir), la panne (Defeat, puis la clé à la main et Hammering), la joie du boulanger (un toucher : VIE.tap) ;
//   le décor ≤ 80 appels de dessin, le boulanger et les apprentis comptés ; le temps processeur d'une image (×4, face aux mêmes en chibis) ;
//   les revenus des fournées inchangés (GAME.revenuFournee de la page, avec et sans le paramètre : les mêmes que src/game.js seul, dans Node,
//   sur le même état) ;
// · la vue « Mon boulanger » : ouverte depuis la garde-robe (onglet Boulanger), tournée au doigt, une pièce mise depuis la vue (portée
//   aussitôt, sa joie), fermée (la boutique reprend) ; trois fois : la mémoire de la boutique ne monte pas ;
// · la HD coupée dans les Réglages : les chibis à l'image suivante, la mémoire rendue après 10 s, le retour des personnages 3D ;
// · la Maison hantée : son équipe (les monstres HD ou les chibis déguisés), aucun personnage 3D de l'équipe ;
// · la qualité éco : les chibis, aucun fichier de l'équipe demandé ; un fichier de l'équipe manquant : le lot échoue, les chibis restent.
// Aucune erreur dans la page, aucun avertissement de l'équipe 3D, de la HD ni de three.js.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-equipe3d.cjs   (port : PORT_EQUIPE3D)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_EQUIPE3D || 9910;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-27T13:00:00+01:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = []; let bloques = []; // les fichiers hd/ demandés, dans l'ordre ; ceux qu'on refuse (404), pour le repli
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
const FICHIERS = ['Chef_Male', 'Chef_Female', 'anims-equipe', 'p-chapeau', 'p-lanterne'];
const G0 = require('../src/game.js'); // les règles seules (sans page) : les revenus des fournées, sur le même état

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD en haute
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => {
      const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F;
      // le détecteur de gel du jeu (ui.js, verifierReveil) : le temps piloté suspend la boucle, il croirait à un retour d'absence
      const si = window.setInterval; window.setInterval = function (fn, ms, ...r) { if (fn && fn.name === 'verifierReveil') return 0; return si.call(window, fn, ms, ...r); };
      // le temps piloté (comme test/fournil-clients3d.cjs) : la boucle du jeu suspendue, le test appelle SCENE.frame lui-même ; l'avance rapide sans dessin
      const raf = window.requestAnimationFrame.bind(window); let manuel = false; const file = [];
      window.__rafManuel = (on) => { manuel = on; if (!on) for (const cb of file.splice(0)) raf(cb); };
      window.requestAnimationFrame = (cb) => { if (!manuel) return raf(cb); file.push(cb); return file.length; };
      window.__dessin = (on) => {
        if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
        for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {};
      };
      // n images de 1/30 s ; la dernière dessinée si dessin ; rend ce que suivre(equipe3d) garde de chaque image
      window.__pas = (n, dessin, suivre) => { const F = window.__fournil, S = F.SCENE, out = []; window.__dessin(false); try { for (let i = 0; i < n; i++) { if (dessin && i === n - 1) window.__dessin(true); S.frame(1 / 30, F.st, Date.now(), 33, false); if (suivre) out.push(suivre(S.equipe3d)); } } finally { window.__dessin(true); } return out; };
    }, decal);
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [], avertissements = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(t + (m.location() && m.location().url))) erreurs.push(t); if (m.type() === 'warning' && /Équipe 3D|Clients 3D|HD :|THREE\./.test(t)) avertissements.push(t); });
    demandes.length = 0;
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 60000 }); await sleep(600);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    for (let k = 0; k < 4; k++) { await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a$="tard"], #feuille [data-a="ok"]'); if (b) b.click(); }); await sleep(250); }
    // la boutique au complet : quatre recettes, quatre apprentis (aux grades 1, 3, 4 et 5), tout le mobilier ; midi, sans saison ; ni événement ni mystère au hasard
    await ev(() => {
      const F = window.__fournil, G = F.G, st = F.st; F.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) F.meuble(m.id);
      st.tuto = 99; st.mystereTimer = 1e9; st.evTimer = 1e9; st.apprentis = st.apprentis || {}; [1, 3, 4, 5].forEach((g, i) => { st.apprentis[G.PRODUITS[i].id] = { xp: [0, 129600, 518400, 1555200, 4860000][g - 1] + 10 }; });
      F.scene({ heure: 13, saison: [] }); F.save();
    });
    await ev(() => window.__fournil.tiroir('ferme'));
    return { ctx, page, erreurs, avertissements, ev };
  }
  const equipe = (ev) => ev(() => window.__fournil.SCENE.equipe3d);
  const memoire = (ev) => ev(() => { const s = window.__fournil.SCENE.stats, e = window.__fournil.SCENE.equipe3d; return { g: s.geometries, t: s.textures, acteurs: e ? e.etat.acteurs : 0 }; });
  const revenus = async (ev) => { // ceux de la page, ceux de src/game.js dans Node sur le même état (copié en JSON, comme la sauvegarde)
    const r = await ev(() => { const F = window.__fournil; return { st: JSON.stringify(F.st), page: [0, 1, 2, 3].map((i) => F.G.revenuFournee(F.st, i)) }; }), st = JSON.parse(r.st), node = [0, 1, 2, 3].map((i) => G0.revenuFournee(st, i));
    return { page: r.page, node, egaux: r.page.every((x, i) => Math.abs(x - node[i]) <= 1e-9 * Math.max(1, Math.abs(x))) };
  };
  // la hauteur du corps de chaque personnage 3D de l'équipe (ses sommets posés par les os, sans la toque), rapportée à 62 × K
  const hauteurs = (ev) => ev(() => { const r = []; window.__fournil.SCENE.trois.scene.traverse((g) => { const a = g.userData && g.userData.e3d; if (a && g.visible && g.parent && !a.vue) { const m = EQUIPE3D.mesure(a); r.push({ qui: a.boul ? 'boulanger' : 'a' + a.i, clip: a.joue, h: +((m.haut - m.bas) / (EQUIPE3D.HAUT * VIE.K)).toFixed(3) }); } }); return r; });

  // ═══════════════════════════════ sans le paramètre ═══════════════════════════════
  console.log('── sans ?boulanger3d=1 : rien ne change ──');
  let { ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute');
  check(await attendre(() => ev(() => HDM.pret('boutique') && HDM.pret('clients')), 90000), 'la boutique et les clients ont leur HD');
  await sleep(4000);
  { const r = await revenus(ev); check(r.egaux, `GAME.revenuFournee : les mêmes que src/game.js seul (${r.page.map((x) => +x.toPrecision(5)).join(', ')})`); }
  {
    const s = await ev(() => ({ actif: typeof EQUIPE3D !== 'undefined' && EQUIPE3D.actif, e3: window.__fournil.SCENE.equipe3d, lot: !!HDM.etat.equipe }));
    check(!s.actif && s.e3 === null && !s.lot && demandes.every((p) => !/\/hd\/equipe\//.test(p)), `le module est inactif, SCENE.equipe3d nul, aucun fichier de l'équipe demandé (${demandes.length} fichiers HD demandés)`);
    const c = await ev(() => { let b3 = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && o.userData.e3d) b3++; }); return b3; });
    check(c === 0, 'aucun personnage 3D de l\'équipe dans la scène (le boulanger et les apprentis en chibis)');
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ qualité haute, avec le paramètre ═══════════════════════════════
  console.log('── ?boulanger3d=1, qualité haute : le lot de l\'équipe, après celui des clients ──');
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute&boulanger3d=1'));
  check(await attendre(() => ev(() => typeof EQUIPE3D !== 'undefined' && EQUIPE3D.actif && HDM.pret('boutique')), 60000), 'le module de l\'équipe 3D est là, et la boutique a ses décors HD');
  check(await attendre(() => ev(() => HDM.pret('equipe')), 120000), 'le lot « equipe » arrive ensuite, de lui-même');
  check(await attendre(async () => { const e = await equipe(ev); return e && e.pret && e.compile === 2 && e.boulanger && e.apprentis.length >= 3 && e.apprentis.every((a) => !a.chibi); }, 120000), 'cuits à petits pas, leur programme compilé : le boulanger et les apprentis deviennent des personnages 3D');
  {
    const iC = demandes.reduce((m, p, i) => (/\/hd\/clients\//.test(p) ? i : m), -1), iE = demandes.findIndex((p) => /\/hd\/equipe\//.test(p));
    const eq = demandes.filter((p) => /\/hd\/equipe\//.test(p)), uniques = [...new Set(eq)], poids = uniques.reduce((s, p) => s + fs.statSync(path.join(root, p)).size, 0);
    const pc = [...new Set(demandes.filter((p) => /\/hd\/clients\//.test(p)))].reduce((s, p) => s + fs.statSync(path.join(root, p)).size, 0);
    check(iC >= 0 && iE > iC, `les fichiers de l'équipe sont demandés après ceux des clients (n° ${iE} après le n° ${iC} sur ${demandes.length})`);
    check(uniques.length === FICHIERS.length && eq.length === FICHIERS.length && FICHIERS.every((n) => uniques.some((p) => p.endsWith(`/equipe/${n}.glb`))) && demandes.filter((p) => p.endsWith('/clients/anims.glb')).length === 1, `${FICHIERS.length} fichiers (les deux corps, leurs clips, le chapeau, la lanterne), chacun demandé une fois ; les clips des clients repris, pas redemandés`);
    check(poids <= 600 * 1024, `leur poids : ${Math.round(poids / 1024)} Ko (≤ 600 Ko) ; avec le lot des clients : ${Math.round((poids + pc) / 1024)} Ko`);
    const e = await equipe(ev);
    check(e.info.corps.length === 2 && e.info.corps.every((c) => c.tris > 2500 && c.tris < 5000), `deux corps cuits (${e.info.corps.map((c) => `${c.nom} ${c.tris} triangles`).join(', ')})`);
    console.log(`        la cuisson : ${e.etat.msCuisson} ms, le plus long pas ${e.etat.pasMax} ms (${e.etat.pasLent}) ; ${e.etat.acteurs} acteurs`);
  }

  console.log('── le temps piloté : le boulanger et les apprentis au travail ──');
  await ev(() => window.__rafManuel(true)); await sleep(300);
  await ev(() => window.__pas(30, true));
  {
    const e = await equipe(ev), st = await ev(() => { const F = window.__fournil; return { cle: F.G.tenueBoulanger(F.st).cle, rang: VIE.etat ? 0 : 0 }; });
    check(e.boulanger && e.boulanger.mailles === 1 && !e.chibiBoulanger, `le boulanger : un personnage 3D, un maillage (${e.boulanger && e.boulanger.mailles}), ${e.boulanger && e.boulanger.tris} triangles`);
    check(e.boulanger && e.boulanger.tenue.endsWith('|' + st.cle), `il porte la tenue de la garde-robe (${e.boulanger && e.boulanger.tenue} ; GAME.tenueBoulanger : ${st.cle})`);
    check(e.apprentis.length === 3 && e.apprentis.every((a) => !a.chibi && a.mailles === (a.plateau ? 2 : 1)), `les apprentis : ${e.apprentis.length} personnages 3D, un maillage chacun, plus le plateau de celui qui porte (${e.apprentis.map((a) => `${a.corps} ${a.mailles}`).join(', ')})`);
    const gr = e.apprentis.map((a) => [a.grade, a.etoile]);
    check(e.apprentis.every((a) => a.etoile === (a.grade >= 3)) && new Set(e.apprentis.map((a) => a.grade)).size >= 2, `les grades : l'étoile dès le grade 3 (${gr.map(([g, s]) => `grade ${g} ${s ? 'étoile' : 'sans'}`).join(', ')})`);
    // la taille : celle des clients (62 × K), à 5 % près, debout
    const h = (await hauteurs(ev)).filter((x) => x.clip === 'Idle' || x.clip === 'Walk' || x.clip === 'Walk_Carry');
    check(h.length >= 1 && h.every((x) => Math.abs(x.h - 1) <= 0.05), `à la taille des clients, debout : ${h.map((x) => `${x.qui} ${x.h}`).join(', ')} × 62 K (±5 %)`);
  }
  // le cycle des apprentis : au four (Working_A), porter (Walk_Carry, le plateau), poser (le plateau), revenir (Walk) ; 12 s
  {
    const vus = await ev(() => window.__pas(360, false, (e) => e.apprentis.map((a) => `${a.etat}/${a.clip}${a.plateau ? '+p' : ''}`)));
    const tous = new Set(vus.flat());
    const ok = (s) => tous.has(s);
    check(ok('four/Working_A') && ok('porte/Walk_Carry+p') && ok('depose/Idle+p') && ok('retour/Walk'), `le cycle : ${['four/Working_A', 'porte/Walk_Carry+p', 'depose/Idle+p', 'retour/Walk'].map((s) => `${s} ${ok(s) ? 'vu' : 'ABSENT'}`).join(', ')}`);
    check([...tous].every((s) => !/^(porte|depose)\//.test(s) || s.endsWith('+p')) && [...tous].every((s) => !/^(four|retour)\//.test(s) || !s.endsWith('+p')), 'le plateau entre les mains en portant et en posant, jamais au four ni au retour');
  }
  // la panne : la tête dans les mains (Defeat), puis la clé à la main (Hammering, le haut du corps), jusqu'à la réparation
  {
    const r = await ev(() => { const F = window.__fournil; F.ev('panne'); const e = F.st.ev; if (!e || e.type !== 'panne' || !VIE.apprentis.length) return null; e.i = VIE.apprentis[0].i; for (const a of VIE.apprentis) if (a.i === e.i && a.etat !== 'four') { a.etat = 'four'; a.t = 0.01; } return e.i; }); // (la panne d'un apprenti en vue : les trois des recettes les plus avancées)
    const vus = r == null ? [] : await ev((i) => window.__pas(150, false, (e) => { const a = e.apprentis.find((x) => x.i === i); return a ? `${a.etat}/${a.clip}${a.cle ? '+c' : ''}${a.repare ? '+r' : ''}` : ''; }), r);
    check(r != null && vus.includes('panne/Defeat+c') && vus.some((s) => /^panne\/.*\+c\+r$/.test(s)), `la panne (l'apprenti ${r}) : Defeat, la clé à la main (${vus.includes('panne/Defeat+c') ? 'vu' : 'ABSENT'}), puis il répare (${vus.some((s) => /\+c\+r$/.test(s)) ? 'vu' : 'ABSENT'})`);
    await ev(() => { window.__fournil.st.ev = null; }); const fin = await ev((i) => window.__pas(60, false, (e) => { const a = e.apprentis.find((x) => x.i === i); return a ? `${a.etat}${a.cle ? '+c' : ''}` : ''; }), r);
    check(fin.length && fin[fin.length - 1] && !fin[fin.length - 1].includes('panne') && !fin[fin.length - 1].includes('+c'), `réparé : il reprend son travail, la clé rangée (${fin[fin.length - 1]})`);
  }
  // la joie du boulanger : un toucher (VIE.tap, comme une vente) ; 30 images par seconde (le saut du hop retombe vite)
  {
    await ev(() => window.__pas(160, false)); // (l'attente entre deux joies passée)
    await ev(() => VIE.tap()); const j = await ev(() => window.__pas(20, false, (e) => !!(e.boulanger && e.boulanger.joie)));
    check(j.some(Boolean), `un toucher : le boulanger se réjouit (Cheering, le haut du corps), à 30 images par seconde (${j.filter(Boolean).length} images sur 20)`);
  }
  // le budget : le décor ≤ 80 appels de dessin, le boulanger et les apprentis comptés
  {
    await ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'banquette']) S.installer(z, 600); });
    await ev(() => window.__pas(20, true));
    const a = await ev(() => window.__fournil.SCENE.appelsParGroupe), e = await equipe(ev), st = await ev(() => window.__fournil.SCENE.stats);
    let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v;
    const app = e.apprentis.reduce((s, x) => s + (x.mailles || 0), 0);
    check(decor + app <= 80, `le décor : ${decor} appels de dessin, dont le boulanger ${a.boulanger || 0} ; avec les apprentis (${app}) : ${decor + app} (≤ 80) ; en tout ${st.calls} appels, ${Math.round(st.triangles / 1000)} k triangles`);
  }
  // une pièce changée se voit à l'image suivante (la garde-robe, GAME.equiper) ; trois tenues, puis la première : la mémoire ne bouge pas
  {
    const m0 = await memoire(ev), formes = [];
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; for (const c of ['or', 'quartier', 'hantee']) G.donnerCollection(st, c); G.donnerAura(st, 'lueur'); });
    const TENUES = [['or-toque', 'or-tablier', 'or-chaussures', 'or-foulard', null], ['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'quartier-chaine', null], ['hantee-chapeau', 'hantee-cape', 'hantee-bottes', 'hantee-lanterne', 'lueur'], ['toque-blanche', 'tablier-blanc', 'sabots', null, null]];
    for (const t of TENUES) {
      await ev((t) => { const F = window.__fournil, G = F.G, st = F.st; ['tete', 'haut', 'pieds', 'accessoire'].forEach((p, i) => G.equiper(st, p, t[i])); G.porterAura(st, t[4]); }, t);
      const r = await ev(() => { window.__pas(1, true); const F = window.__fournil, e = window.__fournil.SCENE.equipe3d; return { cle: F.G.tenueBoulanger(F.st).cle, b: e.boulanger }; });
      formes.push(r.b && r.b.tenue.endsWith('|' + r.cle) ? `${r.b.formes.tete}/${r.b.formes.haut}/${r.b.formes.pieds}/${r.b.formes.acc || (r.b.formes.lunettes ? 'lunettes' : '-')}${r.b.aura ? '+aura' : ''} (${r.b.mailles})` : `PAS PORTÉE ${r.b && r.b.tenue} ≠ ${r.cle}`);
    }
    check(formes.length === 4 && !formes.some((f) => f.startsWith('PAS')) && formes[0].startsWith('toque/tablier/chaussures') && formes[1].startsWith('casquette/sweat/baskets/chaine') && formes[2].startsWith('chapeau/cape/bottes/lanterne+aura (2)') && formes[3].startsWith('toque/tablier/chaussures/-'), `chaque tenue portée à l'image suivante, pièce par pièce : ${formes.join(' · ')}`);
    await ev(() => window.__pas(10, true)); const m1 = await memoire(ev);
    check(m1.g <= m0.g + 2 && m1.t <= m0.t + 1 && m1.acteurs === m0.acteurs, `la mémoire ne bouge pas (géométries ${m0.g} → ${m1.g}, textures ${m0.t} → ${m1.t}, acteurs ${m0.acteurs} → ${m1.acteurs})`);
  }
  // les revenus des fournées : la maquette ne montre que l'apparence (les mêmes que src/game.js seul, sur le même état)
  {
    const r = await revenus(ev);
    check(r.egaux, `GAME.revenuFournee inchangé : les mêmes que src/game.js seul (${r.page.map((x) => +x.toPrecision(5)).join(', ')})`);
  }

  console.log('── le temps processeur d\'une image (×4 : un téléphone quatre fois plus lent) ──');
  {
    // le temps PROCESSEUR du fil principal de la page (/proc/<pid>/task/<pid>/schedstat, comme test/fournil-clients3d.cjs) : des lots de 15
    // images dessinées, l'équipe en 3D puis les mêmes en chibis (EQUIPE3D.permis refusé un instant), en alternance, quatre fois ; la médiane
    const cmd = (p) => { try { return fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); } catch (e) { return ''; } };
    const cpuNs = (p) => { try { return +fs.readFileSync(`/proc/${p}/task/${p}/schedstat`, 'utf8').split(' ')[0]; } catch (e) { return 0; } };
    let rp = 0; try { const b = await browser.newBrowserCDPSession(), pi = await b.send('SystemInfo.getProcessInfo'); rp = pi.processInfo.filter((x) => x.type === 'renderer').map((x) => x.id).filter((p) => cmd(p).includes('--type=renderer')).sort((a, b2) => cpuNs(b2) - cpuNs(a))[0] || 0; } catch (e) { rp = 0; }
    if (!rp || !cpuNs(rp)) console.log('        (pas de /proc ici : la mesure du temps processeur est sautée)');
    else {
      const lot = async () => { const c0 = cpuNs(rp); await ev(() => { const F = window.__fournil, S = F.SCENE, gl = document.querySelector('#scene').getContext('webgl2'); for (let i = 0; i < 15; i++) { gl.finish(); S.frame(1 / 30, F.st, Date.now(), 33, false); } }); return (cpuNs(rp) - c0) / 1e6 / 15; };
      const chibis = (on) => ev((on) => { if (on) { EQUIPE3D.__permis = EQUIPE3D.permis; EQUIPE3D.permis = () => false; } else if (EQUIPE3D.__permis) { EQUIPE3D.permis = EQUIPE3D.__permis; delete EQUIPE3D.__permis; } window.__pas(3, true); return window.__fournil.SCENE.equipe3d; }, on);
      const m = { e3: [], ch: [] }; let vus = null;
      for (let k = 0; k < 4; k++) for (const mode of ['e3', 'ch']) { const e = await chibis(mode === 'ch'); if (mode === 'e3' && !vus) vus = e; await lot(); m[mode].push(await lot()); }
      await chibis(false); await ev(() => window.__pas(3, true));
      const med = (l) => { const v = l.slice().sort((a, b) => a - b); return (v[1] + v[2]) / 2; }, r = { e3: med(m.e3), ch: med(m.ch) };
      console.log(`        temps processeur d'une image : l'équipe en 3D ${r.e3.toFixed(2)} ms (×4 : ${(4 * r.e3).toFixed(1)} ms) ; en chibis ${r.ch.toFixed(2)} ms (×4 : ${(4 * r.ch).toFixed(1)} ms) ; lots ${m.e3.map((x) => x.toFixed(2)).join(', ')} / ${m.ch.map((x) => x.toFixed(2)).join(', ')}`);
      check(vus && vus.boulanger && 4 * r.e3 < 33 && r.e3 <= r.ch * 1.3 + 0.5, `le boulanger et ${vus && vus.apprentis.length} apprentis en 3D : ${(4 * r.e3).toFixed(1)} ms par image le processeur ×4 (< 33 ms), au plus 30 % au-dessus des mêmes en chibis (${(4 * r.ch).toFixed(1)} ms)`);
    }
  }

  console.log('── la vue « Mon boulanger » : ouverte depuis la garde-robe, tournée au doigt, une pièce mise, fermée (trois fois) ──');
  {
    await ev(() => window.__rafManuel(false)); await sleep(400);
    await ev(() => { const F = window.__fournil, G = F.G, st = F.st; G.donnerCollection(st, 'parcours'); F.rafraichir(); F.page('boulanger'); }); await sleep(600);
    const m0 = await memoire(ev); const mems = [];
    for (let k = 1; k <= 3; k++) {
      const ok = await ev(() => { const b = document.querySelector('[data-gr-3d]'); if (!b) return false; b.scrollIntoView(); b.click(); return true; });
      if (k === 1) check(ok, 'le bouton « Voir mon boulanger en 3D » de la garde-robe');
      check(await attendre(() => ev(() => { const e = EQUIPE3D.vue.etat; return !!e && e.tris > 0 && e.images > 3 && !!document.getElementById('mon-boulanger'); }), 30000), `vue ${k} : ouverte, le boulanger en grand sur son estrade`);
      if (k === 1) {
        const e0 = await ev(() => EQUIPE3D.vue.etat);
        check(e0.appels <= 6 && e0.tris < 9000, `un personnage, son estrade : ${e0.appels} appels de dessin, ${e0.tris} triangles pour le boulanger`);
        // tourné au doigt : un glisser sur la scène fait tourner le boulanger
        const box = await page.locator('#mon-boulanger .mb-scene').boundingBox(), y0 = (await ev(() => EQUIPE3D.vue.etat)).yaw;
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5); await page.mouse.down(); for (let i = 1; i <= 8; i++) { await page.mouse.move(box.x + box.width * (0.3 + i * 0.05), box.y + box.height * 0.5); await sleep(30); } await page.mouse.up();
        const y1 = (await ev(() => EQUIPE3D.vue.etat)).yaw;
        check(Math.abs(y1 - y0) > 0.8, `tourné au doigt : ${y0} → ${y1} rad`);
        // une pièce mise depuis la vue : l'onglet Tête, la toque du parcours ; portée aussitôt, et sa joie
        await ev(() => document.querySelector('#mon-boulanger [data-mb-piece="tete"]').click()); await sleep(150);
        const avant = await ev(() => EQUIPE3D.vue.etat.tenue);
        const mis = await ev(() => { const b = document.querySelector('#mon-boulanger [data-mb-porter="parcours-toque"]'); if (!b) return false; b.click(); return true; });
        const apres = await ev(() => ({ e: EQUIPE3D.vue.etat, cle: window.__fournil.G.tenueBoulanger(window.__fournil.st).cle }));
        check(mis && apres.e.tenue !== avant && apres.e.tenue.endsWith('|' + apres.cle) && apres.cle.startsWith('parcours-toque|') && apres.e.joie, `une pièce mise depuis la vue : portée aussitôt (${avant} → ${apres.e.tenue}), il s'en réjouit`);
        await ev(() => document.querySelector('#mon-boulanger [data-mb-piece="haut"]').click()); await sleep(150);
        const n = await ev(() => document.querySelectorAll('#mon-boulanger .mb-piece').length);
        check(n >= 3, `l'onglet Haut : les pièces qu'on possède (${n})`);
      }
      await ev(() => document.querySelector('#mon-boulanger [data-mb="fermer"]').click()); await sleep(500);
      const f = await ev(() => ({ el: !!document.getElementById('mon-boulanger'), ouvert: EQUIPE3D.vue.ouvert, etat: EQUIPE3D.vue.etat }));
      check(!f.el && !f.ouvert && f.etat === null, `vue ${k} : fermée (la page, son contexte WebGL rendus)`);
      await ev(() => window.__fournil.page('boutique')); await sleep(1500);
      mems.push(await memoire(ev)); await ev(() => window.__fournil.page('boulanger')); await sleep(400);
    }
    check(await ev(() => window.__fournil.SCENE.stats.rendus > 0), 'la boutique reprend derrière');
    check(mems[2].g <= mems[0].g + 2 && mems[2].t <= mems[0].t && mems[2].acteurs === mems[0].acteurs, `trois ouvertures : la mémoire de la boutique est stable (avant ${m0.g} géométries ; géométries ${mems.map((m) => m.g).join(' → ')}, textures ${mems.map((m) => m.t).join(' → ')}, acteurs ${mems.map((m) => m.acteurs).join(' → ')})`);
    await ev(() => window.__fournil.page('boutique')); await sleep(400);
  }

  console.log('── la HD coupée dans les Réglages : les chibis, la mémoire rendue, puis le retour ──');
  {
    await ev(() => window.__rafManuel(true)); await sleep(300);
    const m0 = await memoire(ev);
    await ev(() => HDM.couper('joueur')); await ev(() => window.__pas(2, true));
    let e = await equipe(ev);
    check(e.chibiBoulanger && !e.boulanger && e.apprentis.every((a) => a.chibi), `coupée : le boulanger et les apprentis redeviennent des chibis à l'image suivante (${e.apprentis.length} apprentis)`);
    await ev(() => window.__pas(30 * 11, false)); await ev(() => window.__pas(2, true));
    e = await equipe(ev); const m1 = await memoire(ev);
    check(e.etat.liberes === 1 && e.etat.acteurs === 0 && m0.acteurs > 0, `après 10 s : la réserve rend sa mémoire (${m0.acteurs} → ${e.etat.acteurs} acteurs ; le rendu : ${m0.g} → ${m1.g} géométries, ${m0.t} → ${m1.t} textures)`);
    await ev(() => HDM.remettre());
    check(await attendre(async () => { await ev(() => window.__pas(4, true)); const x = await equipe(ev); return x && x.boulanger && x.apprentis.every((a) => !a.chibi); }, 60000), 'remise : le boulanger et les apprentis 3D reviennent');
  }

  console.log('── la Maison hantée : son équipe à elle, aucun personnage 3D de l\'équipe ──');
  {
    await ev(() => window.__rafManuel(false)); await sleep(300);
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12; [[60, 1], [40, 1], [25, 1]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5, 6]; F.save(); });
    await ev(() => window.__fournil.hantee());
    const ok = await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.patronne && e.apprentis.length > 0; }), 60000); await sleep(1500);
    const vus = await ev(() => { let e3 = 0; window.__fournil.SCENE.trois.scene.traverse((o) => { if (o.userData && o.userData.e3d && o.visible && o.parent) e3++; }); const e = window.__fournil.SCENE.evenement; return { e3, hd: e && e.hd, apprentis: e ? e.apprentis.length : 0 }; });
    check(ok && vus.e3 === 0, `la Maison hantée ${vus.hd ? 'en HD (ses monstres)' : '(ses chibis déguisés)'} : ${vus.apprentis} apprentis à elle, aucun personnage 3D de l'équipe`);
    await ev(() => window.__fournil.fermerHantee());
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.equipe3d; return !window.__fournil.SCENE.evenement && e && e.boulanger && e.apprentis.length > 0 && e.apprentis.every((a) => !a.chibi); }), 60000), 'au retour, le boulanger et les apprentis 3D reprennent la boutique');
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  check(avertissements.length === 0, `aucun avertissement de l'équipe 3D, de la HD ni de three.js (${avertissements.slice(0, 2).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ la qualité éco ═══════════════════════════════
  console.log('── ?boulanger3d=1 en qualité éco : les chibis, aucun fichier de l\'équipe demandé ──');
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=eco&boulanger3d=1'));
  await sleep(6000);
  {
    const e = await equipe(ev);
    check(demandes.every((p) => !/\/hd\/equipe\//.test(p)) && e && !e.boulanger && e.chibiBoulanger && e.apprentis.every((a) => a.chibi), `le boulanger et ${e ? e.apprentis.length : 0} apprentis en chibis, aucun fichier de l'équipe demandé (${demandes.length} fichiers HD demandés)`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // ═══════════════════════════════ un fichier manquant ═══════════════════════════════
  console.log('── ?boulanger3d=1, les clips de l\'équipe manquants : le lot échoue, les chibis restent ──');
  bloques = [/\/hd\/equipe\/anims-equipe\.glb$/];
  ({ ctx, page, erreurs, avertissements, ev } = await ouvrir('?qualite=haute&boulanger3d=1'));
  check(await attendre(() => ev(() => HDM.etat.equipe && !!HDM.etat.equipe.erreur), 120000), `le lot « equipe » échoue (${await ev(() => HDM.etat.equipe && HDM.etat.equipe.erreur)})`);
  await sleep(2500);
  {
    const e = await equipe(ev), d = await ev(() => window.__fournil.SCENE.stats);
    check(e && !e.pret && !e.boulanger && e.chibiBoulanger && e.apprentis.length > 0 && e.apprentis.every((a) => a.chibi) && d.calls > 0, `le boulanger et ${e ? e.apprentis.length : 0} apprentis restent des chibis, la scène tourne (${d.calls} appels)`);
    check(await attendre(() => ev(() => { const c = window.__fournil.SCENE.clients3d; return !!c && c.pret; }), 60000), 'les clients 3D, eux, sont prêts');
    check(avertissements.length > 0 && avertissements.every((t) => /équipe, fichier manquant|modèles non chargés/.test(t)), `un avertissement le dit, et aucun autre (${avertissements.slice(0, 2).join(' | ')})`);
  }
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close(); bloques = [];

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (équipe 3D).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
