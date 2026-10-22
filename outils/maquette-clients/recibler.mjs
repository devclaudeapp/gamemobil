// Reciblage de clips d'un rig vers un autre (glTF), hors ligne, pour la maquette des clients 3D.
// Méthode : en espace monde, au repos de liaison (matrices de liaison inverses) des deux rigs ; pour chaque os cible relié à un os source,
//   Rcible(t) = Rsource(t) · Rsource_repos⁻¹ · A · Rcible_repos,
// où A aligne la direction de l'os cible au repos (vers son enfant) sur celle de l'os source au repos (T-pose contre A-pose) ; un os sans
// enfant relié prend l'alignement de son parent relié. Les os non reliés gardent leur rotation locale de liaison. Le bassin suit la
// translation de l'os source, à l'échelle des hauteurs de bassin. Les os « IK » (un pied enfant de la racine) ont un parent logique.
// usage (module) : import { recibler } from './recibler.mjs' ; voir faire-packs.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const V = () => new THREE.Vector3(), Qn = () => new THREE.Quaternion(), M4 = () => new THREE.Matrix4();
const trs = (t, r, s) => M4().compose(new THREE.Vector3(...t), new THREE.Quaternion(...r), new THREE.Vector3(...s));

// un rig : ses nœuds, parents, la pose de liaison en monde (os : inverse de la matrice de liaison ; ancêtres non-os : TRS du fichier)
export function rig(doc) {
  const root = doc.getRoot(), parent = new Map(), parNom = new Map();
  for (const n of root.listNodes()) for (const c of n.listChildren()) parent.set(c, n);
  const skin = root.listSkins()[0], joints = skin.listJoints(), ibm = skin.getInverseBindMatrices();
  const bindW = new Map();
  // la liaison est exprimée dans le repère du nœud qui porte le maillage skinné (glTF : jointMatrix = monde(maillage)⁻¹ · monde(os) · IBM) :
  // le monde de liaison d'un os = monde(nœud du maillage) · IBM⁻¹ (Kenney : son nœud tourne de −90° en X et grandit ×100)
  const porteur = root.listNodes().find((n) => n.getSkin() === skin);
  const mondeTRS = (n) => { const l = trs(n.getTranslation(), n.getRotation(), n.getScale()), p = parent.get(n); return p ? mondeTRS(p).multiply(l) : l; };
  const base = porteur ? mondeTRS(porteur) : M4();
  joints.forEach((j, i) => { const m = M4().fromArray(ibm.getElement(i, [])); bindW.set(j, base.clone().multiply(m.invert())); });
  // le monde de liaison d'un nœud qui n'est pas un os : son TRS composé à son parent
  const mondeBind = (n) => { if (bindW.has(n)) return bindW.get(n); const p = parent.get(n), l = trs(n.getTranslation(), n.getRotation(), n.getScale()); const w = p ? mondeBind(p).clone().multiply(l) : l; bindW.set(n, w); return w; };
  const parNomF = (nom) => { let f = parNom.get(nom); if (!f) { f = root.listNodes().find((n) => n.getName() === nom); parNom.set(nom, f); } return f; };
  // la rotation/translation/échelle locale de liaison d'un os (relative à son parent réel)
  const bindLocal = new Map();
  for (const n of root.listNodes()) { const p = parent.get(n), w = mondeBind(n), l = p ? mondeBind(p).clone().invert().multiply(w) : w.clone(); const t = V(), q = Qn(), s = V(); l.decompose(t, q, s); bindLocal.set(n, { t, q, s }); }
  // l'ordre parent d'abord
  const ordre = []; const vu = new Set(); const visiter = (n) => { if (vu.has(n)) return; const p = parent.get(n); if (p) visiter(p); vu.add(n); ordre.push(n); }; for (const n of root.listNodes()) visiter(n);
  return { doc, root, parent, joints, bindW, bindLocal, ordre, nommé: parNomF };
}

// un clip échantillonné : nœud → { t, r, s } locaux à l'instant t (animé, sinon le TRS du fichier : ce que fait three.js)
function lireClip(anim) {
  const ch = [];
  for (const c of anim.listChannels()) { const s = c.getSampler(); ch.push({ node: c.getTargetNode(), path: c.getTargetPath(), tin: Array.from(s.getInput().getArray()), out: s.getOutput().getArray(), n: s.getOutput().getElementSize(), interp: s.getInterpolation() }); }
  let duree = 0; for (const c of ch) duree = Math.max(duree, c.tin[c.tin.length - 1]); return { ch, duree };
}
function echantillon(c, t, out) {
  const T = c.tin, n = c.n, cub = c.interp === 'CUBICSPLINE', k = cub ? 3 : 1, val = (i, o) => { for (let j = 0; j < n; j++) o[j] = c.out[(i * k + (cub ? 1 : 0)) * n + j]; return o; };
  if (t <= T[0]) return val(0, out); if (t >= T[T.length - 1]) return val(T.length - 1, out);
  let i = 0; while (i < T.length - 2 && T[i + 1] < t) i++;
  const a = val(i, new Array(n)), b = val(i + 1, new Array(n)), u = c.interp === 'STEP' ? 0 : (t - T[i]) / (T[i + 1] - T[i]);
  if (c.path === 'rotation') { const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), u); out[0] = q.x; out[1] = q.y; out[2] = q.z; out[3] = q.w; return out; }
  for (let j = 0; j < n; j++) out[j] = a[j] + (b[j] - a[j]) * u; return out;
}
function poseA(R, clip, t) { // nœud → matrice monde à l'instant t
  const loc = new Map();
  for (const n of R.ordre) loc.set(n, { t: n.getTranslation().slice(), r: n.getRotation().slice(), s: n.getScale().slice() });
  for (const c of clip.ch) { const l = loc.get(c.node); if (!l) continue; echantillon(c, t, c.path === 'translation' ? l.t : c.path === 'rotation' ? l.r : l.s); }
  const w = new Map(); for (const n of R.ordre) { const p = R.parent.get(n), l = loc.get(n), m = trs(l.t, l.r, l.s); w.set(n, p ? w.get(p).clone().multiply(m) : m); } return w;
}
const rotDe = (m) => { const t = V(), q = Qn(), s = V(); m.decompose(t, q, s); return q; };
const posDe = (m) => V().setFromMatrixPosition(m);

// recibler(src, cible, { clips: [[nomSource, nomCible, { boucle, debut, fin }]], lien: { osCible: osSource }, enfant: { osCible: enfantCible } (les directions),
//   logique: { osCible: parentLogique } (un pied IK), bassin: [osCible, osSource], fps }) → les clips ajoutés au document cible (nœuds nommés de la cible)
export function recibler(S, C, o) {
  const fps = o.fps || 30, nomS = (n) => S.nommé(n), nomC = (n) => C.nommé(n);
  const lien = new Map(Object.entries(o.lien).map(([c, s]) => [nomC(c), nomS(s)]).filter(([c, s]) => { if (!c || !s) console.warn('os introuvable', c && c.getName(), s && s.getName()); return c && s; }));
  // A : alignement des directions au repos (os → enfant relié)
  const A = new Map();
  const dirRepos = (R, n, e) => posDe(R.bindW.get(e)).sub(posDe(R.bindW.get(n))).normalize();
  for (const n of C.ordre) {
    if (!lien.has(n)) continue;
    const ec = o.enfant && o.enfant[n.getName()] ? nomC(o.enfant[n.getName()]) : null, es = ec && lien.get(ec);
    if (ec && es) A.set(n, Qn().setFromUnitVectors(dirRepos(C, n, ec), dirRepos(S, lien.get(n), es)));
    else { let p = (o.logique && o.logique[n.getName()] ? nomC(o.logique[n.getName()]) : C.parent.get(n)); while (p && !A.has(p)) p = C.parent.get(p); A.set(n, p ? A.get(p).clone() : Qn()); }
  }
  const [bC, bS] = o.bassin.map((x, i) => (i ? nomS(x) : nomC(x)));
  // l'échelle des déplacements : la longueur de jambe (hanche → cheville au repos) ; les pieds : [[cible g, d], [source g, d]]
  const [pc, ps] = o.pieds.map((l, i) => l.map((x) => (i ? nomS(x) : nomC(x)))), [hc, hs] = o.hanche.map((x, i) => (i ? nomS(x) : nomC(x)));
  const kL = (posDe(C.bindW.get(hc)).y - posDe(C.bindW.get(pc[0])).y) / (posDe(S.bindW.get(hs)).y - posDe(S.bindW.get(ps[0])).y);
  const chevilleC = posDe(C.bindW.get(pc[0])).y, chevilleS = posDe(S.bindW.get(ps[0])).y;
  const out = [];
  for (const [nomClipS, nomClipC, opt] of o.clips) {
    const anim = S.root.listAnimations().find((a) => a.getName() === nomClipS); if (!anim) { console.warn('clip absent', nomClipS); continue; }
    const clip = lireClip(anim), t0 = (opt && opt.debut) || 0, t1 = Math.min(clip.duree, (opt && opt.fin != null) ? opt.fin : clip.duree), nb = Math.max(2, Math.round((t1 - t0) * fps) + 1);
    const pistes = new Map(); for (const n of C.ordre) if (C.joints.includes(n)) pistes.set(n, { r: [], t: [] });
    const temps = []; let ecartMax = 0;
    for (let k = 0; k < nb; k++) {
      const t = t0 + (t1 - t0) * k / (nb - 1); temps.push(t - t0);
      const wS = poseA(S, clip, opt && opt.fige != null ? opt.fige : t);
      const poser = (dy) => { // la pose cible complète, le bassin relevé de dy
        const wC = new Map();
        for (const n of C.ordre) {
          const p = C.parent.get(n), pw = p ? wC.get(p) : M4(), bl = C.bindLocal.get(n);
          let w;
          if (lien.has(n)) {
            const s = lien.get(n), Rs = rotDe(wS.get(s)), Rs0 = rotDe(S.bindW.get(s)), Rt0 = rotDe(C.bindW.get(n));
            const R = Rs.clone().multiply(Rs0.clone().invert()).multiply(A.get(n)).multiply(Rt0);
            let pos;
            if (n === bC) { pos = posDe(C.bindW.get(n)).add(posDe(wS.get(s)).sub(posDe(S.bindW.get(s))).multiplyScalar(kL)); pos.y += dy; } // le bassin : le déplacement de la source, à l'échelle des jambes
            else { const lp = o.logique && o.logique[n.getName()] ? nomC(o.logique[n.getName()]) : null; // un os IK : au bout de son parent logique, l'écart de liaison gardé
              if (lp) pos = posDe(wC.get(lp).clone().multiply(C.bindW.get(lp).clone().invert().multiply(C.bindW.get(n)))); else pos = posDe(pw.clone().multiply(trs(bl.t.toArray(), bl.q.toArray(), bl.s.toArray()))); }
            const sc = V().setFromMatrixScale(C.bindW.get(n)); w = M4().compose(pos, R, sc);
          } else w = pw.clone().multiply(trs(bl.t.toArray(), bl.q.toArray(), bl.s.toArray()));
          wC.set(n, w);
        }
        return wC;
      };
      // les pieds au sol : la cheville la plus basse de la cible à la hauteur de celle de la source (son écart au repos, à l'échelle)
      let wC = poser(0);
      const basS = Math.min(...ps.map((f) => posDe(wS.get(f)).y)), basC = Math.min(...pc.map((f) => posDe(wC.get(f)).y)), voulu = chevilleC + (basS - chevilleS) * kL, dy = voulu - basC;
      ecartMax = Math.max(ecartMax, Math.abs(dy)); if (Math.abs(dy) > 1e-5) wC = poser(dy);
      for (const n of C.ordre) {
        const p = C.parent.get(n), w = wC.get(n);
        if (process.env.DEBUG_RECIBLER && k === 0 && lien.has(n)) { const s = lien.get(n), ps2 = posDe(wS.get(s)), pt = posDe(w); console.log(`  ${nomClipC} t0 ${n.getName().padEnd(12)} cible ${pt.toArray().map((v) => v.toFixed(3)).join(' ')}  source ${s.getName().padEnd(10)} ${ps2.toArray().map((v) => v.toFixed(3)).join(' ')}`); }
        const pi = pistes.get(n); if (pi) { const l = (p ? wC.get(p).clone().invert() : M4()).multiply(w), tt = V(), q = Qn(), sc = V(); l.decompose(tt, q, sc); pi.r.push(q.x, q.y, q.z, q.w); pi.t.push(tt.x, tt.y, tt.z); }
      }
    }
    // l'animation dans le document cible : rotation de chaque os (continuité des quaternions), translation du bassin et des os IK
    const doc = C.doc, buf = doc.getRoot().listBuffers()[0] || doc.createBuffer(), a = doc.createAnimation(nomClipC), entree = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(temps)).setBuffer(buf);
    for (const [n, pi] of pistes) {
      for (let k = 4; k < pi.r.length; k += 4) { const d = pi.r[k] * pi.r[k - 4] + pi.r[k + 1] * pi.r[k - 3] + pi.r[k + 2] * pi.r[k - 2] + pi.r[k + 3] * pi.r[k - 1]; if (d < 0) for (let j = 0; j < 4; j++) pi.r[k + j] = -pi.r[k + j]; }
      const sr = doc.createAnimationSampler().setInput(entree).setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array(pi.r)).setBuffer(buf)).setInterpolation('LINEAR');
      a.addSampler(sr).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath('rotation').setSampler(sr));
      const ik = o.logique && o.logique[n.getName()];
      if (n === bC || ik) { const st = doc.createAnimationSampler().setInput(entree).setOutput(doc.createAccessor().setType('VEC3').setArray(new Float32Array(pi.t)).setBuffer(buf)).setInterpolation('LINEAR'); a.addSampler(st).addChannel(doc.createAnimationChannel().setTargetNode(n).setTargetPath('translation').setSampler(st)); }
    }
    out.push(nomClipC + ` (${nb} images, ${(t1 - t0).toFixed(2)} s, pieds recalés de ${ecartMax.toFixed(3)} au plus)`);
  }
  return out;
}
