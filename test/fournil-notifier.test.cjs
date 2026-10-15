#!/usr/bin/env node
// Le Fournil : la fonction d'envoi des notifications (supabase/functions/notifier/index.ts), éprouvée en Node sans Deno, sans
// Supabase et sans vrai service de notifications : le fichier TypeScript est lu tel quel, ses types retirés par Node
// (module.stripTypeScriptTypes, Node 22.13 ou plus récent), « npm:web-push » remplacé par un faux web-push qui note chaque envoi,
// Deno par un faux (ses variables d'environnement, Deno.serve), et Supabase (PostgREST) par un faux fetch.
// On vérifie : le secret du réveil (CRON_SECRET), la lecture de la file avec la clé de service, le contenu envoyé ({ titre, texte,
// url, type }), les clés VAPID passées à web-push, l'accusé (notifications traitées, appareils 404 et 410 retirés), les erreurs
// passagères, et qu'aucun secret n'est écrit dans le dépôt.
// Lancement : node test/fournil-notifier.test.cjs
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

let fails = 0, oks = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else fails++; return ok; };
const titre = (t) => console.log(`── ${t} ──`);

const FICHIER = path.join(__dirname, '..', 'supabase', 'functions', 'notifier', 'index.ts');
const SOURCE = fs.readFileSync(FICHIER, 'utf8');

(async () => {
  titre('le fichier');
  const imports = SOURCE.match(/^import .*$/gm) || [];
  check(imports.length === 1 && imports[0] === "import webpush from 'npm:web-push@3.6.7';", `une seule dépendance, web-push en version exacte (${imports.join(' ; ')})`);
  const code = SOURCE.replace(/\/\/[^\n]*/g, '');
  check(/env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/.test(code) && (code.match(/SUPABASE_SERVICE_ROLE_KEY/g) || []).length === 2, 'la clé de service n’est lue que dans l’environnement de la fonction (Deno.env)');
  for (const [motif, quoi] of [[/sb_secret_[A-Za-z0-9_-]{6,}/, 'clé sb_secret_'], [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'jeton JWT'], [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clé privée PEM'], [/['"][A-Za-z0-9_-]{43}['"]/, 'clé privée VAPID (43 caractères base64url)'], [/['"][A-Za-z0-9_-]{87}['"]/, 'clé publique VAPID en dur']]) {
    check(!motif.test(SOURCE), `aucune ${quoi} dans le fichier`);
  }
  // et nulle part dans les fichiers de ce chantier
  for (const f of ['supabase/fournil-classement.sql', 'supabase/fournil-notifs-cron.sql', 'supabase/README.md', 'test/fournil-classement-ci.cjs', 'test/fournil-classement-sql.cjs']) {
    const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    check(!/sb_secret_[A-Za-z0-9_-]{6,}/.test(t) && !/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t) && !/"role"\s*:\s*"service_role"/.test(t), `${f} : ni clé secrète, ni clé privée`);
  }

  // ─── charger le fichier : types retirés, web-push et Deno imités ───
  const { stripTypeScriptTypes } = require('node:module');
  if (typeof stripTypeScriptTypes !== 'function') { console.log('  FAIL Node trop ancien : module.stripTypeScriptTypes manque (Node 22.13 ou plus récent)'); process.exit(1); }
  const js = stripTypeScriptTypes(SOURCE.replace("import webpush from 'npm:web-push@3.6.7';", 'const webpush = globalThis.__fauxWebpush;'), { mode: 'strip' });
  const envois = [];
  let codes = {}; // endpoint → statusCode d'échec
  globalThis.__fauxWebpush = {
    sendNotification: async (sub, contenu, options) => {
      envois.push({ sub, contenu, options });
      if (codes[sub.endpoint]) { const e = new Error('Received unexpected response code'); e.statusCode = codes[sub.endpoint]; throw e; }
      return { statusCode: 201 };
    },
  };
  let gestionnaire = null;
  const ENV = new Map();
  globalThis.Deno = { env: { get: (k) => ENV.get(k) }, serve: (h) => { gestionnaire = h; } };
  const M = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  check(typeof gestionnaire === 'function' && typeof M.traiter === 'function' && typeof M.tournee === 'function', 'le fichier se charge (types retirés) et appelle Deno.serve');

  // un faux Supabase : POST /rest/v1/rpc/<nom>, note les appels et leurs en-têtes
  const appels = [];
  let file = [], panne = null;
  globalThis.fetch = async (url, init) => {
    const m = /^https:\/\/banc\.supabase\.co\/rest\/v1\/rpc\/(\w+)$/.exec(url);
    const corps = JSON.parse(init.body);
    appels.push({ nom: m && m[1], corps, entetes: init.headers, methode: init.method });
    const rep = (s, c) => ({ ok: s < 300, status: s, text: async () => JSON.stringify(c) });
    if (!m) return rep(404, { message: 'introuvable' });
    if (panne) return rep(panne, { message: 'panne' });
    if (m[1] === 'fournil_notifs_dues') { const f = file; file = []; return rep(200, f); }
    if (m[1] === 'fournil_notifs_faites') return rep(200, { ok: true, faites: corps.p_ids.length, retires: corps.p_morts.length });
    return rep(404, { code: 'PGRST202' });
  };
  const SECRET = crypto.randomBytes(24).toString('base64url');
  // une vraie paire VAPID, au format de la page « Clés des notifications » : publique 65 octets (non compressée), privée 32 octets
  const paire = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = paire.privateKey.export({ format: 'jwk' });
  const PUB = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  const PRIV = jwk.d;
  const remplir = () => { ENV.clear(); for (const [k, v] of Object.entries({ CRON_SECRET: SECRET, VAPID_PUBLIC: PUB, VAPID_PRIVATE: PRIV, VAPID_SUJET: 'https://devclaudeapp.github.io/gamemobil/fournil/', SUPABASE_URL: 'https://banc.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'faux.jeton.de-service' })) ENV.set(k, v); };
  remplir();
  const req = (auth, methode = 'POST') => new Request('https://banc.supabase.co/functions/v1/notifier', { method: methode, headers: auth == null ? {} : { Authorization: auth }, body: methode === 'POST' ? '{}' : undefined });
  const lire = async (r) => ({ statut: r.status, corps: await r.json() });
  const S = (k) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/appareil-${k}`, p256dh: 'BP' + k, auth: 'au' + k });

  titre('le secret du réveil (CRON_SECRET)');
  for (const [a, quoi] of [[null, 'sans en-tête'], ['Bearer ', 'un Bearer vide'], ['Bearer ' + SECRET.slice(0, -1), 'un secret presque juste'], ['Bearer ' + SECRET + 'x', 'un secret trop long'], [SECRET, 'le secret sans « Bearer »'], ['Bearer faux.jeton.de-service', 'la clé de service à la place du secret']]) {
    const r = await lire(await gestionnaire(req(a)));
    check(r.statut === 401 && r.corps.ok === false, `${quoi} : 401`);
  }
  check(appels.length === 0 && envois.length === 0, 'refusé : ni Supabase ni web-push n’ont été appelés');
  let r = await lire(await gestionnaire(req('Bearer ' + SECRET, 'GET')));
  check(r.statut === 405, 'un GET : 405');
  ENV.delete('CRON_SECRET');
  r = await lire(await gestionnaire(req('Bearer ')));
  check(r.statut === 500 && /CRON_SECRET/.test(r.corps.erreur) && appels.length === 0, 'sans CRON_SECRET configuré : tout est refusé (500), même un Bearer vide');
  ENV.set('CRON_SECRET', 'court'); r = await lire(await gestionnaire(req('Bearer court')));
  check(r.statut === 500 && appels.length === 0, 'un CRON_SECRET trop court (moins de 24 caractères) : tout est refusé');
  remplir(); ENV.delete('VAPID_PRIVATE');
  r = await lire(await gestionnaire(req('Bearer ' + SECRET)));
  check(r.statut === 500 && /VAPID_PRIVATE/.test(r.corps.erreur) && !JSON.stringify(r.corps).includes(PUB) && appels.length === 0, `un secret VAPID manquant : 500, le nom du secret dit, aucune valeur (${r.corps.erreur})`);
  remplir(); ENV.set('VAPID_SUJET', 'boulanger@example.com');
  r = await lire(await gestionnaire(req('Bearer ' + SECRET)));
  check(r.statut === 500 && /mailto/.test(r.corps.erreur), 'un VAPID_SUJET sans mailto: ni https:// : 500');
  remplir();
  check(M.egal('abc', 'abc') && !M.egal('abc', 'abd') && !M.egal('abc', 'abcd') && !M.egal('', 'a'), 'la comparaison du secret (en temps constant) est juste');

  titre('une tournée');
  r = await lire(await gestionnaire(req('Bearer ' + SECRET)));
  check(r.statut === 200 && r.corps.ok && r.corps.notifications === 0 && appels.length === 1 && appels[0].nom === 'fournil_notifs_dues' && envois.length === 0, `une file vide : une lecture, rien d’envoyé, rien à accuser (${JSON.stringify(r.corps)})`);
  check(appels[0].methode === 'POST' && appels[0].entetes.apikey === 'faux.jeton.de-service' && appels[0].entetes.Authorization === 'Bearer faux.jeton.de-service' && appels[0].corps.p_limite === 100, 'fournil_notifs_dues est appelée avec la clé de service de l’environnement (apikey + Bearer), 100 au plus');
  appels.length = 0;
  file = [
    { notif_id: 11, type: 'essai', titre: 'Le Fournil', texte: 'Ça marche ! Le Fournil te préviendra ici.', url: './', subs: [S(1), S(2)] },
    { notif_id: 12, type: 'pourboire', titre: 'Le Fournil', texte: 'Lucas t\'a laissé un pourboire 🥐', url: './', subs: [S(3), S(4), S(5)] },
    { notif_id: 13, type: 'pleine', titre: 'Le Fournil', texte: 'Ta boulangerie déborde ! Tes apprentis t\'attendent.', url: './', subs: [] },
    { notif_id: 14, type: 'evenement', titre: 'Le Fournil', texte: 'La Maison hantée ouvre ses portes ! Viens jouer.', url: './', subs: [S(6), { endpoint: 'https://pirate.example.com/x', p256dh: 'B', auth: 'a' }] },
  ];
  codes = { [S(2).endpoint]: 410, [S(4).endpoint]: 404, [S(5).endpoint]: 500 };
  const journal = [];
  const bilan = await M.tournee(globalThis.Deno.env, { webpush: globalThis.__fauxWebpush, fetch: globalThis.fetch, journal: (m) => journal.push(m) });
  check(bilan.ok && bilan.notifications === 4 && bilan.envois === 3 && bilan.echecs === 1 && bilan.appareils_retires === 3, `quatre notifications, six appareils : 3 envois, 2 appareils disparus (404, 410), 1 échec passager (500), une adresse hors des services de notifications écartée (${JSON.stringify(bilan)})`);
  check(envois.length === 6 && !envois.some((x) => x.sub.endpoint.includes('pirate')), 'web-push est appelé pour chaque appareil, jamais pour une adresse hors des services de notifications');
  const e1 = envois.find((x) => x.sub.endpoint === S(1).endpoint);
  check(e1 && JSON.stringify(JSON.parse(e1.contenu)) === JSON.stringify({ titre: 'Le Fournil', texte: 'Ça marche ! Le Fournil te préviendra ici.', url: './', type: 'essai' }) && e1.sub.keys.p256dh === 'BP1' && e1.sub.keys.auth === 'au1',
    `le contenu envoyé : ${e1 && e1.contenu} ; l’abonnement { endpoint, keys: { p256dh, auth } }`);
  check(envois.every((x) => x.options.vapidDetails.publicKey === PUB && x.options.vapidDetails.privateKey === PRIV && x.options.vapidDetails.subject === 'https://devclaudeapp.github.io/gamemobil/fournil/' && x.options.TTL > 0 && x.options.timeout === 10000),
    'chaque envoi est signé avec les clés VAPID des secrets, une durée de vie (TTL) et un délai de 10 s');
  check(envois.find((x) => x.sub.endpoint === S(1).endpoint).options.urgency === 'high' && envois.find((x) => x.sub.endpoint === S(3).endpoint).options.urgency === 'normal', 'l’essai part en urgence haute, le reste en normal');
  const acq = appels.find((x) => x.nom === 'fournil_notifs_faites');
  check(acq && JSON.stringify(acq.corps.p_ids.slice().sort()) === '[11,12,13,14]' && JSON.stringify(acq.corps.p_morts.slice().sort()) === JSON.stringify([S(2).endpoint, S(4).endpoint, 'https://pirate.example.com/x'].sort()) && acq.entetes.apikey === 'faux.jeton.de-service',
    `l’accusé (fournil_notifs_faites, clé de service) : les 4 notifications traitées (même celle sans appareil, même l’échec passager : pas de rafale), les appareils 404 et 410 retirés (${JSON.stringify(acq && acq.corps.p_morts.map((x) => x.replace(/.*\//, '')))})`);
  check(journal.some((m) => /12 \(pourboire\) : échec 500/.test(m)) && !journal.join('\n').includes(PRIV) && !journal.join('\n').includes('faux.jeton') && !journal.join('\n').includes('appareil-'), 'le journal dit l’échec passager, sans clé ni adresse d’appareil');

  titre('une clé sb_secret_ (nouvelles clés de Supabase)');
  appels.length = 0; envois.length = 0; codes = {};
  ENV.set('SUPABASE_SERVICE_ROLE_KEY', 'sb_' + 'secret_banc');
  r = await lire(await gestionnaire(req('Bearer ' + SECRET)));
  check(r.statut === 200 && appels[0].entetes.apikey === 'sb_' + 'secret_banc' && !('Authorization' in appels[0].entetes), 'une clé qui n’est pas un JWT passe par l’en-tête apikey seul');
  remplir();

  titre('Supabase en panne');
  appels.length = 0; panne = 503;
  r = await lire(await gestionnaire(req('Bearer ' + SECRET)));
  check(r.statut === 500 && r.corps.ok === false && !JSON.stringify(r.corps).includes('faux.jeton') && envois.length === 0, `la file ne se lit pas (503) : 500, rien d’envoyé, aucun secret dans la réponse (${JSON.stringify(r.corps)})`);
  panne = null;

  titre('les clés VAPID au format de la page');
  check(Buffer.from(PUB, 'base64url').length === 65 && Buffer.from(PUB, 'base64url')[0] === 4 && Buffer.from(PRIV, 'base64url').length === 32 && !/[=+/]/.test(PUB + PRIV), `publique : 65 octets non compressée (${PUB.length} caractères base64url), privée : 32 octets (${PRIV.length} caractères), sans « = »`);

  console.log(fails ? `\n${fails} échec(s), ${oks} ok` : `\ntout est bon (${oks} vérifications)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('  FAIL le test plante :', e && e.stack || e); process.exit(1); });
