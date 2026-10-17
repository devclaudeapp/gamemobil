// Les meubles KayKit de la boutique (fournil/hd/meubles2/) : chaque .gltf (Restaurant Bits, Furniture Bits ; CC0) est « cuit » —
// la couleur de l'atlas sous l'UV de chaque sommet devient une couleur de sommet (linéaire), la texture et les UV partent —, puis il est
// soudé, quantifié et compressé en meshopt. Sans texture, un meuble pèse quelques Ko et entre tel quel dans les maillages fusionnés de
// MEUBLES (MODELES.assembler, pièces à couleurs de sommets) : un appel de dessin par meuble, comme les meubles faits main.
// Lancer (depuis un dossier qui a @gltf-transform, meshoptimizer et sharp) : node cuire-meubles.mjs <dossier gltf> <sortie> nom1 nom2 …
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, weld, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import path from 'path';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [dossier, sortie, ...noms] = process.argv.slice(2);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); // sRGB → linéaire (COLOR_0 est linéaire)
const images = new Map();
async function pixels(tex) { // l'atlas décodé (mis en cache : tous les meubles d'un pack partagent le même)
  const k = tex.getURI() || tex.getName(); if (images.has(k)) return images.get(k);
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const p = { d: data, w: info.width, h: info.height }; images.set(k, p); return p;
}
for (const nom of noms) {
  const doc = await io.read(path.join(dossier, nom + '.gltf'));
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(), uv = prim.getAttribute('TEXCOORD_0'), pos = prim.getAttribute('POSITION'), n = pos.getCount();
    const f = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1], tex = mat && mat.getBaseColorTexture(), img = tex && uv ? await pixels(tex) : null;
    const col = new Float32Array(n * 3), t = [0, 0];
    for (let i = 0; i < n; i++) {
      let r = f[0], g = f[1], b = f[2];
      if (img) { uv.getElement(i, t); const u = ((t[0] % 1) + 1) % 1, v = ((t[1] % 1) + 1) % 1, px = Math.min(img.w - 1, Math.floor(u * img.w)), py = Math.min(img.h - 1, Math.floor(v * img.h)), o = (py * img.w + px) * 4; r *= lin(img.d[o] / 255); g *= lin(img.d[o + 1] / 255); b *= lin(img.d[o + 2] / 255); }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(pos.getBuffer()));
    if (uv) prim.setAttribute('TEXCOORD_0', null);
    if (mat) { mat.setBaseColorTexture(null); mat.setBaseColorFactor([1, 1, 1, 1]); mat.setMetallicFactor(0); mat.setRoughnessFactor(1); }
  }
  for (const tx of doc.getRoot().listTextures()) tx.dispose();
  await doc.transform(dedup(), prune(), weld(), quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(sortie, nom + '.glb'), doc);
}
