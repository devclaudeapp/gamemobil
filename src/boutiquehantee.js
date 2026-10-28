/* LE FOURNIL — la boutique hantée : pendant la Maison hantée (src/hantee.js), l'écran de l'événement (src/evenement.js) ne bâtit plus le
   Manoir (sceneManoir) : il montre la VRAIE scène de la boutique (src/scene.js, src/vie.js, src/meubles.js, src/persos.js, src/hd.js),
   ENTIÈREMENT transformée pour Halloween. C'est le défaut ; ?boutique=0 dans l'adresse rend le Manoir d'avant (pour déboguer).
   · En qualité haute (et moyenne : la HD permise, lot « hantee3 » de src/hd.js chargé) : le décor hanté (KayKit, Asset Quest, Kenney, CC0 ;
     fournil/hd/hantee3/) posé sur le plan de la boutique (LAY : mêmes places, mêmes chemins) — murs et pilastres, damier et vieux parquet,
     four, comptoir et vitrine-cercueil, chaudron, tables, bar, banquette, devanture-cimetière, rue, toiles, bougies et halos, brume, ciel de
     nuit, auvent d'ardoises ; la lumière de nuit (la lune, huit lumières au plus, des halos qui vacillent) ; les CLIENTS sont neuf monstres
     animés (SORTES : un rig KayKit de 41 os, des clips partagés, les fantômes flottent par le code) ; l'équipe du Manoir à ses postes et la
     boulangère « patronne » derrière le comptoir. Tout est cuit en couleurs de sommets (les atlas KayKit sont des dégradés : l'échantillon
     au sommet suffit) et fusionné : un appel de dessin pour le décor, un par personnage.
   · En qualité éco, sans HD ou si la HD échoue : le thème « hantee » (VIE.DECORS.hantee : papier peint violet nuit, parquet sombre), les
     décos de la Maison hantée, les bougies (MEUBLES.hantee) ; les clients en chibis déguisés (les neuf sortes, PERSOS.DEGUISEMENTS), les
     apprentis en monstres du Manoir ; le boulanger en tenue d'Halloween ; le chat noir sur le comptoir.
   · L'adaptateur : l'état q de l'événement devient un état de boutique en lecture seule (etatVue : GAME.newState, jamais sauvé, comme
     la visite d'un copain), dont les stations sont les postes du Manoir (niveaux, fournées actives, monstres embauchés) ; le mobilier
     est celui de la boutique, complété par ce que l'événement a gagné (des tables de plus à chaque monstre…). SCENE.setEvenement(vue)
     bascule la scène (la vie de la boutique attend de côté) ; detruire() appelle SCENE.setEvenement(null) : tout revient.
   · L'écran : la scène se voit par une fenêtre (la place du canvas du Manoir) entre le haut de l'écran et le tiroir des cartes (qui monte
     par-dessus au doigt : src/evenement.js, tiroir ; posé au cran mi ou fermé, la fenêtre descend jusqu'à lui, et redim la suit) ; la
     boutique, ses boutons, son tiroir, sa barre du haut et ses onglets sont masqués dessous (seul son canvas se voit), et la page ne défile
     ni ne rebondit (src/evenement.js : seule la liste des cartes défile). Une feuille de style ajoutée une fois porte ces règles (classes
     .ht-boutique sur #hantee et sur body).
   · L'API des activités (les monstres à servir, les apparitions à attraper, la lumière qui baisse quand le ×6 s'endort) : acteurs, client,
     entrer, servir, fache, apparition, apparitions, attraper, retirer, surToucher, fete, ambiance (voir plus bas) ; l'écran les relie aux
     règles dans src/hanteeactivites.js. */
const BOUTIQUE_HANTEE = (() => {
  'use strict';
  const G = typeof GAME !== 'undefined' ? GAME : null;
  // l'équipe du Manoir, poste par poste (src/hantee.js, PRODUITS : staffNom), et ce que porte chaque poste (PERSOS : 'ht-acidule'…)
  const EQUIPE = ['fantome2', 'momie2', 'squelette', 'vampire2', 'sorciere2', 'citrouille', 'loupgarou', 'dragonne'];
  // les neuf sortes de clients-monstres, tirées au hasard à chaque entrée (en éco : les chibis déguisés du même nom, PERSOS.DEGUISEMENTS)
  const SORTES = ['squelette', 'squelette-sorcier', 'zombie', 'citrouille', 'fantome', 'momie', 'sorciere', 'vampire', 'loup'];
  const CLIENTS = SORTES;
  const GARDE = { tete: { forme: 'chapeau', metal: 'hantee' }, haut: { forme: 'cape', metal: 'hantee' }, pieds: { forme: 'bottes', metal: 'hantee' }, accessoire: null, cle: 'hantee' };
  const R = () => (typeof HANTEE !== 'undefined' ? HANTEE : null);
  // l'interrupteur : la boutique hantée est le défaut (?boutique=0 la coupe pour déboguer : le Manoir d'avant), la scène de la boutique en 3D,
  // et le canvas de l'écran de la Maison hantée (pas celui d'une visite)
  const demande = () => typeof location === 'undefined' || !/[?&]boutique=0(&|$)/.test(location.search);
  const actif = (cv) => demande() && typeof SCENE !== 'undefined' && !!SCENE.webgl && !!SCENE.setEvenement && !!G && !!R() && (!cv || !!(cv.closest && cv.closest('#hantee')));

  // ─── l'adaptateur : l'état de l'événement → un état de boutique (ses stations, son mobilier) ───
  function mobilier(reel, q) { // le mobilier de la boutique, et au moins ce que le Manoir a gagné (il se remplit au fil des monstres et des paliers)
    const n = q.postes.filter((s) => s.niv > 0).length, e = q.postes.filter((s) => s.staff).length, p = (q.paliers || []).length;
    const min = { tables: 2 + e, four: 1 + Math.floor(n / 2), vitrine: 1 + Math.floor(n / 3), caisse: 1 + Math.floor(p / 4), froid: 1 + Math.floor(e / 3), deco: 1 + Math.floor(p / 3), bar: 1 + Math.floor(e / 3), banquette: 1 + Math.floor(p / 4), terrasse: 1 + Math.floor(p / 5) };
    const m = {}; for (const x of G.MOBILIER) m[x.id] = Math.min(x.max, Math.max(G.mobilierCran(reel, x.id), min[x.id] || 0)); return m;
  }
  function stations(st, q) { // les postes du Manoir sont les stations : niveau, fournée en cours (actif, prog), monstre embauché
    q.postes.forEach((s, i) => { const t = st.stations[i]; if (!t) return; t.niv = s.niv; t.staff = !!s.staff; t.actif = !!s.actif; t.prog = s.prog || 0; });
    st.mobilier = mobilier(st.reel, q); return st;
  }
  function etatVue(reel, q, now) {
    const st = G.newState(now);
    Object.defineProperty(st, 'reel', { value: reel, enumerable: false }); // (jamais sauvé : la vue n'est qu'à l'écran)
    st.visite = true; st.nomBoutique = reel.nomBoutique; st.amenagement = reel.amenagement || null; // ses meubles à leur place
    st.chat = { nom: 'Minuit', caresses: 0, dernier: 0, adopte: now }; st.chatNoir = true;
    st.evTimer = 1e9; st.mystereTimer = 1e9; st.chatAttente = null; // rien ne surgit
    st.vueEv = { decor: 'hantee', tags: ['halloween', 'feuilles'], deguisements: CLIENTS };
    st.stations = R().PRODUITS.map(() => ({ niv: 0, staff: false, prog: 0, actif: false }));
    return stations(st, q);
  }
  const vueDe = () => ({ id: 'hantee', compagnon: 'chat-noir', garde: GARDE, equipe: EQUIPE, friandises: R().PRODUITS.map((p) => 'ht-' + p.id), noms: R().PRODUITS.map((p) => p.staffNom), cadre: { haut: 0, bas: 0 } });

  // ═══ la qualité haute : le décor cuit, les monstres animés, les halos (lot HD « hantee3 », src/hd.js : HDM.H3) ═══
  const HD = (() => {
    const T = typeof THREE !== 'undefined' ? THREE : null;
    let echec = ''; // une erreur pendant la préparation : la boutique hantée reste en procédural (jamais d'écran cassé)
    const H3 = () => (typeof HDM !== 'undefined' && HDM.H3) || null;
    const pret = (renderer) => !echec && !!T && typeof HDM !== 'undefined' && HDM.pret('hantee3') && HDM.permis(renderer);
    function rater(e) { echec = String((e && e.message) || e); console.warn('Boutique hantée : HD abandonnée, décor procédural', echec); }

    // ─── les couleurs : les recettes de teinte travaillent en TSL sur le sRGB brut des atlas (h en degrés), comme la planche validée ───
    const borne = (v) => Math.max(0, Math.min(1, v));
    function hsl(h, s, l) { // → [r, g, b] sRGB brut, 0..1
      h = (((h % 360) + 360) % 360) / 360; s = borne(s); l = borne(l); if (!s) return [l, l, l];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = (t) => { t = t < 0 ? t + 1 : t > 1 ? t - 1 : t; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
    }
    function enHsl(r, g, b, o) {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
      if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; }
      o[0] = h; o[1] = s; o[2] = l; return o;
    }
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)), srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    const peau = (h, s, l) => h >= 8 && h <= 40 && s > 0.25 && l > 0.5;
    const RECETTES = { // (h, s, l) → [r, g, b] ou null (la couleur reste) ; HANTER : la pierre lavande, le vieux bois, le pourpre, l'orange citrouille gardé
      hanter: (h, s, l) => {
        if (l > 0.88 && s < 0.2) return hsl(270, 0.10, l * 0.7); if (h >= 18 && h < 45 && s > 0.6 && l > 0.45) return hsl(24, 0.75, l * 0.62);
        if (h >= 12 && h < 48 && s > 0.2 && l >= 0.62) return hsl(278, 0.28, l * 0.5); if (h >= 12 && h < 48 && s > 0.2) return hsl(h - 4, s * 0.5, l * 0.55);
        if (s < 0.18) return hsl(265, 0.14, l * 0.62); if (h < 12 || h >= 330) return hsl(285, 0.45, l * 0.55); if (h >= 150 && h < 260) return hsl(262, 0.35, l * 0.45);
        if (h >= 70 && h < 150) return hsl(110, 0.55, l * 0.7); return hsl(h, s * 0.8, l * 0.75);
      },
      zombie: (h, s, l) => (peau(h, s, l) ? hsl(100, 0.32, l * 0.82) : h > 80 && h < 170 ? hsl(265, 0.18, l * 0.75) : h >= 15 && h < 45 && l <= 0.5 ? hsl(25, 0.1, l * 0.7) : null),
      vampire: (h, s, l) => (peau(h, s, l) ? hsl(255, 0.18, Math.min(0.9, l + 0.1)) : s < 0.15 ? hsl(270, 0.2, l * 0.35) : h >= 15 && h < 45 ? hsl(270, 0.15, l * 0.3) : h < 12 || h > 340 ? hsl(350, 0.75, l * 0.8) : null),
      sorciere: (h, s, l) => (peau(h, s, l) ? hsl(105, 0.45, l * 0.9) : h > 200 && h < 300 ? hsl(275, Math.max(s, 0.35), l * 0.8) : null),
      patronne: (h, s, l) => (h > 200 && h < 300 ? hsl(26, 0.85, 0.3 + l * 0.45) : null),
      momie: (h, s, l) => (l < 0.15 ? null : hsl(40, 0.28, 0.68 + l * 0.22)),
      citrouille: (h, s, l) => (h > 80 && h < 170 ? hsl(30, 0.75, l * 0.9) : null),
      sqMage: (h, s, l) => (h < 12 || h > 330 ? hsl(275, 0.45, l * 0.85) : null),
      chemise: (h, s, l) => (h > 195 && h < 250 && s > 0.25 ? hsl(272, Math.max(s, 0.4), l * 0.8) : null), // le loup-garou : la chemise violette
      dragonne: (h, s, l) => (peau(h, s, l) ? hsl(115, 0.4, l * 0.85) : h >= 15 && h < 45 ? hsl(140, 0.5, l * 0.72) : h > 150 && h < 260 ? hsl(45, 0.8, l * 0.9) : null), // la petite dragonne : écailles vertes, capuche dorée
      banniere: (h, s, l) => (h < 15 || h > 340 ? hsl(278, 0.5, l * 0.85) : null),
      fantomeMenthe: (h, s, l) => (l > 0.6 ? hsl(165, 0.45, 0.86) : null),
    };
    // ce qui luit (la lueur des sommets, un émissif à la couleur du sommet) : les flammes et les visages de citrouille (jaune-orangé vif)
    const feu = function feu(h, s, l) { return h >= 32 && h <= 62 && s > 0.55 && l > 0.5 ? 1 : 0; };
    const feuVif = function feuVif(h, s, l) { return feu(h, s, l) || 0.45; }; // une citrouille qui apparaît : elle luit toute

    // ─── les atlas, lus une fois en 256 px (des dégradés de quelques nuances : l'échantillon au sommet suffit) ───
    const PIX = new Map();
    function pixels(img) {
      let p = PIX.get(img); if (p) return p; const w = 256, h = 256, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); p = { d: x.getImageData(0, 0, w, h).data, w, h }; PIX.set(img, p); return p;
    }
    function texel(p, u, v, o) { u -= Math.floor(u); v -= Math.floor(v); const x = Math.min(p.w - 1, Math.floor(u * p.w)), y = Math.min(p.h - 1, Math.floor(v * p.h)), i = (y * p.w + x) * 4; o[0] = p.d[i] / 255; o[1] = p.d[i + 1] / 255; o[2] = p.d[i + 2] / 255; }

    // ─── cuire : des maillages → des tableaux (positions, normales, couleurs linéaires, lueur ; os et poids pour un personnage) ───
    // parts : [{ mesh, M (vers l'espace visé), remap (os d'un maillage skinné → os de la référence) | os (une pièce rigide, portée par un os), lueur }] ;
    // Mj : pour un maillage skinné, une matrice par os (chaque maillage KayKit a sa propre peau : ses matrices de liaison) ; le sommet suit son os dominant
    function cuire(parts, o) {
      let n = 0, ni = 0; for (const p of parts) { const g = p.mesh.geometry; n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), Lu = new Float32Array(n), I = new Uint32Array(ni), SI = o.skin ? new Uint16Array(n * 4) : null, SW = o.skin ? new Float32Array(n * 4) : null;
      const v = new T.Vector3(), nn = new T.Vector3(), m3 = new T.Matrix3(), uv = new T.Vector2(), rgb = [1, 1, 1], t = [0, 0, 0], rec = o.recette || null;
      let k = 0, ki = 0;
      for (const p of parts) {
        const g = p.mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, tuv = g.attributes.uv, mat = p.mesh.material, map = mat && mat.map;
        const img = map ? (o.image || map.image) : null, px = img ? pixels(img) : null, mc = mat && mat.color;
        const emi = !!(mat && ((mat.emissive && mat.emissive.r + mat.emissive.g + mat.emissive.b > 0.05) || /glow|light/i.test(mat.name || ''))); // les yeux des squelettes, la potion du chaudron
        if (map) map.updateMatrix(); m3.getNormalMatrix(p.M);
        const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, base = k, inv = p.M.determinant() < 0, n3 = p.Mj ? p.Mj.map((x) => new T.Matrix3().getNormalMatrix(x)) : null;
        for (let i = 0; i < pos.count; i++, k++) {
          let M = p.M, mn = m3;
          if (n3 && si) { let jd = si.getX(i), wd = sw.getX(i); for (const [jj, ww] of [[si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)], [si.getW(i), sw.getW(i)]]) if (ww > wd) { wd = ww; jd = jj; } M = p.Mj[jd]; mn = n3[jd]; } // l'os dominant
          v.fromBufferAttribute(pos, i).applyMatrix4(M); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
          if (nor) nn.fromBufferAttribute(nor, i).applyMatrix3(mn).normalize(); else nn.set(0, 1, 0); N[k * 3] = nn.x; N[k * 3 + 1] = nn.y; N[k * 3 + 2] = nn.z;
          if (px && tuv) { uv.fromBufferAttribute(tuv, i).applyMatrix3(map.matrix); texel(px, uv.x, uv.y, rgb); } else rgb[0] = rgb[1] = rgb[2] = 1;
          if (mc) { rgb[0] *= srgb(mc.r); rgb[1] *= srgb(mc.g); rgb[2] *= srgb(mc.b); }
          enHsl(rgb[0], rgb[1], rgb[2], t);
          const r2 = rec ? rec(t[0], t[1], t[2]) : null, c = r2 || rgb;
          C[k * 3] = lin(c[0]); C[k * 3 + 1] = lin(c[1]); C[k * 3 + 2] = lin(c[2]);
          Lu[k] = emi ? 1 : p.lueur == null ? 0 : typeof p.lueur === 'function' ? p.lueur(t[0], t[1], t[2]) : p.lueur;
          if (SI) {
            if (p.remap && si) { SI[k * 4] = p.remap[si.getX(i)]; SI[k * 4 + 1] = p.remap[si.getY(i)]; SI[k * 4 + 2] = p.remap[si.getZ(i)]; SI[k * 4 + 3] = p.remap[si.getW(i)]; SW[k * 4] = sw.getX(i); SW[k * 4 + 1] = sw.getY(i); SW[k * 4 + 2] = sw.getZ(i); SW[k * 4 + 3] = sw.getW(i); }
            else { SI[k * 4] = p.os || 0; SW[k * 4] = 1; }
          }
        }
        const idx = g.index, nb = idx ? idx.count : pos.count;
        for (let j = 0; j < nb; j += 3) { const a = idx ? idx.getX(j) : j, b = idx ? idx.getX(j + 1) : j + 1, c = idx ? idx.getX(j + 2) : j + 2; I[ki++] = base + a; I[ki++] = base + (inv ? c : b); I[ki++] = base + (inv ? b : c); }
      }
      return { P, N, C, Lu, I, SI, SW, n };
    }
    function geometrie(c) { // des tableaux cuits → une BufferGeometry
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(c.P, 3)); g.setAttribute('normal', new T.BufferAttribute(c.N, 3)); g.setAttribute('color', new T.BufferAttribute(c.C, 3)); g.setAttribute('lueur', new T.BufferAttribute(c.Lu, 1));
      if (c.SI) { g.setAttribute('skinIndex', new T.BufferAttribute(c.SI, 4)); g.setAttribute('skinWeight', new T.BufferAttribute(c.SW, 4)); }
      g.setIndex(new T.BufferAttribute(c.n > 65535 ? c.I : new Uint16Array(c.I), 1)); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
    }
    // un modèle du pack, cuit dans son repère (en cache, par recette et lueur)
    const CUITS = new Map();
    function cuitModele(nom, recette, lueur) {
      const k = `${nom}|${recette || ''}|${lueur == null ? '' : typeof lueur === 'function' ? lueur.name : lueur}`; let c = CUITS.get(k); if (c) return c;
      const src = H3().decor[nom]; if (!src) return null; src.updateMatrixWorld(true); const parts = [];
      src.traverse((o) => { if (o.isMesh) parts.push({ mesh: o, M: o.matrixWorld.clone(), lueur }); });
      c = cuire(parts, { recette: RECETTES[recette] }); const b = new T.Box3(), v = new T.Vector3(); for (let i = 0; i < c.n; i++) b.expandByPoint(v.set(c.P[i * 3], c.P[i * 3 + 1], c.P[i * 3 + 2])); c.boite = b;
      CUITS.set(k, c); return c;
    }
    function geoCentree(nom, recette, lueur, haut) { // un modèle cuit, posé (bas en y = 0), centré, à la hauteur voulue : une géométrie neuve
      const c = cuitModele(nom, recette, lueur), b = c.boite, k = haut / (b.max.y - b.min.y), geo = geometrie(Object.assign({}, c, { P: c.P.slice(), N: c.N.slice() })); // (une copie : le cuit en cache ne bouge pas)
      geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.scale(k, k, k); geo.computeBoundingBox(); geo.computeBoundingSphere(); return geo;
    }

    // ─── les matériaux partagés (jamais libérés) : couleurs de sommets, la lueur des sommets en émissif ; la momie : ses bandelettes ───
    const MATS = {};
    function lueurMat(bandes) {
      const m = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), u = { uLueur: { value: 1 } }; m.userData.u = u;
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float lueur; varying float vLueur;' + (bandes ? ' varying vec3 vPo;' : '')).replace('#include <begin_vertex>', '#include <begin_vertex>\nvLueur = lueur;' + (bandes ? ' vPo = position;' : ''));
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLueur; varying float vLueur;' + (bandes ? ' varying vec3 vPo;' : ''))
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vLueur * uLueur;');
        // les bandelettes de la momie : des rayures en espace objet, dans la pose de liaison (elles suivent le corps)
        if (bandes) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float bu = vPo.y * 4.5 + vPo.x * 1.6 + sin(vPo.z * 7.0) * 0.18; float bd = fract(bu); float bl = smoothstep(0.0, 0.16, bd) * smoothstep(1.0, 0.84, bd);
          diffuseColor.rgb *= mix(0.5, 1.0, bl) * (0.9 + 0.1 * mod(floor(bu), 2.0));`);
      };
      m.customProgramCacheKey = () => (bandes ? 'ht-lueur-bandes' : 'ht-lueur');
      if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(m); return m;
    }
    const mat = (k) => MATS[k] || (MATS[k] = lueurMat(k === 'bandes'));

    // ═══ les personnages : un prototype par sorte (un SkinnedMesh unique : tous les maillages fusionnés sur le squelette de référence),
    //     des clones (SkeletonUtils) qui partagent géométrie et matériau ; les clips partagés (anims-hante.glb) leur vont tels quels ═══
    const DEFS = {
      squelette: { src: 'Skeleton_Minion' },
      'squelette-sorcier': { src: 'Skeleton_Mage', recette: 'sqMage', marche: 'Walking_D_Skeletons' },
      zombie: { src: 'Rogue', recette: 'zombie', marche: 'Walking_D_Skeletons' },
      citrouille: { src: 'Rogue', recette: 'citrouille', masquer: /^Rogue_Head$/, tete: true },
      fantome: { fantome: 'Ghost_1', lueur: 0.28 },
      momie: { src: 'Rogue_Hooded', recette: 'momie', bandes: true, marche: 'Walking_D_Skeletons' },
      sorciere: { src: 'Mage', recette: 'sorciere' },
      vampire: { src: 'Knight', recette: 'vampire' },
      loup: { src: 'Werewolf_Wolf', image: 'hantee3/werewolf_B.png', recette: 'chemise' },
      patronne: { src: 'Mage', recette: 'patronne' }, // la boulangère déguisée : robe et chapeau orange citrouille
      hubert: { fantome: 'Ghost_3', recette: 'fantomeMenthe', lueur: 0.32 }, // Hubert le fantôme, menthe, oreilles de chat
      dragonne: { src: 'Rogue_Hooded', recette: 'dragonne' }, // Bérénice la dragonne (aucun modèle CC0 : la capuche reteinte)
    };
    // l'équipe du Manoir, poste par poste (src/hantee.js : Hubert, Ramsès, Osvaldo, Vladimir, Berthe, Jack, Gaston, Bérénice)
    const EQUIPE3 = ['hubert', 'momie', 'squelette', 'vampire', 'sorciere', 'citrouille', 'loup', 'dragonne'];
    const PROTOS = new Map(); let CLIPS = null;
    function proto(sorte) {
      let p = PROTOS.get(sorte); if (p) return p; const d = DEFS[sorte] || DEFS.squelette, h3 = H3();
      if (d.fantome) { // un drap Asset Quest (sans os) : cuit, ramené à 1,3 unité de haut ; il flotte par le code
        const geo = geoCentree(d.fantome, d.recette, d.lueur, 1.3), tpl = new T.Group(), m = new T.Mesh(geo, mat('')); geo.userData.cache = true; m.castShadow = true; tpl.add(m); p = { tpl, fantome: true, haut: 1.3 };
      } else {
        const src = h3.persos[d.src]; src.updateMatrixWorld(true); let S0 = null; src.traverse((o) => { if (!S0 && o.isSkinnedMesh) S0 = o; });
        const bones = S0.skeleton.bones, idx = new Map(bones.map((b, i) => [b.name, i])), iB = S0.bindMatrix.clone().invert(), parts = [], BI0 = S0.skeleton.boneInverses.map((m) => m.clone().invert());
        src.traverse((o) => {
          if (!o.isMesh || (d.masquer && d.masquer.test(o.name))) return;
          if (o.isSkinnedMesh) { // v' = B0⁻¹ · BI0ⱼ⁻¹ · BIⱼ · B · v : de sa peau à celle de la référence, os par os (la pose ne compte pas)
            const remap = o.skeleton.bones.map((b) => (idx.has(b.name) ? idx.get(b.name) : 0));
            parts.push({ mesh: o, M: iB.clone().multiply(o.bindMatrix), remap, Mj: o.skeleton.boneInverses.map((bi, j) => iB.clone().multiply(BI0[remap[j]]).multiply(bi).multiply(o.bindMatrix)) });
          }
          else { // le chapeau, la cape : portés par leur os (v' = B0⁻¹ · BI0ⱼ⁻¹ · Osⱼ⁻¹ · Monde · v : ils suivent l'os comme un enfant)
            let a = o.parent; while (a && !(a.isBone && idx.has(a.name))) a = a.parent; const j = a ? idx.get(a.name) : 0;
            parts.push({ mesh: o, M: iB.clone().multiply(BI0[j]).multiply(bones[j].matrixWorld.clone().invert()).multiply(o.matrixWorld), os: j });
          }
        });
        if (d.tete) { // la tête-citrouille : la citrouille-lanterne accrochée à l'os de la tête (0,78, un peu relevée), son visage qui luit
          const ih = idx.get('head'), os = bones[ih], ci = h3.decor.pumpkin_orange_jackolantern; ci.updateMatrixWorld(true);
          const L = new T.Matrix4().compose(new T.Vector3(0, 0.02, 0), new T.Quaternion(), new T.Vector3(0.78, 0.78, 0.78));
          ci.traverse((o) => { if (o.isMesh) parts.push({ mesh: o, M: iB.clone().multiply(BI0[ih]).multiply(L).multiply(o.matrixWorld), os: ih, lueur: feu }); }); void os;
        }
        const c = cuire(parts, { skin: true, recette: RECETTES[d.recette], image: d.image ? h3.images[d.image] : null }), geo = geometrie(c); geo.userData.cache = true; // (partagée par les clones : jamais libérée)
        const tpl = FOURNIL_HD.SkeletonUtils.clone(src); let S1 = null; const jeter = [];
        tpl.traverse((o) => { if (o.isMesh) { if (!S1 && o.isSkinnedMesh) S1 = o; else jeter.push(o); } });
        for (const o of jeter) o.parent.remove(o);
        S1.geometry = geo; S1.material = mat(d.bandes ? 'bandes' : ''); S1.castShadow = true; S1.receiveShadow = false; S1.frustumCulled = false;
        p = { tpl, fantome: false, haut: geo.boundingBox.max.y, marche: d.marche || 'Walking_A' };
      }
      PROTOS.set(sorte, p); return p;
    }
    function clips() { if (!CLIPS) { CLIPS = {}; for (const c of H3().clips) CLIPS[c.name] = c; } return CLIPS; }
    // un acteur : { g, sorte, fantome, haut (unités), marche (son clip de marche), mixer, actions, joue }
    function acteur(sorte) {
      try {
        const p = proto(sorte), g = p.fantome ? p.tpl.clone() : FOURNIL_HD.SkeletonUtils.clone(p.tpl);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        const a = { g, sorte, fantome: p.fantome, haut: p.haut, marche: p.marche, mixer: p.fantome ? null : new T.AnimationMixer(g), actions: {}, joue: '', graine: Math.random() * 10 };
        g.userData.hd3 = a; return a;
      } catch (e) { rater(e); return null; }
    }
    function jouer(a, nom, fondu, une) {
      if (!a.mixer || a.joue === nom) return; const clip = clips()[nom]; if (!clip) return;
      const ac = a.actions[nom] || (a.actions[nom] = a.mixer.clipAction(clip)); ac.reset(); ac.setLoop(une ? T.LoopOnce : T.LoopRepeat, Infinity); ac.clampWhenFinished = !!une; ac.play();
      const av = a.joue && a.actions[a.joue]; if (av) av.crossFadeTo(ac, fondu == null ? 0.25 : fondu, false); else ac.time = (a.graine % 1) * clip.duration; // le premier clip : pas tous au même temps
      a.joue = nom;
    }
    function liberer(a) { // le mélangeur et la texture des os du squelette (WebGL2 : une par squelette) ; la géométrie et le matériau restent au prototype
      if (!a) return; if (a.mixer) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); } a.g.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); });
    }

    // ═══ le décor : posé sur le plan de la boutique (c.LAY, c.wz, c.wy), cuit et fusionné en un maillage (un appel de dessin, ombres comprises) ═══
    let _e, _q, _p, _s; // (créés au premier décor : Three.js peut manquer)
    function matriceDe(o, U) { if (!_e) { _e = new T.Euler(); _q = new T.Quaternion(); _p = new T.Vector3(); _s = new T.Vector3(); } _p.set(o.x || 0, o.y || 0, o.z || 0); _e.set(o.rx || 0, o.ry || 0, o.rz || 0); _q.setFromEuler(_e); const s = (o.s == null ? 1 : o.s) * U; _s.set(o.sx == null ? s : o.sx * U, o.sy == null ? s : o.sy * U, o.sz == null ? s : o.sz * U); return new T.Matrix4().compose(_p, _q, _s); }
    function fusionner(parts) { // les pièces posées ({ c : cuite, M }) → un seul tableau cuit
      let n = 0, ni = 0; for (const p of parts) { n += p.c.n; ni += p.c.I.length; }
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), Lu = new Float32Array(n), I = new Uint32Array(ni), v = new T.Vector3(), m3 = new T.Matrix3();
      let k = 0, ki = 0;
      for (const { c, M } of parts) {
        m3.getNormalMatrix(M); const inv = M.determinant() < 0, base = k;
        for (let i = 0; i < c.n; i++, k++) {
          v.set(c.P[i * 3], c.P[i * 3 + 1], c.P[i * 3 + 2]).applyMatrix4(M); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
          v.set(c.N[i * 3], c.N[i * 3 + 1], c.N[i * 3 + 2]).applyMatrix3(m3).normalize(); N[k * 3] = v.x; N[k * 3 + 1] = v.y; N[k * 3 + 2] = v.z;
          C[k * 3] = c.C[i * 3]; C[k * 3 + 1] = c.C[i * 3 + 1]; C[k * 3 + 2] = c.C[i * 3 + 2]; Lu[k] = c.Lu[i];
        }
        for (let j = 0; j < c.I.length; j += 3) { I[ki++] = base + c.I[j]; I[ki++] = base + c.I[inv ? j + 2 : j + 1]; I[ki++] = base + c.I[inv ? j + 1 : j + 2]; }
      }
      return { P, N, C, Lu, I, n };
    }
    // un quadrilatère au sol, d'une couleur (le trottoir, la rue) : une pièce « cuite » faite à la main
    function quad(x0, z0, x1, z1, hex, y) { const c = new T.Color(hex), yy = y || 0; return { n: 4, P: new Float32Array([x0, yy, z0, x1, yy, z0, x1, yy, z1, x0, yy, z1]), N: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), C: new Float32Array([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b]), Lu: new Float32Array(4), I: [0, 2, 1, 0, 3, 2] }; }

    // ─── le canvas des toiles d'araignée (rayons et spirale, CC0 par construction) et le ciel de nuit derrière les ouvertures du mur ───
    let TEXS = null;
    function textures() {
      if (TEXS) return TEXS; TEXS = {};
      const toile = document.createElement('canvas'); toile.width = toile.height = 256; const x = toile.getContext('2d'); x.strokeStyle = 'rgba(235,230,255,0.85)'; x.lineWidth = 2.2; const R0 = 250, n = 7;
      for (let k = 0; k <= n; k++) { const a = k / n * Math.PI / 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * R0, Math.sin(a) * R0); x.stroke(); }
      x.lineWidth = 1.6; for (let r = 30; r < R0; r += 30) { x.beginPath(); for (let k = 0; k <= n; k++) { const a = k / n * Math.PI / 2, rr = r * (k % 2 ? 0.93 : 1), px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (k) x.quadraticCurveTo(Math.cos(a - 0.11) * rr * 0.9, Math.sin(a - 0.11) * rr * 0.9, px, py); else x.moveTo(px, py); } x.stroke(); }
      TEXS.toile = new T.CanvasTexture(toile); TEXS.toile.colorSpace = T.SRGBColorSpace;
      const ciel = document.createElement('canvas'); ciel.width = 512; ciel.height = 128; const y = ciel.getContext('2d'), gr = y.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#1A1338'); gr.addColorStop(0.65, '#3E2F7A'); gr.addColorStop(1, '#6A4FA8'); y.fillStyle = gr; y.fillRect(0, 0, 512, 128);
      y.fillStyle = '#FFF4C2'; for (let i = 0; i < 40; i++) { y.globalAlpha = 0.4 + (i % 5) * 0.12; y.beginPath(); y.arc((i * 97) % 512, (i * 53) % 70, i % 7 ? 1 : 1.8, 0, Math.PI * 2); y.fill(); }
      y.globalAlpha = 1; for (const mx of [60, 330]) { const g2 = y.createRadialGradient(mx, 34, 4, mx, 34, 40); g2.addColorStop(0, 'rgba(255,244,194,.55)'); g2.addColorStop(1, 'rgba(255,244,194,0)'); y.fillStyle = g2; y.fillRect(mx - 40, 0, 80, 80); y.fillStyle = '#FFF4C2'; y.beginPath(); y.arc(mx, 34, 12, 0, Math.PI * 2); y.fill(); y.fillStyle = '#2A1F55'; y.beginPath(); y.arc(mx + 6, 30, 11, 0, Math.PI * 2); y.fill(); }
      y.fillStyle = '#140E26'; y.beginPath(); y.moveTo(0, 128); for (let xx = 0; xx <= 512; xx += 16) y.lineTo(xx, 104 - 10 * Math.sin(xx * 0.02) - 6 * Math.sin(xx * 0.07)); y.lineTo(512, 128); y.fill(); // les collines
      for (let i = 0; i < 14; i++) { const gx = 12 + i * 37 + (i % 3) * 5, gh = 8 + (i % 4) * 3; y.fillRect(gx, 108 - gh, 6, gh); y.beginPath(); y.arc(gx + 3, 108 - gh, 3, Math.PI, 0); y.fill(); } // les tombes
      TEXS.ciel = new T.CanvasTexture(ciel); TEXS.ciel.colorSpace = T.SRGBColorSpace;
      const im = H3() && H3().images; if (im && im['hantee3/ardoises.jpg']) { // l'auvent : les ardoises en écailles (ambientCG), et leur normale
        TEXS.ardoises = new T.Texture(im['hantee3/ardoises.jpg']); TEXS.ardoises.colorSpace = T.SRGBColorSpace; TEXS.ardoises.wrapS = TEXS.ardoises.wrapT = T.RepeatWrapping; TEXS.ardoises.needsUpdate = true;
        if (im['hantee3/ardoises-normale.jpg']) { TEXS.normale = new T.Texture(im['hantee3/ardoises-normale.jpg']); TEXS.normale.wrapS = TEXS.normale.wrapT = T.RepeatWrapping; TEXS.normale.needsUpdate = true; }
      }
      for (const t of Object.values(TEXS)) t.userData.partagee = true;
      return TEXS;
    }
    // ─── les halos et la brume : des quadrilatères additifs dans UN maillage ; un halo regarde la caméra (plongée de 52°) et vacille ───
    let HALO_MAT = null;
    function haloMat() {
      if (HALO_MAT) return HALO_MAT;
      HALO_MAT = new T.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 1 } },
        vertexShader: `attribute vec3 centre; attribute vec3 decal; attribute vec3 teinte; attribute vec2 vac; uniform float uT; varying vec2 vUv; varying vec3 vC; varying float vA;
          void main() { vUv = uv; vC = teinte; float f = 1.0 + vac.x * (0.55 * sin(uT * 9.0 + vac.y) + 0.45 * sin(uT * 23.0 + vac.y * 1.7)); vA = mix(1.0, f, 0.6);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(centre + decal * f, 1.0); }`,
        fragmentShader: 'uniform float uK; varying vec2 vUv; varying vec3 vC; varying float vA; void main() { float d = length(vUv * 2.0 - 1.0); float a = pow(max(0.0, 1.0 - d), 2.0); gl_FragColor = vec4(vC * a * vA * uK, 1.0); }',
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      });
      if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(HALO_MAT); return HALO_MAT;
    }
    function halos(liste, SY, CY) { // liste : [{ x, y, z, r, col, a (force), vac (vacillement), plat (la brume : à plat sur le sol) }]
      const n = liste.length, C = new Float32Array(n * 12), D = new Float32Array(n * 12), Te = new Float32Array(n * 12), V = new Float32Array(n * 8), UV = new Float32Array(n * 8), I = [], col = new T.Color();
      liste.forEach((h, i) => {
        col.set(h.col).multiplyScalar(h.a == null ? 1 : h.a); const uy = h.plat ? [0, 0, 1] : [0, CY, -SY], ry = h.plat ? h.r * 0.6 : h.r;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], j) => {
          const o = (i * 4 + j) * 3, q = (i * 4 + j) * 2; C[o] = h.x; C[o + 1] = h.y; C[o + 2] = h.z;
          D[o] = a * h.r; D[o + 1] = b * ry * uy[1]; D[o + 2] = b * ry * uy[2];
          Te[o] = col.r; Te[o + 1] = col.g; Te[o + 2] = col.b; V[q] = h.vac == null ? 0.08 : h.vac; V[q + 1] = i * 2.39; UV[q] = (a + 1) / 2; UV[q + 1] = (b + 1) / 2;
        });
        I.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(C.slice(), 3)); g.setAttribute('centre', new T.BufferAttribute(C, 3)); g.setAttribute('decal', new T.BufferAttribute(D, 3)); g.setAttribute('teinte', new T.BufferAttribute(Te, 3)); g.setAttribute('vac', new T.BufferAttribute(V, 2)); g.setAttribute('uv', new T.BufferAttribute(UV, 2)); g.setIndex(I);
      const m = new T.Mesh(g, haloMat()); m.frustumCulled = false; m.renderOrder = 5; m.castShadow = false; m.receiveShadow = false; m.userData.nom = 'halos'; return m;
    }

    // ─── le décor entier ; c : le contexte de la scène (LAY, K, W, H, wz, wy, wd, SY, CY, crans) ───
    // rend { g (le groupe : décor fusionné, halos et brume, toiles, ciel, auvent), dessusY, dessusZ (le dessus du comptoir : le chat), U,
    //        lumieres : [{ x, y, z, col, k, d }] (huit au plus, posées par la scène), postes : la place de chaque monstre de l'équipe }
    function decor(c) {
      const { LAY, K, W, H } = c, U = 29 * K, Hm = c.wy(LAY.murH), parts = [], hs = [], lum = [], HP = Math.PI / 2;
      const pose = (nom, o) => { const ck = cuitModele(nom, o.t, o.lueur); if (ck) parts.push({ c: ck, M: matriceDe(o, U) }); return ck; };
      const halo = (x, y, z, col, r, a, vac) => hs.push({ x, y, z, col, r: r * K, a, vac });
      const lumiere = (x, y, z, col, k, d) => lum.push({ x, y, z, col, k, d: d || 150 * K });
      const zDev = c.wz(LAY.devanture.y), zBord = c.wz(LAY.trottoir.bord), zFin = c.wd(H + 60 - LAY.murH), porte = LAY.devanture.porte, cr = c.crans;
      // ── le mur du fond : quatre pans de 4 unités ramenés à la largeur (fenêtre, mur, passe-plat, mur et porte), des pilastres aux raccords
      const sy = Hm / (4 * U), pw = W / 4, sx = pw / (4 * U), p = LAY.porte;
      pose('wall_window_open', { x: pw * 0.5, z: -0.26 * U, sx, sy, t: 'hanter' });
      pose('wall', { x: pw * 1.5, z: -0.26 * U, sx, sy, t: 'hanter' });
      pose('wall_orderwindow', { x: pw * 2.5, z: -0.46 * U, sx, sy, t: 'hanter' });
      const xg = pw * 3, sd = p.w / (1.6 * U), hPorte = 2.8 * sd * U; // la porte du fond : un pan de mur, la porte, un linteau, le bout de mur
      pose('wall', { x: (xg + p.x) / 2, z: -0.26 * U, sx: (p.x - xg) / (4 * U), sy, t: 'hanter' });
      pose('door_A', { x: p.x, z: -0.12 * U, s: sd, t: 'hanter' });
      pose('wall', { x: p.x + p.w / 2, y: hPorte, z: -0.26 * U, sx: p.w / (4 * U), sy: (Hm - hPorte) / (4 * U), t: 'hanter' });
      pose('wall', { x: (p.x + p.w + W) / 2 + 1, z: -0.26 * U, sx: (W - p.x - p.w + 2) / (4 * U), sy, t: 'hanter' });
      for (const x of [pw, pw * 2, pw * 3]) pose('pillar_A', { x, z: 0.1 * U, sx: 0.75, sz: 0.75, sy: Hm / (4.1 * U), t: 'hanter' });
      // ── les sols : le damier (le fournil, le comptoir, la file), le vieux parquet sombre (la salle), le trottoir et la rue
      const zBande = Math.min(zDev - 20, c.wz(LAY.file[0].y + 14 * K)), tuiles = (nom, x0, x1, z0, z1, y0, cote, o) => { // des dalles de « cote » unités, ramenées pour remplir juste
        const nx = Math.max(1, Math.round((x1 - x0) / (cote * U))), nz = Math.max(1, Math.round((z1 - z0) / (cote * U))), tx = (x1 - x0) / nx, tz = (z1 - z0) / nz;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) pose(nom, Object.assign({ x: x0 + (i + 0.5) * tx, y: y0, z: z0 + (j + 0.5) * tz, sx: tx / (4 * U), sz: tz / (4 * U) }, o));
      };
      tuiles('floor_kitchen', 0, W, 0, zBande, -0.1 * U, 1.6, { sy: 0.2, t: 'hanter' }); // le damier en petits carreaux
      tuiles('floor_wood_large_dark', 0, W, zBande, zDev + 4, -0.05 * U, 2.6, { sy: 1 });
      parts.push({ c: quad(-40, zDev + 4, W + 40, zBord, '#463B63', 0), M: new T.Matrix4() }, { c: quad(-40, zBord, W + 40, zFin, '#211A33', -0.2), M: new T.Matrix4() });
      for (let z = zDev + 0.6 * U, r = 0; z < zBord - 0.3 * U; z += 1.15 * 0.6 * U, r++) for (let x = -8 + (r % 2) * 0.55 * 0.6 * U; x < W + 10; x += 1.9 * 0.6 * U) pose('path_B', { x, y: 0.05, z, s: 0.6, ry: (x * 7 + r * 3) % 6.3 }); // le trottoir : des dalles de cimetière
      // ── le fournil : le four (son feu luit), le couvercle de cercueil debout contre le mur (la place du froid), le chaudron de Berthe
      const f = LAY.four, sf = f.w / (2 * U);
      pose('oven', { x: f.x + f.w / 2, z: 1.03 * sf * U + 2, s: sf, t: 'hanter', lueur: feu });
      halo(f.x + f.w / 2, 0.55 * sf * U, 1.4 * sf * U, '#FF7A2A', 26, 0.5, 0.12);
      const fr = LAY.froid; pose('candle_triple', { x: fr.x + fr.w / 2, z: c.wz(fr.y + fr.h * 0.35), s: 0.7, lueur: feu }); halo(fr.x + fr.w / 2 + 2 * K, 0.8 * 0.7 * U, c.wz(fr.y + fr.h * 0.35), '#FFB060', 13, 0.8); // la place du froid : un chandelier et des citrouilles
      pose('pumpkin_orange', { x: fr.x + fr.w / 2 + 3 * K, z: c.wz(fr.y + fr.h * 0.75), s: 0.5, ry: 0.4 });
      pose('candle_melted', { x: fr.x + fr.w * 0.5 + 6 * K, z: c.wz(fr.y + fr.h) + 8 * K, s: 0.7, lueur: feu }); halo(fr.x + fr.w * 0.5 + 6 * K, 0.63 * 0.7 * U + 3, c.wz(fr.y + fr.h) + 8 * K, '#FFB060', 9, 0.8);
      const pl = LAY.plan, xc = pl.x + pl.w * 0.5, zc = c.wz(pl.y + pl.h * 0.5);
      pose('cauldron', { x: xc, z: zc, s: 1.0 }); halo(xc, 1.1 * U, zc, '#5DFF6A', 22, 0.6, 0.1); lumiere(xc, 1.6 * U, zc + 6, '#5DFF6A', 70, 120 * K);
      // ── le mur : le portrait hanté, la torche, deux bannières violettes, l'étagère d'Hubert, l'étagère à bougies, les lanternes de la porte
      pose('pictureframe_large_A', { x: pw * 1.62, y: Hm * 0.5, z: 0.2, s: 0.75, t: 'hanter' });
      pose('torch_mounted', { x: pw * 1.18, y: Hm * 0.55, z: 0.5, s: 0.8, lueur: feu }); halo(pw * 1.18, Hm * 0.55 + 0.6 * 0.8 * U, 0.45 * U, '#FF9A3C', 20, 0.9); lumiere(pw * 1.18, Hm * 0.62, 0.9 * U, '#FF9A3C', 60, 140 * K);
      for (const x of [pw * 2.1, pw * 2.9]) pose('banner_thin_red', { x, z: -0.3 * 0.6 * U, sx: 0.6, sy: Hm * 0.75 / (3.73 * U), sz: 0.6, t: 'banniere' });
      const et = LAY.etagere; pose('shelf_B_large_decorated', { x: et.x + et.w / 2, y: Hm * 0.62, z: 0.2, s: 0.55, t: 'hanter' });
      pose('shelf_small_candles', { x: pw * 0.82, y: Hm * 0.78, z: 0.2, s: 0.6, lueur: feu }); halo(pw * 0.82, Hm * 0.78 + 0.55 * 0.6 * U, 0.3 * U, '#FFB060', 14, 0.7);
      for (const x of [p.x - 9 * K, Math.min(W - 6 * K, p.x + p.w + 9 * K)]) { const z = c.wz(LAY.murH + 8 * K); pose('lantern_standing', { x, z, s: 0.75, lueur: feu }); halo(x, 0.45 * 0.75 * U, z, '#FFB060', 13, 0.8); }
      for (const [u, dy, nom, s] of [[0.31, 10, 'pumpkin_orange', 0.5], [0.345, 18, 'pumpkin_yellow_small', 0.7], [0.29, 21, 'pumpkin_orange_small', 0.6]]) pose(nom, { x: W * u, z: c.wz(LAY.murH + dy * K), s, ry: u * 9 });
      pose('skull', { x: W * 0.02 + 8 * K, z: c.wz(LAY.plan.y - 8 * K), s: 0.32, ry: 0.6 });
      // ── le comptoir : deux éléments retournés (les tiroirs côté patronne), la vitrine-cercueil et ses friandises, le crâne-bougeoir, le seau à bonbons, le balai
      const C = LAY.comptoir, zAv = c.wz(C.y + C.hTop + C.hFace), csx = C.w / (4 * U), csz = 0.55, csy = 1.05, zC = zAv - csz * U, dessusY = csy * U;
      pose('kitchencounter_straight_A', { x: C.x + C.w * 0.25, z: zC, ry: Math.PI, sx: csx, sy: csy, sz: csz, t: 'hanter' });
      pose('kitchencounter_straight_B', { x: C.x + C.w * 0.75, z: zC, ry: Math.PI, sx: csx, sy: csy, sz: csz, t: 'hanter' });
      const vx = C.x + C.w * 0.7, sv = 0.5; pose('coffinA_bottom', { x: vx, y: dessusY + 0.29 * sv * U, z: zC, ry: HP, s: sv });
      const yv = dessusY + 0.08 * U, nv = Math.min(7, 3 + 2 * (cr.vitrine || 0));
      [['candyCorn', -0.62, -0.18, 0.24, 0], ['lollipopA', -0.3, 0.16, 0.24, HP], ['apple', 0, -0.15, 1.0, 0], ['candyA', 0.3, 0.15, 0.28, 0.5], ['cookie', 0.55, -0.12, 1.1, 0], ['bottle_A_green', -0.05, 0.2, 0.32, 0], ['pumpkin_orange_small', 0.62, 0.18, 0.32, 0]].slice(0, nv)
        .forEach(([nom, dx, dz, s, r]) => pose(nom, { x: vx + dx * sv * 1.5 * U, y: yv + (nom === 'lollipopA' ? 0.08 * U : nom === 'candyCorn' ? 0.1 * U : nom === 'candyA' ? 0.05 * U : 0), z: zC + dz * sv * 2 * U, s, ry: r, rz: nom === 'lollipopA' ? HP : 0 }));
      pose('skull_candle', { x: C.x + 9 * K, y: dessusY, z: zC - 2, s: 0.42, ry: 0.35, lueur: feu }); halo(C.x + 9 * K, dessusY + 1.2 * 0.42 * U, zC - 2, '#FFA040', 16, 0.9); lumiere(C.x + 9 * K, dessusY + 30 * K, zC + 8, '#FFA040', 75, 150 * K);
      const ca = LAY.caisse; pose('candyBucket', { x: ca.x - 4 * K, y: dessusY + 0.43 * 0.42 * U, z: zC, s: 0.42 });
      pose('Broom', { x: C.x + C.w + 5 * K, z: zAv - 6 * K, s: 2.6, rz: -0.32, ry: 0.4 });
      pose('pumpkin_orange_jackolantern', { x: C.x - 10 * K, z: zAv - 4 * K, s: 0.4, ry: 0.3, lueur: feu }); halo(C.x - 10 * K, 0.6 * 0.4 * U, zAv - 4 * K + 6, '#FF8A2A', 18, 0.8); lumiere(C.x - 10 * K, 26 * K, zAv + 10 * K, '#FF8A2A', 55, 120 * K);
      // ── les tables : la table ronde hantée, deux chaises, une bougie allumée et une petite citrouille au milieu
      const st = 0.8, vt = [];
      for (let i = 0; i < Math.min(cr.tables || 0, LAY.tables.length); i++) {
        const tb = LAY.tables[i], z = c.wz(tb.y); vt.push(tb);
        pose('table_round_A_small', { x: tb.x, z, s: st, t: 'hanter' }); pose('candle_lit', { x: tb.x + 3 * K, y: st * U, z: z - 2 * K, s: 0.36, lueur: feu }); pose('pumpkin_orange_small', { x: tb.x - 6 * K, y: st * U, z: z + 3 * K, s: 0.42, ry: i });
        halo(tb.x + 3 * K, st * U + 1.05 * 0.36 * U, z - 2 * K, '#FFB060', 14, 0.9);
        for (const s of tb.sieges) pose('chair_A', { x: s.x, z: c.wz(s.y), ry: s.dir > 0 ? HP : -HP, t: 'hanter' });
      }
      if (vt.length) { const mx = vt.reduce((a, t) => a + t.x, 0) / vt.length, mz = vt.reduce((a, t) => a + c.wz(t.y), 0) / vt.length; lumiere(mx, 55 * K, mz, '#FFB060', 90, 190 * K); }
      // ── le bar : les éléments de cuisine contre la devanture, les tabourets, les fioles et une bougie fine
      if ((cr.bar || 0) > 0) {
        const b = LAY.bar, w = b.x1 - b.x0, nb = Math.max(1, Math.round(w / (2 * U))), zb = c.wz(b.y - 2 * K) + 4 * K, n = Math.min(4, cr.bar + 1);
        for (let i = 0; i < nb; i++) pose(i % 2 ? 'kitchencounter_straight_A' : 'kitchencounter_straight_B', { x: b.x0 + (i + 0.5) * w / nb, z: zb, sx: w / nb / (2 * U), sz: 0.42, sy: 0.92, t: 'hanter' });
        for (const s of LAY.sieges) if (s.zone === 'bar' && s.rang < n) pose('chair_stool', { x: s.x, z: c.wz(s.y), t: 'hanter' });
        for (const [nom, u] of [['bottle_A_green', 0.08], ['bottle_B_green', 0.16], ['bottle_C_brown', 0.82]]) pose(nom, { x: b.x0 + w * u, y: 0.92 * U, z: zb, s: 0.5 });
        pose('candle_thin_lit', { x: b.x0 + w * 0.92, y: 0.92 * U, z: zb, s: 0.6, lueur: feu }); halo(b.x0 + w * 0.92, 0.92 * U + 0.6 * U, zb, '#FFB060', 12, 0.9);
      }
      // ── le coin salon : la banquette, le tapis ovale et le cercueil en table basse (sa bougie), la lampe violette, le fauteuil
      if ((cr.banquette || 0) > 0) {
        const bq = LAY.banquette; pose('couch_pillows', { x: bq.x, z: c.wz(bq.y) - 3 * K, s: 54 * K / (3 * U), t: 'hanter' });
        if (cr.banquette >= 2) {
          const t = bq.tapis, tt = bq.table; pose('rug_oval_A', { x: t.x, y: 0.2, z: c.wz(t.y), sx: t.w / (3 * U), sz: c.wd(t.h) / (2 * U), sy: 0.6, t: 'hanter' });
          pose('coffin', { x: tt.x, z: c.wz(tt.y), ry: HP, s: 0.3 }); pose('candle_lit', { x: tt.x, y: 1.32 * 0.3 * U, z: c.wz(tt.y), s: 0.32, lueur: feu }); halo(tt.x, 1.32 * 0.3 * U + 0.35 * U, c.wz(tt.y), '#FFB060', 12, 0.9);
        }
        if (cr.banquette >= 3) {
          const l = bq.lampe, zl = c.wz(l.y); pose('lamp_standing', { x: l.x, z: zl, s: 0.75, t: 'hanter' }); halo(l.x, 2.3 * 0.75 * U, zl, '#C48BFF', 22, 0.8, 0.02); lumiere(l.x, 2.2 * 0.75 * U, zl + 4, '#C48BFF', 60, 140 * K);
          const fa = LAY.sieges.find((s) => s.id === 'fauteuil'); if (fa) pose('armchair', { x: fa.x, z: c.wz(fa.y), ry: HP, s: 0.62, t: 'hanter' });
        }
      }
      // ── la terrasse : ses tables comme dans la salle ; la devanture-cimetière : grille basse, piliers, l'arche à la porte et son auvent d'ardoises
      for (let i = 0; i < Math.min(cr.terrasse || 0, LAY.terrasse.length); i++) {
        const tb = LAY.terrasse[i], z = c.wz(tb.y); pose('table_round_A_small', { x: tb.x, z, s: st, t: 'hanter' }); pose('candle_lit', { x: tb.x, y: st * U, z, s: 0.36, lueur: feu }); halo(tb.x, st * U + 0.38 * U, z, '#FFB060', 14, 0.9);
        for (const s of tb.sieges) pose('chair_A', { x: s.x, z: c.wz(s.y), ry: s.dir > 0 ? HP : -HP, t: 'hanter' });
      }
      const sg = 0.3, lg = 4 * sg * U, grille = (x0, x1) => { const n = Math.max(1, Math.round((x1 - x0) / lg)), w = (x1 - x0) / n; for (let i = 0; i < n; i++) pose(i % 3 === 2 ? 'fence_broken' : 'fence', { x: x0 + (i + 0.5) * w, z: zDev, sx: w / (4 * U), sy: sg, sz: sg }); for (let i = 0; i <= n; i++) pose('fence_pillar', { x: x0 + i * w, z: zDev, s: sg * 1.1 }); };
      grille(-4, porte.x0 - 6); grille(porte.x1 + 6, W + 4);
      const sa = (porte.x1 - porte.x0 + 14) / (4.22 * U), xa = (porte.x0 + porte.x1) / 2; pose('arch_gate', { x: xa, z: zDev, s: sa });
      // ── la rue : les arbres morts, le sapin orange, le réverbère, les tombes, le banc, les citrouilles-lanternes, le chemin de pierres, la brume
      const zr = c.wz(LAY.trottoir.bord + 14 * K), zr2 = c.wz(LAY.trottoir.bord + 34 * K);
      for (let x = -10; x < W + 20; x += 1.9 * 0.6 * U) pose('path_B', { x, y: 0.05, z: zr2, s: 0.6, ry: x * 0.3 });
      pose('tree_dead_large_decorated', { x: W * 0.93, z: zr, s: 0.5 }); pose('tree_pine_orange_medium', { x: W * 0.05, z: zr + 4 * K, s: 0.42 }); pose('tree_dead_medium', { x: W * 0.62, z: zr2 + 18 * K, s: 0.45, ry: 2 });
      pose('post_lantern', { x: W * 0.52, z: zr, s: 0.5, ry: -HP, lueur: feu }); halo(W * 0.52 + 0.7 * 0.5 * U, 3.0 * 0.5 * U, zr, '#FFB060', 22, 0.9); lumiere(W * 0.52, 3.2 * 0.5 * U, zr + 10, '#FFB060', 90, 170 * K);
      for (const [nom, u, s, r] of [['grave_A', 0.24, 0.42, 0.1], ['gravestone', 0.38, 0.45, -0.2], ['gravemarker_B', 0.72, 0.5, 0.3], ['gravestone', 0.84, 0.38, 0.15]]) pose(nom, { x: W * u, z: zr - 2 * K, s, ry: r });
      pose('bench_decorated', { x: W * 0.14, z: zr2 + 2 * K, s: 0.42 });
      for (const [nom, u, dz] of [['pumpkin_orange_jackolantern', 0.31, 6], ['pumpkin_yellow_jackolantern', 0.79, 8]]) { pose(nom, { x: W * u, z: zr + dz * K, s: 0.42, ry: -0.3, lueur: feu }); halo(W * u, 0.3 * U, zr + dz * K + 6, '#FF8A2A', 16, 0.8); }
      lumiere(W * 0.79, 22 * K, zr + 16 * K, '#FF8A2A', 55, 120 * K);
      for (const [u, dz, r] of [[0.1, 0, 60], [0.42, 10, 70], [0.72, 2, 64], [0.95, 14, 50], [0.25, 30, 80], [0.6, 34, 90]]) hs.push({ x: W * u, y: 3, z: zr + dz * K, r: r * K, col: '#B8A8F0', a: 0.18, vac: 0.03, plat: true }); // la brume, à plat
      for (const [u, ys, r] of [[0.9, LAY.murH + 20 * K, 46], [0.12, LAY.T * 0.62, 44], [0.5, LAY.rangees[0] + 6 * K, 70], [0.82, LAY.rangees[1], 56]]) hs.push({ x: W * u, y: 2, z: c.wz(ys), r: r * K, col: '#9C8CE0', a: 0.08, vac: 0.03, plat: true }); // et un voile au ras du sol de la salle
      const geo = geometrie(fusionner(parts)), m = new T.Mesh(geo, mat('')); m.castShadow = true; m.receiveShadow = true; m.userData.nom = 'decor';
      const g = new T.Group(); g.userData.nom = 'hantee3'; g.add(m);
      if (hs.length) g.add(halos(hs, c.SY, c.CY));
      // les toiles d'araignée : dans les coins hauts du mur (un maillage ; le moyeu de la toile au coin)
      const tx = textures(), qs = [];
      for (const [x, y, s, rz] of [[0, Hm, 30 * K, 0], [W, Hm, 28 * K, -HP], [pw * 2 - 0.25 * U, Hm, 22 * K, -HP], [pw * 2 + 0.25 * U, Hm, 20 * K, 0]]) { const q = new T.PlaneGeometry(s, s); q.translate(s / 2, -s / 2, 0); q.rotateZ(rz); q.translate(x, y, 2.5); qs.push(q); }
      const gt = new T.BufferGeometry(), P3 = [], U2 = [], I = []; let n0 = 0; for (const q of qs) { P3.push(...q.attributes.position.array); U2.push(...q.attributes.uv.array); for (const i of q.index.array) I.push(i + n0); n0 += q.attributes.position.count; q.dispose(); }
      gt.setAttribute('position', new T.Float32BufferAttribute(P3, 3)); gt.setAttribute('uv', new T.Float32BufferAttribute(U2, 2)); gt.setIndex(I);
      const toiles = new T.Mesh(gt, new T.MeshBasicMaterial({ map: tx.toile, transparent: true, depthWrite: false, side: T.DoubleSide, opacity: 0.7, fog: false })); toiles.renderOrder = 4; g.add(toiles);
      // le ciel de nuit derrière les ouvertures du mur
      const ciel = new T.Mesh(new T.PlaneGeometry(W + 80, Hm + 30), new T.MeshBasicMaterial({ map: tx.ciel, fog: false })); ciel.position.set(W / 2, (Hm + 30) / 2 - 10, -40); g.add(ciel);
      // l'auvent d'ardoises au-dessus de l'arche (un porche de cimetière) : un petit toit à deux pans, le faîtage parallèle à la rue
      if (tx.ardoises) {
        const aw = (porte.x1 - porte.x0) + 26 * K, ad = 11 * K, rh = 9 * K, ha = 4.41 * sa * U - 2, z0 = zDev, x0 = xa - aw / 2, x1 = xa + aw / 2;
        const P3 = [x0, ha + rh, z0, x1, ha + rh, z0, x1, ha, z0 + ad, x0, ha, z0 + ad, x0, ha + rh, z0, x1, ha + rh, z0, x1, ha, z0 - ad, x0, ha, z0 - ad], ru = aw / 34, rv = 0.5;
        const geoA = new T.BufferGeometry(); geoA.setAttribute('position', new T.Float32BufferAttribute(P3, 3)); geoA.setAttribute('uv', new T.Float32BufferAttribute([0, rv, ru, rv, ru, 0, 0, 0, 0, rv, ru, rv, ru, 0, 0, 0], 2)); geoA.setIndex([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7]); geoA.computeVertexNormals();
        const auvent = new T.Mesh(geoA, new T.MeshStandardMaterial({ map: tx.ardoises, normalMap: tx.normale || null, color: '#E6DAFF', emissive: '#3A2E66', emissiveIntensity: 0.6, roughness: 0.7, metalness: 0, side: T.DoubleSide }));
        auvent.castShadow = true; auvent.receiveShadow = true; g.add(auvent);
      }
      // les places de l'équipe (x, z monde, cap ; vol : la hauteur d'un fantôme) : à leur poste, comme sur la planche
      const b = LAY.bar;
      const postes = [
        { x: et.x + et.w / 2, z: c.wz(LAY.murH + 12 * K), ry: 0.3, vol: Hm * 0.32 }, // Hubert : il flotte devant l'étagère du grenier
        { x: C.x + C.w * 0.78, z: c.wz(LAY.boulanger.y) - 2 * K, ry: 0 }, // Ramsès : derrière la vitrine-cercueil
        { x: f.x + f.w * 0.5, z: 2.35 * sf * U + 16 * K, ry: Math.PI * 0.82 }, // Osvaldo : au four
        { x: Math.min(W - 12 * K, b.x1 + 16 * K), z: c.wz(b.y) + 2 * K, ry: -HP }, // Vladimir : au bout du bar
        { x: xc + 26 * K, z: zc + 4 * K, ry: -HP - 0.3 }, // Berthe : au chaudron
        { x: W * 0.06, z: zDev + 16 * K, ry: 0.6 }, // Jack : le potager de la terrasse
        { x: f.x + f.w + 12 * K, z: c.wz(LAY.lanes[0]) - 4 * K, ry: -HP - 0.5 }, // Gaston : il remue la pâte, à droite du four
        { x: f.x - 2 * K, z: 2.5 * sf * U + 10 * K, ry: 0.4 }, // Bérénice : elle couve ses œufs près du feu
      ];
      return { g, dessusY, dessusZ: zC, lumieres: lum.slice(0, 8), postes, U };
    }

    // ─── les apparitions (qualité haute) : le fantôme, la citrouille-lanterne (cuits, qui luisent) ; la chauve-souris est la même partout ───
    function apparition(type, U) {
      try {
        const geo = type === 'fantome' ? geoCentree('Ghost_1', null, 0.6, 1.4 * U) : type === 'citrouille' ? geoCentree('pumpkin_orange_jackolantern', null, feuVif, 0.7 * U) : null;
        if (geo) { const g = new T.Group(), m = new T.Mesh(geo, mat('')); m.castShadow = true; g.add(m); return g; }
      } catch (e) { rater(e); }
      return null;
    }
    // préparer en avance (après le préchargement) : les prototypes des neuf sortes, de l'équipe et de la patronne, les clips
    function preparer() { if (echec || !(typeof HDM !== 'undefined' && HDM.pret('hantee3'))) return false; try { for (const s of SORTES.concat(EQUIPE3, ['patronne'])) proto(s); clips(); return true; } catch (e) { rater(e); return false; } }
    return { pret, decor, acteur, jouer, liberer, apparition, preparer, rater, mat, haloMat, EQUIPE3, DEFS, get echec() { return echec; } };
  })();

  // ─── l'écran : la fenêtre sur la scène ───
  let style = null;
  function feuille() {
    if (style || typeof document === 'undefined') return; style = document.createElement('style'); style.id = 'ht-boutique-style';
    style.textContent = `body.ht-boutique #tiroir, body.ht-boutique #scene-wrap > :not(canvas), body.ht-boutique #indice, body.ht-boutique #haut, body.ht-boutique #onglets, body.ht-boutique #corps > :not(#scene-wrap) { visibility: hidden; }
html:has(body.ht-boutique), body.ht-boutique { overflow: hidden; overscroll-behavior: none; }
#hantee.ht-boutique { background: transparent; }
#hantee.ht-boutique > .at-haut { background: var(--ht-fond); }
#hantee.ht-boutique > .pq-solde { background: var(--ht-fond); margin: 0; padding-bottom: 10px; border-radius: 0 0 20px 20px; box-shadow: 0 6px 14px rgba(21, 17, 31, .45); position: relative; z-index: 2; transition: border-radius .2s ease-out; }
#hantee.ht-boutique[data-tiroir="haut"] > .pq-solde { border-radius: 0; }
#hantee.ht-boutique > .pq-scene { flex: 0 0 auto; height: clamp(220px, 38vh, 340px); margin: -20px 0 -22px; border-radius: 0; background: transparent; box-shadow: none; }
#hantee.ht-boutique > .pq-scene > canvas { visibility: hidden; }
#hantee.ht-boutique > .pq-scene > .pq-bandeaux { bottom: 30px; }
#hantee.ht-boutique > .pq-scene ~ * { background: var(--ht-fond); }
#hantee.ht-boutique > .pq-tiroir { box-shadow: 0 -6px 16px rgba(21, 17, 31, .45); }`;
    document.head.appendChild(style);
  }

  // ═══ les apparitions à attraper (fantôme, citrouille, chauve-souris) : elles traversent la scène en 6 à 10 s, en flottant ═══
  const APP = []; let idApp = 1, courant = null;
  function objetApparition(type) {
    const T = THREE, M = MODELES, K = VIE.K || 1;
    if (SCENE.hd3 && type !== 'chauve-souris') { const o = HD.apparition(type, 29 * K); if (o) return o; }
    const g = new T.Group(), P = M.part;
    if (type === 'citrouille') {
      const pr = []; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; pr.push(P(M.sphere(8, 10), k % 2 ? '#F28C28' : '#FF9A3D', { x: Math.cos(a) * 4.5, y: 9, z: Math.sin(a) * 3, sy: 1.05 })); } pr.push(P(M.cylindre(1.2, 1.6, 4, 6), '#5A7A2E', { y: 17 })); g.add(M.maille(pr));
      const yeux = M.maille([P(M.cone(2.2, 2.8, 3), '#FFE27A', { x: -3.3, y: 10, z: 7, rx: Math.PI / 2 }), P(M.cone(2.2, 2.8, 3), '#FFE27A', { x: 3.3, y: 10, z: 7, rx: Math.PI / 2 }), P(M.boite(7, 1.8, 1.2, 0.4), '#FFE27A', { y: 5.5, z: 7.4 })], { ombre: false });
      yeux.material = new T.MeshLambertMaterial({ vertexColors: true, emissive: '#FFB347', emissiveIntensity: 0.9 }); g.add(yeux);
    } else if (type === 'chauve-souris') { // le corps, deux ailes qui battent (animées par majApp)
      g.add(M.maille([P(M.sphere(4, 10), '#2B2533', { sy: 1.2 }), P(M.sphere(3, 8), '#2B2533', { y: 5 }), P(M.cone(1.2, 3, 4), '#2B2533', { x: -1.6, y: 7.2 }), P(M.cone(1.2, 3, 4), '#2B2533', { x: 1.6, y: 7.2 }), P(M.sphere(0.7, 6), '#FFE27A', { x: -1.2, y: 5.4, z: 2.6 }), P(M.sphere(0.7, 6), '#FFE27A', { x: 1.2, y: 5.4, z: 2.6 })]));
      const matAile = new T.MeshLambertMaterial({ color: '#3E3648', side: T.DoubleSide }), aile = (s) => { const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(s * 14, 4); sh.lineTo(s * 11, -1); sh.lineTo(s * 8, 1); sh.lineTo(s * 5, -2); sh.lineTo(0, -3); const m = new T.Mesh(new T.ShapeGeometry(sh), matAile); m.position.set(s * 2, 2, 0); g.add(m); return m; };
      g.userData.ailes = [aile(-1), aile(1)];
    } else { // le fantôme : un drap en cloche translucide, deux yeux
      const corps = M.maille([P(M.sphere(9, 14), '#FFFFFF', { y: 11, sy: 1.05 }), P(M.cylindre(9, 10.5, 11, 14), '#FFFFFF')], { ombre: false }); corps.material = new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.88, emissive: '#D9D2FF', emissiveIntensity: 0.5 }); g.add(corps);
      g.add(M.maille([P(M.sphere(1.5, 8), '#4A3328', { x: -3, y: 12, z: 8.4, sy: 1.4, sz: 0.4 }), P(M.sphere(1.5, 8), '#4A3328', { x: 3, y: 12, z: 8.4, sy: 1.4, sz: 0.4 })], { ombre: false }));
    }
    return g;
  }
  function apparition(type, duree) { // une apparition qui traverse la salle, d'un bord à l'autre (en duree s si donnée, sinon 6 à 10 s) ; rend son id (null : pas d'écran ouvert)
    const tr = SCENE.trois, L = VIE.LAY; if (!tr || !courant || !L) return null; type = ['fantome', 'citrouille', 'chauve-souris'].includes(type) ? type : 'fantome';
    const W = VIE.W, K = VIE.K, sens = Math.random() < 0.5 ? 1 : -1, o = objetApparition(type); if (!o) return null;
    const cad = courant.vue.cadre, bas = Math.min(L.devanture.y - 20 * K, (cad.bas ? cad.bas - cad.haut : L.T) - 40 * K), y0 = L.murH + 36 * K + Math.random() * Math.max(10, bas - L.murH - 46 * K);
    const a = { id: idApp++, type, o, t: 0, duree: duree > 0 ? duree : 6 + Math.random() * 4, x0: sens > 0 ? -30 * K : W + 30 * K, x1: sens > 0 ? W + 30 * K : -30 * K, z: (y0 - L.murH) / Math.sin(52 * Math.PI / 180), haut: (type === 'chauve-souris' ? 60 : 30) * K, ph: Math.random() * 6, sens };
    if (!SCENE.hd3 || type === 'chauve-souris') o.scale.setScalar(K * (type === 'chauve-souris' ? 1.4 : 1.1)); tr.scene.add(o); APP.push(a); majApp(a, 0); return a.id;
  }
  function majApp(a, dt) {
    a.t += dt; const u = Math.min(1, a.t / a.duree), o = a.o, K = VIE.K || 1;
    o.position.set(a.x0 + (a.x1 - a.x0) * u, a.haut + Math.sin(a.t * 2.2 + a.ph) * 8 * K, a.z + Math.sin(a.t * 0.9 + a.ph) * 10 * K);
    o.rotation.set(0, a.sens > 0 ? 0.5 : -0.5, Math.sin(a.t * 2.2 + a.ph) * 0.12); // tourné vers où il va, sans montrer son dos à la caméra
    if (o.userData.ailes) { const b = Math.sin(a.t * 18) * 0.9; o.userData.ailes[0].rotation.y = b; o.userData.ailes[1].rotation.y = -b; o.rotation.y = 0; }
    return u >= 1;
  }
  function retirerApp(a) { const i = APP.indexOf(a); if (i >= 0) APP.splice(i, 1); if (a.o.parent) a.o.parent.remove(a.o); MODELES.dispose(a.o); }
  // la petite explosion d'une apparition attrapée : des étincelles additives qui s'écartent, retombent et s'éteignent (un appel de dessin)
  const EXPL = [];
  function exploser(p, col) {
    const tr = SCENE.trois; if (!tr) return; const n = 26, pos = new Float32Array(n * 3), v = [], K = VIE.K || 1;
    for (let i = 0; i < n; i++) { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = (40 + Math.random() * 70) * K; v.push([Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 30 * K, Math.sin(a) * Math.cos(b) * s]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size: 5, sizeAttenuation: false, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); pts.frustumCulled = false; pts.renderOrder = 6;
    tr.scene.add(pts); EXPL.push({ pts, v, t: 0 });
  }
  function majExpl(dt) {
    const K = VIE.K || 1;
    for (let k = EXPL.length - 1; k >= 0; k--) {
      const e = EXPL[k]; e.t += dt; const a = e.pts.geometry.attributes.position;
      for (let i = 0; i < e.v.length; i++) { a.array[i * 3] += e.v[i][0] * dt; a.array[i * 3 + 1] += e.v[i][1] * dt; a.array[i * 3 + 2] += e.v[i][2] * dt; e.v[i][1] -= 90 * K * dt; }
      a.needsUpdate = true; e.pts.material.opacity = Math.max(0, 1 - e.t / 0.8);
      if (e.t >= 0.8) { if (e.pts.parent) e.pts.parent.remove(e.pts); e.pts.geometry.dispose(); e.pts.material.dispose(); EXPL.splice(k, 1); }
    }
  }
  function apparitions() { // [{ id, type, x, y, r }] : le centre et le rayon de touche, en pixels de la fenêtre
    const tr = SCENE.trois, K = VIE.K || 1; if (!tr) return [];
    return APP.map((a) => { const p = tr.ecran(a.o.position.x, a.o.position.y + 12 * K, a.o.position.z); return { id: a.id, type: a.type, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(Math.max(32, 32 * K)) }; }); // (une cible qui bouge : un rayon de 32 px au moins, le doigt arrive toujours un peu après)
  }
  function ecranApp(a, t) { // le centre de touche de l'apparition a à l'instant t de sa traversée (le chemin de majApp, sans rien bouger), en pixels
    const u = Math.min(1, Math.max(0, t) / a.duree), K = VIE.K || 1;
    return SCENE.trois.ecran(a.x0 + (a.x1 - a.x0) * u, a.haut + Math.sin(t * 2.2 + a.ph) * 8 * K + 12 * K, a.z + Math.sin(t * 0.9 + a.ph) * 10 * K);
  }
  function retirer(id) { const a = APP.find((x) => x.id === id); if (!a) return false; retirerApp(a); return true; } // une apparition qui s'échappe (les règles l'ont perdue) : elle s'efface, sans éclat
  function attraper(id) {
    const a = APP.find((x) => x.id === id); if (!a) return false;
    exploser({ x: a.o.position.x, y: a.o.position.y + 12 * (VIE.K || 1), z: a.o.position.z }, a.type === 'citrouille' ? '#FF9A3C' : a.type === 'chauve-souris' ? '#C48BFF' : '#DCE4FF'); retirerApp(a); return true;
  }

  // ═══ l'API des activités (src/activites.js, src/evenement.js : la phase « Brancher » s'en sert) ═══
  // acteurs() : [{ id, sorte, role ('client'|'apprenti'|'patronne'), etat ('entre'|'file'|'assis'|'sort'), x, y, l, h }] ; x, y : le haut de la
  // tête, en pixels de la fenêtre (clientX/clientY : une bulle DOM en position fixe s'y pose) ; l, h : la largeur et la hauteur à l'écran.
  // Seulement ce qui se voit dans la fenêtre de l'écran. Un client : 'c' + son numéro ; un apprenti : 'a' + son poste ; la patronne : 'patronne'.
  const acteurs = () => (courant && SCENE.acteursEv ? SCENE.acteursEv() : []);
  const client = (id) => acteurs().find((a) => a.id === id && a.role === 'client') || null;
  const numero = (id) => (typeof id === 'string' && /^c\d+$/.test(id) ? +id.slice(1) : typeof id === 'number' ? id : null);
  const servir = (id) => { const n = numero(id); return n != null && !!courant && VIE.congedier(n, 'content'); }; // il repart content : il fête son achat (Cheer), puis la sortie
  const entrer = (sorte) => { if (!courant || !VIE.accueillir) return null; const n = VIE.accueillir(SORTES.includes(sorte) ? sorte : null); return n == null ? null : 'c' + n; }; // un client de la file des règles : il entre et attend qu'on le serve
  const fache = (id) => { const n = numero(id); return n != null && !!courant && VIE.congedier(n, 'fache'); }; // il repart sans payer
  let cbToucher = null;
  const surToucher = (cb) => { cbToucher = typeof cb === 'function' ? cb : null; };
  // l'apparition visée par un doigt en x, y (la plus proche, rayon d'au moins 32 px), ou null. Une cible qui file : le doigt vise là où il
  // l'a vue, un peu avant ; on mesure la distance au bout de chemin des 0,35 dernières secondes (aussi pour un toucher sur la colonne des
  // activités posée sur la scène : src/hanteeactivites.js, sousDoigt)
  function viser(x, y) {
    let best = null, bd = 1e9; const r = Math.max(32, 32 * (VIE.K || 1));
    if (SCENE.trois) for (const a of APP) {
      const p1 = ecranApp(a, a.t), p0 = ecranApp(a, a.t - 0.35), vx = p1.x - p0.x, vy = p1.y - p0.y, l2 = vx * vx + vy * vy, k = l2 > 0 ? Math.max(0, Math.min(1, ((x - p0.x) * vx + (y - p0.y) * vy) / l2)) : 1;
      const d = Math.hypot(p0.x + vx * k - x, p0.y + vy * k - y); if (d <= r && d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function toucher(e) { // un toucher sur la fenêtre de la scène : une apparition (viser), un client (44 × 44 au moins), ou le vide
    if (!cbToucher) return; const x = e.clientX, y = e.clientY;
    const best = viser(x, y);
    if (best) { cbToucher({ genre: 'apparition', id: best.id }); return; }
    let cl = null, cd = 1e9;
    for (const a of acteurs()) {
      if (a.role !== 'client' || a.etat === 'sort') continue; const w = Math.max(44, a.l || 0), h = Math.max(44, a.h || 0);
      if (x >= a.x - w / 2 && x <= a.x + w / 2 && y >= a.y - 6 && y <= a.y - 6 + h) { const d = Math.hypot(a.x - x, a.y + h / 2 - y); if (d < cd) { cd = d; cl = a; } }
    }
    cbToucher(cl ? { genre: 'client', id: cl.id } : { genre: 'vide', id: null });
  }
  const fete = () => { if (!courant) return false; SCENE.fete(); if (SCENE.feteMonstres) SCENE.feteMonstres(); return true; }; // les confettis, et tout le monde fait Cheer
  const ambiance = (o) => { const k = o && o.actif != null ? Math.max(0, Math.min(1, +o.actif || 0)) : 1; if (SCENE.ambiance) SCENE.ambiance(k); return k; }; // 0 : la lumière baisse, les bougies faiblissent

  // ─── la « scène » de l'écran de l'événement : la même API que sceneManoir (frame, redim, vente, fete, coup, equipe, detruire…) ───
  function scene(cv, X) {
    if (!actif(cv)) return null;
    const reel = X && X.st ? X.st() : null, q0 = X && X.q ? X.q() : null; if (!reel || !q0) return null;
    const el = cv.closest('#hantee'), fenetre = cv.parentElement, can = document.getElementById('scene');
    const st = etatVue(reel, q0, q0.now || Date.now()), vue = vueDe();
    feuille(); el.classList.add('ht-boutique'); document.body.classList.add('ht-boutique');
    let tCadre = 0, fini = false;
    function redim() { // la fenêtre de l'écran, en px du canvas de la boutique : la scène y descend
      if (!fenetre || !can) return; const f = fenetre.getBoundingClientRect(), c = can.getBoundingClientRect(), dessus = fenetre.previousElementSibling; if (!c.height) return;
      const haut = Math.max(0, Math.round((dessus ? dessus.getBoundingClientRect().bottom : f.top) - c.top - 2)), bas = Math.max(0, Math.round(f.bottom - c.top)); // le mur commence juste sous le bandeau du haut
      if (haut !== vue.cadre.haut || bas !== vue.cadre.bas) { vue.cadre.haut = haut; vue.cadre.bas = bas; SCENE.setEvenement(vue); }
    }
    SCENE.setEvenement(vue); redim();
    const ecoute = (e) => toucher(e); if (fenetre) fenetre.addEventListener('pointerdown', ecoute);
    const fmt = (n) => (R().fmtEur ? R().fmtEur(n) : String(Math.round(n)));
    const s3 = {
      get perdu() { return 0; }, // le contexte est celui de la boutique (src/scene.js le surveille)
      get hd() { const e = SCENE.evenement; return { actif: !!(e && e.hd), boutique: true, persos: e ? e.apprentis.length : 0, costumes: e ? e.apprentis.map((a) => a.costume) : [] }; },
      get vue() { return vue; }, get etat() { return st; },
      redim,
      frame(dt, qq, msImage, espacee) { // msImage, espacee : la cadence de ui.js (30 images/s en jouant, 10 au repos), que la qualité de la scène doit connaître
        if (fini) return; stations(st, qq || q0);
        if ((tCadre -= dt) <= 0) { tCadre = 0.5; redim(); } // la fenêtre suit la mise en page (le tiroir des activités, une rotation)
        const t = (qq && qq.now) || Date.now(); st.now = t; SCENE.frame(dt, st, t, msImage, espacee);
        for (let k = APP.length - 1; k >= 0; k--) if (majApp(APP[k], dt)) retirerApp(APP[k]); // une apparition qui a fini sa traversée s'en va
        majExpl(dt);
      },
      equipe: () => {}, // les monstres embauchés arrivent d'eux-mêmes à leur poste (les stations)
      vente: (gros) => { if (gros > 0) SCENE.vente(0, gros, '+' + fmt(gros), false); }, // le texte qui flotte ; le bouche-à-oreille amène du monde
      fete: () => fete(), coup: () => {},
      detruire() {
        if (fini) return; fini = true; if (fenetre) fenetre.removeEventListener('pointerdown', ecoute);
        while (APP.length) retirerApp(APP[0]); for (const e of EXPL) e.t = 1; majExpl(0); cbToucher = null; if (SCENE.ambiance) SCENE.ambiance(1);
        if (courant === s3) courant = null;
        SCENE.setEvenement(null); el.classList.remove('ht-boutique'); document.body.classList.remove('ht-boutique');
      },
      get calls() { return SCENE.stats.calls; },
    };
    courant = s3; return s3;
  }
  return { actif, demande, scene, etatVue, stations, mobilier, EQUIPE, CLIENTS, SORTES, GARDE, HD, acteurs, client, entrer, servir, fache, apparition, apparitions, attraper, retirer, surToucher, vise: (x, y) => !!courant && !!viser(x, y), fete, ambiance, get ouverte() { return !!courant; } };
})();
if (typeof module !== 'undefined') module.exports = BOUTIQUE_HANTEE;
