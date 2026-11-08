// Opération Poncin a quitté la Salle de jeux le 8 novembre 2026. Ce service worker ne sert qu'à défaire l'ancien : un téléphone qui avait
// installé le jeu le reçoit à sa prochaine ouverture (le navigateur revérifie sw.js), puis il efface les caches de Poncin (préfixe
// « poncin-jeu- » : jamais ceux de l'accueil ni des autres jeux), se désinscrit et recharge les pages ouvertes, qui tombent alors sur
// poncin/index.html : le renvoi vers l'accueil. Sans lui, l'icône installée resterait figée sur l'ancien jeu en cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('poncin-jeu-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) { try { c.navigate(c.url).catch(() => {}); } catch (x) { /* rien */ } }
})()));
