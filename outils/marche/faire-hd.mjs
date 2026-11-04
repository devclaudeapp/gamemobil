// Le lot HD de la Halle (le Marché d'automne, src/boutiquemarche.js ; fournil/hd/marche/decor-marche.glb) : les modèles CC0 de la Halle,
// chacun CUIT en couleurs de sommets (la couleur de l'atlas sous l'UV de chaque sommet × la couleur du matériau, en linéaire : les textures et
// les UV partent), ses maillages mis bout à bout dans le repère du modèle (un seul maillage par modèle, un matériau blanc partagé), une scène
// par modèle (son nom : celui du modèle), puis soudé, quantifié et compressé en meshopt (comme fournil/hd/meubles2/ et le lot de la Maison
// hantée). Le jeu les recuit à la pose (les recettes de teinte de src/boutiquemarche.js) et les fusionne en un seul maillage.
// Sources (CC0) : KayKit de Kay Lousberg (Restaurant Bits, Furniture Bits, Halloween Bits : les dépôts github.com/KayKit-Game-Assets) ;
// Kenney (Food Kit, Furniture Kit, Mini Market : les paquets complets de la branche rendu-assets de ce dépôt, fournil/modeles-kenney/).
// Lancer (depuis un dossier qui a @gltf-transform 4.1, meshoptimizer 0.22 et sharp 0.33 : un module ES ne lit pas NODE_PATH) :
//   node faire-hd.mjs <dossier des sources> <dossier de sortie>
// où le dossier des sources contient kk-restaurant/, kk-furniture/, KayKit-Halloween-Bits-1.0/ (les clones) et kenney/ (git archive
// origin/rendu-assets fournil/modeles-kenney). Déterministe : mêmes sources, même fichier.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, weld, quantize } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('usage : node faire-hd.mjs <sources> <sortie>'); process.exit(1); }
const KK = (pack, nom) => path.join(SRC, pack, 'addons', pack === 'kk-restaurant' ? 'kaykit_restaurant_bits' : pack === 'kk-furniture' ? 'kaykit_furniture_bits' : 'kaykit_halloween_bits', 'Assets', 'gltf', nom + '.gltf');
const KN = (pack, nom) => path.join(SRC, 'kenney', 'fournil', 'modeles-kenney', pack, nom + '.glb');
// la liste : [chemin, nom dans le lot]
const MODELES = [
  ...['wall', 'wall_window_open', 'wall_orderwindow', 'door_A', 'pillar_A', 'kitchencounter_straight_A', 'kitchencounter_straight_B', 'oven', 'table_round_A_small', 'chair_A', 'chair_stool',
    'crate', 'crate_carrots', 'crate_potatoes', 'crate_onions', 'crate_tomatoes', 'crate_lettuce', 'jar_A_large', 'jar_B_medium', 'menu'].map((n) => [KK('kk-restaurant', n), n]),
  ...['couch_pillows', 'armchair_pillows', 'rug_rectangle_stripes_A', 'table_low', 'lamp_standing', 'shelf_B_large_decorated', 'pictureframe_large_A'].map((n) => [KK('kk-furniture', n), n]),
  ...['pumpkin_orange', 'pumpkin_yellow', 'pumpkin_orange_small', 'pumpkin_yellow_small', 'tree_pine_orange_large', 'tree_pine_orange_medium', 'tree_pine_yellow_medium', 'lantern_standing', 'post_lantern', 'bench',
    'fence', 'fence_pillar', 'path_A', 'path_B', 'candle', 'candle_thin'].map((n) => [KK('KayKit-Halloween-Bits-1.0', n), n]),
  ...['apple', 'pear', 'pie', 'grapes', 'pumpkin-basic', 'mushroom', 'bread', 'honey', 'mug', 'barrel'].map((n) => [KN('food-kit', n), n]),
  ...['display-fruit'].map((n) => [KN('mini-market', n), n]),
  ...['bear'].map((n) => [KN('furniture-kit', n), n]),
];
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)); // sRGB → linéaire (COLOR_0 est linéaire)
const IMAGES = new Map();
async function pixels(tex) { // l'atlas décodé (en cache : un pack partage le sien)
  const im = tex.getImage(), k = tex.getURI() + ':' + (im ? im.length : 0); if (IMAGES.has(k)) return IMAGES.get(k);
  const { data, info } = await sharp(Buffer.from(im)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const p = { d: data, w: info.width, h: info.height }; IMAGES.set(k, p); return p;
}
// une matrice 4×4 (colonnes, glTF) appliquée à un point ou à une normale
const appliquer = (m, x, y, z, w) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];
const det3 = (m) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
const out = new Document(), buf = out.createBuffer(), blanc = out.createMaterial('marche').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
const rapport = [];
for (const [fichier, nom] of MODELES) {
  if (!fs.existsSync(fichier)) { console.error('manque', fichier); process.exit(1); }
  const doc = await io.read(fichier), P = [], N = [], C = [], I = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const m = node.getWorldMatrix(), inv = det3(m) < 0;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0'), col0 = prim.getAttribute('COLOR_0'), mat = prim.getMaterial(), idx = prim.getIndices();
      const f = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1], tex = mat && mat.getBaseColorTexture(), img = tex && uv ? await pixels(tex) : null, n = pos.getCount(), base = P.length / 3, t = [0, 0], a = [0, 0, 0], c4 = [1, 1, 1, 1];
      for (let i = 0; i < n; i++) {
        pos.getElement(i, a); P.push(...appliquer(m, a[0], a[1], a[2], 1));
        if (nor) { nor.getElement(i, a); const v = appliquer(m, a[0], a[1], a[2], 0), l = Math.hypot(...v) || 1; N.push(v[0] / l, v[1] / l, v[2] / l); } else N.push(0, 1, 0);
        let r = f[0], g = f[1], b = f[2];
        if (img) { uv.getElement(i, t); const u = ((t[0] % 1) + 1) % 1, vv = ((t[1] % 1) + 1) % 1, px = Math.min(img.w - 1, Math.floor(u * img.w)), py = Math.min(img.h - 1, Math.floor(vv * img.h)), o = (py * img.w + px) * 4; r *= lin(img.d[o] / 255); g *= lin(img.d[o + 1] / 255); b *= lin(img.d[o + 2] / 255); }
        if (col0) { col0.getElement(i, c4); r *= c4[0]; g *= c4[1]; b *= c4[2]; }
        C.push(r, g, b);
      }
      const nb = idx ? idx.getCount() : n;
      for (let j = 0; j < nb; j += 3) { const x = idx ? idx.getScalar(j) : j, y = idx ? idx.getScalar(j + 1) : j + 1, z = idx ? idx.getScalar(j + 2) : j + 2; I.push(base + x, base + (inv ? z : y), base + (inv ? y : z)); }
    }
  }
  const prim = out.createPrimitive().setMaterial(blanc)
    .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
    .setAttribute('COLOR_0', out.createAccessor().setType('VEC3').setArray(new Float32Array(C)).setBuffer(buf))
    .setIndices(out.createAccessor().setType('SCALAR').setArray(P.length / 3 > 65535 ? new Uint32Array(I) : new Uint16Array(I)).setBuffer(buf));
  const node = out.createNode(nom).setMesh(out.createMesh(nom).addPrimitive(prim));
  out.createScene(nom).addChild(node);
  rapport.push(`${nom} ${P.length / 3} sommets, ${I.length / 3} triangles`);
}
await out.transform(weld(), dedup(), prune(), quantize({ quantizeNormal: 8, quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
fs.mkdirSync(OUT, { recursive: true });
const sortie = path.join(OUT, 'decor-marche.glb');
await io.write(sortie, out);
console.log(rapport.join('\n'));
console.log(`${MODELES.length} modèles → ${sortie} : ${(fs.statSync(sortie).size / 1024).toFixed(0)} Ko`);
