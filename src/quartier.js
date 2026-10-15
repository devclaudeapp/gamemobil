/* LE FOURNIL — l'événement « Le Quartier » : les règles pures de la Planque, la boutique à part de l'événement (du mardi 13 octobre
   2026 à midi au mardi 27 octobre 2026 à midi, heure de Paris). Une parodie pour adultes, derrière une porte « 18 ans et + » : un petit
   trafic de quartier façon dessin animé, des noms, des gags et des mécaniques de jeu — jamais la moindre information réelle.
   Tout le monde part de zéro, avec sa propre monnaie (les billets), ses six produits, ses postes, ses « apprentis », ses améliorations,
   ses coups de pouce ; les gains d'absence sont plafonnés comme ceux de la boulangerie (sur l'horloge de confiance : « maintenant »
   est toujours donné par l'appelant, jamais lu ici). Douze paliers de billets gagnés, les mêmes pour tous, donnent des récompenses
   POUR LA BOULANGERIE (étoiles, boosts en réserve, décos du quartier, vêtements) : voir PALIERS ; huit paliers bonus « après le boss »
   (13 à 20) et quatre combines de plus attendent ceux qui ont franchi le 12e avant la fin. À la fin, la Planque ferme ; tout le
   reste reste à vie. Aucune dépendance au DOM ni à game.js : tourne aussi dans Node (test/fournil-quartier.test.js, qui simule le rythme). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QUARTIER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─── l'heure de Paris (la même règle que game.js et classement.js : l'heure d'été du dernier dimanche de mars au dernier dimanche d'octobre, à 1 h UTC) ───
  function decalageParis(ms) {
    const a = new Date(ms).getUTCFullYear();
    const dernierDimanche = (mois) => { const d = new Date(Date.UTC(a, mois + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime(); };
    return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 * 3600e3 : 3600e3;
  }
  const paris = (ms) => new Date(ms + decalageParis(ms));
  function parisMs(a, m, j, h) { // une heure de Paris → ms (en deux passes : le décalage dépend de la date)
    let t = Date.UTC(a, m - 1, j, h) - 3600e3; t = Date.UTC(a, m - 1, j, h) - decalageParis(t); return Date.UTC(a, m - 1, j, h) - decalageParis(t);
  }
  const dayKey = (ms) => { const d = paris(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

  // ─── la fenêtre : du mardi 13 octobre 2026 à 12 h au mardi 27 octobre 2026 à 12 h, heure de Paris (le 25, l'heure d'hiver arrive : 11 h UTC) ───
  const DEBUT = parisMs(2026, 10, 13, 12), FIN = parisMs(2026, 10, 27, 12), JOUR = 864e5;
  const CLASSEMENT_JUSQUA = FIN + 14 * JOUR; // l'onglet « Événement » du classement reste visible deux semaines après la fin (le podium final)
  function fenetre(now) {
    const t = Number.isFinite(now) ? now : 0;
    const avant = t < DEBUT, fini = t >= FIN, ouvert = !avant && !fini;
    const jour = avant ? 0 : fini ? 15 : Math.min(15, Math.round((Date.parse(dayKey(t) + 'T12:00:00Z') - Date.parse(dayKey(DEBUT) + 'T12:00:00Z')) / JOUR) + 1); // le jour de Paris : du 13 (1) au 27 (15)
    return { avant, ouvert, fini, reste: ouvert ? FIN - t : 0, dans: avant ? DEBUT - t : 0, jour, jours: 15, classement: t >= DEBUT && t < CLASSEMENT_JUSQUA };
  }
  // l'ouverture se lit aussi sur l'HEURE SÛRE (HORLOGE.etat().sure : une borne basse du vrai temps) : une horloge du téléphone avancée
  // hors ligne (le jeu lui accorde jusqu'à une absence d'avance) n'ouvre pas la Planque avant mardi midi. Sans heure sûre connue
  // (artefact Claude, jamais en ligne) : le « maintenant » du jeu seul. La fin, elle, se lit toujours sur le « maintenant » du jeu.
  function fenetreSure(now, sure) {
    const f = fenetre(now);
    return f.ouvert && Number.isFinite(sure) && sure > 0 && sure < DEBUT ? fenetre(sure) : f;
  }
  const GRACE = 3600e3; // le serveur compte encore les billets une heure après la fin (ceux d'avant la fin, plafonnés à l'enveloppe de la fin)
  const envoiBillets = (now) => Number.isFinite(now) && now >= DEBUT && now < FIN + GRACE;

  // ─── les six produits de la Planque, dans l'ordre où on les débloque (les billets : en €, comme la boulangerie, mais un autre tiroir) ───
  const PRODUITS = [
    { id: 'herbe', nom: 'Herbe', pl: 'sachets d’herbe', cout: 4, debloquer: 0, rev: 1, temps: 1.5, croiss: 1.07, staff: 1500, staffNom: 'Guetteur Kévin', poste: 'Le banc du square', desc: 'Le classique. Ça sent jusqu’au troisième.' },
    { id: 'shit', nom: 'Shit', pl: 'barrettes', cout: 60, debloquer: 120, rev: 20, temps: 3, croiss: 1.15, staff: 22500, staffNom: 'Charbonneur Dylan', poste: 'Le hall du bâtiment B', desc: 'Emballé dans du papier alu, comme un sandwich.' },
    { id: 'champis', nom: 'Champis', pl: 'poignées de champis', cout: 720, debloquer: 1440, rev: 150, temps: 6, croiss: 1.14, staff: 150000, staffNom: 'Nourrice Mémé Jacqueline', poste: 'La cave de Mémé', desc: 'Cueillis « dans le pré d’à côté », paraît-il.' },
    { id: 'ecsta', nom: 'Ecsta', pl: 'pochons de cachetons', cout: 8640, debloquer: 17280, rev: 1200, temps: 12, croiss: 1.13, staff: 750000, staffNom: 'Rabatteur Momo', poste: 'Le parking de la boîte', desc: 'Roses, avec un petit cœur dessus.' },
    { id: 'coke', nom: 'Coke', pl: 'pochettes', cout: 1e5, debloquer: 2e8, rev: 10000, temps: 24, croiss: 1.12, staff: 6e8, staffNom: 'Comptable Tonton Serge', poste: 'L’arrière-salle du PMU', desc: 'La clientèle a des mocassins.' },
    { id: 'specialite', nom: 'La Spécialité du quartier', pl: 'Spécialités', cout: 1.2e6, debloquer: 2e10, rev: 9e4, temps: 96, croiss: 1.11, staff: 6e10, staffNom: 'Livreur Rachid', poste: 'Le camion à kebabs', desc: 'Personne ne sait ce qu’il y a dedans. Tout le monde en redemande.' },
  ];
  const PALIERS_POSTE = [25, 50, 100, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000]; // comme la boulangerie : les gains doublent
  const AMELIORATIONS = [
    { id: 'sachets', nom: 'Sachets zippés', cout: 50000, cible: ['herbe'], mult: 3, desc: 'Herbe ×3' },
    { id: 'alu', nom: 'Papier alu premium', cout: 600000, cible: ['shit'], mult: 3, desc: 'Shit ×3' },
    { id: 'balance', nom: 'Balance de précision', cout: 3e6, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'cave', nom: 'Cave humide', cout: 8e6, cible: ['champis'], mult: 3, desc: 'Champis ×3' },
    { id: 'soirees', nom: 'Soirées privées', cout: 8e7, cible: ['ecsta'], mult: 3, desc: 'Ecsta ×3' },
    { id: 'scooter', nom: 'Scooter débridé', cout: 2e8, cible: ['herbe', 'shit'], mult: 5, desc: 'Herbe et shit ×5' },
    { id: 'reseau', nom: 'Réseau du quartier', cout: 5e8, cible: null, mult: 2, desc: 'Tout ×2' },
    { id: 'vip', nom: 'Clientèle VIP', cout: 1e10, cible: ['coke'], mult: 3, desc: 'Coke ×3' },
    { id: 'kebab', nom: 'Camion à kebabs blindé', cout: 3e11, cible: ['specialite'], mult: 3, desc: 'Spécialité ×3' },
    { id: 'cartel', nom: 'Franchise du cartel', cout: 6e12, cible: null, mult: 3, desc: 'Tout ×3' },
    // après le boss (palier 12 franchi) : quatre combines chères qui ne multiplient pas les ventes (l'enveloppe du serveur, voir
    // fournil_quartier_table : le marathon simulé doit rester ×2 dessous) ; elles adoucissent les coups de pouce et l'absence (effet)
    { id: 'guetteurs', nom: 'Guetteurs sur les toits', cout: 1e15, apres: 12, cible: [], mult: 1, effet: { descenteN: 8, descentePart: 0.05 }, desc: 'Descentes : 8 touches suffisent, la police n’embarque plus que 5 %' },
    { id: 'matelas', nom: 'Le matelas de Mémé Jacqueline', cout: 2e15, apres: 12, cible: [], mult: 1, effet: { absenceH: 12, absencePart: 0.2 }, desc: 'Absence : l’équipe bosse 12 h, à 20 % du rythme' },
    { id: 'sono', nom: 'Sono qui fait trembler le square', cout: 4e15, apres: 12, cible: [], mult: 1, effet: { soireeDuree: 180 }, desc: 'Soirées : 3 min au lieu de 2' },
    { id: 'trottinette', nom: 'Trottinette électrique du livreur', cout: 8e15, apres: 12, cible: [], mult: 1, effet: { scooterDuree: 20, scooterPrime: 3 }, desc: 'Le livreur attend 20 s, son bonus ×3' },
  ];
  const effet = (q, cle, defaut) => { for (const a of AMELIORATIONS) if (a.effet && a.effet[cle] != null && q.ameliorations && q.ameliorations[a.id]) return a.effet[cle]; return defaut; }; // une combine « après le boss » achetée change ce réglage
  const ABSENCE_MAX_H = 8;   // les apprentis bossent 8 h au plus pendant une absence, comme à la boulangerie…
  const ABSENCE_PART = 0.1;  // … mais au ralenti : sans le boss, le quartier dort (10 % du rythme)
  const PRESENCE = 6;        // le boss est là : toutes les ventes ×6 tant que la Planque est ouverte (c'est en jouant qu'on grimpe)
  const REPUTATION = 1.5;    // chaque palier franchi fait la réputation du quartier : toutes les ventes ×1,5 de plus (×1,5¹² au 12e)
  const EVENEMENTS = {
    descente: { duree: 15, n: 12, part: 0.1 },  // descente de police : 12 touches en 15 s pour tout planquer (prime) ; sinon la police embarque 10 % des billets
    grosclient: { duree: 180, prime: 6 },        // un gros client : N unités en 3 min, payées 6 fois
    soiree: { duree: 120, mult: 2 },             // soirée : toutes les ventes ×2 pendant 2 min
    scooter: { duree: 10 },                      // le livreur en scooter passe : attraper le bonus en 10 s
  };

  // ─── les douze paliers : des billets gagnés (total), les mêmes pour tous ; chacun donne une récompense pour la boulangerie ───
  // Réglés sur la simulation (test/fournil-quartier.test.js, et scratchpad quartier/evenement/regler.js) : un assidu (80 min par jour, en
  // quatre sessions) franchit le 12e le 11e jour ; un quotidien (36 min par jour) le 8e le 9e jour, le 9e le 11e, le 10e le dernier jour ;
  // un occasionnel (17 min) le 6e vers le 8e jour. C'est en jouant qu'on grimpe (PRESENCE) : les gains d'absence ne font que suivre.
  // Après le boss (bonus: true), les paliers 13 à 20 : pour ceux qui franchissent le 12e bien avant la fin. Un très actif (8 h par jour,
  // le 12e au 3e jour) en franchit un tous les jour ou deux ; le marathon (24 h/24) n'atteint le 20e que vers le 13e jour. Ils ne font
  // plus la réputation (REPUTATION ne compte que les douze premiers : l'enveloppe du serveur ne bouge pas) ; ils donnent des étoiles,
  // des boosts, un titre, et au 20e la casquette néon (un trophée de la garde-robe, distinct de la tenue en or du podium final).
  const PALIERS = [
    { n: 1, total: 1.2e8, etoiles: 1, boost: { mult: 2, secs: 1800 }, titre: 'Premiers billets' },
    { n: 2, total: 2.5e8, deco: 'graffiti', titre: 'Le mur du quartier' },
    { n: 3, total: 6e10, vetement: 'quartier-casquette', titre: 'La casquette' },
    { n: 4, total: 2e11, etoiles: 2, boost: { mult: 2, secs: 1800 }, titre: 'Le coin des habitués' },
    { n: 5, total: 1.4e12, deco: 'neon', titre: 'L’enseigne néon' },
    { n: 6, total: 3.5e12, vetement: 'quartier-sweat', titre: 'Le sweat à capuche' },
    { n: 7, total: 1.1e13, boost: { mult: 5, secs: 900 }, titre: 'Le gros coup' },
    { n: 8, total: 2.4e13, deco: 'scooter', titre: 'Le scooter' },
    { n: 9, total: 5e13, vetement: 'quartier-baskets', titre: 'Les baskets' },
    { n: 10, total: 1e14, etoiles: 2, boost: { mult: 2, secs: 3600 }, titre: 'Le caïd' },
    { n: 11, total: 2e14, deco: 'chien', titre: 'Le chien du quartier' },
    { n: 12, total: 5e14, vetement: 'quartier-chaine', etoiles: 3, boost: { mult: 5, secs: 1800 }, titre: 'Le boss du quartier' },
    { n: 13, total: 1.5e15, bonus: true, boost: { mult: 2, secs: 1800 }, titre: 'Le boss a pris des vacances (non)' },
    { n: 14, total: 3.5e15, bonus: true, etoiles: 1, titre: 'Les pigeons du square te saluent' },
    { n: 15, total: 6e15, bonus: true, boost: { mult: 2, secs: 3600 }, titre: 'Le PMU t’ouvre une ardoise' },
    { n: 16, total: 9e15, bonus: true, etoiles: 1, titre: 'Ta tête sur les tee-shirts du marché' },
    { n: 17, total: 1.3e16, bonus: true, boost: { mult: 5, secs: 900 }, titre: 'Mémé Jacqueline te tricote un bonnet' },
    { n: 18, total: 1.8e16, bonus: true, etoiles: 1, titre: 'Le chien du quartier porte ton nom' },
    { n: 19, total: 2.2e16, bonus: true, boost: { mult: 2, secs: 3600 }, titre: 'La mairie parle d’une statue' },
    { n: 20, total: 1.1e17, bonus: true, vetement: 'quartier-neon-casquette', etoiles: 2, boost: { mult: 5, secs: 1800 }, titre: 'La légende en néon' },
  ];
  const PALIERS_BOSS = 12; // le dernier palier « normal » ; après lui, les paliers bonus
  const TROPHEE = 'quartier-neon-casquette'; // la casquette néon du palier 20 (garde-robe : collection « quartier-neon »)
  const VETEMENTS = ['quartier-casquette', 'quartier-sweat', 'quartier-baskets', 'quartier-chaine'];
  const VETEMENTS_OR = ['quartier-or-casquette', 'quartier-or-sweat', 'quartier-or-baskets', 'quartier-or-chaine']; // le podium final
  const DECOS = ['graffiti', 'neon', 'scooter', 'chien'];

  // ─── l'état : st.quartier, créé à la première visite (dans la sauvegarde du jeu) ───
  function postesNeufs() { return PRODUITS.map((p, i) => ({ niv: i === 0 ? 1 : 0, staff: false, prog: 0, actif: false })); }
  function neuf(now) {
    return { v: 1, majeur: false, masque: false, annonce: false, bilan: false, billets: 0, total: 0, postes: postesNeufs(), ameliorations: {}, mode: 1,
      ev: null, evTimer: 150, dernierEv: '', boost: null, lastSeen: now, now, ouvertLe: 0, paliers: [], vetements: [], decos: [], etoiles: 0, boosts: 0,
      stats: { ventes: 0, taps: 0, descentes: 0, descentesRatees: 0, grosClients: 0, scooters: 0, soirees: 0, embauches: 0, saisi: 0 }, carnet: [] };
  }
  function etat(st, now) { // l'état de l'événement, remis d'aplomb
    let q = st.quartier;
    if (!q || typeof q !== 'object' || !Array.isArray(q.postes)) q = st.quartier = neuf(now);
    while (q.postes.length < PRODUITS.length) q.postes.push({ niv: 0, staff: false, prog: 0, actif: false });
    for (const k of ['paliers', 'vetements', 'decos', 'carnet']) if (!Array.isArray(q[k])) q[k] = [];
    if (!q.stats || typeof q.stats !== 'object') q.stats = neuf(now).stats;
    if (!q.ameliorations || typeof q.ameliorations !== 'object') q.ameliorations = {};
    if (!(q.billets >= 0)) q.billets = 0; if (!(q.total >= 0)) q.total = 0;
    return q;
  }
  const note = (q, txt) => { q.carnet.push({ t: q.now, txt }); if (q.carnet.length > 12) q.carnet.shift(); };

  // ─── calculs ───
  const palierMult = (niv) => Math.pow(2, PALIERS_POSTE.filter((p) => niv >= p).length);
  const prochainPalier = (niv) => PALIERS_POSTE.find((p) => p > niv) || null;
  function ameliorationMult(q, i) { let m = 1; for (const a of AMELIORATIONS) if (q.ameliorations[a.id] && (a.cible === null || a.cible.includes(PRODUITS[i].id))) m *= a.mult; return m; }
  function boostMult(q) { let m = PRESENCE; if (q.ev && q.ev.type === 'soiree' && q.ev.fin > q.now) m *= EVENEMENTS.soiree.mult; return m; } // en présence du boss
  const reputationMult = (q) => Math.pow(REPUTATION, paliersAtteints(q).filter((p) => !p.bonus).length); // les paliers bonus ne font plus la réputation
  const temps = (q, i) => PRODUITS[i].temps;
  const revenuBase = (q, i) => { const s = q.postes[i]; return s.niv <= 0 ? 0 : PRODUITS[i].rev * s.niv * palierMult(s.niv) * ameliorationMult(q, i) * reputationMult(q); };
  const revenu = (q, i) => revenuBase(q, i) * boostMult(q);
  const revenuFournee = (q, i) => revenu(q, i) * (q.postes[i].staff ? 1 : 1.5); // à la main, on sert un client de plus
  const coutNiveau = (i, niv) => (niv === 0 ? PRODUITS[i].debloquer : PRODUITS[i].cout * Math.pow(PRODUITS[i].croiss, niv));
  function coutNiveaux(i, niv, n) { if (niv === 0) return PRODUITS[i].debloquer; const r = PRODUITS[i].croiss; return PRODUITS[i].cout * Math.pow(r, niv) * (Math.pow(r, n) - 1) / (r - 1); }
  function maxNiveaux(i, niv, billets) { const r = PRODUITS[i].croiss, a = PRODUITS[i].cout * Math.pow(r, niv); if (billets < a) return 0; return Math.floor(Math.log(billets * (r - 1) / a + 1) / Math.log(r)); }
  function quantite(q, i) { const s = q.postes[i]; if (s.niv === 0) return 1; if (q.mode === 'max') return Math.max(1, maxNiveaux(i, s.niv, q.billets)); return q.mode; }
  const prixNiveaux = (q, i, n) => coutNiveaux(i, q.postes[i].niv, n);
  const prixStaff = (q, i) => PRODUITS[i].staff;
  function tauxBase(q) { let t = 0; q.postes.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenuBase(q, i) / temps(q, i); }); return t; }
  function tauxParSeconde(q) { let t = 0; q.postes.forEach((s, i) => { if (s.staff && s.niv > 0) t += revenu(q, i) / temps(q, i); }); return t; }
  function rythme(q) { const t = tauxBase(q); if (t > 0) return t; let best = 0; q.postes.forEach((s, i) => { if (s.niv > 0) best = Math.max(best, revenuBase(q, i) / Math.max(1, temps(q, i)) * 0.5); }); return Math.max(0.5, best); }
  function arrondi(n) { if (n < 10) return Math.max(1, Math.round(n)); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / p) * p; }
  const heuresAbsence = (q) => (q ? effet(q, 'absenceH', ABSENCE_MAX_H) : ABSENCE_MAX_H);
  const partAbsence = (q) => (q ? effet(q, 'absencePart', ABSENCE_PART) : ABSENCE_PART);

  // ─── actions ───
  function gagner(q, montant) { q.billets += montant; q.total += montant; }
  function acheter(q, i) {
    const s = q.postes[i], n = quantite(q, i), prix = prixNiveaux(q, i, n);
    if (i > 0 && s.niv === 0 && q.postes[i - 1].niv === 0) return { ok: false, prix, verrou: true };
    if (q.billets < prix) return { ok: false, prix };
    q.billets -= prix; const deblocage = s.niv === 0; s.niv += n;
    if (deblocage) note(q, `${PRODUITS[i].nom} : nouveau produit`);
    return { ok: true, n, prix, deblocage };
  }
  function embaucher(q, i) {
    const s = q.postes[i], prix = prixStaff(q, i);
    if (s.staff || s.niv <= 0 || q.billets < prix) return { ok: false, prix };
    q.billets -= prix; s.staff = true; s.actif = true; q.stats.embauches++; note(q, `${PRODUITS[i].staffNom} rejoint l’équipe`);
    return { ok: true, prix };
  }
  function lancer(q, i) { const s = q.postes[i]; if (s.niv <= 0 || s.actif) return false; s.actif = true; s.prog = 0; q.stats.taps++; return true; }
  const combineOuverte = (q, a) => !a.apres || q.total >= PALIERS[a.apres - 1].total; // les combines « après le boss » : une fois le palier franchi
  function amelioration(q, id) {
    const a = AMELIORATIONS.find((x) => x.id === id), prix = a ? a.cout : 0;
    if (a && !combineOuverte(q, a)) return { ok: false, prix, verrou: true };
    if (!a || q.ameliorations[id] || q.billets < prix) return { ok: false, prix };
    q.billets -= prix; q.ameliorations[id] = true; note(q, `${a.nom} : ${a.desc}`);
    return { ok: true, a, prix };
  }

  // ─── les coups de pouce : un toutes les 2 à 5 minutes de jeu dans la Planque, jamais deux fois le même d'affilée ───
  const TYPES_EV = [
    { type: 'descente', poids: 2, ok: (q) => q.billets > 0 },
    { type: 'grosclient', poids: 2, ok: (q) => q.postes.some((s, i) => s.niv > 0 && PRODUITS[i].temps <= 15) },
    { type: 'soiree', poids: 2, ok: () => true },
    { type: 'scooter', poids: 1.5, ok: () => true },
  ];
  function lancerEvenement(q, rnd, type) {
    rnd = rnd || Math.random;
    if (!type) {
      const choix = TYPES_EV.filter((t) => t.ok(q) && t.type !== q.dernierEv);
      if (!choix.length) return null;
      let total = 0; const poids = choix.map((t) => { total += t.poids; return t.poids; });
      let r = rnd() * total; type = choix[choix.length - 1].type;
      for (let k = 0; k < choix.length; k++) { r -= poids[k]; if (r <= 0) { type = choix[k].type; break; } }
    }
    q.dernierEv = type;
    const E = EVENEMENTS;
    if (type === 'descente') q.ev = { type, taps: 0, n: effet(q, 'descenteN', E.descente.n), debut: q.now, fin: q.now + E.descente.duree * 1000, prime: arrondi(Math.max(20, rythme(q) * 240)), enjeu: Math.floor(q.billets * effet(q, 'descentePart', E.descente.part)) };
    else if (type === 'grosclient') {
      const idx = q.postes.map((s, i) => i).filter((i) => q.postes[i].niv > 0 && PRODUITS[i].temps <= 15);
      if (!idx.length) return lancerEvenement(q, rnd, 'soiree');
      const i = idx[Math.floor(rnd() * idx.length)], s = q.postes[i], n = Math.max(3, Math.min(s.staff ? 400 : 20, arrondi(E.grosclient.duree / PRODUITS[i].temps * (s.staff ? 0.7 : 0.3))));
      q.ev = { type, i, n, fait: 0, debut: q.now, fin: q.now + E.grosclient.duree * 1000, prime: arrondi(revenuBase(q, i) * n * E.grosclient.prime), livree: false };
    } else if (type === 'scooter') q.ev = { type, debut: q.now, fin: q.now + effet(q, 'scooterDuree', E.scooter.duree) * 1000, prime: arrondi(Math.max(10, rythme(q) * 120) * effet(q, 'scooterPrime', 1)) };
    else q.ev = { type: 'soiree', debut: q.now, fin: q.now + effet(q, 'soireeDuree', E.soiree.duree) * 1000 };
    return q.ev;
  }
  function planquer(q) { // la descente : une touche ; à la 12e, tout est planqué et la prime tombe
    const ev = q.ev; if (!ev || ev.type !== 'descente' || ev.fin <= q.now) return { ok: false };
    ev.taps++; if (ev.taps < ev.n) return { ok: true, fini: false, taps: ev.taps };
    gagner(q, ev.prime); q.stats.descentes++; note(q, `Descente déjouée : +${fmt(ev.prime)} €`); q.ev = null;
    return { ok: true, fini: true, prime: ev.prime };
  }
  function livrer(q) {
    const ev = q.ev; if (!ev || ev.type !== 'grosclient' || ev.fait < ev.n || ev.livree) return { ok: false };
    ev.livree = true; gagner(q, ev.prime); q.stats.grosClients++; note(q, `Gros client livré : +${fmt(ev.prime)} €`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function attraper(q) { // le livreur en scooter : on attrape le bonus avant qu'il reparte
    const ev = q.ev; if (!ev || ev.type !== 'scooter' || ev.fin <= q.now) return { ok: false };
    gagner(q, ev.prime); q.stats.scooters++; note(q, `Le livreur a laissé +${fmt(ev.prime)} €`); q.ev = null;
    return { ok: true, prime: ev.prime };
  }
  function finEvenement(q, ev) { // un coup de pouce qui finit sans toi : la descente ratée coûte sa part de billets
    if (ev.type === 'descente') { const saisi = Math.min(q.billets, ev.enjeu || 0); q.billets -= saisi; q.stats.descentesRatees++; q.stats.saisi += saisi; note(q, `Descente : la police embarque ${fmt(saisi)} €`); return { saisi }; }
    if (ev.type === 'soiree') q.stats.soirees++;
    return {};
  }

  // ─── les paliers franchis : ce qu'il reste à donner (chaque palier une seule fois, dans l'ordre) ───
  const paliersAtteints = (q) => PALIERS.filter((p) => q.total >= p.total);
  function paliersDus(q) { return PALIERS.filter((p) => q.total >= p.total && !q.paliers.includes(p.n)); }
  function marquerPalier(q, n) { // le palier n est réclamé : on note ce qu'il donne (l'interface le distribue dans la boulangerie)
    const p = PALIERS.find((x) => x.n === n); if (!p || q.paliers.includes(n) || q.total < p.total) return null;
    q.paliers.push(n);
    if (p.vetement && !q.vetements.includes(p.vetement)) q.vetements.push(p.vetement);
    if (p.deco && !q.decos.includes(p.deco)) q.decos.push(p.deco);
    if (p.etoiles) q.etoiles += p.etoiles; if (p.boost) q.boosts++;
    note(q, `Palier ${n} : ${p.titre}`);
    return p;
  }
  const ensembleComplet = (q) => VETEMENTS.every((v) => q.vetements.includes(v));
  function phrasePalier(p) { // ce que donne un palier, en une ligne
    const l = [];
    if (p.etoiles) l.push(`${p.etoiles} étoile${p.etoiles > 1 ? 's' : ''}`);
    if (p.boost) l.push(`boost ×${p.boost.mult} ${fmtDuree(p.boost.secs)}`);
    if (p.deco) l.push({ graffiti: 'graffiti sur le mur', neon: 'enseigne néon', scooter: 'scooter devant la porte', chien: 'le chien du quartier' }[p.deco]);
    if (p.vetement) l.push({ 'quartier-casquette': 'casquette du quartier', 'quartier-sweat': 'sweat à capuche', 'quartier-baskets': 'baskets', 'quartier-chaine': 'chaîne en or (l’ensemble complet)', 'quartier-neon-casquette': 'la casquette néon (le trophée)' }[p.vetement]);
    return l.join(' · ');
  }

  // ─── un pas de jeu dans la Planque (dt en secondes, nowMs sur l'horloge de confiance) ───
  const TROU = 10000, REPRISE = 90; // un trou de plus de 10 s entre deux pas (téléphone verrouillé, autre appli) : c'était une absence
  function tick(q, dt, nowMs, rnd) {
    rnd = rnd || Math.random;
    if (q.now && nowMs - q.now > TROU) { q.ev = null; q.evTimer = Math.max(q.evTimer, REPRISE + rnd() * 60); } // le coup de pouce en cours s'efface sans pénalité (pas de descente ratée sans toi), et rien ne surgit au retour
    q.now = nowMs;
    const out = { ventes: [], nouvelEv: null, finEv: null, paliers: [] };
    q.postes.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(q, i); s.prog += dt; if (s.prog < T) return;
      let n = Math.floor(s.prog / T);
      if (!s.staff) { n = 1; s.prog = 0; s.actif = false; } else s.prog -= n * T;
      const m = revenuFournee(q, i) * n; gagner(q, m); q.stats.ventes += n;
      if (q.ev && q.ev.type === 'grosclient' && q.ev.i === i) q.ev.fait = Math.min(q.ev.n, q.ev.fait + n);
      out.ventes.push({ i, montant: m, n });
    });
    if (q.ev && q.ev.fin <= nowMs && !(q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n)) { out.finEv = q.ev; out.fin = finEvenement(q, q.ev); q.ev = null; }
    if (!q.ev) { q.evTimer -= dt; if (q.evTimer <= 0) { q.evTimer = 120 + rnd() * 180; out.nouvelEv = lancerEvenement(q, rnd); } }
    out.paliers = paliersDus(q);
    return out;
  }
  // ─── l'absence : les apprentis ont bossé (8 h au plus, 12 h avec le matelas), les fournées en cours se terminent ; pas de coup de pouce sans toi ───
  function absence(q, nowMs) {
    q.now = nowMs; q.ev = null; q.evTimer = Math.max(q.evTimer || 0, REPRISE); // au retour, au moins 1 min 30 avant le prochain coup de pouce
    const secs = Math.min(heuresAbsence(q) * 3600, Math.max(0, (nowMs - q.lastSeen) / 1000)), part = partAbsence(q);
    let total = 0; const detail = [];
    q.postes.forEach((s, i) => {
      if (s.niv <= 0 || !s.actif) return;
      const T = temps(q, i);
      if (s.staff) { const n = Math.floor((s.prog + secs) / T); s.prog = (s.prog + secs) % T; if (n > 0) { const m = revenuBase(q, i) * n * part; total += m; detail.push({ i, n, m }); q.stats.ventes += n; } }
      else if (s.prog + secs >= T) { const m = revenuBase(q, i) * 1.5 * part; total += m; detail.push({ i, n: 1, m }); s.prog = 0; s.actif = false; q.stats.ventes++; }
      else s.prog += secs;
    });
    if (total > 0) gagner(q, total);
    q.lastSeen = nowMs;
    return { secs, total, detail };
  }

  // ─── la simulation du rythme (pour les tests et le réglage des paliers) : des sessions par jour, une politique gloutonne ───
  const PROFILS = { // comme test/longevite.js : les heures de Paris des sessions et leur durée en minutes
    assidu: { sessions: [[7.5, 15], [12.25, 15], [18, 20], [22, 30]] },
    quotidien: { sessions: [[7.75, 8], [12.5, 8], [21, 20]] },
    occasionnel: { sessions: [[8, 5], [20.5, 12]] },
    marathon: { sessions: [[0, 714], [12, 714]] }, // 23 h 48 sur 24 (deux sessions, l'une à midi) : l'enveloppe du serveur
    tresactif: { sessions: [[7, 90], [11.5, 120], [16.5, 120], [20.5, 150]] }, // 8 h par jour : le 12e au 3e jour, comme les plus mordus (puis les paliers bonus)
  };
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function decider(q) { // acheter : apprenti, déblocage, amélioration, puis le meilleur rapport gain / prix
    let fait = false;
    for (let i = 0; i < PRODUITS.length; i++) { const s = q.postes[i]; if (s.niv > 0 && !s.staff && q.billets >= prixStaff(q, i)) { embaucher(q, i); fait = true; } }
    for (let i = 1; i < PRODUITS.length; i++) { const s = q.postes[i]; if (s.niv === 0 && q.postes[i - 1].niv > 0 && q.billets >= PRODUITS[i].debloquer) { acheter(q, i); fait = true; break; } }
    for (const a of AMELIORATIONS) if (!q.ameliorations[a.id] && q.billets >= a.cout * 1.2) { amelioration(q, a.id); fait = true; }
    const next = q.postes.findIndex((s) => s.niv === 0), taux = tauxParSeconde(q);
    if (next > 0 && q.billets < PRODUITS[next].debloquer && q.billets + taux * 600 >= PRODUITS[next].debloquer) return fait; // on économise pour le prochain produit
    const vise = AMELIORATIONS.find((a) => a.apres && !q.ameliorations[a.id] && combineOuverte(q, a)); // après le boss : on met de côté pour la combine suivante (huit heures de ventes au plus)
    if (vise && q.billets < vise.cout * 1.2 && vise.cout <= taux * 8 * 3600) return fait;
    for (let k = 0; k < 3; k++) {
      let best = -1, bestR = 0, bestN = 1;
      for (let i = 0; i < PRODUITS.length; i++) {
        const s = q.postes[i]; if (s.niv === 0) continue; const n = Math.min(10, maxNiveaux(i, s.niv, q.billets)); if (n < 1) continue;
        const prix = coutNiveaux(i, s.niv, n), gain = (PRODUITS[i].rev * (s.niv + n) * palierMult(s.niv + n) - PRODUITS[i].rev * s.niv * palierMult(s.niv)) * ameliorationMult(q, i) / PRODUITS[i].temps * (s.staff ? 1 : 0.3);
        const r = gain / prix; if (r > bestR) { bestR = r; best = i; bestN = n; }
      }
      if (best < 0) break;
      q.mode = q.billets > 30 * coutNiveaux(best, q.postes[best].niv, bestN) ? 'max' : bestN;
      if (acheter(q, best).ok) fait = true;
    }
    return fait;
  }
  function simuler(profil, jours, opts) { // rend { total, parJour: [{ j, total, billets, taux }], paliersJour: { n: jour } } ; opts : { graine, debut, offertes }
    opts = opts || {}; const prof = PROFILS[profil] || PROFILS.assidu, rnd = mulberry32(opts.graine || 7), st = {}, t0 = opts.debut || DEBUT;
    const q = etat(st, t0), parJour = [], paliersJour = {}, trace = []; q.lastSeen = t0;
    const H = 3600e3, nJ = jours || 14;
    const minuit0 = t0 - (paris(t0).getUTCHours() * 3600e3 + paris(t0).getUTCMinutes() * 60e3); // minuit, heure de Paris, du premier jour
    for (let j = 0; j < nJ; j++) {
      const jourDebut = minuit0 + j * JOUR;
      for (const [h, minutes] of prof.sessions) {
        const debut = jourDebut + h * H; // les sessions sont des heures de Paris ; le premier jour, l'événement ouvre à midi : celles du matin sont perdues
        if (debut < t0 || debut >= FIN) continue;
        absence(q, debut);
        for (let s = 0; s < minutes * 60; s++) {
          const now = debut + s * 1000; if (now >= FIN) break;
          let lances = 0; q.postes.forEach((x, i) => { if (x.niv > 0 && !x.staff && !x.actif && lances < 2) { lancer(q, i); lances++; } });
          const out = tick(q, 1, now, rnd);
          if (q.ev) {
            if (q.ev.type === 'descente') { planquer(q); if (rnd() < 0.7) planquer(q); }
            else if (q.ev.type === 'grosclient' && q.ev.fait >= q.ev.n) livrer(q);
            else if (q.ev.type === 'scooter' && rnd() < 0.5) attraper(q);
          }
          for (const p of out.paliers) { marquerPalier(q, p.n); paliersJour[p.n] = j + 1; if (opts.offertes && p.n === PALIERS_BOSS) for (const a of AMELIORATIONS) if (a.apres) q.ameliorations[a.id] = true; } // offertes : le pire cas de l'enveloppe (toutes les combines dès le 12e, sans les payer)
          if (s % 3 === 0) decider(q);
          if (s % 60 === 0) trace.push({ t: (now - t0) / JOUR, total: q.total });
        }
        q.lastSeen = debut + minutes * 60e3; trace.push({ t: (q.lastSeen - t0) / JOUR, total: q.total });
      }
      parJour.push({ j: j + 1, total: q.total, billets: q.billets, taux: tauxParSeconde(q), niv: q.postes.map((s) => s.niv), staff: q.postes.filter((s) => s.staff).length });
    }
    return { q, total: q.total, parJour, paliersJour, trace };
  }

  // ─── formats ───
  const SUFF = ['', 'k', 'M', 'Md', 'Bn', 'Bd', 'Tn', 'Td'];
  function fmt(n) {
    if (!Number.isFinite(n)) return '∞';
    if (n < 0) return '−' + fmt(-n);
    if (n < 1000) return (n < 10 && n !== Math.floor(n) ? n.toFixed(1) : Math.floor(n).toString()).replace('.', ',');
    let k = 0, v = n; while (v >= 1000 && k < SUFF.length - 1) { v /= 1000; k++; }
    if (v >= 1000) return n.toExponential(1).replace('.', ',').replace('e+', ' e');
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace('.0', '').replace('.', ',') + ' ' + SUFF[k];
  }
  const fmtEur = (n) => fmt(n) + ' €';
  function fmtDuree(s) { if (s < 59.5) return Math.round(s) + ' s'; const mn = Math.round(s / 60); if (mn < 60) return mn + ' min'; const h = Math.floor(mn / 60), m = mn % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; }
  const fmtChrono = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
  function fmtReste(ms) { // « 13 j 4 h », « 4 h 12 », « 12 min »
    const mn = Math.max(0, Math.round(ms / 60e3)), j = Math.floor(mn / 1440), h = Math.floor((mn % 1440) / 60), m = mn % 60;
    if (j > 0) return `${j} j ${h} h`; if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`; return `${m} min`;
  }

  return { DEBUT, FIN, CLASSEMENT_JUSQUA, JOUR, GRACE, fenetreSure, envoiBillets, ABSENCE_PART, PRESENCE, REPUTATION, reputationMult, fenetre, decalageParis, paris, parisMs, dayKey, PRODUITS, PALIERS_POSTE, AMELIORATIONS, ABSENCE_MAX_H, EVENEMENTS, PALIERS, PALIERS_BOSS, TROPHEE, VETEMENTS, VETEMENTS_OR, DECOS,
    neuf, etat, palierMult, prochainPalier, ameliorationMult, boostMult, temps, revenuBase, revenu, revenuFournee, coutNiveau, coutNiveaux, maxNiveaux, quantite, prixNiveaux, prixStaff, tauxBase, tauxParSeconde, rythme, arrondi, heuresAbsence, partAbsence, effet, combineOuverte,
    gagner, acheter, embaucher, lancer, amelioration, lancerEvenement, planquer, livrer, attraper, tick, absence, paliersAtteints, paliersDus, marquerPalier, ensembleComplet, phrasePalier,
    PROFILS, simuler, decider, fmt, fmtEur, fmtDuree, fmtChrono, fmtReste };
});
