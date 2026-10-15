#!/usr/bin/env node
// Opération Poncin — le butin et le coffre personnel (PBUTIN, src-poncin/butin.js) : raretés, objets de valeur, contenu des coffres
// (rejouable), sac à cases, coffre personnel v2 (reprise d'un v1, dépôt, matériel : lister, prendre, rendre, perdre, vendre ; dépenser ;
// catalogue extensible et améliorations), calendrier de Paris (heure d'été, lundi 0 h), zone de la semaine (+25 %), contrats du jour.
// Sortie « ok / FAIL ».
'use strict';
const R = require('../src-poncin/regles.js'), B = require('../src-poncin/butin.js');
let fails = 0, oks = 0;
const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (ok) oks++; else fails++; };
const titre = (t) => console.log('\n── ' + t);
const json = (o) => JSON.stringify(o);

titre('Raretés et objets de valeur');
check(B.RARETES.join() === 'commun,rare,epique,legendaire' && B.RARETES.every((r, i) => B.RARETE[r].rang === i && /^#[0-9A-F]{6}$/.test(B.RARETE[r].couleur)), 'quatre raretés rangées, une couleur chacune (gris, bleu, violet, or)');
check(B.LISTE.length >= 12 && B.LISTE.every((v) => B.VALEURS[v.id] === v && v.valeur > 0 && v.cases >= 1 && v.cases <= 3 && B.RARETE[v.rarete]) && B.VALEURS.tresor.nom === 'Le trésor de la mairie' && B.VALEURS.tresor.rarete === 'legendaire', `${B.LISTE.length} objets de valeur (1 à 3 cases), dont « Le trésor de la mairie » légendaire`);
{
  const moy = (r) => { const l = B.LISTE.filter((v) => v.rarete === r); return l.reduce((s, v) => s + v.valeur, 0) / l.length; };
  check(moy('commun') < moy('rare') && moy('rare') < moy('epique') && moy('epique') < moy('legendaire'), `la valeur moyenne monte avec la rareté (${['commun', 'rare', 'epique', 'legendaire'].map((r) => Math.round(moy(r))).join(' < ')})`);
  check(B.valeur('constructor') === 0 && B.valeur('soin') === 0 && B.valeur('lingot') === 320 && B.nomDe('soin') === 'Trousse de soin' && B.nomDe('awm') === 'AWM', 'valeur(id) : 0 pour un consommable ou un id inconnu ; nomDe');
}

titre('Contenu des coffres');
{
  const n = 600, stats = {};
  for (const r of B.RARETES) {
    const rnd = R.mulberry32(11); let val = 0, armes = 0, sil = 0, nval = 0;
    for (let i = 0; i < n; i++) for (const o of B.tirerContenu(r, rnd)) { if (o.type === 'valeur') { val += B.valeur(o.id); nval++; } if (o.type === 'arme') { armes++; if (!R.estArme(o.arme) || R.arme(o.arme).role !== 'principale' || o.rarete !== r) val = NaN; } if (o.type === 'silencieux') sil++; }
    stats[r] = { val: val / n, armes: armes / n, sil: sil / n, nval: nval / n };
  }
  check(stats.commun.val < stats.rare.val && stats.rare.val < stats.epique.val && stats.epique.val < stats.legendaire.val, `valeur moyenne par coffre : ${B.RARETES.map((r) => Math.round(stats[r].val)).join(' < ')}`);
  check(stats.commun.armes === 0 && stats.rare.armes > 0.15 && stats.rare.armes < 0.35 && stats.legendaire.armes === 1, `armes : jamais dans un commun, ~25 % des rares (${stats.rare.armes.toFixed(2)}), toujours dans un légendaire ; une principale réelle, avec la rareté du coffre`);
  check(stats.commun.sil === 0 && stats.rare.sil > 0.08 && stats.legendaire.sil > stats.rare.sil, `silencieux : rares et mieux (${stats.rare.sil.toFixed(2)} / ${stats.epique.sil.toFixed(2)} / ${stats.legendaire.sil.toFixed(2)})`);
  const a = B.tirerContenu('epique', R.mulberry32(5)), b = B.tirerContenu('epique', R.mulberry32(5));
  check(json(a) === json(b) && json(B.tirerContenu('inconnue', R.mulberry32(5))) === json(B.tirerContenu('commun', R.mulberry32(5))), 'rejouable (même hasard, même contenu) ; une rareté inconnue → commun');
  const cf = B.tirerContenu('legendaire', R.mulberry32(2), { special: 'coffre-fort' }), cl = B.tirerContenu('rare', R.mulberry32(2), { special: 'cle' });
  check(cf[0].type === 'valeur' && cf[0].id === 'tresor' && cl.some((o) => o.type === 'cle'), 'le coffre-fort contient le trésor de la mairie ; le coffre « cle », la clé');
  const seul = B.tirerContenu('legendaire', R.mulberry32(3), { armes: ['ump', 'p226'] });
  check(seul.filter((o) => o.type === 'arme').every((o) => o.arme === 'ump'), 'les armes des coffres : seulement parmi les armes permises par l’hôte');
  const rr = B.raretes(30);
  check(rr.length === 30 && rr.filter((r) => r === 'legendaire').length === 2 && rr.filter((r) => r === 'epique').length === 5 && rr[0] === 'legendaire' && B.raretes(5).filter((r) => r === 'legendaire').length === 1, 'raretes(30) : 2 légendaires, 5 épiques… les plus rares d’abord ; au moins un légendaire');
}

titre('Le sac');
{
  const s = B.sacVide();
  check(s.cases === 8 && B.place(s) === 8 && B.sacVide(99).cases === B.SAC.max && B.sacVide('x').cases === 8, 'sac de 8 cases (borné à 16)');
  check(B.ajouter(s, 'tresor') && B.ajouter(s, 'lingot') && B.ajouter(s, 'soin') && B.place(s) === 2 && B.ajouter(s, 'montre') && !B.ajouter(s, 'statuette') && B.ajouter(s, 'cerdon') && B.place(s) === 0 && !B.ajouter(s, 'cartes'), 'trésor (3) + lingot (2) + soin (1) + montre + Cerdon = 8 cases ; la statuette (2) ne tient plus après la montre ; plein');
  check(!B.ajouter(B.sacVide(), 'inconnu') && B.valeurSac(s) === 500 + 320 + 45 + 14 && B.consommablesDe(s.objets).join() === 'soin', `valeur du sac : ${B.valeurSac(s)} (le soin ne compte pas) ; un id inconnu ne rentre pas`);
  check(B.retirer(s, 0) === 'tresor' && B.place(s) === 3 && B.retirer(s, 9) === null, 'retirer(i) libère la place');
}

titre('Le coffre personnel v2');
{
  const v = B.coffreVide();
  check(v.v === 2 && B.VERSION === 2 && v.pieces === 0 && Array.isArray(v.objets) && Array.isArray(v.materiel) && v.achats.extraction.sac === 0 && v.contrats === null, 'coffre vide : v 2, pièces, objets, matériel, achats, contrats');
  const lu = B.lireCoffre({ pieces: -5, objets: [{ id: 'montre', n: 2 }, { id: 'faux', n: 3 }], ameliorations: { sac: 9, ouverture: 1 }, record: 'x' });
  check(lu.pieces === 0 && lu.objets.length === 0 && lu.collection.length === 1 && lu.collection[0].n === 2 && lu.ameliorations.sac === 3 && lu.ameliorations.ouverture === 1 && lu.achats.extraction.sac === 3 && lu.record === 0, 'reprise d’un coffre v1 : objets (déjà vendus) → collection, améliorations bornées, valeurs abîmées → 0');
  const gel = { v: 2, pieces: 10, objets: [], materiel: [] }, gs = json(gel);
  const d = B.deposer(gel, { objets: ['lingot', 'montre', 'soin', 'soin', 'munitions'], materiel: [{ type: 'arme', arme: 'awm', rarete: 'legendaire' }, { type: 'arme', arme: 'rafale' }], score: 400, extrait: true });
  const c = d.coffre;
  check(json(gel) === gs && d.gain === 365 && c.pieces === 375 && d.record && c.record === 400 && c.parties === 1 && c.extractions === 1, `deposer : objets de valeur vendus (+${d.gain}), record 400, l’entrée jamais modifiée`);
  check(c.materiel.length === 3 && c.materiel.find((m) => m.type === 'soin').n === 2 && c.materiel.find((m) => m.type === 'arme').arme === 'awm' && c.materiel.find((m) => m.type === 'arme').rarete === 'legendaire' && c.collection.length === 2, 'matériel rangé : l’AWM légendaire, 2 soins empilés, une caisse de munitions (une arme inconnue écartée) ; la collection');
  const g = B.deposer(c, { objets: ['bijoux', 'cerdon'], extrait: true }, { vendre: false }).coffre;
  check(g.pieces === 375 && g.objets.map((x) => x.id).join() === 'bijoux,cerdon', 'vendre: false : les objets de valeur gardés (rangés du plus rare au moins rare)');
  const l = B.lister(g);
  check(l.length === 5 && l[0].ref === 'v:bijoux' && l.every((a) => a.ref && a.type && a.nom && a.prix >= 0 && a.n >= 1) && B.lister(g, 'arme').length === 1 && B.lister(g, (a) => a.type === 'soin')[0].n === 2, 'lister : objets de valeur puis matériel, avec ref, nom, prix de vente ; filtre par type ou par fonction');
  const awm = B.lister(g, 'arme')[0], p = B.prendre(g, [{ ref: awm.ref }, { ref: B.lister(g, 'soin')[0].ref, n: 1 }]);
  check(p.ok && p.pris.length === 2 && p.pris[0].arme === 'awm' && B.lister(p.coffre, 'arme').length === 0 && B.lister(p.coffre, 'soin')[0].n === 1, 'prendre (pour une partie) : l’AWM et un soin sortent du coffre');
  check(!B.prendre(g, [{ ref: awm.ref }, { ref: 'm999' }]).ok && B.lister(B.prendre(g, [{ ref: awm.ref }, { ref: 'm999' }]).coffre, 'arme').length === 1 && !B.prendre(g, [{ ref: 'v:bijoux', n: 5 }]).ok, 'prendre : tout ou rien (une ref inconnue, trop d’exemplaires : rien ne sort)');
  const rendu = B.rendre(p.coffre, [p.pris[0]]).coffre;
  check(B.lister(rendu, 'arme').length === 1 && B.lister(rendu, 'arme')[0].rarete === 'legendaire', 'rendre : l’arme revient (avec sa rareté)');
  const perdu = B.perdre(p.coffre, [p.pris[1], p.pris[0]]);
  check(perdu.n === 2 && perdu.coffre.perdus === 2 && B.lister(perdu.coffre, 'arme').length === 0, 'perdre : compté, rien ne revient');
  const ve = B.vendre(rendu, B.lister(rendu, 'arme')[0].ref);
  check(ve.ok && ve.gain === B.PRIX_ARME.legendaire && ve.coffre.pieces === rendu.pieces + 150 && !B.vendre(rendu, 'm999').ok, `vendre : l’AWM légendaire rapporte ${ve.gain} pièces ; une ref inconnue, rien`);
  const vv = B.vendre(g, 'v:bijoux');
  check(vv.ok && vv.gain === 120 && vv.coffre.objets.length === 1, 'vendre un objet de valeur gardé');
  const dp = B.depenser(g, 100, 'mur'), dp2 = B.depenser(g, 1e6);
  check(dp.ok && dp.coffre.pieces === g.pieces - 100 && dp.motif === 'mur' && !dp2.ok && dp2.coffre.pieces === g.pieces && !B.depenser(g, -5).ok, 'depenser : si les pièces suffisent (jamais négatif)');
  const relu = B.lireCoffre(JSON.parse(json(g)));
  check(json(relu) === json(g), 'un coffre v2 relu depuis le JSON est identique (format stable)');
  const abime = B.lireCoffre({ v: 2, materiel: [{ ref: 'm3', type: 'arme', arme: 'm4', rarete: 'rare' }, { ref: 'm3', type: 'arme', arme: 'awm' }, { type: 'soin', n: -1 }, { type: 'bombe' }], suivant: 1 });
  check(abime.materiel.length === 2 && abime.materiel[0].ref !== abime.materiel[1].ref && abime.suivant > 3, 'matériel abîmé : refs en double renumérotées, articles inconnus ou vides écartés');
}

titre('Le catalogue et les améliorations');
{
  let c = B.lireCoffre({ pieces: 1000 });
  check(B.prix(c, 'sac') === 150 && B.prix(c, 'inconnue') === null && B.niveau(c, 'sac') === 0, 'prix du premier niveau (150 pour le sac)');
  let r = B.acheter(c, 'sac'); c = r.coffre;
  check(r.ok && c.pieces === 850 && c.ameliorations.sac === 1 && c.achats.extraction.sac === 1 && B.prix(c, 'sac') === 400, 'acheter : 150 pièces, sac niveau 1 ; le niveau suivant à 400');
  r = B.acheter(c, 'chargeur'); c = r.coffre; const r2 = B.acheter(c, 'chargeur');
  check(r.ok && !r2.ok && r2.raison === 'max' && B.acheter(B.lireCoffre({ pieces: 10 }), 'armure').raison === 'pieces' && B.acheter(c, 'bombe').raison === 'inconnue', 'raisons de refus : max, pieces, inconnue');
  const e0 = B.effets(null), e1 = B.effets({ sac: 3, ouverture: 3, armure: 3, chargeur: 1 });
  check(e0.cases === 8 && e0.ouverture === 1.2 && e0.armure === 0 && e0.chargeurs === 0 && e1.cases === 14 && e1.ouverture === 0.7 && e1.armure === 50 && e1.chargeurs === 1 && B.effets({ sac: 99 }).cases === 14, 'effets bornés : sac 8 → 14 cases, ouverture 1,2 → 0,7 s, armure 0 → 50, un chargeur de plus');
  const cat = B.ajouterCatalogue('defense', { mur: { nom: 'Mur de planches', prix: [50, 120] }, 'Mauvais id': { prix: [1] }, tour: { prix: ['x'] } });
  check(cat && cat.mur && !cat['Mauvais id'] && !cat.tour && B.ajouterCatalogue('Pas bon', {}) === null, 'ajouterCatalogue : un catalogue de plus (la base), articles vérifiés');
  let d = B.lireCoffre({ pieces: 200 }); r = B.acheter(d, 'mur', 'defense'); d = r.coffre;
  check(r.ok && d.pieces === 150 && d.achats.defense.mur === 1 && d.ameliorations.sac === 0 && B.niveau(d, 'mur', 'defense') === 1 && B.lireCoffre(JSON.parse(json(d))).achats.defense.mur === 1, 'acheter dans « defense » : n’améliore pas l’Extraction ; relu tel quel');
  check(B.lireCoffre({ v: 2, achats: { futur: { truc: 2 } } }).achats.futur.truc === 2, 'les achats d’un catalogue pas encore chargé sont gardés');
}

titre('Calendrier de Paris, zone de la semaine');
{
  const t = (s) => Date.parse(s);
  check(B.jourDeParis(t('2026-10-15T21:59:00Z')) === '2026-10-15' && B.jourDeParis(t('2026-10-15T22:01:00Z')) === '2026-10-16', 'heure d’été : minuit à Paris = 22 h UTC');
  check(B.jourDeParis(t('2026-12-31T22:59:00Z')) === '2026-12-31' && B.jourDeParis(t('2026-12-31T23:01:00Z')) === '2027-01-01', 'heure d’hiver : minuit à Paris = 23 h UTC');
  check(B.jourDeParis(t('2026-03-29T00:59:00Z')) === '2026-03-29' && B.jourDeParis(t('2026-10-25T00:30:00Z')) === '2026-10-25' && B.jourDeParis(new Date(t('2026-05-01T12:00:00Z'))) === '2026-05-01', 'changements d’heure, une Date acceptée');
  const lundi = t('2026-10-18T22:00:00Z'); // lundi 19 octobre 2026, 0 h à Paris
  check(B.semaineDeParis(lundi) === B.semaineDeParis(lundi - 1) + 1 && B.semaineDeParis(lundi) === B.semaineDeParis(lundi + 6 * 86400000 + 86399000), 'la semaine change le lundi à 0 h (heure de Paris), pas avant');
  const zs = []; for (let k = 0; k < 8; k++) zs.push(B.zoneDeLaSemaine(lundi + k * 7 * 86400000 + 12 * 3600000)); // midi : loin des changements d'heure
  check(zs.slice(0, 4).every((z) => B.ZONES_SEMAINE.indexOf(z) >= 0) && new Set(zs.slice(0, 4)).size === 4 && zs[4] === zs[0] && B.zoneDeLaSemaine(lundi) === B.zoneDeLaSemaine(lundi + 3 * 86400000), `rotation déterministe sur 4 semaines : ${zs.slice(0, 4).join(', ')}`);
  check(B.ZONES_SEMAINE.every((z) => R.SALON.zones.indexOf(z) >= 0), 'des zones jouables');
  const c = B.deposer(null, { objets: ['lingot'], extrait: true, zoneSemaine: true, primes: 100 }).coffre, c2 = B.deposer(null, { objets: ['lingot'], extrait: true, primes: 100 }).coffre, c3 = B.deposer(null, { objets: [], extrait: false, primes: 100 }).coffre;
  check(c2.pieces === 420 && c.pieces === 525 && c3.pieces === 0, `zone de la semaine : +25 % (${c2.pieces} → ${c.pieces}) ; primes versées seulement si l’on sort`);
}

titre('Contrats du jour');
{
  const j = '2026-10-15', a = B.contratsDuJour(j), b = B.contratsDuJour(Date.parse('2026-10-15T12:00:00+02:00'));
  check(a.length === 3 && json(a) === json(b) && new Set(a.map((x) => x.type)).size === 3 && a.every((x) => B.TYPES_CONTRATS.indexOf(x.type) >= 0 && x.recompense > 0 && x.texte && x.but >= 1), `3 contrats différents, les mêmes pour la date et l’heure de Paris (${a.map((x) => x.type).join(', ')})`);
  const types = new Set(); for (let d = 1; d <= 28; d++) for (const x of B.contratsDuJour(`2026-02-${String(d).padStart(2, '0')}`)) types.add(x.type);
  check(types.size === 5, 'en un mois, les cinq types sortent');
  // un jour où tous les types utiles sont là : on cherche un jour avec 'coffres' et 'robots'
  let jour = null; for (let d = 1; d <= 28 && !jour; d++) { const k = `2026-03-${String(d).padStart(2, '0')}`, l = B.contratsDuJour(k).map((x) => x.type); if (l.indexOf('coffres') >= 0 && l.indexOf('robots') >= 0) jour = k; }
  const ms = Date.parse(jour + 'T12:00:00+01:00'), defs = B.contratsDuJour(jour), ic = defs.findIndex((x) => x.type === 'coffres'), ir = defs.findIndex((x) => x.type === 'robots');
  let c = B.lireCoffre({ pieces: 0 });
  let pr = B.progression(c, { extrait: false, coffresPar: { rare: 1, epique: 1, legendaire: 0, commun: 5 }, killsRobots: 2 }, ms); c = pr.coffre;
  const attendu = defs[ic].rarete === 'rare' ? 2 : 1;
  check(c.contrats.jour === jour && c.contrats.etats[ic].prog === attendu && c.contrats.etats[ir].prog === 2 && pr.avances.indexOf(ic) >= 0, `progression : coffres de la rareté ou mieux (${attendu}), robots (2), même sans sortir`);
  pr = B.progression(c, { extrait: true, coffresPar: { legendaire: 9 }, killsRobots: 30 }, ms); c = pr.coffre;
  check(c.contrats.etats[ic].fait && c.contrats.etats[ir].fait && c.contrats.etats[ir].prog === defs[ir].but, 'contrats faits (bornés au but)');
  const rc = B.reclamer(c, ir, ms);
  check(rc.ok && rc.gain === defs[ir].recompense && rc.coffre.pieces === defs[ir].recompense && !B.reclamer(rc.coffre, ir, ms).ok && !B.reclamer(rc.coffre, 9, ms).ok, `réclamer : +${rc.gain} pièces, une seule fois`);
  const lendemain = B.progression(rc.coffre, {}, ms + 86400000).coffre;
  check(lendemain.contrats.jour !== jour && lendemain.contrats.etats.every((e) => e.prog === 0 && !e.fait), 'le lendemain : les contrats repartent de zéro');
  check(json(B.lireCoffre(JSON.parse(json(rc.coffre))).contrats) === json(rc.coffre.contrats), 'l’état des contrats se relit (sauvegarde)');
  // ramener, sortie, valeur : il faut sortir
  let jr = null; for (let d = 1; d <= 60 && !jr; d++) { const k = new Date(Date.UTC(2026, 3, d)).toISOString().slice(0, 10), l = B.contratsDuJour(k).map((x) => x.type); if (l.indexOf('ramener') >= 0 && l.indexOf('sortie') >= 0 && l.indexOf('valeur') >= 0) jr = k; }
  if (jr) {
    const df = B.contratsDuJour(jr), m2 = Date.parse(jr + 'T12:00:00+02:00'), ir2 = df.findIndex((x) => x.type === 'ramener'), is2 = df.findIndex((x) => x.type === 'sortie'), iv2 = df.findIndex((x) => x.type === 'valeur');
    const ligne = { objets: [df[ir2].id], point: df[is2].point, valeur: df[iv2].x + 1 };
    const sans = B.progression(null, Object.assign({ extrait: false }, ligne), m2).coffre.contrats.etats, avec = B.progression(null, Object.assign({ extrait: true }, ligne), m2).coffre.contrats.etats;
    check(sans.every((e) => !e.fait) && avec.every((e) => e.fait), `ramener / sortie / valeur : faits seulement en sortant (${jr})`);
  } else check(false, 'un jour avec ramener, sortie et valeur');
}

console.log(`\n${oks} ok, ${fails} en échec`);
process.exit(fails ? 1 : 0);
