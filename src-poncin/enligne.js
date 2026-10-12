/* OPÉRATION PONCIN — la partie en ligne : relie PRESEAU (les salons), PJEU (la simulation, chez l'hôte) et l'interface (PUI).
   L'hôte fait autorité : il simule toute la partie avec PJEU (robots compris, réglages du salon) et applique à chaque pas la dernière
   entrée reçue de chaque client ; il envoie l'état (« etat », 20 Hz, non fiable, nombres arrondis), les événements groupés (« evts »,
   fiable, ≤ 14 envois/s) et le résultat (« fin »). Le client montre une « façade » : un PJEU jamais simulé (même graine, mêmes joueurs
   dans le même ordre : mêmes robots, mêmes objets, même arène), dont les entités sont écrites par les instantanés de l'hôte ; les autres
   y sont interpolés ≥ 100 ms en arrière, son propre joueur est prédit sur place (PJEU.deplacer : la même physique) et recalé sur l'hôte
   (en douceur, net au-delà de 2 m) ; ses tirs montrent tout de suite l'éclair et la traînée (PJEU.tirVisuel), le marqueur de touche
   arrive avec « evts ». Il envoie ses commandes (« entree », tous les 2 pas de 1/60 s, non fiable) avec son regard en absolu, sa position
   prédite et sa piste (tc : son horloge en ms ; tr : [[Δtc, x, y, z, posture], …] les pas depuis l'entrée précédente, en relais les
   270 dernières ms). Piste chez l'hôte (conception C5, § 9.1) : 32 échantillons par client, validés à l'arrivée (vitesse, mur, hauteur,
   morts ; sinon accusé négatif et reprise de sa simulation au dernier point valide), lus avec un petit retard (max(45 ms ; 1,3 ×
   intervalle + 2,5 × gigue)) à une heure qui avance d'environ dt, prolongés 100 ms puis tenus ; l'hôte ne rejoue plus son mouvement ;
   sans nouvelles depuis 250 ms il reprend sa simulation. Un client sans tc est servi comme avant (position adoptée si elle est plausible).
   Chaque déplacement accepté (piste ou position adoptée) puise aussi dans un seau rempli au temps de l'HÔTE (vitesse max × 1,15 +
   0,3 m/s, 3 m au plus) : ni un tc qui court devant, ni des refus en cascade, ni des v = 0 n'y donnent de vitesse en plus. Les tirs :
   le client compte ceux qu'il a montrés (nt, dans chaque entrée) et l'hôte en fait autant, ni plus ni moins (un appui bref perdu, reçu
   dans le désordre ou écrasé par le relais ne se perd plus) ; une dette impayable en 600 ms (mort, recharge) s'éteint.
   Horloge douce chez le client (C6, § 9.2) : le temps de l'hôte suivi à ±5 % (net au-delà de 0,25 s), le retard d'interpolation qui
   glisse (±5 % de dt) ; ui.js appelle jeu.avantImage(maintenant) à chaque image (horloge, autres, événements à l'heure), jeu.etape(1/60)
   ne fait que la prédiction et l'entrée ; sans avantImage, etape fait tout comme avant. L'hôte compense la latence des tirs.
   Départs : un client muet 10 s est retiré ; l'hôte parti (ou muet 10 s) → fin de partie « L'hôte a quitté la partie ».
   API : PENLIGNE.ouvrir({ via, code, moi: { id, pseudo, couleur }, config, monde, carte }) → Promise<salon> ; PENLIGNE.pseudoAuHasard().
     salon.code, .idMoi, .via, .estHote, .hote, .reglages { bots, niveau, equipes }, .enJeu, .partie (null ou { k, jeu, idMoi, estHote, dans }),
     salon.joueurs() → [{ id, pseudo, couleur, pret, hote, moi, ping, voie }], salon.regler(o), salon.pret(oui), salon.renommer(pseudo), salon.lancer() → true | raison,
     salon.retourSalon(), salon.quitter(), salon.stats(), salon.sur(type, fn) → off ('maj', 'partie', 'salon', 'ferme').
   La partie passe par jeu.etape(dt, entrees) comme en solo (l'hôte : le vrai PJEU enveloppé ; le client : la façade, plus
   jeu.avantImage(maintenant) → événements de l'image) ; la fin arrive
   en événement { t: 'fin', classement, resultat } (resultat.raison = 'hote' si l'hôte est parti). Voir src-poncin/ARCHITECTURE.md,
   « Le jeu en ligne ». Rien ne sort d'ici en exception : tout est rattrapé et compté (console.warn, jamais console.error). */
const PENLIGNE = (() => {
  'use strict';
  const ETAT_MS = 50, EVTS_MS = 70, ENTREE_MS = 1000 / 30; // 20 états/s, ≤ 14,3 paquets d'événements/s, 30 entrées/s
  const DELAI = 0.1, DELAI_MAX = 0.45, MUET = 10000, NET = 2, ZONE_MORTE = 0.08, DANS = 3.6, TENU = 150, LACHE = 250;
  // DELAI : l'interpolation des autres, au moins 100 ms, plus si les états arrivent moins souvent (le relais du transport : ~5 envois/s) ;
  // TENU : un appui bref (saut, recharge, arme) est répété dans les entrées pendant ce temps (une entrée perdue ne le perd pas) ;
  // LACHE : sans entrée d'un client depuis ce temps (ou 2,5 × l'intervalle mesuré), l'hôte lui lâche les commandes (plus de course sans fin)
  const JETON_MAX = 3, DETTE_MS = 600, PAS_FIXE = 1 / 60;
  // JETON_MAX : le seau de déplacement de chaque client chez l'hôte (m) : il se remplit au temps de l'HÔTE (vitesse max × 1,15 + 0,3 m/s)
  // et chaque échantillon accepté y puise sa distance ; un tc qui court devant, des refus en cascade ou des v = 0 n'y gagnent rien ;
  // DETTE_MS : un tir compté par le client (nt) que l'hôte n'arrive pas à faire en ce temps (rechargement, mort) est abandonné ;
  // PAS_FIXE : le pas du rattrapage de l'hôte en arrière-plan (le même que celui de la boucle de ui.js)
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const fini = (v) => typeof v === 'number' && v - v === 0;
  // l'empreinte de la carte (source et nombre d'objets) : l'hôte l'envoie au lancement ; un client qui a une autre carte (vieille copie en cache) se retire
  const empreinte = (c) => c ? [c.source || '', (c.batiments || []).length, (c.arbres || []).length, (c.passages || []).length, (c.murs || []).length].join('/') : '';
  const num = (v, a, b) => (fini(v) ? (v < a ? a : v > b ? b : v) : 0);
  const ecartAngle = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return d; };
  const maintenant = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const G = (n) => (typeof self !== 'undefined' && self[n]) || (typeof window !== 'undefined' && window[n]) || null;
  const mod = (n, v) => { try { return v(); } catch (e) { return G(n); } };
  // les modules (constantes globales du même script, ou globales UMD) : résolus à l'usage
  const PJ = () => mod('PJEU', () => PJEU), PA = () => mod('PARENE', () => PARENE), PR = () => mod('PREGLES', () => PREGLES), PN = () => mod('PRESEAU', () => PRESEAU);
  let erreurs = 0, derniereErreur = '';
  function signaler(ou, e) { erreurs++; derniereErreur = ou + ' : ' + (e && e.message ? e.message : String(e)); if (erreurs <= 20) console.warn('[Poncin en ligne]', ou, e); }

  // ─── le pseudo par défaut : un animal, un adjectif invariable, deux chiffres (« Castor Turbo 42 ») ───
  const ANIMAUX = ['Castor', 'Renard', 'Loutre', 'Hibou', 'Lynx', 'Blaireau', 'Chamois', 'Héron', 'Pivert', 'Lapin', 'Belette', 'Marmotte', 'Tortue', 'Panda', 'Koala', 'Lama', 'Moineau', 'Truite', 'Brochet', 'Sanglier', 'Écureuil', 'Hérisson', 'Mouette', 'Escargot', 'Bouquetin', 'Grillon'];
  const ADJECTIFS = ['Turbo', 'Ninja', 'Cool', 'Zen', 'Disco', 'Flash', 'Choc', 'Pirate', 'Rock', 'Funky', 'Rétro', 'Laser', 'Néon', 'Pop', 'Super', 'Express', 'Cosmos', 'Max'];
  function pseudoAuHasard(rnd) {
    rnd = typeof rnd === 'function' ? rnd : Math.random;
    const a = ANIMAUX[Math.floor(rnd() * ANIMAUX.length)], b = ADJECTIFS[Math.floor(rnd() * ADJECTIFS.length)];
    return `${a} ${b} ${String(Math.floor(rnd() * 100)).padStart(2, '0')}`;
  }
  function couleurDe(texte) { const R = PR(), C = R ? R.COULEURS : ['#FF6B8B']; return C[(R ? R.hash(String(texte || '')) : 0) % C.length]; }

  // ─── le salon : présence, réglages de l'hôte, prêt, lancement, retour au salon ───
  async function ouvrir(o) {
    o = o || {};
    const P = PN(); if (!P) throw new Error('le module réseau manque');
    const salon = await P.salon({ via: o.via, code: o.code, moi: o.moi, config: o.config });
    return controleur(salon, o);
  }

  function controleur(salon, o) {
    const abonnes = new Map(), offs = [];
    const C = { envoyes: 0, recus: 0, t0: maintenant(), types: {} };
    let k = 0, timer = null, dernierRegl = 0, dernierPing = 0;
    const emettre = (t, d) => { const l = abonnes.get(t); if (l) for (const fn of Array.from(l)) { try { fn(d); } catch (e) { signaler('interface ' + t, e); } } };
    function envoyer(type, data, opt) {
      if (ctl.ferme) return false;
      let ok = false; try { ok = salon.envoyer(type, data, opt || { fiable: true }) !== false; } catch (e) { signaler('envoi ' + type, e); ok = false; }
      if (ok) { C.envoyes++; C.types[type] = (C.types[type] || 0) + 1; }
      return ok;
    }
    const ctl = {
      code: salon.code, idMoi: salon.moi.id, via: salon.via || o.via || 'local', ferme: false,
      get estHote() { return !!salon.estHote; }, get hote() { return salon.hote; },
      reglages: { mode: 'arene', bots: 0, niveau: 'normal', equipes: false }, pings: {}, voies: {}, enJeu: false, partie: null,
      joueurs, regler, pret, renommer, lancer, retourSalon, quitter, stats,
      sur(type, fn) { if (!abonnes.has(type)) abonnes.set(type, new Set()); abonnes.get(type).add(fn); return () => abonnes.get(type).delete(fn); },
      get salon() { return salon; },
    };
    const ecoute = (type, fn) => { offs.push(salon.sur(type, (d, de) => { if (ctl.ferme) return; if (type !== 'joueurs' && type !== 'hote' && type !== 'ferme') { C.recus++; C.types['<' + type] = (C.types['<' + type] || 0) + 1; } try { fn(d, de); } catch (e) { signaler('reçu ' + type, e); } })); };

    function joueurs() {
      const l = Array.from(salon.joueurs.values()).sort((a, b) => (a.depuis || 0) - (b.depuis || 0) || (a.id < b.id ? -1 : 1));
      return l.map((j) => {
        const mesure = ctl.pings[j.id], ping = j.id === salon.hote ? null : mesure != null ? mesure : j.ping > 0 ? j.ping : null; // mesuré par nous (salon, partie), sinon par le transport
        const voie = j.id === salon.hote ? 'hote' : j.voie || ctl.voies[j.id] || ''; // la voie que donne le transport (p2p, relais, local, connexion)
        return { id: j.id, pseudo: String(j.pseudo || 'Joueur').slice(0, 20), couleur: j.couleur, pret: !!j.pret, hote: j.id === salon.hote, moi: j.id === salon.moi.id, ping: ping == null ? null : Math.round(ping), voie: voie || '' };
      });
    }
    function annoncerReglages() { // l'hôte : réglages, pings et voies à tous (aussi pour ceux qui arrivent)
      if (!salon.estHote) return;
      const voies = {}; for (const j of salon.joueurs.values()) voies[j.id] = j.id === salon.moi.id ? 'hote' : j.voie || '';
      ctl.voies = voies; dernierRegl = maintenant();
      envoyer('reglages', Object.assign({ k, enJeu: ctl.enJeu, pings: ctl.pings, voies }, ctl.reglages), { fiable: true });
    }
    function regler(r) {
      if (!salon.estHote || !r) return false;
      const R = PR(), g = ctl.reglages;
      if (r.bots != null) g.bots = Math.max(0, Math.min(4, Math.round(+r.bots) || 0));
      if (r.niveau && (!R || R.BOTS[r.niveau])) g.niveau = r.niveau;
      if (r.equipes != null) g.equipes = !!r.equipes;
      annoncerReglages(); emettre('maj'); return true;
    }
    function pret(oui) { try { salon.majMoi({ pret: !!oui }); } catch (e) { signaler('prêt', e); } emettre('maj'); }
    function renommer(pseudo) { pseudo = String(pseudo || '').trim().slice(0, 20); if (!pseudo) return false; try { salon.majMoi({ pseudo }); } catch (e) { signaler('pseudo', e); } emettre('maj'); return true; }

    // ─── le lancement (l'hôte) : graine, joueurs (couleurs distinctes, équipes réparties par PJEU), compte à rebours commun ───
    function lancer() {
      if (ctl.ferme) return 'salon fermé';
      if (!salon.estHote) return 'seul l’hôte lance la partie';
      const js = joueurs(); if (js.length < 2) return 'il faut être au moins deux';
      if (!ctl._monde || !PJ() || !PA()) return 'le jeu n’est pas prêt';
      const R = PR(), pris = new Set(), palette = R ? R.COULEURS : [];
      const liste = js.map((j) => { let c = typeof j.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(j.couleur) && !pris.has(j.couleur) ? j.couleur : palette.find((x) => !pris.has(x)) || '#FFC84A'; pris.add(c); return { id: j.id, pseudo: j.pseudo, couleur: c }; });
      const g = ctl.reglages, options = { bots: g.bots, niveau: g.niveau, equipes: !!g.equipes };
      const graine = (Math.random() * 4294967296) >>> 0;
      let P = null;
      try { k++; P = partieHote(ctl, { k, graine, options, joueurs: liste, dans: DANS }); } catch (e) { signaler('lancement', e); return 'la partie n’a pas pu démarrer'; }
      envoyer('lancer', { k, graine, options, joueurs: P.liste, dans: DANS, carte: empreinte(ctl._carte) }, { fiable: true });
      finirPartie(); ctl.partie = P; ctl.enJeu = true; annoncerReglages();
      emettre('partie', P); emettre('maj');
      return true;
    }
    function finirPartie() { const p = ctl.partie; if (p && p.arreter) { try { p.arreter(); } catch (e) { signaler('arrêt', e); } } ctl.partie = null; }
    function retourSalon() { // l'hôte ramène tout le monde au salon (après une fin) ; un client y retourne seul (la partie est finie pour lui)
      finirPartie();
      if (salon.estHote) { ctl.enJeu = false; envoyer('salon', { k }, { fiable: true }); annoncerReglages(); }
      emettre('salon'); emettre('maj'); return true;
    }
    function quitter() {
      if (ctl.ferme) return; finirPartie();
      ctl.ferme = true; clearInterval(timer); for (const f of offs) { try { f(); } catch (e) { /* rien */ } }
      try { salon.quitter(); } catch (e) { signaler('quitter', e); }
    }
    function stats() {
      const dt = Math.max(0.5, (maintenant() - C.t0) / 1000), p = ctl.partie;
      const r = { envoyesParS: C.envoyes / dt, recusParS: C.recus / dt, types: Object.assign({}, C.types), duree: dt, erreurs, derniereErreur };
      if (p && p.stats) r.partie = p.stats();
      try { r.transport = salon.stats ? salon.stats() : null; } catch (e) { r.transport = null; }
      return r;
    }

    // ─── les messages ───
    let signature = '', signatureUi = '';
    ecoute('joueurs', () => {
      // l'hôte ne réannonce que si la liste change (le battement de présence ne compte pas : il en arrive un par joueur et par seconde)
      const js = Array.from(salon.joueurs.values()), sig = js.map((j) => j.id + (j.pret ? '+' : '-') + j.pseudo + (j.voie || '')).sort().join('|'), sigUi = sig + js.map((j) => j.ping | 0).join(',') + salon.hote;
      if (salon.estHote) { if (sig !== signature) annoncerReglages(); const p = ctl.partie; if (p && p.hote) p.verifierDeparts(); }
      else { const p = ctl.partie; if (p && !p.hote && !salon.joueurs.has(p.hoteId)) p.hoteParti(); }
      signature = sig; if (sigUi !== signatureUi) { signatureUi = sigUi; emettre('maj'); }
    });
    ecoute('hote', () => { // l'hôte a changé : l'ancien est parti (s'il menait une partie, elle est finie pour nous)
      const p = ctl.partie;
      if (p && !p.hote) p.hoteParti();
      if (salon.estHote) { ctl.enJeu = false; annoncerReglages(); }
      emettre('maj');
    });
    ecoute('ferme', () => { finirPartie(); ctl.ferme = true; clearInterval(timer); emettre('ferme', { raison: 'ferme' }); });
    ecoute('reglages', (d) => {
      if (salon.estHote || !d) return;
      const R = PR(), g = ctl.reglages;
      g.bots = Math.max(0, Math.min(4, d.bots | 0)); if (!R || R.BOTS[d.niveau]) g.niveau = d.niveau; g.equipes = !!d.equipes;
      ctl.pings = d.pings && typeof d.pings === 'object' ? d.pings : {}; ctl.voies = d.voies && typeof d.voies === 'object' ? d.voies : {}; ctl.enJeu = !!d.enJeu;
      emettre('maj');
    });
    ecoute('ping', (d) => { if (!salon.estHote && d) envoyer('pong', { t: d.t }, { fiable: false }); });
    ecoute('pong', (d, de) => { if (!salon.estHote || !d || !fini(d.t)) return; const s = maintenant() - d.t; if (s >= 0 && s < 10000) { ctl.pings[de] = ctl.pings[de] != null ? Math.round(ctl.pings[de] * 0.6 + s * 0.4) : Math.round(s); emettre('maj'); } });
    ecoute('lancer', (d) => {
      if (salon.estHote || !d || !Array.isArray(d.joueurs)) return;
      if (!d.joueurs.some((j) => j && j.id === salon.moi.id)) { ctl.enJeu = true; emettre('maj'); return; } // une partie sans nous (arrivés trop tard)
      if (d.carte && ctl._carte && d.carte !== empreinte(ctl._carte)) { quitter(); emettre('ferme', { raison: 'carte' }); return; } // pas la même carte que l'hôte (une vieille copie) : la partie divergerait
      finirPartie();
      let P = null; try { P = partieClient(ctl, d); } catch (e) { signaler('façade', e); P = null; }
      if (!P) return;
      k = d.k | 0; ctl.partie = P; ctl.enJeu = true; emettre('partie', P); emettre('maj');
    });
    ecoute('salon', () => { if (salon.estHote) return; finirPartie(); ctl.enJeu = false; emettre('salon'); emettre('maj'); });
    for (const t of ['entree', 'etat', 'evts', 'fin']) ecoute(t, (d, de) => { const p = ctl.partie; if (p && p.recevoir) p.recevoir(t, d, de); });

    // le battement : réglages et pings au salon (hôte), rattrapage et départs en partie
    timer = setInterval(() => {
      try {
        if (ctl.ferme) return;
        const now = maintenant(), p = ctl.partie;
        if (salon.estHote && !p) {
          if (now - dernierPing > 2000) { dernierPing = now; if (salon.joueurs.size > 1) envoyer('ping', { t: now }, { fiable: false }); }
          if (now - dernierRegl > 2000) annoncerReglages();
        }
        if (p && p.tic) p.tic(now);
      } catch (e) { signaler('battement', e); }
    }, 250);
    ctl._envoyer = envoyer; ctl._monde = o.monde || null; ctl._carte = o.carte || null;
    if (salon.estHote) annoncerReglages();
    return ctl;
  }

  // ═══════════════════════════════ l'hôte : le vrai PJEU, enveloppé ═══════════════════════════════
  function partieHote(ctl, L) {
    const J = PJ(), A = PA(), R = PR(), JO = R.JOUEUR, idMoi = ctl.idMoi, envoyer = ctl._envoyer, monde = ctl._monde, carte = ctl._carte;
    const jeu = J.creer({ monde, carte, mode: A, graine: L.graine, options: L.options });
    const liste = [];
    for (const j of L.joueurs) {
      const e = jeu.ajouterJoueur({ id: j.id, nom: j.pseudo, couleur: j.couleur, humain: true, equipe: L.options.equipes ? undefined : j.id });
      if (L.options.equipes && A.COULEURS_EQUIPES) e.couleur = A.COULEURS_EQUIPES[e.equipe] || e.couleur;
      liste.push({ id: e.id, pseudo: e.nom, couleur: e.couleur, equipe: e.equipe });
    }
    const vrai = jeu.etape, debut = maintenant() + L.dans * 1000;
    const clients = new Map();
    // la piste de chaque client (C5) : ses positions prédites, datées à son horloge (tc, ms), rejouées avec un petit retard
    const NP = 32, nouvellePiste = () => { const a = []; for (let i = 0; i < NP; i++) a.push({ tc: 0, x: 0, y: 0, z: 0, sol: true, po: 0 }); return a; };
    for (const j of liste) if (j.id !== idMoi) clients.set(j.id, { id: j.id, nom: j.pseudo, entree: { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null }, n: 0, recuA: 0, vu: debut, pos: { x: 0, y: 0, z: 0, m: 0, v: false, vy: 0, sol: true, neuf: false }, adopte: false, rtt: 0, intervalle: ENTREE_MS,
      av: 0, co: 0, sa: false, v2: false, piste: nouvellePiste(), pn: 0, pi: 0, dec: null, decA: 0, gigue: 0, surPiste: false, lu: false, rx: 0, ry: 0, rz: 0, rsol: true, rvx: 0, rvz: 0, rvy: 0, px: 0, py: 0, pz: 0, foulee: 0, rejets: 0, D: 0, tl: 0, nLu: 0, nProl: 0, bx: 0, bz: 0, teleports: 0,
      tiNiveau: false, compteTirs: false, nt: 0, ntFaits: 0, detteA: 0, tirePas: false, jeton: JETON_MAX, jetonA: 0, adX: 0, adZ: 0, adOk: false });
    const ent = {}, ACKS = {}, envoiT = new Float64Array(64), envoiN = new Int32Array(64), aEnvoyer = [], enPlus = [];
    let nEtat = 0, dernierEtat = -1e9, dernierEvts = -1e9, derniereEtape = 0, finale = false, finEnvoyee = false, arrete = false, envoyes = 0, t0 = 0, hT = -1;
    const P = { k: L.k, jeu, idMoi, estHote: true, hote: true, hoteId: idMoi, dans: L.dans, liste, resultat: null, demarre: false };
    const VMAX = Math.max(JO.course || 0, JO.vitesse || 0, 5.2), VGLISSE = (JO.glissade && JO.glissade.vMax) || 11, FOULEE = 1.7;
    const VSEAU = VMAX * 1.15 + 0.3; // le remplissage du seau (m/s) : la course en descente (× 1,15) passe, une vitesse truquée non
    const P_PAS = JO.postures && JO.postures.debout ? JO.postures.debout.bruit : 10;

    // ─── la piste : ajout validé (§ 9.1), lecture retardée ───
    const echantillon = (c, k) => c.piste[(c.pi - 1 - k + 2 * NP) % NP]; // le k-ième en partant du plus récent
    // → la distance horizontale parcourue depuis la référence (le dernier échantillon, ou notre simulation à la reprise), ou −1 si refusé
    function valide(c, e, tc, x, y, z, sol, po) {
      if (!fini(x) || !fini(y) || !fini(z)) return -1;
      let d2 = 0;
      if (c.pn) { // déplacement : |Δpos| ≤ (vmax de la posture × 1,25 + 1) × Δt (+ les arrondis), Δt à l'horloge du client
        const a = echantillon(c, 0), dt = (tc - a.tc) / 1000, v = po === 2 || a.po === 2 ? VGLISSE : VMAX, lim = (v * 1.25 + 1) * dt + 0.05, dx = x - a.x, dz = z - a.z;
        d2 = dx * dx + dz * dz; if (d2 > lim * lim) return -1;
      } else { const dx = x - e.x, dz = z - e.z; d2 = dx * dx + dz * dz; if (d2 > 9 || Math.abs(y - e.y) > 3) return -1; } // la reprise : près de notre simulation
      // et au temps de l'hôte : le seau (un tc qui court devant, ou une reprise sur deux, ne donnent aucune marge)
      const d = Math.sqrt(d2); if (d > c.jeton + 0.05) return -1;
      if (monde.bloque(x, z, JO.rayon - 0.05)) return -1; // pas dans un mur
      const h = y - monde.hauteur(x, z); if (h < -2.5 || h > (sol ? 2.5 : 8)) return -1; // hauteur (en l'air : jusqu'à 8 m au-dessus du sol)
      return d;
    }
    function ajouter(c, tc, x, y, z, sol, po, d) {
      const s = c.piste[c.pi]; s.tc = tc; s.x = x; s.y = y; s.z = z; s.sol = sol; s.po = po; c.pi = (c.pi + 1) % NP; if (c.pn < NP) c.pn++;
      c.jeton = Math.max(0, c.jeton - d);
    }
    function remplir(c, now) { c.jeton = Math.min(JETON_MAX, c.jeton + VSEAU * Math.max(0, now - c.jetonA) / 1000); c.jetonA = now; }
    function recevoirPiste(c, d, now) {
      const e = jeu.trouver(c.id); if (!e) return;
      const tc = d.tc, o = now - tc;
      c.dec = c.dec == null ? o : Math.min(o, c.dec + 0.02 * Math.max(0, now - c.decA)); c.decA = now; // le décalage d'horloge : le trajet le plus court, qui remonte lentement
      c.gigue = c.gigue * 0.9 + Math.max(0, o - c.dec) * 0.1; // le retard de cette entrée sur le plus court
      if (!d.v && e.vivant) return; // il se croit éliminé, nous pas (une réapparition en route) : la piste est tenue, pas vidée
      if (!d.v || !e.vivant || (d.m | 0) !== e.score.morts || !fini(d.x) || !fini(d.y) || !fini(d.z)) { c.pn = 0; c.lu = false; c.adopte = false; return; }
      remplir(c, now);
      let ok = true;
      if (Array.isArray(d.tr)) for (let i = 0; i < d.tr.length && i < 16 && ok; i++) {
        const s = d.tr[i]; if (!Array.isArray(s) || s.length < 4 || !fini(s[0])) continue;
        const ts = tc - num(s[0], 0, 2000); if (c.pn && ts <= echantillon(c, 0).tc) continue;
        const po = s[4] | 0, dd = valide(c, e, ts, s[1], s[2], s[3], true, po); if (dd >= 0) ajouter(c, ts, s[1], s[2], s[3], true, po, dd); else ok = false;
      }
      if (ok && (!c.pn || tc > echantillon(c, 0).tc)) {
        const po = fini(d.po) ? d.po | 0 : d.ac ? 1 : 0, sol = !!d.sol, dd = valide(c, e, tc, d.x, d.y, d.z, sol, po);
        if (dd >= 0) ajouter(c, tc, d.x, d.y, d.z, sol, po, dd); else ok = false;
      }
      if (ok) { c.adopte = true; return; }
      // refusé : accusé négatif (le client se recale), et l'hôte reprend sa simulation au dernier point valide
      c.rejets++; c.adopte = false;
      if (c.pn) { const a = echantillon(c, 0); e.x = e.ax = a.x; e.y = e.ay = a.y; e.z = e.az = a.z; e.vx = e.vz = e.vy = 0; e.auSol = true; }
      c.pn = 0; c.lu = false;
    }
    function lirePiste(c, e, tH, dt) { // la position du client à l'heure (de son horloge) qu'on montre : maintenant − décalage − retard
      if (!c.pn || c.dec == null || !e.vivant) return false;
      // l'heure lue suit sa cible à vitesse bornée (±5 %, comme l'horloge du client, C6) : décalage et retard bougent à chaque entrée,
      // la lecture, elle, avance toujours d'environ dt (net au-delà de 250 ms d'écart)
      const D = c.D = Math.max(45, 1.3 * c.intervalle + 2.5 * c.gigue), cible = tH - c.dec - D, ec = cible - c.tl, b = echantillon(c, 0);
      if (!c.lu || ec > 250 || ec < -250) c.tl = cible; else c.tl += dt * 1000 * (1 + (ec * 0.002 > 0.05 ? 0.05 : ec * 0.002 < -0.05 ? -0.05 : ec * 0.002));
      const t = c.tl;
      let x = b.x, y = b.y, z = b.z, sol = b.sol;
      c.nLu++;
      if (t >= b.tc) { c.nProl++; // au-delà du dernier : prolongé 100 ms, puis tenu
        if (c.pn >= 2) {
          const a = echantillon(c, 1), u = Math.min(100, t - b.tc) / Math.max(1, b.tc - a.tc), dx = (b.x - a.x) * u, dz = (b.z - a.z) * u;
          if (dx * dx + dz * dz < 4 && !monde.bloque(b.x + dx, b.z + dz, JO.rayon - 0.05)) { x = b.x + dx; z = b.z + dz; if (b.sol) y = monde.hauteur(x, z); }
        }
      } else {
        let k = 0; while (k < c.pn - 1 && echantillon(c, k + 1).tc > t) k++;
        if (k >= c.pn - 1) { const a = echantillon(c, c.pn - 1); x = a.x; y = a.y; z = a.z; sol = a.sol; } // avant le plus ancien : tenu
        else { const a = echantillon(c, k + 1), bb = echantillon(c, k), u = Math.max(0, Math.min(1, (t - a.tc) / Math.max(1, bb.tc - a.tc))); x = a.x + (bb.x - a.x) * u; y = a.y + (bb.y - a.y) * u; z = a.z + (bb.z - a.z) * u; sol = u < 0.5 ? a.sol : bb.sol; }
      }
      const dx = x - c.rx, dz = z - c.rz, saut = !c.lu || dx * dx + dz * dz > 9;
      c.px = saut ? x : c.rx; c.py = saut ? y : c.ry; c.pz = saut ? z : c.rz;
      c.rx = x; c.ry = y; c.rz = z; c.rsol = sol; c.lu = true;
      return true;
    }
    function teleporte(c) { // l'hôte a déplacé le client (réapparition, test) : la piste repart de zéro, accusé négatif (le client se recale)
      c.pn = 0; c.lu = false; c.adopte = false; c.surPiste = false; c.teleports++; c.jeton = JETON_MAX; c.adOk = false;
    }
    function poserLu(c, e, dt) { // la lecture de la piste sur l'entité (après le pas : l'état envoyé et le rendu de l'hôte)
      const k = dt > 0 ? 1 / dt : 0;
      e.x = c.rx; e.y = c.ry; e.z = c.rz; e.auSol = c.rsol; e.ax = c.px; e.ay = c.py; e.az = c.pz;
      e.vx = (c.rx - c.px) * k; e.vz = (c.rz - c.pz) * k; e.vy = (c.ry - c.py) * k;
    }

    function adopter(c, e, now) { // la position prédite du client, si elle est plausible (près de notre simulation, et dans le seau)
      const p = c.pos; if (!p.neuf) return; p.neuf = false;
      if (!e.vivant || !p.v || p.m !== e.score.morts) { c.adopte = false; c.adOk = false; return; }
      remplir(c, now);
      const dx = p.x - e.x, dz = p.z - e.z, ax = p.x - (c.adOk ? c.adX : e.x), az = p.z - (c.adOk ? c.adZ : e.z), d = Math.sqrt(ax * ax + az * az); // d : depuis la dernière décision (notre simulation comprise)
      if (dx * dx + dz * dz > 9 || Math.abs(p.y - e.y) > 3 || d > c.jeton + 0.3 || monde.bloque(p.x, p.z, JO.rayon - 0.05)) { c.adopte = false; c.adX = e.x; c.adZ = e.z; c.adOk = true; return; }
      e.x = p.x; e.z = p.z; e.y = p.y; e.vy = p.vy; e.auSol = p.sol; c.adopte = true; c.jeton = Math.max(0, c.jeton - d); c.adX = e.x; c.adZ = e.z; c.adOk = true;
    }
    function compacter(ev, h) { // les événements utiles à l'image et au son, arrondis
      switch (ev.t) {
        case 'tir': { const i = ev.impact; return { t: 'tir', h, id: ev.id, arme: ev.arme, o: [r2(ev.o[0]), r2(ev.o[1]), r2(ev.o[2])], fin: [r2(ev.fin[0]), r2(ev.fin[1]), r2(ev.fin[2])], impact: i ? { x: r2(i.x), y: r2(i.y), z: r2(i.z), nx: r2(i.nx), ny: r2(i.ny), nz: r2(i.nz), quoi: i.quoi, id: i.id } : null }; }
        case 'touche': return { t: 'touche', h, de: ev.de, a: ev.a, degats: ev.degats, tete: !!ev.tete, mort: !!ev.mort };
        case 'mort': return { t: 'mort', h, a: ev.a, par: ev.par, arme: ev.arme, tete: !!ev.tete };
        case 'reapparition': return { t: 'reapparition', h, id: ev.id };
        case 'ramasse': return { t: 'ramasse', h, id: ev.id, objet: ev.objet, oid: ev.oid };
        case 'recharge': return { t: 'recharge', h, id: ev.id };
        case 'annonce': return { t: 'annonce', h, texte: ev.texte };
        default: return null;
      }
    }
    function reseau(now) {
      if (now - dernierEtat >= ETAT_MS - 1 || finale) {
        nEtat++;
        for (const c of clients.values()) ACKS[c.id] = c.adopte ? c.n : -c.n; // négatif : l'hôte n'a pas adopté sa position (le client se recale)
        const inst = jeu.instantane(ACKS); inst.k = L.k; inst.n = nEtat;
        envoiT[nEtat & 63] = now; envoiN[nEtat & 63] = nEtat; dernierEtat = now;
        if (clients.size) { envoyer('etat', inst, { fiable: false }); envoyes++; }
      }
      if (aEnvoyer.length && (now - dernierEvts >= EVTS_MS || finale)) {
        dernierEvts = now;
        if (clients.size) {
          // le tireur a déjà montré ses tirs sur place : ses propres 'tir' ne lui reviennent pas (un envoi par client seulement dans ce cas)
          let propres = false; for (let i = 0; i < aEnvoyer.length; i++) { const v = aEnvoyer[i]; if (v.t === 'tir' && clients.has(v.id)) { propres = true; break; } }
          const ev = aEnvoyer.splice(0);
          if (!propres) envoyer('evts', { k: L.k, ev }, { fiable: true });
          else for (const c of clients.values()) { const l = ev.filter((v) => v.t !== 'tir' || v.id !== c.id); if (l.length) envoyer('evts', { k: L.k, ev: l }, { fiable: true, a: c.id }); }
          envoyes++;
        } else aEnvoyer.length = 0;
      }
      if (finale && !finEnvoyee) {
        finEnvoyee = true; let res = null; try { res = A.resultat(jeu); } catch (e) { signaler('résultat', e); res = { classement: jeu.resume() }; }
        P.resultat = res; envoyer('fin', { k: L.k, res }, { fiable: true });
      }
    }
    function etapeHote(dt, entrees) {
      const now = maintenant(); derniereEtape = now;
      if (!P.demarre) { P.demarre = true; t0 = now; }
      for (const id in ent) ent[id] = null;
      if (entrees && entrees[idMoi]) ent[idMoi] = entrees[idMoi];
      hT = hT < 0 ? now : Math.min(now + 20, Math.max(now - 100, hT + dt * 1000)); // l'horloge des pas de l'hôte (ms) : la piste est lue à cette heure
      for (const c of clients.values()) {
        const e = jeu.trouver(c.id); if (!e) continue;
        const en = c.entree, lache = now - c.recuA > Math.max(LACHE, 2.5 * c.intervalle + 100);
        if (lache) { c.av = 0; c.co = 0; c.sa = false; c.tiNiveau = false; en.recharge = false; en.arme = null; } // plus de nouvelles : il lâche tout (et la piste s'arrête : l'hôte reprend sa simulation)
        // le tir : un client qui compte ses tirs (nt) en reçoit autant, ni plus ni moins (un appui bref perdu, dans le désordre ou écrasé
        // par le relais ne se perd plus, et un appui tenu ne se double pas) ; une dette que l'hôte ne peut pas payer (mort, recharge) s'éteint
        if (c.compteTirs) {
          if (c.nt > c.ntFaits) { if (!e.vivant || (c.detteA && now - c.detteA > DETTE_MS)) { c.ntFaits = c.nt; c.detteA = 0; } else if (!c.detteA) c.detteA = now; }
          else { c.ntFaits = c.nt; c.detteA = 0; }
          en.tir = c.nt > c.ntFaits;
        } else en.tir = c.tiNiveau;
        if (c.v2 && c.lu) { const dx = e.x - c.rx, dz = e.z - c.rz; if (dx * dx + dz * dz > 1) teleporte(c); } // déplacé hors de la piste (par l'hôte) depuis le pas d'avant
        c.surPiste = c.v2 && !lache && lirePiste(c, e, hT, dt);
        // sur la piste, l'hôte ne rejoue pas son mouvement (la piste le porte) ; le tir part de la tête de piste (sa position à l'entrée)
        en.avant = c.surPiste ? 0 : c.av; en.cote = c.surPiste ? 0 : c.co; en.saut = c.surPiste ? false : c.sa;
        if (c.surPiste) { const b = en.tir ? echantillon(c, 0) : null; if (b) { e.x = b.x; e.y = b.y; e.z = b.z; } else { e.x = c.rx; e.y = c.ry; e.z = c.rz; } e.auSol = c.rsol; e.vx = e.vz = e.vy = 0; c.bx = e.x; c.bz = e.z; }
        else if (!c.v2) adopter(c, e, now);
        else c.lu = false;
        ent[c.id] = en;
      }
      let evs;
      try { evs = vrai(dt, ent); } catch (e) { signaler('simulation', e); return enPlus.splice(0); }
      for (let i = 0; i < evs.length; i++) { // un tir fait (un événement par plomb : compté une fois par pas)
        const v = evs[i]; if (v.t !== 'tir') continue;
        const c = clients.get(v.id); if (c && !c.tirePas) { c.tirePas = true; c.ntFaits++; c.detteA = c.nt > c.ntFaits ? now : 0; }
      }
      for (const c of clients.values()) c.tirePas = false;
      for (const c of clients.values()) { // la piste, telle qu'on la montre ; ses pas (son, et l'ouïe des robots)
        if (!c.surPiste) continue;
        const e = jeu.trouver(c.id); if (!e || !e.vivant) continue;
        { const dx = e.x - c.bx, dz = e.z - c.bz; if (dx * dx + dz * dz > 2.25) { teleporte(c); continue; } } // le jeu l'a déplacé pendant le pas : on garde sa place
        poserLu(c, e, dt);
        const dx = c.rx - c.px, dz = c.rz - c.pz, dep = Math.sqrt(dx * dx + dz * dz);
        if (e.auSol && !e.accroupi && (!e.posture || e.posture === 'debout') && dep > 0 && dep < 3) { c.foulee += dep; if (c.foulee >= FOULEE) { c.foulee -= FOULEE; evs.push({ t: 'pas', id: e.id }); if (jeu.faireBruit) jeu.faireBruit(e, P_PAS); } }
      }
      const h = r3(jeu.temps);
      for (let i = 0; i < evs.length; i++) { const v = evs[i]; if (v.t === 'fin') finale = true; else { const c = compacter(v, h); if (c) aEnvoyer.push(c); } }
      for (let i = 0; i < enPlus.length; i++) evs.push(enPlus[i]); enPlus.length = 0;
      reseau(now);
      return evs;
    }
    function retirer(id, raison) { // un client parti (ou muet) : hors du jeu, chez tout le monde
      const c = clients.get(id); if (!c) return;
      clients.delete(id); jeu.reglerRetard(id, 0);
      const e = jeu.trouver(id), nom = e ? e.nom : c.nom; jeu.retirerJoueur(id);
      const texte = `${nom} ${raison === 'muet' ? 'a perdu la connexion' : 'a quitté la partie'}`, h = r3(jeu.temps);
      aEnvoyer.push({ t: 'parti', h, id }, { t: 'annonce', h, texte }); enPlus.push({ t: 'annonce', texte });
    }
    function recevoir(type, d, de) {
      if (arrete || type !== 'entree' || !d || (d.k | 0) !== L.k) return;
      const c = clients.get(de); if (!c) return;
      const n = d.n | 0; if (n <= c.n) return; // une vieille entrée, arrivée après une plus récente
      const now = maintenant(); if (c.recuA > 0) c.intervalle = c.intervalle * 0.9 + Math.min(1000, now - c.recuA) * 0.1; c.n = n; c.recuA = now; c.vu = now;
      const en = c.entree;
      c.av = en.avant = num(d.av, -1, 1); c.co = en.cote = num(d.co, -1, 1);
      if (fini(d.ya)) en.yaw = d.ya; if (fini(d.pi)) en.pitch = d.pi;
      c.tiNiveau = !!d.ti; if (fini(d.nt)) { c.compteTirs = true; c.nt = Math.max(c.nt, d.nt | 0); }
      c.sa = en.saut = !!d.sa; en.accroupi = !!d.ac; en.recharge = !!d.re; en.arme = J.ARMES_ID.indexOf(d.ar) >= 0 ? d.ar : null;
      if (fini(d.tc)) { c.v2 = true; recevoirPiste(c, d, now); } // C5 : la piste (un client sans tc reste servi comme avant : adopter)
      const p = c.pos;
      if (!c.v2 && fini(d.x) && fini(d.y) && fini(d.z)) { p.x = d.x; p.y = d.y; p.z = d.z; p.m = d.m | 0; p.v = !!d.v; p.vy = num(d.vy, -40, 40); p.sol = !!d.sol; p.neuf = true; }
      // le ping (aller-retour d'un état jusqu'à l'entrée qui l'accuse), puis le retard des tirs de ce joueur
      const ae = d.ae | 0;
      if (ae > 0 && envoiN[ae & 63] === ae) { const s = now - envoiT[ae & 63] - Math.max(0, +d.ad || 0); if (s >= 0 && s < 5000) { c.rtt = c.rtt ? c.rtt * 0.8 + s * 0.2 : s; ctl.pings[de] = Math.round(c.rtt); } }
      const retard = fini(d.tv) ? jeu.temps - d.tv : c.rtt / 2000 + DELAI; // le client vise les autres là où il les voit : DELAI en arrière, plus le trajet
      jeu.reglerRetard(de, Math.max(0, Math.min(0.25, retard)));
    }
    function verifierDeparts() {
      const now = maintenant(), salon = ctl.salon;
      for (const c of Array.from(clients.values())) {
        if (!salon.joueurs.has(c.id)) retirer(c.id, 'parti');
        else if (now - c.vu > MUET) retirer(c.id, 'muet');
      }
    }
    function tic(now) {
      if (arrete) return;
      verifierDeparts();
      // l'hôte en arrière-plan (onglet caché, pause du navigateur) : on rattrape la simulation pour les autres, par pas fixes de 1/60 s
      // (au plus 1 s ; la fraction restante, moins d'un pas, est perdue ; etapeHote remet derniereEtape à l'heure)
      if (P.demarre && !jeu.fini && now - derniereEtape > 300) {
        let n = Math.min(60, Math.floor((now - derniereEtape) / 1000 / PAS_FIXE)); const neutre = { [idMoi]: null };
        while (n-- > 0 && !jeu.fini) etapeHote(PAS_FIXE, neutre);
      }
    }
    jeu.etape = etapeHote;
    P.recevoir = recevoir; P.tic = tic; P.verifierDeparts = verifierDeparts; P.retirer = retirer;
    P.arreter = () => { arrete = true; jeu.etape = vrai; };
    P.stats = () => { const dt = Math.max(0.5, (maintenant() - (t0 || maintenant())) / 1000); return { hote: true, messagesParClientParS: envoyes / dt, envoyes, t: maintenant(), clients: Array.from(clients.values()).map((c) => ({ id: c.id, rtt: Math.round(c.rtt), adopte: c.adopte, retard: r3(jeu.retardDe(c.id)), intervalle: Math.round(c.intervalle), piste: c.surPiste, D: Math.round(c.D), gigue: Math.round(c.gigue), rejets: c.rejets, teleports: c.teleports, prolonge: c.nLu ? r3(c.nProl / c.nLu) : 0, seau: r2(c.jeton), tirs: c.ntFaits, dette: Math.max(0, c.nt - c.ntFaits) })) }; };
    return P;
  }

  // ═══════════════════════════════ le client : la façade ═══════════════════════════════
  function partieClient(ctl, L) {
    const J = PJ(), A = PA(), R = PR(), JO = R.JOUEUR, idMoi = ctl.idMoi, envoyer = ctl._envoyer, monde = ctl._monde, carte = ctl._carte;
    if (!monde || !J || !A) return null;
    const options = L.options || {};
    const jeu = J.creer({ monde, carte, mode: A, graine: L.graine, options, nav: false });
    for (const j of L.joueurs) {
      if (!j || typeof j.id !== 'string') continue;
      const e = jeu.ajouterJoueur({ id: j.id, nom: j.pseudo, couleur: j.couleur, humain: true, equipe: options.equipes ? (j.equipe === 1 ? 1 : 0) : j.id });
      if (typeof j.couleur === 'string') e.couleur = j.couleur;
    }
    const moi = jeu.trouver(idMoi); if (!moi) return null;
    const hoteId = ctl.hote, out = [], tampon = [], attente = [], immediats = [], hist = [], tirsEnVol = [], pasDe = new Map();
    const corr = { x: 0, z: 0 };
    let dernierT = -1, dernierRecu = 0, dernierN = 0, cale = false, nEnvoi = 0, dernierEnvoi = -1e9, tirDepuis = false, sautA = -1e9, rechA = -1e9, armeA = -1e9, armeVoulue = null, armeLocaleA = -1e9;
    let nTirs = 0, tirLocalA = 0, finEnAttente = null, arrete = false, recus = 0, envoyes = 0, t0 = 0, foulee = 0, nCales = 0, nDouces = 0, intervalle = ETAT_MS, gigue = 10, delai = DELAI;
    // C6 : delaiEff (le retard d'interpolation qui glisse), tRenduVu (l'heure de l'hôte à laquelle on voit les autres, pour tv),
    // parImage (ui.js appelle avantImage : etape ne fait plus que la prédiction), nSauts (recalages nets de l'horloge, hors le premier) ;
    // C5 : tPas (l'horloge des pas, en s : cadence locale), tcPas (la même en ms, calée sur maintenant() : le tc des entrées),
    // accEntree (une entrée tous les 1/30 s de simulation : tous les 2 pas), PISTE (les derniers pas : tc, x, y, z, posture)
    let nInterp = 0, nProl = 0, decH = 0, nOff = 0, iOff = 0, retardH = 0, delaiEff = -1, tRenduVu = 0, parImage = false, dernierImage = -1, nSauts = 0, tPas = 0, tcPas = -1, tcEnvoi = -1, accEntree = 0, nPiste = 0, iPiste = 0;
    const NPISTE = 18, PISTE = new Float64Array(NPISTE * 5), OFF = new Float64Array(20), outImage = [];
    const debut = maintenant() + (L.dans || 0) * 1000;
    const P = { k: L.k | 0, jeu, idMoi, estHote: false, hote: false, hoteId, dans: L.dans || 0, liste: L.joueurs, resultat: null, demarre: false };
    const GONFLE = {}; for (const id of J.ARMES_ID) { const a = R.arme(id); GONFLE[id] = a && a.gonfle != null ? a.gonfle : 0.3; } // PREGLES.arme(id).gonfle (mêmes valeurs qu'avant)
    const IPO = { debout: 0, accroupi: 1, glisse: 2, couche: 3 }, posture = (e) => (e.posture && IPO[e.posture] != null ? IPO[e.posture] : e.accroupi ? 1 : 0);
    jeu.finir = () => {}; // la fin vient de l'hôte

    // ─── réception ───
    function histDe(n) { for (let i = hist.length - 1; i >= 0; i--) if (hist[i].n <= n) return hist[i]; return null; }
    function caler(l) { // net : la position (et le regard) de l'hôte
      moi.x = moi.ax = l[1]; moi.y = moi.ay = l[2]; moi.z = moi.az = l[3]; moi.vx = moi.vz = moi.vy = 0; moi.auSol = true; corr.x = corr.z = 0; hist.length = 0; nCales++; nPiste = 0;
    }
    function recevoirEtat(d) {
      if ((d.k | 0) !== P.k || !Array.isArray(d.e) || !fini(d.t)) return;
      const n = d.n | 0; if (n <= dernierN) return; // en retard sur un plus récent
      const now = maintenant();
      if (dernierRecu > 0) { const iv = Math.min(1000, now - dernierRecu); gigue = gigue * 0.9 + Math.abs(iv - intervalle) * 0.1; intervalle = intervalle * 0.9 + iv * 0.1; }
      dernierN = n; dernierT = d.t; dernierRecu = now; recus++;
      // l'horloge de l'hôte vue d'ici : le décalage du trajet le plus court sur les 20 derniers états (~1 s), pas celui du dernier état
      // (sa gigue ferait trembler la cible) ; la fenêtre suit l'horloge de l'hôte quand elle prend du retard (images perdues, onglet caché)
      const o = now - d.t * 1000; OFF[iOff] = o; iOff = (iOff + 1) % OFF.length; if (nOff < OFF.length) nOff++;
      decH = o; for (let i = 0; i < nOff; i++) if (OFF[i] < decH) decH = OFF[i];
      retardH = retardH * 0.9 + (o - decH) * 0.1;
      delai = Math.max(DELAI, Math.min(DELAI_MAX, (1.2 * intervalle + 2.5 * Math.max(gigue, retardH)) / 1000 + 0.03)); // assez d'avance pour avoir presque toujours deux états entre lesquels interpoler
      if (!cale) { jeu.temps = d.t; } // la première nouvelle de l'hôte : son horloge
      const rows = new Map(); for (const l of d.e) if (Array.isArray(l) && typeof l[0] === 'string') rows.set(l[0], l);
      tampon.push({ t: d.t, rows }); while (tampon.length > 30 || (tampon.length > 2 && tampon[0].t < d.t - 1.5)) tampon.shift();
      // ce qui ne s'interpole pas : vie, armure, scores, munitions (tout de suite)
      for (const e of jeu.entites) { const l = rows.get(e.id); if (l) J.lireLigne(l, e, jeu.temps, 'etat'); }
      // les partis (absents de l'état de l'hôte) ; moi absent : l'hôte nous a retirés
      for (const e of jeu.entites.slice()) if (!rows.has(e.id)) { if (e === moi) { finir('exclu'); return; } jeu.retirerJoueur(e.id); pasDe.delete(e.id); }
      // les objets
      try { const objs = A.objets(jeu); if (typeof d.o === 'string') for (let i = 0; i < objs.length && i < d.o.length; i++) objs[i].dispo = d.o[i] === '1'; } catch (e) { signaler('objets', e); }
      // moi : vie, réapparition, recalage
      const l = rows.get(idMoi); if (!l) return;
      const fl = l[8] | 0, vivantH = !!(fl & 1);
      if (!cale) { caler(l); moi.yaw = l[4]; moi.pitch = l[5]; moi.vivant = vivantH; cale = true; }
      else if (!vivantH) { moi.vivant = false; moi.x = moi.ax = l[1]; moi.y = moi.ay = l[2]; moi.z = moi.az = l[3]; corr.x = corr.z = 0; hist.length = 0; nPiste = 0; } // repeint : on reste où l'hôte nous voit
      else if (!moi.vivant) { moi.vivant = true; caler(l); moi.yaw = l[4]; moi.pitch = 0; } // réapparu : la place et le regard que l'hôte a choisis
      else {
        const ack = l[20] | 0, dx = l[1] - moi.x, dz = l[3] - moi.z;
        if (dx * dx + dz * dz > 64) caler(l); // très loin de l'hôte, quoi qu'il arrive : net
        else if (ack < 0) { // l'hôte n'a pas pris notre position : on se recale sur la sienne (au même instant de notre historique)
          const h = histDe(-ack);
          if (!h) { if (dx * dx + dz * dz > NET * NET) caler(l); }
          else { const ex = l[1] - h.x, ez = l[3] - h.z, e2 = ex * ex + ez * ez; if (e2 > NET * NET) caler(l); else if (e2 > ZONE_MORTE * ZONE_MORTE) { corr.x = ex; corr.z = ez; nDouces++; } }
        }
      }
      moi.invincible = fl & 8 ? 1 : 0;
      if (maintenant() - armeLocaleA > 600) moi.arme = J.ARMES_ID[l[9] | 0] || 'rafale';
      // les munitions affichées : celles de l'hôte, moins nos tirs qu'il n'a pas encore vus
      const ack = Math.abs(l[20] | 0); while (tirsEnVol.length && tirsEnVol[0] <= ack) tirsEnVol.shift();
      if (moi.munitions[moi.arme] != null) moi.munitions[moi.arme] = Math.max(0, moi.munitions[moi.arme] - tirsEnVol.length);
      if (d.f) { /* la fin arrive par « fin » (fiable) */ }
    }
    function recevoirEvts(d) {
      if ((d.k | 0) !== P.k || !Array.isArray(d.ev)) return;
      recus++;
      for (const v of d.ev) {
        if (!v || typeof v.t !== 'string') continue;
        if (v.t === 'parti') { if (v.id !== idMoi) { jeu.retirerJoueur(v.id); pasDe.delete(v.id); } continue; }
        if (v.t === 'tir' && v.id === idMoi) continue; // déjà montré sur place
        if (v.t === 'mort' && v.a === idMoi) { moi.vivant = false; moi.vie = 0; }
        const pourMoi = v.id === idMoi || v.a === idMoi || v.de === idMoi || v.par === idMoi || v.t === 'annonce';
        if (pourMoi) immediats.push(v); else attente.push(v); // les autres : à l'heure où on les voit (100 ms en arrière)
      }
    }
    function recevoirFin(d) {
      if ((d.k | 0) !== P.k || !d.res) return;
      recus++;
      const res = d.res; P.resultat = res;
      if (Array.isArray(res.classement)) for (const c of res.classement) { const e = c && jeu.trouver(c.id); if (e) { e.score.kills = c.kills | 0; e.score.morts = c.morts | 0; e.score.points = c.points | 0; } }
      for (const v of attente) immediats.push(v); attente.length = 0;
      finEnAttente = { t: 'fin', classement: res.classement || jeu.resume(), resultat: res };
    }
    function recevoir(type, d) {
      if (arrete || !d) return;
      if (type === 'etat') recevoirEtat(d); else if (type === 'evts') recevoirEvts(d); else if (type === 'fin') recevoirFin(d);
    }
    function finir(raison) { // l'hôte est parti (ou nous a retirés) : la fin, avec les derniers scores connus
      if (finEnAttente || jeu.fini || arrete) return;
      let res = null; try { res = A.resultat(jeu); } catch (e) { res = { classement: jeu.resume() }; }
      res.raison = raison; P.resultat = res;
      finEnAttente = { t: 'fin', classement: res.classement, resultat: res };
    }
    P.hoteParti = () => finir('hote');

    // ─── l'horloge de l'hôte et les autres (C6) : à chaque image (avantImage), ou dans etape si ui.js n'appelle pas avantImage ───
    function horlogeEtAutres(dt, now, sortie) {
      // l'horloge de l'hôte suivie à vitesse bornée (±5 %) : le temps montré avance toujours d'environ dt ; net au-delà de 0,25 s
      if (dernierT >= 0) {
        const cible = (now - decH) / 1000, ec = cible - jeu.temps;
        if (ec > 0.25 || ec < -0.25) { jeu.temps = cible; nSauts++; } else jeu.temps += dt * (1 + (ec * 2 > 0.05 ? 0.05 : ec * 2 < -0.05 ? -0.05 : ec * 2));
      }
      // le retard d'interpolation glisse vers celui que demande le réseau, de 5 % de dt au plus
      if (delaiEff < 0) delaiEff = delai; else { const d = delai - delaiEff, m = 0.05 * dt; delaiEff += d > m ? m : d < -m ? -m : d; }
      const tRendu = tRenduVu = jeu.temps - delaiEff;
      interpoler(tRendu, sortie); // les autres, et leurs pas
      // les événements de l'hôte, à l'heure où on les voit
      while (attente.length && (attente[0].h <= tRendu || attente[0].h < jeu.temps - 1 || attente.length > 400)) sortie.push(attente.shift());
    }
    // ui.js, à chaque image après les pas : l'horloge et l'interpolation des autres (les événements rendus : sons, image, HUD)
    function avantImage(now) {
      outImage.length = 0;
      if (arrete || jeu.fini || finEnAttente) return outImage;
      now = fini(now) ? now : maintenant();
      const dt = dernierImage < 0 ? 0 : Math.max(0, Math.min(0.25, (now - dernierImage) / 1000)); dernierImage = now;
      if (!parImage) { parImage = true; return outImage; } // la première : etape vient de le faire
      horlogeEtAutres(dt, now, outImage);
      return outImage;
    }

    // ─── un pas : prédiction, tirs pour l'image, recalage, entrée (30 Hz) ; et l'horloge + les autres si ui.js n'appelle pas avantImage ───
    function etapeClient(dt, entrees) {
      out.length = 0;
      if (arrete) return out;
      for (let i = 0; i < immediats.length; i++) out.push(immediats[i]); immediats.length = 0; // arrivés depuis l'image d'avant
      if (finEnAttente) { out.push(finEnAttente); finEnAttente = null; jeu.fini = true; return out; }
      if (jeu.fini) return out;
      dt = +dt; if (!(dt > 0)) dt = 0; if (dt > 0.1) dt = 0.1;
      const now = maintenant();
      if (!P.demarre) { P.demarre = true; t0 = now; }
      if (!parImage) horlogeEtAutres(dt, now, out);
      // l'horloge des pas : tPas (s) pour la cadence locale ; tcPas (ms) pour dater les positions envoyées, à pas réguliers, recalée seulement si elle s'écarte de maintenant
      tPas += dt; tcPas = tcPas < 0 ? now : Math.min(now + 20, Math.max(now - 100, tcPas + dt * 1000)); // (le pas fixe peut avoir jusqu'à un pas d'avance sur l'image)
      const T = tPas;
      moi.ax = moi.x; moi.ay = moi.y; moi.az = moi.z; moi.aoeil = moi.oeil; // le rendu interpole d'un pas à l'autre
      // moi : la prédiction (la même physique que l'hôte)
      const en = entrees ? entrees[idMoi] : null;
      if (en) {
        if (en.saut) sautA = now; if (en.recharge) rechA = now; if (en.tir) tirDepuis = true;
        if (en.arme && en.arme !== moi.arme && moi.armes.indexOf(en.arme) >= 0) { armeVoulue = en.arme; armeA = now; armeLocaleA = now; moi.arme = en.arme; tirLocalA = Math.max(tirLocalA, T + 0.3); }
      }
      if (cale && moi.vivant && en) {
        const mv = J.deplacer(moi, en, dt, monde);
        if (mv.saut) out.push({ t: 'saut', id: idMoi });
        if (moi.auSol && !moi.accroupi && mv.dep > 0) { foulee += mv.dep; if (foulee >= 1.7) { foulee -= 1.7; out.push({ t: 'pas', id: idMoi }); } }
        // le tir pour l'image : cadence, chargeur et recharge de l'hôte ; l'hôte décide des touches
        const Ar = R.arme(moi.arme);
        if (en.tir && !moi.enRecharge && (moi.munitions[moi.arme] | 0) > 0 && T >= tirLocalA) {
          const n0 = out.length; J.tirVisuel(moi, monde, jeu.entites, Math.random, out);
          for (let i = n0; i < out.length; i++) out[i].local = true;
          tirLocalA = Math.max(tirLocalA, T - dt) + 1 / Ar.cadence;
          moi.munitions[moi.arme] = Math.max(0, (moi.munitions[moi.arme] | 0) - 1); tirsEnVol.push(nEnvoi + 1); nTirs++; // nt : l'hôte fera autant de tirs
          moi.gonfle = Math.min(1, (moi.gonfle || 0) + (GONFLE[Ar.id] || 0.3));
          moi.pitch = Math.max(-1.45, Math.min(1.45, moi.pitch + (Ar.recul || 0) * 0.6 * (0.7 + 0.3 * Math.random())));
          moi.yaw += (Ar.recul || 0) * 0.6 * 0.35 * (Math.random() * 2 - 1);
        }
        moi.gonfle = Math.max(0, (moi.gonfle || 0) - 3.2 * dt);
      }
      // le recalage en douceur (en glissant contre les murs), reporté sur l'historique
      if (corr.x || corr.z) {
        const kk = Math.min(1, dt * 8), dx = corr.x * kk, dz = corr.z * kk, p = monde.deplacer(moi.x, moi.z, dx, dz, JO.rayon), mx = p[0] - moi.x, mz = p[1] - moi.z;
        moi.x = p[0]; moi.z = p[1]; if (moi.auSol) moi.y = monde.hauteur(moi.x, moi.z);
        for (const h of hist) { h.x += mx; h.z += mz; }
        corr.x -= dx; corr.z -= dz; if (corr.x * corr.x + corr.z * corr.z < 1e-4) corr.x = corr.z = 0;
      }
      // la piste (C5) : la position de chaque pas, datée à notre horloge ; l'hôte la rejoue avec un petit retard
      const vit = cale && moi.vivant;
      if (vit) { const o = iPiste * 5; PISTE[o] = tcPas; PISTE[o + 1] = moi.x; PISTE[o + 2] = moi.y; PISTE[o + 3] = moi.z; PISTE[o + 4] = posture(moi); iPiste = (iPiste + 1) % NPISTE; if (nPiste < NPISTE) nPiste++; }
      else nPiste = 0;
      // l'entrée : tous les 1/30 s de simulation (2 pas de 1/60 s)
      accEntree += dt;
      if (accEntree >= 1 / 30 - 1e-4) {
        accEntree -= 1 / 30; if (accEntree > 1 / 30) accEntree = 0;
        nEnvoi++;
        const j = ctl.salon.joueurs.get(idMoi), relais = !!(j && j.voie === 'relais'), tenu = relais ? 3 * TENU : TENU; // en relais, les entrées partent groupées : on tient les appuis plus longtemps
        const tc = Math.round(tcPas);
        const m = { k: P.k, n: nEnvoi, tc, av: en ? r2(num(en.avant, -1, 1)) : 0, ya: r3(moi.yaw), pi: r3(moi.pitch), x: r2(moi.x), y: r2(moi.y), z: r2(moi.z), vy: r2(moi.vy || 0), sol: moi.auSol ? 1 : 0,
          m: moi.score.morts, v: vit ? 1 : 0, tv: r3(tRenduVu), ae: dernierN, ad: Math.round(now - dernierRecu), nt: nTirs };
        // les champs nuls ne partent pas (l'hôte lit l'absence comme 0 / false / null) : l'entrée tient sous 220 o
        if (en && en.cote) m.co = r2(num(en.cote, -1, 1)); if (tirDepuis) m.ti = 1; if (now - sautA < tenu) m.sa = 1; if (en && en.accroupi) m.ac = 1;
        if (now - rechA < tenu) m.re = 1; if (now - armeA < tenu && armeVoulue) m.ar = armeVoulue;
        if (vit && nPiste > 1) m.tr = traceDepuis(relais);
        if (envoyer('entree', m, { fiable: false })) envoyes++;
        tcEnvoi = tc;
        if (vit) { hist.push({ n: nEnvoi, x: moi.x, z: moi.z }); if (hist.length > 90) hist.shift(); }
        tirDepuis = false;
      }
      return out;
    }
    // tr : [[Δtc (ms avant tc), x, y, z, posture], …] du plus ancien au plus récent, sans le pas de l'entrée (porté par x, y, z) :
    // en direct, les pas depuis l'entrée précédente (1) ; en relais (seule la dernière entrée de chaque envoi groupé arrive), les
    // 270 dernières ms, un pas sur deux (≤ 8)
    function traceDepuis(relais) {
      const tr = [], tc = PISTE[((iPiste - 1 + NPISTE) % NPISTE) * 5];
      for (let k = nPiste - 1; k >= 1; k--) {
        if (relais && (k & 1)) continue;
        const o = ((iPiste - 1 - k + 2 * NPISTE) % NPISTE) * 5, t = PISTE[o];
        if (relais ? tc - t > 270 : t <= tcEnvoi) continue;
        tr.push([Math.round(tc - t), r2(PISTE[o + 1]), r2(PISTE[o + 2]), r2(PISTE[o + 3]), PISTE[o + 4]]);
      }
      return tr;
    }

    function interpoler(tR, sortie) {
      const n = tampon.length; if (!n) return;
      let a = null, b = null, ia = -1;
      for (let i = n - 1; i >= 0; i--) if (tampon[i].t <= tR) { a = tampon[i]; b = tampon[i + 1] || null; ia = i; break; }
      if (!a) { a = tampon[0]; b = null; ia = -1; }
      nInterp++; if (!b) nProl++;
      const u = b ? Math.max(0, Math.min(1, (tR - a.t) / Math.max(1e-6, b.t - a.t))) : 0;
      const prec = !b && ia > 0 ? tampon[ia - 1] : null, ex = prec ? Math.min(0.2, tR - a.t) / Math.max(1e-3, a.t - prec.t) : 0; // plus d'état après : on prolonge le dernier mouvement (≤ 200 ms : un état perdu sur un réseau mauvais)
      const es = jeu.entites;
      for (let i = 0; i < es.length; i++) {
        const e = es[i]; if (e === moi) continue;
        const ra = a.rows.get(e.id), rb = b ? b.rows.get(e.id) : null, r = u >= 0.5 && rb ? rb : ra || rb; if (!r) continue;
        J.lireLigne(r, e, jeu.temps, 'corps');
        if (ra && rb && (ra[8] & 1) && (rb[8] & 1)) {
          const dx = rb[1] - ra[1], dz = rb[3] - ra[3];
          if (dx * dx + dz * dz < 16) { e.x = ra[1] + dx * u; e.y = ra[2] + (rb[2] - ra[2]) * u; e.z = ra[3] + dz * u; e.yaw = ra[4] + ecartAngle(rb[4], ra[4]) * u; e.pitch = ra[5] + (rb[5] - ra[5]) * u; }
        } else if (prec && ra && ex > 0 && (ra[8] & 1)) {
          const rp = prec.rows.get(e.id);
          if (rp && (rp[8] & 1)) { const dx = ra[1] - rp[1], dz = ra[3] - rp[3]; if (dx * dx + dz * dz < 9) { const p = monde.deplacer(ra[1], ra[3], dx * ex, dz * ex, JO.rayon); e.x = p[0]; e.z = p[1]; e.y = ra[2] + (ra[2] - rp[2]) * ex; } }
        }
        // les pas des autres (pour le son), tous les 1,7 m au sol, debout
        let p = pasDe.get(e.id); if (!p) { p = { x: e.x, z: e.z, f: 0 }; pasDe.set(e.id, p); }
        const d = Math.hypot(e.x - p.x, e.z - p.z); p.x = e.x; p.z = e.z;
        if (e.vivant && e.auSol && !e.accroupi && d < 3) { p.f += d; if (p.f >= 1.7) { p.f -= 1.7; sortie.push({ t: 'pas', id: e.id }); } }
        e.ax = e.x; e.ay = e.y; e.az = e.z; e.aoeil = e.oeil; // déjà à l'heure de l'image : le rendu ne les interpole pas une seconde fois
      }
    }
    function tic(now) { // l'hôte muet trop longtemps : parti
      if (arrete || jeu.fini || finEnAttente) return;
      const der = dernierRecu || debut;
      if (now - Math.max(der, debut) > MUET) finir('hote');
    }
    jeu.etape = etapeClient; jeu.avantImage = avantImage;
    P.recevoir = recevoir; P.tic = tic;
    P.arreter = () => { arrete = true; };
    P.stats = () => { const dt = Math.max(0.5, (maintenant() - (t0 || maintenant())) / 1000); return { hote: false, recusParS: recus / dt, envoyesParS: envoyes / dt, recus, envoyes, t: maintenant(), cale, retard: r3(jeu.temps - (dernierT >= 0 ? dernierT : 0)), tampon: tampon.length, recalage: r2(Math.hypot(corr.x, corr.z)), cales: nCales, douces: nDouces, delai: r3(delai), delaiEff: r3(delaiEff), sautsHorloge: nSauts, prolonge: nInterp ? r3(nProl / nInterp) : 0, parImage, intervalle: Math.round(intervalle) }; };
    return P;
  }

  return { ouvrir, pseudoAuHasard, couleurDe, get erreurs() { return erreurs; }, get derniereErreur() { return derniereErreur; }, DELAI, ETAT_MS, EVTS_MS, ENTREE_MS };
})();
