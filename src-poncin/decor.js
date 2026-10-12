/* OPÉRATION PONCIN — le décor « réaliste stylisé » (decor.js → PDECOR) : ce que les bâtiments extrudés de rendu.js n'ont pas.
   Données (src-poncin/ARCHITECTURE.md, « Authenticité » et « Passages voûtés et bâtiments remarquables » ; conventions des champs dans
   outils/carte/README.md) : carte.enseignes [{ b, n, t, x, z, yaw }] (vrai nom OSM posé sur la façade ; yaw = normale sortante : la façade
   regarde vers (−sin yaw, −cos yaw)), carte.mobilier [{ x, z, t, yaw?, n? }] (OSM), carte.murs [{ l, h, e, t }] (OSM, BD TOPO), carte.rues
   (noms des plaques), monde.bancs (les bancs de la place), carte.relief et carte.horizon (montagnes réelles), carte.sol
   (raccord de couleur de l'horizon), zones.arene (la place). RIEN D'INVENTÉ DANS LES DONNÉES : noms, positions des objets réels et
   façades viennent d'OSM et de l'IGN. Sont des CHOIX DE STYLE (ambiance générique, jamais présentée comme une donnée) : dessins,
   teintes, devantures, stores, terrasses (3–4 tables, un parasol) des bars et restaurants, perron, horloge (17 h 10, l'heure du soleil
   de rendu.js) et drapeaux de la mairie, lanternes murales anciennes (rues du bourg, ~27 m, jamais deux à moins de 15 m), fenêtres
   fleuries et pots près de la place, bancs sous les arbres de la place (posés par monde.js), plaques de rue émaillées aux carrefours
   (une au plus), l'intérieur derrière les glaces (pains, bureau à glace dépolie, salle à brise-bise, salon de coiffure ; sinon des
   étagères). Aucun logo de marque : Crédit Agricole, La Poste, Petit Casino s'écrivent en lettres, couleurs génériques ; la « carotte »
   rouge des tabacs est un signe réglementaire générique.
   Rendu (Three r158) : TOUT est fusionné, une géométrie par matériau : solides (couleurs de sommet ; « bourg » à moins de 175 m de la
   place, avec ombres en haute, et « loin », sans ombres ; un seul en éco), pierre (perron, murs, croix, monuments : la texture en couches
   de rendu.js si opts.bati, sinon les moellons de PTEXTURES.facade, sinon des couleurs ; idem bourg / loin), atlas du décor (canvas peint
   ici, une fois par taille : drapeaux qui ondulent dans le vertex shader, lettres MAIRIE, toiles rayées et lambrequins festonnés des
   stores, géraniums, buis, distributeur, journaux, intérieurs des glaces, panneaux d'arrêt et de sentiers, grille, plaque de bronze ;
   découpe alpha, ombres découpées), ouvertures (atlas PTEXTURES.details : vitrines, porte, horloge, fenêtres et volets), enseignes et
   plaques (pages d'atlas PTEXTURES, une géométrie par page, redemandées à chaque construction). Les aplats posés sur les façades sont à
   ≥ 6 cm du mur (les ouvertures de rendu.js sont à 4–5 cm). Horizon : un anneau de relief IGN autour du carré joué (raccord exact avec
   le sol : les mêmes nœuds de bord que carte.relief ; couleur du bord prise sur la photo aérienne), dessiné juste après le ciel
   (renderOrder −9) sans écrire la profondeur, de la bande la plus lointaine à la plus proche (le peintre), et ramené près de l'œil par
   une homothétie de centre la caméra (même image, jamais coupé par camera.far) ; brume du jeu (scene.fog) entière au raccord et levée
   en ~330 m, puis brume de vallée légère (≤ 30 %) sur les points bas, qui s'efface au loin, puis voile atmosphérique (couleur de la
   brume bleuie) ; repli : collines douces génériques.
   Budgets du décor visible, mesurés par test/poncin-decor.cjs : haute 9 appels + 3 d'ombre, ~22k + ~11k triangles (≤ 14 et ≤ 40k) ;
   éco 7 appels, ≤ 15k triangles (≤ 8 et ≤ 15k). Aucune allocation par image (maj : un uniforme ; l'horizon recopie sa matrice dans
   onBeforeRender). Les objets du décor ne bloquent rien : monde.js décide des collisions (troncs, murs, mobilier OSM massif) ; les bancs
   de la place sont à lui (monde.bancs [[x, z, yaw]] : il les pose et les rend pleins, decor.js les dessine là) ; les terrasses (tables,
   chaises, parasol), contre les façades, restent traversables.
   API : creer(carte, monde, { qualite, textures, bati, dossier, photo }) → { groupe, maj(camera, t), qualite(q?), retour(), liberer(),
   stats, remarquables, facades, atlas } ; textures = PTEXTURES (défaut : le global s'il est chargé ; null pour s'en passer) ; bati =
   l'objet PTEXTURES.bati(…) de rendu.js, ou une fonction qui le rend (relue à chaque construction), pour partager sa texture en couches ;
   dossier : où lire carte.sol (défaut window.PONCIN_CARTE_DOSSIER ou 'carte/') ; photo: false pour ne pas la lire. groupe : à ajouter
   à la scène ; maj(camera, t) après avoir placé la caméra (t en secondes : le vent des drapeaux ; reconstruit si qualite a changé) ;
   qualite('haute' | 'moyenne' | 'eco') : reconstruction au maj suivant — l'appeler après PTEXTURES.vider() / PTEXTURES.qualite(q) ;
   retour() après un contexte WebGL retrouvé ; liberer() rend tout ce qui est à lui (jamais les textures ni les matériaux partagés de
   PTEXTURES). stats → { qualite, appels, triangles, appelsOmbre, trianglesOmbre, parMaillage, horizon, objets, terrassesRefusees, bancs,
   lanternes, pierre, atlas, memoire, creation, construction, erreurs… }. remarquables : [{ quoi, n, x, y, z, nx, nz }] (mairie, tabac,
   banque, poste, bar, restaurant, commerces { interieur : 'pains' | 'bureau' | 'salle' | 'salon' s'il y en a un }, terrasse { tables },
   écoles, plaques : le pied de la façade et sa normale, pour un survol ou des tests). facades : [{ b, a, c, s0, s1, quoi }] les façades
   habillées (b : indice de carte.batiments ; arête a → c de monde.batiments, s en mètres depuis a) : rendu.js peut y taire sa propre
   vitrine, son store ou sa porte. atlas : la toile de l'atlas (pages de test). QUALITES ; OK (false sans THREE ni document). */
const PDECOR = (() => {
  'use strict';
  const OK = typeof THREE !== 'undefined' && typeof document !== 'undefined';
  const TAU = Math.PI * 2;
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lisse = (a, b, v) => { const t = borne((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const COULS = new Map();
  function lin(hex, k) { // '#rrggbb' → [r, g, b] linéaires (× k), en cache
    k = k == null ? 1 : k; const cle = hex + '|' + k; let c = COULS.get(cle);
    if (!c) { const n = parseInt(String(hex).replace('#', ''), 16) || 0; c = [LIN[(n >> 16) & 255] * k, LIN[(n >> 8) & 255] * k, LIN[n & 255] * k]; COULS.set(cle, c); }
    return c;
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const QUALITES = { // seg : facettes des cylindres ; az : 1 nœud de bord sur az à partir de l'anneau azDes de l'horizon ; fusion : bourg et loin dans les mêmes maillages
    haute: { seg: 10, ombres: true, atlas: 1024, az: 2, azDes: 8, anneaux: [0, 25, 70, 140, 240, 380, 570, 820, 1150, 1600, 2200, 3000, 4100, 5500, 7000], tables: 4, chaises: 3, fin: 1, fusion: false },
    moyenne: { seg: 8, ombres: false, atlas: 1024, az: 2, azDes: 2, anneaux: [0, 35, 110, 230, 420, 700, 1100, 1700, 2600, 3900, 5500, 7000], tables: 4, chaises: 3, fin: 1, fusion: false },
    eco: { seg: 6, ombres: false, atlas: 512, az: 2, azDes: 2, anneaux: [0, 45, 160, 400, 800, 1500, 2600, 4300, 7000], tables: 3, chaises: 2, fin: 0, fusion: true },
  };

  // ═══════════════════════════════ les lots de triangles et les repères ═══════════════════════════════
  // un lot (non indexé) : position, normale, couleur linéaire, uv, et un attribut libre e (couche de la pierre, vent des toiles)
  function Lot() { this.p = []; this.n = []; this.c = []; this.u = []; this.e = []; }
  Lot.prototype.s = function (P, N, c, u, v, e) { this.p.push(P[0], P[1], P[2]); this.n.push(N[0], N[1], N[2]); this.c.push(c[0], c[1], c[2]); this.u.push(u, v); this.e.push(e || 0); };
  function normale(a, b, c) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; return [nx / l, ny / l, nz / l]; }
  // un triangle (sens direct vu de devant) ; uv : [ua, va, ub, vb, uc, vc] ; cb, cc : couleurs des sommets b et c (sinon ca)
  Lot.prototype.tri = function (a, b, c, ca, uv, e, cb, cc) { const N = normale(a, b, c); this.s(a, N, ca, uv ? uv[0] : 0, uv ? uv[1] : 0, e); this.s(b, N, cb || ca, uv ? uv[2] : 0, uv ? uv[3] : 0, e); this.s(c, N, cc || ca, uv ? uv[4] : 0, uv ? uv[5] : 0, e); };
  // un quadrilatère a (bas gauche), b (bas droite), c (haut droite), d (haut gauche) vu de devant ; uv = [u0, v0, u1, v1] ; ch : couleur du haut
  Lot.prototype.quad = function (a, b, c, d, col, uv, e, ch) {
    const u0 = uv ? uv[0] : 0, v0 = uv ? uv[1] : 0, u1 = uv ? uv[2] : 0, v1 = uv ? uv[3] : 0; ch = ch || col;
    this.tri(a, b, c, col, [u0, v0, u1, v0, u1, v1], e, col, ch); this.tri(a, c, d, col, [u0, v0, u1, v1, u0, v1], e, ch, ch);
  };
  Lot.prototype.nb = function () { return this.p.length / 9; };
  Lot.prototype.geometrie = function (nomE) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (nomE) g.setAttribute(nomE, new THREE.Float32BufferAttribute(this.e, 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  };
  // un repère : origine o, axe X horizontal (xx, xz), Y vers le haut, Z = X × Y = (−xz, 0, xx) (« devant » de l'objet, vers celui qui regarde)
  function Rep(ox, oy, oz, xx, xz) { this.ox = ox; this.oy = oy; this.oz = oz; this.xx = xx; this.xz = xz; }
  Rep.prototype.pt = function (x, y, z) { return [this.ox + this.xx * x - this.xz * z, this.oy + y, this.oz + this.xz * x + this.xx * z]; };
  Rep.prototype.dir = function (x, y, z) { return [this.xx * x - this.xz * z, y, this.xz * x + this.xx * z]; };
  const repYaw = (x, y, z, yaw) => new Rep(x, y, z, -Math.cos(yaw), Math.sin(yaw)); // l'objet regarde vers (−sin yaw, −cos yaw) (convention de la carte)
  // ─── les primitives, en coordonnées du repère R ───
  function boite(L, R, x0, x1, y0, y1, z0, z1, col, sans, ch, e) { // sans : faces omises parmi 'fdgrhb' (devant, dos, gauche, droite, haut, bas) ; ch : couleur du haut
    const P = (x, y, z) => R.pt(x, y, z); sans = sans || 'b'; ch = ch || col;
    if (!sans.includes('f')) L.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), col, null, e, ch);
    if (!sans.includes('d')) L.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), col, null, e, ch);
    if (!sans.includes('g')) L.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), col, null, e, ch);
    if (!sans.includes('r')) L.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), col, null, e, ch);
    if (!sans.includes('h')) L.quad(P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), ch, null, e);
    if (!sans.includes('b')) L.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), col, null, e);
  }
  function panneau(L, R, x0, x1, y0, y1, z, col, uv, e, ch) { L.quad(R.pt(x0, y0, z), R.pt(x1, y0, z), R.pt(x1, y1, z), R.pt(x0, y1, z), col, uv, e, ch); } // face vers +Z
  // un cylindre (tronc de cône) entre deux points locaux a et b, normales lisses ; bouchons : 'a', 'b' ou 'ab'
  function cylindre(L, R, a, b, ra, rb, n, col, bouchons, cb, e) {
    const A = R.pt(a[0], a[1], a[2]), B = R.pt(b[0], b[1], b[2]); let dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2]; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    let rx = 0, ry = 1, rz = 0; if (Math.abs(dy) > 0.9) { rx = 1; ry = 0; }
    let e1x = dy * rz - dz * ry, e1y = dz * rx - dx * rz, e1z = dx * ry - dy * rx; const l1 = Math.hypot(e1x, e1y, e1z) || 1; e1x /= l1; e1y /= l1; e1z /= l1;
    const e2x = dy * e1z - dz * e1y, e2y = dz * e1x - dx * e1z, e2z = dx * e1y - dy * e1x; cb = cb || col;
    const pts = []; for (let k = 0; k <= n; k++) { const t = k / n * TAU, c = Math.cos(t), s = Math.sin(t), nx = e1x * c + e2x * s, ny = e1y * c + e2y * s, nz = e1z * c + e2z * s; pts.push([nx, ny, nz]); }
    for (let k = 0; k < n; k++) {
      const p = pts[k], q = pts[k + 1], a0 = [A[0] + p[0] * ra, A[1] + p[1] * ra, A[2] + p[2] * ra], a1 = [A[0] + q[0] * ra, A[1] + q[1] * ra, A[2] + q[2] * ra], b0 = [B[0] + p[0] * rb, B[1] + p[1] * rb, B[2] + p[2] * rb], b1 = [B[0] + q[0] * rb, B[1] + q[1] * rb, B[2] + q[2] * rb];
      L.s(a0, p, col, 0, 0, e); L.s(a1, q, col, 0, 0, e); L.s(b1, q, cb, 0, 0, e); L.s(a0, p, col, 0, 0, e); L.s(b1, q, cb, 0, 0, e); L.s(b0, p, cb, 0, 0, e);
      if (bouchons && bouchons.includes('b') && rb > 0) L.tri(B, b0, b1, cb, null, e);
      if (bouchons && bouchons.includes('a') && ra > 0) L.tri(A, a1, a0, col, null, e);
    }
  }
  function pyramide(L, R, x, y0, z, w, d, h, col, n4, ch) { // pyramide à base rectangulaire (w × d) posée en y0, sommet à y0 + h ; n4 : 4 côtés seulement
    const S = R.pt(x, y0 + h, z), c = [R.pt(x - w / 2, y0, z + d / 2), R.pt(x + w / 2, y0, z + d / 2), R.pt(x + w / 2, y0, z - d / 2), R.pt(x - w / 2, y0, z - d / 2)];
    for (let i = 0; i < 4; i++) { if (h > 0) L.tri(c[i], c[(i + 1) % 4], S, col, null, 0, col, ch || col); else L.tri(c[(i + 1) % 4], c[i], S, col, null, 0, col, ch || col); }
    if (!n4) { if (h > 0) { L.tri(c[0], c[3], c[2], col); L.tri(c[0], c[2], c[1], col); } else { L.tri(c[0], c[1], c[2], col); L.tri(c[0], c[2], c[3], col); } }
  }
  function tronc(L, R, x, y0, y1, z, w0, d0, w1, d1, col, ch, sans) { // tronc de pyramide (bas w0 × d0, haut w1 × d1), ses 4 côtés et le dessus
    const b = [R.pt(x - w0 / 2, y0, z + d0 / 2), R.pt(x + w0 / 2, y0, z + d0 / 2), R.pt(x + w0 / 2, y0, z - d0 / 2), R.pt(x - w0 / 2, y0, z - d0 / 2)];
    const h = [R.pt(x - w1 / 2, y1, z + d1 / 2), R.pt(x + w1 / 2, y1, z + d1 / 2), R.pt(x + w1 / 2, y1, z - d1 / 2), R.pt(x - w1 / 2, y1, z - d1 / 2)];
    for (let i = 0; i < 4; i++) L.quad(b[i], b[(i + 1) % 4], h[(i + 1) % 4], h[i], col, null, 0, ch || col);
    if (!sans || !sans.includes('h')) L.quad(h[0], h[1], h[2], h[3], ch || col);
  }

  // ═══════════════════════════════ l'atlas du décor (canvas, découpe alpha) ═══════════════════════════════
  const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif', SANS = '"Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif', ETROITE = '"Arial Narrow", "Liberation Sans Narrow", "Helvetica Neue", Arial, sans-serif';
  const TOILES = { // les stores (choix de style) : couleur des bandes, couleur du fond
    bordeaux: ['#7C2230', '#EFE4CC'], vert: ['#2F5A3E', '#ECE3CC'], rouge: ['#B3262B', '#F4EFE6'], marine: ['#24385E', '#F1EEE6'], ocre: ['#B8792E', '#F2E7CF'], gris: ['#5D6268', '#ECE9E2'],
  };
  function rondRect(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function ecrire(c, txt, x, y, w, h, police, poids, coul, o) { // le texte centré dans (x, y, w, h), compressé en largeur s'il le faut
    o = o || {}; const taille = Math.max(4, Math.round(h * (o.k || 0.7))); c.font = `${poids} ${taille}px ${police}`; const l = c.measureText(txt).width + (o.espace || 0) * txt.length, kx = l > w ? w / l : 1;
    c.save(); c.translate(x + w / 2, y + h * 0.53); c.scale(kx, 1); c.textAlign = 'center'; c.textBaseline = 'middle';
    const dessiner = (dx, dy) => { if (!o.espace) { c.fillText(txt, dx, dy); return; } let xx = -l / 2; for (const ch of txt) { const cw = c.measureText(ch).width; c.fillText(ch, xx + cw / 2 + dx, dy); xx += cw + o.espace; } };
    if (o.ombre) { c.fillStyle = o.ombre; dessiner(o.od || 1.5, o.od || 1.5); }
    if (o.clair) { c.fillStyle = o.clair; dessiner(-1, -1); }
    c.fillStyle = coul; dessiner(0, 0); c.restore();
  }
  function grain(c, x, y, w, h, a, rnd, n) { c.save(); for (let i = 0; i < n; i++) { c.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; c.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1); } c.restore(); }
  const PEINTRES = {
    lettres(c, x, y, w, h, o) { // des lettres de bronze sombre posées sur la façade (fond transparent)
      ecrire(c, o.texte, x + h * 0.1, y, w - h * 0.2, h, SERIF, 'bold', '#2E2822', { k: 0.82, espace: h * 0.16, ombre: 'rgba(40,30,20,0.45)', od: Math.max(1, h * 0.04), clair: 'rgba(214,196,160,0.55)' });
    },
    drapeauFr(c, x, y, w, h) { const b = ['#21468B', '#F4F2EE', '#D3252F']; for (let i = 0; i < 3; i++) { c.fillStyle = b[i]; c.fillRect(x + w * i / 3, y, w / 3 + 1, h); } plis(c, x, y, w, h); },
    drapeauUe(c, x, y, w, h) {
      c.fillStyle = '#1D3D93'; c.fillRect(x, y, w, h); const cx = x + w / 2, cy = y + h / 2, r = h / 3, s = h / 18; c.fillStyle = '#FFD31A';
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; c.beginPath(); for (let k = 0; k < 10; k++) { const rr = k % 2 ? s * 0.4 : s, aa = -Math.PI / 2 + k * Math.PI / 5; c.lineTo(px + Math.cos(aa) * rr, py + Math.sin(aa) * rr); } c.closePath(); c.fill(); }
      plis(c, x, y, w, h);
    },
    toile(c, x, y, w, h, o) { // une toile de store à bandes (8 bandes), lumière du haut, trame
      const [b1, b2] = TOILES[o.toile], n = 8; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b2 : b1; c.fillRect(x + w * i / n, y, w / n + 1, h); }
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(255,255,255,0.08)'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(0,0,0,0.05)'; for (let j = 0; j < h; j += 3) c.fillRect(x, y + j, w, 1);
    },
    lambrequin(c, x, y, w, h, o) { // le bas du store : bandes, festons, ourlet (fond transparent sous les festons)
      const [b1, b2] = TOILES[o.toile], n = 8, hf = h * 0.3, hb = h - hf;
      for (let i = 0; i < n; i++) {
        const x0 = x + w * i / n, x1 = x + w * (i + 1) / n; c.fillStyle = i % 2 ? b2 : b1;
        c.beginPath(); c.moveTo(x0, y); c.lineTo(x1 + 0.5, y); c.lineTo(x1 + 0.5, y + hb); c.quadraticCurveTo((x0 + x1) / 2, y + hb + hf * 2, x0, y + hb); c.closePath(); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, y + hb * 0.12, w, Math.max(1, h * 0.05)); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y, w, Math.max(1, h * 0.06));
    },
    fleurs(c, x, y, w, h, o) { // géraniums en jardinière : feuilles rondes, ombelles de fleurs, fond vert transparent (pas de liseré sombre au loin)
      const rnd = mulberry32(o.graine || 3), fl = o.fleurs || ['#D7263D', '#E94F64', '#B81D35'];
      c.fillStyle = 'rgba(70,110,50,0.03)'; c.fillRect(x, y, w, h);
      for (let i = 0; i < w / h * 9; i++) { const px = x + rnd() * w, py = y + h * (0.45 + rnd() * 0.5), r = h * (0.1 + rnd() * 0.08); c.fillStyle = ['#3E6B2F', '#4D7D37', '#5E8F3F', '#355E2A'][i % 4]; c.beginPath(); c.arc(px, py, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(30,50,20,0.35)'; c.beginPath(); c.arc(px + r * 0.15, py + r * 0.1, r * 0.45, 0, TAU); c.fill(); }
      for (let i = 0; i < w / h * 4; i++) { const px = x + h * 0.2 + rnd() * (w - h * 0.4), py = y + h * (0.12 + rnd() * 0.4), r = h * (0.08 + rnd() * 0.06); for (let k = 0; k < 9; k++) { const a = rnd() * TAU, d = rnd() * r; c.fillStyle = fl[(k + i) % fl.length]; c.beginPath(); c.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, h * 0.035, 0, TAU); c.fill(); } }
    },
    buisson(c, x, y, w, h) { // un buis taillé en boule
      const cx = x + w / 2, cy = y + h * 0.52, r = w * 0.44, rnd = mulberry32(9); c.fillStyle = 'rgba(60,90,40,0.03)'; c.fillRect(x, y, w, h);
      const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r); g.addColorStop(0, '#7FA453'); g.addColorStop(0.6, '#4C7334'); g.addColorStop(1, '#2C4A22'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
      for (let i = 0; i < 260; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * r, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d; c.fillStyle = rnd() < 0.5 ? 'rgba(150,190,100,0.5)' : 'rgba(25,45,20,0.45)'; c.fillRect(px, py, 2, 2); }
      for (let i = 0; i < 60; i++) { const a = rnd() * TAU, px = cx + Math.cos(a) * r * (0.95 + rnd() * 0.08), py = cy + Math.sin(a) * r * (0.95 + rnd() * 0.08); c.fillStyle = '#3F6430'; c.beginPath(); c.arc(px, py, w * 0.025, 0, TAU); c.fill(); }
    },
    dab(c, x, y, w, h) { // un distributeur de billets générique, encastré : inox, écran, clavier, fente (aucune marque)
      const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#9EA4A8'); g.addColorStop(0.5, '#D3D7D9'); g.addColorStop(1, '#8E959A'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.fillStyle = '#2B2F33'; c.fillRect(x + w * 0.06, y + h * 0.04, w * 0.88, h * 0.1); ecrire(c, 'RETRAIT', x + w * 0.06, y + h * 0.04, w * 0.88, h * 0.1, SANS, 'bold', '#E8ECEF', { k: 0.62 });
      c.fillStyle = '#16202B'; c.fillRect(x + w * 0.14, y + h * 0.19, w * 0.72, h * 0.3); const e = c.createLinearGradient(0, y + h * 0.2, 0, y + h * 0.48); e.addColorStop(0, '#3D6E9C'); e.addColorStop(1, '#1F3E63'); c.fillStyle = e; c.fillRect(x + w * 0.18, y + h * 0.215, w * 0.64, h * 0.255);
      c.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 3; i++) c.fillRect(x + w * 0.26, y + h * (0.26 + i * 0.06), w * (0.48 - i * 0.1), h * 0.018);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { c.fillStyle = '#5B6168'; c.fillRect(x + w * (0.26 + i * 0.13), y + h * (0.56 + j * 0.06), w * 0.1, h * 0.045); c.fillStyle = '#C9CED2'; c.fillRect(x + w * (0.265 + i * 0.13), y + h * (0.562 + j * 0.06), w * 0.09, h * 0.035); }
      c.fillStyle = '#202326'; c.fillRect(x + w * 0.68, y + h * 0.6, w * 0.2, h * 0.02); c.fillRect(x + w * 0.2, y + h * 0.84, w * 0.6, h * 0.025);
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    },
    journaux(c, x, y, w, h) { // un présentoir de journaux : trois rangs de unes génériques (titres illisibles, aucune marque)
      const rnd = mulberry32(21); c.fillStyle = 'rgba(40,40,40,0.03)'; c.fillRect(x, y, w, h);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) {
        const px = x + w * (0.05 + i * 0.48), py = y + h * (0.03 + r * 0.32), pw = w * 0.43, ph = h * 0.3; c.fillStyle = ['#F2EFE6', '#EDE7D8', '#F6F4EE'][(r + i) % 3]; c.fillRect(px, py, pw, ph);
        c.fillStyle = ['#B3262B', '#1E3A78', '#222222', '#1F6B3A'][(r * 2 + i) % 4]; c.fillRect(px, py, pw, ph * 0.16);
        c.fillStyle = 'rgba(30,30,30,0.85)'; c.fillRect(px + pw * 0.06, py + ph * 0.24, pw * 0.88, ph * 0.08); c.fillRect(px + pw * 0.06, py + ph * 0.36, pw * 0.6, ph * 0.06);
        c.fillStyle = `rgb(${120 + rnd() * 80 | 0},${110 + rnd() * 70 | 0},${100 + rnd() * 60 | 0})`; c.fillRect(px + pw * 0.06, py + ph * 0.48, pw * 0.42, ph * 0.42);
        c.fillStyle = 'rgba(60,60,60,0.5)'; for (let k = 0; k < 5; k++) c.fillRect(px + pw * 0.53, py + ph * (0.5 + k * 0.08), pw * 0.4, ph * 0.03);
      }
      c.strokeStyle = '#2A2C2E'; c.lineWidth = Math.max(2, w * 0.02); for (let r = 0; r <= 3; r++) { c.beginPath(); c.moveTo(x, y + h * (0.01 + r * 0.32)); c.lineTo(x + w, y + h * (0.01 + r * 0.32)); c.stroke(); }
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    },
    interieur(c, x, y, w, h, o) { // derrière la glace d'une devanture, selon le commerce (choix de style génériques, aucune marque) ; cellule = la glace seule
      const rnd = mulberry32(o.graine || 11), g0 = c.createLinearGradient(0, y, 0, y + h), X = (u) => x + u * w, Y = (v) => y + v * h;
      g0.addColorStop(0, '#E9DDC4'); g0.addColorStop(0.18, '#B9A688'); g0.addColorStop(1, '#5A4A3A'); c.fillStyle = g0; c.fillRect(x, y, w, h); // le fond éclairé
      if (o.genre === 'pains') { // boulangerie : étagères de bois, baguettes debout en corbeilles, boules et couronnes, viennoiseries sur le comptoir
        c.fillStyle = '#EFE6D2'; c.fillRect(x, y, w, h * 0.62); c.fillStyle = 'rgba(160,140,110,0.25)'; for (let v = 0.06; v < 0.62; v += 0.06) c.fillRect(x, Y(v), w, 1); // faïence
        for (let k = 0; k < 7; k++) { const px = X(0.06 + k * 0.03 + rnd() * 0.02), a = -0.25 + rnd() * 0.5; c.save(); c.translate(px, Y(0.36)); c.rotate(a); c.fillStyle = '#C9873E'; rondRect(c, -w * 0.018, -h * 0.3, w * 0.036, h * 0.3, w * 0.018); c.fill(); c.fillStyle = 'rgba(255,230,170,0.6)'; for (let j = 0; j < 4; j++) c.fillRect(-w * 0.008, -h * (0.27 - j * 0.06), w * 0.016, 2); c.restore(); }
        c.fillStyle = '#8A5A32'; c.fillRect(X(0.04), Y(0.33), w * 0.3, h * 0.07); // la corbeille
        for (const v of [0.2, 0.4]) { c.fillStyle = '#7A4E2C'; c.fillRect(X(0.38), Y(v), w * 0.6, h * 0.018); for (let k = 0; k < 4; k++) { const cx = X(0.45 + k * 0.14), r = w * (0.05 + rnd() * 0.015); const gb = c.createRadialGradient(cx - r * 0.3, Y(v) - r * 0.9, r * 0.1, cx, Y(v) - r * 0.6, r); gb.addColorStop(0, '#E2A65A'); gb.addColorStop(1, '#9C5E28'); c.fillStyle = gb; c.beginPath(); c.ellipse(cx, Y(v) - r * 0.62, r, r * 0.62, 0, 0, TAU); c.fill(); c.strokeStyle = 'rgba(250,225,170,0.7)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - r * 0.5, Y(v) - r * 0.8); c.lineTo(cx + r * 0.4, Y(v) - r * 0.5); c.stroke(); } }
        c.fillStyle = '#6B4428'; c.fillRect(x, Y(0.62), w, h * 0.38); c.fillStyle = '#F4EEE2'; c.fillRect(x, Y(0.62), w, h * 0.04); // le comptoir vitré
        for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { const cx = X(0.1 + k * 0.16 + (r ? 0.07 : 0)), cy = Y(0.74 + r * 0.1), rr = w * 0.045; c.fillStyle = r ? '#B8743A' : '#D9944A'; c.beginPath(); c.arc(cx, cy, rr, Math.PI * 1.05, Math.PI * 1.95); c.quadraticCurveTo(cx, cy + rr * 0.2, cx - rr * 0.95, cy - rr * 0.3); c.fill(); }
      } else if (o.genre === 'bureau') { // banque, poste, office de tourisme : le plafond et ses luminaires en haut, glace dépolie (vitrophanie unie) en bas
        c.fillStyle = '#F2EEE6'; for (const u of [0.25, 0.75]) c.fillRect(X(u - 0.14), Y(0.04), w * 0.28, h * 0.025);
        c.fillStyle = '#7C8A92'; c.fillRect(X(0.1), Y(0.14), w * 0.8, h * 0.12); c.fillStyle = '#A9B6BD'; c.fillRect(X(0.12), Y(0.155), w * 0.76, h * 0.09); // un présentoir à dépliants au fond
        for (let k = 0; k < 5; k++) { c.fillStyle = ['#D9C9A3', '#8DB3C7', '#C98E6E', '#9DBB8C', '#E5D9BC'][k]; c.fillRect(X(0.15 + k * 0.145), Y(0.165), w * 0.1, h * 0.07); }
        const gd = c.createLinearGradient(0, Y(0.3), 0, y + h); gd.addColorStop(0, '#D8DEE0'); gd.addColorStop(1, '#C3CBCF'); c.fillStyle = gd; c.fillRect(x, Y(0.3), w, h * 0.7);
        c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(x, Y(0.3), w, 2); c.fillRect(x, Y(0.5), w, h * 0.012); c.fillStyle = 'rgba(90,100,105,0.25)'; c.fillRect(x, Y(0.515), w, 1);
      } else if (o.genre === 'salle') { // bar, restaurant : suspensions, l'étagère des bouteilles, brise-bise blanc sur sa tringle de laiton
        c.fillStyle = '#4A3528'; c.fillRect(x, y, w, h * 0.55); for (const u of [0.25, 0.72]) { c.fillStyle = '#2A2420'; c.fillRect(X(u) - 1, y, 2, h * 0.08); const gl = c.createRadialGradient(X(u), Y(0.1), 1, X(u), Y(0.1), w * 0.2); gl.addColorStop(0, 'rgba(255,220,150,0.95)'); gl.addColorStop(1, 'rgba(255,200,120,0)'); c.fillStyle = gl; c.fillRect(X(u) - w * 0.2, Y(0.1) - w * 0.2, w * 0.4, w * 0.4); c.fillStyle = '#F6E2B0'; c.beginPath(); c.arc(X(u), Y(0.1), w * 0.05, Math.PI, TAU); c.fill(); }
        c.fillStyle = '#6E4A30'; c.fillRect(X(0.05), Y(0.3), w * 0.9, h * 0.012); for (let k = 0; k < 11; k++) { const bx = X(0.08 + k * 0.08), bh = h * (0.07 + rnd() * 0.03); c.fillStyle = ['#2F5A3A', '#6B2A22', '#C9A35A', '#3A3A44', '#A8B49A'][Math.floor(rnd() * 5)]; c.fillRect(bx, Y(0.3) - bh, w * 0.04, bh); c.fillRect(bx + w * 0.012, Y(0.3) - bh - h * 0.025, w * 0.016, h * 0.025); }
        c.fillStyle = '#B08D4A'; c.fillRect(x, Y(0.5), w, h * 0.012); // la tringle
        for (let i = 0; i < 16; i++) { const px = x + w * i / 16, gp = c.createLinearGradient(px, 0, px + w / 16, 0); gp.addColorStop(0, '#E4DED2'); gp.addColorStop(0.5, '#FBF8F1'); gp.addColorStop(1, '#D7D0C2'); c.fillStyle = gp; c.fillRect(px, Y(0.512), w / 16 + 1, h * 0.488); }
        c.fillStyle = 'rgba(200,190,170,0.6)'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(X((i + 0.5) / 8), Y(0.51), w * 0.03, 0, Math.PI); c.fill(); } // le haut festonné
      } else if (o.genre === 'salon') { // coiffure : grand miroir encadré, fauteuil de coiffure vu de dos, tablette et flacons
        const gs = c.createLinearGradient(0, y, 0, y + h); gs.addColorStop(0, '#DCD2C2'); gs.addColorStop(1, '#8A7E70'); c.fillStyle = gs; c.fillRect(x, y, w, h); c.fillStyle = '#2C2A2E'; c.fillRect(X(0.18), Y(0.1), w * 0.64, h * 0.5);
        const gm = c.createLinearGradient(X(0.2), Y(0.12), X(0.8), Y(0.58)); gm.addColorStop(0, '#C9D6DC'); gm.addColorStop(0.5, '#9FB1BA'); gm.addColorStop(1, '#B8C7CE'); c.fillStyle = gm; c.fillRect(X(0.2), Y(0.12), w * 0.6, h * 0.46);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(X(0.3), Y(0.12)); c.lineTo(X(0.42), Y(0.12)); c.lineTo(X(0.26), Y(0.58)); c.lineTo(X(0.2), Y(0.58)); c.closePath(); c.fill();
        c.fillStyle = '#F2EEE8'; c.fillRect(X(0.12), Y(0.6), w * 0.76, h * 0.03); for (let k = 0; k < 5; k++) { c.fillStyle = ['#D96A8C', '#3E7CB1', '#E8E2D0', '#7FB069', '#2E2E2E'][k]; c.fillRect(X(0.2 + k * 0.12), Y(0.6) - h * 0.05, w * 0.05, h * 0.05); }
        c.fillStyle = '#1E1E22'; rondRect(c, X(0.3), Y(0.5), w * 0.4, h * 0.3, w * 0.06); c.fill(); c.fillRect(X(0.25), Y(0.74), w * 0.5, h * 0.04); c.fillRect(X(0.47), Y(0.78), w * 0.06, h * 0.14); c.fillStyle = '#9A9EA3'; c.fillRect(X(0.33), Y(0.92), w * 0.34, h * 0.03);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(X(0.33), Y(0.52), w * 0.05, h * 0.2);
      }
      c.fillStyle = 'rgba(255,255,255,0.16)'; c.beginPath(); c.moveTo(X(0.15), y); c.lineTo(X(0.5), y); c.lineTo(X(0.1), y + h); c.lineTo(X(-0.2), y + h); c.closePath(); c.save(); c.clip(); c.fill(); c.restore(); // le reflet de la glace
      c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, y, w, h * 0.22);
    },
    grille(c, x, y, w, h) { // un portail de fer forgé : barreaux, lisses, pointes (fond transparent)
      c.strokeStyle = '#26272A'; c.fillStyle = '#26272A'; c.lineWidth = Math.max(2, w * 0.012); const n = 14;
      c.fillRect(x, y + h * 0.12, w, h * 0.035); c.fillRect(x, y + h * 0.9, w, h * 0.035); c.fillRect(x, y + h * 0.55, w, h * 0.025);
      for (let i = 0; i <= n; i++) { const px = x + w * (0.02 + 0.96 * i / n); c.fillRect(px - c.lineWidth / 2, y + h * 0.08, c.lineWidth, h * 0.9); c.beginPath(); c.moveTo(px - c.lineWidth * 1.6, y + h * 0.09); c.lineTo(px, y + h * 0.01); c.lineTo(px + c.lineWidth * 1.6, y + h * 0.09); c.closePath(); c.fill(); }
      c.fillRect(x + w / 2 - c.lineWidth, y + h * 0.08, c.lineWidth * 2, h * 0.9);
    },
    plaqueBronze(c, x, y, w, h) { // une plaque de bronze aux lignes gravées illisibles (aucun texte inventé)
      const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#6B5233'); g.addColorStop(0.5, '#8C6D44'); g.addColorStop(1, '#5A4329'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(220,190,130,0.6)'; c.lineWidth = Math.max(1, h * 0.03); c.strokeRect(x + h * 0.06, y + h * 0.06, w - h * 0.12, h - h * 0.12);
      c.fillStyle = 'rgba(40,28,15,0.7)'; for (let i = 0; i < 6; i++) { const l = w * (0.5 + 0.3 * Math.sin(i * 1.7)); c.fillRect(x + (w - l) / 2, y + h * (0.2 + i * 0.11), l, h * 0.04); }
    },
    horloge(c, x, y, w, h) { // repli sans PTEXTURES : cadran émaillé, chiffres en bâtons, 17 h 10
      const cx = x + w / 2, cy = y + h / 2, r = w * 0.46; c.fillStyle = '#3A3530'; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.fillStyle = '#F7F3E8'; c.beginPath(); c.arc(cx, cy, r * 0.88, 0, TAU); c.fill();
      c.fillStyle = '#2A2622'; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.save(); c.translate(cx + Math.sin(a) * r * 0.74, cy - Math.cos(a) * r * 0.74); c.rotate(a); c.fillRect(-r * 0.025, -r * 0.08, r * 0.05, r * 0.16); c.restore(); }
      const aig = (a, l, e) => { c.save(); c.translate(cx, cy); c.rotate(a); c.fillRect(-e / 2, -l, e, l + r * 0.08); c.restore(); }; aig((5 + 10 / 60) / 12 * TAU, r * 0.48, r * 0.07); aig(10 / 60 * TAU, r * 0.7, r * 0.045);
    },
    bus(c, x, y, w, h, o) { // un panneau d'arrêt de car : pictogramme et nom (OSM)
      c.fillStyle = '#F6F6F2'; rondRect(c, x, y, w, h, w * 0.06); c.fill(); c.fillStyle = '#1F4E8C'; c.fillRect(x, y, w, h * 0.42);
      const bx = x + w * 0.28, by = y + h * 0.07, bw = w * 0.44, bh = h * 0.26; c.fillStyle = '#FFFFFF'; rondRect(c, bx, by, bw, bh, bw * 0.12); c.fill(); c.fillStyle = '#1F4E8C';
      c.fillRect(bx + bw * 0.1, by + bh * 0.15, bw * 0.8, bh * 0.35); c.beginPath(); c.arc(bx + bw * 0.25, by + bh, bh * 0.14, 0, TAU); c.arc(bx + bw * 0.75, by + bh, bh * 0.14, 0, TAU); c.fill();
      const mots = String(o.texte).split(/\s+-\s+|\s+/); const lignes = mots.length > 1 ? [mots[0], mots.slice(1).join(' ')] : mots;
      lignes.forEach((t, i) => ecrire(c, t, x + w * 0.06, y + h * (0.46 + i * 0.26), w * 0.88, h * 0.24, ETROITE, 'bold', '#1C2A3A', { k: 0.78 }));
      c.strokeStyle = '#9AA3AB'; c.lineWidth = 2; rondRect(c, x + 1, y + 1, w - 2, h - 2, w * 0.06); c.stroke();
    },
    info(c, x, y, w, h, o) { // un panneau de sentiers : bandeau au nom (OSM), carte stylisée générique (aucune donnée inventée : un dessin)
      c.fillStyle = '#6B4A2E'; c.fillRect(x, y, w, h); c.fillStyle = '#EDE6D2'; c.fillRect(x + w * 0.04, y + h * 0.22, w * 0.92, h * 0.72);
      c.fillStyle = '#2F5A3E'; c.fillRect(x + w * 0.04, y + h * 0.05, w * 0.92, h * 0.15); ecrire(c, o.texte, x + w * 0.06, y + h * 0.05, w * 0.88, h * 0.15, SANS, 'bold', '#F4EFE2', { k: 0.62 });
      const rnd = mulberry32(5); for (let i = 0; i < 9; i++) { c.fillStyle = ['rgba(120,160,90,0.45)', 'rgba(170,190,120,0.4)', 'rgba(110,140,170,0.35)'][i % 3]; c.beginPath(); c.ellipse(x + w * (0.1 + rnd() * 0.8), y + h * (0.3 + rnd() * 0.55), w * (0.05 + rnd() * 0.12), h * (0.04 + rnd() * 0.1), rnd() * 3, 0, TAU); c.fill(); }
      c.strokeStyle = '#B3262B'; c.lineWidth = Math.max(2, w * 0.012); c.setLineDash([w * 0.025, w * 0.015]); c.beginPath(); c.moveTo(x + w * 0.1, y + h * 0.85); c.bezierCurveTo(x + w * 0.35, y + h * 0.3, x + w * 0.6, y + h * 0.9, x + w * 0.9, y + h * 0.35); c.stroke(); c.setLineDash([]);
    },
    bandeau(c, x, y, w, h, o) { // une enseigne en bandeau (banque, gendarmerie, et les replis sans PTEXTURES)
      c.fillStyle = o.fond; rondRect(c, x, y, w, h, h * 0.08); c.fill();
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)'); c.fillStyle = g; c.fillRect(x, y, w, h);
      if (o.tricolore) { const b = ['#21468B', '#F4F2EE', '#D3252F']; for (let i = 0; i < 3; i++) { c.fillStyle = b[i]; c.fillRect(x + h * 0.25 + i * h * 0.16, y + h * 0.2, h * 0.16, h * 0.6); } }
      if (o.bord) { c.strokeStyle = o.bord; c.lineWidth = Math.max(1.5, h * 0.05); rondRect(c, x + h * 0.09, y + h * 0.09, w - h * 0.18, h - h * 0.18, h * 0.05); c.stroke(); }
      const m = h * (o.tricolore ? 0.95 : 0.4); ecrire(c, o.texte, x + m, y, w - m - h * 0.4, h, o.police || SANS, 'bold', o.encre, { k: 0.62, ombre: 'rgba(0,0,0,0.3)', od: 1 });
    },
    plaque(c, x, y, w, h, o) { // repli sans PTEXTURES : plaque de rue bleue émaillée
      c.fillStyle = '#1F4589'; rondRect(c, x, y, w, h, h * 0.15); c.fill(); c.strokeStyle = '#F4F4F0'; c.lineWidth = Math.max(1.5, h * 0.05); rondRect(c, x + h * 0.1, y + h * 0.1, w - h * 0.2, h - h * 0.2, h * 0.08); c.stroke();
      ecrire(c, String(o.texte).toLocaleUpperCase('fr-FR'), x + h * 0.25, y, w - h * 0.5, h, ETROITE, 'bold', '#F7F7F2', { k: 0.5 });
    },
  };
  function plis(c, x, y, w, h) { // des plis de toile : bandes d'ombre et de lumière le long de la hampe
    for (let i = 0; i < 6; i++) { const px = x + w * (i + 0.5) / 6, g = c.createLinearGradient(px - w / 12, 0, px + w / 12, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, i % 2 ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(px - w / 12, y, w / 6, h); }
  }
  // les cellules : { nom, w, h (px à 1024), peintre, o } rangées en étagères (réduites jusqu'à ce que tout tienne) ; uv = [u0, v0, u1, v1]
  function peindreAtlas(S, items) {
    let k = S / 1024, rang = null;
    for (let essai = 0; essai < 10 && !rang; essai++, k *= 0.9) {
      const pad = Math.max(2, Math.round(4 * S / 1024)), l = items.map((it) => ({ it, w: Math.max(4, Math.round(it.w * k)), h: Math.max(4, Math.round(it.h * k)) })).sort((a, b) => b.h - a.h);
      let x = pad, y = pad, hl = 0, ok = true;
      for (const e of l) { if (x + e.w + pad > S) { x = pad; y += hl + pad; hl = 0; } if (e.w + 2 * pad > S || y + e.h + pad > S) { ok = false; break; } e.x = x; e.y = y; x += e.w + pad; hl = Math.max(hl, e.h); }
      if (ok) rang = l;
    }
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d'), cellules = {};
    for (const e of rang || []) {
      c.save(); c.beginPath(); c.rect(e.x, e.y, e.w, e.h); c.clip();
      try { PEINTRES[e.it.peintre](c, e.x, e.y, e.w, e.h, e.it.o || {}); } catch (err) { c.fillStyle = '#888'; c.fillRect(e.x, e.y, e.w, e.h); }
      c.restore(); cellules[e.it.nom] = { uv: [(e.x + 0.5) / S, 1 - (e.y + e.h - 0.5) / S, (e.x + e.w - 0.5) / S, 1 - (e.y + 0.5) / S], ratio: e.w / e.h };
    }
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.name = 'pdecor-atlas'; tx.userData.canvas = cv;
    return { tx, cellules, S, octets: Math.round(S * S * 4 * 4 / 3) };
  }

  // ═══════════════════════════════ les types d'enseignes ═══════════════════════════════
  const STYLE_ENS = { coiffure: 'coiffeur', optique: 'commerce', bijouterie: 'commerce', vetements: 'commerce', ecole: 'mairie', bibliotheque: 'mairie', sante: 'banque', culture: 'hotel', supermarche: 'supermarche' }; // type de la carte → style de PTEXTURES.enseigne
  const BOUTIQUES = { // les commerces à devanture : couleur du bâti de la devanture, store (null : sans), porte au centre
    bar: ['#5A1E1C', 'bordeaux'], cafe: ['#5A1E1C', 'bordeaux'], restaurant: ['#1F3A2E', 'vert'], boulangerie: ['#5E3A20', 'rouge'], patisserie: ['#7A3A4A', 'bordeaux'], boucherie: ['#6E2424', 'rouge'],
    epicerie: ['#7C2622', 'rouge'], supermarche: ['#7C2622', 'rouge'], tabac: ['#2A2A2E', null], presse: ['#1D3E6E', null], coiffure: ['#1F1F23', null], optique: ['#383E46', 'gris'], bijouterie: ['#22304A', null],
    vetements: ['#3B3550', 'marine'], fleuriste: ['#2F5A3E', 'vert'], pharmacie: ['#2E5E3E', null], commerce: ['#3E4A52', 'ocre'], banque: ['#1F4A38', null], poste: ['#4E5358', null], tourisme: ['#2C5E86', null],
  };
  const TERRASSES = { bar: 1, cafe: 1, restaurant: 1 };
  const INTERIEURS = { boulangerie: 'pains', patisserie: 'pains', banque: 'bureau', poste: 'bureau', tourisme: 'bureau', bar: 'salle', cafe: 'salle', restaurant: 'salle', coiffure: 'salon' }; // derrière les glaces (sinon les étagères de l'atlas)
  const VOLETS = ['vert', 'bleu', 'gris', 'brun', 'bordeaux'];

  // ═══════════════════════════════ creer ═══════════════════════════════
  function creer(carte, monde, opts) {
    if (!OK || !carte || !monde || typeof monde.hauteur !== 'function') return null;
    opts = opts || {};
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0, maintenant = () => (typeof performance !== 'undefined' ? performance.now() : 0);
    const T = opts.textures !== undefined ? opts.textures : typeof PTEXTURES !== 'undefined' && PTEXTURES && PTEXTURES.OK ? PTEXTURES : null;
    const MOD = typeof MODELES !== 'undefined' && MODELES ? MODELES : null;
    const L = fini(+carte.taille) && carte.taille > 0 ? +carte.taille : monde.L || 600, X0 = -L / 2;
    const dossier = typeof opts.dossier === 'string' ? opts.dossier : typeof window !== 'undefined' && window.PONCIN_CARTE_DOSSIER ? window.PONCIN_CARTE_DOSSIER : 'carte/';
    const H0 = (x, z) => { try { const h = monde.hauteur(x, z); return fini(h) ? h : 0; } catch (e) { return 0; } };
    let nomQ = QUALITES[opts.qualite] ? opts.qualite : 'moyenne', libere = false, aRefaire = true;
    const erreurs = [], signaler = (ou, e) => { erreurs.push(ou + ' : ' + (e && e.message ? e.message : e)); };
    const arene = carte.zones && carte.zones.arene, AC = arene && Array.isArray(arene.centre) ? [+arene.centre[0], +arene.centre[1]] : [0, 0];
    const nomPlace = (carte.noms || []).find((o) => o && /^place\b/i.test(o.n) && Math.hypot(o.x - AC[0], o.z - AC[1]) < 40), PC = nomPlace ? [nomPlace.x, nomPlace.z] : AC; // le centre de la place

    // ─── les bâtiments : ceux de monde (polygones orientés, base, sommet), retrouvés depuis les indices de carte.batiments ───
    const BATS = monde.batiments || [], NET = typeof PMONDE !== 'undefined' && PMONDE && PMONDE.nettoyer ? PMONDE.nettoyer : null;
    const versMonde = new Int32Array((carte.batiments || []).length).fill(-1);
    { let k = 0; (carte.batiments || []).forEach((b, i) => { const ok = NET ? !!NET(b && b.p) : !!(b && Array.isArray(b.p) && b.p.length >= 3); if (ok && k < BATS.length) versMonde[i] = k++; }); }
    const bat = (i) => { const k = Number.isInteger(i) && i >= 0 && i < versMonde.length ? versMonde[i] : -1; return k >= 0 ? BATS[k] : null; };
    const dPoly = (p, x, z) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const xi = p[i][0], zi = p[i][1], xj = p[j][0], zj = p[j][1]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    const d2Seg = (px, pz, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l = ex * ex + ez * ez; let t = l > 0 ? ((px - ax) * ex + (pz - az) * ez) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const dx = ax + t * ex - px, dz = az + t * ez - pz; return dx * dx + dz * dz; };
    // la grille des bâtiments (est-on dedans ? quelles arêtes autour ?) et celle des rues (distance au bord de la chaussée)
    const TG = 16, G = Math.ceil(L / TG) + 2, gBat = new Map(), gRue = new Map(), gArb = new Map();
    const cle = (x, z) => (Math.floor((z - X0) / TG) + 1) * G + Math.floor((x - X0) / TG) + 1;
    const inscrire = (g, x0, z0, x1, z1, v) => { for (let j = Math.floor((z0 - X0) / TG); j <= Math.floor((z1 - X0) / TG); j++) for (let i = Math.floor((x0 - X0) / TG); i <= Math.floor((x1 - X0) / TG); i++) { const k = (j + 1) * G + i + 1; let l = g.get(k); if (!l) { l = []; g.set(k, l); } l.push(v); } };
    BATS.forEach((b, k) => { if (b && b.aabb) inscrire(gBat, b.aabb[0], b.aabb[1], b.aabb[2], b.aabb[3], k); });
    for (const r of carte.rues || []) { const l = r && Array.isArray(r.l) ? r.l : null; if (!l) continue; const w = fini(+r.w) ? +r.w : 5; for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1]; if (!a || !b) continue; const s = { ax: +a[0], az: +a[1], bx: +b[0], bz: +b[1], w, r }; if (!fini(s.ax) || !fini(s.bz)) continue; inscrire(gRue, Math.min(s.ax, s.bx) - w, Math.min(s.az, s.bz) - w, Math.max(s.ax, s.bx) + w, Math.max(s.az, s.bz) + w, s); } }
    for (const a of carte.arbres || []) if (Array.isArray(a) && fini(+a[0]) && fini(+a[1])) inscrire(gArb, +a[0], +a[1], +a[0], +a[1], a);
    function dansBat(x, z, sauf) { const l = gBat.get(cle(x, z)); if (!l) return -1; for (const k of l) { if (k === sauf) continue; const b = BATS[k], a = b.aabb; if (x < a[0] || x > a[2] || z < a[1] || z > a[3]) continue; if (dPoly(b.p, x, z)) return k; } return -1; }
    function rueProche(x, z) { // { d : distance au bord de la chaussée (négative dessus), s : le segment } ou null (au-delà de ~16 m)
      let m = null; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const l = gRue.get(cle(x + di * TG, z + dj * TG)); if (l) for (const s of l) { const d = Math.sqrt(d2Seg(x, z, s.ax, s.az, s.bx, s.bz)) - s.w / 2; if (!m || d < m.d) m = { d, s }; } }
      return m;
    }
    const distRue = (x, z) => { const r = rueProche(x, z); return r ? r.d : 99; };
    const presArbre = (x, z, r) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const l = gArb.get(cle(x + di * TG, z + dj * TG)); if (l) for (const a of l) { const rt = borne(0.12 + 0.025 * (+a[2] || 8), 0.2, 0.6); if (Math.hypot(a[0] - x, a[1] - z) < r + rt) return true; } } return false; };
    // les bancs de la place : posés et rendus pleins par monde.js (monde.bancs [[x, z, yaw]]) ; une terrasse ne s'y pose pas
    const BANCS = (Array.isArray(monde.bancs) ? monde.bancs : []).filter((b) => Array.isArray(b) && fini(b[0]) && fini(b[1]) && fini(b[2]));
    const presBanc = (x, z, r) => BANCS.some(([bx, bz, yaw]) => d2Seg(x, z, bx - Math.cos(yaw) * 0.9, bz + Math.sin(yaw) * 0.9, bx + Math.cos(yaw) * 0.9, bz - Math.sin(yaw) * 0.9) < (r + 0.25) ** 2);

    // ─── les façades : une arête d'un bâtiment de monde, vue du dehors ───
    function Facade(bi, i) { // bi : indice dans BATS ; arête p[i] → p[i+1] ; normale sortante (uz, −ux)
      const b = BATS[bi], p = b.p, a = p[i], c = p[(i + 1) % p.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      this.bi = bi; this.i = i; this.b = b; this.a = a; this.c = c; this.len = len; this.ux = (c[0] - a[0]) / len; this.uz = (c[1] - a[1]) / len; this.nx = this.uz; this.nz = -this.ux; this.cle = bi + '|' + i;
    }
    Facade.prototype.x = function (s, d) { return this.a[0] + this.ux * s + this.nx * (d || 0); };
    Facade.prototype.z = function (s, d) { return this.a[1] + this.uz * s + this.nz * (d || 0); };
    Facade.prototype.sol = function (s) { return H0(this.x(s, 0.3), this.z(s, 0.3)); };
    Facade.prototype.rep = function (s, y, d) { return new Rep(this.x(s, d), y, this.z(s, d), -this.ux, -this.uz); }; // X vers la droite vu du dehors (= −u), Z dehors
    Facade.prototype.mitoyenne = function (s) { return dansBat(this.x(s, 0.45), this.z(s, 0.45), this.bi) >= 0; };
    function facadeDe(bi, x, z, nx, nz) { // l'arête la plus proche de (x, z) dont la normale va dans le sens (nx, nz)
      const b = BATS[bi]; if (!b) return null; let best = null, bd = Infinity;
      for (let i = 0; i < b.p.length; i++) {
        const a = b.p[i], c = b.p[(i + 1) % b.p.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]); if (len < 1.2) continue;
        const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len; if ((nx || nz) && uz * nx - ux * nz < 0.3) continue;
        const d = Math.sqrt(d2Seg(x, z, a[0], a[1], c[0], c[1])); if (d < bd) { bd = d; best = i; }
      }
      if (best === null) return null; const f = new Facade(bi, best); f.s = borne((x - f.a[0]) * f.ux + (z - f.a[1]) * f.uz, 0, f.len); return f;
    }
    const spans = new Map(), facades = [], remarquables = [];
    const segsReserves = []; // les devantures et entrées en coordonnées du monde (une terrasse qui déborde chez le voisin les évite)
    function reserver(f, s0, s1, quoi, bc) { let l = spans.get(f.cle); if (!l) { l = []; spans.set(f.cle, l); } l.push([s0, s1, quoi]); if (!/^(lanterne|plaque)$/.test(quoi)) segsReserves.push([f.x(s0), f.z(s0), f.x(s1), f.z(s1), quoi, f.cle]); if (bc >= 0 && !/^(lanterne|plaque|pot|boite|voute)$/.test(quoi)) facades.push({ b: bc, a: f.a.slice(), c: f.c.slice(), s0: +s0.toFixed(2), s1: +s1.toFixed(2), quoi }); }
    const libreSur = (f, s0, s1, m) => { m = m == null ? 0.2 : m; return !(spans.get(f.cle) || []).some(([a, b]) => s1 > a - m && s0 < b + m); };

    // ─── les ordres de dessin : le plan est calculé une fois ; chaque qualité le redessine dans ses lots ───
    const ORDRES = [], COMPTE = {}, R_BOURG = 175; // au-delà de R_BOURG m de la place, le décor va dans les maillages « loin » (sans ombres)
    const ordre = (quoi, f, x, z) => { ORDRES.push([f, !(fini(x) && fini(z)) || Math.hypot(x - PC[0], z - PC[1]) < R_BOURG]); COMPTE[quoi] = (COMPTE[quoi] || 0) + 1; };
    // la pierre : texture en couches de rendu.js (opts.bati), sinon les moellons de PTEXTURES (une texture), sinon des couleurs
    const batiValide = (b) => (b && typeof b.couche === 'function' && typeof b.couleur === 'function' && typeof b.materiau === 'function' ? b : null);
    let BATI = batiValide(typeof opts.bati === 'function' ? (() => { try { return opts.bati(); } catch (e) { return null; } })() : opts.bati);
    const REF_PIERRE = '#C9BCA2';
    function pierreAttr(nom, hex, k) { // → [couleur de sommet, couche]
      k = k == null ? 1 : k;
      if (BATI && nom) { const ic = BATI.couche(nom); return [BATI.couleur(nom, hex, k), ic]; }
      if (texPierre && nom === 'pierre') { const c = lin(hex), r = lin(REF_PIERRE); return [[c[0] / r[0] * k, c[1] / r[1] * k, c[2] / r[2] * k], 1]; }
      return [lin(hex, k), 0];
    }
    // une face de pierre texturée (uv en mètres / 3) : a, b, c, d comme Lot.quad ; u0, u1 le long, v0, v1 en hauteur (m)
    function quadPierre(Lp, a, b, c, d, nom, hex, k, u0, u1, v0, v1, kh) {
      const [col, ic] = pierreAttr(nom, hex, k), ch = kh ? pierreAttr(nom, hex, k * kh)[0] : col;
      Lp.quad(a, b, c, d, col, [u0 / 3, v0 / 3, u1 / 3, v1 / 3], ic, ch);
    }
    function boitePierre(Lp, R, x0, x1, y0, y1, z0, z1, nom, hex, k, sans) { // une boîte de pierre, texture calée en mètres
      const P = (x, y, z) => R.pt(x, y, z), w = x1 - x0, dd = z1 - z0; sans = sans || 'b';
      if (!sans.includes('f')) quadPierre(Lp, P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), nom, hex, k, 0, w, y0, y1);
      if (!sans.includes('d')) quadPierre(Lp, P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), nom, hex, k * 0.92, 0, w, y0, y1);
      if (!sans.includes('g')) quadPierre(Lp, P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), nom, hex, k * 0.96, 0, dd, y0, y1);
      if (!sans.includes('r')) quadPierre(Lp, P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), nom, hex, k * 0.96, 0, dd, y0, y1);
      if (!sans.includes('h')) quadPierre(Lp, P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0), nom, hex, k * 1.04, 0, w, 0, dd);
    }

    // ─── les cellules de l'atlas du décor (selon les besoins du plan) ───
    const CELL = new Map(); // nom → { peintre, w, h, o }
    const cellule = (nom, peintre, w, h, o) => { if (!CELL.has(nom)) CELL.set(nom, { nom, peintre, w, h, o }); return nom; };
    cellule('drapeau-fr', 'drapeauFr', 240, 160); cellule('drapeau-ue', 'drapeauUe', 240, 160);
    const mesure = (() => { let c = null; return (txt, police, px) => { if (!c) c = document.createElement('canvas').getContext('2d'); c.font = `bold ${px}px ${police}`; return c.measureText(txt).width; }; })();
    const celBandeau = (texte, o) => { const nom = 'bandeau|' + (o.style || '') + '|' + texte, h = 72, w = Math.min(1000, Math.max(h * 3, mesure(texte, o.police || SANS, h * 0.62) + h * (o.tricolore ? 1.5 : 0.95))); return cellule(nom, 'bandeau', w, h, Object.assign({ texte }, o)); };
    // une enseigne : PTEXTURES.enseigne (pages partagées) si possible, sinon un bandeau de l'atlas → { ratio, get() → { tex, uv } | { cel } } ;
    // la page est redemandée à chaque construction (get) : après PTEXTURES.vider() (changement de qualité), rien ne reste périmé
    function paresseux(f, repli) {
      let r0 = null; if (T) { try { r0 = f(); } catch (e) { signaler('PTEXTURES', e); } }
      if (r0 && r0.texture) return { ratio: r0.ratio, get: () => { try { const r = f(); if (r && r.texture) return { tex: r.texture, uv: r.uv }; } catch (e) { /* rien */ } return { tex: null, cel: null }; } };
      const nom = repli(); if (!nom) return null; const c = CELL.get(nom); return { cel: nom, ratio: c.w / c.h };
    }
    const enseigne = (texte, type) => paresseux(() => T.enseigne(texte, STYLE_ENS[type] || type), () => celBandeau(texte, { fond: '#2E3F4A', encre: '#F3EBD9', bord: '#B8A06A', police: SERIF, style: 'repli' }));
    const plaqueRue = (nom) => paresseux(() => T.plaqueRue(nom), () => cellule('plaque|' + nom, 'plaque', Math.max(160, mesure(nom.toUpperCase(), ETROITE, 30) * 0.9 + 60), 60, { texte: nom }));
    const DETAILS = () => (T && T.details ? T.details() : null);

    // ═══════════════════════════════ les modèles (dessinés dans des repères) ═══════════════════════════════
    // la devanture d'un commerce, repère R au pied de la façade (x vers la droite vu de la rue, z dehors) : vitrines et porte (atlas
    // des ouvertures), pilastres, bandeau d'enseigne en corniche, store rayé ; W de large
    // les travées d'une devanture de W m : « vitrine » (1,6 m) et « vitrine-porte » (1,05 m), étirées pour remplir la largeur → [[nom, x0, x1]], xPorte
    function baies(W, porte, dab) {
      const Wi = W - 0.36, nV = Math.max(1, Math.round((Wi - 1.05) / 1.6)), k = Wi / (1.05 + nV * 1.6), noms = [], l = [];
      const avantPorte = porte === 'gauche' ? 0 : porte === 'droite' ? nV : Math.ceil(nV / 2);
      for (let i = 0; i < nV; i++) { if (i === avantPorte) noms.push('vitrine-porte'); noms.push(dab && i === nV - 1 ? 'dab' : 'vitrine'); } if (avantPorte >= nV) noms.push('vitrine-porte');
      let x = -Wi / 2, xPorte = 0; for (const nom of noms) { const w = (nom === 'vitrine-porte' ? 1.05 : 1.6) * k; if (nom === 'vitrine-porte') xPorte = x + w / 2; l.push([nom, x, x + w]); x += w; }
      return { l, xPorte };
    }
    function dessinerDevanture(lots, q, R, W, o) {
      const S = lots.solides, cad = lin(o.cadre), cadH = lin(o.cadre, 1.18), D = DETAILS(), ys = 2.72;
      for (const [nom, x, x1] of baies(W, o.porte, o.dab).l) {
        const w = x1 - x;
        if (nom === 'dab') { // un trumeau de pierre et le distributeur encastré
          boite(S, R, x, x + w, -0.3, 2.72, 0, 0.05, lin('#CFC6B6'), 'db'); const c = lots.cel('dab'); panneau(lots.atlas, R, x + w / 2 - 0.3, x + w / 2 + 0.3, 0.95, 1.8, 0.055, [1, 1, 1], c);
          boite(S, R, x + w / 2 - 0.36, x + w / 2 + 0.36, 1.83, 1.9, 0, 0.2, lin('#8E959A'), 'd');
        } else if (D && D.cellules[nom]) { const c = D.cellules[nom]; panneau(lots.details, R, x, x + w, -0.02, 2.7, 0.07, [1, 1, 1], c.uv); }
        else { boite(S, R, x, x + w, -0.3, 2.7, 0, 0.07, cad, 'db'); panneau(S, R, x + 0.08, x + w - 0.08, nom === 'vitrine' ? 0.55 : 0.05, 2.6, 0.075, lin('#3E5468'), null, 0, lin('#8FA7BC')); }
        if (o.interieur && nom === 'vitrine') panneau(lots.atlas, R, x + w * 0.05, x + w * 0.95, 0.574, 2.62, 0.078, [1, 1, 1], lots.cel(o.interieur)); // la glace de l'atlas (1,6 × 2,7 m : marges 8 cm, soubassement 55 cm)
      }
      // pilastres, corniche (le bandeau de l'enseigne), moulure ; seuil
      boite(S, R, -W / 2, -W / 2 + 0.18, -0.3, ys, 0, 0.14, cad, 'db', cadH); boite(S, R, W / 2 - 0.18, W / 2, -0.3, ys, 0, 0.14, cad, 'db', cadH);
      boite(S, R, -W / 2 - 0.06, W / 2 + 0.06, ys, ys + 0.64, 0, 0.17, cad, 'd', cadH); boite(S, R, -W / 2 - 0.12, W / 2 + 0.12, ys + 0.64, ys + 0.73, 0, 0.23, cadH, 'd');
      boite(S, R, -W / 2 + 0.18, W / 2 - 0.18, -0.3, 0.03, 0, 0.09, lin('#B9B0A2'), 'db');
      if (o.ens) { // l'enseigne sur la corniche (h ≤ 0,5 m, largeur ≤ W)
        let h = 0.5, w = h * o.ens.ratio; if (w > W - 0.08) { w = W - 0.08; h = w / o.ens.ratio; }
        const y0 = ys + 0.32 - h / 2; quadEns(lots, o.ens, R, -w / 2, w / 2, y0, y0 + h, 0.175);
      }
      if (o.presse) { const r = o.presse; let h = 0.26, w = h * r.ratio; if (w > W * 0.7) { w = W * 0.7; h = w / r.ratio; } quadEns(lots, r, R, -w / 2, w / 2, 2.32, 2.32 + h, 0.09); } // « PRESSE » en haut de la vitrine
      if (o.toile) dessinerStore(lots, R, -W / 2 - 0.05, W / 2 + 0.05, ys - 0.05, o.toile, q);
    }
    function quadEns(lots, r0, R, x0, x1, y0, y1, z) { // une enseigne ou une plaque : page PTEXTURES ou cellule de l'atlas du décor
      const r = r0.get ? r0.get() : r0;
      if (r.tex) { let l = lots.pages.get(r.tex); if (!l) { l = new Lot(); lots.pages.set(r.tex, l); } panneau(l, R, x0, x1, y0, y1, z, [1, 1, 1], r.uv); }
      else if (r.cel) panneau(lots.atlas, R, x0, x1, y0, y1, z, [1, 1, 1], lots.cel(r.cel));
    }
    function dessinerStore(lots, R, x0, x1, yh, toile, q) { // le store : coffre, toile inclinée (tranches de 2 m = 8 bandes de 25 cm), lambrequin festonné
      const A = lots.atlas, ct = lots.cel('toile-' + toile), cl = lots.cel('lambrequin-' + toile), prof = 1.15, yb = yh - 0.5, hl = 0.24, z0 = 0.2, zb = z0 + prof;
      boite(lots.solides, R, x0, x1, yh - 0.02, yh + 0.12, 0, z0 + 0.02, lin('#3A3A3C'), 'd');
      for (let x = x0; x < x1 - 0.05; x += 2) {
        const xe = Math.min(x1, x + 2), f = (xe - x) / 2, ut = [ct[0], ct[1], ct[0] + (ct[2] - ct[0]) * f, ct[3]], ul = [cl[0], cl[1], cl[0] + (cl[2] - cl[0]) * f, cl[3]];
        A.quad(R.pt(x, yb, zb), R.pt(xe, yb, zb), R.pt(xe, yh, z0), R.pt(x, yh, z0), [1, 1, 1], ut, 0, [0.82, 0.82, 0.82]);
        A.quad(R.pt(x, yb - hl, zb), R.pt(xe, yb - hl, zb), R.pt(xe, yb, zb), R.pt(x, yb, zb), [1, 1, 1], ul);
      }
      cylindre(lots.solides, R, [x0, yb + 0.01, zb - 0.02], [x1, yb + 0.01, zb - 0.02], 0.025, 0.025, 4, lin('#3A3A3C'));
      for (const xb of [x0 + 0.05, x1 - 0.05]) cylindre(lots.solides, R, [xb, yh - 0.6, 0.02], [xb, yb + 0.02, zb - 0.05], 0.015, 0.015, 4, lin('#3A3A3C'));
    }
    // une lanterne murale ancienne (fer noir, verre ambré) : platine, potence et jambe de force, lanterne pendue ; R au mur, y = la potence
    function dessinerLanterne(lots, q, R) {
      const S = lots.solides, fer = lin('#1C1B1E'), ferH = lin('#3A383C'), verre = lin('#F0D898'), verreB = lin('#C9A659'), fin = q.fin;
      boite(S, R, -0.06, 0.06, -0.2, 0.1, 0, 0.03, fer, 'd');
      boite(S, R, -0.018, 0.018, 0, 0.035, 0.02, 0.6, fer, 'd', ferH);
      if (fin) cylindre(S, R, [0, -0.17, 0.03], [0, -0.005, 0.36], 0.011, 0.011, 3, fer);
      const zc = 0.52, yt = -0.08; if (fin) cylindre(S, R, [0, 0, zc], [0, yt, zc], 0.008, 0.008, 3, fer);
      pyramide(S, R, 0, yt - 0.11, zc, 0.34, 0.34, 0.11, fer, false, ferH); // chapeau
      if (fin) cylindre(S, R, [0, yt - 0.005, zc], [0, yt + 0.04, zc], 0.025, 0.004, 4, ferH);
      tronc(S, R, 0, yt - 0.48, yt - 0.11, zc, 0.18, 0.18, 0.28, 0.28, fer, ferH, 'h'); // le corps, plus large en haut : un cadre sombre…
      { // … et ses quatre vitres ambrées, posées sur les faces sans couvrir les montants d'angle
        const y0 = yt - 0.48, y1 = yt - 0.11, b = [[-0.09, 0.09], [0.09, 0.09], [0.09, -0.09], [-0.09, -0.09]], h = [[-0.14, 0.14], [0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]], k = fin ? 0.13 : 0;
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4, P = [[b[i], y0], [b[j], y0], [h[j], y1], [h[i], y1]].map(([c, y]) => [c[0], y, c[1]]), cx = (P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, cy = (y0 + y1) / 2, cz = (P[0][2] + P[1][2] + P[2][2] + P[3][2]) / 4;
          const nx = (b[i][0] + b[j][0]) / 2, nz = (b[i][1] + b[j][1]) / 2, nl = Math.hypot(nx, nz), Q = P.map((v) => R.pt(v[0] + (cx - v[0]) * k + nx / nl * 0.004, v[1] + (cy - v[1]) * k * 0.6, zc + v[2] + (cz - v[2]) * k + nz / nl * 0.004));
          S.quad(Q[0], Q[1], Q[2], Q[3], verreB, null, 0, verre);
        }
      }
      if (fin) boite(S, R, -0.11, 0.11, yt - 0.52, yt - 0.48, zc - 0.11, zc + 0.11, fer); // le culot
      pyramide(S, R, 0, fin ? yt - 0.52 : yt - 0.48, zc, fin ? 0.1 : 0.18, fin ? 0.1 : 0.18, -0.08, fer, true);
    }
    // un banc public : pieds de fonte, lattes de chêne ; repère au sol, l'assis regarde vers +Z
    function dessinerBanc(lots, q, R) {
      const S = lots.solides, fonte = lin('#26292B'), bois = lin('#8E6238'), boisH = lin('#A87648');
      for (const x of [-0.72, 0.72]) {
        boite(S, R, x - 0.03, x + 0.03, -0.1, 0.44, 0.13, 0.19, fonte); boite(S, R, x - 0.03, x + 0.03, -0.1, 0.86, -0.22, -0.16, fonte);
        boite(S, R, x - 0.03, x + 0.03, 0.38, 0.43, -0.2, 0.2, fonte, 'b');
      }
      for (const z of [-0.12, 0.0, 0.12]) boite(S, R, -0.9, 0.9, 0.43, 0.47, z - 0.05, z + 0.05, bois, 'b', boisH);
      for (const y of [0.56, 0.71]) boite(S, R, -0.9, 0.9, y, y + 0.1, -0.215, -0.185, bois, 'b', boisH);
      if (q.fin) boite(S, R, -0.9, 0.9, 0.8, 0.84, -0.215, -0.185, bois, 'b', boisH);
    }
    function dessinerTable(lots, q, R, plateau) { // un guéridon de bistrot : plateau rond, pied colonne, embase
      const S = lots.solides, fonte = lin('#202224'), n = q.seg;
      cylindre(S, R, [0, 0.715, 0], [0, 0.745, 0], 0.31, 0.31, n + 2, lin(plateau, 0.85), 'b', lin(plateau));
      cylindre(S, R, [0, 0.02, 0], [0, 0.715, 0], 0.028, 0.028, 5, fonte);
      cylindre(S, R, [0, 0.0, 0], [0, 0.035, 0], 0.2, 0.17, n, fonte, 'b');
    }
    function dessinerChaise(lots, q, R, cadre, assise) { // une chaise de bistrot (cadre et dossier cintré, assise tressée) ; regarde vers +Z
      const S = lots.solides, c = lin(cadre), a = lin(assise), aH = lin(assise, 1.15);
      boite(S, R, -0.2, 0.2, 0.43, 0.47, -0.19, 0.2, a, 'b', aH);
      if (q.fin) { for (const [x, z] of [[-0.17, 0.17], [0.17, 0.17]]) boite(S, R, x - 0.015, x + 0.015, 0, 0.43, z - 0.015, z + 0.015, c, 'bh'); for (const x of [-0.17, 0.17]) boite(S, R, x - 0.015, x + 0.015, 0, 0.88, -0.2, -0.17, c, 'b'); }
      else { boite(S, R, -0.18, 0.18, 0, 0.43, 0.15, 0.18, c, 'bh'); boite(S, R, -0.18, 0.18, 0, 0.88, -0.2, -0.17, c, 'b'); }
      boite(S, R, -0.18, 0.18, 0.66, 0.84, -0.205, -0.17, a, 'b', aH);
    }
    function dessinerParasol(lots, q, R, c1, c2, r) { // un parasol de terrasse : mât, toile à 8 pans alternés, lambrequin
      r = r || 1.25; const S = lots.solides, n = 8, yr = 2.08, ya = 2.08 + r * 0.34, A = R.pt(0, ya, 0), b1 = lin(c1), b2 = lin(c2), dessous = lin(c2, 0.62);
      cylindre(S, R, [0, 0, 0], [0, ya + 0.12, 0], 0.022, 0.022, 5, lin('#D9D2C4'));
      const bord = []; for (let k = 0; k < n; k++) { const t = (k + 0.5) / n * TAU; bord.push([Math.cos(t) * r, Math.sin(t) * r]); }
      for (let k = 0; k < n; k++) {
        const a = bord[k], b = bord[(k + 1) % n], col = k % 2 ? b2 : b1, pa = R.pt(a[0], yr, a[1]), pb = R.pt(b[0], yr, b[1]);
        S.tri(pa, A, pb, col); S.tri(pa, pb, A, dessous);
        S.quad(R.pt(a[0], yr - 0.16, a[1]), R.pt(b[0], yr - 0.16, b[1]), pb, pa, col); S.quad(R.pt(b[0], yr - 0.16, b[1]), R.pt(a[0], yr - 0.16, a[1]), pa, pb, dessous);
      }
    }
    function dessinerPot(lots, q, R, x, z, h) { // un pot de terre cuite et sa boule de buis
      const S = lots.solides, tc = lin('#B4643F'), tcH = lin('#C97A50');
      cylindre(S, R, [x, -0.05, z], [x, h, z], 0.18, 0.24, q.seg, tc, '', tcH); cylindre(S, R, [x, h, z], [x, h + 0.04, z], 0.255, 0.255, q.seg, tcH, 'b');
      const c = lots.cel('buisson'), s = h * 1.35; panneau(lots.atlas, R, x - s / 2, x + s / 2, h - 0.05, h - 0.05 + s, z, [1, 1, 1], c);
      const p = R.pt(x, 0, z), R3 = new Rep(p[0], R.oy, p[2], -R.xz, R.xx); panneau(lots.atlas, R3, -s / 2, s / 2, h - 0.05, h - 0.05 + s, 0, [1, 1, 1], c); // deux panneaux croisés
    }
    function dessinerDrapeau(lots, q, R, base, dir, cel) { // hampe inclinée de base (local) vers dir (unitaire, local), drapeau pendu le long de la hampe
      const S = lots.solides, A = lots.atlas, lh = 2.6, bout = [base[0] + dir[0] * lh, base[1] + dir[1] * lh, base[2] + dir[2] * lh];
      cylindre(S, R, base, bout, 0.024, 0.02, 5, lin('#E9E4DA')); cylindre(S, R, bout, [bout[0] + dir[0] * 0.13, bout[1] + dir[1] * 0.13, bout[2] + dir[2] * 0.13], 0.035, 0.002, 5, lin('#C9A33D'), 'a');
      const ni = q.fin ? 6 : 3, nj = q.fin ? 4 : 2, s0 = 0.95, s1 = 2.5, chute = 1.02, uv = lots.cel(cel);
      const P = (i, j) => { const s = s0 + (s1 - s0) * i / ni; return R.pt(base[0] + dir[0] * s, base[1] + dir[1] * s - chute * j / nj - 0.03, base[2] + dir[2] * s); };
      const dw = R.dir(dir[0], 0, dir[2]), nl = Math.hypot(dw[0], dw[2]) || 1, N = [-dw[2] / nl, 0, dw[0] / nl]; // la normale de la toile (horizontale)
      for (let i = 0; i < ni; i++) for (let j = 0; j < nj; j++) {
        const pts = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]];
        const sm = pts.map(([a, b]) => [P(a, b), uv[0] + (uv[2] - uv[0]) * (b / nj), uv[1] + (uv[3] - uv[1]) * (a / ni), 0.13 * Math.pow(b / nj, 1.3) + 0.02 * (a / ni) * (b / nj)]);
        for (const k of [0, 1, 2, 0, 2, 3]) A.s(sm[k][0], N, [1, 1, 1], sm[k][1], sm[k][2], sm[k][3]);
      }
    }

    // ═══════════════════════════════ le plan : bâtiments remarquables (carte.enseignes) ═══════════════════════════════
    const NOTES = { terrasses: 0, tables: 0, drapeaux: 0, devantures: 0, enseignes: 0, plaquesNom: 0, lanternes: 0, fenetres: 0, pots: 0, bancs: 0, plaquesRue: 0, mobilier: 0, murs: 0, voutes: 0, terrassesRefusees: [] };
    const minSol = (f, s0, s1) => Math.min(f.sol(s0), f.sol((s0 + s1) / 2), f.sol(s1));
    function remarquer(quoi, n, f, s, y, plus) { remarquables.push(Object.assign({ quoi, n, x: +f.x(s).toFixed(2), y: +y.toFixed(2), z: +f.z(s).toFixed(2), nx: +f.nx.toFixed(3), nz: +f.nz.toFixed(3) }, plus)); }
    function placerDevanture(f, e, bc, o) { // → { s, W, g } ou null
      let W = Math.min(f.len - 0.6, o.largeur || 4.4); if (W < 1.9) return null;
      let s = borne(f.s, W / 2 + 0.3, f.len - W / 2 - 0.3);
      for (let k = 0; k < 6 && !libreSur(f, s - W / 2, s + W / 2); k++) { W = Math.max(1.9, W - 0.6); s = borne(f.s + (k % 2 ? -1 : 1) * (k + 1) * 0.7, W / 2 + 0.3, f.len - W / 2 - 0.3); }
      if (!libreSur(f, s - W / 2, s + W / 2)) return null;
      const g = minSol(f, s - W / 2, s + W / 2), haut = f.b.sommet - g; if (haut < 3.9) return null;
      reserver(f, s - W / 2 - 0.1, s + W / 2 + 0.1, o.quoi || 'devanture', bc); NOTES.devantures++;
      return { s, W, g };
    }
    function devanture(f, e, bc, type, o) {
      o = Object.assign({ quoi: type }, o || {}); const st = BOUTIQUES[type] || BOUTIQUES.commerce, dv = placerDevanture(f, e, bc, o); if (!dv) return null;
      const ens = o.ens || enseigne(e.n, type), opt = { cadre: o.cadre || st[0], toile: o.toile !== undefined ? o.toile : st[1], ens, porte: o.porte, dab: o.dab, presse: o.presse };
      opt.xPorte = baies(dv.W, opt.porte, opt.dab).xPorte;
      if (opt.toile) cellule('toile-' + opt.toile, 'toile', 256, 128, { toile: opt.toile }), cellule('lambrequin-' + opt.toile, 'lambrequin', 256, 44, { toile: opt.toile });
      if (opt.dab) cellule('dab', 'dab', 120, 168);
      if (INTERIEURS[type]) opt.interieur = cellule('interieur-' + INTERIEURS[type], 'interieur', 120, 172, { genre: INTERIEURS[type] });
      ordre('devanture', (lots, q) => dessinerDevanture(lots, q, f.rep(dv.s, dv.g), dv.W, opt), f.x(dv.s), f.z(dv.s));
      NOTES.enseignes++; remarquer(type, e.n, f, dv.s, dv.g, opt.interieur ? { interieur: INTERIEURS[type] } : null); dv.opt = opt;
      if (Math.hypot(f.x(dv.s) - PC[0], f.z(dv.s) - PC[1]) < 75 && !TERRASSES[type]) pots(f, dv, bc); // des pots de part et d'autre, près de la place
      return dv;
    }
    function pots(f, dv, bc) {
      const l = [];
      for (const sg of [-1, 1]) { const s = dv.s + sg * (dv.W / 2 + 0.38); if (s < 0.35 || s > f.len - 0.35 || !libreSur(f, s - 0.25, s + 0.25, 0)) continue; const x = f.x(s, 0.4), z = f.z(s, 0.4); if (distRue(x, z) < -0.6 || dansBat(x, z) >= 0) continue; l.push(-sg * (dv.W / 2 + 0.38)); reserver(f, s - 0.3, s + 0.3, 'pot', bc); }
      if (!l.length) return; NOTES.pots += l.length; cellule('buisson', 'buisson', 128, 128);
      ordre('pots', (lots, q) => { const R = f.rep(dv.s, dv.g); for (const x of l) dessinerPot(lots, q, R, x, 0.42, 0.42); }, f.x(dv.s), f.z(dv.s));
    }
    function terrasse(f0, dv0, type, bc, nom) { // 3–4 guéridons, chaises tournées vers la rue, un parasol hors du store (choix de style) ; devant la devanture,
      // sinon devant une autre façade libre du même bâtiment (une terrasse ne se pose jamais en pleine chaussée)
      const refus = { facade: 0, bati: 0, rue: 0, arbre: 0, voisin: 0, banc: 0 };
      const chercher = (f, s0, W, porte, avecPorte, rangs) => {
        const cand = [], xs = []; for (let x = -W / 2 - 3.2; x <= W / 2 + 3.2; x += 0.35) xs.push(x);
        const essai = (x, z, tol) => { // x local (vers la droite vu de la rue), z dehors ; la table et ses chaises tiennent hors des bâtiments et presque hors de la chaussée
          const s = s0 - x; if (s < -3 || s > f.len + 3) { refus.facade++; return false; }
          if (s < 0.5 || s > f.len - 0.5) { const px = f.x(s, z), pz = f.z(s, z); if (segsReserves.some((g) => g[5] !== f.cle && d2Seg(px, pz, g[0], g[1], g[2], g[3]) < 2.6)) { refus.voisin++; return false; } } // devant le voisin, mais pas devant sa devanture
          for (const [dx, dz] of [[0, 0], [-0.55, -0.45], [0.55, -0.45], [-0.45, 0.3], [0.45, 0.3]]) { const px = f.x(s - dx, z + dz), pz = f.z(s - dx, z + dz); if (dansBat(px, pz) >= 0) { refus.bati++; return false; } if (distRue(px, pz) < -tol) { refus.rue++; return false; } if (presArbre(px, pz, 0.35)) { refus.arbre++; return false; } if (presBanc(px, pz, 0.35)) { refus.banc++; return false; } }
          if ((spans.get(f.cle) || []).some(([a, b, quoi]) => quoi !== type && s > a - 0.6 && s < b + 0.6)) { refus.voisin++; return false; } return true;
        };
        const vis = (x, z, tol) => { const px = f.x(s0 - x, z + 0.6), pz = f.z(s0 - x, z + 0.6); return dansBat(px, pz) < 0 && distRue(px, pz) >= -tol && !presArbre(px, pz, 0.35) && !presBanc(px, pz, 0.35); }; // la chaise d'en face tient-elle ?
        for (const [z, tol] of rangs || [[1.15, 0.5], [2.75, 0.5], [1.05, 1.7], [2.6, 1.4], [0.92, 2.4]]) for (const x of xs) if ((!avecPorte || Math.abs(x - porte) > 0.75) && essai(x, z, tol)) cand.push([x, z, Math.abs(x - porte) + (z > 2 ? 0.8 : 0) + tol, vis(x, z, tol)]);
        cand.sort((a, b) => a[2] - b[2]); const pris = [];
        for (const c of cand) { if (pris.length >= 4) break; if (pris.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) > 1.75)) pris.push(c); }
        return pris;
      };
      let f = f0, dv = dv0, pris = chercher(f0, dv0.s, dv0.W, dv0.opt.xPorte || 0, true), ailleurs = false;
      if (pris.length < 2) { // une autre façade du bâtiment, libre, qui regarde une rue ou la place
        const b = f0.b; let best = null;
        for (let i = 0; i < b.p.length; i++) {
          if (i === f0.i) continue; const f2 = new Facade(f0.bi, i); if (f2.len < 4 || f2.mitoyenne(f2.len / 2)) continue; const r = rueProche(f2.x(f2.len / 2, 4), f2.z(f2.len / 2, 4)); if (!r || r.d > 9) continue;
          const g2 = minSol(f2, f2.len * 0.2, f2.len * 0.8), p2 = chercher(f2, f2.len / 2, Math.min(f2.len - 1, 4), 0, false); if (p2.length >= 2 && (!best || p2.length > best.pris.length)) best = { f: f2, pris: p2, dv: { s: f2.len / 2, W: Math.min(f2.len - 1, 4), g: g2, opt: dv0.opt } };
        }
        if (best) { f = best.f; dv = best.dv; pris = best.pris; ailleurs = true; }
      }
      if (pris.length < 2) { pris = chercher(f0, dv0.s, dv0.W, 0, false, [[5.2, 0.2], [6.8, 0.2], [8.4, 0.2]]); if (pris.length >= 2) ailleurs = true; } // de l'autre côté de la rue, sur la place
      if (pris.length < 2) { NOTES.terrassesRefusees.push((nom || type) + ' ' + JSON.stringify(refus)); return; }
      NOTES.terrasses++; NOTES.tables += pris.length;
      const sty = hash(type + f.cle), plateau = ['#E8E2D6', '#2F3A33', '#C9B89C'][sty % 3], cadre = ['#3B5B45', '#2A2A2A', '#6E4B2E'][(sty >>> 3) % 3], assise = ['#B98D52', '#C9A26A', '#8C3A2E', '#2F4A6E'][(sty >>> 5) % 4];
      const toile = TOILES[dv.opt.toile || 'bordeaux'], para = pris.slice().sort((a, b) => (Math.abs(b[0]) - dv.W / 2 + b[1]) - (Math.abs(a[0]) - dv.W / 2 + a[1]))[0];
      const avecParasol = ailleurs || Math.abs(para[0]) > dv.W / 2 + 0.35 || para[1] > 2.3, rPara = ailleurs || para[1] > 2.3 ? 1.25 : borne(para[1] - 0.05, 0.85, 1.25); // contre le mur : un parasol plus petit
      ordre('terrasse', (lots, q) => {
        const R0 = f.rep(dv.s, dv.g);
        pris.forEach((c, i) => {
          if (i >= q.tables) return; const p = R0.pt(c[0], 0, c[1]), y = H0(p[0], p[2]), Rt = new Rep(p[0], y, p[2], R0.xx, R0.xz); dessinerTable(lots, q, Rt, plateau);
          const chaises = [[-0.42, -0.5, 0], [0.42, -0.5, 0], [0, 0.6, Math.PI]].slice(0, c[3] ? q.chaises : 2);
          for (const [dx, dz, rot] of chaises) { const pc = Rt.pt(dx, 0, dz), ang = Math.atan2(Rt.xz, Rt.xx) + rot + (dx ? -dx * 0.25 : 0), Rc = new Rep(pc[0], H0(pc[0], pc[2]), pc[2], Math.cos(ang), Math.sin(ang)); dessinerChaise(lots, q, Rc, cadre, assise); }
          if (avecParasol && c === para) dessinerParasol(lots, q, Rt, toile[1], toile[0], rPara);
        });
      }, f.x(dv.s), f.z(dv.s));
      remarquer('terrasse', nom || type, f, dv.s, dv.g, { tables: pris.length, parasol: avecParasol });
    }
    function inscription(f, e, bc, type, o) { // une plaque ou une inscription au nom (écoles, gendarmerie, santé, bureaux)
      o = o || {}; const ens = o.ens || enseigne(e.n, type); let wMax = Math.min(f.len - 0.5, o.wMax || 6), h = o.h || 0.45, w = h * ens.ratio; if (w > wMax) { w = wMax; h = w / ens.ratio; }
      let s = borne(f.s, w / 2 + 0.25, f.len - w / 2 - 0.25); if (f.len < w + 0.5) s = f.len / 2;
      const g = minSol(f, s - w / 2, s + w / 2), y = Math.min(f.b.sommet - g - h - 0.4, o.y || 2.9); if (y < 1.6) return null;
      reserver(f, s - w / 2, s + w / 2, type, bc); NOTES.plaquesNom++;
      ordre('inscription', (lots, q) => { const R = f.rep(s, g); quadEns(lots, ens, R, -w / 2, w / 2, y, y + h, 0.06); boite(lots.solides, R, -w / 2 - 0.03, w / 2 + 0.03, y - 0.03, y + h + 0.03, 0, 0.05, lin('#5A5650'), 'd'); }, f.x(s), f.z(s));
      remarquer(type, e.n, f, s, g); return { s, g, w, h, y };
    }
    function mairie(f, e, bc) { // l'hôtel de ville : entrée au milieu de la façade (choix de style), perron, porte, MAIRIE, trois drapeaux, horloge
      const s = f.len / 2, g = Math.min(f.sol(s - 1.7), f.sol(s), f.sol(s + 1.7)), haut = f.b.sommet - g; if (f.len < 4 || haut < 5) return;
      reserver(f, s - 1.9, s + 1.9, 'mairie', bc); cellule('mairie', 'lettres', 620, 116, { texte: 'MAIRIE' }); NOTES.drapeaux += 3;
      const yc = Math.min(haut - 1.35, Math.max(6.2, haut * 0.62)), avecHorloge = haut > 7.5;
      ordre('mairie', (lots, q) => {
        const R = f.rep(s, g), Lp = lots.pierre, pierre = '#D8CFBE', D = DETAILS();
        // le perron : deux marches de pierre de taille
        boitePierre(Lp, R, -1.65, 1.65, -0.35, 0.16, 0, 0.8, 'taille', pierre, 0.98); boitePierre(Lp, R, -1.35, 1.35, 0.16, 0.32, 0, 0.42, 'taille', pierre, 1.02);
        // la porte (porte ancienne de l'atlas, agrandie) et son encadrement
        if (D && D.cellules['porte-ancienne']) panneau(lots.details, R, -0.82, 0.82, 0.32, 3.32, 0.08, [1, 1, 1], D.cellules['porte-ancienne'].uv);
        else { boite(lots.solides, R, -0.8, 0.8, 0.32, 3.1, 0, 0.05, lin('#5C3B24'), 'db'); }
        boitePierre(Lp, R, -1.05, 1.05, 3.32, 3.48, 0, 0.12, 'taille', pierre, 1.05);
        panneau(lots.atlas, R, -1.45, 1.45, 3.56, 4.1, 0.07, [1, 1, 1], lots.cel('mairie')); // MAIRIE, lettres sur entretoises
        // les trois hampes en éventail sur une platine : tricolore, Europe, tricolore
        const yb = 4.5; boite(lots.solides, R, -0.42, 0.42, yb - 0.12, yb + 0.12, 0, 0.06, lin('#2B2B2D'), 'd');
        const el = 0.6, ce = Math.cos(el), se = Math.sin(el);
        [[-0.36, -0.62, 'drapeau-fr'], [0, 0, 'drapeau-ue'], [0.36, 0.62, 'drapeau-fr']].forEach(([x, az, cel]) => dessinerDrapeau(lots, q, R, [x, yb, 0.08], [Math.sin(az) * ce, se, Math.cos(az) * ce], cel));
        // l'horloge sur un disque de pierre, au milieu de la façade
        if (avecHorloge) {
          const n = 14, rp = 0.78, P = (a, r, z) => R.pt(Math.cos(a) * r, yc + Math.sin(a) * r, z), [cp, ic] = pierreAttr('taille', pierre, 1.03);
          for (let k = 0; k < n; k++) { const a0 = k / n * TAU, a1 = (k + 1) / n * TAU; Lp.tri(P(a0, rp, 0.07), P(a1, rp, 0.07), P(0, 0, 0.07), cp, [0, 0, 0.1, 0, 0.05, 0.1], ic); Lp.quad(P(a0, rp, 0), P(a1, rp, 0), P(a1, rp, 0.07), P(a0, rp, 0.07), cp, [0, 0, 0.1, 0.02], ic); }
          if (D && D.cellules.horloge) panneau(lots.details, R, -0.62, 0.62, yc - 0.62, yc + 0.62, 0.085, [1, 1, 1], D.cellules.horloge.uv);
          else panneau(lots.atlas, R, -0.6, 0.6, yc - 0.6, yc + 0.6, 0.085, [1, 1, 1], lots.cel('horloge'));
        }
        dessinerPot(lots, q, R, -2.0, 0.45, 0.55); dessinerPot(lots, q, R, 2.0, 0.45, 0.55);
      }, f.x(s), f.z(s));
      if (!(T && T.details)) cellule('horloge', 'horloge', 160, 160); cellule('buisson', 'buisson', 128, 128);
      remarquer('mairie', e.n, f, s, g);
    }
    function tabac(f, e, bc) { // le bureau de tabac : devanture, « PRESSE », la carotte rouge en drapeau, le présentoir à journaux
      const presse = /presse/i.test(e.n) ? enseigne('Presse', 'presse') : null, dv = devanture(f, e, bc, 'tabac', { presse, porte: 'droite' }); if (!dv) return;
      const carotte = T && T.enseigne ? paresseux(() => T.enseigne('', 'carotte'), () => null) : null;
      const sc = dv.s + dv.W / 2 + 0.45 <= f.len - 0.3 ? dv.s + dv.W / 2 + 0.45 : dv.s - dv.W / 2 - 0.45, xr = dv.s - sc; // à côté de la devanture
      cellule('journaux', 'journaux', 160, 200);
      ordre('tabac', (lots, q) => {
        const R = f.rep(dv.s, dv.g), S = lots.solides, rouge = lin('#B81C26'), y0 = 2.95, hc = 1.0, wc = 0.55;
        // la potence et la carotte, perpendiculaire à la façade (un losange épais, la face imprimée des deux côtés)
        boite(S, R, xr - 0.05, xr + 0.05, y0 + hc - 0.05, y0 + hc + 0.12, 0, 0.04, lin('#222'), 'd'); boite(S, R, xr - 0.015, xr + 0.015, y0 + hc + 0.02, y0 + hc + 0.06, 0.02, 0.8, lin('#222'), 'd');
        const zc = 0.18 + wc / 2, Rc = new Rep(...R.pt(xr, 0, zc), R.xz, -R.xx); // repère de la carotte : X le long de la potence, Z le long de la façade
        Rc.oy = R.oy; const L4 = [[0, y0], [wc / 2, y0 + hc / 2], [0, y0 + hc], [-wc / 2, y0 + hc / 2]];
        for (let i = 0; i < 4; i++) { const a = L4[i], b = L4[(i + 1) % 4]; S.quad(Rc.pt(a[0], a[1], -0.045), Rc.pt(b[0], b[1], -0.045), Rc.pt(b[0], b[1], 0.045), Rc.pt(a[0], a[1], 0.045), rouge); }
        if (carotte) { for (const sg of [1, -1]) { const Rf = sg > 0 ? Rc : new Rep(Rc.ox, Rc.oy, Rc.oz, -Rc.xx, -Rc.xz); quadEns(lots, carotte, Rf, -wc / 2 - 0.01, wc / 2 + 0.01, y0 - 0.02, y0 + hc + 0.02, 0.047); } }
        else for (const sg of [1, -1]) { const Rf = sg > 0 ? Rc : new Rep(Rc.ox, Rc.oy, Rc.oz, -Rc.xx, -Rc.xz); S.tri(Rf.pt(0, y0, 0.046), Rf.pt(wc / 2, y0 + hc / 2, 0.046), Rf.pt(0, y0 + hc, 0.046), rouge); S.tri(Rf.pt(0, y0, 0.046), Rf.pt(0, y0 + hc, 0.046), Rf.pt(-wc / 2, y0 + hc / 2, 0.046), rouge); }
        // le présentoir à journaux, sur le trottoir contre la façade
        const xp = -dv.W / 2 + 0.55, Rp = R; boite(S, Rp, xp - 0.36, xp + 0.36, 0.0, 0.06, 0.18, 0.62, lin('#2A2C2E'));
        for (const sx of [-0.33, 0.33]) boite(S, Rp, xp + sx - 0.015, xp + sx + 0.015, 0.06, 1.3, 0.2, 0.24, lin('#2A2C2E'), 'b');
        const a = Rp.pt(xp - 0.34, 0.12, 0.6), b = Rp.pt(xp + 0.34, 0.12, 0.6), c = Rp.pt(xp + 0.34, 1.25, 0.26), d = Rp.pt(xp - 0.34, 1.25, 0.26); lots.atlas.quad(a, b, c, d, [1, 1, 1], lots.cel('journaux'));
      }, f.x(dv.s), f.z(dv.s));
    }
    function banque(f, e, bc) { // la banque : bandeau au nom en lettres (vert sombre générique, aucun logo), distributeur encastré
      const ens = { cel: celBandeau(e.n, { fond: '#1F4D3A', encre: '#F4F1E8', police: SANS, style: 'banque' }) }; ens.ratio = CELL.get(ens.cel).w / CELL.get(ens.cel).h;
      devanture(f, e, bc, 'banque', { ens, dab: true, porte: 'gauche' });
    }
    function poste(f, e, bc) { // La Poste : bandeau jaune en lettres (sans logo), boîte aux lettres jaune contre la façade
      const dv = devanture(f, e, bc, 'poste', { porte: 'gauche' }); if (!dv) return;
      const sb = dv.s - dv.W / 2 - 0.5 >= 0.4 ? dv.s - dv.W / 2 - 0.5 : dv.s + dv.W / 2 + 0.5; if (sb > f.len - 0.35) return; reserver(f, sb - 0.3, sb + 0.3, 'boite', bc);
      ordre('poste', (lots, q) => dessinerBoite(lots, q, f.rep(sb, dv.g), true), f.x(sb), f.z(sb));
    }
    function dessinerBoite(lots, q, R, murale) { // une boîte aux lettres jaune (couleur générique) : caisson, toit arrondi, fente
      const S = lots.solides, j = lin('#F2C318'), jH = lin('#F7D54A'), y0 = murale ? 1.0 : 0.95;
      if (!murale) cylindre(S, R, [0, -0.05, 0], [0, y0, 0], 0.045, 0.045, 6, lin('#3A3C3E'));
      boite(S, R, -0.21, 0.21, y0, y0 + 0.42, murale ? 0 : -0.15, murale ? 0.3 : 0.15, j, '', jH);
      cylindre(S, R, [-0.21, y0 + 0.42, murale ? 0.15 : 0], [0.21, y0 + 0.42, murale ? 0.15 : 0], 0.15, 0.15, q.fin ? 8 : 5, jH, 'ab');
      boite(S, R, -0.13, 0.13, y0 + 0.3, y0 + 0.33, murale ? 0.3 : 0.15, murale ? 0.31 : 0.16, lin('#1E1E1E'), 'b');
      boite(S, R, -0.09, 0.09, y0 + 0.1, y0 + 0.2, murale ? 0.3 : 0.15, murale ? 0.305 : 0.155, lin('#2E5BA0'), 'b');
    }
    function bar(f, e, bc, type) { const dv = devanture(f, e, bc, type, { porte: 'centre' }); if (dv) terrasse(f, dv, type, bc, e.n); }
    function gendarmerie(f, e, bc) { // bandeau « GENDARMERIE NATIONALE » (le nom OSM) et un drapeau tricolore
      const ens = { cel: celBandeau(e.n.toLocaleUpperCase('fr-FR'), { fond: '#1E3159', encre: '#FFFFFF', police: SANS, tricolore: true, style: 'gendarmerie' }) }; ens.ratio = CELL.get(ens.cel).w / CELL.get(ens.cel).h;
      const r = inscription(f, e, bc, 'gendarmerie', { ens, h: 0.42, y: 3.0, wMax: 4.2 }); if (!r) return; NOTES.drapeaux++;
      ordre('gendarmerie', (lots, q) => dessinerDrapeau(lots, q, f.rep(r.s, r.g), [r.w / 2 + 0.25, r.y + 0.2, 0.06], [0, Math.sin(0.62), Math.cos(0.62)], 'drapeau-fr'), f.x(r.s), f.z(r.s));
    }

    // les passages voûtés (carte.passages) : rien n'est posé sur leurs arcades, de part et d'autre (rendu.js y découpe les arcs)
    for (const ps of carte.passages || []) {
      try {
        if (!ps || !Array.isArray(ps.l) || ps.l.length < 2) continue; const w = fini(+ps.w) ? +ps.w : 3.2;
        for (let m = 0; m + 1 < ps.l.length; m++) {
          let [ax, az] = ps.l[m], [bx, bz] = ps.l[m + 1]; const dl = Math.hypot(bx - ax, bz - az) || 1, ex = (bx - ax) / dl * 3, ez = (bz - az) / dl * 3; ax -= ex; az -= ez; bx += ex; bz += ez;
          for (const bc of Array.isArray(ps.b) ? ps.b : []) {
            const k = versMonde[bc]; if (!(k >= 0)) continue; const P = BATS[k].p;
            for (let i = 0; i < P.length; i++) {
              const a = P[i], c = P[(i + 1) % P.length], fx = c[0] - a[0], fz = c[1] - a[1], den = (bx - ax) * fz - (bz - az) * fx; if (Math.abs(den) < 1e-9) continue;
              const t = ((a[0] - ax) * fz - (a[1] - az) * fx) / den, u = ((a[0] - ax) * (bz - az) - (a[1] - az) * (bx - ax)) / den; if (t < 0 || t > 1 || u < 0 || u > 1) continue;
              const f = new Facade(k, i), sv = u * f.len; reserver(f, sv - w / 2 - 0.6, sv + w / 2 + 0.6, 'voute', bc); NOTES.voutes++;
            }
          }
        }
      } catch (err) { signaler('passage', err); }
    }
    for (const e of carte.enseignes || []) {
      try {
        if (!e || !Number.isInteger(e.b) || !fini(+e.x) || !fini(+e.z)) continue; const b = bat(e.b); if (!b) continue;
        const yaw = fini(+e.yaw) ? +e.yaw : null, f = facadeDe(versMonde[e.b], +e.x, +e.z, yaw === null ? 0 : -Math.sin(yaw), yaw === null ? 0 : -Math.cos(yaw)); if (!f) continue;
        const t = String(e.t || 'commerce'), n = String(e.n || '').trim(); if (!n) continue; e.n = n;
        if (t === 'mairie') mairie(f, e, e.b);
        else if (t === 'tabac' || t === 'presse') tabac(f, e, e.b);
        else if (t === 'banque') banque(f, e, e.b);
        else if (t === 'poste') poste(f, e, e.b);
        else if (TERRASSES[t]) bar(f, e, e.b, t);
        else if (t === 'gendarmerie') gendarmerie(f, e, e.b);
        else if (t === 'ecole' || t === 'bibliotheque' || t === 'culture') inscription(f, e, e.b, t, { h: 0.55, y: 3.1, wMax: 8 });
        else if (t === 'sante' || (t === 'commerce' && b.t !== 'commerce')) inscription(f, e, e.b, t, { h: 0.4, y: 2.75, wMax: 4.5 });
        else if (!devanture(f, e, e.b, BOUTIQUES[t] ? t : 'commerce')) inscription(f, e, e.b, t, { h: 0.4, y: 2.75 });
      } catch (err) { signaler('enseigne ' + (e && e.n), err); }
    }

    // ═══════════════════════════════ le mobilier réel (OSM) ═══════════════════════════════
    function yawVersRue(x, z) { const r = rueProche(x, z); if (!r) return 0; const s = r.s, ex = s.bx - s.ax, ez = s.bz - s.az, l = ex * ex + ez * ez, t = l > 0 ? borne(((x - s.ax) * ex + (z - s.az) * ez) / l, 0, 1) : 0; return Math.atan2(-(s.ax + t * ex - x), -(s.az + t * ez - z)); }
    for (const m of carte.mobilier || []) {
      try {
        if (!m || !fini(+m.x) || !fini(+m.z)) continue; const x = +m.x, z = +m.z, yaw = fini(+m.yaw) ? +m.yaw : yawVersRue(x, z), t = String(m.t || ''), y = H0(x, z), R = repYaw(x, y, z, yaw), n = m.n ? String(m.n) : '';
        NOTES.mobilier++;
        if (t === 'boite') ordre('boite', (lots, q) => dessinerBoite(lots, q, R, false), x, z);
        else if (t === 'panneau') {
          const arret = /^poncin\b|\s-\s|arr[eê]t|gare/i.test(n) || !n, nomC = arret ? cellule('bus|' + n, 'bus', 200, 250, { texte: n || 'Arrêt' }) : cellule('info|' + n, 'info', 300, 210, { texte: n });
          ordre('panneau', (lots, q) => dessinerPanneau(lots, q, R, arret, nomC), x, z);
        } else if (t === 'croix') ordre('croix', (lots, q) => dessinerCroix(lots, q, R, hash(x + '|' + z)), x, z);
        else if (t === 'monument') { cellule('plaque-bronze', 'plaqueBronze', 160, 110); ordre('monument', (lots, q) => dessinerMonument(lots, q, R), x, z); }
        else if (t === 'poubelle') ordre('poubelle', (lots, q) => dessinerPoubelle(lots, q, R), x, z);
        else if (t === 'banc') ordre('banc', (lots, q) => dessinerBanc(lots, q, R), x, z);
        else if (t === 'lampadaire') ordre('lampadaire', (lots, q) => dessinerLampadaire(lots, q, R), x, z);
        else if (t === 'fontaine') ordre('fontaine', (lots, q) => dessinerFontaine(lots, q, R), x, z);
        else if (t === 'borne') ordre('borne', (lots, q) => { cylindre(lots.solides, R, [0, -0.1, 0], [0, 0.85, 0], 0.09, 0.08, q.seg, lin('#2E3236'), 'b'); }, x, z);
        else if (t === 'abribus') ordre('abribus', (lots, q) => dessinerAbribus(lots, q, R), x, z);
        else if (t === 'table') ordre('table', (lots, q) => { const S = lots.solides, b = lin('#8A6640'); boite(S, R, -0.9, 0.9, 0.72, 0.77, -0.38, 0.38, b, 'b'); for (const zz of [-0.62, 0.62]) boite(S, R, -0.9, 0.9, 0.42, 0.46, zz - 0.13, zz + 0.13, b, 'b'); for (const xx of [-0.7, 0.7]) boite(S, R, xx - 0.04, xx + 0.04, -0.05, 0.72, -0.7, 0.7, b, 'b'); }, x, z);
        else NOTES.mobilier--;
      } catch (err) { signaler('mobilier', err); }
    }
    function dessinerPanneau(lots, q, R, arret, nomC) {
      const S = lots.solides, gris = lin('#7E868C');
      if (arret) { // un poteau d'arrêt de car, le panneau au nom de l'arrêt (OSM) des deux côtés
        cylindre(S, R, [0, -0.1, 0], [0, 2.75, 0], 0.03, 0.03, 6, gris); boite(S, R, -0.25, 0.25, 2.05, 2.68, -0.02, 0.02, lin('#E8E8E4'));
        panneau(lots.atlas, R, -0.24, 0.24, 2.07, 2.66, 0.022, [1, 1, 1], lots.cel(nomC)); panneau(lots.atlas, new Rep(R.ox, R.oy, R.oz, -R.xx, -R.xz), -0.24, 0.24, 2.07, 2.66, 0.022, [1, 1, 1], lots.cel(nomC));
        boite(S, R, -0.12, 0.12, 1.3, 1.65, 0.03, 0.08, lin('#D9DCDF'));
      } else { // un panneau de sentiers : deux poteaux de bois, le tableau, un petit toit
        const bois = lin('#6B4A2E'); for (const x of [-0.78, 0.78]) boite(S, R, x - 0.06, x + 0.06, -0.2, 2.25, -0.06, 0.06, bois, 'b');
        boite(S, R, -0.75, 0.75, 0.95, 2.0, -0.04, 0.0, bois, 'b'); panneau(lots.atlas, R, -0.72, 0.72, 0.98, 1.97, 0.002, [1, 1, 1], lots.cel(nomC));
        const t = lin('#5A3E28'); S.quad(R.pt(-0.92, 2.15, 0.32), R.pt(0.92, 2.15, 0.32), R.pt(0.92, 2.42, 0), R.pt(-0.92, 2.42, 0), t); S.quad(R.pt(0.92, 2.15, -0.32), R.pt(-0.92, 2.15, -0.32), R.pt(-0.92, 2.42, 0), R.pt(0.92, 2.42, 0), t);
      }
    }
    function dessinerCroix(lots, q, R, h) { // une croix de chemin : socle de pierre, croix de fer forgé ou de pierre (selon un hachage)
      const Lp = lots.pierre, p = '#CFC5B2', fer = h % 3 !== 0;
      boitePierre(Lp, R, -0.6, 0.6, -0.3, 0.3, -0.6, 0.6, 'taille', p, 0.95); boitePierre(Lp, R, -0.36, 0.36, 0.3, 1.25, -0.36, 0.36, 'taille', p, 1.0); boitePierre(Lp, R, -0.42, 0.42, 1.25, 1.36, -0.42, 0.42, 'taille', p, 1.06);
      if (fer) { const S = lots.solides, f = lin('#1F2022'); boite(S, R, -0.035, 0.035, 1.36, 3.5, -0.035, 0.035, f); boite(S, R, -0.42, 0.42, 2.85, 2.93, -0.03, 0.03, f); cylindre(S, R, [0, 2.89, -0.03], [0, 2.89, 0.03], 0.14, 0.14, 8, f, 'ab'); }
      else { boitePierre(Lp, R, -0.09, 0.09, 1.36, 3.4, -0.09, 0.09, 'taille', p, 1.02); boitePierre(Lp, R, -0.48, 0.48, 2.72, 2.9, -0.09, 0.09, 'taille', p, 1.02); }
    }
    function dessinerMonument(lots, q, R) { // un monument (aux morts) : degrés, piédestal, corniche, obélisque, plaque de bronze sans texte inventé
      const Lp = lots.pierre, p = '#DDD5C4';
      boitePierre(Lp, R, -1.3, 1.3, -0.35, 0.18, -1.3, 1.3, 'taille', p, 0.94); boitePierre(Lp, R, -1.0, 1.0, 0.18, 0.4, -1.0, 1.0, 'taille', p, 0.98);
      boitePierre(Lp, R, -0.6, 0.6, 0.4, 1.9, -0.6, 0.6, 'taille', p, 1.0); boitePierre(Lp, R, -0.72, 0.72, 1.9, 2.08, -0.72, 0.72, 'taille', p, 1.05);
      const [c, ic] = pierreAttr('taille', p, 1.02), [ch] = pierreAttr('taille', p, 1.1), b = [R.pt(-0.42, 2.08, 0.42), R.pt(0.42, 2.08, 0.42), R.pt(0.42, 2.08, -0.42), R.pt(-0.42, 2.08, -0.42)], t = [R.pt(-0.24, 4.6, 0.24), R.pt(0.24, 4.6, 0.24), R.pt(0.24, 4.6, -0.24), R.pt(-0.24, 4.6, -0.24)], S = R.pt(0, 4.95, 0);
      for (let i = 0; i < 4; i++) { Lp.quad(b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i], c, [0, 0.7, 0.28, 1.53], ic, ch); Lp.tri(t[i], t[(i + 1) % 4], S, ch, [0, 0, 0.16, 0, 0.08, 0.12], ic); }
      panneau(lots.atlas, R, -0.42, 0.42, 0.9, 1.48, 0.605, [1, 1, 1], lots.cel('plaque-bronze'));
    }
    function dessinerPoubelle(lots, q, R) { // une corbeille publique : poteau, cerclage, sac vert
      const S = lots.solides; cylindre(S, R, [0, -0.1, -0.24], [0, 1.0, -0.24], 0.03, 0.03, 5, lin('#3B4A3F'));
      cylindre(S, R, [0, 0.35, 0], [0, 0.88, 0], 0.17, 0.2, q.seg, lin('#5F7F52'), 'a', lin('#7E9C6A')); cylindre(S, R, [0, 0.88, 0], [0, 0.93, 0], 0.215, 0.215, q.seg, lin('#2E3830'), 'ab');
    }
    function dessinerLampadaire(lots, q, R) { // repli pour les cartes qui en ont (OSM) : un candélabre de style et sa lanterne
      const S = lots.solides, f = lin('#1E2022'); cylindre(S, R, [0, -0.1, 0], [0, 0.6, 0], 0.11, 0.08, q.seg, f); cylindre(S, R, [0, 0.6, 0], [0, 3.4, 0], 0.06, 0.045, q.seg, f);
      const p = R.pt(0, 3.45, -0.52); dessinerLanterne(lots, q, new Rep(p[0], p[1], p[2], R.xx, R.xz));
    }
    function dessinerFontaine(lots, q, R) { // repli : un bassin de pierre octogonal et sa colonne
      const Lp = lots.pierre, r = 1.1, p = '#CFC5B2', S = lots.solides, eau = lin('#5E8CA8');
      boitePierre(Lp, R, -r, r, -0.2, 0.55, -r, r, 'taille', p, 0.97); boitePierre(Lp, R, -0.2, 0.2, 0.55, 1.6, -0.2, 0.2, 'taille', p, 1.02);
      S.quad(R.pt(-r + 0.12, 0.58, r - 0.12), R.pt(r - 0.12, 0.58, r - 0.12), R.pt(r - 0.12, 0.58, -r + 0.12), R.pt(-r + 0.12, 0.58, -r + 0.12), eau);
    }
    function dessinerAbribus(lots, q, R) { // repli : un abri de car (montants, toit, banquette)
      const S = lots.solides, g = lin('#6E767C'); for (const x of [-1.5, 1.5]) for (const z of [-0.6, 0.5]) boite(S, R, x - 0.04, x + 0.04, -0.1, 2.3, z - 0.04, z + 0.04, g, 'b');
      boite(S, R, -1.6, 1.6, 2.3, 2.38, -0.7, 0.65, lin('#8E979D')); boite(S, R, -1.45, 1.45, 0.45, 2.2, -0.62, -0.58, lin('#A9C2CF')); boite(S, R, -1.2, 1.2, 0.42, 0.47, -0.55, -0.25, lin('#8A6640'));
    }

    // ═══════════════════════════════ les murs (carte.murs) : pierre et chaperon, soutènement, clôture, portail ═══════════════════════════════
    for (const m of carte.murs || []) {
      try {
        if (!m || !Array.isArray(m.l) || m.l.length < 2) continue; const pts = m.l.filter((p) => p && fini(+p[0]) && fini(+p[1])).map((p) => [+p[0], +p[1]]); if (pts.length < 2) continue;
        const t = String(m.t || 'pierre'), h = fini(+m.h) && m.h > 0.3 ? borne(+m.h, 0.4, 6) : 1.8, ep = fini(+m.e) && m.e > 0.05 ? borne(+m.e, 0.1, 1.2) : 0.45;
        // densifier : des tronçons de ≤ 3 m qui suivent le relief
        const l = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / 3)); for (let k = 1; k <= n; k++) l.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
        NOTES.murs++; const hs = hash(JSON.stringify(pts[0]) + t);
        const mx = l[l.length >> 1][0], mz = l[l.length >> 1][1];
        if (t === 'cloture') ordre('mur', (lots, q) => dessinerCloture(lots, q, l, h), mx, mz);
        else if (t === 'portail') { cellule('grille', 'grille', 256, 180); ordre('mur', (lots, q) => dessinerPortail(lots, q, pts, h, ep), mx, mz); }
        else ordre('mur', (lots, q) => dessinerMur(lots, q, l, h, ep, t, hs), mx, mz);
      } catch (err) { signaler('mur', err); }
    }
    function dessinerMur(lots, q, l, h, ep, t, hs) { // un mur de moellons qui suit le relief ; chaperon de tuiles canal ou de pierre ; soutènement : dessus plat
      const Lp = lots.pierre, n = l.length, cote = [], pierre = ['#C9BCA2', '#BFB29A', '#CDBFA6'][hs % 3], tuiles = t === 'pierre' && (hs >>> 4) % 2 === 0, chap = t === 'soutenement' ? 0.08 : tuiles ? 0.2 : 0.16, deb = 0.05, e2 = ep / 2;
      for (let i = 0; i < n; i++) { // la normale moyenne (onglet) en chaque point
        const a = l[Math.max(0, i - 1)], b = l[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
        const g = H0(l[i][0], l[i][1]), gl = H0(l[i][0] + dz * (e2 + 0.4), l[i][1] - dx * (e2 + 0.4)), gr = H0(l[i][0] - dz * (e2 + 0.4), l[i][1] + dx * (e2 + 0.4));
        const bas = Math.min(g, gl, gr) - 0.35, haut = (t === 'soutenement' ? Math.max(Math.max(gl, gr) + 0.3, Math.min(gl, gr) + h) : g + h) - chap;
        cote.push({ x: l[i][0], z: l[i][1], nx: dz, nz: -dx, bas, haut });
      }
      let s = 0; const yRef = Math.min(...cote.map((c) => c.bas));
      for (let i = 0; i + 1 < n; i++) {
        const A = cote[i], B = cote[i + 1], d = Math.hypot(B.x - A.x, B.z - A.z), k = 0.94 + ((hs >>> (i % 16)) & 7) / 70;
        for (const sg of [1, -1]) { // les deux parements
          const ax = A.x + A.nx * e2 * sg, az = A.z + A.nz * e2 * sg, bx = B.x + B.nx * e2 * sg, bz = B.z + B.nz * e2 * sg, P = (x, y, z) => [x, y, z];
          if (sg > 0) quadPierre(Lp, P(bx, B.bas, bz), P(ax, A.bas, az), P(ax, A.haut, az), P(bx, B.haut, bz), 'pierre', pierre, k, s + d, s, B.bas - yRef, B.haut - yRef, 1.04);
          else quadPierre(Lp, P(ax, A.bas, az), P(bx, B.bas, bz), P(bx, B.haut, bz), P(ax, A.haut, az), 'pierre', pierre, k * 0.97, s, s + d, A.bas - yRef, A.haut - yRef, 1.04);
        }
        // le chaperon : deux pentes débordantes (tuiles canal ou dalles), ses rives ; le soutènement : une dalle plate
        const ea = e2 + deb, ya = A.haut, yb = B.haut, ra = ya + chap, rb = yb + chap, nom = tuiles ? 'canal' : 'taille', hex = tuiles ? '#A35F42' : '#D2C7B3';
        const aL = [A.x + A.nx * ea, ya + 0.02, A.z + A.nz * ea], bL = [B.x + B.nx * ea, yb + 0.02, B.z + B.nz * ea], aR = [A.x - A.nx * ea, ya + 0.02, A.z - A.nz * ea], bR = [B.x - B.nx * ea, yb + 0.02, B.z - B.nz * ea];
        if (t === 'soutenement') { quadPierre(Lp, aR, bR, bL, aL, 'taille', hex, k, s, s + d, 0, ep); aL[1] = aR[1] = ya; bL[1] = bR[1] = yb; }
        else {
          const aC = [A.x, ra, A.z], bC = [B.x, rb, B.z];
          quadPierre(Lp, bL, aL, aC, bC, nom, hex, k * 1.04, s + d, s, 0, ea * 1.6); quadPierre(Lp, aR, bR, bC, aC, nom, hex, k * 0.9, s, s + d, 0, ea * 1.6);
        }
        if (q.fin) { quadPierre(Lp, [bL[0], yb - 0.04, bL[2]], [aL[0], ya - 0.04, aL[2]], aL, bL, nom, hex, 0.85, s + d, s, 0, 0.06); quadPierre(Lp, [aR[0], ya - 0.04, aR[2]], [bR[0], yb - 0.04, bR[2]], bR, aR, nom, hex, 0.8, s, s + d, 0, 0.06); } // la goutte d'eau sous le chaperon
        s += d;
      }
      for (const [i, sg] of [[0, -1], [n - 1, 1]]) { // les abouts
        const C = cote[i], j = i === 0 ? 1 : n - 2, D = cote[j], dx = (C.x - D.x), dz = (C.z - D.z), dl = Math.hypot(dx, dz) || 1, ox = dx / dl * 0.001, oz = dz / dl * 0.001; void sg;
        const g = [C.x + C.nx * e2 + ox, C.z + C.nz * e2 + oz], d = [C.x - C.nx * e2 + ox, C.z - C.nz * e2 + oz], vers = (C.nx * dz - C.nz * dx) > 0;
        const p1 = vers ? d : g, p2 = vers ? g : d; quadPierre(Lp, [p1[0], C.bas, p1[1]], [p2[0], C.bas, p2[1]], [p2[0], C.haut, p2[1]], [p1[0], C.haut, p1[1]], 'pierre', pierre, 0.93, 0, ep, C.bas - yRef, C.haut - yRef);
        if (t !== 'soutenement') { const [cc, ic] = pierreAttr(tuiles ? 'canal' : 'taille', tuiles ? '#A35F42' : '#D2C7B3', 0.92), pg = [C.x + C.nx * (e2 + deb) * (vers ? 1 : -1), C.haut + 0.02, C.z + C.nz * (e2 + deb) * (vers ? 1 : -1)], pd = [C.x - C.nx * (e2 + deb) * (vers ? 1 : -1), C.haut + 0.02, C.z - C.nz * (e2 + deb) * (vers ? 1 : -1)]; Lp.tri(pd, pg, [C.x, C.haut + chap, C.z], cc, [0, 0, 0.2, 0, 0.1, 0.1], ic); }
      }
    }
    function dessinerCloture(lots, q, l, h) { // une clôture : poteaux tous les ~2,5 m, deux lisses et un grillage (couleurs)
      const S = lots.solides, poteau = lin('#5E6A5A'), lisse2 = lin('#6E7A68');
      let acc = 99; for (let i = 0; i + 1 < l.length; i++) {
        const a = l[i], b = l[i + 1], ga = H0(a[0], a[1]), gb = H0(b[0], b[1]), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 0.05) continue; const R = new Rep(a[0], ga, a[1], (b[0] - a[0]) / d, (b[1] - a[1]) / d);
        acc += d; if (acc > 2.5) { acc = 0; boite(S, R, -0.03, 0.03, -0.2, h, -0.03, 0.03, poteau, 'b'); }
        for (const y of [h * 0.95, h * 0.1]) S.quad(R.pt(0, y - 0.03, 0), R.pt(d, gb - ga + y - 0.03, 0), R.pt(d, gb - ga + y + 0.03, 0), R.pt(0, y + 0.03, 0), lisse2), S.quad(R.pt(d, gb - ga + y - 0.03, 0), R.pt(0, y - 0.03, 0), R.pt(0, y + 0.03, 0), R.pt(d, gb - ga + y + 0.03, 0), lisse2);
      }
    }
    function dessinerPortail(lots, q, pts, h, ep) { // un portail : deux piliers de pierre chapeautés, une grille de fer forgé
      const a = pts[0], b = pts[pts.length - 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d < 0.5) return; const g = Math.min(H0(a[0], a[1]), H0(b[0], b[1])), R = new Rep(a[0], g, a[1], (b[0] - a[0]) / d, (b[1] - a[1]) / d), p = '#CFC5B2';
      for (const x of [-0.25, d + 0.25]) { boitePierre(lots.pierre, R, x - 0.25, x + 0.25, -0.3, h + 0.3, -0.25, 0.25, 'taille', p, 1); boitePierre(lots.pierre, R, x - 0.3, x + 0.3, h + 0.3, h + 0.42, -0.3, 0.3, 'taille', p, 1.06); }
      panneau(lots.atlas, R, 0, d, 0, h, 0, [1, 1, 1], lots.cel('grille'));
    }

    // ═══════════════════════════════ l'ambiance (choix de style) ═══════════════════════════════
    // une façade vue depuis un point de la rue : le premier mur touché par le rayon (x, z) → (x, z) + (mx, mz)·dmax, tourné vers le point
    function facadeVers(x, z, mx, mz, dmax) {
      let best = null; const vus = new Set();
      for (let t = 0; t <= dmax + TG; t += TG / 2) { const l = gBat.get(cle(x + mx * t, z + mz * t)); if (l) for (const k of l) vus.add(k); }
      for (const k of vus) {
        const p = BATS[k].p;
        for (let i = 0; i < p.length; i++) {
          const a = p[i], c = p[(i + 1) % p.length], ex = c[0] - a[0], ez = c[1] - a[1], len = Math.hypot(ex, ez); if (len < 2.5) continue;
          const nx = ez / len, nz = -ex / len; if (nx * mx + nz * mz > -0.75) continue; // la façade doit regarder le point
          const den = mx * ez - mz * ex; if (Math.abs(den) < 1e-6) continue;
          const t = ((a[0] - x) * ez - (a[1] - z) * ex) / den, u = ((a[0] - x) * mz - (a[1] - z) * mx) / den; if (t < 0.5 || t > dmax || u < 0 || u > 1) continue;
          if (!best || t < best.t) best = { t, k, i, s: u * len };
        }
      }
      if (!best) return null; const f = new Facade(best.k, best.i); f.s = best.s; f.t = best.t; return f;
    }
    const lanternes = [];
    { // les lanternes murales des rues du bourg : tous les ~27 m le long des rues nommées à moins de 230 m de la place, en alternant les côtés
      const RB = 200; let cote = 1;
      for (const r of carte.rues || []) {
        if (!r || !Array.isArray(r.l) || r.l.length < 2 || r.t === 'chemin') continue; const w = fini(+r.w) ? +r.w : 5;
        if (!r.l.some((p) => p && Math.hypot(p[0] - PC[0], p[1] - PC[1]) < RB)) continue;
        let reste = 9;
        for (let i = 0; i + 1 < r.l.length; i++) {
          const a = r.l[i], b = r.l[i + 1]; if (!a || !b) continue; const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz); if (d < 0.1) continue; const tx = dx / d, tz = dz / d;
          let s = reste;
          while (s <= d) {
            const x = a[0] + tx * s, z = a[1] + tz * s; let pose = false;
            if (Math.hypot(x - PC[0], z - PC[1]) < RB && dansBat(x, z) < 0) for (const sg of [cote, -cote]) { // (pas depuis l'intérieur d'un passage voûté)
              const mx = -tz * sg, mz = tx * sg, f = facadeVers(x, z, mx, mz, w / 2 + 7); if (!f || f.b.t === 'eglise' || f.s < 0.9 || f.s > f.len - 0.9 || f.mitoyenne(f.s)) continue;
              const lx = f.x(f.s), lz = f.z(f.s), g = H0(f.x(f.s, 0.6), f.z(f.s, 0.6)); if (f.b.sommet - g < 4.4) continue;
              if (lanternes.some((o) => Math.hypot(o[0] - lx, o[1] - lz) < 15)) continue;
              if (!libreSur(f, f.s - 1.2, f.s + 1.2)) continue;
              lanternes.push([lx, lz]); reserver(f, f.s - 0.5, f.s + 0.5, 'lanterne', -1); const fs = f.s, yl = g + 3.3; ordre('lanterne', (lots, q) => dessinerLanterne(lots, q, f.rep(fs, yl, 0)), lx, lz);
              pose = true; cote = -sg; break;
            }
            s += pose ? 27 : 6;
          }
          reste = s - d;
        }
      }
      NOTES.lanternes = lanternes.length;
    }
    { // les bancs de la place, sous les arbres (choix de style) : monde.js les pose (règle dans monde.js : à 1,9 m d'un tronc mesuré, dos à lui,
      // hors des rues, des bâtiments et des autres troncs, 4 au plus) et les rend pleins pour les pas et les tirs ; le décor ne fait que les dessiner
      for (const [x, z, yaw] of BANCS) ordre('banc', (lots, q) => dessinerBanc(lots, q, repYaw(x, Math.min(H0(x, z), H0(x + 0.9, z), H0(x - 0.9, z)), z, yaw)), x, z);
      NOTES.bancs = BANCS.length; NOTES.bancsXZ = BANCS.map((b) => [+b[0].toFixed(1), +b[1].toFixed(1), +b[2].toFixed(2)]);
    }
    { // les fenêtres fleuries (jardinières de géraniums, volets ouverts) au premier étage des façades qui regardent la place
      const D = DETAILS(), pris = [];
      if (D && D.cellules.fenetre) {
        cellule('fleurs-a', 'fleurs', 256, 84, { graine: 3 }); cellule('fleurs-b', 'fleurs', 256, 84, { graine: 7, fleurs: ['#E8578A', '#F07FA6', '#C93D6E'] });
        BATS.forEach((b, k) => {
          if (!b || b.t === 'eglise' || b.t === 'annexe' || b.t === 'chateau' || b.t === 'tour' || b.t === 'mairie' || !b.aabb) return;
          const cx = (b.aabb[0] + b.aabb[2]) / 2, cz = (b.aabb[1] + b.aabb[3]) / 2; if (Math.hypot(cx - PC[0], cz - PC[1]) > 62) return;
          for (let i = 0; i < b.p.length; i++) {
            const f = new Facade(k, i); if (f.len < 3.4) continue; const mx = f.x(f.len / 2), mz = f.z(f.len / 2), vx = PC[0] - mx, vz = PC[1] - mz, dv = Math.hypot(vx, vz) || 1;
            if ((f.nx * vx + f.nz * vz) / dv < 0.35 || f.mitoyenne(f.len / 2)) continue;
            const n = Math.max(1, Math.floor((f.len - 0.6) / 3)), pasF = f.len / n, hb = hash('fleurs|' + k + '|' + i);
            for (let j = 0; j < n; j++) {
              const s = (j + 0.5) * pasF, g = Math.max(H0(f.x(s, 0.3), f.z(s, 0.3)), b.base), y0 = g + 2.85 + 0.87; if (y0 + 1.75 > b.sommet - 0.4) continue;
              if (((hb >>> (j * 3)) & 7) > 2 || pris.length >= 14) continue;
              if (lanternes.some((o) => Math.hypot(o[0] - f.x(s), o[1] - f.z(s)) < 1.4)) continue;
              pris.push([f, s, y0, VOLETS[hash('volets|' + k) % VOLETS.length], (hb >>> 20) & 1]);
            }
          }
        });
      }
      for (const [f, s, y0, vol, var2] of pris) ordre('fenetre', (lots, q) => {
        const D2 = DETAILS(); if (!D2) return; const R = f.rep(s, y0), fe = D2.cellules.fenetre, v = D2.cellules['volet-' + vol], ou = fe.ouverture || [0.1, 0.1, fe.l - 0.1, fe.h - 0.1];
        panneau(lots.details, R, -fe.l / 2, fe.l / 2, 0, fe.h, 0.065, [1, 1, 1], fe.uv);
        if (v) { const yo = ou[1] - 0.03, ho = ou[3] - ou[1] + 0.06; panneau(lots.details, R, -fe.l / 2 - v.l + 0.07, -fe.l / 2 + 0.07, yo, yo + ho, 0.075, [1, 1, 1], v.uv); panneau(lots.details, R, fe.l / 2 - 0.07, fe.l / 2 - 0.07 + v.l, yo, yo + ho, 0.075, [1, 1, 1], [v.uv[2], v.uv[1], v.uv[0], v.uv[3]]); }
        const yj = ou[1] - 0.2, S = lots.solides, bac = var2 ? lin('#B4643F') : lin('#4F6B4A'); boite(S, R, -0.5, 0.5, yj, yj + 0.2, 0.06, 0.28, bac, '', var2 ? lin('#C97A50') : lin('#5E7D57'));
        boite(S, R, -0.45, -0.42, yj - 0.1, yj, 0.08, 0.26, lin('#2A2A2A')); boite(S, R, 0.42, 0.45, yj - 0.1, yj, 0.08, 0.26, lin('#2A2A2A'));
        const c = lots.cel(var2 ? 'fleurs-a' : 'fleurs-b'); panneau(lots.atlas, R, -0.56, 0.56, yj + 0.12, yj + 0.5, 0.17, [1, 1, 1], c); lots.atlas.quad(R.pt(-0.54, yj + 0.12, 0.27), R.pt(0.54, yj + 0.12, 0.27), R.pt(0.54, yj + 0.44, 0.12), R.pt(-0.54, yj + 0.44, 0.12), [0.9, 0.9, 0.9], c);
      }, f.x(s), f.z(s));
      NOTES.fenetres = pris.length;
    }
    { // les plaques de rue émaillées : une par carrefour de deux rues nommées, à l'angle d'un bâtiment, sur la façade le long de la rue
      const nommees = (carte.rues || []).filter((r) => r && r.n && Array.isArray(r.l) && r.l.length >= 2), jonctions = [];
      for (let i = 0; i < nommees.length; i++) for (let j = i + 1; j < nommees.length; j++) {
        const A = nommees[i], B = nommees[j]; if (A.n === B.n) continue;
        for (let a = 0; a + 1 < A.l.length; a++) for (let b = 0; b + 1 < B.l.length; b++) {
          const p = A.l[a], p2 = A.l[a + 1], r = B.l[b], r2 = B.l[b + 1]; let J = null;
          for (const [u, v0, v1] of [[p, r, r2], [p2, r, r2], [r, p, p2], [r2, p, p2]]) if (d2Seg(u[0], u[1], v0[0], v0[1], v1[0], v1[1]) < 4) { J = u; break; }
          if (!J) { const ex = p2[0] - p[0], ez = p2[1] - p[1], fx = r2[0] - r[0], fz = r2[1] - r[1], den = ex * fz - ez * fx; if (Math.abs(den) > 1e-6) { const t = ((r[0] - p[0]) * fz - (r[1] - p[1]) * fx) / den, u = ((r[0] - p[0]) * ez - (r[1] - p[1]) * ex) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) J = [p[0] + ex * t, p[1] + ez * t]; } }
          if (J && Math.hypot(J[0] - PC[0], J[1] - PC[1]) < 380) jonctions.push({ x: J[0], z: J[1], rues: [A, B] });
        }
      }
      const carrefours = []; for (const J of jonctions) { const c = carrefours.find((o) => Math.hypot(o.x - J.x, o.z - J.z) < 14); if (c) { for (const r of J.rues) if (!c.rues.includes(r)) c.rues.push(r); } else carrefours.push({ x: J.x, z: J.z, rues: J.rues.slice() }); }
      const posees = [];
      for (const C of carrefours) {
        let best = null;
        for (const r of C.rues) { // l'angle d'un bâtiment près du carrefour, dont une façade longe la rue r et la regarde
          let seg = null, sd = Infinity; for (let i = 0; i + 1 < r.l.length; i++) { const d = d2Seg(C.x, C.z, r.l[i][0], r.l[i][1], r.l[i + 1][0], r.l[i + 1][1]); if (d < sd) { sd = d; seg = [r.l[i], r.l[i + 1]]; } }
          if (!seg) continue; const sx = seg[1][0] - seg[0][0], sz = seg[1][1] - seg[0][1], sl = Math.hypot(sx, sz) || 1, w = fini(+r.w) ? +r.w : 5;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const k of gBat.get(cle(C.x + di * TG, C.z + dj * TG)) || []) {
            const p = BATS[k].p;
            for (let i = 0; i < p.length; i++) {
              const f = new Facade(k, i); if (f.len < 1.6 || Math.abs(f.ux * sx / sl + f.uz * sz / sl) < 0.8) continue;
              for (const [sc, coin] of [[0.32, f.a], [f.len - 0.32, f.c]]) {
                const dc = Math.hypot(coin[0] - C.x, coin[1] - C.z); if (dc > 13) continue;
                const px = f.x(sc), pz = f.z(sc), dr = Math.sqrt(d2Seg(px, pz, seg[0][0], seg[0][1], seg[1][0], seg[1][1])); if (dr > w / 2 + 5 || dr < w / 2 - 1.5) continue;
                const vr = ((seg[0][0] - px) * -sz + (seg[0][1] - pz) * sx) / sl, vf = (f.nx * -sz + f.nz * sx) / sl; if (vr * vf <= 0) continue; // la façade regarde la rue
                if (f.mitoyenne(sc) || f.sol(sc) + 3.2 > f.b.sommet) continue;
                const score = dc + dr * 0.5; if (!best || score < best.score) best = { score, f, sc, r, coin: sc < f.len / 2 ? 'a' : 'c' };
              }
            }
          }
        }
        if (!best) continue; const px = best.f.x(best.sc), pz = best.f.z(best.sc); if (posees.some((o) => Math.hypot(o[0] - px, o[1] - pz) < 15)) continue;
        const pl = plaqueRue(best.r.n), lp = 0.25 * (pl.ratio || 4), s0 = best.coin === 'a' ? 0.3 : best.f.len - 0.3 - lp; if (s0 < 0.1 || s0 + lp > best.f.len - 0.1 || !libreSur(best.f, s0, s0 + lp)) continue;
        posees.push([px, pz]); const f = best.f, g = f.sol(s0 + lp / 2); reserver(f, s0, s0 + lp, 'plaque', -1);
        ordre('plaque', (lots, q) => { if (!q.fin) return; const R = f.rep(s0 + lp / 2, g); quadEns(lots, pl, R, -lp / 2, lp / 2, 2.75, 3.0, 0.065); boite(lots.solides, R, -lp / 2 + 0.01, lp / 2 - 0.01, 2.76, 2.99, 0, 0.06, lin('#1D3E78'), 'd'); }, px, pz);
        remarquables.push({ quoi: 'plaque', n: best.r.n, x: +px.toFixed(2), y: +(g + 2.87).toFixed(2), z: +pz.toFixed(2), nx: +f.nx.toFixed(3), nz: +f.nz.toFixed(3) });
      }
      NOTES.plaquesRue = posees.length;
    }

    // ═══════════════════════════════ l'horizon : les vraies montagnes (carte.horizon), dans la brume ═══════════════════════════════
    const RLF = carte.relief, okR = RLF && RLF.n >= 2 && fini(+RLF.pas) && RLF.h && RLF.h.length >= RLF.n * RLF.n;
    const nR = okR ? RLF.n | 0 : 2, pasR = okR ? +RLF.pas : L;
    const PER = []; for (let i = 0; i < nR - 1; i++) PER.push([i, 0]); for (let j = 0; j < nR - 1; j++) PER.push([nR - 1, j]); for (let i = nR - 1; i > 0; i--) PER.push([i, nR - 1]); for (let j = nR - 1; j > 0; j--) PER.push([0, j]); // le bord du carré, dans le sens des bâtiments
    const hBord = PER.map(([i, j]) => { const v = okR ? +RLF.h[j * nR + i] : H0(X0 + i * pasR, X0 + j * pasR); return fini(v) ? v : 0; });
    const HZ = carte.horizon, okH = HZ && HZ.n >= 2 && fini(+HZ.pas) && Array.isArray(HZ.h) && HZ.h.length >= HZ.n * HZ.n;
    const SOL_REF = hBord.reduce((a, b) => a + b, 0) / Math.max(1, hBord.length);
    function hzAt(x, z) { // l'altitude lointaine (bilinéaire, bornée à la grille) ; repli : collines douces génériques
      if (!okH) { const a = Math.atan2(z, x), d = Math.max(0, Math.hypot(x, z) - L / 2); return SOL_REF + 170 * lisse(0, 2600, d) * (0.6 + 0.25 * Math.sin(a * 3 + 1.3) + 0.15 * Math.sin(a * 7 - 0.4)) + 30 * lisse(0, 400, d) * Math.sin(a * 11 + d * 0.003); }
      const n = HZ.n, pas = +HZ.pas, fi = borne(x / pas + (n - 1) / 2, 0, n - 1.001), fj = borne(z / pas + (n - 1) / 2, 0, n - 1.001), i = Math.floor(fi), j = Math.floor(fj), a = fi - i, b = fj - j, h = HZ.h;
      return (+h[j * n + i]) * (1 - a) * (1 - b) + (+h[j * n + i + 1]) * a * (1 - b) + (+h[(j + 1) * n + i]) * (1 - a) * b + (+h[(j + 1) * n + i + 1]) * a * b;
    }
    const bruit = (x, z, p) => { const i = Math.floor(x / p), j = Math.floor(z / p), a = x / p - i, b = z / p - j, h = (u, v) => (hash(u * 7919 + ',' + v * 104729) % 1000) / 1000, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b); return h(i, j) * (1 - sa) * (1 - sb) + h(i + 1, j) * sa * (1 - sb) + h(i, j + 1) * (1 - sa) * sb + h(i + 1, j + 1) * sa * sb; };
    const ALB = { foret: lin('#2F4A2A'), foretC: lin('#435F33'), pre: lin('#8AA453'), champ: lin('#B9AC6C'), labour: lin('#9C8462'), roche: lin('#BDB6A6'), vallee: lin('#749550') };
    function albedo(x, z, y) { // la couleur du sol lointain (choix de style) : forêts sur les pentes et en lambeaux, prés et champs en damier dans la vallée, falaises calcaires
      const e = 90, gx = (hzAt(x + e, z) - hzAt(x - e, z)) / (2 * e), gz = (hzAt(x, z + e) - hzAt(x, z - e)) / (2 * e), pente = Math.hypot(gx, gz), alt = y - SOL_REF, n1 = bruit(x, z, 700), n2 = bruit(x + 311, z - 97, 230);
      const ci = Math.floor((x + 0.37 * z) / 260), cj = Math.floor((z - 0.37 * x) / 190), hc = (hash(ci + ',' + cj) % 1000) / 1000; // le damier des parcelles
      const foret = Math.max(lisse(0.06, 0.16, pente + (n1 - 0.5) * 0.22) * (1 - lisse(0.6, 0.9, pente)), lisse(0.6, 0.75, n2) * 0.9), roche = lisse(0.45, 0.8, pente + (n2 - 0.5) * 0.25) * lisse(100, 280, alt);
      let c = hc < 0.45 ? ALB.pre : hc < 0.7 ? ALB.vallee : hc < 0.88 ? ALB.champ : ALB.labour;
      c = mix(c, n2 > 0.5 ? ALB.foretC : ALB.foret, foret); c = mix(c, ALB.roche, roche); return c;
    }
    let PHOTO_BORD = null; // la couleur de la photo aérienne au bord du carré (raccord), lue en tâche de fond
    function horizonGeo(q) {
      const M = PER.length, A = q.anneaux, K = A.length, pos = [], col = [], hz = [], idx = [], debut = [];
      for (let k = 0; k < K; k++) {
        const pas = k < q.azDes ? 1 : q.az, d = A[k], bord = lisse(0, 900, d), photo = lisse(0, 320, d), fin = k === K - 1; debut.push(pos.length / 3); // bord : la brume du jeu se lève (le shader la lève tout à fait à 0,3, ~330 m) ; photo : la couleur du bord du carré
        for (let a = 0; a < M; a += pas) {
          const [i, j] = PER[a], x0 = X0 + i * pasR, z0 = X0 + j * pasR, r = Math.hypot(x0, z0) || 1, x = x0 + x0 / r * d, z = z0 + z0 / r * d;
          const y = k === 0 ? hBord[a] : hzAt(x, z) + (hBord[a] - hzAt(x0, z0)) * (1 - lisse(0, 380, d));
          pos.push(x, y, z); let c = albedo(x, z, y); if (PHOTO_BORD && photo < 1) c = mix(PHOTO_BORD[a], c, photo); col.push(c[0], c[1], c[2]);
          hz.push(bord, fin ? 0.85 : Math.min(0.8, 1 - Math.exp(-(d + 250) / 6500)), lisse(120, 1400, d) * 0.55 + lisse(900, 3000, d) * 0.45); // raccord, voile, la brume du jeu s'efface au loin
        }
      }
      for (let k = K - 2; k >= 0; k--) { // de la bande la plus lointaine à la plus proche : l'ordre des triangles fait l'occultation (peintre)
        const p0 = debut[k], q0 = debut[k + 1], np = k < q.azDes ? M : M / q.az, nq = k + 1 < q.azDes ? M : M / q.az;
        if (np === nq) for (let a = 0; a < np; a++) { const b = (a + 1) % np; idx.push(p0 + a, p0 + b, q0 + b, p0 + a, q0 + b, q0 + a); }
        else { const r = np / nq; for (let a = 0; a < nq; a++) { const b = (a + 1) % nq; for (let m = 0; m < r; m++) idx.push(p0 + a * r + m, p0 + (a * r + m + 1) % np, q0 + (m + 1 === r ? b : a)); idx.push(p0 + a * r + Math.floor(r / 2), q0 + b, q0 + a); } }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aHz', new THREE.Float32BufferAttribute(hz, 3));
      g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
      let rmax = 0; for (let i = 0; i < pos.length; i += 3) rmax = Math.max(rmax, Math.hypot(pos[i], pos[i + 2])); g.userData.rmax = rmax; g.userData.tris = idx.length / 3; g.userData.anneaux = K; return g;
    }
    function horizonRecolorer(g) { // la photo est arrivée : les premiers anneaux reprennent sa couleur au bord
      const pos = g.attributes.position.array, col = g.attributes.color.array, M = PER.length, q = MAILLE.q; let v = 0;
      for (let k = 0; v < pos.length / 3 && k < q.anneaux.length; k++) { const pas = k < q.azDes ? 1 : q.az, photo = lisse(0, 320, q.anneaux[k]); for (let a = 0; a < M && v < pos.length / 3; a += pas, v++) { if (photo >= 1) continue; const c = mix(PHOTO_BORD[a], albedo(pos[v * 3], pos[v * 3 + 2], pos[v * 3 + 1]), photo); col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; } }
      g.attributes.color.needsUpdate = true;
    }

    // ═══════════════════════════════ les matériaux, les maillages, la qualité ═══════════════════════════════
    const U = { uTemps: { value: 0 }, uK: { value: 1 }, uSolRef: { value: SOL_REF }, uVoile: { value: new THREE.Color() } };
    const _c = new THREE.Color(), BLEU = new THREE.Color('#8FA9C6');
    const MATS = {};
    MATS.solides = new THREE.MeshLambertMaterial({ vertexColors: true }); MATS.solides.name = 'pdecor-solides';
    MATS.horizon = new THREE.MeshLambertMaterial({ vertexColors: true, depthWrite: false }); MATS.horizon.name = 'pdecor-horizon';
    MATS.horizon.onBeforeCompile = (sh) => {
      sh.uniforms.uK = U.uK; sh.uniforms.uSolRef = U.uSolRef; sh.uniforms.uVoile = U.uVoile;
      sh.vertexShader = 'attribute vec3 aHz;\nuniform float uK;\nuniform float uSolRef;\nvarying vec4 vHz;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#ifdef USE_FOG\n\tvFogDepth = - mvPosition.z / uK;\n#endif\n\tvHz = vec4( aHz, clamp( ( position.y - uSolRef - 15.0 ) / 240.0, 0.0, 1.0 ) );');
      sh.fragmentShader = 'uniform vec3 uVoile;\nvarying vec4 vHz;\n' + sh.fragmentShader.replace('#include <fog_fragment>', [
        '#ifdef USE_FOG', // la brume du jeu entière au raccord, levée en ~330 m (aHz.x < 0,3 : aucune couture avec le sol du carré) ; plus loin une brume de vallée
        // légère (≤ 30 %) sur les points bas, qui s'efface au loin (jamais une nappe sur toute la largeur) ; puis le voile atmosphérique
        '\tfloat brume = smoothstep( fogNear, fogFar, vFogDepth ) * max( 1.0 - smoothstep( 0.0, 0.3, vHz.x ), 0.3 * ( 1.0 - vHz.w ) * ( 1.0 - vHz.z ) );',
        '\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, brume );',
        '\tgl_FragColor.rgb = mix( gl_FragColor.rgb, uVoile, vHz.y * vHz.x * ( 1.0 - brume ) );',
        '#endif'].join('\n'));
    };
    MATS.horizon.customProgramCacheKey = () => 'pdecor-horizon';
    // la pierre : la texture en couches de rendu.js (opts.bati), sinon les moellons de PTEXTURES (une texture, matériau à nous), sinon des couleurs ;
    // redemandée à chaque construction (après PTEXTURES.vider(), la texture et l'objet bati changent)
    let texPierre = null, matMoellons = null;
    function choisirPierre() {
      if (typeof opts.bati === 'function') { try { BATI = batiValide(opts.bati()); } catch (e) { BATI = null; } }
      texPierre = null; if (BATI) { MATS.pierre = BATI.materiau(); return; }
      if (T && T.facade) { try { texPierre = T.facade('pierre', REF_PIERRE); } catch (e) { texPierre = null; } }
      if (!texPierre) { MATS.pierre = MATS.solides; return; }
      if (!matMoellons) {
        matMoellons = new THREE.MeshLambertMaterial({ vertexColors: true, map: texPierre }); matMoellons.name = 'pdecor-pierre';
        matMoellons.onBeforeCompile = (sh) => {
          sh.vertexShader = 'attribute float couche;\nvarying float vCouche;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvCouche = couche;');
          sh.fragmentShader = 'varying float vCouche;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\n\tif ( vCouche > 0.5 ) diffuseColor *= texture2D( map, vMapUv );\n#endif');
        };
        matMoellons.customProgramCacheKey = () => 'pdecor-pierre';
      }
      matMoellons.map = texPierre; MATS.pierre = matMoellons;
    }
    const groupe = new THREE.Group(); groupe.name = 'decor';
    const MAILLE = { q: null, meshes: [], atlas: null, matAtlas: null, matOmbre: null, matPages: new Map(), horizon: null, st: {} };
    function atlasPour(S) { // l'atlas du décor (une fois par taille), son matériau (toiles qui ondulent) et celui des ombres
      if (MAILLE.atlas && MAILLE.atlas.S === S) return; viderAtlas();
      MAILLE.atlas = peindreAtlas(S, [...CELL.values()]);
      const m = new THREE.MeshLambertMaterial({ map: MAILLE.atlas.tx, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }); m.name = 'pdecor-atlas';
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTemps = U.uTemps;
        sh.vertexShader = 'attribute float aVent;\nuniform float uTemps;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tif ( aVent > 0.0 ) { float ph = position.x * 0.9 + position.z * 0.7 + position.y * 1.9; transformed += objectNormal * aVent * ( sin( uTemps * 3.1 + ph ) * 0.65 + sin( uTemps * 5.3 + ph * 2.3 ) * 0.35 ); }');
      };
      m.customProgramCacheKey = () => 'pdecor-atlas'; MAILLE.matAtlas = m;
      MAILLE.matOmbre = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: MAILLE.atlas.tx, alphaTest: 0.5, side: THREE.DoubleSide });
    }
    function viderAtlas() { if (!MAILLE.atlas) return; MAILLE.atlas.tx.dispose(); if (MAILLE.matAtlas) MAILLE.matAtlas.dispose(); if (MAILLE.matOmbre) MAILLE.matOmbre.dispose(); MAILLE.atlas = null; MAILLE.matAtlas = null; MAILLE.matOmbre = null; }
    function viderMaillage() {
      for (const m of MAILLE.meshes) { groupe.remove(m); m.geometry.dispose(); } MAILLE.meshes = []; MAILLE.horizon = null;
      for (const m of MAILLE.matPages.values()) m.dispose(); MAILLE.matPages.clear();
    }
    function ajouter(nom, geo, mat, ombre, ordre) { const m = new THREE.Mesh(geo, mat); m.name = nom; m.castShadow = !!ombre; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); if (ordre != null) m.renderOrder = ordre; groupe.add(m); MAILLE.meshes.push(m); return m; }
    function construire() {
      const tC = maintenant(), q = QUALITES[nomQ]; viderMaillage(); MAILLE.q = q; atlasPour(q.atlas); choisirPierre();
      const lots = { solides: new Lot(), pierre: new Lot(), atlas: new Lot(), details: new Lot(), pages: new Map(), cel: (nom) => { const c = MAILLE.atlas.cellules[nom]; return c ? c.uv : [0, 0, 0.001, 0.001]; } };
      const loin = q.fusion ? lots : Object.assign({}, lots, { solides: new Lot(), pierre: new Lot() }); // le décor hors du bourg : mêmes atlas, sans ombres
      for (const [o, proche] of ORDRES) { try { o(proche ? lots : loin, q); } catch (e) { signaler('dessin', e); } }
      const st = { appels: 0, triangles: 0, appelsOmbre: 0, trianglesOmbre: 0, parMaillage: {} }, compte = (m) => { const n = m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3; st.appels++; st.triangles += n; st.parMaillage[m.name] = Math.round(n); if (m.castShadow) { st.appelsOmbre++; st.trianglesOmbre += n; } };
      if (lots.solides.nb()) compte(ajouter('decor-solides', lots.solides.geometrie(), MATS.solides, q.ombres));
      if (lots.pierre.nb()) compte(ajouter('decor-pierre', lots.pierre.geometrie(MATS.pierre === MATS.solides ? null : 'couche'), MATS.pierre, q.ombres));
      if (loin !== lots && loin.solides.nb()) compte(ajouter('decor-solides-loin', loin.solides.geometrie(), MATS.solides, false));
      if (loin !== lots && loin.pierre.nb()) compte(ajouter('decor-pierre-loin', loin.pierre.geometrie(MATS.pierre === MATS.solides ? null : 'couche'), MATS.pierre, false));
      if (lots.atlas.nb()) { const m = ajouter('decor-atlas', lots.atlas.geometrie('aVent'), MAILLE.matAtlas, q.ombres); m.customDepthMaterial = MAILLE.matOmbre; compte(m); }
      const D = DETAILS(); if (lots.details.nb() && D) compte(ajouter('decor-ouvertures', lots.details.geometrie(), D.materiau(), false));
      let ip = 0; lots.pages.forEach((l, tex) => { const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }); m.name = 'pdecor-enseignes'; MAILLE.matPages.set(tex, m); compte(ajouter('decor-enseignes-' + ip++, l.geometrie(), m, false)); });
      const gh = horizonGeo(q); if (PHOTO_BORD) horizonRecolorer(gh);
      const h = ajouter('decor-horizon', gh, MATS.horizon, false, -9); h.receiveShadow = false; h.frustumCulled = false; h.matrixWorldAutoUpdate = false; MAILLE.horizon = h; compte(h);
      h.onBeforeRender = (renderer, scene, camera) => { // l'homothétie de centre l'œil : même image, toujours en deçà de camera.far
        const e = camera.matrixWorld.elements, cx = e[12], cy = e[13], cz = e[14], k = Math.min(1, 0.9 * (camera.far || 1000) / (gh.userData.rmax + Math.hypot(cx, cz) + Math.abs(cy - SOL_REF) + 600)), m = h.matrixWorld.elements;
        m[0] = k; m[1] = 0; m[2] = 0; m[3] = 0; m[4] = 0; m[5] = k; m[6] = 0; m[7] = 0; m[8] = 0; m[9] = 0; m[10] = k; m[11] = 0; m[12] = cx * (1 - k); m[13] = cy * (1 - k); m[14] = cz * (1 - k); m[15] = 1; U.uK.value = k;
        if (scene && scene.fog && scene.fog.color) { _c.copy(scene.fog.color).lerp(BLEU, 0.42); _c.getRGB(U.uVoile.value, renderer.getRenderTarget() === null ? renderer.outputColorSpace : THREE.LinearSRGBColorSpace); }
      };
      st.horizon = { anneaux: gh.userData.anneaux, triangles: gh.userData.tris, rayon: Math.round(gh.userData.rmax), relief: okH ? 'ign' : 'collines' };
      st.construction = Math.round((maintenant() - tC) * 10) / 10; MAILLE.st = st; aRefaire = false;
    }
    // la photo aérienne : la couleur du sol au bord du carré (le raccord de l'horizon)
    let image = null;
    if (opts.photo !== false && carte.sol && typeof Image !== 'undefined') {
      const nom = carte.sol.petite || carte.sol.image;
      if (typeof nom === 'string') {
        image = new Image(); image.onload = () => {
          if (libere) return;
          try {
            const N = 200, cv = document.createElement('canvas'); cv.width = cv.height = N; const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0, N, N); const d = c.getImageData(0, 0, N, N).data;
            PHOTO_BORD = PER.map(([i, j]) => { const u = borne(Math.round(i / (nR - 1) * (N - 1)), 2, N - 3), v = borne(Math.round(j / (nR - 1) * (N - 1)), 2, N - 3); let r = 0, g = 0, b = 0, n = 0; for (let dv = -2; dv <= 2; dv++) for (let du = -2; du <= 2; du++) { const o = ((v + dv) * N + u + du) * 4; r += LIN[d[o]]; g += LIN[d[o + 1]]; b += LIN[d[o + 2]]; n++; } return [r / n, g / n, b / n]; });
            if (MAILLE.horizon) horizonRecolorer(MAILLE.horizon.geometry);
          } catch (e) { /* photo illisible (origine) : l'horizon garde ses couleurs */ }
        };
        image.src = dossier + nom;
      }
    }

    function maj(camera, t) { if (libere) return; if (aRefaire) { try { construire(); } catch (e) { signaler('construction', e); aRefaire = false; } } U.uTemps.value = fini(t) ? t % 3600 : 0; }
    function qualite(q) { if (q === undefined || !QUALITES[q]) return nomQ; if (q !== nomQ) { nomQ = q; aRefaire = true; } return nomQ; }
    function retour() { if (MAILLE.atlas) MAILLE.atlas.tx.needsUpdate = true; if (texPierre) texPierre.needsUpdate = true; }
    function liberer() {
      if (libere) return; libere = true; if (image) { image.onload = null; image = null; }
      if (groupe.parent) groupe.parent.remove(groupe); viderMaillage(); viderAtlas();
      MATS.solides.dispose(); MATS.horizon.dispose(); if (matMoellons) matMoellons.dispose(); groupe.clear();
    }
    try { construire(); } catch (e) { signaler('construction', e); }
    const tCree = Math.round((maintenant() - t0) * 10) / 10;
    return {
      groupe, maj, qualite, retour, liberer, remarquables, facades,
      get atlas() { return MAILLE.atlas ? MAILLE.atlas.tx.image : null; }, // la toile de l'atlas du décor (pages de test)
      get stats() {
        const s = MAILLE.st, n = Object.assign({}, NOTES); delete n.terrassesRefusees; delete n.bancsXZ;
        return { qualite: nomQ, appels: s.appels, triangles: Math.round(s.triangles || 0), appelsOmbre: s.appelsOmbre, trianglesOmbre: Math.round(s.trianglesOmbre || 0), parMaillage: s.parMaillage, horizon: s.horizon,
          objets: n, ordres: Object.assign({}, COMPTE), terrassesRefusees: NOTES.terrassesRefusees.slice(), bancs: NOTES.bancsXZ, lanternes: lanternes.map((l) => [+l[0].toFixed(1), +l[1].toFixed(1)]), pierre: BATI ? 'bati' : texPierre ? 'moellons' : 'couleurs', textures: !!T,
          atlas: MAILLE.atlas ? MAILLE.atlas.S : 0, memoire: MAILLE.atlas ? MAILLE.atlas.octets : 0, cellules: CELL.size, photo: !!PHOTO_BORD, creation: tCree, construction: s.construction, erreurs: erreurs.slice(0, 8) };
      },
    };
  }
  return { creer, QUALITES, OK };
})();
if (typeof module !== 'undefined') module.exports = PDECOR;
