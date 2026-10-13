// compresse un .glb / .gltf en .glb meshopt (géométrie + animations), textures gardées
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, dedup, prune, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [src, out] = process.argv.slice(2);
const doc = await io.read(src);
const GARDER = new Set(['idle', 'walk', 'sit', 'holding-both', 'interact-right', 'emote-yes']); for (const a of doc.getRoot().listAnimations()) if (!GARDER.has(a.getName())) a.dispose();
await doc.transform(resample({ tolerance: 0.002 }), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
