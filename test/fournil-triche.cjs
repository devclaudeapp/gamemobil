// La triche au changement d'heure, sur la vraie page du Fournil : un serveur local donne l'heure juste (en-tête Date), le téléphone a une fausse
// heure (Date décalé avant le chargement de la page). On avance l'heure du téléphone de 8 h, d'un jour, de 3 jours, puis on la remet ; en cours de
// partie aussi ; hors ligne puis en ligne. Rien ne doit rapporter : ni gains d'absence, ni étoile du jour, ni jour de série, ni cadeau d'habitué,
// ni marché du samedi. Une vraie absence (le serveur avance aussi) rapporte toujours normalement. Et la mise en page d'un samedi à 360×640.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-triche.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const HEURE = 3600e3, JOUR = 24 * HEURE;
// le « vrai » temps du test : vendredi 9 octobre 2026, 19 h à Paris (Léna, l'habituée du soir, passe de 17 h à 20 h ; demain, c'est le marché)
const DEPART = new Date('2026-10-09T19:00:00+02:00').getTime();
let decalServeur = DEPART - Date.now(), lecturesHeure = 0;
const vrai = () => Date.now() + decalServeur;
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString()); // l'horloge du serveur (GitHub Pages en vrai)
  if (/[?&]heure=/.test(req.url)) lecturesHeure++;
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : d); });
}).listen(0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const fmtH = (ms) => `${(ms / HEURE).toFixed(1)} h`;

// avant tout script de la page : une fausse heure du téléphone (décalage gardé d'un chargement à l'autre) et une visibilité qu'on pilote
function fauxTelephone(decalDepart) {
  let d = decalDepart;
  try { const v = localStorage.getItem('test.tel'); if (v != null) d = +v; } catch (e) { /* about:blank */ }
  const D = Date;
  class FauxDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } }
  window.Date = FauxDate;
  window.__heureTel = (dec) => { d = dec; try { localStorage.setItem('test.tel', String(dec)); } catch (e) { /* rien */ } };
  let cache = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => cache });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (cache ? 'hidden' : 'visible') });
  window.__cacher = (v) => { cache = v; document.dispatchEvent(new Event('visibilitychange')); };
}

(async () => {
  const port = server.address().port, URL_JEU = `http://localhost:${port}/fournil/`;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await context.addInitScript(fauxTelephone, decalServeur);
  const versSupabase = []; context.on('request', (r) => { if (/supabase\.co/.test(r.url())) versSupabase.push(r.url()); });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  // le téléphone : son heure = le vrai temps + ecart
  const heureTel = (ecart) => page.evaluate((d) => window.__heureTel(d), decalServeur + ecart);
  const pret = async () => { await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 15000 }); await sleep(600); };
  const charger = async () => { await page.reload(); await pret(); };
  const etat = () => page.evaluate(() => {
    const f = window.__fournil, s = f.st, feuille = document.querySelector('#feuille'), txt = feuille.hidden ? '' : document.querySelector('#feuille-contenu').innerText;
    return { now: s.now, lastSeen: s.lastSeen, jour: s.jour.date, semaine: s.semaine.key, etoiles: s.etoiles, serie: s.serie, dernierJour: s.dernierJourComplet, lifetime: s.lifetime, lena: JSON.stringify((s.habitues || {}).lena || null),
      attendu: !!f.G.habitueAttendu(s, s.now), marche: f.G.jourDeMarche(s.now), badge: /Marché/.test(document.querySelector('#taux').textContent), retour: /Pendant ton absence/.test(txt), retourTxt: txt.split('\n').slice(0, 3).join(' / '), source: HORLOGE.info().source, taux: f.G.tauxParSeconde(s) };
  });
  const fermerFeuille = () => page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b && !document.querySelector('#feuille').hidden) b.click(); });
  const servirLena = () => page.evaluate(() => { const f = window.__fournil, r = f.G.servirHabitue(f.st, 'lena'); return r.ok ? r : { ok: false }; });

  // ─── une partie en cours : trois produits avec apprentis, la journée réussie (étoile, série), Léna servie aujourd'hui ───
  await page.goto(URL_JEU); await pret();
  const debut = await page.evaluate(() => {
    const f = window.__fournil, s = f.st, G = f.G;
    s.coins = 1e7; for (let i = 0; i < 3; i++) { if (s.stations[i].niv === 0) G.acheter(s, i); G.embaucher(s, i); s.stations[i].actif = true; }
    s.coins = 1000; s.tuto = 99;
    G.objectifsDuJour(s, s.now); s.jour.objectifs.forEach((o) => { o.fait = true; }); s.jour.objectifs.forEach((o, k) => G.reclamer(s, k));
    s.habitues = { lena: { jours: 4, dernier: G.dayKey(s.now), vuLe: G.dayKey(s.now) } };
    f.save(); return { info: HORLOGE.info(), jour: s.jour.date };
  });
  check(debut.info.source === 'page' && Math.abs(debut.info.jeu - vrai()) < 3000 && debut.jour === '2026-10-09', `l’heure sûre vient de l’en-tête Date de la page (${lecturesHeure} lecture(s)) ; le jeu est au vendredi 9 octobre, 19 h`);
  await charger();
  const e0 = await etat();
  check(e0.etoiles >= 1 && e0.serie === 1 && e0.dernierJour === '2026-10-09' && !e0.attendu && !e0.marche && !e0.retour, `la journée est réussie (série ${e0.serie}), Léna est déjà servie, pas de marché un vendredi`);
  let prec = e0;

  // ─── en ligne : avancer l'heure du téléphone, relancer ───
  for (const [ecart, nom] of [[8 * HEURE, 'de 8 h'], [JOUR, 'd’un jour'], [3 * JOUR, 'de 3 jours']]) {
    await heureTel(ecart); const t0 = Date.now(); await charger();
    const e = await etat(), lena = await servirLena(), duree = (Date.now() - t0) / 1000 + 5;
    check(!e.retour && Math.abs(e.now - vrai()) < 3000 && e.now >= prec.now, `téléphone avancé ${nom}, jeu relancé : pas d’absence, le jeu reste à la vraie heure (écart ${Math.round((e.now - vrai()) / 1000)} s)`);
    check(e.jour === e0.jour && e.semaine === e0.semaine && e.etoiles === e0.etoiles && e.serie === e0.serie && e.dernierJour === e0.dernierJour, `  même journée (${e.jour}), même semaine, ni étoile ni jour de série en plus`);
    check(!lena.ok && !e.attendu && e.lena === e0.lena, '  Léna ne revient pas : pas de jour d’habituée, pas de cadeau');
    check(!e.marche && !e.badge, '  pas de marché du samedi');
    check(e.lifetime - prec.lifetime <= e.taux * duree * 2 + 1, `  rien gagné que le temps réel de jeu (+${Math.round(e.lifetime - prec.lifetime)} € en ${Math.round(duree)} s)`);
    prec = e;
  }
  await heureTel(0); await charger();
  { const e = await etat(); check(!e.retour && e.now >= prec.now && Math.abs(e.now - vrai()) < 3000 && e.jour === e0.jour, 'l’heure du téléphone remise : le jeu ne recule pas, pas d’absence'); prec = e; }

  // ─── en cours de partie : avancer l'heure, quitter le jeu et revenir ───
  await heureTel(3 * JOUR);
  await page.evaluate(() => window.__cacher(true)); await sleep(300); await page.evaluate(() => window.__cacher(false)); await sleep(1200);
  { const e = await etat(); check(!e.retour && Math.abs(e.now - vrai()) < 3000 && e.jour === e0.jour && e.etoiles === e0.etoiles, `en cours de partie, téléphone +3 jours, on quitte et on revient : rien (écart ${Math.round((e.now - vrai()) / 1000)} s)`); prec = e; }
  await heureTel(0);

  // ─── une vraie absence : le serveur avance aussi ───
  decalServeur += 3 * HEURE; await heureTel(0); await charger();
  { const e = await etat(); check(e.retour && Math.abs(e.lifetime - prec.lifetime - e.taux * 3 * 3600) < e.taux * 3 * 3600 * 0.1 + e.taux * 60, `une vraie absence de 3 h (jeu relancé) rapporte bien : ${e.retourTxt}`); await page.screenshot({ path: out + '/triche-vraie-absence.png' }); await fermerFeuille(); prec = e; }
  await page.evaluate(() => window.__cacher(true)); decalServeur += HEURE; await heureTel(0); await sleep(300);
  await page.evaluate(() => window.__cacher(false)); await sleep(1200);
  { const e = await etat(); check(e.retour && Math.abs(e.lifetime - prec.lifetime - e.taux * 3600) < e.taux * 3600 * 0.1 + e.taux * 60 && Math.abs(e.now - vrai()) < 3000, `une vraie absence d’une heure (application en arrière-plan) aussi : ${e.retourTxt}`); await fermerFeuille(); prec = e; }

  // ─── hors ligne : au plus une absence normale, une fois ───
  const absMax = await page.evaluate(() => window.__fournil.G.heuresAbsence(window.__fournil.st) * 3600e3);
  await context.setOffline(true);
  await page.evaluate(() => window.__cacher(true)); await heureTel(3 * JOUR); await sleep(300);
  await page.evaluate(() => window.__cacher(false)); await sleep(1200);
  const hors = await etat();
  check(hors.retour && hors.now - vrai() <= absMax + 5000 && hors.now - prec.now <= absMax + 5000, `hors ligne, téléphone +3 jours : le jeu avance au plus d’une absence (${fmtH(hors.now - prec.now)} ; ${fmtH(absMax)} au plus), pas de 3 jours : ${hors.retourTxt}`);
  check(hors.jour <= new Date(vrai() + absMax).toLocaleDateString('sv-SE'), `  la journée ne va pas plus loin que cette absence (${hors.jour})`);
  await page.screenshot({ path: out + '/triche-hors-ligne.png' }); await fermerFeuille();
  await page.evaluate(() => window.__cacher(true)); await sleep(300); await page.evaluate(() => window.__cacher(false)); await sleep(1200);
  { const e = await etat(); check(!e.retour && e.now - hors.now < 10e3, 'hors ligne, on quitte et on revient encore : plus rien'); }
  await context.setOffline(false);
  // relancé sans heure sûre (la lecture échoue), téléphone toujours en avance : plus rien non plus
  await page.route('**/*heure=*', (r) => r.abort());
  await charger();
  { const e = await etat(); check(!e.retour && e.now >= hors.now && e.now - hors.now < 30e3 && e.source === 'telephone', 'relancé sans heure sûre, téléphone toujours +3 jours : rien de plus, la dernière heure sûre borne tout'); prec = e; }
  await page.unroute('**/*heure=*');
  await heureTel(0); await charger();
  { const e = await etat(); check(!e.retour && e.now >= prec.now && e.source === 'page' && e.lifetime - prec.lifetime < e.taux * 60, `de retour en ligne, heure remise : le jeu ne recule pas (${fmtH(e.now - vrai())} d’avance, à rendre), rien de plus`); prec = e; }
  // le vrai temps rattrape : l'avance prise est déduite de la vraie absence suivante
  const avance = prec.now - vrai();
  decalServeur += 3 * HEURE; await charger();
  { const e = await etat(); check(!e.retour, `3 h de vraie absence ensuite ne rapportent rien : l’avance de ${fmtH(avance)} est rendue`); prec = e; }
  decalServeur += 8 * HEURE; await charger();
  { const e = await etat(); const attendu = Math.min(absMax, 11 * HEURE - avance); check(e.retour && Math.abs(e.lifetime - prec.lifetime - e.taux * attendu / 1000) < e.taux * attendu / 1000 * 0.25 + e.taux * 120, `puis 8 h de plus : l’absence repart (${e.retourTxt})`); await fermerFeuille(); }
  check(versSupabase.length === 0, 'sans avoir rejoint le classement, rien ne part vers Supabase (l’heure sûre vient de la page)');
  check(!errors.length, 'aucune erreur dans la page' + (errors.length ? ' : ' + errors[0] : ''));
  await context.close();

  // ─── un samedi à 360×640 : le badge « Marché ×1,5 » ne repousse plus la boutique ───
  decalServeur = new Date('2026-10-10T10:00:00+02:00').getTime() - Date.now();
  const c2 = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await c2.addInitScript(fauxTelephone, decalServeur);
  const p2 = await c2.newPage(); await p2.goto(URL_JEU); await p2.waitForFunction(() => window.__fournil && window.__fournil.st); await sleep(700);
  const vus = []; for (let k = 0; k < 10; k++) { vus.push(await p2.evaluate(() => ({ h: document.querySelector('#haut').getBoundingClientRect().height, txt: document.querySelector('#taux').innerText }))); if (/Marché/.test(vus[k].txt) && !vus.some((v, j) => j < k && /Marché/.test(v.txt))) await p2.screenshot({ path: out + '/triche-samedi-360.png' }); await sleep(500); }
  const samedi = await p2.evaluate(() => ({ marche: window.__fournil.G.jourDeMarche(window.__fournil.st.now), badge: /Marché ×1,5/.test(document.querySelector('#taux').textContent) }));
  check(samedi.marche && samedi.badge && vus.some((v) => /Marché/.test(v.txt)) && vus.some((v) => /baguette|seconde/.test(v.txt)) && vus.every((v) => Math.abs(v.h - vus[0].h) < 0.5), `samedi : le badge « Marché ×1,5 » et le rythme se relaient sur une seule ligne (en-tête de ${Math.round(vus[0].h)} px, constant)`);
  const petit = await p2.evaluate(() => { const t = document.querySelector('#tiroir'), tr = t.getBoundingClientRect(), o = document.querySelector('#onglets').getBoundingClientRect(), c = document.querySelector('.carte[data-i="0"]').getBoundingClientRect(), s = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones(); return { pos: t.dataset.pos, carte: c.top >= tr.top + 36 && c.bottom <= o.top, file: z.mystere.y + z.mystere.h <= tr.top - s.top + 1, haut: Math.round(tr.top - s.top), large: document.documentElement.scrollWidth <= innerWidth + 1 }; });
  check(petit.pos === 'mi' && petit.carte && petit.file && petit.large, `samedi à 360×640, tiroir à mi (${petit.haut} px de scène) : première carte entière, file et client mystère visibles (le test de test/play.cjs)`);
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
