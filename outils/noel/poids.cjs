#!/usr/bin/env node
// Le poids de la page (docs/noel-contrat.md § 9) : ce qu'un lot a coûté, fichier par fichier, compressé comme build.js le compresse
// (terser 5.51.2, les mêmes options ; la CSS par le même minifieur simple), entre deux versions du dépôt (git show A:src/f et B:src/f).
// Sert à estimer ce que coûteront l'Avent, la saison d'hiver et le Marché de Noël d'après ce qu'ont coûté le Marché d'automne et la
// saison d'automne (de b5202a1, avant le point 6, à e134eea, le point 6 fini).
// Lancer : NODE_PATH=<terser@5.51.2>/node_modules node outils/noel/poids.cjs [A] [B]   (défaut : b5202a1 e134eea)
'use strict';
const { execFileSync } = require('child_process'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const terser = require('terser');
if (require('terser/package.json').version !== '5.51.2') { console.error('terser 5.51.2 attendu'); process.exit(2); }
const OPT = { compress: { toplevel: false, pure_getters: false, typeofs: false, keep_fargs: true, keep_classnames: true, unsafe: false, passes: 1 },
  mangle: { toplevel: false, keep_classnames: true, safari10: true }, format: { comments: /\(MIT, ©/, inline_script: true, safari10: true }, keep_classnames: true, toplevel: false, module: false };
const minCss = (src) => { // (le minifieur de build.js, recopié)
  let out = '', i = 0; const n = src.length;
  while (i < n) { const c = src[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; out += ' '; continue; }
    if (/\s/.test(c)) { let j = i; while (j < n && /\s/.test(src[j])) j++; out += ' '; i = j; continue; }
    out += c; i++; }
  return out.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((m, k) => (k % 2 ? m : m.replace(/ *([{};]) */g, '$1').replace(/: +/g, ':').replace(/ {2,}/g, ' ').replace(/;}/g, '}'))).join('').trim() + '\n';
};
const lire = (rev, f) => { try { return execFileSync("git", ["show", `${rev}:src/${f}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { return null; } };
const fichiers = (rev) => execFileSync('git', ['ls-tree', '--name-only', `${rev}:src`], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter((f) => /\.(js|css|html)$/.test(f));
const taille = (f, s) => (s == null ? 0 : /\.js$/.test(f) ? Buffer.byteLength(terser.minify_sync({ [f]: s }, OPT).code) : /\.css$/.test(f) ? Buffer.byteLength(minCss(s)) : Buffer.byteLength(s));
const A = process.argv[2] || 'b5202a1', B = process.argv[3] || 'e134eea';
const tous = [...new Set([...fichiers(A), ...fichiers(B)])].filter((f) => !/^(poncin|zombies)/.test(f));
let tA = 0, tB = 0; const l = [];
for (const f of tous) { const a = taille(f, lire(A, f)), b = taille(f, lire(B, f)); tA += a; tB += b; if (a !== b) l.push([f, a, b]); }
l.sort((x, y) => (y[2] - y[1]) - (x[2] - x[1]));
console.log(`── de ${A} à ${B} : le JS, la CSS et le HTML de src/ compressés comme build.js ──`);
for (const [f, a, b] of l) console.log(`  ${f.padEnd(22)} ${(a / 1024).toFixed(1).padStart(7)} → ${(b / 1024).toFixed(1).padStart(7)} Ko  (${b >= a ? '+' : ''}${((b - a) / 1024).toFixed(1)})`);
console.log(`  en tout : ${(tA / 1024).toFixed(1)} → ${(tB / 1024).toFixed(1)} Ko (${tB >= tA ? '+' : ''}${((tB - tA) / 1024).toFixed(1)} Ko)`);
