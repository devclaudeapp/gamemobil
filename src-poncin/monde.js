/* OPÉRATION PONCIN — le monde physique : relief, bâtiments (et leurs passages voûtés), eau et ponts, zones interdites, troncs, murs et
   mobilier massif ; collisions d'un cercle qui glisse le long des murs, rayons (les tirs), lignes de vue, points libres. Module pur
   (aucun DOM, aucun THREE) : tourne aussi dans Node pour les tests. Voir src-poncin/ARCHITECTURE.md (axes : x à l'est, z au sud, y en
   haut ; mètres).
   Tout ce qui bloque est ramené à des ARÊTES (segments du plan xz, éventuellement ÉPAISSES : une capsule de demi-épaisseur w) rangées
   dans une grille de cellules d'environ 12 m : murs des bâtiments, clôtures des zones interdites, berges (sauf dans le couloir des ponts,
   dont les côtés deviennent des parapets au-dessus de l'eau), bord du carré ; troncs (un point de rayon clamp(0,12 + 0,025·h ; 0,2 ;
   0,6), celui que dessine vegetation.js ; seulement les arbres mesurés [x, z, h, r, e] : les vieilles entrées [x, z, h] ne bloquent rien,
   comme avant), murs de carte.murs (demi-épaisseur e/2 ; un muret de 45 cm au plus se franchit comme une marche et n'arrête que les tirs
   bas), mobilier massif de carte.mobilier (fontaine, monument, croix, paroi d'un abribus, aux tailles de decor.js ; ni panneaux, ni
   poubelles, ni lampadaires) et les bancs de la place (un choix de style, pas une donnée : posés ici, pleins, monde.bancs [[x, z, yaw]],
   que decor.js dessine). Chaque arête est inscrite dans toutes les cellules à moins de MARGE + w d'elle : un cercle de
   rayon ≤ MARGE n'a besoin que de sa propre cellule. L'intérieur des polygones (est-on dedans ?) se lit par pair-impair, sauf dans les
   cellules sans arête, dont l'état (libre ou plein) est calculé une fois pour toutes. Aucune allocation dans les chemins chauds hors du
   résultat rendu. Une position déjà DANS une région pleine (téléportation ratée : jamais en jeu normal) est rendue par deplacer au point
   libre le plus proche. Pour les tirs, un tronc est un cylindre jusqu'à max(2,5 ; h/2) m (le feuillage laisse passer), un mur un bloc
   jusqu'à sol + h (sol pris à ses sommets, comme decor.js), un objet un cylindre (ou plusieurs : degrés, piédestal, obélisque du
   monument), le feuillage dense d'un conifère un cylindre de 0,3 à 0,6·h m qui arrête tirs et vues mais pas les pas ; leur dessus arrête aussi ce qui descend.
   PASSAGES VOÛTÉS (carte.passages [{ l: [a, b], w, h, b, n }]) : un couloir rectangulaire (axe a→b, largeur w) creusé au rez-de-chaussée
   des bâtiments b, sous une voûte en plein cintre : l'intrados est à sol + h − w/2 + √((w/2)² − e²) à l'écart e de l'axe (naissance à
   h − w/2, clé à h ; le sol suit le relief, linéaire de a à b). Au sol, les morceaux de façade compris dans le couloir disparaissent et
   ses côtés, dans l'emprise, deviennent des murs (les piédroits) : on y passe à pied, la navigation aussi. Pour les tirs et les vues, ces
   morceaux de façade n'arrêtent que ce qui passe au-dessus de l'arc ; un rayon qui monte sous la voûte la touche (le bâtiment reste plein
   au-dessus). h est borné pour que la clé reste 30 cm sous le toit, w pour que la naissance reste à 1,2 m au moins.
   L'API (contrat) : monde.L, hauteur(x, z) (le relief, ou la chaussée d'un pont si elle est plus haute : C7), relief(x, z) (le maillage
   seul, pour le sol dessiné), chaussee(x, z) (−Infinity hors des tabliers), tabliers [{ ax, az, bx, bz, ux, uz, vx, vz, len, w, demi, n,
   prof (Float64Array n + 1), max }] (le profil que rendu.js dessine, chaussée à prof + PMONDE.CHAUSSEE), bloque(x, z, r), deplacer(x, z, dx, dz, r) → [x, z], rayon(o…, d…, max) → { t, x, y, z,
   nx, ny, nz, quoi: 'mur' | 'toit' | 'sol', i, de, k } | null (i : indice du bâtiment, −1 sinon ; de : 'batiment' | 'voute' | 'arbre' |
   'mur' | 'mobilier' | 'terrain' ; k : l'indice dans carte.arbres, carte.murs ou carte.mobilier, celui du passage pour une voûte, −1
   sinon ; normale unitaire tournée vers le tireur), vue(a…, b…), libre(rnd, centre?, rayon?) → [x, z], limite, batiments [{ p, h, t,
   base, sommet, aabb, … }] (p dans le sens d'aire signée Σ(x_i·z_{i+1} − x_{i+1}·z_i) > 0 : la normale extérieure de l'arête a→b est
   (bz − az, ax − bx) / longueur), passages (ci-dessous).
   En plus : passe(ax, az, bx, bz, r) (la capsule du segment ne touche rien), dedans(x, z) (dans une région pleine), pente(x, z) →
   [dh/dx, dh/dz] (tableau partagé, à copier), sousVoute(x, z) → l'indice du passage dont on est sous la voûte, sinon −1 ; arche(p, x, z)
   → y de l'intrados du passage p au-dessus du point ; couloirs (les ponts), interdits, stats ; accessible (x, z) → bool, branché par
   PNAV.creer : libre() préfère alors la composante principale de la navigation (jamais une cour fermée).
   monde.passages (normalisés, pour rendu.js) : [{ n, l: [[ax, az], [bx, bz]], w, h, u: [ux, uz], long, sol: [ya, yb] (relief aux deux
   bouts), b: [indices de monde.batiments], bats: [{ i, entree: { x, z, a, s }, sortie: { x, z, a, s }, coupes: [{ a, s0, s1 }] }] }] :
   pour chaque bâtiment traversé, où l'axe entre dans son emprise et en sort (a : l'arête p[a] → p[a+1] de monde.batiments[i].p ; s : la
   distance depuis p[a], en m ; null si l'axe ne coupe pas son bord) et les morceaux de ses arêtes compris dans le couloir (de s0 à s1 m
   depuis p[a]) : les arcades à creuser sous l'arc. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./regles.js'));
  else root.PMONDE = factory(root.PREGLES);
})(typeof self !== 'undefined' ? self : this, function (REGLES) {
  'use strict';
  const CELLULE = 12;        // côté visé d'une cellule de la grille (m)
  const MARGE = 1.05;        // rayon couvert par l'inscription des arêtes (un joueur fait 0,35 m, les points libres demandent 1 m)
  const ELARGI_PONT = 0.5;   // le couloir d'un pont déborde de 0,5 m de chaque côté de sa largeur (1 m en tout)
  const SUR_TABLIER = 0.08;  // la maçonnerie d'un tablier, au-dessus du relief à ses deux bouts (m)
  const CHAUSSEE = 0.06;     // l'épaisseur de la chaussée posée sur la maçonnerie : on marche à prof + CHAUSSEE (m)
  const SOUS_BASE = 0.5;     // un bâtiment s'enfonce de 0,5 m sous le point le plus bas du relief sous son emprise
  const PEAU = 1e-4;         // le jeu laissé entre un cercle repoussé et le mur
  const PAS_SOL = 0.4;       // la marche sur le terrain avance d'au moins ce pas (m), puis la dichotomie affine
  // la source d'une arête : ≥ 0, le mur d'un bâtiment (son indice) ; sinon ce qui suit (seuls arbre, mur et mobilier arrêtent les tirs)
  const SOURCE = { interdit: -1, eau: -2, bord: -3, parapet: -4, arbre: -5, mur: -6, mobilier: -7 };
  const MARCHE = 0.45;       // un mur de 45 cm au plus se franchit comme une marche : il n'arrête que les tirs
  const VOUTE = { w: 3.2, h: 3.4, naissance: 1.2, sousToit: 0.3, wMax: 5 }; // passage sans w ni h ; bornes de la voûte
  // le mobilier massif, aux tailles que dessine decor.js : rayon au sol, hauteur (ou une liste de cylindres concentriques : le monument a
  // ses degrés de 2,6 m puis 2 m, son piédestal et sa corniche, son obélisque fuselé 0,42 → 0,24 jusqu'à 4,95 m) ; l'abribus : sa paroi du fond (repère de l'objet)
  const MOBILIER = { fontaine: { r: 1.15, h: 0.6 }, monument: [{ r: 1.3, h: 0.4 }, { r: 0.75, h: 2.1 }, { r: 0.36, h: 4.7 }], croix: { r: 0.45, h: 1.36 }, abribus: { r: 0.08, h: 2.38, paroi: [1.55, -0.62] } };
  const rTronc = (h) => { const r = 0.12 + 0.025 * h; return r < 0.2 ? 0.2 : r > 0.6 ? 0.6 : r; }; // le rayon d'un tronc (m)
  const hTronc = (h) => Math.max(2.5, 0.5 * h);  // la hauteur de tronc qui arrête les tirs (au-dessus, le feuillage les laisse passer)
  // les étages d'un conifère descendent jusqu'au sol : ce feuillage dense arrête les tirs et les vues, pas les pas ; un cylindre de 0,3 m
  // à 0,6·h (dans le cône dessiné), de rayon min(0,45·r ; tronc + joueur − 5 cm) : jamais assez large pour qu'on y ait l'œil (un rayon
  // parti du dedans l'ignore : on s'y cacherait en tirant) ; 0 : rien (feuillu, saule… : couronne au-dessus des têtes, rideaux clairsemés)
  const R_JOUEUR = REGLES && REGLES.JOUEUR && REGLES.JOUEUR.rayon > 0 ? REGLES.JOUEUR.rayon : 0.35;
  const rFeuillage = (h, r, e) => { if (e !== 'conifere') return 0; const f = Math.min(0.45 * r, rTronc(h) + R_JOUEUR - 0.05); return f > rTronc(h) + 0.05 ? f : 0; };
  const DE = ['batiment', 'voute', 'arbre', 'mur', 'mobilier', 'terrain'];
  const fini = (v) => typeof v === 'number' && v - v === 0;

  // ─── géométrie plane ───
  const aire = (q) => { let s = 0; for (let i = 0, n = q.length; i < n; i++) { const a = q[i], b = q[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  // un polygone propre : points finis, sans doublon ni point final répété, aire signée Σ(x_i·z_{i+1} − x_{i+1}·z_i) > 0
  // (sens horaire vu du dessus, nord en haut : la normale extérieure de l'arête a→b est (bz − az, −(bx − ax)) / longueur) ; null s'il est dégénéré
  function nettoyer(p) {
    if (!Array.isArray(p)) return null;
    const q = [];
    for (const pt of p) {
      if (!pt) continue; const x = +pt[0], z = +pt[1]; if (!fini(x) || !fini(z)) continue;
      const d = q[q.length - 1]; if (d && Math.abs(d[0] - x) < 1e-6 && Math.abs(d[1] - z) < 1e-6) continue;
      q.push([x, z]);
    }
    while (q.length > 1 && Math.abs(q[0][0] - q[q.length - 1][0]) < 1e-6 && Math.abs(q[0][1] - q[q.length - 1][1]) < 1e-6) q.pop();
    if (q.length < 3) return null;
    const a = aire(q); if (!(Math.abs(a) > 1e-3)) return null;
    if (a < 0) q.reverse();
    return q;
  }
  const aplatir = (q) => { const f = new Float64Array(q.length * 2); q.forEach((pt, i) => { f[2 * i] = pt[0]; f[2 * i + 1] = pt[1]; }); return f; };
  function dansPoly(f, x, z) { // pair-impair sur [x0, z0, x1, z1, …]
    let d = false;
    for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
      const zi = f[i + 1], zj = f[j + 1];
      if ((zi > z) !== (zj > z) && x < f[i] + (f[j] - f[i]) * (z - zi) / (zj - zi)) d = !d;
    }
    return d;
  }
  function d2PtSeg(px, pz, ax, az, bx, bz) {
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - ax - t * ex, dz = pz - az - t * ez; return dx * dx + dz * dz;
  }
  function croise(ax, az, bx, bz, cx, cz, dx, dz) { // les segments ab et cd se coupent franchement (un simple contact ne compte pas)
    const d1 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx), d2 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
    if (!((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))) return false;
    const d3 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax), d4 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
    return (d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0);
  }
  // distance² entre deux segments (−1 s'ils se croisent)
  const d2SegSeg = (ax, az, bx, bz, cx, cz, dx, dz) => croise(ax, az, bx, bz, cx, cz, dx, dz) ? -1
    : Math.min(d2PtSeg(ax, az, cx, cz, dx, dz), d2PtSeg(bx, bz, cx, cz, dx, dz), d2PtSeg(cx, cz, ax, az, bx, bz), d2PtSeg(dx, dz, ax, az, bx, bz));
  function d2SegRect(ax, az, bx, bz, x0, z0, x1, z1) { // distance² d'un segment à un rectangle plein (construction seulement)
    let t0 = 0, t1 = 1; const ex = bx - ax, ez = bz - az;
    const coupe = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (coupe(-ex, ax - x0) && coupe(ex, x1 - ax) && coupe(-ez, az - z0) && coupe(ez, z1 - az) && t0 <= t1) return 0;
    const dr = (x, z) => { const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dz = z < z0 ? z0 - z : z > z1 ? z - z1 : 0; return dx * dx + dz * dz; };
    return Math.min(dr(ax, az), dr(bx, bz), d2PtSeg(x0, z0, ax, az, bx, bz), d2PtSeg(x1, z0, ax, az, bx, bz), d2PtSeg(x0, z1, ax, az, bx, bz), d2PtSeg(x1, z1, ax, az, bx, bz));
  }
  function boite(p) { let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); } return [x0, z0, x1, z1]; }
  function croisementsPoly(q, ax, az, bx, bz) { // où le segment a→b coupe le bord du polygone q : [{ t (0..1 sur a→b), a (arête q[a]→q[a+1]), s (m depuis q[a]) }], dans l'ordre
    const r = [], ex = bx - ax, ez = bz - az;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], d = q[(k + 1) % q.length], fx = d[0] - c[0], fz = d[1] - c[1], den = ex * fz - ez * fx; if (Math.abs(den) < 1e-12) continue;
      const t = ((c[0] - ax) * fz - (c[1] - az) * fx) / den, u = ((c[0] - ax) * ez - (c[1] - az) * ex) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u < 1) r.push({ t, a: k, s: u * Math.hypot(fx, fz) });
    }
    return r.sort((p, q2) => p.t - q2.t);
  }

  function creer(carte) {
    carte = carte || {};
    const L = fini(+carte.taille) && carte.taille > 0 ? +carte.taille : 600, X0 = -L / 2, X1 = L / 2;
    const liste = (v) => Array.isArray(v) ? v : [];

    // ─── le relief : une seule triangulation, partagée avec le rendu (diagonale (i+1, j)–(i, j+1) de chaque case) ───
    const R = carte.relief;
    let rn = 0, rpas = 1, rh = null, hMin = 0, hMax = 0, penteMax = 0;
    if (R && R.n >= 2 && fini(+R.pas) && R.pas > 0 && R.h && R.h.length >= R.n * R.n) {
      rn = R.n | 0; rpas = +R.pas; rh = new Float64Array(rn * rn);
      for (let k = 0; k < rn * rn; k++) { const v = +R.h[k]; rh[k] = fini(v) ? v : 0; }
      hMin = Infinity; hMax = -Infinity;
      for (let k = 0; k < rh.length; k++) { if (rh[k] < hMin) hMin = rh[k]; if (rh[k] > hMax) hMax = rh[k]; }
      for (let j = 0; j < rn - 1; j++) for (let i = 0; i < rn - 1; i++) { // la plus forte pente d'un triangle (borne de Lipschitz de la marche des rayons)
        const k = j * rn + i, a = rh[k], b = rh[k + 1], c = rh[k + rn], d = rh[k + rn + 1];
        penteMax = Math.max(penteMax, Math.hypot(b - a, c - a) / rpas, Math.hypot(d - c, d - b) / rpas);
      }
    }
    const RM = rn - 1;
    function relief(x, z) {
      if (!rh) return 0;
      let u = (x - X0) / rpas, v = (z - X0) / rpas;
      if (!(u > 0)) u = 0; else if (u > RM) u = RM;
      if (!(v > 0)) v = 0; else if (v > RM) v = RM;
      let i = u | 0, j = v | 0; if (i >= RM) i = RM - 1; if (j >= RM) j = RM - 1;
      const fx = u - i, fz = v - j, k = j * rn + i;
      if (fx + fz <= 1) { const a = rh[k]; return a + fx * (rh[k + 1] - a) + fz * (rh[k + rn] - a); }
      const d = rh[k + rn + 1]; return d + (1 - fx) * (rh[k + rn] - d) + (1 - fz) * (rh[k + 1] - d);
    }
    const PENTE = [0, 0]; // dh/dx, dh/dz au point (triangle du maillage, ou le tablier d'un pont)
    function penteRelief(x, z) {
      PENTE[0] = 0; PENTE[1] = 0; if (!rh) return PENTE;
      let u = (x - X0) / rpas, v = (z - X0) / rpas;
      if (!(u > 0)) u = 0; else if (u > RM) u = RM;
      if (!(v > 0)) v = 0; else if (v > RM) v = RM;
      let i = u | 0, j = v | 0; if (i >= RM) i = RM - 1; if (j >= RM) j = RM - 1;
      const k = j * rn + i;
      if (u - i + v - j <= 1) { PENTE[0] = (rh[k + 1] - rh[k]) / rpas; PENTE[1] = (rh[k + rn] - rh[k]) / rpas; }
      else { PENTE[0] = (rh[k + rn + 1] - rh[k + rn]) / rpas; PENTE[1] = (rh[k + rn + 1] - rh[k + 1]) / rpas; }
      return PENTE;
    }
    // le minimum exact du relief sous une emprise : le relief est linéaire par triangle, son minimum est aux sommets de l'emprise, à ses
    // croisements avec les lignes du maillage (u, v et u + v entiers) ou aux nœuds de la grille à l'intérieur
    function minRelief(q, f) {
      if (!rh) return 0;
      let m = Infinity; const n = q.length;
      for (let a = 0; a < n; a++) {
        const [ax, az] = q[a], [bx, bz] = q[(a + 1) % n]; m = Math.min(m, relief(ax, az));
        const ua = (ax - X0) / rpas, va = (az - X0) / rpas, ub = (bx - X0) / rpas, vb = (bz - X0) / rpas;
        const lignes = (p0, p1) => { if (p1 === p0) return; const lo = Math.ceil(Math.min(p0, p1)), hi = Math.floor(Math.max(p0, p1)); for (let k = Math.max(lo, -1); k <= Math.min(hi, 2 * rn + 1); k++) { const t = (k - p0) / (p1 - p0); if (t > 0 && t < 1) m = Math.min(m, relief(ax + (bx - ax) * t, az + (bz - az) * t)); } };
        lignes(ua, ub); lignes(va, vb); lignes(ua + va, ub + vb);
      }
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let j = Math.max(0, Math.ceil((z0 - X0) / rpas)); j <= Math.min(RM, Math.floor((z1 - X0) / rpas)); j++)
        for (let i = Math.max(0, Math.ceil((x0 - X0) / rpas)); i <= Math.min(RM, Math.floor((x1 - X0) / rpas)); i++)
          if (dansPoly(f, X0 + i * rpas, X0 + j * rpas)) m = Math.min(m, rh[j * rn + i]);
      return fini(m) ? m : 0;
    }

    // ─── les bâtiments normalisés ───
    const batiments = [], BF = [], deCarte = []; // BF : emprises aplaties ; deCarte : indice dans carte.batiments → indice ici (−1 : écarté)
    for (const b of liste(carte.batiments)) {
      const p = nettoyer(b && b.p); if (!p) { deCarte.push(-1); continue; }
      const f = aplatir(p), h = fini(+b.h) && b.h > 0 ? +b.h : 6;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const [x, z] of p) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const base = minRelief(p, f) - SOUS_BASE;
      deCarte.push(batiments.length); BF.push(f);
      batiments.push(Object.assign({}, b, { p, h, t: b.t || 'maison', base, sommet: base + h, aabb: [x0, z0, x1, z1] }));
    }
    const NB = batiments.length;

    // ─── les passages voûtés : un couloir (axe a→b, demi-largeur hw) creusé sous les bâtiments b ───
    const PV = [], passages = [], BPASS = batiments.map(() => null); // BPASS[i] : les passages qui traversent le bâtiment i
    for (const pa of liste(carte.passages)) {
      const l = pa && pa.l; if (!Array.isArray(l) || l.length < 2 || !l[0] || !l[l.length - 1]) continue;
      const ax = +l[0][0], az = +l[0][1], bx = +l[l.length - 1][0], bz = +l[l.length - 1][1];
      if (![ax, az, bx, bz].every(fini)) continue;
      const lg = Math.hypot(bx - ax, bz - az); if (lg < 0.5) continue;
      const ux = (bx - ax) / lg, uz = (bz - az) / lg, b = [];
      if (Array.isArray(pa.b)) for (const v of pa.b) { const m = Number.isInteger(+v) ? deCarte[+v] : -1; if (m >= 0 && !b.includes(m)) b.push(m); }
      if (!b.length) batiments.forEach((bt, i) => { // sans b : les bâtiments que l'axe traverse
        const [x0, z0, x1, z1] = bt.aabb; if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) return;
        for (let s = 0.25; s < lg; s += 0.25) if (dansPoly(BF[i], ax + ux * s, az + uz * s)) { b.push(i); return; }
      });
      if (!b.length) continue;
      const ya = relief(ax, az), yb = relief(bx, bz);
      let h = fini(+pa.h) && pa.h > 0 ? +pa.h : VOUTE.h, hw = (fini(+pa.w) && pa.w > 0 ? Math.min(VOUTE.wMax, +pa.w) : VOUTE.w) / 2;
      for (const i of b) h = Math.min(h, batiments[i].sommet - Math.max(ya, yb) - VOUTE.sousToit); // la clé reste sous le toit
      hw = Math.min(hw, h - VOUTE.naissance); // la naissance de la voûte reste à 1,2 m au moins
      if (!(hw >= 0.5)) continue; // un bâtiment trop bas pour une voûte
      const nx = -uz, nz = ux, coins = [[ax + nx * hw, az + nz * hw], [bx + nx * hw, bz + nz * hw], [bx - nx * hw, bz - nz * hw], [ax - nx * hw, az - nz * hw]];
      const p = PV.length;
      PV.push({ ax, az, bx, bz, ux, uz, lg, hw, h, ya, yb, k: (yb - ya) / lg, b, coins, box: boite(coins) });
      for (const i of b) (BPASS[i] = BPASS[i] || []).push(p);
      passages.push({ n: typeof pa.n === 'string' ? pa.n : '', l: [[ax, az], [bx, bz]], w: 2 * hw, h, u: [ux, uz], long: lg, sol: [ya, yb], b: b.slice(),
        bats: b.map((i) => { const X = croisementsPoly(batiments[i].p, ax, az, bx, bz), pt = (c) => c ? { x: ax + (bx - ax) * c.t, z: az + (bz - az) * c.t, a: c.a, s: c.s } : null; return { i, entree: pt(X[0]), sortie: pt(X[X.length - 1]), coupes: [] }; }) });
    }
    const NP = PV.length;
    const dansCouloir = (P, x, z) => { const rx = x - P.ax, rz = z - P.az, t = rx * P.ux + rz * P.uz, e = rz * P.ux - rx * P.uz; return t >= 0 && t <= P.lg && e >= -P.hw && e <= P.hw; };
    function couper(P, ax, az, bx, bz) { // [s0, s1] (0..1) du segment a→b dans le couloir P, ou null
      const rx = ax - P.ax, rz = az - P.az, dx = bx - ax, dz = bz - az; let s0 = 0, s1 = 1;
      const lim = (v0, dv, lo, hi) => { if (Math.abs(dv) < 1e-12) return v0 >= lo && v0 <= hi; let a = (lo - v0) / dv, b = (hi - v0) / dv; if (a > b) { const s = a; a = b; b = s; } if (a > s0) s0 = a; if (b < s1) s1 = b; return s0 <= s1; };
      return lim(rx * P.ux + rz * P.uz, dx * P.ux + dz * P.uz, 0, P.lg) && lim(rz * P.ux - rx * P.uz, dz * P.ux - dx * P.uz, -P.hw, P.hw) && s1 - s0 > 1e-9 ? [s0, s1] : null;
    }
    function arcP(P, x, z) { // l'intrados du passage P au-dessus de (x, z) : naissance contre les piédroits, clé sur l'axe
      const rx = x - P.ax, rz = z - P.az; let t = rx * P.ux + rz * P.uz; t = t < 0 ? 0 : t > P.lg ? P.lg : t;
      const e = rz * P.ux - rx * P.uz, n = P.ya + P.k * t + P.h - P.hw, q = P.hw * P.hw - e * e;
      return q > 0 ? n + Math.sqrt(q) : n;
    }

    // ─── les régions pleines (pour « est-on dedans ? ») : bâtiments (moins leurs passages), zones interdites, eau ───
    const regions = []; // { f, aabb, k: 0 bâtiment | 1 interdit | 2 eau, i }
    batiments.forEach((b, i) => regions.push({ f: BF[i], aabb: b.aabb, k: 0, i, q: b.p }));
    const interdits = [];
    for (const z of liste(carte.interdit)) { const p = nettoyer(z && z.p); if (p) { interdits.push({ p, n: z.n || '' }); regions.push({ f: aplatir(p), aabb: boite(p), k: 1, i: interdits.length - 1, q: p }); } }
    const eaux = [];
    for (const e of liste(carte.eau)) { const p = nettoyer(e && e.p); if (p) { eaux.push({ p, t: e.t || 'riviere', f: aplatir(p) }); regions.push({ f: eaux[eaux.length - 1].f, aabb: boite(p), k: 2, i: eaux.length - 1, q: p }); } }
    const dansEau = (x, z) => eaux.some((e) => dansPoly(e.f, x, z));

    // ─── les ponts : un couloir rectangulaire où l'eau ne bloque plus, prolongé jusqu'à sortir de l'eau ───
    const couloirs = [];
    for (const pt of liste(carte.ponts)) {
      const l = pt && pt.l; if (!Array.isArray(l) || l.length < 2 || !l[0] || !l[l.length - 1]) continue;
      const ax = +l[0][0], az = +l[0][1], bx = +l[l.length - 1][0], bz = +l[l.length - 1][1];
      if (![ax, az, bx, bz].every(fini)) continue;
      const lg = Math.hypot(bx - ax, bz - az); if (lg < 0.1) continue;
      const ux = (bx - ax) / lg, uz = (bz - az) / lg, vx = -uz, vz = ux, dw = (fini(+pt.w) && pt.w > 0 ? +pt.w : 5) / 2 + ELARGI_PONT;
      const mouille = (x, z) => { for (let s = -1; s <= 1.0001; s += 0.25) if (dansEau(x + vx * dw * s, z + vz * dw * s)) return true; return false; };
      let e0 = 1, e1 = 1;
      while (e0 < 40 && mouille(ax - ux * e0, az - uz * e0)) e0 += 1;
      while (e1 < 40 && mouille(bx + ux * e1, bz + uz * e1)) e1 += 1;
      const sx = ax - ux * e0, sz = az - uz * e0, tx = bx + ux * e1, tz = bz + uz * e1;
      couloirs.push({ mx: (sx + tx) / 2, mz: (sz + tz) / 2, ux, uz, vx, vz, dl: (lg + e0 + e1) / 2, dw,
        coins: [[sx - vx * dw, sz - vz * dw], [tx - vx * dw, tz - vz * dw], [tx + vx * dw, tz + vz * dw], [sx + vx * dw, sz + vz * dw]], w: dw * 2 });
    }
    const dansCouloirPont = (C, x, z) => { const dx = x - C.mx, dz = z - C.mz; return Math.abs(dx * C.ux + dz * C.uz) <= C.dl && Math.abs(dx * C.vx + dz * C.vz) <= C.dw; };

    // ─── les tabliers des ponts (C7) : la chaussée que dessine rendu.js, et sur laquelle on marche (monde.hauteur la suit) ───
    // Une seule formule, ici : le profil part du relief + SUR_TABLIER aux deux bouts du pont (carte.ponts, a → b), droit d'une rive à
    // l'autre mais jamais sous le relief + SUR_TABLIER, échantillonné tous les ≤ 1,5 m (n + 1 points, linéaire entre eux) ; la chaussée est
    // à prof + CHAUSSEE. rendu.js dessine la maçonnerie à prof et la chaussée à prof + CHAUSSEE à partir de monde.tabliers. On y marche
    // sur toute la largeur du couloir (w/2 + ELARGI_PONT de chaque côté de l'axe, jusqu'aux parapets du monde), de a à b ; ailleurs le
    // relief. monde.hauteur = max(relief, chaussée) : un bout de pont est une marche de 14 cm, comme dessinée.
    const tabliers = [];
    let tX0 = Infinity, tZ0 = Infinity, tX1 = -Infinity, tZ1 = -Infinity;
    for (const pt of liste(carte.ponts)) {
      const l = pt && pt.l; if (!Array.isArray(l) || l.length < 2 || !l[0] || !l[l.length - 1]) continue;
      const ax = +l[0][0], az = +l[0][1], bx = +l[l.length - 1][0], bz = +l[l.length - 1][1];
      if (![ax, az, bx, bz].every(fini)) continue;
      const len = Math.hypot(bx - ax, bz - az); if (len < 1) continue;
      const w = fini(+pt.w) && pt.w > 0 ? +pt.w : 6, n = Math.max(2, Math.ceil(len / 1.5)), prof = new Float64Array(n + 1);
      const hA = relief(ax, az) + SUR_TABLIER, hB = relief(bx, bz) + SUR_TABLIER;
      for (let k = 0; k <= n; k++) { const t = k / n; prof[k] = Math.max(hA + (hB - hA) * t, relief(ax + (bx - ax) * t, az + (bz - az) * t) + SUR_TABLIER); }
      const ux = (bx - ax) / len, uz = (bz - az) / len, demi = w / 2 + ELARGI_PONT;
      tabliers.push({ ax, az, bx, bz, ux, uz, vx: -uz, vz: ux, len, w, demi, n, prof, max: Math.max(...prof) + CHAUSSEE });
      for (const [x, z] of [[ax - uz * demi, az + ux * demi], [ax + uz * demi, az - ux * demi], [bx - uz * demi, bz + ux * demi], [bx + uz * demi, bz - ux * demi]]) { tX0 = Math.min(tX0, x); tX1 = Math.max(tX1, x); tZ0 = Math.min(tZ0, z); tZ1 = Math.max(tZ1, z); }
    }
    for (const T of tabliers) if (T.max > hMax) hMax = T.max; // les rayons qui passent au-dessus du relief peuvent toucher un tablier
    let tablierVu = -1, tablierPente = 0; // le dernier tablier trouvé par chaussee() et la pente de sa chaussée le long de l'axe (sans allocation)
    function chaussee(x, z) { // la hauteur de la chaussée d'un pont au point, ou −Infinity hors des tabliers
      tablierVu = -1; if (x < tX0 || x > tX1 || z < tZ0 || z > tZ1) return -Infinity;
      let best = -Infinity;
      for (let i = 0; i < tabliers.length; i++) {
        const T = tabliers[i], rx = x - T.ax, rz = z - T.az, s = rx * T.ux + rz * T.uz;
        if (s < -1e-9 || s > T.len + 1e-9 || Math.abs(rx * T.vx + rz * T.vz) > T.demi) continue;
        let u = s / T.len * T.n, k = u | 0; if (k >= T.n) k = T.n - 1; u -= k;
        const h = T.prof[k] + (T.prof[k + 1] - T.prof[k]) * u + CHAUSSEE;
        if (h > best) { best = h; tablierVu = i; tablierPente = (T.prof[k + 1] - T.prof[k]) * T.n / T.len; }
      }
      return best;
    }
    function hauteur(x, z) { const r = relief(x, z); if (tabliers.length === 0) return r; const c = chaussee(x, z); return c > r ? c : r; }
    function pente(x, z) {
      if (tabliers.length && chaussee(x, z) > relief(x, z)) { const T = tabliers[tablierVu]; PENTE[0] = tablierPente * T.ux; PENTE[1] = tablierPente * T.uz; return PENTE; }
      return penteRelief(x, z);
    }
    function intervalleCouloir(C, ax, az, bx, bz) { // [t0, t1] du segment a→b dans le couloir, ou null
      let t0 = 0, t1 = 1;
      for (const [ex, ez, demi] of [[C.ux, C.uz, C.dl], [C.vx, C.vz, C.dw]]) {
        const s0 = (ax - C.mx) * ex + (az - C.mz) * ez, ds = (bx - ax) * ex + (bz - az) * ez;
        if (Math.abs(ds) < 1e-12) { if (s0 < -demi || s0 > demi) return null; continue; }
        let ta = (-demi - s0) / ds, tb = (demi - s0) / ds; if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 >= t1) return null;
      }
      return [t0, t1];
    }

    // ─── les arêtes : AM bloquent au sol (et les tirs, selon leur source), AV n'arrêtent que les tirs (façades au-dessus d'une arcade,
    // murets) ; [ax, az, bx, bz, source, demi-épaisseur w, aux] (aux : l'obstacle d'une capsule, le passage d'une façade, sinon −1) ───
    const AM = [], AV = [];
    const arete = (T, ax, az, bx, bz, s, w, aux) => { w = w || 0; if (Math.hypot(bx - ax, bz - az) > 1e-6 || w > 0) T.push(ax, az, bx, bz, s, w, aux == null ? -1 : aux); };
    batiments.forEach((b, i) => {
      const q = b.p, ps = BPASS[i];
      for (let a = 0; a < q.length; a++) {
        const u = q[a], v = q[(a + 1) % q.length];
        if (!ps) { arete(AM, u[0], u[1], v[0], v[1], i); continue; }
        // une façade qui passe dans un couloir : ouverte au sol, gardée pour les tirs au-dessus de l'arc
        const iv = []; for (const p of ps) { const c = couper(PV[p], u[0], u[1], v[0], v[1]); if (c) iv.push([c[0], c[1], p]); }
        iv.sort((x, y) => x[0] - y[0]);
        const ex = v[0] - u[0], ez = v[1] - u[1], lgA = Math.hypot(ex, ez); let s = 0;
        for (const [s0, s1, p] of iv) {
          if (s0 > s) arete(AM, u[0] + ex * s, u[1] + ez * s, u[0] + ex * s0, u[1] + ez * s0, i);
          const d = Math.max(s, s0);
          if (s1 > d) { arete(AV, u[0] + ex * d, u[1] + ez * d, u[0] + ex * s1, u[1] + ez * s1, i, 0, p); const bt = passages[p].bats.find((x) => x.i === i); bt.coupes.push({ a, s0: d * lgA, s1: s1 * lgA }); }
          s = Math.max(s, s1);
        }
        if (s < 1) arete(AM, u[0] + ex * s, u[1] + ez * s, v[0], v[1], i);
      }
    });
    PV.forEach((P) => { // les côtés du couloir, là où ils sont dans l'emprise d'un bâtiment traversé : les piédroits
      for (let c = 0; c < 4; c++) {
        const [ax, az] = P.coins[c], [bx, bz] = P.coins[(c + 1) % 4];
        for (const i of P.b) {
          const ts = [0, 1]; for (const x of croisementsPoly(batiments[i].p, ax, az, bx, bz)) ts.push(x.t);
          ts.sort((x, y) => x - y);
          for (let k = 0; k + 1 < ts.length; k++) {
            const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
            if (dansPoly(BF[i], ax + (bx - ax) * (t0 + t1) / 2, az + (bz - az) * (t0 + t1) / 2)) arete(AM, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, i);
          }
        }
      }
    });
    for (const z of interdits) { const q = z.p; for (let a = 0; a < q.length; a++) { const u = q[a], v = q[(a + 1) % q.length]; arete(AM, u[0], u[1], v[0], v[1], SOURCE.interdit); } }
    for (const e of eaux) { // les berges, moins leurs morceaux dans un couloir de pont
      const q = e.p;
      for (let a = 0; a < q.length; a++) {
        const [ax, az] = q[a], [bx, bz] = q[(a + 1) % q.length];
        let morceaux = [[0, 1]];
        for (const C of couloirs) {
          const iv = intervalleCouloir(C, ax, az, bx, bz); if (!iv) continue;
          const suite = [];
          for (const [m0, m1] of morceaux) { if (Math.min(m1, iv[0]) - m0 > 1e-9) suite.push([m0, Math.min(m1, iv[0])]); if (m1 - Math.max(m0, iv[1]) > 1e-9) suite.push([Math.max(m0, iv[1]), m1]); }
          morceaux = suite;
        }
        for (const [m0, m1] of morceaux) arete(AM, ax + (bx - ax) * m0, az + (bz - az) * m0, ax + (bx - ax) * m1, az + (bz - az) * m1, SOURCE.eau);
      }
    }
    couloirs.forEach((C, ci) => { // les côtés d'un couloir, là où ils passent au-dessus de l'eau (hors d'un autre couloir), deviennent des parapets
      for (let a = 0; a < 4; a++) {
        const [ax, az] = C.coins[a], [bx, bz] = C.coins[(a + 1) % 4], ts = [0, 1];
        const coupe = (q) => { for (let k = 0; k < q.length; k++) { const [cx, cz] = q[k], [dx, dz] = q[(k + 1) % q.length]; const ex = bx - ax, ez = bz - az, fx = dx - cx, fz = dz - cz, den = ex * fz - ez * fx; if (Math.abs(den) < 1e-12) continue; const t = ((cx - ax) * fz - (cz - az) * fx) / den, u = ((cx - ax) * ez - (cz - az) * ex) / den; if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t); } };
        eaux.forEach((e) => coupe(e.p)); couloirs.forEach((D, di) => { if (di !== ci) coupe(D.coins); });
        ts.sort((p, q) => p - q);
        for (let k = 0; k + 1 < ts.length; k++) {
          const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
          const mx = ax + (bx - ax) * (t0 + t1) / 2, mz = az + (bz - az) * (t0 + t1) / 2;
          if (dansEau(mx, mz) && !couloirs.some((D, di) => di !== ci && dansCouloirPont(D, mx, mz))) arete(AM, ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1, SOURCE.parapet);
        }
      }
    });
    arete(AM, X0, X0, X1, X0, SOURCE.bord); arete(AM, X1, X0, X1, X1, SOURCE.bord); arete(AM, X1, X1, X0, X1, SOURCE.bord); arete(AM, X0, X1, X0, X0, SOURCE.bord);

    // ─── les obstacles (capsules) : troncs, murs, mobilier massif ; OB : [haut en a, haut en b, bas, de, k] ───
    const OB = [], compte = { troncs: 0, feuillages: 0, murs: 0, murets: 0, mobilier: 0, bancs: 0 };
    const obstacle = (ax, az, bx, bz, w, ya, yb, bas, de, k, sol) => { arete(sol ? AM : AV, ax, az, bx, bz, de === 2 ? SOURCE.arbre : de === 3 ? SOURCE.mur : SOURCE.mobilier, w, OB.length / 5); OB.push(ya, yb, bas, de, k); };
    liste(carte.arbres).forEach((a, k) => {
      if (!Array.isArray(a) || a.length < 5) return; // une vieille entrée [x, z, h] ne bloque rien (comme avant)
      const x = +a[0], z = +a[1], h = +a[2]; if (!fini(x) || !fini(z) || !(h > 0) || !(x >= X0 && x <= X1 && z >= X0 && z <= X1)) return;
      const y = hauteur(x, z); obstacle(x, z, x, z, rTronc(h), y + hTronc(h), y + hTronc(h), y - 0.6, 2, k, true); compte.troncs++;
      const rf = rFeuillage(h, +a[3], a[4]); if (rf > 0) { obstacle(x, z, x, z, rf, y + 0.6 * h, y + 0.6 * h, y + 0.3, 2, k, false); compte.feuillages++; }
    });
    liste(carte.murs).forEach((m, k) => { // hauteur et épaisseur comme decor.js les dessine
      const l = m && m.l; if (!Array.isArray(l)) return;
      const h = fini(+m.h) && m.h > 0.3 ? Math.min(6, Math.max(0.4, +m.h)) : 1.8, e = fini(+m.e) && m.e > 0.05 ? Math.min(1.2, Math.max(0.1, +m.e)) : 0.45;
      let px = NaN, pz = NaN;
      for (const q of l) {
        if (!q || !fini(+q[0]) || !fini(+q[1])) continue; const x = +q[0], z = +q[1];
        if (fini(px)) { const ya = hauteur(px, pz), yb = hauteur(x, z); obstacle(px, pz, x, z, e / 2, ya + h, yb + h, Math.min(ya, yb) - 0.6, 3, k, h > MARCHE); }
        px = x; pz = z;
      }
      if (h > MARCHE) compte.murs++; else compte.murets++;
    });
    liste(carte.mobilier).forEach((o, k) => {
      const d = o && MOBILIER[o.t]; if (!d) return; const x = +o.x, z = +o.z; if (!fini(x) || !fini(z)) return;
      const y = hauteur(x, z); compte.mobilier++;
      if (Array.isArray(d) || !d.paroi) { for (const q of Array.isArray(d) ? d : [d]) obstacle(x, z, x, z, q.r, y + q.h, y + q.h, y - 0.6, 4, k, true); return; }
      // repère de decor.js : l'objet regarde vers (−sin yaw, −cos yaw) ; (x, z) local → (x0 − cos·x − sin·z, z0 + sin·x − cos·z)
      const yaw = fini(+o.yaw) ? +o.yaw : 0, c = Math.cos(yaw), s = Math.sin(yaw), [lx, lz] = d.paroi;
      obstacle(x + c * lx - s * lz, z - s * lx - c * lz, x - c * lx - s * lz, z + s * lx - c * lz, d.r, y + d.h, y + d.h, y - 0.6, 4, k, true);
    });

    // ─── les bancs de la place (un CHOIX DE STYLE, pas une donnée : OSM n'en a pas à Poncin) : seulement s'il y a une place nommée (« Place … »
    // dans carte.noms, à moins de 40 m du centre de l'arène) ; sous les arbres mesurés à moins de 32 m d'elle, 4 au plus, à 1,9 m du tronc
    // et dos à lui ; ses deux bouts, les pieds de l'assis et 1,2 m devant : hors des rues (0,8 m du bord de chaussée), des régions pleines,
    // à 0,3 m de toute arête au sol et à 0,9 m des autres troncs ; 7 m entre deux bancs. decor.js dessine monde.bancs [[x, z, yaw]] (l'objet
    // regarde vers (−sin yaw, −cos yaw)). Un banc est plein, comme du mobilier : une capsule sur son emprise (1,8 × 0,41 m, dossier à 0,86 m).
    const bancs = [];
    {
      const AR = carte.zones && carte.zones.arene, AC = AR && Array.isArray(AR.centre) && fini(+AR.centre[0]) && fini(+AR.centre[1]) ? [+AR.centre[0], +AR.centre[1]] : [0, 0];
      const np = liste(carte.noms).find((o) => o && typeof o.n === 'string' && /^place\b/i.test(o.n) && fini(+o.x) && fini(+o.z) && Math.hypot(o.x - AC[0], o.z - AC[1]) < 40), PC = np ? [+np.x, +np.z] : null;
      if (PC) {
        const pres = (x, z, d) => Math.abs(x - PC[0]) < d && Math.abs(z - PC[1]) < d;
        const arbres = liste(carte.arbres).filter((a) => Array.isArray(a) && fini(+a[0]) && fini(+a[1]) && pres(+a[0], +a[1], 40));
        const ancres = arbres.filter((a) => a.length >= 5 && Math.hypot(a[0] - PC[0], a[1] - PC[1]) < 32).sort((a, b) => Math.hypot(a[0] - PC[0], a[1] - PC[1]) - Math.hypot(b[0] - PC[0], b[1] - PC[1]));
        const rues = []; for (const r of liste(carte.rues)) { const l = r && Array.isArray(r.l) ? r.l : null; if (!l) continue; const w = fini(+r.w) ? +r.w : 5; for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1]; if (Array.isArray(a) && Array.isArray(b) && fini(+a[0]) && fini(+a[1]) && fini(+b[0]) && fini(+b[1])) rues.push(+a[0], +a[1], +b[0], +b[1], w / 2); } }
        const aretes = []; for (let o = 0; o < AM.length; o += 7) if (d2SegRect(AM[o], AM[o + 1], AM[o + 2], AM[o + 3], PC[0] - 40, PC[1] - 40, PC[0] + 40, PC[1] + 40) < 4) aretes.push(o);
        const proches = regions.filter((r) => r.aabb[2] > PC[0] - 40 && r.aabb[0] < PC[0] + 40 && r.aabb[3] > PC[1] - 40 && r.aabb[1] < PC[1] + 40);
        const distRue = (x, z) => { let m = 99; for (let o = 0; o < rues.length; o += 5) { const d = Math.sqrt(d2PtSeg(x, z, rues[o], rues[o + 1], rues[o + 2], rues[o + 3])) - rues[o + 4]; if (d < m) m = d; } return m; };
        const gene = (x, z, a) => !(x >= X0 && x <= X1 && z >= X0 && z <= X1) || distRue(x, z) < 0.8 || proches.some((r) => x >= r.aabb[0] && x <= r.aabb[2] && z >= r.aabb[1] && z <= r.aabb[3] && dansPoly(r.f, x, z))
          || aretes.some((o) => d2PtSeg(x, z, AM[o], AM[o + 1], AM[o + 2], AM[o + 3]) < (0.3 + AM[o + 5]) ** 2) || arbres.some((t) => t !== a && Math.hypot(t[0] - x, t[1] - z) < 0.9);
        for (const a of ancres) {
          if (bancs.length >= 4) break; let best = null;
          for (let k = 0; k < 16; k++) {
            const ang = k / 16 * Math.PI * 2, x = +a[0] + Math.cos(ang) * 1.9, z = +a[1] + Math.sin(ang) * 1.9, yaw = Math.atan2(-Math.cos(ang), -Math.sin(ang)), c = Math.cos(yaw), s = Math.sin(yaw);
            const pt = (lx, lz) => [x - c * lx - s * lz, z + s * lx - c * lz]; // le repère des objets (decor.js)
            if ([pt(-1, 0), pt(1, 0), pt(-1, 0.6), pt(1, 0.6), pt(0, 1.2)].some((p) => gene(p[0], p[1], a))) continue;
            if (bancs.some((o) => Math.hypot(o[0] - x, o[1] - z) < 7)) continue;
            const sc = Math.hypot(x - PC[0], z - PC[1]) - 0.5 * Math.min(4, distRue(x, z)); if (!best || sc < best[3]) best = [x, z, yaw, sc];
          }
          if (best) bancs.push(best.slice(0, 3));
        }
        for (const [x, z, yaw] of bancs) { // l'emprise que dessine decor.js : x local ∈ [−0,9 ; 0,9], z local ∈ [−0,22 ; 0,19], dossier à 0,86 m
          const c = Math.cos(yaw), s = Math.sin(yaw), y = Math.min(hauteur(x, z), hauteur(x + 0.9, z), hauteur(x - 0.9, z)), lz = -0.015;
          obstacle(x + c * 0.78 - s * lz, z - s * 0.78 - c * lz, x - c * 0.78 - s * lz, z + s * 0.78 - c * lz, 0.23, y + 0.86, y + 0.86, y - 0.6, 4, -1, true); compte.bancs++; // k = −1 : pas un objet de carte.mobilier
        }
      }
    }

    // ─── les tableaux : arêtes 0..NM−1 au sol, NM..NA−1 pour les tirs seulement ───
    const NM = AM.length / 7, NA = NM + AV.length / 7, E = new Float64Array(NA * 4), ES = new Int32Array(NA), EW = new Float64Array(NA), EX = new Int32Array(NA);
    const ranger = (T, d0) => { for (let k = 0; k < T.length / 7; k++) { const o = 7 * k, d = d0 + k; E[4 * d] = T[o]; E[4 * d + 1] = T[o + 1]; E[4 * d + 2] = T[o + 2]; E[4 * d + 3] = T[o + 3]; ES[d] = T[o + 4]; EW[d] = T[o + 5]; EX[d] = T[o + 6]; } };
    ranger(AM, 0); ranger(AV, NM);
    const NOB = OB.length / 5, OYA = new Float64Array(NOB), OYB = new Float64Array(NOB), OBAS = new Float64Array(NOB), ODE = new Int8Array(NOB), OK = new Int32Array(NOB);
    for (let j = 0; j < NOB; j++) { OYA[j] = OB[5 * j]; OYB[j] = OB[5 * j + 1]; OBAS[j] = OB[5 * j + 2]; ODE[j] = OB[5 * j + 3]; OK[j] = OB[5 * j + 4]; }
    const BASE = new Float64Array(NB), SOMMET = new Float64Array(NB);
    batiments.forEach((b, i) => { BASE[i] = b.base; SOMMET[i] = b.sommet; });

    // ─── la grille : arêtes (avec la marge), au sol (cA) et toutes (cT, pour les tirs), régions (par leur boîte), en listes compactes ───
    const G = Math.max(1, Math.ceil(L / CELLULE)), CS = L / G, INV = 1 / CS;
    const ci = (x) => { const i = Math.floor((x - X0) * INV); return i < 0 ? 0 : i >= G ? G - 1 : i; };
    function compacter(listes) { const d = new Int32Array(G * G + 1); let n = 0; for (let c = 0; c < G * G; c++) { d[c] = n; n += listes[c].length; } d[G * G] = n; const v = new Int32Array(n); for (let c = 0; c < G * G; c++) v.set(listes[c], d[c]); return [d, v]; }
    const lA = Array.from({ length: G * G }, () => []), lT = Array.from({ length: G * G }, () => []), lR = Array.from({ length: G * G }, () => []);
    for (let k = 0; k < NA; k++) {
      const ax = E[4 * k], az = E[4 * k + 1], bx = E[4 * k + 2], bz = E[4 * k + 3], m = MARGE + EW[k];
      for (let j = ci(Math.min(az, bz) - m); j <= ci(Math.max(az, bz) + m); j++)
        for (let i = ci(Math.min(ax, bx) - m); i <= ci(Math.max(ax, bx) + m); i++)
          if (d2SegRect(ax, az, bx, bz, X0 + i * CS, X0 + j * CS, X0 + (i + 1) * CS, X0 + (j + 1) * CS) <= m * m) { if (k < NM) lA[j * G + i].push(k); lT[j * G + i].push(k); }
    }
    regions.forEach((r, k) => { const [x0, z0, x1, z1] = r.aabb; for (let j = ci(z0); j <= ci(z1); j++) for (let i = ci(x0); i <= ci(x1); i++) lR[j * G + i].push(k); });
    const [cA0, cA] = compacter(lA), [cT0, cT] = compacter(lT), [cR0, cR] = compacter(lR);
    const RF = regions.map((r) => r.f), RK = new Int8Array(regions.map((r) => r.k)), RB = new Float64Array(regions.length * 4);
    regions.forEach((r, k) => RB.set(r.aabb, 4 * k));
    // dedans sans raccourci : dans un bâtiment (hors de ses passages), une zone interdite, l'eau hors des couloirs, ou hors du carré
    function dedansLent(x, z, c) {
      if (!(x >= X0 && x <= X1 && z >= X0 && z <= X1)) return true;
      for (let n = cR0[c]; n < cR0[c + 1]; n++) {
        const k = cR[n], o = 4 * k;
        if (x < RB[o] || x > RB[o + 2] || z < RB[o + 1] || z > RB[o + 3] || !dansPoly(RF[k], x, z)) continue;
        if (RK[k] === 0) {
          const ps = BPASS[k]; // les régions des bâtiments viennent d'abord : k est l'indice du bâtiment
          if (ps) { let creux = false; for (let m = 0; m < ps.length; m++) if (dansCouloir(PV[ps[m]], x, z)) { creux = true; break; } if (creux) continue; }
          return true;
        }
        if (RK[k] !== 2) return true;
        let pont = false; for (let m = 0; m < couloirs.length; m++) if (dansCouloirPont(couloirs[m], x, z)) { pont = true; break; }
        if (!pont) return true;
      }
      return false;
    }
    const ETAT = new Uint8Array(G * G); // 0 libre, 1 plein (cellule sans arête au sol), 2 mélangée
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = j * G + i; ETAT[c] = cA0[c + 1] > cA0[c] ? 2 : dedansLent(X0 + (i + 0.5) * CS, X0 + (j + 0.5) * CS, c) ? 1 : 0; }
    function dedans(x, z) {
      if (!(x >= X0 && x <= X1 && z >= X0 && z <= X1)) return true;
      const c = ci(z) * G + ci(x), e = ETAT[c];
      return e === 2 ? dedansLent(x, z, c) : e === 1;
    }
    function sousVoute(x, z) { // l'indice du passage dont (x, z) est sous la voûte (dans le couloir et dans l'emprise d'un bâtiment traversé), sinon −1
      if (!fini(x) || !fini(z)) return -1;
      for (let p = 0; p < NP; p++) {
        const P = PV[p]; if (!dansCouloir(P, x, z)) continue;
        for (let m = 0; m < P.b.length; m++) { const i = P.b[m], a = batiments[i].aabb; if (x >= a[0] && x <= a[2] && z >= a[1] && z <= a[3] && dansPoly(BF[i], x, z)) return p; }
      }
      return -1;
    }
    const arche = (p, x, z) => PV[p] && fini(x) && fini(z) ? arcP(PV[p], x, z) : NaN;

    // ─── marquage « déjà vu » sans réallocation ───
    const VU_A = new Uint32Array(NA), VU_R = new Uint32Array(regions.length); let tour = 0;
    const nouveauTour = () => { if (++tour > 4e9) { VU_A.fill(0); VU_R.fill(0); tour = 1; } return tour; };
    const CAND = new Int32Array(NM + 1); // arêtes candidates d'un déplacement (au sol)
    function rassembler(x0, z0, x1, z1, m) { // les arêtes au sol dont la capsule touche [x0 − m, x1 + m] × [z0 − m, z1 + m] (boîtes) → CAND ; renvoie leur nombre
      const t = nouveauTour(), e = Math.max(0, m - MARGE); let n = 0;
      const i0 = ci(x0 - e), i1 = ci(x1 + e), j0 = ci(z0 - e), j1 = ci(z1 + e);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c = j * G + i;
        for (let s = cA0[c]; s < cA0[c + 1]; s++) {
          const k = cA[s]; if (VU_A[k] === t) continue; VU_A[k] = t;
          const o = 4 * k, ax = E[o], az = E[o + 1], bx = E[o + 2], bz = E[o + 3], mw = m + EW[k];
          if ((ax < bx ? ax : bx) > x1 + mw || (ax > bx ? ax : bx) < x0 - mw || (az < bz ? az : bz) > z1 + mw || (az > bz ? az : bz) < z0 - mw) continue;
          CAND[n++] = k;
        }
      }
      return n;
    }
    // les cellules traversées par un segment, dans l'ordre (Amanatides–Woo), avec le paramètre d'entrée dans [0, 1]
    const LC = new Int32Array(2 * G + 8), LT = new Float64Array(2 * G + 8);
    function traverser(ax, az, bx, bz) {
      const gx = (ax - X0) * INV, gz = (az - X0) * INV, ddx = (bx - ax) * INV, ddz = (bz - az) * INV;
      let t0 = 0, t1 = 1;
      const coupe = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
      if (!(coupe(-ddx, gx) && coupe(ddx, G - gx) && coupe(-ddz, gz) && coupe(ddz, G - gz)) || t0 > t1) return 0;
      let i = Math.floor(gx + ddx * t0), j = Math.floor(gz + ddz * t0);
      if (i < 0) i = 0; else if (i >= G) i = G - 1; if (j < 0) j = 0; else if (j >= G) j = G - 1;
      const si = ddx > 0 ? 1 : ddx < 0 ? -1 : 0, sj = ddz > 0 ? 1 : ddz < 0 ? -1 : 0;
      let tx = si > 0 ? (i + 1 - gx) / ddx : si < 0 ? (i - gx) / ddx : Infinity, tz = sj > 0 ? (j + 1 - gz) / ddz : sj < 0 ? (j - gz) / ddz : Infinity;
      const px = si ? Math.abs(1 / ddx) : Infinity, pz = sj ? Math.abs(1 / ddz) : Infinity;
      let n = 0, t = t0;
      for (;;) {
        LC[n] = j * G + i; LT[n] = t; n++;
        if (n >= LC.length) break;
        if (tx < tz) { if (tx > t1) break; t = tx; i += si; tx += px; if (i < 0 || i >= G) break; }
        else { if (tz > t1) break; t = tz; j += sj; tz += pz; if (j < 0 || j >= G) break; }
      }
      return n;
    }
    const limiteOk = (l) => !!(l && l.centre && fini(+l.centre[0]) && fini(+l.centre[1]) && fini(+l.rayon) && l.rayon > 0);

    // ─── bloque : le cercle touche une arête (capsule), est dans une région pleine, sort du carré ou de la limite ───
    function bloque(x, z, r) {
      r = r > 0 ? +r : 0;
      if (!fini(x) || !fini(z)) return true;
      if (x < X0 + r || x > X1 - r || z < X0 + r || z > X1 - r) return true;
      const lim = monde.limite;
      if (limiteOk(lim)) { const dx = x - lim.centre[0], dz = z - lim.centre[1], m = lim.rayon - r; if (m <= 0 || dx * dx + dz * dz > m * m) return true; }
      if (r <= MARGE) {
        const c = ci(z) * G + ci(x);
        for (let s = cA0[c]; s < cA0[c + 1]; s++) { const k = cA[s], o = 4 * k, rr = r + EW[k]; if (d2PtSeg(x, z, E[o], E[o + 1], E[o + 2], E[o + 3]) < rr * rr) return true; }
      } else {
        const n = rassembler(x, z, x, z, r);
        for (let s = 0; s < n; s++) { const k = CAND[s], o = 4 * k, rr = r + EW[k]; if (d2PtSeg(x, z, E[o], E[o + 1], E[o + 2], E[o + 3]) < rr * rr) return true; }
      }
      return dedans(x, z);
    }

    // ─── deplacer : sous-pas plus courts que le rayon (on ne peut pas sauter un mur), repoussé hors des arêtes (on glisse), puis vérifié :
    // à la fin de chaque sous-pas, aucune arête plus près que le rayon (plus sa demi-épaisseur) et aucune arête franchie ; sinon on essaie
    // l'axe x seul, l'axe z seul, ou on reste. Une position de départ déjà enfoncée peut en sortir, jamais s'enfoncer davantage. ───
    let QX = 0, QZ = 0, NC = 0, BX0 = 0, BZ0 = 0, BX1 = 0, BZ1 = 0, SEUIL = 0, SEUIL2 = 0, LCX = 0, LCZ = 0, LM = -1;
    function essai(px, pz, sx, sz, r) {
      let qx = px + sx, qz = pz + sz;
      for (let it = 0; it < 5; it++) {
        let bouge = false;
        for (let s = 0; s < NC; s++) {
          const k = CAND[s], o = 4 * k, ax = E[o], az = E[o + 1], ex = E[o + 2] - ax, ez = E[o + 3] - az, l2 = ex * ex + ez * ez, rr = r + EW[k];
          let t = l2 > 0 ? ((qx - ax) * ex + (qz - az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
          let dx = qx - ax - t * ex, dz = qz - az - t * ez; const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-9) { // pile sur l'arête (ou sur le centre d'un tronc) : on repousse du côté d'où l'on vient
            if (l2 > 0) { dx = ez; dz = -ex; d = Math.sqrt(l2); if ((px - ax) * dx + (pz - az) * dz < 0) { dx = -dx; dz = -dz; } }
            else { dx = px - ax; dz = pz - az; d = Math.sqrt(dx * dx + dz * dz); if (d < 1e-9) { dx = 1; dz = 0; d = 1; } }
            qx += dx / d * (rr + PEAU); qz += dz / d * (rr + PEAU);
          } else { const kk = (rr + PEAU - d) / d; qx += dx * kk; qz += dz * kk; }
          bouge = true;
        }
        if (LM >= 0) { const dx = qx - LCX, dz = qz - LCZ, d = Math.sqrt(dx * dx + dz * dz); if (d > LM) { const k = (LM - PEAU) / d; qx = LCX + dx * k; qz = LCZ + dz * k; bouge = true; } }
        if (!bouge) break;
      }
      if (!(qx >= BX0 && qx <= BX1 && qz >= BZ0 && qz <= BZ1)) return false; // repoussé hors de la zone dont on a lu les arêtes
      for (let s = 0; s < NC; s++) {
        const k = CAND[s], o = 4 * k, ax = E[o], az = E[o + 1], bx = E[o + 2], bz = E[o + 3], w = EW[k], d2 = d2PtSeg(qx, qz, ax, az, bx, bz);
        if (w > 0) { const sw = SEUIL + w; if (sw > 0 && d2 < sw * sw) return false; } else if (d2 < SEUIL2) return false;
        if (croise(px, pz, qx, qz, ax, az, bx, bz)) return false;
      }
      if (LM >= 0) { const dx = qx - LCX, dz = qz - LCZ; if (dx * dx + dz * dz > (LM + 1e-6) * (LM + 1e-6)) return false; }
      QX = qx; QZ = qz; return true;
    }
    function ejecter(x, z, r) { // le point libre le plus proche d'une position perdue dans une région pleine (jamais en jeu normal)
      for (let d = 0.25; d <= 40; d += 0.25) {
        const n = Math.max(8, Math.ceil(d * 6));
        for (let a = 0; a < n; a++) { const qx = x + Math.cos(a * 2 * Math.PI / n) * d, qz = z + Math.sin(a * 2 * Math.PI / n) * d; if (!bloque(qx, qz, r)) return [qx, qz]; }
      }
      return secours();
    }
    function deplacer(x, z, dx, dz, r) {
      if (!fini(x) || !fini(z)) { const s = secours(); return [s[0], s[1]]; }
      if (!fini(dx) || !fini(dz)) { dx = 0; dz = 0; }
      r = fini(r) && r > 0.01 ? +r : 0.01;
      if (dedans(x, z)) return ejecter(x, z, r); // dans un mur, dans l'eau, hors du carré : on ressort au plus près plutôt que d'y rester
      let lg = Math.sqrt(dx * dx + dz * dz);
      if (lg < 1e-12) return [x, z];
      const pas = 0.9 * r; let n = Math.ceil(lg / pas);
      if (n > 400) { const k = 400 * pas / lg; dx *= k; dz *= k; lg *= k; n = 400; } // un « déplacement » de plus de 400 sous-pas n'en est pas un
      const m = 3 * r + 0.1, x0 = Math.min(x, x + dx), x1 = Math.max(x, x + dx), z0 = Math.min(z, z + dz), z1 = Math.max(z, z + dz);
      NC = rassembler(x0, z0, x1, z1, m); BX0 = x0 - 2 * r; BX1 = x1 + 2 * r; BZ0 = z0 - 2 * r; BZ1 = z1 + 2 * r;
      let jeu2 = Infinity, jeuW = Infinity; // le dégagement de départ : un cercle déjà enfoncé a le droit de le rester, pas de s'enfoncer plus
      for (let s = 0; s < NC; s++) {
        const k = CAND[s], o = 4 * k, d2 = d2PtSeg(x, z, E[o], E[o + 1], E[o + 2], E[o + 3]), w = EW[k];
        if (w > 0) { const d = Math.sqrt(d2) - w; if (d < jeuW) jeuW = d; } else if (d2 < jeu2) jeu2 = d2;
      }
      const seuil = Math.min(r - 1e-3, Math.sqrt(jeu2) - 1e-6, jeuW - 1e-6); SEUIL = seuil; SEUIL2 = seuil > 0 ? seuil * seuil : 0;
      const lim = monde.limite; LM = -1;
      if (limiteOk(lim)) { LCX = +lim.centre[0]; LCZ = +lim.centre[1]; LM = Math.max(lim.rayon - r, Math.hypot(x - LCX, z - LCZ)); }
      const sx = dx / n, sz = dz / n; let px = x, pz = z;
      for (let k = 0; k < n; k++) {
        if (essai(px, pz, sx, sz, r) || essai(px, pz, sx, 0, r) || essai(px, pz, 0, sz, r)) { px = QX; pz = QZ; }
        else break; // coincé : on reste au dernier point sûr
      }
      return [px, pz];
    }

    // ─── passe : la capsule de rayon r le long de a→b ne touche rien (ni arête ni région pleine, dans le carré et la limite) ───
    function passe(ax, az, bx, bz, r) {
      r = r > 0 ? +r : 0;
      if (bloque(ax, az, r) || bloque(bx, bz, r)) return false;
      if (r <= MARGE) {
        const t = nouveauTour(), n = traverser(ax, az, bx, bz);
        for (let s = 0; s < n; s++) {
          const c = LC[s];
          for (let u = cA0[c]; u < cA0[c + 1]; u++) {
            const k = cA[u]; if (VU_A[k] === t) continue; VU_A[k] = t;
            const o = 4 * k, rr = r + EW[k]; if (d2SegSeg(ax, az, bx, bz, E[o], E[o + 1], E[o + 2], E[o + 3]) < rr * rr) return false;
          }
        }
        return true;
      }
      const n = rassembler(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), r);
      for (let s = 0; s < n; s++) { const k = CAND[s], o = 4 * k, rr = r + EW[k]; if (d2SegSeg(ax, az, bx, bz, E[o], E[o + 1], E[o + 2], E[o + 3]) < rr * rr) return false; }
      return true;
    }

    // ─── rayon : le premier mur, toit, voûte, tronc, mur, objet ou bout de terrain touché (bâtiments = prismes de base à sommet, toits plats) ───
    const H = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, quoi: '', i: -1, de: '', k: -1 };
    let CNX = 0, CNY = 0, CNZ = 0; // la normale du dernier obstacle touché
    function capsule(k, ox, oy, oz, dx, dy, dz, best) { // le rayon contre l'obstacle k (capsule du plan xz, sous son sommet, ou son dessus) → t, ou −1
      const o = 4 * k, ax = E[o], az = E[o + 1], ex = E[o + 2] - ax, ez = E[o + 3] - az, w = EW[k], j = EX[k], l2 = ex * ex + ez * ez, px = ox - ax, pz = oz - az;
      let tin = Infinity, nx = 0, nz = 0;
      if (l2 > 1e-12) { // les deux grands côtés
        const lg = Math.sqrt(l2), mx = -ez / lg, mz = ex / lg, e0 = px * mx + pz * mz, s0 = (px * ex + pz * ez) / lg;
        if (e0 <= w && e0 >= -w && s0 >= 0 && s0 <= lg) return -1; // parti de dedans : on l'ignore
        const dm = dx * mx + dz * mz;
        if (e0 > w ? dm < 0 : e0 < -w ? dm > 0 : false) {
          const sg = e0 > 0 ? 1 : -1, tt = (sg * w - e0) / dm, s = s0 + (dx * ex + dz * ez) / lg * tt;
          if (tt >= 0 && tt < best && s >= 0 && s <= lg) { tin = tt; nx = sg * mx; nz = sg * mz; }
        }
      }
      const A2 = dx * dx + dz * dz;
      for (let q = 0; q < 2; q++) { // les deux bouts arrondis (un seul pour un tronc)
        if (q && l2 <= 1e-12) break;
        const qx = q ? px - ex : px, qz = q ? pz - ez : pz, B = qx * dx + qz * dz, C = qx * qx + qz * qz - w * w;
        if (C <= 0) return -1;
        if (B >= 0) continue;
        const D = B * B - A2 * C; if (D < 0) continue;
        const tt = (-B - Math.sqrt(D)) / A2; if (tt < tin && tt < best) { tin = tt; nx = (qx + dx * tt) / w; nz = (qz + dz * tt) / w; }
      }
      if (tin === Infinity) return -1;
      // le dessus : haut = ya + (yb − ya)·f, f la position le long du segment (bornée à [0, 1]), linéaire en t : f = f0 + f1·t
      const ya = OYA[j], dyab = OYB[j] - ya, f0 = l2 > 1e-12 ? (px * ex + pz * ez) / l2 : 0, f1 = l2 > 1e-12 ? (dx * ex + dz * ez) / l2 : 0;
      let f = f0 + f1 * tin; f = f < 0 ? 0 : f > 1 ? 1 : f;
      const y = oy + dy * tin;
      if (y <= ya + dyab * f) { if (y < OBAS[j]) return -1; CNX = nx; CNY = 0; CNZ = nz; return tin; }
      if (dy < 0) { // passé au-dessus du bord : il peut retomber sur le dessus (le premier t où y = haut ; au-delà d'un bout arrondi, le dessus est plat)
        let tt = Infinity; const den = dy - dyab * f1;
        if (den < 0) { const t1 = (ya + dyab * f0 - oy) / den, g = f0 + f1 * t1; if (t1 > tin && g >= 0 && g <= 1) tt = t1; }
        const ta = (ya - oy) / dy, tb = (ya + dyab - oy) / dy;
        if (ta > tin && ta < tt && f0 + f1 * ta <= 0) tt = ta; if (tb > tin && tb < tt && f0 + f1 * tb >= 1) tt = tb;
        if (tt > tin && tt < best && d2PtSeg(ox + dx * tt, oz + dz * tt, ax, az, ax + ex, az + ez) <= w * w) { CNX = 0; CNY = 1; CNZ = 0; return tt; }
      }
      return -1;
    }
    function solEn(ox, oy, oz, dx, dy, dz, tDeb, tFin) { // la marche sur le terrain (pas bornés par la pente, puis dichotomie) ; renvoie t ou −1
      if (!rh || !(tFin > tDeb)) return -1;
      const f = (t) => oy + dy * t - hauteur(ox + dx * t, oz + dz * t);
      let a = tDeb, fa = f(a);
      if (fa < 0) return a;
      if (dy >= 0 && oy > hMax) return -1;
      if (dy < 0) { const tb = (oy - hMin) / -dy; if (tb < tFin) tFin = tb + 1e-6; } // sous le point le plus bas, plus rien à toucher
      const K = Math.abs(dy) + penteMax * Math.sqrt(dx * dx + dz * dz) + 1e-9;
      while (a < tFin) {
        const b = Math.min(tFin, a + Math.max(PAS_SOL, fa / K)), fb = f(b);
        if (fb < 0) {
          let lo = a, hi = b;
          for (let k = 0; k < 40 && hi - lo > 1e-5; k++) { const m = (lo + hi) / 2; if (f(m) < 0) hi = m; else lo = m; }
          return hi;
        }
        a = b; fa = fb;
      }
      return -1;
    }
    function lancer(ox, oy, oz, dx, dy, dz, max) { // remplit H, renvoie vrai si quelque chose est touché avant max
      let best = max, quoi = 0, bi = -1, de = 0, bk = -1, bnx = 0, bny = 0, bnz = 0;
      const hl = Math.sqrt(dx * dx + dz * dz), t = nouveauTour();
      // l'entrée dans le carré et sa sortie bornent la recherche sur le terrain (au-delà, il n'y a plus de monde)
      let tSort = max, tEnt = 0;
      if (dx > 0) { tSort = Math.min(tSort, (X1 - ox) / dx); tEnt = Math.max(tEnt, (X0 - ox) / dx); } else if (dx < 0) { tSort = Math.min(tSort, (X0 - ox) / dx); tEnt = Math.max(tEnt, (X1 - ox) / dx); } else if (ox < X0 || ox > X1) tSort = -1;
      if (dz > 0) { tSort = Math.min(tSort, (X1 - oz) / dz); tEnt = Math.max(tEnt, (X0 - oz) / dz); } else if (dz < 0) { tSort = Math.min(tSort, (X0 - oz) / dz); tEnt = Math.max(tEnt, (X1 - oz) / dz); } else if (oz < X0 || oz > X1) tSort = -1;
      const n = hl > 1e-9 ? traverser(ox, oz, ox + dx * max, oz + dz * max) : (ox >= X0 && ox <= X1 && oz >= X0 && oz <= X1 ? (LC[0] = ci(oz) * G + ci(ox), LT[0] = 0, 1) : 0);
      for (let s = 0; s < n; s++) {
        if (LT[s] * max > best) break;
        const c = LC[s];
        if (hl > 1e-9) for (let u = cT0[c]; u < cT0[c + 1]; u++) { // les murs, les façades au-dessus des arcades, les obstacles
          const k = cT[u]; if (VU_A[k] === t) continue; VU_A[k] = t;
          const b = ES[k];
          if (b >= 0) {
            const o = 4 * k, ax = E[o], az = E[o + 1], ex = E[o + 2] - ax, ez = E[o + 3] - az, den = dx * ez - dz * ex;
            if (den > -1e-12 && den < 1e-12) continue;
            const wx = ax - ox, wz = az - oz, tt = (wx * ez - wz * ex) / den;
            if (tt < 0 || tt >= best) continue;
            const uu = (wx * dz - wz * dx) / den; if (uu < 0 || uu > 1) continue;
            const y = oy + dy * tt; if (y < BASE[b] || y > SOMMET[b]) continue;
            if (k >= NM && y < arcP(PV[EX[k]], ox + dx * tt, oz + dz * tt)) continue; // sous l'arc d'une arcade : on passe
            best = tt; quoi = 1; bi = b; de = 0; bk = -1; bnx = ez; bny = 0; bnz = -ex;
          } else if (b <= SOURCE.arbre) {
            const tt = capsule(k, ox, oy, oz, dx, dy, dz, best); if (tt < 0) continue;
            const j = EX[k]; best = tt; quoi = CNY > 0.5 ? 2 : 1; bi = -1; de = ODE[j]; bk = OK[j]; bnx = CNX; bny = CNY; bnz = CNZ;
          }
        }
        if (dy !== 0) for (let u = cR0[c]; u < cR0[c + 1]; u++) { // les toits
          const k = cR[u]; if (RK[k] !== 0 || VU_R[k] === t) continue; VU_R[k] = t;
          const tt = (SOMMET[k] - oy) / dy; if (tt < 0 || tt >= best) continue;
          const x = ox + dx * tt, z = oz + dz * tt, o = 4 * k;
          if (x < RB[o] || x > RB[o + 2] || z < RB[o + 1] || z > RB[o + 3] || !dansPoly(RF[k], x, z)) continue;
          best = tt; quoi = 2; bi = k; de = 0; bk = -1; bnx = 0; bny = dy < 0 ? 1 : -1; bnz = 0;
        }
      }
      for (let p = 0; p < NP; p++) { // les voûtes : un rayon qui sort de sous l'arc dans l'emprise d'un bâtiment traversé touche la voûte
        const P = PV[p], bx = P.box, fx = ox + dx * best, fz = oz + dz * best;
        if ((ox < fx ? ox : fx) > bx[2] || (ox > fx ? ox : fx) < bx[0] || (oz < fz ? oz : fz) > bx[3] || (oz > fz ? oz : fz) < bx[1]) continue;
        const rx = ox - P.ax, rz = oz - P.az, t0 = rx * P.ux + rz * P.uz, dt = dx * P.ux + dz * P.uz, e0 = rz * P.ux - rx * P.uz, dl = dz * P.ux - dx * P.uz;
        let a = 0, b = best; // le morceau du rayon dans le couloir (Liang-Barsky en t et en écart)
        if (dt > 1e-12 || dt < -1e-12) { let ta = -t0 / dt, tb = (P.lg - t0) / dt; if (ta > tb) { const s = ta; ta = tb; tb = s; } if (ta > a) a = ta; if (tb < b) b = tb; } else if (t0 < 0 || t0 > P.lg) continue;
        if (dl > 1e-12 || dl < -1e-12) { let ta = (-P.hw - e0) / dl, tb = (P.hw - e0) / dl; if (ta > tb) { const s = ta; ta = tb; tb = s; } if (ta > a) a = ta; if (tb < b) b = tb; } else if (e0 < -P.hw || e0 > P.hw) continue;
        if (!(a < b)) continue;
        // hauteur au-dessus de la naissance f(τ) = f0 + f1·τ, écart g(τ) = e0 + dl·τ : sous l'arc tant que f ≤ 0 ou f² + g² ≤ hw²
        const f0 = oy - P.ya - P.k * t0 - (P.h - P.hw), f1 = dy - P.k * dt, Aq = f1 * f1 + dl * dl, Bq = f0 * f1 + e0 * dl, Cq = f0 * f0 + e0 * e0 - P.hw * P.hw;
        if (Aq < 1e-18) continue;
        const D = Bq * Bq - Aq * Cq; if (D <= 0) continue;
        const tq = (-Bq + Math.sqrt(D)) / Aq, fq = f0 + f1 * tq; // la sortie du cercle de l'arc
        if (!(tq > a && tq < b) || fq <= 0) continue;
        const x = ox + dx * tq, z = oz + dz * tq; let ib = -1;
        for (let m = 0; m < P.b.length; m++) { const i = P.b[m], aa = batiments[i].aabb; if (x >= aa[0] && x <= aa[2] && z >= aa[1] && z <= aa[3] && dansPoly(BF[i], x, z)) { ib = i; break; } }
        if (ib < 0) continue; // hors de l'emprise (le couloir déborde des façades) : à l'air libre
        const g = e0 + dl * tq;
        best = tq; quoi = 1; bi = ib; de = 1; bk = p; bnx = g * P.uz / P.hw; bny = -fq / P.hw; bnz = -g * P.ux / P.hw;
      }
      const ts = solEn(ox, oy, oz, dx, dy, dz, tEnt, Math.min(best, tSort));
      if (ts >= 0 && ts <= best) {
        best = ts; quoi = 3; bi = -1; de = 5; bk = -1; const g = pente(ox + dx * ts, oz + dz * ts); bnx = -g[0]; bny = 1; bnz = -g[1];
      }
      if (!quoi) return false;
      const nl = Math.sqrt(bnx * bnx + bny * bny + bnz * bnz) || 1; bnx /= nl; bny /= nl; bnz /= nl;
      if (quoi === 1 && de === 0 && bnx * dx + bnz * dz > 0) { bnx = -bnx; bnz = -bnz; } // la face vue par le tireur
      H.t = best; H.x = ox + dx * best; H.y = oy + dy * best; H.z = oz + dz * best; H.nx = bnx; H.ny = bny; H.nz = bnz; H.i = bi;
      H.quoi = quoi === 1 ? 'mur' : quoi === 2 ? 'toit' : 'sol'; H.de = DE[de]; H.k = bk;
      return true;
    }
    function rayon(ox, oy, oz, dx, dy, dz, max) {
      if (!(fini(ox) && fini(oy) && fini(oz) && fini(dx) && fini(dy) && fini(dz))) return null;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz); if (l < 1e-12) return null;
      if (Math.abs(l - 1) > 1e-9) { dx /= l; dy /= l; dz /= l; }
      max = fini(max) && max > 0 ? +max : L * 2;
      if (!lancer(ox, oy, oz, dx, dy, dz, max)) return null;
      return { t: H.t, x: H.x, y: H.y, z: H.z, nx: H.nx, ny: H.ny, nz: H.nz, quoi: H.quoi, i: H.i, de: H.de, k: H.k };
    }
    function vue(ax, ay, az, bx, by, bz) {
      if (!(fini(ax) && fini(ay) && fini(az) && fini(bx) && fini(by) && fini(bz))) return false;
      const dx = bx - ax, dy = by - ay, dz = bz - az, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l < 0.05) return true;
      return !lancer(ax, ay, az, dx / l, dy / l, dz / l, l - 0.02);
    }

    // ─── libre : un point au hasard à au moins 1 m de tout mur (dans le cercle donné, sinon la limite, sinon tout le carré) ───
    const rndDefaut = REGLES && REGLES.mulberry32 ? REGLES.mulberry32(0x504f4e43) : (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    function libre(rnd, centre, rayonZone) {
      if (typeof rnd !== 'function') rnd = rndDefaut;
      let cx = 0, cz = 0, R = 0, carre = true;
      const lim = monde.limite;
      if (centre && fini(+centre[0]) && fini(+centre[1])) { cx = +centre[0]; cz = +centre[1]; R = fini(+rayonZone) && rayonZone > 0 ? +rayonZone : 30; carre = false; }
      else if (limiteOk(lim)) { cx = +lim.centre[0]; cz = +lim.centre[1]; R = +lim.rayon; carre = false; }
      const acc = typeof monde.accessible === 'function' ? monde.accessible : null;
      for (let k = 0; k < 600; k++) {
        let x, z;
        if (carre) { x = X0 + 2 + (L - 4) * rnd(); z = X0 + 2 + (L - 4) * rnd(); }
        else { const a = rnd() * Math.PI * 2, d = R * Math.sqrt(rnd()); x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d; }
        if (bloque(x, z, 1)) continue;
        if (acc && k < 450 && !acc(x, z)) continue; // de préférence là où l'on peut aller (si une navigation est branchée)
        return [x, z];
      }
      for (let d = 0; d <= Math.max(R, L / 2); d += 0.5) for (let a = 0; a < 16; a++) { // en dernier recours, en spirale depuis le centre
        const x = cx + Math.cos(a * Math.PI / 8) * d, z = cz + Math.sin(a * Math.PI / 8) * d;
        if (!bloque(x, z, 0.5)) return [x, z];
      }
      return [cx, cz];
    }
    const secours = () => limiteOk(monde.limite) ? libre(rndDefaut) : libre(rndDefaut, [0, 0], L / 2); // une position perdue (NaN) revient sur un point libre

    const monde = {
      L, limite: null, batiments, interdits, couloirs, passages, bancs, tabliers,
      hauteur, relief, chaussee, bloque, deplacer, rayon, vue, libre,
      passe, dedans, pente, sousVoute, arche,
      accessible: null, // une fonction (x, z) → bool qu'y branche PNAV.creer : la composante principale de la navigation
      stats: { aretes: NM, aretesTirs: NA - NM, cellules: G * G, cote: CS, regions: regions.length, ponts: couloirs.length, passages: NP, troncs: compte.troncs, feuillages: compte.feuillages, murs: compte.murs, murets: compte.murets, mobilier: compte.mobilier, bancs: compte.bancs },
      // les arêtes au sol (E : ax, az, bx, bz ; EW : demi-épaisseur ; ES : source), pour la navigation et les tests
      _interne: { E: E.subarray(0, 4 * NM), EW: EW.subarray(0, NM), ES: ES.subarray(0, NM), cA0, cA, G, CS, MARGE, regions, X0, PV },
    };
    return monde;
  }

  return { creer, CELLULE, MARGE, SUR_TABLIER, CHAUSSEE, SOURCE, MARCHE, MOBILIER, VOUTE, rTronc, hTronc, rFeuillage, nettoyer, dansPoly };
});
