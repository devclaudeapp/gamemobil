#!/usr/bin/env node
/* OPÉRATION PONCIN — construit la vraie carte de Poncin (01450, Ain) à partir des données ouvertes : OpenStreetMap (ODbL) et
   IGN Géoplateforme (BD TOPO®, RGE ALTI®, BD ORTHO® ; Licence Ouverte Etalab 2.0). Google est exclu (ses conditions interdisent
   d'extraire ou de garder ses données).
   Sortie dans poncin/carte/ : poncin.json (la carte v1 de src-poncin/ARCHITECTURE.md, lue telle quelle par le jeu), sol-2048.jpg et
   sol-1024.jpg (photo aérienne adoucie, recalée sur le carré joué : ligne 0 = nord, colonne 0 = ouest), LICENCE-DONNEES.md.
   Le réseau du poste de développement est fermé : la vraie construction tourne sur GitHub Actions (.github/workflows/carte.yml).
     node outils/carte/construire.js            la vraie carte (réponses brutes gardées dans outils/carte/cache/)
     node outils/carte/construire.js --essai    tout le pipeline hors ligne sur de fausses réponses synthétiques, avec vérifications
   Options : --sortie <dossier>, --sans-cache ; --verifier [poncin.json] vérifie une carte déjà construite. Node 22 (fetch global), CommonJS ; seule dépendance : jpeg-js@0.4.4
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
  overpass: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'],
  wfs: 'https://data.geopf.fr/wfs/ows', coucheBati: 'BDTOPO_V3:batiment',
  wmsr: 'https://data.geopf.fr/wms-r', coucheAlti: 'ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES',
  altiApi: 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json', ressourceAlti: 'ign_rge_alti_wld',
  wmts: 'https://data.geopf.fr/wmts', coucheOrtho: 'ORTHOIMAGERY.ORTHOPHOTOS', coucheIRC: 'ORTHOIMAGERY.ORTHOPHOTOS.IRC',
  coucheVegetation: 'BDTOPO_V3:zone_de_vegetation', coucheHaie: 'BDTOPO_V3:haie', couchePonctuelle: 'BDTOPO_V3:construction_ponctuelle',
  coucheLineaire: 'BDTOPO_V3:construction_lineaire', coucheCimetiere: 'BDTOPO_V3:cimetiere', coucheSport: 'BDTOPO_V3:terrain_de_sport',
  coucheMNH: 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G', coucheMNS: 'IGNF_LIDAR-HD_MNS_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G',
  coucheMNT: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G', coucheHorizon: 'ELEVATION.ELEVATIONGRIDCOVERAGE',
  arene: { rayon: 110, apparitions: 20, objets: 8 }, arbresBois: { espacement: 9, max: 900 },
  arbres: { max: 7000, pasMNH: 0.5, hauteurMin: 3, rayonMin: 1 }, horizon: { cote: 16000, pas: 125 }, arenePhoto: { cote: 400, image: 2048, zoom: 20 },
  style: { flou: 1, saturation: 1.28, chaleur: 0.035, eclaircir: 0.12, gamma: 0.86, pave: [218, 208, 195] },
};
function lireConfig() {
  let c = {}; try { c = JSON.parse(fs.readFileSync(path.join(ICI, 'poncin.config.json'), 'utf8')); } catch (e) { console.log(`poncin.config.json illisible (${e.message}) : réglages par défaut`); }
  const r = Object.assign({}, DEFAUT, c); for (const k of ['approx', 'arene', 'arbresBois', 'arbres', 'horizon', 'arenePhoto', 'style']) r[k] = Object.assign({}, DEFAUT[k], c[k] || {});
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
const compter = (l, f) => { const c = {}; for (const x of l) { const k = f(x); c[k] = (c[k] || 0) + 1; } return c; };
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
  const j = await overpass(q, 'OSM');
  // le décor (requête à part, légère : la première reste celle du cache) : barrières ponctuelles, lampadaires, arrêts, bureaux, artisans, santé…
  const q2 = `[out:json][timeout:120][bbox:${bb}];
(
  node[barrier]; node[highway~"^(street_lamp|bus_stop)$"]; nwr[public_transport]; nwr[office]; nwr[craft]; nwr[healthcare]; node[leisure]; nwr[man_made~"^(cross|water_well)$"];
);
out body geom;`;
  try { const vus = new Set(j.elements.map((e) => e.type + e.id)); for (const e of (await overpass(q2, 'OSM (décor)')).elements) if (!vus.has(e.type + e.id)) j.elements.push(e); } catch (e) { repli(`OSM (décor) indisponible (${e.message.slice(0, 160)}) : sans lampadaires, portails ni bornes`); }
  const objets = formes(j.elements, R);
  log(`OSM : ${objets.length} objets (${objets.filter((o) => o.tags.building).length} bâtiments, ${objets.filter((o) => o.tags.highway).length} voies)`);
  return objets;
}

// ─── 3. BD TOPO (WFS) : emprises, hauteurs et matériaux des bâtiments ; végétation, haies, petites constructions ───
async function wfsObjets(couche, R, L, marge, quoi) { // → { objets: [{ polys, trous, lignes, pts, props }], axes, pages, ordre } ; BBOX en lat,lon puis lon,lat si rien ne vient
  const h = L / 2 + marge, [n, w] = R.ll(-h, -h), [s, e] = R.ll(h, h), page = CONFIG.pageWfs, f6 = (v) => v.toFixed(6);
  for (const ordre of ['lat,lon', 'lon,lat']) {
    const bbox = ordre === 'lat,lon' ? `${f6(s)},${f6(w)},${f6(n)},${f6(e)},urn:ogc:def:crs:EPSG::4326` : `${f6(w)},${f6(s)},${f6(e)},${f6(n)},urn:ogc:def:crs:EPSG::4326`;
    const feats = [], ids = new Set(); let debut = 0, pages = 0;
    for (;;) {
      const url = `${CONFIG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${encodeURIComponent(couche)}&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326&BBOX=${bbox}&COUNT=${page}&STARTINDEX=${debut}`;
      const j = JSON.parse((await telecharger(url, { delai: 120000, valider: jsonOk((j2) => Array.isArray(j2.features) ? true : 'pas de features') })).toString('utf8'));
      for (const f of j.features) { const id = f.id || (f.properties && f.properties.cleabs) || JSON.stringify(f.geometry).slice(0, 80); if (!ids.has(id)) { ids.add(id); feats.push(f); } }
      pages++; if (j.features.length < page || pages >= 80) break; debut += page;
    }
    if (!feats.length) { log(`${quoi} : rien avec la BBOX en ${ordre}${ordre === 'lat,lon' ? ' : on essaie l’autre ordre' : ''}`); continue; }
    // l'ordre des axes des coordonnées rendues (latitude ≈ 46, longitude ≈ 5,4 : on les reconnaît)
    let s0 = 0, k = 0; for (const f of feats.slice(0, 50)) { const c = premiereCoord(f.geometry); if (c) { s0 += c[0]; k++; } }
    const latPremier = Math.abs(s0 / k - R.lat0) < Math.abs(s0 / k - R.lon0), vers = (c) => latPremier ? R.xz(c[0], c[1]) : R.xz(c[1], c[0]);
    const anneau = (a) => a.slice(0, -1).map(vers), objets = [];
    for (const f of feats) {
      const g = f.geometry, o = { polys: [], trous: [], lignes: [], pts: [], props: f.properties || {} }; if (!g) continue;
      if (g.type === 'Polygon' || g.type === 'MultiPolygon') { for (const pol of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) if (pol[0] && pol[0].length >= 4) { o.polys.push(anneau(pol[0])); for (const t of pol.slice(1)) if (t.length >= 4) o.trous.push(anneau(t)); } }
      else if (g.type === 'LineString' || g.type === 'MultiLineString') { for (const l of g.type === 'LineString' ? [g.coordinates] : g.coordinates) if (l.length >= 2) o.lignes.push(l.map(vers)); }
      else if (g.type === 'Point' || g.type === 'MultiPoint') { for (const c of g.type === 'Point' ? [g.coordinates] : g.coordinates) if (c) o.pts.push(vers(c)); }
      if (o.polys.length || o.lignes.length || o.pts.length) objets.push(o);
    }
    return { objets, axes: latPremier ? 'lat,lon' : 'lon,lat', pages, ordre };
  }
  return { objets: [], axes: null, pages: 0, ordre: null };
}
const histo = (liste, f, max = 25) => { const c = {}; for (const x of liste) { const v = String(f(x)); c[v] = (c[v] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, max).map(([v, n]) => `${v}×${n}`).join(' '); };
function coucheWFS(nom, quoi) { // le nom confirmé par GetCapabilities (ou un équivalent), sinon le nom donné
  if (!CAPS.wfs.length) { alerte(`${quoi} : capacités WFS inconnues, on essaie ${nom}`); return nom; }
  if (CAPS.wfs.includes(nom)) { log(`${quoi} : couche ${nom} confirmée par GetCapabilities (${CAPS.wfs.length} couches)`); return nom; }
  const fin = nom.split(':').pop(), autre = CAPS.wfs.find((x) => /bdtopo/i.test(x) && x.toLowerCase().endsWith(':' + fin.toLowerCase()));
  if (autre) { log(`${quoi} : ${nom} absente, on prend ${autre}`); return autre; }
  alerte(`${quoi} : ${nom} absente des capacités (${CAPS.wfs.length} couches)`); return null;
}
async function etapeBDTOPO(R, L) {
  const couche = coucheWFS(CONFIG.coucheBati, 'BD TOPO') || CONFIG.coucheBati; RAPPORT.sources.bdtopo = couche;
  const r = await wfsObjets(couche, R, L, 20, 'BD TOPO'); if (!r.objets.length) return [];
  log(`BD TOPO : ${r.objets.length} bâtiments en ${r.pages} page(s), BBOX en ${r.ordre}, coordonnées rendues en ${r.axes}`);
  RAPPORT.sources.bdtopoAxes = r.axes; RAPPORT.sources.bdtopoPages = r.pages;
  log(`BD TOPO : attributs ${Object.keys(r.objets[0].props).join(' ')}`);
  for (const k of Object.keys(r.objets[0].props).filter((x) => /materiau|etage|nature|usage/i.test(x))) log(`BD TOPO : ${k} = ${histo(r.objets, (o) => o.props[k])}`);
  const res = [];
  for (const o of r.objets) {
    const pr = o.props; if (/projet|d[ée]moli/i.test(pr.etat_de_l_objet || '')) continue;
    for (const p of o.polys) res.push({ p, props: { hauteur: pr.hauteur, nombre_d_etages: pr.nombre_d_etages, altitude_minimale_sol: pr.altitude_minimale_sol, nature: pr.nature, usage_1: pr.usage_1, cleabs: pr.cleabs, murs: pr.materiaux_des_murs, toiture: pr.materiaux_de_la_toiture } });
  }
  return res;
}
async function etapeBDTOPOAutres(R, L) { // zones de végétation, haies, constructions ponctuelles et linéaires, cimetières, terrains de sport (facultatifs : repli propre)
  const res = { vegetation: [], haies: [], ponctuel: [], lineaire: [], cimetiere: [], sport: [] };
  for (const [cle, nom, quoi] of [['vegetation', CONFIG.coucheVegetation, 'BD TOPO végétation'], ['haies', CONFIG.coucheHaie, 'BD TOPO haies'], ['ponctuel', CONFIG.couchePonctuelle, 'BD TOPO constructions ponctuelles'], ['lineaire', CONFIG.coucheLineaire, 'BD TOPO constructions linéaires'], ['cimetiere', CONFIG.coucheCimetiere, 'BD TOPO cimetières'], ['sport', CONFIG.coucheSport, 'BD TOPO terrains de sport']]) {
    const couche = coucheWFS(nom, quoi); if (!couche) { repli(`${quoi} : couche absente`); continue; }
    try {
      const r = await wfsObjets(couche, R, L, 30, quoi); res[cle] = r.objets.filter((o) => !/projet|d[ée]moli/i.test(o.props.etat_de_l_objet || ''));
      log(`${quoi} : ${res[cle].length} objets${res[cle].length && res[cle][0].props.nature !== undefined ? ' ; nature = ' + histo(res[cle], (o) => o.props.nature) : ''}${cle === 'haies' && res[cle].length ? ' ; hauteur = ' + histo(res[cle], (o) => o.props.hauteur, 8) + ' ; largeur = ' + histo(res[cle], (o) => o.props.largeur, 8) : ''}`);
      if (res[cle].length) RAPPORT.sources['bdtopo_' + cle] = couche;
    } catch (e) { repli(`${quoi} indisponible (${e.message.slice(0, 160)})`); }
  }
  return res;
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
async function capacitesWMSR() { // GetCapabilities du WMS-R (une fois) → { base, caps, noms }
  if (CAPS.wmsrCaps) return CAPS.wmsrCaps;
  let derniere = null;
  for (const b0 of [CONFIG.wmsr, CONFIG.wmsr.replace(/\/$/, '') + '/wms']) { // le service répond selon les cas sur /wms-r ou /wms-r/wms
    try {
      const caps = (await telecharger(`${b0}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`, { delai: 180000, essais: 3, valider: (b) => /WMS_Capabilities/.test(b.toString('utf8', 0, 6000)) ? true : 'pas des capacités WMS' })).toString('utf8');
      CAPS.wmsrCaps = { base: b0, caps, noms: [...caps.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1].trim()) }; return CAPS.wmsrCaps;
    } catch (e) { derniere = e; alerte(`WMS-R ${b0} : ${e.message.slice(0, 160)}`); }
  }
  throw derniere;
}
async function wmsBIL(couche, R, cx, cz, demi, W, min, max) { // GetMap image/x-bil;bits=32 (EPSG:4326) du carré de demi-côté demi centré sur (cx, cz) → grille de flottants (NaN hors données)
  const { base } = await capacitesWMSR(), H = W, [n, w] = R.ll(cx - demi, cz - demi), [s, e] = R.ll(cx + demi, cz + demi);
  const url = `${base}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${couche}&STYLES=&CRS=EPSG:4326&BBOX=${s.toFixed(7)},${w.toFixed(7)},${n.toFixed(7)},${e.toFixed(7)}&WIDTH=${W}&HEIGHT=${H}&FORMAT=${encodeURIComponent('image/x-bil;bits=32')}`;
  const buf = await telecharger(url, { delai: 180000, valider: (b) => b.length === W * H * 4 ? true : `${b.length} octets au lieu de ${W * H * 4} : ${b.toString('utf8', 0, 200).replace(/\s+/g, ' ')}` });
  const lire = (le) => { const v = new Float32Array(W * H); for (let i = 0; i < W * H; i++) v[i] = le ? buf.readFloatLE(i * 4) : buf.readFloatBE(i * 4); return v; };
  const plaus = (v) => { let k = 0; for (const x of v) if (x > min && x < max) k++; return k / v.length; };
  let v = lire(true), le = true; if (plaus(v) < 0.9) { const vb = lire(false); if (plaus(vb) > plaus(v)) { v = vb; le = false; } }
  let k = 0, mn = Infinity, mx = -Infinity, somme = 0; for (let i = 0; i < v.length; i++) { const x = v[i]; if (x > min && x < max) { k++; somme += x; if (x < mn) mn = x; if (x > mx) mx = x; } else v[i] = NaN; }
  const val = (lat, lon) => { // bilinéaire ; un coin sans donnée → le plus proche des coins valides
    const fx = clamp((lon - w) / (e - w) * W - 0.5, 0, W - 1.001), fy = clamp((n - lat) / (n - s) * H - 0.5, 0, H - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
    const c00 = v[j * W + i], c10 = v[j * W + i + 1], c01 = v[(j + 1) * W + i], c11 = v[(j + 1) * W + i + 1];
    if (c00 === c00 && c10 === c10 && c01 === c01 && c11 === c11) return (c00 * (1 - a) + c10 * a) * (1 - b) + (c01 * (1 - a) + c11 * a) * b;
    const c = [[c00, (1 - a) * (1 - b)], [c10, a * (1 - b)], [c01, (1 - a) * b], [c11, a * b]].filter(([x]) => x === x).sort((p, q) => q[1] - p[1]);
    return c.length ? c[0][0] : NaN;
  };
  return { v, W, H, le, valides: k / v.length, mn, mx, moy: k ? somme / k : NaN, val, xz: (x, z) => { const [la, lo] = R.ll(x, z); return val(la, lo); } };
}
async function altiWMS(R, L) { // → g(x, z) : altitude moyennée sur 10 m autour du point
  const { caps, noms } = await capacitesWMSR();
  const couche = noms.includes(CONFIG.coucheAlti) ? CONFIG.coucheAlti : noms.find((x) => /ELEVATIONGRIDCOVERAGE\.HIGHRES$/i.test(x)) || noms.find((x) => /ELEVATIONGRIDCOVERAGE/i.test(x));
  if (!couche) throw new Error(`aucune couche ELEVATIONGRIDCOVERAGE parmi ${noms.length}`);
  if (!/image\/x-bil;bits=32/i.test(caps)) alerte('WMS-R : le format image/x-bil;bits=32 n’est pas annoncé, on essaie quand même');
  log(`relief : couche ${couche}`);
  const h = L / 2 + 30, W = Math.min(2048, Math.ceil(h)), g = await wmsBIL(couche, R, 0, 0, h, W, -100, 5000);
  if (g.valides < 0.6) throw new Error('BIL illisible (valeurs aberrantes)');
  for (let i = 0; i < g.v.length; i++) if (g.v[i] !== g.v[i]) g.v[i] = g.moy;
  if (g.mx - g.mn > 900) throw new Error(`dénivelé invraisemblable (${g.mn}…${g.mx} m)`);
  log(`relief : ${W}×${W} px en ${g.le ? 'petit' : 'gros'}-boutiste, de ${g.mn.toFixed(1)} à ${g.mx.toFixed(1)} m`);
  return (x, z) => { let t = 0; for (let dz = -4; dz <= 4; dz += 2) for (let dx = -4; dx <= 4; dx += 2) t += g.xz(x + dx, z + dz); return t / 25; };
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

// ─── authenticité : matériaux des bâtiments, surfaces, murs, haies, mobilier, enseignes (OSM + BD TOPO ; rien d'inventé) ───
const MURS_FF = { 1: 'pierre', 2: 'pierre', 3: 'beton', 4: 'brique', 5: 'agglo', 6: 'bois' }, TOITS_FF = { 1: 'tuiles', 2: 'ardoise', 3: 'zinc', 4: 'beton' };
function mursFF(code, brut) { // materiaux_des_murs (codes des fichiers fonciers : un chiffre par matériau ; 0 indéterminé, 9 autres) → mur | null
  const m = [...new Set([...String(code == null ? '' : code)].map((c) => MURS_FF[c]).filter(Boolean))].map((x) => x === 'agglo' || x === 'beton' ? (brut ? 'beton' : 'crepi') : x);
  const u = [...new Set(m)]; return !u.length ? null : u.length === 1 ? u[0] : 'mixte'; // béton et parpaings d'une maison : enduits (crépi)
}
function toitFF(code) { for (const c of String(code == null ? '' : code)) if (TOITS_FF[c]) return TOITS_FF[c]; return null; } // le premier matériau cité
const MAT_OSM = [[/stone|sandstone|limestone|granite|pierre/i, 'pierre'], [/brick/i, 'brique'], [/concrete|cement/i, 'beton'], [/wood|timber/i, 'bois'], [/plaster|render|stucco/i, 'crepi']];
const TOIT_OSM = [[/tile|clay/i, 'tuiles'], [/slate/i, 'ardoise'], [/metal|zinc|tin|copper|steel|alumin/i, 'zinc'], [/concrete|asphalt|tar|gravel|bitumen|felt/i, 'beton'], [/glass/i, 'verre']];
const FORMES_OSM = { gabled: '2pans', gambrel: '2pans', saltbox: '2pans', hipped: 'croupe', 'half-hipped': 'croupe', side_hipped: 'croupe', mansard: 'croupe', flat: 'plat', pyramidal: 'pavillon', dome: 'fleche', onion: 'fleche', cone: 'fleche', spire: 'fleche' };
const parmi = (table, v) => { if (!v) return null; for (const [re, t] of table) if (re.test(v)) return t; return null; };
function materiaux(b, t) { // → { mur, toit, etages, forme, srcMur, srcToit } depuis la BD TOPO puis OSM (null : à déduire)
  const pr = b.props || {}, tg = b.tags, brut = t === 'annexe' || /industriel|agricole/i.test(pr.nature || '');
  let mur = mursFF(pr.murs, brut), srcMur = mur ? 'bdtopo' : null, toit = toitFF(pr.toiture), srcToit = toit ? 'bdtopo' : null;
  if (!mur) { mur = parmi(MAT_OSM, tg['building:material']); if (mur) srcMur = 'osm'; }
  if (!toit) { toit = parmi(TOIT_OSM, tg['roof:material']); if (toit) srcToit = 'osm'; }
  const e = +pr.nombre_d_etages > 0 ? +pr.nombre_d_etages : parseFloat(tg['building:levels']) > 0 ? Math.round(parseFloat(tg['building:levels'])) : null;
  return { mur, toit, etages: e && e <= 60 ? e : null, forme: FORMES_OSM[tg['roof:shape']] || null, srcMur, srcToit };
}
function toitCouleur(rgb, aireB) { // repli : le matériau du toit déduit de sa couleur moyenne sur la photo
  const [r, g, b] = rgb.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, s = mx - mn < 1e-6 ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  let hue = 0; if (mx - mn > 1e-6) hue = mx === r ? 60 * (((g - b) / (mx - mn) + 6) % 6) : mx === g ? 60 * ((b - r) / (mx - mn) + 2) : 60 * ((r - g) / (mx - mn) + 4);
  if ((hue < 45 || hue > 335) && s > 0.18 && r > b + 0.05) return 'tuiles'; // rouge-brun
  if (l < 0.4 && b >= r - 0.03) return 'ardoise'; // gris-bleu foncé
  if (s < 0.16 && l >= 0.55) return aireB > 300 ? 'beton' : 'zinc'; // gris clair
  if (s < 0.16) return b >= r ? 'ardoise' : 'tuiles'; // gris moyen : bleuté (ardoise) ou brunâtre (vieilles tuiles)
  return 'tuiles';
}
const SURF_TAG = [[/^(paving_stones|sett|cobblestone|unhewn_cobblestone|bricks|pavers|stone)/, 'paves'], [/^(asphalt|concrete|paved|chipseal|metal)/, 'asphalte'], [/^(gravel|fine_gravel|compacted|pebblestone|rock|shells)/, 'gravier'], [/^(grass|grass_paver|artificial_turf)/, 'herbe'], [/^(dirt|ground|earth|mud|sand|unpaved|soil|woodchips|clay)/, 'terre']];
const TYPES_SURF = ['asphalte', 'paves', 'gravier', 'herbe', 'terre', 'parking', 'cimetiere', 'terrain'];
function surfacesSol(ctx) { // le sol sous la photo (textures de détail) : seulement ce que les données disent
  const { h, objets, autres } = ctx, res = [];
  const ajout = (p0, t, eps = 0.5) => { const p = polygone(p0, eps, h, 8); if (p) res.push({ p, t, a: Math.abs(aire(p)) }); };
  for (const o of objets) {
    const t = o.tags; if (t.building || !o.polys.length) continue; let ty = null;
    if (t.highway && t.area === 'yes' || t['area:highway'] || t.place === 'square') ty = parmi(SURF_TAG, t.surface);
    else if (t.amenity === 'parking' && !/underground|multi-storey|rooftop/.test(t.parking || '')) ty = parmi(SURF_TAG, t.surface) === 'gravier' ? 'gravier' : 'parking';
    else if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') ty = 'cimetiere';
    else if (t.leisure === 'pitch' || t.leisure === 'track') ty = 'terrain';
    else if (t.leisure === 'playground') ty = parmi(SURF_TAG, t.surface);
    else if (/^(grass|meadow|village_green|recreation_ground)$/.test(t.landuse || '') || t.leisure === 'park' || t.leisure === 'garden' || t.natural === 'grassland') ty = 'herbe';
    else if (t.landuse === 'farmland') ty = 'terre';
    if (ty) for (const p of o.polys) ajout(p, ty, 1);
  }
  for (const o of objets) { // les voies en ligne dont le revêtement est tagué (l'asphalte des rues est déjà celui des rues)
    const t = o.tags; if (o.type !== 'way' || !t.highway || t.area === 'yes' || RUES_EXCLUES.test(t.highway) || t.tunnel) continue;
    let ty = parmi(SURF_TAG, t.surface); if (!ty && /^grade[2-5]$/.test(t.tracktype || '')) ty = t.tracktype === 'grade2' ? 'gravier' : 'terre';
    if (!ty || (ty === 'asphalte' && typeRue(t.highway) !== 'chemin')) continue;
    for (const l0 of o.lignes) for (const m of couperLigne(l0, h)) { const l = dp(m.l, 0.5); if (l.length >= 2) for (const p of tamponsValides(l, largeurRue(t), h)) if (Math.abs(aire(p)) > 2) res.push({ p: nettoyer(p), t: ty, a: Math.abs(aire(p)) }); }
  }
  const dejaTypes = (ty) => res.filter((s) => s.t === ty);
  for (const [cle, ty] of [['cimetiere', 'cimetiere'], ['sport', 'terrain']]) for (const o of autres[cle] || []) for (const p0 of o.polys) { // la BD TOPO là où OSM n'a rien
    const c = centroide(p0); if (dejaTypes(ty).some((s) => dedans(c[0], c[1], s.p))) continue; ajout(p0, ty, 1);
  }
  return res.filter((s) => s.p.length >= 3).sort((a, b) => b.a - a.a).map(({ p, t }) => ({ p, t })); // les grandes d'abord, les petites par-dessus
}
function pointRue(ctx, x, z, max = 40) { // le point le plus proche sur l'axe d'une voie → { d, q, r } | null
  let best = null;
  for (const r of ctx.idxRues.autour(x, z, max)) for (let i = 0; i + 1 < r.l.length; i++) {
    const a = r.l[i], b = r.l[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], d2 = dx * dx + dz * dz, t = d2 ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / d2, 0, 1) : 0, q = [a[0] + t * dx, a[1] + t * dz], d = Math.hypot(x - q[0], z - q[1]);
    if (d <= max && (!best || d < best.d)) best = { d, q, r, i };
  }
  return best;
}
const capVers = (dx, dz) => Math.atan2(-dx, -dz); // le yaw qui regarde dans la direction (dx, dz) (convention de ARCHITECTURE.md)
function decouperLigne(l, bon, pasD = 0.5, min = 0.8) { // garde les morceaux de la polyligne dont les points sont « bons » → [[x, z]…][]
  const d = densifier(l, pasD), res = []; let cur = [];
  const fin = () => { if (cur.length >= 2) { let lg = 0; for (let i = 1; i < cur.length; i++) lg += dist(cur[i - 1], cur[i]); if (lg >= min) res.push(cur); } cur = []; };
  for (const q of d) { if (bon(q)) cur.push(q); else fin(); } fin();
  return res;
}
function croisementsRues(ctx, l) { // les points où la polyligne croise l'axe d'une voie (avec la demi-largeur de la voie)
  const res = [], bb = boite(l);
  for (const r of ctx.idxRues.autour((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, Math.max(bb[2] - bb[0], bb[3] - bb[1]) / 2 + 2)) for (let i = 0; i + 1 < l.length; i++) for (let k = 0; k + 1 < r.l.length; k++) { const X = intersection(l[i], l[i + 1], r.l[k], r.l[k + 1]); if (X) res.push({ q: X, w: r.w }); }
  return res;
}
const DANS_BATI = (ctx, q, m = 0) => { for (const b of ctx.idx.autour(q[0], q[1], 1)) if (dedans(q[0], q[1], b.p) && (!m || distBord(q[0], q[1], b.p) > m)) return b; return null; };
const MURS_OSM = { wall: ['pierre', 1.8, 0.45], city_wall: ['enceinte', 5, 1.2], retaining_wall: ['soutenement', 1.5, 0.6], fence: ['cloture', 1.3, 0.08], gate: ['portail', 1.8, 0.12] };
function mursSol(ctx) { // murs, clôtures, portails (OSM barrier=*, BD TOPO construction_lineaire là où OSM n'a rien) ; jamais en travers d'une voie
  const { h, objets, autres } = ctx, res = [], stats = { osm: 0, bdtopo: 0, portails: 0 };
  const portes = objets.filter((o) => o.type === 'node' && o.tags.barrier === 'gate').map((o) => ({ q: o.pt, w: clamp(parseFloat(o.tags.width) || 3, 1, 6), surRue: (pointRue(ctx, o.pt[0], o.pt[1], 2) || { d: 9 }).d < 1 }));
  const poser = (l0, ty, H, e, src) => {
    const coupes = croisementsRues(ctx, l0), pp = portes.filter((p) => distBord(p.q[0], p.q[1], l0, false) < 0.6);
    const bon = (q) => !DANS_BATI(ctx, q, 0.15) && !coupes.some((c) => dist(c.q, q) < c.w / 2 + 0.6) && !pp.some((p) => dist(p.q, q) < p.w / 2);
    for (const morceau of decouperLigne(l0, bon)) { const l = nettoyer(dp(morceau, 0.15), false); if (l.length >= 2) { res.push({ l, h: r1(H), e, t: ty }); stats[src]++; } }
    for (const p of pp) { // le portail, fermé, dans l'axe du mur (sauf sur une voie : on laisse le passage)
      if (p.surRue || p.fait) continue; p.fait = true; const pr = procheDeLigne({ lignes: [l0] }, p.q); if (!pr) continue;
      let ux = 1, uz = 0; for (let i = 0; i + 1 < l0.length; i++) if (distSeg(p.q[0], p.q[1], l0[i][0], l0[i][1], l0[i + 1][0], l0[i + 1][1]) < 0.7) { const d = dist(l0[i], l0[i + 1]) || 1; ux = (l0[i + 1][0] - l0[i][0]) / d; uz = (l0[i + 1][1] - l0[i][1]) / d; break; }
      const a = [r1(pr.pt[0] - ux * p.w / 2), r1(pr.pt[1] - uz * p.w / 2)], b = [r1(pr.pt[0] + ux * p.w / 2), r1(pr.pt[1] + uz * p.w / 2)];
      if (Math.max(...a.map(Math.abs), ...b.map(Math.abs)) < h) { res.push({ l: [a, b], h: r1(Math.min(2.2, Math.max(1.2, H))), e: 0.12, t: 'portail' }); stats.portails++; }
    }
  };
  for (const o of objets) {
    const t = o.tags; if (o.type !== 'way') continue;
    const def = MURS_OSM[t.barrier] || (t.historic === 'city_walls' ? MURS_OSM.city_wall : null); if (!def) continue;
    const hh = parseFloat(t.height), H = hh > 0.3 && hh < 15 ? hh : def[1];
    for (const l0 of o.lignes) for (const m of couperLigne(l0, h)) poser(dp(m.l, 0.2), def[0], H, def[2], 'osm');
  }
  const osm = res.slice();
  for (const o of autres.lineaire || []) { // BD TOPO : les murs que OSM n'a pas
    const nat = String(o.props.nature || '') + ' ' + String(o.props.nature_detaillee || ''), ty = /sout[eè]nement/i.test(nat) ? 'soutenement' : /enceinte|rempart|fortif/i.test(nat) ? 'enceinte' : /cl[oô]ture/i.test(nat) ? 'cloture' : /\bmur\b/i.test(nat) && !/anti-bruit/i.test(nat) ? 'pierre' : null;
    if (!ty) continue; const def = Object.values(MURS_OSM).find((d) => d[0] === ty);
    for (const l0 of o.lignes) for (const m of couperLigne(l0, h)) {
      const d = densifier(m.l, 1), deja = d.filter((q) => osm.some((w) => distBord(q[0], q[1], w.l, false) < 1.5)).length; if (deja > d.length * 0.6) continue;
      poser(dp(m.l, 0.2), ty, def[1], def[2], 'bdtopo');
    }
  }
  return { murs: res, stats };
}
function haiesSol(ctx) { // haies : BD TOPO (hauteur, largeur) et OSM barrier=hedge ; coupées aux voies et aux bâtiments
  const { h, objets, autres } = ctx, res = [], stats = { bdtopo: 0, zone: 0, osm: 0 };
  const poser = (l0, H, W, src, mesure) => {
    const coupes = croisementsRues(ctx, l0), bon = (q) => !DANS_BATI(ctx, q, 0.1) && !coupes.some((c) => dist(c.q, q) < c.w / 2 + 0.5);
    for (const m of couperLigne(l0, h)) for (const morceau of decouperLigne(m.l, bon, 0.5, 1.5)) { const l = nettoyer(dp(morceau, 0.3), false); if (l.length >= 2) { res.push({ l, h: r1(H), w: r1(W), mesure }); stats[src]++; } }
  };
  for (const o of autres.haies || []) { const H = +o.props.hauteur, W = +o.props.largeur; for (const l of o.lignes) poser(l, H >= 0.5 && H <= 8 ? H : 1.8, W >= 0.4 && W <= 8 ? W : 1.0, 'bdtopo', !(H >= 0.5 && H <= 8)); }
  for (const z of autres.vegetation || []) { // les zones de végétation « Haie » de la BD TOPO : leur grand axe, quand elles sont allongées
    if (!/haie/i.test(z.props.nature || '')) continue;
    for (const p of z.polys) {
      const r = rectangle(p); if (!r) continue; const lg = dist(r.l[0], r.l[1]); if (r.w > 8 || lg < 3 * r.w || Math.abs(aire(p)) < 0.6 * lg * r.w) continue;
      const d = densifier(r.l, 1); if (d.filter((q) => res.some((x) => distBord(q[0], q[1], x.l, false) < 3)).length > d.length * 0.6) continue;
      poser(r.l, 1.8, clamp(r.w, 0.6, 6), 'zone', true);
    }
  }
  const bd = res.slice();
  for (const o of objets) {
    if (o.tags.barrier !== 'hedge' || o.type === 'node') continue; const H = parseFloat(o.tags.height), W = parseFloat(o.tags.width);
    for (const l0 of o.polys.length ? o.polys.map((p) => p.concat([p[0]])) : o.lignes) {
      const d = densifier(l0, 1), deja = d.filter((q) => bd.some((x) => distBord(q[0], q[1], x.l, false) < 2)).length; if (deja > d.length * 0.6) continue;
      poser(l0, H > 0.3 && H < 8 ? H : 1.8, W > 0.3 && W < 8 ? W : 1.0, 'osm', !(H > 0.3 && H < 8));
    }
  }
  return { haies: res, stats };
}
function typeMobilier(t) {
  if (t.highway === 'street_lamp') return 'lampadaire';
  if (t.amenity === 'bench' || t.leisure === 'bench') return 'banc';
  if (t.leisure === 'picnic_table' || t.amenity === 'picnic_table') return 'table';
  if (/^(fountain|drinking_water|water_point)$/.test(t.amenity || '') || t.man_made === 'water_well' && t.pump) return 'fontaine';
  if (/^(wayside_cross)$/.test(t.historic || '') || t.man_made === 'cross' || t.memorial === 'cross') return 'croix';
  if ((t.historic === 'memorial' && !/plaque|stolperstein|blue_plaque|stone/.test(t.memorial || '')) || t.historic === 'monument' || t.historic === 'wayside_shrine' || (t.tourism === 'artwork' && /statue|sculpture|bust|stele|installation/.test(t.artwork_type || ''))) return 'monument';
  if (t.highway === 'bus_stop' || t.public_transport === 'platform' || (t.amenity === 'shelter' && t.shelter_type === 'public_transport')) return t.shelter === 'yes' || t.amenity === 'shelter' ? 'abribus' : 'panneau';
  if (t.amenity === 'waste_basket' || (t.amenity === 'recycling' && t.recycling_type === 'container')) return 'poubelle';
  if (t.amenity === 'post_box') return 'boite';
  if (t.barrier === 'bollard') return 'borne';
  if (t.tourism === 'information' && /^(board|map)$/.test(t.information || '')) return 'panneau';
  return null;
}
const TYPES_MOBILIER = ['lampadaire', 'banc', 'fontaine', 'monument', 'abribus', 'poubelle', 'borne', 'croix', 'panneau', 'boite', 'table'];
function mobilierSol(ctx) { // le mobilier urbain d'OSM (et les calvaires, croix, fontaines de la BD TOPO absents d'OSM) ; yaw : face à la voie la plus proche, ou le tag direction
  const { h, objets, autres } = ctx, res = [], stats = { osm: 0, bdtopo: 0 };
  const poser = (q0, ty, n, dir, src) => {
    let q = q0.slice(); const b = DANS_BATI(ctx, q); // un objet dessiné dans un mur : posé dehors, contre la façade
    if (b) { let best = null, bd = Infinity; for (let i = 0; i < b.p.length; i++) { const a = b.p[i], c = b.p[(i + 1) % b.p.length], dx = c[0] - a[0], dz = c[1] - a[1], d2 = dx * dx + dz * dz, t = d2 ? clamp(((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / d2, 0, 1) : 0, p = [a[0] + t * dx, a[1] + t * dz], d = dist(p, q); if (d < bd) { bd = d; best = p; } } if (!best || bd > 3) return; const ux = best[0] - q[0], uz = best[1] - q[1], l = Math.hypot(ux, uz) || 1; q = [best[0] + ux / l * 0.4, best[1] + uz / l * 0.4]; if (DANS_BATI(ctx, q)) return; }
    if (Math.abs(q[0]) > h - 0.5 || Math.abs(q[1]) > h - 0.5) return;
    if (res.some((m) => m.t === ty && Math.hypot(m.x - q[0], m.z - q[1]) < (ty === 'borne' ? 0.5 : 1.5))) return;
    let yaw = null; const d = parseFloat(dir);
    if (isFinite(d)) yaw = -d * RAD; else if (ty !== 'lampadaire' && ty !== 'borne') { const pr = pointRue(ctx, q[0], q[1], 30); if (pr && pr.d > 0.2) yaw = capVers(pr.q[0] - q[0], pr.q[1] - q[1]); }
    const m = { x: r1(q[0]), z: r1(q[1]), t: ty }; if (yaw !== null) m.yaw = Math.round(Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 100) / 100; if (n) m.n = n;
    res.push(m); stats[src]++;
  };
  for (const o of objets) { const ty = typeMobilier(o.tags); if (ty && (o.type === 'node' || ty === 'abribus' || ty === 'monument' || ty === 'fontaine')) poser(o.pt, ty, o.tags.name, o.tags.direction, 'osm'); }
  for (const o of autres.ponctuel || []) { const nat = String(o.props.nature || '') + ' ' + String(o.props.nature_detaillee || ''), ty = /calvaire|croix/i.test(nat) ? 'croix' : /fontaine|lavoir/i.test(nat) ? 'fontaine' : /monument|statue/i.test(nat) ? 'monument' : null; if (ty) for (const q of o.pts) if (!res.some((m) => m.t === ty && Math.hypot(m.x - q[0], m.z - q[1]) < 12)) poser(q, ty, o.props.toponyme, null, 'bdtopo'); }
  return { mobilier: res, stats };
}
const ENSEIGNES = [[(t) => /^(bar|pub)$/.test(t.amenity), 'bar'], [(t) => t.amenity === 'cafe', 'cafe'], [(t) => /^(restaurant|fast_food)$/.test(t.amenity), 'restaurant'], [(t) => t.amenity === 'pharmacy' || t.healthcare === 'pharmacy', 'pharmacie'],
  [(t) => t.amenity === 'bank', 'banque'], [(t) => t.amenity === 'post_office', 'poste'], [(t) => t.amenity === 'townhall', 'mairie'], [(t) => /^(bakery|pastry|confectionery)$/.test(t.shop), 'boulangerie'], [(t) => /^(tobacco|newsagent|e-cigarette)$/.test(t.shop), 'tabac'],
  [(t) => t.shop === 'butcher', 'boucherie'], [(t) => /^(hairdresser|beauty)$/.test(t.shop), 'coiffure'], [(t) => /^(supermarket|convenience|greengrocer|deli)$/.test(t.shop), 'epicerie'], [(t) => t.shop === 'optician', 'optique'], [(t) => t.shop === 'jewelry', 'bijouterie'],
  [(t) => /^(clothes|shoes|boutique|fashion)$/.test(t.shop), 'vetements'], [(t) => /^(florist|garden_centre)$/.test(t.shop), 'fleuriste'], [(t) => t.amenity === 'police', 'gendarmerie'], [(t) => /^(doctors|dentist|clinic|hospital)$/.test(t.amenity) || (t.healthcare && t.healthcare !== 'pharmacy'), 'sante'],
  [(t) => /^(school|college|kindergarten)$/.test(t.amenity), 'ecole'], [(t) => t.amenity === 'library', 'bibliotheque'], [(t) => t.office === 'tourism' || (t.tourism === 'information' && t.information === 'office'), 'tourisme'], [(t) => /^(cinema|theatre|arts_centre)$/.test(t.amenity), 'culture'],
  [(t) => !!(t.shop || t.office || t.craft), 'commerce']];
function enseignesSol(ctx) { // commerces et services nommés : une enseigne sur la façade du bâtiment qui donne sur une voie, face à la voie
  const { objets, bats, batiments } = ctx, res = [], indexDe = new Map(bats.map((b, i) => [b, i]));
  for (const o of objets) {
    const t = o.tags, n = t.name; if (!n || t.amenity === 'place_of_worship') continue; const reg = ENSEIGNES.find(([f]) => f(t)); if (!reg) continue;
    const q = o.type === 'node' || !o.polys.length ? o.pt : centroide(o.polys[0]);
    let b = DANS_BATI(ctx, q); if (!b) { let bd = 15; for (const c of ctx.idx.autour(q[0], q[1], 16)) { const d = distBord(q[0], q[1], c.p); if (d < bd) { bd = d; b = c; } } } if (!b) continue;
    let best = null;
    for (let i = 0; i < b.p.length; i++) { // la façade : assez longue, pas mitoyenne, près du point et tournée vers une voie
      const a = b.p[i], c = b.p[(i + 1) % b.p.length], len = dist(a, c); if (len < 2.2) continue;
      const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len, m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2]; let nx = -uz, nz = ux; if (dedans(m[0] + nx * 0.3, m[1] + nz * 0.3, b.p)) { nx = -nx; nz = -nz; }
      const dehors = [m[0] + nx * 1.2, m[1] + nz * 1.2]; if (DANS_BATI(ctx, dehors)) continue; // mitoyenne
      const pr = pointRue(ctx, dehors[0], dehors[1], 60), dRue = pr ? Math.max(0, pr.d - pr.r.w / 2) : 60, face = pr ? ((pr.q[0] - m[0]) * nx + (pr.q[1] - m[1]) * nz) / (dist(pr.q, m) || 1) : 0;
      const s = dRue + 0.5 * distSeg(q[0], q[1], a[0], a[1], c[0], c[1]) - 3 * face;
      if (!best || s < best.s) best = { s, a, ux, uz, nx, nz, len };
    }
    if (!best) continue;
    let t0 = clamp((q[0] - best.a[0]) * best.ux + (q[1] - best.a[1]) * best.uz, 1, best.len - 1);
    for (let k = 0; k < 4 && res.some((e) => e.b === indexDe.get(b) && Math.hypot(e.x - (best.a[0] + best.ux * t0), e.z - (best.a[1] + best.uz * t0)) < 2.6); k++) t0 = t0 + 2.8 <= best.len - 1 ? t0 + 2.8 : clamp(t0 - 5.6, 1, best.len - 1);
    const x = best.a[0] + best.ux * t0 + best.nx * 0.12, z = best.a[1] + best.uz * t0 + best.nz * 0.12;
    const nom = String(n).length <= 60 ? String(n) : String(n).slice(0, 58).replace(/\s+\S*$/, '') + '…';
    res.push({ b: indexDe.get(b), n: nom, t: reg[1], x: r1(x), z: r1(z), yaw: Math.round(capVers(best.nx, best.nz) * 100) / 100 });
  }
  const vus = new Set(); return res.filter((e) => { const k = e.b + '|' + e.n; if (vus.has(k)) return false; vus.add(k); return batiments[e.b]; });
}

// ─── arbres réels : couronnes détectées (LiDAR HD : hauteur de canopée ; photo infrarouge : végétation), arbres OSM, zones BD TOPO ───
const ESPECES = ['feuillu', 'conifere', 'peuplier', 'platane', 'tilleul', 'fruitier', 'saule'];
const K_ESPECE = { feuillu: 2.4, conifere: 2.8, peuplier: 5, platane: 2.3, tilleul: 2.4, fruitier: 2.1, saule: 2.0 }; // h ≈ k·r quand le LiDAR manque
const rayonTronc = (a) => clamp(0.12 + 0.025 * (+a[2] || 8), 0.2, 0.6); // pour les points libres (monde.js décide du vrai rayon)
function especeOSM(t) { // species / genus / taxon / leaf_type → espèce du jeu | null
  const s = `${t.species || ''} ${t['species:fr'] || ''} ${t.genus || ''} ${t['genus:fr'] || ''} ${t.taxon || ''}`.toLowerCase();
  if (/platan/.test(s)) return 'platane'; if (/tilia|tilleul/.test(s)) return 'tilleul'; if (/populus|peuplier/.test(s)) return 'peuplier'; if (/salix|saule/.test(s)) return 'saule';
  if (/malus|pyrus|prunus (avium|cerasus|domestica|persica|armeniaca)|cydonia|pommier|poirier|cerisier|prunier|cognassier|abricotier|p[eê]cher/.test(s)) return 'fruitier';
  if (/pinus|picea|abies|cedrus|taxus|thuja|larix|pseudotsuga|cupressus|sequoia|juniperus|\bpin\b|sapin|[ée]pic[ée]a|c[eè]dre|\bif\b|m[ée]l[eè]ze|cypr[eè]s|thuya/.test(s)) return 'conifere';
  if (t.leaf_type === 'needleleaved') return 'conifere'; if (s.trim() || t.leaf_type === 'broadleaved') return 'feuillu';
  return null;
}
function rasterPolys(polys, L, N, cx = 0, cz = 0) { // pixels dont le centre est dans un des polygones (balayage par lignes)
  const m = new Uint8Array(N * N), k = N / L, h = L / 2;
  for (const p of polys) {
    const bb = boite(p), v0 = Math.max(0, Math.floor((bb[1] - cz + h) * k)), v1 = Math.min(N - 1, Math.ceil((bb[3] - cz + h) * k));
    for (let v = v0; v <= v1; v++) {
      const z = (v + 0.5) / k - h + cz, xs = [];
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (z - a[1]) * (b[0] - a[0]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) { const u0 = Math.max(0, Math.ceil((xs[q] - cx + h) * k - 0.5)), u1 = Math.min(N - 1, Math.floor((xs[q + 1] - cx + h) * k - 0.5)); for (let u = u0; u <= u1; u++) m[v * N + u] = 1; }
    }
  }
  return m;
}
function flouGauss(a, N, sigma) { // flou gaussien séparable (sigma en pixels)
  const r = Math.max(1, Math.ceil(sigma * 2.5)), w = new Float32Array(2 * r + 1); let s = 0; for (let i = -r; i <= r; i++) { w[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += w[i + r]; } for (let i = 0; i < w.length; i++) w[i] /= s;
  const t = new Float32Array(N * N), o = new Float32Array(N * N);
  for (let v = 0; v < N; v++) { const ligne = v * N; for (let u = 0; u < N; u++) { let x = 0; for (let i = -r; i <= r; i++) { const uu = u + i; x += a[ligne + (uu < 0 ? 0 : uu >= N ? N - 1 : uu)] * w[i + r]; } t[ligne + u] = x; } }
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { let x = 0; for (let i = -r; i <= r; i++) { const vv = v + i; x += t[(vv < 0 ? 0 : vv >= N ? N - 1 : vv) * N + u] * w[i + r]; } o[v * N + u] = x; }
  return o;
}
function otsu(vals, lo, hi, nb = 128) { // le seuil qui sépare le mieux deux populations
  const H = new Float64Array(nb); let n = 0; for (const v of vals) { if (!(v >= lo && v <= hi)) continue; H[Math.min(nb - 1, Math.floor((v - lo) / (hi - lo) * nb))]++; n++; }
  let sT = 0; for (let i = 0; i < nb; i++) sT += i * H[i];
  let wB = 0, sB = 0, best = -1, seuil = nb / 2;
  for (let i = 0; i < nb; i++) { wB += H[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * H[i]; const b = wB * wF * (sB / wB - (sT - sB) / wF) ** 2; if (b > best) { best = b; seuil = i + 1; } }
  return lo + seuil / nb * (hi - lo);
}
function morpho(m, N, eroder) { // érosion ou dilatation 3×3
  const o = new Uint8Array(N * N);
  for (let v = 1; v < N - 1; v++) for (let u = 1; u < N - 1; u++) { const k = v * N + u; let x = eroder ? 1 : 0; for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) { const y = m[k + dv * N + du]; if (eroder ? !y : y) x = eroder ? 0 : 1; } o[k] = x; }
  return o;
}
function enleverPetits(m, N, min) { // efface les taches (8-connexes) de moins de min pixels
  const vu = new Uint8Array(N * N), pile = new Int32Array(N * N), tache = [];
  for (let k0 = 0; k0 < N * N; k0++) {
    if (!m[k0] || vu[k0]) continue; let n = 0, sp = 0; pile[sp++] = k0; vu[k0] = 1; tache.length = 0;
    while (sp) { const k = pile[--sp]; tache.push(k); n++; const u = k % N, v = (k / N) | 0; for (let dv = -1; dv <= 1; dv++) for (let du = -1; du <= 1; du++) { const uu = u + du, vv = v + dv; if (uu < 0 || vv < 0 || uu >= N || vv >= N) continue; const k2 = vv * N + uu; if (m[k2] && !vu[k2]) { vu[k2] = 1; pile[sp++] = k2; } } }
    if (n < min) for (const k of tache) m[k] = 0;
  }
}
function distanceChanfrein(m, N, ps) { // distance (m) au bord du masque, chanfrein 3-4
  const d = new Float32Array(N * N); for (let k = 0; k < N * N; k++) d[k] = m[k] ? 1e9 : 0;
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { const k = v * N + u; if (!d[k]) continue; let x = d[k]; if (u > 0) x = Math.min(x, d[k - 1] + 3); if (v > 0) { x = Math.min(x, d[k - N] + 3); if (u > 0) x = Math.min(x, d[k - N - 1] + 4); if (u < N - 1) x = Math.min(x, d[k - N + 1] + 4); } d[k] = x; }
  for (let v = N - 1; v >= 0; v--) for (let u = N - 1; u >= 0; u--) { const k = v * N + u; if (!d[k]) continue; let x = d[k]; if (u < N - 1) x = Math.min(x, d[k + 1] + 3); if (v < N - 1) { x = Math.min(x, d[k + N] + 3); if (u < N - 1) x = Math.min(x, d[k + N + 1] + 4); if (u > 0) x = Math.min(x, d[k + N - 1] + 4); } d[k] = x; }
  for (let k = 0; k < N * N; k++) d[k] = d[k] / 3 * ps; return d;
}
function tas(n) { // file de priorité (le plus grand d'abord)
  const p = new Float32Array(n), id = new Int32Array(n); let t = 0;
  return {
    get taille() { return t; },
    pousser(v, k) { let i = t++; while (i > 0) { const j = (i - 1) >> 1; if (p[j] >= v) break; p[i] = p[j]; id[i] = id[j]; i = j; } p[i] = v; id[i] = k; },
    tirer() { const k = id[0], v = p[--t], kk = id[t]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= t) break; if (c + 1 < t && p[c + 1] > p[c]) c++; if (p[c] <= v) break; p[i] = p[c]; id[i] = id[c]; i = c; } p[i] = v; id[i] = kk; return k; },
  };
}
function detecterCouronnes({ N, L, rgb, irc, mnh, batiments }) { // → { couronnes: [{ x, z, r, h, nir, v }], seuilV, pixels }
  const ps = L / N, h = L / 2, NN = N * N, A = CONFIG.arbres, bat = masqueBatiments(batiments, L, N);
  const V = new Float32Array(NN), lum = new Float32Array(NN); // indice de végétation : (PIR − R) / (PIR + R) sur l'infrarouge, sinon un indice de vert
  for (let k = 0; k < NN; k++) {
    if (irc) { const nir = irc[3 * k], r = irc[3 * k + 1]; V[k] = (nir - r) / (nir + r + 1); lum[k] = nir; }
    else { const r = rgb[3 * k], g = rgb[3 * k + 1], b = rgb[3 * k + 2]; V[k] = (2 * g - r - b) / (r + g + b + 1); lum[k] = (r + g + b) / 3; }
  }
  const ech = []; for (let k = 0; k < NN; k += 7) if (bat[k] < 0.3) ech.push(V[k]);
  const sV = clamp(otsu(ech, -0.5, 0.9), irc ? 0.08 : 0.02, irc ? 0.45 : 0.25), T = new Uint8Array(NN);
  let tex = null, sT = 0;
  if (!mnh) { // sans LiDAR : la texture (écart-type local) sépare les couronnes des pelouses et des champs
    const m1 = flouGauss(lum, N, 1.2 / ps), m2 = flouGauss(lum.map((x) => x * x), N, 1.2 / ps); tex = new Float32Array(NN); for (let k = 0; k < NN; k++) tex[k] = Math.sqrt(Math.max(0, m2[k] - m1[k] * m1[k]));
    const e2 = []; for (let k = 0; k < NN; k += 7) if (V[k] > sV && bat[k] < 0.3) e2.push(tex[k]); sT = Math.max(6, otsu(e2, 0, 60));
  }
  for (let k = 0; k < NN; k++) { if (bat[k] >= 0.3) continue; T[k] = mnh ? (mnh[k] >= 2.5 && (V[k] > sV - 0.08 || (mnh[k] >= 6 && V[k] > sV - 0.18)) ? 1 : 0) : (V[k] > sV && tex[k] > sT ? 1 : 0); }
  const M = morpho(morpho(T, N, true), N, false); enleverPetits(M, N, Math.round(3 / (ps * ps))); // ouverture, puis les taches de moins de 3 m²
  let S; // la surface dont les sommets sont les cimes
  if (mnh) { const hm = new Float32Array(NN); for (let k = 0; k < NN; k++) hm[k] = M[k] ? mnh[k] : 0; S = flouGauss(hm, N, 0.5 / ps); for (let k = 0; k < NN; k++) if (!M[k]) S[k] = 0; }
  else { const D = distanceChanfrein(M, N, ps), B = flouGauss(lum, N, 1.0 / ps); let bm = 1; for (let k = 0; k < NN; k++) if (M[k] && B[k] > bm) bm = B[k]; S = new Float32Array(NN); for (let k = 0; k < NN; k++) S[k] = M[k] ? B[k] / bm + 0.35 * Math.min(D[k], 4) / 4 : 0; }
  // les cimes : maxima locaux dans un disque dont le rayon croît avec la hauteur
  const rp = Math.ceil(3.2 / ps), disque = []; for (let dv = -rp; dv <= rp; dv++) for (let du = -rp; du <= rp; du++) { const d = Math.hypot(du, dv); if (d > 0 && d <= rp) disque.push([du, dv, d]); } disque.sort((a, b) => a[2] - b[2]);
  const graines = [];
  for (let v = 1; v < N - 1; v++) for (let u = 1; u < N - 1; u++) {
    const k = v * N + u, s = S[k]; if (!M[k] || s <= 0 || (mnh && s < A.hauteurMin)) continue;
    if (S[k - 1] > s || S[k + 1] > s || S[k - N] > s || S[k + N] > s || S[k - N - 1] > s || S[k - N + 1] > s || S[k + N - 1] > s || S[k + N + 1] > s) continue;
    const w = (mnh ? clamp(0.9 + 0.07 * s, 1.3, 3.2) : 2.0) / ps; let ok = true;
    for (const [du, dv, d] of disque) { if (d > w) break; const uu = u + du, vv = v + dv; if (uu < 0 || vv < 0 || uu >= N || vv >= N) continue; const k2 = vv * N + uu, s2 = S[k2]; if (s2 > s || (s2 === s && k2 < k)) { ok = false; break; } }
    if (ok) graines.push(k);
  }
  // les couronnes : partage des eaux depuis les cimes (vers le bas), borné selon la hauteur
  const lab = new Int32Array(NN), file = tas(NN), r2max = new Float32Array(graines.length);
  graines.forEach((k, i) => { lab[k] = i + 1; r2max[i] = ((mnh ? clamp(0.45 * S[k] + 1.5, 2, 9) : 7) / ps) ** 2; file.pousser(S[k], k); });
  const VOIS = [1, -1, N, -N];
  while (file.taille) {
    const k = file.tirer(), l = lab[k], g = graines[l - 1], gu = g % N, gv = (g / N) | 0, u = k % N;
    for (let q = 0; q < 4; q++) { const k2 = k + VOIS[q]; if (k2 < 0 || k2 >= NN || (q < 2 && ((k2 % N) - u) ** 2 > 1)) continue; if (!M[k2] || lab[k2]) continue; const uu = k2 % N, vv = (k2 / N) | 0; if ((uu - gu) ** 2 + (vv - gv) ** 2 > r2max[l - 1]) continue; lab[k2] = l; file.pousser(S[k2], k2); }
  }
  const n = graines.length, cnt = new Float64Array(n), sx = new Float64Array(n), sz = new Float64Array(n), hmax = new Float32Array(n), snir = new Float64Array(n), sv = new Float64Array(n);
  for (let k = 0; k < NN; k++) { const l = lab[k]; if (!l) continue; const i = l - 1; cnt[i]++; sx[i] += k % N; sz[i] += (k / N) | 0; if (mnh && mnh[k] > hmax[i]) hmax[i] = mnh[k]; snir[i] += lum[k]; sv[i] += V[k]; }
  const res = [];
  for (let i = 0; i < n; i++) {
    const g = graines[i], gu = g % N, gv = (g / N) | 0; let r = Math.sqrt(cnt[i] * ps * ps / Math.PI); const hh = mnh ? Math.min(hmax[i], S[g] + 2) : null;
    if (r < A.rayonMin) { if (mnh && hh >= 5) r = A.rayonMin; else continue; }
    const fu = (gu + sx[i] / cnt[i]) / 2 + 0.5, fv = (gv + sz[i] / cnt[i]) / 2 + 0.5; // entre la cime et le centre de la couronne
    res.push({ x: -h + fu * ps, z: -h + fv * ps, r: Math.min(r, 10), h: hh, nir: snir[i] / cnt[i], v: sv[i] / cnt[i] });
  }
  let pixels = 0; for (let k = 0; k < NN; k++) pixels += M[k];
  return { couronnes: res, seuilV: sV, seuilTex: sT, pixels };
}
function choisirIRC() { // la couche infrarouge couleur du WMTS (sans millésime de préférence)
  const noms = Object.keys(CAPS.wmts); if (!noms.length) return CONFIG.coucheIRC;
  if (noms.includes(CONFIG.coucheIRC)) return CONFIG.coucheIRC;
  const irc = noms.filter((x) => /IRC/i.test(x) && /ORTHO/i.test(x)), an = (x) => +((x.match(/(19|20)\d\d/g) || ['0']).pop());
  return irc.find((x) => !/(19|20)\d\d/.test(x)) || irc.sort((a, b) => an(b) - an(a))[0] || null;
}
async function canopee(R, L, N) { // hauteur de la canopée (m) sur la grille N×N du carré : LiDAR HD MNH, sinon MNS − MNT → { h, src } | null
  const { noms } = await capacitesWMSR(), A = CONFIG.arbres, W = Math.min(2048, Math.ceil((L + 20) / A.pasMNH)), d = L / 2 + 10, h = L / 2;
  const trouve = (c, re) => noms.includes(c) ? c : noms.find((x) => re.test(x)) || null;
  const grille = (f) => { const out = new Float32Array(N * N); for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { const x = f(-h + (u + 0.5) * L / N, -h + (v + 0.5) * L / N); out[v * N + u] = x === x && x > 0 ? x : 0; } return out; };
  const mnhC = trouve(CONFIG.coucheMNH, /LIDAR-HD_MNH_ELEVATION\.ELEVATIONGRIDCOVERAGE\.WGS84G$/);
  if (mnhC) try {
    const g = await wmsBIL(mnhC, R, 0, 0, d, W, -5, 90);
    log(`MNH : ${mnhC}, ${W}×${W} px (${(2 * d / W).toFixed(2)} m/px), ${(100 * g.valides).toFixed(0)} % couverts, de ${(+g.mn).toFixed(1)} à ${(+g.mx).toFixed(1)} m`);
    if (g.valides > 0.5 && g.mx > 3) return { h: grille(g.xz), src: mnhC };
    alerte(`MNH : ${(100 * g.valides).toFixed(0)} % de points couverts, maximum ${g.mx} m : inutilisable`);
  } catch (e) { alerte(`MNH : ${e.message.slice(0, 200)}`); }
  const mnsC = trouve(CONFIG.coucheMNS, /LIDAR-HD_MNS_ELEVATION\.ELEVATIONGRIDCOVERAGE\.WGS84G$/), mntC = trouve(CONFIG.coucheMNT, /LIDAR-HD_MNT_ELEVATION\.ELEVATIONGRIDCOVERAGE\.WGS84G$/);
  if (mnsC && mntC) try {
    const s = await wmsBIL(mnsC, R, 0, 0, d, W, -100, 5000), t = await wmsBIL(mntC, R, 0, 0, d, W, -100, 5000);
    log(`MNS − MNT : ${(100 * s.valides).toFixed(0)} % et ${(100 * t.valides).toFixed(0)} % couverts`);
    if (s.valides > 0.5 && t.valides > 0.5) { repli('hauteur de canopée = MNS − MNT du LiDAR HD'); return { h: grille((x, z) => s.xz(x, z) - t.xz(x, z)), src: `${mnsC} − ${mntC}` }; }
  } catch (e) { alerte(`MNS − MNT : ${e.message.slice(0, 200)}`); }
  repli('LiDAR HD indisponible : hauteurs des arbres estimées de leur couronne'); return null;
}
function sortirDe(q, p, marge) { // le point du bord de p le plus proche de q, poussé de marge vers l'extérieur
  let best = null, bd = Infinity; for (let i = 0; i < p.length; i++) { const a = p[i], c = p[(i + 1) % p.length], dx = c[0] - a[0], dz = c[1] - a[1], d2 = dx * dx + dz * dz, t = d2 ? clamp(((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / d2, 0, 1) : 0, s = [a[0] + t * dx, a[1] + t * dz], d = dist(s, q); if (d < bd) { bd = d; best = s; } }
  if (!best) return null; const ux = best[0] - q[0], uz = best[1] - q[1], l = Math.hypot(ux, uz); if (l < 1e-6) return null; return [best[0] + ux / l * marge, best[1] + uz / l * marge];
}
async function etapeArbres(R, L, carte, info, o) {
  const A = CONFIG.arbres, h = L / 2, ctx = info.ctx, N = o ? o.N : CONFIG.sol[0], ps = L / N, rnd = mulberry32(CONFIG.graine + 7);
  const st = { couronnes: 0, fusionOSM: 0, osm: 0, rangees: 0, semes: 0, ecartes: 0, raisons: {}, haies: 0, coupes: 0, especes: {}, sources: {} };
  let mnh = null, irc = null;
  if (o) {
    try { const c = await canopee(R, L, N); if (c) { mnh = c.h; st.sources.hauteur = c.src; } } catch (e) { alerte(`canopée : ${e.message.slice(0, 200)}`); }
    const couche = choisirIRC();
    if (couche) { const inf = CAPS.wmts[couche], zz = Math.min(CONFIG.zoomOrtho, inf ? inf.max : CONFIG.zoomOrtho); for (const z of [zz, zz - 1]) { try { irc = (await mosaique(couche, z, R, 0, 0, L, N, 'infrarouge')).img; st.sources.vegetation = `${couche} zoom ${z}`; break; } catch (e) { alerte(`infrarouge au zoom ${z} : ${e.message.slice(0, 200)}`); } } }
    if (!irc) repli('photo infrarouge (IRC) indisponible : indice de végétation tiré de la photo couleur');
  }
  const mnhAu = (q, r = 1.5) => { if (!mnh) return 0; let m = 0; const u0 = Math.floor((q[0] + h) / ps), v0 = Math.floor((q[1] + h) / ps), k = Math.ceil(r / ps); for (let v = v0 - k; v <= v0 + k; v++) for (let u = u0 - k; u <= u0 + k; u++) if (u >= 0 && v >= 0 && u < N && v < N && mnh[v * N + u] > m) m = mnh[v * N + u]; return m; };
  let cs = [];
  if (o && (mnh || irc)) {
    const d = detecterCouronnes({ N, L, rgb: o.brut, irc, mnh, batiments: carte.batiments }); cs = d.couronnes; st.couronnes = cs.length;
    log(`arbres : ${cs.length} couronnes détectées (${mnh ? 'LiDAR HD' : 'texture'} + ${irc ? 'infrarouge' : 'photo couleur'} ; seuil de végétation ${d.seuilV.toFixed(3)}${mnh ? '' : `, de texture ${d.seuilTex.toFixed(1)}`} ; ${(d.pixels * ps * ps / 1e4).toFixed(2)} ha de couronnes)`);
  } else repli('ni LiDAR ni infrarouge : arbres OSM, rangées et semis dans les bois');
  // les zones : BD TOPO (nature) et OSM (vergers, bois et leaf_type)
  const PRIO = { fruitier: 6, peuplier: 5, conifere: 4, mixte: 3, feuillu: 3, bois: 1, haie: 0, vigne: 0 }, zones = [];
  for (const z of info.autres.vegetation || []) { const nat = String(z.props.nature || ''), c = /conif/i.test(nat) ? 'conifere' : /peupl/i.test(nat) ? 'peuplier' : /verger/i.test(nat) ? 'fruitier' : /mixte/i.test(nat) ? 'mixte' : /feuill/i.test(nat) ? 'feuillu' : /haie/i.test(nat) ? 'haie' : /vigne/i.test(nat) ? 'vigne' : 'bois'; for (const p of z.polys) zones.push({ p, b: boite(p), c, trous: z.trous }); }
  for (const ob of ctx.objets) { const t = ob.tags, c = t.landuse === 'orchard' ? 'fruitier' : t.natural === 'wood' || t.landuse === 'forest' ? ({ needleleaved: 'conifere', mixed: 'mixte', broadleaved: 'feuillu' }[t.leaf_type] || 'bois') : null; if (c) for (const p of ob.polys) zones.push({ p, b: boite(p), c, trous: ob.trous, osm: true }); }
  const zoneDe = (x, z) => { let best = null; for (const zn of zones) if (x >= zn.b[0] && x <= zn.b[2] && z >= zn.b[1] && z <= zn.b[3] && dedans(x, z, zn.p) && !zn.trous.some((t) => dedans(x, z, t)) && (!best || PRIO[zn.c] > PRIO[best.c])) best = zn; return best; };
  // le tronc : jamais dans un bâtiment, dans l'eau ni sur la chaussée (décalé de moins d'un rayon, sinon l'arbre est écarté)
  const surPont = (q) => carte.ponts.some((p) => distSeg(q[0], q[1], p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2 + 0.5);
  const placer = (c) => { // → [x, z] | 'bâtiment' | 'eau' | 'chaussée' | 'bord'
    let q = [c.x, c.z]; const lim = Math.max(1.2, c.r), limEau = Math.max(4, 2.5 * c.r); // au bord de l'eau, la rive OSM passe souvent sous les couronnes : l'arbre est ramené sur la berge
    for (let essai = 0; essai < 4; essai++) {
      if (Math.abs(q[0]) > h - 0.6 || Math.abs(q[1]) > h - 0.6) return 'bord';
      const b = DANS_BATI(ctx, q); if (b) { q = sortirDe(q, b.p, 0.6); if (!q || dist(q, [c.x, c.z]) > lim) return 'bâtiment'; continue; }
      const e = carte.eau.find((x) => dedans(q[0], q[1], x.p)); if (e) { if (surPont(q)) return 'eau'; q = sortirDe(q, e.p, 0.8); if (!q || dist(q, [c.x, c.z]) > limEau) return 'eau'; continue; }
      const pr = pointRue(ctx, q[0], q[1], 12); if (pr && pr.d < pr.r.w / 2 + 0.3) { const a = pr.r.l[pr.i], b2 = pr.r.l[pr.i + 1], l = dist(a, b2) || 1; let nx = -(b2[1] - a[1]) / l, nz = (b2[0] - a[0]) / l; if ((q[0] - pr.q[0]) * nx + (q[1] - pr.q[1]) * nz < 0) { nx = -nx; nz = -nz; } q = [pr.q[0] + nx * (pr.r.w / 2 + 0.6), pr.q[1] + nz * (pr.r.w / 2 + 0.6)]; if (dist(q, [c.x, c.z]) > lim) return 'chaussée'; continue; }
      return q;
    }
    return 'bâtiment';
  };
  // les arbres OSM : ils donnent la position du tronc et l'espèce de la couronne qu'ils touchent, sinon ils s'ajoutent
  const idxC = grille(10); cs.forEach((c) => idxC.ajouter([c.x, c.z, c.x, c.z], c));
  for (const ob of ctx.objets) {
    if (ob.type !== 'node' || ob.tags.natural !== 'tree' || Math.abs(ob.pt[0]) > h - 1 || Math.abs(ob.pt[1]) > h - 1) continue;
    const t = ob.tags, e = especeOSM(t), ht = parseFloat(t.height), dc = parseFloat(t.diameter_crown); let best = null, bd = Infinity;
    for (const c of idxC.autour(ob.pt[0], ob.pt[1], 8)) { if (c.osm) continue; const d = Math.hypot(c.x - ob.pt[0], c.z - ob.pt[1]); if (d < Math.max(2.5, 0.9 * c.r) && d < bd) { bd = d; best = c; } }
    if (best) { best.x = ob.pt[0]; best.z = ob.pt[1]; best.osm = true; if (e) best.e = e; if (!best.h && ht > 2 && ht < 45) best.h = ht; st.fusionOSM++; continue; }
    const m = mnhAu(ob.pt, 2), hh = ht > 2 && ht < 45 ? ht : m >= 3 ? m : mnh ? 4 : 7;
    cs.push({ x: ob.pt[0], z: ob.pt[1], h: hh, r: dc > 1 && dc < 30 ? dc / 2 : hh / 2.6, e, osm: true }); st.osm++;
  }
  // les rangées d'arbres OSM : les couronnes posées dessus y sont ramenées ; un arbre tous les 8 m là où rien n'a été vu (et où le LiDAR voit de la végétation)
  for (const ob of ctx.objets) if (ob.tags.natural === 'tree_row') for (const l0 of ob.lignes) for (const m of couperLigne(l0, h - 1)) {
    const e = especeOSM(ob.tags), ht = parseFloat(ob.tags.height);
    for (const c of cs) if (!c.osm && distBord(c.x, c.z, m.l, false) < 3) { const pr = procheDeLigne({ lignes: [m.l] }, [c.x, c.z]); c.x = pr.pt[0]; c.z = pr.pt[1]; c.rangee = true; if (e) c.e = e; }
    for (const q of densifier(m.l, 8)) { if (cs.some((c) => Math.hypot(c.x - q[0], c.z - q[1]) < 4) || (mnh && mnhAu(q, 2) < 2)) continue; const hh = ht > 2 && ht < 45 ? ht : mnhAu(q, 2) >= 3 ? mnhAu(q, 2) : 7; cs.push({ x: q[0], z: q[1], h: hh, r: hh / 2.6, e, rangee: true }); st.rangees++; }
  }
  if (!cs.length || !(mnh || irc)) { // repli : un semis dans les bois (OSM et BD TOPO), comme avant
    const obs = obstacles(L, carte.batiments, carte.interdit, carte.eau, carte.ponts), { espacement: es, max } = CONFIG.arbresBois;
    for (const zn of zones.filter((x) => /bois|feuillu|conifere|mixte|peuplier|fruitier/.test(x.c))) for (let x = zn.b[0] + es / 2; x < zn.b[2]; x += es) for (let z = zn.b[1] + es / 2; z < zn.b[3]; z += es) {
      if (st.semes >= max) break; const q = [x + (rnd() - 0.5) * es * 0.7, z + (rnd() - 0.5) * es * 0.7];
      if (Math.abs(q[0]) > h - 2 || Math.abs(q[1]) > h - 2 || !dedans(q[0], q[1], zn.p) || zn.trous.some((t) => dedans(q[0], q[1], t)) || !obs.libre(q[0], q[1], 1.5)) continue;
      const pr = pointRue(ctx, q[0], q[1], 8); if (pr && pr.d < pr.r.w / 2 + 1.2) continue;
      if (cs.some((c) => Math.hypot(c.x - q[0], c.z - q[1]) < es * 0.6)) continue;
      const hh = 7 + rnd() * 6; cs.push({ x: q[0], z: q[1], h: hh, r: hh / 2.5, seme: true }); st.semes++;
    }
  }
  // les haies basses ne sont pas des arbres
  for (const c of cs) if (!c.osm && !c.rangee) for (const hz of carte.haies) if (distBord(c.x, c.z, hz.l, false) < hz.w / 2 + 0.6 && (mnh ? (c.h || 0) <= hz.h + 1.5 : c.r < 2)) { c.haie = true; st.haies++; break; }
  cs = cs.filter((c) => !c.haie);
  // les espèces
  const nirs = cs.filter((c) => c.nir).map((c) => c.nir).sort((a, b) => a - b), nirMed = nirs.length ? nirs[nirs.length >> 1] : 0;
  const rivieres = carte.eau.filter((e) => e.t === 'riviere'), dEau = (c, liste) => { let d = Infinity; for (const e of liste) { if (dedans(c.x, c.z, e.p)) return 0; d = Math.min(d, distBord(c.x, c.z, e.p)); } return d; };
  const places = ctx.objets.filter((ob) => ob.polys.length && !ob.tags.building && (ob.tags.place === 'square' || (ob.tags.highway === 'pedestrian' && ob.tags.area === 'yes') || /^place\b/i.test(ob.tags.name || ''))).flatMap((ob) => ob.polys);
  for (const c of cs) {
    if (c.e) continue; const zn = zoneDe(c.x, c.z); c.zone = zn ? zn.c : null; c.dRiv = dEau(c, rivieres); c.dEau = Math.min(c.dRiv, dEau(c, carte.eau.filter((e) => e.t !== 'riviere')));
    if (c.zone === 'fruitier' || c.zone === 'peuplier' || c.zone === 'conifere' || c.zone === 'feuillu') { c.e = c.zone; continue; }
    if (c.zone === 'mixte' || c.zone === 'bois') { if (irc && c.nir && c.nir < nirMed * 0.78) c.e = 'conifere'; continue; }
  }
  const candP = cs.filter((c) => !c.e && c.dRiv <= 40 && c.r <= 3.6 && (!mnh || (c.h || 0) >= 14)); // peupliers : couronnes étroites, en file (≥ 3, à moins de 15 m l'une de l'autre) près de la rivière
  for (const c of candP) { if (c.chaine) continue; const ch = [c]; c.chaine = ch; for (let i = 0; i < ch.length; i++) for (const d of candP) if (!d.chaine && Math.hypot(d.x - ch[i].x, d.z - ch[i].z) <= 15) { d.chaine = ch; ch.push(d); } if (ch.length >= 3) for (const d of ch) d.e = 'peuplier'; }
  for (const c of cs) if (!c.e && !c.zone && places.some((p) => dedans(c.x, c.z, p) || distBord(c.x, c.z, p) < 5)) c.e = 'platane'; // les arbres des places
  const groupes = new Map(); // alignements le long des rues : au moins trois couronnes espacées de 3,5 à 16 m, du même côté
  for (const c of cs) { if (c.e || c.zone) continue; const pr = pointRue(ctx, c.x, c.z, 14); if (!pr || pr.r.t === 'chemin' || pr.d > pr.r.w / 2 + 5) continue; let s = 0; for (let i = 0; i < pr.i; i++) s += dist(pr.r.l[i], pr.r.l[i + 1]); s += dist(pr.r.l[pr.i], pr.q); const a = pr.r.l[pr.i], b = pr.r.l[pr.i + 1], cote = Math.sign((b[0] - a[0]) * (c.z - a[1]) - (b[1] - a[1]) * (c.x - a[0])); const k = pr.r; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push({ c, s, cote, d: pr.d }); }
  for (const g of groupes.values()) for (const cote of [-1, 1]) {
    const l = g.filter((x) => x.cote === cote).sort((a, b) => a.s - b.s); let run = [];
    const fin = () => { if (run.length >= 3) for (const x of run) x.c.e = 'tilleul'; run = []; };
    for (const x of l) { const p = run[run.length - 1]; if (p && x.s - p.s >= 3.5 && x.s - p.s <= 16 && Math.abs(x.d - p.d) < 2.5) run.push(x); else { fin(); run = [x]; } } fin();
  }
  for (const c of cs) if (!c.e && mnh && c.dEau <= 8 && (c.h || 0) <= 12 && c.r >= 2.2) c.e = 'saule'; // saules : larges et bas, au bord de l'eau
  for (const c of cs) if (!c.e && irc && c.nir && c.nir < nirMed * 0.68 && (!mnh || (c.h || 0) / c.r >= 2.8)) c.e = 'conifere'; // sombres dans l'infrarouge et élancés
  // la sortie [x, z, h, r, e]
  const arbres = [];
  for (const c of cs) {
    const e = c.e || 'feuillu', q = placer(c); if (typeof q === 'string') { st.ecartes++; st.raisons[q] = (st.raisons[q] || 0) + 1; continue; }
    const r = clamp(c.r, 0.8, 12), hh = clamp(c.h || K_ESPECE[e] * r, 2.5, 40);
    arbres.push([r1(q[0]), r1(q[1]), r1(hh), r1(r), e]);
  }
  if (arbres.length > A.max) { arbres.sort((a, b) => b[2] * b[3] - a[2] * a[3]); st.coupes = arbres.length - A.max; arbres.length = A.max; }
  arbres.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const a of arbres) st.especes[a[4]] = (st.especes[a[4]] || 0) + 1;
  carte.arbres = arbres;
  // les haies de hauteur inconnue : mesurée sur le LiDAR
  // la hauteur des haies : mesurée sur le LiDAR quand il est là (médiane le long de la haie), sinon la BD TOPO ou OSM
  let hMes = 0; for (const hz of carte.haies) { if (mnh) { const v = densifier(hz.l, 1).map((q) => mnhAu(q, Math.max(0.5, hz.w / 2))).filter((x) => x >= 0.5).sort((a, b) => a - b); if (v.length >= 3) { hz.h = r1(clamp(v[v.length >> 1], 0.8, 6)); hMes++; } } delete hz.mesure; }
  st.haiesMesurees = hMes;
  log(`arbres : ${arbres.length} (${st.couronnes} couronnes, ${st.fusionOSM} reconnues par OSM, ${st.osm} OSM ajoutés, ${st.rangees} de rangées, ${st.semes} semés, ${st.ecartes} écartés, ${st.haies} haies basses, ${st.coupes} au-delà du maximum) ${JSON.stringify(st.especes)}`);
  info.arbres = st; info.mnh = mnh; info.irc = !!irc;
  return st;
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
function assembler(R, L, objets, bdtopo, relief, autres = {}) {
  const h = L / 2, rnd = mulberry32(CONFIG.graine), dedansCarre = (q, m = 0) => Math.abs(q[0]) <= h - m && Math.abs(q[1]) <= h - m;
  const de = (f) => objets.filter((o) => f(o.tags, o));

  // ── bâtiments : BD TOPO d'abord, enrichis des tags OSM ; les bâtiments OSM ajoutés s'ils ne recouvrent rien ──
  const bats = [], idx = grille(20);
  const ajouterBati = (p, props, tags, src) => { const b = { p, props, tags: Object.assign({}, tags), src, aire: Math.abs(aire(p)), boite: boite(p) }; b.ech = echantillons(p, Math.max(0.7, Math.sqrt(b.aire) / 14)); bats.push(b); idx.ajouter(b.boite, b); return b; };
  for (const b of bdtopo) { const p = polygone(b.p, 0.3, h, 3); if (p) ajouterBati(p, b.props, {}, 'bdtopo'); }
  const nBD = bats.length; let nOSM = 0;
  const TAGS_UTILES = /^(name|building|amenity|historic|shop|man_made|height|building:levels|tourism|religion|tower:type|roof:shape|roof:material|building:material|office|craft|healthcare)$/;
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
  const mats = [], batiments = bats.map((b) => { // + matériaux, étages et forme du toit quand les données les donnent (le reste est déduit après la photo)
    const t = typeBati(b), r = { p: b.p, h: hauteurBati(b), t }; if (/^(eglise|chateau|mairie)$/.test(t) && b.tags.name) r.n = b.tags.name; b.t = t;
    const m = materiaux(b, t); if (m.mur) r.mur = m.mur; if (m.toit) r.toit = m.toit; if (m.etages) r.etages = m.etages; if (m.forme) r.forme = m.forme; mats.push(m); return r;
  });
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
    : t.landuse === 'orchard' ? 'verger' : t.leisure === 'garden' || /^(allotments|plant_nursery)$/.test(t.landuse || '') ? 'jardin'
    : /^(meadow|grass|farmland|village_green|recreation_ground|greenfield)$/.test(t.landuse || '') || /^(grassland|heath)$/.test(t.natural || '') || t.leisure === 'park' ? 'pre' : null;
  const vegetation = [], bois = [];
  for (const o of objets) { const ty = typeVeg(o.tags); if (!ty) continue; for (const p0 of o.polys) { const p = polygone(p0, 1, h, 50); if (!p) continue; vegetation.push({ p, t: ty }); if (ty === 'bois') bois.push({ p, trous: o.trous }); } }
  for (const z of autres.vegetation || []) { const ty = /vigne/i.test(z.props.nature || '') ? 'vigne' : /verger/i.test(z.props.nature || '') ? 'verger' : null; if (!ty) continue; for (const p0 of z.polys) { // vignes et vergers de la BD TOPO absents d'OSM
    const c = centroide(p0); if (vegetation.some((v) => v.t === ty && dedans(c[0], c[1], v.p))) continue; const p = polygone(p0, 1, h, 50); if (p) vegetation.push({ p, t: ty });
  } }

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

  // ── le décor réel : surfaces, murs, haies, mobilier, enseignes (les arbres viennent après la photo) ──
  const ctx = { h, objets, bats, batiments, rues, idxRues, idx, autres };
  const surfSol = surfacesSol(ctx), { murs, stats: stMurs } = mursSol(ctx), { haies, stats: stHaies } = haiesSol(ctx), { mobilier, stats: stMob } = mobilierSol(ctx), enseignes = enseignesSol(ctx);
  log(`décor : ${surfSol.length} surfaces ${JSON.stringify(compter(surfSol, (x) => x.t))} ; ${murs.length} murs ${JSON.stringify(compter(murs, (x) => x.t))} ; ${haies.length} haies ; ${mobilier.length} mobilier ${JSON.stringify(compter(mobilier, (x) => x.t))} ; ${enseignes.length} enseignes`);

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

  // ── zones de jeu : calculées après les arbres (les troncs et les murs bloquent aussi) ──
  const an = new Date().getFullYear(), ign = ['BD ORTHO®', 'BD TOPO®', 'RGE ALTI®'].filter((x) => x !== 'RGE ALTI®' || RAPPORT.sources.alti !== 'plat');
  const carte = {
    v: 1, nom: 'Poncin', source: 'ign-osm', attribution: `© IGN ${an} – ${ign.join(', ')} · © contributeurs OpenStreetMap ${an}`,
    origine: { lat: R.lat0, lon: R.lon0 }, taille: L, relief,
    batiments, rues, eau: eau.map((e) => { const r = { p: e.p, t: e.t }; if (e.n) r.n = e.n; return r; }),
    ponts: ponts.map((p) => ({ l: p.l, w: p.w })), vegetation, arbres: [], interdit, noms: noms.map(({ n, x, z }) => ({ n, x, z })), sol: null, zones: null,
    haies, surfaces: surfSol, murs, mobilier, enseignes,
  };
  const mouilles = batiments.filter((b) => { const q = centroide(b.p); return eau.some((e) => dedans(q[0], q[1], e.p)); }).length;
  if (mouilles) alerte(`${mouilles} bâtiment(s) ont leur centre dans l’eau`);
  const info = { mouilles, deduits, allonges, ponts, nBD, nOSM, compte, lignesEau, nomChateau, mats, ctx, autres, stMurs, stHaies, stMob, zonesArgs: { h, objets, bats, rues, ponts, sorties, rnd } };
  return { carte, info };
}
function obstacles(L, batiments, interdit, eau, ponts, extra = {}) { // libre(x, z, marge), degagement(x, z), coupe(a, b) : bâtiments, zones interdites, eau hors des ponts, troncs et murs
  const h = L / 2, g = grille(12), tous = [], gT = grille(6), gM = grille(12);
  const ajouter = (p, estEau) => { const o = { p, b: boite(p), eau: estEau }; g.ajouter(o.b, o); tous.push(o); };
  batiments.forEach((b) => ajouter(b.p, false)); interdit.forEach((z) => ajouter(z.p, false)); eau.forEach((e) => ajouter(e.p, true));
  for (const a of extra.arbres || []) { const r = rayonTronc(a); gT.ajouter([a[0] - r, a[1] - r, a[0] + r, a[1] + r], { x: a[0], z: a[1], r }); }
  for (const m of extra.murs || []) for (let i = 0; i + 1 < m.l.length; i++) { const a = m.l[i], b = m.l[i + 1]; gM.ajouter(boite([a, b]), { a, b, e: m.e || 0.3 }); }
  const surPont = (x, z) => ponts.some((p) => distSeg(x, z, p.l[0][0], p.l[0][1], p.l[1][0], p.l[1][1]) <= p.w / 2);
  function libre(x, z, m = 0.5) {
    if (Math.abs(x) > h - 2 - m || Math.abs(z) > h - 2 - m) return false;
    let pont = null;
    for (const o of g.autour(x, z, m)) {
      if (x < o.b[0] - m || x > o.b[2] + m || z < o.b[1] - m || z > o.b[3] + m) continue;
      if (dedans(x, z, o.p) || distBord(x, z, o.p) < m) { if (o.eau && (pont === null ? (pont = surPont(x, z)) : pont)) continue; return false; }
    }
    for (const t of gT.autour(x, z, m + 0.6)) if (Math.hypot(x - t.x, z - t.z) < t.r + m) return false;
    for (const s of gM.autour(x, z, m + 1)) if (distSeg(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) < s.e / 2 + m) return false;
    return true;
  }
  function degagement(x, z, max = 12) {
    let d = Math.min(max, h - 2 - Math.abs(x), h - 2 - Math.abs(z)); const pont = surPont(x, z);
    for (const o of g.autour(x, z, max)) { if (o.eau && pont) continue; if (dedans(x, z, o.p)) return 0; d = Math.min(d, distBord(x, z, o.p)); }
    for (const t of gT.autour(x, z, max)) d = Math.min(d, Math.hypot(x - t.x, z - t.z) - t.r);
    for (const s of gM.autour(x, z, max)) d = Math.min(d, distSeg(x, z, s.a[0], s.a[1], s.b[0], s.b[1]) - s.e / 2);
    return Math.max(0, d);
  }
  function coupe(ax, az, bx, bz) { // le segment traverse-t-il un mur ?
    const b = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    for (const s of gM.autour((ax + bx) / 2, (az + bz) / 2, Math.hypot(bx - ax, bz - az) / 2 + 1)) if (boitesSeCroisent(b, boite([s.a, s.b]), s.e) && (intersection([ax, az], [bx, bz], s.a, s.b) || distSeg(bx, bz, s.a[0], s.a[1], s.b[0], s.b[1]) < s.e / 2)) return true;
    return false;
  }
  return { libre, degagement, surPont, coupe };
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
  while (file.length) { const k = file.pop(), i = k % cote, j = Math.floor(k / cote); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i2 = i + di, j2 = j + dj; if (i2 < 0 || j2 < 0 || i2 >= cote || j2 >= cote) continue; const k2 = j2 * cote + i2; if (libre[k2] && !atteint[k2]) { if (di && dj && !(libre[j * cote + i2] && libre[j2 * cote + i])) continue; const qa = pos(i, j), qb = pos(i2, j2); if (obs.coupe && obs.coupe(qa[0], qa[1], qb[0], qb[1])) continue; atteint[k2] = 1; file.push(k2); } } }
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
async function mosaique(couche, z, R, cx, cz, cote, N, quoi) { // tuiles WMTS (PM, JPEG) → image N×N×3 (flottants 0-255) du carré de côté cote centré sur (cx, cz) ; ligne 0 = nord, colonne 0 = ouest
  const h = cote / 2, M = 8, [latN, lonO] = R.ll(cx - h - M, cz - h - M), [latS, lonE] = R.ll(cx + h + M, cz + h + M);
  const tx0 = Math.floor(MERC.px(lonO, z) / 256), tx1 = Math.floor(MERC.px(lonE, z) / 256), ty0 = Math.floor(MERC.py(latN, z) / 256), ty1 = Math.floor(MERC.py(latS, z) / 256);
  const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1, MW = nx * 256, MH = ny * 256, mos = new Uint8Array(MW * MH * 3).fill(160);
  log(`${quoi} : ${couche}, zoom ${z}, ${nx}×${ny} = ${nx * ny} tuiles`);
  const info = CAPS.wmts[couche], jeux = [...new Set(['PM', info && info.tms].filter(Boolean))];
  const url = (tx, ty, tms) => `${CONFIG.wmts}?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${couche}&STYLE=normal&TILEMATRIXSET=${tms}&TILEMATRIX=${z}&TILECOL=${tx}&TILEROW=${ty}&FORMAT=image/jpeg`;
  const tuile = (tx, ty, tms) => telecharger(url(tx, ty, tms), { delai: 60000, valider: (b) => b[0] === 0xFF && b[1] === 0xD8 ? true : `pas un JPEG : ${b.toString('utf8', 0, 160).replace(/\s+/g, ' ')}` });
  let tms = jeux[0]; // le jeu de matrices qui répond (PM d'abord : c'est lui que le cache connaît)
  for (const j of jeux) { try { await tuile((tx0 + tx1) >> 1, (ty0 + ty1) >> 1, j); tms = j; break; } catch (e) { alerte(`${quoi} : TILEMATRIXSET=${j} refusé (${e.message.slice(0, 120)})`); } }
  const taches = []; for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) taches.push([tx, ty]);
  let ko = 0;
  await Promise.all(taches.map(async ([tx, ty]) => {
    try {
      const im = JPEG.decode(await tuile(tx, ty, tms), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 }); if (im.width !== 256 || im.height !== 256) throw new Error(`tuile de ${im.width}×${im.height}`);
      const ox = (tx - tx0) * 256, oy = (ty - ty0) * 256;
      for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) { const s = (j * 256 + i) * 4, d = ((oy + j) * MW + ox + i) * 3; mos[d] = im.data[s]; mos[d + 1] = im.data[s + 1]; mos[d + 2] = im.data[s + 2]; }
    } catch (e) { ko++; if (ko <= 3) alerte(`${quoi} : tuile ${tx},${ty} : ${e.message.slice(0, 160)}`); }
  }));
  if (ko > taches.length * 0.15) throw new Error(`${ko} tuiles manquantes sur ${taches.length}`);
  if (ko) alerte(`${quoi} : ${ko} tuile(s) manquante(s) : gris neutre à leur place`);
  // rééchantillonnage 2×2 par pixel ; la longitude ne dépend que de x, la latitude que de z
  const S = 2, img = new Float32Array(N * N * 3), colX = new Float64Array(N * S), ligZ = new Float64Array(N * S);
  for (let k = 0; k < N * S; k++) { const v = -h + (k + 0.5) / (N * S) * cote; colX[k] = clamp(MERC.px(R.lon0 + (cx + v) / R.kx, z) - tx0 * 256 - 0.5, 0, MW - 1.001); ligZ[k] = clamp(MERC.py(R.lat0 - (cz + v) / R.kz, z) - ty0 * 256 - 0.5, 0, MH - 1.001); }
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) {
    let r = 0, g = 0, b = 0;
    for (let sv = 0; sv < S; sv++) for (let su = 0; su < S; su++) {
      const fx = colX[u * S + su], fy = ligZ[v * S + sv], i = fx | 0, j = fy | 0, a = fx - i, c = fy - j;
      const p00 = (j * MW + i) * 3, p10 = p00 + 3, p01 = p00 + MW * 3, p11 = p01 + 3, w00 = (1 - a) * (1 - c), w10 = a * (1 - c), w01 = (1 - a) * c, w11 = a * c;
      r += mos[p00] * w00 + mos[p10] * w10 + mos[p01] * w01 + mos[p11] * w11; g += mos[p00 + 1] * w00 + mos[p10 + 1] * w10 + mos[p01 + 1] * w01 + mos[p11 + 1] * w11; b += mos[p00 + 2] * w00 + mos[p10 + 2] * w10 + mos[p01 + 2] * w01 + mos[p11 + 2] * w11;
    }
    const o = (v * N + u) * 3; img[o] = r / 4; img[o + 1] = g / 4; img[o + 2] = b / 4;
  }
  let m1 = 0, m2 = 0; for (let i = 0; i < img.length; i += 31) { m1 += img[i]; m2 += img[i] * img[i]; } const nn = Math.ceil(img.length / 31), ec = Math.sqrt(Math.max(0, m2 / nn - (m1 / nn) ** 2));
  if (ec < 3) throw new Error(`image uniforme (écart-type ${ec.toFixed(1)}) : pas de photo ici`);
  return { img, tuiles: taches.length, ko, tms };
}
function masquerToits(img, masque, N) { // les toits photographiés sous les emprises → couleur de pavé (un léger grain)
  const pave = CONFIG.style.pave;
  for (let k = 0; k < N * N; k++) { const m = masque[k]; if (!m) continue; const bruit = ((Math.imul(k ^ (k >>> 7), 2654435761) >>> 24) / 255 - 0.5) * 10, o = k * 3; for (let ch = 0; ch < 3; ch++) img[o + ch] = img[o + ch] * (1 - m) + (pave[ch] + bruit) * m; }
}
async function ortho(R, L, batiments, z) {
  const N = CONFIG.sol[0], { img, tuiles } = await mosaique(CONFIG.coucheOrtho, z, R, 0, 0, L, N, 'ortho');
  const brut = img.slice();
  styliser(img, N, CONFIG.style); masquerToits(img, masqueBatiments(batiments, L, N), N);
  fs.mkdirSync(SORTIE, { recursive: true });
  const fichiers = [];
  let im = img, n = N;
  for (const taille of CONFIG.sol) {
    while (n > taille) { im = reduire(im, n); n /= 2; }
    const nom = `sol-${taille}.jpg`, data = versJpeg(im, n, CONFIG.qualiteJpeg); fs.writeFileSync(path.join(SORTIE, nom), data); fichiers.push(nom);
    log(`ortho : ${nom} (${(data.length / 1024).toFixed(0)} Ko)`);
  }
  RAPPORT.sources.ortho = `${CONFIG.coucheOrtho} zoom ${z}, ${tuiles} tuiles`;
  return { sol: { image: fichiers[0], petite: fichiers[1] || fichiers[0] }, brut, final: img, N, z };
}
async function etapeArenePhoto(R, carte) { // photo fine (~0,2 m/px) autour de l'arène, même traitement que sol-2048 → sol-arene-2048.jpg
  if (!JPEG || !carte.sol || !carte.zones) return null;
  const A = CONFIG.arenePhoto, c = carte.zones.arene.centre, couche = A.couche || CONFIG.coucheOrtho, info = CAPS.wmts[couche], zmax = Math.min(A.zoom, info ? info.max : A.zoom);
  for (const z of [zmax, zmax - 1]) {
    try {
      const N = A.image, { img, tuiles } = await mosaique(couche, z, R, c[0], c[1], A.cote, N, 'photo de l’arène'), brut = ESSAI ? img.slice() : null;
      styliser(img, N, CONFIG.style); masquerToits(img, masqueBatiments(carte.batiments, A.cote, N, c[0], c[1]), N);
      const nom = `sol-arene-${N}.jpg`, data = versJpeg(img, N, CONFIG.qualiteJpeg); fs.mkdirSync(SORTIE, { recursive: true }); fs.writeFileSync(path.join(SORTIE, nom), data);
      log(`photo de l’arène : ${nom} (${(data.length / 1024).toFixed(0)} Ko, ${(A.cote / N).toFixed(3)} m/px, zoom ${z}, ${tuiles} tuiles)`);
      RAPPORT.sources.arene = `${couche} zoom ${z}, ${tuiles} tuiles`;
      return { sol: { image: nom, centre: [c[0], c[1]], taille: A.cote }, brut, N };
    } catch (e) { alerte(`photo de l’arène au zoom ${z} : ${e.message.slice(0, 200)}`); }
  }
  repli('photo fine de l’arène indisponible (sol.arene absent)'); return null;
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
function masqueBatiments(batiments, L, N, cx = 0, cz = 0) { // couverture 0..1 des emprises (carré de côté L centré sur (cx, cz)), élargie d'environ un demi-mètre puis adoucie
  const m = new Float32Array(N * N), k = N / L, h = L / 2, SOUS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (const b of batiments) {
    const bb = boite(b.p), u0 = Math.max(0, Math.floor((bb[0] - cx + h) * k) - 1), u1 = Math.min(N - 1, Math.ceil((bb[2] - cx + h) * k)), v0 = Math.max(0, Math.floor((bb[1] - cz + h) * k) - 1), v1 = Math.min(N - 1, Math.ceil((bb[3] - cz + h) * k));
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) { let c = 0; for (const [du, dv] of SOUS) if (dedans((u + du) / k - h + cx, (v + dv) / k - h + cz, b.p)) c++; if (c) m[v * N + u] = Math.max(m[v * N + u], c / 4); }
  }
  const r = Math.max(1, Math.round(0.5 * k)), t = new Float32Array(N * N);
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { let x = 0; for (let d = -r; d <= r; d++) { const w = u + d; if (w >= 0 && w < N && m[v * N + w] > x) x = m[v * N + w]; } t[v * N + u] = x; }
  for (let v = 0; v < N; v++) for (let u = 0; u < N; u++) { let x = 0; for (let d = -r; d <= r; d++) { const w = v + d; if (w >= 0 && w < N && t[w * N + u] > x) x = t[w * N + u]; } m[v * N + u] = x; }
  for (let v = 1; v < N - 1; v++) for (let u = 1; u < N - 1; u++) { const o = v * N + u; t[o] = (m[o] * 4 + m[o - 1] + m[o + 1] + m[o - N] + m[o + N]) / 8; }
  return t;
}
function reduire(img, N) { const n = N / 2, r = new Float32Array(n * n * 3); for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) for (let c = 0; c < 3; c++) r[(v * n + u) * 3 + c] = (img[((2 * v) * N + 2 * u) * 3 + c] + img[((2 * v) * N + 2 * u + 1) * 3 + c] + img[((2 * v + 1) * N + 2 * u) * 3 + c] + img[((2 * v + 1) * N + 2 * u + 1) * 3 + c]) / 4; return r; }
function versJpeg(img, N, q) { const d = new Uint8ClampedArray(N * N * 4); for (let i = 0, j = 0; i < N * N * 3; i += 3, j += 4) { d[j] = img[i]; d[j + 1] = img[i + 1]; d[j + 2] = img[i + 2]; d[j + 3] = 255; } return JPEG.encode({ data: d, width: N, height: N }, q).data; }

// ─── après la photo : teinte des toits, matériaux déduits, sens des rangs des vignes et des vergers ───
function teintesEtSens(carte, info, o) {
  const st = { teintes: 0, murs: { bdtopo: 0, osm: 0, deduit: 0 }, toits: { bdtopo: 0, osm: 0, couleur: 0, defaut: 0 }, etages: 0, formes: 0 };
  const L = carte.taille, h = L / 2;
  carte.batiments.forEach((b, i) => {
    const m = info.mats[i] || {}; let moy = null;
    if (o) { // la couleur moyenne du toit sur la photo brute (un peu en retrait du bord ; les ombres et les reflets écartés)
      const N = o.N, k = N / L, bb = boite(b.p), px = [];
      for (const marge of [0.6, 0.25, 0]) {
        px.length = 0;
        for (let v = Math.max(0, Math.floor((bb[1] + h) * k)); v <= Math.min(N - 1, Math.ceil((bb[3] + h) * k)); v++) for (let u = Math.max(0, Math.floor((bb[0] + h) * k)); u <= Math.min(N - 1, Math.ceil((bb[2] + h) * k)); u++) {
          const x = (u + 0.5) / k - h, z = (v + 0.5) / k - h; if (!dedans(x, z, b.p) || (marge && distBord(x, z, b.p) < marge)) continue; const q = (v * N + u) * 3; px.push([o.brut[q], o.brut[q + 1], o.brut[q + 2]]);
        }
        if (px.length >= 6) break;
      }
      if (px.length) {
        px.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2])); const a = Math.floor(px.length * 0.2), z2 = Math.max(a + 1, Math.ceil(px.length * 0.9)), s = [0, 0, 0];
        for (let j = a; j < z2; j++) for (let c = 0; c < 3; c++) s[c] += px[j][c]; moy = s.map((v) => v / (z2 - a));
        const l = 0.299 * moy[0] + 0.587 * moy[1] + 0.114 * moy[2], sat = moy.map((v) => clamp(l + (v - l) * 1.12, 0, 255)); // un peu saturée, comme le reste
        b.teinteToit = '#' + sat.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); st.teintes++;
      }
    }
    if (b.toit) st.toits[m.srcToit || 'bdtopo']++; else if (moy) { b.toit = toitCouleur(moy, Math.abs(aire(b.p))); st.toits.couleur++; } else { b.toit = 'tuiles'; st.toits.defaut++; }
    if (b.mur) st.murs[m.srcMur || 'bdtopo']++; else { b.mur = /^(eglise|chateau|tour)$/.test(b.t) ? 'pierre' : 'crepi'; st.murs.deduit++; }
    if (b.etages) st.etages++; if (b.forme) st.formes++;
  });
  // le sens des rangs : l'orientation dominante des contrastes de la photo dans la parcelle (tenseur de structure), sinon le grand axe de la parcelle
  for (const v of carte.vegetation) {
    if (v.t !== 'vigne' && v.t !== 'verger') continue; let ang = null, coh = 0;
    if (o) {
      const N = o.N, k = N / L, m = rasterPolys([v.p], L, N); let jxx = 0, jzz = 0, jxz = 0;
      const lum = (u, w) => { const q = (w * N + u) * 3; return o.brut[q] * 0.3 + o.brut[q + 1] * 0.59 + o.brut[q + 2] * 0.11; };
      const bb = boite(v.p);
      for (let w = Math.max(1, Math.floor((bb[1] + h) * k)); w <= Math.min(N - 2, Math.ceil((bb[3] + h) * k)); w++) for (let u = Math.max(1, Math.floor((bb[0] + h) * k)); u <= Math.min(N - 2, Math.ceil((bb[2] + h) * k)); u++) {
        if (!m[w * N + u]) continue; const gx = lum(u + 1, w) - lum(u - 1, w), gz = lum(u, w + 1) - lum(u, w - 1); jxx += gx * gx; jzz += gz * gz; jxz += gx * gz;
      }
      if (jxx + jzz > 0) { coh = Math.sqrt((jxx - jzz) ** 2 + 4 * jxz * jxz) / (jxx + jzz); const tg = 0.5 * Math.atan2(2 * jxz, jxx - jzz); ang = tg + Math.PI / 2; } // les rangs sont perpendiculaires aux contrastes
    }
    if (ang === null || coh < 0.15) { const r = rectangle(v.p); if (r) ang = Math.atan2(r.l[1][1] - r.l[0][1], r.l[1][0] - r.l[0][0]); }
    if (ang === null) continue;
    let s = capVers(Math.cos(ang), Math.sin(ang)); while (s > Math.PI / 2) s -= Math.PI; while (s <= -Math.PI / 2) s += Math.PI; // un cap (convention yaw), modulo π
    v.sens = Math.round(s * 100) / 100; if (coh >= 0.15) st.sensPhoto = (st.sensPhoto || 0) + 1; else st.sensAxe = (st.sensAxe || 0) + 1;
  }
  info.teintes = st;
  log(`matériaux : murs ${JSON.stringify(st.murs)} ; toits ${JSON.stringify(st.toits)} ; ${st.teintes} teintes de toit ; ${st.etages} étages ; ${st.formes} formes de toit OSM`);
  return st;
}

// ─── horizon : le relief lointain (≈ 16 km de côté, pas de 125 m) pour les vraies montagnes du Bugey ───
async function etapeHorizon(R) {
  const { cote, pas } = CONFIG.horizon, n = Math.round(cote / pas) + 1, d = (n - 1) * pas / 2, noeuds = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) noeuds.push([-d + i * pas, -d + j * pas]);
  try {
    const { noms } = await capacitesWMSR(), couche = [CONFIG.coucheHorizon, CONFIG.coucheAlti].find((x) => noms.includes(x)) || noms.find((x) => /ELEVATIONGRIDCOVERAGE(\.HIGHRES)?$/i.test(x));
    if (!couche) throw new Error('aucune couche d’altitude');
    const W = Math.min(2048, Math.ceil(2 * (d + pas) / 25)), g = await wmsBIL(couche, R, 0, 0, d + pas, W, -100, 5000); // ~25 m par pixel
    if (g.valides < 0.9) throw new Error(`${(100 * g.valides).toFixed(0)} % de points valides`);
    const v = noeuds.map(([x, z]) => { let t = 0, k = 0; for (let dz = -50; dz <= 50; dz += 25) for (let dx = -50; dx <= 50; dx += 25) { const a = g.xz(x + dx, z + dz); if (a === a) { t += a; k++; } } return Math.round(k ? t / k : g.moy); });
    log(`horizon : ${n}×${n} nœuds tous les ${pas} m (${couche}, ${W}×${W} px), de ${Math.min(...v)} à ${Math.max(...v)} m`);
    RAPPORT.sources.horizon = `wms-r ${couche}`; return { pas, n, h: v };
  } catch (e) { alerte(`horizon WMS-R : ${e.message.slice(0, 200)}`); }
  try { const v = await altiAPI(noeuds.map(([x, z]) => R.ll(x, z))); repli('horizon par l’API altimétrique'); RAPPORT.sources.horizon = 'api'; return { pas, n, h: v.map(Math.round) }; } catch (e) { alerte(`horizon API : ${e.message.slice(0, 200)}`); }
  repli('horizon indisponible : pas de champ horizon'); return null;
}

// ─── vérification du format v1 et de ses champs facultatifs « Authenticité » (avant d'écrire quoi que ce soit) ───
const MURS_T = ['pierre', 'crepi', 'brique', 'beton', 'bois', 'mixte'], TOITS_T = ['tuiles', 'ardoise', 'zinc', 'beton', 'verre'], FORMES_T = ['2pans', 'croupe', 'plat', 'pavillon', 'fleche'], MURS_TYPES = ['pierre', 'cloture', 'soutenement', 'enceinte', 'portail'];
function verifier(c, obs) {
  const err = [], h = c.taille / 2 + 0.051, num = (v) => typeof v === 'number' && isFinite(v);
  const pt = (q, ou) => { if (!Array.isArray(q) || q.length < 2 || !num(q[0]) || !num(q[1]) || Math.abs(q[0]) > h || Math.abs(q[1]) > h) err.push(`${ou} : point invalide ${JSON.stringify(q)}`); };
  const poly = (p, ou) => { if (!Array.isArray(p) || p.length < 3) { err.push(`${ou} : moins de 3 points`); return; } p.forEach((q) => pt(q, ou)); const a = p[0], b = p[p.length - 1]; if (a[0] === b[0] && a[1] === b[1]) err.push(`${ou} : point final répété`); };
  const ligne = (l, ou) => { if (!Array.isArray(l) || l.length < 2) err.push(`${ou} : moins de 2 points`); else l.forEach((q) => pt(q, ou)); };
  if (c.v !== 1) err.push('v ≠ 1'); if (c.nom !== 'Poncin') err.push('nom'); if (!['ign-osm', 'provisoire'].includes(c.source)) err.push('source'); if (typeof c.attribution !== 'string' || !/IGN/.test(c.attribution) || !/OpenStreetMap/.test(c.attribution)) err.push('attribution');
  if (!c.origine || !num(c.origine.lat) || !num(c.origine.lon)) err.push('origine'); if (!num(c.taille) || c.taille < 200 || c.taille > 2000) err.push('taille');
  const r = c.relief; if (!r || !num(r.pas) || r.n !== Math.round(c.taille / r.pas) + 1 || !Array.isArray(r.h) || r.h.length !== r.n * r.n || !r.h.every(num)) err.push('relief incohérent');
  c.batiments.forEach((b, i) => {
    const ou = `batiments[${i}]`; poly(b.p, ou); if (!num(b.h) || b.h <= 0) err.push(`${ou}.h`); if (!TYPES_BATI.includes(b.t)) err.push(`${ou}.t = ${b.t}`);
    if (b.mur != null && !MURS_T.includes(b.mur)) err.push(`${ou}.mur = ${b.mur}`); if (b.toit != null && !TOITS_T.includes(b.toit)) err.push(`${ou}.toit = ${b.toit}`);
    if (b.teinteToit != null && !/^#[0-9a-f]{6}$/i.test(b.teinteToit)) err.push(`${ou}.teinteToit`); if (b.etages != null && !(Number.isInteger(b.etages) && b.etages >= 1 && b.etages <= 60)) err.push(`${ou}.etages`); if (b.forme != null && !FORMES_T.includes(b.forme)) err.push(`${ou}.forme = ${b.forme}`);
  });
  c.rues.forEach((x, i) => { ligne(x.l, `rues[${i}]`); if (!(x.w > 0)) err.push(`rues[${i}].w`); if (!['route', 'rue', 'chemin'].includes(x.t)) err.push(`rues[${i}].t`); if (x.n != null && typeof x.n !== 'string') err.push(`rues[${i}].n`); });
  c.eau.forEach((x, i) => { poly(x.p, `eau[${i}]`); if (!['riviere', 'ruisseau'].includes(x.t)) err.push(`eau[${i}].t`); });
  c.ponts.forEach((x, i) => { if (!Array.isArray(x.l) || x.l.length !== 2) err.push(`ponts[${i}].l`); else x.l.forEach((q) => pt(q, `ponts[${i}]`)); if (!(x.w > 0)) err.push(`ponts[${i}].w`); });
  c.vegetation.forEach((x, i) => { poly(x.p, `vegetation[${i}]`); if (!['bois', 'vigne', 'pre', 'jardin', 'verger'].includes(x.t)) err.push(`vegetation[${i}].t`); if (x.sens != null && !num(x.sens)) err.push(`vegetation[${i}].sens`); });
  c.arbres.forEach((a, i) => { if (!Array.isArray(a) || !(a.length === 3 || a.length === 5) || !a.slice(0, a.length === 5 ? 4 : 3).every(num)) err.push(`arbres[${i}]`); else { pt(a, `arbres[${i}]`); if (!(a[2] > 0)) err.push(`arbres[${i}].h`); if (a.length === 5 && (!(a[3] > 0) || !ESPECES.includes(a[4]))) err.push(`arbres[${i}] : r ou espèce`); } });
  c.interdit.forEach((x, i) => { poly(x.p, `interdit[${i}]`); if (typeof x.n !== 'string') err.push(`interdit[${i}].n`); });
  c.noms.forEach((x, i) => { if (typeof x.n !== 'string' || !x.n) err.push(`noms[${i}].n`); pt([x.x, x.z], `noms[${i}]`); });
  if (c.sol !== null && !(c.sol && typeof c.sol.image === 'string' && typeof c.sol.petite === 'string')) err.push('sol');
  if (c.sol && c.sol.arene != null) { const a = c.sol.arene; if (typeof a.image !== 'string' || !num(a.taille) || a.taille <= 0) err.push('sol.arene'); else pt(a.centre, 'sol.arene.centre'); }
  // les champs facultatifs de l'authenticité
  (c.haies || []).forEach((x, i) => { ligne(x.l, `haies[${i}]`); if (!(x.h > 0) || !(x.w > 0)) err.push(`haies[${i}] : h ou w`); });
  (c.surfaces || []).forEach((x, i) => { poly(x.p, `surfaces[${i}]`); if (!TYPES_SURF.includes(x.t)) err.push(`surfaces[${i}].t = ${x.t}`); });
  (c.murs || []).forEach((x, i) => { ligne(x.l, `murs[${i}]`); if (!(x.h > 0) || !(x.e > 0)) err.push(`murs[${i}] : h ou e`); if (!MURS_TYPES.includes(x.t)) err.push(`murs[${i}].t = ${x.t}`); });
  (c.mobilier || []).forEach((x, i) => { pt([x.x, x.z], `mobilier[${i}]`); if (!TYPES_MOBILIER.includes(x.t)) err.push(`mobilier[${i}].t = ${x.t}`); if (x.yaw != null && !num(x.yaw)) err.push(`mobilier[${i}].yaw`); if (x.n != null && typeof x.n !== 'string') err.push(`mobilier[${i}].n`); });
  (c.enseignes || []).forEach((x, i) => { pt([x.x, x.z], `enseignes[${i}]`); if (!Number.isInteger(x.b) || !c.batiments[x.b]) err.push(`enseignes[${i}].b`); if (typeof x.n !== 'string' || !x.n) err.push(`enseignes[${i}].n`); if (typeof x.t !== 'string' || !x.t) err.push(`enseignes[${i}].t`); if (!num(x.yaw)) err.push(`enseignes[${i}].yaw`); });
  if (c.horizon != null) { const z = c.horizon; if (!num(z.pas) || !Number.isInteger(z.n) || !Array.isArray(z.h) || z.h.length !== z.n * z.n || !z.h.every(num)) err.push('horizon incohérent'); }
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
  return '{\n' + Object.entries(c).map(([k, v]) => JSON.stringify(k) + ': ' + (/^(batiments|rues|eau|ponts|vegetation|arbres|interdit|noms|haies|surfaces|murs|mobilier|enseignes)$/.test(k) ? liste(v) : JSON.stringify(v))).join(',\n') + '\n}\n';
}
function licence(c) {
  const an = new Date().getFullYear(), jour = new Date().toISOString().slice(0, 10), alti = RAPPORT.sources.alti !== 'plat', S = RAPPORT.sources, bd = ['batiment', 'vegetation', 'haies', 'ponctuel', 'lineaire', 'cimetiere', 'sport'].map((k) => k === 'batiment' ? S.bdtopo || 'BDTOPO_V3:batiment' : S['bdtopo_' + k]).filter(Boolean);
  const images = ['sol-2048.jpg', 'sol-1024.jpg'].concat(c.sol && c.sol.arene ? [c.sol.arene.image] : []).map((x) => `\`${x}\``).join(', ');
  return `# Données de la carte de Poncin

\`poncin.json\`, ${images} ont été produits le ${jour} par \`outils/carte/construire.js\` (carré de ${c.taille} m centré sur ${c.origine.lat}, ${c.origine.lon}) à partir de données ouvertes. Aucune donnée Google (ni Street View) n'est utilisée.

## Sources

- **OpenStreetMap** — © contributeurs OpenStreetMap ${an}, base de données ouverte sous licence **ODbL 1.0** (<https://opendatacommons.org/licenses/odbl/1-0/>), <https://www.openstreetmap.org/copyright>. Rues et leurs noms, eau, ponts, végétation, arbres (positions, espèces), noms de lieux, compléments des bâtiments (noms, église, mairie, château, matériaux et formes de toit quand ils sont tagués), zone privée du château, revêtements du sol, murs, clôtures et portails, haies, mobilier urbain (lampadaires, bancs, fontaines, monuments, croix, arrêts de bus…), commerces et services nommés (enseignes).
- **IGN – Géoplateforme** — © IGN ${an}, sous **Licence Ouverte Etalab 2.0** (<https://www.etalab.gouv.fr/licence-ouverte-open-licence/>) :
  - **BD TOPO®** (service WFS : ${bd.map((x) => `\`${x}\``).join(', ')}) : emprises, hauteurs, nombre d'étages et matériaux des murs et des toitures des bâtiments (codes issus des fichiers fonciers) ; zones de végétation (feuillus, conifères, peupleraies, vergers, vignes), haies, cimetières, terrains de sport, murs et calvaires absents d'OSM ;
${alti ? `  - **RGE ALTI®** (service WMS-R / API altimétrique) : relief, grille de ${c.relief.pas} m${c.horizon ? ` ; relief lointain de l'horizon (${((c.horizon.n - 1) * c.horizon.pas / 1000).toFixed(0)} km de côté, pas de ${c.horizon.pas} m)` : ''} ;\n` : ''}${S.hauteurArbres ? `  - **LiDAR HD** (service WMS-R \`${S.hauteurArbres}\`) : hauteur de la canopée, pour trouver les arbres et mesurer leur hauteur et celle des haies ;\n` : ''}  - **BD ORTHO®** (service WMTS \`${CONFIG.coucheOrtho}\`${S.vegetationArbres ? ` et \`${S.vegetationArbres.split(' ')[0]}\` en infrarouge couleur` : ''}) : photographies aériennes du sol (adoucies, couleurs un peu saturées, masquées sous les emprises des bâtiments), couleur des toits, couronnes des arbres (indice de végétation), sens des rangs des vignes et des vergers.

## Licences des fichiers

- \`poncin.json\` est une **base de données dérivée** d'OpenStreetMap (combinée à la BD TOPO, au RGE ALTI, au LiDAR HD et à la BD ORTHO) : elle est diffusée sous **ODbL 1.0**, avec la même obligation de partage à l'identique. Les éléments issus de l'IGN restent réutilisables sous Licence Ouverte 2.0.
- ${images} sont des images dérivées de la BD ORTHO® (Licence Ouverte 2.0) ; le masque des bâtiments vient de la BD TOPO® et d'OpenStreetMap (« œuvre produite » au sens de l'ODbL : seule l'attribution est due).

## Attribution à afficher

> ${c.attribution}

Le jeu l'affiche dans ses crédits.
`;
}

// ─── 0. inventaire : ce que les services de la Géoplateforme proposent vraiment (couches, attributs, niveaux de zoom), imprimé dans les journaux ───
const CAPS = { wfs: [], attributs: {}, wmsr: [], wmts: {} };
async function inventaire() {
  console.log('\n── Inventaire des services IGN (GetCapabilities / DescribeFeatureType) ──');
  try { // WFS : les couches de la BD TOPO qui nous servent, et leurs attributs
    const caps = (await telecharger(`${CONFIG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`, { delai: 180000, valider: (b) => /WFS_Capabilities/.test(b.toString('utf8', 0, 4000)) ? true : 'pas des capacités WFS' })).toString('utf8');
    CAPS.wfs = [...caps.matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((m) => m[1].trim());
    const utiles = CAPS.wfs.filter((x) => /^BDTOPO_V3:/i.test(x) && /batiment|vegetation|haie|arbre|cimetiere|terrain_de_sport|construction_|mur|equipement|zone_d_activite|toponymie/i.test(x));
    console.log(`  WFS : ${CAPS.wfs.length} couches ; BD TOPO utiles : ${utiles.join(', ') || 'aucune'}`);
    for (const c of utiles.filter((x) => /:(batiment|zone_de_vegetation|haie|construction_ponctuelle|construction_lineaire|cimetiere|terrain_de_sport)$/i.test(x))) {
      try {
        const d = (await telecharger(`${CONFIG.wfs}?SERVICE=WFS&VERSION=2.0.0&REQUEST=DescribeFeatureType&TYPENAMES=${encodeURIComponent(c)}`, { delai: 90000, valider: (b) => /element/i.test(b.toString('utf8', 0, 20000)) ? true : 'pas un schéma' })).toString('utf8');
        CAPS.attributs[c] = [...d.matchAll(/<(?:xsd?:)?element[^>]*\bname="([^"]+)"[^>]*\btype="([^"]+)"/g)].map((m) => m[1] + ':' + m[2].replace(/^.*:/, ''));
        console.log(`  ${c} : ${CAPS.attributs[c].join(' ')}`);
      } catch (e) { alerte(`DescribeFeatureType ${c} : ${e.message.slice(0, 160)}`); }
    }
  } catch (e) { alerte(`inventaire WFS : ${e.message.slice(0, 200)}`); }
  try { // WMS-R : les couches d'altitude (dont le LiDAR HD : MNT, MNS, MNH) et leurs systèmes de coordonnées
    const { caps } = await capacitesWMSR();
    {
      const blocs = caps.split(/<Layer[\s>]/).slice(1);
      for (const b of blocs) { const n = (b.match(/^[^<]*<Name>([^<]+)<\/Name>/) || b.match(/<Name>([^<]+)<\/Name>/) || [])[1]; if (!n) continue; const crs = [...b.split(/<Layer[\s>]/)[0].matchAll(/<CRS>([^<]+)<\/CRS>/g)].map((m) => m[1]); CAPS.wmsr.push({ nom: n.trim(), crs }); }
      const formats = [...new Set([...caps.matchAll(/<Format>([^<]+)<\/Format>/g)].map((m) => m[1]))];
      console.log(`  WMS-R : ${CAPS.wmsr.length} couches ; formats ${formats.join(' ')}`);
      for (const l of CAPS.wmsr.filter((x) => /ELEVATION|LIDAR|MNH|MNS|MNT|HAUTEUR|CANOP|DSM|DTM|CHM/i.test(x.nom))) console.log(`    ${l.nom} [${l.crs.slice(0, 6).join(' ')}${l.crs.length > 6 ? ' …' : ''}]`);
    }
  } catch (e) { alerte(`inventaire WMS-R : ${e.message.slice(0, 200)}`); }
  try { // WMTS : les photographies (couleur, infrarouge) et leurs niveaux de zoom en PM
    const caps = (await telecharger(`${CONFIG.wmts}?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0`, { delai: 180000, valider: (b) => /Capabilities/.test(b.toString('utf8', 0, 6000)) ? true : 'pas des capacités WMTS' })).toString('utf8');
    for (const b of caps.split(/<Layer>/).slice(1)) {
      const id = (b.match(/<ows:Identifier>([^<]+)<\/ows:Identifier>/) || [])[1]; if (!id) continue;
      const pm = b.split(/<TileMatrixSetLink>/).find((x) => /<TileMatrixSet>PM[^<]*<\/TileMatrixSet>/.test(x)); if (!pm) continue;
      const tms = pm.match(/<TileMatrixSet>(PM[^<]*)<\/TileMatrixSet>/)[1], nz = tms.match(/^PM_(\d+)_(\d+)$/);
      const z = [...pm.matchAll(/<TileMatrix>(?:[^<]*:)?(\d+)<\/TileMatrix>/g)].map((m) => +m[1]), fmt = (b.match(/<Format>([^<]+)<\/Format>/) || [])[1];
      CAPS.wmts[id] = { tms, min: z.length ? Math.min(...z) : nz ? +nz[1] : 0, max: z.length ? Math.max(...z) : nz ? +nz[2] : 21, format: fmt };
    }
    const photos = Object.keys(CAPS.wmts).filter((x) => /ORTHO|IRC|LIDAR|MNH|MNS/i.test(x) && !/EDUGEO|ORTHO-SAT|\.(19|20)\d\d\b|ZONES-TESTS/i.test(x)).sort((a, b) => (/IRC/.test(b) - /IRC/.test(a)) || a.localeCompare(b));
    if (!Object.keys(CAPS.wmts).length) { const i = caps.indexOf('ORTHOIMAGERY.ORTHOPHOTOS<'); console.log('  WMTS (extrait) : ' + caps.slice(Math.max(0, i - 600), i + 1800).replace(/\s+/g, ' ')); }
    console.log(`  WMTS : ${Object.keys(CAPS.wmts).length} couches en PM ; photos et LiDAR :`);
    for (const x of photos.slice(0, 80)) console.log(`    ${x} (${CAPS.wmts[x].tms}, zoom ${CAPS.wmts[x].min}–${CAPS.wmts[x].max}, ${CAPS.wmts[x].format})`);
  } catch (e) { alerte(`inventaire WMTS : ${e.message.slice(0, 200)}`); }
  console.log('');
}

// ─── le pipeline ───
async function construire() {
  await inventaire();
  const dec = await decouvrir(), R = repere(dec.lat, dec.lon), L = dec.taille;
  const objets = await etapeOSM(R, L);
  let bdtopo = [];
  try { bdtopo = await etapeBDTOPO(R, L); if (!bdtopo.length) repli('BD TOPO vide : bâtiments OSM seuls'); } catch (e) { repli(`BD TOPO injoignable (${e.message.slice(0, 200)}) : bâtiments OSM seuls`); }
  const autres = await etapeBDTOPOAutres(R, L);
  const relief = await etapeAlti(R, L), horizon = await etapeHorizon(R);
  const { carte, info } = assembler(R, L, objets, bdtopo, relief, autres);
  const o = await etapeOrtho(R, L, carte.batiments); carte.sol = o ? o.sol : null;
  teintesEtSens(carte, info, o);
  await etapeArbres(R, L, carte, info, o);
  if (info.arbres.sources.hauteur) RAPPORT.sources.hauteurArbres = info.arbres.sources.hauteur; if (info.arbres.sources.vegetation) RAPPORT.sources.vegetationArbres = info.arbres.sources.vegetation;
  if (info.mnh) carte.attribution = carte.attribution.replace(' · ', ', LiDAR HD · ');
  // les zones de jeu, sur des points vraiment libres (les troncs et les murs bloquent aussi)
  info.obs = obstacles(L, carte.batiments, carte.interdit, carte.eau, carte.ponts, { arbres: carte.arbres, murs: carte.murs });
  carte.zones = calculerZones(Object.assign({ obs: info.obs }, info.zonesArgs));
  const ar = await etapeArenePhoto(R, carte); if (ar && carte.sol) carte.sol.arene = ar.sol; info.arenePhoto = ar;
  if (horizon) carte.horizon = horizon;
  const err = verifier(carte, info.obs);
  if (err.length) { console.log(`\nFORMAT INVALIDE (${err.length}) :\n  ` + err.slice(0, 40).join('\n  ')); throw new Error('carte invalide : rien n’est écrit'); }
  fs.mkdirSync(SORTIE, { recursive: true });
  fs.writeFileSync(path.join(SORTIE, 'poncin.json'), versJSON(carte));
  fs.writeFileSync(path.join(SORTIE, 'LICENCE-DONNEES.md'), licence(carte));
  if (!carte.sol) for (const f of ['sol-2048.jpg', 'sol-1024.jpg']) { try { fs.unlinkSync(path.join(SORTIE, f)); } catch (e) { /* absent */ } }
  for (const f of fs.readdirSync(SORTIE)) if (/^sol-arene-\d+\.jpg$/.test(f) && !(carte.sol && carte.sol.arene && carte.sol.arene.image === f)) fs.unlinkSync(path.join(SORTIE, f));
  rapport(carte, info, R);
  return { carte, info, R, ortho: o, objets };
}
function rapport(c, info, R) {
  const n = (f) => c.noms.filter((x) => f.test(x.n)).map((x) => x.n), ko = (f) => { try { return (fs.statSync(path.join(SORTIE, f)).size / 1024).toFixed(0) + ' Ko'; } catch (e) { return 'absent'; } };
  const A = info.arbres || { especes: {} }, T = info.teintes || {};
  const lignes = [
    `\n══ Carte de Poncin : ${path.relative(RACINE, SORTIE) || SORTIE} ══`,
    `centre ${R.lat0}, ${R.lon0} ; carré de ${c.taille} m ; relief ${c.relief.n}×${c.relief.n} (${RAPPORT.sources.alti}), de ${Math.min(...c.relief.h)} à ${Math.max(...c.relief.h)} m`,
    `bâtiments : ${c.batiments.length} (BD TOPO ${info.nBD}, OSM ajoutés ${info.nOSM}) ${JSON.stringify(info.compte)} ; enveloppes convexes de repli : ${RAPPORT.enveloppes}`,
    `matériaux : murs ${JSON.stringify(T.murs)} → ${JSON.stringify(compter(c.batiments, (b) => b.mur))} ; toits ${JSON.stringify(T.toits)} → ${JSON.stringify(compter(c.batiments, (b) => b.toit))} ; teintes ${T.teintes} ; étages ${T.etages} ; formes OSM ${T.formes}`,
    `rues : ${c.rues.length} (${new Set(c.rues.filter((r) => r.n).map((r) => r.n)).size} noms) ; eau : ${c.eau.length} (rivière ${c.eau.filter((e) => e.t === 'riviere').length}, ruisseau ${c.eau.filter((e) => e.t === 'ruisseau').length}) ; ponts : ${c.ponts.length} (dont ${info.deduits} déduits d'une voie qui franchit un ruisseau, ${info.allonges} allongés pour enjamber l'eau)`,
    `végétation : ${c.vegetation.length} ${JSON.stringify(compter(c.vegetation, (v) => v.t))} (sens des rangs : ${T.sensPhoto || 0} par la photo, ${T.sensAxe || 0} par le grand axe) ; interdit : ${c.interdit.map((z) => z.n).join(', ') || 'aucun'}`,
    `arbres : ${c.arbres.length} ${JSON.stringify(A.especes)} — ${A.couronnes} couronnes détectées (${A.sources ? `${A.sources.hauteur || 'sans LiDAR'} ; ${A.sources.vegetation || 'sans infrarouge'}` : ''}), ${A.fusionOSM} reconnues par un arbre OSM, ${A.osm} arbres OSM ajoutés, ${A.rangees} de rangées OSM, ${A.semes} semés (repli), ${A.ecartes} écartés ${JSON.stringify(A.raisons || {})}, ${A.haies} haies basses`,
    `BD TOPO (autres couches) : ${['vegetation', 'haies', 'ponctuel', 'lineaire', 'cimetiere', 'sport'].map((k) => `${k} ${(info.autres[k] || []).length}${(info.autres[k] || []).length && info.autres[k][0].props.nature !== undefined ? ' [' + histo(info.autres[k], (o) => o.props.nature, 8) + ']' : ''}`).join(' ; ')}`,
    `haies : ${c.haies.length} (BD TOPO ${info.stHaies.bdtopo} + ${info.stHaies.zone} zones « Haie », OSM ${info.stHaies.osm} ; hauteur mesurée sur le LiDAR : ${A.haiesMesurees || 0}) ; murs : ${c.murs.length} ${JSON.stringify(compter(c.murs, (m) => m.t))} (OSM ${info.stMurs.osm}, BD TOPO ${info.stMurs.bdtopo}, portails ${info.stMurs.portails})`,
    `surfaces : ${c.surfaces.length} ${JSON.stringify(compter(c.surfaces, (s) => s.t))} ; mobilier : ${c.mobilier.length} ${JSON.stringify(compter(c.mobilier, (m) => m.t))} (OSM ${info.stMob.osm}, BD TOPO ${info.stMob.bdtopo})`,
    `enseignes (${c.enseignes.length}) : ${c.enseignes.map((e) => `${e.n} [${e.t}]`).join(' · ')}`,
    `objets nommés : église ${JSON.stringify(c.batiments.filter((b) => b.t === 'eglise').map((b) => b.n || '(sans nom)'))}, mairie ${JSON.stringify(c.batiments.filter((b) => b.t === 'mairie').map((b) => b.n || '(sans nom)'))}, château ${JSON.stringify([...new Set(c.batiments.filter((b) => b.t === 'chateau').map((b) => b.n || '(sans nom)'))])}`,
    `cours d'eau : ${JSON.stringify([...new Set(info.lignesEau.filter((l) => l.n).map((l) => l.n))])} ; Ain : ${n(NOM_AIN).length ? 'oui' : 'NON'}, Veyron : ${n(NOM_VEYRON).length ? 'oui' : 'NON'}`,
    `ponts nommés : ${JSON.stringify([...new Set(info.ponts.filter((p) => p.n).map((p) => p.n))])} ; voies sur pont : ${JSON.stringify([...new Set(info.ponts.filter((p) => p.voie).map((p) => p.voie))])}`,
    `noms (${c.noms.length}) : ${c.noms.slice(0, 40).map((x) => x.n).join(' · ')}`,
    `voisinage du château (surfaces à moins de 30 m) :\n    ${(RAPPORT.voisinageChateau || []).join('\n    ') || 'aucune'}`,
    `zones : arène ${RAPPORT.arene} ; ${c.zones.apparitions.length} apparitions ; ${c.zones.armes.length} objets (${c.zones.armes.map((a) => a.arme).join(', ')}) ; ${c.zones.extraction.length} extractions ; base [${c.zones.base}]`,
    `sol : ${c.sol ? `${c.sol.image} + ${c.sol.petite} (${RAPPORT.sources.ortho})${c.sol.arene ? ` ; arène ${c.sol.arene.image}, ${c.sol.arene.taille} m autour de [${c.sol.arene.centre}] (${RAPPORT.sources.arene})` : ' ; pas de photo fine de l’arène'}` : 'aucun (sol peint)'}`,
    `horizon : ${c.horizon ? `${c.horizon.n}×${c.horizon.n} tous les ${c.horizon.pas} m (${RAPPORT.sources.horizon}), de ${Math.min(...c.horizon.h)} à ${Math.max(...c.horizon.h)} m` : 'aucun'}`,
    `fichiers : poncin.json ${ko('poncin.json')} ; sol-2048.jpg ${ko('sol-2048.jpg')} ; sol-1024.jpg ${ko('sol-1024.jpg')}${c.sol && c.sol.arene ? ` ; ${c.sol.arene.image} ${ko(c.sol.arene.image)}` : ''}`,
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
  const bd = [], peints = [], ardoises = [], attendu = {}; // bâtiments BD TOPO (rect + props) ; ce que la photo montre (toits) ; toits gris-bleu ; ce que l'essai doit retrouver
  const bati = (r, tags, props, decal = 0.3) => { if (tags) chemin(r, tags, true); if (props) bd.push({ r: r.map(([x, z]) => [x + decal, z]), props }); peints.push(r); };
  noeud([5, 5], { place: 'village', name: 'Poncin' });
  chemin(rect(-20, 0, 25, 30), { place: 'square', highway: 'pedestrian', area: 'yes', surface: 'paving_stones', name: "Place d'essai" }, true);
  bati(rect(-10, -24, 10, -6), { building: 'yes' }, { hauteur: 9.2, nature: 'Indifférenciée', usage_1: 'Résidentiel', murs: '10', toiture: '10' });
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
  // les voies : la route qui franchit l'Ain sur un pont, des rues, un chemin (gravillonné)
  chemin([[-620, -50], [-280, -50]], { highway: 'primary', name: "Route d'essai" });
  chemin([[-280, -50], [-190, -50]], { highway: 'primary', bridge: 'yes', layer: '1', name: "Route d'essai" });
  chemin([[-190, -50], [620, -50]], { highway: 'primary', name: "Route d'essai" });
  chemin(rect(-282, -55, -188, -45), { man_made: 'bridge', name: "Pont d'essai" }, true);
  chemin([[-30, -50], [-30, 160]], { highway: 'residential', name: 'Rue A' });
  chemin([[100, -50], [100, 260]], { highway: 'residential', name: 'Rue B' });
  chemin([[0, 30], [0, 420]], { highway: 'tertiary', name: 'Route du sud' });
  chemin([[-30, 150], [-180, 150]], { highway: 'footway', surface: 'gravel' });
  // les maisons : une grille, la BD TOPO en couvre 70 % (décalée de 30 cm, avec les matériaux des fichiers fonciers), OSM en couvre 90 %
  const routes = [[[-620, -50], [620, -50]], [[-30, -50], [-30, 160]], [[100, -50], [100, 260]], [[0, 30], [0, 420]], [[-30, 150], [-180, 150]], [[420, 130], [200, 110], [60, 92], [20, 90], [-100, 80], [-236, 70]]];
  const occupes = [rect(-25, -5, 30, 35), rect(-15, -29, 15, -1), rect(-80, 13, -40, 37), rect(105, -205, 245, -125)];
  let k = 0;
  for (let gx = -180; gx <= 280; gx += 34) for (let gz = -130; gz <= 250; gz += 30) {
    const r = rect(gx, gz, gx + 11, gz + 8), cx = gx + 5.5, cz = gz + 4;
    if (r.some(([x, z]) => x < xAin(z) + 45) || routes.some((l) => distBord(cx, cz, l, false) < 11) || occupes.some((o) => distPolys(o, r) < 3)) continue;
    const m = k++ % 10, tags = m === 4 ? null : m === 7 ? { building: 'yes', shop: 'bakery', name: "Boulangerie d'essai" } : m === 8 ? { building: 'house', 'building:material': 'brick' } : m === 0 ? { building: 'house', 'roof:shape': 'hipped' } : { building: m === 9 ? 'garage' : 'house' };
    const props = m >= 7 ? null : m === 3 ? { hauteur: null, nombre_d_etages: 2, nature: 'Indifférenciée', usage_1: 'Résidentiel', murs: '50' } : m === 5 ? { nature: 'Indifférenciée' } : { hauteur: 6 + (m % 4) * 1.5, nature: 'Indifférenciée', usage_1: 'Résidentiel', murs: m === 1 ? '23' : m === 0 ? '10' : null, toiture: m === 1 ? '02' : m === 0 ? '10' : null };
    bati(r, tags, props); if (m === 6) ardoises.push(r);
    if (gz === -70 && tags && !attendu.pharmacie && m !== 7) { noeud([cx, cz], { shop: 'chemist', amenity: 'pharmacy', name: "Pharmacie d'essai" }); attendu.pharmacie = { x: cx, zFacade: gz + 8 }; }
  }
  // la végétation : le vrai (ce que le LiDAR et l'infrarouge montrent), et ce que les données en disent
  const vrais = [], arbre = (x, z, r, h, e, cone) => vrais.push({ x, z, r, h, e, cone });
  for (let i = 0; i < 9; i++) { noeud([-18 + i * 5, 33], i === 0 ? { natural: 'tree', genus: 'Tilia' } : { natural: 'tree' }); arbre(-18 + i * 5, 33, 2.2, 8, i === 0 ? 'tilleul' : 'platane'); }
  for (let x = 124; x <= 216; x += 7.5) for (let z = -336; z <= -264; z += 7.5) arbre(x + ((x * 7 + z * 3) % 5) * 0.3, z + ((x * 3 + z * 11) % 5) * 0.3, 3, 17, 'conifere', true); // une forêt de conifères (BD TOPO)
  for (let z = -120; z <= 60; z += 9) if (Math.abs(z + 50) > 10) arbre(xAin(z) + 39, z, 2.3, 24, 'peuplier'); // les peupliers de la rive est de l'Ain
  for (let z = 10; z <= 110; z += 10) arbre(106.5, z, 3, 11, 'tilleul'); // l'alignement de la Rue B
  for (let x = -106; x <= -64; x += 7) for (let z = -296; z <= -254; z += 7) arbre(x, z, 2, 4.5, 'fruitier'); // un verger (BD TOPO)
  for (const [x, z] of [[-112, 12], [62, 186], [196, 52]]) arbre(x, z, 4.2, 13, 'feuillu'); // des arbres isolés dans les jardins
  chemin(rect(250, -320, 330, -220), { landuse: 'forest' }, true);
  chemin(rect(-200, -300, -120, -220), { landuse: 'vineyard' }, true);
  chemin(rect(150, 150, 260, 250), { landuse: 'meadow' }, true);
  const zonesVeg = [{ p: rect(118, -342, 224, -258), nature: 'Forêt fermée de conifères' }, { p: rect(-110, -300, -60, -250), nature: 'Verger' }, { p: rect(-60, -232, 0, -230), nature: 'Haie' }];
  const haiesBD = [{ l: [[-100, -200], [-20, -200]], hauteur: 2, largeur: 1 }], haieOSM = [[60, 240], [95, 240]];
  chemin(haieOSM, { barrier: 'hedge' });
  // les murs, un portail, une clôture, un mur de soutènement ; un mur qui traverse la Rue A (il doit être coupé)
  chemin([[-170, 175], [-100, 175]], { barrier: 'wall', height: '2' }); noeud([-135, 175], { barrier: 'gate' });
  chemin([[-60, 120], [0, 120]], { barrier: 'wall' });
  chemin([[60, 200], [90, 200]], { barrier: 'fence' }); chemin([[-150, -160], [-100, -160]], { barrier: 'retaining_wall' });
  const mursBD = [{ l: [[200, 20], [230, 20]], nature: 'Mur' }];
  // le mobilier
  for (const z of [0, 30, 60]) noeud([-26, z], { highway: 'street_lamp' });
  noeud([-10, 20], { amenity: 'bench' }); noeud([5, 15], { amenity: 'fountain', name: "Fontaine d'essai" }); noeud([-15, 5], { historic: 'memorial', memorial: 'war_memorial', name: "Monument aux morts d'essai" });
  noeud([-26, -40], { highway: 'bus_stop', shelter: 'yes', name: 'Arrêt d’essai' }); noeud([0, -6.4], { amenity: 'post_box' }); noeud([12, 20], { amenity: 'waste_basket' }); noeud([-20, -2], { barrier: 'bollard' });
  const ponctuels = [{ q: [-150, -100], nature: 'Calvaire' }];
  // les surfaces
  chemin(rect(-120, 100, -80, 120), { amenity: 'parking' }, true); chemin(rect(-320, 0, -290, 30), { landuse: 'cemetery' }, true);
  const relief = (x, z) => 240 + 0.03 * x + 30 * Math.exp(-((x - 155) ** 2 + (z + 170) ** 2) / (2 * 70 ** 2)) + 520 * Math.max(0, 1 - Math.hypot(x - 6000, z + 1000) / 2500); // et une montagne à 6 km
  const reliefLL = (lat, lon) => { const [x, z] = Rc.xz(lat, lon); return relief(x, z); };
  // les arbres et les bâtiments dans un index (pour peindre vite)
  const idxV = grille(10); vrais.forEach((a) => idxV.ajouter([a.x - a.r, a.z - a.r, a.x + a.r, a.z + a.r], a));
  const idxB = grille(20); peints.forEach((p) => idxB.ajouter(boite(p), { p, ardoise: ardoises.includes(p) }));
  const hauteurVraie = (x, z) => { // le MNH : couronnes (dôme ou cône), bâtiments, haies
    let hh = 0; for (const a of idxV.autour(x, z, 0)) { const d = Math.hypot(x - a.x, z - a.z); if (d < a.r) hh = Math.max(hh, a.cone ? a.h * (1 - d / a.r) + 2 : a.h * Math.sqrt(1 - (d / a.r) ** 2)); }
    for (const b of idxB.autour(x, z, 0)) if (dedans(x, z, b.p)) hh = Math.max(hh, 8);
    for (const hz of haiesBD) if (distBord(x, z, hz.l, false) < 0.5) hh = Math.max(hh, 2);
    if (distBord(x, z, haieOSM, false) < 0.6) hh = Math.max(hh, 1.6);
    return hh;
  };
  // la photo : herbe, rues grises, eau bleue, toits rouges (gris-bleu pour quelques-uns), arbres, rangs de vigne nord-sud ; et sa version infrarouge
  const peintsB = peints.map((p) => ({ p, b: boite(p), ardoise: ardoises.includes(p) })), eauP = [ouest.concat(est)], rues2 = routes.slice(0, 5), vigne = rect(-200, -300, -120, -220);
  const tuile = (tx, ty, z, irc) => {
    const d = new Uint8Array(256 * 256 * 4), [la0, lo0] = [MERC.lat(ty * 256, z), MERC.lon(tx * 256, z)], [la1, lo1] = [MERC.lat(ty * 256 + 256, z), MERC.lon(tx * 256 + 256, z)];
    const [xa, za] = Rc.xz(la0, lo0), [xb, zb] = Rc.xz(la1, lo1), bt = [Math.min(xa, xb), Math.min(za, zb), Math.max(xa, xb), Math.max(za, zb)], ici = peintsB.filter((o) => boitesSeCroisent(o.b, bt, 1));
    const arbresIci = vrais.filter((a) => a.x + a.r >= bt[0] && a.x - a.r <= bt[2] && a.z + a.r >= bt[1] && a.z - a.r <= bt[3]);
    for (let j = 0; j < 256; j++) { const lat = MERC.lat(ty * 256 + j + 0.5, z); for (let i = 0; i < 256; i++) {
      const [x, zz] = Rc.xz(lat, MERC.lon(tx * 256 + i + 0.5, z)), o = (j * 256 + i) * 4; let c = irc ? [172, 95, 100] : ((Math.floor(x / 10) + Math.floor(zz / 10)) & 1) ? [112, 152, 84] : [100, 140, 78];
      const a = arbresIci.find((t) => (x - t.x) ** 2 + (zz - t.z) ** 2 < t.r * t.r), toit = ici.find((q) => dedans(x, zz, q.p));
      if (toit) c = irc ? [110, 170, 60] : toit.ardoise ? [75, 82, 100] : [222, 58, 52];
      else if (a) c = irc ? (a.cone ? [150, 40, 60] : [215, 45, 70]) : (a.cone ? [40, 80, 45] : [62, 110, 52]);
      else if ((x < -150 && eauP.some((p) => dedans(x, zz, p))) || distBord(x, zz, routes[5], false) < 1.5) c = irc ? [25, 50, 90] : [70, 110, 170];
      else if (rues2.some((l) => distBord(x, zz, l, false) < 3)) c = irc ? [120, 125, 120] : [150, 150, 150];
      else if (dedans(x, zz, vigne)) c = (((x + 400) % 2.2) < 0.8) ? (irc ? [190, 60, 80] : [70, 105, 52]) : (irc ? [120, 110, 100] : [158, 140, 104]);
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    } }
    return Buffer.from(JPEG.encode({ data: d, width: 256, height: 256 }, 92).data);
  };
  const rep = (status, corps) => ({ ok: status >= 200 && status < 300, status, arrayBuffer: async () => { const b = Buffer.isBuffer(corps) ? corps : Buffer.from(corps); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } });
  const appels = { overpassPrincipal: 0, kumi: 0, wfs: 0, wms: 0, api: 0, wmts: 0, mnh: 0, irc: 0, ua: true };
  const COUCHES_WFS = ['BDTOPO_V3:troncon_de_route', 'BDTOPO_V3:batiment', 'BDTOPO_V3:zone_de_vegetation', 'BDTOPO_V3:haie', 'BDTOPO_V3:construction_ponctuelle', 'BDTOPO_V3:construction_lineaire', 'BDTOPO_V3:cimetiere', 'BDTOPO_V3:terrain_de_sport'];
  const MNH = 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G';
  const geoLL = (q) => { const g = ll(q); return [g.lat, g.lon]; };
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
      appels.wfs++; const couche = p.get('TYPENAMES');
      if (p.get('REQUEST') === 'GetCapabilities') return rep(200, '<?xml version="1.0"?><wfs:WFS_Capabilities><FeatureTypeList>' + COUCHES_WFS.map((x) => `<FeatureType><Name>${x}</Name></FeatureType>`).join('') + '</FeatureTypeList></wfs:WFS_Capabilities>');
      if (p.get('REQUEST') === 'DescribeFeatureType') return rep(200, `<xsd:schema><xsd:element name="cleabs" type="xsd:string"/><xsd:element name="nature" type="xsd:string"/><xsd:element name="${couche === 'BDTOPO_V3:haie' ? 'hauteur' : 'materiaux_des_murs'}" type="xsd:string"/></xsd:schema>`);
      const [a, b, c2, d2] = p.get('BBOX').split(',').map(Number), debut = +p.get('STARTINDEX'), nb = +p.get('COUNT');
      if (a < 20) return rep(200, JSON.stringify({ type: 'FeatureCollection', features: [] })); // BBOX en lon,lat : le serveur attend lat,lon
      const dans = (q) => { const g = ll(q); return g.lat >= a && g.lat <= c2 && g.lon >= b && g.lon <= d2; };
      let tous = [];
      if (couche === 'BDTOPO_V3:batiment') tous = bd.filter((f) => dans(centroide(f.r))).map((f) => ({ geometry: { type: 'MultiPolygon', coordinates: [[f.r.concat([f.r[0]]).map((q) => geoLL(q).concat([250]))]] }, properties: Object.assign({ etat_de_l_objet: 'En service' }, f.props, { materiaux_des_murs: f.props.murs, materiaux_de_la_toiture: f.props.toiture }) }));
      if (couche === 'BDTOPO_V3:zone_de_vegetation') tous = zonesVeg.filter((f) => dans(centroide(f.p))).map((f) => ({ geometry: { type: 'Polygon', coordinates: [f.p.concat([f.p[0]]).map(geoLL)] }, properties: { nature: f.nature } }));
      if (couche === 'BDTOPO_V3:haie') tous = haiesBD.map((f) => ({ geometry: { type: 'LineString', coordinates: f.l.map(geoLL) }, properties: { hauteur: f.hauteur, largeur: f.largeur } }));
      if (couche === 'BDTOPO_V3:construction_ponctuelle') tous = ponctuels.map((f) => ({ geometry: { type: 'Point', coordinates: geoLL(f.q) }, properties: { nature: f.nature } }));
      if (couche === 'BDTOPO_V3:construction_lineaire') tous = mursBD.map((f) => ({ geometry: { type: 'LineString', coordinates: f.l.map(geoLL) }, properties: { nature: f.nature } }));
      tous = tous.map((f, i) => Object.assign({ type: 'Feature', id: couche.split(':')[1] + '.' + i }, f, { properties: Object.assign({ cleabs: couche + i }, f.properties) }));
      return rep(200, JSON.stringify({ type: 'FeatureCollection', numberMatched: tous.length, numberReturned: Math.max(0, Math.min(nb, tous.length - debut)), features: tous.slice(debut, debut + nb) }));
    }
    if (u.pathname === '/wms-r') {
      appels.wms++;
      if (p.get('REQUEST') === 'GetCapabilities') return rep(200, `<?xml version="1.0"?><WMS_Capabilities version="1.3.0"><Capability><Request><GetMap><Format>image/x-bil;bits=32</Format></GetMap></Request><Layer><Name>ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES</Name></Layer><Layer><Name>${MNH}</Name><CRS>EPSG:4326</CRS></Layer></Capability></WMS_Capabilities>`);
      const [s, w, n, e] = p.get('BBOX').split(',').map(Number), W = +p.get('WIDTH'), H = +p.get('HEIGHT'), b = Buffer.alloc(W * H * 4), estMNH = p.get('LAYERS') === MNH; if (estMNH) appels.mnh++;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const la = n - (j + 0.5) / H * (n - s), lo = w + (i + 0.5) / W * (e - w); b.writeFloatLE(estMNH ? hauteurVraie(...Rc.xz(la, lo)) : reliefLL(la, lo), (j * W + i) * 4); }
      return rep(200, b);
    }
    if (/altimetrie/.test(u.pathname)) { appels.api++; const lons = p.get('lon').split('|').map(Number), lats = p.get('lat').split('|').map(Number); return rep(200, JSON.stringify({ elevations: lats.map((la, i) => reliefLL(la, lons[i])) })); }
    if (u.pathname === '/wmts') {
      if (p.get('REQUEST') === 'GetCapabilities') return rep(200, '<?xml version="1.0"?><Capabilities><Contents>' + ['ORTHOIMAGERY.ORTHOPHOTOS', 'ORTHOIMAGERY.ORTHOPHOTOS.IRC'].map((x) => `<Layer><ows:Identifier>${x}</ows:Identifier><Format>image/jpeg</Format><TileMatrixSetLink><TileMatrixSet>PM_0_19</TileMatrixSet></TileMatrixSetLink></Layer>`).join('') + '</Contents></Capabilities>');
      appels.wmts++; const irc = /IRC/.test(p.get('LAYER')); if (irc) appels.irc++;
      return rep(200, tuile(+p.get('TILECOL'), +p.get('TILEROW'), +p.get('TILEMATRIX'), irc));
    }
    return rep(404, 'inconnu');
  };
  return { appels, relief, reliefLL, Rc, C, vrais, attendu };
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
  const relu = JSON.parse(fs.readFileSync(path.join(SORTIE, 'poncin.json'), 'utf8')); t(relu.v === 1 && relu.batiments.length === c.batiments.length && Object.keys(relu).join() === 'v,nom,source,attribution,origine,taille,relief,batiments,rues,eau,ponts,vegetation,arbres,interdit,noms,sol,zones,haies,surfaces,murs,mobilier,enseignes,horizon', 'poncin.json relu : mêmes données, clés dans l’ordre du contrat (v1 puis les champs facultatifs)');
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
    const rouge = (p) => (p[0] > 170 && p[1] < 110 && p[2] < 110) || (p[0] < 100 && p[2] > p[0] + 10 && p[2] < 125); // les toits rouges, et les gris-bleu
    const centres = c.batiments.filter((b) => Math.abs(aire(b.p)) > 40).map((b) => centroide(b.p)), dansRouge = centres.filter((q) => rouge(pix(o.brut, q))).length;
    t(dansRouge >= centres.length * 0.95, `alignement : ${dansRouge}/${centres.length} centres de bâtiments sur un toit photographié`);
    let rougesHors = 0, rouges = 0; const m2 = masqueBatiments(c.batiments, c.taille, N);
    for (let i = 0; i < N * N; i++) { if (rouge([o.brut[i * 3], o.brut[i * 3 + 1], o.brut[i * 3 + 2]])) { rouges++; if (m2[i] < 0.5) rougesHors++; } }
    t(rougesHors < rouges * 0.03, `alignement : ${(100 * rougesHors / rouges).toFixed(2)} % des pixels de toit hors des emprises (élargies de 0,5 m)`);
    const restants = centres.filter((q) => rouge(pix(o.final, q))).length; t(restants === 0, 'toits masqués (couleur de pavé) sous les bâtiments');
    const dec = JPEG.decode(fs.readFileSync(path.join(SORTIE, 'sol-1024.jpg')), { useTArray: true }); t(dec.width === 1024 && dec.height === 1024, 'sol-1024.jpg se relit en 1024×1024');
  }
  // ── l'authenticité ──
  const VX = (q) => R.xz(...m.Rc.ll(q[0], q[1])); // repère du faux bourg → repère de la carte
  const B = c.batiments;
  t(B.some((b) => b.mur === 'pierre' && b.toit === 'tuiles' && b.t === 'mairie') && B.some((b) => b.mur === 'mixte' && b.toit === 'ardoise') && B.some((b) => b.mur === 'crepi' && b.etages === 2), 'matériaux BD TOPO (fichiers fonciers) : pierre et tuiles, mixte et ardoise, parpaings enduits ; étages');
  t(B.some((b) => b.mur === 'brique') && B.filter((b) => b.forme === 'croupe').length >= 5, 'matériaux et formes OSM (building:material, roof:shape)');
  t(B.every((b) => MURS_T.includes(b.mur) && TOITS_T.includes(b.toit) && /^#[0-9a-f]{6}$/.test(b.teinteToit)) && B.find((b) => b.t === 'eglise').mur === 'pierre', 'chaque bâtiment a un mur, un toit et une teinte (déduits sinon : l’église en pierre)');
  const ard = B.filter((b) => !b.toit || b.toit === 'ardoise').filter((b) => { const v = parseInt(b.teinteToit.slice(1), 16); return ((v >> 16) & 255) < 110 && (v & 255) > ((v >> 16) & 255); });
  t(ard.length >= 8 && ard.every((b) => b.toit === 'ardoise'), `toits gris-bleu de la photo → ardoise (${ard.length})`);
  const rougeT = B.filter((b, i) => { const v = parseInt(b.teinteToit.slice(1), 16); return ((v >> 16) & 255) > 190 && ((v >> 8) & 255) < 90 && !info.mats[i].srcToit; }); t(rougeT.length >= 80 && rougeT.every((b) => b.toit === 'tuiles'), `teinte des toits rouges mesurée sur la photo → tuiles (${rougeT.length})`);
  // les arbres : retrouvés sur le LiDAR et l'infrarouge
  const vrais = m.vrais.map((a) => Object.assign({}, a, { q: VX([a.x, a.z]) })).filter((a) => Math.max(Math.abs(a.q[0]), Math.abs(a.q[1])) < c.taille / 2 - 3);
  const proche = (q, l, f) => { let b = null, bd = Infinity; for (const a of l) { const d = Math.hypot(f(a)[0] - q[0], f(a)[1] - q[1]); if (d < bd) { bd = d; b = a; } } return [b, bd]; };
  const trouves = vrais.map((a) => { const [b, d] = proche(a.q, c.arbres, (x) => x); return { a, b, d }; }).filter((x) => x.d < 2);
  t(trouves.length >= vrais.length * 0.9, `arbres retrouvés : ${trouves.length}/${vrais.length} à moins de 2 m`);
  const faux = c.arbres.filter((b) => proche(b, vrais, (a) => a.q)[1] > 2.5); t(faux.length <= c.arbres.length * 0.08, `fausses couronnes : ${faux.length}/${c.arbres.length}`);
  const med = (l) => l.slice().sort((x, y) => x - y)[l.length >> 1], er = med(trouves.map((x) => Math.abs(x.b[3] - x.a.r) / x.a.r)), eh = med(trouves.map((x) => Math.abs(x.b[2] - x.a.h) / x.a.h));
  t(er < 0.3 && eh < 0.12, `rayons des couronnes (écart médian ${(100 * er).toFixed(0)} %) et hauteurs LiDAR (${(100 * eh).toFixed(0)} %)`);
  const parEsp = {}; for (const x of trouves) { const k = x.a.e; parEsp[k] = parEsp[k] || [0, 0]; parEsp[k][1]++; if (x.b[4] === k) parEsp[k][0]++; }
  t(['conifere', 'peuplier', 'tilleul', 'fruitier', 'platane'].every((k) => parEsp[k] && parEsp[k][0] >= parEsp[k][1] * 0.7), `espèces : ${Object.entries(parEsp).map(([k, v]) => `${k} ${v[0]}/${v[1]}`).join(', ')}`);
  t(c.arbres.every((a) => a.length === 5 && ESPECES.includes(a[4])) && c.arbres.every((a) => !c.batiments.some((b) => dedans(a[0], a[1], b.p)) && !c.eau.some((e) => dedans(a[0], a[1], e.p))), 'arbres [x, z, h, r, e] : aucun tronc dans un bâtiment ni dans l’eau');
  // les haies, les murs, le mobilier, les enseignes, les surfaces
  const hBD = c.haies.find((x) => Math.abs(x.h - 2) < 0.05 && x.w === 1), hOSM = c.haies.find((x) => x !== hBD && x.w !== 2);
  t(c.haies.length === 3 && c.haies.some((x) => x.w === 2 && Math.abs(dist(x.l[0], x.l[x.l.length - 1]) - 60) < 1), 'haies : la zone de végétation « Haie » de la BD TOPO devient une haie (son grand axe)');
  t(!!hBD && !!hOSM && Math.abs(hOSM.h - 1.6) < 0.35 && !c.arbres.some((a) => c.haies.some((x) => distBord(a[0], a[1], x.l, false) < 1)), `haies : BD TOPO (2 m) et OSM (hauteur mesurée sur le LiDAR : ${hOSM && hOSM.h} m) ; aucun arbre dessus`);
  const ts = new Set(c.surfaces.map((s) => s.t)); t(['paves', 'parking', 'cimetiere', 'gravier', 'herbe'].every((x) => ts.has(x)), `surfaces : ${[...ts].join(', ')}`);
  const rueA = VX([-30, 120]), mursRueA = c.murs.filter((w) => w.l.some((q) => Math.abs(q[1] - rueA[1]) < 1)), coupe = mursRueA.length >= 2 && mursRueA.every((w) => w.l.every((q) => Math.abs(q[0] - rueA[0]) > 3));
  const porte = c.murs.find((w) => w.t === 'portail'), pq = VX([-135, 175]);
  t(coupe && !!porte && distBord(pq[0], pq[1], porte.l, false) < 0.5 && ['cloture', 'soutenement'].every((x) => c.murs.some((w) => w.t === x)) && c.murs.length >= 7, `murs : coupés à la Rue A, portail dans le mur, clôture, soutènement, mur BD TOPO (${c.murs.length})`);
  const mob = (ty) => c.mobilier.filter((x) => x.t === ty), mairie = c.batiments.find((b) => b.t === 'mairie'), boiteP = mob('boite')[0], banc = mob('banc')[0];
  const prB = banc && pointRue(res.info.ctx, banc.x, banc.z, 40), capB = prB ? capVers(prB.q[0] - banc.x, prB.q[1] - banc.z) : 9; // le banc regarde la voie la plus proche
  t(mob('lampadaire').length === 3 && mob('fontaine')[0].n === "Fontaine d'essai" && mob('monument')[0].n === "Monument aux morts d'essai" && mob('abribus').length === 1 && mob('croix').length === 1 && mob('poubelle').length && mob('borne').length, `mobilier : ${JSON.stringify(compter(c.mobilier, (x) => x.t))}`);
  t(!!boiteP && !dedans(boiteP.x, boiteP.z, mairie.p) && distBord(boiteP.x, boiteP.z, mairie.p) < 1  && !!banc && Math.abs(banc.yaw - capB) < 0.05, 'la boîte aux lettres dessinée dans le mur de la mairie est posée devant ; le banc regarde la voie la plus proche');
  const ph = c.enseignes.find((e) => e.t === 'pharmacie'), phq = VX([m.attendu.pharmacie.x, m.attendu.pharmacie.zFacade]);
  t(!!ph && Math.abs(ph.z - phq[1]) < 0.4 && Math.abs(Math.abs(ph.yaw) - Math.PI) < 0.15 && c.batiments[ph.b] && dedans(phq[0], phq[1] - 1, c.batiments[ph.b].p), `enseigne de la pharmacie sur la façade qui donne sur la route, tournée vers elle (yaw ${ph && ph.yaw})`);
  const vi = c.vegetation.find((v) => v.t === 'vigne'); t(!!vi && Math.min(Math.abs(vi.sens), Math.PI - Math.abs(vi.sens)) < 0.12 && c.vegetation.some((v) => v.t === 'verger' && typeof v.sens === 'number'), `sens des rangs de la vigne lu sur la photo (nord-sud : ${vi && vi.sens})`);
  // l'horizon, la photo de l'arène, le poids
  const hz = c.horizon, i0 = (hz.n - 1) / 2, mt = [6030, -930].map((v) => Math.round(v / hz.pas) + i0);
  t(hz.n === 129 && hz.pas === 125 && Math.abs(hz.h[i0 * hz.n + i0] - m.relief(...[0, 0].map((v, i) => v + [-30, -70][i] * 0 + m.Rc.xz(R.lat0, R.lon0)[i]))) < 3 && hz.h[mt[1] * hz.n + mt[0]] > 600, `horizon ${hz.n}×${hz.n} : le centre au bon niveau, la montagne à 6 km (${hz.h[mt[1] * hz.n + mt[0]]} m)`);
  const ar = res.info.arenePhoto;
  t(!!(ar && c.sol.arene && c.sol.arene.taille === 400 && fs.existsSync(path.join(SORTIE, c.sol.arene.image)) && dist(c.sol.arene.centre, c.zones.arene.centre) < 0.01), 'sol.arene : photo fine de 400 m centrée sur l’arène');
  if (ar && ar.brut) {
    const N = ar.N, cc = c.sol.arene.centre, mk = masqueBatiments(c.batiments, 400, N, cc[0], cc[1]); let rr = 0, hors = 0;
    for (let i = 0; i < N * N; i++) { const p = [ar.brut[i * 3], ar.brut[i * 3 + 1], ar.brut[i * 3 + 2]]; if (p[0] > 170 && p[1] < 110 && p[2] < 110) { rr++; if (mk[i] < 0.5) hors++; } }
    t(rr > 1000 && hors < rr * 0.03, `photo de l’arène : ${(100 * hors / rr).toFixed(2)} % des pixels de toit hors des emprises`);
  }
  t(fs.statSync(path.join(SORTIE, 'poncin.json')).size < 600 * 1024, `poncin.json : ${(fs.statSync(path.join(SORTIE, 'poncin.json')).size / 1024).toFixed(0)} Ko (< 600 Ko)`);
  t(c.zones.apparitions.every((q) => !c.arbres.some((a) => Math.hypot(a[0] - q[0], a[1] - q[1]) < rayonTronc(a) + 1) && !c.murs.some((w) => distBord(q[0], q[1], w.l, false) < w.e / 2 + 1)), 'les apparitions évitent les troncs et les murs');
  t(m.appels.mnh >= 1 && m.appels.irc >= 100, 'LiDAR HD (WMS-R) et infrarouge (WMTS) demandés');
  t(fs.readFileSync(path.join(SORTIE, 'LICENCE-DONNEES.md'), 'utf8').includes('ODbL') && /© IGN \d{4} – BD ORTHO®, BD TOPO®, RGE ALTI®(, LiDAR HD)? · © contributeurs OpenStreetMap \d{4}/.test(c.attribution), 'licence et attribution avec l’année');
  // le cache : une même requête ne repart pas sur le réseau
  const avant = STATS.requetes; await telecharger('https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities', {}); t(STATS.requetes === avant, 'cache des réponses brutes');
  console.log(`\nEssai : ${ok.length} vérifications ok, ${ko.length} en échec (sortie dans ${SORTIE})`);
  return ko.length;
}

function verifierFichier(f) { // --verifier [poncin.json] : le format v1 d'une carte déjà construite (et ses images de sol)
  const c = JSON.parse(fs.readFileSync(f, 'utf8')), err = verifier(c, obstacles(c.taille, c.batiments, c.interdit, c.eau, c.ponts, { arbres: c.arbres, murs: c.murs }));
  if (c.sol) for (const im of [c.sol.image, c.sol.petite].concat(c.sol.arene ? [c.sol.arene.image] : [])) if (!fs.existsSync(path.join(path.dirname(f), im))) err.push(`image ${im} absente`);
  const poids = fs.statSync(f).size; if (poids > 600 * 1024) err.push(`poncin.json pèse ${(poids / 1024).toFixed(0)} Ko (> 600 Ko)`);
  console.log(`${f} (${(poids / 1024).toFixed(0)} Ko) : ${c.batiments.length} bâtiments (${c.batiments.filter((b) => b.mur).length} avec mur, ${c.batiments.filter((b) => b.teinteToit).length} avec teinte de toit), ${c.rues.length} rues, ${c.eau.length} eau, ${c.ponts.length} ponts, ${c.noms.length} noms, ${c.zones.apparitions.length} apparitions, ${c.zones.armes.length} objets`);
  console.log(`  arbres ${c.arbres.length} ${JSON.stringify(compter(c.arbres, (a) => a[4] || '(ancien format)'))} ; haies ${(c.haies || []).length} ; surfaces ${(c.surfaces || []).length} ; murs ${(c.murs || []).length} ; mobilier ${(c.mobilier || []).length} ; enseignes ${(c.enseignes || []).length} ; horizon ${c.horizon ? c.horizon.n + '×' + c.horizon.n : 'aucun'} ; photo de l’arène ${c.sol && c.sol.arene ? c.sol.arene.image : 'aucune'}`);
  console.log(err.length ? `FORMAT INVALIDE (${err.length}) :\n  ${err.slice(0, 40).join('\n  ')}` : 'format v1 valide');
  return err.length;
}
async function principal() {
  if (ARGS.includes('--verifier')) { const a = arg('--verifier', ''); process.exit(verifierFichier(path.resolve(a && !a.startsWith('--') ? a : path.join(SORTIE, 'poncin.json'))) ? 1 : 0); }
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
