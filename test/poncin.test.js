#!/usr/bin/env node
// Opération Poncin : lance les tests Node des modules purs (carte, monde et navigation, simulation) et additionne les échecs.
'use strict';
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const TESTS = ['poncin-carte.test.js', 'poncin-monde.test.js', 'poncin-jeu.test.js'];
let echecs = 0;
for (const t of TESTS) {
  const f = path.join(__dirname, t);
  if (!fs.existsSync(f)) { console.log(`  FAIL ${t} manquant`); echecs++; continue; }
  console.log(`── ${t} ──`);
  const r = spawnSync(process.execPath, [f], { stdio: 'inherit' });
  if (r.status !== 0) echecs++;
}
console.log(echecs ? `\n${echecs} fichier(s) de test en échec` : '\nTout passe (Poncin).');
process.exit(echecs ? 1 : 0);
