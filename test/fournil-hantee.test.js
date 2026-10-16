#!/usr/bin/env node
// L'événement d'Halloween du Fournil, « La Maison hantée » (src/hantee.js, règles pures) : la fenêtre (du mardi 27 oct. 2026 à midi au lundi
// 2 nov. à 20 h, heure de Paris), l'enchaînement avec le Quartier, la fiche (HT.FICHE) et la même forme d'API que src/quartier.js, le Manoir
// (friandises, postes, monstres, Sortilèges, coups de pouce), les gains d'absence plafonnés (8 h, au ralenti), les douze paliers donnés une
// seule fois (étoiles, boosts, décos, tenue d'Halloween, chat noir), le rythme simulé (assidu → palier 12 le dernier jour ou la veille,
// quotidien → 8-9, occasionnel → 5-7), les paliers bonus « après le maître » (13 à 20) et les Sortilèges en plus, la reprise d'une sauvegarde
// déjà au 12e, l'enveloppe du serveur (le marathon 24 h/24 reste sous la table de fournil_evts(), avec marge, Sortilèges compris), et la
// longévité (sept jours de marathon sans dérive, sauvegarde relue en route, récompenses distribuées dans la boulangerie de src/game.js), et
// les activités d'Halloween (src/activites.js, vérifiées par test/fournil-activites.js ; jouées au mieux dans le marathon de l'enveloppe), avec
// la pause des coups de pouce pendant une courte sortie ; et, après le maître, les deux recettes de plus (gâteaux du cimetière au 13e, œufs
// de dragon au 16e : déblocage, vieille sauvegarde à six postes), le Marché des sorcières (les niveaux à moitié prix), les Sortilèges ×3,
// le temps par niveau du très actif et l'enveloppe qui tient.
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
check(HT.PRODUITS.length === 8 && HT.PRODUITS.map((p) => p.id).join() === 'acidule,pomme,cookie,toile,potion,citrouille,cimetiere,dragon' && HT.PRODUITS.slice(0, 6).every((p) => !p.apres), 'six friandises : acidulés, pommes d’amour, cookies fantômes, toiles en sucre, potions fumantes, citrouilles sculptées ; puis deux recettes après le maître');
check(HT.PRODUITS.map((p) => p.staffNom.split(' ').slice(-1)[0]).join() === 'fantôme,momie,squelette,Vladimir,sorcière,Lanterne,loup-garou,dragonne' && HT.PRODUITS.every((p) => p.cout > 0 && p.rev > 0 && p.temps > 0 && p.croiss > 1 && p.staff > 0 && p.staffNom && p.staffDesc && p.poste && p.desc), 'leurs monstres : le fantôme, la momie, le squelette, le vampire (Comte Vladimir), la sorcière, la citrouille-lanterne, puis le loup-garou et la petite dragonne ; chacun a son poste et sa phrase');
check(HT.PRODUITS.slice(1, 6).every((p, k) => p.debloquer > HT.PRODUITS[k].debloquer && p.rev > HT.PRODUITS[k].rev), 'les déblocages et les revenus grimpent dans l’ordre');
{ const textes = JSON.stringify([F.textes.annonce, F.textes.bilan, F.textes.palier12, F.textes.paliersNote, HT.PRODUITS, HT.PALIERS, HT.AMELIORATIONS, Object.values(F.evenements).map((e) => [e.nom, e.annonce, e.fin]), F.vetements, F.decos]);
  const mots = textes.match(/\b(drogues?|alcools?|bi[eè]res?|vins?|cigarettes?|herbe|shit|coke|ecsta|police|adultes?|sang|tuer|meurtre|couteaux?|armes?|cadavres?|18 ans)\b/gi);
  check(!mots, `tous âges : rien d’adulte ni de sanglant dans les textes${mots ? ' — ' + mots.join(', ') : ''}`); }

console.log('── le Manoir : état, friandises, postes, monstres ──');
const now0 = HT.DEBUT + 3600e3;
let st = {}, q = HT.etat(st, now0);
check(st.hantee === q && q.billets === 0 && q.total === 0 && HT.bonbons(q) === 0 && q.postes.length === 8 && q.postes[0].niv === 1 && q.postes[1].niv === 0 && q.majeur === true && !q.masque && !q.chat, 'un état neuf (st.hantee) : zéro bonbon, les acidulés seuls ouverts, pas de porte (majeur toujours vrai), pas encore de chat noir');
check(!st.quartier && HT.etat(st, now0) === q, 'il vit à côté de st.quartier sans y toucher, et se relit tel quel');
{ const s2 = { hantee: { postes: [{ niv: 3 }], billets: NaN, total: -5, paliers: 'x' } }; const q2 = HT.etat(s2, now0); check(q2.postes.length === 8 && q2.billets === 0 && q2.total === 0 && Array.isArray(q2.paliers) && q2.stats && q2.ameliorations, 'un état abîmé (vieille sauvegarde, champs faux) : remis d’aplomb'); }
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
check(HT.AMELIORATIONS.length === 17 && HT.AMELIORATIONS.filter((a) => !a.apres).length === 10 && HT.AMELIORATIONS.every((a) => a.cible === null || a.cible.every((c) => HT.PRODUITS.some((p) => p.id === c))) && HT.AMELIORATIONS.slice(1).every((a, k) => a.cout > HT.AMELIORATIONS[k].cout), 'dix Sortilèges (et sept de plus après le maître), de prix croissants, qui visent des friandises qui existent');
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
{ q.now = now0 + 200e3; HT.lancerEvenement(q, () => 0.5, 'descente'); const b1 = q.billets; const o = HT.tick(q, 0.25, q.now + 1800e3, () => 0.5);
  check(!o.finEv && !o.nouvelEv && q.ev === null && q.billets >= b1 && q.evTimer >= 90, 'retour après 30 min hors ligne : rien d’emporté, rien ne surgit tout de suite'); }
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
const DOUZE = HT.PALIERS.filter((p) => !p.bonus), BONUS = HT.PALIERS.filter((p) => p.bonus);
check(HT.PALIERS.length === 20 && HT.PALIERS_BOSS === 12 && HT.PALIERS.every((p, k) => p.n === k + 1 && (k === 0 || p.total > HT.PALIERS[k - 1].total)) && DOUZE.length === 12 && BONUS.every((p) => p.n > 12), 'vingt paliers croissants : les douze, puis huit bonus (13 à 20)');
check(DOUZE.filter((p) => p.vetement).map((p) => `${p.n}:${p.vetement}`).join() === '3:hantee-chapeau,6:hantee-cape,9:hantee-bottes,12:hantee-lanterne' && HT.VETEMENTS.join() === 'hantee-chapeau,hantee-cape,hantee-bottes,hantee-lanterne', 'la tenue d’Halloween aux paliers 3, 6, 9 et 12 (chapeau pointu, cape, bottes, citrouille-lanterne)');
check(HT.PALIERS.filter((p) => p.deco).map((p) => `${p.n}:${p.deco}`).join() === '2:citrouilles,5:toiles,8:chaudron' && HT.DECOS.join() === 'citrouilles,toiles,chaudron', 'les trois décos : citrouilles, toiles d’araignée, chaudron');
check(HT.PALIERS.filter((p) => p.chat).map((p) => `${p.n}:${p.chat}`).join() === '4:noir', 'le chat noir au palier 4');
check(DOUZE.reduce((s, p) => s + (p.etoiles || 0), 0) === 10 && DOUZE.filter((p) => p.boost).length === 5 && DOUZE.reduce((s, p) => s + (p.prime || 0), 0) === 16, '10 étoiles (8 avant), 5 boosts et 16 h de primes dans les douze, comme au Quartier');
check(HT.PALIERS.map((p) => p.total).join() === [4e8, 1e10, 1.5e11, 6e11, 2e12, 5e12, 1e13, 1.5e13, 4e13, 1.2e14, 2.5e14, 4e14, 1.2e15, 2.5e15, 4.5e15, 7e15, 1e16, 1.3e16, 2.5e16, 6e16].join(), 'les seuils des vingt paliers n’ont pas bougé (version 2 des récompenses)');
check(HT.PALIERS.every((p) => HT.phrasePalier(p).length > 3) && /chat noir/.test(HT.phrasePalier(HT.PALIERS[3])), 'chaque palier se décrit en une ligne');
check(HT.VETEMENTS.concat(HT.VETEMENTS_OR).every((id) => G.vetement(id) && G.vetement(id).collection === (id.startsWith('hantee-or') ? 'hantee-or' : 'hantee')) && HT.VETEMENTS.every((id) => F.vetements[id] && F.vetements[id].forme === G.vetement(id).forme), 'chaque pièce existe dans la garde-robe de src/game.js (collections hantee et hantee-or), de la forme que dit la fiche');
q = HT.etat({}, now0);
check(HT.paliersDus(q).length === 0 && HT.reputationMult(q) === 1 && HT.marquerPalier(q, 1) === null, 'rien à réclamer à zéro');
HT.gagner(q, HT.PALIERS[3].total);
check(HT.paliersDus(q).map((p) => p.n).join() === '1,2,3,4' && HT.reputationMult(q) === Math.pow(HT.REPUTATION, 4), 'au 4e seuil : quatre paliers dus, la réputation du Manoir ×1,5⁴');
let p = HT.marquerPalier(q, 4);
check(p && p.n === 4 && q.chat === true && q.etoiles === 1 && HT.marquerPalier(q, 4) === null, 'le palier 4 réclamé : le chat noir noté, une étoile ; une seule fois');
HT.gagner(q, 1e15); HT.PALIERS.forEach((x) => HT.marquerPalier(q, x.n));
check(q.paliers.length === 12 && HT.ensembleComplet(q) && q.decos.length === 3 && q.etoiles === 10 && q.boosts === 5 && q.heures === 16 && HT.tick(q, 1, now0 + 1000, () => 0.5).paliers.length === 0, 'tout en haut : 12 paliers, la tenue complète, 3 décos, 10 étoiles, 5 boosts, 16 h de primes ; le pas de jeu ne redonne rien');

console.log('── après le maître : les paliers 13 à 20, les Sortilèges en plus ──');
check(HT.PALIERS[12].total > HT.PALIERS[11].total && BONUS.every((p) => p.titre && (p.etoiles || p.boost) && !p.deco && !p.chat) && new Set(HT.PALIERS.map((p) => p.titre)).size === 20, `huit paliers bonus (de ${HT.fmt(BONUS[0].total)} à ${HT.fmt(BONUS[7].total)}), chacun son titre, des étoiles ou un boost`);
check(BONUS.every((p) => !p.vetement || p.n === 20) && HT.PALIERS[19].vetement === HT.TROPHEE && HT.TROPHEE === 'hantee-lueur-chapeau' && !HT.VETEMENTS.includes(HT.TROPHEE) && !HT.VETEMENTS_OR.includes(HT.TROPHEE) && G.vetement(HT.TROPHEE).collection === 'hantee-lueur' && F.vetements[HT.TROPHEE].forme === G.vetement(HT.TROPHEE).forme, 'au 20e, le trophée : le chapeau phosphorescent (collection à part ; la tenue en or reste au podium)');
{ const b = BONUS.filter((p) => p.boost);
  check(BONUS.reduce((s, p) => s + (p.etoiles || 0), 0) === 29 && b.length === 5 && BONUS.reduce((s, p) => s + (p.prime || 0), 0) === 54 && b.every((p) => [5, 10].includes(p.boost.mult) && p.boost.secs >= 1800 && p.boost.secs <= 3600) && BONUS.every((p) => p.etoiles >= 2) && /phosphorescent/.test(HT.phrasePalier(HT.PALIERS[19])) && /24 h de gains/.test(HT.phrasePalier(HT.PALIERS[19])), `29 étoiles (5 avant), 5 boosts ×5 ou ×10 (${b.map((p) => `×${p.boost.mult} ${HT.fmtDuree(p.boost.secs)}`).join(', ')}), 54 h de primes, comme au Quartier ; le 20e se décrit : « ${HT.phrasePalier(HT.PALIERS[19])} »`);
  check(HT.PALIERS.every((p) => JSON.stringify([p.etoiles, p.boost, p.prime]) === JSON.stringify([Q.PALIERS[p.n - 1].etoiles, Q.PALIERS[p.n - 1].boost, Q.PALIERS[p.n - 1].prime]) || [4, 11].includes(p.n)), 'les mêmes principes qu’au Quartier, palier par palier (sauf les 4e et 11e, qui gardent leur étoile du chat noir et du bal)'); }
q = HT.etat({}, now0); HT.gagner(q, 1e17); HT.paliersDus(q).forEach((x) => HT.marquerPalier(q, x.n));
check(q.paliers.length === 20 && q.etoiles === 39 && q.boosts === 10 && q.heures === 70 && q.vetements.includes(HT.TROPHEE) && HT.reputationMult(q) === Math.pow(HT.REPUTATION, 12) && HT.marquerPalier(q, 20) === null, 'tout en haut : vingt paliers, 39 étoiles (13 avant), 10 boosts, 70 h de primes, le chapeau phosphorescent ; la réputation reste ×1,5¹² ; une seule fois');
const COMB = HT.AMELIORATIONS.filter((a) => a.apres), CONFORT = COMB.filter((a) => a.effet && !a.effet.remise), X3 = COMB.filter((a) => a.mult === 3), MARCHE = HT.AMELIORATIONS.find((a) => a.id === 'marche');
check(COMB.length === 7 && CONFORT.length === 4 && CONFORT.every((a) => a.apres === 12 && a.mult === 1 && a.cout >= 5e14) && MARCHE && MARCHE.apres === 12 && MARCHE.effet.remise === 0.5 && MARCHE.mult === 1, `sept Sortilèges de plus à partir du palier 12, chers (${COMB.map((a) => `${a.nom} ${HT.fmt(a.cout)}`).join(', ')})`);
check(X3.map((a) => `${a.apres}:${a.cible.join()}`).join() === '13:cimetiere,16:dragon', 'deux Sortilèges ×3, un pour chaque recette d’après le maître, ouverts avec elle (13e, 16e)');
q = HT.etat({}, now0); HT.gagner(q, 3e14); q.billets = 1e17;
check(!HT.amelioration(q, CONFORT[0].id).ok && HT.amelioration(q, CONFORT[0].id).verrou && HT.amelioration(q, 'marche').verrou, 'avant le maître : verrouillés');
HT.gagner(q, 1e14); q.billets = 1e17; const rb = HT.revenuBase(q, 0);
const eC = q.etoiles, hC = q.heures;
check(HT.amelioration(q, 'pelle').verrou && CONFORT.every((a) => HT.amelioration(q, a.id).ok) && HT.amelioration(q, 'marche').ok && HT.revenuBase(q, 0) === rb, 'après : achetés, sans multiplier aucune vente (la pelle attend le 13e)');
HT.gagner(q, 1e16); q.billets = 1e17; check(X3.every((a) => HT.amelioration(q, a.id).ok) && HT.PRODUITS.every((p, i) => HT.ameliorationMult(q, i) === (p.apres ? 3 : 1)), 'au-delà du 16e : les deux ×3, sur les seules recettes d’après le maître');
check(COMB.map((a) => `${a.prime}:${a.etoiles}`).join() === '4:1,6:1,10:2,12:2,16:2,24:3,20:3' && q.etoiles - eC === 14 && q.heures - hC === 92 && HT.phraseCombine(CONFORT[1]) === '+ 10 h de gains à la boulangerie, +2 ★', `et chacun paie la boulangerie (4, 6, 10, 12, 16, 24 et 20 h ; 14 ★ en tout) : « ${HT.phraseCombine(CONFORT[1])} »`);
ev = HT.lancerEvenement(q, () => 0.5, 'descente'); const evS = HT.lancerEvenement(q, () => 0.5, 'soiree'), evB = HT.lancerEvenement(q, () => 0.5, 'scooter');
check(ev.n === 8 && ev.enjeu === Math.floor(q.billets * 0.05) && evS.fin - evS.debut === 150e3 && evB.fin - evB.debut === 20e3 && HT.heuresAbsence(q) === 12 && HT.partAbsence(q) === 0.2, 'leurs effets : chauves-souris en 8 touches (5 % emportés), pleine lune de 2 min 30 (3 min avant les recettes d’après le maître : la place du Marché dans l’enveloppe), balai qui attend 20 s, absence de 12 h à 20 %');
{ // les deux recettes d'après le maître : fermées avant leur palier, ouvertes dès qu'il est franchi ; une vieille sauvegarde à six postes
  const [GC, OD] = [6, 7].map((i) => HT.PRODUITS[i]), qr = HT.etat({}, now0); for (let i = 1; i < 6; i++) qr.postes[i].niv = 50; HT.gagner(qr, 1e15); qr.billets = 1e17; qr.mode = 1;
  check(GC.apres === 13 && OD.apres === 16 && GC.paliersFins && GC.staffNom === 'Gaston le loup-garou' && OD.staffNom === 'Bérénice la dragonne' && GC.rev < HT.PRODUITS[5].rev / 10 && GC.croiss < 1.05, `« ${GC.nom} » (${GC.staffNom}, ${GC.poste}) au 13e, « ${OD.nom} » (${OD.staffNom}, ${OD.poste}) au 16e : elles repartent du bas, des gains petits (l’enveloppe)`);
  const r0 = HT.acheter(qr, 6); check(!r0.ok && r0.verrou && r0.apres === 13 && qr.postes[6].niv === 0, 'avant le 13e : les gâteaux du cimetière restent fermés (« Après le palier 13 »)');
  HT.gagner(qr, 3e14); check(HT.acheter(qr, 6).ok && qr.postes[6].niv === 1 && HT.acheter(qr, 7).verrou && HT.embaucher(qr, 6).ok, 'le 13e franchi : ils se débloquent, Gaston s’embauche ; les œufs de dragon attendent le 16e');
  const vieille = { hantee: JSON.parse(JSON.stringify(HT.etat({}, now0))) }; vieille.hantee.postes = vieille.hantee.postes.slice(0, 6); vieille.hantee.postes.forEach((x) => { x.niv = 60; x.staff = true; }); vieille.hantee.total = 8e15;
  const qv = HT.etat(vieille, now0); qv.billets = 1e15; qv.mode = 1;
  check(qv.postes.length === 8 && qv.postes.slice(0, 6).every((x) => x.niv === 60) && qv.stats.vendus.length === 8 && HT.acheter(qv, 6).ok && HT.acheter(qv, 7).ok, 'une sauvegarde à six postes déjà au-delà du 16e : deux postes de plus, et les deux recettes se débloquent tout de suite');
  // le Marché des sorcières : les niveaux à moitié prix
  const qg = HT.etat({}, now0); qg.postes.forEach((x, i) => { x.niv = i < 6 ? 150 : 0; }); HT.gagner(qg, 5e14); qg.billets = 1e17; qg.mode = 10; const p0 = HT.prixNiveaux(qg, 5, 10);
  check(HT.amelioration(qg, 'marche').ok && HT.remise(qg) === 0.5 && HT.prixNiveaux(qg, 5, 10) === p0 / 2 && HT.prixNiveaux(qg, 6, 1) === GC.debloquer, `le Marché des sorcières : dix niveaux de citrouilles à ${HT.fmtEur(p0 / 2)} au lieu de ${HT.fmtEur(p0)} ; un déblocage garde son prix`);
  qg.mode = 'max'; qg.billets = HT.coutNiveaux(0, 150, 20) / 2; check(HT.quantite(qg, 0) === 20 && HT.acheter(qg, 0).ok && qg.postes[0].niv === 170, 'Max compte la remise : deux fois plus de niveaux pour les mêmes bonbons'); }
{ // la reprise d'une sauvegarde d'avant la mise à jour : 12 paliers marqués, 3 000 Bn gagnés (au-delà des 13e et 14e)
  const b = G.newState(now0), qv = HT.etat(b, now0); HT.gagner(qv, 3e15); for (let k = 1; k <= 12; k++) HT.marquerPalier(qv, k);
  const json = JSON.parse(JSON.stringify(b)), q2 = HT.etat(json, now0), e0 = json.etoiles;
  check(HT.paliersDus(q2).map((p) => p.n).join() === '13,14', 'relue après la mise à jour : les paliers 13 et 14, déjà dépassés, sont dus');
  const c0 = json.coins; for (const p of HT.paliersDus(q2)) { if (!HT.marquerPalier(q2, p.n)) continue; if (p.etoiles) json.etoiles += p.etoiles; if (p.prime) G.donnerPrimeHeures(json, p.prime); }
  for (const p of HT.PALIERS) HT.marquerPalier(q2, p.n);
  check(q2.paliers.length === 14 && json.etoiles === e0 + 4 && json.coins - c0 === G.primeHeures(json, 4) + G.primeHeures(json, 6) && q2.etoiles === 14 && HT.paliersDus(q2).length === 0, 'donnés une fois chacun (4 étoiles, 10 h de gains), pas de double récompense'); }
{ // la revue : une sauvegarde d'avant cette version (12 paliers, un Sortilège) reçoit la différence, une fois
  const b = G.newState(now0), qv = HT.etat(b, now0); HT.gagner(qv, 2e15); qv.paliers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; qv.ameliorations.epouvantail = true; delete qv.recompensesV2; delete qv.heures;
  const json = JSON.parse(JSON.stringify(b)), q3 = HT.etat(json, now0), lot = HT.revueRecompenses(q3);
  check(lot && lot.etoiles === 1 + 1 + 2 + 1 && lot.heures === 1 + 2 + 3 + 4 + 6 + 4 + 6 && lot.boosts.map((x) => `${x.mult}:${x.secs}`).join() === '5:1800,5:1800' && lot.combines === 1, `la différence : +${lot && lot.etoiles} ★, +${lot && lot.heures} h, ${lot && lot.boosts.length} boosts (le 12e passé à 1 h, le 13e à ×5)`);
  check(q3.recompensesV2 === true && HT.revueRecompenses(q3) === null && HT.revueRecompenses(HT.etat(JSON.parse(JSON.stringify(json)), now0)) === null, 'une fois : le drapeau posé, gardé dans la sauvegarde'); }

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
{ // les recettes d'après le maître, le Marché et les Sortilèges ×3 n'arrivent qu'après le 12e : les paliers 1 à 12 des joueurs constants ne bougent pas
  const AVANT = { assidu: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6], quotidien: [1, 2, 2, 3, 4, 4, 5, 6, 7], occasionnel: [2, 2, 3, 4, 6, 7] }; // les jours d'avant (16 octobre)
  for (const [prof, jours] of Object.entries(AVANT)) check(jours.every((j, k) => S[prof].paliersJour[k + 1] === j), `${prof} : les paliers 1 à ${jours.length} aux mêmes jours qu’avant (${jours.join(', ')})`); }
{ const res = []; let ok = true; for (let g = 1; g <= 8; g++) { const s = HT.simuler('assidu', 7, { graine: g }), j = s.paliersJour[12] || Infinity; res.push(j); if (!(j >= 6 && j <= 7)) ok = false; }
  check(ok, `et quel que soit le hasard des coups de pouce (8 graines) : palier 12 les jours ${res.join(', ')}`); }
{ // après le maître : le très actif (8 h par jour) et le marathon
  S.tresactif = HT.simuler('tresactif'); const T = S.tresactif.paliersJour;
  console.log(`  très actif : ${HT.fmtEur(S.tresactif.total)}, paliers ${JSON.stringify(T)}`);
  const jours = [12, 13, 14, 15, 16, 17, 18].map((k) => T[k] || Infinity), ecarts = jours.slice(1).map((j, k) => j - jours[k]);
  check(T[12] <= 2 && T[18] <= 7 && ecarts.every((e) => e >= 0 && e <= 2) && !T[20], `le très actif : le 12e le ${T[12]}e jour, puis un bonus par jour ou presque (13e le ${T[13]}e, 15e le ${T[15]}e, 16e le ${T[16]}e, 17e le ${T[17]}e, 18e le ${T[18]}e) ; le 20e reste aux marathoniens`);
  check(jourDe('marathon', 20) >= 6 && jourDe('marathon', 20) <= 7, `le marathon n’atteint le 20e que le ${jourDe('marathon', 20)}e jour sur 7`);
  // le temps d'un niveau (le moins cher : son prix, remise comprise, ÷ le taux du Manoir ouvert) : 30 min au 6e jour et 25 min au 7e avant
  const tNiv = (d) => Math.min(...d.niv.map((n, i) => (n > 0 ? HT.coutNiveau(i, n) * (d.remise || 1) / d.taux : Infinity))) / 60, t6 = tNiv(S.tresactif.parJour[5]), t7 = tNiv(S.tresactif.parJour[6]);
  check(t6 < 15 && t7 < 15, `le très actif attend moins pour un niveau : ${t6.toFixed(0)} min au 6e jour (30 avant), ${t7.toFixed(0)} min au 7e (25 avant)`);
  check(S.tresactif.q.postes[6].niv >= 100 && S.tresactif.q.postes[7].niv >= 50 && S.tresactif.q.ameliorations.marche, `il ouvre les deux recettes (gâteaux niveau ${S.tresactif.q.postes[6].niv}, œufs ${S.tresactif.q.postes[7].niv}) et le Marché des sorcières`);
  check(!S.assidu.paliersJour[13] && !S.quotidien.paliersJour[13], 'l’assidu et le quotidien ne voient pas les paliers bonus : leur rythme ne change pas'); }

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
  for (const g of [7, 1, 2, 3]) for (const offertes of [false, true]) { const s = g === 7 && !offertes ? S.marathon : HT.simuler('marathon', 7, { graine: g, offertes }); // offertes : le pire cas, tous les Sortilèges d'après le maître dès le 12e
    for (const x of s.trace) if (x.total > 0) { const m = borne(x.t) - Math.log10(x.total); minM = Math.min(minM, m); if (x.t > 0.25) maxM = Math.max(maxM, m); } }
  check(minM >= Math.log10(2), `le marathon 24 h/24 (quatre graines, minute par minute, Sortilèges en plus achetés ou offerts dès le 12e) reste sous l’enveloppe avec au moins ×2 de marge (×${Math.pow(10, minM).toFixed(2)} au plus juste) — le SQL ne change pas`);
  check(maxM <= Math.log10(20), `mais pas plus de ×20 après les six premières heures (×${Math.pow(10, maxM).toFixed(1)} au plus large) : un tricheur ne s’envole pas`);
  check(S.assidu.trace.every((x) => x.total === 0 || borne(x.t) - Math.log10(x.total) >= 1), 'un assidu honnête est toujours au moins dix fois sous l’enveloppe');
  // avec les recettes d'après le maître et le Marché des sorcières (16 octobre) : les recettes prennent leur part des bonbons (le marathon
  // simulé achète d'abord le niveau le moins cher), ce qui compense le Marché ; la pleine lune du Sortilège « Nuages » passe à 2 min 30
  // pour la fin de la première nuit (×2,04 au plus juste, minute par minute, contre ×2,05 avant)
  const off = HT.simuler('marathon', 7, { offertes: true }).total;
  check(Math.abs(S.marathon.total / 7.65e16 - 1) < 0.01 && Math.abs(off / 8.86e16 - 1) < 0.01, `le marathon : ${HT.fmt(S.marathon.total)} (${HT.fmt(off)} Sortilèges offerts ; 80,8 Bd et 87,6 Bd avant les recettes d’après le maître)`);
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
  check(b.etoiles - e0 === 10 && b.boosts.reserve.length === 5 && HT.VETEMENTS.every((id) => G.possede(b, id)) && b.chatNoir === true, 'dans la boulangerie : 10 étoiles, 5 boosts en réserve, la tenue d’Halloween dans la garde-robe, le chat noir gagné');
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

console.log('── les activités du Manoir (src/activites.js) ──');
{ const sans = HT.simuler('marathon', 7, { activites: false }), part = S.marathon.total / sans.total;
  check(part > 1 && part < 1.25, `au marathon, les activités jouées au mieux ajoutent ${((part - 1) * 100).toFixed(1)} % au total (l’enveloppe, plus haut, reste ×2 dessous)`);
  const A = HT.FICHE.activites, textes = JSON.stringify([HT.MINI.jeux.map((j) => [j.nom, j.desc, j.regles, j.consigne]), HT.OPERATIONS.map((o) => [o.nom, o.desc]), A.textes.saisie, A.textes.saisieTxt('3 bonbons'), A.textes.enCours,
    [0, 1, 2, 3, 4, 5, 6].map((k) => HT.contratsDuJour(HT.DEBUT + k * 864e5).map((c) => c.texte))]);
  const mots = textes.match(/\b(drogues?|alcools?|bi[eè]res?|vins?|cigarettes?|herbe|shit|coke|ecsta|police|adultes?|sang|tuer|meurtre|couteaux?|armes?|cadavres?|18 ans|saisi[se]?)\b/gi);
  check(!mots && /chauves-souris/.test(textes), `tous âges : les activités d’Halloween n’ont rien d’adulte (les chauves-souris gourmandes chipent des bonbons)${mots ? ' — ' + mots.join(', ') : ''}`); }
check(HT.PAUSE_EV === G.PAUSE_EV * 1000, `la pause d’un coup de pouce : la même sortie que pour la boutique (G.PAUSE_EV, ${G.PAUSE_EV} s)`);
require('./fournil-activites.js')(HT, check, { S: { marathon: S.marathon, 'très actif': S.tresactif, assidu: S.assidu, quotidien: S.quotidien }, nom: 'le Manoir' });

console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
