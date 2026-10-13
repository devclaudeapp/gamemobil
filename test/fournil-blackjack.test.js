#!/usr/bin/env node
// L'arrière-salle du Fournil (src/blackjack.js) : le BlackJack caché, ses règles pures. Valeurs des mains (as 1/11), BlackJack naturel,
// le croupier (tire jusqu'à 17, reste sur 17 souple), les paiements (3 pour 2, 1 pour 1, égalité rendue), doubler, chaque mise annexe
// (Perfect Pairs, 21+3), les mises bornées à la caisse (tapis compris), le sabot de 6 jeux re-mélangé à 75 %, le hasard sans horloge,
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
{ // la page : blackjack.js est assemblé dans le jeu, avant l'interface
  const build = require('fs').readFileSync(require('path').join(__dirname, '..', 'build.js'), 'utf8');
  check(/'blackjack\.js'/.test(build) && build.indexOf("'blackjack.js'") < build.indexOf("'ui.js'"), 'build.js charge src/blackjack.js avant ui.js');
}

console.log(`\n${n - fails}/${n} ${fails ? 'ÉCHECS : ' + fails : 'tout est vert'}`);
process.exit(fails ? 1 : 0);
