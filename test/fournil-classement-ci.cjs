#!/usr/bin/env node
// Le Fournil : le classement en ligne éprouvé POUR DE VRAI contre le projet Supabase du jeu (sur GitHub Actions :
// le conteneur de Claude ne peut pas joindre Supabase). Node 22, fetch, la clé PUBLIQUE seulement.
//  0. version 6 (les copains et les notifications) : si elle est installée, un scénario de plus (photo et boutique, pourboire, objectif
//     commun, abonnement d'un faux appareil, planifier, essai, désabonnement ; les fonctions de la fonction d'envoi refusées à la clé
//     publique) ; si c'est encore la version 5, le test le signale (« colle la v6 ») et joue le reste SANS échouer ;
//  1. les fonctions du classement sont-elles installées, et dans leur DERNIÈRE version (la version 5 ou 6 : les points de boulanger,
//     l'événement « Le Quartier », les événements génériques (« La Maison hantée ») et « en ligne » (fournil_vu) ; une version 2, 3 ou 4
//     encore installée est détectée) ? Sinon : coller supabase/fournil-classement.sql dans le SQL Editor ;
//  2. quels en-têtes marchent avec une clé sb_publishable_ : apikey seul ? avec Authorization: Bearer ? (le jeu fait pareil) ;
//  3. l'heure du serveur (fournil_heure) : proche de la vraie (l'horloge de GitHub Actions est à l'heure) ;
//  4. les tables sont-elles bien fermées (lecture, écriture, fonctions internes refusées) ;
//  5. un vrai scénario à trois joueurs de test (pseudos « test-ci-… » tirés au hasard) : publier avec des points (ceux de la
//     semaine comptent dès l'arrivée, l'argent part de zéro), classements semaine et total (rangés aux points), mauvais jeton,
//     pseudo pris, valeurs absurdes, trop vite, envoi suivant (compté), points d'une autre semaine ignorés, points énormes
//     plafonnés par le barème, un ancien téléphone sans points encore accepté,
//     fortune qui baisse puis remonte (« Cette semaine » ne se gonfle pas), récompenses (les siennes, celles d'un
//     inconnu, le jeton d'un autre), un saut de fortune absurde accepté mais PLAFONNÉ, une arrivée bricolée à 7e23 € (échelle plafonnée à 1e20 €), retrait ;
//     la LIMITE DES ÉVÉNEMENTS (version 6.3) : aucune fonction publique ne la rend, on la lit dans le plafond de 1e24 billets (et
//     1e24 bonbons pendant la Maison hantée), à l'heure du serveur (fournil_heure juste avant et juste après) : elle doit être celle
//     de supabase/fournil-classement-v63.sql ; encore celle de la v6.2 (ou de la v6), le test le dit (« v6.3 pas encore collée »)
//     et échoue ;
//  6. la limite d'inscriptions par source (10 par heure) : quelques joueurs de test de plus, jusqu'au premier « trop_vite ».
//     S'il ne vient jamais, Supabase ne transmet pas l'en-tête cf-connecting-ip : seuls les plafonds communs protègent
//     (le test le signale sans échouer). Ce test inscrit au plus 13 joueurs par lancement depuis la même adresse ; la limite
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

// ─── la limite des événements : celle de la version 6.3 (lue dans supabase/fournil-classement-v63.sql), et celles d'avant
// (la 6.2, lue dans supabase/fournil-classement-v62.sql ; la 6) ───
// une table de log10 à pas fixe depuis l'ouverture, interpolée (le miroir de fournil_quartier_borne et de fournil_evt_borne)
const LIMITES = (() => {
  const texte = (f) => { try { return fs.readFileSync(path.join(__dirname, '..', 'supabase', f), 'utf8'); } catch (e) { return ''; /* rien : vérifié plus bas */ } };
  const t63 = texte('fournil-classement-v63.sql'), t62 = texte('fournil-classement-v62.sql');
  const lire = (t, re) => { const m = re.exec(t); return m ? m[1].slice(1, -1).split(',').map(Number) : null; };
  const RQ = /function public\.fournil_quartier_table\(\)[^;]*?'(\{[-\d.,]+\})'::double precision\[\]/, RH = /function public\.fournil_evts\(\)[\s\S]*?'hantee'::text[^;]*?'(\{[-\d.,]+\})'::double precision\[\]/;
  return {
    quartier: { debut: Date.parse('2026-10-13T12:00:00+02:00'), fin: Date.parse('2026-10-27T12:00:00+01:00'), pas: 86400e3,
      v63: lire(t63, RQ), v62: lire(t62, RQ),
      v6: [12.5, 14.4, 16.1, 16.5, 16.7, 16.85, 16.95, 17.05, 17.15, 17.2, 17.3, 17.35, 17.4, 17.45, 17.5] },
    hantee: { debut: Date.parse('2026-10-27T12:00:00+01:00'), fin: Date.parse('2026-11-02T20:00:00+01:00'), pas: 6 * 3600e3,
      v63: lire(t63, RH), v62: lire(t62, RH),
      v6: [11.65, 13.8, 15.25, 15.8, 16.05, 16.2, 16.35, 16.45, 16.55, 16.65, 16.75, 16.8, 16.9, 16.95, 17, 17, 17.05, 17.1, 17.15, 17.15, 17.2, 17.2, 17.25, 17.25, 17.3, 17.3, 17.3] },
  };
})();
function limite(ev, tab, ms) {
  if (!tab || ms < ev.debut) return 0;
  const j = Math.min((Math.min(ms, ev.fin) - ev.debut) / ev.pas, tab.length - 1), k = Math.floor(j);
  return k >= tab.length - 1 ? Math.pow(10, tab[tab.length - 1]) : Math.pow(10, tab[k] + (tab[k + 1] - tab[k]) * (j - k));
}
// le score plafonné rendu par fournil_publier (1e24 envoyé) est-il la limite de la v6.3, entre deux heures du serveur (ms) ?
// Sinon, celle d'une version d'avant (6.2 ou 6) : le test le dit (« v6.3 pas encore collée ») et échoue.
let limiteConclusion = '';
function verifierLimite(nom, titre, valeur, msAvant, msApres) {
  const ev = LIMITES[nom], dans = (x, p) => x >= p[0] * (1 - 1e-9) && x <= p[1] * (1 + 1e-9);
  const e2 = (x) => Number(x).toExponential(3), plage = (p) => (p[0] === p[1] ? e2(p[0]) : `${e2(p[0])} à ${e2(p[1])}`);
  const taille = nom === 'quartier' ? 15 : 27;
  if (!ev.v63 || ev.v63.length !== taille) return check(false, `${titre} : le tableau de la v6.3 est illisible dans supabase/fournil-classement-v63.sql`);
  if (!ev.v62 || ev.v62.length !== taille) return check(false, `${titre} : le tableau de la v6.2 est illisible dans supabase/fournil-classement-v62.sql`);
  const P = {}; for (const v of ['v63', 'v62', 'v6']) P[v] = [limite(ev, ev[v], msAvant), limite(ev, ev[v], msApres)];
  const est = (v) => dans(valeur, P[v]);
  if (est('v63')) {
    const aussi = ['v62', 'v6'].filter(est).map((v) => (v === 'v62' ? 'la v6.2' : 'la v6'));
    if (aussi.length) {
      if (!limiteConclusion) limiteConclusion = `**Limite des événements** : à cette heure, la v6.3 et ${aussi.join(' et ')} donnent la même limite : ce test ne peut pas dire si \`supabase/fournil-classement-v63.sql\` est collée (sa requête de contrôle, en bas du SQL Editor, le dit).`;
      log(`  ${titre} : la v6.3 et ${aussi.join(' et ')} donnent ici la même limite (${e2(valeur)}) : rien à distinguer à cette heure-ci`); return true;
    }
    return check(true, `${titre} : la limite du moment est celle de la v6.3 (${e2(valeur)}, attendu ${plage(P.v63)} ; la v6.2 aurait dit ${plage(P.v62)})`);
  }
  const ancienne = est('v62') ? 'v6.2' : est('v6') ? 'v6' : '';
  if (ancienne) {
    limiteConclusion = `**Limite des événements** : v6.3 pas encore collée (c’est encore celle de la ${ancienne}) : colle \`supabase/fournil-classement-v63.sql\` dans le SQL Editor (il ne touche à aucune donnée).`;
    return check(false, `${titre} : v6.3 pas encore collée, c'est encore la limite de la ${ancienne} (${e2(valeur)}, la v6.3 dirait ${plage(P.v63)}) : colle supabase/fournil-classement-v63.sql dans le SQL Editor de Supabase, puis relance ce test`);
  }
  return check(false, `${titre} : une limite inattendue, ${e2(valeur)} (v6.3 : ${plage(P.v63)} ; v6.2 : ${plage(P.v62)} ; v6 : ${plage(P.v6)})`);
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
let VERSION = 0, V6 = false, versionConclusion = ''; // la version du SQL installée (5 ou 6) ; V6 : les copains et les notifications
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

// pts : { points, lundi } (un téléphone de la version 3) ; sans : un téléphone de la version 2 (sa fortune seule)
async function publier(j, fortune, pseudo = j.pseudo, autreJeton, pts) {
  const r = await rpc('fournil_publier', pts ? { p_id: j.id, p_jeton: autreJeton || j.jeton, p_pseudo: pseudo, p_fortune: fortune, p_points: pts.points, p_lundi: pts.lundi } : { p_id: j.id, p_jeton: autreJeton || j.jeton, p_pseudo: pseudo, p_fortune: fortune });
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

  // ─── 1 et 2. les en-têtes, et les fonctions installées (dans leur dernière version) ? ───
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
  // la version 3 (les points de boulanger) : une version 2 encore installée répond sans « version » et refuse les points
  const RECOLLER = "c'est une ANCIENNE VERSION du SQL qui est encore installée (version 2 : classement à l'argent ; version 3 : sans l'événement du quartier ; version 4 : sans la Maison hantée ni « en ligne ») : recolle supabase/fournil-classement.sql (version 6) dans le SQL Editor de Supabase — les joueurs inscrits, leurs points, leurs billets et leur palmarès restent —, puis relance ce test";
  if (c0.version !== 5 && c0.version !== 6) arreter(`fournil_classement répond sans « version : 5 » ni 6 (${JSON.stringify(c0).slice(0, 120)}) : ${RECOLLER}`);
  VERSION = c0.version;
  { const o = await rpc('fournil_objectif', {});
    V6 = VERSION === 6 && o.statut === 200 && !!o.data && Number.isInteger(o.data.but);
    if (VERSION === 6 && !V6) arreter(`fournil_classement dit « version 6 » mais fournil_objectif ne répond pas (${resume(o)}) : recolle supabase/fournil-classement.sql (version 6)`);
    if (!V6) { versionConclusion = '**Version 5 installée** : colle la v6 (supabase/fournil-classement.sql) pour les copains et les notifications. Le reste est vérifié, le test ne la réclame pas pour passer.'; log('  ATTENTION version 5 installée : colle la v6 (les copains et les notifications) ; le reste est vérifié sans elle'); }
    else check(o.data.but >= 300 && o.data.but <= 6000 && Number.isInteger(o.data.total) && o.data.pourcent >= 0 && o.data.pourcent <= 100 && typeof o.data.reussi === 'boolean', `la version 6 est installée : l'objectif commun répond (${o.texte.slice(0, 140)})`); }
  { const v = await rpc('fournil_publier', { p_id: crypto.randomUUID(), p_jeton: hasard(32), p_pseudo: '!', p_fortune: 1, p_points: 0, p_lundi: lundiParis(), p_quartier: 0, p_evt: 'hantee', p_score: 0 });
    if (v.statut === 404 || code(v) === 'PGRST202' || code(v) === '42883') arreter(`fournil_publier ne connaît pas p_points / p_lundi / p_quartier / p_evt / p_score (${resume(v)}) : ${RECOLLER}`);
    check(v.statut === 200 && v.data && v.data.version === VERSION && v.data.erreur === 'pseudo_invalide', `la version ${VERSION} est installée : fournil_publier prend les points de la semaine, les billets du quartier et les bonbons d'Halloween (${v.texte.slice(0, 120)})`); }
  { const q = await rpc('fournil_classement', { p_periode: 'quartier', p_limite: 1 }), d = q.data || {};
    check(q.statut === 200 && d.version === VERSION && d.periode === 'quartier' && Array.isArray(d.lignes) && 'moi' in d, `le classement de l'événement « Le Quartier » (p_periode = 'quartier') répond : ${d.joueurs} joueur(s) avec des billets`); }
  { const q = await rpc('fournil_classement', { p_periode: 'hantee', p_limite: 1 }), d = q.data || {};
    check(q.statut === 200 && d.version === VERSION && d.periode === 'hantee' && Array.isArray(d.lignes) && Number.isInteger(d.en_ligne_n), `le classement de « La Maison hantée » (p_periode = 'hantee') répond : ${d.joueurs} joueur(s) avec des bonbons, ${d.en_ligne_n} en ligne`); }
  { const v = await rpc('fournil_vu', { p_id: crypto.randomUUID(), p_jeton: hasard(32) });
    if (v.statut === 404) arreter(`fournil_vu manque : ${RECOLLER}`);
    check(v.statut === 200 && v.data && v.data.ok === false && v.data.erreur === 'inconnu', `fournil_vu (« en ligne ») est installée : un inconnu → ${v.texte}`); }
  check(typeof c0.semaine === 'string' && Number.isInteger(c0.joueurs) && Array.isArray(c0.lignes) && 'moi' in c0, `fournil_classement répond au contrat (semaine ${c0.semaine}, ${c0.joueurs} joueur(s))`);
  const lundi = lundiParis();
  check(c0.semaine === lundi || c0.semaine === lundiParis(Date.now() - 60e3), `la semaine du serveur est celle de Paris : lundi ${c0.semaine} (calculé ici : ${lundi})`);
  let r = await rpc('fournil_retirer', { p_id: crypto.randomUUID(), p_jeton: hasard(32) });
  check(r.statut === 200 && r.data && r.data.ok === true, `fournil_retirer est installée (un inconnu : ${resume(r)} ${r.texte})`);
  r = await rpc('fournil_publier', { p_id: crypto.randomUUID(), p_jeton: hasard(32), p_pseudo: '!', p_fortune: 1 });
  if (r.statut === 404) arreter("fournil_publier manque : recolle supabase/fournil-classement.sql dans le SQL Editor de Supabase, puis relance ce test");
  check(r.statut === 200 && r.data && r.data.ok === false && r.data.erreur === 'pseudo_invalide', `fournil_publier est installée (pseudo « ! » : ${r.texte})`);
  // la dernière version : l'heure du serveur et les récompenses (une version plus ancienne ne les a pas)
  const ANCIENNE = "c'est une ANCIENNE version du SQL qui est installée : recolle supabase/fournil-classement.sql dans le SQL Editor de Supabase (les joueurs restent), puis relance ce test";
  const tHeure = Date.now(), h = await rpc('fournil_heure', {}), tRetour = Date.now();
  if (h.statut === 404) arreter(`fournil_heure manque : ${ANCIENNE}`);
  r = await rpc('fournil_recompenses', { p_id: crypto.randomUUID(), p_jeton: hasard(32) });
  if (r.statut === 404) arreter(`fournil_recompenses manque : ${ANCIENNE}`);
  if (c0.lignes && c0.lignes.length && !('podium' in c0.lignes[0])) arreter(`les lignes du classement n'ont pas de « podium » : ${ANCIENNE}`);
  check(r.statut === 200 && r.data && r.data.ok === true && Array.isArray(r.data.podiums) && r.data.podiums.length === 0 && 'derniere' in r.data && 'quartier' in r.data && 'quartier_podium' in r.data && r.data.evenements && typeof r.data.evenements === 'object',
    `fournil_recompenses est installée, avec le podium final du quartier et ceux des événements (un inconnu : aucun podium ; ${r.texte})`);

  // ─── 3. l'heure du serveur ───
  log('\n── l’heure du serveur ──');
  const ms = h.data && h.data.ms, milieu = (tHeure + tRetour) / 2, ecart = Number.isFinite(ms) ? ms - milieu : NaN;
  check(h.statut === 200 && Number.isInteger(ms) && Object.keys(h.data).join() === 'ms', `fournil_heure répond { ms } : ${h.texte}`);
  check(Math.abs(ecart) <= 60000 + (tRetour - tHeure), `l'heure du serveur est la vraie (${Number.isFinite(ms) ? new Date(ms).toISOString() : '?'}, écart ${Math.round(ecart)} ms avec la machine du test, aller-retour ${tRetour - tHeure} ms)`);
  const h2 = await rpc('fournil_heure', {});
  check(h2.statut === 200 && h2.data && h2.data.ms >= ms, `elle ne recule pas d'un appel à l'autre (${h2.data && h2.data.ms - ms} ms plus tard)`);

  // ─── 4. les tables sont fermées ───
  log('\n── accès direct refusé ──');
  for (const [quoi, m, chemin, corps] of [
    ['lire la table', 'GET', '/rest/v1/fournil_joueurs?select=*&limit=1'],
    ['lire les empreintes des jetons', 'GET', '/rest/v1/fournil_joueurs?select=jeton&limit=1'],
    ['écrire dans la table', 'POST', '/rest/v1/fournil_joueurs', { id: crypto.randomUUID(), jeton: 'x', pseudo: 'Intrus', semaine: lundi }],
    ['modifier la table', 'PATCH', '/rest/v1/fournil_joueurs?pseudo=eq.personne', { fortune: 1e20 }],
    ['effacer dans la table', 'DELETE', '/rest/v1/fournil_joueurs?pseudo=eq.personne'],
    ['lire le palmarès', 'GET', '/rest/v1/fournil_palmares?select=*&limit=1'],
    ['écrire dans le palmarès', 'POST', '/rest/v1/fournil_palmares', { semaine: lundi, rang: 1, id: crypto.randomUUID(), pseudo: 'Intrus', valeur: 1 }],
    ['lire les semaines figées', 'GET', '/rest/v1/fournil_semaines?select=*&limit=1'],
    ['lire les portes', 'GET', '/rest/v1/fournil_portes?select=*&limit=1'],
  ]) {
    const x = await appel(m, chemin, corps);
    check(x.statut >= 400 && !(Array.isArray(x.data) && x.data.length), `${quoi} : refusé (${resume(x)})`);
  }
  for (const [nom, corps] of [['fournil_empreinte', { p_jeton: 'x' }], ['fournil_maintenant', {}],
    ['fournil_reponse', { p_erreur: null, p_id: null, p_lundi: lundi, p_compte: null, p_plafonne: null, p_points_comptes: null, p_points_plafonnes: null }],
    ['fournil_jour', { p_quand: new Date().toISOString() }], ['fournil_points_plafond', { p_jours: 1 }],
    ['fournil_figer', { p_lundi: lundi }], ['fournil_borne', { p_de: 0, p_secondes: 1 }], ['fournil_duree', { p_de: 0, p_a: 1 }],
    ['fournil_paliers', {}]]) {
    const x = await rpc(nom, corps);
    check(x.statut >= 400, `la fonction interne ${nom} : refusée (${resume(x)})`);
  }

  // ─── 5. le scénario, avec deux joueurs de test ───
  log('\n── deux joueurs de test ──');
  const A = joueurTest(), B = joueurTest();
  log(`  ${A.pseudo} et ${B.pseudo}`);
  const lundiPasse = new Date(Date.parse(lundi + 'T12:00:00Z') - 7 * 86400e3).toISOString().slice(0, 10);
  // jamais à cheval sur minuit le lundi (heure de Paris) : le palmarès de la semaine se fige à la première requête de la suivante,
  // il ne doit pas compter les joueurs de test
  if (lundiParis(Date.now() + 10 * 60e3) !== lundi || lundiParis(Date.now() - 10 * 60e3) !== lundi) arreter('trop près de minuit le lundi (heure de Paris) : le palmarès de la semaine va se figer, relance ce test dans un quart d’heure');
  const pts = (points, l = lundi) => ({ points, lundi: l });
  const jourSemaine = Math.round((Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date()) + 'T12:00:00Z') - Date.parse(lundi + 'T12:00:00Z')) / 864e5) + 1; // 1 = lundi … 7 = dimanche
  const plafondDuJour = Math.min(510, 60 * jourSemaine + 100);
  try {
    r = await publier(A, 1000, A.pseudo, null, pts(12));
    const a1 = r.data || {};
    check(r.statut === 200 && a1.ok === true && a1.erreur === null && a1.version === VERSION && Number.isInteger(a1.rang_total) && Number.isInteger(a1.rang_semaine) && Number.isInteger(a1.joueurs) && a1.joueurs >= 1
      && a1.compte === 0 && a1.plafonne === false && a1.points_comptes === 12 && a1.points_semaine === 12 && a1.points_total === 12, `A s'inscrit avec 12 points et 1 000 € de fortune : ses points de la semaine comptent, l'argent part de zéro (${r.texte})`);
    if (a1.erreur === 'trop_vite') throw new Error("inscription de A refusée (« trop_vite ») : cette machine a déjà inscrit 10 joueurs dans l'heure ou 20 dans la journée (d'autres lancements du test ?), ou 60 joueurs se sont inscrits dans l'heure ; relancer plus tard");
    if (!a1.ok) throw new Error('inscription de A refusée : ' + r.texte);
    r = await publier(B, 2, B.pseudo, null, pts(0));
    const b1 = r.data || {};
    check(r.statut === 200 && b1.ok === true && b1.joueurs === a1.joueurs + 1 && b1.compte === 0 && b1.points_semaine === 0, `B s'inscrit avec 0 point et 2 € : ${r.texte}`);
    check(b1.semaine === lundi, `la semaine rendue est celle de Paris (${b1.semaine})`);
    r = await publier(A, 3000);
    check(r.data && r.data.ok === false && r.data.erreur === 'trop_vite' && Number.isInteger(r.data.rang_total) && r.data.compte === null, `A renvoie aussitôt : trop_vite, rien de compté (${r.texte})`);
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
    check(r.statut === 200 && t.version === VERSION && t.moi && t.moi.points === 12 && t.moi.valeur === 0 && t.moi.podium === null && t.joueurs >= 2 && tl.length <= 100, `tous les temps : A s'y retrouve avec 12 points et 0 € (son arrivée), sans toque (« moi » = ${JSON.stringify(t.moi)}, ${t.joueurs} joueurs)`);
    check(tl.every((x) => Object.keys(x).sort().join() === 'en_ligne,moi,podium,points,pseudo,rang,valeur' && typeof x.en_ligne === 'boolean' && Number.isInteger(x.points) && (x.podium === null || [1, 2, 3].includes(x.podium)))
      && tl.every((x, k) => k === 0 || tl[k - 1].points >= x.points)
      && !/"jeton"|"id"/.test(r.texte) && !r.texte.includes(A.id) && !r.texte.includes(A.jeton), 'les lignes : rang, pseudo, points, valeur, moi, podium (1, 2, 3 ou rien), en_ligne (un booléen), rangées aux points — ni identifiant ni jeton');
    check(t.moi.en_ligne === true && Number.isInteger(t.en_ligne_n) && t.en_ligne_n >= 1, `A vient d'envoyer : en ligne (${t.en_ligne_n} en ligne en tout)`);
    { const v = await rpc('fournil_vu', { p_id: A.id, p_jeton: A.jeton }), w = await rpc('fournil_vu', { p_id: A.id, p_jeton: B.jeton });
      check(v.statut === 200 && v.data && v.data.ok === true && w.statut === 200 && w.data && w.data.ok === false && w.data.erreur === 'jeton', `fournil_vu : A bat avec son jeton (${v.texte}), le jeton de B est refusé (${w.texte})`); }
    // les cadeaux (supabase/fournil-cadeaux.sql, collé à part) : une boîte vide pour un joueur de test, fermée aux autres
    { const c = await rpc('fournil_mes_cadeaux', { p_id: A.id, p_jeton: A.jeton }), d = await rpc('fournil_mes_cadeaux', { p_id: A.id, p_jeton: B.jeton }), e = await rpc('fournil_cadeau_recu', { p_id: A.id, p_jeton: B.jeton, p_n: 1 });
      if (c.statut === 404) check(false, 'fournil_mes_cadeaux manque : coller supabase/fournil-cadeaux.sql dans le SQL Editor');
      else check(c.statut === 200 && c.data && c.data.ok === true && Array.isArray(c.data.cadeaux) && c.data.cadeaux.length === 0 && d.data && d.data.ok === false && d.data.erreur === 'jeton' && e.data && e.data.ok === false, `les cadeaux : la boîte de A est vide (${c.texte}), le jeton de B est refusé (${d.texte} ; ${e.texte})`);
      const t = await appel('GET', '/rest/v1/fournil_cadeaux?select=*&limit=1'), u = await appel('POST', '/rest/v1/fournil_cadeaux', { joueur: A.id, montant: 1e15 });
      check((t.statut >= 400 || t.texte === '[]') && u.statut >= 400, `la table fournil_cadeaux ne se lit ni ne s'écrit directement (lecture ${t.statut}, écriture ${u.statut})`); }
    check(tl.filter((x) => x.moi).length <= 1 && (tl.find((x) => x.moi) || { pseudo: A.pseudo }).pseudo === A.pseudo, 'une seule ligne marquée « moi », celle de A');
    r = await rpc('fournil_classement', { p_periode: 'semaine', p_id: B.id });
    const s = r.data || {};
    check(r.statut === 200 && s.semaine === lundi && s.moi && s.moi.points === 0 && s.moi.valeur === 0 && (s.lignes || []).length <= 50, `cette semaine : B y est avec 0 point et 0 € (il vient de s'inscrire) (« moi » = ${JSON.stringify(s.moi)}, ${s.joueurs} joueurs)`);
    r = await rpc('fournil_classement', { p_periode: 'mois' });
    check(r.statut >= 400, `période inconnue : refusée (${resume(r)})`);

    log('  (10,5 s : le serveur ne prend qu’un envoi toutes les 10 s par joueur)');
    await attendre(10500);
    r = await publier(A, 1500, A.pseudo, null, pts(20));
    check(r.data && r.data.ok === true && Number.isInteger(r.data.rang_semaine) && r.data.compte === 500 && r.data.plafonne === false && r.data.points_comptes === 8 && r.data.points_plafonnes === false, `A envoie 20 points et 1 500 € : 8 points et 500 € comptés, rien de plafonné (${r.texte})`);
    r = await rpc('fournil_classement', { p_periode: 'semaine', p_id: A.id, p_limite: 100 });
    check(r.data && r.data.moi && r.data.moi.points === 20 && r.data.moi.valeur === 500, `cette semaine, A a 20 points (et gagné 500 €) (« moi » = ${JSON.stringify(r.data && r.data.moi)})`);
    r = await rpc('fournil_classement', { p_periode: 'total', p_id: A.id, p_limite: 100 });
    const t2 = r.data || {}, rangB = ((t2.lignes || []).find((x) => x.pseudo === B.pseudo) || {}).rang;
    check(t2.moi && t2.moi.points === 20 && t2.moi.valeur === 500 && (!rangB || rangB > t2.moi.rang), `tous les temps : A a 20 points depuis son arrivée, devant B (0)${rangB ? ` : ${t2.moi.rang}e contre ${rangB}e` : ''}`);
    log('  (10,5 s : des points d’une autre semaine)');
    await attendre(10500);
    r = await publier(A, 1500, A.pseudo, null, pts(400, lundiPasse));
    check(r.data && r.data.ok === true && r.data.points_comptes === 0 && r.data.points_semaine === 20, `400 points datés de la semaine passée (téléphone en retard sur minuit) : ignorés, toujours 20 (${r.texte.slice(0, 160)})`);
    log('  (10,5 s : un ancien téléphone, sans points)');
    await attendre(10500);
    r = await publier(A, 1600);
    check(r.data && r.data.ok === true && r.data.version === VERSION && r.data.points_comptes === 0 && r.data.points_semaine === 20 && r.data.compte === 100, `un téléphone encore en version 2 (sa fortune seule) : accepté, 100 € comptés, ses points ne bougent pas (${r.texte.slice(0, 160)})`);
    // les billets de l'événement « Le Quartier » : comptés seulement pendant sa fenêtre (du 13 au 27 octobre 2026, heure de Paris), jamais au-delà de l'enveloppe
    log('  (10,5 s : les billets du quartier)');
    await attendre(10500);
    const dansFenetre = Date.now() >= Date.parse('2026-10-13T12:00:00+02:00') && Date.now() < Date.parse('2026-10-27T12:00:00+01:00');
    const hqAvant = await rpc('fournil_heure', {}); // l'heure du serveur juste avant et juste après : la limite du moment est entre les deux
    r = await rpc('fournil_publier', { p_id: A.id, p_jeton: A.jeton, p_pseudo: A.pseudo, p_fortune: 1600, p_points: 20, p_lundi: lundi, p_quartier: 1e24 });
    const qa = r.data || {}, hqApres = await rpc('fournil_heure', {});
    check(qa.ok === true && (dansFenetre ? qa.quartier_plafonne === true && qa.quartier > 0 && qa.quartier < 1e18 && qa.rang_quartier >= 1 : qa.quartier === 0 && qa.rang_quartier === null),
      dansFenetre ? `pendant l'événement : 1e24 billets (console) acceptés mais plafonnés à l'enveloppe du moment (${Number(qa.quartier).toExponential(2)}), A ${qa.rang_quartier}e du quartier` : `hors de l'événement : des billets envoyés sont ignorés (quartier = ${qa.quartier})`);
    r = await rpc('fournil_classement', { p_periode: 'quartier', p_id: A.id, p_limite: 100 });
    check(r.statut === 200 && r.data && (dansFenetre ? r.data.moi && r.data.moi.points === null && r.data.moi.valeur === qa.quartier : r.data.moi === null), `le classement « quartier » ${dansFenetre ? 'y montre A en billets (points : null)' : 'ne montre pas A (0 billet)'}`);
    // la limite des événements (version 6.3) : lue dans ce plafond, à l'heure du serveur
    const msQ = [hqAvant.data && hqAvant.data.ms, hqApres.data && hqApres.data.ms];
    if (qa.quartier_plafonne === true && msQ.every(Number.isInteger)) verifierLimite('quartier', 'la limite du Quartier', qa.quartier, msQ[0], msQ[1]);
    else log(`  la limite du Quartier (v6.3) : rien à lire${dansFenetre ? ' (pas de plafond, ou fournil_heure muette)' : ' hors de l’événement (du 13 au 27 octobre, une heure de grâce)'}`);
    // la Maison hantée (du 27 octobre à midi au 2 novembre à 20 h, heure de Paris) : 1e24 bonbons, de même
    const H = LIMITES.hantee;
    if (Date.now() >= H.debut && Date.now() < H.fin + 3600e3) {
      log('  (10,5 s : les bonbons de la Maison hantée)');
      await attendre(10500);
      const hhAvant = await rpc('fournil_heure', {});
      r = await rpc('fournil_publier', { p_id: A.id, p_jeton: A.jeton, p_pseudo: A.pseudo, p_fortune: 1600, p_points: 20, p_lundi: lundi, p_evt: 'hantee', p_score: 1e24 });
      const ha = r.data || {}, hhApres = await rpc('fournil_heure', {}), msH = [hhAvant.data && hhAvant.data.ms, hhApres.data && hhApres.data.ms];
      check(ha.ok === true && ha.evt === 'hantee' && ha.evt_plafonne === true && ha.evt_score > 0 && ha.evt_score < 1e18, `pendant la Maison hantée : 1e24 bonbons (console) acceptés mais plafonnés (${Number(ha.evt_score).toExponential(2)}), A ${ha.rang_evt}e`);
      if (ha.evt_plafonne === true && msH.every(Number.isInteger)) verifierLimite('hantee', 'la limite de la Maison hantée', ha.evt_score, msH[0], msH[1]);
    } else log('  la limite de la Maison hantée (v6.3) : rien à lire hors de l’événement (du 27 octobre à midi au 2 novembre à 20 h)');
    // une partie effacée (0) puis le code rechargé (1 500) : rien ne compte deux fois, rien ne se retire
    log('  (2 × 10,5 s : A efface sa partie, puis recharge son code)');
    await attendre(10500);
    r = await publier(A, 0, A.pseudo, null, pts(20));
    const s0 = (await rpc('fournil_classement', { p_periode: 'semaine', p_id: A.id, p_limite: 100 })).data || {};
    check(r.data && r.data.ok === true && r.data.compte === 0 && s0.moi && s0.moi.valeur === 600 && s0.moi.points === 20, `A envoie 0 € (partie effacée) : rien ne se retire, toujours 600 € et 20 points cette semaine (« moi » = ${JSON.stringify(s0.moi)})`);
    await attendre(10500);
    r = await publier(A, 1600, A.pseudo, null, pts(20));
    const s5 = (await rpc('fournil_classement', { p_periode: 'semaine', p_id: A.id, p_limite: 100 })).data || {};
    const semaineOk = !!(s5.moi && s5.moi.valeur === 600);
    check(r.data && r.data.ok === true && r.data.compte === 0 && semaineOk, `puis 1 600 € (code rechargé) : rien de plus, toujours 600 € (« moi » = ${JSON.stringify(s5.moi)})`);

    // ─── version 6 : les copains et les notifications (A et B, de vrais joueurs de test) ───
    const bonusA = 0; // version 6.1 : un pourboire ne donne plus de point de classement (une étoile dans le jeu)
    if (V6) {
      log('\n── les copains et les notifications (version 6) ──');
      await attendre(10500);
      r = await rpc('fournil_publier', { p_id: A.id, p_jeton: A.jeton, p_pseudo: A.pseudo, p_fortune: 1600, p_points: 20, p_lundi: lundi, p_photo: { v: 1, nom: 'Boutique de test', postes: [{ n: 3, a: 1 }] } });
      check(r.data && r.data.ok === true && r.data.version === 6 && typeof r.data.photo_maj === 'string' && Math.abs(Date.parse(r.data.photo_maj) - Date.now()) < 120e3, `A envoie la photo de sa boutique : gardée (photo_maj ${r.data && r.data.photo_maj})`);
      r = await rpc('fournil_boutique', { p_pseudo: A.pseudo.toUpperCase() });
      check(r.statut === 200 && r.data && r.data.ok === true && r.data.pseudo === A.pseudo && r.data.photo && r.data.photo.nom === 'Boutique de test' && r.data.en_ligne === true && !r.texte.includes(A.id) && !/"id"|"jeton"/.test(r.texte), `la boutique de A, lue par tous (pseudo en majuscules) : sa photo, en ligne, ni identifiant ni jeton (${r.texte.slice(0, 120)})`);
      r = await rpc('fournil_boutique', { p_pseudo: 'test-ci-' + hasard(4) });
      check(r.data && r.data.ok === false && r.data.erreur === 'inconnu', `un pseudo inconnu : « inconnu » (${r.texte})`);
      r = await rpc('fournil_boutique', { p_pseudo: B.pseudo, p_id: A.id, p_jeton: A.jeton });
      check(r.data && r.data.ok === true && r.data.photo === null && r.data.restants === 3 && r.data.deja === false, `la boutique de B vue par A : pas de photo, 3 pourboires possibles (${r.texte})`);
      r = await rpc('fournil_pourboire', { p_id: A.id, p_jeton: A.jeton, p_pour: B.pseudo });
      check(r.data && r.data.ok === true && r.data.restants === 2 && r.data.etoile === 1 && r.data.points_semaine === 20, `A laisse un pourboire à B : 2 restants, une étoile dans son jeu, ses 20 points inchangés (version 6.1 : ${r.texte})`);
      r = await rpc('fournil_pourboire', { p_id: A.id, p_jeton: A.jeton, p_pour: B.pseudo });
      check(r.data && r.data.ok === false && r.data.erreur === 'deja', `un second le même jour : « deja » (${r.texte})`);
      r = await rpc('fournil_pourboire', { p_id: A.id, p_jeton: A.jeton, p_pour: A.pseudo });
      check(r.data && r.data.erreur === 'soi', `à soi-même : « soi » (${r.texte})`);
      r = await rpc('fournil_pourboire', { p_id: A.id, p_jeton: B.jeton, p_pour: B.pseudo });
      check(r.data && r.data.erreur === 'jeton', `avec le jeton de B : « jeton » (${r.texte})`);
      r = await rpc('fournil_recompenses', { p_id: B.id, p_jeton: B.jeton });
      check(r.data && r.data.ok === true && Array.isArray(r.data.pourboires) && r.data.pourboires.some((x) => x.de === A.pseudo) && 'objectif' in r.data, `B trouve le pourboire de A dans ses récompenses (${JSON.stringify(r.data && r.data.pourboires)})`);
      r = await rpc('fournil_recompenses', { p_id: B.id, p_jeton: B.jeton });
      check(r.data && r.data.ok === true && !r.data.pourboires.some((x) => x.de === A.pseudo), 'une seconde lecture : plus rien (rendu une fois)');
      const ep = 'https://fcm.googleapis.com/fcm/send/test-ci-' + hasard(16), cles = { p256dh: 'B' + hasard(43).slice(0, 86), auth: hasard(11).slice(0, 22) };
      r = await rpc('fournil_abonner', { p_id: A.id, p_jeton: A.jeton, p_sub: { endpoint: 'https://pirate.example.com/push', keys: cles }, p_prefs: null });
      check(r.data && r.data.ok === false && r.data.erreur === 'abonnement', `un abonnement chez un autre site qu'un service de notifications : refusé (${r.texte})`);
      r = await rpc('fournil_abonner', { p_id: A.id, p_jeton: A.jeton, p_sub: { endpoint: ep, keys: cles }, p_prefs: { pleine: true, evenements: false, pourboires: true, objectif: true } });
      check(r.data && r.data.ok === true && r.data.appareils === 1 && r.data.prefs && r.data.prefs.evenements === false && r.data.prefs.pleine === true, `A abonne un faux appareil (événements décochés) : ${r.texte}`);
      r = await rpc('fournil_planifier', { p_id: A.id, p_jeton: A.jeton, p_pleine_a: new Date(Date.now() + 2 * 3600e3).toISOString() });
      check(r.data && r.data.ok === true && r.data.planifiee === true, `« Ta boulangerie déborde » planifiée dans 2 h (${r.texte})`);
      r = await rpc('fournil_planifier', { p_id: A.id, p_jeton: A.jeton, p_pleine_a: null });
      check(r.data && r.data.ok === true && r.data.planifiee === false, `puis annulée (null : il est revenu) (${r.texte})`);
      r = await rpc('fournil_notif_essai', { p_id: A.id, p_jeton: A.jeton });
      const r2 = await rpc('fournil_notif_essai', { p_id: A.id, p_jeton: A.jeton });
      check(r.data && r.data.ok === true && r2.data && r2.data.erreur === 'trop_vite', `un essai : accepté ; un second aussitôt : « trop_vite » (${r.texte} / ${r2.texte})`);
      r = await rpc('fournil_desabonner', { p_id: A.id, p_jeton: A.jeton, p_endpoint: null });
      check(r.data && r.data.ok === true && r.data.retires === 1, `A désabonne tous ses appareils (l'essai ne partira pas vers ce faux appareil) (${r.texte})`);
      for (const [nom, corps] of [['fournil_notifs_dues', { p_limite: 1 }], ['fournil_notifs_faites', { p_ids: [], p_morts: [] }]]) {
        const x = await rpc(nom, corps);
        check(x.statut >= 400 && !Array.isArray(x.data), `${nom} (la fonction d'envoi) : refusée à la clé publique (${resume(x)})`);
      }
      for (const t of ['fournil_notifs', 'fournil_abonnements', 'fournil_photos', 'fournil_pourboires', 'fournil_objectif', 'fournil_notif_prefs']) {
        const x = await appel('GET', `/rest/v1/${t}?select=*&limit=1`);
        check(x.statut >= 400 && !(Array.isArray(x.data) && x.data.length), `lire ${t} : refusé (${resume(x)})`);
      }
    }

    // ─── les récompenses ───
    log('\n── les récompenses ──');
    r = await rpc('fournil_recompenses', { p_id: A.id, p_jeton: A.jeton });
    const rec = r.data || {}, der = rec.derniere;
    check(r.statut === 200 && rec.ok === true && rec.erreur === null && Array.isArray(rec.podiums) && rec.podiums.length === 0, `A (arrivé à l'instant) : aucun podium (${r.texte.slice(0, 160)})`);
    check(der === null || (der && der.semaine === lundiPasse && Array.isArray(der.podium) && der.podium.length >= 1
      && der.podium.every((x) => [1, 2, 3].includes(x.rang) && typeof x.pseudo === 'string' && (x.points === null || x.points > 0) && Object.keys(x).sort().join() === 'points,pseudo,rang,valeur')),
      der ? `le podium de la semaine passée (${der.semaine}) : ${der.podium.map((x) => `${x.rang} ${x.pseudo}`).join(', ')}` : 'la semaine passée : personne sur le podium (derniere = null)');
    r = await rpc('fournil_recompenses', { p_id: A.id, p_jeton: B.jeton });
    check(r.data && r.data.ok === false && r.data.erreur === 'jeton' && r.data.podiums.length === 0 && r.data.derniere === null, `les récompenses de A avec le jeton de B : « jeton », rien (${r.texte})`);
    r = await rpc('fournil_recompenses', { p_id: A.id, p_jeton: 'court' });
    check(r.data && r.data.ok === false && r.data.erreur === 'jeton', `avec un jeton mal formé : « jeton » (${r.texte})`);

    // ─── les plafonds : des points et une fortune absurdes sont acceptés, mais seul le plausible compte ───
    // (A est retiré juste après : ses gros totaux ne restent que le temps de quelques appels)
    log('\n── les plafonds : points du barème, gains plausibles ──');
    await attendre(10500);
    r = await publier(A, 1600, A.pseudo, null, pts(99999));
    check(r.data && r.data.ok === true && r.data.points_plafonnes === true && r.data.points_semaine === plafondDuJour + bonusA, `A envoie 99 999 points (console) : acceptés mais plafonnés au barème du jour ${jourSemaine} de la semaine (60 × ${jourSemaine} + 100, 510 au plus${bonusA ? ', plus 1 point de pourboire' : ''}) : ${r.data && r.data.points_semaine} (${r.texte.slice(0, 160)})`);
    await attendre(10500);
    r = await publier(A, 1e24, A.pseudo, null, pts(99999));
    const p = r.data || {};
    check(p.ok === true && p.plafonne === true && Number.isFinite(p.compte) && p.compte > 0 && p.compte < 1e22,
      `A envoie 1e24 € (fortune inventée) : accepté mais plafonné, ${Number(p.compte).toExponential(2)} € comptés (${r.texte})`);
    r = await rpc('fournil_classement', { p_periode: 'total', p_id: A.id, p_limite: 1 });
    check(r.data && r.data.moi && Math.abs(r.data.moi.valeur - (600 + p.compte)) <= 1e-9 * r.data.moi.valeur && r.data.moi.points === plafondDuJour + bonusA, `tous les temps : A a ${r.data && r.data.moi && r.data.moi.valeur.toExponential(2)} € (600 + le compté), pas 1e24 ; ${r.data && r.data.moi && r.data.moi.points} points, pas 99 999`);

    r = await rpc('fournil_retirer', { p_id: A.id, p_jeton: B.jeton });
    check(r.data && r.data.ok === false, `retirer A avec le jeton de B : refusé (${r.texte})`);
    r = await rpc('fournil_retirer', { p_id: A.id, p_jeton: A.jeton });
    check(r.data && r.data.ok === true, `A quitte le classement (${r.texte})`);
    if (r.data && r.data.ok === true) inscrits.delete(A.id);
    r = await rpc('fournil_classement', { p_periode: 'total', p_id: A.id, p_limite: 100 });
    check(r.data && r.data.moi === null && !(r.data.lignes || []).some((x) => x.pseudo === A.pseudo), 'A n’apparaît plus');
    r = await rpc('fournil_recompenses', { p_id: A.id, p_jeton: A.jeton });
    check(r.data && r.data.ok === true && r.data.podiums.length === 0, `ses récompenses sur le serveur : plus rien (${r.texte.slice(0, 80)})`);

    // une sauvegarde bricolée : arrivée avec 7e23 €, puis 1e24 € dix secondes plus tard. La fortune d'arrivée ne sert d'échelle
    // que jusqu'à 1e20 € : au plus ~4,1e19 € comptés (sans ce plafond : 2,9e23 €). C est retiré aussitôt.
    const C = joueurTest();
    r = await publier(C, 7e23);
    check(r.data && r.data.ok === true && r.data.compte === 0, `C arrive avec 7e23 € (sauvegarde bricolée) : accepté, rien de compté (${r.texte.slice(0, 120)})`);
    log('  (10,5 s)');
    await attendre(10500);
    r = await publier(C, 1e24);
    check(r.data && r.data.ok === true && r.data.plafonne === true && r.data.compte > 0 && r.data.compte < 5e19,
      `10 s plus tard, 1e24 € : ${Number(r.data && r.data.compte).toExponential(2)} € comptés au plus (échelle d'arrivée plafonnée à 1e20 €), pas 2,9e23`);
    r = await rpc('fournil_retirer', { p_id: C.id, p_jeton: C.jeton });
    check(r.data && r.data.ok === true, `C quitte le classement (${r.texte})`);
    if (r.data && r.data.ok === true) inscrits.delete(C.id);

    // ─── 6. la limite d'inscriptions par source ───
    log('\n── inscriptions par source (10 par heure) ──');
    let acceptes = 3, refus = null; // A, B et C comptent déjà (A et C ont quitté le classement, leur place dans le compte reste)
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
  ecrireResume(conclusion + (sourceConclusion ? '\n\n' + sourceConclusion : '') + (versionConclusion ? '\n\n' + versionConclusion : '') + (limiteConclusion ? '\n\n' + limiteConclusion : ''));
  process.exit(fails ? 1 : 0);
})().catch(async (e) => { console.error('  FAIL le test plante :', e && e.stack || e); try { await menage(); } catch (x) { /* rien */ } process.exit(1); });
