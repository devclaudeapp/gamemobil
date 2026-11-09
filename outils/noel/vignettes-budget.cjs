#!/usr/bin/env node
// Le budget des vignettes du carnet (fournil/img/carnet/, 1,5 Mo au plus : test/fournil-vignettes.test.js) devant les objets de Noël
// (docs/noel-contrat.md § 9.3). Mesure la place restante, puis ce que coûte une vignette de 256 × 256 selon la qualité webp, sur de VRAIS
// rendus bruts 512 × 512 de outils/vignettes/cuire.cjs (le dossier --brut d'un tour précédent : ceux du Marché d'automne et de sa saison,
// des décos, des pièces de tenue, un compagnon : les mêmes sortes d'objets que ceux de Noël), avec le même redimensionnement que cuire.cjs.
// Lancer : NODE_PATH=<sharp@0.33.5>/node_modules node outils/noel/vignettes-budget.cjs <dossier brut> [nombre d'objets à ajouter]
'use strict';
const fs = require('fs'), path = require('path');
let sharp; try { sharp = require('sharp'); } catch (e) { console.error('sharp introuvable (NODE_PATH)'); process.exit(2); }
const ROOT = path.resolve(__dirname, '../..'), CARNET = path.join(ROOT, 'fournil', 'img', 'carnet'), BUDGET = 1.5 * 1024 * 1024;
const BRUT = process.argv[2], AJOUTS = +(process.argv[3] || 0);
const taille = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? taille(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
const compte = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? compte(path.join(d, e.name)) : /\.webp$/.test(e.name) ? 1 : 0), 0);
(async () => {
  const t = taille(CARNET), n = compte(CARNET);
  console.log(`le dossier aujourd'hui : ${n} vignettes, ${(t / 1024).toFixed(1)} Ko (${(t / n / 1024).toFixed(2)} Ko en moyenne) ; budget ${(BUDGET / 1024).toFixed(0)} Ko ; reste ${((BUDGET - t) / 1024).toFixed(1)} Ko`);
  if (!BRUT) return;
  const pngs = []; const lire = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) lire(p); else if (/\.png$/.test(e.name)) pngs.push(p); } }; lire(BRUT);
  console.log(`${pngs.length} rendus bruts dans ${BRUT}`);
  const reglages = [[70, 80], [55, 72], [50, 65], [45, 60], [40, 55], [35, 50]];
  const res = {};
  for (const [q, a] of reglages) {
    let s = 0, mx = 0; for (const p of pngs) { const b = await sharp(p).resize(256, 256, { kernel: 'lanczos3' }).webp({ quality: q, alphaQuality: a, effort: 6, smartSubsample: true }).toBuffer(); s += b.length; mx = Math.max(mx, b.length); }
    res[`${q}/${a}`] = s / pngs.length;
    console.log(`  qualité ${q}, alpha ${a} : ${(s / pngs.length / 1024).toFixed(2)} Ko en moyenne (au plus ${(mx / 1024).toFixed(1)} Ko)${AJOUTS ? ` → ${AJOUTS} objets : ${(AJOUTS * s / pngs.length / 1024).toFixed(0)} Ko` : ''}`);
  }
  // à 192 × 192 (si le test acceptait ce côté pour les nouvelles : il exige 256 aujourd'hui)
  let s = 0; for (const p of pngs) s += (await sharp(p).resize(192, 192, { kernel: 'lanczos3' }).webp({ quality: 55, alphaQuality: 72, effort: 6, smartSubsample: true }).toBuffer()).length;
  console.log(`  (repère) 192 × 192, qualité 55, alpha 72 : ${(s / pngs.length / 1024).toFixed(2)} Ko en moyenne`);
})();
