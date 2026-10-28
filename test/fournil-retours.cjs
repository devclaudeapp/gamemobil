// Les idées, les bugs et les votes (src/retours.js, src/photo.js, src/classement.js : retourEnvoyer, votesOuverts, voter, adminMoi,
// adminRetours, adminRetourImage, adminRetourEtat, adminVoteCreer, adminVoteFermer), dans la vraie page (fournil/ servie en local), sur un
// téléphone en portrait (390 × 844). Supabase est SIMULÉ (page.route, comme test/fournil-chat.cjs) : les fonctions du contrat
// (supabase/fournil-retours.sql) en mémoire, avec leurs refus (trop-vite, quota, pas-admin, fini…) ; le classement juste ce qu'il faut.
// Parcours : le bouton rond (l'ampoule) sous la bulle du chat, rien au réseau avant d'avoir rejoint ; sa pastille (un vote pas encore
// voté) ; le bandeau du vote sous l'enseigne (caché pendant une feuille) ; la feuille sans pseudo (« Rejoins le classement pour écrire », les résultats sans les boutons) ; une idée ;
// un bug avec une capture de 3000 × 2000 compressée sous 350 Ko et ses infos (version, appareil, écran, quartier, les 3 dernières entrées
// du journal) ; trop vite, le quota ; voter, les résultats en barres, changer son vote, le compte à rebours, les votes finis ; un joueur
// qui n'est pas admin ne voit pas l'onglet ; l'admin : la liste, un texte piégé affiché en texte, l'image, les infos, Vu / Fait / Refusé
// avec une note, Nouveaux / Tous, créer un vote (il apparaît ensuite en bandeau), fermer un vote ; le SQL absent (« bientôt ») ; sans
// configuration, pas de bouton ; aucune erreur dans la console.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules TZ=Europe/Paris node test/fournil-retours.cjs   (captures dans test/shots/retours/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_RETOURS || 8872, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let config = 'normale'; // 'aucune' : pas de config.js (comme l'artefact)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/fournil/config.js' && config === 'aucune') { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'retours'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };

// ─── le faux Supabase : le classement (ce qui sert ici) et les retours du contrat, en mémoire ───
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const IMG = /^data:image\/(webp|jpeg|png);base64,/;
const faux = { appels: [], joueurs: new Map(), admins: new Set(), retours: [], votes: [], mode: 'normal', ecart: 0, envois: new Map() };
const autre = (pseudo) => { const id = crypto.randomUUID(); faux.joueurs.set(id, { pseudo, jeton: sha(id) }); return id; };
const ident = (c) => { const j = faux.joueurs.get(c.p_id); return !j ? 'inconnu' : j.jeton !== sha(c.p_jeton) ? 'jeton' : null; };
const deposer = (joueur, o, cree) => { const n = faux.retours.length ? faux.retours[faux.retours.length - 1].n + 1 : 11; faux.retours.push({ n, joueur, pseudo: faux.joueurs.get(joueur).pseudo, type: o.type, texte: o.texte, image: o.image || null, infos: o.infos || null, cree: cree || Date.now(), etat: 'nouveau', note: null }); return n; };
const ouvrirVote = (question, options, finDans, choix) => { const n = faux.votes.length ? faux.votes[faux.votes.length - 1].n + 1 : 1; faux.votes.push({ n, question, options, debut: Date.now(), fin: Date.now() + finDans, ferme: false, choix: new Map(Object.entries(choix || {})) }); return n; };
const vueVote = (v, qui) => { const voix = v.options.map((o, i) => [...v.choix.values()].filter((x) => x === i).length); return { n: v.n, question: v.question, options: v.options, fin: v.fin, voix, total: v.choix.size, moi: qui && v.choix.has(qui) ? v.choix.get(qui) : null }; };
const fini = (v) => v.ferme || v.fin <= Date.now();
const pasAdmin = (c) => { const e = ident(c); return e ? { ok: false, erreur: e } : !faux.admins.has(c.p_id) ? { ok: false, erreur: 'pas-admin' } : null; };
const RPC = {
  fournil_publier: (c) => {
    const j = faux.joueurs.get(c.p_id); if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' };
    faux.joueurs.set(c.p_id, { pseudo: c.p_pseudo, jeton: sha(c.p_jeton) });
    if (c.p_pseudo === 'jewishbread') faux.admins.add(c.p_id); // la ligne SQL donnée sur la page : le propriétaire est admin
    return { ok: true, erreur: null, version: 6, rang_semaine: 1, rang_total: 1, joueurs: faux.joueurs.size, joueurs_semaine: 1, semaine: '2026-10-12', photo_maj: new Date().toISOString() };
  },
  fournil_classement: () => ({ version: 6, semaine: '2026-10-12', joueurs: 1, lignes: [], moi: null }),
  fournil_recompenses: () => ({ ok: true, erreur: null, podiums: [], derniere: null, pourboires: [], objectif: null }),
  fournil_objectif: () => ({ semaine: '2026-10-12', but: 300, total: 12, joueurs: 1, reussi: false, pourcent: 4 }),
  fournil_vu: () => ({ ok: true }),
  fournil_mes_cadeaux: () => ({ ok: true, cadeaux: [] }),
  fournil_chat_lire: () => ({ ok: true, messages: [], dernier: 0 }),
  fournil_retour_envoyer: (c) => {
    const e = ident(c); if (e) return { ok: false, erreur: e };
    if (faux.mode === 'banni') return { ok: false, erreur: 'banni' };
    if (!['idee', 'bug'].includes(c.p_type)) return { ok: false, erreur: 'type' };
    const texte = String(c.p_texte || '').trim();
    if (!texte) return { ok: false, erreur: 'vide' };
    if (Array.from(texte).length > 1000) return { ok: false, erreur: 'long' };
    if (c.p_image && (!IMG.test(c.p_image) || c.p_image.length > 480000)) return { ok: false, erreur: 'image' };
    if (c.p_infos != null && (typeof c.p_infos !== 'object' || Buffer.byteLength(JSON.stringify(c.p_infos)) > 2048)) return { ok: false, erreur: 'infos' };
    const l = faux.envois.get(c.p_id) || [];
    if (l.length && Date.now() - l[l.length - 1] < faux.ecart) return { ok: false, erreur: 'trop-vite' };
    if (l.length >= 5) return { ok: false, erreur: 'quota' };
    l.push(Date.now()); faux.envois.set(c.p_id, l);
    return { ok: true, erreur: null, n: deposer(c.p_id, { type: c.p_type, texte, image: c.p_image, infos: c.p_infos }) };
  },
  fournil_votes_ouverts: (c) => {
    const qui = c.p_id && !ident(c) ? c.p_id : null;
    return { ok: true, votes: faux.votes.filter((v) => !fini(v)).sort((a, b) => b.n - a.n).slice(0, 10).map((v) => vueVote(v, qui)), finis: faux.votes.filter((v) => fini(v) && v.fin > Date.now() - 7 * 864e5).sort((a, b) => b.fin - a.fin).slice(0, 5).map((v) => vueVote(v, qui)) };
  },
  fournil_voter: (c) => {
    const e = ident(c); if (e) return { ok: false, erreur: e };
    const v = faux.votes.find((x) => x.n === +c.p_n); if (!v) return { ok: false, erreur: 'absent' };
    const compte = () => { const x = vueVote(v, c.p_id); return { voix: x.voix, total: x.total }; }; // les voix et le total, même en cas de refus
    if (fini(v)) return Object.assign({ ok: false, erreur: 'fini' }, compte());
    if (!Number.isInteger(c.p_option) || c.p_option < 0 || c.p_option >= v.options.length) return Object.assign({ ok: false, erreur: 'option' }, compte());
    v.choix.set(c.p_id, c.p_option); const x = vueVote(v, c.p_id); return { ok: true, erreur: null, voix: x.voix, total: x.total };
  },
  fournil_admin_moi: (c) => { const e = ident(c); return e ? { ok: false, erreur: e } : { ok: true, admin: faux.admins.has(c.p_id) }; },
  fournil_admin_retours: (c) => {
    const x = pasAdmin(c); if (x) return x;
    const l = faux.retours.filter((r) => (c.p_filtre === 'tout' || r.etat === 'nouveau') && (!c.p_avant || r.n < c.p_avant)).sort((a, b) => b.n - a.n).slice(0, 30);
    return { ok: true, nouveaux: faux.retours.filter((r) => r.etat === 'nouveau').length, retours: l.map((r) => ({ n: r.n, pseudo: r.pseudo, type: r.type, texte: r.texte, a_image: !!r.image, infos: r.infos, cree: new Date(r.cree).toISOString(), etat: r.etat, note: r.note })) };
  },
  fournil_admin_retour_image: (c) => { const x = pasAdmin(c); if (x) return x; const r = faux.retours.find((y) => y.n === +c.p_n); return { ok: true, data: r ? r.image : null }; },
  fournil_admin_retour_etat: (c) => {
    const x = pasAdmin(c); if (x) return x;
    const r = faux.retours.find((y) => y.n === +c.p_n); if (!r) return { ok: false, erreur: 'absent' };
    if (!['nouveau', 'vu', 'fait', 'refuse'].includes(c.p_etat)) return { ok: false, erreur: 'etat' };
    if (c.p_note != null && Array.from(String(c.p_note)).length > 300) return { ok: false, erreur: 'long' };
    r.etat = c.p_etat; if (c.p_note != null) r.note = c.p_note === '' ? null : c.p_note; return { ok: true }; // p_note null : la note reste ; '' : effacée
  },
  fournil_admin_vote_creer: (c) => {
    const x = pasAdmin(c); if (x) return x;
    if (!c.p_question || String(c.p_question).length > 200) return { ok: false, erreur: 'question' };
    if (!Array.isArray(c.p_options) || c.p_options.length < 2 || c.p_options.length > 4) return { ok: false, erreur: 'options' };
    if (!Number.isInteger(c.p_heures) || c.p_heures < 1 || c.p_heures > 168) return { ok: false, erreur: 'duree' };
    return { ok: true, n: ouvrirVote(c.p_question, c.p_options, c.p_heures * 3600e3) };
  },
  fournil_admin_vote_fermer: (c) => { const x = pasAdmin(c); if (x) return x; const v = faux.votes.find((y) => y.n === +c.p_n); if (!v) return { ok: false, erreur: 'absent' }; v.ferme = true; v.fin = Date.now(); return { ok: true }; },
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1]; let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps, t: Date.now() });
  const absent = () => route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: `Could not find the function public.${nom}` }) });
  if (faux.mode === 'pas-ouvert' && /^fournil_(retour|vote|admin)/.test(nom)) return absent(); // supabase/fournil-retours.sql pas encore collé
  if (!RPC[nom]) return absent();
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps || {})) });
}
const appels = (nom) => faux.appels.filter((a) => a.nom === nom);
const dernier = (nom) => { const l = appels(nom); return l.length ? l[l.length - 1].corps : null; };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_FAILED|404|ERR_CERT/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  // une capture d'écran d'un autre boulanger (un croissant dessiné), faite par le navigateur
  const atelier = await browser.newPage();
  const capture = await atelier.evaluate(() => {
    const cv = document.createElement('canvas'), x = cv.getContext('2d'); cv.width = 640; cv.height = 480;
    const g = x.createRadialGradient(320, 240, 20, 320, 240, 400); g.addColorStop(0, '#FFF3C4'); g.addColorStop(1, '#E8A54A'); x.fillStyle = g; x.fillRect(0, 0, 640, 480);
    x.font = '260px sans-serif'; x.textAlign = 'center'; x.fillText('🥐', 320, 330); return cv.toDataURL('image/jpeg', 0.8);
  });
  await atelier.close();

  const nouveau = async (taille) => {
    const ctx = await browser.newContext({ viewport: taille || { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block' });
    await ctx.addInitScript(() => { window.__sansQuartier = true; window.__tchatPas = { ouvert: 4000, ferme: 60000 }; window.__retoursPas = { votes: 1500, admin: 1500 }; }); // des lectures rapprochées pour le test (les vraies : 5 min)
    await ctx.route(SUPA + '/rest/v1/rpc/*', gerer);
    return ctx;
  };
  const etat = (p) => p.evaluate(() => window.__fournil.retours.etat());
  const note = (p) => p.evaluate(() => { const n = document.querySelector('#rt-corps .rt-note'); return n && !n.hidden ? n.textContent : ''; });
  const bandeau = (p) => p.evaluate(() => { const b = document.querySelector('#vote-bandeau'); return b.hidden ? '' : b.textContent.replace(/\s+/g, ' ').trim(); });
  const pastille = (p) => p.evaluate(() => { const x = document.querySelector('#b-idees .rt-pastille'); return x.hidden ? '' : x.textContent; });

  // ─── ce qui est déjà là : un vote en cours (deux voix), un vote fini, et des retours (dont un piégé et un avec capture) ───
  const mamie = autre('Mamie Jo'), tonton = autre('Tonton Jo'), pirate = autre('Pirate');
  const reste0 = (2 * 24 + 4) * 3600e3 + 30 * 60e3; // « encore 2 j 4 h »
  const nVote = ouvrirVote('Quelle recette ajouter ensuite ?', ['Éclair au café', 'Tarte tatin', 'Paris-Brest'], reste0, { [mamie]: 0, [tonton]: 1 });
  const nFini = ouvrirVote('La couleur de la vitrine ?', ['Rose', 'Menthe'], 3600e3, { [mamie]: 1, [tonton]: 1, [pirate]: 0 }); faux.votes[1].fin = Date.now() - 2 * 864e5; faux.votes[1].ferme = true;
  const nPiege = deposer(pirate, { type: 'idee', texte: '<img src=x onerror="window.__pirate=1">des <b>croissants</b> partout' }, Date.now() - 3 * 3600e3);
  const nCapture = deposer(tonton, { type: 'bug', texte: 'Le four clignote quand je reviens dans le jeu.', image: capture, infos: { version: 'abc123def456', appareil: 'iPhone · iOS 17.5 · Safari 17.5', ecran: '390×844 · 390×664 · ×3', quartier: 'Le Village', journal: [{ t: Date.now() - 864e5, r: 'visible', o: 3600, s: 3600, n: 'feuille' }] } }, Date.now() - 3600e3);

  const ctx = await nouveau();
  const page = await ctx.newPage(); suivre(page);
  await page.goto(BASE + '/fournil/'); await sleep(1200);

  // ─── le bouton : sous la bulle du chat, seulement si le classement est configuré ; sa pastille : le vote pas encore voté ───
  const bouton = await page.evaluate(() => { const b = document.querySelector('#b-idees'), c = document.querySelector('#b-tchat'), r = b.getBoundingClientRect(), rc = c.getBoundingClientRect(); return { vu: !b.hidden && r.width >= 40, sousChat: !c.hidden && Math.abs(r.left - rc.left) < 2 && r.top >= rc.bottom, dernier: document.querySelector('#coin').lastElementChild === b, droite: innerWidth - r.right, svg: !!b.querySelector('svg'), label: b.getAttribute('aria-label') }; });
  check(bouton.vu && bouton.sousChat && bouton.dernier && bouton.svg && bouton.droite <= 14, `le bouton rond (l’ampoule) est dans le coin, sous la bulle du chat ${JSON.stringify(bouton)}`);
  check(await page.evaluate(() => window.__fournil.retours.R.votes === 300000 && window.__fournil.retours.R.admin === 300000), 'les lectures : toutes les 5 min (le test les rapproche)');
  await sleep(5000);
  check(!appels('fournil_votes_ouverts').length && !appels('fournil_admin_moi').length && (await pastille(page)) === '' && (await bandeau(page)) === '', 'pas encore rejoint : aucune lecture en arrière-plan (rien ne part avant d’avoir rejoint), ni pastille ni bandeau');

  // ─── la feuille sans pseudo : on lit, on n'écrit pas ───
  await page.tap('#b-idees');
  check(await attendre(() => page.evaluate(() => !document.querySelector('#idees').hidden && document.querySelectorAll('.rt-carte').length === 3)), 'toucher le bouton : la feuille plein écran, les cartes « Proposer une idée », « Signaler un bug » (et le vote qui attend)');
  const v0 = appels('fournil_votes_ouverts')[0];
  check(v0 && Object.keys(v0.corps).length === 0, `l’ouverture de la feuille lit les votes ; sans pseudo, sans p_id ni p_jeton ${JSON.stringify(v0 && v0.corps)}`);
  const sansPseudo = await page.evaluate(() => ({ rejoindre: (document.querySelector('#rt-corps [data-rt="rejoindre"]') || {}).innerText || '', admin: document.querySelector('[data-rt-onglet="admin"]').hidden, cartes: [...document.querySelectorAll('.rt-carte b')].map((b) => b.textContent) }));
  check(/Rejoins le classement pour écrire/.test(sansPseudo.rejoindre) && sansPseudo.admin && sansPseudo.cartes[0] === 'Proposer une idée' && sansPseudo.cartes[1] === 'Signaler un bug', `sans pseudo : « Rejoins le classement pour écrire », pas d’onglet Admin ${JSON.stringify(sansPseudo)}`);
  await page.tap('.rt-carte.idee');
  check(await attendre(async () => /Rejoins le classement pour écrire/.test(await note(page))) && (await etat(page)).vue === 'accueil', 'toucher « Proposer une idée » sans pseudo : il faut rejoindre le classement');
  check((await page.evaluate(() => window.__fournil.classement().retourEnvoyer({ type: 'idee', texte: 'coucou' }))).etat === 'pas-rejoint' && !appels('fournil_retour_envoyer').length, 'retourEnvoyer sans pseudo : « pas-rejoint », rien ne part');
  await page.screenshot({ path: out + '/03a-feuille-sans-pseudo.png' });
  await page.tap('[data-rt-onglet="votes"]');
  check(await attendre(() => page.evaluate(() => document.querySelectorAll('.rt-vote:not(.fini) .rt-barre').length === 3 && !document.querySelector('.rt-option'))), 'les votes sans pseudo : les résultats en barres, pas de boutons');
  check(await page.evaluate(() => /Rejoins le classement pour voter/.test(document.querySelector('.rt-vote [data-rt="rejoindre"]').innerText)), '« Rejoins le classement pour voter »');
  await page.tap('[data-rt="fermer"]'); await sleep(300);

  // ─── rejoindre : l'onglet Admin reste caché (pas admin) ───
  check((await page.evaluate(() => window.__fournil.classement().choisirPseudo('Lucas').then((r) => r.etat))) === 'ok', 'rejoindre le classement (pseudo Lucas)');
  const id = await page.evaluate(() => window.__fournil.classement().etat().id);
  check(await attendre(() => appels('fournil_admin_moi').some((a) => a.corps.p_id === id)), 'avec un pseudo : fournil_admin_moi(p_id, p_jeton)');
  check(await attendre(() => appels('fournil_votes_ouverts').some((a) => a.corps.p_id === id && /^[0-9a-f]{64}$/.test(a.corps.p_jeton))), 'les votes se relisent avec p_id et p_jeton (le serveur dit « moi »)');
  await sleep(300);
  check(!(await etat(page)).admin && await page.evaluate(() => document.querySelector('[data-rt-onglet="admin"]').hidden), 'Lucas n’est pas admin : pas d’onglet Admin');
  const pa = await page.evaluate(() => window.__fournil.classement().adminRetours('nouveau'));
  check(pa.etat === 'refus' && pa.erreur === 'pas-admin', 'adminRetours pour un joueur : refusé (« pas-admin »)');

  // ─── la pastille et le bandeau du vote, sous l'enseigne ───
  check(await attendre(async () => (await pastille(page)) === '1', 7000), 'rejoint : la pastille dit « 1 » (un vote pas encore voté)');
  check(/un vote t’attend/.test(await page.evaluate(() => document.querySelector('#b-idees').getAttribute('aria-label'))), 'le bouton le dit : « un vote t’attend »');

  const bd = await bandeau(page);
  check(/^🗳 Vote : Quelle recette ajouter ensuite \? encore 2 j 4 h · toucher pour voter$/.test(bd), `le bandeau dans la boutique : « ${bd} »`);
  const pos = await page.evaluate(() => { const b = document.querySelector('#vote-bandeau').getBoundingClientRect(), e = document.querySelector('#enseigne').getBoundingClientRect(), c = document.querySelector('#coin').getBoundingClientRect(); return { sous: b.top >= e.bottom, centre: Math.abs((b.left + b.right) / 2 - innerWidth / 2) < 2, libre: b.right <= c.left }; });
  check(pos.sous && pos.centre && pos.libre, `sous l’enseigne, centré, sans toucher la colonne du coin ${JSON.stringify(pos)}`);
  await page.screenshot({ path: out + '/01-bouton-bandeau.png' });
  await page.screenshot({ path: out + '/01b-bouton-zoom.png', clip: { x: 230, y: 40, width: 160, height: 330 } });
  await page.screenshot({ path: out + '/02-bandeau-boutique.png', clip: { x: 0, y: 40, width: 390, height: 140 } });
  await page.evaluate(() => window.__fournil.nouveautes());
  check(await attendre(async () => (await bandeau(page)) === '', 2000), 'une feuille du jeu ouverte : le bandeau se cache');
  await page.tap('#feuille [data-a="close"]');
  check(await attendre(async () => (await bandeau(page)) !== '', 2000), 'la feuille fermée : il revient');


  // ─── une idée ───
  await page.tap('#b-idees'); await sleep(300);
  await page.screenshot({ path: out + '/03-feuille-idees.png' });
  await page.tap('.rt-carte.idee');
  check(await page.evaluate(() => !!document.querySelector('#rt-texte') && !document.querySelector('.rt-infos') && /Proposer une idée/.test(document.querySelector('.rt-h3').textContent)), 'la carte « 💡 Proposer une idée » : le texte, la capture, pas d’infos jointes');
  await page.tap('[data-rt="envoyer"]');
  check(await attendre(async () => /Écris quelques mots/.test(await note(page))) && !appels('fournil_retour_envoyer').length, 'Envoyer à vide : « Écris quelques mots avant d’envoyer. », rien ne part');
  await page.fill('#rt-texte', '  Une vitrine de macarons, avec toutes leurs couleurs 🌈  ');
  const nCar = Array.from('  Une vitrine de macarons, avec toutes leurs couleurs 🌈  ').length;
  check(await page.evaluate((n) => document.querySelector('.rt-compte').textContent === `${n}/1000`, nCar), `le compte des caractères suit (${nCar}/1000)`);
  await page.tap('[data-rt="envoyer"]');
  check(await attendre(() => appels('fournil_retour_envoyer').length === 1), 'Envoyer : fournil_retour_envoyer');
  const e1 = appels('fournil_retour_envoyer')[0].corps;
  check(e1.p_id === id && /^[0-9a-f]{64}$/.test(e1.p_jeton) && e1.p_type === 'idee' && e1.p_texte === 'Une vitrine de macarons, avec toutes leurs couleurs 🌈' && e1.p_image === null && e1.p_infos === null, `(p_id, p_jeton, p_type idee, p_texte, p_image null, p_infos null) ${JSON.stringify(Object.assign({}, e1, { p_jeton: '…' }))}`);
  check(await attendre(() => page.evaluate(() => /Merci !/.test(document.querySelector('.rt-merci').innerText) && /Ton idée est bien arrivée/.test(document.querySelector('.rt-merci').innerText))), 'le merci : « Ton idée est bien arrivée »');
  await page.screenshot({ path: out + '/03b-merci.png' });
  await page.tap('[data-rt="accueil"]');

  // ─── un bug : une capture de 3000 × 2000 (PNG fait dans la page), compressée sous 350 Ko, et les infos jointes ───
  await page.evaluate(() => { window.__fournil.st.journalRetours = [1, 2, 3, 4].map((k) => ({ t: Date.now() - (5 - k) * 3600e3, r: k % 2 ? 'visible' : 'lancement', o: 600 * k, s: 500 * k, g: 12, n: 'feuille', h: 1 })); });
  await page.tap('.rt-carte.bug');
  await page.fill('#rt-texte', 'Le bouton Bonus ne répond plus après une partie à l’Atelier.');
  const png = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2000; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 3000, 2000); g.addColorStop(0, '#FFC84A'); g.addColorStop(.5, '#FF6B8B'); g.addColorStop(1, '#5FD3A4'); x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
    const im = x.getImageData(0, 0, 3000, 2000), dd = im.data; for (let i = 0; i < dd.length; i += 4) { const r = (Math.random() - 0.5) * 90; dd[i] += r; dd[i + 1] += r; dd[i + 2] -= r; } x.putImageData(im, 0, 0); // du grain : le pire pour la compression
    x.font = 'bold 700px sans-serif'; x.textAlign = 'center'; x.fillText('🐞', 1500, 1250);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png')), f = new File([blob], 'capture.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('#rt-fichier'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    return blob.size;
  });
  check(await attendre(async () => (await etat(page)).brouillon.bug.image > 0, 15000), `la capture (PNG de 3000 × 2000, ${Math.round(png / 1024)} Ko) est prête`);
  const bb = (await etat(page)).brouillon.bug;
  check(bb.image <= 350000 && bb.type === 'image/webp', `compressée : ${bb.image} caractères en base64 (≤ 350 Ko), en ${bb.type}`);
  check(await page.evaluate(() => /Capture prête/.test(document.querySelector('.rt-capture').textContent) && /^data:image\/webp/.test(document.querySelector('.rt-capture img').src)), 'l’aperçu : « Capture prête »');
  const dims = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = document.querySelector('.rt-capture img').src; }));
  check(Math.max(...dims) <= 1280 && Math.abs(dims[0] / dims[1] - 1.5) < 0.01, `le plus grand côté ≤ 1280 px, les proportions gardées (${dims.join(' × ')})`);
  check(await page.evaluate(() => document.querySelector('#rt-texte').value === 'Le bouton Bonus ne répond plus après une partie à l’Atelier.'), 'le texte tapé est resté (la feuille repeinte garde le brouillon)');
  await page.tap('.rt-infos summary');
  const vueInfos = await page.evaluate(() => document.querySelector('.rt-infos').innerText);
  check(/Infos jointes au bug/.test(vueInfos), 'les infos jointes, montrées avant l’envoi');
  const version = await page.evaluate(() => window.FOURNIL_VERSION);
  check(vueInfos.includes(version) && /Appareil/.test(vueInfos) && /Écran/.test(vueInfos) && /Quartier/.test(vueInfos) && /Journal/.test(vueInfos), `les infos dépliées : version (${version}), appareil, écran, quartier, journal`);
  await page.screenshot({ path: out + '/03c-bug-capture-infos.png' });
  await page.tap('[data-rt="envoyer"]');
  check(await attendre(() => appels('fournil_retour_envoyer').length === 2, 15000), 'Envoyer le bug');
  const e2 = appels('fournil_retour_envoyer')[1].corps, inf = e2.p_infos || {};
  check(e2.p_type === 'bug' && /^data:image\/webp;base64,/.test(e2.p_image) && e2.p_image.length <= 350000, `p_type bug, p_image : une data URL WebP de ${e2.p_image && e2.p_image.length} caractères`);
  const st0 = await page.evaluate(() => window.__fournil.st.journalRetours.slice(-3).map((e) => e.t));
  check(inf.version === version && /Chrome|Safari|Android|iPhone|Linux/.test(inf.appareil) && inf.appareil.length <= 80 && /^\d+×\d+ · 390×844 · ×2$/.test(inf.ecran) && typeof inf.quartier === 'string' && inf.quartier.length > 0, `p_infos : version, appareil en bref (« ${inf.appareil} »), écran (« ${inf.ecran} »), quartier (« ${inf.quartier} »)`);
  check(Array.isArray(inf.journal) && inf.journal.length === 3 && inf.journal.map((e) => e.t).join() === st0.join() && inf.journal.every((e) => Object.keys(e).join() === 't,r,o,s,n') && Buffer.byteLength(JSON.stringify(inf)) <= 2048, `les 3 dernières entrées du journal, réduites à t, r, o, s, n (${Buffer.byteLength(JSON.stringify(inf))} octets ≤ 2 Ko)`);
  check(await attendre(() => page.evaluate(() => /Ton signalement est bien arrivé/.test(document.querySelector('.rt-merci').innerText))) && (await etat(page)).brouillon.bug.image === 0, 'le merci du bug ; le brouillon est vidé');
  await page.tap('[data-rt="accueil"]');

  // ─── trop vite (le serveur : 30 s), puis le quota (5 par jour) ───
  faux.ecart = 30e3;
  await page.tap('.rt-carte.idee'); await page.fill('#rt-texte', 'Encore une idée !'); await page.tap('[data-rt="envoyer"]');
  check(await attendre(async () => /Doucement ! Un envoi toutes les 30 secondes/.test(await note(page))) && (await page.inputValue('#rt-texte')) === 'Encore une idée !', 'le serveur dit « trop-vite » : « Doucement ! Un envoi toutes les 30 secondes. », le texte reste');
  faux.ecart = 0;
  for (let k = 0; k < 3; k++) await page.evaluate((k) => window.__fournil.classement().retourEnvoyer({ type: 'idee', texte: `idée ${k}` }), k);
  check(faux.envois.get(id).length === 5, 'cinq retours envoyés aujourd’hui');
  await page.tap('[data-rt="envoyer"]');
  check(await attendre(async () => /Tu as déjà envoyé 5 retours aujourd’hui/.test(await note(page))), 'le sixième : « Tu as déjà envoyé 5 retours aujourd’hui : merci ! Reviens demain. »');
  const longue = await page.evaluate(() => window.__fournil.classement().retourEnvoyer({ type: 'idee', texte: 'x'.repeat(1001) }));
  check(longue.etat === 'refus' && longue.erreur === 'long' && appels('fournil_retour_envoyer').length === 7, 'plus de 1000 caractères : refusé par le téléphone, rien ne part');
  await page.tap('[data-rt="fermer"]'); await sleep(300);

  // ─── voter : le bandeau, les gros boutons, les résultats, changer son vote, le compte à rebours ───
  check(/encore 2 j 4 h/.test(await bandeau(page)), 'le bandeau est toujours là (pas encore voté)');
  await page.tap('#vote-bandeau');
  check(await attendre(() => page.evaluate(() => !document.querySelector('#idees').hidden && document.querySelector('[data-rt-onglet="votes"]').classList.contains('actif') && document.querySelectorAll('.rt-option').length === 3)), 'toucher le bandeau : la feuille, sur l’onglet Votes, trois gros boutons');
  check(await bandeau(page) === '', 'la feuille ouverte : le bandeau se cache');
  const fv = await page.evaluate(() => ({ q: document.querySelector('.rt-vote .rt-q').textContent.replace(/\u00a0/g, ' '), reste: document.querySelector('.rt-vote .rt-reste').textContent, opts: [...document.querySelectorAll('.rt-option')].map((b) => b.textContent), h: Math.min(...[...document.querySelectorAll('.rt-option')].map((b) => b.getBoundingClientRect().height)) }));
  check(fv.q === 'Quelle recette ajouter ensuite ?' && /encore 2 j 4 h/.test(fv.reste) && fv.opts.join('|') === 'Éclair au café|Tarte tatin|Paris-Brest' && fv.h >= 48, `la question, le compte à rebours (« ${fv.reste} »), les options en gros boutons (${Math.round(fv.h)} px)`);
  check(await page.evaluate(() => /Votes terminés/.test(document.querySelector('#rt-corps').textContent) && document.querySelector('.rt-vote.fini .rt-q').textContent === 'La couleur de la vitrine\u00a0?' && document.querySelectorAll('.rt-vote.fini .rt-barre').length === 2), 'en dessous : les votes terminés, avec leurs résultats');
  await page.screenshot({ path: out + '/04-vote.png' });
  await page.tap('.rt-option[data-o="1"]');
  check(await attendre(() => appels('fournil_voter').length === 1), 'toucher « Tarte tatin » : fournil_voter');
  const vt = appels('fournil_voter')[0].corps;
  check(vt.p_id === id && vt.p_n === nVote && vt.p_option === 1, '(p_id, p_jeton, p_n, p_option 1)');
  check(await attendre(() => page.evaluate(() => document.querySelectorAll('.rt-vote:not(.fini) .rt-barre').length === 3)), 'les résultats en barres');
  const res = await page.evaluate(() => [...document.querySelectorAll('.rt-vote:not(.fini) .rt-barre')].map((b) => ({ o: b.querySelector('.rt-barre-txt b').textContent, pc: b.querySelector('.rt-barre-pc b').textContent, voix: b.querySelector('.rt-barre-pc small').textContent, moi: b.classList.contains('moi'), w: b.querySelector('.rt-barre-fond').style.width })));
  check(res[0].pc === '33 %' && res[1].pc === '67 %' && res[2].pc === '0 %' && res[1].voix === '2 voix' && res[1].moi && !res[0].moi && res[1].w === '67%', `les pourcentages et les voix (${res.map((r) => `${r.o} ${r.pc} ${r.voix}${r.moi ? ' ✓' : ''}`).join(' · ')})`);
  check(await page.evaluate(() => /ton choix/.test(document.querySelector('.rt-barre.moi').innerText) && /3 votants/.test(document.querySelector('.rt-vote .rt-total').textContent) && !!document.querySelector('[data-rt="changer"]')), '« ton choix », « 3 votants », « Changer mon vote »');
  await page.screenshot({ path: out + '/05-resultats.png' });
  await page.tap('[data-rt="changer"]');
  check(await page.evaluate(() => document.querySelectorAll('.rt-option').length === 3 && document.querySelector('.rt-option.choisi').dataset.o === '1'), '« Changer mon vote » : les boutons reviennent, son choix marqué');
  await page.tap('.rt-option[data-o="2"]');
  check(await attendre(() => appels('fournil_voter').length === 2 && faux.votes[0].choix.get(id) === 2) && await attendre(() => page.evaluate(() => document.querySelector('.rt-barre.moi .rt-barre-txt b').textContent === 'Paris-Brest')), 'il vote « Paris-Brest » : le serveur a changé son choix, les barres suivent');
  await page.tap('[data-rt="fermer"]'); await sleep(300);
  check(await bandeau(page) === '' && await pastille(page) === '', 'une fois voté : plus de bandeau, plus de pastille');
  check(await page.evaluate(() => { const r = window.__fournil.retours.reste; return r((2 * 24 + 4) * 3600e3 + 60e3) === 'encore 2 j 4 h' && r(3 * 3600e3 + 12 * 60e3) === 'encore 3 h 12 min' && r(5 * 60e3) === 'encore 5 min' && r(24 * 3600e3) === 'encore 1 j' && r(-1) === 'terminé'; }), 'le compte à rebours : « encore 2 j 4 h », « encore 3 h 12 min », « encore 5 min », « encore 1 j »');
  const rv = await page.evaluate((n) => window.__fournil.classement().voter(n, 0), nFini);
  check(rv.etat === 'refus' && rv.erreur === 'fini' && JSON.stringify(rv.voix) === '[1,2]' && rv.total === 3, 'voter pour un vote fini : refusé (« fini »), avec les voix et le total');

  // ─── l'admin : le propriétaire (pseudo jewishbread, marqué admin par la ligne SQL) ───
  const ctxA = await nouveau();
  const pageA = await ctxA.newPage(); suivre(pageA);
  await pageA.goto(BASE + '/fournil/'); await sleep(1000);
  check((await pageA.evaluate(() => window.__fournil.classement().choisirPseudo('jewishbread').then((r) => r.etat))) === 'ok', 'l’admin rejoint le classement (pseudo jewishbread)');
  const idA = await pageA.evaluate(() => window.__fournil.classement().etat().id);
  const nouveauxN = () => faux.retours.filter((r) => r.etat === 'nouveau').length;
  check(await attendre(async () => (await etat(pageA)).admin && (await pastille(pageA)) === String(nouveauxN()), 8000), `fournil_admin_moi répond true : la pastille de l’admin dit les retours nouveaux (« ${await pastille(pageA)} »)`);
  check(await pageA.evaluate(() => document.querySelector('#b-idees .rt-pastille').classList.contains('admin') && /nouveaux retours/.test(document.querySelector('#b-idees').getAttribute('aria-label'))), 'le bouton le dit : « … nouveaux retours »');
  await pageA.tap('#b-idees');
  check(await attendre(() => pageA.evaluate(() => !document.querySelector('[data-rt-onglet="admin"]').hidden)), 'la feuille : l’onglet « Admin » est là');
  await pageA.tap('[data-rt-onglet="admin"]');
  check(await attendre(() => pageA.evaluate((n) => document.querySelectorAll('.rt-ret').length === n, nouveauxN())), `la liste des retours nouveaux (${nouveauxN()})`);
  const lr = dernier('fournil_admin_retours');
  check(lr.p_id === idA && lr.p_filtre === 'nouveau' && lr.p_avant === null, 'fournil_admin_retours(p_id, p_jeton, p_filtre nouveau, p_avant null)');
  const cartes = await pageA.evaluate(() => [...document.querySelectorAll('.rt-ret')].map((c) => ({ n: +c.dataset.n, type: c.querySelector('.rt-type').textContent, pseudo: c.querySelector('.rt-ret-tete b').textContent, date: c.querySelector('.rt-ret-tete small').textContent, etat: c.querySelector('.rt-etat').textContent, img: !!c.querySelector('.rt-img'), infos: !!c.querySelector('.rt-infos-a') })));
  check(cartes[0].n > cartes[cartes.length - 1].n && cartes.every((c) => c.pseudo && /\d/.test(c.date) && c.etat === 'Nouveau'), 'une carte par retour, du plus récent au plus ancien : pseudo, type, date, état');
  const cBug = cartes.find((c) => c.n === nCapture);
  check(cBug && cBug.type === '🐞 Bug' && cBug.img && cBug.infos && cBug.pseudo === 'Tonton Jo', 'le bug de Tonton Jo : « 🐞 Bug », sa capture, ses infos');
  const piege = await pageA.evaluate((n) => { const c = document.querySelector(`.rt-ret[data-n="${n}"]`); return { txt: c.querySelector('.rt-txt').textContent, img: c.querySelectorAll('img').length, b: c.querySelectorAll('b').length, pirate: window.__pirate }; }, nPiege);
  check(piege.txt === '<img src=x onerror="window.__pirate=1">des <b>croissants</b> partout' && piege.img === 0 && piege.b === 1 && piege.pirate === undefined, 'le texte piégé (<img onerror>, <b>) s’affiche en texte, rien ne s’exécute');
  await pageA.evaluate((n) => document.querySelector(`.rt-ret[data-n="${n}"]`).scrollIntoView({ block: 'center' }), nCapture);
  await pageA.tap(`.rt-ret[data-n="${nCapture}"] .rt-img`);
  check(await attendre(() => pageA.evaluate((n) => { const i = document.querySelector(`.rt-ret[data-n="${n}"] .rt-img.chargee img`); return i && /^data:image\/jpeg;base64,/.test(i.src) && i.naturalWidth === 640; }, nCapture)) && dernier('fournil_admin_retour_image').p_n === nCapture, '« Voir la capture » : fournil_admin_retour_image(p_n), l’image s’affiche');
  await pageA.tap(`.rt-ret[data-n="${nCapture}"] .rt-img`);
  check(await pageA.evaluate(() => !document.querySelector('#rt-zoom').hidden && /^data:image\/jpeg/.test(document.querySelector('#rt-zoom img').src)), 'la toucher : elle s’agrandit');
  await pageA.tap('#rt-zoom'); await sleep(150);
  await pageA.tap(`.rt-ret[data-n="${nCapture}"] .rt-infos-a summary`);
  const ia = await pageA.evaluate((n) => document.querySelector(`.rt-ret[data-n="${n}"] .rt-infos-a`).innerText, nCapture);
  check(/abc123def456/.test(ia) && /iPhone · iOS 17\.5/.test(ia) && /Le Village/.test(ia) && /parti 60 min, payé 60 min/.test(ia), 'les infos dépliées : version, appareil, quartier, le journal lisible');
  // le bug de Lucas : une note, puis « Fait »
  const nLucas = faux.retours.find((r) => r.joueur === id && r.type === 'bug').n;
  await pageA.evaluate((n) => document.querySelector(`.rt-ret[data-n="${n}"]`).scrollIntoView({ block: 'center' }), nLucas);
  check(await pageA.evaluate((n) => { const c = document.querySelector(`.rt-ret[data-n="${n}"]`); return c.querySelector('.rt-type').textContent === '🐞 Bug' && c.querySelector('.rt-img') && /Le bouton Bonus/.test(c.querySelector('.rt-txt').textContent); }, nLucas), 'le bug de Lucas est dans la liste, avec sa capture');
  await pageA.screenshot({ path: out + '/06-admin-liste.png' });
  await pageA.fill(`.rt-ret[data-n="${nLucas}"] input[data-champ="note"]`, 'Corrigé dans la prochaine version, merci !');
  await pageA.tap(`.rt-ret[data-n="${nLucas}"] [data-etat="fait"]`);
  check(await attendre(() => faux.retours.find((r) => r.n === nLucas).etat === 'fait'), 'Fait : fournil_admin_retour_etat');
  const ce = dernier('fournil_admin_retour_etat');
  check(ce.p_n === nLucas && ce.p_etat === 'fait' && ce.p_note === 'Corrigé dans la prochaine version, merci !' && faux.retours.find((r) => r.n === nLucas).note === ce.p_note, '(p_n, p_etat fait, p_note)');
  check(await attendre(() => pageA.evaluate((n) => { const c = document.querySelector(`.rt-ret[data-n="${n}"]`); return c.querySelector('.rt-etat').textContent === 'Fait' && c.querySelector('[data-etat="fait"]').classList.contains('actif') && c.querySelector('input[data-champ="note"]').value === 'Corrigé dans la prochaine version, merci !'; }, nLucas)), 'la carte dit « Fait », la note reste');
  await pageA.tap(`.rt-ret[data-n="${nCapture}"] [data-etat="vu"]`);
  check(await attendre(() => faux.retours.find((r) => r.n === nCapture).etat === 'vu'), 'Vu');
  await pageA.tap(`.rt-ret[data-n="${nPiege}"] [data-etat="refuse"]`);
  check(await attendre(() => faux.retours.find((r) => r.n === nPiege).etat === 'refuse' && dernier('fournil_admin_retour_etat').p_note === ''), 'Refusé (sans note : p_note vide)');
  check(await attendre(async () => (await pastille(pageA)) === String(nouveauxN())), `la pastille baisse (${nouveauxN()} nouveaux)`);
  await pageA.fill(`.rt-ret[data-n="${nLucas}"] input[data-champ="note"]`, '');
  await pageA.tap(`.rt-ret[data-n="${nLucas}"] [data-etat="fait"]`);
  check(await attendre(() => appels('fournil_admin_retour_etat').length === 4 && dernier('fournil_admin_retour_etat').p_note === '' && faux.retours.find((r) => r.n === nLucas).note === null), 'la note vidée part en chaîne vide : le serveur l’efface');
  const lus0 = appels('fournil_admin_retours').length, toutDemande = () => appels('fournil_admin_retours').slice(lus0).some((x) => x.corps && x.corps.p_filtre === 'tout'); // (une relecture des nouveaux pour la pastille peut passer après : on cherche celle de « Tous »)
  await pageA.tap('[data-rt="filtre"][data-f="tout"]');
  // (machine lente : la feuille peut se redessiner sous le doigt et perdre le toucher ; tant que « Tous » n'est pas demandé, on retouche, au plus toutes les 2 s)
  let retouche = Date.now();
  const tous = await attendre(async () => { if (!toutDemande() && Date.now() - retouche > 2000) { retouche = Date.now(); await pageA.tap('[data-rt="filtre"][data-f="tout"]').catch(() => {}); }
    return toutDemande() && pageA.evaluate((n) => document.querySelectorAll('.rt-ret').length === n && (document.querySelector('[data-rt="filtre"].actif') || {}).dataset.f === 'tout', faux.retours.length); }, 20000);
  { const vu = await pageA.evaluate(() => ({ cartes: document.querySelectorAll('.rt-ret').length, actif: ((document.querySelector('[data-rt="filtre"].actif') || {}).dataset || {}).f, filtre: window.__fournil && window.__fournil.retours ? window.__fournil.retours.etat().filtre : null })).catch(() => ({}));
    check(!!tous, `Tous : fournil_admin_retours(p_filtre tout), ${faux.retours.length} retours${tous ? '' : ` (dernier p_filtre ${dernier('fournil_admin_retours').p_filtre}, depuis le toucher : ${appels('fournil_admin_retours').slice(lus0).map((x) => x.corps && x.corps.p_filtre).join(', ') || 'aucune lecture'}, ${vu.cartes} cartes .rt-ret, bouton actif « ${vu.actif} », filtre du jeu ${vu.filtre})`}`); }

  // créer un vote, puis fermer l'ancien : le nouveau prend le bandeau
  await pageA.tap('[data-rt="admin-vue"][data-v="votes"]');
  check(await pageA.evaluate(() => !!document.querySelector('input[data-champ="question"]') && document.querySelectorAll('input[data-champ="option"]').length === 2 && document.querySelectorAll('[data-rt="duree"]').length === 5 && document.querySelector('[data-rt="duree"].actif').textContent === '1 j'), '« Créer un vote » : la question, 2 options, les durées (1 h, 6 h, 1 j, 3 j, 7 j ; 1 j choisi)');
  await pageA.tap('[data-rt="creer"]');
  check(await attendre(async () => /Écris la question/.test(await note(pageA))) && !appels('fournil_admin_vote_creer').length, 'sans question : refusé, rien ne part');
  await pageA.fill('input[data-champ="question"]', 'Le prochain mini-jeu ?');
  await pageA.fill('input[data-champ="option"][data-i="0"]', 'Le lancer de croissants');
  await pageA.fill('input[data-champ="option"][data-i="1"]', 'La course des baguettes');
  await pageA.tap('[data-rt="plus"]');
  check(await pageA.evaluate(() => document.querySelectorAll('input[data-champ="option"]').length === 3 && document.querySelector('input[data-champ="question"]').value === 'Le prochain mini-jeu ?'), '« + Une option » : trois options, la question tapée est restée');
  await pageA.fill('input[data-champ="option"][data-i="2"]', 'Le memory des gâteaux');
  await pageA.tap('[data-rt="duree"][data-h="72"]');
  await pageA.screenshot({ path: out + '/07-admin-creer-vote.png' });
  await pageA.tap('[data-rt="creer"]');
  check(await attendre(() => appels('fournil_admin_vote_creer').length === 1), 'Créer le vote : fournil_admin_vote_creer');
  const cv = appels('fournil_admin_vote_creer')[0].corps;
  check(cv.p_id === idA && cv.p_question === 'Le prochain mini-jeu ?' && JSON.stringify(cv.p_options) === JSON.stringify(['Le lancer de croissants', 'La course des baguettes', 'Le memory des gâteaux']) && cv.p_heures === 72, `(p_question, p_options, p_heures 72) ${JSON.stringify(cv.p_options)}`);
  check(await attendre(() => pageA.evaluate(() => [...document.querySelectorAll('.rt-vote.admin .rt-q')].map((q) => q.textContent).includes('Le prochain mini-jeu\u00a0?'))) && /Le vote est ouvert/.test(await note(pageA)), 'le vote est dans « Votes en cours », « Le vote est ouvert »');
  await pageA.tap(`.rt-vote.admin[data-n="${nVote}"] [data-rt="fermer-vote"]`);
  check(await pageA.evaluate((n) => /Oui, fermer ce vote/.test(document.querySelector(`.rt-vote.admin[data-n="${n}"] [data-rt="fermer-vote"]`).textContent), nVote) && !appels('fournil_admin_vote_fermer').length, 'Fermer : on confirme d’abord (« Oui, fermer ce vote »)');
  await pageA.screenshot({ path: out + '/08-admin-votes-en-cours.png' });
  await pageA.tap(`.rt-vote.admin[data-n="${nVote}"] [data-rt="fermer-vote"]`);
  check(await attendre(() => appels('fournil_admin_vote_fermer').length === 1 && dernier('fournil_admin_vote_fermer').p_n === nVote && faux.votes[0].ferme), 'confirmé : fournil_admin_vote_fermer(p_n)');
  check(await attendre(() => pageA.evaluate((n) => !document.querySelector(`.rt-vote.admin[data-n="${n}"]`), nVote)), 'le vote fermé quitte la liste');
  await pageA.tap('[data-rt="fermer"]'); await sleep(400);
  check(await attendre(async () => /^🗳 Vote : Le prochain mini-jeu \? encore 3 j · toucher pour voter$/.test(await bandeau(pageA))), `le vote créé apparaît en bandeau dans la boutique (« ${await bandeau(pageA)} »)`);
  // chez Lucas, la lecture suivante l'apporte aussi : le bandeau, la pastille
  check(await attendre(async () => /Le prochain mini-jeu/.test(await bandeau(page)) && (await pastille(page)) === '1', 8000), 'chez Lucas, la lecture suivante apporte le nouveau vote : le bandeau, la pastille « 1 »');
  await page.tap('#vote-bandeau');
  check(await attendre(() => page.evaluate(() => /Votes terminés/.test(document.querySelector('#rt-corps').textContent) && [...document.querySelectorAll('.rt-vote.fini .rt-q')].some((q) => q.textContent === 'Quelle recette ajouter ensuite\u00a0?'))), 'le vote fermé est passé dans « Votes terminés »');
  await page.tap('[data-rt="fermer"]'); await sleep(200);

  // ─── un petit téléphone (360 × 640) : la colonne du coin tient au-dessus du tiroir, au besoin sur deux colonnes ───
  const ctxP = await nouveau({ width: 360, height: 640 });
  const pp = await ctxP.newPage(); suivre(pp);
  await pp.goto(BASE + '/fournil/'); await sleep(1500);
  const coinTient = () => pp.evaluate(() => { const t = document.querySelector('#tiroir').getBoundingClientRect().top, ev = document.querySelector('#evenement'), bas = ev.hidden ? t : ev.getBoundingClientRect().top, l = [...document.querySelectorAll('#coin > .rond')].filter((b) => !b.hidden).map((b) => b.getBoundingClientRect()), e = document.querySelector('#enseigne').getBoundingClientRect();
    return { n: l.length, serre: document.querySelector('#coin').classList.contains('serre'), tient: l.every((r) => r.bottom <= bas - 4), libre: l.every((r, i) => l.every((q, j) => i === j || r.bottom <= q.top || q.bottom <= r.top || r.right <= q.left || q.right <= r.left)), enseigne: l.every((r) => r.left >= e.right || r.top >= e.bottom) }; });
  await pp.evaluate(() => { document.querySelector('#b-quartier').hidden = false; }); await sleep(300); // l'icône de l'événement du Quartier, comme pendant sa fenêtre
  let ct = await coinTient();
  check(ct.n === 5 && ct.tient && ct.libre && ct.enseigne, `360 × 640, avec l’icône du Quartier : les ${ct.n} boutons tiennent au-dessus du tiroir${ct.serre ? ' (sur deux colonnes)' : ''} ${JSON.stringify(ct)}`);
  await pp.evaluate(() => window.__fournil.ev('rush')); await sleep(800);
  ct = await coinTient();
  check(ct.serre && ct.tient && ct.libre && ct.enseigne, `et l’événement de la boutique affiché au-dessus du tiroir : deux colonnes, rien ne se chevauche, l’enseigne reste dégagée ${JSON.stringify(ct)}`);
  await pp.screenshot({ path: out + '/10-coin-360.png' });
  await ctxP.close();

  // ─── le SQL pas encore collé : le bouton reste, la feuille dit « bientôt », plus de bandeau ───
  faux.mode = 'pas-ouvert';
  const p2 = await ctx.newPage(); suivre(p2);
  await p2.goto(BASE + '/fournil/'); await sleep(5000);
  check(await p2.evaluate(() => !document.querySelector('#b-idees').hidden && document.querySelector('#vote-bandeau').hidden && document.querySelector('#b-idees .rt-pastille').hidden), 'fonctions absentes (404, PGRST202) : le bouton reste, ni bandeau ni pastille');
  await p2.tap('#b-idees');
  check(await attendre(() => p2.evaluate(() => /Les idées et les bugs arrivent bientôt/.test(document.querySelector('#rt-corps').innerText) && !document.querySelector('.rt-carte'))), 'la feuille : « Les idées et les bugs arrivent bientôt »');
  await p2.tap('[data-rt-onglet="votes"]');
  check(await attendre(() => p2.evaluate(() => /arrivent bientôt/.test(document.querySelector('#rt-corps').innerText))), 'l’onglet Votes aussi');
  check((await p2.evaluate(() => window.__fournil.classement().retourEnvoyer({ type: 'idee', texte: 'a' }))).etat === 'pas-ouvert' && !(await p2.evaluate(() => document.querySelector('#b-classement').hidden)), 'retourEnvoyer : « pas-ouvert » ; le classement, lui, reste là');
  await p2.screenshot({ path: out + '/09-bientot.png' });
  await p2.tap('[data-rt="fermer"]');
  const nP = appels('fournil_votes_ouverts').length; await sleep(3500);
  check(appels('fournil_votes_ouverts').filter((a, i) => i >= nP).length <= 1 && !(await p2.evaluate(() => window.__fournil.retours.etat().minuteur)), 'pas encore de SQL : plus de lecture périodique');
  await p2.close();
  faux.mode = 'normal';

  // ─── sans configuration (l'artefact) : pas de bouton, pas de bandeau ───
  config = 'aucune';
  const p3 = await ctx.newPage(); suivre(p3);
  await p3.goto(BASE + '/fournil/'); await sleep(1500);
  check(await p3.evaluate(() => document.querySelector('#b-idees').hidden && document.querySelector('#vote-bandeau').hidden && !window.__fournil.retours.ouvrir()), 'sans configuration : pas de bouton, pas de bandeau, la feuille ne s’ouvre pas');
  await p3.close();
  config = 'normale';

  check(errors.length === 0, `aucune erreur dans la console (${errors.slice(0, 3).join(' | ')})`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
