// Les activités d'un événement du Fournil (src/activites.js, le moteur commun : mini-jeux, contrats de la nuit, opérations, recette du jour), et la pause
// des coups de pouce pendant une courte sortie — vérifiées pour UN événement (ses règles pures : QUARTIER, HANTEE, ou un suivant).
// Appelé par test/fournil-quartier.test.js et test/fournil-hantee.test.js : verifierActivites(M, check, { S, nom }) ; S : les simulations
// déjà faites par le test (marathon, assidu…). Rien d'autre à écrire pour un nouvel événement : sa fiche suffit.
'use strict';
const H = 3600e3, MIN = 60e3;
const copie = (o) => JSON.parse(JSON.stringify(o));

module.exports = function verifierActivites(M, check, o) {
  o = o || {}; const S = o.S || {}, nom = o.nom || 'l’événement';
  const J1 = M.DEBUT + H, J2 = M.DEBUT + 22 * H; // le jour de l'ouverture (13 h), puis le lendemain, 10 h
  check(!M.activitesOuvertes(J1) && M.activitesOuvertes(J2) && M.fenetre(J2).jour === 2, 'les activités paient à partir du lendemain de l’ouverture (le jour de l’ouverture, tout le monde part de zéro)');
  const prep = (t) => { const st = {}, q = M.etat(st, t); M.gagner(q, 1e7); for (let i = 0; i < 3; i++) { M.acheter(q, i); M.embaucher(q, i); } q.now = t; q.lastSeen = t; return { st, q }; };

  console.log(`── ${nom} : une courte sortie met le coup de pouce en pause (PAUSE_EV) ──`);
  for (const type of ['descente', 'soiree', 'grosclient']) {
    const { q } = prep(J2); M.lancerEvenement(q, () => 0, type); const reste = q.ev.fin - q.now, b0 = q.billets;
    const o1 = M.tick(q, 1 / 60, J2 + 20e3, () => 0.5);
    check(q.ev && q.ev.type === type && q.ev.fin - q.now === reste && !o1.finEv && q.billets >= b0, `une sortie de 20 s pendant ${type === 'descente' ? 'une descente' : type === 'soiree' ? 'une soirée' : 'un gros client'} (le jeu en arrière-plan) : retrouvé, ${Math.round(reste / 1000)} s restantes comme avant`);
    const r0 = q.stats.descentesRatees; q.lastSeen = q.now; M.absence(q, q.now + 20e3);
    check(q.ev && q.ev.type === type && q.ev.fin - q.now === reste && q.stats.descentesRatees === r0, `… et 20 s d’écran fermé (absence) : toujours là, même temps restant`);
    const b1 = q.billets; M.tick(q, 1 / 60, q.now + 30 * MIN, () => 0.5);
    check(q.ev === null && q.billets >= b1 && q.stats.descentesRatees === r0 && q.evTimer >= 90, `… une sortie de 30 min : effacé sans saisie, rien ne surgit tout de suite`);
  }
  { const { q } = prep(J2); M.lancerEvenement(q, () => 0, 'soiree'); const sans = copie(q); sans.ev = null;
    const a = M.absence(q, J2 + 5 * MIN), b = M.absence(sans, J2 + 5 * MIN);
    const q2 = prep(J2).q; M.lancerEvenement(q2, () => 0, 'soiree'); const s2 = copie(q2); s2.ev = null; const c = M.absence(q2, J2 + 2 * H), e = M.absence(s2, J2 + 2 * H);
    check(a.total === b.total && c.total === e.total && q.ev && q.ev.type === 'soiree' && q2.ev === null, `l’absence ne paie jamais la soirée (5 min : ${M.fmt(a.total)} avec ou sans ; 2 h : ${M.fmt(c.total)} avec ou sans)`); }

  console.log(`── ${nom} : les mini-jeux ──`);
  const MI = M.MINI;
  check(MI.jeux.map((j) => j.id).join() === 'guet,compte,tournee' && MI.jeux.every((j) => j.nom && j.desc && j.regles.length === 3 && j.duree >= 30 && j.duree <= 45), `trois mini-jeux de 30 à 45 s : ${MI.jeux.map((j) => `« ${j.nom} » (${j.duree} s)`).join(', ')}`);
  { // un joueur parfait atteint le plein de chaque jeu ; la même graine donne la même partie
    const pas = 1 / 60, G = M.MOTEURS;
    let e = G.guet.nouveau(42); while (!e.fini) { if (e.phase === 'passe' && Math.abs(e.x - e.cible) <= e.tol * 0.2) G.guet.toucher(e); G.guet.avancer(e, pas); }
    const parfaitGuet = e.score; let e2 = G.guet.nouveau(42); while (!e2.fini) G.guet.avancer(e2, pas);
    check(parfaitGuet >= G.guet.regles.plein && e2.score === 0 && e2.rates > 10 && Math.abs(e.t - 30) < 0.05, `le guet : ${parfaitGuet} points au plus juste (plein : ${G.guet.regles.plein}), 0 sans toucher, 30 s`);
    let c = G.compte.nouveau(7); while (!c.fini) { if (c.phase === 'choix') G.compte.repondre(c, c.manche.n); G.compte.avancer(c, pas); }
    const c2 = G.compte.nouveau(7), c3 = G.compte.nouveau(8);
    check(c.score >= G.compte.regles.plein && c.rates === 0 && JSON.stringify(c2.manche) === JSON.stringify(G.compte.manche(7, 0)) && JSON.stringify(c2.manche) !== JSON.stringify(c3.manche) && c2.manche.choix.includes(c2.manche.n) && c2.manche.choix.length === 4, `le compte : ${c.score} points sans faute (plein : ${G.compte.regles.plein}) ; la même graine, la même table`);
    let x = G.compte.nouveau(9); while (x.phase !== 'choix') G.compte.avancer(x, pas); const faux = G.compte.repondre(x, x.manche.n + 1);
    check(!faux.ok && x.serie === 0 && x.score === 0, 'une mauvaise réponse ne rapporte rien et casse la série');
    let t = G.tournee.nouveau(3); while (!t.fini) { if (t.phase === 'trace' && G.tournee.regles.parTournee - t.reste > 0.5) for (const p of t.arrets.slice()) G.tournee.tracer(t, p, p); G.tournee.avancer(t, pas); }
    const t2 = G.tournee.nouveau(3); const r = G.tournee.tracer(t2, t2.arrets[1], t2.arrets[1]);
    check(t.score >= G.tournee.regles.plein && t.notes.length === 3 && t.notes.every((n) => n.arrets === 6 && n.bonus > 0) && r === null && t2.suivant === 0, `la tournée : ${t.score} points, trois tournées bouclées (plein : ${G.tournee.regles.plein}) ; dans le désordre, rien ne compte`);
    const a = t2.arrets[0], b = t2.arrets[1]; const r2 = G.tournee.tracer(t2, [a[0] - 0.2, a[1]], [a[0] + 0.2, a[1]]);
    check(r2 && r2.arrets === 1 && t2.suivant === 1 && G.tournee.tracer(t2, b, b).arrets === 1, 'un trait rapide qui passe sur un arrêt le compte (le segment, pas seulement le point)'); }
  { const { q } = prep(J2), pleine = M.primePleineMini(q);
    check(pleine === M.arrondi(Math.max(MI.plancher, M.rythme(q) * MI.minutes * 60)), `une partie parfaite paie ${MI.minutes} min du rythme : ${M.fmt(pleine)}`);
    const plein = (id) => M.jeuMini(id).plein;
    let r = M.finirMini(q, 'guet', plein('guet'), J2);
    check(r.ok && r.prime === pleine && q.billets >= pleine && r.jetons === MI.stock - 1 && q.mini.records.guet === plein('guet') && q.stats.miniReussis === 1, `une partie parfaite : +${M.fmt(r.prime)}, record noté, ${r.jetons} jetons restants`);
    r = M.finirMini(q, 'compte', plein('compte') / 2, J2);
    check(r.prime === M.arrondi(pleine / 2) && q.stats.miniReussis === 2, `la moitié des points : la moitié de la prime (${M.fmt(r.prime)})`);
    const j0 = q.mini.jetons; r = M.finirMini(q, 'tournee', 0, J2);
    check(r.prime === 0 && q.mini.jetons === j0 && !r.reussi, 'zéro point : rien, et le jeton reste');
    r = M.finirMini(q, 'tournee', plein('tournee'), J2); const r4 = M.finirMini(q, 'guet', plein('guet') * 2, J2);
    check(r.prime > 0 && r4.prime === 0 && r4.pourLeRecord && r4.record && q.mini.records.guet === plein('guet') * 2 && q.mini.payees === 3, 'trois parties payées, puis la quatrième compte pour le record seulement');
    const j20 = M.jetonsMini(q, J2 + 20 * MIN), j1h = M.jetonsMini(q, J2 + 60 * MIN), jar = M.jetonsMini(q, J2 - H);
    check(j20.jetons === 1 && j1h.jetons === 3 && jar.jetons === 3 && j1h.prochain === 0, 'un jeton de plus toutes les 20 min, trois au plus (une heure qui recule ne rend rien de plus)');
    let t = J2 + 60 * MIN, n = 0; for (let k = 0; k < 40; k++) { t += 20 * MIN; if (M.dayKey(t) !== M.dayKey(J2)) break; if (M.finirMini(q, 'guet', plein('guet'), t).prime > 0) n++; }
    check(q.mini.payees === MI.parJour && M.finirMini(q, 'guet', plein('guet'), t - MIN).prime === 0, `le plafond du jour de Paris : ${MI.parJour} parties payées (${q.mini.payees}), puis pour le record`);
    const demain = M.parisMs(...M.dayKey(J2 + 24 * H).split('-').map(Number), 9); r = M.finirMini(q, 'compte', plein('compte'), demain);
    check(r.prime > 0 && q.mini.payees === 1, 'le lendemain (minuit, heure de Paris), le compteur repart');
    const { q: q1 } = prep(J1); r = M.finirMini(q1, 'guet', plein('guet'), J1);
    check(r.prime === 0 && r.ferme && r.record && q1.billets < 1e7 + 1, 'le jour de l’ouverture : pour le record seulement'); }

  console.log(`── ${nom} : les contrats de la nuit ──`);
  { const a = M.contratsDuJour(J2), b = M.contratsDuJour(J2 + 3 * H), c = M.contratsDuJour(M.dayKey(J2)), autres = [1, 2, 3, 4, 5].map((k) => JSON.stringify(M.contratsDuJour(J2 + k * 24 * H)));
    check(a.length === 3 && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c) && autres.some((x) => x !== JSON.stringify(a)), `trois par jour, les mêmes toute la journée et pour tous (graine du jour) : ${a.map((x) => `« ${x.texte} »`).join(', ')}`);
    check(new Set(a.map((x) => x.modele)).size === 3 && a[0].minutes < a[1].minutes && a[1].minutes < a[2].minutes && a.every((x) => x.n > 0 && x.texte.length > 8), `trois objectifs différents, du plus facile au plus dur (${a.map((x) => x.minutes + ' min').join(', ')})`);
    const { q: q1 } = prep(J1); check(M.etatContrats(q1, J1).length === 0 && !M.reclamerContrat(q1, 0, J1).ok, 'le jour de l’ouverture : pas encore de contrats');
    const { q } = prep(J2), l0 = M.etatContrats(q, J2);
    check(l0.every((x) => x.fait === 0 && !x.pret && !x.reclame), 'au premier regard du jour, tout part de zéro (ce qui était fait avant ne compte pas)');
    const k = 0, cible = l0[k], avance = (x, n) => { if (x.produit != null) q.stats.vendus[x.produit] += n; else q.stats[x.stat] += n; };
    avance(cible, cible.n - 1); check(!M.etatContrats(q, J2)[k].pret && !M.reclamerContrat(q, k, J2).ok, `presque rempli (${cible.n - 1}/${cible.n}) : pas encore`);
    avance(cible, 1); const t0 = q.total, rythme = M.rythme(q), b0 = q.boosts, r = M.reclamerContrat(q, k, J2);
    check(r.ok && r.prime === M.arrondi(Math.max(MI.plancher, rythme * cible.minutes * 60)) && q.total === t0 + r.prime && q.stats.contrats === 1, `rempli : « ${cible.texte} », +${M.fmt(r.prime)} (${cible.minutes} min du rythme)`);
    check(!M.reclamerContrat(q, k, J2).ok && M.reclamerContrat(q, k, J2).deja && q.total === t0 + r.prime && M.aReclamer(q, J2) === 0, 'réclamé une seule fois');
    const dur = l0[2]; avance(dur, dur.n); const r3 = M.reclamerContrat(q, 2, J2 + MIN);
    check(r3.ok && (dur.boost ? r3.boost && q.boosts === b0 + 1 : !r3.boost && q.boosts === b0), dur.boost ? `le plus dur donne aussi un boost ×${dur.boost.mult} de ${dur.boost.secs / 60} min pour la boulangerie (q.boosts)` : 'le plus dur, ce jour-là, sans boost');
    let jb = null; for (let j = 1; j < 30 && !jb; j++) { const l = M.contratsDuJour(J2 + j * 24 * H); if (l[2].boost) jb = l[2]; }
    check(!!jb && jb.boost.mult >= 2, 'certains jours, le contrat le plus dur promet un boost');
    const demain = J2 + 24 * H, l2 = M.etatContrats(q, demain);
    check(l2.every((x) => !x.reclame && x.fait === 0) && q.contrats.jour === M.dayKey(demain), 'le lendemain : trois nouveaux, rien de réclamé, tout repart de zéro');
    const { q: qv } = prep(J2); const v0 = qv.stats.vendus[0]; qv.postes[0].actif = true; for (let s = 1; s <= 20; s++) M.tick(qv, 1, J2 + s * 1000, () => 0.5);
    check(qv.stats.vendus[0] > v0 && qv.stats.vendus.length === M.PRODUITS.length, `les ventes se comptent par produit (q.stats.vendus : ${qv.stats.vendus.slice(0, 3).join(', ')}…)`); }

  console.log(`── ${nom} : les opérations ──`);
  { const OP = M.OPERATIONS;
    check(OP.map((x) => x.min).join() === '5,15,60' && OP.every((x) => x.nom && x.desc && x.part > 0 && x.part <= 0.25 && x.risque > 0 && x.risque < 0.2), `trois coups : ${OP.map((x) => `« ${x.nom} » (${x.min} min, ${Math.round(x.part * 100)} % du rythme, risque ${Math.round(x.risque * 100)} %)`).join(', ')}`);
    const { q: q1 } = prep(J1); check(!M.lancerOperation(q1, 'court', J1).ok && M.lancerOperation(q1, 'court', J1).ferme, 'le jour de l’ouverture : pas encore');
    const { q } = prep(J2), long = OP[2], gain = M.gainOperation(q, long);
    let r = M.lancerOperation(q, long.id, J2, () => 0.99);
    check(r.ok && q.operation.gain === gain && gain === M.arrondi(Math.max(MI.plancher, M.rythme(q) * long.part * long.min * 60)) && q.operation.saisi === 0 && q.operation.fin === J2 + 60 * MIN, `« ${long.nom} » lancée : ${M.fmt(gain)} promis dans une heure`);
    check(!M.lancerOperation(q, 'court', J2 + MIN).ok && M.lancerOperation(q, 'court', J2 + MIN).occupe, 'une seule à la fois');
    check(M.ramasserOperation(q, J2 + 59 * MIN) === null && M.ramasserOperation(q, J2 - H) === null && q.operation, 'pas avant la fin (ni avec une heure qui recule)');
    q.lastSeen = J2 + MIN; const t0 = q.total, abs = M.absence(q, J2 + 3 * H), apresAbs = q.total;
    check(q.operation && Math.abs(apresAbs - t0 - abs.total) <= 1e-9 * Math.max(1, abs.total), 'elle tourne pendant l’absence ; l’absence paie ses heures, sans toucher à l’opération');
    r = M.ramasserOperation(q, J2 + 3 * H);
    check(r && r.net === gain && r.saisi === 0 && q.total === apresAbs + gain && q.operation === null && q.stats.operations === 1, `finie pendant l’absence, ramassée au retour : +${M.fmt(r.net)}`);
    check(M.ramasserOperation(q, J2 + 4 * H) === null && q.total === apresAbs + gain, 'ramassée une seule fois');
    r = M.lancerOperation(q, 'court', J2 + 4 * H, () => 0); const g2 = q.operation.gain, s2 = q.operation.saisi;
    const copieSauv = copie(q); const r2 = M.ramasserOperation(q, J2 + 4 * H + 5 * MIN);
    check(s2 === M.arrondi(g2 * M.SAISIE) && r2.saisi === s2 && r2.net === g2 - s2 && q.stats.operationsSaisies === 1, `la saisie (tirée au lancement) : ${M.fmt(s2)} sur ${M.fmt(g2)}`);
    const relue = M.etat({ [M.FICHE.cle]: copieSauv }, J2); check(relue.operation && relue.operation.saisi === s2, 'relue de la sauvegarde, l’opération garde son tirage (aucune relance du hasard)');
    const presFin = M.FIN - 10 * MIN, { q: qf } = prep(presFin);
    check(!M.lancerOperation(qf, 'long', presFin).ok && M.lancerOperation(qf, 'long', presFin).tard && M.lancerOperation(qf, 'court', presFin).ok, 'dix minutes avant la fermeture : le gros coup est refusé, le petit passe'); }

  console.log(`── ${nom} : une vieille sauvegarde, le rythme, la simulation ──`);
  { const { st, q } = prep(J2); const v = copie(st), vq = v[M.FICHE.cle]; delete vq.mini; delete vq.contrats; delete vq.operation; for (const k of ['miniParties', 'miniReussis', 'operations', 'operationsSaisies', 'contrats', 'vendus']) delete vq.stats[k];
    const q2 = M.etat(v, J2);
    check(q2.total === q.total && q2.postes.length === M.PRODUITS.length && q2.mini && q2.mini.jetons === MI.stock && q2.contrats && q2.operation === null && q2.stats.vendus.length === M.PRODUITS.length && q2.stats.miniParties === 0, 'une sauvegarde d’avant les activités se relit sans rien perdre : jetons pleins, compteurs à zéro');
    { const v6 = copie(st), q6 = v6[M.FICHE.cle]; q6.postes = q6.postes.slice(0, 6); q6.stats.vendus = q6.stats.vendus.slice(0, 6); const q7 = M.etat(v6, J2); // une sauvegarde d'avant les recettes d'après le boss : six postes, six compteurs
      check(q7.postes.length === M.PRODUITS.length && q7.stats.vendus.length === M.PRODUITS.length && q7.postes.slice(6).every((x) => x.niv === 0 && !x.staff) && JSON.stringify(q7.postes.slice(0, 6)) === JSON.stringify(q.postes.slice(0, 6)) && M.tick(q7, 1, J2 + 1000).ventes.every((x) => x.i < 6), `une sauvegarde à six postes reçoit les ${M.PRODUITS.length - 6} recettes d’après le boss, fermées, sans rien perdre`); }
    check(M.finirMini(q2, 'guet', 60, J2).ok && M.etatContrats(q2, J2).length === 3 && M.lancerOperation(q2, 'court', J2).ok && JSON.stringify(M.etat(copie(v), J2).operation) === JSON.stringify(q2.operation), 'et tout y marche aussitôt (la sauvegarde relue garde l’opération)');
    const qa = prep(J2).q, qb = prep(J2).q; qb.postes.forEach((s) => { if (s.niv > 0) s.niv *= 2; });
    check(M.rythme(qb) > M.rythme(qa) * 1.5 && M.primePleineMini(qb) > M.primePleineMini(qa) * 1.5 && M.gainOperation(qb, M.OPERATIONS[2]) > M.gainOperation(qa, M.OPERATIONS[2]) * 1.5, 'les gains suivent le rythme de l’équipe (rythme(q), sans la présence)'); }
  for (const [p, s] of Object.entries(S)) if (s && s.q) check(s.q.stats.miniParties > 0 && s.q.stats.operations > 0 && s.q.stats.contrats > 0, `la simulation (${p}) joue les trois activités : ${s.q.stats.miniParties} parties, ${s.q.stats.operations + s.q.stats.operationsSaisies} opérations (${s.q.stats.operationsSaisies} saisies), ${s.q.stats.contrats} contrats`);

  console.log(`── ${nom} : à la fermeture, les activités s'arrêtent ──`);
  { // fenetre(FIN).jour vaut le dernier jour (>= desLeJour) : seule la fin (fenetre.fini) les ferme ; une prime après le bilan ne serait jamais comptée
    const avant = M.FIN - MIN, apres = M.FIN + 1000, { q } = prep(avant), c = M.etatContrats(q, avant)[0], plein = M.jeuMini('guet').plein;
    if (c.produit != null) q.stats.vendus[c.produit] += c.n; else q.stats[c.stat] += c.n;
    check(M.activitesOuvertes(avant) && M.etatContrats(q, avant)[0].pret && M.jetonsMini(q, avant).payable && M.fenetre(apres).jour >= MI.desLeJour, 'une minute avant la fin : un contrat prêt, une partie payée en attente');
    const t0 = q.total, j0 = q.mini.jetons, r = M.finirMini(q, 'guet', plein, apres), rc = M.reclamerContrat(q, c.k, apres);
    check(!M.activitesOuvertes(apres) && r.ok && r.prime === 0 && r.record && q.mini.jetons === j0 && !rc.ok && q.total === t0 && M.etatContrats(q, apres).length === 0 && M.aReclamer(q, apres) === 0,
      'une seconde après la fin : la partie ne paie plus (le record seul), le contrat ne se réclame plus, le total ne bouge pas');
    check(!M.lancerOperation(q, 'court', apres).ok && !M.lancerRecette(q, apres).ok && !M.jetonsMini(q, apres).payable, '… et ni opération ni recette du jour ne partent'); }

  console.log(`── ${nom} : la recette du jour ──`);
  { const RJ = M.RECETTE_JOUR, L = M.RECETTES_JOUR, JOUR = 24 * H;
    check(L.length === 7 && new Set(L.map((r) => r.id)).size === 7 && L.every((r) => r.nom && r.desc && r.icone && r.temps >= 20 && r.temps <= 90), `sept recettes de 20 à 90 s : ${L.map((r) => `« ${r.nom} » (${r.temps} s)`).join(', ')}`);
    // le jour de Paris : la même toute la journée et pour tous ; jamais deux jours de suite la même ; les sept en une semaine
    const a = M.recetteDuJour(J2), suite = Array.from({ length: 35 }, (_, k) => M.recetteDuJour(J2 + k * JOUR).id);
    check(a === M.recetteDuJour(J2 + 3 * H) && a === M.recetteDuJour(M.dayKey(J2)) && M.recetteDemain(J2) === M.recetteDuJour(J2 + JOUR) && M.recetteDuJour(M.parisMs(...M.dayKey(J2).split('-').map(Number), 0) + 60e3) === a, `une recette par jour de Paris, la même de minuit à minuit (le ${M.dayKey(J2)} : « ${a.nom} », demain « ${M.recetteDemain(J2).nom} »)`);
    check(suite.every((x, k) => k === 0 || x !== suite[k - 1]) && new Set(suite.slice(0, 14)).size === 7, `jamais deux jours de suite la même, toutes servies en deux semaines (${suite.slice(0, 8).join(', ')}…)`);
    const { q: q1 } = prep(J1); check(!M.preparerRecette(q1, J1).ok && M.preparerRecette(q1, J1).ferme && !M.etatRecette(q1, J1).ouverte, 'le jour de l’ouverture : la cuisine ouvre le lendemain (comme les autres activités)');
    // les prix et les niveaux : un niveau commun, de 0 à 10 ; le prix de la saison, à la part près (rythme × 12 s × 1,5^niv, remise comprise)
    const { q } = prep(J2), rythme = M.rythme(q), b0 = q.billets;
    check(M.etatRecette(q, J2).niv === 0 && !M.lancerRecette(q, J2).ok && M.lancerRecette(q, J2).niv, 'niveau 0 : rien à cuire avant de la préparer');
    const p0 = M.prixRecette(q); let r = M.preparerRecette(q, J2);
    check(p0 === M.arrondi(rythme * RJ.coutSec) && r.ok && r.niv === 1 && q.billets === b0 - p0, `préparer (niveau 1) : ${M.fmt(p0)}, ${RJ.coutSec} s du rythme`);
    const p1 = M.prixRecette(q); check(p1 === M.arrondi(rythme * RJ.coutSec * RJ.croiss), `améliorer au niveau 2 : ${M.fmt(p1)} (×${String(RJ.croiss).replace(".", ",")})`);
    for (let k = 1; k < RJ.nivMax; k++) M.preparerRecette(q, J2);
    check(q.recettes.niv === RJ.nivMax && !M.preparerRecette(q, J2).ok && M.preparerRecette(q, J2).max && M.etatRecette(q, J2).max, `jusqu’au niveau ${RJ.nivMax}, pas plus`);
    { const qp = prep(J2).q; qp.billets = 0; const px = M.prixRecette(qp), rr = M.preparerRecette(qp, J2); check(!rr.ok && rr.prix === px && qp.recettes.niv === 0, 'sans les billets : refusé, le prix rendu');
      const rem = M.AMELIORATIONS.find((x) => x.effet && x.effet.remise); qp.ameliorations[rem.id] = true;
      check(M.prixRecette(qp) === px * rem.effet.remise, `${rem.nom} : les niveaux à ${Math.round(rem.effet.remise * 100)} % du prix (${M.fmt(M.prixRecette(qp))})`); }
    // une fournée : à la main, le gain fixé au lancement, sortie à la fin seulement
    const rj = M.recetteDuJour(J2), g = rythme * rj.temps * RJ.part * (1 + RJ.pas * (RJ.nivMax - 1)) * M.boostMult(q);
    r = M.lancerRecette(q, J2);
    check(r.ok && q.recettes.four.gain === g && q.recettes.four.fin === J2 + rj.temps * 1000 && Math.abs(g / rj.temps / (M.rythme(q) * M.boostMult(q)) - 1.9 * RJ.part) < 1e-9, `une fournée de « ${rj.nom} » au niveau 10 : +${M.fmt(g)} en ${rj.temps} s (1,9 × la part, ${String(RJ.part).replace('.', ',')}, × le rythme en présence)`);
    check(!M.lancerRecette(q, J2 + 1000).ok && M.lancerRecette(q, J2 + 1000).occupe && M.sortirRecette(q, J2 + rj.temps * 1000 - 1) === null && M.sortirRecette(q, J2 - H) === null, 'une seule au four ; pas avant la fin (ni avec une heure qui recule)');
    let t0 = q.total; r = M.sortirRecette(q, J2 + rj.temps * 1000);
    check(r && r.gain === g && q.total === t0 + g && q.recettes.fournees === 1 && q.recettes.four === null && M.sortirRecette(q, J2 + H) === null, `sortie : +${M.fmt(g)}, une fournée de plus, une seule fois`);
    { const qs = prep(J2).q; for (let k = 0; k < 3; k++) M.preparerRecette(qs, J2); M.lancerEvenement(qs, () => 0, 'soiree'); const rs = M.lancerRecette(qs, J2);
      check(rs.ok && Math.abs(rs.four.gain / (M.rythme(qs) * rj.temps * RJ.part * 1.2 * M.PRESENCE) - M.EVENEMENTS.soiree.mult) < 1e-9, `lancée pendant la soirée : ×${M.EVENEMENTS.soiree.mult} (boostMult), au niveau 3 : ×1,2`); }
    // le niveau reste quand la recette change ; le lendemain, une autre recette
    const demain = J2 + JOUR, rd = M.recetteDuJour(demain), ed = M.etatRecette(q, demain);
    check(rd !== rj && ed.r === rd && ed.niv === RJ.nivMax && M.lancerRecette(q, demain).ok && q.recettes.four.id === rd.id, `le lendemain, « ${rd.nom} » : le niveau ${ed.niv} est gardé`);
    // l'absence : la fournée au four sort, rien ne se relance
    q.lastSeen = demain; t0 = q.total; const abs = M.absence(q, demain + 2 * H);
    check(q.recettes.fournees === 2 && q.recettes.four === null && abs.detail.some((x) => x.i === -1 && x.nom === rd.nom) && Math.abs(q.total - t0 - abs.total) <= 1e-9 * q.total, `pendant l’absence, la fournée sort (comptée dans l’absence : ${abs.detail.filter((x) => x.i === -1).map((x) => M.fmt(x.m)).join('')}), rien ne se relance`);
    // juste avant la fermeture : refusée si elle sortirait après
    const fin = M.FIN - 10e3, qf = prep(fin).q; M.preparerRecette(qf, fin);
    check(!M.lancerRecette(qf, fin).ok && M.lancerRecette(qf, fin).tard && !M.lancerRecette(qf, M.FIN + 1).ok && !M.preparerRecette(qf, M.FIN + 1).ok, 'dix secondes avant la fermeture : refusée (elle sortirait après) ; fermé, plus rien');
    // la maîtrise : 100, 250, 500 fournées (toutes recettes confondues), chaque étape une seule fois
    const qm = prep(J2).q; M.preparerRecette(qm, J2); const e0 = qm.etoiles || 0, d0 = qm.decos.length;
    const cuire = (t) => { M.lancerRecette(qm, t); return M.sortirRecette(qm, t + 90e3); };
    qm.recettes.fournees = 98; r = cuire(J2);
    check(r.etapes.length === 0 && qm.recettes.fournees === 99 && qm.recettes.aVerser === 0, 'à 99 fournées : rien encore');
    r = cuire(J2 + 2 * MIN); const E = RJ.etapes;
    check(r.etapes.length === 1 && r.etapes[0].n === 100 && qm.etoiles === e0 + E[0].etoiles && qm.recettes.aVerser === E[0].etoiles && M.verserRecette(qm) === E[0].etoiles && qm.recettes.aVerser === 0 && M.verserRecette(qm) === 0, `la 100e : +${E[0].etoiles} ★ pour la boulangerie (versées une fois)`);
    qm.recettes.fournees = 249; r = cuire(J2 + 4 * MIN);
    check(r.etapes.length === 1 && r.etapes[0].n === 250 && qm.etoiles === e0 + E[0].etoiles + E[1].etoiles && qm.decos.length === d0, `la 250e : +${E[1].etoiles} ★`);
    qm.recettes.fournees = 499; r = cuire(J2 + 6 * MIN);
    check(r.etapes.length === 1 && r.etapes[0].n === 500 && r.etapes[0].deco === M.DECO_RECETTE && M.DECO_RECETTE && qm.decos.includes(M.DECO_RECETTE) && qm.etoiles === e0 + E[0].etoiles + E[1].etoiles + E[2].etoiles, `la 500e : +${E[2].etoiles} ★ et un décor pour la boutique (« ${M.DECO_RECETTE} », q.decos)`);
    qm.recettes.fournees = 99; const eN = qm.etoiles; r = cuire(J2 + 8 * MIN); cuire(J2 + 10 * MIN);
    check(r.etapes.length === 0 && qm.etoiles === eN && qm.decos.filter((x) => x === M.DECO_RECETTE).length === 1 && qm.recettes.etapes.join() === '100,250,500', 'chaque étape une seule fois (même si le compteur repasse par 100)');
    // les sauvegardes : relue, la fournée au four reste ; une vieille (sans q.recettes) ou abîmée se répare
    const { st: sv, q: qv } = prep(J2); M.preparerRecette(qv, J2); M.lancerRecette(qv, J2);
    const relue = M.etat(copie(sv), J2); check(JSON.stringify(relue.recettes) === JSON.stringify(qv.recettes) && M.sortirRecette(relue, J2 + 90e3), 'relue de la sauvegarde, la fournée est toujours au four');
    const vieille = copie(sv); delete vieille[M.FICHE.cle].recettes; const qo = M.etat(vieille, J2);
    check(qo.recettes && qo.recettes.niv === 0 && qo.recettes.fournees === 0 && qo.recettes.four === null && qo.total === qv.total && M.preparerRecette(qo, J2).ok, 'une sauvegarde d’avant la recette du jour se relit sans rien perdre : niveau 0, rien au four, et tout marche');
    const abimee = copie(sv); Object.assign(abimee[M.FICHE.cle].recettes, { niv: 42, fournees: -3, etapes: 'x', four: { id: 'inconnue', fin: 'demain', gain: 5 } }); const qa = M.etat(abimee, J2);
    check(qa.recettes.niv === RJ.nivMax && qa.recettes.fournees === 0 && Array.isArray(qa.recettes.etapes) && qa.recettes.four === null, 'une sauvegarde abîmée se répare (niveau borné, four vidé)');
    // la simulation : le marathon et le très actif au mieux atteignent la 500e ; un occasionnel qui la joue, la 100e
    for (const [p, sim] of Object.entries(S)) if (sim && sim.q && (p === 'marathon' || p === 'très actif')) check(sim.q.recettes.fournees >= 500 && sim.q.recettes.etapes.join() === '100,250,500' && sim.q.recettes.niv === RJ.nivMax, `la simulation (${p}) la joue au mieux : ${sim.q.recettes.fournees} fournées, les trois étapes, le niveau ${sim.q.recettes.niv}`);
    const occ = M.simuler('occasionnel', undefined, { recette: true });
    check(occ.q.recettes.fournees >= 100 && occ.q.recettes.etapes.includes(100), `un occasionnel (17 min par jour) qui la joue atteint la 100e : ${occ.q.recettes.fournees} fournées, niveau ${occ.q.recettes.niv}`); }
};
