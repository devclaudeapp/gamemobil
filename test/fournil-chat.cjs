// Le chat des boulangers (src/chat.js, src/classement.js : chatLire, chatImage, chatEnvoyer, chatSignaler, chatEffacer), dans la vraie page
// (fournil/ servie en local), sur un téléphone en portrait (390 × 844). Supabase est SIMULÉ (page.route, comme test/fournil-classement.cjs) :
// les fonctions du contrat (supabase/fournil-chat.sql) en mémoire, avec leurs refus (trop-vite, banni, pas-ouvert). GIPHY aussi : l'API
// (recherche, tendances) et les images de media.giphy.com. La clé GIPHY de ce test est fausse : config.js est servi avec elle, comme
// test/fournil-notifs.cjs le fait pour la clé VAPID (le vrai fichier n'est pas touché).
// Parcours : l'onglet « Chat » de la feuille du classement (le chat a quitté le coin : sa pastille des non-lus est sur l'onglet et sur le
// bouton du classement, en haut à côté du cadeau ; le rang d'onglets du classement en tête du chat, une période y ramène au classement),
// rien au lancement tant qu'on n'a pas rejoint ; la feuille (les bulles, le pseudo, l'heure,
// la photo chargée paresseusement puis agrandie, le GIF, un message piégé affiché en texte), « Rejoins le classement pour écrire » ; la pastille
// des non-lus ; envoyer un texte ; trop vite (le téléphone, puis le serveur) ; une photo de 3000 × 2000 compressée sous 350 Ko ; un GIF de la
// galerie (léger : il part ; lourd : refusé) ; la recherche GIPHY (tendances, puis recherche : rating g, lang fr) ; l'appui long (Signaler,
// masqué au 3e ; Effacer le sien) ; banni ; la page cachée qui arrête les lectures ; « bientôt » (le SQL pas collé, puis sans clé GIPHY) ;
// sans configuration, ni bouton du classement ni onglet ; le service worker qui ne met jamais GIPHY en cache ; aucune erreur dans la console.
// Lancer : NODE_PATH=/opt/node22/lib/node_modules node test/fournil-chat.cjs   (captures dans test/shots/chat/)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
const root = path.join(__dirname, '..');
const PORT = +process.env.PORT_CHAT || 8870, BASE = `http://localhost:${PORT}`, SUPA = 'https://jklbitrlkfrktmnarejc.supabase.co';
const GIPHY = 'FauxCleGiphyPourLeTest0123456789'; // une fausse clé : le format seulement
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let config = 'giphy'; // 'giphy' : config.js avec la fausse clé GIPHY ; 'sans' : sans clé ; 'aucune' : pas de config.js (comme l'artefact)
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (p === '/fournil/config.js') {
    if (config === 'aucune') { res.writeHead(404); res.end(); return; }
    const vraie = fs.readFileSync(path.join(root, 'fournil', 'config.js'), 'utf8').replace(/,\s*giphy: '[^']*'/, ''); // une vraie clé un jour : le test pose la sienne (ou aucune)
    res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(config === 'giphy' ? vraie.replace(/bearer: true,/, `bearer: true, giphy: '${GIPHY}',`) : vraie); return;
  }
  fs.readFile(path.join(root, p), (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT);
const out = path.join(__dirname, 'shots', 'chat'); fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const attendre = async (fn, ms = 8000) => { for (let t = 0; t < ms; t += 100) { try { if (await fn()) return true; } catch (e) { /* rien */ } await sleep(100); } return false; };

// ─── le faux Supabase : le classement (ce qui sert ici) et le chat du contrat, en mémoire ───
const sha = (t) => crypto.createHash('sha256').update(String(t), 'utf8').digest('hex');
const IMG = /^data:image\/(webp|jpeg|png|gif);base64,/;
const faux = { appels: [], joueurs: new Map(), chat: [], mode: 'normal', dernierEnvoi: new Map() };
const autre = (pseudo) => { const id = crypto.randomUUID(); faux.joueurs.set(id, { pseudo, jeton: sha(id) }); return id; };
const ecrire = (joueur, o, cree) => { const n = faux.chat.length ? faux.chat[faux.chat.length - 1].n + 1 : 101; faux.chat.push({ n, joueur, pseudo: faux.joueurs.get(joueur).pseudo, texte: o.texte || '', gif: o.gif || null, image: o.image || null, cree: cree || Date.now(), masque: false, signal: 0, par: new Set() }); return n; };
const ident = (c) => { const j = faux.joueurs.get(c.p_id); return !j ? 'inconnu' : j.jeton !== sha(c.p_jeton) ? 'jeton' : null; };
const RPC = {
  fournil_publier: (c) => { const j = faux.joueurs.get(c.p_id); if (j && j.jeton !== sha(c.p_jeton)) return { ok: false, erreur: 'jeton' }; faux.joueurs.set(c.p_id, { pseudo: c.p_pseudo, jeton: sha(c.p_jeton) }); return { ok: true, erreur: null, version: 6, rang_semaine: 1, rang_total: 1, joueurs: faux.joueurs.size, joueurs_semaine: 1, semaine: '2026-10-12', photo_maj: new Date().toISOString() }; },
  fournil_classement: () => ({ version: 6, semaine: '2026-10-12', joueurs: 1, lignes: [], moi: null }),
  fournil_recompenses: () => ({ ok: true, erreur: null, podiums: [], derniere: null, pourboires: [], objectif: null }),
  fournil_objectif: () => ({ semaine: '2026-10-12', but: 300, total: 12, joueurs: 1, reussi: false, pourcent: 4 }),
  fournil_vu: () => ({ ok: true }),
  fournil_mes_cadeaux: () => ({ ok: true, cadeaux: [] }),
  fournil_chat_lire: (c) => { // p_id et p_jeton facultatifs : avec eux, moi est rempli
    const apres = +c.p_apres || 0, lim = Math.min(50, Math.max(1, +c.p_limite || 50)), qui = c.p_id && !ident(c) ? c.p_id : null;
    const l = faux.chat.filter((m) => !m.masque && m.n > apres).slice(-lim);
    return { ok: true, messages: l.map((m) => ({ n: m.n, pseudo: m.pseudo, texte: m.texte, gif: m.gif, image: !!m.image, cree: m.cree, moi: !!qui && m.joueur === qui })), dernier: faux.chat.length ? faux.chat[faux.chat.length - 1].n : 0 };
  },
  fournil_chat_image: (c) => { const m = faux.chat.find((x) => x.n === +c.p_n); return { ok: true, data: m && !m.masque && m.image ? m.image : null }; },
  fournil_chat_envoyer: (c) => {
    const e = ident(c); if (e) return { ok: false, erreur: e };
    if (faux.mode === 'banni') return { ok: false, erreur: 'banni' };
    const texte = String(c.p_texte || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); // nettoyé comme au serveur : retours à la ligne en espaces, espaces repliés
    if (!texte && !c.p_gif && !c.p_image) return { ok: false, erreur: 'vide' };
    if (Array.from(texte).length > 300) return { ok: false, erreur: 'long' };
    if (c.p_gif && !/^[A-Za-z0-9]{5,40}$/.test(c.p_gif)) return { ok: false, erreur: 'gif' };
    if (c.p_image && (!IMG.test(c.p_image) || c.p_image.length > 480000)) return { ok: false, erreur: 'image' };
    if (faux.mode === 'trop-vite' || Date.now() - (faux.dernierEnvoi.get(c.p_id) || 0) < 3000) return { ok: false, erreur: 'trop-vite' };
    faux.dernierEnvoi.set(c.p_id, Date.now());
    return { ok: true, erreur: null, n: ecrire(c.p_id, { texte, gif: c.p_gif, image: c.p_image }) };
  },
  fournil_chat_signaler: (c) => {
    const e = ident(c); if (e) return { ok: false, erreur: e };
    if (faux.mode === 'banni') return { ok: false, erreur: 'banni' };
    const m = faux.chat.find((x) => x.n === +c.p_n); if (!m || m.masque) return { ok: false, erreur: 'absent' };
    if (m.joueur === c.p_id) return { ok: false, erreur: 'soi' };
    if (m.par.has(c.p_id)) return { ok: false, erreur: 'deja' };
    m.par.add(c.p_id); m.signal++; if (m.signal >= 3) m.masque = true;
    return { ok: true, erreur: null, masque: m.masque };
  },
  fournil_chat_effacer: (c) => {
    const e = ident(c); if (e) return { ok: false, erreur: e };
    const m = faux.chat.find((x) => x.n === +c.p_n); if (!m || m.masque) return { ok: false, erreur: 'absent' };
    if (m.joueur !== c.p_id) return { ok: false, erreur: 'pas-a-toi' };
    m.masque = true; m.image = null; return { ok: true, erreur: null };
  },
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'POST, OPTIONS' };
async function gerer(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  const nom = req.url().split('/rpc/')[1]; let corps = null; try { corps = req.postDataJSON(); } catch (e) { corps = null; }
  faux.appels.push({ nom, corps, t: Date.now() });
  const absent = () => route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: `Could not find the function public.${nom}` }) });
  if (faux.mode === 'pas-ouvert' && /^fournil_chat_/.test(nom)) return absent(); // le script du chat pas encore collé
  if (!RPC[nom]) return absent();
  return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(RPC[nom](corps || {})) });
}
const appels = (nom) => faux.appels.filter((a) => a.nom === nom);
// le faux GIPHY : l'API (les adresses demandées sont gardées) et les images
const giphy = { appels: [], images: [] };
const IDS = ['cRoiSsant01', 'BaGuette02x', 'PainChoc03y', 'EclairCafe4', 'TarteFraise5', 'ChouQuette6', 'MiTron07zz', 'FourChaud08', 'LevainBio09', 'BriocheTop0', 'FarineBl11', 'MacaRon12ab'];
const COULEURS = ['#FFC84A', '#FF6B8B', '#5FD3A4', '#B8A6FF', '#6CB8FF', '#FFB07A'];
let gifPng = []; // des images (PNG, servies comme GIF : le navigateur lit le contenu) faites dans une page au départ

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const suivre = (p) => {
    p.on('pageerror', (e) => { errors.push(e.message); console.log('PAGEERROR', e.message); });
    p.on('console', (m) => { if (m.type() === 'error' && !/googleapis|gstatic|ERR_FAILED|404|ERR_CERT/.test(m.text() + (m.location() && m.location().url))) errors.push(m.text()); });
  };
  // les images du test : celles de GIPHY (des pavés de couleur) et la photo d'un copain (un croissant dessiné), faites par le navigateur
  const atelier = await browser.newPage();
  const faites = await atelier.evaluate(([couleurs]) => {
    const cv = document.createElement('canvas'), x = cv.getContext('2d');
    const gifs = couleurs.map((c, i) => { cv.width = 200; cv.height = 150; const g = x.createLinearGradient(0, 0, 200, 150); g.addColorStop(0, c); g.addColorStop(1, '#4A3328'); x.fillStyle = g; x.fillRect(0, 0, 200, 150); x.font = '64px sans-serif'; x.textAlign = 'center'; x.fillText(['🥐', '🥖', '🍫', '☕', '🍓', '🎉'][i], 100, 98); return cv.toDataURL('image/png'); });
    cv.width = 640; cv.height = 480; const g = x.createRadialGradient(320, 240, 20, 320, 240, 400); g.addColorStop(0, '#FFF3C4'); g.addColorStop(1, '#E8A54A'); x.fillStyle = g; x.fillRect(0, 0, 640, 480);
    x.font = '260px sans-serif'; x.textAlign = 'center'; x.fillText('🥐', 320, 330);
    return { gifs, photo: cv.toDataURL('image/jpeg', 0.8) };
  }, [COULEURS]);
  await atelier.close();
  gifPng = faites.gifs.map((u) => Buffer.from(u.split(',')[1], 'base64'));

  const nouveau = async (o) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, locale: 'fr-FR', timezoneId: 'Europe/Paris', serviceWorkers: 'block', ...(o || {}) });
    await ctx.addInitScript(() => { window.__sansQuartier = true; window.__tchatPas = { ouvert: 600, ferme: 1500 }; }); // des lectures rapprochées pour le test (les vraies : 4 s, 60 s)
    await ctx.route(SUPA + '/rest/v1/rpc/*', gerer);
    await ctx.route('https://api.giphy.com/**', (route) => {
      const u = new URL(route.request().url()); giphy.appels.push(u);
      const q = u.searchParams.get('q') || '', ids = u.pathname.endsWith('/trending') ? IDS : /croiss/i.test(q) ? IDS.slice(0, 9) : IDS.filter((x, i) => i % 2 === 0);
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ data: ids.map((id) => ({ id, title: `GIF ${id}`, images: {} })).concat([{ id: '<script>', title: 'piège' }]), meta: { status: 200 } }) });
    });
    await ctx.route('https://media.giphy.com/**', (route) => {
      const u = route.request().url(); giphy.images.push(u);
      const m = /\/media\/([A-Za-z0-9]+)\//.exec(u), k = m ? [...m[1]].reduce((a, c) => a + c.charCodeAt(0), 0) % gifPng.length : 0;
      return route.fulfill({ status: 200, contentType: 'image/gif', body: gifPng[k] });
    });
    return ctx;
  };
  const etat = (p) => p.evaluate(() => window.__fournil.tchat.etat());
  const note = (p) => p.evaluate(() => { const n = document.querySelector('#tc-note'); return n.hidden ? '' : n.textContent; });
  const bulles = (p) => p.evaluate(() => [...document.querySelectorAll('#tc-fil .tc-msg')].map((m) => { const r = m.querySelector('.tc-bulle').getBoundingClientRect(); return { n: +m.dataset.n, moi: m.classList.contains('moi'), pseudo: (m.querySelector('.tc-pseudo') || {}).textContent || '', txt: (m.querySelector('.tc-txt') || {}).textContent || '', heure: m.querySelector('time').textContent, gauche: r.left, droite: innerWidth - r.right, photo: !!m.querySelector('.tc-photo'), gif: (m.querySelector('.tc-gifm img') || {}).src || '' }; }));
  const appuiLong = async (p, sel) => { const b = await p.locator(sel).boundingBox(); await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await p.mouse.down(); await sleep(750); await p.mouse.up(); await sleep(150); };

  // des messages déjà là : un bonjour d'hier, une photo, un GIF, et un message piégé
  const mamie = autre('Mamie Jo'), tonton = autre('Tonton Jo'), petit = autre('Petit Jo'), pirate = autre('Pirate');
  // les jours se comptent à l'heure de Paris (le contexte du navigateur) : « hier » à midi, et ceux d'aujourd'hui jamais avant minuit,
  // pour que le test passe à toute heure (lancé vers 1 h du matin, « il y a 26 h » tombait avant-hier, « il y a 20 min » la veille)
  const hms = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).filter((x) => x.type !== 'literal').map((x) => [x.type, +x.value]));
  const minuit = Date.now() - ((hms.hour * 60 + hms.minute) * 60 + hms.second) * 1000 - 1000, hier = minuit - 12 * 3600e3;
  const ilYa = (min) => Math.max(minuit + (30 - min) * 1000, Date.now() - min * 60e3); // il y a min minutes, mais aujourd'hui (et dans l'ordre)
  ecrire(mamie, { texte: 'Bonjour à tous !' }, hier);
  ecrire(mamie, { texte: 'Quelqu’un a débloqué les éclairs ?' }, hier + 60e3);
  ecrire(tonton, { texte: 'Oui, au niveau 4 du four 😊 Regardez ma vitrine :', image: faites.photo }, ilYa(20));
  const nGif = ecrire(petit, { gif: 'abcDEF123' }, ilYa(12));
  const nPiege = ecrire(pirate, { texte: '<img src=x onerror="window.__pirate=1">salut <b>gras</b>' }, ilYa(6));
  ecrire(mamie, { texte: 'Haha 🥐 trop bien' }, ilYa(3));

  const ctx = await nouveau();
  const page = await ctx.newPage(); suivre(page);
  await page.goto(BASE + '/fournil/'); await sleep(1500);
  // le chat : un onglet de la feuille du classement (le bouton du classement en haut, puis l'onglet « Chat »)
  const ouvrirChat = async (p) => { await p.tap('#b-classement'); await p.waitForSelector('#feuille-contenu [data-tab="chat"]', { timeout: 8000 }); await sleep(250); await p.tap('#feuille-contenu [data-tab="chat"]'); await sleep(300); };

  // ─── l'onglet : dans la feuille du classement, après les périodes ; plus de bouton du chat dans le coin ; rien au réseau tant qu'on n'a pas rejoint ───
  const bouton = await page.evaluate(() => { const b = document.querySelector('#b-classement'), r = b.getBoundingClientRect(), n = document.querySelector('#b-nouveautes').getBoundingClientRect(), h = document.querySelector('#haut').getBoundingClientRect(); return { vu: !b.hidden && r.width >= 40, enHaut: r.top >= h.top && r.bottom <= h.bottom + 1, avantCadeau: r.right <= n.left, coin: !!document.querySelector('#b-tchat, #coin [data-ico="bulle"]'), pastille: !b.querySelector('.tc-nonlus').hidden, label: b.getAttribute('aria-label') }; });
  check(bouton.vu && bouton.enHaut && bouton.avantCadeau && !bouton.coin && !bouton.pastille && bouton.label === 'Classement des boulangers', `le bouton du classement est en haut, à côté du cadeau ; plus de bouton du chat dans le coin ; pas de pastille ${JSON.stringify(bouton)}`);
  await page.tap('#b-classement'); await page.waitForSelector('#feuille-contenu [data-tab="chat"]', { timeout: 8000 }); await sleep(300);
  const onglet = await page.evaluate(() => { const l = [...document.querySelectorAll('#feuille-contenu .segments [data-tab]')], c = document.querySelector('#feuille-contenu [data-tab="chat"]'), r = c.getBoundingClientRect(); return { tabs: l.map((b) => b.dataset.tab), dernier: l[l.length - 1] === c, txt: c.textContent.trim(), svg: !!c.querySelector('svg'), pastille: !c.querySelector('.tc-nonlus').hidden, h: r.height, dans: r.right <= innerWidth && r.left >= 0 }; });
  check(onglet.dernier && onglet.tabs[0] === 'semaine' && onglet.tabs.includes('total') && onglet.txt === 'Chat' && onglet.svg && !onglet.pastille && onglet.h >= 44 && onglet.dans, `la feuille du classement : l’onglet « Chat » après les périodes (${onglet.tabs.join(', ')}), 44 px, sans pastille`);
  await page.screenshot({ path: out + '/00-onglet-classement.png' });
  await page.evaluate(() => document.querySelector('#feuille-contenu [data-a="close"]').click()); await sleep(300);
  check(await page.evaluate(() => window.__fournil.tchat.R.ouvert === 4000 && window.__fournil.tchat.R.ferme === 60000), 'les lectures : toutes les 4 s feuille ouverte, toutes les 60 s sinon (le test les rapproche)');
  await sleep(3500);
  check(appels('fournil_chat_lire').length === 0, 'pas encore rejoint : aucune lecture du chat en arrière-plan (rien ne part avant d’avoir rejoint)');

  // ─── la feuille, sans pseudo : on lit, on n'écrit pas ───
  await ouvrirChat(page);
  check(await attendre(() => page.evaluate(() => document.querySelectorAll('#tc-fil .tc-msg').length === 6)), 'toucher l’onglet « Chat » : le chat plein écran, les 6 messages');
  const tete = await page.evaluate(() => { const o = document.querySelector('#tc-onglets'), l = [...o.querySelectorAll('[data-tab]')]; return { vu: !o.hidden, tabs: l.map((b) => b.dataset.tab), actif: (o.querySelector('[data-tab].actif') || {}).dataset, feuille: document.querySelector('#feuille').hidden, haut: o.getBoundingClientRect().bottom <= document.querySelector('#tc-fil').getBoundingClientRect().top + 1 }; });
  check(tete.vu && tete.tabs[tete.tabs.length - 1] === 'chat' && tete.actif && tete.actif.tab === 'chat' && tete.feuille && tete.haut, `en tête du chat, le rang d’onglets du classement, « Chat » choisi (${tete.tabs.join(', ')}) ; la feuille du classement s’est fermée`);
  const l0 = appels('fournil_chat_lire')[0];
  check(l0 && l0.corps.p_apres === 0 && l0.corps.p_limite === 50 && Object.keys(l0.corps).length === 2, `fournil_chat_lire(p_apres 0, p_limite 50) à l’ouverture ${JSON.stringify(l0 && l0.corps)}`);
  let b = await bulles(page);
  check(b.every((x) => !x.moi && x.gauche <= 20 && x.droite > 60), 'les bulles des autres sont à gauche');
  check(b[0].pseudo === 'Mamie Jo' && b[1].pseudo === '' && b[2].pseudo === 'Tonton Jo' && b[3].pseudo === 'Petit Jo' && b.every((x) => /^\d\d:\d\d$/.test(x.heure)), `le pseudo (une fois par suite de messages du même boulanger) et l’heure ${b.map((x) => x.pseudo + ' ' + x.heure).join(' · ')}`);
  check(await page.evaluate(() => [...document.querySelectorAll('.tc-jour')].map((j) => j.textContent).join('|')) === 'Hier|Aujourd’hui', 'les jours séparent le fil : « Hier », « Aujourd’hui »');
  const piege = await page.evaluate((n) => { const m = document.querySelector(`.tc-msg[data-n="${n}"]`); return { txt: m.querySelector('.tc-txt').textContent, img: m.querySelectorAll('img').length, b: m.querySelectorAll('b').length, pirate: window.__pirate }; }, nPiege);
  check(piege.txt === '<img src=x onerror="window.__pirate=1">salut <b>gras</b>' && piege.img === 0 && piege.b === 0 && piege.pirate === undefined, 'le message piégé (<img onerror>) s’affiche en texte, rien ne s’exécute');
  check(await attendre(() => page.evaluate(() => { const i = document.querySelector('.tc-photo.chargee img'); return i && /^data:image\/jpeg;base64,/.test(i.src) && i.naturalWidth === 640; })) && appels('fournil_chat_image').length === 1 && appels('fournil_chat_image')[0].corps.p_n === 103, 'la photo : chargée à part (fournil_chat_image, p_n), quand sa case arrive à l’écran');
  check(b[3].gif === 'https://media.giphy.com/media/abcDEF123/200w.gif' && await attendre(() => page.evaluate(() => document.querySelector('.tc-gifm img').naturalWidth > 0)), 'le GIF : construit depuis son identifiant (media.giphy.com, la version de 200 px)');
  const bas = await page.evaluate(() => ({ rejoindre: !document.querySelector('#tc-rejoindre').hidden && document.querySelector('#tc-rejoindre').innerText, saisie: !document.querySelector('#tc-saisie').hidden, finFil: (() => { const f = document.querySelector('#tc-fil'); return f.scrollHeight - f.scrollTop - f.clientHeight; })() }));
  check(bas.rejoindre && /Rejoins le classement pour écrire/.test(bas.rejoindre) && !bas.saisie, `sans pseudo : « Rejoins le classement pour écrire », pas de barre de saisie`);
  check(bas.finFil < 2, 'le fil s’ouvre en bas, sur le dernier message');
  check((await page.evaluate(() => window.__fournil.classement().chatEnvoyer({ texte: 'coucou' }))).etat === 'pas-rejoint' && !appels('fournil_chat_envoyer').length, 'chatEnvoyer sans pseudo : « pas-rejoint », rien ne part');
  await page.screenshot({ path: out + '/02-feuille-sans-pseudo.png' });
  await page.tap('.tc-photo');
  check(await page.evaluate(() => !document.querySelector('#tc-zoom').hidden && /^data:image\/jpeg/.test(document.querySelector('#tc-zoom img').src)), 'toucher la photo : elle s’agrandit');
  await page.tap('#tc-zoom'); await sleep(150);
  await page.tap('.tc-gifm');
  check(await page.evaluate(() => !document.querySelector('#tc-zoom').hidden && document.querySelector('#tc-zoom img').src === 'https://media.giphy.com/media/abcDEF123/giphy.gif'), 'toucher le GIF : la version originale, en grand');
  await page.tap('#tc-zoom'); await sleep(150);
  check(appels('fournil_chat_image').length === 1, 'la photo vient du petit cache : pas relue');
  // la page cachée : plus aucune lecture ; au retour, elles reprennent
  const cacher = (h) => page.evaluate((h) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await sleep(1500); const nA = appels('fournil_chat_lire').length;
  check(nA >= 3, `feuille ouverte : une lecture à chaque tour (${nA} lectures)`);
  await cacher(true); await sleep(300); const nB = appels('fournil_chat_lire').length; await sleep(2000);
  check(appels('fournil_chat_lire').length === nB, 'la page cachée : plus aucune lecture');
  await cacher(false); await sleep(1000);
  check(appels('fournil_chat_lire').length > nB && appels('fournil_chat_lire').slice(nB).every((a) => a.corps.p_apres === 0 || a.corps.p_apres === faux.chat[faux.chat.length - 1].n), 'au retour : les lectures reprennent, à la suite du dernier message');
  await page.tap('[data-tc="fermer"]'); await sleep(300);

  // ─── rejoindre ; la pastille des non-lus ───
  check((await page.evaluate(() => window.__fournil.classement().choisirPseudo('Lucas').then((r) => r.etat))) === 'ok', 'rejoindre le classement (pseudo Lucas)');
  const vu0 = (await etat(page)).vu;
  check(vu0 === faux.chat[faux.chat.length - 1].n, `la feuille fermée en bas : tout est lu (st.chatVu = ${vu0})`);
  ecrire(mamie, { texte: 'Lucas, bienvenue !' });
  check(await attendre(() => page.evaluate(() => document.querySelector('#b-classement .tc-nonlus').textContent === '1' && !document.querySelector('#b-classement .tc-nonlus').hidden), 6000), 'un message arrive : la pastille du bouton du classement dit « 1 » (lecture en arrière-plan, maintenant qu’on a rejoint)');
  ecrire(petit, { texte: 'Salut Lucas' }); ecrire(tonton, { texte: '👋' });
  check(await attendre(() => page.evaluate(() => document.querySelector('#b-classement .tc-nonlus').textContent === '3'), 6000) && /chat : 3 messages non lus/.test(await page.evaluate(() => document.querySelector('#b-classement').getAttribute('aria-label'))), 'deux de plus : « 3 », et le bouton du classement le dit (« chat : 3 messages non lus »)');
  check(appels('fournil_chat_lire').slice(-1)[0].corps.p_apres > 0, 'en arrière-plan : seulement les messages après le dernier connu');
  await page.screenshot({ path: out + '/01-bouton-boutique.png' });
  await page.screenshot({ path: out + '/01b-bouton-zoom.png', clip: { x: 150, y: 0, width: 240, height: 120 } });
  await page.tap('#b-classement'); await page.waitForSelector('#feuille-contenu [data-tab="chat"]', { timeout: 8000 }); await sleep(300);
  const pOnglet = await page.evaluate(() => { const c = document.querySelector('#feuille-contenu [data-tab="chat"]'), p = c.querySelector('.tc-nonlus'); return { txt: p.hidden ? '' : p.textContent, label: c.getAttribute('aria-label') }; });
  check(pOnglet.txt === '3' && /3 messages non lus/.test(pOnglet.label), `la feuille du classement : l’onglet « Chat » porte la même pastille (« ${pOnglet.txt} »)`);
  await page.screenshot({ path: out + '/01c-onglet-pastille.png' });

  // ─── écrire ───
  await page.tap('#feuille-contenu [data-tab="chat"]'); await sleep(500);
  check(await page.evaluate(() => document.querySelector('#b-classement .tc-nonlus').hidden && document.querySelector('#tc-onglets [data-tab="chat"] .tc-nonlus').hidden) && (await etat(page)).vu === faux.chat[faux.chat.length - 1].n, 'le chat ouvert : les pastilles s’effacent (bouton, onglet), st.chatVu suit le dernier message');
  check(await page.evaluate(() => !document.querySelector('#tc-saisie').hidden && document.querySelector('#tc-rejoindre').hidden), 'avec un pseudo : la barre de saisie (📷, GIF, le texte, Envoyer)');
  const id = await page.evaluate(() => window.__fournil.classement().etat().id);
  await page.fill('#tc-texte', '  Bonjour les boulangers 🥖  ');
  await page.tap('[data-tc="envoyer"]');
  check(await attendre(() => appels('fournil_chat_envoyer').length === 1), 'Envoyer : fournil_chat_envoyer');
  const e1 = appels('fournil_chat_envoyer')[0].corps;
  check(e1.p_id === id && /^[0-9a-f]{64}$/.test(e1.p_jeton) && e1.p_texte === 'Bonjour les boulangers 🥖' && e1.p_gif === null && e1.p_image === null, `(p_id, p_jeton, p_texte nettoyé, p_gif null, p_image null) ${JSON.stringify(Object.assign({}, e1, { p_jeton: '…' }))}`);
  await attendre(() => page.evaluate(() => !!document.querySelector('.tc-msg.moi')));
  b = await bulles(page); const mien = b.find((x) => x.moi);
  check(mien && mien.txt === 'Bonjour les boulangers 🥖' && mien.droite <= 20 && mien.gauche > 60 && !mien.pseudo && (await page.inputValue('#tc-texte')) === '', 'son message : à droite, sans pseudo, le champ vidé');
  // trop vite : le téléphone d'abord (moins de 3 s), puis le serveur
  await page.fill('#tc-texte', 'Et encore un'); await page.tap('[data-tc="envoyer"]'); await sleep(200);
  check(/Doucement ! Un message toutes les 3 secondes/.test(await note(page)) && appels('fournil_chat_envoyer').length === 1, 'tout de suite après : « Doucement ! Un message toutes les 3 secondes. », rien ne part');
  await sleep(3100); faux.mode = 'trop-vite';
  await page.tap('[data-tc="envoyer"]');
  check(await attendre(() => appels('fournil_chat_envoyer').length === 2) && await attendre(async () => /Doucement/.test(await note(page))) && (await page.inputValue('#tc-texte')) === 'Et encore un', 'le serveur dit « trop-vite » : le même message, le texte reste dans le champ');
  faux.mode = 'normal'; await sleep(3100);
  // un texte de plus de 300 caractères : le champ s'arrête à 300
  await page.fill('#tc-texte', 'x'.repeat(320));
  check((await page.inputValue('#tc-texte')).length === 300 && await page.evaluate(() => document.querySelector('#tc-compte').textContent === '300/300'), 'le champ s’arrête à 300 caractères, et le compte s’affiche');
  await page.fill('#tc-texte', '');

  // ─── une photo : 3000 × 2000 (PNG fait dans la page), compressée par le téléphone sous 350 Ko ───
  const tailles = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 3000; cv.height = 2000; const x = cv.getContext('2d');
    const g = x.createLinearGradient(0, 0, 3000, 2000); g.addColorStop(0, '#FFC84A'); g.addColorStop(.5, '#FF6B8B'); g.addColorStop(1, '#5FD3A4'); x.fillStyle = g; x.fillRect(0, 0, 3000, 2000);
    const im = x.getImageData(0, 0, 3000, 2000), dd = im.data; for (let i = 0; i < dd.length; i += 4) { const r = (Math.random() - 0.5) * 90; dd[i] += r; dd[i + 1] += r; dd[i + 2] -= r; } x.putImageData(im, 0, 0); // du grain : le pire pour la compression
    x.font = 'bold 700px sans-serif'; x.textAlign = 'center'; x.fillText('🥐', 1500, 1250);
    const blob = await new Promise((r) => cv.toBlob(r, 'image/png')), f = new File([blob], 'vitrine.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(f); const inp = document.querySelector('#tc-fichier'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
    return { png: blob.size };
  });
  check(await attendre(async () => !!(await etat(page)).piece, 15000), `la photo (PNG de 3000 × 2000, ${Math.round(tailles.png / 1024)} Ko) est prête`);
  const pc = (await etat(page)).piece;
  check(pc.image <= 350000 && pc.type === 'image/webp', `compressée : ${pc.image} caractères en base64 (≤ 350 Ko), en ${pc.type}`);
  check(await page.evaluate(() => !document.querySelector('#tc-piece').hidden && /Photo prête/.test(document.querySelector('#tc-piece').textContent) && /^data:image\/webp/.test(document.querySelector('#tc-piece img').src)), 'l’aperçu au-dessus de la barre : « Photo prête »');
  const dims = await page.evaluate(() => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.src = document.querySelector('#tc-piece img').src; }));
  check(Math.max(...dims) <= 1280 && Math.abs(dims[0] / dims[1] - 1.5) < 0.01, `le plus grand côté ≤ 1280 px, les proportions gardées (${dims.join(' × ')})`);
  await page.fill('#tc-texte', 'Ma vitrine !');
  await page.tap('[data-tc="envoyer"]');
  check(await attendre(() => appels('fournil_chat_envoyer').length === 3), 'Envoyer la photo');
  const e3 = appels('fournil_chat_envoyer')[2].corps;
  check(/^data:image\/webp;base64,/.test(e3.p_image) && e3.p_image.length <= 350000 && e3.p_texte === 'Ma vitrine !', `p_image : une data URL WebP de ${e3.p_image.length} caractères, avec le texte`);
  check(await attendre(() => page.evaluate(() => { const m = [...document.querySelectorAll('.tc-msg.moi')].pop(); const i = m && m.querySelector('.tc-photo.chargee img'); return i && /^data:image\/webp/.test(i.src); })) && appels('fournil_chat_image').length === 1, 'sa photo s’affiche dans sa bulle, depuis le cache (pas relue au serveur)');
  await sleep(3100);
  // un GIF de la galerie : léger, il part tel quel ; lourd (plus de 350 Ko), refusé
  const choisirGif = (taille) => page.evaluate((taille) => {
    const tete = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));
    const octets = new Uint8Array(Math.max(tete.length, taille)); octets.set(tete);
    const dt = new DataTransfer(); dt.items.add(new File([octets], 'danse.gif', { type: 'image/gif' })); const inp = document.querySelector('#tc-fichier'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));
  }, taille);
  await choisirGif(400 * 1024);
  check(await attendre(async () => /Ce GIF est trop lourd : 350 Ko au plus/.test(await note(page))) && !(await etat(page)).piece, 'un GIF de la galerie de 400 Ko : « Ce GIF est trop lourd : 350 Ko au plus. »');
  await choisirGif(0);
  check(await attendre(async () => ((await etat(page)).piece || {}).type === 'image/gif'), 'un petit GIF de la galerie : prêt, tel quel (animé)');
  await page.tap('[data-tc="envoyer"]');
  check(await attendre(() => appels('fournil_chat_envoyer').length === 4) && /^data:image\/gif;base64,R0lGOD/.test(appels('fournil_chat_envoyer')[3].corps.p_image), 'il part en data:image/gif');
  await sleep(3100);

  // ─── GIPHY : les tendances, puis la recherche ; on n'envoie que l'identifiant ───
  const nG = giphy.appels.length;
  await page.tap('[data-tc="gif"]');
  check(await attendre(() => page.evaluate(() => !document.querySelector('#tc-gifs').hidden && document.querySelectorAll('.tc-gif-choix').length === 12)), 'le bouton GIF : la grille des tendances (12 GIF ; un identifiant douteux est écarté)');
  const t0 = giphy.appels[nG];
  check(t0 && t0.pathname === '/v1/gifs/trending' && t0.searchParams.get('api_key') === GIPHY && t0.searchParams.get('rating') === 'g' && t0.searchParams.get('limit') === '24', `la recherche vide : les tendances (${t0 && t0.pathname}?rating=g&limit=24, la clé de config.js)`);
  await page.fill('#tc-gif-q', 'croissant');
  check(await attendre(() => giphy.appels.length > nG + 1 && page.evaluate(() => document.querySelectorAll('.tc-gif-choix').length === 9)), 'taper « croissant » : la recherche, ses résultats');
  const s0 = giphy.appels[giphy.appels.length - 1];
  check(s0.pathname === '/v1/gifs/search' && s0.searchParams.get('q') === 'croissant' && s0.searchParams.get('rating') === 'g' && s0.searchParams.get('lang') === 'fr' && s0.searchParams.get('limit') === '24' && s0.searchParams.get('api_key') === GIPHY, `search?q=croissant&rating=g&lang=fr&limit=24 ${s0.search.replace(GIPHY, '…')}`);
  check(giphy.appels.length === nG + 2, 'une seule recherche pour le mot tapé d’un coup (on attend la fin de la frappe)');
  await attendre(() => page.evaluate(() => [...document.querySelectorAll('.tc-gif-choix img')].slice(0, 6).every((i) => i.complete && i.naturalWidth > 0)), 3000);
  await page.screenshot({ path: out + '/04-recherche-gif.png' });
  await page.tap('.tc-gif-choix[data-gif="cRoiSsant01"]');
  check(await page.evaluate(() => document.querySelector('#tc-gifs').hidden && /GIF prêt/.test(document.querySelector('#tc-piece').textContent)) && (await etat(page)).piece.gif === 'cRoiSsant01', 'toucher un GIF : la grille se ferme, « GIF prêt à partir »');
  await page.tap('[data-tc="envoyer"]');
  check(await attendre(() => appels('fournil_chat_envoyer').length === 5), 'Envoyer le GIF');
  const e5 = appels('fournil_chat_envoyer')[4].corps;
  check(e5.p_gif === 'cRoiSsant01' && e5.p_image === null && e5.p_texte === null, 'seul l’identifiant du GIF part (p_gif), ni image ni texte');
  await attendre(() => page.evaluate(() => { const i = [...document.querySelectorAll('.tc-msg.moi .tc-gifm img')].pop(); return i && i.complete && i.naturalWidth > 0; }));
  await page.evaluate(() => { const f = document.querySelector('#tc-fil'); f.scrollTop = f.scrollHeight; }); await sleep(300);
  await page.screenshot({ path: out + '/03-feuille-bulles.png' });
  await page.evaluate(() => { const f = document.querySelector('#tc-fil'), m = document.querySelector('.tc-gifm'); f.scrollTop = m.closest('.tc-msg').offsetTop - 120; }); await sleep(300);
  await page.screenshot({ path: out + '/03b-feuille-photo-gif.png' });

  // ─── l'appui long : Signaler (masqué au 3e signalement), Effacer le sien ───
  const cibleSig = faux.chat.find((m) => m.n === nGif); cibleSig.signal = 2; cibleSig.par.add('x').add('y');
  await page.evaluate((n) => document.querySelector(`.tc-msg[data-n="${n}"]`).scrollIntoView({ block: 'center' }), nGif); await sleep(200);
  await appuiLong(page, `.tc-msg[data-n="${nGif}"] .tc-bulle`);
  const mn = await page.evaluate(() => ({ vu: !document.querySelector('#tc-menu').hidden, qui: document.querySelector('#tc-menu-qui').textContent, sig: !document.querySelector('[data-tc="signaler"]').hidden, eff: !document.querySelector('[data-tc="effacer"]').hidden, zoom: !document.querySelector('#tc-zoom').hidden }));
  check(mn.vu && mn.qui === 'Message de Petit Jo' && mn.sig && !mn.eff && !mn.zoom, `appui long sur le GIF d’un autre : le menu « Signaler ce message » (pas Effacer, pas de zoom) ${JSON.stringify(mn)}`);
  await page.screenshot({ path: out + '/05-menu-signaler.png' });
  await page.tap('[data-tc="signaler"]');
  check(await attendre(() => appels('fournil_chat_signaler').length === 1), 'Signaler : fournil_chat_signaler');
  const sg = appels('fournil_chat_signaler')[0].corps;
  check(sg.p_id === id && /^[0-9a-f]{64}$/.test(sg.p_jeton) && sg.p_n === nGif, '(p_id, p_jeton, p_n)');
  check(await attendre(async () => /signalé, il est masqué/.test(await note(page))) && await page.evaluate((n) => !document.querySelector(`.tc-msg[data-n="${n}"]`), nGif), 'le 3e signalement : « Merci : le message est signalé, il est masqué. », la bulle disparaît');
  // signaler encore un message déjà signalé par soi
  const nMamie = faux.chat.find((m) => m.pseudo === 'Mamie Jo').n;
  await page.evaluate((n) => document.querySelector(`.tc-msg[data-n="${n}"]`).scrollIntoView({ block: 'center' }), nMamie); await sleep(200);
  await appuiLong(page, `.tc-msg[data-n="${nMamie}"] .tc-bulle`); await page.tap('[data-tc="signaler"]');
  check(await attendre(async () => /^Merci : le message est signalé\.$/.test(await note(page))) && await page.evaluate((n) => !!document.querySelector(`.tc-msg[data-n="${n}"]`), nMamie), 'un 1er signalement : « Merci : le message est signalé. », la bulle reste');
  await appuiLong(page, `.tc-msg[data-n="${nMamie}"] .tc-bulle`); await page.tap('[data-tc="signaler"]');
  check(await attendre(async () => /déjà signalé/.test(await note(page))), 'le signaler deux fois : « Tu as déjà signalé ce message. »');
  // effacer le sien
  const nMien = faux.chat.find((m) => m.joueur === id && m.texte === 'Bonjour les boulangers 🥖').n;
  await page.evaluate((n) => document.querySelector(`.tc-msg[data-n="${n}"]`).scrollIntoView({ block: 'center' }), nMien); await sleep(200);
  await appuiLong(page, `.tc-msg[data-n="${nMien}"] .tc-bulle`);
  const mm = await page.evaluate(() => ({ qui: document.querySelector('#tc-menu-qui').textContent, sig: !document.querySelector('[data-tc="signaler"]').hidden, eff: !document.querySelector('[data-tc="effacer"]').hidden }));
  check(mm.qui === 'Ton message' && !mm.sig && mm.eff, 'appui long sur son message : « Effacer mon message » (pas Signaler)');
  await page.screenshot({ path: out + '/05b-menu-effacer.png' });
  await page.tap('[data-tc="effacer"]');
  check(await attendre(() => appels('fournil_chat_effacer').length === 1 && appels('fournil_chat_effacer')[0].corps.p_n === nMien) && await attendre(() => page.evaluate((n) => !document.querySelector(`.tc-msg[data-n="${n}"]`), nMien)) && faux.chat.find((m) => m.n === nMien).masque, 'Effacer : fournil_chat_effacer(p_n), la bulle disparaît');
  // les refus du serveur, par le moteur : effacer le message d'un autre, signaler un message disparu, signaler en étant banni
  const ef = await page.evaluate((n) => window.__fournil.classement().chatEffacer(n), nMamie);
  check(ef.etat === 'refus' && ef.erreur === 'pas-a-toi' && !faux.chat.find((m) => m.n === nMamie).masque, `chatEffacer du message d’un autre : refus « pas-a-toi » ${JSON.stringify(ef)}`);
  const sa = await page.evaluate((n) => window.__fournil.classement().chatSignaler(n), nMien);
  check(sa.etat === 'refus' && sa.erreur === 'absent', 'chatSignaler d’un message effacé : refus « absent »');
  faux.mode = 'banni';
  await page.evaluate((n) => document.querySelector(`.tc-msg[data-n="${n}"]`).scrollIntoView({ block: 'center' }), nMamie); await sleep(200);
  await appuiLong(page, `.tc-msg[data-n="${nMamie}"] .tc-bulle`); await page.tap('[data-tc="signaler"]');
  check(await attendre(async () => /Tu ne peux plus signaler de message/.test(await note(page))), 'banni, signaler : « Tu ne peux plus signaler de message. »');
  faux.mode = 'normal';
  // le serveur marque ses messages (moi) : un message à soi signé d'un ancien pseudo (écrit avant d'en changer, d'un autre appareil) est à droite
  faux.chat.push({ n: faux.chat[faux.chat.length - 1].n + 1, joueur: id, pseudo: 'Ancien Lucas', texte: 'Écrit depuis ma tablette', gif: null, image: null, cree: Date.now(), masque: false, signal: 0, par: new Set() });
  const nTab = faux.chat[faux.chat.length - 1].n;
  check(await attendre(() => page.evaluate((n) => { const m = document.querySelector(`.tc-msg[data-n="${n}"]`); return m && m.classList.contains('moi') && !m.querySelector('.tc-pseudo'); }, nTab), 5000), 'le serveur dit « moi » : son message d’un autre appareil, sous un ancien pseudo, est à droite');
  const lu = appels('fournil_chat_lire').slice(-1)[0].corps;
  check(lu.p_id === id && /^[0-9a-f]{64}$/.test(lu.p_jeton), 'avec un pseudo, fournil_chat_lire reçoit aussi p_id et p_jeton');
  await page.mouse.click(195, 300, { button: 'right' }); // le clic droit (comme l'appui long d'Android) sur une bulle ou à côté : rien ne casse
  await page.evaluate(() => { document.querySelector('#tc-menu').hidden = true; });
  // le fil relu en entier de temps en temps : un message masqué par d'autres disparaît
  const nTonton = faux.chat.find((m) => m.texte === 'Quelqu’un a débloqué les éclairs ?').n; faux.chat.find((m) => m.n === nTonton).masque = true;
  check(await attendre(() => page.evaluate((n) => !document.querySelector(`.tc-msg[data-n="${n}"]`), nTonton), 9000), 'un message masqué par les signalements des autres : il disparaît (relecture complète régulière)');

  // ─── banni ───
  faux.mode = 'banni';
  await page.fill('#tc-texte', 'Je reviens'); await page.tap('[data-tc="envoyer"]');
  check(await attendre(async () => /Tu ne peux plus écrire dans le chat/.test(await note(page))), 'banni : « Tu ne peux plus écrire dans le chat. »');
  faux.mode = 'normal';
  await page.tap('[data-tc="fermer"]'); await sleep(300);

  // ─── pas encore ouvert (supabase/fournil-chat.sql pas collé) : l'onglet reste, le chat dit « bientôt » ───
  faux.mode = 'pas-ouvert';
  await ouvrirChat(page);
  check(await attendre(() => page.evaluate(() => /Le chat ouvre bientôt/.test(document.querySelector('#tc-fil').innerText) && document.querySelector('#tc-bas').hidden && !document.querySelectorAll('.tc-msg').length)), 'fonctions absentes (404, PGRST202) : « Le chat ouvre bientôt », pas de barre de saisie');
  check((await page.evaluate(() => window.__fournil.classement().chatEnvoyer({ texte: 'a' }))).etat === 'pas-ouvert' && !(await page.evaluate(() => document.querySelector('#b-classement').hidden)), 'chatEnvoyer : « pas-ouvert » ; le classement, lui, reste là');
  await page.screenshot({ path: out + '/06-bientot.png' });
  const nP = appels('fournil_chat_lire').length; await sleep(2000);
  check(appels('fournil_chat_lire').length === nP, 'pas encore de chat : plus de lecture tant que la feuille reste ouverte');
  // une période du rang d'onglets du chat : retour à la feuille du classement, sur cette période
  await page.tap('#tc-onglets [data-tab="semaine"]'); await sleep(500);
  check(await page.evaluate(() => document.querySelector('#tchat').hidden && !document.querySelector('#feuille').hidden && (document.querySelector('#feuille-contenu [data-tab].actif') || {}).dataset.tab === 'semaine'), 'l’onglet « Semaine » en tête du chat : retour à la feuille du classement, sur la semaine');
  await page.evaluate(() => document.querySelector('#feuille-contenu [data-a="close"]').click()); await sleep(2500);
  check(appels('fournil_chat_lire').length === nP && !(await page.evaluate(() => document.querySelector('#b-classement').hidden)), 'ni en arrière-plan ; le bouton du classement (et son onglet « Chat ») reste');
  faux.mode = 'normal';

  // ─── sans clé GIPHY : le bouton GIF dit « bientôt » ───
  config = 'sans';
  const p2 = await ctx.newPage(); suivre(p2);
  await p2.goto(BASE + '/fournil/'); await sleep(1200);
  await ouvrirChat(p2); await sleep(200);
  check(await p2.evaluate(() => document.querySelector('[data-tc="gif"]').classList.contains('bientot') && document.querySelector('[data-tc="gif"]').getAttribute('aria-label') === 'Les GIF : bientôt'), 'sans clé GIPHY dans config.js : le bouton GIF est grisé, « bientôt »');
  const nG2 = giphy.appels.length;
  await p2.tap('[data-tc="gif"]');
  check(await attendre(async () => /Les GIF arrivent bientôt/.test(await note(p2))) && await p2.evaluate(() => document.querySelector('#tc-gifs').hidden) && giphy.appels.length === nG2, 'le toucher : « Les GIF arrivent bientôt. », aucun appel à GIPHY');
  await p2.close();

  // ─── sans configuration (l'artefact) : pas de bouton ───
  config = 'aucune';
  const p3 = await ctx.newPage(); suivre(p3);
  await p3.goto(BASE + '/fournil/'); await sleep(1200);
  check(await p3.evaluate(() => document.querySelector('#b-classement').hidden && !document.querySelector('[data-tab="chat"]') && !window.__fournil.tchat.ouvrir()), 'sans configuration : ni bouton du classement ni onglet, le chat ne s’ouvre pas');
  await p3.close();
  config = 'giphy';

  // ─── le service worker : les requêtes vers GIPHY ne sont jamais prises en charge (ni copie, ni cache) ───
  const sw = (() => {
    const ecouteurs = {}, ctxSw = { self: null, URL, Request: function R() {}, caches: { open: () => Promise.resolve({ put() {}, addAll: () => Promise.resolve() }), match: () => Promise.resolve(null), keys: () => Promise.resolve([]) }, fetch: () => Promise.resolve({ ok: true, clone() { return this; } }), Promise, console };
    ctxSw.self = { location: new URL(BASE + '/fournil/sw.js'), registration: { scope: BASE + '/fournil/' }, addEventListener: (t, f) => { ecouteurs[t] = f; }, skipWaiting() {}, clients: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'fournil', 'sw.js'), 'utf8'), ctxSw);
    return (url) => { let pris = false; ecouteurs.fetch({ request: { url, method: 'GET', mode: 'cors' }, respondWith: () => { pris = true; } }); return pris; };
  })();
  check(!sw('https://api.giphy.com/v1/gifs/search?api_key=x&q=pain') && !sw('https://media.giphy.com/media/abcDEF123/200w.gif') && !sw('https://media2.giphy.com/media/abcDEF123/giphy.gif') && sw(BASE + '/vendor/three.min.js'), 'fournil/sw.js : GIPHY (api, media) va toujours au réseau, jamais au cache ; un fichier du jeu, lui, passe par le cache');

  check(errors.length === 0, `aucune erreur dans la console (${errors.slice(0, 3).join(' | ')})`);
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
