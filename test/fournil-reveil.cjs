// Les gains hors ligne quand l'app n'est pas fermée (iPhone verrouillé, app installée laissée ouverte) : la page dort, performance.now()
// s'arrête, et iOS ne prévient pas toujours (pas de visibilitychange). Ici, le sommeil est simulé : l'heure du téléphone ET celle du serveur
// avancent, performance.now() non, sans aucun événement. Le détecteur de réveil doit payer l'absence (feuille « Pendant ton absence »),
// la Planque ouverte doit payer ses apprentis ; avancer seulement l'heure du téléphone ne rapporte rien ; un même sommeil n'est payé qu'une fois.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-reveil.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_REVEIL || 8869;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const H = 3600e3, DEPART = new Date('2026-10-14T10:00:00+02:00').getTime(); // le 2e jour du Quartier (la Planque est ouverte)
let decalServeur = DEPART - Date.now();
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(Date.now() + decalServeur).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 10000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  // l'heure du téléphone : décalée, et avançable d'un coup (le sommeil) sans que performance.now() bouge
  await ctx.addInitScript((d0) => { let d = d0; const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; window.__avancerTel = (ms) => { d += ms; };
    // le gel (iPhone, app laissée en arrière-plan sans verrouiller) : performance.now() avance aussi, avec les images
    let dp = 0; const pn = performance.now.bind(performance), raf = window.requestAnimationFrame.bind(window); performance.now = () => pn() + dp; window.requestAnimationFrame = (cb) => raf((t) => cb(t + dp)); window.__geler = (ms) => { d += ms; dp += ms; }; window.__sansQuartier = false; }, decalServeur);
  await ctx.route(/supabase\.co/, (r) => r.abort());
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(1500);
  const fermerFeuille = () => page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); });
  await fermerFeuille();
  // une boulangerie qui tourne toute seule : des produits ouverts et des apprentis
  await page.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e9); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); st.tuto = 99; f.save(); });
  await sleep(1500); await fermerFeuille();
  const argent = () => page.evaluate(() => window.__fournil.st.coins);
  const feuille = () => page.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const sommeil = async (ms, serveurAussi = true) => { if (serveurAussi) decalServeur += ms; await page.evaluate((x) => window.__avancerTel(x), ms); };

  console.log('── la page dort 2 h (téléphone et serveur avancent, performance.now() non, aucun événement) ──');
  let a0 = await argent();
  await sommeil(2 * H);
  check(await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'reveil')), 'le détecteur de réveil voit le sommeil et lance le retour');
  check(await attendre(async () => /absence/i.test(await feuille())), `la feuille « Pendant ton absence » s'ouvre (${(await feuille()).replace(/\s+/g, ' ').slice(0, 70)})`);
  let a1 = await argent();
  check(a1 > a0 * 1.0 && a1 - a0 > 0, `l'absence est payée : +${Math.round(a1 - a0)} €`);
  const paye2h = a1 - a0;
  await fermerFeuille(); await sleep(2500);
  const a2 = await argent();
  check(a2 - a1 < paye2h * 0.2, 'et une seule fois (rien de plus dans les secondes qui suivent)');

  console.log('── triche : seule l\'heure du téléphone avance de 3 h ──');
  await page.evaluate(() => { window.__fournil.st.lastSeen = window.__fournil.st.lastSeen; }); const t0 = await argent();
  await sommeil(3 * H, false);
  await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours), 6000); await sleep(3000);
  const t1 = await argent();
  check(t1 - t0 < paye2h * 0.2, `le serveur n'a pas bougé : rien de payé pour ces 3 h (+${Math.round(t1 - t0)} €, contre ${Math.round(paye2h)} € pour 2 h de vrai sommeil)`);
  await fermerFeuille();
  // (le téléphone reste 3 h en avance : le jeu suit l'heure du serveur)
  await sleep(1500); await fermerFeuille();

  console.log('── un sommeil d\'1 h avec un visibilitychange en même temps : payé une fois ──');
  const v0 = await argent();
  await sommeil(1 * H);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await attendre(async () => /absence/i.test(await feuille())); await sleep(3000);
  const v1 = await argent();
  check(v1 - v0 > 0 && v1 - v0 < paye2h * 0.75, `1 h payée une fois (+${Math.round(v1 - v0)} €, environ la moitié des 2 h)`);
  await fermerFeuille();

  console.log('── une nuit de 12 h : plafonnée comme une vraie absence ──');
  const plafondH = await page.evaluate(() => window.__fournil.G.heuresAbsence(window.__fournil.st)); const n0 = await argent();
  await sommeil(12 * H);
  await attendre(async () => /absence/i.test(await feuille())); await sleep(1500);
  const n1 = await argent(), txt = (await feuille()).replace(/\s+/g, ' ');
  check(n1 - n0 > paye2h * 1.5 && n1 - n0 < paye2h * (plafondH / 2) * 1.15, `payée jusqu'au plafond de ${plafondH} h (+${Math.round(n1 - n0)} € ; feuille : ${txt.slice(0, 50)})`);
  await fermerFeuille();

  console.log('── une courte veille de 30 s : payée sans feuille ──');
  const c0 = await argent();
  await sommeil(30e3);
  await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'reveil' && !window.__fournil.retour.enCours)); await sleep(1500);
  const c1 = await argent();
  check(c1 > c0 && !/Pendant ton absence/.test(await feuille()), `+${Math.round(c1 - c0)} €, sans feuille (moins de 90 s)`);

  console.log('── la Planque ouverte pendant le sommeil ──');
  await page.evaluate(() => window.__fournil.quartier()); await sleep(500);
  await page.evaluate(() => { const b = document.querySelector('#pq-corps [data-pq="oui"]'); if (b) b.click(); }); await sleep(500);
  await page.evaluate(() => { const q = window.__fournil.st.quartier; q.billets = 5e4; }); await sleep(200);
  await page.evaluate(() => { const b = document.querySelector('#pq-cartes [data-a="embaucher"]'); if (b) b.click(); }); await sleep(1500);
  const b0 = await page.evaluate(() => window.__fournil.st.quartier.billets);
  await sommeil(1 * H);
  await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'reveil' && !window.__fournil.retour.enCours)); await sleep(1500);
  const b1 = await page.evaluate(() => window.__fournil.st.quartier.billets);
  check(b1 > b0, `l'apprenti de la Planque a travaillé pendant le sommeil : +${Math.round(b1 - b0)} billets`);
  await page.evaluate(() => { const b = document.querySelector('#pq-fermer, [data-pq="fermer"], #pq [data-a="fermer"]'); if (b) b.click(); }); await sleep(800); await fermerFeuille();

  console.log('── le jeu gelé 2 h (performance.now() avance aussi, aucun événement : l\'app laissée en arrière-plan, téléphone éveillé) ──');
  const g0 = await argent();
  decalServeur += 2 * H; await page.evaluate((x) => window.__geler(x), 2 * H);
  check(await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'gel')), 'le détecteur voit le gel et lance le retour');
  check(await attendre(async () => /absence/i.test(await feuille())), `la feuille « Pendant ton absence » s'ouvre (${(await feuille()).replace(/\s+/g, ' ').slice(0, 60)})`);
  await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours)); const g1 = await argent();
  check(g1 - g0 > paye2h * 0.6, `les 2 h sont payées : +${Math.round(g1 - g0)} € (contre ${Math.round(paye2h)} € au réveil)`);
  await fermerFeuille(); await sleep(2500);
  check((await argent()) - g1 < paye2h * 0.2, 'une seule fois');

  console.log('── le filet : un gel que le détecteur a manqué (la page se disait « cachée » au dégel) ──');
  const f0 = await argent();
  await page.evaluate((h) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); window.__geler(2 * h); }, H);
  decalServeur += 2 * H;
  check(await attendre(() => page.evaluate(() => window.__fournil.retour.dernier === 'saut')), 'la boucle ne tique pas par-dessus le trou : elle lance le retour');
  await page.evaluate(() => { delete document.visibilityState; });
  check(await attendre(async () => /absence/i.test(await feuille())), 'la feuille « Pendant ton absence » s\'ouvre');
  await attendre(() => page.evaluate(() => !window.__fournil.retour.enCours)); const f1 = await argent();
  check(f1 - f0 > paye2h * 0.6, `les 2 h sont payées : +${Math.round(f1 - f0)} €`);
  await fermerFeuille();

  console.log('── le journal des retours ──');
  const jr = await page.evaluate(() => window.__fournil.st.journalRetours || []);
  const raisons = jr.map((e) => e.r).join(',');
  check(jr.length >= 6 && jr.length <= 10, `${jr.length} retours notés (10 au plus) : ${raisons}`);
  check(['reveil', 'gel', 'saut'].every((r) => raisons.includes(r)), 'le réveil, le gel et le saut y sont');
  const dernierJ = jr[jr.length - 1];
  check(dernierJ && dernierJ.r === 'saut' && dernierJ.n === 'feuille' && dernierJ.s > 7000 && dernierJ.g > 0, `le dernier : ${JSON.stringify(dernierJ)}`);
  check(jr.some((e) => e.n === 'court'), 'la veille de 30 s y est, « moins de 90 s »');
  await page.evaluate(() => window.__fournil.page('reglages')); await sleep(600);
  check(await page.evaluate(() => !!document.querySelector('[data-a="journal-retours"]')), 'Réglages › « Journal des retours »');
  await page.evaluate(() => document.querySelector('[data-a="journal-retours"]').click()); await sleep(600);
  const txtJ = (await feuille()).replace(/\s+/g, ' ');
  check(/Journal des retours/.test(txtJ) && /Le jeu reprend après une pause/.test(txtJ) && /moins de 90 s/.test(txtJ), `la feuille du journal (${txtJ.slice(0, 120)})`);
  await page.screenshot({ path: path.join(process.env.CAPTURES_REVEIL || require('os').tmpdir(), 'journal-retours.png') });
  await fermerFeuille();
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (réveil).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
