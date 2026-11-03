#!/usr/bin/env node
// Le lot « progression » (src/game.js et src/progression.js), sans navigateur : les paliers au-delà de la n°30 (titres, finitions, rares,
// défis variés et leur soupape, rattrapage d'une sauvegarde n°47, non-rétroactivité), le pas d'étoiles dès la n°20, le second (part bornée,
// trois achats au plus, budget tenu, mode d'achat intact, ni point ni objectif, éteint avant la n°5, rien pendant l'absence, la réserve),
// les trophées qui rapportent (48, ordre des 37 anciens, dorés après leur trophée, familles, secrets, bonus = la formule, cache), les
// rivales (tirage déterministe, plafonds, égalité, semaine à 0, paiement une fois, ref figée), les projets de quartier (la règle du SQL
// rejouée sur le scénario de l'essai, au point près) et la réparation des sauvegardes (idempotente sur dix états abîmés).
// Lancer : TZ=Europe/Paris node test/fournil-progression.test.js
'use strict';
const G = require('../src/game.js'), P = require('../src/progression.js'), CLM = require('../src/classement.js');
let n = 0, fails = 0;
const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const titre = (t) => console.log(`── ${t} ──`);
const T0 = Date.UTC(2026, 10, 4, 9); // mercredi 4 novembre 2026, 10 h à Paris (pas de marché)
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const neuf = (t) => { const st = G.newState(t || T0); st.now = t || T0; return st; };
// récolter g étoiles d'un coup : la caisse de la boutique qu'il faut (GAME.etoilesPour, à l'envers), un rien au-dessus
const caissePour = (st, g) => g * g * G.ETOILE_BASE * (1 + st.etoiles / 25) * 1.0001;
const ouvrir = (st) => { st.lifetimeRun = Math.max(st.lifetimeRun, 1e30); st.defi = null; return G.nouvelleBoutique(st, st.now); }; // sans le défi

titre('les paliers : rangs, titres, finitions');
{
  check(G.PALIER_PREMIER === 40 && G.PALIER_PAS === 10 && [39, 40, 49, 50, 59, 129, 130].map(G.rangPalier).join() === '0,1,1,2,2,9,10', 'rangPalier : 0 avant la n°40, 1 de la n°40 à la n°49, 2 dès la n°50…');
  check(G.estPalier(40) && G.estPalier(130) && !G.estPalier(30) && !G.estPalier(45) && !G.estPalier(40.5) && G.boutiqueDuPalier(1) === 40 && G.boutiqueDuPalier(7) === 100, 'estPalier, boutiqueDuPalier : n°40, 50… (la n°30 n’en est pas un)');
  const T = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(G.titrePalier);
  check(egal(T.slice(0, 7), ['Boulanger étoilé', 'Légende de la farine', 'Seigneur du levain', 'Prince de la mie', 'Grand Maître boulanger', 'Gardien des fournils', 'Empereur de la baguette']), `les sept titres de la décision du joueur : ${T.slice(0, 7).join(', ')}`);
  check(T[7] === 'Empereur de la baguette II' && T[8] === 'Empereur de la baguette III' && T[9] === 'Empereur de la baguette IV' && G.titrePalier(25) === 'Empereur de la baguette XIX' && G.titrePalier(0) === '', `puis numérotés en chiffres romains, sans fin (${T[7]}, ${T[9]}, ${G.titrePalier(25)})`);
  check(G.TITRES_PALIER.every((t) => !G.TITRES.some(([, x]) => x === t)) && !G.TITRES_PALIER.includes('Légende du Fournil'), 'aucun ne reprend un titre de niveau (« Maître boulanger » : niveau 19) ni celui de la n°30');
  check(G.FINITIONS.length === 7 && G.finitionsDe(3).map((f) => f.id).join() === 'enseigne-or,noyer,onyx' && G.finitionsDe(12).length === 7 && G.finitionsDe(0).length === 0, 'les finitions, cumulées : le palier 3 a l’enseigne dorée, le noyer et l’onyx ; au-delà de 7, toutes');
  check(G.finitionDe(39) === 0 && G.finitionDe(47) === 1 && G.finitionDe(100) === 7 && G.recompensePalier(9).finition.id === 'eclat' && G.recompensePalier(9).etoilesEnseigne === 9 && G.recompensePalier(3).etoilesEnseigne === 0, 'finitionDe(n) = le rang du palier ; au-delà de 7 : la dernière, et k étoiles à l’enseigne');
}

titre('les paliers : récompenses rares et teintes');
{
  const R = Array.from({ length: 14 }, (_, k) => G.recompensePalier(k + 1));
  check(R.slice(0, 12).map((r) => r.rare.type[0]).join('') === 'tcdtcdtcdtcd' && R.slice(0, 12).every((r) => !r.rare.teinte), `douze rares, tour à tour tenue, compagnon, déco (${R.slice(0, 12).map((r) => r.rare.nom).join(', ')})`);
  check(R[12].rare.id === 'etoile-toque~1' && R[12].rare.teinte === 'rubis' && R[12].rare.nom === 'Toque étoilée — rubis' && R[13].rare.id === 'paon~1' && R[13].rare.teinte === 'rubis', `au-delà : les mêmes dans une teinte nouvelle (${R[12].rare.nom}, ${R[13].rare.nom})`);
  const ids = Array.from({ length: 300 }, (_, k) => G.recompensePalier(k + 1).rare.id);
  check(new Set(ids).size === 300 && G.recompensePalier(12 * 9 + 1).rare.nom === 'Toque étoilée — rubis II', `trois cents paliers, trois cents objets différents (le 109e : ${G.recompensePalier(109).rare.nom})`);
  check(R.every((r) => r.boost.mult === 5 && r.boost.secs === 3600 && r.n === 30 + 10 * r.k && r.titre === G.titrePalier(r.k)) && G.recompensePalier(0) === null, 'chacun : un boost ×5 d’une heure en réserve, son titre, sa boutique');
}

titre('les défis de palier : variés, plus durs à chaque tour');
{
  const D = Array.from({ length: 11 }, (_, k) => G.defiPalier(k + 1));
  check(D.slice(0, 10).map((d) => d.id).join() === 'commandes,meubles,petrissages,carte,pourboires,palier,bonus,pannes,etoiles,critiques' && D.every((d, k) => d.palier === k + 1), `dix défis dans un ordre fixe (${D.slice(0, 10).map((d) => G.texteDefi(d)).join(' · ')})`);
  check(D[0].type === 'stat' && D[0].n === 12 && D[1].n === 7 && D[3].type === 'carte' && D[3].niv === 0 && D[5].niv === 550 && D[6].n === 18 && D[8].pas === 2 && D[9].n === 12, 'premier tour : 12 commandes, 7 meubles, toute la carte, une recette au niveau 550, 18 bonus, 2 pas d’étoiles, 12 critiques');
  check(D[10].id === 'commandes' && D[10].n === 14 && G.defiPalier(12).n === 8 && G.defiPalier(13).n === 12 && G.defiPalier(14).niv === 100 && G.defiPalier(16).niv === 600 && G.defiPalier(17).n === 20 && G.defiPalier(19).pas === 3 && G.defiPalier(22).n === 9 && G.defiPalier(29).pas === 4 && G.defiPalier(39).pas === 4 && G.defiPalier(49).pas === 4,
    'puis la liste recommence un cran plus dure (compteurs ×1,2, 8 meubles, la carte au niveau 100, niveau 600, 20 bonus, 3 pas… 9 meubles et 4 pas au plus)');
  // la soupape (4 pas) vaut pour chaque défi de palier : celui d'étoiles n'annonce jamais plus (« 5 pas » quand 4 suffisent, avant)
  const etoilesPalier = Array.from({ length: 300 }, (_, k) => G.defiPalier(k + 1)).filter((d) => d.type === 'etoiles');
  check(etoilesPalier.length === 30 && etoilesPalier.every((d) => d.pas >= 2 && d.pas <= G.SOUPAPE) && etoilesPalier.slice(2).every((d) => d.pas === G.SOUPAPE), `les défis d’étoiles de palier ne dépassent jamais la soupape (${G.SOUPAPE} pas) : ${[...new Set(etoilesPalier.map((d) => d.pas))].join(', ')} pas`);
  check(egal(G.defiDe(39), G.defiPalier(1)) && egal(G.defiDe(49), G.defiPalier(2)) && egal(G.defiDe(129), G.defiPalier(10)) && egal(G.defiDe(139), G.defiPalier(11)), 'defiDe : la boutique 39, 49… (celle qui ouvre un palier) pose le défi du palier');
  check(egal(G.defiDe(30), { type: 'etoiles', pas: 1 }) && egal(G.defiDe(40), { type: 'etoiles', pas: 1 }) && egal(G.defiDe(38), { type: 'etoiles', pas: 1 }), 'toute autre boutique dès la n°30 : « récolte un pas d’étoiles d’un coup »');
  check([20, 25, 29].every((b) => egal(G.defiDe(b), { type: 'etoiles', pas: 2 })) && [10, 15].every((b) => G.defiDe(b).pct === 25) && egal(G.defiDe(21), G.DEFIS_PASSAGE[21]) && G.defiDe(5) === null, 'avant la n°30 : le tableau d’avant, ses défis d’étoiles dès la n°20 deviennent « 2 pas » (n°10 et 15 inchangés)');
  check(G.texteDefi(G.defiDe(29)) === 'Récolte 2 pas d’étoiles d’un coup' && G.texteDefi(G.defiDe(31)) === 'Récolte un pas d’étoiles d’un coup' && G.texteDefi(G.defiPalier(7)) === '18 bonus achetés dans cette boutique' && G.texteDefi(G.defiPalier(4)) === 'Débloque toutes tes recettes dans cette boutique' && G.texteDefi(G.defiPalier(14)) === 'Toutes tes recettes au niveau 100 dans cette boutique',
    'texteDefi connaît les pas, stat, carte, bonus');
  const e = neuf(); e.boutiques = 10; e.etoiles = 300; e.defi = G.creerDefi(e, 10);
  check(G.parcoursListe(e).length === 30 && G.parcoursListe(e)[19].defiTxt === 'Récolte 2 pas d’étoiles d’un coup' && G.parcoursListe(e)[28].defiTxt === 'Récolte 2 pas d’étoiles d’un coup', 'la liste du parcours : 30 lignes, les n°20 et 29 annoncent « 2 pas »');
}

titre('le pas d’étoiles, dès la n°20');
{
  const st = neuf(); st.boutiques = 18; st.etoiles = 700;
  check(G.pasEtoiles(st) === null && G.conseilEtoiles(st) === 175 && G.butParcours(st).conseil === 175, 'avant la n°20 : pas de pas, le conseil d’avant (25 % des étoiles)');
  ouvrir(st); const e19 = st.etoiles; ouvrir(st); const e20 = st.etoiles;
  check(st.boutiques === 20 && st.paliers.pas === Math.max(5, Math.ceil(0.1 * e20)) && st.defi.type === 'etoiles' && st.defi.pas === 2 && st.defi.cible === 2 * st.paliers.pas, `la n°20 : le pas figé à 10 % des étoiles d’alors (${st.paliers.pas} pour ${e20}, ${e19} à la n°19), le défi « récolte +${st.defi.cible} d’un coup » (2 pas)`);
  const pas = st.paliers.pas; st.etoiles *= 3;
  check(G.pasEtoiles(st) === pas && G.butParcours(st).conseil === pas && G.conseilEtoiles(st) === pas, 'figé : il ne bouge plus avec les étoiles ; le conseil « repartir vaut le coup » devient ce pas');
  for (let b = 21; b <= 31; b++) ouvrir(st);
  check(st.boutiques === 31 && st.defi.pas === 1 && st.defi.cible === pas && G.texteDefi(st.defi, st.defi.cible) === `Récolte +${G.fmt(pas)} étoiles d’un coup`, `après la n°30 : chaque boutique demande un pas (+${pas})`);
  const p0 = neuf(); p0.boutiques = 25; p0.etoiles = 20; G.parcours(p0);
  check(p0.paliers.pas === 5, 'un pas de 5 étoiles au moins');
}

titre('un défi de palier : compteurs de la décennie, carte, bonus, soupape, type inconnu');
{
  const st = neuf(); st.boutiques = 29; st.etoiles = 4000; st.stats.commandes = 5; st.stats.pourboires = 1;
  ouvrir(st);
  check(st.boutiques === 30 && st.paliers.decennie && st.paliers.decennie.n === 30 && st.paliers.decennie.stats.commandes === 5 && st.paliers.decennie.stats.pourboires === 1, 'la n°30 ouvre une décennie : les compteurs sont notés (st.paliers.decennie)');
  for (let b = 31; b <= 38; b++) ouvrir(st);
  st.stats.commandes = 9; ouvrir(st);
  let d = G.defiPassage(st);
  check(st.boutiques === 39 && st.defi.type === 'stat' && st.defi.base === 5 && st.defi.depuis === 30 && d.progres === 4 && d.cible === 12 && !d.fait && /depuis la boutique n°30/.test(d.txt), `la n°39 : « ${d.txt} », compté depuis la n°30 (4/12)`);
  check(/ou récolte 4 pas d’étoiles d’un coup/.test(d.txt) && d.soupapeCible === 4 * st.paliers.pas, `la soupape est dite : « … ou récolte 4 pas d’étoiles d’un coup (+${G.fmt(4 * st.paliers.pas)}) »`);
  st.lifetimeRun = caissePour(st, 2 * st.paliers.pas); check(!G.defiPassage(st).fait && !G.nouvelleBoutique(st, st.now).ok, 'deux pas à récolter, le défi pas fait : la n°40 reste fermée');
  st.lifetimeRun = caissePour(st, 4 * st.paliers.pas); d = G.defiPassage(st);
  check(d.fait && d.soupape && d.progres === 4 && G.passageOk(st), 'quatre pas à récolter : la soupape ouvre la porte (soupape: true), le défi lui-même pas fait');
  st.lifetimeRun = 0; st.stats.commandes = 17; d = G.defiPassage(st); check(d.fait && !d.soupape, 'douze commandes depuis la n°30 : fait');
  const boostsAvant = st.boosts.reserve.length; st.lifetimeRun = caissePour(st, st.paliers.pas); const r = G.nouvelleBoutique(st, st.now);
  check(r.ok && st.boutiques === 40 && r.paliers.length === 1 && r.paliers[0].k === 1 && st.paliers.recus.join() === '1' && st.paliers.titre === 'Boulanger étoilé' && G.titreBoulanger(st) === 'Boulanger étoilé', 'la n°40 : le premier palier, « Boulanger étoilé » (titreBoulanger)');
  check(st.boosts.reserve.length === boostsAvant + 1 && st.boosts.reserve[boostsAvant].mult === 5 && st.boosts.reserve[boostsAvant].secs === 3600 && G.rarePossede(st, 'etoile-toque') && st.carnetEv.some((x) => /Palier n°40 : Boulanger étoilé/.test(x.txt)), 'son boost ×5 d’une heure en réserve, la toque étoilée, une ligne au carnet');
  check(G.rattraperPaliers(st).length === 0 && st.boosts.reserve.length === boostsAvant + 1 && st.paliers.decennie.n === 40, 'une seule fois ; la n°40 ouvre la décennie suivante');
  // la carte, les bonus, un type inconnu
  const c = neuf(); c.boutiques = 69; c.defi = G.creerDefi(c, 69);
  check(c.defi.type === 'carte' && G.defiPassage(c).cible === G.recettesConnues(c) && G.recettesConnues(c) === 16 && !G.defiPassage(c).fait, `la n°69 : « ${G.defiPassage(c).txt.split(' —')[0]} » (16 recettes gagnées)`);
  c.stations.forEach((s) => { s.niv = 1; }); check(G.defiPassage(c).fait, 'toutes débloquées : fait');
  c.defi = G.creerDefi(c, 169); check(c.defi.niv === 100 && G.defiPassage(c).progres === 0 && (c.stations.forEach((s) => { s.niv = 100; }), G.defiPassage(c).fait), 'la n°169 : toutes au niveau 100');
  const b = neuf(); b.boutiques = 99; b.defi = G.creerDefi(b, 99); for (const a of G.AMELIORATIONS.slice(0, 17)) b.ameliorations[a.id] = true;
  check(b.defi.type === 'bonus' && G.defiPassage(b).progres === 17 && !G.defiPassage(b).fait && (b.ameliorations[G.AMELIORATIONS[17].id] = true, G.defiPassage(b).fait), 'la n°99 : 18 bonus achetés dans la boutique');
  const u = neuf(); u.boutiques = 55; u.defi = { n: 55, type: 'defi-du-futur', n2: 3 };
  check(G.defiPassage(u).fait && G.passageOk(u) && G.defiPassage(u).inconnu, 'un défi d’un type inconnu (une version future) : fait, jamais bloquant');
}

titre('une vieille sauvegarde à la n°47 : rattrapage une fois, rien de rétroactif');
{
  const v = neuf(); v.boutiques = 47; v.etoiles = 5000; v.defi = { n: 47, type: 'etoiles', pct: 30, cible: 1500 };
  for (const k of ['paliers', 'dores', 'secrets']) delete v[k];
  const fresh = G.newState(T0); for (const k in fresh) if (!(k in v)) v[k] = fresh[k]; // ce que fait lire (ui.js)
  G.parcours(v);
  check(v.paliers.pas === 500 && v.defi.type === 'etoiles' && v.defi.pas === 2 && v.defi.cible === 1000 && v.paliers.recus.length === 0, 'au chargement : le pas figé (10 % : 500), son défi « 30 % » abaissé à deux pas (1 000), rien donné encore');
  const boosts = v.boosts.reserve.length, r = G.rattraperPaliers(v);
  check(r.length === 1 && r[0].k === 1 && v.paliers.titre === 'Boulanger étoilé' && v.boosts.reserve.length === boosts + 1 && G.rarePossede(v, 'etoile-toque'), 'au démarrage : le palier n°40 rattrapé (titre, toque étoilée, boost)');
  check(G.rattraperPaliers(v).length === 0 && v.boosts.reserve.length === boosts + 1 && egal(G.parcours(v), G.parcours(v)), 'une seule fois');
  const w = neuf(); w.boutiques = 39; w.etoiles = 300; w.defi = { n: 39, type: 'palier', niv: 600 }; G.parcours(w);
  check(egal(w.defi, { n: 39, type: 'palier', niv: 600 }), 'une boutique n°39 ouverte avant ce lot garde son défi (pas de défi de palier rétroactif)');
  const x = neuf(); x.boutiques = 33; x.etoiles = 1000; x.defi = { n: 29, type: 'etoiles', pct: 30, cible: 150 }; G.parcours(x);
  check(x.defi.cible === 150 && !x.defi.pas, 'un défi déjà plus doux que deux pas reste tel quel (assouplir, jamais durcir)');
  const y = neuf(); y.boutiques = 15; y.etoiles = 1000; y.defi = G.creerDefi(y, 15); const y0 = JSON.stringify(y.defi); G.parcours(y);
  check(JSON.stringify(y.defi) === y0 && !y.paliers.pas, 'avant la n°20, rien ne change');
  // la liste des paliers, le but après la n°30
  const s = neuf(); s.boutiques = 52; G.rattraperPaliers(s);
  const L = G.paliersListe(s);
  check(L.length === 5 && L.map((p) => p.etat).join() === 'passe,passe,prochain,avenir,avenir' && L.every((p) => p.titre && p.rare && p.finition && p.defiTxt) && L[0].recu && L[1].recu && !L[2].recu, 'paliersListe : les passés, le prochain, les deux suivants (titre, finition, rare, défi)');
  const b31 = neuf(); b31.boutiques = 31; const b = G.butParcours(b31);
  check(b.fini && b.palier.k === 1 && b.palier.n === 40 && b.palier.titre === 'Boulanger étoilé' && b.palier.rare.id === 'etoile-toque' && b.avant === 8, `butParcours après la n°30 : le prochain palier (n°${b.palier.n}, « ${b.palier.titre} »), dans ${b.avant} boutiques`);
  b31.boutiques = 39; check(G.butParcours(b31).avant === 0 && G.butParcours(b31).palier.k === 1, 'à la n°39 : le palier est la boutique suivante');
  b31.boutiques = 40; check(G.butParcours(b31).palier.k === 2 && G.butParcours(b31).palier.n === 50, 'à la n°40 : le prochain est la n°50');
}

titre('le second');
{
  const S = P.SECOND;
  check(S.boutique === 5 && S.partDefaut === 50 && S.partMin === 10 && S.partMax === 90 && S.intervalle === 2 && S.achatsMax === 3 && S.nivMax === 10 && S.reserve === 600, 'les réglages : n°5, 50 % (10 à 90), toutes les 2 s, 3 achats de 1 à 10 niveaux, réserve de 10 min');
  const st = neuf(); st.boutiques = 4;
  P.secondRegler(st, { actif: true });
  check(!P.secondDebloque(st) && !st.second.actif && !P.secondAnnonce(st), 'avant la n°5 : il ne s’allume pas, pas d’annonce');
  st.boutiques = 5; check(P.secondDebloque(st) && P.secondAnnonce(st) && (P.secondVu(st), !P.secondAnnonce(st)) && !st.second.actif, 'à la n°5 : débloqué, éteint par défaut, annoncé une fois');
  const parts = [95, 3, 47, 64, 'x', 90, 10].map((p) => P.secondRegler(st, { part: p }).part);
  check(parts.join() === '90,10,50,60,60,90,10' && parts.every((p) => p >= 10 && p <= 90 && p % 10 === 0), `la part bornée de 10 à 90 au pas de 10 (${parts.join(', ')})`);
  check(P.secondCoche(st, 3) && !P.secondCocher(st, 3, false) && !P.secondCoche(st, 3) && P.secondCocher(st, 3, true) && st.second.off.length === 0 && !P.secondCocher(st, 99, true), 'une recette cochée d’office, décochée, recochée');
  // une boutique où aucun achat clé ne reste (tout débloqué, embauché, tous les bonus) : il achète
  const b = neuf(); b.boutiques = 5; b.mode = 'max'; b.stations.forEach((s, i) => { if (i < 12) { s.niv = 30 + i; s.staff = true; s.actif = true; } }); for (const a of G.AMELIORATIONS) b.ameliorations[a.id] = true;
  G.objectifsDuJour(b, b.now); b.coins = 1e9; P.secondRegler(b, { actif: true, part: 50 });
  const avant = { coins: b.coins, niv: b.stations.map((s) => s.niv), objectifs: JSON.stringify(b.jour.objectifs), points: JSON.stringify(b.points), xp: b.xp };
  check(P.achatCle(b) === Infinity, 'achatCle : rien à débloquer, embaucher ni acheter');
  const A = P.secondAgir(b), depense = avant.coins - b.coins;
  check(A.length >= 1 && A.length <= 3 && A.every((a) => a.n >= 1 && a.n <= 10 && a.i < 12) && b.second.achats === A.length, `un passage : ${A.length} achats (${A.map((a) => `${G.PRODUITS[a.i].nom} +${a.n}`).join(', ')})`);
  check(depense > 0 && depense <= avant.coins * 0.5 && Math.abs(depense - A.reduce((x, a) => x + a.prix, 0)) < 1e-6, `le budget tenu : ${G.fmtEur(depense)} dépensés pour ${G.fmtEur(avant.coins * 0.5)} permis (50 % de la caisse)`);
  check(b.mode === 'max' && JSON.stringify(b.jour.objectifs) === avant.objectifs && JSON.stringify(b.points) === avant.points, 'le mode d’achat du joueur intact ; ni point de classement ni objectif du jour');
  check(b.stations.reduce((x, s) => x + s.niv, 0) === avant.niv.reduce((x, v) => x + v, 0) + A.reduce((x, a) => x + a.n, 0) && P.secondDernier(b).i === A[A.length - 1].i, 'les niveaux achetés, le dernier achat pour l’écran');
  { // une petite caisse : le budget compte, au centime
    const m = neuf(); m.boutiques = 5; m.stations.forEach((s, i) => { if (i < 12) { s.niv = 30 + i; s.staff = true; } }); for (const a of G.AMELIORATIONS) m.ameliorations[a.id] = true; P.secondRegler(m, { actif: true, part: 30 });
    m.coins = 4000; const A3 = P.secondAgir(m), dep = 4000 - m.coins;
    check(A3.length >= 1 && dep > 0 && dep <= 4000 * 0.3 && A3.some((a) => a.n < 10), `une petite caisse (4 000 €, part 30 %) : ${G.fmtEur(dep)} dépensés sur ${G.fmtEur(1200)} permis (${A3.map((a) => `${G.PRODUITS[a.i].nom} +${a.n}`).join(', ')})`);
  }
  const r = G.acheter(b, 12, { second: true }); check(!r.ok && b.stations[12].niv === 0, 'il ne débloque aucune recette');
  const r2 = G.acheter(b, 0, { n: 3, second: true }); check(r2.ok && r2.n === 3 && r2.points === 0 && b.mode === 'max', 'GAME.acheter(…, { n, second }) : n niveaux, 0 point, le mode intact');
  const c = neuf(); c.boutiques = 5; c.stations.forEach((s, i) => { if (i < 12) { s.niv = 30; s.staff = true; } }); for (const a of G.AMELIORATIONS) c.ameliorations[a.id] = true; c.coins = 1e12; P.secondRegler(c, { actif: true, part: 90 });
  const A2 = P.secondAgir(c); check(A2.length === 3 && A2.every((a) => a.n === 10), 'une caisse énorme : trois achats de dix niveaux, pas plus');
  // la réserve : un apprenti à embaucher, payable avec la caisse : il attend
  c.stations[1].staff = false; const coins = c.coins;
  check(P.secondAgir(c).length === 0 && c.second.attend && c.coins === coins, 'un achat clé payable (embaucher) : il attend et laisse la caisse (attend)');
  c.stations[1].staff = true; c.coins = 1e9; P.secondAgir(c); check(!c.second.attend, 'l’achat clé fait : il reprend');
  // le rythme : toutes les 2 s de jeu
  const d = neuf(); d.boutiques = 5; d.stations.forEach((s, i) => { if (i < 12) { s.niv = 30; s.staff = true; } }); for (const a of G.AMELIORATIONS) d.ameliorations[a.id] = true; d.coins = 1e9;
  check(P.secondPas(d, 5).length === 0, 'éteint : rien');
  P.secondRegler(d, { actif: true }); check(P.secondPas(d, 1).length === 0 && P.secondPas(d, 0.9).length === 0 && P.secondPas(d, 0.2).length > 0 && d.second.t === 0, 'allumé : un passage toutes les 2 s de jeu');
  // jamais pendant l'absence
  const e = neuf(); e.boutiques = 5; e.stations.forEach((s, i) => { if (i < 12) { s.niv = 30; s.staff = true; s.actif = true; } }); for (const a of G.AMELIORATIONS) e.ameliorations[a.id] = true; P.secondRegler(e, { actif: true });
  const nivs = e.stations.map((s) => s.niv).join(); e.lastSeen = e.now; G.absence(e, e.now + 6 * 3600e3);
  check(e.stations.map((s) => s.niv).join() === nivs && e.second.achats === 0 && e.coins > 0, 'six heures d’absence : la caisse se remplit, le second n’achète rien');
}

titre('les trophées qui rapportent');
{
  const ANCIENS = 'premiere,cent,dixmille,million,equipe,grande-equipe,livreur,traiteur,presse,etoile,bras,eclair,bricoleur,mystere,genereux,etoiles10,etoiles100,etoiles1000,boutique2,boutique5,boutique10,semaine,defi,piece,recette-boutique,carte,franchise,compagnon,mof,fidele,salon,decorateur,grade,brigade,ronron,saison1,saisons4';
  const ids = G.TROPHEES.map((t) => t.id);
  check(G.TROPHEES.length === 48 && new Set(ids).size === 48 && ids.slice(0, 37).join() === ANCIENS, '48 trophées ; les 37 anciens dans leur ordre, les 11 nouveaux à la fin');
  check(ids.slice(37).join() === 'medaille,medaille-or,batisseur,caresses,aube,nouvel-an,vendredi13,retour,petrin,bapteme,curieux' && G.TROPHEES.filter((t) => t.secret).length === 8 && G.TROPHEES.slice(0, 40).every((t) => !t.secret), '« Tous ensemble » (3) puis 8 secrets (secret: true)');
  const F = Object.values(G.FAMILLES);
  check(F.length === 13 && F.map((f) => f.ids.length).join() === '4,4,6,3,3,3,4,3,2,3,2,3,8' && egal(F.flatMap((f) => f.ids).sort(), ids.slice().sort()) && G.TROPHEES.every((t) => t.fam && G.FAMILLES[t.fam].ids.includes(t.id)), '13 familles qui couvrent les 48 (chaque trophée a sa famille, fam)');
  check(ids.every((id) => Array.isArray(G.DORES[id]) && typeof G.DORES[id][0] === 'string' && typeof G.DORES[id][1] === 'function') && Object.keys(G.DORES).length === 48, 'chaque trophée a sa version dorée');
  check(egal(G.TROPHEES_BONUS, { trophee: 0.1, dore: 0.1, famille: 0.3, familleDoree: 0.3 }) && Math.abs(G.bilanTrophees(neuf()).max - 17.4) < 1e-9, 'la décision du joueur : +0,1 % par trophée et par doré, +0,3 % par famille complète (au plus +17,4 %)');
  // dorés après le trophée
  const st = neuf(); st.stats.ventes = 2e5;
  const v1 = G.verifierTrophees(st);
  check(v1.map((t) => t.id + (t.dore ? '*' : '')).join() === 'premiere,cent,dixmille,premiere*' && st.dores.premiere === st.now && !st.dores.cent && st.xp === 10 + 20 + 40 + 10 && v1[3].desc === 'Vendre 100 000 fournées' && v1[3].t === G.TROPHEES[0], 'le doré vient après son trophée (« Première fournée » doré : 100 000 fournées), même savoir-faire');
  check(G.verifierTrophees(st).length === 0, 'chacun une seule fois');
  const s2 = neuf(); s2.dores = { premiere: T0, cent: 'x' }; s2.trophees = { cent: T0 }; G.parcours(s2);
  check(egal(s2.dores, {}), 'la réparation : un doré sans son trophée, une date abîmée, retirés');
  // le bonus : la formule, dans revenuBase
  const b = neuf(); b.stations[0].niv = 10; const r0 = G.revenuBase(b, 0);
  for (const id of ['saison1', 'saisons4', 'compagnon', 'mof']) b.trophees[id] = T0; b.dores = { compagnon: T0, mof: T0 }; b.now += 1;
  const bil = G.bilanTrophees(b);
  check(bil.trophees === 4 && bil.dores === 2 && bil.familles === 2 && bil.famillesDorees === 1 && Math.abs(bil.pct - 1.5) < 1e-9 && Math.abs(G.tropheesMult(b) - 1.015) < 1e-12, 'bilanTrophees : 4 trophées, 2 dorés, 2 familles, 1 famille dorée → +1,5 %');
  check(Math.abs(G.revenuBase(b, 0) / r0 - 1.015) < 1e-12, 'revenuBase : ×1,015');
  for (const t of G.TROPHEES) { b.trophees[t.id] = T0; b.dores[t.id] = T0; } b.now += 1;
  check(Math.abs(G.tropheesMult(b) - 1.174) < 1e-12 && Math.abs(G.revenuBase(b, 0) / r0 - 1.174) < 1e-12, 'tout gagné : ×1,174');
  // le cache : recalculé quand le nombre change (trophée gagné, sauvegarde relue)
  const c = neuf(); c.stations[0].niv = 10; check(G.tropheesMult(c) === 1, 'aucun trophée : ×1');
  c.stats.ventes = 1; G.verifierTrophees(c); check(Math.abs(G.tropheesMult(c) - 1.001) < 1e-12, 'un trophée gagné (même heure de jeu) : ×1,001 tout de suite');
  c.trophees = Object.assign({}, c.trophees, { cent: T0 }); check(Math.abs(G.tropheesMult(c) - 1.002) < 1e-12, 'une autre liste (une sauvegarde relue) : recomptée');
  c.trophees.dixmille = T0; c.now += 16; check(Math.abs(G.tropheesMult(c) - 1.003) < 1e-12, 'un trophée posé à la main : recompté au pas de jeu suivant');
  // la vérification lente du pas de jeu : les 37 anciens à chaque pas, les nouveaux et les dorés toutes les 10 s
  const l = neuf(); l.secrets.visites = 10; l.stats.ventes = 2e5;
  const L = { lent: true };
  check(G.verifierTrophees(l, L).map((t) => t.id + (t.dore ? '*' : '')).join() === 'premiere,cent,dixmille,curieux,premiere*', 'le premier pas : tout');
  l.secrets.visites = 100; l.stats.ventes = 4e5; l.now += 5e3;
  check(G.verifierTrophees(l, L).length === 0 && !l.dores.curieux, '5 s plus tard : seulement les anciens (rien de neuf)');
  l.now += 5e3; check(G.verifierTrophees(l, L).map((t) => t.id + (t.dore ? '*' : '')).join() === 'cent*,curieux*', '10 s : les dorés suivent');
}

titre('les trophées secrets et « Tous ensemble »');
{
  const st = neuf(); const ids = () => G.verifierTrophees(st).map((t) => t.id + (t.dore ? '*' : '')).filter((x) => !/^(premiere|boutique|etoiles)/.test(x)).join();
  G.noterOuverture(st, Date.UTC(2026, 10, 4, 4, 30), 0); G.noterOuverture(st, Date.UTC(2026, 10, 4, 4, 50), 0);
  check(st.secrets.aube === 1 && ids() === 'aube', 'ouvrir à 5 h 30 (Paris) : « Lève-tôt », compté une fois par matin');
  G.noterOuverture(st, Date.UTC(2027, 0, 1, 11), 0); G.noterOuverture(st, Date.UTC(2026, 10, 13, 11), 9 * 864e5);
  check(st.secrets.nouvelAn === 1 && st.secrets.vendredi13 === 1 && st.secrets.retours === 1 && ids() === 'nouvel-an,vendredi13,retour', 'un 1er janvier, un vendredi 13, un retour après 9 jours');
  G.adopterChat(st, ''); for (let k = 0; k < 50; k++) { st.now += 1000; G.caresser(st); }
  check(st.secrets.caressesMax === 50 && ids() === 'caresses', '50 caresses en moins d’une minute : « Câlin express »');
  G.renommer(st, 'Chez Lou'); check(ids() === '', 'la boutique nommée : il manque le chat'); G.renommerChat(st, 'Pompon');
  check(st.secrets.nomsBoutique === 1 && st.secrets.nomChat === 1 && ids() === 'bapteme', 'la boutique et le chat nommés : « Baptême »');
  G.renommer(st, 'Chez Lulu'); G.renommer(st, ''); check(st.secrets.nomsBoutique === 1, 'renommer la même boutique ne compte qu’une fois (le doré : dix boutiques)');
  // « Curieux » : dix boutiques DIFFÉRENTES (le même copain dix fois, ou sans pseudo, ne compte qu'une fois, ou pas du tout)
  for (let k = 0; k < 10; k++) G.noterVisite(st, k % 2 ? 'Mamie' : ' mamie '); G.noterVisite(st); G.noterVisite(st, '');
  check(st.secrets.visites === 1 && st.secrets.vus.length === 1 && ids() === '', `la boutique de Mamie visitée dix fois (et deux visites sans pseudo) : une boutique (${st.secrets.visites}), pas de « Curieux »`);
  for (let k = 1; k < 10; k++) G.noterVisite(st, `Copain${k}`); st.stats.petrissageRecord = 5.5;
  check(st.secrets.visites === 10 && ids() === 'eclair,petrin,curieux,eclair*', '10 boutiques différentes : « Curieux » ; un pétrissage en 5,5 s : « Pétrin de feu » (et « Rapide comme l’éclair », doré : moins de 7 s)');
  for (let k = 0; k < 120; k++) G.noterVisite(st, `Copain${k % 60}`);
  check(st.secrets.visites === 61 && !st.dores.curieux, `soixante copains, deux fois chacun : 61 boutiques, pas encore le doré`);
  for (let k = 60; k < 130; k++) G.noterVisite(st, `Copain${k}`);
  const vus = st.secrets.vus.slice(); G.secrets(st);
  check(st.secrets.visites === 100 && st.secrets.vus.length === 100 && egal(st.secrets.vus, vus) && st.secrets.vus.every((x) => /^[0-9a-z]{1,7}$/.test(x)) && G.verifierTrophees(st).some((t) => t.id === 'curieux' && t.dore), `cent boutiques différentes : le doré ; la liste gardée s’arrête à cent empreintes courtes (${JSON.stringify(st.secrets).length} octets pour les secrets)`);
  st.rivales = { medailles: { or: 0, argent: 0, bronze: 1 } }; check(ids() === 'medaille', 'une médaille de bronze au concours : « Sur le podium »');
  st.rivales.medailles.or = 1; st.projets = { aides: 1 }; check(ids() === 'medaille-or,batisseur', 'une médaille d’or : « Médaille d’or » ; un chantier aidé : « Bâtisseur »');
  check(G.TROPHEES.filter((t) => t.fam === 'secrets').every((t) => st.trophees[t.id]) && G.bilanTrophees(st).familles >= 2, 'les huit secrets et « Tous ensemble » : deux familles complètes');
}

titre('les rivales');
{
  const R1 = P.semaineRivales('2026-11-02', 400, 123), R2 = P.semaineRivales('2026-11-02', 400, 123), R3 = P.semaineRivales('2026-11-09', 400, 123);
  check(egal(R1, R2) && !egal(R1.map((r) => r.id), R3.map((r) => r.id)) && new Set(R1.map((r) => r.id)).size === 4 && R1.every((r) => P.RIVALES.some((x) => x.id === r.id && x.nom === r.nom)), `tirage déterministe : la même semaine, les mêmes rivales (${R1.map((r) => r.nom).join(', ')})`);
  check(R1.every((r, k) => Math.abs(r.cible / (400 * P.RIV.facteurs[k]) - 1) <= 0.0801) && R1.every((r) => r.jours.length === 7), `leurs scores : ref × 0,85 / 1 / 1,12 / 1,3 à ± 8 % (${R1.map((r) => r.cible).join(', ')} pour 400)`);
  const H = P.semaineRivales('2026-11-02', 5000, 123);
  check(H.map((r) => r.cible).join() === '692,791,870,930', `plafonnées sous le maximum de la semaine (989) : ${H.map((r) => r.cible).join(', ')}`);
  check(P.rangFinal(R1[3].cible, R1) === 1 && P.rangFinal(R1[3].cible - 1, R1) === 2 && P.rangFinal(0, R1) === 5 && P.rangFinal(R1[0].cible, R1) === 4, 'à égalité, le joueur passe devant');
  check(P.scoreRivale(R1[2], 0) === 0 && P.scoreRivale(R1[2], 1) === R1[2].cible && P.scoreRivale(R1[2], 0.5) > 0 && P.scoreRivale(R1[2], 0.5) < R1[2].cible && P.scoreRivale(R1[2], (8 / 24) / 7) === 0, 'pendant la semaine, elle monte jour par jour (rien avant 8 h le lundi)');
  check(P.refJoueur([]) === 100 && P.refJoueur([{ points: 30 }]) === 100 && P.refJoueur([{ points: 900 }, { points: 300 }, { points: 0 }, { points: 500 }, { points: 700 }]) === 500, 'ref : la moyenne des 3 dernières semaines jouées, 100 au moins');
  // une partie : semaine du 2 novembre, puis la suivante
  const lundi = Date.UTC(2026, 10, 2, 9), st = neuf(lundi);
  st.points.semaines = [{ semaine: '2026-10-12', points: 300 }, { semaine: '2026-10-19', points: 500 }];
  check(P.rivalesPas(st, lundi) === null && st.rivales.semaine === '2026-11-02' && st.rivales.ref === 400, 'la première ouverture de la semaine : ref figée (400), pas de résultat rétroactif');
  st.points.semaines.push({ semaine: '2026-10-26', points: 900 });
  check(P.rivalesPas(st, lundi + 864e5) === null && st.rivales.ref === 400, 'dans la semaine, la ref ne bouge pas');
  const liste = P.semaineRivales('2026-11-02', 400, st.created);
  st.points.semaines.push({ semaine: '2026-11-02', points: liste[3].cible }); // à égalité avec la plus forte
  const boosts = st.boosts.reserve.length, fin = P.rivalesPas(st, lundi + 7 * 864e5);
  check(fin && fin.semaine === '2026-11-02' && fin.rang === 1 && fin.classee && st.rivales.medailles.or === 1 && st.rivales.serie === 1 && st.rivales.aPayer.length === 1 && st.rivales.semaine === '2026-11-09', 'la semaine suivante : 1er (à égalité avec la plus forte), médaille d’or, à payer');
  const paye = P.payerRivales(st);
  check(paye.length === 1 && st.boosts.reserve.length === boosts + 1 && st.boosts.reserve[boosts].mult === 3 && st.boosts.reserve[boosts].secs === 3600 && P.payerRivales(st).length === 0 && st.boosts.reserve.length === boosts + 1, 'payé une fois : un boost ×3 d’une heure en réserve');
  check(P.rivalesPas(st, lundi + 7 * 864e5 + 3600e3) === null, 'déjà fait cette semaine : rien');
  // l'heure du jeu qui recule au-dessus du lundi (src/horloge.js, le jeu ramené à l'heure sûre), puis revient : la semaine payée une seule fois
  const rec = { or: st.rivales.medailles.or, aPayer: st.rivales.aPayer.length, hist: st.rivales.hist.length, serie: st.rivales.serie };
  const minuit = lundi + 7 * 864e5 - 10 * 3600e3; // (lundi 9 novembre, 0 h à Paris)
  const recul = P.rivalesPas(st, minuit - 2 * 60e3), semRecul = st.rivales.semaine, retour = P.rivalesPas(st, minuit + 12 * 3600e3);
  check(recul === null && semRecul === '2026-11-09' && retour === null && st.rivales.medailles.or === rec.or && st.rivales.aPayer.length === rec.aPayer && st.rivales.hist.length === rec.hist && st.rivales.serie === rec.serie,
    `l’heure qui recule au dimanche 23 h 58 puis revient au lundi : rien de rejoué (semaine ${semRecul}, ${st.rivales.medailles.or} or, ${st.rivales.aPayer.length} à payer)`);
  const zero = P.rivalesPas(st, lundi + 14 * 864e5);
  check(zero && zero.rang === 5 && !zero.classee && st.rivales.serie === 0 && st.rivales.aPayer.length === 0 && st.rivales.medailles.or === 1 && st.rivales.hist.length === 2, 'une semaine à 0 point : pas classée, rien de perdu (la série repart)');
  const T = P.tableauRivales(st, lundi + 14 * 864e5 + 3 * 864e5);
  check(T.length === 5 && T.filter((x) => x.moi).length === 1 && T.every((x, k) => k === 0 || T[k - 1].score >= x.score) && T.map((x) => x.rang).join() === '1,2,3,4,5', `le tableau de l’écran : 5 lignes classées (${T.map((x) => `${x.nom} ${x.score}`).join(' · ')})`);
  const ph = P.photoRivale(liste[1], 400), np = CLM.nettoyerPhoto(ph), vis = CLM.boutiqueDepuisPhoto(ph, { G, maintenant: T0 });
  const memeNom = (a) => String(a).replace(/[’']/g, '’') === liste[1].nom; // (le classement écrit l'apostrophe droite)
  check(np && memeNom(np.nom) && vis && vis.st.stations.some((s) => s.niv > 50) && memeNom(vis.nom) && JSON.stringify(ph).length < 2048, `photoRivale : une photo au format du classement, qu’on visite sans réseau (${vis && vis.nom}, ${JSON.stringify(ph).length} octets)`);
  check(P.photoRivale(liste[1], 900).p[0][0] > P.photoRivale(liste[1], 150).p[0][0], 'ses postes suivent le niveau du joueur');
}

titre('les projets de quartier : la règle du SQL, au point près (essai-sql/scenario.sql)');
{
  // les semaines : 0 = lundi 2 novembre … 4 = lundi 30 novembre ; figé = la somme de la semaine figée (fournil_objectif.total), vivant = celle en cours
  let L = [], fig = {}, vivant = 0, lundi = 0; const totalDe = (w) => (w >= lundi ? vivant : fig[w] || 0);
  const appel = (actifs) => { const r = P.avancerProjets(L, totalDe, lundi, actifs, 'fini'); L = r.lignes; return r; };
  vivant = 2000; let r = appel(20);
  check(r.en_cours.rang === 1 && r.en_cours.cout === 24000 && r.en_cours.total === 2000 && r.en_cours.pourcent === 8 && r.finis.length === 0, 'S1 : la fontaine ouvre à 1 200 × 20 actifs = 24 000 ; 20 joueurs × 100 points : 8 %');
  fig[0] = 2000; lundi = 1; vivant = 0; appel(20); vivant = 3000; r = appel(20);
  check(r.en_cours.total === 5000 && r.en_cours.pourcent === 20, 'S2 : la semaine 1 figée (2 000) + 20 × 150 = 5 000 (20 %)');
  fig[1] = 3000; lundi = 2; vivant = 6000; r = appel(20); const r2 = appel(20);
  check(r.en_cours.total === 11000 && r.en_cours.pourcent === 45 && egal(r, r2), 'S3 : 2 000 + 3 000 + 6 000 = 11 000 sur 24 000 (45 %) ; l’appel répété ne change rien');
  fig[2] = 6000; fig[3] = 0; lundi = 4; vivant = 0; r = appel(0); check(r.en_cours.total === 11000, 'S5 : la semaine vide comptée 0');
  vivant = 19780; r = appel(20);
  check(r.finis.length === 1 && r.finis[0].rang === 1 && r.finis[0].semaine === 4 && r.en_cours.rang === 2 && r.en_cours.cout === 25920 && r.en_cours.total === 6780 && r.en_cours.depuis === 4, 'S5 : 20 × 989 = 19 780 → la fontaine finie, le kiosque (1 296 × 20 = 25 920) part avec 6 780 de reste');
  vivant = 19780 + 60 * 989; r = appel(80);
  check(r.finis.length === 2 && r.en_cours.rang === 3 && r.en_cours.cout === 84000 && r.en_cours.total === 40200 && r.en_cours.pourcent === 47, 'S5 bis, 80 joueurs : le kiosque fini aussi ; le marché couvert plafonné à 60 actifs (1 400 × 60 = 84 000), 40 200 versés');
  check(L.map((x) => `${x.rang}:${x.cout}/${x.actifs}:${x.debut}:${x.deja}:${x.semaine_fin == null ? '-' : x.semaine_fin}`).join(' | ') === '1:24000/20:0:0:4 | 2:25920/20:4:13000:4 | 3:84000/80:4:38920:-', 'la table, ligne par ligne, celle de l’essai SQL (deja 13 000 puis 38 920)');
  let M = []; const tout = (w) => 1e6; const rr = P.avancerProjets(M, tout, 0, 5); check(rr.finis.length === 20 && rr.en_cours.rang === 21, 'au plus 20 chantiers finis par appel (la suite au prochain)');
  check([1, 2, 3, 4].map(P.baseProjet).join() === '1200,1296,1400,1512' && P.coutProjet(1, 2) === 6000 && P.coutProjet(1, 600) === 72000, 'le prix : 1 200 × 1,08^(rang − 1) × actifs bornés de 5 à 60');
  check(P.projetDe(1).id === 'fontaine' && P.projetDe(8).id === 'statue' && P.projetDe(9).nom === 'La fontaine (dorée)' && P.projetDe(17).nom === 'La fontaine (de marbre)' && P.projetDe(33).nom === 'La fontaine (de cristal II)' && P.projetDe(9).tour === 1, `huit chantiers, puis rénovés (${P.projetDe(9).nom}, ${P.projetDe(33).nom})`);
  // le téléphone : recevoir, annoncer une fois, « Bâtisseur »
  const st = neuf(Date.UTC(2026, 11, 2, 9)); st.points.semaines = [{ semaine: '2026-11-23', points: 50 }, { semaine: '2026-11-16', points: 10 }];
  const d = { version: 1, semaine: '2026-11-30', finis: [{ rang: 1, semaine: '2026-11-23' }, { rang: 2, semaine: '2026-11-16' }, { rang: 3, semaine: '2025-01-06' }] };
  const neufs = P.recevoirProjets(st, d);
  check(neufs.length === 3 && neufs.map((x) => x.id).join() === 'fontaine,kiosque,marche' && neufs[0].aide && !neufs[1].aide && !neufs[2].aide && st.projets.aides === 1, 'le premier appel : tout ce qui est fini, en une annonce ; « Bâtisseur » seulement pour une semaine connue avec 30 points');
  check(G.verifierTrophees(st).some((t) => t.id === 'batisseur'), 'le trophée « Bâtisseur »');
  check(P.recevoirProjets(st, d).length === 3 && st.projets.aides === 1 && P.voirProjets(st, [1, 2, 3]) === 3 && P.recevoirProjets(st, d).length === 0 && P.projetsNonVus(st).length === 0, 'annoncé jusqu’à ce que la feuille soit vue, puis plus jamais ; aidé une seule fois');
  const d2 = { finis: d.finis.concat([4, 5, 6].map((k) => ({ rang: k, semaine: '2026-11-30' }))) }; P.recevoirProjets(st, d2);
  check(P.decorProjets(st).map((x) => x.id).join() === 'marche,reverberes,jardin,horloge' && st.projets.aides === 1, 'le décor dehors : les 4 derniers chantiers finis');
  const avant30 = G.pointsSemaine(st); st.points.defi = 30; const a2 = P.recevoirProjets(st, d2); // (le défi de la semaine réussi : 30 points)
  check(avant30 < 30 && G.pointsSemaine(st) >= 30 && st.projets.aides === 4 && st.projets.finis.filter((x) => x.semaine === '2026-11-30').every((x) => x.aide), `la semaine en cours : « Bâtisseur » dès qu’on y a mis 30 points (${avant30} puis ${G.pointsSemaine(st)} points : ${st.projets.aides} chantiers aidés)`);
  check(P.recevoirProjets(st, null).length === 0 && P.recevoirProjets(st, { erreur: 404 }).length === 0, 'sans le patch SQL (pas de réponse) : rien, le décor garde ce qu’il a');
  void a2;
}

titre('la sauvegarde : champs neufs, réparation idempotente');
{
  const st = neuf();
  check(egal(st.paliers, { recus: [], titre: '', objets: [] }) && egal(st.dores, {}) && egal(st.secrets, {}) && !('second' in st), 'newState : paliers, dores, secrets ; PROGRESSION.etat crée le reste');
  P.etat(st); check(st.second.part === 50 && !st.second.actif && egal(st.rivales.medailles, { or: 0, argent: 0, bronze: 0 }) && egal(st.projets.finis, []), 'etat : le second éteint à 50 %, les rivales et les projets vides');
  const T = 1e12, abimes = [
    (s) => { for (const k of ['paliers', 'dores', 'secrets']) delete s[k]; },
    (s) => { s.second = 'x'; s.rivales = 3; s.projets = [1]; },
    (s) => { s.boutiques = 3; s.second = { part: 95, off: [1, 1, 'a', -2, 99, 4.5], actif: true, t: -4, achats: 'n' }; },
    (s) => { s.rivales = { medailles: null, hist: 'z', aPayer: [{ rang: 7, semaine: '2026-11-02' }, { rang: 2, semaine: 'x' }], ref: -5, semaine: 9, serie: 2 }; },
    (s) => { s.rivales = { hist: Array.from({ length: 30 }, (_, k) => ({ semaine: '2026-01-05', rang: 1 + (k % 5), points: k })), medailles: { or: 2.7, argent: -1, platine: 4 } }; },
    (s) => { s.projets = { finis: [{ rang: 'a' }, { rang: 3, semaine: 'y', aide: 1 }, { rang: 3 }, null], vus: [1, 1, 'x'], aides: -1, maj: 'q' }; },
    (s) => { s.boutiques = 47; s.etoiles = 800; s.paliers = { recus: [1, 1, '2', 3, -1], titre: 5, pas: -1, objets: [3, 'a', 'a'], decennie: { n: 'x' } }; },
    (s) => { s.trophees = { cent: T }; s.dores = { premiere: 'x', cent: 5, mof: T }; },
    (s) => { s.secrets = { aube: -3, caresses: 'q', visites: 1e9, jourAube: 42 }; },
    (s) => { s.paliers = null; s.dores = []; s.secrets = null; s.second = null; s.rivales = null; s.projets = null; },
  ];
  let ok = 0; const det = [];
  for (const [k, f] of abimes.entries()) {
    const s = neuf(); f(s); const avant = { etoiles: s.etoiles, boosts: s.boosts.reserve.length, coins: s.coins };
    const fresh = G.newState(T0); for (const x in fresh) if (!(x in s)) s[x] = fresh[x];
    G.parcours(s); P.etat(s); const a = JSON.stringify(s); G.parcours(s); P.etat(s); const b = JSON.stringify(s);
    const bon = a === b && s.etoiles === avant.etoiles && s.boosts.reserve.length === avant.boosts && s.coins === avant.coins && s.second.part >= 10 && s.second.part <= 90 && s.second.part % 10 === 0
      && s.second.off.every((i) => Number.isInteger(i) && i >= 0 && i < 16) && new Set(s.second.off).size === s.second.off.length && s.rivales.hist.length <= 12 && s.rivales.aPayer.every((x) => x.rang <= 3)
      && Object.values(s.rivales.medailles).every((v) => Number.isInteger(v) && v >= 0) && s.projets.finis.every((x) => Number.isInteger(x.rang)) && new Set(s.projets.finis.map((x) => x.rang)).size === s.projets.finis.length
      && s.paliers.recus.every((x) => Number.isInteger(x) && x >= 1) && typeof s.paliers.titre === 'string' && Object.keys(s.dores).every((id) => s.trophees[id] && Number.isFinite(s.dores[id]));
    if (bon) ok++; else det.push(k + 1);
  }
  check(ok === 10, `dix états abîmés : remis d’aplomb, et une deuxième fois ne change rien, sans rien donner ni payer${det.length ? ` (en défaut : ${det.join(', ')})` : ''}`);
  const s3 = neuf(); s3.boutiques = 3; s3.second = { actif: true }; P.etat(s3); check(!s3.second.actif, 'un second allumé avant la n°5 (sauvegarde abîmée) : éteint');
  const s7 = neuf(); s7.boutiques = 47; s7.paliers = { recus: [1, 3], titre: 'faux' }; G.parcours(s7); check(s7.paliers.titre === 'Seigneur du levain', 'le titre suit le plus haut palier reçu');
}

console.log(`\n${n - fails}/${n} vérifications.`);
console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
process.exit(fails ? 1 : 0);
