// L'accueil des nouveaux joueurs (docs/accueil-contrat.md) sur un iPhone simulé : les premiers pas guidés (le doigt, le texte d'attente,
// « Passer », la reprise après rechargement), la carte « Ton premier jour » et sa récompense, les déblocages et leurs annonces (une bulle à la
// fois, dans l'ordre), une vieille sauvegarde qui garde tout, l'interrupteur (navigator.webdriver) et le petit écran 360 × 640.
// L'accueil est éteint sous Playwright (navigator.webdriver) : ce test l'allume (window.__accueil = true).
// Lancer : TZ=Europe/Paris node test/fournil-accueil.cjs (PORT_ACCUEIL pour changer de port ; CAPTURES=dossier pour y copier les captures)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const G = require('../src/game.js');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_ACCUEIL || 8891;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const URL_JEU = `http://localhost:${PORT}/fournil/`;
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const CAP = process.env.CAPTURES || ''; if (CAP) fs.mkdirSync(CAP, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const shot = async (p, nom) => { const f = path.join(out, `accueil-${nom}.png`); await p.screenshot({ path: f }); if (CAP) fs.copyFileSync(f, path.join(CAP, `${nom}.png`)); };
const attendre = async (p, fn, arg, ms = 8000) => { for (let t = 0; t < ms; t += 100) { if (await p.evaluate(fn, arg)) return true; await sleep(100); } return false; };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' };
// l'accueil allumé, les annonces espacées de 1,5 s (au lieu de 20), les événements du coin coupés ; la sonde : deux bulles à la fois, l'ordre des annonces
const ALLUMER = () => {
  window.__accueil = true; window.__accueilEcart = 1500; window.__sansEvenements = true;
  window.__sonde = { deux: 0, ids: [] };
  setInterval(() => { const f = window.__fournil; if (!f || !f.accueil) return; const a = document.querySelector('#annonce-accueil'), i = document.querySelector('#indice'); if (a && i && !a.hidden && !i.hidden) window.__sonde.deux++; const id = f.accueil.annonce(); const l = window.__sonde.ids; if (id && l[l.length - 1] !== id) l.push(id); }, 100);
};
const visible = (sel) => { const e = document.querySelector(sel); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const VISIBLE = `(${visible.toString()})`;
const etat = (p) => p.evaluate((V) => { const vis = eval(V), f = window.__fournil, s = f.st; return { tuto: s.tuto, coins: s.coins, indice: document.querySelector('#indice').hidden ? '' : document.querySelector('#indice-txt').textContent, passer: vis('#indice .passer'), annonce: f.accueil.annonce(), acc: Object.assign({}, s.accueil) }; }, VISIBLE);
// le doigt de la bulle pointe-t-il la cible (son centre x dans le rectangle de la cible, ± 30 px) ?
const doigt = (p, sel) => p.evaluate(([sel, V]) => { const vis = eval(V); if (!vis('#indice')) return false; const m = document.querySelector('#indice .main').getBoundingClientRect(), c = document.querySelector(sel).getBoundingClientRect(), x = m.left + m.width / 2; return x >= c.left - 30 && x <= c.right + 30; }, [sel, VISIBLE]);
const CACHES = ['#b-classement', '#b-atelier', '#b-chaine', '#b-etoiles', '#b-nouveautes', '.barre-achat .modes', '#b-ameliorations', '#objectifs', '#debutant', '#onglets [data-page="defis"]', '#onglets [data-page="boulanger"]', '#onglets [data-page="journal"]'];
// ce qui apparaît avec chaque annonce
const ELEMENT = { boulanger: '#onglets [data-page="boulanger"]', defis: '#onglets [data-page="defis"]', modes: '.barre-achat .modes', bonus: '#b-ameliorations', etoiles: '#b-etoiles', journal: '#onglets [data-page="journal"]', saison: '.carte.saison', classement: '#b-classement', atelier: '#b-atelier', decos: '#onglets [data-page="boulanger"]', garderobe: '#onglets [data-page="boulanger"]', chaine: '#b-chaine' };
const ORDRE = G.ACCUEIL.deblocages.map((d) => d.id);
const tiroir = async (p, pos) => { await p.evaluate((pos) => window.__fournil.tiroir(pos), pos); await sleep(350); };
const effleurer = (p) => p.tap('.solde'); // un toucher sans conséquence (le solde) : l'annonce s'efface

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const nouvellePage = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); }); return p; };

  // ─── A. une partie neuve, au doigt (390 × 844) ───
  console.log('── A. une partie neuve, au doigt ──');
  const ctxA = await browser.newContext(MOBILE); await ctxA.addInitScript(ALLUMER);
  const p = await nouvellePage(ctxA);
  await p.goto(URL_JEU); await sleep(1500);
  const debut = await p.evaluate(([C, V]) => { const vis = eval(V), m = document.querySelector('#indice .main'); return { actif: window.__fournil.accueil.actif, caches: C.filter(vis), boutique: vis('#onglets [data-page="boutique"]'), reglages: vis('#onglets [data-page="reglages"]'), cartes: [...document.querySelectorAll('.carte[data-i]')].filter((c) => !c.hidden).length, anim: getComputedStyle(m).animationName, main: vis('#indice .main') }; }, [CACHES, VISIBLE]);
  let e = await etat(p);
  check(debut.actif && e.acc.t === 0 && e.tuto === 0, 'l’accueil est allumé (window.__accueil) : une partie neuve, t 0');
  check(/Touche la baguette/.test(e.indice) && e.passer && debut.main && /tape/.test(debut.anim), `au lancement : la bulle « Touche la baguette », le doigt animé (${debut.anim}), « Passer »`);
  check(debut.caches.length === 0, 'cachés au lancement : classement, Atelier, Ma chaîne, étoiles, nouveautés, ×10/×100, Bonus, objectifs, carte du premier jour, Défis, Boulanger, Journal' + (debut.caches.length ? ` (visibles : ${debut.caches.join(', ')})` : ''));
  check(debut.boutique && debut.reglages && debut.cartes === 9, `visibles : les onglets Boutique et Réglages, 9 cartes (${debut.cartes})`);
  check(await doigt(p, '.carte[data-i="0"] .barre'), 'étape 0 : le doigt pointe la barre de la baguette');
  await shot(p, '01-premiers-pas-baguette');
  // étape 0 → 1 : une vraie touche
  await p.tap('.carte[data-i="0"] .barre');
  check(await attendre(p, () => window.__fournil.st.tuto === 1), 'une baguette vendue : étape 1');
  check(await attendre(p, () => /Encore/.test(document.querySelector('#indice-txt').textContent) && !document.querySelector('#indice').hidden), 'étape 1, pas encore les euros : le texte d’attente « Encore ! Touche la baguette… »');
  e = await etat(p); console.log('   ', e.indice);
  check(await doigt(p, '.carte[data-i="0"] .barre'), 'le texte d’attente pointe la baguette');
  await shot(p, '02-premiers-pas-attente');
  for (let k = 0; k < 12 && !(await p.evaluate(() => /améliore/.test(document.querySelector('#indice-txt').textContent))); k++) { await p.tap('.carte[data-i="0"] .barre'); await sleep(1150); }
  e = await etat(p);
  check(/améliore/.test(e.indice) && await doigt(p, '.carte[data-i="0"] [data-a="ameliorer"]'), 'assez d’euros : « améliore la baguette », le doigt sur « Améliorer »');
  await shot(p, '03-premiers-pas-ameliorer');
  await p.tap('.carte[data-i="0"] [data-a="ameliorer"]');
  check(await attendre(p, () => window.__fournil.st.tuto === 2), 'baguette niveau 2 : étape 2');
  check(await attendre(p, () => /croissants s’ouvrent/.test(document.querySelector('#indice-txt').textContent)), 'étape 2 : « Continue : les croissants s’ouvrent à 120 € »');
  // recharger au milieu : la bulle reprend à l'étape 2
  await p.reload(); await sleep(1500);
  e = await etat(p);
  check(e.tuto === 2 && /croissants/.test(e.indice) && e.passer, `rechargé au milieu : la bulle reprend à l’étape 2 (« ${e.indice} »)`);
  await p.evaluate(() => { const f = window.__fournil; f.give(Math.max(0, f.G.PRODUITS[1].debloquer - f.st.coins) + 0.5); });
  check(await attendre(p, () => /Débloque les croissants/.test(document.querySelector('#indice-txt').textContent)), 'les euros au plus juste : « Débloque les croissants »');
  check(await doigt(p, '.carte[data-i="1"] [data-a="debloquer"]'), 'le doigt sur « Débloquer » des croissants');
  await shot(p, '04-premiers-pas-croissants');
  await p.tap('.carte[data-i="1"] [data-a="debloquer"]');
  check(await attendre(p, () => window.__fournil.st.tuto === 3), 'croissants débloqués : étape 3');
  check(await attendre(p, () => /Léo s’embauche/.test(document.querySelector('#indice-txt').textContent)), 'étape 3 : « Cuis et vends encore : Léo s’embauche à 1,5 k€ »');
  await p.evaluate(() => { const f = window.__fournil; f.give(Math.max(0, f.G.prixStaff(f.st, 0) - f.st.coins) + 0.5); });
  check(await attendre(p, () => /Embauche Léo/.test(document.querySelector('#indice-txt').textContent)), '« Embauche Léo »');
  check(await doigt(p, '.carte[data-i="0"] [data-a="embaucher"]'), 'le doigt sur « Embaucher »');
  await shot(p, '05-premiers-pas-leo');
  check(await p.evaluate(() => { const s = window.__fournil.st; return !s.ev && s.evTimer >= 29 && s.mystereTimer >= 29; }), 'pendant les premiers pas : ni événement, ni client mystère (reportés)');
  await p.tap('.carte[data-i="0"] [data-a="embaucher"]');
  check(await attendre(p, () => window.__fournil.st.tuto === 4), 'Léo embauché : les premiers pas sont finis');
  check(await attendre(p, () => /Bravo, ta boulangerie tourne/.test(document.querySelector('#indice-txt').textContent) && !document.querySelector('#indice').hidden), 'la bulle « Bravo, ta boulangerie tourne ! Voici ta carte du premier jour… »');
  const deb = await p.evaluate((V) => { const vis = eval(V); return { vis: vis('#debutant'), txt: document.querySelector('#debutant').innerText, passer: vis('#indice .passer') }; }, VISIBLE);
  check(deb.vis && /Ton premier jour · [0-7]\/7/.test(deb.txt) && !deb.passer, `la carte « Ton premier jour » paraît (${deb.txt.split('\n')[0]}), plus de « Passer »`);
  check(await doigt(p, '#debutant'), 'le doigt pointe la carte du premier jour');
  await shot(p, '06-bravo-carte-premier-jour');
  // les annonces : la première après le « Bravo » (8 s) et 3 s
  check(await attendre(p, () => !!window.__fournil.accueil.annonce(), null, 16000), 'après le « Bravo » : une première annonce');
  const vues = new Set();
  const suivreAnnonce = async (attendu, ms = 9000) => { // attend une annonce (ou une parmi plusieurs), vérifie que son élément est là, puis l'efface d'un toucher
    const ok = await attendre(p, (a) => a.includes(window.__fournil.accueil.annonce()), attendu, ms);
    const id = await p.evaluate(() => window.__fournil.accueil.annonce());
    if (!ok) { check(false, `l’annonce attendue (${attendu.join(' ou ')}) : ${id || 'aucune'}`); return ''; }
    const r = await p.evaluate(([sel, V]) => { const vis = eval(V); return { el: sel ? vis(sel) : true, bulle: vis('#annonce-accueil'), txt: document.querySelector('#annonce-accueil .aa-txt').textContent }; }, [ELEMENT[id], VISIBLE]);
    check(r.bulle && r.el, `annonce « ${id} » : ${r.txt}${ELEMENT[id] ? ` — ${ELEMENT[id]} paraît` : ''}`);
    vues.add(id);
    if (!(await shotUneFois(id))) await sleep(900); // (l'annonce ne s'efface qu'après 800 ms)
    await effleurer(p);
    check(await attendre(p, () => !window.__fournil.accueil.annonce() && document.querySelector('#annonce-accueil').hidden, null, 1500), `« ${id} » s’efface au premier toucher`);
    return id;
  };
  const captures = new Set(['defis', 'atelier', 'bonus']);
  const shotUneFois = async (id) => { if (!captures.has(id)) return false; captures.delete(id); await sleep(900); await shot(p, `07-annonce-${id}`); return true; };
  const premiers = [];
  premiers.push(await suivreAnnonce(['boulanger', 'defis'], 4000));
  if (!premiers.includes('defis')) premiers.push(await suivreAnnonce(['defis']));
  check(premiers.join() === 'boulanger,defis', `les premières annonces, dans l’ordre du tableau : ${premiers.join(', ')}`);
  check(await p.evaluate((V) => eval(V)('#objectifs'), VISIBLE), 'les Défis ouverts : le ticket des objectifs du jour est là');
  // une recette au niveau 10 : les boutons ×10 / ×100
  await p.evaluate(() => window.__fournil.give(500));
  for (let k = 0; k < 10 && (await p.evaluate(() => window.__fournil.st.stations[0].niv < 10)); k++) { await p.tap('.carte[data-i="0"] [data-a="ameliorer"]'); await sleep(150); }
  await suivreAnnonce(['modes']);
  // 300 000 € d'un coup : plusieurs déblocages dus ensemble passent un à un, dans l'ordre du tableau
  await p.evaluate(() => { window.__sonde.ids = []; window.__fournil.give(3e5); });
  const lot = [];
  for (let k = 0; k < 6; k++) { const id = await suivreAnnonce(['bonus', 'etoiles', 'journal', 'saison', 'classement'], k ? 5000 : 9000); if (!id) break; lot.push(id); if (await p.evaluate(() => !window.__fournil.G.deblocagesDus(window.__fournil.st).some((x) => ['bonus', 'etoiles', 'journal', 'saison', 'classement'].includes(x)))) break; }
  check(lot.length >= 2 && lot.includes('bonus') && lot.includes('journal') && lot.every((id, k) => k === 0 || ORDRE.indexOf(lot[k - 1]) < ORDRE.indexOf(id)), `300 000 € : ${lot.join(', ')} — une à la fois, dans l’ordre du tableau`);
  await p.evaluate(() => window.__fournil.give(1e6)); await tiroir(p, 'mi');
  await suivreAnnonce(['atelier']);
  await p.evaluate(() => window.__fournil.give(1e7));
  const dix = await p.evaluate(() => window.__fournil.G.deblocagesDus(window.__fournil.st));
  if (dix.includes('decos')) await suivreAnnonce(['decos']);
  check(await attendre(p, () => window.__fournil.accueil.ouvert('evenements') && window.__fournil.accueil.ouvert('decos'), null, 9000), '10 M€ : Mes décos et les événements ouverts (les événements en silence)');
  // les sept étapes, par le jeu
  console.log('   les sept étapes du premier jour');
  await tiroir(p, 'mi');
  await p.evaluate(() => document.querySelector('.carte[data-i="2"]').scrollIntoView({ block: 'center' })); await sleep(250);
  await p.tap('.carte[data-i="2"] [data-a="debloquer"]'); await sleep(400);
  await p.evaluate(() => document.querySelector('#pages').scrollTo(0, 0)); await sleep(200);
  await p.tap('.barre-achat .modes [data-mode="10"]'); await sleep(200);
  for (let k = 0; k < 4 && (await p.evaluate(() => window.__fournil.st.stations[0].niv < 25)); k++) { await p.tap('.carte[data-i="0"] [data-a="ameliorer"]'); await sleep(250); }
  check(await attendre(p, () => (window.__fournil.st.accueil.o & 3) === 3, null, 3000), 'étapes 1 et 2 : les pains au chocolat débloqués, la baguette au niveau 25 (au doigt)');
  // le client mystère, touché dans la scène
  await p.evaluate(() => { window.__fournil.st.ev = null; window.__fournil.mystere(); }); await sleep(4800);
  await tiroir(p, 'ferme');
  const pos = await p.evaluate(() => { const r = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones().mystere; return z ? { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2 } : null; });
  if (pos) await p.touchscreen.tap(pos.x, pos.y); await sleep(400);
  if (!(await p.evaluate(() => window.__fournil.st.stats.pourboires >= 1))) { await p.evaluate(() => window.__fournil.mystere()); await sleep(4800); const q = await p.evaluate(() => { const r = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones().mystere; return z ? { x: r.left + z.x + z.w / 2, y: r.top + z.y + z.h / 2 } : null; }); if (q) await p.touchscreen.tap(q.x, q.y); await sleep(400); }
  check(await p.evaluate(() => window.__fournil.st.stats.pourboires >= 1), 'étape 3 : le client mystère touché (un pourboire)');
  // le critique, servi en touchant ses trois cartes
  await tiroir(p, 'mi');
  await p.evaluate(() => { window.__fournil.st.ev = null; window.__fournil.ev('critique'); }); await sleep(600);
  const restants = await p.evaluate(() => (window.__fournil.st.ev && window.__fournil.st.ev.restants ? window.__fournil.st.ev.restants.slice() : []));
  for (const i of restants) { await p.evaluate((i) => document.querySelector(`.carte[data-i="${i}"]`).scrollIntoView({ block: 'center' }), i); await sleep(200); await p.tap(`.carte[data-i="${i}"] .icone`, { force: true }); await sleep(300); }
  check(await p.evaluate(() => window.__fournil.st.stats.critiques >= 1), 'étape 4 : le critique conquis');
  // un meuble du salon (le raccourci du jeu), un bonus par sa feuille
  await p.evaluate(() => window.__fournil.meuble('tables')); await sleep(200);
  check(await p.evaluate(() => window.__fournil.st.stats.meubles >= 1), 'étape 5 : un meuble amélioré');
  await p.evaluate(() => document.querySelector('#pages').scrollTo(0, 0)); await sleep(200);
  await p.tap('#b-ameliorations'); await sleep(400); await p.tap('[data-tab="bonus"]'); await sleep(300); await p.tap('[data-id="farine"]'); await sleep(300);
  check(await p.evaluate(() => !!window.__fournil.st.ameliorations.farine), 'étape 6 : la farine de tradition achetée (Bonus)');
  await p.evaluate(() => { const c = document.querySelector('#feuille [data-a="close"]'); if (c) c.click(); }); await sleep(300);
  // les trois objectifs du jour réclamés dans Défis
  await p.evaluate(() => { for (const o of window.__fournil.st.jour.objectifs) { o.progres = o.cible; o.fait = true; } });
  await p.tap('#onglets [data-page="defis"]'); await sleep(500);
  for (let k = 0; k < 3; k++) { await p.tap(`#page-defis [data-k="${k}"]`, { force: true }); await sleep(350); }
  check(await p.evaluate(() => window.__fournil.st.stats.serieMax >= 1), 'étape 7 : les trois objectifs du jour réussis');
  await p.tap('#onglets [data-page="boutique"]'); await sleep(400); await tiroir(p, 'mi');
  await p.evaluate(() => document.querySelector('#pages').scrollTo(0, 0));
  check(await attendre(p, () => { const d = document.querySelector('#debutant'); return !d.hidden && /7\/7/.test(d.innerText) && /Cadeau/.test(d.innerText) && d.classList.contains('pret'); }, null, 4000), 'la carte passe à « 7/7 · Cadeau ! »');
  await sleep(1500); await p.evaluate(() => window.__fournil.accueil.fin());
  await shot(p, '08-carte-cadeau');
  const avantRes = await p.evaluate(() => window.__fournil.st.boosts.reserve.length);
  await p.tap('#debutant'); await sleep(500);
  check(await p.evaluate(() => /Ton premier jour/.test(document.querySelector('#feuille-contenu').innerText) && document.querySelectorAll('#feuille .db-liste li.fait').length === 7 && !!document.querySelector('[data-a="db-recevoir"]')), 'la feuille : les sept étapes faites, « Recevoir ma récompense »');
  await shot(p, '09-feuille-premier-jour');
  await p.tap('[data-a="db-recevoir"]'); await sleep(700);
  const rec = await p.evaluate(() => { const s = window.__fournil.st, f = window.__fournil.G; return { tab: f.possede(s, 'apprenti-tablier'), fou: f.possede(s, 'apprenti-foulard'), equipe: s.garderobe.equipe, res: s.boosts.reserve.map((x) => [x.mult, x.secs]), r: s.accueil.r, txt: document.querySelector('#feuille-contenu').innerText }; });
  check(rec.r === 1 && rec.tab && rec.fou && rec.equipe.haut === 'apprenti-tablier' && rec.equipe.accessoire === 'apprenti-foulard', 'la récompense : le tablier et le foulard d’apprenti, possédés et portés');
  check(rec.res.length === avantRes + 1 && rec.res.some(([m, s]) => m === 2 && s === 1800) && /Lancer le boost ×2/.test(rec.txt) && /Plus tard/.test(rec.txt), 'un boost ×2 de 30 min dans la réserve ; « Lancer le boost ×2 » et « Plus tard »');
  await shot(p, '10-recompense');
  await p.tap('[data-a="db-plus-tard"]'); await sleep(500);
  check(await p.evaluate((V) => { const vis = eval(V); return vis('#boosts') && !vis('#debutant') && vis('#b-nouveautes'); }, VISIBLE), '« Plus tard » : le boost reste dans la réserve (#boosts), la carte du premier jour disparaît, le cadeau des nouveautés paraît');
  await suivreAnnonce(['garderobe'], 9000);
  const garde = await p.evaluate(() => { const f = window.__fournil, a = f.st.accueil; return { a: Object.assign({}, a), res: f.st.boosts.reserve.length }; });
  // recharger : rien n'est rejoué, rien n'est redonné
  await p.reload(); await sleep(1200);
  let rejoue = '';
  for (let t = 0; t < 5000; t += 200) { const id = await p.evaluate(() => window.__fournil.accueil.annonce()); if (id) { rejoue = id; break; } await sleep(200); }
  const apres = await p.evaluate(() => { const f = window.__fournil; return { a: Object.assign({}, f.st.accueil), res: f.st.boosts.reserve.length, again: f.accueil.recevoir().ok }; });
  check(!rejoue && apres.a.r === 1 && apres.a.d === garde.a.d && apres.a.o === 127 && apres.res === garde.res && !apres.again, `rechargé : l’état gardé, aucune annonce rejouée en 5 s${rejoue ? ` (${rejoue})` : ''}, pas de seconde récompense (réserve ${apres.res})`);
  const sonde = await p.evaluate(() => window.__sonde);
  check(sonde.deux === 0, `jamais deux bulles à la fois (#annonce-accueil et #indice : ${sonde.deux} fois)`);
  await ctxA.close();

  // ─── B. « Passer » ───
  console.log('── B. « Passer » ──');
  const ctxB = await browser.newContext(MOBILE); await ctxB.addInitScript(ALLUMER);
  const pb = await nouvellePage(ctxB); await pb.goto(URL_JEU); await sleep(1500);
  await pb.tap('#indice .passer'); await sleep(400);
  const b = await pb.evaluate((V) => { const vis = eval(V); return { tuto: window.__fournil.st.tuto, indice: vis('#indice'), debutant: vis('#debutant') }; }, VISIBLE);
  check(b.tuto === 5 && !b.indice && b.debutant, '« Passer » : st.tuto 5, la bulle cachée, la carte du premier jour visible');
  check(await attendre(pb, () => window.__fournil.accueil.annonce() === 'defis', null, 8000), 'puis l’annonce des Défis');
  await sleep(900); await shot(pb, '11-passer-annonce-defis');
  await ctxB.close();

  // ─── C. une vieille sauvegarde garde tout ───
  console.log('── C. une vieille sauvegarde ──');
  const ancienne = async (regler, nom) => {
    const ctx = await browser.newContext(MOBILE); await ctx.addInitScript(ALLUMER);
    const pc = await nouvellePage(ctx);
    await pc.goto(`http://localhost:${PORT}/`); // l'accueil du dépôt (même origine) : la sauvegarde posée avant le lancement du jeu
    const s = G.newState(Date.now()); regler(s); delete s.accueil;
    await pc.evaluate((raw) => localStorage.setItem('fournil.v2', raw), JSON.stringify(s));
    await pc.goto(URL_JEU); await sleep(1500);
    await pc.evaluate(() => { const c = document.querySelector('#feuille [data-a="close"]'); if (c) c.click(); });
    const r = await pc.evaluate(([V]) => { const vis = eval(V), f = window.__fournil, st = f.st; return { a: Object.assign({}, st.accueil), vis: ['#b-atelier', '#b-chaine', '#b-etoiles', '#b-nouveautes', '.barre-achat .modes', '#b-ameliorations', '#objectifs'].filter((x) => !vis(x)), onglets: [...document.querySelectorAll('#onglets button')].filter((x) => !x.hidden).length, porte: f.accueil.ouvert('casino'), debutant: vis('#debutant'), apprenti: f.G.possede(st, 'apprenti-tablier') || f.G.possede(st, 'apprenti-foulard'), boost: st.boosts.reserve.some((x) => x.mult === 2 && x.secs === 1800) }; }, [VISIBLE]);
    let ann = '';
    for (let t = 0; t < 10000; t += 250) { const id = await pc.evaluate(() => window.__fournil.accueil.annonce() || (document.querySelector('#annonce-accueil').hidden ? '' : '?')); if (id) { ann = id; break; } await sleep(250); }
    check(r.a.t === 1 && r.a.r === 1, `${nom} : accueil.t 1 (tout ouvert, sans récompense)`);
    check(!r.vis.length && r.onglets === 5 && r.porte, `${nom} : tout visible comme avant (Atelier, Ma chaîne, étoiles, nouveautés, ×10/×100, Bonus, objectifs, 5 onglets, la porte du fond)${r.vis.length ? ' — manque ' + r.vis.join(', ') : ''}`);
    check(!ann && !r.debutant && !r.apprenti && !r.boost, `${nom} : aucune annonce en 10 s${ann ? ` (${ann})` : ''}, pas de carte du premier jour, pas de tenue d’apprenti, pas de boost ×2 de 30 min`);
    if (nom === 'boutique n°3') await shot(pc, '12-vieille-sauvegarde');
    await ctx.close();
  };
  await ancienne((s) => { const t = Date.now(); s.tuto = 7; s.boutiques = 3; s.lifetime = 1e9; s.lifetimeRun = 2e8; s.created = t - 30 * 864e5; s.lastSeen = t - 30e3; }, 'boutique n°3');
  await ancienne((s) => { const t = Date.now(); s.tuto = 0; s.created = t - 2 * 864e5; s.lastSeen = t - 30e3; }, 'tuto 0, créée il y a 2 jours');

  // ─── D. l'interrupteur : sans window.__accueil, navigator.webdriver l'éteint ───
  console.log('── D. l’interrupteur ──');
  const ctxD = await browser.newContext(MOBILE); await ctxD.addInitScript(() => { window.__sansEvenements = true; });
  const pd = await nouvellePage(ctxD); await pd.goto(URL_JEU); await sleep(1500);
  const d = await pd.evaluate((V) => { const vis = eval(V); return { actif: window.__fournil.accueil.actif, wd: navigator.webdriver, txt: document.querySelector('#indice-txt').textContent, passer: vis('#indice .passer'), debutant: vis('#debutant'), vis: ['#b-atelier', '#b-etoiles', '#b-nouveautes', '.barre-achat .modes', '#b-ameliorations', '#objectifs'].filter((x) => !vis(x)), onglets: [...document.querySelectorAll('#onglets button')].filter((x) => !x.hidden).length }; }, VISIBLE);
  check(d.wd === true && d.actif === false, 'sous Playwright (navigator.webdriver), sans window.__accueil : l’accueil est éteint');
  check(/Touche la baguette/.test(d.txt) && !d.passer && !d.debutant && !d.vis.length && d.onglets === 5, `éteint : tout visible, la bulle d’origine sans « Passer », pas de carte du premier jour${d.vis.length ? ' — manque ' + d.vis.join(', ') : ''}`);
  await ctxD.close();

  // ─── E. le petit écran (360 × 640) ───
  console.log('── E. 360 × 640 ──');
  const ctxE = await browser.newContext(Object.assign({}, MOBILE, { viewport: { width: 360, height: 640 } })); await ctxE.addInitScript(ALLUMER);
  const pe = await nouvellePage(ctxE); await pe.goto(URL_JEU); await sleep(1500);
  const petit = await pe.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), dans = (x) => x.left >= 0 && x.top >= 0 && x.right <= innerWidth && x.bottom <= innerHeight; const ind = r('#indice'), pa = r('#indice .passer'), bulle = r('#indice .bulle'), barre = r('.carte[data-i="0"] .barre'), og = r('#onglets'), ti = r('#tiroir'); return { ind: dans(bulle) && dans(ind), passer: dans(pa) && pa.width >= 44 && pa.height >= 32, barre: barre.top >= ti.top && barre.bottom <= og.top, scroll: document.documentElement.scrollWidth <= innerWidth }; });
  check(petit.ind && petit.passer, '360 × 640 : la bulle et « Passer » (≥ 44 × 32) entièrement dans l’écran');
  check(petit.barre && petit.scroll, '360 × 640 : la barre de la baguette visible au-dessus des onglets, pas de défilement horizontal');
  await shot(pe, '13-360x640-premiers-pas');
  await pe.tap('#indice .passer'); await sleep(600); await pe.evaluate(() => window.__fournil.tiroir('mi')); await sleep(400);
  const petit2 = await pe.evaluate(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(), db = r('#debutant'), c = r('.carte[data-i="0"] .barre'), og = r('#onglets'), ti = r('#tiroir'); return { h: db.height, w: db.right <= innerWidth, carte: c.top >= ti.top && c.bottom <= og.top, scroll: document.documentElement.scrollWidth <= innerWidth }; });
  check(petit2.h > 0 && petit2.h <= 60 && petit2.w && petit2.scroll, `360 × 640 : la carte du premier jour tient sur sa ligne (${Math.round(petit2.h)} px de haut)`);
  check(petit2.carte, '360 × 640 : la carte de la baguette reste visible au cran « mi » du tiroir');
  await shot(pe, '14-360x640-carte-premier-jour');
  await ctxE.close();

  check(errors.length === 0, `aucune erreur de page${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
