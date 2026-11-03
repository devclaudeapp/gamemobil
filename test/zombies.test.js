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
// (un niveau passé : on prend le premier atout proposé, la partie ne reste pas à attendre)
const avancer = (jeu, n, e) => { const evs = []; for (let i = 0; i < n && !jeu.fini; i++) { if (jeu.choix) J.choisirAtout(jeu, jeu.choix.id, jeu.choix.options[0]); for (const x of J.pas(jeu, e ? { moi: typeof e === 'function' ? e(jeu) : e } : null, PAS)) evs.push(x); } return evs; };

// ─── les données ───
{
  const nombre = (v) => typeof v === 'number' && (Number.isFinite(v) || v === Infinity);
  check(Object.values(D.ARMES).every((a) => a.nom && a.degats > 0 && a.cadence > 0 && a.portee > 0 && a.balles >= 1 && nombre(a.munitions) && a.munitions > 0 && ['pistolet', 'mitraillette', 'pompe', 'fusil', 'sniper', 'flamme', 'cryo', 'tesla', 'roquette', 'scie', 'laser', 'arc', 'acide'].includes(a.classe) && /^[a-r]$/.test(a.modele) && a.famille), `chaque arme (${Object.keys(D.ARMES).length}) a ses dégâts, sa cadence, sa portée, ses munitions, un son, sa famille et son blaster`);
  check(D.ARMES[D.ARME_DE_BASE].munitions === Infinity && D.ARMES[D.ARME_DE_BASE].rarete === 0, 'l’arme de base (le pistolet) a des munitions sans fin et ne sort jamais d’une caisse');
  check(Object.values(D.ZOMBIES).every((z) => z.vie > 0 && z.vitesse > 0 && z.degats > 0 && z.rayon > 0 && z.ferraille >= 1 && z.points > 0 && /^#[0-9A-F]{6}$/i.test(z.peau)), 'chaque zombie a sa vie, sa vitesse, ses coups, sa ferraille, ses points et ses couleurs');
  check(Object.values(D.ZOMBIES).some((z) => z.boss) && D.VAGUES.boss(5) && !D.VAGUES.boss(4), 'un boss toutes les cinq vagues');
  const tour = [5, 10, 15, 20, 25].map(D.VAGUES.boss);
  check(tour.join() === 'golem,loupgarou,golemglace,vampire,golem' && tour.every((k) => D.ZOMBIES[k] && D.ZOMBIES[k].boss && D.ZOMBIES[k].modele && ['large', 'medium'].includes(D.ZOMBIES[k].rig)), `les boss à tour de rôle, chacun avec son modèle KayKit (${tour.map((k) => D.ZOMBIES[k].nom).join(', ')})`);
  check(['trainard', 'coureur', 'costaud', 'cracheur'].every((k) => /^#[0-9A-F]{6}$/i.test(D.ZOMBIES[k].teinte)), 'chaque zombie de la horde a sa teinte (le zombie Kenney recoloré)');
  check(Object.values(D.DEFENSES).filter((d) => !d.horsAtelier).every((d) => d.prix > 0 && d.vie > 0 && d.rayon > 0 && d.max >= 1 && d.plus >= 1 && d.depuis >= 1 && d.desc), 'chaque défense a son prix, sa vie, son nombre permis et sa description');
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

// ─── les modèles 3D (zombies/modeles/) : chaque fichier que src-zombies/modeles.js lit existe, avec sa licence, et le tout reste léger ───
{
  const fs = require('fs'), dir = path.join(__dirname, '..', 'zombies', 'modeles');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src-zombies', 'modeles.js'), 'utf8'), fichiers = (src.match(/'(kenney|kaykit)\/[a-z-]+\.glb'/g) || []).map((x) => x.slice(1, -1));
  const manquants = fichiers.filter((f) => !fs.existsSync(path.join(dir, f)));
  const total = fichiers.filter((f) => fs.existsSync(path.join(dir, f))).reduce((t, f) => t + fs.statSync(path.join(dir, f)).size, 0);
  check(fichiers.length >= 20 && !manquants.length, `les ${fichiers.length} modèles lus par le jeu sont dans zombies/modeles/${manquants.length ? ' (manquent : ' + manquants.join(', ') + ')' : ''}`);
  check(total < 2.5 * 1024 * 1024, `ils pèsent ${(total / 1024 / 1024).toFixed(1)} Mo en tout (≤ 2,5 Mo, compressés en meshopt)`);
  const lic = (d) => fs.readdirSync(path.join(dir, d)).filter((f) => /^LICENCE.*\.txt$/.test(f)).map((f) => fs.readFileSync(path.join(dir, d, f), 'utf8'));
  check(lic('kenney').length === 3 && lic('kenney').every((t) => /CC0|Creative Commons Zero/i.test(t)) && lic('kaykit').length === 4 && lic('kaykit').every((t) => /CC0/i.test(t)), 'leurs licences (Kenney : 3 packs, KayKit : 4) sont rangées à côté, toutes CC0');
  check(Object.keys(D.ZOMBIES).filter((k) => D.ZOMBIES[k].boss).every((k) => fichiers.includes(`kaykit/${D.ZOMBIES[k].modele}.glb`)), 'chaque boss a son modèle KayKit');
  const blasters = [...new Set(Object.values(D.ARMES).map((a) => a.modele))], sw = fs.readFileSync(path.join(__dirname, '..', 'zombies', 'sw.js'), 'utf8');
  const tailleArmes = fs.readdirSync(path.join(dir, 'armes')).filter((f) => f.endsWith('.glb')).reduce((t, f) => t + fs.statSync(path.join(dir, 'armes', f)).size, 0);
  check(blasters.every((c) => fs.existsSync(path.join(dir, 'armes', `blaster-${c}.glb`))) && lic('armes').length === 1 && /CC0|Creative Commons Zero/i.test(lic('armes')[0]) && /modeles\/armes\/blaster-/.test(sw) && tailleArmes < 600 * 1024,
    `les armes : ${blasters.length} blasters du Blaster Kit de Kenney (CC0, licence à côté, ${(tailleArmes / 1024).toFixed(0)} Ko), gardés hors ligne`);
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
  jeu.zombies.push({ id: 5002, type: 'golem', x: p.x + 3, z: p.z, vie: 9999, vieMax: 9999, vitesse: 0, rayon: 1.05, angle: 0, chemin: null, ci: 0, repense: 9, coup: 9, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  const e2 = avancer(jeu, 30);
  check(p.armes[1] === null && p.main === 0 && e2.some((e) => e.t === 'vide'), 'plus de munitions : l’arme disparaît, retour au pistolet');
  check(J.changerArme(jeu, 'moi', 1) === false, 'on ne prend pas un emplacement vide');
}
{
  // le zombie coincé ressort ailleurs ; la fin de partie
  const jeu = J.creer({ arene: 'parking', graine: 8, attente: 0.01 }), p = jeu.joueurs[0];
  avancer(jeu, 2);
  jeu.zombies.push({ id: 6000, type: 'golem', x: 8.2, z: -6.2, vie: 9999, vieMax: 9999, vitesse: 1, rayon: 1.05, angle: 0, chemin: null, ci: 0, repense: 0, coup: 9, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 8.2, cz: -6.2 });
  p.x = 8.2; p.z = -14; // de l'autre côté des voitures, derrière le muret
  let ressort = false; for (let i = 0; i < 60 * 12 && !ressort; i++) { p.vie = p.vieMax; ressort = J.pas(jeu, null, PAS).some((e) => e.t === 'ressort' && e.id === 6000) || Math.hypot(jeu.zombies.find((z) => z.id === 6000).x - 8.2, jeu.zombies.find((z) => z.id === 6000).z + 6.2) > 3; }
  check(ressort, 'un gros zombie coincé finit par passer ou par ressortir de terre ailleurs (aucune vague bloquée)');
  p.vie = 1; p.invul = 0; const z = jeu.zombies.find((x) => x.id === 6000); z.x = p.x + 1.4; z.z = p.z; z.coup = 0;
  const evs = avancer(jeu, 120);
  check(jeu.fini && jeu.phase === 'fin' && evs.some((e) => e.t === 'fin') && !p.vivant, 'le survivant tombe : fin de partie, avec son score, sa vague et ses victimes');
}

// ─── l'expérience, les niveaux, les atouts, les critiques, la grenade, le Bunker ───
{
  const jeu = J.creer({ arene: 'jardin', graine: 21, attente: 99 }), p = jeu.joueurs[0];
  check(p.niveau === 1 && p.xp === 0 && !jeu.choix, 'on commence au niveau 1, sans expérience');
  const mk = (id, type, x, z, vie) => ({ id, type, x, z, vie, vieMax: vie, vitesse: 0, rayon: D.ZOMBIES[type].rayon, angle: 0, chemin: null, ci: 0, repense: 9, coup: 9, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  // assez de zombies pour passer un niveau : la partie s'arrête sur le choix de trois atouts
  for (let k = 0; k < 14; k++) jeu.zombies.push(mk(8000 + k, 'trainard', p.x + 2 + (k % 4) * 0.2, p.z + (k % 2) * 0.3, 0.5));
  let n = 0; while (!jeu.choix && n++ < 600) J.pas(jeu, null, PAS);
  const c = jeu.choix;
  check(c && c.id === 'moi' && c.options.length === 3 && new Set(c.options).size === 3 && c.options.every((k) => D.ATOUTS[k]) && p.niveau === 2, `niveau 2 : trois atouts différents au choix (${c ? c.options.map((k) => D.ATOUTS[k].nom).join(', ') : '—'})`);
  const t0 = jeu.t; J.pas(jeu, null, PAS); J.pas(jeu, null, PAS);
  check(jeu.t === t0, 'tant que le choix n’est pas fait, la partie attend');
  check(!J.choisirAtout(jeu, 'moi', 'inconnu') && J.choisirAtout(jeu, 'moi', c.options[0]) && p.atouts[c.options[0]] === 1 && (!jeu.choix || jeu.choix.niveau > 2), `choisir « ${D.ATOUTS[c.options[0]].nom} » : rang 1, la partie repart`);
  // les effets des atouts
  const vm = p.vieMax; jeu.choix = { id: 'moi', options: ['vie', 'multi', 'critique'], niveau: 3 }; J.choisirAtout(jeu, 'moi', 'vie');
  check(p.vieMax === vm + D.ATOUTS.vie.par, 'Cuir épais : +25 points de vie');
  p.atouts.multi = 1; jeu.zombies.length = 0; jeu.zombies.push(mk(8100, 'golem', p.x + 4, p.z, 1e6)); p.attente = 0; p.cible = 0; p.angle = 0;
  let evs = avancer(jeu, 40); const tirs = evs.filter((e) => e.t === 'tir' && e.de === 'moi');
  check(tirs.some((e) => e.b === 1), 'Tir double : deux balles par tir au pistolet');
  p.atouts.critique = 40; evs = avancer(jeu, 60);
  check(evs.some((e) => e.t === 'touche' && e.crit && e.de === 'moi') && evs.filter((e) => e.t === 'touche').every((e) => e.degats >= 1), 'les coups critiques sont marqués sur les touches (pour les chiffres de dégâts)');
  p.atouts.critique = 0;
  // la grenade : vers le groupe, puis rechargement
  jeu.zombies.length = 0; for (let k = 0; k < 5; k++) jeu.zombies.push(mk(8200 + k, 'trainard', p.x + 6 + k * 0.3, p.z + 2, 40));
  jeu.zombies.push(mk(8300, 'trainard', p.x - 3, p.z - 3, 40));
  const r1 = J.grenade(jeu, 'moi'), ob = jeu.obus[jeu.obus.length - 1];
  check(r1.ok && ob && ob.grenade && Math.hypot(ob.x1 - (p.x + 6.6), ob.z1 - (p.z + 2)) < 1, 'la grenade part vers le plus gros groupe');
  check(J.grenade(jeu, 'moi').raison === 'recharge' && p.grenadeT > 5, `puis se recharge (${p.grenadeT.toFixed(1)} s)`);
  const avant = jeu.zombies.length; p.vie = p.vieMax = 1e6; evs = avancer(jeu, 50);
  check(evs.some((e) => e.t === 'boum') && jeu.zombies.length < avant - 3, 'elle explose et emporte le groupe');
  const morts = evs.filter((e) => e.t === 'mort');
  check(morts.length && morts.every((e) => e.fort && Number.isFinite(e.kx) && Number.isFinite(e.kz) && Math.hypot(e.kx, e.kz) > 0), 'les morts par souffle sont « fortes » et portent la direction du coup (le rendu fait voler les morceaux)');
}
{
  // le Bunker : les bonus permanents du départ
  const D0 = J.creer({ arene: 'jardin', graine: 3, attente: 99 }).joueurs[0];
  const jeu = J.creer({ arene: 'jardin', graine: 3, attente: 99, bonus: { vie: 2, ferraille: 3, degats: 4, arme: 1, grenade: 3 } }), p = jeu.joueurs[0];
  check(p.vieMax === D0.vieMax + 2 * D.BUNKER.vie.par && p.ferraille === 3 * D.BUNKER.ferraille.par && p.armes[1] && p.main === 1, 'le Bunker : plus de vie, de la ferraille et une arme dès le départ');
  check(J.multDegats(p) > J.multDegats(D0) * 1.19, 'et des dégâts en plus');
  check(D.MEDAILLES.parVague > 0 && Object.values(D.BUNKER).every((b) => b.prix.length === b.crans && b.prix.every((x, i) => !i || x > b.prix[i - 1])), 'chaque amélioration du Bunker a un prix par cran, qui monte');
}

// ─── la coop : à plusieurs, le choix d'un atout n'arrête pas la partie ; un copain à terre se relève ; la position du client ───
{
  const jeu = J.creer({ arene: 'jardin', graine: 31, attente: 99, joueurs: [{ id: 'a', pseudo: 'Alice' }, { id: 'b', pseudo: 'Bob', bonus: { vie: 3 } }] }), [a, b] = jeu.joueurs;
  check(!jeu.pauseChoix && b.vieMax === a.vieMax + 3 * D.BUNKER.vie.par, 'à plusieurs : pas de pause pour les atouts, et chacun ses bonus du Bunker');
  a.choixAttente = 1; a.xp = 0; jeu.zombies.push({ id: 9100, type: 'trainard', x: a.x + 2, z: a.z, vie: 0.5, vieMax: 0.5, vitesse: 0, rayon: 0.42, angle: 0, chemin: null, ci: 0, repense: 9, coup: 9, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  a.xp = 1e4; let n = 0; while (!a.choix && n++ < 300) J.pas(jeu, null, PAS);
  const t0 = jeu.t; J.pas(jeu, null, PAS);
  check(a.choix && !jeu.choix && jeu.t > t0, 'Alice passe un niveau : ses atouts l’attendent, la partie continue');
  check(J.choisirAtout(jeu, 'a', a.choix.options[0]) && !J.choisirAtout(jeu, 'b', 'degats'), 'Alice choisit le sien ; Bob ne peut pas choisir à sa place');
  // Bob tombe : la partie continue ; Alice reste près de lui, il se relève avec 40 % de sa vie
  b.vie = 1; b.invul = 0; a.x = -15; a.z = -15; jeu.zombies.length = 0; jeu.zombies.push({ id: 9200, type: 'golem', x: b.x + 1.2, z: b.z, vie: 1e9, vieMax: 1e9, vitesse: 0, rayon: 1.05, angle: 0, chemin: null, ci: 0, repense: 9, coup: 0, crache: 9, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 });
  let evs = avancer(jeu, 20); jeu.zombies.length = 0;
  check(!b.vivant && !jeu.fini && evs.some((e) => e.t === 'tombe' && e.id === 'b'), 'Bob tombe : la partie continue tant qu’Alice est debout');
  a.x = b.x + 1; a.z = b.z; evs = avancer(jeu, 60 * 3);
  check(b.vivant && b.vie === Math.round(b.vieMax * 0.4) && evs.some((e) => e.t === 'releve' && e.id === 'b' && e.par === 'a'), `Alice reste près de Bob : il se relève (${b.vie} points de vie)`);
  // la position proposée par le client : adoptée si plausible, refusée sinon
  const bx = b.x; J.pas(jeu, { b: { mx: 0, mz: 0, x: bx + 1, z: b.z } }, PAS);
  check(Math.abs(b.x - (bx + 1)) < 0.05, 'la position envoyée par le client est adoptée si elle est plausible');
  J.pas(jeu, { b: { mx: 0, mz: 0, x: b.x + 9, z: b.z } }, PAS);
  check(Math.abs(b.x - (bx + 1)) < 0.2, 'et refusée si elle saute trop loin');
  a.vie = 0; a.vivant = false; b.vie = 0; b.vivant = false; evs = avancer(jeu, 2);
  check(jeu.fini && evs.some((e) => e.t === 'fin'), 'tout le monde à terre : la partie s’arrête');
}

// ─── l'arsenal : chaque mode de tir ───
{
  const mk = (id, x, z, vie, type) => ({ id, type: type || 'trainard', x, z, vie, vieMax: vie, vitesse: 1, rayon: 0.42, angle: 0, chemin: null, ci: 0, repense: 99, coup: 99, crache: 99, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: x, cz: z });
  const essai = (arme, n, groupe, duree) => {
    const jeu = J.creer({ arene: 'jardin', graine: 3, attente: 99 }), p = jeu.joueurs[0]; p.vie = p.vieMax = 1e6; p.xp = -1e9;
    p.armes[1] = { id: arme, mun: 999 }; p.main = 1;
    for (let i = 0; i < n; i++) jeu.zombies.push(mk(9000 + i, p.x + 4 + (i % 4) * (groupe || 0.8), p.z - 1 + Math.floor(i / 4) * (groupe || 0.8), 400));
    const evs = avancer(jeu, Math.round((duree || 2) * 60), { mx: 0, mz: 0 });
    return { jeu, p, evs, touches: evs.filter((e) => e.t === 'touche'), tirs: evs.filter((e) => e.t === 'tir') };
  };
  check(Object.keys(D.ARMES).length >= 24, `${Object.keys(D.ARMES).length} armes`);
  { const r = essai('flammes', 8, 0.7, 1.2); check(r.jeu.zombies.some((z) => z.feu > 0) && r.touches.some((e) => e.petit) && r.touches.length > 20, 'lance-flammes : le cône touche plusieurs zombies, qui brûlent'); }
  { const r = essai('cryo', 4, 0.8, 0.8); const z = r.jeu.zombies[0]; check(r.jeu.zombies.some((z) => z.gel > 0), 'cryo-canon : les zombies touchés sont gelés'); void z; }
  { const r = essai('tesla', 6, 1.0, 0.5), e = r.tirs.find((t) => t.pts); check(e && e.pts.length >= 4 && new Set(r.touches.map((t) => t.cible)).size >= 3, `Tesla : l’éclair saute de zombie en zombie (${e ? e.pts.length - 1 : 0} touchés d’un coup)`); }
  { const r = essai('roquettes', 8, 0.7, 1.4); check(r.evs.some((e) => e.t === 'boum') && new Set(r.touches.map((t) => t.cible)).size >= 4, 'lance-roquettes : la roquette part droit et explose dans le groupe'); }
  { const r = essai('acide', 6, 0.6, 2.5); check(r.evs.some((e) => e.t === 'acide') && r.touches.some((e) => e.petit), 'lance-acide : une flaque qui ronge ceux qui marchent dedans'); }
  { const r = essai('scie', 6, 0.9, 0.4); check(r.jeu.disques.length >= 1 && new Set(r.touches.map((t) => t.cible)).size >= 3, 'lance-scies : le disque traverse tout le groupe'); const r2 = essai('scie', 0, 1, 0.1); r2.jeu.zombies.push(mk(9500, r2.p.x + 4, r2.p.z, 9999)); avancer(r2.jeu, 30, { mx: 0, mz: 0 }); r2.jeu.zombies.length = 0; const n0 = r2.jeu.disques.length; avancer(r2.jeu, 240, { mx: 0, mz: 0 }); check(n0 >= 1 && r2.jeu.disques.length === 0, 'et il revient au tireur'); }
  { const r = essai('rafale', 1, 1, 0.5), t = r.tirs.map((e) => e.de); check(t.length >= 3, `fusil à rafales : trois balles d’affilée (${t.length} en 0,5 s)`); }
  { const a = essai('minigun', 1, 1, 0.4).tirs.length, b = essai('minigun', 1, 1, 1.6).tirs.length - a; check(b > a * 2.2, `minigun : la cadence monte (${a} tirs la 1re 0,4 s, ${b} les 1,2 s suivantes)`); }
  { const r = essai('laser', 0, 1, 0.05); for (let i = 0; i < 5; i++) r.jeu.zombies.push(mk(9600 + i, r.p.x + 3 + i * 1.1, r.p.z, 400)); const evs = avancer(r.jeu, 40, { mx: 0, mz: 0 }), t = evs.filter((e) => e.t === 'touche' && !e.crit); const parC = {}; for (const e of t) parC[e.cible] = Math.max(parC[e.cible] || 0, e.degats); const v = Object.values(parC); check(v.length >= 5 && Math.min(...v) >= Math.max(...v) * 0.95, `laser : le rayon traverse toute la file sans perdre de force (${v.join(', ')})`); }
  { const r = essai('flammes', 0, 1, 0.05); r.jeu.zombies.push(mk(9700, r.p.x + 7.5, r.p.z, 400)); const evs = avancer(r.jeu, 60, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'tir' && e.cle === 'pistolet') && r.p.armes[1].mun === 999 && r.p.main === 1, 'hors de portée du lance-flammes : le pistolet d’appoint tire, sans dépenser de munitions'); }
  { const r = essai('plasma', 6, 0.5, 0.5); check(r.evs.some((e) => e.t === 'boum' && e.petite), 'plasma : une petite explosion à chaque impact'); }
  // un tir ne garde rien de l'arme d'avant (l'objet de tir est réutilisé)
  { const r = essai('plasma', 2, 1, 0.3); r.p.armes[1] = null; r.p.main = 0; const evs = avancer(r.jeu, 30, { mx: 0, mz: 0 }); check(!evs.some((e) => e.t === 'boum'), 'repassé au pistolet : plus d’explosion (rien ne reste de l’arme d’avant)'); }
}

// ─── le bestiaire : chaque talent ───
{
  const mkz = (id, type, x, z, vie) => { const Z = D.ZOMBIES[type]; return { id, type, x, z, vie: vie || 1e5, vieMax: vie || 1e5, vitesse: Z.vitesse, rayon: Z.rayon, angle: 0, chemin: null, ci: 0, repense: 0, coup: 0.5, crache: 1, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: x, cz: z }; };
  const scene = (type, opts) => { const jeu = J.creer({ arene: 'jardin', graine: 5, attente: 99 }), p = jeu.joueurs[0]; p.vie = p.vieMax = 500; p.xp = -1e9; jeu.zombies.push(mkz(9000, type, p.x + ((opts && opts.d) || 7), p.z, opts && opts.vie)); return { jeu, p }; };
  const types = ['kamikaze', 'sauteur', 'flammeur', 'sabreur', 'geolier', 'invocateur'];
  check(types.every((t) => D.ZOMBIES[t] && D.ZOMBIES[t].depuis > 4 && D.ZOMBIES[t].teinte) && Object.keys(D.ZOMBIES).filter((k) => !D.ZOMBIES[k].boss).length >= 10, `le bestiaire : ${Object.keys(D.ZOMBIES).filter((k) => !D.ZOMBIES[k].boss).map((k) => D.ZOMBIES[k].nom).join(', ')}`);
  { const { jeu, p } = scene('kamikaze', { d: 2.5 }); jeu.joueurs[0].armes[0] = null; p.cible = 99; const evs = avancer(jeu, 120, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'detone') && evs.some((e) => e.t === 'boum') && p.vie < 500 && !jeu.zombies.length, 'le kamikaze explose à ton contact (et te blesse)'); }
  { const { jeu } = scene('kamikaze', { d: 6, vie: 1 }); jeu.zombies.push(mkz(9100, 'trainard', jeu.joueurs[0].x + 6.5, jeu.joueurs[0].z + 0.6, 20)); const evs = avancer(jeu, 120, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'boum') && evs.filter((e) => e.t === 'mort').length >= 2, 'abattu, il explose aussi, et emporte ses voisins'); }
  { const { jeu } = scene('sauteur', { d: 7 }); const evs = avancer(jeu, 150, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'saute') && evs.some((e) => e.t === 'atterrit'), 'le sauteur bondit vers toi, par-dessus tout'); }
  { const { jeu, p } = scene('flammeur', { d: 3 }); const evs = avancer(jeu, 90, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'souffle') && evs.filter((e) => e.t === 'blesse').length > 4 && p.vie < 500, 'le cracheur de feu souffle des flammes, de près'); }
  { const { jeu } = scene('sabreur', { d: 5 }); jeu.zombies[0].vitesse = 0; jeu.zombies[0].angle = Math.PI; const evs = avancer(jeu, 240, { mx: 0, mz: 0 }); const pare = evs.filter((e) => e.t === 'pare').length, tirs = evs.filter((e) => e.t === 'tir').length; check(pare > tirs * 0.3 && pare < tirs, `le sabreur pare les balles qui arrivent de face (${pare} sur ${tirs})`); }
  { const { jeu, p } = scene('geolier', { d: 6.5 }); jeu.zombies[0].crochetT = 0; jeu.zombies[0].vitesse = 0; const x0 = p.x; const evs = avancer(jeu, 70, { mx: -1, mz: 0 }); check(evs.some((e) => e.t === 'crochet') && evs.some((e) => e.t === 'accroche') && p.x > x0 + 1, `le geôlier lance sa chaîne et te tire vers lui (${(p.x - x0).toFixed(1)} m)`); }
  { const { jeu } = scene('invocateur', { d: 8 }); jeu.zombies[0].invoqueT = 0; jeu.morts.push({ x: jeu.joueurs[0].x + 6, z: 0, t: 0 }, { x: jeu.joueurs[0].x + 6, z: 1, t: 0 }); const evs = avancer(jeu, 30, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'invoque' && e.pts.length === 2) && jeu.zombies.filter((z) => z.type === 'trainard').length + evs.filter((e) => e.t === 'mort' && e.type === 'trainard').length === 2, 'l’invocateur relève les morts tout près'); }
}

// ─── les équipements : tourelles à flammes et Tesla, claymore, baril explosif, poste radio ───
{
  const mkz = (id, x, z, vie) => ({ id, type: 'trainard', x, z, vie: vie || 300, vieMax: vie || 300, vitesse: 0.01, rayon: 0.42, angle: 0, chemin: null, ci: 0, repense: 99, coup: 99, crache: 99, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: x, cz: z });
  const pose = (type, vague, f) => { const jeu = J.creer({ arene: 'jardin', graine: 8, attente: 99 }), p = jeu.joueurs[0]; jeu.vague = vague || 9; p.ferraille = 999; p.vie = p.vieMax = 1e6; p.xp = -1e9; p.angle = 0; const r = J.construire(jeu, 'moi', type); const d = jeu.defenses[0]; p.x -= 6; p.armes[0] = null; return { jeu, p, d, r }; };
  check(['tourellefeu', 'tourelletesla', 'claymore', 'baril', 'radio'].every((k) => D.DEFENSES[k] && D.DEFENSES[k].desc), `dix équipements à l’atelier (${Object.values(D.DEFENSES).filter((d) => !d.horsAtelier).map((d) => d.nom).join(', ')})`);
  { const { jeu, d, r } = pose('tourellefeu'); for (let i = 0; i < 3; i++) jeu.zombies.push(mkz(9000 + i, d.x + 2.5, d.z - 0.6 + i * 0.6)); jeu.joueurs[0].cible = 1e9; const evs = avancer(jeu, 90); check(r.ok && jeu.zombies.some((z) => z.feu > 0) && evs.some((e) => e.t === 'tir' && e.cle === 'tourellefeu'), 'la tourelle à flammes arrose ce qui s’approche'); }
  { const { jeu, d } = pose('tourelletesla'); for (let i = 0; i < 4; i++) jeu.zombies.push(mkz(9000 + i, d.x + 4 + i * 1.2, d.z)); jeu.joueurs[0].cible = 1e9; const evs = avancer(jeu, 90), e = evs.find((x) => x.t === 'tir' && x.cle === 'tourelletesla'); check(e && e.pts.length >= 3, `la tourelle Tesla : un éclair qui saute (${e ? e.pts.length - 1 : 0} zombies)`); }
  { const { jeu, d } = pose('claymore'); jeu.zombies.push(mkz(9000, d.x + 2.5, d.z, 100), mkz(9001, d.x + 3.5, d.z + 0.8, 100), mkz(9002, d.x - 2.5, d.z, 100)); jeu.joueurs[0].cible = 1e9; const evs = avancer(jeu, 10); const morts = evs.filter((e) => e.t === 'mort').map((e) => e.id); check(!jeu.defenses.length && morts.includes(9000) && morts.includes(9001) && !morts.includes(9002), 'la claymore souffle vers l’avant, pas derrière elle'); }
  { const { jeu, d } = pose('baril'); jeu.zombies.push(mkz(9000, d.x + 1.5, d.z, 100), mkz(9001, d.x + 4.6, d.z + 3, 100)); d.vie = 0; const evs = avancer(jeu, 5); check(evs.some((e) => e.t === 'boum') && evs.some((e) => e.t === 'mort' && e.id === 9000) && !evs.some((e) => e.t === 'mort' && e.id === 9001), 'le baril saute et souffle tout autour'); }
  { const { jeu, p } = pose('baril'); const d = jeu.defenses[0]; p.x = d.x - 4; p.z = d.z; p.armes[0] = { id: 'pistolet', mun: Infinity }; jeu.zombies.push(mkz(9000, d.x + 3, d.z, 1e5)); const evs = avancer(jeu, 120); check(evs.some((e) => e.t === 'boum') && !jeu.defenses.length, 'une balle dans le baril (entre toi et le zombie) : il saute'); }
  { const { jeu, p } = pose('baril'); p.x += 6; J.construire(jeu, 'moi', 'baril'); p.x -= 6; const n0 = jeu.defenses.length; jeu.defenses[0].vie = 0; avancer(jeu, 30); check(n0 === 2 && !jeu.defenses.length, 'deux barils côte à côte : l’un fait sauter l’autre'); }
  { const { jeu, d } = pose('radio'); jeu.zombies.push(mkz(9000, d.x + 9, d.z + 4, 1e5)); jeu.zombies[0].vitesse = 1.5; jeu.zombies[0].repense = 0; jeu.joueurs[0].cible = 1e9; const evs = avancer(jeu, 60 * 9); const z = jeu.zombies[0]; check(evs.some((e) => e.t === 'boum') && !jeu.defenses.length && (!z || Math.hypot(z.x - d.x, z.z - d.z) < 4), 'le poste radio attire les zombies, puis explose'); }
}

// ─── l'Ascension : des échelons tirés de leur numéro ; objectifs, météos, règles ───
{
  const e1 = J.echelon(7), e2 = J.echelon(7), e3 = J.echelon(8);
  check(JSON.stringify(e1) === JSON.stringify(e2) && e1.graine !== e3.graine && J.texteObjectif(e1.objectif), `un échelon est le même pour tout le monde (7 : ${J.texteObjectif(e1.objectif)}, ${D.ASCENSION.meteos[e1.meteo].nom}, ${e1.regleNom})`);
  const vus = { meteo: new Set(), regle: new Set(), obj: new Set() }; for (let n = 1; n <= 80; n++) { const e = J.echelon(n); vus.meteo.add(e.meteo); vus.regle.add(e.regle); vus.obj.add(e.objectif.type); }
  check(vus.meteo.size === Object.keys(D.ASCENSION.meteos).length && vus.regle.size === D.ASCENSION.regles.length && vus.obj.size === 5, `sur 80 échelons : ${vus.meteo.size} météos, ${vus.regle.size} règles, ${vus.obj.size} objectifs`);
  check(J.echelon(1).regle === 'normale' && J.echelon(1).meteo === 'clair' && J.echelon(1).vagueDepart === 1 && J.echelon(30).vagueDepart > 5 && J.echelon(5).objectif.type === 'contrat', 'le premier est doux ; plus haut, la horde part de plus loin ; un contrat tous les cinq');
  const mkz = (id, type, x, z, vie) => { const Z = D.ZOMBIES[type]; return { id, type, x, z, vie, vieMax: vie, vitesse: 0, rayon: Z.rayon, angle: 0, chemin: null, ci: 0, repense: 99, coup: 99, crache: 99, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: x, cz: z }; };
  const partie = (o) => { const jeu = J.creer(Object.assign({ arene: 'jardin', graine: 4, attente: 0.2 }, o)); jeu.joueurs[0].vie = jeu.joueurs[0].vieMax = Math.max(jeu.joueurs[0].vieMax, o.vieMax || 0); jeu.joueurs[0].xp = -1e9; return jeu; };
  { const jeu = partie({ objectif: { type: 'tues', n: 3 } }); avancer(jeu, 30); jeu.zombies.length = 0; jeu.aSortir = 50; jeu.stats.tues = 2; jeu.zombies.push(mkz(9900, 'trainard', jeu.joueurs[0].x + 3, jeu.joueurs[0].z, 1)); const evs = avancer(jeu, 60); check(jeu.fini && jeu.gagne === true && evs.some((e) => e.t === 'victoire'), 'Carnage : le dernier zombie demandé abattu, l’échelon est réussi'); }
  { const jeu = partie({ objectif: { type: 'chrono', s: 3 }, vieMax: 1e6 }); avancer(jeu, 60 * 4); check(jeu.fini && jeu.gagne === true, 'Résister : tenu le temps demandé, réussi'); }
  { const jeu = partie({ objectif: { type: 'vagues', n: 1 }, vieMax: 1e6 }); avancer(jeu, 30); jeu.zombies.length = 0; jeu.aSortir = 0; avancer(jeu, 10); check(jeu.fini && jeu.gagne === true && jeu.vaguesFinies === 1, 'Tenir : la vague finie, réussi'); }
  { const jeu = partie({ objectif: { type: 'contrat', cible: 'costaud', vie: 50, s: 2 }, vieMax: 1e6 }); avancer(jeu, 30); const el = jeu.zombies.find((z) => z.elite); avancer(jeu, 60 * 3); check(el && el.vieMax > 5000 && jeu.fini && jeu.gagne === false && jeu.raison === 'contrat', 'Contrat : l’élite arrive (dorée, coriace) ; le temps passé, c’est raté'); }
  { const jeu = partie({ objectif: { type: 'contrat', cible: 'costaud', vie: 1, s: 30 }, vieMax: 1e6 }); avancer(jeu, 30); const el = jeu.zombies.find((z) => z.elite); jeu.zombies = [el]; jeu.aSortir = 0; el.x = jeu.joueurs[0].x + 4; el.z = jeu.joueurs[0].z; el.vie = 1; el.vitesse = 0; avancer(jeu, 120); check(jeu.fini && jeu.gagne === true, 'et l’élite abattue à temps : réussi'); }
  { const jeu = partie({ objectif: { type: 'generateur', n: 3 }, vieMax: 1e6 }); const g = jeu.defenses.find((d) => d.type === 'generateur'); jeu.joueurs[0].ferraille = 99; check(g && J.construire(jeu, 'moi', 'tourelle').ok, 'Générateur : il est posé au départ (et l’atelier marche)'); g.vie = 0; avancer(jeu, 5); check(jeu.fini && jeu.gagne === false && jeu.raison === 'generateur', 'le générateur détruit : raté'); }
  { const jeu = partie({ meteo: 'meteores', vieMax: 500 }); jeu.joueurs[0].vie = 500; const evs = avancer(jeu, 60 * 12, { mx: 0, mz: 0 }); check(evs.some((e) => e.t === 'alerte') && evs.some((e) => e.t === 'impact'), `Pluie de météores : annoncés, puis l’impact (${evs.filter((e) => e.t === 'impact').length} en 12 s)`); }
  { const jeu = partie({ mod: { unPV: true }, bonus: { vie: 5 } }); check(jeu.joueurs[0].vieMax === 1, 'Un seul point de vie : même avec le Bunker'); }
  { const jeu = partie({ mod: { sansAtelier: true } }); jeu.joueurs[0].ferraille = 99; check(J.construire(jeu, 'moi', 'tourelle').raison === 'regle', 'Sans atelier : on ne pose rien'); }
  { const jeu = partie({ mod: { armeRare: true } }); const a = jeu.joueurs[0].armes[1]; check(a && D.ARMES[a.id].rarete <= 10, `Arsenal : une arme rare dès le départ (${a && D.ARMES[a.id].nom})`); }
  { const jeu = partie({ vedettes: ['kamikaze'], vieMax: 1e6 }); const types = new Set(); for (let i = 0; i < 60 * 15; i++) { J.pas(jeu, { moi: { mx: 0, mz: 0 } }, PAS); for (const z of jeu.zombies) types.add(z.type); } check(jeu.vague <= 2 && types.has('kamikaze'), `les vedettes de l’échelon arrivent dès la vague ${jeu.vague} (${[...types].join(', ')})`); }
}

// ─── le défi du jour : la date donne la graine, l'arène et le mutateur ; les mutateurs ; le classement (partie pure) ───
{
  const C = require(path.join(__dirname, '..', 'src-zombies', 'classement.js'));
  const a = J.defiDu('2026-11-04'), b = J.defiDu('2026-11-04'), c = J.defiDu('2026-11-05');
  check(JSON.stringify(a) === JSON.stringify(b) && a.graine !== c.graine && D.ARENES[a.arene] && D.DEFI.mutateurs.some((m) => m.id === a.mutateur), `le même jour, le même défi pour tout le monde (${a.jour} : ${a.nom}, ${D.ARENES[a.arene].nom}) ; le lendemain, un autre`);
  const vus = new Set(), arenes = new Set(); for (let k = 0; k < 120; k++) { const d = J.defiDu(new Date(Date.UTC(2026, 0, 1 + k)).toISOString().slice(0, 10)); vus.add(d.mutateur); arenes.add(d.arene); }
  check(vus.size === D.DEFI.mutateurs.length && arenes.size === D.ORDRE_ARENES.length, `sur 120 jours, tous les mutateurs (${vus.size}) et toutes les arènes (${arenes.size}) reviennent`);
  check(D.DEFI.mutateurs.every((m) => m.nom && m.texte && (!m.arme || D.ARMES[m.arme])) && D.DEFI.mutateurs.every((m) => (m.points || 1) <= 2 && (m.nombre || 1) <= 1.5), 'chaque mutateur a son nom et son texte ; aucun ne dépasse les bornes du serveur (points ×2, nombre ×1,5)');
  const norm = J.creer({ arene: 'jardin', graine: 5, attente: 0 }), dur = J.creer({ arene: 'jardin', graine: 5, attente: 0, mod: { zVie: 1.5, zVitesse: 1.25, nombre: 1.5, points: 2, grenade: 0.4, arme: 'pompe' } });
  avancer(norm, 80); avancer(dur, 80);
  const zn = norm.zombies[0], zd = dur.zombies[0];
  check(dur.totalVague === Math.ceil(norm.totalVague * 1.5) && zd.vieMax >= zn.vieMax * 1.4 && zd.vitesse > zn.vitesse * 1.1, `les mutateurs : zombies plus nombreux (${dur.totalVague} contre ${norm.totalVague}), plus résistants, plus rapides`);
  const pd = dur.joueurs[0];
  check(pd.armes[1] && pd.armes[1].id === 'pompe' && pd.main === 1 && Math.abs(J.rechargeGrenade(pd) - D.GRENADE.recharge * 0.4) < 1e-9, 'l’arme de départ (fusil à pompe), la grenade rechargée 2,5 fois plus vite');
  const kill = (jeu) => { jeu.zombies.length = 0; jeu.serie.t = -99; jeu.zombies.push({ id: 9900, type: 'trainard', x: jeu.joueurs[0].x + 3, z: jeu.joueurs[0].z, vie: 1, vieMax: 1, vitesse: 0, rayon: 0.42, angle: 0, chemin: null, ci: 0, repense: 99, coup: 99, crache: 99, flash: 0, rx: 0, rz: 0, bouge: 0, attaque: 0, naissance: -9, coinceT: 0, coince: 0, cx: 0, cz: 0 }); return avancer(jeu, 60).find((e) => e.t === 'mort'); };
  const mn = kill(norm), md = kill(dur);
  check(mn && md && md.points === mn.points * 2, `les points ×2 (${mn && mn.points} → ${md && md.points})`);
  check(C.jourParis(Date.parse('2026-07-01T22:30:00Z')) === '2026-07-02' && C.jourParis(Date.parse('2026-12-31T22:30:00Z')) === '2026-12-31' && C.jourParis(Date.parse('2026-12-31T23:30:00Z')) === '2027-01-01', 'le jour à Paris, heure d’été (UTC+2) comme d’hiver (UTC+1)');
  check(C.lundiDe('2026-11-04') === '2026-11-02' && C.lundiDe('2026-11-02') === '2026-11-02' && C.lundiDe('2026-11-08') === '2026-11-02', 'le lundi de la semaine');
  check(C.pseudoPour('  Zoé   la <b>Brave</b> ') === 'Zoé la b Brave b' && C.pseudoPour('x') === null && C.verifierPseudo('Élodie').ok && !C.verifierPseudo('...').ok, 'les pseudos : nettoyés, trop courts ou sans lettre refusés');
  const n = C.nettoyerClassement({ jour: '2026-11-04', lundi: '2026-11-02', joueurs: 2, lignes: [{ rang: 1, pseudo: 'A', score: 10, vague: 2, parties: 1, moi: true, id: 'secret' }, null, 'x'], moi: { rang: 1, score: 10, vague: 2, parties: 1 } }, 'jour');
  check(n.ok && n.lignes.length === 1 && !('id' in n.lignes[0]) && n.moi.moi && n.moi.rang === 1, 'les réponses du serveur sont nettoyées (lignes illisibles écartées, rien d’inattendu)');
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
      while (!jeu.fini && n < 60 * 900) { if (jeu.choix) J.choisirAtout(jeu, jeu.choix.id, jeu.choix.options[0]); J.pas(jeu, { moi: bot(jeu) }, PAS); n++; if (jeu.vague !== v) { v = jeu.vague; debutVague = jeu.t; } if (jeu.phase === 'vague' && jeu.t - debutVague > 300) { bloquee = true; break; } }
      ms += Date.now() - t0; pas += n; vagues.push(jeu.vague);
    }
    check(!bloquee && vagues.every((v) => v >= 3), `${D.ARENES[id].nom} : le joueur automatique tient ${vagues.join(', ')} vagues, aucune ne reste bloquée`);
    check(ms / pas < 0.5, `${D.ARENES[id].nom} : ${(1000 * ms / pas).toFixed(0)} µs par pas de simulation (≤ 500 µs ; il en faut 60 par seconde)`);
  }
}

console.log(fails ? `\n${fails} échec(s) (Dernier Rempart)` : '\nTout passe (Dernier Rempart).');
process.exit(fails ? 1 : 0);
