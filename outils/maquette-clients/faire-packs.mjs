// Les fichiers des trois packs de la maquette, dans le dépôt : fournil/hd/clients-a|b|c/ (ne touche à rien d'autre).
// A : Quaternius Ultimate Animated Character Pack (CC0) : 7 personnages (meshopt, sans clips) + anims-a.glb (Idle, Walk, SitDown, Victory)
// B : Kenney Animated Characters « Protagonists » (CC0) : le maillage, 3 peaux en 256 px + anims-b.glb (reciblés depuis l'UACP)
// C : Quaternius Ultimate Modular Men & Women (CC0) : 6 personnages + anims-c.glb (Idle, Walk du pack ; Sit, Cheer reciblés depuis l'UACP)
// usage : node faire-packs.mjs   (après node faire-anims.mjs b && node faire-anims.mjs c)
// Chemins : CLIENTS3D_SOURCES = le dossier des sources téléchargées (glb/quat-uacp, glb/kenney-anim, glb/quat-modular, src/… : le repérage ;
// d'où viennent les packs : les LISEZMOI.txt de fournil/hd/clients-*) ; MAQUETTE_TRAVAIL = un dossier de travail (par défaut : <tmp>/maquette-clients).
// Paquets : @gltf-transform/core|extensions|functions 4.1, meshoptimizer, three 0.158, dans un node_modules visible d'ici (un module ES ne lit
// pas NODE_PATH : par exemple un lien outils/maquette-clients/node_modules vers le dossier où ils sont installés). Rejoué : fichiers identiques à l'octet.
import fs from 'fs'; import path from 'path'; import os from 'os'; import { execFileSync } from 'child_process';
import { prune, resample, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { io } from './recibler.mjs';
const ICI = path.dirname(new URL(import.meta.url).pathname), REP = process.env.CLIENTS3D_SOURCES || process.exit(console.error('CLIENTS3D_SOURCES ?') || 1), GLB = path.join(process.env.MAQUETTE_TRAVAIL || path.join(os.tmpdir(), 'maquette-clients'), 'glb'), HD = path.resolve(ICI, '../../fournil/hd');
const A = ['Casual_Female', 'Casual2_Male', 'Casual3_Male', 'OldClassy_Female', 'Worker_Female', 'Casual_Bald', 'OldClassy_Male'];
const C = ['F_Casual', 'H_Casual_Hoodie', 'F_Formal', 'H_Casual_2', 'H_Farmer', 'F_Suit'];
const PEAUX_B = ['skaterMaleA', 'skaterFemaleA', 'criminalMaleA'];
const ecrire = async (doc, out) => { const b = doc.getRoot().listBuffers()[0]; for (const a of doc.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(b); await doc.transform(prune({ keepLeaves: true, keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' })); await io.write(out, doc); return fs.statSync(out).size; };
async function copier(src, out) { // relu, élagué (un accesseur orphelin s'en va), réécrit en meshopt
  const doc = await io.read(src); for (const a of doc.getRoot().listAnimations()) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
  return ecrire(doc, out);
}
async function garderClips(src, out, garder) {
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) if (!garder.includes(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); } // (le correctif : les échantillonneurs avec le clip)
  await doc.transform(resample({ tolerance: 0.0015 }));
  return ecrire(doc, out);
}
const bilan = [];
for (const [d, lic] of [['clients-a', path.join(REP, 'src/quat-uacp/License.txt')], ['clients-b', path.join(REP, 'glb/kenney-anim/License.txt')], ['clients-c', path.join(REP, 'src/freemodels/Ultimate Modular Men- Feb 2022/License.txt')]]) {
  fs.rmSync(path.join(HD, d), { recursive: true, force: true }); fs.mkdirSync(path.join(HD, d), { recursive: true }); fs.copyFileSync(lic, path.join(HD, d, 'LICENCE.txt'));
}
for (const n of A) bilan.push(['a', n, await copier(path.join(REP, 'glb/quat-uacp', n + '.glb'), path.join(HD, 'clients-a', n + '.glb'))]);
bilan.push(['a', 'anims-a', await garderClips(path.join(REP, 'glb/quat-uacp/anims-uacp.glb'), path.join(HD, 'clients-a/anims-a.glb'), ['Idle', 'Walk', 'SitDown', 'Victory'])]);
bilan.push(['b', 'characterMedium', await copier(path.join(REP, 'glb/kenney-anim/characterMedium.glb'), path.join(HD, 'clients-b/characterMedium.glb'))]);
fs.copyFileSync(path.join(GLB, 'b/anims-b.glb'), path.join(HD, 'clients-b/anims-b.glb')); bilan.push(['b', 'anims-b', fs.statSync(path.join(HD, 'clients-b/anims-b.glb')).size]);
for (const p of PEAUX_B) { const out = path.join(HD, 'clients-b', p + '.png'); execFileSync('convert', [path.join(REP, 'glb/kenney-anim', p + '.png'), '-resize', '256x256', '-strip', '-define', 'png:compression-level=9', out]); bilan.push(['b', p + '.png', fs.statSync(out).size]); }
for (const n of C) bilan.push(['c', n, await copier(path.join(REP, 'glb/quat-modular', n + '.glb'), path.join(HD, 'clients-c', n + '.glb'))]);
fs.copyFileSync(path.join(GLB, 'c/anims-c.glb'), path.join(HD, 'clients-c/anims-c.glb')); bilan.push(['c', 'anims-c', fs.statSync(path.join(HD, 'clients-c/anims-c.glb')).size]);
fs.writeFileSync(path.join(HD, 'clients-a/LISEZMOI.txt'), `MAQUETTE (?clients=a) : Quaternius, Ultimate Animated Character Pack (CC0, quaternius.com ; source : le dépôt dancerphil/games).\nUn personnage par fichier (meshopt, sans clips), anims-a.glb : Idle, Walk, SitDown, Victory (le rig commun de 23 os).\n`);
fs.writeFileSync(path.join(HD, 'clients-b/LISEZMOI.txt'), `MAQUETTE (?clients=b) : Kenney, Animated Characters « Protagonists » 1.1 (CC0, kenney.nl) : le maillage et trois peaux (256 px).\nanims-b.glb : Idle, Walk, Sit_Down, Sit_Idle, Cheer, reciblés hors ligne depuis les clips de l'UACP de Quaternius (CC0) ; le pack n'a que idle/run/jump.\n`);
fs.writeFileSync(path.join(HD, 'clients-c/LISEZMOI.txt'), `MAQUETTE (?clients=c) : Quaternius, Ultimate Modular Men & Women (CC0, quaternius.com). Six personnages (meshopt, sans clips).\nanims-c.glb : Idle, Walk du pack ; Sit_Down, Sit_Idle, Cheer reciblés hors ligne depuis l'UACP de Quaternius (CC0).\n`);
const tot = {}; for (const [p, n, o] of bilan) { tot[p] = (tot[p] || 0) + o; console.log(p, n.padEnd(20), o); }
console.log('total', JSON.stringify(tot));
