#!/usr/bin/env node
/* OPÉRATION PONCIN — construit la vraie carte de Poncin (01450, Ain) à partir des données ouvertes : OpenStreetMap (ODbL) et
   IGN Géoplateforme (BD TOPO®, RGE ALTI®, BD ORTHO® ; Licence Ouverte Etalab 2.0). Google est exclu (ses conditions interdisent
   d'extraire ou de garder ses données).
   Sortie dans poncin/carte/ : poncin.json (la carte v1 de src-poncin/ARCHITECTURE.md, lue telle quelle par le jeu), sol-2048.jpg et
   sol-1024.jpg (photo aérienne adoucie, recalée sur le carré joué : ligne 0 = nord, colonne 0 = ouest), LICENCE-DONNEES.md.
   Le réseau du poste de développement est fermé : la vraie construction tourne sur GitHub Actions (.github/workflows/carte.yml).
     node outils/carte/construire.js            la vraie carte (réponses brutes gardées dans outils/carte/cache/)
     node outils/carte/construire.js --essai    tout le pipeline hors ligne sur de fausses réponses synthétiques, avec vérifications
   Options : --sortie <dossier>, --sans-cache. Node 22 (fetch global), CommonJS ; seule dépendance : jpeg-js@0.4.4
   (npm i --no-save --prefix outils/carte jpeg-js@0.4.4). Étapes : decouvrir → osm → bdtopo → alti → assembler → ortho → écrire. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
let JPEG = null; try { JPEG = require('jpeg-js'); } catch (e) { /* signalé plus bas : sans jpeg-js, pas de photo aérienne (sol peint) */ }

const ICI = __dirname, RACINE = path.resolve(ICI, '..', '..'), ARGS = process.argv.slice(2);
const ESSAI = ARGS.includes('--essai'), SANS_CACHE = ARGS.includes('--sans-cache');
const arg = (nom, def) => { const i = ARGS.indexOf(nom); return i >= 0 && ARGS[i + 1] ? ARGS[i + 1] : def; };
const UA = 'gamemobil-poncin-carte/1.0 (+https://github.com/devclaudeapp/gamemobil)';

// ─── réglages (poncin.config.json les complète ; voir README.md) ───
const DEFAUT = {
  approx: { lat: 46.0875, lon: 5.4069 }, centre: 'auto', taille: 'auto', tailleMin: 600, tailleMax: 800,
  pasRelief: 10, zoomOrtho: 19, sol: [2048, 1024], qualiteJpeg: 80, graine: 1450, versionCache: 1, attente: 4000, pageWfs: 500,
  overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
  wfs: 'https://data.geopf.fr/wfs/ows', coucheBati: 'BDTOPO_V3:batiment',
  wmsr: 'https://data.geopf.fr/wms-r', coucheAlti: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
  altiApi: 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json', ressourceAlti: 'ign_rge_alti_wld',
  wmts: 'https://data.geopf.fr/wmts', coucheOrtho: 'ORTHOIMAGERY.ORTHOPHOTOS',
  arene: { rayon: 110, apparitions: 20, objets: 8 }, arbresBois: { espacement: 9, max: 900 },
  style: { flou: 1, saturation: 1.28, chaleur: 0.035, eclaircir: 0.12, gamma: 0.86, pave: [218, 208, 195] },
};
function lireConfig() {
  let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(ICI, 'poncin.config.json'), 'utf8')); } catch (e) { console.log(`poncin.config.json illisible (${e.message}) : réglages par défaut`); }
  const r = Object.assign({}, DEFAUT, c); for (const k of ['approx', 'arene', 'arbresBois', 'style']) r[k] = Object.assign({}, DEFAUT[k], c[k] || {});
  return r;
}
const CONFIG = lireConfig();
const SORTIE = path.resolve(arg('--sortie', ESSAI ? path.join(os.tmpdir(), 'poncin-carte-essai') : path.join(RACINE, 'poncin', 'carte')));
const CACHE = ESSAI ? fs.mkdtempSync(path.join(os.tmpdir(), 'poncin-cache-')) : path.join(ICI, 'cache');

// ─── journal et rapport ───
const T0 = Date.now(), STATS = { requetes: 0, cache: 0, octets: 0 };
const RAPPORT = { replis: [], alertes: [], sources: {}, enveloppes: 0 };
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)} s]`, ...a);
const alerte = (m) => { RAPPORT.alertes.push(m); log('ATTENTION ' + m); };
const repli = (m) => { RAPPORT.replis.push(m); log('REPLI ' + m); };

// ─── le réseau : cache des réponses brutes, réessais avec attente, 4 requêtes en parallèle au plus ───
let FETCH = (url, o) => fetch(url, o);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
function semaphore(n) {
  let libres = n; const file = [];
  return { async prendre() { if (libres > 0) { libres--; return; } await new Promise((r) => file.push(r)); }, rendre() { const r = file.shift(); if (r) r(); else libres++; } };
}
const SEM = semaphore(4), SEM_OVERPASS = semaphore(1), CADENCES = {};
async function cadence(hote, ms) { // espacement minimal entre deux départs vers le même hôte (API altimétrique : ≤ 5 requêtes/s)
  const c = CADENCES[hote] || (CADENCES[hote] = { t: 0 }), now = Date.now(), t = Math.max(now, c.t); c.t = t + ms;
  if (t > now) await attendre(t - now);
}
async function telecharger(url, o = {}) {
  const corps = o.corps || null, methode = o.methode || 'GET';
  const cle = crypto.createHash('sha1').update(`${CONFIG.versionCache}\n${methode} ${url}\n${corps || ''}`).digest('hex');
  const fic = path.join(CACHE, cle.slice(0, 2), cle);
  if (!SANS_CACHE && fs.existsSync(fic)) { STATS.cache++; return fs.readFileSync(fic); }
  const essais = o.essais || 4; let derniere = null;
  for (let k = 0; k < essais; k++) {
    if (k) await attendre(Math.min(90000, CONFIG.attente * 2.5 ** (k - 1)));
    if (o.seul) await SEM_OVERPASS.prendre();
    await SEM.prendre();
    try {
      if (o.cadence) await cadence(new URL(url).host, o.cadence);
      const rep = await FETCH(url, { method: methode, body: corps, headers: Object.assign({ 'User-Agent': UA, Accept: '*/*' }, o.entetes || {}), signal: AbortSignal.timeout(o.delai || 90000) });
      const buf = Buffer.from(await rep.arrayBuffer()); STATS.requetes++; STATS.octets += buf.length;
      if (!rep.ok) {
        derniere = new Error(`HTTP ${rep.status} : ${buf.toString('utf8', 0, 240).replace(/\s+/g, ' ')}`);
        if (rep.status === 429 || rep.status === 408 || rep.status >= 500) continue;
        break; // 4xx : inutile d'insister
      }
      const v = o.valider ? o.valider(buf) : true;
      if (v !== true) { derniere = new Error(`réponse refusée : ${v}`); continue; }
      if (!SANS_CACHE) { fs.mkdirSync(path.dirname(fic), { recursive: true }); fs.writeFileSync(fic, buf); }
      return buf;
    } catch (e) { derniere = e; } finally { SEM.rendre(); if (o.seul) SEM_OVERPASS.rendre(); }
  }
  throw new Error(`${(derniere && derniere.message) || 'échec'} [${url.slice(0, 160)}]`);
}
const jsonOk = (test) => (b) => { try { return test(JSON.parse(b.toString('utf8'))); } catch (e) { return 'JSON invalide : ' + b.toString('utf8', 0, 160).replace(/\s+/g, ' '); } };
async function overpass(q, quoi) { // Overpass, un serveur après l'autre (une seule requête à la fois)
  let derniere = null;
  for (const url of CONFIG.overpass) {
    try {
      const buf = await telecharger(url, {
        methode: 'POST', corps: 'data=' + encodeURIComponent(q), entetes: { 'Content-Type': 'application/x-www-form-urlencoded' }, seul: true, delai: 240000, essais: 3,
        valider: jsonOk((j) => !Array.isArray(j.elements) ? 'pas de liste elements' : j.remark && /error|timed out|out of memory/i.test(j.remark) ? j.remark.slice(0, 160) : true),
      });
      const j = JSON.parse(buf.toString('utf8'));
      log(`${quoi} : ${j.elements.length} éléments OSM (${new URL(url).host})`); RAPPORT.sources.overpass = new URL(url).host;
      return j;
    } catch (e) { derniere = e; alerte(`${quoi} : ${new URL(url).host} a échoué (${e.message.slice(0, 200)})`); }
  }
  throw derniere;
}

// ─── géodésie : plan tangent local (rayons WGS84 à φ0) et Web Mercator ───
const A_WGS = 6378137, E2 = 0.00669437999014, RAD = Math.PI / 180;
function repere(lat0, lon0) { // x = (λ−λ0)·N·cos φ0 vers l'est, z = −(φ−φ0)·M vers le sud
  const s = Math.sin(lat0 * RAD), w = 1 - E2 * s * s, N = A_WGS / Math.sqrt(w), M = A_WGS * (1 - E2) / (w * Math.sqrt(w));
  const kx = N * Math.cos(lat0 * RAD) * RAD, kz = M * RAD;
  return { lat0, lon0, kx, kz, xz: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz], ll: (x, z) => [lat0 - z / kz, lon0 + x / kx] };
}
const MERC = { // pixels globaux d'un niveau de zoom (tuiles de 256 px, TILEMATRIXSET=PM)
  px: (lon, z) => (lon + 180) / 360 * 256 * 2 ** z,
  py: (lat, z) => { const s = Math.sin(lat * RAD); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z; },
  lon: (px, z) => px / (256 * 2 ** z) * 360 - 180,
  lat: (py, z) => Math.atan(Math.sinh(Math.PI - 2 * Math.PI * py / (256 * 2 ** z))) / RAD,
};

// ─── géométrie plane (points [x, z]) ───
const r1 = (v) => Math.round(v * 10) / 10, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function aire(p) { let a = 0; for (let i = 0, n = p.length; i < n; i++) { const q = p[i], s = p[(i + 1) % n]; a += q[0] * s[1] - s[0] * q[1]; } return a / 2; }
function centroide(p) {
  let a = 0, cx = 0, cz = 0;
  for (let i = 0, n = p.length; i < n; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % n], c = x1 * z2 - x2 * z1; a += c; cx += (x1 + x2) * c; cz += (z1 + z2) * c; }
  if (Math.abs(a) < 1e-9) { let sx = 0, sz = 0; for (const q of p) { sx += q[0]; sz += q[1]; } return [sx / p.length, sz / p.length]; }
  return [cx / (3 * a), cz / (3 * a)];
}
function dedans(x, z, p) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function distSeg(px, pz, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, d2 = dx * dx + dz * dz; let t = d2 ? ((px - ax) * dx + (pz - az) * dz) / d2 : 0; t = clamp(t, 0, 1); return Math.hypot(px - ax - t * dx, pz - az - t * dz); }
function distBord(x, z, p, ferme = true) { let d = Infinity; const n = p.length, m = ferme ? n : n - 1; for (let i = 0; i < m; i++) { const a = p[i], b = p[(i + 1) % n]; const e = distSeg(x, z, a[0], a[1], b[0], b[1]); if (e < d) d = e; } return d; }
function boite(p) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const q of p) { if (q[0] < a) a = q[0]; if (q[1] < b) b = q[1]; if (q[0] > c) c = q[0]; if (q[1] > d) d = q[1]; } return [a, b, c, d]; }
const boitesSeCroisent = (a, b, m = 0) => a[0] <= b[2] + m && b[0] <= a[2] + m && a[1] <= b[3] + m && b[1] <= a[3] + m;
function couperPoly(p, h) { // Sutherland-Hodgman contre le carré [-h, h]²
  let r = p;
  for (const [axe, s] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
    const q = [], n = r.length; if (!n) break;
    for (let i = 0; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n], da = s * a[axe] - h, db = s * b[axe] - h;
      if (da <= 0) q.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); q.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
    r = q;
  }
  return r;
}
function couperSeg(a, b, h) { // Liang-Barsky → [a', b', t0, t1] | null
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dz = b[1] - a[1], P = [-dx, dx, -dz, dz], Q = [a[0] + h, h - a[0], a[1] + h, h - a[1]];
  for (let k = 0; k < 4; k++) {
    if (P[k] === 0) { if (Q[k] < 0) return null; continue; }
    const t = Q[k] / P[k];
    if (P[k] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  if (t1 - t0 < 1e-9) return null;
  return [[a[0] + t0 * dx, a[1] + t0 * dz], [a[0] + t1 * dx, a[1] + t1 * dz], t0, t1];
}
function couperLigne(l, h) { // → morceaux { l, debut, fin } (debut/fin : la ligne continue au-delà du carré)
  const res = []; let cur = null;
  for (let i = 0; i + 1 < l.length; i++) {
    const s = couperSeg(l[i], l[i + 1], h);
    if (!s) { if (cur) { res.push(cur); cur = null; } continue; }
    if (!cur) cur = { l: [s[0]], debut: s[2] > 0 || i > 0, fin: false };
    cur.l.push(s[1]);
    if (s[3] < 1) { cur.fin = true; res.push(cur); cur = null; }
  }
  if (cur) res.push(cur);
  return res.filter((m) => m.l.length >= 2);
}
function dp(l, eps) { // Douglas-Peucker (polyligne ouverte)
  if (l.length < 3) return l.slice();
  const garde = new Uint8Array(l.length), pile = [[0, l.length - 1]]; garde[0] = garde[l.length - 1] = 1;
  while (pile.length) {
    const [i, j] = pile.pop(); let m = -1, dm = eps;
    for (let k = i + 1; k < j; k++) { const d = distSeg(l[k][0], l[k][1], l[i][0], l[i][1], l[j][0], l[j][1]); if (d > dm) { dm = d; m = k; } }
    if (m >= 0) { garde[m] = 1; pile.push([i, m], [m, j]); }
  }
  return l.filter((_, k) => garde[k]);
}
function dpAnneau(p, eps) { // anneau : coupé en deux au sommet le plus loin du premier
  if (p.length <= 4) return p.slice();
  let m = 0, dm = -1; for (let k = 1; k < p.length; k++) { const d = dist(p[k], p[0]); if (d > dm) { dm = d; m = k; } }
  const a = dp(p.slice(0, m + 1), eps), b = dp(p.slice(m).concat([p[0]]), eps);
  return a.concat(b.slice(1, -1));
}
function nettoyer(p, ferme = true) { // arrondi au décimètre, sans doublons ni points alignés
  const q = [];
  for (const v of p) { const w = [r1(v[0]), r1(v[1])], d = q[q.length - 1]; if (!d || d[0] !== w[0] || d[1] !== w[1]) q.push(w); }
  if (!ferme) return q;
  while (q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop();
  for (let change = true; change && q.length > 3;) {
    change = false;
    for (let i = 0; i < q.length && q.length > 3; i++) {
      const a = q[(i + q.length - 1) % q.length], b = q[i], c = q[(i + 1) % q.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6) { q.splice(i, 1); change = true; i--; }
    }
  }
  return q;
}
function croise(a, b, c, d) { // ab et cd se coupent franchement
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
function simple(p) {
  const n = p.length; if (n < 3 || Math.abs(aire(p)) < 1e-6) return false;
  const B = []; for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; B.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]); }
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (boitesSeCroisent(B[i], B[j]) && croise(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return false;
  }
  return true;
}
function enveloppe(p) { // enveloppe convexe (chaîne monotone)
  const q = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const bas = [], haut = [];
  for (const v of q) { while (bas.length >= 2 && cr(bas[bas.length - 2], bas[bas.length - 1], v) <= 0) bas.pop(); bas.push(v); }
  for (let i = q.length - 1; i >= 0; i--) { const v = q[i]; while (haut.length >= 2 && cr(haut[haut.length - 2], haut[haut.length - 1], v) <= 0) haut.pop(); haut.push(v); }
  return bas.slice(0, -1).concat(haut.slice(0, -1));
}
function polygone(brut, eps, h, minAire) { // coupé au carré, simplifié, valide → p | null (enveloppe convexe en dernier recours, comptée)
  const p = nettoyer(couperPoly(brut, h)); if (p.length < 3 || Math.abs(aire(p)) < minAire) return null;
  let s = nettoyer(dpAnneau(p, eps)); if (s.length >= 3 && simple(s) && Math.abs(aire(s)) >= minAire) return s;
  if (simple(p)) return p;
  RAPPORT.enveloppes++; s = nettoyer(enveloppe(p));
  return s.length >= 3 ? s : null;
}
function echantillons(p, pas) { const b = boite(p), r = []; for (let x = b[0] + pas / 2; x < b[2]; x += pas) for (let z = b[1] + pas / 2; z < b[3]; z += pas) if (dedans(x, z, p)) r.push([x, z]); if (!r.length) r.push(centroide(p)); return r; }
function distPolys(A, B) { // 0 si l'un touche l'autre
  for (const q of A) if (dedans(q[0], q[1], B)) return 0;
  for (const q of B) if (dedans(q[0], q[1], A)) return 0;
  let d = Infinity; for (const q of A) d = Math.min(d, distBord(q[0], q[1], B)); for (const q of B) d = Math.min(d, distBord(q[0], q[1], A));
  return d;
}
function tampon(l, w) { // polygone autour d'une polyligne : largeur w, ou demi-largeur par sommet si w est un tableau (onglets bornés)
  const n = l.length, G = [], D = [], R = (i) => Array.isArray(w) ? w[i] : w / 2;
  const nor = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], d = Math.hypot(dx, dz) || 1; return [-dz / d, dx / d]; };
  for (let i = 0; i < n; i++) {
    const n1 = i > 0 ? nor(l[i - 1], l[i]) : null, n2 = i < n - 1 ? nor(l[i], l[i + 1]) : null;
    let m = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : (n1 || n2); const lm = Math.hypot(m[0], m[1]);
    if (lm < 1e-6) m = n1; else m = [m[0] / lm, m[1] / lm];
    const c = n1 && n2 ? Math.max(0.5, m[0] * n1[0] + m[1] * n1[1]) : 1;
    const r = R(i); G.push([l[i][0] + m[0] * r / c, l[i][1] + m[1] * r / c]); D.push([l[i][0] - m[0] * r / c, l[i][1] - m[1] * r / c]);
  }
  return G.concat(D.reverse());
}
function tamponsValides(l, w, h) { // découpe la ligne tant que son tampon se recoupe (w : largeur, ou demi-largeurs par sommet)
  const p0 = nettoyer(couperPoly(tampon(l, w), h)), p = p0.length > 8 ? nettoyer(dpAnneau(p0, 0.4)) : p0;
  if (p.length >= 3 && simple(p)) return [p];
  if (p0.length >= 3 && simple(p0)) return [p0];
  if (l.length <= 2) { const e = nettoyer(enveloppe(p0)); return e.length >= 3 ? [e] : []; }
  const m = Math.floor(l.length / 2), part = (a, b) => Array.isArray(w) ? w.slice(a, b) : w;
  return tamponsValides(l.slice(0, m + 1), part(0, m + 1), h).concat(tamponsValides(l.slice(m), part(m), h));
}
function densifier(l, pas) { const r = [l[0]]; for (let i = 1; i < l.length; i++) { const a = l[i - 1], b = l[i], k = Math.max(1, Math.ceil(dist(a, b) / pas)); for (let j = 1; j <= k; j++) r.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k]); } return r; }
function rectangle(p) { // rectangle d'aire minimale → { l: [a, b] (grand axe), w (petit côté) }
  const hull = enveloppe(p); let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length], d = dist(a, b); if (d < 1e-6) continue;
    const ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d; let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const q of hull) { const s = q[0] * ux + q[1] * uz, t = -q[0] * uz + q[1] * ux; s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const ar = (s1 - s0) * (t1 - t0); if (!best || ar < best.ar) best = { ar, ux, uz, s0, s1, t0, t1 };
  }
  if (!best) return null;
  const { ux, uz, s0, s1, t0, t1 } = best, ls = s1 - s0, lt = t1 - t0, sm = (s0 + s1) / 2, tm = (t0 + t1) / 2, cx = sm * ux - tm * uz, cz = sm * uz + tm * ux;
  if (ls >= lt) return { l: [[cx - ux * ls / 2, cz - uz * ls / 2], [cx + ux * ls / 2, cz + uz * ls / 2]], w: lt };
  return { l: [[cx + uz * lt / 2, cz - ux * lt / 2], [cx - uz * lt / 2, cz + ux * lt / 2]], w: ls };
}
function intersection(a, b, c, d) { // point d'intersection des segments ab et cd | null
  const rx = b[0] - a[0], rz = b[1] - a[1], sx = d[0] - c[0], sz = d[1] - c[1], den = rx * sz - rz * sx; if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * rx, a[1] + t * rz] : null;
}
function grille(T) { // index spatial grossier : cellules de T m
  const m = new Map(), k = (i, j) => i + ',' + j;
  return {
    ajouter(b, o) { for (let i = Math.floor(b[0] / T); i <= Math.floor(b[2] / T); i++) for (let j = Math.floor(b[1] / T); j <= Math.floor(b[3] / T); j++) { const c = k(i, j); if (!m.has(c)) m.set(c, []); m.get(c).push(o); } },
    autour(x, z, r) { const vus = new Set(); for (let i = Math.floor((x - r) / T); i <= Math.floor((x + r) / T); i++) for (let j = Math.floor((z - r) / T); j <= Math.floor((z + r) / T); j++) for (const o of m.get(k(i, j)) || []) vus.add(o); return vus; },
  };
}
function mulberry32(a) { a = a >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ─── OSM : éléments Overpass (out body geom) → objets en xz { id, tags, pt, lignes, polys, trous } ───
function anneaux(chaines) { // joint les chemins bout à bout ; ce qui reste ouvert (coupé par la bbox) est joint au bout le plus proche
  const egal = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  const reste = chaines.filter((c) => c.length >= 2).map((c) => c.slice()), fermes = [], ouverts = [];
  while (reste.length) {
    let cur = reste.shift();
    for (let progres = true; progres && !egal(cur[0], cur[cur.length - 1]);) {
      progres = false;
      for (let k = 0; k < reste.length; k++) {
        const s = reste[k], f = cur[cur.length - 1];
        if (egal(f, s[0])) cur = cur.concat(s.slice(1)); else if (egal(f, s[s.length - 1])) cur = cur.concat(s.slice(0, -1).reverse());
        else if (egal(cur[0], s[s.length - 1])) cur = s.concat(cur.slice(1)); else if (egal(cur[0], s[0])) cur = s.slice().reverse().concat(cur.slice(1));
        else continue;
        reste.splice(k, 1); progres = true; break;
      }
    }
    if (egal(cur[0], cur[cur.length - 1])) { if (cur.length >= 4) fermes.push(cur.slice(0, -1)); } else ouverts.push(cur);
  }
  while (ouverts.length) {
    let cur = ouverts.shift();
    while (ouverts.length) {
      const f = cur[cur.length - 1]; let best = -1, bd = dist(f, cur[0]), inv = false;
      ouverts.forEach((s, k) => { const d0 = dist(f, s[0]), d1 = dist(f, s[s.length - 1]); if (d0 < bd) { bd = d0; best = k; inv = false; } if (d1 < bd) { bd = d1; best = k; inv = true; } });
      if (best < 0) break;
      const s = ouverts.splice(best, 1)[0]; cur = cur.concat(inv ? s.slice().reverse() : s);
    }
    if (cur.length >= 3) { fermes.push(cur); RAPPORT.anneauxOuverts = (RAPPORT.anneauxOuverts || 0) + 1; }
  }
  return fermes;
}
function formes(elements, R) {
  const res = [], xz = (g) => R.xz(g.lat, g.lon);
  const chaines = (geom) => { const out = []; let cur = []; for (const g of geom || []) { if (g && g.lat != null) cur.push(xz(g)); else { if (cur.length >= 2) out.push(cur); cur = []; } } if (cur.length >= 2) out.push(cur); return out; };
  for (const e of elements) {
    const o = { id: e.type[0] + e.id, type: e.type, tags: e.tags || {}, lignes: [], polys: [], trous: [] };
    if (e.type === 'node') { if (e.lat == null) continue; o.pt = xz(e); }
    else if (e.type === 'way') {
      const ch = chaines(e.geometry); if (!ch.length) continue; o.lignes = ch;
      if (e.nodes && e.nodes.length >= 4 && e.nodes[0] === e.nodes[e.nodes.length - 1]) o.polys = ch.length === 1 ? (ch[0].length >= 4 ? [ch[0].slice(0, -1)] : []) : anneaux(ch);
    } else if (e.type === 'relation') {
      const ext = [], int = [];
      for (const m of e.members || []) if (m.type === 'way' && m.geometry) for (const c of chaines(m.geometry)) (m.role === 'inner' ? int : ext).push(c);
      if (/^(multipolygon|boundary)$/.test(o.tags.type || '')) { o.polys = anneaux(ext); o.trous = anneaux(int); } else o.lignes = ext.concat(int);
      if (!o.polys.length && !o.lignes.length) continue;
    } else continue;
    if (!o.pt) o.pt = o.polys.length ? centroide(o.polys[0]) : o.lignes[0][Math.floor(o.lignes[0].length / 2)];
    res.push(o);
  }
  return res;
}
const NOM_AIN = /^(l['’ ]\s*)?ain$|^rivi[eè]re d['’ ]\s*ain$/i, NOM_VEYRON = /veyron/i;
function procheDeLigne(o, q) { let best = null, bd = Infinity; for (const l of o.lignes) for (let i = 0; i + 1 < l.length; i++) { const a = l[i], b = l[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], d2 = dx * dx + dz * dz; const t = d2 ? clamp(((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / d2, 0, 1) : 0; const p = [a[0] + t * dx, a[1] + t * dz], d = dist(p, q); if (d < bd) { bd = d; best = p; } } return best ? { pt: best, d: bd } : null; }

// ─── 1. découvrir : où sont la mairie, l'église, le château, la place, l'Ain et le Veyron ? ───
async function decouvrir() {
  const { lat, lon } = CONFIG.approx, R0 = repere(lat, lon), A = `(around:2000,${lat},${lon})`;
  const q = `[out:json][timeout:90];
nwr(around:600,${lat},${lon})->.voisins;
(
  node[place][name="Poncin"](around:5000,${lat},${lon});
  nwr[historic=castle]${A};
  nwr[amenity~"^(townhall|place_of_worship)$"]${A};
  nwr[place=square]${A};
  nwr.voisins[name~"^Place "];
  way[waterway~"^(river|stream)$"]${A};
);
out body geom;`;
  let objets = [];
  try { objets = formes((await overpass(q, 'découverte')).elements, R0); } catch (e) {
    let prec = null; try { prec = JSON.parse(fs.readFileSync(path.join(SORTIE, 'poncin.json'), 'utf8')); } catch (e2) { /* pas de carte précédente */ }
    if (prec && prec.origine && prec.taille && CONFIG.centre === 'auto') { // mieux vaut le cadrage déjà validé que le point approché
      repli(`découverte impossible (${e.message.slice(0, 160)}) : centre et taille de la carte précédente (${prec.origine.lat}, ${prec.origine.lon}, ${prec.taille} m)`);
      return { lat: prec.origine.lat, lon: prec.origine.lon, taille: prec.taille };
    }
    repli(`découverte impossible (${e.message.slice(0, 160)}) : centre approché ${lat}, ${lon}`);
  }
  const cap = (q2) => { const a = Math.atan2(q2[0], -q2[1]) / RAD; return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(((a + 360) % 360) / 45) % 8]; };
  const cat = (t) => t.historic === 'castle' ? 'château' : t.amenity === 'townhall' ? 'mairie' : t.amenity === 'place_of_worship' ? 'culte' : t.place === 'square' || /^place /i.test(t.name || '') ? 'place' : t.waterway === 'river' ? 'rivière' : t.waterway ? 'ruisseau' : t.place ? 'lieu' : '?';
  console.log(`\n── Découverte autour de ${lat}, ${lon} (${objets.length} objets) ──`);
  const vus = new Set();
  for (const o of objets) {
    const n = o.tags.name || '(sans nom)', w = !!o.tags.waterway, k = cat(o.tags) + '|' + n; if (w && vus.has(k)) continue; vus.add(k);
    const p = w ? (procheDeLigne(o, [0, 0]) || { pt: o.pt }).pt : o.pt;
    console.log(`  ${cat(o.tags).padEnd(9)} ${n.slice(0, 40).padEnd(41)} ${String(Math.round(Math.hypot(p[0], p[1]))).padStart(5)} m ${cap(p).padEnd(2)} (${o.id})`);
  }
  const parDist = (l, ref, max) => l.map((o) => [o, dist(o.pt, ref)]).filter(([, d]) => d <= max).sort((a, b) => a[1] - b[1]).map(([o]) => o);
  const de = (f) => objets.filter((o) => f(o.tags));
  const mairie = parDist(de((t) => t.amenity === 'townhall'), [0, 0], 900)[0] || null, ref = mairie ? mairie.pt : [0, 0];
  const eglise = parDist(de((t) => t.amenity === 'place_of_worship'), ref, 700)[0] || null;
  const chateau = parDist(de((t) => t.historic === 'castle'), ref, 1300)[0] || null;
  const place = parDist(de((t) => t.place === 'square'), ref, 500)[0] || parDist(objets.filter((o) => /^place /i.test(o.tags.name || '') && o.polys.length), ref, 220)[0] || null;
  const riviere = (re) => { let best = null; for (const o of de((t) => t.waterway && re.test(t.name || ''))) { const p = procheDeLigne(o, ref); if (p && (!best || p.d < best.d)) best = Object.assign(p, { o }); } return best && best.d < 1500 ? best : null; };
  const ain = riviere(NOM_AIN), veyron = riviere(NOM_VEYRON);
  let confluence = null;
  if (ain && veyron) { let bd = Infinity; for (const o of de((t) => t.waterway && NOM_VEYRON.test(t.name || ''))) for (const l of o.lignes) for (const q2 of l) { if (dist(q2, ref) > 900) continue; const p = procheDeLigne(ain.o, q2); if (p && p.d < bd) { bd = p.d; confluence = q2; } } }
  // ce qu'il faut couvrir, avec une marge : la place de l'arène (rayon 110 m), l'église, le château vu de dehors, les berges
  const couvrir = [];
  const placeArene = place ? place.pt : ref;
  couvrir.push([placeArene, 122, 'place / arène'], [ref, 60, 'mairie']);
  if (eglise) couvrir.push([eglise.pt, 40, 'église']);
  if (chateau) { const pts = chateau.polys.length ? chateau.polys[0] : [chateau.pt]; for (const q2 of pts) couvrir.push([q2, 40, 'château']); }
  if (ain) couvrir.push([ain.pt, 60, 'Ain']);
  if (veyron) couvrir.push([veyron.pt, 30, 'Veyron']);
  if (confluence) couvrir.push([confluence, 30, 'confluence']);
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [q2, m] of couvrir) { b[0] = Math.min(b[0], q2[0] - m); b[1] = Math.min(b[1], q2[1] - m); b[2] = Math.max(b[2], q2[0] + m); b[3] = Math.max(b[3], q2[1] + m); }
  let taille = CONFIG.tailleMin, cx = 0, cz = 0;
  if (couvrir.length && isFinite(b[0])) {
    const ext = Math.max(b[2] - b[0], b[3] - b[1]);
    taille = clamp(Math.ceil(ext / 50) * 50, CONFIG.tailleMin, CONFIG.tailleMax); cx = (b[0] + b[2]) / 2; cz = (b[1] + b[3]) / 2;
    const lib = taille / 2 - 122; // la place de l'arène reste dans le carré
    cx = clamp(cx, placeArene[0] - lib, placeArene[0] + lib); cz = clamp(cz, placeArene[1] - lib, placeArene[1] + lib);
    if (ext > CONFIG.tailleMax) alerte(`il faudrait ${Math.ceil(ext)} m pour tout couvrir : carré borné à ${taille} m`);
  }
  let [clat, clon] = R0.ll(cx, cz);
  if (CONFIG.centre && typeof CONFIG.centre === 'object') { clat = +CONFIG.centre.lat; clon = +CONFIG.centre.lon; log('centre imposé par poncin.config.json'); }
  if (typeof CONFIG.taille === 'number') { taille = CONFIG.taille; log('taille imposée par poncin.config.json'); }
  taille = Math.round(taille / CONFIG.pasRelief) * CONFIG.pasRelief; clat = +clat.toFixed(6); clon = +clon.toFixed(6);
  const R = repere(clat, clon);
  console.log('  choix :');
  for (const [n, o] of [['mairie', mairie], ['église', eglise], ['château', chateau], ['place', place]]) console.log(`    ${n.padEnd(8)} ${o ? (o.tags.name || '(sans nom)') + ' (' + o.id + ')' : 'introuvable'}`);
  for (const [n, o] of [['Ain', ain], ['Veyron', veyron]]) console.log(`    ${n.padEnd(8)} ${o ? `${o.o.tags.name}, à ${Math.round(o.d)} m de la mairie` : 'introuvable'}`);
  const hors = couvrir.filter(([q2, , n]) => { const [la, lo] = R0.ll(q2[0], q2[1]), p = R.xz(la, lo); return Math.abs(p[0]) > taille / 2 || Math.abs(p[1]) > taille / 2; }).map((c) => c[2]);
  console.log(`  → centre ${clat}, ${clon} ; carré de ${taille} m${hors.length ? ' ; hors du carré : ' + [...new Set(hors)].join(', ') : ' ; tout est couvert'}\n`);
  RAPPORT.decouverte = { mairie: mairie && mairie.tags.name, eglise: eglise && eglise.tags.name, chateau: chateau && chateau.tags.name, place: place && place.tags.name, ain: !!ain, veyron: !!veyron, hors };
  return { lat: clat, lon: clon, taille };
}

// ─── 2. OpenStreetMap ───
async function etapeOSM(R, L) {
  const h = L / 2 + 60, [n, w] = R.ll(-h, -h), [s, e] = R.ll(h, h), bb = [s, w, n, e].map((v) => v.toFixed(6)).join(',');
  const q = `[out:json][timeout:180][bbox:${bb}];
(
  nwr[building]; nwr["building:part"];
  way[highway];
  way[waterway]; nwr[natural=water]; nwr[water]; nwr[waterway=riverbank];
  nwr[landuse]; nwr[leisure];
  nwr[natural~"^(wood|scrub|grassland|heath)$"]; node[natural=tree]; way[natural=tree_row];
  nwr[historic]; nwr[amenity]; way[barrier]; nwr[man_made~"^(bridge|tower)$"]; nwr[access=private];
  node[place]; way[place]; nwr[tourism]; nwr[shop]; node[name];
);
out body geom;`;
  const objets = formes((await overpass(q, 'OSM')).elements, R);
  log(`OSM : ${objets.length} objets (${objets.filter((o) => o.tags.building).length} bâtiments, ${objets.filter((o) => o.tags.highway).length} voies)`);
  return objets;
}

// ─── 3. BD TOPO (WFS) : emprises et hauteurs des bâtiments ───
async function etapeBDTOPO(R, L) {
  const h = L / 2 + 20, [n, w] = R.ll(-h, -h), [s, e] = R.ll(h, h);
  let couche = CONFIG.coucheBati;
  try {
    const caps = (await telecharger(`${CONFIG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`, { delai: 180000, valider: (b) => /WFS_Capabilities/.test(b.toString('utf8', 0, 4000)) ? true : 'pas des capacités WFS' })).toString('utf8');
    const noms = [...caps.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((m) => m[1].trim());
    if (noms.includes(couche)) log(`BD TOPO : couche ${couche} confirmée par GetCapabilities (${noms.length} couches)`);
    else { const autre = noms.find((x) => /bdtopo/i.test(x) && /:batiment$/i.test(x)); if (autre) { log(`BD TOPO : ${couche} absente, on prend ${autre}`); couche = autre; } else alerte(`BD TOPO : ${couche} absente des capacités (${noms.length} couches) : on essaie quand même`); }
  } catch (e) { alerte(`WFS GetCapabilities : ${e.message.slice(0, 200)}`); }
  RAPPORT.sources.bdtopo = couche;
  const page = CONFIG.pageWfs, f6 = (v) => v.toFixed(6);
  for (const ordre of ['lat,lon', 'lon,lat']) {
    const bbox = ordre === 'lat,lon' ? `${f6(s)},${f6(w)},${f6(n)},${f6(e)},urn:ogc:def:crs:EPSG::4326` : `${f6(w)},${f6(s)},${f6(e)},${f6(n)},urn:ogc:def:crs:EPSG::4326`;
    const feats = [], ids = new Set(); let debut = 0, pages = 0;
    for (;;) {
      const url = `${CONFIG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${encodeURIComponent(couche)}&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&BBOX=${bbox}&COUNT=${page}&STARTINDEX=${debut}`;
      const j = JSON.parse((await telecharger(url, { delai: 120000, valider: jsonOk((j2) => Array.isArray(j2.features) ? true : 'pas de features') })).toString('utf8'));
      for (const f of j.features) { const id = f.id || (f.properties && f.properties.cleabs) || JSON.stringify(f.geometry).slice(0, 80); if (!ids.has(id)) { ids.add(id); feats.push(f); } }
      pages++; if (j.features.length < page || pages >= 80) break; debut += page;
    }
    if (!feats.length) { log(`BD TOPO : aucun bâtiment avec la BBOX en ${ordre} : on essaie l'autre ordre`); continue; }
    // l'ordre des axes des coordonnées rendues (latitude ≈ 46, longitude ≈ 5,4 : on les reconnaît)
    let s0 = 0, k = 0; for (const f of feats.slice(0, 50)) { const c = premiereCoord(f.geometry); if (c) { s0 += c[0]; k++; } }
    const latPremier = Math.abs(s0 / k - R.lat0) < Math.abs(s0 / k - R.lon0);
    const vers = (c) => latPremier ? R.xz(c[0], c[1]) : R.xz(c[1], c[0]);
    const res = [];
    for (const f of feats) {
      const g = f.geometry, pr = f.properties || {}; if (!g) continue;
      if (/projet|d[ée]moli/i.test(pr.etat_de_l_objet || '')) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      for (const pol of polys) if (pol[0] && pol[0].length >= 4) {
        const p = pol[0].slice(0, -1).map(vers);
        res.push({ p, props: { hauteur: pr.hauteur, nombre_d_etages: pr.nombre_d_etages, altitude_minimale_sol: pr.altitude_minimale_sol, nature: pr.nature, usage_1: pr.usage_1, cleabs: pr.cleabs } });
      }
    }
    log(`BD TOPO : ${feats.length} bâtiments en ${pages} page(s), BBOX en ${ordre}, coordonnées rendues en ${latPremier ? 'lat,lon' : 'lon,lat'}`);
    RAPPORT.sources.bdtopoAxes = latPremier ? 'lat,lon' : 'lon,lat'; RAPPORT.sources.bdtopoPages = pages;
    return res;
  }
  return [];
}
function premiereCoord(g) { let c = g && g.coordinates; while (Array.isArray(c) && Array.isArray(c[0])) c = c[0]; return Array.isArray(c) ? c : null; }

// ─── 4. relief : grille de 10 m (WMS-R en BIL 32 bits, sinon API altimétrique, sinon sol plat) ───
async function etapeAlti(R, L) {
  const pas = CONFIG.pasRelief, n = Math.round(L / pas) + 1, h = L / 2, noeuds = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) noeuds.push([-h + i * pas, -h + j * pas]);
  try {
    const g = await altiWMS(R, L), v = noeuds.map(([x, z]) => g(x, z));
    RAPPORT.sources.alti = 'wms-r'; return { pas, n, h: v.map(r1) };
  } catch (e) { alerte(`relief WMS-R : ${e.message.slice(0, 220)}`); }
  try {
    const v = await altiAPI(noeuds.map(([x, z]) => R.ll(x, z)));
    repli('relief par l’API altimétrique (points de 10 m, sans moyenne)'); RAPPORT.sources.alti = 'api'; return { pas, n, h: v.map(r1) };
  } catch (e) { alerte(`relief API : ${e.message.slice(0, 220)}`); }
  repli('relief indisponible : sol plat'); RAPPORT.sources.alti = 'plat';
  return { pas, n, h: new Array(n * n).fill(0) };
}
async function altiWMS(R, L) { // → g(x, z) : altitude moyennée sur 10 m autour du point
  let caps = null, base = null, derniere = null;
  for (const b0 of [CONFIG.wmsr, CONFIG.wmsr.replace(/\/$/, '') + '/wms']) { // le service répond selon les cas sur /wms-r ou /wms-r/wms
    try { caps = (await telecharger(`${b0}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`, { delai: 180000, essais: 3, valider: (b) => /WMS_Capabilities/.test(b.toString('utf8', 0, 6000)) ? true : 'pas des capacités WMS' })).toString('utf8'); base = b0; break; } catch (e) { derniere = e; alerte(`WMS-R ${b0} : ${e.message.slice(0, 160)}`); }
  }
  if (!caps) throw derniere;
  const noms = [...caps.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1].trim());
  const couche = noms.includes(CONFIG.coucheAlti) ? CONFIG.coucheAlti : noms.find((x) => /ELEVATIONGRIDCOVERAGE\.HIGHRES$/i.test(x)) || noms.find((x) => /ELEVATIONGRIDCOVERAGE/i.test(x));
  if (!couche) throw new Error(`aucune couche ELEVATIONGRIDCOVERAGE parmi ${noms.length}`);
  if (!/image\/x-bil;bits=32/i.test(caps)) alerte('WMS-R : le format image/x-bil;bits=32 n’est pas annoncé, on essaie quand même');
  log(`relief : couche ${couche}`);
  const m = 30, h = L / 2 + m, [n, w] = R.ll(-h, -h), [s, e] = R.ll(h, h), W = Math.min(2048, Math.ceil(2 * h / 2)), H = W;
  const url = `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${couche}&STYLES=&CRS=EPSG:4326&BBOX=${s.toFixed(7)},${w.toFixed(7)},${n.toFixed(7)},${e.toFixed(7)}&WIDTH=${W}&HEIGHT=${H}&FORMAT=${encodeURIComponent('image/x-bil;bits=32')}`;
  const buf = await telecharger(url, { delai: 120000, valider: (b) => b.length === W * H * 4 ? true : `${b.length} octets au lieu de ${W * H * 4} : ${b.toString('utf8', 0, 200).replace(/\s+/g, ' ')}` });
  const lire = (le) => { const v = new Float32Array(W * H); for (let i = 0; i < W * H; i++) v[i] = le ? buf.readFloatLE(i * 4) : buf.readFloatBE(i * 4); return v; };
  const plaus = (v) => { let k = 0; for (const x of v) if (x > -100 && x < 5000) k++; return k / v.length; };
  let v = lire(true), le = true; if (plaus(v) < 0.9) { const vb = lire(false); if (plaus(vb) > plaus(v)) { v = vb; le = false; } }
  if (plaus(v) < 0.6) throw new Error('BIL illisible (valeurs aberrantes)');
  let somme = 0, k = 0, mn = Infinity, mx = -Infinity; for (const x of v) if (x > -100 && x < 5000) { somme += x; k++; mn = Math.min(mn, x); mx = Math.max(mx, x); }
  const moy = somme / k; for (let i = 0; i < v.length; i++) if (!(v[i] > -100 && v[i] < 5000)) v[i] = moy;
  if (mx - mn > 900) throw new Error(`dénivelé invraisemblable (${mn}…${mx} m)`);
  log(`relief : ${W}×${H} px en ${le ? 'petit' : 'gros'}-boutiste, de ${mn.toFixed(1)} à ${mx.toFixed(1)} m`);
  const val = (lat, lon) => {
    const fx = clamp((lon - w) / (e - w) * W - 0.5, 0, W - 1.001), fy = clamp((n - lat) / (n - s) * H - 0.5, 0, H - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    return (v[j * W + i] * (1 - a) + v[j * W + i + 1] * a) * (1 - b) + (v[(j + 1) * W + i] * (1 - a) + v[(j + 1) * W + i + 1] * a) * b;
  };
  return (x, z) => { let t = 0; for (let dz = -4; dz <= 4; dz += 2) for (let dx = -4; dx <= 4; dx += 2) { const [la, lo] = R.ll(x + dx, z + dz); t += val(la, lo); } return t / 25; };
}
async function altiAPI(pts) { // pts [[lat, lon]] → altitudes (lots de 100 points, ≤ 5 requêtes/s)
  const res = new Array(pts.length).fill(NaN), lots = []; for (let i = 0; i < pts.length; i += 100) lots.push(i);
  await Promise.all(lots.map(async (i) => {
    const lot = pts.slice(i, i + 100);
    const url = `${CONFIG.altiApi}?lon=${lot.map((p) => p[1].toFixed(7)).join('|')}&lat=${lot.map((p) => p[0].toFixed(7)).join('|')}&resource=${CONFIG.ressourceAlti}&zonly=true&indent=false`;
    const j = JSON.parse((await telecharger(url, { cadence: 220, delai: 60000, valider: jsonOk((j2) => Array.isArray(j2.elevations) && j2.elevations.length === lot.length ? true : 'réponse inattendue') })).toString('utf8'));
    j.elevations.forEach((z, k) => { const v = typeof z === 'number' ? z : z && z.z; res[i + k] = v > -100 && v < 5000 ? v : NaN; });
  }));
  const ok = res.filter((v) => !isNaN(v)); if (ok.length < res.length * 0.6) throw new Error('trop de points sans altitude');
  const moy = ok.reduce((a, b) => a + b, 0) / ok.length; return res.map((v) => isNaN(v) ? moy : v);
}

// ─── 6. assembler : la carte v1 ───
const LARGEURS = { motorway: 10, trunk: 9, primary: 7.5, secondary: 7, tertiary: 6.5, primary_link: 6, secondary_link: 6, tertiary_link: 5.5, unclassified: 5.5, residential: 5.5, living_street: 5, pedestrian: 6, service: 3.5, road: 5, track: 3, footway: 1.8, path: 1.6, cycleway: 2.5, bridleway: 2, steps: 2 };
const largeurRue = (t) => { const w = parseFloat(t.width); return w >= 1 && w <= 30 ? w : (LARGEURS[t.highway] || 4); };
const typeRue = (hw) => /^(motorway|trunk|primary|secondary|tertiary)/.test(hw) ? 'route' : /^(track|footway|path|cycleway|bridleway|steps|corridor)$/.test(hw) ? 'chemin' : 'rue';
const RUES_EXCLUES = /^(proposed|construction|abandoned|platform|bus_stop|elevator|razed|disused|services|rest_area|via_ferrata)$/;
const TYPES_BATI = ['maison', 'eglise', 'chateau', 'mairie', 'tour', 'annexe', 'commerce'];
const COMMERCES = /^(restaurant|cafe|bar|pub|pharmacy|bank|post_office|fast_food|marketplace|ice_cream|bakery)$/;
function typeBati(b) {
  const t = b.tags, pr = b.props || {}, nat = String(pr.nature || '').toLowerCase(), us = String(pr.usage_1 || '').toLowerCase(), bt = t.building || '';
  if (b.chateau || /ch[âa]teau/.test(nat) || bt === 'castle' || t.historic === 'castle') return 'chateau';
  if (/[ée]glise|chapelle|cath[ée]drale/.test(nat) || /^(church|chapel|cathedral)$/.test(bt) || t.amenity === 'place_of_worship') return 'eglise';
  if (t.amenity === 'townhall' || bt === 'townhall') return 'mairie';
  if (/^tour|donjon/.test(nat) || bt === 'tower' || t.man_made === 'tower') return 'tour';
  if (t.shop || COMMERCES.test(t.amenity || '') || /^(commercial|retail|kiosk|supermarket)$/.test(bt) || /commercial/.test(us)) return 'commerce';
  if (/annexe/.test(us) || /^(garage|garages|shed|hut|carport|roof|cabin)$/.test(bt) || b.aire < 18) return 'annexe';
  return 'maison';
}
function hauteurBati(b) { // BD TOPO (hauteur, sinon étages·3+1), sinon OSM (height, building:levels), sinon 6 m
  const pr = b.props || {}, t = b.tags, hb = +pr.hauteur, eb = +pr.nombre_d_etages, ht = parseFloat(t.height), lv = parseFloat(t['building:levels']);
  const v = hb > 0 ? hb : eb > 0 ? eb * 3 + 1 : ht > 0 ? ht : lv > 0 ? lv * 3 + 1 : 6;
  return r1(clamp(v, 2.5, 50));
}
function assembler(R, L, objets, bdtopo, relief) {
  const h = L / 2, rnd = mulberry32(CONFIG.graine), dedansCarre = (q, m = 0) => Math.abs(q[0]) <= h - m && Math.abs(q[1]) <= h - m;
  const de = (f) => objets.filter((o) => f(o.tags, o));

  // ── bâtiments : BD TOPO d'abord, enrichis des tags OSM ; les bâtiments OSM ajoutés s'ils ne recouvrent rien ──
  const bats = [], idx = grille(20);
  const ajouterBati = (p, props, tags, src) => { const b = { p, props, tags: Object.assign({}, tags), src, aire: Math.abs(aire(p)), boite: boite(p) }; b.ech = echantillons(p, Math.max(0.7, Math.sqrt(b.aire) / 14)); bats.push(b); idx.ajouter(b.boite, b); return b; };
  for (const b of bdtopo) { const p = polygone(b.p, 0.3, h, 3); if (p) ajouterBati(p, b.props, {}, 'bdtopo'); }
  const nBD = bats.length; let nOSM = 0;
  const TAGS_UTILES = /^(name|building|amenity|historic|shop|man_made|height|building:levels|tourism|religion|tower:type)$/;
  const fusionTags = (b, t) => { for (const k in t) if (TAGS_UTILES.test(k) && (b.tags[k] == null || (k === 'building' && b.tags[k] === 'yes'))) b.tags[k] = t[k]; };
  const batisOSM = de((t) => (t.building && t.building !== 'no') || t['building:part']).sort((a, b) => (a.tags.building ? 0 : 1) - (b.tags.building ? 0 : 1));
  for (const o of batisOSM) for (const p0 of o.polys) {
    const p = polygone(p0, 0.3, h, 3); if (!p) continue;
    const ech = echantillons(p, Math.max(0.7, Math.sqrt(Math.abs(aire(p))) / 14)), bb = boite(p), cands = [...idx.autour((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 2)].filter((b) => boitesSeCroisent(b.boite, bb));
    let couverts = 0; for (const [x, z] of ech) if (cands.some((b) => dedans(x, z, b.p))) couverts++;
    if (couverts / ech.length > 0.15) { // déjà là (BD TOPO) : on lui passe les tags
      for (const b of cands) { const fb = b.ech.filter(([x, z]) => dedans(x, z, p)).length / b.ech.length; if (fb > 0.5) fusionTags(b, o.tags); }
    } else if (o.tags.building) { ajouterBati(p, null, o.tags, 'osm'); nOSM++; }
  }
  // les points d'intérêt (mairie, église, commerces…) posés sur le bâtiment qui les contient
  const contenant = (q, max) => { let best = null, bd = max; for (const b of idx.autour(q[0], q[1], max + 1)) { if (dedans(q[0], q[1], b.p)) return b; const d = distBord(q[0], q[1], b.p); if (d < bd) { bd = d; best = b; } } return best; };
  for (const o of de((t) => t.amenity || t.historic || t.shop || t.man_made === 'tower' || t.tourism)) {
    const t = o.tags, fort = t.amenity === 'townhall' || t.amenity === 'place_of_worship' || t.historic === 'castle';
    if (o.type === 'node' || !o.polys.length) { const b = contenant(o.pt, fort ? 12 : 1.5); if (b && !(t.building)) fusionTags(b, t); continue; }
    if (t.historic === 'castle' && !t.building) continue; // le domaine du château : traité plus bas
    if (t.building) continue; // déjà vu comme bâtiment
    for (const pol of o.polys) for (const b of idx.autour(...centroide(pol), Math.sqrt(Math.abs(aire(pol))) + 5)) if (b.ech.filter(([x, z]) => dedans(x, z, pol)).length / b.ech.length > 0.5) fusionTags(b, t);
  }
  // le château : le domaine historic=castle (ou le point) désigne ses plus grands bâtiments
  const chateaux = de((t) => t.historic === 'castle');
  let nomChateau = null;
  for (const o of chateaux) {
    nomChateau = nomChateau || o.tags.name || null;
    let dans = [];
    if (o.polys.length) for (const pol of o.polys) dans.push(...bats.filter((b) => boitesSeCroisent(b.boite, boite(pol)) && b.ech.filter(([x, z]) => dedans(x, z, pol)).length / b.ech.length > 0.5));
    else { const b = contenant(o.pt, 25); if (b) dans.push(b); }
    const deja = dans.filter((b) => typeBati(b) === 'chateau'); if (deja.length) { deja.forEach((b) => { b.tags.name = b.tags.name || o.tags.name; }); continue; }
    const amax = Math.max(0, ...dans.map((b) => b.aire)); for (const b of dans) if (b.aire >= amax * 0.35 && b.aire > 40) { b.chateau = true; b.tags.name = b.tags.name || o.tags.name; }
  }
  const batiments = bats.map((b) => { const t = typeBati(b), r = { p: b.p, h: hauteurBati(b), t }; if (/^(eglise|chateau|mairie)$/.test(t) && b.tags.name) r.n = b.tags.name; b.t = t; return r; });
  const compte = {}; for (const b of batiments) compte[b.t] = (compte[b.t] || 0) + 1;
  log(`bâtiments : ${batiments.length} (BD TOPO ${nBD}, OSM ajoutés ${nOSM}) ${JSON.stringify(compte)}`);

  // ── rues (et leurs sorties du carré, pour l'extraction) ──
  const rues = [], sorties = [];
  for (const o of de((t, o2) => t.highway && o2.type === 'way' && t.area !== 'yes' && !RUES_EXCLUES.test(t.highway))) {
    const t = o.tags, w = largeurRue(t), ty = typeRue(t.highway);
    for (const l0 of o.lignes) for (const m of couperLigne(l0, h)) {
      const l = nettoyer(dp(m.l, 1), false); if (l.length < 2) continue;
      const r = { l, w, t: ty }; if (t.name) r.n = t.name; rues.push(r);
      if (m.debut) sorties.push({ bout: l[0], suite: l, t: ty }); if (m.fin) sorties.push({ bout: l[l.length - 1], suite: l.slice().reverse(), t: ty });
    }
  }

  // ── eau : surfaces (natural=water…) puis rivières et ruisseaux en ligne, élargis là où aucune surface ne les couvre ──
  const eau = [], lignesEau = [];
  for (const o of de((t) => t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' || (t.water && t.natural !== 'wetland' && !t.amenity && !t.leisure))) {
    const t = o.tags; if (t.tunnel || t.covered === 'yes') continue;
    for (const p0 of o.polys) { const p = polygone(p0, 1, h, 10); if (!p) continue; const riv = /^(river|oxbow|canal)$/.test(t.water || '') || t.waterway === 'riverbank' || Math.abs(aire(p)) > 3000; eau.push({ p, t: riv ? 'riviere' : 'ruisseau', n: t.name }); }
  }
  const surfaces = eau.slice(), dansEau = (q) => surfaces.some((e) => dedans(q[0], q[1], e.p));
  const idxRues = grille(25); rues.forEach((r) => idxRues.ajouter(boite(r.l), r));
  const demiLargeurs = (run, w, ligne) => { // la rivière reste entre ses rives : jamais sur un bâtiment ni sur une voie qui la longe
    const traversent = new Set(rues.filter((r) => { for (let i = 0; i + 1 < ligne.length; i++) for (let k = 0; k + 1 < r.l.length; k++) if (intersection(ligne[i], ligne[i + 1], r.l[k], r.l[k + 1])) return true; return false; }));
    const r0 = run.map((q) => {
      let r = w / 2;
      for (const b of idx.autour(q[0], q[1], r + 1)) r = Math.min(r, dedans(q[0], q[1], b.p) ? 0 : distBord(q[0], q[1], b.p) - 0.6);
      for (const ru of idxRues.autour(q[0], q[1], r + 8)) if (!traversent.has(ru)) r = Math.min(r, distBord(q[0], q[1], ru.l, false) - ru.w / 2 - 0.4);
      return Math.max(1.2, r);
    });
    return r0.map((_, i) => { let t = 0, k = 0; for (let j = Math.max(0, i - 2); j <= Math.min(r0.length - 1, i + 2); j++) { t += r0[j]; k++; } return Math.min(r0[i] + 0.5, t / k); });
  };
  for (const o of de((t, o2) => o2.type === 'way' && /^(river|stream|canal|brook)$/.test(t.waterway || ''))) {
    const t = o.tags, souterrain = t.tunnel || t.covered === 'yes' || t.location === 'underground' || +t.layer < 0;
    const wl = parseFloat(t.width), w = wl >= 0.5 && wl <= 200 ? wl : t.waterway === 'river' ? 12 : t.waterway === 'canal' ? 8 : t.waterway === 'brook' ? 2 : 3;
    for (const l0 of o.lignes) for (const m of couperLigne(l0, h)) {
      const l = dp(m.l, 1), le = { l, n: t.name, w, souterrain, riviere: t.waterway === 'river', runs: [] }; lignesEau.push(le); if (souterrain) continue;
      const d = densifier(l, 3), couvert = d.map(dansEau), auBord = (q) => Math.max(Math.abs(q[0]), Math.abs(q[1])) > h - 0.05; let run = [];
      d.forEach((q, i) => { if (auBord(q) && !couvert[i]) couvert[i] = !!(couvert[i - 1] || couvert[i + 1]); }); // un point posé sur le bord du carré suit ses voisins
      const fin = () => { if (run.length >= 2) { const rr = demiLargeurs(run, w, l); le.runs.push({ l: run, r: rr }); for (const p of tamponsValides(run, rr, h)) if (Math.abs(aire(p)) > 2) eau.push({ p, t: t.waterway === 'river' ? 'riviere' : 'ruisseau', n: t.name, ligne: true }); } run = []; };
      d.forEach((q, i) => { if (!couvert[i]) { if (!run.length && i > 0) run.push(d[i - 1]); run.push(q); } else if (run.length) { run.push(q); fin(); } }); fin();
    }
  }

  // ── ponts : man_made=bridge (rectangle minimal) et voies bridge=yes ; ponts déduits là où une voie franchit un ruisseau élargi ──
  const ponts = [];
  const rectsPont = de((t) => t.man_made === 'bridge').flatMap((o) => o.polys.map((p) => ({ p, r: rectangle(p), n: o.tags.name || o.tags['bridge:name'] }))).filter((x) => x.r);
  for (const o of de((t, o2) => t.highway && o2.type === 'way' && t.bridge && t.bridge !== 'no')) {
    const wr = largeurRue(o.tags) + 1;
    for (const l0 of o.lignes) for (const m of couperLigne(l0, h)) {
      const l = dp(m.l, 0.5);
      for (let i = 0; i + 1 < l.length; i++) {
        let a = l[i], b = l[i + 1]; const d = dist(a, b); if (d < 1) continue; const ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d;
        if (i === 0) a = [a[0] - ux, a[1] - uz]; if (i + 2 === l.length) b = [b[0] + ux, b[1] + uz]; // un mètre de plus aux deux bouts
        const mil = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], rp = rectsPont.find((x) => dedans(mil[0], mil[1], x.p)); if (rp) rp.utilise = true;
        ponts.push({ l: [a, b].map((q) => [r1(clamp(q[0], -h, h)), r1(clamp(q[1], -h, h))]), w: r1(Math.max(wr, rp ? rp.r.w : 0)), n: o.tags.bridge_name || o.tags['bridge:name'] || (rp && rp.n) || null, voie: o.tags.name || null });
      }
    }
  }
  for (const x of rectsPont) if (!x.utilise && dedansCarre(centroide(x.p))) ponts.push({ l: x.r.l.map((q) => [r1(clamp(q[0], -h, h)), r1(clamp(q[1], -h, h))]), w: r1(Math.max(2, x.r.w)), n: x.n || null });
  const surPontCapsule = (q, m = 0) => ponts.some((p) => distSeg(q[0], q[1], p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2 + m);
  let deduits = 0;
  for (const le of lignesEau) if (!le.souterrain) for (const r of rues) for (let i = 0; i + 1 < le.l.length; i++) for (let k = 0; k + 1 < r.l.length; k++) {
    const X = intersection(le.l[i], le.l[i + 1], r.l[k], r.l[k + 1]); if (!X || surPontCapsule(X, 2)) continue;
    if (le.riviere && surfaces.some((e) => dedans(X[0], X[1], e.p))) continue; // une grande rivière sans pont tagué : on ne l'invente pas
    const a = r.l[k], b = r.l[k + 1], d = dist(a, b), ux = (b[0] - a[0]) / d, uz = (b[1] - a[1]) / d, demi = le.w / 2 + 2.5;
    ponts.push({ l: [[r1(clamp(X[0] - ux * demi, -h, h)), r1(clamp(X[1] - uz * demi, -h, h))], [r1(clamp(X[0] + ux * demi, -h, h)), r1(clamp(X[1] + uz * demi, -h, h))]], w: r1(Math.max(2.5, r.w + 0.5)), n: null, deduit: true, voie: r.n || null, cours: le.n || null });
    deduits++;
  }

  let allonges = 0; // un pont tagué plus court que la rivière élargie qu'il franchit est allongé (sinon la voie serait coupée)
  for (const p of ponts) for (const le of lignesEau) for (const run of le.runs) for (let i = 0; i + 1 < run.l.length; i++) {
    const X = intersection(p.l[0], p.l[1], run.l[i], run.l[i + 1]); if (!X) continue;
    const L0 = dist(p.l[0], p.l[1]), ux = (p.l[1][0] - p.l[0][0]) / L0, uz = (p.l[1][1] - p.l[0][1]) / L0, sx = run.l[i + 1][0] - run.l[i][0], sz = run.l[i + 1][1] - run.l[i][1], ls = Math.hypot(sx, sz) || 1;
    const sinus = Math.max(0.35, Math.abs(ux * sz / ls - uz * sx / ls)), besoin = Math.min(40, Math.max(run.r[i], run.r[i + 1]) / sinus + 1.5);
    const a = dist(X, p.l[0]), b = dist(X, p.l[1]); if (a >= besoin && b >= besoin) continue;
    if (a < besoin) p.l[0] = [r1(clamp(X[0] - ux * besoin, -h, h)), r1(clamp(X[1] - uz * besoin, -h, h))];
    if (b < besoin) p.l[1] = [r1(clamp(X[0] + ux * besoin, -h, h)), r1(clamp(X[1] + uz * besoin, -h, h))];
    allonges++;
  }

  // ── végétation ──
  const typeVeg = (t) => t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub' ? 'bois' : t.landuse === 'vineyard' ? 'vigne'
    : t.leisure === 'garden' || /^(allotments|orchard|plant_nursery)$/.test(t.landuse || '') ? 'jardin'
    : /^(meadow|grass|farmland|village_green|recreation_ground|greenfield)$/.test(t.landuse || '') || /^(grassland|heath)$/.test(t.natural || '') || t.leisure === 'park' ? 'pre' : null;
  const vegetation = [], bois = [];
  for (const o of objets) { const ty = typeVeg(o.tags); if (!ty) continue; for (const p0 of o.polys) { const p = polygone(p0, 1, h, 50); if (!p) continue; vegetation.push({ p, t: ty }); if (ty === 'bois') bois.push({ p, trous: o.trous }); } }

  // ── zone interdite : les jardins privés du château (access=private touchant historic=castle) ──
  const interdit = [], zonesChateau = chateaux.flatMap((o) => o.polys).concat(bats.filter((b) => b.t === 'chateau').map((b) => b.p));
  const nomInterdit = `${nomChateau || 'Château'} (propriété privée)`;
  for (const o of de((t) => t.access === 'private' && !t.highway && !t.building && !t.barrier)) for (const p0 of o.polys) {
    if (!zonesChateau.some((zc) => boitesSeCroisent(boite(zc), boite(p0), 3) && distPolys(zc, p0) <= 3)) continue;
    const p = polygone(p0, 1, h, 20); if (p) interdit.push({ p, n: nomInterdit });
  }
  RAPPORT.voisinageChateau = de((t, o) => o.polys.length && !t.building && !t.highway && zonesChateau.some((zc) => boitesSeCroisent(boite(zc), boite(o.polys[0]), 40) && distPolys(zc, o.polys[0]) <= 30)).map((o) => `${o.id} ${JSON.stringify(o.tags).slice(0, 140)} (${Math.round(Math.abs(aire(o.polys[0])))} m²)`);
  if (!interdit.length) for (const o of de((t) => (t.leisure === 'garden' || t.leisure === 'park' || t['garden:type']) && !t.highway && !t.building)) for (const p0 of o.polys) { // repli : les jardins qui touchent le château
    const a = Math.abs(aire(p0)); if (a > 60000 || !zonesChateau.some((zc) => boitesSeCroisent(boite(zc), boite(p0), 3) && distPolys(zc, p0) <= 3)) continue;
    const p = polygone(p0, 1, h, 20); if (p) { interdit.push({ p, n: nomInterdit }); repli(`zone interdite = le jardin ${o.id} qui touche le château (${Math.round(a)} m², aucun access=private tagué)`); }
  }
  if (!interdit.length) for (const o of chateaux) for (const p0 of o.polys) { // dernier repli : le domaine du château lui-même
    const p = polygone(p0, 1, h, 20), ab = bats.filter((b) => b.t === 'chateau').reduce((a, b) => a + b.aire, 0);
    if (p && Math.abs(aire(p)) > ab * 1.3) { interdit.push({ p, n: nomInterdit }); repli('zone interdite = le domaine historic=castle (aucun jardin privé tagué ne le touche)'); }
  }

  // ── arbres : OSM (natural=tree, tree_row), puis les bois semés ──
  const arbres = [], ht = (t) => { const v = parseFloat(t && t.height); return r1(v > 2 && v < 40 ? v : 6.5 + rnd() * 4); };
  for (const o of de((t, o2) => t.natural === 'tree' && o2.type === 'node')) if (dedansCarre(o.pt, 1)) arbres.push([r1(o.pt[0]), r1(o.pt[1]), ht(o.tags)]);
  for (const o of de((t) => t.natural === 'tree_row')) for (const l of o.lignes) for (const q of densifier(l, 7)) if (dedansCarre(q, 1)) arbres.push([r1(q[0]), r1(q[1]), ht(o.tags)]);
  const nArbresOSM = arbres.length;
  const obs = obstacles(L, batiments, interdit, eau, ponts), surRue = (q) => rues.some((r) => distBord(q[0], q[1], r.l, false) < r.w / 2 + 1.2);
  const { espacement: es, max: maxSemes } = CONFIG.arbresBois; let semes = 0;
  for (const b of bois) {
    const bb = boite(b.p);
    for (let x = bb[0] + es / 2; x < bb[2]; x += es) for (let z = bb[1] + es / 2; z < bb[3]; z += es) {
      if (semes >= maxSemes) break;
      const q = [x + (rnd() - 0.5) * es * 0.7, z + (rnd() - 0.5) * es * 0.7];
      if (!dedansCarre(q, 2) || !dedans(q[0], q[1], b.p) || b.trous.some((tr) => dedans(q[0], q[1], tr)) || !obs.libre(q[0], q[1], 1.5) || surRue(q)) continue;
      arbres.push([r1(q[0]), r1(q[1]), r1(7 + rnd() * 6)]); semes++;
    }
  }

  // ── noms (OSM name seulement : rien d'inventé) ──
  const noms = [];
  const nommer = (n, q, prio) => { if (n && q && dedansCarre(q, 2)) noms.push({ n, x: r1(q[0]), z: r1(q[1]), prio }); };
  for (const o of objets) {
    const t = o.tags; if (!t.name || (t.highway && !t.place) || t.waterway || /^\d/.test(t.name) || (t.tourism === 'information' && t.information !== 'office')) continue;
    const prio = t.amenity === 'townhall' || t.amenity === 'place_of_worship' || t.historic === 'castle' ? 0 : t.place === 'square' || t.place === 'village' || t.historic ? 1 : t.man_made === 'bridge' || t.natural === 'water' || t.amenity || t.tourism || t.leisure ? 2 : t.place || t.shop ? 3 : t.building ? 4 : 5;
    if (prio < 5) nommer(t.name, o.polys.length ? centroide(o.polys[0]) : o.pt, prio);
  }
  const parCours = {}; for (const le of lignesEau) if (le.n) (parCours[le.n] = parCours[le.n] || []).push(le);
  for (const n in parCours) { let best = null, bd = Infinity; for (const le of parCours[n]) for (const q of densifier(le.l, 10)) { const d = Math.hypot(q[0], q[1]) + (le.souterrain ? 1e4 : 0); if (dedansCarre(q, 8) && d < bd) { bd = d; best = q; } } nommer(n, best, 1); }
  for (const p of ponts) if (p.n) nommer(p.n, [(p.l[0][0] + p.l[1][0]) / 2, (p.l[0][1] + p.l[1][1]) / 2], 2);
  noms.sort((a, b) => a.prio - b.prio); // un nom une seule fois (le plus important), 90 au plus
  for (let i = noms.length - 1; i >= 0; i--) if (noms.findIndex((x) => x.n === noms[i].n) < i) noms.splice(i, 1);
  noms.length = Math.min(noms.length, 90);

  // ── zones de jeu ──
  const zones = calculerZones({ h, objets, bats, rues, ponts, sorties, obs, rnd });
  const an = new Date().getFullYear(), ign = ['BD ORTHO®', 'BD TOPO®', 'RGE ALTI®'].filter((x) => x !== 'RGE ALTI®' || RAPPORT.sources.alti !== 'plat');
  const carte = {
    v: 1, nom: 'Poncin', source: 'ign-osm', attribution: `© IGN ${an} – ${ign.join(', ')} · © contributeurs OpenStreetMap ${an}`,
    origine: { lat: R.lat0, lon: R.lon0 }, taille: L, relief,
    batiments, rues, eau: eau.map((e) => { const r = { p: e.p, t: e.t }; if (e.n) r.n = e.n; return r; }),
    ponts: ponts.map((p) => ({ l: p.l, w: p.w })), vegetation, arbres, interdit, noms: noms.map(({ n, x, z }) => ({ n, x, z })), sol: null, zones,
  };
  const mouilles = batiments.filter((b) => { const q = centroide(b.p); return eau.some((e) => dedans(q[0], q[1], e.p)); }).length;
  if (mouilles) alerte(`${mouilles} bâtiment(s) ont leur centre dans l’eau`);
  const info = { mouilles, obs, deduits, allonges, ponts, nArbresOSM, semes, nBD, nOSM, compte, lignesEau, nomChateau };
  return { carte, info };
}
function obstacles(L, batiments, interdit, eau, ponts) { // libre(x, z, marge) et degagement(x, z) : bâtiments, zones interdites, eau hors des ponts
  const h = L / 2, g = grille(12), tous = [];
  const ajouter = (p, estEau) => { const o = { p, b: boite(p), eau: estEau }; g.ajouter(o.b, o); tous.push(o); };
  batiments.forEach((b) => ajouter(b.p, false)); interdit.forEach((z) => ajouter(z.p, false)); eau.forEach((e) => ajouter(e.p, true));
  const surPont = (x, z) => ponts.some((p) => distSeg(x, z, p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2);
  function libre(x, z, m = 0.5) {
    if (Math.abs(x) > h - 2 - m || Math.abs(z) > h - 2 - m) return false;
    let pont = null;
    for (const o of g.autour(x, z, m)) {
      if (x < o.b[0] - m || x > o.b[2] + m || z < o.b[1] - m || z > o.b[3] + m) continue;
      if (dedans(x, z, o.p) || distBord(x, z, o.p) < m) { if (o.eau && (pont === null ? (pont = surPont(x, z)) : pont)) continue; return false; }
    }
    return true;
  }
  function degagement(x, z, max = 12) {
    let d = Math.min(max, h - 2 - Math.abs(x), h - 2 - Math.abs(z)); const pont = surPont(x, z);
    for (const o of g.autour(x, z, max)) { if (o.eau && pont) continue; if (dedans(x, z, o.p)) return 0; d = Math.min(d, distBord(x, z, o.p)); }
    return Math.max(0, d);
  }
  return { libre, degagement, surPont };
}
function calculerZones({ h, objets, bats, rues, ponts, sorties, obs, rnd }) {
  const A = CONFIG.arene, de = (f) => objets.filter((o) => f(o.tags, o)), centre = (o) => o.polys.length ? centroide(o.polys[0]) : o.pt;
  const dans = (q, m) => Math.abs(q[0]) <= h - m && Math.abs(q[1]) <= h - m;
  const accrocher = (q, m = 2, max = 40) => { // le point libre le plus proche (spirale)
    if (obs.libre(q[0], q[1], m)) return q;
    for (let r = 1; r <= max; r += 1) for (let k = 0, n = Math.ceil(2 * Math.PI * r / 1.5); k < n; k++) { const a = 2 * Math.PI * k / n, x = q[0] + r * Math.cos(a), z = q[1] + r * Math.sin(a); if (obs.libre(x, z, m)) return [x, z]; }
    return null;
  };
  const devant = (b) => { // l'espace dégagé devant un bâtiment (mairie, église)
    if (!b) return null; const c = centroide(b.p); let best = null, bs = -Infinity;
    for (let r = 4; r <= 40; r += 2) for (let k = 0; k < 24; k++) { const a = Math.PI * k / 12, q = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; if (!obs.libre(q[0], q[1], 1)) continue; const s = obs.degagement(q[0], q[1], 25) - 0.25 * r; if (s > bs) { bs = s; best = q; } }
    return best;
  };
  const mairie = bats.find((b) => b.t === 'mairie'), eglise = bats.find((b) => b.t === 'eglise');
  const refM = mairie ? centroide(mairie.p) : [0, 0];
  const places = de((t) => t.place === 'square').filter((o) => dans(centre(o), 30)).sort((a, b) => dist(centre(a), refM) - dist(centre(b), refM));
  const pietons = de((t, o) => t.highway === 'pedestrian' && o.polys.length && t.area === 'yes').filter((o) => dans(centre(o), 30));
  const nommees = de((t, o) => /^place\b/i.test(t.name || '') && t.place !== 'square' && (o.polys.length || o.type === 'node' || t.highway)).filter((o) => dans(centre(o), 30) && dist(centre(o), refM) < 220)
    .sort((a, b) => (a.polys.length ? 0 : 60) + dist(centre(a), refM) - (b.polys.length ? 0 : 60) - dist(centre(b), refM)); // les surfaces d'abord (place fermée, parking)
  let c = null, nomArene = null, origine = '';
  for (const [q, n, o2] of [...places.map((o) => [centre(o), o.tags.name, 'place=square']), ...nommees.map((o) => [centre(o), o.tags.name, 'place nommée ' + o.id]), ...pietons.map((o) => [centre(o), o.tags.name, 'zone piétonne']), [devant(mairie), 'devant la mairie', 'mairie'], [devant(eglise), 'devant l’église', 'église'], [[0, 0], null, 'centre']]) {
    if (!q) continue; const p = accrocher(q, 2.5, 30); if (p) { c = p; nomArene = n || null; origine = o2; break; }
  }
  if (!c) c = [0, 0];
  let rayon = A.rayon; const marge = h - 8 - Math.max(Math.abs(c[0]), Math.abs(c[1]));
  if (marge < rayon) { if (marge >= 80) rayon = marge; else { rayon = 90; const lim = h - 8 - rayon; c = accrocher([clamp(c[0], -lim, lim), clamp(c[1], -lim, lim)], 2.5, 30) || c; alerte('arène déplacée vers le centre pour tenir dans le carré'); } }
  // accessibilité : grille de 2 m, parcours en largeur depuis le centre
  const P = 2, n = Math.ceil(rayon / P), cote = 2 * n + 1, libre = new Uint8Array(cote * cote), atteint = new Uint8Array(cote * cote), pos = (i, j) => [c[0] + (i - n) * P, c[1] + (j - n) * P];
  for (let j = 0; j < cote; j++) for (let i = 0; i < cote; i++) { const q = pos(i, j); if (Math.hypot(q[0] - c[0], q[1] - c[1]) <= rayon - 3 && obs.libre(q[0], q[1], 0.5)) libre[j * cote + i] = 1; }
  let depart = -1, bd = Infinity; for (let k = 0; k < libre.length; k++) if (libre[k]) { const q = pos(k % cote, Math.floor(k / cote)), d = dist(q, c); if (d < bd) { bd = d; depart = k; } }
  const file = depart >= 0 ? [depart] : []; if (depart >= 0) atteint[depart] = 1;
  while (file.length) { const k = file.pop(), i = k % cote, j = Math.floor(k / cote); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i2 = i + di, j2 = j + dj; if (i2 < 0 || j2 < 0 || i2 >= cote || j2 >= cote) continue; const k2 = j2 * cote + i2; if (libre[k2] && !atteint[k2]) { if (di && dj && !(libre[j * cote + i2] && libre[j2 * cote + i])) continue; atteint[k2] = 1; file.push(k2); } } }
  const accessibles = []; for (let k = 0; k < atteint.length; k++) if (atteint[k]) accessibles.push(pos(k % cote, Math.floor(k / cote)));
  const loin = (cands, nb, depart2, deja = []) => { // tirage du plus éloigné (points bien répartis)
    const choix = [], dmin = cands.map((q) => Math.min(Infinity, ...deja.map((d) => dist(q, d)))); if (!cands.length) return choix;
    let k = depart2; while (choix.length < nb && k >= 0) { choix.push(cands[k]); const q = cands[k]; let bk = -1, bv = 0; cands.forEach((q2, i) => { dmin[i] = Math.min(dmin[i], dist(q2, q)); if (dmin[i] > bv) { bv = dmin[i]; bk = i; } }); k = bv > 3 ? bk : -1; }
    return choix;
  };
  const candApp = accessibles.filter((q) => dist(q, c) <= rayon - 6 && obs.libre(q[0], q[1], 1.4));
  const a0 = rnd() * 2 * Math.PI, cible = [c[0] + Math.cos(a0) * rayon * 0.6, c[1] + Math.sin(a0) * rayon * 0.6];
  let i0 = -1, d0 = Infinity; candApp.forEach((q, i) => { const d = dist(q, cible); if (d < d0) { d0 = d; i0 = i; } });
  const apparitions = loin(candApp, A.apparitions, i0);
  const candObj = accessibles.filter((q) => dist(q, c) <= rayon * 0.8 && obs.libre(q[0], q[1], 1.0) && apparitions.every((s) => dist(s, q) >= 7));
  let j0 = -1; d0 = Infinity; candObj.forEach((q, i) => { const d = dist(q, c); if (d < d0) { d0 = d; j0 = i; } });
  const pos8 = loin(candObj, A.objets, j0, apparitions).map((q) => ({ q, d: obs.degagement(q[0], q[1], 15) })).sort((a, b) => b.d - a.d);
  const ordre = { 8: ['precision', 'precision', 'soin', 'armure', 'soin', 'armure', 'pompe', 'pompe'], 7: ['precision', 'precision', 'soin', 'armure', 'armure', 'pompe', 'pompe'], 6: ['precision', 'soin', 'armure', 'soin', 'pompe', 'pompe'] }[pos8.length] || [];
  const armes = pos8.slice(0, ordre.length).map((o, i) => ({ x: r1(o.q[0]), z: r1(o.q[1]), arme: ordre[i] }));
  // extraction : les routes qui sortent du carré et les ponts
  const ext = [];
  const ajoutExt = (q) => { if (q && !ext.some((e) => dist(e, q) < 30)) ext.push(q); };
  for (const s of sorties.filter((s2) => s2.t !== 'chemin').concat(sorties.filter((s2) => s2.t === 'chemin'))) {
    const l = densifier(s.suite, 1); let q = null, parcours = 0;
    for (let i = 1; i < l.length; i++) { parcours += dist(l[i - 1], l[i]); if (parcours >= 8) { q = l[i]; break; } }
    if (q) ajoutExt(accrocher(q, 1, 8));
  }
  for (const p of ponts) ajoutExt(accrocher([(p.l[0][0] + p.l[1][0]) / 2, (p.l[0][1] + p.l[1][1]) / 2], 0.8, 4));
  ext.length = Math.min(ext.length, 12);
  // base : une autre place (ou une zone piétonne, un parking), sinon devant la mairie, sinon l'arène
  let base = null;
  for (const o of [...places, ...nommees.filter((o3) => o3.polys.length), ...pietons, ...de((t, o2) => t.amenity === 'parking' && o2.polys.length)]) { const q = centre(o); if (dans(q, 15) && dist(q, c) >= 60) { base = accrocher(q, 2, 25); if (base) break; } }
  if (!base && origine !== 'mairie') { const q = devant(mairie); if (q && dist(q, c) >= 30) base = accrocher(q, 2, 20); }
  if (!base) base = c;
  const z2 = (q) => [r1(q[0]), r1(q[1])];
  const arene = { centre: z2(c), rayon: r1(rayon) }; if (nomArene) arene.n = nomArene;
  RAPPORT.arene = `${nomArene || origine} (${origine}), centre [${z2(c)}], rayon ${r1(rayon)} m, ${accessibles.length * 4} m² accessibles`;
  if (apparitions.length < 16) alerte(`seulement ${apparitions.length} apparitions libres dans l’arène`);
  return { arene, apparitions: apparitions.map(z2), armes, extraction: ext.map(z2), base: z2(base) };
}

// ─── 5. ortho : tuiles WMTS BD ORTHO → sol-2048.jpg et sol-1024.jpg dans le repère local ───
async function etapeOrtho(R, L, batiments) {
  if (!JPEG) { repli('jpeg-js absent : pas de photo aérienne (sol peint)'); return null; }
  for (const z of [CONFIG.zoomOrtho, CONFIG.zoomOrtho - 1]) {
    try { return await ortho(R, L, batiments, z); } catch (e) { alerte(`ortho au zoom ${z} : ${e.message.slice(0, 220)}`); }
  }
  repli('photo aérienne indisponible : sol peint (carte.sol = null)'); return null;
}
async function ortho(R, L, batiments, z) {
  const N = CONFIG.sol[0], h = L / 2, M = 8;
  const [latN, lonO] = R.ll(-h - M, -h - M), [latS, lonE] = R.ll(h + M, h + M);
  const tx0 = Math.floor(MERC.px(lonO, z) / 256), tx1 = Math.floor(MERC.px(lonE, z) / 256), ty0 = Math.floor(MERC.py(latN, z) / 256), ty1 = Math.floor(MERC.py(latS, z) / 256);
  const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, MW = nx * 256, MH = ny * 256, mos = new Uint8Array(MW * MH * 3).fill(160);
  log(`ortho : zoom ${z}, ${nx}×${ny} = ${nx * ny} tuiles`);
  const taches = []; for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) taches.push([tx, ty]);
  let ko = 0;
  await Promise.all(taches.map(async ([tx, ty]) => {
    const url = `${CONFIG.wmts}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${CONFIG.coucheOrtho}&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILECOL=${tx}&TILEROW=${ty}&FORMAT=image/jpeg`;
    try {
      const buf = await telecharger(url, { delai: 60000, valider: (b) => b[0] === 0xFF && b[1] === 0xD8 ? true : `pas un JPEG : ${b.toString('utf8', 0, 160).replace(/\s+/g, ' ')}` });
      const im = JPEG.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 }); if (im.width !== 256 || im.height !== 256) throw new Error(`tuile de ${im.width}×${im.height}`);
      const ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const s = (j * 256 + i) * 4, d = ((oy + j) * MW + ox + i) * 3; mos[d] = im.data[s]; mos[d + 1] = im.data[s + 1]; mos[d + 2] = im.data[s + 2]; }
    } catch (e) { ko++; if (ko <= 3) alerte(`tuile ${tx},${ty} : ${e.message.slice(0, 160)}`); }
  }));
  if (ko > taches.length * 0.15) throw new Error(`${ko} tuiles manquantes sur ${taches.length}`);
  if (ko) alerte(`${ko} tuile(s) manquante(s) : gris neutre à leur place`);
  // rééchantillonnage 2×2 par pixel ; la longitude ne dépend que de x, la latitude que de z
  const S = 2, img = new Float32Array(N * N * 3), colX = new Float64Array(N * S), ligZ = new Float64Array(N * S);
  for (let k = 0; k < N * S; k++) { const v = -h + (k + 0.5) / (N * S) * L; colX[k] = clamp(MERC.px(R.lon0 + v / R.kx, z) - tx0 * 256 - 0.5, 0, MW - 1.001); ligZ[k] = clamp(MERC.py(R.lat0 - v / R.kz, z) - ty0 * 256 - 0.5, 0, MH - 1.001); }
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    let r = 0, g = 0, b = 0;
    for (let sv = 0; sv < S; sv++) for (let su = 0; su < S; su++) {
      const fx = colX[u * S + su], fy = ligZ[v * S + sv], i = fx | 0, j = fy | 0, a = fx - i, c = fy - j;
      const p00 = (j * MW + i) * 3, p10 = p00 + 3, p01 = p00 + MW * 3, p11 = p01 + 3, w00 = (1 - a) * (1 - c), w10 = a * (1 - c), w01 = (1 - a) * c, w11 = a * c;
      r += mos[p00] * w00 + mos[p10] * w10 + mos[p01] * w01 + mos[p11] * w11; g += mos[p00 + 1] * w00 + mos[p10 + 1] * w10 + mos[p01 + 1] * w01 + mos[p11 + 1] * w11; b += mos[p00 + 2] * w00 + mos[p10 + 2] * w10 + mos[p01 + 2] * w01 + mos[p11 + 2] * w11;
    }
    const o = (v * N + u) * 3; img[o] = r / 4; img[o + 1] = g / 4; img[o + 2] = b / 4;
  }
  const brut = ESSAI ? img.slice() : null;
  styliser(img, N, CONFIG.style);
  const masque = masqueBatiments(batiments, L, N), pave = CONFIG.style.pave;
  for (let k = 0; k < N * N; k++) { const m = masque[k]; if (!m) continue; const bruit = ((Math.imul(k ^ (k >>> 7), 2654435761) >>> 24) / 255 - 0.5) * 10, o = k * 3; for (let ch = 0; ch < 3; ch++) img[o + ch] = img[o + ch] * (1 - m) + (pave[ch] + bruit) * m; }
  fs.mkdirSync(SORTIE, { recursive: true });
  const fichiers = [];
  let im = img, n = N;
  for (const taille of CONFIG.sol) {
    while (n > taille) { im = reduire(im, n); n /= 2; }
    const nom = `sol-${taille}.jpg`, data = versJpeg(im, n, CONFIG.qualiteJpeg); fs.writeFileSync(path.join(SORTIE, nom), data); fichiers.push(nom);
    log(`ortho : ${nom} (${(data.length / 1024).toFixed(0)} Ko)`);
  }
  RAPPORT.sources.ortho = `${CONFIG.coucheOrtho} zoom ${z}, ${taches.length} tuiles`;
  return { sol: { image: fichiers[0], petite: fichiers[1] || fichiers[0] }, brut, final: img, N };
}
function flou3(img, N) { // flou 1-2-1 séparable, trois canaux
  const t = new Float32Array(img.length);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { const a = Math.max(0, u - 1), b = Math.min(N - 1, u + 1), o = (v * N + u) * 3; for (let c = 0; c < 3; c++) t[o + c] = (img[(v * N + a) * 3 + c] + 2 * img[o + c] + img[(v * N + b) * 3 + c]) / 4; }
  for (let v = 0; v < N; v++) { const a = Math.max(0, v - 1), b = Math.min(N - 1, v + 1); for (let u = 0; u < N; u++) { const o = (v * N + u) * 3; for (let c = 0; c < 3; c++) img[o + c] = (t[(a * N + u) * 3 + c] + 2 * t[o + c] + t[(b * N + u) * 3 + c]) / 4; } }
}
function styliser(img, N, st) { // un peu de pastel : adouci, saturation, chaleur, ombres relevées
  for (let k = 0; k < st.flou; k++) flou3(img, N);
  const f = (x) => (st.eclaircir + (1 - st.eclaircir) * Math.pow(clamp(x, 0, 1), st.gamma)) * 255;
  for (let i = 0; i < img.length; i += 3) {
    let r = img[i] / 255, g = img[i + 1] / 255, b = img[i + 2] / 255; const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * st.saturation + st.chaleur; g = l + (g - l) * st.saturation + st.chaleur * 0.35; b = l + (b - l) * st.saturation - st.chaleur * 0.6;
    img[i] = f(r); img[i + 1] = f(g); img[i + 2] = f(b);
  }
}
function masqueBatiments(batiments, L, N) { // couverture 0..1 des emprises, élargie d'environ un demi-mètre puis adoucie
  const m = new Float32Array(N * N), k = N / L, h = L / 2, SOUS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (const b of batiments) {
    const bb = boite(b.p), u0 = Math.max(0, Math.floor((bb[0] + h) * k) - 1), u1 = Math.min(N - 1, Math.ceil((bb[2] + h) * k)), v0 = Math.max(0, Math.floor((bb[1] + h) * k) - 1), v1 = Math.min(N - 1, Math.ceil((bb[3] + h) * k));
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) { let c = 0; for (const [du, dv] of SOUS) if (dedans((u + du) / k - h, (v + dv) / k - h, b.p)) c++; if (c) m[v * N + u] = Math.max(m[v * N + u], c / 4); }
  }
  const r = Math.max(1, Math.round(0.5 * k)), t = new Float32Array(N * N);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { let x = 0; for (let d = -r; d <= r; d++) { const w = u + d; if (w >= 0 && w < N && m[v * N + w] > x) x = m[v * N + w]; } t[v * N + u] = x; }
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { let x = 0; for (let d = -r; d <= r; d++) { const w = v + d; if (w >= 0 && w < N && t[w * N + u] > x) x = t[w * N + u]; } m[v * N + u] = x; }
  for (let v = 1; v < N - 1; v++) for (let u = 1; u < N - 1; u++) { const o = v * N + u; t[o] = (m[o] * 4 + m[o - 1] + m[o + 1] + m[o - N] + m[o + N]) / 8; }
  return t;
}
function reduire(img, N) { const n = N / 2, r = new Float32Array(n * n * 3); for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) for (let c = 0; c < 3; c++) r[(v * n + u) * 3 + c] = (img[((2 * v) * N + 2 * u) * 3 + c] + img[((2 * v) * N + 2 * u + 1) * 3 + c] + img[((2 * v + 1) * N + 2 * u) * 3 + c] + img[((2 * v + 1) * N + 2 * u + 1) * 3 + c]) / 4; return r; }
function versJpeg(img, N, q) { const d = new Uint8ClampedArray(N * N * 4); for (let i = 0, j = 0; i < N * N * 3; i += 3, j += 4) { d[j] = img[i]; d[j + 1] = img[i + 1]; d[j + 2] = img[i + 2]; d[j + 3] = 255; } return JPEG.encode({ data: d, width: N, height: N }, q).data; }

// ─── vérification du format v1 (avant d'écrire quoi que ce soit) ───
function verifier(c, obs) {
  const err = [], h = c.taille / 2 + 0.051, num = (v) => typeof v === 'number' && isFinite(v);
  const pt = (q, ou) => { if (!Array.isArray(q) || q.length < 2 || !num(q[0]) || !num(q[1]) || Math.abs(q[0]) > h || Math.abs(q[1]) > h) err.push(`${ou} : point invalide ${JSON.stringify(q)}`); };
  const poly = (p, ou) => { if (!Array.isArray(p) || p.length < 3) { err.push(`${ou} : moins de 3 points`); return; } p.forEach((q) => pt(q, ou)); const a = p[0], b = p[p.length - 1]; if (a[0] === b[0] && a[1] === b[1]) err.push(`${ou} : point final répété`); };
  if (c.v !== 1) err.push('v ≠ 1'); if (c.nom !== 'Poncin') err.push('nom'); if (!['ign-osm', 'provisoire'].includes(c.source)) err.push('source'); if (typeof c.attribution !== 'string' || !/IGN/.test(c.attribution) || !/OpenStreetMap/.test(c.attribution)) err.push('attribution');
  if (!c.origine || !num(c.origine.lat) || !num(c.origine.lon)) err.push('origine'); if (!num(c.taille) || c.taille < 200 || c.taille > 2000) err.push('taille');
  const r = c.relief; if (!r || !num(r.pas) || r.n !== Math.round(c.taille / r.pas) + 1 || !Array.isArray(r.h) || r.h.length !== r.n * r.n || !r.h.every(num)) err.push('relief incohérent');
  c.batiments.forEach((b, i) => { poly(b.p, `batiments[${i}]`); if (!num(b.h) || b.h <= 0) err.push(`batiments[${i}].h`); if (!TYPES_BATI.includes(b.t)) err.push(`batiments[${i}].t = ${b.t}`); });
  c.rues.forEach((x, i) => { if (!Array.isArray(x.l) || x.l.length < 2) err.push(`rues[${i}] : moins de 2 points`); else x.l.forEach((q) => pt(q, `rues[${i}]`)); if (!(x.w > 0)) err.push(`rues[${i}].w`); if (!['route', 'rue', 'chemin'].includes(x.t)) err.push(`rues[${i}].t`); if (x.n != null && typeof x.n !== 'string') err.push(`rues[${i}].n`); });
  c.eau.forEach((x, i) => { poly(x.p, `eau[${i}]`); if (!['riviere', 'ruisseau'].includes(x.t)) err.push(`eau[${i}].t`); });
  c.ponts.forEach((x, i) => { if (!Array.isArray(x.l) || x.l.length !== 2) err.push(`ponts[${i}].l`); else x.l.forEach((q) => pt(q, `ponts[${i}]`)); if (!(x.w > 0)) err.push(`ponts[${i}].w`); });
  c.vegetation.forEach((x, i) => { poly(x.p, `vegetation[${i}]`); if (!['bois', 'vigne', 'pre', 'jardin'].includes(x.t)) err.push(`vegetation[${i}].t`); });
  c.arbres.forEach((a, i) => { if (!Array.isArray(a) || a.length !== 3 || !a.every(num)) err.push(`arbres[${i}]`); else pt(a, `arbres[${i}]`); });
  c.interdit.forEach((x, i) => { poly(x.p, `interdit[${i}]`); if (typeof x.n !== 'string') err.push(`interdit[${i}].n`); });
  c.noms.forEach((x, i) => { if (typeof x.n !== 'string' || !x.n) err.push(`noms[${i}].n`); pt([x.x, x.z], `noms[${i}]`); });
  if (c.sol !== null && !(c.sol && typeof c.sol.image === 'string' && typeof c.sol.petite === 'string')) err.push('sol');
  const z = c.zones;
  if (!z || !z.arene || !num(z.arene.rayon) || z.arene.rayon <= 0) err.push('zones.arene'); else { pt(z.arene.centre, 'zones.arene.centre'); if (Math.max(Math.abs(z.arene.centre[0]), Math.abs(z.arene.centre[1])) + z.arene.rayon > c.taille / 2) err.push('zones.arene déborde du carré'); }
  const libre = (q, ou, m) => { pt(q, ou); if (obs && !obs.libre(q[0], q[1], m)) err.push(`${ou} n'est pas libre`); };
  if (!z || !Array.isArray(z.apparitions) || z.apparitions.length < 12) err.push(`zones.apparitions : ${z && z.apparitions && z.apparitions.length} (≥ 12)`); else z.apparitions.forEach((q, i) => libre(q, `zones.apparitions[${i}]`, 1));
  if (!z || !Array.isArray(z.armes) || z.armes.length < 6 || z.armes.length > 8) err.push(`zones.armes : ${z && z.armes && z.armes.length} (6 à 8)`); else z.armes.forEach((a, i) => { if (!['pompe', 'precision', 'soin', 'armure'].includes(a.arme)) err.push(`zones.armes[${i}].arme`); libre([a.x, a.z], `zones.armes[${i}]`, 0.8); });
  if (!z || !Array.isArray(z.extraction)) err.push('zones.extraction'); else z.extraction.forEach((q, i) => libre(q, `zones.extraction[${i}]`, 0.5));
  if (z) libre(z.base, 'zones.base', 1);
  return err;
}

// ─── écriture : JSON lisible (un objet par ligne), licence ───
function versJSON(c) {
  const liste = (a) => a.length ? '[\n' + a.map((o) => JSON.stringify(o)).join(',\n') + '\n]' : '[]';
  return '{\n' + Object.entries(c).map(([k, v]) => JSON.stringify(k) + ': ' + (/^(batiments|rues|eau|ponts|vegetation|interdit|noms)$/.test(k) ? liste(v) : JSON.stringify(v))).join(',\n') + '\n}\n';
}
function licence(c) {
  const an = new Date().getFullYear(), jour = new Date().toISOString().slice(0, 10), alti = RAPPORT.sources.alti !== 'plat';
  return `# Données de la carte de Poncin

\`poncin.json\`, \`sol-2048.jpg\` et \`sol-1024.jpg\` ont été produits le ${jour} par \`outils/carte/construire.js\` (carré de ${c.taille} m centré sur ${c.origine.lat}, ${c.origine.lon}) à partir de données ouvertes. Aucune donnée Google n'est utilisée.

## Sources

- **OpenStreetMap** — © contributeurs OpenStreetMap ${an}, base de données ouverte sous licence **ODbL 1.0** (<https://opendatacommons.org/licenses/odbl/1-0/>), <https://www.openstreetmap.org/copyright>. Rues et leurs noms, eau, ponts, végétation, arbres, noms de lieux, compléments des bâtiments (noms, église, mairie, château), zone privée du château.
- **IGN – Géoplateforme** — © IGN ${an}, sous **Licence Ouverte Etalab 2.0** (<https://www.etalab.gouv.fr/licence-ouverte-open-licence/>) :
  - **BD TOPO®** (service WFS \`${RAPPORT.sources.bdtopo || 'BDTOPO_V3:batiment'}\`) : emprises et hauteurs des bâtiments ;
${alti ? '  - **RGE ALTI®** (service WMS-R / API altimétrique) : relief, grille de 10 m ;\n' : ''}  - **BD ORTHO®** (service WMTS \`ORTHOIMAGERY.ORTHOPHOTOS\`) : photographies aériennes du sol, adoucies (couleurs pastel) et masquées sous les emprises des bâtiments.

## Licences des fichiers

- \`poncin.json\` est une **base de données dérivée** d'OpenStreetMap (combinée à la BD TOPO) : elle est diffusée sous **ODbL 1.0**, avec la même obligation de partage à l'identique. Les éléments issus de l'IGN restent réutilisables sous Licence Ouverte 2.0.
- \`sol-2048.jpg\` et \`sol-1024.jpg\` sont des images dérivées de la BD ORTHO® (Licence Ouverte 2.0) ; le masque des bâtiments vient de la BD TOPO® et d'OpenStreetMap (« œuvre produite » au sens de l'ODbL : seule l'attribution est due).

## Attribution à afficher

> ${c.attribution}

Le jeu l'affiche dans ses crédits.
`;
}

// ─── le pipeline ───
async function construire() {
  const dec = await decouvrir(), R = repere(dec.lat, dec.lon), L = dec.taille;
  const objets = await etapeOSM(R, L);
  let bdtopo = [];
  try { bdtopo = await etapeBDTOPO(R, L); if (!bdtopo.length) repli('BD TOPO vide : bâtiments OSM seuls'); } catch (e) { repli(`BD TOPO injoignable (${e.message.slice(0, 200)}) : bâtiments OSM seuls`); }
  const relief = await etapeAlti(R, L);
  const { carte, info } = assembler(R, L, objets, bdtopo, relief);
  const o = await etapeOrtho(R, L, carte.batiments); carte.sol = o ? o.sol : null;
  const err = verifier(carte, info.obs);
  if (err.length) { console.log(`\nFORMAT INVALIDE (${err.length}) :\n  ` + err.slice(0, 40).join('\n  ')); throw new Error('carte invalide : rien n’est écrit'); }
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'poncin.json'), versJSON(carte));
  fs.writeFileSync(path.join(SORTIE, 'LICENCE-DONNEES.md'), licence(carte));
  if (!carte.sol) for (const f of ['sol-2048.jpg', 'sol-1024.jpg']) { try { fs.unlinkSync(path.join(SORTIE, f)); } catch (e) { /* absent */ } }
  rapport(carte, info, R);
  return { carte, info, R, ortho: o, objets };
}
function rapport(c, info, R) {
  const n = (f) => c.noms.filter((x) => f.test(x.n)).map((x) => x.n);
  const lignes = [
    `\n══ Carte de Poncin : ${path.relative(RACINE, SORTIE) || SORTIE} ══`,
    `centre ${R.lat0}, ${R.lon0} ; carré de ${c.taille} m ; relief ${c.relief.n}×${c.relief.n} (${RAPPORT.sources.alti}), de ${Math.min(...c.relief.h)} à ${Math.max(...c.relief.h)} m`,
    `bâtiments : ${c.batiments.length} (BD TOPO ${info.nBD}, OSM ajoutés ${info.nOSM}) ${JSON.stringify(info.compte)} ; enveloppes convexes de repli : ${RAPPORT.enveloppes}`,
    `rues : ${c.rues.length} (${new Set(c.rues.filter((r) => r.n).map((r) => r.n)).size} noms) ; eau : ${c.eau.length} (rivière ${c.eau.filter((e) => e.t === 'riviere').length}, ruisseau ${c.eau.filter((e) => e.t === 'ruisseau').length}) ; ponts : ${c.ponts.length} (dont ${info.deduits} déduits d'une voie qui franchit un ruisseau, ${info.allonges} allongés pour enjamber l'eau)`,
    `végétation : ${c.vegetation.length} ; arbres : ${c.arbres.length} (OSM ${info.nArbresOSM}, semés dans les bois ${info.semes}) ; interdit : ${c.interdit.map((z) => z.n).join(', ') || 'aucun'}`,
    `objets nommés : église ${JSON.stringify(c.batiments.filter((b) => b.t === 'eglise').map((b) => b.n || '(sans nom)'))}, mairie ${JSON.stringify(c.batiments.filter((b) => b.t === 'mairie').map((b) => b.n || '(sans nom)'))}, château ${JSON.stringify([...new Set(c.batiments.filter((b) => b.t === 'chateau').map((b) => b.n || '(sans nom)'))])}`,
    `cours d'eau : ${JSON.stringify([...new Set(info.lignesEau.filter((l) => l.n).map((l) => l.n))])} ; Ain : ${n(NOM_AIN).length ? 'oui' : 'NON'}, Veyron : ${n(NOM_VEYRON).length ? 'oui' : 'NON'}`,
    `ponts nommés : ${JSON.stringify([...new Set(info.ponts.filter((p) => p.n).map((p) => p.n))])} ; voies sur pont : ${JSON.stringify([...new Set(info.ponts.filter((p) => p.voie).map((p) => p.voie))])}`,
    `noms (${c.noms.length}) : ${c.noms.slice(0, 40).map((x) => x.n).join(' · ')}`,
    `voisinage du château (surfaces à moins de 30 m) :\n    ${(RAPPORT.voisinageChateau || []).join('\n    ') || 'aucune'}`,
    `zones : arène ${RAPPORT.arene} ; ${c.zones.apparitions.length} apparitions ; ${c.zones.armes.length} objets (${c.zones.armes.map((a) => a.arme).join(', ')}) ; ${c.zones.extraction.length} extractions ; base [${c.zones.base}]`,
    `sol : ${c.sol ? `${c.sol.image} + ${c.sol.petite} (${RAPPORT.sources.ortho})` : 'aucun (sol peint)'}`,
    `sources : ${JSON.stringify(RAPPORT.sources)} ; anneaux OSM ouverts refermés : ${RAPPORT.anneauxOuverts || 0}`,
    `réseau : ${STATS.requetes} requêtes, ${STATS.cache} réponses du cache, ${(STATS.octets / 1048576).toFixed(1)} Mo`,
    `replis : ${RAPPORT.replis.length ? RAPPORT.replis.join(' | ') : 'aucun'}`,
    `alertes : ${RAPPORT.alertes.length ? RAPPORT.alertes.join(' | ') : 'aucune'}`,
  ];
  console.log(lignes.join('\n'));
}

// ─── mode --essai : un faux Poncin synthétique, servi par un faux réseau, puis des vérifications ───
function essai() {
  CONFIG.attente = 5; CONFIG.pageWfs = 20; CONFIG.versionCache = 'essai';
  const C = { lat: 46.0875, lon: 5.4069 }, Rc = repere(C.lat, C.lon), el = []; let id = 1;
  const ll = (q) => { const [lat, lon] = Rc.ll(q[0], q[1]); return { lat, lon }; };
  const noeud = (q, tags) => { const g = ll(q); el.push({ type: 'node', id: id++, lat: g.lat, lon: g.lon, tags }); };
  const chemin = (pts, tags, ferme) => { const nodes = pts.map(() => id++), geometry = pts.map(ll); if (ferme) { nodes.push(nodes[0]); geometry.push(geometry[0]); } el.push({ type: 'way', id: id++, nodes, geometry, tags }); };
  const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const xAin = (z) => -230 + 12 * Math.sin(z / 90), zs = []; for (let z = -540; z <= 540; z += 30) zs.push(z);
  const bd = [], peints = []; // bâtiments BD TOPO (rect + props) ; ce que la photo montre (toits)
  const bati = (r, tags, props, decal = 0.3) => { if (tags) chemin(r, tags, true); if (props) bd.push({ r: r.map(([x, z]) => [x + decal, z]), props }); peints.push(r); };
  noeud([5, 5], { place: 'village', name: 'Poncin' });
  chemin(rect(-20, 0, 25, 30), { place: 'square', highway: 'pedestrian', area: 'yes', name: "Place d'essai" }, true);
  bati(rect(-10, -24, 10, -6), { building: 'yes' }, { hauteur: 9.2, nature: 'Indifférenciée', usage_1: 'Résidentiel' });
  noeud([0, -15], { amenity: 'townhall', name: "Mairie d'essai" });
  bati(rect(-75, 18, -45, 32), { building: 'church', amenity: 'place_of_worship', religion: 'christian', name: "Église d'essai" }, { hauteur: 14, nature: 'Eglise', usage_1: 'Religieux' });
  chemin(rect(110, -200, 200, -130), { historic: 'castle', name: "Château d'essai" }, true);
  bati(rect(140, -180, 170, -160), { building: 'castle' }, { hauteur: 15, nature: 'Château', usage_1: 'Résidentiel' });
  bati(rect(115, -140, 125, -133), null, { hauteur: 4, nature: 'Indifférenciée', usage_1: 'Annexe' });
  chemin(rect(200, -190, 240, -140), { leisure: 'garden', access: 'private' }, true);
  // l'Ain : la ligne et sa surface (relation en deux chemins à joindre)
  chemin(zs.map((z) => [xAin(z), z]), { waterway: 'river', name: "L'Ain" });
  const ouest = zs.map((z) => [xAin(z) - 32, z]), est = zs.slice().reverse().map((z) => [xAin(z) + 32, z]);
  el.push({ type: 'relation', id: id++, tags: { type: 'multipolygon', natural: 'water', water: 'river', name: "L'Ain" }, members: [['outer', ouest.concat([est[0]])], ['outer', est.concat([ouest[0]])]].map(([role, pts]) => ({ type: 'way', ref: id++, role, geometry: pts.map(ll) })) });
  // le Veyron, en partie busé ; deux rues le franchissent sans pont tagué
  chemin([[420, 130], [200, 110], [60, 92]], { waterway: 'stream', name: 'Le Veyron' });
  chemin([[60, 92], [20, 90]], { waterway: 'stream', name: 'Le Veyron', tunnel: 'culvert', layer: '-1' });
  chemin([[20, 90], [-100, 80], [-236, 70]], { waterway: 'stream', name: 'Le Veyron' });
  // les voies : la route qui franchit l'Ain sur un pont, des rues, un chemin
  chemin([[-620, -50], [-280, -50]], { highway: 'primary', name: "Route d'essai" });
  chemin([[-280, -50], [-190, -50]], { highway: 'primary', bridge: 'yes', layer: '1', name: "Route d'essai" });
  chemin([[-190, -50], [620, -50]], { highway: 'primary', name: "Route d'essai" });
  chemin(rect(-282, -55, -188, -45), { man_made: 'bridge', name: "Pont d'essai" }, true);
  chemin([[-30, -50], [-30, 160]], { highway: 'residential', name: 'Rue A' });
  chemin([[100, -50], [100, 260]], { highway: 'residential', name: 'Rue B' });
  chemin([[0, 30], [0, 420]], { highway: 'tertiary', name: 'Route du sud' });
  chemin([[-30, 150], [-180, 150]], { highway: 'footway' });
  // les maisons : une grille, la BD TOPO en couvre 70 % (décalée de 30 cm), OSM en couvre 90 %
  const routes = [[[-620, -50], [620, -50]], [[-30, -50], [-30, 160]], [[100, -50], [100, 260]], [[0, 30], [0, 420]], [[-30, 150], [-180, 150]], [[420, 130], [200, 110], [60, 92], [20, 90], [-100, 80], [-236, 70]]];
  const occupes = [rect(-25, -5, 30, 35), rect(-15, -29, 15, -1), rect(-80, 13, -40, 37), rect(105, -205, 245, -125)];
  let k = 0;
  for (let gx = -180; gx <= 280; gx += 34) for (let gz = -130; gz <= 250; gz += 30) {
    const r = rect(gx, gz, gx + 11, gz + 8), cx = gx + 5.5, cz = gz + 4;
    if (r.some(([x, z]) => x < xAin(z) + 45) || routes.some((l) => distBord(cx, cz, l, false) < 11) || occupes.some((o) => distPolys(o, r) < 3)) continue;
    const m = k++ % 10, tags = m === 4 ? null : m === 7 ? { building: 'yes', shop: 'bakery', name: "Boulangerie d'essai" } : { building: m === 9 ? 'garage' : 'house' };
    const props = m >= 7 ? null : m === 3 ? { hauteur: null, nombre_d_etages: 2, nature: 'Indifférenciée', usage_1: 'Résidentiel' } : m === 5 ? { nature: 'Indifférenciée' } : { hauteur: 6 + (m % 4) * 1.5, nature: 'Indifférenciée', usage_1: 'Résidentiel' };
    bati(r, tags, props);
  }
  for (let i = 0; i < 9; i++) noeud([-18 + i * 5, 33], { natural: 'tree' });
  chemin(rect(250, -320, 330, -220), { landuse: 'forest' }, true);
  chemin(rect(-200, -300, -120, -220), { landuse: 'vineyard' }, true);
  chemin(rect(150, 150, 260, 250), { landuse: 'meadow' }, true);
  const relief = (x, z) => 240 + 0.03 * x + 30 * Math.exp(-((x - 155) ** 2 + (z + 170) ** 2) / (2 * 70 ** 2));
  const reliefLL = (lat, lon) => { const [x, z] = Rc.xz(lat, lon); return relief(x, z); };
  // la photo : herbe, rues grises, eau bleue, toits rouges (exactement aux emprises)
  const peintsB = peints.map((p) => ({ p, b: boite(p) })), eauP = [ouest.concat(est)], rues2 = routes.slice(0, 5);
  const tuile = (tx, ty, z) => {
    const d = new Uint8Array(256 * 256 * 4), [la0, lo0] = [MERC.lat(ty * 256, z), MERC.lon(tx * 256, z)], [la1, lo1] = [MERC.lat(ty * 256 + 256, z), MERC.lon(tx * 256 + 256, z)];
    const [xa, za] = Rc.xz(la0, lo0), [xb, zb] = Rc.xz(la1, lo1), bt = [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)], ici = peintsB.filter((o) => boitesSeCroisent(o.b, bt, 1));
    for (let j = 0; j < 256; j++) { const lat = MERC.lat(ty * 256 + j + 0.5, z); for (let i = 0; i < 256; i++) {
      const [x, zz] = Rc.xz(lat, MERC.lon(tx * 256 + i + 0.5, z)), o = (j * 256 + i) * 4; let c = ((Math.floor(x / 10) + Math.floor(zz / 10)) & 1) ? [112, 152, 84] : [100, 140, 78];
      if (ici.some((q) => dedans(x, zz, q.p))) c = [222, 58, 52]; else if ((x < -150 && eauP.some((p) => dedans(x, zz, p))) || distBord(x, zz, routes[5], false) < 1.5) c = [70, 110, 170]; else if (rues2.some((l) => distBord(x, zz, l, false) < 3)) c = [150, 150, 150];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    } }
    return Buffer.from(JPEG.encode({ data: d, width: 256, height: 256 }, 92).data);
  };
  const rep = (status, corps) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => { const b = Buffer.isBuffer(corps) ? corps : Buffer.from(corps); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
  const appels = { overpassPrincipal: 0, kumi: 0, wfs: 0, wms: 0, api: 0, wmts: 0, ua: true };
  FETCH = async (url, o) => {
    if (!o.headers || o.headers['User-Agent'] !== UA) appels.ua = false;
    const u = new URL(url), p = u.searchParams;
    if (u.host === 'overpass-api.de') { appels.overpassPrincipal++; return rep(504, 'Gateway Timeout'); } // le premier serveur est en panne : on doit passer au second
    if (/overpass/.test(u.host)) {
      appels.kumi++; const q = decodeURIComponent(String(o.body).replace(/^data=/, ''));
      if (/around:/.test(q)) return rep(200, JSON.stringify({ elements: el.filter((e) => { const t = e.tags || {}; return t.historic === 'castle' || /^(townhall|place_of_worship)$/.test(t.amenity || '') || t.place === 'square' || (t.place && t.name === 'Poncin') || /^(river|stream)$/.test(t.waterway || ''); }) }));
      return rep(200, JSON.stringify({ version: 0.6, elements: el }));
    }
    if (u.pathname === '/wfs/ows') {
      appels.wfs++;
      if (p.get('REQUEST') === 'GetCapabilities') return rep(200, '<?xml version="1.0"?><wfs:WFS_Capabilities><FeatureTypeList><FeatureType><Name>BDTOPO_V3:troncon_de_route</Name></FeatureType><FeatureType><Name>BDTOPO_V3:batiment</Name></FeatureType></FeatureTypeList></wfs:WFS_Capabilities>');
      const [a, b, c2, d2] = p.get('BBOX').split(',').map(Number), debut = +p.get('STARTINDEX'), nb = +p.get('COUNT');
      if (a < 20) return rep(200, JSON.stringify({ type: 'FeatureCollection', features: [] })); // BBOX en lon,lat : le serveur attend lat,lon
      const tous = bd.filter((f) => { const g = ll(centroide(f.r)); return g.lat >= a && g.lat <= c2 && g.lon >= b && g.lon <= d2; }).map((f, i) => ({ type: 'Feature', id: 'batiment.' + i, geometry: { type: 'MultiPolygon', coordinates: [[f.r.concat([f.r[0]]).map((q) => { const g = ll(q); return [g.lat, g.lon, 250]; })]] }, properties: Object.assign({ cleabs: 'BATIMENT' + i, etat_de_l_objet: 'En service' }, f.props) }));
      return rep(200, JSON.stringify({ type: 'FeatureCollection', numberMatched: tous.length, numberReturned: Math.min(nb, tous.length - debut), features: tous.slice(debut, debut + nb) }));
    }
    if (u.pathname === '/wms-r') {
      appels.wms++;
      if (p.get('REQUEST') === 'GetCapabilities') return rep(200, '<?xml version="1.0"?><WMS_Capabilities version="1.3.0"><Capability><Request><GetMap><Format>image/x-bil;bits=32</Format></GetMap></Request><Layer><Name>ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES</Name></Layer></Capability></WMS_Capabilities>');
      const [s, w, n, e] = p.get('BBOX').split(',').map(Number), W = +p.get('WIDTH'), H = +p.get('HEIGHT'), b = Buffer.alloc(W * H * 4);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) b.writeFloatLE(reliefLL(n - (j + 0.5) / H * (n - s), w + (i + 0.5) / W * (e - w)), (j * W + i) * 4);
      return rep(200, b);
    }
    if (/altimetrie/.test(u.pathname)) { appels.api++; const lons = p.get('lon').split('|').map(Number), lats = p.get('lat').split('|').map(Number); return rep(200, JSON.stringify({ elevations: lats.map((la, i) => reliefLL(la, lons[i])) })); }
    if (u.pathname === '/wmts') { appels.wmts++; return rep(200, tuile(+p.get('TILECOL'), +p.get('TILEROW'), +p.get('TILEMATRIX'))); }
    return rep(404, 'inconnu');
  };
  return { appels, relief, reliefLL, Rc, C };
}
async function verifierEssai(m, res) {
  const { carte: c, info, R, ortho: o } = res, ok = [], ko = [];
  const t = (cond, msg) => { (cond ? ok : ko).push(msg); console.log(`  ${cond ? 'ok    ' : 'ÉCHEC '} ${msg}`); };
  console.log('\n── Vérifications de l’essai ──');
  // projection et Web Mercator
  const [la, lo] = R.ll(123.4, -56.7), [x, z] = R.xz(la, lo); t(Math.hypot(x - 123.4, z + 56.7) < 1e-6, 'projection locale : aller-retour exact');
  t(Math.abs(R.kx - 111412.84 * Math.cos(R.lat0 * RAD) + 93.5 * Math.cos(3 * R.lat0 * RAD)) < 1 && Math.abs(R.kz - (111132.92 - 559.82 * Math.cos(2 * R.lat0 * RAD) + 1.175 * Math.cos(4 * R.lat0 * RAD))) < 1, 'projection locale : longueur d’un degré conforme (formules WGS84 de référence)');
  const px = MERC.px(5.4069, 19), py = MERC.py(46.0875, 19); t(Math.abs(MERC.lon(px, 19) - 5.4069) < 1e-9 && Math.abs(MERC.lat(py, 19) - 46.0875) < 1e-9, `Web Mercator : aller-retour exact (tuile z19 ${Math.floor(px / 256)},${Math.floor(py / 256)})`);
  t(Math.floor(MERC.px(0, 1) / 256) === 1 && Math.floor(MERC.py(0.0001, 1) / 256) === 0 && Math.floor(MERC.py(-0.0001, 1) / 256) === 1, 'Web Mercator : tuiles du niveau 1 dans le bon ordre');
  // géométrie
  t(couperPoly([[-10, -10], [20, -10], [20, 20], [-10, 20]], 5).length === 4 && Math.abs(aire(couperPoly([[-10, -10], [20, -10], [20, 20], [-10, 20]], 5))) === 100, 'découpe d’un polygone au carré');
  const cl = couperLigne([[-20, 0], [0, 0], [20, 0]], 10); t(cl.length === 1 && cl[0].debut && cl[0].fin && cl[0].l[0][0] === -10 && cl[0].l[2][0] === 10, 'découpe d’une ligne qui traverse le carré (deux sorties)');
  t(dp([[0, 0], [1, 0.1], [2, 0], [3, 2], [4, 0]], 0.3).length === 4, 'Douglas-Peucker');
  t(!simple([[0, 0], [10, 10], [10, 0], [0, 10]]) && simple([[0, 0], [10, 0], [10, 10], [0, 10]]), 'détection des polygones croisés');
  // découverte et sources
  const o0 = m.Rc.xz(R.lat0, R.lon0); t(c.taille === 600 && Math.abs(o0[0] + 30) < 25 && Math.abs(o0[1] + 70) < 30, `découverte : carré de ${c.taille} m centré à [${o0.map(Math.round)}] du faux bourg`);
  t(m.appels.overpassPrincipal >= 2 && m.appels.kumi >= 2 && RAPPORT.sources.overpass === 'overpass.kumi.systems', 'Overpass : réessais puis repli sur le second serveur');
  t(m.appels.ua, 'User-Agent poli sur chaque requête');
  t(RAPPORT.sources.bdtopoAxes === 'lat,lon' && RAPPORT.sources.bdtopoPages >= 2, `BD TOPO : axes détectés (${RAPPORT.sources.bdtopoAxes}), pagination (${RAPPORT.sources.bdtopoPages} pages)`);
  // relief
  let ecart = 0; for (const [i, j] of [[0, 0], [30, 30], [60, 60], [17, 44], [45, 3]]) { const xx = -c.taille / 2 + i * 10, zz = -c.taille / 2 + j * 10, [a, b] = R.ll(xx, zz); ecart = Math.max(ecart, Math.abs(c.relief.h[j * c.relief.n + i] - m.reliefLL(a, b))); }
  t(RAPPORT.sources.alti === 'wms-r' && ecart < 0.6, `relief WMS-R : écart maximal ${ecart.toFixed(2)} m`);
  const pts = [[-100, 50], [200, -150]].map(([a, b]) => R.ll(a, b)), api = await altiAPI(pts); t(api.every((v, i) => Math.abs(v - m.reliefLL(...pts[i])) < 0.01), 'relief par l’API altimétrique (repli)');
  // format et contenu
  t(verifier(c, info.obs).length === 0, 'format v1 valide (verifier)');
  const relu = JSON.parse(fs.readFileSync(path.join(SORTIE, 'poncin.json'), 'utf8')); t(relu.v === 1 && relu.batiments.length === c.batiments.length && Object.keys(relu).join() === 'v,nom,source,attribution,origine,taille,relief,batiments,rues,eau,ponts,vegetation,arbres,interdit,noms,sol,zones', 'poncin.json relu : mêmes données, clés dans l’ordre du contrat');
  const types = new Set(c.batiments.map((b) => b.t)); t(['eglise', 'mairie', 'chateau', 'maison', 'annexe', 'commerce'].every((x) => types.has(x)), `types de bâtiments : ${[...types].join(', ')}`);
  const eg = c.batiments.find((b) => b.t === 'eglise'); t(eg && eg.h === 14 && eg.n === "Église d'essai", 'l’église : hauteur BD TOPO et nom OSM');
  t(c.batiments.some((b) => b.h === 7) && c.batiments.some((b) => b.h === 6), 'hauteurs : étages·3+1, sinon 6 m');
  t(info.nOSM >= 3 && info.nBD >= 20, `bâtiments OSM ajoutés sans doublon (${info.nBD} BD TOPO + ${info.nOSM} OSM)`);
  const noms = c.noms.map((x) => x.n); t(["Église d'essai", "Mairie d'essai", "Château d'essai", "L'Ain", 'Le Veyron', "Place d'essai", "Pont d'essai"].every((x) => noms.includes(x)), `noms : ${noms.slice(0, 12).join(' · ')}`);
  t(c.eau.some((e) => e.t === 'riviere' && Math.abs(aire(e.p)) > 10000) && c.eau.some((e) => e.t === 'ruisseau'), 'eau : l’Ain (surface jointe) et le Veyron (élargi)');
  const busé = c.eau.some((e) => e.t === 'ruisseau' && dedans(...R.xz(...m.Rc.ll(40, 91)), e.p)); t(!busé, 'le Veyron busé n’est pas de l’eau');
  t(c.ponts.length >= 4 && info.deduits === 3, `ponts : ${c.ponts.length} (dont ${info.deduits} déduits)`);
  const pAin = c.ponts.find((p) => p.w >= 9); t(!!pAin, 'le pont de l’Ain prend la largeur de man_made=bridge');
  t(c.interdit.length === 1 && c.interdit[0].n === "Château d'essai (propriété privée)", 'zone interdite : le jardin privé du château');
  t(info.mouilles === 0, 'l’eau élargie ne recouvre aucun bâtiment');
  t(c.zones.apparitions.length >= 16 && c.zones.armes.length >= 6 && c.zones.armes.length <= 8 && c.zones.extraction.length >= 3 && c.zones.arene.rayon === 110, `zones : ${c.zones.apparitions.length} apparitions, ${c.zones.armes.length} objets, ${c.zones.extraction.length} extractions, arène ${c.zones.arene.n || ''}`);
  const pl = R.xz(...m.Rc.ll(2.5, 15)); t(dist(c.zones.arene.centre, pl) < 12, 'l’arène est sur la place');
  t(c.arbres.length > 9 && c.vegetation.some((v) => v.t === 'bois'), `arbres : ${c.arbres.length} ; végétation : ${c.vegetation.length}`);
  // la photo : les toits rouges tombent exactement sous les emprises
  t(!!(o && fs.existsSync(path.join(SORTIE, 'sol-2048.jpg')) && fs.existsSync(path.join(SORTIE, 'sol-1024.jpg'))), 'sol-2048.jpg et sol-1024.jpg écrits');
  if (o) {
    const N = o.N, k = N / c.taille, hh = c.taille / 2, pix = (img, q) => { const u = Math.floor((q[0] + hh) * k), v = Math.floor((q[1] + hh) * k), i = (v * N + u) * 3; return [img[i], img[i + 1], img[i + 2]]; };
    const rouge = (p) => p[0] > 170 && p[1] < 110 && p[2] < 110;
    const centres = c.batiments.filter((b) => Math.abs(aire(b.p)) > 40).map((b) => centroide(b.p)), dansRouge = centres.filter((q) => rouge(pix(o.brut, q))).length;
    t(dansRouge >= centres.length * 0.95, `alignement : ${dansRouge}/${centres.length} centres de bâtiments sur un toit photographié`);
    let rougesHors = 0, rouges = 0; const m2 = masqueBatiments(c.batiments, c.taille, N);
    for (let i = 0; i < N * N; i++) { if (rouge([o.brut[i * 3], o.brut[i * 3 + 1], o.brut[i * 3 + 2]])) { rouges++; if (m2[i] < 0.5) rougesHors++; } }
    t(rougesHors < rouges * 0.03, `alignement : ${(100 * rougesHors / rouges).toFixed(2)} % des pixels de toit hors des emprises (élargies de 0,5 m)`);
    const restants = centres.filter((q) => rouge(pix(o.final, q))).length; t(restants === 0, 'toits masqués (couleur de pavé) sous les bâtiments');
    const dec = JPEG.decode(fs.readFileSync(path.join(SORTIE, 'sol-1024.jpg')), { useTArray: true }); t(dec.width === 1024 && dec.height === 1024, 'sol-1024.jpg se relit en 1024×1024');
  }
  t(fs.readFileSync(path.join(SORTIE, 'LICENCE-DONNEES.md'), 'utf8').includes('ODbL') && /© IGN \d{4} – BD ORTHO®, BD TOPO®, RGE ALTI® · © contributeurs OpenStreetMap \d{4}/.test(c.attribution), 'licence et attribution avec l’année');
  // le cache : une même requête ne repart pas sur le réseau
  const avant = STATS.requetes; await telecharger('https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities', {}); t(STATS.requetes === avant, 'cache des réponses brutes');
  console.log(`\nEssai : ${ok.length} vérifications ok, ${ko.length} en échec (sortie dans ${SORTIE})`);
  return ko.length;
}

async function principal() {
  console.log(`Carte de Poncin — ${ESSAI ? 'ESSAI hors ligne (fausses réponses)' : 'données IGN + OpenStreetMap'} — sortie ${SORTIE}`);
  if (!JPEG) alerte('jpeg-js introuvable (npm i --no-save --prefix outils/carte jpeg-js@0.4.4)');
  if (ESSAI) {
    if (!JPEG) { console.log('L’essai a besoin de jpeg-js.'); process.exit(1); }
    const m = essai(), res = await construire(), echecs = await verifierEssai(m, res);
    fs.rmSync(CACHE, { recursive: true, force: true });
    process.exit(echecs ? 1 : 0);
  }
  await construire();
  log('terminé');
}
process.on('unhandledRejection', (e) => { console.error('ERREUR', e); process.exit(1); });
principal().catch((e) => { console.error(`\nÉCHEC : ${e && e.stack || e}`); process.exit(1); });
