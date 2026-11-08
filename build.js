#!/usr/bin/env node
// Assemble fournil/index.html (le jeu, page autonome et installable, ouverte depuis l'écran d'accueil du dépôt) et dist/artifact.html (contenu seul, pour la page Claude).
// Three.js (vendor/three.min.js, partagé par les jeux du dépôt) est chargé par une balise <script src> dans fournil/index.html et inliné dans l'artefact.
// Le classement en ligne lit fournil/config.js (adresse et clé PUBLIQUE Supabase, édité à la main), chargé seulement par fournil/index.html :
// l'artefact n'a pas de configuration, le classement s'y cache.
// L'écran d'accueil (index.html à la racine) n'est pas généré : on l'édite à la main.
// `node build.js --essai` écrit SEULEMENT la version d'essai, fournil-essai/index.html et fournil-essai/version.json, et y copie fournil/hd/,
// fournil/modeles/, fournil/sons/ et fournil/img/ (les chemins relatifs du jeu marchent sans rien toucher). Pas suivie par git (.gitignore) ; déployée à
// côté du vrai jeu depuis la branche du lot (.github/workflows/pages.yml et essai.yml). Elle ne s'installe pas (ni manifeste, ni service
// worker), n'a pas de config.js (rien ne part vers le vrai serveur) et préfixe toutes ses clés de stockage (FOURNIL_CLE, FOURNIL_ESSAI).
'use strict';
const fs = require('fs'), path = require('path');
const ESSAI = process.argv.includes('--essai');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const body = read('page.html');
// ─── l'allègement : le JS et la CSS du Fournil compressés à la construction (les sources restent telles quelles, commentées) ───
// Le JS passe par terser, en version EXACTE 5.51.2 (pur JS, sans dépendance native), installé HORS du dépôt comme Playwright et mis dans
// NODE_PATH (.github/workflows/pages.yml et essai.yml ; en local : npm install --prefix <dossier> terser@5.51.2, puis
// NODE_PATH=<dossier>/node_modules). Sans lui, la construction s'arrête : jamais de page lourde publiée par mégarde.
// FOURNIL_SANS_MINIFIER=1 (débogage seulement) assemble les sources telles quelles, comme avant.
const TERSER_VERSION = '5.51.2';
const SANS_MINIFIER = process.env.FOURNIL_SANS_MINIFIER === '1';
const terser = (() => {
  if (SANS_MINIFIER) { console.warn('FOURNIL_SANS_MINIFIER=1 : le JS et la CSS du Fournil ne sont PAS compressés (débogage seulement, à ne pas publier)'); return null; }
  let t = null, v = '';
  try { t = require('terser'); v = require('terser/package.json').version; } catch (e) { t = null; }
  const aide = `  npm install --prefix /tmp/terser --no-save --no-package-lock --no-audit --no-fund terser@${TERSER_VERSION}\n  NODE_PATH=/tmp/terser/node_modules node build.js\n(ou FOURNIL_SANS_MINIFIER=1 node build.js pour une page non compressée, en débogage seulement)`;
  if (!t || typeof t.minify_sync !== 'function') { console.error(`build.js : terser ${TERSER_VERSION} introuvable (le minifieur du Fournil, installé hors du dépôt). Par exemple :\n${aide}`); process.exit(1); }
  if (v !== TERSER_VERSION) { console.error(`build.js : terser ${v} trouvé, ${TERSER_VERSION} attendu (version exacte : la même page, la même empreinte partout). Par exemple :\n${aide}`); process.exit(1); }
  return t;
})();
// Le JS : chaque fichier de src/ à part (rien ne passe d'un fichier à l'autre ; les repères « ── fichier ── » restent, des tests les lisent).
// Sûr avant tout : les noms globaux ne changent jamais (toplevel: false : GAME, G, SCENE, HDM, window.__fournil…, que les fichiers et les
// tests se partagent), seulement les noms locaux ; aucune propriété renommée ; les noms de classes gardés (ceux des fonctions locales non :
// rien ne lit fn.name, ni Function.prototype.toString, ni ne crée de worker depuis un texte ; vérifié le 8 nov. ; 86 Ko de moins) ; ni « unsafe »,
// ni lecture de propriété supprimée (pure_getters: false : « void el.offsetWidth », qui relance une animation CSS, reste), ni typeof réécrit,
// ni paramètre retiré (keep_fargs : fn.length). terser protège de lui-même les portées qui appellent eval, et « </script » dans les chaînes.
// Le seul commentaire gardé : la licence MIT de ZzFX.
const OPTIONS_TERSER = {
  compress: { toplevel: false, pure_getters: false, typeofs: false, keep_fargs: true, keep_classnames: true, unsafe: false, passes: 1 },
  mangle: { toplevel: false, keep_classnames: true, safari10: true },
  format: { comments: /\(MIT, ©/, inline_script: true, safari10: true },
  keep_classnames: true, toplevel: false, module: false,
};
const minJs = (f, src) => {
  if (!terser) return src;
  let r;
  try { r = terser.minify_sync({ [f]: src }, OPTIONS_TERSER); } catch (e) { console.error(`build.js : terser n'a pas pu compresser src/${f} : ${e.message}${e.line ? ` (ligne ${e.line}, colonne ${e.col})` : ''}`); process.exit(1); }
  return r.code + ';'; // (un « ; » de plus : la fin d'un fichier ne se colle jamais au début du suivant)
};
// La CSS : un minifieur simple, écrit ici, qui ne fait que le sûr : les commentaires retirés, les blancs repliés en un seul, et supprimés
// seulement autour de « { } ; » et après « : » (jamais avant « : » : « .a :hover » n'est pas « .a:hover » ; jamais autour de « ( » ni de
// « , ») ; le « ; » d'avant « } » ôté. Les chaînes ("…", '…') passent telles quelles.
const minCss = (src) => {
  if (!terser) return src;
  let out = '', i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; } out += src.slice(i, j + 1); i = j + 1; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; out += ' '; continue; }
    if (/\s/.test(c)) { let j = i; while (j < n && /\s/.test(src[j])) j++; out += ' '; i = j; continue; }
    out += c; i++;
  }
  // les blancs autour de { } ; et après : (hors chaînes : on recoupe en morceaux chaîne / pas chaîne)
  return out.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/).map((m, k) => (k % 2 ? m : m.replace(/ *([{};]) */g, '$1').replace(/: +/g, ':').replace(/ {2,}/g, ' ').replace(/;}/g, '}'))).join('').trim() + '\n';
};
const css = minCss(read('style.css'));
// vignettes.js (la table des vignettes du carnet, générée par outils/vignettes/cuire.cjs) après icons.js, avant ce qui les montre (arriere.js, chaine-ecran.js, ui.js) ;
// equipe3d.js (le boulanger et les apprentis en 3D) juste après clients3d.js, dont il suit la règle ; « Ma chaîne de boutiques » : chaine.js (les règles) juste après game.js, progression.js (le second, les rivales, les projets de quartier : des règles, il lit GAME) juste après chaine.js, planete.js (la petite planète) avant scene.js, chaine-ecran.js (les feuilles) avant nouveautes.js et ui.js (nouveautes.js reste juste avant ui.js : test/fournil-nouveautes.cjs) ;
// les saisons gratuites (docs/marche-contrat.md § 7) : saison.js (le moteur) et saison-automne.js (sa fiche) juste après progression.js, des règles, avant classement.js et ui.js ; le Marché d'automne : marche.js (les règles) juste après hantee.js, boutiquemarche.js juste après boutiquehantee.js
const FICHIERS_JS = ['game.js', 'chaine.js', 'progression.js', 'saison.js', 'saison-automne.js', 'blackjack.js', 'roulette.js', 'casino.js', 'horloge.js', 'classement.js', 'icons.js', 'vignettes.js', 'vie.js', 'modeles.js', 'kenney.js', 'meubles.js', 'persos.js', 'hd.js', 'clients3d.js', 'equipe3d.js', 'planete.js', 'scene.js', 'atelier.js', 'arriere.js', 'garderobe.js', 'activites.js', 'quartier.js', 'hantee.js', 'marche.js', 'boutiquehantee.js', 'boutiquemarche.js', 'hanteeactivites.js', 'tiroir.js', 'evenement.js', 'zzfx.js', 'sons.js', 'photo.js', 'chat.js', 'retours.js', 'chaine-ecran.js', 'nouveautes.js', 'ui.js'];
// (la ligne au-dessus, telle quelle : des tests lisent l'ordre des fichiers dans build.js)
const js = FICHIERS_JS.map((f) => `/* ── ${f} ── */\n${minJs(f, read(f))}`).join('\n');
const lignesJs = FICHIERS_JS.reduce((n, f) => n + read(f).split('\n').length, 0); // (les lignes des sources, pour le compte rendu)
const three = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8'); // Three.js r158 (UMD), vendu dans le dépôt
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@700;800&display=swap">`;
// les clés de stockage (localStorage) passent par FOURNIL_CLE : telles quelles dans le vrai jeu et l'artefact ; « fournil.essai.… » dans l'essai,
// qui ne lit la vraie partie qu'une fois, en lecture seule (src/ui.js), et n'écrit jamais une clé du vrai jeu
const prelude = (essai) => (essai
  ? `<script>window.FOURNIL_ESSAI = { prefixe: 'fournil.essai.', db: 'fournil-essai', vraie: { cle: 'fournil.v2', db: 'fournil' } }; window.FOURNIL_CLE = (k) => String(k).replace(/^fournil\\./, 'fournil.essai.');</script>`
  : `<script>window.FOURNIL_CLE = window.FOURNIL_CLE || ((k) => k);</script>`); // (déjà posée : celle d'un test qui simule l'essai, gardée)
const headInner = (essai) => `<title>${essai ? 'Le Fournil — essai' : 'Le Fournil'}</title>\n${fonts}\n<style>\n${css}</style>`;
const script = `<script>\n${js}\n</script>`;
// la page : Three.js en fichier séparé, mis en cache par le service worker ; un lien vers l'écran d'accueil ; la configuration du classement (pas dans l'essai)
const bodyInner = (essai) => `${body}\n<script>window.FOURNIL_ACCUEIL = '../';</script>\n<script src="../vendor/three.min.js"></script>\n<script src="../vendor/fournil-hd.min.js"></script>\n<script src="../vendor/confetti.min.js"></script>\n${essai ? '' : '<script src="config.js"></script>\n'}${script}`;
// (le « <meta charset> » en tête : servi seul, sans charset dans l'en-tête HTTP, un fragment se lit au hasard du détecteur d'encodage du
// navigateur ; avant la compression, les commentaires en français du début suffisaient à le faire lire en UTF-8, la CSS compressée n'a plus
// un seul accent dans ses 64 premiers Ko : on le dit donc en clair. Dans une page qui l'enveloppe, déjà en UTF-8, il ne change rien)
const artifact = `<meta charset="utf-8">\n${prelude(false)}\n${headInner(false)}\n${body}\n<script>\n${three}\n</script>\n${script}`; // l'artefact : fragment autonome, Three.js inline
// la page complète ; essai : la version d'essai (fournil-essai/) : ni installation (manifeste, écran d'accueil), ni service worker, ni config.js, pas indexée
const gabarit = (essai) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#FFF7EC">
<meta name="description" content="Ta boulangerie de quartier : cuis, vends, améliore, embauche. Les apprentis travaillent même quand tu n’es pas là.">
${essai ? `<meta name="robots" content="noindex">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<script>
// la version d'essai vit dans fournil-essai/ : servie ailleurs, ses chemins relatifs (../vendor, ../icons, hd/, modeles/, sons/) casseraient
(function () { try { var p = location.pathname; if (/^https?:$/.test(location.protocol) && !/[/]fournil-essai[/](index[.]html)?$/.test(p)) location.replace(p.replace(/[^/]*$/, '') + 'fournil-essai/'); } catch (e) { /* rien */ } })();
</script>` : `<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Le Fournil">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/icon-180.png">
<script>
// la page du jeu vit dans fournil/ : servie ailleurs (une vieille copie en cache à la racine), ses chemins relatifs (../vendor, ../icons) casseraient
(function () { try { var p = location.pathname; if (/^https?:$/.test(location.protocol) && !/[/]fournil[/](index[.]html)?$/.test(p)) location.replace(p.replace(/[^/]*$/, '') + 'fournil/'); } catch (e) { /* rien */ } })();
</script>`}
${prelude(essai)}
${headInner(essai)}
</head>
<body>
${bodyInner(essai)}
${essai ? '' : `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  let top = false; try { top = window.self === window.top; } catch (e) { top = false; }
  if (top) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
`}</body>
</html>
`;
const full = gabarit(ESSAI);
// la version du jeu : l'empreinte de la page et des fichiers qu'elle charge. Elle est écrite dans la page (window.FOURNIL_VERSION) et dans
// fournil/version.json ; le jeu ouvert relit ce fichier de temps en temps, et s'il a changé, propose de se mettre à jour (src/ui.js, verifierVersion)
const empreinte = require('crypto').createHash('sha1');
empreinte.update(full);
for (const f of ['vendor/three.min.js', 'vendor/fournil-hd.min.js', 'vendor/confetti.min.js', 'fournil/sw.js']) { try { empreinte.update(fs.readFileSync(path.join(__dirname, f))); } catch (e) { /* absent : rien */ } }
const version = empreinte.digest('hex').slice(0, 12);
const page = full.replace('<script>window.FOURNIL_ACCUEIL', `<script>window.FOURNIL_VERSION = '${version}';</script>\n<script>window.FOURNIL_ACCUEIL`);
if (ESSAI) { // la version d'essai, seule : rien d'autre n'est écrit
  // garde-fou : chaque clé de stockage du jeu (« fournil.… ») passe par FOURNIL_CLE, et la base IndexedDB par FOURNIL_ESSAI ; sinon l'essai
  // écrirait dans la vraie partie du joueur (même origine) : on refuse de la construire. Une clé est en règle sur une ligne qui nomme
  // FOURNIL_CLE, ou dans un appel cle('fournil.…') d'un fichier dont l'utilitaire cle passe par FOURNIL_CLE (src/ui.js). Seule exception :
  // une ligne marquée « // essai : la vraie partie, lue seulement » (la copie de la 1re ouverture), sans setItem/removeItem sur une clé du vrai jeu.
  const fautes = [], CLE_LIT = /['"`]fournil\.[a-z0-9.]+['"`]/g, LUE = /\/\/ essai : la vraie partie, lue seulement\s*$/;
  for (const f of fs.readdirSync(path.join(__dirname, 'src')).filter((x) => x.endsWith('.js'))) {
    const src = read(f), cleOk = /const cle = \(k\) => \(typeof FOURNIL_CLE === 'function' \? FOURNIL_CLE\(k\) : k\);/.test(src);
    src.split('\n').forEach((l, k) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l) || /FOURNIL_CLE/.test(l)) return;
      const libres = [...l.matchAll(CLE_LIT)].filter((m) => !(cleOk && /\bcle\(\s*$/.test(l.slice(0, m.index))));
      if (!libres.length) return;
      if (LUE.test(l) && !/(setItem|removeItem)\(\s*['"`]fournil\./.test(l)) return;
      fautes.push(`src/${f}:${k + 1}`);
    });
  }
  if (!/FOURNIL_ESSAI/.test(read('ui.js'))) fautes.push('src/ui.js : la base IndexedDB (FOURNIL_ESSAI.db)');
  if (fautes.length) { console.error(`version d'essai refusée : des clés du vrai jeu ne passent pas par FOURNIL_CLE / FOURNIL_ESSAI\n  ${fautes.join('\n  ')}`); process.exit(1); }
  const dir = path.join(__dirname, 'fournil-essai');
  fs.mkdirSync(dir, { recursive: true });
  for (const d of ['hd', 'modeles', 'sons', 'img']) { // les ressources du jeu, copiées (les chemins relatifs du jeu marchent sans rien toucher ; img/ : les vignettes du carnet)
    fs.rmSync(path.join(dir, d), { recursive: true, force: true });
    if (fs.existsSync(path.join(__dirname, 'fournil', d))) fs.cpSync(path.join(__dirname, 'fournil', d), path.join(dir, d), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ v: version }) + '\n');
  console.log(`fournil-essai/index.html ${(page.length / 1024).toFixed(0)} Ko · version ${version} · hd/, modeles/, sons/ et img/ copiés · ${lignesJs} lignes de JS${terser ? ` (compressé par terser ${TERSER_VERSION})` : ' (NON compressé)'}`);
  process.exit(0);
}
fs.mkdirSync(path.join(__dirname, 'fournil'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'fournil', 'index.html'), page);
fs.writeFileSync(path.join(__dirname, 'fournil', 'version.json'), JSON.stringify({ v: version }) + '\n');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), artifact);
console.log(`fournil/index.html ${(page.length / 1024).toFixed(0)} Ko · version ${version} · dist/artifact.html ${(artifact.length / 1024).toFixed(0)} Ko · ${lignesJs} lignes de JS${terser ? ` (compressé par terser ${TERSER_VERSION})` : ' (NON compressé)'}`);

// ─── Opération Poncin (poncin/index.html) : FPS sur la carte de Poncin ; sources dans src-poncin/, `src/modeles.js` partagé avec Le Fournil ───
// Three.js et supabase-js sont des fichiers à part (vendor/), mis en cache par le service worker du jeu ; poncin/config.js (adresse et clé publique Supabase) s'édite à la main.
const PONCIN = ['../src/modeles.js', '../src/persos.js', 'regles.js', 'carte-provisoire.js', 'monde.js', 'nav.js', 'corps.js', 'armes.js', 'zones.js', 'butin.js', 'classement.js', 'bots.js', 'jeu.js', 'arene.js', 'extraction.js', 'avatars.js', 'textures.js', 'vegetation.js', 'decor.js', 'rendu.js', 'sons.js', 'controles.js', 'hud.js', 'reseau.js', 'enligne.js', 'ui.js'];
if (fs.existsSync(path.join(__dirname, 'src-poncin', 'ui.js'))) {
  const lireP = (f) => fs.readFileSync(path.join(__dirname, 'src-poncin', f), 'utf8');
  const jsP = PONCIN.map((f) => `/* ── ${path.basename(f)} ── */\n${lireP(f)}`).join('\n');
  // l'empreinte de la carte : son adresse change avec elle (ui.js la demande en carte/poncin.json?v=…), aucun cache ne sert celle d'hier
  const carteV = (() => { try { return require('crypto').createHash('sha1').update(fs.readFileSync(path.join(__dirname, 'poncin', 'carte', 'poncin.json'))).digest('hex').slice(0, 10); } catch (e) { return ''; } })();
  const pageP = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#2B2A4C">
<meta name="description" content="Opération Poncin : un FPS cartoon sur la vraie carte de Poncin (Ain). Blasters à peinture, robots, à jouer seul ou entre copains.">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Poncin">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="../icons/poncin.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/poncin-180.png">
<script>
// la page du jeu vit dans poncin/ : servie ailleurs (une vieille copie en cache), ses chemins relatifs casseraient
(function () { try { var p = location.pathname; if (/^https?:$/.test(location.protocol) && !/[/]poncin[/](index[.]html)?$/.test(p)) location.replace(p.replace(/[^/]*$/, '') + 'poncin/'); } catch (e) { /* rien */ } })();
</script>
<title>Opération Poncin</title>
${fonts}
<style>
${lireP('style.css')}</style>
</head>
<body>
${lireP('page.html')}
<script>window.PONCIN_ACCUEIL = '../'; window.PONCIN_CARTE_V = '${carteV}';</script>
<script src="../vendor/three.min.js"></script>
<script src="../vendor/poncin-GLTFLoader.js"></script>
<script src="../vendor/supabase.min.js"></script>
<script src="config.js"></script>
<script>
${jsP}
</script>
<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  let top = false; try { top = window.self === window.top; } catch (e) { top = false; }
  if (top) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>
</html>
`;
  fs.mkdirSync(path.join(__dirname, 'poncin'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'poncin', 'index.html'), pageP);
  console.log(`poncin/index.html ${(pageP.length / 1024).toFixed(0)} Ko · ${jsP.split('\n').length} lignes de JS · carte ${carteV || '(absente)'}`);
}

// ─── Dernier Rempart (zombies/index.html) : survie par vagues vue de dessus ; sources dans src-zombies/ (données séparées de la logique) ───
// Repris d'Opération Poncin (copies dans src-zombies/, Poncin a quitté le dépôt) : la navigation A*/JPS (nav.js), les sons synthétisés (psons.js) et les salons
// (reseau.js, canaux « rempart ») ; zombies/config.js porte l'adresse et la clé PUBLIQUE Supabase.
// Three.js et ses outils (vendor/fournil-hd.min.js : GLTFLoader, SkeletonUtils, MeshoptDecoder) sont des fichiers à part, comme les modèles
// (zombies/modeles/, faits par outils/zombies/faire-modeles.mjs), mis en cache par le service worker du jeu (zombies/sw.js) : le jeu marche hors ligne.
const ZOMBIES = ['nav.js', 'psons.js', 'reseau.js', 'donnees.js', 'monde.js', 'jeu.js', 'modeles.js', 'rendu.js', 'controles.js', 'sons.js', 'hud.js', 'enligne.js', 'classement.js', 'infection.js', 'ui.js'];
if (fs.existsSync(path.join(__dirname, 'src-zombies', 'ui.js'))) {
  const lireZ = (f) => fs.readFileSync(path.join(__dirname, 'src-zombies', f), 'utf8');
  const jsZ = ZOMBIES.map((f) => `/* ── ${f.startsWith('../') ? f.slice(3) : 'src-zombies/' + f} ── */\n${lireZ(f)}`).join('\n');
  const pageZ = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#1F2533">
<meta name="description" content="Dernier Rempart : tiens bon face aux vagues de zombies. Ramasse la ferraille, pose tes tourelles et tes barricades, et tire !">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Rempart">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="../icons/zombies.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/zombies-180.png">
<script>
// la page du jeu vit dans zombies/ : servie ailleurs (une vieille copie en cache), ses chemins relatifs casseraient
(function () { try { var p = location.pathname; if (/^https?:$/.test(location.protocol) && !/[/]zombies[/](index[.]html)?$/.test(p)) location.replace(p.replace(/[^/]*$/, '') + 'zombies/'); } catch (e) { /* rien */ } })();
</script>
<title>Dernier Rempart</title>
${fonts}
<style>
${lireZ('style.css')}</style>
</head>
<body>
${lireZ('page.html')}
<script>window.ZOMBIES_ACCUEIL = '../';</script>
<script src="../vendor/three.min.js"></script>
<script src="../vendor/fournil-hd.min.js"></script>
<script src="../vendor/supabase.min.js"></script>
<script src="config.js"></script>
<script>
${jsZ}
</script>
<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  let top = false; try { top = window.self === window.top; } catch (e) { top = false; }
  if (top) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>
</html>
`;
  fs.mkdirSync(path.join(__dirname, 'zombies'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'zombies', 'index.html'), pageZ);
  console.log(`zombies/index.html ${(pageZ.length / 1024).toFixed(0)} Ko · ${jsZ.split('\n').length} lignes de JS`);
}
