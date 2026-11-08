#!/usr/bin/env node
// Le garde-fou commun à toute la Salle de jeux (avant : dans test/poncin.test.js, parti avec Opération Poncin le 8 nov. 2026) :
//   · aucune clé secrète Supabase (sb_secret_…, ou un jeton JWT « service_role ») dans AUCUN fichier suivi par git ;
//   · dans les config.js des jeux (fournil/config.js, zombies/config.js, et tout autre config.js suivi), seulement l'adresse du projet
//     et sa clé PUBLIQUE (sb_publishable_…, ou un jeton JWT « anon »).
// Lancé dans l'étape deploy de .github/workflows/pages.yml : rouge ici = pas de mise en ligne.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const RACINE = path.join(__dirname, '..');
let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; return ok; };

// les motifs sont assemblés ici pour que ce fichier ne se signale pas lui-même
const SECRETE = new RegExp(['sb', 'secret', '[A-Za-z0-9_-]{20,}'].join('_')); // une vraie clé secrète, pas le mot dans un texte
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;
const roleJwt = (milieu) => { try { return JSON.parse(Buffer.from(milieu, 'base64url').toString('utf8')).role || ''; } catch (e) { return ''; } };

// ─── 1. tout le dépôt suivi par git ───
console.log('── aucune clé secrète dans le dépôt ──');
let fichiers;
try { fichiers = execFileSync('git', ['ls-files', '-z'], { cwd: RACINE, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean); } catch (e) { fichiers = null; }
if (check(Array.isArray(fichiers) && fichiers.length > 50, `les fichiers suivis par git : ${fichiers ? fichiers.length : 'git ls-files a échoué'}`)) {
  const secrets = [], jwtSecrets = [];
  let lus = 0;
  for (const f of fichiers) {
    const p = path.join(RACINE, f);
    let st; try { st = fs.statSync(p); } catch (e) { continue; } // supprimé de la copie de travail, pas encore du suivi
    if (!st.isFile() || st.size > 40e6) continue;
    const t = fs.readFileSync(p).toString('latin1'); lus++; // latin1 : un octet = un caractère, les fichiers binaires passent aussi
    if (SECRETE.test(t)) secrets.push(f);
    for (const m of t.matchAll(JWT)) if (roleJwt(m[1]) === 'service_role') { jwtSecrets.push(f); break; }
  }
  check(lus > 50, `${lus} fichiers lus`);
  check(!secrets.length, 'aucune clé sb_secret_… dans le dépôt' + (secrets.length ? ' : ' + secrets.join(', ') : ''));
  check(!jwtSecrets.length, 'aucun jeton « service_role » dans le dépôt' + (jwtSecrets.length ? ' : ' + jwtSecrets.join(', ') : ''));
}

// ─── 2. les config.js : la clé publique seulement ───
console.log('── les config.js : seulement la clé publique ──');
const ATTENDUS = { 'fournil/config.js': 'FOURNIL_CONFIG', 'zombies/config.js': 'ZOMBIES_CONFIG' };
const configs = [...new Set([...Object.keys(ATTENDUS), ...(fichiers || []).filter((f) => path.basename(f) === 'config.js' && !f.startsWith('outils/'))])];
for (const f of configs) {
  const p = path.join(RACINE, f);
  if (!check(fs.existsSync(p), `${f} existe`)) continue;
  const src = fs.readFileSync(p, 'utf8');
  const bac = { window: {} };
  try { vm.runInNewContext(src, bac, { timeout: 1000 }); } catch (e) { check(false, `${f} se lit : ${e.message}`); continue; }
  const noms = Object.keys(bac.window);
  const nom = ATTENDUS[f] || noms[0];
  const cfg = bac.window[nom];
  if (!check(cfg && typeof cfg === 'object', `${f} pose window.${nom}`)) continue;
  const url = cfg.supabaseUrl || '', cle = cfg.supabaseKey || '';
  check(url === '' || /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(url), `${f} : l'adresse du projet (${url || 'vide'})`);
  const publique = cle === '' || /^sb_publishable_[A-Za-z0-9_-]+$/.test(cle) || (/^eyJ/.test(cle) && roleJwt(cle.split('.')[1] || '') === 'anon');
  check(publique, `${f} : supabaseKey est la clé PUBLIQUE (${cle ? cle.slice(0, 15) + '…' : 'vide'})`);
  // aucune autre clé Supabase dans le fichier, quel que soit son champ : seulement des sb_publishable_ et des JWT « anon »
  const autresSb = [...src.matchAll(/\bsb_[a-z]+_[A-Za-z0-9_-]{8,}/g)].map((m) => m[0]).filter((k) => !k.startsWith('sb_publishable_'));
  const autresJwt = [...src.matchAll(JWT)].map((m) => roleJwt(m[1])).filter((r) => r !== 'anon');
  check(!autresSb.length && !autresJwt.length, `${f} : aucune autre clé Supabase (ni secrète, ni service_role)` + (autresSb.length + autresJwt.length ? ` : ${[...autresSb.map((k) => k.slice(0, 12) + '…'), ...autresJwt].join(', ')}` : ''));
}

// ─── 3. le contrôle sait reconnaître une clé secrète (sinon il ne prouverait rien) ───
console.log('── le contrôle lui-même ──');
const fausse = ['sb', 'secret', 'A1b2C3d4E5f6G7h8I9j0K1l2'].join('_');
const fauxJwt = (role) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url'), 'c2lnbmF0dXJlLWZhdXNzZQ'].join('.');
check(SECRETE.test(`const k = '${fausse}';`) && !SECRETE.test('la clé sb_secret_… ne doit jamais entrer'), 'une vraie clé sb_secret_ est reconnue, le mot seul dans un texte ne l’est pas');
check([...fauxJwt('service_role').matchAll(JWT)].some((m) => roleJwt(m[1]) === 'service_role') && ![...fauxJwt('anon').matchAll(JWT)].some((m) => roleJwt(m[1]) === 'service_role'), 'un jeton « service_role » est reconnu, un jeton « anon » passe');

console.log(fails ? `\n${fails} échec(s)` : '\nTout passe (sécurité).');
process.exit(fails ? 1 : 0);
