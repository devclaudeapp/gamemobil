// Les récompenses du podium du classement du Fournil (contrat v2), dans la vraie page (fournil/ servie en local), sur un téléphone en portrait.
// Supabase est SIMULÉ : page.route sur https://jklbitrlkfrktmnarejc.supabase.co/rest/v1/rpc/* répond comme les fonctions du contrat v2
// (fournil_publier, fournil_classement, fournil_retirer, fournil_recompenses, fournil_heure), avec un petit classement en mémoire.
// Parcours : un joueur inscrit, 2e la semaine passée (et 1er, 3e plus tôt) ; l'annonce au lancement (une seule fois) ; la tenue et la coupe
// d'argent portées d'office, la vitrine des trophées avec ses trois coupes ; la toque à côté des pseudos ; « Mes récompenses » : la collection,
// le choix de la tenue (or, aucune, automatique) ; toucher la vitrine ; la Salle de jeux ; quitter (tout reste) ; un podium plus ancien (rien
// d'office) ; 360 × 640 ; l'artefact Claude sans classement.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-recompenses.cjs   (captures dans test/shots/recompenses/ ; PORT_RECOMPENSES pour changer de port)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const CL = require('../src/classement.js');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_RECOMPENSES || 8798, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>vide</title>'); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'recompenses'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(100); } return false; };

// ─── le faux Supabase, contrat v2 ───
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const lundi = () => CL.lundiParis(Date.now()), semaineAvant = (k) => CL.decalerSemaine(lundi(), -k);
const faux = { joueurs: new Map(), palmares: [], appels: [] }; // palmares : [{ semaine, rang, id, pseudo, valeur }]
const MOI = { id: crypto.randomUUID(), jeton: crypto.randomBytes(32).toString('hex'), pseudo: 'Paulo' };
function semer() {
  faux.joueurs.clear(); faux.palmares = []; faux.appels.length = 0;
  const noms = ['Mamie Jo', 'Tonton Brioche', 'Petit Levain', 'Chef Fougasse', 'Super Éclair'];
  noms.forEach((pseudo, i) => { const id = crypto.randomUUID(); faux.joueurs.set(id, { jeton: sha('x' + i), pseudo, sommet: 1e12, total: 9e9 / (i + 1), gain: 3e8 / (i + 1), semaine: lundi(), maj: 0 }); if (i === 0) faux.palmares.push({ semaine: semaineAvant(1), rang: 1, id, pseudo, valeur: 4e8 }); if (i === 1) faux.palmares.push({ semaine: semaineAvant(1), rang: 3, id, pseudo, valeur: 1e8 }); });
  faux.joueurs.set(MOI.id, { jeton: sha(MOI.jeton), pseudo: MOI.pseudo, sommet: 1e6, total: 2e9, gain: 1e8, semaine: lundi(), maj: 0 });
  faux.palmares.push({ semaine: semaineAvant(1), rang: 2, id: MOI.id, pseudo: MOI.pseudo, valeur: 2e8 }, { semaine: semaineAvant(3), rang: 1, id: MOI.id, pseudo: MOI.pseudo, valeur: 5e8 }, { semaine: semaineAvant(5), rang: 3, id: MOI.id, pseudo: MOI.pseudo, valeur: 9e7 });
}
const podiumDe = (id, semaine) => { const p = faux.palmares.find((x) => x.id === id && x.semaine === semaine); return p ? p.rang : null; };
const RPC = {
  fournil_publier: (c) => {
    const j = faux.joueurs.get(c.p_id), l = lundi();
    if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' };
    if (!j) { faux.joueurs.set(c.p_id, { jeton: sha(c.p_jeton), pseudo: c.p_pseudo, sommet: c.p_fortune, total: 0, gain: 0, semaine: l, maj: Date.now() }); return { ok: true, erreur: null, rang_semaine: faux.joueurs.size, rang_total: faux.joueurs.size, joueurs: faux.joueurs.size, semaine: l, compte: 0, plafonne: false }; }
    if (j.semaine !== l) { j.gain = 0; j.semaine = l; }
    const compte = Math.max(0, c.p_fortune - j.sommet); j.sommet = Math.max(j.sommet, c.p_fortune); j.total += compte; j.gain += compte; j.pseudo = c.p_pseudo; j.maj = Date.now();
    const tous = [...faux.joueurs.values()];
    return { ok: true, erreur: null, rang_semaine: tous.filter((a) => a.semaine === l && a.gain > j.gain).length + 1, rang_total: tous.filter((a) => a.total > j.total).length + 1, joueurs: tous.length, joueurs_total: tous.length, joueurs_semaine: tous.filter((a) => a.semaine === l).length, semaine: l, compte, plafonne: false };
  },
  fournil_classement: (c) => {
    const l = lundi(), semaine = c.p_periode === 'semaine';
    const v = [...faux.joueurs.entries()].filter(([, a]) => !semaine || a.semaine === l).map(([id, a]) => ({ id, pseudo: a.pseudo, valeur: semaine ? a.gain : a.total, podium: podiumDe(id, semaineAvant(1)) }));
    v.sort((a, b) => b.valeur - a.valeur); v.forEach((x) => { x.rang = v.filter((y) => y.valeur > x.valeur).length + 1; });
    const moi = v.find((x) => x.id === c.p_id);
    return { semaine: l, periode: c.p_periode, joueurs: v.length, lignes: v.slice(0, 50).map((x) => ({ rang: x.rang, pseudo: x.pseudo, valeur: x.valeur, moi: x.id === c.p_id, podium: x.podium })), moi: moi ? { rang: moi.rang, valeur: moi.valeur, podium: moi.podium } : null };
  },
  fournil_retirer: (c) => { const j = faux.joueurs.get(c.p_id); if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' }; faux.joueurs.delete(c.p_id); faux.palmares = faux.palmares.filter((p) => p.id !== c.p_id); return { ok: true, erreur: null }; },
  fournil_recompenses: (c) => {
    const j = faux.joueurs.get(c.p_id); if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton', podiums: [], derniere: null };
    const podium = faux.palmares.filter((p) => p.semaine === semaineAvant(1)).sort((a, b) => a.rang - b.rang).map((p) => ({ rang: p.rang, pseudo: p.pseudo, valeur: p.valeur }));
    return { ok: true, erreur: null, podiums: j ? faux.palmares.filter((p) => p.id === c.p_id).sort((a, b) => (a.semaine < b.semaine ? -1 : 1)).map((p) => ({ semaine: p.semaine, rang: p.rang })) : [], derniere: podium.length ? { semaine: semaineAvant(1), podium } : null };
  },
  fournil_heure: () => ({ ms: Date.now() }),
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1]; let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps });
  if (!RPC[nom] || !corps) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) });
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps)) });
}
const etatInscrit = (rec) => JSON.stringify({ ...CL.etatNeuf(), id: MOI.id, jeton: MOI.jeton, pseudo: MOI.pseudo, rejoint: true, essai: 0, dernierEnvoi: 0, valeur: null, ...(rec ? { recompenses: rec } : {}) });

(async () => {
  const browser = await chromium.launch();
  { const nc = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await nc(o); await c.addInitScript(() => { window.__sansQuartier = true; }); return c; }; } // pendant sa fenêtre, l'événement « Le Quartier » (icône, annonce) ne vient pas couvrir ce test (src/evenement.js)
  const errors = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET_DISCONNECTED|ERR_FAILED|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  const nouveau = async (w, h) => { const ctx = await browser.newContext({ viewport: { width: w || 390, height: h || 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' }); await ctx.route(SUPA + '/rest/v1/rpc/*', gerer); const p = await ctx.newPage(); suivre(p); return { ctx, p }; };
  const preparer = async (p, etat) => { await p.goto(BASE + '/vide.html'); await p.evaluate((e) => { localStorage.clear(); localStorage.setItem('fournil.classement', e); }, etat); };
  const local = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('fournil.classement') || 'null'));
  const feuille = (p) => p.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const vues = (p) => p.evaluate(() => window.__fournil.SCENE.recompensesVues);
  const installer = (p) => p.evaluate(() => { const f = window.__fournil, G = f.G, st = f.st; f.give(1e12); for (let i = 1; i < 4; i++) G.acheter(st, i); for (let i = 0; i < 3; i++) G.embaucher(st, i); for (const m of G.MOBILIER) while (G.mobilierCran(st, m.id) < m.max) f.meuble(m.id); st.tuto = 99; f.scene({ heure: 13, assis: true }); });

  // ─── 1. un podium la semaine passée : l'annonce au lancement ───
  semer();
  let { ctx, p } = await nouveau();
  await preparer(p, etatInscrit());
  await p.goto(BASE + '/fournil/?qualite=haute');
  check(await attendre(() => p.evaluate(() => !!document.querySelector('#feuille-contenu [data-cl="annonce"]')), 8000), 'au lancement : fournil_recompenses lu, l’annonce s’ouvre');
  const ar = faux.appels.find((a) => a.nom === 'fournil_recompenses');
  check(ar && ar.corps.p_id === MOI.id && ar.corps.p_jeton === MOI.jeton && Object.keys(ar.corps).length === 2, 'fournil_recompenses(p_id, p_jeton)');
  await sleep(900);
  const an = await p.evaluate(() => { const f = document.querySelector('#feuille-contenu'), c = f.querySelector('.rec-coupe svg'), ray = f.querySelector('.rec-rayons'); return { h2: f.querySelector('h2').textContent, phrase: f.querySelector('.rec-phrase').textContent, sous: f.querySelector('.sous').textContent, anim: c ? getComputedStyle(c).animationName : '', rayons: ray ? getComputedStyle(ray).animationName : '', metal: f.querySelector('.rec-scene').className, boutons: [...f.querySelectorAll('button')].map((b) => [b.innerText.trim(), Math.round(b.getBoundingClientRect().height)]) }; });
  check(an.h2 === 'Bravo ! 2e de la semaine' && an.phrase === 'La tenue d’argent et la coupe d’argent sont à toi.', `l’annonce : « ${an.h2} » « ${an.phrase} »`);
  check(/ton boulanger porte la tenue d’argent cette semaine/.test(an.sous) && /Et 2 autres podiums t’attendaient/.test(an.sous), 'la suite : la tenue portée cette semaine, la coupe sur le comptoir, et les deux autres podiums retrouvés');
  check(/jaillit/.test(an.anim) && an.rayons === 'rayons' && /argent/.test(an.metal) && an.boutons.length === 2 && an.boutons.every(([, h]) => h >= 44), `un petit effet (la coupe jaillit, les rayons tournent, ${an.boutons.map(([t]) => t).join(' / ')})`);
  check((await local(p)).recompenses.vu === semaineAvant(1) && (await local(p)).recompenses.podiums.length === 3, 'l’annonce est notée (vu = la semaine passée), les trois podiums écrits sur le téléphone');
  await p.screenshot({ path: out + '/01-annonce.png' });

  // ─── 2. la boutique : tenue et coupe d'argent, la vitrine des trophées ───
  check(JSON.stringify(await vues(p)) === JSON.stringify({ tenue: 'argent', coupe: 'argent', coupes: 3 }), 'dans la boutique : le boulanger en tenue d’argent, la coupe d’argent sur le comptoir, trois coupes dans la vitrine');
  await p.tap('[data-a="rec-voir"]'); await sleep(400);
  check(await p.evaluate(() => document.querySelector('#feuille').hidden && window.__fournil.tiroir() === 'ferme'), '« Voir ma boutique » : la feuille se ferme, le tiroir se replie sur la boutique');
  await installer(p); await sleep(2200);
  await p.locator('#scene-wrap').screenshot({ path: out + '/02-boutique-argent.png' });
  const zone = await p.evaluate(() => { const b = document.querySelector('#scene').getBoundingClientRect(), z = window.__fournil.SCENE.zones().boulanger; return { x: b.left + z.x - 20, y: b.top + z.y - 10, width: z.w + 70, height: z.h + 50 }; });
  await p.screenshot({ path: out + '/03-comptoir-coupe.png', clip: zone });
  const mAvec = await p.evaluate(() => window.__fournil.SCENE.maillagesRecompenses);
  await p.evaluate(() => window.__fournil.SCENE.recompenses({})); await sleep(600);
  const mSans = await p.evaluate(() => window.__fournil.SCENE.maillagesRecompenses);
  check(mAvec.coupe === 1 && mAvec.trophees === 1 && mSans.coupe === 0 && mSans.trophees === 0 && mAvec.boulanger === mSans.boulanger, `budget du rendu : la coupe 1 maillage, la vitrine et ses trois coupes 1 maillage (1 appel de dessin chacun, + leur ombre) ; le boulanger en tenue garde ses ${mAvec.boulanger} maillages`);
  await p.evaluate(() => { const r = window.__fournil.classement().recompenses(); window.__fournil.SCENE.recompenses({ tenue: r.portee, coupe: r.coupe, coupes: r.coupes }); }); await sleep(600);
  check((await vues(p)).coupes === 3, 'les récompenses reviennent dans la boutique');

  // ─── 3. la feuille du classement : « Mes récompenses » et les toques ───
  await p.evaluate(() => window.__fournil.feuilleClassement('semaine'));
  await attendre(() => p.evaluate(() => !!document.querySelector('#feuille .cl-liste')));
  await sleep(300);
  const cl = await p.evaluate(() => ({ entree: (document.querySelector('[data-a="cl-recompenses"]') || {}).innerText || '', h: Math.round((document.querySelector('[data-a="cl-recompenses"]') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height), toques: [...document.querySelectorAll('#feuille .cl-ligne')].filter((l) => l.querySelector('.cl-toque')).map((l) => [l.querySelector('.cl-nom > span').textContent, l.querySelector('.cl-toque').className.split(' ')[1], l.classList.contains('moi')]) }));
  check(/Mes récompenses/.test(cl.entree) && /3 coupes · toque d’argent/.test(cl.entree) && cl.h >= 48, `l’entrée « Mes récompenses » en tête de la feuille : « ${cl.entree.replace(/\n/g, ' · ')} »`);
  check(cl.toques.length === 3 && cl.toques.some(([n, m, moi]) => n === 'Paulo' && m === 'argent' && moi) && cl.toques.some(([n, m]) => n === 'Mamie Jo' && m === 'or') && cl.toques.some(([n, m]) => n === 'Tonton Brioche' && m === 'bronze'), 'la toque à côté des pseudos : la sienne (celle qu’il porte), celle du podium de la semaine passée pour les autres : ' + cl.toques.map(([n, m]) => `${n} (${m})`).join(', '));
  await p.screenshot({ path: out + '/04-classement-toques.png' });

  // ─── 4. la collection, et la tenue qui se choisit dans la garde-robe (pièce par pièce) ───
  // chaque podium a mis ses quatre pièces dans la garde-robe du jeu (sauvegarde fournil.v2) ; celles du podium de la semaine passée sont portées d'office
  const gr = await p.evaluate(() => { const f = window.__fournil, G = f.G, g = G.garderobe(f.st); return { n: Object.keys(g.objets).filter((id) => G.GARDEROBE.objets[id].collection !== 'base').length, equipe: g.equipe, ens: G.ensembleComplet(f.st) }; });
  check(gr.n === 12 && gr.ens === 'argent' && JSON.stringify(gr.equipe) === JSON.stringify({ tete: 'argent-toque', haut: 'argent-tablier', pieds: 'argent-chaussures', accessoire: 'argent-foulard' }), 'la garde-robe du jeu : les douze pièces des trois podiums (or, argent, bronze), la tenue d’argent portée d’office (ensemble complet)');
  await p.tap('[data-a="cl-recompenses"]'); await sleep(400);
  const col = await p.evaluate(() => ({ cartes: [...document.querySelectorAll('.rec-carte')].map((c) => c.innerText.replace(/\s+/g, ' ').trim()), apercu: (document.querySelector('.rec-apercu') || {}).innerText || '', btn: document.querySelector('[data-a="rec-garderobe"]') ? Math.round(document.querySelector('[data-a="rec-garderobe"]').getBoundingClientRect().height) : 0, large: document.querySelector('#feuille').scrollWidth <= document.querySelector('#feuille').clientWidth + 1 }));
  check(col.cartes.length === 3 && /^2e Coupe et tenue d’argent Semaine du/.test(col.cartes[0]) && /^1er Coupe et tenue d’or/.test(col.cartes[1]) && /^3e Coupe et tenue de bronze/.test(col.cartes[2]), 'la collection : chaque coupe et sa tenue, avec sa semaine (la plus récente d’abord) : ' + col.cartes.join(' | '));
  check(/Il porte la toque d’argent : toque d’argent, tablier d’argent, chaussures d’argent, foulard d’argent\./.test(col.apercu) && col.btn >= 44 && col.large, `« ${col.apercu} », et le bouton « Ouvrir la garde-robe »`);
  await p.screenshot({ path: out + '/05-collection.png' });
  await p.tap('[data-a="rec-garderobe"]'); await sleep(500);
  const choix = await p.evaluate(() => [...document.querySelectorAll('[data-gr-porter]')].map((b) => [b.dataset.grPorter, b.getAttribute('aria-pressed'), Math.round(b.getBoundingClientRect().height)]));
  check(JSON.stringify(choix.map((c) => c[0])) === JSON.stringify(['toque-blanche', 'or-toque', 'argent-toque', 'bronze-toque']) && choix[2][1] === 'true' && choix.every((c) => c[2] >= 44), 'la garde-robe, « Tête » : toque blanche, d’or, d’argent (portée), de bronze, des boutons d’au moins 44 px');
  await p.screenshot({ path: out + '/05b-garderobe-tete.png' });
  await p.tap('[data-gr-porter="or-toque"]'); await sleep(500);
  check(await p.evaluate(() => JSON.parse(localStorage.getItem('fournil.v2')).garderobe.equipe.tete === 'or-toque') && (await vues(p)).tenue === 'or' && (await vues(p)).coupe === 'argent' && await p.evaluate(() => document.querySelector('[data-gr-porter="or-toque"]').getAttribute('aria-pressed') === 'true'), 'porter la toque d’or : écrit sur le téléphone, le boulanger la porte aussitôt (la coupe de la semaine reste celle d’argent)');
  await p.tap('[data-a="gr-fermer"]').catch(() => {}); await p.evaluate(() => { document.querySelector('#voile').hidden = true; document.querySelector('#feuille').hidden = true; });
  await p.evaluate(() => window.__fournil.tiroir('ferme')); await sleep(900);
  await p.screenshot({ path: out + '/06-boulanger-or.png', clip: zone });
  await p.evaluate(() => window.__fournil.garderobe('tete')); await sleep(300);
  await p.tap('[data-gr-porter="toque-blanche"]'); await sleep(500);
  check((await vues(p)).tenue === null && await p.evaluate(() => window.__fournil.G.toqueMetal(window.__fournil.st) === null), 'la toque blanche : plus de toque de podium (les autres pièces d’argent restent)');
  await p.tap('[data-gr-porter="argent-toque"]'); await sleep(500);
  check((await vues(p)).tenue === 'argent' && await p.evaluate(() => window.__fournil.G.ensembleComplet(window.__fournil.st) === 'argent'), 'la toque d’argent : l’ensemble d’argent est de nouveau complet');
  await p.tap('[data-a="gr-fermer"]'); await sleep(200);
  await p.evaluate(() => window.__fournil.boulanger()); await sleep(400);
  check(await p.evaluate(() => /#D3DCE6/i.test(document.querySelector('#page-boulanger .boulanger-tete svg').outerHTML) && /Tenue d’argent/.test(document.querySelector('[data-garderobe] .compte').textContent)), 'la page Boulanger : le portrait porte la tenue d’argent, la carte Garde-robe dit « Tenue d’argent »');
  await p.evaluate(() => window.__fournil.page('boutique'));

  // ─── 5. toucher la vitrine des trophées dans la boutique ───
  await p.evaluate(() => { document.querySelector('#feuille').hidden = true; document.querySelector('#voile').hidden = true; window.__fournil.tiroir('ferme'); }); await sleep(700);
  const cible = await p.evaluate(() => { const s = document.querySelector('#scene').getBoundingClientRect(), W = s.width, f = window.__fournil.SCENE; for (let y = 30; y < 160; y += 4) for (let x = W * 0.6; x < W * 0.75; x += 4) if (f.hitTrophees(x, y)) return { x: s.left + x + 8, y: s.top + y + 8 }; return null; });
  if (cible) await p.touchscreen.tap(cible.x, cible.y); await sleep(500);
  check(!!cible && await p.evaluate(() => !!document.querySelector('#feuille-contenu [data-cl="recompenses"]')), 'toucher la vitrine des trophées ouvre « Mes récompenses »');
  await p.evaluate(() => { document.querySelector('#feuille').hidden = true; document.querySelector('#voile').hidden = true; });
  // le gros plan de la vitrine, pour l'œil (sans les clients qui passent devant)
  await p.evaluate(() => new Promise((ok) => { VIE.clients.length = 0; requestAnimationFrame(() => requestAnimationFrame(ok)); }));
  const zv = await p.evaluate(() => { const s = document.querySelector('#scene').getBoundingClientRect(); return { x: s.left + s.width * 0.55, y: s.top, width: s.width * 0.4, height: 130 }; });
  await p.screenshot({ path: out + '/07-vitrine-trophees.png', clip: zv });

  // ─── 6. relancer : l'annonce ne revient pas ───
  const n0 = faux.appels.length;
  await p.reload(); await sleep(2500);
  check(!(await p.evaluate(() => !!document.querySelector('#feuille-contenu [data-cl="annonce"]'))) && faux.appels.slice(n0).some((a) => a.nom === 'fournil_recompenses') && (await vues(p)).tenue === 'argent', 'relancé : les récompenses sont relues, l’annonce ne revient pas, la tenue d’argent reste');

  // ─── 7. la Salle de jeux ───
  await p.goto(BASE + '/?app=accueil'); await sleep(800);
  const salle = await p.evaluate(() => ({ txt: document.querySelector('[data-jeu="fournil"]').innerText, cls: (document.querySelector('[data-jeu="fournil"] .podium') || {}).className || '', large: document.documentElement.scrollWidth <= innerWidth + 1 }));
  check(/Podium : 2e la semaine dernière · coupe d’argent/.test(salle.txt) && /argent/.test(salle.cls) && salle.large, 'la Salle de jeux : « ' + (salle.txt.split('\n').find((l) => /Podium/.test(l)) || '?') + ' »');
  await p.screenshot({ path: out + '/08-salle-de-jeux.png' });

  // ─── 8. quitter le classement : les coupes et les tenues restent ───
  await p.goto(BASE + '/fournil/'); await sleep(1500);
  await p.evaluate(() => window.__fournil.classement().quitter()); await sleep(300);
  const apres = await local(p);
  check(apres.rejoint === false && apres.id === null && apres.recompenses.podiums.length === 3 && (await vues(p)).coupes === 3 && !faux.palmares.some((x) => x.id === MOI.id), 'quitter le classement : le serveur oublie le palmarès, le téléphone garde les trois coupes et la vitrine');
  await ctx.close();

  // ─── 9. un podium plus ancien (il y a deux semaines) : annoncé, mais rien d'office ───
  semer(); faux.palmares = faux.palmares.filter((x) => x.id !== MOI.id); faux.palmares.push({ semaine: semaineAvant(2), rang: 1, id: MOI.id, pseudo: MOI.pseudo, valeur: 1e9 });
  ({ ctx, p } = await nouveau(360, 640));
  await preparer(p, etatInscrit());
  await p.goto(BASE + '/fournil/');
  check(await attendre(() => p.evaluate(() => !!document.querySelector('#feuille-contenu [data-cl="annonce"]')), 8000), 'un podium d’il y a deux semaines, jamais annoncé : l’annonce s’ouvre');
  await sleep(900);
  const vieux = await p.evaluate(() => ({ h2: document.querySelector('#feuille-contenu h2').textContent, sous: document.querySelector('#feuille-contenu .sous').textContent, large: document.querySelector('#feuille').scrollWidth <= document.querySelector('#feuille').clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, bas: [...document.querySelectorAll('#feuille-contenu button')].every((b) => b.getBoundingClientRect().bottom <= innerHeight) }));
  check(vieux.h2 === 'Bravo ! 1er de la semaine' && /la coupe est dans ta vitrine/.test(vieux.sous) && !/cette semaine/.test(vieux.sous), '« ' + vieux.h2 + ' » : la coupe va dans la vitrine, la tenue dans la collection (pas d’office)');
  check(vieux.large && vieux.bas, 'à 360 × 640 : l’annonce tient dans l’écran, boutons compris, sans défilement de côté');
  await p.screenshot({ path: out + '/09-annonce-360.png' });
  check(JSON.stringify(await vues(p)) === JSON.stringify({ tenue: null, coupe: null, coupes: 1 }), 'la semaine d’après la suivante : tenue blanche, rien sur le comptoir, la coupe d’or dans la vitrine');
  await p.tap('[data-a="rec-collection"]'); await sleep(400);
  const c360 = await p.evaluate(() => ({ large: document.querySelector('#feuille').scrollWidth <= document.querySelector('#feuille').clientWidth + 1, cartes: document.querySelectorAll('.rec-carte').length, apercu: (document.querySelector('.rec-apercu') || {}).innerText || '', btn: !!document.querySelector('[data-a="rec-garderobe"]'), pieces: Object.keys(window.__fournil.G.garderobe(window.__fournil.st).objets).filter((id) => /^or-/.test(id)).length, equipe: window.__fournil.st.garderobe.equipe.tete }));
  check(c360.large && c360.cartes === 1 && /toque blanche/.test(c360.apercu) && c360.btn && c360.pieces === 4 && c360.equipe === 'toque-blanche', 'à 360 px, la collection : une coupe, la toque blanche portée, les quatre pièces d’or rangées dans la garde-robe (pas d’office), le bouton vers la garde-robe');
  await p.screenshot({ path: out + '/10-collection-360.png' });
  await ctx.close();

  // ─── 10. sans podium : rien n'est annoncé, pas d'entrée « Mes récompenses » ; l'artefact Claude : rien du tout ───
  semer(); faux.palmares = faux.palmares.filter((x) => x.id !== MOI.id);
  ({ ctx, p } = await nouveau());
  await preparer(p, etatInscrit());
  await p.goto(BASE + '/fournil/'); await sleep(2500);
  await p.evaluate(() => window.__fournil.feuilleClassement('semaine')); await attendre(() => p.evaluate(() => !!document.querySelector('#feuille .cl-liste')));
  check(!(await p.evaluate(() => !!document.querySelector('[data-cl="annonce"], [data-a="cl-recompenses"]'))) && JSON.stringify(await vues(p)) === JSON.stringify({ tenue: null, coupe: null, coupes: 0 }), 'sans podium : pas d’annonce, pas d’entrée « Mes récompenses », la boutique comme avant');
  await ctx.close();
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p4 = await c3.newPage(); suivre(p4); const n2 = faux.appels.length;
  await p4.goto(BASE + '/dist/artifact.html'); await sleep(1500);
  check(await p4.evaluate(() => window.__fournil.classement() === null && JSON.stringify(window.__fournil.SCENE.recompensesVues) === JSON.stringify({ tenue: null, coupe: null, coupes: 0 })) && faux.appels.length === n2, 'l’artefact Claude (sans config.js) : pas de classement, pas de récompenses, aucun appel');
  await c3.close();

  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  check(errors.length === 0, 'aucune erreur dans la page');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
