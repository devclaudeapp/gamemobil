#!/usr/bin/env node
// L'événement d'Halloween du Fournil, « La Maison hantée » (src/hantee.js, règles pures) : la fenêtre (du mardi 27 oct. 2026 à midi au lundi
// 2 nov. à 20 h, heure de Paris), l'enchaînement avec le Quartier, la fiche (HT.FICHE) et la même forme d'API que src/quartier.js, le Manoir
// (friandises, postes, monstres, Sortilèges, coups de pouce), les gains d'absence plafonnés (8 h, au ralenti), les douze paliers donnés une
// seule fois (étoiles, boosts, décos, tenue d'Halloween, chat noir), le rythme simulé (assidu → palier 12 le dernier jour ou la veille,
// quotidien → 8-9, occasionnel → 5-7), l'enveloppe du serveur (le marathon 24 h/24 reste sous la table de fournil_evts(), avec marge), et la
// longévité (sept jours de marathon sans dérive, sauvegarde relue en route, récompenses distribuées dans la boulangerie de src/game.js).
// Lancer : TZ=Europe/Paris node test/fournil-hantee.test.js
'use strict';
const fs = require('fs'), path = require('path');
const HT = require('../src/hantee.js'), Q = require('../src/quartier.js'), G = require('../src/game.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const seeded = (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

console.log('── la fenêtre, heure de Paris ; l’enchaînement avec le Quartier ──');
check(HT.DEBUT === Date.parse('2026-10-27T12:00:00+01:00'), `début : mardi 27 octobre 2026 à midi, heure d'hiver (${new Date(HT.DEBUT).toISOString()})`);
check(HT.FIN === Date.parse('2026-11-02T20:00:00+01:00'), `fin : lundi 2 novembre 2026 à 20 h (${new Date(HT.FIN).toISOString()})`);
check((HT.FIN - HT.DEBUT) / 3600e3 === 6 * 24 + 8, 'six jours et huit heures');
check(HT.DEBUT === Q.FIN && HT.DEBUT < Q.FIN + Q.GRACE, 'la Maison hantée ouvre à l’instant où le Quartier ferme (son heure de grâce court encore pour les billets)');
let f = HT.fenetre(HT.DEBUT - 1);
check(f.avant && !f.ouvert && !f.fini && f.jour === 0 && f.dans === 1 && !f.classement, 'une milliseconde avant : pas encore ouvert');
f = HT.fenetre(HT.DEBUT);
check(f.ouvert && f.jour === 1 && f.jours === 7 && f.reste === HT.FIN - HT.DEBUT && f.classement, 'à midi pile : ouvert, jour 1 sur 7');
f = HT.fenetre(Date.parse('2026-10-31T23:30:00+01:00'));
check(f.ouvert && f.jour === 5, 'le soir d’Halloween (samedi 31) : jour 5');
f = HT.fenetre(Date.parse('2026-11-02T08:00:00+01:00'));
check(f.ouvert && f.jour === 7, 'lundi 2 novembre au matin : le dernier jour (7)');
f = HT.fenetre(HT.FIN - 1);
check(f.ouvert && f.jour === 7 && f.reste === 1, 'juste avant 20 h : encore ouvert');
f = HT.fenetre(HT.FIN);
check(f.fini && !f.ouvert && f.reste === 0 && f.classement, 'à 20 h : fini (l’onglet Halloween du classement reste lisible)');
check(!HT.fenetre(HT.CLASSEMENT_JUSQUA).classement && HT.fenetre(HT.CLASSEMENT_JUSQUA - 1).classement && HT.CLASSEMENT_JUSQUA === HT.FIN + 14 * 864e5, 'l’onglet Halloween s’efface deux semaines après la fin');
check(Q.fenetre(HT.DEBUT).fini && Q.fenetre(HT.DEBUT).classement && HT.fenetre(HT.DEBUT).ouvert, 'le 27 à midi : le Quartier est fini (son bilan et son podium d’abord), la Maison hantée ouverte');
f = HT.fenetreSure(HT.DEBUT + 3600e3, HT.DEBUT - 5 * 3600e3);
check(f.avant && !f.ouvert && f.dans === 5 * 3600e3, 'le téléphone dit 13 h, la dernière heure sûre 7 h : le Manoir reste fermé');
check(HT.fenetreSure(HT.DEBUT + 3600e3, HT.DEBUT + 3600e3).ouvert && HT.fenetreSure(HT.DEBUT + 3600e3, null).ouvert && HT.fenetreSure(HT.FIN + 1, HT.DEBUT - 1).fini, 'heure sûre après midi, ou aucune (artefact) : ouvert ; la fin se lit sur le « maintenant » du jeu');
check(!HT.envoiBonbons(HT.DEBUT - 1) && HT.envoiBonbons(HT.DEBUT) && HT.envoiBonbons(HT.FIN + 3599e3) && !HT.envoiBonbons(HT.FIN + 3600e3) && HT.envoiBillets === HT.envoiBonbons, 'les bonbons partent de l’ouverture à la fin + 1 h (l’heure de grâce du serveur) ; envoiBillets, le nom du Quartier, est le même');

console.log('── la fiche et la forme de l’API (celle du Quartier) ──');
const F = HT.FICHE;
check(F && F.id === 'hantee' && F.nom === 'La Maison hantée' && F.cle === 'hantee' && F.adulte === false && F.classement.periode === 'hantee' && F.classement.onglet === 'Halloween' && F.classement.evt === 'hantee', 'HT.FICHE : id « hantee », nom, clé de l’état, pas de porte 18+, période et onglet du classement');
check(F.devise.nom === 'bonbons' && F.devise.icone === 'bonbons' && /^<svg[\s\S]*<\/svg>$/.test(F.devise.svg) && !/script|on\w+=/i.test(F.devise.svg), 'la devise : les bonbons, la clé d’icône et un bonbon en SVG (sans script)');
check(Object.values(F.couleurs).every((c) => /^#[0-9A-F]{6}$/i.test(c)) && F.couleurs.citrouille && F.couleurs.nuit, 'les couleurs : des #rrggbb (nuit, citrouille, violet…)');
check(F.produits === HT.PRODUITS && F.paliers === HT.PALIERS && F.ameliorations === HT.AMELIORATIONS && F.dates.debut === HT.DEBUT && F.dates.fin === HT.FIN, 'la fiche pointe sur les mêmes produits, paliers, améliorations et dates');
check(Object.keys(F.evenements).sort().join() === Object.keys(HT.EVENEMENTS).sort().join() && Object.values(F.evenements).every((e) => e.nom && e.annonce && e.fin && typeof e.detail === 'function'), 'chaque coup de pouce a son habillage d’Halloween (nom, annonce, détail, fin), aux clés de mécanique du Quartier');
check(['titre', 'annonceTitre', 'annonce', 'ouvrir', 'fermer', 'bilanTitre', 'bilan', 'palier12', 'paliersNote', 'classementInfo', 'classementFini', 'vide', 'podiumFinal'].every((k) => typeof F.textes[k] === 'string' && F.textes[k].length > 3) && typeof F.textes.absence === 'function' && /bonbons/.test(F.textes.absence('2 h', HT.fmtEur(1200))), 'les textes de l’écran, tous là');
{ const manquants = Object.keys(Q).filter((k) => !(k in HT) || typeof HT[k] !== typeof Q[k]);
  check(manquants.length === 0, `tout ce qu’exporte QUARTIER existe dans HANTEE, du même type${manquants.length ? ' — manquent : ' + manquants.join(', ') : ''}`); }
check(HT.PRODUITS.length === 6 && HT.PRODUITS.map((p) => p.id).join() === 'acidule,pomme,cookie,toile,potion,citrouille', 'six friandises : acidulés, pommes d’amour, cookies fantômes, toiles en sucre, potions fumantes, citrouilles sculptées');
check(HT.PRODUITS.map((p) => p.staffNom.split(' ').slice(-1)[0]).join() === 'fantôme,momie,squelette,Vladimir,sorcière,Lanterne' && HT.PRODUITS.every((p) => p.cout > 0 && p.rev > 0 && p.temps > 0 && p.croiss > 1 && p.staff > 0 && p.staffNom && p.staffDesc && p.poste && p.desc), 'leurs monstres : le fantôme, la momie, le squelette, le vampire (Comte Vladimir), la sorcière, la citrouille-lanterne ; chacun a son poste et sa phrase');
check(HT.PRODUITS.slice(1).every((p, k) => p.debloquer > HT.PRODUITS[k].debloquer && p.rev > HT.PRODUITS[k].rev), 'les déblocages et les revenus grimpent dans l’ordre');
{ const textes = JSON.stringify([F.textes.annonce, F.textes.bilan, F.textes.palier12, F.textes.paliersNote, HT.PRODUITS, HT.PALIERS, HT.AMELIORATIONS, Object.values(F.evenements).map((e) => [e.nom, e.annonce, e.fin]), F.vetements, F.decos]);
  const mots = textes.match(/\b(drogues?|alcools?|bi[eè]res?|vins?|cigarettes?|herbe|shit|coke|ecsta|police|adultes?|sang|tuer|meurtre|couteaux?|armes?|cadavres?|18 ans)\b/gi);
  check(!mots, `tous âges : rien d’adulte ni de sanglant dans les textes${mots ? ' — ' + mots.join(', ') : ''}`); }

console.log('── le Manoir : état, friandises, postes, monstres ──');
const now0 = HT.DEBUT + 3600e3;
let st = {}, q = HT.etat(st, now0);
check(st.hantee === q && q.billets === 0 && q.total === 0 && HT.bonbons(q) === 0 && q.postes.length === 6 && q.postes[0].niv === 1 && q.postes[1].niv === 0 && q.majeur === true && !q.masque && !q.chat, 'un état neuf (st.hantee) : zéro bonbon, les acidulés seuls ouverts, pas de porte (majeur toujours vrai), pas encore de chat noir');
check(!st.quartier && HT.etat(st, now0) === q, 'il vit à côté de st.quartier sans y toucher, et se relit tel quel');
{ const s2 = { hantee: { postes: [{ niv: 3 }], billets: NaN, total: -5, paliers: 'x' } }; const q2 = HT.etat(s2, now0); check(q2.postes.length === 6 && q2.billets === 0 && q2.total === 0 && Array.isArray(q2.paliers) && q2.stats && q2.ameliorations, 'un état abîmé (vieille sauvegarde, champs faux) : remis d’aplomb'); }
let r = HT.acheter(q, 1);
check(!r.ok && r.prix === HT.PRODUITS[1].debloquer, 'débloquer les pommes d’amour sans bonbons : refusé, le prix est rendu');
check(!HT.acheter(q, 2).ok && HT.acheter(q, 2).verrou, 'les cookies avant les pommes : verrouillés');
check(HT.lancer(q, 0) && !HT.lancer(q, 0), 'une touche lance les acidulés ; une deuxième ne fait rien tant qu’ils ne sont pas vendus');
let out = HT.tick(q, HT.PRODUITS[0].temps, now0 + 1500, () => 0.5);
check(out.ventes.length === 1 && q.billets === HT.PRODUITS[0].rev * 1.5 * HT.PRESENCE && q.total === q.billets && !q.postes[0].actif, `la fournée vendue à la main : ${HT.fmtEur(q.billets)} (revenu × 1,5 à la main × ${HT.PRESENCE} en ta présence)`);
HT.gagner(q, 1e4); q.mode = 10; r = HT.acheter(q, 0);
check(r.ok && r.n === 10 && q.postes[0].niv === 11 && Math.abs(r.prix - HT.coutNiveaux(0, 1, 10)) < 1e-9, 'dix niveaux d’un coup, au prix cumulé');
q.mode = 'max'; const avant = q.billets; r = HT.acheter(q, 0);
check(r.ok && r.n === HT.maxNiveaux(0, 11, avant) && q.billets >= 0 && q.billets < HT.coutNiveau(0, q.postes[0].niv), 'Max : autant de niveaux que les bonbons le permettent');
HT.gagner(q, 1e6); q.mode = 1; r = HT.acheter(q, 1);
check(r.ok && r.deblocage && q.postes[1].niv === 1 && /nouvelle friandise/.test(q.carnet[q.carnet.length - 1].txt), 'les pommes d’amour se débloquent (le carnet le note)');
r = HT.embaucher(q, 1);
check(r.ok && q.postes[1].staff && q.postes[1].actif && q.stats.embauches === 1 && !HT.embaucher(q, 1).ok && !HT.embaucher(q, 3).ok, `Ramsès la momie embauchée (${HT.fmtEur(r.prix)}) ; pas deux fois, pas sans poste ouvert`);
r = HT.amelioration(q, 'petillant');
check(r.ok && HT.ameliorationMult(q, 0) === 3 && HT.ameliorationMult(q, 1) === 1 && !HT.amelioration(q, 'petillant').ok && !HT.amelioration(q, 'inconnu').ok, 'le Sortilège « Sucre qui pétille » : acidulés ×3, une seule fois');
check(HT.AMELIORATIONS.length === 10 && HT.AMELIORATIONS.every((a) => a.cible === null || a.cible.every((c) => HT.PRODUITS.some((p) => p.id === c))) && HT.AMELIORATIONS.slice(1).every((a, k) => a.cout > HT.AMELIORATIONS[k].cout), 'dix Sortilèges, de prix croissants, qui visent des friandises qui existent');
check(HT.tauxParSeconde(q) === HT.tauxBase(q) * HT.PRESENCE && HT.rythme(q) > 0, 'le taux par seconde compte les monstres (en ta présence) ; le rythme de référence, sans toi');

console.log('── les coups de pouce (chauves-souris, cortège, pleine lune, balai) ──');
q = HT.etat({}, now0); HT.gagner(q, 1000); HT.acheter(q, 1); HT.embaucher(q, 0);
let ev = HT.lancerEvenement(q, () => 0.5, 'descente');
check(ev.type === 'descente' && ev.n === 12 && ev.enjeu === Math.floor(q.billets * 0.1) && ev.prime > 0 && F.evenements.descente.detail(ev).includes('12 touches'), `une nuée de chauves-souris : 12 touches, enjeu ${ev.enjeu}, prime ${ev.prime}`);
let b0 = q.billets; for (let k = 0; k < 11; k++) r = HT.planquer(q);
check(r.ok && !r.fini && q.ev, 'onze touches : elles tournent encore');
r = HT.chasser(q);
check(r.ok && r.fini && q.ev === null && q.billets === b0 + r.prime && q.stats.descentes === 1 && /Chauves-souris chassées/.test(q.carnet[q.carnet.length - 1].txt), `la douzième (chasser = planquer) : toutes chassées, +${r.prime}`);
HT.lancerEvenement(q, () => 0.5, 'descente'); b0 = q.billets; const enjeu = q.ev.enjeu;
{ const t0 = q.now; out = null; for (let k = 1; k <= 20 && !(out && out.finEv); k++) out = HT.tick(q, 1, t0 + k * 1000, () => 0.5); }
check(out.finEv && out.fin.saisi === enjeu && q.billets === b0 - enjeu && q.stats.descentesRatees === 1, `pas chassées à temps : elles emportent ${enjeu} bonbons`);
{ q.now = now0 + 200e3; HT.lancerEvenement(q, () => 0.5, 'descente'); const b1 = q.billets; const o = HT.tick(q, 0.25, q.now + 600e3, () => 0.5);
  check(!o.finEv && !o.nouvelEv && q.ev === null && q.billets >= b1 && q.evTimer >= 90, 'retour après 10 min hors ligne : rien d’emporté, rien ne surgit tout de suite'); }
q.now = now0 + 5000e3; ev = HT.lancerEvenement(q, () => 0.5, 'grosclient');
check(ev.type === 'grosclient' && ev.n >= 3 && ev.prime > 0 && !HT.livrer(q).ok, `un cortège d’enfants déguisés : ${ev.n} ${HT.PRODUITS[ev.i].pl}, prime ${HT.fmt(ev.prime)} ; pas servi avant d’avoir tout`);
{ const i = ev.i, s = q.postes[i]; for (let k = 0; k < 400 && q.ev && q.ev.fait < q.ev.n; k++) { if (!s.staff && !s.actif) HT.lancer(q, i); HT.tick(q, HT.PRODUITS[i].temps, q.now + 1000, () => 0.5); } }
b0 = q.billets; r = HT.livrer(q);
check(r.ok && q.billets === b0 + r.prime && q.stats.grosClients === 1, `servi : +${HT.fmt(r.prime)}`);
ev = HT.lancerEvenement(q, () => 0.5, 'soiree');
check(HT.boostMult(q) === HT.PRESENCE * 2 && F.evenements.soiree.nom === 'La pleine lune', 'la pleine lune : toutes les ventes ×2');
ev = HT.lancerEvenement(q, () => 0.5, 'scooter'); b0 = q.billets; r = HT.attraper(q);
check(r.ok && q.billets === b0 + r.prime && /balai/.test(q.carnet[q.carnet.length - 1].txt), `le balai de la sorcière : sac attrapé, +${r.prime}`);
{ const types = [], rnd = seeded(3); q.ev = null; q.evTimer = 1; let t = q.now, dernier = '', meme = false;
  for (let k = 0; k < 4000 && types.length < 12; k++) { t += 1000; const o = HT.tick(q, 1, t, rnd); if (o.nouvelEv) { if (o.nouvelEv.type === dernier) meme = true; dernier = o.nouvelEv.type; types.push(dernier); q.ev = null; q.evTimer = Math.min(q.evTimer, 1); } }
  check(types.length === 12 && !meme && new Set(types).size >= 3, `douze coups de pouce tirés, jamais deux fois le même de suite : ${[...new Set(types)].join(', ')}`); }

console.log('── l’absence : 8 h au plus, au ralenti ──');
q = HT.etat({}, now0); HT.gagner(q, 1e5); HT.acheter(q, 1); HT.embaucher(q, 0); HT.embaucher(q, 1); q.lastSeen = now0;
const taux = HT.tauxBase(q);
let abs = HT.absence(q, now0 + 2 * 3600e3);
check(abs.secs === 7200 && Math.abs(abs.total - taux * 7200 * HT.ABSENCE_PART) / abs.total < 0.02, `2 h d’absence : ${HT.fmtEur(abs.total)} (${HT.ABSENCE_PART * 100} % du rythme)`);
abs = HT.absence(q, q.lastSeen + 30 * 3600e3);
check(abs.secs === 8 * 3600, '30 h d’absence : 8 h payées, pas plus');
abs = HT.absence(q, q.lastSeen - 3600e3);
check(abs.secs === 0 && abs.total === 0, 'une heure dans le passé (horloge reculée) : rien');

console.log('── les douze paliers, une seule fois ──');
check(HT.PALIERS.length === 12 && HT.PALIERS.every((p, k) => p.n === k + 1 && (k === 0 || p.total > HT.PALIERS[k - 1].total)), 'douze paliers croissants');
check(HT.PALIERS.filter((p) => p.vetement).map((p) => `${p.n}:${p.vetement}`).join() === '3:hantee-chapeau,6:hantee-cape,9:hantee-bottes,12:hantee-lanterne' && HT.VETEMENTS.join() === 'hantee-chapeau,hantee-cape,hantee-bottes,hantee-lanterne', 'la tenue d’Halloween aux paliers 3, 6, 9 et 12 (chapeau pointu, cape, bottes, citrouille-lanterne)');
check(HT.PALIERS.filter((p) => p.deco).map((p) => `${p.n}:${p.deco}`).join() === '2:citrouilles,5:toiles,8:chaudron' && HT.DECOS.join() === 'citrouilles,toiles,chaudron', 'les trois décos : citrouilles, toiles d’araignée, chaudron');
check(HT.PALIERS.filter((p) => p.chat).map((p) => `${p.n}:${p.chat}`).join() === '4:noir', 'le chat noir au palier 4');
check(HT.PALIERS.reduce((s, p) => s + (p.etoiles || 0), 0) === 8 && HT.PALIERS.filter((p) => p.boost).length === 5, '8 étoiles et 5 boosts en tout, comme au Quartier');
check(HT.PALIERS.every((p) => HT.phrasePalier(p).length > 3) && /chat noir/.test(HT.phrasePalier(HT.PALIERS[3])), 'chaque palier se décrit en une ligne');
check(HT.VETEMENTS.concat(HT.VETEMENTS_OR).every((id) => G.vetement(id) && G.vetement(id).collection === (id.startsWith('hantee-or') ? 'hantee-or' : 'hantee')) && HT.VETEMENTS.every((id) => F.vetements[id] && F.vetements[id].forme === G.vetement(id).forme), 'chaque pièce existe dans la garde-robe de src/game.js (collections hantee et hantee-or), de la forme que dit la fiche');
q = HT.etat({}, now0);
check(HT.paliersDus(q).length === 0 && HT.reputationMult(q) === 1 && HT.marquerPalier(q, 1) === null, 'rien à réclamer à zéro');
HT.gagner(q, HT.PALIERS[3].total);
check(HT.paliersDus(q).map((p) => p.n).join() === '1,2,3,4' && HT.reputationMult(q) === Math.pow(HT.REPUTATION, 4), 'au 4e seuil : quatre paliers dus, la réputation du Manoir ×1,5⁴');
let p = HT.marquerPalier(q, 4);
check(p && p.n === 4 && q.chat === true && q.etoiles === 1 && HT.marquerPalier(q, 4) === null, 'le palier 4 réclamé : le chat noir noté, une étoile ; une seule fois');
HT.gagner(q, 1e15); HT.PALIERS.forEach((x) => HT.marquerPalier(q, x.n));
check(q.paliers.length === 12 && HT.ensembleComplet(q) && q.decos.length === 3 && q.etoiles === 8 && q.boosts === 5 && HT.tick(q, 1, now0 + 1000, () => 0.5).paliers.length === 0, 'tout en haut : 12 paliers, la tenue complète, 3 décos, 8 étoiles, 5 boosts ; le pas de jeu ne redonne rien');

console.log('── le rythme simulé (sept jours de Paris) ──');
const S = {}; for (const prof of ['assidu', 'quotidien', 'occasionnel', 'marathon']) S[prof] = HT.simuler(prof);
const jourDe = (prof, k) => S[prof].paliersJour[k] || Infinity;
const haut = (s) => Math.max(0, ...Object.keys(s.paliersJour).map(Number));
console.log('  ' + Object.keys(S).map((k) => `${k} : ${HT.fmtEur(S[k].total)}, paliers ${JSON.stringify(S[k].paliersJour)}`).join('\n  '));
check(S.assidu.parJour.length === 7 && jourDe('assidu', 12) >= 6 && jourDe('assidu', 12) <= 7 && jourDe('assidu', 11) >= 5, `l’assidu (80 min par jour) franchit le palier 12 le ${jourDe('assidu', 12)}e jour sur 7 (visé : le dernier jour ou la veille), le 11e le ${jourDe('assidu', 11)}e`);
check(haut(S.quotidien) >= 8 && haut(S.quotidien) <= 10 && jourDe('quotidien', 12) === Infinity, `le quotidien (36 min par jour) monte jusqu’au palier ${haut(S.quotidien)} (le ${jourDe('quotidien', haut(S.quotidien))}e jour), pas au 12e`);
check(haut(S.occasionnel) >= 5 && haut(S.occasionnel) <= 7, `l’occasionnel (17 min par jour) monte jusqu’au palier ${haut(S.occasionnel)}`);
check(S.marathon.total > S.assidu.total && S.assidu.total > S.quotidien.total && S.quotidien.total > S.occasionnel.total, 'plus on joue, plus on gagne : marathon > assidu > quotidien > occasionnel');
check(S.assidu.parJour.findIndex((d) => d.niv.every((x) => x > 0)) <= 2 && S.assidu.parJour[3].staff === 6, `l’assidu ouvre les six friandises dès le ${S.assidu.parJour.findIndex((d) => d.niv.every((x) => x > 0)) + 1}e jour et a ses six monstres au 4e`);
check(S.assidu.parJour.every((d, k) => k === 0 || d.total >= S.assidu.parJour[k - 1].total) && S.assidu.q.stats.descentes > 0 && S.assidu.q.stats.grosClients > 0 && S.assidu.q.stats.scooters > 0, 'les totaux ne reculent jamais ; les coups de pouce ont joué');
check(HT.simuler('assidu', 7, { graine: 7 }).total === S.assidu.total, 'la simulation est déterministe (graine)');
{ const res = []; let ok = true; for (let g = 1; g <= 8; g++) { const s = HT.simuler('assidu', 7, { graine: g }), j = s.paliersJour[12] || Infinity; res.push(j); if (!(j >= 6 && j <= 7)) ok = false; }
  check(ok, `et quel que soit le hasard des coups de pouce (8 graines) : palier 12 les jours ${res.join(', ')}`); }

console.log('── l’enveloppe du serveur (fournil_evts, version 5 du SQL) ──');
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-classement.sql'), 'utf8');
const mEvt = /values \('hantee'::text, '([^']+)'::timestamptz, '([^']+)'::timestamptz, ([\d.]+)::double precision,\s*'\{([-\d.,]+)\}'::double precision\[\]\)/.exec(SQL);
check(!!mEvt, 'le SQL déclare l’événement « hantee » dans fournil_evts() (fenêtre, pas, table)');
if (mEvt) {
  const parisSQL = (txt) => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):00:00 Europe\/Paris$/.exec(txt); return m ? HT.parisMs(+m[1], +m[2], +m[3], +m[4]) : NaN; };
  check(parisSQL(mEvt[1]) === HT.DEBUT && parisSQL(mEvt[2]) === HT.FIN, `la fenêtre du SQL est celle du jeu (${mEvt[1]} → ${mEvt[2]})`);
  const pasJ = Number(mEvt[3]) / 24, table = mEvt[4].split(',').map(Number);
  check(table.length >= Math.ceil((HT.FIN - HT.DEBUT) / 864e5 / pasJ) + 1 && table.every((v, k) => k === 0 || v >= table[k - 1]), `une table croissante qui couvre toute la fenêtre (${table.length} valeurs, un pas de ${mEvt[3]} h)`);
  const borne = (t) => { const j = Math.min(t / pasJ, table.length - 1), k = Math.floor(j); return k >= table.length - 1 ? table[table.length - 1] : table[k] + (table[k + 1] - table[k]) * (j - k); }; // log10, t en jours depuis l'ouverture
  let minM = Infinity, maxM = -Infinity;
  for (const g of [7, 1, 2, 3]) { const s = g === 7 ? S.marathon : HT.simuler('marathon', 7, { graine: g });
    for (const x of s.trace) if (x.total > 0) { const m = borne(x.t) - Math.log10(x.total); minM = Math.min(minM, m); if (x.t > 0.25) maxM = Math.max(maxM, m); } }
  check(minM >= Math.log10(2), `le marathon 24 h/24 (quatre graines, minute par minute) reste sous l’enveloppe avec au moins ×2 de marge (×${Math.pow(10, minM).toFixed(2)} au plus juste)`);
  check(maxM <= Math.log10(20), `mais pas plus de ×20 après les six premières heures (×${Math.pow(10, maxM).toFixed(1)} au plus large) : un tricheur ne s’envole pas`);
  check(S.assidu.trace.every((x) => x.total === 0 || borne(x.t) - Math.log10(x.total) >= 1), 'un assidu honnête est toujours au moins dix fois sous l’enveloppe');
}

console.log('── la longévité : sept jours de marathon, une sauvegarde relue en route, la boulangerie récompensée ──');
{ const s = S.marathon, qq = s.q;
  const finis = (o) => Object.values(o).every((v) => (typeof v === 'number' ? Number.isFinite(v) : true));
  check(Number.isFinite(qq.total) && qq.total < 1e24 && qq.billets >= 0 && qq.postes.every((x) => finis(x) && x.niv >= 0) && finis(qq.stats), `au bout du marathon : ${HT.fmtEur(qq.total)}, tout reste fini, sous le plafond du serveur (1e24)`);
  check(s.trace.every((x, k) => k === 0 || x.total >= s.trace[k - 1].total) && qq.carnet.length <= 12, 'le total ne recule jamais ; le carnet reste court (12 lignes)');
  check(HT.fmt(qq.total).length <= 10 && HT.fmt(1e30).length <= 10 && HT.fmtEur(1) === '1 bonbon' && HT.fmtEur(2) === '2 bonbons' && /bonbons$/.test(HT.fmtEur(qq.total)), `les formats tiennent (« ${HT.fmtEur(qq.total)} », « ${HT.fmt(1e30)} »)`); }
{ // une sauvegarde relue en route (JSON, comme le jeu) : la partie continue exactement pareil
  const rnd1 = seeded(11); const s1 = {}, q1 = HT.etat(s1, now0); HT.gagner(q1, 5e5); HT.acheter(q1, 1); HT.embaucher(q1, 0); HT.embaucher(q1, 1); q1.mode = 10;
  let t = now0; for (let k = 0; k < 600; k++) { t += 1000; HT.tick(q1, 1, t, rnd1); if (k % 10 === 0) HT.decider(q1); if (q1.ev && q1.ev.type === 'descente') HT.planquer(q1); }
  const s2 = JSON.parse(JSON.stringify(s1)), q2 = HT.etat(s2, t); // la sauvegarde, relue
  const rA = seeded(5), rB = seeded(5); // puis le même hasard pour les deux
  for (let k = 0; k < 900; k++) { t += 1000; HT.tick(q1, 1, t, rA); HT.tick(q2, 1, t, rB); if (k % 10 === 0) { HT.decider(q1); HT.decider(q2); } }
  check(q1.total === q2.total && JSON.stringify(q1.postes) === JSON.stringify(q2.postes), `relue de sa sauvegarde, la partie suit exactement la même route (${HT.fmtEur(q1.total)})`); }
{ // les récompenses des douze paliers distribuées dans la boulangerie (ce que fera l'écran) : étoiles, boosts, tenue, chat noir
  const b = G.newState(now0), qq = HT.etat(b, now0); HT.gagner(qq, 1e15); const e0 = b.etoiles;
  for (const pp of HT.paliersDus(qq)) { HT.marquerPalier(qq, pp.n); if (pp.etoiles) b.etoiles += pp.etoiles; if (pp.boost) G.donnerBoostReserve(b, pp.boost.mult, pp.boost.secs); if (pp.vetement) G.donnerVetement(b, pp.vetement); if (pp.chat) G.donnerChatNoir(b); }
  check(b.etoiles - e0 === 8 && b.boosts.reserve.length === 5 && HT.VETEMENTS.every((id) => G.possede(b, id)) && b.chatNoir === true, 'dans la boulangerie : 8 étoiles, 5 boosts en réserve, la tenue d’Halloween dans la garde-robe, le chat noir gagné');
  check(G.equiperCollection(b, 'hantee') === 4 && G.ensembleComplet(b) === 'hantee' && G.tenueBoulanger(b).tete.forme === 'chapeau' && G.tenueBoulanger(b).tete.metal === 'hantee', 'la tenue d’Halloween se porte : ensemble complet, chapeau pointu vu par la 3D');
  check(G.donnerCollection(b, 'hantee-or').length === 4 && G.equiperCollection(b, 'hantee-or') === 4 && G.ensembleComplet(b) === 'hantee-or', 'le podium final : la même en or (donnerCollection « hantee-or »)');
  const json = JSON.parse(JSON.stringify(b)); check(json.hantee && json.hantee.paliers.length === 12 && G.garderobe(json).objets['hantee-lanterne'] && json.chatNoir, 'la sauvegarde garde st.hantee, la garde-robe et le chat noir'); }
{ // le pelage du chat
  const b = G.newState(now0);
  check(G.pelageChat(b, false) === 'roux' && G.pelageChat(b, true) === 'noir' && !G.choisirPelage(b, 'noir') && G.pelagesChat(b).join() === 'roux', 'avant le palier : roux, mais noir d’office pendant la Maison hantée ; pas de choix');
  check(G.donnerChatNoir(b).nouveau === true && G.donnerChatNoir(b).nouveau === false && G.pelagesChat(b).join() === 'roux,noir', 'le chat noir gagné une fois (à vie) : deux pelages au choix');
  check(G.pelageChat(b, false) === 'roux' && G.choisirPelage(b, 'noir') && G.pelageChat(b, false) === 'noir' && G.choisirPelage(b, 'roux') && G.pelageChat(b, false) === 'roux' && G.pelageChat(b, true) === 'noir' && !G.choisirPelage(b, 'tigre'), 'après l’événement : au choix (garde-robe ou Réglages), noir ou roux ; un pelage inconnu est refusé');
  const vieux = JSON.parse(JSON.stringify(G.newState(now0))); delete vieux.chatNoir; delete vieux.chatPelage; check(G.pelageChat(vieux, false) === 'roux' && G.pelageChat(vieux, true) === 'noir', 'une vieille sauvegarde (sans ces champs) : roux, noir pendant l’événement'); }
{ // le Quartier et la Maison hantée dans la même sauvegarde : chacun son état
  const b = G.newState(now0), q1 = Q.etat(b, now0), q2 = HT.etat(b, now0); Q.gagner(q1, 10); HT.gagner(q2, 20);
  check(b.quartier.total === 10 && b.hantee.total === 20 && b.quartier !== b.hantee, 'st.quartier et st.hantee côte à côte, sans se mélanger');
  check(G.nouvelleBoutique({ ...b, lifetimeRun: 1e30 }, now0).ok, 'une nouvelle boutique (étoiles) ne casse rien'); }

console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
