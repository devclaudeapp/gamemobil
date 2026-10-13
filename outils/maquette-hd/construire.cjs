require('esbuild').build({ entryPoints: ['entree.js'], bundle: true, minify: true, format: 'iife', outfile: process.argv[2], target: 'es2019', legalComments: 'none',
  plugins: [{ name: 'three-global', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: require('path').resolve('shim-three.cjs') })); } }],
  banner: { js: '/* Le Fournil, outils HD : GLTFLoader + SkeletonUtils (three r158, MIT), postprocessing 6.33.4 (Zlib, pmndrs), n8ao 1.8.4 (CC0, N8python) ; branchés sur le THREE global */' } }).then(() => console.log('ok')).catch((e) => { console.error(e); process.exit(1); });
