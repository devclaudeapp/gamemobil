// La saison gratuite « Automne » à l'écran (src/ui.js, SAI ; les règles : src/saison.js, src/saison-automne.js) sur la vraie page du Fournil
// (fournil/ servie en local), téléphone en portrait. La saison est éteinte sous navigator.webdriver : ce test seul l'allume (window.__saison =
// true ; aucun autre test ne voit la carte ni l'annonce). Parcours :
// · une vieille partie, le samedi 14 novembre à 11 h : la carte #piste sous les objectifs du jour (« Saison d'automne · cran 0/22 ») ; l'annonce
//   du Marché d'abord, puis (jamais en même temps) celle de la saison, une seule fois ;
// · l'XP par constat : trois objectifs réclamés et la journée (25 XP), trois paliers du Marché (60 XP) : le cran 1, « Recevoir » sur la carte ;
// · la feuille : la piste horizontale (22 crans, le cran en cours au milieu), « D'où vient l'XP » (six sources), « encore 17 j » ; recevoir le
//   cran 1 (le boost ×2 dans la réserve), puis « Tout recevoir » jusqu'au 7e (étoiles, la casquette de tweed, les décos) ; le 22e et le titre
//   « Feuille d'or 2026 » à 1 240 XP ;
// · une vieille sauvegarde sans st.piste : la piste créée au premier pas, la carte tout de suite ;
// · un nouveau joueur (window.__accueil = true) : l'XP compte, la carte cachée jusqu'au déblocage « piste », annoncée, ses crans à recevoir ;
// · après le 30 novembre : la feuille de fin (« voici ce qui t'attendait »), les crans dus donnés d'office, la saison archivée ;
// · 360 × 640 : la carte et la feuille sans défilement de côté. Aucune erreur de page.
// Ce qui dépend du constructeur A (src/game.js : la tenue de saison, le titre, le déblocage « piste ») est marqué « -- » tant qu'il manque.
// Captures dans test/shots/saison/ (et dans SHOTS_SAISON s'il est donné).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-saison.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_SAISON || 8885;
const out = path.join(__dirname, 'shots', 'saison'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_SAISON ? (fs.mkdirSync(process.env.SHOTS_SAISON, { recursive: true }), process.env.SHOTS_SAISON) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };
const H = 3600e3, SAMEDI = new Date('2026-11-14T11:00:00+01:00').getTime(), DECEMBRE = new Date('2026-12-01T10:00:00+01:00').getTime();
let decal = SAMEDI - Date.now();
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(Date.now() + decal).toUTCString());
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const passe = (m) => console.log('  --   ' + m);
// FOURNIL_CPU=n : le processeur de chaque page ralenti n fois (CDP, comme les machines de GitHub) ; sans lui, rien ne change
const CPU = Number(process.env.FOURNIL_CPU) || 0;
const attendre = async (fn, ms = 10000, pas = 150) => { for (let t = 0; t < ms; t += pas) { try { const r = await fn(); if (r) return r; } catch (e) { /* la page se recharge */ } await sleep(pas); } return null; };
function telephone(o) { // avant tout script : la fausse heure (gardée d'un chargement à l'autre), la saison allumée, l'accueil si demandé
  let d = o.decal; try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* about:blank */ }
  const D = Date; class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = FauxDate;
  window.__saison = true; if (o.accueil) window.__accueil = true;
  window.__feuilles = []; // les feuilles ouvertes, dans l'ordre (leur première ligne) : l'ordre des annonces, quand il est faux
  new MutationObserver(() => { const f = document.querySelector('#feuille'), c = document.querySelector('#feuille-contenu'), t = f && !f.hidden && c ? c.innerText.split('\n')[0].slice(0, 60) : ''; if (t && window.__feuilles[window.__feuilles.length - 1] !== t) window.__feuilles.push(t); }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  async function ouvrir(o = {}) {
    decal = (o.quand || SAMEDI) - Date.now();
    const ctx = await browser.newContext({ viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(telephone, { decal, accueil: !!o.accueil });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage();
    if (CPU > 1) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
    page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const pret = async () => { await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900); };
    const charger = async () => { await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await pret(); };
    const shot = async (nom) => { await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
    const feuille = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    const clic = (sel) => ev((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
    const fermer = async () => { for (let k = 0; k < 4; k++) { if (await ev(() => document.querySelector('#feuille').hidden)) return; await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="pq-tard"], #feuille [data-a="pq-ok"]'); if (b) b.click(); else document.querySelector('#voile').click(); }); await sleep(500); } };
    const carte = () => ev(() => { const c = document.querySelector('#piste'), o2 = document.querySelector('#objectifs'); if (!c) return null; const r = c.getBoundingClientRect(); return { vu: !c.hidden && r.height > 0, txt: c.innerText.replace(/\s+/g, ' ').trim(), pret: c.classList.contains('pret'), sous: o2 && !o2.hidden ? r.top >= o2.getBoundingClientRect().bottom - 1 : true, h: Math.round(r.height), large: document.documentElement.scrollWidth - innerWidth }; });
    const piste = () => ev(() => { const p = window.__fournil.st.piste; return p ? JSON.parse(JSON.stringify(p)) : null; });
    const pas = () => ev(() => window.__fournil.piste.pas());
    return { ctx, page, ev, charger, shot, feuille, clic, fermer, carte, piste, pas };
  }

  console.log('── une vieille partie, le samedi 14 novembre à 11 h ──');
  let T = await ouvrir();
  await T.charger();
  // la vieille partie préparée dans la page d'avant, puis la page figée jusqu'au rechargement : sous un processeur lent, cette page faisait
  // encore son annonce du Marché après la préparation (lancée à son ouverture) et la sauvait en partant (pagehide) ; la page suivante, le
  // Marché déjà annoncé, montrait alors la saison, à bon droit (7 nov., GitHub et FOURNIL_CPU=6)
  check(await T.ev(async () => { const F = window.__fournil, K = 'fournil.v2';
    const idb = () => new Promise((ok) => { const r = indexedDB.open('fournil', 1); r.onsuccess = () => { try { const g = r.result.transaction('sauvegarde').objectStore('sauvegarde').get(K); g.onsuccess = () => ok(g.result); g.onerror = () => ok(null); } catch (e) { ok(null); } }; r.onerror = () => ok(null); });
    for (let k = 0; k < 20; k++) {
      const st = F.st; st.lifetime = Math.max(st.lifetime, 5e9); st.tuto = 9; st.etoiles = Math.max(st.etoiles, 3); delete st.piste; delete st.pisteAnnonce; delete st.marche; F.save();
      const ls = localStorage.getItem(K); let v = null; for (let j = 0; j < 40 && v !== ls; j++) { await new Promise((r) => setTimeout(r, 50)); v = await idb(); } // (la base IndexedDB écrite elle aussi)
      const x = JSON.parse(ls); if (v === ls && !x.marche && !x.piste && !x.pisteAnnonce && x.tuto === 9) { const si = Storage.prototype.setItem, put = IDBObjectStore.prototype.put;
        Storage.prototype.setItem = function (cle, val) { if (cle === K) return; return si.call(this, cle, val); }; IDBObjectStore.prototype.put = function (val, cle) { if (cle === K) throw new Error('figée'); return put.call(this, val, cle); }; return true; }
    } return false; }), 'la vieille partie préparée (sans Marché, sans saison), la page figée jusqu’au rechargement');
  await T.charger();
  check(await T.ev(() => window.__fournil.piste.actif) === true, 'la saison est allumée (window.__saison)');
  check(await attendre(async () => (await T.piste()) && (await T.piste()).id === 'automne-2026', 6000), 'st.piste est créée au premier pas de la saison (pas st.saison, la recette de saison)');
  // l'annonce du Marché d'abord ; celle de la saison ensuite, jamais en même temps
  check(await attendre(() => T.ev(() => /Marché d’automne ouvre/.test(document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText)), 12000), `l’annonce du Marché passe d’abord (les feuilles : ${JSON.stringify(await T.ev(() => window.__feuilles))})`);
  check(!/saison d’automne/i.test((await T.feuille()).split('\n')[0]), 'pas d’annonce de la saison en même temps');
  await T.clic('#feuille [data-a="pq-tard"]'); await sleep(300);
  const an = await attendre(async () => { const t = await T.feuille(); return /Nouveau : la saison d’automne/.test(t) ? t : null; }, 25000);
  check(!!an && /récompenses/.test(an) && /30 novembre/.test(an) && /22 crans/.test(an), 'puis l’annonce de la saison : « Nouveau : la saison d’automne », une piste de récompenses jusqu’au 30 novembre, 22 crans');
  await sleep(400); await T.shot('01-annonce-saison');
  check(await T.ev(() => window.__fournil.st.pisteAnnonce) === 'automne-2026', 'annoncée une fois (st.pisteAnnonce)');
  await T.clic('#feuille [data-a="close"]'); await sleep(600);
  await T.ev(() => window.__fournil.tiroir && window.__fournil.tiroir('mi')); await sleep(300);
  let c = await T.carte();
  check(c && c.vu && c.sous && /Saison d’automne · cran 0\/22/.test(c.txt) && /0\/45 XP/.test(c.txt) && c.h >= 44, `la carte #piste sous les objectifs du jour : « ${c && c.txt} »`);
  await T.ev(() => document.querySelector('#piste').scrollIntoView({ block: 'center' })); await sleep(300); await T.shot('02-carte-cran-0');

  console.log('── l’XP par constat ──');
  await T.ev(() => { const F = window.__fournil, st = F.st, j = F.G.objectifsDuJour(st, HORLOGE.maintenant()); j.objectifs.forEach((o) => { o.fait = true; o.reclame = true; }); j.etoileDonnee = true; F.save(); });
  await T.pas(); await T.pas();
  let p = await T.piste();
  check(p.xp === 25 && p.j.o === 3 && p.j.c === 1, `trois objectifs réclamés et la journée : ${p.xp} XP (5 × 3 + 10), comptés une fois (deux pas)`);
  await T.ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.paliers = [1, 2, 3]; F.save(); });
  await T.pas(); p = await T.piste();
  check(p.xp === 85 && p.ev.marche === 3, `trois paliers du Marché : +60 XP (${p.xp})`);
  c = await attendre(async () => { const x = await T.carte(); return x && x.pret ? x : null; }, 4000);
  check(!!c && /cran 1\/22/.test(c.txt) && /Recevoir/.test(c.txt), `le cran 1 atteint : « ${c && c.txt} »`);

  console.log('── la feuille de la piste ──');
  await T.clic('#piste'); await sleep(800);
  const lireFeuille = () => T.ev(() => { const f = document.querySelector('#feuille-contenu'), box = f.querySelector('.pi-piste'); if (!box) return null; const crans = [...box.querySelectorAll('.pi-cran')], att = box.querySelector('.pi-cran.attend, .pi-cran.encours'), rb = box.getBoundingClientRect(), ra = att ? att.getBoundingClientRect() : null;
    return { n: crans.length, etats: crans.map((x) => x.className.replace('pi-cran ', '').split(' ')[0]), sources: [...f.querySelectorAll('.pi-sources li')].map((l) => l.innerText.replace(/\s+/g, ' ')), sous: f.querySelector('.pi-tete .sous').innerText, centre: ra ? Math.abs((ra.left + ra.width / 2) - (rb.left + rb.width / 2)) : 999, defile: box.scrollWidth > box.clientWidth, large: document.querySelector('#feuille').scrollWidth - document.querySelector('#feuille').clientWidth, titre: f.querySelector('.pi-titre') ? f.querySelector('.pi-titre').innerText.replace(/\s+/g, ' ') : '', tout: !!f.querySelector('[data-a="pi-tout"]') }; });
  let fe = await lireFeuille();
  check(fe && fe.n === 22 && fe.etats[0] === 'attend' && fe.etats[1] === 'encours' && fe.etats.slice(2).every((x) => x === 'avenir'), `la piste : ${fe && fe.n} crans, le 1er à recevoir, le 2e en cours, les autres à venir`);
  check(fe && fe.defile && fe.large <= 1, 'la piste défile au doigt dans sa boîte ; la feuille, pas de côté');
  check(fe && fe.sources.length === 6 && /objectifs du jour/.test(fe.sources[0]) && /fait aujourd’hui/.test(fe.sources[0]) && /défi de la semaine/.test(fe.sources[2]) && /paliers du Marché/.test(fe.sources[4]) && /arrière-salle/.test(fe.sources[5]) && /encore 15 XP/.test(fe.sources[5]), `« D’où vient l’XP » : ${fe && fe.sources.map((x) => x.split(' ').slice(0, 3).join(' ')).join(' · ')}`);
  check(fe && /encore 17 j/.test(fe.sous) && /Feuille d’or 2026/.test(fe.titre), `« ${fe && fe.sous} » ; « ${fe && fe.titre.slice(0, 60)} »`);
  await T.shot('03-feuille-cran-1');
  const b0 = await T.ev(() => window.__fournil.st.boosts.reserve.length);
  await T.clic('#feuille [data-a="pi-recevoir"][data-n="1"]'); await sleep(900);
  p = await T.piste(); fe = await lireFeuille();
  check((p.recus & 1) === 1 && await T.ev(() => window.__fournil.st.boosts.reserve.length) === b0 + 1 && fe && fe.etats[0] === 'recu', 'recevoir le cran 1 : le boost ×2 de 30 min dans la réserve, le cran « Reçu ✓ »');
  check(await T.ev(() => window.__fournil.piste.recevoir(1)) === null, 'un cran se reçoit une seule fois');
  await T.fermer();
  // jusqu'au 7e : « Tout recevoir »
  await T.ev(() => { window.__fournil.st.piste.xp = 330; window.__fournil.save(); }); await T.pas();
  await T.clic('#piste'); await sleep(800);
  fe = await lireFeuille();
  check(fe && fe.tout && fe.etats.slice(1, 7).every((x) => x === 'attend') && fe.etats[7] === 'encours' && fe.centre < 120, `à 330 XP : les crans 2 à 7 à recevoir, « Tout recevoir », le cran en cours au milieu de la piste (à ${fe && Math.round(fe.centre)} px)`);
  await T.shot('04-feuille-cran-7');
  const e0 = await T.ev(() => window.__fournil.st.etoiles);
  await T.clic('#feuille [data-a="pi-tout"]'); await sleep(900);
  p = await T.piste();
  check(p.recus === 0x7f && await T.ev(() => window.__fournil.st.etoiles) === e0 + 3, `« Tout recevoir » : les crans 2 à 7 (+3 ★ : ${e0} → ${await T.ev(() => window.__fournil.st.etoiles)})`);
  { const v = await T.ev(() => { const G = window.__fournil.G; try { return G.vetement('automne-gavroche') ? !!G.possede(window.__fournil.st, 'automne-gavroche') : null; } catch (e) { return null; } });
    if (v === null) passe('la casquette de tweed dans la garde-robe attend la tenue de saison (src/game.js, constructeur A)'); else check(v, 'le cran 5 : la casquette de tweed dans la garde-robe'); }
  await T.fermer();
  // le 22e et le titre
  await T.ev(() => { window.__fournil.st.piste.xp = 990; window.__fournil.save(); }); await T.pas();
  await T.clic('#piste'); await sleep(800); await T.clic('#feuille [data-a="pi-tout"]'); await sleep(900);
  fe = await lireFeuille(); p = await T.piste();
  check(fe && fe.etats.every((x) => x === 'recu') && p.recus === (1 << 22) - 1 && /990\/1 240 XP|990\/1 240/.test(fe.titre.replace(/ | /g, ' ')), `le 22e reçu (le trophée) ; la jauge du titre : « ${fe && fe.titre.slice(0, 80)} »`);
  await T.ev(() => { const b = document.querySelector('#feuille .pi-titre'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(300); await T.shot('05-feuille-cran-22');
  await T.fermer();
  await T.ev(() => { window.__fournil.st.piste.xp = 1240; window.__fournil.save(); }); await T.pas(); await sleep(400);
  c = await T.carte(); check(c.pret && /Recevoir/.test(c.txt), `à 1 240 XP : le titre attend, « Recevoir » sur la carte (« ${c.txt} »)`);
  await T.clic('#piste'); await sleep(800);
  check(await T.ev(() => !!document.querySelector('#feuille .pi-titre.attend [data-a="pi-recevoir"]')), 'la feuille : « Recevoir le titre »');
  await T.ev(() => { const b = document.querySelector('#feuille .pi-titre'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(300); await T.shot('06a-feuille-titre-a-recevoir');
  await T.clic('#feuille .pi-titre [data-a="pi-recevoir"]'); await sleep(900); await T.fermer();
  { const t = await T.ev(() => { const F = window.__fournil; let d = null; try { d = F.G.distinctions ? F.G.distinctions(F.st) : null; } catch (e) { d = null; } return { titre: F.st.piste.titre, d, connu: !!(F.G.DISTINCTIONS && F.G.DISTINCTIONS['feuille-or-2026']) }; });
    check(t.titre === 1 || t.titre === true, 'reçu : le titre de la saison (st.piste.titre)');
    if (t.connu) check(Array.isArray(t.d) && t.d.includes('feuille-or-2026'), 'la distinction « Feuille d’or 2026 », à côté du pseudo au classement'); else passe('la distinction « Feuille d’or 2026 » attend src/game.js (DISTINCTIONS : constructeur A)'); }
  c = await T.carte(); check(/22\/22/.test(c.txt) && /Feuille d’or 2026/.test(c.txt), `la carte : « ${c.txt} »`);
  await T.clic('#piste'); await sleep(800); await T.ev(() => { const b = document.querySelector('#feuille .pi-titre'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(300); await T.shot('06b-feuille-titre-recu'); await T.fermer();

  console.log('── 360 × 640 ──');
  await T.page.setViewportSize({ width: 360, height: 640 }); await sleep(800);
  c = await T.carte(); check(c.vu && c.large <= 0, `la carte en 360 px, sans défilement de côté (${c.large})`);
  await T.clic('#piste'); await sleep(800); fe = await lireFeuille();
  check(fe && fe.large <= 1 && await T.ev(() => document.documentElement.scrollWidth <= innerWidth), 'la feuille en 360 × 640, sans défilement de côté');
  await T.shot('07-feuille-360'); await T.fermer();
  await T.ev(() => document.querySelector('#piste').scrollIntoView({ block: 'center' })); await sleep(300); await T.shot('08-carte-360');

  console.log('── une vieille sauvegarde sans st.piste ──');
  await T.page.setViewportSize({ width: 390, height: 844 });
  await T.ev(() => { const F = window.__fournil; delete F.st.piste; F.save(); }); await T.charger();
  check(await attendre(async () => { const x = await T.piste(); return x && x.id === 'automne-2026'; }, 5000), 'la piste est créée au premier pas');
  c = await attendre(async () => { const x = await T.carte(); return x && x.vu ? x : null; }, 5000); check(!!c, `la carte, tout de suite : « ${c && c.txt} »`);

  console.log('── après le 30 novembre : la feuille de fin ──');
  await T.ev(() => { const F = window.__fournil; F.st.piste.xp = 380; F.st.piste.recus = 1; F.save(); }); // (huit crans atteints, un seul reçu)
  const avantFin = await T.ev(() => ({ et: window.__fournil.st.etoiles, b: window.__fournil.st.boosts.reserve.length }));
  decal = DECEMBRE - Date.now(); await T.ev((d) => localStorage.setItem('test.tel', String(d)), decal); await T.ev(() => window.__fournil.save());
  await T.charger();
  const fin = await attendre(async () => { const t = await T.feuille(); return /est finie/.test(t) ? t : null; }, 15000);
  check(!!fin && /voici ce qui t’attendait/i.test(fin), `la feuille de fin : « ${fin && fin.split('\n')[0]} »`);
  const apresFin = await T.ev(() => ({ et: window.__fournil.st.etoiles, b: window.__fournil.st.boosts.reserve.length, p: JSON.parse(JSON.stringify(window.__fournil.st.piste)) }));
  check(apresFin.et === avantFin.et + 4 && apresFin.p.passees['automne-2026'] && apresFin.p.passees['automne-2026'].crans === 8 && !apresFin.p.id, `les crans 2 à 8 donnés d’office (+4 ★ : ${avantFin.et} → ${apresFin.et}), la saison archivée (passees : ${JSON.stringify(apresFin.p.passees['automne-2026'])})`);
  await sleep(300); await T.shot('09-fin-de-saison'); await T.fermer();
  c = await T.carte(); check(!c.vu, 'la carte est partie (plus de saison active)');
  await T.ctx.close();

  console.log('── un nouveau joueur (l’accueil) ──');
  T = await ouvrir({ accueil: true });
  await T.charger();
  const DEB = await T.ev(() => !!(window.__fournil.G.ACCUEIL && window.__fournil.G.ACCUEIL.deblocages.some((d) => d.id === 'piste')));
  await sleep(1500);
  const p0 = await T.piste(); c = await T.carte();
  check(!!p0 && p0.id === 'automne-2026', 'l’XP compte dès le début : st.piste existe');
  if (DEB) {
    check(!c.vu, 'la carte reste cachée tant que la piste n’est pas débloquée');
    await T.ev(() => { window.__accueilEcart = 400; const F = window.__fournil, st = F.st; for (const x of F.G.ACCUEIL.deblocages) if (x.id !== 'piste') F.G.marquerDeblocage(st, x.id); st.tuto = 9; const j = F.G.objectifsDuJour(st, HORLOGE.maintenant()); j.objectifs.forEach((o) => { o.fait = true; o.reclame = true; }); j.etoileDonnee = true; st.piste.xp = 100; st.lifetime = 2e6; F.save(); });
    const vu = await attendre(async () => { const x = await T.carte(); return x && x.vu ? x : null; }, 40000);
    check(!!vu && /cran 2\/22/.test(vu.txt) && vu.pret, `débloquée (« piste ») : la carte paraît, ses crans à recevoir (« ${vu && vu.txt} »)`);
    check(!!(await attendre(() => T.ev(() => { const a = document.querySelector('#annonce-accueil'); return a && !a.hidden && /saison d’automne/.test(a.innerText); }), 20000)), 'sa bulle d’annonce, comme les autres déblocages de l’accueil');
    await T.shot('10-nouveau-joueur-annonce');
  } else passe('le déblocage « piste » de l’accueil (bit 15) attend src/game.js (ACCUEIL.deblocages : constructeur A) ; sans lui, la carte est là d’emblée');
  await T.ctx.close();

  console.log('── un nouveau joueur qui passe 1 M€ le 13 au matin, avant l’ouverture de la saison ──');
  if (DEB) {
    const MATIN = new Date('2026-11-13T09:00:00+01:00').getTime(), MIDI = new Date('2026-11-13T12:05:00+01:00').getTime();
    T = await ouvrir({ accueil: true, quand: MATIN });
    await T.charger();
    await T.ev(() => { window.__accueilEcart = 400; const F = window.__fournil, st = F.st; for (const x of F.G.ACCUEIL.deblocages) if (x.id !== 'piste') F.G.marquerDeblocage(st, x.id); st.tuto = 9; st.lifetime = 3e7; F.save(); });
    await sleep(4000);
    const m = await T.ev(() => { const F = window.__fournil, st = F.st; return { bit: F.G.accueilOuvert(st, 'piste'), p: st.piste ? st.piste.id : null, an: st.pisteAnnonce || null }; });
    check(!m.bit && !m.p && !m.an, `le 13 à 9 h, 30 M€ (seuil franchi) : le déblocage « piste » attend l’ouverture, pas marqué en silence (bit ${m.bit}, piste ${m.p}, annonce ${m.an})`);
    decal = MIDI - Date.now(); await T.ev((d) => localStorage.setItem('test.tel', String(d)), decal); await T.ev(() => window.__fournil.save());
    await T.charger();
    await T.ev(() => { window.__accueilEcart = 400; });
    let bulle = null;
    for (let k = 0; k < 60 && !bulle; k++) {
      bulle = await T.ev(() => { const a = document.querySelector('#annonce-accueil'); return a && !a.hidden && /saison d’automne/.test(a.innerText) ? a.innerText : null; });
      if (!bulle) { await T.ev(() => { const f = document.querySelector('#feuille'); if (!f.hidden) { const b = f.querySelector('[data-a="pq-tard"], [data-a="close"], [data-a="pq-ok"]'); if (b) b.click(); } if (window.__fournil.tiroir) window.__fournil.tiroir('mi'); }); await sleep(1000); }
    }
    const apres = await T.ev(() => { const F = window.__fournil, st = F.st; return { bit: F.G.accueilOuvert(st, 'piste'), an: st.pisteAnnonce || null }; });
    check(!!bulle && apres.bit && apres.an === 'automne-2026', `le 13 à 12 h 05 : sa bulle d’annonce de la saison paraît à l’ouverture (« ${bulle && bulle.trim()} »), puis le bit et st.pisteAnnonce`);
    await T.shot('11-nouveau-joueur-matin-du-13');
    await T.ctx.close();
  }

  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', (e && e.stack) || e); process.exit(1); });
