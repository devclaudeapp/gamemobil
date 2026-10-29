// L'annonce de « La Maison hantée » (src/evenement.js, ficheHantee : t.annonce, revoir) sur la vraie page du Fournil (fournil/ servie en
// local), le mardi 27 octobre 2026 à 13 h (l'événement vient d'ouvrir) :
// · les fichiers : la vidéo de présentation (fournil/media/maison-hantee.mp4 : H.264, ≤ 1,5 Mo) et son affiche (JPEG, ≤ 80 Ko), jamais
//   embarquées dans fournil/index.html ni dans dist/artifact.html ;
// · un téléphone 390 × 844 : au premier lancement pendant l'événement, la feuille d'annonce, la vidéo en tête (muette, en boucle, lue
//   d'elle-même et dans la page, son affiche en attendant), « Comment jouer » en six points (les activités, le ×6 qui s'endort, le
//   bestiaire, les paliers, le classement jusqu'au 15e, les dates), le bouton pour entrer (≥ 44 px), sans défilement de côté ; puis,
//   dans le Manoir, la feuille des paliers et son bouton « Comment ça marche ? » : l'annonce se relit, « C'est compris » ramène aux paliers ;
// · un téléphone 360 × 640 : la même feuille, sans défilement de côté, les boutons ≥ 44 px ; la relecture ;
// · le service worker (autorisé ici) : la vidéo mise en cache à sa première lecture, servie par morceaux (Range → 206), y compris hors ligne ;
// · l'artefact Claude (dist/artifact.html, sans fichiers à côté) : l'annonce sans vidéo, son dessin d'avant, les six points.
// Aucune erreur dans les pages. Captures dans test/shots/hantee-annonce/ (et dans le dossier donné par SHOTS_HANTEE_ANNONCE).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hantee-annonce.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HT = require('../src/hantee.js');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_HANTEE_ANNONCE || 8883;
const out = path.join(__dirname, 'shots', 'hantee-annonce'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_HANTEE_ANNONCE ? (fs.mkdirSync(process.env.SHOTS_HANTEE_ANNONCE, { recursive: true }), process.env.SHOTS_HANTEE_ANNONCE) : null;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = HT.DEBUT + 3600e3, decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const VIDEO = path.join(root, 'fournil', 'media', 'maison-hantee.mp4'), AFFICHE = path.join(root, 'fournil', 'media', 'maison-hantee-affiche.jpg');
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const t = types[path.extname(p)] || 'application/octet-stream', r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (r && (r[1] || r[2])) { const n = d.length, a = r[1] ? +r[1] : Math.max(0, n - +r[2]), b = r[1] && r[2] ? Math.min(+r[2], n - 1) : n - 1; res.writeHead(206, { 'content-type': t, 'content-range': `bytes ${a}-${b}/${n}`, 'accept-ranges': 'bytes', 'content-length': b - a + 1 }); res.end(d.subarray(a, b + 1)); return; }
    res.writeHead(200, { 'content-type': t, 'accept-ranges': 'bytes' }); res.end(d);
  });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 15000) => { for (let t = 0; t < ms; t += 150) { try { const r = await fn(); if (r) return r; } catch (e) { /* rien */ } await sleep(150); } return null; };

(async () => {
  console.log('── les fichiers ──');
  const vd = fs.existsSync(VIDEO) ? fs.readFileSync(VIDEO) : Buffer.alloc(0), af = fs.existsSync(AFFICHE) ? fs.readFileSync(AFFICHE) : Buffer.alloc(0);
  check(vd.length > 100e3 && vd.length <= 1.5 * 1024 * 1024 && vd.subarray(4, 8).toString() === 'ftyp' && vd.includes('avc1') && !vd.includes('mp4a'), `la vidéo : MP4 H.264 (avc1), muette, ${(vd.length / 1024).toFixed(0)} Ko (≤ 1,5 Mo)`);
  check(af.length > 5e3 && af.length <= 80 * 1024 && af[0] === 0xFF && af[1] === 0xD8, `l’affiche : JPEG, ${(af.length / 1024).toFixed(0)} Ko (≤ 80 Ko)`);
  const page0 = fs.readFileSync(path.join(root, 'fournil', 'index.html')), art = fs.readFileSync(path.join(root, 'dist', 'artifact.html'));
  check(![page0, art].some((b) => b.includes('ftypisom') || b.includes('data:video') || b.includes('data:image/jpeg')) && page0.length < 3.3e6 && art.length < 4e6 /* (bornes de bon sens : le boulanger 3D, 28 oct., a ajouté ~230 Ko de code à chacun) */, `ni la page (${(page0.length / 1024).toFixed(0)} Ko) ni l’artefact (${(art.length / 1024).toFixed(0)} Ko) n’embarquent la vidéo ou l’affiche`);

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function telephone(w, h, opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: opts.sw ? 'allow' : 'block' });
    await ctx.addInitScript((d) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; }, decal);
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { errors.push(`${w}×${h} ${e.message}`); console.log('PAGEERROR', e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) errors.push(`${w}×${h} ${m.text()}`); });
    return { ctx, page, ev: (fn, arg) => page.evaluate(fn, arg) };
  }
  const shot = async (page, nom) => { await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); };
  // la feuille ouverte : ce qu'elle montre, et ce qui dépasserait
  const lire = (ev) => ev(() => {
    const f = document.querySelector('#feuille'), c = f.querySelector('.ht-annonce'); if (f.hidden || !c) return null;
    const v = c.querySelector('video'), s = v && v.querySelector('source'), box = c.querySelector('.ht-annonce-media'), rv = v ? v.getBoundingClientRect() : null;
    const boutons = [...c.querySelectorAll('button')].map((b) => ({ a: b.dataset.a, h: Math.round(b.getBoundingClientRect().height), txt: b.innerText.trim() }));
    const deborde = [...c.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5); }).map((e) => e.className || e.tagName);
    return { h2: c.querySelector('h2').textContent, revoir: c.classList.contains('ht-revoir'), video: v ? { muted: v.muted && v.hasAttribute('muted'), playsinline: v.hasAttribute('playsinline'), autoplay: v.hasAttribute('autoplay'), loop: v.hasAttribute('loop'), preload: v.getAttribute('preload'), poster: v.getAttribute('poster'), src: s && s.getAttribute('src'), type: s && s.getAttribute('type'), l: Math.round(rv.width), h: Math.round(rv.height), cache: !!box.hidden } : null,
      scene: !!c.querySelector('.ht-annonce-scene'), titre: (c.querySelector('.ht-regles-titre') || {}).textContent, points: [...c.querySelectorAll('.ht-regles li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()), icones: [...c.querySelectorAll('.ht-regles li .ht-regle-ico svg')].length,
      boutons, deborde, large: f.scrollWidth <= f.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 };
  });
  const pointsOk = (x) => x && x.titre === 'Comment jouer' && x.points.length >= 4 && x.points.length <= 6 && x.icones === x.points.length && /servir|Sers/i.test(x.points.join()) && /×6/.test(x.points.join()) && /bestiaire/i.test(x.points.join()) && /palier/i.test(x.points.join()) && /15 premiers/.test(x.points.join()) && /lundi 2\s+novembre, 20\s+h/.test(x.points.join()) && x.points.every((p) => p.length <= 170);
  const videoOk = (x) => x && x.video && x.video.muted && x.video.playsinline && x.video.autoplay && x.video.loop && x.video.preload === 'auto' && x.video.poster === 'media/maison-hantee-affiche.jpg' && x.video.src === 'media/maison-hantee.mp4' && x.video.type === 'video/mp4' && !x.video.cache && x.video.h >= 200;
  const fermerAutres = (ev) => ev(() => { const f = document.querySelector('#feuille'); if (!f.hidden && !f.querySelector('.ht-annonce')) { const b = f.querySelector('[data-a="close"], [data-a$="tard"], [data-a="ok"], [data-a="non"]'); if (b) b.click(); } });
  const annonceAuLancement = async (ev) => { for (let k = 0; k < 12; k++) { const x = await lire(ev); if (x) return x; await fermerAutres(ev); await ev(() => window.__fournil.annoncerEvenements(true)); await sleep(500); } return null; };

  for (const [w, h] of [[390, 844], [360, 640]]) {
    console.log(`── un téléphone ${w} × ${h} : l’annonce au premier lancement ──`);
    const { ctx, page, ev } = await telephone(w, h);
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900);
    const x = await annonceAuLancement(ev);
    check(!!x && /La Maison hantée ouvre ses portes/.test(x.h2) && !x.revoir, `la feuille d’annonce s’ouvre d’elle-même (« ${x && x.h2} »)`);
    check(videoOk(x), `la vidéo en tête : muette, en ligne, lue d’elle-même, en boucle, préchargée, son affiche (${x && x.video && `${x.video.src}, ${x.video.poster}, ${x.video.l}×${x.video.h} px`})`);
    const media = await ev(() => new Promise((ok) => { const i = new Image(); i.onload = () => ok({ affiche: i.naturalWidth, video: document.querySelector('#feuille video').currentSrc || '' }); i.onerror = () => ok({ affiche: 0 }); i.src = document.querySelector('#feuille video').getAttribute('poster'); }));
    check(media.affiche >= 300 && !(await ev(() => document.querySelector('#feuille .ht-annonce-media').hidden)), `l’affiche se charge (${media.affiche} px de large) et reste à sa place tant que la vidéo n’est pas lue`);
    check(pointsOk(x), `« Comment jouer » en ${x && x.points.length} points, chacun son icône : ${x && x.points.map((p) => `« ${p.slice(0, 34)}… »`).join(' ')}`);
    const entrer = x && x.boutons.find((b) => b.a === 'pq-entrer'), tard = x && x.boutons.find((b) => b.a === 'pq-tard');
    check(entrer && tard && entrer.h >= 44 && tard.h >= 44 && /Manoir/i.test(entrer.txt), `les boutons « ${entrer && entrer.txt} » (${entrer && entrer.h} px) et « ${tard && tard.txt} » (${tard && tard.h} px)`);
    check(x && x.large && !x.deborde.length, `rien ne dépasse de côté à ${w} px ${x && x.deborde.slice(0, 3).join(' ')}`);
    await sleep(400); await shot(page, `annonce-${w}`);
    await ev(() => { document.querySelector('#feuille').scrollTop = 1e6; }); await sleep(300); await shot(page, `annonce-${w}-bas`);
    check(await ev(() => window.__fournil.st[window.__fournil.evHantee.cle].annonce === true), 'annoncée une fois (notée dans la sauvegarde)');
    await page.locator('#feuille [data-a="pq-entrer"]').tap(); await sleep(1200);
    check(await ev(() => !document.querySelector('#hantee').hidden && document.querySelector('#hantee').dataset.ecran === 'manoir'), 'le bouton ouvre le Manoir');
    console.log('── « Comment ça marche ? » : l’annonce se relit ──');
    await ev(() => { for (const b of document.querySelectorAll('#feuille [data-a="pq-ok"]')) b.click(); }); await sleep(300);
    await page.locator('#hantee [data-pq="paliers"]').tap(); await sleep(500);
    const aide = await ev(() => { const b = document.querySelector('#feuille [data-a="pq-revoir"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { txt: b.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(r.height), dans: r.left >= 0 && r.right <= innerWidth + 0.5, haut: r.top < innerHeight }; });
    check(aide && /Comment ça marche/.test(aide.txt) && aide.h >= 44 && aide.dans && aide.haut && /Les paliers/.test(await ev(() => document.querySelector('#feuille-contenu').innerText)), `la feuille des paliers : le bouton « ${aide && aide.txt} » (${aide && aide.h} px), visible en haut`);
    if (w === 390) await shot(page, 'paliers-aide-390');
    await page.locator('#feuille [data-a="pq-revoir"]').tap(); await sleep(600);
    const y = await lire(ev);
    check(y && y.revoir && /Comment ça marche/.test(y.h2) && videoOk(y) && pointsOk(y), `la relecture : « ${y && y.h2} », la vidéo, les ${y && y.points.length} points`);
    const compris = y && y.boutons.find((b) => b.a === 'pq-compris');
    check(compris && compris.h >= 44 && !y.boutons.some((b) => b.a === 'pq-entrer' || b.a === 'pq-tard') && y.large && !y.deborde.length, `un seul bouton, « ${compris && compris.txt} » (${compris && compris.h} px), rien ne dépasse`);
    await sleep(300); await shot(page, `revoir-${w}`);
    await page.locator('#feuille [data-a="pq-compris"]').tap(); await sleep(500);
    check(/Les paliers/.test(await ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText))), '« C’est compris » ramène à la feuille des paliers');
    await ev(() => document.querySelector('#feuille [data-a="pq-retour"]').click()); await sleep(300);
    check(await ev(() => window.__fournil.evHantee.revoir() === true && !!document.querySelector('#feuille .ht-revoir')), 'evHantee.revoir() : la relecture s’ouvre aussi d’ailleurs');
    await ev(() => document.querySelector('#feuille [data-a="pq-compris"]').click()); await sleep(300);
    check(await ev(() => document.querySelector('#feuille').hidden), 'et se referme');
    await ctx.close();
  }

  console.log('── le service worker : la vidéo en cache à sa première lecture, par morceaux, hors ligne aussi ──');
  {
    const { ctx, page, ev } = await telephone(390, 844, { sw: true });
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
    await ev(() => navigator.serviceWorker.ready.then(() => true));
    if (!(await attendre(() => ev(() => !!navigator.serviceWorker.controller), 5000))) { await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); }
    check(await ev(() => !!navigator.serviceWorker.controller), 'le service worker du jeu tient la page');
    const morceau = (r) => ev(async (r) => { const res = await fetch('media/maison-hantee.mp4', { headers: { Range: r } }); const b = await res.arrayBuffer(); return { s: res.status, cr: res.headers.get('content-range'), n: b.byteLength, debut: Array.from(new Uint8Array(b.slice(4, 8))).map((c) => String.fromCharCode(c)).join('') }; }, r);
    const a = await morceau('bytes=0-99'), taille = vd.length;
    check(a.s === 206 && a.n === 100 && a.cr === `bytes 0-99/${taille}` && a.debut === 'ftyp', `un morceau demandé (Range: bytes=0-99) : ${a.s}, ${a.n} octets, « ${a.cr} »`);
    const enCache = await attendre(() => ev(async () => { for (const k of await caches.keys()) { if (!k.startsWith('fournil-jeu-')) continue; const r = await (await caches.open(k)).match(new URL('media/maison-hantee.mp4', location.href).href); if (r) return (await r.arrayBuffer()).byteLength; } return 0; }), 8000);
    check(enCache === taille, `la vidéo est en cache, entière (${enCache} octets)`);
    await ctx.setOffline(true);
    const b = await morceau(`bytes=${taille - 50}-`), c = await morceau('bytes=1000-1999');
    check(b.s === 206 && b.n === 50 && b.cr === `bytes ${taille - 50}-${taille - 1}/${taille}` && c.s === 206 && c.n === 1000, `hors ligne : les morceaux viennent de la copie (${b.cr} ; ${c.cr})`);
    const aff = await ev(async () => { try { const r = await fetch('media/maison-hantee-affiche.jpg'); return r.status; } catch (e) { return 0; } });
    await page.reload(); const horsLigne = await attendre(() => ev(() => !!(window.__fournil && window.__fournil.st)), 20000);
    check(horsLigne && aff === 200, `hors ligne, le jeu se recharge (copie en cache) et l’affiche est là (${aff})`);
    await ctx.setOffline(false); await ctx.close();
  }

  console.log('── l’artefact Claude : sans fichiers, l’annonce sans vidéo ──');
  {
    const { ctx, page, ev } = await telephone(390, 844);
    await page.goto(`http://localhost:${PORT}/dist/artifact.html`); await page.waitForFunction(() => typeof EVENEMENTS !== 'undefined' && document.querySelector('#feuille'), null, { timeout: 30000 }); await sleep(1500);
    const x = await attendre(async () => { await fermerAutres(ev); await ev(() => EVENEMENTS.annoncer(true)); return lire(ev); }, 15000);
    check(x && !x.video && x.scene && pointsOk(x) && x.boutons.some((b) => b.a === 'pq-entrer') && x.large, `l’annonce de l’artefact : pas de vidéo (aucun fichier), le dessin du manoir, les ${x && x.points.length} points, le bouton`);
    await shot(page, 'artefact-annonce');
    await ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.slice(0, 5).join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', e && e.stack || e); process.exit(1); });
