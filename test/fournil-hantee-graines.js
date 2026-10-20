#!/usr/bin/env node
// Les simulations de la Maison hantée sur plusieurs graines, en parallèle (une par cœur, worker_threads), pour test/fournil-hantee.test.js :
// l'enveloppe du serveur (le marathon, Sortilèges achetés et offerts) et l'équilibre des activités (le très actif, avec et sans le Manoir)
// ne se jugent pas sur un seul tirage des coups de pouce (Math.random chez un vrai joueur). Une simulation du marathon prend ~9 s : vingt
// d'affilée feraient trois minutes de plus au test.
// Entrée (stdin, JSON) : [{ profil, graine, offertes, manoir, trace }] ; sortie (stdout, JSON), dans le même ordre :
// [{ total, paliersJour, trace?: [[t (jours depuis l'ouverture), total]] }] (la trace seulement si demandée).
// Lancer : TZ=Europe/Paris node test/fournil-hantee-graines.js < taches.json
'use strict';
const { Worker, isMainThread, parentPort } = require('worker_threads'), os = require('os');
if (isMainThread) {
  const taches = JSON.parse(require('fs').readFileSync(0, 'utf8') || '[]'), res = new Array(taches.length);
  const n = Math.max(1, Math.min(taches.length, os.availableParallelism ? os.availableParallelism() : os.cpus().length));
  let suivante = 0, finis = 0;
  if (!taches.length) process.stdout.write('[]');
  for (let w = 0; w < n; w++) {
    const wk = new Worker(__filename);
    const donner = () => { if (suivante < taches.length) { const k = suivante++; wk.postMessage({ k, t: taches[k] }); } else wk.terminate(); };
    wk.on('message', ({ k, r }) => { res[k] = r; if (++finis === taches.length) process.stdout.write(JSON.stringify(res)); donner(); });
    wk.on('error', (e) => { console.error(e); process.exit(1); });
    donner();
  }
} else {
  const HT = require('../src/hantee.js');
  parentPort.on('message', ({ k, t }) => {
    const s = HT.simuler(t.profil, 7, { graine: t.graine, offertes: !!t.offertes, manoir: t.manoir === false ? false : undefined });
    parentPort.postMessage({ k, r: { total: s.total, paliersJour: s.paliersJour, trace: t.trace ? s.trace.map((x) => [x.t, x.total]) : undefined } });
  });
}
