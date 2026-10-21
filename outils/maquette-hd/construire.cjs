// Les outils HD empaquetés pour le THREE global : node construire.cjs <sortie> [jeu|maquette]
//   jeu (vendor/fournil-hd.min.js) : GLTFLoader, SkeletonUtils et MeshoptDecoder seulement (entree-jeu.js), ce que lit src/hd.js ;
//   maquette (www/maquette-outils.min.js, lu par capture-hd.cjs) : le tout, avec les effets (postprocessing, n8ao) de maquette-hd.js (entree.js).
// Paquets npm aux versions exactes : three@0.158.0 postprocessing@6.33.4 n8ao@1.8.4 esbuild@0.24.2 (ici, ou dans un dossier passé par NODE_PATH).
const path = require('path'), sorte = process.argv[3] || 'jeu', ici = (f) => path.join(__dirname, f);
const nodePaths = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
const ENTREES = {
  jeu: { entree: 'entree-jeu.js', banniere: 'GLTFLoader + SkeletonUtils + MeshoptDecoder (three r158, MIT)' },
  maquette: { entree: 'entree.js', banniere: 'GLTFLoader + SkeletonUtils + MeshoptDecoder (three r158, MIT), postprocessing 6.33.4 (Zlib, pmndrs), n8ao 1.8.4 (CC0, N8python)' },
};
const e = ENTREES[sorte]; if (!e || !process.argv[2]) { console.error('usage : node construire.cjs <sortie> [jeu|maquette]'); process.exit(1); }
require(require.resolve('esbuild', { paths: [__dirname, ...nodePaths] })).build({ entryPoints: [ici(e.entree)], bundle: true, minify: true, format: 'iife', outfile: process.argv[2], target: 'es2019', legalComments: 'none', nodePaths,
  plugins: [{ name: 'three-global', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: ici('shim-three.cjs') })); } }],
  footer: { js: '}' }, banner: { js: `if (globalThis.THREE) { /* Le Fournil, outils HD : ${e.banniere} ; branchés sur le THREE global ; sans THREE (cas de secours du jeu) : rien */` } }).then(() => console.log('ok', sorte, process.argv[2])).catch((err) => { console.error(err); process.exit(1); });
