// La planche finale : l'actuelle et les quatre variantes côte à côte (captures 390×844 réduites, gros plans de la loupe), et le tableau des mesures.
// usage : node planche.cjs   (dans $MAQUETTE_TRAVAIL, par défaut <tmp>/maquette-clients : lit captures/<nom>.png, <nom>-loupe1.png, tmp/<nom>-mesures.json
// et tmp/m-<nom>-mesures.json ; écrit planche/planche-finale.html et .png ; port 9031)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const BASE = process.env.MAQUETTE_TRAVAIL || path.join(os.tmpdir(), 'maquette-clients');
const serveur = (port) => http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const f = p.startsWith('/s/') ? path.join(BASE, p.slice(3)) : null; if (!f) { res.writeHead(404); res.end(); return; } fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': f.endsWith('.png') ? 'image/png' : 'text/html' }); res.end(d); }); }).listen(port);
const V = [
  ['0-actuelle', 'Actuelle', 'chibis procéduraux · caméra 52°'],
  ['1-cam-actuelle-pack-a', '1 · caméra actuelle + A', 'Quaternius UACP (CC0), 7 personnages'],
  ['2-cam-actuelle-pack-b', '2 · caméra actuelle + B', 'Kenney Animated Characters (CC0)'],
  ['3-cam-basse-pack-a', '3 · caméra basse + A', 'UACP · ortho inclinée à 33°'],
  ['4-cam-basse-pack-c', '4 · caméra basse + C', 'Quaternius Modular (CC0), réalistes'],
];
const ko = (o) => (o / 1024).toFixed(0) + ' Ko', n = (x) => (x == null ? '–' : String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
const lire = (f) => { try { return JSON.parse(fs.readFileSync(path.join(BASE, 'tmp', f), 'utf8')); } catch (e) { return null; } };
// les rendus (captures, appels, triangles, poids) viennent de tout.sh ; le temps du processeur de la passe à part (cpu.sh, m-<id>), machine plus calme
const mes = V.map(([id]) => { const m = lire(id + '-mesures.json') || {}, c = lire('m-' + id + '-mesures.json'), t = [lire('c-' + id + '-mesures.json'), lire('d-' + id + '-mesures.json')].filter((x) => x && x.cpuTemps).map((x) => x.cpuTemps); if (c) for (const k of ['sansDessin1', 'sansDessin4', 'avecDessin1', 'avecDessin4', 'charge']) m[k] = c[k];
  // (les passes c- et d- du temps processeur : le meilleur lot de toutes)
  if (t.length) { const tous = (k) => t.flatMap((x) => x[k].lots); m.cpuTemps = { sans: { cpu: Math.min(...tous('sans')), lots: tous('sans') }, avec: { cpu: Math.min(...tous('avec')), lots: tous('avec') } }; }
  return m; });
const f1 = (x) => (x == null ? '–' : x.toFixed(1));
const cartes = V.map(([id, t, s], i) => {
  const m = mes[i] || {}, cpu = m.cpuTemps ? `${m.cpuTemps.avec.cpu.toFixed(1)} ms processeur` : '–', loupe = fs.existsSync(path.join(BASE, 'captures', id + '-loupe1.png'));
  return `<div class="t"><div class="cap" style="background-image:url(/s/captures/${id}.png)"></div>${loupe ? `<div class="loupe" style="background-image:url(/s/captures/${id}-loupe1.png)"></div>` : '<div class="loupe vide"></div>'}
  <b>${t}</b><span>${s}</span><span class="m">${n(m.callsMax || m.calls)} appels · ${n((m.trisMax || m.triangles) / 1000)} k tris · ${m.octetsClients ? ko(m.octetsClients) : '0 Ko'} · ${cpu}</span></div>`;
}).join('\n');
const lignes = V.map(([id, t], i) => {
  const m = mes[i] || {}, info = m.c3d && m.c3d.modeles ? m.c3d.modeles : null;
  const tmin = info ? Math.min(...info.map((x) => x.tris)) : 0, tmax = info ? Math.max(...info.map((x) => x.tris)) : 0, trisModele = info ? (tmin === tmax ? n(tmin) : `${n(tmin)}–${n(tmax)}`) : '≈ 1 700';
  const ct = m.cpuTemps, fps = ct ? Math.min(60, 1000 / (4 * ct.avec.cpu)) : null;
  return `<tr><td>${t}</td><td>${n(m.callsMax || m.calls)}</td><td>${n(m.decor)}</td><td>${n(m.acteursMaillages)}</td><td>${n((m.trisMax || m.triangles))}</td><td>${trisModele}</td><td>${m.octetsClients ? ko(m.octetsClients) : '0'}</td><td>${ct ? f1(ct.sans.cpu) + ' · ' + f1(ct.avec.cpu) : '–'}</td><td>${ct ? f1(4 * ct.avec.cpu) : '–'}</td><td>${fps ? fps.toFixed(0) : '–'}</td><td>${m.avecDessin1 ? f1(m.avecDessin1.med) + ' · ' + f1(m.avecDessin4.med) : '–'}</td><td>${(m.clients || []).length}</td></tr>`;
}).join('\n');
// le jeu par défaut contre master (captures faites à la même heure de jeu, --horloge) : la scène sous la barre du haut, et l'écran entier
const { execFileSync } = require('child_process');
const paire = ['-h', ''].map((x) => ['0-actuelle' + x, '0-master' + x]).find(([a, b]) => fs.existsSync(path.join(BASE, 'captures', a + '.png')) && fs.existsSync(path.join(BASE, 'captures', b + '.png')));
const ae = (a, b) => { try { execFileSync('compare', ['-metric', 'AE', a, b, 'null:'], { stdio: 'pipe' }); return 0; } catch (e) { return Number(String(e.stderr).trim().split(' ')[0]); } };
const cap = (x) => path.join(BASE, 'captures', x + '.png');
const scene3d = (x) => { const o = path.join(BASE, 'tmp', 'scene3d-' + x + '.png'); execFileSync('convert', [cap(x), '-fill', 'black', '-draw', 'rectangle 380,215 430,262', '-crop', '780x1350+0+130', '+repage', o]); return o; }; // (le canevas 3D, l'horloge murale masquée : elle suit l'heure réelle)
const px = (k) => `${k} pixel${k > 1 ? 's' : ''} différent${k > 1 ? 's' : ''}`;
const master = paire ? `<p class="s">Le jeu par défaut (sans paramètre) contre master (le point de départ de la branche), même boutique, même heure de jeu : <b>${px(ae(scene3d(paire[0]), scene3d(paire[1])))} dans la scène 3D</b> (aiguilles de l'horloge murale exceptées : elle suit l'heure réelle) ; sur tout l'écran, ${px(ae(cap(paire[0]), cap(paire[1])))} : le bouton ★ qui pulse et les pastilles des onglets, rafraîchis à l'horloge réelle (captures ${paire[0]}.png et ${paire[1]}.png).</p>` : '';
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planche clients 3D</title>
<style>
body{margin:0;background:#2d2420;font-family:system-ui,sans-serif;color:#f6ebdd}
h1{font-size:22px;margin:16px 20px 4px} p.s{margin:0 20px 12px;font-size:12.5px;color:#cdb8a6;max-width:1620px;line-height:1.45}
.g{display:grid;grid-template-columns:repeat(5,318px);gap:12px;padding:0 20px 14px}
.t{background:#F6EBDD;border-radius:10px;overflow:hidden;color:#4A3328}
.cap{width:318px;height:600px;background-size:318px auto;background-position:0 -46px;background-repeat:no-repeat}
.loupe{width:318px;height:310px;background-size:318px auto;background-position:0 -40px;background-repeat:no-repeat;border-top:2px solid #e2cdb8}
.loupe.vide{background:#efe2d2}
.t b{display:block;font-size:14px;padding:7px 10px 0} .t span{display:block;font-size:11.5px;padding:0 10px;color:#7a5a48} .t span.m{padding:3px 10px 9px;color:#4A3328;font-weight:600}
table{border-collapse:collapse;margin:0 20px 20px;font-size:12.5px;background:#F6EBDD;color:#4A3328;border-radius:8px;overflow:hidden}
th,td{padding:6px 10px;text-align:right;border-bottom:1px solid #e2cdb8} th{background:#ead8c4;font-weight:700} td:first-child,th:first-child{text-align:left}
</style></head><body>
<h1>Clients de la boutique : l'actuelle et les quatre variantes de la maquette</h1>
<p class="s">iPhone 390 × 844, qualité haute, même boutique (tout le mobilier, 13 h), même graine de hasard : les mêmes clients arrivent dans chaque variante. En haut, l'écran ; dessous, un gros plan pris avec la caméra du jeu resserrée (file au comptoir et premières tables). Les clients GLB sont cuits en un maillage et un appel de dessin chacun, reteints aux palettes du jeu, assis pieds au sol, le croissant ou la tasse à la main ; le boulanger et les apprentis restent des chibis. Mesures : appels de dessin et triangles de la scène entière (passe d'effets comprise), poids des fichiers des clients ; le temps processeur d'une image (simulation, personnages, scène soumise) sur le fil principal de la page, lu dans /proc (insensible à la charge de la machine, attente du processeur graphique exclue), meilleur de quatre lots de 30 images, sans et avec les appels de dessin WebGL ; ×4 = 4 fois ce temps (ce qu'émule le ralentissement CDP, étalonné) ; et, pour recouper, le temps JS mesuré à l'horloge, ×1 et ralenti ×4 par CDP (médianes de 20 images, bruitées par la charge). SwiftShader dessine sur le processeur : la cadence réelle d'un téléphone ne se mesure pas ici, seul le coût processeur a un sens.</p>
<div class="g">${cartes}</div>
<table><tr><th>Variante</th><th>Appels</th><th>dont décor (≤ 80)</th><th>Maillages acteurs</th><th>Triangles</th><th>Tris / client</th><th>Poids clients</th><th>Processeur / image (ms)<br><small>sans dessin · avec</small></th><th>×4 (ms)<br><small>avec dessin</small></th><th>i/s plafond<br><small>processeur ×4</small></th><th>JS mesuré (ms)<br><small>×1 · ×4, médianes</small></th><th>Clients</th></tr>
${lignes}
</table>
${master}
</body></html>`;
fs.mkdirSync(path.join(BASE, 'planche'), { recursive: true });
fs.writeFileSync(path.join(BASE, 'planche', 'planche-finale.html'), html);
(async () => {
  const PORT = 9031, srv = serveur(PORT);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1690, height: 1300 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${PORT}/s/planche/planche-finale.html`); await page.waitForLoadState('networkidle'); await new Promise((r) => setTimeout(r, 500));
  const h = await page.evaluate(() => document.body.scrollHeight); await page.setViewportSize({ width: 1690, height: h });
  await page.screenshot({ path: path.join(BASE, 'planche', 'planche-finale.png'), fullPage: true });
  console.log('planche', path.join(BASE, 'planche', 'planche-finale.png'));
  await browser.close(); srv.close();
})();
