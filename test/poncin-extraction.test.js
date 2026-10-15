#!/usr/bin/env node
// Opération Poncin — le mode Extraction (PEXTRACTION, src-poncin/extraction.js) sur la vraie carte de Poncin : réglages, zone préparée
// (coffres, le pont et la cale de la rivière, départ, coffre-fort, Gardien, largage ; réseau), gardiens (camp, postes, rondes), ouverture
// des coffres (immobile 1,2 s, coupée en bougeant ou touché), sac, sacs au sol, extraction (8 s dans le cercle, disputée), mort = perte,
// à terre et relever, fin du temps, largage, clé et coffre-fort, Gardien et renforts, poids, bruit, silencieux, lampe, signaux, formats
// ('ensemble', 'equipes', 'chacun'), pillage, prime, zone de la semaine, état réseau, rejouabilité ; puis une partie simulée complète
// (coffres ouverts, extraction réussie, dépôt au coffre personnel). L'Arène reste telle quelle (ses tests). Sortie « ok / FAIL ».
'use strict';
const S = '../src-poncin/';
const R = require(S + 'regles.js'), PM = require(S + 'monde.js'), PJ = require(S + 'jeu.js'), PX = require(S + 'extraction.js'), PZ = require(S + 'zones.js');
const B = require(S + 'butin.js'), PA = require(S + 'arene.js'), PC = require(S + 'corps.js');
const path = require('path'), fs = require('fs');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const json = (o) => JSON.stringify(o);
const X = R.MODES.extraction;

const fichier = path.join(__dirname, '..', 'poncin', 'carte', 'poncin.json');
if (!fs.existsSync(fichier)) { console.log('  FAIL carte poncin/carte/poncin.json absente'); process.exit(1); }
const carte = JSON.parse(fs.readFileSync(fichier, 'utf8')), monde = PM.creer(carte);
const DT = 1 / 60;
function creer(opts, plus) { return PJ.creer(Object.assign({ monde, carte, mode: PX, graine: 1, humains: 1, options: Object.assign({ mode: 'extraction' }, opts || {}) }, plus || {})); }
function sansRobots(jeu) { for (const e of jeu.entites.slice()) if (e.bot) jeu.retirerJoueur(e.id); return jeu; }
function libreProche(x, z, r0) { for (let r = r0 || 0.9; r < 4; r += 0.3) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!monde.bloque(px, pz, 0.4) && monde.passe(x, z, px, pz, 0.05)) return [px, pz]; } return [x, z]; }
function poser(jeu, e, x, z) { e.x = x; e.z = z; e.y = jeu.monde.hauteur(x, z); e.ax = e.x; e.az = e.z; e.vx = e.vz = e.vy = 0; e.vitesse = 0; e.auSol = true; e.pitch = 0; }
function pas(jeu, n, entrees, garder) { const tous = []; for (let i = 0; i < n && !jeu.fini; i++) { const evs = jeu.etape(DT, typeof entrees === 'function' ? entrees(i) : entrees); if (garder !== false) for (const e of evs) tous.push(e); } return tous; }
const de = (evs, t, f) => evs.filter((e) => e.t === t && (!f || f(e)));
const pres = (jeu, e, c) => { const p = libreProche(c.x, c.z); poser(jeu, e, p[0], p[1]); };
const RIEN = { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, course: false, couche: false, vise: false };

titre('Réglages (regles.js)');
{
  const N = R.normaliserReglages, n = N({ mode: 'extraction' });
  check(R.SALON.modes.join() === 'arene,extraction' && R.MODES.extraction.duree === 480 && n.mode === 'extraction' && n.zone === 'bourg' && n.duree === 480 && n.formatExtraction === 'ensemble' && n.equipes === true, 'mode extraction : bourg, 8 min, « ensemble » par défaut (equipes vrai)');
  check(N({ mode: 'extraction', duree: 180 }).duree === 480 && N({ mode: 'extraction', duree: 720 }).duree === 720 && N({ mode: 'extraction', duree: 0 }).duree === 480 && N({ mode: 'extraction', zone: 'tout' }).zone === 'tout' && N({ mode: 'arene', duree: 300 }).duree === 300, 'durées 300 / 480 / 720 (jamais sans limite) ; zone choisie ; l’Arène garde les siennes');
  check(N({ mode: 'extraction', formatExtraction: 'chacun' }).equipes === false && N({ mode: 'extraction', formatExtraction: 'equipes', equipesExtraction: 3 }).equipesExtraction === 3 && N({ mode: 'extraction', formatExtraction: 'x', equipesExtraction: 7 }).formatExtraction === 'ensemble' && N({ equipesExtraction: 7 }).equipesExtraction === 2, 'formats : chacun (equipes faux), equipes à 2 ou 3 ; inconnus → défauts');
  check(N().mode === 'arene' && N({ mode: 'jour' }).mode === 'arene' && N().zone === 'centre' && N().duree === 180, 'l’Arène par défaut, inchangée');
}

titre('La zone préparée : coffres, extractions, départ, lieux, largage');
let zoneBourg = null;
{
  const t0 = Date.now(), z = PZ.preparer(carte, monde, null, 'bourg', R.mulberry32((1 ^ 0x2F6E2B1) >>> 0), R.normaliserReglages({ mode: 'extraction' })), ms = Date.now() - t0;
  zoneBourg = z;
  const pont = z.extractions.find((e) => e.id === 'pont'), cale = z.extractions.find((e) => e.id === 'cale');
  check(pont && Math.abs(pont.x - 74.3) < 0.1 && Math.abs(pont.z - 162.1) < 0.1 && pont.nom === 'Le pont' && pont.rayon === 10, `le pont : le milieu du pont du Veyron (${pont && pont.x}, ${pont && pont.z}), cercle de 10 m`);
  const dc = cale ? Math.hypot(cale.x - pont.x, cale.z - pont.z) : 0;
  check(cale && cale.nom === 'La cale de la rivière' && dc >= 80 && monde.accessible(cale.x, cale.z) && z.limite.dedans(cale.x, cale.z), `la cale de la rivière : sur la berge (${cale && cale.x}, ${cale && cale.z}), à ${Math.round(dc)} m du pont, joignable`);
  const ddep = Math.min(...z.extractions.map((e) => Math.hypot(e.x - z.depart[0], e.z - z.depart[1])));
  check(ddep > 200 && monde.accessible(z.depart[0], z.depart[1]), `le départ loin des deux sorties (${Math.round(ddep)} m)`);
  const cnt = {}; for (const c of z.coffres) cnt[c[2]] = (cnt[c[2]] || 0) + 1;
  let ecart = Infinity; for (let i = 0; i < z.coffres.length; i++) for (let j = i + 1; j < z.coffres.length; j++) ecart = Math.min(ecart, Math.hypot(z.coffres[i][0] - z.coffres[j][0], z.coffres[i][1] - z.coffres[j][1]));
  check(z.coffres.length === 30 && cnt.legendaire === 2 && cnt.epique === 5 && cnt.rare === 8 && z.coffres.every((c) => monde.accessible(c[0], c[1]) && z.limite.dedans(c[0], c[1])) && ecart >= 7.5, `30 coffres (bourg) : ${json(cnt)}, joignables, écart ≥ ${ecart.toFixed(1)} m`);
  const fort = z.coffres.find((c) => c[3] === 'coffre-fort'), cle = z.coffres.find((c) => c[3] === 'cle');
  const lf = z.lieux.find((l) => l.id === 'coffre-fort'), lg = z.lieux.find((l) => l.id === 'gardien');
  check(fort && fort[2] === 'legendaire' && lf && lf.nom === 'Coffre-fort de la mairie' && lf.lieu === 'Hôtel de ville de Poncin' && Math.hypot(fort[0] - 80, fort[1] + 23) < 20, `le coffre-fort devant l’hôtel de ville (${fort && fort.slice(0, 2)})`);
  check(cle && cle[2] !== 'commun' && Math.hypot(cle[0] - fort[0], cle[1] - fort[1]) >= 60 && lg && Math.hypot(lg.x - fort[0], lg.z - fort[1]) <= 10.5, 'la clé dans un coffre rare ou mieux, à 60 m au moins ; le poste du Gardien à côté du coffre-fort');
  const L = z.largage;
  check(L && monde.accessible(L[0], L[1]) && Math.hypot(L[0] - z.depart[0], L[1] - z.depart[1]) >= 50 && z.coffres.every((c) => Math.hypot(c[0] - L[0], c[1] - L[1]) >= 10), `le largage : un point dégagé (${L})`);
  const leg = z.coffres.filter((c) => c[2] === 'legendaire' && !c[3]).map((c) => Math.hypot(c[0] - z.depart[0], c[1] - z.depart[1])), com = z.coffres.filter((c) => c[2] === 'commun').map((c) => Math.hypot(c[0] - z.depart[0], c[1] - z.depart[1]));
  const moy = (l) => l.reduce((s, v) => s + v, 0) / l.length;
  check(moy(leg) > moy(com), `les plus rares plus loin du départ (légendaires ${Math.round(moy(leg))} m, communs ${Math.round(moy(com))} m)`);
  const za = PZ.preparer(carte, monde, null, 'bourg', R.mulberry32((1 ^ 0x2F6E2B1) >>> 0), R.normaliserReglages({}));
  check(json(za.apparitions) === json(z.apparitions) && json(za.objets) === json(z.objets) && !za.coffres && !za.extractions, 'la même zone que l’Arène (même graine) ; l’Arène n’a ni coffres ni extractions');
  const res = PZ.pourReseau(z), lu = PZ.adopter(JSON.parse(json(res)), null);
  check(json(lu.coffres) === json(z.coffres) && json(lu.extractions) === json(z.extractions) && json(lu.depart) === json(z.depart) && json(lu.lieux) === json(z.lieux) && json(lu.largage) === json(z.largage) && json(res).length < 6000, `réseau : pourReseau / adopter gardent coffres, extractions, départ, lieux, largage (${json(res).length} o)`);
  check(ms < 1500, `préparée en ${ms} ms`);
  const zt = PZ.preparer(carte, monde, null, 'tout', R.mulberry32(3), R.normaliserReglages({ mode: 'extraction', zone: 'tout' }));
  const zc = PZ.preparer(carte, monde, null, 'centre', R.mulberry32(3), R.normaliserReglages({ mode: 'extraction', zone: 'centre' }));
  check(zt.coffres.length === 40 && zt.extractions.map((e) => e.id).join() === 'pont,cale' && zc.coffres.length === 20 && zc.extractions.length === 2 && zc.extractions.every((e) => /^Sortie /.test(e.nom)) && Math.hypot(zc.extractions[0].x - zc.extractions[1].x, zc.extractions[0].z - zc.extractions[1].z) > 40,
    `'tout' : 40 coffres, le pont et la cale ; 'centre' (sans pont) : repli, deux sorties nommées par leur rue (${zc.extractions.map((e) => e.nom).join(', ')})`);
}

titre('Mise en place et gardiens');
{
  const jeu = creer({ niveau: 'normal' });
  const A = jeu.extraction, bots = jeu.entites.filter((e) => e.bot), boss = bots.find((e) => e.boss);
  check(jeu.erreurs === 0 && jeu.duree === 480 && A.coffres.length === 30 && A.extractions.length === 2 && A.ouvreA === 240 && A.largage && A.largage.A === 270, `jeu créé : 8 min, 30 coffres, extractions à 4 min, largage à 4 min 30 (${jeu.erreurs} erreur)`);
  check(bots.length >= 10 && bots.length <= X.gardiens.plafond && bots.every((e) => e.equipe === 'gardiens' && e.garde) && !jeu.peutBlesser(bots[0], bots[1]), `${bots.length} gardiens, tous dans le camp 'gardiens' (ils ne se blessent pas)`);
  check(boss && boss.id === 'gardien' && boss.vie === 600 && boss.armure === 50 && boss.boss.vieMax === 600 && boss.ralenti === 0.3 && boss.niveau === 'fort', 'le Gardien : vie × 6 (600), armure pleine, 30 % plus lent, niveau fort, e.boss = { nom, vieMax }');
  check(bots.filter((e) => e.garde.ronde).length >= 2 && json(A.robots.map((r) => r.id)) === json(bots.map((e) => e.id)) && jeu.arene.robots === A.robots, 'des patrouilles sur une ronde ; la liste des robots (jeu.arene.robots, pour le message « lancer »)');
  const moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi', ameliorations: { sac: 2, armure: 2, chargeur: 1, ouverture: 1 } });
  check(moi.equipe === 0 && moi.sac.cases === 12 && moi.armure === 30 && moi.reserve.ak74 === 150 && moi.dureeOuverture === 1.0 && Math.hypot(moi.x - A.depart[0], moi.z - A.depart[1]) < 1, 'le joueur : au départ, sac de 12 cases, armure 30, un chargeur de plus, ouverture en 1 s (ses améliorations)');
  const posts = bots.map((e) => [e.x, e.z]);
  pas(sansRobots(creer()), 1); // (une autre partie, pour vérifier que retirer ne casse rien)
  const evs = pas(jeu, 60 * 20, { moi: RIEN }); // le joueur reste au départ, loin de tout
  const fixes = bots.filter((e) => !e.garde.ronde && !e.boss), loin = fixes.filter((e) => Math.hypot(e.x - e.garde.x, e.z - e.garde.z) > 6);
  const rondes = bots.filter((e) => e.garde.ronde), bouge = rondes.filter((e, i) => Math.hypot(e.x - posts[bots.indexOf(e)][0], e.z - posts[bots.indexOf(e)][1]) > 5);
  check(jeu.erreurs === 0 && loin.length === 0 && bouge.length >= 1 && de(evs, 'tir').length === 0, `en 20 s sans ennemi : les gardiens restent à leur poste (${fixes.length}), les patrouilles marchent (${bouge.length}/${rondes.length}), personne ne tire`);
}

{
  // la laisse : un gardien poursuit un joueur vu, puis retourne à son poste quand il s'en est trop éloigné
  const jeu = creer({ niveau: 'normal' }, { graine: 2 });
  const g = jeu.entites.find((e) => e.bot && !e.boss && !e.garde.ronde);
  for (const e of jeu.entites.slice()) if (e.bot && e !== g) jeu.retirerJoueur(e.id);
  const moi = jeu.ajouterJoueur({ id: 'moi' }); moi.invincible = 1e9;
  // un point en vue à ~12 m ; le joueur le touche (le gardien le voit et le poursuit), puis s'enfuit très loin (au départ)
  let p = null; for (let k = 0; k < 32 && !p; k++) { const a = k * Math.PI / 16, x = g.x + Math.cos(a) * 12, z = g.z + Math.sin(a) * 12; if (!monde.bloque(x, z, 0.5) && monde.accessible(x, z) && monde.vue(g.x, g.y + 1.6, g.z, x, monde.hauteur(x, z) + 1.2, z)) p = [x, z]; }
  poser(jeu, moi, p[0], p[1]); jeu.blesser(g, moi, 1, false, 'ak74', []);
  let vu = false; for (let i = 0; i < 60 * 3 && !vu; i++) { jeu.etape(DT, { moi: RIEN }); vu = !!(g.ia && g.ia.cible === moi); }
  pas(jeu, 60, { moi: Object.assign({}, RIEN, { avant: 1, course: true }) });
  const loin = jeu.extraction.depart; poser(jeu, moi, loin[0], loin[1]);
  let dmax = 0, partie = 0; for (let i = 0; i < 60 * 45; i++) { jeu.etape(DT, { moi: RIEN }); const d = Math.hypot(g.x - g.garde.x, g.z - g.garde.z); dmax = Math.max(dmax, d); if (i === 60 * 4) partie = d; }
  const dfin = Math.hypot(g.x - g.garde.x, g.z - g.garde.z);
  check(vu && dmax <= g.garde.laisse + 12 && dfin < 4, `la laisse : il voit l'agresseur, le poursuit (${partie.toFixed(0)} m de son poste, ${dmax.toFixed(0)} au plus ; laisse ${g.garde.laisse} m), puis revient (${dfin.toFixed(1)} m)`);
}

titre('Ouvrir un coffre');
{
  const jeu = sansRobots(creer()), A = jeu.extraction, moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi' });
  const c = A.coffres.find((q) => q.rarete === 'rare' && !q.special);
  pres(jeu, moi, c); moi.invincible = 0;
  let evs = pas(jeu, 30, { moi: RIEN });
  const debut = de(evs, 'ouverture', (e) => e.etat === 'debut' && e.quoi === 'coffre');
  check(debut.length === 1 && moi.interaction && moi.interaction.cible === c.id && moi.interaction.prog > 0.3 && !c.ouvert, 'immobile à côté : l’ouverture commence (jauge e.interaction.prog)');
  const avance = { avant: 1, cote: 0, dyaw: 0, dpitch: 0, tir: false, course: false, couche: false, vise: false };
  evs = pas(jeu, 6, { moi: avance });
  check(de(evs, 'ouverture', (e) => e.etat === 'coupe').length === 1 && !moi.interaction && !c.ouvert, 'on bouge : coupée');
  pres(jeu, moi, c); pas(jeu, 20, { moi: RIEN });
  jeu.blesser(moi, null, 5, false, 'ak74', []); evs = pas(jeu, 1, { moi: RIEN });
  check(de(evs, 'ouverture', (e) => e.etat === 'coupe').length === 1 && !c.ouvert, 'touché : coupée');
  const bruits0 = jeu.nBruits;
  evs = pas(jeu, 90, { moi: RIEN });
  const ev = de(evs, 'coffre')[0], vals = c.contenu.filter((o) => o.type === 'valeur').map((o) => o.id);
  check(ev && ev.id === c.id && c.ouvert && c.par === 'moi' && vals.every((id) => moi.sac.objets.indexOf(id) >= 0) && de(evs, 'butin', (e) => e.quoi === 'valeur').length === vals.length, `1,2 s immobile : ouvert ; les objets de valeur dans le sac (${vals.join(', ')})`);
  const bruit = jeu.bruits.find((b) => b.e === moi && b.portee === X.bruits.ouvrir);
  check(jeu.nBruits > bruits0 && !!bruit, 'ouvrir fait du bruit (18 m : les robots l’entendent)');
  const armes = c.contenu.filter((o) => o.type === 'arme');
  check(armes.length === A.objets.filter((o) => R.OBJETS[o.objet].type === 'arme').length && A.objets.every((o) => o.unique && Math.hypot(o.x - moi.x, o.z - moi.z) > 1.3), `l’arme du coffre (${armes.length}) posée à côté, hors de portée sans le vouloir ; objets uniques`);
  check(moi.butin.coffres === 1 && moi.butin.coffresPar.rare === 1 && moi.butin.killsRobots === 0, 'les comptes du joueur (coffres par rareté)');
  // un coffre commun dont les consommables ne servent pas : rangés dans le sac
  const c2 = A.coffres.find((q) => q.rarete === 'commun' && q.contenu.some((o) => o.type !== 'valeur'));
  pres(jeu, moi, c2); moi.interaction = null; const avant = moi.sac.objets.length; pas(jeu, 90, { moi: RIEN });
  check(c2.ouvert && moi.sac.objets.length > avant && moi.sac.objets.some((id) => B.CONSOMMABLES[id]), 'les consommables qui ne servent pas tout de suite vont dans le sac');
  moi.vie = 40; const iS = moi.sac.objets.findIndex((id) => id === 'soin'), iM = moi.sac.objets.findIndex((id) => id === 'munitions');
  if (iS >= 0) { evs = pas(jeu, 1, { moi: Object.assign({}, RIEN, { utiliser: iS }) }); check(moi.vie === 90 && de(evs, 'butin', (e) => e.utilise).length === 1, 'en.utiliser : le soin du sac'); }
  else if (iM >= 0) { moi.reserve.ak74 = 0; evs = pas(jeu, 1, { moi: Object.assign({}, RIEN, { utiliser: iM }) }); check(moi.reserve.ak74 === 120 && de(evs, 'butin', (e) => e.utilise).length === 1, 'en.utiliser : les munitions du sac'); }
  else check(false, 'un consommable dans le sac');
  // lâcher : un sac au sol, pas repris tant qu'on ne s'en est pas éloigné
  const n0 = moi.sac.objets.length, id0 = moi.sac.objets[0];
  evs = pas(jeu, 1, { moi: Object.assign({}, RIEN, { lacher: 0 }) });
  const s = A.sacs[A.sacs.length - 1];
  pas(jeu, 60, { moi: RIEN });
  check(moi.sac.objets.length === n0 - 1 && s.objets[0] === id0 && s.dispo && de(evs, 'sac', (e) => e.quoi === 'pose').length === 1, 'en.lacher : l’objet tombe dans un sac au sol, pas repris sur place');
  poser(jeu, moi, s.x + 3, s.z); pas(jeu, 2, { moi: RIEN }); poser(jeu, moi, s.x + 0.5, s.z); evs = pas(jeu, 50, { moi: RIEN });
  check(!s.dispo && moi.sac.objets.indexOf(id0) >= 0 && de(evs, 'sac', (e) => e.quoi === 'vide').length === 1, 'revenu après s’en être éloigné : ramassé en 0,5 s');
  // le poids
  moi.sac = B.sacVide(16); for (const id of ['tresor', 'lingot', 'calice', 'statuette', 'cuivre', 'pendule']) B.ajouter(moi.sac, id); pas(jeu, 1, { moi: RIEN });
  const v0 = PC.vitesseMax(Object.assign({}, moi, { ralenti: 0 }), R.arme(moi.arme)), v1 = PC.vitesseMax(moi, R.arme(moi.arme));
  check(Math.abs(moi.ralenti - 0.2) < 1e-9 && Math.abs(v1 / v0 - 0.8) < 1e-6, `le poids : ${B.casesDe(moi.sac.objets)} cases → −20 % (borné) ; vitesse ${v0.toFixed(2)} → ${v1.toFixed(2)} m/s`);
  moi.sac.objets = ['tresor', 'lingot']; pas(jeu, 1, { moi: RIEN });
  check(Math.abs(moi.ralenti - 0.025) < 1e-9, '5 cases : −2,5 %');
}

titre('Extraction, mort = perte, fin du temps');
{
  const jeu = sansRobots(creer()), A = jeu.extraction, moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi' });
  B.ajouter(moi.sac, 'lingot'); B.ajouter(moi.sac, 'montre');
  const p = A.extractions[0]; poser(jeu, moi, p.x, p.z);
  let evs = pas(jeu, 60 * 9, { moi: RIEN });
  check(de(evs, 'extrait').length === 0 && !A.ouvertes, 'avant la mi-partie : le cercle ne fait rien');
  A.ouvreA = jeu.temps + 0.05; evs = pas(jeu, 10, { moi: RIEN });
  check(A.ouvertes && de(evs, 'extractions').length === 1 && de(evs, 'extractions')[0].points.length === 2 && de(evs, 'annonce', (e) => /Extractions ouvertes : le pont et la cale/.test(e.texte)).length === 1, 'à mi-partie : extractions ouvertes (événement + annonce)');
  evs = pas(jeu, 60 * 4, { moi: RIEN });
  jeu.blesser(moi, null, 5, false, 'ak74', []); evs = evs.concat(pas(jeu, 1, { moi: RIEN }));
  check(moi.sortie < 0.1 && !moi.extrait && de(evs, 'ouverture', (e) => e.quoi === 'extraction' && e.etat === 'coupe').length === 1, 'touché dans le cercle : les 8 s repartent de zéro');
  evs = pas(jeu, 60 * 8 + 5, { moi: RIEN });
  const ex = de(evs, 'extrait')[0];
  check(ex && ex.id === 'moi' && ex.point === p.id && ex.valeur === 365 && moi.extrait && !moi.vivant, `8 s sans être touché : extrait par ${p.nom} avec ${ex && ex.valeur} pièces`);
  pas(jeu, 60 * 3, { moi: RIEN });
  const r = PX.resultat(jeu), l = r.extraction.joueurs[0];
  check(jeu.fini && l.extrait && l.valeur === 365 && l.objets.join() === 'lingot,montre' && l.score === 365 && r.gagnant === 'moi', 'plus personne dans la partie : finie ; le résultat (extrait, valeur, objets, score)');
  const dp = B.deposer(B.coffreVide(), l);
  check(dp.gain === 365 && dp.coffre.pieces === 365 && dp.coffre.extractions === 1 && dp.record, 'déposé au coffre personnel : +365 pièces, record');
}
{
  const jeu = sansRobots(creer()), A = jeu.extraction, moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi' });
  B.ajouter(moi.sac, 'bijoux'); moi.cle = true; moi.invincible = 0; const x = moi.x, z = moi.z;
  const evs = []; jeu.blesser(moi, null, 1000, false, 'ak74', evs); pas(jeu, 2, { moi: RIEN });
  const s = A.sacs[0];
  check(de(evs, 'perdu').length === 1 && de(evs, 'perdu')[0].valeur === 120 && de(evs, 'elimine').length === 1 && moi.elimine && moi.sac.objets.length === 0 && s && s.objets[0] === 'bijoux' && s.cle && s.de === 'moi' && Math.hypot(s.x - x, s.z - z) < 0.5, 'seul, mort : éliminé ; le sac (et la clé) tombe au sol (de: moi)');
  pas(jeu, 150, { moi: RIEN });
  const l = PX.resultat(jeu).extraction.joueurs[0];
  check(jeu.fini && !l.extrait && l.valeur === 0 && l.perdu.join() === 'bijoux' && l.valeurPerdue === 120 && l.score === 0 && B.deposer(null, l).gain === 0, 'mort = perte : rien d’extrait, la partie finit');
}
{
  const jeu = sansRobots(creer()), moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi' });
  B.ajouter(moi.sac, 'lingot'); jeu.duree = jeu.temps + 0.5;
  const evs = pas(jeu, 60, { moi: RIEN });
  check(jeu.fini && de(evs, 'perdu', (e) => e.raison === 'temps' && e.valeur === 320).length === 1 && moi.perdu && de(evs, 'annonce', (e) => e.texte === 'Temps écoulé !').length === 1, 'fin du temps : pas sorti, on perd ce qu’on porte');
}

titre('En équipe : à terre, relever, ramasser le sac d’un équipier');
{
  const jeu = sansRobots(creer({}, null)), A = jeu.extraction;
  const a = jeu.ajouterJoueur({ id: 'a', nom: 'Anne' }), b = jeu.ajouterJoueur({ id: 'b', nom: 'Bob' });
  check(a.equipe === 0 && b.equipe === 0 && !jeu.peutBlesser(a, b) && Math.hypot(a.x - b.x, a.z - b.z) < 5 && Math.hypot(a.x - b.x, a.z - b.z) > 0.5, '« ensemble » : même équipe, même départ (côte à côte), pas de tir allié');
  B.ajouter(b.sac, 'lingot'); a.invincible = b.invincible = 0;
  let evs = []; jeu.blesser(b, null, 1000, false, 'ak74', evs); evs = evs.concat(pas(jeu, 1, {}));
  check(b.aTerre && !b.elimine && de(evs, 'a-terre').length === 1 && A.sacs.length === 1 && A.sacs[0].de === 'b', 'un équipier en jeu : à terre (30 s), son sac au sol');
  poser(jeu, a, b.x + 1.2, b.z); a.interaction = null;
  evs = pas(jeu, 60 * 4 + 10, { a: RIEN });
  check(!b.aTerre && b.vivant && b.vie === 30 && de(evs, 'releve').length === 1, 'relevé en 4 s à côté (30 % de vie)');
  const s = A.sacs[0]; poser(jeu, a, s.x + 0.5, s.z); evs = pas(jeu, 40, { a: RIEN, b: RIEN });
  check(a.sac.objets.indexOf('lingot') >= 0 && !s.dispo && de(evs, 'butin', (e) => e.de === 'b').length === 1, 'l’équipier ramasse le sac (pour lui)');
  poser(jeu, a, a.x + 30, a.z); b.invincible = 0; evs = []; jeu.blesser(b, null, 1000, false, 'ak74', evs); evs = pas(jeu, 60 * 31, {}); // a s'éloigne
  check(b.elimine && de(evs, 'elimine', (e) => e.id === 'b').length === 1, 'pas relevé dans les 30 s : éliminé');
}

titre('Largage, clé et coffre-fort, Gardien');
{
  const jeu = creer(), A = jeu.extraction, moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi' });
  for (const e of jeu.entites.slice()) if (e.bot && !e.boss) jeu.retirerJoueur(e.id);
  moi.invincible = 1e9;
  A.largage.A = jeu.temps + 16; const nR = jeu.entites.filter((e) => e.bot).length;
  let evs = pas(jeu, 60 * 2, { moi: RIEN });
  check(de(evs, 'largage', (e) => e.quoi === 'annonce').length === 1 && !A.largage.tombe, 'le largage annoncé 15 s avant (position)');
  evs = pas(jeu, 60 * 15, { moi: RIEN });
  const lt = de(evs, 'largage', (e) => e.quoi === 'tombe')[0];
  check(lt && A.coffres[A.coffres.length - 1].id === 'largage' && ['epique', 'legendaire'].indexOf(lt.rarete) >= 0 && Math.hypot(lt.x - A.largage.x, lt.z - A.largage.z) < 0.1, `la caisse tombe (${lt && lt.rarete}) : un coffre de plus`);
  evs = pas(jeu, 60 * 21, { moi: RIEN });
  const rf = de(evs, 'renforts', (e) => e.quoi === 'largage')[0];
  check(rf && rf.robots.length === 2 && jeu.entites.filter((e) => e.bot).length === nR + 2 && rf.robots.every((r) => r.garde && r.garde.arrivee && Math.hypot(r.garde.x - A.largage.x, r.garde.z - A.largage.z) < 7), 'deux gardiens arrivent 20 s après (de 35–50 m, vers la caisse)');
  // la clé et le coffre-fort
  for (const e of jeu.entites.slice()) if (e.bot && !e.boss) jeu.retirerJoueur(e.id);
  const fort = A.coffres.find((c) => c.special === 'coffre-fort'), cle = A.coffres.find((c) => c.special === 'cle');
  pres(jeu, moi, fort); moi.interaction = null; evs = pas(jeu, 60 * 2, { moi: RIEN });
  check(fort.verrou && !fort.ouvert && de(evs, 'verrou').length === 1 && !moi.interaction, 'le coffre-fort sans la clé : verrouillé (événement « verrou »)');
  pres(jeu, moi, cle); moi.interaction = null; evs = pas(jeu, 90, { moi: RIEN });
  check(cle.ouvert && moi.cle && de(evs, 'cle', (e) => e.quoi === 'trouvee').length === 1, 'la clé trouvée dans un coffre rare ou mieux');
  moi.sac.objets = []; pres(jeu, moi, fort); moi.interaction = null;
  evs = pas(jeu, 60 * 3, { moi: RIEN });
  check(!fort.ouvert && moi.interaction && moi.interaction.duree === 4, 'avec la clé : 4 s pour l’ouvrir');
  evs = evs.concat(pas(jeu, 60 * 1.2, { moi: RIEN }));
  check(fort.ouvert && moi.sac.objets.indexOf('tresor') >= 0 && !moi.cle && de(evs, 'cle', (e) => e.quoi === 'utilisee').length === 1 && jeu.bruits.some((b) => b.e === moi && b.portee === X.bruits.coffreFort), 'ouvert : le trésor de la mairie dans le sac, la clé utilisée (et du bruit, 30 m)');
  // le Gardien : renforts à 50 %
  const g = jeu.trouver('gardien'), n0 = jeu.entites.filter((e) => e.bot).length;
  g.armure = 0; jeu.blesser(g, moi, 290, false, 'ak74', []); evs = pas(jeu, 1, { moi: RIEN });
  check(de(evs, 'renforts', (e) => e.quoi === 'boss').length === 0, 'le Gardien à 51 % : pas encore de renforts');
  jeu.blesser(g, moi, 20, false, 'ak74', []); evs = pas(jeu, 1, { moi: RIEN });
  check(de(evs, 'renforts', (e) => e.quoi === 'boss').length === 1 && jeu.entites.filter((e) => e.bot).length === n0 + 2 && g.boss.renforts, 'à 50 % : il appelle des renforts (2 en normal), une seule fois');
  const evm = []; jeu.blesser(g, moi, 1000, false, 'ak74', evm);
  check(!g.vivant && moi.butin.boss && moi.butin.killsRobots === 1 && moi.score.points === 100, 'le Gardien abattu : 100 points');
}

titre('Bruit, silencieux, lampe, signaux');
{
  const jeu = sansRobots(creer({ heure: 'nuit' })), A = jeu.extraction, moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi' });
  const tir = Object.assign({}, RIEN, { tir: true });
  moi.prochainTir = 0; pas(jeu, 1, { moi: tir });
  check(jeu.bruits.some((b) => b.e === moi && b.portee === 30), 'un tir s’entend à 30 m');
  moi.silencieux = moi.arme; jeu.nBruits = 0; for (const b of jeu.bruits) b.e = null;
  pas(jeu, 20, { moi: RIEN }); moi.prochainTir = 0; pas(jeu, 1, { moi: tir });
  check(jeu.bruits.some((b) => b.e === moi && b.portee === X.bruits.tirSilencieux) && !jeu.bruits.some((b) => b.e === moi && b.portee === 30), 'au silencieux : à 8 m seulement');
  check(jeu.lampes && moi.lampe, 'la nuit : la lampe allumée au départ');
  let evs = pas(jeu, 1, { moi: Object.assign({}, RIEN, { lampe: true }) });
  check(!moi.lampe && de(evs, 'lampe', (e) => e.allumee === false).length === 1, 'en.lampe : éteinte (les robots ne la voient plus de loin)');
  pas(jeu, 1, { moi: Object.assign({}, RIEN, { lampe: true }) });
  check(moi.lampe, 'rallumée');
  const autre = jeu.ajouterJoueur({ id: 'b', nom: 'Bob' });
  evs = [];
  for (let k = 0; k < 4; k++) evs = evs.concat(pas(jeu, 1, { moi: Object.assign({}, RIEN, { signal: { type: ['coffre', 'ennemi', 'sortie', 'ici'][k], x: moi.x + k, y: moi.y, z: moi.z } }) }));
  const sg = de(evs, 'signal');
  check(sg.length === 4 && sg.every((e) => e.equipe === 0 && e.de === 'moi' && e.duree === 12) && A.signaux.length === 3 && A.signaux[0].type === 'ennemi' && PX.signauxPour(jeu, 'b').length === 3, 'signaux : 3 au plus par joueur (le plus ancien remplacé), visibles des équipiers');
  pas(jeu, 1, { moi: Object.assign({}, RIEN, { signal: { type: 'bombe', x: 0, z: 0 } }) }); pas(jeu, 1, { moi: Object.assign({}, RIEN, { signal: { type: 'ici', x: 'a' } }) });
  check(A.signaux.length === 3 && jeu.erreurs === 0, 'un signal inconnu ou abîmé : ignoré, sans erreur');
  pas(jeu, 60 * 12.5, {});
  check(A.signaux.length === 0, 'au bout de 12 s, ils disparaissent');
  const solo = sansRobots(creer({ formatExtraction: 'chacun' })), s1 = solo.ajouterJoueur({ id: 's1' }), s2 = solo.ajouterJoueur({ id: 's2' });
  pas(solo, 1, { s1: Object.assign({}, RIEN, { signal: { type: 'ici', x: s1.x, z: s1.z } }) });
  check(PX.signauxPour(solo, 's1').length === 1 && PX.signauxPour(solo, 's2').length === 0 && solo.erreurs === 0, 'chacun pour soi : un signal ne sert qu’à soi (sans erreur)');
}

titre('Formats : équipes rivales, chacun pour soi ; pillage, prime, sortie disputée');
{
  const jeu = sansRobots(creer({ formatExtraction: 'equipes', equipesExtraction: 2 }, { humains: 4 })), A = jeu.extraction;
  const hs = ['a', 'b', 'c', 'd'].map((id) => jeu.ajouterJoueur({ id, nom: id.toUpperCase() })); for (const e of hs) e.invincible = 0;
  const eqs = hs.map((e) => e.equipe);
  check(A.format === 'equipes' && eqs.filter((q) => q === 0).length === 2 && eqs.filter((q) => q === 1).length === 2, `'equipes' à 2 : répartition équilibrée (${eqs.join(', ')})`);
  const [a, b] = [hs.find((e) => e.equipe === 0), hs.find((e) => e.equipe === 1)], a2 = hs.find((e) => e.equipe === 0 && e !== a);
  check(jeu.peutBlesser(a, b) && !jeu.peutBlesser(a, a2) && Math.hypot(a.x - b.x, a.z - b.z) > 40 && Math.hypot(a.x - a2.x, a.z - a2.z) < 5, 'équipes rivales : on se blesse entre équipes, pas entre équipiers ; un départ par équipe');
  const j3 = sansRobots(creer({ formatExtraction: 'equipes', equipesExtraction: 3 }, { humains: 5 })), e3 = [0, 1, 2, 3, 4].map((k) => j3.ajouterJoueur({ id: 'p' + k }).equipe);
  check(json(e3) === '[0,1,2,0,1]' && j3.ajouterJoueur({ id: 'q', equipe: 2 }).equipe === 2, `à 3 équipes : ${e3.join(', ')} (une équipe demandée est gardée)`);
  const jt = sansRobots(creer({ formatExtraction: 'equipes', tirAllie: true }, { humains: 2 })), t1 = jt.ajouterJoueur({ id: 't1', equipe: 0 }), t2 = jt.ajouterJoueur({ id: 't2', equipe: 0 });
  check(jt.peutBlesser(t1, t2), 'le tir allié (réglage) s’applique à l’intérieur d’une équipe');
  // la prime, le pillage
  B.ajouter(b.sac, 'lingot'); B.ajouter(b.sac, 'cerdon');
  A.prime.prochainA = jeu.temps; let evs = pas(jeu, 2, {});
  const pr = de(evs, 'prime', (e) => e.quoi === 'revele')[0];
  check(pr && pr.id === b.id && pr.valeur === 334 && pr.prime === 84 && Math.hypot(pr.x - b.x, pr.z - b.z) < 0.5 && de(evs, 'annonce', (e) => /Prime de 84/.test(e.texte)).length === 1, `le plus riche révélé à tous (${pr && pr.valeur} pièces : prime ${pr && pr.prime})`);
  evs = []; jeu.blesser(b, a, 1000, false, 'ak74', evs);
  check(de(evs, 'prime', (e) => e.quoi === 'gagnee' && e.id === a.id && e.prime === 84).length === 1 && a.butin.primes === 84 && a.butin.killsJoueurs === 1 && a.score.points === 25 && A.prime.id === null, 'l’éliminer : la prime au tueur (en attente), 25 points');
  const s = A.sacs.find((q) => q.de === b.id);
  poser(jeu, a, s.x + 0.4, s.z); a.interaction = null; evs = pas(jeu, 40, {});
  check(a.sac.objets.indexOf('lingot') >= 0 && !s.dispo && de(evs, 'butin', (e) => e.id === a.id && e.de === b.id).length >= 1, 'piller le rival : son sac ramassé');
  // la sortie disputée : a et un autre rival dans le cercle ; le rival touché repart de zéro, a sort
  const c = hs.find((e) => e.equipe === 1 && e !== b), P = A.extractions[1];
  A.ouvreA = jeu.temps; poser(jeu, a, P.x + 2, P.z); poser(jeu, c, P.x - 2, P.z); a.interaction = c.interaction = null;
  pas(jeu, 60 * 5, {});
  const sc = c.sortie; jeu.blesser(c, a, 5, false, 'ak74', []); evs = pas(jeu, 60 * 3 + 10, {});
  check(sc > 4 && de(evs, 'extrait', (e) => e.id === a.id).length === 1 && !c.extrait && c.sortie < 3.5, `sortie disputée : deux dans le cercle ; le rival touché repart de zéro (${sc.toFixed(1)} → ${c.sortie.toFixed(1)} s), l’autre sort`);
  const l = PX.resultat(jeu).extraction.joueurs.find((q) => q.id === a.id);
  check(l.extrait && l.primes === 84 && l.primesGagnees === 84 && l.killsJoueurs === 1 && l.killsRobots === 0 && l.format === 'equipes' && l.score === l.valeur + 25 + 84 && B.deposer(null, l).gain === l.valeur + 84, `le résultat : valeur ${l.valeur}, éliminations (robots / joueurs), prime versée (sorti), format`);
  pas(jeu, 2, {});
  const r = PX.resultat(jeu);
  check(r.extraction.equipes.length === 2 && r.extraction.equipes[0].score >= l.score && r.gagnant === 0 && r.scores.length === 2, 'les équipes : scores additionnés, l’équipe gagnante');
}
{
  const jeu = sansRobots(creer({ formatExtraction: 'chacun' }, { humains: 3 })), A = jeu.extraction;
  const hs = ['a', 'b', 'c'].map((id) => jeu.ajouterJoueur({ id, nom: id.toUpperCase() })); for (const e of hs) e.invincible = 0;
  let dmin = Infinity; for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) dmin = Math.min(dmin, Math.hypot(hs[i].x - hs[j].x, hs[i].z - hs[j].z));
  check(hs.every((e) => e.equipe === e.id) && jeu.peutBlesser(hs[0], hs[1]) && dmin >= 40, `'chacun' : chacun son camp, des départs écartés (${Math.round(dmin)} m au moins)`);
  const [a, b, c] = hs; B.ajouter(b.sac, 'bijoux'); B.ajouter(b.sac, 'ecus');
  A.prime.prochainA = jeu.temps; let evs = pas(jeu, 2, {});
  check(de(evs, 'prime', (e) => e.quoi === 'revele' && e.id === 'b').length === 1, 'la prime en chacun pour soi');
  evs = []; jeu.blesser(b, c, 1000, false, 'ak74', evs);
  check(b.elimine && !b.aTerre && c.butin.primes === 63, 'chacun pour soi : pas d’équipier, éliminé tout de suite ; la prime à c');
  const s = A.sacs.find((q) => q.de === 'b'); poser(jeu, a, s.x + 0.4, s.z); a.interaction = null; pas(jeu, 40, {});
  check(a.sac.objets.length === 2 && !s.dispo, 'un autre pille le sac');
  jeu.duree = jeu.temps + 0.2; pas(jeu, 30, {});
  const l = PX.resultat(jeu).extraction.joueurs.find((q) => q.id === 'c');
  check(jeu.fini && !l.extrait && l.primesGagnees === 63 && l.primes === 0 && B.deposer(null, l).gain === 0, 'pas sorti : la prime n’est pas versée');
}

titre('Zone de la semaine, état réseau, rejouabilité');
{
  let ms = Date.parse('2026-10-19T12:00:00+02:00'); for (let k = 0; k < 4 && B.zoneDeLaSemaine(ms) !== 'bourg'; k++) ms += 7 * 86400000;
  const jeu = sansRobots(creer({}, { maintenant: ms })), jeu2 = sansRobots(creer({ zone: 'centre' }, { maintenant: ms }));
  const r1 = PX.resultat(jeu), r2 = PX.resultat(jeu2);
  check(B.zoneDeLaSemaine(ms) === 'bourg' && r1.extraction.zoneSemaine === true && r2.extraction.zoneSemaine === false && PX.resultat(sansRobots(creer())).extraction.zoneSemaine === false, 'zoneSemaine : vrai dans la zone de la semaine (jeu.maintenant), faux ailleurs ou sans heure');
  const moi = jeu.ajouterJoueur({ id: 'moi' }); B.ajouter(moi.sac, 'lingot'); jeu.extraction.ouvreA = 0; const P = jeu.extraction.extractions[0]; poser(jeu, moi, P.x, P.z); pas(jeu, 60 * 9, { moi: RIEN });
  const l = PX.resultat(jeu).extraction.joueurs[0];
  check(l.zoneSemaine && B.deposer(null, l).gain === 400, 'versé au coffre : +25 % (320 → 400)');
}
{
  const hote = creer({}, { graine: 9 }), A = hote.extraction, moi = hote.ajouterJoueur({ id: 'moi' });
  const c = A.coffres.find((q) => !q.special && q.rarete === 'commun'); pres(hote, moi, c); moi.invincible = 1e9; pas(hote, 90, { moi: RIEN });
  const ev = []; hote.blesser(moi, null, 1e4, false, 'ak74', ev); // ne meurt pas (invincible)
  moi.invincible = 0; hote.blesser(moi, null, 1e4, false, 'ak74', ev); pas(hote, 1, {});
  const et = PX.etat(hote), taille = json(et).length;
  const facade = PJ.creer({ monde, carte, mode: PX, graine: 9, humains: 1, options: hote.reglages, zone: PZ.pourReseau(hote.zone), robots: hote.arene.robots, nav: false });
  const fm = facade.ajouterJoueur({ id: 'moi' });
  check(facade.entites.filter((e) => e.bot).length === hote.entites.filter((e) => e.bot).length && facade.trouver('gardien').boss && facade.extraction.coffres.length === A.coffres.length && json(facade.extraction.coffres.map((q) => q.contenu)) === json(A.coffres.map((q) => q.contenu)), 'la façade : mêmes coffres (même contenu), mêmes robots (le Gardien compris)');
  PX.lireEtat(facade, JSON.parse(json(et)));
  check(facade.extraction.coffres.filter((q) => q.ouvert).length === 1 && facade.extraction.sacs.filter((q) => q.dispo).length === A.sacs.filter((q) => q.dispo).length && fm.elimine && taille < 1500, `PEXTRACTION.etat / lireEtat : coffres ouverts, sacs au sol, état des joueurs (${taille} o)`);
}
{
  const jouer = () => {
    const jeu = creer({ niveau: 'fort' }, { graine: 4 }), moi = jeu.ajouterJoueur({ id: 'moi' }), A = jeu.extraction;
    const cible = A.coffres.slice().sort((a, b) => Math.hypot(a.x - moi.x, a.z - moi.z) - Math.hypot(b.x - moi.x, b.z - moi.z))[0];
    const chemin = jeu.nav.chemin(moi.x, moi.z, cible.x, cible.z); let ic = 0;
    const evs = pas(jeu, 60 * 40, () => {
      while (ic < chemin.length - 1 && Math.hypot(chemin[ic][0] - moi.x, chemin[ic][1] - moi.z) < 0.8) ic++;
      const p = chemin[ic], d = Math.hypot(p[0] - moi.x, p[1] - moi.z);
      return { moi: ic >= chemin.length - 1 && d < 1 ? RIEN : Object.assign({}, RIEN, { avant: 1, yaw: Math.atan2(-(p[0] - moi.x), -(p[1] - moi.z)), pitch: 0 }) };
    });
    return json({ t: jeu.temps, e: jeu.entites.map((e) => [e.id, Math.round(e.x * 1000), Math.round(e.z * 1000), e.vie]), n: evs.length, c: A.coffres.map((q) => q.ouvert), s: moi.sac.objets });
  };
  const a = jouer(), b = jouer();
  check(a === b, 'rejouable : même graine, mêmes entrées, même partie (robots compris)');
}

titre('L’Arène n’a rien de l’Extraction');
{
  const jeu = PJ.creer({ monde, carte, mode: PA, graine: 1, options: {} }), moi = jeu.ajouterJoueur({ id: 'moi', ameliorations: { armure: 3, sac: 3 } });
  check(!jeu.extraction && !moi.sac && moi.armure === 0 && moi.reserve.ak74 === 120 && jeu.entites.filter((e) => e.bot).every((e) => e.equipe !== 'gardiens' && !e.garde) && moi.ralenti === undefined, 'en Arène : pas de sac, pas d’améliorations, robots ordinaires');
}

titre('Une partie simulée complète (bourg, 8 min, robots « facile »)');
{
  const t0 = Date.now();
  const jeu = creer({ niveau: 'facile' }, { graine: 3, maintenant: Date.parse('2026-10-15T12:00:00+02:00') }), A = jeu.extraction;
  const moi = jeu.ajouterJoueur({ id: 'moi', nom: 'Toi', ameliorations: { sac: 1 } });
  moi.invincible = 1e9; // le pilote automatique ne se défend pas : il est protégé (les robots, eux, jouent)
  let but = null, chemin = null, ic = 0, nOuverts = 0;
  const tous = [], compte = {};
  const pilote = () => {
    if (!moi.vivant) return {};
    const enSac = B.casesDe(moi.sac.objets);
    if (!but || but.ouvert === true || jeu.image % 120 === 0) { // un but revu toutes les 2 s
      const L = A.largage;
      if (A.ouvertes && L && !L.coffre.ouvert && enSac < moi.sac.cases - 1) but = L.tombe ? L.coffre : { x: L.x + 2, z: L.z, ouvert: false }; // la caisse du largage d'abord
      else if (A.ouvertes || enSac >= moi.sac.cases - 1) { but = PX.plusProche(jeu, moi.x, moi.z).point; }
      else { let b = null, bd = Infinity; for (const c of A.coffres) if (!c.ouvert && (!c.verrou || moi.cle)) { const d = Math.hypot(c.x - moi.x, c.z - moi.z); if (d < bd) { bd = d; b = c; } } but = b; }
      chemin = but ? jeu.nav.chemin(moi.x, moi.z, but.x, but.z) : null; ic = 0;
    }
    const iC = moi.sac.objets.findIndex((id) => B.CONSOMMABLES[id]);
    if (iC >= 0) return { moi: Object.assign({}, RIEN, { lacher: iC }) }; // le pilote ne garde que les objets de valeur
    if (!chemin) return { moi: RIEN };
    while (ic < chemin.length - 1 && Math.hypot(chemin[ic][0] - moi.x, chemin[ic][1] - moi.z) < 0.8) ic++;
    const p = chemin[ic], d = Math.hypot(p[0] - moi.x, p[1] - moi.z), arrive = ic >= chemin.length - 1 && d < (but.rayon ? 3 : 1);
    return { moi: arrive ? RIEN : Object.assign({}, RIEN, { avant: 1, course: d > 2, yaw: Math.atan2(-(p[0] - moi.x), -(p[1] - moi.z)), pitch: 0 }) };
  };
  for (let i = 0; i < 60 * 500 && !jeu.fini; i++) {
    const evs = jeu.etape(DT, pilote());
    for (const e of evs) { compte[e.t] = (compte[e.t] || 0) + 1; if (e.t !== 'pas' && e.t !== 'tir') tous.push(e); if (e.t === 'coffre') nOuverts++; }
  }
  const ms = Date.now() - t0, r = PX.resultat(jeu), l = r.extraction.joueurs[0];
  console.log(`      (${(jeu.temps).toFixed(0)} s simulées en ${ms} ms ; événements ${json(compte)})`);
  check(jeu.erreurs === 0 && jeu.fini, `sans erreur, finie (${jeu.temps.toFixed(0)} s)`);
  check(nOuverts >= 5 && l.coffres === nOuverts && moi.sac.objets.length > 0, `${nOuverts} coffres ouverts ; sac : ${moi.sac.objets.join(', ')}`);
  check(compte.extractions === 1 && (compte.largage >= 1 || jeu.temps < A.largage.A - 15) && l.extrait && l.valeur > 0 && l.valeur === B.valeurDe(l.objets) && de(tous, 'extrait').length === 1, `extraction réussie par ${l.point} avec ${l.valeur} pièces`);
  const vivants = jeu.entites.filter((e) => e.bot && e.vivant).length;
  check(vivants >= 8 && (compte.renforts >= 1 || jeu.temps < A.largage.A + X.largage.arrivee), `les gardiens sont toujours là (${vivants}) ; les renforts du largage s’il est tombé`);
  let c = B.coffreVide(); const dp = B.deposer(c, l); c = dp.coffre;
  const pr = B.progression(c, l, jeu.maintenant); c = pr.coffre;
  check(dp.gain === l.valeur && c.pieces === l.valeur && c.collection.length > 0 && c.record === l.score && c.contrats && c.contrats.jour === '2026-10-15', `au coffre personnel : +${dp.gain} pièces, la collection, le record (${l.score}), les contrats du jour`);
  check(ms < 20000, `temps de simulation raisonnable (${ms} ms)`);
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
