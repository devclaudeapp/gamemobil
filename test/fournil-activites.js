// Les activités d'un événement du Fournil (src/activites.js, le moteur commun : mini-jeux, contrats de la nuit, opérations), et la pause
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
};
