/* ŒILLETS — rendu Canvas 2D : papier kraft, trois encres en aplat, trames en surimpression (multiply), repérage décalé. */
const RENDER = (() => {
  'use strict';
  const S = SIM, TYPES = S.TYPES;
  const C = { papier: '#F1E8D6', encre: '#2A2B33', canard: '#1F8A8A', rose: '#F26BA6', argile: '#8E7D6D', soleil: '#F7C843', sel: '#FFFDF6', pale: '#E8E0CC', rouge: '#D7442C' };
  let cv, ctx, W = 1, H = 1, DPR = 1, safeTop = 0, safeBottom = 0;
  let geo = null, pat = {}, lastRows = 0;
  const TAU = Math.PI * 2;
  const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + (c | 0) * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const ABR = { cobier: 'CO', fare: 'FA', aderne: 'AD', oeillet: 'Œ' };

  function init(canvas, probe) {
    cv = canvas; ctx = cv.getContext('2d');
    const cs = getComputedStyle(probe);
    safeTop = parseFloat(cs.paddingTop) || 0; safeBottom = parseFloat(cs.paddingBottom) || 0;
    resize();
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    makePatterns();
    geo = null;
  }
  function tile(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; }
  function makePatterns() {
    const grain = tile(256, (g, n) => { g.clearRect(0, 0, n, n); for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(42,43,51,0.07)' : 'rgba(255,255,255,0.08)'; g.fillRect(Math.random() * n, Math.random() * n, 1, 1); } });
    const dots = (frac) => tile(8, (g, n) => { g.clearRect(0, 0, n, n); g.fillStyle = C.rose; const r = frac >= 0.6 ? 2.1 : 1.45; g.beginPath(); g.arc(2, 2, r, 0, TAU); g.fill(); g.beginPath(); g.arc(6, 6, r, 0, TAU); g.fill(); if (frac >= 0.6) { g.beginPath(); g.arc(6, 2, 1.2, 0, TAU); g.fill(); g.beginPath(); g.arc(2, 6, 1.2, 0, TAU); g.fill(); } });
    const hatch = (col, alpha, gap) => tile(gap * 2, (g, n) => { g.clearRect(0, 0, n, n); g.strokeStyle = col; g.globalAlpha = alpha; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, n); g.lineTo(n, 0); g.moveTo(-n / 2, n / 2); g.lineTo(n / 2, -n / 2); g.moveTo(n / 2, n * 1.5); g.lineTo(n * 1.5, n / 2); g.stroke(); });
    pat = {
      grain: ctx.createPattern(grain, 'repeat'),
      dots30: ctx.createPattern(dots(0.3), 'repeat'), dots60: ctx.createPattern(dots(0.6), 'repeat'),
      pluie: ctx.createPattern(hatch(C.canard, 0.5, 7), 'repeat'), jaune: ctx.createPattern(hatch(C.soleil, 0.9, 5), 'repeat'), rouge: ctx.createPattern(hatch(C.rouge, 0.8, 5), 'repeat'),
    };
  }
  // ─── géométrie ───
  function layout(st) {
    if (geo && lastRows === st.rows) return geo;
    lastRows = st.rows;
    const skyH = 138 + safeTop, seaH = 18, vasH = 60, margeH = 48, barH = 62 + safeBottom;
    const availH = H - skyH - seaH - vasH - margeH - barH - 12;
    const cs = Math.max(30, Math.floor(Math.min(56, (W - 20) / S.P.COLS)));
    const ch = Math.max(30, Math.floor(Math.min(cs * 1.8, availH / (st.rows - 1))));
    const gw = cs * S.P.COLS, gx = Math.round((W - gw) / 2), seaY = skyH, vasY = skyH + seaH, gy = vasY + vasH;
    geo = { skyH, seaH, vasH, cs, ch, gx, gw, seaY, vasY, gy, gridBottom: gy + (st.rows - 1) * ch, W, H, safeTop, safeBottom };
    return geo;
  }
  function cellRect(st, cell) {
    const g = layout(st);
    if (cell.type === 'vasiere') return { x: g.gx, y: g.vasY, w: g.gw, h: g.vasH };
    return { x: g.gx + cell.c * g.cs, y: g.gy + (cell.r - 1) * g.ch, w: g.cs, h: g.ch };
  }
  function freeRect(st, r, c) { const g = layout(st); return { x: g.gx + c * g.cs, y: g.gy + (r - 1) * g.ch, w: g.cs, h: g.ch }; }
  function gateSegment(st, g) {
    const ra = cellRect(st, g.a), rb = cellRect(st, g.b);
    // mur partagé : horizontal si l'un est au-dessus de l'autre
    if (Math.abs((ra.y + ra.h) - rb.y) < 1 || Math.abs((rb.y + rb.h) - ra.y) < 1) {
      const y = ra.y + ra.h <= rb.y + 1 ? ra.y + ra.h : rb.y + rb.h;
      const x0 = Math.max(ra.x, rb.x), x1 = Math.min(ra.x + ra.w, rb.x + rb.w);
      return { x0, y0: y, x1, y1: y, horiz: true, mx: (x0 + x1) / 2, my: y };
    }
    const x = ra.x + ra.w <= rb.x + 1 ? ra.x + ra.w : rb.x + rb.w;
    const y0 = Math.max(ra.y, rb.y), y1 = Math.min(ra.y + ra.h, rb.y + rb.h);
    return { x0: x, y0, x1: x, y1, horiz: false, mx: x, my: (y0 + y1) / 2 };
  }
  function etierPoint(st) { const g = layout(st); return { x: g.gx + g.gw / 2, y: g.vasY }; }
  const distSeg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  function hit(st, x, y) {
    const g = layout(st);
    const e = etierPoint(st);
    if (Math.hypot(x - e.x, y - e.y) < 24) return { kind: 'etier' };
    let best = null, bd = 13;
    for (const gt of S.gatesOf(st)) {
      const sg = gateSegment(st, gt);
      const d = distSeg(x, y, sg.x0, sg.y0, sg.x1, sg.y1);
      if (d < bd) { bd = d; best = gt; }
    }
    if (best) return { kind: 'gate', gate: best };
    for (const cell of st.cells) { const r = cellRect(st, cell); if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return { kind: 'cell', cell }; }
    if (x >= g.gx && x < g.gx + g.gw && y >= g.gy && y < g.gridBottom) {
      const c = Math.floor((x - g.gx) / g.cs), r = 1 + Math.floor((y - g.gy) / g.ch);
      return { kind: 'free', r, c };
    }
    return null;
  }
  // ─── primitives ───
  function jitterPoly(r, seed) {
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
    return pts.map((p, i) => [p[0] + (hash(seed, i, 1) - 0.5) * 3, p[1] + (hash(seed, i, 2) - 0.5) * 3]);
  }
  function pathPoly(poly) { ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); }
  function stencil(txt, x, y, size, col, align) { ctx.font = `900 ${size}px "Big Shoulders Stencil Text","Big Shoulders Stencil","Arial Narrow",Impact,sans-serif`; ctx.fillStyle = col; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, x, y); }

  // ─── dessin ───
  function draw(st, env, ui) {
    const g = layout(st);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = C.papier; ctx.fillRect(0, 0, W, H);
    drawSky(st, env, ui, g);
    drawSea(st, env, g);
    for (const cell of st.cells) drawCell(st, env, ui, cell);
    if (ui.mode === 'creuser' || ui.mode === 'hiver') drawFree(st, ui, g);
    drawWalls(st, ui);
    drawGates(st, ui);
    drawEtier(st, env, ui);
    drawBirds(st, env, ui);
    if (ui.strokes) drawStrokes(ui);
    if (ui.ring) drawRing(st, ui);
    if (env.rain > 0) { ctx.fillStyle = pat.pluie; ctx.fillRect(0, g.skyH - 30, W, H); }
    const nf = ui.mode === 'hiver' ? 0 : nightFrac(env, ui);
    if (nf > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.35; ctx.fillStyle = C.canard; ctx.fillRect(0, 0, W, H * nf); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    if (ui.flood > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = Math.min(ui.mode === 'hiver' ? 0.3 : 0.8, ui.flood); ctx.fillStyle = C.canard; ctx.fillRect(0, g.seaY, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    // grain du papier, une fois calculé
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.9; ctx.fillStyle = pat.grain; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function nightFrac(env, ui) {
    if (ui.reduceMotion) return env.night ? 1 : 0;
    const h = env.hour;
    if (h >= 21.5) return Math.min(1, (h - 21.5) * 60);
    if (h < 6.5) return Math.max(0, 1 - Math.max(0, (h - 6.5 + 1 / 60) * 60));
    return 0;
  }
  function drawSky(st, env, ui, g) {
    // soleil / lune sur un arc, derrière les textes
    const day = env.hour >= 6 && env.hour < 21.5;
    const cx = W / 2, top = safeTop + 10, arcW = Math.min(W * 0.26, 110);
    if (day) {
      const t = (env.hour - 6) / 15.5, x = cx - arcW + 2 * arcW * t, y = top + 34 - Math.sin(t * Math.PI) * 24;
      ctx.fillStyle = C.encre; ctx.beginPath(); ctx.arc(x + 2, y + 1.5, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = C.soleil; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
    } else {
      const t = env.hour >= 21.5 ? (env.hour - 21.5) / 9 : (env.hour + 2.5) / 9, x = cx - arcW + 2 * arcW * t, y = top + 34 - Math.sin(t * Math.PI) * 24;
      drawMoon(x, y, 10, env.moon);
    }
    // jauge de marée (à gauche) et baromètre (à droite)
    const gy = g.skyH - 34, x0 = 16, x1 = W - 108, gw = x1 - x0;
    const pos = (h) => x0 + gw * (h + 1.3) / 2.6;
    ctx.fillStyle = C.papier; ctx.fillRect(x0, gy, gw, 10);
    ctx.fillStyle = C.canard; ctx.fillRect(x0, gy, Math.max(0, pos(env.h) - x0), 10);
    ctx.strokeStyle = C.encre; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, gy + 0.5, gw - 1, 9);
    for (let h = -1; h <= 1; h += 0.5) { const x = pos(h); ctx.beginPath(); ctx.moveTo(x, gy + 10); ctx.lineTo(x, gy + 14); ctx.stroke(); }
    const sx = pos(S.P.SILL);
    ctx.strokeStyle = C.encre; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, gy - 5); ctx.lineTo(sx, gy + 15); ctx.stroke();
    stencil('SEUIL', sx + 4, gy - 1, 9, C.encre, 'left');
    const nx = pos(env.h);
    ctx.fillStyle = C.encre; ctx.beginPath(); ctx.moveTo(nx, gy - 2); ctx.lineTo(nx - 5, gy - 9); ctx.lineTo(nx + 5, gy - 9); ctx.closePath(); ctx.fill();
    // baromètre : aiguille, ou courbe 24 h si enregistreur
    if (ui.baro) drawBaro(ui.baro, W - 96, gy - 12, 80, 30);
  }
  function drawBaro(baro, x, y, w, h) {
    ctx.fillStyle = C.papier; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = C.argile; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const ry = (p) => y + h - (S.clamp((p - 995) / 30, 0, 1)) * (h - 4) - 2;
    if (baro.curve) {
      ctx.strokeStyle = C.argile; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x, ry(1005)); ctx.lineTo(x + w, ry(1005)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = C.encre; ctx.lineWidth = 1.5; ctx.beginPath();
      baro.curve.forEach((p, i) => { const px = x + (i / (baro.curve.length - 1)) * w; if (i) ctx.lineTo(px, ry(p)); else ctx.moveTo(px, ry(p)); }); ctx.stroke();
      stencil('24 H', x + 3, y + 9, 8, C.argile, 'left');
    } else {
      const cx = x + w - 16, cy = y + h / 2;
      ctx.strokeStyle = C.encre; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, TAU); ctx.stroke();
      const a = Math.PI * 1.25 - S.clamp((baro.P - 995) / 30, 0, 1) * Math.PI * 1.5;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 10, cy - Math.sin(a) * 10); ctx.stroke();
      stencil(baro.dP < -0.15 ? '↓' : baro.dP > 0.15 ? '↑' : '→', x + 4, cy + 5, 14, C.encre, 'left');
      stencil('BARO', x + 20, cy + 4, 8, C.argile, 'left');
    }
  }
  function drawMoon(x, y, r, phase) {
    ctx.fillStyle = C.encre; ctx.beginPath(); ctx.arc(x + 1.5, y + 1, r, 0, TAU); ctx.fill();
    ctx.fillStyle = C.papier; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.encre; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    // partie éclairée en encre claire : croissant selon la phase
    const k = Math.cos(phase * TAU); // 1 nouvelle (sombre), -1 pleine
    ctx.fillStyle = C.soleil;
    ctx.beginPath();
    if (phase < 0.5) { ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2); ctx.ellipse(x, y, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0); }
    else { ctx.arc(x, y, r, Math.PI / 2, -Math.PI / 2); ctx.ellipse(x, y, Math.abs(k) * r, r, 0, -Math.PI / 2, Math.PI / 2, k < 0); }
    ctx.fill();
  }
  function drawSea(st, env, g) {
    const level = 0.35 + 0.65 * (env.h + 1.3) / 2.6;
    const h = g.seaH * level, y = g.vasY - h;
    ctx.fillStyle = C.canard; ctx.fillRect(g.gx - 6, y, g.gw + 12, h);
    ctx.strokeStyle = C.papier; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let x = g.gx - 6; x <= g.gx + g.gw + 6; x += 6) { const yy = y + 5 + Math.sin(x / 9 + (env.ms / 4000)) * 1.5; if (x === g.gx - 6) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
    ctx.stroke();
    stencil('MER', g.gx - 4, g.vasY - h - 3, 9, C.canard, 'left');
  }
  function drawCell(st, env, ui, cell) {
    const r = cellRect(st, cell), poly = jitterPoly(r, cell.id * 7 + 3), Sg = S.salinity(cell), b = S.bucket(Sg);
    const inset = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 };
    const wet = cell.depth > 0.02;
    ctx.save();
    pathPoly(poly); ctx.clip();
    if (!wet) {
      ctx.globalAlpha = 0.55; ctx.fillStyle = C.argile; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = Math.min(1, cell.depth / 6) * 0.95 + 0.05; ctx.fillStyle = C.canard; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1;
      const off = env.rain > 0 ? 3.5 : 1.5;
      if (b === 'violet30' || b === 'violet60') {
        ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = b === 'violet30' ? pat.dots30 : pat.dots60;
        ctx.save(); ctx.translate(off, 1); ctx.fillRect(r.x - off, r.y - 1, r.w, r.h); ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
      } else if (b === 'rose' || b === 'blanc') {
        ctx.globalAlpha = b === 'rose' ? 0.82 : 1; ctx.fillStyle = C.rose; ctx.fillRect(r.x + off, r.y + 1, r.w, r.h); ctx.globalAlpha = 1;
        if (b === 'rose') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = pat.dots30; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalCompositeOperation = 'source-over'; }
      }
    }
    ctx.restore();
    // sel : un point par 4 kg ; croûte perdue en points ternes
    const kg = S.kgOf(cell.crust);
    if (kg > 0.5) {
      const n = Math.min(160, Math.floor(kg / 2) + 1);
      ctx.fillStyle = cell.type === 'oeillet' ? C.sel : C.pale;
      for (let i = 0; i < n; i++) {
        const px = inset.x + 2 + hash(cell.id, i, 11) * (inset.w - 4), py = inset.y + 2 + hash(cell.id, i, 12) * (inset.h - 4);
        ctx.fillRect(px, py, 2.2, 2.2);
      }
    }
    // liseré blanc : fin à saturation, épais si fleur
    if (cell.type === 'oeillet' && wet && (b === 'blanc' || cell.fleur > 0.15)) {
      ctx.strokeStyle = C.sel; ctx.lineWidth = cell.fleur > 0.15 ? 3 : 1.2; ctx.strokeRect(r.x + 3.5, r.y + 3.5, r.w - 7, r.h - 7);
    }
    // fissures
    if (cell.integ < 0.8) {
      const n = Math.round((0.8 - cell.integ) * 40) + 2;
      ctx.strokeStyle = C.encre; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < n; i++) { const px = inset.x + hash(cell.id, i, 21) * inset.w, py = inset.y + hash(cell.id, i, 22) * inset.h, a = hash(cell.id, i, 23) * TAU; ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7); }
      ctx.stroke();
    }
    // étiquette au pochoir
    const col = wet && (b === 'violet60' || b === 'rose' || b === 'blanc') ? C.papier : C.encre;
    if (cell.type === 'vasiere') {
      stencil(`VASIÈRE · ${Math.round(cell.depth)} CM`, r.x + 6, r.y + 15, 11, col, 'left');
      if (st.vasEnl) stencil(`×${st.vasEnl}`, r.x + r.w - 6, r.y + 15, 11, col, 'right');
      if (st.enEau) stencil('EN EAU', r.x + r.w / 2, r.y + r.h - 6, 10, col, 'center');
    } else {
      stencil(ABR[cell.type] + cell.num, r.x + 5, r.y + 12, 10, col, 'left');
      if (ui.selected === cell) { ctx.setLineDash([4, 3]); ctx.strokeStyle = C.encre; ctx.lineWidth = 2; ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); ctx.setLineDash([]); }
      if (ui.mode === 'hiver' && ui.problems && ui.problems.includes(cell)) { ctx.fillStyle = pat.rouge; ctx.fillRect(r.x, r.y, r.w, r.h); }
    }
  }
  function drawFree(st, ui, g) {
    for (let r = 1; r < st.rows; r++) for (let c = 0; c < S.P.COLS; c++) {
      if (S.cellAt(st, r, c)) continue;
      const fr = freeRect(st, r, c);
      ctx.fillStyle = pat.jaune; ctx.fillRect(fr.x + 3, fr.y + 3, fr.w - 6, fr.h - 6);
      if (ui.selFree && ui.selFree[0] === r && ui.selFree[1] === c) { ctx.setLineDash([4, 3]); ctx.strokeStyle = C.encre; ctx.lineWidth = 2; ctx.strokeRect(fr.x + 2, fr.y + 2, fr.w - 4, fr.h - 4); ctx.setLineDash([]); }
    }
  }
  function drawWalls(st) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const cell of st.cells) {
      const poly = jitterPoly(cellRect(st, cell), cell.id * 7 + 3);
      pathPoly(poly); ctx.strokeStyle = C.argile; ctx.lineWidth = 5; ctx.stroke();
    }
    ctx.save(); ctx.translate(1.5, -1);
    for (const cell of st.cells) {
      const poly = jitterPoly(cellRect(st, cell), cell.id * 7 + 3);
      pathPoly(poly); ctx.strokeStyle = C.encre; ctx.lineWidth = 1.8; ctx.stroke();
    }
    ctx.restore();
  }
  function drawGates(st) {
    for (const g of S.gatesOf(st)) {
      const sg = gateSegment(st, g), open = S.gateOpen(st, g.key);
      ctx.save(); ctx.translate(sg.mx, sg.my);
      ctx.rotate(sg.horiz ? 0 : Math.PI / 2);
      if (open) ctx.rotate(-70 * Math.PI / 180);
      ctx.fillStyle = open ? C.soleil : C.argile; ctx.strokeStyle = C.encre; ctx.lineWidth = 1.5;
      ctx.fillRect(-8, -3, 16, 6); ctx.strokeRect(-8, -3, 16, 6);
      ctx.restore();
      if (!open) { ctx.fillStyle = C.encre; ctx.beginPath(); ctx.arc(sg.mx, sg.my, 1.6, 0, TAU); ctx.fill(); }
    }
  }
  function drawEtier(st, env, ui) {
    const e = etierPoint(st), open = st.etierOpen;
    ctx.save(); ctx.translate(e.x, e.y);
    if (open) ctx.rotate(-70 * Math.PI / 180);
    ctx.fillStyle = open ? C.soleil : C.argile; ctx.strokeStyle = C.encre; ctx.lineWidth = 2;
    ctx.fillRect(-11, -4, 22, 8); ctx.strokeRect(-11, -4, 22, 8);
    ctx.restore();
    if (st.items.clapet) { ctx.fillStyle = C.encre; ctx.beginPath(); ctx.moveTo(e.x + 16, e.y - 5); ctx.lineTo(e.x + 24, e.y); ctx.lineTo(e.x + 16, e.y + 5); ctx.closePath(); ctx.fill(); }
    stencil('ÉTIER', e.x - 16, e.y - 9, 9, C.encre, 'right');
  }
  function drawBirds(st, env, ui) {
    const flap = Math.floor(env.ms / 500) % 2 === 0;
    for (const cell of st.cells) {
      if (cell.type !== 'aderne' || cell.algae < 0.5 || S.salinity(cell) < 150 || env.night) continue;
      const r = cellRect(st, cell);
      for (let i = 0; i < 2; i++) {
        const x = r.x + 10 + hash(cell.id, i, 31) * (r.w - 20), y = r.y + r.h * 0.55 + hash(cell.id, i, 32) * (r.h * 0.25);
        ctx.strokeStyle = C.encre; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.ellipse(x, y, 5, 2.2, 0, 0, TAU);                                   // corps
        ctx.moveTo(x + 4, y - 1); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 10, y - 7.5); // cou, bec retroussé
        ctx.moveTo(x - 1, y + 2); ctx.lineTo(x - 2, y + 8); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 2, y + 8); // pattes
        if (flap) { ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 4, y - 7); }
        ctx.stroke();
      }
    }
  }
  function drawStrokes(ui) {
    for (const s of ui.strokes) {
      ctx.globalAlpha = Math.max(0, s.life); ctx.strokeStyle = C.encre; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function ringTarget(st, ring) {
    if (!ring) return null;
    if (ring.kind === 'etier') { const e = etierPoint(st); return { x: e.x, y: e.y, r: 20 }; }
    if (ring.kind === 'gate') { const g = S.gatesOf(st).find((x) => x.key === ring.key); if (!g) return null; const sg = gateSegment(st, g); return { x: sg.mx, y: sg.my, r: 18 }; }
    if (ring.kind === 'cell') { const cell = st.cells.find((c) => c.id === ring.id); if (!cell) return null; const r = cellRect(st, cell); return { x: r.x + r.w / 2, y: r.y + r.h / 2, r: Math.min(r.w, r.h) / 2 + 4 }; }
    return null;
  }
  function drawRing(st, ui) {
    const t = ringTarget(st, ui.ring);
    if (!t) return;
    const pulse = Math.floor(Date.now() / 600) % 2 === 0 ? 0 : 3;
    ctx.strokeStyle = C.soleil; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x, t.y, t.r + pulse, 0, TAU); ctx.stroke();
    ctx.strokeStyle = C.encre; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(t.x + 1.5, t.y + 1, t.r + pulse, 0, TAU); ctx.stroke();
  }
  // vignette d'un plan passé (carnet), dessinée dans un petit canvas
  function drawThumb(canvas, rec, cols) {
    const g = canvas.getContext('2d'), rows = rec.rows, cs = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
    g.fillStyle = C.papier; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = C.canard; g.fillRect(0, 0, cs * cols, cs);
    const COL = { cobier: C.canard, fare: '#5B6F9E', aderne: C.violet, oeillet: C.rose };
    for (const [r, c, type] of rec.plan) { g.fillStyle = COL[type] || C.argile; g.fillRect(c * cs + 1, r * cs + 1, cs - 2, cs - 2); }
    g.strokeStyle = C.argile; g.lineWidth = 1; g.strokeRect(0.5, 0.5, cs * cols - 1, cs * rows - 1);
  }
  return { init, resize, layout, cellRect, freeRect, gateSegment, etierPoint, hit, draw, drawThumb, C, get W() { return W; }, get H() { return H; } };
})();
