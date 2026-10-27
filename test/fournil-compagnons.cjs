// Les compagnons du Fournil sur la vraie page : la feuille « Les compagnons » (Réglages › La boutique), acheter un compagnon payant avec
// l'argent du jeu puis le choisir, le voir en 3D dans la boutique (un crochet de scene.js), le caresser (son cri, sa chance, le nuage de
// farine du mini-dragon), passer d'un animal à l'autre sans fuite (les géométries et textures du rendu restent stables, l'animation
// n'alloue rien), recharger la page (le choix est gardé), la garde-robe qui mène à la feuille. La chauve-souris (gagnée au bestiaire de la
// Maison hantée) : verrouillée, puis gagnée, choisie ; elle vole en petits cercles près du plafond, se pose pour dormir, et sa zone de caresse
// la suit. Captures 390×844 dans test/shots/compagnons/ (et dans SHOTS_BESTIAIRE, préfixées « bestiaire- », celles de la chauve-souris).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-compagnons.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_COMPAGNONS || 8868;
const out = path.join(__dirname, 'shots', 'compagnons'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_BESTIAIRE ? (fs.mkdirSync(process.env.SHOTS_BESTIAIRE, { recursive: true }), process.env.SHOTS_BESTIAIRE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const PAYANTS = ['poule', 'canard', 'herisson', 'pingouin', 'raton', 'escargot', 'teckel', 'croissant', 'dragon'];
const TOUS = ['chat-roux', 'chien', 'lapin', 'chat-noir', 'chien-quartier', 'chauve-souris'].concat(PAYANTS);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { window.__sansEvenements = true; });
  await ctx.route(/supabase\.co/, (r) => r.abort());
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 4000)) { if (await f()) return true; await sleep(100); } return false; };
  const feuille = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const clic = async (sel) => { await ev((s) => { const b = document.querySelector(s); if (b) b.scrollIntoView({ block: 'center' }); }, sel); await sleep(150); await page.locator(sel).first().click(); await sleep(250); };
  const shot = (nom) => page.screenshot({ path: path.join(out, `${nom}.png`) });
  const vu = () => ev(() => window.__fournil.SCENE.compagnonVu);
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=haute`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
  await ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); const f = window.__fournil; f.st.tuto = 99; f.save(); });
  await page.mouse.click(200, 120); await ev(() => window.__fournil.audio()); await sleep(300); // un premier geste : l'audio démarre
  await ev(() => { window.__toasts = []; new MutationObserver(() => { for (const t of document.querySelectorAll('.toast')) if (t.textContent && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document.body, { subtree: true, childList: true, characterData: true }); }); // tous les mots affichés

  console.log('── la feuille « Les compagnons » ──');
  await ev(() => window.__fournil.page('reglages')); await sleep(400);
  check(await ev(() => !document.querySelector('[data-a="chat-noir"]') && /Le compagnon/.test(document.querySelector('[data-a="compagnons"]').innerText)), 'Réglages › La boutique : la ligne « Le compagnon » (plus de « … en chat noir »)');
  await clic('[data-a="compagnons"]'); await sleep(300);
  let f = await feuille();
  const cartes = await ev(() => [...document.querySelectorAll('#feuille-contenu [data-cp]')].map((c) => ({ id: c.dataset.cp, txt: c.innerText, svg: !!c.querySelector('.cp-ico svg'), acheter: !!c.querySelector('[data-cp-acheter]'), choisir: !!c.querySelector('[data-cp-choisir]'), non: !!c.querySelector('[data-cp-acheter].non') })));
  // (le pigeon voyageur, « Ma chaîne de boutiques » : une carte de plus, verrouillée, gagnée en jetons de chaîne ; il n'est pas de la ronde ci-dessous)
  check(/Les compagnons/.test(f) && cartes.length === TOUS.length + 1 && cartes.every((c) => c.svg), `la grille : ${cartes.length} compagnons, chacun sa vignette, son nom et sa phrase`);
  const carte = (id) => cartes.find((c) => c.id === id) || { txt: '' };
  check(/Ma chaîne/.test(carte('pigeon').txt) && /jetons de chaîne/.test(carte('pigeon').txt) && !carte('pigeon').choisir && !carte('pigeon').acheter, 'le pigeon voyageur : « Gagné dans « Ma chaîne » », 120 jetons de chaîne, pas encore à soi (ni Choisir, ni Acheter)');
  check(['chat-roux', 'chien', 'lapin'].every((id) => /Gratuit/.test(carte(id).txt) && carte(id).choisir) && /Gagné à la Maison hantée/.test(carte('chat-noir').txt) && !carte('chat-noir').choisir && /Gagné au Quartier/.test(carte('chien-quartier').txt) && /Au palier 11 du Quartier/.test(carte('chien-quartier').txt) && !carte('chien-quartier').choisir && /Gagnée au bestiaire du Manoir/.test(carte('chauve-souris').txt) && /Les neuf monstres du bestiaire/.test(carte('chauve-souris').txt) && !carte('chauve-souris').choisir && !carte('chauve-souris').acheter,
    '« Gratuit » (Choisir) pour le chat roux, le chien et le lapin ; « Gagné à la Maison hantée » pour le chat noir, « Gagné au Quartier » (au palier 11) pour le chien du quartier, « Gagnée au bestiaire du Manoir » (les neuf monstres) pour la chauve-souris, pas encore à soi');
  check(PAYANTS.every((id) => carte(id).acheter && carte(id).non && /Pas assez/.test(carte(id).txt) && /€/.test(carte(id).txt)), 'les payants : « Pas assez », grisés, avec leur prix');
  await shot('01-feuille');
  await ev(() => { document.querySelector('#feuille').scrollTop = 99999; }); await sleep(300); await shot('02-feuille-bas');
  const coins0 = await ev(() => window.__fournil.st.coins);
  await clic('#feuille-contenu [data-cp-acheter="dragon"]'); await sleep(300);
  { // la boutique continue de vendre pendant le toucher (lent sur la CI) : la caisse ne doit simplement pas avoir payé le compagnon
    const r = await ev((c) => ({ coins: window.__fournil.st.coins, c, n: window.__fournil.st.compagnons.length, mot: window.__toasts.some((t) => /Il manque/.test(t)) }), coins0);
    check(r.coins >= r.c && !r.n && r.mot, `pas assez d’argent : rien n’est acheté, un mot dit ce qui manque (${JSON.stringify(r)})`); }

  console.log('── acheter un compagnon payant ──');
  const prix = await ev(() => window.__fournil.G.prixCompagnon(window.__fournil.st, 'dragon'));
  await ev((p) => { window.__fournil.give(p * 1.5); window.__fournil.compagnons(); }, prix); await sleep(300);
  check(await ev(() => !!document.querySelector('#feuille-contenu [data-cp-acheter="dragon"].beurre') && /Acheter/.test(document.querySelector('#feuille-contenu [data-cp="dragon"]').innerText)), `de l’argent donné : « Acheter » le mini-dragon (${prix} €)`);
  const avant = await ev(() => window.__fournil.st.coins);
  await clic('#feuille-contenu [data-cp-acheter="dragon"]'); await sleep(400);
  let s = await ev(() => { const st = window.__fournil.st; return { coins: st.coins, comp: st.compagnons.slice(), actif: st.compagnon, chat: st.chat ? st.chat.nom : null }; });
  check(s.comp.join() === 'dragon' && s.actif === 'dragon' && Math.abs(avant - s.coins - prix) < 1 && s.chat === 'Fournaise', `acheté (${Math.round(avant - s.coins)} € payés), à soi pour toujours, choisi tout de suite, adopté sous le nom « ${s.chat} »`);
  f = await feuille();
  check(/Avec toi/.test(await ev(() => document.querySelector('#feuille-contenu [data-cp="dragon"]').innerText)) && /Fournaise, mini-dragon/.test(f), 'la feuille le montre : « Avec toi ✓ », et en tête « Fournaise, mini-dragon »');
  check(await attendre(async () => { const v = await vu(); return v && v.id === 'dragon'; }), 'il apparaît en 3D dans la boutique');
  const v1 = await vu(); check(v1 && v1.appels <= 5, `le budget du compagnon : ${v1 && v1.appels} appels de dessin (5 au plus, comme le chat)`);
  await shot('03-feuille-achete');
  await clic('#feuille-contenu [data-a="cp-fermer"]');

  console.log('── le caresser ──');
  await ev(() => { window.__fournil.page('boutique'); window.__fournil.tiroir('ferme'); window.__fournil.scene({ chat: 'dort' }); }); await sleep(900);
  await ev(() => { window.__souffles = 0; const S = window.__fournil.SCENE, o = S.souffle; S.souffle = (n) => { window.__souffles++; return o(n); }; window.__cris = []; const z = SONS.zz; SONS.zz = (n, x) => { window.__cris.push(n); return z(n, x); }; });
  const zone = async () => ev(() => { const r = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones().chat; return z ? { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2 } : null; });
  let z = await zone(), c0 = await ev(() => window.__fournil.st.chat.caresses), t0 = await ev(() => window.__fournil.st.mystereTimer);
  await page.touchscreen.tap(z.x, z.y); await sleep(400);
  await attendre(() => ev(() => window.__toasts.some((t) => /Fournaise porte chance/.test(t))), 8000);
  s = await ev(() => ({ n: window.__fournil.st.chat.caresses, t: window.__fournil.st.mystereTimer, souffles: window.__souffles, toast: window.__toasts.find((t) => /Fournaise porte chance/.test(t)) || '' }));
  check(s.n === c0 + 1 && s.t < t0 * 0.85, 'toucher le mini-dragon le caresse : il porte chance (client mystère plus tôt)');
  check(s.souffles === 1 && /Fournaise porte chance/.test(s.toast), `il crache un nuage de farine, et le mot de chance garde son nom (« ${s.toast.slice(0, 60)} »)`);
  await sleep(150); await shot('04-boutique-dragon-caresse');
  await ev(() => window.__fournil.choisirCompagnon('chien')); await sleep(600);
  await ev(() => { window.__fournil.st.chat.dernier = 0; }); z = await zone(); await page.touchscreen.tap(z.x, z.y); await sleep(300);
  check(await ev(() => window.__cris.includes('wouf') && window.__fournil.SCENE.compagnonVu.id === 'chien'), 'le chien, caressé : « wouf » (un cri de synthèse, src/sons.js)');

  console.log('── changer encore, sans fuite ──');
  await ev((ids) => { const f = window.__fournil, st = f.st; f.G.donnerChatNoir(st); for (const id of ids) { st.coins += f.G.prixCompagnon(st, id) || 0; f.G.acheterCompagnon(st, id); } f.save(); }, PAYANTS);
  await ev(() => { const F = window.__fournil, q = F.Q.etat(F.st, HORLOGE.maintenant()); F.Q.gagner(q, F.Q.PALIERS[10].total); for (const p of F.Q.paliersDus(q)) F.Q.marquerPalier(q, p.n); F.save(); }); // le palier 11 du Quartier : le chien du quartier
  await ev(() => { const F = window.__fournil, q = F.HT.etat(F.st, HORLOGE.maintenant()); for (const k of F.HT.SORTES) q.bestiaire[k] = 10; F.HT.bestiaireDus(q); F.HT.verserBestiaire(q); F.save(); }); // le bestiaire du Manoir complet : la chauve-souris
  check(await ev((ids) => ids.every((id) => window.__fournil.G.aCompagnon(window.__fournil.st, id)), TOUS), `les ${TOUS.length} à soi (le chat noir, le chien du quartier et la chauve-souris gagnés, les payants achetés)`);
  await ev(() => window.__fournil.scene({ chat: 'assis' }));
  const tour = async () => { const res = []; for (const id of TOUS) { await ev((i) => window.__fournil.choisirCompagnon(i), id); await sleep(260); res.push(await vu()); } return res; };
  const vus1 = await tour(), st1 = await ev(() => window.__fournil.stats()), cache1 = await ev(() => [...MODELES.GEOS.keys()].filter((k) => /^persos\|(comp\||chat-)/.test(k)).length); // seulement les géométries des animaux (les clients qui passent en ajoutent d'autres)
  check(vus1.every((v, k) => v && v.id === TOUS[k] && v.appels <= 5), `chacun bâti à son tour, 5 appels de dessin au plus (${vus1.map((v) => `${v.id} ${v.appels}`).join(', ')})`);
  const vus2 = await tour(); await tour(); const st2 = await ev(() => window.__fournil.stats()), cache2 = await ev(() => [...MODELES.GEOS.keys()].filter((k) => /^persos\|(comp\||chat-)/.test(k)).length);
  check(vus2.every((v, k) => v && v.id === TOUS[k]) && cache2 === cache1, `deux tours de plus : aucune géométrie nouvelle en cache (${cache1} → ${cache2}), tout est repris`);
  // les clients qui entrent et sortent pendant ces tours ajoutent ou retirent leurs maillages (jusqu'à 4 ou 5 sur une machine lente : 106 → 110 en CI) ;
  // la fuite d'un animal se voit plus haut, au cache des géométries (cache1 === cache2)
  check(st2.geometries <= st1.geometries + 6 && st2.textures === st1.textures, `et les géométries (${st1.geometries} → ${st2.geometries}, les clients vont et viennent) et textures (${st1.textures} → ${st2.textures}) du rendu ne grandissent pas`);
  check(st2.calls <= 160, `le budget d’appels de dessin de la boutique tient (${st2.calls})`);
  { // l'animation n'alloue rien : le profileur d'allocations de Chromium, objets ramassés compris, sur 13 animaux × 5 états
    const cdp = await ctx.newCDPSession(page);
    await ev(() => { window.__comps = ['chat-roux', 'chien', 'lapin', 'chat-noir', 'chien-quartier', 'chauve-souris', 'poule', 'canard', 'herisson', 'pingouin', 'raton', 'escargot', 'teckel', 'croissant', 'dragon'].map((id) => PERSOS.compagnon(id)); window.__oc = { etat: 'assis', phase: 0, t: 0 }; window.__etats = ['dort', 'assis', 'marche', 'saut', 'debout']; window.__boucleAnimer = (n) => { const o = window.__oc, cs = window.__comps, es = window.__etats; for (let k = 0; k < n; k++) { const g = cs[k % cs.length]; o.etat = es[k % 5]; o.phase = k * 0.37; o.t = k * 0.016; PERSOS.animerCompagnon(g, o); } }; window.__boucleAnimer(60000); });
    await cdp.send('HeapProfiler.enable');
    // jusqu'à cinq mesures (quinze animaux, une machine chargée : l'optimiseur peut tarder), la plus basse compte : une allocation par appel se verrait à chaque fois (65 000 appels × quelques octets = des
    // centaines de Ko), alors qu'un coût unique du moteur (une fonction réoptimisée, ses vecteurs de rétroaction) ne tombe que dans une mesure
    const mesures = [];
    for (let k = 0; k < 5 && !(mesures.length && Math.min(...mesures) < 4096); k++) {
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 64, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await ev(() => window.__boucleAnimer(65000));
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      let octets = 0; const parcourir = (nd, dedans) => { const d = dedans || /^(animerCompagnon|animerChat|tourner)$/.test(nd.callFrame.functionName); if (d) octets += nd.selfSize; for (const c of nd.children || []) parcourir(c, d); }; parcourir(profile.head, false);
      mesures.push(octets);
    }
    check(Math.min(...mesures) < 4096, `l’animation des compagnons n’alloue rien : ${mesures.join(' puis ')} octets échantillonnés sur 65 000 appels (15 animaux × 5 états, la chauve-souris en vol comprise)`);
    await ev(() => { for (const g of window.__comps) PERSOS.libererChat(g); window.__comps = null; });
  }

  console.log('── le chien du quartier : choisi, visible, sans doublon avec la déco ──');
  await ev(() => { const F = window.__fournil; F.SCENE.decosQuartier(F.st.quartier.decos); F.choisirCompagnon('chien'); F.page('boutique'); F.tiroir('ferme'); F.scene({ chat: 'assis' }); }); await sleep(900);
  check(await ev(() => window.__fournil.SCENE.decosVues.includes('chien') && window.__fournil.SCENE.compagnonVu.id === 'chien'), 'un autre compagnon (le chien beige) : le chien du quartier est couché dans son coin (la déco du palier 11)');
  await ev(() => window.__fournil.compagnons()); await sleep(400);
  check(await ev(() => !!document.querySelector('#feuille-contenu [data-cp-choisir="chien-quartier"]') && /Gagné au Quartier/.test(document.querySelector('#feuille-contenu [data-cp="chien-quartier"]').innerText)), 'gagné : la carte du chien du quartier propose « Choisir »');
  await ev(() => { const c = document.querySelector('#feuille-contenu [data-cp="chien-quartier"]'); c.scrollIntoView({ block: 'center' }); }); await sleep(300); await shot('07-feuille-chien-quartier');
  await clic('#feuille-contenu [data-cp-choisir="chien-quartier"]'); await sleep(400);
  check(await ev(() => window.__fournil.st.compagnon === 'chien-quartier' && /Avec toi/.test(document.querySelector('#feuille-contenu [data-cp="chien-quartier"]').innerText)), 'choisi : « Avec toi ✓ »');
  await clic('#feuille-contenu [data-a="cp-fermer"]');
  await ev(() => { const f = window.__fournil; f.page('boutique'); f.tiroir('ferme'); f.scene({ chat: 'assis' }); }); await sleep(1100);
  check(await attendre(async () => { const v = await vu(); return v && v.id === 'chien-quartier' && v.appels <= 5; }), 'il apparaît en 3D dans la boutique (5 appels de dessin au plus)');
  check(await ev(() => !window.__fournil.SCENE.decosVues.includes('chien')), 'et la déco du chien couché disparaît : c’est le même chien, levé pour te suivre (pas deux chiens)');
  await shot('08-boutique-chien-quartier');
  { const zc = await zone(); if (zc) await page.screenshot({ path: path.join(out, '09-zoom-chien-quartier.png'), clip: { x: Math.max(0, zc.x - 70), y: Math.max(0, zc.y - 55), width: 140, height: 100 } }); }
  await ev(() => window.__fournil.scene({ chat: 'marche' })); await sleep(700); { const zc = await zone(); if (zc) await page.screenshot({ path: path.join(out, '10-zoom-chien-quartier-marche.png'), clip: { x: Math.max(0, zc.x - 70), y: Math.max(0, zc.y - 55), width: 140, height: 100 } }); }
  await ev(() => { window.__fournil.st.chat.dernier = 0; window.__cris = []; window.__fournil.scene({ chat: 'assis' }); }); await sleep(500); z = await zone(); await page.touchscreen.tap(z.x, z.y); await sleep(300);
  check(await ev(() => window.__cris.includes('woufgrave') && !window.__cris.includes('wouf')), 'caressé : un « WOUF » plus grave que celui du chien beige (woufgrave)');
  await ev(() => window.__fournil.choisirCompagnon('chien')); await sleep(700);
  check(await ev(() => window.__fournil.SCENE.decosVues.includes('chien')), 'un autre compagnon choisi : il retourne se coucher dans son coin');

  console.log('── la chauve-souris : elle vole près du plafond, se pose pour dormir ──');
  await ev(() => { const f = window.__fournil; f.choisirCompagnon('chauve-souris'); f.page('boutique'); f.tiroir('ferme'); f.scene({ chat: 'assis' }); }); await sleep(1100);
  check(await attendre(async () => { const v = await vu(); return v && v.id === 'chauve-souris' && v.appels <= 5; }), `choisie, elle apparaît en 3D dans la boutique (${(await vu()).appels} appels de dessin : le corps, la tête, les ailes)`);
  const vols = []; for (let k = 0; k < 6; k++) { vols.push(await ev(() => { const S = window.__fournil.SCENE, v = S.compagnonVu, z = S.zones().chat; return { vol: v.vol, zy: z ? z.y : null }; })); await sleep(180); }
  check(vols.every((v) => v.vol > 60) && new Set(vols.map((v) => Math.round(v.vol))).size > 1, `réveillée, elle vole près du plafond, en petits cercles qui montent et descendent (${vols.map((v) => v.vol.toFixed(0)).join(', ')} au-dessus du sol)`);
  await shot('11-boutique-chauve-souris');
  { const zc = await zone(); if (zc) { const f = path.join(out, '12-zoom-chauve-souris.png'); await page.screenshot({ path: f, clip: { x: Math.max(0, zc.x - 70), y: Math.max(0, zc.y - 55), width: 140, height: 100 } }); } }
  if (out2) { fs.copyFileSync(path.join(out, '11-boutique-chauve-souris.png'), path.join(out2, 'bestiaire-chauve-souris.png')); fs.copyFileSync(path.join(out, '12-zoom-chauve-souris.png'), path.join(out2, 'bestiaire-chauve-souris-zoom.png')); }
  const cs0 = await ev(() => { window.__fournil.st.chat.dernier = 0; window.__cris = []; return window.__fournil.st.chat.caresses; }); z = await zone(); await page.touchscreen.tap(z.x, z.y); await sleep(300);
  check(await ev((c) => window.__cris.includes('couic') && window.__fournil.st.chat.caresses === c + 1, cs0), 'sa zone de caresse la suit en vol : touchée, elle couine (« couic »)');
  await ev(() => window.__fournil.scene({ chat: 'dort' })); await sleep(1200);
  const pose = await vu();
  check(pose && pose.vol === 0, 'endormie, elle se pose sur le comptoir, les ailes repliées');
  { const zc = await zone(); if (zc) { const f = path.join(out, '13-zoom-chauve-souris-posee.png'); await page.screenshot({ path: f, clip: { x: Math.max(0, zc.x - 70), y: Math.max(0, zc.y - 55), width: 140, height: 100 } }); if (out2) fs.copyFileSync(f, path.join(out2, 'bestiaire-chauve-souris-posee.png')); } }

  console.log('── la garde-robe y mène ──');
  await ev(() => window.__fournil.choisirCompagnon('pingouin')); await sleep(300);
  await ev(() => window.__fournil.garderobe('tete')); await sleep(400);
  f = await feuille();
  check(/Le compagnon de la boutique/i.test(f) && /Fournaise, pingouin/i.test(f), 'la garde-robe : « Le compagnon de la boutique », Fournaise en pingouin');
  await clic('#feuille-contenu [data-gr-compagnons]'); await sleep(300);
  check(/Les compagnons/.test(await feuille()), 'touchée : la feuille « Les compagnons »');
  await clic('#feuille-contenu [data-a="cp-fermer"]'); await sleep(300);
  check(/Garde-robe/.test(await feuille()), '« Retour » revient à la garde-robe');
  await ev(() => { const b = document.querySelector('#feuille [data-a="gr-fermer"]'); if (b) b.click(); });

  console.log('── les captures : cinq compagnons dans la boutique ──');
  for (const [id, etat] of [['chien', 'assis'], ['poule', 'assis'], ['teckel', 'assis'], ['croissant', 'assis'], ['dragon', 'dort']]) {
    await ev(([i, e]) => { const f = window.__fournil; f.choisirCompagnon(i); f.page('boutique'); f.tiroir('ferme'); f.scene({ chat: e }); }, [id, etat]); await sleep(1100);
    await shot(`05-boutique-${id}`);
    const zc = await zone(); if (zc) await page.screenshot({ path: path.join(out, `06-zoom-${id}.png`), clip: { x: Math.max(0, zc.x - 70), y: Math.max(0, zc.y - 55), width: 140, height: 100 } }); // de près
  }

  console.log('── recharger : le choix est gardé ──');
  await ev(() => { window.__fournil.choisirCompagnon('escargot'); window.__fournil.save(); }); await sleep(300);
  await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(1500);
  s = await ev(() => ({ actif: window.__fournil.st.compagnon, n: window.__fournil.st.compagnons.length, nom: window.__fournil.st.chat && window.__fournil.st.chat.nom }));
  check(s.actif === 'escargot' && s.n === PAYANTS.length && s.nom === 'Fournaise', `rechargée : l’escargot est toujours là, les ${s.n} achats aussi, et son nom`);
  check(await attendre(async () => { const v = await vu(); return v && v.id === 'escargot' && v.appels <= 2; }), 'et l’escargot géant est rebâti en 3D (sans pattes : 2 appels de dessin)');

  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  console.log('captures dans', out);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (compagnons).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
