#!/usr/bin/env node
// Assemble index.html (page autonome, installable) et dist/artifact.html (contenu seul, pour la page Claude).
'use strict';
const fs = require('fs'), path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const css = read('style.css'), body = read('page.html');
const js = ['sim.js', 'copy.js', 'render.js', 'sheets.js', 'ui.js'].map((f) => `/* ── ${f} ── */\n${read(f)}`).join('\n');
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Text:wght@700;900&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil:opsz,wght@10..72,700;10..72,900&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:ital,wght@0,400;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap">`;
const headInner = `<title>Œillets</title>\n${fonts}\n<style>\n${css}</style>`;
const bodyInner = `${body}\n<script>\n${js}\n</script>`;
const artifact = `${headInner}\n${bodyInner}`;
const full = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#F1E8D6">
<meta name="description" content="Tu es paludier à Guérande. Vraies marées, vraie lune, météo partagée : le sel ne vient que si tu comprends comment l’eau circule dans ton marais.">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Œillets">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/icon-180.png">
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
fs.writeFileSync(path.join(__dirname, 'index.html'), full);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), artifact);
console.log(`index.html ${(full.length / 1024).toFixed(0)} Ko · dist/artifact.html ${(artifact.length / 1024).toFixed(0)} Ko · ${js.split('\n').length} lignes de JS`);
