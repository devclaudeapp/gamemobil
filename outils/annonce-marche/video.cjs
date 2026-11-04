// La vidéo de présentation du « Marché d'automne » (une dizaine de secondes : la Halle en haute, de jour ; un enfant déguisé servi ; le
// soir, les lampions), capturée dans le VRAI jeu (fournil/ servi en local, node build.js d'abord) : téléphone 390×844, qualité haute (la
// Halle en HD), heure du téléphone simulée pendant l'événement. Calquée sur outils/annonce-hantee/video.cjs (le même temps virtuel, les mêmes
// titres, le même assemblage) : le TEMPS EST VIRTUEL — une fois le décor chargé, performance.now, Date, setTimeout/setInterval,
// requestAnimationFrame et les animations CSS n'avancent que quand le script le dit (1/25 s par image), puis chaque image est photographiée.
// usage : NODE_PATH=/opt/node22/lib/node_modules node outils/annonce-marche/video.cjs [--port 98xx] [--essai] [--plans 1,3] [--monter]
//   [--sortie dossier] [--publier]
//   --essai : une image sur 8 seulement (cadrage rapide) ; --plans : quelques plans seulement ; --monter : refait seulement l'assemblage ;
//   --sortie : où écrire marche.mp4 et marche-affiche.jpg (par défaut $ANNONCE_TRAVAIL/video) ; --publier : les copie aussi dans
//   fournil/media/ (l'écran les montre si src/evenement.js, HABILLAGE_MARCHE.video, les nomme). Travail dans $ANNONCE_TRAVAIL (par défaut
//   <tmp>/annonce-marche) ; les polices du jeu comme pour la Maison hantée ($ANNONCE_TRAVAIL/polices/local.css), sinon une police de repli.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2), opt = (k) => args.includes(k), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = process.env.ANNONCE_TRAVAIL || path.join(os.tmpdir(), 'annonce-marche');
const PORT = +val('--port', 9802), FPS = 25, DT = 1000 / FPS, ESSAI = opt('--essai'), PAS_ESSAI = 8;
const PLANS = val('--plans', '') ? val('--plans').split(',').map(Number) : null;
const DPR = +val('--dpr', 1.5), LARGEUR = 540;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
// le samedi 14 novembre 2026, 11 h à Paris : le 2e jour du Marché d'automne
const DEPART = Date.parse('2026-11-14T11:00:00+01:00');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = p.startsWith('/__polices/') ? path.join(BASE, 'polices', path.basename(p)) : path.join(ROOT, p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const dodo = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── l'assemblage : chaque plan en vidéo, puis les fondus enchaînés (xfade), 540 px de large, H.264 main (iPhone), muette ───
const FONDU = 0.4;
function monter() {
  const V = path.resolve(val('--sortie', path.join(BASE, 'video'))), ff = (a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a], { stdio: 'inherit', cwd: V });
  fs.mkdirSync(V, { recursive: true });
  const dirs = fs.readdirSync(path.join(BASE, 'plans')).filter((d) => /^\d+$/.test(d)).sort((a, b) => a - b);
  const durees = dirs.map((d) => fs.readdirSync(path.join(BASE, 'plans', d)).filter((f) => f.endsWith('.png')).length / FPS);
  const entrees = dirs.flatMap((d) => ['-framerate', String(FPS), '-i', path.join(BASE, 'plans', d, 'i%04d.png')]);
  let graphe = dirs.map((d, i) => `[${i}:v]scale=${LARGEUR}:-2:flags=lanczos,setsar=1,format=yuv420p[p${i}]`).join(';'), prec = 'p0', t = durees[0];
  for (let i = 1; i < dirs.length; i++) { const o = (t - FONDU).toFixed(3); graphe += `;[${prec}][p${i}]xfade=transition=fade:duration=${FONDU}:offset=${o}[x${i}]`; prec = `x${i}`; t += durees[i] - FONDU; }
  graphe += `;[${prec}]fade=t=in:st=0:d=0.3,fade=t=out:st=${(t - 0.35).toFixed(3)}:d=0.35[v]`;
  // deux passes, au débit qui tient dans le budget (1 Mio au plus pour une dizaine de secondes)
  const sortie = path.join(V, 'marche.mp4'), kbps = Math.floor(+val('--mio', 1) * 1048576 * 8 / t / 1000 * 0.97), journal = path.join(V, 'passe');
  const commun = [...entrees, '-filter_complex', graphe, '-map', '[v]', '-an', '-c:v', 'libx264', '-profile:v', 'main', '-level', '3.1', '-preset', 'slow', '-b:v', kbps + 'k', '-maxrate', Math.round(kbps * 1.6) + 'k', '-bufsize', Math.round(kbps * 3) + 'k', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-g', String(FPS * 2), '-passlogfile', journal];
  ff([...commun, '-pass', '1', '-f', 'mp4', '/dev/null']);
  ff([...commun, '-pass', '2', '-movflags', '+faststart', sortie]);
  for (const f of fs.readdirSync(V)) if (f.startsWith('passe')) fs.rmSync(path.join(V, f), { force: true });
  console.log(`vidéo ${sortie} : ${t.toFixed(1)} s, ${(fs.statSync(sortie).size / 1024).toFixed(0)} Ko`);
  // l'affiche : une image du premier plan (son titre posé), en JPEG
  const imgs = fs.readdirSync(path.join(BASE, 'plans', dirs[0])).filter((f) => f.endsWith('.png')).sort(), affiche = path.join(V, 'marche-affiche.jpg');
  execFileSync('convert', [path.join(BASE, 'plans', dirs[0], imgs[Math.min(imgs.length - 1, Math.round(imgs.length * 0.62))]), '-resize', `${LARGEUR}x`, '-strip', '-sampling-factor', '4:2:0', '-quality', val('--qualite-affiche', '66'), affiche]);
  console.log(`affiche ${affiche} : ${(fs.statSync(affiche).size / 1024).toFixed(0)} Ko`);
  if (opt('--publier')) { const M = path.join(ROOT, 'fournil', 'media'); fs.mkdirSync(M, { recursive: true }); fs.copyFileSync(sortie, path.join(M, 'marche.mp4')); fs.copyFileSync(affiche, path.join(M, 'marche-affiche.jpg')); console.log('publiées dans fournil/media/'); }
}
if (opt('--monter')) { monter(); process.exit(0); }

// ─── le temps virtuel (avant tout script de la page) : le même que pour la Maison hantée ───
function tempsVirtuel(decal) {
  const D = Date, pn = performance.now.bind(performance), st0 = window.setTimeout.bind(window), si0 = window.setInterval.bind(window), ct0 = window.clearTimeout.bind(window), ci0 = window.clearInterval.bind(window), raf0 = window.requestAnimationFrame.bind(window), caf0 = window.cancelAnimationFrame.bind(window);
  const V = window.__vt = { on: false, p: 0, timers: new Map(), id: 1e6, rafs: new Map(), rid: 1e6 };
  const perf = () => (V.on ? V.p : pn());
  const epoch0 = D.now() + decal - pn();
  class F extends D { constructor(...a) { if (a.length) super(...a); else super(epoch0 + perf()); } static now() { return epoch0 + perf(); } }
  window.Date = F; performance.now = perf;
  const lancer = (t) => { try { if (typeof t.fn === 'function') t.fn(...t.a); else (0, eval)(String(t.fn)); } catch (e) { setTimeout(() => { throw e; }, 0); } };
  function poser(fn, ms, a, rep) {
    const id = ++V.id, d = Math.max(0, +ms || 0), t = { fn, a, due: perf() + d, rep: rep ? Math.max(1, d) : 0, reel: null };
    V.timers.set(id, t);
    if (!V.on) t.reel = (rep ? si0 : st0)(() => { if (V.on) return; if (!rep) V.timers.delete(id); t.due = perf() + t.rep; lancer(t); }, d);
    return id;
  }
  window.setTimeout = (fn, ms, ...a) => poser(fn, ms, a, false);
  window.setInterval = (fn, ms, ...a) => poser(fn, ms, a, true);
  window.clearTimeout = window.clearInterval = (id) => { const t = V.timers.get(id); if (t) { if (t.reel != null) { ct0(t.reel); ci0(t.reel); } V.timers.delete(id); } };
  window.requestAnimationFrame = (cb) => { const id = ++V.rid; if (V.on) V.rafs.set(id, cb); else { const r = raf0((ts) => { if (V.on) { V.rafs.set(id, cb); return; } V.rafs.delete(id); cb(perf()); }); V.rafs.set(id, null); V.reelRaf = V.reelRaf || new Map(); V.reelRaf.set(id, r); } return id; };
  window.cancelAnimationFrame = (id) => { V.rafs.delete(id); if (V.reelRaf && V.reelRaf.has(id)) caf0(V.reelRaf.get(id)); };
  V.demarrer = () => { V.p = pn(); V.on = true; for (const [id, cb] of [...V.rafs]) if (!cb) V.rafs.delete(id); };
  V.pas = (dt) => {
    const fin = V.p + dt;
    for (let garde = 0; garde < 5000; garde++) {
      let pro = null, pid = 0; for (const [id, t] of V.timers) if (t.due <= fin && (!pro || t.due < pro.due)) { pro = t; pid = id; }
      if (!pro) break;
      V.p = Math.max(V.p, pro.due); if (pro.rep) pro.due += pro.rep; else V.timers.delete(pid); lancer(pro);
    }
    V.p = fin;
    const l = [...V.rafs]; V.rafs.clear(); for (const [, cb] of l) if (cb) { try { cb(V.p); } catch (e) { setTimeout(() => { throw e; }, 0); } }
    for (const a of document.getAnimations()) { try { if (!a.__vt) { a.__vt = 1; a.pause(); a.currentTime = a.currentTime || 0; } const t = (+a.currentTime || 0) + dt, fin = a.effect && a.effect.getComputedTiming().endTime; if (Number.isFinite(fin) && t >= fin) a.finish(); else a.currentTime = t; } catch (e) { /* rien */ } }
  };
}

(async () => {
  fs.mkdirSync(path.join(BASE, 'plans'), { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.addInitScript(tempsVirtuel, DEPART - Date.now());
  await ctx.addInitScript(() => { window.__sansAstuces = true; });
  const fcss = path.join(BASE, 'polices', 'local.css'), css = fs.existsSync(fcss) ? fs.readFileSync(fcss, 'utf8').replace(/\/__polices\//g, `http://localhost:${PORT}/__polices/`) : null;
  if (!css) console.log(`(pas de ${fcss} : les titres et le jeu dans une police de repli)`);
  await ctx.route(/fonts\.googleapis\.com/, (r) => (css ? r.fulfill({ status: 200, contentType: 'text/css', body: css }) : r.abort()));
  await ctx.route(/fonts\.gstatic\.com|supabase\.co/, (r) => r.abort());
  await ctx.route(/[?&]heure=/, (r) => r.abort());
  await ctx.route(/version\.json/, (r) => r.abort());
  const page = await ctx.newPage(); page.setDefaultTimeout(240000);
  const errs = []; page.on('pageerror', (e) => errs.push('pageerror ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|404|supabase|heure/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  await page.goto(`http://localhost:${PORT}/fournil/?qualite=haute&cadence=0`);
  await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 120000, polling: 250 }); await dodo(1500);
  const fermerFeuilles = async () => { for (let k = 0; k < 6; k++) { await ev(() => { const f = document.querySelector('#feuille'); if (f && !f.hidden) { const b = f.querySelector('[data-a="pq-tard"], [data-a="close"], [data-a="pq-ok"], [data-a$="tard"], [data-a="non"], [data-a="ok"]'); if (b) b.click(); else if (window.__fournil.fermerFeuille) window.__fournil.fermerFeuille(); } }); await dodo(250); } };
  // la partie : une boulangerie bien installée ; le Marché au 2e jour, déjà annoncé, six paliers, les amis de la forêt, l'album entamé
  await ev(() => {
    const f = window.__fournil, G = f.G, st = f.st; st.tuto = 99; f.give(1e12);
    for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 4; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id);
    const q = f.evMarche.R.etat(st, HORLOGE.maintenant()); q.annonce = true; q.billets = 3.2e12; q.total = 2.2e12;
    [[160, 1], [125, 1], [100, 1], [75, 1], [50, 1], [12, 0]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; });
    q.paliers = [1, 2, 3, 4, 5, 6]; for (const k of ['cagettes', 'lampions', 'feuilles']) if (!q.decos.includes(k)) q.decos.push(k);
    st.nouveautesVues = 'zzzz'; f.save();
  });
  await fermerFeuilles();
  await ev(() => window.__fournil.SCENE.precharger('marche'));
  for (let t = 0; t < 240 && !(await ev(() => HDM.pret('marche'))); t++) await dodo(500);
  await dodo(1500);
  await ev(() => window.__fournil.marche());
  for (let t = 0; t < 240; t++) { if (await ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.hd && e.apprentis.length >= 5 && e.apprentis.every((a) => a.bati); })) break; await dodo(500); }
  await dodo(2500); await fermerFeuilles();
  // la qualité ne s'ajuste plus (le temps virtuel espace les images de 40 ms : elle croirait le téléphone lent) ; les toasts et l'indice cachés ;
  // les titres aux couleurs de la Halle (chocolat, citrouille, feuille d'or)
  await ev(() => { if (SCENE._qual) SCENE._qual.fixe = true; const s = document.createElement('style'); s.id = 'vt-style'; s.textContent = `.toast { visibility: hidden !important; } #indice { display: none !important; }
    #vt-titre { position: fixed; left: 50%; z-index: 99999; transform: translateX(-50%); width: max-content; max-width: 352px; box-sizing: border-box; padding: 12px 20px 13px; border-radius: 22px; text-align: center; pointer-events: none;
      background: rgba(58, 36, 22, .86); color: #FFF4E4; box-shadow: 0 8px 24px rgba(0, 0, 0, .35), inset 0 0 0 2px rgba(232, 179, 58, .6); font-family: Fredoka, Nunito, sans-serif; opacity: 0; }
    #vt-titre b { display: block; font-size: 25px; line-height: 1.12; font-weight: 700; letter-spacing: .2px; color: #F2C14A; text-shadow: 0 2px 0 rgba(0,0,0,.35); }
    #vt-titre small { display: block; margin-top: 4px; font: 800 15.5px/1.25 Nunito, sans-serif; color: #FFF4E4; }
    #vt-titre.vu { animation: vtEntre .45s cubic-bezier(.2,.9,.3,1.2) forwards; }
    @keyframes vtEntre { from { opacity: 0; transform: translate(-50%, 10px) scale(.94); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
    .vt-doigt { position: fixed; z-index: 99998; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; pointer-events: none;
      background: radial-gradient(circle, rgba(255,255,255,.85) 0 30%, rgba(255,255,255,.35) 31% 60%, rgba(255,255,255,0) 61%); box-shadow: 0 0 0 3px rgba(232,179,58,.9); animation: vtDoigt .55s ease-out forwards; }
    @keyframes vtDoigt { 0% { transform: scale(.55); opacity: 1; } 60% { opacity: .9; } 100% { transform: scale(1.35); opacity: 0; } }`; document.head.appendChild(s); });
  await ev(() => window.__vt.demarrer());
  const pas = (n) => ev(([n, dt]) => { for (let i = 0; i < n; i++) window.__vt.pas(dt); }, [n, DT]);
  await pas(10);
  const insec = (x) => String(x || '').replace(/(^|\s)(\S{1,2}) /g, '$1$2 ').replace(/(\d) (?=\S)/g, '$1 ');
  const titre = (t, sous, y) => ev(([t, sous, y]) => { let e = document.querySelector('#vt-titre'); if (e) e.remove(); if (!t) return; e = document.createElement('div'); e.id = 'vt-titre'; e.innerHTML = `<b>${t}</b>${sous ? `<small>${sous}</small>` : ''}`; e.style.top = y + 'px'; document.body.appendChild(e); void e.offsetWidth; e.classList.add('vu'); }, [insec(t), insec(sous), y]);
  const ecran = async (dir, k) => { await page.screenshot({ path: path.join(dir, `i${String(k).padStart(4, '0')}.png`) }); };
  async function filmer(dir, n, chaque) {
    for (let k = 0; k < 2; k++) { await page.screenshot({ type: 'jpeg', quality: 10 }); await pas(2); }
    for (let k = 0; k < n; k++) { if (chaque) await chaque(k); await pas(1); if (!ESSAI || k % PAS_ESSAI === 0 || k === n - 1) await ecran(dir, k); if (k % 25 === 0) process.stdout.write(`${k}/${n} `); }
    process.stdout.write('\n');
  }
  const act = () => ev(() => window.__fournil.evMarche.act.etat());
  const grand = async (h) => { await ev((h) => { const sc = document.querySelector('#marche .pq-scene'); sc.style.height = h ? h + 'px' : ''; sc.style.flex = h ? '0 0 auto' : ''; window.dispatchEvent(new Event('resize')); }, h || 0);
    for (let k = 0; k < 2; k++) { await page.screenshot({ type: 'jpeg', quality: 10 }); await pas(3); } };
  const toucher = async (x, y) => { await ev(([x, y]) => { const d = document.createElement('i'); d.className = 'vt-doigt'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, [x, y]); await page.touchscreen.tap(x, y); };
  await ev(() => { window.__dessin = (on) => { if (!window.__dessins) { window.__dessins = []; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) if (C) for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) if (C.prototype[m]) window.__dessins.push([C, m, C.prototype[m]]); }
    for (const [C, m, f] of window.__dessins) C.prototype[m] = on ? f : function () {}; }; });
  const vite = (n) => ev(([n, dt]) => { window.__dessin(false); try { for (let i = 0; i < n; i++) window.__vt.pas(dt); } finally { window.__dessin(true); } }, [n, DT]);
  const jusqua = async (fn, arg, max = 750) => { for (let k = 0; k < max; k += 5) { const r = await ev(fn, arg); if (r) return r; await vite(5); } return null; };
  const remplir = () => ev(() => { const S = window.__fournil.SCENE; for (const z of ['table', 'table', 'table', 'table', 'bar', 'bar', 'banquette', 'terrasse', 'table', 'table']) S.installer(z, 900); for (let j = 0; j < 4; j++) VIE.vente(0, 10, '+10', true); });
  const plans = [], plan = (n, nom, fn) => plans.push({ n, nom, fn });

  // 1. l'arrivée : la Halle de jour (la lumière dorée de fin d'après-midi), des enfants déguisés qui entrent et s'attablent
  plan(1, 'arrivee', async (dir) => {
    await grand(600); await ev(() => window.__fournil.scene({ heure: 11 }));
    for (let r = 0; r < 3; r++) { await remplir(); await vite(60); }
    await pas(4);
    await filmer(dir, 88, (k) => (k === 8 ? titre('Le Marché d’automne', 'Ta boutique devient la Halle', 600) : null));
  });
  // 2. servir un enfant : il attend à l'étal, sa bulle dit sa commande ; on touche la bulle ; il repart ravi
  plan(2, 'servir', async (dir) => {
    await grand(600);
    await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.manoir.prochainClient = HORLOGE.maintenant() - 1; });
    const clientPose = () => jusqua(() => { const e = window.__fournil.evMarche.act.etat(); return e.clients.find((c) => c.bulle && c.sid && c.etat === 'file' && c.bulle.y > 200) || null; });
    let c = await clientPose(); await vite(25); c = await clientPose(); await pas(2);
    if (!c) console.log('  (pas de client à l’étal)');
    let fait = false;
    await filmer(dir, 88, async (k) => {
      if (k === 6) await titre('Sers les enfants déguisés', 'Écureuils, renards, hérissons…', 600);
      if (c && !fait && k >= 22 && k % 12 === 10) { const e = await act(), x = e.clients.find((y) => y.id === c.id); if (x && x.bulle) await toucher(x.bulle.x, x.bulle.y); else fait = true; }
    });
  });
  // 3. le soir : les lampions s'allument, une feuille d'or tombe en virevoltant
  plan(3, 'soir', async (dir) => {
    await grand(600); await ev(() => window.__fournil.scene({ heure: 20.3 })); await remplir(); await vite(40); // (le crépuscule : les lampions et les lanternes tout allumés)
    await ev(() => { const F = window.__fournil, q = F.evMarche.R.etat(F.st, HORLOGE.maintenant()); q.manoir.prochaineApp = HORLOGE.maintenant() + 3600e3; BOUTIQUE_MARCHE.apparition('feuille'); });
    await pas(3);
    await filmer(dir, 88, (k) => (k === 6 ? titre('Jusqu’au 20 novembre', 'Le soir, les lampions s’allument', 600) : null));
  });
  for (const p of plans) {
    if (PLANS && !PLANS.includes(p.n)) continue;
    const dir = path.join(BASE, 'plans', String(p.n)); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    console.log(`plan ${p.n} · ${p.nom}`); const t0 = Date.now(); await p.fn(dir); await titre(''); console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  console.log('erreurs', JSON.stringify(errs.slice(0, 8)));
  await browser.close(); server.close();
  if (!ESSAI && !PLANS) monter();
})().catch((e) => { console.error('ECHEC', e); server.close(); process.exit(1); });
