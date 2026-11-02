#!/usr/bin/env node
// Les vignettes du carnet « Mes décos », de l'étagère des trophées et du carnet du croupier (outils/vignettes/cuire.cjs → fournil/img/carnet/,
// la table src/vignettes.js), sans navigateur :
// · chaque objet du carnet (src/chaine.js, avec les familles de l'arrière-salle) qui a une entrée dans la table a son fichier : un webp de
//   256 × 256 avec sa transparence, dont l'empreinte est celle de la table (une vignette refaite change d'adresse : le cache du service worker
//   ne garde pas l'ancienne) ;
// · la table ne nomme que des objets du carnet (ou les habillages par défaut, que montre le carnet du croupier) ; pas de fichier orphelin ;
// · toutes les familles qui ont un objet 3D ont toutes leurs vignettes ; les titres, les cartes postales et le croupier gardent leur dessin ;
// · le budget : 1,5 Mo en tout au plus, 8 Ko en moyenne ;
// · sans window.FOURNIL_VERSION (l'artefact, qui n'a pas les fichiers), aucune adresse : le repli dessiné, tel quel ; la page du jeu et
//   l'artefact embarquent la table.
// Lancer : node test/fournil-vignettes.test.js
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const JEU = path.join(__dirname, '..'), DOSSIER = path.join(JEU, 'fournil', 'img', 'carnet');
const G = require(path.join(JEU, 'src', 'game.js')); global.GAME = G;
const C = require(path.join(JEU, 'src', 'casino.js'));
const CH = require(path.join(JEU, 'src', 'chaine.js'));
const V = require(path.join(JEU, 'src', 'vignettes.js'));
let fails = 0; const check = (ok, m) => { console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
// la taille d'un webp, lue dans son en-tête (VP8X : le canevas étendu, avec alpha ; VP8 : avec pertes ; VP8L : sans pertes)
function webp(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const t = buf.toString('ascii', 12, 16);
  if (t === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), alpha: !!(buf[20] & 0x10) };
  if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, alpha: false };
  if (t === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >>> 14) & 0x3fff) + 1, alpha: !!((b >>> 28) & 1) }; }
  return null;
}
const empreinte = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);

const familles = [...CH.FAMILLES, ...CH.familleCasino(C)];
const DEFAUTS = Object.entries(C.SKINS).map(([cat, l]) => `${cat}-${l.find((s) => s.defaut).id}`); // (les habillages d'office : pas au carnet, mais leur aperçu au carnet du croupier)
const SANS = new Set(['titres', 'cartes']); // (pas d'objet 3D : leur icône)
check(familles.length >= 12 && familles.some((f) => f.id === 'casino-skins'), `le carnet : ${familles.length} familles, l'arrière-salle comprise`);

// 1. chaque objet du carnet qui a une entrée : son fichier, 256 × 256, transparent, son empreinte
let n = 0, total = 0; const fautes = [], manquent = [];
for (const f of familles) {
  const items = f.id === 'casino-skins' ? [...DEFAUTS.map((id) => ({ id })), ...f.items] : f.items;
  for (const x of items) {
    const h = V.T[f.id] && V.T[f.id][x.id];
    if (!h) { if (!SANS.has(f.id) && !(f.id === 'casino-skins' && /^croupier-/.test(x.id))) manquent.push(`${f.id}/${x.id}`); continue; }
    const fichier = path.join(DOSSIER, f.id, x.id + '.webp');
    if (!fs.existsSync(fichier)) { fautes.push(`${f.id}/${x.id} : pas de fichier`); continue; }
    const b = fs.readFileSync(fichier), d = webp(b); n++; total += b.length;
    if (!d) fautes.push(`${f.id}/${x.id} : pas un webp`); else if (d.w !== 256 || d.h !== 256) fautes.push(`${f.id}/${x.id} : ${d.w} × ${d.h}`); else if (!d.alpha) fautes.push(`${f.id}/${x.id} : sans transparence`);
    if (empreinte(b) !== h) fautes.push(`${f.id}/${x.id} : empreinte ${empreinte(b)} ≠ ${h} (la table n'est plus celle des fichiers : relancer outils/vignettes/cuire.cjs)`);
  }
}
check(n > 0 && !fautes.length, `${n} vignettes : chacune son fichier webp de 256 × 256, transparent, à l'empreinte de la table${fautes.length ? ' — ' + fautes.slice(0, 6).join(' ; ') : ''}`);
check(!manquent.length, `toutes les familles qui ont un objet 3D ont toutes leurs vignettes${manquent.length ? ' — il manque ' + manquent.slice(0, 8).join(', ') : ''}`);
check(!V.T.titres && !V.T.cartes && !Object.keys(V.T['casino-skins'] || {}).some((id) => /^croupier-/.test(id)), 'les titres, les cartes postales et le croupier gardent leur dessin (pas de vignette)');

// 2. la table ne nomme que des objets du carnet (ou les habillages d'office) ; aucun fichier orphelin sur le disque
const connus = new Set(familles.flatMap((f) => f.items.map((x) => `${f.id}/${x.id}`)).concat(DEFAUTS.map((id) => `casino-skins/${id}`)));
const inconnus = Object.entries(V.T).flatMap(([f, l]) => Object.keys(l).map((id) => `${f}/${id}`)).filter((k) => !connus.has(k));
check(!inconnus.length, `la table ne nomme que des objets du carnet${inconnus.length ? ' — inconnus : ' + inconnus.join(', ') : ''}`);
const disque = fs.existsSync(DOSSIER) ? fs.readdirSync(DOSSIER).flatMap((f) => fs.readdirSync(path.join(DOSSIER, f)).map((g) => `${f}/${g}`)) : [];
const orphelins = disque.filter((k) => { const [f, g] = k.split('/'); return !(V.T[f] && V.T[f][g.replace(/\.webp$/, '')]); });
check(!orphelins.length && disque.length === n, `${disque.length} fichiers dans fournil/img/carnet/, aucun hors de la table${orphelins.length ? ' — ' + orphelins.slice(0, 6).join(', ') : ''}`);

// 3. le budget
const Mo = 1024 * 1024;
check(total <= 1.5 * Mo, `le poids : ${(total / 1024).toFixed(0)} Ko en tout (≤ 1 536 Ko)`);
check(total / Math.max(1, n) <= 8 * 1024, `en moyenne ${(total / Math.max(1, n) / 1024).toFixed(1)} Ko par vignette (≤ 8 Ko)`);

// 4. sans la page du jeu (pas de window.FOURNIL_VERSION : l'artefact), aucune adresse ; le repli dessiné tel quel
const un = Object.entries(V.T)[0], idUn = un && Object.keys(un[1])[0];
check(V.actif === false && V.src(un[0], idUn) === '' && V.img(un[0], idUn, true, '<i class="ico">x</i>') === '<i class="ico">x</i>' && V.img(un[0], idUn, false, '') === '', 'sans les fichiers (l’artefact) : aucune adresse, l’icône dessinée telle quelle');
// la page du jeu et l'artefact embarquent la table (build.js) ; la version d'essai copie img/
for (const f of ['fournil/index.html', 'dist/artifact.html']) { const p = path.join(JEU, f); check(fs.existsSync(p) && fs.readFileSync(p, 'utf8').includes('/* ── vignettes.js ── */'), `${f} embarque src/vignettes.js (node build.js)`); }
check(/\['hd', 'modeles', 'sons', 'img'\]/.test(fs.readFileSync(path.join(JEU, 'build.js'), 'utf8')), 'node build.js --essai copie img/ (les vignettes) avec hd/, modeles/ et sons/');

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\ntout est vert');
process.exit(fails ? 1 : 0);
