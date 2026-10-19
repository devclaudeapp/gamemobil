// Les activités d'un événement du Fournil sur la vraie page (src/evenement.js, src/activites.js), jouées AU DOIGT sur un téléphone en portrait
// (390 × 844, des évènements tactiles bruts, comme test/fournil-atelier.cjs) : la barre des trois boutons (Mini-jeux, Contrats et sa pastille,
// Opération et son chrono), une partie de chaque mini-jeu (le guet en rythme, le compte, la tournée tracée), un contrat réclamé une fois,
// une opération lancée, puis ramassée à l'ouverture suivante avec sa feuille ; la recette du jour : sa carte en tête de la liste (le nom du
// jour, « Demain : … », la maîtrise 0/500 et ses repères), préparée, une fournée lancée au doigt, sortie, puis l'étape des 100 fournées et
// ses étoiles dans la boulangerie. Appelé par test/fournil-quartier.cjs et test/fournil-hantee.cjs (o.rj : le nom des captures de la carte,
// copiées aussi dans le dossier SHOTS_RJ s'il est donné).
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

  console.log(`── ${o.nom} : la recette du jour, en tête de la liste ──`);
  const rjDir = process.env.SHOTS_RJ ? (fs.mkdirSync(process.env.SHOTS_RJ, { recursive: true }), process.env.SHOTS_RJ) : null;
  const shotRj = async (nom) => { await ev((r2) => { const c = document.querySelector(`${r2} .rj-carte`); if (c) c.scrollIntoView({ block: 'center' }); for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }, racine); await sleep(250); await shot(nom); if (rjDir) fs.copyFileSync(path.join(o.dirs[0], `${o.prefixe}${nom}.png`), path.join(rjDir, `${o.rj || cle}-${nom}.png`)); await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
  const carteRj = () => ev((r2) => { const c = document.querySelector(`${r2} .rj-carte`); if (!c) return null; const b = c.getBoundingClientRect(), l = c.parentElement.firstElementChild === c, btn = c.querySelector('[data-a="rj-niv"]');
    return { premier: l, txt: c.innerText.replace(/\s+/g, ' ').trim(), g: Math.round(b.left), d: Math.round(b.right), h: Math.round(b.height), cls: c.className, btn: btn ? btn.innerText.replace(/\s+/g, ' ').trim() : '', jauge: c.querySelector('.barre i') ? c.querySelector('.barre i').style.width : '', reperes: c.querySelectorAll('.rj-repere').length,
      debord: [...c.querySelectorAll('h3, .rj-tag, .rj-demain, .palier span')].some((x) => x.scrollWidth > x.clientWidth + 1) }; }, racine);
  const etatRj = () => ev(([e, c]) => { const F = window.__fournil, R = F[e].R, q = F.st[c], t = HORLOGE.maintenant(); return { r: R.recetteDuJour(t).nom, demain: R.recetteDemain(t).nom, rc: JSON.parse(JSON.stringify(q.recettes)), billets: q.billets, total: q.total, etoiles: F.st.etoiles, prix: R.prixRecette(q) }; }, [o.ev, cle]);
  let e0 = await etatRj(), c1 = await carteRj();
  check(c1 && c1.premier && c1.txt.includes(e0.r) && c1.txt.includes(`Demain : ${e0.demain}`) && /Maîtrise 0\/500/.test(c1.txt) && c1.reperes === 2 && /Préparer/.test(c1.btn), `la carte, en tête des cartes : « ${e0.r} », « Demain : ${e0.demain} », la maîtrise 0/500 (repères 100 et 250), « ${c1 && c1.btn} »`);
  check(c1 && c1.g >= 0 && c1.d <= 390 && !c1.debord, `dans l’écran de 390 px, rien de coupé (${c1 && `${c1.g}–${c1.d} × ${c1.h}`})`);
  await shotRj('r1-carte');
  await toucherEl(`${racine} .rj-carte [data-a="rj-niv"]`); await sleep(400); let e1 = await etatRj(); c1 = await carteRj();
  check(e1.rc.niv === 1 && Math.abs(e0.billets - e1.billets - e0.prix) <= Math.max(1, e0.prix * 1e-9) + (e1.total - e0.total) && /Améliorer/.test(c1.btn) && /Touche/.test(c1.txt) && /\b1\b/.test(c1.txt), `préparée au doigt : niveau 1, ${Math.round(e0.prix)} payés ; le bouton propose « ${c1.btn} », la carte dit « Touche ! »`);
  await toucherEl(`${racine} .rj-carte .barre`); await sleep(1500); e1 = await etatRj(); c1 = await carteRj();
  check(e1.rc.four && e1.rc.four.fin > e1.rc.four.debut && /actif/.test(c1.cls) && parseFloat(c1.jauge) > 0 && !/Touche/.test(c1.txt), `une fournée lancée au doigt : la jauge de cuisson avance (${c1.jauge}), +${Math.round(e1.rc.four.gain)} à la sortie`);
  await shotRj('r2-cuisson');
  const g1 = e1.rc.four.gain, t1 = e1.total; await ev(([c]) => { const q = window.__fournil.st[c]; q.recettes.four.fin = HORLOGE.maintenant() - 1; }, [cle]); // la fin de la cuisson (sans attendre 20 à 90 s)
  await attendre(async () => (await etatRj()).rc.fournees === 1, 3000); let e2 = await etatRj(); c1 = await carteRj();
  check(e2.rc.fournees === 1 && e2.rc.four === null && e2.total >= t1 + g1 * 0.999 && /Touche/.test(c1.txt) && /Maîtrise 1\/500/.test(c1.txt), `sortie : +${Math.round(g1)}, la maîtrise passe à 1/500, « Touche ! » de nouveau (rien ne se relance seul)`);
  // l'étape des 100 fournées : sa feuille, ses étoiles dans la boulangerie
  await ev(([c]) => { window.__fournil.st[c].recettes.fournees = 99; }, [cle]); const et0 = (await etatRj()).etoiles;
  await toucherEl(`${racine} .rj-carte .barre`); await sleep(300); await ev(([c]) => { const q = window.__fournil.st[c]; if (q.recettes.four) q.recettes.four.fin = HORLOGE.maintenant() - 1; }, [cle]);
  check(await attendre(async () => /Maîtrise : 100 fournées/.test(await feuille()), 4000), 'à la 100e fournée : la feuille de la maîtrise'); await sleep(450);
  const e3 = await etatRj(), f3 = await feuille();
  check(e3.rc.etapes.join() === '100' && e3.etoiles === et0 + 2 && e3.rc.aVerser === 0 && /2 étoiles/.test(f3), `+2 étoiles versées dans la boulangerie (${et0} → ${e3.etoiles}), une fois`);
  if (rjDir) { const f = path.join(rjDir, `${o.rj || cle}-r3-maitrise.png`); await p.screenshot({ path: f }); }
  await toucherEl('#feuille [data-a="pq-ok"]'); await sleep(400); c1 = await carteRj();
  check((await feuille()) === '' && /Maîtrise 100\/500/.test(c1.txt) && /\+3 ★/.test(c1.txt) && !c1.debord, `la carte : « Maîtrise 100/500 », la prochaine étape « +3 ★ » (le repère de 100 allumé), rien de coupé`);
  await shotRj('r4-maitrise-100');
  // la 500e : ses étoiles, et la toque pour la boutique (q.decos), posée dans la boulangerie au retour
  await ev(([c]) => { const r = window.__fournil.st[c].recettes; r.fournees = 499; r.etapes = [100, 250]; }, [cle]); const et5 = (await etatRj()).etoiles;
  await toucherEl(`${racine} .rj-carte .barre`); await sleep(300); await ev(([c]) => { const q = window.__fournil.st[c]; if (q.recettes.four) q.recettes.four.fin = HORLOGE.maintenant() - 1; }, [cle]);
  check(await attendre(async () => /Maîtrise : 500 fournées/.test(await feuille()), 4000), 'à la 500e fournée : la feuille de la maîtrise'); await sleep(450);
  const e5 = await etatRj(), f5 = await feuille(), deco = await ev(([e]) => window.__fournil[e].R.DECO_RECETTE, [o.ev]);
  check(e5.etoiles === et5 + 5 && /toque/.test(f5) && await ev(([c, dd]) => window.__fournil.st[c].decos.includes(dd), [cle, deco]), `+5 étoiles et « ${f5.split('\n').find((l) => /toque/.test(l)) || '?'} »`);
  await toucherEl('#feuille [data-a="pq-ok"]'); await sleep(300); await toucherEl(`${racine} [data-pq="fermer"]`); await sleep(500);
  const vues = cle === 'hantee' ? () => ev(() => window.__fournil.SCENE.decosHanteeVues) : () => ev(() => window.__fournil.SCENE.decosVues);
  check(await attendre(async () => (await vues()).includes(deco), 8000), `dans la boulangerie, la toque est accrochée à la porte de l’arrière-boutique (« ${deco} »)`);
  await sleep(600); if (rjDir) await p.screenshot({ path: path.join(rjDir, `${o.rj || cle}-r5-toque-boutique.png`) });
  await ctx.close();
};
