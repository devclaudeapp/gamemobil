// Les activités de la Maison hantée (lot 6, le Manoir « qui choque » : src/hanteeactivites.js, qui relie les règles de src/hantee.js à la
// scène de src/boutiquehantee.js et à l'écran de src/evenement.js), sur la vraie page du Fournil, téléphone en portrait (390 × 844),
// le mercredi 28 octobre 2026 à 11 h (la Maison hantée est ouverte). En haute (la HD de la boutique hantée), puis en éco (le repli
// procédural), on joue au doigt :
// · l'ouverture : la jauge « Le boss s'endort… » sous le ×6, pleine ; « ×6 avec toi » ;
// · servir un client-monstre : il entre (un acteur de la scène, sa bulle au-dessus de la tête : ce qu'il commande, sa patience) ; le
//   toucher le choisit, la carte de chaque friandise de sa commande le sert ; servi, il repart content (la scène), son pourboire vole
//   jusqu'au solde ; un deuxième, servi en touchant sa bulle ; une mauvaise carte : « Ce n'est pas sa commande ! » ;
// · rater un client : sa patience finie, il repart fâché, sa bulle s'en va, rien n'est payé ;
// · une fournée parfaite : la fenêtre dessinée sur la barre de cuisson d'une fournée à la main ; la carte brille quand la fournée y passe ;
//   un toucher dedans : « Parfait ! ×2 », la fournée payée deux fois ;
// · les apparitions : la scène les fait traverser ; un toucher dessus les attrape (l'éclat de particules), trois d'affilée : la série ×1,5
//   et son compteur sur la scène ;
// · la commande de la nuit : sa carte en tête du tiroir, sa jauge, son bouton ; pas prête, le bouton le dit ; prête, Livrer la paie ;
// · le ×6 qui s'endort : quatre minutes sans toucher (l'horloge avancée de 2,5 s à chaque image : la page tourne), la jauge se vide, la lumière de
//   la scène baisse, « ×1 » ; un toucher sur la scène, et tout revient ;
// puis, avec ?boutique=0 (le Manoir d'avant : pas de scène de boutique), le repli en DOM : la file en bas de la scène, une apparition en
// image. Aucune erreur dans la page. Captures dans test/shots/hantee-activites/ (et dans SHOTS_HANTEE_ACTIVITES, préfixées « final- »).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hantee-activites.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_HANTEE_ACTIVITES || 8922;
const out = path.join(__dirname, 'shots', 'hantee-activites'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_HANTEE_ACTIVITES ? (fs.mkdirSync(process.env.SHOTS_HANTEE_ACTIVITES, { recursive: true }), process.env.SHOTS_HANTEE_ACTIVITES) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-28T11:00:00+01:00').getTime(), decal = DEPART - Date.now();
let plus = 0; // l'avance de l'horloge de la page (window.__avancer), que le serveur suit aussi (l'en-tête Date)
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(Date.now() + decal + plus).toUTCString());
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 20000, pas = 150) => { for (let t = 0; t < ms; t += pas) { try { const r = await fn(); if (r) return r; } catch (e) { /* rien */ } await sleep(pas); } return null; };
// une fausse heure du téléphone, qu'on peut avancer (Date et performance.now ensemble : l'horloge de confiance du jeu suit)
function faux(d) {
  let plus = 0; const D = Date, pn = performance.now.bind(performance);
  class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d + plus); } static now() { return D.now() + d + plus; } }
  window.Date = F; performance.now = () => pn() + plus; window.__avancer = (ms) => { plus += ms; return plus; };
  // avancer de total ms, pas ms à chaque image (la page tourne entre deux pas ; plus de 5 s d'un coup, le jeu croirait qu'elle a gelé)
  window.__avancerParImage = (total, pas) => new Promise((ok) => { let fait = 0; const un = () => { if (fait >= total) { ok(plus); return; } const p = Math.min(pas, total - fait); plus += p; fait += p; requestAnimationFrame(un); }; requestAnimationFrame(un); });
  window.__toasts = []; window.__flottes = []; window.__voles = 0;
  new MutationObserver((l) => { for (const m of l) for (const n of m.addedNodes) { if (!n.classList) continue; if (n.classList.contains('mh-flotte')) window.__flottes.push(n.textContent); if (n.classList.contains('mh-vole')) window.__voles++; }
    const t = document.querySelector('.toast'); if (t && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD en haute
  async function ouvrir(requete) {
    plus = 0;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(faux, decal);
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); if (m.type() === 'warning' && /Boutique hantée/.test(m.text())) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    // la Maison hantée déjà annoncée ; cinq postes ouverts : les trois premiers avec leur monstre, les toiles (12 s) et les potions (24 s) à la main
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12;
      [[60, 1], [40, 1], [25, 1], [12, 0], [6, 0]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5]; F.save(); });
    for (let k = 0; k < 2; k++) { await ev(() => { const b = document.querySelector('#feuille [data-a="pq-tard"], #feuille [data-a="close"], #feuille [data-a="pq-ok"]'); if (b) b.click(); }); await sleep(300); }
    return { ctx, page, erreurs, ev };
  }
  const shot = async (page, nom) => { await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, 'final-' + nom + '.png')); await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };

  for (const qual of (process.env.QUALITES || 'haute,eco').split(',')) {
    console.log(`── qualité ${qual} : les activités de la Maison hantée, au doigt ──`);
    const { ctx, page, erreurs, ev } = await ouvrir(`?qualite=${qual}`);
    const act = () => ev(() => window.__fournil.evHantee.act.etat());
    const regles = () => ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()), M = q.manoir; return { billets: q.billets, stats: Object.assign({}, q.stats), file: M.file.map((c) => ({ id: c.id, sorte: c.sorte, commande: c.commande.map((l) => Object.assign({}, l)) })), apps: M.apps.map((a) => a.id), serie: M.serie, record: M.record || 0, commande: M.commande && Object.assign({}, M.commande), actif: q.actif, now: q.now }; });
    const pousser = (quoi) => ev((k) => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()), t = HORLOGE.maintenant() - 1; if (k === 'client') q.manoir.prochainClient = t; if (k === 'app') q.manoir.prochaineApp = t; if (k === 'commande') q.manoir.prochaineCommande = t; }, quoi);
    const flottes = () => ev(() => window.__flottes.slice()), toasts = () => ev(() => window.__toasts.slice());
    if (qual === 'haute') { await ev(() => window.__fournil.SCENE.precharger('hantee')); await attendre(() => ev(() => HDM.pret('hantee3')), 60000); await sleep(1200); }
    await ev(() => { const B = BOUTIQUE_HANTEE, o = B.ambiance; window.__amb = []; B.ambiance = (x) => { window.__amb.push(x && x.actif); return o(x); }; }); // l'ambiance demandée à la scène, notée
    await ev(() => document.querySelector('#b-hantee').click()); // l'icône citrouille du coin
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati); }), 30000), 'l’icône citrouille ouvre la Maison hantée : la boutique hantée');
    if (qual === 'haute') check(!!(await attendre(() => ev(() => window.__fournil.SCENE.evenement.hd), 20000)), 'en haute, la HD de la boutique hantée');
    await sleep(1000);
    let a = await act();
    check(a.ouvert && a.mode === 'scene', `les activités sont reliées à la scène de la boutique hantée (mode ${a.mode})`);
    const ouv = await ev(() => { const e = document.querySelector('#ht-eveil'); return { vu: !e.hidden && e.getBoundingClientRect().height > 0, txt: e.innerText, niveau: e.dataset.niveau, jauge: e.querySelector('.mh-eveil-jauge b').style.width, taux: document.querySelector('#ht-taux').innerText }; });
    check(ouv.vu && ouv.niveau === 'plein' && ouv.jauge === '100%' && /×6/.test(ouv.taux), `la jauge sous le ×6, pleine (« ${ouv.txt} », ${ouv.jauge}) ; « ${ouv.taux} »`);

    // ─── servir un client au doigt : le toucher, puis la carte de chaque friandise de sa commande ───
    const visible = (id) => attendre(async () => { const e = await act(); const c = e.clients.find((x) => x.id === id); return c && c.bulle && c.sid ? c : null; }, 25000);
    let R = await regles(); if (!R.file.length) await pousser('client');
    const c1 = await attendre(async () => { const e = await act(); return e.clients.find((c) => c.bulle && c.sid && c.etat === 'file') || null; }, 30000); // (arrivé au comptoir, il attend)
    check(!!c1, `un client-monstre de la file des règles entre dans la scène, sa bulle au-dessus de la tête (${c1 && `${c1.sorte}, ${c1.sid}, bulle ${Math.round(c1.bulle.l)}×${Math.round(c1.bulle.h)}`})`);
    const acteur = (sid) => ev((s) => BOUTIQUE_HANTEE.acteurs().find((x) => x.id === s) || null, sid);
    const ac1 = await acteur(c1.sid);
    check(ac1 && ac1.role === 'client' && ac1.sorte === c1.sorte && Math.abs(c1.bulle.x - ac1.x) < 3 && c1.bulle.y < ac1.y, `c'est un acteur de la scène (${ac1 && `${ac1.sorte}, ${ac1.etat}, tête à ${ac1.x},${ac1.y}`}), la bulle posée sur sa tête`);
    const ic = await ev((id) => document.querySelectorAll(`.mh-bulle[data-client="${id}"] [data-p]`).length, c1.id);
    check(ic === c1.commande.length && c1.reste > 0 && c1.reste <= 40000, `la bulle : les ${ic} friandises de sa commande, sa patience (${(c1.reste / 1000).toFixed(0)} s)`);
    // le toucher (le milieu du corps) le choisit
    let choisi = null;
    const toucherClient = async (c) => { for (let k = 0; k < 4; k++) { const x = await acteur(c.sid); if (!x) return false; await page.touchscreen.tap(x.x, x.y + Math.max(20, x.h * 0.6)); await sleep(250); const e = await act(); if (e.choisi === c.id) return true; if (e.choisi != null) { await page.touchscreen.tap(x.x, x.y + Math.max(20, x.h * 0.6)); await sleep(250); } } return false; };
    if (await toucherClient(c1)) choisi = c1.id;
    if (choisi !== c1.id) console.log('   (diagnostic)', JSON.stringify(await act()), JSON.stringify(await ev(() => BOUTIQUE_HANTEE.acteurs())));
    check(choisi === c1.id && await ev((id) => document.querySelector(`.mh-bulle[data-client="${id}"]`).classList.contains('choisi'), c1.id), 'toucher le monstre le choisit : sa bulle s’allume');
    const voulus = await attendre(() => ev(() => [...document.querySelectorAll('#ht-cartes .carte[data-mh~="voulu"]')].map((c) => +c.dataset.i)), 3000);
    check(voulus && voulus.length === c1.commande.length && c1.commande.every((l) => voulus.includes(l.i)), `les cartes de sa commande sont marquées (${voulus})`);
    // une mauvaise carte : refusée (et le choix tombe) ; on le rechoisit
    const autre = [0, 1, 2, 3, 4].find((i) => !c1.commande.some((l) => l.i === i));
    if (autre != null) {
      await page.locator(`#ht-cartes .carte[data-i="${autre}"] h3`).tap(); await sleep(300);
      check((await flottes()).some((t) => /pas sa commande/.test(t)) && (await regles()).file.find((c) => c.id === c1.id).commande.every((l) => !l.servi), `une carte qui n’est pas dans sa commande (${autre}) : « Ce n’est pas sa commande ! », rien de servi`);
      await toucherClient(c1);
    }
    const b0 = (await regles()).billets, s0 = (await regles()).stats, v0 = await ev(() => window.__voles);
    for (const l of c1.commande) { await page.locator(`#ht-cartes .carte[data-i="${l.i}"] h3`).tap(); await sleep(300); }
    R = await regles(); const vie1 = await ev((sid) => { const c = VIE.clients.find((x) => 'c' + x.id === sid); return c ? { etat: VIE.etatClient(c), humeur: c.humeur } : null; }, c1.sid);
    check(!R.file.some((c) => c.id === c1.id) && R.stats.clientsServis === s0.clientsServis + 1 && R.billets > b0, `chaque carte sert une ligne ; la dernière : servi (${R.stats.clientsServis} servis), pourboire +${Math.round(R.billets - b0)}`);
    check(vie1 && vie1.etat === 'sort' && vie1.humeur === 'content', `dans la scène, il repart content (${vie1 && `${vie1.etat}, ${vie1.humeur}`})`);
    check((await ev(() => window.__voles)) > v0 && (await flottes()).some((t) => /Merci/.test(t)), 'son pourboire vole jusqu’au solde, « Merci ! »');
    check(!(await act()).clients.some((c) => c.id === c1.id) && (await act()).choisi == null, 'sa bulle est partie, plus personne de choisi');
    // un deuxième, servi en touchant sa bulle
    await pousser('client');
    const c2 = await attendre(async () => { const e = await act(); return e.clients.find((c) => c.id !== c1.id && c.bulle && c.sid && c.etat === 'file') || null; }, 25000); // (arrivé au comptoir : sa bulle ne bouge plus)
    if (c2) {
      for (let k = 0; k < c2.commande.length; k++) { const e = await act(), c = e.clients.find((x) => x.id === c2.id); if (!c || !c.bulle) break; await page.touchscreen.tap(c.bulle.x, c.bulle.y); await sleep(350); }
      R = await regles();
      check(!R.file.some((c) => c.id === c2.id) && R.stats.clientsServis === s0.clientsServis + 2, `un deuxième (${c2.sorte}), servi en touchant sa bulle (${c2.commande.length} touche${c2.commande.length > 1 ? 's' : ''})`);
    } else check(false, 'un deuxième client entre');

    // ─── rater un client : sa patience finie, il repart fâché ───
    await pousser('client');
    const c3 = await attendre(async () => { const e = await act(); return e.clients.find((c) => c.id !== c1.id && (!c2 || c.id !== c2.id) && c.bulle && c.sid) || null; }, 25000);
    if (c3) {
      const p0 = (await regles()).stats.clientsPartis, b3 = (await regles()).billets;
      await ev((id) => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()), c = q.manoir.file.find((x) => x.id === id); c.arrive -= 34000; }, c3.id); // (il attendait déjà depuis 34 s)
      const bas = await attendre(() => ev((id) => document.querySelector(`.mh-bulle[data-client="${id}"]`)?.classList.contains('presse'), c3.id), 4000, 100);
      const fin = await attendre(async () => { const r = await regles(); return !r.file.some((c) => c.id === c3.id) ? r : null; }, 15000);
      const vie3 = await ev((sid) => { const c = VIE.clients.find((x) => 'c' + x.id === sid); return c ? { etat: VIE.etatClient(c), humeur: c.humeur } : null; }, c3.sid);
      check(!!bas, 'sa patience presque finie : la bulle presse (orange)');
      check(fin && fin.stats.clientsPartis === p0 + 1 && fin.billets - b3 < 1e9 && vie3 && vie3.humeur === 'fache' && vie3.etat === 'sort', `40 s sans être servi : il repart fâché (${vie3 && vie3.humeur}), rien de payé pour lui`);
      await sleep(600); check(!(await act()).clients.some((c) => c.id === c3.id) && (await flottes()).some((t) => /assez d’attendre/.test(t)), '« Il en a eu assez d’attendre. », sa bulle s’en va');
    } else check(false, 'un troisième client entre');

    // la capture : la file de monstres, chacun sa bulle
    for (let k = 0; k < 3; k++) { await pousser('client'); await sleep(700); }
    await attendre(async () => (await act()).clients.filter((c) => c.bulle).length >= 3, 20000);
    await sleep(800); await shot(page, `${qual}-file`);
    a = await act(); check(a.clients.filter((c) => c.bulle).length >= 2, `la file des règles en scène : ${a.clients.filter((c) => c.bulle).length} monstres avec leur bulle`);

    // ─── une fournée parfaite : les toiles d'araignée en sucre (12 s, à la main) ───
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.manoir.file = []; q.manoir.prochainClient = HORLOGE.maintenant() + 600e3; }); // (la file vidée : rien ne vient se mettre entre le doigt et la carte)
    await sleep(800);
    const carte3 = page.locator('#ht-cartes .carte[data-i="3"]'); await carte3.scrollIntoViewIfNeeded();
    let parfait = null;
    for (let essai = 0; essai < 3 && !parfait; essai++) {
      await attendre(() => ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); return !q.postes[3].actif; }), 15000);
      const pf0 = (await regles()).stats.parfaits, bb = await carte3.locator('.barre').boundingBox();
      await page.touchscreen.tap(bb.x + bb.width * 0.5, bb.y + bb.height / 2); await sleep(200); // la lancer
      const w = await attendre(() => ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()), w = F.evHantee.R.fenetreParfait(q, 3), f = document.querySelector('#ht-cartes .carte[data-i="3"] .mh-fenetre'); return w && f && !f.hidden ? { w, left: parseFloat(f.style.left), width: parseFloat(f.style.width) } : null; }), 3000);
      if (!w) { check(false, 'la fenêtre « parfait » est dessinée sur la barre'); break; }
      if (essai === 0) check(Math.abs(w.left - w.w.debut * 100) < 0.2 && Math.abs(w.width - (w.w.fin - w.w.debut) * 100) < 0.2, `lancée à la main : la fenêtre « parfait » dessinée sur sa barre (${w.left.toFixed(0)} % → ${(w.left + w.width).toFixed(0)} %)`);
      const dedans = await attendre(() => ev((x) => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()), p = q.postes[3].prog / 12; return p >= x.debut + 0.025 && p < x.fin - 0.04 ? document.querySelector('#ht-cartes .carte[data-i="3"]').dataset.mh || 'non' : null; }, w.w), 15000, 40);
      await page.touchscreen.tap(bb.x + bb.width * 0.5, bb.y + bb.height / 2); await sleep(250);
      const r = await regles();
      if (r.stats.parfaits > pf0) parfait = { brille: dedans, fl: await flottes(), vert: await attendre(() => ev(() => document.querySelector('#ht-cartes .carte[data-i="3"] .mh-fenetre.fait') !== null), 4000, 100) };
      else console.log(`  (essai ${essai + 1} : le doigt est arrivé hors de la fenêtre, on recommence à la fournée suivante)`);
    }
    check(parfait && /brille/.test(parfait.brille), `dans la fenêtre, la carte brille (data-mh « ${parfait && parfait.brille} »)`);
    check(parfait && parfait.fl.some((t) => /Parfait ! ×2/.test(t)), 'un toucher dedans : « Parfait ! ×2 », la fournée payée deux fois');
    check(parfait && parfait.vert, 'la fenêtre réussie passe au vert');

    // ─── les apparitions : les attraper au doigt, trois d'affilée (la série) ───
    const ap0 = (await regles()).stats.apparitions;
    for (let k = 1; k <= 3; k++) {
      await pousser('app');
      const ap = await attendre(async () => { const e = await act(); const r = await ev(() => { const c = document.querySelector('.mh-couche').getBoundingClientRect(); return { t: c.top, b: c.bottom }; }); return e.apps.find((x) => x.x > 30 && x.x < 360 && x.y > r.t + 10 && x.y < r.b - 10) || null; }, 15000, 100);
      if (!ap) { check(false, `l’apparition ${k} traverse la scène`); break; }
      if (k === 1) { check(ap.sid != null && !ap.dom && (await ev((s) => BOUTIQUE_HANTEE.apparitions().some((x) => x.id === s), ap.sid)), `une apparition des règles (${ap.type}) traverse la scène de la boutique`); await shot(page, `${qual}-apparition`); }
      const p = (await act()).apps.find((x) => x.id === ap.id) || ap;
      await page.touchscreen.tap(p.x, p.y); await sleep(300);
      const r = await regles();
      if (r.serie !== k) console.log('   (diagnostic)', JSON.stringify(p), JSON.stringify((await act()).recus), JSON.stringify(await ev(() => BOUTIQUE_HANTEE.apparitions())));
      check(r.stats.apparitions === ap0 + k && r.serie === k && !(await ev((s) => BOUTIQUE_HANTEE.apparitions().some((x) => x.id === s), ap.sid)), `apparition ${k} (${ap.type}) attrapée au doigt : elle éclate, série ×${r.serie}`);
    }
    const se = await ev(() => { const e = document.querySelector('#ht-serie'); return { vu: !e.hidden, txt: e.innerText.replace(/\s+/g, ' ') }; });
    check(se.vu && /×3/.test(se.txt) && (await flottes()).some((t) => /Série de 3/.test(t)), `le compteur de série sur la scène (« ${se.txt} »), « Série de 3 : ×1,5 »`);

    // ─── la commande de la nuit : sa carte, sa jauge, son bouton ───
    await pousser('commande');
    const cm = await attendre(() => ev(() => { const e = document.querySelector('#ht-commande'); return !e.hidden && e.querySelector('[data-a="mh-commande"]') ? e.innerText.replace(/\s+/g, ' ') : null; }), 8000);
    check(!!cm && (await toasts()).some((t) => /commande de la nuit/i.test(t)), `une commande de la nuit arrive : sa carte en tête du tiroir (« ${cm} »)`);
    check(await ev(() => !!document.querySelector('#ht-commande .mh-commande-temps b') && document.querySelector('#ht-commande .btn').classList.contains('non')), 'sa jauge de temps, son bouton pas encore prêt');
    await page.locator('#ht-commande [data-a="mh-commande"]').tap(); await sleep(300);
    const tt = await toasts(); check(tt.some((t) => /encore .* à vendre/.test(t)), `pas prête : le bouton dit ce qu’il reste à vendre (« ${tt[tt.length - 1]} »)`);
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()), c = q.manoir.commande; c.i = 0; c.fait = 0; c.n = 3; }); // (trois sachets de bonbons acidulés : Hubert les vend tout seul)
    await shot(page, `${qual}-commande`);
    const prete = await attendre(() => ev(() => document.querySelector('#ht-commande .btn.menthe')?.innerText.replace(/\s+/g, ' ')), 15000);
    check(!!prete && /Livrer/.test(prete), `les ventes la remplissent ; prête : « ${prete} »`);
    const cmd0 = (await regles()).stats.commandes, bc = (await regles()).billets;
    await page.locator('#ht-commande [data-a="mh-commande"]').tap(); await sleep(400);
    R = await regles();
    check(R.stats.commandes === cmd0 + 1 && R.billets > bc && !R.commande && await ev(() => document.querySelector('#ht-commande').hidden) && (await toasts()).some((t) => /Commande livrée/.test(t)), `Livrer : payée (+${Math.round(R.billets - bc)}), la carte s’en va`);

    // ─── le ×6 qui s'endort : quatre minutes sans toucher (l'horloge avancée de 2,5 s à chaque image : la page tourne), puis un toucher ───
    await page.touchscreen.tap(195, await ev(() => { const r = document.querySelector('.mh-couche').getBoundingClientRect(); return r.top + 20; })); await sleep(300); // (un dernier toucher : le plein)
    const amb0 = (await ev(() => window.__amb.length));
    let mi = null;
    for (const k of [0, 1]) { plus += 120e3; await ev(() => window.__avancerParImage(120e3, 2500)); await sleep(500); if (k === 0) mi = await ev(() => ({ e: window.__fournil.HT.presence(window.__fournil.st.hantee, HORLOGE.maintenant()), txt: document.querySelector('#ht-eveil').innerText, taux: document.querySelector('#ht-taux').innerText })); }
    await sleep(800);
    check(mi && mi.e.eveil > 0 && mi.e.eveil < 1 && /s’endort/.test(mi.txt), `au bout de 2 min : la jauge baisse (${mi && Math.round(mi.e.eveil * 100)} %, « ${mi && mi.txt.trim()} », ${mi && mi.taux})`);
    const dort = await ev(() => { const e = document.querySelector('#ht-eveil'); return { p: window.__fournil.HT.presence(window.__fournil.st.hantee, HORLOGE.maintenant()), txt: e.innerText, niveau: e.dataset.niveau, jauge: e.querySelector('.mh-eveil-jauge b').style.width, taux: document.querySelector('#ht-taux').innerText, amb: window.__amb.slice() }; });
    check(dort.p.dort && dort.p.mult === 1 && dort.niveau === 'bas' && dort.jauge === '0%' && /×1 /.test(dort.taux + ' ') && /dort/.test(dort.txt), `4 min sans toucher : le boss dort (« ${dort.txt.trim()} », jauge ${dort.jauge}), « ${dort.taux} »`);
    const ambs = dort.amb.slice(amb0);
    check(ambs.length > 3 && ambs[ambs.length - 1] === 0 && ambs.some((x) => x > 0 && x < 1), `la lumière de la scène baisse avec la jauge (ambiance ${ambs.slice(-4).map((x) => x.toFixed(2)).join(' → ')})`);
    await shot(page, `${qual}-boss-endormi`);
    await page.touchscreen.tap(195, await ev(() => { const r = document.querySelector('.mh-couche').getBoundingClientRect(); return r.top + 20; })); await sleep(500);
    const reveil = await ev(() => { const e = document.querySelector('#ht-eveil'); return { p: window.__fournil.HT.presence(window.__fournil.st.hantee, HORLOGE.maintenant()), niveau: e.dataset.niveau, taux: document.querySelector('#ht-taux').innerText, amb: window.__amb[window.__amb.length - 1] }; });
    check(reveil.p.eveil === 1 && reveil.niveau === 'plein' && /×6/.test(reveil.taux) && reveil.amb === 1, `un toucher sur la scène : réveillé (${reveil.taux}), la lumière revient (${reveil.amb})`);

    check(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }

  // ─── le repli en DOM : le Manoir d'avant (?boutique=0), pas de scène de boutique ───
  {
    console.log('── le repli en DOM (?boutique=0 : le Manoir d’avant) ──');
    const { ctx, page, erreurs, ev } = await ouvrir('?qualite=eco&boutique=0');
    const act = () => ev(() => window.__fournil.evHantee.act.etat());
    await ev(() => document.querySelector('#b-hantee').click()); await sleep(1500);
    let a = await act(); check(a.ouvert && a.mode === 'dom', `sans la scène de la boutique, les activités passent en DOM (${a.mode})`);
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.manoir.prochainClient = HORLOGE.maintenant() - 1; });
    const c = await attendre(async () => { const e = await act(); return e.clients.find((x) => x.bulle) || null; }, 10000);
    check(!!c && await ev(() => !!document.querySelector('.mh-file .mh-monstre')), `la file en bas de la scène : le monstre et sa bulle (${c && c.sorte})`);
    if (c) {
      const bm = await page.locator('.mh-file .mh-monstre').first().boundingBox(); await page.touchscreen.tap(bm.x + bm.width / 2, bm.y + bm.height / 2); await sleep(250); // (il flotte : jamais « stable »)
      check((await act()).choisi === c.id, 'toucher le monstre le choisit');
      for (const l of c.commande) { await page.locator(`#ht-cartes .carte[data-i="${l.i}"] h3`).tap(); await sleep(300); }
      const r = await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); return { file: q.manoir.file.length, servis: q.stats.clientsServis }; });
      check(r.servis === 1, `servi avec les cartes (${r.servis} servi)`);
    }
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.manoir.prochaineApp = HORLOGE.maintenant() - 1; });
    const ap = await attendre(async () => { const e = await act(); return e.apps.find((x) => x.dom && x.x > 40 && x.x < 350) || null; }, 15000, 100);
    check(!!ap, `une apparition traverse la scène en image (${ap && ap.type})`);
    if (ap) { await shot(page, 'repli-dom'); const p = (await act()).apps.find((x) => x.id === ap.id) || ap; await page.touchscreen.tap(p.x, p.y); await sleep(300); const n = await ev(() => window.__fournil.st.hantee.stats.apparitions); check(n === 1, 'un toucher dessus l’attrape'); }
    check(erreurs.length === 0, `aucune erreur dans la page${erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
