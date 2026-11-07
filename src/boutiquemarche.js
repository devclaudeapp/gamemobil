/* LE FOURNIL — la boutique du Marché d'automne (docs/marche-contrat.md § 6) : pendant le Marché (src/marche.js), l'écran de la Halle
   (src/evenement.js, HABILLAGE_MARCHE) montre la VRAIE scène de la boutique (src/scene.js, src/vie.js, src/meubles.js, src/persos.js,
   src/hd.js), ENTIÈREMENT transformée en halle de marché d'automne. C'est le défaut ; ?boutique=0 dans l'adresse rend la scène dessinée de
   l'écran (pour déboguer). La même API que BOUTIQUE_HANTEE (src/boutiquehantee.js), copiée et réhabillée :
   · En qualité haute (et moyenne : la HD permise, lot « marche » de src/hd.js chargé) : le décor de la Halle (KayKit Restaurant, Furniture et
     Halloween Bits, Kenney Food Kit, Mini Market et Furniture Kit, CC0 ; fournil/hd/marche/, cuits d'avance en couleurs de sommets par
     outils/marche/faire-hd.mjs) posé sur le plan de la boutique (LAY : mêmes places, mêmes chemins) — le mur à colombages, les tomettes, le
     four à bois, le comptoir devenu étal (son auvent rayé rouille et crème, les cagettes de fruits et de légumes), le brasero aux châtaignes,
     les tables et leurs bougies, le bar, le coin salon, la devanture de bois, la place du village et ses arbres roux ; la lumière dorée d'un
     après-midi d'automne qui tourne au soir avec l'heure (les lanternes s'allument, huit lumières au plus, leurs halos) ; les CLIENTS sont des
     enfants déguisés en animaux de la forêt (SORTES : un rig KayKit de 41 os, la capuche reteinte, les oreilles et le museau cousus sur la
     capuche ; les clips partagés du lot de la Maison hantée) ; les huit amis de la forêt à leurs postes (la capuche plus grande, le tablier) ;
     derrière l'étal, la marchande d'automne. Tout est fusionné : un appel de dessin pour le décor, un par personnage.
   · En qualité éco, sans HD ou si la HD échoue : le thème « marche » (VIE.DECORS.marche : colombages, tomettes), la Halle faite main
     (MEUBLES.marche : l'auvent, les cagettes, le brasero, la guirlande de feuilles et de lampions) ; les clients en chibis à capuche d'animal
     (les neuf sortes, PERSOS.DEGUISEMENTS, une écharpe, la queue de l'écureuil et du renard), plus petits : des enfants ; les apprentis en amis
     de la forêt ; le boulanger dans la tenue qu'il porte (la tenue d'automne, s'il l'a mise) ; l'écureuil sur le comptoir.
   · L'adaptateur : l'état q de l'événement devient un état de boutique en lecture seule (etatVue : GAME.newState, jamais sauvé, comme la
     visite d'un copain), dont les stations sont les postes de la Halle ; SCENE.setEvenement(vue) bascule la scène ; detruire() la rend.
   · L'écran : la scène se voit par la fenêtre de l'écran de la Halle (classes .mc-boutique sur #marche et sur body ; src/style.css les connaît).
   · L'API des activités (src/hanteeactivites.js) : acteurs, client, entrer, servir, fache, apparition (la feuille d'or qui tombe en
     virevoltant, la châtaigne qui roule, le champignon qui sautille), apparitions, attraper, retirer, surToucher, fete, ambiance. */
const BOUTIQUE_MARCHE = (() => {
  'use strict';
  const G = typeof GAME !== 'undefined' ? GAME : null;
  // les huit amis de la forêt, poste par poste (src/marche.js, PRODUITS : staffNom ; PERSOS : 'ami-ecureuil'…), en chibis
  const EQUIPE = ['ami-ecureuil', 'ami-herisson', 'ami-blaireau', 'ami-chouette', 'ami-ours', 'ami-biche', 'ami-renard', 'ami-marcassin'];
  // les neuf sortes d'enfants déguisés, tirées au hasard à chaque entrée (en éco : les chibis du même nom, PERSOS.DEGUISEMENTS)
  const SORTES = ['ecureuil', 'herisson', 'lapin', 'renard', 'blaireau', 'chouette', 'faon', 'marcassin', 'ourson'];
  const CLIENTS = SORTES, TYPES_APP = ['feuille', 'chataigne', 'champignon'];
  const GARDE = null; // (le boulanger garde la tenue qu'il porte : la tenue d'automne, s'il l'a mise)
  const R = () => (typeof MARCHE !== 'undefined' ? MARCHE : null);
  // l'interrupteur : la Halle est le défaut (?boutique=0 la coupe pour déboguer : la scène dessinée de l'écran), la scène de la boutique en 3D,
  // et le canvas de l'écran du Marché (pas celui d'une visite)
  const demande = () => typeof location === 'undefined' || !/[?&]boutique=0(&|$)/.test(location.search);
  const actif = (cv) => demande() && typeof SCENE !== 'undefined' && !!SCENE.webgl && !!SCENE.setEvenement && !!G && !!R() && (!cv || !!(cv.closest && cv.closest('#marche')));

  // ─── l'adaptateur : l'état de l'événement → un état de boutique (ses stations, son mobilier) ───
  function mobilier(reel, q) { // le mobilier de la boutique, et au moins ce que la Halle a gagné (elle se remplit au fil des amis et des paliers)
    const n = q.postes.filter((s) => s.niv > 0).length, e = q.postes.filter((s) => s.staff).length, p = (q.paliers || []).length;
    const min = { tables: 2 + e, four: 1 + Math.floor(n / 2), vitrine: 1 + Math.floor(n / 3), caisse: 1 + Math.floor(p / 4), froid: 1 + Math.floor(e / 3), deco: 1 + Math.floor(p / 3), bar: 1 + Math.floor(e / 3), banquette: 1 + Math.floor(p / 4), terrasse: 1 + Math.floor(p / 5) };
    const m = {}; for (const x of G.MOBILIER) m[x.id] = Math.min(x.max, Math.max(G.mobilierCran(reel, x.id), min[x.id] || 0)); return m;
  }
  function stations(st, q) { // les postes de la Halle sont les stations : niveau, fournée en cours (actif, prog), ami embauché
    q.postes.forEach((s, i) => { const t = st.stations[i]; if (!t) return; t.niv = s.niv; t.staff = !!s.staff; t.actif = !!s.actif; t.prog = s.prog || 0; });
    st.mobilier = mobilier(st.reel, q); return st;
  }
  function etatVue(reel, q, now) {
    const st = G.newState(now);
    Object.defineProperty(st, 'reel', { value: reel, enumerable: false }); // (jamais sauvé : la vue n'est qu'à l'écran)
    st.visite = true; st.nomBoutique = reel.nomBoutique; st.amenagement = reel.amenagement || null; // ses meubles à leur place
    st.chat = { nom: 'Pirouette', caresses: 0, dernier: 0, adopte: now };
    st.evTimer = 1e9; st.mystereTimer = 1e9; st.chatAttente = null; // rien ne surgit
    st.vueEv = { decor: 'marche', tags: ['feuilles'], deguisements: CLIENTS, taille: 0.8 }; // (des enfants : plus petits que les clients de la boulangerie)
    st.stations = R().PRODUITS.map(() => ({ niv: 0, staff: false, prog: 0, actif: false }));
    return stations(st, q);
  }
  const vueDe = (reel) => ({ id: 'marche', compagnon: 'ecureuil', garde: G.tenueBoulanger(reel), equipe: EQUIPE, friandises: R().PRODUITS.map((p) => 'mc-' + p.id), noms: R().PRODUITS.map((p) => p.staffNom), cadre: { haut: 0, bas: 0 } });

  // ═══ la qualité haute : le décor cuit, les enfants déguisés animés, les lanternes (lot HD « marche », src/hd.js : HDM.MC) ═══
  const HD = (() => {
    const T = typeof THREE !== 'undefined' ? THREE : null;
    let echec = ''; // une erreur pendant la préparation : la Halle reste en procédural (jamais d'écran cassé)
    const MCL = () => (typeof HDM !== 'undefined' && HDM.MC) || null;
    const pret = (renderer) => !echec && !!T && typeof HDM !== 'undefined' && HDM.pret('marche') && HDM.permis(renderer);
    function rater(e) { echec = String((e && e.message) || e); console.warn('Boutique du Marché : HD abandonnée, décor procédural', echec); }

    // ─── les couleurs : les recettes de teinte travaillent en TSL sur le sRGB des couleurs (h en degrés) ───
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
    // les recettes : le décor (le torchis crème et le chêne de la Halle ; les tomettes ; la toile rouille) ; la marchande d'automne
    const RECETTES = {
      halle: (h, s, l) => (l > 0.58 && (s < 0.5 || (h >= 20 && h < 60)) ? hsl(40, 0.5, Math.min(0.93, 0.62 + l * 0.32)) : h >= 130 && h < 270 ? hsl(24, 0.42, 0.18 + l * 0.3) : h >= 10 && h < 60 && s > 0.15 ? hsl(24, Math.min(0.5, s), Math.min(0.4, l * 0.55)) : s < 0.15 ? hsl(30, 0.18, l * 0.85) : null), // le mur : le torchis crème, le lambris et le bois de chêne
      tomettes: (h, s, l) => (s < 0.3 || (h >= 15 && h < 50) ? hsl(16, 0.58, 0.32 + l * 0.28) : null),
      chene: (h, s, l) => (h >= 8 && h < 60 && s > 0.12 ? hsl(24, Math.min(0.45, s * 0.8), Math.min(0.5, l * 0.58)) : h >= 130 && h < 270 ? hsl(24, 0.4, 0.2 + l * 0.3) : s < 0.12 ? hsl(28, 0.2, l * 0.75) : null),
      rouille: (h, s, l) => (l > 0.86 && s < 0.4 ? hsl(40, 0.62, 0.9) : h < 20 || h > 330 || (h > 180 && h < 300) || (h >= 35 && h < 80 && s > 0.3) ? hsl(16, 0.66, 0.2 + l * 0.38) : null), // les toiles et les coussins : rouille, la crème reste
      ocre: (h, s, l) => (h > 180 && h < 300 ? hsl(40, 0.7, 0.3 + l * 0.4) : h < 15 || h > 330 ? hsl(14, 0.62, 0.3 + l * 0.35) : h >= 35 && h < 80 && s > 0.3 ? hsl(38, 0.62, 0.28 + l * 0.4) : null),
      marchande: (h, s, l) => (peau(h, s, l) ? null : h >= 120 && h < 200 && s > 0.4 ? hsl(18, 0.68, Math.min(0.6, 0.22 + l * 1.2)) : h >= 8 && h < 30 && s > 0.3 && l < 0.6 ? hsl(40, 0.45, 0.42 + l * 0.6) : null), // le gilet rouille, la chemise crème
    };
    // les déguisements : la capuche (cap : sa teinte et sa saturation) et les habits (hab), leurs oreilles et ce qui fait l'animal, cousus sur la capuche
    const DEG = {
      ecureuil: { cap: [16, 0.62], hab: [92, 0.42], or: 'pointues', c2: '#FBD9AE', pointe: '#6B2E14', ech: '#E8B33A', queue: 'ecureuil' },
      herisson: { cap: [28, 0.32], hab: [16, 0.66], or: 'petites', c2: '#F2DAB6', piquants: '#4A3020', ech: '#7A9A3A' },
      lapin: { cap: [30, 0.08], hab: [210, 0.4], or: 'longues', c2: '#FFB8AA', clair: true, ech: '#E8B33A', queue: 'lapin' },
      renard: { cap: [25, 0.94], hab: [44, 0.6], or: 'pointues', c2: '#FFF6EA', pointe: '#2E2420', ech: '#8E3B2E', queue: 'renard' },
      blaireau: { cap: [230, 0.07], hab: [6, 0.55], or: 'rondes', c2: '#FFFFFF', rayures: '#FFFFFF', ech: '#E8B33A' },
      chouette: { cap: [30, 0.5], hab: [92, 0.42], or: 'plumes', c2: '#F2DEB8', ech: '#D9622B', queue: 'chouette' },
      faon: { cap: [30, 0.58], hab: [2, 0.6], or: 'petites', c2: '#FBEBD3', taches: '#FFFFFF', ech: '#F2D3A0', queue: 'faon' },
      marcassin: { cap: [20, 0.3], hab: [44, 0.75], or: 'petites', c2: '#E6C59A', rayures: '#EBCD9E', ech: '#4F6D8C', queue: 'marcassin' },
      ourson: { cap: [24, 0.48], hab: [212, 0.45], or: 'rondes', c2: '#EED2AE', ech: '#C8552A', queue: 'ourson' },
    };
    // ce qui luit (la lueur des sommets) : les flammes, les braises, le verre des lanternes (jaune-orangé vif)
    const feu = function feu(h, s, l) { return h >= 28 && h <= 62 && s > 0.5 && l > 0.55 ? 1 : 0; };

    // ─── cuire : des maillages → des tableaux (positions, normales, couleurs linéaires, lueur ; os et poids pour un personnage) ───
    // Le décor est cuit d'avance (COLOR_0, linéaire) ; les personnages ont leur atlas (des dégradés : l'échantillon au sommet suffit).
    const PIX = new Map();
    function pixels(img) {
      let p = PIX.get(img); if (p) return p; const w = 256, h = 256, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h); p = { d: x.getImageData(0, 0, w, h).data, w, h }; PIX.set(img, p); return p;
    }
    function texel(p, u, v, o) { u -= Math.floor(u); v -= Math.floor(v); const x = Math.min(p.w - 1, Math.floor(u * p.w)), y = Math.min(p.h - 1, Math.floor(v * p.h)), i = (y * p.w + x) * 4; o[0] = p.d[i] / 255; o[1] = p.d[i + 1] / 255; o[2] = p.d[i + 2] / 255; }
    function cuire(parts, o) {
      let n = 0, ni = 0; for (const p of parts) { const g = p.mesh.geometry; n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), Lu = new Float32Array(n), I = new Uint32Array(ni), SI = o.skin ? new Uint16Array(n * 4) : null, SW = o.skin ? new Float32Array(n * 4) : null;
      const v = new T.Vector3(), nn = new T.Vector3(), m3 = new T.Matrix3(), uv = new T.Vector2(), rgb = [1, 1, 1], t = [0, 0, 0];
      let k = 0, ki = 0;
      for (const p of parts) {
        const g = p.mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, tuv = g.attributes.uv, col = g.attributes.color, mat = p.mesh.material, map = mat && mat.map, rec = p.recette || o.recette || null;
        const img = map ? (o.image || map.image) : null, px = img ? pixels(img) : null, mc = mat && mat.color;
        if (map) map.updateMatrix(); m3.getNormalMatrix(p.M);
        const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, base = k, inv = p.M.determinant() < 0, n3 = p.Mj ? p.Mj.map((x) => new T.Matrix3().getNormalMatrix(x)) : null;
        for (let i = 0; i < pos.count; i++, k++) {
          let M = p.M, mn = m3;
          if (n3 && si) { let jd = si.getX(i), wd = sw.getX(i); for (const [jj, ww] of [[si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)], [si.getW(i), sw.getW(i)]]) if (ww > wd) { wd = ww; jd = jj; } M = p.Mj[jd]; mn = n3[jd]; } // l'os dominant
          v.fromBufferAttribute(pos, i).applyMatrix4(M); P[k * 3] = v.x; P[k * 3 + 1] = v.y; P[k * 3 + 2] = v.z;
          if (nor) nn.fromBufferAttribute(nor, i).applyMatrix3(mn).normalize(); else nn.set(0, 1, 0); N[k * 3] = nn.x; N[k * 3 + 1] = nn.y; N[k * 3 + 2] = nn.z;
          if (col) { rgb[0] = srgb(col.getX(i)); rgb[1] = srgb(col.getY(i)); rgb[2] = srgb(col.getZ(i)); } // (cuit d'avance : linéaire)
          else if (px && tuv) { uv.fromBufferAttribute(tuv, i).applyMatrix3(map.matrix); texel(px, uv.x, uv.y, rgb); } else rgb[0] = rgb[1] = rgb[2] = 1;
          if (mc) { rgb[0] *= srgb(mc.r); rgb[1] *= srgb(mc.g); rgb[2] *= srgb(mc.b); }
          enHsl(rgb[0], rgb[1], rgb[2], t);
          const r2 = rec ? rec(t[0], t[1], t[2]) : null, c = r2 || rgb;
          C[k * 3] = lin(c[0]); C[k * 3 + 1] = lin(c[1]); C[k * 3 + 2] = lin(c[2]);
          Lu[k] = p.lueur == null ? 0 : typeof p.lueur === 'function' ? p.lueur(t[0], t[1], t[2]) : p.lueur;
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
    // un modèle du lot, cuit dans son repère (en cache, par recette et lueur)
    const CUITS = new Map();
    function cuitModele(nom, recette, lueur) {
      const k = `${nom}|${recette || ''}|${lueur == null ? '' : typeof lueur === 'function' ? lueur.name : lueur}`; let c = CUITS.get(k); if (c) return c;
      const src = MCL().decor[nom]; if (!src) return null; src.updateMatrixWorld(true); const parts = [];
      src.traverse((o) => { if (o.isMesh) parts.push({ mesh: o, M: o.matrixWorld.clone(), lueur }); });
      c = cuire(parts, { recette: recette ? RECETTES[recette] : null }); const b = new T.Box3(), v = new T.Vector3(); for (let i = 0; i < c.n; i++) b.expandByPoint(v.set(c.P[i * 3], c.P[i * 3 + 1], c.P[i * 3 + 2])); c.boite = b;
      CUITS.set(k, c); return c;
    }
    function geoCentree(nom, recette, lueur, haut) { // un modèle cuit, posé (bas en y = 0), centré, à la hauteur voulue : une géométrie neuve
      const c = cuitModele(nom, recette, lueur); if (!c) return null; const b = c.boite, k = haut / (b.max.y - b.min.y), geo = geometrie(Object.assign({}, c, { P: c.P.slice(), N: c.N.slice() }));
      geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); geo.scale(k, k, k); geo.computeBoundingBox(); geo.computeBoundingSphere(); return geo;
    }
    // une pièce faite main (une géométrie de Three et sa couleur), cuite comme un modèle : ce qui manque aux packs (l'auvent rayé, les
    // bottes de paille, le brasero, les feuilles d'érable, les poutres)
    const _mb = new Map();
    const matB = (hex) => { let m = _mb.get(hex); if (!m) { m = new T.MeshBasicMaterial({ color: hex }); _mb.set(hex, m); } return m; };
    function piece(geo, hex, o, lueur) { const mesh = new T.Mesh(geo, matB(hex)); return { c: cuire([{ mesh, M: new T.Matrix4(), lueur }], {}), M: matriceDe(o || {}, 1) }; }

    // ─── le matériau partagé (jamais libéré) : couleurs de sommets, la lueur des sommets en émissif ───
    let MAT = null;
    // l'ambiance de la pièce (l'environnement du rendu riche) sur les matériaux de la Halle : 1 de jour, elle baisse le soir et la nuit, quand
    // les lampions et les lanternes prennent le relais (eclairer) ; comme les jumeaux de la boutique (src/scene.js, RICHE.envK)
    const ENV = { k: 0.3, chaud: 0.4 }, suivreEnv = (m) => { Object.defineProperty(m, 'envMapIntensity', { get: () => ENV.k, set: () => {} }); return m; };
    function mat() {
      if (MAT) return MAT;
      const m = suivreEnv(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 })), u = { uLueur: { value: 1 } }; m.userData.u = u;
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float lueur; varying float vLueur;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLueur = lueur;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLueur; varying float vLueur;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vLueur * uLueur;');
      };
      m.customProgramCacheKey = () => 'mc-lueur';
      if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(m); return (MAT = m);
    }

    // ═══ les personnages : un prototype par sorte (un SkinnedMesh unique : tous les maillages fusionnés sur le squelette de référence, la
    //     capuche reteinte, les oreilles et le museau cousus sur l'os de la tête), des clones (SkeletonUtils) qui partagent géométrie et
    //     matériau ; les clips partagés (anims-hante.glb) leur vont tels quels ═══
    const AMIS3 = ['ecureuil', 'herisson', 'blaireau', 'chouette', 'ourson', 'faon', 'renard', 'marcassin']; // (l'équipe, poste par poste : Gaspard l'écureuil… Sacha le marcassin)
    const EQUIPE3 = AMIS3.map((s) => 'ami-' + s);
    const PROTOS = new Map(); let CLIPS = null;
    // les pièces cousues sur la capuche : des formes de Three (oreilles, museau, piquants), dans le repère de l'os de la tête (k : leur taille)
    const poseur = (out) => (geo, hex, x, y, z, rx, ry, rz, sx, sy, sz) => { geo.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0)), new T.Vector3(sx || 1, sy || 1, sz || 1))); out.push({ geo, hex }); };
    const capHexDe = (d, l) => { const c = hsl(d.cap[0], d.cap[1], l == null ? (d.clair ? 0.9 : 0.4) : l); return '#' + new T.Color().setRGB(lin(c[0]), lin(c[1]), lin(c[2])).getHexString(); };
    function cousues(d, k) { // (repère de l'os de la tête KayKit : la tête de −0,55 à 0,55 en x, de 0 à 1 en y, le visage vers +z jusqu'à 0,58)
      const out = [], capHex = capHexDe(d), ajoute = poseur(out);
      for (const sx of [-1, 1]) {
        if (d.or === 'pointues') { ajoute(new T.ConeGeometry(0.17 * k, 0.42 * k, 6), capHex, sx * 0.34, 0.94 + 0.13 * k, -0.04, 0, 0, -sx * 0.38); ajoute(new T.ConeGeometry(0.09 * k, 0.26 * k, 5), d.pointe || d.c2, sx * 0.36, 0.96 + 0.13 * k, 0.04, 0, 0, -sx * 0.38); }
        else if (d.or === 'longues') { ajoute(new T.CapsuleGeometry(0.1 * k, 0.52 * k, 3, 8), capHex, sx * 0.18, 1.02 + 0.36 * k, -0.06, 0, 0, -sx * 0.16, 1, 1, 0.62); ajoute(new T.CapsuleGeometry(0.055 * k, 0.4 * k, 3, 6), d.c2, sx * 0.18, 1.03 + 0.36 * k, -0.01, 0, 0, -sx * 0.16, 1, 1, 0.4); }
        else if (d.or === 'plumes') ajoute(new T.ConeGeometry(0.1 * k, 0.34 * k, 5), capHex, sx * 0.34, 0.95 + 0.1 * k, 0, 0, 0, -sx * 0.62);
        else if (d.or === 'petites') { ajoute(new T.SphereGeometry(0.13 * k, 8, 6), capHex, sx * 0.54, 0.8, -0.04, 0, 0, -sx * 0.9, 1, 1.5, 0.45); ajoute(new T.SphereGeometry(0.08 * k, 6, 5), d.c2, sx * 0.55, 0.81, 0.01, 0, 0, -sx * 0.9, 1, 1.4, 0.3); }
        else { ajoute(new T.SphereGeometry(0.16 * k, 10, 8), capHex, sx * 0.38, 0.96, -0.06, 0, 0, 0, 1, 1, 0.55); ajoute(new T.SphereGeometry(0.1 * k, 8, 6), d.c2, sx * 0.38, 0.96, -0.01, 0, 0, 0, 1, 1, 0.4); } // rondes
      }
      if (d.or === 'plumes') { for (const sx of [-1, 1]) { ajoute(new T.SphereGeometry(0.12, 10, 8), '#FFF8E8', sx * 0.15, 0.8, 0.52, 0, 0, 0, 1, 1, 0.4); ajoute(new T.SphereGeometry(0.055, 8, 6), '#3A2A22', sx * 0.15, 0.8, 0.57, 0, 0, 0, 1, 1, 0.4); } ajoute(new T.ConeGeometry(0.05, 0.13, 4), '#E8A93A', 0, 0.68, 0.58, Math.PI * 0.85, 0, 0); } // les grands yeux et le bec
      else { ajoute(new T.SphereGeometry(0.11, 8, 6), d.c2, 0, 0.76, 0.52, 0, 0, 0, 1, 0.75, 0.6); ajoute(new T.SphereGeometry(0.045, 6, 5), '#2E2420', 0, 0.79, 0.6); for (const sx of [-1, 1]) ajoute(new T.SphereGeometry(0.036, 6, 5), '#2E2420', sx * 0.14, 0.86, 0.5); } // le museau cousu, la truffe, deux yeux-boutons
      if (d.piquants) for (let i = 0; i < 11; i++) { const a = Math.PI * (0.58 + 0.84 * (i / 10)), y = 0.55 + (i % 3) * 0.17; ajoute(new T.ConeGeometry(0.06, 0.2, 4), d.piquants, Math.cos(a) * 0.56, y, Math.sin(a) * 0.56 - 0.06, -0.9, 0, Math.cos(a) * 1.1); }
      if (d.taches) for (const [x, y, z] of [[-0.3, 0.8, -0.38], [0.26, 0.86, -0.42], [0, 0.98, -0.2], [-0.48, 0.55, -0.32], [0.46, 0.6, -0.3]]) ajoute(new T.SphereGeometry(0.06, 6, 5), d.taches, x, y, z, 0, Math.atan2(x, z), 0, 1, 1, 0.4);
      if (d.rayures) for (const sx of [-1, 1]) ajoute(new T.BoxGeometry(0.06, 0.04, 0.7), d.rayures, sx * 0.11, 1.0, -0.08, 0.15, 0, 0);
      return out;
    }
    // l'écharpe tricotée des enfants (repère de l'os du buste : le cou à y ≈ 0,27) : le tour de cou, le nœud, deux pans, l'un rayé
    function echarpe(d) {
      const out = [], a = poseur(out), c = d.ech, r = '#' + new T.Color(c).lerp(new T.Color('#FFFFFF'), 0.4).getHexString(); // (le pan rayé : la couleur éclaircie, comme l'écharpe des chibis)
      a(new T.TorusGeometry(ECH.R, ECH.r, 6, 16), c, 0, ECH.y, ECH.z, Math.PI / 2, 0, 0);
      a(new T.SphereGeometry(ECH.r * 1.1, 8, 6), c, -0.14, ECH.y - 0.03, ECH.z + ECH.R * 0.92);
      a(new T.CapsuleGeometry(ECH.r * 0.75, 0.24, 3, 6), c, -0.2, ECH.y - 0.22, ECH.z + ECH.R * 0.92 + 0.05, 0.12, 0, 0.16, 1, 1, 0.6);
      a(new T.CapsuleGeometry(ECH.r * 0.75, 0.18, 3, 6), r, -0.07, ECH.y - 0.19, ECH.z + ECH.R * 0.92 + 0.06, 0.12, 0, -0.12, 1, 1, 0.6);
      return out;
    }
    const ECH = { R: 0.46, r: 0.1, y: 0.2, z: 0 }, QU = { y: 0.02, z: -0.44 }; // (mesurés sur le Rogue à capuche : sa pèlerine fait 0,45 de rayon au cou, sa cape descend dans le dos jusqu'à z = −0,4)
    // la queue du déguisement (repère des hanches, dans le dos) : l'écureuil, en panache qui remonte ; le renard, longue, son bout blanc ; le
    // pompon du lapin ; la petite queue blanche du faon ; celle, ronde, de l'ourson ; la queue en tire-bouchon du marcassin ; les plumes de la chouette
    function queue(d) {
      const out = [], a = poseur(out), c = capHexDe(d), c2 = capHexDe(d, d.clair ? 0.8 : 0.3), y = QU.y, z = QU.z;
      if (d.queue === 'ecureuil') [[0.04, -0.04, 0.13], [0.24, -0.18, 0.17], [0.48, -0.26, 0.2], [0.73, -0.25, 0.2], [0.94, -0.17, 0.18], [1.08, -0.25, 0.14]].forEach(([yy, zz, r], i) => a(new T.SphereGeometry(r, 8, 6), i === 5 ? c2 : c, 0, y + yy, z + zz, 0, 0, 0, 0.9, 1, 1)); // (le panache remonte le long du dos, sa pointe se recourbe)
      else if (d.queue === 'renard') { a(new T.CapsuleGeometry(0.11, 0.3, 3, 8), c, 0, y - 0.04, z - 0.14, -1.05, 0, 0); a(new T.SphereGeometry(0.14, 8, 6), c, 0, y - 0.13, z - 0.31, 0, 0, 0, 0.9, 1, 1); a(new T.SphereGeometry(0.1, 8, 6), '#FFF3E2', 0, y - 0.17, z - 0.44, 0, 0, 0, 0.85, 1, 1); }
      else if (d.queue === 'lapin') a(new T.SphereGeometry(0.1, 8, 6), '#FFFFFF', 0, y + 0.04, z);
      else if (d.queue === 'faon') a(new T.SphereGeometry(0.08, 8, 6), '#FFFFFF', 0, y + 0.08, z, -0.4, 0, 0, 1, 1.4, 0.6);
      else if (d.queue === 'ourson') a(new T.SphereGeometry(0.08, 8, 6), c, 0, y + 0.03, z);
      else if (d.queue === 'marcassin') a(new T.TorusGeometry(0.06, 0.022, 4, 10, Math.PI * 1.6), c, 0, y + 0.04, z - 0.02, 0, Math.PI / 2, 0);
      else if (d.queue === 'chouette') for (const rz of [-0.45, 0, 0.45]) a(new T.CapsuleGeometry(0.035, 0.16, 3, 5), c2, Math.sin(rz) * 0.08, y - 0.02, z - 0.02, -0.5, 0, rz, 1, 1, 0.55);
      return out;
    }
    // le bonnet à pompon de la marchande (repère de l'os de la tête) : la calotte tricotée moutarde posée haut (le visage reste libre, vu d'en
    // haut aussi), le revers rouille, le pompon crème
    function bonnetMarchande() { const l = [], a = poseur(l);
      a(new T.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), '#D99A2E', 0, BON.y, -0.03, 0, 0, 0, 1, 0.82, 1); a(new T.CylinderGeometry(0.61, 0.63, 0.13, 18), '#C8552A', 0, BON.y + 0.02, -0.03);
      for (const h of [0.14, 0.28]) a(new T.TorusGeometry(0.6 * Math.sqrt(1 - Math.pow(h / 0.49, 2)) + 0.005, 0.028, 4, 22), '#C8552A', 0, BON.y + h, -0.03, Math.PI / 2, 0, 0); // deux rayures tricotées
      a(new T.SphereGeometry(0.12, 10, 8), '#FFF3DE', 0, BON.y + 0.53, -0.05); return l; }
    const BON = { y: 0.6 };
    const DEFS = { // le corps KayKit, sa recette ; les déguisements (la capuche reteinte, ses pièces cousues)
      patronne: { src: 'Rogue', recette: 'marchande', bonnet: true }, // la marchande d'automne, derrière l'étal : le gilet rouille, un bonnet à pompon
    };
    for (const s of SORTES) DEFS[s] = { src: 'Rogue_Hooded', deg: s, k: 1.15 };
    AMIS3.forEach((s) => { DEFS['ami-' + s] = { src: 'Rogue_Hooded', deg: s, k: 1.45, ami: true }; });
    function recetteDeg(s, ami) { // la capuche et la cape (les verts du Rogue à capuche) à la couleur de l'animal ; les habits (ses cuirs bruns) aux
      // couleurs d'automne de l'enfant ; un ami de la forêt : un tablier crème à la place des cuirs
      const D = DEG[s];
      return (h, sa, l) => {
        if (peau(h, sa, l) || l < 0.1) return null;
        if (h >= 120 && h < 200 && sa > 0.4) return D.clair ? hsl(D.cap[0], D.cap[1], Math.min(0.95, 0.66 + l * 0.9)) : hsl(D.cap[0], D.cap[1], Math.min(0.56, 0.14 + l * 0.95));
        if (h >= 8 && h < 30 && sa > 0.3 && l < 0.6) return ami ? hsl(40, 0.5, 0.7 + l * 0.35) : hsl(D.hab[0], D.hab[1], 0.18 + l * 0.75);
        return null;
      };
    }
    function proto(sorte) {
      let p = PROTOS.get(sorte); if (p) return p; const d = DEFS[sorte] || DEFS.ecureuil, mc = MCL();
      const src = mc.persos[d.src]; src.updateMatrixWorld(true); let S0 = null; src.traverse((o) => { if (!S0 && o.isSkinnedMesh) S0 = o; });
      const bones = S0.skeleton.bones, idx = new Map(bones.map((b, i) => [b.name, i])), iB = S0.bindMatrix.clone().invert(), parts = [], BI0 = S0.skeleton.boneInverses.map((m) => m.clone().invert());
      const rec = d.deg ? recetteDeg(d.deg, d.ami) : RECETTES[d.recette] || null;
      src.traverse((o) => {
        if (!o.isMesh) return;
        if (o.isSkinnedMesh) { // v' = B0⁻¹ · BI0ⱼ⁻¹ · BIⱼ · B · v : de sa peau à celle de la référence, os par os (la pose ne compte pas)
          const remap = o.skeleton.bones.map((b) => (idx.has(b.name) ? idx.get(b.name) : 0));
          parts.push({ mesh: o, M: iB.clone().multiply(o.bindMatrix), remap, Mj: o.skeleton.boneInverses.map((bi, j) => iB.clone().multiply(BI0[remap[j]]).multiply(bi).multiply(o.bindMatrix)), recette: rec });
        } else { // un accessoire rigide, porté par son os
          let a = o.parent; while (a && !(a.isBone && idx.has(a.name))) a = a.parent; const j = a ? idx.get(a.name) : 0;
          parts.push({ mesh: o, M: iB.clone().multiply(BI0[j]).multiply(bones[j].matrixWorld.clone().invert()).multiply(o.matrixWorld), os: j, recette: rec });
        }
      });
      const coudre = (os, liste) => { const j = idx.has(os) ? idx.get(os) : 0, Mo = iB.clone().multiply(BI0[j]); for (const { geo, hex } of liste) parts.push({ mesh: new T.Mesh(geo, matB(hex)), M: Mo, os: j }); };
      if (d.deg || d.bonnet) coudre('head', d.deg ? cousues(DEG[d.deg], d.k) : bonnetMarchande()); // les oreilles, le museau, les piquants : cousus sur la capuche ; le bonnet de la marchande
      if (d.deg && !d.ami) { coudre('chest', echarpe(DEG[d.deg])); coudre('hips', queue(DEG[d.deg])); } // un enfant : son écharpe tricotée, la queue de son déguisement
      const c = cuire(parts, { skin: true, image: mc.images[d.src] || null }), geo = geometrie(c); geo.userData.cache = true; // (partagée par les clones : jamais libérée)
      const tpl = FOURNIL_HD.SkeletonUtils.clone(src); let S1 = null; const jeter = [];
      tpl.traverse((o) => { if (o.isMesh) { if (!S1 && o.isSkinnedMesh) S1 = o; else jeter.push(o); } });
      for (const o of jeter) o.parent.remove(o);
      S1.geometry = geo; S1.material = mat(); S1.castShadow = true; S1.receiveShadow = false; S1.frustumCulled = false;
      p = { tpl, fantome: false, haut: geo.boundingBox.max.y, marche: 'Walking_A' };
      PROTOS.set(sorte, p); return p;
    }
    function clips() { if (!CLIPS) { CLIPS = {}; for (const c of MCL().clips) CLIPS[c.name] = c; } return CLIPS; }
    // un acteur : { g, sorte, fantome, haut (unités), marche (son clip de marche), mixer, actions, joue, echelle (un enfant : plus petit) }
    function acteur(sorte) {
      try {
        const p = proto(sorte), g = FOURNIL_HD.SkeletonUtils.clone(p.tpl);
        g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
        const a = { g, sorte, fantome: false, haut: p.haut, marche: p.marche, mixer: new T.AnimationMixer(g), actions: {}, joue: '', graine: Math.random() * 10, echelle: SORTES.includes(sorte) ? 0.82 : 1 };
        g.userData.hd3 = a; return a;
      } catch (e) { rater(e); return null; }
    }
    function jouer(a, nom, fondu, une) {
      if (!a.mixer || a.joue === nom) return; const clip = clips()[nom]; if (!clip) return;
      const ac = a.actions[nom] || (a.actions[nom] = a.mixer.clipAction(clip)); ac.reset(); ac.setLoop(une ? T.LoopOnce : T.LoopRepeat, Infinity); ac.clampWhenFinished = !!une; ac.play();
      const av = a.joue && a.actions[a.joue]; if (av) av.crossFadeTo(ac, fondu == null ? 0.25 : fondu, false); else ac.time = (a.graine % 1) * clip.duration;
      a.joue = nom;
    }
    function liberer(a) { if (!a) return; if (a.mixer) { a.mixer.stopAllAction(); a.mixer.uncacheRoot(a.g); } a.g.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); }); }

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
    function quad(x0, z0, x1, z1, hex, y) { const c = new T.Color(hex), yy = y || 0; return { n: 4, P: new Float32Array([x0, yy, z0, x1, yy, z0, x1, yy, z1, x0, yy, z1]), N: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), C: new Float32Array([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b]), Lu: new Float32Array(4), I: [0, 2, 1, 0, 3, 2] }; }

    // ─── le ciel d'automne derrière les ouvertures du mur : un dégradé doré, des collines, un clocher, des arbres roux ───
    let CIEL = null;
    function texCiel() {
      if (CIEL) return CIEL; const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const y = cv.getContext('2d'), gr = y.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, '#8FC3E8'); gr.addColorStop(0.55, '#F6D9A8'); gr.addColorStop(1, '#F2B27A'); y.fillStyle = gr; y.fillRect(0, 0, 512, 128);
      y.fillStyle = 'rgba(255,255,255,.75)'; for (const [x, yy, r] of [[70, 26, 12], [86, 22, 15], [104, 27, 11], [330, 18, 11], [346, 14, 14], [362, 19, 10]]) { y.beginPath(); y.arc(x, yy, r, 0, Math.PI * 2); y.fill(); }
      y.fillStyle = '#B9875A'; y.beginPath(); y.moveTo(0, 128); for (let x = 0; x <= 512; x += 16) y.lineTo(x, 98 - 10 * Math.sin(x * 0.018) - 5 * Math.sin(x * 0.07)); y.lineTo(512, 128); y.fill(); // les collines
      y.fillStyle = '#8A6A55'; y.fillRect(250, 70, 14, 34); y.beginPath(); y.moveTo(246, 72); y.lineTo(257, 50); y.lineTo(268, 72); y.fill(); // le clocher du village
      for (let i = 0; i < 18; i++) { const x = 8 + i * 29 + (i % 3) * 6, r = 7 + (i % 4) * 2; y.fillStyle = ['#D9622B', '#E8A93A', '#C8452A', '#B8862F'][i % 4]; y.beginPath(); y.arc(x, 100 - r * 0.6, r, 0, Math.PI * 2); y.fill(); }
      CIEL = new T.CanvasTexture(cv); CIEL.colorSpace = T.SRGBColorSpace; CIEL.userData.partagee = true; return CIEL;
    }
    // ─── les halos des lanternes : des quadrilatères additifs dans UN maillage ; un halo regarde la caméra (plongée de 52°) et vacille ;
    //     ils s'allument avec le soir (uK) ───
    let HALO_MAT = null;
    function haloMat() {
      if (HALO_MAT) return HALO_MAT;
      HALO_MAT = new T.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uK: { value: 1 } },
        vertexShader: `attribute vec3 centre; attribute vec3 decal; attribute vec3 teinte; attribute vec2 vac; uniform float uT; varying vec2 vUv; varying vec3 vC; varying float vA;
          void main() { vUv = uv; vC = teinte; float f = 1.0 + vac.x * (0.55 * sin(uT * 7.0 + vac.y) + 0.45 * sin(uT * 19.0 + vac.y * 1.7)); vA = mix(1.0, f, 0.6);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(centre + decal * f, 1.0); }`,
        fragmentShader: 'uniform float uK; varying vec2 vUv; varying vec3 vC; varying float vA; void main() { float d = length(vUv * 2.0 - 1.0); float a = pow(max(0.0, 1.0 - d), 2.0); gl_FragColor = vec4(vC * a * vA * uK, 1.0); }',
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false,
      });
      if (typeof MODELES !== 'undefined' && MODELES) MODELES.partager(HALO_MAT); return HALO_MAT;
    }
    function halos(liste, SY, CY) { // liste : [{ x, y, z, r, col, a (force), vac (vacillement) }]
      const n = liste.length, C = new Float32Array(n * 12), D = new Float32Array(n * 12), Te = new Float32Array(n * 12), V = new Float32Array(n * 8), UV = new Float32Array(n * 8), I = [], col = new T.Color();
      liste.forEach((h, i) => {
        col.set(h.col).multiplyScalar(h.a == null ? 1 : h.a);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], j) => {
          const o = (i * 4 + j) * 3, q = (i * 4 + j) * 2; C[o] = h.x; C[o + 1] = h.y; C[o + 2] = h.z;
          D[o] = a * h.r; D[o + 1] = b * h.r * CY; D[o + 2] = -b * h.r * SY;
          Te[o] = col.r; Te[o + 1] = col.g; Te[o + 2] = col.b; V[q] = h.vac == null ? 0.06 : h.vac; V[q + 1] = i * 2.39; UV[q] = (a + 1) / 2; UV[q + 1] = (b + 1) / 2;
        });
        I.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
      });
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(C.slice(), 3)); g.setAttribute('centre', new T.BufferAttribute(C, 3)); g.setAttribute('decal', new T.BufferAttribute(D, 3)); g.setAttribute('teinte', new T.BufferAttribute(Te, 3)); g.setAttribute('vac', new T.BufferAttribute(V, 2)); g.setAttribute('uv', new T.BufferAttribute(UV, 2)); g.setIndex(I);
      const m = new T.Mesh(g, haloMat()); m.frustumCulled = false; m.renderOrder = 5; m.castShadow = false; m.receiveShadow = false; m.userData.nom = 'halos'; return m;
    }
    // ─── le sol de la Halle, peint (un plan, sa texture : 1 appel de dessin) : les tomettes de terre cuite devant le fournil et l'étal, le parquet
    //     de chêne en lames décalées dans la salle ; la texture refaite à chaque décor (la taille de l'écran), l'ancienne rendue ───
    function sol(W, D, zb) {
      const cw = 512, ch = Math.max(256, Math.min(1024, Math.round(512 * D / W))), k = cw / W, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d'), yb = zb * k;
      // le parquet : des lames de 13 unités, les joints décalés, trois tons de chêne, un fil du bois
      const lame = 13 * k, tons = ['#A47450', '#9A6A47', '#AD7D57', '#94653F'];
      for (let r = 0, y = yb; y < ch; r++, y += lame) { let xx = -((r * 37) % 90) * k; for (let i = 0; xx < cw; i++) { const l = (70 + ((r * 13 + i * 29) % 50)) * k; x.fillStyle = tons[(r + i * 3) % 4]; x.fillRect(xx, y, l - 1.2, lame - 1.2); x.fillStyle = 'rgba(90,50,25,.12)'; x.fillRect(xx + l * 0.2, y + lame * 0.45, l * 0.5, 1); xx += l; } }
      x.fillStyle = 'rgba(70,40,20,.35)'; x.fillRect(0, yb - 2, cw, 3); // la bordure entre les tomettes et le parquet
      // les tomettes : des hexagones de terre cuite, leurs joints de mortier
      const px = 15 * k, r0 = px / 1.5, hr = px * 0.866 * 1.15, tons2 = ['#B9603A', '#AE5733', '#C26A43', '#B35C36'];
      x.save(); x.beginPath(); x.rect(0, 0, cw, yb - 1); x.clip(); x.fillStyle = '#EED2AE'; x.fillRect(0, 0, cw, yb);
      for (let i = -1; i * px < cw + px; i++) for (let j = -1; j * hr < yb + hr; j++) { const cx = i * px, cy = j * hr + (i % 2 ? hr / 2 : 0); x.fillStyle = tons2[(i * 7 + j * 13 + ((i * j) % 5)) & 3]; x.beginPath(); x.moveTo(cx - r0 * 0.94, cy); x.lineTo(cx - r0 * 0.47, cy - hr * 0.47); x.lineTo(cx + r0 * 0.47, cy - hr * 0.47); x.lineTo(cx + r0 * 0.94, cy); x.lineTo(cx + r0 * 0.47, cy + hr * 0.47); x.lineTo(cx - r0 * 0.47, cy + hr * 0.47); x.closePath(); x.fill(); }
      x.restore();
      const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; tx.anisotropy = 4; // (rendue avec le décor : MODELES.dispose, quand la scène le remplace)
      const m = new T.Mesh(new T.PlaneGeometry(W, D), suivreEnv(new T.MeshStandardMaterial({ map: tx, roughness: 0.86, metalness: 0 }))); m.rotation.x = -Math.PI / 2; m.position.set(W / 2, -0.05, D / 2); m.receiveShadow = true; m.userData.nom = 'sol';
      return m;
    }
    // une pièce de MEUBLES (src/meubles.js : { geo, col, m }) → cuite et posée
    function partieMB(q) { return { c: cuire([{ mesh: new T.Mesh(q.geo, matB(q.col)), M: new T.Matrix4() }], {}), M: q.m ? q.m.clone() : new T.Matrix4() }; }

    // ─── le décor entier ; c : le contexte de la scène (LAY, K, W, H, wz, wy, wd, SY, CY, crans) ───
    // rend { g (le groupe : décor fusionné, halos, ciel), dessusY, dessusZ (le dessus de l'étal : l'écureuil), U, lumieres : [{ x, y, z, col, k, d }]
    //        (huit au plus, posées par la scène ; elles s'allument le soir), postes : la place de chaque ami de la forêt }
    function decor(c) {
      const { LAY, K, W, H } = c, U = 29 * K, Hm = c.wy(LAY.murH), parts = [], hs = [], lum = [], HP = Math.PI / 2, MB = typeof MEUBLES !== 'undefined' ? MEUBLES : null;
      const pose = (nom, o) => { const ck = cuitModele(nom, o.t, o.lueur); if (ck) parts.push({ c: ck, M: matriceDe(o, U) }); return ck; };
      const main = (geo, hex, o, lueur) => { parts.push(piece(geo, hex, o, lueur)); }; // une pièce faite main (en unités du monde)
      const tapis = (x, z, w, d) => { // le tapis tissé du coin salon : un fond crème, des bandes d'automne, les franges aux deux bouts
        main(new T.BoxGeometry(w, 0.5, d), '#EAD7B4', { x, y: 0.25, z }); const bandes = ['#C8552A', '#E8B33A', '#7A9A3A', '#E8B33A', '#C8552A'], bw = w / (bandes.length * 2 + 1);
        bandes.forEach((col, i) => main(new T.BoxGeometry(bw, 0.6, d - 2 * K), col, { x: x - w / 2 + bw * (2 * i + 1.5), y: 0.3, z }));
        for (const sx of [-1, 1]) for (let j = 0; j < 7; j++) main(new T.BoxGeometry(2.2 * K, 0.4, 0.5 * K), '#D9C49E', { x: x + sx * (w / 2 + 1.1 * K), y: 0.2, z: z - d / 2 + d * (j + 0.5) / 7 });
      };
      const halo = (x, y, z, col, r, a, vac) => hs.push({ x, y, z, col, r: r * K, a, vac });
      const lumiere = (x, y, z, col, k, d) => lum.push({ x, y, z, col, k, d: d || 150 * K });
      const zDev = c.wz(LAY.devanture.y), zBord = c.wz(LAY.trottoir.bord), zFin = c.wd(H + 60 - LAY.murH), porte = LAY.devanture.porte, cr = c.crans;
      // ── le mur du fond : la fenêtre, le mur, le passe-plat, la porte ; le torchis crème et le chêne (recette « halle »), des pilastres aux raccords,
      //    les poutres faites main (la sablière, une croix de Saint-André au mur plein)
      const sy = Hm / (4 * U), pw = W / 4, sx = pw / (4 * U), p = LAY.porte;
      pose('wall_window_open', { x: pw * 0.5, z: -0.26 * U, sx, sy, t: 'halle' });
      pose('wall', { x: pw * 1.5, z: -0.26 * U, sx, sy, t: 'halle' });
      pose('wall_orderwindow', { x: pw * 2.5, z: -0.46 * U, sx, sy, t: 'halle' });
      const xg = pw * 3, sd = p.w / (1.6 * U), hPorte = 2.8 * sd * U;
      pose('wall', { x: (xg + p.x) / 2, z: -0.26 * U, sx: (p.x - xg) / (4 * U), sy, t: 'halle' });
      pose('door_A', { x: p.x, z: -0.12 * U, s: sd, t: 'chene' });
      pose('wall', { x: p.x + p.w / 2, y: hPorte, z: -0.26 * U, sx: p.w / (4 * U), sy: (Hm - hPorte) / (4 * U), t: 'halle' });
      pose('wall', { x: (p.x + p.w + W) / 2 + 1, z: -0.26 * U, sx: (W - p.x - p.w + 2) / (4 * U), sy, t: 'halle' });
      for (const x of [pw, pw * 2, pw * 3]) pose('pillar_A', { x, z: 0.1 * U, sx: 0.75, sz: 0.75, sy: Hm / (4.1 * U), t: 'chene' });
      const chene = '#5A3A24';
      main(new T.BoxGeometry(W + 4, 0.22 * U, 0.3 * U), chene, { x: W / 2, y: Hm - 0.11 * U, z: 0.15 * U }); // la sablière
      { const x0 = pw * 1.08, x1 = pw * 1.92, y0 = Hm * 0.36, y1 = Hm * 0.86, l = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0); for (const s of [-1, 1]) main(new T.BoxGeometry(l, 0.16 * U, 0.12 * U), chene, { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0.08 * U, rz: a * s }); } // la croix de Saint-André, au mur plein
      // ── les sols : les tomettes (le fournil, l'étal, la file), le parquet de chêne (la salle), le trottoir pavé
      const zBande = Math.min(zDev - 20, c.wz(LAY.file[0].y + 14 * K)), tuiles = (nom, x0, x1, z0, z1, y0, cote, o) => {
        const nx = Math.max(1, Math.round((x1 - x0) / (cote * U))), nz = Math.max(1, Math.round((z1 - z0) / (cote * U))), tx = (x1 - x0) / nx, tz = (z1 - z0) / nz;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) pose(nom, Object.assign({ x: x0 + (i + 0.5) * tx, y: y0, z: z0 + (j + 0.5) * tz, sx: tx / (4 * U), sz: tz / (4 * U) }, o));
      };
      void tuiles; // (le sol de la salle est peint : sol(), plus bas)
      parts.push({ c: quad(-40, zDev + 4, W + 40, zBord, '#C9B49A', 0), M: new T.Matrix4() }, { c: quad(-40, zBord, W + 40, zFin, '#B5A08A', -0.2), M: new T.Matrix4() });
      for (let z = zDev + 0.6 * U, r = 0; z < zBord - 0.3 * U; z += 1.15 * 0.6 * U, r++) for (let x = -8 + (r % 2) * 0.55 * 0.6 * U; x < W + 10; x += 1.9 * 0.6 * U) pose('path_A', { x, y: 0.05, z, s: 0.6, ry: (x * 7 + r * 3) % 6.3 }); // les pavés du trottoir
      // ── le fournil : le four à bois (son feu luit), des cagettes de légumes et une citrouille à la place du froid, le brasero aux châtaignes
      const f = LAY.four, sf = f.w / (2 * U);
      { const o = fourBois(f.x + f.w / 2, 1.0 * sf * U + 2, f.w, 1.9 * sf * U, sf * U); for (const q of o.pr) main(q.geo, q.col, q.o); for (const q of o.lp) main(q.geo, q.col, q.o, 1); halo(o.bouche.x, o.bouche.y, o.bouche.z, '#FF7A2A', 24, 0.6, 0.12); }
      const fr = LAY.froid; pose('crate_carrots', { x: fr.x + fr.w / 2, z: c.wz(fr.y + fr.h * 0.35), s: 0.75 }); pose('crate_potatoes', { x: fr.x + fr.w / 2, y: 0.55 * U, z: c.wz(fr.y + fr.h * 0.35), s: 0.7, ry: 0.15 });
      pose('pumpkin_orange', { x: fr.x + fr.w / 2 + 3 * K, z: c.wz(fr.y + fr.h * 0.85), s: 0.55, ry: 0.4 });
      const pl = LAY.plan, xc = pl.x + pl.w * 0.5, zc = c.wz(pl.y + pl.h * 0.5);
      { const pr = [], lp = []; braseroHD(pr, lp, xc, 0, zc, 1.15 * K); for (const q of pr) main(q.geo, q.col, q.o); for (const q of lp) main(q.geo, q.col, q.o, 1); }
      halo(xc, 0.5 * U, zc, '#FF8A3D', 18, 0.5, 0.12); lumiere(xc, 1.4 * U, zc + 6, '#FF9A4A', 60, 120 * K);
      // ── le mur : l'étagère des bocaux, le tableau, l'ardoise des prix, l'auvent rayé de l'étal, les lanternes de la porte, une guirlande de feuilles
      const et = LAY.etagere; pose('shelf_B_large_decorated', { x: et.x + et.w / 2, y: Hm * 0.6, z: 0.2, s: 0.55, t: 'chene' });
      pose('pictureframe_large_A', { x: pw * 1.62, y: Hm * 0.5, z: 0.2, s: 0.7, t: 'chene' });
      pose('menu', { x: pw * 2.18, y: Hm * 0.4, z: 0.3, s: 1.1, t: 'chene' }); // l'ardoise des prix du jour
      const C = LAY.comptoir;
      { const x0 = C.x - 6 * K, x1 = C.x + C.w + 6 * K, n = Math.max(6, Math.round((x1 - x0) / (9 * K))), sw = (x1 - x0) / n, D = 0.62 * U, a = 0.42, L2 = D / Math.cos(a), Y = Hm - 0.18 * U, yf = Y - D * Math.tan(a);
        for (let i = 0; i < n; i++) { const x = x0 + sw * (i + 0.5), col = i % 2 ? '#F6E7C8' : '#C8552A'; main(new T.BoxGeometry(sw + 0.05, 0.05 * U, L2), col, { x, y: Y - D * Math.tan(a) / 2, z: D / 2, rx: a }); main(new T.CylinderGeometry(sw / 2, sw / 2, 0.03 * U, 10, 1, false, 0, Math.PI).rotateX(HP).rotateZ(-HP), col, { x, y: yf - 0.02 * U, z: D + 0.02 * U }); }
        main(new T.CylinderGeometry(0.03 * U, 0.03 * U, x1 - x0 + 4, 6).rotateZ(HP), chene, { x: (x0 + x1) / 2, y: Y + 0.02 * U, z: 0.04 * U });
        // la guirlande de lampions, accrochée au bord de l'auvent : le fil qui pend, des lanternes de papier (ambre, citrouille, crème) qui luisent le soir
        const nl = Math.max(4, Math.round((x1 - x0) / (16 * K))), lt = ['#F2B24A', '#E8743A', '#FFE3A8'], zl = D + 0.06 * U;
        for (let i = 0; i < nl; i++) {
          const u = (i + 0.5) / nl, x = x0 + (x1 - x0) * u, y = yf - 0.16 * U - Math.sin(u * Math.PI) * 0.06 * U, r = 2.3 * K;
          main(new T.CylinderGeometry(0.12 * K, 0.12 * K, yf - y - r, 4), '#5A3A24', { x, y: (yf + y + r) / 2, z: zl });
          main(new T.CylinderGeometry(r * 0.55, r * 0.55, 0.5 * K, 8), '#5A3A24', { x, y: y + r * 1.15, z: zl });
          main(new T.SphereGeometry(r, 10, 8), lt[i % 3], { x, y, z: zl, sy: 1.22 }, 1);
          halo(x, y, zl + 1, i % 3 === 1 ? '#FF9A4A' : '#FFC070', 10, 0.75, 0.05);
        } }
      for (const x of [p.x - 9 * K, Math.min(W - 6 * K, p.x + p.w + 9 * K)]) { const z = c.wz(LAY.murH + 8 * K); pose('lantern_standing', { x, z, s: 0.75, lueur: feu }); halo(x, 0.45 * 0.75 * U, z, '#FFB060', 13, 0.8); }
      if (MB) { const n = 18, x0 = LAY.fenetre.x + LAY.fenetre.w + 6, x1 = C.x - 8 * K; for (let i = 0; i <= n; i++) { const u = i / n, x = x0 + (x1 - x0) * u, y = Hm - 0.3 * U - Math.sin(((u * 2) % 1) * Math.PI) * 5 * K; main(MB.erable().clone(), MB.MC.feuilles[i % MB.MC.feuilles.length], { x, y, z: 0.12 * U, sx: 3 * K, sy: 3 * K, sz: 0.4, rz: (i % 3 - 1) * 0.5 }); } }
      // ── l'étal : le comptoir retourné (les tiroirs côté boulanger), les fruits de saison exposés dessus, des cagettes devant, des courges au pied
      const zAv = c.wz(C.y + C.hTop + C.hFace), csx = C.w / (4 * U), csz = 0.55, csy = 1.05, zC = zAv - csz * U, dessusY = csy * U;
      pose('kitchencounter_straight_A', { x: C.x + C.w * 0.25, z: zC, ry: Math.PI, sx: csx, sy: csy, sz: csz, t: 'chene' });
      pose('kitchencounter_straight_B', { x: C.x + C.w * 0.75, z: zC, ry: Math.PI, sx: csx, sy: csy, sz: csz, t: 'chene' });
      const vx = C.x + C.w * 0.58, nv = Math.min(7, 3 + 2 * (cr.vitrine || 0)), yv = dessusY + 0.02 * U;
      [['apple', -0.55, -0.15, 0.95], ['pear', -0.22, 0.12, 0.95], ['pie', 0.12, -0.12, 0.95], ['grapes', 0.42, 0.12, 0.9], ['pumpkin-basic', 0.72, -0.1, 0.75], ['mushroom', -0.85, 0.16, 0.9], ['bread', 1.0, 0.12, 0.85]].slice(0, nv)
        .forEach(([nom, dx, dz, s]) => pose(nom, { x: vx + dx * U, y: yv, z: zC + dz * U, s, ry: dx * 3 }));
      for (const [nom, dx, s, r] of [['crate_tomatoes', -0.4, 0.62, 0.1], ['crate_lettuce', 0.2, 0.6, -0.08], ['crate', 0.78, 0.6, 0.06]]) pose(nom, { x: C.x + C.w * 0.5 + dx * U, z: zAv + 0.3 * U, s, ry: r });
      pose('pumpkin_yellow', { x: C.x + 4 * K, z: zAv + 0.2 * U, s: 0.5, ry: 0.4 }); pose('pumpkin_orange_small', { x: C.x + C.w - 2 * K, z: zAv + 0.25 * U, s: 0.6, ry: 1.2 });
      pose('lantern_standing', { x: C.x + 7 * K, y: dessusY, z: zC - 2, s: 0.45, lueur: feu }); halo(C.x + 7 * K, dessusY + 0.3 * U, zC - 2, '#FFB060', 13, 0.9); lumiere(C.x + 7 * K, dessusY + 30 * K, zC + 8, '#FFB060', 70, 150 * K);
      // ── les tables : la table ronde, deux chaises, une bougie et une petite courge au milieu
      const st = 0.8, vt = [];
      for (let i = 0; i < Math.min(cr.tables || 0, LAY.tables.length); i++) {
        const tb = LAY.tables[i], z = c.wz(tb.y); vt.push(tb);
        pose('table_round_A_small', { x: tb.x, z, s: st, t: 'chene' }); pose('candle', { x: tb.x + 3 * K, y: st * U, z: z - 2 * K, s: 0.4, lueur: feu }); pose(i % 2 ? 'pumpkin_yellow_small' : 'pumpkin_orange_small', { x: tb.x - 6 * K, y: st * U, z: z + 3 * K, s: 0.42, ry: i });
        halo(tb.x + 3 * K, st * U + 0.4 * U, z - 2 * K, '#FFB060', 12, 0.8);
        for (const s of tb.sieges) pose('chair_A', { x: s.x, z: c.wz(s.y), ry: s.dir > 0 ? HP : -HP, t: 'chene' });
      }
      if (vt.length) { const mx = vt.reduce((a, t) => a + t.x, 0) / vt.length, mz = vt.reduce((a, t) => a + c.wz(t.y), 0) / vt.length; lumiere(mx, 55 * K, mz, '#FFB060', 80, 190 * K); }
      // ── le bar : les éléments de cuisine contre la devanture, les tabourets, un pot de miel, des bocaux de confiture, des tasses de chocolat
      if ((cr.bar || 0) > 0) {
        const b = LAY.bar, w = b.x1 - b.x0, nb = Math.max(1, Math.round(w / (2 * U))), zb = c.wz(b.y - 2 * K) + 4 * K, n = Math.min(4, cr.bar + 1);
        for (let i = 0; i < nb; i++) pose(i % 2 ? 'kitchencounter_straight_A' : 'kitchencounter_straight_B', { x: b.x0 + (i + 0.5) * w / nb, z: zb, sx: w / nb / (2 * U), sz: 0.42, sy: 0.92, t: 'chene' });
        for (const s of LAY.sieges) if (s.zone === 'bar' && s.rang < n) pose('chair_stool', { x: s.x, z: c.wz(s.y), t: 'chene' });
        for (const [nom, u, s] of [['honey', 0.08, 0.7], ['jar_A_large', 0.16, 0.3], ['mug', 0.5, 0.8], ['jar_B_medium', 0.84, 0.32]]) pose(nom, { x: b.x0 + w * u, y: 0.92 * U, z: zb, s });
        pose('candle_thin', { x: b.x0 + w * 0.93, y: 0.92 * U, z: zb, s: 0.6, lueur: feu }); halo(b.x0 + w * 0.93, 0.92 * U + 0.6 * U, zb, '#FFB060', 11, 0.85);
      }
      // ── le coin salon : la banquette, le tapis rayé, la table basse et sa tarte, la lampe, le fauteuil, l'ours en peluche
      if ((cr.banquette || 0) > 0) {
        const bq = LAY.banquette; pose('couch_pillows', { x: bq.x, z: c.wz(bq.y) - 3 * K, s: 54 * K / (3 * U), t: 'rouille' });
        if (cr.banquette >= 2) {
          const t = bq.tapis, tt = bq.table; tapis(t.x, c.wz(t.y), t.w, c.wd(t.h));
          pose('table_low', { x: tt.x, z: c.wz(tt.y), s: 0.6, t: 'chene' }); pose('pie', { x: tt.x, y: 0.28 * U, z: c.wz(tt.y), s: 0.7 });
        }
        if (cr.banquette >= 3) {
          const l = bq.lampe, zl = c.wz(l.y); pose('lamp_standing', { x: l.x, z: zl, s: 0.75, t: 'ocre' }); halo(l.x, 2.3 * 0.75 * U, zl, '#FFC070', 20, 0.75, 0.02); lumiere(l.x, 2.2 * 0.75 * U, zl + 4, '#FFC070', 60, 140 * K);
          const fa = LAY.sieges.find((s) => s.id === 'fauteuil'); if (fa) pose('armchair_pillows', { x: fa.x, z: c.wz(fa.y), ry: HP, s: 0.62, t: 'rouille' });
          pose('bear', { x: bq.x + 18 * K, y: 0.2 * U, z: c.wz(bq.y) - 2 * K, s: 0.5, ry: -0.4 });
        }
      }
      // ── la terrasse : ses tables comme dans la salle ; la devanture de bois : une barrière basse, des bottes de paille, des citrouilles
      for (let i = 0; i < Math.min(cr.terrasse || 0, LAY.terrasse.length); i++) {
        const tb = LAY.terrasse[i], z = c.wz(tb.y); pose('table_round_A_small', { x: tb.x, z, s: st, t: 'chene' }); pose('candle', { x: tb.x, y: st * U, z, s: 0.4, lueur: feu }); halo(tb.x, st * U + 0.4 * U, z, '#FFB060', 12, 0.8);
        for (const s of tb.sieges) pose('chair_A', { x: s.x, z: c.wz(s.y), ry: s.dir > 0 ? HP : -HP, t: 'chene' });
      }
      const sg = 0.3, lg = 4 * sg * U, barriere = (x0, x1) => { const n = Math.max(1, Math.round((x1 - x0) / lg)), w = (x1 - x0) / n; for (let i = 0; i < n; i++) pose('fence', { x: x0 + (i + 0.5) * w, z: zDev, sx: w / (4 * U), sy: sg, sz: sg, t: 'chene' }); for (let i = 0; i <= n; i++) pose('fence_pillar', { x: x0 + i * w, z: zDev, s: sg * 1.1, t: 'chene' }); };
      barriere(-4, porte.x0 - 6); barriere(porte.x1 + 6, W + 4);
      if (MB) for (const [x, r] of [[porte.x0 - 14 * K, 0.1], [porte.x1 + 14 * K, -0.12]]) for (const q of MB.partsBotte(x, 0, zDev + 9 * K, 15 * K, 9 * K, 11 * K, r)) parts.push(partieMB(q));
      pose('pumpkin_orange', { x: porte.x0 - 12 * K, y: 9 * K, z: zDev + 9 * K, s: 0.5, ry: 0.5 }); pose('pumpkin_yellow_small', { x: porte.x1 + 9 * K, y: 9 * K, z: zDev + 10 * K, s: 0.62 });
      // ── la place du village : les arbres roux, le réverbère, le banc, un étal de fruits, des cagettes, le chemin de pierres
      const zr = c.wz(LAY.trottoir.bord + 14 * K), zr2 = c.wz(LAY.trottoir.bord + 34 * K);
      for (let x = -10; x < W + 20; x += 1.9 * 0.6 * U) pose('path_B', { x, y: 0.05, z: zr2, s: 0.6, ry: x * 0.3 });
      pose('tree_pine_orange_large', { x: W * 0.93, z: zr, s: 0.45 }); pose('tree_pine_yellow_medium', { x: W * 0.05, z: zr + 4 * K, s: 0.45 }); pose('tree_pine_orange_medium', { x: W * 0.62, z: zr2 + 18 * K, s: 0.42, ry: 2 });
      pose('post_lantern', { x: W * 0.52, z: zr, s: 0.5, ry: -HP, lueur: feu }); halo(W * 0.52 + 0.7 * 0.5 * U, 3.0 * 0.5 * U, zr, '#FFB060', 22, 0.9); lumiere(W * 0.52, 3.2 * 0.5 * U, zr + 10, '#FFB060', 80, 170 * K);
      pose('bench', { x: W * 0.14, z: zr2 + 2 * K, s: 0.42, t: 'chene' });
      pose('display-fruit', { x: W * 0.32, z: zr, s: 0.5 }); pose('crate_onions', { x: W * 0.4, z: zr + 4 * K, s: 0.5, ry: 0.3 }); pose('barrel', { x: W * 0.76, z: zr + 2 * K, s: 0.55 });
      for (const [u, dz] of [[0.25, 8], [0.84, 6]]) pose('pumpkin_orange_small', { x: W * u, z: zr + dz * K, s: 0.5, ry: u * 7 });
      const geo = geometrie(fusionner(parts)), m = new T.Mesh(geo, mat()); m.castShadow = true; m.receiveShadow = true; m.userData.nom = 'decor';
      const g = new T.Group(); g.userData.nom = 'marche3'; g.add(m);
      g.add(sol(W, zDev + 4, zBande)); // le sol peint : les tomettes, le parquet de chêne (un appel de dessin)
      if (hs.length) g.add(halos(hs, c.SY, c.CY));
      const ciel = new T.Mesh(new T.PlaneGeometry(W + 80, Hm + 30), new T.MeshBasicMaterial({ map: texCiel(), fog: false })); ciel.position.set(W / 2, (Hm + 30) / 2 - 10, -40); g.add(ciel); // le ciel d'automne derrière les ouvertures
      // les places de l'équipe (x, z monde, cap) : à leur poste
      const b = LAY.bar;
      const postes = [
        { x: xc + 22 * K, z: zc + 4 * K, ry: -HP - 0.3 }, // Gaspard l'écureuil : au brasero
        { x: f.x - 2 * K, z: 2.5 * sf * U + 10 * K, ry: 0.4 }, // Rosalie la hérissonne : le pressoir, près du four
        { x: f.x + f.w * 0.5, z: 2.35 * sf * U + 16 * K, ry: Math.PI * 0.82 }, // Madame Blaireau : au four à bois
        { x: et.x + et.w / 2, z: c.wz(LAY.murH + 14 * K), ry: 0.3 }, // Hortense la chouette : devant l'étagère
        { x: Math.min(W - 12 * K, b.x1 + 16 * K), z: c.wz(b.y) + 2 * K, ry: -HP }, // Bruno l'ours : au bout du bar
        { x: C.x + C.w * 0.82, z: c.wz(LAY.boulanger.y) - 2 * K, ry: 0 }, // Céleste la biche : à l'étal des paniers
        { x: W * 0.06, z: zDev + 16 * K, ry: 0.6 }, // Roux le renard : à la terrasse, ses marrons glacés
        { x: f.x + f.w + 12 * K, z: c.wz(LAY.lanes[0]) - 4 * K, ry: -HP - 0.5 }, // Sacha le marcassin : le moulin à épices, à droite du four
      ];
      return { g, dessusY, dessusZ: zC, lumieres: lum.slice(0, 8), postes, U };
    }
    const HP2 = Math.PI / 2;
    // le four à bois de la Halle, en dôme (fait main, en pièces de Three) : le socle de pierre et sa réserve de bûches, le dôme de terre cuite
    // cerclé de briques, la bouche en arche (sa voûte de pierre claire, les braises et les flammes qui luisent), la cheminée ; centré en x,
    // posé contre le mur (z : le milieu de sa profondeur dp) ; u : l'unité du four (sa largeur w fait ~2 u). Rend { pr, lp, bouche }
    function fourBois(x, z, w, dp, u) {
      const pr = [], lp = [], add = (l, geo, col, o) => l.push({ geo, col, o }), hp = 0.62 * u, R = w * 0.47, zs = dp * 0.46 / R, yd = hp + 0.07 * u, zf = z + dp / 2;
      add(pr, new T.BoxGeometry(w, hp, dp), '#A89580', { x, y: hp / 2, z }); add(pr, new T.BoxGeometry(w + 0.08 * u, 0.07 * u, dp + 0.08 * u), '#857261', { x, y: hp + 0.035 * u, z });
      for (const [k, yy] of [[0, 0.22], [1, 0.45]]) add(pr, new T.BoxGeometry(w + 0.01 * u, 0.025 * u, dp + 0.01 * u), '#968370', { x, y: hp * yy + k * 0.01, z }); // les assises de pierre
      add(pr, new T.BoxGeometry(w * 0.62, hp * 0.5, 0.06 * u), '#3A2A20', { x, y: hp * 0.3, z: zf - 0.02 * u }); // la réserve de bois, sous le four
      for (const [dx, yy] of [[-0.16, 0.13], [0.0, 0.13], [0.16, 0.13], [-0.08, 0.26], [0.08, 0.26]]) { add(pr, new T.CylinderGeometry(0.075 * u, 0.075 * u, 0.12 * u, 7).rotateX(HP2), '#7B4A2A', { x: x + dx * w, y: hp * yy * 1.4, z: zf - 0.02 * u }); add(pr, new T.CircleGeometry(0.06 * u, 7), '#D9A066', { x: x + dx * w, y: hp * yy * 1.4, z: zf + 0.045 * u }); }
      add(pr, new T.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#B86A44', { x, y: yd, z, sy: 0.82, sz: zs }); // le dôme
      add(pr, new T.TorusGeometry(R * 1.0, 0.06 * u, 6, 28).rotateX(HP2), '#8E4A2E', { x, y: yd + 0.03 * u, z, sz: zs }); // le cercle de briques
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.3, r = R * (0.55 + 0.25 * ((i * 7) % 3) / 2); add(pr, new T.BoxGeometry(0.16 * u, 0.06 * u, 0.04 * u), '#A0573A', { x: x + Math.cos(a) * r, y: yd + Math.sqrt(Math.max(0, R * R - r * r)) * 0.82 + 0.01 * u, z: z + Math.sin(a) * r * zs, ry: -a }); } // quelques briques sur le dôme
      const rb = R * 0.42, yb = yd, zb = z + R * zs - 0.12 * u; // la bouche : un demi-disque sombre dans une voûte de pierre claire, la sole devant
      add(pr, new T.CylinderGeometry(rb, rb, 0.3 * u, 14, 1, false, -HP2, Math.PI).rotateX(HP2), '#26170F', { x, y: yb, z: zb + 0.02 * u });
      add(pr, new T.TorusGeometry(rb * 1.08, 0.07 * u, 6, 14, Math.PI), '#E2D2B4', { x, y: yb, z: zb + 0.17 * u });
      add(pr, new T.BoxGeometry(rb * 2.6, 0.05 * u, 0.22 * u), '#857261', { x, y: yb - 0.01 * u, z: zb + 0.24 * u });
      for (const [dx, r, col, sy] of [[-0.35, 0.09, '#FF7A2A', 1.6], [0, 0.12, '#FFB03A', 2.1], [0.32, 0.08, '#FF8A2A', 1.5], [-0.12, 0.07, '#FFD36A', 1.4], [0.18, 0.07, '#FF6A1A', 1.2]]) add(lp, new T.SphereGeometry(r * u, 7, 5), col, { x: x + dx * rb, y: yb + r * u * 0.5, z: zb + 0.1 * u, sy }); // le feu
      add(pr, new T.CylinderGeometry(0.11 * u, 0.13 * u, 0.62 * u, 8), '#8E4A2E', { x: x + R * 0.38, y: yd + R * 0.82 * 0.78 + 0.2 * u, z: z - R * zs * 0.35 }); // la cheminée
      add(pr, new T.CylinderGeometry(0.17 * u, 0.15 * u, 0.07 * u, 8), '#5A3A2A', { x: x + R * 0.38, y: yd + R * 0.82 * 0.78 + 0.53 * u, z: z - R * zs * 0.35 });
      return { pr, lp, bouche: { x, y: yb + rb * 0.35, z: zb + 0.3 * u } };
    }
    // le brasero du marchand de marrons (la même recette que MEUBLES, en pièces de Three) : pr les parts fixes, lp les braises (qui luisent)
    function braseroHD(pr, lp, x, y, z, s) {
      const fer = '#3A302C', add = (l, geo, col, o) => l.push({ geo, col, o });
      for (let k = 0; k < 3; k++) { const a = k * Math.PI * 2 / 3 + 0.4; add(pr, new T.CylinderGeometry(0.6 * s, 0.5 * s, 7 * s, 5).translate(0, 3.5 * s, 0), fer, { x: x + Math.cos(a) * 4.6 * s, y, z: z + Math.sin(a) * 4.6 * s }); }
      add(pr, new T.CylinderGeometry(7 * s, 4.4 * s, 3.4 * s, 12).translate(0, 1.7 * s, 0), fer, { x, y: y + 6.2 * s, z }); add(pr, new T.TorusGeometry(6.9 * s, 0.5 * s, 4, 14).rotateX(Math.PI / 2), '#5A4A42', { x, y: y + 9.6 * s, z });
      for (const [dx, dz] of [[-2.6, -1], [0, 1.6], [2.6, -0.4], [-0.8, -2.4], [1.4, 2.8], [-3, 1.8]]) add(pr, new T.SphereGeometry(1.05 * s, 6, 5).scale(1, 0.78, 1), dx > 0 ? '#7B4A2A' : '#5E3720', { x: x + dx * s, y: y + 10.2 * s, z: z + dz * s });
      for (const [dx, dz] of [[-1.6, 0], [1.4, -1.4], [0.6, 2], [-2.8, -2.2], [3, 1.2]]) add(lp, new T.SphereGeometry(1.3 * s, 5, 4).scale(1, 0.6, 1), '#FF7A2A', { x: x + dx * s, y: y + 9.1 * s, z: z + dz * s });
    }
    // ─── les apparitions (qualité haute) : le champignon (le cèpe du pack, cuit, qui luit un peu) ; la feuille d'or et la châtaigne sont les mêmes partout ───
    function apparition(type, U) {
      try {
        const geo = type === 'champignon' ? geoCentree('mushroom', null, 0.35, 0.8 * U) : null;
        if (geo) { const g = new T.Group(), m = new T.Mesh(geo, mat()); m.castShadow = true; g.add(m); return g; }
      } catch (e) { rater(e); }
      return null;
    }
    // préparer en avance (après le préchargement) : les prototypes des neuf sortes, de l'équipe et de la marchande, les clips
    function preparer() { if (echec || !(typeof HDM !== 'undefined' && HDM.pret('marche'))) return false; try { for (const s of SORTES.concat(EQUIPE3, ['patronne'])) proto(s); clips(); return true; } catch (e) { rater(e); return false; } }
    // ─── la lumière de la Halle (src/scene.js, eclairerHD) : le jour doré d'un après-midi d'automne, qui tourne au soir avec l'heure ; les
    //     lanternes s'allument le soir ; tout baisse quand le ×6 s'endort (AMB). Rend le niveau des lampes (pour les décors animés) ───
    const PH = { jour: { ciel: '#FFF6E8', sol: '#B08A68', k: 1.25, soleil: '#FFE6C4', ks: 2.3, lampes: 0, env: 0.3 }, soir: { ciel: '#FFB27E', sol: '#5A3A30', k: 0.8, soleil: '#FF9E5E', ks: 1.15, lampes: 0.8, env: 0.2 }, nuit: { ciel: '#7E86C8', sol: '#2E2638', k: 0.6, soleil: '#9FB4FF', ks: 0.5, lampes: 1, env: 0.1 } };
    let _ca = null, _cb = null;
    function eclairer(E, L) {
      if (!_ca) { _ca = new T.Color(); _cb = new T.Color(); }
      const h = E.hour, a = L.AMB, t = E.t;
      // les phases et leurs fondus : le jour jusqu'à 16 h, le soir de 17 h à 19 h 30, la nuit après 21 h (et avant 6 h 30)
      let A = PH.jour, B = PH.jour, k = 0;
      if (h < 6.5 || h >= 21) { A = B = PH.nuit; } else if (h < 8) { A = PH.nuit; B = PH.jour; k = (h - 6.5) / 1.5; } else if (h < 16) { A = B = PH.jour; } else if (h < 17) { A = PH.jour; B = PH.soir; k = h - 16; } else if (h < 19.5) { A = B = PH.soir; } else { A = PH.soir; B = PH.nuit; k = (h - 19.5) / 1.5; }
      const mx = (u, v) => u + (v - u) * k;
      L.hemi.color.set(A.ciel).lerp(_ca.set(B.ciel), k); L.hemi.groundColor.set(A.sol).lerp(_cb.set(B.sol), k); L.hemi.intensity = mx(A.k, B.k) * (0.5 + 0.5 * a);
      L.dir.color.set(A.soleil).lerp(_ca.set(B.soleil), k); L.dir.intensity = mx(A.ks, B.ks) * (0.55 + 0.45 * a);
      const niv = mx(A.lampes, B.lampes);
      ENV.k = mx(A.env, B.env) * (0.55 + 0.45 * a); // (l'ambiance de la pièce, phase par phase ; elle baisse aussi quand le ×6 s'endort)
      L.lampes.forEach((l, i) => { l.intensity = (l.userData.k || 0) * (0.06 + 0.94 * niv) * (0.3 + 0.7 * a) * (0.9 + 0.06 * Math.sin(t * 7 + i * 1.7) + 0.04 * Math.sin(t * 19 + i * 2.3)); });
      const hm = haloMat(); hm.uniforms.uT.value = t; hm.uniforms.uK.value = (0.12 + 0.88 * niv) * (0.3 + 0.7 * a);
      mat().userData.u.uLueur.value = (0.35 + 0.65 * niv) * (0.4 + 0.6 * a) * (0.95 + 0.05 * Math.sin(t * 9));
      const R0 = L.riche; // le rendu riche (haute, moyenne) : l'ambiance vient surtout de la pièce (PMREM), comme dans la boulangerie ; le ciel ne fait que teinter
      if (R0 && R0.actif) { R0.envK = R0.kEnv * L.hemi.intensity / 1.3 * (1 - 0.72 * niv); L.hemi.intensity *= R0.kHemi; L.dir.intensity *= R0.kDir; } // (le soir, la pièce s'assombrit : les lanternes prennent le relais)
      if (L.post) { L.post.mat.uniforms.chaud.value = ENV.chaud * (R0 ? R0.chaud : 0.55) * (1 - 0.5 * niv); L.post.mat.uniforms.expo.value = 0; } // (pas d'ACES : la lumière du jour de la boutique)
      return Math.max(0.2, niv);
    }
    // l'ambiance de la scène en mode HD (src/scene.js, basculerHD) : pas de brouillard de nuit, l'environnement de la pièce (le rendu riche), une exposition douce
    const ambianceHD = { fog: null, clear: '#F2D9B4', exposition: 1, ton: false, env: true }; // (ton : false, sans ACES)
    return { pret, decor, acteur, jouer, liberer, apparition, preparer, rater, mat, haloMat, eclairer, ambianceHD, EQUIPE3, DEFS, DEG, PH, ENV, get echec() { return echec; } };
  })();

  // ─── l'écran : la fenêtre sur la scène ───
  let style = null;
  function feuille() {
    if (style || typeof document === 'undefined') return; style = document.createElement('style'); style.id = 'mc-boutique-style';
    style.textContent = `body.mc-boutique #tiroir, body.mc-boutique #scene-wrap > :not(canvas), body.mc-boutique #indice, body.mc-boutique #haut, body.mc-boutique #onglets, body.mc-boutique #corps > :not(#scene-wrap) { visibility: hidden; }
html:has(body.mc-boutique), body.mc-boutique { overflow: hidden; overscroll-behavior: none; }
#marche.mc-boutique { background: transparent; }
#marche.mc-boutique > .at-haut { background: var(--ht-fond); }
#marche.mc-boutique > .pq-solde { background: var(--ht-fond); margin: 0; padding-bottom: 10px; border-radius: 0 0 20px 20px; position: relative; z-index: 2; transition: border-radius .2s ease-out; }
#marche.mc-boutique[data-tiroir="haut"] > .pq-solde { border-radius: 0; }
#marche.mc-boutique > .pq-scene { flex: 0 0 auto; height: clamp(220px, 38vh, 340px); margin: -20px 0 -22px; border-radius: 0; background: transparent; box-shadow: none; }
#marche.mc-boutique > .pq-scene > canvas { visibility: hidden; }
#marche.mc-boutique > .pq-scene > .pq-bandeaux { bottom: 30px; }
#marche.mc-boutique > .pq-scene ~ * { background: var(--ht-fond); }`;
    document.head.appendChild(style);
  }

  // ═══ les apparitions à attraper (la feuille d'or, la châtaigne, le champignon) : elles traversent la scène en 6 à 10 s ; la feuille
  //     tombe en virevoltant, la châtaigne roule, le champignon sautille ═══
  const APP = []; let idApp = 1, courant = null;
  function objetApparition(type) {
    const T = THREE, M = MODELES;
    if (SCENE.hd3 && type === 'champignon') { const o = HD.apparition(type, 29 * (VIE.K || 1)); if (o) { o.userData.hd = true; return o; } }
    const g = new T.Group(), P = M.part;
    if (type === 'chataigne') { // la châtaigne vernie, son chapeau clair, et sa bogue ouverte derrière
      g.add(M.maille([P(M.sphere(8, 12), '#7B4A2A', { y: 8, sx: 1.08, sz: 0.9 }), P(M.sphere(5, 10), '#E9D5BC', { y: 2.6, sy: 0.5 }), P(M.cone(1.4, 3, 6), '#5E3720', { y: 15.2 }), P(M.sphere(2.4, 8), '#B07A4A', { x: -3, y: 11, z: 5, sz: 0.4 })]));
      const bogue = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; bogue.push(P(M.cone(1.2, 5, 4), '#8DB33A', { x: Math.cos(a) * 8, y: 8 + Math.sin(a) * 6, z: -6, rz: a - Math.PI / 2 })); } g.add(M.maille(bogue));
    } else if (type === 'champignon') { // le cèpe : le pied blanc, le chapeau brun qui brille, son petit frère
      const ch = M.maille([P(M.cylindre(3.4, 4.6, 9, 10), '#F4E3C3'), P(M.sphere(8.4, 12), '#9C5A2E', { y: 9, sy: 0.6 }), P(M.cylindre(1.6, 2, 4, 8), '#F4E3C3', { x: 7, z: 2 }), P(M.sphere(3.6, 10), '#C98A3A', { x: 7, y: 4, z: 2, sy: 0.6 }), P(M.sphere(1.4, 6), '#FFFFFF', { x: -3, y: 13.4, z: 3, sy: 0.4 })]);
      ch.material = new T.MeshLambertMaterial({ vertexColors: true, emissive: '#E8A93A', emissiveIntensity: 0.25 }); g.add(ch);
    } else { // la feuille d'or : une grande feuille d'érable qui luit, sa queue
      const fe = M.maille([P(MEUBLES.erable(), '#F2C14A', { sx: 12, sy: 12, sz: 1.4 }), P(M.boiteSimple(0.8, 9, 1.6), '#B8862F', { y: -15 })], { ombre: false });
      fe.material = new T.MeshLambertMaterial({ vertexColors: true, emissive: '#E8B33A', emissiveIntensity: 0.55, side: T.DoubleSide }); g.add(fe);
    }
    return g;
  }
  function apparition(type, duree) { // une apparition qui traverse la salle, d'un bord à l'autre (en duree s si donnée, sinon 6 à 10 s) ; rend son id (null : pas d'écran ouvert)
    const tr = SCENE.trois, L = VIE.LAY; if (!tr || !courant || !L) return null; type = TYPES_APP.includes(type) ? type : 'feuille';
    const W = VIE.W, K = VIE.K, sens = Math.random() < 0.5 ? 1 : -1, o = objetApparition(type); if (!o) return null;
    const cad = courant.vue.cadre, bas = Math.min(L.devanture.y - 20 * K, (cad.bas ? cad.bas - cad.haut : L.T) - 40 * K), y0 = L.murH + 36 * K + Math.random() * Math.max(10, bas - L.murH - 46 * K);
    const a = { id: idApp++, type, o, t: 0, duree: duree > 0 ? duree : 6 + Math.random() * 4, x0: sens > 0 ? -30 * K : W + 30 * K, x1: sens > 0 ? W + 30 * K : -30 * K, z: (y0 - L.murH) / Math.sin(52 * Math.PI / 180), haut: (type === 'feuille' ? 52 : 26) * K, ph: Math.random() * 6, sens, ech: o.userData.hd ? 1 : K * 1.1 };
    o.scale.setScalar(a.ech); tr.scene.add(o); a.nait = heureApp(); APP.push(a); majApp(a, 0); return a.id;
  }
  // le chemin d'une apparition à l'instant t (sans rien bouger) : sa position monde, en p ; ce que fait majApp et ce que vise le doigt
  function chemin(a, t, p) {
    const u = Math.min(1, Math.max(0, t) / a.duree), K = VIE.K || 1, x = a.x0 + (a.x1 - a.x0) * u;
    if (a.type === 'feuille') { p.x = x + Math.sin(t * 1.8 + a.ph) * 14 * K; p.y = a.haut + Math.sin(t * 3.6 + a.ph) * 6 * K; p.z = a.z + Math.sin(t * 0.9 + a.ph) * 8 * K; }
    else if (a.type === 'chataigne') { p.x = x; p.y = a.haut * 0.3 + Math.abs(Math.sin(t * 4 + a.ph)) * 10 * K; p.z = a.z; }
    else { p.x = x; p.y = a.haut * 0.3 + Math.abs(Math.sin(t * 3.4 + a.ph)) * 14 * K; p.z = a.z + Math.sin(t * 0.9 + a.ph) * 6 * K; }
    return u;
  }
  const _pa = { x: 0, y: 0, z: 0 };
  const heureApp = () => (typeof HORLOGE !== 'undefined' && HORLOGE.maintenant ? HORLOGE.maintenant() : Date.now()); // l'heure de sa naissance : celle des règles (qq.now)
  function majApp(a, dt) {
    (a.traine || (a.traine = [])).push(a.t); if (a.traine.length > 3) a.traine.shift(); a.t += dt; const u = chemin(a, a.t, _pa), o = a.o; o.position.set(_pa.x, _pa.y, _pa.z); // (a.traine : où elle était aux trois images d'avant, que le joueur a pu viser : viser)
    if (a.type === 'feuille') o.rotation.set(0.5 + Math.sin(a.t * 1.8 + a.ph) * 0.5, a.t * 1.6, Math.sin(a.t * 1.8 + a.ph) * 0.7); // elle tombe en se balançant, et tourne sur elle-même
    else if (a.type === 'chataigne') o.rotation.set(0, a.sens > 0 ? 0.4 : -0.4, -a.sens * a.t * 3.2); // elle roule, en rebondissant un peu
    else { const b = Math.abs(Math.sin(a.t * 3.4 + a.ph)); o.rotation.set(0, a.sens > 0 ? 0.5 : -0.5, Math.sin(a.t * 3.4 + a.ph) * 0.15); o.scale.set(a.ech, a.ech * (0.9 + 0.1 * b), a.ech); } // le champignon sautille
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
    return APP.map((a) => { const p = tr.ecran(a.o.position.x, a.o.position.y + 10 * K, a.o.position.z); return { id: a.id, type: a.type, x: Math.round(p.x), y: Math.round(p.y), r: Math.round(Math.max(32, 32 * K)) }; }); // (une cible qui bouge : un rayon de 32 px au moins)
  }
  const _pe = { x: 0, y: 0, z: 0 };
  function ecranApp(a, t) { chemin(a, t, _pe); return SCENE.trois.ecran(_pe.x, _pe.y + 10 * (VIE.K || 1), _pe.z); } // le centre de touche à l'instant t de sa traversée, en pixels
  function retirer(id) { const a = APP.find((x) => x.id === id); if (!a) return false; retirerApp(a); return true; } // une apparition qui s'échappe : elle s'efface, sans éclat
  function attraper(id) {
    const a = APP.find((x) => x.id === id); if (!a) return false;
    exploser({ x: a.o.position.x, y: a.o.position.y + 10 * (VIE.K || 1), z: a.o.position.z }, a.type === 'feuille' ? '#FFD45A' : a.type === 'chataigne' ? '#E8A93A' : '#F4E3C3'); retirerApp(a); return true;
  }

  // ═══ l'API des activités (src/activites.js, src/evenement.js : la phase « Brancher » s'en sert) ═══
  // acteurs() : [{ id, sorte, role ('client'|'apprenti'|'patronne'), etat ('entre'|'file'|'assis'|'sort'), x, y, l, h }] ; x, y : le haut de la
  // tête, en pixels de la fenêtre ; l, h : la largeur et la hauteur à l'écran. Seulement ce qui se voit dans la fenêtre de l'écran.
  const acteurs = () => (courant && SCENE.acteursEv ? SCENE.acteursEv() : []);
  const client = (id) => acteurs().find((a) => a.id === id && a.role === 'client') || null;
  const numero = (id) => (typeof id === 'string' && /^c\d+$/.test(id) ? +id.slice(1) : typeof id === 'number' ? id : null);
  const servir = (id) => { const n = numero(id); return n != null && !!courant && VIE.congedier(n, 'content'); }; // il repart content : il fête son achat, puis la sortie
  const entrer = (sorte) => { if (!courant || !VIE.accueillir) return null; const n = VIE.accueillir(SORTES.includes(sorte) ? sorte : null); return n == null ? null : 'c' + n; }; // un enfant de la file des règles : il entre et attend qu'on le serve
  const fache = (id) => { const n = numero(id); return n != null && !!courant && VIE.congedier(n, 'fache'); }; // il repart sans payer
  let cbToucher = null;
  const surToucher = (cb) => { cbToucher = typeof cb === 'function' ? cb : null; };
  // l'apparition visée par un doigt en x, y (la plus proche, rayon d'au moins 32 px), ou null ; une cible qui file : on mesure la distance
  // au bout de chemin des 0,35 dernières secondes (ou depuis trois images, 2,5 s au plus, si c'est plus long : à 1 image/s, la traversée au temps réel saute de 80 px par image, et le toucher arrive une ou deux images après ce que le joueur a vu)
  function viser(x, y) {
    let best = null, bd = 1e9; const r = Math.max(32, 32 * (VIE.K || 1));
    if (SCENE.trois) for (const a of APP) {
      const p1 = ecranApp(a, a.t), x1 = p1.x, y1 = p1.y, p0 = ecranApp(a, Math.min(a.t - 0.35, Math.max(a.t - 2.5, Math.min(a.t, ...(a.traine || []))))), vx = x1 - p0.x, vy = y1 - p0.y, l2 = vx * vx + vy * vy, k = l2 > 0 ? Math.max(0, Math.min(1, ((x - p0.x) * vx + (y - p0.y) * vy) / l2)) : 1;
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
  const ambiance = (o) => { const k = o && o.actif != null ? Math.max(0, Math.min(1, +o.actif || 0)) : 1; if (SCENE.ambiance) SCENE.ambiance(k); return k; }; // 0 : la lumière baisse, le marché s'assoupit

  // ─── la « scène » de l'écran de l'événement : frame, redim, vente, fete, coup, equipe, detruire… ───
  function scene(cv, X) {
    if (!actif(cv)) return null;
    const reel = X && X.st ? X.st() : null, q0 = X && X.q ? X.q() : null; if (!reel || !q0) return null;
    const el = cv.closest('#marche'), fenetre = cv.parentElement, can = document.getElementById('scene');
    const st = etatVue(reel, q0, q0.now || Date.now()), vue = vueDe(reel);
    feuille(); el.classList.add('mc-boutique'); document.body.classList.add('mc-boutique');
    let tCadre = 0, fini = false, cleGarde = vue.garde ? vue.garde.cle : '';
    function redim() { // la fenêtre de l'écran, en px du canvas de la boutique : la scène y descend
      if (!fenetre || !can) return; const f = fenetre.getBoundingClientRect(), c = can.getBoundingClientRect(), dessus = fenetre.previousElementSibling; if (!c.height) return;
      const haut = Math.max(0, Math.round((dessus ? dessus.getBoundingClientRect().bottom : f.top) - c.top - 2)), bas = Math.max(0, Math.round(f.bottom - c.top));
      if (haut !== vue.cadre.haut || bas !== vue.cadre.bas) { vue.cadre.haut = haut; vue.cadre.bas = bas; SCENE.setEvenement(vue); }
    }
    SCENE.setEvenement(vue); redim();
    const ecoute = (e) => toucher(e); if (fenetre) fenetre.addEventListener('pointerdown', ecoute);
    const fmt = (n) => (R().fmtEur ? R().fmtEur(n) : String(Math.round(n)));
    const s3 = {
      get perdu() { return 0; },
      get hd() { const e = SCENE.evenement; return { actif: !!(e && e.hd), boutique: true, persos: e ? e.apprentis.length : 0, costumes: e ? e.apprentis.map((a) => a.costume) : [] }; },
      get vue() { return vue; }, get etat() { return st; },
      redim,
      frame(dt, qq, msImage, espacee) {
        if (fini) return; stations(st, qq || q0);
        if ((tCadre -= dt) <= 0) { tCadre = 0.5; redim(); const g = G.tenueBoulanger(reel); if ((g ? g.cle : '') !== cleGarde) { cleGarde = g ? g.cle : ''; vue.garde = g; } } // la fenêtre suit la mise en page ; le boulanger suit sa garde-robe (la tenue d'automne, mise pendant le Marché)
        const t = (qq && qq.now) || Date.now(); st.now = t; SCENE.frame(dt, st, t, msImage, espacee);
        // la traversée suit le temps réel (celui des règles, qui la retirent à sa fin) : à moins de 4 images/s, le dt de ui.js, plafonné à
        // 0,25 s, la laissait au bord de l'écran quand les règles l'effaçaient (7 nov. : à ~1 image/s, la feuille ne passait jamais le premier quart)
        for (let k = APP.length - 1; k >= 0; k--) { const a = APP[k]; if (majApp(a, Math.max(dt, (t - a.nait) / 1000 - a.t))) retirerApp(a); }
        majExpl(dt);
      },
      equipe: () => {}, // les amis embauchés arrivent d'eux-mêmes à leur poste (les stations)
      vente: (gros) => { if (gros > 0) SCENE.vente(0, gros, '+' + fmt(gros), false); },
      fete: () => fete(), coup: () => {},
      detruire() {
        if (fini) return; fini = true; if (fenetre) fenetre.removeEventListener('pointerdown', ecoute);
        while (APP.length) retirerApp(APP[0]); for (const e of EXPL) e.t = 1; majExpl(0); cbToucher = null; if (SCENE.ambiance) SCENE.ambiance(1);
        if (courant === s3) courant = null;
        SCENE.setEvenement(null); el.classList.remove('mc-boutique'); document.body.classList.remove('mc-boutique');
      },
      get calls() { return SCENE.stats.calls; },
    };
    courant = s3; return s3;
  }
  const precharger = () => (typeof SCENE !== 'undefined' && SCENE.precharger ? SCENE.precharger('marche') : false);
  const detruire = () => { if (courant) courant.detruire(); };
  return { actif, demande, scene, etatVue, stations, mobilier, EQUIPE, CLIENTS, SORTES, TYPES_APP, GARDE, HD, acteurs, client, entrer, servir, fache, apparition, apparitions, attraper, retirer, surToucher, vise: (x, y) => !!courant && !!viser(x, y), fete, ambiance, precharger, detruire, get ouverte() { return !!courant; } };
})();
if (typeof module !== 'undefined') module.exports = BOUTIQUE_MARCHE;
