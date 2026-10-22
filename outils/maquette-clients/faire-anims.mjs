// Les clips reciblés des packs B (Kenney Animated Characters) et C (Quaternius Modular) depuis KayKit Character Animations 1.1 (CC0,
// Rig_Medium_*.glb). Sortie : $MAQUETTE_TRAVAIL/glb/<pack>/anims-<pack>.glb (les nœuds du rig cible, sans maillage, les clips ajoutés ; meshopt).
// usage : node faire-anims.mjs b|c
// Chemins : CLIENTS3D_SOURCES = le dossier des sources téléchargées (glb/quat-uacp, glb/kenney-anim, glb/quat-modular, src/… : le repérage ;
// d'où viennent les packs : les LISEZMOI.txt de fournil/hd/clients-*) ; MAQUETTE_TRAVAIL = un dossier de travail (par défaut : <tmp>/maquette-clients).
// Paquets : @gltf-transform/core|extensions|functions 4.1, meshoptimizer, three 0.158, dans un node_modules visible d'ici (un module ES ne lit
// pas NODE_PATH : par exemple un lien outils/maquette-clients/node_modules vers le dossier où ils sont installés). Rejoué : fichiers identiques à l'octet.
import fs from 'fs'; import path from 'path'; import os from 'os';
import { prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { io, rig, recibler } from './recibler.mjs';
const ICI = path.dirname(new URL(import.meta.url).pathname), REP = process.env.CLIENTS3D_SOURCES || process.exit(console.error('CLIENTS3D_SOURCES ?') || 1), TRAVAIL = process.env.MAQUETTE_TRAVAIL || path.join(os.tmpdir(), 'maquette-clients');
const pack = process.argv[2];
// la source : les clips de l'UACP (Quaternius, CC0 : bras le long du corps, marche naturelle) ; le rig UACP : Bone → Body (bassin, parent des
// jambes) → Hips → Abdomen → Torso → Neck → Head ; épaules sous Torso ; pieds IK sous Bone. (Les clips KayKit Character Animations 1.1
// gardent les bras écartés des chibis KayKit : essayés, écartés.)
const UACP = path.join(REP, 'glb/quat-uacp/anims-uacp.glb');
const SOURCES = { [UACP]: [['Idle', 'Idle'], ['Walk', 'Walk'], ['SitDown', 'Sit_Down'], ['SitDown', 'Sit_Idle', { fige: 0.955, fin: 1 }], ['Victory', 'Cheer']] };
const CFG = {
  b: { cible: path.join(REP, 'glb/kenney-anim/characterMedium.glb'), sortie: 'b/anims-b.glb', sources: SOURCES,
    lien: { Hips: 'Body', Spine: 'Hips', Chest: 'Abdomen', UpperChest: 'Torso', Neck: 'Neck', Head: 'Head', LeftShoulder: 'Shoulder.L', LeftArm: 'UpperArm.L', LeftForeArm: 'LowerArm.L', LeftHand: 'Fist.L',
      RightShoulder: 'Shoulder.R', RightArm: 'UpperArm.R', RightForeArm: 'LowerArm.R', RightHand: 'Fist.R', LeftUpLeg: 'UpperLeg.L', LeftLeg: 'LowerLeg.L', LeftFoot: 'Foot.L', RightUpLeg: 'UpperLeg.R', RightLeg: 'LowerLeg.R', RightFoot: 'Foot.R' },
    enfant: { LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand', LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot' },
    bassin: ['Hips', 'Body'], hanche: ['LeftUpLeg', 'UpperLeg.L'], pieds: [['LeftFoot', 'RightFoot'], ['Foot.L', 'Foot.R']] },
  c: { cible: path.join(REP, 'glb/quat-modular/anims-modular.glb'), sortie: 'c/anims-c.glb', garder: ['Idle', 'Walk'], sources: { [UACP]: [['SitDown', 'Sit_Down'], ['SitDown', 'Sit_Idle', { fige: 0.955, fin: 1 }], ['Victory', 'Cheer']] },
    lien: { Body: 'Body', Hips: 'Hips', Abdomen: 'Abdomen', Torso: 'Torso', Neck: 'Neck', Head: 'Head', 'Shoulder.L': 'Shoulder.L', 'UpperArm.L': 'UpperArm.L', 'LowerArm.L': 'LowerArm.L', 'Wrist.L': 'Fist.L',
      'Shoulder.R': 'Shoulder.R', 'UpperArm.R': 'UpperArm.R', 'LowerArm.R': 'LowerArm.R', 'Wrist.R': 'Fist.R', 'UpperLeg.L': 'UpperLeg.L', 'LowerLeg.L': 'LowerLeg.L', 'Foot.L': 'Foot.L', 'UpperLeg.R': 'UpperLeg.R', 'LowerLeg.R': 'LowerLeg.R', 'Foot.R': 'Foot.R' },
    enfant: { 'UpperArm.L': 'LowerArm.L', 'LowerArm.L': 'Wrist.L', 'UpperArm.R': 'LowerArm.R', 'LowerArm.R': 'Wrist.R', 'UpperLeg.L': 'LowerLeg.L', 'LowerLeg.L': 'Foot.L', 'UpperLeg.R': 'LowerLeg.R', 'LowerLeg.R': 'Foot.R' },
    logique: { 'Foot.L': 'LowerLeg.L', 'Foot.R': 'LowerLeg.R' }, bassin: ['Body', 'Body'], hanche: ['UpperLeg.L', 'UpperLeg.L'], pieds: [['Foot.L', 'Foot.R'], ['Foot.L', 'Foot.R']] },
};
const cfg = CFG[pack]; if (!cfg) { console.error('usage : node faire-anims.mjs b|c'); process.exit(1); }
const docC = await io.read(cfg.cible), C = rig(docC);
// les clips d'origine retirés AVEC leurs canaux et échantillonneurs (le correctif du bug de outils/maquette-hd : Animation.dispose() seul les laisse,
// et prune garde alors leurs accesseurs)
for (const a of docC.getRoot().listAnimations()) if (!(cfg.garder || []).includes(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
for (const [f, clips] of Object.entries(cfg.sources)) {
  const S = rig(await io.read(f));
  console.log(f, recibler(S, C, { clips, lien: cfg.lien, enfant: cfg.enfant, logique: cfg.logique, bassin: cfg.bassin, hanche: cfg.hanche, pieds: cfg.pieds, fps: 30 }).join(', '));
}
// sans maillage ni matériau : le rig (nœuds, peau) et les clips
for (const n of docC.getRoot().listNodes()) if (n.getMesh()) n.setMesh(null);
for (const m of docC.getRoot().listMeshes()) m.dispose(); for (const m of docC.getRoot().listMaterials()) m.dispose(); for (const t of docC.getRoot().listTextures()) t.dispose();
const buf = docC.getRoot().listBuffers()[0]; for (const a of docC.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(buf);
await docC.transform(resample({ tolerance: 0.0015 }), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const out = path.join(TRAVAIL, 'glb', cfg.sortie); fs.mkdirSync(path.dirname(out), { recursive: true }); await io.write(out, docC);
console.log(out, fs.statSync(out).size, 'o', docC.getRoot().listAnimations().map((a) => `${a.getName()} ${a.listChannels().length} pistes`).join(' · '));
