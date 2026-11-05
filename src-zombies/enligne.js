/* DERNIER REMPART — la coop en ligne, de 2 à 4 survivants, chacun chez soi.
   Les salons sont ceux d'Opération Poncin (src-poncin/reseau.js, PRESEAU) : un code de 4 lettres, présence et signalisation par
   Supabase Realtime, puis WebRTC de téléphone à téléphone (relais par Supabase si le direct ne s'ouvre pas) ; canaux préfixés « rempart »
   (jamais mêlés à ceux de Poncin). ?reseau=local (BroadcastChannel, entre onglets) sert aux tests.
   L'hôte fait autorité : il simule la partie avec ZJEU (tous les survivants), applique la dernière entrée reçue de chacun, exécute leurs
   actions (construire, améliorer, grenade, arme, atout, lancer la vague) et diffuse :
     « etat »  15 fois par seconde, non fiable : un instantané compact (survivants, zombies, défenses, objets, projectiles, vague) ;
     « evts »  ≤ 10 paquets par seconde, fiable : les événements du jeu (tirs, touches, morts, explosions…), pour les sons et les effets.
   Le client montre une copie de la partie (ZJEU.creer, même graine, mêmes joueurs : même arène, même monde, jamais simulée) dont les
   objets sont écrits par les instantanés ; zombies et copains glissent vers leur dernière position connue ; son propre survivant est
   prédit sur place (la même vitesse, les mêmes murs) et il envoie sa position avec son entrée (« entree », 20 fois par seconde) :
   l'hôte l'adopte si elle est plausible (ZJEU). Les bonus du Bunker de chacun voyagent dans sa présence (eq, 6 chiffres).
   À plusieurs, un niveau passé ne met pas la partie en pause : chacun choisit son atout de son côté. Un survivant à terre se relève
   si un copain reste près de lui ; la partie s'arrête quand tout le monde est à terre. L'hôte parti : la partie s'arrête.
   API : ZENLIGNE.ouvrir({ code, creer, pseudo, bonus, via, config }) → Promise<salon>
     salon.code, salon.idMoi, salon.estHote, salon.joueurs() → [{ id, pseudo, hote, moi, voie }], salon.lancer(arene) (l'hôte),
     salon.quitter(), salon.sur('maj' | 'debut' | 'ferme', fn) ; salon.partie : { jeu, idMoi, estHote, etape(dt, entree) → evs, action(quoi, arg) }. */
const ZENLIGNE = (() => {
  'use strict';
  const PREFIXE = 'rempart', ETAT_MS = 66, EVTS_MS = 100, ENTREE_MS = 50, PAS = 1 / 60, MAX_JOUEURS = 4, MAX_EVTS = 90;
  const D = typeof ZDONNEES !== 'undefined' ? ZDONNEES : null, J = typeof ZJEU !== 'undefined' ? ZJEU : null;
  const TZ = D ? Object.keys(D.ZOMBIES) : [], TD = D ? Object.keys(D.DEFENSES) : [], TO = ['ferraille', 'soin', 'caisse', 'bonus'];
  const CLES_BONUS = ['vie', 'ferraille', 'degats', 'xp', 'grenade', 'arme'];
  // le skin, dans la présence (« am », 8 caractères au plus) : son rang dans ZDONNEES.SURVIVANTS
  const SKINS = D ? Object.keys(D.SURVIVANTS) : [];
  const codeSkin = (id) => String(Math.max(0, SKINS.indexOf(id)));
  const lireSkin = (c) => SKINS[+c] || 'gardien';
  const COULEURS = ['#E3B663', '#7FB3E0', '#9BD86A', '#E58FB8'];
  const r2 = (v) => Math.round(v * 100) / 100, r1 = (v) => Math.round(v * 10) / 10;
  const codeBonus = (b) => CLES_BONUS.map((k) => Math.max(0, Math.min(9, (b && b[k]) | 0))).join('');
  const lireBonus = (s) => { const o = {}; CLES_BONUS.forEach((k, i) => { o[k] = Math.max(0, Math.min(9, +String(s || '')[i] || 0)); }); return o; };
  const aleaId = () => 'j' + Math.random().toString(36).slice(2, 10);

  // ─── l'instantané de l'hôte ───
  const effetsCourts = (E) => { const o = {}; for (const k in E || {}) o[k] = Math.round(E[k] * 10) / 10; return o; };
  function instantane(jeu) {
    return {
      t: r2(jeu.t), g: jeu.gagnant || '', ph: jeu.phase, c: r1(jeu.chrono), v: jeu.vague, as: jeu.aSortir, tv: jeu.totalVague, f: jeu.fini ? 1 : 0,
      s: [jeu.serie.n, r2(jeu.serie.t), jeu.serie.mult], st: [jeu.stats.tues, jeu.stats.ferraille, jeu.stats.construits],
      j: jeu.joueurs.map((p) => [p.id, r2(p.x), r2(p.z), r2(p.angle), Math.ceil(p.vie), p.vieMax, p.vivant ? 1 : 0, p.ferraille, p.score, p.tues, p.niveau, r1(p.xp), p.main,
        p.armes.map((a) => (a ? [a.id, a.mun === Infinity ? -1 : a.mun] : null)), r1(p.grenadeT), p.visee, r2(p.bouge), r2(p.invul), r1(p.releve), p.boss,
        p.choix ? [p.choix.niveau, p.choix.options] : null, p.atouts, p.niveaux, p.parti ? 1 : 0, p.tire ? p.tire.de : 0, p.emote ? p.emote.id : '', effetsCourts(p.effets)]),
      z: jeu.zombies.map((z) => [z.id, TZ.indexOf(z.type), r2(z.x), r2(z.z), r2(z.angle), Math.ceil(z.vie), z.vieMax, z.flash > 0 ? 1 : 0, r2(z.attaque), z.bouge, r2(z.naissance), r2(z.vitesse), z.feu > 0 ? 1 : 0, z.gel > 0 ? 1 : 0, z.saut > 0 ? r2(z.saut) : 0]),
      d: jeu.defenses.map((d) => [d.id, TD.indexOf(d.type), r2(d.x), r2(d.z), r2(d.angle), Math.ceil(d.vie), d.vieMax, d.flash > 0 ? 1 : 0]),
      o: jeu.objets.map((o) => [o.id, TO.indexOf(o.type), r2(o.x), r2(o.z), o.valeur, o.vole ? 1 : 0, r1(o.age), o.bonus || (o.rare ? '*' : '')]),
      // le Lot 4 : le ralenti, les leurres, le largage en cours, l'état des pièges (leur place se déduit de la graine, la même des deux côtés)
      ra: r1(jeu.ralenti || 0), le: (jeu.leurres || []).map((l) => [l.id, r2(l.x), r2(l.z), r1(l.t)]), la: jeu.largage && jeu.largage.pose ? [r2(jeu.largage.x), r2(jeu.largage.z), r2(jeu.largage.t)] : null,
      pi: (jeu.pieges || []).map((p) => [p.etat === 'actif' ? 1 : p.etat === 'recharge' ? 2 : 0, r1(p.t)]),
      cr: jeu.crachats.map((c) => [r2(c.x), r2(c.z), r2(c.vx), r2(c.vz)]),
      ob: jeu.obus.map((o) => [r2(o.x0), r2(o.z0), r2(o.x1), r2(o.z1), r2(o.t), r2(o.duree), o.grenade ? 1 : 0, o.droit ? 1 : 0]),
      ch: jeu.crochets.map((c) => [c.id, c.de, r2(c.x), r2(c.z), r2(c.vx), r2(c.vz)]),
      di: jeu.disques.map((d) => [d.id, r2(d.x), r2(d.z), r2(d.vx), r2(d.vz)]),
      zo: jeu.zones.map((z) => [z.id, r2(z.x), r2(z.z), r2(z.r), r1(z.vie), r1(z.duree)]),
    };
  }
  // ─── la copie du client, écrite par un instantané (les objets gardent leur identité : le rendu les suit par id) ───
  function appliquer(jeu, e, idMoi) {
    if (Math.abs(jeu.t - e.t) > 0.3) jeu.t = e.t;
    jeu.phase = e.ph; jeu.gagnant = e.g || ''; jeu.chrono = e.c; jeu.vague = e.v; jeu.aSortir = e.as; jeu.totalVague = e.tv; jeu.fini = !!e.f;
    jeu.serie.n = e.s[0]; jeu.serie.t = e.s[1]; jeu.serie.mult = e.s[2];
    jeu.stats.tues = e.st[0]; jeu.stats.ferraille = e.st[1]; jeu.stats.construits = e.st[2];
    for (const a of e.j) {
      const p = jeu.joueurs.find((k) => k.id === a[0]); if (!p) continue;
      p.cx = a[1]; p.cz = a[2];
      p.angle = a[3]; // la visée vient de l'hôte (le tir est automatique)
      if (p.id === idMoi && Math.hypot(p.x - a[1], p.z - a[2]) > 2.2) { p.x = a[1]; p.z = a[2]; } // trop loin : recalé
      p.vie = a[4]; p.vieMax = a[5]; p.vivant = !!a[6]; p.ferraille = a[7]; p.score = a[8]; p.tues = a[9]; p.niveau = a[10]; p.xp = a[11]; p.main = a[12];
      p.armes = a[13].map((x) => (x ? { id: x[0], mun: x[1] < 0 ? Infinity : x[1] } : null)); p.grenadeT = a[14]; p.visee = a[15]; if (p.id !== idMoi) p.bouge = a[16];
      p.invul = a[17]; p.releve = a[18]; p.boss = a[19]; p.choix = a[20] ? { id: p.id, niveau: a[20][0], options: a[20][1] } : null; p.atouts = a[21] || {}; p.niveaux = a[22] || {}; p.parti = !!a[23]; p.tire = a[24] ? { de: a[24], t: 0.5 } : null; p.emote = a[25] ? { id: a[25], t: (p.emote && p.emote.id === a[25] ? p.emote.t : 2.4) } : null; p.effets = a[26] || {};
      if (p.id === idMoi && !p.vivant) { p.x = a[1]; p.z = a[2]; }
    }
    const garder = (liste, lignes, faire, maj) => {
      const parId = new Map(liste.map((x) => [x.id, x])); liste.length = 0;
      for (const l of lignes) { let x = parId.get(l[0]); if (!x) x = faire(l); maj(x, l); liste.push(x); }
    };
    garder(jeu.zombies, e.z, (l) => ({ id: l[0], x: l[2], z: l[3], rx: 0, rz: 0 }), (z, l) => {
      z.type = TZ[l[1]]; z.tx = l[2]; z.tz = l[3]; z.angle = l[4]; z.vie = l[5]; z.vieMax = l[6]; z.flash = l[7] ? 0.1 : 0; z.attaque = l[8]; z.bouge = l[9]; z.naissance = l[10]; z.vitesse = l[11]; z.rayon = D.ZOMBIES[z.type].rayon; z.feu = l[12] ? 1 : 0; z.gel = l[13] ? 1 : 0; z.saut = l[14] || 0;
    });
    garder(jeu.defenses, e.d, (l) => ({ id: l[0] }), (d, l) => { d.type = TD[l[1]]; d.x = l[2]; d.z = l[3]; d.angle = l[4]; d.vie = l[5]; d.vieMax = l[6]; d.flash = l[7] ? 0.1 : 0; });
    garder(jeu.objets, e.o, (l) => ({ id: l[0], x: l[2], z: l[3] }), (o, l) => { o.type = TO[l[1]]; o.tx = l[2]; o.tz = l[3]; o.valeur = l[4]; o.vole = !!l[5]; o.age = l[6]; o.bonus = l[7] && l[7] !== '*' ? l[7] : undefined; o.rare = l[7] === '*'; if (!o.vole) { o.x = l[2]; o.z = l[3]; } });
    jeu.ralenti = e.ra || 0; jeu.leurres = (e.le || []).map((l) => ({ id: l[0], type: 'leurre', x: l[1], z: l[2], t: l[3] }));
    jeu.largage = e.la ? { pose: true, x: e.la[0], z: e.la[1], t: e.la[2] } : null;
    if (e.pi && jeu.pieges) e.pi.forEach((q, i) => { const p = jeu.pieges[i]; if (p) { p.etat = q[0] === 1 ? 'actif' : q[0] === 2 ? 'recharge' : 'pret'; p.t = q[1]; } });
    jeu.crachats.length = 0; for (const c of e.cr) jeu.crachats.push({ x: c[0], z: c[1], vx: c[2], vz: c[3] });
    jeu.obus.length = 0; for (const o of e.ob) jeu.obus.push({ x0: o[0], z0: o[1], x1: o[2], z1: o[3], t: o[4], duree: o[5], grenade: !!o[6], droit: !!o[7] });
    garder(jeu.crochets, e.ch || [], (l) => ({ id: l[0] }), (c, l) => { c.de = l[1]; c.x = l[2]; c.z = l[3]; c.vx = l[4]; c.vz = l[5]; });
    garder(jeu.disques, e.di || [], (l) => ({ id: l[0], x: l[1], z: l[2] }), (d, l) => { d.x = l[1]; d.z = l[2]; d.vx = l[3]; d.vz = l[4]; });
    garder(jeu.zones, e.zo || [], (l) => ({ id: l[0] }), (z, l) => { z.x = l[1]; z.z = l[2]; z.r = l[3]; z.vie = l[4]; z.duree = l[5]; });
  }
  // entre deux instantanés : zombies, copains et ferraille glissent vers leur dernière position ; les projectiles avancent
  function lisser(jeu, dt, idMoi) {
    const k = 1 - Math.exp(-14 * dt);
    for (const z of jeu.zombies) if (z.tx != null) { z.x += (z.tx - z.x) * k; z.z += (z.tz - z.z) * k; }
    for (const p of jeu.joueurs) if (p.id !== idMoi && p.cx != null) { const dx = p.cx - p.x, dz = p.cz - p.z; p.x += dx * k; p.z += dz * k; p.vx = dx * 6; p.vz = dz * 6; }
    for (const o of jeu.objets) if (o.vole && o.tx != null) { o.x += (o.tx - o.x) * k; o.z += (o.tz - o.z) * k; }
    for (const c of jeu.crachats) { c.x += c.vx * dt; c.z += c.vz * dt; }
    for (const o of jeu.obus) o.t = Math.min(o.duree, o.t + dt);
    for (const d of jeu.disques) { d.x += d.vx * dt; d.z += d.vz * dt; }
    for (const c of jeu.crochets) { c.x += c.vx * dt; c.z += c.vz * dt; }
    jeu.t += dt;
  }

  async function ouvrir(o) {
    if (typeof PRESEAU === 'undefined') throw new Error('Le module des salons n’est pas chargé.');
    o = o || {};
    const idMoi = aleaId(), pseudo = String(o.pseudo || 'Survivant').slice(0, 16);
    const s = await PRESEAU.salon({ via: o.via, code: o.code, creer: !!o.creer, moi: { id: idMoi, pseudo, couleur: '#E3B663', eq: codeBonus(o.bonus), am: codeSkin(o.skin) }, config: o.config, prefixe: PREFIXE });
    const abonnes = new Map(), emettre = (t, d) => { const l = abonnes.get(t); if (l) for (const f of Array.from(l)) { try { f(d); } catch (e) { console.warn('[Rempart en ligne]', e); } } };
    const Z = {
      code: s.code, idMoi, partie: null,
      get estHote() { return s.estHote; },
      joueurs() { return Array.from(s.joueurs.values()).sort((a, b) => (a.id === s.hote ? -1 : b.id === s.hote ? 1 : (a.depuis || 0) - (b.depuis || 0))).map((j) => ({ id: j.id, pseudo: j.pseudo || 'Survivant', hote: j.id === s.hote, moi: j.id === idMoi, voie: j.voie || '', eq: j.eq, am: j.am })); },
      sur(t, f) { if (!abonnes.has(t)) abonnes.set(t, new Set()); abonnes.get(t).add(f); return () => abonnes.get(t).delete(f); },
      quitter() { try { s.quitter(); } catch (e) { /* rien */ } Z.partie = null; },
      stats: () => s.stats(),
      lancer(arene, mode) {
        if (!s.estHote) return 'pas-hote';
        const liste = Z.joueurs().slice(0, MAX_JOUEURS);
        if (liste.length < 1) return 'personne';
        if (mode === 'duel' && liste.length !== 2) return 'duel-deux';
        const debut = { mode: mode === 'cps' || mode === 'duel' ? mode : '', graine: (Math.random() * 1e9) >>> 0, arene: D.ARENES[arene] ? arene : 'jardin', joueurs: liste.map((j) => ({ id: j.id, pseudo: j.pseudo, bonus: lireBonus(j.eq), skin: lireSkin(j.am) })) };
        s.envoyer('debut', debut, { fiable: true });
        demarrer(debut);
        return true;
      },
    };
    s.sur('joueurs', () => emettre('maj', Z.joueurs()));
    s.sur('ferme', () => { Z.partie = null; emettre('ferme', { raison: 'ferme' }); });
    s.sur('hote', () => { if (Z.partie && !Z.partie.estHote) emettre('ferme', { raison: 'hote' }); else emettre('maj', Z.joueurs()); });
    s.sur('debut', (d) => { if (!s.estHote) demarrer(d); });

    function demarrer(d) {
      const joueurs = d.joueurs.map((j, i) => ({ id: j.id, pseudo: j.pseudo, bonus: j.bonus, skin: j.skin, couleur: COULEURS[i % COULEURS.length] }));
      const jeu = J.creer({ arene: d.arene, graine: d.graine, joueurs, mode: d.mode || '' });
      jeu.joueurs.forEach((p, i) => { p.couleur = COULEURS[i % COULEURS.length]; });
      Z.partie = s.estHote ? partieHote(jeu) : partieClient(jeu);
      emettre('debut', Z.partie);
    }

    // ─── l'hôte : la vraie partie ───
    function partieHote(jeu) {
      const entrees = {}, attente = [], P = { jeu, idMoi, estHote: true, arene: jeu.arene };
      let acc = 0, tEtat = 0, tEvts = 0;
      const offs = [
        s.sur('entree', (d, de) => { if (d && jeu.joueurs.some((p) => p.id === de)) entrees[de] = { mx: +d.mx || 0, mz: +d.mz || 0, x: +d.x, z: +d.z }; }),
        s.sur('action', (d, de) => { if (d) agir(de, d.quoi, d.arg); }),
        s.sur('joueurs', (l) => { // un copain parti : il tombe et ne se relève plus
          const ids = new Set((l || []).map((j) => j.id));
          for (const p of jeu.joueurs) if (!ids.has(p.id) && p.id !== idMoi && !p.parti) { p.parti = true; p.vivant = false; p.choix = null; }
        }),
      ];
      function agir(de, quoi, arg) {
        switch (quoi) {
          case 'construire': return J.construire(jeu, de, arg);
          case 'ameliorer': return J.ameliorer(jeu, de, arg);
          case 'grenade': return J.grenade(jeu, de);
          case 'arme': return J.changerArme(jeu, de, +arg);
          case 'atout': return J.choisirAtout(jeu, de, arg);
          case 'passer': return J.passer(jeu);
          case 'emote': return J.emote(jeu, de, arg);
        }
        return null;
      }
      P.action = (quoi, arg) => agir(idMoi, quoi, arg);
      P.etape = (dt, entree) => {
        entrees[idMoi] = entree ? { mx: entree.mx, mz: entree.mz } : null;
        const evs = []; acc += dt; let n = 0;
        while (acc >= PAS && n < 5) { const e = J.pas(jeu, entrees, PAS); for (let i = 0; i < e.length; i++) { evs.push(e[i]); attente.push(e[i]); } acc -= PAS; n++; }
        if (n === 5) acc = 0;
        const t = performance.now();
        if (t - tEtat >= ETAT_MS) { tEtat = t; s.envoyer('etat', instantane(jeu), { fiable: false }); }
        if (attente.length && t - tEvts >= EVTS_MS) {
          tEvts = t;
          // les tirs et les touches sont nombreux : au plus MAX_EVTS par paquet, les autres événements passent toujours
          let l = attente.splice(0); if (l.length > MAX_EVTS) { const imp = l.filter((e) => e.t !== 'tir' && e.t !== 'touche'), reste = l.filter((e) => e.t === 'tir' || e.t === 'touche'); l = imp.concat(reste.slice(-Math.max(10, MAX_EVTS - imp.length))); }
          s.envoyer('evts', l, { fiable: true });
        }
        if (jeu.fini) s.envoyer('etat', instantane(jeu), { fiable: true });
        return evs;
      };
      P.fermer = () => { for (const f of offs) f(); };
      return P;
    }
    // ─── le client : la copie, écrite par l'hôte ───
    function partieClient(jeu) {
      const P = { jeu, idMoi, estHote: false, arene: jeu.arene }, recus = [];
      let dernier = null, tEntree = 0;
      const offs = [
        s.sur('etat', (e) => { if (e && (!dernier || e.t >= dernier.t - 0.5)) { dernier = e; appliquer(jeu, e, idMoi); } }),
        s.sur('evts', (l) => { if (Array.isArray(l)) for (const e of l) recus.push(e); }),
      ];
      P.action = (quoi, arg) => { s.envoyer('action', { quoi, arg }, { fiable: true }); return { ok: true, distant: true }; };
      P.etape = (dt, entree) => {
        const moi = jeu.joueurs.find((p) => p.id === idMoi);
        // la prédiction : son propre survivant bouge tout de suite (même vitesse que chez l'hôte, mêmes murs, mêmes défenses)
        if (moi && moi.vivant && entree) {
          let mx = +entree.mx || 0, mz = +entree.mz || 0; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
          const v = D.JOUEUR.vitesse * (1 + (moi.atouts.vitesse || 0) * D.ATOUTS.vitesse.par);
          moi.vx = mx * v; moi.vz = mz * v; moi.x += moi.vx * dt; moi.z += moi.vz * dt; moi.bouge = l > 0.05 ? Math.min(1, l) : 0;
          for (const d of jeu.defenses) { if (d.type === 'mine') continue; const R = D.DEFENSES[d.type].rayon + moi.rayon, ex = moi.x - d.x, ez = moi.z - d.z, dd = Math.hypot(ex, ez); if (dd < R && dd > 1e-6) { moi.x = d.x + ex / dd * R; moi.z = d.z + ez / dd * R; } }
          jeu.monde.pousser(moi);
          // recalage doux vers l'hôte s'il voit autre chose (un zombie qui pousse, une barricade)
          if (moi.cx != null) { const ex = moi.cx - moi.x, ez = moi.cz - moi.z, d2 = Math.hypot(ex, ez); if (d2 > 0.6) { moi.x += ex * 0.04; moi.z += ez * 0.04; } }
        } else if (moi) { moi.vx = moi.vz = 0; moi.bouge = 0; }
        const t = performance.now();
        if (t - tEntree >= ENTREE_MS && moi) { tEntree = t; s.envoyer('entree', { mx: entree ? r2(entree.mx) : 0, mz: entree ? r2(entree.mz) : 0, x: r2(moi.x), z: r2(moi.z) }, { fiable: false }); }
        lisser(jeu, dt, idMoi);
        const evs = recus.splice(0);
        return evs;
      };
      P.fermer = () => { for (const f of offs) f(); };
      return P;
    }
    return Z;
  }
  return { ouvrir, instantane, appliquer, codeBonus, lireBonus, MAX_JOUEURS, PREFIXE };
})();
