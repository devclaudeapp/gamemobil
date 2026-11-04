#!/usr/bin/env node
// Les simulations du Marché d'automne sur plusieurs graines, en parallèle (une par cœur, worker_threads), pour test/fournil-marche.test.js
// (le modèle : test/fournil-hantee-graines.js) : le rythme des paliers (quatre profils, en médiane) et l'enveloppe du serveur (le marathon,
// Astuces achetées et offertes) ne se jugent pas sur un seul tirage des coups de pouce.
// Entrée (stdin, JSON) : [{ profil, graine, offertes, trace }] ; sortie (stdout, JSON), dans le même ordre :
// [{ total, paliersJour, trace?: [[t (jours depuis l'ouverture), total]] }] (la trace seulement si demandée).
// Lancer : TZ=Europe/Paris node test/fournil-marche-graines.js < taches.json
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
  const MC = require('../src/marche.js');
  parentPort.on('message', ({ k, t }) => {
    const s = MC.simuler(t.profil, MC.JOURS, { graine: t.graine, offertes: !!t.offertes });
    parentPort.postMessage({ k, r: { total: s.total, paliersJour: s.paliersJour, trace: t.trace ? s.trace.map((x) => [x.t, x.total]) : undefined } });
  });
}
