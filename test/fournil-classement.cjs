// Le classement en ligne du Fournil, dans la vraie page (fournil/ servie en local), sur un téléphone en portrait.
// Supabase est SIMULÉ : page.route sur https://jklbitrlkfrktmnarejc.supabase.co/rest/v1/rpc/* répond comme les fonctions du contrat v3
// (fournil_publier, fournil_classement, fournil_retirer, fournil_recompenses, fournil_heure), avec un faux classement en mémoire de 60 boulangers,
// classés en POINTS DE BOULANGER (ceux de la semaine, ceux depuis l'arrivée) ; l'argent gagné depuis l'arrivée suit, pour information ;
// chaque ligne porte le podium de la semaine passée. (Les plafonds du serveur se vérifient dans test/fournil-classement-sql.cjs.)
// Parcours : l'icône ronde du classement en haut à droite (et sa pastille de rang), rejoindre, pseudo pris, onglets, ses points de la semaine,
// sa ligne mise en avant, rang hors des 50, changer de pseudo, envoi en arrière-plan, envoi au lancement, la Salle de jeux qui montre le rang,
// quitter, hors ligne, pas encore ouvert, un serveur encore en v2, 320 px, l'artefact sans classement.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-classement.cjs   (captures dans test/shots/classement/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const CL = require('../src/classement.js');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_CLASSEMENT || 8783, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'classement'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* la page se recharge */ } await sleep(100); } return false; };

// ─── le faux Supabase : le contrat, en mémoire ───
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const faux = { joueurs: new Map(), palmares: new Map(), mode: 'normal', appels: [] }; // palmares : id → rang au podium de la semaine passée
const lundi = () => CL.lundiParis(Date.now());
const avant = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); };
{ // 60 boulangers : 45 ont joué cette semaine, 15 pas encore
  const A = ['Mamie', 'Tonton', 'Petit', 'Grand', 'Super', 'Chef', 'Mitron', 'Madame', 'Papy', 'Cousin'], B = ['Jo', 'Brioche', 'Levain', 'Fougasse', 'Chouquette', 'Éclair'];
  for (let i = 0; i < 60; i++) {
    const total = Math.round(4e9 * Math.pow(0.82, i)) + 1000, cetteSemaine = i % 4 !== 3, id = crypto.randomUUID(), ptsTotal = Math.max(2, Math.round(140 * Math.pow(0.93, i)));
    faux.joueurs.set(id, { jeton: sha('x' + i), pseudo: `${A[i % 10]} ${B[Math.floor(i / 10)]}`, sommet: total * 3, total, gain: cetteSemaine ? Math.round(total * (0.7 - ((i * 37) % 60) / 100)) : 0, semaine: cetteSemaine ? lundi() : avant(lundi()), maj: 0,
      points: cetteSemaine ? Math.max(1, Math.round(ptsTotal / 2)) : 0, ptsTotal });
    if (i < 3) faux.palmares.set(id, i + 1); // Mamie Jo, Tonton Jo, Petit Jo : le podium de la semaine passée
  }
}
function propre(p) { const v = CL.verifierPseudo(p); return v.ok ? v.pseudo : null; }
function rangs(id) {
  const l = lundi(), j = faux.joueurs.get(id); if (!j) return { rang_semaine: null, rang_total: null };
  const tous = [...faux.joueurs.values()];
  return { rang_semaine: j.semaine === l ? tous.filter((a) => a.semaine === l && a.points > j.points).length + 1 : null, rang_total: tous.filter((a) => a.ptsTotal > j.ptsTotal).length + 1, points_semaine: j.semaine === l ? j.points : null, points_total: j.ptsTotal };
}
function reponse(erreur, id) { const l = lundi(); return { ok: !erreur, erreur: erreur || null, version: faux.v2 ? undefined : 3, ...(erreur ? { rang_semaine: null, rang_total: null } : rangs(id)), joueurs: faux.joueurs.size, joueurs_total: faux.joueurs.size, joueurs_semaine: [...faux.joueurs.values()].filter((a) => a.semaine === l).length, semaine: l }; }
const ptsDe = (c) => (Number.isInteger(c.p_points) && c.p_lundi === lundi() ? Math.min(510, c.p_points) : null); // les points de la semaine du serveur (les vrais plafonds : test SQL)
const RPC = {
  fournil_publier: (c) => {
    if (!c.p_id || !/^[0-9A-Za-z_-]{32,128}$/.test(c.p_jeton || '')) return reponse('jeton');
    const pseudo = propre(c.p_pseudo); if (!pseudo) return reponse('pseudo_invalide');
    if (typeof c.p_fortune !== 'number' || !(c.p_fortune >= 0 && c.p_fortune <= 1e24)) return reponse('valeur');
    const j = faux.joueurs.get(c.p_id), l = lundi(), pris = (id) => [...faux.joueurs.entries()].some(([k, a]) => k !== id && a.pseudo.toLowerCase() === pseudo.toLowerCase());
    if (j) {
      if (j.jeton !== sha(c.p_jeton)) return reponse('jeton');
      if (Date.now() < j.maj + 10e3) return { ...reponse(null, c.p_id), ok: false, erreur: 'trop_vite' };
      if (pris(c.p_id)) return reponse('pseudo_pris');
      if (j.semaine !== l) { j.gain = 0; j.points = 0; j.semaine = l; }
      const compte = Math.max(0, c.p_fortune - j.sommet); // (le vrai serveur plafonne aussi par le temps réel écoulé : test/fournil-classement-sql.cjs)
      const p = faux.v2 ? null : ptsDe(c), pc = p == null ? 0 : Math.max(0, p - j.points);
      j.sommet = Math.max(j.sommet, c.p_fortune); j.total += compte; j.gain += compte; j.points += pc; j.ptsTotal += pc; j.pseudo = pseudo; j.maj = Date.now();
      return { ...reponse(null, c.p_id), compte, plafonne: false, points_comptes: pc, points_plafonnes: false };
    }
    if (pris(null)) return reponse('pseudo_pris');
    const p0 = faux.v2 ? 0 : ptsDe(c) || 0;
    faux.joueurs.set(c.p_id, { jeton: sha(c.p_jeton), pseudo, sommet: c.p_fortune, total: 0, gain: 0, semaine: l, maj: Date.now(), points: p0, ptsTotal: p0 }); // l'argent part de zéro à l'arrivée, les points de la semaine comptent
    return { ...reponse(null, c.p_id), compte: 0, plafonne: false, points_comptes: p0, points_plafonnes: false };
  },
  fournil_classement: (c) => {
    const l = lundi(), semaine = c.p_periode === 'semaine';
    const cle = faux.v2 ? 'valeur' : 'points'; // la version 2 classe à l'argent
    const v = [...faux.joueurs.entries()].filter(([, a]) => !semaine || a.semaine === l).map(([id, a]) => ({ id, pseudo: a.pseudo, points: semaine ? a.points : a.ptsTotal, valeur: semaine ? a.gain : a.total, podium: faux.palmares.get(id) || null }));
    v.sort((a, b) => b[cle] - a[cle] || a.pseudo.toLowerCase().localeCompare(b.pseudo.toLowerCase()));
    v.forEach((x) => { x.rang = v.filter((y) => y[cle] > x[cle]).length + 1; });
    const lim = Math.min(100, Math.max(1, c.p_limite || 50)), moi = v.find((x) => x.id === c.p_id);
    const ligne = (x) => (faux.v2 ? { rang: x.rang, pseudo: x.pseudo, valeur: x.valeur, moi: x.id === c.p_id, podium: x.podium } : { rang: x.rang, pseudo: x.pseudo, points: x.points, valeur: x.valeur, moi: x.id === c.p_id, podium: x.podium });
    return { ...(faux.v2 ? {} : { version: 3 }), semaine: l, periode: c.p_periode, joueurs: v.length, lignes: v.slice(0, lim).map(ligne), moi: moi ? (faux.v2 ? { rang: moi.rang, valeur: moi.valeur, podium: moi.podium } : { rang: moi.rang, points: moi.points, valeur: moi.valeur, podium: moi.podium }) : null };
  },
  fournil_retirer: (c) => { const j = faux.joueurs.get(c.p_id); if (!j) return { ok: true, erreur: null }; if (j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' }; faux.joueurs.delete(c.p_id); faux.palmares.delete(c.p_id); return { ok: true, erreur: null }; },
  fournil_recompenses: (c) => {
    const j = faux.joueurs.get(c.p_id); if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton', podiums: [], derniere: null };
    const sem = avant(lundi()), podium = [...faux.palmares.entries()].filter(([id]) => faux.joueurs.has(id)).map(([id, rang]) => ({ rang, pseudo: faux.joueurs.get(id).pseudo, points: 400 - 50 * rang, valeur: 1e9 / rang })).sort((a, b) => a.rang - b.rang);
    return { ok: true, erreur: null, podiums: j && faux.palmares.has(c.p_id) ? [{ semaine: sem, rang: faux.palmares.get(c.p_id) }] : [], derniere: podium.length ? { semaine: sem, podium } : null };
  },
  fournil_heure: () => ({ ms: Date.now() }),
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1], h = req.headers();
  let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps, apikey: h.apikey, auth: h.authorization, type: h['content-type'], t: Date.now(), mode: faux.mode });
  if (faux.mode === 'hors-ligne') return route.abort('internetdisconnected');
  if (faux.mode === 'pas-ouvert') return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: `Could not find the function public.${nom} in the schema cache` }) });
  if (!RPC[nom] || !corps) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) });
  if (faux.v2 && nom === 'fournil_publier' && 'p_points' in corps) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function public.fournil_publier(p_fortune, p_id, p_jeton, p_lundi, p_points, p_pseudo) in the schema cache' }) }); // un serveur encore en version 2
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps)) });
}
const publies = () => faux.appels.filter((a) => a.nom === 'fournil_publier');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await ctx.route(SUPA + '/rest/v1/rpc/*', gerer);
  const errors = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_INTERNET_DISCONNECTED|ERR_FAILED|404/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  let page = await ctx.newPage(); suivre(page);
  const feuille = () => page.evaluate(() => (document.querySelector('#feuille').hidden ? '' : document.querySelector('#feuille-contenu').innerText));
  const etatLocal = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('fournil.classement') || 'null'); } catch (e) { return null; } });
  const listeChargee = () => attendre(() => page.evaluate(() => !!document.querySelector('#feuille-contenu .cl-liste')));
  const libererEnvois = async () => { // pour le test : oublier le délai de 15 s du téléphone et celui de 10 s du serveur
    await page.evaluate(() => { // en mémoire ET dans le stockage : le moteur relit le stockage (une autre fenêtre a pu envoyer) et garde l'essai le plus récent
      const e = window.__fournil.classement().etat(); e.essai = 0; e.dernierEnvoi = Math.min(e.dernierEnvoi || 0, Date.now() - 60e3);
      try { const s = JSON.parse(localStorage.getItem('fournil.classement')); if (s) { s.essai = 0; s.dernierEnvoi = e.dernierEnvoi; localStorage.setItem('fournil.classement', JSON.stringify(s)); } } catch (x) { /* rien */ }
    });
    for (const j of faux.joueurs.values()) j.maj = 0;
  };
  const ouvrir = async (p) => { await page.evaluate((p) => window.__fournil.feuilleClassement(p), p); await listeChargee(); await sleep(250); };

  // ─── le lancement : la configuration est là, mais rien ne part tant qu'on n'a pas rejoint ───
  await page.goto(BASE + '/fournil/'); await sleep(1300);
  check(await page.evaluate(() => typeof window.FOURNIL_CONFIG === 'object' && !!window.__fournil.classement() && window.__fournil.classement().disponible()), 'fournil/config.js chargé avant le jeu : le classement est disponible');
  check(faux.appels.length === 0, 'pas encore rejoint : aucun appel au lancement');
  const coin = await page.evaluate(() => { const b = document.querySelector('#b-classement'), a = document.querySelector('#b-atelier'), r = b.getBoundingClientRect(), e = document.querySelector('#enseigne').getBoundingClientRect(), ra = a.getBoundingClientRect(); return { vu: !b.hidden && r.width >= 40, droite: innerWidth - r.right, haut: r.top - document.querySelector('#scene-wrap').getBoundingClientRect().top, apresEnseigne: r.left >= e.right, pastille: !b.querySelector('.rang-pastille').hidden, label: b.getAttribute('aria-label'), atelierDessous: ra.top >= r.bottom && Math.abs(ra.left - r.left) < 1, rouleau: !!document.querySelector('#b-amenager') }; });
  check(coin.vu && coin.droite <= 14 && coin.haut <= 12 && coin.apresEnseigne && !coin.pastille && coin.label === 'Classement des boulangers' && coin.atelierDessous && !coin.rouleau, `l’icône ronde du classement en haut à droite (à ${Math.round(coin.droite)} px du bord, sans pastille tant qu’on n’a pas de place), l’Atelier dessous ; plus de rouleau de peinture à l’écran`);
  await page.evaluate(() => window.__fournil.give(25000)); await sleep(200);
  await page.tap('#onglets [data-page="journal"]'); await sleep(450);
  const carte = await page.evaluate(() => { const c = document.querySelector('#page-journal .cl-carte'), r = c && c.querySelector('.reglage').getBoundingClientRect(); return c ? { txt: c.innerText, h: r.height, avantRecords: c.compareDocumentPosition([...document.querySelectorAll('#page-journal .c-tete h3')].find((h) => /Records/.test(h.textContent))) & Node.DOCUMENT_POSITION_FOLLOWING } : null; });
  check(carte && /Classement des boulangers/.test(carte.txt) && /0 pt cette semaine/.test(carte.txt) && /mesure-toi à tes amis/.test(carte.txt) && carte.h >= 48 && carte.avantRecords, 'l’entrée « Classement des boulangers » en tête du Journal, avant les records (' + (carte && Math.round(carte.h)) + ' px de haut)');
  await page.screenshot({ path: out + '/01-journal.png' });

  // ─── la feuille, sans avoir rejoint : la liste des autres et l'invitation ───
  await page.tap('#page-journal [data-a="classement"]'); await listeChargee(); await sleep(300);
  const v1 = await page.evaluate(() => ({ lignes: document.querySelectorAll('#feuille .cl-ligne').length, moi: document.querySelectorAll('#feuille .cl-ligne.moi').length, sel: document.querySelector('[data-tab="semaine"]').getAttribute('aria-selected'), info: document.querySelector('.cl-info').innerText, rejoindre: !!document.querySelector('[data-a="cl-rejoindre"]'), premier: document.querySelector('.cl-ligne .cl-rang').innerText.replace(/\s/g, '') }));
  const appelListe = faux.appels.find((a) => a.nom === 'fournil_classement');
  check(v1.lignes === 45 && v1.moi === 0 && v1.sel === 'true' && /45 boulangers/.test(v1.info) && /Depuis lundi/.test(v1.info) && v1.rejoindre && v1.premier === '1er', `la feuille : onglet « Cette semaine », ${v1.lignes} lignes, « ${v1.info.replace(/\n/g, ' · ')} », bouton « Rejoindre le classement »`);
  const l1 = await page.evaluate(() => { const l = document.querySelector('#feuille .cl-ligne'), v = l.querySelector('.cl-val'), sm = v.querySelector('small'); return { txt: l.innerText.replace(/\s+/g, ' '), pts: v.firstChild.textContent, euros: sm ? sm.textContent : '', petit: sm ? parseFloat(getComputedStyle(sm).fontSize) < parseFloat(getComputedStyle(v).fontSize) : false }; });
  check(/^\d+ pts$/.test(l1.pts) && /\d.*€$/u.test(l1.euros) && l1.petit, `chaque ligne : ses points en gros, sa fortune de la semaine en petit dessous (« ${l1.txt} » ; ${JSON.stringify(l1)})`);
  const bloc = await page.evaluate(() => { const b = document.querySelector('#feuille .pts-bloc'), d = b && b.querySelector('details'); return b ? { txt: b.innerText.replace(/\s+/g, ' '), cases: b.querySelectorAll('.pts-case').length, ferme: d && !d.open, avantListe: !!(b.compareDocumentPosition(document.querySelector('#feuille .segments')) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; });
  check(bloc && /Mes points cette semaine/.test(bloc.txt) && bloc.cases === 5 && /Journées/.test(bloc.txt) && /Atelier/.test(bloc.txt) && /Améliorations/.test(bloc.txt) && bloc.ferme && bloc.avantListe, `en tête de la feuille : ses points de la semaine en cinq cases (journées, événements, améliorations, défi, Atelier), le barème replié (« ${bloc && bloc.txt.slice(0, 90)}… »)`);
  await page.tap('#feuille .pts-bareme summary'); await sleep(250);
  check(await page.evaluate(() => { const d = document.querySelector('#feuille .pts-bareme'); return d.open && /10 pts par journée complète/.test(d.innerText) && /10 minutes de tes propres gains/.test(d.innerText) && /un débutant et une grande boutique qui jouent pareil marquent autant/.test(d.innerText); }), '« Comment marquer des points ? » déplie le barème : journée 10, défi 30, événements 2, Atelier 20, améliorations relatives à ses propres gains');
  await page.screenshot({ path: out + '/02b-bareme.png' });
  await page.tap('#feuille .pts-bareme summary'); await sleep(150);
  check(appelListe && appelListe.corps.p_periode === 'semaine' && appelListe.corps.p_id === null && appelListe.corps.p_limite === 50 && appelListe.apikey === 'sb_publishable_T4XlWAUqurOWo8T9GNkuaA_TPPf4ss3' && appelListe.auth === 'Bearer sb_publishable_T4XlWAUqurOWo8T9GNkuaA_TPPf4ss3' && /application\/json/.test(appelListe.type), 'fournil_classement(semaine, sans id, 50) avec apikey et Authorization: Bearer <clé publique>');
  check(publies().length === 0, 'ouvrir la feuille sans avoir rejoint : rien n’est publié');
  const toques = await page.evaluate(() => [...document.querySelectorAll('#feuille .cl-ligne')].filter((l) => l.querySelector('.cl-toque')).map((l) => { const t = l.querySelector('.cl-toque'), r = t.getBoundingClientRect(); return { nom: l.querySelector('.cl-nom > span').textContent, m: t.className.replace('cl-toque', '').trim(), label: t.getAttribute('aria-label'), w: Math.round(r.width) }; }));
  check(toques.length === 3 && toques.find((t) => t.nom === 'Mamie Jo' && t.m === 'or' && /1er la semaine dernière/.test(t.label)) && toques.find((t) => t.nom === 'Tonton Jo' && t.m === 'argent') && toques.find((t) => t.nom === 'Petit Jo' && t.m === 'bronze') && toques.every((t) => t.w >= 16 && t.w <= 26), 'le podium de la semaine passée : une petite toque or, argent, bronze à côté de ' + toques.map((t) => `${t.nom} (${t.m})`).join(', '));
  check(!faux.appels.some((a) => a.nom === 'fournil_recompenses'), 'pas encore rejoint : les récompenses ne sont pas demandées');
  await page.screenshot({ path: out + '/02-liste-invitation.png' });

  // ─── rejoindre : validation en direct, pseudo déjà pris, puis le bon ───
  await page.tap('[data-a="cl-rejoindre"]'); await sleep(350);
  const aide = () => page.evaluate(() => { const a = document.querySelector('#cl-aide'), b = document.querySelector('[data-a="cl-valider"]'); return { txt: a.textContent, cls: a.className, bloque: b.getAttribute('aria-disabled') === 'true' }; });
  let a = await aide();
  check(/Rejoindre le classement/.test(await feuille()) && /pas le nom de ta boutique/.test(await feuille()) && /Choisis un pseudo/.test(a.txt) && a.bloque, 'rejoindre : on choisit un pseudo, distinct du nom de la boutique ; bouton inactif tant qu’il est vide');
  await page.fill('#cl-champ', 'A'); a = await aide();
  check(/Encore un caractère/.test(a.txt) && /erreur/.test(a.cls) && a.bloque, 'validation en direct : « ' + a.txt + ' »');
  await page.fill('#cl-champ', 'pain@choco'); a = await aide();
  check(/«\s@\s»/.test(a.txt) && a.bloque, 'validation en direct : « ' + a.txt + ' »');
  await page.fill('#cl-champ', '  mamie   JO '); a = await aide();
  check(/«\smamie JO\s»/.test(a.txt) && /bon/.test(a.cls) && !a.bloque, 'espaces repliés, aperçu : « ' + a.txt + ' »');
  await page.screenshot({ path: out + '/03a-pseudo.png' });
  await page.tap('[data-a="cl-valider"]');
  await attendre(async () => /déjà pris/.test((await aide()).txt), 10000); a = await aide();
  check(/«\smamie JO\s» est déjà pris/.test(a.txt) && /erreur/.test(a.cls) && !(await etatLocal()).rejoint, 'pseudo déjà pris (sans tenir compte des majuscules) : « ' + a.txt + ' », pas rejoint');
  await page.screenshot({ path: out + '/03b-pseudo-pris.png' });
  await page.fill('#cl-champ', 'Paulo'); await page.tap('[data-a="cl-valider"]');
  check(await attendre(async () => !!(await page.evaluate(() => document.querySelector('#feuille-contenu .cl-liste'))) && !!(await etatLocal() || {}).rejoint, 15000), 'un pseudo libre : rejoint (le second envoi a attendu son tour, le serveur en prend un toutes les 10 s)');
  await sleep(400);
  const e1 = await etatLocal(), lt = await page.evaluate(() => Math.floor(window.__fournil.st.lifetime)), p1 = publies().filter((x) => x.corps.p_pseudo === 'Paulo').pop();
  check(e1.pseudo === 'Paulo' && /^[0-9a-f-]{36}$/.test(e1.id) && /^[0-9a-f]{64}$/.test(e1.jeton) && faux.joueurs.get(e1.id).jeton === sha(e1.jeton) && p1 && p1.corps.p_fortune <= lt && p1.corps.p_fortune >= 25000, `localStorage « fournil.classement » : id, jeton secret (le serveur n’en garde que l’empreinte sha256), pseudo ; fortune envoyée ${p1 && p1.corps.p_fortune} (Math.floor(st.lifetime))`);
  check(new Set(publies().map((x) => x.corps.p_id)).size === 1, 'la même identité au premier essai (pseudo pris) et au second');
  // tout juste arrivé : 0 € gagné cette semaine, dernier des 46 ; sa ligne mise en avant
  const loin = await page.evaluate(() => { const m = document.querySelector('#feuille .cl-ligne.moi'); return { n: document.querySelectorAll('#feuille .cl-ligne').length, txt: m ? m.innerText.replace(/\s+/g, ' ') : '', cur: m && m.getAttribute('aria-current'), sep: !!document.querySelector('#feuille .cl-sep'), info: document.querySelector('.cl-info').innerText }; });
  check(loin.n === 46 && /^46e Paulo toi 0 pt 0 €/.test(loin.txt) && loin.cur === 'true' && !loin.sep && /46 boulangers/.test(loin.info), 'rejoint : 46e sur 46 cette semaine (0 point encore), sa ligne mise en avant : « ' + loin.txt + ' »');
  check(p1 && p1.corps.p_points === 0 && p1.corps.p_lundi === CL.lundiParis(Date.now()), `ses points de la semaine partent avec le pseudo : p_points ${p1 && p1.corps.p_points}, p_lundi ${p1 && p1.corps.p_lundi}`);
  const place = await page.evaluate(() => { const p = document.querySelector('#feuille .cl-place'), l = document.querySelector('#feuille .cl-liste'); return p ? { txt: p.innerText.replace(/\s+/g, ' '), avant: !!(p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING), rang: p.querySelector('.cl-rang').getBoundingClientRect().height } : null; });
  check(place && /^46e Ta place cette semaine sur 46 boulangers 0 pt 0 €$/.test(place.txt) && place.avant && place.rang <= 32, 'sa place d’un coup d’œil, au-dessus de la liste : « ' + (place && place.txt) + ' »');
  await page.screenshot({ path: out + '/04a-ta-place.png' });
  await page.evaluate(() => { const f = document.querySelector('#feuille'); f.scrollTop = f.scrollHeight; }); await sleep(200);
  await page.screenshot({ path: out + '/04-rejoint.png' });
  // tous les temps : 61e sur 61, hors des 50 premiers : sa ligne après un séparateur
  await page.tap('[data-tab="total"]'); await listeChargee(); await sleep(300);
  const tot = await page.evaluate(() => ({ sel: document.querySelector('[data-tab="total"]').getAttribute('aria-selected'), info: document.querySelector('.cl-info').innerText, n: document.querySelectorAll('#feuille .cl-ligne').length, moi: (document.querySelector('#feuille .cl-ligne.moi') || {}).innerText || '', sep: !!document.querySelector('#feuille .cl-sep') }));
  check(tot.sel === 'true' && /61 boulangers/.test(tot.info) && /depuis l’arrivée au classement/.test(tot.info) && tot.n === 51 && tot.sep && /^61e Paulo toi/.test(tot.moi.replace(/\s+/g, ' ').trim()), `rang hors des 50, onglet « Tous les temps » : les 50 premiers, un séparateur, puis sa ligne (${tot.moi.replace(/\s+/g, ' ').trim()}) ; « ${tot.info.replace(/\n/g, ' · ')} »`);
  check(faux.appels.filter((x) => x.nom === 'fournil_classement').pop().corps.p_periode === 'total', 'fournil_classement(total)');
  await page.evaluate(() => { const f = document.querySelector('#feuille'); f.scrollTop = f.scrollHeight; }); await sleep(200);
  await page.screenshot({ path: out + '/05-tous-les-temps-loin.png' });

  // la pastille de l'icône : sa place de la semaine
  await page.tap('[data-a="close"]'); await sleep(300);
  let pas = await page.evaluate(() => window.__fournil.coin());
  check(pas.classement && pas.pastille === '46e' && /46e cette semaine sur 46/.test(pas.label), `l’icône du classement porte sa place en pastille : « ${pas.pastille} » (${pas.label})`);
  await page.screenshot({ path: out + '/04b-pastille.png', clip: { x: 230, y: 70, width: 160, height: 140 } });
  // un lundi matin, personne n'a encore de points : tout le monde serait « 1er » ex æquo → ni pastille, ni « 1er » au Journal
  {
    const gardes = [...faux.joueurs.values()].map((a) => [a, a.points, a.ptsTotal]);
    for (const a of faux.joueurs.values()) { a.points = 0; a.ptsTotal = 0; }
    await libererEnvois();
    const r0 = await page.evaluate(() => { window.__fournil.give(1000); return window.__fournil.classement().envoyer('feuille').then((r) => r.etat); });
    await sleep(300);
    const z = await page.evaluate(() => ({ coin: window.__fournil.coin(), resume: window.__fournil.classement().resume(), carte: (document.querySelector('#page-journal .cl-carte') || {}).innerText || '' }));
    check(r0 === 'ok' && z.resume.semaine && z.resume.semaine.rang === 1 && z.resume.semaine.points === 0 && z.coin.pastille === '' && z.coin.label === 'Classement des boulangers' && !/1er/.test(z.carte),
      `tout le monde à 0 point (lundi matin) : le serveur le dit « 1er » ex æquo, mais l’icône n’a pas de pastille et le Journal ne dit pas « 1er » (« ${z.carte.split('\n').pop()} »)`);
    await page.screenshot({ path: out + '/04c-zero-point.png', clip: { x: 230, y: 70, width: 160, height: 140 } });
    for (const [a, p, t] of gardes) { a.points = p; a.ptsTotal = t; }
    await libererEnvois();
    await page.evaluate(() => { window.__fournil.give(1000); return window.__fournil.classement().envoyer('feuille'); });
    await sleep(300);
    check((await page.evaluate(() => window.__fournil.coin())).pastille === '46e', 'les autres reprennent leurs points : la pastille revient (« 46e », une vraie place même à 0 point)');
  }

  // ─── beaucoup de points (une semaine bien jouée, marquée ici par la console) : sa ligne en tête, mise en avant ───
  await page.evaluate(() => { const { G, st } = window.__fournil; G.marquerDefi(st); G.marquerJournee(st); for (const j of G.JEUX_ATELIER) G.marquerAtelier(st, j.id, j.max); for (let k = 0; k < 10; k++) G.marquerEvenement(st); G.marquerAmelioration(st, 1e30, 1, 6); window.__fournil.give(5e9); });
  check(await page.evaluate(() => window.__fournil.points().total) === 150, '150 points dans la journée : le maximum du barème un lundi (journée, événements, améliorations, défi, Atelier)');
  await libererEnvois();
  const nPub = publies().length;
  await page.tap('#b-classement'); await listeChargee(); await sleep(250); // l'icône ouvre la feuille (sur l'onglet vu en dernier : « Tous les temps »)
  check(await page.evaluate(() => !document.querySelector('#feuille').hidden && document.querySelector('[data-tab="total"]').getAttribute('aria-selected') === 'true'), 'toucher l’icône ouvre la feuille du classement, sur l’onglet regardé en dernier');
  await page.tap('[data-tab="semaine"]'); await listeChargee(); await sleep(250);
  await attendre(() => page.evaluate(() => /^1/.test(((document.querySelector('#feuille .cl-ligne.moi .cl-rang') || {}).innerText || '').trim())), 5000);
  const haut = await page.evaluate(() => { const m = document.querySelector('#feuille .cl-ligne.moi'), r = m.getBoundingClientRect(), s = getComputedStyle(m); return { txt: m.innerText.replace(/\s+/g, ' '), sep: !!document.querySelector('#feuille .cl-sep'), fond: s.backgroundColor, h: r.height, n: document.querySelectorAll('#feuille .cl-ligne').length }; });
  check(!(await page.evaluate(() => document.querySelector('#feuille .cl-place'))), 'en tête de liste : pas de résumé en double, sa ligne se voit');
  check(publies().length === nPub + 1 && publies()[nPub].corps.p_points === 150 && /^1er Paulo toi 150 pts \d/.test(haut.txt) && !haut.sep && haut.fond !== 'rgba(0, 0, 0, 0)' && haut.h >= 48, `à l’ouverture de la feuille : ses points partent d’abord, puis la liste ; sa ligne en tête, mise en avant : « ${haut.txt} »`);
  await page.screenshot({ path: out + '/06-ma-ligne-en-tete.png' });
  const nTot = faux.appels.length;
  await page.tap('[data-tab="total"]');
  await attendre(() => page.evaluate(() => /^1er Paulo/.test(document.querySelector('#feuille .cl-ligne.moi').innerText.replace(/\s+/g, ' '))), 5000);
  check(/^1er Paulo/.test(await page.evaluate(() => document.querySelector('#feuille .cl-ligne.moi').innerText.replace(/\s+/g, ' '))) && faux.appels.some((x, k) => k >= nPub && x.nom === 'fournil_classement' && x.corps.p_periode === 'total'), 'tous les temps : la liste, relue après son envoi (la gardée était périmée) : 1er aussi');
  await page.tap('[data-tab="semaine"]'); await sleep(300);
  check(await page.evaluate(() => document.querySelector('[data-tab="semaine"]').getAttribute('aria-selected') === 'true' && !!document.querySelector('#feuille .cl-liste')), 'retour à « Cette semaine » : la liste revient tout de suite (gardée en mémoire)');
  await page.tap('[data-a="close"]'); await sleep(400);
  const carte2 = await page.evaluate(() => document.querySelector('#page-journal .cl-carte').innerText);
  check(/150 pts cette semaine/.test(carte2) && /1er cette semaine sur 4\d/.test(carte2) && /1er de tous les temps sur 61/.test(carte2), 'le Journal montre ses points et sa place : « ' + carte2.split('\n').pop() + ' »');
  pas = await page.evaluate(() => window.__fournil.coin());
  check(pas.pastille === '1er' && await page.evaluate(() => document.querySelector('#b-classement .rang-pastille').classList.contains('r1')), 'la pastille passe à « 1er », dorée');
  await page.screenshot({ path: out + '/07-journal-rang.png' });

  // ─── changer de pseudo ───
  await ouvrir('semaine');
  await page.tap('[data-a="cl-pseudo"]'); await sleep(350);
  a = await aide();
  check(await page.evaluate(() => document.querySelector('#cl-champ').value === 'Paulo') && /déjà ton pseudo/.test(a.txt) && a.bloque, 'changer de pseudo : le champ reprend « Paulo », inutile de le renvoyer tel quel');
  await page.fill('#cl-champ', 'Paulo le boulanger'); a = await aide();
  check(/18 caractères : 16 au plus/.test(a.txt) && a.bloque, '« Paulo le boulanger » : ' + a.txt);
  await page.fill('#cl-champ', 'Tonton Brioche'); await page.tap('[data-a="cl-valider"]');
  await attendre(async () => /déjà pris/.test((await aide()).txt), 15000);
  check(/«\sTonton Brioche\s» est déjà pris/.test((await aide()).txt) && (await etatLocal()).pseudo === 'Paulo', 'un pseudo d’un autre : refusé, on garde « Paulo »');
  await page.fill('#cl-champ', 'Paulo B.'); await page.tap('[data-a="cl-valider"]');
  check(await attendre(async () => (await etatLocal()).pseudo === 'Paulo B.' && !!(await page.evaluate(() => document.querySelector('#feuille-contenu .cl-liste'))), 15000), 'nouveau pseudo « Paulo B. » accepté');
  await listeChargee(); await sleep(400);
  const e2 = await etatLocal();
  check(faux.joueurs.get(e2.id).pseudo === 'Paulo B.' && e2.id === e1.id && /Paulo B\./.test(await page.evaluate(() => document.querySelector('#feuille .cl-ligne.moi').innerText)) && /sous le pseudo Paulo B\./.test(await feuille()), 'même joueur, nouveau nom dans la liste et sous la liste');
  await page.screenshot({ path: out + '/08-pseudo-change.png' });
  await page.tap('[data-a="close"]'); await sleep(300);

  // ─── le passage en arrière-plan : un envoi (fetch keepalive) ───
  await page.evaluate(() => window.__fournil.give(1e6)); await libererEnvois();
  const n0 = publies().length, attendu = await page.evaluate(() => Math.floor(window.__fournil.st.lifetime));
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await attendre(() => publies().length > n0, 4000);
  const fond = publies()[n0];
  check(!!fond && fond.corps.p_fortune >= attendu && fond.corps.p_fortune - attendu < 1e5 && faux.joueurs.get(e2.id).sommet === fond.corps.p_fortune, 'la page passe en arrière-plan : la fortune part aussitôt (' + (fond && fond.corps.p_fortune) + ')');
  await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await sleep(300);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; }); await sleep(500);
  check(publies().length === n0 + 1, 'un second passage en arrière-plan aussitôt après : rien (15 s au moins entre deux envois, fortune inchangée)');
  // le minuteur : toutes les 5 min, seulement si la fortune a bougé
  await page.evaluate(() => window.__fournil.give(5e5)); await libererEnvois();
  await page.evaluate(() => window.__fournil.classement().tick()); await sleep(500);
  check(publies().length === n0 + 2, 'l’envoi périodique part quand 5 min sont passées et que la fortune a bougé');

  // ─── au lancement (après les gains hors ligne) : un envoi ───
  for (const j of faux.joueurs.values()) j.maj = 0;
  await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('fournil.classement')); e.essai = 0; e.valeur = 1; localStorage.setItem('fournil.classement', JSON.stringify(e)); window.__fournil.save(); });
  const n1 = publies().length, p2 = await ctx.newPage(); suivre(p2);
  await p2.goto(BASE + '/fournil/'); await attendre(() => publies().length > n1, 6000);
  check(publies().length >= n1 + 1 && publies()[n1].corps.p_pseudo === 'Paulo B.', 'au lancement du jeu (nouvel onglet) : un envoi, une fois les gains hors ligne comptés');
  await p2.close(); await sleep(300);

  // ─── la Salle de jeux montre le rang ───
  await page.goto(BASE + '/?app=accueil'); await sleep(900);
  const salle = await page.evaluate(() => ({ txt: document.querySelector('[data-jeu="fournil"]').innerText, large: document.documentElement.scrollWidth <= innerWidth + 1 }));
  check(/Classement : 1er cette semaine sur 4\d/.test(salle.txt) && salle.large, 'la Salle de jeux, sur la carte du Fournil : « ' + (salle.txt.split('\n').find((l) => /Classement/.test(l)) || '?') + ' »');
  await page.screenshot({ path: out + '/09-salle-de-jeux.png' });
  await page.evaluate(() => { const e = JSON.parse(localStorage.getItem('fournil.classement')); e.dernier.semaine.lundi = '2020-01-06'; localStorage.setItem('fournil.classement', JSON.stringify(e)); }); await page.reload(); await sleep(700);
  check(/Classement : 1er de tous les temps sur 61/.test(await page.evaluate(() => document.querySelector('[data-jeu="fournil"]').innerText)), 'une place de la semaine d’avant : la Salle de jeux montre celle de tous les temps');

  // ─── quitter le classement (et, avant, l'accessibilité de la feuille d'un joueur inscrit) ───
  await page.goto(BASE + '/fournil/'); await sleep(1200);
  // accessibilité : cibles et contraste du texte
  await ouvrir('semaine');
  const cibles = await page.evaluate(() => [...document.querySelectorAll('#feuille button')].filter((b) => b.offsetParent).map((b) => ({ t: (b.innerText || b.getAttribute('aria-label') || '').trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })));
  check(cibles.length >= 4 && cibles.every((c) => c.h >= 40 && c.w >= 44), 'chaque bouton de la feuille fait au moins 40 × 44 px : ' + cibles.map((c) => `${c.t} ${c.w}×${c.h}`).join(', '));
  const contraste = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const fond = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
    return ['.cl-nom', '.cl-val', '.cl-info', '.cl-info b', '.cl-moi', '.segments button:not(.actif)', '.segments button.actif', '[data-a="cl-pseudo"]', '.cl-quitter'].map((s) => { const el = document.querySelector('#feuille ' + s); return el ? [s, +ratio(getComputedStyle(el).color, fond(el)).toFixed(1)] : [s, 0]; });
  });
  check(contraste.every(([, r]) => r >= 4.5), 'contraste du texte ≥ 4,5:1 : ' + contraste.map(([s, r]) => `${s} ${r}`).join(', '));
  await page.tap('[data-a="close"]'); await sleep(200);
  await ouvrir('semaine');
  await page.tap('[data-a="cl-quitter"]'); await sleep(350);
  check(/Quitter le classement \?/.test(await feuille()) && /Paulo B\./.test(await feuille()) && /Ta boutique ne change pas/.test(await feuille()), 'quitter : une confirmation d’abord');
  await page.screenshot({ path: out + '/10-quitter.png' });
  await page.tap('[data-a="cl-oui"]');
  await attendre(async () => !!(await page.evaluate(() => document.querySelector('[data-a="cl-rejoindre"]'))), 6000); await listeChargee(); await sleep(300);
  const e3 = await etatLocal(), ret = faux.appels.filter((x) => x.nom === 'fournil_retirer').pop();
  check(ret && ret.corps.p_id === e2.id && ret.corps.p_jeton === e2.jeton && !faux.joueurs.has(e2.id) && e3.rejoint === false && e3.id === null && e3.pseudo === 'Paulo B.' && !/Paulo B\./.test(await page.evaluate(() => document.querySelector('#feuille .cl-liste').innerText)), 'parti : fournil_retirer(id, jeton), sa ligne effacée, l’identité oubliée ; « Rejoindre » revient');
  const nPub2 = publies().length; await page.evaluate(() => window.__fournil.give(1e7)); await page.evaluate(() => window.__fournil.classement().tick()); await sleep(300);
  check(publies().length === nPub2, 'après avoir quitté, plus rien ne part');
  await page.goto(BASE + '/?app=accueil'); await sleep(700);
  check(!/Classement/.test(await page.evaluate(() => document.querySelector('[data-jeu="fournil"]').innerText)), 'la Salle de jeux n’affiche plus de place');

  // ─── « Annuler » pendant l'envoi du pseudo : la liste se recharge d'elle-même une fois l'envoi accepté ───
  await page.goto(BASE + '/fournil/'); await sleep(1200);
  await ouvrir('semaine'); await page.tap('[data-a="cl-rejoindre"]'); await sleep(300);
  await page.route(SUPA + '/rest/v1/rpc/fournil_publier', async (r) => { await sleep(1500); return gerer(r); }); // un réseau lent
  await page.fill('#cl-champ', 'Lent mais sûr'); await page.tap('[data-a="cl-valider"]'); await sleep(200);
  await page.tap('[data-a="cl-annuler"]');
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille .cl-ligne.moi')), 6000) && /Lent mais sûr/.test(await page.evaluate(() => document.querySelector('#feuille .cl-ligne.moi').innerText)), '« Annuler » pendant un envoi lent : le pseudo est quand même pris, la liste se relit et le montre');
  await page.unroute(SUPA + '/rest/v1/rpc/fournil_publier');
  await page.evaluate(() => window.__fournil.classement().quitter()); await sleep(300);
  await page.tap('[data-a="close"]'); await sleep(200);

  // ─── hors ligne ───
  await page.goto(BASE + '/fournil/'); await sleep(1200);
  faux.mode = 'hors-ligne';
  await page.evaluate(() => window.__fournil.feuilleClassement('semaine'));
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille .cl-etat.hors-ligne'))), 'réseau coupé : « ' + (await feuille()).split('\n').filter((l) => /réseau|connecté/.test(l)).join(' / ') + ' »');
  check(await page.evaluate(() => !!document.querySelector('[data-a="cl-reessayer"]') && !!window.__fournil.st), 'un bouton « Réessayer », et le jeu continue');
  await page.screenshot({ path: out + '/11-hors-ligne.png' });
  faux.mode = 'normal'; await page.tap('[data-a="cl-reessayer"]'); await listeChargee();
  check(await page.evaluate(() => !!document.querySelector('#feuille .cl-liste')), 'le réseau revient, « Réessayer » : la liste');
  await page.tap('[data-a="close"]'); await sleep(200);

  // ─── pas encore ouvert (le SQL n'a pas été collé : 404, PGRST202) ───
  faux.mode = 'pas-ouvert';
  await page.evaluate(() => window.__fournil.feuilleClassement('total'));
  check(await attendre(() => page.evaluate(() => !!document.querySelector('#feuille .cl-etat.pas-ouvert'))) && /Le classement ouvre bientôt/.test(await feuille()) && !(await page.evaluate(() => document.querySelector('[data-a="cl-rejoindre"]'))), 'fonction absente : « Le classement ouvre bientôt », pas de bouton pour rejoindre');
  await page.screenshot({ path: out + '/12-bientot.png' });
  await page.tap('[data-a="close"]'); await sleep(200);
  faux.mode = 'normal';

  // ─── un serveur encore en version 2 (le SQL v3 pas encore recollé) : le classement marche comme avant, à l'argent ───
  faux.v2 = true;
  await page.goto(BASE + '/fournil/'); await sleep(1200);
  const nV2 = faux.appels.length;
  const rv2 = await page.evaluate(() => window.__fournil.classement().choisirPseudo('Vieux serveur').then((r) => r.etat));
  const pv2 = faux.appels.slice(nV2).filter((x) => x.nom === 'fournil_publier');
  check(rv2 === 'ok' && pv2.length === 2 && 'p_points' in pv2[0].corps && !('p_points' in pv2[1].corps) && await page.evaluate(() => window.__fournil.classement().version()) === 2, 'serveur v2 : l’envoi avec points est refusé (fonction introuvable), aussitôt renvoyé sans : rejoint quand même');
  await ouvrir('semaine');
  const lv2 = await page.evaluate(() => [...document.querySelectorAll('#feuille .cl-val')].slice(0, 3).map((v) => ({ txt: v.innerText.replace(/\s+/g, ' '), petit: !!v.querySelector('small') })));
  check(lv2.length === 3 && lv2.every((v) => /€$/.test(v.txt) && !/pt/.test(v.txt) && !v.petit), `sa liste s’affiche comme avant, à l’argent (${lv2.map((v) => v.txt).join(', ')})`);
  await page.tap('[data-a="close"]'); await sleep(200);
  await page.evaluate(() => window.__fournil.classement().quitter()); await sleep(300);
  faux.v2 = false;

  // ─── à 320 px : un long pseudo et une très grosse fortune tiennent sur leur ligne ───
  const c2 = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await c2.route(SUPA + '/rest/v1/rpc/*', gerer);
  const p3 = await c2.newPage(); suivre(p3);
  await p3.goto(BASE + '/fournil/'); await sleep(1200);
  await p3.evaluate(() => { window.__fournil.give(1e6); window.__fournil.feuilleClassement('total'); });
  await attendre(() => p3.evaluate(() => !!document.querySelector('#feuille .cl-liste')));
  await p3.tap('[data-a="cl-rejoindre"]'); await sleep(300);
  await p3.fill('#cl-champ', 'Éloïse Marguerit'); await p3.tap('[data-a="cl-valider"]');
  await attendre(() => p3.evaluate(() => !!document.querySelector('#feuille .cl-ligne.moi')), 8000); await sleep(400);
  // arrivée à 0 € : une semaine parfaite (150 points) et une très grosse fortune gagnées ensuite, puis un envoi, et la liste relue
  for (const j of faux.joueurs.values()) j.maj = 0;
  await p3.evaluate(() => { const { G, st } = window.__fournil; G.marquerDefi(st); G.marquerJournee(st); for (const j of G.JEUX_ATELIER) G.marquerAtelier(st, j.id, j.max); for (let k = 0; k < 10; k++) G.marquerEvenement(st); G.marquerAmelioration(st, 1e30, 1, 6); window.__fournil.give(123.4e15); const m = window.__fournil.classement(), e = m.etat(); e.essai = 0; e.dernierEnvoi = 0; try { const x = JSON.parse(localStorage.getItem('fournil.classement')); x.essai = 0; x.dernierEnvoi = 0; localStorage.setItem('fournil.classement', JSON.stringify(x)); } catch (z) { /* rien */ } return m.envoyer('feuille').then(() => m.charger('total')); });
  await attendre(() => p3.evaluate(() => /^1/.test(((document.querySelector('#feuille .cl-ligne.moi .cl-rang') || {}).innerText || '').trim())), 8000); await sleep(300);
  const etroit = await p3.evaluate(() => { const f = document.querySelector('#feuille'), m = document.querySelector('#feuille .cl-ligne.moi'), r = m.getBoundingClientRect(); return { large: f.scrollWidth <= f.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, dedans: r.right <= innerWidth && r.left >= 0, val: m.querySelector('.cl-val').getBoundingClientRect().right <= r.right + 1, txt: m.innerText.replace(/\s+/g, ' ') }; });
  check(etroit.large && etroit.dedans && etroit.val && /^1er/.test(etroit.txt), 'à 320 px : rien ne déborde, un pseudo de 16 lettres, 150 points et une fortune de 123 Bd € tiennent sur leur ligne (« ' + etroit.txt + ' »)');
  await p3.screenshot({ path: out + '/13-320px.png' });
  await c2.close();

  // ─── l'artefact Claude : pas de config.js, le classement se cache ───
  const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const p4 = await c3.newPage(); suivre(p4);
  const n2 = faux.appels.length;
  await p4.goto(BASE + '/dist/artifact.html'); await sleep(1500);
  await p4.evaluate(() => window.__fournil.journal()); await sleep(400);
  const art = await p4.evaluate(() => ({ jeu: !!window.__fournil, cfg: typeof window.FOURNIL_CONFIG, cl: window.__fournil.classement(), carte: !!document.querySelector('.cl-carte'), journal: /Records/.test(document.querySelector('#page-journal').innerText) }));
  check(art.jeu && art.cfg === 'undefined' && art.cl === null && !art.carte && art.journal && faux.appels.length === n2, 'l’artefact Claude (sans config.js) : le jeu tourne, pas de classement, aucun appel');
  await c3.close();

  // ─── fournil/index.html : config.js avant le jeu ; l'artefact sans ; le service worker ne touche pas à Supabase ───
  const html = fs.readFileSync(path.join(root, 'fournil', 'index.html'), 'utf8'), artHtml = fs.readFileSync(path.join(root, 'dist', 'artifact.html'), 'utf8'), sw = fs.readFileSync(path.join(root, 'fournil', 'sw.js'), 'utf8');
  check(html.indexOf('<script src="config.js"></script>') > 0 && html.indexOf('<script src="config.js"></script>') < html.indexOf('/* ── game.js ── */') && !/src="config\.js"/.test(artHtml), 'fournil/index.html charge config.js avant le jeu ; dist/artifact.html non');
  check(/'\.\/config\.js'/.test(sw) && /supabase\\\.\(co\|in\)/.test(sw) && !/fournil-jeu-v1'/.test(sw), 'fournil/sw.js : nouvelle version de cache, config.js dans le SHELL, Supabase jamais intercepté');

  console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'ERRORS none');
  check(errors.length === 0, 'aucune erreur dans la page');
  await browser.close(); server.close();
  console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); server.close(); process.exit(1); });
