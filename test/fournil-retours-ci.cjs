#!/usr/bin/env node
// Le Fournil : les idées, les bugs et les votes éprouvés POUR DE VRAI contre le projet Supabase du jeu (sur GitHub Actions : le
// conteneur de Claude ne peut pas joindre Supabase). Node 22, fetch, la clé PUBLIQUE seulement (fournil/config.js).
//  1. les retours sont-ils installés (supabase/fournil-retours.sql collé par-dessus la v6) ? Sinon : message clair, et le test échoue ;
//  2. les tables sont-elles fermées (lecture et écriture directes refusées, fonctions internes refusées) ?
//  3. un joueur de test (pseudo « ci-… » tiré au hasard) s'inscrit au classement, lit les votes ouverts (sans pseudo et avec),
//     envoie une idée (et se fait refuser un mauvais jeton, un texte vide, un type inconnu, une image SVG, un deuxième envoi
//     aussitôt, un vote qui n'existe pas), demande s'il est admin (non), essaie chaque fonction de l'admin (« pas-admin »),
//     puis il est retiré du classement : son idée part avec lui.
// Le joueur de test est TOUJOURS retiré à la fin (finally). Son idée ne réveille pas l'admin : les pseudos « ci-… » ne déclenchent
// pas de notification (voir fournil_retour_envoyer).
// Ce test inscrit UN joueur depuis cette machine : il passe avant test/fournil-classement-ci.cjs dans le workflow, dont la sonde
// épuise la limite d'inscriptions par source (10 par heure).
// Lancement : node test/fournil-retours-ci.cjs (adresse et clé : FOURNIL_SUPABASE_URL / FOURNIL_SUPABASE_KEY, sinon fournil/config.js)
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
const COLLER = "colle supabase/fournil-retours.sql dans le SQL Editor de Supabase (New query → coller → Run), par-dessus le classement v6, puis relance ce test";
function bilan() {
  const b = fails ? `**${fails} échec(s)**, ${oks} ok` : `**tout est bon** (${oks} vérifications)`;
  console.log(`\n${oks} ok, ${fails} en échec`);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Le Fournil — les idées, les bugs et les votes sur Supabase, pour de vrai', '', b, '', '<details><summary>le détail</summary>', '', '```', ...lignes, '```', '</details>', ''].join('\n') + '\n'); } catch (e) { /* rien */ } }
}

(async () => {
  log(`── les idées et les votes du Fournil sur ${BASE}, ${new Date().toISOString()}`);
  const J = { id: crypto.randomUUID(), jeton: hasard(32), pseudo: 'ci-' + hasard(4) };
  const moi = { p_id: J.id, p_jeton: J.jeton };
  let inscrit = false;
  try {
    // 1. installé ?
    const v0 = await rpc('fournil_votes_ouverts', {});
    if (v0.status === 0) { check(false, `Supabase injoignable (${v0.texte}) : le projet est peut-être en pause — le réveiller depuis le tableau de bord, puis relancer`); return; }
    if (v0.status === 404 || code(v0) === 'PGRST202' || /Could not find the function/i.test(v0.texte)) { check(false, `les idées et les votes ne sont pas installés : ${COLLER}`); return; }
    if (code(v0) === '42501') { check(false, "les fonctions des retours existent mais anon n'a pas le droit de les appeler : recolle supabase/fournil-retours.sql (il remet les droits)"); return; }
    if (!check(v0.status === 200 && v0.data && v0.data.ok === true && Array.isArray(v0.data.votes) && Array.isArray(v0.data.finis), `fournil_votes_ouverts répond, sans pseudo (statut ${v0.status}, ${v0.data && v0.data.votes && v0.data.votes.length} vote(s) ouvert(s), ${v0.data && v0.data.finis && v0.data.finis.length} fini(s))`)) return;
    check([...v0.data.votes, ...v0.data.finis].every((v) => Number.isInteger(v.n) && typeof v.question === 'string' && Array.isArray(v.options) && Array.isArray(v.voix) && v.voix.length === v.options.length && Number.isInteger(v.total) && Number.isFinite(v.fin) && v.moi === null),
      'chaque vote a la forme du contrat (n, question, options, fin, voix, total ; moi null sans pseudo)');
    const FAUX = { p_id: J.id, p_jeton: 'court' };
    for (const [nom, corps] of [['fournil_retour_envoyer', { ...FAUX, p_type: 'idee', p_texte: 'x', p_image: null, p_infos: null }], ['fournil_voter', { ...FAUX, p_n: 0, p_option: 0 }],
      ['fournil_admin_moi', FAUX], ['fournil_admin_retours', { ...FAUX, p_filtre: 'nouveau', p_avant: null }], ['fournil_admin_retour_image', { ...FAUX, p_n: 0 }], ['fournil_admin_retour_etat', { ...FAUX, p_n: 0, p_etat: 'vu', p_note: null }],
      ['fournil_admin_vote_creer', { ...FAUX, p_question: 'x', p_options: ['a', 'b'], p_heures: 1 }], ['fournil_admin_vote_fermer', { ...FAUX, p_n: 0 }]]) {
      const r = await rpc(nom, corps);
      if (r.status === 404) { check(false, `${nom} manque : re${COLLER}`); return; }
      check(r.status === 200 && r.data && r.data.ok === false && r.data.erreur === 'jeton', `${nom} est installée (${r.texte.slice(0, 100)})`);
    }

    // 2. fermé ?
    for (const t of ['fournil_admins', 'fournil_retours', 'fournil_votes', 'fournil_votes_choix']) {
      const r = await appel('GET', `/rest/v1/${t}?select=*&limit=1`);
      check(r.status >= 400 || r.texte === '[]', `la table ${t} ne se lit pas directement (statut ${r.status})`);
    }
    const w = await appel('POST', '/rest/v1/fournil_admins', { joueur: J.id, pseudo: J.pseudo });
    check(w.status >= 400, `on ne se rend pas admin en écrivant dans fournil_admins (statut ${w.status})`);
    for (const nom of ['fournil_retours_qui', 'fournil_admin_qui']) {
      const r = await rpc(nom, moi);
      check(r.status >= 400, `la vérification interne est refusée (${nom} : statut ${r.status})`);
    }

    // 3. un joueur de test
    const p = await rpc('fournil_publier', { p_id: J.id, p_jeton: J.jeton, p_pseudo: J.pseudo, p_fortune: 1000 });
    inscrit = !!(p.data && p.data.ok === true);
    if (!check(inscrit, `${J.pseudo} s’inscrit au classement (${p.texte.slice(0, 100)})`)) {
      if (p.data && p.data.erreur === 'trop_vite') log("     → « trop_vite » : cette machine a déjà inscrit 10 joueurs dans l'heure (ou 60 joueurs se sont inscrits dans l'heure) ; relancer plus tard");
      return;
    }
    const v1 = await rpc('fournil_votes_ouverts', moi);
    check(v1.data && v1.data.ok === true && v1.data.votes.every((v) => v.moi === null), `il lit les votes ouverts avec son jeton (${v1.data && v1.data.votes.length} vote(s), aucun choix à lui)`);
    const envoyer = (corps) => rpc('fournil_retour_envoyer', { ...moi, p_type: 'idee', p_texte: 'x', p_image: null, p_infos: null, ...corps });
    let r = await envoyer({ p_jeton: hasard(32) });
    check(r.data && r.data.erreur === 'jeton', `un mauvais jeton : « jeton » (${r.texte})`);
    r = await envoyer({ p_texte: '   ' });
    check(r.data && r.data.erreur === 'vide', `un texte vide : « vide » (${r.texte})`);
    r = await envoyer({ p_type: 'autre' });
    check(r.data && r.data.erreur === 'type', `un type inconnu : « type » (${r.texte})`);
    r = await envoyer({ p_image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
    check(r.data && r.data.erreur === 'image', `une image SVG : « image » (${r.texte})`);
    r = await envoyer({ p_texte: 'essai automatique ' + hasard(3) + '\nsur deux lignes', p_infos: { version: 'ci', appareil: 'GitHub Actions' } });
    check(r.status === 200 && r.data && r.data.ok === true && Number.isInteger(r.data.n), `une idée envoyée : n ${r.data && r.data.n} (${r.texte})`);
    const vite = await envoyer({ p_type: 'bug', p_texte: 'encore' });
    check(vite.data && vite.data.erreur === 'trop-vite', `un deuxième aussitôt : « trop-vite » (${vite.texte})`);
    r = await rpc('fournil_voter', { ...moi, p_n: 0, p_option: 0 });
    check(r.data && r.data.ok === false && r.data.erreur === 'absent', `voter pour un vote qui n’existe pas : « absent » (${r.texte})`);
    r = await rpc('fournil_admin_moi', moi);
    check(r.data && r.data.ok === true && r.data.admin === false, `fournil_admin_moi : il n’est pas admin (${r.texte})`);
    for (const [nom, corps] of [['fournil_admin_retours', { p_filtre: 'tout', p_avant: null }], ['fournil_admin_retour_image', { p_n: 1 }], ['fournil_admin_retour_etat', { p_n: 1, p_etat: 'vu', p_note: null }],
      ['fournil_admin_vote_creer', { p_question: 'Pirate ?', p_options: ['oui', 'non'], p_heures: 1 }], ['fournil_admin_vote_fermer', { p_n: 1 }]]) {
      r = await rpc(nom, { ...moi, ...corps });
      check(r.data && r.data.ok === false && r.data.erreur === 'pas-admin' && !(r.data.retours && r.data.retours.length) && !r.data.data, `${nom} : « pas-admin » (${r.texte.slice(0, 120)})`);
    }
    const tout = JSON.stringify([v0.data, v1.data]);
    check(!tout.includes(J.id) && !tout.includes(J.jeton) && !/"(joueur|id|jeton|cree_par)"\s*:/.test(tout), 'ni identifiant ni jeton dans les votes lus');
    const ret = await rpc('fournil_retirer', moi);
    inscrit = !(ret.data && ret.data.ok === true);
    check(!inscrit, `${J.pseudo} quitte le classement : son idée part avec lui (${ret.texte.slice(0, 100)})`);
  } catch (err) {
    check(false, 'exception : ' + (err && err.message));
  } finally {
    if (inscrit) { const r = await rpc('fournil_retirer', moi); check(!!(r.data && r.data.ok), `${J.pseudo} retiré`); }
    bilan();
    process.exit(fails ? 1 : 0);
  }
})();
