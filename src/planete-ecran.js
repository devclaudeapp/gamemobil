/* LE FOURNIL — la maquette de l'écran « Ma chaîne » : seulement avec ?planete=1 dans l'adresse (sans lui, rien ne change : ni bouton, ni
   écran). Un bouton rond dans le coin de la boutique ouvre la petite planète (src/planete.js) en plein écran, avec une boutique par numéro de
   la n°1 à st.boutiques − 1, chacune dans son quartier (GAME.quartierDe) et à son standing (GAME.standingDe). Le gérant et les jetons à
   prendre sont des valeurs factices : le lot « Ma chaîne » les donnera (CHAINE.liste) ; « Entrer » ne fait encore que l'annoncer.
   La boutique, derrière, ne se dessine plus tant que l'écran est ouvert (src/ui.js, comme pour l'Atelier). */
const PLANETE_ECRAN = (() => {
  'use strict';
  const actif = typeof location !== 'undefined' && /[?&]planete=1(&|$)/.test(location.search) && typeof PLANETE !== 'undefined' && PLANETE.actif;
  const API = { actif, ouvert: false, ouvrir: () => false, fermer() {} };
  if (!actif) return API;
  const G = GAME, $ = (s) => document.querySelector(s);
  const L = '#4A3328';
  const ICONE = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${L}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11.3" cy="13.2" r="8" fill="#A8D8FF"/><path d="M5.1 11c1.5-1 3.4-.6 4.1.8.6 1.2 2 1.5 2.4 2.7.4 1.3-.6 2.5-2 2.5-2.1 0-4.2-1.8-4.6-4z" fill="#86E0BC" stroke-width="1.6"/><path d="M13.4 6.6c1.7.5 2.6 1.6 2.1 2.8-.4 1 .6 2 1.9 2.2" stroke-width="1.6"/><path d="M17.2 8.2V2.6l3.6 1.4-3.6 1.4" fill="#FFA3B6"/></svg>`;
  const CLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="4.4" fill="#FFC84A" stroke="#4A3328" stroke-width="1.8"/><circle cx="8" cy="12" r="1.5" fill="#FFF3C4"/><path d="M12.4 12H21M18 12v3M15.4 12v2.2" stroke="#4A3328" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const FACTICES = [0, 2, 0, 5, 1, 0, 3]; // les jetons à prendre de la maquette (le lot « Ma chaîne » les comptera)
  let el = null;
  function fiches(N) {
    const out = []; for (let n = 1; n < N; n++) out.push({ n, quartier: G.QUARTIERS[G.quartierDe(n)].id, standing: G.standingDe(n), jetons: FACTICES[n % FACTICES.length], gerant: null, or: false });
    return out;
  }
  const etat = () => (typeof UI !== 'undefined' && UI.st ? UI.st : null);
  const qualite = () => { try { return (typeof SCENE !== 'undefined' && SCENE.stats && SCENE.stats.qualite) || 'haute'; } catch (e) { return 'haute'; } };
  const echap = (e) => { if (e.key === 'Escape' && API.ouvert) fermer(); };
  // o (tests, captures) : { boutiques (le numéro de la boutique en cours, à la place de st.boutiques), qualite, heure (sinon l'heure de Paris,
  // celle du ciel de la boutique) }
  const heureParis = () => { try { return G.heureParis(Date.now()); } catch (e) { return new Date().getHours(); } };
  function ouvrir(o) {
    if (API.ouvert) return true; o = o || {};
    const st = etat(), N = Math.max(1, Math.floor(o.boutiques || (st && st.boutiques) || 1)), liste = fiches(N);
    const gagnes = G.QUARTIERS.filter((q) => !q.boutique || q.boutique <= N).length, total = liste.reduce((s, f) => s + f.jetons, 0);
    const sous = `${liste.length ? `${liste.length} boutique${liste.length > 1 ? 's' : ''} · ` : ''}${gagnes}/${G.QUARTIERS.length} quartiers`;
    el = document.createElement('div'); el.id = 'planete'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pl-titre');
    el.innerHTML = `<div class="pl-vue"></div><div class="at-haut"><button type="button" class="at-fermer" data-pl="fermer" aria-label="Fermer la planète"><i class="ico">${(typeof ICONS !== 'undefined' && ICONS.UI.fermer) || '×'}</i></button>
      <div class="at-titre"><b id="pl-titre">Ma chaîne</b><small>${sous}</small></div>${total ? `<span class="pl-jetons" aria-label="${total} jetons de chaîne à prendre dans tes boutiques">${CLE}<b>${total}</b></span>` : ''}</div>`;
    document.body.appendChild(el); API.ouvert = true;
    el.querySelector('[data-pl="fermer"]').addEventListener('click', fermer); document.addEventListener('keydown', echap);
    const ok = PLANETE.ouvrir(el.querySelector('.pl-vue'), liste, { qualite: o.qualite || qualite(), boutiques: N, onEntrer, heure: o.heure != null ? o.heure : heureParis() });
    if (!ok) el.querySelector('.pl-vue').innerHTML = '<p class="pl-sans">La petite planète a besoin de la 3D, qui n’est pas disponible sur cet appareil.</p>';
    else if (!liste.length) { const p = document.createElement('p'); p.className = 'pl-sans pl-vide'; p.textContent = 'Ta chaîne commence avec ta 2e boutique : chaque ancienne boutique viendra s’installer ici, dans son quartier.'; el.appendChild(p); }
    return ok;
  }
  function onEntrer(n, etiquette) { // la maquette : on annonce seulement (le lot « Ma chaîne » ouvrira la boutique dans la scène)
    const b = etiquette && etiquette.querySelector('.pl-et-entrer'); if (!b) return; b.textContent = 'Bientôt : entrer dans la boutique'; b.classList.add('non'); b.disabled = true;
  }
  function fermer() {
    if (!API.ouvert) return; PLANETE.fermer(); document.removeEventListener('keydown', echap); if (el) el.remove(); el = null; API.ouvert = false;
  }
  function poserBouton() { // le bouton rond, en tête du coin de la boutique
    const coin = $('#coin'); if (!coin || $('#b-planete')) return;
    const b = document.createElement('button'); b.id = 'b-planete'; b.className = 'rond'; b.type = 'button'; b.setAttribute('aria-label', 'Ma chaîne : la petite planète'); b.innerHTML = `<i class="ico">${ICONE}</i>`;
    b.addEventListener('click', () => ouvrir()); coin.insertBefore(b, coin.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poserBouton); else setTimeout(poserBouton, 0);
  return Object.assign(API, { ouvrir, fermer, ICONE });
})();
