/* OPÉRATION PONCIN — les textures du décor « réaliste stylisé », peintes sur canvas (aucune image externe, aucune donnée Google) :
   façades (crépi, pierre, brique, béton, bois), toits (tuiles, ardoise, zinc, gravillons), sols de détail (asphalte, pavés, gravier,
   herbe, terre), un atlas des ouvertures (fenêtres, volets persiennes, portes, vitrines, balcons, chaînes d'angle…) et des atlas
   d'enseignes et de plaques de rue (textes venus des données OSM). Toutes les textures répétées sont carrelables sans couture
   (formes dessinées « en tore », bruits périodiques), avec mipmaps et anisotropie, mises en cache par clé et marquées partagées
   (userData.partagee, MODELES.partager) : MODELES.dispose et la libération de rendu.js ne les rendent jamais par erreur.
   Fabrication : les formes (pierres, briques, tuiles, planches…) au canvas 2D, puis une passe JS par pixel (bruits multi-échelles,
   relief, moyenne linéaire) qui écrit directement les octets d'une DataTexture (lignes retournées : v = 0 en bas, comme une
   CanvasTexture). Pour les bâtiments fusionnés par tuiles, bati(noms) range les matériaux dans UNE DataArrayTexture et fournit un
   matériau Lambert qui la lit par sommet (attributs uv + couche) : un seul appel de dessin par tuile, quelle que soit la matière.
   Qualité : qualite('haute' | 'moyenne' | 'eco') ; en éco, toutes les tailles sont divisées par deux (mémoire divisée par quatre).
   API complète et unités : voir le rapport d'intégration (src-poncin/ARCHITECTURE.md, section « Authenticité ») et le bas du fichier. */
const PTEXTURES = (() => {
  'use strict';
  const OK = typeof THREE !== 'undefined' && typeof document !== 'undefined';
  const M = typeof MODELES !== 'undefined' && MODELES ? MODELES : null;
  const TAU = Math.PI * 2;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // ─── qualité : un facteur de taille et l'anisotropie ───
  const QUALITES = { haute: { k: 1, aniso: 8 }, moyenne: { k: 1, aniso: 4 }, eco: { k: 0.5, aniso: 2 } };
  const Q = { niveau: 'haute', k: 1, aniso: 8, webgl2: true, anisoMax: 16 };
  const TAILLES = { mur: 512, toit: 512, sol: 512, details: 1024, densite: 128, page: [1024, 256], enseigne: 64, plaque: 48 };
  const taille = (n) => Math.max(32, Math.round(n * Q.k));
  // ─── le cache et les comptes ───
  const CACHE = new Map(), BASES = new Map(), ST = { generees: 0, bases: 0, ms: 0, octets: 0, textures: 0, detail: {} };
  function compter(nom, t0) { const d = now() - t0; ST.ms += d; ST.detail[nom] = (ST.detail[nom] || 0) + d; }
  function marquer(tx, octets, cle) { // partagée : ni MODELES.dispose ni rendu.liberer ne la libèrent ; seul vider() le fait
    tx.userData.partagee = true; tx.userData.ptex = cle; tx.userData.octets = octets; ST.octets += octets; ST.textures++; ST.generees++; return tx;
  }
  const memo = (cle, f) => { let v = CACHE.get(cle); if (v === undefined) { v = f(); CACHE.set(cle, v); } return v; };

  // ═══════════════════════════════ outils ═══════════════════════════════
  function mulberry32(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  const versS = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
  function rgb(h) { // '#rgb', '#rrggbb', nombre ou [r, g, b] → [r, g, b] (0..255)
    if (Array.isArray(h)) return h; if (typeof h === 'number') return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    let s = String(h || '').replace('#', '').trim(); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const n = parseInt(s, 16); return /^[0-9a-f]{6}$/i.test(s) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
  }
  const css = (c, a) => (a == null ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  const fois = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const mel = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const choisir = (rnd, l) => l[Math.floor(rnd() * l.length) % l.length];
  function varie(rnd, c, j, h) { const k = 1 + (rnd() * 2 - 1) * j, w = (rnd() * 2 - 1) * (h || 0); return [Math.min(255, c[0] * k * (1 + w)), Math.min(255, c[1] * k), Math.min(255, c[2] * k * (1 - w))]; }
  function partage(rnd, total, a, b) { const l = []; let s = 0; while (s < total - a * 0.5) { const v = a + rnd() * (b - a); l.push(v); s += v; } const k = total / s; return l.map((v) => v * k); } // des longueurs entre a et b, de somme exacte
  // un dessin qui déborde du carré S × S est répété de l'autre côté : la texture se raccorde sans couture
  function tore(S, x0, y0, x1, y1, f) { const xs = x0 < 0 ? [0, S] : x1 > S ? [0, -S] : [0], ys = y0 < 0 ? [0, S] : y1 > S ? [0, -S] : [0]; for (const dx of xs) for (const dy of ys) f(dx, dy); }
  function chemin(c, p, dx, dy) { c.beginPath(); c.moveTo(p[0][0] + dx, p[0][1] + dy); for (let i = 1; i < p.length; i++) c.lineTo(p[i][0] + dx, p[i][1] + dy); c.closePath(); }
  function rondRect(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
  // un polygone de pierre : une super-ellipse (rectangle aux coins ronds) bosselée, inscrite dans (x, y, w, h)
  function caillou(rnd, x, y, w, h, irr, n) {
    n = n || 11 + Math.floor(rnd() * 5); const p = [], cx = x + w / 2, cy = y + h / 2, e = 2.6 + rnd() * 1.8, ph = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a = ph + (i + (rnd() - 0.5) * 0.6) / n * TAU, ca = Math.cos(a), sa = Math.sin(a), r = Math.pow(Math.pow(Math.abs(ca), e) + Math.pow(Math.abs(sa), e), -1 / e), j = 1 - irr * rnd();
      p.push([cx + ca * r * w / 2 * j, cy + sa * r * h / 2 * j]);
    }
    return p;
  }
  // une pierre en relief : ombre portée en bas à droite, liseré éclairé en haut à gauche, corps dégradé (lumière du haut)
  function pierre(c, S, p, x, y, w, h, coul, o) {
    const om = o.ombre == null ? 1 : o.ombre, ox = Math.max(0.8, w * 0.025) * om, oy = Math.max(1, h * 0.05) * om, cl = fois(coul, 1.13), cs = fois(coul, 0.86);
    tore(S, x - 3, y - 3, x + w + 4, y + h + 4, (dx, dy) => {
      c.fillStyle = o.ombreC || 'rgba(48,38,28,0.42)'; chemin(c, p, dx + ox, dy + oy); c.fill();
      c.fillStyle = css(cl); chemin(c, p, dx - ox * 0.6, dy - oy * 0.6); c.fill();
      const g = c.createLinearGradient(0, y + dy, 0, y + h + dy); g.addColorStop(0, css(fois(coul, 1.04))); g.addColorStop(0.55, css(coul)); g.addColorStop(1, css(cs));
      c.fillStyle = g; chemin(c, p, dx, dy); c.fill();
    });
  }
  // des taches fines (grains de sable, pores) : deux chemins (clair, sombre), deux remplissages
  function grains(c, S, rnd, n, taille, clair, sombre) { const a = new Path2D(), b = new Path2D(); for (let i = 0; i < n; i++) { const t = taille * (0.5 + rnd()); (rnd() < 0.5 ? a : b).rect(rnd() * S, rnd() * S, t, t); } c.fillStyle = clair; c.fill(a); c.fillStyle = sombre; c.fill(b); }
  // des cailloux en lots (gravier, gravillons, mottes) : une ombre, des groupes de couleur, un reflet ; raccordés sur les bords
  function cailloux(c, S, rnd, n, r0, r1, pal, o) {
    o = o || {}; const om = new Path2D(), re = new Path2D(), gr = []; for (const col of pal) for (const k of [0.86, 1, 1.12]) gr.push({ col: fois(col, k), p: new Path2D() });
    for (let i = 0; i < n; i++) {
      const r = r0 + (r1 - r0) * Math.pow(rnd(), o.puissance || 1.6), x = rnd() * S, y = rnd() * S, a = rnd() * 3, e = 0.55 + rnd() * 0.35, g = gr[Math.floor(rnd() * gr.length)].p;
      tore(S, x - r - 2, y - r - 2, x + r + 2, y + r + 2, (dx, dy) => {
        om.moveTo(x + dx + r * 1.3, y + dy + r * 0.4); om.ellipse(x + dx + r * 0.3, y + dy + r * 0.4, r, r * e, a, 0, TAU);
        g.moveTo(x + dx + r, y + dy); g.ellipse(x + dx, y + dy, r, r * e, a, 0, TAU);
        if (r > 1.6) { re.moveTo(x + dx, y + dy - r * 0.3); re.ellipse(x + dx - r * 0.25, y + dy - r * 0.3, r * 0.35, r * 0.22 * e, a, 0, TAU); }
      });
    }
    c.fillStyle = o.ombre || 'rgba(34,28,22,0.5)'; c.fill(om); for (const g of gr) { c.fillStyle = css(g.col); c.fill(g.p); } c.fillStyle = o.reflet || 'rgba(255,255,248,0.28)'; c.fill(re);
  }
  // une coulure : un filet vertical qui s'efface vers le bas (raccordé en haut et en bas)
  function coulure(c, S, x, y, l, w, coul, a) {
    tore(S, x - w, y, x + w, y + l, (dx, dy) => { const g = c.createLinearGradient(0, y + dy, 0, y + l + dy); g.addColorStop(0, css(coul, a)); g.addColorStop(0.35, css(coul, a * 0.6)); g.addColorStop(1, css(coul, 0)); c.fillStyle = g; c.fillRect(x - w / 2 + dx, y + dy, w, l); });
  }
  // une fissure : une marche au hasard, fine, qui se ramifie parfois
  function fissure(c, S, rnd, x, y, n, pas, coul, w) {
    let a = rnd() * TAU; c.strokeStyle = coul; c.lineWidth = w; c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const nx = x + Math.cos(a) * pas, ny = y + Math.sin(a) * pas;
      tore(S, Math.min(x, nx) - 1, Math.min(y, ny) - 1, Math.max(x, nx) + 1, Math.max(y, ny) + 1, (dx, dy) => { c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(nx + dx, ny + dy); c.stroke(); });
      x = ((nx % S) + S) % S; y = ((ny % S) + S) % S; a += (rnd() - 0.5) * 1.1;
      if (rnd() < 0.06 && n > 6) fissure(c, S, rnd, x, y, Math.floor(n / 3), pas * 0.8, coul, w * 0.7);
    }
  }

  // ─── les bruits périodiques (une fois par taille, partagés par toutes les textures) ───
  function fbm(n, c0, c1, graine, pers) { // somme d'octaves de bruit de valeur périodique (période n), normalisée dans [-1, 1]
    const out = new Float32Array(n * n), rnd = mulberry32(graine); let amp = 1;
    for (let c = c0; c <= c1 && c <= n; c *= 2, amp *= pers || 0.62) {
      const L = new Float32Array(c * c); for (let i = 0; i < L.length; i++) L[i] = rnd() * 2 - 1;
      const s = n / c, i0 = new Int32Array(n), i1 = new Int32Array(n), w = new Float32Array(n);
      for (let x = 0; x < n; x++) { const f = x / s, k = Math.floor(f), t = f - k; i0[x] = k % c; i1[x] = (k + 1) % c; w[x] = t * t * (3 - 2 * t); }
      for (let y = 0; y < n; y++) {
        const ra = i0[y] * c, rb = i1[y] * c, wy = w[y], o = y * n;
        for (let x = 0; x < n; x++) { const a = L[ra + i0[x]], b = L[ra + i1[x]], d = L[rb + i0[x]], e = L[rb + i1[x]], wx = w[x], h = a + (b - a) * wx, g = d + (e - d) * wx; out[o + x] += amp * (h + (g - h) * wy); }
      }
    }
    let mn = Infinity, mx = -Infinity; for (let i = 0; i < out.length; i++) { const v = out[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const k = 2 / Math.max(1e-6, mx - mn); for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) * k - 1;
    return out;
  }
  function agrandir(src, n, S) { // bilinéaire, périodique
    if (n === S) return src; const out = new Float32Array(S * S), k = n / S, m = n - 1;
    for (let y = 0; y < S; y++) { const fy = y * k, j0 = Math.floor(fy), ty = fy - j0, a0 = (j0 & m) * n, a1 = ((j0 + 1) & m) * n, o = y * S; for (let x = 0; x < S; x++) { const fx = x * k, i0 = Math.floor(fx), tx = fx - i0, b0 = i0 & m, b1 = (i0 + 1) & m, h = src[a0 + b0] + (src[a0 + b1] - src[a0 + b0]) * tx, g = src[a1 + b0] + (src[a1 + b1] - src[a1 + b0]) * tx; out[o + x] = h + (g - h) * ty; } }
    return out;
  }
  const CHAMPS = new Map();
  function champs(S) { // bas (taches de 1 m et plus), moyen (10 à 40 cm), grain (pixel), bosse (grain adouci, pour le relief)
    let F = CHAMPS.get(S); if (F) return F;
    const t0 = now(), nb = Math.min(S, 128), nm = Math.min(S, 256);
    const bas = agrandir(fbm(nb, 2, 16, 101, 0.6), nb, S), moyen = agrandir(fbm(nm, 8, 64, 202, 0.7), nm, S);
    const grain = new Float32Array(S * S), bosse = new Float32Array(S * S), r = mulberry32(303), m = S - 1;
    for (let i = 0; i < grain.length; i++) grain[i] = r() * 2 - 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { let s = 0; for (let j = -1; j <= 1; j++) { const o = ((y + j) & m) * S; s += grain[o + ((x - 1) & m)] + grain[o + x] * 2 + grain[o + ((x + 1) & m)]; } bosse[y * S + x] = s * 0.42; }
    F = { bas, moyen, grain, bosse }; CHAMPS.set(S, F); compter('bruits', t0); return F;
  }
  // la passe finale : bruits multi-échelles, relief (le grain éclairé du haut à gauche), une dérive chaude / froide ; écrit les octets
  // retournés (ligne du bas en premier) et rend la couleur moyenne linéaire
  function finir(src, S, o, out, graine) {
    const F = champs(S), m = S - 1, r = mulberry32(graine), d = () => Math.floor(r() * S);
    const ab = o.bas || 0, am = o.moyen || 0, ag = o.grain || 0, ar = o.relief || 0, ah = o.chaud || 0;
    const xb = d(), yb = d(), xm = d(), ym = d(), xg = d(), yg = d(), xh = d(), yh = d(), B = F.bas, Mo = F.moyen, G = F.grain, Bo = F.bosse;
    let sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < S; y++) {
      const lb = ((y + yb) & m) * S, lm = ((y + ym) & m) * S, lg = ((y + yg) & m) * S, lh = ((y + yh) & m) * S, la = ((y + yg - 1) & m) * S, lc = ((y + yg + 1) & m) * S, ri = y * S * 4, ro = (m - y) * S * 4;
      for (let x = 0; x < S; x++) {
        const xg2 = (x + xg) & m, f = 1 + ab * B[lb + ((x + xb) & m)] + am * Mo[lm + ((x + xm) & m)] + ag * G[lg + xg2] + ar * (Bo[la + ((xg2 - 1) & m)] - Bo[lc + ((xg2 + 1) & m)]), h = ah * Mo[lh + ((x + xh) & m)];
        const i = ri + x * 4, k = ro + x * 4;
        out[k] = src[i] * f * (1 + h); out[k + 1] = src[i + 1] * f; out[k + 2] = src[i + 2] * f * (1 - h); out[k + 3] = 255;
        sr += LIN[out[k]]; sg += LIN[out[k + 1]]; sb += LIN[out[k + 2]];
      }
    }
    const n = S * S; return [sr / n, sg / n, sb / n];
  }
  // des toiles de travail réutilisées (lues souvent : sur le processeur, pas de relecture lente du GPU)
  const TOILES = new Map();
  function toile(S) { let t = TOILES.get(S); if (!t) { const cv = document.createElement('canvas'); cv.width = cv.height = S; t = { cv, c: cv.getContext('2d', { willReadFrequently: true }) }; TOILES.set(S, t); } const c = t.c; c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, S, S); return c; }
  // une matière : peinte une fois par taille, gardée en octets (et sa moyenne) ; les teintes et les tableaux de couches en dérivent
  function base(cle, S, peindre) {
    const k = cle + '|' + S; let b = BASES.get(k); if (b) return b;
    const t0 = now(), c = toile(S), g = hash(cle), rnd = mulberry32(g), o = peindre(c, S, rnd) || {};
    const src = c.getImageData(0, 0, S, S).data, d = new Uint8ClampedArray(S * S * 4), moy = finir(src, S, o, d, g ^ 0x9E3779B9);
    b = { d, S, moy, cle }; BASES.set(k, b); ST.bases++; compter(cle.split('|')[0], t0); return b;
  }
  function teinter(b, hex) { // les octets de la matière, mis à l'échelle (en linéaire, par canal) pour que la moyenne soit hex
    const t = rgb(hex); if (!t) return b.d;
    const lut = [0, 1, 2].map((ch) => { const f = LIN[t[ch]] / Math.max(1e-4, b.moy[ch]), l = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) l[v] = versS(LIN[v] * f); return l; });
    const s = b.d, d = new Uint8ClampedArray(s.length), l0 = lut[0], l1 = lut[1], l2 = lut[2];
    for (let i = 0; i < s.length; i += 4) { d[i] = l0[s[i]]; d[i + 1] = l1[s[i + 1]]; d[i + 2] = l2[s[i + 2]]; d[i + 3] = 255; }
    return d;
  }
  function texData(d, S, donnees, cle) { // une DataTexture répétée, mipmaps, anisotropie ; sRGB (couleurs) ou brute (données)
    const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = Q.aniso; t.colorSpace = donnees ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.name = cle; t.needsUpdate = true;
    return marquer(t, Math.round(S * S * 4 * 4 / 3), cle);
  }

  // ═══════════════════════════════ les façades (3 m × 3 m : une travée d'un étage) ═══════════════════════════════
  // Repère du dessin : x le long du mur, y vers le bas (haut de l'étage en y = 0, plancher en y = S) ; la fenêtre type est centrée,
  // son appui à 32 % de la hauteur (v = 0,32) : les coulures partent de là.
  const PER = { mur: [3, 3], toit: [3, 3], sol: { asphalte: [4, 4], paves: [2, 2], gravier: [2, 2], herbe: [2.5, 2.5], terre: [3, 3] } };
  const CALCAIRE = [[217, 205, 184], [207, 194, 168], [224, 214, 195], [196, 182, 155], [212, 195, 162], [189, 178, 160], [201, 180, 142], [220, 210, 190], [179, 168, 145], [208, 200, 186]];
  function pCrepi(c, S, rnd) {
    const k = S / 3; c.fillStyle = '#EDE9E2'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 7; i++) { // reprises d'enduit, auréoles d'humidité
      const x = rnd() * S, y = rnd() * S, r = (0.25 + rnd() * 0.6) * k, cl = rnd() < 0.5;
      tore(S, x - r, y - r, x + r, y + r, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); g.addColorStop(0, cl ? 'rgba(255,253,245,0.10)' : 'rgba(120,104,82,0.07)'); g.addColorStop(1, 'rgba(120,104,82,0)'); c.fillStyle = g; c.fillRect(x - r + dx, y - r + dy, 2 * r, 2 * r); });
    }
    const sale = [92, 80, 66], yA = S * (1 - 0.32);
    for (const u of [0.355, 0.645]) for (let i = 0; i < 4; i++) coulure(c, S, S * u + (rnd() - 0.5) * 0.12 * k, yA + rnd() * 3, (0.3 + rnd() * 0.65) * k, 1 + rnd() * 3.5, sale, 0.05 + rnd() * 0.07);
    for (let i = 0; i < 9; i++) coulure(c, S, rnd() * S, rnd() * S, (0.4 + rnd() * 1.2) * k, 1 + rnd() * 5, sale, 0.025 + rnd() * 0.035);
    for (let i = 0; i < 3; i++) fissure(c, S, rnd, rnd() * S, rnd() * S, 6 + Math.floor(rnd() * 12), S / 90, 'rgba(78,66,54,0.32)', Math.max(0.6, S / 700));
    grains(c, S, rnd, Math.round(S * S / 140), S / 420, 'rgba(255,255,252,0.45)', 'rgba(96,84,70,0.30)');
    return { bas: 0.045, moyen: 0.05, grain: 0.07, relief: 0.10, chaud: 0.012 };
  }
  // des moellons calcaires assisés : rangs de 13 à 30 cm, joints de chaux, quelques cales dans les joints
  function moellons(c, S, rnd, o) {
    const k = S / 3; o = o || {};
    c.fillStyle = css(o.mortier || [203, 192, 171]); c.fillRect(0, 0, S, S);
    grains(c, S, rnd, Math.round(S * S / 90), S / 300, 'rgba(240,232,215,0.5)', 'rgba(110,98,80,0.35)');
    const pal = o.pal || CALCAIRE, rangs = partage(rnd, S, 0.13 * k, 0.30 * k); let y = 0;
    for (const h of rangs) {
      const larg = partage(rnd, S, 0.18 * k, 0.5 * k); let x = rnd() * S;
      for (const w of larg) {
        const j = (0.011 + rnd() * 0.014) * k, ty = rnd() < 0.2 ? h * (0.15 + rnd() * 0.2) : 0, x0 = (x % S) + j, y0 = y + j + ty * 0.5, ww = w - 2 * j, hh = h - 2 * j - ty;
        if (ww > 3 && hh > 3) { const col = varie(rnd, choisir(rnd, pal), 0.07, 0.025); pierre(c, S, caillou(rnd, x0, y0, ww, hh, 0.13), x0, y0, ww, hh, col, o); if (rnd() < 0.12) { const lx = x0 + rnd() * ww * 0.6, ly = y0 + rnd() * hh * 0.6, lr = (0.02 + rnd() * 0.04) * k; c.fillStyle = rnd() < 0.5 ? 'rgba(140,138,96,0.35)' : 'rgba(95,88,78,0.28)'; tore(S, lx - lr, ly - lr, lx + lr, ly + lr, (dx, dy) => { c.beginPath(); c.ellipse(lx + dx, ly + dy, lr, lr * 0.7, rnd() * 3, 0, TAU); c.fill(); }); } }
        x += w;
      }
      y += h;
    }
    for (let i = 0; i < 18; i++) { const x = rnd() * S, y2 = rnd() * S, w = (0.05 + rnd() * 0.06) * k, h = w * (0.4 + rnd() * 0.4); pierre(c, S, caillou(rnd, x, y2, w, h, 0.2, 8), x, y2, w, h, varie(rnd, choisir(rnd, pal), 0.1), o); } // les cales
  }
  function pPierre(c, S, rnd) { moellons(c, S, rnd); return { bas: 0.05, moyen: 0.07, grain: 0.09, relief: 0.08, chaud: 0.025 }; }
  function pTaille(c, S, rnd) { // pierre de taille : 8 assises de 37,5 cm, blocs de 45 cm à 1 m en quinconce, joints fins, layage
    const k = S / 3, h = S / 8, j = Math.max(1, 0.009 * k); c.fillStyle = '#B9AE9B'; c.fillRect(0, 0, S, S);
    const stries = document.createElement('canvas'); stries.width = stries.height = 32; { const s = stries.getContext('2d'); s.strokeStyle = 'rgba(80,70,55,0.5)'; s.lineWidth = 1; for (let i = -32; i < 64; i += 4) { s.beginPath(); s.moveTo(i, 0); s.lineTo(i + 32, 32); s.stroke(); } }
    const motif = c.createPattern(stries, 'repeat');
    for (let r = 0; r < 8; r++) {
      const larg = partage(rnd, S, 0.45 * k, 1.0 * k); let x = rnd() * S; const y = r * h;
      for (const w of larg) {
        const col = varie(rnd, choisir(rnd, [[222, 214, 196], [215, 205, 185], [228, 221, 205], [210, 198, 176], [219, 208, 186]]), 0.05, 0.02), x0 = (x % S) + j / 2, y0 = y + j / 2, ww = w - j, hh = h - j;
        tore(S, x0 - 2, y0 - 2, x0 + ww + 2, y0 + hh + 2, (dx, dy) => {
          c.fillStyle = css(fois(col, 0.8)); c.fillRect(x0 + dx, y0 + dy, ww, hh);
          c.fillStyle = css(fois(col, 1.1)); c.fillRect(x0 + dx, y0 + dy, ww - 1.5, hh - 1.5);
          const g = c.createLinearGradient(0, y0 + dy, 0, y0 + hh + dy); g.addColorStop(0, css(fois(col, 1.03))); g.addColorStop(1, css(fois(col, 0.93))); c.fillStyle = g; c.fillRect(x0 + dx + 1.2, y0 + dy + 1.2, ww - 2.6, hh - 2.6);
          c.globalAlpha = 0.06 + rnd() * 0.05; c.fillStyle = motif; c.fillRect(x0 + dx + 2, y0 + dy + 2, ww - 4, hh - 4); c.globalAlpha = 1;
        });
        if (rnd() < 0.25) coulure(c, S, x0 + rnd() * ww, y0 + hh * rnd() * 0.5, (0.2 + rnd() * 0.5) * k, 2 + rnd() * 6, [70, 66, 58], 0.06 + rnd() * 0.06);
        x += w;
      }
    }
    for (let i = 0; i < 5; i++) coulure(c, S, rnd() * S, rnd() * S, (0.5 + rnd() * 1.4) * k, 2 + rnd() * 8, [64, 60, 52], 0.04 + rnd() * 0.05);
    grains(c, S, rnd, Math.round(S * S / 160), S / 420, 'rgba(255,252,240,0.4)', 'rgba(90,80,64,0.3)');
    return { bas: 0.05, moyen: 0.05, grain: 0.06, relief: 0.07, chaud: 0.015 };
  }
  function pMixte(c, S, rnd) { // enduit à pierres vues : un vieil enduit de chaux tombé par plaques, les moellons dessous
    moellons(c, S, rnd, { ombre: 0.8 });
    const k = S / 3, trous = [], boites = [];
    for (let i = 0; i < 40 && boites.length < 7; i++) { // des lacunes qui ne se chevauchent pas (remplissage pair-impair)
      const w = (0.35 + rnd() * 0.75) * k, h = w * (0.45 + rnd() * 0.5), x = rnd() * S, y = rnd() * S;
      if (boites.some((q) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) if (x + ox < q[2] + 6 && x + w + ox > q[0] - 6 && y + oy < q[3] + 6 && y + h + oy > q[1] - 6) return true; return false; })) continue;
      boites.push([x, y, x + w, y + h]); const p = caillou(rnd, x, y, w, h, 0.38, 22); tore(S, x, y, x + w, y + h, (dx, dy) => trous.push(p.map((q) => [q[0] + dx, q[1] + dy])));
    }
    const enduit = (dx, dy) => { const p = new Path2D(); p.rect(-4, -4, S + 8, S + 8); for (const t of trous) { p.moveTo(t[0][0] + dx, t[0][1] + dy); for (let i = 1; i < t.length; i++) p.lineTo(t[i][0] + dx, t[i][1] + dy); p.closePath(); } return p; };
    c.fillStyle = 'rgba(44,34,24,0.55)'; c.fill(enduit(2.5, 3.5), 'evenodd'); // l'épaisseur de l'enduit : son ombre sur les pierres
    c.fillStyle = 'rgba(252,246,230,0.95)'; c.fill(enduit(-1.3, -1.3), 'evenodd'); // et son arête éclairée
    const e = enduit(0, 0); c.fillStyle = '#E2D3B8'; c.fill(e, 'evenodd');
    c.save(); c.clip(e, 'evenodd'); grains(c, S, rnd, Math.round(S * S / 120), S / 400, 'rgba(255,250,236,0.5)', 'rgba(110,96,76,0.32)');
    for (let i = 0; i < 8; i++) coulure(c, S, rnd() * S, rnd() * S, (0.4 + rnd()) * k, 2 + rnd() * 5, [96, 84, 66], 0.05 + rnd() * 0.04);
    c.restore();
    return { bas: 0.05, moyen: 0.06, grain: 0.08, relief: 0.09, chaud: 0.02 };
  }
  function pBrique(c, S, rnd) { // briques de 21 × 5,5 cm, appareil en panneresses, joints de 1 cm
    const R = 44, B = 14, h = S / R, w = S / B, j = Math.max(1, h * 0.17); c.fillStyle = '#BFB6A6'; c.fillRect(0, 0, S, S);
    grains(c, S, rnd, Math.round(S * S / 80), S / 400, 'rgba(235,228,214,0.6)', 'rgba(110,100,86,0.4)');
    const pal = [[178, 84, 56], [166, 74, 50], [190, 100, 64], [156, 70, 50], [182, 106, 74], [141, 62, 44], [196, 116, 80], [170, 92, 66]];
    for (let r = 0; r < R; r++) for (let b = 0; b < B; b++) {
      const x = b * w + (r % 2 ? w / 2 : 0) + j / 2, y = r * h + j / 2, ww = w - j, hh = h - j, col = rnd() < 0.06 ? varie(rnd, [110, 52, 38], 0.1) : varie(rnd, choisir(rnd, pal), 0.08, 0.04), bout = rnd();
      tore(S, x - 1, y - 1, x + ww + 2, y + hh + 2, (dx, dy) => {
        c.fillStyle = 'rgba(60,40,30,0.4)'; c.fillRect(x + dx + 0.8, y + dy + 1, ww, hh);
        c.fillStyle = css(col); c.fillRect(x + dx, y + dy, ww, hh); c.fillStyle = css(fois(col, 1.12), 0.6); c.fillRect(x + dx, y + dy, ww, Math.max(0.8, hh * 0.14));
        if (bout < 0.35) { c.fillStyle = css(fois(col, 0.72), 0.7); c.fillRect(bout < 0.17 ? x + dx : x + dx + ww * 0.75, y + dy, ww * 0.25, hh); } // une brique flammée à un bout
      });
    }
    for (let i = 0; i < 6; i++) coulure(c, S, rnd() * S, rnd() * S, (0.4 + rnd()) * S / 3, 3 + rnd() * 6, [70, 56, 46], 0.05);
    grains(c, S, rnd, Math.round(S * S / 200), S / 360, 'rgba(230,200,170,0.35)', 'rgba(60,30,20,0.35)');
    return { bas: 0.06, moyen: 0.06, grain: 0.1, relief: 0.06, chaud: 0.02 };
  }
  function pBeton(c, S, rnd) { // béton banché : levées de 1 m, panneaux de 1,5 m, trous de banches, coulures, bullage
    const k = S / 3; c.fillStyle = '#B9B6AE'; c.fillRect(0, 0, S, S);
    for (let r = 0; r < 3; r++) for (let p = 0; p < 2; p++) {
      const x = p * 1.5 * k + (r % 2) * 0.75 * k, y = r * k, col = varie(rnd, [185, 182, 174], 0.035);
      tore(S, x, y, x + 1.5 * k, y + k, (dx, dy) => { c.fillStyle = css(col); c.fillRect(x + dx, y + dy, 1.5 * k, k); c.fillStyle = 'rgba(70,68,62,0.35)'; c.fillRect(x + dx, y + dy, 1.5 * k, 1.2); c.fillRect(x + dx, y + dy, 1.2, k); c.fillStyle = 'rgba(255,255,250,0.25)'; c.fillRect(x + dx, y + dy + 1.2, 1.5 * k, 1); });
      for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) { const tx = x + u * 1.5 * k, ty = y + v * k, tr = Math.max(1.5, 0.014 * k); tore(S, tx - 4, ty - 4, tx + 4, ty + 4, (dx, dy) => { c.fillStyle = 'rgba(220,218,210,0.8)'; c.beginPath(); c.arc(tx + dx, ty + dy, tr * 1.7, 0, TAU); c.fill(); c.fillStyle = 'rgba(52,50,46,0.85)'; c.beginPath(); c.arc(tx + dx, ty + dy, tr, 0, TAU); c.fill(); }); coulure(c, S, tx, ty + tr, (0.15 + rnd() * 0.35) * k, 2 + rnd() * 3, [80, 76, 68], 0.12); }
    }
    for (let i = 0; i < 10; i++) coulure(c, S, rnd() * S, rnd() * S, (0.5 + rnd() * 1.5) * k, 3 + rnd() * 12, [70, 68, 60], 0.04 + rnd() * 0.05);
    grains(c, S, rnd, Math.round(S * S / 120), S / 350, 'rgba(235,234,228,0.5)', 'rgba(60,58,54,0.5)');
    return { bas: 0.08, moyen: 0.07, grain: 0.07, relief: 0.05 };
  }
  function pBois(c, S, rnd) { // bardage de planches verticales de 15 cm, bois grisé, fil, nœuds, pointes
    const N = 20, w = S / N, k = S / 3; c.fillStyle = '#3A3028'; c.fillRect(0, 0, S, S);
    const pal = [[138, 115, 92], [123, 102, 80], [147, 125, 102], [111, 91, 72], [133, 127, 117], [120, 108, 96]];
    for (let i = 0; i < N; i++) {
      const x = i * w, col = varie(rnd, choisir(rnd, pal), 0.07, 0.03), g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, css(fois(col, 1.12))); g.addColorStop(0.15, css(col)); g.addColorStop(0.85, css(fois(col, 0.95))); g.addColorStop(1, css(fois(col, 0.75)));
      c.fillStyle = g; c.fillRect(x + 1, 0, w - 2, S);
      c.lineWidth = Math.max(0.6, S / 700);
      for (let f = 0; f < 9; f++) { // le fil du bois : des lignes ondulées raccordées en haut et en bas
        const x0 = x + 2 + rnd() * (w - 4), a = 0.6 + rnd() * 1.6, ph = rnd() * TAU, nb = 1 + Math.floor(rnd() * 3); c.strokeStyle = rnd() < 0.6 ? 'rgba(60,46,34,0.22)' : 'rgba(210,196,176,0.18)'; c.beginPath();
        for (let y = 0; y <= S; y += S / 32) { const xx = x0 + Math.sin(y / S * TAU * nb + ph) * a; if (y === 0) c.moveTo(xx, y); else c.lineTo(xx, y); } c.stroke();
      }
      if (rnd() < 0.5) { const ny = rnd() * S, nx = x + w * (0.3 + rnd() * 0.4), r = w * (0.12 + rnd() * 0.1); tore(S, nx - r * 3, ny - r * 3, nx + r * 3, ny + r * 3, (dx, dy) => { c.strokeStyle = 'rgba(60,44,30,0.3)'; for (let q = 3; q >= 1; q--) { c.beginPath(); c.ellipse(nx + dx, ny + dy, r * q * 0.7, r * q * 1.6, 0, 0, TAU); c.stroke(); } c.fillStyle = 'rgba(52,38,26,0.75)'; c.beginPath(); c.ellipse(nx + dx, ny + dy, r * 0.6, r * 0.9, 0, 0, TAU); c.fill(); }); }
      for (const v of [0.12, 0.62]) { const py = v * S + (rnd() - 0.5) * 4; c.fillStyle = 'rgba(40,36,34,0.8)'; c.fillRect(x + w / 2 - 1, py, 2, 2); coulure(c, S, x + w / 2, py + 2, (0.1 + rnd() * 0.3) * k, 2, [70, 50, 40], 0.12); }
    }
    return { bas: 0.06, moyen: 0.05, grain: 0.07, relief: 0.05, chaud: 0.03 };
  }

  // ═══════════════════════════════ les toits (3 m × 3 m ; y = 0 côté faîtage, y = S côté gouttière) ═══════════════════════════════
  const TUILES = [[181, 86, 47], [166, 75, 44], [192, 101, 58], [154, 74, 48], [184, 95, 63], [142, 68, 48], [199, 113, 74], [172, 88, 56], [160, 92, 66]];
  function mousse(c, S, rnd, x, y, r) { c.fillStyle = choisir(rnd, ['rgba(150,156,88,0.55)', 'rgba(185,178,108,0.5)', 'rgba(120,128,80,0.5)', 'rgba(210,205,160,0.45)']); tore(S, x - r, y - r, x + r, y + r, (dx, dy) => { for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x + dx + (rnd() - 0.5) * r, y + dy + (rnd() - 0.5) * r * 0.5, r * (0.3 + rnd() * 0.4), r * (0.2 + rnd() * 0.25), 0, 0, TAU); c.fill(); } }); }
  function pMecaniques(c, S, rnd) { // tuiles mécaniques à côtes (≈ 21 × 33 cm), rangs alignés, posés de la gouttière vers le faîtage
    const C = 14, R = 9, w = S / C, h = S / R; c.fillStyle = '#3B2219'; c.fillRect(0, 0, S, S);
    for (let r = R - 1; r >= 0; r--) for (let i = 0; i < C; i++) {
      const x = i * w + (rnd() - 0.5) * 1.2, y = r * h + (rnd() - 0.5) * 1, col = varie(rnd, choisir(rnd, TUILES), 0.07, 0.03), ov = h * 0.2;
      tore(S, x - 2, y - 2, x + w + 2, y + h + ov + 2, (dx, dy) => {
        c.fillStyle = 'rgba(30,14,8,0.55)'; c.fillRect(x + dx + 1, y + dy + h - 1, w - 1, ov * 0.55);
        const g = c.createLinearGradient(0, y + dy, 0, y + h + dy); g.addColorStop(0, css(fois(col, 0.9))); g.addColorStop(0.75, css(col)); g.addColorStop(1, css(fois(col, 1.1))); c.fillStyle = g;
        rondRect(c, x + dx + 0.5, y + dy, w - 1, h + 1, w * 0.1); c.fill();
        const cotes = [[0.22, 0.1], [0.5, 0.12], [0.78, 0.1]]; // les côtes : un reflet à gauche, une ombre à droite
        for (const [u, l] of cotes) { const cx = x + dx + u * w, lw = l * w; c.fillStyle = css(fois(col, 1.18), 0.75); c.fillRect(cx - lw / 2, y + dy + 1, lw * 0.45, h - 2); c.fillStyle = css(fois(col, 0.7), 0.6); c.fillRect(cx + lw * 0.05, y + dy + 1, lw * 0.5, h - 2); }
        c.fillStyle = css(fois(col, 0.62), 0.8); c.fillRect(x + dx + 0.5, y + dy + h * 0.1, Math.max(1, w * 0.05), h * 0.85);
      });
      if (rnd() < 0.08) mousse(c, S, rnd, x + rnd() * w, y + h * (0.7 + rnd() * 0.3), w * (0.15 + rnd() * 0.25));
    }
    return { bas: 0.08, moyen: 0.07, grain: 0.07, relief: 0.05, chaud: 0.03 };
  }
  function pCanal(c, S, rnd) { // tuiles canal (creuses) : courants et couvrants alternés, bouts arrondis, mousse dans les courants
    const C = 16, R = 9, w = S / C, h = S / R; c.fillStyle = '#2E1A12'; c.fillRect(0, 0, S, S);
    for (let r = R - 1; r >= 0; r--) for (let i = 0; i < C; i++) {
      const couvert = i % 2 === 1, x = i * w - (couvert ? w * 0.12 : -w * 0.04), ww = couvert ? w * 1.24 : w * 0.92, y = r * h + (couvert ? h * 0.5 : 0) + (rnd() - 0.5) * 2, col = varie(rnd, rnd() < 0.12 ? [196, 150, 112] : choisir(rnd, TUILES), 0.08, 0.04);
      tore(S, x - 2, y - 2, x + ww + 2, y + h + h * 0.4, (dx, dy) => {
        const bx = x + dx, by = y + dy, bas = by + h + (couvert ? h * 0.12 : h * 0.02);
        if (couvert) { c.fillStyle = 'rgba(20,10,6,0.55)'; c.beginPath(); c.ellipse(bx + ww / 2 + 1, bas, ww * 0.5, h * 0.2, 0, 0, Math.PI); c.fill(); }
        const g = c.createLinearGradient(bx, 0, bx + ww, 0);
        if (couvert) { g.addColorStop(0, css(fois(col, 0.6))); g.addColorStop(0.3, css(fois(col, 1.22))); g.addColorStop(0.55, css(fois(col, 1.05))); g.addColorStop(1, css(fois(col, 0.55))); }
        else { g.addColorStop(0, css(fois(col, 0.95))); g.addColorStop(0.5, css(fois(col, 0.66))); g.addColorStop(1, css(fois(col, 0.9))); }
        c.fillStyle = g; c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ww, by);
        if (couvert) { c.lineTo(bx + ww, bas - h * 0.1); c.quadraticCurveTo(bx + ww / 2, bas + h * 0.16, bx, bas - h * 0.1); } else { c.lineTo(bx + ww, bas); c.quadraticCurveTo(bx + ww / 2, bas - h * 0.18, bx, bas); }
        c.closePath(); c.fill();
      });
      if (!couvert && rnd() < 0.25) mousse(c, S, rnd, x + ww / 2, y + h * (0.6 + rnd() * 0.4), w * 0.35);
      else if (rnd() < 0.05) mousse(c, S, rnd, x + ww * rnd(), y + h * rnd(), w * 0.3);
    }
    return { bas: 0.08, moyen: 0.08, grain: 0.07, relief: 0.05, chaud: 0.04 };
  }
  function pEcailles(c, S, rnd) { // tuiles plates écailles (Bugey) : 17 × 12,5 cm visibles, en quinconce, bout arrondi
    const C = 18, R = 24, w = S / C, h = S / R; c.fillStyle = '#2E1A12'; c.fillRect(0, 0, S, S);
    for (let r = R - 1; r >= 0; r--) for (let i = 0; i < C; i++) {
      const x = i * w + (r % 2 ? w / 2 : 0), y = r * h - h * 0.6, col = varie(rnd, choisir(rnd, TUILES), 0.09, 0.04), H2 = h * 1.6;
      tore(S, x - 2, y - 2, x + w + 2, y + H2 + 4, (dx, dy) => {
        const bx = x + dx + 0.6, by = y + dy, ww = w - 1.2;
        c.fillStyle = 'rgba(25,12,6,0.5)'; c.beginPath(); c.ellipse(bx + ww / 2 + 0.8, by + H2 - ww * 0.18 + 1.6, ww / 2, ww * 0.42, 0, 0, Math.PI); c.fill();
        const g = c.createLinearGradient(0, by, 0, by + H2); g.addColorStop(0, css(fois(col, 0.85))); g.addColorStop(1, css(fois(col, 1.08))); c.fillStyle = g;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ww, by); c.lineTo(bx + ww, by + H2 - ww * 0.4); c.quadraticCurveTo(bx + ww, by + H2, bx + ww / 2, by + H2); c.quadraticCurveTo(bx, by + H2, bx, by + H2 - ww * 0.4); c.closePath(); c.fill();
      });
      if (rnd() < 0.05) mousse(c, S, rnd, x + w / 2, y + h * 1.4, w * 0.4);
    }
    return { bas: 0.08, moyen: 0.07, grain: 0.07, relief: 0.05, chaud: 0.03 };
  }
  function pArdoise(c, S, rnd) { // ardoises au crochet : 25 × 16 cm visibles, en quinconce, crochet d'inox au bas de chaque ardoise
    const C = 12, R = 19, w = S / C, h = S / R; c.fillStyle = '#1F2329'; c.fillRect(0, 0, S, S);
    const pal = [[84, 92, 104], [90, 98, 110], [74, 81, 93], [96, 104, 114], [86, 86, 100], [80, 90, 98]];
    for (let r = R - 1; r >= 0; r--) for (let i = 0; i < C; i++) {
      const x = i * w + (r % 2 ? w / 2 : 0) + (rnd() - 0.5) * 1.5, y = r * h, col = varie(rnd, choisir(rnd, pal), 0.06, 0.02), ch = rnd() < 0.3;
      tore(S, x - 2, y - h, x + w + 2, y + h + 3, (dx, dy) => {
        const bx = x + dx + 0.7, by = y + dy - h * 0.8, ww = w - 1.4, hh = h * 1.8;
        c.fillStyle = 'rgba(10,12,16,0.65)'; c.fillRect(bx + 1, by + hh - 1, ww, Math.max(1.5, h * 0.12));
        const g = c.createLinearGradient(0, by, 0, by + hh); g.addColorStop(0, css(fois(col, 0.85))); g.addColorStop(0.8, css(col)); g.addColorStop(1, css(fois(col, 1.15))); c.fillStyle = g;
        c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + ww, by); c.lineTo(bx + ww, by + hh - (ch ? 2 : 0)); c.lineTo(bx + ww - (ch ? 3 : 0), by + hh); c.lineTo(bx, by + hh); c.closePath(); c.fill();
        c.fillStyle = 'rgba(200,210,220,0.07)'; for (let l = 0; l < 3; l++) c.fillRect(bx, by + hh * (0.55 + rnd() * 0.4), ww, 1);
        c.fillStyle = 'rgba(205,212,218,0.85)'; c.fillRect(bx + ww / 2 - 0.8, by + hh - Math.max(2, h * 0.16), 1.6, Math.max(2, h * 0.16));
      });
      if (rnd() < 0.03) mousse(c, S, rnd, x + w * rnd(), y + h * 0.8, w * 0.25);
    }
    return { bas: 0.06, moyen: 0.06, grain: 0.06, relief: 0.04, chaud: -0.02 };
  }
  function pZinc(c, S, rnd) { // zinc à joint debout : bandes de 50 cm, patine, agrafures transversales
    const N = 6, w = S / N, k = S / 3; c.fillStyle = '#9EA6AB'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < N; i++) {
      const x = i * w, col = varie(rnd, [160, 168, 173], 0.04), g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, css(fois(col, 0.94))); g.addColorStop(0.5, css(fois(col, 1.03))); g.addColorStop(1, css(fois(col, 0.97)));
      c.fillStyle = g; c.fillRect(x, 0, w, S);
      const yj = rnd() * S; c.fillStyle = 'rgba(60,66,70,0.35)'; c.fillRect(x, yj, w, 1.2); c.fillStyle = 'rgba(235,240,242,0.45)'; c.fillRect(x, yj + 1.2, w, 1);
      for (let t = 0; t < 4; t++) coulure(c, S, x + rnd() * w, rnd() * S, (0.5 + rnd()) * k, 3 + rnd() * 10, [235, 238, 236], 0.12 + rnd() * 0.1);
      const jw = Math.max(2, 0.025 * k); c.fillStyle = 'rgba(40,44,48,0.5)'; c.fillRect(x + w - jw * 0.2, 0, jw * 0.9, S); c.fillStyle = 'rgba(245,248,250,0.8)'; c.fillRect(x + w - jw, 0, jw * 0.5, S); c.fillStyle = css(fois(col, 0.82)); c.fillRect(x + w - jw * 0.5, 0, jw * 0.35, S);
    }
    return { bas: 0.07, moyen: 0.05, grain: 0.03, relief: 0.02 };
  }
  function pGravillons(c, S, rnd) { // toit plat sous gravillons roulés
    c.fillStyle = '#8C877D'; c.fillRect(0, 0, S, S); const k = S / 3;
    cailloux(c, S, rnd, Math.round(S * S / 60), 0.005 * k, 0.017 * k, [[170, 164, 152], [150, 144, 133], [190, 184, 172], [128, 122, 112], [176, 160, 136], [205, 200, 190], [110, 106, 98]]);
    for (let i = 0; i < 6; i++) { const x = rnd() * S, y = rnd() * S, r = (0.2 + rnd() * 0.5) * k; tore(S, x - r, y - r, x + r, y + r, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); g.addColorStop(0, 'rgba(60,62,50,0.16)'); g.addColorStop(1, 'rgba(60,62,50,0)'); c.fillStyle = g; c.fillRect(x - r + dx, y - r + dy, 2 * r, 2 * r); }); }
    return { bas: 0.08, moyen: 0.06, grain: 0.1, relief: 0.06 };
  }
  function pVerre(c, S, rnd) { // verrière : vitrages de 75 × 150 cm, montants alu, reflets du ciel
    const k = S / 3, w = 0.75 * k, h = 1.5 * k; c.fillStyle = '#7A8B96'; c.fillRect(0, 0, S, S);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      const x = i * w, y = j * h, g = c.createLinearGradient(x, y, x + w * 0.6, y + h); g.addColorStop(0, '#B8CCD8'); g.addColorStop(0.45, '#7E95A6'); g.addColorStop(0.5, '#C8D8E2'); g.addColorStop(0.56, '#7A90A0'); g.addColorStop(1, '#5D7080');
      c.fillStyle = g; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(70,80,86,0.25)'; c.fillRect(x, y + h * 0.85, w, h * 0.15);
      c.fillStyle = '#C9CED1'; c.fillRect(x, y, w, Math.max(2, 0.035 * k)); c.fillRect(x, y, Math.max(2, 0.04 * k), h); c.fillStyle = 'rgba(40,46,50,0.6)'; c.fillRect(x + Math.max(2, 0.04 * k), y, 1, h);
    }
    return { bas: 0.04, moyen: 0.03, grain: 0.02 };
  }

  // ═══════════════════════════════ les sols (texture de détail, à mêler à la photo de près) ═══════════════════════════════
  function pAsphalte(c, S, rnd) {
    const k = S / 4; c.fillStyle = '#5E5E5B'; c.fillRect(0, 0, S, S);
    const n = Math.round(S * S / 22), P = [new Path2D(), new Path2D(), new Path2D()]; for (let i = 0; i < n; i++) { const t = (0.6 + rnd() * rnd() * 2.6) * S / 512, v = rnd(); P[v < 0.35 ? 0 : v < 0.85 ? 1 : 2].rect(rnd() * S, rnd() * S, t, t * (0.6 + rnd() * 0.5)); }
    ['rgba(40,40,38,0.7)', 'rgba(140,138,132,0.55)', 'rgba(190,186,176,0.6)'].forEach((f, i) => { c.fillStyle = f; c.fill(P[i]); }); // les granulats
    for (let i = 0; i < 2; i++) { const x = rnd() * S, y = rnd() * S, w = (0.6 + rnd()) * k, h = (0.4 + rnd() * 0.8) * k; tore(S, x, y, x + w, y + h, (dx, dy) => { c.fillStyle = 'rgba(52,52,50,0.55)'; c.fillRect(x + dx, y + dy, w, h); c.strokeStyle = 'rgba(30,30,28,0.6)'; c.lineWidth = 1.2; c.strokeRect(x + dx, y + dy, w, h); }); } // les reprises
    for (let i = 0; i < 4; i++) fissure(c, S, rnd, rnd() * S, rnd() * S, 12 + Math.floor(rnd() * 22), S / 70, 'rgba(24,24,22,0.75)', Math.max(0.8, S / 450));
    return { bas: 0.1, moyen: 0.08, grain: 0.14, relief: 0.08 };
  }
  function pPaves(c, S, rnd) { // pavés de pierre (≈ 12 × 12 cm) en rangs décalés, joints de sable
    const k = S / 2, R = 16, h = S / R; c.fillStyle = '#4C4740'; c.fillRect(0, 0, S, S);
    grains(c, S, rnd, Math.round(S * S / 60), S / 300, 'rgba(150,140,120,0.5)', 'rgba(30,28,24,0.5)');
    const pal = [[143, 138, 128], [158, 151, 139], [125, 120, 111], [168, 161, 147], [139, 133, 122], [154, 133, 116], [131, 128, 124]];
    for (let r = 0; r < R; r++) {
      const larg = partage(rnd, S, 0.1 * k, 0.17 * k); let x = rnd() * S;
      for (const w of larg) {
        const j = (0.008 + rnd() * 0.008) * k, x0 = (x % S) + j, y0 = r * h + j + (rnd() - 0.5) * 1.5, ww = w - 2 * j, hh = h - 2 * j, col = varie(rnd, choisir(rnd, pal), 0.08, 0.02);
        const p = caillou(rnd, x0, y0, ww, hh, 0.08, 12);
        tore(S, x0 - 3, y0 - 3, x0 + ww + 3, y0 + hh + 3, (dx, dy) => {
          c.fillStyle = 'rgba(20,18,14,0.5)'; chemin(c, p, dx + 1.2, dy + 1.6); c.fill();
          const g = c.createRadialGradient(x0 + ww * 0.42 + dx, y0 + hh * 0.38 + dy, 0, x0 + ww / 2 + dx, y0 + hh / 2 + dy, Math.max(ww, hh) * 0.62); g.addColorStop(0, css(fois(col, 1.12))); g.addColorStop(0.7, css(col)); g.addColorStop(1, css(fois(col, 0.78)));
          c.fillStyle = g; chemin(c, p, dx, dy); c.fill();
        });
        x += w;
      }
    }
    return { bas: 0.08, moyen: 0.07, grain: 0.08, relief: 0.06 };
  }
  function pGravier(c, S, rnd) {
    c.fillStyle = '#7F796E'; c.fillRect(0, 0, S, S); const k = S / 2;
    cailloux(c, S, rnd, Math.round(S * S / 40), 0.004 * k, 0.02 * k, [[176, 168, 152], [150, 142, 128], [196, 189, 175], [130, 122, 110], [184, 166, 140], [210, 204, 192], [112, 106, 98], [160, 150, 130]], { puissance: 2 });
    return { bas: 0.1, moyen: 0.08, grain: 0.12, relief: 0.08 };
  }
  function pHerbe(c, S, rnd) { // brins d'herbe en touffes (par paquets de couleur : peu d'appels), trèfle, pâquerettes
    const k = S / 2.5; c.fillStyle = '#56723A'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { const x = rnd() * S, y = rnd() * S, r = (0.08 + rnd() * 0.3) * k, sombre = rnd() < 0.5; tore(S, x - r, y - r, x + r, y + r, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); g.addColorStop(0, sombre ? 'rgba(40,58,26,0.45)' : 'rgba(150,160,80,0.35)'); g.addColorStop(1, 'rgba(80,100,50,0)'); c.fillStyle = g; c.fillRect(x - r + dx, y - r + dy, 2 * r, 2 * r); }); }
    const couleurs = ['#3E5A27', '#4A6A2E', '#5C7C36', '#6E8C3E', '#82A04A', '#94AC55', '#A6A85C', '#7A8E44'], n = Math.round(S * S / 22);
    c.lineCap = 'round';
    for (const coul of couleurs) {
      c.strokeStyle = coul; c.lineWidth = Math.max(0.8, S / 420); c.beginPath();
      for (let i = 0; i < n / couleurs.length; i++) { const x = rnd() * S, y = rnd() * S, l = (0.02 + rnd() * 0.05) * k, a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l; tore(S, Math.min(x, ex) - 1, Math.min(y, ey) - 1, Math.max(x, ex) + 1, Math.max(y, ey) + 1, (dx, dy) => { c.moveTo(x + dx, y + dy); c.lineTo(ex + dx, ey + dy); }); }
      c.stroke();
    }
    for (let i = 0; i < 22; i++) { const x = rnd() * S, y = rnd() * S, r = (0.012 + rnd() * 0.01) * k; tore(S, x - r * 3, y - r * 3, x + r * 3, y + r * 3, (dx, dy) => { c.fillStyle = 'rgba(86,120,52,0.9)'; for (let f = 0; f < 3; f++) { const a = f * TAU / 3 + rnd(); c.beginPath(); c.arc(x + dx + Math.cos(a) * r, y + dy + Math.sin(a) * r, r, 0, TAU); c.fill(); } }); }
    for (let i = 0; i < 16; i++) { const x = rnd() * S, y = rnd() * S, r = Math.max(1, 0.006 * k); tore(S, x - 3, y - 3, x + 3, y + 3, (dx, dy) => { c.fillStyle = '#F4F2EA'; c.beginPath(); c.arc(x + dx, y + dy, r * 1.6, 0, TAU); c.fill(); c.fillStyle = '#E6C030'; c.beginPath(); c.arc(x + dx, y + dy, r * 0.6, 0, TAU); c.fill(); }); }
    return { bas: 0.1, moyen: 0.1, grain: 0.1, relief: 0.08, chaud: 0.03 };
  }
  function pTerre(c, S, rnd) {
    const k = S / 3; c.fillStyle = '#76604A'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 10; i++) { const x = rnd() * S, y = rnd() * S, r = (0.2 + rnd() * 0.6) * k, h = rnd() < 0.5; tore(S, x - r, y - r, x + r, y + r, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); g.addColorStop(0, h ? 'rgba(60,44,30,0.35)' : 'rgba(150,126,98,0.3)'); g.addColorStop(1, 'rgba(100,80,60,0)'); c.fillStyle = g; c.fillRect(x - r + dx, y - r + dy, 2 * r, 2 * r); }); }
    cailloux(c, S, rnd, Math.round(S * S / 300), 0.012 * k, 0.045 * k, [[128, 104, 80], [104, 84, 64], [142, 118, 92], [92, 74, 56], [118, 98, 76]], { ombre: 'rgba(40,28,18,0.5)', reflet: 'rgba(200,180,150,0.25)' });
    cailloux(c, S, rnd, Math.round(S * S / 1400), 0.006 * k, 0.018 * k, [[160, 156, 148], [140, 134, 124], [188, 182, 170]]);
    for (let i = 0; i < 3; i++) fissure(c, S, rnd, rnd() * S, rnd() * S, 10 + Math.floor(rnd() * 14), S / 80, 'rgba(40,28,18,0.6)', Math.max(0.8, S / 500));
    return { bas: 0.14, moyen: 0.09, grain: 0.1, relief: 0.08, chaud: 0.03 };
  }

  // ═══════════════════════════════ l'API des matières répétées ═══════════════════════════════
  const MURS = { crepi: pCrepi, pierre: pPierre, taille: pTaille, mixte: pMixte, brique: pBrique, beton: pBeton, bois: pBois };
  const TOITS = { tuiles: pMecaniques, canal: pCanal, ecailles: pEcailles, ardoise: pArdoise, zinc: pZinc, plat: pGravillons, verre: pVerre };
  const SOLS = { asphalte: pAsphalte, paves: pPaves, gravier: pGravier, herbe: pHerbe, terre: pTerre };
  const ALIAS = { mur: { moellons: 'pierre', enduit: 'crepi', pierreTaille: 'taille', parpaing: 'beton', metal: 'beton', verre: 'beton' }, toit: { mecaniques: 'tuiles', tuile: 'tuiles', creuses: 'canal', beton: 'plat', gravillons: 'plat', bac: 'zinc', metal: 'zinc' }, sol: { parking: 'asphalte', route: 'asphalte', cimetiere: 'gravier', terrain: 'herbe', pre: 'herbe', jardin: 'herbe', chemin: 'terre' } };
  const nomMur = (m, o) => { m = ALIAS.mur[m] || m; if (m === 'pierre' && o && o.taille) m = 'taille'; return MURS[m] ? m : 'crepi'; };
  const nomToit = (t, o) => { t = ALIAS.toit[t] || t; if (t === 'tuiles' && o && o.tuile) t = ({ canal: 'canal', creuse: 'canal', ecaille: 'ecailles', ecailles: 'ecailles' })[o.tuile] || 'tuiles'; return TOITS[t] ? t : 'tuiles'; };
  const nomSol = (t) => { t = ALIAS.sol[t] || t; return SOLS[t] ? t : 'herbe'; };
  const nomCouche = (n) => (MURS[n] || TOITS[n] ? n : MURS[ALIAS.mur[n]] ? ALIAS.mur[n] : TOITS[ALIAS.toit[n]] ? ALIAS.toit[n] : null); // un nom de couche de bati()
  const baseMur = (m) => base('mur|' + m, taille(TAILLES.mur), MURS[m]);
  const baseToit = (t) => base('toit|' + t, taille(TAILLES.toit), TOITS[t]);
  const baseSol = (t) => base('sol|' + t, taille(TAILLES.sol), SOLS[t]);
  // les teintes typiques (choix de style) : crépis des villages de l'Ain, calcaires du Bugey, tuiles, ardoises, volets
  const TEINTES = {
    crepi: { beige: '#E2CCA6', ocre: '#D8A766', sable: '#E5D0A2', saumon: '#E0A68A', blanc: '#EEE7D8', gris: '#BEB8AD', ocreRouge: '#C98D62', jaune: '#E6C88C' },
    pierre: { calcaire: '#CDBFA4', dore: '#D3BB91', gris: '#B9B2A4' }, taille: { calcaire: '#D9CFBC', gris: '#C7C2B6' },
    tuiles: { rouge: '#A6553A', brun: '#8E5440', orange: '#B86A44', vieilles: '#9A6A52' }, ardoise: { bleue: '#5E6674', grise: '#666A72' },
    volets: { vert: '#6F8F7E', bleu: '#5A7D9C', gris: '#8C9396', brun: '#6B4B36', bordeaux: '#6E2C32' },
  };
  function facade(mur, teinte, o) { // DataTexture répétée de 3 m × 3 m (u = s / 3, v = hauteur / 3) ; teinte = couleur moyenne voulue ('#rrggbb')
    if (!OK) return null; const m = nomMur(mur, o), t = teinte ? rgb(teinte) : rgb(m === 'crepi' ? TEINTES.crepi.beige : null), S = taille(TAILLES.mur), cle = 'facade|' + m + '|' + (t ? css(t) : '-') + '|' + S;
    return memo(cle, () => { const b = baseMur(m); return texData(t ? teinter(b, t) : b.d, S, false, cle); });
  }
  function toit(nom, teinte, o) { // DataTexture répétée de 3 m × 3 m (u le long de l'égout, v en montant vers le faîtage)
    if (!OK) return null; const n = nomToit(nom, o), t = teinte ? rgb(teinte) : null, S = taille(TAILLES.toit), cle = 'toit|' + n + '|' + (t ? css(t) : '-') + '|' + S;
    return memo(cle, () => { const b = baseToit(n); return texData(t ? teinter(b, t) : b.d, S, false, cle); });
  }
  // sol(type) : texture de DONNÉES (NoColorSpace), en niveaux de gris de moyenne 0,5 et d'écart type ≈ 0,125 : couleur *= 2 × texel
  // module la photo sans la recolorer ; sol(type, { couleur: true }) : la version en couleurs (sRGB), pour un sol sans photo
  function neutre(b) { // luminance centrée sur 128, contraste normalisé (écart type 32)
    let s = 0, s2 = 0; const d = b.d, n = d.length / 4, L = new Float32Array(n);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; L[j] = l; s += l; s2 += l * l; }
    const mu = s / n, sd = Math.sqrt(Math.max(1e-6, s2 / n - mu * mu)), k = 32 / sd, out = new Uint8ClampedArray(d.length);
    for (let i = 0, j = 0; j < n; i += 4, j++) { const v = 128 + (L[j] - mu) * k; out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255; }
    return out;
  }
  function sol(type, o) {
    if (!OK) return null; const t = nomSol(type), S = taille(TAILLES.sol), coul = !!(o && o.couleur), cle = 'sol|' + t + '|' + (coul ? 'couleur' : 'neutre') + '|' + S;
    return memo(cle, () => { const b = baseSol(t); return texData(coul ? b.d : (b.neutre || (b.neutre = neutre(b))), S, !coul, cle); });
  }
  // solPaquet(types) : jusqu'à 4 sols neutres rangés dans les canaux R, G, B, A d'une seule texture de données (un échantillon pour
  // tout mélanger : detail = dot(poids, texel)) ; par défaut asphalte, pavés, gravier, herbe
  function solPaquet(types) {
    if (!OK) return null; types = (Array.isArray(types) && types.length ? types : ['asphalte', 'paves', 'gravier', 'herbe']).slice(0, 4).map(nomSol);
    const S = taille(TAILLES.sol), cle = 'solPaquet|' + types.join(',') + '|' + S;
    return memo(cle, () => {
      const d = new Uint8Array(S * S * 4).fill(128); for (let i = 3; i < d.length; i += 4) d[i] = 128;
      types.forEach((t, ch) => { const b = baseSol(t), n = b.neutre || (b.neutre = neutre(b)); for (let i = 0; i < d.length; i += 4) d[i + ch] = n[i]; });
      const tx = texData(d, S, true, cle); tx.userData.canaux = types.slice(); return tx;
    });
  }
  function periode(genre, nom) { // mètres par répétition [u, v]
    if (genre === 'sol') return (PER.sol[nomSol(nom)] || [3, 3]).slice(); return (PER[genre] || [3, 3]).slice();
  }

  // ─── bati(noms) : toutes les matières des bâtiments dans UNE texture en couches (WebGL2), et le matériau qui la lit ───
  // Géométrie : attribut 'uv' (en répétitions : u = s / 3 depuis le début de chaque mur, v = (y - base) / 3 ; toits : u le long de
  // l'égout, v le long de la pente depuis l'égout, en mètres / 3) et attribut 'couche' (Float32, 1 par sommet) = bati.couche(nom),
  // 0 = sans texture (cheminées, croix, horloge…). Couleur de sommet = bati.couleur(nom, hex, k) : la moyenne vaut hex (× k).
  function bati(noms) {
    if (!OK || !Q.webgl2) return null;
    const liste = []; for (const n0 of Array.isArray(noms) && noms.length ? noms : ['crepi', 'mixte', 'pierre', 'taille', 'brique', 'beton', 'bois', 'tuiles', 'canal', 'ecailles', 'ardoise', 'zinc', 'plat', 'verre']) { const n = nomCouche(n0); if (n && !liste.includes(n)) liste.push(n); }
    const S = taille(TAILLES.mur), cle = 'bati|' + liste.join(',') + '|' + S;
    return memo(cle, () => {
      const t0 = now(), bases = liste.map((n) => (MURS[n] ? baseMur(n) : baseToit(n))), N = bases.length, data = new Uint8Array(S * S * 4 * N);
      bases.forEach((b, i) => data.set(b.d, i * S * S * 4));
      const tx = new THREE.DataArrayTexture(data, S, S, N); tx.format = THREE.RGBAFormat; tx.type = THREE.UnsignedByteType;
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true;
      tx.anisotropy = Q.aniso; tx.colorSpace = THREE.SRGBColorSpace; tx.name = cle; tx.needsUpdate = true; marquer(tx, Math.round(S * S * 4 * N * 4 / 3), cle);
      const idx = new Map(liste.map((n, i) => [n, i])), moy = new Map(liste.map((n, i) => [n, bases[i].moy]));
      const couche = (n0) => { const n = nomCouche(n0), i = idx.get(n); if (i !== undefined) return i + 1; if (MURS[n] && idx.has('crepi')) return idx.get('crepi') + 1; if (TOITS[n] && idx.has('tuiles')) return idx.get('tuiles') + 1; return 0; }; // repli : crépi, tuiles, sinon 0
      const couleur = (n, hex, k) => { // la couleur de sommet (linéaire) qui donne en moyenne hex (sinon la matière telle quelle), × k
        k = k == null ? 1 : k; const ic = couche(n), m = ic ? bases[ic - 1].moy : null, t = rgb(hex); // la moyenne de la couche vraiment employée (repli compris)
        if (!t || !m) return t ? [LIN[t[0]] * k, LIN[t[1]] * k, LIN[t[2]] * k] : [k, k, k];
        return [LIN[t[0]] / m[0] * k, LIN[t[1]] / m[1] * k, LIN[t[2]] / m[2] * k];
      };
      let mat = null;
      const materiau = () => { // MeshLambertMaterial partagé : couleurs de sommet × texture de la couche ; brouillard, ombres, lumières de Three
        if (mat) return mat;
        mat = new THREE.MeshLambertMaterial({ vertexColors: true }); mat.name = 'ptex-bati';
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.tBati = { value: tx };
          sh.vertexShader = 'attribute float couche;\nvarying float vCouche;\nvarying vec2 vUvBati;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvUvBati = uv; vCouche = couche;');
          sh.fragmentShader = 'uniform highp sampler2DArray tBati;\nvarying float vCouche;\nvarying vec2 vUvBati;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tif ( vCouche > 0.5 ) diffuseColor.rgb *= texture( tBati, vec3( vUvBati, floor( vCouche - 0.5 ) ) ).rgb;');
        };
        mat.customProgramCacheKey = () => 'ptex-bati';
        if (M) M.partager(mat); mat.userData.partage = true; return mat;
      };
      compter('bati', t0);
      return { texture: tx, noms: liste.slice(), couche, couleur, materiau, periode: [3, 3], taille: S, moyenne: (n) => { const m = moy.get(nomCouche(n)); return m ? '#' + m.map((v) => versS(v).toString(16).padStart(2, '0')).join('') : null; } };
    });
  }

  // ═══════════════════════════════ l'atlas des ouvertures (CanvasTexture, découpe alpha) ═══════════════════════════════
  // chaque cellule : { l, h } en mètres, dessinée à D px/m ; la place est rangée en étagères au premier appel
  const VOLETS = { vert: [111, 143, 126], bleu: [90, 125, 156], gris: [140, 147, 150], brun: [107, 75, 54], bordeaux: [110, 44, 50] };
  const CELLULES = [
    ['fenetre', 1.12, 1.62], ['fenetre-haute', 1.3, 2.12], ['porte', 1.24, 2.36], ['porte-peinte', 1.24, 2.36], ['porte-ancienne', 1.3, 2.4],
    ['grange', 2.8, 2.9, 0.75], ['portail', 2.5, 4.1, 0.7], ['vitrine', 1.6, 2.7], ['vitrine-porte', 1.05, 2.7], ['balcon', 1.3, 1.0],
    ['chaine', 0.72, 2.88, 0.85], ['chaine-b', 0.72, 2.88, 0.85], ['abat-son', 1.4, 2.4, 0.7], ['horloge', 1.6, 1.6, 0.75], ['vitrail', 0.9, 3.0, 0.75],
    ['descente', 0.14, 2.88, 0.6], ['soupirail', 0.62, 0.38],
  ].concat(Object.keys(VOLETS).map((c) => ['volet-' + c, 0.5, 1.44]));
  function ranger(items, W, H, pad) { // étagères : du plus haut au plus bas ; false si ça déborde
    const l = items.slice().sort((a, b) => b.ph - a.ph); let x = pad, y = pad, hl = 0;
    for (const it of l) { if (x + it.pw + pad > W) { x = pad; y += hl + pad; hl = 0; } if (y + it.ph + pad > H || it.pw + 2 * pad > W) return false; it.x = x; it.y = y; x += it.pw + pad; hl = Math.max(hl, it.ph); }
    return true;
  }
  let motifGrain = null;
  function grainMotif(c) { // un petit motif de mouchetures (pierre, bois, peinture), répété dans les cellules
    if (!motifGrain) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), r = mulberry32(77); for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'; g.fillRect(r() * 64, r() * 64, 1, 1); } motifGrain = cv; }
    return c.createPattern(motifGrain, 'repeat');
  }
  function moucheter(c, x, y, w, h, a) { c.save(); c.globalAlpha = a; c.globalCompositeOperation = 'source-atop'; c.fillStyle = grainMotif(c); c.fillRect(x, y, w, h); c.restore(); }
  // l'encadrement de pierre (jambages, linteau, appui saillant) ; rend l'ouverture [x0, y0, x1, y1]
  function encadrement(c, x, y, w, h, D, rnd, o) {
    o = o || {}; const f = (o.f || 0.12) * D, sail = (o.sail == null ? 0.06 : o.sail) * D, ap = (o.appui == null ? 0.08 : o.appui) * D, lt = (o.linteau || 0.15) * D, pierre = o.pierre || [214, 203, 182];
    const fx = x + sail, fw = w - 2 * sail;
    c.fillStyle = css(fois(pierre, 0.97)); c.fillRect(fx, y, fw, h - ap);
    c.fillStyle = css(fois(pierre, 1.06)); c.fillRect(fx, y, fw, 2); c.fillRect(fx, y, 2, h - ap);
    c.fillStyle = css(fois(pierre, 0.8)); c.fillRect(fx + fw - 2, y, 2, h - ap);
    if (o.harpe !== false) for (let yy = y + lt; yy < y + h - ap - 4; yy += 0.3 * D) { c.fillStyle = 'rgba(90,78,60,0.35)'; c.fillRect(fx, yy, f, 1); c.fillRect(fx + fw - f, yy + 0.15 * D, f, 1); }
    if (ap > 0) { c.fillStyle = css(fois(pierre, 1.08)); c.fillRect(x, y + h - ap, w, ap * 0.45); c.fillStyle = css(fois(pierre, 0.9)); c.fillRect(x, y + h - ap * 0.55, w, ap * 0.55); c.fillStyle = 'rgba(40,32,24,0.35)'; c.fillRect(x, y + h - 1.5, w, 1.5); }
    moucheter(c, x, y, w, h, 0.18);
    const x0 = fx + f, x1 = fx + fw - f, y0 = y + lt, y1 = y + h - ap;
    c.fillStyle = css(fois(pierre, 0.62)); c.fillRect(x0, y0, x1 - x0, y1 - y0); // le tableau (l'épaisseur du mur), dans l'ombre en haut
    const g = c.createLinearGradient(0, y0, 0, y0 + 0.12 * D); g.addColorStop(0, 'rgba(40,30,22,0.55)'); g.addColorStop(1, 'rgba(40,30,22,0)'); c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, 0.12 * D);
    return [x0, y0, x1, y1];
  }
  function vitre(c, x, y, w, h, rnd, sombre) { // un carreau : reflet du ciel en haut, intérieur sombre en bas, une traînée de lumière
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, sombre ? '#8697A4' : '#B4C6D2'); g.addColorStop(0.45, sombre ? '#56636E' : '#7E92A2'); g.addColorStop(1, sombre ? '#2E363E' : '#3D4A56');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = 'rgba(255,255,255,0.22)'; const d = rnd() * w; c.beginPath(); c.moveTo(x + d, y); c.lineTo(x + d + w * 0.35, y); c.lineTo(x + d - w * 0.25, y + h); c.lineTo(x + d - w * 0.55, y + h); c.closePath(); c.fill(); c.restore();
  }
  function persienne(c, x, y, w, h, D, col, rnd, gonds) { // un vantail de volet persienne, gonds à droite (côté fenêtre)
    const b = 0.055 * D; c.fillStyle = css(fois(col, 0.75)); c.fillRect(x, y, w, h); c.fillStyle = css(col); c.fillRect(x + 1, y + 1, w - 2, h - 2);
    const lam = Math.max(3, 0.045 * D), tr = y + h * 0.5;
    for (let yy = y + b; yy < y + h - b - 1; yy += lam) { if (Math.abs(yy - tr) < lam * 0.6) continue; c.fillStyle = css(fois(col, 1.15)); c.fillRect(x + b, yy, w - 2 * b, lam * 0.35); c.fillStyle = css(fois(col, 0.92)); c.fillRect(x + b, yy + lam * 0.35, w - 2 * b, lam * 0.4); c.fillStyle = css(fois(col, 0.55)); c.fillRect(x + b, yy + lam * 0.75, w - 2 * b, lam * 0.25); }
    c.fillStyle = css(col); c.fillRect(x + b, tr - lam * 0.5, w - 2 * b, lam); c.fillStyle = css(fois(col, 0.7)); c.fillRect(x + b, tr + lam * 0.4, w - 2 * b, 1);
    c.fillStyle = css(fois(col, 0.65)); c.fillRect(x + b - 1, y + b, 1, h - 2 * b); c.fillRect(x + w - b, y + b, 1, h - 2 * b);
    if (gonds) for (const v of [0.15, 0.85]) { const yy = y + h * v; c.fillStyle = '#26221F'; c.fillRect(x + w * 0.35, yy - 0.012 * D, w * 0.65, 0.024 * D); c.beginPath(); c.arc(x + w * 0.35, yy, 0.02 * D, 0, TAU); c.fill(); }
    for (let i = 0; i < 6; i++) { c.fillStyle = rnd() < 0.5 ? 'rgba(160,130,96,0.6)' : 'rgba(255,255,255,0.25)'; c.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 2, 1 + rnd() * 3); }
    moucheter(c, x, y, w, h, 0.12);
  }
  function planches(c, x, y, w, h, D, cols, rnd, larg) { // des planches verticales (portes anciennes, grange)
    const n = Math.max(2, Math.round(w / ((larg || 0.16) * D))), pw = w / n;
    for (let i = 0; i < n; i++) { const col = varie(rnd, choisir(rnd, cols), 0.06), g = c.createLinearGradient(x + i * pw, 0, x + (i + 1) * pw, 0); g.addColorStop(0, css(fois(col, 1.08))); g.addColorStop(0.8, css(col)); g.addColorStop(1, css(fois(col, 0.7))); c.fillStyle = g; c.fillRect(x + i * pw, y, pw, h); c.strokeStyle = 'rgba(40,28,18,0.18)'; c.lineWidth = 1; for (let f = 0; f < 3; f++) { const fx = x + i * pw + rnd() * pw; c.beginPath(); c.moveTo(fx, y); c.bezierCurveTo(fx + 2, y + h * 0.3, fx - 2, y + h * 0.6, fx + 1, y + h); c.stroke(); } }
    moucheter(c, x, y, w, h, 0.15);
  }
  function panneaux(c, x, y, w, h, col, nx, ny, m) { // des panneaux moulurés (portes à panneaux)
    const pw = (w - m * (nx + 1)) / nx, ph = (h - m * (ny + 1)) / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const px = x + m + i * (pw + m), py = y + m + j * (ph + m); c.fillStyle = css(fois(col, 0.72)); c.fillRect(px, py, pw, ph); c.fillStyle = css(fois(col, 1.15)); c.fillRect(px + 2, py + 2, pw - 2, ph - 2); c.fillStyle = css(fois(col, 0.95)); c.fillRect(px + 4, py + 4, pw - 7, ph - 7); }
  }
  function arc(c, cx, cy, r0, r1, a0, a1, n, pierre, rnd) { // des claveaux rayonnants (arc de pierre)
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n, col = varie(rnd, pierre, 0.05); c.fillStyle = css(col); c.beginPath(); c.arc(cx, cy, r1, a, b); c.arc(cx, cy, r0, b, a, true); c.closePath(); c.fill(); c.strokeStyle = 'rgba(80,68,52,0.55)'; c.lineWidth = 1; c.stroke(); }
  }
  const DESSINS = {
    fenetre(c, x, y, w, h, D, rnd) {
      const [x0, y0, x1, y1] = encadrement(c, x, y, w, h, D, rnd), m = 0.045 * D, xm = (x0 + x1) / 2;
      c.fillStyle = '#EDE8DD'; c.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4); // dormant et ouvrants peints
      for (const [a, b] of [[x0 + 2 + m, xm - m * 0.6], [xm + m * 0.6, x1 - 2 - m]]) {
        const ya = y0 + 2 + m, yb = y1 - 2 - m, hp = (yb - ya - 2 * m * 0.5) / 3;
        for (let k = 0; k < 3; k++) vitre(c, a, ya + k * (hp + m * 0.5), b - a, hp, rnd, false);
        c.fillStyle = 'rgba(245,243,236,0.33)'; for (let f = 0; f < 6; f++) c.fillRect(a + (b - a) * f / 6, ya + (yb - ya) * 0.36, (b - a) / 12, (yb - ya) * 0.64); // le voilage derrière la vitre
      }
      c.fillStyle = 'rgba(70,60,50,0.35)'; c.fillRect(xm - 1, y0 + 2, 2, y1 - y0 - 4); c.fillStyle = '#B9A27A'; c.fillRect(xm + m * 0.6, (y0 + y1) / 2, 0.02 * D, 0.08 * D);
      c.fillStyle = 'rgba(60,50,40,0.25)'; c.fillRect(x0 + 2, y1 - 4, x1 - x0 - 4, 2);
    },
    'fenetre-haute'(c, x, y, w, h, D, rnd) {
      const [x0, y0, x1, y1] = encadrement(c, x, y, w, h, D, rnd, { f: 0.15, linteau: 0.22, pierre: [222, 212, 192] }), m = 0.05 * D, xm = (x0 + x1) / 2;
      c.fillStyle = 'rgba(80,68,52,0.4)'; c.fillRect(x + 0.06 * D, y + 0.07 * D, w - 0.12 * D, 1.5); // une moulure sous la corniche du linteau
      c.fillStyle = '#EEEAE0'; c.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
      for (const [a, b] of [[x0 + 2 + m, xm - m * 0.6], [xm + m * 0.6, x1 - 2 - m]]) { const ya = y0 + 2 + m, yb = y1 - 2 - m, hp = (yb - ya - 3 * m * 0.5) / 4; for (let k = 0; k < 4; k++) vitre(c, a, ya + k * (hp + m * 0.5), b - a, hp, rnd, false); c.fillStyle = 'rgba(245,243,236,0.28)'; for (let f = 0; f < 5; f++) c.fillRect(a + (b - a) * f / 5, ya + (yb - ya) * 0.3, (b - a) / 10, (yb - ya) * 0.7); }
      c.fillStyle = 'rgba(70,60,50,0.35)'; c.fillRect(xm - 1, y0 + 2, 2, y1 - y0 - 4);
    },
    porte(c, x, y, w, h, D, rnd) {
      const [x0, y0, x1, y1] = encadrement(c, x, y, w, h, D, rnd, { appui: 0.05, sail: 0.02, linteau: 0.16 }), bois = [122, 82, 51], imp = 0.38 * D;
      vitre(c, x0 + 3, y0 + 3, x1 - x0 - 6, imp - 6, rnd, true); c.fillStyle = css(fois(bois, 0.8)); for (let i = 1; i < 4; i++) c.fillRect(x0 + (x1 - x0) * i / 4 - 1, y0, 3, imp); c.fillRect(x0, y0 + imp - 4, x1 - x0, 5);
      const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, css(fois(bois, 0.9))); g.addColorStop(1, css(fois(bois, 1.05))); c.fillStyle = g; c.fillRect(x0 + 2, y0 + imp, x1 - x0 - 4, y1 - y0 - imp);
      panneaux(c, x0 + 2, y0 + imp, x1 - x0 - 4, y1 - y0 - imp, bois, 2, 2, 0.08 * D); moucheter(c, x0, y0 + imp, x1 - x0, y1 - y0 - imp, 0.12);
      c.fillStyle = '#C9A55A'; c.beginPath(); c.arc(x1 - 0.12 * D, (y0 + y1) / 2 + 0.1 * D, 0.03 * D, 0, TAU); c.fill(); c.fillStyle = '#8E7232'; c.fillRect(x0 + (x1 - x0) / 2 - 0.1 * D, y0 + imp + (y1 - y0 - imp) * 0.42, 0.2 * D, 0.03 * D);
    },
    'porte-peinte'(c, x, y, w, h, D, rnd) {
      const [x0, y0, x1, y1] = encadrement(c, x, y, w, h, D, rnd, { appui: 0.05, sail: 0.02, linteau: 0.16 }), col = [52, 82, 68];
      c.fillStyle = css(col); c.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
      const ym = y0 + (y1 - y0) * 0.45; vitre(c, x0 + 0.12 * D, y0 + 0.1 * D, x1 - x0 - 0.24 * D, ym - y0 - 0.2 * D, rnd, true);
      c.strokeStyle = '#1E1E1C'; c.lineWidth = Math.max(1.5, 0.018 * D); for (let i = 1; i < 4; i++) { const xx = x0 + 0.12 * D + (x1 - x0 - 0.24 * D) * i / 4; c.beginPath(); c.moveTo(xx, y0 + 0.1 * D); c.lineTo(xx, ym - 0.1 * D); c.stroke(); }
      panneaux(c, x0 + 2, ym, x1 - x0 - 4, y1 - ym - 2, col, 2, 1, 0.08 * D); moucheter(c, x0, y0, x1 - x0, y1 - y0, 0.1);
      c.fillStyle = '#C9A55A'; c.beginPath(); c.arc(x1 - 0.12 * D, ym + 0.05 * D, 0.03 * D, 0, TAU); c.fill();
    },
    'porte-ancienne'(c, x, y, w, h, D, rnd) { // planches cloutées sous un linteau cintré
      const pierre = [208, 196, 172], f = 0.16 * D; c.fillStyle = css(pierre); c.fillRect(x, y + 0.3 * D, w, h - 0.3 * D);
      arc(c, x + w / 2, y + 0.62 * D, w / 2 - f, w / 2 + 0.02 * D, Math.PI, TAU, 7, pierre, rnd); moucheter(c, x, y, w, h, 0.15);
      c.save(); c.beginPath(); c.moveTo(x + f, y + h); c.lineTo(x + f, y + 0.62 * D); c.arc(x + w / 2, y + 0.62 * D, w / 2 - f, Math.PI, TAU); c.lineTo(x + w - f, y + h); c.closePath(); c.clip();
      planches(c, x + f, y, w - 2 * f, h, D, [[110, 80, 56], [98, 72, 52], [120, 92, 66]], rnd, 0.15); c.fillStyle = 'rgba(30,24,20,0.85)';
      for (let j = 0; j < 7; j++) for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + f + (w - 2 * f) * (i + 0.5) / 4, y + 0.55 * D + j * (h - 0.7 * D) / 6, 0.016 * D, 0, TAU); c.fill(); }
      c.restore(); c.fillStyle = '#24201C'; for (const v of [0.35, 0.82]) c.fillRect(x + f, y + h * v, (w - 2 * f) * 0.7, 0.03 * D);
    },
    grange(c, x, y, w, h, D, rnd) { // porte charretière : arc surbaissé de claveaux, deux vantaux de planches grisées, portillon
      const pierre = [200, 188, 164], f = 0.22 * D, r = w * 0.62, cy = y + 0.55 * D + r, a = Math.asin((w / 2 - f) / r);
      c.fillStyle = css(pierre); c.fillRect(x, y + 0.2 * D, w, h - 0.2 * D); arc(c, x + w / 2, cy, r - f * 0.2, r + f * 0.8, -Math.PI / 2 - a - 0.12, -Math.PI / 2 + a + 0.12, 11, pierre, rnd);
      for (let yy = y + 0.6 * D; yy < y + h; yy += 0.32 * D) { c.fillStyle = 'rgba(80,68,52,0.4)'; c.fillRect(x, yy, f, 1); c.fillRect(x + w - f, yy + 0.16 * D, f, 1); }
      moucheter(c, x, y, w, h, 0.18);
      c.save(); c.beginPath(); c.moveTo(x + f, y + h); c.lineTo(x + f, cy - Math.cos(a) * r); c.arc(x + w / 2, cy, r, -Math.PI / 2 - a, -Math.PI / 2 + a); c.lineTo(x + w - f, y + h); c.closePath(); c.clip();
      planches(c, x + f, y, w - 2 * f, h, D, [[134, 118, 98], [120, 106, 90], [146, 128, 104], [112, 96, 80]], rnd, 0.18);
      const xm = x + w / 2; c.fillStyle = 'rgba(25,20,16,0.85)'; c.fillRect(xm - 1.5, y, 3, h);
      c.fillStyle = '#2A2622'; for (const v of [0.3, 0.55, 0.85]) { c.fillRect(x + f, y + h * v, (xm - x - f) * 0.8, 0.035 * D); c.fillRect(xm + (x + w - f - xm) * 0.2, y + h * v, (x + w - f - xm) * 0.8, 0.035 * D); }
      c.strokeStyle = 'rgba(25,20,16,0.7)'; c.lineWidth = 1.5; c.strokeRect(xm + 0.15 * D, y + h - 1.9 * D, 0.8 * D, 1.9 * D); c.restore();
    },
    portail(c, x, y, w, h, D, rnd) { // portail d'église : plein cintre à double rouleau, vantaux cloutés à pentures
      const pierre = [214, 204, 184], f = 0.28 * D, r = w / 2 - f, cy = y + r + f; c.fillStyle = css(pierre); c.fillRect(x, y + w / 2, w, h - w / 2);
      arc(c, x + w / 2, cy, r, r + f * 0.55, Math.PI, TAU, 13, pierre, rnd); arc(c, x + w / 2, cy, r + f * 0.55, r + f, Math.PI, TAU, 15, fois(pierre, 0.95), rnd); moucheter(c, x, y, w, h, 0.18);
      c.save(); c.beginPath(); c.moveTo(x + f, y + h); c.lineTo(x + f, cy); c.arc(x + w / 2, cy, r, Math.PI, TAU); c.lineTo(x + w - f, y + h); c.closePath(); c.clip();
      planches(c, x + f, y, w - 2 * f, h, D, [[92, 58, 38], [84, 54, 36], [100, 64, 42]], rnd, 0.14);
      c.fillStyle = 'rgba(20,14,10,0.9)'; c.fillRect(x + w / 2 - 1.5, cy, 3, h); for (let j = 0; j < 9; j++) for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(x + f + (w - 2 * f) * (i + 0.5) / 6, cy + 0.2 * D + j * (h - cy + y - 0.3 * D) / 8, 0.018 * D, 0, TAU); c.fill(); }
      c.strokeStyle = '#1E1A16'; c.lineWidth = 0.035 * D; for (const v of [0.48, 0.8]) { const yy = y + h * v; c.beginPath(); c.moveTo(x + f, yy); c.lineTo(x + w / 2 - 0.1 * D, yy); c.moveTo(x + w - f, yy); c.lineTo(x + w / 2 + 0.1 * D, yy); c.stroke(); c.beginPath(); c.arc(x + w / 2 - 0.25 * D, yy - 0.08 * D, 0.08 * D, 0.5, 4); c.stroke(); c.beginPath(); c.arc(x + w / 2 + 0.25 * D, yy - 0.08 * D, 0.08 * D, -0.86, 2.6); c.stroke(); }
      c.restore();
    },
    vitrine(c, x, y, w, h, D, rnd) { // une travée de devanture : bois peint, glace, soubassement mouluré, l'intérieur éclairé
      const col = [40, 58, 50], m = 0.08 * D, sb = 0.55 * D; c.fillStyle = css(col); c.fillRect(x, y, w, h); c.fillStyle = css(fois(col, 1.3)); c.fillRect(x, y, w, 2); c.fillRect(x, y, 2, h);
      const gx = x + m, gy = y + m, gw = w - 2 * m, gh = h - sb - m * 1.5, g = c.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, '#9FB2BE'); g.addColorStop(0.3, '#6E7F8A'); g.addColorStop(0.31, '#8C7B62'); g.addColorStop(1, '#4A3E33'); c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
      for (let s = 0; s < 3; s++) { const sy = gy + gh * (0.42 + s * 0.2); c.fillStyle = 'rgba(230,215,190,0.55)'; c.fillRect(gx + 2, sy, gw - 4, 2); for (let i = 0; i < 5; i++) { c.fillStyle = choisir(rnd, ['rgba(200,140,80,0.8)', 'rgba(170,60,50,0.7)', 'rgba(230,210,160,0.8)', 'rgba(90,120,80,0.7)', 'rgba(120,90,140,0.6)']); const bw = gw * (0.06 + rnd() * 0.1), bh = 0.06 * D + rnd() * 0.1 * D; c.fillRect(gx + 4 + rnd() * (gw - bw - 8), sy - bh, bw, bh); } }
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.moveTo(gx + gw * 0.15, gy); c.lineTo(gx + gw * 0.5, gy); c.lineTo(gx + gw * 0.1, gy + gh); c.lineTo(gx - gw * 0.2, gy + gh); c.closePath(); c.save(); c.clip(); c.fill(); c.restore();
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(gx, gy, gw, gh * 0.25);
      panneaux(c, x + m * 0.5, y + h - sb, w - m, sb - m * 0.5, col, 1, 1, 0.07 * D); c.fillStyle = 'rgba(20,24,22,0.6)'; c.fillRect(x, y + h - 2, w, 2); moucheter(c, x, y, w, h, 0.08);
    },
    'vitrine-porte'(c, x, y, w, h, D, rnd) {
      const col = [40, 58, 50], m = 0.09 * D; c.fillStyle = css(col); c.fillRect(x, y, w, h); c.fillStyle = css(fois(col, 1.3)); c.fillRect(x, y, w, 2);
      vitre(c, x + m, y + m, w - 2 * m, h * 0.62, rnd, true); c.fillStyle = 'rgba(240,226,200,0.18)'; c.fillRect(x + m, y + m + h * 0.3, w - 2 * m, h * 0.32);
      panneaux(c, x + m * 0.5, y + h * 0.66 + m, w - m, h * 0.34 - m * 1.5, col, 1, 1, 0.06 * D);
      c.fillStyle = '#C9C2B0'; c.fillRect(x + w - m - 0.05 * D, y + h * 0.4, 0.03 * D, 0.35 * D); moucheter(c, x, y, w, h, 0.08);
    },
    balcon(c, x, y, w, h, D) { // garde-corps en fer forgé : lisses, barreaux, volutes (découpe alpha)
      const fer = '#22201D', l = Math.max(1.5, 0.022 * D); c.strokeStyle = fer; c.fillStyle = fer; c.lineWidth = l;
      c.fillRect(x, y, w, 0.05 * D); c.fillRect(x, y + h - 0.05 * D, w, 0.05 * D); c.fillRect(x, y + h * 0.82, w, l);
      const n = 6, pw = w / n; for (let i = 0; i <= n; i++) c.fillRect(x + Math.min(w - l, i * pw) , y, l, h);
      for (let i = 0; i < n; i++) { const cx = x + (i + 0.5) * pw, r = pw * 0.24; c.beginPath(); c.arc(cx, y + h * 0.3, r, 0, TAU); c.stroke(); c.beginPath(); c.arc(cx, y + h * 0.62, r, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(cx, y + h * 0.3 + r); c.lineTo(cx, y + h * 0.62 - r); c.stroke(); c.beginPath(); c.arc(cx - r * 1.05, y + h * 0.46, r * 0.5, -1.2, 1.2); c.stroke(); c.beginPath(); c.arc(cx + r * 1.05, y + h * 0.46, r * 0.5, Math.PI - 1.2, Math.PI + 1.2); c.stroke(); }
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y, w, 1);
    },
    chaine(c, x, y, w, h, D, rnd, o) { // chaîne d'angle (harpe) : boutisses et panneresses alternées ; l'angle du mur est à gauche
      const n = 8, bh = h / n, pierre = [222, 212, 192];
      for (let i = 0; i < n; i++) { const long = (i + (o && o.b ? 1 : 0)) % 2 === 0, bw = long ? w : w * 0.6, yy = y + h - (i + 1) * bh, col = varie(rnd, pierre, 0.05); c.fillStyle = 'rgba(60,50,40,0.55)'; c.fillRect(x, yy + 1, bw, bh - 1); c.fillStyle = css(fois(col, 1.06)); c.fillRect(x, yy + 1, bw - 1.5, bh - 2.5); const g = c.createLinearGradient(0, yy, 0, yy + bh); g.addColorStop(0, css(col)); g.addColorStop(1, css(fois(col, 0.9))); c.fillStyle = g; c.fillRect(x + 1, yy + 2, bw - 3, bh - 4.5); }
      moucheter(c, x, y, w, h, 0.18);
    },
    'chaine-b'(c, x, y, w, h, D, rnd) { DESSINS.chaine(c, x, y, w, h, D, rnd, { b: true }); },
    'abat-son'(c, x, y, w, h, D, rnd) { // baie du clocher en plein cintre, lames d'abat-son
      const pierre = [214, 204, 184], f = 0.14 * D, r = w / 2 - f, cy = y + w / 2; c.fillStyle = css(pierre); c.fillRect(x, y + w / 2, w, h - w / 2); arc(c, x + w / 2, cy, r, w / 2, Math.PI, TAU, 9, pierre, rnd); moucheter(c, x, y, w, h, 0.15);
      c.save(); c.beginPath(); c.moveTo(x + f, y + h - f * 0.5); c.lineTo(x + f, cy); c.arc(x + w / 2, cy, r, Math.PI, TAU); c.lineTo(x + w - f, y + h - f * 0.5); c.closePath(); c.clip();
      c.fillStyle = '#1C1A1E'; c.fillRect(x, y, w, h); const lam = 0.16 * D; for (let yy = cy - r * 0.6; yy < y + h; yy += lam) { c.fillStyle = '#6C6A70'; c.fillRect(x, yy, w, lam * 0.55); c.fillStyle = '#8E8C92'; c.fillRect(x, yy, w, 2); c.fillStyle = '#3A383E'; c.fillRect(x, yy + lam * 0.55, w, 2); }
      c.restore();
    },
    horloge(c, x, y, w, h, D) { // cadran émaillé, chiffres romains, aiguilles (découpe alpha)
      const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) / 2 - 1; c.fillStyle = '#3B352C'; c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill(); c.fillStyle = '#C9A55A'; c.beginPath(); c.arc(cx, cy, r * 0.93, 0, TAU); c.fill();
      const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r); g.addColorStop(0, '#FFFDF6'); g.addColorStop(1, '#E6E0D0'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r * 0.86, 0, TAU); c.fill();
      c.fillStyle = '#1E1C1A'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${Math.round(r * 0.2)}px Georgia, "Times New Roman", serif`;
      const ch = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']; ch.forEach((t, i) => { const a = i / 12 * TAU - Math.PI / 2; c.fillText(t, cx + Math.cos(a) * r * 0.68, cy + Math.sin(a) * r * 0.68); });
      for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, l = i % 5 ? 0.04 : 0.08; c.fillRect(cx + Math.cos(a) * r * (0.84 - l) - 0.8, cy + Math.sin(a) * r * (0.84 - l) - 0.8, 1.6, 1.6); }
      c.strokeStyle = '#1E1C1A'; c.lineCap = 'round'; c.lineWidth = r * 0.06; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(-2.6) * r * 0.42, cy + Math.sin(-2.6) * r * 0.42); c.stroke(); c.lineWidth = r * 0.04; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(-0.52) * r * 0.66, cy + Math.sin(-0.52) * r * 0.66); c.stroke(); c.fillStyle = '#C9A55A'; c.beginPath(); c.arc(cx, cy, r * 0.05, 0, TAU); c.fill();
    },
    vitrail(c, x, y, w, h, D, rnd) { // lancette en arc brisé : vitrail sombre vu du dehors, plombs en losanges, grillage
      const pierre = [214, 204, 184], f = 0.13 * D; c.fillStyle = css(pierre); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * 0.9); c.quadraticCurveTo(x, y + w * 0.1, x + w / 2, y); c.quadraticCurveTo(x + w, y + w * 0.1, x + w, y + w * 0.9); c.lineTo(x + w, y + h); c.closePath(); c.fill(); moucheter(c, x, y, w, h, 0.15);
      c.save(); c.beginPath(); c.moveTo(x + f, y + h - f); c.lineTo(x + f, y + w * 0.95); c.quadraticCurveTo(x + f, y + w * 0.25, x + w / 2, y + f); c.quadraticCurveTo(x + w - f, y + w * 0.25, x + w - f, y + w * 0.95); c.lineTo(x + w - f, y + h - f); c.closePath(); c.clip();
      const pal = ['#2E3E62', '#3A2E52', '#5E2A30', '#2E4A44', '#6A5426', '#34405A', '#283652']; const t = 0.14 * D;
      for (let j = -1; j < h / t + 1; j++) for (let i = -1; i < w / t + 1; i++) { const px = x + i * t + (j % 2 ? t / 2 : 0), py = y + j * t * 0.8; c.fillStyle = choisir(rnd, pal); c.beginPath(); c.moveTo(px, py - t * 0.4); c.lineTo(px + t / 2, py); c.lineTo(px, py + t * 0.4); c.lineTo(px - t / 2, py); c.closePath(); c.fill(); c.strokeStyle = 'rgba(20,20,22,0.9)'; c.lineWidth = 1.2; c.stroke(); }
      const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, 'rgba(200,210,230,0.25)'); g.addColorStop(0.5, 'rgba(200,210,230,0.05)'); g.addColorStop(1, 'rgba(200,210,230,0.15)'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(30,30,30,0.35)'; c.lineWidth = 0.8; for (let i = -h; i < w + h; i += 0.05 * D) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i - h, y + h); c.stroke(); }
      c.restore();
    },
    descente(c, x, y, w, h, D) { // descente d'eaux pluviales en zinc, colliers tous les mètres
      const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#6E767C'); g.addColorStop(0.3, '#C4CBCF'); g.addColorStop(0.6, '#9AA2A8'); g.addColorStop(1, '#5A6066'); c.fillStyle = g; c.fillRect(x + w * 0.15, y, w * 0.7, h);
      c.fillStyle = '#3E4246'; for (let yy = y + 0.3 * D; yy < y + h; yy += D) c.fillRect(x, yy, w, 0.03 * D);
    },
    soupirail(c, x, y, w, h, D, rnd) { const [x0, y0, x1, y1] = encadrement(c, x, y, w, h, D, rnd, { f: 0.08, appui: 0.04, sail: 0.02, linteau: 0.08, harpe: false }); c.fillStyle = '#1A1714'; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.fillStyle = '#3A3530'; for (let i = 1; i < 4; i++) c.fillRect(x0 + (x1 - x0) * i / 4 - 1, y0, 2.5, y1 - y0); },
  };
  for (const [n, col] of Object.entries(VOLETS)) DESSINS['volet-' + n] = (c, x, y, w, h, D, rnd) => persienne(c, x, y, w, h, D, col, rnd, true);
  function details() { // { texture, cellules: { nom: { uv: [u0, v0, u1, v1], l, h } }, materiau() }
    if (!OK) return null; const W = taille(TAILLES.details), cle = 'details|' + W;
    return memo(cle, () => {
      const t0 = now(); let D = TAILLES.densite * Q.k, items;
      for (let essai = 0; essai < 8; essai++, D *= 0.92) { items = CELLULES.map(([nom, l, h, k]) => ({ nom, l, h, k: k || 1, pw: Math.ceil(l * D * (k || 1)), ph: Math.ceil(h * D * (k || 1)) })); if (ranger(items, W, W, 6)) break; }
      const cv = document.createElement('canvas'); cv.width = cv.height = W; const c = cv.getContext('2d'), cellules = {};
      for (const it of items) {
        const rnd = mulberry32(hash(it.nom)); c.save(); c.beginPath(); c.rect(it.x, it.y, it.pw, it.ph); c.clip();
        try { DESSINS[it.nom](c, it.x, it.y, it.pw, it.ph, D * it.k, rnd); } catch (e) { c.fillStyle = '#999'; c.fillRect(it.x, it.y, it.pw, it.ph); }
        c.restore();
        const e = 0.5; cellules[it.nom] = { uv: [(it.x + e) / W, 1 - (it.y + it.ph - e) / W, (it.x + it.pw - e) / W, 1 - (it.y + e) / W], l: it.l, h: it.h, px: [it.x, it.y, it.pw, it.ph] };
      }
      const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = Q.aniso; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; tx.name = cle; tx.userData.canvas = cv;
      marquer(tx, Math.round(W * W * 4 * 4 / 3), cle);
      let mat = null; const materiau = () => { if (mat) return mat; mat = new THREE.MeshLambertMaterial({ map: tx, alphaTest: 0.5, vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); mat.name = 'ptex-details'; if (M) M.partager(mat); return mat; };
      compter('details', t0);
      return { texture: tx, cellules, materiau, densite: D, noms: Object.keys(cellules) };
    });
  }

  // ═══════════════════════════════ les enseignes et les plaques de rue (atlas en pages) ═══════════════════════════════
  const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif', SANS = '"Helvetica Neue", Arial, "Liberation Sans", "DejaVu Sans", sans-serif', ETROITE = '"Arial Narrow", "Helvetica Neue", "Liberation Sans Narrow", Arial, sans-serif';
  const STYLES = { // choix de style (aucun logo de marque) : fond, liseré, lettres, police, capitales, pictogramme
    bar: { fond: '#5A1E1C', bord: '#C9A45C', texte: '#F2E3BF', police: SERIF, maj: false },
    cafe: { fond: '#5A1E1C', bord: '#C9A45C', texte: '#F2E3BF', police: SERIF },
    restaurant: { fond: '#1F3A2E', bord: '#C9A45C', texte: '#F0E2B6', police: SERIF },
    boulangerie: { fond: '#EFE3C6', bord: '#7A4A26', texte: '#6B3A1C', police: SERIF, picto: 'epi' },
    patisserie: { fond: '#F3DCD6', bord: '#8E4A5A', texte: '#7A2E45', police: SERIF },
    boucherie: { fond: '#7E2626', bord: '#E8D8B0', texte: '#FFF6E0', police: SERIF },
    poste: { fond: '#FFD200', texte: '#1E3A78', police: SANS, maj: true },
    banque: { fond: '#2A4560', texte: '#FFFFFF', police: SANS },
    pharmacie: { fond: '#F4F6F1', bord: '#1E8C45', texte: '#1E8C45', police: SANS, maj: true, picto: 'croix' },
    mairie: { fond: '#E2D9C6', texte: '#3A332B', police: SERIF, maj: true, grave: true, picto: 'drapeau' },
    tabac: { fond: '#262629', texte: '#FFFFFF', police: SANS, maj: true, picto: 'carotte' },
    presse: { fond: '#1D3E6E', texte: '#FFFFFF', police: SANS, maj: true },
    epicerie: { fond: '#A8322D', texte: '#FFFFFF', police: SANS }, supermarche: { fond: '#A8322D', texte: '#FFFFFF', police: SANS },
    tourisme: { fond: '#2C6C9A', texte: '#FFFFFF', police: SANS, picto: 'info' },
    coiffeur: { fond: '#1E1E22', bord: '#B9B2A2', texte: '#ECE5D6', police: SERIF },
    fleuriste: { fond: '#3D6B45', bord: '#E8DFC8', texte: '#F7F2E6', police: SERIF },
    garage: { fond: '#2F4B7C', texte: '#FFFFFF', police: SANS, maj: true },
    hotel: { fond: '#2B2A4C', bord: '#C9A45C', texte: '#F2E6C8', police: SERIF },
    commerce: { fond: '#2E3F4A', bord: '#B8A06A', texte: '#F3EBD9', police: SERIF },
  };
  const PAGES = [];
  function placer(pw, ph) { // une place libre dans une page (étagères), sinon une nouvelle page
    const [W, H] = [taille(TAILLES.page[0]), taille(TAILLES.page[1])], pad = 4;
    if (pw + 2 * pad > W) pw = W - 2 * pad;
    for (const p of PAGES) { if (p.W !== W) continue; for (const e of p.etageres) if (e.h === ph && e.x + pw + pad <= W) { const r = { p, x: e.x, y: e.y }; e.x += pw + pad; return r; } if (p.y + ph + pad <= H) { const e = { y: p.y, h: ph, x: pad + pw + pad }; p.etageres.push(e); p.y += ph + pad; return { p, x: pad, y: e.y }; } }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = Q.aniso; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.name = 'enseignes|' + PAGES.length; tx.userData.canvas = cv;
    marquer(tx, Math.round(W * H * 4 * 4 / 3), tx.name);
    const p = { cv, c: cv.getContext('2d'), tx, W, H, y: pad, etageres: [] }; PAGES.push(p); return placer(pw, ph);
  }
  function ajuster(c, txt, police, poids, h, max) { // une taille de lettres qui tient dans max (compression horizontale au-delà)
    c.font = `${poids} ${Math.round(h)}px ${police}`; const l = c.measureText(txt).width; return { l, k: l > max ? max / l : 1 };
  }
  function ecrire(c, txt, x, y, l, h, police, poids, coul, o) { // le texte centré dans (x, y, l, h), compressé s'il le faut
    o = o || {}; const t = ajuster(c, txt, police, poids, h * 0.66, l / (o.serre || 1)); c.save(); c.translate(x + l / 2, y + h * 0.54); c.scale(t.k * (o.serre || 1), 1); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `${poids} ${Math.round(h * 0.66)}px ${police}`;
    if (o.grave) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillText(txt, 1, 1.2); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillText(txt, -0.6, -0.6); }
    else if (o.ombre) { c.fillStyle = o.ombre; c.fillText(txt, 1, 1.5); }
    c.fillStyle = coul; c.fillText(txt, 0, 0); c.restore();
  }
  const PICTOS = {
    croix(c, x, y, s) { const g = s * 0.3; c.fillStyle = '#21A050'; c.fillRect(x + (s - g) / 2, y + s * 0.08, g, s * 0.84); c.fillRect(x + s * 0.08, y + (s - g) / 2, s * 0.84, g); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + (s - g) / 2 + 1, y + s * 0.08 + 1, g * 0.3, s * 0.84 - 2); },
    drapeau(c, x, y, s) { const w = s * 1.25, h = s * 0.8, y0 = y + s * 0.12; c.fillStyle = '#4A4038'; c.fillRect(x + 1, y0 - 2, 2, s * 0.86); for (let i = 0; i < 3; i++) { c.fillStyle = ['#1F3F92', '#F4F2EE', '#D3262E'][i]; c.beginPath(); for (let k = 0; k <= 8; k++) { const xx = x + 3 + w * (i + k / 8) / 3, dy = Math.sin((i * 8 + k) / 24 * TAU) * s * 0.05; if (k === 0) c.moveTo(xx, y0 + dy); else c.lineTo(xx, y0 + dy); } for (let k = 8; k >= 0; k--) { const xx = x + 3 + w * (i + k / 8) / 3, dy = Math.sin((i * 8 + k) / 24 * TAU) * s * 0.05; c.lineTo(xx, y0 + h + dy); } c.closePath(); c.fill(); } },
    carotte(c, x, y, s) { const cx = x + s * 0.5, w = s * 0.42; c.fillStyle = '#C8202A'; c.beginPath(); c.moveTo(cx, y + 1); c.lineTo(cx + w, y + s / 2); c.lineTo(cx, y + s - 1); c.lineTo(cx - w, y + s / 2); c.closePath(); c.fill(); c.fillStyle = '#FFF'; c.font = `bold ${Math.round(s * 0.2)}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TABAC', cx, y + s / 2 + 1); },
    epi(c, x, y, s) { c.strokeStyle = '#B8862E'; c.fillStyle = '#C9973C'; c.lineWidth = Math.max(1, s * 0.05); c.beginPath(); c.moveTo(x + s * 0.5, y + s * 0.95); c.lineTo(x + s * 0.5, y + s * 0.1); c.stroke(); for (let i = 0; i < 4; i++) for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(x + s * 0.5 + sg * s * 0.12, y + s * (0.22 + i * 0.16), s * 0.08, s * 0.14, sg * 0.5, 0, TAU); c.fill(); } },
    info(c, x, y, s) { c.fillStyle = '#FFFFFF'; rondRect(c, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.12); c.fill(); c.fillStyle = '#2C6C9A'; c.beginPath(); c.arc(x + s / 2, y + s * 0.27, s * 0.08, 0, TAU); c.fill(); c.fillRect(x + s * 0.43, y + s * 0.4, s * 0.14, s * 0.42); },
  };
  function uvDe(p, x, y, w, h) { return [x / p.W, 1 - (y + h) / p.H, (x + w) / p.W, 1 - y / p.H]; }
  function enseigne(texte, type) { // → { texture, uv: [u0, v0, u1, v1], ratio (largeur / hauteur), l, h (m, conseillés), page }
    if (!OK) return null; type = STYLES[type] ? type : type === 'carotte' || type === 'drapeau' ? type : 'commerce'; texte = String(texte == null ? '' : texte).trim().replace(/\s+/g, ' ').slice(0, 60);
    const H0 = taille(TAILLES.enseigne), cle = 'enseigne|' + type + '|' + texte + '|' + H0;
    return memo(cle, () => {
      const t0 = now(); let r;
      if (type === 'carotte' || type === 'drapeau') { // le losange rouge des tabacs (double face, à poser en drapeau) ; le drapeau tricolore
        const h = Math.round(H0 * (type === 'carotte' ? 2 : 1.2)), w = Math.round(type === 'carotte' ? h * 0.55 : h * 1.5), pl = placer(w, h), c = pl.p.c; c.clearRect(pl.x, pl.y, w, h);
        if (type === 'carotte') { const cx = pl.x + w / 2; c.fillStyle = '#B81C26'; c.beginPath(); c.moveTo(cx, pl.y + 1); c.lineTo(pl.x + w - 1, pl.y + h / 2); c.lineTo(cx, pl.y + h - 1); c.lineTo(pl.x + 1, pl.y + h / 2); c.closePath(); c.fill(); c.strokeStyle = '#E8D6B0'; c.lineWidth = 1.5; c.stroke(); c.fillStyle = '#FFFFFF'; c.font = `bold ${Math.round(h * 0.085)}px ${SANS}`; c.textAlign = 'center'; c.textBaseline = 'middle'; 'TABAC'.split('').forEach((l, i) => c.fillText(l, cx, pl.y + h * (0.3 + i * 0.1))); }
        else PICTOS.drapeau(c, pl.x, pl.y + h * 0.05, h * 0.95);
        pl.p.tx.needsUpdate = true; r = { texture: pl.p.tx, uv: uvDe(pl.p, pl.x, pl.y, w, h), ratio: w / h, l: type === 'carotte' ? 0.45 : 0.9, h: type === 'carotte' ? 0.8 : 0.6, page: PAGES.indexOf(pl.p) };
      } else {
        const st = STYLES[type], txt = st.maj ? texte.toLocaleUpperCase('fr-FR') : texte, h = H0, pic = st.picto ? h * 0.82 : 0, pw = st.picto === 'drapeau' ? pic * 1.35 : pic, c0 = PAGES.length ? PAGES[0].c : document.createElement('canvas').getContext('2d');
        const m = ajuster(c0, txt || ' ', st.police, st.police === SERIF ? 'bold' : '800', h * 0.66, 1e9), W = taille(TAILLES.page[0]) - 8;
        const w = Math.round(Math.min(W, Math.max(h * 2.6, m.l + h * 0.9 + (pic ? pw * 2 + h * 0.3 : 0)))), pl = placer(w, h), c = pl.p.c, x = pl.x, y = pl.y;
        c.save(); c.clearRect(x, y, w, h); rondRect(c, x, y, w, h, h * 0.08); c.clip();
        c.fillStyle = st.fond; c.fillRect(x, y, w, h);
        const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.16)'); c.fillStyle = g; c.fillRect(x, y, w, h);
        if (st.bord) { c.strokeStyle = st.bord; c.lineWidth = Math.max(1.5, h * 0.05); rondRect(c, x + h * 0.09, y + h * 0.09, w - h * 0.18, h - h * 0.18, h * 0.05); c.stroke(); }
        if (st.grave) { c.fillStyle = 'rgba(90,76,56,0.4)'; c.fillRect(x, y, w, 1.5); c.fillRect(x, y + h - 1.5, w, 1.5); }
        const marge = h * 0.45 + (pic ? pw + h * 0.15 : 0);
        if (pic) { const py = y + (h - pic) / 2; PICTOS[st.picto](c, x + h * 0.3, py, pic); if (st.picto !== 'carotte') PICTOS[st.picto](c, x + w - h * 0.3 - pw, py, pic); }
        if (txt) ecrire(c, txt, x + marge, y, w - 2 * marge, h, st.police, st.police === SERIF ? 'bold' : '800', st.texte, { grave: st.grave, ombre: st.grave ? null : 'rgba(0,0,0,0.3)' });
        moucheter(c, x, y, w, h, 0.07); c.restore();
        pl.p.tx.needsUpdate = true; r = { texture: pl.p.tx, uv: uvDe(pl.p, x, y, w, h), ratio: w / h, l: 0.6 * w / h, h: 0.6, page: PAGES.indexOf(pl.p) };
      }
      compter('enseignes', t0); return r;
    });
  }
  const TYPES_VOIE = /^(rue|place|impasse|chemin|route|avenue|allée|allee|quai|montée|montee|boulevard|cours|passage|ruelle|sentier|square|promenade|faubourg|clos|lotissement|porte|grande rue|petite rue|voie|esplanade|parvis|traverse|rampe)\b\s*/i;
  function plaqueRue(nom) { // plaque émaillée bleue, liseré blanc, texte blanc ; le type de voie en petit au-dessus s'il y en a un
    if (!OK) return null; nom = String(nom == null ? '' : nom).trim().replace(/\s+/g, ' ').slice(0, 60); const H0 = taille(TAILLES.plaque), cle = 'plaque|' + nom + '|' + H0;
    return memo(cle, () => {
      const t0 = now(), m = TYPES_VOIE.exec(nom), haut = m && m[0].trim().length < nom.length ? m[0].trim().toLocaleUpperCase('fr-FR') : '', bas = (haut ? nom.slice(m[0].length) : nom).toLocaleUpperCase('fr-FR');
      const h = H0, c0 = PAGES.length ? PAGES[0].c : document.createElement('canvas').getContext('2d'), SER = 0.86, W = taille(TAILLES.page[0]) - 8;
      const lb = Math.max(ajuster(c0, bas || ' ', ETROITE, 'bold', 0.66 * (haut ? 0.52 : 0.76) * h, 1e9).l, haut ? ajuster(c0, haut, ETROITE, 'bold', 0.66 * 0.3 * h, 1e9).l : 0) * SER;
      const w = Math.round(Math.min(W, Math.max(h * 2.2, lb + h * 0.62))), pl = placer(w, h), c = pl.p.c, x = pl.x, y = pl.y, rnd = mulberry32(hash(nom));
      c.save(); c.clearRect(x, y, w, h); rondRect(c, x, y, w, h, h * 0.16); c.clip();
      const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#2C55A0'); g.addColorStop(0.5, '#1E4388'); g.addColorStop(1, '#183A76'); c.fillStyle = g; c.fillRect(x, y, w, h);
      c.strokeStyle = '#F4F4F0'; c.lineWidth = Math.max(1.5, h * 0.045); rondRect(c, x + h * 0.1, y + h * 0.1, w - h * 0.2, h - h * 0.2, h * 0.08); c.stroke();
      if (haut) { ecrire(c, haut, x + h * 0.3, y + h * 0.13, w - h * 0.6, h * 0.3, ETROITE, 'bold', '#F4F4F0', { serre: SER }); ecrire(c, bas, x + h * 0.25, y + h * 0.38, w - h * 0.5, h * 0.52, ETROITE, 'bold', '#F7F7F2', { serre: SER }); }
      else ecrire(c, bas, x + h * 0.25, y + h * 0.12, w - h * 0.5, h * 0.76, ETROITE, 'bold', '#F7F7F2', { serre: SER });
      c.fillStyle = 'rgba(255,255,255,0.13)'; c.fillRect(x, y, w, h * 0.32);
      for (let i = 0; i < 4; i++) { const ex = rnd() < 0.5 ? x + rnd() * h * 0.3 : x + w - rnd() * h * 0.3, ey = y + rnd() * h, r = 0.6 + rnd() * h * 0.05; c.fillStyle = 'rgba(30,22,16,0.85)'; c.beginPath(); c.arc(ex, ey, r, 0, TAU); c.fill(); } // des éclats d'émail
      for (const sx of [x + h * 0.2, x + w - h * 0.2]) { c.fillStyle = '#9CA3AA'; c.beginPath(); c.arc(sx, y + h / 2, Math.max(1, h * 0.045), 0, TAU); c.fill(); }
      c.restore(); pl.p.tx.needsUpdate = true; compter('plaques', t0);
      return { texture: pl.p.tx, uv: uvDe(pl.p, x, y, w, h), ratio: w / h, l: 0.25 * w / h, h: 0.25, page: PAGES.indexOf(pl.p) };
    });
  }

  // ═══════════════════════════════ réglages, comptes, libération ═══════════════════════════════
  function init(renderer) { // facultatif : l'anisotropie maximale et WebGL2 (sans WebGL2, bati() rend null)
    try { if (renderer && renderer.capabilities) { Q.anisoMax = renderer.capabilities.getMaxAnisotropy() || 1; Q.webgl2 = !!renderer.capabilities.isWebGL2; Q.aniso = Math.min(QUALITES[Q.niveau].aniso, Q.anisoMax); } } catch (e) { /* rien */ }
    return { webgl2: Q.webgl2, anisotropie: Q.aniso };
  }
  function qualite(q) { if (q === undefined || !QUALITES[q]) return Q.niveau; Q.niveau = q; Q.k = QUALITES[q].k; Q.aniso = Math.min(QUALITES[q].aniso, Q.anisoMax); return Q.niveau; }
  function retour() { CACHE.forEach((v) => { const t = v && v.isTexture ? v : v && v.texture && v.texture.isTexture ? v.texture : null; if (t) t.needsUpdate = true; }); PAGES.forEach((p) => { p.tx.needsUpdate = true; }); } // après une perte du contexte WebGL
  function vider() { // libère vraiment tout (changement de qualité, fin du jeu) : les textures, les matériaux, les octets gardés
    const vus = new Set(); CACHE.forEach((v) => { const t = v && v.isTexture ? v : v && v.texture && v.texture.isTexture ? v.texture : null; if (t && !vus.has(t)) { vus.add(t); t.dispose(); } if (v && v.materiau) { try { const m = v.materiau(); m.dispose(); } catch (e) { /* rien */ } } });
    PAGES.forEach((p) => { if (!vus.has(p.tx)) p.tx.dispose(); }); PAGES.length = 0; CACHE.clear(); BASES.clear(); CHAMPS.clear(); TOILES.clear(); ST.octets = 0; ST.textures = 0;
  }
  function stats() { return { textures: ST.textures, octets: ST.octets, mo: +(ST.octets / 1048576).toFixed(2), generees: ST.generees, bases: ST.bases, ms: +ST.ms.toFixed(1), detail: Object.fromEntries(Object.entries(ST.detail).map(([k, v]) => [k, +v.toFixed(1)])), qualite: Q.niveau, pages: PAGES.length }; }
  function apercu(tx) { // une toile 2D pour voir une texture (pages de test) : DataTexture remise à l'endroit, ou la toile d'une CanvasTexture
    if (!tx) return null; if (tx.userData && tx.userData.canvas) return tx.userData.canvas; const im = tx.image; if (!im || !im.data) return null;
    const S = im.width, H = im.height, cv = document.createElement('canvas'); cv.width = S; cv.height = H; const c = cv.getContext('2d'), id = c.createImageData(S, H), d = im.data;
    for (let y = 0; y < H; y++) id.data.set(d.subarray((H - 1 - y) * S * 4, (H - y) * S * 4), y * S * 4); c.putImageData(id, 0, 0); return cv;
  }
  return {
    OK, init, qualite, facade, toit, sol, solPaquet, periode, bati, details, enseigne, plaqueRue, TEINTES, VOLETS: Object.keys(VOLETS), STYLES: Object.keys(STYLES).concat(['carotte', 'drapeau']),
    MURS: Object.keys(MURS), TOITS: Object.keys(TOITS), SOLS: Object.keys(SOLS), stats, retour, vider, apercu, _interne: { CACHE, BASES, PAGES, champs, hash },
  };
})();
if (typeof module !== 'undefined') module.exports = PTEXTURES;
