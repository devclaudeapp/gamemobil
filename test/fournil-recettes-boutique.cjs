// Les recettes de boutique et le parcours du boulanger, dans la vraie page (fournil/ servie en local), sur un téléphone en portrait (390 × 844).
// 1. Une vieille sauvegarde déjà à la boutique n°5 (huit postes, ni parcours ni défi) : au lancement, la feuille « Ton parcours » (les quatre
//    recettes gagnées, une fois), les cartes des quatre recettes, la carte verrouillée de la suivante (« Ouvre la boutique n°6… »), les
//    recettes d'après cachées ; la feuille Étoiles annonce le but ; la carte « Objectif » en haut des Défis et la feuille du parcours.
// 2. Le défi de passage : à la boutique n°7, le bouton « Repartir » est verrouillé tant que le défi n'est pas fait, puis s'ouvre.
// 3. Les pâtisseries 3D : dans la vitrine (gros plan) et dans l'atelier 3D (les huit côte à côte).
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
  check(/non/.test(d1.cls) && d1.aria === 'true' && /défi de passage/.test(d1.txt) && /0 \/ 5/.test(d1.txt), `boutique n°7 : « Repartir » verrouillé (${d1.txt.replace(/\s+/g, ' ').trim()})`);
  await page.screenshot({ path: `${out}/7-defi-verrou.png` });
  await page.evaluate(() => document.querySelector('#feuille [data-a="prestige"]').click()); await sleep(300);
  check(await page.evaluate(() => window.__fournil.st.boutiques === 7), 'toucher le bouton verrouillé n’ouvre rien');
  const d2 = await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; for (const m of G.MOBILIER) st.mobilier[m.id] = m.max; document.querySelector('#feuille [data-a="close"]').click(); f.etoiles(); const b = document.querySelector('#feuille [data-a="prestige"]'); return { cls: b.className, txt: b.textContent }; });
  check(/beurre/.test(d2.cls) && /Repartir avec/.test(d2.txt), 'le défi fait (six meubles au maximum) : le bouton s’ouvre');
  await page.evaluate(() => document.querySelector('#feuille [data-a="prestige"]').click()); await sleep(300);
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
  const gare = await page.evaluate(() => ({ q: VIE.etat && VIE.etat.Q ? VIE.etat.Q.id : null, ardoise: !!VIE.etat && VIE.etat.Q.objets.includes('ardoise'), enseigne: document.querySelector('#enseigne') ? document.querySelector('#enseigne').textContent : '' }));
  check(gare.q === 'gare' && gare.ardoise && /Gare/.test(gare.enseigne), `la boutique n°10 dans le quartier de la gare : son décor (données de GAME.QUARTIERS), son enseigne « ${gare.enseigne.trim()} »`);
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
