// Opération Poncin : le réseau des salons (src-poncin/reseau.js) éprouvé dans le navigateur, sans serveur extérieur.
// Trois pages d'un même contexte (BroadcastChannel partagé) sur test/poncin-reseau.html : voie 'local', voie 'webrtc-local' (vrai WebRTC, candidats « host »),
// puis 'webrtc-local' avec le relais forcé (pas de pair-à-pair : repli au bout de ~8 s, débit borné).
// Vérifie : élection de l'hôte, liste des joueurs, client → hôte, hôte → un / tous (fiables et non fiables), étoile, rafale fiable dans l'ordre,
// débits mesurés, pings, départ d'un client, départ de l'hôte. Le scénario sert aussi au test en ligne réel (test/poncin-en-ligne-ci.cjs).
// NODE_PATH=/opt/node22/lib/node_modules node test/poncin-reseau.cjs
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const racine = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

// un petit serveur statique du dépôt (port 0 : libre)
function serveur(port) {
  return new Promise((r) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(racine, path.normalize(p)); if (!f.startsWith(racine)) { res.writeHead(403); res.end(); return; }
      fs.readFile(f, (err, d) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(d); });
    }).listen(port || 0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${srv.address().port}`, fermer: () => srv.close() }));
  });
}

const moyenne = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
const arrondi = (x, k = 1) => Math.round(x * 10 ** k) / 10 ** k;

// le scénario à trois joueurs ; pages = [A (crée le salon), B, C] déjà sur test/poncin-reseau.html
// o : { via, relais (forcé par option), relaisParAdresse (les pages ont ?relais=1), check(ok, message), log, attenteVoie (ms), avantDeparts(ctx) }
async function scenario(pages, o) {
  const { via, check } = o, log = o.log || console.log, relais = !!(o.relais || o.relaisParAdresse), webrtc = via !== 'local';
  const [A, B, C] = pages, P = (p, f, a) => p.evaluate(f, a), N = { A, B, C };
  const quand = async (p, f, a, ms) => { try { await p.waitForFunction(f, a, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } };
  const vue = (p) => P(p, () => window.banc.resume());
  const m = { via, relais };
  const ids = {}; for (const k of ['A', 'B', 'C']) ids[k] = k + '-' + Math.random().toString(36).slice(2, 7);
  const coul = { A: '#E85D5D', B: '#4C9BE8', C: '#5DBB63' };
  const rejoindre = (k, code) => P(N[k], (x) => window.banc.rejoindre(x), { via, code, relais: !!o.relais, moi: { id: ids[k], pseudo: 'Joueur ' + k, couleur: coul[k] } });

  // ── entrer dans le salon ──
  let t = Date.now();
  const rA = await rejoindre('A', null); m.entreeA = Date.now() - t;
  check(rA && /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(rA.code) && rA.estHote && rA.hote === ids.A, `A crée le salon ${rA && rA.code} et en est l'hôte (${m.entreeA} ms)`);
  const code = rA.code; m.code = code;
  t = Date.now();
  const [rB, rC] = await Promise.all([rejoindre('B', code), rejoindre('C', code)]); m.entreeBC = Date.now() - t;
  check(rB.code === code && rC.code === code && !rB.estHote && !rC.estHote && rB.hote === ids.A && rC.hote === ids.A, `B et C rejoignent ${code} en clients, A hôte dès l'entrée (${m.entreeBC} ms ; B voit ${rB.joueurs.length} joueurs, C ${rC.joueurs.length})`);
  const tous3 = await Promise.all(pages.map((p) => quand(p, (h) => window.banc.s.joueurs.size === 3 && window.banc.s.hote === h, ids.A, 10000)));
  const vues = await Promise.all(pages.map(vue));
  check(tous3.every(Boolean) && vues.every((v) => v.hote === ids.A && v.joueurs.length === 3), `les trois voient 3 joueurs et le même hôte (A) : ${vues.map((v) => v.joueurs.length + (v.estHote ? '★' : '')).join(' / ')}`);
  check(vues.every((v) => v.joueurs.every((j) => j.pseudo && j.couleur && typeof j.depuis === 'number')), 'chaque joueur a pseudo, couleur et ancienneté');
  check(vues.filter((v) => v.estHote).length === 1, 'un seul hôte');

  // ── la voie : p2p (WebRTC) ou relais ──
  if (webrtc) {
    const attendu = relais ? 'relais' : 'p2p';
    t = Date.now();
    const okA = await quand(A, ([b, c, v]) => { const j = window.banc.s.joueurs; return j.get(b) && j.get(b).voie === v && j.get(c) && j.get(c).voie === v; }, [ids.B, ids.C, attendu], o.attenteVoie || 20000);
    const okBC = await Promise.all([B, C].map((p, i) => quand(p, ([me, v]) => window.banc.s.joueurs.get(me).voie === v, [i ? ids.C : ids.B, attendu], 5000)));
    m.tVoie = Date.now() - t + m.entreeBC;
    const vA = await vue(A);
    m.voies = vA.joueurs.map((j) => j.voie).join(',');
    check(okA && okBC.every(Boolean), `voie « ${attendu} » établie avec B et C en ${(m.tVoie / 1000).toFixed(1)} s après leur arrivée (vu par A : ${m.voies})`);
    const liens = await P(A, () => window.banc.s.stats().liens);
    m.ice = liens.map((l) => l.ice).join(',');
    if (!relais) check(liens.length === 2 && liens.every((l) => l.ice === 'connected'), `A a deux liens WebRTC connectés (${m.ice})`);
  } else check(vues.every((v) => v.joueurs.every((j) => j.voie === 'local')), 'voie locale');

  // ── client → hôte ──
  await P(B, () => window.banc.s.envoyer('msg', { k: 'b-fiable' }));
  await P(C, () => window.banc.s.envoyer('msg', { k: 'c-non-fiable' }, { fiable: false }));
  let ok = await quand(A, ([b, c]) => { const r = window.banc.de('msg'); return r.some((x) => x.d.k === 'b-fiable' && x.de === b) && r.some((x) => x.d.k === 'c-non-fiable' && x.de === c); }, [ids.B, ids.C], 6000);
  check(ok, 'client → hôte : A reçoit le fiable de B et le non fiable de C, avec le bon expéditeur');

  // ── hôte → un ──
  const okUn = await P(A, (b) => window.banc.s.envoyer('msg', { k: 'pour-b' }, { a: b }), ids.B);
  ok = await quand(B, (a) => window.banc.de('msg').some((x) => x.d.k === 'pour-b' && x.de === a), ids.A, 6000);
  await sleep(800);
  const cPourB = await P(C, () => window.banc.de('msg').filter((x) => x.d.k === 'pour-b').length);
  check(okUn && ok && cPourB === 0, 'hôte → un : B reçoit, C ne reçoit pas');

  // ── hôte → tous (fiable et non fiable) ──
  await P(A, () => { window.banc.s.envoyer('msg', { k: 'tous-fiable' }); window.banc.s.envoyer('msg', { k: 'tous-non-fiable' }, { fiable: false }); });
  const okTous = await Promise.all([B, C].map((p) => quand(p, () => { const r = window.banc.de('msg'); return r.some((x) => x.d.k === 'tous-fiable') && r.some((x) => x.d.k === 'tous-non-fiable'); }, null, 6000)));
  check(okTous.every(Boolean), 'hôte → tous : B et C reçoivent le fiable et le non fiable');

  // ── l'étoile : un client ne parle pas à un autre client ──
  const refus = await P(B, (c) => window.banc.s.envoyer('msg', { k: 'b-vers-c' }, { a: c }), ids.C);
  await sleep(1000);
  const deB = await P(C, (b) => window.banc.recus.filter((x) => x.de === b).length, ids.B);
  check(refus === false && deB === 0, 'étoile : B ne peut pas écrire à C (refusé), C n’a jamais rien reçu de B');

  // ── rafale fiable : 300 messages d'un coup, tous livrés dans l'ordre ──
  t = Date.now();
  await P(A, () => { for (let k = 0; k < 300; k++) window.banc.s.envoyer('rafale', { k }); });
  const okR = await Promise.all([B, C].map((p) => quand(p, () => window.banc.de('rafale').length >= 300, null, 15000)));
  m.tRafale = Date.now() - t;
  const ordres = await Promise.all([B, C].map((p) => P(p, () => { const r = window.banc.de('rafale'); return r.length === 300 && r.every((x, i) => x.d.k === i); })));
  check(okR.every(Boolean) && ordres.every(Boolean), `rafale fiable : 300 messages reçus une fois, dans l'ordre, par B et C en ${m.tRafale} ms`);

  // ── débits : A → tous 'etat' 20 Hz (800 o), B et C → A 'entree' 30 Hz (200 o), non fiables, 4 s ──
  const comptes = () => Promise.all(pages.map((p) => P(p, () => window.banc.s.stats().compteurs)));
  const c0 = await comptes(), t0 = Date.now();
  const envoyes = await Promise.all([P(A, () => window.banc.cadence('etat', 20, 4, { fiable: false }, 800)), P(B, () => window.banc.cadence('entree', 30, 4, { fiable: false }, 200)), P(C, () => window.banc.cadence('entree', 30, 4, { fiable: false }, 200))]);
  await sleep(700);
  const c1 = await comptes(), dt = (Date.now() - t0) / 1000, duree = 4;
  const recu = async (p, type, de) => P(p, ([ty, t0, de]) => { const r = window.banc.de(ty, t0).filter((x) => !de || x.de === de); return { n: r.length, lat: r.map((x) => x.q - x.d.t) }; }, [type, t0, de]);
  const [eB, eC, iB, iC] = await Promise.all([recu(B, 'etat'), recu(C, 'etat'), recu(A, 'entree', ids.B), recu(A, 'entree', ids.C)]);
  m.debits = {
    etatEnvoyeHz: arrondi(envoyes[0] / duree), etatRecuHzB: arrondi(eB.n / duree), etatRecuHzC: arrondi(eC.n / duree), latEtatMs: arrondi(moyenne(eB.lat.concat(eC.lat)), 0),
    entreeEnvoyeHz: arrondi(envoyes[1] / duree), entreeRecuHzB: arrondi(iB.n / duree), entreeRecuHzC: arrondi(iC.n / duree), latEntreeMs: arrondi(moyenne(iB.lat.concat(iC.lat)), 0),
    relaisParSA: arrondi((c1[0].relaisEnv - c0[0].relaisEnv) / dt), relaisParSB: arrondi((c1[1].relaisEnv - c0[1].relaisEnv) / dt), relaisParSC: arrondi((c1[2].relaisEnv - c0[2].relaisEnv) / dt),
    p2pParSA: arrondi((c1[0].p2pEnv - c0[0].p2pEnv) / dt), koParSA: arrondi((c1[0].octets - c0[0].octets) / dt / 1024),
  };
  const d = m.debits;
  log(`    débits : état A→tous ${d.etatEnvoyeHz} Hz envoyés, reçus ${d.etatRecuHzB} Hz (B) / ${d.etatRecuHzC} Hz (C), ${d.latEtatMs} ms ; entrées B,C→A ${d.entreeEnvoyeHz} Hz envoyées, reçues ${d.entreeRecuHzB} / ${d.entreeRecuHzC} Hz, ${d.latEntreeMs} ms ; relais/s A ${d.relaisParSA} B ${d.relaisParSB} C ${d.relaisParSC} ; A ${d.koParSA} Ko/s`);
  if (relais) {
    check(d.relaisParSA <= 5.5 && d.relaisParSB <= 5.5 && d.relaisParSC <= 5.5, `relais borné : ≤ 5 envois/s par joueur (A ${d.relaisParSA}, B ${d.relaisParSB}, C ${d.relaisParSC})`);
    check(d.etatRecuHzB >= 2.5 && d.etatRecuHzB <= 5.5 && d.entreeRecuHzB >= 2.5 && d.entreeRecuHzB <= 5.5, `relais : le dernier état passe ~5 fois/s (B reçoit ${d.etatRecuHzB} Hz, A reçoit de B ${d.entreeRecuHzB} Hz)`);
  } else {
    check(d.etatRecuHzB >= 0.9 * d.etatEnvoyeHz && d.etatRecuHzC >= 0.9 * d.etatEnvoyeHz, `état à pleine cadence : ${d.etatRecuHzB} / ${d.etatRecuHzC} Hz reçus pour ${d.etatEnvoyeHz} Hz envoyés`);
    check(d.entreeRecuHzB >= 0.9 * d.entreeEnvoyeHz && d.entreeRecuHzC >= 0.9 * d.entreeEnvoyeHz, `entrées à pleine cadence : ${d.entreeRecuHzB} / ${d.entreeRecuHzC} Hz reçues pour ${d.entreeEnvoyeHz} Hz envoyées`);
    if (webrtc) check(d.relaisParSA === 0 && d.relaisParSB === 0, 'en p2p, rien ne passe par le relais');
  }

  // ── pings ──
  if (webrtc) {
    await sleep(relais ? 4500 : 2500);
    const [vA2, vB2, vC2] = await Promise.all(pages.map(vue));
    const jB = vA2.joueurs.find((j) => j.id === ids.B), jBmoi = vB2.joueurs.find((j) => j.id === ids.B), jCvuB = vB2.joueurs.find((j) => j.id === ids.C), jAvuC = vC2.joueurs.find((j) => j.id === ids.A);
    m.ping = { AversB: jB.ping, BversA: jBmoi.ping, CvuParB: jCvuB.ping };
    check(typeof jB.ping === 'number' && jB.ping >= 0 && jB.ping < 5000 && jBmoi.ping >= 0 && jAvuC.voie === 'hote', `pings mesurés : A↔B ${jB.ping} ms (vu par A), ${jBmoi.ping} ms (vu par B) ; l'hôte a la voie « hote »`);
    check(jCvuB.voie === (relais ? 'relais' : 'p2p'), `B connaît la voie de C par l'hôte (${jCvuB.voie}, ${jCvuB.ping} ms)`);
  }

  if (o.avantDeparts) await o.avantDeparts({ pages, ids, m, quand, vue, P });

  // ── départ d'un client ──
  t = Date.now();
  await P(C, () => window.banc.s.quitter());
  const okDep = await Promise.all([A, B].map((p) => quand(p, (c) => window.banc.s.joueurs.size === 2 && !window.banc.s.joueurs.has(c), ids.C, 15000)));
  m.tDepartClient = Date.now() - t;
  check(okDep.every(Boolean), `départ de C : A et B ne voient plus que 2 joueurs (${m.tDepartClient} ms)`);
  const fermeC = await P(C, () => window.banc.s.ferme && window.banc.evts.some((e) => e.t === 'ferme'));
  check(fermeC, 'C reçoit « ferme »');
  ok = await P(A, () => window.banc.s.envoyer('msg', { k: 'apres-c' }));
  check(ok && await quand(B, () => window.banc.de('msg').some((x) => x.d.k === 'apres-c'), null, 6000), 'la partie continue entre A et B');

  // ── départ de l'hôte ──
  t = Date.now();
  await P(A, () => window.banc.s.quitter());
  const okH = await quand(B, (b) => window.banc.s.hote === b && window.banc.s.estHote && window.banc.s.joueurs.size === 1, ids.B, 15000);
  m.tDepartHote = Date.now() - t;
  const evtHote = await P(B, (a) => window.banc.evts.find((e) => e.t === 'hote' && e.d.avant === a), ids.A);
  check(okH && evtHote && evtHote.d.hote === ids.B, `départ de l'hôte : B reçoit « hote » (avant : A) et devient l'hôte (${m.tDepartHote} ms)`);
  await P(B, () => window.banc.s.quitter());

  // ── aucune erreur dans les pages ──
  const erreurs = [].concat(...(await Promise.all(pages.map((p) => P(p, () => window.banc.erreurs)))));
  check(erreurs.length === 0, 'aucune erreur ni promesse rejetée dans les pages' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  return m;
}

// robustesse (voies WebRTC) : le direct coupe en pleine partie (relais aussitôt, fiables tous livrés, retour au direct),
// un client recharge sa page (même id, nouvelle instance), l'hôte part à trois (un autre devient l'hôte, le dernier s'y relie)
async function scenarioRobustesse(pages, o) {
  const { via, check } = o, log = o.log || console.log, url = o.url;
  const [A, B, C] = pages, P = (p, f, a) => p.evaluate(f, a), N = { A, B, C };
  const quand = async (p, f, a, ms) => { try { await p.waitForFunction(f, a, { timeout: ms, polling: 100 }); return true; } catch (e) { return false; } };
  const m = { via };
  const ids = {}; for (const k of ['A', 'B', 'C']) ids[k] = k + '-' + Math.random().toString(36).slice(2, 7);
  const rejoindre = (k, code) => P(N[k], (x) => window.banc.rejoindre(x), { via, code, moi: { id: ids[k], pseudo: 'Joueur ' + k, couleur: '#888' } });
  const voie = (p, de, qui, v) => quand(p, ([de, v]) => { const j = window.banc.s.joueurs.get(de); return j && j.voie === v; }, [de, v], qui);
  const code = (await rejoindre('A', null)).code;
  await rejoindre('C', code); await rejoindre('B', code); // C arrive avant B : C sera le plus ancien après l'hôte
  check(await voie(A, ids.B, 20000, 'p2p') && await voie(A, ids.C, 20000, 'p2p'), 'trois joueurs reliés en direct');

  // ── coupure du direct chez B ──
  let t = Date.now();
  await P(B, () => window.__pcs.forEach((pc) => pc.close()));
  const okR = await voie(A, ids.B, 5000, 'relais') && await voie(B, ids.B, 5000, 'relais');
  m.tBascule = Date.now() - t;
  check(okR, `coupure du direct : A et B passent au relais en ${m.tBascule} ms`);
  await P(A, (b) => { for (let k = 0; k < 50; k++) window.banc.s.envoyer('rafale', { k }, { a: b }); }, ids.B);
  await P(B, () => window.banc.s.envoyer('msg', { k: 'b-pendant-coupure' }));
  const ok50 = await quand(B, () => window.banc.de('rafale').length >= 50, null, 10000) && await P(B, () => window.banc.de('rafale').every((x, i) => x.d.k === i) && window.banc.de('rafale').length === 50);
  const okB = await quand(A, () => window.banc.de('msg').some((x) => x.d.k === 'b-pendant-coupure'), null, 6000);
  check(ok50 && okB, 'pendant la coupure : 50 fiables livrés à B dans l’ordre, et B joint A');
  t = Date.now();
  const okRetour = await voie(A, ids.B, 30000, 'p2p') && await voie(B, ids.B, 5000, 'p2p');
  m.tRetour = Date.now() - t;
  check(okRetour, `retour au direct en ${(m.tRetour / 1000).toFixed(1)} s (nouvel essai WebRTC)`);
  await P(A, (b) => window.banc.s.envoyer('msg', { k: 'apres-retour' }, { a: b }), ids.B);
  check(await quand(B, () => window.banc.de('msg').some((x) => x.d.k === 'apres-retour'), null, 5000), 'les fiables passent de nouveau par le direct');

  // ── B recharge sa page : même id, nouvelle instance, la numérotation repart de zéro ──
  await P(B, () => window.banc.s.quitter());
  await B.goto(url); await rejoindre('B', code);
  const okRech = await voie(A, ids.B, 20000, 'p2p');
  await P(A, (b) => window.banc.s.envoyer('msg', { k: 'apres-rechargement' }, { a: b }), ids.B);
  await P(B, () => window.banc.s.envoyer('msg', { k: 'b-recharge' }));
  check(okRech && await quand(B, () => window.banc.de('msg').some((x) => x.d.k === 'apres-rechargement'), null, 5000) && await quand(A, () => window.banc.de('msg').some((x) => x.d.k === 'b-recharge'), null, 5000), 'B recharge sa page et rejoint : les fiables repartent de zéro dans les deux sens');

  // ── l'hôte part : C (le plus ancien) devient l'hôte, B se relie à C ──
  t = Date.now();
  await P(A, () => window.banc.s.quitter());
  const okH = await quand(C, (c) => window.banc.s.estHote && window.banc.s.joueurs.size === 2, ids.C, 15000) && await quand(B, (c) => window.banc.s.hote === c && window.banc.s.joueurs.size === 2, ids.C, 15000);
  const okP = await voie(C, ids.B, 20000, 'p2p');
  m.tNouvelHote = Date.now() - t;
  check(okH && okP, `départ de l'hôte à trois : C devient l'hôte, B s'y relie en direct (${(m.tNouvelHote / 1000).toFixed(1)} s)`);
  await P(C, () => window.banc.s.envoyer('msg', { k: 'c-hote' })); await P(B, () => window.banc.s.envoyer('msg', { k: 'b-vers-c' }));
  check(await quand(B, () => window.banc.de('msg').some((x) => x.d.k === 'c-hote'), null, 5000) && await quand(C, () => window.banc.de('msg').some((x) => x.d.k === 'b-vers-c'), null, 5000), 'la partie continue entre C (hôte) et B');
  await P(B, () => window.banc.s.quitter()); await P(C, () => window.banc.s.quitter());
  const erreurs = [].concat(...(await Promise.all(pages.map((p) => P(p, () => window.banc.erreurs)))));
  check(erreurs.length === 0, 'aucune erreur ni promesse rejetée dans les pages' + (erreurs.length ? ' : ' + erreurs.slice(0, 3).join(' | ') : ''));
  log(`    bascule ${m.tBascule} ms · retour au direct ${(m.tRetour / 1000).toFixed(1)} s · nouvel hôte ${(m.tNouvelHote / 1000).toFixed(1)} s`);
  return m;
}

module.exports = { scenario, scenarioRobustesse, serveur, sleep };

if (require.main === module) (async () => {
  const { chromium } = require('playwright');
  let fails = 0; const check = (ok, msg) => { console.log((ok ? '  ok   ' : '  FAIL ') + msg); if (!ok) fails++; };
  const srv = await serveur(0), browser = await chromium.launch();
  const resultats = [];
  try {
    for (const cas of [{ via: 'local' }, { via: 'webrtc-local' }, { via: 'webrtc-local', relais: true }]) {
      console.log(`\n── voie ${cas.via}${cas.relais ? ' + relais forcé' : ''} ──`);
      const ctx = await browser.newContext(), pages = [];
      for (let k = 0; k < 3; k++) {
        const p = await ctx.newPage();
        p.on('pageerror', (e) => check(false, 'erreur de page : ' + e.message));
        p.on('console', (msg) => { if (msg.type() === 'error') console.log('    console :', msg.text()); });
        await p.goto(srv.url + '/test/poncin-reseau.html'); pages.push(p);
      }
      const t = Date.now();
      try { resultats.push(Object.assign(await scenario(pages, Object.assign({ check }, cas)), { duree: Date.now() - t })); } catch (e) { check(false, 'le scénario plante : ' + (e && e.stack || e)); }
      await ctx.close();
    }
    console.log('\n── robustesse (webrtc-local) : coupure du direct, rechargement, départ de l’hôte à trois ──');
    const ctx = await browser.newContext(), pages = [];
    for (let k = 0; k < 3; k++) { const p = await ctx.newPage(); p.on('pageerror', (e) => check(false, 'erreur de page : ' + e.message)); await p.goto(srv.url + '/test/poncin-reseau.html'); pages.push(p); }
    try { await scenarioRobustesse(pages, { via: 'webrtc-local', check, url: srv.url + '/test/poncin-reseau.html' }); } catch (e) { check(false, 'le scénario plante : ' + (e && e.stack || e)); }
    await ctx.close();
  } finally { await browser.close(); srv.fermer(); }
  console.log('\n── résumé ──');
  for (const r of resultats) {
    const d = r.debits || {};
    console.log(`${(r.via + (r.relais ? ' (relais)' : '')).padEnd(24)} entrée ${r.entreeA}/${r.entreeBC} ms · voie ${r.voies || 'local'}${r.tVoie ? ' en ' + (r.tVoie / 1000).toFixed(1) + ' s' : ''} · état ${d.etatRecuHzB} Hz (${d.latEtatMs} ms) · entrées ${d.entreeRecuHzB} Hz (${d.latEntreeMs} ms) · relais/s ${d.relaisParSA}/${d.relaisParSB} · rafale ${r.tRafale} ms · ping ${r.ping ? r.ping.AversB + ' ms' : '-'} · départs ${r.tDepartClient}/${r.tDepartHote} ms`);
  }
  console.log(fails ? `\n${fails} échec(s)` : '\ntout est bon');
  process.exit(fails ? 1 : 0);
})();
