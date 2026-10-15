// Opération Poncin : réduit un modèle Poly Haven (glTF 1k) en GLB léger pour poncin/objets/ (voir poncin/objets/LICENCE.txt).
// Usage (avec @gltf-transform/core, /functions, /extensions 4, meshoptimizer 0.21 et sharp installés à part) :
//   node reduire.mjs <dossier>/<nom>_1k.gltf poncin/objets/<sorte>.glb <triangles visés> <taille de texture>
import { NodeIO } from '@gltf-transform/core';
import { KHRMeshQuantization, KHRTextureTransform } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, quantize, flatten, join } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptSimplifier.ready;
const [src, out, cible, taille] = process.argv.slice(2);
// les textures non téléchargées (normales, arm) : retirées du JSON avant la lecture
const j = JSON.parse(fs.readFileSync(src, 'utf8')), dir = src.replace(/[^/]*$/, '');
const garde = new Set(); (j.images || []).forEach((im, i) => { if (fs.existsSync(dir + im.uri)) garde.add(i); });
const texOk = (t) => t && garde.has(j.textures[t.index].source);
for (const m of j.materials || []) { const p = m.pbrMetallicRoughness || {}; if (!texOk(p.baseColorTexture)) delete p.baseColorTexture; delete p.metallicRoughnessTexture; delete m.normalTexture; delete m.occlusionTexture; p.metallicFactor = 0; p.roughnessFactor = 1; }
const une = (j.images || []).find((im, i) => garde.has(i)); for (const im of j.images || []) if (!fs.existsSync(dir + im.uri) && une) im.uri = une.uri; // (élaguées ensuite)
fs.writeFileSync(dir + '_net.gltf', JSON.stringify(j));
const io = new NodeIO().registerExtensions([KHRMeshQuantization, KHRTextureTransform]);
const doc = await io.read(dir + '_net.gltf');
const root = doc.getRoot();
let tri = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tri += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
const ratio = Math.min(1, (+cible || 1000) / tri);
await doc.transform(dedup(), prune(), flatten(), join(), weld({ tolerance: 0.0001 }), simplify({ simplifier: MeshoptSimplifier, ratio, error: +(process.env.ERREUR || 0.08) }), prune());
for (const t of root.listTextures()) { const img = t.getImage(); if (!img) continue; const b = await sharp(Buffer.from(img)).resize(+taille || 256, +taille || 256, { fit: 'inside' }).jpeg({ quality: 72, mozjpeg: true }).toBuffer(); t.setImage(new Uint8Array(b)); t.setMimeType('image/jpeg'); t.setURI(''); }
await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12 }));
let tri2 = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tri2 += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3;
await io.write(out, doc);
console.log(out, `${Math.round(tri)} → ${Math.round(tri2)} triangles, ${root.listMaterials().length} matériaux, ${root.listTextures().length} textures, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko`);
