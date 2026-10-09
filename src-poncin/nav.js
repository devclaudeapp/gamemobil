/* OPÉRATION PONCIN — la navigation des bots. Une grille (pas de 1,5 m par défaut) des cases où tient un cercle de rayon « marge »
   (monde.bloque), puis, pour chaque requête : A* à 8 voisins sans couper les coins, accéléré par JPS (Jump Point Search : on ne pose
   dans le tas que les cases où le chemin peut tourner ; les sauts droits lisent des rangées de bits), en tableaux typés avec un tas
   binaire, rien de réalloué d'une requête à l'autre ; enfin lissage glouton par lignes de vue (monde.passe : la capsule du bot ne touche
   aucun mur). L'heuristique est la plus forte de l'octile et d'ALT (repères + inégalité triangulaire : |d(R, t) − d(R, n)| ≤ d(n, t)) :
   huit repères au bout de la zone dont on connaît la distance à chaque case (Dijkstra à seaux) ; la recherche « voit » ainsi la rivière
   et file vers le pont au lieu d'inonder la rive. Les cases sont groupées en composantes connexes : on ne cherche jamais vers une poche
   fermée (cour intérieure), et monde.libre préfère la composante principale (monde.accessible, branché ici).
   La grille couvre le carré de monde.limite (l'arène) s'il y en a une, sinon toute la carte ; la limite est relue à chaque requête :
   la grille suit quand elle change, et se reconstruit plus grande si la nouvelle sort de la zone couverte.
   Module pur (aucun DOM, aucun THREE). Voir src-poncin/ARCHITECTURE.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./monde.js'));
  else root.PNAV = factory(root.PMONDE);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RAC2 = Math.SQRT2;
  const POIDS = 1.1;            // heuristique un peu gonflée : bien moins de cases ouvertes, tracé au plus 10 % plus long avant lissage
  const INF16 = 65535;          // distance inconnue (case hors de la composante d'un repère)
  const ACTIFS = 4;             // par requête, on ne lit que les 4 repères qui bornent le mieux le trajet
  const RAYON_DEPART = 30;      // un départ hors de la grille libre se raccroche à la case libre la plus proche, à 30 m au plus
  const RAYON_ARRIVEE = 20;     // une arrivée injoignable se rabat sur la case joignable la plus proche, à 20 m au plus
  const BORD_ZONE = 3;          // la grille d'une limite déborde de 3 m autour d'elle
  const fini = (v) => typeof v === 'number' && v - v === 0;
  const limiteOk = (l) => !!(l && l.centre && fini(+l.centre[0]) && fini(+l.centre[1]) && fini(+l.rayon) && l.rayon > 0);
  const d2PtSeg = (px, pz, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez; let t = l2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return (px - ax - t * ex) ** 2 + (pz - az - t * ez) ** 2; };
  const orient = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  function croise(ax, az, bx, bz, cx, cz, dx, dz) { const d1 = orient(cx, cz, dx, dz, ax, az), d2 = orient(cx, cz, dx, dz, bx, bz), d3 = orient(ax, az, bx, bz, cx, cz), d4 = orient(ax, az, bx, bz, dx, dz); return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)); }

  function creer(monde, opts) {
    opts = opts || {};
    const pas = Math.min(5, Math.max(0.5, fini(+opts.pas) && opts.pas > 0 ? +opts.pas : 1.5)), marge = fini(+opts.marge) && opts.marge >= 0 ? +opts.marge : 0.45;
    const K = Math.max(0, Math.min(16, fini(+opts.reperes) ? opts.reperes | 0 : 8)); // le nombre de repères ALT (0 : octile seule)
    const jpsOui = opts.methode !== 'astar';                                            // 'astar' : A* case par case (référence des tests)
    const RL = fini(+opts.serre) && opts.serre >= 0 ? +opts.serre : Math.max(0, marge - 0.1), RL2 = RL * RL; // l'écart minimal d'un lien aux murs
    const rLisse = Math.max(0.05, marge - 0.05); // le lissage tolère 5 cm de moins que la grille (toujours plus que le rayon d'un joueur)
    const cle = [pas, marge, K, jpsOui, RL].join('/');
    if (monde._navs && monde._navs[cle]) { monde.accessible = monde._navs[cle].accessible; return monde._navs[cle]; } // déjà construite pour ce monde
    const L = monde.L, XM = -L / 2;

    // ─── l'état de la grille (reconstruit par construire) ───
    let X0 = XM, Z0 = XM, W = 3, N = 9, NW = 1, zone = null;
    let FIXE, LIB, COMP, GC, HN, PAR, ETAT, POS, TAS, TF, CH, EVD, EVG, EVB, EVH, DR, VOIS, COIN_A, COIN_B, REPERES = [];
    let msGrille = 0, msReperes = 0, serres = 0, libres = 0, constructions = 0;
    let gen = 0, nt = 0, ouvertes = 0, tailles = [0], PRINC = 0, REP = -1, lOk = null, lx = 0, lz = 0, lr = 0, CIBLE = -1, CI = -1, CJ = -1, NA = 0;
    const COUT = [1, 1, 1, 1, RAC2, RAC2, RAC2, RAC2], AK = new Int32Array(ACTIFS), AV = new Int32Array(ACTIFS), BORNE = new Float64Array(Math.max(1, K));
    const SEAUX = new Int32Array(16), DIRS = new Int32Array(16);
    const cx = (c) => X0 + (c % W + 0.5) * pas, cz = (c) => Z0 + ((c / W | 0) + 0.5) * pas;
    const caseDe = (x, z) => { const i = Math.floor((x - X0) / pas), j = Math.floor((z - Z0) / pas); return i < 0 || j < 0 || i >= W || j >= W ? -1 : j * W + i; };
    const nouvelleGen = () => { if (++gen > 2e9) { ETAT.fill(0); gen = 1; } return 2 * gen; }; // état 2·gen = ouvert, 2·gen + 1 = fermé

    // la zone à couvrir : le carré de la limite (plus BORD_ZONE), sinon toute la carte ; calée sur le réseau des cases de la carte entière,
    // avec un anneau de cases bloquées tout autour (aucun test de bornes dans les boucles)
    function zoneVoulue() {
      const l = monde.limite; let a = XM, b = XM, a1 = XM + L, b1 = XM + L;
      if (limiteOk(l)) { const m = +l.rayon + BORD_ZONE; a = Math.max(a, l.centre[0] - m); b = Math.max(b, l.centre[1] - m); a1 = Math.min(a1, +l.centre[0] + m); b1 = Math.min(b1, +l.centre[1] + m); }
      if (!(a1 > a) || !(b1 > b)) { a = XM; b = XM; a1 = XM + L; b1 = XM + L; } // limite hors de la carte : toute la carte
      const i0 = Math.floor((a - XM) / pas) - 1, j0 = Math.floor((b - XM) / pas) - 1;
      const w = Math.max(3, Math.max(Math.ceil((a1 - XM) / pas) - i0, Math.ceil((b1 - XM) / pas) - j0) + 1);
      return { x0: XM + i0 * pas, z0: XM + j0 * pas, W: w };
    }
    const couvre = (zv) => !!zone && zv.x0 >= zone.x0 - 1e-9 && zv.z0 >= zone.z0 - 1e-9 && zv.x0 + zv.W * pas <= zone.x0 + zone.W * pas + 1e-9 && zv.z0 + zv.W * pas <= zone.z0 + zone.W * pas + 1e-9;

    function construire(zv) {
      const t0 = Date.now(); constructions++;
      zone = zv; X0 = zv.x0; Z0 = zv.z0; W = zv.W; N = W * W; NW = (W + 31) >> 5;
      FIXE = new Uint8Array(N); LIB = new Uint8Array(N); COMP = new Int32Array(N);
      GC = new Float32Array(N); HN = new Float32Array(N); PAR = new Int32Array(N); ETAT = new Uint32Array(N); POS = new Int32Array(N); TAS = new Int32Array(N); TF = new Float32Array(N); CH = new Int32Array(N);
      EVD = new Int32Array(W * NW); EVG = new Int32Array(W * NW); EVB = new Int32Array(W * NW); EVH = new Int32Array(W * NW);
      DR = new Uint16Array(N * Math.max(1, K)).fill(INF16); REPERES = []; gen = 0;
      VOIS = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1]; COIN_A = [0, 0, 0, 0, 1, -1, 1, -1]; COIN_B = [0, 0, 0, 0, W, W, -W, -W]; // les deux cases qu'une diagonale longe
      // les cases libres (sans la limite)
      const lim0 = monde.limite; monde.limite = null;
      try { for (let j = 1; j < W - 1; j++) { const z = Z0 + (j + 0.5) * pas; for (let i = 1; i < W - 1; i++) FIXE[j * W + i] = monde.bloque(X0 + (i + 0.5) * pas, z, marge) ? 0 : 1; } }
      finally { monde.limite = lim0; }
      // les liens serrés : une arête à moins de RL du segment qui joint les centres de deux cases libres voisines (un coin qui dépasse entre
      // deux centres, un mur plus fin que la grille) bloque la case la plus proche de l'arête. Ensuite, tout trajet de centre en centre de
      // cases libres (droit, ou en diagonale entre quatre cases libres) laisse au moins RL aux murs.
      const E = monde._interne && monde._interne.E, aBloquer = []; serres = 0;
      if (E) for (let k = 0; k + 3 < E.length; k += 4) {
        const ax = E[k], az = E[k + 1], bx = E[k + 2], bz = E[k + 3], m = RL + pas;
        const i0 = Math.max(1, Math.ceil((Math.min(ax, bx) - m - X0) / pas - 0.5)), i1 = Math.min(W - 2, Math.floor((Math.max(ax, bx) + m - X0) / pas - 0.5));
        const j0 = Math.max(1, Math.ceil((Math.min(az, bz) - m - Z0) / pas - 0.5)), j1 = Math.min(W - 2, Math.floor((Math.max(az, bz) + m - Z0) / pas - 0.5));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const c = j * W + i; if (!FIXE[c]) continue;
          const x = X0 + (i + 0.5) * pas, z = Z0 + (j + 0.5) * pas, dc = d2PtSeg(x, z, ax, az, bx, bz); if (dc > m * m) continue;
          for (let q = 0; q < 2; q++) { // le lien vers +x, puis vers +z
            const v = q ? c + W : c + 1; if (!FIXE[v]) continue;
            const x2 = q ? x : x + pas, z2 = q ? z + pas : z, dv = d2PtSeg(x2, z2, ax, az, bx, bz);
            if (croise(x, z, x2, z2, ax, az, bx, bz) || Math.min(d2PtSeg(ax, az, x, z, x2, z2), d2PtSeg(bx, bz, x, z, x2, z2), dc, dv) < RL2) aBloquer.push(dc <= dv ? c : v);
          }
        }
      }
      for (const c of aBloquer) if (FIXE[c]) { FIXE[c] = 0; serres++; }
      libres = 0; for (let c = 0; c < N; c++) libres += FIXE[c];
      msGrille = Date.now() - t0;
      // les repères : le premier est la case la plus éloignée du centre de la zone, chaque suivant la plus éloignée (en chemin) de tous les autres
      const t1 = Date.now();
      lOk = false; LIB.set(FIXE); composantes();
      if (K > 0 && PRINC) {
        const MIN = new Uint16Array(N).fill(INF16), ox = X0 + W * pas / 2, oz = Z0 + W * pas / 2; let r0 = -1, bd = -1;
        for (let c = 0; c < N; c++) if (COMP[c] === PRINC) { const d = (cx(c) - ox) ** 2 + (cz(c) - oz) ** 2; if (d > bd) { bd = d; r0 = c; } }
        for (let k = 0; k < K && r0 >= 0; k++) {
          REPERES.push(r0); dijkstra(r0, k);
          r0 = -1; bd = 0;
          for (let c = 0; c < N; c++) { const v = DR[c * K + k]; if (v < MIN[c]) MIN[c] = v; if (COMP[c] === PRINC && MIN[c] !== INF16 && MIN[c] > bd) { bd = MIN[c]; r0 = c; } }
        }
      }
      msReperes = Date.now() - t1;
      lOk = null; // la grille courante (limite comprise) est à refaire
    }

    // ─── composantes connexes (4-voisins : sans couper les coins, les diagonales ne relient rien de plus) ───
    function composantes() {
      const FILE = PAR; COMP.fill(0); tailles = [0]; let id = 0;
      for (let c0 = 0; c0 < N; c0++) {
        if (!LIB[c0] || COMP[c0]) continue;
        id++; let a = 0, b = 0; FILE[b++] = c0; COMP[c0] = id;
        while (a < b) {
          const c = FILE[a++];
          if (LIB[c + 1] && !COMP[c + 1]) { COMP[c + 1] = id; FILE[b++] = c + 1; }
          if (LIB[c - 1] && !COMP[c - 1]) { COMP[c - 1] = id; FILE[b++] = c - 1; }
          if (LIB[c + W] && !COMP[c + W]) { COMP[c + W] = id; FILE[b++] = c + W; }
          if (LIB[c - W] && !COMP[c - W]) { COMP[c - W] = id; FILE[b++] = c - W; }
        }
        tailles.push(b);
      }
      PRINC = 0; for (let k = 1; k < tailles.length; k++) if (tailles[k] > tailles[PRINC]) PRINC = k;
      REP = -1; let best = Infinity; // la case de la composante principale la plus proche du centre de la limite (ou de la zone) : le refuge de proche()
      const ox = lOk ? lx : X0 + W * pas / 2, oz = lOk ? lz : Z0 + W * pas / 2;
      for (let c = 0; c < N && PRINC; c++) if (COMP[c] === PRINC) { const d = (cx(c) - ox) ** 2 + (cz(c) - oz) ** 2; if (d < best) { best = d; REP = c; } }
    }
    // Les « événements » de JPS : un saut droit s'arrête sur un mur, ou sur une case dont un voisin de côté s'ouvre (libre alors que la case
    // d'avant, de ce côté, est bloquée : voisin forcé). Rangés en bits par ligne (vers +x : EVD, vers −x : EVG) et par colonne (vers +z : EVB,
    // vers −z : EVH), un saut lit quelques mots de 32 bits au lieu de parcourir les cases une à une.
    function evenements() {
      EVD.fill(0); EVG.fill(0); EVB.fill(0); EVH.fill(0);
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
        const c = j * W + i, mur = i === 0 || j === 0 || i === W - 1 || j === W - 1 || !LIB[c];
        const ol = (i >> 5) + j * NW, bl = 1 << (i & 31), oc = (j >> 5) + i * NW, bc = 1 << (j & 31);
        if (mur || (LIB[c + W] && !LIB[c - 1 + W]) || (LIB[c - W] && !LIB[c - 1 - W])) EVD[ol] |= bl;
        if (mur || (LIB[c + W] && !LIB[c + 1 + W]) || (LIB[c - W] && !LIB[c + 1 - W])) EVG[ol] |= bl;
        if (mur || (LIB[c + 1] && !LIB[c - W + 1]) || (LIB[c - 1] && !LIB[c - W - 1])) EVB[oc] |= bc;
        if (mur || (LIB[c + 1] && !LIB[c + W + 1]) || (LIB[c - 1] && !LIB[c + W - 1])) EVH[oc] |= bc;
      }
    }
    let msLimite = 0;
    function synchro() { // la grille courante suit monde.limite
      const l = monde.limite, ok = limiteOk(l);
      if (ok === lOk && (!ok || (+l.centre[0] === lx && +l.centre[1] === lz && +l.rayon === lr))) return;
      const t0 = Date.now(), zv = zoneVoulue();
      if (!couvre(zv)) construire(zv);
      lOk = ok;
      if (ok) {
        lx = +l.centre[0]; lz = +l.centre[1]; lr = +l.rayon; const m = Math.max(0, lr - marge), m2 = m * m;
        for (let c = 0; c < N; c++) LIB[c] = FIXE[c] && (cx(c) - lx) ** 2 + (cz(c) - lz) ** 2 <= m2 ? 1 : 0;
      } else LIB.set(FIXE);
      composantes(); evenements(); msLimite = Date.now() - t0;
    }

    // la case libre la plus proche de (x, z) (dans la composante comp si comp > 0), à rayonMax mètres au plus ; −1 sinon
    function procheCase(x, z, comp, rayonMax) {
      const c0 = caseDe(x, z);
      if (c0 >= 0 && LIB[c0] && (!comp || COMP[c0] === comp)) return c0;
      const i0 = Math.max(0, Math.min(W - 1, Math.floor((x - X0) / pas))), j0 = Math.max(0, Math.min(W - 1, Math.floor((z - Z0) / pas)));
      const kMax = Math.ceil(rayonMax / pas) + 1; let best = -1, bd = Infinity, fin = kMax;
      for (let k = 1; k <= fin; k++) {
        for (let dj = -k; dj <= k; dj++) {
          const j = j0 + dj; if (j < 0 || j >= W) continue;
          const sautI = dj === -k || dj === k ? 1 : 2 * k;
          for (let di = -k; di <= k; di += sautI) {
            const i = i0 + di; if (i < 0 || i >= W) continue;
            const c = j * W + i; if (!LIB[c] || (comp && COMP[c] !== comp)) continue;
            const d = (cx(c) - x) ** 2 + (cz(c) - z) ** 2; if (d < bd) { bd = d; best = c; }
          }
        }
        if (best >= 0 && fin === kMax) fin = Math.min(kMax, Math.ceil(k * RAC2) + 1); // un anneau carré n'est pas un cercle : un peu plus loin
      }
      return best >= 0 && bd <= (rayonMax + pas) * (rayonMax + pas) ? best : -1;
    }

    // ─── le tas binaire (clé f), avec diminution de clé ───
    function monter(p) { const c = TAS[p], f = TF[p]; while (p > 0) { const q = (p - 1) >> 1; if (TF[q] <= f) break; TAS[p] = TAS[q]; TF[p] = TF[q]; POS[TAS[p]] = p; p = q; } TAS[p] = c; TF[p] = f; POS[c] = p; }
    function descendre(p) {
      const c = TAS[p], f = TF[p];
      for (;;) { let q = 2 * p + 1; if (q >= nt) break; if (q + 1 < nt && TF[q + 1] < TF[q]) q++; if (TF[q] >= f) break; TAS[p] = TAS[q]; TF[p] = TF[q]; POS[TAS[p]] = p; p = q; }
      TAS[p] = c; TF[p] = f; POS[c] = p;
    }
    const prendre = () => { const c = TAS[0]; nt--; if (nt > 0) { TAS[0] = TAS[nt]; TF[0] = TF[nt]; descendre(0); } return c; };
    function ouvrir(v, ng, c, OUV) { // v atteinte depuis c avec le coût ng
      if (ETAT[v] !== OUV) { ETAT[v] = OUV; GC[v] = ng; PAR[v] = c; const hv = h(v); HN[v] = hv; TAS[nt] = v; TF[nt] = ng + hv; nt++; monter(nt - 1); }
      else if (ng < GC[v]) { GC[v] = ng; PAR[v] = c; const p = POS[v]; TF[p] = ng + HN[v]; monter(p); }
    }

    // ─── l'heuristique : max(octile, ALT sur les repères actifs), en cases ───
    function preparer(s, t) {
      CIBLE = t; CI = t % W; CJ = t / W | 0; NA = 0;
      for (let k = 0; k < K; k++) { const a = DR[s * K + k], b = DR[t * K + k]; BORNE[k] = a === INF16 || b === INF16 ? -1 : Math.abs(a - b); }
      while (NA < ACTIFS) { let kb = -1; for (let k = 0; k < K; k++) if (BORNE[k] >= 0 && (kb < 0 || BORNE[k] > BORNE[kb])) kb = k; if (kb < 0) break; AK[NA] = kb; AV[NA] = DR[t * K + kb]; BORNE[kb] = -1; NA++; }
    }
    function h(c) {
      const di = Math.abs(c % W - CI), dj = Math.abs((c / W | 0) - CJ); let e = 10 * (di > dj ? di + (RAC2 - 1) * dj : dj + (RAC2 - 1) * di);
      for (let q = 0, o = c * K; q < NA; q++) { const v = DR[o + AK[q]]; if (v === INF16) continue; const a = v > AV[q] ? v - AV[q] : AV[q] - v; if (a > e) e = a; }
      return 0.1 * POIDS * e; // les distances des repères sont en dixièmes de case
    }

    // ─── A* case par case (référence) ───
    function astar(s, t) {
      const OUV = nouvelleGen(), FER = OUV + 1; preparer(s, t);
      ouvertes = 0; GC[s] = 0; PAR[s] = -1; ETAT[s] = OUV; TAS[0] = s; TF[0] = h(s); POS[s] = 0; nt = 1;
      while (nt > 0) {
        const c = prendre(); if (c === t) return true;
        ETAT[c] = FER; ouvertes++;
        const g = GC[c];
        for (let k = 0; k < 8; k++) {
          const v = c + VOIS[k];
          if (!LIB[v] || ETAT[v] === FER) continue;
          if (k >= 4 && (!LIB[c + COIN_A[k]] || !LIB[c + COIN_B[k]])) continue;
          ouvrir(v, g + COUT[k], c, OUV);
        }
      }
      return false;
    }

    // ─── JPS ───
    function apres(T, o, p) { let w = (p + 1) >> 5, x = T[o + w] & (-1 << ((p + 1) & 31)); while (x === 0) x = T[o + ++w]; return (w << 5) + 31 - Math.clz32(x & -x); } // 1er bit > p
    function avant(T, o, p) { const q = p - 1, b = q & 31; let w = q >> 5, x = T[o + w] & (b === 31 ? -1 : (1 << (b + 1)) - 1); while (x === 0) x = T[o + --w]; return (w << 5) + 31 - Math.clz32(x); } // dernier bit < p
    function sautX(c, sens) { // saut droit le long de x : le point de saut, la cible, ou −1 (un mur)
      const i = c % W, j = (c - i) / W, e = sens > 0 ? apres(EVD, j * NW, i) : avant(EVG, j * NW, i);
      if (CJ === j && (sens > 0 ? CI > i && CI <= e : CI < i && CI >= e)) return CIBLE;
      const ce = j * W + e; return LIB[ce] ? ce : -1;
    }
    function sautZ(c, sens) { // saut droit le long de z
      const i = c % W, j = (c - i) / W, e = sens > 0 ? apres(EVB, i * NW, j) : avant(EVH, i * NW, j);
      if (CI === i && (sens > 0 ? CJ > j && CJ <= e : CJ < j && CJ >= e)) return CIBLE;
      const ce = e * W + i; return LIB[ce] ? ce : -1;
    }
    function sautDiag(c, di, dj) { // saut en diagonale : on s'arrête là où un saut droit trouverait quelque chose
      const dw = dj * W;
      for (;;) {
        if (!LIB[c + di] || !LIB[c + dw]) return -1; // pas de coin coupé
        c += di + dw;
        if (!LIB[c]) return -1;
        if (c === CIBLE) return c;
        if (sautX(c, di) >= 0 || sautZ(c, dj) >= 0) return c;
      }
    }
    function jps(s, t) {
      const OUV = nouvelleGen(), FER = OUV + 1; preparer(s, t);
      ouvertes = 0; GC[s] = 0; PAR[s] = -1; ETAT[s] = OUV; TAS[0] = s; TF[0] = h(s); POS[s] = 0; nt = 1;
      while (nt > 0) {
        const c = prendre(); if (c === t) return true;
        ETAT[c] = FER; ouvertes++;
        const g = GC[c], p = PAR[c], ic = c % W, jc = (c - ic) / W; let nd = 0;
        if (p < 0) { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a || b) { DIRS[nd++] = a; DIRS[nd++] = b; } }
        else { // les directions utiles, d'après celle d'arrivée (les autres sont mieux servies depuis le parent)
          const di = Math.sign(ic - p % W), dj = Math.sign(jc - (p / W | 0));
          if (di && dj) { DIRS[0] = 0; DIRS[1] = dj; DIRS[2] = di; DIRS[3] = 0; DIRS[4] = di; DIRS[5] = dj; nd = 6; }
          else if (di) { DIRS[0] = di; DIRS[1] = 0; DIRS[2] = 0; DIRS[3] = 1; DIRS[4] = 0; DIRS[5] = -1; DIRS[6] = di; DIRS[7] = 1; DIRS[8] = di; DIRS[9] = -1; nd = 10; }
          else { DIRS[0] = 0; DIRS[1] = dj; DIRS[2] = 1; DIRS[3] = 0; DIRS[4] = -1; DIRS[5] = 0; DIRS[6] = 1; DIRS[7] = dj; DIRS[8] = -1; DIRS[9] = dj; nd = 10; }
        }
        for (let q = 0; q < nd; q += 2) {
          const a = DIRS[q], b = DIRS[q + 1];
          const v = a && b ? sautDiag(c, a, b) : a ? sautX(c, a) : sautZ(c, b);
          if (v < 0 || ETAT[v] === FER) continue;
          const n = Math.max(Math.abs(v % W - ic), Math.abs((v / W | 0) - jc));
          ouvrir(v, g + (a && b ? n * RAC2 : n), c, OUV);
        }
      }
      return false;
    }

    // ─── Dijkstra d'un repère, en coûts entiers 10 (droit) et 14 (diagonale, un peu moins que 10·√2 : la borne reste admissible) avec une
    // file à seaux circulaire (Dial) dont les seaux sont des listes doublement chaînées → distances en dixièmes de case, DR[c·K + k] ───
    function dijkstra(src, k) {
      const OUV = nouvelleGen(), FER = OUV + 1, SUIV = TAS, PREC = POS, D = PAR;
      const mettre = (v, d) => { const b = d & 15, t = SEAUX[b]; SUIV[v] = t; PREC[v] = -1; if (t >= 0) PREC[t] = v; SEAUX[b] = v; };
      const oter = (v, d) => { const p = PREC[v], n = SUIV[v]; if (p >= 0) SUIV[p] = n; else SEAUX[d & 15] = n; if (n >= 0) PREC[n] = p; };
      SEAUX.fill(-1); D[src] = 0; ETAT[src] = OUV; mettre(src, 0);
      let reste = 1;
      for (let cur = 0; reste > 0 && cur < INF16; cur++) {
        const b = cur & 15;
        while (SEAUX[b] >= 0) {
          const c = SEAUX[b]; oter(c, cur); reste--; ETAT[c] = FER; DR[c * K + k] = cur;
          for (let q = 0; q < 8; q++) {
            const v = c + VOIS[q];
            if (!FIXE[v] || ETAT[v] === FER) continue;
            if (q >= 4 && (!FIXE[c + COIN_A[q]] || !FIXE[c + COIN_B[q]])) continue;
            const nd = cur + (q < 4 ? 10 : 14);
            if (ETAT[v] !== OUV) { ETAT[v] = OUV; D[v] = nd; mettre(v, nd); reste++; }
            else if (nd < D[v]) { oter(v, D[v]); D[v] = nd; mettre(v, nd); }
          }
        }
      }
    }

    // ─── chemin : JPS, points du tracé, lissage glouton par lignes de vue ───
    function chemin(ax, az, bx, bz) {
      if (!fini(ax) || !fini(az) || !fini(bx) || !fini(bz)) return null;
      synchro();
      const s = procheCase(ax, az, 0, RAYON_DEPART); if (s < 0) return null;
      const t = procheCase(bx, bz, COMP[s], RAYON_ARRIVEE); if (t < 0) return null;
      const sx = caseDe(ax, az) === s ? ax : cx(s), sz = caseDe(ax, az) === s ? az : cz(s);
      const ex = caseDe(bx, bz) === t ? bx : cx(t), ez = caseDe(bx, bz) === t ? bz : cz(t);
      if (s === t) return sx === ex && sz === ez ? [[sx, sz]] : [[sx, sz], [ex, ez]];
      if (!(jpsOui ? jps(s, t) : astar(s, t))) return null;
      // les cases du tracé, de s à t (JPS : ses points de saut ; A* : les changements de direction)
      let n = 0; for (let c = t; c !== -1; c = PAR[c]) n++;
      let k = n; for (let c = t; c !== -1; c = PAR[c]) CH[--k] = c;
      let m = 1;
      for (let i = 1; i < n - 1; i++) if (jpsOui || CH[i] - CH[i - 1] !== CH[i + 1] - CH[i]) CH[m++] = CH[i];
      CH[m++] = CH[n - 1];
      // les points : départ, cases gardées, arrivée ; on saute tout point que la ligne de vue rend inutile
      const P = m + 2, px = (i) => i === 0 ? sx : i === P - 1 ? ex : cx(CH[i - 1]), pz = (i) => i === 0 ? sz : i === P - 1 ? ez : cz(CH[i - 1]);
      const out = [[sx, sz]]; let ancre = 0;
      for (let i = 1; i < P - 1; i++) if (!monde.passe(px(ancre), pz(ancre), px(i + 1), pz(i + 1), rLisse)) { out.push([px(i), pz(i)]); ancre = i; }
      out.push([ex, ez]);
      for (let i = out.length - 1; i > 0; i--) if (Math.abs(out[i][0] - out[i - 1][0]) < 1e-9 && Math.abs(out[i][1] - out[i - 1][1]) < 1e-9) out.splice(i, 1);
      return out;
    }
    function libre(x, z) { if (!fini(x) || !fini(z)) return false; synchro(); const c = caseDe(x, z); return c >= 0 && LIB[c] === 1; }
    function proche(x, z) {
      synchro();
      if (fini(x) && fini(z)) {
        const c0 = caseDe(x, z); if (c0 >= 0 && LIB[c0]) return [x, z];
        const c = procheCase(x, z, 0, 60); if (c >= 0) return [cx(c), cz(c)];
      }
      return REP >= 0 ? [cx(REP), cz(REP)] : [fini(x) ? x : 0, fini(z) ? z : 0];
    }
    function accessible(x, z) { if (!fini(x) || !fini(z)) return false; synchro(); const c = caseDe(x, z); return c >= 0 && LIB[c] === 1 && COMP[c] === PRINC; }

    synchro(); // la première grille : celle de la limite en cours, ou toute la carte
    const nav = {
      chemin, libre, proche, accessible, pas, marge,
      stats: {
        get cote() { return W; }, get cases() { return N; }, get libres() { return libres; }, get serres() { return serres; }, get reperes() { return REPERES.length; },
        get msGrille() { return msGrille; }, get msReperes() { return msReperes; }, get msLimite() { return msLimite; }, get constructions() { return constructions; },
        get zone() { return { x0: X0, z0: Z0, cote: W * pas }; }, get octets() { return N * (38 + 2 * Math.max(1, K)) + 16 * W * NW; },
        get composantes() { synchro(); return tailles.length - 1; }, get principale() { synchro(); return tailles[PRINC] || 0; }, get ouvertes() { return ouvertes; },
      },
    };
    monde.accessible = accessible;
    (monde._navs = monde._navs || {})[cle] = nav;
    return nav;
  }
  return { creer };
});
