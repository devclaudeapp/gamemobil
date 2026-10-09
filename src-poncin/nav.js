/* OPÉRATION PONCIN — la navigation des bots : une grille (pas de 1,5 m par défaut) des cases où tient un cercle de rayon « marge »,
   A* à 8 voisins (heuristique octile, sans couper les coins) en tableaux typés avec un tas binaire, rien de réalloué d'une requête à l'autre,
   puis lissage par lignes de vue (monde.passe : la capsule du bot ne touche aucun mur). L'heuristique est la plus forte de l'octile et de
   « ALT » (repères + inégalité triangulaire : |d(R, t) − d(R, n)| ≤ d(n, t)) : quelques repères au bord de la carte dont on connaît la
   distance à chaque case (Dijkstra au chargement) ; A* « voit » ainsi la rivière et file droit vers le pont au lieu d'inonder la rive.
   Les cases sont regroupées en composantes connexes :
   un chemin ne cherche jamais vers une poche fermée (cour intérieure), et monde.libre préfère la composante principale.
   La zone limite (monde.limite, fixée par le mode) est relue à chaque requête : la grille se recalcule seule quand elle change.
   Module pur (aucun DOM, aucun THREE). Voir src-poncin/ARCHITECTURE.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./monde.js'));
  else root.PNAV = factory(root.PMONDE);
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RAC2 = Math.SQRT2;
  const POIDS = 1.1;            // heuristique légèrement gonflée : bien moins de cases ouvertes, chemin au plus 10 % plus long avant lissage
  const INF16 = 65535;          // distance inconnue (case hors de la composante d'un repère)
  const RAYON_DEPART = 30;      // un départ hors de la grille libre se raccroche à la case libre la plus proche, à 30 m au plus
  const RAYON_ARRIVEE = 20;     // une arrivée injoignable se rabat sur la case joignable la plus proche, à 20 m au plus
  const fini = (v) => typeof v === 'number' && v - v === 0;

  function creer(monde, opts) {
    opts = opts || {};
    const pas = Math.min(5, Math.max(0.5, fini(+opts.pas) && opts.pas > 0 ? +opts.pas : 1.5)), marge = fini(+opts.marge) && opts.marge >= 0 ? +opts.marge : 0.45;
    const K = Math.max(0, Math.min(16, fini(+opts.reperes) ? opts.reperes | 0 : 8)); // le nombre de repères de l'heuristique ALT (0 : octile seule)
    const rLisse = Math.max(0.05, marge - 0.05); // le lissage tolère 5 cm de moins que la grille (toujours plus que le rayon d'un joueur)
    const L = monde.L, X0 = -L / 2, W = Math.max(3, Math.ceil(L / pas)), N = W * W;
    const cx = (c) => X0 + (c % W + 0.5) * pas, cz = (c) => X0 + ((c / W | 0) + 0.5) * pas;
    const t0 = Date.now();

    // ─── la grille fixe (sans la limite), le bord de la grille toujours bloqué : pas de test de bornes dans A* ───
    const FIXE = new Uint8Array(N), LIB = new Uint8Array(N), COMP = new Int32Array(N);
    const lim0 = monde.limite; monde.limite = null;
    try {
      for (let j = 1; j < W - 1; j++) { const z = X0 + (j + 0.5) * pas; for (let i = 1; i < W - 1; i++) FIXE[j * W + i] = monde.bloque(X0 + (i + 0.5) * pas, z, marge) ? 0 : 1; }
    } finally { monde.limite = lim0; }
    const msGrille = Date.now() - t0;

    // ─── la limite et les composantes connexes (4-voisins : sans couper les coins, les 8-voisins ne relient rien de plus) ───
    const FILE = new Int32Array(N); let tailles = [0], PRINC = 0, REP = -1;
    let lOk = null, lx = 0, lz = 0, lr = 0;
    function composantes() {
      COMP.fill(0); tailles = [0]; let id = 0;
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
      REP = -1; let best = Infinity; // la case de la composante principale la plus proche du centre de la zone : le refuge de proche()
      const ox = lOk ? lx : 0, oz = lOk ? lz : 0;
      for (let c = 0; c < N && PRINC; c++) if (COMP[c] === PRINC) { const d = (cx(c) - ox) ** 2 + (cz(c) - oz) ** 2; if (d < best) { best = d; REP = c; } }
    }
    function synchro() {
      const l = monde.limite, ok = !!(l && l.centre && fini(+l.centre[0]) && fini(+l.centre[1]) && fini(+l.rayon) && l.rayon > 0);
      if (ok === lOk && (!ok || (+l.centre[0] === lx && +l.centre[1] === lz && +l.rayon === lr))) return;
      lOk = ok;
      if (ok) {
        lx = +l.centre[0]; lz = +l.centre[1]; lr = +l.rayon; const m = Math.max(0, lr - marge), m2 = m * m;
        for (let c = 0; c < N; c++) LIB[c] = FIXE[c] && (cx(c) - lx) ** 2 + (cz(c) - lz) ** 2 <= m2 ? 1 : 0;
      } else LIB.set(FIXE);
      composantes();
    }
    synchro();

    const caseDe = (x, z) => { const i = Math.floor((x - X0) / pas), j = Math.floor((z - X0) / pas); return i < 0 || j < 0 || i >= W || j >= W ? -1 : j * W + i; };
    // la case libre la plus proche de (x, z) (dans la composante comp si comp > 0), à rayonMax mètres au plus ; −1 sinon
    function procheCase(x, z, comp, rayonMax) {
      const c0 = caseDe(x, z);
      if (c0 >= 0 && LIB[c0] && (!comp || COMP[c0] === comp)) return c0;
      let i0 = Math.floor((x - X0) / pas), j0 = Math.floor((z - X0) / pas);
      i0 = Math.max(0, Math.min(W - 1, i0)); j0 = Math.max(0, Math.min(W - 1, j0));
      const K = Math.ceil(rayonMax / pas) + 1; let best = -1, bd = Infinity, fin = K;
      for (let k = 1; k <= fin; k++) {
        for (let dj = -k; dj <= k; dj++) {
          const j = j0 + dj; if (j < 0 || j >= W) continue;
          const pasI = dj === -k || dj === k ? 1 : 2 * k;
          for (let di = -k; di <= k; di += pasI) {
            const i = i0 + di; if (i < 0 || i >= W) continue;
            const c = j * W + i; if (!LIB[c] || (comp && COMP[c] !== comp)) continue;
            const d = (cx(c) - x) ** 2 + (cz(c) - z) ** 2; if (d < bd) { bd = d; best = c; }
          }
        }
        if (best >= 0 && fin === K) fin = Math.min(K, Math.ceil(k * RAC2) + 1); // un anneau carré n'est pas un cercle : on regarde un peu plus loin
      }
      return best >= 0 && bd <= (rayonMax + pas) * (rayonMax + pas) ? best : -1;
    }

    // ─── A* : tas binaire (clé f) avec diminution de clé ; état 2·gen = ouvert, 2·gen + 1 = fermé ───
    const GC = new Float32Array(N), PAR = new Int32Array(N), ETAT = new Uint32Array(N), POS = new Int32Array(N), TAS = new Int32Array(N), TF = new Float32Array(N), CH = new Int32Array(N);
    let gen = 0, nt = 0, ouvertes = 0;
    function monter(p) { const c = TAS[p], f = TF[p]; while (p > 0) { const q = (p - 1) >> 1; if (TF[q] <= f) break; TAS[p] = TAS[q]; TF[p] = TF[q]; POS[TAS[p]] = p; p = q; } TAS[p] = c; TF[p] = f; POS[c] = p; }
    function descendre(p) {
      const c = TAS[p], f = TF[p];
      for (;;) { let q = 2 * p + 1; if (q >= nt) break; if (q + 1 < nt && TF[q + 1] < TF[q]) q++; if (TF[q] >= f) break; TAS[p] = TAS[q]; TF[p] = TF[q]; POS[TAS[p]] = p; p = q; }
      TAS[p] = c; TF[p] = f; POS[c] = p;
    }
    const VOIS = [1, -1, W, -W, W + 1, W - 1, -W + 1, -W - 1], COUT = [1, 1, 1, 1, RAC2, RAC2, RAC2, RAC2];
    const COIN_A = [0, 0, 0, 0, 1, -1, 1, -1], COIN_B = [0, 0, 0, 0, W, W, -W, -W]; // les deux cases orthogonales qu'une diagonale longe
    function nouvelleGen() { if (++gen > 2e9) { ETAT.fill(0); gen = 1; } return 2 * gen; }
    // Dijkstra depuis une case sur la grille fixe → distances (dixièmes de case, entiers) rangées dans DR[c·K + k]
    function dijkstra(src, k) {
      const OUV = nouvelleGen(), FER = OUV + 1;
      for (let c = 0; c < N; c++) DR[c * K + k] = INF16;
      GC[src] = 0; ETAT[src] = OUV; TAS[0] = src; TF[0] = 0; POS[src] = 0; nt = 1;
      while (nt > 0) {
        const c = TAS[0]; nt--; if (nt > 0) { TAS[0] = TAS[nt]; TF[0] = TF[nt]; descendre(0); }
        ETAT[c] = FER; const g = GC[c]; DR[c * K + k] = Math.min(INF16 - 1, Math.floor(g * 10));
        for (let q = 0; q < 8; q++) {
          const v = c + VOIS[q];
          if (!FIXE[v] || ETAT[v] === FER) continue;
          if (q >= 4 && (!FIXE[c + COIN_A[q]] || !FIXE[c + COIN_B[q]])) continue;
          const ng = g + COUT[q];
          if (ETAT[v] !== OUV) { ETAT[v] = OUV; GC[v] = ng; TAS[nt] = v; TF[nt] = ng; nt++; monter(nt - 1); }
          else if (ng < GC[v]) { GC[v] = ng; const p = POS[v]; TF[p] = ng; monter(p); }
        }
      }
    }
    const DT = new Float64Array(Math.max(1, K)); // les distances des repères à la case visée
    function astar(s, t) {
      const OUV = nouvelleGen(), FER = OUV + 1, ti = t % W, tj = t / W | 0;
      let nk = 0; for (let k = 0; k < K; k++) { const v = DR[t * K + k]; if (v !== INF16) DT[nk++] = k * 65536 + v; } // repère et distance, serrés
      const h = (c) => {
        const di = Math.abs(c % W - ti), dj = Math.abs((c / W | 0) - tj); let e = di > dj ? di + (RAC2 - 1) * dj : dj + (RAC2 - 1) * di;
        for (let q = 0, o = c * K; q < nk; q++) { const kv = DT[q], v = DR[o + (kv / 65536 | 0)]; if (v === INF16) continue; const a = 0.1 * Math.abs(v - kv % 65536); if (a > e) e = a; }
        return POIDS * e;
      };
      ouvertes = 0; GC[s] = 0; PAR[s] = -1; ETAT[s] = OUV; TAS[0] = s; TF[0] = h(s); POS[s] = 0; nt = 1;
      while (nt > 0) {
        const c = TAS[0]; nt--; if (nt > 0) { TAS[0] = TAS[nt]; TF[0] = TF[nt]; descendre(0); }
        if (c === t) return true;
        ETAT[c] = FER; ouvertes++;
        const g = GC[c];
        for (let k = 0; k < 8; k++) {
          const v = c + VOIS[k];
          if (!LIB[v] || ETAT[v] === FER) continue;
          if (k >= 4 && (!LIB[c + COIN_A[k]] || !LIB[c + COIN_B[k]])) continue;
          const ng = g + COUT[k];
          if (ETAT[v] !== OUV) { ETAT[v] = OUV; GC[v] = ng; PAR[v] = c; TAS[nt] = v; TF[nt] = ng + h(v); nt++; monter(nt - 1); }
          else if (ng < GC[v]) { GC[v] = ng; PAR[v] = c; const p = POS[v]; TF[p] = ng + h(v); monter(p); }
        }
      }
      return false;
    }

    // ─── les repères : le premier au bout de la composante principale (vue sans limite), puis chaque suivant le plus loin de tous les autres ───
    const DR = new Uint16Array(N * Math.max(1, K)).fill(INF16), REPERES = [];
    const t1 = Date.now();
    if (K > 0) {
      const lib0 = new Uint8Array(LIB); LIB.set(FIXE); composantes(); // les composantes de la grille fixe
      if (PRINC) {
        let r0 = -1, bd = -1;
        for (let c = 0; c < N; c++) if (COMP[c] === PRINC) { const d = cx(c) ** 2 + cz(c) ** 2; if (d > bd) { bd = d; r0 = c; } }
        for (let k = 0; k < K && r0 >= 0; k++) {
          REPERES.push(r0); dijkstra(r0, k);
          r0 = -1; bd = 0;
          for (let c = 0; c < N; c++) {
            if (COMP[c] !== PRINC) continue;
            let m = INF16; for (let q = 0; q <= k; q++) { const v = DR[c * K + q]; if (v < m) m = v; }
            if (m !== INF16 && m > bd) { bd = m; r0 = c; }
          }
        }
      }
      LIB.set(lib0); lOk = null; synchro(); // retour à la grille courante (limite comprise)
    }
    const msReperes = Date.now() - t1;

    // ─── chemin : A*, coins du tracé, lissage glouton par lignes de vue ───
    function chemin(ax, az, bx, bz) {
      if (!fini(ax) || !fini(az) || !fini(bx) || !fini(bz)) return null;
      synchro();
      const s = procheCase(ax, az, 0, RAYON_DEPART); if (s < 0) return null;
      const t = procheCase(bx, bz, COMP[s], RAYON_ARRIVEE); if (t < 0) return null;
      const sx = caseDe(ax, az) === s ? ax : cx(s), sz = caseDe(ax, az) === s ? az : cz(s);
      const ex = caseDe(bx, bz) === t ? bx : cx(t), ez = caseDe(bx, bz) === t ? bz : cz(t);
      if (s === t) return sx === ex && sz === ez ? [[sx, sz]] : [[sx, sz], [ex, ez]];
      if (!astar(s, t)) return null;
      // les cases du tracé, de s à t, ne gardant que s, les changements de direction et t
      let n = 0; for (let c = t; c !== -1; c = PAR[c]) n++;
      let k = n; for (let c = t; c !== -1; c = PAR[c]) CH[--k] = c;
      let m = 1;
      for (let i = 1; i < n - 1; i++) if (CH[i] - CH[i - 1] !== CH[i + 1] - CH[i]) CH[m++] = CH[i];
      CH[m++] = CH[n - 1];
      // les points : départ, cases gardées, arrivée ; on saute tout point que la ligne de vue rend inutile
      const P = m + 2, px = (i) => i === 0 ? sx : i === P - 1 ? ex : cx(CH[i - 1]), pz = (i) => i === 0 ? sz : i === P - 1 ? ez : cz(CH[i - 1]);
      const out = [[sx, sz]]; let ancre = 0;
      for (let i = 1; i < P - 1; i++) {
        if (!monde.passe(px(ancre), pz(ancre), px(i + 1), pz(i + 1), rLisse)) { out.push([px(i), pz(i)]); ancre = i; }
      }
      out.push([ex, ez]);
      for (let i = out.length - 1; i > 0; i--) if (Math.abs(out[i][0] - out[i - 1][0]) < 1e-9 && Math.abs(out[i][1] - out[i - 1][1]) < 1e-9) out.splice(i, 1);
      return out;
    }
    function libre(x, z) { if (!fini(x) || !fini(z)) return false; synchro(); const c = caseDe(x, z); return c >= 0 && LIB[c] === 1; }
    function proche(x, z) {
      synchro();
      if (fini(x) && fini(z)) {
        if (libre(x, z)) return [x, z];
        const c = procheCase(x, z, 0, 60); if (c >= 0) return [cx(c), cz(c)];
      }
      return REP >= 0 ? [cx(REP), cz(REP)] : [fini(x) ? x : 0, fini(z) ? z : 0];
    }
    function accessible(x, z) { if (!fini(x) || !fini(z)) return false; synchro(); const c = caseDe(x, z); return c >= 0 && LIB[c] === 1 && COMP[c] === PRINC; }
    monde.accessible = accessible;

    let libres = 0; for (let c = 0; c < N; c++) libres += FIXE[c];
    const nav = {
      chemin, libre, proche, accessible, pas, marge,
      stats: { cote: W, cases: N, libres, msGrille, msReperes, reperes: REPERES.length, get composantes() { synchro(); return tailles.length - 1; }, get principale() { synchro(); return tailles[PRINC] || 0; }, get ouvertes() { return ouvertes; } },
    };
    return nav;
  }
  return { creer };
});
