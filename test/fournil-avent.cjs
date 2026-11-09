// Le calendrier de l'Avent à l'écran (src/ui.js, AVA ; les règles : src/avent.js, AVENT) sur la vraie page du Fournil (fournil/ servie en
// local), téléphone en portrait (390 × 844). L'Avent est éteint sous navigator.webdriver : ce test seul l'allume (window.__avent = true ; aucun
// autre test ne voit la carte ni l'annonce) ; la saison aussi (window.__saison = true : les 10 XP de la case dans la piste d'hiver). Les jours
// changent par l'HORLOGE (la fausse heure du téléphone et l'en-tête Date du serveur, au rechargement), jamais en avançant la fausse horloge de
// 24 h ; toute attente s'arrête dès que sa condition est vraie (LENT : FOURNIL_ATTENTE, ×3 sous CI). Parcours :
// · une vieille partie sans st.avent, le samedi 5 décembre à 10 h : une seule annonce, « Le calendrier de l'Avent et la saison d'hiver » (pas
//   celle de la saison en plus), st.aventAnnonce et st.pisteAnnonce posés ensemble ; la carte #avent au-dessus de #piste, sa pastille ;
// · la feuille : 24 cases dans l'ordre mélangé (ORDRE_CASES), la case du jour qui luit, les quatre oubliées « À rattraper », les spéciales sur
//   deux colonnes ; ouvrir la 5 (le bonnet dans la garde-robe, +10 XP dans la piste), rattraper la 3 (le ruban part des autres), le refus d'une
//   seconde, une future (« Patience ! ») ; 360 × 640 sans défilement de côté, des cases d'au moins 72 px ;
// · le 6 : le renne (la feuille du lot, Les compagnons) ; l'heure sûre en retard (le message, la case attend) ; aVerser (une pièce perdue
//   redonnée au lancement) ; le 25 : un rattrapage, pas deux ; le 1er janvier : la carte disparaît, la feuille reste lisible (Mes récompenses),
//   Mes décos (famille Avent) ; le 24 au soir (une oubliée : « à rattraper demain », tout ouvert : « joyeux Noël ») et le 31 au soir (« se range
//   ce soir à minuit ») : la carte et le sous-titre de la feuille ;
// · un nouveau joueur (window.__accueil = true) : la carte cachée, puis la bulle au déblocage « avent » (sa piste ouverte en automne :
//   elle dit aussi la saison d’hiver, st.pisteAnnonce posé avec). Aucune erreur de page.
// Captures dans test/shots/avent/ (et dans SHOTS_AVENT s'il est donné).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-avent.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_AVENT || 8898;
const out = path.join(__dirname, 'shots', 'avent'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_AVENT ? (fs.mkdirSync(process.env.SHOTS_AVENT, { recursive: true }), process.env.SHOTS_AVENT) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' };
const AVENT = require('../src/avent.js');
const P = (j, h, mo = 12, a = 2026) => new Date(`${a}-${String(mo).padStart(2, '0')}-${String(j).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00+01:00`).getTime();
let decal = P(5, 10) - Date.now(), decalSrv = decal, sansHeure = false; // (decalSrv : l'heure sûre que donne le serveur ; sansHeure : hors ligne, pas d'en-tête Date)
const server = http.createServer((req, res) => {
  if (sansHeure) res.sendDate = false; else res.setHeader('Date', new Date(Date.now() + decalSrv).toUTCString());
  if (req.method === 'HEAD') { if (sansHeure) { res.writeHead(503); res.end(); return; } res.writeHead(200); res.end(); return; }
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const CPU = Number(process.env.FOURNIL_CPU) || 0; // FOURNIL_CPU=n : le processeur de chaque page ralenti n fois (CDP, comme les machines de GitHub)
const LENT = Number(process.env.FOURNIL_ATTENTE) || (process.env.CI ? 3 : 1); // toutes les attentes × LENT (elles s'arrêtent dès que c'est vrai)
const attendre = async (fn, ms = 10000, pas = 150) => { for (let t = 0; t < ms * LENT; t += pas) { try { const r = await fn(); if (r) return r; } catch (e) { /* la page se recharge */ } await sleep(pas); } return null; };
function telephone(o) { // avant tout script : la fausse heure (gardée d'un chargement à l'autre), l'Avent et la saison allumés, l'accueil si demandé
  let d = o.decal; try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* about:blank */ }
  const D = Date; class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = FauxDate;
  window.__avent = true; window.__saison = true; if (o.accueil) window.__accueil = true;
  window.__feuilles = []; // les feuilles ouvertes, dans l'ordre (leur première ligne) : l'ordre des annonces, quand il est faux
  new MutationObserver(() => { const f = document.querySelector('#feuille'), c = document.querySelector('#feuille-contenu'), t = f && !f.hidden && c ? c.innerText.split('\n')[0].slice(0, 60) : ''; if (t && window.__feuilles[window.__feuilles.length - 1] !== t) window.__feuilles.push(t); }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  window.__toasts = []; new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent); }).observe(document, { childList: true, subtree: true, characterData: true });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  async function ouvrir(o = {}) {
    decal = decalSrv = (o.quand || P(5, 10)) - Date.now(); sansHeure = false;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(telephone, { decal, accueil: !!o.accueil });
    await ctx.route(/supabase\.co|googleapis|gstatic/, (r) => r.abort());
    const page = await ctx.newPage();
    if (CPU > 1) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
    page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404|503/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const pret = async () => { await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 * LENT }); await attendre(() => ev(() => !!document.querySelector('#tiroir')), 5000); };
    const charger = async () => { await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await pret(); };
    const shot = async (nom) => { await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); await ev(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
    const feuille = () => ev(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
    const clic = (sel) => ev((s) => { const b = document.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
    const fermer = async () => { for (let k = 0; k < 6; k++) { if (await ev(() => document.querySelector('#feuille').hidden)) return; await ev(() => { const b = document.querySelector('#feuille [data-a="close"], #feuille [data-a="pq-tard"], #feuille [data-a="pq-ok"]'); if (b) b.click(); else document.querySelector('#voile').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); await attendre(() => ev(() => document.querySelector('#feuille').hidden), 1500, 100); } };
    const carte = () => ev(() => { const c = document.querySelector('#avent'), p = document.querySelector('#piste'); if (!c) return null; const r = c.getBoundingClientRect(), rp = p && !p.hidden ? p.getBoundingClientRect() : null; return { vu: !c.hidden && r.height > 0, txt: c.innerText.replace(/\s+/g, ' ').trim(), pret: c.classList.contains('pret'), dessus: rp ? r.bottom <= rp.top + 1 : null, large: document.documentElement.scrollWidth - innerWidth }; });
    const avent = () => ev(() => { const a = window.__fournil.st.avent; return a ? JSON.parse(JSON.stringify(a)) : null; });
    const lire = () => ev(() => { const f = document.querySelector('#feuille-contenu'), g = f && f.querySelector('.av-grille'); if (!g) return null; const cs = [...g.querySelectorAll('.av-case')];
      return { ordre: cs.map((c) => +c.dataset.av), etats: Object.fromEntries(cs.map((c) => [+c.dataset.av, c.className.replace('av-case ', '').split(' ')[0]])), rubans: g.querySelectorAll('.av-ruban').length, msg: (f.querySelector('#av-msg') || {}).textContent || '', pied: (f.querySelector('.av-pied') || {}).innerText || '',
        regle: (f.querySelector('.av-regle') || {}).textContent || '', tailles: cs.map((c) => { const r = c.getBoundingClientRect(); return [+c.dataset.av, Math.round(r.width), Math.round(r.height)]; }), large: Math.max(document.documentElement.scrollWidth - innerWidth, document.querySelector('#feuille').scrollWidth - document.querySelector('#feuille').clientWidth) }; });
    const ouvrirCase = async (n) => { await clic(`#feuille [data-av="${n}"]`); await sleep(250); };
    const allerA = async (quand, o2 = {}) => { // un autre jour : la fausse heure du téléphone (gardée) et celle du serveur, puis le rechargement
      decal = quand - Date.now(); decalSrv = o2.srv != null ? o2.srv - Date.now() : decal; sansHeure = !!o2.horsLigne;
      await ev((d) => { localStorage.setItem('test.tel', String(d)); window.__fournil.save(); }, decal); await charger();
    };
    return { ctx, page, ev, charger, shot, feuille, clic, fermer, carte, avent, lire, ouvrirCase, allerA };
  }
  const xpPiste = (T) => T.ev(() => (window.__fournil.st.piste ? window.__fournil.st.piste.xp : null));

  console.log('── une vieille partie sans st.avent, le samedi 5 décembre à 10 h ──');
  let T = await ouvrir();
  await T.charger();
  // la vieille partie préparée, puis la page figée jusqu'au rechargement (sous un processeur lent, elle annonçait encore et sauvait en partant)
  check(await T.ev(async () => { const F = window.__fournil, K = 'fournil.v2';
    const idb = () => new Promise((ok) => { const r = indexedDB.open('fournil', 1); r.onsuccess = () => { try { const g = r.result.transaction('sauvegarde').objectStore('sauvegarde').get(K); g.onsuccess = () => ok(g.result); g.onerror = () => ok(null); } catch (e) { ok(null); } }; r.onerror = () => ok(null); });
    for (let k = 0; k < 20; k++) {
      const st = F.st; st.lifetime = Math.max(st.lifetime, 5e9); st.tuto = 9; st.etoiles = Math.max(st.etoiles, 3); delete st.avent; delete st.aventAnnonce; delete st.piste; delete st.pisteAnnonce; delete st.marche; F.save();
      const ls = localStorage.getItem(K); let v = null; for (let j = 0; j < 40 && v !== ls; j++) { await new Promise((r) => setTimeout(r, 50)); v = await idb(); }
      const x = JSON.parse(ls); if (v === ls && !x.avent && !x.piste && !x.aventAnnonce && x.tuto === 9) { const si = Storage.prototype.setItem, put = IDBObjectStore.prototype.put;
        Storage.prototype.setItem = function (cle, val) { if (cle === K) return; return si.call(this, cle, val); }; IDBObjectStore.prototype.put = function (val, cle) { if (cle === K) throw new Error('figée'); return put.call(this, val, cle); }; return true; }
    } return false; }), 'la vieille partie préparée (sans Avent, sans saison), la page figée jusqu’au rechargement');
  await T.charger();
  check(await T.ev(() => window.__fournil.avent && window.__fournil.avent.actif) === true, 'l’Avent est allumé (window.__avent)');
  check(!!(await attendre(async () => { const a = await T.avent(); return a && a.id === AVENT.ID && a.o === 0; }, 8000)), 'st.avent est créé au premier pas, rien d’ouvert');
  const an = await attendre(async () => { const t = await T.feuille(); return /Le calendrier de l’Avent et la saison d’hiver/.test(t) ? t : null; }, 25000);
  check(!!an && /rattraper une par jour/.test(an) && /3 janvier/.test(an) && /46 crans/.test(an) && /Ouvrir la case 5/.test(an) && /Plus tard/.test(an), `une seule annonce pour décembre : « ${an && an.split('\n')[0]} », deux points, « Ouvrir la case 5 » / « Plus tard »`);
  check(await T.ev(() => window.__fournil.st.aventAnnonce === 'avent-2026' && window.__fournil.st.pisteAnnonce === 'hiver-2026'), 'st.aventAnnonce et st.pisteAnnonce (« hiver-2026 ») posés ensemble');
  await sleep(500); await T.shot('01-annonce-decembre');
  await T.clic('#feuille [data-a="close"]'); await attendre(() => T.ev(() => document.querySelector('#feuille').hidden), 3000);
  await sleep(7000); // (rien ne doit venir : ce qui suivrait passerait dans ce délai, la file réessaie toutes les 1,5 s et la saison toutes les 5 s)
  const fs1 = await T.ev(() => window.__feuilles.slice());
  check(!fs1.some((t) => /Nouveau : la saison d’hiver/.test(t)) && await T.ev(() => document.querySelector('#feuille').hidden), `pas d’annonce de la saison d’hiver en plus (les feuilles : ${JSON.stringify(fs1)})`);
  await T.ev(() => window.__fournil.tiroir && window.__fournil.tiroir('mi')); await sleep(300);
  let c = await attendre(async () => { const x = await T.carte(); return x && x.vu ? x : null; }, 5000);
  check(!!c && /Calendrier de l’Avent · 0\/24/.test(c.txt) && /case du jour t’attend/.test(c.txt) && c.pret && /Ouvrir/.test(c.txt), `la carte #avent : « ${c && c.txt} », la pastille`);
  check(!!c && c.dessus === true, 'au-dessus de la carte de la saison (#piste)');
  await T.ev(() => document.querySelector('#avent').scrollIntoView({ block: 'center' })); await sleep(300); await T.shot('02-carte');

  console.log('── la feuille-calendrier ──');
  await T.clic('#avent');
  let fe = await attendre(() => T.lire(), 4000);
  check(!!fe && fe.ordre.join() === AVENT.ORDRE_CASES.join(), `24 cases, dans l’ordre mélangé (${fe && fe.ordre.slice(0, 6).join(', ')}…)`);
  check(!!fe && fe.etats[5] === 'dujour' && [1, 2, 3, 4].every((n) => fe.etats[n] === 'rattrapage') && fe.rubans === 4 && Array.from({ length: 19 }, (_, k) => k + 6).every((n) => fe.etats[n] === 'future'), 'la case du jour (5) qui luit, les quatre oubliées « À rattraper », les autres à venir');
  { const t = fe ? Object.fromEntries(fe.tailles.map(([n, w, h]) => [n, [w, h]])) : {}; check(!!fe && [6, 12, 18, 24].every((n) => t[n][0] > 1.8 * t[1][0]) && fe.tailles.every(([, w, h]) => w >= 72 && h >= 72), `les spéciales sur deux colonnes, toutes ≥ 72 px (la plus petite : ${fe && Math.min(...fe.tailles.map(([, w, h]) => Math.min(w, h)))} px)`); }
  check(!!fe && fe.regle === AVENT.TEXTES.regle && fe.pied.includes(AVENT.TEXTES.boite(0)) && fe.pied.includes(AVENT.TEXTES.restant(27)), `en bas : la règle, « ${fe && fe.pied.replace(/\s+/g, ' ')} »`);
  await sleep(500); await T.shot('03-feuille-5-decembre');
  const xp0 = await xpPiste(T);
  await T.ouvrirCase(5);
  let a = await attendre(async () => { const x = await T.avent(); return x && x.o === 16 ? x : null; }, 4000);
  check(!!a, 'ouvrir la case 5 : marquée (st.avent.o)');
  check(await T.ev(() => { const F = window.__fournil; return !!F.G.garderobe(F.st).objets['avent-bonnet']; }), 'le bonnet de Noël dans la garde-robe, dans le même geste');
  check(!!(await attendre(async () => (await xpPiste(T)) === xp0 + 10, 4000)), `+10 XP dans la piste d’hiver (${xp0} → ${await xpPiste(T)})`);
  fe = await T.lire();
  check(!!fe && fe.etats[5] === 'ouverte' && /\+10 XP de saison/.test(fe.msg), `la case ouverte, sa friandise : « ${fe && fe.msg} »`);
  await T.shot('04-case-ouverte');
  await T.ouvrirCase(3);
  a = await attendre(async () => { const x = await T.avent(); return x && x.o === 16 + 4 ? x : null; }, 4000);
  fe = await T.lire();
  check(!!a && a.r === '2026-12-05' && fe && fe.etats[3] === 'ouverte' && fe.rubans === 0 && [1, 2, 4].every((n) => fe.etats[n] === 'oubliee'), 'rattraper la 3 : ouverte, le ruban part des autres (le rattrapage du jour est pris)');
  await T.ouvrirCase(2);
  fe = await T.lire(); a = await T.avent();
  check(fe && fe.msg === AVENT.TEXTES.rattrapage && a.o === 20, `une seconde : « ${fe && fe.msg} »`);
  await T.ouvrirCase(14);
  fe = await T.lire(); a = await T.avent();
  check(fe && fe.msg === AVENT.TEXTES.future(14) && a.o === 20, `une future : « ${fe && fe.msg} »`);
  await T.shot('05-patience');
  c = await T.carte(); check(!c.pret && /2\/24/.test(c.txt), `la carte sans pastille : « ${c.txt} »`);

  console.log('── 360 × 640 ──');
  await T.page.setViewportSize({ width: 360, height: 640 }); await sleep(600);
  fe = await T.lire();
  check(!!fe && fe.large <= 0 && fe.tailles.every(([, w, h]) => w >= 72 && h >= 72), `la feuille en 360 × 640, sans défilement de côté, des cases ≥ 72 px (${fe && Math.min(...fe.tailles.map(([, w, h]) => Math.min(w, h)))} px)`);
  await T.shot('06-feuille-360');
  await T.fermer(); c = await T.carte(); check(c.vu && c.large <= 0, 'la carte en 360 px, sans défilement de côté');
  await T.page.setViewportSize({ width: 390, height: 844 }); await sleep(400);

  console.log('── le 6 décembre : la Saint-Nicolas ──');
  await T.allerA(P(6, 10));
  check(!!(await attendre(async () => { const x = await T.carte(); return x && x.vu && x.pret; }, 6000)), 'le 6 : la case du jour attend (la pastille)');
  check(await T.ev(() => window.__fournil.st.aventAnnonce) === 'avent-2026' && !(await T.ev(() => window.__feuilles.some((t) => /Le calendrier de l’Avent et/.test(t)))), 'pas d’annonce une seconde fois');
  await T.clic('#avent'); await attendre(() => T.lire(), 4000);
  await T.ouvrirCase(6);
  const lot6 = await attendre(async () => { const t = await T.feuille(); return /Grelot le petit renne t’attend dans Les compagnons/.test(t) ? t : null; }, 4000);
  check(!!lot6 && /Case 6/.test(lot6), 'la case 6 : la feuille du lot, « Grelot le petit renne t’attend dans Les compagnons »');
  check(await T.ev(() => window.__fournil.G.aCompagnon(window.__fournil.st, 'renne')), 'le renne gagné (GAME.COMPAGNONS, AVENT.possede)');
  await T.shot('07-case-6-renne');
  await T.clic('#feuille [data-a="av-comp"]');
  const comp = await attendre(async () => { const t = await T.feuille(); return /Les compagnons/.test(t) && /Petit renne/.test(t) ? t : null; }, 4000);
  check(!!comp && /Gagné au calendrier de l’Avent/.test(comp) && await T.ev(() => !!document.querySelector('#feuille [data-cp-choisir="renne"]')), 'Les compagnons : le petit renne, « Gagné au calendrier de l’Avent », à choisir');
  await T.clic('#feuille [data-cp-choisir="renne"]');
  check(!!(await attendre(() => T.ev(() => window.__fournil.st.compagnon === 'renne'), 3000)), `le renne choisi pour la boutique (« ${await T.ev(() => window.__fournil.st.chat && window.__fournil.st.chat.nom)} »)`);
  await T.shot('08a-compagnons-renne');
  await T.fermer(); await sleep(800); await T.shot('08-renne-boutique');

  console.log('── l’heure sûre en retard ──');
  await T.allerA(P(6, 21)); // (l'heure sûre du 6 à 21 h gardée dans la sauvegarde)
  await T.allerA(P(7, 1), { horsLigne: true }); // le téléphone dit le 7 à 1 h, hors ligne : l'heure sûre dit encore le 6
  const vr = await attendre(async () => { const v = await T.ev(() => window.__fournil.avent.vue()); return v && v.attendHeure ? v : null; }, 6000);
  check(!!vr && vr.jour === 6 && vr.jourJeu === 7, `le jour lu sur l’heure sûre (${vr && vr.jour}), pas sur le téléphone (${vr && vr.jourJeu})`);
  await T.clic('#avent'); fe = await attendre(() => T.lire(), 4000);
  check(!!fe && fe.msg === AVENT.TEXTES.heure, `le message : « ${fe && fe.msg} »`);
  await T.ouvrirCase(7); a = await T.avent(); fe = await T.lire();
  check(!(a.o & 64) && fe && fe.msg === AVENT.TEXTES.heure, 'la case 7 attend que le téléphone retrouve l’heure');
  await T.shot('09-heure-sure'); await T.fermer();

  console.log('── aVerser : une pièce perdue entre ouvrir et verser ──');
  await T.allerA(P(11, 10));
  await T.ev(() => { const F = window.__fournil, st = F.st; st.avent.o += 2 ** 10; delete F.G.garderobe(st).objets['avent-echarpe']; F.save(); }); // (la case 11 marquée, l'écharpe pas versée : l'écran tombé entre les deux)
  await T.charger();
  check(!!(await attendre(() => T.ev(() => { const F = window.__fournil; return !!F.G.garderobe(F.st).objets['avent-echarpe']; }), 5000)), 'au lancement, aVerser redonne l’écharpe rayée');
  await T.clic('#avent'); await attendre(() => T.lire(), 4000); await T.ouvrirCase(2); // (le rattrapage du 11 : la couronne de l'Avent)
  check(!!(await attendre(async () => { const x = await T.avent(); return x && (x.o & 2); }, 3000)) && await T.ev(() => AVENT.possede(window.__fournil.st, 'couronne-avent')), 'le 11 : la 2 rattrapée, la couronne de l’Avent (AVENT.possede)');
  await T.fermer();

  console.log('── le 25 décembre : un rattrapage par jour ──');
  await T.allerA(P(25, 12));
  c = await attendre(async () => { const x = await T.carte(); return x && x.vu ? x : null; }, 6000);
  check(!!c && c.pret && /rattraper/.test(c.txt), `la carte : « ${c && c.txt} »`);
  await T.clic('#avent'); fe = await attendre(() => T.lire(), 4000);
  check(!!fe && !Object.values(fe.etats).includes('dujour') && fe.etats[1] === 'rattrapage' && fe.etats[24] === 'rattrapage', 'plus de case du jour ; les oubliées à rattraper (la 24 aussi)');
  await T.shot('10-le-25');
  await T.ouvrirCase(24);
  const lot24 = await attendre(async () => { const t = await T.feuille(); return /Case 24/.test(t) ? t : null; }, 4000);
  check(!!lot24 && await T.ev(() => { const F = window.__fournil, g = F.G.garderobe(F.st); return !!g.objets['avent-chaussons'] && (g.auras || []).includes('flocons'); }), 'la 24 rattrapée : les chaussons et l’aura des flocons');
  await T.shot('11-case-24'); await T.clic('#feuille [data-a="av-cal"]'); await attendre(() => T.lire(), 3000);
  await T.ouvrirCase(1); fe = await T.lire(); a = await T.avent();
  check(fe && fe.msg === AVENT.TEXTES.rattrapage && !(a.o & 1), 'pas deux rattrapages le même jour');
  await T.fermer();
  // la tenue de Noël au complet (la 17 donnée ici : le pull), portée : la garde-robe, le boulanger chibi (8 appels de dessin, + l'aura : un sprite)
  await T.ev(() => { const F = window.__fournil, G = F.G, st = F.st; G.donnerVetement(st, 'avent-pull'); G.equiperCollection(st, 'avent'); G.porterAura(st, 'flocons'); F.rafraichir(); F.garderobe('haut'); });
  const gr = await attendre(() => T.ev(() => { const f = document.querySelector('#feuille-contenu [data-cl="garderobe"]'); if (!f) return null; const e = f.querySelector('.gr-ensemble.avent'); return { complet: window.__fournil.G.ensembleComplet(window.__fournil.st), ens: e ? e.innerText.replace(/\s+/g, ' ') : '', tete: f.querySelector('.gr-tete').innerText.replace(/\s+/g, ' ') }; }), 4000);
  check(!!gr && gr.complet === 'avent' && /Tenue de Noël/.test(gr.ens) && /Aucun bonus porté/.test(gr.tete), `la garde-robe : la tenue de Noël au complet, sans bonus (« ${gr && gr.tete.slice(0, 60)} »)`);
  await T.ev(() => { const b = document.querySelector('.gr-ensemble.avent'); if (b) b.scrollIntoView({ block: 'center' }); }); await sleep(300); await T.shot('11b-garderobe-tenue-noel');
  await T.fermer(); await T.ev(() => { window.__fournil.page('boutique'); window.__fournil.tiroir('ferme'); }); await sleep(1200);
  const m = await T.ev(() => window.__fournil.SCENE.maillagesRecompenses.boulanger);
  check(m <= 9, `le boulanger chibi en tenue de Noël et l’aura des flocons : ${m} appels de dessin (8 au plus, + l’aura)`);
  await T.shot('11c-boulanger-tenue-noel');

  console.log('── le 1er janvier : le calendrier rangé ──');
  await T.allerA(P(1, 10, 1, 2027));
  await sleep(1500);
  c = await T.carte(); check(!c.vu, 'la carte disparaît');
  const fam = await T.ev(() => { try { const f = CHAINE.carnet(window.__fournil.st, {}, null).find((x) => x.id === 'avent'); return f ? { g: f.gagnes, t: f.total, n: f.nom } : null; } catch (e) { return String(e); } });
  check(!!fam && fam.n === AVENT.TEXTES.famille && fam.g === 1, `Mes décos : la famille « ${fam && fam.n} » (${fam && fam.g}/${fam && fam.t})`);
  await T.ev(() => window.__fournil.avent.feuille(true)); fe = await attendre(() => T.lire(), 4000);
  check(!!fe && Object.values(fe.etats).every((e) => e === 'ouverte' || e === 'rangee') && await T.ev(() => /Calendrier de l’Avent 2026 : \d+\/24/.test(document.querySelector('#feuille-contenu').innerText)), 'la feuille reste lisible : « Calendrier de l’Avent 2026 : 7/24 »');
  await T.shot('12-range'); await T.fermer();
  await T.ctx.close();

  console.log('── les derniers jours : le 24 au soir, le 31 au soir ──');
  { // (les mots de la carte et du sous-titre de la feuille quand il n'y a plus rien à ouvrir aujourd'hui : pas de « case 25 », pas de « demain » le 31)
    const preparer = (T, o, r) => T.ev(([o2, r2]) => { const F = window.__fournil, st = F.st; st.tuto = 9; st.lifetime = Math.max(st.lifetime, 5e9); st.aventAnnonce = 'avent-2026'; st.pisteAnnonce = 'hiver-2026'; st.avent = { v: 1, id: 'avent-2026', o: o2, r: r2 }; F.save(); }, [o, r]);
    const sauf = (l) => { let o = 0; for (let n = 1; n <= 24; n++) if (!l.includes(n)) o += 2 ** (n - 1); return o; };
    const lireFin = (T) => T.ev(async () => { const F = window.__fournil, f = document.querySelector('#feuille'); if (!f.hidden) { const b = f.querySelector('[data-a="close"], [data-a="pq-tard"], [data-a="pq-ok"]'); if (b) b.click(); }
      if (F.tiroir) F.tiroir('mi'); F.avent.carte(); const carte = document.querySelector('#avent').innerText.replace(/\s+/g, ' ').trim();
      F.avent.feuille(); await new Promise((ok) => setTimeout(ok, 300)); const s = document.querySelector('#feuille-contenu .av-tete .sous'); const sous = s ? s.textContent : ''; const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); return { carte, sous }; });
    T = await ouvrir({ quand: P(24, 18) }); await T.charger();
    await preparer(T, sauf([9, 10, 24]), '');
    const r24 = await T.ev(() => [24, 9].map((n) => { const x = window.__fournil.avent.ouvrir(n); return x && x.ok; }));
    await sleep(400); let x = await lireFin(T);
    check(r24.every(Boolean) && /une case oubliée à rattraper demain/.test(x.carte) && !/case 25|case 24/.test(x.carte) && /une case oubliée à rattraper demain/.test(x.sous), `le 24 au soir, la 24 ouverte et le rattrapage pris, la 10 oubliée : « ${x.carte} » ; la feuille : « ${x.sous} »`);
    await preparer(T, 2 ** 24 - 1, '2026-12-24'); await sleep(200); x = await lireFin(T);
    check(/tout est ouvert : joyeux Noël !/.test(x.carte) && /tout est ouvert : joyeux Noël !/.test(x.sous), `le 24 au soir, tout ouvert : « ${x.carte} » ; la feuille : « ${x.sous} »`);
    await T.allerA(P(31, 18));
    await preparer(T, sauf([9, 10]), '');
    const r31 = await T.ev(() => { const x2 = window.__fournil.avent.ouvrir(9); return x2 && x2.ok; });
    await sleep(400); x = await lireFin(T);
    check(r31 && /le calendrier se range ce soir à minuit/.test(x.carte) && !/demain/.test(x.carte) && /le calendrier se range ce soir à minuit/.test(x.sous), `le 31 au soir, le rattrapage pris : « ${x.carte} » ; la feuille : « ${x.sous} »`);
    await T.shot('12b-le-31-au-soir');
    await T.ctx.close();
  }

  console.log('── un nouveau joueur (l’accueil), le 5 décembre ──');
  T = await ouvrir({ accueil: true });
  await T.charger();
  const DEB = await T.ev(() => !!(window.__fournil.G.ACCUEIL && window.__fournil.G.ACCUEIL.deblocages.some((d) => d.id === 'avent')));
  await sleep(1500);
  c = await T.carte();
  check(DEB && !c.vu, 'la carte reste cachée tant que l’Avent n’est pas débloqué');
  await T.ev(() => { window.__accueilEcart = 400; const F = window.__fournil, st = F.st; for (const x of F.G.ACCUEIL.deblocages) if (x.id !== 'avent') F.G.marquerDeblocage(st, x.id); st.pisteAnnonce = 'automne-2026'; st.tuto = 9; st.lifetime = 3e7; F.save(); }); // (sa piste ouverte et annoncée en automne : la bulle de l'Avent dit aussi la saison d'hiver)
  let bulle = null;
  for (let k = 0; k < 60 * LENT && !bulle; k++) {
    bulle = await T.ev(() => { const x = document.querySelector('#annonce-accueil'); return x && !x.hidden && /calendrier de l’Avent/.test(x.innerText) ? x.innerText : null; });
    if (!bulle) { await T.ev(() => { const f = document.querySelector('#feuille'); if (!f.hidden) { const b = f.querySelector('[data-a="pq-tard"], [data-a="close"], [data-a="pq-ok"]'); if (b) b.click(); } if (window.__fournil.tiroir) window.__fournil.tiroir('mi'); }); await sleep(1000); }
  }
  const apres = await T.ev(() => { const F = window.__fournil, st = F.st; return { bit: F.G.accueilOuvert(st, 'avent'), an: st.aventAnnonce || null, pi: st.pisteAnnonce || null, aa: F.piste.aAnnoncer() }; });
  check(!!bulle && apres.bit && apres.an === 'avent-2026', `débloqué (« avent ») : la bulle (« ${bulle && bulle.trim()} »), le bit, st.aventAnnonce`);
  check(!!bulle && /saison d’hiver/.test(bulle) && /3 janvier/.test(bulle) && apres.pi === 'hiver-2026' && !apres.aa, `sa piste déjà ouverte en automne : la bulle dit aussi la saison d’hiver (jusqu’au 3 janvier), st.pisteAnnonce « ${apres.pi} » posé avec (rien d’autre à annoncer)`);
  c = await attendre(async () => { const x = await T.carte(); return x && x.vu ? x : null; }, 5000);
  check(!!c && c.pret, `la carte paraît, la case du jour et les oubliées à ouvrir (« ${c && c.txt} »)`);
  await T.shot('13-nouveau-joueur-bulle');
  check(!(await T.ev(() => window.__feuilles.some((t) => /Le calendrier de l’Avent et/.test(t)))), 'pas d’annonce de décembre pour un nouveau joueur (sa bulle en tient lieu)');
  await T.ctx.close();

  check(errors.length === 0, errors.length ? `erreurs de page : ${errors.join(' | ')}` : 'aucune erreur de page');
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', (e && e.stack) || e); process.exit(1); });
