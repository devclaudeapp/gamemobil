#!/usr/bin/env node
// Assemble fournil/index.html (le jeu, page autonome et installable, ouverte depuis l'écran d'accueil du dépôt) et dist/artifact.html (contenu seul, pour la page Claude).
// Three.js (vendor/three.min.js, partagé par les jeux du dépôt) est chargé par une balise <script src> dans fournil/index.html et inliné dans l'artefact.
// Le classement en ligne lit fournil/config.js (adresse et clé PUBLIQUE Supabase, édité à la main), chargé seulement par fournil/index.html :
// l'artefact n'a pas de configuration, le classement s'y cache.
// L'écran d'accueil (index.html à la racine) n'est pas généré : on l'édite à la main.
// `node build.js --essai` écrit SEULEMENT la version d'essai, fournil-essai/index.html et fournil-essai/version.json, et y copie fournil/hd/,
// fournil/modeles/ et fournil/sons/ (les chemins relatifs du jeu marchent sans rien toucher). Pas suivie par git (.gitignore) ; déployée à
// côté du vrai jeu depuis la branche du lot (.github/workflows/pages.yml et essai.yml). Elle ne s'installe pas (ni manifeste, ni service
// worker), n'a pas de config.js (rien ne part vers le vrai serveur) et préfixe toutes ses clés de stockage (FOURNIL_CLE, FOURNIL_ESSAI).
'use strict';
const fs = require('fs'), path = require('path');
const ESSAI = process.argv.includes('--essai');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const css = read('style.css'), body = read('page.html');
// equipe3d.js (le boulanger et les apprentis en 3D) juste après clients3d.js, dont il suit la règle ; « Ma chaîne de boutiques » : chaine.js (les règles) juste après game.js, planete.js (la petite planète) avant scene.js, chaine-ecran.js (les feuilles) avant nouveautes.js et ui.js (nouveautes.js reste juste avant ui.js : test/fournil-nouveautes.cjs)
const js = ['game.js', 'chaine.js', 'blackjack.js', 'roulette.js', 'casino.js', 'horloge.js', 'classement.js', 'icons.js', 'vie.js', 'modeles.js', 'kenney.js', 'meubles.js', 'persos.js', 'hd.js', 'clients3d.js', 'equipe3d.js', 'planete.js', 'scene.js', 'atelier.js', 'arriere.js', 'garderobe.js', 'activites.js', 'quartier.js', 'hantee.js', 'boutiquehantee.js', 'hanteeactivites.js', 'tiroir.js', 'evenement.js', 'zzfx.js', 'sons.js', 'photo.js', 'chat.js', 'retours.js', 'chaine-ecran.js', 'nouveautes.js', 'ui.js'].map((f) => `/* ── ${f} ── */\n${read(f)}`).join('\n');
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
const artifact = `${prelude(false)}\n${headInner(false)}\n${body}\n<script>\n${three}\n</script>\n${script}`; // l'artefact : fragment autonome, Three.js inline
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
  for (const d of ['hd', 'modeles', 'sons']) { // les ressources du jeu, copiées (les chemins relatifs du jeu marchent sans rien toucher)
    fs.rmSync(path.join(dir, d), { recursive: true, force: true });
    if (fs.existsSync(path.join(__dirname, 'fournil', d))) fs.cpSync(path.join(__dirname, 'fournil', d), path.join(dir, d), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'index.html'), page);
  fs.writeFileSync(path.join(dir, 'version.json'), JSON.stringify({ v: version }) + '\n');
  console.log(`fournil-essai/index.html ${(page.length / 1024).toFixed(0)} Ko · version ${version} · hd/, modeles/ et sons/ copiés · ${js.split('\n').length} lignes de JS`);
  process.exit(0);
}
fs.mkdirSync(path.join(__dirname, 'fournil'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'fournil', 'index.html'), page);
fs.writeFileSync(path.join(__dirname, 'fournil', 'version.json'), JSON.stringify({ v: version }) + '\n');
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), artifact);
console.log(`fournil/index.html ${(page.length / 1024).toFixed(0)} Ko · version ${version} · dist/artifact.html ${(artifact.length / 1024).toFixed(0)} Ko · ${js.split('\n').length} lignes de JS`);

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
