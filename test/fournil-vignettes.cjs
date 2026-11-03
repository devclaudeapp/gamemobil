// Les vignettes du carnet dans la vraie page du Fournil (fournil/ servi en local), sur un iPhone 390 × 844, service worker compris :
// 1. une partie qui n'a pas trouvé l'arrière-salle : « Mes décos » n'en dit rien, ni ses deux familles ni une de ses images (comme l'étagère
//    des trophées) ; la petite porte trouvée, ses deux familles arrivent au carnet ;
// 2. le service worker met chaque vignette vue en cache à sa première vue, une seule copie par vignette : une vignette recuite (une autre
//    empreinte, ?v=) remplace l'ancienne ;
// 3. hors ligne, avant leur mise en cache : il répond 204, l'image échoue sans aucune erreur dans la console et ce qu'il y avait avant les
//    vignettes revient tel quel : l'étagère, sa carte d'avant (pas de colonne vide, la coupe dans le coin si le trophée est gagné) ; le carnet
//    du croupier, la coupe sur le gris pâli (pas gagné) ou sur le beurre (gagné) ; ses skins, l'aperçu dessiné, grisé une seule fois ; ce qui
//    est déjà en cache s'affiche, une vignette recuite garde sa copie d'avant ;
// 4. un fichier absent du serveur (404), sans service worker : les mêmes replis, au même style ; les autres vignettes chargées (256 px),
//    grisées tant que l'objet n'est pas gagné.
// Captures dans test/shots/vignettes/ (ou CAPTURES_VIGNETTES).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-vignettes.cjs   (PORT_VIGNETTES, défaut 8893)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_VIGNETTES || 8893, BASE = `http://localhost:${PORT}`;
const out = process.env.CAPTURES_VIGNETTES || path.join(__dirname, 'shots', 'vignettes'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { try { if (await f()) return true; } catch (e) { /* la page se recharge */ } await sleep(150); } return false; };
// le serveur : coupe (hors ligne : il ne répond plus), manquants (ces fichiers : 404), chaque vignette demandée notée
let coupe = false; const manquants = new Set(), demandees = [];
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (coupe) { req.socket.destroy(); return; }
  if (p.includes('/img/carnet/')) demandees.push(req.url);
  if (manquants.has(p)) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
}).listen(PORT);
const TAILLE_NEON = fs.statSync(path.join(root, 'fournil', 'img', 'carnet', 'quartier', 'neon.webp')).size;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const nouveau = async (sw) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: sw ? 'allow' : 'block' });
    await ctx.addInitScript(() => { window.__sansEvenements = true; window.__sansQuartier = true; });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage(), journal = { erreurs: [], reseau: [] };
    page.on('pageerror', (e) => journal.erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() !== 'error') return; const t = `${m.text()} @ ${(m.location() && m.location().url) || ''}`; if (/img\/carnet/.test(t)) journal.reseau.push(t); else if (!/googleapis|gstatic|ERR_|supabase|404/.test(t)) journal.erreurs.push(t); });
    return { ctx, page, journal };
  };
  let page = null; const ev = (f, a) => page.evaluate(f, a);
  const fermerFeuille = () => ev(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); });
  const ouvrir = async () => {
    await page.goto(`${BASE}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 60000 }); await sleep(900);
    await fermerFeuille(); await ev(() => { const f = window.__fournil; f.st.tuto = 99; f.st.chatAttente = 1e9; });
  };
  // l'état : quelques objets gagnés partout (le néon et le tag du Quartier, deux trophées ; l'arrière-salle trouvée : deux de ses trophées)
  const gagner = (trouvee) => ev((trouvee) => {
    const f = window.__fournil, st = f.st, t = Date.now();
    st.quartier = Object.assign(st.quartier || {}, { decos: ['neon', 'graffiti'] }); st.trophees = { premiere: t, cent: t };
    if (trouvee) { st.arriere = st.arriere || {}; st.arriere.trouvee = true; const c = CASINO.etat(st); c.trophees = Object.assign(c.trophees || {}, { 'premiere-main': 1, zero: 1 }); }
    f.save();
  }, trouvee);
  const toutesChargees = (sel) => attendre(() => ev((s) => [...document.querySelectorAll(s)].every((i) => i.complete), sel), 30000); // (30 s : l'étagère compte 59 cartes depuis le lot « progression », et la machine peut être chargée)
  const defiler = async (sel) => { const n = await ev((s) => document.querySelectorAll(s).length, sel); for (let i = 0; i < n; i++) { await ev(([s, i]) => { const x = document.querySelectorAll(s)[i]; if (x) x.scrollIntoView({ block: 'center' }); }, [sel, i]); await sleep(25); } };
  const carnet = async (tout) => { // Mes décos ; tout : chaque famille dépliée, chaque objet amené à l'écran (les images paresseuses se chargent)
    await fermerFeuille(); await ev(() => window.__fournil.chaine.carnet(0)); await sleep(500);
    if (tout) { await ev(() => document.querySelectorAll('#feuille details').forEach((d) => { d.open = true; })); await defiler('#feuille .cn-objet'); }
    await toutesChargees('#feuille img.vig'); await sleep(300);
  };
  const etagere = async () => {
    await fermerFeuille(); await ev(() => { window.__fournil.page('boulanger'); window.__fournil.tiroir('ouvert'); }); await sleep(700);
    await ev(() => document.querySelectorAll('details.repli').forEach((d) => { d.open = true; })); await defiler('.troph'); await toutesChargees('.troph img.vig'); await sleep(300);
  };
  const croupier = async (onglet) => {
    if (!(await ev(() => window.__fournil.arriere() && window.__fournil.arriere().ouvert))) { await ev(() => window.__fournil.ouvrirArriere()); await sleep(1200); }
    await ev(() => { const b = document.querySelector('#arriere .ar-dialogue [data-ar="ok"], .ar-boite [data-ar="ok"]'); if (b) b.click(); }); await sleep(300);
    if (!(await ev(() => !!document.querySelector('[data-onglet]')))) { await ev(() => document.querySelector('[data-ar="carnet"]').click()); await sleep(400); }
    await ev((o) => document.querySelector(`[data-onglet="${o}"]`).click(), onglet); await sleep(400);
    await defiler(onglet === 'skins' ? '.ar-skin' : '.ar-trophs li'); await toutesChargees(onglet === 'skins' ? '.ar-skin img.vig' : '.ar-trophs img.vig'); await sleep(300);
  };
  const enCache = () => ev(async () => { const l = []; for (const k of await caches.keys()) { if (!k.startsWith('fournil-jeu-')) continue; for (const r of await (await caches.open(k)).keys()) { const u = new URL(r.url); if (u.pathname.includes('/img/carnet/')) l.push(u.pathname.replace(/^.*\/img\/carnet\//, '') + u.search); } } return l; });
  // ce qui se voit des trois replis : la carte de l'étagère, la pastille d'un trophée du croupier, l'aperçu d'un skin
  const lireEtagere = () => ev(() => [...document.querySelectorAll('.troph')].map((c) => { const b = c.querySelector('b'), ico = c.querySelector(':scope > .ico'), im = c.querySelector('img.vig'), r = c.getBoundingClientRect();
    return { nom: b.textContent, gagne: c.classList.contains('gagne'), vig: c.classList.contains('avec-vig'), colonne: !!c.querySelector('.troph-vig'), img: !!im, ok: !!(im && im.complete && im.naturalWidth === 256), gris: !!(im && im.classList.contains('gris')), ico: !!ico, icoAbs: !!ico && getComputedStyle(ico).position === 'absolute', retrait: Math.round(b.getBoundingClientRect().left - r.left) }; }));
  const lireTrophees = () => ev(() => [...document.querySelectorAll('.ar-trophs li')].map((l) => { const p = l.querySelector('.pic'), im = l.querySelector('img.vig'), cs = getComputedStyle(p);
    return { id: l.dataset.trophee, gagne: l.classList.contains('gagne'), img: !!im, ok: !!(im && im.complete && im.naturalWidth === 256), gris: !!(im && im.classList.contains('gris')), classeImg: p.classList.contains('img'), svg: !!p.querySelector(':scope > svg'), op: cs.opacity, fond: cs.backgroundColor }; }));
  const lireSkins = () => ev(() => [...document.querySelectorAll('.ar-skin')].map((s) => { const aps = s.querySelectorAll('.ap'), im = s.querySelector('img.vig');
    return { id: s.dataset.skin, verrou: s.classList.contains('verrou'), aps: aps.length, classe: aps[0] ? aps[0].className : '', img: !!im, ok: !!(im && im.complete && im.naturalWidth === 256), op: aps[0] ? getComputedStyle(aps[0]).opacity : '' }; }));
  // les replis, au style d'avant les vignettes : la carte de l'étagère (le texte au bord, pas après une colonne vide ; la coupe dans le coin si
  // gagné, rien sinon) ; la pastille du croupier (la coupe sur le beurre, gagné, ou sur le gris pâli à 0,55) ; l'aperçu dessiné du skin (un seul
  // .ap, grisé une seule fois : 0,6 s'il est verrouillé)
  const repliEtagere = (c) => !c.vig && !c.colonne && !c.img && c.retrait <= 14 && (c.gagne ? c.icoAbs : !c.ico);
  const repliTrophee = (t, beurre) => !t.img && !t.classeImg && t.svg && (t.gagne ? t.op === '1' && t.fond === beurre : t.op === '0.55' && t.fond !== beurre && t.fond !== 'rgba(0, 0, 0, 0)');
  const repliSkin = (s) => !s.img && s.aps === 1 && !/ap-img/.test(s.classe) && s.op === (s.verrou ? '0.6' : '1');
  const beurre = () => ev(() => { const d = document.createElement('i'); d.style.background = 'var(--beurre)'; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; });

  // ─── 1. une partie neuve, l'arrière-salle pas encore trouvée ; le service worker s'installe ───
  console.log('── une partie neuve : Mes décos ne dit rien de l’arrière-salle ──');
  let s = await nouveau(true); page = s.page; const J = s.journal;
  await ouvrir();
  check(await attendre(() => ev(() => navigator.serviceWorker.ready.then((r) => !!r.active)), 30000), 'le service worker du jeu est installé (fournil/sw.js)');
  await ouvrir(); if (!(await ev(() => !!navigator.serviceWorker.controller))) await ouvrir();
  check(await ev(() => !!navigator.serviceWorker.controller), 'il tient la page');
  await gagner(false); await carnet(false); // (sans déplier les « à gagner » : leurs vignettes restent jamais vues, la partie 3 en a besoin)
  const c1 = await ev(() => { const fam = CHAINE.carnet(window.__fournil.st, null, null), siens = CASINO.TROPHEES.filter((t) => t.recompense && t.recompense.titre).length, total = fam.reduce((k, f) => k + f.total, 0) - siens;
    return { trouvee: !!(window.__fournil.st.arriere && window.__fournil.st.arriere.trouvee), familles: [...document.querySelectorAll('#feuille .cn-famille:not(.avenir)')].map((f) => f.dataset.famille), images: [...document.querySelectorAll('#feuille img.vig')].map((i) => i.getAttribute('src')), texte: document.querySelector('#feuille').textContent, sous: document.querySelector('#feuille .ch-fiche-tete .sous').textContent, total }; });
  check(!c1.trouvee && c1.familles.length >= 10 && !c1.familles.some((f) => /^casino-/.test(f)) && !c1.images.some((x) => /casino-/.test(x)) && !/arrière-salle/.test(c1.texte), `pas trouvée : ni ses deux familles, ni une de ses images, ni son nom (pas même le titre « Main de velours », qui la nomme) : ${c1.familles.length} familles, ${c1.images.length} images`);
  check(c1.images.length > 0 && c1.sous.includes(`/${c1.total} objets`), `le compte du carnet sans elle : « ${c1.sous} »`);
  await fermerFeuille(); await ev(() => window.__fournil.page('boulanger')); await sleep(300);
  check(await ev(() => !document.querySelector('[data-trophee-ar]') && !document.querySelector('.troph-ar')), 'l’étagère des trophées n’en dit rien non plus');
  await gagner(true); await carnet(false);
  const c2 = await ev(() => [...document.querySelectorAll('#feuille .cn-famille:not(.avenir)')].map((f) => f.dataset.famille));
  const titre = await ev(() => /Main de velours/.test(document.querySelector('#feuille [data-famille="titres"]').textContent));
  check(c2.includes('casino-trophees') && c2.includes('casino-skins') && c2.length === c1.familles.length + 2 && titre, `la petite porte trouvée : ses deux familles et son titre arrivent au carnet (${c2.length} familles)`);

  // ─── 2. le cache du service worker : une copie par vignette ───
  console.log('── le service worker : une seule copie par vignette ──');
  await attendre(async () => (await enCache()).some((x) => /^quartier\/neon\.webp\?/.test(x)), 8000); // (la mise en cache suit la réponse, sans l'attendre)
  let cache = await enCache(); const neon = cache.filter((x) => /^quartier\/neon\.webp\?/.test(x));
  const parChemin = new Map(); for (const x of cache) { const p = x.split('?')[0]; parChemin.set(p, (parChemin.get(p) || 0) + 1); }
  check(cache.length > 0 && neon.length === 1 && [...parChemin.values()].every((n) => n === 1), `les vignettes vues sont en cache, une copie chacune (${cache.length} : ${cache.slice(0, 3).join(', ')}…)`);
  await ev(() => fetch('img/carnet/quartier/neon.webp?v=recuite').then((r) => r.blob())); // (une recuisson : le même fichier, une autre empreinte)
  check(await attendre(async () => { const l = (await enCache()).filter((x) => /^quartier\/neon\.webp\?/.test(x)); return l.length === 1 && l[0].endsWith('?v=recuite'); }, 8000), 'une vignette recuite (?v= nouveau) remplace l’ancienne dans le cache : une seule copie, la nouvelle');

  // ─── 3. hors ligne : les vignettes jamais vues, sans erreur ; leur repli au style d'avant ───
  console.log('── hors ligne, avant la mise en cache : 204, aucune erreur, le repli d’avant ──');
  await fermerFeuille(); cache = await enCache(); const vues = new Set(cache.map((x) => x.split('?')[0]));
  await s.ctx.setOffline(true); coupe = true; J.reseau.length = 0;
  const r1 = await ev(() => fetch('img/carnet/quartier/neon.webp?v=horsligne').then(async (r) => ({ s: r.status, n: (await r.arrayBuffer()).byteLength })).catch((e) => ({ s: -1, e: String(e) })));
  check(r1.s === 200 && r1.n === TAILLE_NEON, `une vignette recuite pas encore vue, hors ligne : sa copie d'avant (${r1.s}, ${r1.n} octets)`);
  const r2 = await ev(() => fetch('img/carnet/trophees/million.webp?v=jamais').then((r) => r.status).catch(() => -1));
  check(r2 === 204 && !vues.has('trophees/million.webp'), `une vignette jamais vue, hors ligne : réponse vide (${r2}), l'image échouera sans bruit`);
  const B = await beurre(), chemins = await ev(() => Object.fromEntries([...GAME.TROPHEES.map((t) => [t.nom, `trophees/${t.id}.webp`]), ...CASINO.TROPHEES.map((t) => [t.nom, `casino-trophees/${t.id}.webp`])]));
  await etagere(); const e1 = await lireEtagere(); // (chaque carte : sa vignette si elle a été vue en ligne, dans le cache ; sinon sa carte d'avant)
  const e1ko = e1.filter((c) => (vues.has(chemins[c.nom]) ? !(c.ok && c.vig && c.gris === !c.gagne) : !repliEtagere(c))), e1r = e1.filter((c) => !vues.has(chemins[c.nom]));
  // (toutes les cartes : les trophées du jeu, 48 depuis le lot « progression » — 37 avant —, et les 11 de l'arrière-salle, trouvée ici : gagnés ou à gagner)
  const nE = await ev(() => GAME.TROPHEES.length + CASINO.TROPHEES.length);
  check(e1.length === nE && e1r.some((c) => !c.gagne) && !e1ko.length, `l’étagère hors ligne (${e1.length} cartes sur ${nE}) : ${e1r.length} cartes d’avant (le texte au bord, la coupe dans le coin si gagné), ${e1.length - e1r.length} vignettes du cache${e1ko.length ? ' — ' + e1ko.slice(0, 3).map((c) => JSON.stringify(c)).join(' ') : ''}`);
  await page.screenshot({ path: path.join(out, 'hors-ligne-etagere.png') });
  await fermerFeuille(); await croupier('trophees'); const t1 = await lireTrophees();
  const t1ko = t1.filter((t) => (vues.has(`casino-trophees/${t.id}.webp`) ? !(t.ok && t.gris === !t.gagne) : !repliTrophee(t, B))), t1r = t1.filter((t) => !vues.has(`casino-trophees/${t.id}.webp`));
  check(t1.length === 11 && t1r.some((t) => !t.gagne) && !t1ko.length, `le carnet du croupier hors ligne : ${t1r.length} coupes d’avant (gagné : sur le beurre ${B} ; sinon sur le gris, à 0,55)${t1ko.length ? ' — ' + t1ko.slice(0, 3).map((t) => JSON.stringify(t)).join(' ') : ''}`);
  await page.screenshot({ path: path.join(out, 'hors-ligne-croupier-trophees.png') });
  await croupier('skins'); const k1 = await lireSkins();
  const k1v = k1.filter((x) => !/^croupier:/.test(x.id)), vueSkin = (x) => vues.has(`casino-skins/${x.id.replace(':', '-')}.webp`);
  const k1r = k1v.filter((x) => !vueSkin(x)), k1ko = k1v.filter((x) => (vueSkin(x) ? !(x.ok && x.aps === 1) : !repliSkin(x)));
  check(k1r.length >= 4 && k1r.some((x) => x.verrou) && !k1ko.length, `ses skins hors ligne : ${k1r.length} aperçus dessinés, un seul .ap chacun, grisés une fois (0,6) s’ils sont verrouillés${k1ko.length ? ' — ' + k1ko.slice(0, 3).map((x) => JSON.stringify(x)).join(' ') : ''}`);
  await page.screenshot({ path: path.join(out, 'hors-ligne-croupier-skins.png') });
  await ouvrir(); await gagner(true); await carnet(false); // (rechargée hors ligne, la page vient du cache du service worker ; l'état du test est redonné, comme au début)
  const m1 = await ev(() => { const im = [...document.querySelectorAll('#feuille img.vig')], neon = im.find((x) => /quartier\/neon\.webp/.test(x.src)); return { neon: !!(neon && neon.complete && neon.naturalWidth === 256), charges: im.filter((i) => i.complete && i.naturalWidth === 256).length }; });
  check(m1.neon && m1.charges > 1, `Mes décos hors ligne : les vignettes déjà vues s’affichent (${m1.charges}), le néon recuit par sa copie d'avant ; les autres ont leur icône`);
  check(!J.reseau.length, `aucune erreur réseau des vignettes dans la console, hors ligne${J.reseau.length ? ' — ' + J.reseau.slice(0, 3).join(' | ') : ''}`);
  await s.ctx.setOffline(false); coupe = false;
  check(!J.erreurs.length, `aucune erreur dans la page${J.erreurs.length ? ' — ' + J.erreurs.slice(0, 3).join(' | ') : ''}`);
  await s.ctx.close();

  // ─── 4. un fichier absent du serveur (404), sans service worker ───
  console.log('── un fichier qui manque (404) : le même repli ──');
  for (const f of ['trophees/cent', 'trophees/million', 'casino-trophees/zero', 'casino-trophees/plein', 'casino-skins/tapis-bordeaux', 'quartier/neon']) manquants.add(`/fournil/img/carnet/${f}.webp`);
  s = await nouveau(false); page = s.page;
  await ouvrir(); await gagner(true); await carnet(true);
  const m2 = await ev(() => { const l = [...document.querySelectorAll('#feuille .cn-objet')]; return { n: l.length, img: l.filter((x) => x.querySelector('img.vig')).length, ok: l.filter((x) => { const i = x.querySelector('img.vig'); return i && i.complete && i.naturalWidth === 256; }).length,
    incoherent: l.filter((x) => { const i = x.querySelector('img.vig'); return i && i.classList.contains('gris') !== x.classList.contains('gris'); }).length,
    neon: (() => { const x = l.find((y) => /néon/i.test(y.querySelector('.t b').textContent)); const v = x && x.querySelector('.cn-vig'); return v ? { img: !!v.querySelector('img'), ico: !!v.querySelector('.ico svg'), gris: v.classList.contains('gris') } : null; })() }; });
  check(m2.n >= 160 && m2.img === m2.ok && m2.ok >= 140 && !m2.incoherent, `Mes décos : ${m2.ok} vignettes chargées (256 px), grisées seulement tant que l’objet n’est pas gagné, sur ${m2.n} objets`);
  check(m2.neon && !m2.neon.img && m2.neon.ico && !m2.neon.gris, 'le néon (gagné), son fichier manquant : son icône, pas grisée');
  await etagere(); const e2 = await lireEtagere(), cent = e2.find((c) => c.nom === 'Cent fournées'), million = e2.find((c) => c.nom === 'Le million');
  check(cent && cent.gagne && repliEtagere(cent) && million && !million.gagne && repliEtagere(million), `l’étagère : « Cent fournées » (gagné) et « Le million » (pas encore), leurs cartes d’avant (${JSON.stringify(million)})`);
  check(e2.filter((c) => c.img).every((c) => c.ok && c.vig && c.gris === !c.gagne) && e2.filter((c) => c.img).length === e2.length - 4, `les autres cartes gardent leur vignette (${e2.filter((c) => c.img).length})`);
  await page.screenshot({ path: path.join(out, 'manque-etagere.png') });
  await fermerFeuille(); await croupier('trophees'); const t2 = await lireTrophees(), B2 = await beurre(), zero = t2.find((t) => t.id === 'zero'), plein = t2.find((t) => t.id === 'plein');
  check(zero && zero.gagne && repliTrophee(zero, B2) && plein && !plein.gagne && repliTrophee(plein, B2), `le croupier : « Le zéro » (gagné) sur le beurre, « Plein ! » (pas gagné) sur le gris à ${plein && plein.op}, la coupe dessinée (${JSON.stringify(plein)})`);
  check(t2.filter((t) => t.img).every((t) => t.ok && t.gris === !t.gagne) && t2.filter((t) => t.img).length === 9, 'les neuf autres trophées gardent leur vignette, grisée tant qu’ils ne sont pas gagnés');
  await page.screenshot({ path: path.join(out, 'manque-croupier-trophees.png') });
  await croupier('skins'); const k2 = await lireSkins(), bordeaux = k2.find((x) => x.id === 'tapis:bordeaux');
  check(bordeaux && bordeaux.verrou && repliSkin(bordeaux) && /ap-tapis/.test(bordeaux.classe), `le tapis bordeaux (verrouillé) : son aperçu dessiné, un seul .ap, à ${bordeaux && bordeaux.op} (grisé une seule fois)`);
  check(k2.filter((x) => !/^croupier:/.test(x.id) && x.id !== 'tapis:bordeaux').every((x) => x.ok && x.aps === 1 && /ap-img/.test(x.classe)), 'les autres skins gardent leur vignette');
  await page.screenshot({ path: path.join(out, 'manque-croupier-skins.png') });
  check(!s.journal.erreurs.length, `aucune erreur dans la page${s.journal.erreurs.length ? ' — ' + s.journal.erreurs.slice(0, 3).join(' | ') : ''}`);
  await s.ctx.close();

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\ntout est vert');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('ÉCHEC', e); server.close(); process.exit(1); });
