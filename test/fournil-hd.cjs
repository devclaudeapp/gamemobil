// Les modèles HD du Fournil (src/hd.js, fournil/hd/) sur la vraie page, téléphone en portrait, au 2e jour de l'événement « Le Quartier » :
// en qualité haute, la boutique reçoit ses décors (personnages inchangés) et la Planque ses meubles, sa rue de nuit et son équipe animée ;
// en éco ou avec ?hd=0, aucun modèle HD n'est demandé et le rendu habituel reste. Aucune erreur dans la page.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hd.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_HD || 8867;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-14T10:00:00+02:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = [];
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
// avant un rechargement : attendre qu'aucun lot HD ne soit en vol. Une page rechargée pendant qu'un modèle texturé se décode coupe le fetch(blob:)
// du GLTFLoader, qui l'écrit en console.error depuis l'ancienne page (« THREE.GLTFLoader: Couldn't load texture blob:… » : reproduit en
// rechargeant à un instant tiré au hasard pendant les lots planque et hantee) ; c'était l'erreur de page qui revenait de temps en temps
async function calme(page) {
  const enVol = () => page.evaluate(() => Object.keys(HDM.etat).filter((l) => !HDM.etat[l].pret && !HDM.etat[l].erreur)), avant = await enVol();
  check(await attendre(async () => (await enVol()).length === 0, 30000), `avant de recharger, aucun lot HD en vol (attendus : ${avant.join(', ') || 'aucun'})`);
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; }, decal);
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
    return { ctx, page, erreurs };
  }

  // ouvrir / fermer la Planque plusieurs fois, puis une perte de contexte simulée : la 3D revient toujours (le bug de l'écran noir)
  async function robustesse(page, nom) {
    const etat = () => page.evaluate(() => { const c = document.querySelector('#pq-canvas'), g = c && (c.getContext('webgl2') || c.getContext('webgl')), s = window.__fournil.evenement.scene; return { scene: !!s, perdu: g ? g.isContextLost() : null, calls: s ? s.calls : 0 }; });
    for (let k = 1; k <= 3; k++) {
      await page.evaluate(() => { if (document.querySelector('#planque').hidden) window.__fournil.quartier(); }); await sleep(1200);
      const e = await etat(); check(e.scene && e.perdu === false && e.calls > 0, `${nom} : ouverture n° ${k} de la Planque, la 3D tourne (${e.calls} appels, contexte ${e.perdu ? 'PERDU' : 'vivant'})`);
      if (k < 3) { await page.evaluate(() => document.querySelector('[data-pq="fermer"]').click()); await sleep(400); }
    }
    await page.evaluate(() => { const g = document.querySelector('#pq-canvas').getContext('webgl2'); g.getExtension('WEBGL_lose_context').loseContext(); });
    check(await attendre(async () => { const e = await etat(); return e.scene && e.perdu === false && e.calls > 0; }, 5000), `${nom} : contexte perdu Planque ouverte (mémoire du téléphone) : une scène neuve en moins de 5 s`);
    await page.evaluate(() => document.querySelector('[data-pq="fermer"]').click()); await sleep(300);
  }

  console.log('── qualité haute : la boutique ──');
  demandes.length = 0;
  let { ctx, page, erreurs } = await ouvrir('?qualite=haute');
  check(await page.evaluate(() => typeof HDM !== 'undefined' && HDM.actif), 'le module HD est là (vendor/fournil-hd.min.js chargé)');
  const paquet = fs.statSync(path.join(root, 'vendor/fournil-hd.min.js')).size;
  check(await page.evaluate(() => typeof FOURNIL_HD.GLTFLoader === 'function' && typeof FOURNIL_HD.EffectComposer === 'undefined' && typeof FOURNIL_HD.N8AOPostPass === 'undefined' && typeof HDM.effets === 'undefined') && paquet < 100e3,
    `le paquet du jeu n'embarque que le chargeur (sans postprocessing ni n8ao, réservés à la maquette) : ${Math.round(paquet / 1024)} Ko (< 100 Ko)`);
  check(await attendre(() => page.evaluate(() => SCENE.decorHD > 0)), 'après les premières images, la boutique reçoit ses décors HD');
  // les personnages de la boutique restent ceux de toujours (PERSOS) : ils arrivent (clients) alors qu'aucun modèle de personnage HD n'est demandé
  const acteurs = await attendre(() => page.evaluate(() => window.__fournil.stats().acteurs > 0), 20000), nActeurs = await page.evaluate(() => window.__fournil.stats().acteurs);
  check(acteurs && demandes.every((d) => !/(persos|mini)\//.test(d)), `la boutique ne charge aucun personnage HD : ${nActeurs} personnage(s) habituel(s) dans la salle, ${demandes.length} modèles demandés, tous des décors`);
  const poidsB = demandes.reduce((s, d) => s + fs.statSync(path.join(root, d)).size, 0); check(poidsB < 400e3, `les décors de la boutique pèsent ${Math.round(poidsB / 1024)} Ko (< 400 Ko)`);

  console.log('── qualité haute : la Planque ──');
  await page.evaluate(() => { window.__fournil.quartier(); }); await sleep(500);
  await page.evaluate(() => { const b = document.querySelector('#pq-corps [data-pq="oui"]'); if (b) b.click(); }); await sleep(500);
  await page.evaluate(() => { const q = window.__fournil.st.quartier; q.billets = 1e6; }); await sleep(300);
  for (let k = 0; k < 5; k++) await page.evaluate(() => { const b = document.querySelector('#pq-cartes [data-a="embaucher"]'); if (b) b.click(); });
  check(await attendre(() => page.evaluate(() => { const s = window.__fournil.evenement.scene; return s && s.hd.actif; })), 'la Planque passe en HD dès que ses modèles sont là');
  const hd = await page.evaluate(() => window.__fournil.evenement.scene.hd);
  check(hd.persos >= 1 && hd.rue, `meubles, rue de nuit derrière la fenêtre, ${hd.persos} personnage(s) animé(s)`);
  check(await attendre(() => page.evaluate(() => window.__fournil.evenement.scene.hd.verifs >= 3), 8000) && await page.evaluate(() => window.__fournil.evenement.scene.hd.noirs === 0 && window.__fournil.evenement.scene.hd.actif), 'le contrôle d’écran noir voit bien la Planque HD (pas de fausse alerte)');
  const poidsP = [...new Set(demandes)].reduce((s, d) => s + fs.statSync(path.join(root, d)).size, 0); check(poidsP < 2.6e6, `tout le HD téléchargé : ${(poidsP / 1e6).toFixed(2)} Mo (< 2,6 Mo)`);
  const t0 = await page.evaluate(() => { const s = window.__fournil.evenement.scene; return s ? 1 : 0; });
  await sleep(1500); await page.screenshot({ path: path.join(__dirname, 'shots', 'planque-hd.png') });
  await page.evaluate(() => document.querySelector('[data-pq="fermer"]').click()); await sleep(600);
  check(t0 === 1 && await page.evaluate(() => !window.__fournil.evenement.scene), 'la Planque refermée libère sa 3D (renderer, rue, personnages)');
  await robustesse(page, 'haute');

  console.log('── un téléphone où la HD reste noire : retour au décor classique, interrupteur dans les Réglages ──');
  await page.evaluate(() => { window.__hdNoir = true; window.__fournil.quartier(); });
  check(await attendre(() => page.evaluate(() => HDM.coupe() && !window.__fournil.evenement.scene.hd.actif), 8000), 'écran noir détecté : la Planque repasse au décor classique d’elle-même');
  check(await page.evaluate(() => localStorage.getItem('fournil.hd') === 'non:écran noir' && window.__fournil.evenement.scene.calls > 1), 'et ce téléphone le retient (la Planque classique tourne)');
  await page.evaluate(() => { window.__hdNoir = false; document.querySelector('[data-pq="fermer"]').click(); }); await sleep(300);
  await page.evaluate(() => window.__fournil.page('reglages')); await sleep(400);
  const ligneHd = await page.evaluate(() => { const b = document.querySelector('[data-a="hd"]'); return b ? b.innerText : ''; });
  check(/Décors en HD/.test(ligneHd) && /écran restait noir/.test(ligneHd), `Réglages : « Décors en HD » dit pourquoi ils sont coupés (${ligneHd.replace(/\s+/g, ' ').slice(0, 80)})`);
  const groupeHd = await page.evaluate(() => { const b = document.querySelector('[data-a="hd"]'), c = b && b.closest('.card'), h = c && c.previousElementSibling; return h ? h.textContent.trim() : ''; });
  check(groupeHd === 'Le jeu', `rangé dans le groupe « Le jeu » des Réglages (il vaut pour la boutique aussi, et reste après les événements) : « ${groupeHd} »`);
  // la raison survit au rechargement (gardée avec la coupure) : le petit texte dit encore pourquoi
  await calme(page); await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.page('reglages'); }); await sleep(400);
  const ligneHd2 = await page.evaluate(() => { const b = document.querySelector('[data-a="hd"]'); return (b ? b.innerText : '') + ' | ' + HDM.raison; });
  check(/écran restait noir/.test(ligneHd2) && await page.evaluate(() => HDM.coupe()), `après un rechargement, la ligne dit toujours « l’écran restait noir » (${ligneHd2.replace(/\s+/g, ' ').slice(0, 80)})`);
  await page.evaluate(() => document.querySelector('[data-a="hd"]').click()); await sleep(300);
  check(await page.evaluate(() => !HDM.coupe() && localStorage.getItem('fournil.hd') === null), 'un toucher la remet (réessayer)');
  await page.evaluate(() => document.querySelector('[data-a="hd"]').click()); await sleep(300);
  check(await page.evaluate(() => HDM.coupe()), 'et un autre la coupe à la main');
  await page.evaluate(() => { document.querySelector('[data-a="hd"]').click(); window.__fournil.page('boutique'); }); await sleep(300);
  console.log('── la Planque préchargée en arrière-plan (déjà entré une fois) ──');
  await calme(page); demandes.length = 0; await page.reload(); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
  check(await attendre(() => page.evaluate(() => HDM.pret('planque')), 20000), 'quelques secondes après le lancement, les modèles de la Planque sont déjà là (sans l’ouvrir)');
  check(demandes.some((d) => /mini\//.test(d)), `préchargés en arrière-plan (${demandes.filter((d) => /mini\//.test(d)).length} personnages)`);
  const t1 = Date.now(); await page.evaluate(() => window.__fournil.quartier());
  check(await attendre(() => page.evaluate(() => { const s = window.__fournil.evenement.scene; return s && s.hd.actif; }), 3000), `la Planque s'ouvre directement en HD (${Date.now() - t1} ms)`);
  await page.evaluate(() => document.querySelector('[data-pq="fermer"]').click()); await sleep(300);
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  for (const [q, nom] of [['?qualite=eco', 'qualité éco'], ['?qualite=haute&hd=0', '?hd=0']]) {
    console.log(`── ${nom} : le rendu habituel ──`);
    demandes.length = 0; ({ ctx, page, erreurs } = await ouvrir(q));
    await page.evaluate(() => { window.__fournil.quartier(); }); await sleep(400);
    await page.evaluate(() => { const b = document.querySelector('#pq-corps [data-pq="oui"]'); if (b) b.click(); }); await sleep(3000);
    const s = await page.evaluate(() => { const sc = window.__fournil.evenement.scene; return { decor: SCENE.decorHD, planque: sc ? sc.hd.actif : null }; });
    check(demandes.length === 0 && s.decor === 0 && s.planque === false, `aucun modèle HD demandé, boutique et Planque comme avant (${demandes.length} demandes)`);
    await page.evaluate(() => document.querySelector('[data-pq="fermer"]').click()); await sleep(300);
    await robustesse(page, nom);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (HD).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
