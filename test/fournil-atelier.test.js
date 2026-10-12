#!/usr/bin/env node
// L'Atelier du Fournil : les trois mini-jeux (enfournement en rythme, façonnage au doigt, mémoire du pâtissier), leurs scores, leurs records,
// et leurs gains : calés sur le rythme de la boutique, plafonnés par mini-jeu et par jour, les jours comptés à l'heure de Paris.
// Lancer : TZ=Europe/Paris node test/fournil-atelier.test.js   (le fuseau de la machine ne doit rien changer : les jours sont ceux de Paris)
'use strict';
const G = require('../src/game.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 7, 8, 0); // un mercredi d'octobre (heure d'été) : 10 h à Paris
const seeded = (a) => { let s = a; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

// une boutique qui tourne : quelques recettes, deux apprentis
function boutique(now) {
  const st = G.newState(now); st.now = now;
  G.gagner(st, 5e6, true); G.acheter(st, 1); G.acheter(st, 2); G.embaucher(st, 0); G.embaucher(st, 1);
  st.coins = 0; G.objectifsDuJour(st, now); return st;
}

console.log('── la sauvegarde ──');
{
  const st = G.newState(T0);
  check(st.atelier && G.JEUX_ATELIER.every((j) => st.atelier.records[j.id] === 0 && st.atelier.payees[j.id] === 0 && st.atelier.gains[j.id] === 0), 'une boutique neuve : records, parties payées et gains du jour à zéro, pour les trois mini-jeux');
  check(G.JEUX_ATELIER.map((j) => j.id).join(',') === 'four,faconnage,memoire', 'trois mini-jeux : four, faconnage, memoire');
  const vieille = JSON.parse(JSON.stringify(st)); delete vieille.atelier; vieille.now = T0; // une sauvegarde d'avant l'Atelier
  const a = G.atelierDuJour(vieille); check(a.jour === '2026-10-07' && a.records.four === 0 && a.payees.memoire === 0, 'une sauvegarde d’avant l’Atelier : tout est créé à zéro');
  const abimee = G.newState(T0); abimee.atelier = { records: { four: 'x', faconnage: -3 }, payees: null }; const b = G.atelierDuJour(abimee);
  check(b.records.four === 0 && b.records.faconnage === 0 && b.payees.four === 0 && b.gains.memoire === 0, 'une sauvegarde abîmée est réparée (valeurs absurdes remises à zéro)');
  const rond = JSON.parse(JSON.stringify(abimee)); check(JSON.stringify(rond.atelier) === JSON.stringify(abimee.atelier), 'l’Atelier passe en JSON sans perte (records et gains du jour dans la sauvegarde fournil.v2)');
}

console.log('── 1. Enfournement en rythme ──');
function bot(bruitPorte, bruitDore, seed = 1, dt = 1 / 60) { // touche à l'instant visé, avec une erreur tirée dans ±bruit × la tolérance
  const rnd = seeded(seed), e = G.fourNouveau(); let cible = null;
  while (!e.fini) {
    G.fourAvancer(e, dt);
    if (e.phase === 'tapis' && !e.perdue) { if (cible == null) cible = G.FOUR.porte + (rnd() * 2 - 1) * bruitPorte * e.niv.tolPorte; if (e.x >= cible) { G.fourToucher(e); cible = null; } }
    else if (e.phase === 'four') { if (cible == null) cible = 1 + (rnd() * 2 - 1) * bruitDore * e.niv.tolDore; if (e.c >= cible) { G.fourToucher(e); cible = null; } }
    else cible = null;
  }
  return e;
}
{
  const rien = G.fourNouveau(); while (!rien.fini) G.fourAvancer(rien, 1 / 30);
  check(rien.score === 0 && rien.rates > 10 && rien.enfournes === 0 && Math.abs(rien.t - G.FOUR.duree) < 0.05, `sans toucher : 0 point, ${rien.rates} plaques passées, la partie dure ${G.FOUR.duree} s`);
  const parfait = bot(0, 0), moyen = bot(0.6, 0.6), maladroit = bot(1.5, 1.5);
  console.log(`  parfait ${parfait.score} (${parfait.k} plaques, combo ×${parfait.comboMax}) · moyen ${moyen.score} · maladroit ${maladroit.score}`);
  check(parfait.parfaits === parfait.k && parfait.rates === 0 && parfait.comboMax === parfait.parfaits && parfait.k >= 12, `un geste parfait : ${parfait.k} plaques, toutes parfaites, combo ×${parfait.comboMax}`);
  check(parfait.score > moyen.score && moyen.score > maladroit.score && maladroit.score > 0, 'le score suit la précision : parfait > moyen > maladroit > rien');
  check(moyen.score >= G.jeuAtelier('four').plein * 0.8 && moyen.score <= G.jeuAtelier('four').plein * 1.4, `la partie « pleine » (${G.jeuAtelier('four').plein} points) est à la portée d’un bon joueur (moyen : ${moyen.score})`);
  check(parfait.score < G.jeuAtelier('four').max, 'le plafond de score (contre les valeurs absurdes) est très au-dessus d’une partie parfaite');
  const n0 = G.fourNiveau(0), n10 = G.fourNiveau(10), n40 = G.fourNiveau(40);
  check(n10.vitesse > n0.vitesse && n10.cuisson < n0.cuisson && n10.tolPorte < n0.tolPorte && n10.tolDore < n0.tolDore, 'la difficulté monte : le tapis accélère, la cuisson est plus rapide, les fenêtres rétrécissent');
  check(n40.vitesse <= 0.95 && n40.cuisson >= 0.75 && n40.tolPorte >= 0.05 && n40.tolDore >= 0.1, 'sans devenir impossible (vitesse, cuisson et tolérances bornées)');
  // les verdicts, un par un
  const e = G.fourNouveau(); G.fourAvancer(e, G.FOUR.debut + 0.01); check(e.phase === 'tapis', 'après une courte attente, la première plaque arrive sur le tapis');
  check(G.fourToucher(e).type === 'tot' && e.perdue && e.combo === 0, 'toucher trop tôt : la plaque tombe');
  while (e.phase !== 'attente') G.fourAvancer(e, 1 / 60);
  check(G.fourToucher(e) === null, 'entre deux plaques, une touche ne compte pas');
  while (!(e.phase === 'tapis' && e.x >= G.FOUR.porte)) G.fourAvancer(e, 1 / 120);
  const en = G.fourToucher(e); check(en.type === 'enfournee' && en.parfait && e.phase === 'four' && e.score === 5, 'pile devant la bouche : enfournée, +5');
  while (e.c < 0.5) G.fourAvancer(e, 1 / 120);
  const pale = G.fourToucher(e); check(pale.verdict === 'pale' && pale.points === 0, 'sortie trop tôt : pâle, 0 point');
  for (let k = 0; k < 2; k++) { while (!(e.phase === 'tapis' && e.x >= G.FOUR.porte)) G.fourAvancer(e, 1 / 120); G.fourToucher(e); while (e.c < 1) G.fourAvancer(e, 1 / 240); const s = G.fourToucher(e); check(s.verdict === 'parfait' && s.combo === k + 1 && s.points === 20 + 5 * (k + 1), `doré parfait : +${s.points}, combo ×${s.combo}`); }
  while (!(e.phase === 'tapis' && e.x >= G.FOUR.porte)) G.fourAvancer(e, 1 / 120); G.fourToucher(e); while (e.c < 1 + e.niv.tolDore * 0.7) G.fourAvancer(e, 1 / 240);
  const bon = G.fourToucher(e); check(bon.verdict === 'bon' && bon.points === 10 && e.combo === 0 && e.comboMax === 2, 'bien doré mais pas parfait : +10, le combo retombe (le meilleur reste ×2)');
  while (!(e.phase === 'tapis' && e.x >= G.FOUR.porte)) G.fourAvancer(e, 1 / 120); G.fourToucher(e); let r = null; while (!r) r = G.fourAvancer(e, 1 / 60);
  check(r.type === 'brulee' && e.phase === 'attente', 'oubliée au four : brûlée, la plaque suivante arrive');
  let p = null; while (!p) { p = G.fourAvancer(e, 1 / 60); } check(p.type === 'passee' && e.perdue, 'une plaque qu’on laisse passer est ratée');
  const sc = e.score; while (!e.fini) G.fourAvancer(e, 0.5); check(G.fourToucher(e) === null && G.fourAvancer(e, 1) === null && e.score === sc, 'la partie finie, plus rien ne compte');
}

console.log('── 2. Façonnage au doigt ──');
{
  const M = G.MODELES_FACONNAGE, ids = G.FACONNAGE.ordre;
  check(ids.join(',') === 'entailles,spirale,tresse' && M.entailles.traits.length === 4 && M.spirale.traits.length === 1 && M.tresse.traits.length === 2, 'trois formes : les quatre entailles de la baguette, la spirale du pain aux raisins, les deux brins de la tresse');
  const bruit = (t, a) => t.map((p, k) => [p[0] + a * Math.sin(k * 1.7), p[1] + a * Math.cos(k * 2.3)]);
  ids.forEach((id) => {
    const m = M[id], parfait = G.noterFaconnage(id, m.traits), tremble = G.noterFaconnage(id, m.traits.map((t) => bruit(G.reechantillonner(t, 30), 0.02))), decale = G.noterFaconnage(id, m.traits.map((t) => t.map((p) => [p[0] + 0.06, p[1] + 0.02])));
    const loin = G.noterFaconnage(id, m.traits.map((t) => t.map((p) => [p[0] * 0.3, p[1] * 0.3 + 0.7]))), envers = G.noterFaconnage(id, m.traits.map((t) => t.slice().reverse()));
    console.log(`  ${id.padEnd(10)} parfait ${parfait.note} · tremblé ${tremble.note} · décalé ${decale.note} · ailleurs ${loin.note} · à l’envers ${envers.note}`);
    check(parfait.note === 100 && parfait.envers === 0 && !parfait.desordre && parfait.oublies === 0, `${id} : le geste du modèle vaut 100`);
    check(tremble.note >= 85 && decale.note < tremble.note && decale.note >= 40 && loin.note <= 15, `${id} : la note suit la distance au modèle (tremblé ${tremble.note} > décalé ${decale.note} > ailleurs ${loin.note})`);
    check(envers.note === 50 && envers.envers === m.traits.length, `${id} : tracé à l’envers, note divisée par deux`);
    check(G.noterFaconnage(id, []).note === 0 && G.noterFaconnage(id, null).note === 0 && G.noterFaconnage(id, [[[0.5, 0.5], [0.501, 0.5]]]).note === 0, `${id} : rien tracé (ou une simple touche) : 0`);
  });
  const desordre = G.noterFaconnage('entailles', M.entailles.traits.slice().reverse());
  check(desordre.desordre && desordre.note === 75, `les entailles dans le désordre (de droite à gauche) : ${desordre.note}`);
  const tresseDesordre = G.noterFaconnage('tresse', M.tresse.traits.slice().reverse()); check(tresseDesordre.desordre && tresseDesordre.note === 75, 'la tresse : le second brin avant le premier, ×0,75');
  const oubli = G.noterFaconnage('entailles', M.entailles.traits.slice(0, 2)); check(oubli.oublies === 2 && oubli.note === 50, 'deux entailles sur quatre : 50');
  const trop = G.noterFaconnage('spirale', [M.spirale.traits[0], [[0.1, 0.1], [0.3, 0.1]]]); check(trop.enTrop === 1 && trop.note === 92, 'un trait en trop : −8');
  const r = G.reechantillonner([[0, 0], [1, 0], [1, 1]], 21); check(r.length === 21 && Math.abs(r[10][0] - 1) < 1e-9 && Math.abs(r[10][1]) < 1e-9 && Math.abs(r[20][1] - 1) < 1e-9, 'rééchantillonnage régulier le long du trait');
  const nans = G.noterFaconnage('spirale', [[[NaN, 0], [0.2, 0.2], [0.4, 0.4]]]); check(Number.isFinite(nans.note) && nans.note >= 0 && nans.note <= 100, 'des points absurdes ne cassent pas la note');
  // la tresse : deux départs bien distincts (on voit le rond 1 et le rond 2), à bonne distance l'un de l'autre
  const [b1, b2] = M.tresse.traits, d0 = Math.hypot(b1[0][0] - b2[0][0], b1[0][1] - b2[0][1]);
  check(d0 > 0.05 && b1[0][0] > b2[0][0], `la tresse : les deux brins partent de deux points distincts (écart ${d0.toFixed(2)})`);
  check(M.tresse.traits.every((t) => t.every((p) => Math.abs(p[0] - 0.5) <= 0.3 && p[1] >= 0.05 && p[1] <= 0.95)), 'la tresse : les brins restent dans la brioche');
  // le doigt levé en route : la reprise prolonge le trait
  const sp = M.spirale.traits[0], cut = Math.floor(sp.length * 0.6);
  let a = G.ajouterTrait([], sp.slice(0, cut)); const part = a.traces; a = G.ajouterTrait(a.traces, sp.slice(cut - 1).map((p) => [p[0] + 0.01, p[1] + 0.01]));
  const deux = G.noterFaconnage('spirale', a.traces);
  check(a.accroche && a.traces.length === 1 && deux.note >= 90 && deux.enTrop === 0, `une spirale en deux morceaux jointifs (le doigt levé à 60 %) : un seul trait, ${deux.note}/100`);
  check(G.couvertureFaconnage('spirale', part) < G.FACONNAGE.couvert && G.couvertureFaconnage('spirale', a.traces) >= 0.95, `la couverture du modèle : ${G.couvertureFaconnage('spirale', part).toFixed(2)} à 60 % (on attend la suite), ${G.couvertureFaconnage('spirale', a.traces).toFixed(2)} une fois finie`);
  let e4 = { traces: [] }; M.entailles.traits.forEach((t) => { e4 = G.ajouterTrait(e4.traces, t); });
  check(e4.traces.length === 4 && !e4.accroche && G.noterFaconnage('entailles', e4.traces).note === 100, 'les quatre entailles restent quatre traits (aucune n’accroche la précédente)');
  let t2 = G.ajouterTrait([], b1); t2 = G.ajouterTrait(t2.traces, b2);
  check(t2.traces.length === 2 && G.noterFaconnage('tresse', t2.traces).note === 100, 'les deux brins de la tresse restent deux traits');
  check(ids.every((id) => G.couvertureFaconnage(id, M[id].traits.map((t) => bruit(G.reechantillonner(t, 30), 0.02))) >= G.FACONNAGE.couvert), 'un geste tremblé couvre le modèle : la forme est notée aussitôt');
  check(G.couvertureFaconnage('tresse', [b1]) < G.FACONNAGE.couvert && G.couvertureFaconnage('spirale', []) === 0 && G.couvertureFaconnage('x', [sp]) === 0, 'un brin sur deux, rien tracé, un modèle inconnu : pas couvert');
}

console.log('── 3. Mémoire du pâtissier ──');
{
  const ids = G.INGREDIENTS.map((x) => x.id);
  check(ids.join(',') === 'farine,beurre,oeufs,sucre,lait,levure,chocolat,sel', 'huit ingrédients : farine, beurre, œufs, sucre, lait, levure, chocolat, sel');
  const r10 = G.memoireRecette(1234, 10), r5 = G.memoireRecette(1234, 5);
  check(r10.length === 10 && r10.slice(0, 5).join() === r5.join(), 'la recette s’allonge : la manche suivante garde le début et ajoute un ingrédient');
  check(r10.every((x) => ids.includes(x)) && r10.every((x, k) => k === 0 || x !== r10[k - 1]), 'des ingrédients connus, jamais deux fois le même d’affilée');
  check(G.memoireRecette(1234, 6).join() === G.memoireRecette(1234, 6).join() && G.memoireRecette(1, 8).join() !== G.memoireRecette(2, 8).join(), 'la même graine donne la même recette, une autre graine une autre');
  const sais = G.memoireSaisir(r5, r5.slice(0, 3)); check(sais.ok && !sais.complet && sais.justes === 3, 'trois justes sur cinq : on continue');
  const faux = G.memoireSaisir(r5, [r5[0], r5[1] === 'sel' ? 'farine' : 'sel']); check(!faux.ok && faux.justes === 1, 'une erreur au deuxième ingrédient : perdu');
  check(G.memoireSaisir(r5, r5).complet, 'les cinq dans l’ordre : recette réussie');
  check(G.memoireMontre(3) < G.memoireMontre(8) && G.memoireMontre(3) >= 2.5 && G.memoireMontre(8) <= 6, `la recette s’affiche plus longtemps quand elle est longue (${G.memoireMontre(3)} s pour 3, ${G.memoireMontre(8)} s pour 8)`);
  check(G.memoireScore(0) === 0 && G.memoireScore(1) === 3 && G.memoireScore(5) === 25 && G.memoireScore(5) === G.jeuAtelier('memoire').plein, 'le score : 3 + 4 + 5 + … ; cinq recettes réussies (jusqu’à 7 ingrédients) font la partie pleine (25)');
  // une partie jouée sans faute tient dans la minute : combien de manches au plus ?
  let t = 0, k = 0; while (true) { const nIng = G.MEMOIRE.debut + k, d = G.memoireMontre(nIng) + nIng * 0.45 + 0.8; if (t + d > G.MEMOIRE.duree) break; t += d; k++; }
  check(k >= 6 && k <= 9, `sans faute, en touchant vite : ${k} recettes dans la minute (score ${G.memoireScore(k)}), la partie dure 20 à 60 s`);
}

console.log('── les gains : modestes, calés sur le rythme, plafonnés par jour ──');
{
  const st = boutique(T0), r = G.rythme(st), plein = G.primePleineAtelier(st);
  check(plein === G.arrondi(r * G.ATELIER.secondes), `une partie pleine paie ${G.ATELIER.secondes} s du rythme de la boutique (${G.fmtEur(plein)} pour ${G.fmtEur(r)}/s)`);
  check(G.primeAtelier(st, 'four', 0) === 0 && G.primeAtelier(st, 'four', 40) === 0 && G.primeAtelier(st, 'four', 225) === G.arrondi(plein * 0.5) && G.primeAtelier(st, 'four', 99999) === plein, 'la prime suit la qualité (rien sous 10 %, la moitié à mi-score, jamais plus que la partie pleine)');
  const neuve = G.newState(T0); neuve.now = T0; const pn = G.primePleineAtelier(neuve); check(pn >= G.ATELIER.plancher && pn <= 50, `une boutique neuve : ${G.fmtEur(pn)} la partie pleine (jamais moins de ${G.ATELIER.plancher} €)`);
  // trois parties payées, puis on joue pour le record
  const c0 = st.coins, l0 = st.lifetime, x0 = st.xp;
  const p1 = G.finirAtelier(st, 'memoire', 25); check(p1.ok && p1.prime === plein && p1.record && p1.ancien === 0 && st.coins === c0 + plein && st.lifetime === l0 + plein && st.xp === x0 + G.ATELIER.xp && p1.reste === 2, `1re partie : record (25), +${G.fmtEur(p1.prime)}, encore 2 parties payées`);
  const p2 = G.finirAtelier(st, 'memoire', 12); check(p2.prime === G.primeAtelier(st, 'memoire', 12) && !p2.record && st.atelier.records.memoire === 25, `2e partie (12 points) : +${G.fmtEur(p2.prime)}, le record reste 25`);
  const p0 = G.finirAtelier(st, 'memoire', 0); check(p0.prime === 0 && p0.reste === 1 && !p0.plafond && !p0.pourLeRecord, 'une partie à 0 point ne rapporte rien et n’use pas une partie payée');
  const p3 = G.finirAtelier(st, 'memoire', 30); check(p3.prime > 0 && p3.record && p3.reste === 0 && p3.plafond && !p3.pourLeRecord, '3e partie payée (avec son gain) : le plafond du jour est atteint');
  const cA = st.coins, xA = st.xp, p4 = G.finirAtelier(st, 'memoire', 40);
  check(p4.ok && p4.prime === 0 && p4.plafond && p4.pourLeRecord && p4.record && st.atelier.records.memoire === 40 && st.coins === cA && st.xp === xA, 'au-delà : on joue pour le record (40), sans gain ni savoir-faire');
  check(st.atelier.gains.memoire === p1.prime + p2.prime + p3.prime && st.atelier.payees.memoire === 3 && st.atelier.parties.memoire === 5, 'les gains du jour et les parties sont comptés');
  check(G.restantesAtelier(st, 'four') === 3 && G.finirAtelier(st, 'four', 450).prime === plein, 'chaque mini-jeu a son propre plafond');
  check(st.jour.objectifs.filter((o) => o.type === 'gagner').every((o) => o.progres === 0), 'les primes de l’Atelier ne comptent pas pour l’objectif « Gagne … » (comme les autres primes)');
  // valeurs absurdes : bornées
  const st2 = boutique(T0);
  [NaN, -5, Infinity, 'abc', null, undefined].forEach((v) => { const x = G.finirAtelier(st2, 'faconnage', v); if (!(x.ok && x.score === 0 && x.prime === 0)) check(false, `score absurde ${v}`); });
  check(st2.atelier.records.faconnage === 0 && st2.atelier.payees.faconnage === 0, 'des scores absurdes (NaN, négatif, infini, texte) comptent pour 0, sans gain');
  const g = G.finirAtelier(st2, 'faconnage', 1e9); check(g.score === 300 && g.prime === G.primePleineAtelier(st2), 'un score impossible est ramené au maximum du mini-jeu (300 au façonnage)');
  check(!G.finirAtelier(st2, 'triche', 10).ok, 'un mini-jeu inconnu est refusé');
}

console.log('── les jours de Paris ──');
{
  // été (UTC+2) : minuit à Paris = 22 h UTC ; hiver (UTC+1) : 23 h UTC
  for (const [nom, avant, apres] of [['heure d’été', Date.UTC(2026, 6, 14, 21, 59), Date.UTC(2026, 6, 14, 22, 1)], ['heure d’hiver', Date.UTC(2026, 11, 3, 22, 59), Date.UTC(2026, 11, 3, 23, 1)]]) {
    const st = boutique(avant);
    for (let k = 0; k < 3; k++) G.finirAtelier(st, 'four', 450);
    check(G.restantesAtelier(st, 'four') === 0 && G.finirAtelier(st, 'four', 450).prime === 0, `${nom} : 23 h 59 à Paris, plafond atteint`);
    st.now = apres; const r = G.finirAtelier(st, 'four', 100);
    check(r.prime > 0 && st.atelier.payees.four === 1 && st.atelier.jour === G.dayKey(apres) && st.atelier.records.four === 450, `${nom} : 0 h 01 à Paris, une nouvelle journée (${st.atelier.jour}) : les gains reviennent, le record reste`);
  }
  // à 23 h 30 à Paris, le jour UTC est déjà le lendemain en été… mais pas pour le Fournil
  const st = boutique(Date.UTC(2026, 6, 14, 21, 30)); G.finirAtelier(st, 'four', 450);
  st.now = Date.UTC(2026, 6, 14, 21, 50); check(G.atelierDuJour(st).payees.four === 1 && G.atelierDuJour(st).jour === '2026-07-14', 'la journée suit Paris, pas l’UTC ni le fuseau du téléphone');
  // passage à l'heure d'hiver (25 octobre 2026, 3 h → 2 h) : une seule journée
  const oct = boutique(Date.UTC(2026, 9, 24, 21, 30)); G.finirAtelier(oct, 'memoire', 25); // samedi 24 octobre, 23 h 30 à Paris (heure d'été)
  oct.now = Date.UTC(2026, 9, 24, 22, 30); const j25 = G.atelierDuJour(oct).jour, p25 = oct.atelier.payees.memoire; G.finirAtelier(oct, 'memoire', 25); // dimanche 0 h 30
  oct.now = Date.UTC(2026, 9, 25, 22, 30); const j25b = G.atelierDuJour(oct).jour, p25b = oct.atelier.payees.memoire; // dimanche 23 h 30 (heure d'hiver depuis 3 h)
  oct.now = Date.UTC(2026, 9, 25, 23, 30); const j26 = G.atelierDuJour(oct).jour, p26 = oct.atelier.payees.memoire; // lundi 0 h 30
  check(j25 === '2026-10-25' && p25 === 0 && j25b === '2026-10-25' && p25b === 1 && j26 === '2026-10-26' && p26 === 0, 'le dimanche du passage à l’heure d’hiver (25 heures) : une seule journée, de minuit à minuit à Paris');
}

console.log('── l’économie ne bouge pas ──');
{
  // au pire, neuf parties pleines par jour : comparé à ce que la boutique gagne et aux autres primes du jour
  const st = boutique(T0), r = G.rythme(st), maxJour = G.JEUX_ATELIER.length * G.ATELIER.parJour * G.primePleineAtelier(st);
  const objectifs = G.objectifsDuJour(st, T0).objectifs.reduce((s, o) => s + o.prime, 0);
  console.log(`  au plus ${G.fmtEur(maxJour)} par jour (${(maxJour / r / 60).toFixed(1)} min de rythme) · primes des objectifs du jour ${G.fmtEur(objectifs)} (${(objectifs / r / 60).toFixed(1)} min)`);
  check(maxJour / r <= 15 * 60, 'au plus 15 minutes de rythme par jour, toutes parties de l’Atelier confondues');
  check(maxJour < objectifs, 'moins que les seules primes des trois objectifs du jour');
  check(maxJour / r < 0.05 * 8 * 3600, 'moins de 5 % de ce que rapportent les apprentis en 8 h d’absence');
  // l'Atelier ne lance aucun événement : tick n'en connaît que sept, et aucun mini-jeu n'en fait partie
  check(!Object.keys(G.EVENEMENTS).some((k) => G.JEUX_ATELIER.some((j) => j.id === k)), 'aucun mini-jeu de l’Atelier n’est un événement surprise : ils ne se lancent qu’à volonté');
  const s2 = G.newState(T0); let lances = 0; for (let t = 0; t < 4 * 3600; t += 1) { const o = G.tick(s2, 1, T0 + t * 1000, seeded(5)); if (o.nouvelEv && G.jeuAtelier(o.nouvelEv.type)) lances++; }
  check(lances === 0 && G.JEUX_ATELIER.every((j) => s2.atelier.parties[j.id] === 0), '4 h de jeu sans toucher l’Atelier : aucune partie, aucun gain de l’Atelier');
}

console.log(`\n${n - fails}/${n} vérifications.`);
console.log(fails ? `${fails} ÉCHEC(S)` : 'Tout passe.');
process.exit(fails ? 1 : 0);
