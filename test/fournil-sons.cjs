// Les sons et les confettis du Fournil (src/sons.js, fournil/sons/*.mp3 de Kenney, ZzFX ; vendor/confetti.min.js) sur la vraie page :
// les huit bruitages se chargent et se décodent après le premier geste, chaque son joue un vrai bruitage, « Sons » coupé = silence,
// un fichier manquant = le bip d'avant ; des confettis sur une réussite, aucun si l'on préfère moins de mouvement ; aucune erreur.
// Puis la Maison hantée (le 28 octobre 2026, fausse heure) : ses treize mp3 (fournil/sons/hantee/, mono 64 kbit/s, avec leurs licences) ne
// se chargent qu'à la première ouverture de l'écran, tous décodés ; le jingle, la musique en boucle (la boucle de 38,4 s, au sample près) et
// le chaudron tout bas ; ses bruitages à la place de ceux de la boulangerie (la vente, le palier) ; un client qui entre sonne à la porte ;
// l'interrupteur « Musique » des Réglages (activé par défaut), « Sons » qui coupe tout ; la musique s'arrête quand on quitte l'écran et
// repart à la réouverture ; la page cachée la coupe aussi. Les crédits d'Halloween dans Réglages › Crédits.
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-sons.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_SONS || 8868;
let decalServeur = 0; // la Maison hantée : le serveur donne la fausse heure dans son en-tête Date (l'horloge de confiance du jeu la prend)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  if (decalServeur) res.setHeader('Date', new Date(Date.now() + decalServeur).toUTCString());
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
  check(await attendre(() => page.evaluate((a) => document.querySelectorAll('canvas').length === a, avant), 20000), '… et s’en va une fois retombés'); // 160 images : près de 10 s sur un navigateur de test lent (17 images/s)
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

  console.log('── la Maison hantée : ses sons, sa musique ──');
  const H = path.join(root, 'fournil', 'sons', 'hantee'), HANTEE = ['sonnette', 'grince', 'vente', 'cloche', 'sorciere', 'fantome', 'chaudron', 'louche', 'plancher', 'corbeau', 'chat', 'jingle', 'musique'];
  const infos = HANTEE.map((n) => mp3Info(path.join(H, n + '.mp3')));
  check(infos.every(Boolean) && fs.existsSync(path.join(H, 'LICENCES.txt')), `les treize fichiers fournil/sons/hantee/*.mp3 sont là, avec leurs crédits (LICENCES.txt)`);
  check(infos.every((i) => i && i.mono && i.kbps === 64 && i.hz === 44100), `tous en mp3 mono 64 kbit/s, 44,1 kHz (${infos.filter((i) => !(i && i.mono && i.kbps === 64)).length} à reprendre)`);
  const poids = HANTEE.reduce((a, n) => a + fs.statSync(path.join(H, n + '.mp3')).size, 0);
  check(poids < 600 * 1024, `leur poids : ${(poids / 1024).toFixed(0)} Ko (musique ${(fs.statSync(path.join(H, 'musique.mp3')).size / 1024).toFixed(0)} Ko), sous les 600 Ko`);
  const lic = fs.readFileSync(path.join(H, 'LICENCES.txt'), 'utf8');
  check(['Tsorthan Grove', 'qubodup', 'w.forster.1', 'PWL', 'AntumDeluge', 'Ogrebane', 'BMacZero', 'zeroisnotnull', 'Kerzoven', 'Kenney', 'CC0'].every((x) => lic.includes(x)), 'LICENCES.txt nomme chaque auteur et la licence (CC0)');
  const DEPART = new Date('2026-10-28T19:00:00+01:00').getTime(), decal = DEPART - Date.now(); decalServeur = decal;
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript((dd) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + dd); } static now() { return D.now() + dd; } } window.Date = F; }, decal);
  await ctx.route(/supabase\.co/, (r) => r.abort());
  const demandesHt = []; ctx.on('request', (r) => { if (/sons\/hantee\//.test(r.url())) demandesHt.push(r.url()); });
  page = await ctx.newPage(); erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=eco`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(800);
  const evp = (fn, a) => page.evaluate(fn, a);
  const fermerF = () => evp(() => { const b = document.querySelector('#feuille [data-a="pq-tard"], #feuille [data-a="close"], #feuille [data-a="pq-ok"]'); if (b) b.click(); });
  await evp(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 1e6; q.postes[0].niv = 10; F.save(); });
  await fermerF(); await sleep(300); await fermerF();
  await evp(() => window.__fournil.audio()); await sleep(800);
  check(await evp(() => window.__fournil.st.musique !== false), '« Musique » est activée par défaut');
  check(demandesHt.length === 0, `avant l'écran de l'événement, aucun son d'Halloween n'est demandé (${demandesHt.length})`);
  await evp(() => document.querySelector('#b-hantee').click());
  check(await attendre(() => evp(() => SONS.pretsJeu('hantee').length === SONS.JEUX.hantee.fichiers.length)), 'à la première ouverture, les treize sons se chargent et se décodent');
  check(await evp(() => SONS.jeuActif === 'hantee'), 'le jeu de sons « hantee » est actif sur l’écran de la Maison hantée');
  check(await attendre(() => evp(() => !!SONS.musique && !!SONS.fond), 5000), 'la musique tourne, et le chaudron bouillonne tout bas');
  const m = await evp(() => SONS.musique);
  check(m && Math.abs(m.fin - m.debut - 38.4) < 0.001 && m.debut >= 0 && m.fin <= m.duree + 1e-6, `la boucle de la musique : ${m ? `${m.debut.toFixed(4)} → ${m.fin.toFixed(4)} s sur ${m.duree.toFixed(3)} s décodées` : 'absente'} (38,4 s au raccord)`);
  check(await evp(() => SONS.derniers.includes('hantee/jingle')), 'le jingle a ouvert l’écran');
  await fermerF();
  let jh = await evp(() => { window.__fournil.son.vente(5000); window.__fournil.son.deblocage(); return SONS.derniers.slice(-4); });
  check(jh.includes('hantee/vente') && jh.includes('hantee/cloche') && !jh.includes('piece') && !jh.includes('fanfare'), `pendant l'événement, la vente et le palier ont leurs bruitages d'Halloween (${jh.join(', ')})`);
  jh = await evp(() => { const r = SONS.entre('sorciere'); return { r, d: SONS.derniers.slice(-3) }; });
  check(jh.r && jh.d.includes('hantee/sonnette') && jh.d.includes('hantee/sorciere'), `une cliente sorcière entre : la porte sonne, elle ricane (${jh.d.join(', ')})`);
  // l'interrupteur « Musique » (Réglages), puis « Sons » qui coupe tout
  await evp(() => window.__fournil.page('reglages')); await sleep(300);
  check(await evp(() => !!document.querySelector('[data-a="musique"] [role="switch"][aria-checked="true"]')), 'Réglages : la ligne « Musique », allumée');
  await evp(() => document.querySelector('[data-a="musique"]').click()); await sleep(600);
  check(await evp(() => window.__fournil.st.musique === false && !SONS.musique && !!SONS.fond), '« Musique » coupée : la musique s’arrête, le chaudron reste');
  await evp(() => document.querySelector('[data-a="musique"]').click()); await sleep(300);
  check(await evp(() => window.__fournil.st.musique === true && !!SONS.musique), '« Musique » rallumée : elle repart');
  await evp(() => document.querySelector('[data-a="son"]').click()); await sleep(300);
  check(await evp(() => !window.__fournil.st.son && !SONS.musique && !SONS.fond), '« Sons » coupé : plus de musique ni de chaudron');
  check(await evp(() => !!document.querySelector('[data-a="musique"] [role="switch"][aria-checked="false"]')), '… et la ligne « Musique » s’éteint avec');
  jh = await evp(() => { const n = SONS.derniers.length; window.__fournil.son.vente(10); SONS.entre('fantome'); return SONS.derniers.length - n; });
  check(jh === 0, '« Sons » coupé : aucun bruitage de la Maison hantée');
  await evp(() => document.querySelector('[data-a="son"]').click()); await sleep(300);
  check(await evp(() => window.__fournil.st.son && !!SONS.musique), '« Sons » rallumé : la musique revient');
  // la page cachée, puis revenue
  await evp(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  check(await evp(() => !SONS.musique), 'la page cachée : la musique s’arrête');
  await evp(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  check(await evp(() => !!SONS.musique), 'la page revenue : elle repart');
  // quitter l'écran, revenir
  await evp(() => document.querySelector('#hantee [data-pq="fermer"]').click()); await sleep(300);
  check(await evp(() => SONS.jeuActif === null && !SONS.musique && !SONS.fond), 'l’écran fermé : la musique et le chaudron s’arrêtent, le jeu de sons aussi');
  jh = await evp(() => { window.__fournil.son.vente(5000); return SONS.derniers.slice(-1)[0]; });
  check(jh === 'piece', `dans la boulangerie, la vente retrouve sa pièce (${jh})`);
  const n0 = demandesHt.length;
  await evp(() => document.querySelector('#b-hantee').click()); await sleep(400);
  check(await evp(() => SONS.jeuActif === 'hantee' && !!SONS.musique && SONS.derniers.includes('hantee/jingle')), 'rouvert : le jingle et la musique, tout de suite');
  check(demandesHt.length === n0, 'sans rien recharger');
  await evp(() => document.querySelector('#hantee [data-pq="fermer"]').click()); await sleep(300);
  // les crédits
  await evp(() => document.querySelector('[data-a="credits"]').click()); await sleep(300);
  const cr = await evp(() => document.querySelector('#feuille-contenu').innerText);
  check(['Kay Lousberg', 'Asset Quest', 'Kenney', 'Tsorthan Grove', 'Poly Haven', 'ambientCG', 'qubodup', 'Kerzoven'].every((x) => cr.includes(x)), 'Réglages › Crédits : les auteurs des modèles, des sons et de la musique d’Halloween');
  check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
  await ctx.close();

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe (sons).'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
// l'en-tête de la première trame d'un mp3 (après un éventuel ID3v2) : débit, fréquence, mono
function mp3Info(f) {
  let b; try { b = fs.readFileSync(f); } catch (e) { return null; }
  let i = 0; if (b.slice(0, 3).toString() === 'ID3') i = 10 + ((b[6] & 127) << 21 | (b[7] & 127) << 14 | (b[8] & 127) << 7 | (b[9] & 127));
  for (; i < b.length - 4; i++) if (b[i] === 0xFF && (b[i + 1] & 0xE0) === 0xE0) break;
  const v = (b[i + 1] >> 3) & 3, couche = (b[i + 1] >> 1) & 3; if (v !== 3 || couche !== 1) return null; // MPEG-1, couche III
  const kbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][b[i + 2] >> 4], hz = [44100, 48000, 32000][(b[i + 2] >> 2) & 3];
  return { kbps, hz, mono: (b[i + 3] >> 6) === 3 };
}
function SONS_OK(fs) { const d = path.join(root, 'fournil', 'sons'); return ['clic', 'piece', 'pose', 'pose2', 'fanfare', 'carte', 'pop', 'refus'].every((n) => fs.existsSync(path.join(d, n + '.mp3'))) && fs.existsSync(path.join(d, 'LICENCE-kenney.txt')); }
