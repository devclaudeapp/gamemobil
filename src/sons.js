/* LE FOURNIL — les sons : de vrais bruitages (kits de Kenney, MIT : fournil/sons/*.mp3, mono, quelques Ko chacun) joués sur l'AudioContext
   du jeu, et deux sons fabriqués par ZzFX (l'alerte d'un coup de pouce, la sirène de la descente). Les fichiers se chargent après le premier
   geste (quand l'audio est débloqué) ; tant qu'un son n'est pas prêt, ou dans l'artefact (pas de fichiers à côté), ui.js garde ses bips.
   Les jeux de sons d'un événement (JEUX : la Maison hantée, fournil/sons/hantee/*.mp3, CC0, crédits dans LICENCES.txt) : SONS.jeu('hantee')
   à l'entrée de l'écran de l'événement, SONS.jeu(null) à sa sortie. Le jeu se charge à la première ouverture (pas avant) ; tant qu'il est
   actif, ses bruitages prennent la place de ceux de la boulangerie (remplace : la pièce devient la poignée de bonbons, la fanfare la cloche
   et le chat noir…), le jingle ouvre l'écran, la musique tourne en boucle (Web Audio, boucle au sample près : loopStart/loopEnd sautent le
   délai et le rembourrage du mp3), le chaudron bouillonne tout bas, un corbeau croasse de temps en temps, et chaque client qui entre fait
   sonner la porte (elle grince une fois sur trois ; la sorcière ricane, le fantôme gémit). Les réglages se lisent en direct (brancher(ctx,
   reglages)) : st.son coupe tout, st.musique (activée par défaut) coupe la musique ; ui.js appelle majMusique() quand l'un d'eux change. */
const SONS = (() => {
  const FICHIERS = ['clic', 'piece', 'pose', 'pose2', 'fanfare', 'carte', 'pop', 'refus'];
  // ZzFX : volume, aléa, fréquence, attaque, tenue, relâche, forme, courbe, glissé, glissé², saut, temps du saut, répétition, bruit, modulation…
  const ZZ = {
    alerte: [1, 0, 880, 0.01, 0.08, 0.1, 1, 1, 0, 0, 300, 0.06],
    sirene: [1, 0, 620, 0.05, 0.9, 0.25, 0, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0.9],
    // les cris des compagnons quand on les caresse (GAME.COMPAGNONS, champ cri) : de petits bruitages de synthèse, sans fichier
    wouf: [1, 0.05, 210, 0.01, 0.05, 0.12, 2, 1.6, -9, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.8, 0.04], // un aboiement grave, en dents de scie qui retombent
    woufgrave: [1, 0.05, 125, 0.01, 0.08, 0.18, 2, 1.8, -6, 0, 0, 0, 0, 0.6, 0, 0, 0, 0.8, 0.05], // le chien du quartier : le même aboiement, une octave plus bas et plus long (un « WOUF » de videur)
    cotcot: [1, 0.05, 560, 0.005, 0.03, 0.06, 2, 1, -24, 0, 0, 0, 0.13, 0.35], // deux gloussements secs
    coincoin: [1, 0.05, 340, 0.01, 0.07, 0.09, 3, 2, -3, 0, 0, 0, 0.17, 0.25, 28], // un cancan nasillard, deux fois
    couic: [1, 0.05, 1250, 0.005, 0.03, 0.05, 0, 1, 45], // un petit couinement qui monte
    couac: [1, 0.05, 280, 0.02, 0.09, 0.12, 2, 1.4, 6, 0, 0, 0, 0, 0.2, 12], // le pingouin klaxonne
  };
  // ─── les jeux de sons des événements ───
  const JEUX = {
    hantee: {
      dossier: 'sons/hantee/',
      fichiers: ['sonnette', 'grince', 'vente', 'cloche', 'sorciere', 'fantome', 'chaudron', 'louche', 'plancher', 'corbeau', 'chat', 'jingle', 'musique'],
      // un son de la boulangerie → celui du jeu, et ses couches : [nom, { vol, delai, vitesse, sur : une fois sur n }]
      remplace: { piece: [['vente', { vol: 0.42 }]], fanfare: [['cloche', { vol: 0.5 }], ['chat', { vol: 0.32, delai: 0.55, sur: 2 }]], pose: [['louche', { vol: 0.32 }]], pose2: [['plancher', { vol: 0.5 }], ['chat', { vol: 0.3, delai: 0.35, sur: 3 }]] },
      boucles: { musique: 38.4, chaudron: 4.853 }, // la durée exacte de chaque boucle (s), mesurée sur la source (le mp3 est un peu plus long)
      musique: { nom: 'musique', vol: 0.3 }, fond: { nom: 'chaudron', vol: 0.05 }, jingle: { nom: 'jingle', vol: 0.45 },
      voix: { sorciere: ['sorciere', 0.38], sorciere2: ['sorciere', 0.38], fantome: ['fantome', 0.3], fantome2: ['fantome', 0.3] }, // la sorte d'un client → son cri en entrant
      corbeau: { nom: 'corbeau', vol: 0.3, min: 28, max: 70 }, // de temps en temps, sur la devanture (s)
    },
  };
  const DELAI_MP3 = 1105 / 44100; // le délai d'un mp3 LAME (576 + 529 échantillons à 44,1 kHz), quand le décodeur ne l'a pas retiré
  const buffers = {}, cacheZz = {}, jeuxBuf = {}, jeuxDemandes = {}, derniers = []; // derniers : les vingt derniers sons joués (pour les tests)
  const trace = (n) => { derniers.push(n); if (derniers.length > 20) derniers.shift(); return true; };
  let ctx = null, demande = false, lire = () => null;
  let actif = null, musique = null, fond = null, minuterie = null, vus = new Set(), dernSonnette = -1e9, dernVoix = -1e9, prochainCorbeau = 0, jingleJoue = false, ouvertA = 0;
  const page = () => typeof window !== 'undefined' && window.FOURNIL_ACCUEIL != null && typeof fetch !== 'undefined'; // l'artefact n'a pas les fichiers
  const regl = () => { const s = lire() || {}; return { son: s.son !== false, musique: s.son !== false && s.musique !== false }; };
  function charger(url, ok) {
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
      .then((b) => new Promise((o, ko) => ctx.decodeAudioData(b, o, ko))) // la forme à rappels : les vieux Safari n'ont pas la promesse
      .then(ok).catch(() => { /* ce son restera un bip (ou le son de la boulangerie) */ });
  }
  function brancher(actx, reglages) { // appelé par ui.js quand l'audio est créé ou repris ; reglages : () => st (son, musique), lu en direct
    if (actx && actx !== ctx && actx.addEventListener) actx.addEventListener('statechange', () => { if (actif) majMusique(); }); // l'audio repris (ou suspendu) : la musique suit
    ctx = actx || ctx; if (typeof reglages === 'function') lire = reglages;
    if (!ctx || !page()) return;
    if (!demande) { demande = true; for (const n of FICHIERS) charger(`sons/${n}.mp3`, (buf) => { buffers[n] = buf; }); }
    if (actif) { chargerJeu(actif); majMusique(); } // l'écran de l'événement était déjà ouvert avant le premier geste
  }
  function chargerJeu(nom) {
    const J = JEUX[nom]; if (!J || jeuxDemandes[nom] || !ctx || !page()) return;
    jeuxDemandes[nom] = true; const b = jeuxBuf[nom] = jeuxBuf[nom] || {};
    for (const n of J.fichiers) charger(`${J.dossier}${n}.mp3`, (buf) => { b[n] = buf; if (actif === nom) quandPret(n); });
  }
  function lancer(buf, vol, vitesse, delai) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.playbackRate.value = vitesse || 1; g.gain.value = vol;
    s.connect(g); g.connect(ctx.destination); s.start(ctx.currentTime + (delai || 0)); return true;
  }
  const pret = () => !!ctx && ctx.state === 'running';
  function jouer(n, o = {}) {
    if (actif && JEUX[actif].remplace[n] && jouerRemplace(JEUX[actif].remplace[n], o)) return true; // le jeu de l'événement passe d'abord
    const b = buffers[n]; if (!b || !pret()) return false; trace(n); return lancer(b, o.vol == null ? 0.5 : o.vol, o.vitesse, o.delai);
  }
  function jouerRemplace(couches, o) {
    const b = jeuxBuf[actif]; if (!b || !pret() || !b[couches[0][0]]) return false;
    for (const [n, c] of couches) if (b[n] && (!c.sur || Math.random() * c.sur < 1) && trace(`${actif}/${n}`)) lancer(b[n], c.vol, n === couches[0][0] && o.vitesse ? Math.min(1.25, o.vitesse) : c.vitesse, (o.delai || 0) + (c.delai || 0));
    return true;
  }
  function zz(nom, o = {}) {
    if (!pret() || typeof ZZFX === 'undefined' || !ZZ[nom]) return false;
    let b = cacheZz[nom];
    if (!b) { const data = ZZFX.buildSamples(...ZZ[nom]); b = cacheZz[nom] = ctx.createBuffer(1, data.length, ZZFX.sampleRate); b.getChannelData(0).set(data); }
    return lancer(b, o.vol == null ? 0.25 : o.vol, o.vitesse, o.delai);
  }
  // un son du jeu actif, par son nom (ceux qui n'ont pas d'équivalent à la boulangerie : la porte, le corbeau, les cris…) ; « Sons » coupé : rien
  function jeuSon(n, o = {}) { if (!actif || !regl().son || !pret()) return false; const b = jeuxBuf[actif] && jeuxBuf[actif][n]; if (!b) return false; trace(`${actif}/${n}`); return lancer(b, o.vol == null ? 0.4 : o.vol, o.vitesse, o.delai); }

  // ─── les boucles : la musique et le bruit de fond ───
  function boucle(n, vol, fondu) { // une source en boucle au sample près, qui monte doucement → { s, g, n, deb, fin } ou null
    const J = JEUX[actif], b = jeuxBuf[actif] && jeuxBuf[actif][n]; if (!b || !pret()) return null;
    const vraie = Math.min(J.boucles[n] || b.duration, b.duration), deb = b.duration - vraie > 0.01 ? Math.min(DELAI_MP3, b.duration - vraie) : 0; // le décodeur a gardé le délai du mp3 : on le saute
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; s.loopStart = deb; s.loopEnd = deb + vraie;
    const t = ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (fondu || 1.2));
    s.connect(g); g.connect(ctx.destination); s.start(t, deb); return { s, g, n, deb, fin: deb + vraie };
  }
  function couper(x, fondu) { if (!x) return null; try { const t = ctx.currentTime, f = fondu || 0.4; x.g.gain.cancelScheduledValues(t); x.g.gain.setValueAtTime(Math.max(0.0001, x.g.gain.value), t); x.g.gain.exponentialRampToValueAtTime(0.0001, t + f); x.s.stop(t + f + 0.05); } catch (e) { /* déjà arrêtée */ } return null; }
  const visible = () => typeof document === 'undefined' || !document.hidden;
  function majMusique() { // à chaque changement : l'écran de l'événement, les réglages, la page cachée ou revenue, un fichier qui arrive
    const J = actif && JEUX[actif], r = regl(), on = !!J && visible() && pret();
    if (on && r.musique && J.musique) { if (!musique) musique = boucle(J.musique.nom, J.musique.vol, jingleJoue ? 2.5 : 1.2); } else musique = couper(musique);
    if (on && r.son && J.fond) { if (!fond) fond = boucle(J.fond.nom, J.fond.vol, 3); } else fond = couper(fond);
  }
  function quandPret(n) { // un fichier du jeu actif vient d'arriver
    const J = JEUX[actif];
    if (J.jingle && n === J.jingle.nom && !jingleJoue && performance.now() - ouvertA < 4000) jingleJoue = jeuSon(n, { vol: J.jingle.vol }); // la première ouverture : le jingle s'il arrive à temps
    if ((J.musique && n === J.musique.nom) || (J.fond && n === J.fond.nom)) majMusique();
  }
  function jeu(nom) { // l'écran d'un événement s'ouvre (nom) ou se ferme (null)
    nom = nom && JEUX[nom] ? nom : null; if (nom === actif) return;
    musique = couper(musique); fond = couper(fond); if (minuterie) { clearInterval(minuterie); minuterie = null; }
    actif = nom; vus = new Set(); jingleJoue = false; if (!nom) return;
    ouvertA = performance.now(); prochainCorbeau = ouvertA + 9000 + Math.random() * 12000;
    chargerJeu(nom);
    const J = JEUX[nom];
    if (J.jingle) jingleJoue = jeuSon(J.jingle.nom, { vol: J.jingle.vol }); // déjà chargé (une ouverture de plus) : tout de suite
    majMusique();
    minuterie = setInterval(veiller, 400);
  }
  // un client entre : la porte sonne (et grince une fois sur trois), puis son cri s'il en a un (la sorcière, le fantôme)
  function entre(sorte) {
    const J = actif && JEUX[actif]; if (!J || !regl().son) return false; const t = performance.now();
    if (t - dernSonnette < 1500) return false; dernSonnette = t;
    const ok = jeuSon('sonnette', { vol: 0.3 }); if (Math.random() < 1 / 3) jeuSon('grince', { vol: 0.55, delai: 0.12 });
    const v = J.voix[sorte]; if (v && t - dernVoix > 7000) { dernVoix = t; jeuSon(v[0], { vol: v[1], delai: 0.6 }); }
    return ok;
  }
  // toutes les 400 ms, l'écran ouvert : les clients qui viennent d'entrer (BOUTIQUE_HANTEE.acteurs() si la scène la donne, sinon la vie de la
  // boutique hantée, VIE.clients), et le corbeau de la devanture
  function veiller() {
    if (!actif || !visible()) return;
    const l = typeof BOUTIQUE_HANTEE !== 'undefined' && typeof BOUTIQUE_HANTEE.acteurs === 'function' ? BOUTIQUE_HANTEE.acteurs().filter((a) => a.role === 'client').map((a) => ({ id: a.id, etat: a.etat, sorte: a.sorte }))
      : typeof VIE !== 'undefined' && VIE.mode ? VIE.clients.map((c) => ({ id: c.id, etat: c.etat, sorte: c.deg })) : [];
    const premier = vus.size === 0;
    for (const c of l) if (c.etat === 'entre' && !vus.has(c.id)) { vus.add(c.id); if (!premier) entre(c.sorte); } // (ceux qui entraient déjà à l'ouverture : sans bruit)
    if (premier && !vus.size) vus.add(-1);
    if (vus.size > 400) vus = new Set([-1, ...l.map((c) => c.id)]);
    const J = JEUX[actif], t = performance.now();
    if (J.corbeau && t > prochainCorbeau) { prochainCorbeau = t + (J.corbeau.min + Math.random() * (J.corbeau.max - J.corbeau.min)) * 1000; jeuSon(J.corbeau.nom, { vol: J.corbeau.vol, vitesse: 0.92 + Math.random() * 0.16 }); }
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (actif) majMusique(); }); // la page cachée : la musique s'arrête

  return { brancher, jouer, zz, jeu, jeuSon, entre, majMusique, FICHIERS, JEUX,
    get prets() { return Object.keys(buffers); },
    get jeuActif() { return actif; },
    get derniers() { return derniers.slice(); },
    pretsJeu: (nom) => Object.keys(jeuxBuf[nom] || {}),
    // pour les tests : la musique et le bruit de fond en cours, et leur boucle (s)
    get musique() { return musique ? { n: musique.n, debut: musique.deb, fin: musique.fin, duree: musique.s.buffer.duration } : null; },
    get fond() { return fond ? { n: fond.n, debut: fond.deb, fin: fond.fin } : null; } };
})();
if (typeof module !== 'undefined') module.exports = SONS;
