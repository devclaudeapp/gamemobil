#!/usr/bin/env node
// L'arrière-salle du Fournil (src/blackjack.js) : le BlackJack caché, ses règles pures. Valeurs des mains (as 1/11), BlackJack naturel,
// le croupier (tire jusqu'à 17, reste sur 17 souple), les paiements (3 pour 2, 1 pour 1, égalité rendue), doubler, chaque mise annexe
// (Perfect Pairs, 21+3), les mises bornées à la caisse (tapis compris), le sabot de 6 jeux re-mélangé à 75 %, le hasard sans horloge,
// Lot 7 : Séparer une paire (variante C : une fois, as séparés une carte chacun, pas de double après partage, 21 après partage payé 1 pour 1),
// le croupier après un partage, une vieille main ou de vieilles statistiques, « Le bon coup » situation par situation (contre la table du
// repérage et blackjack-strategy 1.4.0 s'il est là), et le rendement simulé avec le moteur réel (2 millions de mains : −0,60 % attendu).
// et surtout : AUCUNE incidence sur la fortune (lifetime, lifetimeRun), les étoiles, les objectifs, les défis ou les points de boulanger.
// Lancer : TZ=Europe/Paris node test/fournil-blackjack.test.js
'use strict';
const G = require('../src/game.js'), B = require('../src/blackjack.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 14, 8, 0);
// une carte par son nom : 'A♠', '10♥', 'R♦', '7♣'…
const carte = (s) => { const m = /^(A|[2-9]|10|V|D|R)([♠♥♦♣])$/.exec(s); if (!m) throw new Error(s); return B.SYMBOLES.indexOf(m[2]) * 13 + B.RANGS.indexOf(m[1]) - 1; };
const cartes = (t) => t.split(' ').map(carte);
const proche = (a, b) => Math.abs(a - b) < 1e-6;
// un état de boutique ; le sabot préparé : les cartes dans l'ordre de la donne (joueur, croupier, joueur, croupier, puis les tirages)
function boutique(coins) { const st = G.newState(T0); st.coins = coins; st.lifetime = 123456; st.lifetimeRun = 65432; st.etoiles = 3; return st; }
function empiler(st, ordre) { const a = B.etat(st), c = cartes(ordre); a.sabot = c.concat(B.nouveauSabot(() => 0.5).slice(c.length)); a.pos = 0; return a; }
const empreinte = (st) => JSON.stringify({ lifetime: st.lifetime, lifetimeRun: st.lifetimeRun, etoiles: st.etoiles, jour: st.jour, points: st.points, semaine: st.semaine, stats: st.stats, trophees: st.trophees, atelier: st.atelier, xp: st.xp });

console.log('── les cartes et la valeur des mains ──');
check(B.nomCarte(carte('A♠')) === 'A♠' && B.nomCarte(carte('10♥')) === '10♥' && B.nomCarte(carte('R♣')) === 'R♣', 'les noms des cartes (as, 10, roi ; ♠ ♥ ♦ ♣)');
check(B.rouge(carte('3♥')) && B.rouge(carte('3♦')) && !B.rouge(carte('3♠')) && !B.rouge(carte('3♣')), 'cœur et carreau rouges, pique et trèfle noirs');
const v = (t) => B.valeur(cartes(t));
check(v('A♠ R♥').total === 21 && v('A♠ R♥').blackjack && v('A♠ R♥').souple, 'as + roi : 21, BlackJack naturel');
check(v('A♠ 10♦').blackjack && v('D♣ A♥').blackjack && v('V♦ A♦').blackjack, 'as + 10 / dame / valet : BlackJack, dans tous les ordres');
check(!v('7♠ 7♥ 7♦').blackjack && v('7♠ 7♥ 7♦').total === 21, 'trois cartes qui font 21 : pas un BlackJack');
check(v('A♠ 6♥').total === 17 && v('A♠ 6♥').souple, 'as + 6 : 17 souple');
check(v('A♠ 6♥ R♦').total === 17 && !v('A♠ 6♥ R♦').souple, 'as + 6 + roi : l’as repasse à 1 (17 dur)');
check(v('A♠ A♥').total === 12 && v('A♠ A♥').souple, 'deux as : 12 (un à 11, un à 1)');
check(v('A♠ A♥ A♦ A♣').total === 14, 'quatre as : 14');
check(v('A♠ A♥ 9♦').total === 21, 'as, as, 9 : 21');
check(v('R♠ D♥ 2♦').brule && v('R♠ D♥ 2♦').total === 22, 'roi, dame, 2 : 22, brûlé');
check(v('5♠ 6♥').total === 11 && !v('5♠ 6♥').souple, '5 + 6 : 11 dur');

console.log('── le croupier ──');
check(B.croupierTire(cartes('10♠ 6♥')) && !B.croupierTire(cartes('10♠ 7♥')), 'il tire sur 16, reste sur 17');
check(!B.croupierTire(cartes('A♠ 6♥')), 'il reste sur 17 souple (as + 6)');
check(B.croupierTire(cartes('A♠ 5♥')), 'il tire sur 16 souple');
{ // le croupier joue : 10 + 6, tire un 5 → 21
  const st = boutique(1000); empiler(st, '10♠ 10♥ 9♦ 6♣ 5♥');
  B.distribuer(st, { main: 100 }); B.rester(st);
  const h = B.etat(st).main;
  check(h.fin && h.croupier.length === 3 && B.valeur(h.croupier).total === 21 && h.resultat === 'perdu' && proche(st.coins, 900), 'le croupier tire sur 16 (21) : 19 perd, la mise est perdue');
}
{ const st = boutique(1000); empiler(st, '10♠ A♥ 9♦ 6♣ 5♥'); B.distribuer(st, { main: 100 }); B.rester(st); const h = B.etat(st).main; check(h.croupier.length === 2 && B.valeur(h.croupier).total === 17 && h.resultat === 'gagne' && proche(st.coins, 1100), 'as + 6 au croupier : il reste sur 17 souple, 19 gagne 1 pour 1'); }
{ const st = boutique(1000); empiler(st, '10♠ 10♥ 8♦ 6♣ R♥'); B.distribuer(st, { main: 100 }); B.rester(st); const h = B.etat(st).main; check(h.resultat === 'croupierBrule' && B.valeur(h.croupier).brule && proche(st.coins, 1100), 'le croupier brûle (26) : la main gagne 1 pour 1'); }

console.log('── les paiements ──');
{ const st = boutique(1000); empiler(st, 'A♠ 9♥ R♦ 7♣'); const r = B.distribuer(st, { main: 100 }); const h = r.main;
  check(r.ok && h.fin && h.resultat === 'blackjack' && proche(h.gain, 250) && proche(st.coins, 1150), 'BlackJack naturel : payé 3 pour 2 (100 → +150), la main finit tout de suite'); }
{ const st = boutique(1000); empiler(st, 'A♠ A♥ R♦ D♣'); const h = B.distribuer(st, { main: 100 }).main; check(h.fin && h.resultat === 'egalite' && proche(st.coins, 1000), 'BlackJack contre BlackJack : égalité, la mise est rendue'); }
{ const st = boutique(1000); empiler(st, '10♠ A♥ 9♦ R♣'); const h = B.distribuer(st, { main: 100 }).main; check(h.fin && h.resultat === 'croupierBJ' && proche(st.coins, 900) && h.croupier.length === 2, 'BlackJack du croupier : la main est perdue d’office, sans tirer'); }
{ const st = boutique(1000); empiler(st, '10♠ 10♥ 8♦ 8♣'); B.distribuer(st, { main: 100 }); B.rester(st); const h = B.etat(st).main; check(h.resultat === 'egalite' && proche(st.coins, 1000) && proche(h.net, 0), 'égalité (18 contre 18) : mise rendue, bilan nul'); }
{ const st = boutique(1000); empiler(st, '10♠ 10♥ 6♦ 8♣ 9♥'); B.distribuer(st, { main: 100 }); B.tirer(st); const h = B.etat(st).main; check(h.fin && h.resultat === 'brule' && h.croupier.length === 2 && proche(st.coins, 900), 'le joueur brûle (25) : perdu, le croupier ne tire même pas'); }
{ const st = boutique(1000); empiler(st, '5♠ 10♥ 6♦ 7♣ R♦'); B.distribuer(st, { main: 100 }); B.tirer(st); const h = B.etat(st).main; check(h.fin && B.valeur(h.joueur).total === 21 && h.resultat === 'gagne' && proche(st.coins, 1100), 'à 21 après un tirage, on reste d’office : 21 contre 17 gagne'); }
{ const st = boutique(1000); empiler(st, '10♠ 9♥ 7♦ R♣'); B.distribuer(st, { main: 100 }); B.rester(st); check(B.etat(st).main.resultat === 'perdu' && proche(st.coins, 900), '17 contre 19 du croupier : perdu, la mise part'); }

console.log('── doubler ──');
{ const st = boutique(1000); empiler(st, '6♠ 10♥ 5♦ 7♣ R♦'); B.distribuer(st, { main: 100 });
  check(B.peutDoubler(st), 'doubler possible sur les deux premières cartes');
  B.doubler(st); const h = B.etat(st).main;
  check(h.double && h.joueur.length === 3 && proche(h.mise, 200) && h.resultat === 'gagne' && proche(st.coins, 1200), 'doubler : la mise passe à 200, une seule carte (21), gagné 1 pour 1 sur 200'); }
{ const st = boutique(1000); empiler(st, '6♠ 10♥ 5♦ 7♣ 2♦ 3♥'); B.distribuer(st, { main: 100 }); B.tirer(st); check(!B.peutDoubler(st) && !B.doubler(st).ok, 'plus de double après un tirage (trois cartes)'); }
{ const st = boutique(150); empiler(st, '6♠ 10♥ 5♦ 7♣ R♦'); B.distribuer(st, { main: 100 }); check(!B.peutDoubler(st) && !B.doubler(st).ok && proche(st.coins, 50), 'pas de double si la caisse ne couvre pas la mise (50 € pour 100)'); }
{ const st = boutique(1000); empiler(st, '6♠ 10♥ 5♦ 6♣ 2♦ 10♥'); B.distribuer(st, { main: 100 }); B.doubler(st); const h = B.etat(st).main; check(h.double && B.valeur(h.joueur).total === 13 && h.croupier.length === 3 && h.resultat === 'croupierBrule' && proche(st.coins, 1200), 'doubler à 11 et tirer un 2 : on reste à 13, le croupier joue (16 + 10 brûle)'); }

console.log('── Perfect Pairs ──');
const pp = (a, b) => B.perfectPairs(carte(a), carte(b));
check(pp('7♠', '7♠') && pp('7♠', '7♠').type === 'parfaite' && pp('7♠', '7♠').mult === 25, 'paire parfaite (7♠ 7♠) : 25 pour 1');
check(pp('7♥', '7♦') && pp('7♥', '7♦').type === 'couleur' && pp('7♥', '7♦').mult === 12 && pp('7♠', '7♣').type === 'couleur', 'paire de couleur (7♥ 7♦, 7♠ 7♣) : 12 pour 1');
check(pp('7♥', '7♠') && pp('7♥', '7♠').type === 'mixte' && pp('7♥', '7♠').mult === 5, 'paire mixte (7♥ 7♠) : 5 pour 1');
check(pp('7♥', '8♥') === null && pp('R♥', 'D♥') === null && pp('10♠', 'R♠') === null, 'pas de paire (deux figures différentes ne font pas une paire)');
{ const st = boutique(1000); empiler(st, '8♥ 9♣ 8♦ 10♣'); const h = B.distribuer(st, { main: 100, paires: 10 }).main; const x = h.annexes.find((a) => a.id === 'paires');
  check(x && x.combinaison.type === 'couleur' && proche(x.gain, 130) && proche(st.coins, 1000 - 110 + 130), 'Perfect Pairs payé dès la donne : 10 × 12 + la mise = 130'); }
{ const st = boutique(1000); empiler(st, '8♥ 9♣ 9♦ 10♣'); const h = B.distribuer(st, { main: 100, paires: 10 }).main; const x = h.annexes[0]; check(x.gain === 0 && x.combinaison === null && proche(st.coins, 890), 'Perfect Pairs perdu : la mise annexe part'); }

console.log('── 21+3 ──');
const p3 = (t) => { const c = cartes(t); return B.vingtEtUnPlusTrois(c[0], c[1], c[2]); };
check(p3('2♥ 9♥ R♥').type === 'couleur' && p3('2♥ 9♥ R♥').mult === 5, 'couleur (trois cœurs) : 5 pour 1');
check(p3('4♠ 5♥ 6♦').type === 'quinte' && p3('4♠ 5♥ 6♦').mult === 10, 'quinte (4, 5, 6) : 10 pour 1');
check(p3('A♠ 2♥ 3♦').type === 'quinte' && p3('D♠ R♥ A♦').type === 'quinte' && p3('R♠ A♥ 2♦') === null, 'l’as en bas (A-2-3) ou en haut (D-R-A), jamais R-A-2');
check(p3('9♠ 9♥ 9♦').type === 'brelan' && p3('9♠ 9♥ 9♦').mult === 30, 'brelan (trois 9) : 30 pour 1');
check(p3('V♣ D♣ R♣').type === 'quinteCouleur' && p3('V♣ D♣ R♣').mult === 40, 'quinte couleur (V-D-R de trèfle) : 40 pour 1');
check(p3('9♦ 9♦ 9♦').type === 'brelanCouleur' && p3('9♦ 9♦ 9♦').mult === 100, 'brelan de même enseigne (trois 9♦, six jeux) : 100 pour 1');
check(p3('2♠ 9♥ R♥') === null && p3('2♠ 4♥ 6♦') === null, 'rien : ni couleur, ni suite, ni brelan');
{ const st = boutique(1000); empiler(st, '4♠ 6♦ 5♥ 10♣'); const h = B.distribuer(st, { main: 100, plus3: 20 }).main; const x = h.annexes.find((a) => a.id === 'plus3');
  check(x && x.combinaison.type === 'quinte' && proche(x.gain, 220), '21+3 avec la carte visible du croupier (4, 5 + 6) : quinte, 20 × 10 + 20 = 220'); }
{ const st = boutique(10000); empiler(st, '7♠ 7♠ 7♠ 10♣'); const h = B.distribuer(st, { main: 100, paires: 10, plus3: 10 }).main;
  check(h.annexes.find((a) => a.id === 'paires').combinaison.type === 'parfaite' && h.annexes.find((a) => a.id === 'plus3').combinaison.type === 'brelanCouleur' && proche(st.coins, 10000 - 120 + 260 + 1010), 'les deux annexes sur la même donne (7♠ 7♠ / 7♠) : paire parfaite 25:1 et brelan de même enseigne 100:1'); }

console.log('── les mises : bornées à la caisse, tout ou rien ──');
{ const st = boutique(500);
  const b = B.borner(st, { main: 800, paires: 50, plus3: 50 });
  check(b.main === 500 && b.paires === 0 && b.plus3 === 0 && b.tapis, 'une mise au-delà de la caisse est ramenée à la caisse (500), plus rien pour les annexes');
  const c = B.borner(st, { main: 450, paires: 40, plus3: 40 }); check(c.main === 450 && c.paires === 40 && c.plus3 === 10 && c.total === 500, 'les annexes passent après la principale : 450 + 40 + 10');
  check(B.borner(st, { main: -5, paires: NaN, plus3: Infinity }).total === 0, 'mises négatives, NaN, infinies : zéro');
  check(!B.distribuer(st, { main: 0.5 }).ok && st.coins === 500, 'il faut 1 € au moins sur la mise principale');
  check(B.jeton(st, 0.01) === 5 && B.jeton(st, 0.1) === 50 && B.jeton(st, 0.5) === 250 && B.jeton(st, 1) === 500, 'les jetons : 1 %, 10 %, 50 % de la caisse, et le tapis');
  st.coins = 123456.78; check(B.jeton(st, 0.01) === 1200 && B.jeton(st, 0.1) === 12000 && B.jeton(st, 1) === 123456.78, 'arrondis à des montants ronds (1 200, 12 000), le tapis exact');
  check(B.pas(1000) === 50 && B.pas(30) === 1 && B.pas(1e9) === 5e7, 'le pas du réglage fin : un cran rond d’un vingtième');
}
{ const st = boutique(777.5); empiler(st, '10♠ 10♥ 9♦ 8♣');
  check(B.estTapis(st, { main: 777.5 }) && !B.estTapis(st, { main: 700 }), 'le tapis : toute la caisse en jeu');
  B.distribuer(st, { main: 1e9 }); check(st.coins === 0 && B.etat(st).main.mise === 777.5 && B.etat(st).main.tapis, 'tapis : la caisse est vide pendant la main');
  B.rester(st); check(proche(st.coins, 1555), 'tapis gagné : la caisse double (19 contre 18)'); }
{ const st = boutique(300); empiler(st, '10♠ 10♥ 7♦ 8♣'); B.distribuer(st, { main: 300 }); B.rester(st); check(st.coins === 0 && B.etat(st).main.resultat === 'perdu', 'tapis perdu : la caisse est à zéro (tout ou rien)');
  check(!B.distribuer(st, { main: 1 }).ok, 'caisse vide : plus de donne possible'); }
{ const st = boutique(1000); empiler(st, '10♠ 10♥ 7♦ 8♣'); B.distribuer(st, { main: 100 }); check(!B.distribuer(st, { main: 100 }).ok, 'pas de nouvelle donne tant que la main n’est pas finie'); }

console.log('── le sabot : six jeux, re-mélangé à 75 %, hasard sans horloge ──');
{ const s = B.nouveauSabot(); const comptes = new Array(52).fill(0); s.forEach((c) => comptes[c]++);
  check(s.length === 312 && comptes.every((k) => k === 6), 'un sabot neuf : 312 cartes, chaque carte six fois');
  const s2 = B.nouveauSabot(); check(s.join() !== s2.join(), 'deux sabots neufs ne se ressemblent pas');
  const st = boutique(1e6); const a = B.etat(st); a.pos = 233; const avant = a.sabot.slice();
  B.distribuer(st, { main: 1 }); check(a.pos === 237 && a.sabot.join() === avant.join(), 'à 233 cartes sorties sur 312 (< 75 %) : on continue le même sabot');
  const st2 = boutique(1e6); const a2 = B.etat(st2); a2.pos = 234; const av2 = a2.sabot.slice(); const r = B.distribuer(st2, { main: 1 });
  check(r.melange && a2.pos === 4 && a2.sabot.join() !== av2.join(), 'à 234 cartes sorties (75 %) : re-mélange avant la donne');
  // le hasard n'a aucun lien avec l'horloge : même instant (Date.now figé), deux sabots différents
  const dn = Date.now; Date.now = () => 1234567890000; const x = B.nouveauSabot().join(), y = B.nouveauSabot().join(); Date.now = dn;
  check(x !== y, 'horloge figée : les sabots restent imprévisibles (crypto.getRandomValues)');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'blackjack.js'), 'utf8');
  check(!/Date\.now|new Date|performance\.now|HORLOGE/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'src/blackjack.js ne lit jamais l’heure (ni Date, ni performance.now, ni HORLOGE)');
  check(B.hasard() >= 0 && B.hasard() < 1, 'hasard() dans [0, 1)');
}
{ // un sabot cassé dans la sauvegarde est remplacé ; la main en cours survit à un aller-retour JSON (fermer l'appli ne rend pas la mise)
  const st = boutique(1000); st.arriere = { sabot: [1, 2, 3], pos: 99, main: 'x' }; const a = B.etat(st);
  check(a.sabot.length === 312 && a.pos === 0 && a.main === null && a.trouvee === false, 'une vieille sauvegarde abîmée : sabot neuf, pas de main');
  empiler(st, '10♠ 10♥ 6♦ 8♣ 3♥'); B.distribuer(st, { main: 200 });
  const st2 = JSON.parse(JSON.stringify(st)); check(proche(st2.coins, 800) && B.enCours(st2) && B.enCours(st2).joueur.length === 2, 'la main en cours et la mise prise survivent à la sauvegarde');
  B.tirer(st2); check(B.etat(st2).main.joueur.length === 3 && B.valeur(B.etat(st2).main.joueur).total === 19, 'et se rejouent après rechargement (la carte suivante du même sabot)');
}

console.log('── aucune incidence sur la fortune, les étoiles, les objectifs, les points ──');
{ const st = boutique(1e6); G.objectifsDuJour(st, T0); const avant = empreinte(st), sem = JSON.stringify(G.detailPoints ? G.detailPoints(st) : null);
  let net = 0; const c0 = st.coins;
  for (let k = 0; k < 4000; k++) {
    const r = B.distribuer(st, { main: 100, paires: k % 3 === 0 ? 5 : 0, plus3: k % 5 === 0 ? 5 : 0 }); if (!r.ok) break;
    let h = B.enCours(st); let garde = 0;
    while (h && garde++ < 12) { const t = B.valeur(h.joueur).total; if (t <= 11 && B.peutDoubler(st) && k % 2) B.doubler(st); else if (t < 17) B.tirer(st); else B.rester(st); h = B.enCours(st); }
    net += B.etat(st).main.net;
  }
  check(empreinte(st) === avant, '4 000 mains : lifetime, lifetimeRun, étoiles, objectifs du jour, points, semaine, statistiques, trophées, Atelier, expérience : inchangés');
  check(JSON.stringify(G.detailPoints ? G.detailPoints(st) : null) === sem, 'aucun point de boulanger gagné');
  check(proche(st.coins, c0 + net), `seule la caisse bouge, du bilan exact des mains (${Math.round(net)} €)`);
  const S = B.etat(st).stats; check(S.mains === 4000 && S.gagnees + S.perdues + S.egalites === 4000 && S.blackjacks > 100 && S.annexes > 0, `les statistiques de la salle : ${S.gagnees} gagnées, ${S.perdues} perdues, ${S.egalites} égalités, ${S.blackjacks} BlackJacks`);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'blackjack.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  check(!/gagner|lifetime|etoiles|noter|points\(|objectif/.test(src.replace(/points\s*=\s*\(c\)|points\(c\)/g, '')), 'src/blackjack.js n’appelle ni gagner(), ni noter(), et n’écrit ni lifetime ni étoiles');
}
{ // l'avantage de la maison reste raisonnable (stratégie simple) : le jeu n'est pas une planche à billets
  const st = boutique(1e12); let mise = 0, net = 0;
  for (let k = 0; k < 60000; k++) { B.distribuer(st, { main: 100 }); mise += 100; let h = B.enCours(st); while (h) { const vv = B.valeur(h.joueur), up = B.points(h.croupier[0]); if (vv.total >= 17 || (vv.total >= 13 && up >= 2 && up <= 6 && !vv.souple) || (vv.total === 12 && up >= 4 && up <= 6)) B.rester(st); else B.tirer(st); h = B.enCours(st); } net += B.etat(st).main.net; }
  const rtp = 1 + net / mise; check(rtp > 0.9 && rtp < 1.02, `taux de retour sur 60 000 mains, stratégie simple : ${(rtp * 100).toFixed(1)} % (la maison garde un petit avantage)`);
}
console.log('── une main en cours et une nouvelle boutique ──');
{ // la main laissée ouverte (caisse misée, arrière-salle fermée) ne suit pas dans la boutique neuve : annulée, la mise part avec l'ancienne caisse
  const st = boutique(1e9); st.lifetimeRun = 1e15; empiler(st, '10♠ 6♥ 10♦ R♣ 5♠');
  B.distribuer(st, { main: 1e9 }); const h = B.enCours(st);
  check(h && st.coins === 0, 'tapis : toute la caisse sur la table, la main en cours (16 contre un roi)');
  const S0 = JSON.stringify(B.etat(st).stats), r = G.nouvelleBoutique(st, T0);
  check(r.ok && r.main && r.main.mise === 1e9 && B.enCours(st) === null && B.etat(st).main === null, 'la nouvelle boutique annule la main (sa mise rendue à la caisse d’avant)');
  check(st.coins === 0 && !B.rester(st).ok && !B.tirer(st).ok && !B.doubler(st).ok && st.coins === 0, 'la boutique neuve démarre à 0 € : finir la main n’y fait plus rien tomber');
  const S1 = B.etat(st).stats; check(JSON.stringify(S1) === S0, 'ni gagnée ni perdue aux statistiques de l’arrière-salle');
  check(B.distribuer(st, { main: 1 }).ok === false, 'et sans argent, pas de nouvelle main');
  const s2 = boutique(1000); s2.lifetimeRun = 1e15; empiler(s2, '10♠ 6♥ 10♦ R♣'); B.distribuer(s2, { main: 100 }); B.rester(s2); const fin = JSON.stringify(B.etat(s2).main);
  check(G.nouvelleBoutique(s2, T0).ok && JSON.stringify(B.etat(s2).main) === fin, 'une main déjà finie reste telle quelle (le résultat affiché)');
  check(G.nouvelleBoutique({ ...G.newState(T0), lifetimeRun: 1e15 }, T0).ok, 'sans arrière-salle (jamais trouvée) : rien ne change');
}
console.log('── séparer une paire (lot 7, variante C) ──');
{ const st = boutique(1000); empiler(st, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦'); B.distribuer(st, { main: 100 });
  check(B.peutSeparer(st) && B.conseil(st).coup === 'separer', 'une paire de 8 contre un 10 : Séparer possible, et conseillé');
  const r = B.separer(st), h = B.etat(st).main;
  check(r.ok && h.separee && h.mains.length === 2 && proche(h.mise, 200) && proche(st.coins, 800) && h.mains.every((m) => proche(m.mise, 100) && m.cartes.length === 2), 'séparer : deux mains de 100 (la seconde mise prise dans la caisse), chacune reçoit sa deuxième carte tout de suite');
  check(h.joueur.join() === cartes('8♠ 8♦').join() && B.valeur(h.mains[0].cartes).total === 11 && B.valeur(h.mains[1].cartes).total === 18, 'h.joueur garde la paire d’origine ; main 1 : 8 + 3, main 2 : 8 + 10');
  check(!B.peutDoubler(st) && !B.doubler(st).ok && proche(st.coins, 800), 'pas de double après partage (même sur 11)');
  check(!B.peutSeparer(st) && B.separer(st).raison === 'deja', 'une seule fois');
  check(B.mainActive(h) === 0 && B.mains(h).length === 2 && B.mains(h)[0].active && !B.mains(h)[1].active && B.mains(h)[0].resultat === null, 'B.mains : deux mains, la première active, pas encore de résultat');
  B.tirer(st);
  check(B.valeur(h.mains[0].cartes).total === 21 && h.mains[0].fin && B.mainActive(h) === 1 && !h.fin, 'main 1 : 21 (8 + 3 + roi), on reste d’office ; on passe à la main 2');
  B.rester(st);
  check(h.fin && h.croupier.length === 2 && h.mains.every((m) => m.resultat === 'gagne' && proche(m.gain, 200)) && h.resultat === 'gagne' && proche(h.gain, 400) && proche(st.coins, 1200) && proche(h.net, 200),
    'le croupier reste sur 17 : les deux mains gagnent 1 pour 1 (la caisse : 1 000 → 1 200)');
  const M = B.mains(h); check(M.length === 2 && M.every((m) => m.fin && !m.active && m.resultat === 'gagne' && proche(m.gain, 200) && m.double === false && m.as === false), 'B.mains après la main : chaque résultat et chaque gain');
  const S = B.etat(st).stats; check(S.separees === 1 && S.mains === 1 && S.gagnees === 1 && S.serie === 1 && S.meilleureSerie === 1, 'les statistiques : un partage, une main gagnée (la série à 1)'); }
{ const st = boutique(1000); empiler(st, 'V♠ 10♥ R♦ 7♣'); B.distribuer(st, { main: 100 }); check(B.peutSeparer(st) && B.conseil(st).coup === 'rester', 'valet et roi : même valeur, ils se séparent (mais le bon coup dit de rester sur 20)'); }
{ const st = boutique(1000); empiler(st, '7♠ 10♥ 8♦ 7♣'); B.distribuer(st, { main: 100 }); const r = B.separer(st);
  check(!B.peutSeparer(st) && !r.ok && r.raison === 'paire' && proche(st.coins, 900), '7 et 8 : pas une paire, rien ne bouge'); }
{ const st = boutique(1000); empiler(st, '8♠ 10♥ 8♦ 7♣ 8♥ 8♣'); B.distribuer(st, { main: 100 }); B.separer(st); const h = B.etat(st).main;
  check(B.valeur(h.mains[0].cartes).total === 16 && !B.peutSeparer(st) && B.separer(st).raison === 'deja' && h.mains.length === 2, 'une nouvelle paire après partage (8 + 8) ne se sépare plus : deux mains au plus'); }
{ const st = boutique(150); empiler(st, '8♠ 10♥ 8♦ 7♣'); B.distribuer(st, { main: 100 }); const r = B.separer(st);
  check(!B.peutSeparer(st) && r.raison === 'caisse' && proche(st.coins, 50) && !B.etat(st).main.separee, 'caisse trop courte (50 € pour une seconde mise de 100) : pas de partage');
  const c = B.conseil(st); check(c.ideal === 'separer' && c.coup === 'tirer' && /séparer si la caisse suivait/.test(c.texte), `le bon coup suit la caisse : 16 dur contre un 10, tirer (« ${c.texte} »)`); }
{ const st = boutique(1000); check(B.separer(st).raison === 'main' && !B.peutSeparer(st) && B.conseil(st) === null, 'sans main en cours : ni partage ni conseil'); }
{ const st = boutique(1000); empiler(st, '8♠ 10♥ 8♦ 7♣'); B.distribuer(st, { main: 100 }); const h = B.etat(st).main; h.double = true; // un double déjà posé (une main à deux cartes, cas d'école)
  check(!B.peutSeparer(st) && B.separer(st).raison === 'double', 'jamais après avoir doublé'); }

console.log('── as séparés : une carte chacun ; 21 après partage payé 1 pour 1 ──');
{ const st = boutique(1000); empiler(st, 'A♠ 10♥ A♦ 7♣ R♥ 9♠'); B.distribuer(st, { main: 100 }); const r = B.separer(st), h = B.etat(st).main;
  check(r.ok && h.fin && h.mains.every((m) => m.as && m.cartes.length === 2), 'deux as séparés : une carte chacun, la main est jouée d’office');
  check(h.mains[0].resultat === 'gagne' && proche(h.mains[0].gain, 200) && h.mains[1].resultat === 'gagne' && proche(st.coins, 1200) && B.etat(st).stats.blackjacks === 0,
    'as + roi après partage : 21 payé 1 pour 1 (200 rendus pour 100), jamais un BlackJack (3 pour 2)'); }
{ const st = boutique(1000); empiler(st, 'A♠ 10♥ A♦ 7♣ 2♥ 3♠'); B.distribuer(st, { main: 100 }); B.separer(st); const h = B.etat(st).main;
  check(h.fin && !B.tirer(st).ok && h.mains.every((m) => m.cartes.length === 2 && m.resultat === 'perdu') && proche(st.coins, 800), 'as + 2 et as + 3 (13 et 14 souples) : pas de troisième carte, perdues contre 17'); }

console.log('── le croupier après un partage ──');
{ const st = boutique(1000); empiler(st, '8♠ 10♥ 8♦ 6♣ 5♥ 6♠ R♦ R♣ 5♣'); B.distribuer(st, { main: 100 }); B.separer(st); B.tirer(st); B.tirer(st); const h = B.etat(st).main;
  check(h.fin && h.mains.every((m) => m.resultat === 'brule') && h.croupier.length === 2 && h.resultat === 'perdu' && proche(st.coins, 800), 'les deux mains brûlent : le croupier ne tire pas (il garde 16)'); }
{ const st = boutique(1000); empiler(st, '8♠ 10♥ 8♦ 6♣ 5♥ 10♠ R♦ R♣'); B.distribuer(st, { main: 100 }); B.separer(st); B.tirer(st); B.rester(st); const h = B.etat(st).main;
  check(h.fin && h.mains[0].resultat === 'brule' && h.croupier.length === 3 && h.mains[1].resultat === 'croupierBrule' && h.resultat === 'egalite' && proche(st.coins, 1000) && proche(h.net, 0),
    'une main brûle, l’autre tient (18) : le croupier tire (16 + roi, brûlé) ; une perdue, une gagnée : égalité au bilan'); }
{ const st = boutique(1000); empiler(st, '9♠ 10♥ 9♦ 7♣ 2♥ 9♣ R♠'); B.distribuer(st, { main: 100 }); B.separer(st); const h = B.etat(st).main;
  check(B.valeur(h.mains[0].cartes).total === 11 && B.conseil(st).coup === 'tirer' && B.conseil(st).ideal === 'tirer', 'le bon coup après partage : 11 contre un 7 → tirer (pas de double après partage)');
  B.tirer(st); B.rester(st); check(h.fin && h.mains[0].resultat === 'gagne' && h.mains[1].resultat === 'gagne' && proche(st.coins, 1200), '21 (9 + 2 + roi) et 18 contre 17 : les deux gagnent'); }
{ // le partage survit à la sauvegarde ; une nouvelle boutique rend la mise des deux mains
  const st = boutique(1000); empiler(st, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠ R♦'); B.distribuer(st, { main: 100 }); B.separer(st);
  const st2 = JSON.parse(JSON.stringify(st)); B.tirer(st2); B.rester(st2); check(B.etat(st2).main.fin && proche(st2.coins, 1200), 'un partage en cours survit à la sauvegarde et se rejoue');
  st.lifetimeRun = 1e15; const r = G.nouvelleBoutique(st, T0); check(r.ok && r.main && r.main.mise === 200, 'GAME.annulerMainArriere : la mise des deux mains (200) rendue à la caisse d’avant');
  const st3 = boutique(1000); empiler(st3, '8♠ 10♥ 8♦ 7♣ 3♥ 10♠'); B.distribuer(st3, { main: 100 }); B.separer(st3); B.etat(st3).main.mains = [1, 2]; check(B.etat(st3).main === null, 'un partage abîmé dans la sauvegarde : la main est écartée'); }
{ // une main d'une vieille sauvegarde (sans caisse, separee, active) se joue jusqu'au bout comme avant
  const st = boutique(1000); empiler(st, '10♠ 10♥ 6♦ 7♣ 3♥'); B.distribuer(st, { main: 100 }); const h = B.etat(st).main; delete h.caisse; delete h.separee; delete h.active;
  const st2 = JSON.parse(JSON.stringify(st)); check(B.mains(B.etat(st2).main).length === 1 && B.mainActive(B.etat(st2).main) === 0 && B.peutDoubler(st2) && !B.peutSeparer(st2), 'une vieille main : une seule main, doubler possible, pas de paire');
  B.tirer(st2); B.rester(st2); check(B.etat(st2).main.fin && B.etat(st2).main.resultat === 'gagne' && proche(st2.coins, 1100), 'elle se finit comme avant (19 contre 17)'); }
{ // les statistiques d'une vieille sauvegarde : les compteurs du lot 7 à zéro, les anciens gardés
  const st = boutique(1000); st.arriere = { stats: { mains: 12, gagnees: 5, perdues: 6, egalites: 1, blackjacks: 1, annexes: 0, plusGrosGain: 300, solde: -200 } }; const S = B.etat(st).stats;
  check(S.mains === 12 && S.solde === -200 && B.STATS.every((k) => Number.isFinite(S[k])) && S.serie === 0 && S.meilleureSerie === 0 && S.separees === 0 && S.doubles === 0 && S.cinqCartes === 0, 'vieille sauvegarde : serie, meilleureSerie, separees, doubles, cinqCartes à zéro, le reste gardé'); }
{ // la série (une égalité ne la casse pas), les doubles, le 21 à cinq cartes
  const st = boutique(1e6); const S = B.etat(st).stats;
  const jouer = (ordre, coups) => { empiler(st, ordre); B.distribuer(st, { main: 100 }); for (const c of coups) B[c](st); return B.etat(st).main; };
  jouer('10♠ 10♥ 9♦ 7♣', ['rester']); jouer('10♠ 10♥ 8♦ 8♣', ['rester']); jouer('6♠ 10♥ 5♦ 7♣ R♦', ['doubler']);
  check(S.serie === 2 && S.meilleureSerie === 2 && S.egalites === 1 && S.doubles === 1, 'gagné, égalité, gagné (doublé) : la série à 2, l’égalité ne la casse pas ; un double compté');
  jouer('10♠ 10♥ 7♦ 9♣', ['rester']); check(S.serie === 0 && S.meilleureSerie === 2, 'une main perdue casse la série ; la meilleure reste 2');
  const h = jouer('2♠ 10♥ 3♦ 7♣ 4♥ 5♠ 7♦', ['tirer', 'tirer', 'tirer']); check(h.fin && h.joueur.length === 5 && h.resultat === 'gagne' && S.cinqCartes === 1, '2 + 3 + 4 + 5 + 7 : 21 à cinq cartes, compté'); }

console.log('── le bon coup : la stratégie de base, situation par situation ──');
{ // la table recopiée du repérage (bjsplit.js : DUR, SOUPLE, PAIRES_NODAS) ; et la bibliothèque blackjack-strategy 1.4.0, si elle est là
  const DUR = { 5: 'HHHHHHHHHH', 6: 'HHHHHHHHHH', 7: 'HHHHHHHHHH', 8: 'HHHHHHHHHH', 9: 'HDDDDHHHHH', 10: 'DDDDDDDDHH', 11: 'DDDDDDDDDH', 12: 'HHSSSHHHHH', 13: 'SSSSSHHHHH', 14: 'SSSSSHHHHH', 15: 'SSSSSHHHHH', 16: 'SSSSSHHHHH', 17: 'SSSSSSSSSS' };
  const SOUPLE = { 13: 'HHHDDHHHHH', 14: 'HHHDDHHHHH', 15: 'HHDDDHHHHH', 16: 'HHDDDHHHHH', 17: 'HDDDDHHHHH', 18: 'STTTTSSHHH', 19: 'SSSSSSSSSS', 20: 'SSSSSSSSSS' };
  const PAIRES = { 1: 'PPPPPPPPPP', 2: 'HHPPPPHHHH', 3: 'HHPPPPHHHH', 4: '----------', 5: '----------', 6: 'HPPPPHHHHH', 7: 'PPPPPPHHHH', 8: 'PPPPPPPPPP', 9: 'PPPPPSPPSS', 10: '----------' };
  const NOM = { H: 'tirer', S: 'rester', D: 'doubler', P: 'separer' };
  const attendu = (c, up, deux) => { const v = B.valeur(c), k = up - 2;
    if (deux && B.points(c[0]) === B.points(c[1]) && PAIRES[B.points(c[0])][k] === 'P') return 'P';
    const x = v.souple && v.total >= 13 && v.total <= 20 ? SOUPLE[v.total][k] : v.souple ? (v.total < 13 ? 'H' : 'S') : DUR[Math.max(5, Math.min(17, v.total))][k];
    return x === 'D' ? (deux ? 'D' : 'H') : x === 'T' ? (deux ? 'D' : 'S') : x; };
  let lib = null; try { lib = require('/tmp/claude-0/-home-user-gamemobil/41d35c83-7751-5490-8f33-9fca376790e6/scratchpad/casino/ref/node_modules/blackjack-strategy'); } catch (e) { lib = null; }
  const opt = { hitSoft17: false, surrender: 'none', double: 'any', doubleAfterSplit: false, resplitAces: false, offerInsurance: false, numberOfDecks: 6, maxSplitHands: 2, strategyComplexity: 'advanced' };
  const LIB = { hit: 'tirer', stand: 'rester', double: 'doubler', split: 'separer' };
  const parRang = (r) => (r === 1 ? 0 : r === 10 ? 12 : r - 1); // un rang 1…10 → une carte de pique (10 : le roi)
  const mains = []; for (let x = 1; x <= 10; x++) for (let y = x; y <= 10; y++) mains.push([x, y]);
  for (let x = 2; x <= 10; x++) for (let y = x; y <= 10; y++) for (let z = 1; z <= 10; z++) mains.push([x, y, z]);
  let n0 = 0, ecartsTable = 0, ecartsLib = 0, nLib = 0, textes = 0, cles = 0; const exemples = [];
  for (const m of mains) for (let up = 1; up <= 10; up++) {
    const c = m.map(parRang), v = B.valeur(c); if (v.total >= 21 || v.blackjack) continue;
    const st = boutique(1e6); B.etat(st).main = { joueur: c, croupier: [parRang(up), parRang(5)], mise: 100, mises: { paires: 0, plus3: 0 }, double: false, cachee: true, fin: false, resultat: null, gain: 0, annexes: [], caisse: 1e6 + 100, separee: false, active: 0 };
    const k = B.conseil(st), u = up === 1 ? 11 : up; n0++;
    if (k.coup !== NOM[attendu(c, u, m.length === 2)] || k.coup !== k.ideal) { ecartsTable++; if (exemples.length < 5) exemples.push(`${m.join('-')} contre ${up} : ${k.coup}`); }
    if (k.texte.length <= 70 && /^(Tire|Reste|Double|Sépare)/.test(k.texte)) textes++;
    if (/^(dur-\d+|souple-\d+|paire-(A|\d+))-(A|\d+)$/.test(k.cle)) cles++;
    if (lib) { const ref = lib.GetRecommendedPlayerAction(m, up, 1, true, opt); if (ref === 'insurance' || ref === 'noinsurance') continue; nLib++; if (LIB[ref] !== k.coup) { ecartsLib++; if (exemples.length < 5) exemples.push(`lib ${m.join('-')} contre ${up} : ${ref} / ${k.coup}`); } }
  }
  check(n0 === 3760 && ecartsTable === 0, `le bon coup = la table du repérage sur ${n0} situations (2 et 3 cartes, contre 2 … as) ${exemples.join(' ; ')}`);
  if (lib) check(nLib === 3760 && ecartsLib === 0, `le bon coup = blackjack-strategy 1.4.0 (6 jeux, S17, pas de double après partage) : ${ecartsLib} écart sur ${nLib} situations`);
  else check(ecartsTable === 0, 'blackjack-strategy introuvable ici : la comparaison s’est faite à la table recopiée (même table, vérifiée 0 écart sur 7 520 situations)');
  check(textes === n0 && cles === n0, 'chaque conseil a son texte (70 caractères au plus) et sa clé (dur-12-2, souple-18-9, paire-8-10)');
  check(B.TABLE && Object.isFrozen(B.TABLE) && B.TABLE.paires[8].join('') === 'PPPPPPPPPP' && B.TABLE.souple[18].join('') === 'STTTTSSHHH' && B.TABLE.dur[12].join('') === 'HHSSSHHHHH', 'B.TABLE : la table en lecture seule (dur, souple, paires)');
}
{ const st = boutique(1000); empiler(st, '6♠ 10♥ 5♦ 6♣'); B.distribuer(st, { main: 100 }); const k = B.conseil(st);
  check(k.coup === 'doubler' && k.ideal === 'doubler' && k.cle === 'dur-11-10' && k.texte === 'Double : 11 dur contre un 10.', `11 dur contre un 10 : doubler (« ${k.texte} »)`);
  st.coins = 50; const k2 = B.conseil(st); check(k2.coup === 'tirer' && k2.ideal === 'doubler', 'caisse trop courte pour doubler : D → tirer'); }
{ const st = boutique(1000); empiler(st, 'A♠ 4♥ 7♦ 6♣'); B.distribuer(st, { main: 100 }); check(B.conseil(st).coup === 'doubler' && B.conseil(st).cle === 'souple-18-4', '18 souple contre un 4 : doubler');
  st.coins = 0; const k = B.conseil(st); check(k.coup === 'rester' && k.ideal === 'doubler', 'caisse vide : Ds → rester'); }
{ const st = boutique(1000); empiler(st, 'A♠ 4♥ A♦ 6♣'); B.distribuer(st, { main: 100 }); const k = B.conseil(st); check(k.coup === 'separer' && k.cle === 'paire-A-4' && k.texte === 'Sépare : paire d’as contre un 4.', `deux as : séparer (« ${k.texte} »)`); }

console.log('── le rendement avec Séparer et le bon coup (le moteur réel, 2 millions de mains) ──');
{ // un générateur à graine fixe (sfc32) pour un résultat reproductible ; le jeu, lui, tire crypto.getRandomValues
  const sfc32 = (a, b, c, d) => () => { a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0; return (t >>> 0) / 4294967296; };
  const rng = sfc32(0x9e3779b9, 0x243f6a88, 0xb7e15162, 7), N = 2e6, st = boutique(1e15); B.etat(st).sabot = B.nouveauSabot(rng);
  const F = { tirer: B.tirer, rester: B.rester, doubler: B.doubler, separer: B.separer };
  const avant = empreinte(st), c0 = st.coins; let partages = 0, doubles = 0;
  for (let i = 0; i < N; i++) { B.distribuer(st, { main: 100 }, rng); let g = 0; while (B.enCours(st) && g++ < 30) { const k = B.conseil(st); if (k.coup === 'separer') partages++; if (k.coup === 'doubler') doubles++; F[k.coup](st, rng); } }
  const rend = (st.coins - c0) / (N * 100), se = 1.96 * 1.15 / Math.sqrt(N);
  check(rend > -0.0085 && rend < -0.0035, `rendement : ${(100 * rend).toFixed(3)} % ± ${(100 * se).toFixed(2)} (attendu −0,60 %, repérage sur 40 millions de mains ; sans partage −0,97 %)`);
  check(partages / N > 0.015 && partages / N < 0.03 && doubles / N > 0.08 && doubles / N < 0.11, `partages ${(100 * partages / N).toFixed(2)} % des mains, doubles ${(100 * doubles / N).toFixed(2)} % (repérage : 2,18 % et 9,54 %)`);
  check(empreinte(st) === avant && B.etat(st).stats.separees === partages && B.etat(st).stats.mains === N, '2 millions de mains, partages compris : rien d’autre que st.coins (et st.arriere) ne bouge');
}
{ // la page : blackjack.js est assemblé dans le jeu, avant l'interface
  const build = require('fs').readFileSync(require('path').join(__dirname, '..', 'build.js'), 'utf8');
  check(/'blackjack\.js'/.test(build) && build.indexOf("'blackjack.js'") < build.indexOf("'ui.js'"), 'build.js charge src/blackjack.js avant ui.js');
}

{ // l'arrière-salle rend la main à la boutique : le rappel « ferme » d'AR.init n'est pas perdu dans un commentaire (bug du 22 oct.)
  const ui = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'ui.js'), 'utf8');
  const i = ui.indexOf('AR.init('), bloc = ui.slice(i, ui.indexOf('apres:', i));
  const code = bloc.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  check(i > 0 && /ferme:\s*\(\)\s*=>/.test(code) && /feteEnAttente/.test(code), 'AR.init reçoit bien « ferme » (hors commentaire) : la fête en attente est jouée en refermant l\'arrière-salle');
}
console.log(`\n${n - fails}/${n} ${fails ? 'ÉCHECS : ' + fails : 'tout est vert'}`);
process.exit(fails ? 1 : 0);
