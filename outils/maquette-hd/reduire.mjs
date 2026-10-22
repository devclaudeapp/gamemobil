// garde seulement les clips utiles d'un personnage KayKit, retire les maillages d'armes, élague ; sortie .glb
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample, quantize } from '@gltf-transform/functions';
const [src, out] = process.argv.slice(2);
const GARDER = new Set(['Idle', 'Walking_A', 'Sit_Chair_Idle', 'Interact', 'Use_Item', 'Cheer', 'PickUp', 'Sit_Chair_Down', 'Sit_Chair_StandUp']);
const CACHE = /Knife|Crossbow|Throwable|Cape|Shield|Sword|Axe|Staff|Wand|Spellbook|Mug|Hat|Helmet|Hood|Quiver|Arrow|Book/i;
const io = new NodeIO(); const doc = await io.read(src); const root = doc.getRoot();
// un clip écarté part avec ses canaux et ses échantillonneurs : Animation.dispose() seul les laisse au document, prune garde alors leurs
// accesseurs (encore référencés par les échantillonneurs orphelins) et le fichier écrit porte les données de tous les clips écartés
for (const a of root.listAnimations()) if (!GARDER.has(a.getName())) { for (const c of a.listChannels()) c.dispose(); for (const s of a.listSamplers()) s.dispose(); a.dispose(); }
for (const n of root.listNodes()) if (CACHE.test(n.getName()) && n.getMesh()) { n.getMesh().dispose(); n.dispose(); }
await doc.transform(resample({ tolerance: 0.002 }), dedup(), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }));
await io.write(out, doc);
console.log(out, root.listAnimations().map((a) => a.getName()).join(','));
