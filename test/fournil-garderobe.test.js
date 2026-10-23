#!/usr/bin/env node
// La garde-robe du Fournil (src/game.js) : les quatre pièces, les collections (podium or / argent / bronze, quartier, quartier en or),
// donner, porter, améliorer en étoiles, les bonus (gains, vitesse, absence) et leur plafond : tout équipé au maximum ≈ +41 % de gains.
// Lancer : TZ=Europe/Paris node test/fournil-garderobe.test.js
'use strict';
const G = require('../src/game.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 7, 8, 0); // un mercredi (pas de marché)
const GR = G.GARDEROBE, ids = Object.keys(GR.objets);
const pct = (x) => `${x >= 0 ? '+' : ''}${((x - 1) * 100).toFixed(1).replace('.', ',')} %`;

console.log('── la garde-robe : le contrat ──');
check(JSON.stringify(GR.pieces) === JSON.stringify(['tete', 'haut', 'pieds', 'accessoire']), 'quatre pièces : tete, haut, pieds, accessoire');
check(ids.every((id) => { const o = GR.objets[id]; return o.id === id && typeof o.nom === 'string' && GR.pieces.includes(o.piece) && typeof o.collection === 'string' && o.bonus && typeof o.bonus === 'object' && typeof o.rarete === 'string' && typeof o.forme === 'string'; }), `${ids.length} objets : { nom, piece, collection, bonus, rarete } (+ forme pour la 3D)`);
check(['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'quartier-chaine'].every((id) => GR.objets[id] && GR.objets[id].collection === 'quartier') && ['quartier-or-casquette', 'quartier-or-sweat', 'quartier-or-baskets', 'quartier-or-chaine'].every((id) => GR.objets[id] && GR.objets[id].collection === 'quartier-or'), 'les ids de l’événement : quartier-casquette / sweat / baskets / chaine, et quartier-or-…');
for (const c of ['or', 'argent', 'bronze', 'quartier', 'quartier-or', 'hantee', 'hantee-or']) check(GR.pieces.every((p) => ids.some((id) => GR.objets[id].collection === c && GR.objets[id].piece === p)) && GR.ensembles[c] && GR.ensembles[c].nom && GR.ensembles[c].bonus, `collection « ${c} » : une pièce par emplacement, un ensemble { nom, bonus }`);
check(['toque-blanche', 'tablier-blanc', 'sabots', 'lunettes-rondes'].every((id) => GR.objets[id] && GR.objets[id].collection === 'base' && !Object.keys(GR.objets[id].bonus).length), 'la tenue de base (toque, tablier, sabots, lunettes rondes) : sans bonus');
// « Ma chaîne de boutiques » : la tenue du patron, achetée en jetons de chaîne (src/chaine.js) ; sans bonus ni ensemble (décision du joueur)
check(['chaine-toque', 'chaine-veste', 'chaine-souliers', 'chaine-cles'].map((id) => GR.objets[id] && `${GR.objets[id].piece}:${GR.objets[id].forme}`).join() === 'tete:toque,haut:tablier,pieds:chaussures,accessoire:chaine'
  && ids.filter((id) => GR.objets[id].collection === 'chaine').length === 4 && ['chaine-toque', 'chaine-veste', 'chaine-souliers', 'chaine-cles'].every((id) => !Object.keys(GR.objets[id].bonus).length && GR.objets[id].rarete === 'epique') && !GR.ensembles.chaine,
  'la collection « chaine » (Ma chaîne) : toque à galon, veste de patron, souliers vernis, trousseau de clés ; formes existantes, sans bonus, sans ensemble');

console.log('── l’état neuf, les vieilles sauvegardes ──');
let st = G.newState(T0);
check(st.garderobe && JSON.stringify(st.garderobe.equipe) === JSON.stringify({ tete: 'toque-blanche', haut: 'tablier-blanc', pieds: 'sabots', accessoire: null }) && Object.keys(st.garderobe.objets).length === 4, 'newState : la tenue de base possédée (lunettes rondes comprises) et portée, pas d’accessoire');
const b0 = G.bonusGardeRobe(st);
check(b0.gainsTous === 1 && b0.vitesse === 1 && b0.absenceH === 0 && !Object.keys(b0.gains).length, 'sans rien : bonus neutre (gains ×1, vitesse ×1, +0 h)');
check(G.heuresAbsence(st) === G.ABSENCE_MAX_H && G.tempsMult(st) === 1, 'économie intacte : 8 h d’absence, temps de cuisson ×1');
{ const vieux = G.newState(T0); delete vieux.garderobe; const g = G.garderobe(vieux); check(g.equipe.tete === 'toque-blanche' && g.objets.sabots && G.bonusGardeRobe(vieux).gainsTous === 1, 'une sauvegarde sans garde-robe : la tenue de base apparaît'); }
{ const s = G.newState(T0); s.garderobe = { objets: { 'or-toque': { niv: 9 }, bidule: { niv: 1 } }, equipe: { tete: 'or-tablier', haut: 'or-toque', pieds: 'quartier-baskets', accessoire: 'lunettes-rondes' } }; const g = G.garderobe(s);
  check(!g.objets.bidule && g.objets['or-toque'].niv === 5 && g.equipe.tete === 'toque-blanche' && g.equipe.haut === 'tablier-blanc' && g.equipe.pieds === 'sabots' && g.equipe.accessoire === 'lunettes-rondes' && g.objets.sabots, 'une sauvegarde abîmée : id inconnu retiré, niveau borné à 5, pièce au mauvais emplacement ou pas possédée → la base'); }

console.log('── donner, porter ──');
st = G.newState(T0);
let r = G.donnerVetement(st, 'quartier-casquette');
check(r.nouveau === true && r.objet.nom === 'Casquette du quartier' && st.garderobe.objets['quartier-casquette'].niv === 1 && st.stats.vetements === 1, 'donnerVetement : { nouveau: true, objet }, niveau 1, comptée');
check(G.donnerVetement(st, 'quartier-casquette').nouveau === false && G.donnerVetement(st, 'nimporte').nouveau === false && G.donnerVetement(st, 'nimporte').objet === null && st.stats.vetements === 1, 'déjà possédée ou inconnue : { nouveau: false }');
check(st.garderobe.equipe.tete === 'toque-blanche', 'une pièce donnée n’est pas portée d’office');
check(!G.equiper(st, 'haut', 'quartier-casquette').ok && !G.equiper(st, 'tete', 'or-toque').ok && !G.equiper(st, 'chapeau', 'quartier-casquette').ok, 'porter : refusé au mauvais emplacement, pas possédée, emplacement inconnu');
r = G.equiper(st, 'tete', 'quartier-casquette');
check(r.ok && st.garderobe.equipe.tete === 'quartier-casquette' && G.tenueBoulanger(st).tete.forme === 'casquette' && G.tenueBoulanger(st).tete.metal === 'quartier', 'porter la casquette : la 3D la voit (forme casquette, métal quartier)');
check(G.equiper(st, 'tete', null).ok && st.garderobe.equipe.tete === 'toque-blanche' && G.equiper(st, 'accessoire', 'lunettes-rondes').ok && G.equiper(st, 'accessoire', null).ok && st.garderobe.equipe.accessoire === null, 'null : la pièce de base (tête), rien (accessoire)');
check(G.donnerCollection(st, 'argent').length === 4 && G.donnerCollection(st, 'argent').length === 0 && G.equiperCollection(st, 'argent') === 4 && G.ensembleComplet(st) === 'argent' && G.toqueMetal(st) === 'argent', 'donnerCollection / equiperCollection : les quatre pièces d’argent d’un coup, l’ensemble est complet, la toque vue des autres est d’argent');
check(G.equiper(st, 'tete', 'quartier-casquette').ok && G.ensembleComplet(st) === null && G.toqueMetal(st) === null, 'une pièce d’une autre collection : plus d’ensemble, plus de toque de podium');
const bm = G.bonusGardeRobe(st);
check(Math.abs(bm.gainsTous - 1.025) < 1e-6 && Math.abs(bm.gains.painchoc - 1.08) < 1e-6 && Math.abs(bm.vitesse - 0.985) < 1e-6 && bm.absenceH === 0.5, 'bonus mêlés au niveau 1 : tablier d’argent +2,5 % tout, casquette pains au chocolat +8 %, chaussures 1,5 % plus vite, foulard +0,5 h');
check(Math.abs(G.garderobeMult(st, 2) - 1.025 * 1.08) < 1e-6 && Math.abs(G.garderobeMult(st, 0) - 1.025) < 1e-6, 'garderobeMult : le produit visé cumule le bonus général et le sien');

console.log('── améliorer en étoiles ──');
st = G.newState(T0); G.donnerCollection(st, 'or'); st.etoiles = 0;
r = G.ameliorerVetement(st, 'or-toque');
check(!r.ok && r.cout === 1 && G.coutVetement(st, 'or-toque') === 1, 'sans étoile : refusé, le niveau 2 coûte 1 étoile');
st.etoiles = 10; const couts = [];
while ((r = G.ameliorerVetement(st, 'or-toque')).ok) couts.push(r.cout);
check(JSON.stringify(couts) === JSON.stringify([1, 1, 2, 2]) && st.etoiles === 4 && G.niveauVetement(st, 'or-toque') === 5 && r.max === true && G.coutVetement(st, 'or-toque') === 0 && st.stats.etoilesCousues === 6, 'niveaux 2, 3, 4, 5 : 1, 1, 2, 2 étoiles (6 en tout), puis « max » ; les étoiles dépensées ne comptent plus');
check(JSON.stringify(G.bonusPiece('or-toque', 1)) === JSON.stringify({ gains: { produit: null, pct: 3 } }) && G.bonusPiece('or-toque', 5).gains.pct === 9 && G.bonusPiece('or-foulard', 5).absence === 1.5 && G.bonusPiece('or-chaussures', 3).vitesse === 4, 'le bonus grandit : ×1, 1,5, 2, 2,5, 3 (toque d’or +3 % → +9 %, foulard +0,5 h → +1,5 h)');
check(!G.ameliorerVetement(st, 'quartier-sweat').ok && !G.ameliorerVetement(st, 'rien').ok, 'pas possédée ou inconnue : refusé');
check(JSON.stringify(G.texteBonus(G.bonusPiece('quartier-casquette', 2))) === JSON.stringify(['Pains au chocolat +12 %']) && JSON.stringify(G.texteBonus(GR.ensembles.or.bonus)) === JSON.stringify(['Tous les gains +8 %', 'Cuisson 3 % plus rapide', '+1 h d’absence']), 'les textes des bonus');

console.log('── l’équilibre : tout équipé au maximum ──');
// une boutique avec ses huit apprentis : les gains par seconde, avec et sans tenue, à partir du même état
function boutique() { const s = G.newState(T0); s.stations.forEach((x) => { x.niv = 60; x.staff = true; x.actif = true; }); s.etoiles = 0; return s; }
const ref = boutique(), tauxRef = G.tauxBase(ref), absRef = G.heuresAbsence(ref);
const mesures = {};
for (const c of ['or', 'argent', 'bronze', 'quartier', 'quartier-or', 'hantee', 'hantee-or']) {
  const s = boutique(); G.donnerCollection(s, c); G.equiperCollection(s, c); s.etoiles = 1000;
  for (const v of Object.values(GR.objets)) if (v.collection === c) while (G.ameliorerVetement(s, v.id).ok);
  s.etoiles = 0; // les étoiles ont payé les niveaux : on compare à étoiles égales
  const b = G.bonusGardeRobe(s), taux = G.tauxBase(s) / tauxRef, painchoc = G.revenuBase(s, 2) / G.temps(s, 2) / (G.revenuBase(ref, 2) / G.temps(ref, 2)), tarte = G.revenuBase(s, 3) / G.temps(s, 3) / (G.revenuBase(ref, 3) / G.temps(ref, 3));
  mesures[c] = { taux, painchoc, tarte, absence: G.heuresAbsence(s) - absRef, vitesse: b.vitesse };
  console.log(`       ${c.padEnd(12)} gains/s ${pct(taux)} · pains au chocolat ${pct(painchoc)} · cuisson ×${b.vitesse} · absence +${mesures[c].absence} h · ensemble ${G.ensembleComplet(s)}`);
}
check(mesures.or.taux > 1.38 && mesures.or.taux < 1.45, `la tenue d’or au maximum : ${pct(mesures.or.taux)} de gains par seconde (visé +30 à +50 %)`);
check(mesures['quartier-or'].taux > 1.38 && mesures['quartier-or'].taux < 1.45 && mesures.argent.taux > 1.28 && mesures.argent.taux < 1.35 && mesures.bronze.taux > 1.18 && mesures.bronze.taux < 1.28, `quartier en or ${pct(mesures['quartier-or'].taux)}, argent ${pct(mesures.argent.taux)}, bronze ${pct(mesures.bronze.taux)}`);
check(mesures.quartier.taux > 1.18 && mesures.quartier.taux < 1.28 && mesures.quartier.painchoc > 1.45 && mesures.quartier.painchoc < 1.6, `quartier ${pct(mesures.quartier.taux)} en tout, pains au chocolat ${pct(mesures.quartier.painchoc)}`);
check(mesures.or.absence === 2.5 && mesures.quartier.absence === 2.5 && mesures.bronze.absence === 2, 'absence : +2,5 h (or, quartier), +2 h (bronze) au maximum');
check(Math.abs(mesures['hantee-or'].taux - mesures['quartier-or'].taux) < 1e-9 && mesures.hantee.taux > 1.18 && mesures.hantee.taux < 1.28 && mesures.hantee.tarte > 1.45 && mesures.hantee.tarte < 1.6 && mesures.hantee.absence === 2.5,
  `Halloween : en or ${pct(mesures['hantee-or'].taux)} (comme le quartier en or), la tenue ${pct(mesures.hantee.taux)} en tout, tartes aux pommes ${pct(mesures.hantee.tarte)}, +2,5 h d’absence`);
check(['hantee-chapeau', 'hantee-cape', 'hantee-bottes', 'hantee-lanterne'].map((id) => GR.objets[id].forme).join() === 'chapeau,cape,bottes,lanterne' && ['hantee-or-chapeau', 'hantee-or-cape', 'hantee-or-bottes', 'hantee-or-lanterne'].every((id) => GR.objets[id].collection === 'hantee-or') && GR.ensembles.hantee.nom === 'Tenue d’Halloween',
  'les ids d’Halloween (hantee-chapeau / cape / bottes / lanterne, et hantee-or-…), leurs formes pour persos.js : chapeau, cape, bottes, lanterne');
{ // le mélange des meilleures pièces de collections différentes ne fait pas mieux qu'un ensemble : le plafond reste +41 %
  const s = boutique(); for (const c of ['or', 'quartier-or', 'quartier', 'hantee', 'hantee-or']) G.donnerCollection(s, c); s.etoiles = 1000;
  for (const v of Object.values(GR.objets)) if (s.garderobe.objets[v.id]) while (G.ameliorerVetement(s, v.id).ok);
  s.etoiles = 0; let best = 0; const pieces = (p) => Object.values(GR.objets).filter((v) => v.piece === p && s.garderobe.objets[v.id]);
  for (const a of pieces('tete')) for (const b of pieces('haut')) for (const c of pieces('pieds')) for (const d of pieces('accessoire')) { G.equiper(s, 'tete', a.id); G.equiper(s, 'haut', b.id); G.equiper(s, 'pieds', c.id); G.equiper(s, 'accessoire', d.id); best = Math.max(best, G.tauxBase(s) / tauxRef); }
  check(best <= mesures.or.taux + 1e-9 && best < 1.5, `toutes les combinaisons possédées : au mieux ${pct(best)}, jamais plus que l’ensemble d’or`); }
check(G.tauxBase(ref) === tauxRef && G.heuresAbsence(ref) === absRef, 'l’état de référence n’a pas bougé (le cache des bonus est propre à chaque garde-robe)');
{ // le cache suit les changements faits par l'API
  const s = boutique(); G.donnerCollection(s, 'bronze'); const t1 = G.tauxBase(s); G.equiperCollection(s, 'bronze'); const t2 = G.tauxBase(s); s.etoiles = 5; G.ameliorerVetement(s, 'bronze-toque'); const t3 = G.tauxBase(s); G.equiper(s, 'tete', null); const t4 = G.tauxBase(s);
  check(t1 === tauxRef && t2 > t1 && t3 > t2 && t4 < t3 && t4 > t1, 'porter, améliorer, enlever : les gains suivent aussitôt'); }
{ // la clé de la tenue pour la scène, et celle de la page
  const s = G.newState(T0); const k0 = G.tenueBoulanger(s).cle, c0 = G.garderobeCle(s); G.donnerVetement(s, 'quartier-chaine'); const c1 = G.garderobeCle(s); G.equiper(s, 'accessoire', 'quartier-chaine');
  check(k0 === 'toque-blanche|tablier-blanc|sabots|' && G.tenueBoulanger(s).cle === 'toque-blanche|tablier-blanc|sabots|quartier-chaine' && c1 !== c0 && G.garderobeCle(s) !== c1 && G.tenueBoulanger(s).accessoire.forme === 'chaine', 'tenueBoulanger.cle change avec ce qui est porté, garderobeCle avec tout ce qui bouge'); }
{ // l'absence : les heures en plus se paient vraiment
  const s = boutique(); G.donnerCollection(s, 'or'); G.equiperCollection(s, 'or'); s.lastSeen = T0; const a = G.absence(s, T0 + 24 * 3600e3); const s2 = boutique(); s2.lastSeen = T0; const a2 = G.absence(s2, T0 + 24 * 3600e3);
  check(a.secs === (G.ABSENCE_MAX_H + 1.5) * 3600 && a2.secs === G.ABSENCE_MAX_H * 3600 && a.total > a2.total, `une nuit d’absence : ${a.secs / 3600} h payées en tenue d’or (niveau 1 : foulard +0,5 h, ensemble +1 h) contre ${a2.secs / 3600} h`); }
{ // l'aura phosphorescente et le titre (le 20e palier de la Maison hantée, les acharnés) : à vie, sans bonus ; l'aura se porte et se retire
  const s = boutique(), t0 = G.tauxBase(s), k0 = G.tenueBoulanger(s).cle;
  check(G.tenueBoulanger(s).aura === null && !/aura/.test(k0) && G.garderobe(s).auras.length === 0 && G.porterAura(s, 'lueur').ok === false, 'au départ : aucune aura (la clé de la tenue est celle d’avant les auras), et on ne porte pas une aura qu’on n’a pas');
  const r1 = G.donnerAura(s, 'lueur'), r2 = G.donnerAura(s, 'lueur');
  check(r1.nouveau && !r2.nouveau && G.tenueBoulanger(s).aura === 'lueur' && G.tenueBoulanger(s).cle === k0 + '|aura:lueur' && G.tauxBase(s) === t0 && G.donnerAura(s, 'arc-en-ciel').aura === null,
    'gagnée : portée d’office, une seule fois ; la clé de la tenue change (la scène rebâtit le boulanger) ; aucun bonus ; une aura inconnue : rien');
  check(G.porterAura(s, null).ok && G.tenueBoulanger(s).aura === null && G.tenueBoulanger(s).cle === k0 && G.garderobe(s).auras.includes('lueur') && G.porterAura(s, 'lueur').ok && G.tenueBoulanger(s).aura === 'lueur', 'retirée (elle reste gagnée), puis remise');
  const vieille = JSON.parse(JSON.stringify(s)); delete vieille.garderobe.auras; delete vieille.garderobe.aura;
  const bidouille = JSON.parse(JSON.stringify(s)); bidouille.garderobe.auras = ['lueur', 'lueur', 'licorne', 3]; bidouille.garderobe.aura = 'licorne';
  check(G.tenueBoulanger(vieille).aura === null && egalAuras(G.garderobe(vieille)) && egalAuras(G.garderobe(bidouille), ['lueur']) && G.garderobe(bidouille).aura === null, 'une sauvegarde d’avant les auras : aucune ; une liste abîmée : remise d’aplomb (sans doublon ni inconnue, rien de porté qu’on n’a pas)');
  const d1 = G.donnerDistinction(s, 'legende-manoir'), d2 = G.donnerDistinction(s, 'legende-manoir');
  check(d1.nouveau && !d2.nouveau && G.distinctions(s).join() === 'legende-manoir' && G.DISTINCTIONS['legende-manoir'].nom === 'Légende du Manoir' && G.donnerDistinction(s, 'roi').distinction === null && G.distinctions(G.newState(T0)).length === 0 && G.distinctions({ distinctions: ['legende-manoir', 'roi'] }).join() === 'legende-manoir',
    'le titre « Légende du Manoir » : gagné une fois, à vie (st.distinctions) ; un titre inconnu : rien'); }
function egalAuras(g, l) { return JSON.stringify(g.auras) === JSON.stringify(l || []); }

console.log(fails ? `${fails} échec(s) sur ${n}` : `Tout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
