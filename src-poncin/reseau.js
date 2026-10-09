/* OPÉRATION PONCIN — les salons entre copains : se retrouver par un code de 4 lettres, puis échanger les messages de la partie.
   Topologie en étoile autour de l'hôte (le créateur du salon) : les clients parlent à l'hôte, l'hôte parle à un client ou à tous.
   Trois voies (« via ») derrière la même API :
   - 'local'    : BroadcastChannel, entre onglets du même navigateur (tests Playwright, démonstrations) ;
   - 'supabase' : Supabase Realtime pour la présence et la signalisation, puis WebRTC (DataChannels) de téléphone à téléphone ;
                  repli par Supabase (relais borné) si le pair-à-pair échoue.
   API (voir src-poncin/ARCHITECTURE.md, « Le jeu en ligne ») :
     PRESEAU.salon({ via, code, moi: { id, pseudo, couleur }, config }) → Promise<salon>
     salon.code, salon.moi, salon.hote (id), salon.estHote, salon.joueurs (Map id → { id, pseudo, couleur, pret, ping, voie, depuis })
     salon.sur(type, fn(data, de)) → off      (types de l'application ; et 'joueurs', 'hote', 'ferme')
     salon.envoyer(type, data, { fiable = true, a = null })   (client → hôte seulement ; hôte → a, ou tous si a = null)
     salon.majMoi({ pret, pseudo, couleur }), salon.stats(), salon.quitter() */
const PRESEAU = (() => {
  'use strict';
  const LETTRES = 'BCDFGHJKLMNPQRSTVWXZ'; // des consonnes : pas de mot vexant ; 160 000 codes
  const nouveauCode = () => { let c = ''; for (let i = 0; i < 4; i++) c += LETTRES[Math.floor(Math.random() * LETTRES.length)]; return c; };
  const codeValide = (c) => typeof c === 'string' && /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(c);
  const VERSION = 1; // version du protocole : deux versions différentes ne jouent pas ensemble

  // ─── le socle commun : abonnés, liste des joueurs, élection de l'hôte (le plus ancien arrivé) ───
  function socle(code, moi) {
    const abonnes = new Map(), joueurs = new Map(), stats = { envoyes: 0, recus: 0, octets: 0, t0: Date.now() };
    const s = {
      code, moi: Object.assign({ pret: false }, moi), hote: null, estHote: false, joueurs, ferme: false,
      sur(type, fn) { if (!abonnes.has(type)) abonnes.set(type, new Set()); abonnes.get(type).add(fn); return () => abonnes.get(type).delete(fn); },
      _emettre(type, data, de) { const l = abonnes.get(type); if (l) for (const fn of Array.from(l)) { try { fn(data, de); } catch (e) { console.error('[Poncin réseau]', type, e); } } },
      _elire() { // l'hôte = le plus ancien arrivé (départage par id) ; prévient si ça change
        let h = null; for (const j of joueurs.values()) if (!h || j.depuis < h.depuis || (j.depuis === h.depuis && j.id < h.id)) h = j;
        const id = h ? h.id : null; if (id !== s.hote) { const avant = s.hote; s.hote = id; s.estHote = id === s.moi.id; if (avant !== null) s._emettre('hote', { hote: id, avant }); }
      },
      _stats: stats,
      stats() { const dt = Math.max(1, (Date.now() - stats.t0) / 1000); return { envoyesParS: stats.envoyes / dt, recusParS: stats.recus / dt, octetsParS: stats.octets / dt, voies: Array.from(joueurs.values()).map((j) => j.voie) }; },
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
      if (m.k === 'salut' || m.k === 'vie') { if (m.j.v !== VERSION) return; const nouveau = !s.joueurs.has(m.j.id); poser(m.j); if (m.k === 'salut') poster({ k: 'vie', de: s.moi.id, j: moiPublic() }); if (nouveau || m.k === 'salut') listeChangee(); else s._emettre('joueurs', Array.from(s.joueurs.values())); return; }
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
      const a = opt && opt.a ? opt.a : null;
      if (!s.estHote && a && a !== s.hote) return false;     // étoile : un client ne parle qu'à l'hôte
      poster({ k: 'msg', de: s.moi.id, a: s.estHote ? a : s.hote, type, data }); return true;
    };
    s.majMoi = (o2) => { Object.assign(s.moi, o2 || {}); poser(moiPublic()); poster({ k: 'vie', de: s.moi.id, j: moiPublic() }); s._emettre('joueurs', Array.from(s.joueurs.values())); };
    s.quitter = () => { if (s.ferme) return; poster({ k: 'adieu', de: s.moi.id }); s.ferme = true; clearInterval(battement); try { bc.close(); } catch (e) { /* rien */ } s._emettre('ferme', {}); };
    poster({ k: 'salut', de: s.moi.id, j: moiPublic() });
    await new Promise((r) => setTimeout(r, 400)); // le temps que les présents répondent : l'hôte est alors le bon
    listeChangee();
    return s;
  }

  // ─── voie 'supabase' : présence + signalisation Supabase Realtime, partie en WebRTC (à écrire : voir ARCHITECTURE.md) ───
  async function salonSupabase(o) { throw new Error('voie supabase pas encore écrite'); }

  function salon(o) {
    o = o || {};
    if (!o.moi || !o.moi.id) return Promise.reject(new Error('il faut moi.id'));
    if (o.via === 'local') return salonLocal(o);
    return salonSupabase(o);
  }
  return { salon, nouveauCode, codeValide, VERSION, LETTRES };
})();
