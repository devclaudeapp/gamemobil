// Les sons et les confettis du Fournil (src/sons.js, fournil/sons/*.mp3 de Kenney, ZzFX ; vendor/confetti.min.js) sur la vraie page :
// les huit bruitages se chargent et se décodent après le premier geste, chaque son joue un vrai bruitage, « Sons » coupé = silence,
// un fichier manquant = le bip d'avant ; des confettis sur une réussite, aucun si l'on préfère moins de mouvement ; aucune erreur.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-sons.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_SONS || 8868;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 15000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  async function ouvrir(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', reducedMotion: opts.reduit ? 'reduce' : 'no-preference' });
    await ctx.addInitScript(() => { window.__sansQuartier = true; });
    await ctx.route(/supabase\.co/, (r) => r.abort());
    if (opts.manque) await ctx.route(new RegExp(`sons/${opts.manque}\\.mp3`), (r) => r.fulfill({ status: 404, body: '' }));
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(600);
    await page.evaluate(() => { const b = document.querySelector('#feuille [data-a="close"]'); if (b) b.click(); window.__fournil.audio(); });
    // un espion : combien de vrais bruitages (SONS.jouer / SONS.zz qui réussissent)
    await page.evaluate(() => { window.__joues = []; for (const f of ['jouer', 'zz']) { const o = SONS[f]; SONS[f] = (n, x) => { const r = o(n, x); if (r) window.__joues.push(n); return r; }; } });
    return { ctx, page, erreurs };
  }

  console.log('── les bruitages ──');
  let { ctx, page, erreurs } = await ouvrir();
  check(SONS_OK(fs), 'les huit fichiers fournil/sons/*.mp3 sont là (et leur licence)');
  check(await attendre(() => page.evaluate(() => SONS.prets.length === SONS.FICHIERS.length)), 'après le premier geste, les huit bruitages sont chargés et décodés');
  const attendus = { tap: 'clic', vente: 'piece', achat: 'pose', deblocage: 'fanfare', embauche: 'pose2', pourboire: 'piece', carte: 'carte', non: 'refus', evenement: 'alerte', sirene: 'sirene' };
  for (const [s, n] of Object.entries(attendus)) {
    const j = await page.evaluate((x) => { window.__joues = []; window.__fournil.son[x](x === 'vente' ? 1234 : undefined); return window.__joues; }, s);
    check(j.includes(n), `son.${s}() : un vrai bruitage (« ${n} »${j.length > 1 ? `, ${j.length} couches` : ''})`);
  }
  await page.evaluate(() => { window.__fournil.st.son = false; window.__joues = []; window.__fournil.son.vente(50); window.__fournil.son.deblocage(); window.__fournil.st.son = true; });
  check(await page.evaluate(() => window.__joues.length === 0), '« Sons » coupé dans les Réglages : silence');

  console.log('── les confettis ──');
  const avant = await page.evaluate(() => document.querySelectorAll('canvas').length);
  check(await page.evaluate(() => window.__fournil.confettis(1)) === true, 'une réussite lance des confettis');
  await sleep(300); const pendant = await page.evaluate(() => document.querySelectorAll('canvas').length);
  check(pendant === avant + 1, 'leur toile s’ajoute par-dessus le jeu…');
  check(await attendre(() => page.evaluate((a) => document.querySelectorAll('canvas').length === a, avant), 8000), '… et s’en va une fois retombés');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  console.log('── un fichier manquant, moins de mouvement ──');
  ({ ctx, page, erreurs } = await ouvrir({ manque: 'piece', reduit: true }));
  await attendre(() => page.evaluate(() => SONS.prets.length === SONS.FICHIERS.length - 1));
  const j = await page.evaluate(() => { window.__joues = []; window.__fournil.son.vente(100); window.__fournil.son.tap(); return window.__joues; });
  check(!j.includes('piece') && j.includes('clic'), 'la pièce manque : la vente garde son bip, le reste joue ses bruitages');
  const c0 = await page.evaluate(() => document.querySelectorAll('canvas').length); await page.evaluate(() => window.__fournil.confettis(1)); await sleep(300);
  check(await page.evaluate((a) => document.querySelectorAll('canvas').length === a, c0), 'moins de mouvement demandé (réglage du téléphone) : pas de confettis');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (sons).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
function SONS_OK(fs) { const d = path.join(root, 'fournil', 'sons'); return ['clic', 'piece', 'pose', 'pose2', 'fanfare', 'carte', 'pop', 'refus'].every((n) => fs.existsSync(path.join(d, n + '.mp3'))) && fs.existsSync(path.join(d, 'LICENCE-kenney.txt')); }
