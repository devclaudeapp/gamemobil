#!/usr/bin/env node
// Le Fournil : le chat général éprouvé POUR DE VRAI contre le projet Supabase du jeu (sur GitHub Actions : le conteneur de Claude
// ne peut pas joindre Supabase). Node 22, fetch, la clé PUBLIQUE seulement (fournil/config.js).
//  1. le chat est-il installé (supabase/fournil-chat.sql collé par-dessus la v6) ? Sinon : message clair, et le test échoue ;
//  2. les tables sont-elles fermées (lecture directe refusée, fonctions internes refusées) ?
//  3. un joueur de test (pseudo « ci-… » tiré au hasard) s'inscrit au classement, envoie un texte (et se fait refuser un mauvais
//     jeton, un message vide, une image SVG, un GIF qui n'en est pas un, un deuxième envoi aussitôt, son propre signalement),
//     le relit (« moi » avec son jeton, pas sans), l'efface, puis il est retiré du classement : ses messages partent avec lui.
// Le joueur de test est TOUJOURS retiré à la fin (finally) : rien ne reste dans le classement ni dans le chat des amis. Son message
// n'est visible que quelques secondes.
// Ce test inscrit UN joueur depuis cette machine : il passe avant test/fournil-classement-ci.cjs dans le workflow, dont la sonde
// épuise la limite d'inscriptions par source (10 par heure).
// Lancement : node test/fournil-chat-ci.cjs (adresse et clé : FOURNIL_SUPABASE_URL / FOURNIL_SUPABASE_KEY, sinon fournil/config.js)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function lireConfig() {
  if (process.env.FOURNIL_SUPABASE_URL && process.env.FOURNIL_SUPABASE_KEY) return { url: process.env.FOURNIL_SUPABASE_URL, key: process.env.FOURNIL_SUPABASE_KEY, bearer: true };
  const t = fs.readFileSync(path.join(__dirname, '..', 'fournil', 'config.js'), 'utf8'), u = /supabaseUrl\s*:\s*['"]([^'"]+)['"]/.exec(t), k = /supabaseKey\s*:\s*['"]([^'"]+)['"]/.exec(t);
  return { url: u[1], key: k[1], bearer: !/bearer\s*:\s*false/.test(t) };
}
const CONFIG = lireConfig(), BASE = CONFIG.url.replace(/\/+$/, ''), CLE = CONFIG.key;
if (/^sb_secret_/.test(CLE) || /service_role/.test(Buffer.from((CLE.split('.')[1] || ''), 'base64').toString('utf8'))) { console.error('Jamais de clé secrète ici : seule la clé publique (sb_publishable_…) a sa place.'); process.exit(1); }
let fails = 0, oks = 0; const lignes = [];
const check = (ok, msg) => { const l = (ok ? '  ok   ' : '  FAIL ') + msg; console.log(l); lignes.push(l); if (ok) oks++; else fails++; return ok; };
const log = (msg) => { console.log(msg); lignes.push(msg); };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const hasard = (n) => crypto.randomBytes(n).toString('hex');
const entetes = { apikey: CLE, 'Content-Type': 'application/json', Accept: 'application/json', ...(CONFIG.bearer ? { Authorization: 'Bearer ' + CLE } : {}) };
async function appel(methode, chemin, corps) {
  try {
    const r = await fetch(BASE + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(15000) });
    const texte = await r.text(); let data = null; try { data = JSON.parse(texte); } catch (e) { /* pas du JSON */ }
    return { status: r.status, data, texte: texte.slice(0, 300) };
  } catch (e) { return { status: 0, data: null, texte: String(e && e.cause && e.cause.code || e && e.message || e) }; }
}
const rpc = (nom, corps) => appel('POST', '/rest/v1/rpc/' + nom, corps || {});
const code = (r) => (r.data && r.data.code) || '';
function bilan() {
  const b = fails ? `**${fails} échec(s)**, ${oks} ok` : `**tout est bon** (${oks} vérifications)`;
  console.log(`\n${oks} ok, ${fails} en échec`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Le Fournil — le chat sur Supabase, pour de vrai', '', b, '', '<details><summary>le détail</summary>', '', '```', ...lignes, '```', '</details>', ''].join('\n') + '\n'); } catch (e) { /* rien */ } }
}

(async () => {
  log(`── le chat du Fournil sur ${BASE}, ${new Date().toISOString()}`);
  const J = { id: crypto.randomUUID(), jeton: hasard(32), pseudo: 'ci-' + hasard(4) };
  let inscrit = false;
  try {
    // 1. installé ?
    const l0 = await rpc('fournil_chat_lire', { p_apres: 0, p_limite: 1 });
    if (l0.status === 0) { check(false, `Supabase injoignable (${l0.texte}) : le projet est peut-être en pause — le réveiller depuis le tableau de bord, puis relancer`); return; }
    if (l0.status === 404 || code(l0) === 'PGRST202' || /Could not find the function/i.test(l0.texte)) {
      check(false, "le chat n'est pas installé : colle supabase/fournil-chat.sql dans le SQL Editor de Supabase (New query → coller → Run), par-dessus le classement v6, puis relance ce test"); return;
    }
    if (code(l0) === '42501') { check(false, "les fonctions du chat existent mais anon n'a pas le droit de les appeler : recolle supabase/fournil-chat.sql (il remet les droits)"); return; }
    if (!check(l0.status === 200 && l0.data && l0.data.ok === true && Array.isArray(l0.data.messages) && Number.isInteger(l0.data.dernier), `fournil_chat_lire répond, sans pseudo (statut ${l0.status}, dernier ${l0.data && l0.data.dernier})`)) return;
    for (const nom of ['fournil_chat_image', 'fournil_chat_envoyer', 'fournil_chat_signaler', 'fournil_chat_effacer']) {
      const corps = nom === 'fournil_chat_image' ? { p_n: 0 } : nom === 'fournil_chat_envoyer' ? { p_id: J.id, p_jeton: 'court', p_texte: 'x', p_gif: null, p_image: null } : { p_id: J.id, p_jeton: 'court', p_n: 0 };
      const r = await rpc(nom, corps);
      if (r.status === 404) { check(false, `${nom} manque : recolle supabase/fournil-chat.sql dans le SQL Editor`); return; }
      check(r.status === 200 && r.data && (nom === 'fournil_chat_image' ? r.data.ok === true && r.data.data === null : r.data.ok === false && r.data.erreur === 'jeton'), `${nom} est installée (${r.texte.slice(0, 100)})`);
    }

    // 2. fermé ?
    for (const t of ['fournil_chat', 'fournil_chat_images', 'fournil_chat_signalements', 'fournil_chat_bannis']) {
      const r = await appel('GET', `/rest/v1/${t}?select=*&limit=1`);
      check(r.status >= 400 || r.texte === '[]', `la table ${t} ne se lit pas directement (statut ${r.status})`);
    }
    const w = await appel('POST', '/rest/v1/fournil_chat', { joueur: J.id, pseudo: 'intrus', texte: 'x' });
    check(w.status >= 400, `on n’écrit pas directement dans fournil_chat (statut ${w.status})`);
    const qui = await rpc('fournil_chat_qui', { p_id: J.id, p_jeton: J.jeton });
    check(qui.status >= 400, `la vérification interne est refusée (fournil_chat_qui : statut ${qui.status})`);

    // 3. un joueur de test
    const p = await rpc('fournil_publier', { p_id: J.id, p_jeton: J.jeton, p_pseudo: J.pseudo, p_fortune: 1000 });
    inscrit = !!(p.data && p.data.ok === true);
    if (!check(inscrit, `${J.pseudo} s’inscrit au classement (${p.texte.slice(0, 100)})`)) {
      if (p.data && p.data.erreur === 'trop_vite') log("     → « trop_vite » : cette machine a déjà inscrit 10 joueurs dans l'heure (ou 60 joueurs se sont inscrits dans l'heure) ; relancer plus tard");
      return;
    }
    let r = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: hasard(32), p_texte: 'x', p_gif: null, p_image: null });
    check(r.data && r.data.erreur === 'jeton', `un mauvais jeton : « jeton » (${r.texte})`);
    r = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: J.jeton, p_texte: '   ', p_gif: null, p_image: null });
    check(r.data && r.data.erreur === 'vide', `un message vide : « vide » (${r.texte})`);
    r = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: J.jeton, p_texte: 'x', p_gif: null, p_image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
    check(r.data && r.data.erreur === 'image', `une image SVG : « image » (${r.texte})`);
    r = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: J.jeton, p_texte: 'x', p_gif: '../x', p_image: null });
    check(r.data && r.data.erreur === 'gif', `un GIF qui n’en est pas un : « gif » (${r.texte})`);
    const texte = 'essai automatique ' + hasard(3);
    r = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: J.jeton, p_texte: '  ' + texte + '\n', p_gif: null, p_image: null });
    const n = r.data && r.data.n;
    check(r.status === 200 && r.data && r.data.ok === true && Number.isInteger(n), `un texte envoyé : n ${n} (${r.texte})`);
    const vite = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: J.jeton, p_texte: 'encore', p_gif: null, p_image: null });
    check(vite.data && vite.data.erreur === 'trop-vite', `un deuxième aussitôt : « trop-vite » (${vite.texte})`);
    const sig = await rpc('fournil_chat_signaler', { p_id: J.id, p_jeton: J.jeton, p_n: n });
    check(sig.data && sig.data.ok === false && sig.data.erreur === 'soi', `signaler son propre message : « soi » (${sig.texte})`);
    let l = await rpc('fournil_chat_lire', { p_apres: n - 1, p_limite: 50, p_id: J.id, p_jeton: J.jeton });
    let m = l.data && l.data.messages.find((x) => x.n === n);
    check(!!(m && m.texte === texte && m.pseudo === J.pseudo && m.moi === true && m.image === false && m.gif === null && Math.abs(m.cree - Date.now()) < 120000 && l.data.dernier >= n), `relu avec son jeton : « ${m && m.texte} », moi, heure du serveur proche (${m && new Date(m.cree).toISOString()})`);
    l = await rpc('fournil_chat_lire', { p_apres: n - 1 });
    m = l.data && l.data.messages.find((x) => x.n === n);
    check(!!(m && m.moi === false) && !JSON.stringify(l.data).includes(J.id) && !JSON.stringify(l.data).includes(J.jeton), 'relu sans pseudo : là aussi, sans « moi », ni identifiant ni jeton dans la réponse');
    const e = await rpc('fournil_chat_effacer', { p_id: J.id, p_jeton: J.jeton, p_n: n });
    l = await rpc('fournil_chat_lire', { p_apres: n - 1 });
    check(e.data && e.data.ok === true && l.data && !l.data.messages.some((x) => x.n === n), `il l’efface : il ne se lit plus (${e.texte})`);
    await attendre(3500);
    r = await rpc('fournil_chat_envoyer', { p_id: J.id, p_jeton: J.jeton, p_texte: 'au revoir ' + hasard(3), p_gif: null, p_image: null });
    check(r.data && r.data.ok === true, '3,5 s plus tard : un autre message accepté');
    const n2 = r.data && r.data.n;
    const ret = await rpc('fournil_retirer', { p_id: J.id, p_jeton: J.jeton });
    inscrit = !(ret.data && ret.data.ok === true);
    l = await rpc('fournil_chat_lire', { p_apres: (n2 || n) - 1 });
    check(!inscrit && l.data && !l.data.messages.some((x) => x.n === n2), `${J.pseudo} quitte le classement : son message part avec lui`);
  } catch (err) {
    check(false, 'exception : ' + (err && err.message));
  } finally {
    if (inscrit) { const r = await rpc('fournil_retirer', { p_id: J.id, p_jeton: J.jeton }); check(!!(r.data && r.data.ok), `${J.pseudo} retiré`); }
    bilan();
    process.exit(fails ? 1 : 0);
  }
})();
