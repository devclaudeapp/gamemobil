// La petite planète de « Ma chaîne » seule, sur une page d'essai minimale : ni le jeu, ni l'écran « Ma chaîne » (src/chaine-ecran.js) ;
// seulement Three.js, la HD (vendor/fournil-hd.min.js, src/hd.js : le kit de la planète), GAME (src/game.js : les quartiers, les standings),
// CHAINE s'il est là (src/chaine.js : la forme vraie des fiches, CHAINE.liste), VIE (src/vie.js : les couleurs des décors) et PLANETE
// (src/planete.js). Servie par le test (test/fournil-planete.cjs) et l'outil de captures (outils/planete/capture.cjs) à l'adresse
// /fournil/planete-essai.html : la HD se lit alors dans fournil/hd/, comme dans le jeu.
//   ?cadre=plein   la planète en plein écran (390 × 844 : la vue d'ensemble, les régions de près) ;
//   ?cadre=ecran   le cadre de l'écran « Ma chaîne » : la planète en haut (clamp(250px, 44vh, 430px) + 60 px), le titre qui flotte dessus,
//                  la liste dessous (des lignes factices) — la place qu'elle aura dans le jeu ;
//   ?hd=0          sans la HD (src/hd.js la coupe) ; ?qualite=haute|moyenne|eco.
// window.ESSAI : fiches(N, o) (la forme de CHAINE.liste), ouvrir(N, o), fermer(), journal (onToucher, onEntrer).
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');

function page(racine) {
  const avecChaine = fs.existsSync(path.join(racine, 'src', 'chaine.js')) && fs.statSync(path.join(racine, 'src', 'chaine.js')).size > 400; // (le fichier vide d'attente des règles ne compte pas)
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>La petite planète — essai</title>
<link rel="stylesheet" href="../src/style.css">
<style>
#essai { position: fixed; inset: 0; display: flex; flex-direction: column; overflow: hidden;
  background: radial-gradient(1.5px 1.5px at 12% 18%, #fff 60%, transparent), radial-gradient(2px 2px at 82% 12%, #fff 60%, transparent), radial-gradient(1.5px 1.5px at 70% 26%, rgba(255,255,255,.9) 60%, transparent),
    radial-gradient(2.5px 2.5px at 40% 9%, rgba(255,255,255,.95) 60%, transparent), radial-gradient(2px 2px at 93% 40%, rgba(255,255,255,.9) 60%, transparent),
    radial-gradient(120% 52% at 50% 30%, #FFFDF8 0%, #F4EFFF 36%, #E2EBFF 64%, #FFE8D8 100%); }
#essai .haut { position: absolute; left: 0; right: 0; top: 0; z-index: 4; pointer-events: none; }
#essai .haut::before { content: ''; position: absolute; left: 0; right: 0; top: 0; bottom: -28px; z-index: -1; background: linear-gradient(to bottom, rgba(244, 241, 255, .92) 0%, rgba(244, 241, 255, .7) 58%, rgba(244, 241, 255, 0) 100%); }
#essai:has(.pl-nuit) .haut::before, #essai:has(.pl-crepuscule) .haut::before { background: linear-gradient(to bottom, rgba(214, 216, 244, .94) 0%, rgba(214, 216, 244, .76) 58%, rgba(214, 216, 244, 0) 100%); }
#essai .haut > * { pointer-events: auto; }
#essai .zone { position: relative; flex: 1 1 auto; }
#essai.ecran .zone { flex: 0 0 auto; height: calc(clamp(250px, 44vh, 430px) + 60px); }
#essai .bas { flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 14px 16px; border-radius: 26px 26px 0 0; background: var(--creme); box-shadow: 0 -6px 18px rgba(74, 51, 40, .1); }
#essai .bas i { display: block; height: 64px; margin-bottom: 10px; border-radius: 20px; background: #fff; box-shadow: 0 4px 14px rgba(74, 51, 40, .09); }
#essai .bas i:first-child { height: 52px; width: 48%; display: inline-block; margin-right: 3%; } #essai .bas i:nth-child(2) { height: 52px; width: 48%; display: inline-block; }
</style>
</head><body>
<script>window.FOURNIL_CLE = (k) => k;</script>
<script src="../vendor/three.min.js"></script>
<script src="../vendor/fournil-hd.min.js"></script>
<script src="../src/game.js"></script>
${avecChaine ? '<script src="../src/chaine.js"></script>\n' : ''}<script src="../src/vie.js"></script>
<script src="../src/hd.js"></script>
<script src="../src/planete.js"></script>
<script>
(() => {
  const G = GAME, u = new URLSearchParams(location.search), cadre = u.get('cadre') === 'ecran' ? 'ecran' : 'plein';
  const qualite = ['haute', 'moyenne', 'eco'].includes(u.get('qualite')) ? u.get('qualite') : 'haute';
  let el = null;
  const ESSAI = window.ESSAI = { cadre, qualite, journal: [], chaine: typeof CHAINE !== 'undefined' };
  // les fiches d'une chaîne à la boutique n°N (les n°1 à N − 1), dans la forme de CHAINE.liste ; o.varie : des gérants, des jetons à prendre,
  // des jauges et des Boutiques d'or (sinon, des boutiques rouvertes à neuf) ; o.vraies : par CHAINE lui-même (CHAINE.etat, puis CHAINE.liste)
  ESSAI.fiches = (N, o) => {
    o = o || {}; const now = Date.now(), varie = o.varie !== false;
    if (o.vraies && typeof CHAINE !== 'undefined') {
      const st = G.newState(now); st.boutiques = N; const c = CHAINE.etat(st, now);
      if (varie) for (const b of c.b) { if (b.n % 3 === 0) b.g = [b.n % 6, b.n % 5]; if (b.n % 4 === 1) b.jp = 1 + (b.n % 5); if (b.n % 7 === 3) b.or = 1; b.s = [1 + (b.n * 37) % 160, 1 + (b.n * 11) % 90]; }
      ESSAI.st = st; return CHAINE.liste(st, now);
    }
    const out = [];
    for (let n = 1; n < N; n++) {
      const q = G.QUARTIERS[G.quartierDe(n)], s = G.standingDe(n), max = 8 * [7, 8, 9, 10, 11, 12][s], or = varie && n % 7 === 3, fait = or ? max : varie ? (n * 13) % max : 0;
      const ger = varie && n % 3 === 0 ? { rythme: n % 6, duree: n % 5, part: [0.1, 0.14, 0.18, 0.22, 0.26, 0.3][n % 6], heures: [8, 10, 12, 14, 16][n % 5], reste: (n % 2) * 3600 * 3 } : null;
      out.push({ n, nom: q.enseigne, quartier: q.id, quartierNom: q.nom, standing: s, jauge: { fait, max, part: max ? fait / max : 0, niv: [175, 200, 250, 300, 350, 400][s] },
        jetons: varie && n % 4 === 1 ? 1 + (n % 5) + (or ? [40, 60, 80, 100, 120, 140][s] : 0) : 0, or, caisse: 1200 * n, enAttente: 0, gerant: ger, rythme: 10 * n, paliers: 0 });
    }
    return out;
  };
  // ouvrir la planète à la n°N : son cadre (plein ou écran), puis PLANETE.ouvrir ; o : { heure, qualite, fiches, varie, vraies, fermerEnEntrant
  // (onEntrer referme la planète, comme l'écran qui entre dans la boutique) }
  ESSAI.ouvrir = (N, o) => {
    o = o || {}; ESSAI.fermer();
    el = document.createElement('div'); el.id = 'essai'; el.className = cadre;
    const f = o.fiches || ESSAI.fiches(N, o);
    el.innerHTML = '<div class="zone"></div><div class="haut at-haut"><button type="button" class="at-fermer" aria-label="Fermer"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#4A3328" stroke-width="2.4" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button>'
      + '<div class="at-titre"><b>Ma chaîne</b><small>' + f.length + ' boutique' + (f.length > 1 ? 's' : '') + '</small></div></div>' + (cadre === 'ecran' ? '<div class="bas"><i></i><i></i><i></i><i></i><i></i></div>' : '');
    document.body.appendChild(el);
    ESSAI.vues = f;
    return PLANETE.ouvrir(el.querySelector('.zone'), f, { qualite: o.qualite || qualite, boutiques: N, heure: o.heure == null ? 12 : o.heure,
      onToucher: (n) => ESSAI.journal.push('toucher ' + n), onEntrer: (n) => { ESSAI.journal.push('entrer ' + n); if (o.fermerEnEntrant) ESSAI.fermer(); } });
  };
  ESSAI.fermer = () => { if (PLANETE.ouvert) PLANETE.fermer(); if (el) el.remove(); el = null; };
})();
</script>
</body></html>
`;
}

// le serveur : la racine du dépôt, et la page d'essai à /fournil/planete-essai.html ; demandes : les fichiers hd/planete lus, avec leur poids
function servir(racine, port, demandes) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.json': 'application/json' };
  return http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/fournil/planete-essai.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(page(racine)); return; }
    fs.readFile(path.join(racine, p), (err, d) => {
      if (err) { res.writeHead(404); res.end(); return; }
      if (demandes && p.includes('/hd/planete/')) demandes.push({ p, n: d.length });
      res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d);
    });
  }).listen(port);
}

module.exports = { page, servir };
