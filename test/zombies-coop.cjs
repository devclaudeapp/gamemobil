// Dernier Rempart : la coop, deux survivants sur deux pages (le salon local ?reseau=local : BroadcastChannel, le même code que la voie
// Supabase + WebRTC pour tout le reste). Alice crée le salon, Bob le rejoint avec le code ; l'hôte lance → les deux jouent la même partie :
// Bob court (sa position arrive chez l'hôte), les zombies de l'hôte arrivent chez Bob, Bob pose une tourelle (exécutée par l'hôte, vue des
// deux côtés), les dégâts s'affichent chez Bob, son pseudo s'affiche chez Alice ; un niveau passé n'arrête pas la partie ; Bob tombe et
// Alice le relève ; tout le monde à terre : la fin, l'hôte peut relancer, Bob attend. Aucune erreur dans les pages.
// NODE_PATH=/opt/node22/lib/node_modules node test/zombies-coop.cjs   (PORT_ZOMBIES_COOP : le port du serveur de test)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary' };
const PORT = +process.env.PORT_ZOMBIES_COOP || 8895;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = process.env.CAPTURES || path.join(__dirname, 'shots', 'zombies'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const URL0 = `http://localhost:${PORT}/zombies/?reseau=local`;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'fr-FR', serviceWorkers: 'block' });
  await context.route(/fonts\.(googleapis|gstatic)\.com|supabase\.co/, (r) => r.abort());
  const errors = [];
  const ouvrir = async (nom) => {
    const p = await context.newPage();
    p.on('pageerror', (e) => { errors.push(nom + ': ' + e.message); console.log('PAGEERROR', nom, e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|favicon|ERR_FAILED|supabase/.test(m.text())) errors.push(nom + ': ' + m.text()); });
    await p.goto(URL0); await p.waitForFunction(() => window.__zombies && document.body.dataset.ecran === 'titre', null, { timeout: 30000 });
    return p;
  };
  const A = await ouvrir('Alice'), B = await ouvrir('Bob');
  const PA = (f, a) => A.evaluate(f, a), PB = (f, a) => B.evaluate(f, a);

  // ─── le salon ───
  await A.tap('#b-multi'); await A.fill('#s-pseudo', 'Alice'); await A.tap('#b-creer');
  await A.waitForFunction(() => !document.querySelector('.salon-dedans').hidden, null, { timeout: 15000 }).catch(() => {});
  const code = await PA(() => document.querySelector('.code-salon').textContent);
  check(/^[A-Z]{4}$/.test(code) && await PA(() => !document.querySelector('#b-lancer').hidden), `Alice crée un salon : le code ${code}, le bouton Lancer (elle est l’hôte)`);
  await B.tap('#b-multi'); await B.fill('#s-pseudo', 'Bob'); await B.fill('#s-code', code.toLowerCase()); await B.tap('#b-rejoindre');
  await B.waitForFunction(() => !document.querySelector('.salon-dedans').hidden, null, { timeout: 15000 }).catch(() => {});
  await A.waitForFunction(() => document.querySelectorAll('.liste-joueurs li').length === 2, null, { timeout: 15000 }).catch(() => {});
  const listes = [await PA(() => document.querySelector('.liste-joueurs').innerText), await PB(() => document.querySelector('.liste-joueurs').innerText)];
  check(listes.every((l) => /Alice/.test(l) && /Bob/.test(l)) && await PB(() => document.querySelector('#b-lancer').hidden && !document.querySelector('.attente').hidden), 'Bob rejoint avec le code : les deux voient Alice et Bob ; Bob attend l’hôte');
  await A.screenshot({ path: out + '/coop-0-salon.png' });

  // ─── la partie ───
  await A.tap('#b-lancer');
  await B.waitForFunction(() => window.__zombies.partie && document.body.dataset.ecran === 'jeu', null, { timeout: 15000 }).catch(() => {});
  const debut = [await PA(() => ({ e: document.body.dataset.ecran, hote: window.__zombies.partie && window.__zombies.partie.estHote, n: window.__zombies.jeu.joueurs.length, ids: window.__zombies.jeu.joueurs.map((p) => p.pseudo).join() })),
    await PB(() => ({ e: document.body.dataset.ecran, hote: window.__zombies.partie && window.__zombies.partie.estHote, n: window.__zombies.jeu.joueurs.length, ids: window.__zombies.jeu.joueurs.map((p) => p.pseudo).join() }))];
  check(debut[0].e === 'jeu' && debut[1].e === 'jeu' && debut[0].hote === true && debut[1].hote === false && debut[0].n === 2 && debut[0].ids === debut[1].ids, `Lancer : les deux jouent la même partie (${debut[0].ids}), Alice simule, Bob suit`);
  const idB = await PB(() => window.__zombies.idMoi);
  // Bob court : sa position arrive chez l'hôte
  const x0 = await PA((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).x, idB);
  const cdp = await context.newCDPSession(B);
  const toucher = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p[0], y: p[1], id: 1 })) });
  await toucher('touchStart', [[220, 250]]); for (let k = 1; k <= 6; k++) { await toucher('touchMove', [[220 + k * 12, 250]]); await sleep(30); }
  await sleep(900); await toucher('touchEnd', []);
  await sleep(300);
  const x1 = await PA((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).x, idB), xB = await PB((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).x, idB);
  check(x1 > x0 + 1.5 && Math.abs(xB - x1) < 0.8, `Bob court vers la droite : chez lui tout de suite, chez l’hôte aussi (${x0.toFixed(1)} → ${x1.toFixed(1)} m ; chez Bob ${xB.toFixed(1)} m)`);
  // les zombies de l'hôte arrivent chez Bob
  await PA(() => { const j = window.__zombies.jeu; j.chrono = 0.05; for (const p of j.joueurs) { p.vie = p.vieMax = 1e5; } });
  await B.waitForFunction(() => window.__zombies.jeu.zombies.length > 3, null, { timeout: 20000 }).catch(() => {});
  const zs = [await PA(() => window.__zombies.jeu.zombies.map((z) => z.id)), await PB(() => window.__zombies.jeu.zombies.map((z) => z.id))];
  check(zs[1].length > 3 && zs[1].filter((id) => zs[0].includes(id)).length >= zs[1].length - 3, `la vague de l’hôte arrive chez Bob (${zs[0].length} zombies chez Alice, ${zs[1].length} chez Bob, les mêmes)`);
  // Bob pose une tourelle : l'hôte l'exécute pour lui
  await PA((id) => { window.__zombies.jeu.joueurs.find((p) => p.id === id).ferraille = 50; }, idB);
  await B.waitForFunction(() => document.querySelector('[data-def="tourelle"]').dataset.etat === 'ok', null, { timeout: 5000 }).catch(() => {});
  await B.tap('[data-def="tourelle"]');
  await A.waitForFunction((id) => window.__zombies.jeu.defenses.some((d) => d.par === id), idB, { timeout: 5000 }).catch(() => {});
  await B.waitForFunction(() => window.__zombies.jeu.defenses.length > 0, null, { timeout: 5000 }).catch(() => {});
  const tour = [await PA((id) => window.__zombies.jeu.defenses.filter((d) => d.par === id).length, idB), await PB(() => window.__zombies.jeu.defenses.length), await PB((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).ferraille, idB)];
  check(tour[0] === 1 && tour[1] >= 1 && tour[2] === 35, `Bob pose une tourelle : l’hôte la construit pour lui, elle se voit chez Bob, sa ferraille baisse (${tour[2]})`);
  // (un zombie à portée de Bob, pour qu'il tire sûrement)
  await PA((id) => { const j = window.__zombies.jeu, b = j.joueurs.find((p) => p.id === id), z = j.zombies[0]; if (z) { z.x = b.x + 3; z.z = b.z; z.vie = z.vieMax = 400; } }, idB);
  await B.waitForFunction(() => ZHUD.chiffres.n > 0, null, { timeout: 15000 }).catch(() => {});
  console.log('      chez Bob :', JSON.stringify(await PB(() => ({ n: ZHUD.chiffres.n, tirs: window.__zombies.jeu.zombies.length }))), 'chez Alice :', JSON.stringify(await PA(() => ({ tirs: window.__zombies.jeu.stats.tirs, n: ZHUD.chiffres.n }))));
  check(await PB(() => ZHUD.chiffres.n > 0), 'les dégâts s’affichent aussi chez Bob');
  check(/Bob/.test(await PA(() => [...document.querySelectorAll('.h-noms span:not([hidden])')].map((s) => s.textContent).join())), 'Alice voit le pseudo de Bob au-dessus de lui');
  await B.screenshot({ path: out + '/coop-1-bob.png' });
  // un niveau passé ne met pas la partie en pause à plusieurs
  // (l'expérience au bord du niveau, et des zombies à un coup juste devant Alice ; jusqu'à trois essais, si un autre les abat avant elle)
  for (let essai = 0; essai < 3 && !(await PA(() => !!window.__zombies.jeu.joueurs[0].choix)); essai++) {
    await PA(() => { const j = window.__zombies.jeu, p = j.joueurs[0]; p.xp = Math.max(p.xp, 9999); for (const z of j.zombies.slice(0, 3)) { z.x = p.x + 2.5; z.z = p.z; z.vie = 1; z.terre = false; } });
    await A.waitForFunction(() => window.__zombies.jeu.joueurs[0].choix, null, { timeout: 6000 }).catch(() => {});
  }
  const t0 = await PA(() => window.__zombies.jeu.t); await sleep(700);
  const choix = await PA(() => ({ choix: !!window.__zombies.jeu.joueurs[0].choix, global: window.__zombies.jeu.choix, t: window.__zombies.jeu.t, modal: !document.querySelector('.h-choix').hidden }));
  check(choix.choix && !choix.global && choix.t > t0 + 0.2 && choix.modal, 'à plusieurs, un niveau passé ouvre les atouts d’Alice sans arrêter la partie');
  await A.tap('.h-carte-atout >> nth=0'); await sleep(300);
  // Bob tombe, Alice le relève
  await PA((id) => { const j = window.__zombies.jeu, b = j.joueurs.find((p) => p.id === id), a = j.joueurs[0]; b.vie = 0; b.vivant = false; a.x = b.x + 0.8; a.z = b.z; for (const z of j.zombies) z.vie = 0; j.aSortir = 0; }, idB);
  await B.waitForFunction((id) => !window.__zombies.jeu.joueurs.find((p) => p.id === id).vivant, idB, { timeout: 5000 }).catch(() => {});
  const aTerre = await PA(() => [...document.querySelectorAll('.h-noms span:not([hidden])')].map((s) => s.textContent).join());
  await A.waitForFunction((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).vivant, idB, { timeout: 10000 }).catch(() => {});
  await B.waitForFunction((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).vivant, idB, { timeout: 5000 }).catch(() => {});
  check(/à terre/.test(aTerre) && await PB((id) => window.__zombies.jeu.joueurs.find((p) => p.id === id).vivant, idB), `Bob tombe (« ${aTerre} ») : Alice reste près de lui, il se relève`);
  // tout le monde à terre : la fin ; l'hôte peut relancer, Bob attend
  await PA(() => { for (const p of window.__zombies.jeu.joueurs) { p.vie = 0; p.vivant = false; } });
  await B.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  await A.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  const fin = [await PA(() => ({ e: document.body.dataset.ecran, rejouer: !document.querySelector('#b-rejouer').hidden })), await PB(() => ({ e: document.body.dataset.ecran, rejouer: !document.querySelector('#b-rejouer').hidden, attente: !document.querySelector('.fin-attente').hidden }))];
  check(fin[0].e === 'fin' && fin[1].e === 'fin' && fin[0].rejouer && !fin[1].rejouer && fin[1].attente, 'tout le monde à terre : la fin chez les deux ; Alice peut relancer, Bob attend l’hôte');
  await A.tap('#b-rejouer');
  await B.waitForFunction(() => document.body.dataset.ecran === 'jeu' && !window.__zombies.jeu.fini, null, { timeout: 10000 }).catch(() => {});
  check(await PB(() => document.body.dataset.ecran === 'jeu' && !window.__zombies.jeu.fini), '« Rejouer ensemble » : une nouvelle partie démarre chez Bob aussi');
  // ─── le duel : le même salon relance en mode duel ; Bob tombe, Alice gagne et monte de division ───
  await PA(() => { window.__zombies.modeSalon = 'duel'; for (const p of window.__zombies.jeu.joueurs) { p.vie = 0; p.vivant = false; } });
  await A.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  await A.tap('#b-rejouer');
  await B.waitForFunction(() => window.__zombies.jeu && window.__zombies.jeu.mode === 'duel' && !window.__zombies.jeu.fini, null, { timeout: 10000 }).catch(() => {});
  check(await PB(() => window.__zombies.jeu.mode === 'duel') && await PA(() => window.__zombies.jeu.mode === 'duel'), 'le duel démarre chez les deux');
  await PA((id) => { const j = window.__zombies.jeu, b = j.joueurs.find((p) => p.id === id); b.vie = 0; b.vivant = false; }, idB);
  await A.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  await B.waitForFunction(() => document.body.dataset.ecran === 'fin', null, { timeout: 10000 }).catch(() => {});
  const duel = [await PA(() => ({ t: document.querySelector('.fin-titre').textContent, d: window.__zombies.save.duel, r: document.querySelector('.fin-record').textContent })), await PB(() => ({ t: document.querySelector('.fin-titre').textContent, d: window.__zombies.save.duel }))];
  check(/Duel gagné/.test(duel[0].t) && duel[0].d.points === 25 && /Bronze/.test(duel[0].r) && /gagne/.test(duel[1].t) && duel[1].d.defaites === 1, `Bob tombe : « ${duel[0].t} » chez Alice (${duel[0].r}), « ${duel[1].t} » chez Bob`);
  check(errors.length === 0, `aucune erreur dans les pages${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s) (Dernier Rempart, coop)` : '\nTout passe (Dernier Rempart, coop).');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
