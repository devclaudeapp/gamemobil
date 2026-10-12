#!/usr/bin/env node
// L'horloge de confiance du Fournil (src/horloge.js), la partie pure : avancer l'heure du téléphone ne rapporte rien.
// Un monde simulé : le vrai temps, un compteur monotone (performance.now, qui peut s'arrêter quand le téléphone dort), un téléphone qu'on dérègle,
// et les règles du jeu (src/game.js) pour vérifier les gains d'absence, les journées, la série, les habitués, la semaine et le marché.
'use strict';
const H = require('../src/horloge.js');
const G = require('../src/game.js');
let echecs = 0, n = 0;
const check = (ok, m) => { n++; if (!ok) { echecs++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); };
const HEURE = 3600e3, JOUR = 24 * HEURE, MAX = G.ABSENCE_MAX_H * HEURE;
const proche = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1000 : tol);

// le monde : vrai temps, compteur monotone, décalage du téléphone
function monde(debut) {
  const w = { vrai: debut, perf: 1000, decal: 0 };
  w.passer = (ms, dort) => { w.vrai += ms; if (!dort) w.perf += ms; }; // dort : le compteur monotone s'arrête (téléphone en veille)
  w.tel = () => w.vrai + w.decal;
  w.horloge = (avance) => H.creer({ tel: w.tel, perf: () => w.perf, avanceMax: () => (avance == null ? MAX : avance) });
  return w;
}
// une boutique qui tourne seule : deux produits avec apprentis
function boutique(nowMs) {
  const st = G.newState(nowMs);
  st.coins = 1e7;
  for (let i = 0; i < 3; i++) { if (st.stations[i].niv === 0) G.acheter(st, i); G.embaucher(st, i); st.stations[i].actif = true; }
  st.coins = 0;
  return st;
}
// une session de jeu : le lancement tel que l'écrit src/ui.js (plancher de la sauvegarde, heure sûre si le réseau répond, puis l'absence)
function lancer(w, st, sauvegarde, enLigne) {
  const h = w.horloge(G.heuresAbsence(st) * HEURE);
  h.charger(sauvegarde); h.pousser(st.lastSeen);
  if (enLigne) h.noterHeureSure(w.vrai, w.perf, 'page');
  h.demarrer();
  const abs = G.absence(st, h.maintenant());
  G.objectifsDuJour(st, h.maintenant());
  return { h, abs };
}
const fermer = (h, st) => { st.lastSeen = h.maintenant(); return h.etat(); }; // save() de src/ui.js

console.log('── les mesures ──');
check(H.lireEnTeteDate('Fri, 09 Oct 2026 21:52:46 GMT') === Date.UTC(2026, 9, 9, 21, 52, 46), 'l’en-tête Date se lit');
check(Number.isNaN(H.lireEnTeteDate('')) && Number.isNaN(H.lireEnTeteDate('n’importe quoi')) && Number.isNaN(H.lireEnTeteDate(null)), 'un en-tête absent ou illisible ne donne rien');
check(H.estimer(1e12, 1000, 200, 1e12 + 500) === 1e12 + 500, 'un téléphone à l’heure (dans la fourchette du serveur) donne l’heure exacte');
check(H.estimer(1e12, 1000, 200, 1e12 + 8 * HEURE) === 1e12 + 600, 'un téléphone en avance ne compte pas : le milieu de la fourchette (une seconde + l’aller-retour)');
check(H.estimer(1e12, 1000, 200, 1e12 - JOUR) === 1e12 + 600, 'un téléphone en retard non plus');
check(H.estimer(1e12, 0, 300, NaN) === 1e12 + 150 && Number.isNaN(H.estimer(NaN, 0, 0, 1)), 'sans heure du téléphone : le milieu de la fourchette ; sans heure du serveur : rien');

console.log('── en ligne : l’heure du téléphone ne compte pas ──');
{
  const debut = new Date(2026, 9, 9, 10, 0).getTime(), w = monde(debut);
  const h = w.horloge(); w.decal = 3 * JOUR;
  h.noterHeureSure(w.vrai, w.perf, 'page'); h.demarrer();
  check(proche(h.maintenant(), w.vrai), 'téléphone avancé de 3 jours, heure sûre lue : le jeu est à la vraie heure');
  w.passer(10 * 60e3); w.decal = 8 * HEURE;
  check(proche(h.maintenant(), w.vrai), 'en cours de partie, le téléphone avancé de 8 h : rien ne bouge, le temps passe au rythme du compteur monotone');
  w.decal = -2 * JOUR; w.passer(5000);
  check(proche(h.maintenant(), w.vrai), 'téléphone reculé de 2 jours : le jeu suit toujours le vrai temps');
  h.noterHeureSure(w.vrai, w.perf, 'page');
  check(proche(h.maintenant(), w.vrai) && h.info().source === 'page', 'une nouvelle lecture ne change rien quand tout est juste');
}

console.log('── le temps du jeu ne recule jamais ──');
{
  const debut = new Date(2026, 9, 9, 10, 0).getTime(), w = monde(debut);
  const h = w.horloge(); h.pousser(debut + 5 * HEURE); // une sauvegarde faite avec un téléphone en avance (avant cette version)
  h.noterHeureSure(w.vrai, w.perf, 'page'); h.demarrer();
  const a = h.maintenant();
  check(a === debut + 5 * HEURE, 'le plancher de la sauvegarde l’emporte sur une heure sûre plus ancienne');
  w.passer(60e3);
  check(proche(h.maintenant(), a + 60e3, 2), 'puis le jeu avance au vrai rythme (pas d’arrêt : les événements finissent à l’heure)');
  h.noterHeureSure(w.vrai, w.perf, 'page');
  check(h.maintenant() >= a + 60e3, 'une heure sûre plus tôt ne le fait pas reculer');
  let mono = true, prec = h.maintenant(); for (let k = 0; k < 200; k++) { w.passer(k % 7 === 0 ? 0 : 37); w.decal = (k % 3 - 1) * JOUR; if (k % 50 === 0) h.recaler(false); const t = h.maintenant(); if (t < prec) mono = false; prec = t; }
  check(mono, '200 lectures, téléphone qui saute dans tous les sens, recalages : jamais un pas en arrière');
}

console.log('── hors ligne : au plus une absence normale, une seule fois ──');
{
  const debut = new Date(2026, 9, 9, 9, 0).getTime(), w = monde(debut);
  let st = boutique(debut);
  let s1 = lancer(w, st, null, true); w.passer(30 * 60e3); let sauve = fermer(s1.h, st);
  check(proche(sauve.sure, w.vrai) && proche(sauve.jeu, w.vrai), 'la sauvegarde garde l’heure sûre et le dernier « maintenant »');
  // hors ligne, le téléphone avancé de 3 jours, une minute plus tard
  w.passer(60e3); w.decal = 3 * JOUR;
  const s2 = lancer(w, st, sauve, false);
  check(s2.abs.secs <= G.heuresAbsence(st) * 3600 + 1 && s2.abs.secs > 7 * 3600, `hors ligne, téléphone +3 jours : une absence de ${(s2.abs.secs / 3600).toFixed(1)} h au plus (comme une vraie nuit), pas 3 jours`);
  check(s2.h.maintenant() <= sauve.sure + 60e3 + MAX + 1000, 'le jeu ne dépasse pas la dernière heure sûre + une absence');
  sauve = fermer(s2.h, st);
  // on relance encore, toujours hors ligne et en avance : plus rien
  w.passer(60e3);
  const s3 = lancer(w, st, sauve, false);
  check(s3.abs.total === 0 || s3.abs.secs < 200, `deuxième lancement hors ligne, toujours +3 jours : rien de plus (${Math.round(s3.abs.secs)} s)`);
  sauve = fermer(s3.h, st);
  // de retour en ligne, l'heure remise : le jeu ne recule pas, et ne rend rien
  w.passer(60e3); w.decal = 0;
  const avant = st.lastSeen, lifetime = st.lifetime;
  const s4 = lancer(w, st, sauve, true);
  check(s4.h.maintenant() >= avant && s4.abs.secs < 1, 'en ligne, heure remise : le jeu reste où il était (il ne recule pas), aucune absence');
  check(st.lifetime === lifetime, 'aucun gain de plus');
  sauve = fermer(s4.h, st);
  // le vrai temps rattrape : une vraie absence de 10 h ne rapporte que ce qui dépasse l'avance prise
  w.passer(10 * HEURE);
  const avance = sauve.jeu - sauve.sure;
  const s5 = lancer(w, st, sauve, true);
  check(proche(s5.abs.secs * 1000, Math.min(G.heuresAbsence(st) * HEURE, 10 * HEURE - avance), 5000), `ensuite, 10 h de vraie absence ne rapportent que ${(s5.abs.secs / 3600).toFixed(1)} h : l’avance prise (${(avance / HEURE).toFixed(1)} h) est rendue`);
}

console.log('── hors ligne, honnête ──');
{
  const debut = new Date(2026, 9, 9, 9, 0).getTime(), w = monde(debut);
  const st = boutique(debut);
  const s1 = lancer(w, st, null, true); w.passer(5 * 60e3); const sauve = fermer(s1.h, st);
  w.passer(3 * HEURE);
  const s2 = lancer(w, st, sauve, false);
  check(proche(s2.abs.secs * 1000, 3 * HEURE, 2000), 'une vraie absence de 3 h hors ligne rapporte bien 3 h');
  check(proche(s2.h.maintenant(), w.vrai), 'et le jeu est à la vraie heure');
  // l'heure sûre accumule le temps de jeu mesuré : une longue session hors ligne repousse la limite
  w.passer(6 * HEURE); const e = s2.h.etat();
  check(proche(e.sure, w.vrai - 3 * HEURE), 'hors ligne, l’heure sûre avance du temps de jeu mesuré (pas du temps du téléphone)');
}
{
  const debut = new Date(2026, 9, 9, 9, 0).getTime(), w = monde(debut);
  const h = w.horloge(); h.noterHeureSure(w.vrai, w.perf, 'page'); h.demarrer();
  w.passer(5 * HEURE, true); // le téléphone dort 5 h : le compteur monotone s'arrête
  check(proche(h.maintenant(), debut, 10), 'pendant la veille, le compteur monotone s’arrête');
  h.recaler(false); // au retour, sans réseau : le téléphone, borné
  check(proche(h.maintenant(), w.vrai), 'au retour hors ligne, l’heure du téléphone (5 h plus tard) est reprise : l’absence est payée');
  w.passer(20 * HEURE, true); w.decal = 0; h.recaler(false);
  check(proche(h.maintenant(), debut + MAX), 'mais jamais plus d’une absence après la dernière heure sûre (le compteur arrêté ne l’a pas avancée)');
}
{
  const w = monde(new Date(2026, 9, 9, 9, 0).getTime()); w.decal = 2 * JOUR;
  const h = w.horloge(); h.demarrer();
  check(proche(h.maintenant(), w.tel()), 'sans aucune heure sûre, jamais (artefact Claude) : on ne peut que croire le téléphone');
}

console.log('── l’heure sûre arrive en cours de partie ──');
{
  const debut = new Date(2026, 9, 9, 9, 0).getTime(), w = monde(debut);
  const h = w.horloge(); h.charger({ sure: debut - 60e3, jeu: debut - 60e3 }); w.decal = 6 * HEURE;
  h.demarrer(); // lancé hors ligne, téléphone en avance de 6 h : il est cru (une absence)
  check(proche(h.maintenant(), debut + 6 * HEURE), 'lancé sans heure sûre, téléphone +6 h : cru jusqu’à une absence');
  w.passer(30e3); const avant = h.maintenant();
  const r = h.noterHeureSure(w.vrai, w.perf, 'page');
  check(r && r.saut === 0 && h.maintenant() >= avant, 'l’heure sûre arrive : pas de retour en arrière (ni de journée rejouée)');
  w.passer(30e3);
  check(proche(h.maintenant(), avant + 30e3, 5), 'le jeu continue au vrai rythme');
}
{
  const debut = new Date(2026, 9, 9, 9, 0).getTime(), w = monde(debut);
  const h = w.horloge(); h.charger({ sure: debut - 10 * HEURE, jeu: debut - 10 * HEURE }); w.decal = -10 * HEURE + 60e3;
  h.demarrer(); // un téléphone en retard, sans réseau
  const avant = h.maintenant();
  const r = h.noterHeureSure(w.vrai, w.perf, 'page');
  check(r && proche(r.saut, 10 * HEURE - 60e3) && proche(h.maintenant(), w.vrai), 'téléphone en retard : l’heure sûre recale le jeu vers l’avant (' + Math.round(r.saut / HEURE) + ' h), sans absence à payer');
  check(avant < h.maintenant(), 'vers l’avant seulement');
}
{
  const w = monde(new Date(2026, 9, 9, 9, 0).getTime()); w.decal = 3 * JOUR;
  const h = w.horloge(); h.charger({ sure: w.vrai, jeu: w.vrai });
  const p = h.maintenant();
  h.noterHeureSure(w.vrai, w.perf, 'page'); h.demarrer();
  check(proche(p, w.vrai + MAX) && proche(h.maintenant(), w.vrai), 'avant le démarrage, une valeur provisoire qui ne fige rien : l’heure sûre arrivée ensuite l’emporte');
}
{
  const w = monde(new Date(2026, 9, 9, 9, 0).getTime());
  const h = w.horloge(); h.charger({ sure: w.vrai + 5 * JOUR, jeu: 0 });
  h.noterHeureSure(w.vrai, w.perf, 'supabase'); h.demarrer();
  check(proche(h.etat().sure, w.vrai) && h.info().source === 'supabase', 'une heure sûre lue fait foi, même plus tôt que celle d’une vieille sauvegarde');
  const h2 = w.horloge(); h2.charger({ sure: 'demain', jeu: NaN }); h2.charger(null); h2.charger('x'); h2.demarrer();
  check(proche(h2.maintenant(), w.vrai), 'une sauvegarde abîmée est ignorée');
}

console.log('── journées, série, habitués, semaine, marché : sur le temps du jeu ──');
{
  // vendredi 9 octobre 2026, 18 h : on finit les trois objectifs du jour, on sert Léna (habituée du soir)
  const debut = new Date(2026, 9, 9, 18, 0).getTime(), w = monde(debut);
  const st = boutique(debut);
  const s1 = lancer(w, st, null, true);
  G.tick(st, 0.1, s1.h.maintenant(), () => 0.99);
  st.jour.objectifs.forEach((o) => { o.fait = true; }); st.jour.objectifs.forEach((o, k) => G.reclamer(st, k));
  st.habitues = { lena: { jours: 4, dernier: G.dayKey(debut), vuLe: G.dayKey(debut) } };
  const etoiles = st.etoiles, serie = st.serie, jour = st.jour.date, semaine = st.semaine.key;
  check(st.jour.etoileDonnee && serie === 1, 'la journée est réussie : une étoile, série de 1');
  let sauve = fermer(s1.h, st);
  for (const [decal, nom] of [[8 * HEURE, 'avancé de 8 h'], [JOUR, 'avancé d’un jour'], [3 * JOUR, 'avancé de 3 jours'], [0, 'remis à l’heure']]) {
    w.passer(2 * 60e3); w.decal = decal;
    const s = lancer(w, st, sauve, true);
    for (let k = 0; k < 50; k++) { G.tick(st, 0.25, s.h.maintenant(), () => 0); w.passer(250); }
    const hb = G.habitueAttendu(st, s.h.maintenant()), r = G.servirHabitue(st, 'lena');
    st.jour.objectifs.forEach((o, k) => G.reclamer(st, k));
    check(st.jour.date === jour && st.semaine.key === semaine && st.etoiles === etoiles && st.serie === serie && !hb && !r.ok && st.habitues.lena.jours === 4 && G.jourDeMarche(st.now) === false && s.abs.secs < 300,
      `téléphone ${nom} (en ligne) : même journée, même semaine, pas d’étoile ni de jour de série, pas de cadeau d’habitué, pas de marché du samedi, pas d’absence`);
    sauve = fermer(s.h, st);
  }
  // une vraie journée passe (serveur et téléphone d'accord) : demain est bien demain
  w.passer(JOUR); w.decal = 0;
  const s = lancer(w, st, sauve, true);
  check(st.jour.date === G.dayKey(w.vrai) && st.jour.date !== jour && G.jourDeMarche(s.h.maintenant()) && proche(s.abs.secs * 1000, G.heuresAbsence(st) * HEURE, 1000),
    'une vraie journée plus tard : nouveaux objectifs, samedi de marché, une absence pleine');
}

console.log(`\n${n - echecs}/${n} vérifications.`);
console.log(echecs ? `${echecs} échec(s)` : 'Tout passe.');
process.exit(echecs ? 1 : 0);
