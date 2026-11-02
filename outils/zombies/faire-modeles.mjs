// Les modèles 3D de Dernier Rempart : zombies/modeles/ (src-zombies/modeles.js les lit). Tous en CC0.
// · Kenney (kenney.nl) : Graveyard Kit (le zombie de la horde, le fossoyeur qui sert de survivant), Tower Defense Kit (la tourelle, le canon
//   qui sert de mortier), Car Kit (les voitures du Parking). Chaque modèle en un seul .glb, sa palette colormap.png intégrée (elle diffère
//   d'un pack à l'autre) ; les personnages gardent seulement les clips dont le jeu se sert.
// · KayKit (Kay Lousberg, kaylousberg.com) : les boss — Golem squelette (Character Pack: Skeletons), loup-garou (Mystery Series 4),
//   Golem de glace et vampire (Mystery Series 5) — sans clips ; et les clips partagés du pack Character Animations, par squelette
//   (Rig_Large pour les golems, Rig_Medium pour les autres), sans maillage : marche, course, repos, touché, mort, coups.
// · Tout en meshopt (EXT_meshopt_compression) ; le jeu le décode avec le MeshoptDecoder de vendor/fournil-hd.min.js.
// usage : ZOMBIES_SOURCES=<dossier> node outils/zombies/faire-modeles.mjs   (écrit zombies/modeles/ ; ne touche à rien d'autre)
// Le dossier des sources : kenney-graveyard/, kenney-car/, kenney-tower/ (le dossier « Models/GLB format » de chaque pack, avec Textures/, et son
// License.txt), kaykit/ (les .glb des personnages et des clips Rig_*_{MovementBasic,General,CombatMelee}.glb, et les License-*.txt). Les packs
// viennent de kenney.nl / opengameart.org et de kaylousberg.com (ou de la copie CC0 de github.com/series-ai/jam-ready-assets).
// Paquets : @gltf-transform/core|extensions|functions 4.1, meshoptimizer 0.22, dans un node_modules visible d'ici (un module ES ne lit pas
// NODE_PATH : par exemple un lien outils/zombies/node_modules vers le dossier où ils sont installés).
import fs from 'fs'; import path from 'path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, meshopt, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
await MeshoptEncoder.ready;
const ICI = path.dirname(new URL(import.meta.url).pathname), REP = process.env.ZOMBIES_SOURCES || process.exit(console.error('ZOMBIES_SOURCES ?') || 1);
const OUT = path.resolve(ICI, '../../zombies/modeles');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

// un clip écarté part AVEC ses canaux et ses échantillonneurs (sinon prune garde leurs accesseurs)
const retirerClip = (a) => { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); };
async function ecrire(doc, out) {
  await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await io.writeBinary(doc));
  return fs.statSync(out).size;
}
const lignes = [];
async function modele(src, out, clips) {
  const doc = await io.read(src);
  for (const a of doc.getRoot().listAnimations()) if (!clips || !clips.includes(a.getName())) retirerClip(a);
  const n = await ecrire(doc, path.join(OUT, out));
  lignes.push(`${out} ${(n / 1024).toFixed(0)} Ko${clips ? ' · ' + doc.getRoot().listAnimations().map((a) => a.getName()).join(', ') : ''}`);
}
// des clips seuls : on retire maillages, peaux, matériaux et textures ; les os (des nœuds nommés) restent, les pistes les visent par leur nom
async function clipsSeuls(src, out, garder) {
  const doc = await io.read(src), r = doc.getRoot();
  for (const a of r.listAnimations()) if (!garder.some((g) => (g instanceof RegExp ? g.test(a.getName()) : g === a.getName()))) retirerClip(a);
  for (const nd of r.listNodes()) { nd.setMesh(null); nd.setSkin(null); }
  for (const m of r.listMeshes()) m.dispose();
  for (const s of r.listSkins()) s.dispose();
  const n = await ecrire(doc, path.join(OUT, out));
  lignes.push(`${out} ${(n / 1024).toFixed(0)} Ko · ${r.listAnimations().map((a) => a.getName()).join(', ')}`);
}

// ─── Kenney ───
const K = (pack, nom) => path.join(REP, 'kenney-' + pack, nom + '.glb');
const CLIPS_PERSO = ['idle', 'walk', 'sprint', 'die', 'pick-up', 'holding-both', 'holding-both-shoot'];
await modele(K('graveyard', 'character-zombie'), 'kenney/zombie.glb', CLIPS_PERSO);
await modele(K('graveyard', 'character-keeper'), 'kenney/survivant.glb', CLIPS_PERSO);
await modele(K('tower', 'weapon-turret'), 'kenney/tourelle.glb');
await modele(K('tower', 'weapon-cannon'), 'kenney/mortier.glb');
for (const v of ['sedan', 'police', 'suv', 'taxi', 'van', 'hatchback-sports']) await modele(K('car', v), `kenney/voiture-${v}.glb`);
// ─── KayKit ───
const KK = (nom) => path.join(REP, 'kaykit', nom + '.glb');
for (const [src, out] of [['Skeleton_Golem', 'golem'], ['FrostGolem', 'golem-glace'], ['Werewolf_Wolf', 'loup-garou'], ['Vampire', 'vampire']]) await modele(KK(src), `kaykit/${out}.glb`, []);
for (const rig of ['Large', 'Medium']) {
  const r = rig.toLowerCase();
  await clipsSeuls(KK(`Rig_${rig}_MovementBasic`), `kaykit/anims-${r}-marche.glb`, ['Walking_A', 'Running_A']);
  await clipsSeuls(KK(`Rig_${rig}_General`), `kaykit/anims-${r}-general.glb`, ['Idle_A', 'Hit_A', 'Death_A']);
  await clipsSeuls(KK(`Rig_${rig}_CombatMelee`), `kaykit/anims-${r}-coups.glb`, [/^Melee_Unarmed_(Smash|Punch|Attack)/, 'Melee_2H_Slam', 'Melee_1H_Attack_Chop']);
}
// ─── les licences, à côté des modèles ───
const lic = (src, out) => fs.copyFileSync(path.join(REP, src), path.join(OUT, out));
lic('kenney-graveyard/License.txt', 'kenney/LICENCE-graveyard-kit.txt'); lic('kenney-car/License.txt', 'kenney/LICENCE-car-kit.txt'); lic('kenney-tower/License.txt', 'kenney/LICENCE-tower-defense-kit.txt');
for (const n of ['skeletons', 'mystery-4', 'mystery-5', 'animations']) lic(`kaykit/License-${n}.txt`, `kaykit/LICENCE-kaykit-${n}.txt`);
console.log(lignes.join('\n'));
