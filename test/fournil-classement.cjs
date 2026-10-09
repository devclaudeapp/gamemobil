// Le classement en ligne du Fournil, dans la vraie page (fournil/ servie en local), sur un téléphone en portrait.
// Supabase est SIMULÉ : page.route sur https://jklbitrlkfrktmnarejc.supabase.co/rest/v1/rpc/* répond comme les trois fonctions du contrat
// (fournil_publier, fournil_classement, fournil_retirer), avec un faux classement en mémoire de 60 boulangers.
// Parcours : rejoindre, pseudo pris, onglets, sa ligne mise en avant, rang hors des 50, changer de pseudo, envoi en arrière-plan,
// envoi au lancement, la Salle de jeux qui montre le rang, quitter, hors ligne, pas encore ouvert, 320 px, l'artefact sans classement.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-classement.cjs   (captures dans test/shots/classement/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const CL = require('../src/classement.js');
const root = path.join(__dirname, '..');
const PORT = 8783, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
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
const faux = { joueurs: new Map(), mode: 'normal', appels: [] };
const lundi = () => CL.lundiParis(Date.now());
const avant = (iso) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7); return d.toISOString().slice(0, 10); };
{ // 60 boulangers : 45 ont joué cette semaine, 15 pas encore
  const A = ['Mamie', 'Tonton', 'Petit', 'Grand', 'Super', 'Chef', 'Mitron', 'Madame', 'Papy', 'Cousin'], B = ['Jo', 'Brioche', 'Levain', 'Fougasse', 'Chouquette', 'Éclair'];
  for (let i = 0; i < 60; i++) {
    const fortune = Math.round(4e9 * Math.pow(0.82, i)) + 1000, cetteSemaine = i % 4 !== 3;
    faux.joueurs.set(crypto.randomUUID(), { jeton: sha('x' + i), pseudo: `${A[i % 10]} ${B[Math.floor(i / 10)]}`, fortune, base: cetteSemaine ? Math.round(fortune * (0.3 + ((i * 37) % 60) / 100)) : fortune, semaine: cetteSemaine ? lundi() : avant(lundi()), maj: 0 });
  }
}
function propre(p) { const v = CL.verifierPseudo(p); return v.ok ? v.pseudo : null; }
function rangs(id) {
  const l = lundi(), j = faux.joueurs.get(id); if (!j) return { rang_semaine: null, rang_total: null };
  const tous = [...faux.joueurs.values()];
  return { rang_semaine: j.semaine === l ? tous.filter((a) => a.semaine === l && a.fortune - a.base > j.fortune - j.base).length + 1 : null, rang_total: tous.filter((a) => a.fortune > j.fortune).length + 1 };
}
function reponse(erreur, id) { const l = lundi(); return { ok: !erreur, erreur: erreur || null, ...(erreur ? { rang_semaine: null, rang_total: null } : rangs(id)), joueurs: faux.joueurs.size, joueurs_total: faux.joueurs.size, joueurs_semaine: [...faux.joueurs.values()].filter((a) => a.semaine === l).length, semaine: l }; }
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
      if (j.semaine !== l) { j.base = j.fortune; j.semaine = l; }
      j.base = Math.min(j.base, c.p_fortune); j.pseudo = pseudo; j.fortune = c.p_fortune; j.maj = Date.now();
    } else {
      if (pris(null)) return reponse('pseudo_pris');
      faux.joueurs.set(c.p_id, { jeton: sha(c.p_jeton), pseudo, fortune: c.p_fortune, base: c.p_fortune, semaine: l, maj: Date.now() });
    }
    return reponse(null, c.p_id);
  },
  fournil_classement: (c) => {
    const l = lundi(), semaine = c.p_periode === 'semaine';
    const v = [...faux.joueurs.entries()].filter(([, a]) => !semaine || a.semaine === l).map(([id, a]) => ({ id, pseudo: a.pseudo, valeur: semaine ? a.fortune - a.base : a.fortune }));
    v.sort((a, b) => b.valeur - a.valeur || a.pseudo.localeCompare(b.pseudo));
    v.forEach((x) => { x.rang = v.filter((y) => y.valeur > x.valeur).length + 1; });
    const lim = Math.min(100, Math.max(1, c.p_limite || 50)), moi = v.find((x) => x.id === c.p_id);
    return { semaine: l, periode: c.p_periode, joueurs: v.length, lignes: v.slice(0, lim).map((x) => ({ rang: x.rang, pseudo: x.pseudo, valeur: x.valeur, moi: x.id === c.p_id })), moi: moi ? { rang: moi.rang, valeur: moi.valeur } : null };
  },
  fournil_retirer: (c) => { const j = faux.joueurs.get(c.p_id); if (!j) return { ok: true, erreur: null }; if (j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' }; faux.joueurs.delete(c.p_id); return { ok: true, erreur: null }; },
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
  await page.evaluate(() => window.__fournil.give(25000)); await sleep(200);
  await page.tap('#onglets [data-page="journal"]'); await sleep(450);
  const carte = await page.evaluate(() => { const c = document.querySelector('#page-journal .cl-carte'), r = c && c.querySelector('.reglage').getBoundingClientRect(); return c ? { txt: c.innerText, h: r.height, avantRecords: c.compareDocumentPosition([...document.querySelectorAll('#page-journal .c-tete h3')].find((h) => /Records/.test(h.textContent))) & Node.DOCUMENT_POSITION_FOLLOWING } : null; });
  check(carte && /Classement des boulangers/.test(carte.txt) && /Compare ta fortune/.test(carte.txt) && carte.h >= 48 && carte.avantRecords, 'l’entrée « Classement des boulangers » en tête du Journal, avant les records (' + (carte && Math.round(carte.h)) + ' px de haut)');
  await page.screenshot({ path: out + '/01-journal.png' });

  // ─── la feuille, sans avoir rejoint : la liste des autres et l'invitation ───
  await page.tap('#page-journal [data-a="classement"]'); await listeChargee(); await sleep(300);
  const v1 = await page.evaluate(() => ({ lignes: document.querySelectorAll('#feuille .cl-ligne').length, moi: document.querySelectorAll('#feuille .cl-ligne.moi').length, sel: document.querySelector('[data-tab="semaine"]').getAttribute('aria-selected'), info: document.querySelector('.cl-info').innerText, rejoindre: !!document.querySelector('[data-a="cl-rejoindre"]'), premier: document.querySelector('.cl-ligne .cl-rang').innerText.replace(/\s/g, '') }));
  const appelListe = faux.appels.find((a) => a.nom === 'fournil_classement');
  check(v1.lignes === 45 && v1.moi === 0 && v1.sel === 'true' && /45 boulangers/.test(v1.info) && /Depuis lundi/.test(v1.info) && v1.rejoindre && v1.premier === '1er', `la feuille : onglet « Cette semaine », ${v1.lignes} lignes, « ${v1.info.replace(/\n/g, ' · ')} », bouton « Rejoindre le classement »`);
  check(appelListe && appelListe.corps.p_periode === 'semaine' && appelListe.corps.p_id === null && appelListe.corps.p_limite === 50 && appelListe.apikey === 'sb_publishable_T4XlWAUqurOWo8T9GNkuaA_TPPf4ss3' && appelListe.auth === 'Bearer sb_publishable_T4XlWAUqurOWo8T9GNkuaA_TPPf4ss3' && /application\/json/.test(appelListe.type), 'fournil_classement(semaine, sans id, 50) avec apikey et Authorization: Bearer <clé publique>');
  check(publies().length === 0, 'ouvrir la feuille sans avoir rejoint : rien n’est publié');
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
  check(loin.n === 46 && /^46e Paulo toi 0 €/.test(loin.txt) && loin.cur === 'true' && !loin.sep && /46 boulangers/.test(loin.info), 'rejoint : 46e sur 46 cette semaine (0 € gagné depuis l’inscription), sa ligne mise en avant : « ' + loin.txt + ' »');
  const place = await page.evaluate(() => { const p = document.querySelector('#feuille .cl-place'), l = document.querySelector('#feuille .cl-liste'); return p ? { txt: p.innerText.replace(/\s+/g, ' '), avant: !!(p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING), rang: p.querySelector('.cl-rang').getBoundingClientRect().height } : null; });
  check(place && /^46e Ta place cette semaine sur 46 boulangers 0 €$/.test(place.txt) && place.avant && place.rang <= 32, 'sa place d’un coup d’œil, au-dessus de la liste : « ' + (place && place.txt) + ' »');
  await page.screenshot({ path: out + '/04a-ta-place.png' });
  await page.evaluate(() => { const f = document.querySelector('#feuille'); f.scrollTop = f.scrollHeight; }); await sleep(200);
  await page.screenshot({ path: out + '/04-rejoint.png' });
  // tous les temps : 61e sur 61, hors des 50 premiers : sa ligne après un séparateur
  await page.tap('[data-tab="total"]'); await listeChargee(); await sleep(300);
  const tot = await page.evaluate(() => ({ sel: document.querySelector('[data-tab="total"]').getAttribute('aria-selected'), info: document.querySelector('.cl-info').innerText, n: document.querySelectorAll('#feuille .cl-ligne').length, moi: (document.querySelector('#feuille .cl-ligne.moi') || {}).innerText || '', sep: !!document.querySelector('#feuille .cl-sep') }));
  check(tot.sel === 'true' && /61 boulangers/.test(tot.info) && /depuis la première baguette/.test(tot.info) && tot.n === 51 && tot.sep && /^61e Paulo toi/.test(tot.moi.replace(/\s+/g, ' ').trim()), `rang hors des 50, onglet « Tous les temps » : les 50 premiers, un séparateur, puis sa ligne (${tot.moi.replace(/\s+/g, ' ').trim()}) ; « ${tot.info.replace(/\n/g, ' · ')} »`);
  check(faux.appels.filter((x) => x.nom === 'fournil_classement').pop().corps.p_periode === 'total', 'fournil_classement(total)');
  await page.evaluate(() => { const f = document.querySelector('#feuille'); f.scrollTop = f.scrollHeight; }); await sleep(200);
  await page.screenshot({ path: out + '/05-tous-les-temps-loin.png' });

  // ─── une grosse fortune : sa ligne en tête, mise en avant ───
  await page.evaluate(() => window.__fournil.give(5e9)); await libererEnvois();
  await page.tap('[data-a="close"]'); await sleep(300);
  const nPub = publies().length;
  await ouvrir('semaine');
  await attendre(() => page.evaluate(() => /^1/.test(((document.querySelector('#feuille .cl-ligne.moi .cl-rang') || {}).innerText || '').trim())), 5000);
  const haut = await page.evaluate(() => { const m = document.querySelector('#feuille .cl-ligne.moi'), r = m.getBoundingClientRect(), s = getComputedStyle(m); return { txt: m.innerText.replace(/\s+/g, ' '), sep: !!document.querySelector('#feuille .cl-sep'), fond: s.backgroundColor, h: r.height, n: document.querySelectorAll('#feuille .cl-ligne').length }; });
  check(!(await page.evaluate(() => document.querySelector('#feuille .cl-place'))), 'en tête de liste : pas de résumé en double, sa ligne se voit');
  check(publies().length === nPub + 1 && /^1er Paulo toi \d/.test(haut.txt) && !haut.sep && haut.fond !== 'rgba(0, 0, 0, 0)' && haut.h >= 48, `à l’ouverture de la feuille : sa fortune part d’abord, puis la liste ; sa ligne en tête, mise en avant : « ${haut.txt} »`);
  await page.screenshot({ path: out + '/06-ma-ligne-en-tete.png' });
  const nTot = faux.appels.length;
  await page.tap('[data-tab="total"]');
  await attendre(() => page.evaluate(() => /^1er Paulo/.test(document.querySelector('#feuille .cl-ligne.moi').innerText.replace(/\s+/g, ' '))), 5000);
  check(faux.appels.slice(nTot).some((x) => x.nom === 'fournil_classement' && x.corps.p_periode === 'total') && /^1er Paulo/.test(await page.evaluate(() => document.querySelector('#feuille .cl-ligne.moi').innerText.replace(/\s+/g, ' '))), 'tous les temps : la liste gardée était périmée par son envoi, elle est relue : 1er aussi');
  await page.tap('[data-tab="semaine"]'); await sleep(300);
  check(await page.evaluate(() => document.querySelector('[data-tab="semaine"]').getAttribute('aria-selected') === 'true' && !!document.querySelector('#feuille .cl-liste')), 'retour à « Cette semaine » : la liste revient tout de suite (gardée en mémoire)');
  await page.tap('[data-a="close"]'); await sleep(400);
  const carte2 = await page.evaluate(() => document.querySelector('#page-journal .cl-carte').innerText);
  check(/1er cette semaine sur 4\d/.test(carte2) && /1er de tous les temps sur 61/.test(carte2), 'le Journal montre sa place : « ' + carte2.split('\n').pop() + ' »');
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
  check(!!fond && fond.corps.p_fortune >= attendu && fond.corps.p_fortune - attendu < 1e5 && faux.joueurs.get(e2.id).fortune === fond.corps.p_fortune, 'la page passe en arrière-plan : la fortune part aussitôt (' + (fond && fond.corps.p_fortune) + ')');
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

  // ─── à 320 px : un long pseudo et une très grosse fortune tiennent sur leur ligne ───
  const c2 = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
  await c2.route(SUPA + '/rest/v1/rpc/*', gerer);
  const p3 = await c2.newPage(); suivre(p3);
  await p3.goto(BASE + '/fournil/'); await sleep(1200);
  await p3.evaluate(() => { window.__fournil.give(123.4e15); window.__fournil.feuilleClassement('total'); });
  await attendre(() => p3.evaluate(() => !!document.querySelector('#feuille .cl-liste')));
  await p3.tap('[data-a="cl-rejoindre"]'); await sleep(300);
  await p3.fill('#cl-champ', 'Éloïse Marguerit'); await p3.tap('[data-a="cl-valider"]');
  await attendre(() => p3.evaluate(() => !!document.querySelector('#feuille .cl-ligne.moi')), 8000); await sleep(400);
  const etroit = await p3.evaluate(() => { const f = document.querySelector('#feuille'), m = document.querySelector('#feuille .cl-ligne.moi'), r = m.getBoundingClientRect(); return { large: f.scrollWidth <= f.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1, dedans: r.right <= innerWidth && r.left >= 0, val: m.querySelector('.cl-val').getBoundingClientRect().right <= r.right + 1, txt: m.innerText.replace(/\s+/g, ' ') }; });
  check(etroit.large && etroit.dedans && etroit.val && /^1er/.test(etroit.txt), 'à 320 px : rien ne déborde, un pseudo de 16 lettres et une fortune de 123 Bd € tiennent sur leur ligne (« ' + etroit.txt + ' »)');
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
