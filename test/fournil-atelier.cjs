// L'Atelier du Fournil dans la vraie page (fournil/ servie en local), sur un téléphone en portrait, joué AU DOIGT : toutes les touches et
// tous les tracés des mini-jeux passent par de vrais évènements tactiles (CDP Input.dispatchTouchEvent), comme sur un iPhone.
// Parcours (iPhone 390 × 844, finesse 3) : la carte de l'Atelier dans les Défis ; l'enfournement en rythme joué en entier (enfourner au passage,
// sortir au doré, combo) ; le façonnage (entailles, spirale, tresse tracées au doigt) ; la mémoire du pâtissier (recettes remises dans l'ordre,
// une erreur finit la partie) ; les records, le gain de chaque partie, puis le plafond du jour (au-delà : record sans gain) ; aucun événement
// surprise pendant une partie ; la sauvegarde après rechargement ; hors ligne. Puis un petit écran (360 × 640) et l'artefact Claude.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-atelier.cjs
//   captures dans test/shots/fournil-atelier/ (ou SHOTS=dossier) ; PORT_ATELIER pour choisir le port (sinon un port libre)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(+process.env.PORT_ATELIER || 0);
const out = process.env.SHOTS || path.join(__dirname, 'shots', 'fournil-atelier'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 50) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(50); } return false; };

// ─── le doigt : des évènements tactiles bruts, comme un vrai téléphone ───
function doigt(p, cdp) {
  const ev = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 })) });
  const toucher = async (x, y) => { await ev('touchStart', [[x, y]]); await ev('touchEnd', []); };
  const centre = (sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; if (e.closest('#pages')) e.scrollIntoView({ block: 'center' }); /* dans le tiroir : au milieu de la liste, loin de la barre d'onglets */ const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height }; }, sel);
  const toucherEl = async (sel) => { const c = await centre(sel); if (!c) throw new Error('introuvable : ' + sel); await toucher(c.x, c.y); return c; };
  const glisser = async (pts) => { // un trait au doigt : poser, glisser point par point, lever
    await ev('touchStart', [pts[0]]);
    for (let k = 1; k < pts.length; k++) { await ev('touchMove', [pts[k]]); if (k % 4 === 0) await sleep(1); }
    await ev('touchEnd', []);
  };
  return { toucher, toucherEl, glisser, centre };
}
// un trait du modèle (coordonnées d'écran) suivi d'un doigt un peu tremblant : un point tous les ~12 px (un doigt rapide à 60 images/s)
function suivre(trait, tremble, seed) {
  let s = seed || 1; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  const pts = [];
  for (let k = 1; k < trait.length; k++) {
    const [ax, ay] = trait[k - 1], [bx, by] = trait[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 12));
    for (let j = k === 1 ? 0 : 1; j <= n; j++) pts.push([ax + (bx - ax) * j / n + rnd() * tremble, ay + (by - ay) * j / n + rnd() * tremble]);
  }
  return pts;
}
const etat = (p) => p.evaluate(() => window.__fournil.atelier());
// la toile se dessine à la taille où elle s'affiche (sinon l'image est écrasée et le doigt tombe à côté du modèle)
const toileJuste = (p) => p.evaluate(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); /* ce qui est affiché : la toile se recale avant l'image suivante */ const cv = document.querySelector('.at-toile'); if (!cv) return null; const r = cv.getBoundingClientRect(), k = Math.min(3, devicePixelRatio || 1); return { css: Math.round(r.height), dessin: Math.round(cv.height / k), ok: Math.abs(cv.height / k - r.height) <= 1 && Math.abs(cv.width / k - r.width) <= 1 }; });
// les titres de l'en-tête tiennent sans être coupés ; les boutons visibles font 44 px au moins
const enTete = (p) => p.evaluate(() => { const t = document.querySelector('#at-titre'), s = document.querySelector('#at-sous'); return { titre: t.textContent, sous: s.textContent, entier: t.scrollWidth <= t.clientWidth + 1 && s.scrollWidth <= s.clientWidth + 1 }; });
const boutonsVisibles = (p) => p.evaluate(() => [...document.querySelectorAll('#atelier button')].filter((b) => b.offsetParent && getComputedStyle(b).visibility !== 'hidden').map((b) => { const r = b.getBoundingClientRect(); return [b.innerText.trim() || b.getAttribute('aria-label'), Math.round(r.height), Math.round(r.width), Math.round(r.bottom)]; }));
const ecranAtelier = (p) => p.evaluate(() => { const a = document.querySelector('#atelier'); return { large: a.scrollWidth <= a.clientWidth + 1, texte: a.innerText, boutons: [...a.querySelectorAll('button:not([hidden])')].filter((b) => b.offsetParent).map((b) => [b.innerText.trim() || b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().width)]) }; });

// ─── les trois mini-jeux, joués au doigt ───
async function jouerFour(p, d, opts = {}) { // le doigt regarde la plaque, prévoit l'instant juste et touche ; opts.laisser : numéros de plaques laissées passer exprès
  const fait = new Set(); let photo = false; const lat = opts.latences || [];
  for (let t0 = Date.now(); Date.now() - t0 < (opts.ms || 60000);) {
    const l0 = Date.now(), a = await etat(p), e = a.partie; lat.push(Date.now() - l0); if (!e || e.jeu !== 'four') return a;
    const cle = e.k + ':' + e.phase;
    // le temps qu'il reste avant la porte (plaque sur le tapis) ou avant le doré (plaque au four), en secondes de jeu (= secondes réelles)
    const avant = e.phase === 'tapis' ? (e.porte - e.x) / e.niv.vitesse : e.phase === 'four' ? (1 - e.c) * e.niv.cuisson : Infinity;
    if (e.phase === 'four' && opts.photo && !photo && e.k >= 3 && e.c > 0.35 && e.c < 0.6) { photo = true; await p.screenshot({ path: opts.photo }); continue; }
    const vise = (e.phase === 'tapis' && !e.perdue && !(opts.laisser || []).includes(e.k)) || e.phase === 'four';
    if (vise && !fait.has(cle) && avant < 0.3) { fait.add(cle); if (avant > 0.012) await sleep(avant * 1000 - 12); await d.toucher(e.touche.x, e.touche.y); }
    if (opts.jusqua && e.k >= opts.jusqua) return a;
    await sleep(3);
  }
  return etat(p);
}
async function jouerFaconnage(p, d, opts = {}) {
  for (let forme = 0; forme < (opts.formes || 3); forme++) {
    check(await attendre(async () => { const e = (await etat(p)).partie; return e && e.forme === forme && !e.verdict; }, 6000), `forme ${forme + 1} prête`);
    const e = (await etat(p)).partie, t0 = Date.now();
    if (opts.verifier && forme === 0) { const tj = await toileJuste(p); check(tj && tj.ok, `la toile du façonnage se dessine à sa taille affichée (${tj && tj.dessin} px pour ${tj && tj.css} px)`); }
    for (let i = 0; i < e.modele.length; i++) {
      const pts = suivre(e.modele[i], opts.tremble == null ? 3 : opts.tremble, 7 + i + forme * 10);
      if (opts.lever && e.id === 'spirale') { const c = Math.floor(pts.length * 0.6); await d.glisser(pts.slice(0, c)); await sleep(600); await d.glisser(pts.slice(c - 1)); } // le doigt se lève à 60 %, puis reprend
      else await d.glisser(pts);
      if (opts.verifier && forme === 0 && i === 0) { const tj = await toileJuste(p); check(tj && tj.ok, `après le premier trait (« Recommencer » apparu) : la toile garde sa taille (${tj && tj.dessin} / ${tj && tj.css} px)`); }
    }
    const duree = Date.now() - t0;
    await attendre(async () => (await etat(p)).partie.verdict, 3000);
    if (duree > 9000) console.log(`  (la machine est lente : ${e.id} tracé en ${(duree / 1000).toFixed(1)} s)`);
    if (opts.photos) await p.screenshot({ path: `${opts.photos}-${forme + 1}-${e.id}.png` });
  }
}
async function jouerMemoire(p, d, manches, opts = {}) { // réussit `manches` recettes, puis se trompe exprès (ou laisse la minute filer)
  for (let m = 0; m <= manches; m++) {
    if (!(await attendre(async () => { const e = (await etat(p)).partie; return e && e.manche === m && (e.phase === 'saisie' || (opts.photoMontre && m === 1 && e.phase === 'montre')); }, 15000))) return false;
    let e = (await etat(p)).partie;
    if (e.phase === 'montre') { await p.screenshot({ path: opts.photoMontre }); await attendre(async () => (await etat(p)).partie.phase === 'saisie', 8000); e = (await etat(p)).partie; }
    if (m === manches) { const faux = ['farine', 'sel'].find((x) => x !== e.recette[0]); if (opts.photoSaisie) { await d.toucherEl(`.mem-ing[data-ing="${e.recette[0]}"]`); await sleep(120); await p.screenshot({ path: opts.photoSaisie }); await d.toucherEl(`.mem-ing[data-ing="${['farine', 'sel'].find((x) => x !== e.recette[1])}"]`); } else await d.toucherEl(`.mem-ing[data-ing="${faux}"]`); break; }
    for (const id of e.recette) { await d.toucherEl(`.mem-ing[data-ing="${id}"]`); await sleep(70); }
  }
  return true;
}
const finPartie = async (p) => { const ok = await attendre(async () => (await etat(p)).ecran === 'resultat', 70000); await sleep(650); return ok; }; // les boutons du résultat attendent 0,6 s
const lancer = async (p, d, id) => { // depuis la page Défis : « Jouer », puis « C'est parti ! »
  await d.toucherEl(`#page-defis [data-jeu="${id}"]`);
  check(await attendre(async () => (await etat(p)).ecran === 'accueil'), `« Jouer » ouvre l’accueil du mini-jeu ${id}`);
  await sleep(250);
};
const partir = async (p, d) => { await d.toucherEl('[data-at="jouer"]'); await attendre(async () => (await etat(p)).ecran === 'jeu', 3000); };

(async () => {
  const PORT = server.address().port, BASE = `http://localhost:${PORT}`;
  const browser = await chromium.launch();
  { const nc = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await nc(o); await c.addInitScript(() => { window.__sansQuartier = true; }); return c; }; } // pendant sa fenêtre, l'événement « Le Quartier » (icône, annonce) ne vient pas couvrir ce test (src/evenement.js)
  const errors = [];
  const suivreErr = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET_DISCONNECTED|ERR_FAILED|ERR_CERT|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  const nouveau = async (w, h, dsf) => { const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' }); const p = await ctx.newPage(); suivreErr(p); const cdp = await ctx.newCDPSession(p); return { ctx, p, d: doigt(p, cdp), cdp }; };
  const preparer = async (p) => p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; st.tuto = 99; f.give(3000); G.acheter(st, 0); G.acheter(st, 1); st.coins = 500; f.page('defis'); f.tiroir('ouvert'); });
  const S = (p) => p.evaluate(() => { const st = window.__fournil.st; return { coins: st.coins, lifetime: st.lifetime, atelier: JSON.parse(JSON.stringify(st.atelier)), ev: st.ev && st.ev.type, carnet: (st.carnetEv || []).map((e) => e.txt) }; });

  // ═══ 1. iPhone 390 × 844, finesse 3 ═══
  console.log('── iPhone 390 × 844 ──');
  let { ctx, p, d, cdp } = await nouveau(390, 844, 3);
  await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/fournil/'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st));
  await sleep(800); await preparer(p); await sleep(500);
  // la carte de l'Atelier, dans les Défis, entre le défi de la semaine et les événements
  const carte = await p.evaluate(() => { const c = document.querySelector('#page-defis [data-atelier]'), cartes = [...document.querySelectorAll('#page-defis .card')]; return c && { texte: c.innerText, rang: cartes.indexOf(c), evRang: cartes.findIndex((x) => x.classList.contains('ev-liste')), boutons: [...c.querySelectorAll('[data-jeu]')].map((b) => [b.dataset.jeu, Math.round(b.getBoundingClientRect().height), b.innerText.replace(/\s+/g, ' ')]), large: document.querySelector('#pages').scrollWidth <= document.querySelector('#pages').clientWidth + 1 }; });
  check(carte && /L’Atelier/.test(carte.texte) && /Enfournement en rythme/.test(carte.texte) && /Façonnage au doigt/.test(carte.texte) && /Mémoire du pâtissier/.test(carte.texte) && /9 parties payées/.test(carte.texte), 'la page Défis : la carte « L’Atelier » et ses trois mini-jeux, 9 parties payées aujourd’hui');
  check(carte && carte.rang >= 0 && carte.rang === carte.evRang - 1 && carte.boutons.length === 3 && carte.boutons.every(([, h]) => h >= 44) && carte.large, `juste avant les événements surprise ; trois boutons « Jouer » de 44 px au moins (${carte && carte.boutons.map((b) => b[2]).join(' | ')})`);
  await p.evaluate(() => document.querySelector('#page-defis [data-atelier]').scrollIntoView({ block: 'start' })); await sleep(300);
  await p.screenshot({ path: out + '/01-defis-atelier.png' });

  // ─── l'enfournement en rythme ───
  await lancer(p, d, 'four');
  const acc = await ecranAtelier(p);
  check(/Enfournement en rythme/.test(acc.texte) && /Record\s*—/.test(acc.texte) && /0\/3 parties payées/.test(acc.texte) && /jusqu’à/.test(acc.texte) && acc.large, 'l’accueil : les règles, le record (aucun), 0/3 parties payées, ce que rapporte une belle partie');
  check(acc.boutons.every(([, h, w]) => h >= 44 && w >= 44), `boutons de 44 px au moins : ${acc.boutons.map((b) => `${b[0]} ${b[1]} px`).join(', ')}`);
  await p.screenshot({ path: out + '/02-four-accueil.png' });
  await p.evaluate(() => { const st = window.__fournil.st; st.evTimer = 0.5; st.mystereTimer = 0.5; }); // un événement était sur le point d'arriver
  const avantFour = await S(p);
  await partir(p, d);
  check(await attendre(() => p.evaluate(() => /Touche quand la plaque passe sous le four/.test(document.querySelector('#at-consigne').textContent)), 3000), 'la première plaque arrive, la consigne : toucher quand elle passe sous le four');
  const latences = []; await jouerFour(p, d, { laisser: [1], photo: out + '/03-four-cuisson.png', latences });
  const latence = latences.sort((x, y) => x - y)[Math.floor(latences.length * 0.9)] || 0; // le temps que met le doigt du test à voir la page (9 fois sur 10) : sur une machine chargée, il rate les fenêtres de fin de partie
  await attendre(async () => (await etat(p)).ecran === 'resultat', 10000);
  await d.toucherEl('[data-at="rejouer"]'); await sleep(100); // une touche de trop, en rafale, juste à la fin de la partie
  check((await etat(p)).ecran === 'resultat', 'une touche en rafale juste après la fin de partie ne relance pas « Rejouer » (les boutons attendent 0,6 s)');
  const apresFour = await S(p), rFour = (await etat(p)).resultat;
  await sleep(400); await p.screenshot({ path: out + '/04-four-resultat.png' });
  check(await finPartie(p) && rFour && rFour.id === 'four', 'au bout de 45 s : l’écran du résultat');
  console.log(`  enfournement : ${rFour.score} points, prime ${rFour.prime} €`);
  const viseFour = latence > 20 ? 150 : 300; // calme : ~11 ms ; avec quatre autres navigateurs en parallèle : ~29 ms
  check(rFour.score >= viseFour && rFour.record && rFour.prime > 0, `joué au doigt : ${rFour.score} points (${viseFour} au moins ; le test lit la page en ${latence} ms${latence > 20 ? ', machine chargée' : ''}), nouveau record, +${rFour.prime} €`);
  check(apresFour.coins - avantFour.coins === rFour.prime && apresFour.atelier.gains.four === rFour.prime && apresFour.atelier.payees.four === 1 && apresFour.atelier.records.four === rFour.score, 'la prime est versée une fois, comptée dans les gains du jour (1/3) ; le record est dans la sauvegarde');
  check(!apresFour.ev && !apresFour.carnet.some((t) => /Coup de feu|commande|critique|meunier|pétrissage|four répar|anniversaire/i.test(t)), 'pendant la partie, aucun événement surprise n’a surgi (il attend la fin de la partie)');
  const resFour = await ecranAtelier(p);
  check(/Nouveau record/.test(resFour.texte) && new RegExp(`\\+${rFour.prime}`).test(resFour.texte.replace(/\s/g, '')) && /Encore 2 parties payées/.test(resFour.texte) && /parfaite/.test(resFour.texte) && /combo/.test(resFour.texte), 'le résultat : nouveau record, la prime, encore 2 parties payées, le bilan (cuissons parfaites, combo)');
  const etatFour = await p.evaluate(() => window.__fournil.atelier());
  check(etatFour.ecran === 'resultat', 'résultat affiché');
  await d.toucherEl('[data-at="retour"]'); await sleep(400);
  check(await p.evaluate(() => document.querySelector('#atelier').hidden && /Record : \d/.test(document.querySelector('#page-defis [data-atelier]').innerText) && /gains du jour 1\/3/.test(document.querySelector('#page-defis [data-atelier]').innerText)), '« Retour à l’atelier » : la carte des Défis montre le record et 1/3');
  // un événement en retard arrive maintenant, une fois l'Atelier fermé
  check(await attendre(() => p.evaluate(() => !!window.__fournil.st.ev), 8000), 'l’événement retenu arrive une fois la partie finie');
  await p.evaluate(() => { window.__fournil.st.ev = null; window.__fournil.st.evTimer = 900; });

  // ─── le façonnage au doigt ───
  await lancer(p, d, 'faconnage'); await p.screenshot({ path: out + '/05-faconnage-accueil.png' });
  const avantF = await S(p);
  await partir(p, d);
  await p.screenshot({ path: out + '/06-faconnage-modele.png' });
  const tetF = await enTete(p);
  check(tetF.entier && tetF.titre === 'Façonnage', `en partie, le titre court tient en entier (« ${tetF.titre} · ${tetF.sous} »)`);
  let notesF = [];
  const suivreNotes = setInterval(async () => { try { const e = (await etat(p)).partie; if (e && e.notes) notesF = e.notes; } catch (x) { /* rien */ } }, 100);
  await jouerFaconnage(p, d, { photos: out + '/07-faconnage', verifier: true, lever: true });
  clearInterval(suivreNotes);
  check(notesF.length === 3 && notesF.every((n) => n >= 90), `tracé au doigt sur le modèle affiché, la spirale en deux fois (doigt levé à 60 %) : ${notesF.join(' · ')} (90 au moins chacune)`);
  check(await finPartie(p), 'trois formes tracées : le résultat');
  const rF = (await etat(p)).resultat, apresF = await S(p);
  console.log(`  façonnage : ${rF.score} points, prime ${rF.prime} €`);
  check(rF.score >= 200 && rF.prime > 0 && apresF.coins - avantF.coins === rF.prime && apresF.atelier.records.faconnage === rF.score, `tracé au doigt, d’un geste un peu tremblant : ${rF.score}/300, +${rF.prime} €`);
  await sleep(300); await p.screenshot({ path: out + '/08-faconnage-resultat.png' });
  // à l'envers : la note est divisée par deux
  await d.toucherEl('[data-at="rejouer"]'); await sleep(300); await partir(p, d);
  await attendre(async () => { const e = (await etat(p)).partie; return e && e.forme === 0; });
  const e0 = (await etat(p)).partie;
  for (let i = e0.modele.length - 1; i >= 0; i--) await d.glisser(suivre(e0.modele[i].slice().reverse(), 2, 3 + i)); // de droite à gauche, et vers le bas
  await attendre(async () => (await etat(p)).partie.verdict, 3000);
  const cons = await p.evaluate(() => document.querySelector('#at-consigne').textContent);
  const n0 = (await etat(p)).partie.notes[0];
  check(n0 <= 40 && /à l’envers/.test(cons) && /désordre/.test(cons), `les entailles tracées à l’envers et dans le désordre : ${n0}/100 (« ${cons} »)`);
  await p.screenshot({ path: out + '/09-faconnage-envers.png' });
  // « Recommencer » efface le tracé en cours (la tresse : un brin sur deux) ; puis on quitte la partie : rien n'est compté
  await attendre(async () => { const e = (await etat(p)).partie; return e && e.forme === 1 && !e.verdict; }, 4000);
  await d.glisser(suivre((await etat(p)).partie.modele[0], 2, 1));
  await attendre(async () => { const e = (await etat(p)).partie; return e && e.forme === 2 && !e.verdict; }, 4000);
  await d.glisser(suivre((await etat(p)).partie.modele[0], 2, 1)); await sleep(100);
  const avantEff = (await etat(p)).partie.traces;
  const bEff = (await boutonsVisibles(p)).find((b) => b[0] === 'Recommencer');
  check(bEff && bEff[1] >= 44 && bEff[2] >= 44 && bEff[3] <= 844 - 60, `« Recommencer » : un vrai bouton (${bEff && bEff[1]} × ${bEff && bEff[2]} px), sous le plan de travail, loin du bas de l’écran (${bEff && bEff[3]} px)`);
  await p.screenshot({ path: out + '/09b-faconnage-recommencer.png' });
  await d.toucherEl('[data-at="effacer"]'); await sleep(150);
  check(avantEff === 1 && (await etat(p)).partie.traces === 0, '« Recommencer » efface le tracé de la forme en cours');
  const partiesF = (await S(p)).atelier.parties.faconnage;
  await d.toucherEl('[data-at="fermer"]'); await sleep(300);
  check(!(await etat(p)).ouvert && (await S(p)).atelier.parties.faconnage === partiesF, 'quitter en pleine partie (la croix) : la partie n’est pas comptée');

  // ─── la mémoire du pâtissier : trois parties payées, puis le plafond ───
  await lancer(p, d, 'memoire'); await p.screenshot({ path: out + '/10-memoire-accueil.png' });
  const nivAvant = await p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st, n = G.niveau(st); let x = 0; for (let k = 1; k <= n; k++) x += G.XP_NIVEAU(k); st.xp = x - 1; return n; }); // à un point du niveau suivant : la partie payée (+2) le fera monter
  const avantM = await S(p);
  await partir(p, d);
  check(await jouerMemoire(p, d, 3, { photoMontre: out + '/11-memoire-recette.png', photoSaisie: out + '/12-memoire-erreur.png' }), 'trois recettes remises dans l’ordre au doigt, puis une erreur');
  check(await finPartie(p), 'l’erreur finit la partie');
  const rM1 = (await etat(p)).resultat, apresM1 = await S(p);
  const toastNiv = await attendre(() => p.evaluate(() => { const t = document.querySelector('.toast'); if (!t || !/Niveau/.test(t.textContent)) return false; t.style.pointerEvents = 'auto'; const b = t.getBoundingClientRect(), dessus = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); t.style.pointerEvents = ''; return dessus === t; }), 4000);
  const nivApres = await p.evaluate(() => window.__fournil.G.niveau(window.__fournil.st));
  check(nivApres === nivAvant + 1 && toastNiv, `la partie payée fait passer le niveau ${nivAvant} → ${nivApres} : le toast « Niveau ${nivApres} » s’affiche par-dessus l’Atelier`);
  await p.screenshot({ path: out + '/12b-memoire-toast-niveau.png' });
  check(rM1.score === 12 && rM1.record && rM1.prime > 0 && apresM1.coins - avantM.coins === rM1.prime, `3 + 4 + 5 = ${rM1.score} points, record, +${rM1.prime} €`);
  await sleep(300); await p.screenshot({ path: out + '/13-memoire-resultat.png' });
  for (const k of [2, 3]) {
    await d.toucherEl('[data-at="rejouer"]'); await sleep(300); await partir(p, d);
    await jouerMemoire(p, d, 1); await finPartie(p);
    const r = (await etat(p)).resultat;
    check(r.score === 3 && r.prime > 0 && !r.record && r.payees === k, `partie ${k} : une recette, ${r.score} points, +${r.prime} € (${k}/3 parties payées)`);
  }
  const resM3 = await ecranAtelier(p);
  check(/dernière partie payée du jour/.test(resM3.texte), 'après la 3e : « c’était la dernière partie payée du jour »');
  await d.toucherEl('[data-at="rejouer"]'); await sleep(300);
  const accPlafond = await ecranAtelier(p);
  check(/Plafond du jour atteint/.test(accPlafond.texte) && /pour le record, sans gain/.test(accPlafond.texte), 'l’accueil prévient : plafond du jour atteint, on joue pour le record, sans gain');
  await p.screenshot({ path: out + '/14-memoire-plafond-accueil.png' });
  const avantM4 = await S(p);
  await partir(p, d); await jouerMemoire(p, d, 4); await finPartie(p);
  const rM4 = (await etat(p)).resultat, apresM4 = await S(p);
  if (!(rM4.score === 18 && rM4.record && rM4.prime === 0 && rM4.pourLeRecord && apresM4.coins === avantM4.coins)) console.log('  (détail)', JSON.stringify(rM4), avantM4.coins, apresM4.coins, JSON.stringify(apresM4.atelier));
  check(rM4.score === 18 && rM4.record && rM4.prime === 0 && rM4.pourLeRecord && apresM4.coins === avantM4.coins && apresM4.atelier.records.memoire === 18 && apresM4.atelier.payees.memoire === 3, `au-delà du plafond : nouveau record (${rM4.score}), aucun gain`);
  const resM4 = await ecranAtelier(p);
  check(/Nouveau record/.test(resM4.texte) && /Plafond du jour atteint/.test(resM4.texte) && !/\+[\d ,k]+ €/.test(resM4.texte), 'le résultat : « Nouveau record ! » et « Plafond du jour atteint : pas de gain, mais le record compte »');
  await sleep(300); await p.screenshot({ path: out + '/15-memoire-record-sans-gain.png' });
  await d.toucherEl('[data-at="retour"]'); await sleep(400);
  const carte2 = await p.evaluate(() => document.querySelector('#page-defis [data-atelier]').innerText);
  check(/plafond du jour atteint/.test(carte2) && /pour le record/.test(carte2) && /4 parties payées/.test(carte2), 'la carte des Défis : mémoire au plafond (« pour le record »), 4 parties payées restantes (2 + 2 + 0)');
  await p.evaluate(() => document.querySelector('#page-defis [data-atelier]').scrollIntoView({ block: 'start' })); await sleep(300);
  await p.screenshot({ path: out + '/16-defis-apres.png' });
  // le Journal : les records ; puis tout est encore là après un rechargement
  await p.evaluate(() => window.__fournil.page('boulanger')); await sleep(300); // les records vivent dans les statistiques du Boulanger
  const journal = await p.evaluate(() => document.querySelector('#page-boulanger').innerText);
  check(new RegExp(`Atelier : enfournement\\s*${rFour.score} pts`).test(journal) && /Atelier : mémoire\s*18 pts/.test(journal) && new RegExp(`Atelier : façonnage\\s*${rF.score} pts`).test(journal), 'l’onglet Boulanger : les trois records de l’Atelier');
  await p.evaluate(() => window.__fournil.save());
  const avantRel = (await S(p)).atelier;
  await p.reload(); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(600);
  const apresRel = (await S(p)).atelier;
  check(JSON.stringify(apresRel.records) === JSON.stringify(avantRel.records) && JSON.stringify(apresRel.payees) === JSON.stringify(avantRel.payees) && apresRel.jour === avantRel.jour, `après rechargement : records ${JSON.stringify(apresRel.records)} et parties payées du jour ${JSON.stringify(apresRel.payees)} retrouvés (sauvegarde fournil.v2)`);
  // hors ligne : tout marche (rien ne part sur le réseau)
  await ctx.setOffline(true);
  const req = []; p.on('request', (r) => req.push(r.url()));
  await p.evaluate(() => { window.__fournil.page('defis'); window.__fournil.tiroir('ouvert'); }); await sleep(300);
  await lancer(p, d, 'faconnage'); await partir(p, d); await jouerFaconnage(p, d, { formes: 3, tremble: 1 }); await finPartie(p);
  const rOff = (await etat(p)).resultat;
  check(rOff.prime > 0 && rOff.payees === 2 && req.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:')).length === 0, `hors ligne : une partie de façonnage (${rOff.score} points, +${rOff.prime} €), aucune requête`);
  await ctx.setOffline(false);
  await ctx.close();

  // ═══ 2. petit écran 360 × 640 ═══
  console.log('── 360 × 640 ──');
  ({ ctx, p, d, cdp } = await nouveau(360, 640, 3));
  await p.goto(BASE + '/vide.html'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '/fournil/'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800); await preparer(p); await sleep(400);
  for (const id of ['four', 'faconnage', 'memoire']) {
    await lancer(p, d, id);
    const a = await ecranAtelier(p), bouton = await d.centre('[data-at="jouer"]');
    check(a.large && bouton && bouton.y + bouton.h / 2 <= 640 && bouton.h >= 44, `${id} : l’accueil tient dans l’écran, « C’est parti ! » visible (${Math.round(bouton.y)} px)`);
    await p.screenshot({ path: out + `/20-petit-${id}-accueil.png` });
    await partir(p, d);
    const g = await p.evaluate(() => { const z = document.querySelector('#at-zone').getBoundingClientRect(), c = document.querySelector('#at-consigne').getBoundingClientRect(), a = document.querySelector('#atelier'); return { zone: Math.round(z.height), consigne: Math.round(c.bottom), large: a.scrollWidth <= a.clientWidth + 1 }; });
    check(g.zone >= 340 && g.consigne <= 640 && g.large, `${id} : la zone de jeu fait ${g.zone} px, la consigne reste visible, rien ne déborde`);
    const tet = await enTete(p), bv = await boutonsVisibles(p);
    check(tet.entier, `${id} : en partie, le titre et le sous-titre tiennent sans être coupés (« ${tet.titre} · ${tet.sous} »)`);
    check(bv.length && bv.every(([, h, w]) => h >= 44 && w >= 44), `${id} : en partie, boutons de 44 px au moins (${bv.map((b) => `${b[0]} ${b[1]} px`).join(', ')})`);
    if (id === 'four') { // un téléphone poussif (processeur ralenti ×8) : le temps du jeu reste le temps réel, pas de ralenti
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
      const t0 = Date.now(), e0 = (await etat(p)).partie.t; await sleep(3000); const e1 = (await etat(p)).partie.t, t1 = Date.now();
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const ratio = (e1 - e0) / ((t1 - t0) / 1000);
      check(ratio > 0.85 && ratio < 1.1, `processeur ralenti ×8 : ${(e1 - e0).toFixed(2)} s de jeu pour ${((t1 - t0) / 1000).toFixed(2)} s réelles (pas de partie au ralenti)`);
    }
    if (id === 'four') { await jouerFour(p, d, { jusqua: 4, photo: out + '/21-petit-four.png' }); }
    if (id === 'faconnage') {
      let notes = []; const suivi = setInterval(async () => { try { const e = (await etat(p)).partie; if (e && e.notes) notes = e.notes; } catch (x) { /* rien */ } }, 100);
      await jouerFaconnage(p, d, { formes: 3, photos: out + '/22-petit-faconnage', verifier: true });
      await attendre(async () => (await etat(p)).ecran === 'resultat', 5000); clearInterval(suivi); await sleep(650);
      const r = (await etat(p)).resultat;
      check(r && r.score >= 270, `360 × 640 : les trois formes tracées sur le modèle affiché, ${r && r.score}/300 (${notes.join(' · ')})`);
    }
    if (id === 'memoire') { await jouerMemoire(p, d, 1, { photoSaisie: out + '/23-petit-memoire.png' }); await finPartie(p); }
    if (id === 'four') { await d.toucherEl('[data-at="fermer"]'); await sleep(300); }
    else if (id === 'faconnage') { await d.toucherEl('[data-at="retour"]'); await sleep(300); }
    else { await sleep(300); await p.screenshot({ path: out + '/24-petit-memoire-resultat.png' }); await d.toucherEl('[data-at="retour"]'); await sleep(300); }
  }
  const pe = await S(p);
  check(pe.atelier.parties.four === 0 && pe.atelier.parties.faconnage === 1 && pe.atelier.parties.memoire === 1 && pe.atelier.payees.memoire === 1, 'la partie quittée en route (four) : non comptée ; le façonnage et la mémoire finis : comptés');
  await ctx.close();

  // ═══ 3. l'artefact Claude ═══
  console.log('── l’artefact Claude ──');
  ({ ctx, p, d } = await nouveau(390, 844, 3));
  await p.goto(BASE + '/dist/artifact.html'); await attendre(() => p.evaluate(() => !!window.__fournil && !!window.__fournil.st)); await sleep(800); await preparer(p); await sleep(300);
  await lancer(p, d, 'memoire'); await partir(p, d); await jouerMemoire(p, d, 2); await finPartie(p);
  const rA = (await etat(p)).resultat;
  check(rA.score === 7 && rA.prime > 0, `dans l’artefact : la mémoire jouée au doigt, ${rA.score} points, +${rA.prime} €`);
  await p.screenshot({ path: out + '/30-artefact-memoire.png' });
  await ctx.close();

  check(errors.length === 0, `aucune erreur dans la console${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (Atelier).');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
