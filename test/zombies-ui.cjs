// Dernier Rempart : l'interface à plusieurs tailles de téléphone en paysage (petit Android, iPhone SE, iPhone courant, grand iPhone,
// tablette). Pour chaque écran (titre, choix de l'arène, Bunker, Collection, Missions, Modes, Social, Réglages, Défi, Ascension, salon, pause, fin) :
// aucun bouton coupé ou hors de l'écran (les listes qui défilent exprès mises à part : le carrousel des arènes, les listes de la
// Collection, du classement…), le pied de chaque fenêtre (Retour, OK, Monter) toujours visible sans rien faire défiler, l'écran lui-même
// ne défile pas, aucun texte ne déborde de sa boîte. Puis le HUD : aucun texte qui en chevauche un autre au début d'une partie (compte
// à rebours, nom de l'arène, arme), pendant une vague et pendant le choix d'un atout.
// NODE_PATH=/opt/node22/lib/node_modules node test/zombies-ui.cjs   (PORT_ZOMBIES_UI : le port du serveur de test ; TAILLES=667x375,…)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.glb': 'model/gltf-binary' };
const PORT = +process.env.PORT_ZOMBIES_UI || 8897;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = process.env.CAPTURES || path.join(__dirname, 'shots', 'zombies-ui'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const TAILLES = (process.env.TAILLES || '667x375,740x360,844x390,932x430,1024x600').split(',').map((s) => s.split('x').map(Number));
const ECRANS = ['titre', 'arenes', 'bunker', 'capacites', 'collection', 'progression', 'modes', 'social', 'reglages', 'defi', 'ascension', 'salon', 'pause', 'fin'];
const LISTES = '.arenes, .col-liste, .defi-liste, .bunker-liste, .soc-corps, .prog-corps, .liste-joueurs'; // (elles défilent exprès)

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  for (const [w, h] of TAILLES) {
    console.log(`── ${w} × ${h} ──`);
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
    await context.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort()); // pas de réseau extérieur dans les tests
    const page = await context.newPage();
    page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    await page.goto(`http://localhost:${PORT}/zombies/`);
    await page.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 40000 }).catch(() => {});
    await sleep(600);
    for (const e of ECRANS) {
      await page.evaluate((e) => {
        const Z = window.__zombies, f = { capacites: 'ouvrirCapacites', collection: 'ouvrirCollection', progression: 'ouvrirProgression', modes: 'ouvrirModes', social: 'ouvrirSocial', defi: 'ouvrirDefi', ascension: 'ouvrirAscension' }[e];
        if (e === 'bunker') document.querySelector('#b-bunker').click(); else if (f) Z[f](); else Z.montrer(e);
      }, e);
      await sleep(300);
      const r = await page.evaluate((LISTES) => {
        const W = innerWidth, H = innerHeight, sec = [...document.querySelectorAll('section.ecran')].find((s) => !s.hidden);
        if (!sec) return { pb: ['aucun écran visible'] };
        const pb = [];
        if (sec.scrollHeight > sec.clientHeight + 2) pb.push(`l'écran entier défile (${sec.clientHeight}/${sec.scrollHeight} px)`);
        for (const bt of sec.querySelectorAll('button, a.moyen')) {
          if (!bt.offsetParent || bt.closest(LISTES)) continue;
          const q = bt.getBoundingClientRect(); if (q.width < 1) continue;
          let coupe = q.bottom > H + 1 || q.right > W + 1 || q.top < -1 || q.left < -1;
          for (let a = bt.parentElement; a && a !== sec && !coupe; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (/(auto|scroll|hidden)/.test(cs.overflowY + cs.overflowX)) { const z = a.getBoundingClientRect(); if (q.bottom > z.bottom + 1 || q.right > z.right + 1 || q.top < z.top - 1 || q.left < z.left - 1) coupe = true; }
          }
          // un bouton du pied est visible tel quel ; un bouton du contenu peut demander de faire défiler la fenêtre (le pied reste là)
          const sortie = /^(Retour|OK|Monter|Reprendre|Rejouer|Menu)$/.test((bt.innerText || '').trim()); // (les boutons pour sortir : jamais à chercher)
          if (coupe && (sortie || bt.closest('.pied') || !bt.closest('.carte-ecran'))) pb.push(`bouton coupé : « ${(bt.innerText || bt.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)} »`);
        }
        for (const el of sec.querySelectorAll('button, b, small, span, p, h2, div')) {
          if (!el.offsetParent || el.children.length > 2 || el.clientWidth <= 1 || el.closest(LISTES) || el.closest('.sr')) continue; // (.sr : le texte pour les lecteurs d'écran, invisible)
          if (el.scrollWidth > el.clientWidth + 2 && !/(auto|scroll)/.test(getComputedStyle(el).overflowX)) pb.push(`texte qui déborde : « ${el.innerText.trim().slice(0, 30)} »`);
        }
        const pied = sec.querySelector('.pied');
        return { pb: [...new Set(pb)], pied: pied ? pied.getBoundingClientRect().bottom <= H + 1 : null };
      }, LISTES);
      await page.screenshot({ path: `${out}/${w}x${h}-${e}.png` });
      check(r.pb.length === 0 && r.pied !== false, `${e} : rien de coupé${r.pied ? ', le pied visible' : ''}${r.pb.length ? ' — ' + r.pb.join(' ; ') : ''}`);
    }

    // le HUD : aucun texte qui en chevauche un autre
    await page.evaluate(() => window.__zombies.montrer('titre')); await sleep(200);
    await page.tap('#b-jouer'); await sleep(700);
    const chevauchements = () => page.evaluate(() => {
      const ok = (el) => el.offsetParent && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > 0.05;
      const els = [...document.querySelectorAll('#hud *')].filter((el) => /^(B|SMALL|SPAN|DIV|BUTTON)$/.test(el.tagName) && ok(el) && el.innerText && el.innerText.trim() && !el.querySelector('b, small, span, div, button')
        && !el.closest('.h-degats, .h-noms, .h-bulles, .h-atelier, .h-cartes'));
      const R = els.map((el) => ({ t: el.innerText.trim().slice(0, 22), q: el.getBoundingClientRect() })).filter((o) => o.q.width > 0);
      const res = [];
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
        const a = R[i].q, b = R[j].q, ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ix > 4 && iy > 4) res.push(`« ${R[i].t} » sur « ${R[j].t} »`);
      }
      return res;
    });
    const debut = await chevauchements();
    const vus = await page.evaluate(() => ({ entre: !document.querySelector('.h-entre').hidden, annonce: !document.querySelector('.h-annonce').hidden }));
    await page.screenshot({ path: `${out}/${w}x${h}-hud-debut.png` });
    check(vus.entre && vus.annonce && debut.length === 0, `HUD, début de partie : le compte à rebours et le nom de l'arène, sans chevauchement${debut.length ? ' — ' + debut.join(' ; ') : ''}`);
    await page.evaluate(() => { const j = window.__zombies.jeu; j.joueurs[0].vieMax = j.joueurs[0].vie = 300; });
    await page.tap('.h-lancer').catch(() => {});
    await page.evaluate(() => { window.__zombies.avancer(60 * 3); }); await sleep(200);
    const vague = await chevauchements(); await page.screenshot({ path: `${out}/${w}x${h}-hud-vague.png` });
    check(vague.length === 0, `HUD, l'annonce de la vague : sans chevauchement${vague.length ? ' — ' + vague.join(' ; ') : ''}`);
    // le choix d'un atout : le haut du HUD s'efface derrière « NIVEAU 2 ! »
    await page.evaluate(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.vie = p.vieMax = 1e4; p.xp = (p.xpProchain || 1e6) + 1; window.__zombies.avancer(60 * 25); });
    await page.waitForFunction(() => !document.querySelector('.h-choix').hidden, null, { timeout: 8000 }).catch(() => {});
    const choix = await page.evaluate(() => !document.querySelector('.h-choix').hidden);
    const pendant = await chevauchements(); await page.screenshot({ path: `${out}/${w}x${h}-hud-atout.png` });
    check(choix && pendant.length === 0, `HUD, le choix d'un atout : le haut du HUD s'efface, rien ne chevauche le titre${!choix ? ' (le choix ne s’est pas ouvert)' : ''}${pendant.length ? ' — ' + pendant.join(' ; ') : ''}`);
    await context.close();
  }
  check(errors.length === 0, `aucune erreur dans la page (${errors.slice(0, 3).join(' | ')})`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
