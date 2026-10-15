// Les activités d'un événement du Fournil sur la vraie page (src/evenement.js, src/activites.js), jouées AU DOIGT sur un téléphone en portrait
// (390 × 844, des évènements tactiles bruts, comme test/fournil-atelier.cjs) : la barre des trois boutons (Mini-jeux, Contrats et sa pastille,
// Opération et son chrono), une partie de chaque mini-jeu (le guet en rythme, le compte, la tournée tracée), un contrat réclamé une fois,
// une opération lancée, puis ramassée à l'ouverture suivante avec sa feuille. Appelé par test/fournil-quartier.cjs et test/fournil-hantee.cjs.
'use strict';
const path = require('path'), fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function parcoursActivites(o) {
  // o : { browser, url, heure(ms) (l'heure du « vrai » temps du test), quand (ms), fauxTelephone, route, check, errors, dirs: [dossiers des captures],
  //       prefixe, racine ('#planque'), ev ('evenement' | 'evHantee'), ouvrir ('quartier' | 'hantee'), cle ('quartier' | 'hantee'), nom }
  const { browser, check, racine, cle } = o;
  const decal = o.quand - Date.now(); o.heure(o.quand);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(o.fauxTelephone, decal); if (o.route) await ctx.route(o.route[0], o.route[1]);
  const p = await ctx.newPage(); p.on('pageerror', (e) => { o.errors.push(e.message); console.log('PAGEERROR', e.message); });
  const cdp = await ctx.newCDPSession(p);
  const touche = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const toucher = async (x, y) => { await touche('touchStart', [[x, y]]); await touche('touchEnd', []); };
  const centre = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, r: b.right, bas: b.bottom }; }, sel);
  const toucherEl = async (sel) => { let c = null; for (let k = 0; k < 40 && !c; k++) { c = await centre(sel); if (!c) await sleep(50); } if (!c) { await p.screenshot({ path: path.join(o.dirs[0], `${o.prefixe}echec.png`) }); throw new Error('introuvable : ' + sel); } await toucher(c.x, c.y); return c; };
  const glisser = async (pts) => { await touche('touchStart', [pts[0]]); for (let k = 1; k < pts.length; k++) { await touche('touchMove', [pts[k]]); if (k % 4 === 0) await sleep(1); } await touche('touchEnd', []); };
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const shot = async (nom) => { const f = path.join(o.dirs[0], `${o.prefixe}${nom}.png`); await p.screenshot({ path: f }); for (const d of o.dirs.slice(1)) fs.copyFileSync(f, path.join(d, `${o.prefixe}${nom}.png`)); };
  const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 60) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(60); } return false; };
  const feuille = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const mini = () => ev((e) => window.__fournil[e].mini(), o.ev);
  const qst = () => ev((c) => { const q = window.__fournil.st[c]; return { billets: q.billets, total: q.total, mini: JSON.parse(JSON.stringify(q.mini)), contrats: JSON.parse(JSON.stringify(q.contrats)), operation: q.operation && { ...q.operation }, stats: { ...q.stats }, boosts: q.boosts }; }, cle);

  await p.goto('about:blank'); await p.goto(o.url);
  await p.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 20000 }); await sleep(800);
  // une partie déjà commencée (le 2e jour ou plus) : entrée, annonce vue, trois produits et leurs apprentis, de quoi vivre (sans franchir de palier)
  await ev(([e, c]) => { const F = window.__fournil, E = F[e], R = E.R, q = R.etat(F.st, HORLOGE.maintenant()); q.majeur = true; q.annonce = true; q.billets = 2e6; for (let i = 0; i < 3; i++) { R.acheter(q, i); R.embaucher(q, i); } q.billets = 2e6; q.evTimer = 9999; F.save();
    const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="pq-tard"]'); if (b) b.click(); document.querySelector('#feuille').hidden = true; document.querySelector('#voile').hidden = true; }, [o.ev, cle]);
  await ev((f) => window.__fournil[f](), o.ouvrir); await sleep(1200);
  await ev(() => { const b = document.querySelector('#feuille:not([hidden]) .btn'); if (b) b.click(); });
  await sleep(300);

  console.log(`── ${o.nom} : la barre des activités ──`);
  const barre = await ev((r) => [...document.querySelectorAll(`${r} .pq-act-btn`)].map((b) => { const x = b.getBoundingClientRect(); return { txt: b.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(x.height), g: Math.round(x.left), d: Math.round(x.right), coupe: [...b.querySelectorAll('b')].some((t) => t.scrollWidth > t.clientWidth + 1) }; }), racine);
  check(barre.length === 3 && /Mini-jeux/.test(barre[0].txt) && /Contrats/.test(barre[1].txt) && /Opération/.test(barre[2].txt), `trois boutons sous la scène : ${barre.map((b) => `« ${b.txt} »`).join(', ')}`);
  check(barre.every((b) => b.h >= 44 && b.g >= 0 && b.d <= 390 && !b.coupe), `tous dans l’écran de 390 px, 44 px de haut au moins, leurs noms entiers (${barre.map((b) => `${b.g}–${b.d} × ${b.h}`).join(', ')})`);
  await shot('a1-barre');

  console.log(`── ${o.nom} : une partie de chaque mini-jeu, au doigt ──`);
  const lancerJeu = async (id) => {
    await toucherEl(`${racine} .pq-act-btn[data-act="mini"]`); await attendre(async () => /Les mini-jeux/.test(await feuille()), 3000); await sleep(450); // la feuille monte (animation) : on attend qu'elle soit en place
    if (id === 'guet') { const f = await feuille(); check(/Le guet/.test(f) && /Le compte/.test(f) && /La tournée/.test(f) && /payée/.test(f), 'la feuille des mini-jeux : le guet, le compte, la tournée, et les parties payées qui attendent'); await shot('a2-minijeux'); }
    await toucherEl(`#feuille [data-jeu="${id}"]`); await attendre(async () => (await mini()).ecran === 'accueil', 3000);
    if (id === 'guet') await shot('a3-guet-accueil');
    await toucherEl(`${racine} [data-mini="jouer"]`); await attendre(async () => (await mini()).ecran === 'jeu', 3000);
  };
  const fin = async (ms = 60000) => { await attendre(async () => (await mini()).ecran === 'resultat', ms); await sleep(700); return mini(); }; // (les boutons du résultat attendent 0,6 s)
  const avant = await qst();
  // le guet : le doigt regarde le passant, prévoit l'instant juste (le centre de la lumière) et touche
  await lancerJeu('guet'); let photo = false, vus = new Set();
  for (let t0 = Date.now(); Date.now() - t0 < 45000;) {
    const m = await mini(); if (m.ecran !== 'jeu') break; const e = m.partie; if (!e) { await sleep(20); continue; }
    if (!photo && e.t > 6 && e.phase === 'passe') { photo = true; await shot('a4-guet-partie'); continue; }
    const avantCible = (e.cible - e.x) / e.vitesse, cle2 = `${e.cible}`;
    if (e.phase === 'passe' && !vus.has(cle2) && avantCible < 0.25) { vus.add(cle2); if (avantCible > 0.012) await sleep(avantCible * 1000 - 12); await toucher(e.touche.x, e.touche.y); }
    else await sleep(10);
  }
  let r = (await fin()).resultat; let apres = await qst();
  check(r && r.id === 'guet' && r.score > 0 && r.prime > 0 && apres.mini.gains === r.prime && apres.billets > avant.billets + r.prime * 0.99 && apres.mini.records.guet === r.score && apres.mini.payees === 1, `le guet, joué au doigt : ${r && r.score} points, +${r && r.prime} (une partie payée ; la boutique a continué de vendre)`);
  await shot('a5-guet-resultat');
  await toucherEl(`${racine} [data-mini="retour"]`); await sleep(300);
  // le compte : le doigt touche le bon nombre
  await lancerJeu('compte'); photo = false;
  for (let t0 = Date.now(); Date.now() - t0 < 50000;) {
    const m = await mini(); if (m.ecran !== 'jeu') break; const e = m.partie; if (!e) { await sleep(20); continue; }
    if (!photo && e.phase === 'montre' && e.k >= 1) { photo = true; await shot('a6-compte-partie'); }
    if (e.phase === 'choix') { await toucherEl(`${racine} .pq-compte-btn[data-v="${e.n}"]`); await sleep(120); } else await sleep(30);
  }
  r = (await fin()).resultat; apres = await qst();
  check(r && r.id === 'compte' && r.score >= 8 && r.prime > 0 && apres.mini.payees === 2, `le compte, joué au doigt : ${r && r.score} points, +${r && r.prime}`);
  await toucherEl(`${racine} [data-mini="retour"]`); await sleep(300);
  // la tournée : le doigt trace d'un arrêt à l'autre, un point tous les ~12 px
  await lancerJeu('tournee'); photo = false; const faites = new Set();
  for (let t0 = Date.now(); Date.now() - t0 < 50000;) {
    const m = await mini(); if (m.ecran !== 'jeu') break; const e = m.partie; if (!e) { await sleep(20); continue; }
    if (e.phase === 'trace' && !faites.has(e.k)) {
      faites.add(e.k); const pts = []; const a = e.arrets;
      for (let k = 1; k < a.length; k++) { const [ax, ay] = a[k - 1], [bx, by] = a[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 12)); for (let j = k === 1 ? 0 : 1; j <= n; j++) pts.push([ax + (bx - ax) * j / n, ay + (by - ay) * j / n]); }
      if (e.k === 1) { await glisser(pts.slice(0, Math.floor(pts.length / 2))); await sleep(150); await shot('a7-tournee-partie'); await glisser(pts.slice(Math.floor(pts.length / 2) - 1)); } else await glisser(pts);
    } else await sleep(40);
  }
  r = (await fin()).resultat; apres = await qst();
  check(r && r.id === 'tournee' && r.score >= 150 && r.prime > 0 && apres.mini.payees === 3 && apres.mini.jetons === 0, `la tournée, tracée au doigt : ${r && r.score} points, +${r && r.prime} ; les trois parties payées de l’heure sont jouées`);
  await toucherEl(`${racine} [data-mini="retour"]`); await sleep(500);
  check(await ev((r2) => document.querySelector(`${r2} .pq-act-btn[data-act="mini"] small`).textContent, racine) !== '' && !(await mini()).ouvert, 'retour à la boutique : la partie suivante sera pour le record (ou au prochain jeton)');

  console.log(`── ${o.nom} : un contrat de la nuit, réclamé une fois ──`);
  const c0 = await ev(([e, c]) => { const F = window.__fournil, R = F[e].R, q = F.st[c], l = R.etatContrats(q, HORLOGE.maintenant()), x = l[0]; if (x.produit != null) q.stats.vendus[x.produit] += x.n; else q.stats[x.stat] += x.n; return x; }, [o.ev, cle]); // le premier contrat du jour, rempli
  await attendre(() => ev((r2) => !document.querySelector(`${r2} .pq-pastille`).hidden, racine), 3000);
  check(await ev((r2) => document.querySelector(`${r2} .pq-pastille`).textContent, racine) === '1', `la pastille « 1 » sur Contrats : « ${c0.texte} » est rempli`);
  await shot('a8-contrat-pastille');
  await toucherEl(`${racine} .pq-act-btn[data-act="contrats"]`); await attendre(async () => /Les contrats de la nuit/.test(await feuille()), 3000); await sleep(450);
  await shot('a9-contrats');
  const b1 = (await qst()).billets; await toucherEl('#feuille .pq-ctr.pret [data-k="0"]'); await sleep(500); apres = await qst();
  check(apres.contrats.reclames[0] === true && apres.billets > b1 && apres.stats.contrats === 1 && /Réclamé/.test(await feuille()), `réclamé : +${Math.round(apres.billets - b1)} ; la ligne dit « Réclamé ✓ »`);
  check(!(await ev(() => !!document.querySelector('#feuille [data-k="0"]'))) && await ev((r2) => document.querySelector(`${r2} .pq-pastille`).hidden, racine), 'plus de bouton pour le réclamer deux fois ; la pastille s’éteint');
  await toucherEl('#feuille [data-a="pq-retour"]'); await sleep(300);

  console.log(`── ${o.nom} : une opération lancée, puis ramassée à l’ouverture suivante ──`);
  await toucherEl(`${racine} .pq-act-btn[data-act="operation"]`); await attendre(async () => /5 min/.test(await feuille()) && /60 min/.test(await feuille()), 3000); await sleep(450);
  await shot('a10-operations');
  await toucherEl('#feuille [data-op="court"]'); await sleep(500);
  apres = await qst();
  check(apres.operation && apres.operation.id === 'court' && apres.operation.fin - apres.operation.debut === 5 * 60e3 && /Fin dans/.test(await feuille()), `lancée : ${apres.operation && apres.operation.gain} promis dans 5 min ; la feuille montre le chrono`);
  await toucherEl('#feuille [data-a="pq-retour"]'); await sleep(1200);
  const chrono = await ev((r2) => document.querySelector(`${r2} .pq-act-btn[data-act="operation"] small`).textContent, racine);
  check(/^\d:\d\d$/.test(chrono) && await ev((r2) => document.querySelector(`${r2} .pq-act-btn[data-act="operation"]`).classList.contains('actif'), racine), `le bouton Opération montre son chrono (${chrono})`);
  await shot('a11-operation-chrono');
  // on ferme l'écran de l'événement ; cinq minutes passent (l'opération, partie plus tôt), on revient : elle est ramassée, avec sa feuille
  await toucherEl(`${racine} [data-pq="fermer"]`); await sleep(500);
  const gain = apres.operation.gain, saisi = apres.operation.saisi, ops0 = apres.stats.operations + apres.stats.operationsSaisies;
  await ev(([c]) => { const q = window.__fournil.st[c], t = HORLOGE.maintenant(); q.operation.debut = t - 6 * 60e3; q.operation.fin = t - 60e3; q.lastSeen = t; window.__fournil.save(); }, [cle]);
  const b2 = (await qst()).billets; await ev((f) => window.__fournil[f](), o.ouvrir);
  check(await attendre(async () => /Ramasser/.test(await feuille()), 4000), 'à l’ouverture suivante : la feuille de l’opération terminée'); await sleep(450);
  apres = await qst();
  check(apres.operation === null && apres.billets - b2 >= gain - saisi - 1 && apres.stats.operations + apres.stats.operationsSaisies === ops0 + 1, `ramassée une fois : +${gain - saisi}${saisi ? ` (${saisi} perdus en route)` : ''}`);
  await shot('a12-operation-ramassee');
  await toucherEl('#feuille [data-a="pq-op-ok"]'); await sleep(300);
  check((await feuille()) === '' && await ev((r2) => /lancer/.test(document.querySelector(`${r2} .pq-act-btn[data-act="operation"] small`).textContent), racine), 'la feuille se referme ; le bouton propose d’en lancer une autre');
  await ctx.close();
};
