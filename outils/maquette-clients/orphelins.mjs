// Le bug de outils/maquette-hd/reduire.mjs et reduire-mini.mjs : Animation.dispose() détache le clip, mais ses échantillonneurs (et leurs
// accesseurs d'entrée/sortie) restent dans le document : prune() ne retire pas un accesseur encore référencé par un échantillonneur orphelin,
// et l'écriture garde tous les accesseurs de la racine. Le fichier livré porte donc les données des clips écartés, sans que rien ne les lise.
// Ce script mesure, pour chaque .glb : (1) les octets des bufferViews que plus rien ne référence (lu dans le JSON du GLB : la vérité du
// fichier), (2) la taille après relecture + prune + réécriture meshopt (même réglage), comparée à une réécriture sans prune (la base).
// usage : node orphelins.mjs fournil/hd/mini/*.glb fournil/hd/hantee3/*.glb   (ne modifie rien ; écrit ses essais dans $MAQUETTE_TRAVAIL/orphelins/)
import fs from 'fs'; import path from 'path'; import os from 'os';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const ICI = path.dirname(new URL(import.meta.url).pathname), DEPOT = path.resolve(ICI, '../..'), OUT = path.join(process.env.MAQUETTE_TRAVAIL || path.join(os.tmpdir(), 'maquette-clients'), 'orphelins'); fs.mkdirSync(OUT, { recursive: true });
function jsonGlb(buf) { const n = buf.readUInt32LE(12); return JSON.parse(buf.slice(20, 20 + n).toString('utf8')); }
const tot = { avant: 0, base: 0, apres: 0, mort: 0 };
const lignes = [];
for (const f of process.argv.slice(2)) {
  const buf = fs.readFileSync(f), j = jsonGlb(buf), acc = j.accessors || [], bv = j.bufferViews || [];
  const vus = new Set();
  for (const m of j.meshes || []) for (const p of m.primitives) { for (const a of Object.values(p.attributes)) vus.add(a); if (p.indices != null) vus.add(p.indices); for (const t of p.targets || []) for (const a of Object.values(t)) vus.add(a); }
  for (const s of j.skins || []) if (s.inverseBindMatrices != null) vus.add(s.inverseBindMatrices);
  for (const a of j.animations || []) for (const s of a.samplers) { vus.add(s.input); vus.add(s.output); }
  const morts = acc.map((a, i) => i).filter((i) => !vus.has(i));
  const bvVus = new Set([...vus].map((i) => acc[i].bufferView)), bvMorts = new Set(morts.map((i) => acc[i].bufferView).filter((b) => b != null && !bvVus.has(b)));
  const taille = (b) => { const v = bv[b], e = v.extensions && v.extensions.EXT_meshopt_compression; return e ? e.byteLength : v.byteLength; }; // l'octet réellement stocké (compressé)
  const octMorts = [...bvMorts].reduce((s, b) => s + taille(b), 0);
  const doc = await io.read(f), base = path.join(OUT, path.basename(f, '.glb') + '-base.glb'), apres = path.join(OUT, path.basename(f, '.glb') + '-elague.glb');
  const mo = doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression');
  const tampon = (d) => { const b = d.getRoot().listBuffers()[0] || d.createBuffer(); for (const a of d.getRoot().listAccessors()) if (!a.getBuffer()) a.setBuffer(b); }; // (relu en meshopt, un accesseur n'a plus de tampon)
  let baseOk = true; try { tampon(doc); if (mo) await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' })); await io.write(base, doc); } catch (e) { baseOk = false; } // (sans prune, un accesseur orphelin n'a plus de tampon : la réécriture brute échoue)
  const doc2 = await io.read(f); await doc2.transform(prune()); tampon(doc2); if (mo) await doc2.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' })); await io.write(apres, doc2);
  const r = { f: path.relative(DEPOT, f), avant: buf.length, accesseurs: acc.length, morts: morts.length, octMorts, base: baseOk ? fs.statSync(base).size : null, apres: fs.statSync(apres).size, clips: (j.animations || []).length };
  tot.avant += r.avant; tot.base += r.base || r.avant; tot.apres += r.apres; tot.mort += octMorts; lignes.push(r);
  console.log(`${r.f.padEnd(42)} ${String(r.avant).padStart(8)} o · ${String(r.clips).padStart(2)} clips · ${r.morts}/${r.accesseurs} accesseurs orphelins (${octMorts} o compressés) · réécrit sans prune ${r.base == null ? '(impossible)' : r.base + ' o'} → élagué ${r.apres} o (${((1 - r.apres / r.avant) * 100).toFixed(1)} % de moins que le fichier livré)`);
}
console.log(`TOTAL livré ${tot.avant} o · orphelins ${tot.mort} o (${(tot.mort / tot.avant * 100).toFixed(1)} %) · élagué ${tot.apres} o (−${tot.avant - tot.apres} o, ${((1 - tot.apres / tot.avant) * 100).toFixed(1)} %)`);
fs.writeFileSync(path.join(OUT, 'resultats.json'), JSON.stringify({ lignes, tot }, null, 1));
