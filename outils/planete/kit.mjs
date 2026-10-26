// Le kit de la petite planète (fournil/hd/planete/planete.glb) : quelques modèles libres (Kenney, KayKit ; CC0) assemblés en UN seul GLB,
// un maillage nommé par modèle (un nœud à la racine). Chaque modèle est « cuit » comme les meubles (outils/maquette-hd/cuire-meubles.mjs) :
// les transformations des nœuds appliquées, la couleur de l'atlas sous l'UV de chaque sommet devenue une couleur de sommet (linéaire), la
// texture, les UV et les normales partis (la planète les calcule à facettes : flatShading), la base posée sur y = 0 et centrée en X/Z, un seul
// matériau blanc partagé ; pastel : la couleur mêlée de blanc (les immeubles KayKit, trop vifs pour la planète). Puis soudure,
// quantification et meshopt. src/planete.js lit chaque maillage par son nom et le ramène à une hauteur de 1.
// Lancer (depuis un dossier qui a @gltf-transform 4, meshoptimizer et sharp) :
//   node kit.mjs <racine des packs> selection.json ../../fournil/hd/planete/planete.glb
// <racine des packs> contient les packs tels que téléchargés et décompressés (voir selection.json, packs ; les adresses dans LISEZMOI.txt).
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, weld, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs'; import path from 'path';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [racine, selFich, sortie] = process.argv.slice(2);
if (!racine || !selFich || !sortie) { console.error('usage : node kit.mjs <racine des packs> selection.json <sortie.glb>'); process.exit(1); }
const sel = JSON.parse(fs.readFileSync(selFich, 'utf8'));
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); // sRGB → linéaire (COLOR_0 est linéaire)
const images = new Map();
async function pixels(tex) { const k = tex.getImage(); if (images.has(k)) return images.get(k); const { data, info } = await sharp(Buffer.from(k)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const p = { d: data, w: info.width, h: info.height }; images.set(k, p); return p; }
const mul = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const doc = new Document(); const buf = doc.createBuffer(); const scene = doc.createScene('planete');
const mat = doc.createMaterial('planete').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
const infos = [];
for (const [region, pack, fich, nom, opt] of sel.modeles) {
  const o = opt || {}, src = await io.read(path.join(racine, sel.packs[pack], fich));
  const P = [], C = [], blanc = [1, 1, 1].map(lin);
  for (const node of src.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0'), vc = prim.getAttribute('COLOR_0'), idx = prim.getIndices();
      const mt = prim.getMaterial(), f = mt ? mt.getBaseColorFactor() : [1, 1, 1, 1], tex = mt && mt.getBaseColorTexture(), img = tex && uv ? await pixels(tex) : null;
      const n = idx ? idx.getCount() : pos.getCount(), a = [0, 0, 0], t = [0, 0], c4 = [1, 1, 1, 1];
      for (let k = 0; k < n; k++) {
        const i = idx ? idx.getScalar(k) : k; pos.getElement(i, a); P.push(...mul(m, a[0], a[1], a[2]));
        let r = f[0], g = f[1], b = f[2];
        if (img) { uv.getElement(i, t); const u = ((t[0] % 1) + 1) % 1, v = ((t[1] % 1) + 1) % 1, px = Math.min(img.w - 1, Math.floor(u * img.w)), py = Math.min(img.h - 1, Math.floor(v * img.h)), q = (py * img.w + px) * 4; r *= lin(img.d[q] / 255); g *= lin(img.d[q + 1] / 255); b *= lin(img.d[q + 2] / 255); }
        if (vc) { vc.getElement(i, c4); r *= c4[0]; g *= c4[1]; b *= c4[2]; }
        if (o.pastel) { r += (blanc[0] - r) * o.pastel; g += (blanc[1] - g) * o.pastel; b += (blanc[2] - b) * o.pastel; }
        C.push(r, g, b);
      }
    }
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
  for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= mn[1]; P[i + 2] -= cz; }
  const prim = doc.createPrimitive().setMaterial(mat)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buf));
  scene.addChild(doc.createNode(nom).setMesh(doc.createMesh(nom).addPrimitive(prim)));
  infos.push({ nom, region, source: `${pack}/${fich}`, tri: P.length / 9, dims: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => +v.toFixed(3)) });
}
await doc.transform(weld(), dedup(), prune(), quantize({ quantizePosition: 14, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(sortie, doc);
const tri = infos.reduce((s, i) => s + i.tri, 0);
for (const i of infos) console.log(`${i.nom.padEnd(14)} ${String(i.tri).padStart(5)} tri  ${i.region.padEnd(9)} ${i.source}  (${i.dims.join(" × ")})`);
console.log(`${path.basename(sortie)} : ${infos.length} modèles, ${tri} triangles, ${(fs.statSync(sortie).size / 1024).toFixed(1)} Ko`);
