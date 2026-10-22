// compresse un .glb / .gltf en .glb meshopt (géométrie + animations), textures gardées : les Mini Characters de Kenney de fournil/hd/mini/ (six clips gardés)
// usage : node reduire-mini.mjs <source>.glb fournil/hd/mini/<nom>.glb   (paquets : @gltf-transform 4.1 et meshoptimizer, dans un node_modules visible d'ici)
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
// un clip écarté part avec ses canaux et ses échantillonneurs : Animation.dispose() seul les laisse au document, prune garde alors leurs
// accesseurs (encore référencés par les échantillonneurs orphelins) et le fichier écrit porte les données des 26 clips écartés (−56 % une fois réparé)
const GARDER = new Set(['idle', 'walk', 'sit', 'holding-both', 'interact-right', 'emote-yes']);
for (const a of doc.getRoot().listAnimations()) if (!GARDER.has(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
await doc.transform(resample({ tolerance: 0.002 }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
