#!/usr/bin/env node
// Opération Poncin : le classement du butin éprouvé POUR DE VRAI contre le projet Supabase du jeu (sur GitHub Actions : le
// conteneur de Claude ne peut pas joindre Supabase). Node 22, fetch, la clé PUBLIQUE seulement (poncin/config.js).
//  1. les fonctions sont-elles installées (supabase/poncin-butin.sql collé) et dans leur version (1) ?
//  2. les tables sont-elles fermées (lecture directe refusée, fonctions internes refusées) ?
//  3. deux joueurs de test (pseudos « ci-… » tirés au hasard) : une partie sortie (pièces comptées, bonus de la zone de la semaine),
//     classements semaine et records, rangs, « en ligne », mauvais jeton, pseudo pris, valeur absurde, trop vite, retrait.
// Les joueurs de test sont TOUJOURS retirés à la fin (finally) : rien ne reste dans le classement des amis.
// Lancement : node test/poncin-butin-ci.cjs (adresse et clé : PONCIN_SUPABASE_URL / PONCIN_SUPABASE_KEY, sinon poncin/config.js)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function lireConfig() {
  if (process.env.PONCIN_SUPABASE_URL && process.env.PONCIN_SUPABASE_KEY) return { url: process.env.PONCIN_SUPABASE_URL, key: process.env.PONCIN_SUPABASE_KEY };
  const t = fs.readFileSync(path.join(__dirname, '..', 'poncin', 'config.js'), 'utf8'), u = /supabaseUrl\s*:\s*['"]([^'"]+)['"]/.exec(t), k = /supabaseKey\s*:\s*['"]([^'"]+)['"]/.exec(t);
  return { url: u[1], key: k[1] };
}
const CONFIG = lireConfig(), BASE = CONFIG.url.replace(/\/+$/, ''), CLE = CONFIG.key;
if (/^sb_secret_/.test(CLE)) { console.error('Jamais de clé secrète ici.'); process.exit(1); }
let fails = 0, oks = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (ok) oks++; else fails++; return ok; };
const hasard = (n) => crypto.randomBytes(n).toString('hex');
const joueurTest = () => ({ id: crypto.randomUUID(), jeton: hasard(32), pseudo: 'ci-' + hasard(4) });
const entetes = { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json' };
async function rpc(nom, corps) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${nom}`, { method: 'POST', headers: entetes, body: JSON.stringify(corps || {}) });
  let data = null; try { data = await r.json(); } catch (e) { data = null; }
  return { status: r.status, data };
}

(async () => {
  console.log('── le classement du butin sur le vrai Supabase');
  const inscrits = [];
  try {
    const c0 = await rpc('poncin_classement', { p_periode: 'semaine' });
    if (!check(c0.status === 200 && c0.data && c0.data.version === 1 && Array.isArray(c0.data.lignes), `poncin_classement répond (version ${c0.data && c0.data.version}, ${c0.data && c0.data.joueurs} joueur(s) cette semaine, statut ${c0.status})`)) {
      console.log('     → coller supabase/poncin-butin.sql dans le SQL Editor de Supabase'); return;
    }
    const t = await fetch(`${BASE}/rest/v1/poncin_joueurs?select=*`, { headers: entetes }); const tj = await t.text();
    check(t.status >= 400 || tj === '[]', `la table poncin_joueurs ne se lit pas directement (statut ${t.status})`);
    const b = await rpc('poncin_bornes', {});
    check(b.status >= 400, `les fonctions internes sont refusées (poncin_bornes : statut ${b.status})`);

    const A = joueurTest(), B = joueurTest(); inscrits.push(A, B);
    const pa = await rpc('poncin_publier', { p_id: A.id, p_jeton: A.jeton, p_pseudo: A.pseudo, p_valeur: 400, p_primes: 0, p_extrait: true, p_bonus: true, p_score: 430 });
    check(pa.data && pa.data.ok === true && pa.data.compte && pa.data.compte.pieces === 500 && pa.data.rang_semaine >= 1, `A publie une partie sortie avec 400 pièces dans la zone de la semaine : ${pa.data && pa.data.compte && pa.data.compte.pieces} comptées (×1,25), rang ${pa.data && pa.data.rang_semaine}`);
    const pb = await rpc('poncin_publier', { p_id: B.id, p_jeton: B.jeton, p_pseudo: B.pseudo, p_valeur: 0, p_primes: 0, p_extrait: false, p_bonus: false, p_score: 20 });
    check(pb.data && pb.data.ok === true && pb.data.compte && pb.data.compte.pieces === 0, 'B publie une partie perdue : 0 pièce, mais une partie de plus');
    const sem = await rpc('poncin_classement', { p_periode: 'semaine', p_id: A.id });
    const la = sem.data && sem.data.lignes.find((l) => l.pseudo === A.pseudo), lb = sem.data && sem.data.lignes.find((l) => l.pseudo === B.pseudo);
    check(!!(la && la.moi && la.pieces === 500 && la.extractions === 1 && la.en_ligne && lb && !lb.moi && lb.pieces === 0 && la.rang < lb.rang), `« Cette semaine » : A ${la && la.pieces} pièces (moi, en ligne), devant B`);
    check(sem.data && sem.data.en_ligne_n >= 2 && JSON.stringify(sem.data).indexOf(A.jeton) < 0 && JSON.stringify(sem.data).indexOf(A.id) < 0, `ni jeton ni identifiant dans la réponse ; ${sem.data && sem.data.en_ligne_n} en ligne`);
    const rec = await rpc('poncin_classement', { p_periode: 'records', p_id: B.id });
    check(rec.data && rec.data.moi && rec.data.moi.record === 20, `« Records » : le record de B (${rec.data && rec.data.moi && rec.data.moi.record})`);
    const vite = await rpc('poncin_publier', { p_id: A.id, p_jeton: A.jeton, p_pseudo: A.pseudo, p_valeur: 100, p_primes: 0, p_extrait: true, p_bonus: false, p_score: 100 });
    check(vite.data && vite.data.erreur === 'trop_vite', 'une deuxième partie 2 s après : « trop_vite », rien de compté');
    const absurde = await rpc('poncin_publier', { p_id: A.id, p_jeton: A.jeton, p_pseudo: A.pseudo, p_valeur: 99999, p_primes: 0, p_extrait: true, p_bonus: false, p_score: 99999 });
    check(absurde.data && absurde.data.erreur === 'valeur', 'une valeur absurde (99 999 pièces) : « valeur »');
    const autre = await rpc('poncin_publier', { p_id: A.id, p_jeton: B.jeton, p_pseudo: A.pseudo });
    check(autre.data && autre.data.erreur === 'jeton', 'le jeton d’un autre : « jeton »');
    await new Promise((r) => setTimeout(r, 11000)); // un pseudo seul : un envoi toutes les 10 s au plus
    const pris = await rpc('poncin_publier', { p_id: B.id, p_jeton: B.jeton, p_pseudo: A.pseudo.toUpperCase() });
    check(pris.data && pris.data.erreur === 'pseudo_pris', 'le pseudo d’un autre (en majuscules) : « pseudo_pris »');
    const vu = await rpc('poncin_vu', { p_id: A.id, p_jeton: A.jeton });
    check(vu.data && vu.data.ok === true, 'poncin_vu : un signe de vie accepté');
  } catch (e) {
    check(false, 'exception : ' + (e && e.message));
  } finally {
    for (const j of inscrits) { const r = await rpc('poncin_retirer', { p_id: j.id, p_jeton: j.jeton }).catch(() => null); check(!!(r && r.data && r.data.ok), `${j.pseudo} retiré`); }
    const apres = await rpc('poncin_classement', { p_periode: 'records' }).catch(() => null);
    check(!!(apres && apres.data && !apres.data.lignes.some((l) => /^ci-[0-9a-f]{8}$/.test(l.pseudo))), 'aucun joueur de test ne reste');
    console.log(`\n${oks} ok, ${fails} en échec`);
    process.exit(fails ? 1 : 0);
  }
})();
