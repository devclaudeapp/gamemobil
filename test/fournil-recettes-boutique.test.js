#!/usr/bin/env node
// Le Fournil : les recettes de boutique et le parcours du boulanger (src/game.js), sans navigateur.
// 1. Les recettes : une par boutique de la n°2 à la n°9, gagnées pour toujours, verrouillées avant (déblocage, bonus, spécialité, objectifs) ;
//    une vieille sauvegarde déjà à la boutique n°5 a tout de suite ses quatre recettes ; la nouvelle boutique remet les niveaux à zéro
//    mais garde le droit aux recettes ; la courbe (chaque recette rapporte plus que la précédente, se rembourse vite, coûte plus).
// 2. Le parcours : les quartiers des boutiques n°10, 15, 20, 25, 30 (et ceux des boutiques ouvertes avant cette version, gardés) ; les
//    récompenses (une fois) ; le rattrapage d'une vieille sauvegarde ; les défis de passage (verrou, réussite, jamais rétroactifs).
// 3. Au-delà de la n°30 (lot « progression ») : les paliers donnés une fois, le rattrapage d'une sauvegarde n°47, pas de défi de palier rétroactif.
// Lancer : TZ=Europe/Paris node test/fournil-recettes-boutique.test.js
'use strict';
const G = require('../src/game.js');
let n = 0, fails = 0;
const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const titre = (t) => console.log(`── ${t} ──`);
const T = Date.UTC(2026, 9, 21, 8); // un mercredi
const P = G.PRODUITS, idx = (id) => P.findIndex((p) => p.id === id);
const ouvrirBoutique = (st) => { st.lifetimeRun = Math.max(st.lifetimeRun, 1e30); st.defi = null; return G.nouvelleBoutique(st, st.now); }; // le défi de passage n'est pas l'objet ici (voir plus bas)

titre('les huit recettes de boutique');
{
  const ids = ['parisbrest', 'kouign', 'myrtilles', 'opera', 'canele', 'sainthonore', 'fraisier', 'croquembouche'];
  check(P.length === 16 && G.RECETTES_BASE === 8 && P.slice(8).map((p) => p.id).join() === ids.join() && P.slice(8).every((p, k) => p.boutique === k + 2), 'seize recettes : les huit de toujours, puis une par boutique de la n°2 à la n°9');
  check(['paris', 'mer', 'montagne', 'ville'].every((q, k) => P[8 + k].quartier === q && G.QUARTIERS[G.quartierDe(k + 2)].id === q), 'les quatre premières viennent du quartier de leur boutique (Paris-Brest à Paris, Kouign-amann à la mer, myrtilles à la montagne, Opéra en ville)');
  check(P.slice(8).every((p) => p.nom && p.pl && p.desc && p.staffNom && p.cout > 0 && p.debloquer > 0 && p.rev > 0 && p.temps > 0 && p.croiss > 1 && p.staff > 0), 'chacune a son nom, son apprenti, ses prix et sa cuisson');
  check(G.APPRENTIS.length === 16 && G.APPRENTIS.slice(8).every((a) => a.prenom && a.talent && (a.rev || a.temps)), 'seize apprentis, chacun son talent de grade 3');
  check(ids.every((id) => G.AMELIORATIONS.some((a) => a.mult === 3 && a.cible && a.cible.length === 1 && a.cible[0] === id)), 'un bonus ×3 par recette de boutique');
  // la courbe : chaque recette rapporte plus que la précédente (la fournée et la seconde), coûte plus, et se rembourse vite au niveau 1
  let courbe = true; for (let i = 8; i < 16; i++) { const a = P[i - 1], b = P[i]; if (!(b.rev > a.rev * 1.3 && b.rev / b.temps > a.rev / a.temps && b.debloquer > a.debloquer && b.cout > a.cout && b.staff > b.debloquer && b.croiss <= a.croiss)) courbe = false; }
  check(courbe, `la courbe continue : chaque recette rapporte nettement plus que la précédente (fournée ×${(P[9].rev / P[8].rev).toFixed(2)}), à la seconde aussi, et coûte plus`);
  const cycles = (i) => G.coutNiveau(i, 1) / (P[i].rev * G.palierMult(2));
  check(P.slice(8).every((p, k) => cycles(8 + k) <= 30), `au niveau 1, un niveau se rembourse en 30 fournées au plus (pire : ${Math.max(...P.slice(8).map((p, k) => cycles(8 + k))).toFixed(0)})`);
  const bonus = ids.map((id) => G.AMELIORATIONS.find((a) => a.cible && a.cible[0] === id).cout / P[idx(id)].debloquer);
  check(bonus.every((r) => r >= 7.5 && r <= 50), `leurs bonus coûtent de 7,5 à 50 fois le déblocage, comme les autres (${[...new Set(bonus.map((r) => Math.round(r)))].join(', ')})`);
  check(G.AMELIORATIONS.every((a, k) => k === 0 || a.cout >= G.AMELIORATIONS[k - 1].cout), 'les bonus restent rangés par prix');
}

titre('gagnées une boutique après l’autre, pour toujours');
{
  const st = G.newState(T); st.now = T;
  check(G.recettesConnues(st) === 8 && !G.recetteGagnee(st, 8) && G.prochaineRecetteBoutique(st).p.id === 'parisbrest', 'une partie neuve : huit recettes, le Paris-Brest en vue');
  st.coins = 1e30; for (let i = 1; i < 8; i++) G.acheter(st, i);
  const r = G.acheter(st, 8); check(!r.ok && r.verrou && r.boutique === 2 && st.stations[8].niv === 0, 'le Paris-Brest ne se débloque pas à la boutique n°1');
  check(!G.amelioration(st, 'praline').ok && !st.ameliorations.praline, 'son bonus ne s’achète pas non plus');
  check(!G.choisirSpecialite(st, 8).ok, 'ni ne se choisit comme spécialité');
  const o = ouvrirBoutique(st);
  check(o.ok && o.recette && o.recette.id === 'parisbrest' && st.recettesBoutique.join() === 'parisbrest' && G.recettesConnues(st) === 9, `la boutique n°2 : le Paris-Brest gagné (« ${o.recompenses.map((x) => x.texte).join(' · ')} »)`);
  check(st.stations.every((s, i) => s.niv === (i === 0 ? 1 : 0)) && st.coins === 0, 'les niveaux repartent de zéro, comme avant');
  st.coins = 1e30; st.mode = 1; check(G.acheter(st, 8).ok && G.amelioration(st, 'praline').ok, 'il se débloque maintenant, son bonus s’achète');
  for (let b = 3; b <= 9; b++) ouvrirBoutique(st);
  check(st.boutiques === 9 && G.recettesConnues(st) === 16 && G.prochaineRecetteBoutique(st) === null && st.stations[8].niv === 0, 'la boutique n°9 : les seize recettes à la carte (à redébloquer, comme les autres)');
  const r10 = ouvrirBoutique(st); check(r10.ok && !r10.recette && r10.recompenses[0].r.type === 'quartier', 'la n°10 n’apporte pas de recette : un quartier');
  // st.recettesBoutique garde ce qui est gagné, même si boutiques venait à mentir
  const s2 = G.newState(T); s2.recettesBoutique = ['parisbrest', 'inconnue', 'kouign']; G.recettesBoutique(s2);
  check(G.recetteGagnee(s2, 8) && G.recetteGagnee(s2, 9) && !G.recetteGagnee(s2, 10) && s2.recettesBoutique.join() === 'parisbrest,kouign', 'une recette gardée dans la sauvegarde reste gagnée ; un id inconnu disparaît');
}

titre('une vieille sauvegarde, déjà à la boutique n°5');
{
  const v = G.newState(T); v.now = T; v.boutiques = 5; v.etoiles = 150; v.stations = v.stations.slice(0, 8); v.stations.forEach((s) => { s.niv = 100; s.staff = true; });
  for (const k of ['recettesBoutique', 'defi', 'parcours', 'quartierFixe']) delete v[k];
  // ce que fait le chargement (src/ui.js, lire) : les champs neufs, les postes complétés, puis parcours()
  const fresh = G.newState(T); for (const k in fresh) if (!(k in v)) v[k] = fresh[k]; while (v.stations.length < P.length) v.stations.push({ niv: 0, staff: false, prog: 0, actif: false });
  G.parcours(v);
  check(v.recettesBoutique.join() === 'parisbrest,kouign,myrtilles,opera' && G.recettesConnues(v) === 12, 'ses quatre recettes tout de suite');
  check(v.defi === null && G.passageOk(v), 'sa boutique en cours n’a pas de défi de passage');
  check(v.stations.length === 16 && v.stations.slice(0, 8).every((s) => s.niv === 100), 'rien de perdu : ses huit postes, et huit de plus à zéro');
  const rec = G.rattraperParcours(v);
  check(rec.length === 4 && rec.every((x) => x.r.type === 'recette') && v.etoiles === 150, 'le rattrapage : les quatre recettes (rien d’autre à donner avant la n°10)');
  check(G.rattraperParcours(v).length === 0, 'une seule fois');
}

titre('les quartiers du parcours');
{
  check(G.QUARTIERS.length === 10 && G.QUARTIERS.slice(5).map((q) => q.boutique).join() === '10,15,20,25,30', 'dix quartiers : les cinq de toujours, puis un aux boutiques n°10, 15, 20, 25 et 30');
  check(['gare', 'ile', 'chateau', 'cimes', 'capitale'].every((id, k) => G.QUARTIERS[G.quartierDe(10 + 5 * k)].id === id), 'la gare, l’île, le château, la station de ski, la capitale, chacun dans sa boutique');
  check(G.QUARTIERS.slice(5).every((q) => q.enseigne && q.theme && q.theme.mur && q.theme.sol && q.theme.accent && q.theme.vue && Array.isArray(q.theme.objets) && q.theme.objets.length), 'chacun porte son décor en données : murs, sol, accent, vue, petits objets');
  check([1, 2, 3, 4, 5, 6, 7, 8, 9].every((b) => G.quartierDe(b) === (b - 1) % 5), 'jusqu’à la n°9, le tour d’avant ((n − 1) % 5) : rien ne change pour qui y est');
  check([11, 12, 13, 14].every((b) => G.quartierDe(b) < 6) && G.quartierDe(31) < 10, 'ensuite, le tour passe par les quartiers déjà gagnés');
  // une boutique n°12 ouverte avant cette version garde son décor (l'ancien calcul) ; la suivante prend le nouveau
  const v = G.newState(T); v.now = T; v.boutiques = 12; delete v.quartierFixe; G.parcours(v);
  check(G.quartier(v) === 1 && G.nomBoutique(v) === 'Le Fournil de la Rue', 'une boutique n°12 d’avant garde son quartier (le coin de rue parisien)');
  ouvrirBoutique(v); check(G.quartier(v) === G.quartierDe(13), 'la n°13 prend le tour du parcours');
}

titre('les récompenses');
{
  const st = G.newState(T); st.now = T; st.etoiles = 10;
  const types = []; for (let b = 2; b <= 30; b++) types.push(G.recompenseBoutique(b).type);
  check(types.every(Boolean) && G.recompenseBoutique(1) === null && G.recompenseBoutique(31) === null, 'une récompense à chaque boutique, de la n°2 à la n°30');
  check(['tenue', 'gains', 'etoiles', 'boost', 'titre'].every((t) => types.filter((x) => x === t).length >= 3), `entre deux quartiers, tour à tour une tenue, des gains, des étoiles, un boost, un titre (${types.slice(9).join(' ')})`);
  const r0 = G.revenuBase(Object.assign(G.newState(T), { stations: G.newState(T).stations }), 0);
  for (let b = 2; b <= 30; b++) ouvrirBoutique(st);
  check(st.boutiques === 30 && st.parcours.recus.length === 29 && st.parcours.gains === 10 && st.parcours.titre === 'Légende du Fournil', 'à la n°30 : tout reçu, +10 % de gains à vie, le titre « Légende du Fournil »');
  check(['parcours-toque', 'parcours-tablier', 'parcours-chaussures', 'parcours-foulard'].every((id) => G.possede(st, id)) && st.boosts.reserve.length === 3, 'la tenue du parcours (quatre pièces) et trois boosts en réserve');
  const s1 = G.newState(T); s1.stations[0].niv = 10; const s2 = G.newState(T); s2.stations[0].niv = 10; s2.parcours = { recus: [], gains: 10, titre: '' };
  check(Math.abs(G.revenuBase(s2, 0) / G.revenuBase(s1, 0) - 1.1) < 1e-9 && r0 >= 0, 'les bonus de gains à vie : ×1,10 en tout');
  check(G.butParcours(st).n === 31 && G.butParcours(st).fini, 'après la n°30 : parcours terminé');
}

titre('les défis de passage');
{
  // depuis le lot « progression » : au-delà de la n°29, plus le défi « 30 % des étoiles » de la n°29 (le mur du contrat, § 1.1) mais un pas
  // d'étoiles ; les défis d'étoiles des n°20, 25 et 29 deviennent « 2 pas » ; la boutique 39, 49… pose un défi de palier (test/fournil-progression.test.js)
  check(G.defiDe(5) === null && G.defiDe(6) && G.defiDe(29).type === 'etoiles' && G.defiDe(29).pas === 2 && G.defiDe(40).type === 'etoiles' && G.defiDe(40).pas === 1 && G.defiDe(39).palier === 1, 'dès la boutique n°6 ; au-delà de la n°29, un pas d’étoiles (et un défi de palier pour ouvrir la n°40, 50…)');
  check(Object.values(G.DEFIS_PASSAGE).every((d) => d.type !== 'recette' || G.PRODUITS[d.i].boutique <= Object.keys(G.DEFIS_PASSAGE).find((b) => G.DEFIS_PASSAGE[b] === d)), 'un défi de recette ne demande qu’une recette déjà gagnée');
  const st = G.newState(T); st.now = T;
  for (let b = 2; b <= 5; b++) ouvrirBoutique(st);
  check(st.boutiques === 5 && st.defi === null, 'boutiques n°2 à 5 : pas de défi');
  ouvrirBoutique(st);
  const d = G.defiPassage(st);
  check(st.boutiques === 6 && d && d.d.type === 'palier' && !d.fait && /niveau 375/.test(d.txt), `la boutique n°6, à son ouverture : « ${d && d.txt} »`);
  st.lifetimeRun = 1e30; const r = G.nouvelleBoutique(st, T);
  check(!r.ok && r.defi && st.boutiques === 6, 'des étoiles à récolter, mais le défi pas fait : la boutique suivante reste fermée');
  check(G.butParcours(st).pret === false && G.butParcours(st).recompense.p.id === 'sainthonore', 'le but : le Saint-Honoré, pas encore prêt');
  st.stations[0].niv = 375; check(G.defiPassage(st).fait && G.passageOk(st) && G.butParcours(st).pret, 'une recette au niveau 375 : défi réussi');
  check(G.nouvelleBoutique(st, T).ok && st.boutiques === 7 && st.defi.type === 'meubles', 'la boutique n°7 s’ouvre, avec son propre défi');
  // les compteurs partent de l'ouverture : les commandes livrées avant ne comptent pas
  for (const m of G.MOBILIER) st.mobilier[m.id] = m.max; st.stats.commandes = 40; ouvrirBoutique(st);
  check(st.defi.type === 'evenements' && st.defi.base === 40 && G.defiPassage(st).progres === 0, 'la n°8 : « Réussis 12 événements » compte depuis l’ouverture');
  st.stats.commandes = 45; st.stats.pourboires = 7; check(G.defiPassage(st).fait, 'cinq commandes et sept pourboires de plus : fait');
  // le défi des étoiles : sa cible posée à l'ouverture
  const e = G.newState(T); e.now = T; e.boutiques = 9; e.etoiles = 1000; e.defi = null; e.lifetimeRun = 1e30; G.nouvelleBoutique(e, T);
  check(e.boutiques === 10 && e.defi.type === 'etoiles' && e.defi.cible === Math.ceil(e.etoiles * 0.25), `la n°10 : récolter +${e.defi.cible} étoiles d’un coup (25 % de celles qu’on a en ouvrant)`);
  const liste = G.parcoursListe(e);
  check(liste.length === 30 && liste[9].etat === 'actuelle' && liste[5].defiTxt && liste.filter((x) => x.etat === 'passee').length === 9, 'la liste du parcours : trente boutiques, passées, actuelle, à venir, leur défi');
  check(liste[9].defi === e.defi && liste[9].defiTxt === G.texteDefi(e.defi, e.defi.cible), `la boutique en cours : le défi réellement posé, avec sa cible (« ${liste[9].defiTxt} »)`);
  // une boutique ouverte avant le parcours (n°8, sans st.defi) : la liste n'annonce aucun défi pour ouvrir la n°9, puisque rien n'est exigé
  const v = G.newState(T); v.now = T; v.boutiques = 8; v.defi = null;
  const l8 = G.parcoursListe(v)[7];
  check(l8.etat === 'actuelle' && l8.defi === null && l8.defiTxt === '' && G.passageOk(v) && G.parcoursListe(v)[8].defiTxt, `la n°8 sans défi posé : aucun défi annoncé pour ouvrir la n°9 (« ${l8.defiTxt} »), la n°9 garde le sien`);
}

titre('au-delà de la n°30 : les paliers (lot « progression »)');
{
  // une partie qui va jusqu'à la n°50 : chaque palier donné une fois, à son ouverture
  const st = G.newState(T); st.now = T; st.etoiles = 100;
  for (let b = 2; b <= 39; b++) ouvrirBoutique(st);
  check(st.boutiques === 39 && st.paliers.recus.length === 0 && st.defi.palier === 1 && G.titreBoulanger(st) === 'Légende du Fournil', 'à la n°39 : aucun palier encore, le défi du palier 1 posé, le titre du parcours');
  const reserve = st.boosts.reserve.length, r40 = ouvrirBoutique(st);
  check(r40.ok && r40.paliers.length === 1 && r40.paliers[0].titre === 'Boulanger étoilé' && st.boosts.reserve.length === reserve + 1 && G.titreBoulanger(st) === 'Boulanger étoilé', 'la n°40 : le palier 1 (« Boulanger étoilé », un boost ×5 d’une heure)');
  let autres = 0; for (let b = 41; b <= 49; b++) autres += ouvrirBoutique(st).paliers.length;
  const r50 = ouvrirBoutique(st);
  check(autres === 0 && r50.paliers.length === 1 && r50.paliers[0].k === 2 && st.paliers.recus.join() === '1,2' && st.boosts.reserve.length === reserve + 2 && G.titreBoulanger(st) === 'Légende de la farine', 'rien de la n°41 à la n°49 ; la n°50 : le palier 2 (« Légende de la farine ») ; chacun une seule fois');
  check(G.rattraperPaliers(st).length === 0 && G.rattraperParcours(st).length === 0, 'rien à rattraper');
  // une sauvegarde déjà à la n°47 avant ce lot : le palier 1 rattrapé une fois ; son défi en cours n'est pas remplacé (assoupli seulement)
  const v = G.newState(T); v.now = T; v.boutiques = 47; v.etoiles = 2000; v.parcours = { recus: Array.from({ length: 29 }, (_, k) => k + 2), gains: 10, titre: 'Légende du Fournil' };
  v.defi = { n: 47, type: 'etoiles', pct: 30, cible: 600 }; delete v.paliers; delete v.dores; delete v.secrets;
  const fresh = G.newState(T); for (const k in fresh) if (!(k in v)) v[k] = fresh[k]; G.parcours(v);
  const bo = v.boosts.reserve.length, rec = G.rattraperPaliers(v);
  check(rec.length === 1 && rec[0].k === 1 && v.boosts.reserve.length === bo + 1 && G.titreBoulanger(v) === 'Boulanger étoilé' && G.rattraperPaliers(v).length === 0 && v.boosts.reserve.length === bo + 1, 'une sauvegarde à la n°47 : le palier 1 rattrapé, une seule fois');
  check(v.defi.n === 47 && v.defi.type === 'etoiles' && v.defi.cible === 2 * v.paliers.pas && v.paliers.pas === 200, 'son défi en cours : le même, assoupli à deux pas (400 au lieu de 600)');
  const w = G.newState(T); w.now = T; w.boutiques = 39; w.defi = { n: 39, type: 'palier', niv: 550 }; G.parcours(w);
  check(w.defi.type === 'palier' && w.defi.niv === 550 && !w.defi.palier, 'une boutique n°39 d’avant ce lot : pas de défi de palier rétroactif');
  // une sauvegarde à la n°35 d'avant ce lot (sans décennie), menée jusqu'à la n°39 : le défi du palier 1 (12 commandes) se compte depuis son
  // chargement, sur les boutiques 35 à 39 (pas dans la seule n°39), et le dit ; rien de rétroactif (les commandes d'avant ne comptent pas)
  const x = G.newState(T); x.now = T; x.boutiques = 35; x.etoiles = 20000; x.stats.commandes = 50; x.parcours = { recus: Array.from({ length: 29 }, (_, k) => k + 2), gains: 10, titre: 'Légende du Fournil' };
  x.defi = { n: 35, type: 'etoiles', pct: 30, cible: 6000 }; delete x.paliers; delete x.dores; delete x.secrets;
  const fx = G.newState(T); for (const k in fx) if (!(k in x)) x[k] = fx[k]; G.parcours(x);
  const dec0 = JSON.stringify(x.paliers.decennie); G.parcours(x);
  check(x.paliers.decennie && x.paliers.decennie.n === 30 && x.paliers.decennie.des === 35 && x.paliers.decennie.stats.commandes === 50 && JSON.stringify(x.paliers.decennie) === dec0, `au chargement : la décennie compte dès maintenant (${dec0}), une seule fois`);
  for (let b = 36; b <= 38; b++) { ouvrirBoutique(x); x.stats.commandes += 3; } // neuf commandes livrées dans les boutiques 36 à 38
  ouvrirBoutique(x); const dx = G.defiPassage(x);
  check(x.boutiques === 39 && x.defi.type === 'stat' && x.defi.cle === 'commandes' && x.defi.base === 50 && x.defi.depuis === 35 && dx.progres === 9 && !dx.fait && /^12 commandes spéciales livrées depuis la boutique n°35/.test(dx.txt) && !/dans cette boutique/.test(dx.txt), `la n°39 : « ${dx.txt.split(' —')[0]} » (9/12 : les commandes des boutiques 36 à 38 comptent)`);
  x.stats.commandes += 3; check(G.defiPassage(x).fait && !G.defiPassage(x).soupape, 'trois de plus dans la n°39 : fait');
  ouvrirBoutique(x); check(x.boutiques === 40 && x.paliers.decennie.n === 40 && !('des' in x.paliers.decennie), 'la n°40 ouvre une décennie ordinaire');
  const y = G.newState(T); y.now = T; y.boutiques = 47; y.paliers = { recus: [1], titre: '', objets: [], decennie: { n: 40, des: 52, stats: {} } }; G.parcours(y);
  check(y.paliers.decennie && y.paliers.decennie.n === 40 && !('des' in y.paliers.decennie), 'une décennie abîmée (des hors de sa dizaine) : remise d’aplomb');
}

console.log(`\n${n - fails}/${n} vérifications.`);
console.log(fails ? `${fails} échec(s)` : 'Tout passe.');
process.exit(fails ? 1 : 0);
