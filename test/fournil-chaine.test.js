#!/usr/bin/env node
// « Ma chaîne de boutiques » : les règles (src/chaine.js), sans navigateur.
// La forme compacte et sa réparation, la chaîne recréée à neuf une seule fois, le prestige qui garde l'ancienne boutique, les jetons par
// palier et la Boutique d'or, les gérants (prix, niveaux, 8 h, idempotence, heure qui recule), la boutique des jetons (boosts, objets),
// AUCUNE fuite vers la boulangerie (étoiles, fortune, points, objectifs, stats, grades), la vue pour la scène, « Mes décos » (places, code
// de la photo ≤ 2 Ko), le carnet de collection ; et le branchement dans le jeu (le crochet de GAME.nouvelleBoutique, newState, le pigeon,
// la tenue de la chaîne, les champs dc et ch de la photo du classement).
// Lancer : TZ=Europe/Paris node test/fournil-chaine.test.js
'use strict';
const path = require('path');
const JEU = path.join(__dirname, '..');
const G = require(path.join(JEU, 'src', 'game.js'));
global.GAME = G;
const CL = require(path.join(JEU, 'src', 'classement.js'));
let C = null; try { C = require(path.join(JEU, 'src', 'casino.js')); } catch (e) { C = null; }
const R = require(path.join(JEU, 'src', 'chaine.js'));
global.CHAINE = R; // (comme dans la page : src/classement.js relit le code des décos d'une photo par les règles de la chaîne)
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T = Date.UTC(2026, 10, 3, 9, 0); // mardi 3 novembre 2026, 10 h à Paris
const H = 3600e3;
const clone = (o) => JSON.parse(JSON.stringify(o));
// une sauvegarde relue comme ui.js lire() : les clés absentes prises dans newState (qui portera chaine: chaineNeuve(), cree: 0)
function relire(raw) { const s = JSON.parse(raw), fresh = Object.assign(G.newState(T), { chaine: R.chaineNeuve() }); for (const k in fresh) if (!(k in s)) s[k] = fresh[k]; G.parcours(s); G.compagnons(s); return s; }
function partieAvancee(n) { const st = G.newState(T); st.boutiques = n; st.etoiles = 2500; st.xp = 1e5; st.coins = 4e20; st.lifetime = 1e24 / 3; st.lifetimeRun = 5e21; G.parcours(st); st.stations.forEach((s, i) => { s.niv = 150 + 3 * i; s.staff = true; }); return st; }

console.log('── 1) la forme compacte, la réparation, la chaîne recréée une seule fois ──');
{
  const vieille = partieAvancee(13); delete vieille.chaine;
  const st = relire(JSON.stringify(vieille)), c = R.etat(st, T);
  check(c.cree === 1 && c.b.length === 12 && c.b.map((b) => b.n).join() === '1,2,3,4,5,6,7,8,9,10,11,12', `une vieille sauvegarde à la boutique n°13 : 12 boutiques rouvertes à neuf (n°${c.b[0].n} à n°${c.b[11].n})`);
  check(c.b.every((b) => b.s.length === 1 && b.s[0] === 1 && b.c === 0 && !b.g && !b.or && b.pj === 0 && b.jp === 0 && b.q === G.quartierDe(b.n)), 'chacune au niveau 1, caisse vide, sans gérant, dans son quartier (quartierDe(n))');
  check(R.boutique(st, 10).q === G.QUARTIERS.findIndex((q) => q.id === 'gare') && G.standingDe(12) === 2, 'la n°10 rouverte à la gare, la n°12 au standing 2');
  const raw = JSON.stringify(st); const st2 = relire(raw); st2.chaine.b = st2.chaine.b.slice(0, 3);
  const st3 = relire(JSON.stringify(st2)); R.etat(st3, T);
  check(st3.chaine.b.length === 3, 'recréée une seule fois : une sauvegarde déjà passée (cree: 1) n’est jamais regarnie');
  const taille = JSON.stringify(c).length;
  check(taille <= 1300, `12 boutiques neuves : ${taille} octets (≤ 1,3 Ko)`);
  // la réparation : des boutiques abîmées, en double, hors bornes
  const ab = partieAvancee(6); ab.chaine = { v: 1, cree: 1, jetons: -4, gagnes: 'x', objets: ['chaine-globe', 'inconnu', 'chaine-globe'], b: [{ n: 2, s: [5, 0, 0], a: 7, b: 1, m: '9z', g: [9, 9], vu: T }, { n: 2, s: [9] }, { n: 9 }, { n: 0 }, null, 'x', { n: 3, s: [], c: -5, q: 99, am: 'pas un code', d: [['neon', 'c1'], ['chaudron', 's1']] }] };
  const ca = R.etat(ab, T), b2 = R.boutique(ab, 2), b3 = R.boutique(ab, 3);
  check(ca.b.length === 2 && ca.jetons === 0 && ca.gagnes === 0 && ca.objets.join() === 'chaine-globe', 'réparée : doublon, n°0, n° au-delà de st.boutiques − 1, ordures retirés ; jetons et objets bornés');
  check(b2.a === 1 && b2.s.join() === '5' && b2.m === '6' && b2.g.join() === `${R.GERANT.part.length - 1},${R.GERANT.heures.length - 1}`, 'n°2 : un apprenti seulement là où la recette est débloquée, les crans bornés au maximum du meuble, le gérant borné');
  check(b3.s[0] === 1 && b3.c === 0 && b3.q === G.quartierDe(3) && !b3.am && R.posesDe(b3).length === 1 && R.posesDe(b3)[0][0] === 'chaudron', 'n°3 : niveau 1, caisse ≥ 0, quartier recalculé, aménagement abîmé retiré, déco mal placée retirée (le néon ne va pas sur le comptoir)');
  const v = R.ouvrir(ab, 2, T); R.etat(ab, T); R.etat(ab); check(v.b === R.boutique(ab, 2), 'etat() ne remplace pas les boutiques : une vue ouverte garde la sienne');
  R.fermer(ab, v, T);
}

console.log('── 2) le prestige garde l’ancienne boutique (le hook de nouvelleBoutique) ──');
{
  const st = G.newState(T); R.etat(st, T); // une partie neuve : rien à recréer
  check(st.chaine.cree === 1 && st.chaine.b.length === 0, 'une partie neuve : la chaîne est vide');
  st.stations[0].niv = 120; st.stations[0].staff = true; st.stations[1].niv = 60; st.stations[2].niv = 30; st.ameliorations = { farine: true, enseigne: true }; st.mobilier = { tables: 3, four: 1 }; st.coins = 7e9; st.lifetimeRun = 2e12; st.nomBoutique = 'Chez Lucas';
  st.amenagement = { v: 1, tables: [[3, 4], null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] };
  const avant = { etoiles: st.etoiles, lifetime: st.lifetime, run: st.lifetimeRun };
  const b = R.rejoindre(st, T); const r = G.nouvelleBoutique(st, T);
  check(r.ok && st.boutiques === 2 && st.etoiles > avant.etoiles, `nouvelleBoutique donne toujours ses étoiles (+${r.gain}) et ouvre la n°2`);
  check(b && b.n === 1 && b.s.join() === '120,60,30' && b.a === 1 && b.c === 7e9 && b.nm === 'Chez Lucas' && b.m === '31' && b.am === G.codeAmenagement(st.amenagement), 'la n°1 rejoint la chaîne telle qu’elle était : niveaux, apprenti, caisse, nom, meubles, plan');
  check(b.pj === R.paliersBoutique(b) && b.pj === 4 + 2 + 1 && b.jp === (R.REJOINDRE.paliers === 'a-prendre' ? 7 : 0), R.REJOINDRE.paliers === 'a-prendre' ? `ses ${b.pj} paliers déjà franchis : ${b.jp} jetons à prendre, une fois (REJOINDRE « a-prendre »)` : `ses ${b.pj} paliers déjà franchis ne donnent pas de jetons (REJOINDRE « comptes »)`);
  check(R.bonusDe(b).farine && R.bonusDe(b).enseigne && Object.keys(R.bonusDe(b)).length === 2, 'ses bonus gardés (masque de bits)');
  check(R.rejoindre(st, T) && R.etat(st).b.length === 2 && R.rejoindre(st, T) === null, 'appelé deux fois pour le même numéro : une seule boutique');
}

console.log('── 3) les jetons par palier, la Boutique d’or ──');
{
  const st = partieAvancee(9); R.etat(st, T);
  const v = R.ouvrir(st, 1, T); v.coins = 1e30; v.mode = 24;
  const a = R.acheter(st, v, 0); check(a.ok && v.stations[0].niv === 25 && a.jetons === 1 && R.boutique(st, 1).jp === 1, 'baguette 1 → 25 : un palier, un jeton à prendre');
  v.mode = 75; const b = R.acheter(st, v, 0); check(b.ok && b.jetons === 3 && R.boutique(st, 1).jp === 4, 'baguette 25 → 100 : trois paliers (50, 75, 100), quatre jetons à prendre');
  check(R.prendreJetons(st, 1) === 4 && st.chaine.jetons === 4 && st.chaine.gagnes === 4 && R.boutique(st, 1).jp === 0, 'prendre ses jetons : ils passent dans la réserve de la chaîne');
  const j = R.jauge(st, R.boutique(st, 1));
  check(j.niv === 175 && j.max === 16 * R.orPaliers(1) && R.orPaliers(1) === 7 && R.orNiv(26) === 400, `la jauge de la n°1 : ${j.fait}/${j.max} paliers (niveau d’or ${j.niv} ; la n°26 : ${R.orNiv(26)})`);
  for (let i = 0; i < 16; i++) { v.mode = 1; if (v.stations[i].niv === 0) R.acheter(st, v, i); v.mode = Math.max(1, 174 - v.stations[i].niv); R.acheter(st, v, i); }
  check(!R.boutique(st, 1).or && R.jauge(st, R.boutique(st, 1)).fait === 16 * 6, 'chaque recette au niveau 174 : pas encore d’or');
  let or = 0; for (let i = 0; i < 16; i++) { v.mode = 1; const r = R.acheter(st, v, i); if (r.or) or++; }
  const bo = R.boutique(st, 1);
  check(or === 1 && bo.or === 1 && bo.jp >= R.paquetOr(1) && st.chaine.objets.includes(R.ENSEIGNE_OR), `la 16e recette au niveau 175 : Boutique d’or (+${R.paquetOr(1)} jetons, l’enseigne dorée gagnée)`);
  v.mode = 30; const r2 = R.acheter(st, v, 0); check(r2.ok && !r2.or && R.boutique(st, 1).or === 1, 'le paquet d’or, une seule fois ; les paliers au-delà donnent toujours leur jeton');
  const st5 = partieAvancee(5); R.etat(st5, T); check(R.jauge(st5, R.boutique(st5, 1)).max === 12 * 7, 'à la boutique n°5, la jauge ne compte que les 12 recettes gagnées');
  R.fermer(st, v, T);
}

console.log('── 4) les gérants ──');
{
  const st = partieAvancee(20); const c = R.etat(st, T);
  check([0, 1, 2, 3, 11, 12, 30].map((k) => R.prixGerant(k)).join() === '0,5,10,15,55,60,60', 'prix des gérants : le premier offert, puis 5, 10, 15… 60 jetons au plus');
  const e1 = R.embaucherGerant(st, 3, T); check(e1.ok && e1.prix === 0 && R.boutique(st, 3).g.join() === '0,0', 'le premier gérant, offert');
  check(!R.embaucherGerant(st, 4, T).ok, 'le deuxième demande 5 jetons');
  c.jetons = 1000; check(R.embaucherGerant(st, 4, T).ok && c.jetons === 995 && !R.embaucherGerant(st, 4, T).ok, 'avec des jetons : embauché (−5), et pas deux fois');
  const b = R.boutique(st, 3), ry = R.rythme(st, b);
  const x = R.enAttente(st, b, T + 3 * H); check(Math.abs(x.gain - 0.1 * ry * 3 * 3600) < 1e-6 * x.gain, `3 h d’absence : 10 % du rythme pendant 3 h (${G.fmtEur(x.gain)})`);
  const y = R.enAttente(st, b, T + 30 * H); check(Math.abs(y.secs - 8 * 3600) < 1e-9, '30 h d’absence : 8 h au plus');
  const p1 = R.encaisser(st, b, T + 30 * H), p2 = R.encaisser(st, b, T + 30 * H); check(p1.gain > 0 && p2.gain === 0 && b.c === p1.gain, 'versé une fois : appelé deux fois au même moment, il ne paie pas deux fois');
  const p3 = R.encaisser(st, b, T + 20 * H); check(p3.gain === 0 && b.vu === T + 20 * H, 'l’heure qui recule : rien de versé, vu revient à maintenant');
  const p4 = R.encaisser(st, b, T + 21 * H); check(Math.abs(p4.gain - 0.1 * ry * 3600) < 1e-6 * p4.gain, 'puis une heure plus tard : une heure payée');
  const sans = R.boutique(st, 5); const z = R.encaisser(st, sans, T + 50 * H); check(z.gain === 0 && sans.vu === T + 50 * H && sans.c === 0, 'sans gérant : rien ne s’accumule');
  let total = 0; for (let k = 0; k < 5; k++) { const r = R.ameliorerGerant(st, 3, 'rythme'); total += r.prix; } for (let k = 0; k < 4; k++) { const r = R.ameliorerGerant(st, 3, 'duree'); total += r.prix; }
  const attendu = [...R.GERANT.prixRythme, ...R.GERANT.prixDuree].reduce((a, x) => a + x, 0);
  check(R.partGerant(b) === 0.3 && R.heuresGerant(b) === 16 && total === attendu && attendu === 236 && !R.ameliorerGerant(st, 3, 'rythme').ok, `gérant au maximum : 30 % du rythme, 16 h (${total} jetons de niveaux)`);
  // 8 h au plus PAR ABSENCE, même payée en deux fois (une heure sûre arrivée en retard : le lancement paie, puis le saut) : le plafond
  {
    const deja = (r, n) => { const d = r.detail.find((x) => x.n === n); return d ? d.secs * 1000 : 0; }; // ce que le lancement a déjà payé (ms)
    const sp = partieAvancee(6); R.etat(sp, T); R.embaucherGerant(sp, 2, T); const g = R.boutique(sp, 2), r2 = R.partGerant(g) * R.rythme(sp, g);
    const a = R.encaisserTout(sp, T + 8 * H); // le lancement : 8 h (l'heure du téléphone, l'heure sûre pas encore là)
    const s = R.encaisserTout(sp, T + 12 * H, (b) => Math.max(0, Math.min(4 * H, R.heuresGerant(b) * H - deja(a, b.n)))); // le saut de 4 h
    check(a.detail[0].secs === 8 * 3600 && s.total === 0 && g.vu === T + 12 * H, `une absence de 12 h payée en deux fois : 8 h au lancement, 0 au saut (plafond nul), et vu revient à maintenant`);
    const m = R.encaisserTout(sp, T + 12 * H + 61e3, 120e3), m2 = R.encaisserTout(sp, T + 12 * H + 61e3 + 10 * H, 120e3); // une minute de jeu ; puis un trou de 10 h en jouant
    check(Math.abs(m.detail[0].secs - 61) < 1e-9 && m2.detail[0].secs === 120 && Math.abs(g.c - r2 * (8 * 3600 + 61 + 120)) < 1e-6 * g.c, 'en jouant (plafond de 2 min) : la minute payée, jamais le saut ni un trou de 10 h');
    const sp2 = partieAvancee(6); R.etat(sp2, T); R.embaucherGerant(sp2, 2, T); R.etat(sp2).jetons = 100; R.ameliorerGerant(sp2, 2, 'duree'); R.ameliorerGerant(sp2, 2, 'duree'); // 12 h
    const a2 = R.encaisserTout(sp2, T + 8 * H), s2 = R.encaisserTout(sp2, T + 20 * H, (b) => Math.max(0, Math.min(12 * H, R.heuresGerant(b) * H - deja(a2, b.n))));
    check(R.heuresGerant(R.boutique(sp2, 2)) === 12 && s2.detail[0].secs === 4 * 3600, 'un gérant de 12 h : 8 h au lancement, le saut complète jusqu’à 12 h (4 h), pas plus');
  }
  const v = R.ouvrir(st, 4, T + 60 * H); const tout = R.encaisserTout(st, T + 70 * H);
  check(!tout.detail.some((d) => d.n === 4), 'la boutique ouverte (on y joue) : son gérant ne travaille pas en même temps');
  R.fermer(st, v, T + 70 * H); check(R.VUE.ouverte === 0, 'fermée : la vue est rendue');
}

console.log('── 5) la boutique des jetons ──');
{
  const st = partieAvancee(12); const c = R.etat(st, T); c.jetons = 500;
  const r1 = R.acheterBoost(st, 'x5', T); check(r1.ok && st.boosts.reserve.length === 1 && st.boosts.reserve[0].mult === 5 && st.boosts.reserve[0].secs === 600 && c.jetons === 460, 'un boost ×5 de 10 min, dans la réserve de la boulangerie (40 jetons)');
  check(!R.acheterBoost(st, 'x2', T + 30 * H).ok && R.boostsRestants(st, T + 30 * H) === 0, 'un seul boost par semaine (le mercredi : refusé)');
  const lundi = Date.UTC(2026, 10, 9, 0, 30); // lundi 9 novembre, 1 h 30 à Paris
  check(R.acheterBoost(st, 'x2', lundi).ok && st.boosts.reserve.length === 2 && !R.acheterBoost(st, 'x2', lundi + H).ok, 'la semaine suivante (le lundi, heure de Paris), un autre, et un seul');
  const o = R.acheterObjet(st, 'chaine-globe'); check(o.ok && c.objets.includes('chaine-globe') && !R.acheterObjet(st, 'chaine-globe').ok, 'un objet rare (le globe), une fois');
  check(!R.acheterObjet(st, 'inconnu').ok && !R.acheterBoost(st, 'x10', T + 40 * H).ok, 'rien d’inconnu');
  check(R.OBJETS.every((x) => x.prix > 0 && x.nom && x.desc) && R.OBJETS.length === 9, `${R.OBJETS.length} objets rares, chacun son prix en jetons`);
}

console.log('── 6) aucune fuite vers la boulangerie (ni étoiles, ni fortune, ni points, ni objectifs, ni stats, ni grades) ──');
{
  const st = partieAvancee(15); G.objectifsDuJour(st, T); R.etat(st, T); st.chaine.jetons = 300;
  // la garde-robe : la tenue de la chaîne y entre (ses pièces, son compteur de version), rien d'autre (ni stats, ni journal : contrat § 1.7)
  const sansTenue = (g) => { if (!g) return g; const ids = Object.keys(g.objets).filter((id) => /^chaine-/.test(id)); const o = Object.assign({}, g.objets); ids.forEach((id) => delete o[id]); return Object.assign({}, g, { v: g.v - ids.length, objets: o }); };
  const garde = (s) => JSON.stringify(Object.assign({}, s, { chaine: null, boosts: null, now: null, garderobe: sansTenue(s.garderobe) }));
  const avant = garde(st);
  const v = R.ouvrir(st, 7, T); v.coins = 1e25;
  for (let t = 0; t < 120; t++) { v.stations.forEach((x, i) => { if (x.niv > 0 && !x.actif) R.lancer(v, i); }); R.tick(st, v, 1, T + t * 1000); }
  for (let i = 0; i < 16; i++) { v.mode = 'max'; R.acheter(st, v, i); R.embaucher(st, v, i); }
  for (const a of G.AMELIORATIONS) R.amelioration(st, v, a.id); for (const m of G.MOBILIER) R.ameliorerMeuble(st, v, m.id);
  R.amenager(st, v, { v: 1, tables: [[2, 5], null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] }); R.fermer(st, v, T + 200e3);
  R.prendreTout(st); R.embaucherGerant(st, 7, T); R.ameliorerGerant(st, 7, 'rythme'); R.encaisserTout(st, T + 9 * H); R.acheterObjet(st, 'chaine-plan'); R.poser(st, 7, [['chaine-plan', 'm1']]);
  st.chaine.jetons += 300; const ach = ['chaine-toque', 'chaine-cles', 'pigeon'].map((id) => R.acheterObjet(st, id).ok);
  check(ach.every(Boolean) && G.possede(st, 'chaine-toque') && G.possede(st, 'chaine-cles') && G.aCompagnon(st, 'pigeon'), 'la toque, le trousseau (la tenue de la chaîne) et le pigeon achetés : à soi');
  check(garde(st) === avant, 'toutes les actions de la chaîne (tenue et pigeon compris) : la boulangerie est identique octet pour octet (hors st.chaine ; stats, journal, garde-robe hors la tenue)');
  check(st.lifetime === 1e24 / 3 && st.lifetimeRun === 5e21 && st.coins === 4e20 && st.etoiles === 2500, 'fortune (lifetime), gains de la boutique (lifetimeRun), caisse et étoiles inchangés : rien à changer au classement');
  const b7 = R.boutique(st, 7); check(b7.c > 0 && b7.s[0] > 1 && b7.b > 0 && b7.m.length === 9 && b7.am, 'tout est allé dans la boutique n°7 : sa caisse, ses niveaux, ses bonus, ses meubles, son plan');
  check(R.acheterBoost(st, 'x2', T).ok && garde(st) === avant && st.boosts.reserve.length === 1, 'un boost acheté : seule la réserve de boosts change');
}

console.log('── 7) la vue pour la scène (comme la visite d’un copain) ──');
{
  const st = partieAvancee(28); R.etat(st, T);
  const b = R.boutique(st, 21); b.s = [300, 120, 80]; b.a = 3; b.m = '444'; b.am = G.codeAmenagement({ v: 1, tables: [[3, 4], null, null, null, null, null], bar: null, salon: null, terrasse: [null, null, null] });
  const v = R.ouvrir(st, 21, T);
  check(v.visite && v.chaineN === 21 && G.quartier(v) === b.q && G.standing(v) === 4 && v.stations[0].niv === 300 && v.stations[1].staff && !v.stations[2].staff, 'son quartier, son standing (n°21 → 4), ses postes et ses apprentis');
  check(v.mobilier.tables === 4 && v.mobilier.four === 4 && v.amenagement && v.amenagement.tables[0].join() === '3,4' && v.garderobe === st.garderobe && v.xp === st.xp, 'ses meubles, son plan ; la tenue et le grade du boulanger en lecture seule');
  check(v.evTimer === 1e9 && v.mystereTimer === 1e9 && v.chatAttente === null, 'rien ne surgit (ni événement, ni client mystère, ni chat à la porte)');
  check(R.posesDe(b).length === 1 && R.posesDe(b)[0][0] === R.SOUVENIRS[b.q].id, `sa déco d’office : le souvenir de son quartier (${R.SOUVENIRS[b.q].nom})`);
  R.fermer(st, v, T);
}

console.log('── 8) « Mes décos » : places typées, maximum, code de la photo ──');
{
  check(R.PLACES.length === 12 && ['mur', 'sol', 'comptoir', 'rebord', 'dehors'].every((t) => R.PLACES.some((p) => p.type === t)) && new Set(R.PLACES.map((p) => p.code)).size === 12, '12 places typées (mur 4, sol 3, comptoir 2, rebord 2, dehors 1), un code d’une lettre chacune');
  const l = [['chaudron', 's1'], ['neon', 'm2'], ['legende', 's2'], ['citrouilles', 's3'], ['toiles', 'r1'], ['bestiaire', 'm1'], ['graffiti', 'm3']];
  const p = R.nettoyerPoses(l); check(p.length === R.DECOS_MAX && R.DECOS_MAX === 6, `6 décos posées au plus (la 7e refusée)`);
  check(R.nettoyerPoses([['neon', 'c1'], ['neon', 'm1'], ['neon', 'm2'], ['x', 'm3'], ['graffiti', 'm1']]).join('|') === 'neon,m1', 'une déco à une place de son type, une fois, une place par déco');
  check(R.appelsPoses(p, 'haute') === 3 && R.appelsPoses(p, 'eco') === 2 && R.appelsPoses([['graffiti', 'm3']], 'eco') === 1, 'après la fusion : 3 appels au plus en haute (petits, lueurs, animés), 2 en éco, 1 sans lueur');
  check(!R.peutPoser(p, 'graffiti', 'm3', 'eco').ok && R.peutPoser(p.slice(0, 5), 'graffiti', 'm3', 'eco').ok && R.peutPoser(p, 'chaudron', 's3', 'eco').ok, 'vert / rouge : la 7e refusée, déplacer une déco déjà posée permis');
  const code = R.codeDecos(p); check(code.length === 18 && JSON.stringify(R.decosDepuisCode(code)) === JSON.stringify(p) && R.decosDepuisCode('zzz') === null && R.decosDepuisCode('<b>') === null, `le code de la photo : « ${code} » (18 caractères), relu à l’identique ; un code piégé refusé`);
  // la photo du classement, au pire cas réaliste, avec le champ dc (les décos posées) et ch (la chaîne en deux nombres)
  const st = partieAvancee(30); st.nomBoutique = 'Le Grand Fournil de Lucas'; st.quartier = { decos: ['graffiti', 'neon', 'scooter', 'chien', 'toque-or'] }; st.hantee = { decos: ['citrouilles', 'toiles', 'chaudron', 'toque-citrouille', 'bestiaire', 'legende'] };
  for (const m of G.MOBILIER) st.mobilier[m.id] = m.max; st.distinctions = ['legende-manoir'];
  const ph = CL.photo(st, { G, coupes: ['or', 'argent', 'bronze', 'or', 'or', 'argent', 'bronze', 'or', 'or', 'argent', 'bronze', 'or'], badge: true, ev: { id: 'hantee', q: { postes: st.stations.map((s) => ({ niv: 123456, staff: true })), decos: st.hantee.decos, paliers: [...Array(20).keys()], total: 2.4e16 } } });
  const base = Buffer.byteLength(JSON.stringify(ph)); ph.dc = code; ph.ch = [29, 29]; const avec = Buffer.byteLength(JSON.stringify(ph));
  check(base <= 1100 && avec <= base + 40 && avec <= 2048, `la photo au pire cas : ${base} octets, ${avec} avec dc et ch (+${avec - base}, ≤ 2 048 ; le serveur garde ≤ 3 072) : pas de SQL`);
}

console.log('── 9) le carnet de collection ──');
{
  const st = partieAvancee(14); st.quartier = { decos: ['graffiti', 'neon'] }; st.trophees = { premiere: T, cent: T }; R.etat(st, T);
  const k = R.carnet(st, { coupes: ['or'], badge: false }, C), f = (id) => k.find((x) => x.id === id);
  check(k.length >= 10 && k.every((x) => x.total > 0 && x.items.every((i) => i.nom && i.obtenir)), `${k.length} familles, ${k.reduce((a, x) => a + x.total, 0)} objets, chacun avec « comment l’obtenir »`);
  check(f('quartier').gagnes === 2 && f('podium').gagnes === 1 && f('trophees').gagnes === 2 && f('trophees').total === G.TROPHEES.length, `les compteurs : Quartier ${f('quartier').gagnes}/${f('quartier').total}, classement ${f('podium').gagnes}/${f('podium').total}, trophées ${f('trophees').gagnes}/${f('trophees').total}`);
  check(f('chaine').gagnes === new Set(st.chaine.b.map((b) => b.q)).size, `les souvenirs de quartier : un par quartier où la chaîne a une boutique (${f('chaine').gagnes})`);
  check(!st.arriere, 'lire le carnet ne crée pas l’arrière-salle (cachée tant qu’on ne l’a pas trouvée)');
  if (C) check(k.some((x) => x.id === 'casino-trophees' && x.total === C.TROPHEES.length) && k.some((x) => x.id === 'casino-skins' && x.total > 0), 'les trophées et les habillages de l’arrière-salle, quand src/casino.js est chargé');
}

console.log('── 10) la taille de la sauvegarde ──');
{
  const st = partieAvancee(30); R.etat(st, T);
  const vide = JSON.stringify(st.chaine).length;
  for (const b of R.etat(st).b) { b.s = Array.from({ length: 16 }, (x, i) => 1234 + i); b.a = 65535; b.b = Math.pow(2, 23) - 1; b.m = '643334333'; b.c = 1.234567890123e45; b.g = [5, 4]; b.vu = T; b.pj = 400; b.jp = 123; b.or = 1; b.nm = 'Une boutique au nom long'; b.am = '3434--------------5'.slice(0, 19).replace(/-/g, '-'); R.poser(st, b.n, [['chaudron', 's1'], ['neon', 'm2'], ['legende', 's2'], ['citrouilles', 's3'], ['toiles', 'r1'], ['bestiaire', 'm1']]); }
  const plein = JSON.stringify(st.chaine).length, principale = JSON.stringify(Object.assign({}, st, { chaine: undefined })).length;
  check(vide <= 3000 && plein <= 10000, `29 boutiques : ${vide} octets neuves, ${plein} tout au max (≤ 10 Ko ; la boulangerie seule : ${principale} octets)`);
}

console.log('── 11) le branchement dans le jeu : newState, le crochet du prestige, le pigeon, la tenue, la photo ──');
{
  check(JSON.stringify(G.newState(T).chaine) === JSON.stringify(R.chaineNeuve()), 'newState porte la chaîne neuve (cree: 0) : une vieille sauvegarde la reçoit par ui.js lire()');
  check(typeof G.brancherPrestige === 'function' && typeof R.rejoindre === 'function', 'GAME.brancherPrestige existe, src/chaine.js s’y est branché au chargement');
  // une vieille sauvegarde jamais relue par l'écran (cree: 0) à la boutique n°13 : le prestige rouvre les n°1 à 12 à neuf, la n°13 rejoint telle quelle
  const st = partieAvancee(13); st.chaine = R.chaineNeuve(); st.nomBoutique = 'Au Pain Doré'; st.coins = 3e18; st.ameliorations = { farine: true }; st.mobilier = { tables: 2 };
  const q13 = G.quartier(st), garde = (s) => JSON.stringify(Object.assign({}, s, { chaine: null }));
  const r = G.nouvelleBoutique(st, T), c = st.chaine, b13 = c.b.find((b) => b.n === 13);
  check(r.ok && st.boutiques === 14 && c.cree === 1 && c.b.length === 13 && c.b.slice(0, 12).every((b) => b.s.join() === '1' && b.c === 0), 'nouvelleBoutique (crochet branché) : les n°1 à 12 rouvertes à neuf, une fois');
  check(b13 && b13.s[0] === 150 && b13.c === 3e18 && b13.nm === 'Au Pain Doré' && b13.q === q13 && R.bonusDe(b13).farine && b13.m === '2' && b13.jp === b13.pj && b13.pj > 0, `la n°13 rejoint avec ses niveaux, sa caisse, son nom et son quartier d’avant (${G.QUARTIERS[q13].nom}), ses ${b13 && b13.pj} paliers à prendre`);
  check(st.coins === 0 && st.lifetimeRun === 0 && st.nomBoutique === '' && st.stations[0].niv === 1 && G.quartier(st) === G.quartierDe(14), 'la boulangerie, elle, est effacée comme avant (caisse, gains de la boutique, nom, postes), dans le quartier de la n°14');
  // le crochet ne change rien d'autre : la même partie, avec et sans lui
  const a = partieAvancee(9), b = JSON.parse(JSON.stringify(a)); G.brancherPrestige(null); G.nouvelleBoutique(a, T); G.brancherPrestige(R.rejoindre); G.nouvelleBoutique(b, T);
  check(garde(a) === garde(b) && b.chaine.b.length === 9 && !a.chaine.b.length, 'avec et sans le crochet, la boulangerie est identique octet pour octet après le prestige (hors st.chaine)');
  // le pigeon voyageur : un compagnon sans bonus, gagné en jetons de chaîne
  const p = G.compagnon('pigeon'), sp = partieAvancee(12); R.etat(sp, T); sp.chaine.jetons = 500;
  check(p && p.prix === null && typeof p.condition === 'function' && !Object.keys(p.bonus).length && !G.aCompagnon(sp, 'pigeon'), 'le pigeon voyageur : au catalogue des compagnons, sans bonus, verrouillé');
  check(R.acheterObjet(sp, 'pigeon').ok && G.aCompagnon(sp, 'pigeon') && G.choisirCompagnon(sp, 'pigeon').ok && JSON.stringify(G.bonusCompagnon(sp)) === '{}', 'acheté en jetons (120) : à soi, choisi, et toujours aucun bonus');
  // la tenue de la chaîne : quatre pièces sans bonus ni ensemble, dans la garde-robe
  const tenue = Object.values(G.GARDEROBE.objets).filter((v) => v.collection === 'chaine');
  check(tenue.map((v) => v.id).join() === 'chaine-toque,chaine-veste,chaine-souliers,chaine-cles' && tenue.every((v) => !Object.keys(v.bonus).length && v.rarete === 'epique') && !G.GARDEROBE.ensembles.chaine, 'la collection « chaine » : toque, veste, souliers, clés ; sans bonus, épique, sans ensemble');
  const rv = G.bonusGardeRobe(sp).gainsTous; R.acheterObjet(sp, 'chaine-toque'); R.acheterObjet(sp, 'chaine-cles');
  check(G.possede(sp, 'chaine-toque') && G.possede(sp, 'chaine-cles') && G.equiper(sp, 'tete', 'chaine-toque').ok && G.equiper(sp, 'accessoire', 'chaine-cles').ok && G.bonusGardeRobe(sp).gainsTous === rv, 'achetées en jetons : dans la garde-robe, portées, sans rien changer aux gains');
  // le carnet : chaque objet une seule fois, même quand game.js connaît le pigeon et la tenue
  const k = R.carnet(sp, null, C), ids = k.flatMap((f) => f.items.map((x) => f.id + '/' + x.id));
  check(new Set(ids).size === ids.length && k.find((f) => f.id === 'compagnons').total === G.COMPAGNONS.length && k.find((f) => f.id === 'tenues').items.filter((x) => x.id.startsWith('chaine-')).length === 4, `le carnet sans doublon : ${ids.length} objets (les compagnons ${G.COMPAGNONS.length}, la tenue de la chaîne une fois)`);
  // la photo du classement : dc (les décos posées) et ch (la chaîne en deux nombres), relus champ par champ
  const ph = CL.photo(sp, { G, dc: R.codeDecos([['neon', 'm2'], ['chaudron', 's1']]), ch: [12, 3] });
  check(ph && ph.dc === R.codeDecos([['neon', 'm2'], ['chaudron', 's1']]) && JSON.stringify(ph.ch) === '[12,3]', `la photo porte dc (« ${ph && ph.dc} ») et ch ([12, 3])`);
  const lu = CL.nettoyerPhoto(Object.assign({}, ph, { dc: 'zz<', ch: [1e9, -4, 7] })), lu2 = CL.nettoyerPhoto(ph);
  check(lu && !('dc' in lu) && JSON.stringify(lu.ch) === '[999,0]' && lu2.dc === ph.dc && JSON.stringify(lu2.ch) === '[12,3]', 'nettoyerPhoto : un dc piégé retiré, ch borné ; une bonne photo relue à l’identique');
  const vis = CL.boutiqueDepuisPhoto(ph, { G, maintenant: T }), vis0 = CL.boutiqueDepuisPhoto(Object.assign({}, ph, { dc: undefined }), { G, maintenant: T });
  check(vis && JSON.stringify(vis.decos) === JSON.stringify([['neon', 'm2'], ['chaudron', 's1']]), 'la visite d’une photo avec dc : ses décos posées, à leurs places');
  check(vis0 && vis0.decos === null, 'une photo sans dc : decos null (le plan d’origine, comme aujourd’hui)');
}

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout passe.');
process.exit(fails ? 1 : 0);
