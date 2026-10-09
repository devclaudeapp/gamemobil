#!/usr/bin/env node
// Opération Poncin : lance les tests Node des modules purs (carte, monde et navigation, simulation) et additionne les échecs.
'use strict';
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const TESTS = ['poncin-carte.test.js', 'poncin-monde.test.js', 'poncin-jeu.test.js'];
let echecs = 0;
// garde-fou : aucune clé secrète Supabase dans le dépôt (seule la clé publique a sa place, dans poncin/config.js)
{
  const racine = path.join(__dirname, '..'), interdit = new RegExp(['sb', 'secret', '[A-Za-z0-9_-]{20,}'].join('_')), vus = []; // une vraie clé secrète, pas le mot dans un texte
  const parcourir = (d) => { for (const n of fs.readdirSync(d, { withFileTypes: true })) { if (['.git', 'node_modules', 'cache', 'shots'].includes(n.name)) continue; if (d === racine && n.name === 'vendor') continue; const f = path.join(d, n.name); if (n.isDirectory()) parcourir(f); else if (/\.(js|cjs|json|html|md|sql|ts|yml|webmanifest)$/.test(n.name) && fs.statSync(f).size < 3e6 && interdit.test(fs.readFileSync(f, 'utf8'))) vus.push(path.relative(racine, f)); } };
  parcourir(racine);
  console.log((vus.length ? '  FAIL ' : '  ok   ') + `aucune clé secrète Supabase dans le dépôt${vus.length ? ' : ' + vus.join(', ') : ''}`);
  if (vus.length) echecs++;
}
for (const t of TESTS) {
  const f = path.join(__dirname, t);
  if (!fs.existsSync(f)) { console.log(`  FAIL ${t} manquant`); echecs++; continue; }
  console.log(`── ${t} ──`);
  const r = spawnSync(process.execPath, [f], { stdio: 'inherit' });
  if (r.status !== 0) echecs++;
}
console.log(echecs ? `\n${echecs} fichier(s) de test en échec` : '\nTout passe (Poncin).');
process.exit(echecs ? 1 : 0);
