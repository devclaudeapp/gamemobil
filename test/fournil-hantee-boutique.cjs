// La boutique hantée (src/boutiquehantee.js) sur la vraie page du Fournil, téléphone en portrait (390 × 844), le mercredi 28 octobre 2026
// (la Maison hantée est ouverte) : avec ?boutique=1, l'écran de la Maison hantée montre la VRAIE scène de la boutique, au thème « hantee »
// (src/vie.js, DECORS.hantee), au lieu du Manoir. On vérifie : la scène tourne avec le thème ; les clients sont déguisés ; les apprentis
// sont l'équipe du Manoir, aux postes embauchés (les trois plus avancés), chacun dans son costume ; les cartes restent dans la liste de
// l'écran ; le retour à la boutique est propre (sa vie, son thème, ses clients sans costume, son tiroir) ; sans ?boutique=1, le Manoir
// habituel ; les budgets d'appels de dessin (éco ≤ 72, haute ≤ 80, tout le mobilier au max et les huit postes) ; trois allers-retours
// sans que la mémoire monte (géométries et textures) ; aucune erreur dans la page. Captures éco et haute, jour et soir.
// Captures dans test/shots/hantee-boutique/ (et dans le dossier donné par SHOTS_HANTEE_BOUTIQUE).
// Lancer : node build.js && NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-hantee-boutique.cjs
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), PORT = +process.env.PORT_HANTEE_BOUTIQUE || 8962;
const out = path.join(__dirname, 'shots', 'hantee-boutique'); fs.mkdirSync(out, { recursive: true });
const out2 = process.env.SHOTS_HANTEE_BOUTIQUE ? (fs.mkdirSync(process.env.SHOTS_HANTEE_BOUTIQUE, { recursive: true }), process.env.SHOTS_HANTEE_BOUTIQUE) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const DEPART = new Date('2026-10-28T11:00:00+01:00').getTime(), decal = DEPART - Date.now(), vrai = () => Date.now() + decal;
const demandes = [];
const server = http.createServer((req, res) => {
  res.setHeader('Date', new Date(vrai()).toUTCString());
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p.includes('/hd/')) demandes.push(p);
  if (req.method === 'HEAD') { res.writeHead(200); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(200); } return false; };
const EQUIPE = ['fantome2', 'momie2', 'squelette', 'vampire2', 'sorciere2', 'citrouille', 'loupgarou', 'dragonne'];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }); // WebGL2 : la HD en haute
  async function ouvrir(requete) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript((d) => { const D = Date; class F extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + d); } static now() { return D.now() + d; } } window.Date = F; }, decal);
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(), erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_|supabase|404/.test(m.text() + (m.location() && m.location().url))) erreurs.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/fournil/${requete}`); await page.waitForFunction(() => window.__fournil && window.__fournil.st, null, { timeout: 30000 }); await sleep(900);
    const ev = (fn, arg) => page.evaluate(fn, arg);
    const fermerFeuille = () => ev(() => { const b = document.querySelector('#feuille [data-a="pq-tard"], #feuille [data-a="close"], #feuille [data-a="pq-ok"]'); if (b) b.click(); });
    // la Maison hantée déjà annoncée, cinq postes ouverts (le 4e sans son monstre), cinq paliers franchis
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.annonce = true; q.billets = 5e9; q.total = 2e12;
      [[60, 1], [40, 1], [25, 1], [12, 0], [6, 1]].forEach(([n, s], i) => { q.postes[i].niv = n; q.postes[i].staff = !!s; q.postes[i].actif = !!s; }); q.paliers = [1, 2, 3, 4, 5]; F.save(); });
    await fermerFeuille(); await sleep(300); await fermerFeuille();
    return { ctx, page, erreurs, ev };
  }
  const shot = async (page, nom) => { await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = 'hidden'; }); const f = path.join(out, nom + '.png'); await page.screenshot({ path: f }); if (out2) fs.copyFileSync(f, path.join(out2, nom + '.png')); await page.evaluate(() => { for (const t of document.querySelectorAll('.toast')) t.style.visibility = ''; }); };
  const decorAppels = (ev) => ev(() => { const a = window.__fournil.SCENE.appelsParGroupe; let decor = 0; for (const [k, v] of Object.entries(a)) if (k !== 'acteurs' && k !== 'chat') decor += v; return { decor, a }; });
  const vue = (ev) => ev(() => { const S = window.__fournil.SCENE, el = document.querySelector('#hantee'); return { ev: S.evenement, stats: S.stats, ouvert: !el.hidden, ecran: el.dataset.ecran, classe: el.classList.contains('ht-boutique'), corps: document.body.classList.contains('ht-boutique'), cartes: document.querySelectorAll('#ht-cartes .carte').length, tiroir: getComputedStyle(document.querySelector('#tiroir')).visibility, canvasManoir: getComputedStyle(document.querySelector('#ht-canvas')).visibility, clientsVie: VIE.clients.map((c) => c.deg || ''), mode: VIE.mode, theme: VIE.Q.id, t: VIE.t }; });
  const memoire = (ev) => ev(() => { const s = window.__fournil.SCENE.stats; return { g: s.geometries, t: s.textures }; });

  for (const qual of ['eco', 'haute']) {
    console.log(`── qualité ${qual} : la Maison hantée dans la boutique (?boutique=1) ──`);
    demandes.length = 0;
    const { ctx, page, erreurs, ev } = await ouvrir(`?qualite=${qual}&boutique=1`);
    await ev(() => window.__fournil.scene({ heure: 11 }));
    const avant = await vue(ev);
    check(avant.theme !== 'hantee' && !avant.ev && avant.mode === '', `la boutique d'abord, à son thème (${avant.theme})`);
    await ev(() => document.querySelector('#b-hantee').click()); // l'icône citrouille du coin
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati) && e.clients > 0; }), 30000), 'l’icône citrouille ouvre la Maison hantée : la scène de la boutique bascule sur l’événement, l’équipe est à son poste, des clients entrent');
    if (qual === 'haute') check(await attendre(() => ev(() => window.__fournil.SCENE.evenement.hd), 60000), 'en haute, les bougies et les lanternes cuites (lot « boutiqueHantee ») arrivent');
    await sleep(1500);
    let v = await vue(ev);
    check(v.ouvert && v.ecran === 'manoir' && v.classe && v.corps, `l’écran de la Maison hantée est ouvert en mode boutique (écran ${v.ecran}, classes posées)`);
    check(v.ev.theme === 'hantee' && v.mode === 'hantee' && v.stats.webgl && v.stats.calls > 0, `la scène tourne au thème « hantee » (${v.stats.calls} appels de dessin, vie en mode ${v.mode})`);
    const t0 = v.t; await sleep(1200); const t1 = (await vue(ev)).t;
    check(t1 > t0 + 0.1, `la vie de la boutique hantée avance (${t0.toFixed(1)} s → ${t1.toFixed(1)} s)`);
    check(v.canvasManoir === 'hidden' && v.tiroir === 'hidden', `le canvas du Manoir et le tiroir de la boutique sont masqués (${v.canvasManoir}, ${v.tiroir})`);
    check(v.cartes === 9, `les cartes des friandises (8) et la recette du jour restent dans la liste de l’écran (${v.cartes})`);
    check(v.ev.decos.length === 4 && v.ev.bougies >= 5 && v.ev.compagnon === 'chat-noir' && v.ev.tenue === 'hantee', `le décor : ${v.ev.decos.join(', ')}, ${v.ev.bougies} bougies, le chat noir, le boulanger en tenue d’Halloween`);
    check(v.clientsVie.length > 0 && v.clientsVie.every((d) => ['sorciere', 'vampire', 'fantome', 'momie'].includes(d)) && v.ev.deguises === v.ev.clients, `les clients sont déguisés (${v.clientsVie.join(', ')}) et bâtis déguisés (${v.ev.deguises}/${v.ev.clients})`);
    const ids = v.ev.apprentis.map((a) => a.i).sort();
    check(JSON.stringify(ids) === '[1,2,4]' && v.ev.apprentis.every((a) => a.costume === EQUIPE[a.i]), `les apprentis : les monstres des trois postes embauchés les plus avancés (postes ${ids.join(', ')} : ${v.ev.apprentis.map((a) => a.costume).join(', ')}), pas celui du poste sans monstre`);
    // embaucher le monstre du 4e poste : il prend la place du moins avancé
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); q.postes[3].staff = true; q.postes[3].actif = true; });
    check(await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return JSON.stringify(e.apprentis.map((a) => a.i).sort()) === '[2,3,4]' && e.apprentis.every((a) => a.bati); }), 15000), 'un monstre embauché arrive à son poste (Comte Vladimir, le vampire), le moins avancé laisse sa place');
    await shot(page, `hantee-${qual}-jour`);
    await ev(() => window.__fournil.scene({ heure: 20.5 })); await sleep(qual === 'haute' ? 2500 : 1500);
    await shot(page, `hantee-${qual}-soir`);
    await ev(() => window.__fournil.scene({ heure: 11 }));

    // le budget : tout le mobilier au max, les huit postes ouverts et embauchés, tous les paliers ; des clients assis partout
    await ev(() => { const F = window.__fournil, q = F.evHantee.R.etat(F.st, HORLOGE.maintenant()); for (const m of F.G.MOBILIER) F.st.mobilier[m.id] = m.max; q.postes.forEach((s) => { s.niv = Math.max(s.niv, 30); s.staff = true; s.actif = true; }); q.paliers = Array.from({ length: 20 }, (x, i) => i + 1); });
    await sleep(qual === 'haute' ? 3500 : 2000);
    await ev(() => { for (const z of ['bar', 'banquette', 'terrasse', 'table']) window.__fournil.SCENE.installer(z, 600); }); await sleep(1500);
    let pire = { decor: 0 };
    for (const h of [11, 20.5]) { await ev((h) => window.__fournil.scene({ heure: h }), h); await sleep(qual === 'haute' ? 1800 : 900); const a = await decorAppels(ev); if (a.decor > pire.decor) pire = Object.assign({ h }, a); }
    const max = qual === 'haute' ? 80 : 72;
    check(pire.decor <= max, `${qual}, la boutique hantée au complet : au pire (${pire.h} h) ${pire.decor} appels de dessin pour le décor (≤ ${max}) — ${Object.entries(pire.a).filter(([k]) => /^ht|hantee|produits|deco$/.test(k)).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    await shot(page, `hantee-${qual}-complet`);
    await ev(() => window.__fournil.scene({ heure: 11 }));

    // le retour à la boutique : propre
    await ev(() => document.querySelector('#hantee [data-pq="fermer"]').click());
    await attendre(() => ev(() => !window.__fournil.SCENE.evenement && VIE.Q.id !== 'hantee' && !window.__fournil.SCENE.appelsParGroupe.hantee), 20000); await sleep(600); // (la boucle de la boutique reprend la scène à l'image suivante)
    v = await vue(ev);
    check(!v.ouvert && !v.ev && v.mode === '' && v.theme !== 'hantee' && !v.classe && !v.corps && v.tiroir === 'visible', `le retour : la boutique reprend son thème (${v.theme}), sa vie (mode « ${v.mode} »), son tiroir ; plus de classes du mode hanté`);
    check(v.clientsVie.every((d) => !d), `plus aucun client déguisé dans la boutique (${v.clientsVie.length} clients)`);
    const ap = await decorAppels(ev), maxB = qual === 'haute' ? 80 : 72;
    check(ap.decor <= maxB && !ap.a.hantee, `la boutique au retour : ${ap.decor} appels pour le décor (≤ ${maxB}), sans le décor hanté`);
    await shot(page, `hantee-${qual}-retour`);

    // trois allers-retours : la mémoire ne monte pas (les géométries et les textures, mesurées dans la boutique, au retour)
    const mems = [];
    for (let k = 1; k <= 3; k++) {
      await ev(() => window.__fournil.hantee()); await attendre(() => ev(() => { const e = window.__fournil.SCENE.evenement; return !!e && e.apprentis.length >= 3 && e.apprentis.every((a) => a.bati); }), 20000); await sleep(1200);
      const e = await ev(() => window.__fournil.SCENE.evenement);
      const tot = await ev(() => { const F = window.__fournil; F.fermerHantee(); const n = VIE.clients.length; // une vente et un habitué dans la même image, avant toute frame de la boutique (la boucle de ui.js vend avant de dessiner)
        for (let j = 0; j < 4; j++) F.SCENE.vente(0, 10, '+10', true); VIE.habitue({ id: 'essai-retour', nom: 'Essai', haut: '#88AACC', cheveux: '#553322', peau: '#F1C7A5', coiffure: 1 });
        return { mode: VIE.mode, vueEv: !!VIE.vueEv, theme: VIE.Q && VIE.Q.id, nouveaux: VIE.clients.slice(n).map((c) => c.deg || '') }; });
      if (k === 1) check(tot.mode === '' && !tot.vueEv && tot.theme !== 'hantee' && tot.nouveaux.length > 0 && tot.nouveaux.every((d) => !d), `fermer puis vendre dans la même image : les clients entrent sans costume (${tot.nouveaux.length} : « ${tot.nouveaux.join('», «')} »), au thème ${tot.theme}`);
      await attendre(() => ev(() => VIE.Q.id !== 'hantee' && !window.__fournil.SCENE.appelsParGroupe.hantee), 20000); await sleep(900);
      const m = await memoire(ev); mems.push(m); console.log(`        aller-retour ${k} : ${e.clients} clients déguisés bâtis, ${e.apprentis.length} monstres ; au retour ${m.g} géométries, ${m.t} textures`);
    }
    check(mems[2].t <= mems[0].t && mems[2].g <= mems[0].g + 6, `trois allers-retours : la mémoire est stable (géométries ${mems.map((m) => m.g).join(' → ')}, textures ${mems.map((m) => m.t).join(' → ')})`);
    if (qual === 'eco') check(!demandes.some((p) => /hantee2/.test(p)), `en éco, aucun modèle cuit de la boutique hantée demandé (${demandes.filter((p) => /hantee2/.test(p)).length})`);
    else { const n = demandes.filter((p) => /hantee2/.test(p)).length; check(n === 4, `en haute, les quatre modèles cuits demandés une seule fois (${n})`); }
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  console.log('── sans ?boutique=1 : le Manoir habituel ──');
  {
    const { ctx, ev, erreurs } = await ouvrir('?qualite=eco');
    await ev(() => window.__fournil.hantee()); await sleep(1500);
    const v = await vue(ev), calls = await ev(() => { const s = window.__fournil.evHantee.scene; return s ? s.calls : 0; });
    check(v.ouvert && !v.classe && !v.ev && v.mode === '' && v.canvasManoir === 'visible' && calls > 0, `le Manoir a son propre décor 3D (${calls} appels), la boutique n’est pas touchée`);
    await ev(() => window.__fournil.fermerHantee()); await sleep(500);
    check(erreurs.length === 0, `aucune erreur dans la page (${erreurs.slice(0, 3).join(' | ')})`);
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est vert.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
