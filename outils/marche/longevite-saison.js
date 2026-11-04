#!/usr/bin/env node
// La saison « Automne » ne change pas le rythme des boutiques : les joueurs de test/longevite.js (occasionnel, régulier, assidu), aux deux
// départs dont les 60 jours couvrent la saison (le 5 octobre : la saison du 40e au 57e jour ; le 1er novembre : du 13e au 30e), joués
// deux fois, sans puis avec les récompenses de la piste (docs/marche-contrat.md § 8.3) versées au cran atteint : les étoiles tout de
// suite, les boosts LANCÉS tout de suite (le pire cas : un vrai joueur les garde parfois pour plus tard), les heures de gains tout de suite.
// L'XP vient de outils/marche/saison.js (les mêmes sources et plafonds) ; les paliers du Marché du profil le plus proche (régulier →
// quotidien, assidu → assidu : un peu plus qu'ils n'en feraient, donc un peu plus de récompenses : le pire cas). Les départs du 1er déc.,
// du 1er mars et du 7 juin ne voient pas la saison d'automne (rien ne change pour eux ; la saison d'hiver aura son propre essai).
// On compare test/longevite.js resume() : la première nouvelle boutique, les boutiques ouvertes en 60 jours, la plus longue, la franchise,
// la pièce montée, les étoiles au 30e jour et à la fin, le niveau du boulanger, l'attente. Puis `node test/longevite.js --test` (inchangé).
// Lancer : TZ=Europe/Paris node outils/marche/longevite-saison.js
'use strict';
const G = require('../../src/game.js'), L = require('../../test/longevite.js'), S = require('./saison.js');
// les récompenses de la piste (la copie exacte du contrat, § 8.3) : étoiles, boost { mult, secs }, prime (heures de gains) ; le reste est cosmétique
const PISTE = {
  1: { boost: [2, 1800] }, 2: { etoiles: 1 }, 4: { prime: 1 }, 6: { etoiles: 1, prime: 1 }, 8: { prime: 2 }, 10: { etoiles: 1, boost: [2, 1800] }, 11: { prime: 1 },
  12: { prime: 3 }, 14: { etoiles: 2 }, 16: { prime: 2 }, 18: { etoiles: 2, prime: 4 }, 20: { boost: [3, 1800] }, 21: { etoiles: 3 }, 22: { etoiles: 2 },
};
// les garde-fous de test/longevite.js (CIBLES : le même littéral, relu dans le fichier, pas recopié) : la saison doit les tenir tous
const CIBLES = (() => { const t = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'test', 'longevite.js'), 'utf8'), m = /const CIBLES = (\{[\s\S]*?\n\});/.exec(t); return m ? Function(`return (${m[1]});`)() : null; })();
const entre = (v, c) => !c || (v != null && v >= c[0] && v <= c[1]);
const PROFILS = { occasionnel: { casino: 0, marche: 'occasionnel' }, regulier: { casino: 1, marche: 'quotidien' }, assidu: { casino: 2, marche: 'assidu' } };
const resumer = (nom, R) => { const r = L.resume(nom, R), d = R.M.prestiges.slice(1).map((p) => p.duree); return { premiere: r.premierPrestige ? r.premierPrestige.jour : null, boutiques: R.st.boutiques, plusLongue: d.length ? Math.max(...d) : 0, franchise: r.franchise, piece: r.piece, etoilesJ30: r.etoiles.j30, etoilesFin: r.etoiles.fin, niveau: r.niveau.fin, attente: r.attente }; };
let pire = { etoiles: 0, boutiques: 0, premiere: 0, franchise: 0 }, lignes = [], horsCibles = 0;
for (const quand of ['5 oct.', '1er nov.']) for (const nom of Object.keys(PROFILS)) {
  const base = { profil: Object.assign({ sessions: L.PROFILS[nom].sessions }, PROFILS[nom]), depart: L.DEPARTS[quand], jours: 60 };
  const sans = S.simuler(nom, base);
  let etoiles = 0, boosts = 0, primes = 0;
  const avec = S.simuler(nom, Object.assign({}, base, {
    recompense(c, now, st) { const r = PISTE[c]; if (!r || !st) return; if (r.etoiles) { st.etoiles += r.etoiles; etoiles += r.etoiles; } if (r.boost) { G.donnerBoostReserve(st, r.boost[0], r.boost[1]); boosts++; } if (r.prime) { G.donnerPrimeHeures(st, r.prime); primes += r.prime; } },
    chaqueSeconde(st) { const b = st.boosts; if (b && Array.isArray(b.reserve) && b.reserve.length && !(b.actif && b.actif.fin > st.now)) G.lancerBoostReserve(st, b.reserve.length - 1); }, // (les boosts de la piste : lancés tout de suite, le dernier reçu d'abord)
  }));
  // le bruit : le joueur simulé décide d'ouvrir une nouvelle boutique sur des seuils (étoiles gagnables, stagnation) ; une seule étoile de
  // plus décale une ouverture et change les étoiles de la fin de plusieurs pour cent. On le mesure : la même partie avec UNE étoile de
  // plus, au cran 2, 6, 12 ou 18 (sans rien d'autre) ; l'écart de la saison est jugé contre ce bruit
  const bruit = [2, 6, 12, 18].map((k) => resumer(nom, S.simuler(nom, Object.assign({}, base, { recompense(c, now, st) { if (c === k && st) st.etoiles += 1; } })).R));
  const a = resumer(nom, sans.R), b = resumer(nom, avec.R);
  const ecart = (x, y) => Math.abs(y / x - 1), bruitE = Math.max(...bruit.map((z) => Math.max(ecart(a.etoilesJ30, z.etoilesJ30), ecart(a.etoilesFin, z.etoilesFin))));
  lignes.push(`  ${nom.padEnd(11)} départ ${quand.padEnd(8)} crans ${avec.crans}/${S.CRANS} (+${etoiles} ★, ${boosts} boosts lancés, ${primes} h de primes) :`
    + ` 1re boutique j${a.premiere} → j${b.premiere} · boutiques en 60 j ${a.boutiques} → ${b.boutiques} · la plus longue ${a.plusLongue.toFixed(1)} → ${b.plusLongue.toFixed(1)} j`
    + ` · franchise j${a.franchise} → j${b.franchise} · pièce montée j${a.piece} → j${b.piece} · étoiles j30 ${a.etoilesJ30} → ${b.etoilesJ30} (${((b.etoilesJ30 / a.etoilesJ30 - 1) * 100).toFixed(1)} %), fin ${a.etoilesFin} → ${b.etoilesFin} (${((b.etoilesFin / a.etoilesFin - 1) * 100).toFixed(1)} %)`
    + ` · niveau ${a.niveau} → ${b.niveau} · attente ${Math.round(a.attente * 100)} → ${Math.round(b.attente * 100)} % · bruit d'une seule étoile : ${(bruitE * 100).toFixed(1)} %`);
  const c = CIBLES && CIBLES[nom], cib = !c ? 'CIBLES illisibles' : [['premiere', 'premierPrestige'], ['franchise', 'franchise'], ['etoilesJ30', 'etoilesJ30'], ['piece', 'piece'], ['niveau', 'niveauFin']].filter(([k, kc]) => !entre(b[k], c[kc])).map(([k]) => k).concat(b.plusLongue > (c.dureeMax || 99) ? ['plusLongue'] : []).join(', ');
  lignes.push(`      garde-fous de test/longevite.js (CIBLES) avec la saison : ${cib || 'tous tenus'}`); if (cib) horsCibles++;
  pire = { etoiles: Math.max(pire.etoiles, Math.max(ecart(a.etoilesFin, b.etoilesFin), ecart(a.etoilesJ30, b.etoilesJ30)) - Math.max(0.05, 1.5 * bruitE) + 0.05), boutiques: Math.max(pire.boutiques, Math.abs(b.boutiques - a.boutiques)), premiere: Math.max(pire.premiere, Math.abs((b.premiere || 0) - (a.premiere || 0))), franchise: Math.max(pire.franchise, Math.abs((b.franchise || 0) - (a.franchise || 0))) };
}
console.log('── la saison « Automne » et le rythme des boutiques (test/longevite.js, 60 jours ; sans → avec la piste) ──');
console.log(lignes.join('\n'));
const ok = pire.etoiles <= 0.05 && pire.boutiques <= 1 && pire.premiere <= 1 && pire.franchise <= 2 && !horsCibles;
console.log(`  le plus grand écart : étoiles ${(pire.etoiles * 100).toFixed(1)} % au-delà de 1,5 × le bruit d'une étoile (max 5 %), boutiques ${pire.boutiques} (max 1), première boutique ${pire.premiere} j (max 1), franchise ${pire.franchise} j (max 2) : ${ok ? 'aucun effet notable' : 'À REVOIR'}`);
process.exitCode = ok ? 0 : 1;
