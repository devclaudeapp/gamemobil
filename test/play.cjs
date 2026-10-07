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
let page; const haut = async () => { await page.evaluate(() => document.querySelector('#pages').scrollTo(0, 0)); await sleep(450); }; // remonter la liste : la scène se redéploie, on attend la fin de l'animation
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  page = await context.newPage();
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
  const palier = await page.evaluate(() => ({ txt: document.querySelector('.carte[data-i="0"] .palier').innerText.replace(/\n/g, ' '), larg: document.querySelector('.carte[data-i="0"] .palier i').style.width }));
  check(/Palier 25/.test(palier.txt) && /×2/.test(palier.txt) && /23 niveaux/.test(palier.txt) && palier.larg === '8%', 'la carte montre le prochain palier et la progression : ' + palier.txt + ' (' + palier.larg + ')');
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
  check(await page.evaluate(() => { const f = window.__fournil, n = f.G.quantite(f.st, 1); return n >= 24 ? !!document.querySelector('.carte[data-i="1"] [data-a="ameliorer"] .pal-badge') : true; }), 'en Max, le bouton annonce le palier ×2 quand l’achat le franchit');
  await page.tap('.carte[data-i="1"] [data-a="ameliorer"]'); await sleep(300);
  console.log('max', await W());
  await page.tap('.modes [data-mode="1"]'); await sleep(200);
  await page.evaluate(() => window.__fournil.give(5e6)); await sleep(300);
  for (const i of [2, 3, 4]) { await page.tap(`.carte[data-i="${i}"] [data-a="debloquer"]`); await sleep(250); }
  for (const i of [1, 2, 3]) { await page.tap(`.carte[data-i="${i}"] [data-a="embaucher"]`); await sleep(250); }
  await sleep(1500);
  await page.screenshot({ path: out + '/05-boutique.png' });
  check(await page.evaluate(() => [...document.querySelectorAll('.carte')].every((c) => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('.corps, .corps > *, .boutons, .boutons > *')].every((el) => el.getBoundingClientRect().right <= r.right + 0.5); })), 'aucune carte ne déborde de son cadre');
  // objectifs du jour : carte compacte puis feuille, on réclame une prime
  check(await page.evaluate(() => document.querySelectorAll('#onglets button').length === 5 && document.querySelectorAll('#onglets .ico svg').length === 5), 'cinq onglets avec leurs icônes');
  const obj = await page.evaluate(() => ({ hidden: document.querySelector('#objectifs').hidden, txt: document.querySelector('#objectifs').innerText, n: window.__fournil.st.jour.objectifs.length }));
  check(!obj.hidden && obj.n === 3 && /Objectifs du jour/i.test(obj.txt), 'ticket des objectifs du jour : ' + obj.txt.split('\n').slice(0, 2).join(' / '));
  await page.evaluate(() => { const o = window.__fournil.st.jour.objectifs[0]; o.progres = o.cible; o.fait = true; }); await sleep(300);
  const primes = await page.evaluate(() => { const b = document.querySelector('#onglets [data-page="defis"] .badge'); return !b.hidden && document.querySelector('#objectifs').classList.contains('pret') ? +b.textContent : 0; });
  check(primes >= 1, 'badge « ' + primes + ' » sur l’onglet Défis et ticket en vert : une prime attend');
  await haut(); await page.tap('#objectifs', { force: true }); await sleep(500); await page.screenshot({ path: out + '/05b-defis.png' });
  check(await page.evaluate(() => !document.querySelector('#page-defis').hidden && document.querySelector('#page-boutique').hidden && document.body.classList.contains('replie') && /Objectifs du jour/.test(document.querySelector('#page-defis').innerText)), 'le ticket ouvre la page Défis, la scène se replie');
  const coinsObj = await page.evaluate(() => window.__fournil.st.coins);
  await page.tap('#page-defis [data-k="0"]', { force: true }); await sleep(400);
  const apres = await page.evaluate(() => ({ coins: window.__fournil.st.coins, reclame: window.__fournil.st.jour.objectifs[0].reclame, prime: window.__fournil.st.jour.objectifs[0].prime }));
  check(apres.reclame && apres.coins >= coinsObj + apres.prime - 1, 'prime du premier objectif récupérée : +' + apres.prime);
  await page.screenshot({ path: out + '/05c-objectif-recupere.png' });
  await page.tap('#onglets [data-page="boutique"]'); await sleep(400);
  check(await page.evaluate((n) => { const b = document.querySelector('#onglets [data-page="defis"] .badge'); return !document.querySelector('#page-boutique').hidden && !document.body.classList.contains('replie') && (n === 1 ? b.hidden : +b.textContent === n - 1); }, primes), 'retour à la Boutique : scène dépliée, badge décompté');
  // le boulanger : touche-le dans la boutique, gagne du savoir-faire, apprends un talent
  const zone = async (id) => page.evaluate((id) => { const r = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones()[id]; return { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2 }; }, id);
  await haut(); const bk = await zone('boulanger');
  await page.touchscreen.tap(bk.x, bk.y); await sleep(400);
  const fiche = await page.evaluate(() => document.querySelector('#page-boulanger').hidden ? '' : document.querySelector('#page-boulanger').innerText);
  check(/Niveau \d/.test(fiche) && /Bouche-à-oreille/.test(fiche) && /Mains rapides/.test(fiche), 'touche le boulanger : sa page s’ouvre (' + fiche.split('\n').slice(0, 2).join(' / ') + ')');
  await page.screenshot({ path: out + '/05n-boulanger.png' });
  await page.tap('#onglets [data-page="boutique"]'); await sleep(200);
  check(await page.evaluate(() => window.__fournil.SCENE.apprentis === 3), 'trois apprentis s’affairent entre le four et le comptoir');
  const manque = await page.evaluate(() => { const f = window.__fournil, np = f.G.niveauPour(f.st.xp); return np.prochain - np.reste; });
  await page.evaluate((n) => window.__fournil.xp(n), manque); await sleep(500);
  const toastNiv = await page.evaluate(() => (document.querySelector('.toast') || {}).textContent || '');
  check(/Niveau \d+ :/.test(toastNiv), 'passage de niveau annoncé : ' + toastNiv);
  const pts = await page.evaluate(() => window.__fournil.G.ptsTalents(window.__fournil.st));
  check(pts >= 1, pts + ' point(s) de talent à dépenser');
  check(await page.evaluate(() => { const b = document.querySelector('#onglets [data-page="boulanger"] .badge'); return !b.hidden && b.classList.contains('lavande'); }), 'badge lavande sur l’onglet Boulanger');
  await page.tap('#onglets [data-page="boulanger"]'); await sleep(400);
  await page.tap('#page-boulanger [data-t="mains"]', { force: true }); await sleep(400);
  check(await page.evaluate(() => { const f = window.__fournil; return f.G.talent(f.st, 'mains') === 1 && Math.abs(f.G.temps(f.st, 0) - 0.95) < 1e-9; }), 'Mains rapides appris : la baguette cuit en 0,95 s');
  await page.screenshot({ path: out + '/05o-talent.png' });
  await page.tap('#onglets [data-page="boutique"]'); await sleep(300);
  // pain du jour, défi de la semaine, trophées, journal, habitué
  const pdj = await page.evaluate(() => { const f = window.__fournil, p = f.st.jour.pain; return { p, tag: document.querySelectorAll('.carte .tag').length, texte: document.querySelector('#objectifs').innerText, debloque: f.st.stations[p].niv > 0, semaine: f.st.semaine && f.st.semaine.txt }; });
  check(/Pain du jour/.test(pdj.texte) && /Semaine/.test(pdj.texte) && (!pdj.debloque || pdj.tag >= 1), 'pain du jour et défi de la semaine sur le ticket (' + pdj.semaine + ')');
  await haut(); await page.tap('#objectifs', { force: true }); await sleep(400);
  check(await page.evaluate(() => { const t = document.querySelector('#page-defis').innerText; return /Défi de la semaine/.test(t) && /Pain du jour/.test(t) && /Événements/.test(t) && /Coup de feu/.test(t) && !!document.querySelector('#page-defis [data-a="semaine"]'); }), 'la page Défis : pain du jour, défi de la semaine, les sept événements');
  await page.screenshot({ path: out + '/05p-defi-semaine.png' });
  await page.tap('#onglets [data-page="boutique"]'); await sleep(200);
  check(await page.evaluate(() => !!window.__fournil.st.trophees.premiere && !!window.__fournil.st.trophees.equipe), 'trophées gagnés en jouant : première fournée, une équipe');
  check(await page.evaluate(() => { const b = document.querySelector('#onglets [data-page="journal"] .badge'); return !b.hidden && +b.textContent >= 2; }), 'badge sur l’onglet Journal : trophées pas encore vus');
  await page.tap('#onglets [data-page="journal"]'); await sleep(400);
  const journal = await page.evaluate(() => document.querySelector('#page-journal').innerText);
  check(/Records/.test(journal) && /Mme Dupuis/.test(journal) && /Trophées · \d+\/\d+/.test(journal) && /Première fournée/.test(journal), 'le journal : records, habitués, trophées, événements');
  check(await page.evaluate(() => document.querySelector('#onglets [data-page="journal"] .badge').hidden), 'le badge du Journal s’efface une fois la page vue');
  await page.screenshot({ path: out + '/05q-journal.png' });
  await page.tap('#page-journal [data-a="partager"]', { force: true }); await sleep(400);
  check(await page.evaluate(() => /copié|Le Fournil|boutique/i.test((document.querySelector('.toast') || {}).textContent || '')), 'partager : repli sur le texte');
  await page.tap('#onglets [data-page="boutique"]'); await sleep(200);
  await page.evaluate(() => window.__fournil.habitue('dupuis')); await sleep(1500); await page.screenshot({ path: out + '/05r-habitue.png' }); await sleep(7000);
  check(await page.evaluate(() => window.__fournil.st.habitues.dupuis && window.__fournil.st.habitues.dupuis.jours === 1), 'Mme Dupuis est passée et a été servie');
  // coup de feu
  await page.evaluate(() => window.__fournil.rush()); await sleep(700);
  const rushTxt = await page.evaluate(() => ({ hidden: document.querySelector('#evenement').hidden, txt: document.querySelector('#evenement').innerText }));
  check(!rushTxt.hidden && /Coup de feu/.test(rushTxt.txt) && /×3/.test(rushTxt.txt), 'bannière du coup de feu : ' + rushTxt.txt.replace(/\n/g, ' / '));
  check(await page.evaluate(() => document.querySelector('#b-cloche').classList.contains('actif') && !document.querySelector('#b-cloche .point').hidden), 'la cloche s’anime pendant l’événement');
  await page.screenshot({ path: out + '/05d-coup-de-feu.png' });
  await page.tap('#evenement .ev-txt', { force: true }); await sleep(200);
  check(await page.evaluate(() => document.querySelector('#evenement').classList.contains('etendu')), 'toucher la bannière la déplie');
  await page.screenshot({ path: out + '/05d2-coup-de-feu-deplie.png' });
  await page.evaluate(() => { window.__fournil.st.ev.fin = Date.now() - 1; }); await sleep(500);
  check(await page.evaluate(() => document.querySelector('#evenement').hidden && !window.__fournil.st.ev && !document.querySelector('#b-cloche').classList.contains('actif')), 'le coup de feu se termine : la bannière disparaît, la cloche se calme');
  // commande spéciale puis livraison
  await page.evaluate(() => window.__fournil.commande()); await sleep(700);
  const cmd = await page.evaluate(() => ({ txt: document.querySelector('#evenement').innerText, n: window.__fournil.st.ev.n, livrer: !!document.querySelector('[data-a="livrer"]') }));
  check(/Commande spéciale/.test(cmd.txt) && !cmd.livrer, 'bannière de la commande : ' + cmd.txt.replace(/\n/g, ' / '));
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
  check(await page.evaluate(() => /pétrissage/i.test(document.querySelector('#evenement').innerText)), 'bannière du concours de pétrissage');
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
  await haut(); const pos = await zone('mystere');
  const coinsMys = await page.evaluate(() => window.__fournil.st.coins);
  await page.touchscreen.tap(pos.x, pos.y); await sleep(400);
  const tip = await page.evaluate(() => window.__fournil.st.coins) - coinsMys;
  check(tip >= 20, 'pourboire du client mystère : +' + Math.round(tip));
  // le mobilier : on touche l'emplacement des tables dans la boutique, on achète, un client vient s'asseoir
  await page.evaluate(() => window.__fournil.scene({ assis: true })); await haut();
  const tz = await zone('tables'); await page.touchscreen.tap(tz.x, tz.y); await sleep(400);
  const ficheTables = await page.evaluate(() => document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText);
  check(/Tables et chaises/.test(ficheTables) && /Pas encore installé/.test(ficheTables) && /Cran suivant/.test(ficheTables), 'toucher les tables ouvre leur fiche : ' + ficheTables.split('\n').slice(0, 2).join(' / '));
  await page.screenshot({ path: out + '/05s-fiche-tables.png' });
  await page.tap('[data-m="tables"]'); await sleep(400);
  check(await page.evaluate(() => window.__fournil.st.mobilier.tables === 1 && /cran 1 sur 4/.test(document.querySelector('#feuille-contenu').innerText)), 'tables cran 1 achetées, la fiche se met à jour');
  await page.tap('[data-a="close"]'); await sleep(200);
  for (const id of ['four', 'vitrine']) await page.evaluate((id) => window.__fournil.meuble(id), id);
  let assis = 0; for (let k = 0; k < 30 && !assis; k++) { await sleep(500); assis = await page.evaluate(() => window.__fournil.SCENE.assis); }
  check(assis > 0, 'un client vient s’asseoir au salon de thé');
  await page.screenshot({ path: out + '/05t-salon.png' });
  await page.evaluate(() => window.__fournil.scene({}));
  // bonus et mobilier dans la même feuille
  await page.tap('#b-ameliorations', { force: true }); await sleep(400);
  await page.tap('[data-tab="mobilier"]'); await sleep(300); await page.screenshot({ path: out + '/06b-mobilier.png' });
  check(await page.evaluate(() => document.querySelectorAll('#feuille-contenu .am.meuble').length === 6 && /Tables et chaises/.test(document.querySelector('#feuille-contenu').innerText)), 'le volet Mobilier liste les six meubles');
  await page.tap('[data-tab="bonus"]'); await sleep(300); await page.screenshot({ path: out + '/06-ameliorations.png' });
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
  const nomSheet = await page.evaluate(() => ({ txt: document.querySelector('#feuille-contenu').innerText, val: (document.querySelector('.champ') || {}).value }));
  check(/Boutique n°2/.test(nomSheet.txt) && nomSheet.val === 'Le Fournil de la Rue', 'nouvelle boutique : on choisit son nom (' + nomSheet.val + ')');
  await page.screenshot({ path: out + '/08b-nom.png' });
  check(await page.evaluate(() => document.querySelectorAll('.spe-grille [data-s]').length === 8), 'on choisit aussi la spécialité de la boutique');
  await page.fill('.champ', 'Chez Mamie'); await page.tap('[data-s="1"]', { force: true }); await page.tap('[data-a="ok"]'); await sleep(400);
  check(await page.evaluate(() => window.__fournil.st.nomBoutique === 'Chez Mamie' && window.__fournil.G.quartier(window.__fournil.st) === 1 && window.__fournil.st.specialite === 1), 'boutique nommée « Chez Mamie », dans le quartier parisien, spécialité croissants');
  check(await page.evaluate(() => document.querySelector('#enseigne span').textContent === 'Chez Mamie'), 'le nom s’affiche sur l’enseigne au-dessus de la scène');
  await haut(); await page.tap('#enseigne', { force: true }); await sleep(300);
  check(await page.evaluate(() => !document.querySelector('#feuille').hidden && (document.querySelector('.champ') || {}).value === 'Chez Mamie'), 'toucher l’enseigne ouvre le renommage');
  await page.tap('[data-a="non"]'); await sleep(200);
  const s2 = await W(); console.log('boutique 2', s2);
  check(s2.niv === '1,0,0,0,0,0,0,0' && await page.evaluate(() => window.__fournil.st.etoiles > 0 && Object.keys(window.__fournil.st.mobilier).length === 0 && window.__fournil.SCENE.apprentis === 0), 'nouvelle boutique : produits et mobilier remis à zéro, étoiles gardées, apprentis repartis');
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
  await page.tap('#onglets [data-page="reglages"]'); await sleep(400); await page.screenshot({ path: out + '/09a-reglages.png' });
  check(await page.evaluate(() => { const t = document.querySelector('#page-reglages').innerText; return /Sons/.test(t) && /Vibrations/.test(t) && /Renommer/.test(t) && /Sauvegarde/.test(t) && /Recommencer/.test(t) && document.querySelectorAll('#page-reglages .reglage .ico svg').length >= 6; }), 'la page Réglages : sons, vibrations, nom, sauvegarde, remise à zéro, avec leurs icônes');
  await page.tap('#page-reglages [data-a="son"]'); await sleep(200);
  check(await page.evaluate(() => window.__fournil.st.son === false && document.querySelector('#page-reglages [data-a="son"] .interrupteur').getAttribute('aria-checked') === 'false'), 'interrupteur des sons : coupé');
  await page.tap('#page-reglages [data-a="son"]'); await sleep(200);
  await page.tap('#page-reglages [data-a="sauvegarde"]'); await sleep(300);
  await page.screenshot({ path: out + '/09b-sauvegarde.png' });
  const code = await page.evaluate(() => document.querySelector('[data-r="code"]').value);
  check(code.startsWith('FOURNIL1.') && code.length > 200, 'code de sauvegarde produit (' + code.length + ' caractères)');
  await page.fill('[data-r="entree"]', 'pas un code'); await page.tap('[data-a="charger"]'); await sleep(300);
  check(await page.evaluate(() => /pas valide/.test((document.querySelector('.toast') || {}).textContent || '')), 'un code invalide est refusé');
  await page.evaluate(() => { window.__fournil.reset(); }); await sleep(1200);
  const s5 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s5.boutiques === 1 && s5.etoiles === 0, 'tout effacé : ' + JSON.stringify(s5));
  await page.tap('#onglets [data-page="reglages"]'); await sleep(300); await page.tap('#page-reglages [data-a="sauvegarde"]'); await sleep(300);
  await page.fill('[data-r="entree"]', code); await page.tap('[data-a="charger"]'); await sleep(300);
  await page.screenshot({ path: out + '/09c-charger-code.png' });
  await page.tap('[data-a="etoiles"]'); await sleep(500);
  const fusion = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(fusion.etoiles === s3.etoiles && fusion.boutiques === 1, 'étoiles récupérées du code, boutique gardée : ' + JSON.stringify(fusion));
  check(await page.evaluate(() => document.querySelector('#feuille').hidden && !document.querySelector('#page-reglages').hidden), 'après la fusion, la feuille se ferme sur les Réglages');
  await page.tap('#page-reglages [data-a="sauvegarde"]'); await sleep(300); await page.fill('[data-r="entree"]', code); await page.tap('[data-a="charger"]'); await sleep(300);
  await page.tap('[data-a="oui"]'); await sleep(1500);
  const s6 = await page.evaluate(() => ({ etoiles: window.__fournil.st.etoiles, boutiques: window.__fournil.st.boutiques }));
  check(s6.boutiques === 2 && s6.etoiles === s3.etoiles, 'boutique rechargée depuis le code : ' + JSON.stringify(s6));
  // petit écran
  const p2 = await (await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR' })).newPage();
  await p2.goto('http://localhost:8781/'); await sleep(700); await p2.screenshot({ path: out + '/10-petit-ecran.png' });
  const overflow = await p2.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'pas de défilement horizontal à 360 px');
  const dans = await p2.evaluate(() => { const c = document.querySelector('.carte[data-i="0"]').getBoundingClientRect(); return [...document.querySelectorAll('.carte[data-i="0"] .corps, .carte[data-i="0"] .corps > *, .carte[data-i="0"] .boutons')].every((el) => el.getBoundingClientRect().right <= c.right + 0.5) && document.querySelector('.carte[data-i="0"] .corps').getBoundingClientRect().right < document.querySelector('.carte[data-i="0"] .boutons').getBoundingClientRect().left; });
  check(dans, 'à 360 px, le corps de la carte ne chevauche pas les boutons');
  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
