// Les clients 3D de la boutique : fournil/hd/clients/ (src/clients3d.js les lit). Quaternius, Ultimate Animated Character Pack (CC0) : six
// personnages, un fichier chacun (sans clips), et anims.glb, les clips partagés de leur rig commun de 23 os.
// · Les personnages : chaque partie (un matériau) en facettes — au moins 95 % de triangles aux trois normales égales : la peau, les vêtements,
//   les chapeaux — perd ses normales et se soude (ses sommets dédoublés pour les facettes ne font plus qu'un) ; le jeu recalcule leurs normales
//   de face au chargement (src/clients3d.js, cuire). Les parties lisses (les cheveux, le visage) gardent les leurs ; les cheveux, la partie la plus
//   lourde, sont simplifiés de moitié (meshoptimizer). Les noms des matériaux restent : ils disent le rôle de chaque couleur (peau, haut, bas…).
// · Les clips : Idle, Walk, SitDown, Victory, PickUp de l'UACP ; Wave reciblé depuis les Ultimate Modular Men & Women (Quaternius, CC0 : l'UACP
//   n'a pas de salut de la main), le haut du corps seulement ; les pistes constantes (échelle 1, translations et rotations au repos) retirées,
//   rééchantillonnés.
// · Tout en meshopt « high » (normales octaédriques, rotations en quaternions filtrés). Les clips écartés partent AVEC leurs canaux et leurs
//   échantillonneurs (Animation.dispose() seul les laisse au document : prune garde alors leurs accesseurs, et le fichier les porte).
// usage : node faire-clients.mjs   (écrit fournil/hd/clients/ ; ne touche à rien d'autre ; rejoué : fichiers identiques à l'octet)
// Chemins : CLIENTS3D_SOURCES = le dossier des sources téléchargées : src/quat-uacp/<nom>.gltf et License.txt (l'UACP, depuis le dépôt
// dancerphil/games), glb/quat-modular/anims-modular.glb (les clips des Ultimate Modular Men & Women, le rig de 62 os, sans maillage) et
// « src/freemodels/Ultimate Modular Men- Feb 2022/License.txt ».
// Paquets : @gltf-transform/core|extensions|functions 4.1, meshoptimizer 0.22, three 0.158, dans un node_modules visible d'ici (un module ES ne
// lit pas NODE_PATH : par exemple un lien outils/clients3d/node_modules vers le dossier où ils sont installés).
import fs from 'fs'; import path from 'path';
import { prune, resample, meshopt, weld, simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { io, rig, recibler } from './recibler.mjs';
await MeshoptSimplifier.ready;
const ICI = path.dirname(new URL(import.meta.url).pathname), REP = process.env.CLIENTS3D_SOURCES || process.exit(console.error('CLIENTS3D_SOURCES ?') || 1);
const HD = path.resolve(ICI, '../../fournil/hd/clients'), UACP = path.join(REP, 'src/quat-uacp');
// les six : trois femmes, trois hommes ; jeunes et âgés ; les habitués y ont chacun le leur (src/clients3d.js)
const PERSOS = ['Casual_Female', 'Casual2_Male', 'Doctor_Female_Old', 'OldClassy_Male', 'Suit_Male', 'Worker_Female'];
const CLIPS = ['Idle', 'Walk', 'SitDown', 'Victory', 'PickUp'], SOURCE_CLIPS = 'Casual_Female'; // (les clips sont les mêmes dans chaque fichier de l'UACP)
const HAUT_DU_CORPS = /^(Abdomen|Torso|Neck|Head|Shoulder\.[LR]|UpperArm\.[LR]|LowerArm\.[LR]|Fist\.[LR])$/; // les os du salut (Wave)

// (le tampon unique du document : un accesseur créé ou relu sans tampon y est rattaché avant l'écriture)
const ecrire = async (doc, out) => { const b = doc.getRoot().listBuffers()[0] || doc.createBuffer(); for (const a of doc.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(b); await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high' })); await io.write(out, doc); return fs.statSync(out).size; };
const retirerClip = (a) => { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); };

// ─── un personnage ───
async function personnage(nom) {
  const doc = await io.read(path.join(UACP, nom + '.gltf')), r = doc.getRoot(), parts = [];
  for (const a of r.listAnimations()) retirerClip(a);
  for (const m of r.listMeshes()) for (const p of m.listPrimitives()) {
    const nor = p.getAttribute('NORMAL'), idx = p.getIndices().getArray(), a = [], b = [], c = []; let plats = 0;
    for (let t = 0; t < idx.length; t += 3) { nor.getElement(idx[t], a); nor.getElement(idx[t + 1], b); nor.getElement(idx[t + 2], c); const d = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]); if (d(a, b) < 0.02 && d(a, c) < 0.02) plats++; }
    const plat = plats / (idx.length / 3) >= 0.95; if (plat) p.setAttribute('NORMAL', null);
    parts.push({ p, nom: p.getMaterial().getName(), plat, v0: p.getAttribute('POSITION').getCount() });
  }
  await doc.transform(weld());
  for (const x of parts) if (x.nom === 'Hair') { const t0 = x.p.getIndices().getCount() / 3; simplifyPrimitive(x.p, { simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.01, lockBorder: false }); x.tris = `${t0} → ${x.p.getIndices().getCount() / 3}`; }
  const o = await ecrire(doc, path.join(HD, nom + '.glb'));
  return `${nom.padEnd(18)} ${String(o).padStart(6)} o · ${parts.map((x) => `${x.nom}${x.plat ? ' (facettes)' : ''} ${x.v0} → ${x.p.getAttribute('POSITION').getCount()} sommets${x.tris ? `, ${x.tris} triangles` : ''}`).join(' · ')}`;
}

// ─── les clips ───
async function clips() {
  const doc = await io.read(path.join(UACP, SOURCE_CLIPS + '.gltf')), r = doc.getRoot();
  for (const a of r.listAnimations()) if (!CLIPS.includes(a.getName())) retirerClip(a);
  // Wave : reciblé en espace monde depuis le rig des Ultimate Modular (outils/clients3d/recibler.mjs) ; les pieds de l'UACP sont des os d'IK (enfants de
  // la racine « Bone ») : leur parent logique est le tibia
  const S = rig(await io.read(path.join(REP, 'glb/quat-modular/anims-modular.glb'))), C = rig(doc);
  const lien = { Body: 'Body', Hips: 'Hips', Abdomen: 'Abdomen', Torso: 'Torso', Neck: 'Neck', Head: 'Head', 'Shoulder.L': 'Shoulder.L', 'UpperArm.L': 'UpperArm.L', 'LowerArm.L': 'LowerArm.L', 'Fist.L': 'Wrist.L',
    'Shoulder.R': 'Shoulder.R', 'UpperArm.R': 'UpperArm.R', 'LowerArm.R': 'LowerArm.R', 'Fist.R': 'Wrist.R', 'UpperLeg.L': 'UpperLeg.L', 'LowerLeg.L': 'LowerLeg.L', 'Foot.L': 'Foot.L', 'UpperLeg.R': 'UpperLeg.R', 'LowerLeg.R': 'LowerLeg.R', 'Foot.R': 'Foot.R' };
  const enfant = { 'UpperArm.L': 'LowerArm.L', 'LowerArm.L': 'Fist.L', 'UpperArm.R': 'LowerArm.R', 'LowerArm.R': 'Fist.R', 'UpperLeg.L': 'LowerLeg.L', 'LowerLeg.L': 'Foot.L', 'UpperLeg.R': 'LowerLeg.R', 'LowerLeg.R': 'Foot.R' };
  const journal = recibler(S, C, { clips: [['Wave', 'Wave']], lien, enfant, logique: { 'Foot.L': 'LowerLeg.L', 'Foot.R': 'LowerLeg.R' }, bassin: ['Body', 'Body'], hanche: ['UpperLeg.L', 'UpperLeg.L'], pieds: [['Foot.L', 'Foot.R'], ['Foot.L', 'Foot.R']], fps: 30 });
  for (const a of r.listAnimations()) if (a.getName() === 'Wave') for (const c of a.listChannels()) if (!HAUT_DU_CORPS.test(c.getTargetNode().getName())) { const s = c.getSampler(); c.dispose(); s.dispose(); } // le haut du corps seulement
  // les pistes constantes : égales, à chaque clé, au TRS de repos du nœud (ce que three.js garde quand un clip n'a pas la piste)
  const repos = (n, p) => (p === 'translation' ? n.getTranslation() : p === 'rotation' ? n.getRotation() : n.getScale());
  let retirees = 0;
  for (const a of r.listAnimations()) for (const c of a.listChannels()) {
    const s = c.getSampler(), out = s.getOutput(), v0 = repos(c.getTargetNode(), c.getTargetPath()), e = [], tol = c.getTargetPath() === 'translation' ? 1e-4 : 1e-5;
    let constante = true; for (let i = 0; i < out.getCount() && constante; i++) { out.getElement(i, e); if (!e.every((x, k) => Math.abs(x - v0[k]) < tol)) constante = false; }
    if (constante) { c.dispose(); s.dispose(); retirees++; }
  }
  // sans maillage ni matériau : le rig (les nœuds, la peau) et les clips
  for (const n of r.listNodes()) if (n.getMesh()) n.setMesh(null);
  for (const m of r.listMeshes()) m.dispose(); for (const m of r.listMaterials()) m.dispose();
  await doc.transform(resample({ tolerance: 0.0015 }));
  const o = await ecrire(doc, path.join(HD, 'anims.glb'));
  return `anims              ${String(o).padStart(6)} o · ${r.listAnimations().map((a) => `${a.getName()} ${a.listChannels().length} pistes`).join(' · ')} · ${retirees} pistes constantes retirées · ${journal.join(', ')}`;
}

// le rig de chaque personnage doit être celui des clips (les pistes constantes retirées valent le repos de ses os)
async function verifierRigs() {
  const ref = new Map((await io.read(path.join(UACP, SOURCE_CLIPS + '.gltf'))).getRoot().listNodes().map((n) => [n.getName(), n]));
  let pire = 0;
  for (const nom of PERSOS) for (const n of (await io.read(path.join(UACP, nom + '.gltf'))).getRoot().listNodes()) {
    const m = ref.get(n.getName()); if (!m || n.getMesh() || m.getMesh()) continue;
    for (const [a, b] of [[n.getTranslation(), m.getTranslation()], [n.getRotation(), m.getRotation()]]) pire = Math.max(pire, ...a.map((x, i) => Math.abs(x - b[i])));
  }
  return pire;
}

fs.rmSync(HD, { recursive: true, force: true }); fs.mkdirSync(HD, { recursive: true });
fs.copyFileSync(path.join(UACP, 'License.txt'), path.join(HD, 'LICENCE.txt'));
fs.copyFileSync(path.join(REP, 'src/freemodels/Ultimate Modular Men- Feb 2022/License.txt'), path.join(HD, 'LICENCE-modular.txt'));
const lignes = []; for (const n of PERSOS) lignes.push(await personnage(n)); lignes.push(await clips());
fs.writeFileSync(path.join(HD, 'LISEZMOI.txt'), `Les clients de la boutique (src/clients3d.js), en qualité haute et moyenne : Quaternius, Ultimate Animated Character Pack (CC0, quaternius.com ;
source : le dépôt dancerphil/games). Un personnage par fichier (meshopt, sans clips ; les parties en facettes sans normales, soudées ; les cheveux simplifiés) :
${PERSOS.join(', ')}. anims.glb : Idle, Walk, SitDown, Victory, PickUp du pack (le rig commun de 23 os) ; Wave reciblé depuis
les Ultimate Modular Men & Women de Quaternius (CC0, LICENCE-modular.txt). Refaits par outils/clients3d/faire-clients.mjs.
`);
const ecart = await verifierRigs();
for (const l of lignes) console.log(l);
const tot = fs.readdirSync(HD).filter((f) => f.endsWith('.glb')).reduce((s, f) => s + fs.statSync(path.join(HD, f)).size, 0);
console.log(`total ${tot} o (${(tot / 1024).toFixed(0)} Ko) · écart des rigs au rig des clips : ${ecart.toExponential(1)}`);
