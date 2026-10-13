#!/usr/bin/env node
// L'événement « Le Quartier » du Fournil (src/quartier.js, règles pures) : la fenêtre (du mardi 13 oct. 2026 à midi au mardi 27 oct. à midi,
// heure de Paris, heure d'hiver comprise), les jours de Paris, la Planque (produits, postes, apprentis, améliorations, coups de pouce),
// les gains d'absence plafonnés (8 h, au ralenti), les douze paliers donnés une seule fois, la simulation du rythme (assidu → palier 12
// le 11e jour, quotidien → paliers 8-9), l'enveloppe du serveur (le marathon 24 h/24 reste sous la table du SQL), et la réserve de boosts
// de la boulangerie (src/game.js : st.boosts, lancer, multiplicateur, absence). Lancer : TZ=Europe/Paris node test/fournil-quartier.test.js
'use strict';
const fs = require('fs'), path = require('path');
const Q = require('../src/quartier.js'), G = require('../src/game.js');
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const seeded = (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

console.log('── la fenêtre, heure de Paris ──');
check(Q.DEBUT === Date.parse('2026-10-13T12:00:00+02:00'), `début : mardi 13 octobre 2026 à midi, heure d'été (${new Date(Q.DEBUT).toISOString()})`);
check(Q.FIN === Date.parse('2026-10-27T12:00:00+01:00'), `fin : mardi 27 octobre 2026 à midi, heure d'HIVER (le 25, l'heure a changé : ${new Date(Q.FIN).toISOString()})`);
check((Q.FIN - Q.DEBUT) / 3600e3 === 14 * 24 + 1, 'deux semaines, plus l’heure gagnée au changement d’heure');
let f = Q.fenetre(Q.DEBUT - 1);
check(f.avant && !f.ouvert && !f.fini && f.jour === 0 && f.dans === 1 && !f.classement, 'une milliseconde avant : pas encore ouvert');
f = Q.fenetre(Q.DEBUT);
check(f.ouvert && f.jour === 1 && f.reste === Q.FIN - Q.DEBUT && f.classement, 'à midi pile : ouvert, jour 1');
f = Q.fenetre(Date.parse('2026-10-20T08:00:00+02:00'));
check(f.ouvert && f.jour === 8 && f.jours === 15, 'mardi 20 à 8 h : jour 8 sur 15 (les jours de Paris, du 13 au 27)');
f = Q.fenetre(Q.FIN - 1);
check(f.ouvert && f.jour === 15 && f.reste === 1, 'juste avant la fin : jour 15');
f = Q.fenetre(Q.FIN);
check(f.fini && !f.ouvert && f.reste === 0 && f.classement, 'à la fin : fini (le classement de l’événement reste lisible)');
check(!Q.fenetre(Q.CLASSEMENT_JUSQUA).classement && Q.fenetre(Q.CLASSEMENT_JUSQUA - 1).classement, 'l’onglet Événement du classement s’efface deux semaines après la fin');
check(Q.dayKey(Date.parse('2026-10-25T23:30:00Z')) === '2026-10-26' && Q.dayKey(Date.parse('2026-10-24T22:30:00Z')) === '2026-10-25', 'les jours sont ceux de Paris (23 h 30 UTC le 25 = 0 h 30 le 26, heure d’hiver)');

console.log('── l’horloge avancée hors ligne n’ouvre rien avant midi (fenetreSure) ; les billets partent jusqu’à la fin de la grâce ──');
f = Q.fenetreSure(Q.DEBUT + 3600e3, Q.DEBUT - 5 * 3600e3);
check(f.avant && !f.ouvert && f.dans === 5 * 3600e3, 'le téléphone dit 13 h, la dernière heure sûre 7 h : la Planque reste fermée');
check(Q.fenetreSure(Q.DEBUT + 3600e3, Q.DEBUT + 3600e3).ouvert && Q.fenetreSure(Q.DEBUT + 3600e3, null).ouvert, 'heure sûre après midi, ou aucune heure sûre (artefact) : ouvert');
check(Q.fenetreSure(Q.FIN + 1, Q.DEBUT - 1).fini, 'la fin se lit sur le « maintenant » du jeu');
check(!Q.envoiBillets(Q.DEBUT - 1) && Q.envoiBillets(Q.DEBUT) && Q.envoiBillets(Q.FIN + 3599e3) && !Q.envoiBillets(Q.FIN + 3600e3), 'les billets partent de l’ouverture à la fin + 1 h (l’heure de grâce du serveur)');
{ // le même scénario avec la vraie horloge de confiance : dernière heure sûre à 7 h, le téléphone remis à 13 h, hors ligne
  const H = require('../src/horloge.js'); let tel = Q.DEBUT - 5 * 3600e3, perf = 0;
  const m = H.creer({ tel: () => tel, perf: () => perf }); m.noterHeureSure(tel, 0, 'test'); m.demarrer();
  const m2 = H.creer({ tel: () => tel, perf: () => perf }); m2.charger(m.etat()); tel = Q.DEBUT + 3600e3; m2.demarrer();
  check(m2.maintenant() === Q.DEBUT + 3600e3 && Q.fenetre(m2.maintenant()).ouvert && !Q.fenetreSure(m2.maintenant(), m2.etat().sure).ouvert, 'HORLOGE accorde l’avance hors ligne, mais fenetreSure garde la porte fermée');
}

console.log('── la Planque : état, produits, postes ──');
const now0 = Q.DEBUT + 3600e3;
let st = {}, q = Q.etat(st, now0);
check(st.quartier === q && q.billets === 0 && q.total === 0 && q.postes.length === 6 && q.postes[0].niv === 1 && q.postes[1].niv === 0 && !q.majeur && !q.masque, 'un état neuf : zéro billet, l’herbe seule ouverte, porte 18+ fermée, événement visible');
check(Q.PRODUITS.length === 6 && Q.PRODUITS.map((p) => p.id).join() === 'herbe,shit,champis,ecsta,coke,specialite', 'six produits, la Spécialité du quartier en dernier');
check(Q.PRODUITS.every((p) => p.cout > 0 && p.rev > 0 && p.temps > 0 && p.croiss > 1 && p.staff > 0 && p.staffNom && p.poste), 'chaque produit a un prix, un revenu, un temps, un poste et son apprenti');
check(Q.PRODUITS.slice(1).every((p, k) => p.debloquer > Q.PRODUITS[k].debloquer && p.rev > Q.PRODUITS[k].rev), 'les déblocages et les revenus grimpent dans l’ordre');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'quartier.js'), 'utf8');
check(!/dos(age|e)\b|\bmg\b|gramme|recette de fabrication|synth[eé]ti|cuisson de|chauff/i.test(SRC), 'aucune information réelle dans les textes : des noms et des gags seulement');
// acheter, verrou, embaucher, lancer
let r = Q.acheter(q, 1);
check(!r.ok && r.prix === Q.PRODUITS[1].debloquer, 'débloquer le shit sans billets : refusé, le prix est rendu');
r = Q.acheter(q, 2);
check(!r.ok && r.verrou, 'les champis avant le shit : verrouillés');
check(Q.lancer(q, 0) && !Q.lancer(q, 0) && q.postes[0].actif, 'une touche lance l’herbe ; une deuxième ne fait rien tant qu’elle n’est pas vendue');
let out = Q.tick(q, Q.PRODUITS[0].temps, now0 + 1500, () => 0.5);
check(out.ventes.length === 1 && out.ventes[0].i === 0 && q.billets === Q.PRODUITS[0].rev * 1.5 * Q.PRESENCE && q.total === q.billets && !q.postes[0].actif, `la fournée vendue à la main : ${q.billets} € (revenu × 1,5 à la main × ${Q.PRESENCE} en présence du boss)`);
Q.gagner(q, 1e4); q.mode = 10; r = Q.acheter(q, 0);
check(r.ok && r.n === 10 && q.postes[0].niv === 11 && Math.abs(r.prix - Q.coutNiveaux(0, 1, 10)) < 1e-9, 'dix niveaux d’herbe d’un coup, au prix cumulé');
q.mode = 'max'; const avant = q.billets; r = Q.acheter(q, 0);
check(r.ok && r.n === Q.maxNiveaux(0, 11, avant) && q.billets >= 0 && q.billets < Q.coutNiveau(0, q.postes[0].niv), 'Max : autant de niveaux que les billets le permettent');
Q.gagner(q, 1e6); q.mode = 1; r = Q.acheter(q, 1);
check(r.ok && r.deblocage && q.postes[1].niv === 1, 'le shit se débloque une fois les billets là');
r = Q.embaucher(q, 1);
check(r.ok && q.postes[1].staff && q.postes[1].actif && q.stats.embauches === 1, `Charbonneur Dylan embauché (${Q.fmt(r.prix)} €)`);
check(!Q.embaucher(q, 1).ok && !Q.embaucher(q, 3).ok, 'pas deux fois, et pas sans poste ouvert');
check(Q.palierMult(24) === 1 && Q.palierMult(25) === 2 && Q.palierMult(100) === 8 && Q.prochainPalier(26) === 50, 'les paliers des postes doublent les gains à 25, 50, 100…');
r = Q.amelioration(q, 'sachets');
check(r.ok && q.ameliorations.sachets && Q.ameliorationMult(q, 0) === 3 && Q.ameliorationMult(q, 1) === 1, 'Sachets zippés : l’herbe ×3, pas le shit');
check(!Q.amelioration(q, 'sachets').ok && !Q.amelioration(q, 'inconnu').ok, 'une amélioration ne s’achète qu’une fois');
check(Q.tauxParSeconde(q) > 0 && Q.rythme(q) > 0 && Q.tauxParSeconde(q) === Q.tauxBase(q) * Q.PRESENCE, 'le taux par seconde compte les apprentis (en présence du boss) ; le rythme de référence, sans le boss');

console.log('── les coups de pouce ──');
q = Q.etat({}, now0); Q.gagner(q, 1000); Q.acheter(q, 1); Q.embaucher(q, 0);
const T = (s) => now0 + s * 1000;
let ev = Q.lancerEvenement(q, () => 0.5, 'descente');
check(ev.type === 'descente' && ev.n === 12 && ev.enjeu === Math.floor(q.billets * 0.1) && ev.prime > 0, `une descente : 12 touches, enjeu ${ev.enjeu} € (10 % des billets), prime ${ev.prime} €`);
let b0 = q.billets; for (let k = 0; k < 11; k++) r = Q.planquer(q);
check(r.ok && !r.fini && r.taps === 11 && q.ev, 'onze touches : pas encore planqué');
r = Q.planquer(q);
check(r.ok && r.fini && q.ev === null && q.billets === b0 + r.prime && q.stats.descentes === 1, `la douzième : tout est planqué, +${r.prime} €`);
check(!Q.planquer(q).ok, 'sans descente, planquer ne fait rien');
Q.lancerEvenement(q, () => 0.5, 'descente'); b0 = q.billets; const enjeu = q.ev.enjeu;
out = Q.tick(q, 1, T(20), () => 0.5);
check(out.finEv && out.finEv.type === 'descente' && out.fin.saisi === enjeu && q.billets === b0 - enjeu && q.ev === null && q.stats.descentesRatees === 1 && q.stats.saisi === enjeu, `une descente ratée : la police embarque ${enjeu} €`);
q.now = T(21); ev = Q.lancerEvenement(q, () => 0.5, 'grosclient');
check(ev.type === 'grosclient' && ev.n >= 3 && ev.prime > 0 && ev.fait === 0, `un gros client : ${ev.n} ${Q.PRODUITS[ev.i].pl} en 3 min, prime ${Q.fmt(ev.prime)} €`);
check(!Q.livrer(q).ok, 'pas livrable avant d’avoir tout');
{ const i = ev.i, s = q.postes[i]; if (!s.staff) Q.lancer(q, i); for (let k = 0; k < 400 && q.ev && q.ev.fait < q.ev.n; k++) { if (!s.staff && !s.actif) Q.lancer(q, i); Q.tick(q, Q.PRODUITS[i].temps, T(22 + k), () => 0.5); } }
check(q.ev && q.ev.fait >= q.ev.n, 'les unités se cuisent (la commande prête attend sa livraison, même après 3 min)');
b0 = q.billets; r = Q.livrer(q);
check(r.ok && q.billets === b0 + r.prime && q.ev === null && q.stats.grosClients === 1, `livré : +${Q.fmt(r.prime)} €`);
q.now = T(500); ev = Q.lancerEvenement(q, () => 0.5, 'soiree');
check(ev.type === 'soiree' && Q.boostMult(q) === Q.PRESENCE * 2 && Q.revenu(q, 0) === Q.revenuBase(q, 0) * Q.PRESENCE * 2, 'une soirée : toutes les ventes ×2 (en plus du boss)');
out = Q.tick(q, 1, T(500 + 121), () => 0.5);
check(out.finEv && out.finEv.type === 'soiree' && q.stats.soirees === 1 && Q.boostMult(q) === Q.PRESENCE, 'la soirée finit au bout de 2 min');
ev = Q.lancerEvenement(q, () => 0.5, 'scooter'); b0 = q.billets; r = Q.attraper(q);
check(ev.type === 'scooter' && r.ok && q.billets === b0 + r.prime && q.ev === null, `le livreur en scooter : bonus attrapé, +${r.prime} €`);
Q.lancerEvenement(q, () => 0.5, 'scooter'); out = Q.tick(q, 1, q.now + 11000, () => 0.5);
check(out.finEv && out.finEv.type === 'scooter' && !Q.attraper(q).ok, 'pas attrapé en 10 s : reparti');
{ // un coup de pouce tous les 2 à 5 min de jeu, jamais le même deux fois de suite
  const types = [], rnd = seeded(3); q.ev = null; q.evTimer = 1; let t = q.now, dernier = '';
  for (let k = 0; k < 4000 && types.length < 12; k++) { t += 1000; const o = Q.tick(q, 1, t, rnd); if (o.nouvelEv) { check(o.nouvelEv.type !== dernier, `jamais le même deux fois (${dernier} → ${o.nouvelEv.type})`); dernier = o.nouvelEv.type; types.push(o.nouvelEv.type); q.ev = null; q.evTimer = Math.min(q.evTimer, 1); } }
  check(types.length === 12 && new Set(types).size >= 3, `douze coups de pouce tirés : ${[...new Set(types)].join(', ')}`);
  q.ev = null; q.evTimer = 300; const o = Q.tick(q, 1, t + 1000, () => 0.999); check(!o.nouvelEv && q.evTimer === 299, 'entre deux, le minuteur descend seconde par seconde');
}

console.log('── l’absence : 8 h au plus, au ralenti ──');
q = Q.etat({}, now0); Q.gagner(q, 1e5); Q.acheter(q, 1); Q.embaucher(q, 0); Q.embaucher(q, 1); q.lastSeen = now0;
const taux = Q.tauxBase(q);
let abs = Q.absence(q, now0 + 2 * 3600e3);
check(abs.secs === 7200 && Math.abs(abs.total - taux * 7200 * Q.ABSENCE_PART) / abs.total < 0.02 && q.lastSeen === now0 + 2 * 3600e3, `2 h d’absence : ${Q.fmt(abs.total)} € (${Q.ABSENCE_PART * 100} % du rythme, sans le boss)`);
abs = Q.absence(q, q.lastSeen + 30 * 3600e3);
check(abs.secs === 8 * 3600 && Math.abs(abs.total - taux * 8 * 3600 * Q.ABSENCE_PART) / abs.total < 0.02, '30 h d’absence : 8 h payées, pas plus');
abs = Q.absence(q, q.lastSeen - 3600e3);
check(abs.secs === 0 && abs.total === 0, 'une heure dans le passé (horloge reculée) : rien');
{ Q.lancerEvenement(q, () => 0.5, 'descente'); const b = q.billets; Q.absence(q, q.lastSeen + 60e3); check(q.ev === null && q.billets >= b, 'une descente en cours est oubliée pendant l’absence, sans rien saisir'); }
{ const s = q.postes[1]; q.postes[1].staff = false; q.postes[1].actif = true; q.postes[1].prog = 0; const b = q.billets; Q.absence(q, q.lastSeen + 3600e3); check(!s.actif && q.billets > b, 'une fournée à la main lancée avant de partir se termine pendant l’absence'); }

console.log('── les douze paliers, une seule fois ──');
check(Q.PALIERS.length === 12 && Q.PALIERS.every((p, k) => p.n === k + 1 && (k === 0 || p.total > Q.PALIERS[k - 1].total)), 'douze paliers croissants');
check(Q.PALIERS.filter((p) => p.vetement).map((p) => p.vetement).join() === Q.VETEMENTS.join() && Q.PALIERS[11].vetement === 'quartier-chaine', 'les quatre vêtements du quartier aux paliers 3, 6, 9 et 12 : l’ensemble complet au 12e');
check(Q.PALIERS.filter((p) => p.deco).map((p) => p.deco).join() === 'graffiti,neon,scooter,chien', 'les quatre décos : graffiti, néon, scooter, chien');
check(Q.PALIERS.reduce((s, p) => s + (p.etoiles || 0), 0) === 8 && Q.PALIERS.filter((p) => p.boost).length === 5, '8 étoiles et 5 boosts en tout (bonus modérés pour la boulangerie)');
check(Q.PALIERS.every((p) => Q.phrasePalier(p).length > 3), 'chaque palier se décrit en une ligne');
q = Q.etat({}, now0);
check(Q.paliersDus(q).length === 0 && Q.reputationMult(q) === 1 && Q.marquerPalier(q, 1) === null, 'rien à réclamer à zéro ; un palier pas atteint ne se marque pas');
Q.gagner(q, Q.PALIERS[1].total);
check(Q.paliersDus(q).map((p) => p.n).join() === '1,2' && Q.reputationMult(q) === Q.REPUTATION * Q.REPUTATION, 'au 2e seuil : les paliers 1 et 2 sont dus ; la réputation du quartier ×1,5²');
let p = Q.marquerPalier(q, 1);
check(p && p.n === 1 && q.paliers.join() === '1' && q.etoiles === 1 && q.boosts === 1 && Q.paliersDus(q).map((p) => p.n).join() === '2', 'le palier 1 réclamé : une étoile, un boost notés ; reste le 2');
check(Q.marquerPalier(q, 1) === null && q.etoiles === 1, 'une seule fois');
Q.marquerPalier(q, 2); check(q.decos.join() === 'graffiti' && Q.paliersDus(q).length === 0, 'le palier 2 : le graffiti');
Q.gagner(q, 1e15); Q.PALIERS.forEach((p) => Q.marquerPalier(q, p.n));
check(q.paliers.length === 12 && q.vetements.join() === Q.VETEMENTS.join() && Q.ensembleComplet(q) && q.decos.length === 4 && q.etoiles === 8 && q.boosts === 5, 'tout en haut : les 12 paliers, les 4 vêtements (ensemble complet), les 4 décos, 8 étoiles, 5 boosts');
out = Q.tick(q, 1, now0 + 1000, () => 0.5);
check(out.paliers.length === 0, 'le pas de jeu ne redonne rien');

console.log('── le rythme simulé ──');
const S = {}; for (const prof of ['assidu', 'quotidien', 'occasionnel', 'marathon']) S[prof] = Q.simuler(prof, 14);
const jourDe = (prof, n) => S[prof].paliersJour[n] || Infinity; // Infinity : jamais atteint en 14 jours
console.log('  ' + Object.keys(S).map((k) => `${k} : ${Q.fmt(S[k].total)} €, paliers ${JSON.stringify(S[k].paliersJour)}`).join('\n  '));
check(jourDe('assidu', 12) >= 9 && jourDe('assidu', 12) <= 12, `l’assidu (80 min par jour) franchit le palier 12 le ${jourDe('assidu', 12)}e jour (visé : 10e-11e)`);
check(jourDe('quotidien', 8) <= 14 && jourDe('quotidien', 9) <= 14 && jourDe('quotidien', 11) > 14, `le quotidien (36 min par jour) atteint les paliers 8 (${jourDe('quotidien', 8)}e jour) et 9 (${jourDe('quotidien', 9)}e), pas le 11e`);
check(jourDe('occasionnel', 5) <= 14 && jourDe('occasionnel', 9) > 14, `l’occasionnel (17 min) passe le palier 5 (${jourDe('occasionnel', 5)}e jour), reste sous le 9e`);
check(S.assidu.total > S.quotidien.total && S.quotidien.total > S.occasionnel.total && S.marathon.total > S.assidu.total, 'plus on joue, plus on gagne : marathon > assidu > quotidien > occasionnel');
check(S.assidu.parJour.every((d, k) => k === 0 || d.total >= S.assidu.parJour[k - 1].total) && S.assidu.q.stats.descentes > 0 && S.assidu.q.stats.grosClients > 0, 'les totaux ne reculent jamais ; les coups de pouce ont joué');
check(Q.simuler('assidu', 14, { graine: 7 }).total === S.assidu.total, 'la simulation est déterministe (graine)');
// l'enveloppe du serveur : la table du SQL (log10 des billets par jour depuis le début) reste au-dessus du marathon 24 h/24, avec marge
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-classement.sql'), 'utf8');
const mTable = /fournil_quartier_table\(\)[\s\S]*?select '\{([-\d.,]+)\}'::double precision\[\]/.exec(SQL);
const table = mTable ? mTable[1].split(',').map(Number) : null;
check(table && table.length === 15, `le SQL porte la table de l’enveloppe du quartier, un log10 par jour de 0 à 14 (${table ? table.join(', ') : 'absente'})`);
if (table) {
  const marge = S.marathon.parJour.map((d, k) => table[k + 1] - Math.log10(d.total));
  check(marge.every((m) => m >= Math.log10(2)) && table.every((v, k) => k === 0 || v >= table[k - 1]), `au-dessus du marathon d’au moins ×2 chaque jour (marges ×${marge.map((m) => Math.pow(10, m).toFixed(1)).join(', ×')}), et croissante`);
  check(marge.every((m) => m <= 1.3), 'mais pas plus de ×20 : un tricheur ne s’envole pas');
}

console.log('── la réserve de boosts de la boulangerie (src/game.js) ──');
st = G.newState(now0);
check(st.boosts && Array.isArray(st.boosts.reserve) && st.boosts.reserve.length === 0 && st.boosts.actif === null, 'un état neuf : une réserve vide, aucun boost en cours');
r = G.donnerBoostReserve(st, 2, 1800);
check(r && st.boosts.reserve.length === 1 && st.boosts.reserve[0].mult === 2 && st.boosts.reserve[0].secs === 1800, 'un boost ×2 de 30 min arrive en réserve');
G.donnerBoostReserve(st, 5, 900);
check(st.boosts.reserve.length === 2 && G.boostMult(st) === 1, 'un second ×5 ; tant qu’on ne lance rien, les gains ne bougent pas');
st.now = now0; r = G.lancerBoostReserve(st, 1);
check(r.ok && r.boost.mult === 5 && st.boosts.actif && st.boosts.actif.mult === 5 && st.boosts.actif.fin === now0 + 900e3 && st.boosts.reserve.length === 1 && G.boostMult(st) === 5, 'lancer le ×5 : il tourne 15 min, la réserve garde le ×2 ; tout ×5');
check(!G.lancerBoostReserve(st, 0).ok && st.boosts.reserve.length === 1, 'pas deux à la fois');
check(G.revenu(st, 0) === G.revenuBase(st, 0) * 5 && G.rythme(st) === G.rythme({ ...st, boosts: { reserve: [], actif: null } }), 'le revenu est ×5, le rythme de référence (objectifs, primes) non');
st.now = now0 + 900e3; G.tick(st, 0.1, st.now);
check(st.boosts.actif === null && G.boostMult(st) === 1, 'au bout de 15 min, il s’éteint');
r = G.lancerBoostReserve(st, 0); st.lastSeen = st.now;
abs = G.absence(st, st.now + 10 * 60e3);
check(st.boosts.actif && st.boosts.actif.mult === 2, 'une absence plus courte que le boost : il continue (les apprentis en profitent)');
abs = G.absence(st, st.now + 3600e3);
check(st.boosts.actif === null, 'une absence qui dépasse sa fin : il s’éteint');
check(!G.lancerBoostReserve(st, 5).ok && !G.lancerBoostReserve(st, -1).ok, 'un rang absent : refusé');
{ const s2 = JSON.parse(JSON.stringify(G.newState(now0))); delete s2.boosts; check(G.boostMult(s2) === 1 && !G.lancerBoostReserve(s2, 0).ok && G.donnerBoostReserve(s2, 2, 60) && s2.boosts.reserve.length === 1, 'une vieille sauvegarde sans réserve marche, et en reçoit une au premier boost'); }
check(G.nouvelleBoutique({ ...G.newState(now0), lifetimeRun: 1e30, boosts: { reserve: [{ mult: 2, secs: 60 }], actif: { mult: 2, fin: now0 + 1 } } }, now0).ok, 'une nouvelle boutique (étoiles) ne casse rien');

console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
process.exit(fails ? 1 : 0);
