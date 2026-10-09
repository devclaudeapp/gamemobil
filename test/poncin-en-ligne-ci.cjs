// Opération Poncin : le jeu en ligne pour de vrai, par Supabase (sur GitHub Actions : le conteneur de Claude n'a pas accès à Supabase).
// Trois contextes de navigateur séparés (rien de partagé, comme trois téléphones) rejoignent le même salon (code au hasard) par la voie 'supabase' :
// présence et hôte, WebRTC (voie 'p2p' attendue entre pages d'une même machine), messages dans les deux sens, débits, coupure du WebSocket Realtime
// (reconnexion), départs ; puis la même chose avec ?relais=1 (pas de pair-à-pair : le relais par Supabase, débit borné).
// Lancement : PONCIN_URL=http://127.0.0.1:8080 (le dépôt servi en statique ; sinon un serveur interne) node test/poncin-en-ligne-ci.cjs
'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
const { scenario, serveur, sleep } = require('./poncin-reseau.cjs');

let fails = 0; const lignes = [];
const check = (ok, msg) => { const l = (ok ? '  ok   ' : '  FAIL ') + msg; console.log(l); lignes.push(l); if (!ok) fails++; };
const log = (msg) => { console.log(msg); lignes.push(msg); };

// les paires de candidats ICE retenues par l'hôte (host / srflx, udp / tcp) : pour savoir par où passe le direct
const pairesIce = (page) => page.evaluate(async () => {
  const out = [];
  for (const pc of window.__pcs) {
    if (pc.connectionState !== 'connected') continue;
    const st = await pc.getStats(), par = {}; st.forEach((r) => { par[r.id] = r; });
    st.forEach((r) => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) { const l = par[r.localCandidateId] || {}, d = par[r.remoteCandidateId] || {}; out.push(`${l.candidateType}/${l.protocol} → ${d.candidateType}/${d.protocol}, rtt ${Math.round((r.currentRoundTripTime || 0) * 1000)} ms`); } });
  }
  return out;
});

// coupure du WebSocket Realtime de B (comme un téléphone qui perd le réseau un instant) : il doit se reconnecter, se remettre dans la présence,
// et ne pas disparaître de la liste des autres (grâce) ; les messages repassent
async function coupure({ pages, ids, m, quand, P }) {
  const [A, B] = pages;
  const ws0 = await P(B, () => window.__ws.length), t0 = Date.now();
  await P(A, (b) => { window.__idB = b; window.__sansB = 0; window.__offB = window.banc.s.sur('joueurs', (l) => { if (!l.some((j) => j.id === window.__idB)) window.__sansB++; }); }, ids.B);
  await P(B, () => window.__ws.forEach((w) => { try { w.close(); } catch (e) { /* rien */ } }));
  const okRe = await quand(B, (n) => window.__ws.length > n && window.banc.s._transport.etat().joint, ws0, 30000);
  m.tReconnexion = Date.now() - t0;
  await sleep(3000); // la présence se refait
  const sansB = await P(A, () => { window.__offB(); return window.__sansB; });
  const presentB = await P(A, (b) => window.banc.s.joueurs.has(b), ids.B);
  check(okRe, `coupure du WebSocket de B : reconnecté au canal en ${(m.tReconnexion / 1000).toFixed(1)} s`);
  check(presentB && sansB === 0, `B n'a jamais quitté la liste de A pendant la coupure (listes sans B : ${sansB})`);
  await P(B, () => window.banc.s.envoyer('msg', { k: 'b-apres-coupure' }));
  await P(A, (b) => window.banc.s.envoyer('msg', { k: 'a-apres-coupure' }, { a: b }), ids.B);
  check(await quand(A, () => window.banc.de('msg').some((x) => x.d.k === 'b-apres-coupure'), null, 10000) && await quand(B, () => window.banc.de('msg').some((x) => x.d.k === 'a-apres-coupure'), null, 10000), 'après la coupure, les messages passent dans les deux sens');
  // C voit-il toujours B ? (il l'apprend par la présence revenue)
  check(await quand(pages[2], (b) => window.banc.s.joueurs.has(b), ids.B, 8000), 'C voit toujours B');
}

(async () => {
  const srv = process.env.PONCIN_URL ? { url: process.env.PONCIN_URL.replace(/\/$/, ''), fermer() {} } : await serveur(0);
  const browser = await chromium.launch();
  const resultats = [];
  log(`Opération Poncin — test en ligne réel (Supabase Realtime + WebRTC), ${new Date().toISOString()}`);
  try {
    for (const cas of [{ nom: 'p2p', adresse: '/test/poncin-reseau.html' }, { nom: 'relais', adresse: '/test/poncin-reseau.html?relais=1', relaisParAdresse: true }]) {
      log(`\n── voie supabase, ${cas.nom} ──`);
      const ctxs = [], pages = [];
      for (let k = 0; k < 3; k++) {
        const ctx = await browser.newContext(); ctxs.push(ctx);
        const p = await ctx.newPage(); pages.push(p);
        p.on('pageerror', (e) => check(false, 'erreur de page : ' + e.message));
        p.on('console', (msg) => { if (msg.type() === 'error' || /realtime|supabase/i.test(msg.text())) console.log(`    [page ${'ABC'[k]}] ${msg.type()} : ${msg.text().slice(0, 300)}`); });
        await p.goto(srv.url + cas.adresse);
      }
      const t = Date.now();
      try {
        const r = await scenario(pages, { via: 'supabase', relaisParAdresse: !!cas.relaisParAdresse, check, log, attenteVoie: 30000,
          avantDeparts: async (x) => {
            if (!cas.relaisParAdresse) { x.m.paires = await pairesIce(pages[0]); log('    paires ICE retenues par l’hôte : ' + (x.m.paires.join(' ; ') || 'aucune')); }
            const j = await pages[1].evaluate(() => window.banc.s._transport.etat().journal).catch(() => []);
            log('    journal du canal de B : ' + j.slice(0, 12).join(' · '));
            await coupure(x);
          } });
        r.nom = cas.nom; r.duree = Date.now() - t; resultats.push(r);
        const st = await pages[1].evaluate(() => window.banc.s ? window.banc.s.stats() : null).catch(() => null);
        if (st) log(`    stats de B : ${JSON.stringify({ signaux: st.signaux, relaisEnvoyesParS: st.relaisEnvoyesParS, p2pEnvoyesParS: st.p2pEnvoyesParS, jetes: st.jetes })}`);
      } catch (e) { check(false, 'le scénario plante : ' + (e && e.stack || e)); }
      for (const c of ctxs) await c.close();
      await sleep(1000);
    }
  } finally { await browser.close(); srv.fermer(); }

  // ── le résumé lisible ──
  const res = ['', '── résumé ──', '| voie | entrée A / B+C | établie | état reçu (envoyé 20 Hz) | entrées reçues (30 Hz) | latence état / entrées | relais par s (A / B) | rafale 300 fiables | ping A↔B | reconnexion | départ client / hôte |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of resultats) {
    const d = r.debits || {};
    res.push(`| ${r.nom} | ${r.entreeA} / ${r.entreeBC} ms | ${r.voies || '?'} en ${((r.tVoie || 0) / 1000).toFixed(1)} s | ${d.etatRecuHzB} / ${d.etatRecuHzC} Hz | ${d.entreeRecuHzB} / ${d.entreeRecuHzC} Hz | ${d.latEtatMs} / ${d.latEntreeMs} ms | ${d.relaisParSA} / ${d.relaisParSB} | ${r.tRafale} ms | ${r.ping ? r.ping.AversB + ' ms' : '-'} | ${r.tReconnexion != null ? (r.tReconnexion / 1000).toFixed(1) + ' s' : '-'} | ${r.tDepartClient} / ${r.tDepartHote} ms |`);
  }
  for (const r of resultats) if (r.paires) res.push(`\nICE (${r.nom}) : ${r.paires.join(' ; ')}`);
  res.push(fails ? `\n**${fails} échec(s)**` : '\n**tout est bon**');
  for (const l of res) console.log(l);
  if (process.env.GITHUB_STEP_SUMMARY) { try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## Opération Poncin — en ligne\n\n```\n' + lignes.join('\n') + '\n```\n' + res.join('\n') + '\n'); } catch (e) { /* rien */ } }
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
