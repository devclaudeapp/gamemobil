#!/usr/bin/env node
// Opération Poncin — les zones de la carte (PZONES, zones.js ; conception du lot Gameplay, § 7). Aujourd'hui : 'centre' reprend telles
// quelles les zones de la carte (l'arène actuelle) ; les autres rendent 'centre' avec un avertissement (lot 2/2). Sortie « ok / FAIL ».
'use strict';
const fs = require('fs'), path = require('path');
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PZ = require('../src-poncin/zones.js'), PC = require('../src-poncin/carte-provisoire.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const carteF = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
const cartes = [['carte provisoire', PC.creer(1)]];
if (fs.existsSync(carteF)) cartes.push(['vraie carte', JSON.parse(fs.readFileSync(carteF, 'utf8'))]);
for (const [nom, carte] of cartes) {
  if (!carte) { console.log(`\n── (${nom} absente)`); continue; }
  titre(`'centre' sur la ${nom}`);
  const monde = PM.creer(carte), rnd = R.mulberry32(1 ^ 0x2F6E2B1), z = PZ.preparer(carte, monde, null, 'centre', rnd), Z = carte.zones;
  check(z.id === 'centre' && !z.avertissement && z.limite.rayon === Z.arene.rayon && z.limite.centre[0] === Z.arene.centre[0] && z.limite.centre[1] === Z.arene.centre[1] && z.englobant.rayon === Z.arene.rayon, `limite = zones.arene (${Z.arene.centre.map(Math.round)}, r ${Z.arene.rayon})`);
  check(z.apparitions.length === Z.apparitions.length && z.apparitions.every((p, i) => p[0] === Z.apparitions[i][0] && p[1] === Z.apparitions[i][1]), `les ${z.apparitions.length} apparitions de la carte, telles quelles`);
  check(z.objets.length === Z.armes.length && z.objets.every((o, i) => o[0] === Z.armes[i].x && o[1] === Z.armes[i].z && o[2] === Z.armes[i].arme), `les ${z.objets.length} objets de la carte, au format [x, z, objet]`);
  check(Math.abs(PZ.distanceReapparition(z) - Math.max(15, Math.min(60, 0.32 * Z.arene.rayon))) < 1e-9 && z.aire > 0, `distance de réapparition ${PZ.distanceReapparition(z).toFixed(1)} m`);
  z.apparitions[0][0] = 1e9; check(Z.apparitions[0][0] !== 1e9, 'des copies : la carte n\'est pas modifiée');
}
titre('Les autres zones (lot 2/2)');
{
  const carte = cartes[cartes.length - 1][1];
  const r = R.SALON.zones.filter((id) => id !== 'centre').map((id) => PZ.preparer(carte, null, null, id, Math.random));
  check(r.every((z) => z.id === 'centre' && typeof z.avertissement === 'string' && R.SALON.zones.indexOf(z.demande) >= 0), 'place, eglise, bourg, rivieres, tout : « centre » pour l\'instant, avec un avertissement');
  const x = PZ.preparer(carte, null, null, 'lune');
  check(x.id === 'centre' && x.avertissement, 'une zone inconnue : « centre », avec un avertissement');
}
console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
