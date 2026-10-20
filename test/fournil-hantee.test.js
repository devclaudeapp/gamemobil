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
// le temps par niveau du très actif et l'enveloppe qui tient. La recette du jour (src/activites.js, la 4e activité) : le marathon et le très
// actif la jouent au mieux, et le rythme des paliers comme l'enveloppe se vérifient avec elle (le jeu livré) ; l'assidu et l'occasionnel
// qui la jouent aussi.
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
const now7 = HT.FIN - 3600e3; // v6.7 : le dernier jour, tous les paliers ouverts (chacun s'ouvre un jour de la semaine : p.jour)
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
ev = HT.lancerEvenement(q, () => 0.5, 'soiree'); HT.toucher(q, q.now); // (lot 6 : le ×6 s'endort sans toucher ; ici, on vient de toucher)
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
// v6.7 (21 octobre) : les récompenses fortes avant le 10e (l'occasionnel y arrive) : la tenue aux paliers 3, 5, 7 et 9 (3, 6, 9 et 12 avant :
// la citrouille-lanterne a quitté le maître du Manoir), le chat noir au 4e ; les décos 2, 6, 8 (les toiles ont laissé le 5e à la cape)
check(DOUZE.filter((p) => p.vetement).map((p) => `${p.n}:${p.vetement}`).join() === '3:hantee-chapeau,5:hantee-cape,7:hantee-bottes,9:hantee-lanterne' && HT.VETEMENTS.join() === 'hantee-chapeau,hantee-cape,hantee-bottes,hantee-lanterne', 'la tenue d’Halloween aux paliers 3, 5, 7 et 9 (chapeau pointu, cape, bottes, citrouille-lanterne) : avant le 10e');
check(HT.PALIERS.filter((p) => p.deco).map((p) => `${p.n}:${p.deco}`).join() === '2:citrouilles,6:toiles,8:chaudron' && HT.DECOS.join() === 'citrouilles,toiles,chaudron', 'les trois décos : citrouilles, toiles d’araignée, chaudron');
check(HT.PALIERS.filter((p) => p.chat).map((p) => `${p.n}:${p.chat}`).join() === '4:noir', 'le chat noir au palier 4');
check(DOUZE.reduce((s, p) => s + (p.etoiles || 0), 0) === 10 && DOUZE.filter((p) => p.boost).length === 5 && DOUZE.reduce((s, p) => s + (p.prime || 0), 0) === 16, '10 étoiles (8 avant), 5 boosts et 16 h de primes dans les douze, comme au Quartier');
// v6.7 : les seuils réglés pour le « juste milieu » (avant : 4e8, 1e10, 1,5e11, 6e11, 2e12, 5e12, 1e13, 1,5e13, 4e13, 1,2e14, 2,5e14, 4e14,
// 1,2e15, 2,5e15, 4,5e15, 7e15, 1e16, 1,3e16, 2,5e16, 6e16) ; le rythme qu'ils donnent se vérifie plus bas, sur plusieurs graines
check(HT.PALIERS.map((p) => p.total).join() === [5e7, 5e9, 5e10, 2.5e11, 8e11, 1.6e12, 3e12, 6e12, 1.2e13, 6e13, 2e14, 4e14, 7e14, 1.2e15, 1.8e15, 3e15, 5e15, 8e15, 1.4e16, 2.4e16].join(), 'les seuils des vingt paliers sont ceux de la v6.7');
{ // v6.7 : chaque palier s'ouvre un jour de la semaine (quatre le premier, trois les quatre suivants, deux les deux derniers), à minuit
  const J = HT.PALIERS.map((p) => p.jour), parJour = [1, 2, 3, 4, 5, 6, 7].map((j) => J.filter((x) => x === j).length), mardi = HT.ouverturePalier(HT.PALIERS[4]);
  check(parJour.join() === '4,3,3,3,3,2,2' && J.every((j, k) => k === 0 || j >= J[k - 1]) && HT.ouverturePalier(HT.PALIERS[0]) === HT.DEBUT && mardi === HT.parisMs(2026, 10, 28, 0) && HT.ouverturePalier(HT.PALIERS[19]) === HT.parisMs(2026, 11, 2, 0) && HT.PALIERS.every((p) => HT.ouverturePalier(p) < HT.FIN),
    `les jours d’ouverture : ${parJour.join(', ')} paliers (du mardi 27 au lundi 2 novembre, à minuit heure de Paris ; le 1er dès midi le 27), tous avant la fermeture`);
  const qj = HT.etat({}, now0); HT.gagner(qj, HT.PALIERS[11].total);
  check(HT.paliersDus(qj).map((p) => p.n).join() === '1,2,3,4' && HT.paliersAtteints(qj).length === 4 && HT.marquerPalier(qj, 5) === null && HT.reputationMult(qj) === Math.pow(HT.REPUTATION, 12) && HT.ouvrePalier(HT.PALIERS[4], qj.now) === 's’ouvre mercredi 28' && HT.ouvrePalier(HT.PALIERS[19], qj.now) === 's’ouvre lundi 2' && HT.ouvrePalier(HT.PALIERS[3], qj.now) === '',
    `le premier jour, les bonbons du 12e gagnés : seuls les quatre premiers sont dus, le 5e « ${HT.ouvrePalier(HT.PALIERS[4], qj.now)} » ; la réputation, elle, suit les bonbons (×1,5¹²)`);
  qj.now = mardi - 1; const avant = HT.tick(qj, 1, mardi - 1000, () => 0.5).paliers.length, o = HT.tick(qj, 1, mardi + 1000, () => 0.5);
  check(avant === 4 && o.paliers.map((p) => p.n).join() === '1,2,3,4,5,6,7' && HT.ouvrePalier(HT.PALIERS[4], qj.now) === '' && HT.ouvrePalier(HT.PALIERS[7], qj.now) === 's’ouvre jeudi 29', 'à minuit, le pas de jeu donne les trois du mercredi (le 8e attend jeudi)');
  qj.now = now7; const qa = HT.etat({ hantee: JSON.parse(JSON.stringify(qj)) }, HT.FIN); qa.now = HT.FIN + 864e5;
  check(HT.paliersDus(qj).length === 12 && HT.paliersDus(qa).length === 12, 'le dernier jour (et après la fermeture), tous ouverts');
  // la sauvegarde d'un samedi, relue le lundi : les paliers ouverts entre-temps sont dus dès la lecture (etat note l'heure : q.vuLe), avant
  // le premier pas de jeu (l'écran les annonce dans la boutique sans ouvrir le Manoir)
  const sam = HT.etat({}, HT.parisMs(2026, 10, 31, 10)); HT.gagner(sam, 1e17); HT.paliersDus(sam).forEach((x) => HT.marquerPalier(sam, x.n));
  const lun = HT.etat({ hantee: JSON.parse(JSON.stringify(sam)) }, HT.parisMs(2026, 11, 2, 10));
  check(sam.paliers.length === 16 && lun.now === sam.now && HT.paliersDus(lun).map((x) => x.n).join() === '17,18,19,20', `relue deux jours plus tard : ${HT.paliersDus(lun).map((x) => x.n).join(', ')} dus tout de suite`); }
check(HT.PALIERS.every((p) => HT.phrasePalier(p).length > 3) && /chat noir/.test(HT.phrasePalier(HT.PALIERS[3])), 'chaque palier se décrit en une ligne');
check(HT.VETEMENTS.concat(HT.VETEMENTS_OR).every((id) => G.vetement(id) && G.vetement(id).collection === (id.startsWith('hantee-or') ? 'hantee-or' : 'hantee')) && HT.VETEMENTS.every((id) => F.vetements[id] && F.vetements[id].forme === G.vetement(id).forme), 'chaque pièce existe dans la garde-robe de src/game.js (collections hantee et hantee-or), de la forme que dit la fiche');
q = HT.etat({}, now0);
check(HT.paliersDus(q).length === 0 && HT.reputationMult(q) === 1 && HT.marquerPalier(q, 1) === null, 'rien à réclamer à zéro');
HT.gagner(q, HT.PALIERS[3].total);
check(HT.paliersDus(q).map((p) => p.n).join() === '1,2,3,4' && HT.reputationMult(q) === Math.pow(HT.REPUTATION, 4), 'au 4e seuil : quatre paliers dus, la réputation du Manoir ×1,5⁴');
let p = HT.marquerPalier(q, 4);
check(p && p.n === 4 && q.chat === true && q.etoiles === 1 && HT.marquerPalier(q, 4) === null, 'le palier 4 réclamé : le chat noir noté, une étoile ; une seule fois');
q.now = now7; HT.gagner(q, 5e14); HT.PALIERS.forEach((x) => HT.marquerPalier(q, x.n)); // (v6.7 : le dernier jour, 5e14 au lieu de 1e15 : entre le 12e et le 13e)
check(q.paliers.length === 12 && HT.ensembleComplet(q) && q.decos.length === 3 && q.etoiles === 10 && q.boosts === 5 && q.heures === 16 && HT.tick(q, 1, now7 + 1000, () => 0.5).paliers.length === 0, 'tout en haut : 12 paliers, la tenue complète, 3 décos, 10 étoiles, 5 boosts, 16 h de primes ; le pas de jeu ne redonne rien');

console.log('── après le maître : les paliers 13 à 20, les Sortilèges en plus ──');
check(HT.PALIERS[12].total > HT.PALIERS[11].total && BONUS.every((p) => p.titre && (p.etoiles || p.boost) && !p.deco && !p.chat) && new Set(HT.PALIERS.map((p) => p.titre)).size === 20, `huit paliers bonus (de ${HT.fmt(BONUS[0].total)} à ${HT.fmt(BONUS[7].total)}), chacun son titre, des étoiles ou un boost`);
check(BONUS.every((p) => !p.vetement || p.n === 20) && HT.PALIERS[19].vetement === HT.TROPHEE && HT.TROPHEE === 'hantee-lueur-chapeau' && !HT.VETEMENTS.includes(HT.TROPHEE) && !HT.VETEMENTS_OR.includes(HT.TROPHEE) && G.vetement(HT.TROPHEE).collection === 'hantee-lueur' && F.vetements[HT.TROPHEE].forme === G.vetement(HT.TROPHEE).forme, 'au 20e, le trophée : le chapeau phosphorescent (collection à part ; la tenue en or reste au podium)');
{ const b = BONUS.filter((p) => p.boost);
  check(BONUS.reduce((s, p) => s + (p.etoiles || 0), 0) === 29 && b.length === 5 && BONUS.reduce((s, p) => s + (p.prime || 0), 0) === 54 && b.every((p) => [5, 10].includes(p.boost.mult) && p.boost.secs >= 1800 && p.boost.secs <= 3600) && BONUS.every((p) => p.etoiles >= 2) && /phosphorescent/.test(HT.phrasePalier(HT.PALIERS[19])) && /24 h de gains/.test(HT.phrasePalier(HT.PALIERS[19])), `29 étoiles (5 avant), 5 boosts ×5 ou ×10 (${b.map((p) => `×${p.boost.mult} ${HT.fmtDuree(p.boost.secs)}`).join(', ')}), 54 h de primes, comme au Quartier ; le 20e se décrit : « ${HT.phrasePalier(HT.PALIERS[19])} »`);
  check(HT.PALIERS.every((p) => JSON.stringify([p.etoiles, p.boost, p.prime]) === JSON.stringify([Q.PALIERS[p.n - 1].etoiles, Q.PALIERS[p.n - 1].boost, Q.PALIERS[p.n - 1].prime]) || [4, 11].includes(p.n)), 'les mêmes principes qu’au Quartier, palier par palier (sauf les 4e et 11e, qui gardent leur étoile du chat noir et du bal)'); }
q = HT.etat({}, now7); HT.gagner(q, 1e17); HT.paliersDus(q).forEach((x) => HT.marquerPalier(q, x.n));
check(q.paliers.length === 20 && q.etoiles === 39 && q.boosts === 10 && q.heures === 70 && q.vetements.includes(HT.TROPHEE) && HT.reputationMult(q) === Math.pow(HT.REPUTATION, 12) && HT.marquerPalier(q, 20) === null, 'tout en haut : vingt paliers, 39 étoiles (13 avant), 10 boosts, 70 h de primes, le chapeau phosphorescent ; la réputation reste ×1,5¹² ; une seule fois');
const COMB = HT.AMELIORATIONS.filter((a) => a.apres), CONFORT = COMB.filter((a) => a.effet && !a.effet.remise), X3 = COMB.filter((a) => a.mult === 3), MARCHE = HT.AMELIORATIONS.find((a) => a.id === 'marche');
check(COMB.length === 7 && CONFORT.length === 4 && CONFORT.every((a) => a.apres === 12 && a.mult === 1 && a.cout >= 5e14) && MARCHE && MARCHE.apres === 12 && MARCHE.effet.remise === 0.5 && MARCHE.mult === 1, `sept Sortilèges de plus à partir du palier 12, chers (${COMB.map((a) => `${a.nom} ${HT.fmt(a.cout)}`).join(', ')})`);
check(X3.map((a) => `${a.apres}:${a.cible.join()}`).join() === '13:cimetiere,16:dragon', 'deux Sortilèges ×3, un pour chaque recette d’après le maître, ouverts avec elle (13e, 16e)');
q = HT.etat({}, now7); HT.gagner(q, 3e14); q.billets = 1e17;
check(!HT.amelioration(q, CONFORT[0].id).ok && HT.amelioration(q, CONFORT[0].id).verrou && HT.amelioration(q, 'marche').verrou, 'avant le maître : verrouillés');
HT.gagner(q, 1e14); q.billets = 1e17; const rb = HT.revenuBase(q, 0);
const eC = q.etoiles, hC = q.heures;
check(HT.amelioration(q, 'pelle').verrou && CONFORT.every((a) => HT.amelioration(q, a.id).ok) && HT.amelioration(q, 'marche').ok && HT.revenuBase(q, 0) === rb, 'après : achetés, sans multiplier aucune vente (la pelle attend le 13e)');
HT.gagner(q, 1e16); q.billets = 1e17; check(X3.every((a) => HT.amelioration(q, a.id).ok) && HT.PRODUITS.every((p, i) => HT.ameliorationMult(q, i) === (p.apres ? 3 : 1)), 'au-delà du 16e : les deux ×3, sur les seules recettes d’après le maître');
check(COMB.map((a) => `${a.prime}:${a.etoiles}`).join() === '4:1,6:1,10:2,12:2,16:2,24:3,20:3' && q.etoiles - eC === 14 && q.heures - hC === 92 && HT.phraseCombine(CONFORT[1]) === '+ 10 h de gains à la boulangerie, +2 ★', `et chacun paie la boulangerie (4, 6, 10, 12, 16, 24 et 20 h ; 14 ★ en tout) : « ${HT.phraseCombine(CONFORT[1])} »`);
ev = HT.lancerEvenement(q, () => 0.5, 'descente'); const evS = HT.lancerEvenement(q, () => 0.5, 'soiree'), evB = HT.lancerEvenement(q, () => 0.5, 'scooter');
check(ev.n === 8 && ev.enjeu === Math.floor(q.billets * 0.05) && evS.fin - evS.debut === 150e3 && evB.fin - evB.debut === 20e3 && HT.heuresAbsence(q) === 12 && HT.partAbsence(q) === 0.2, 'leurs effets : chauves-souris en 8 touches (5 % emportés), pleine lune de 2 min 30 (3 min avant les recettes d’après le maître : la place du Marché dans l’enveloppe), balai qui attend 20 s, absence de 12 h à 20 %');
{ // les deux recettes d'après le maître : fermées avant leur palier, ouvertes dès qu'il est franchi ; une vieille sauvegarde à six postes
  const [GC, OD] = [6, 7].map((i) => HT.PRODUITS[i]), qr = HT.etat({}, now7); for (let i = 1; i < 6; i++) qr.postes[i].niv = 50; HT.gagner(qr, 5e14); qr.billets = 1e17; qr.mode = 1; // (v6.7 : 5e14, sous le 13e)
  check(GC.apres === 13 && OD.apres === 16 && GC.staffNom === 'Gaston le loup-garou' && OD.staffNom === 'Bérénice la dragonne' && GC.croiss < 1.05, `« ${GC.nom} » (${GC.staffNom}, ${GC.poste}) au 13e, « ${OD.nom} » (${OD.staffNom}, ${OD.poste}) au 16e : elles repartent du bas`);
  // v6.3 (17 octobre) : de vraies recettes, comme au Quartier (avant, des gains tout petits devant ceux des citrouilles : rev 1 000 et
  // 8 000). Seul le gain par niveau change : prix, déblocages et monstres restent ceux d'avant. Le remboursement comparé et leur part des
  // gains se vérifient plus bas, sur le très actif simulé. v6.4 (18 octobre), comme au Quartier : encore ×4 pour les gâteaux (18 000 →
  // 72 000), ×1,5 pour les œufs (700 000 → 1 050 000).
  check(GC.rev === 72000 && OD.rev === 1050000 && GC.cout === 1e12 && GC.croiss === 1.02 && GC.debloquer === 2e13 && GC.staff === 5e13 && OD.cout === 1e13 && OD.croiss === 1.025 && OD.debloquer === 2e14 && OD.staff === 5e14,
    `v6.4 : les gâteaux ×72 (rev 1 000 → 18 000 en v6.3 → ${GC.rev}), les œufs ×131,25 (8 000 → 700 000 → ${OD.rev}) ; les mêmes prix qu’avant`);
  const r0 = HT.acheter(qr, 6); check(!r0.ok && r0.verrou && r0.apres === 13 && qr.postes[6].niv === 0, 'avant le 13e : les gâteaux du cimetière restent fermés (« Après le palier 13 »)');
  { const qf = HT.etat({ hantee: JSON.parse(JSON.stringify(qr)) }, now0); qf.now = now0; qf.vuLe = now0; HT.gagner(qf, 1e16); check(HT.acheter(qf, 6).verrou && HT.acheter(qf, 7).verrou, 'v6.7 : le premier jour, même au-delà du 16e, elles attendent l’ouverture de leur palier (le vendredi 30 et le samedi 31)'); }
  HT.gagner(qr, 3e14); check(HT.acheter(qr, 6).ok && qr.postes[6].niv === 1 && HT.acheter(qr, 7).verrou && HT.embaucher(qr, 6).ok, 'le 13e franchi : ils se débloquent, Gaston s’embauche ; les œufs de dragon attendent le 16e');
  const vieille = { hantee: JSON.parse(JSON.stringify(HT.etat({}, now7))) }; vieille.hantee.postes = vieille.hantee.postes.slice(0, 6); vieille.hantee.postes.forEach((x) => { x.niv = 60; x.staff = true; }); vieille.hantee.total = 8e15;
  const qv = HT.etat(vieille, now7); qv.billets = 1e15; qv.mode = 1;
  check(qv.postes.length === 8 && qv.postes.slice(0, 6).every((x) => x.niv === 60) && qv.stats.vendus.length === 8 && HT.acheter(qv, 6).ok && HT.acheter(qv, 7).ok, 'une sauvegarde à six postes déjà au-delà du 16e : deux postes de plus, et les deux recettes se débloquent tout de suite');
  { // une sauvegarde d'avant la v6.3 avec des gâteaux et des œufs : relue telle quelle, mêmes niveaux, et chaque fournée rapporte plus
    const avant = JSON.parse(JSON.stringify(vieille)); avant.hantee.postes[6] = { niv: 150, staff: true, prog: 0, actif: true }; avant.hantee.postes[7] = { niv: 60, staff: true, prog: 0, actif: true };
    const qs = HT.etat(JSON.parse(JSON.stringify(avant)), now0), base = (i, rev) => rev * qs.postes[i].niv * HT.palierMult(qs.postes[i].niv) * HT.ameliorationMult(qs, i) * HT.reputationMult(qs);
    check(qs.postes[6].niv === 150 && qs.postes[7].niv === 60 && Math.abs(HT.revenuBase(qs, 6) / base(6, 1000) - 72) < 1e-9 && Math.abs(HT.revenuBase(qs, 7) / base(7, 8000) - 131.25) < 1e-9 && HT.prixNiveaux(qs, 6, 1) === HT.coutNiveaux(6, 150, 1),
      `relue en v6.4 : gâteaux niveau 150 et œufs niveau 60 gardés ; une fournée de gâteaux ${HT.fmtEur(HT.revenuBase(qs, 6))} (${HT.fmtEur(base(6, 1000))} avant), d’œufs ${HT.fmtEur(HT.revenuBase(qs, 7))} (${HT.fmtEur(base(7, 8000))} avant) ; les prix n’ont pas bougé`); }
  // le Marché des sorcières : les niveaux à moitié prix
  const qg = HT.etat({}, now7); qg.postes.forEach((x, i) => { x.niv = i < 6 ? 150 : 0; }); HT.gagner(qg, 5e14); qg.billets = 1e17; qg.mode = 10; const p0 = HT.prixNiveaux(qg, 5, 10);
  check(HT.amelioration(qg, 'marche').ok && HT.remise(qg) === 0.5 && HT.prixNiveaux(qg, 5, 10) === p0 / 2 && HT.prixNiveaux(qg, 6, 1) === GC.debloquer, `le Marché des sorcières : dix niveaux de citrouilles à ${HT.fmtEur(p0 / 2)} au lieu de ${HT.fmtEur(p0)} ; un déblocage garde son prix`);
  qg.mode = 'max'; qg.billets = HT.coutNiveaux(0, 150, 20) / 2; check(HT.quantite(qg, 0) === 20 && HT.acheter(qg, 0).ok && qg.postes[0].niv === 170, 'Max compte la remise : deux fois plus de niveaux pour les mêmes bonbons'); }
{ // la reprise d'une sauvegarde d'avant la mise à jour : 12 paliers marqués, 1 500 Bn gagnés (au-delà des 13e et 14e ; 3 000 Bn avant les seuils de la v6.7)
  const b = G.newState(now7), qv = HT.etat(b, now7); HT.gagner(qv, 1.5e15); for (let k = 1; k <= 12; k++) HT.marquerPalier(qv, k);
  const json = JSON.parse(JSON.stringify(b)), q2 = HT.etat(json, now7), e0 = json.etoiles;
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
// la recette du jour (v6.5) : le marathon et le très actif la jouent au mieux, d'office ; le rythme des paliers se vérifie AVEC elle (S, le
// jeu livré). S0 (sans elle) ne sert qu'à comparer : les totaux d'avant, et ce qu'elle ajoute.
const S0 = { marathon: HT.simuler('marathon', 7, { recette: false, manoir: false }) };
// lot 6 : SM, comme en v6.5 (la recette du jour, mais ni le ×6 qui s'endort ni les activités du Manoir : manoir: false) ; S, le jeu livré
const SM = { marathon: HT.simuler('marathon', 7, { manoir: false }), tresactif: HT.simuler('tresactif', 7, { manoir: false }) };
// revue du 20 octobre : l'enveloppe et l'équilibre des activités ne se jugent plus sur un seul tirage des coups de pouce (Math.random chez
// un vrai joueur) : d'autres graines, simulées en parallèle (test/fournil-hantee-graines.js, une par cœur). GRAINES_ENV : le marathon,
// Sortilèges achetés et offerts (les quatre d'avant, puis les plus justes des 120 graines de scratchpad lot5/tables-lot6.js : 13, 17, 29
// et 59 sous l'ancienne table, 48 et 117 sous la nouvelle) ; GRAINES_TA : le très actif, avec et sans le Manoir. v6.7 : toujours dix
// graines, les plus justes sous la table retirée (49 et 78 parmi ses 80, 103 et 111 parmi les 40 qu'elle n'a pas vues) au lieu de 29,
// 48, 59 et 117, qui l'étaient sous les tables d'avant.
// v6.7 : GRAINES_RY, le rythme des paliers des trois profils moyens (occasionnel, quotidien, assidu), jugé en médiane
const GRAINES_ENV = [7, 1, 2, 3, 13, 17, 49, 78, 103, 111], GRAINES_TA = [1, 2, 3, 4, 5, 6, 7, 8], GRAINES_RY = [1, 2, 3, 4, 5, 6, 7, 8], MOYENS = ['occasionnel', 'quotidien', 'assidu'];
const PAR = (() => { const taches = [];
  for (const p of MOYENS) for (const g of GRAINES_RY) if (g !== 7) taches.push({ cle: `${p}${g}`, profil: p, graine: g });
  for (const g of GRAINES_ENV) for (const offertes of [false, true]) if (g !== 7 || offertes) taches.push({ cle: `m${g}${offertes ? 'o' : ''}`, profil: 'marathon', graine: g, offertes, trace: true });
  for (const g of GRAINES_TA) if (g !== 7) for (const manoir of [true, false]) taches.push({ cle: `t${g}${manoir ? '' : 's'}`, profil: 'tresactif', graine: g, manoir });
  const res = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'fournil-hantee-graines.js')], { input: JSON.stringify(taches), encoding: 'utf8', maxBuffer: 1 << 30 }));
  const o = { m7: { total: S.marathon.total, paliersJour: S.marathon.paliersJour, trace: S.marathon.trace.map((x) => [x.t, x.total]) } }; // (la graine 7 du très actif : S.tresactif et SM.tresactif, plus bas)
  taches.forEach((t, k) => { o[t.cle] = res[k]; }); return o; })();
const jourDe = (prof, k) => S[prof].paliersJour[k] || Infinity;
const haut = (s) => Math.max(0, ...Object.keys(s.paliersJour).map(Number));
const parJourDe = (pj) => [1, 2, 3, 4, 5, 6, 7].map((j) => Object.values(pj).filter((x) => x === j).length); // combien de paliers chaque jour
const mediane = (a) => { const t = a.slice().sort((x, y) => x - y); return (t[(t.length - 1) >> 1] + t[t.length >> 1]) / 2; };
console.log('  ' + Object.keys(S).map((k) => `${k} : ${HT.fmtEur(S[k].total)}, paliers ${JSON.stringify(S[k].paliersJour)}`).join('\n  '));
// v6.7 (21 octobre), le « juste milieu » voulu par le joueur, en médiane sur huit graines (avant, sur la graine 7 seule : l'occasionnel au
// 6e palier, le quotidien au 10e, l'assidu au 13e ; visés alors 5-7, 8-10 et le 12e du 5e au dernier jour) : l'occasionnel au 9e ou au 10e,
// le quotidien au 12e ou au 13e, l'assidu au 15e ou au 16e ; aucune graine à plus d'un palier de là
{ const VISE = { occasionnel: [9, 10], quotidien: [12, 13], assidu: [15, 16] }, txt = [];
  for (const p of MOYENS) { const hs = GRAINES_RY.map((g) => haut(g === 7 ? S[p] : PAR[`${p}${g}`])), m = mediane(hs), [a, b] = VISE[p];
    txt.push(`${p} ${String(m).replace('.', ',')} (${Math.min(...hs)} à ${Math.max(...hs)} ; visé ${a}-${b})`);
    check(m >= a && m <= b && Math.min(...hs) >= a - 1 && Math.max(...hs) <= b + 1, `${p} (${HT.PROFILS[p].sessions.reduce((x, y) => x + y[1], 0)} min par jour) : le plus haut palier, ${String(m).replace('.', ',')} en médiane sur ${hs.length} graines (${hs.join(', ')} ; visé : ${a}-${b})`); }
  console.log('  ' + txt.join(' ; ')); }
// sur la graine 7 : le 12e de l'assidu le 4e jour (le jour de son ouverture ; du 5e au dernier avant la v6.7), le 15e ou le 16e à la fin
check(S.assidu.parJour.length === 7 && jourDe('assidu', 12) >= 4 && jourDe('assidu', 12) <= 5 && haut(S.assidu) >= 15 && haut(S.assidu) <= 16, `l’assidu (80 min par jour) franchit le palier 12 le ${jourDe('assidu', 12)}e jour sur 7 (visé : le 4e ou le 5e ; du 5e au dernier avant la v6.7), le ${haut(S.assidu)}e le ${jourDe('assidu', haut(S.assidu))}e`);
check(haut(S.quotidien) >= 12 && haut(S.quotidien) <= 13 && jourDe('quotidien', 12) >= 5, `le quotidien (36 min par jour) monte jusqu’au palier ${haut(S.quotidien)} (le ${jourDe('quotidien', haut(S.quotidien))}e jour ; le 12e le ${jourDe('quotidien', 12)}e ; le 10e au plus avant la v6.7)`);
check(haut(S.occasionnel) >= 9 && haut(S.occasionnel) <= 10 && jourDe('occasionnel', 1) === 1 && parJourDe(S.occasionnel.paliersJour).filter((n) => n > 0).length >= 5, `l’occasionnel (17 min par jour) monte jusqu’au palier ${haut(S.occasionnel)} (5 à 7 avant la v6.7), un ou deux par jour (${parJourDe(S.occasionnel.paliersJour).join(', ')}), le 1er dès son premier soir`);
check(S.marathon.total > S.assidu.total && S.assidu.total > S.quotidien.total && S.quotidien.total > S.occasionnel.total, 'plus on joue, plus on gagne : marathon > assidu > quotidien > occasionnel');
// (les six friandises du début : niv.slice(0, 6). Avant la v6.7, toutes les huit, que l'assidu n'avait jamais : findIndex donnait −1 et la
// borne passait d'office ; il ouvre maintenant les œufs de dragon au 16e)
check(S.assidu.parJour.findIndex((d) => d.niv.slice(0, 6).every((x) => x > 0)) >= 0 && S.assidu.parJour.findIndex((d) => d.niv.slice(0, 6).every((x) => x > 0)) <= 2 && S.assidu.parJour[3].staff >= 6, `l’assidu ouvre les six friandises dès le ${S.assidu.parJour.findIndex((d) => d.niv.slice(0, 6).every((x) => x > 0)) + 1}e jour et a ses six monstres au 4e (${S.assidu.parJour[3].staff} avec ceux d’après le maître)`);
check(S.assidu.parJour.every((d, k) => k === 0 || d.total >= S.assidu.parJour[k - 1].total) && S.assidu.q.stats.descentes > 0 && S.assidu.q.stats.grosClients > 0 && S.assidu.q.stats.scooters > 0, 'les totaux ne reculent jamais ; les coups de pouce ont joué');
check(HT.simuler('assidu', 7, { graine: 7 }).total === S.assidu.total, 'la simulation est déterministe (graine)');
{ // les recettes d'après le maître, le Marché et les Sortilèges ×3 n'arrivent qu'après le 12e : les paliers 1 à 12 des joueurs constants ne bougent pas
  // v6.7 : les jours de référence, ceux des seuils de la v6.7 (avant, ceux du 16 octobre : assidu 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6 ;
  // quotidien 1, 2, 2, 3, 4, 4, 5, 6, 7 ; occasionnel 2, 2, 3, 4, 6, 7) : les recettes d'après le maître n'y changent toujours rien
  const AVANT = { assidu: [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4], quotidien: [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 5, 6], occasionnel: [1, 2, 2, 3, 4, 4, 4, 5, 6, 7] };
  // v6.2 : les paliers intercalés les avancent d'un jour au plus (les recettes d'après le maître et le Marché n'y sont pour rien : elles arrivent après le 12e)
  for (const [prof, jours] of Object.entries(AVANT)) check(jours.every((j, k) => S[prof].paliersJour[k + 1] >= j - 1 && S[prof].paliersJour[k + 1] <= j), `${prof} : les paliers 1 à ${jours.length} au plus un jour plus tôt qu’avant (${jours.map((j, k) => `${j}→${S[prof].paliersJour[k + 1]}`).join(', ')})`); }
// (v6.7 : le 12e de l'assidu le 4e jour, celui de son ouverture, ou le 5e ; du 5e au 7e avant)
{ const res = []; let ok = true; for (let g = 1; g <= 8; g++) { const s = HT.simuler('assidu', 7, { graine: g }), j = s.paliersJour[12] || Infinity; res.push(j); if (!(j >= 4 && j <= 5)) ok = false; }
  check(ok, `et quel que soit le hasard des coups de pouce (8 graines) : palier 12 les jours ${res.join(', ')}`); }
{ // qui joue aussi la recette du jour sans être un marathonien (recette: true : une fournée relancée 5 s après sa sortie pour l'assidu, 10 s
  // pour l'occasionnel) : les paliers au plus un jour plus tôt, au plus un de plus, au tout dernier jour. Lot 6 + la part 0,25 (20 octobre) :
  // l'assidu qui la joue gagne ×1,7 à ×1,8 et touche le 14e
  // le 6e jour (le 7e à la part 0,04) : un de plus, l'avant-dernier jour au plus tôt
  for (const prof of ['assidu', 'occasionnel']) { const a = S[prof].paliersJour, r = HT.simuler(prof, 7, { recette: true }), b = r.paliersJour, ks = Object.keys(a).map(Number), plus = Object.keys(b).map(Number).filter((n) => !a[n]);
    check(ks.every((n) => b[n] >= a[n] - 1 && b[n] <= a[n]) && plus.length <= 1 && plus.every((n) => b[n] >= 6), `${prof}, la recette du jour jouée aussi (${r.q.recettes.fournees} fournées, niveau ${r.q.recettes.niv}, ×${(r.total / S[prof].total).toFixed(2).replace('.', ',')}) : ${ks.filter((n) => b[n] !== a[n]).map((n) => `${n}e ${a[n]}→${b[n]}`).join(', ') || 'les mêmes jours'}${plus.length ? `, et le ${plus[0]}e le ${b[plus[0]]}e jour` : ''}`); } }
{ // après le maître : le très actif (8 h par jour) et le marathon (la recette du jour au mieux)
  S.tresactif = HT.simuler('tresactif'); S0.tresactif = HT.simuler('tresactif', 7, { recette: false }); const T = S.tresactif.paliersJour;
  // lot 6 : les réglages des prix (le temps d'un niveau, les paliers de poste, le remboursement des gâteaux et des œufs, leur part) se
  // vérifient sur la trajectoire pour laquelle ils ont été faits (TA : v6.5, manoir: false) ; avec les activités du Manoir, le très actif
  // va plus vite (un jour plus tôt aux 15e-19e) et se trouve plus loin sur la courbe des prix (voir « lot 6 : la simulation »)
  const TA = SM.tresactif;
  console.log(`  très actif : ${HT.fmtEur(S.tresactif.total)}, paliers ${JSON.stringify(T)}, ${S.tresactif.q.recettes.fournees} fournées de la recette du jour (sans elle : ${HT.fmtEur(S0.tresactif.total)}, paliers ${JSON.stringify(S0.tresactif.paliersJour)})`);
  const jours = [12, 13, 14, 15, 16, 17, 18].map((k) => T[k] || Infinity), ecarts = jours.slice(1).map((j, k) => j - jours[k]);
  // le 20e : sans la recette du jour (S0), jamais pour le très actif. À la part 0,25 (+22 à +41 % par session jouée, src/activites.js), la
  // recette jouée sans arrêt double presque ses gains (×1,96 : 64 Bd) : 16e le 3e jour (4e), 19e le 5e (7e), et le 20e le 7e, le dernier
  // jour (jamais à la part 0,04). Borne : avec elle, le 20e au dernier jour seulement ; sans elle, jamais.
  // v6.7 : les paliers s'ouvrent au fil des jours ; le très actif (8 h par jour, avec ou sans la recette du jour) les prend dès leur
  // ouverture : quatre le premier jour, trois les quatre suivants, deux les deux derniers ; le 12e le 4e jour (le 2e avant), le 20e le 7e
  // (avant : le 20e le 7e avec la recette du jour, jamais sans elle ; 14 paliers dès le 2e jour). Bornes : au plus 4 le premier jour, au
  // plus 3 les autres, le 20e le 6e ou le 7e jour (avec et sans elle), deux ou trois par jour en médiane
  const pjT = parJourDe(T), pjT0 = parJourDe(S0.tresactif.paliersJour), T0s = S0.tresactif.paliersJour;
  check(T[12] <= 4 && T[18] <= 7 && ecarts.every((e) => e >= 0 && e <= 2) && [pjT, pjT0].every((pj) => pj[0] <= 4 && pj.slice(1).every((n) => n <= 3) && mediane(pj) >= 2 && mediane(pj) <= 3) && T[20] >= 6 && T[20] <= 7 && T0s[20] >= 6 && T0s[20] <= 7,
    `le très actif : ${pjT.join(', ')} paliers par jour (sans la recette du jour : ${pjT0.join(', ')}) ; le 12e le ${T[12]}e jour, puis (13e le ${T[13]}e, 15e le ${T[15]}e, 16e le ${T[16]}e, 17e le ${T[17]}e, 18e le ${T[18]}e) ; le 20e le ${T[20]}e jour (${T0s[20] ? `le ${T0s[20]}e` : 'jamais'} sans elle)`);
  // v6.3 (les gâteaux et les œufs en vraies recettes) : le très actif ne bouge presque pas (13e le 2e jour, 16e le 4e, comme avant ; il touche
  // le 19e le 7e jour, qu'il n'atteignait pas ; le 20e jamais) ; le marathon atteint le 20e le 5e jour (6e avant). Borne : 6e-7e → 5e-7e.
  // v6.4 (les gâteaux ×4, les œufs ×1,5) : le très actif ne bouge pas ; le marathon atteint le 20e le 4e jour (5e en v6.3). Borne : 4e-7e.
  // v6.5 (la recette du jour à la part 0,25, jouée sans arrêt) : le marathon atteint le 20e le 3e jour (4e sans elle et à la part 0,04).
  // Borne : 4e-7e → 3e-7e ; sans elle, toujours 4e-7e.
  check(jourDe('marathon', 20) >= 3 && jourDe('marathon', 20) <= 7 && S0.marathon.paliersJour[20] >= 4 && S0.marathon.paliersJour[20] <= 7, `le marathon n’atteint le 20e que le ${jourDe('marathon', 20)}e jour sur 7 avec la recette du jour (visé : 3e-7e), le ${S0.marathon.paliersJour[20]}e sans elle (visé : 4e-7e ; le 5e en v6.3, le 6e avant)`);
  // le temps d'un niveau (le moins cher : son prix, remise comprise, ÷ le taux du Manoir ouvert) : 30 min au 6e jour et 25 min au 7e avant
  const tNiv = (d) => Math.min(...d.niv.map((n, i) => (n > 0 ? HT.coutNiveau(i, n) * (d.remise || 1) / d.taux : Infinity))) / 60, t6 = tNiv(TA.parJour[5]), t7 = tNiv(TA.parJour[6]);
  check(t6 < 15 && t7 < 15, `le très actif attend moins pour un niveau : ${t6.toFixed(0)} min au 6e jour (30 avant), ${t7.toFixed(0)} min au 7e (25 avant)`);
  // le temps entre deux paliers de poste (toutes recettes, minutes de jeu), du 5e au 7e jour : 720 min avant les paliers intercalés et les recettes d'après le maître
  const ecartPaliers = (s, a, b, min) => { const nb = (niv, i) => HT.paliersPoste(i).filter((p) => niv >= p).length; let k = 0; for (let j = a; j <= b; j++) k += s.parJour[j - 1].niv.reduce((x, n, i) => x + nb(n, i) - nb(s.parJour[j - 2].niv[i] || 0, i), 0); return k ? min * (b - a + 1) / k : Infinity; };
  const eT = ecartPaliers(TA, 5, 7, 480), eA = ecartPaliers(S.assidu, 2, 4, 80);
  check(eT <= 240 && eA <= 60, `un palier de poste toutes les ${eT.toFixed(0)} min de jeu pour le très actif (jours 5-7 ; 720 avant), ${eA.toFixed(0)} min pour l’assidu (jours 2-4 ; 120 avant)`);
  check(TA.q.postes[6].niv >= 100 && TA.q.postes[7].niv >= 50 && TA.q.ameliorations.marche, `il ouvre les deux recettes (gâteaux niveau ${TA.q.postes[6].niv}, œufs ${TA.q.postes[7].niv}) et le Marché des sorcières`);
  // v6.4 : le remboursement MARGINAL d'un niveau (le prochain, remise comprise, ÷ ce qu'un niveau de plus rapporte par seconde, maître
  // présent, paliers compris) comparé à celui d'un niveau de citrouilles au même moment, en fin de journée du très actif (un jour où le
  // prochain niveau de l'une des deux franchit un palier est laissé de côté : il se rembourse d'un coup). Il achète la Pelle (gâteaux ×3)
  // le 4e jour, jamais le Nid (œufs ×3). Avec la Pelle, les gâteaux sont au moins aussi bons que les citrouilles (c'est voulu) ; sans
  // elle, pour LUI, ×2 à ×4 (il achète par dix niveaux, au palier suivant : comme au Quartier, test/fournil-quartier.test.js, où le ±×1,5
  // sans combine se vérifie sur le joueur réel). Les œufs, sans le Nid : ±×1,5 dès le lendemain du 16e.
  // v6.3 (remboursement marginal) : gâteaux ×1,4 à ×2,7 avec la Pelle (×4,3 à ×8 sans), œufs ×1,1 à ×1,2 (et ×2,2 le jour du 16e).
  const PJ = TA.parJour, SP = 5, x = (v) => '×' + v.toFixed(2).replace('.', ',');
  const marg = (d, i, sans) => { const n = d.niv[i], P = HT.PRODUITS[i], am = { ...d.ameliorations }; if (sans) delete am[sans]; const pq = { postes: d.niv.map((niv) => ({ niv })), ameliorations: am, total: d.total };
    return HT.coutNiveau(i, n) * d.remise / ((P.rev * (n + 1) * HT.palierMult(n + 1) - P.rev * n * HT.palierMult(n)) * HT.ameliorationMult(pq, i) * HT.reputationMult(pq) * HT.PRESENCE / P.temps); };
  const net = (d, i) => HT.prochainPalier(d.niv[i]) !== d.niv[i] + 1 && HT.prochainPalier(d.niv[SP]) !== d.niv[SP] + 1;
  const fois = (d, i, sans) => marg(d, i, sans) / marg(d, SP), bornes = (a) => `${x(Math.min(...a))} à ${x(Math.max(...a))}`;
  const jP = PJ.findIndex((d) => d.ameliorations.pelle) + 1, j16 = TA.paliersJour[16];
  const dP = PJ.filter((d) => d.j >= jP && net(d, 6)), dO = PJ.filter((d) => d.j > j16 && net(d, 7));
  const gc = dP.map((d) => fois(d, 6)), gcSans = dP.map((d) => fois(d, 6, 'pelle')), od = dO.map((d) => fois(d, 7));
  check(jP >= 3 && dP.length >= 3 && gc.every((v) => v <= 1.5) && gcSans.every((v) => v <= 4.5),
    `un niveau de gâteaux, Pelle achetée (${jP}e jour), se rembourse à peu près comme un niveau de citrouilles, ou mieux : ${bornes(gc)} jusqu’au dernier jour (sans elle ${bornes(gcSans)})`);
  // le réglage des produits (±×1,5) se vérifie sur le très actif SANS la recette du jour (S0 : exactement la partie de la v6.4, où il a été
  // fait) ; avec elle (part 0,25), il est deux fois plus riche, ouvre les œufs un jour plus tôt (16e le 3e jour) et les monte bien plus
  // haut : un niveau d'œufs se rembourse alors plus vite qu'un niveau de citrouilles, ×0,33 à ×1,05. Borne avec elle : ×0,3 à ×1,5.
  const PJ0 = S0.tresactif.parJour, j16s = S0.tresactif.paliersJour[16], od0 = PJ0.filter((d) => d.j > j16s && net(d, 7)).map((d) => fois(d, 7));
  check(j16s >= 3 && od0.length >= 2 && od0.every((v) => v >= 1 / 1.5 && v <= 1.5),
    `les œufs, sans le Nid (très actif sans la recette du jour) : ${bornes(od0)} du ${j16s + 1}e jour au dernier (visé ±×1,5)`);
  check(j16 >= 3 && dO.length >= 2 && od.every((v) => v >= 0.3 && v <= 1.5),
    `avec la recette du jour (part 0,25) : ${bornes(od)} du ${j16 + 1}e jour au dernier (visé ×0,3 à ×1,5 : les œufs rentables plus tôt)`);
  // leur part des gains à la fin : 29 % en v6.3. Avec la Pelle, les gâteaux absorbent l'essentiel des bonbons du très actif (2 % de plus
  // par niveau) : le visé (~45 % au plus) ne tient pas en même temps que le ±×1,5 sans combine ; borne : 60 %.
  // Sans la recette du jour (S0, le réglage de la v6.4) : 60 % au plus. Avec elle (part 0,25), le très actif deux fois plus riche monte
  // surtout les œufs (42 %) : 73 % ; borne avec elle : 80 %.
  const parts = (qf) => { const taux = qf.postes.map((s, i) => (s.niv > 0 ? HT.revenuBase(qf, i) / HT.temps(qf, i) : 0)), tot = taux.reduce((a, b) => a + b, 0); return taux.map((t) => t / tot); };
  const pc = (v) => (v * 100).toFixed(1).replace('.', ',') + ' %', part0 = parts(S0.tresactif.q), part = parts(TA.q);
  check(part0[6] >= 0.2 && part0[7] >= 0.1 && part0[6] + part0[7] <= 0.6,
    `montées, elles font ${((part0[6] + part0[7]) * 100).toFixed(0)} % de ses gains à la fin sans la recette du jour (gâteaux ${pc(part0[6])}, œufs ${pc(part0[7])}, citrouilles ${(part0[5] * 100).toFixed(0)} % ; 29 % en v6.3, 1,2 % avant)`);
  check(part[6] >= 0.2 && part[7] >= 0.1 && part[6] + part[7] <= 0.8,
    `avec elle : ${((part[6] + part[7]) * 100).toFixed(0)} % (gâteaux ${pc(part[6])}, œufs ${pc(part[7])}, citrouilles ${(part[5] * 100).toFixed(0)} % ; visé : 80 % au plus)`);
  // v6.7 : le quotidien touche le premier bonus (le 13e) en fin de semaine, pas le 14e ; l'assidu le 13e dès son ouverture, le 4e jour
  // (avant : le quotidien n'en voyait aucun, l'assidu touchait le 13e en toute fin)
  check(jourDe('assidu', 13) >= 4 && (jourDe('quotidien', 13) >= 5) && !S.quotidien.paliersJour[14], `le quotidien voit le premier palier bonus en fin de semaine (${jourDe('quotidien', 13) === Infinity ? 'jamais' : jourDe('quotidien', 13) + 'e jour'}), pas le 14e ; l’assidu touche le 13e le ${jourDe('assidu', 13)}e jour (jamais avant son ouverture, le 4e)`); }

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
  let ouMin = '';
  for (const g of GRAINES_ENV) for (const offertes of [false, true]) { const s = PAR[`m${g}${offertes ? 'o' : ''}`]; // offertes : le pire cas, tous les Sortilèges d'après le maître dès le 12e
    for (const [t, v] of s.trace) if (v > 0) { const m = borne(t) - Math.log10(v); if (m < minM) { minM = m; ouMin = `graine ${g}${offertes ? ', Sortilèges offerts' : ''}, ${t.toFixed(2).replace('.', ',')} j`; } if (t > 0.25) maxM = Math.max(maxM, m); } }
  check(minM >= Math.log10(2.2) - 1e-9, `le marathon 24 h/24 (${GRAINES_ENV.length} graines, minute par minute, Sortilèges en plus achetés ou offerts dès le 12e, la recette du jour et les activités du Manoir au mieux) reste sous l’enveloppe avec au moins ×2,2 de marge (×${Math.pow(10, minM).toFixed(2).replace('.', ',')} au plus juste : ${ouMin}) — la table v6.6 de fournil_evts(), calée à ×2,3 sur 80 graines (retirée en v6.7)`);
  // v6.7 : la réputation suit les bonbons, et les seuils plus bas jusqu'au 12e la donnent toute au marathon dès les premières heures (×3 à
  // ×10 plus haut qu'avant entre la 2e et la 6e heure) ; le 1er pas de la table (6 h) monte d'autant (14,5 → 16,1 : l'interpolation depuis
  // l'ouverture doit couvrir ces heures-là) et la marge est large juste après (×34 à 6 h 01 sur les 80 graines de la table), le temps que le
  // marathon rattrape ce pas. Borne : ×20 après les sept premières heures et quart (0,3 j ; six heures avant, ×13,6 au plus large)
  maxM = -Infinity; for (const g of GRAINES_ENV) for (const offertes of [false, true]) for (const [t, v] of PAR[`m${g}${offertes ? 'o' : ''}`].trace) if (v > 0 && t > 0.3) maxM = Math.max(maxM, borne(t) - Math.log10(v));
  check(maxM <= Math.log10(20), `mais pas plus de ×20 après les sept premières heures (×${Math.pow(10, maxM).toFixed(1).replace('.', ',')} au plus large) : un tricheur ne s’envole pas`);
  check(S.assidu.trace.every((x) => x.total === 0 || borne(x.t) - Math.log10(x.total) >= 1), 'un assidu honnête est toujours au moins dix fois sous l’enveloppe');
  // avec les recettes d'après le maître et le Marché des sorcières (16 octobre) : les recettes prennent leur part des bonbons (le marathon
  // simulé achète d'abord le niveau le moins cher), ce qui compense le Marché ; la pleine lune du Sortilège « Nuages » passe à 2 min 30
  // pour la fin de la première nuit (×2,04 au plus juste, minute par minute, contre ×2,05 avant)
  // v6.2 : les paliers intercalés montent les totaux (88 Bd, 97,8 Bd Sortilèges offerts) ; la table de fournil_evts() a été élargie d'autant (au
  // plus juste : le marathon le plus haut des huit simulations × 2,2 à chaque pas de 6 h, arrondi au 0,05 du log10 supérieur, relevé là où
  // l'interpolation entre deux pas passait sous ×2 ; jamais plus bas qu'avant)
  // v6.3 (les gâteaux ×18, les œufs ×87,5) : 148 Bd, 284 Bd Sortilèges offerts (les deux ×3 dès le 12e) ; la table de fournil_evts() élargie
  // de même (supabase/fournil-classement.sql et sa mise à jour fournil-classement-v63.sql) : du pas 4 (24 h) au dernier, +0,05 à +0,45 en
  // log10 ({…,16.1,16.3,…,17.35} → {…,16.1,16.35,…,17.8}) ; ×2,14 au plus juste, ×8,4 au plus large après six heures.
  const off = HT.simuler('marathon', 7, { offertes: true, recette: false, manoir: false }).total;
  // v6.4 (les gâteaux ×4, les œufs ×1,5) : 396 Bd, 619 Bd Sortilèges offerts ; la table de fournil_evts() élargie de même : du pas 3 (18 h)
  // au dernier, +0,1 à +0,35 en log10 ({…,16.1,16.35,…,17.8} → {…,16.2,16.55,…,18.15}) ; ×2,14 au plus juste, ×8,4 au plus large après six heures.
  // v6.5 (la recette du jour, src/activites.js) : sans elle, le marathon gagne EXACTEMENT les mêmes bonbons qu'en v6.4 ; jouée au mieux (à
  // la part 0,04), ×1,15 : 455 Bd, 680 Bd Sortilèges offerts. La table de fournil_evts() élargie de même (scratchpad lot5/tables.js : à
  // chaque pas de 6 h, max(v6.4, log10 du marathon le plus haut des huit simulations + log10 2,2), arrondi au 0,05 supérieur, relevé là où
  // l'interpolation passait sous ×2,2 ; la 2e valeur au moins 14,2) : {11.65,14.05,16.05,16.2,…,18.15} → {11.65,14.2,16.05,16.25,…,18.2} ;
  // ×2,21 au plus juste, ×8,3 au plus large après six heures (la v6.4 tombait à ×2,02 avec la recette).
  // La part passée à 0,25 (+22 à +41 % par session jouée) : ×2,01 au marathon (799 Bd, 1 Tn Sortilèges offerts) ; la table tirée de même
  // (jamais sous la v6.4, la 2e valeur 14,2) : {11.65,14.2,16.05,16.25,…,18.2} → {11.65,14.2,16.05,16.35,…,18.4} ; ×2,21 au plus juste,
  // ×8,3 au plus large après six heures.
  // v6.7 (les paliers qui s'ouvrent au fil des jours : les recettes et les Sortilèges « après le palier » attendent leur jour, les gâteaux
  // du cimetière le 4e, les œufs de dragon le 5e, au lieu du premier soir) : sans la recette du jour, 260 Bd et 338 Bd Sortilèges offerts
  // (396 Bd et 619 Bd avant)
  check(Math.abs(S0.marathon.total / 2.60e17 - 1) < 0.02 && Math.abs(off / 3.38e17 - 1) < 0.02, `sans la recette du jour, le marathon : ${HT.fmt(S0.marathon.total)} (${HT.fmt(off)} Sortilèges offerts ; 396 Bd et 619 Bd avant la v6.7 ; 148 Bd et 284 Bd en v6.3, 88 Bd et 97,8 Bd avant, 76,5 Bd et 88,6 Bd sans les paliers intercalés ni les recettes d’après le maître)`);
  // (la part 0,25, master du 20 octobre : 799 Bd ; 455 Bd à la part 0,04 ; v6.7 : 482 Bd)
  check(Math.abs(SM.marathon.total / 4.82e17 - 1) < 0.02, `avec elle, jouée au mieux : ${HT.fmt(SM.marathon.total)} (×${(SM.marathon.total / S0.marathon.total).toFixed(2).replace('.', ',')} ; 799 Bd avant la v6.7)`);
  // lot 6 (19 octobre) : le ×6 qui s'endort (le marathon touche toujours : rien ne change pour lui) et les activités du Manoir (clients,
  // fournées parfaites, apparitions, commandes de la nuit), jouées au mieux : ×1,20 (545 Bd, 811 Bd Sortilèges offerts). La table de
  // fournil_evts() élargie de même (scratchpad lot5/tables-lot6.js, la méthode de la v6.5 : à chaque pas de 6 h, max(v6.4, log10 du marathon
  // le plus haut des huit simulations + log10 2,2), arrondi au 0,05 supérieur, relevé là où l'interpolation passait sous ×2,2 ; la 2e valeur
  // au moins 14,2) : {11.65,14.2,16.05,16.25,…,18.2} → {11.65,14.75,16.4,16.45,…,18.3} ; ×2,21 au plus juste, ×11,8 au plus large après
  // six heures (la table v6.5 tombait à ×0,94 : les activités paient dès le premier jour, quand l'économie grimpe le plus vite).
  // v6.6 (20 octobre) : la recette du jour à la part 0,25 (799 Bd) ET les activités réglées pour le très actif (environ +21 %, médiane de
  // huit graines ; les fournées parfaites rognées en minutes du rythme, 11 l'heure) : ×1,08 au marathon (861 Bd, 1,1 Tn Sortilèges
  // offerts). La table tirée de même (scratchpad lot5/tables-lot6.js, jamais sous la v6.5 en ligne, la 2e valeur au moins 14,2) :
  // {11.65,14.2,16.05,16.35,…,18.4} → {11.65,14.35,16.3,16.4,…,18.4} ; ×2,21 au plus juste… sur les quatre graines qui l'avaient faite.
  // La revue l'a vue tomber à ×2,06 sur la graine 13 (Sortilèges offerts), et une table calée sur vingt graines à ×2,00 sur la 59e (au
  // début de la première nuit, quand un coup de pouce chanceux pèse le plus). Elle est donc calée sur 80 graines (1 à 80, achetés et
  // offerts : 160 marathons) à ×2,3, pour que ×2,2 tienne sur celles qu'elle n'a pas vues : {11.65,14.5,16.35,16.45,16.9,…,18.45}
  // (supabase/fournil-classement-v66.sql) ; ×2,30 au plus juste sur les 80, ×2,30 aussi sur les graines 81 à 120 qu'elle n'a pas vues,
  // ×13,6 au plus large après six heures (la v6.5 tombait à ×1,69, dans la première nuit).
  // v6.7 (21 octobre, les paliers du « juste milieu ») : la table retirée de même (80 graines, ×2,3, jamais sous la v6.5 en ligne) :
  // {11.65,14.5,16.35,16.45,16.9,…,18.45} → {11.65,16.1,16.1,16.35,16.75,…,18.4} : le 1er pas monte (les premières heures, voir plus
  // haut), tous les autres retombent sur la v6.5 (le marathon gagne moins : 511 Bd au lieu de 861) ; ×2,36 au plus juste sur les 80.
  // v6.7 : 511 Bd (861 Bd avant ; ×1,06 au lieu de ×1,08 : les activités paient en minutes du rythme, plus bas les premiers jours)
  check(Math.abs(S.marathon.total / 5.11e17 - 1) < 0.03 && S.marathon.total > SM.marathon.total * 1.04, `avec les activités du Manoir, jouées au mieux : ${HT.fmt(S.marathon.total)} (×${(S.marathon.total / SM.marathon.total).toFixed(2).replace('.', ',')} ; v6.5 : ${HT.fmt(SM.marathon.total)})`);
}

console.log('── lot 6 : le ×6 qui s’endort sans toucher ──');
const T6 = HT.DEBUT + 22 * 3600e3; // le lendemain de l'ouverture, 10 h
const prep6 = (t, opts) => { const st = {}, q = HT.etat(st, t); HT.gagner(q, 1e7); for (let i = 1; i < 4; i++) HT.acheter(q, i); HT.embaucher(q, 0); HT.embaucher(q, 1); q.now = t; q.lastSeen = t; HT.toucher(q, t); if (opts && opts.vide) { q.manoir.prochainClient = t + 1e9; q.manoir.prochaineApp = t + 1e9; q.manoir.prochaineCommande = t + 1e9; } return { st, q }; };
{ const { q } = prep6(T6), e = (s) => HT.eveil(q, T6 + s * 1000);
  check(HT.EVEIL.plein === 60 && HT.EVEIL.sommeil === 180 && e(0) === 1 && e(60) === 1 && Math.abs(e(150) - 0.5) < 1e-12 && e(240) === 0 && e(3600) === 0, 'l’éveil : plein 60 s après le dernier toucher, puis en ligne droite jusqu’à 0 en 3 min (0,5 à 2 min 30)');
  q.now = T6 + 30e3; const b30 = HT.boostMult(q); q.now = T6 + 150e3; const b150 = HT.boostMult(q); q.now = T6 + 300e3; const b300 = HT.boostMult(q);
  check(b30 === HT.PRESENCE && Math.abs(b150 - 3.5) < 1e-12 && b300 === 1, `la présence : ×${b30} à 30 s, ×${String(b150).replace('.', ',')} à 2 min 30, ×${b300} au-delà de 4 min`);
  const r0 = HT.revenu(q, 0); HT.toucher(q, q.now);
  check(HT.boostMult(q) === HT.PRESENCE && HT.revenu(q, 0) === r0 * HT.PRESENCE && HT.revenuBase(q, 0) === r0, 'un seul toucher le remet au plein (le revenu de base, lui, ne bouge pas)');
  HT.lancerEvenement(q, () => 0.5, 'soiree'); const lune = HT.boostMult(q), actif = q.actif; q.actif -= 300e3; const luneDort = HT.boostMult(q);
  check(lune === HT.PRESENCE * 2 && luneDort === 2, 'sous la pleine lune : ×12 réveillé, ×2 endormi');
  const p = HT.presence(q, q.now); q.actif = actif;
  check(p.eveil === 0 && p.dort && p.mult === 1 && p.plein === 0 && p.zero === 0 && HT.presence(q, q.now).plein === 60e3 && HT.presence(q, q.now).zero === 240e3, 'presence() pour la jauge : éveil, multiplicateur, ce qui reste au plein et avant ×1');
  const { q: qb } = prep6(T6, { vide: true }); HT.embaucher(qb, 2); const tb = HT.tauxBase(qb); let gEv = 0, gDort = 0;
  for (let k = 1; k <= 60; k++) { const o = HT.tick(qb, 1, T6 + k * 1000, () => 0.5); gEv += o.ventes.reduce((s, v) => s + v.montant, 0); }
  qb.actif = T6 - 3600e3; for (let k = 61; k <= 120; k++) { const o = HT.tick(qb, 1, T6 + k * 1000, () => 0.5); gDort += o.ventes.reduce((s, v) => s + v.montant, 0); }
  check(Math.abs(gEv / (tb * 60 * HT.PRESENCE) - 1) < 0.1 && Math.abs(gDort / (tb * 60) - 1) < 0.1, `une minute réveillé : ${HT.fmt(gEv)} (×6 du rythme) ; une minute endormi : ${HT.fmt(gDort)} (×1)`); }
{ const s = { hantee: JSON.parse(JSON.stringify(HT.neuf(T6 - 3600e3))) }; delete s.hantee.actif; delete s.hantee.manoir; for (const k of ['clientsServis', 'parfaits', 'commandes']) delete s.hantee.stats[k];
  const q = HT.etat(s, T6);
  check(q.actif === T6 && HT.eveil(q, T6) === 1 && q.manoir && Array.isArray(q.manoir.file) && q.stats.clientsServis === 0 && q.stats.parfaits === 0, 'une vieille sauvegarde (sans q.actif ni q.manoir) : actif maintenant, le Manoir remis à neuf, les compteurs à zéro');
  const s2 = { hantee: Object.assign(HT.neuf(T6), { actif: 'x', manoir: { file: [{ id: 1, sorte: 'dragon', commande: [], arrive: 0 }, { id: 2, sorte: 'momie', commande: [{ i: 0, n: 2 }], arrive: T6 }], apps: 'x', commande: { i: 99 }, h: null, graine: 'z', bilan: { clients: { n: -1 } } } }) };
  const q2 = HT.etat(s2, T6);
  check(q2.actif === T6 && q2.manoir.file.length === 1 && q2.manoir.file[0].sorte === 'momie' && q2.manoir.file[0].commande[0].servi === false && Array.isArray(q2.manoir.apps) && q2.manoir.commande === null && q2.manoir.h.clients === 0 && Number.isFinite(q2.manoir.graine) && q2.manoir.bilan.clients.n === 0 && q2.manoir.bilan.parfaits.gain === 0, 'un Manoir abîmé (sorte inconnue, commande vide, champs faux) : remis d’aplomb, le client valable gardé');
  const q3 = HT.etat({}, T6 - 9 * 3600e3); q3.lastSeen = q3.now; q3.actif = q3.now - 3600e3; HT.absence(q3, T6);
  check(q3.actif === T6 && HT.eveil(q3, T6) === 1, 'revenir (l’absence) réveille le Manoir'); }

console.log('── lot 6 : les clients-monstres ──');
check(HT.SORTES.length === 9 && HT.SORTES.join() === 'squelette,squelette-sorcier,zombie,citrouille,fantome,momie,sorciere,vampire,loup' && HT.SORTES.every((k) => typeof HT.FICHE.manoir.sortes[k] === 'string'), `neuf sortes de clients, les clés de la scène (${HT.SORTES.join(', ')}), chacune son nom`);
{ const { q } = prep6(T6); let arrives = [], partis = [], t = T6;
  for (let k = 1; k <= 120; k++) { t = T6 + k * 1000; const o = HT.tick(q, 1, t, () => 0.5); arrives = arrives.concat(o.manoir.arrives); partis = partis.concat(o.manoir.partis); if (k === 3) check(o.manoir.arrives.length === 1 && arrives.length === 1, 'le premier client entre deux secondes après le premier pas de l’écran'); }
  const ecarts = arrives.slice(1).map((c, k) => (c.arrive - arrives[k].arrive) / 1000), ouverts = q.postes.map((s, i) => i).filter((i) => q.postes[i].niv > 0);
  check(q.manoir.file.length <= 3 && arrives.length >= 4 && arrives.every((c) => HT.SORTES.includes(c.sorte) && c.commande.length >= 1 && c.commande.length <= 3 && new Set(c.commande.map((l) => l.i)).size === c.commande.length && c.commande.every((l) => ouverts.includes(l.i) && l.n >= 1 && l.n <= 3)),
    `en 2 min sans servir : ${arrives.length} clients (${arrives.map((c) => c.sorte).join(', ')}), jamais plus de trois dans la file ; chacun une à trois friandises ouvertes, une à trois de chaque`);
  check(ecarts.every((e) => e >= 8 && e <= 40) && partis.length >= 1 && q.stats.clientsPartis === partis.length && q.billets >= 0, `ils arrivent toutes les 8 à 20 s (la file pleine retarde le suivant : ${ecarts.map((e) => e.toFixed(0)).join(', ')} s) ; après 40 s d’attente, ils repartent sans rien (${partis.length} partis, aucune pénalité)`);
  const c = q.manoir.file[0], autre = q.postes.findIndex((s, i) => s.niv > 0 && !c.commande.some((l) => l.i === i)), b0 = q.billets;
  const faux = HT.servir(q, c.id, autre);
  check(!faux.ok && faux.faux && c.commande.every((l) => !l.servi) && q.billets === b0 && !HT.servir(q, 9999, 0).ok, 'servir la mauvaise friandise : refusé (rien de perdu) ; un client inconnu : refusé');
  let r; for (const l of c.commande) r = HT.servir(q, c.id, HT.PRODUITS[l.i].id);
  const att = (q.now - c.arrive) / 1000, u = c.commande.reduce((s, l) => s + l.n, 0), m = HT.CLIENTS.minutes * u * (1 + HT.CLIENTS.vite * Math.max(0, 1 - att / 40));
  check(r.ok && r.fini && r.prime === HT.arrondi(Math.max(1, HT.rythme(q) * m * 60)) && q.billets === b0 + r.prime && !q.manoir.file.includes(c) && q.stats.clientsServis === 1, `servi ligne par ligne (par l’id du produit ou son rang) : ${u} friandise${u > 1 ? 's' : ''} après ${att.toFixed(0)} s d’attente, +${HT.fmt(r.prime)} (${(m * 60).toFixed(1).replace('.', ',')} s du rythme)`); }
{ const { q } = prep6(T6); let t = T6; const vite = [], lent = [];
  for (let k = 1; k <= 200 && (vite.length < 3 || lent.length < 3); k++) { t = T6 + k * 1000; HT.tick(q, 1, t, () => 0.5); HT.toucher(q, t);
    for (const c of q.manoir.file.slice()) { const a = (t - c.arrive) / 1000, u = c.commande.reduce((s, l) => s + l.n, 0), tard = c.id % 2 === 0;
      if (tard ? a >= 39 : a >= 0) { let r; for (const l of c.commande) r = HT.servir(q, c.id, l.i); (tard ? lent : vite).push(r.prime / u); } } }
  check(Math.min(...vite) > Math.max(...lent) * 1.35, `servi tout de suite, un pourboire jusqu’à ×1,5 de celui d’un client servi à la dernière seconde (${HT.fmt(Math.min(...vite))} contre ${HT.fmt(Math.max(...lent))} par friandise)`); }
{ const { q } = prep6(T6), M = q.manoir; let paye = 0, n = 0;
  for (let k = 0; k < 400; k++) { M.file.push({ id: 1e6 + k, sorte: 'momie', commande: [{ i: 0, n: 3, servi: false }], arrive: q.now }); const r = HT.servir(q, 1e6 + k, 0); paye += r.prime; n++; if (r.plafond) break; }
  const minH = M.h.clients;
  check(Math.abs(minH - HT.CLIENTS.parHeure) < 1e-9 && n < 400 && HT.servir(q, (M.file.push({ id: 7e6, sorte: 'zombie', commande: [{ i: 0, n: 1, servi: false }], arrive: q.now }), 7e6), 0).prime === 0 && HT.plafondsManoir(q).clients.plein,
    `le plafond de l’heure : ${HT.CLIENTS.parHeure} min du rythme (${n} clients servis d’affilée, +${HT.fmt(paye)}) ; au-delà, on sert pour le plaisir`);
  let heures = 0; for (let h = 1; h <= 30 && M.j.clients < HT.CLIENTS.parJour - 1e-9; h++) { q.now = T6 + h * 3600e3; for (let k = 0; k < 400; k++) { M.file.push({ id: 2e6 + h * 1000 + k, sorte: 'loup', commande: [{ i: 0, n: 3, servi: false }], arrive: q.now }); if (HT.servir(q, 2e6 + h * 1000 + k, 0).plafond) break; } heures = h; }
  check(Math.abs(M.j.clients - HT.CLIENTS.parJour) < 1e-9 && HT.dayKey(q.now) === HT.dayKey(T6), `et celui du jour de Paris : ${HT.CLIENTS.parJour} min (atteint en ${heures + 1} h de service sans relâche)`); }

console.log('── lot 6 : les fournées parfaites ──');
{ const { q } = prep6(T6, { vide: true }); const i = 2; // les cookies fantômes : 6 s, à la main
  check(HT.fenetreParfait(q, i) === null && HT.fenetreParfait(q, 0) === null && HT.lancer(q, 0) === false, 'pas de fenêtre sans fournée en cours, ni sur un poste tenu par son monstre');
  HT.lancer(q, i); const w = HT.fenetreParfait(q, i);
  check(w && Math.abs(w.fin - w.debut - 0.15) < 1e-12 && w.debut >= 0.3 && w.fin <= 0.9 && w.duree === 6 && !w.essai, `une fournée de cookies (6 s) : la fenêtre « parfait » de ${(w.debut * 100).toFixed(0)} à ${(w.fin * 100).toFixed(0)} % (15 % de la durée)`);
  check(JSON.stringify(HT.fenetreParfait(JSON.parse(JSON.stringify(q)), i)) === JSON.stringify(w), 'déterministe : la même fournée (relue de la sauvegarde) a la même fenêtre');
  const places = new Set(); for (let k = 0; k < 20; k++) { const q2 = JSON.parse(JSON.stringify(q)); q2.postes[i].actif = false; q2.now = T6 + k * 7777; HT.lancer(q2, i); places.add(HT.fenetreParfait(q2, i).debut.toFixed(3)); }
  check(places.size >= 15, `sa place se tire du lancement : ${places.size} places différentes sur 20 lancements`);
  const b0 = q.billets, tot = HT.parfait(q, i, q.now + (w.debut * 6 - 0.3) * 1000);
  check(tot.ok && !tot.parfait && tot.tot && q.billets === b0 && !HT.parfait(q, i, q.now + (w.debut + 0.07) * 6000).ok && HT.parfait(q, i, q.now).deja, 'trop tôt : rien de perdu, mais l’essai est passé (un seul par fournée)');
  q.postes[i].actif = false; q.now += 1000; HT.lancer(q, i); const w2 = HT.fenetreParfait(q, i), rf = HT.revenuFournee(q, i), b1 = q.billets;
  const ok = HT.parfait(q, i, q.now + (w2.debut + 0.07) * 6000);
  check(ok.ok && ok.parfait && ok.prime === rf && q.billets === b1 + rf && q.stats.parfaits === 1, `dans la fenêtre : la fournée vaut ×2 (+${HT.fmt(ok.prime)} tout de suite, puis la vente habituelle)`);
  q.postes[0].staff = false; q.postes[0].actif = false; HT.lancer(q, 0); check(HT.fenetreParfait(q, 0) === null, 'une fournée de moins de 6 s (les acidulés, 1,5 s) : pas de fenêtre');
  for (let k = 0; k < 60; k++) { q.postes[i].actif = false; HT.lancer(q, i); const wk = HT.fenetreParfait(q, i); HT.parfait(q, i, q.now + (wk.debut + 0.07) * 6000); }
  check(q.manoir.h.parfaits === HT.PARFAIT.parHeure && q.stats.parfaits === 61 && q.manoir.bilan.parfaits.n === 61, `au plus ${HT.PARFAIT.parHeure} fournées parfaites payées par heure (les suivantes : « parfait », sans le double)`); }
{ const { q } = prep6(T6, { vide: true }); HT.gagner(q, 1e9); HT.preparerRecette(q, T6); const L = HT.lancerRecette(q, T6), fo = q.recettes.four, w = HT.fenetreParfait(q, -1), b0 = q.billets;
  const r = HT.parfait(q, -1, fo.debut + (w.debut + 0.05) * (fo.fin - fo.debut));
  check(L.ok && w && r.parfait && r.prime === fo.gain && q.billets === b0 + fo.gain && HT.fenetreParfait(q, 'recette').parfait, `la recette du jour (${L.r.temps} s) aussi : parfaite, +${HT.fmt(r.prime)} tout de suite (×2), la fournée sort ensuite comme d’habitude`); }
{ // le double rogné en minutes du rythme (20 octobre) : une fournée de la recette du jour à la part 0,25 vaut plusieurs minutes ; au plus
  // PARFAIT.minutes l'heure (PARFAIT.minutesJour le jour) : la dernière parfaite de l'heure paie ce qui reste, les suivantes rien
  const { q } = prep6(T6, { vide: true }); HT.gagner(q, 1e9); HT.preparerRecette(q, T6); HT.lancerRecette(q, T6); const fo = q.recettes.four, w = HT.fenetreParfait(q, -1), M = q.manoir;
  HT.plafondsManoir(q, T6); M.h.minParfaits = HT.PARFAIT.minutes - 0.001; const r60 = HT.rythme(q) * 60, b0 = q.billets;
  const r = HT.parfait(q, -1, fo.debut + (w.debut + 0.05) * (fo.fin - fo.debut)), pl = HT.plafondsManoir(q, q.now).parfaits;
  check(HT.PARFAIT.minutes === 11 && HT.PARFAIT.minutesJour === 80 && fo.gain > r60 * 0.001 && r.parfait && r.plafond && r.prime === HT.arrondi(Math.max(1, r60 * 0.001)) && q.billets === b0 + r.prime && pl.plein && Math.abs(pl.minutes - HT.PARFAIT.minutes) < 1e-9,
    `au plus ${HT.PARFAIT.minutes} min du rythme l’heure (${HT.PARFAIT.minutesJour} le jour) : la fournée de la recette (${HT.fmt(fo.gain)}) ne double plus que de ce qui reste (+${HT.fmt(r.prime)}), et le plafond est plein`);
  const vieux = JSON.parse(JSON.stringify(M)); delete vieux.h.minParfaits; delete vieux.j.minParfaits; const q2 = { ...q, manoir: vieux }; HT.reparerManoir(q2, q.now);
  check(vieux.h.minParfaits === 0 && vieux.j.minParfaits === 0, 'une sauvegarde d’avant ce plafond : ses compteurs en minutes repartent de zéro'); }

console.log('── lot 6 : les apparitions ──');
{ const { q } = prep6(T6); const nees = [], perdues = [];
  for (let k = 1; k <= 1200; k++) { const o = HT.tick(q, 1, T6 + k * 1000, () => 0.5); nees.push(...o.manoir.apparitions); perdues.push(...o.manoir.perdues); }
  const ecarts = nees.slice(1).map((a, k) => (a.debut - nees[k].debut) / 1000), vies = nees.map((a) => (a.fin - a.debut) / 1000);
  check(nees.length >= 15 && nees.length <= 60 && ecarts.every((e) => e >= 20 && e <= 61) && vies.every((v) => v >= 6 && v <= 10) && new Set(nees.map((a) => a.type)).size === 3 && nees.every((a) => HT.TYPES_APPARITION.includes(a.type)),
    `en 20 min : ${nees.length} apparitions (fantômes, citrouilles, chauves-souris), une toutes les 20 à 60 s, chacune 6 à 10 s`);
  check(perdues.length >= nees.length - 1 && perdues.length === nees.length - q.manoir.apps.length && q.stats.apparitionsRatees === perdues.length && q.manoir.serie === 0, 'pas attrapées : elles s’en vont (rien de perdu)'); }
{ const { q } = prep6(T6); const r = [], t0 = T6; let t = t0;
  const suivante = () => { for (let k = 0; k < 120; k++) { t += 1000; const o = HT.tick(q, 1, t, () => 0.5); if (o.manoir.apparitions.length) return o.manoir.apparitions[0]; } return null; };
  for (let k = 0; k < 4; k++) { const a = suivante(); r.push(HT.attraper(q, a.id)); }
  const unite = HT.arrondi(Math.max(1, HT.rythme(q) * HT.APPARITIONS.minutes * 60));
  check(r.every((x) => x.ok) && r[0].prime === unite && r[1].mult === 1 && r[2].mult === 1.5 && r[3].mult === 1.5 && r[3].serie === 4 && r[2].prime > r[1].prime * 1.4, `attrapées (attraper(q, id)) : +${HT.fmt(r[0].prime)} (${HT.APPARITIONS.minutes * 60} s du rythme), ×1,5 dès la troisième d’affilée (+${HT.fmt(r[2].prime)})`);
  const a = suivante(); while (q.manoir.apps.length) { t += 1000; HT.tick(q, 1, t, () => 0.5); } const b = suivante(), rb = HT.attraper(q, b.id);
  check(a && rb.ok && rb.serie === 1 && rb.mult === 1 && !HT.attraper(q, b.id).ok, 'une qui s’échappe casse la série ; on n’attrape pas deux fois la même');
  HT.lancerEvenement(q, () => 0.5, 'scooter'); const bal = HT.attraper(q); check(bal.ok && bal.prime > 0 && q.stats.scooters === 1, 'attraper(q) sans id reste le balai de la sorcière (le coup de pouce)');
  const M = q.manoir; for (let k = 0; k < 2000 && !(M.h.apparitions >= HT.APPARITIONS.parHeure - 1e-9); k++) { M.apps.push({ id: 5e6 + k, type: 'fantome', debut: q.now, fin: q.now + 5000 }); HT.attraper(q, 5e6 + k); }
  check(Math.abs(M.h.apparitions - HT.APPARITIONS.parHeure) < 1e-9 && (M.apps.push({ id: 9e6, type: 'citrouille', debut: q.now, fin: q.now + 5000 }), HT.attraper(q, 9e6)).prime === 0, `plafonnées à ${HT.APPARITIONS.parHeure} min du rythme par heure (${HT.APPARITIONS.parJour} par jour)`); }

console.log('── lot 6 : les commandes de la nuit ──');
{ const { q } = prep6(T6); HT.embaucher(q, 2); let c = null, t = T6;
  for (let k = 1; k <= 200 && !c; k++) { t = T6 + k * 1000; c = HT.tick(q, 1, t, () => 0.5).manoir.commande; }
  const T = HT.PRODUITS[c.i].temps, s = q.postes[c.i];
  check(c && (c.debut - T6) / 1000 === HT.COMMANDES.premiere + 1 && HT.COMMANDES.durees.includes(c.duree) && s.niv > 0 && T * 3 <= c.duree * 60 && c.n === Math.max(1, HT.arrondi(c.duree * 60 / T * (s.staff ? 0.6 : 0.3))) && HT.commandeManoir(q) === c,
    `la première, une minute et demie après le premier pas de l’écran : « ${HT.FICHE.manoir.textes.commande(c)} » (ce que le poste fait en ${c.duree} min ×${s.staff ? '0,6' : '0,3'})`);
  check(!HT.livrerCommande(q).ok && HT.lancerCommande(q, t) === null, 'pas livrable avant d’avoir tout ; une seule à la fois');
  const b0 = q.billets; let o; for (let k = 0; k < c.duree * 60 && c.fait < c.n; k++) { t += 1000; if (!q.postes[c.i].staff && !q.postes[c.i].actif) HT.lancer(q, c.i); HT.toucher(q, t); o = HT.tick(q, 1, t, () => 0.5); }
  const prime = HT.primeCommande(q), r = HT.livrerCommande(q);
  check(c.fait >= c.n && r.ok && r.prime === prime && prime === HT.arrondi(HT.rythme(q) * c.duree * HT.COMMANDES.part * 60) && q.stats.commandes === 1 && HT.commandeManoir(q) === null, `faite et livrée avant l’heure : +${HT.fmt(r.prime)} (${String(HT.COMMANDES.part).replace('.', ',')} min du rythme par minute de commande)`);
  let c2 = null; for (let k = 1; k <= 400 && !c2; k++) { t += 1000; c2 = HT.tick(q, 1, t, () => 0.5).manoir.commande; }
  check(c2 && c2.id === c.id + 1, 'la suivante arrive une à trois minutes plus tard');
  let ratee = null; for (let k = 1; k <= c2.duree * 60 + 2 && !ratee; k++) { t += 1000; ratee = HT.tick(q, 1, t, () => 0.5).manoir.ratee; if (ratee) break; }
  const b1 = q.billets; c2.fait = c2.n;
  check(ratee === c2 && q.stats.commandesRatees === 1 && !HT.livrerCommande(q).ok && q.billets === b1, 'pas livrée à l’heure : ratée, rien de payé, rien de perdu'); }
{ const { q } = prep6(T6), M = q.manoir; let n = 0;
  for (let k = 0; k < 50; k++) { M.commande = { id: 100 + k, i: 0, n: 1, fait: 1, duree: 15, debut: q.now, fin: q.now + 900e3, minutes: 15 * HT.COMMANDES.part }; if (HT.livrerCommande(q).plafond) break; n++; }
  check(Math.abs(M.h.commandes - HT.COMMANDES.parHeure) < 1e-9 && n === Math.floor(HT.COMMANDES.parHeure / (15 * HT.COMMANDES.part)), `plafonnées à ${HT.COMMANDES.parHeure} min du rythme par heure (${HT.COMMANDES.parJour} par jour) : ${n} grandes commandes payées dans l’heure`); }

console.log('── lot 6 : déterminisme, absence, sorties ──');
{ const { st } = prep6(T6), a = HT.etat(JSON.parse(JSON.stringify(st)), T6), b = HT.etat(JSON.parse(JSON.stringify(st)), T6), la = [], lb = [];
  for (let k = 1; k <= 600; k++) { const oa = HT.tick(a, 1, T6 + k * 1000, () => 0.1), ob = HT.tick(b, 1, T6 + k * 1000, () => 0.9); la.push(JSON.stringify(oa.manoir)); lb.push(JSON.stringify(ob.manoir)); }
  check(la.join() === lb.join() && JSON.stringify(a.manoir) === JSON.stringify(b.manoir), 'la même sauvegarde donne les mêmes clients, apparitions et commandes, quel que soit le hasard des coups de pouce (q.manoir.graine)'); }
{ const { q } = prep6(T6); for (let k = 1; k <= 300; k++) HT.tick(q, 1, T6 + k * 1000, () => 0.5);
  const M = q.manoir; if (!M.commande) HT.lancerCommande(q, q.now); M.commande.fait = M.commande.n; const sans = JSON.parse(JSON.stringify(q)); sans.manoir = HT.manoirNeuf(q.now);
  const tA = q.now + 3 * 3600e3, ra = HT.absence(q, tA), rb = HT.absence(sans, tA);
  check(ra.total === rb.total && q.manoir.file.length === 0 && q.manoir.apps.length === 0 && q.manoir.commande === null && !HT.livrerCommande(q).ok, `3 h d’absence : payées comme sans les activités du Manoir (${HT.fmt(ra.total)}) ; la file, les apparitions et la commande s’effacent sans rien coûter`);
  HT.toucher(q, tA); for (let k = 1; k <= 200; k++) HT.tick(q, 1, tA + k * 1000, () => 0.5); if (!M.commande) HT.lancerCommande(q, q.now); const c = q.manoir.commande, reste = c.fin - q.now;
  q.lastSeen = q.now; HT.absence(q, q.now + 60e3);
  check(q.manoir.commande === c && c.fin - q.now === reste, 'une sortie d’une minute : la commande en cours attend, le même temps restant (comme un coup de pouce)');
  HT.tick(q, 1, q.now + 30 * 60e3, () => 0.5); check(q.manoir.commande === null || q.manoir.commande !== c, 'une sortie de 30 min sans fermer l’écran : effacée, sans rien coûter'); }
{ const q = HT.etat({}, HT.FIN - 5000); HT.gagner(q, 1e6); q.now = HT.FIN + 1000; q.manoir.file.push({ id: 1, sorte: 'momie', commande: [{ i: 0, n: 1, servi: false }], arrive: HT.FIN - 2000 }); const r = HT.servir(q, 1, 0), o = HT.tick(q, 1, HT.FIN + 2000, () => 0.5);
  check(r.ok && r.prime === 0 && o.manoir.arrives.length === 0 && o.manoir.apparitions.length === 0, 'après la fermeture : plus rien ne paie, plus personne n’entre'); }

console.log('── lot 6 : le bestiaire (dix servis par sorte ; des étoiles, le décor au 5e, la chauve-souris au 9e) ──');
{ const B = HT.BESTIAIRE, ET = B.etoiles.reduce((a, x) => a + x, 0);
  check(B.par === 10 && B.etoiles.length === 9 && B.etoiles.every((x) => x === 1 || x === 2) && ET === 11 && B.deco === 5 && B.compagnon === 9, `les règles : ${B.par} servis par sorte ; ${B.etoiles.join(', ')} étoile(s) selon le rang (${ET} en tout) ; le décor au ${B.deco}e, la chauve-souris au ${B.compagnon}e`);
  // une vieille sauvegarde (lot 6 d'avant le bestiaire) : des clients déjà servis, pas de q.bestiaire
  const { st, q } = prep6(T6, { vide: true }); q.stats.clientsServis = 57; delete q.bestiaire; delete q.bestiaireFaits; delete q.bestiaireAVerser; delete q.chauvesouris;
  const v = HT.etat(JSON.parse(JSON.stringify(st)), T6), bv = HT.bestiaire(v);
  check(HT.SORTES.every((k) => v.bestiaire[k] === 0) && v.bestiaireFaits.length === 0 && v.bestiaireAVerser === 0 && v.chauvesouris === false && bv.faits === 0 && bv.sortes.length === 9 && bv.sortes.every((x) => x.n === 0 && !x.fait),
    'une vieille sauvegarde (q.bestiaire absent, 57 clients déjà servis) : un bestiaire vide, rien d’inventé');
  HT.etat(st, T6); let id = 5e6; const e0 = q.etoiles || 0; // (la nôtre, remise d'aplomb de même)
  const client = (sorte, lignes) => { const c = { id: ++id, sorte, commande: (lignes || [[0, 1]]).map(([i, n]) => ({ i, n, servi: false })), arrive: q.now }; q.manoir.file.push(c); return c; };
  const servirTout = (sorte, lignes) => { const c = client(sorte, lignes); let r; for (const l of c.commande) r = HT.servir(q, c.id, l.i); return r; };
  { const c = client('zombie', [[0, 1], [1, 2]]), f = HT.servir(q, c.id, 3), r1 = HT.servir(q, c.id, 0);
    check(!f.ok && !r1.fini && !r1.bestiaire && q.bestiaire.zombie === 0, 'une mauvaise friandise, puis une ligne sur deux : rien ne compte encore');
    const b0 = q.billets, r2 = HT.servir(q, c.id, 1);
    check(r2.fini && r2.bestiaire && r2.bestiaire.sorte === 'zombie' && r2.bestiaire.n === 1 && r2.bestiaire.par === 10 && !r2.bestiaire.complete && q.bestiaire.zombie === 1 && q.billets - b0 === r2.prime,
      `la dernière ligne servie : le zombie compte (1/10) ; seul le pourboire tombe en bonbons (+${HT.fmt(r2.prime)})`); }
  for (let k = 2; k <= 9; k++) servirTout('zombie');
  check(q.bestiaire.zombie === 9 && !q.bestiaireFaits.length && (q.etoiles || 0) === e0, 'neuf zombies : pas encore complété, aucune étoile');
  let r = servirTout('zombie');
  check(r.bestiaire.n === 10 && r.bestiaire.complete && r.bestiaire.complete.sorte === 'zombie' && r.bestiaire.complete.rang === 1 && r.bestiaire.complete.etoiles === 1 && q.etoiles === e0 + 1 && q.bestiaireAVerser === 1 && q.bestiaireFaits.join() === 'zombie',
    'le dixième : le zombie est complété (1/9), +1 étoile pour la boulangerie (q.etoiles, à verser)');
  check(HT.verserBestiaire(q) === 1 && q.bestiaireAVerser === 0 && HT.verserBestiaire(q) === 0, 'l’écran verse l’étoile une fois (verserBestiaire remet à zéro)');
  r = servirTout('zombie'); const bz = HT.bestiaire(q).sortes.find((x) => x.sorte === 'zombie');
  check(!r.bestiaire.complete && q.etoiles === e0 + 1 && q.bestiaireAVerser === 0 && bz.n === 10 && bz.fait && q.bestiaire.zombie === 11, 'un onzième zombie : rien de plus (l’écran montre 10/10)');
  // quatre sortes de plus, servies au-delà du plafond de l'heure (le pourboire ne paie plus) : le bestiaire compte quand même
  q.manoir.h.clients = HT.CLIENTS.parHeure; q.manoir.j.clients = HT.CLIENTS.parJour;
  const etapes = []; for (const k of ['momie', 'fantome', 'vampire', 'loup']) for (let n = 0; n < 10; n++) { const x = servirTout(k); if (x.bestiaire.complete) etapes.push([x.prime, x.bestiaire.complete]); }
  const cinq = etapes[3][1];
  check(etapes.length === 4 && etapes.every(([p]) => p === 0) && etapes.map(([, c]) => c.etoiles).join() === '1,1,1,2' && cinq.rang === 5 && cinq.deco === 'bestiaire' && q.decos.filter((d) => d === 'bestiaire').length === 1 && !q.chauvesouris,
    `plafond de l’heure atteint (pourboire 0) : les sortes se complètent quand même ; la 5e (${cinq.sorte}) donne 2 étoiles et le décor « bestiaire » (q.decos, une fois)`);
  check(q.etoiles === e0 + 6 && q.bestiaireAVerser === 5, `cinq sortes : ${q.etoiles - e0} étoiles en tout (5 à verser)`);
  const s0 = JSON.parse(JSON.stringify(st)); s0.hantee.bestiaire.fantome = 12; s0.hantee.bestiaireFaits = s0.hantee.bestiaireFaits.filter((k) => k !== 'fantome'); // (une sauvegarde où une sorte complète n'a pas été payée)
  const qs = HT.etat(s0, T6), ds = HT.bestiaireDus(qs), ds2 = HT.bestiaireDus(qs);
  check(ds.length === 1 && ds[0].sorte === 'fantome' && ds[0].rang === 5 && !ds[0].deco && ds2.length === 0 && qs.decos.filter((d) => d === 'bestiaire').length === 1, 'une sorte arrivée à dix sans être payée : payée une fois (le décor, déjà là, n’est pas redonné)');
  const G0 = G.newState(T6); G0.hantee = q;
  check(!G.aCompagnon(G0, 'chauve-souris'), 'à cinq sortes : la chauve-souris n’est pas encore à soi');
  for (const k of ['squelette', 'squelette-sorcier', 'citrouille']) for (let n = 0; n < 10; n++) servirTout(k);
  check(q.bestiaireFaits.length === 8 && !q.chauvesouris && !G.aCompagnon(G0, 'chauve-souris'), 'huit sortes : pas encore');
  for (let n = 0; n < 9; n++) servirTout('sorciere');
  r = servirTout('sorciere');
  check(r.bestiaire.complete && r.bestiaire.complete.rang === 9 && r.bestiaire.complete.compagnon && r.bestiaire.complete.etoiles === 2 && q.chauvesouris === true && q.etoiles === e0 + ET && q.decos.filter((d) => d === 'bestiaire').length === 1,
    `la neuvième (la sorcière) : +2 étoiles (${q.etoiles - e0} en tout), et la chauve-souris (q.chauvesouris)`);
  check(G.aCompagnon(G0, 'chauve-souris') && G.choisirCompagnon(G0, 'chauve-souris').ok && G.compagnonActif(G0) === 'chauve-souris' && G0.chat.nom === 'Myrtille', 'GAME : la chauve-souris est à soi, choisie, adoptée sous le nom « Myrtille »');
  const relu = HT.etat(JSON.parse(JSON.stringify({ hantee: q })), T6), e1 = relu.etoiles;
  check(HT.bestiaireDus(relu).length === 0 && relu.etoiles === e1 && relu.bestiaireFaits.length === 9 && relu.chauvesouris && HT.verserBestiaire(relu) === ET - 1, 'la sauvegarde relue : rien n’est redonné ; reste à verser ce qui ne l’a pas été (une fois)');
  // abîmée : des sortes inconnues, des doublons, des comptes qui ne sont pas des nombres
  const ab = HT.etat({ hantee: Object.assign(JSON.parse(JSON.stringify(q)), { bestiaire: { zombie: 25, licorne: 3, momie: 'x', fantome: -2 }, bestiaireFaits: ['zombie', 'zombie', 'licorne'], bestiaireAVerser: NaN, chauvesouris: 'oui' }) }, T6);
  check(ab.bestiaire.zombie === 25 && !('licorne' in ab.bestiaire) && ab.bestiaire.momie === 0 && ab.bestiaire.fantome === 0 && ab.bestiaireFaits.join() === 'zombie' && ab.bestiaireAVerser === 0 && ab.chauvesouris === false, 'une sauvegarde abîmée : remise d’aplomb (inconnues et doublons retirés, comptes à zéro), rien d’inventé'); }
{ const m = S.marathon.q, a = S.assidu.q;
  check(m.bestiaireFaits.length === 9 && m.chauvesouris && m.decos.includes('bestiaire') && a.bestiaireFaits.length >= 5, `la simulation : le marathon complète le bestiaire (${HT.SORTES.map((k) => m.bestiaire[k]).join(', ')} servis), l’assidu ${a.bestiaireFaits.length} sortes sur 9 (${a.stats.clientsServis} clients servis)`); }

console.log('── lot 6 : la simulation (le marathon et le très actif jouent tout, les autres ont des trous) ──');
{ const heures = (p) => { let h = 0; for (let j = 0; j < 7; j++) for (const [hh, mn] of HT.PROFILS[p].sessions) { const d = HT.DEBUT - 12 * 3600e3 + j * 864e5 + hh * 3600e3; if (d >= HT.DEBUT && d < HT.FIN) h += Math.min(mn * 60e3, HT.FIN - d) / 3600e3; } return h; };
  const parH = (p, s) => { const o = {}; for (const [k, b] of Object.entries(s.q.manoir.bilan)) o[k] = { h: b.min / heures(p), part: b.gain / s.total }; return o; };
  const txt = (o) => Object.entries(o).map(([k, x]) => `${k} ${x.h.toFixed(1).replace('.', ',')} min/h (${(x.part * 100).toFixed(1).replace('.', ',')} %)`).join(', ');
  const A0 = { assidu: HT.simuler('assidu', 7, { manoir: false }), quotidien: HT.simuler('quotidien', 7, { manoir: false }) };
  for (const p of ['marathon', 'tresactif', 'assidu', 'quotidien', 'occasionnel']) console.log(`  ${p} (${heures(p).toFixed(1).replace('.', ',')} h jouées) : ${txt(parH(p, S[p]))}`);
  const M = S.marathon.q, st = M.stats, TAp = parH('tresactif', S.tresactif), tq = S.tresactif.q.stats;
  check(Object.values(M.manoir.bilan).every((b) => b.n > 0 && b.gain > 0) && st.apparitionsRatees < st.apparitions * 0.01 && st.commandesRatees === 0 && st.clientsPartis < st.clientsServis * 0.01 && st.parfaitsRates === 0 && HT.eveil(M) === 1,
    `le marathon joue tout au mieux : ${st.clientsServis} clients servis (${st.clientsPartis} partis : la fin d’une session), ${st.apparitions} apparitions (${st.apparitionsRatees} manquées), ${st.parfaits} fournées parfaites, ${st.commandes} commandes, et le Manoir toujours éveillé`);
  check(TAp.clients.h >= 15 && TAp.clients.h <= HT.CLIENTS.parHeure && TAp.apparitions.h >= 10 && TAp.apparitions.h <= HT.APPARITIONS.parHeure && TAp.parfaits.h >= 5 && TAp.commandes.h >= 5 && TAp.commandes.h <= HT.COMMANDES.parHeure
    && Object.values(TAp).every((x) => x.part >= 0.01 && x.part <= 0.1) && tq.clientsPartis === 0,
    `le très actif, par heure jouée : ${txt(TAp)} (en minutes du rythme, et la part de ses bonbons)`);
  // l'équilibre du 20 octobre (la recette du jour à la part 0,25 : +22 à +41 % par session) : le joueur a décidé que la recette ouvre le
  // 20e au très actif, mais seulement au DERNIER jour. Avant ce réglage, les activités lui ajoutaient ×1,81 (64,1 → 116 Bd ; 20e le 6e
  // jour), les fournées parfaites à elles seules 63 % (100 min/h : le double d'une fournée de la recette du jour, sans plafond en
  // minutes). Réglées (CLIENTS 0,014 min par friandise, APPARITIONS 0,09, COMMANDES 0,12 min par minute, PARFAIT rogné à 11 min l'heure ;
  // les plafonds à l'avenant) : aucune plus de 40 % de leur gain, le 20e au 7e jour au plus tôt, et ensemble ×1,27… sur la graine 7, celle
  // du réglage. La revue (24 graines) : ×1,10 à ×1,28, ×1,21 en médiane ; +25 % en médiane est hors d'atteinte tant que le 20e reste au
  // dernier jour. Sans le Manoir, le très actif finit le 6e jour (son dernier soir, t = 5,46 j) à 76-84 % du seuil du 20e selon la graine :
  // les activités ne peuvent donc lui ajouter que ×1,19 à ×1,31 avant que le 20e ne tombe le 6e soir, et ×1,24 au mieux en médiane (sans
  // aucun écart d'une graine à l'autre) ; réglées ainsi, la graine la plus proche finit déjà le 6e jour à 99 % du seuil. Essayé : ×1,2 sur
  // les clients, les apparitions et les commandes → médiane ×1,23, le 20e le 6e jour pour 3 graines sur 24 ; plafonds relevés en plus →
  // médiane ×1,27, le 6e jour pour 10 graines sur 12. Le dernier jour (la décision du joueur) l'emporte : le réglage reste, et l'on vérifie
  // la médiane sur huit graines (de ×1,15 à ×1,30) et le 20e au 7e jour sur chacune.
  const T0 = SM.tresactif.paliersJour, T1 = S.tresactif.paliersJour, BT = S.tresactif.q.manoir.bilan, gA = Object.values(BT).reduce((a, b) => a + b.gain, 0), partsA = Object.entries(BT).map(([k, b]) => [k, b.gain / gA]);
  const TA = GRAINES_TA.map((g) => { const avec = g === 7 ? S.tresactif : PAR[`t${g}`], sans = g === 7 ? SM.tresactif : PAR[`t${g}s`]; return { g, r: avec.total / sans.total, P1: avec.paliersJour, P0: sans.paliersJour }; });
  const rs = TA.map((x) => x.r).sort((a, b) => a - b), med = (rs[(rs.length - 1) >> 1] + rs[rs.length >> 1]) / 2, r7 = TA.find((x) => x.g === 7).r;
  const plusTot = TA.every((x) => [13, 16, 19].every((k) => (x.P1[k] || 99) <= (x.P0[k] || 99))), j20 = TA.map((x) => x.P1[20] || 0);
  check(med >= 1.15 && med <= 1.30 && rs[0] >= 1.05 && plusTot && j20.every((j) => !j || j >= 7) && partsA.every(([, x]) => x <= 0.4),
    `avec les activités, le très actif gagne ×${med.toFixed(2).replace('.', ',')} en médiane sur ${TA.length} graines (de ×${rs[0].toFixed(2).replace('.', ',')} à ×${rs[rs.length - 1].toFixed(2).replace('.', ',')} ; ×${r7.toFixed(2).replace('.', ',')} sur la graine 7 : ${HT.fmt(SM.tresactif.total)} → ${HT.fmt(S.tresactif.total)}) ; ses paliers jamais plus tard (graine 7 : 13e le ${T0[13]}e → ${T1[13]}e jour, 16e le ${T0[16]}e → ${T1[16]}e, 19e le ${T0[19]}e → ${T1[19]}e) ; le 20e ${j20.map((j) => (j ? `le ${j}e` : 'jamais')).join(', ')} (le dernier jour au plus tôt, sur chaque graine) ; leur gain : ${partsA.map(([k, x]) => `${k} ${(x * 100).toFixed(0)} %`).join(', ')} (40 % au plus chacune)`);
  const a = S.assidu.q.stats, ra = S.assidu.total / A0.assidu.total, rq = S.quotidien.total / A0.quotidien.total;
  check(a.clientsPartis > 0 && a.apparitionsRatees > 0 && a.clientsServis > a.clientsPartis && ra > 0.85 && ra < 1.25 && rq > 0.85 && rq < 1.25,
    `l’assidu et le quotidien ont des trous (le ×6 s’endort ; des clients partis, des apparitions manquées) : ce que leur rapportent les activités compense à peu près (×${ra.toFixed(2).replace('.', ',')} et ×${rq.toFixed(2).replace('.', ',')} de la v6.5)`); }

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
  const b = G.newState(now7), qq = HT.etat(b, now7); HT.gagner(qq, 5e14); const e0 = b.etoiles; // (v6.7 : le dernier jour, entre le 12e et le 13e)
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
{ const sans = HT.simuler('marathon', 7, { activites: false, manoir: false }), part = S0.marathon.total / sans.total;
  check(part > 1 && part < 1.25, `au marathon, les trois premières activités jouées au mieux ajoutent ${((part - 1) * 100).toFixed(1)} % au total (l’enveloppe, plus haut, reste ×2 dessous)`);
  const A = HT.FICHE.activites, textes = JSON.stringify([HT.MINI.jeux.map((j) => [j.nom, j.desc, j.regles, j.consigne]), HT.OPERATIONS.map((o) => [o.nom, o.desc]), A.textes.saisie, A.textes.saisieTxt('3 bonbons'), A.textes.enCours,
    [0, 1, 2, 3, 4, 5, 6].map((k) => HT.contratsDuJour(HT.DEBUT + k * 864e5).map((c) => c.texte)), HT.RECETTES_JOUR.map((r) => [r.nom, r.desc]), A.textes.recette, A.textes.cuisine]);
  const mots = textes.match(/\b(drogues?|alcools?|bi[eè]res?|vins?|cigarettes?|herbe|shit|coke|ecsta|police|adultes?|sang|tuer|meurtre|couteaux?|armes?|cadavres?|18 ans|saisi[se]?)\b/gi);
  check(!mots && /chauves-souris/.test(textes), `tous âges : les activités d’Halloween n’ont rien d’adulte (les chauves-souris gourmandes chipent des bonbons)${mots ? ' — ' + mots.join(', ') : ''}`); }
check(HT.PAUSE_EV === G.PAUSE_EV * 1000, `la pause d’un coup de pouce : la même sortie que pour la boutique (G.PAUSE_EV, ${G.PAUSE_EV} s)`);
require('./fournil-activites.js')(HT, check, { S: { marathon: S.marathon, 'très actif': S.tresactif, assidu: S.assidu, quotidien: S.quotidien }, nom: 'le Manoir' });

console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
