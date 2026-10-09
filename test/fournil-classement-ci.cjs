#!/usr/bin/env node
// Le Fournil : le classement en ligne éprouvé POUR DE VRAI contre le projet Supabase du jeu (sur GitHub Actions :
// le conteneur de Claude ne peut pas joindre Supabase). Node 22, fetch, la clé PUBLIQUE seulement.
//  1. les fonctions du classement sont-elles installées ? (sinon : coller supabase/fournil-classement.sql dans le SQL Editor) ;
//  2. quels en-têtes marchent avec une clé sb_publishable_ : apikey seul ? avec Authorization: Bearer ? (le jeu fait pareil) ;
//  3. la table est-elle bien fermée (lecture, écriture, fonctions internes refusées) ;
//  4. un vrai scénario à deux joueurs de test (pseudos « test-ci-… » tirés au hasard) : publier, classements semaine et total,
//     mauvais jeton, pseudo pris, valeurs absurdes, trop vite, envoi suivant, fortune qui baisse puis remonte (« Cette semaine »
//     ne se gonfle pas : c'est aussi ce qui dit si la DERNIÈRE version du SQL est collée), retrait ;
//  5. la limite d'inscriptions par source (10 par heure) : quelques joueurs de test de plus, jusqu'au premier « trop_vite ».
//     S'il ne vient jamais, Supabase ne transmet pas l'en-tête cf-connecting-ip : seuls les plafonds communs protègent
//     (le test le signale sans échouer). Ce test inscrit au plus 12 joueurs par lancement depuis la même adresse ; la limite
//     est de 20 par jour : deux lancements le même jour depuis la même machine passent, un troisième peut être refusé.
// Les joueurs de test sont TOUJOURS retirés à la fin (finally, et aussi si le test est interrompu) : rien ne reste dans le classement des amis.
// Lancement : node test/fournil-classement-ci.cjs
//   (adresse et clé : FOURNIL_SUPABASE_URL / FOURNIL_SUPABASE_KEY, sinon fournil/config.js, sinon celles du projet du jeu)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// ─── la configuration : jamais de clé secrète ───
const PROJET = { url: 'https://jklbitrlkfrktmnarejc.supabase.co', key: 'sb_publishable_T4XlWAUqurOWo8T9GNkuaA_TPPf4ss3', source: 'le projet du jeu (en dur)' };
function lireConfig() {
  if (process.env.FOURNIL_SUPABASE_URL && process.env.FOURNIL_SUPABASE_KEY) return { url: process.env.FOURNIL_SUPABASE_URL, key: process.env.FOURNIL_SUPABASE_KEY, source: 'les variables FOURNIL_SUPABASE_*' };
  const f = path.join(__dirname, '..', 'fournil', 'config.js');
  try {
    const t = fs.readFileSync(f, 'utf8'), u = /supabaseUrl\s*:\s*['"]([^'"]+)['"]/.exec(t), k = /supabaseKey\s*:\s*['"]([^'"]+)['"]/.exec(t);
    if (u && k) return { url: u[1], key: k[1], bearer: !/bearer\s*:\s*false/.test(t), source: 'fournil/config.js' };
  } catch (e) { /* pas encore de fichier : la configuration du projet */ }
  return PROJET;
}
const CONFIG = lireConfig();
const URL_BASE = CONFIG.url.replace(/\/+$/, ''), CLE = CONFIG.key, BEARER = CONFIG.bearer !== false; // bearer : ce que le jeu envoie (fournil/config.js)

let fails = 0, oks = 0; const lignes = [], tableau = [];
const check = (ok, msg) => { const l = (ok ? '  ok   ' : '  FAIL ') + msg; console.log(l); lignes.push(l); if (ok) oks++; else fails++; return ok; };
const log = (msg) => { console.log(msg); lignes.push(msg); };
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const hasard = (n) => crypto.randomBytes(n).toString('hex');
const joueurTest = () => ({ id: crypto.randomUUID(), jeton: hasard(32), pseudo: 'test-ci-' + hasard(4) }); // 16 caractères au plus

// le lundi de la semaine, heure de Paris, calculé ici (Intl) pour vérifier celui du serveur
function lundiParis(ms = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const decalage = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday];
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day - decalage)).toISOString().slice(0, 10);
}

// ─── les appels ───
const ENTETES = {
  'apikey seul': { apikey: CLE },
  'apikey + Authorization': { apikey: CLE, Authorization: 'Bearer ' + CLE },
  'Authorization seul': { Authorization: 'Bearer ' + CLE },
};
const ENTETES_JEU = BEARER ? 'apikey + Authorization' : 'apikey seul'; // ce que le jeu envoie (bearer de fournil/config.js, vrai par défaut comme supabase-js)
let entetes = ENTETES[ENTETES_JEU]; // ajusté après l'essai des en-têtes
const durees = [];
let sourceConclusion = ''; // ce que la sonde dit de la limite d'inscriptions par source
async function appel(methode, chemin, corps, h = entetes) {
  const t0 = Date.now();
  try {
    const res = await fetch(URL_BASE + chemin, { method: methode, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...h }, body: corps === undefined ? undefined : JSON.stringify(corps), signal: AbortSignal.timeout(15000) });
    const texte = await res.text(); let data = null; try { data = JSON.parse(texte); } catch (e) { /* pas du JSON */ }
    const ms = Date.now() - t0; durees.push(ms);
    return { statut: res.status, data, texte: texte.slice(0, 300), ms };
  } catch (e) { return { statut: 0, data: null, texte: String(e && e.cause && e.cause.code || e && e.message || e), ms: Date.now() - t0 }; }
}
const rpc = (nom, corps, h) => appel('POST', '/rest/v1/rpc/' + nom, corps, h);
const code = (r) => (r.data && r.data.code) || '';
const resume = (r) => `${r.statut}${code(r) ? ' ' + code(r) : ''}${r.statut === 0 ? ' ' + r.texte : ''}`;

// ─── le ménage : chaque joueur de test inscrit est retiré, quoi qu'il arrive ───
const inscrits = new Map(), pseudosTest = new Set();
async function menage() {
  for (const [id, j] of inscrits) {
    let ok = false;
    for (let essai = 0; essai < 3 && !ok; essai++) {
      const r = await rpc('fournil_retirer', { p_id: j.id, p_jeton: j.jeton });
      ok = r.statut === 200 && r.data && r.data.ok === true;
      if (!ok) await attendre(1000);
    }
    check(ok, `ménage : ${j.pseudo} retiré du classement`);
    if (ok) inscrits.delete(id);
  }
}
for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { log(`\ninterrompu (${sig}) : ménage avant de partir`); menage().finally(() => process.exit(1)); });

async function publier(j, fortune, pseudo = j.pseudo, autreJeton) {
  const r = await rpc('fournil_publier', { p_id: j.id, p_jeton: autreJeton || j.jeton, p_pseudo: pseudo, p_fortune: fortune });
  if (r.statut === 200 && r.data && r.data.ok === true && !autreJeton) { inscrits.set(j.id, j); pseudosTest.add(j.pseudo.toLowerCase()); }
  return r;
}

function ecrireResume(conclusion) {
  const bilan = fails ? `**${fails} échec(s)**, ${oks} ok` : `**tout est bon** (${oks} vérifications)`;
  const md = [`## Le Fournil — le classement sur Supabase, pour de vrai`, '', `Projet : \`${URL_BASE}\` (configuration : ${CONFIG.source})`, '', bilan, ''];
  if (tableau.length) md.push('| en-têtes | réponse |', '|---|---|', ...tableau.map(([a, b]) => `| ${a} | ${b} |`), '');
  if (conclusion) md.push(conclusion, '');
  if (durees.length) { const d = durees.slice().sort((a, b) => a - b); md.push(`Temps de réponse : médiane ${d[Math.floor(d.length / 2)]} ms, max ${d[d.length - 1]} ms (${d.length} appels)`, ''); }
  md.push('<details><summary>le détail</summary>', '', '```', ...lignes, '```', '</details>', '');
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n'); } catch (e) { /* rien */ } }
}
function arreter(message, conclusion) {
  check(false, message);
  log(`\n${message}`);
  ecrireResume(conclusion || `> ${message}`);
  process.exit(1);
}

(async () => {
  log(`Le Fournil — test réel du classement sur ${URL_BASE} (${CONFIG.source}), ${new Date().toISOString()}`);
  // garde-fou : jamais de clé secrète (elle donnerait tous les droits ; elle n'a rien à faire ici)
  if (!/^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL_BASE + '/')) arreter(`adresse Supabase invalide : ${URL_BASE}`);
  if (/^sb_secret_/.test(CLE) || /service_role/.test(Buffer.from((CLE.split('.')[1] || ''), 'base64').toString('utf8'))) arreter('la clé fournie est une clé SECRÈTE : seule la clé publique (sb_publishable_… ou anon) a sa place ici');

  // ─── 1. les en-têtes, et les fonctions installées ? ───
  log('\n── les en-têtes avec une clé ' + (CLE.startsWith('sb_publishable_') ? 'sb_publishable_' : 'publique') + ' ──');
  const essais = {};
  for (const [nom, h] of Object.entries(ENTETES)) {
    const r = await rpc('fournil_classement', { p_periode: 'total', p_limite: 1 }, h);
    essais[nom] = r;
    log(`  ${nom.padEnd(24)} → ${resume(r)}`);
    tableau.push([nom, resume(r) + (r.statut === 200 ? ' ✔' : '')]);
  }
  const tous = Object.values(essais);
  if (tous.every((r) => r.statut === 0)) arreter(`Supabase injoignable (${essais['apikey seul'].texte}) : le projet est peut-être en pause (7 jours sans activité) — le réveiller depuis le tableau de bord Supabase, puis relancer`);
  if (tous.some((r) => r.statut === 404 && code(r) === 'PGRST202') || tous.some((r) => /Could not find the function/i.test(r.texte))) {
    arreter("le SQL du classement n'est pas encore installé : colle supabase/fournil-classement.sql dans le SQL Editor de Supabase (New query → coller → Run), puis relance ce test");
  }
  if (tous.some((r) => r.statut === 540 || r.statut === 503)) arreter(`le projet Supabase semble en pause (${tous.map(resume).join(' / ')}) : le réveiller depuis le tableau de bord, puis relancer`);
  const okSeul = essais['apikey seul'].statut === 200, okDeux = essais['apikey + Authorization'].statut === 200, okBearer = essais['Authorization seul'].statut === 200;
  if (!okSeul && !okDeux && tous.some((r) => code(r) === '42501')) arreter("les fonctions du classement existent mais anon n'a pas le droit de les appeler : recolle supabase/fournil-classement.sql dans le SQL Editor (il remet les droits), puis relance ce test");
  if (!okSeul && !okDeux) arreter(`la clé publique est refusée (${tous.map(resume).join(' / ')}) : vérifier l'adresse et la clé dans fournil/config.js`);
  check(essais[ENTETES_JEU].statut === 200, `${ENTETES_JEU} (ce que le jeu envoie, d'après fournil/config.js) : ${resume(essais[ENTETES_JEU])}`);
  log(`  apikey seul : ${okSeul ? 'marche aussi' : 'ne marche pas'} ; Authorization seul : ${okBearer ? 'marche' : 'refusé'} (attendu : refusé, la passerelle demande l'en-tête apikey)`);
  entetes = okDeux ? ENTETES['apikey + Authorization'] : ENTETES['apikey seul'];
  const conclusion = okDeux && okSeul ? '**En-têtes** : `apikey` suffit ; `apikey` + `Authorization: Bearer <clé publique>` marche aussi (comme supabase-js) : `bearer` vrai ou faux dans fournil/config.js, les deux marchent.'
    : okDeux ? '**En-têtes** : il faut `apikey` **et** `Authorization: Bearer <clé publique>` : `bearer: true` dans fournil/config.js.'
      : '**En-têtes** : `apikey` SEUL — `Authorization: Bearer <clé publique>` est refusé : `bearer: false` dans fournil/config.js.';
  log('  → ' + conclusion.replace(/\*\*|`/g, ''));

  const c0 = essais[okDeux ? 'apikey + Authorization' : 'apikey seul'].data || {};
  check(typeof c0.semaine === 'string' && Number.isInteger(c0.joueurs) && Array.isArray(c0.lignes) && 'moi' in c0, `fournil_classement répond au contrat (semaine ${c0.semaine}, ${c0.joueurs} joueur(s))`);
  const lundi = lundiParis();
  check(c0.semaine === lundi || c0.semaine === lundiParis(Date.now() - 60e3), `la semaine du serveur est celle de Paris : lundi ${c0.semaine} (calculé ici : ${lundi})`);
  let r = await rpc('fournil_retirer', { p_id: crypto.randomUUID(), p_jeton: hasard(32) });
  check(r.statut === 200 && r.data && r.data.ok === true, `fournil_retirer est installée (un inconnu : ${resume(r)} ${r.texte})`);
  r = await rpc('fournil_publier', { p_id: crypto.randomUUID(), p_jeton: hasard(32), p_pseudo: '!', p_fortune: 1 });
  if (r.statut === 404) arreter("fournil_publier manque : recolle supabase/fournil-classement.sql dans le SQL Editor de Supabase, puis relance ce test");
  check(r.statut === 200 && r.data && r.data.ok === false && r.data.erreur === 'pseudo_invalide', `fournil_publier est installée (pseudo « ! » : ${r.texte})`);

  // ─── 2. la table est fermée ───
  log('\n── accès direct refusé ──');
  for (const [quoi, m, chemin, corps] of [
    ['lire la table', 'GET', '/rest/v1/fournil_joueurs?select=*&limit=1'],
    ['lire les empreintes des jetons', 'GET', '/rest/v1/fournil_joueurs?select=jeton&limit=1'],
    ['écrire dans la table', 'POST', '/rest/v1/fournil_joueurs', { id: crypto.randomUUID(), jeton: 'x', pseudo: 'Intrus', semaine: lundi }],
    ['modifier la table', 'PATCH', '/rest/v1/fournil_joueurs?pseudo=eq.personne', { fortune: 1e20 }],
    ['effacer dans la table', 'DELETE', '/rest/v1/fournil_joueurs?pseudo=eq.personne'],
  ]) {
    const x = await appel(m, chemin, corps);
    check(x.statut >= 400 && !(Array.isArray(x.data) && x.data.length), `${quoi} : refusé (${resume(x)})`);
  }
  for (const [nom, corps] of [['fournil_empreinte', { p_jeton: 'x' }], ['fournil_maintenant', {}], ['fournil_reponse', { p_erreur: null, p_id: null, p_lundi: lundi }]]) {
    const x = await rpc(nom, corps);
    check(x.statut >= 400, `la fonction interne ${nom} : refusée (${resume(x)})`);
  }

  // ─── 3. le scénario, avec deux joueurs de test ───
  log('\n── deux joueurs de test ──');
  const A = joueurTest(), B = joueurTest();
  log(`  ${A.pseudo} et ${B.pseudo}`);
  try {
    r = await publier(A, 1);
    const a1 = r.data || {};
    check(r.statut === 200 && a1.ok === true && a1.erreur === null && Number.isInteger(a1.rang_total) && Number.isInteger(a1.rang_semaine) && Number.isInteger(a1.joueurs) && a1.joueurs >= 1, `A s'inscrit avec 1 € : ${r.texte}`);
    if (a1.erreur === 'trop_vite') throw new Error("inscription de A refusée (« trop_vite ») : cette machine a déjà inscrit 10 joueurs dans l'heure ou 20 dans la journée (d'autres lancements du test ?), ou 60 joueurs se sont inscrits dans l'heure ; relancer plus tard");
    if (!a1.ok) throw new Error('inscription de A refusée : ' + r.texte);
    r = await publier(B, 2);
    const b1 = r.data || {};
    check(r.statut === 200 && b1.ok === true && b1.joueurs === a1.joueurs + 1, `B s'inscrit avec 2 € : ${r.texte}`);
    check(b1.semaine === lundi, `la semaine rendue est celle de Paris (${b1.semaine})`);
    r = await publier(A, 3);
    check(r.data && r.data.ok === false && r.data.erreur === 'trop_vite' && Number.isInteger(r.data.rang_total), `A renvoie aussitôt : trop_vite (${r.texte})`);
    r = await publier(A, 1e20, 'Pirate', B.jeton);
    check(r.data && r.data.ok === false && r.data.erreur === 'jeton', `l'identifiant de A avec le jeton de B : refusé (${r.texte})`);
    r = await rpc('fournil_publier', { p_id: crypto.randomUUID(), p_jeton: hasard(32), p_pseudo: A.pseudo.toUpperCase(), p_fortune: 1 });
    check(r.data && r.data.erreur === 'pseudo_pris', `le pseudo de A en majuscules, pour un nouveau : pseudo_pris (${r.texte})`);
    for (const [v, quoi] of [[-1, 'négative'], ['NaN', '« NaN »'], ['Infinity', '« Infinity »'], [1e30, '1e30'], [null, 'absente']]) {
      r = await rpc('fournil_publier', { p_id: crypto.randomUUID(), p_jeton: hasard(32), p_pseudo: 'test-ci-' + hasard(4), p_fortune: v });
      check(r.statut === 200 && r.data && r.data.erreur === 'valeur', `fortune ${quoi} : valeur (${resume(r)})`);
    }
    r = await rpc('fournil_classement', { p_periode: 'total', p_id: A.id, p_limite: 100 });
    const t = r.data || {}, tl = t.lignes || [];
    check(r.statut === 200 && t.moi && t.moi.valeur === 1 && t.joueurs >= 2 && tl.length <= 100, `tous les temps : A s'y retrouve (« moi » = ${JSON.stringify(t.moi)}, ${t.joueurs} joueurs)`);
    const rangB = (tl.find((x) => x.pseudo === B.pseudo) || {}).rang;
    check(!rangB || rangB < t.moi.rang, `B (2 €) est devant A (1 €)${rangB ? ` : ${rangB}e contre ${t.moi.rang}e` : ' (hors des 100 premières lignes)'}`);
    check(tl.every((x) => Object.keys(x).sort().join() === 'moi,pseudo,rang,valeur') && !/"jeton"|"id"/.test(r.texte) && !r.texte.includes(A.id) && !r.texte.includes(A.jeton), 'les lignes : rang, pseudo, valeur, moi — ni identifiant ni jeton');
    check(tl.filter((x) => x.moi).length <= 1 && (tl.find((x) => x.moi) || { pseudo: A.pseudo }).pseudo === A.pseudo, 'une seule ligne marquée « moi », celle de A');
    r = await rpc('fournil_classement', { p_periode: 'semaine', p_id: B.id });
    const s = r.data || {};
    check(r.statut === 200 && s.semaine === lundi && s.moi && s.moi.valeur === 0 && (s.lignes || []).length <= 50, `cette semaine : B y est avec 0 € (il vient de s'inscrire) (« moi » = ${JSON.stringify(s.moi)}, ${s.joueurs} joueurs)`);
    r = await rpc('fournil_classement', { p_periode: 'mois' });
    check(r.statut >= 400, `période inconnue : refusée (${resume(r)})`);

    log('  (10,5 s : le serveur ne prend qu’un envoi toutes les 10 s par joueur)');
    await attendre(10500);
    r = await publier(A, 5);
    check(r.data && r.data.ok === true && Number.isInteger(r.data.rang_semaine), `A envoie 5 € : ok (${r.texte})`);
    r = await rpc('fournil_classement', { p_periode: 'semaine', p_id: A.id, p_limite: 100 });
    check(r.data && r.data.moi && r.data.moi.valeur === 4, `cette semaine, A a gagné 4 € (« moi » = ${JSON.stringify(r.data && r.data.moi)})`);
    // une partie effacée (0) puis le code rechargé (5) : la semaine ne doit pas compter ces 5 € une deuxième fois
    log('  (2 × 10,5 s : A efface sa partie, puis recharge son code)');
    await attendre(10500);
    r = await publier(A, 0);
    const s0 = (await rpc('fournil_classement', { p_periode: 'semaine', p_id: A.id, p_limite: 100 })).data || {};
    check(r.data && r.data.ok === true && s0.moi && s0.moi.valeur === 0, `A envoie 0 (partie effacée) : 0 € cette semaine, jamais en négatif (« moi » = ${JSON.stringify(s0.moi)})`);
    await attendre(10500);
    r = await publier(A, 5);
    const s5 = (await rpc('fournil_classement', { p_periode: 'semaine', p_id: A.id, p_limite: 100 })).data || {};
    const semaineOk = !!(s5.moi && s5.moi.valeur === 4);
    check(r.data && r.data.ok === true && semaineOk, `puis 5 € (code rechargé) : toujours 4 € cette semaine, pas 5 (« moi » = ${JSON.stringify(s5.moi)})`);
    if (s5.moi && s5.moi.valeur === 5) log("  → l'ANCIENNE version du SQL est installée : recolle supabase/fournil-classement.sql dans le SQL Editor de Supabase, puis relance ce test");
    r = await rpc('fournil_retirer', { p_id: A.id, p_jeton: B.jeton });
    check(r.data && r.data.ok === false, `retirer A avec le jeton de B : refusé (${r.texte})`);
    r = await rpc('fournil_retirer', { p_id: A.id, p_jeton: A.jeton });
    check(r.data && r.data.ok === true, `A quitte le classement (${r.texte})`);
    if (r.data && r.data.ok === true) inscrits.delete(A.id);
    r = await rpc('fournil_classement', { p_periode: 'total', p_id: A.id, p_limite: 100 });
    check(r.data && r.data.moi === null && !(r.data.lignes || []).some((x) => x.pseudo === A.pseudo), 'A n’apparaît plus');

    // ─── 4. la limite d'inscriptions par source ───
    log('\n── inscriptions par source (10 par heure) ──');
    let acceptes = 2, refus = null; // A et B comptent déjà (A a quitté le classement, sa place dans le compte reste)
    for (let k = 0; k < 10 && !refus; k++) {
      const P = joueurTest();
      r = await publier(P, 1);
      if (r.data && r.data.ok === true) acceptes++;
      else refus = r.data ? r.data.erreur : resume(r);
    }
    if (refus === 'trop_vite') {
      sourceConclusion = `**Limite par source** : active (« trop_vite » après ${acceptes} inscriptions depuis cette machine ; 10 par heure attendues, moins si un autre lancement l'a précédé).`;
      check(acceptes <= 10, `la limite par source marche : « trop_vite » après ${acceptes} inscriptions depuis cette machine`);
    } else if (refus) {
      check(false, `une inscription de sonde refusée autrement qu’avec « trop_vite » : ${refus}`);
    } else if (!semaineOk) {
      sourceConclusion = `**Limite par source** : absente de la version du SQL installée (${acceptes} inscriptions de suite acceptées) : recolle supabase/fournil-classement.sql.`;
      log('  ' + sourceConclusion.replace(/\*\*|`/g, ''));
    } else {
      sourceConclusion = `**Limite par source** : ATTENTION, ${acceptes} inscriptions de suite depuis cette machine ont toutes passé : Supabase ne transmet pas l'en-tête \`cf-connecting-ip\` à Postgres, seuls les plafonds communs (60 par heure, 2 000 en tout) protègent les inscriptions.`;
      log('  ATTENTION ' + sourceConclusion.replace(/\*\*|`/g, ''));
    }
  } catch (e) {
    check(false, 'le scénario plante : ' + (e && e.message || e));
  } finally {
    log('\n── ménage ──');
    await menage();
    const fin = await rpc('fournil_classement', { p_periode: 'total', p_limite: 100 });
    check(fin.statut === 200 && inscrits.size === 0 && !(fin.data && fin.data.lignes || []).some((x) => pseudosTest.has(String(x.pseudo).toLowerCase())), `aucun joueur de test ne reste dans le classement (${pseudosTest.size} inscrits pendant le test, tous retirés)`);
  }

  log(fails ? `\n${fails} échec(s), ${oks} ok` : `\ntout est bon (${oks} vérifications)`);
  ecrireResume(conclusion + (sourceConclusion ? '\n\n' + sourceConclusion : ''));
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error('  FAIL le test plante :', e && e.stack || e); try { await menage(); } catch (x) { /* rien */ } process.exit(1); });
