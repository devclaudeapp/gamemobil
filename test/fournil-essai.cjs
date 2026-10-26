// La version d'essai (fournil-essai/, « Ma chaîne de boutiques ») à côté du vrai jeu (fournil/), sur la même origine, comme sur GitHub Pages.
// Une vraie partie est en place (toutes les clés « fournil.* » et la base IndexedDB « fournil » remplies). Ouvrir l'essai copie la partie
// (en lecture seule), puis on y joue, on entre dans une boutique de la chaîne, on recharge. Ce qui doit tenir :
//   - toutes les clés du vrai jeu restent identiques octet pour octet, et la base « fournil » aussi (relue) ;
//   - l'essai n'écrit que des clés « fournil.essai.* » et sa base « fournil-essai » ;
//   - aucune requête vers supabase.co (pas de config.js : classement, pourboires, notifications, tchat coupés d'office) ;
//   - aucun service worker, ni manifeste (elle ne s'installe pas), pas indexée ; le bandeau « Version d'essai » ;
//   - la redirection (servie ailleurs : vers fournil-essai/) ; version.json relu sous fournil-essai/ ;
//   - puis le vrai jeu rouvert : sa partie intacte ; un iPhone sans vraie partie (stockage séparé) : la feuille « coller le code ».
// Lancer : node build.js && node build.js --essai && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-essai.cjs
'use strict';
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_ESSAI || 8879, BASE = `http://localhost:${PORT}`;
const out = path.join(__dirname, 'shots', 'essai'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
const versions = []; // les version.json demandés (chemin)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (/version\.json$/.test(p)) versions.push(p);
  if (p === '/ailleurs/copie.html') p = '/fournil-essai/index.html'; // l'essai servi à une autre adresse (une vieille copie) : sa redirection
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (f, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await f()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };
// tout le stockage de l'origine : localStorage (clé → valeur), et chaque base IndexedDB avec le contenu de chaque magasin (lu sans rien créer)
const STOCKAGE = async () => {
  const ls = {}; for (let k = 0; k < localStorage.length; k++) { const c = localStorage.key(k); ls[c] = localStorage.getItem(c); }
  const bases = {};
  for (const d of (indexedDB.databases ? await indexedDB.databases() : [])) {
    bases[d.name] = await new Promise((res) => {
      const r = indexedDB.open(d.name); r.onupgradeneeded = () => r.transaction.abort();
      r.onerror = () => res(null);
      r.onsuccess = () => { const db = r.result, o = {}, noms = [...db.objectStoreNames]; if (!noms.length) { db.close(); res(o); return; }
        const t = db.transaction(noms); let n = noms.length;
        for (const s of noms) { const q = t.objectStore(s).getAllKeys(), v = t.objectStore(s).getAll(); v.onsuccess = () => { o[s] = q.result.map((k, i) => [k, v.result[i]]); if (--n === 0) { db.close(); res(o); } }; } };
    });
  }
  return { ls, bases };
};

(async () => {
  for (const f of ['fournil/index.html', 'fournil-essai/index.html', 'fournil-essai/version.json']) check(fs.existsSync(path.join(root, f)), `${f} construit (node build.js && node build.js --essai)`);
  const html = fs.readFileSync(path.join(root, 'fournil-essai', 'index.html'), 'utf8'), vraie = fs.readFileSync(path.join(root, 'fournil', 'index.html'), 'utf8');
  const tete = html.slice(0, html.indexOf('<style>'));
  check(!/rel="manifest"|apple-mobile-web-app-capable|src="config\.js"/.test(html) && !/serviceWorker\.register/.test(html) && /serviceWorker\.register/.test(vraie) && /<meta name="robots" content="noindex">/.test(tete) && /<title>Le Fournil — essai<\/title>/.test(tete),
    'le gabarit de l’essai : ni manifeste, ni « app » d’écran d’accueil, ni config.js, ni service worker ; noindex ; titre « Le Fournil — essai »');
  check(/window\.FOURNIL_ESSAI = \{ prefixe: 'fournil\.essai\.', db: 'fournil-essai'/.test(tete) && /window\.FOURNIL_CLE = window\.FOURNIL_CLE \|\| \(\(k\) => k\);/.test(vraie) && !/FOURNIL_ESSAI = /.test(vraie), 'FOURNIL_ESSAI et FOURNIL_CLE posés en tête de l’essai, avant les scripts ; le vrai jeu garde ses clés telles quelles');
  check(JSON.parse(fs.readFileSync(path.join(root, 'fournil-essai', 'version.json'), 'utf8')).v === (html.match(/FOURNIL_VERSION = '([0-9a-f]{12})'/) || [])[1], 'fournil-essai/version.json : la version de la page d’essai');
  check(['hd', 'modeles', 'sons'].every((d) => fs.existsSync(path.join(root, 'fournil-essai', d)) && fs.readdirSync(path.join(root, 'fournil-essai', d)).length === fs.readdirSync(path.join(root, 'fournil', d)).length), 'hd/, modeles/ et sons/ copiés dans fournil-essai/ (les chemins relatifs du jeu marchent)');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'allow' });
  await ctx.addInitScript(() => { window.__sansEvenements = true; });
  const supabase = []; await ctx.route(/supabase\.co/, (r) => { supabase.push(r.request().url()); r.abort(); }); // le vrai jeu en a une (config.js) ; l'essai jamais
  const erreurs = [];
  const ouvrir = async (url) => {
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`${url} : ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404|Failed to load resource/.test(m.text() + (m.location() && m.location().url))) erreurs.push(`${url} : ${m.text()}`); });
    await page.goto(BASE + url); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
    return page;
  };
  // le stockage relu depuis une page neutre de la même origine, une fois les pages du jeu fermées (en se fermant, elles sauvent encore)
  const releve = async () => { await sleep(600); const q = await ctx.newPage(); await q.goto(BASE + '/fournil/version.json'); const r = await q.evaluate(STOCKAGE); await q.close(); return r; };

  console.log('── la vraie partie, en place ──');
  let p = await ouvrir('/fournil/');
  await p.evaluate(() => { const f = window.__fournil, st = f.st; st.tuto = 99; st.boutiques = 5; st.etoiles = 120; st.nomBoutique = 'Chez Mamie'; delete st.chaine; f.give(5e6); f.G.parcours(st); f.save(); }); // (une partie d'avant le lot, à la n°5 : sans st.chaine, ses n°1 à 4 seront recréées une fois)
  await p.evaluate(() => { // les autres clés du vrai jeu : l'identité du classement (id, jeton), le tchat, la HD ; l'horloge est écrite par le jeu
    localStorage.setItem('fournil.classement', JSON.stringify({ id: '0f8fad5b-d9cb-469f-a165-70867728950e', jeton: 'a'.repeat(64), pseudo: 'Mamie', rejoint: true, dernierEnvoi: 0, recompenses: { coupes: ['or', 'argent'], badge: true } }));
    localStorage.setItem('fournil.tchat', JSON.stringify({ mes: [12, 34] })); localStorage.setItem('fournil.hd', 'non:joueur');
  });
  await sleep(1500);
  const stVraie = await p.evaluate(() => ({ boutiques: window.__fournil.st.boutiques, nom: window.__fournil.st.nomBoutique, lifetime: window.__fournil.st.lifetime, etoiles: window.__fournil.st.etoiles }));
  await p.close(); const avant = await releve();
  const clesVraies = Object.keys(avant.ls).filter((k) => /^fournil\./.test(k)).sort();
  check(['fournil.v2', 'fournil.horloge', 'fournil.classement', 'fournil.tchat', 'fournil.hd'].every((k) => clesVraies.includes(k)) && avant.bases.fournil && avant.bases.fournil.sauvegarde && avant.bases.fournil.sauvegarde.length === 1,
    `la vraie partie : ${clesVraies.join(', ')} et la base « fournil » remplies (n°${stVraie.boutiques}, « ${stVraie.nom} »)`);

  console.log('── la version d’essai : la copie, jouer, la chaîne, recharger ──');
  const avantEssai = supabase.length;
  p = await ouvrir('/fournil-essai/');
  const reqs = []; p.on('request', (r) => reqs.push(r.url()));
  check(await p.evaluate(() => !!window.FOURNIL_ESSAI && window.FOURNIL_CLE('fournil.v2') === 'fournil.essai.v2' && window.FOURNIL_CLE('fournil.classement') === 'fournil.essai.classement' && CLASSEMENT.CLE === 'fournil.essai.classement'), 'les clés de l’essai : fournil.essai.v2, fournil.essai.classement…');
  let e = await p.evaluate(() => ({ boutiques: window.__fournil.st.boutiques, nom: window.__fournil.st.nomBoutique, copie: window.__fournil.st.essaiCopie, lifetime: window.__fournil.st.lifetime }));
  check(e.boutiques === stVraie.boutiques && e.nom === stVraie.nom && e.lifetime >= stVraie.lifetime && Number.isFinite(e.copie) && e.copie > 0, `la vraie partie copiée à la 1re ouverture (n°${e.boutiques}, « ${e.nom} », essaiCopie ${e.copie ? 'posé' : 'absent'})`);
  check(await p.evaluate(() => /Version d’essai|Version d'essai/.test(document.body.innerText)), 'le bandeau « Version d’essai · ta vraie partie n’est pas touchée »');
  await p.screenshot({ path: path.join(out, '01-essai.png') });
  await p.evaluate(() => { const f = window.__fournil; f.give(1e7); f.G.acheter(f.st, 0); f.st.nomBoutique = 'Essai de Mamie'; f.save(); });
  const ch = await p.evaluate(() => { const f = window.__fournil; if (!f.chaine || !f.chaine.ouvrir) return null; const c = f.chaine.etat; f.chaine.ouvrir(1); const ok = !!f.chaine.vue; f.chaine.fermer(); f.save(); return { n: (c && c.b ? c.b.length : (typeof c === 'function' ? c().b.length : 0)), ok }; });
  check(ch && ch.ok, `entrer dans une boutique de la chaîne (la n°1) et revenir${ch ? ` : ${ch.n} boutiques dans la chaîne` : ' (__fournil.chaine absent)'}`);
  await sleep(1200); await p.reload(); await p.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(1500);
  e = await p.evaluate(() => ({ nom: window.__fournil.st.nomBoutique, boutiques: window.__fournil.st.boutiques }));
  check(e.nom === 'Essai de Mamie' && e.boutiques === stVraie.boutiques, `rechargée : la partie de l’essai, pas une nouvelle copie (« ${e.nom} »)`);
  versions.length = 0; await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await attendre(() => versions.length > 0, 9000);
  check(versions.length > 0 && versions.every((v) => v === '/fournil-essai/version.json'), `version.json relu sous fournil-essai/ (${versions.join(', ') || 'aucune lecture'})`);
  const sw = await p.evaluate(async () => ({ ctl: !!(navigator.serviceWorker && navigator.serviceWorker.controller), regs: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : [] }));
  check(!sw.ctl && !sw.regs.some((s) => /fournil-essai/.test(s)), `aucun service worker pour l’essai (inscrits sur l’origine : ${sw.regs.map((s) => s.replace(BASE, '')).join(', ') || 'aucun'})`);
  await p.close(); const apres = await releve();
  check(supabase.length === avantEssai && !reqs.some((u) => /supabase\.co/.test(u)), `aucune requête vers supabase.co depuis l’essai (${supabase.length - avantEssai})`);
  const changees = Object.keys(avant.ls).filter((k) => /^fournil\./.test(k) && !/^fournil\.essai\./.test(k) && apres.ls[k] !== avant.ls[k]);
  check(!changees.length && Object.keys(apres.ls).filter((k) => /^fournil\./.test(k) && !/^fournil\.essai\./.test(k)).length === clesVraies.length, `toutes les clés du vrai jeu identiques octet pour octet${changees.length ? ` (changées : ${changees.join(', ')})` : ''}`);
  check(JSON.stringify(apres.bases.fournil) === JSON.stringify(avant.bases.fournil), 'la base « fournil » du vrai jeu identique (relue)');
  const neuves = Object.keys(apres.ls).filter((k) => !(k in avant.ls)), basesNeuves = Object.keys(apres.bases).filter((b) => !(b in avant.bases));
  check(neuves.length > 0 && neuves.every((k) => /^fournil\.essai\./.test(k)) && basesNeuves.every((b) => b === 'fournil-essai'), `l’essai n’écrit que fournil.essai.* (${neuves.join(', ')}) et la base « fournil-essai » (${basesNeuves.join(', ') || 'aucune'})`);
  check(!/"jeton":"a{64}"|"id":"0f8f/.test(apres.ls['fournil.essai.classement'] || ''), 'la copie du classement (les coupes) sans id ni jeton');

  console.log('── la redirection ──');
  p = await ctx.newPage(); await p.goto(BASE + '/ailleurs/copie.html'); await sleep(1500);
  check(new URL(p.url()).pathname === '/ailleurs/fournil-essai/', `servie ailleurs (/ailleurs/copie.html) : renvoyée vers ${new URL(p.url()).pathname}`);
  await p.close();

  console.log('── le vrai jeu, rouvert ──');
  p = await ouvrir('/fournil/');
  const v = await p.evaluate(() => ({ boutiques: window.__fournil.st.boutiques, nom: window.__fournil.st.nomBoutique, lifetime: window.__fournil.st.lifetime }));
  check(v.boutiques === stVraie.boutiques && v.nom === stVraie.nom && v.lifetime >= stVraie.lifetime && !(await p.evaluate(() => !!window.FOURNIL_ESSAI)), `sa partie intacte (n°${v.boutiques}, « ${v.nom} »), rien de l’essai`);
  await p.close();
  await ctx.close();

  console.log('── un iPhone sans vraie partie (l’écran d’accueil a son propre stockage) ──');
  const ip = await browser.newContext(Object.assign({}, devices['iPhone 13'], { locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'allow' }));
  await ip.route(/supabase\.co/, (r) => r.abort());
  p = await ip.newPage(); p.on('pageerror', (x) => erreurs.push(`iPhone : ${x.message}`));
  await p.goto(BASE + '/fournil-essai/'); await p.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }).catch(() => {}); await sleep(1500);
  const txt = await p.evaluate(() => (document.querySelector('#feuille') && !document.querySelector('#feuille').hidden ? document.querySelector('#feuille').innerText : ''));
  check(/code de sauvegarde/i.test(txt) && /partie neuve/i.test(txt), `rien à copier : la feuille « Colle le code de sauvegarde de ta vraie partie » ou « Commencer une partie neuve » (${txt.replace(/\s+/g, ' ').slice(0, 80) || 'aucune feuille'})`);
  await p.screenshot({ path: path.join(out, '02-iphone-coller-le-code.png') });
  await ip.close();

  check(!erreurs.length, `aucune erreur dans les pages (${erreurs.slice(0, 3).join(' | ')})`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
