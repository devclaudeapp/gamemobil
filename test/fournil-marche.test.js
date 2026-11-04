#!/usr/bin/env node
// Le Marché d'automne (src/marche.js, règles pures ; docs/marche-contrat.md § 2, 3, 4, 10.1) : la fenêtre (du vendredi 13 nov. 2026 à midi au
// vendredi 20 nov. à 20 h, heure de Paris ; huit jours de Paris), l'API de la Maison hantée MOT POUR MOT (clé par clé, mêmes types), la
// fiche (huit recettes, dix-sept Astuces, vingt paliers et leurs récompenses, neuf déguisements, huit recettes du jour), les chiffres du
// moteur identiques à ceux du Manoir (l'enveloppe en dépend), l'absence, les paliers donnés une fois, l'album de la forêt (bronze, argent,
// or, l'écureuil), une vieille ou une abîmée st.marche remise d'aplomb ; ce que src/game.js et src/classement.js en savent (la garde-robe,
// l'aura, les titres, le compagnon, la photo) ; le RYTHME en médiane sur huit graines (occasionnel 9-11, quotidien 13-15, assidu 15-17,
// très actif 20 le 8e jour) et l'ENVELOPPE du serveur (la ligne 'marche' de fournil_evts() lue dans le SQL : le marathon au moins ×2,2
// dessous sur dix graines, Astuces achetées et offertes ; au plus ×20 après 7 h 15 ; croissante ; la fenêtre du SQL = celle du jeu).
// Lancer : TZ=Europe/Paris node test/fournil-marche.test.js
'use strict';
const fs = require('fs'), path = require('path');
const MC = require('../src/marche.js'), HT = require('../src/hantee.js'), G = require('../src/game.js'), CL = require('../src/classement.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const paris = (txt) => Date.parse(txt);

console.log('── la fenêtre, heure de Paris ──');
check(MC.DEBUT === paris('2026-11-13T12:00:00+01:00') && MC.FIN === paris('2026-11-20T20:00:00+01:00'), `du vendredi 13 novembre 2026 à midi au vendredi 20 à 20 h (${new Date(MC.DEBUT).toISOString()} → ${new Date(MC.FIN).toISOString()})`);
check((MC.FIN - MC.DEBUT) / 3600e3 === 176 && MC.JOURS === 8 && MC.GRACE === 3600e3, '176 heures, huit jours de Paris, une heure de grâce');
let f = MC.fenetre(MC.DEBUT - 1);
check(f.avant && !f.ouvert && f.jour === 0 && f.dans === 1 && !f.classement, 'une milliseconde avant midi : pas encore ouvert');
f = MC.fenetre(MC.DEBUT);
check(f.ouvert && f.jour === 1 && f.jours === 8 && f.reste === MC.FIN - MC.DEBUT && f.classement, 'à midi pile : ouvert, jour 1 sur 8');
check(MC.fenetre(paris('2026-11-13T23:59:00+01:00')).jour === 1 && MC.fenetre(paris('2026-11-14T00:00:00+01:00')).jour === 2 && MC.fenetre(paris('2026-11-17T09:00:00+01:00')).jour === 5, 'le jour de Paris : vendredi 13 = 1, samedi 14 = 2, mardi 17 = 5');
f = MC.fenetre(MC.FIN - 1);
check(f.ouvert && f.jour === 8 && f.reste === 1, 'vendredi 20 à 19 h 59 59 : encore ouvert, jour 8');
f = MC.fenetre(MC.FIN);
check(f.fini && !f.ouvert && f.jour === 8 && f.classement, 'à 20 h : fini (l’onglet « Marché » reste lisible)');
check(MC.CLASSEMENT_JUSQUA === paris('2026-12-04T20:00:00+01:00') && MC.fenetre(MC.CLASSEMENT_JUSQUA - 1).classement && !MC.fenetre(MC.CLASSEMENT_JUSQUA).classement, 'l’onglet « Marché » jusqu’au vendredi 4 décembre à 20 h (fin + 14 jours)');
check(MC.fenetreSure(MC.DEBUT + 3600e3, MC.DEBUT - 5 * 3600e3).avant && MC.fenetreSure(MC.DEBUT + 3600e3, null).ouvert && MC.fenetreSure(MC.FIN + 1, MC.DEBUT - 1).fini, 'l’heure sûre : une horloge avancée hors ligne n’ouvre pas la Halle ; la fin se lit sur le « maintenant » du jeu');
check(!MC.envoiBillets(MC.DEBUT - 1) && MC.envoiBillets(MC.DEBUT) && MC.envoiBillets(MC.FIN + 3599e3) && !MC.envoiBillets(MC.FIN + 3600e3) && MC.envoiBillets === MC.envoiBonbons, 'les noisettes partent de l’ouverture à la fin + 1 h (l’heure de grâce du serveur)');
check(HT.FIN + HT.GRACE <= MC.DEBUT && !HT.envoiBillets(MC.DEBUT) && !MC.envoiBillets(HT.FIN + HT.GRACE - 1), 'la Maison hantée et le Marché ne se chevauchent pas (grâce comprise) : jamais deux envois d’événement à la fois');
check(HT.fenetre(MC.DEBUT).classement && !HT.fenetre(paris('2026-11-16T20:00:00+01:00')).classement, 'l’onglet Halloween court encore à l’ouverture du Marché, jusqu’au 16 novembre à 20 h');
{ const o = MC.PALIERS.map((p) => MC.ouverturePalier(p)), attendu = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8].map((j) => (j === 1 ? MC.DEBUT : MC.parisMs(2026, 11, 12 + j, 0)));
  check(o.every((t, k) => t === attendu[k]), 'les paliers s’ouvrent le 13 à midi (jour 1), puis à minuit, heure de Paris (le 14, le 15…, le 20)');
  check(MC.ouvrePalier(MC.PALIERS[3], MC.DEBUT) === 's’ouvre samedi 14' && MC.ouvrePalier(MC.PALIERS[13], paris('2026-11-14T11:00:00+01:00')) === 's’ouvre mardi 17' && MC.ouvrePalier(MC.PALIERS[0], MC.DEBUT) === '', '« s’ouvre samedi 14 », « s’ouvre mardi 17 » ; ouvert : rien'); }

console.log('── l’API de la Maison hantée, mot pour mot ──');
{ const kh = Object.keys(HT), km = Object.keys(MC);
  const manquent = kh.filter((k) => !km.includes(k)), enPlus = km.filter((k) => !kh.includes(k)), types = kh.filter((k) => km.includes(k) && typeof HT[k] !== typeof MC[k]);
  check(!manquent.length && !enPlus.length && !types.length && km.join() === kh.join(), `la liste exportée est celle de HANTEE, clé par clé, dans le même ordre, mêmes types (${km.length} clés)${manquent.length ? ' — manquent : ' + manquent : ''}${enPlus.length ? ' — en plus : ' + enPlus : ''}${types.length ? ' — types : ' + types : ''}`); }
{ const kf = Object.keys(HT.FICHE).filter((k) => !(k in MC.FICHE)); check(!kf.length, `la fiche a toutes les clés de celle du Manoir${kf.length ? ' — manquent : ' + kf : ''}`);
  const kt = Object.keys(HT.FICHE.textes).filter((k) => typeof MC.FICHE.textes[k] !== typeof HT.FICHE.textes[k]); check(!kt.length, `les textes : les mêmes clés, mêmes types${kt.length ? ' — ' + kt : ''}`);
  const km = Object.keys(HT.FICHE.manoir.textes).filter((k) => typeof MC.FICHE.manoir.textes[k] !== typeof HT.FICHE.manoir.textes[k]); check(!km.length, `les mots des activités : les mêmes clés, mêmes types${km.length ? ' — ' + km : ''}`);
  const ka = ['jeux', 'decor', 'contrats', 'operations', 'textes', 'recettes', 'recetteDeco', 'recetteDecoTxt'].filter((k) => !(k in MC.FICHE.activites)); check(!ka.length, 'les activités : jeux, décor, contrats, opérations, textes, recettes du jour, décor de la 500e fournée'); }
const F = MC.FICHE;
check(F.id === 'marche' && F.cle === 'marche' && F.nom === 'Le Marché d’automne' && F.lieu === 'la Halle' && F.Lieu === 'La Halle' && F.adulte === false && F.chat === null, 'la fiche : id et clé « marche », « Le Marché d’automne », la Halle, tous âges, pas de chat noir');
check(JSON.stringify(F.classement) === JSON.stringify({ periode: 'marche', onglet: 'Marché', evt: 'marche' }), 'le classement : période « marche », onglet « Marché », p_evt « marche »');
check(F.devise.nom === 'noisettes' && F.devise.un === 'noisette' && F.devise.icone === 'noisettes' && /^<svg[\s\S]*<\/svg>$/.test(F.devise.svg) && !/script|on\w+=/i.test(F.devise.svg) && MC.fmtEur(2) === '2 noisettes' && MC.fmtEur(1) === '1 noisette', 'la devise : les noisettes (une noisette en SVG, sans script)');
check(JSON.stringify(F.couleurs) === JSON.stringify({ fond: '#FFF4E4', carte: '#FFFFFF', accent: '#D9622B', clair: '#B08A68', vert: '#7A9A3A', or: '#E8B33A', chataigne: '#7B4A2A', texte: '#4A2E1C', doux: '#9C7B5E' }), 'les couleurs du contrat (§ 2.2)');
check(F.dates.debut === MC.DEBUT && F.dates.fin === MC.FIN && F.dates.texteDebut === 'vendredi 13 novembre à midi' && F.dates.texteFin === 'vendredi 20 novembre à 20 h', 'les dates et leurs textes');
check(F.produits === MC.PRODUITS && F.paliers === MC.PALIERS && F.ameliorations === MC.AMELIORATIONS, 'la fiche pointe sur les mêmes produits, paliers, Astuces');
check(F.textes.titre === 'Le Marché d’automne' && F.textes.ouvrir === 'Entrer dans la Halle' && F.textes.ameliorations === 'Astuces' && F.textes.equipe === 'Les amis de la forêt' && F.textes.podium(1) === '1er de la Halle' && F.textes.podium(7) === '7e de la Halle' && /tenue d’automne en or/.test(F.textes.podiumFinal) && /20 nov\. à 20 h/.test(F.textes.classementInfo), 'les textes : titre, « Entrer dans la Halle », « Astuces », « Les amis de la forêt », le podium');
check(Object.keys(F.evenements).sort().join() === Object.keys(MC.EVENEMENTS).sort().join() && F.evenements.descente.nom === 'Les pies voleuses !' && F.evenements.grosclient.nom === 'La cantine de l’école' && F.evenements.soiree.nom === 'L’heure dorée' && F.evenements.scooter.nom === 'La brouette du fermier' && Object.values(F.evenements).every((e) => e.annonce && e.fin && typeof e.detail === 'function'), 'les coups de pouce, aux clés de mécanique du Quartier : les pies voleuses, la cantine, l’heure dorée, la brouette du fermier');
{ const textes = JSON.stringify([F.textes, MC.PRODUITS, MC.PALIERS, MC.AMELIORATIONS, Object.values(F.evenements).map((e) => [e.nom, e.annonce, e.fin]), F.vetements, F.decos, F.manoir.textes, F.activites]);
  const mots = textes.match(/\b(cidres?|vins?|alcools?|bi[eè]res?|liqueurs?|drogues?|cigarettes?|sang|tuer|armes?|18 ans)\b/gi);
  check(!mots, `tous âges, rien d’alcoolisé à vendre (le cidre et les vendanges restent un décor)${mots ? ' — ' + mots.join(', ') : ''}`); }

console.log('── les chiffres du moteur : ceux du Manoir, à l’identique (l’enveloppe en dépend) ──');
const CHIFFRES_P = ['cout', 'debloquer', 'rev', 'temps', 'croiss', 'staff', 'apres'];
check(MC.PRODUITS.length === 8 && MC.PRODUITS.every((p, i) => CHIFFRES_P.every((k) => p[k] === HT.PRODUITS[i][k])), 'les huit recettes : coûts, déblocages, revenus, temps, croissances, apprentis, « après » (13e, 16e) identiques');
check(MC.PRODUITS.map((p) => p.id).join() === 'chataigne,jus,tarte,champignon,raisin,panier,marron,pain-epices' && MC.PRODUITS.every((p) => p.nom && p.pl && p.desc && p.staffNom && p.staffDesc && p.poste), 'châtaignes, jus de pomme, tartes, champignons, raisins, paniers garnis, marrons glacés, pains d’épices (noms, pluriels, apprentis, postes)');
check(MC.PRODUITS.map((p) => p.staffNom).join() === 'Gaspard l’écureuil,Rosalie la hérissonne,Madame Blaireau,Hortense la chouette,Bruno l’ours,Céleste la biche,Roux le renard,Sacha le marcassin', 'les amis de la forêt : Gaspard, Rosalie, Madame Blaireau, Hortense, Bruno, Céleste, Roux, Sacha');
{ const ids = MC.PRODUITS.map((p) => p.id), hids = HT.PRODUITS.map((p) => p.id), cible = (c) => (c === null ? null : c.map((x) => hids[ids.indexOf(x)]).join());
  check(MC.AMELIORATIONS.length === 17 && new Set(MC.AMELIORATIONS.map((a) => a.id)).size === 17 && MC.AMELIORATIONS.every((a, k) => { const h = HT.AMELIORATIONS[k]; return a.cout === h.cout && a.mult === h.mult && a.apres === h.apres && a.prime === h.prime && a.etoiles === h.etoiles && JSON.stringify(a.effet) === JSON.stringify(h.effet) && cible(a.cible) === (h.cible === null ? null : h.cible.join()); }), 'dix-sept Astuces : mêmes coûts, cibles, multiplicateurs, effets, primes et étoiles que les Sortilèges');
  check(MC.AMELIORATIONS.map((a) => a.id).join() === 'braise,pressoir,brouette,four-bois,osier,soleil,almanach,hotte,tresse,recoltes,criee,epouvantail,plaid,sucre,ete-indien,triporteur,moulin', 'leurs noms du contrat (§ 2.4), de « Les braises bien chaudes » au « moulin à épices »'); }
check(JSON.stringify(MC.EVENEMENTS) === JSON.stringify(HT.EVENEMENTS) && MC.PRESENCE === HT.PRESENCE && MC.REPUTATION === HT.REPUTATION && MC.ABSENCE_MAX_H === HT.ABSENCE_MAX_H && MC.ABSENCE_PART === HT.ABSENCE_PART && JSON.stringify(MC.PALIERS_EXPOSANTS) === JSON.stringify(HT.PALIERS_EXPOSANTS), 'coups de pouce, ×6 de présence, réputation ×1,5, absence 8 h à 10 %, paliers des postes : identiques');
check(['EVEIL', 'CLIENTS', 'PARFAIT', 'APPARITIONS', 'COMMANDES', 'JEU_MANOIR'].every((k) => JSON.stringify(MC[k]) === JSON.stringify(HT[k])) && JSON.stringify(MC.BESTIAIRE.etoiles) === JSON.stringify(HT.BESTIAIRE.etoiles) && MC.BESTIAIRE.par === 10 && MC.BESTIAIRE.argent.par === 30 && MC.BESTIAIRE.or.par === 140, 'les activités (éveil, clients, parfaites, apparitions, commandes, album) : les chiffres du Manoir');
check(MC.SORTES.join() === 'ecureuil,herisson,lapin,renard,blaireau,chouette,faon,marcassin,ourson' && MC.SORTES.every((k) => F.manoir.sortes[k] && F.manoir.courts[k]) && MC.NOMS_SORTES.ecureuil === 'L’écureuil' && MC.NOMS_COURTS.ecureuil === 'Écureuil', 'neuf enfants déguisés en animaux de la forêt (« L’écureuil »…, « Écureuil »…)');
check(MC.TYPES_APPARITION.join() === 'feuille,chataigne,champignon' && MC.TYPES_APPARITION.every((k) => F.manoir.apparitions[k]), 'les apparitions : une feuille d’or, une châtaigne, un champignon');
check(F.activites.recettes.length === 8 && F.activites.recettes.map((r) => r.temps).join() === '20,25,30,35,40,45,50,55' && F.activites.recettes[0].id === 'soupe-potiron' && F.activites.recettes[7].id === 'chocolat-chaud' && F.activites.recetteDeco === 'toque-feuille' && F.activites.decor.motif === 'marche', 'huit recettes du jour (de la soupe de potiron au chocolat chaud, 20 à 55 s), la toque brodée à la 500e fournée, le motif « marche »');
{ const vus = new Set(); let neuf = true; for (let j = 0; j < 8; j++) { const r = MC.recetteDuJour(MC.DEBUT + j * 864e5); if (vus.has(r.id)) neuf = false; vus.add(r.id); }
  check(neuf && vus.size === 8, 'une recette du jour différente chaque jour, du 13 au 20 (huit jours, huit recettes)'); }

console.log('── les vingt paliers (§ 2.6) ──');
const ATTENDU = [ // n : total, jour, récompense
  [5e7, 1, { etoiles: 1, boost: [2, 1800] }], [5e9, 1, { deco: 'cagettes', prime: 1 }], [5e10, 1, { vetement: 'marche-bonnet' }], [2.5e11, 2, { etoiles: 1, deco: 'lampions' }],
  [8e11, 2, { vetement: 'marche-gilet', prime: 2 }], [1.6e12, 2, { deco: 'feuilles' }], [3e12, 3, { vetement: 'marche-bottes', etoiles: 1, boost: [5, 900] }], [6e12, 3, { deco: 'tonneau', prime: 3 }],
  [1.2e13, 3, { vetement: 'marche-panier' }], [6e13, 4, { etoiles: 2, boost: [2, 3600] }], [3e14, 4, { etoiles: 1, boost: [2, 1800], prime: 4 }], [5e14, 4, { etoiles: 4, boost: [5, 3600], prime: 6 }],
  [8e14, 5, { etoiles: 2, boost: [5, 1800], prime: 4 }], [1.4e15, 5, { etoiles: 2, prime: 6 }], [2.6e15, 6, { etoiles: 3, boost: [5, 2700] }], [3.6e15, 6, { etoiles: 3, prime: 8 }],
  [5.5e15, 7, { etoiles: 3, boost: [10, 1800] }], [9e15, 7, { etoiles: 4, prime: 12 }], [1.5e16, 8, { etoiles: 4, boost: [10, 2700] }],
  [2.6e16, 8, { vetement: 'marche-couronne', etoiles: 8, boost: [10, 3600], prime: 24, deco: 'arbre-or', aura: 'feuilles', distinction: 'legende-marche' }],
];
{ const mal = MC.PALIERS.filter((p, k) => { const [t, j, r] = ATTENDU[k]; const b = p.boost ? [p.boost.mult, p.boost.secs] : undefined;
    return p.n !== k + 1 || p.total !== t || p.jour !== j || !!p.bonus !== (k >= 12) || (p.etoiles || undefined) !== r.etoiles || JSON.stringify(b) !== JSON.stringify(r.boost) || (p.prime || undefined) !== r.prime || p.deco !== r.deco || p.vetement !== r.vetement || p.aura !== r.aura || p.distinction !== r.distinction || p.chat; }).map((p) => p.n);
  check(MC.PALIERS.length === 20 && !mal.length, `vingt paliers : seuils, jours, récompenses du contrat${mal.length ? ' — différents : ' + mal.join(', ') : ''}`); }
check(MC.PALIERS.every((p, k) => !k || p.total > MC.PALIERS[k - 1].total) && MC.PALIERS.every((p) => p.titre), 'des seuils croissants, un titre à chacun');
{ const pj = [1, 2, 3, 4, 5, 6, 7, 8].map((j) => MC.PALIERS.filter((p) => p.jour === j).length); check(pj.join() === '3,3,3,3,2,2,2,2', `paliers par jour d’ouverture : ${pj.join(', ')}`); }
{ const somme = (l, k) => l.reduce((s, p) => s + (p[k] || 0), 0), dz = (l) => l.filter((p) => !p.bonus), bo = (l) => l.filter((p) => p.bonus);
  check(somme(dz(MC.PALIERS), 'etoiles') === 10 && somme(bo(MC.PALIERS), 'etoiles') === 29 && somme(MC.PALIERS, 'prime') === somme(HT.PALIERS, 'prime') && MC.PALIERS.filter((p) => p.boost).length === HT.PALIERS.filter((p) => p.boost).length,
    `10 étoiles aux douze premiers, 29 aux huit bonus ; ${somme(MC.PALIERS, 'prime')} h de primes et ${MC.PALIERS.filter((p) => p.boost).length} boosts, comme au Manoir`); }
check(MC.PALIERS_BOSS === 12 && MC.TROPHEE === 'marche-couronne' && MC.VETEMENTS.join() === 'marche-bonnet,marche-gilet,marche-bottes,marche-panier' && MC.VETEMENTS_OR.join() === 'marche-or-bonnet,marche-or-gilet,marche-or-bottes,marche-or-panier' && MC.DECOS.join() === 'cagettes,lampions,feuilles,tonneau' && JSON.stringify(MC.ANCIENS) === '{}', 'le maître au 12e, la couronne au 20e, la tenue d’automne (et en or), quatre décos, pas d’anciennes récompenses');
check(Object.keys(F.vetements).sort().join() === 'marche-bonnet,marche-bottes,marche-couronne,marche-gilet,marche-panier' && F.vetements['marche-bonnet'].forme === 'bonnet' && F.vetements['marche-panier'].forme === 'panier' && F.vetements['marche-couronne'].forme === 'couronne', 'les vêtements de la fiche (pièces et formes pour persos.js)');
check(['cagettes', 'lampions', 'feuilles', 'tonneau', 'album', 'album-argent', 'album-or', 'arbre-or', 'toque-feuille'].every((d) => typeof F.decos[d] === 'string'), 'chaque déco gagnable a son nom (paliers, album, arbre d’or, toque)');
check(/2 h de gains/.test(MC.phrasePalier(MC.PALIERS[4])) && /gilet de laine/.test(MC.phrasePalier(MC.PALIERS[4])) && /aura des feuilles d’or/.test(MC.phrasePalier(MC.PALIERS[19])) && /Légende du Marché/.test(MC.phrasePalier(MC.PALIERS[19])) && !/chat/.test(MC.PALIERS.map(MC.phrasePalier).join()), 'la phrase d’un palier (« 2 h de gains · gilet de laine »…), jamais de chat noir');

console.log('── la Halle : l’état, l’absence, les paliers donnés une fois ──');
const now0 = MC.DEBUT + 3600e3, nowFin = MC.FIN - 3600e3;
let st = {}, q = MC.etat(st, now0);
check(st.marche === q && !st.hantee && q.billets === 0 && q.total === 0 && q.postes.length === 8 && q.postes[0].niv === 1 && q.majeur === true && q.recompensesV2 === true && q.ecureuil === false && q.manoir && q.manoir.graine > 0, 'un état neuf dans st.marche (pas st.hantee) : zéro noisette, les châtaignes ouvertes, tous âges, l’écureuil pas encore là');
check(MC.revueRecompenses(q) === null && MC.revueRecompenses({ paliers: [1, 2, 12] }) === null, 'pas de version 1 des récompenses : la revue ne rend jamais rien (rien de donné deux fois)');
{ const s2 = { marche: { postes: [{ niv: 3 }, null, { niv: 'x' }], billets: NaN, total: -5, paliers: [1, 1, 99, 'x', 3], decos: 'x', etoiles: Infinity, recompensesV2: false, ecureuil: 'oui', manoir: 7 } }, q2 = MC.etat(s2, now0);
  check(q2.postes.length === 8 && q2.postes[0].niv === 3 && q2.postes[1].niv === 0 && q2.postes[2].niv === 0 && q2.billets === 0 && q2.total === 0 && q2.paliers.join() === '1,3' && Array.isArray(q2.decos) && q2.etoiles === 0 && q2.recompensesV2 === true && q2.ecureuil === false && q2.manoir && Array.isArray(q2.manoir.file), 'une st.marche abîmée (postes, noisettes, paliers en double ou inconnus, décos, étoiles, écureuil, la Halle) : remise d’aplomb sans rien inventer'); }
for (const mauvais of [null, 3, 'x', [], { postes: 'x' }]) { const s3 = { marche: mauvais }; MC.etat(s3, now0); if (!(s3.marche && s3.marche.postes.length === 8 && s3.marche.total === 0)) check(false, `st.marche = ${JSON.stringify(mauvais)} : remise à neuf`); }
check(true, 'st.marche null, un nombre, un texte, un tableau, des postes faux : remise à neuf');
{ const s4 = {}, q4 = MC.etat(s4, now0); MC.gagner(q4, 1e6); q4.postes[1].niv = 5; q4.postes[1].staff = true; q4.postes[1].actif = true; q4.lastSeen = now0; q4.now = now0;
  const r = MC.absence(q4, now0 + 20 * 3600e3), base = MC.revenuBase(q4, 1) / MC.PRODUITS[1].temps;
  check(r.secs === 8 * 3600 && r.total > 0 && Math.abs(r.total - Math.floor(8 * 3600 / MC.PRODUITS[1].temps) * MC.revenuBase(q4, 1) * 0.1) < 1e-6 * r.total && base > 0, `l’absence : 8 h au plus, au ralenti (10 % du rythme) : ${MC.fmtEur(r.total)}`); }
{ const s5 = {}, q5 = MC.etat(s5, now0); q5.total = 3e12; q5.now = now0;
  check(MC.paliersDus(q5).map((p) => p.n).join() === '1,2,3', 'le 13 à 13 h, 3e12 noisettes gagnées : seuls les trois paliers du premier jour sont dus (les autres attendent leur jour)');
  const p1 = MC.marquerPalier(q5, 1), p1b = MC.marquerPalier(q5, 1);
  check(p1 && p1.n === 1 && p1b === null && q5.etoiles === 1 && q5.boosts === 1, 'le palier 1 donné une fois (1 étoile, un boost) ; une seconde fois : rien');
  MC.marquerPalier(q5, 2); MC.marquerPalier(q5, 3);
  check(q5.decos.includes('cagettes') && q5.vetements.includes('marche-bonnet') && q5.heures === 1 && MC.marquerPalier(q5, 4) === null, 'le 2 (les cagettes, 1 h de prime), le 3 (le bonnet) ; le 4 pas avant son jour');
  q5.now = nowFin; q5.total = 3e16;
  for (const p of MC.paliersDus(q5)) MC.marquerPalier(q5, p.n);
  check(q5.paliers.length === 20 && MC.ensembleComplet(q5) && q5.decos.includes('arbre-or') && q5.vetements.includes('marche-couronne') && q5.etoiles === 39 && MC.paliersDus(q5).length === 0, `le dernier jour, tout franchi : 20 paliers, la tenue complète, l’arbre d’or, la couronne, 39 étoiles, ${q5.heures} h de primes ; plus rien de dû`);
  const ap = MC.amelioration(q5, 'criee'); q5.billets = 1e17; const ap2 = MC.amelioration(q5, 'criee');
  check(!ap.ok && ap2.ok && MC.remise(q5) === 0.5 && q5.etoiles === 40, 'après le maître : la criée (les niveaux à moitié prix) paie la boulangerie (1 ★ de plus)'); }

console.log('── l’album de la forêt (le bestiaire) : bronze, argent, or, l’écureuil ──');
{ const s6 = {}, q6 = MC.etat(s6, now0); q6.now = now0; let dus = [];
  for (const k of MC.SORTES) for (let i = 0; i < 10; i++) { q6.manoir.file.push({ id: 9000 + dus.length * 100 + i + MC.SORTES.indexOf(k) * 10, sorte: k, commande: [{ i: 0, n: 1, servi: false }], arrive: now0 }); const c = q6.manoir.file[q6.manoir.file.length - 1]; const r = MC.servir(q6, c.id, 0); if (r.bestiaire && r.bestiaire.completes) dus = dus.concat(r.bestiaire.completes); }
  const b = MC.bestiaire(q6);
  check(b.faits === 9 && b.deco && q6.decos.includes('album') && q6.ecureuil === true && b.ecureuil === true && b.chauvesouris === true && dus.filter((x) => x.palier === 'bronze').length === 9 && q6.bestiaireAVerser === 11, `dix servis de chaque déguisement : le bronze des neuf (11 ★), l’étagère aux peluches au 5e, l’écureuil au 9e (bestiaire().ecureuil, et chauvesouris pour le moteur d’écran du Manoir)`);
  const v = MC.verserBestiaire(q6); check(v === 11 && MC.verserBestiaire(q6) === 0, 'les étoiles de l’album versées une fois');
  for (const k of MC.SORTES) q6.bestiaire[k] = 140; MC.bestiaireDus(q6);
  check(q6.bestiaireArgent.length === 9 && q6.bestiaireOr.length === 9 && q6.decos.includes('album-argent') && q6.decos.includes('album-or') && q6.bestiaireAVerser === 27, 'l’argent (30) et l’or (140) : 27 ★ de plus, les étagères d’argent et dorée');
  const s7 = { marche: JSON.parse(JSON.stringify(q6)) }; s7.marche.ecureuil = 1; s7.marche.bestiaireFaits = ['ecureuil', 'ecureuil', 'loup']; MC.etat(s7, now0);
  check(s7.marche.ecureuil === false && s7.marche.bestiaireFaits.join() === 'ecureuil', 'un album abîmé : l’écureuil pas « vrai » n’est pas donné, les sortes en double ou inconnues retirées'); }

console.log('── ce que le jeu en sait : la garde-robe, l’aura, les titres, l’écureuil, le classement ──');
{ const GR = G.GARDEROBE, ids = Object.keys(GR.objets);
  const de = (c) => ids.filter((id) => GR.objets[id].collection === c);
  check(de('marche').length === 4 && de('marche-or').length === 4 && de('marche-couronne').length === 1 && de('automne').length === 4, '13 pièces : la tenue d’automne, en or, la couronne, la tenue de saison');
  check(['marche-bonnet', 'marche-gilet', 'marche-bottes', 'marche-panier'].map((id) => [GR.objets[id].piece, GR.objets[id].forme].join(':')).join() === 'tete:bonnet,haut:sweat,pieds:bottes,accessoire:panier' && JSON.stringify(GR.objets['marche-bonnet'].bonus) === JSON.stringify({ gains: { produit: 'tarte', pct: 8 } }) && GR.objets['marche-gilet'].bonus.gains.pct === 2.5 && GR.objets['marche-bottes'].bonus.vitesse === 1.5 && GR.objets['marche-panier'].bonus.absence === 0.5, 'la tenue d’automne : bonnet (tartes +8 %), gilet (+2,5 %), bottes (vitesse 1,5), panier (absence 0,5), rares');
  check(['bonnet', 'gilet', 'bottes', 'panier'].every((k) => JSON.stringify(GR.objets[`marche-or-${k}`].bonus) === JSON.stringify(GR.objets[`hantee-or-${{ bonnet: 'chapeau', gilet: 'cape', bottes: 'bottes', panier: 'lanterne' }[k]}`].bonus) && GR.objets[`marche-or-${k}`].rarete === 'legendaire'), 'la tenue d’automne en or : les bonus de celle d’Halloween en or, légendaire');
  check(GR.objets['marche-couronne'].piece === 'tete' && GR.objets['marche-couronne'].forme === 'couronne' && GR.objets['marche-couronne'].bonus.vitesse === 1 && GR.objets['marche-couronne'].rarete === 'epique', 'la couronne de feuilles d’or : tête, vitesse 1, épique');
  check(de('automne').every((id) => !Object.keys(GR.objets[id].bonus).length) && JSON.stringify(GR.ensembles.automne.bonus) === '{}' && ['automne-gavroche:tete:casquette', 'automne-pull:haut:sweat', 'automne-bottines:pieds:chaussures', 'automne-echarpe:accessoire:foulard'].every((x) => { const [id, p, fo] = x.split(':'); return GR.objets[id] && GR.objets[id].piece === p && GR.objets[id].forme === fo; }), 'la tenue de saison : quatre pièces cosmétiques SANS bonus, son ensemble non plus (décision du joueur)');
  check(JSON.stringify(GR.ensembles.marche.bonus) === JSON.stringify(GR.ensembles.hantee.bonus) && JSON.stringify(GR.ensembles['marche-or'].bonus) === JSON.stringify(GR.ensembles['hantee-or'].bonus) && GR.ensembles.marche.nom === 'Tenue d’automne' && GR.ensembles['marche-or'].nom === 'Tenue d’automne en or', 'les ensembles « Tenue d’automne » (6 %, 2, 1) et « en or » (8 %, 3, 1)');
  const s8 = G.newState(now0); s8.now = now0; const b0 = JSON.stringify(G.bonusGardeRobe(s8)); for (const id of de('automne')) G.donnerVetement(s8, id); G.equiperCollection(s8, 'automne');
  check(G.ensembleComplet(s8) === 'automne' && JSON.stringify(G.bonusGardeRobe(s8)) === b0, 'la tenue de saison portée en entier : l’ensemble se voit, le bonus ne bouge pas d’un poil'); }
check(G.AURAS.feuilles && G.AURAS.feuilles.couleur === '#E8B33A' && G.DISTINCTIONS['legende-marche'].nom === 'Légende du Marché' && G.DISTINCTIONS['feuille-or-2026'].nom === 'Feuille d’or 2026', 'l’aura des feuilles d’or, les titres « Légende du Marché » et « Feuille d’or 2026 »');
{ const c = G.COMPAGNONS.find((x) => x.id === 'ecureuil'), k = G.COMPAGNONS.findIndex((x) => x.id === 'ecureuil');
  check(c && c.espece === 'ecureuil' && c.prix === null && c.nomDefaut === 'Pirouette' && c.cri === 'couic' && JSON.stringify(c.bonus) === JSON.stringify(G.COMPAGNONS.find((x) => x.id === 'chauve-souris').bonus) && G.COMPAGNONS[k - 1].id === 'chauve-souris', 'l’écureuil roux : gratuit, gagné à l’album, « Pirouette », le bonus de la chauve-souris, juste après elle');
  check(!c.condition({}) && !c.condition({ marche: { ecureuil: 'oui' } }) && c.condition({ marche: { ecureuil: true } }), 'il se lit sur st.marche.ecureuil (et seulement s’il est vrai)'); }
check(CL.EVTS.join() === 'hantee,marche' && CL.PERIODES.includes('marche') && CL.NOMS_EVT.marche === 'le Marché d’automne' && CL.TITRES['legende-marche'] === 'Légende du Marché' && CL.TITRES['feuille-or-2026'] === 'Feuille d’or 2026' && CL.titreOk('legende-marche'), 'le classement connaît « marche » (période, nom, titres)');
check(CL.phraseEvt({ id: 'marche', rang: 7, joueurs: 12 }) === 'Tu as fini 7e du Marché d’automne sur 12' && CL.phraseEvt({ id: 'hantee', rang: 1, joueurs: 3 }) === 'Tu as fini 1er de la Maison hantée sur 3', '« Tu as fini 7e du Marché d’automne sur 12 » (et toujours « de la Maison hantée »)');
check(JSON.stringify(CL.evtAPayer({ evenements: { marche: { rang: 7, joueurs: 12 } }, evtPayes: [] })) === JSON.stringify([{ id: 'marche', rang: 7, joueurs: 12, recompense: CL.recompenseEvt(7) }]) && CL.evtAPayer({ evenements: { marche: { rang: 7 } }, evtPayes: ['marche'] }).length === 0 && CL.recompenseEvt(15) && !CL.recompenseEvt(16), 'la place du Marché payée une fois (evtPayes), du 1er au 15e');
{ const s9 = G.newState(now0); s9.marche = { decos: ['cagettes', 'arbre-or', 'album-or', 'x y'] }; const p = CL.photo(s9, { G }), p0 = CL.photo(G.newState(now0), { G });
  check(p && JSON.stringify(p.dm) === JSON.stringify(['cagettes', 'arbre-or', 'album-or']) && p0 && !('dm' in p0), 'la photo de la boutique porte les décos du Marché (dm ; absente sans elles : rien ne change pour les autres)');
  const v = CL.nettoyerPhoto(Object.assign({}, p, { dm: ['tonneau', '<b>', 3] })), vis = CL.visiteDepuisPhoto ? null : null; void vis;
  check(v && JSON.stringify(v.dm) === JSON.stringify(['tonneau']), 'celle d’un copain : ses décos du Marché relues une à une'); }
check(MC.FICHE.classement.evt === 'marche' && CL.EVTS.includes(MC.FICHE.classement.evt), 'l’envoi : p_evt « marche », un événement que le moteur du classement accepte');

// ─── le rythme et l'enveloppe : sur plusieurs graines, en parallèle (test/fournil-marche-graines.js) ───
const GRAINES_RY = [1, 2, 3, 4, 5, 6, 7, 8], MOYENS = ['occasionnel', 'quotidien', 'assidu', 'tresactif'], GRAINES_ENV = [7, 1, 2, 3, 13, 17, 49, 78, 103, 111];
const t0 = Date.now();
const PAR = (() => { const taches = [];
  for (const p of MOYENS) for (const g of GRAINES_RY) taches.push({ cle: `${p}${g}`, profil: p, graine: g });
  for (const g of GRAINES_ENV) for (const offertes of [false, true]) taches.push({ cle: `m${g}${offertes ? 'o' : ''}`, profil: 'marathon', graine: g, offertes, trace: true });
  const res = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'fournil-marche-graines.js')], { input: JSON.stringify(taches), encoding: 'utf8', maxBuffer: 1 << 30 }));
  const o = {}; taches.forEach((t, k) => { o[t.cle] = res[k]; }); return o; })();
const haut = (s) => Math.max(0, ...Object.keys(s.paliersJour).map(Number));
const mediane = (a) => { const t = a.slice().sort((x, y) => x - y); return (t[(t.length - 1) >> 1] + t[t.length >> 1]) / 2; };
console.log(`── le rythme des paliers (médiane sur ${GRAINES_RY.length} graines ; ${((Date.now() - t0) / 1000).toFixed(0)} s pour toutes les simulations) ──`);
{ const VISE = { occasionnel: [9, 11], quotidien: [13, 15], assidu: [15, 17], tresactif: [20, 20] };
  for (const p of MOYENS) { const hs = GRAINES_RY.map((g) => haut(PAR[`${p}${g}`])), m = mediane(hs), [a, b] = VISE[p];
    check(m >= a && m <= b, `${p} (${MC.PROFILS[p].sessions.reduce((x, y) => x + y[1], 0)} min par jour) : le plus haut palier ${String(m).replace('.', ',')} en médiane (${hs.join(', ')} ; visé ${a}-${b}) · ${MC.fmtEur(mediane(GRAINES_RY.map((g) => PAR[`${p}${g}`].total)))} en médiane`); }
  const j20 = GRAINES_RY.map((g) => PAR[`tresactif${g}`].paliersJour[20] || null);
  check(j20.every((j) => j === 8), `le très actif (8 h par jour) franchit le 20e le 8e et dernier jour, sur chaque graine (${j20.join(', ')})`);
  const j12 = GRAINES_RY.map((g) => PAR[`quotidien${g}`].paliersJour[12] || null);
  check(mediane(j12.map((x) => x || 9)) >= 4 && mediane(j12.map((x) => x || 9)) <= 6, `le quotidien (1 h) passe le maître (12e) vers le 5e jour (${j12.join(', ')})`);
  const occ = MC.PALIERS.slice(0, 9).every((p) => GRAINES_RY.filter((g) => PAR[`occasionnel${g}`].paliersJour[p.n]).length >= 6);
  check(occ, 'l’occasionnel (17 min) a la tenue d’automne complète (paliers 3, 5, 7, 9) sur presque chaque graine'); }

console.log('── l’enveloppe du serveur : la ligne « marche » de fournil_evts() ──');
const SQL_COMPLET = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-classement.sql'), 'utf8'), SQL_PATCH = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'fournil-classement-v69.sql'), 'utf8');
const RX = /\('marche'::text, '([^']+)'::timestamptz, '([^']+)'::timestamptz, ([\d.]+)::double precision,\s*'\{([-\d.,]+)\}'::double precision\[\]\)/;
const mC = RX.exec(SQL_COMPLET), mP = RX.exec(SQL_PATCH), mEvt = mC || mP;
check(!!mP, 'le patch v6.9 déclare l’événement « marche » dans fournil_evts()');
check(!mC || (mC[0] === mP[0]), mC ? 'le fichier complet porte la même ligne « marche » que le patch (la convention du dépôt)' : 'le fichier complet ne l’a pas encore (le patch fait foi)');
if (mEvt) {
  const parisSQL = (txt) => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):00:00 Europe\/Paris$/.exec(txt); return m ? MC.parisMs(+m[1], +m[2], +m[3], +m[4]) : NaN; };
  check(parisSQL(mEvt[1]) === MC.DEBUT && parisSQL(mEvt[2]) === MC.FIN, `la fenêtre du SQL est celle du jeu (${mEvt[1]} → ${mEvt[2]})`);
  const pasJ = Number(mEvt[3]) / 24, table = mEvt[4].split(',').map(Number);
  check(Number(mEvt[3]) === 6 && table.length === 31 && table.length >= Math.ceil((MC.FIN - MC.DEBUT) / 864e5 / pasJ) + 1 && table.every((v, k) => k === 0 || v >= table[k - 1]) && table[0] === 11.65, `une table croissante, un pas de 6 h, 31 valeurs (0 à 180 h), l’ouverture à 11,65 (celle du Manoir)`);
  const borne = (t) => { const j = Math.min(t / pasJ, table.length - 1), k = Math.floor(j); return k >= table.length - 1 ? table[table.length - 1] : table[k] + (table[k + 1] - table[k]) * (j - k); };
  let minM = Infinity, maxM = -Infinity, ouMin = '', ouMax = '', fin = 0;
  for (const g of GRAINES_ENV) for (const offertes of [false, true]) { const s = PAR[`m${g}${offertes ? 'o' : ''}`]; fin = Math.max(fin, s.total);
    for (const [t, v] of s.trace) if (v > 0) { const m = borne(t) - Math.log10(v); if (m < minM) { minM = m; ouMin = `graine ${g}${offertes ? ', Astuces offertes' : ''}, ${(t * 24).toFixed(1).replace('.', ',')} h`; } if (t > 7.25 / 24 && m > maxM) { maxM = m; ouMax = `graine ${g}${offertes ? ', Astuces offertes' : ''}, ${(t * 24).toFixed(1).replace('.', ',')} h`; } } }
  check(minM >= Math.log10(2.2) - 1e-9, `le marathon (23 h 48 par jour, tout au mieux ; ${GRAINES_ENV.length} graines, Astuces achetées et offertes dès le 12e) reste au moins ×2,2 sous la table : ×${Math.pow(10, minM).toFixed(2).replace('.', ',')} au plus juste (${ouMin})`);
  check(maxM <= Math.log10(20) + 1e-9, `et au plus ×20 au-dessus de lui après 7 h 15 : ×${Math.pow(10, maxM).toFixed(1).replace('.', ',')} au plus large (${ouMax})`);
  console.log(`  le marathon le plus haut à la fin : ${MC.fmtEur(fin)} (log10 ${Math.log10(fin).toFixed(2)}) ; la borne de la fin : log10 ${borne((MC.FIN - MC.DEBUT) / 864e5).toFixed(2)}`);
  const quot = GRAINES_RY.map((g) => PAR[`tresactif${g}`].total); check(Math.max(...quot) * 2.2 <= Math.pow(10, borne((MC.FIN - MC.DEBUT) / 864e5)), 'le très actif, à la fin, bien en dessous de la borne');
}

console.log(fails ? `\n${fails} échec(s) sur ${n}` : `\nTout passe (${n} vérifications).`);
process.exitCode = fails ? 1 : 0;
