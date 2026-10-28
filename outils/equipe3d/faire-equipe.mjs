// Le boulanger et les apprentis en 3D (src/equipe3d.js : le défaut en qualité haute et moyenne) : fournil/hd/equipe/, le lot « equipe » de src/hd.js.
// · Les corps : Chef_Male et Chef_Female de l'Ultimate Animated Character Pack de Quaternius (CC0), le pack et le rig de 23 os des clients 3D,
//   traités comme eux (outils/clients3d/faire-clients.mjs) : chaque partie en facettes perd ses normales et se soude, les cheveux sont simplifiés
//   (ils sont presque toujours sous un couvre-chef : à 25 % chez l'homme, 20 % chez la femme), meshopt « high ». Les noms des matériaux restent :
//   ils disent le rôle de chaque couleur (peau, veste, pantalon, foulard, cheveux, yeux).
// · Les clips (anims-equipe.glb, en plus de ceux des clients, fournil/hd/clients/anims.glb : Idle, Walk, Victory…) : Walk_Carry (marcher en
//   portant le plateau) et Defeat (la panne : les épaules tombent) de l'UACP ; Working_A (pétrir), Hammering (réparer le four, la clé à la main)
//   et Cheering (la joie du boulanger) de KayKit Character Animations 1.1 (Kay Lousberg, CC0), reciblés sur le rig UACP par
//   outils/clients3d/recibler.mjs. Les pistes constantes retirées, rééchantillonnés ; les clips du haut du corps n'ont que ses os.
// · La citrouille-lanterne (p-lanterne.glb) : celle de KayKit Halloween Bits 1.0 (CC0) ; sa texture cuite en couleurs de sommets. Les autres
//   pièces des tenues (le chapeau pointu compris) sont bâties par src/equipe3d.js, sans fichier.
// usage : node faire-equipe.mjs            (écrit fournil/hd/equipe/ ; ne touche à rien d'autre ; rejoué : fichiers identiques à l'octet)
//         node faire-equipe.mjs --essai D   (écrit dans D un jeu de clips candidats, pour les juger en images : anims-candidats.glb)
// Chemins : CLIENTS3D_SOURCES (src/quat-uacp/Chef_*.gltf et License.txt, comme faire-clients.mjs) ; KAYKIT_ANIMS (le dossier
// « character-animations-1.1 » : Animations/gltf/Rig_Medium/*.glb ; sa licence, LICENSE.txt ou LICENSES/KayKit-CC0-License.txt, y est cherchée et dans ses parents) ; KAYKIT_HALLOWEEN (le dossier
// « KayKit-Halloween-Bits-1.0 » : addons/kaykit_halloween_bits/Assets/gltf/pumpkin_orange_jackolantern.gltf et LICENSE.txt).
// Paquets : @gltf-transform/core|extensions|functions 4.1.1, meshoptimizer 0.22.0, three 0.158.0, sharp 0.33.5, dans un node_modules visible
// d'ici (par exemple un lien outils/equipe3d/node_modules vers le dossier où ils sont installés).
import fs from 'fs'; import path from 'path';
import { prune, resample, meshopt, weld, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { io, rig, recibler } from '../clients3d/recibler.mjs';
await MeshoptSimplifier.ready;
const ICI = path.dirname(new URL(import.meta.url).pathname), args = process.argv.slice(2), essai = args.includes('--essai') ? path.resolve(args[args.indexOf('--essai') + 1]) : null;
const besoin = (v) => process.env[v] || process.exit(console.error(v + ' ?') || 1);
const UACP = path.join(besoin('CLIENTS3D_SOURCES'), 'src/quat-uacp'), KKA = besoin('KAYKIT_ANIMS'), KKR = path.join(KKA, 'Animations/gltf/Rig_Medium'), KHB = besoin('KAYKIT_HALLOWEEN');
const HD = essai || path.resolve(ICI, '../../fournil/hd/equipe');
const HAUT_DU_CORPS = /^(Abdomen|Torso|Neck|Head|Shoulder\.[LR]|UpperArm\.[LR]|LowerArm\.[LR]|Fist\.[LR])$/;

const ecrire = async (doc, out) => { const b = doc.getRoot().listBuffers()[0] || doc.createBuffer(); for (const a of doc.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(b); await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high' })); await io.write(out, doc); return fs.statSync(out).size; };
const retirerClip = (a) => { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); };

// ─── un corps (comme faire-clients.mjs : facettes sans normales, soudé, cheveux simplifiés) ───
async function corps(nom, ratioCheveux) {
  const doc = await io.read(path.join(UACP, nom + '.gltf')), r = doc.getRoot(), parts = [];
  for (const a of r.listAnimations()) retirerClip(a);
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) {
    const nor = p.getAttribute('NORMAL'), idx = p.getIndices().getArray(), a = [], b = [], c = []; let plats = 0;
    for (let t = 0; t < idx.length; t += 3) { nor.getElement(idx[t], a); nor.getElement(idx[t + 1], b); nor.getElement(idx[t + 2], c); const d = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]); if (d(a, b) < 0.02 && d(a, c) < 0.02) plats++; }
    const plat = plats / (idx.length / 3) >= 0.95; if (plat) p.setAttribute('NORMAL', null);
    parts.push({ p, nom: p.getMaterial().getName(), plat, v0: p.getAttribute('POSITION').getCount() });
  }
  await doc.transform(weld());
  for (const x of parts) if (x.nom === 'Hair') { const t0 = x.p.getIndices().getCount() / 3; simplifyPrimitive(x.p, { simplifier: MeshoptSimplifier, ratio: ratioCheveux, error: 0.02, lockBorder: false }); x.tris = `${t0} → ${x.p.getIndices().getCount() / 3}`; }
  const o = await ecrire(doc, path.join(HD, nom + '.glb'));
  return `${nom.padEnd(18)} ${String(o).padStart(6)} o · ${parts.map((x) => `${x.nom}${x.plat ? ' (facettes)' : ''} ${x.v0} → ${x.p.getAttribute('POSITION').getCount()} sommets${x.tris ? `, ${x.tris} triangles` : ''}`).join(' · ')}`;
}

// ─── les clips : ceux de l'UACP (Chef_Male, le rig des clients) et ceux de KayKit reciblés ───
// uacp : les noms gardés du fichier ; kaykit : [fichier, [[source, cible, { haut: le haut du corps seulement, debut, fin }]]]
async function clips(uacp, kaykit, sortie) {
  const C = rig(await io.read(path.join(UACP, 'Chef_Male.gltf'))), doc = C.doc, r = doc.getRoot(), journal = [];
  for (const a of r.listAnimations()) if (!uacp.includes(a.getName())) retirerClip(a);
  const lien = { Body: 'hips', Hips: 'hips', Abdomen: 'spine', Torso: 'chest', Head: 'head', 'UpperArm.L': 'upperarm.l', 'LowerArm.L': 'lowerarm.l', 'Fist.L': 'wrist.l',
    'UpperArm.R': 'upperarm.r', 'LowerArm.R': 'lowerarm.r', 'Fist.R': 'wrist.r', 'UpperLeg.L': 'upperleg.l', 'LowerLeg.L': 'lowerleg.l', 'Foot.L': 'foot.l', 'UpperLeg.R': 'upperleg.r', 'LowerLeg.R': 'lowerleg.r', 'Foot.R': 'foot.r' };
  const enfant = { 'UpperArm.L': 'LowerArm.L', 'LowerArm.L': 'Fist.L', 'UpperArm.R': 'LowerArm.R', 'LowerArm.R': 'Fist.R', 'UpperLeg.L': 'LowerLeg.L', 'LowerLeg.L': 'Foot.L', 'UpperLeg.R': 'LowerLeg.R', 'LowerLeg.R': 'Foot.R' };
  const haut = new Set();
  for (const [fichier, liste] of kaykit) {
    const S = rig(await io.read(path.join(KKR, fichier)));
    journal.push(...recibler(S, C, { clips: liste.map(([s, c, o]) => [s, c, o]), lien, enfant, logique: { 'Foot.L': 'LowerLeg.L', 'Foot.R': 'LowerLeg.R' }, bassin: ['Body', 'hips'], hanche: ['UpperLeg.L', 'upperleg.l'], pieds: [['Foot.L', 'Foot.R'], ['foot.l', 'foot.r']], fps: 30 }));
    for (const [, c, o] of liste) if (o && o.haut) haut.add(c);
  }
  for (const a of r.listAnimations()) if (haut.has(a.getName())) for (const c of a.listChannels()) if (!HAUT_DU_CORPS.test(c.getTargetNode().getName())) { const s = c.getSampler(); c.dispose(); s.dispose(); } // le haut du corps seulement
  // les pistes constantes : égales, à chaque clé, au TRS de repos du nœud (ce que three.js garde quand un clip n'a pas la piste)
  const repos = (n, p) => (p === 'translation' ? n.getTranslation() : p === 'rotation' ? n.getRotation() : n.getScale());
  let retirees = 0;
  for (const a of r.listAnimations()) for (const c of a.listChannels()) {
    const s = c.getSampler(), out = s.getOutput(), v0 = repos(c.getTargetNode(), c.getTargetPath()), e = [], tol = c.getTargetPath() === 'translation' ? 1e-4 : 1e-5;
    let constante = true; for (let i = 0; i < out.getCount() && constante; i++) { out.getElement(i, e); if (!e.every((x, k) => Math.abs(x - v0[k]) < tol)) constante = false; }
    if (constante) { c.dispose(); s.dispose(); retirees++; }
  }
  for (const n of r.listNodes()) if (n.getMesh()) n.setMesh(null);
  for (const m of r.listMeshes()) m.dispose(); for (const m of r.listMaterials()) m.dispose();
  await doc.transform(resample({ tolerance: 0.0015 }));
  const o = await ecrire(doc, path.join(HD, sortie + '.glb'));
  return `${sortie.padEnd(18)} ${String(o).padStart(6)} o · ${r.listAnimations().map((a) => `${a.getName()} ${a.listChannels().length} pistes`).join(' · ')} · ${retirees} pistes constantes retirées · ${journal.join(', ')}`;
}

// ─── une pièce cuite : l'atlas devient couleur de sommet (sRGB → linéaire), un seul nœud, posé à l'origine ───
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
async function piece(fichier, nomNoeud, sortie) {
  const doc = await io.read(fichier), r = doc.getRoot();
  for (const a of r.listAnimations()) retirerClip(a);
  const garde = r.listNodes().find((n) => (n.getName() === nomNoeud || !nomNoeud) && n.getMesh());
  if (!garde) throw new Error(`pièce introuvable : ${nomNoeud} dans ${fichier}`);
  const sc = r.listScenes()[0]; for (const c of sc.listChildren()) sc.removeChild(c);
  for (const n of r.listNodes()) { for (const c of n.listChildren()) n.removeChild(c); n.setSkin(null); }
  for (const s of r.listSkins()) s.dispose();
  garde.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); sc.addChild(garde);
  for (const n of r.listNodes()) if (n !== garde) n.dispose();
  for (const p of garde.getMesh().listPrimitives()) {
    const mat = p.getMaterial(), tex = mat && mat.getBaseColorTexture(), uv = p.getAttribute('TEXCOORD_0'), pos = p.getAttribute('POSITION'), n = pos.getCount();
    const col = new Float32Array(n * 4).fill(1), f = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
    if (tex && uv) { const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const e = [];
      for (let i = 0; i < n; i++) { uv.getElement(i, e); const x = Math.min(info.width - 1, Math.max(0, Math.floor((e[0] - Math.floor(e[0])) * info.width))), y = Math.min(info.height - 1, Math.max(0, Math.floor((e[1] - Math.floor(e[1])) * info.height))), k = (y * info.width + x) * 4; col.set([lin(data[k] / 255) * f[0], lin(data[k + 1] / 255) * f[1], lin(data[k + 2] / 255) * f[2], 1], i * 4); } }
    p.setAttribute('COLOR_0', doc.createAccessor().setType('VEC4').setArray(col)); p.setAttribute('TEXCOORD_0', null); p.setAttribute('JOINTS_0', null); p.setAttribute('WEIGHTS_0', null);
    if (mat) mat.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
  }
  for (const t of r.listTextures()) t.dispose();
  await doc.transform(weld());
  let tris = 0; for (const p of garde.getMesh().listPrimitives()) tris += p.getIndices() ? p.getIndices().getCount() / 3 : p.getAttribute('POSITION').getCount() / 3;
  const o = await ecrire(doc, path.join(HD, sortie + '.glb'));
  return `${sortie.padEnd(18)} ${String(o).padStart(6)} o · ${tris} triangles`;
}
const licence = (dossier) => { for (let d = dossier, k = 0; k < 4; k++, d = path.dirname(d)) { const f = ['LICENSE.txt', 'License.txt', 'LICENCE.txt', 'LICENSES/KayKit-CC0-License.txt'].map((x) => path.join(d, x)).find((x) => fs.existsSync(x)); if (f) return f; } throw new Error('licence introuvable près de ' + dossier); }; // (le miroir des animations KayKit la range à sa racine : LICENSES/)

if (essai) { // le jeu de clips candidats (pour les juger en images ; rien n'est écrit dans le dépôt)
  fs.mkdirSync(HD, { recursive: true });
  console.log(await clips(['Walk_Carry', 'Run_Carry', 'Defeat', 'Victory', 'PickUp', 'Idle'], [
    ['Rig_Medium_Tools.glb', ['Working_A', 'Working_B', 'Working_C', 'Work_A', 'Work_B', 'Work_C', 'Holding_A', 'Holding_B', 'Holding_C', 'Hammering', 'Lockpicking', 'Sawing'].map((n) => [n, n])],
    ['Rig_Medium_Simulation.glb', [['Cheering', 'Cheering'], ['Waving', 'Waving']]],
    ['Rig_Medium_General.glb', [['Interact', 'Interact'], ['Use_Item', 'Use_Item'], ['PickUp', 'PickUp_KK'], ['Idle_A', 'Idle_A'], ['Idle_B', 'Idle_B'], ['Hit_A', 'Hit_A']]],
  ], 'anims-candidats'));
  console.log(await corps('Chef_Male', 0.25)); console.log(await corps('Chef_Female', 0.2));
  process.exit(0);
}

fs.rmSync(HD, { recursive: true, force: true }); fs.mkdirSync(HD, { recursive: true });
fs.copyFileSync(path.join(UACP, 'License.txt'), path.join(HD, 'LICENCE.txt'));
fs.copyFileSync(licence(KKA), path.join(HD, 'LICENCE-kaykit-animations.txt'));
fs.copyFileSync(licence(KHB), path.join(HD, 'LICENCE-kaykit-halloween.txt'));
for (const f of fs.readdirSync(HD)) fs.chmodSync(path.join(HD, f), 0o644); // (une licence copiée garde le mode de sa source)
const lignes = [];
lignes.push(await corps('Chef_Male', 0.25)); lignes.push(await corps('Chef_Female', 0.2));
lignes.push(await clips(['Walk_Carry', 'Defeat'], [
  ['Rig_Medium_Tools.glb', [['Working_A', 'Working_A'], ['Hammering', 'Hammering', { haut: true }]]],
  ['Rig_Medium_Simulation.glb', [['Cheering', 'Cheering', { haut: true }]]],
], 'anims-equipe'));
lignes.push(await piece(path.join(KHB, 'addons/kaykit_halloween_bits/Assets/gltf/pumpkin_orange_jackolantern.gltf'), '', 'p-lanterne'));
fs.writeFileSync(path.join(HD, 'LISEZMOI.txt'), `Le boulanger et les apprentis de la boutique en personnages 3D (src/equipe3d.js), en qualité haute et moyenne, la HD permise.
· Chef_Male.glb, Chef_Female.glb : Quaternius, Ultimate Animated Character Pack (CC0, quaternius.com ; LICENCE.txt ; source : le dépôt GitHub
  dancerphil/games), le même pack et le même rig de 23 os que les clients (fournil/hd/clients/). Meshopt, sans clips, les facettes sans normales
  et soudées, les cheveux simplifiés.
· anims-equipe.glb : Walk_Carry et Defeat de ce pack ; Working_A, Hammering et Cheering de KayKit Character Animations 1.1 (Kay Lousberg, CC0 ;
  LICENCE-kaykit-animations.txt ; source : le miroir GitHub GeorgeQLe/assets-kaykit-3d-characters, commit af08a62, dossier
  character-animations-1.1), reciblés sur le rig UACP. Les autres clips (Idle, Walk, Victory…) sont ceux des clients (fournil/hd/clients/anims.glb).
· p-lanterne.glb : la citrouille-lanterne de KayKit Halloween Bits 1.0 (Kay Lousberg, CC0 ; LICENCE-kaykit-halloween.txt) ; sa texture cuite
  en couleurs de sommets. Les autres pièces des tenues (dont le chapeau pointu) sont bâties par le module, sans fichier.
Refaits par outils/equipe3d/faire-equipe.mjs.
`);
for (const l of lignes) console.log(l);
const tot = fs.readdirSync(HD).filter((f) => f.endsWith('.glb')).reduce((s, f) => s + fs.statSync(path.join(HD, f)).size, 0);
console.log(`total ${tot} o (${(tot / 1024).toFixed(0)} Ko)`);
