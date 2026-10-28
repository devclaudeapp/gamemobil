// Les recettes de boutique et le parcours du boulanger, dans la vraie page (fournil/ servie en local), sur un téléphone en portrait (390 × 844).
// 1. Une vieille sauvegarde déjà à la boutique n°5 (huit postes, ni parcours ni défi) : au lancement, la feuille « Ton parcours » (les quatre
//    recettes gagnées, une fois), les cartes des quatre recettes, la carte verrouillée de la suivante (« Ouvre la boutique n°6… »), les
//    recettes d'après cachées ; la feuille Étoiles annonce le but ; la carte « Objectif » en haut des Défis et la feuille du parcours.
// 2. Le défi de passage : à la boutique n°7, le bouton « Repartir » est verrouillé tant que le défi n'est pas fait, puis s'ouvre.
// 3. Les pâtisseries 3D : dans la vitrine (gros plan) et dans l'atelier 3D (les huit côte à côte).
// 4. La relecture (constats 4, 8, 9, 11, 12 et l'enseigne) : la pastille ★ attend le défi de passage ; la boutique n°30 ouverte par
//    l'interface garde le nom complet de la Capitale, qui tient sur l'enseigne à 390 et à 360 × 640 ; après la n°30, le défi de passage
//    est décrit sur la carte des Défis, la feuille Étoiles, son bouton et le parcours ; la carte à débloquer, l'absence, les compagnons,
//    la ligne Spécialité des Réglages (une information, plus un bouton).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-recettes-boutique.cjs
//   (captures dans test/shots/recettes-boutique/ ; PORT_RECETTES pour changer de port)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const G = require('../src/game.js');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_RECETTES || 8873, BASE = `http://localhost:${PORT}`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'recettes-boutique'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(100); } return false; };

// une sauvegarde d'avant cette version : boutique n°5, huit postes, sans recettesBoutique, parcours, defi ni quartierFixe
function vieilleSauvegarde() {
  const now = Date.now(), st = G.newState(now - 3600e3);
  st.boutiques = 5; st.etoiles = 180; st.xp = 6000; st.lifetime = 4e15; st.lifetimeRun = 2e14; st.coins = 1e13; st.tuto = 99; st.lastSeen = now - 30e3; st.specialite = 3;
  st.stations = st.stations.slice(0, 8).map((s, i) => ({ niv: [380, 170, 160, 155, 150, 140, 120, 110][i], staff: true, prog: 0, actif: true }));
  for (const k of ['recettesBoutique', 'defi', 'parcours', 'quartierFixe']) delete st[k];
  st.nouveautesVues = '2026-10-19-z'; // la pastille des nouveautés ne gêne pas les captures
  return JSON.stringify(st);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  const raw = vieilleSauvegarde();
  await ctx.addInitScript((r) => { window.__sansEvenements = true; try { if (!sessionStorage.getItem('semee')) { localStorage.setItem('fournil.v2', r); sessionStorage.setItem('semee', '1'); } } catch (e) { /* rien */ } }, raw);
  await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await page.goto(`${BASE}/fournil/?qualite=eco`);
  await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });

  // ─── 1. la vieille sauvegarde : le rattrapage, une fois ───
  const recap = await attendre(() => page.evaluate(() => /Ton parcours/.test(document.querySelector('#feuille-contenu') ? document.querySelector('#feuille-contenu').textContent : '')));
  const etat = await page.evaluate(() => { const st = window.__fournil.st, f = document.querySelector('#feuille-contenu'); return { b: st.boutiques, rec: st.recettesBoutique.slice(), recus: st.parcours.recus.slice(), defi: st.defi, q: window.__fournil.G.quartier(st), n: st.stations.length, items: f ? f.querySelectorAll('.pc-recap li').length : 0, txt: f ? f.textContent : '' }; });
  check(recap && etat.items === 4 && /Paris-Brest/.test(etat.txt) && /Opéra/.test(etat.txt), `la feuille « Ton parcours » au premier lancement : ${etat.items} récompenses (les recettes des boutiques n°2 à 5)`);
  check(etat.b === 5 && etat.rec.join() === 'parisbrest,kouign,myrtilles,opera' && etat.n === 16 && etat.defi === null && etat.q === 4, `la sauvegarde : boutique n°5, ses quatre recettes de boutique, seize postes, pas de défi pour la boutique en cours, son quartier gardé (${etat.q})`);
  await page.screenshot({ path: `${out}/1-ton-parcours.png` });
  await page.evaluate(() => { document.querySelector('#feuille [data-a="close"]').click(); });
  // les quatre recettes, débloquées et embauchées, pour la capture de la boutique n°5
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e17); st.mode = 1; for (let i = 8; i < 12; i++) { G.acheter(st, i); st.mode = 60; G.acheter(st, i); st.mode = 1; G.embaucher(st, i); } f.save(); f.tiroir('ouvert'); });
  await sleep(600);
  const cartes = await page.evaluate(() => [...document.querySelectorAll('#cartes .carte[data-i]')].map((c) => ({ i: +c.dataset.i, cache: c.hidden, cls: c.className, txt: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 90) })));
  const visibles = cartes.filter((c) => !c.cache), verrou = cartes.find((c) => /boutique/.test(c.cls) && !c.cache);
  check(visibles.length === 13 && cartes.slice(8, 12).every((c) => !c.cache && !/verrou/.test(c.cls)), `seize cartes : les huit, les quatre recettes de boutique débloquées, et une seule verrouillée (${visibles.length} visibles)`);
  check(verrou && verrou.i === 12 && /Ouvre la boutique n°6 pour la débloquer/.test(verrou.txt) && cartes.slice(13).every((c) => c.cache), `la carte verrouillée : le Canelé, « Ouvre la boutique n°6 pour la débloquer » ; les suivantes cachées`);
  await page.evaluate(() => { const el = document.querySelector('#cartes .carte[data-i="8"]'); el.scrollIntoView({ block: 'start' }); document.querySelector('#pages').scrollBy(0, -60); });
  await sleep(400); await page.screenshot({ path: `${out}/2-boutique-5-recettes.png` });
  await page.evaluate(() => document.querySelector('#cartes .carte[data-i="12"]').scrollIntoView({ block: 'center' }));
  await sleep(300); await page.screenshot({ path: `${out}/3-carte-verrouillee.png` });
  const refus = await page.evaluate(() => { const r = window.__fournil.G.acheter(window.__fournil.st, 12); return r; });
  check(!refus.ok && refus.verrou && refus.boutique === 6, 'le Canelé ne se débloque pas avant la boutique n°6');

  // la feuille Étoiles : le but
  await page.evaluate(() => { window.__fournil.tiroir('mi'); window.__fournil.etoiles(); });
  await sleep(400);
  const et = await page.evaluate(() => { const b = document.querySelector('#feuille .et-but'); return { but: b ? b.textContent.replace(/\s+/g, ' ').trim() : '', ico: !!(b && b.querySelector('.et-but-ico svg')), bouton: document.querySelector('#feuille [data-a="prestige"]').className }; });
  check(/Ta prochaine boutique débloque/.test(et.but) && /le Canelé/.test(et.but) && et.ico, `la feuille Étoiles annonce le but : « ${et.but.slice(0, 60)} »`);
  await page.screenshot({ path: `${out}/4-etoiles-but.png` });
  // l'onglet Défis : la carte « Objectif » et la feuille du parcours
  await page.evaluate(() => { document.querySelector('#feuille [data-a="close"]').click(); window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); });
  await sleep(500);
  const carte = await page.evaluate(() => { const c = document.querySelector('#page-defis .card.parcours'); return c ? { premier: c === document.querySelector('#page-defis .bloc').firstElementChild, txt: c.textContent.replace(/\s+/g, ' ').trim() } : null; });
  check(carte && carte.premier && /Objectif : boutique n°6 · Canelé\s*\d+ %/.test(carte.txt), `la carte en haut des Défis : « ${carte && carte.txt.slice(0, 50)} »`);
  await page.screenshot({ path: `${out}/5-defis-objectif.png` });
  await page.evaluate(() => document.querySelector('#page-defis .card.parcours').click());
  await sleep(500);
  const pc = await page.evaluate(() => { const l = [...document.querySelectorAll('#feuille .pc-ligne')]; return { n: l.length, passees: l.filter((x) => x.classList.contains('passee')).length, ici: l.findIndex((x) => x.classList.contains('actuelle')) + 1, gare: /la gare/.test(l[9] ? l[9].textContent : ''), defi6: /niveau 375/.test(l[5] ? l[5].textContent : '') }; });
  check(pc.n === 30 && pc.passees === 4 && pc.ici === 5 && pc.gare && pc.defi6, `la feuille du parcours : 30 boutiques, 4 passées, la n°5 actuelle, la gare à la n°10, le défi de la n°6 annoncé`);
  await page.screenshot({ path: `${out}/6-parcours.png` });
  await page.evaluate(() => document.querySelector('#feuille [data-a="close"]').click());
  // le rattrapage ne revient pas : un rechargement
  await page.evaluate(() => window.__fournil.save()); await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(2500);
  const encore = await page.evaluate(() => /Ton parcours/.test(document.querySelector('#feuille-contenu').textContent || ''));
  check(!encore, 'au lancement suivant, pas de seconde feuille « Ton parcours »');

  // ─── 2. le défi de passage : le bouton verrouillé, puis ouvert ───
  const d1 = await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; st.boutiques = 7; st.quartierFixe = G.quartierDe(7); st.lifetimeRun = 1e18; st.mobilier = {}; st.defi = G.creerDefi(st, 7); G.rattraperParcours(st); f.save(); f.etoiles(); const b = document.querySelector('#feuille [data-a="prestige"]'); return { cls: b.className, aria: b.getAttribute('aria-disabled'), txt: b.textContent, defi: G.defiPassage(st) }; });
  check(/non/.test(d1.cls) && d1.aria === 'true' && /Défi de passage : 5 meubles au cran maximum/.test(d1.txt) && /0 \/ 5/.test(d1.txt), `boutique n°7 : « Repartir » verrouillé, le bouton nomme le défi (${d1.txt.replace(/\s+/g, ' ').trim()})`);
  await page.screenshot({ path: `${out}/7-defi-verrou.png` });
  await page.evaluate(() => document.querySelector('#feuille [data-a="prestige"]').click()); await sleep(300);
  check(await page.evaluate(() => window.__fournil.st.boutiques === 7), 'toucher le bouton verrouillé n’ouvre rien');
  const d2 = await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; for (const m of G.MOBILIER) st.mobilier[m.id] = m.max; document.querySelector('#feuille [data-a="close"]').click(); f.etoiles(); const b = document.querySelector('#feuille [data-a="prestige"]'); return { cls: b.className, txt: b.textContent }; });
  check(/beurre/.test(d2.cls) && /Repartir avec/.test(d2.txt), 'le défi fait (six meubles au maximum) : le bouton s’ouvre');
  await page.evaluate(() => document.querySelector('#feuille [data-a="prestige"]').click()); await sleep(300);
  const conf = await page.evaluate(() => document.querySelector('#feuille-contenu').textContent.replace(/\s+/g, ' '));
  check(/Les bonus et le mobilier achetés sont perdus \(les places des meubles restent\)/.test(conf) && /Tes objectifs du jour réussis sont récupérés d’office/.test(conf), 'la confirmation dit ce qui se perd : les bonus et le mobilier (pas les places), et que les objectifs réussis sont récupérés');
  await page.evaluate(() => document.querySelector('#feuille [data-a="oui"]').click()); await sleep(600);
  const d3 = await page.evaluate(() => { const st = window.__fournil.st; return { b: st.boutiques, defi: st.defi && st.defi.type, q: window.__fournil.G.quartier(st) }; });
  check(d3.b === 8 && d3.defi === 'evenements', `boutique n°8 ouverte, avec son propre défi (${d3.defi})`);

  // ─── 3. les pâtisseries 3D : la vitrine en gros plan ───
  const spe = await page.evaluate(() => [...document.querySelectorAll('.spe-grille span')].map((x) => x.textContent));
  await page.evaluate(() => { const ok = document.querySelector('#feuille [data-a="ok"]'); if (ok) ok.click(); }); // la feuille du nom de la nouvelle boutique
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; st.boutiques = 10; st.quartierFixe = G.quartierDe(10); st.nomBoutique = ''; G.recettesBoutique(st); f.give(1e22); for (let i = 0; i < 16; i++) { st.mode = 1; if (!st.stations[i].niv) G.acheter(st, i); G.embaucher(st, i); } for (const m of G.MOBILIER) st.mobilier[m.id] = m.max; st.saison = null; f.save(); f.page('boutique'); f.tiroir('ferme'); f.scene({ heure: 12 }); });
  await sleep(5000); // les toasts s'en vont
  const vit = await page.evaluate(() => { const z = window.__fournil.SCENE.zones ? window.__fournil.SCENE.zones() : null, c = document.querySelector('#scene').getBoundingClientRect(); return z && z.vitrine ? { x: z.vitrine.x + c.left, y: z.vitrine.y + c.top, w: z.vitrine.w, h: z.vitrine.h } : null; });
  const r = vit ? { x: Math.max(0, vit.x - 12), y: Math.max(0, vit.y - 40), width: Math.min(390 - Math.max(0, vit.x - 12), vit.w + 40), height: vit.h + 56 } : { x: 100, y: 150, width: 200, height: 160 };
  const shot = await page.screenshot({ path: `${out}/8-vitrine-gros-plan.png`, clip: r });
  check(shot.length > 5000, `la vitrine en gros plan (${Math.round(r.width)} × ${Math.round(r.height)})`);
  const v8 = await page.evaluate(() => { const st = window.__fournil.st; return st.stations.filter((x) => x.niv > 0).length; });
  check(v8 === 16, `seize recettes ouvertes : la vitrine montre les huit plus avancées (${v8} ouvertes)`);
  check(spe.length === 15 && spe.includes('Myrtilles') && spe.includes('Fraisier') && !spe.includes('Croquembouche'), `la spécialité de la boutique n°8 : les quinze recettes à la carte (${spe.slice(8).join(', ')})`);
  await page.screenshot({ path: `${out}/8b-boutique-gare.png` });
  const gare = await page.evaluate(() => ({ standing: window.__fournil.G.standing(window.__fournil.st), q: VIE.etat && VIE.etat.Q ? VIE.etat.Q.id : null, // depuis le standing (18 oct.) : la boutique n°10 est au palier 1, décor « gare-s1 »
    ardoise: !!VIE.etat && VIE.etat.Q.objets.includes('ardoise'), enseigne: document.querySelector('#enseigne') ? document.querySelector('#enseigne').textContent : '' }));
  check(/^gare(-s\d)?$/.test(gare.q || '') && gare.standing === 1 && gare.ardoise && /Gare/.test(gare.enseigne), `la boutique n°10 dans le quartier de la gare : son décor (données de GAME.QUARTIERS, palier 1 du standing : ${gare.q}), son enseigne « ${gare.enseigne.trim()} »`);
  { // le même gros plan, à la pleine qualité et quatre fois la finesse de l'écran (une page à part, la même boutique)
    const brut = await page.evaluate(() => { const st = JSON.parse(JSON.stringify(window.__fournil.st)); st.ev = null; st.boost = null; return JSON.stringify(st); });
    const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 4, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx4.addInitScript((x) => { window.__sansEvenements = true; try { localStorage.setItem('fournil.v2', x); } catch (e) { /* rien */ } }, brut);
    await ctx4.route(/supabase\.co|googleapis|gstatic/, (q) => q.abort());
    const p4 = await ctx4.newPage(); p4.on('pageerror', (e) => erreurs.push(e.message));
    await p4.goto(`${BASE}/fournil/`); await p4.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
    await p4.evaluate(() => { const f = window.__fournil; f.tiroir('ferme'); f.scene({ heure: 12 }); }); await sleep(4000);
    const v4 = await p4.evaluate(() => { const z = window.__fournil.SCENE.zones(), c = document.querySelector('#scene').getBoundingClientRect(); return { x: z.vitrine.x + c.left, y: z.vitrine.y + c.top, w: z.vitrine.w, h: z.vitrine.h }; });
    await p4.screenshot({ path: `${out}/8-vitrine-gros-plan.png`, clip: { x: Math.max(0, v4.x - 6), y: Math.max(0, v4.y - 30), width: v4.w + 16, height: v4.h + 40 } });
    await ctx4.close();
  }
  // ─── 4. la pastille ★, la fin du parcours, l'enseigne de la Capitale, les petits textes (relecture : constats 4, 8, 9, 11, 12) ───
  // les gains de la boutique réglés pour récolter exactement g étoiles (par dichotomie sur GAME.etoilesGagnables)
  const reglerGain = (g) => page.evaluate((g) => { const f = window.__fournil, G = f.G, st = f.st; let lo = 1, hi = 1e60; for (let k = 0; k < 400; k++) { const m = Math.sqrt(lo * hi); st.lifetimeRun = m; if (G.etoilesGagnables(st) >= g) hi = m; else lo = m; } st.lifetimeRun = hi; return G.etoilesGagnables(st); }, g);
  const pastille = () => page.evaluate(() => new Promise((ok) => { window.__fournil.rafraichir(); requestAnimationFrame(() => ok(document.querySelector('#b-etoiles').classList.contains('pret'))); }));
  const noteDefis = () => page.evaluate(() => { const f = window.__fournil; f.rafraichir(); const c = document.querySelector('#page-defis .card.parcours'); return c ? c.textContent.replace(/\s+/g, ' ').trim() : ''; });
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; const o = document.querySelector('#feuille [data-a="close"]'); if (o) o.click(); st.boutiques = 6; st.quartierFixe = G.quartierDe(6); st.etoiles = 1000; for (const s of st.stations) s.niv = Math.min(s.niv, 300); st.defi = G.creerDefi(st, 6); f.page('defis'); f.tiroir('ouvert'); });
  const g3 = await reglerGain(3);
  const p1 = await pastille(), n1 = await noteDefis();
  check(g3 === 3 && !p1 && !/touche ★ en haut/.test(n1) && /Défi : Une recette au niveau 375/.test(n1), `boutique n°6, +3 ★ à récolter mais le défi pas fait : la pastille ★ reste éteinte (« ${n1.slice(-70)} »)`);
  await page.evaluate(() => { window.__fournil.st.stations[0].niv = 375; });
  const p2 = await pastille(), n2 = await noteDefis();
  check(p2 && /Prête à ouvrir : touche ★ en haut/.test(n2), `le défi fait : la pastille s'allume, la carte dit « touche ★ en haut »`);
  await reglerGain(1);
  const p3 = await pastille(), n3 = await noteDefis();
  check(!p3 && /Prête à ouvrir : ouvre la feuille ★/.test(n3) && !/touche ★ en haut/.test(n3), `+1 ★ seulement : la pastille éteinte, la carte ne parle pas d'elle (« ${n3.slice(-40)} »)`);

  // la n°30 ouverte depuis la n°29, par l'interface : le nom proposé (l'enseigne de la Capitale, 31 caractères) n'est pas stocké, donc pas coupé
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; st.boutiques = 29; st.quartierFixe = G.quartierDe(29); st.defi = null; st.nomBoutique = ''; st.specialite = null; f.page('boutique'); f.tiroir('mi'); });
  await reglerGain(50);
  await page.evaluate(() => { window.__fournil.etoiles(); document.querySelector('#feuille [data-a="prestige"]').click(); }); await sleep(300);
  await page.evaluate(() => document.querySelector('#feuille [data-a="oui"]').click()); await sleep(600);
  const nom = await page.evaluate(() => { const c = document.querySelector('#feuille .champ'); return c ? c.value : null; });
  await page.evaluate(() => document.querySelector('#feuille [data-a="ok"]').click()); await sleep(400);
  const en = await page.evaluate(() => { const f = window.__fournil, st = f.st, s = document.querySelector('#enseigne span'); return { b: st.boutiques, nom: st.nomBoutique, aff: s.textContent, spe: st.specialite, defi: f.G.defiPassage(st) }; });
  check(en.b === 30 && nom === 'Le Grand Fournil de la Capitale' && en.nom === '' && en.aff === 'Le Grand Fournil de la Capitale', `la boutique n°30 : le nom proposé (« ${nom} ») validé tel quel n'est pas stocké (« ${en.nom} ») ; l'enseigne montre le nom complet (« ${en.aff} »)`);
  const enseigne = (w, h) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => { window.__fournil.rafraichir(); requestAnimationFrame(() => { const e = document.querySelector('#enseigne'), s = e.querySelector('span'), r = e.getBoundingClientRect(); const c = document.querySelector('#coin').getBoundingClientRect(); ok({ sw: s.scrollWidth, cw: s.clientWidth, sh: s.scrollHeight, ch: s.clientHeight, long: e.classList.contains('long'), g: r.left, d: c.left - r.right, h: r.height, txt: s.textContent }); }); })));
  const clipEnseigne = () => page.evaluate(() => { const r = document.querySelector('#enseigne').getBoundingClientRect(); return { x: 0, y: 0, width: innerWidth, height: Math.ceil(r.bottom + 12) }; });
  await attendre(() => page.evaluate(() => !document.querySelector('.toast')), 20000); // les messages de l'ouverture passent sur l'enseigne : la capture attend qu'ils s'en aillent
  const e390 = await enseigne();
  check(e390.sw <= e390.cw + 1 && e390.sh <= e390.ch + 1 && e390.long && e390.g >= 8 && e390.d >= 4, `à 390 px : « ${e390.txt} » tient en entier sur l'enseigne (${e390.sw} ≤ ${e390.cw} px, sur ${Math.round(e390.h)} px de haut), à ${Math.round(e390.d)} px des boutons ronds`);
  await page.screenshot({ path: `${out}/10-enseigne-capitale-390.png`, clip: await clipEnseigne() });
  await page.setViewportSize({ width: 360, height: 640 }); await sleep(400);
  const e360 = await enseigne();
  check(e360.sw <= e360.cw + 1 && e360.sh <= e360.ch + 1 && e360.long && e360.g >= 8 && e360.d >= 4, `à 360 × 640 : l'enseigne de la Capitale tient en entier (${e360.sw} ≤ ${e360.cw} px), sans ellipse, à ${Math.round(e360.d)} px des boutons ronds`);
  await page.screenshot({ path: `${out}/11-enseigne-capitale-360.png`, clip: await clipEnseigne() });
  await page.evaluate(() => { const f = window.__fournil; f.G.renommer(f.st, 'Aux Délices de Mamie Lou'); }); await sleep(100);
  const eLong = await enseigne();
  check(eLong.txt === 'Aux Délices de Mamie Lou' && eLong.sw <= eLong.cw + 1 && eLong.sh <= eLong.ch + 1 && eLong.g >= 8 && eLong.d >= 4, `à 360 × 640, un nom de 24 caractères (« ${eLong.txt} ») tient lui aussi, sans toucher les boutons ronds`);
  await page.screenshot({ path: `${out}/12-enseigne-nom-long-360.png`, clip: await clipEnseigne() });
  await page.evaluate(() => { const f = window.__fournil; f.G.renommer(f.st, 'Chez Lou'); }); await sleep(100);
  const eCourt = await enseigne();
  check(eCourt.txt === 'Chez Lou' && !eCourt.long, 'un nom court : l’enseigne reprend sa grande taille');
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => { const f = window.__fournil; f.G.renommer(f.st, ''); }); await sleep(300);

  // la n°30 : le parcours est fini, mais le défi de passage (celui de la n°29) reste exigé ; il est décrit partout
  await reglerGain(Math.round(en.defi.cible / 4));
  await page.evaluate(() => { const f = window.__fournil; f.page('defis'); f.tiroir('ouvert'); f.rafraichir(); }); await sleep(400);
  const fin = await page.evaluate(() => { const f = window.__fournil, G = f.G, d = G.defiPassage(f.st), c = document.querySelector('#page-defis .card.parcours'); return { d: { txt: d.txt, p: G.fmt(d.progres), c: G.fmt(d.cible), fait: d.fait }, txt: c.textContent.replace(/\s+/g, ' ').trim(), jauge: !!c.querySelector('.mini.xp i'), compte: c.querySelector('.compte').textContent }; });
  check(/Parcours terminé/.test(fin.txt) && fin.txt.includes(`Défi de passage : ${fin.d.txt} · ${fin.d.p}/${fin.d.c}`) && fin.jauge && fin.compte === '30/30' && !fin.d.fait, `la carte des Défis à la n°30 : « Parcours terminé », puis le défi, sa progression et sa jauge (« ${fin.txt.slice(fin.txt.indexOf('Défi'))} »)`);
  await page.evaluate(() => document.querySelector('#page-defis .card.parcours').scrollIntoView({ block: 'start' })); await sleep(200);
  await page.screenshot({ path: `${out}/13-defis-n30.png` });
  await page.evaluate(() => { window.__fournil.tiroir('mi'); window.__fournil.etoiles(); }); await sleep(400);
  const fe30 = await page.evaluate(() => { const b = document.querySelector('#feuille .et-but.fini'), bt = document.querySelector('#feuille [data-a="prestige"]'); return { but: b ? b.textContent.replace(/\s+/g, ' ').trim() : '', petit: bt.querySelector('small').textContent, gros: bt.querySelector('b').textContent, aria: bt.getAttribute('aria-disabled') }; });
  check(/Parcours terminé/.test(fe30.but) && fe30.but.includes(`Défi de passage : ${fin.d.txt} · ${fin.d.p}/${fin.d.c}`), `la feuille Étoiles à la n°30 : le défi sous « Parcours terminé » (« ${fe30.but.slice(fe30.but.indexOf('Défi'))} »)`);
  check(fe30.petit === `Défi de passage : ${fin.d.txt}` && fe30.gros === `${fin.d.p} / ${fin.d.c}` && fe30.aria === 'true', `le bouton nomme le défi : « ${fe30.petit} » · « ${fe30.gros} »`);
  await page.screenshot({ path: `${out}/14-etoiles-n30.png` });
  await page.evaluate(() => { document.querySelector('#feuille .et-but.fini') && window.__fournil.parcours(); }); await sleep(400);
  const pc30 = await page.evaluate(() => { const e = document.querySelector('#feuille .encadre'); return e ? e.textContent.replace(/\s+/g, ' ') : ''; });
  check(/Parcours terminé/.test(pc30) && pc30.includes(fin.d.txt) && pc30.includes(`${fin.d.p}/${fin.d.c}`), 'la feuille du parcours, à la fin : le défi de passage dans l’encadré');
  await page.evaluate(() => document.querySelector('#feuille [data-a="close"]').click()); await sleep(200);

  // les petits textes : la carte à débloquer (le vrai gain au niveau 1), l'absence en heures et minutes, les compagnons comptés, la spécialité
  await page.evaluate(() => { const f = window.__fournil; f.page('boutique'); f.tiroir('ouvert'); f.rafraichir(); }); await sleep(300);
  const deb = await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st, i = st.stations.findIndex((s, k) => s.niv === 0 && G.recetteGagnee(st, k) && (k === 0 || st.stations[k - 1].niv > 0)), c = document.querySelector(`#cartes .carte[data-i="${i}"]`);
    const vrai = G.revenuFournee(Object.assign({}, st, { stations: st.stations.map((x, k) => (k === i ? Object.assign({}, x, { niv: 1, staff: false }) : x)) }), i);
    const net = (t) => t.replace(/\s+/g, ' '); // (les espaces insécables de fmtEur aussi)
    return { i, txt: c ? net(c.textContent) : '', vrai: net(G.fmtEur(vrai)), base: net(G.fmtEur(G.PRODUITS[i].rev)), plus: vrai > G.PRODUITS[i].rev * 2 }; });
  check(deb.i >= 0 && deb.txt.includes(`Rapporte ${deb.vrai} la fournée`) && deb.plus && !deb.txt.includes(`Rapporte ${deb.base} la fournée`), `la carte à débloquer annonce le vrai gain au niveau 1 : « Rapporte ${deb.vrai} la fournée », pas le prix de base (${deb.base})`);
  const abs = await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; G.donnerVetement(st, 'quartier-or-chaine'); G.equiper(st, 'accessoire', 'quartier-or-chaine'); f.absence(30 * 3600e3); return { h: G.heuresAbsence(st), txt: document.querySelector('#feuille-contenu').textContent.replace(/\s+/g, ' ') }; });
  check(abs.h % 1 === 0.5 && new RegExp(`les apprentis s’arrêtent après ${Math.floor(abs.h)} h 30\\)`).test(abs.txt) && !/\d\.\d h/.test(abs.txt), `la feuille d'absence : « après ${Math.floor(abs.h)} h 30 », pas « ${abs.h} h »`);
  await page.evaluate(() => document.querySelector('#feuille [data-a="close"]').click()); await sleep(200);
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; if (!st.chat) G.adopterChat(st, 'Brioche'); if (st.specialite == null) G.choisirSpecialite(st, 0); f.page('reglages'); f.tiroir('ouvert'); f.rafraichir(); }); await sleep(400);
  const rg = await page.evaluate(() => { const f = window.__fournil, sec = document.querySelector('#page-reglages'), lignes = [...sec.querySelectorAll('.reglage')], spe = lignes.find((x) => /^Spécialité/.test(x.querySelector('b') ? x.querySelector('b').textContent : '')), comp = sec.querySelector('[data-a="compagnons"]');
    return { spe: spe ? { tag: spe.tagName, cls: spe.className, a: spe.getAttribute('data-a'), chev: !!spe.querySelector('.chev'), txt: spe.textContent } : null, comp: comp ? comp.textContent : '', n: f.G.COMPAGNONS.length, chien: f.G.aCompagnon(f.st, 'chien-quartier'), okAvant: !!sec.querySelector('[data-a="specialite-ok"]') }; });
  check(rg.spe && rg.spe.tag === 'DIV' && /\binfo\b/.test(rg.spe.cls) && !rg.spe.a && !rg.spe.chev && !rg.okAvant, `la ligne Spécialité des Réglages : une ligne d'information (${rg.spe && rg.spe.tag}.${rg.spe && rg.spe.cls}), plus un bouton sans action`);
  if (require('../src/quartier.js').ECARTE && !rg.chien) rg.n -= 1; // le chien du quartier n'est montré qu'à qui l'a gagné tant que la Planque est écartée
  check(rg.comp.includes(`${rg.n} animaux au choix`) && !/treize/.test(rg.comp), `le compagnon : « ${rg.n} animaux au choix » (GAME.COMPAGNONS, sans le chien du quartier non gagné tant que la Planque est écartée), plus « treize »`);
  await page.evaluate(() => { const l = [...document.querySelectorAll('#page-reglages .reglage')].find((x) => /^Spécialité/.test(x.querySelector('b') ? x.querySelector('b').textContent : '')); l.scrollIntoView({ block: 'center' }); }); await sleep(200);
  await page.screenshot({ path: `${out}/15-reglages-specialite.png` });

  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  // l'atelier 3D : les huit pâtisseries de boutique côte à côte, grossies
  const at = await browser.newPage({ viewport: { width: 390, height: 714 }, deviceScaleFactor: 2 });
  const errAt = []; at.on('pageerror', (e) => errAt.push(e.message));
  await at.goto(`${BASE}/test/atelier.html`); await at.waitForTimeout(600);
  const boite = await at.evaluate(() => window.atelier.montrer({ nom: 'patisseries-boutique', faire: 'PERSOS.demo', args: ['patisseries-boutique'] }));
  await at.waitForTimeout(150); await at.screenshot({ path: `${out}/9-patisseries-3d.png`, clip: { x: 0, y: 270, width: 390, height: 200 } });
  const tailles = await at.evaluate(() => { const T = []; for (let i = 8; i < 16; i++) { const b = new THREE.Box3().setFromObject(PERSOS.patisserie(i)); T.push([+(b.max.x - b.min.x).toFixed(1), +(b.max.z - b.min.z).toFixed(1), +b.min.y.toFixed(2), +(b.max.y).toFixed(1)]); } return T; });
  check(errAt.length === 0 && boite && tailles.every(([w, d, y0]) => Math.max(w, d) >= 12 && Math.max(w, d) <= 19 && Math.abs(y0) < 0.6), `les huit pâtisseries : posées sur y = 0, ~16 d'envergure (${tailles.map((t) => `${t[0]}×${t[1]}×${t[3]} dès ${t[2]}`).join(' · ')})${errAt.length ? ' ' + errAt[0] : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (recettes de boutique).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
