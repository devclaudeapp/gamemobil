#!/usr/bin/env node
// Assemble fournil/index.html (le jeu, page autonome et installable, ouverte depuis l'écran d'accueil du dépôt) et dist/artifact.html (contenu seul, pour la page Claude).
// Three.js (vendor/three.min.js, partagé par les jeux du dépôt) est chargé par une balise <script src> dans fournil/index.html et inliné dans l'artefact.
// L'écran d'accueil (index.html à la racine) n'est pas généré : on l'édite à la main.
'use strict';
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const css = read('style.css'), body = read('page.html');
const js = ['game.js', 'icons.js', 'vie.js', 'modeles.js', 'meubles.js', 'persos.js', 'scene.js', 'ui.js'].map((f) => `/* ── ${f} ── */\n${read(f)}`).join('\n');
const three = fs.readFileSync(path.join(__dirname, 'vendor', 'three.min.js'), 'utf8'); // Three.js r158 (UMD), vendu dans le dépôt
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@700;800&display=swap">`;
const headInner = `<title>Le Fournil</title>\n${fonts}\n<style>\n${css}</style>`;
const script = `<script>\n${js}\n</script>`;
const bodyInner = `${body}\n<script>window.FOURNIL_ACCUEIL = '../';</script>\n<script src="../vendor/three.min.js"></script>\n${script}`; // la page : Three.js en fichier séparé, mis en cache par le service worker ; un lien vers l'écran d'accueil
const artifact = `${headInner}\n${body}\n<script>\n${three}\n</script>\n${script}`; // l'artefact : fragment autonome, Three.js inline
const full = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#FFF7EC">
<meta name="description" content="Ta boulangerie de quartier : cuis, vends, améliore, embauche. Les apprentis travaillent même quand tu n’es pas là.">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Le Fournil">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/icon-180.png">
<script>
// la page du jeu vit dans fournil/ : servie ailleurs (une vieille copie en cache à la racine), ses chemins relatifs (../vendor, ../icons) casseraient
(function () { try { var p = location.pathname; if (/^https?:$/.test(location.protocol) && !/[/]fournil[/](index[.]html)?$/.test(p)) location.replace(p.replace(/[^/]*$/, '') + 'fournil/'); } catch (e) { /* rien */ } })();
</script>
${headInner}
</head>
<body>
${bodyInner}
<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  let top = false; try { top = window.self === window.top; } catch (e) { top = false; }
  if (top) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'fournil'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'fournil', 'index.html'), full);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), artifact);
console.log(`fournil/index.html ${(full.length / 1024).toFixed(0)} Ko · dist/artifact.html ${(artifact.length / 1024).toFixed(0)} Ko · ${js.split('\n').length} lignes de JS`);

// ─── Opération Poncin (poncin/index.html) : FPS sur la carte de Poncin ; sources dans src-poncin/, `src/modeles.js` partagé avec Le Fournil ───
// Three.js et supabase-js sont des fichiers à part (vendor/), mis en cache par le service worker du jeu ; poncin/config.js (adresse et clé publique Supabase) s'édite à la main.
const PONCIN = ['../src/modeles.js', '../src/persos.js', 'regles.js', 'carte-provisoire.js', 'monde.js', 'nav.js', 'bots.js', 'jeu.js', 'arene.js', 'avatars.js', 'rendu.js', 'sons.js', 'controles.js', 'hud.js', 'reseau.js', 'enligne.js', 'ui.js'];
if (fs.existsSync(path.join(__dirname, 'src-poncin', 'ui.js'))) {
  const lireP = (f) => fs.readFileSync(path.join(__dirname, 'src-poncin', f), 'utf8');
  const jsP = PONCIN.map((f) => `/* ── ${path.basename(f)} ── */\n${lireP(f)}`).join('\n');
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
<script>window.PONCIN_ACCUEIL = '../';</script>
<script src="../vendor/three.min.js"></script>
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
  console.log(`poncin/index.html ${(pageP.length / 1024).toFixed(0)} Ko · ${jsP.split('\n').length} lignes de JS`);
}
