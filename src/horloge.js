/* LE FOURNIL — l'horloge de confiance : le « maintenant » du jeu, que changer l'heure du téléphone ne fait pas avancer.
   Le jeu ne lit plus Date.now() : il demande HORLOGE.maintenant().
   (a) Une heure sûre est lue au lancement, au retour dans le jeu et toutes les 30 min : l'en-tête Date d'une requête HEAD vers la page
       elle-même (même origine, sans cache ; le service worker laisse passer « ?heure= » au réseau), sinon fournil_heure() du classement
       Supabase (seulement si on l'a rejoint : rien ne part vers Supabase avant). Entre deux lectures, le temps qui passe est mesuré par
       performance.now(), qu'un changement d'heure du téléphone ne touche pas.
   (b) Le temps du jeu ne recule jamais : jamais avant la dernière fois qu'on l'a sauvé (st.lastSeen, ou la clé à part).
   (c) Sans heure sûre (hors ligne, artefact Claude) : l'heure du téléphone, mais jamais plus loin que la dernière heure sûre connue
       + la durée d'une absence normale ; avancer l'horloge hors ligne rapporte donc au plus une absence, une fois, jusqu'à ce que le
       vrai temps rattrape. La « dernière heure sûre » avance aussi du temps de jeu mesuré par performance.now() (du vrai temps).
   (d) L'heure sûre qui arrive en cours de partie recale le jeu sans rien rendre : on ne recule pas, on ne paie pas le temps sauté.
   Une partie pure (creer, estimer, lireEnTeteDate), testée dans Node, et une partie navigateur (navigateur), branchée ici sur window.HORLOGE. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    const H = factory();
    let inst = null; try { inst = H.navigateur(); } catch (e) { inst = null; }
    root.HORLOGE = Object.assign(H, inst || H.secours());
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CLE = 'fournil.horloge'; // { sure, jeu } : la dernière heure sûre connue et le dernier « maintenant » du jeu (aussi dans la sauvegarde, st.horloge)
  const REGLES = {
    periode: 30 * 60e3, // une heure sûre relue toutes les 30 min
    attente: 2500, // au lancement et au retour, on attend l'heure sûre au plus 2,5 s, puis on joue avec ce qu'on a
    delaiMax: 6000, // une lecture abandonnée au bout de 6 s
    allerRetourMax: 10e3, // une réponse plus lente est trop floue pour donner l'heure
    reessai: 5 * 60e3, // une lecture ratée : la suivante (hors lancement et retour) 5 min plus tard
    absenceH: 8, // à défaut de mieux : ABSENCE_MAX_H de game.js
  };
  const fini = (x) => typeof x === 'number' && Number.isFinite(x);
  const date = (x) => fini(x) && x > 0; // une date en millisecondes

  // ─── la partie pure ───
  function lireEnTeteDate(txt) { // « Fri, 09 Oct 2026 21:52:46 GMT » → ms (NaN si illisible)
    if (typeof txt !== 'string' || !txt.trim()) return NaN;
    const ms = Date.parse(txt);
    return date(ms) ? ms : NaN;
  }
  // une mesure : le serveur a répondu entre l'envoi et la réception ; son heure (arrondie à la seconde pour l'en-tête Date) donne une
  // fourchette pour l'instant de la réception : [serveur, serveur + résolution + aller-retour]. Un téléphone à l'heure tombe dedans et
  // donne la valeur exacte ; sinon, le milieu de la fourchette (l'écart possible : une demi-seconde et un demi aller-retour).
  function estimer(serveurMs, resolution, allerRetour, telApres) {
    if (!date(serveurMs)) return NaN;
    const bas = serveurMs, haut = serveurMs + Math.max(0, resolution || 0) + Math.max(0, allerRetour || 0);
    return fini(telApres) && telApres >= bas && telApres <= haut ? telApres : (bas + haut) / 2;
  }

  // le moteur. env : { tel() l'heure du téléphone, perf() un compteur monotone en ms, avanceMax() la plus longue absence (ms) }
  function creer(env) {
    const E = Object.assign({ tel: () => Date.now(), perf: () => Date.now(), avanceMax: () => REGLES.absenceH * 3600e3 }, env || {});
    let sure = null; // { ms, perf } : une borne basse du vrai temps à l'instant perf (le vrai temps ne fait qu'avancer depuis)
    let synchro = null; // { ms, perf, source } : la dernière heure sûre lue pendant cette session
    let ref = null; // { ms, perf } : le temps du jeu = ref.ms + (perf() − ref.perf) ; posé au démarrage, déplacé seulement vers l'avant
    let plancher = -Infinity, dernier = -Infinity, recalages = 0;
    const perf = () => { const p = E.perf(); return fini(p) ? p : 0; };
    const avance = () => { let a = NaN; try { a = +E.avanceMax(); } catch (e) { a = NaN; } return fini(a) && a >= 0 ? a : REGLES.absenceH * 3600e3; };
    const sureMs = () => (sure ? sure.ms + Math.max(0, perf() - sure.perf) : null);
    const jeu = () => (ref ? ref.ms + Math.max(0, perf() - ref.perf) : null);
    // ce que le jeu peut croire maintenant : l'heure sûre fraîche, sinon le téléphone borné par [dernière heure sûre, + une absence]
    function candidat(frais) {
      if (frais && synchro) return synchro.ms + Math.max(0, perf() - synchro.perf);
      const s = sureMs();
      let t = NaN; try { t = +E.tel(); } catch (e) { t = NaN; }
      if (s == null) return date(t) ? t : null; // jamais d'heure sûre (artefact Claude) : on ne peut que croire le téléphone
      return Math.max(s, Math.min(date(t) ? t : s, s + avance()));
    }
    // (re)pose le temps du jeu : jamais en arrière, ni sous le plancher
    function recaler(frais) {
      const avant = jeu(), c = candidat(frais);
      let t = Math.max(fini(c) ? c : -Infinity, fini(avant) ? avant : -Infinity, plancher);
      if (!fini(t)) { const tel = +E.tel(); t = date(tel) ? tel : 0; }
      ref = { ms: t, perf: perf() }; recalages++;
      return { avant, apres: t, saut: fini(avant) ? t - avant : 0, source: frais && synchro ? synchro.source : 'telephone' };
    }
    function maintenant() {
      if (!ref) { // pas encore démarré : une valeur provisoire, sans rien figer (le démarrage attend l'heure sûre)
        const c = candidat(false);
        return Math.round(Math.max(fini(c) ? c : 0, plancher, dernier));
      }
      let t = Math.round(jeu()); if (t < dernier) t = dernier; dernier = t;
      return t;
    }
    // une heure sûre lue (ms à l'instant perf de la réception) : elle fait foi, et le jeu se recale (vers l'avant seulement)
    function noterHeureSure(ms, perfInstant, source) {
      if (!date(ms)) return null;
      const p = fini(perfInstant) ? perfInstant : perf();
      synchro = { ms, perf: p, source: source || 'serveur' };
      sure = { ms, perf: p };
      return ref ? recaler(true) : null; // pas encore démarré : demarrer() s'en servira
    }
    // ce qu'on a gardé d'une session précédente (la sauvegarde, la clé à part) : la plus grande heure sûre, le plus grand plancher
    function charger(etat) {
      if (!etat || typeof etat !== 'object') return;
      if (date(etat.sure) && !synchro) { const s = sureMs(); if (s == null || etat.sure > s) sure = { ms: etat.sure, perf: perf() }; }
      if (date(etat.jeu)) pousser(etat.jeu);
    }
    function pousser(ms) { // le temps du jeu ne descend jamais sous ms (le dernier « maintenant » sauvé)
      if (!date(ms)) return;
      plancher = Math.max(plancher, ms);
      if (ref && jeu() < ms) ref = { ms, perf: perf() };
    }
    function demarrer() { return recaler(!!synchro); } // au lancement, après l'attente de l'heure sûre
    function etat() { const s = sureMs(); return { sure: s == null ? null : Math.round(s), jeu: maintenant() }; }
    function info() {
      let tel = NaN; try { tel = +E.tel(); } catch (e) { tel = NaN; }
      return { demarre: !!ref, source: synchro ? synchro.source : 'telephone', sure: sureMs(), jeu: ref ? jeu() : null, avance: ref && date(tel) ? jeu() - tel : null, recalages };
    }
    return { maintenant, noterHeureSure, charger, pousser, demarrer, recaler, etat, info, get synchro() { return synchro; } };
  }

  // ─── dans le navigateur ───
  function navigateur(o) {
    o = o || {};
    const w = typeof window !== 'undefined' ? window : null;
    if (!w) return null;
    const perf = () => (w.performance && typeof w.performance.now === 'function' ? w.performance.now() : Date.now());
    let avanceMax = () => ((w.GAME && w.GAME.ABSENCE_MAX_H) || REGLES.absenceH) * 3600e3;
    const m = creer({ tel: () => Date.now(), perf, avanceMax: () => avanceMax() });
    let stockage = null; try { stockage = w.localStorage; } catch (e) { stockage = null; }
    try { m.charger(JSON.parse(stockage ? stockage.getItem(CLE) || 'null' : 'null')); } catch (e) { /* rien */ }
    function sauver() { const e = m.etat(); try { if (stockage) stockage.setItem(CLE, JSON.stringify(e)); } catch (x) { /* stockage indisponible */ } return e; }
    const enLigne = () => !(w.navigator && w.navigator.onLine === false);
    function avecDelai(p, ms) { let t = 0; return Promise.race([p, new Promise((r) => { t = setTimeout(() => r(null), ms); })]).finally(() => clearTimeout(t)); }
    // 1. l'en-tête Date de la page elle-même : GitHub Pages en ligne, le serveur de test en local
    async function mesurerPage() {
      if (!/^https?:$/.test(w.location.protocol) || typeof w.fetch !== 'function') return null;
      const url = new URL(w.location.href); url.hash = ''; url.search = '?heure=' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      let ctrl = null; try { ctrl = new AbortController(); } catch (e) { ctrl = null; }
      const t0 = perf();
      const res = await avecDelai(w.fetch(url.href, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined }).catch(() => null), REGLES.delaiMax);
      if (!res) { try { if (ctrl) ctrl.abort(); } catch (e) { /* rien */ } return null; }
      const t1 = perf(), tel = Date.now();
      if (res.type === 'opaque' || t1 - t0 > REGLES.allerRetourMax) return null;
      const d = lireEnTeteDate(res.headers.get('date'));
      return date(d) ? { ms: estimer(d, 1000, t1 - t0, tel), perf: t1, source: 'page' } : null;
    }
    // 2. le classement Supabase (fournil_heure), seulement pour qui l'a rejoint
    async function mesurerSupabase() {
      const C = w.CLASSEMENT; if (!C || typeof C.appeler !== 'function' || typeof C.lireConfig !== 'function') return null;
      const config = C.lireConfig(w.FOURNIL_CONFIG); if (!config) return null;
      let rejoint = false; try { rejoint = !!(C.lireEtat && C.lireEtat(stockage).rejoint); } catch (e) { rejoint = false; }
      if (!rejoint) return null;
      const t0 = perf();
      const r = await C.appeler(config, 'fournil_heure', {}, { fetch: (u, i) => w.fetch(u, i), enLigne, delaiMax: REGLES.delaiMax });
      const t1 = perf(), tel = Date.now(), ms = r && r.etat === 'ok' && r.data ? +r.data.ms : NaN;
      if (!date(ms) || t1 - t0 > REGLES.allerRetourMax) return null;
      return { ms: estimer(ms, 0, t1 - t0, tel), perf: t1, source: 'supabase' };
    }
    let enCours = null, derniereLecture = -Infinity, derniereTentative = -Infinity;
    function synchroniser() { // rend une promesse : true si une heure sûre vient d'arriver
      if (enCours) return enCours;
      enCours = (async () => {
        if (!enLigne()) return false;
        derniereTentative = perf();
        let mes = null;
        try { mes = await mesurerPage(); } catch (e) { mes = null; }
        if (!mes) { try { mes = await mesurerSupabase(); } catch (e) { mes = null; } }
        if (!mes) return false;
        m.noterHeureSure(mes.ms, mes.perf, mes.source); derniereLecture = perf();
        sauver();
        return true;
      })().catch(() => false).finally(() => { enCours = null; });
      return enCours;
    }
    let premiere = synchroniser(), demarre = false; // la lecture part dès le chargement du script, pendant que la sauvegarde se lit
    async function attendre(p) { const ok = await avecDelai(p, o.attente || REGLES.attente); return ok === true; }
    async function pret() { // le lancement : l'heure sûre (2,5 s au plus), puis le temps du jeu est posé
      const ok = await attendre(premiere);
      if (!demarre) { demarre = true; m.demarrer(); } else if (!ok) m.recaler(false);
      return m.info();
    }
    async function retour() { // le retour dans le jeu (la page redevient visible) : une heure sûre fraîche, sinon le téléphone borné
      const ok = await attendre(synchroniser());
      if (!demarre) { demarre = true; m.demarrer(); } else if (!ok) m.recaler(false);
      return m.info();
    }
    // toutes les 30 min quand la page est visible ; après un échec, un nouvel essai 5 min plus tard (pas une requête par minute dans l'artefact Claude)
    setInterval(() => { if (!(w.document && w.document.visibilityState === 'hidden') && perf() - derniereLecture >= REGLES.periode && perf() - derniereTentative >= REGLES.reessai) synchroniser(); }, 60e3);
    try { w.addEventListener('online', () => { synchroniser(); }); } catch (e) { /* rien */ }
    return {
      maintenant: m.maintenant, pret, retour, synchroniser, sauver, info: m.info, etat: m.etat, charger: m.charger, pousser: m.pousser,
      regler(r) { if (r && typeof r.avanceMax === 'function') avanceMax = r.avanceMax; },
    };
  }
  // sans fenêtre (ou si navigateur() échoue) : l'heure du téléphone, toujours croissante
  function secours() {
    const m = creer({ tel: () => Date.now(), perf: () => Date.now() }); m.demarrer();
    return { maintenant: m.maintenant, pret: async () => m.info(), retour: async () => m.info(), synchroniser: async () => false, sauver: m.etat, info: m.info, etat: m.etat, charger: m.charger, pousser: m.pousser, regler() {} };
  }

  return { CLE, REGLES, lireEnTeteDate, estimer, creer, navigateur, secours };
});
