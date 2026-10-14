#!/usr/bin/env node
// Opération Poncin — les robots et les réglages du salon (PBOTS, bots.js ; conception du lot Gameplay, § 8 et § 11) : la vue réduite la
// nuit (25 m) et dans le brouillard (30 m) par jeu.visibilite, la lampe d'une cible qui éclaire le robot (45 m la nuit), l'agresseur ;
// le tir allié (pas de tir si un équipier est sur la ligne) ; les seuils de vie relatifs à jeu.vieMax ; les robots restent dans une zone
// à limite v2. Sortie « ok / FAIL ».
'use strict';
const R = require('../src-poncin/regles.js'), PM = require('../src-poncin/monde.js'), PJ = require('../src-poncin/jeu.js'), PA = require('../src-poncin/arene.js'), PB = require('../src-poncin/bots.js'), PC = require('../src-poncin/carte-provisoire.js'), PC2 = require('../src-poncin/corps.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const DT = 1 / 60, f1 = (v) => (Math.round(v * 10) / 10).toString();

function cartePlate() {
  const n = 41, h = new Array(n * n).fill(0);
  return { v: 1, nom: 'Plat', source: 'test', taille: 400, relief: { pas: 10, n, h }, batiments: [], rues: [], eau: [], ponts: [], vegetation: [], arbres: [], interdit: [], noms: [], sol: null,
    zones: { arene: { centre: [0, 0], rayon: 180 }, apparitions: [[-100, -100], [100, -100], [-100, 100], [100, 100], [0, 150], [0, -150], [150, 0], [-150, 0], [60, 60], [-60, -60], [60, -60], [-60, 60]],
      armes: [{ x: 20, z: 20, arme: 'soin' }], extraction: [], base: [0, 0] } };
}
const carte = cartePlate(), monde = PM.creer(carte);
function poser(jeu, e, x, z, yaw) { e.x = x; e.z = z; e.y = jeu.monde.hauteur(x, z); e.vx = e.vz = e.vy = 0; e.auSol = true; if (yaw != null) e.yaw = yaw; e.pitch = 0; e.invincible = 0; PC2.changerPosture(e, 'debout', 0); e.accroupi = false; }
// le robot (immobile, regard au nord) voit-il h, à d m devant lui, dans les 0,4 s ?
function voit(options, d, lampeVersLui) {
  const jeu = PJ.creer({ monde, carte, mode: PA, graine: 3, options: Object.assign({ bots: 0, objets: false }, options) });
  const bot = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'fort' }), h = jeu.ajouterJoueur({ id: 'h', humain: true });
  let vu = false;
  for (let i = 0; i < 24 && !vu; i++) {
    poser(jeu, bot, 0, 60, 0); poser(jeu, h, 0, 60 - d, lampeVersLui === false ? 0 : Math.PI); // h regarde le robot (yaw π : vers le sud) ou lui tourne le dos
    jeu.etape(DT, {});
    if (bot.ia && bot.ia.cible === h && jeu.temps - bot.ia.vuA < 0.05) vu = true;
  }
  return vu;
}

titre('La vue des robots : jour, nuit, brouillard (jeu.visibilite)');
{
  check(voit({}, 40) && voit({}, 44), 'de jour, par temps clair : vu à 40 et 44 m (45 m au plus)');
  check(voit({ heure: 'nuit' }, 20, false) && !voit({ heure: 'nuit' }, 30, false), 'la nuit : vu à 20 m, pas à 30 m (25 m), lampe tournée ailleurs');
  check(voit({ heure: 'nuit' }, 40, true) && !voit({ heure: 'nuit' }, 50, true), 'la nuit, la lampe de la cible tournée vers lui : vue à 40 m (45 m), pas à 50 m');
  check(voit({ meteo: 'brouillard' }, 26) && !voit({ meteo: 'brouillard' }, 36), 'dans le brouillard : vu à 26 m, pas à 36 m (30 m)');
  check(!voit({ heure: 'nuit', meteo: 'brouillard' }, 35, true) && voit({ heure: 'nuit', meteo: 'brouillard' }, 28, true) && !voit({ heure: 'nuit', meteo: 'brouillard' }, 28, false), 'nuit et brouillard : 25 m, la lampe jusqu\'à 30 m seulement');
  check(voit({ heure: 'soir' }, 40) && voit({ meteo: 'pluie' }, 40), 'le soir et sous la pluie : la vue de jour');
  check(Math.abs(PB.COS_LAMPE - Math.cos(35 * Math.PI / 180)) < 1e-12, 'la lampe éclaire à ±35°');
}

titre('L\'agresseur la nuit : vu jusqu\'au double de la visibilité');
{
  const jeu = PJ.creer({ monde, carte, mode: PA, graine: 4, options: { bots: 0, objets: false, heure: 'nuit' } });
  const bot = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'normal' }), h = jeu.ajouterJoueur({ id: 'h', humain: true });
  poser(jeu, bot, 0, 60, 0); poser(jeu, h, 0, 100, 0); jeu.etape(DT, {});
  const out = []; jeu.blesser(bot, h, 10, false, 'ak74', out);
  let vu = false; for (let i = 0; i < 90 && !vu; i++) { poser(jeu, h, 0, bot.z + 40, 0); jeu.etape(DT, {}); if (bot.ia.cible === h && jeu.temps - bot.ia.vuA < 0.05) vu = true; }
  const jeu2 = PJ.creer({ monde, carte, mode: PA, graine: 4, options: { bots: 0, objets: false, heure: 'nuit' } });
  const b2 = jeu2.ajouterJoueur({ id: 'r', bot: true, niveau: 'normal' }), h2 = jeu2.ajouterJoueur({ id: 'h', humain: true });
  poser(jeu2, b2, 0, 60, 0); poser(jeu2, h2, 0, 100, 0); jeu2.etape(DT, {}); jeu2.blesser(b2, h2, 10, false, 'ak74', []);
  let vu2 = false; for (let i = 0; i < 90 && !vu2; i++) { poser(jeu2, h2, 0, b2.z + 60, 0); jeu2.etape(DT, {}); if (b2.ia.cible === h2 && jeu2.temps - b2.ia.vuA < 0.05) vu2 = true; }
  check(vu && !vu2, 'touché la nuit : il voit son agresseur à 40 m (≤ 50), pas à 60 m');
}

titre('Tir allié : pas de tir si un équipier est sur la ligne');
{
  const tirs = (avecAllie) => {
    const jeu = PJ.creer({ monde, carte, mode: PA, graine: 5, options: { bots: 0, objets: false, equipes: true, tirAllie: true } });
    const bot = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'fort', equipe: 0 }), ami = jeu.ajouterJoueur({ id: 'ami', humain: true, equipe: 0 }), en = jeu.ajouterJoueur({ id: 'en', humain: true, equipe: 1 });
    let n = 0;
    for (let i = 0; i < 4 * 60; i++) {
      poser(jeu, bot, 0, 60, bot.yaw); poser(jeu, en, 0, 40, 0); poser(jeu, ami, avecAllie ? 0.4 : 6, 50, 0); en.vie = 100; ami.vie = 100;
      for (const v of jeu.etape(DT, {})) if (v.t === 'tir' && v.id === 'r') n++;
    }
    return { n, touchesAmi: ami.score.morts };
  };
  const sans = tirs(false), avec = tirs(true);
  check(sans.n > 5 && avec.n === 0, `un ennemi à 20 m : ${sans.n} tirs ; le même avec un équipier à 0,4 m de la ligne : ${avec.n} tir`);
  check(PB.LIGNE_ALLIE === 1, 'la ligne de tir : 1 m de chaque côté');
}

titre('Les seuils de vie relatifs à jeu.vieMax');
{
  const fuit = (vie, vieRobot) => {
    const jeu = PJ.creer({ monde, carte, mode: PA, graine: 6, options: { bots: 0, vie } });
    const bot = jeu.ajouterJoueur({ id: 'r', bot: true, niveau: 'normal' }); jeu.ajouterJoueur({ id: 'h', humain: true });
    poser(jeu, bot, 0, 0, 0); jeu.etape(DT, {}); bot.vie = vieRobot; bot.invincible = 0;
    let f = false; for (let i = 0; i < 60 && !f; i++) { jeu.etape(DT, {}); if (bot.ia.etat === 'fuite') f = true; bot.vie = vieRobot; }
    return f;
  };
  check(fuit('costaud', 40) && !fuit('normale', 40) && fuit('normale', 20), 'fuite vers un soin sous 25 % : 40 PV sur 200 (costaud) oui, 40 sur 100 non, 20 sur 100 oui');
}

titre('Les robots restent dans une zone à limite v2');
{
  const c = PC.creer(1), m = PM.creer(c);
  for (const zone of ['rivieres', 'tout']) {
    const jeu = PJ.creer({ monde: m, carte: c, mode: PA, graine: 9, options: { bots: 5, zone, niveau: 'normal', duree: 0 } });
    const lim = jeu.zone.limite; let dehors = 0, morts = 0;
    for (let i = 0; i < 40 * 60; i++) { for (const v of jeu.etape(DT, {})) if (v.t === 'mort') morts++; for (const e of jeu.entites) if (e.vivant && (!lim.dedans(e.x, e.z) || lim.pres(e.x, e.z, 0.3))) dehors++; }
    check(PM.limiteV2(lim) && jeu.zone.id === zone && dehors === 0 && jeu.erreurs === 0, `zone « ${zone} » (limite '${lim.forme}', ${lim.n} arêtes) : 5 robots, 40 s, jamais hors de la zone, aucune erreur (${morts} éliminations)`);
  }
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
