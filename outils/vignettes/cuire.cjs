// Les vignettes du carnet « Mes décos » (Ma chaîne), de l'étagère des trophées et du carnet du croupier : chaque objet du jeu qui a un objet 3D,
// bâti seul avec le vrai code du jeu (outils/vignettes/page.html : src/*.js, le lot HD « equipe » pour la garde-robe), photographié dans le
// studio commun (outils/vignettes/studio.js : la même caméra de trois quarts, la même lumière, l'ombre de contact, fond transparent), rendu en
// 512 × 512, réduit à 256 × 256 et écrit en webp dans fournil/img/carnet/<famille>/<id>.webp. Puis src/vignettes.js (la table du jeu : chaque
// vignette et l'empreinte de son fichier), et une planche de contrôle (toutes les vignettes par famille, en grand, à 64 px et à 44 px).
// usage : NODE_PATH=…/node_modules node outils/vignettes/cuire.cjs [--port 9711] [--seulement "quartier/neon,compagnons/*"] [--brut dossier]
//         [--planche fichier.png] [--qualite 50] [--alpha 65] [--sans-planche]
// Il faut Playwright et son Chromium, et sharp (NODE_PATH, ou --modules dossier/node_modules) : voir outils/vignettes/README.md.
// Relançable : la même entrée donne les mêmes fichiers, octet pour octet (le rendu logiciel SwiftShader, aucun hasard, aucune horloge).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; }, opt = (k) => args.includes(k);
if (val('--modules')) module.paths.unshift(path.resolve(val('--modules')));
const { chromium } = require('playwright');
let sharp; try { sharp = require('sharp'); } catch (e) { console.error('sharp introuvable : npm install --prefix <dossier> sharp@0.33.5, puis NODE_PATH=<dossier>/node_modules (voir outils/vignettes/README.md)'); process.exit(2); }
const ROOT = path.resolve(__dirname, '../..'), PORT = +val('--port', 9711);
const SORTIE = path.join(ROOT, 'fournil', 'img', 'carnet'), TABLE = path.join(ROOT, 'src', 'vignettes.js');
const BRUT = path.resolve(val('--brut', path.join(os.tmpdir(), 'vignettes-brut'))); fs.mkdirSync(BRUT, { recursive: true });
const PLANCHE = path.resolve(val('--planche', path.join(BRUT, 'planche.png')));
// le côté final ; la qualité webp, réglée pour la lisibilité à 44 et 64 px (voir le README). Le budget de 1,5 Mo (test/fournil-vignettes.test.js)
// devant les objets de Noël (docs/noel-contrat.md § 9.3, choix du joueur du 9 novembre) : TOUT le carnet recuit à la qualité 50, l'alpha à 65
// (≈ 5,4 Ko la vignette au lieu de 8,2 en 70/80 ; sans différence visible à 44 et 64 px, vérifié sur la planche), les nouvelles pareil.
// (Avant : 70/80, et 55/72 pour celles du Marché d'automne et de sa saison.) --qualite q [--alpha a] force d'autres réglages pour toutes
const COTE = 256, QUALITE = +val('--qualite', 50), QUALITE_ALPHA = +val('--alpha', 65);
const qualiteDe = () => QUALITE, alphaDe = () => QUALITE_ALPHA;
const PLAFOND = 12 * 1024; // (12 Ko par vignette au plus : au-delà, l'alpha descend d'un cran à la fois, puis la qualité, jusqu'au premier réglage qui tient)
const encoder = (png, q, a) => sharp(png).resize(COTE, COTE, { kernel: 'lanczos3' }).webp({ quality: q, alphaQuality: a, effort: 6, smartSubsample: true }).toBuffer();
const filtre = val('--seulement') ? val('--seulement').split(',').map((s) => s.trim()).filter(Boolean) : null;
const pris = (fam, id) => !filtre || filtre.some((f) => { const [a, b] = f.split('/'); return a === fam && (!b || b === '*' || b === id); });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
// la page du studio est servie dans fournil/ : les chemins relatifs du jeu (hd/, ../vendor/, ../src/) y marchent comme dans fournil/index.html
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/fournil/__vignettes.html') p = '/outils/vignettes/page.html';
  fs.readFile(path.join(ROOT, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));
const empreinte = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Europe/Paris' })).newPage();
  page.setDefaultTimeout(600000);
  const erreurs = []; page.on('pageerror', (e) => erreurs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') { const t = m.text(); if (!/THREE\.WebGLProgram|Three\.js|deprecated|GPU stall|GL Driver Message/i.test(t)) erreurs.push(m.type() + ' ' + t); } });
  await page.goto(`http://localhost:${PORT}/fournil/__vignettes.html`);
  await page.waitForFunction(() => typeof VIG !== 'undefined' && typeof STUDIO !== 'undefined', null, { timeout: 60000 });
  const { liste, sans } = await page.evaluate(() => VIG.liste());
  const choisis = liste.filter((x) => pris(x.famille, x.id));
  console.log(`${liste.length} vignettes au catalogue, ${choisis.length} à cuire ; ${sans.length} objets gardent leur icône`);
  // la garde-robe : l'équipe 3D d'abord (le lot HD « equipe », les corps, les kits)
  if (choisis.some((x) => x.famille === 'tenues')) {
    let e = ''; for (let k = 0; k < 600; k++) { e = await page.evaluate(() => VIG.preparerEquipe()); if (e === 'prete' || /^erreur|absente/.test(e)) break; await dodo(100); }
    if (e !== 'prete') throw new Error('équipe 3D : ' + e);
  }
  const mesures = [];
  for (const x of choisis) {
    const r = await page.evaluate(([f, id]) => { try { return VIG.rendre(f, id); } catch (e) { return { erreur: String(e && e.stack || e) }; } }, [x.famille, x.id]);
    if (r.erreur) { console.log('ÉCHEC', x.famille, x.id, r.erreur.split('\n').slice(0, 3).join(' | ')); erreurs.push(`${x.famille}/${x.id} : ${r.erreur.split('\n')[0]}`); continue; }
    const png = Buffer.from(r.png.split(',')[1], 'base64'), dir = path.join(SORTIE, x.famille); fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(BRUT, x.famille), { recursive: true });
    fs.writeFileSync(path.join(BRUT, x.famille, x.id + '.png'), png);
    // (une lueur, une toile fine : c'est l'alpha qui pèse ; quelques crans de moins ne se voient pas, même à 256 px)
    const q0 = qualiteDe(x.famille, x.id), a0 = alphaDe(x.famille, x.id); let q = q0, a = a0, webp = await encoder(png, q, a);
    while (webp.length > PLAFOND && (a > 50 || q > 40)) { if (a > 50) a--; else q--; webp = await encoder(png, q, a); }
    if (webp.length > PLAFOND) erreurs.push(`${x.famille}/${x.id} : ${webp.length} octets, plus de 12 Ko même à la qualité ${q}, alpha ${a}`);
    fs.writeFileSync(path.join(dir, x.id + '.webp'), webp);
    mesures.push({ famille: x.famille, id: x.id, octets: webp.length, qualite: q, alpha: a, cadre: r.cadre });
    process.stdout.write(`${x.famille}/${x.id} ${(webp.length / 1024).toFixed(1)} Ko${q !== q0 || a !== a0 ? ` (qualité ${q}, alpha ${a})` : ''} · `);
  }
  console.log('');
  // les fichiers qui ne sont plus au catalogue (un objet retiré du jeu) : effacés, au tour complet seulement
  const attendus = new Set(liste.map((x) => `${x.famille}/${x.id}.webp`));
  if (!filtre && fs.existsSync(SORTIE)) for (const f of fs.readdirSync(SORTIE)) for (const g of fs.readdirSync(path.join(SORTIE, f))) if (!attendus.has(`${f}/${g}`)) { fs.rmSync(path.join(SORTIE, f, g)); console.log('effacée (plus au catalogue) :', `${f}/${g}`); }
  // la table du jeu : ce qui est sur le disque (un tour partiel garde les autres), dans l'ordre du catalogue, chaque fichier et son empreinte
  const table = {}; let total = 0, n = 0;
  for (const x of liste) { const f = path.join(SORTIE, x.famille, x.id + '.webp'); if (!fs.existsSync(f)) continue; const b = fs.readFileSync(f); (table[x.famille] = table[x.famille] || {})[x.id] = empreinte(b); total += b.length; n++; }
  fs.writeFileSync(TABLE, tableJs(table));
  console.log(`src/vignettes.js : ${n} vignettes, ${(total / 1024).toFixed(0)} Ko en tout, ${(total / 1024 / Math.max(1, n)).toFixed(1)} Ko en moyenne`);
  for (const fam of Object.keys(table)) { const l = Object.keys(table[fam]).map((id) => fs.statSync(path.join(SORTIE, fam, id + '.webp')).size); console.log(`  ${fam} : ${l.length} · ${(l.reduce((a, b) => a + b, 0) / 1024).toFixed(0)} Ko`); }
  fs.writeFileSync(path.join(BRUT, 'mesures.json'), JSON.stringify({ mesures, sans }, null, 1));
  // la planche : toutes les vignettes du disque, par famille (la vignette sur un damier, puis à 64 px et à 44 px sur le blanc du carnet)
  if (!opt('--sans-planche')) {
    const fams = Object.keys(table).map((f) => ({ id: f, items: Object.keys(table[f]).map((id) => ({ id, src: 'data:image/webp;base64,' + fs.readFileSync(path.join(SORTIE, f, id + '.webp')).toString('base64') })) }));
    const png = await page.evaluate((fams) => VIG.planche(fams), fams);
    fs.mkdirSync(path.dirname(PLANCHE), { recursive: true }); fs.writeFileSync(PLANCHE, Buffer.from(png.split(',')[1], 'base64')); console.log('planche :', PLANCHE);
  }
  await browser.close(); server.close();
  if (erreurs.length) { console.log('ERREURS', erreurs.length, '\n  ' + erreurs.slice(0, 12).join('\n  ')); process.exit(1); }
  console.log('ERREURS aucune');
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });

// src/vignettes.js : la table (générée) et les quelques lignes qui en font une image
function tableJs(table) {
  const lignes = Object.entries(table).map(([f, l]) => `    '${f}': { ${Object.entries(l).map(([id, h]) => `'${id}': '${h}'`).join(', ')} },`).join('\n');
  return `/* LE FOURNIL — les vignettes du carnet « Mes décos », de l'étagère des trophées et du carnet du croupier (global VIGNETTES).
   GÉNÉRÉ par outils/vignettes/cuire.cjs : ne pas éditer à la main (relancer l'outil : voir outils/vignettes/README.md).
   Chaque objet du carnet qui a un objet 3D a sa vignette : fournil/img/carnet/<famille>/<id>.webp (256 × 256, fond transparent), rendue
   dans le même studio que toutes les autres. La table : famille → id → l'empreinte du fichier (dans l'adresse : une vignette refaite change
   d'adresse, et le service worker ne garde que la dernière, fournil/sw.js). src(famille, id) : son adresse, ou '' (pas de vignette : l'icône
   dessinée). Sans les fichiers (l'artefact Claude : pas de window.FOURNIL_VERSION, que seule la page du jeu porte), aucune adresse : les
   icônes restent.
   img(famille, id, gagne, repli) : le HTML d'une vignette (grisée si pas gagnée) ; sans vignette, le repli tel quel. Le repli (le HTML
   d'avant : l'icône, l'aperçu dessiné, la carte de l'étagère), gardé à côté dans un <template>, reprend sa place si l'image ne se charge
   pas (le fichier manque ; hors ligne avant sa mise en cache, le service worker répond 204, sans erreur dans la console) : il remplace
   le bloc marqué data-vig qui la contient (la carte de l'étagère, la pastille d'un trophée du croupier, l'aperçu d'un skin : leur style
   d'avant revient tel quel, grisé ou non), sinon l'image seule ; sans repli, l'image s'efface. Un seul écouteur, en capture sur le document. */
const VIGNETTES = (() => {
  'use strict';
  const T = {
${lignes}
  };
  const actif = typeof window !== 'undefined' && !!window.FOURNIL_VERSION;
  const src = (f, id) => { const h = actif && T[f] && T[f][id]; return h ? \`img/carnet/\${f}/\${id}.webp?v=\${h}\` : ''; };
  const img = (f, id, gagne, repli) => { const s = src(f, id); if (!s) return repli || ''; return \`<img class="vig\${gagne ? '' : ' gris'}" src="\${s}" alt="" loading="lazy" decoding="async">\${repli ? \`<template class="vig-repli">\${repli}</template>\` : ''}\`; };
  if (actif && typeof document !== 'undefined') document.addEventListener('error', (e) => { // (une image qui manque : son repli à la place de son bloc, ou d'elle seule)
    const im = e.target; if (!im || im.tagName !== 'IMG' || !im.classList.contains('vig')) return;
    const t = im.nextElementSibling, repli = t && t.classList.contains('vig-repli') ? t : null, bloc = repli && im.closest('[data-vig]');
    if (!repli) im.remove(); else if (bloc) bloc.replaceWith(repli.content.cloneNode(true)); else { im.replaceWith(repli.content.cloneNode(true)); repli.remove(); }
  }, true);
  return { T, actif, src, img };
})();
if (typeof module !== 'undefined') module.exports = VIGNETTES;
`;
}
