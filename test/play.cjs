// Parcours automatique du Fournil sur un iPhone simulé : touches, améliorations, embauche, feuilles, absence, nouvelle boutique.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(8781);
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CERT|googleapis|gstatic|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text() + ' @ ' + (m.location() && m.location().url)); });
  await page.goto('http://localhost:8781/'); await sleep(800);
  await page.screenshot({ path: out + '/01-debut.png' });
  const W = () => page.evaluate(() => { const s = window.__fournil.st; return { coins: +s.coins.toFixed(1), niv: s.stations.map((x) => x.niv).join(','), staff: s.stations.map((x) => +x.staff).join(''), tuto: s.tuto, ventes: s.stats.ventes, indice: document.querySelector('#indice').hidden ? '' : document.querySelector('#indice-txt').textContent }; });
  console.log('début', await W());
  check((await W()).indice.includes('Touche la baguette'), 'premier indice : toucher la baguette');
  // toucher la baguette 6 fois (1 s chacune)
  for (let k = 0; k < 6; k++) { await page.tap('.carte[data-i="0"] .barre'); await sleep(1150); }
  console.log('après 6 touches', await W());
  check((await W()).ventes >= 5, 'des baguettes vendues');
  await page.screenshot({ path: out + '/02-touches.png' });
  check((await W()).indice.includes('améliore'), 'indice : améliorer');
  await page.tap('.carte[data-i="0"] [data-a="ameliorer"]'); await sleep(300);
  check((await W()).niv.startsWith('2'), 'baguette niveau 2');
  // accélérer : on crédite 5 000 € et on suit les indices
  await page.evaluate(() => window.__fournil.give(5000)); await sleep(400);
  console.log('crédité', await W());
  check((await W()).indice.includes('croissants'), 'indice : débloquer les croissants');
  await page.tap('.carte[data-i="1"] [data-a="debloquer"]'); await sleep(500);
  await page.screenshot({ path: out + '/03-croissant.png' });
  check((await W()).niv.split(',')[1] === '1', 'croissants débloqués');
  check((await W()).indice.includes('Léo'), 'indice : embaucher Léo');
  await page.tap('.carte[data-i="0"] [data-a="embaucher"]'); await sleep(500);
  check((await W()).staff.startsWith('1'), 'Léo embauché');
  await sleep(2500);
  console.log('auto', await W());
  check((await W()).ventes >= 8, 'les baguettes se vendent toutes seules');
  await page.screenshot({ path: out + '/04-apprenti.png' });
  // mode ×10 puis Max, achats
  await page.tap('.modes [data-mode="max"]'); await sleep(200);
  await page.tap('.carte[data-i="1"] [data-a="ameliorer"]'); await sleep(300);
  console.log('max', await W());
  await page.tap('.modes [data-mode="1"]'); await sleep(200);
  await page.evaluate(() => window.__fournil.give(5e6)); await sleep(300);
  for (const i of [2, 3, 4]) { await page.tap(`.carte[data-i="${i}"] [data-a="debloquer"]`); await sleep(250); }
  for (const i of [1, 2, 3]) { await page.tap(`.carte[data-i="${i}"] [data-a="embaucher"]`); await sleep(250); }
  await sleep(1500);
  await page.screenshot({ path: out + '/05-boutique.png' });
  // objectifs du jour : carte compacte puis feuille, on réclame une prime
  const obj = await page.evaluate(() => ({ hidden: document.querySelector('#objectifs').hidden, txt: document.querySelector('#objectifs').innerText, n: window.__fournil.st.jour.objectifs.length }));
  check(!obj.hidden && obj.n === 3 && /Objectifs du jour/i.test(obj.txt), 'carte des objectifs du jour : ' + obj.txt.split('\n').slice(0, 2).join(' / '));
  await page.tap('#objectifs', { force: true }); await sleep(400); await page.screenshot({ path: out + '/05b-objectifs.png' });
  await page.evaluate(() => { const o = window.__fournil.st.jour.objectifs[0]; o.progres = o.cible; o.fait = true; });
  const coinsObj = await page.evaluate(() => window.__fournil.st.coins);
  await page.tap('[data-k="0"]', { force: true }); await sleep(400);
  const apres = await page.evaluate(() => ({ coins: window.__fournil.st.coins, reclame: window.__fournil.st.jour.objectifs[0].reclame, prime: window.__fournil.st.jour.objectifs[0].prime }));
  check(apres.reclame && apres.coins >= coinsObj + apres.prime - 1, 'prime du premier objectif récupérée : +' + apres.prime);
  await page.screenshot({ path: out + '/05c-objectif-recupere.png' });
  await page.tap('[data-a="close"]'); await sleep(300);
  // coup de feu
  await page.evaluate(() => window.__fournil.rush()); await sleep(700);
  const rushTxt = await page.evaluate(() => ({ hidden: document.querySelector('#evenement').hidden, txt: document.querySelector('#evenement').innerText }));
  check(!rushTxt.hidden && /Coup de feu/.test(rushTxt.txt) && /×3/.test(rushTxt.txt), 'carte du coup de feu : ' + rushTxt.txt.replace(/\n/g, ' / '));
  await page.screenshot({ path: out + '/05d-coup-de-feu.png' });
  await page.evaluate(() => { window.__fournil.st.ev.fin = Date.now() - 1; }); await sleep(500);
  check(await page.evaluate(() => document.querySelector('#evenement').hidden && !window.__fournil.st.ev), 'le coup de feu se termine et la carte disparaît');
  // commande spéciale puis livraison
  await page.evaluate(() => window.__fournil.commande()); await sleep(700);
  const cmd = await page.evaluate(() => ({ txt: document.querySelector('#evenement').innerText, n: window.__fournil.st.ev.n, livrer: !!document.querySelector('[data-a="livrer"]') }));
  check(/Commande spéciale/.test(cmd.txt) && !cmd.livrer, 'carte de la commande : ' + cmd.txt.replace(/\n/g, ' / '));
  await page.screenshot({ path: out + '/05e-commande.png' });
  await page.evaluate(() => { window.__fournil.st.ev.fait = window.__fournil.st.ev.n; }); await sleep(500);
  check(await page.evaluate(() => !!document.querySelector('[data-a="livrer"]')), 'le bouton Livrer apparaît quand la commande est prête');
  await page.screenshot({ path: out + '/05f-commande-prete.png' });
  const coinsCmd = await page.evaluate(() => ({ c: window.__fournil.st.coins, p: window.__fournil.st.ev.prime }));
  await page.tap('[data-a="livrer"]', { force: true }); await sleep(500);
  const livree = await page.evaluate(() => ({ coins: window.__fournil.st.coins, ev: window.__fournil.st.ev, hidden: document.querySelector('#evenement').hidden }));
  check(!livree.ev && livree.hidden && livree.coins >= coinsCmd.c + coinsCmd.p - 1, 'commande livrée : +' + coinsCmd.p);
  // concours de pétrissage : 30 touches
  await page.evaluate(() => window.__fournil.ev('petrissage')); await sleep(600);
  check(await page.evaluate(() => /pétrissage/i.test(document.querySelector('#evenement').innerText)), 'carte du concours de pétrissage');
  await page.screenshot({ path: out + '/05h-petrissage.png' });
  const coinsPet = await page.evaluate(() => ({ c: window.__fournil.st.coins, p: window.__fournil.st.ev.prime }));
  for (let k = 0; k < 30; k++) await page.tap('[data-a="petrir"]', { force: true });
  await sleep(400);
  check(await page.evaluate((c) => !window.__fournil.st.ev && window.__fournil.st.coins >= c, coinsPet.c + coinsPet.p - 1), 'pétrissage gagné : +' + coinsPet.p);
  // panne de four : le produit s'arrête, 8 touches pour réparer
  await page.evaluate(() => window.__fournil.ev('panne')); await sleep(600);
  const panne = await page.evaluate(() => ({ txt: document.querySelector('#evenement').innerText, i: window.__fournil.st.ev.i, prog: window.__fournil.st.stations[window.__fournil.st.ev.i].prog }));
  await sleep(1200);
  check(/Panne de four/.test(panne.txt) && await page.evaluate(([i, prog]) => window.__fournil.st.stations[i].prog === prog, [panne.i, panne.prog]), 'panne : la production est à l’arrêt (' + panne.txt.split('\n')[1] + ')');
  await page.screenshot({ path: out + '/05i-panne.png' });
  for (let k = 0; k < 8; k++) await page.tap('[data-a="reparer"]', { force: true });
  await sleep(400);
  check(await page.evaluate(() => !window.__fournil.st.ev), 'four réparé en 8 touches');
  // le meunier : prix à −40 %
  const prixAvant = await page.evaluate(() => window.__fournil.G.coutNiveaux(0, window.__fournil.st.stations[0].niv, 1));
  await page.evaluate(() => window.__fournil.ev('meunier')); await sleep(600);
  const promo = await page.evaluate(() => ({ txt: document.querySelector('.carte[data-i="0"] [data-a="ameliorer"]').innerText, prix: window.__fournil.G.prixNiveaux(window.__fournil.st, 0, 1), ev: document.querySelector('#evenement').innerText }));
  check(/−40 %/.test(promo.txt) && Math.abs(promo.prix / prixAvant - 0.6) < 0.01 && /meunier/i.test(promo.ev), 'meunier : niveaux à −40 % (' + promo.txt.replace(/\n/g, ' ') + ')');
  await page.screenshot({ path: out + '/05j-meunier.png' });
  await page.evaluate(() => { window.__fournil.st.ev = null; }); await sleep(300);
  // goûter d'anniversaire et critique
  await page.evaluate(() => window.__fournil.ev('anniversaire')); await sleep(600);
  check(await page.evaluate(() => { const f = window.__fournil, i = f.st.ev.i; return /anniversaire/i.test(document.querySelector('#evenement').innerText) && f.G.revenu(f.st, i) / f.G.revenuBase(f.st, i) >= 5; }), 'goûter d’anniversaire : un produit ×5');
  await page.screenshot({ path: out + '/05k-anniversaire.png' });
  await page.evaluate(() => { window.__fournil.st.ev = null; window.__fournil.ev('critique'); }); await sleep(600);
  const restants = await page.evaluate(() => window.__fournil.st.ev.restants.slice());
  check(await page.evaluate(() => /critique/i.test(document.querySelector('#evenement').innerText) && document.querySelectorAll('.carte.gouter').length === 3), 'le critique demande trois recettes, les trois cartes sont marquées');
  await page.screenshot({ path: out + '/05l-critique.png' });
  await page.tap(`.carte[data-i="${restants[0]}"] .icone`, { force: true }); await sleep(300);
  check(await page.evaluate(() => window.__fournil.st.ev.restants.length === 2 && document.querySelectorAll('.carte.gouter').length === 2), 'une recette servie en touchant sa carte');
  for (const i of restants.slice(1)) { // comme un joueur : on fait défiler jusqu'à la carte, puis on la touche
    await page.evaluate((i) => document.querySelector(`.carte[data-i="${i}"]`).scrollIntoView({ block: 'center' }), i); await sleep(200);
    await page.tap(`.carte[data-i="${i}"] .icone`, { force: true }); await sleep(300);
  }
  const conquis = await page.evaluate(() => ({ ev: window.__fournil.st.ev && window.__fournil.st.ev.type, boost: window.__fournil.st.boost && window.__fournil.st.boost.mult, taux: document.querySelector('#taux').textContent }));
  check(!conquis.ev && conquis.boost === 2 && /Bonne critique/.test(conquis.taux), 'le critique conquis : tout ×2, affiché en haut ' + JSON.stringify(conquis));
  await page.screenshot({ path: out + '/05m-bonne-critique.png' });
  await page.evaluate(() => { window.__fournil.st.boost = null; }); await sleep(300);
  // client mystère : il arrive, on le touche, pourboire
  await page.evaluate(() => window.__fournil.mystere()); await sleep(4800);
  await page.screenshot({ path: out + '/05g-client-mystere.png' });
  const pos = await page.evaluate(() => { const r = document.querySelector('#scene').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.78 - 30 }; });
  const coinsMys = await page.evaluate(() => window.__fournil.st.coins);
  await page.touchscreen.tap(pos.x, pos.y); await sleep(400);
  const tip = await page.evaluate(() => window.__fournil.st.coins) - coinsMys;
  check(tip >= 20, 'pourboire du client mystère : +' + Math.round(tip));
  // améliorations
  await page.tap('#b-ameliorations', { force: true }); await sleep(400); await page.screenshot({ path: out + '/06-ameliorations.png' });
  await page.tap('[data-id="farine"]'); await sleep(300);
  check(await page.evaluate(() => !!window.__fournil.st.ameliorations.farine), 'farine de tradition achetée');
  await page.touchscreen.tap(195, 40); await sleep(300);
  check(await page.evaluate(() => document.querySelector('#feuille').hidden), 'la feuille se ferme sur le voile');
  // absence
  await page.evaluate(() => window.__fournil.absence(3 * 3600 * 1000)); await sleep(500);
  await page.screenshot({ path: out + '/07-absence.png' });
  const absTxt = await page.evaluate(() => document.querySelector('#feuille-contenu').innerText);
  check(/Pendant ton absence/.test(absTxt) && /3 h/.test(absTxt), 'feuille d’absence : ' + absTxt.split('\n').slice(0, 3).join(' / '));
  await page.tap('[data-a="close"]'); await sleep(300);
  // étoiles
  await page.evaluate(() => { window.__fournil.st.lifetimeRun = 2e11; }); await sleep(100);
  await page.tap('#b-etoiles', { force: true }); await sleep(400); await page.screenshot({ path: out + '/08-etoiles.png' });
  await page.tap('[data-a="prestige"]'); await sleep(400); await page.tap('[data-a="oui"]'); await sleep(600);
  const s2 = await W(); console.log('boutique 2', s2);
  check(s2.niv === '1,0,0,0,0,0,0,0' && await page.evaluate(() => window.__fournil.st.etoiles > 0), 'nouvelle boutique : produits remis à zéro, étoiles gardées');
  await page.screenshot({ path: out + '/09-boutique2.png' });
  // rechargement : la sauvegarde tient
  await page.reload(); await sleep(800);
  const s3 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s3.boutiques === 2 && s3.etoiles > 0, 'sauvegarde rechargée : ' + JSON.stringify(s3));
  // la sauvegarde tient même si localStorage est vidé (copie IndexedDB)
  await page.evaluate(() => localStorage.removeItem('fournil.v2')); await page.reload(); await sleep(900);
  const s4 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s4.boutiques === 2 && s4.etoiles === s3.etoiles, 'relue depuis IndexedDB sans localStorage : ' + JSON.stringify(s4));
  // code de sauvegarde : copier, tout effacer, recharger le code
  await page.tap('#b-etoiles', { force: true }); await sleep(300); await page.tap('[data-a="sauvegarde"]'); await sleep(300);
  await page.screenshot({ path: out + '/09b-sauvegarde.png' });
  const code = await page.evaluate(() => document.querySelector('[data-r="code"]').value);
  check(code.startsWith('FOURNIL1.') && code.length > 200, 'code de sauvegarde produit (' + code.length + ' caractères)');
  await page.fill('[data-r="entree"]', 'pas un code'); await page.tap('[data-a="charger"]'); await sleep(300);
  check(await page.evaluate(() => /pas valide/.test((document.querySelector('.toast') || {}).textContent || '')), 'un code invalide est refusé');
  await page.evaluate(() => { window.__fournil.reset(); }); await sleep(1200);
  const s5 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s5.boutiques === 1 && s5.etoiles === 0, 'tout effacé : ' + JSON.stringify(s5));
  await page.tap('#b-etoiles', { force: true }); await sleep(300); await page.tap('[data-a="sauvegarde"]'); await sleep(300);
  await page.fill('[data-r="entree"]', code); await page.tap('[data-a="charger"]'); await sleep(300);
  await page.screenshot({ path: out + '/09c-charger-code.png' });
  await page.tap('[data-a="etoiles"]'); await sleep(500);
  const fusion = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(fusion.etoiles === s3.etoiles && fusion.boutiques === 1, 'étoiles récupérées du code, boutique gardée : ' + JSON.stringify(fusion));
  await page.tap('[data-a="sauvegarde"]'); await sleep(300); await page.fill('[data-r="entree"]', code); await page.tap('[data-a="charger"]'); await sleep(300);
  await page.tap('[data-a="oui"]'); await sleep(1500);
  const s6 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s6.boutiques === 2 && s6.etoiles === s3.etoiles, 'boutique rechargée depuis le code : ' + JSON.stringify(s6));
  // petit écran
  const p2 = await (await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR' })).newPage();
  await p2.goto('http://localhost:8781/'); await sleep(700); await p2.screenshot({ path: out + '/10-petit-ecran.png' });
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'pas de défilement horizontal à 360 px');
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
