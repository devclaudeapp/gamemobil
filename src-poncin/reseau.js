/* OPÉRATION PONCIN — les salons entre copains : se retrouver par un code de 4 lettres, puis échanger les messages de la partie.
   Topologie en étoile autour de l'hôte (le plus ancien arrivé, donc le créateur du salon) : les clients parlent à l'hôte, l'hôte parle à un client ou à tous.
   Trois voies (« via ») derrière la même API :
   - 'supabase'     : (par défaut) présence et signalisation par Supabase Realtime (canal public 'poncin:CODE'), puis WebRTC de téléphone à téléphone ;
                      repli « relais » par le même canal Supabase (débit bridé) si le pair-à-pair ne s'ouvre pas en ~8 s ;
   - 'local'        : BroadcastChannel seul, entre onglets du même navigateur (tests Playwright, démonstrations) ;
   - 'webrtc-local' : présence et signalisation par BroadcastChannel, données par le vrai WebRTC (candidats « host », sans STUN) : sert à éprouver le code WebRTC.
   API (voir src-poncin/ARCHITECTURE.md, « Le jeu en ligne ») :
     PRESEAU.salon({ via, code, creer, moi: { id, pseudo, couleur }, config, relais }) → Promise<salon>
       sans code (ou creer: true) on crée le salon : le créateur est l'hôte tant qu'il est là, puis le plus ancien arrivé ;
       avec un code, on le rejoint : la promesse attend d'avoir vu le créateur (8 s au plus) pour ne jamais se croire hôte à tort ;
       via : 'supabase' | 'local' | 'webrtc-local' ; ?reseau=local (ou webrtc-local) dans l'adresse de la page l'impose ;
       config : { supabaseUrl, supabaseKey } (clé PUBLIQUE), sinon window.PONCIN_CONFIG ; relais: true (ou ?relais=1) empêche le pair-à-pair (essai du relais).
       Rejette avec une Error au message lisible si le serveur des salons est injoignable ou le jeu en ligne pas configuré.
     salon.code, salon.via, salon.moi, salon.hote (id), salon.estHote, salon.ferme
     salon.joueurs : Map id → { id, pseudo, couleur, pret, ping, voie, depuis, cree } (moi compris ; cree : c'est le créateur du salon)
       voie : comment ce joueur joint l'hôte : 'hote' (c'est l'hôte), 'p2p' (WebRTC direct), 'relais' (par le serveur, ≤ 5 envois/s), 'connexion' (en cours) ; 'local' sur la voie locale ;
       ping : aller-retour avec l'hôte en ms (0 pour l'hôte), mesuré toutes les 2 s (4 s en relais).
     salon.sur(type, fn(data, de)) → off      (types de l'application ; et 'joueurs' (liste), 'hote' ({ hote, avant }), 'ferme')
     salon.envoyer(type, data, { fiable = true, a = null }) → bool   (client → hôte seulement ; hôte → a, ou tous si a = null)
       fiable : livré une fois, dans l'ordre (numéroté, acquitté, renvoyé si besoin, même en changeant de voie) ;
       non fiable : le dernier compte (en relais, seul le dernier de chaque type part, 5 fois/s au plus) ; jeté si le tampon dépasse 64 Ko.
     salon.majMoi({ pret, pseudo, couleur }), salon.stats(), salon.quitter()
   Sur le fil (voies WebRTC) : chaque message est un tableau JSON : [0, type, data] non fiable (DataChannel 'etat', id 0, sans ordre ni renvoi),
   [1, n°, type, data] fiable (DataChannel 'evts', id 1), [2, t, acquis, infos, partis] ping (de l'hôte : { id: [ping, voie] } et les instances parties), [3, t, acquis] pong, [4] au revoir.
   Le relais : un envoi 'relais' { de, i (instance), v, l: { idDestinataire: [messages…] } } toutes les 200 ms au plus (tous les destinataires dans le même envoi).
   La signalisation : 'signal' { de, a, i, n (essai), v, j (l'offre porte aussi pseudo, couleur, prêt…), sdp } ; offre du client, réponse de l'hôte, ICE complet (pas de « trickle »). */
const PRESEAU = (() => {
  'use strict';
  const LETTRES = 'BCDFGHJKLMNPQRSTVWXZ'; // des consonnes : pas de mot vexant ; 160 000 codes
  const nouveauCode = () => { let c = ''; for (let i = 0; i < 4; i++) c += LETTRES[Math.floor(Math.random() * LETTRES.length)]; return c; };
  const codeValide = (c) => typeof c === 'string' && /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(c);
  const VERSION = 1; // version du protocole : deux versions différentes ne jouent pas ensemble
  // réglages (ms) : collecte ICE, attente du pair-à-pair avant le relais, pings, cadence du relais (≤ 5 envois/s), tampon max pour l'état,
  // renvoi des fiables non acquittés, grâce d'un joueur sorti de la présence (lien direct vivant / sinon : le temps qu'il se reconnecte), essais WebRTC suivants (en relais)
  const R = { collecte: 3000, attente: 8000, ping: 2000, pingRelais: 4000, relais: 200, tampon: 65536, renvoi: 4000, grace: 15000, graceCourte: 5000, essais: [10000, 20000, 40000, 60000] };
  const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  const attendreQue = async (f, ms) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) return false; await attendre(50); } return true; };
  const param = (k) => { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } };
  const sur = (f) => function () { try { return f.apply(this, arguments); } catch (e) { console.warn('[Poncin réseau]', e); } }; // jamais d'exception qui remonte d'un rappel réseau

  // ─── le socle commun : abonnés, liste des joueurs, élection de l'hôte (le plus ancien arrivé) ───
  function socle(code, moi) {
    const abonnes = new Map(), joueurs = new Map(), stats = { envoyes: 0, recus: 0, octets: 0, t0: Date.now(), p2pEnv: 0, p2pRec: 0, relaisEnv: 0, relaisRec: 0, signaux: 0, jetes: 0 };
    const s = {
      code, moi: Object.assign({ pret: false }, moi), hote: null, estHote: false, joueurs, ferme: false,
      sur(type, fn) { if (!abonnes.has(type)) abonnes.set(type, new Set()); abonnes.get(type).add(fn); return () => abonnes.get(type).delete(fn); },
      _emettre(type, data, de) { const l = abonnes.get(type); if (l) for (const fn of Array.from(l)) { try { fn(data, de); } catch (e) { console.error('[Poncin réseau]', type, e); } } },
      _elire() { // l'hôte = le créateur du salon s'il est là, sinon le plus ancien arrivé (départage par id) ; prévient si ça change
        const avant = (a, b) => (!!a.cree !== !!b.cree ? !!a.cree : a.depuis !== b.depuis ? a.depuis < b.depuis : a.id < b.id);
        let h = null; for (const j of joueurs.values()) if (!h || avant(j, h)) h = j;
        const id = h ? h.id : null; if (id !== s.hote) { const avant = s.hote; s.hote = id; s.estHote = id === s.moi.id; if (avant !== null) s._emettre('hote', { hote: id, avant }); }
      },
      _stats: stats,
      stats() {
        const dt = Math.max(1, (Date.now() - stats.t0) / 1000), r = (k) => Math.round(stats[k] / dt * 10) / 10;
        return { envoyesParS: stats.envoyes / dt, recusParS: stats.recus / dt, octetsParS: stats.octets / dt, p2pEnvoyesParS: r('p2pEnv'), p2pRecusParS: r('p2pRec'),
          relaisEnvoyesParS: r('relaisEnv'), relaisRecusParS: r('relaisRec'), signaux: stats.signaux, jetes: stats.jetes, secondes: dt, compteurs: Object.assign({}, stats),
          voies: Array.from(joueurs.values()).map((j) => j.voie), liens: s._liens ? s._liens() : [] };
      },
    };
    return s;
  }

  // ─── voie 'local' : BroadcastChannel (même navigateur) ───
  async function salonLocal(o) {
    if (typeof BroadcastChannel === 'undefined') throw new Error('BroadcastChannel indisponible');
    const code = codeValide(o.code) ? o.code : nouveauCode(), s = socle(code, o.moi), bc = new BroadcastChannel('poncin-salle-' + code);
    const depuis = Date.now() + Math.random() / 1000, vus = new Map(); // id → dernier signe de vie
    const moiPublic = () => ({ id: s.moi.id, pseudo: s.moi.pseudo, couleur: s.moi.couleur, pret: !!s.moi.pret, depuis, v: VERSION });
    const poser = (j) => { const avant = s.joueurs.get(j.id); s.joueurs.set(j.id, Object.assign(avant || {}, { id: j.id, pseudo: j.pseudo, couleur: j.couleur, pret: !!j.pret, depuis: j.depuis, ping: 0, voie: 'local' })); vus.set(j.id, Date.now()); };
    const poster = (m) => { try { const t = JSON.stringify(m); s._stats.envoyes++; s._stats.octets += t.length; bc.postMessage(t); } catch (e) { /* fermé */ } };
    const listeChangee = () => { s._elire(); s._emettre('joueurs', Array.from(s.joueurs.values())); };
    poser(moiPublic()); s._elire();
    bc.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || m.de === s.moi.id || s.ferme) return;
      s._stats.recus++;
      if (m.k === 'salut' || m.k === 'vie') { if (!m.j || m.j.v !== VERSION) return; const nouveau = !s.joueurs.has(m.j.id); poser(m.j); if (m.k === 'salut') poster({ k: 'vie', de: s.moi.id, j: moiPublic() }); if (nouveau || m.k === 'salut') listeChangee(); else s._emettre('joueurs', Array.from(s.joueurs.values())); return; }
      if (m.k === 'adieu') { s.joueurs.delete(m.de); vus.delete(m.de); listeChangee(); return; }
      if (m.k === 'msg') {
        if (m.a && m.a !== s.moi.id) return;                 // pas pour moi
        if (!s.estHote && m.de !== s.hote) return;            // un client n'écoute que l'hôte (étoile)
        s._emettre(m.type, m.data, m.de);
      }
    };
    const battement = setInterval(() => { // signe de vie toutes les secondes ; un joueur muet 4 s est parti
      poster({ k: 'vie', de: s.moi.id, j: moiPublic() });
      const t = Date.now(); let change = false; for (const [id, v] of vus) if (id !== s.moi.id && t - v > 4000) { s.joueurs.delete(id); vus.delete(id); change = true; }
      if (change) listeChangee();
    }, 1000);
    s.via = 'local';
    s.envoyer = (type, data, opt) => {
      if (s.ferme) return false;
      const a = opt && opt.a ? opt.a : null;
      if (!s.estHote && (!s.hote || s.hote === s.moi.id || (a && a !== s.hote))) return false; // étoile : un client ne parle qu'à l'hôte
      poster({ k: 'msg', de: s.moi.id, a: s.estHote ? a : s.hote, type, data }); return true;
    };
    s.majMoi = (o2) => { Object.assign(s.moi, o2 || {}); poser(moiPublic()); poster({ k: 'vie', de: s.moi.id, j: moiPublic() }); s._emettre('joueurs', Array.from(s.joueurs.values())); };
    s.quitter = () => { if (s.ferme) return; poster({ k: 'adieu', de: s.moi.id }); s.ferme = true; clearInterval(battement); try { bc.close(); } catch (e) { /* rien */ } s._emettre('ferme', {}); };
    poster({ k: 'salut', de: s.moi.id, j: moiPublic() });
    await attendre(400); // le temps que les présents répondent : l'hôte est alors le bon
    listeChangee();
    return s;
  }

  // ─── les transports des voies WebRTC : présence + bus ('signal', 'relais') ───
  // transport : { demarrer() → Promise<liste des présents>, suivre(moiPublic), envoyer(evt, payload) → bool, pret() → bool, fermer() }
  // rappels : { presence(liste [{ id, pseudo, couleur, pret, depuis, v, i }]), signal(payload), relais(payload) }

  // BroadcastChannel (voie 'webrtc-local') : un signe de vie par seconde, muet 4 s = parti
  function transportBC(code, id, rappels) {
    if (typeof BroadcastChannel === 'undefined') throw new Error('BroadcastChannel indisponible');
    const bc = new BroadcastChannel('poncin-rtc-' + code), vus = new Map(); let moiP = null, ferme = false;
    const poster = (m) => { try { bc.postMessage(JSON.stringify(m)); } catch (e) { /* fermé */ } };
    const liste = () => Array.from(vus.values()).map((x) => x.j);
    bc.onmessage = sur((ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (!m || m.de === id || ferme) return;
      if (m.k === 'qui') { if (moiP) poster({ k: 'vie', de: id, j: moiP }); return; }
      if (m.k === 'vie' && m.j) { const j = Object.assign({}, m.j, { id: m.de }), avant = vus.get(m.de), change = !avant || JSON.stringify(avant.j) !== JSON.stringify(j); vus.set(m.de, { j, t: Date.now() }); if (change) rappels.presence(liste()); return; }
      if (m.k === 'adieu') { if (vus.delete(m.de)) rappels.presence(liste()); return; }
      if (m.k === 'bus' && (m.e === 'signal' || m.e === 'relais')) rappels[m.e](m.p);
    });
    const battement = setInterval(sur(() => {
      if (moiP) poster({ k: 'vie', de: id, j: moiP });
      const t = Date.now(); let ch = false; for (const [k, v] of vus) if (t - v.t > 4000) { vus.delete(k); ch = true; }
      if (ch) rappels.presence(liste());
    }), 1000);
    return {
      async demarrer() { poster({ k: 'qui', de: id }); await attendre(400); return liste(); },
      suivre(j) { moiP = j; poster({ k: 'vie', de: id, j }); },
      envoyer(e, p) { if (ferme) return false; poster({ k: 'bus', de: id, e, p }); return true; },
      pret: () => !ferme,
      fermer() { if (ferme) return; poster({ k: 'adieu', de: id }); ferme = true; clearInterval(battement); try { bc.close(); } catch (e) { /* rien */ } },
    };
  }

  // Supabase Realtime (voie 'supabase') : canal public 'poncin:CODE' ; présence (clé = moi.id) et broadcast ('signal', 'relais'), sans écho
  function transportSupabase(code, id, o, rappels) {
    const cfg = o.config || (typeof window !== 'undefined' && window.PONCIN_CONFIG) || {};
    if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('Le jeu en ligne n’est pas configuré (poncin/config.js).');
    const lib = typeof window !== 'undefined' && window.supabase;
    if (!lib || !lib.createClient) throw new Error('Le module en ligne (supabase-js) n’est pas chargé : vérifie ta connexion.');
    // un client à nous (sans session, sans stockage) : on peut le jeter et en refaire un si le canal reste coincé
    const creerClient = () => lib.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'poncin-salon-' + Math.random().toString(36).slice(2) }, realtime: { heartbeatIntervalMs: 15000 } });
    let client = null, canal = null, moiP = null, ferme = false, joint = false, perdu = 0, syncs = 0, refaits = 0;
    const t0 = Date.now(), journal = [], noter = (quoi) => { journal.push(Math.round((Date.now() - t0) / 100) / 10 + ' s ' + quoi); if (journal.length > 60) journal.splice(0, 20); }; // pour le diagnostic
    const liste = () => {
      const l = []; let st = {}; try { st = canal ? canal.presenceState() : {}; } catch (e) { st = {}; }
      for (const cle of Object.keys(st)) { const metas = st[cle], m = metas && metas[metas.length - 1]; if (m) l.push({ id: cle, pseudo: m.pseudo, couleur: m.couleur, pret: !!m.pret, depuis: m.depuis, c: m.c, v: m.v, i: m.i }); }
      return l;
    };
    const suivreMaintenant = (c) => { if (moiP && c === canal && joint) c.track(moiP).catch(() => { /* reprise au prochain SUBSCRIBED */ }); };
    function ouvrir() {
      if (!client) client = creerClient();
      const c = client.channel('poncin:' + code, { config: { broadcast: { self: false, ack: false }, presence: { key: id } } });
      canal = c; joint = false; perdu = Date.now(); syncs = 0;
      c.on('presence', { event: 'sync' }, sur(() => { if (canal !== c || ferme) return; syncs++; const l = liste(); noter('présence ' + l.length); rappels.presence(l); }));
      c.on('broadcast', { event: 'signal' }, sur((m) => { if (canal === c && !ferme) rappels.signal(m && m.payload); }));
      c.on('broadcast', { event: 'relais' }, sur((m) => { if (canal === c && !ferme) rappels.relais(m && m.payload); }));
      c.subscribe(sur((statut) => {
        if (canal !== c || ferme) return;
        noter(statut);
        if (statut === 'SUBSCRIBED') { joint = true; perdu = 0; suivreMaintenant(c); return; } // aussi après chaque reconnexion : on se remet dans la présence
        if (joint || !perdu) perdu = Date.now(); joint = false;
        if (statut === 'CLOSED') setTimeout(sur(() => { if (canal === c && !ferme && !joint) refaire(); }), 1500); // fermé par le serveur : on recommence
        // CHANNEL_ERROR, TIMED_OUT : supabase-js se reconnecte et rejoint tout seul
      }));
    }
    function refaire() { // un client et un canal neufs
      const vieux = client; client = null; canal = null; refaits++; noter('canal refait');
      if (vieux) vieux.removeAllChannels().catch(() => { /* rien */ });
      ouvrir();
    }
    const veille = setInterval(sur(() => { // le canal reste décroché 25 s (page visible) : on refait tout
      const cache = typeof document !== 'undefined' && document.hidden;
      if (!ferme && !joint && perdu && !cache && Date.now() - perdu > 25000) refaire();
    }), 5000);
    return {
      async demarrer() {
        ouvrir();
        if (!(await attendreQue(() => joint || ferme, 15000))) { this.fermer(); throw new Error('Le serveur des salons ne répond pas : vérifie ta connexion et réessaie.'); }
        await attendreQue(() => syncs > 0 || ferme, 2500); // la liste des présents arrive juste après l'entrée dans le canal
        return liste();
      },
      suivre(j) { moiP = j; suivreMaintenant(canal); },
      envoyer(e, p) { if (!this.pret()) return false; canal.send({ type: 'broadcast', event: e, payload: p }).catch(() => { /* perdu : les fiables seront renvoyés */ }); return true; },
      pret: () => !!(joint && !ferme && canal && client && client.realtime && client.realtime.isConnected()), // WebSocket tombé : on attend (pas de repli REST)
      etat: () => ({ joint, refaits, syncs, journal: journal.slice() }),
      fermer() { if (ferme) return; ferme = true; clearInterval(veille); const c = client; client = null; canal = null; if (c) c.removeAllChannels().catch(() => { /* rien */ }); },
    };
  }

  // ─── voies WebRTC ('supabase', 'webrtc-local') : présence, élection, liens en étoile (WebRTC ou relais), messages numérotés ───
  async function salonPair(o, via) {
    const code = codeValide(o.code) ? o.code : nouveauCode(), s = socle(code, o.moi), st = s._stats, local = via === 'webrtc-local';
    const inst = Math.random().toString(36).slice(2, 10); // cette instance : un joueur qui recharge sa page repart à zéro
    const sansP2P = !!o.relais || param('relais') === '1';
    const creer = o.creer != null ? !!o.creer : !codeValide(o.code); // sans code, on crée le salon : le créateur reste l'hôte tant qu'il est là
    const liens = new Map(), presents = new Map(), absents = new Map(); // liens : id → lien ; presents : ce que dit la présence ; absents : id → depuis quand un joueur au lien direct vivant manque à la présence
    let depuis = Date.now(), demarre = false, relaisT = null, relaisDernier = 0, signature = '', infosHote = {};
    const partis = new Map(); // instances qui ont dit au revoir (→ quand) : retirées tout de suite, même si la présence traîne
    const moiPublic = () => ({ pseudo: s.moi.pseudo, couleur: s.moi.couleur, pret: !!s.moi.pret, depuis, c: creer ? 1 : 0, v: VERSION, i: inst });
    const rappels = { presence: (l) => majPresence(l), signal: (p) => surSignal(p), relais: (p) => surRelais(p) };
    const transport = local ? transportBC(code, s.moi.id, rappels) : transportSupabase(code, s.moi.id, o, rappels);
    s.via = via;

    // ── présence → joueurs → hôte → liens ──
    function majPresence(liste) {
      presents.clear();
      for (const j of liste || []) if (j && j.id && j.id !== s.moi.id && j.v === VERSION && typeof j.depuis === 'number') presents.set(j.id, j);
      if (demarre) recalculer();
    }
    const poserJoueur = (id, j) => { const e = s.joueurs.get(id) || { id, ping: 0, voie: 'connexion' }; e.pseudo = j.pseudo; e.couleur = j.couleur; e.pret = !!j.pret; e.depuis = j.depuis; e.cree = !!j.c; s.joueurs.set(id, e); };
    function recalculer() {
      if (s.ferme) return;
      const t = Date.now(), gardes = new Set([s.moi.id]);
      poserJoueur(s.moi.id, moiPublic());
      for (const [i, q] of partis) if (t - q > 60000) partis.delete(i);
      for (const [id, j] of presents) { if (j.i && partis.has(j.i)) continue; gardes.add(id); poserJoueur(id, j); absents.delete(id); }
      if (s.estHote) for (const l of liens.values()) { // un nouveau venu relié à l'hôte mais pas encore dans la présence (elle peut traîner) : connu par son offre
        if (l.j && !gardes.has(l.id) && !l.parti && t - l.vu < 6000 && !(l.inst && partis.has(l.inst))) { gardes.add(l.id); poserJoueur(l.id, l.j); absents.delete(l.id); }
      }
      for (const id of Array.from(s.joueurs.keys())) {
        if (gardes.has(id)) continue;
        const l = liens.get(id);
        if (l ? !l.parti : id in infosHote) { // sorti de la présence sans dire au revoir (et, pour un client, toujours gardé par l'hôte) : un hoquet du serveur ou une reconnexion, on le garde un moment
          if (!absents.has(id)) absents.set(id, t);
          const vivant = l && l.ouvert && t - l.vu < 5000; // le lien direct vit encore : 15 s ; sinon 5 s
          if (t - absents.get(id) < (vivant ? R.grace : R.graceCourte)) continue;
        }
        absents.delete(id); s.joueurs.delete(id); delete infosHote[id];
        if (s.estHote) for (const l2 of liens.values()) l2.pingT = 0; // les clients l'apprennent au ping suivant (dans la seconde)
      }
      s._elire(); reconcilier(); emettreJoueurs();
    }
    function reconcilier() { // l'hôte garde un lien par joueur ; un client, un seul lien : vers l'hôte
      const voulus = new Set(), t = Date.now();
      if (s.estHote) { for (const id of s.joueurs.keys()) if (id !== s.moi.id) voulus.add(id); } else if (s.hote && s.hote !== s.moi.id) voulus.add(s.hote);
      for (const [id, l] of liens) if (!voulus.has(id) && !(s.estHote && !l.parti && t - l.vu < 10000)) fermerLien(l); // l'hôte garde un nouveau venu pas encore dans la présence
      for (const id of voulus) if (!liens.has(id)) { const l = nouveauLien(id); if (!s.estHote) negocier(l); }
    }
    const voieDe = (l) => (l.ouvert ? 'p2p' : l.echec || Date.now() - l.debut > R.attente ? 'relais' : 'connexion');
    function majVoies() {
      const lh = !s.estHote && s.hote ? liens.get(s.hote) : null;
      for (const j of s.joueurs.values()) {
        if (j.id === s.hote) { j.voie = 'hote'; j.ping = 0; continue; }
        if (s.estHote) { const l = liens.get(j.id); j.voie = l ? voieDe(l) : 'connexion'; j.ping = l ? l.ping : 0; }
        else if (j.id === s.moi.id) { j.voie = lh ? voieDe(lh) : 'connexion'; j.ping = lh ? lh.ping : 0; }
        else { const x = infosHote[j.id]; if (x) { j.ping = x[0]; j.voie = x[1]; } }
      }
    }
    function emettreJoueurs() { // seulement si quelque chose a changé (pseudo, prêt, voie, ping, hôte)
      majVoies();
      const l = Array.from(s.joueurs.values()), sig = JSON.stringify([s.hote, l.map((j) => [j.id, j.pseudo, j.couleur, j.pret, j.voie, j.ping])]);
      if (sig === signature) return; signature = sig; s._emettre('joueurs', l);
    }

    // ── les liens ──
    function nouveauLien(id) {
      const l = { id, inst: null, pc: null, ch: null, ouvert: false, n: 0, debut: Date.now(), echec: false, essai: 0, essaiT: null, minuteur: null, deconnecte: 0,
        q: 1, nonAcq: [], recuQ: 0, attente: new Map(), ping: 0, vu: Date.now(), pingT: 0, relU: new Map(), relF: [], relC: new Map(), parti: false };
      liens.set(id, l); return l;
    }
    function verifierInstance(l, i) { // l'autre a rechargé sa page : la numérotation repart de zéro
      if (!i || l.inst === i) return;
      if (l.inst) { l.q = 1; l.nonAcq = []; l.recuQ = 0; l.attente.clear(); l.relF = []; l.relU.clear(); l.parti = false; }
      l.inst = i;
    }
    function fermerPc(l, doux) { // doux : on laisse 300 ms au dernier message (l'au revoir) avant de couper
      clearTimeout(l.minuteur); l.minuteur = null;
      if (l.pc) { const pc = l.pc; l.pc = null; l.ch = null; const fin = () => { try { pc.close(); } catch (e) { /* rien */ } }; if (doux) setTimeout(fin, 300); else fin(); }
      l.ouvert = false; l.deconnecte = 0;
    }
    function fermerLien(l) {
      const doux = l.ouvert && l.ch; if (doux) { try { l.ch.evts.send('[4]'); } catch (e) { /* rien */ } }
      fermerPc(l, doux); clearTimeout(l.essaiT); if (liens.get(l.id) === l) liens.delete(l.id);
    }
    const filtrer = (d) => (sansP2P && d && d.sdp ? { type: d.type, sdp: d.sdp.split('\r\n').filter((x) => !/^a=(candidate|end-of-candidates)/.test(x)).join('\r\n') } : { type: d.type, sdp: d.sdp }); // essai du relais : sans candidats, ICE ne peut rien ouvrir
    const collecte = (pc) => new Promise((r) => { // ICE non « trickle » : on attend la fin de la collecte (3 s au plus) et on envoie tout d'un coup
      if (pc.iceGatheringState === 'complete') return r();
      let calme = null, fini = false;
      const fin = () => { if (fini) return; fini = true; clearTimeout(t); clearTimeout(calme); r(); }, t = setTimeout(fin, R.collecte);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') fin(); });
      pc.addEventListener('icecandidate', (e) => {
        if (!e.candidate || !e.candidate.candidate) return fin();
        const ty = e.candidate.type || (/ typ (\w+)/.exec(e.candidate.candidate) || [])[1];
        // Chrome traîne parfois à déclarer la collecte finie : dès qu'on a l'adresse publique (srflx, par STUN), ou une adresse locale en 'webrtc-local',
        // on laisse 0,5 s (0,1 s) aux candidats suivants (wifi + 4G) puis on envoie
        if (ty === 'srflx' || (local && ty === 'host')) { clearTimeout(calme); calme = setTimeout(fin, local ? 100 : 500); }
      });
    });
    function creerPc(l, n) {
      fermerPc(l);
      let pc, etat, evts;
      try {
        pc = new RTCPeerConnection({ iceServers: local ? [] : STUN });
        etat = pc.createDataChannel('etat', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
        evts = pc.createDataChannel('evts', { negotiated: true, id: 1, ordered: true });
      } catch (e) { if (pc) try { pc.close(); } catch (e2) { /* rien */ } l.echec = true; emettreJoueurs(); return null; } // pas de WebRTC : le relais
      l.pc = pc; l.ch = { etat, evts }; l.n = n; l.deconnecte = 0;
      const ouvert = sur(() => { if (l.pc === pc && !l.ouvert && etat.readyState === 'open' && evts.readyState === 'open') surOuvert(l); });
      const ferme = sur(() => { if (l.pc === pc) surFerme(l); });
      etat.onopen = evts.onopen = ouvert; etat.onclose = evts.onclose = ferme; etat.onerror = evts.onerror = () => { /* suivi par onclose */ };
      etat.onmessage = evts.onmessage = sur((ev) => { if (l.pc !== pc || s.ferme || typeof ev.data !== 'string') return; let m; try { m = JSON.parse(ev.data); } catch (e) { return; } st.recus++; st.p2pRec++; st.octets += ev.data.length; recevoir(l, m); });
      pc.onconnectionstatechange = sur(() => { if (l.pc !== pc) return; const c = pc.connectionState; if (c === 'failed' || c === 'closed') surFerme(l); else if (c === 'disconnected') l.deconnecte = l.deconnecte || Date.now(); else l.deconnecte = 0; });
      l.minuteur = setTimeout(sur(() => { if (l.pc === pc && !l.ouvert) { l.echec = true; emettreJoueurs(); planifierEssai(l); } }), R.attente); // pas ouvert à temps : relais (le lien reste prêt à passer en direct)
      return pc;
    }
    async function negocier(l) { // le client propose (offre), l'hôte répond
      if (s.ferme || s.estHote || liens.get(l.id) !== l) return;
      const n = l.n + 1, pc = creerPc(l, n); l.essai++;
      if (!pc) return;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        await collecte(pc);
        if (l.pc !== pc || s.ferme) return;
        envoyerSignal(l.id, n, pc.localDescription);
      } catch (e) { if (l.pc === pc) { fermerPc(l); l.echec = true; emettreJoueurs(); planifierEssai(l); } }
    }
    function planifierEssai(l) { // en relais, un client retente le direct de temps en temps (10 s, 20 s, 40 s, puis chaque minute)
      if (s.estHote || s.ferme) return;
      clearTimeout(l.essaiT);
      l.essaiT = setTimeout(sur(() => { if (liens.get(l.id) === l && !l.ouvert && !s.ferme && !s.estHote) negocier(l); }), R.essais[Math.min(Math.max(l.essai - 1, 0), R.essais.length - 1)]);
    }
    function envoyerSignal(a, n, d) { st.signaux++; transport.envoyer('signal', { de: s.moi.id, a, i: inst, n, v: VERSION, j: d.type === 'offer' ? moiPublic() : undefined, sdp: filtrer({ type: d.type, sdp: d.sdp }) }); }
    async function surSignal(p) {
      if (!p || p.a !== s.moi.id || !p.de || p.de === s.moi.id || p.v !== VERSION || s.ferme || !p.sdp) return;
      if (p.sdp.type === 'offer') {
        if (!s.estHote) return; // seul l'hôte accepte des liens
        const l = liens.get(p.de) || nouveauLien(p.de);
        verifierInstance(l, p.i); l.vu = Date.now(); l.parti = false;
        const j = p.j; if (j && typeof j.depuis === 'number' && j.v === VERSION) { l.j = { pseudo: String(j.pseudo || '').slice(0, 40), couleur: j.couleur, pret: !!j.pret, depuis: j.depuis, c: j.c, i: p.i }; recalculer(); }
        const pc = creerPc(l, p.n); if (!pc) return;
        try {
          await pc.setRemoteDescription(filtrer(p.sdp));
          await pc.setLocalDescription(await pc.createAnswer());
          await collecte(pc);
          if (l.pc !== pc || s.ferme) return;
          envoyerSignal(l.id, p.n, pc.localDescription);
        } catch (e) { if (l.pc === pc) { fermerPc(l); l.echec = true; emettreJoueurs(); } }
      } else if (p.sdp.type === 'answer') {
        const l = liens.get(p.de);
        if (!l || !l.pc || l.n !== p.n || l.pc.signalingState !== 'have-local-offer') return;
        verifierInstance(l, p.i);
        const pc = l.pc;
        try { await pc.setRemoteDescription(filtrer(p.sdp)); } catch (e) { if (l.pc === pc) { fermerPc(l); l.echec = true; emettreJoueurs(); planifierEssai(l); } }
      }
    }
    function surOuvert(l) {
      l.ouvert = true; l.echec = false; l.essai = 0; l.vu = Date.now(); clearTimeout(l.minuteur); clearTimeout(l.essaiT);
      l.relU.clear(); l.relC.clear(); l.relF = []; // ce qui attendait le relais : les fiables repartent par le direct, le reste est périmé
      renvoyer(l); l.pingT = 0; emettreJoueurs();
    }
    function surFerme(l) {
      const etait = l.ouvert; fermerPc(l);
      if (etait) { l.echec = true; renvoyer(l); } // le direct est tombé : on bascule tout de suite sur le relais
      emettreJoueurs();
      if (!s.ferme && liens.get(l.id) === l && !l.parti) planifierEssai(l);
    }

    // ── envoi et réception ──
    function envoyerSur(l, m, fiable) {
      if (l.ouvert && l.ch) {
        const c = fiable ? l.ch.evts : l.ch.etat;
        if (c.readyState === 'open') {
          if (!fiable && c.bufferedAmount > R.tampon) { st.jetes++; return false; } // le direct rame : l'état suivant remplacera celui-ci
          try { const t = JSON.stringify(m); c.send(t); st.envoyes++; st.p2pEnv++; st.octets += t.length; return true; } catch (e) { /* plein ou fermé : le relais prend la suite */ }
        }
      }
      if (m[0] === 0) l.relU.set(m[1], m); else if (m[0] === 1) l.relF.push(m); else l.relC.set(m[0], m); // relais : le dernier de chaque type, tous les fiables
      planifierRelais(); return true;
    }
    function renvoyer(l) { // les fiables non acquittés repartent (par le direct s'il est ouvert, sinon la file du relais est refaite, sans doublons)
      const t = Date.now(); for (const x of l.nonAcq) x.t = t;
      if (l.ouvert && l.ch) { for (const x of l.nonAcq) envoyerSur(l, x.m, true); } else { l.relF = l.nonAcq.map((x) => x.m); if (l.relF.length) planifierRelais(); }
    }
    const acquitter = (l, q) => { if (typeof q !== 'number') return; let k = 0; while (k < l.nonAcq.length && l.nonAcq[k].m[1] <= q) k++; if (k) l.nonAcq.splice(0, k); };
    const accepte = (l) => s.estHote || l.id === s.hote; // étoile : un client n'écoute que l'hôte
    function livrer(l, m) { l.recuQ = m[1]; if (accepte(l)) s._emettre(m[2], m[3], l.id); }
    function recevoir(l, m) {
      if (!Array.isArray(m)) return;
      l.vu = Date.now();
      const k = m[0];
      if (k === 0) { if (accepte(l) && typeof m[1] === 'string') s._emettre(m[1], m[2], l.id); }
      else if (k === 1) {
        const q = m[1]; if (typeof q !== 'number' || q <= l.recuQ) return; // déjà vu
        if (q > l.recuQ + 1) { if (l.attente.size < 5000) l.attente.set(q, m); return; } // en avance : on attend le trou
        livrer(l, m);
        while (l.attente.has(l.recuQ + 1)) { const m2 = l.attente.get(l.recuQ + 1); l.attente.delete(l.recuQ + 1); livrer(l, m2); }
      } else if (k === 2) {
        acquitter(l, m[2]);
        if (m[3] && !s.estHote && l.id === s.hote) { infosHote = m[3]; if (Array.isArray(m[4])) for (const i of m[4]) if (!partis.has(i)) partis.set(i, Date.now()); recalculer(); } // la liste de l'hôte : voies et pings des autres, départs
        envoyerSur(l, [3, m[1], l.recuQ], false);
      } else if (k === 3) { acquitter(l, m[2]); const rtt = Date.now() - m[1]; if (rtt >= 0 && rtt < 60000) { l.ping = Math.round(rtt); emettreJoueurs(); } }
      else if (k === 4) { l.parti = true; if (l.inst) partis.set(l.inst, Date.now()); if (s.estHote) for (const l2 of liens.values()) l2.pingT = 0; setTimeout(sur(recalculer), 0); }
    }
    function surRelais(p) {
      if (!p || !p.l || !p.de || p.de === s.moi.id || p.v !== VERSION || s.ferme) return;
      const msgs = p.l[s.moi.id]; if (!Array.isArray(msgs)) return;
      st.relaisRec++; st.recus++;
      if (!s.estHote && p.de !== s.hote) return;
      let l = liens.get(p.de);
      if (!l) { if (!s.estHote) return; l = nouveauLien(p.de); }
      verifierInstance(l, p.i);
      for (const m of msgs) recevoir(l, m);
    }
    function planifierRelais() { if (!relaisT && !s.ferme) relaisT = setTimeout(sur(viderRelais), Math.max(0, relaisDernier + R.relais - Date.now())); }
    function viderRelais(force) { // un seul envoi pour tous les destinataires, 5 par seconde au plus
      relaisT = null; if (s.ferme && !force) return;
      if (!transport.pret()) { if (!force) relaisT = setTimeout(sur(viderRelais), 500); return; } // le canal se reconnecte : ça attend
      const l2 = {}; let n = 0, reste = false;
      for (const l of liens.values()) {
        if (!l.relC.size && !l.relU.size && !l.relF.length) continue;
        l2[l.id] = Array.from(l.relC.values()).concat(Array.from(l.relU.values()), l.relF.splice(0, 100)); l.relC.clear(); l.relU.clear(); n++; // 100 fiables par envoi au plus
        if (l.relF.length) reste = true;
      }
      if (!n) return;
      if (reste) setTimeout(sur(planifierRelais), 0);
      relaisDernier = Date.now();
      const p = { de: s.moi.id, i: inst, v: VERSION, l: l2 };
      if (transport.envoyer('relais', p)) { st.relaisEnv++; st.envoyes++; try { st.octets += JSON.stringify(p).length; } catch (e) { /* rien */ } }
    }

    // ── l'horloge : pings (avec les acquittements), renvois, liens décrochés, joueurs partis ──
    const tic = setInterval(sur(() => {
      if (s.ferme) return;
      const t = Date.now();
      let infos = null;
      if (s.estHote) { majVoies(); infos = {}; for (const j of s.joueurs.values()) if (j.id !== s.moi.id) infos[j.id] = [j.ping, j.voie]; }
      const dits = Array.from(partis.keys());
      for (const l of liens.values()) {
        if (t - l.pingT >= (l.ouvert ? R.ping : R.pingRelais)) { l.pingT = t; envoyerSur(l, infos ? [2, t, l.recuQ, infos, dits] : [2, t, l.recuQ], false); }
        if (l.nonAcq.length && t - l.nonAcq[0].t > R.renvoi) renvoyer(l);
        if (l.pc && l.deconnecte && t - l.deconnecte > 6000) surFerme(l); // ICE « disconnected » depuis 6 s : on le tient pour mort
        else if (l.ouvert && l.ch && (l.ch.evts.readyState !== 'open' || l.ch.etat.readyState !== 'open')) surFerme(l); // fermé sans prévenir
      }
      recalculer();
    }), 1000);

    // ── l'API ──
    s.envoyer = (type, data, opt) => {
      if (s.ferme || typeof type !== 'string') return false;
      const fiable = !opt || opt.fiable !== false, a = opt && opt.a ? opt.a : null;
      let cibles;
      if (s.estHote) cibles = a ? [a] : Array.from(s.joueurs.keys()).filter((id) => id !== s.moi.id);
      else { if (!s.hote || s.hote === s.moi.id || (a && a !== s.hote)) return false; cibles = [s.hote]; } // étoile : un client ne parle qu'à l'hôte
      let ok = false;
      for (const id of cibles) {
        let l = liens.get(id);
        if (!l) { if (!s.joueurs.has(id) || id === s.moi.id) continue; l = nouveauLien(id); }
        if (fiable) { const m = [1, l.q++, type, data]; l.nonAcq.push({ m, t: Date.now() }); envoyerSur(l, m, true); ok = true; }
        else if (envoyerSur(l, [0, type, data], false)) ok = true;
      }
      return ok;
    };
    s.majMoi = (o2) => { if (s.ferme) return; Object.assign(s.moi, o2 || {}); transport.suivre(moiPublic()); recalculer(); };
    const surPagehide = () => s.quitter();
    s.quitter = () => {
      if (s.ferme) return;
      for (const l of liens.values()) if (!l.ouvert) l.relC.set(4, [4]); // l'au revoir : par le direct (fermerLien) ou par le relais
      try { viderRelais(true); } catch (e) { /* rien */ } // ce qui attendait le relais part quand même
      for (const l of Array.from(liens.values())) fermerLien(l);
      s.ferme = true; clearInterval(tic); clearTimeout(relaisT);
      try { transport.fermer(); } catch (e) { /* rien */ }
      try { removeEventListener('pagehide', surPagehide); } catch (e) { /* rien */ }
      s._emettre('ferme', {});
    };
    s._liens = () => Array.from(liens.values()).map((l) => ({ id: l.id, voie: voieDe(l), ping: l.ping, nonAcquittes: l.nonAcq.length, essais: l.essai, ice: l.pc ? l.pc.connectionState : null }));
    s._transport = transport;

    // ── l'entrée dans le salon ──
    let initiaux;
    try { initiaux = await transport.demarrer(); } catch (e) { s.ferme = true; clearInterval(tic); try { transport.fermer(); } catch (e2) { /* rien */ } throw e; }
    majPresence(initiaux);
    // la présence de Supabase peut mettre quelques secondes à tout montrer : celui qui rejoint attend d'y voir le créateur (8 s au plus), pour ne jamais se croire hôte par erreur
    if (!creer) await attendreQue(() => s.ferme || Array.from(presents.values()).some((j) => j.c), 8000);
    if (s.ferme) throw new Error('salon quitté');
    for (const j of presents.values()) if (j.depuis >= depuis) depuis = j.depuis + 1; // plus jeune que tous les présents, même si les horloges des téléphones diffèrent
    demarre = true;
    recalculer();
    transport.suivre(moiPublic());
    try { addEventListener('pagehide', surPagehide); } catch (e) { /* rien */ }
    emettreJoueurs();
    return s;
  }

  function salon(o) {
    o = o || {};
    if (!o.moi || !o.moi.id) return Promise.reject(new Error('il faut moi.id'));
    const force = param('reseau'), via = ['local', 'webrtc-local', 'supabase'].indexOf(force) >= 0 ? force : o.via || 'supabase';
    try {
      if (via === 'local') return salonLocal(o);
      return salonPair(o, via === 'webrtc-local' ? 'webrtc-local' : 'supabase');
    } catch (e) { return Promise.reject(e); }
  }
  return { salon, nouveauCode, codeValide, VERSION, LETTRES, REGLAGES: R };
})();
