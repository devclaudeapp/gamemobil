// Les vraies armes de Dernier Rempart : zombies/modeles/armes/reel-<arme>.glb, faites depuis l'Ultimate Gun Pack de Quaternius (CC0,
// quaternius.com, opengameart.org/content/low-poly-guns-pack ; fichier ultimate_gun_pack_by_quaternius.zip, dossier OBJ).
// Chaque .obj (et sa .mtl : des couleurs unies, sans texture) devient un .glb : une primitive par matériau (sa couleur Kd), le canon tourné
// vers −z comme les blasters de Kenney (src-zombies/modeles.js le retourne ensuite vers +z), le tout en meshopt.
// Le sens du canon : l'axe le plus long, la bouche vers +x comme dans tout le pack (DEVINER=1 : le bout le plus fin, pour un autre pack).
// usage : ZOMBIES_SOURCES=<dossier> node outils/zombies/faire-armes-reelles.mjs   (<dossier>/quaternius-guns/ : le contenu du zip)
// Paquets : comme faire-modeles.mjs (@gltf-transform/core|extensions|functions, meshoptimizer), dans un node_modules visible d'ici.
import fs from 'fs'; import path from 'path';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, meshopt, dedup, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const ICI = path.dirname(new URL(import.meta.url).pathname), REP = process.env.ZOMBIES_SOURCES || process.exit(console.error('ZOMBIES_SOURCES ?') || 1);
const SRC = fs.readdirSync(path.join(REP, 'quaternius-guns')).map((d) => path.join(REP, 'quaternius-guns', d, 'OBJ')).find((d) => fs.existsSync(d)) || path.join(REP, 'quaternius-guns', 'OBJ');
const OUT = path.resolve(ICI, '../../zombies/modeles/armes');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// l'arme du jeu → le modèle du pack
const ARMES = {
  pistolet: 'Pistol_1', revolver: 'Revolver_2', jumeaux: 'Pistol_4', mitraillette: 'SubmachineGun_1', vipere: 'SubmachineGun_3',
  pompe: 'Shotgun_2', doublecanon: 'Shotgun_SawedOff', pompeauto: 'Shotgun_ShortStock',
  fusil: 'AssaultRifle2_1', rafale: 'AssaultRifle_1', precision: 'SniperRifle_2', canon: 'SniperRifle_5',
};

function lireMtl(f) {
  const mats = {}; let cur = null;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'newmtl') { cur = t.slice(1).join(' '); mats[cur] = [0.8, 0.8, 0.8]; }
    else if (t[0] === 'Kd' && cur) mats[cur] = t.slice(1, 4).map(Number);
  }
  return mats;
}
function lireObj(f) {
  const v = [], vn = [], groupes = new Map(); let mat = 'defaut';
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'v') v.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'vn') vn.push(t.slice(1, 4).map(Number));
    else if (t[0] === 'usemtl') mat = t.slice(1).join(' ');
    else if (t[0] === 'f') {
      const pts = t.slice(1).map((s) => { const [a, , c] = s.split('/'); return [(+a > 0 ? +a - 1 : v.length + +a), c ? (+c > 0 ? +c - 1 : vn.length + +c) : -1]; });
      if (!groupes.has(mat)) groupes.set(mat, []);
      for (let k = 1; k + 1 < pts.length; k++) groupes.get(mat).push(pts[0], pts[k], pts[k + 1]); // (en éventail)
    }
  }
  return { v, vn, groupes };
}

const lignes = [];
fs.mkdirSync(OUT, { recursive: true });
for (const [arme, nom] of Object.entries(ARMES)) {
  const o = lireObj(path.join(SRC, nom + '.obj')), mats = lireMtl(path.join(SRC, nom + '.mtl'));
  // l'axe du canon (le plus long), et de quel côté est la bouche : la tranche la moins haute
  const ax = [0, 1, 2].map((i) => { const c = o.v.map((p) => p[i]); return [Math.min(...c), Math.max(...c)]; });
  const long = ax[0][1] - ax[0][0] >= ax[2][1] - ax[2][0] ? 0 : 2;
  const [a, b] = ax[long], tranche = (de, aa) => { const ys = o.v.filter((p) => p[long] >= de && p[long] <= aa).map((p) => p[1]); return ys.length ? Math.max(...ys) - Math.min(...ys) : 1e9; };
  // (+1 : la bouche du côté max) ; le pack les tourne tous la bouche vers +x : la règle ne sert qu'à un autre modèle (une crosse repliée la trompe)
  const bout = long === 0 && process.env.DEVINER !== '1' ? 1 : tranche(b - (b - a) * 0.12, b) < tranche(a, a + (b - a) * 0.12) ? 1 : -1;
  // la rotation : la bouche vers −z, le haut reste +y
  const tourne = (p) => long === 0 ? (bout > 0 ? [p[2], p[1], -p[0]] : [-p[2], p[1], p[0]]) : (bout > 0 ? [-p[0], p[1], -p[2]] : [p[0], p[1], p[2]]);
  const doc = new Document(), buf = doc.createBuffer(), mesh = doc.createMesh(nom);
  for (const [m, tri] of o.groupes) {
    const pos = new Float32Array(tri.length * 3), nor = new Float32Array(tri.length * 3);
    tri.forEach(([vi, ni], k) => { pos.set(tourne(o.v[vi]), k * 3); nor.set(ni >= 0 ? tourne(o.vn[ni]) : [0, 1, 0], k * 3); });
    const kd = mats[m] || [0.8, 0.8, 0.8];
    const mat = doc.createMaterial(m).setBaseColorFactor([kd[0], kd[1], kd[2], 1]).setMetallicFactor(0).setRoughnessFactor(1);
    const prim = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf));
    mesh.addPrimitive(prim);
  }
  const noeud = doc.createNode(nom).setMesh(mesh); doc.createScene(arme).addChild(noeud);
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const out = path.join(OUT, `reel-${arme}.glb`); fs.writeFileSync(out, await io.writeBinary(doc));
  lignes.push(`reel-${arme}.glb ← ${nom} (${o.groupes.size} matériaux, ${(fs.statSync(out).size / 1024).toFixed(0)} Ko, bouche ${long === 0 ? 'x' : 'z'}${bout > 0 ? '+' : '−'})`);
}
fs.writeFileSync(path.join(OUT, 'LICENCE-ultimate-gun-pack.txt'), 'Ultimate Gun Pack — Quaternius (quaternius.com), juillet 2019.\nLicence : CC0 1.0 (domaine public), https://creativecommons.org/publicdomain/zero/1.0/\nSource : https://opengameart.org/content/low-poly-guns-pack (ultimate_gun_pack_by_quaternius.zip).\nLes reel-*.glb en sont convertis par outils/zombies/faire-armes-reelles.mjs (OBJ → glTF, meshopt).\n');
console.log(lignes.join('\n'));
