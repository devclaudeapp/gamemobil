#!/usr/bin/env node
// Dernier Rempart : les règles pures, dans Node (src-zombies/donnees.js, monde.js, jeu.js, et la navigation d'Opération Poncin réutilisée).
// La forme des données ; le monde (collisions, lignes de vue, balles qui passent au-dessus des obstacles bas) ; les chemins A* autour des murets ;
// la partie : même graine → même partie, les vagues qui s'enchaînent, le tir automatique, la ferraille, l'atelier (prix, nombre permis,
// verrous), les caisses d'armes et les munitions, la mine, le zombie coincé qui ressort ailleurs, la fin ; un joueur automatique tient
// plusieurs vagues sur chaque arène, sans qu'une vague reste bloquée ; et le temps de calcul (un téléphone doit suivre).
// node test/zombies.test.js
'use strict';
const path = require('path');
const D = require(path.join(__dirname, '..', 'src-zombies', 'donnees.js'));
const M = require(path.join(__dirname, '..', 'src-zombies', 'monde.js'));
const J = require(path.join(__dirname, '..', 'src-zombies', 'jeu.js'));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const PAS = 1 / 60;
const avancer = (jeu, n, e) => { const evs = []; for (let i = 0; i < n && !jeu.fini; i++) for (const x of J.pas(jeu, e ? { moi: typeof e === 'function' ? e(jeu) : e } : null, PAS)) evs.push(x); return evs; };

// ─── les données ───
{
  const nombre = (v) => typeof v === 'number' && (Number.isFinite(v) || v === Infinity);
  check(Object.values(D.ARMES).every((a) => a.nom && a.degats > 0 && a.cadence > 0 && a.portee > 0 && a.balles >= 1 && nombre(a.munitions) && a.munitions > 0 && ['pistolet', 'mitraillette', 'pompe', 'fusil', 'sniper'].includes(a.classe)), 'chaque arme a ses dégâts, sa cadence, sa portée, ses munitions et un son connu de PSONS');
  check(D.ARMES[D.ARME_DE_BASE].munitions === Infinity && D.ARMES[D.ARME_DE_BASE].rarete === 0, 'l’arme de base (le pistolet) a des munitions sans fin et ne sort jamais d’une caisse');
  check(Object.values(D.ZOMBIES).every((z) => z.vie > 0 && z.vitesse > 0 && z.degats > 0 && z.rayon > 0 && z.ferraille >= 1 && z.points > 0 && /^#[0-9A-F]{6}$/i.test(z.peau)), 'chaque zombie a sa vie, sa vitesse, ses coups, sa ferraille, ses points et ses couleurs');
  check(Object.values(D.ZOMBIES).some((z) => z.boss) && D.VAGUES.boss(5) && !D.VAGUES.boss(4), 'un boss (le Mastodonte) toutes les cinq vagues');
  check(Object.values(D.DEFENSES).every((d) => d.prix > 0 && d.vie > 0 && d.rayon > 0 && d.max >= 1 && d.plus >= 1 && d.depuis >= 1 && d.desc), 'chaque défense a son prix, sa vie, son nombre permis et sa description');
  check(Object.values(D.AMELIORATIONS).every((a) => a.prix > 0 && a.facteur > 1 && a.crans >= 1 && a.desc), 'chaque amélioration a son prix (qui monte) et ses crans');
  let vaguesOk = true; for (let n = 1; n < 30; n++) if (!(D.VAGUES.nombre(n + 1) > D.VAGUES.nombre(n) && D.VAGUES.simultanes(n) <= 42 && D.VAGUES.vie(n + 1) >= D.VAGUES.vie(n))) vaguesOk = false;
  check(vaguesOk, 'les vagues grossissent et durcissent, sans jamais plus de 42 zombies debout à la fois');
  for (const id of D.ORDRE_ARENES) {
    const A = D.ARENES[id], m = M.creer(A), demi = A.taille / 2;
    const dedans = A.sorties.every((s) => Math.abs(s[0]) < demi && Math.abs(s[1]) < demi && m.libreProche(s[0], s[1], 1.1, 5));
    check(A.nom && A.taille >= 30 && !m.bloque(A.depart[0], A.depart[1], D.JOUEUR.rayon) && dedans && A.sorties.length >= 6, `${A.nom} : le départ est libre, ses ${A.sorties.length} sorties sont dans l’arène et dégagées`);
  }
  check(D.DEBLOCAGE.jardin === 0 && D.DEBLOCAGE.parking > 0 && D.DEBLOCAGE.ferme > D.DEBLOCAGE.parking, 'le Jardin est ouvert, le Parking puis la Ferme se débloquent');
}

// ─── le monde ───
{
  const A = { taille: 20, obstacles: [{ type: 'muret', r: [0, 0, 2, 8, 1.2] }, { type: 'cloture', r: [6, 0, 0.4, 6, 0.9] }, { type: 'rocher', c: [-6, 5, 1] }] };
  const m = M.creer(A);
  check(m.bloque(0, 0, 0.4) && m.bloque(0.9 + 0.3, 0, 0.4) && !m.bloque(1.5, 0, 0.4) && m.bloque(9.8, 0, 0.4) && m.bloque(-6, 5.5, 0.4) && !m.bloque(-4, 5, 0.4), 'bloque : le muret, le bord de l’arène, le rocher');
  check(!m.passe(-4, 0, 4, 0, 0.4) && m.passe(-4, -6, 4, -6, 0.4) && !m.passe(4, 0, 8, 0, 0.4), 'passe : le muret et la clôture barrent la route d’un corps');
  check(m.tir(-4, 0, 1, 0, 20) < 3.1 && m.tir(4, 0, 1, 0, 20) > 5.5, 'tir : la balle s’arrête sur le muret (haut) mais passe au-dessus de la clôture (basse)');
  check(!m.vue(-4, 0, 4, 0) && m.vue(4, 0, 8, 0), 'vue : on ne voit pas à travers le muret, on voit par-dessus la clôture');
  const c = { x: 0.2, z: 0.5, rayon: 0.4 }; m.pousser(c);
  check(!m.bloque(c.x, c.z, 0.39), `pousser : un corps entré dans le muret en ressort (${c.x.toFixed(2)}, ${c.z.toFixed(2)})`);
  const b = { x: 50, z: -50, rayon: 0.4 }; m.pousser(b);
  check(Math.abs(b.x) <= 9.6 && Math.abs(b.z) <= 9.6, 'pousser : on reste dans l’arène');
}

// ─── la navigation (src-poncin/nav.js, réutilisé tel quel) ───
{
  const jeu = J.creer({ arene: 'jardin', graine: 1 });
  const ch = jeu.nav.chemin(-15, -3, -8, -3); // de l'autre côté du muret de gauche (x = -12, de z = -11 à 5)
  const longueur = ch ? ch.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - ch[i - 1][0], p[1] - ch[i - 1][1]) : 0), 0) : 0;
  const traverse = ch && ch.some((p, i) => i && !jeu.monde.passe(ch[i - 1][0], ch[i - 1][1], p[0], p[1], 0.35));
  check(ch && ch.length >= 3 && longueur > 10 && !traverse, `A* contourne le muret du Jardin (${ch ? ch.length : 0} points, ${longueur.toFixed(1)} m, aucun segment ne le traverse)`);
  check(jeu.navGros && jeu.navGros !== jeu.nav, 'une seconde grille, plus large, pour les gros zombies');
}

// ─── la partie ───
{
  // même graine, mêmes entrées → même partie
  const jouer = (g) => { const jeu = J.creer({ arene: 'jardin', graine: g }); avancer(jeu, 60 * 50, (j) => ({ mx: Math.cos(j.t * 0.7), mz: Math.sin(j.t * 0.7) })); const p = jeu.joueurs[0]; return [jeu.vague, jeu.stats.tues, p.score, p.ferraille, p.x.toFixed(4), jeu.zombies.length].join('|'); };
  const a = jouer(9), b = jouer(9), c = jouer(10);
  check(a === b, `même graine → même partie (${a})`);
  check(a !== c, 'une autre graine → une autre partie');
}
{
  const jeu = J.creer({ arene: 'jardin', graine: 3 });
  check(jeu.phase === 'pause' && jeu.vague === 0 && J.restants(jeu) === 0, 'la partie commence par un court répit');
  let evs = avancer(jeu, 60 * 5);
  check(jeu.vague === 1 && jeu.phase === 'vague' && evs.some((e) => e.t === 'vague' && e.n === 1) && J.restants(jeu) === D.VAGUES.nombre(1), `la vague 1 arrive (${D.VAGUES.nombre(1)} zombies à tuer)`);
  check(jeu.objets.some((o) => o.type === 'caisse'), 'une caisse d’armes est posée au début de la vague');
  evs = avancer(jeu, 60 * 12);
  check(jeu.zombies.length > 0 && jeu.zombies.every((z) => !jeu.monde.bloque(z.x, z.z, z.rayon * 0.5)), `les zombies sortent de terre aux sorties (${jeu.zombies.length} debout), jamais dans un mur`);
  check(evs.some((e) => e.t === 'tir' && e.de === 'moi') && evs.some((e) => e.t === 'mort'), 'le survivant tire tout seul et abat des zombies');
  check(jeu.objets.some((o) => o.type === 'ferraille') || jeu.joueurs[0].ferraille > 0, 'les zombies abattus laissent de la ferraille');
  // tout tuer d'un coup : la vague se termine, la prime tombe, la pause commence
  const p = jeu.joueurs[0], avant = p.score; jeu.aSortir = 0; for (const z of jeu.zombies) z.vie = 0.001;
  for (const z of jeu.zombies) { z.vie = 0; }
  jeu.zombies.length = 0; evs = avancer(jeu, 2);
  check(jeu.phase === 'pause' && evs.some((e) => e.t === 'vagueFinie') && p.score === avant + D.VAGUES.prime(1), `fin de vague : prime de ${D.VAGUES.prime(1)} points, puis ${D.VAGUES.pause} s de pause`);
  check(J.passer(jeu) && (avancer(jeu, 2), jeu.vague === 2), '« Lancer la vague » n’attend pas la fin de la pause');
}
{
  // la ferraille vient à l'aimant
  const jeu = J.creer({ arene: 'jardin', graine: 4, attente: 99 }), p = jeu.joueurs[0];
  jeu.objets.push({ id: 999, type: 'ferraille', x: p.x + 1.5, z: p.z, valeur: 3, age: 0, vole: false }, { id: 998, type: 'ferraille', x: p.x + 8, z: p.z, valeur: 5, age: 0, vole: false });
  avancer(jeu, 60);
  check(p.ferraille === 3 && jeu.objets.length === 1, 'la ferraille à portée d’aimant vole vers le survivant ; celle de plus loin reste au sol');
  jeu.objets[0].age = J.DUREE_FERRAILLE + 1; avancer(jeu, 1);
  check(jeu.objets.length === 0, `la ferraille oubliée disparaît au bout de ${J.DUREE_FERRAILLE} s`);
}
{
  // l'atelier
  const jeu = J.creer({ arene: 'jardin', graine: 5, attente: 99 }), p = jeu.joueurs[0];
  check(J.construire(jeu, 'moi', 'tourelle').raison === 'ferraille', 'sans ferraille, pas de tourelle');
  p.ferraille = 500;
  check(J.construire(jeu, 'moi', 'tourelle').ok && p.ferraille === 500 - D.DEFENSES.tourelle.prix && jeu.defenses.length === 1, `une tourelle coûte ${D.DEFENSES.tourelle.prix} de ferraille et se pose devant le survivant`);
  const t = jeu.defenses[0]; check(!jeu.monde.bloque(t.x, t.z, D.DEFENSES.tourelle.rayon) && Math.hypot(t.x - p.x, t.z - p.z) > p.rayon, 'elle est posée sur une place libre, pas sur ses pieds');
  check(J.construire(jeu, 'moi', 'tourelle').raison === 'max', 'une seule tourelle à la première vague');
  check(J.construire(jeu, 'moi', 'mortier').raison === 'verrou' && J.construire(jeu, 'moi', 'epouvantail').raison === 'verrou', 'le mortier et l’épouvantail sont verrouillés au début');
  jeu.vague = 7;
  check(J.maxDefenses(jeu, 'tourelle') === 3 && J.construire(jeu, 'moi', 'tourelle').ok && J.construire(jeu, 'moi', 'mortier').ok, 'plus tard, plus de tourelles permises, et le mortier s’ouvre');
  const prix0 = J.prixAmelioration(p, 'degats');
  check(J.ameliorer(jeu, 'moi', 'degats').ok && J.prixAmelioration(p, 'degats') > prix0 && p.niveaux.degats === 1, `une amélioration coûte ${prix0}, puis plus cher au cran suivant`);
  const vm = p.vieMax; J.ameliorer(jeu, 'moi', 'vie'); check(p.vieMax === vm + D.AMELIORATIONS.vie.par, 'Vie max : +20 points de vie');
  p.niveaux.cadence = D.AMELIORATIONS.cadence.crans; check(J.ameliorer(jeu, 'moi', 'cadence').raison === 'max' && J.prixAmelioration(p, 'cadence') === Infinity, 'au dernier cran : « MAX »');
  // le survivant ne traverse pas ses défenses
  const d = jeu.defenses.find((x) => x.type === 'tourelle'); p.x = d.x; p.z = d.z; avancer(jeu, 1);
  check(Math.hypot(p.x - d.x, p.z - d.z) >= D.DEFENSES.tourelle.rayon + p.rayon - 1e-6, 'le survivant ne traverse pas une tourelle');
}
{
  // la tourelle tire seule, la mine saute
  const jeu = J.creer({ arene: 'jardin', graine: 6, attente: 99, ferraille: 100 }), p = jeu.joueurs[0];
  jeu.vague = 2; J.construire(jeu, 'moi', 'tourelle'); J.construire(jeu, 'moi', 'mine');
  const t = jeu.defenses.find((d) => d.type === 'tourelle'), mine = jeu.defenses.find((d) => d.type === 'mine');
  p.x = -18; p.z = 18; p.vivant = true; // le survivant s'écarte : seule la tourelle peut tirer
  jeu.zombies.push({ id: 5000, type: 'trainard', x: t.x + 4, z: t.z, vie: 30, vieMax: 30, vitesse: 0, rayon: 0.42, angle: 0, chemin: null, ci: 0, repense: 9, coup: 1, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  let evs = avancer(jeu, 120);
  check(evs.some((e) => e.t === 'tir' && String(e.de).startsWith('def')) && !jeu.zombies.some((z) => z.id === 5000), 'la tourelle vise et abat seule le zombie à sa portée');
  jeu.zombies.push({ id: 5001, type: 'costaud', x: mine.x, z: mine.z, vie: 120, vieMax: 120, vitesse: 0, rayon: 0.7, angle: 0, chemin: null, ci: 0, repense: 9, coup: 1, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  evs = avancer(jeu, 2);
  check(evs.some((e) => e.t === 'boum') && !jeu.defenses.some((d) => d.type === 'mine') && !jeu.zombies.some((z) => z.id === 5001), 'un zombie marche sur la mine : elle explose et l’emporte');
}
{
  // la caisse d'armes, les munitions, le retour au pistolet
  const jeu = J.creer({ arene: 'jardin', graine: 7, attente: 99 }), p = jeu.joueurs[0];
  jeu.objets.push({ id: 900, type: 'caisse', x: p.x + 0.5, z: p.z, valeur: 0, age: 0, vole: false });
  const evs = avancer(jeu, 2), a = p.armes[1];
  check(a && D.ARMES[a.id] && a.id !== 'pistolet' && p.main === 1 && evs.some((e) => e.t === 'arme'), `la caisse donne une arme (${a ? D.ARMES[a.id].nom : '—'}) et la met en main`);
  a.mun = 1;
  jeu.zombies.push({ id: 5002, type: 'mastodonte', x: p.x + 3, z: p.z, vie: 9999, vieMax: 9999, vitesse: 0, rayon: 1.05, angle: 0, chemin: null, ci: 0, repense: 9, coup: 9, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  const e2 = avancer(jeu, 30);
  check(p.armes[1] === null && p.main === 0 && e2.some((e) => e.t === 'vide'), 'plus de munitions : l’arme disparaît, retour au pistolet');
  check(J.changerArme(jeu, 'moi', 1) === false, 'on ne prend pas un emplacement vide');
}
{
  // le zombie coincé ressort ailleurs ; la fin de partie
  const jeu = J.creer({ arene: 'parking', graine: 8, attente: 0.01 }), p = jeu.joueurs[0];
  avancer(jeu, 2);
  jeu.zombies.push({ id: 6000, type: 'mastodonte', x: 8.2, z: -6.2, vie: 9999, vieMax: 9999, vitesse: 1, rayon: 1.05, angle: 0, chemin: null, ci: 0, repense: 0, coup: 9, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 8.2, cz: -6.2 });
  p.x = 8.2; p.z = -14; // de l'autre côté des voitures, derrière le muret
  let ressort = false; for (let i = 0; i < 60 * 12 && !ressort; i++) { p.vie = p.vieMax; ressort = J.pas(jeu, null, PAS).some((e) => e.t === 'ressort' && e.id === 6000) || Math.hypot(jeu.zombies.find((z) => z.id === 6000).x - 8.2, jeu.zombies.find((z) => z.id === 6000).z + 6.2) > 3; }
  check(ressort, 'un gros zombie coincé finit par passer ou par ressortir de terre ailleurs (aucune vague bloquée)');
  p.vie = 1; p.invul = 0; const z = jeu.zombies.find((x) => x.id === 6000); z.x = p.x + 1.4; z.z = p.z; z.coup = 0;
  const evs = avancer(jeu, 120);
  check(jeu.fini && jeu.phase === 'fin' && evs.some((e) => e.t === 'fin') && !p.vivant, 'le survivant tombe : fin de partie, avec son score, sa vague et ses victimes');
}

// ─── un joueur automatique sur chaque arène : plusieurs vagues tenues, aucune bloquée ; le temps de calcul ───
{
  function bot(jeu) {
    const j = jeu.joueurs[0]; let fx = 0, fz = 0;
    for (const z of jeu.zombies) { const dx = j.x - z.x, dz = j.z - z.z, d2 = dx * dx + dz * dz + 0.01; if (d2 < 49) { fx += dx / d2; fz += dz / d2; } }
    for (const o of jeu.objets) if (o.type === 'caisse') { const dx = o.x - j.x, dz = o.z - j.z, d = Math.hypot(dx, dz) + 0.1; fx += dx / d * 0.15; fz += dz / d * 0.15; }
    fx += -j.x * 0.004 - j.z * 0.003; fz += -j.z * 0.004 + j.x * 0.003;
    const l = Math.hypot(fx, fz); let mx = l > 0.02 ? fx / l : 0, mz = l > 0.02 ? fz / l : 0;
    if (jeu.monde.bloque(j.x + mx * 0.8, j.z + mz * 0.8, 0.45)) { const t = mx; mx = -mz; mz = t; }
    return { mx, mz };
  }
  for (const id of D.ORDRE_ARENES) {
    const vagues = []; let bloquee = false, ms = 0, pas = 0;
    for (const g of [11, 12, 13]) {
      const jeu = J.creer({ arene: id, graine: g }), t0 = Date.now(); let n = 0, debutVague = 0, v = 0;
      while (!jeu.fini && n < 60 * 900) { J.pas(jeu, { moi: bot(jeu) }, PAS); n++; if (jeu.vague !== v) { v = jeu.vague; debutVague = jeu.t; } if (jeu.phase === 'vague' && jeu.t - debutVague > 300) { bloquee = true; break; } }
      ms += Date.now() - t0; pas += n; vagues.push(jeu.vague);
    }
    check(!bloquee && vagues.every((v) => v >= 3), `${D.ARENES[id].nom} : le joueur automatique tient ${vagues.join(', ')} vagues, aucune ne reste bloquée`);
    check(ms / pas < 0.5, `${D.ARENES[id].nom} : ${(1000 * ms / pas).toFixed(0)} µs par pas de simulation (≤ 500 µs ; il en faut 60 par seconde)`);
  }
}

console.log(fails ? `\n${fails} échec(s) (Dernier Rempart)` : '\nTout passe (Dernier Rempart).');
process.exit(fails ? 1 : 0);
