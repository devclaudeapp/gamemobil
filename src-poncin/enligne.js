/* OPÉRATION PONCIN — la partie en ligne : relie PRESEAU (les salons), PJEU (la simulation, chez l'hôte) et l'interface (PUI).
   L'hôte fait autorité : il simule toute la partie avec PJEU (robots compris, réglages du salon) et applique à chaque pas la dernière
   entrée reçue de chaque client ; il envoie l'état (« etat », 20 Hz, non fiable, nombres arrondis), les événements groupés (« evts »,
   fiable, ≤ 14 envois/s) et le résultat (« fin »). Le client montre une « façade » : un PJEU jamais simulé (même graine, mêmes joueurs
   dans le même ordre : mêmes robots, mêmes objets, même arène), dont les entités sont écrites par les instantanés de l'hôte ; les autres
   y sont interpolés 100 ms en arrière, son propre joueur est prédit sur place (PJEU.deplacer : la même physique) et recalé sur l'hôte
   (en douceur, net au-delà de 2 m) ; ses tirs montrent tout de suite l'éclair et la traînée (PJEU.tirVisuel), le marqueur de touche
   arrive avec « evts ». Il envoie ses commandes (« entree », 30 Hz, non fiable) avec son regard en absolu et sa position prédite, que
   l'hôte adopte si elle est plausible (à moins de 3 m de la sienne, hors des murs, même vie) ; l'hôte compense la latence des tirs.
   Départs : un client muet 10 s est retiré ; l'hôte parti (ou muet 10 s) → fin de partie « L'hôte a quitté la partie ».
   API : PENLIGNE.ouvrir({ via, code, moi: { id, pseudo, couleur }, config, monde, carte }) → Promise<salon> ; PENLIGNE.pseudoAuHasard().
     salon.code, .idMoi, .via, .estHote, .hote, .reglages { bots, niveau, equipes }, .enJeu, .partie (null ou { k, jeu, idMoi, estHote, dans }),
     salon.joueurs() → [{ id, pseudo, couleur, pret, hote, moi, ping, voie }], salon.regler(o), salon.pret(oui), salon.renommer(pseudo), salon.lancer() → true | raison,
     salon.retourSalon(), salon.quitter(), salon.stats(), salon.sur(type, fn) → off ('maj', 'partie', 'salon', 'ferme').
   La partie passe par jeu.etape(dt, entrees) comme en solo (l'hôte : le vrai PJEU enveloppé ; le client : la façade) ; la fin arrive
   en événement { t: 'fin', classement, resultat } (resultat.raison = 'hote' si l'hôte est parti). Voir src-poncin/ARCHITECTURE.md,
   « Le jeu en ligne ». Rien ne sort d'ici en exception : tout est rattrapé et compté (console.warn, jamais console.error). */
const PENLIGNE = (() => {
  'use strict';
  const ETAT_MS = 50, EVTS_MS = 70, ENTREE_MS = 1000 / 30; // 20 états/s, ≤ 14,3 paquets d'événements/s, 30 entrées/s
  const DELAI = 0.1, DELAI_MAX = 0.45, MUET = 10000, NET = 2, ZONE_MORTE = 0.08, DANS = 3.6, TENU = 150, LACHE = 250;
  // DELAI : l'interpolation des autres, au moins 100 ms, plus si les états arrivent moins souvent (le relais du transport : ~5 envois/s) ;
  // TENU : un appui bref (saut, recharge, arme) est répété dans les entrées pendant ce temps (une entrée perdue ne le perd pas) ;
  // LACHE : sans entrée d'un client depuis ce temps (ou 2,5 × l'intervalle mesuré), l'hôte lui lâche les commandes (plus de course sans fin)
  const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
  const fini = (v) => typeof v === 'number' && v - v === 0;
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
      envoyer('lancer', { k, graine, options, joueurs: P.liste, dans: DANS }, { fiable: true });
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
    for (const j of liste) if (j.id !== idMoi) clients.set(j.id, { id: j.id, nom: j.pseudo, entree: { avant: 0, cote: 0, dyaw: 0, dpitch: 0, tir: false, saut: false, accroupi: false, recharge: false, arme: null }, n: 0, recuA: 0, vu: debut, pos: { x: 0, y: 0, z: 0, m: 0, v: false, vy: 0, sol: true, neuf: false }, adopte: false, rtt: 0, intervalle: ENTREE_MS });
    const ent = {}, ACKS = {}, envoiT = new Float64Array(64), envoiN = new Int32Array(64), aEnvoyer = [], enPlus = [];
    let nEtat = 0, dernierEtat = -1e9, dernierEvts = -1e9, derniereEtape = 0, finale = false, finEnvoyee = false, arrete = false, envoyes = 0, t0 = 0;
    const P = { k: L.k, jeu, idMoi, estHote: true, hote: true, hoteId: idMoi, dans: L.dans, liste, resultat: null, demarre: false };

    function adopter(c, e) { // la position prédite du client, si elle est plausible
      const p = c.pos; if (!p.neuf) return; p.neuf = false;
      if (!e.vivant || !p.v || p.m !== e.score.morts) { c.adopte = false; return; }
      const dx = p.x - e.x, dz = p.z - e.z;
      if (dx * dx + dz * dz > 9 || Math.abs(p.y - e.y) > 3 || monde.bloque(p.x, p.z, JO.rayon - 0.05)) { c.adopte = false; return; }
      e.x = p.x; e.z = p.z; e.y = p.y; e.vy = p.vy; e.auSol = p.sol; c.adopte = true;
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
      if (aEnvoyer.length && (now - dernierEvts >= EVTS_MS || finale)) { dernierEvts = now; if (clients.size) { envoyer('evts', { k: L.k, ev: aEnvoyer.splice(0) }, { fiable: true }); envoyes++; } else aEnvoyer.length = 0; }
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
      for (const c of clients.values()) {
        const e = jeu.trouver(c.id); if (!e) continue;
        const en = c.entree;
        if (now - c.recuA > Math.max(LACHE, 2.5 * c.intervalle + 100)) { en.avant = 0; en.cote = 0; en.tir = false; en.saut = false; en.recharge = false; en.arme = null; } // plus de nouvelles : il lâche tout
        adopter(c, e);
        ent[c.id] = en;
      }
      let evs;
      try { evs = vrai(dt, ent); } catch (e) { signaler('simulation', e); return enPlus.splice(0); }
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
      en.avant = num(d.av, -1, 1); en.cote = num(d.co, -1, 1);
      if (fini(d.ya)) en.yaw = d.ya; if (fini(d.pi)) en.pitch = d.pi;
      en.tir = !!d.ti; en.saut = !!d.sa; en.accroupi = !!d.ac; en.recharge = !!d.re; en.arme = J.ARMES_ID.indexOf(d.ar) >= 0 ? d.ar : null;
      const p = c.pos;
      if (fini(d.x) && fini(d.y) && fini(d.z)) { p.x = d.x; p.y = d.y; p.z = d.z; p.m = d.m | 0; p.v = !!d.v; p.vy = num(d.vy, -40, 40); p.sol = !!d.sol; p.neuf = true; }
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
      // l'hôte en arrière-plan (onglet caché, pause du navigateur) : on rattrape la simulation pour les autres, par pas de 50 ms
      if (P.demarre && !jeu.fini && now - derniereEtape > 300) {
        let reste = Math.min(1, (now - derniereEtape) / 1000); const neutre = { [idMoi]: null };
        while (reste > 1e-3 && !jeu.fini) { const d = Math.min(J.DT_MAX, reste); etapeHote(d, neutre); reste -= d; }
      }
    }
    jeu.etape = etapeHote;
    P.recevoir = recevoir; P.tic = tic; P.verifierDeparts = verifierDeparts; P.retirer = retirer;
    P.arreter = () => { arrete = true; jeu.etape = vrai; };
    P.stats = () => { const dt = Math.max(0.5, (maintenant() - (t0 || maintenant())) / 1000); return { hote: true, messagesParClientParS: envoyes / dt, envoyes, t: maintenant(), clients: Array.from(clients.values()).map((c) => ({ id: c.id, rtt: Math.round(c.rtt), adopte: c.adopte, retard: r3(jeu.retardDe(c.id)), intervalle: Math.round(c.intervalle) })) }; };
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
    let tirLocalA = 0, finEnAttente = null, arrete = false, recus = 0, envoyes = 0, t0 = 0, foulee = 0, nCales = 0, nDouces = 0, intervalle = ETAT_MS, gigue = 10, delai = DELAI;
    const debut = maintenant() + (L.dans || 0) * 1000;
    const P = { k: L.k | 0, jeu, idMoi, estHote: false, hote: false, hoteId, dans: L.dans || 0, liste: L.joueurs, resultat: null, demarre: false };
    const GONFLE = { rafale: 0.22, pompe: 0.8, precision: 1 };
    jeu.finir = () => {}; // la fin vient de l'hôte

    // ─── réception ───
    function histDe(n) { for (let i = hist.length - 1; i >= 0; i--) if (hist[i].n <= n) return hist[i]; return null; }
    function caler(l) { // net : la position (et le regard) de l'hôte
      moi.x = l[1]; moi.y = l[2]; moi.z = l[3]; moi.vx = moi.vz = moi.vy = 0; moi.auSol = true; corr.x = corr.z = 0; hist.length = 0; nCales++;
    }
    function recevoirEtat(d) {
      if ((d.k | 0) !== P.k || !Array.isArray(d.e) || !fini(d.t)) return;
      const n = d.n | 0; if (n <= dernierN) return; // en retard sur un plus récent
      const now = maintenant();
      if (dernierRecu > 0) { const iv = Math.min(1000, now - dernierRecu); gigue = gigue * 0.9 + Math.abs(iv - intervalle) * 0.1; intervalle = intervalle * 0.9 + iv * 0.1; }
      dernierN = n; dernierT = d.t; dernierRecu = now; recus++;
      delai = Math.max(DELAI, Math.min(DELAI_MAX, (1.2 * intervalle + 2.5 * gigue) / 1000 + 0.03)); // assez d'avance pour avoir presque toujours deux états entre lesquels interpoler
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
      else if (!vivantH) { moi.vivant = false; moi.x = l[1]; moi.y = l[2]; moi.z = l[3]; corr.x = corr.z = 0; hist.length = 0; } // repeint : on reste où l'hôte nous voit
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

    // ─── une image : horloge, prédiction, tirs pour l'image, recalage, interpolation, événements, envoi ───
    function etapeClient(dt, entrees) {
      out.length = 0;
      if (arrete) return out;
      for (let i = 0; i < immediats.length; i++) out.push(immediats[i]); immediats.length = 0; // arrivés depuis l'image d'avant
      if (finEnAttente) { out.push(finEnAttente); finEnAttente = null; jeu.fini = true; return out; }
      if (jeu.fini) return out;
      dt = +dt; if (!(dt > 0)) dt = 0; if (dt > 0.1) dt = 0.1;
      const now = maintenant();
      if (!P.demarre) { P.demarre = true; t0 = now; }
      // l'horloge de l'hôte : la dernière nouvelle plus le temps écoulé, lissée (jamais en arrière)
      if (dernierT >= 0) { const cible = dernierT + (now - dernierRecu) / 1000, ec = cible - jeu.temps; if (Math.abs(ec) > 0.5) jeu.temps = cible; else jeu.temps += Math.max(0, dt + ec * Math.min(1, dt * 3)); }
      const tRendu = jeu.temps - delai, T = jeu.temps;
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
          moi.munitions[moi.arme] = Math.max(0, (moi.munitions[moi.arme] | 0) - 1); tirsEnVol.push(nEnvoi + 1);
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
      // les autres : interpolés 100 ms en arrière ; leurs pas
      interpoler(tRendu);
      // les événements de l'hôte, à l'heure
      while (attente.length && (attente[0].h <= tRendu || attente[0].h < T - 1 || attente.length > 400)) out.push(attente.shift());
      // l'entrée, 30 fois par seconde
      if (now - dernierEnvoi >= ENTREE_MS - 2) {
        dernierEnvoi = now; nEnvoi++;
        const vit = cale && moi.vivant, j = ctl.salon.joueurs.get(idMoi), tenu = j && j.voie === 'relais' ? 3 * TENU : TENU; // en relais, les entrées partent groupées : on tient les appuis plus longtemps
        const m = { k: P.k, n: nEnvoi, av: en ? r2(num(en.avant, -1, 1)) : 0, co: en ? r2(num(en.cote, -1, 1)) : 0, ya: r3(moi.yaw), pi: r3(moi.pitch), ti: tirDepuis ? 1 : 0, sa: now - sautA < tenu ? 1 : 0,
          ac: en && en.accroupi ? 1 : 0, re: now - rechA < tenu ? 1 : 0, ar: now - armeA < tenu ? armeVoulue : 0, x: r2(moi.x), y: r2(moi.y), z: r2(moi.z), vy: r2(moi.vy || 0), sol: moi.auSol ? 1 : 0,
          m: moi.score.morts, v: vit ? 1 : 0, tv: r3(tRendu), ae: dernierN, ad: Math.round(now - dernierRecu) };
        if (envoyer('entree', m, { fiable: false })) envoyes++;
        if (vit) { hist.push({ n: nEnvoi, x: moi.x, z: moi.z }); if (hist.length > 90) hist.shift(); }
        tirDepuis = false;
      }
      return out;
    }

    function interpoler(tR) {
      const n = tampon.length; if (!n) return;
      let a = null, b = null, ia = -1;
      for (let i = n - 1; i >= 0; i--) if (tampon[i].t <= tR) { a = tampon[i]; b = tampon[i + 1] || null; ia = i; break; }
      if (!a) { a = tampon[0]; b = null; ia = -1; }
      const u = b ? Math.max(0, Math.min(1, (tR - a.t) / Math.max(1e-6, b.t - a.t))) : 0;
      const prec = !b && ia > 0 ? tampon[ia - 1] : null, ex = prec ? Math.min(0.12, tR - a.t) / Math.max(1e-3, a.t - prec.t) : 0; // plus d'état après : on prolonge un peu (≤ 120 ms) le dernier mouvement
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
        if (e.vivant && e.auSol && !e.accroupi && d < 3) { p.f += d; if (p.f >= 1.7) { p.f -= 1.7; out.push({ t: 'pas', id: e.id }); } }
      }
    }
    function tic(now) { // l'hôte muet trop longtemps : parti
      if (arrete || jeu.fini || finEnAttente) return;
      const der = dernierRecu || debut;
      if (now - Math.max(der, debut) > MUET) finir('hote');
    }
    jeu.etape = etapeClient;
    P.recevoir = recevoir; P.tic = tic;
    P.arreter = () => { arrete = true; };
    P.stats = () => { const dt = Math.max(0.5, (maintenant() - (t0 || maintenant())) / 1000); return { hote: false, recusParS: recus / dt, envoyesParS: envoyes / dt, recus, envoyes, t: maintenant(), cale, retard: r3(jeu.temps - (dernierT >= 0 ? dernierT : 0)), tampon: tampon.length, recalage: r2(Math.hypot(corr.x, corr.z)), cales: nCales, douces: nDouces, delai: r3(delai), intervalle: Math.round(intervalle) }; };
    return P;
  }

  return { ouvrir, pseudoAuHasard, couleurDe, get erreurs() { return erreurs; }, get derniereErreur() { return derniereErreur; }, DELAI, ETAT_MS, EVTS_MS, ENTREE_MS };
})();
