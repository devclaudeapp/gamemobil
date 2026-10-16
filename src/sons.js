/* LE FOURNIL — les sons : de vrais bruitages (kits de Kenney, MIT : fournil/sons/*.mp3, mono, quelques Ko chacun) joués sur l'AudioContext
   du jeu, et deux sons fabriqués par ZzFX (l'alerte d'un coup de pouce, la sirène de la descente). Les fichiers se chargent après le premier
   geste (quand l'audio est débloqué) ; tant qu'un son n'est pas prêt, ou dans l'artefact (pas de fichiers à côté), ui.js garde ses bips. */
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
  const buffers = {}, cacheZz = {}; let ctx = null, demande = false;
  function brancher(actx) { // appelé par ui.js quand l'audio est créé ou repris
    ctx = actx || ctx;
    if (demande || !ctx || typeof fetch === 'undefined' || typeof window === 'undefined' || window.FOURNIL_ACCUEIL == null) return; // l'artefact n'a pas les fichiers
    demande = true;
    for (const n of FICHIERS) {
      fetch(`sons/${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status))))
        .then((b) => new Promise((ok, ko) => ctx.decodeAudioData(b, ok, ko))) // la forme à rappels : les vieux Safari n'ont pas la promesse
        .then((buf) => { buffers[n] = buf; }).catch(() => { /* ce son restera un bip */ });
    }
  }
  function lancer(buf, vol, vitesse, delai) {
    const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.playbackRate.value = vitesse || 1; g.gain.value = vol;
    s.connect(g); g.connect(ctx.destination); s.start(ctx.currentTime + (delai || 0)); return true;
  }
  const pret = () => !!ctx && ctx.state === 'running';
  function jouer(n, o = {}) { const b = buffers[n]; if (!b || !pret()) return false; return lancer(b, o.vol == null ? 0.5 : o.vol, o.vitesse, o.delai); }
  function zz(nom, o = {}) {
    if (!pret() || typeof ZZFX === 'undefined' || !ZZ[nom]) return false;
    let b = cacheZz[nom];
    if (!b) { const data = ZZFX.buildSamples(...ZZ[nom]); b = cacheZz[nom] = ctx.createBuffer(1, data.length, ZZFX.sampleRate); b.getChannelData(0).set(data); }
    return lancer(b, o.vol == null ? 0.25 : o.vol, o.vitesse, o.delai);
  }
  return { brancher, jouer, zz, FICHIERS, get prets() { return Object.keys(buffers); } };
})();
if (typeof module !== 'undefined') module.exports = SONS;
