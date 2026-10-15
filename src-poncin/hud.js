/* OPÉRATION PONCIN — l'affichage tête haute, en DOM par-dessus la 3D : viseur dynamique (s'élargit avec la dispersion, rouge sur
   une cible, s'efface en visée et disparaît en course), point rouge et lunette en surimpression quand on vise (selon
   A.visee.viseur : 'point' / 'point rouge' à vise ≥ 0,7, 'lunette' à vise ≥ 0,85, 'fer' / 'aucun' : un petit point blanc), marqueur
   de touche, chiffres de dégâts, vie et armure, icône de posture (debout, accroupi, couché, glissade, course), les deux emplacements
   d'armes (pastilles : icône, « 30 | 120 », « ∞ » pour la réserve de l'arme de secours ; au doigt, toucher l'autre pastille change
   d'arme, toucher celle en main recharge), anneau de recharge, chrono (« ∞ » sans limite), score et objectif (« premier à N », ou
   « Encore en lice : N » en « dernier debout »), « Manche 2/3 » et le bandeau de manche (début ; vainqueur à la fin), fil des
   éliminations, minicarte ronde de Poncin (canvas : bâtiments, eau, rues, la zone jouée — sa limite, le dehors grisé —, ta position et
   ton cap, les ennemis vus), « Limite de la zone » à moins de 3 m du bord, flèches de direction des dégâts, flash rouge quand on est
   touché, refus (« Pas la place de te coucher »), tableau des scores (6 lignes, l'objectif en tête, les manches gagnées en « dernier
   debout »), écran de fin, annonces. PHUD.vignette(canvas, idZone) peint la zone sur la carte pour le panneau des réglages (ui.js).
   Réglages de la partie : jeu.reglages (normalisés), sinon jeu.options complétées par ceux que PUI passe à reinit({ reglages }).
   Manches (contrat du groupe des règles, lu avec un repli tolérant) : jeu.manche { n, total, enLice: [ids], fin?, gagnees? },
   événements { t: 'manche', quoi: 'debut' | 'fin', n, total, vainqueur } et { t: 'elimine', id } ; une 'annonce' du même pas qu'un
   événement 'manche' n'est pas montrée (le bandeau le dit déjà).
   Les libellés et les icônes des armes viennent de PREGLES.ARMES (nom, classe ; repli tolérant si un champ manque) :
   PHUD.iconeArme(id), PHUD.nomArme(id), PHUD.classeArme(id), PHUD.nomClasse(classe) servent aussi aux menus (ui.js).
   Rien n'est écrit dans le DOM si la valeur n'a pas changé ; les animations courtes (touche, chiffres, flèches) sont menées à la main,
   sans reflow. */
const PHUD = (() => {
  'use strict';
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let racine = null, actions = {}, W = 1, H = 1, DPR = 1, tactile = false;
  let jeuVu = null, moi = null, idMoi = 'moi', tPrec = 0, px = 0, pz = 0, vitesse = 0, gonfle = 0, tMort = -1, parQui = null, armeMort = '', scoresOuverts = false, scoresT = 0, finie = false;
  const el = {}; // les éléments
  const vu = {}; // les dernières valeurs écrites
  const coupsDe = new Map(); // id → dernier tir (temps de jeu) : un tireur se trahit sur la minicarte
  let vusCache = new Map(), vusT = -1, objets = [], objetsT = -1, carteT = 0;

  // ─── les armes : libellés et icônes (PREGLES.ARMES : nom, classe, role ; repli si un champ manque) ───
  const RG = () => (typeof PREGLES !== 'undefined' ? PREGLES : null);
  const estArme = (id) => { const R = RG(); return !!R && (R.estArme ? R.estArme(id) : !!(R.ARMES || []).find((a) => a.id === id)); };
  const armeDe = (id) => (estArme(id) ? RG().arme(id) : null);
  // les classes des blasters d'avant (régime historique, en attendant l'arsenal du contrat)
  const CLASSE_HIST = { rafale: 'fusil', carabine: 'fusil', pompe: 'pompe', precision: 'sniper', petoire: 'pistolet', arroseuse: 'mitraillette', arrosoir: 'mitraillette' };
  const NOMS_CLASSES = { fusil: 'Fusil d’assaut', mitraillette: 'Mitraillette', pompe: 'Fusil à pompe', sniper: 'Fusil de précision', pistolet: 'Pistolet' };
  function classeArme(id) { const A = armeDe(id); return (A && A.classe) || CLASSE_HIST[id] || (A && A.role === 'secondaire' ? 'pistolet' : 'fusil'); }
  function nomClasse(c) { const R = RG(), v = R && R.CLASSES ? R.CLASSES[c] : null; return typeof v === 'string' ? v : (v && (v.nom || v.libelle)) || NOMS_CLASSES[c] || String(c || ''); }
  function nomArme(id) { const A = armeDe(id); return (A && A.nom) || (id ? String(id) : ''); }
  // les silhouettes (profil, canon à droite), dessinées pour 64 × 24 : métal, bois, polymère, kaki
  const C = { m: '#4A4F5F', n: '#363A47', b: '#B57240', k: '#6F7A4E', i: '#A3AAB8', r: '#FF4D6D' };
  const P = (d, c) => `<path d="${d}" fill="${C[c]}"/>`;
  const FORMES = {
    ak74: P('M2 8.5L15 9.5V14L3.5 17.5Q1.5 18 1.6 16Z', 'b') + P('M14 8H40V13.5H14Z', 'm') + P('M40 8.6H49V13H40Z', 'b') + P('M49 9.3H62V11H49ZM58.5 6.8H60V9.3H58.5Z', 'm') + P('M28 13.5H34Q35 18 38.5 21.5L33.5 23Q30 19 28 13.5Z', 'n') + P('M18 13.5H22.5L20.5 20H16.5Z', 'b'),
    m4: P('M2 9H12V13.5L4 15H2ZM12 10H16V12H12Z', 'n') + P('M15 8H38V13.5H15Z', 'm') + P('M38 8.4H50V12.8H38Z', 'n') + P('M50 9.6H62V11H50Z', 'm') + P('M24 4.5H32V8H24Z', 'n') + P('M28 13.5H33L34.5 21H29.5Z', 'n') + P('M18 13.5H22L20.3 19.5H16.5Z', 'n') + '<circle cx="30.6" cy="6.2" r="1.1" fill="#FF4D6D"/>',
    ump: P('M2 9H13V11.5H5V14H2Z', 'n') + P('M12 7H42V14H12Z', 'n') + P('M16 5.5H34V7H16Z', 'm') + P('M42 9.5H50V11.5H42Z', 'm') + P('M30 14H35V22H30Z', 'n') + P('M17 14H21.5L20 20.5H16Z', 'n'),
    mp9: P('M2 8H5V14H2ZM4 9.5H14V11H4Z', 'n') + P('M14 8H40V13H14Z', 'm') + P('M40 9.5H46V11H40Z', 'm') + P('M20 13H25L24 23H19Z', 'n') + P('M33 13H36V18H33Z', 'n'),
    pompe: P('M2 9L16 9.8V13.8L3 17Q1.6 17.3 1.6 15.6Z', 'b') + P('M15.5 8.4H30V13.2H15.5Z', 'm') + P('M30 8.6H62V10.4H30ZM30 11H52V12.8H30Z', 'm') + P('M36 10.6H47V14.2H36Z', 'b') + P('M19 13.2H23L22 16H19.5Z', 'm'),
    m24: P('M2 9.5L22 10V14.2H12L9 18.5H5L6.5 15L2.6 16.4Z', 'b') + P('M22 10.2H44V13.4H22Z', 'b') + P('M18 8.6H30V11.4H18Z', 'm') + P('M44 10.2H62V11.6H44Z', 'm') + P('M19 4.2H36V7.4H19ZM17 3.4H21V8.2H17ZM34 3H38.5V8.6H34ZM24 7.4H26V8.8H24ZM30 7.4H32V8.8H30Z', 'n'),
    awm: P('M2 8.5H24V14.5H17L14.5 19H9.5L11 14.6H2Z', 'k') + P('M24 9.4H44V13.4H24Z', 'k') + P('M44 10H58V11.6H44Z', 'm') + P('M58 9.2H62.4V12.4H58Z', 'n') + P('M27 13.4H31V16.5H27Z', 'n') + P('M19 4.2H36V7.4H19ZM17 3.4H21V8.2H17ZM34 3H38.5V8.6H34ZM24 7.4H26V8.8H24ZM30 7.4H32V8.8H30Z', 'n'),
    m1911: P('M14 6H46V11.5H14Z', 'i') + P('M16 11.5H44V14H16Z', 'm') + P('M17 14H26L24 23H14.5Z', 'b') + '<path d="M26 14H32.5Q32.5 18 29 18H26" fill="none" stroke="#2B2A4C" stroke-width="1.6"/>',
    p226: P('M14 6H46V11.8H14Z', 'n') + P('M16 11.8H45V14.4H16Z', 'm') + P('M17 14H26.5L24.5 23H14.5Z', 'n') + '<path d="M26.5 14.4H33Q33 18.4 29.4 18.4H26.5" fill="none" stroke="#2B2A4C" stroke-width="1.6"/>',
  };
  const FORME_CLASSE = { fusil: 'm4', mitraillette: 'ump', pompe: 'pompe', sniper: 'm24', pistolet: 'p226' };
  const icones = new Map();
  function iconeArme(id) { // le SVG d'une arme (le modèle, sinon la classe), gardé en cache
    if (!id) return '';
    if (icones.has(id)) return icones.get(id);
    const A = armeDe(id), m = A && typeof A.modele === 'string' ? A.modele.replace(/\.glb$/, '') : '';
    const f = FORMES[id] || FORMES[m] || FORMES[FORME_CLASSE[classeArme(id)]] || FORMES.m4;
    const s = `<svg viewBox="0 0 64 24" aria-hidden="true"><g stroke="#2B2A4C" stroke-width="1.3" stroke-linejoin="round">${f}</g></svg>`;
    icones.set(id, s); return s;
  }
  // les viseurs : 'lunette' ; 'point' (ou 'point rouge') ; 'fer' (ou 'aucun') : un petit point blanc
  function viseurDe(A) { const v = A && A.visee && A.visee.viseur; return v === 'lunette' ? 'lunette' : v === 'point' || v === 'point rouge' ? 'point' : 'fer'; }
  const ICO = (n) => (typeof PCONTROLES !== 'undefined' && PCONTROLES.ICONES && PCONTROLES.ICONES[n]) || '';
  const SVG_COEUR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5l-1.4-1.3C5.4 14.5 2 11.4 2 7.6 2 4.5 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1C13.1 2.8 14.8 2 16.5 2 19.6 2 22 4.5 22 7.6c0 3.8-3.4 6.9-8.6 11.6z" fill="#FF6B8B" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  const SVG_BOUCLIER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="#7FB3FF" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  const SVG_SAC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.5a4 4 0 0 1 8 0V7" fill="none" stroke="#2B2A4C" stroke-width="2.2"/><path d="M4.5 9.5A2.5 2.5 0 0 1 7 7h10a2.5 2.5 0 0 1 2.5 2.5l.8 9A2.5 2.5 0 0 1 17.8 21H6.2a2.5 2.5 0 0 1-2.5-2.5z" fill="#D88F4E" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/><path d="M8 12h8" stroke="#2B2A4C" stroke-width="2" stroke-linecap="round"/></svg>';
  const SVG_CLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="12" r="4.5" fill="#FFC23D" stroke="#2B2A4C" stroke-width="2.2"/><path d="M12 12h10M18 12v4M21 12v3" fill="none" stroke="#2B2A4C" stroke-width="2.4" stroke-linecap="round"/><circle cx="7.5" cy="12" r="1.6" fill="#2B2A4C"/></svg>';
  const SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.5" height="14" rx="1.6" fill="#2B2A4C"/><rect x="13.5" y="5" width="4.5" height="14" rx="1.6" fill="#2B2A4C"/></svg>';
  const SVG_SCORES = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#FFC84A" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v3M8 20h8l-1-3H9z" fill="none" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg>';
  // la lunette : l'écran noir percé d'un cercle (CSS), et dans le cercle le réticule, les graduations et un léger reflet bleuté
  const LUNETTE = `<svg class="h-lun-ret" viewBox="-100 -100 200 200" aria-hidden="true"><defs><radialGradient id="h-reflet" cx="-30" cy="-35" r="120" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#BFE3FF" stop-opacity=".16"/><stop offset=".6" stop-color="#7FB3FF" stop-opacity=".05"/><stop offset="1" stop-color="#0B1830" stop-opacity=".35"/></radialGradient></defs>
    <circle r="100" fill="url(#h-reflet)"/><path d="M-100 0H-6M6 0H100M0 -100V-6M0 6V100" stroke="#0A0B10" stroke-width="1.1"/><path d="M-100 0H-42M42 0H100M0 42V100" stroke="#0A0B10" stroke-width="3.2"/>
    ${[-30, -20, -10, 10, 20, 30].map((v) => `<path d="M${v} -2.6V2.6M-2.6 ${v}H2.6" stroke="#0A0B10" stroke-width="1"/>`).join('')}<circle r="1.2" fill="#FF4D6D"/><circle r="99" fill="none" stroke="#000" stroke-width="3"/></svg>`;

  // ─── construction ───
  function init(r, o) {
    racine = r; o = o || {}; actions = o.actions || o || {};
    if (!racine) return;
    racine.classList.add('hud');
    racine.innerHTML = `
      <div class="h-vignette" aria-hidden="true"></div>
      <div class="h-flash" aria-hidden="true"></div>
      <div class="h-noms" aria-hidden="true">${'<span class="h-nom"></span>'.repeat(5)}</div>
      <div class="h-nombres" aria-hidden="true">${'<b class="h-nombre"></b>'.repeat(12)}</div>
      <div class="h-centre" aria-hidden="true">
        <div class="h-viseur"><i class="h-v h-v1"></i><i class="h-v h-v2"></i><i class="h-v h-v3"></i><i class="h-v h-v4"></i><i class="h-rond"></i><i class="h-point"></i></div>
        <i class="h-pr"></i>
        <svg class="h-recharge" viewBox="0 0 64 64"><circle class="fond" cx="32" cy="32" r="26"/><circle class="arc" cx="32" cy="32" r="26" pathLength="100"/></svg>
        <div class="h-touche"><i></i><i></i><i></i><i></i></div>
        ${'<div class="h-fleche"><i></i></div>'.repeat(4)}
        <div class="h-sous"></div>
      </div>
      <div class="h-haut">
        <div class="h-carte"><canvas></canvas><span class="h-n">N</span></div>
        <div class="h-tableau">
          <div class="h-equipe h-moi"><span class="h-pastille"></span><b>0</b></div>
          <div class="h-chrono"><em class="h-manche" hidden>Manche 1/3</em><b>3:00</b><small>premier à 25</small></div>
          <div class="h-equipe h-eux"><span class="h-pastille"></span><b>0</b></div>
        </div>
        <div class="h-btns">
          <button type="button" class="h-btn h-b-scores" aria-label="Tableau des scores">${SVG_SCORES}</button>
          <button type="button" class="h-btn h-b-pause" aria-label="Pause">${SVG_PAUSE}</button>
        </div>
      </div>
      <div class="h-fil" aria-live="polite"></div>
      <div class="h-annonces" aria-live="polite"><div class="h-annonce"></div></div>
      <div class="h-bandeau" aria-live="polite"><b class="h-bandeau-t"></b><small class="h-bandeau-s"></small></div>
      <div class="h-bas">
        <span class="h-posture" aria-hidden="true"></span>
        <div class="h-vie">
          <div class="h-ligne h-armure-l">${SVG_BOUCLIER}<div class="h-barre armure"><i></i></div><b class="h-armure-n">0</b></div>
          <div class="h-ligne">${SVG_COEUR}<div class="h-barre vie"><i></i><em></em></div><b class="h-vie-n">100</b></div>
        </div>
        <div class="h-armes">${[0, 1].map((i) => `<button type="button" class="h-arme" data-slot="${i}" aria-label="${i ? 'Arme secondaire' : 'Arme principale'}"><b class="h-slot">${i + 1}</b><span class="h-arme-ico"></span><span class="h-mun"><b class="h-mun-n">0</b><small class="h-mun-r">| 0</small></span></button>`).join('')}</div>
      </div>
      <div class="h-ext" aria-live="polite">
        <div class="h-sac" hidden><span class="h-sac-ico" aria-hidden="true">${SVG_SAC}</span><b class="h-sac-n">0</b><small class="h-sac-max"></small><span class="h-poids" aria-hidden="true"><i></i></span><span class="h-cle" title="La clé du coffre-fort">${SVG_CLE}</span><span class="h-sac-v"><i class="h-piece" aria-hidden="true"></i><b>0</b></span></div>
        <div class="h-boussole h-largage" hidden><i class="h-bo-fl" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l7 18-7-4-7 4z" fill="#FF6B5A" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg></i><span class="h-bo-t"><b>Largage</b><small></small></span></div>
        <div class="h-contrat" hidden></div>
        <div class="h-boss" hidden><b></b><div class="h-jauge-b"><i></i></div></div>
        <span class="h-bruit" aria-hidden="true"><svg viewBox="0 0 34 22"><path d="M4 11h3M11 6c2 3 2 7 0 10M17 3c4 5 4 11 0 16M23 1c5 6 5 14 0 20" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg></span>
        <div class="h-etiquettes">${'<span class="h-etq"></span>'.repeat(10)}</div>
        <div class="h-boussole" hidden><i class="h-bo-fl" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2l7 18-7-4-7 4z" fill="#5FD3A4" stroke="#2B2A4C" stroke-width="2.2" stroke-linejoin="round"/></svg></i><span class="h-bo-t"><b></b><small></small></span></div>
        <div class="h-jauge" hidden><small class="h-jauge-t"></small><div class="h-jauge-b"><i></i></div></div>
        <div class="h-voile-ext" hidden><div class="h-voile-carte"><small></small><b></b><span></span></div></div>
      </div>
      <div class="h-ramasse"></div>
      <div class="h-refus" aria-live="polite"></div>
      <div class="h-limite" hidden>Limite de la zone</div>
      <div class="h-mort" hidden><div class="h-mort-carte"><small>Oups !</small><b class="h-mort-par">Repeint !</b><span class="h-mort-arme"></span><div class="h-mort-retour">Retour dans <b>3</b></div><div class="h-mort-lice" hidden></div></div></div>
      <div class="h-scores" hidden><div class="h-scores-carte"></div></div>
      <div class="h-fin" hidden></div>`;
    const q = (s) => racine.querySelector(s);
    Object.assign(el, {
      vignette: q('.h-vignette'), flash: q('.h-flash'), pr: q('.h-pr'), centre: q('.h-centre'), viseur: q('.h-viseur'), vs: Array.from(racine.querySelectorAll('.h-v')), rond: q('.h-rond'),
      recharge: q('.h-recharge'), rechargeArc: q('.h-recharge .arc'), touche: q('.h-touche'), fleches: Array.from(racine.querySelectorAll('.h-fleche')), sous: q('.h-sous'),
      carte: q('.h-carte canvas'), nord: q('.h-n'), chrono: q('.h-chrono b'), objectif: q('.h-chrono small'), scoreMoi: q('.h-moi b'), scoreEux: q('.h-eux b'), pastMoi: q('.h-moi .h-pastille'), pastEux: q('.h-eux .h-pastille'),
      fil: q('.h-fil'), annonce: q('.h-annonce'), vieBarre: q('.h-barre.vie i'), vieFant: q('.h-barre.vie em'), vieN: q('.h-vie-n'), armureL: q('.h-armure-l'), armureBarre: q('.h-barre.armure i'), armureN: q('.h-armure-n'), vie: q('.h-vie'),
      posture: q('.h-posture'), refus: q('.h-refus'), limite: q('.h-limite'), ramasse: q('.h-ramasse'),
      bandeau: q('.h-bandeau'), bandeauT: q('.h-bandeau-t'), bandeauS: q('.h-bandeau-s'), manche: q('.h-manche'), mortRetourL: q('.h-mort-retour'), mortLice: q('.h-mort-lice'), mortPetit: q('.h-mort-carte small'),
      mort: q('.h-mort'), mortPar: q('.h-mort-par'), mortArme: q('.h-mort-arme'), mortRetour: q('.h-mort-retour b'), scores: q('.h-scores'), scoresCarte: q('.h-scores-carte'), fin: q('.h-fin'),
      noms: Array.from(racine.querySelectorAll('.h-nom')), nombres: Array.from(racine.querySelectorAll('.h-nombre')),
      sac: q('.h-sac'), sacN: q('.h-sac-n'), sacMax: q('.h-sac-max'), sacV: q('.h-sac-v b'), boussole: q('.h-boussole:not(.h-largage)'), boFl: q('.h-boussole:not(.h-largage) .h-bo-fl'), boT: q('.h-boussole:not(.h-largage) .h-bo-t b'), boS: q('.h-boussole:not(.h-largage) .h-bo-t small'),
      largage: q('.h-largage'), laFl: q('.h-largage .h-bo-fl'), laS: q('.h-largage .h-bo-t small'), contrat: q('.h-contrat'), boss: q('.h-boss'), bossN: q('.h-boss b'), bossB: q('.h-boss .h-jauge-b i'), bruit: q('.h-bruit'), poids: q('.h-poids i'),
      etqs: Array.from(racine.querySelectorAll('.h-etq')),
      jauge: q('.h-jauge'), jaugeT: q('.h-jauge-t'), jaugeB: q('.h-jauge .h-jauge-b i'), voileExt: q('.h-voile-ext'), voileP: q('.h-voile-carte small'), voileB: q('.h-voile-carte b'), voileS: q('.h-voile-carte span'), eqMoi: q('.h-moi'), eqEux: q('.h-eux'),
    });
    slots = Array.from(racine.querySelectorAll('.h-arme')).map((b) => ({ el: b, ico: b.querySelector('.h-arme-ico'), n: b.querySelector('.h-mun-n'), r: b.querySelector('.h-mun-r'), id: null, m: null, res: null, main: null, bas: null }));
    for (const s of slots) s.el.addEventListener('pointerdown', (e) => { // au doigt : l'autre pastille change d'arme, celle en main recharge
      e.preventDefault(); e.stopPropagation();
      const i = slots.indexOf(s); if (!moi || !s.id) return;
      if (s.main) { if (actions.recharger) actions.recharger(); } else if (actions.arme) actions.arme(i);
    });
    // la lunette : à côté du HUD, sous les commandes (le HUD passe au-dessus des commandes, la lunette ne doit pas les cacher)
    el.lunette = document.createElement('div'); el.lunette.className = 'h-lunette'; el.lunette.setAttribute('aria-hidden', 'true'); el.lunette.innerHTML = LUNETTE;
    if (racine.parentNode) racine.parentNode.insertBefore(el.lunette, racine); else racine.appendChild(el.lunette);
    nombres = el.nombres.map((e) => ({ el: e, t: -1, x: 0, y: 0, z: 0, dx: 0 }));
    fleches = el.fleches.map((e) => ({ el: e, t: -1, x: 0, z: 0 }));
    noms = el.noms.map((e) => ({ el: e, id: null, txt: '', vu: false }));
    ctxCarte = el.carte.getContext('2d');
    q('.h-b-pause').addEventListener('click', () => { if (actions.pause) actions.pause(); });
    q('.h-b-scores').addEventListener('click', () => scores(!scoresOuverts));
    el.scores.addEventListener('click', () => scores(false));
    el.fin.addEventListener('click', (e) => { const b = e.target.closest('[data-fin]'); if (!b || b.disabled) return; const a = b.dataset.fin; if (typeof actions[a] === 'function') { try { if (actions[a](b) === true && a === 'reclamer') { b.disabled = true; b.textContent = 'Réclamé'; } } catch (err) { console.warn('[Poncin] fin', a, err); } } }); // rejouer, menu, salon…
    taille();
  }
  let nombres = [], fleches = [], noms = [], slots = [], ctxCarte = null, tailleCarte = 112;
  function taille(w, h) {
    if (!racine) return;
    W = w || racine.clientWidth || window.innerWidth; H = h || racine.clientHeight || window.innerHeight; DPR = Math.min(2, window.devicePixelRatio || 1);
    tailleCarte = Math.round(Math.max(84, Math.min(124, H * 0.29)));
    el.carte.width = Math.round(tailleCarte * DPR); el.carte.height = Math.round(tailleCarte * DPR);
    racine.style.setProperty('--hc', tailleCarte + 'px'); // (le sac de l'Extraction se pose sous la minicarte)
    el.carte.style.width = el.carte.style.height = tailleCarte + 'px'; el.carte.parentNode.style.width = el.carte.parentNode.style.height = tailleCarte + 'px';
    el.lunette.style.setProperty('--rl', Math.round(0.42 * Math.min(W, H)) + 'px'); // le rayon du cercle de la lunette
    vu.ecart = -1;
  }

  // ─── la minicarte : le fond (bâtiments, eau, rues, végétation) peint une fois autour de la zone jouée, la zone par-dessus ───
  // La zone vient de jeu.zone.limite (sinon monde.limite) : { centre, rayon } (un cercle), ou la limite v2 { forme: 'cercles' | 'poly' |
  // 'carre', cercles: [[x, z, r], …] | poly: [[x, z], …] | polys | boite: [x0, z0, x1, z1] | marge, aretes: [[x0, z0, x1, z1], …] ou à plat,
  // dedans(x, z)?, distance(x, z)? } ; englobant : jeu.zone.englobant { centre, rayon }. Hors zone : grisé ; le bord : un trait blanc.
  let fond = null, kFond = 1, Lcarte = 600, carteC = null, mondeCarte = null, ox = 0, oz = 0, fondCle = ''; // (ox, oz) : le coin nord-ouest du fond, en mètres
  let limiteVue = null, formeVue = null; // la limite de la partie et sa forme normalisée (minicarte, « Limite de la zone »)
  const nb = (v) => typeof v === 'number' && v - v === 0;
  function carte(c, m) {
    fond = null; fondCle = ''; base = null; zonesVues.clear(); carteC = c || null; mondeCarte = m || null; limiteVue = null; formeVue = null; if (!c) return;
    Lcarte = (m && m.L) || c.taille || 600;
    const a = c.zones && c.zones.arene; // en Arène, l'arène et ses abords (moins de mémoire) ; sinon tout le carré
    peindreFond(a && a.centre ? formeDe({ centre: a.centre, rayon: a.rayon }) : null);
  }
  function peindreCarte(g, c, m, x0, z0, k, W, H) { // la carte vue du ciel : (x0, z0) au coin haut-gauche, k px/m
    const PX = (v) => (v - x0) * k, PZ = (v) => (v - z0) * k, f = Math.min(1, k / 2); // f : traits plus fins quand la carte est petite
    const trace = (p) => { g.beginPath(); for (let i = 0; i < p.length; i++) { const x = PX(p[i][0]), z = PZ(p[i][1]); if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.closePath(); };
    const ligne = (l) => { g.beginPath(); for (let i = 0; i < l.length; i++) { const x = PX(l[i][0]), z = PZ(l[i][1]); if (i) g.lineTo(x, z); else g.moveTo(x, z); } };
    g.fillStyle = '#D8EDC2'; g.fillRect(0, 0, W, H);
    const VEG = { bois: '#A9D79A', vigne: '#D6E7A2', pre: '#DDF0C6', jardin: '#C6E8AE' };
    for (const v of c.vegetation || []) { if (!v.p || v.p.length < 3) continue; g.fillStyle = VEG[v.t] || '#D0EAB8'; trace(v.p); g.fill(); }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const r of c.rues || []) { if (!r.l || r.l.length < 2) continue; g.strokeStyle = '#E2D3BF'; g.lineWidth = Math.max(2.5 * f, (r.w || 5) * k) + 2 * f; ligne(r.l); g.stroke(); }
    for (const r of c.rues || []) { if (!r.l || r.l.length < 2) continue; g.strokeStyle = r.t === 'chemin' ? '#F4EBDD' : '#FFFDF8'; g.lineWidth = Math.max(2 * f, (r.w || 5) * k); ligne(r.l); g.stroke(); }
    for (const e of c.eau || []) { if (!e.p || e.p.length < 3) continue; g.fillStyle = '#8DD0F2'; trace(e.p); g.fill(); g.strokeStyle = '#5DB4E2'; g.lineWidth = 1.5 * f; g.stroke(); }
    for (const p of c.ponts || []) { if (!p.l) continue; g.strokeStyle = '#2B2A4C'; g.globalAlpha = 0.5; g.lineWidth = (p.w || 6) * k + 2 * f; ligne(p.l); g.stroke(); g.globalAlpha = 1; g.strokeStyle = '#F6E7D2'; g.lineWidth = (p.w || 6) * k; g.stroke(); }
    const BAT = { eglise: '#FFD98A', chateau: '#D9CCFF', mairie: '#FFE2A8', tour: '#FFC9A8', commerce: '#FFD0DC', annexe: '#EBDCD0', maison: '#F7CDBE' };
    const bats = (m && m.batiments) || c.batiments || [];
    g.lineWidth = 1.4 * f;
    for (const b of bats) { if (!b.p || b.p.length < 3) continue; g.fillStyle = BAT[b.t] || '#F7CDBE'; trace(b.p); g.fill(); g.strokeStyle = 'rgba(43,42,76,.55)'; g.stroke(); }
    for (const z of c.interdit || []) { if (!z.p || z.p.length < 3) continue; g.fillStyle = 'rgba(255,107,139,.22)'; trace(z.p); g.fill(); g.setLineDash([4 * f, 3 * f]); g.strokeStyle = '#E1496C'; g.lineWidth = 1.5 * f; g.stroke(); g.setLineDash([]); }
  }
  // la forme d'une limite, normalisée : { cercles, polys, rect, aretes (à plat), dedans, distance, englobant: { x, z, r }, cle } | null
  function formeDe(L, englobant) {
    if (!L || typeof L !== 'object') return null;
    const s = L.forme && typeof L.forme === 'object' ? Object.assign({}, L.forme, L) : L;
    const f = { cercles: null, polys: null, rect: null, aretes: null, dedans: null, distance: null, englobant: null, cle: '' };
    const pt = (p) => (Array.isArray(p) ? [+p[0], +p[1]] : p && nb(+p.x) ? [+p.x, +p.z] : null);
    const cercle = (c) => (Array.isArray(c) ? [+c[0], +c[1], +c[2]] : c && c.centre ? [+c.centre[0], +c.centre[1], +c.rayon] : c ? [+c.x, +c.z, +(c.r || c.rayon)] : null);
    if (s.centre && nb(+s.rayon) && +s.rayon > 0 && (!s.forme || s.forme === 'cercle' || typeof s.forme === 'object')) f.cercles = [[+s.centre[0], +s.centre[1], +s.rayon]];
    if (Array.isArray(s.cercles)) f.cercles = s.cercles.map(cercle).filter((c) => c && nb(c[0]) && nb(c[1]) && c[2] > 0);
    const P = s.polys || s.polygones || (s.poly ? [s.poly] : s.p ? [s.p] : s.points ? [s.points] : null);
    if (Array.isArray(P)) f.polys = P.map((p) => (Array.isArray(p) ? p.map(pt).filter((q) => q && nb(q[0]) && nb(q[1])) : [])).filter((p) => p.length >= 3);
    if (s.forme === 'carre' || s.boite || s.carre) {
      const b = Array.isArray(s.boite) ? s.boite : Array.isArray(s.carre) ? s.carre : null;
      if (b && b.length >= 4) f.rect = b.slice(0, 4).map(Number); else { const m = nb(+s.marge) ? +s.marge : 8, h = (nb(+s.L) ? +s.L : Lcarte) / 2; f.rect = [-h + m, -h + m, h - m, h - m]; }
    }
    const A = s.aretes;
    if (A && A.length) {
      if (Array.isArray(A[0])) { f.aretes = new Float64Array(A.length * 4); for (let i = 0; i < A.length; i++) for (let k = 0; k < 4; k++) f.aretes[i * 4 + k] = +A[i][k]; }
      else if (A.length % 4 === 0) f.aretes = A;
    }
    if (typeof L.dedans === 'function') f.dedans = (x, z) => L.dedans(x, z);
    if (typeof L.distance === 'function') f.distance = (x, z) => L.distance(x, z);
    if (f.cercles && !f.cercles.length) f.cercles = null; if (f.polys && !f.polys.length) f.polys = null;
    if (!f.cercles && !f.polys && !f.rect && !f.aretes && !f.dedans && !f.distance) return null;
    // la boîte englobante (donnée, sinon calculée sur les formes et les arêtes)
    const E = englobant || L.englobant;
    if (E && E.centre && +E.rayon > 0) f.englobant = { x: +E.centre[0], z: +E.centre[1], r: +E.rayon };
    else {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; const pris = (x, z, r) => { r = r || 0; if (x - r < x0) x0 = x - r; if (x + r > x1) x1 = x + r; if (z - r < z0) z0 = z - r; if (z + r > z1) z1 = z + r; };
      for (const c of f.cercles || []) pris(c[0], c[1], c[2]); for (const p of f.polys || []) for (const q of p) pris(q[0], q[1]); if (f.rect) { pris(f.rect[0], f.rect[1]); pris(f.rect[2], f.rect[3]); }
      if (f.aretes) for (let i = 0; i < f.aretes.length; i += 2) pris(f.aretes[i], f.aretes[i + 1]);
      f.englobant = x1 > x0 ? { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 } : { x: 0, z: 0, r: Lcarte / 2 };
    }
    const r1 = (v) => Math.round(v * 10) / 10;
    f.cle = [(f.cercles || []).map((c) => c.map(r1).join(',')).join(';'), (f.polys || []).map((p) => p.length + ':' + p[0].map(r1)).join(';'), f.rect ? f.rect.map(r1).join(',') : '', f.aretes ? f.aretes.length + ':' + r1(f.aretes[0]) + ',' + r1(f.aretes[f.aretes.length - 1]) : '', f.dedans ? 'd' : ''].join('|');
    return f;
  }
  function peindreZone(g, f, x0, z0, k, W, H, epais) { // hors zone grisé, puis le bord (blanc sur un liseré sombre)
    const PX = (v) => (v - x0) * k, PZ = (v) => (v - z0) * k;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const h = cv.getContext('2d');
    h.fillStyle = 'rgba(43,42,76,.42)'; h.fillRect(0, 0, W, H);
    let troue = false;
    h.globalCompositeOperation = 'destination-out'; h.fillStyle = '#000';
    if (f.cercles) { for (const c of f.cercles) { h.beginPath(); h.arc(PX(c[0]), PZ(c[1]), c[2] * k, 0, TAU); h.fill(); } troue = true; }
    if (f.polys) { h.beginPath(); for (const p of f.polys) { for (let i = 0; i < p.length; i++) { if (i) h.lineTo(PX(p[i][0]), PZ(p[i][1])); else h.moveTo(PX(p[i][0]), PZ(p[i][1])); } h.closePath(); } h.fill('evenodd'); troue = true; }
    if (f.rect) { h.fillRect(PX(f.rect[0]), PZ(f.rect[1]), (f.rect[2] - f.rect[0]) * k, (f.rect[3] - f.rect[1]) * k); troue = true; }
    h.globalCompositeOperation = 'source-over';
    if (!troue && f.dedans) { // sans forme : le masque de la limite, case par case (4 m)
      h.clearRect(0, 0, W, H); h.fillStyle = 'rgba(43,42,76,.42)'; const pas = 4, n = Math.ceil(W / k / pas), m = Math.ceil(H / k / pas);
      for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * pas, z = z0 + (j + 0.5) * pas; let d = true; try { d = f.dedans(x, z); } catch (e) { d = true; } if (!d) h.fillRect(Math.floor(PX(x - pas / 2)), Math.floor(PZ(z - pas / 2)), Math.ceil(pas * k) + 1, Math.ceil(pas * k) + 1); }
      troue = true;
    }
    if (troue) g.drawImage(cv, 0, 0);
    g.beginPath();
    if (f.aretes) { const A = f.aretes; for (let i = 0; i < A.length; i += 4) { g.moveTo(PX(A[i]), PZ(A[i + 1])); g.lineTo(PX(A[i + 2]), PZ(A[i + 3])); } }
    else {
      if (f.cercles) { // le bord de l'union des cercles : les bouts d'arc qui ne sont dans aucun autre cercle
        const C = f.cercles;
        for (let i = 0; i < C.length; i++) {
          const c = C[i], n = Math.max(24, Math.ceil(TAU * c[2] / 2)); let ouvert = false;
          for (let s = 0; s <= n; s++) {
            const a = s / n * TAU, am = (s + 0.5) / n * TAU, mx = c[0] + Math.cos(am) * c[2], mz = c[1] + Math.sin(am) * c[2];
            let dedans = false; for (let j = 0; j < C.length && !dedans; j++) if (j !== i) { const dx = mx - C[j][0], dz = mz - C[j][1]; dedans = dx * dx + dz * dz < (C[j][2] - 0.05) * (C[j][2] - 0.05); }
            const x = PX(c[0] + Math.cos(a) * c[2]), z = PZ(c[1] + Math.sin(a) * c[2]);
            if (!ouvert) g.moveTo(x, z); else g.lineTo(x, z);
            ouvert = !dedans && s < n;
          }
        }
      }
      if (f.polys) for (const p of f.polys) { for (let i = 0; i < p.length; i++) { if (i) g.lineTo(PX(p[i][0]), PZ(p[i][1])); else g.moveTo(PX(p[i][0]), PZ(p[i][1])); } g.closePath(); }
      if (f.rect) g.rect(PX(f.rect[0]), PZ(f.rect[1]), (f.rect[2] - f.rect[0]) * k, (f.rect[3] - f.rect[1]) * k);
    }
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(43,42,76,.6)'; g.lineWidth = epais + 2; g.stroke(); g.strokeStyle = '#FFFFFF'; g.lineWidth = epais; g.stroke();
  }
  function peindreFond(f) { // le fond de la minicarte : la boîte englobante de la zone et 80 m autour (tout le carré sans zone)
    if (!carteC) return;
    const cle = f ? f.cle : '-'; if (fond && cle === fondCle) return;
    try {
      const E = f && f.englobant, cote = E ? Math.min(Lcarte, 2 * (E.r + 80)) : Lcarte;
      ox = E ? E.x - cote / 2 : -Lcarte / 2; oz = E ? E.z - cote / 2 : -Lcarte / 2;
      kFond = Math.min(2.2, 1400 / cote);
      const S = Math.ceil(cote * kFond), cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const g = cv.getContext('2d');
      peindreCarte(g, carteC, mondeCarte, ox, oz, kFond, S, S);
      if (f) peindreZone(g, f, ox, oz, kFond, S, S, 3);
      fond = cv; fondCle = cle;
    } catch (e) { fond = null; fondCle = ''; }
  }
  function zoneDuJeu(jeu) { // la limite de la partie a changé : sa forme, et le fond repeint s'il le faut (une fois par partie, pendant le compte à rebours)
    const z = jeu.zone && typeof jeu.zone === 'object' ? jeu.zone : null, L = (z && z.limite) || (jeu.monde && jeu.monde.limite) || null;
    if (L === limiteVue) return;
    limiteVue = L; formeVue = formeDe(L, z && z.englobant); peindreFond(formeVue);
  }
  function distSeg(x, z, ax, az, bx, bz) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz; let t = l > 0 ? ((x - ax) * dx + (z - az) * dz) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = ax + dx * t - x, ez = az + dz * t - z; return Math.sqrt(ex * ex + ez * ez); }
  function distanceBord(f, x, z) { // la distance au bord de la zone, depuis l'intérieur (m)
    if (f.distance) return +f.distance(x, z);
    let d = Infinity;
    if (f.aretes) { const A = f.aretes; for (let i = 0; i < A.length; i += 4) { const s = distSeg(x, z, A[i], A[i + 1], A[i + 2], A[i + 3]); if (s < d) d = s; } return d; }
    if (f.cercles) { let m = -Infinity; for (const c of f.cercles) { const v = c[2] - Math.hypot(x - c[0], z - c[1]); if (v > m) m = v; } d = Math.min(d, m); }
    if (f.polys) for (const p of f.polys) for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; d = Math.min(d, distSeg(x, z, p[i][0], p[i][1], q[0], q[1])); }
    if (f.rect) d = Math.min(d, x - f.rect[0], f.rect[2] - x, z - f.rect[1], f.rect[3] - z);
    return d;
  }
  // la vignette du menu (onglet Carte) : la carte autour de la zone, la zone par-dessus ; la carte entière est peinte une fois
  let base = null, kBase = 1; const zonesVues = new Map();
  const ZONES_REPLI = { place: [99, 1.5, 55], eglise: [52, 78, 70], bourg: [110, 20, 190] }; // la conception (§ 7), si PZONES ne donne pas la forme
  function formeZone(id) {
    if (zonesVues.has(id)) return zonesVues.get(id);
    let f = null;
    try { // la forme que donne le module des zones (sans préparer la zone : pas de navigation dans le menu)
      if (typeof PZONES !== 'undefined') { const d = typeof PZONES.forme === 'function' ? PZONES.forme(carteC, id) : PZONES.FORMES ? PZONES.FORMES[id] : null; if (d && typeof d === 'object') f = formeDe(d.limite || d, d.englobant); }
    } catch (e) { f = null; }
    if (!f) f = formeRepli(id);
    zonesVues.set(id, f); return f;
  }
  function formeRepli(id) {
    const a = carteC && carteC.zones && carteC.zones.arene;
    if (id === 'centre' || !id) return formeDe(a && a.centre ? { centre: a.centre, rayon: a.rayon } : { centre: [0, 0], rayon: 110 });
    if (ZONES_REPLI[id]) { const c = ZONES_REPLI[id]; return formeDe({ centre: [c[0], c[1]], rayon: c[2] }); }
    if (id === 'tout') return formeDe({ forme: 'carre', marge: 8 });
    if (id === 'rivieres') { // le Veyron dans le bourg et ses deux ponts : des cercles de 45 m sur les berges, d'un pont à l'autre (60 m de plus)
      const ponts = (carteC.ponts || []).filter((p) => p && p.l), xs = []; ponts.forEach((p) => p.l.forEach((q) => xs.push(+q[0])));
      const eau = (carteC.eau || []).find((e) => /veyron/i.test(e.n || '')) || (carteC.eau || [])[0];
      if (eau && eau.p && xs.length) {
        const x0 = Math.min.apply(null, xs) - 60, x1 = Math.max.apply(null, xs) + 60, cs = [];
        for (const q of eau.p) if (q[0] >= x0 && q[0] <= x1 && cs.every((c) => Math.hypot(c[0] - q[0], c[1] - q[1]) >= 30)) cs.push([+q[0], +q[1], 45]);
        if (cs.length) return formeDe({ forme: 'cercles', cercles: cs });
      }
    }
    return formeRepli('centre');
  }
  function vignetteZone(cv, id) {
    if (!carteC || !cv || !cv.width || !cv.height) return false;
    if (!base) { kBase = Math.min(1.75, 1400 / Lcarte); const S = Math.ceil(Lcarte * kBase); base = document.createElement('canvas'); base.width = base.height = S; peindreCarte(base.getContext('2d'), carteC, mondeCarte, -Lcarte / 2, -Lcarte / 2, kBase, S, S); }
    const f = formeZone(id), W = cv.width, H = cv.height, g = cv.getContext('2d'), E = (f && f.englobant) || { x: 0, z: 0, r: Lcarte / 2 };
    const cote = Math.min(Lcarte, Math.max(240, E.r * 2.4)), k = Math.min(W, H) / cote, vw = W / k, vh = H / k, h = Lcarte / 2;
    const cx = vw >= Lcarte ? 0 : Math.max(-h + vw / 2, Math.min(h - vw / 2, E.x)), cz = vh >= Lcarte ? 0 : Math.max(-h + vh / 2, Math.min(h - vh / 2, E.z));
    const x0 = cx - vw / 2, z0 = cz - vh / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#9C9BB3'; g.fillRect(0, 0, W, H);
    g.drawImage(base, (x0 + h) * kBase, (z0 + h) * kBase, vw * kBase, vh * kBase, 0, 0, W, H);
    if (f) peindreZone(g, f, x0, z0, k, W, H, Math.max(2, Math.min(W, H) / 120));
    return true;
  }
  const RAYON_CARTE = 62; // mètres montrés du centre au bord
  function dessinerCarte(jeu) {
    const g = ctxCarte; if (!g || !moi) return;
    const S = el.carte.width, R = S / 2, s = R / RAYON_CARTE, yaw = moi.yaw || 0, c = Math.cos(yaw), sn = Math.sin(yaw);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(R, R, R - 1.5 * DPR, 0, TAU); g.clip();
    g.fillStyle = fond ? '#9C9BB3' : '#C9E3B0'; g.fillRect(0, 0, S, S); // au-delà du fond peint : le grisé du hors-arène
    if (fond) { g.translate(R, R); g.rotate(yaw); g.scale(s / kFond, s / kFond); g.translate(-(moi.x - ox) * kFond, -(moi.z - oz) * kFond); g.drawImage(fond, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); }
    // les objets à ramasser
    for (let i = 0; i < objets.length; i++) {
      const o = objets[i]; if (!o || o.dispo === false) continue;
      const u = (o.x - moi.x) * s, v = (o.z - moi.z) * s, X = R + u * c - v * sn, Y = R + u * sn + v * c;
      if ((X - R) * (X - R) + (Y - R) * (Y - R) > (R - 6 * DPR) * (R - 6 * DPR)) continue;
      g.fillStyle = o.objet === 'soin' ? '#5FD3A4' : o.objet === 'armure' ? '#7FB3FF' : o.objet === 'munitions' ? '#FF9F5A' : '#FFC84A';
      g.strokeStyle = '#2B2A4C'; g.lineWidth = 1.5 * DPR; g.beginPath(); g.rect(X - 3.5 * DPR, Y - 3.5 * DPR, 7 * DPR, 7 * DPR); g.fill(); g.stroke();
    }
    dessinerExtraction(g, R, s, c, sn);
    // les autres : alliés toujours, ennemis s'ils sont vus ou s'ils viennent de tirer
    const es = jeu.entites, equipes = estEquipes(jeu);
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (e === moi || !e.vivant) continue;
      const allie = equipes && e.equipe === moi.equipe;
      if (!allie && !vusCache.get(e.id)) { const t = coupsDe.get(e.id); if (t == null || jeu.temps - t > 1.6) continue; }
      const u = (e.x - moi.x) * s, v = (e.z - moi.z) * s, X = R + u * c - v * sn, Y = R + u * sn + v * c;
      if ((X - R) * (X - R) + (Y - R) * (Y - R) > (R - 5 * DPR) * (R - 5 * DPR)) continue;
      g.beginPath(); g.arc(X, Y, 4.6 * DPR, 0, TAU); g.fillStyle = allie ? '#7FB3FF' : VX.actif && !e.bot ? (e.couleur || '#FF9F5A') : '#FF4D6D'; if (VX.actif && e.boss) { g.fill(); g.beginPath(); g.arc(X, Y, 7 * DPR, 0, TAU); g.fillStyle = '#3B1A2A'; } g.fill(); g.lineWidth = 1.8 * DPR; g.strokeStyle = '#FFFFFF'; g.stroke();
    }
    // moi : un cône de vue et une flèche vers le haut (la carte tourne avec le cap)
    g.beginPath(); g.moveTo(R, R); g.arc(R, R, R * 0.62, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); g.closePath(); g.fillStyle = 'rgba(255,255,255,.32)'; g.fill();
    g.beginPath(); g.moveTo(R, R - 8 * DPR); g.lineTo(R + 6 * DPR, R + 6 * DPR); g.lineTo(R, R + 3 * DPR); g.lineTo(R - 6 * DPR, R + 6 * DPR); g.closePath();
    g.fillStyle = moi.couleur || '#FFC84A'; g.fill(); g.lineWidth = 2 * DPR; g.strokeStyle = '#2B2A4C'; g.lineJoin = 'round'; g.stroke();
    g.restore();
    g.beginPath(); g.arc(R, R, R - 1.5 * DPR, 0, TAU); g.lineWidth = 3 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke();
    const nx = Math.sin(yaw) * (R - 9 * DPR) / DPR, ny = -Math.cos(yaw) * (R - 9 * DPR) / DPR; // le nord (-z) à l'écran
    const kN = Math.round(nx) * 1000 + Math.round(ny);
    if (kN !== vu.nord) { vu.nord = kN; el.nord.style.transform = `translate(${(R / DPR + nx).toFixed(1)}px, ${(R / DPR + ny).toFixed(1)}px) translate(-50%, -50%)`; }
  }
  function majVus(jeu) { // les ennemis en ligne de vue (une fois tous les dixièmes de seconde)
    if (jeu.temps - vusT < 0.12 && vusT >= 0) return; vusT = jeu.temps;
    const m = jeu.monde || mondeCarte, es = jeu.entites, oy = moi.y + 1.5;
    for (let i = 0; i < es.length; i++) {
      const e = es[i]; if (e === moi) continue;
      let ok = false;
      if (e.vivant) { const dx = e.x - moi.x, dz = e.z - moi.z, d2 = dx * dx + dz * dz; if (d2 < 70 * 70) { try { ok = m && m.vue ? m.vue(moi.x, oy, moi.z, e.x, e.y + 1.2, e.z) : d2 < 30 * 30; } catch (err) { ok = false; } } }
      vusCache.set(e.id, ok);
    }
  }

  // ─── utilitaires ───
  function trouver(jeu, id) { const es = jeu.entites; for (let i = 0; i < es.length; i++) if (es[i].id === id) return es[i]; return null; }
  let equipesPartie = false, reglagesPartie = null; // donnés par PUI à reinit, au cas où le jeu n'expose pas ses réglages
  let optJeu = null, optOpts = null, optCache = {};
  function opt(jeu) { // les réglages de la partie : jeu.reglages (normalisés, § 6), sinon jeu.options complétées par ceux du lancement (PUI)
    if (jeu.reglages && typeof jeu.reglages === 'object') return jeu.reglages;
    if (jeu !== optJeu || jeu.options !== optOpts) { optJeu = jeu; optOpts = jeu.options; optCache = Object.assign({}, reglagesPartie || {}, jeu.options || {}); }
    return optCache;
  }
  const estEquipes = (jeu) => { const o = opt(jeu); return !!(o.equipes != null ? o.equipes : jeu.equipes != null ? jeu.equipes : equipesPartie); };
  function duree(jeu) { if (opt(jeu).duree > 0) return opt(jeu).duree; const id = (jeu.mode && jeu.mode.id) || 'arene'; return (typeof PREGLES !== 'undefined' && PREGLES.MODES[id] && PREGLES.MODES[id].duree) || 180; }
  function objectif(jeu) { if (opt(jeu).score > 0) return opt(jeu).score; const id = (jeu.mode && jeu.mode.id) || 'arene'; return (typeof PREGLES !== 'undefined' && PREGLES.MODES[id] && PREGLES.MODES[id].scoreVictoire) || 25; }
  function delaiRetour(jeu) { const R = RG(), r = opt(jeu).reapparition, t = R && R.SALON && R.SALON.reapparitions ? R.SALON.reapparitions[r] : null; return t > 0 ? t : (R && R.MODES.arene.reapparition) || 3; }
  const sansRetour = (jeu) => opt(jeu).reapparition === 'aucune' || !!(jeu.manche && typeof jeu.manche === 'object'); // « dernier debout »
  // « dernier debout » en manches : jeu.manche { n, total, enLice: [ids], fin? } (règles) ; sinon la dernière manche des événements 'manche'
  // et le compte des vivants. Rend un objet réutilisé { n, total, lice, fin } ou null.
  let mancheEv = null; const MANCHE = { n: 1, total: 1, lice: 0, fin: null };
  function mancheDe(jeu) {
    const m = jeu.manche && typeof jeu.manche === 'object' ? jeu.manche : null;
    if (!m && !sansRetour(jeu)) return null;
    MANCHE.n = m && m.n > 0 ? +m.n : mancheEv ? mancheEv.n : 1;
    MANCHE.total = m && m.total > 0 ? +m.total : mancheEv && mancheEv.total ? mancheEv.total : +opt(jeu).manches || 1;
    if (m && Array.isArray(m.enLice)) MANCHE.lice = m.enLice.length; else { let n = 0; for (let i = 0; i < jeu.entites.length; i++) if (jeu.entites[i].vivant) n++; MANCHE.lice = n; }
    MANCHE.fin = m && m.fin ? m.fin : null;
    return MANCHE;
  }
  // le bandeau de manche : « Manche 2/3 » au début, le vainqueur à la fin (une fois par manche et par phase, qu'il vienne d'un événement ou de jeu.manche)
  let bandeauCle = '', bandeauT = -1;
  function bandeau(cle, titre, sous, cls) {
    if (!el.bandeau || cle === bandeauCle) return; bandeauCle = cle;
    el.bandeauT.textContent = titre; el.bandeauS.textContent = sous || ''; el.bandeau.className = 'h-bandeau ' + (cls || ''); relance(el.bandeau, 'vu'); bandeauT = performance.now();
  }
  const NOMS_EQ = ['L’équipe jaune', 'L’équipe rose'];
  function vainqueurTxt(jeu, v, equipe) { // v : l'id d'une entité, ou une équipe (0 | 1) ; null : personne
    const e = v != null && typeof v !== 'object' ? trouver(jeu, v) : v && typeof v === 'object' && v.id != null ? trouver(jeu, v.id) : null;
    const eq = equipe != null ? equipe : (v === 0 || v === 1) && !e ? v : v && typeof v === 'object' && v.equipe != null ? v.equipe : null;
    if (estEquipes(jeu) && (eq === 0 || eq === 1)) return moi && eq === moi.equipe ? 'Ton équipe gagne la manche !' : `${NOMS_EQ[eq]} gagne la manche !`;
    if (e) return e.id === idMoi ? 'Tu gagnes la manche !' : `${e.nom} gagne la manche !`;
    return 'Fin de la manche : personne ne reste debout';
  }
  function mancheDebut(n, total) { if (total > 1) bandeau(`d${n}`, `Manche ${n}/${total}`, n === total ? 'Dernière manche : reste debout !' : 'Reste debout : pas de retour !', 'debut'); else bandeau('d1', 'Dernier debout', 'Pas de retour : reste en lice !', 'debut'); }
  function mancheFin(jeu, n, total, v, equipe) {
    const t = vainqueurTxt(jeu, v, equipe), gagne = /^(Tu|Ton)/.test(t);
    bandeau(`f${n}`, t, n < total ? `Manche ${n}/${total} · la suivante arrive` : total > 1 ? `Manche ${n}/${total} · fin de la partie` : '', gagne ? 'fin gagne' : 'fin');
  }
  function evManche(jeu, e) { // { t: 'manche', quoi | phase | etat: 'debut' | 'fin', n, total, vainqueur | gagnant, equipe? }
    const ph = String(e.quoi || e.phase || e.etat || (e.fin === true || e.vainqueur !== undefined || e.gagnant !== undefined ? 'fin' : 'debut')), fin = /^fin/.test(ph);
    const n = +e.n > 0 ? +e.n : mancheEv ? mancheEv.n : 1, total = +e.total > 0 ? +e.total : mancheEv && mancheEv.total ? mancheEv.total : +opt(jeu).manches || 1;
    mancheEv = { n, total };
    if (fin) mancheFin(jeu, n, total, e.vainqueur !== undefined ? e.vainqueur : e.gagnant !== undefined ? e.gagnant : e.id, e.equipe); else mancheDebut(n, total);
  }
  const kills = (e) => (e && e.score ? e.score.kills || 0 : 0);
  const points = (e) => (e && e.score ? e.score.points || 0 : e && e.points || 0);
  function ecrire(cle, elem, v, pre) { if (vu[cle] !== v) { vu[cle] = v; elem.textContent = pre ? pre + v : String(v); } } // le texte n'est construit que si la valeur change
  function projeter(x, y, z) { if (typeof PRENDU !== 'undefined' && PRENDU.projeter) { try { return PRENDU.projeter(x, y, z); } catch (e) { return null; } } return null; }
  function nomDe(jeu, id) { const e = trouver(jeu, id); return e ? (e.id === idMoi ? 'Toi' : e.nom) : '?'; }
  function relance(elem, cls) { elem.classList.remove(cls); void elem.offsetWidth; elem.classList.add(cls); } // relance une animation CSS (événements rares)

  // ─── les événements de l'image ───
  let toucheT = -1, toucheType = '', vignette = 0, flashT = -1, sousT = -1, ramasseT = -1, limiteT = -1;
  const REFUS = { couche: 'Pas la place de te coucher' };
  function lireEvenements(jeu, evs) {
    let avecManche = false; for (let i = 0; i < evs.length; i++) { const t = evs[i].t; if (t === 'manche' || t === 'extractions' || t === 'largage' || (t === 'prime' && evs[i].quoi !== 'gagnee') || t === 'extrait' && evs[i].id === idMoi) avecManche = true; } // le bandeau dit déjà ce qu'annoncerait la règle
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.t) {
        case 'tir': if (e.id === idMoi) { const A = armeDe(e.arme); gonfle = Math.min(1, gonfle + (A && A.gonfle != null ? A.gonfle : 0.22)); } else coupsDe.set(e.id, jeu.temps); break;
        case 'touche':
          if (e.de === idMoi && e.a !== idMoi) {
            const nv = e.mort ? 'mort' : e.tete ? 'tete' : 'corps'; if (toucheT < 0 || jeu.temps - toucheT > 0.05 || nv === 'mort' || (nv === 'tete' && toucheType === 'corps')) toucheType = nv; toucheT = jeu.temps;
            const v = trouver(jeu, e.a); if (v) nombre(jeu, v, e.degats, e.tete, e.mort);
          } else if (e.a === idMoi) {
            vignette = Math.min(1, vignette + Math.max(0.12, (e.degats || 10) / 90)); // moitié moins qu'avant : le rendu ajoute son voile rouge (PRENDU)
            const de = trouver(jeu, e.de); if (de) fleche(jeu, de); flashT = performance.now(); // le flash rouge
          }
          break;
        case 'mort': {
          ajouterFil(jeu, e);
          if (e.par === idMoi && e.a !== idMoi) { sous(`Tu as repeint ${esc(nomDe(jeu, e.a))}`, '+' + ((typeof PREGLES !== 'undefined' && PREGLES.MODES.arene.points.kill) || 100)); }
          if (e.a === idMoi) { tMort = jeu.temps; parQui = e.par; armeMort = e.arme || ''; }
          break;
        }
        case 'reapparition': if (e.id === idMoi) { tMort = -1; vignette = 0; } break;
        case 'annonce': if (!avecManche) annonce(e.texte); break;
        case 'manche': evManche(jeu, e); break;
        case 'elimine': { const id = e.id != null ? e.id : e.a; if (id === idMoi && tMort < 0) { tMort = jeu.temps; parQui = e.par != null ? e.par : parQui; } break; } // « dernier debout » : pas de retour
        case 'ramasse': if (e.id === idMoi) ramasse(e.objet); break;
        case 'refus': if (e.id === idMoi) refus(REFUS[e.quoi] || e.texte || ''); break;
        // l'Extraction (événements du groupe des règles, lus avec tolérance)
        case 'butin': if (e.id === idMoi) { const l = Array.isArray(e.objets) ? e.objets : e.objet ? [e.objet] : []; for (const o of l.slice(0, 1)) butin(o, l.length); } break;
        case 'coffre': if ((e.id === idMoi || e.par === idMoi) && (e.vide || (Array.isArray(e.objets) && !e.objets.length))) sous('Coffre vide…'); break;
        case 'extrait': if (e.id === idMoi) bandeau('extrait', 'Extrait !', `${e.valeur != null ? valeur(e) : VX.sac.valeur} pièces mises à l’abri`, 'ext fin gagne'); else { const x = trouver(jeu, e.id); if (x && !x.bot) annonce(`${x.nom} est sorti !`); } break;
        case 'releve': if (e.id === idMoi) annonce(e.par ? `${nomDe(jeu, e.par)} t’a relevé !` : 'Relevé !'); else if (e.par === idMoi) sous(`Tu as relevé ${esc(nomDe(jeu, e.id))}`); break;
        case 'aterre': case 'aTerre': case 'a-terre': if (e.id === idMoi || e.a === idMoi) { tMort = -1; } break;
        case 'sac': if ((e.par === idMoi || e.id === idMoi) && (e.quoi === 'ramasse' || e.quoi === 'pris' || e.quoi === 'vide')) { const s0 = !e.de && jeu.extraction && Array.isArray(jeu.extraction.sacs) ? jeu.extraction.sacs.find((x) => x.id === e.sac) : null, qui = e.de || (s0 && s0.de), de = qui && qui !== idMoi ? trouver(jeu, qui) : null, v = Array.isArray(e.pris) ? e.pris.reduce((a, o) => a + valeur(o), 0) : null; annonce(de ? `Tu as récupéré le sac de ${de.nom} !` : `Sac ramassé${v ? ` : ${v} pièces` : ''}`); } break;
        case 'plein': if (e.id === idMoi) refus('Sac plein : lâche un objet, ou sors !'); break;
        case 'perdu': if (e.id === idMoi && e.raison === 'temps') bandeau('perdu', 'Temps écoulé…', `${e.valeur || 0} pièces perdues`, 'fin'); break;
        case 'largage': if (e.quoi === 'annonce') bandeau('largage', 'Un largage arrive !', 'Cherche la fumée rouge : une caisse épique ou mieux', 'largage'); else if (e.quoi === 'tombe') annonce('Le largage est au sol !'); break;
        case 'prime': if (e.quoi === 'revele' || e.quoi == null) { const c = trouver(jeu, e.id); if (e.id === idMoi) bandeau('prime' + Math.round(jeu.temps), 'Tu es la cible !', `Tout le monde te voit : ta tête vaut ${e.prime || 0} pièces`, 'fin'); else if (c) bandeau('prime' + Math.round(jeu.temps), `Prime sur ${c.nom} : ${e.prime || 0} pièces`, `Il porte ${e.valeur || 0} pièces`, 'prime'); } else if (e.quoi === 'gagnee' && e.id === idMoi) sous('Prime gagnée (versée si tu sors)', '+' + (e.prime || 0)); break;
        case 'cle': if (e.id === idMoi && e.quoi === 'trouvee') sous('La clé du coffre-fort !'); break;
        case 'verrou': if (e.id === idMoi) refus('Verrouillé : il faut la clé du coffre-fort'); break;
        case 'signal': break; // (la minicarte et les étiquettes lisent jeu.extraction.signaux ; le son : PSONS)
        case 'extraction': case 'extractions': case 'sorties': if (/ouv/.test(String(e.quoi || e.etat || 'ouvert'))) { ouvertVu = true; const ps = lireExtraction(jeu, idMoi).points; bandeau('ext-ouv', 'Les sorties sont ouvertes !', ps.map((p) => p.nom).join(' · ') || 'Rejoins une balise', 'ext'); } break;
      }
    }
  }
  function nombre(jeu, v, degats, tete, mort) { // un chiffre de dégâts qui monte au-dessus de la victime
    let n = nombres[0]; for (let i = 0; i < nombres.length; i++) { if (nombres[i].t < 0) { n = nombres[i]; break; } if (nombres[i].t < n.t) n = nombres[i]; }
    n.t = jeu.temps; n.x = v.x; n.y = v.y + 1.95; n.z = v.z; n.dx = (Math.random() - 0.5) * 30;
    n.el.textContent = String(Math.round(degats || 0)); n.el.className = 'h-nombre' + (mort ? ' mort' : tete ? ' tete' : '');
  }
  function fleche(jeu, de) { let f = fleches[0]; for (let i = 0; i < fleches.length; i++) { if (fleches[i].t < 0 || jeu.temps - fleches[i].t > 1.2) { f = fleches[i]; break; } if (fleches[i].t < f.t) f = fleches[i]; } f.t = jeu.temps; f.x = de.x; f.z = de.z; }
  let refusT = 0;
  function refus(txt) { if (!txt) return; const now = performance.now(); if (now - refusT < 700 && el.refus.textContent === txt) return; refusT = now; el.refus.textContent = txt; relance(el.refus, 'vu'); }
  function sous(txt, plus) { el.sous.innerHTML = `${plus ? `<b>${esc(plus)}</b>` : ''}<span>${txt}</span>`; relance(el.sous, 'vu'); sousT = performance.now(); }
  function ramasse(o) {
    const type = typeof o === 'string' ? o : o && (o.objet || o.type || o.arme);
    const R = typeof PREGLES !== 'undefined' ? PREGLES.OBJETS[type] : null;
    const id = R && R.type === 'arme' ? R.arme : type;
    const txt = type === 'soin' ? `+${R ? R.vie : 50} vie` : type === 'armure' ? `+${R ? R.armure : 50} armure` : type === 'munitions' ? 'Munitions !' : `${nomArme(id) || 'Arme'} !`;
    el.ramasse.className = 'h-ramasse';
    el.ramasse.innerHTML = `${type === 'soin' ? SVG_COEUR : type === 'armure' ? SVG_BOUCLIER : type === 'munitions' ? '' : iconeArme(id)}<span>${esc(txt)}</span>`; relance(el.ramasse, 'vu'); ramasseT = performance.now();
  }
  function butin(o, n) { // « + Montre à gousset · 120 », à la couleur de la rareté (une arme : son icône)
    const r = rarete(o), arme = o && (o.arme || (o.type === 'arme' && o.id)), id = typeof arme === 'string' && estArme(arme) ? arme : null;
    const nom = (o && (o.nom || (id ? nomArme(id) : o.id))) || 'Butin', v = valeur(o);
    el.ramasse.innerHTML = `${id ? iconeArme(id) : `<i class="h-gemme r-${r}" aria-hidden="true"></i>`}<span>${esc(nom)}${v ? ` <small>${v}</small>` : ''}${n > 1 ? ` <small>+${n - 1}</small>` : ''}</span>`;
    el.ramasse.className = 'h-ramasse butin r-' + r; relance(el.ramasse, 'vu'); ramasseT = performance.now();
  }
  function ajouterFil(jeu, e) { // « X a repeint Y »
    const tueur = trouver(jeu, e.par), victime = trouver(jeu, e.a);
    const row = document.createElement('div'); row.className = 'h-fil-l' + (e.par === idMoi ? ' moi' : '') + (e.a === idMoi ? ' victime' : '');
    const nom = (e2) => `<span class="h-fil-n"><i style="background:${esc(e2 && e2.couleur || '#ccc')}"></i>${esc(e2 ? e2.nom : '?')}</span>`, ico = `<span class="h-fil-a">${iconeArme(e.arme)}</span>`;
    row.innerHTML = !tueur || e.par === e.a ? `${nom(victime)}<span>s’est repeint tout seul</span>`
      : e.par === idMoi ? `${ico}<span>Tu as repeint</span>${nom(victime)}`
      : e.a === idMoi ? `${nom(tueur)}${ico}<span>t’a repeint</span>`
      : `${nom(tueur)}${ico}<span>a repeint</span>${nom(victime)}`; // « X a repeint Y »
    row._t = performance.now();
    el.fil.prepend(row); while (el.fil.children.length > 4) el.fil.lastChild.remove();
  }
  let annT = -1;
  function annonce(texte, cls) { if (!el.annonce || !texte) return; el.annonce.textContent = texte; el.annonce.className = 'h-annonce ' + (cls || ''); relance(el.annonce, 'vu'); annT = performance.now(); }

  // ═══════════════════════════════ l'Extraction ═══════════════════════════════
  // La lecture de l'état du mode (PEXTRACTION, groupe des règles), tolérante : jeu.extraction (sinon les crochets du mode coffres(jeu),
  // points(jeu), sacs(jeu)) { coffres: [{ id, x, z, rarete: 'commun' | 'rare' | 'epique' | 'legendaire' (ou 0..3), ouvert, vide }],
  // points | sorties: [{ id, nom, x, z, rayon (10 m), ouvert }], ouvreA (s de jeu ; sinon ouverture, sinon la mi-partie), ouvert,
  // sacs: [{ id, x, z, valeur | objets }] } ; l'entité : sac (tableau, ou { objets | contenu, max | cases | places, valeur }),
  // ouverture { coffre, debut, duree | fin, p? }, extraction { point, debut, duree | fin, p? }, extrait, aTerre (+ aTerreDepuis, aTerreJusqua),
  // releve { par, p | debut, duree } (on me relève), relever { cible, p | debut, duree } (je relève). PHUD.extraction(jeu, id) rend une vue
  // réutilisée ; PHUD.contexte : l'action possible ici ({ quoi: 'ouvrir' | 'ramasser' | 'relever', texte, p }) pour le bouton de PCONTROLES.
  const RARS = ['commun', 'rare', 'epique', 'legendaire'];
  const COUL_RAR = { commun: '#C9CBD6', rare: '#5B9BFF', epique: '#B57BFF', legendaire: '#FFC84A' };
  const NOM_RAR = { commun: 'commun', rare: 'rare', epique: 'épique', legendaire: 'légendaire' };
  function rarete(o) { o = objetDe(o); const r = o && (o.rarete != null ? o.rarete : o.rang != null ? o.rang : o.r); if (typeof r === 'number') return RARS[Math.max(0, Math.min(3, r | 0))]; if (r === 'épique') return 'epique'; if (r === 'légendaire') return 'legendaire'; return RARS.indexOf(r) >= 0 ? r : 'commun'; }
  const BU = () => (typeof PBUTIN !== 'undefined' && PBUTIN) || null;
  // un objet du butin, lu tel quel ou depuis son id (PBUTIN : le sac range des ids, 'montre', 'soin'…) → { id, nom, valeur, rarete, type, arme }
  function objetDe(o) {
    if (o && typeof o === 'object') return o;
    const B = BU(), id = String(o == null ? '' : o), V = B && B.VALEURS && B.VALEURS[id], C = B && B.CONSOMMABLES && B.CONSOMMABLES[id];
    if (V) return { id, nom: V.nom, valeur: V.valeur, rarete: V.rarete, type: 'valeur', cases: V.cases };
    if (C) return { id, nom: C.nom, valeur: 0, rarete: 'commun', type: id, cases: C.cases };
    if (estArme(id)) return { id, nom: nomArme(id), valeur: 0, rarete: 'commun', type: 'arme', arme: id };
    return { id, nom: B && B.nomDe ? B.nomDe(id) : id, valeur: 0, rarete: 'commun', type: 'valeur' };
  }
  const valeur = (o) => { o = objetDe(o); return Math.max(0, Math.round(+(o && (o.valeur != null ? o.valeur : o.prix != null ? o.prix : o.pieces)) || 0)); };
  const px2 = (o, k) => (o ? (nb(+o[k === 0 ? 'x' : 'z']) ? +o[k === 0 ? 'x' : 'z'] : Array.isArray(o.p) ? +o.p[k] : Array.isArray(o.pos) ? +o.pos[k] : NaN) : NaN);
  const MODE_EXT = () => (typeof PEXTRACTION !== 'undefined' && PEXTRACTION) || null;
  function estExt(jeu) { return !!jeu && ((jeu.mode && jeu.mode.id === 'extraction') || opt(jeu).mode === 'extraction' || !!(jeu.extraction && typeof jeu.extraction === 'object')); }
  function crochet(jeu, nom) { const M = jeu.mode && typeof jeu.mode[nom] === 'function' ? jeu.mode : MODE_EXT(); if (!M || typeof M[nom] !== 'function') return null; try { return M[nom](jeu); } catch (e) { return null; } }
  function progres(o, jeu, defaut) { // la part faite d'une action en cours : o.p (0..1), sinon (temps − debut) / duree
    if (o == null || o === false) return -1; if (typeof o === 'number') return o >= 0 && o <= 1 ? o : -1; if (typeof o !== 'object') return 0;
    const p = o.p != null ? +o.p : o.progres != null ? +o.progres : o.part != null ? +o.part : NaN; if (nb(p)) return Math.max(0, Math.min(1, p));
    const d0 = nb(+o.debut) ? +o.debut : nb(+o.depuis) ? +o.depuis : nb(+o.t0) ? +o.t0 : NaN, du = nb(+o.duree) ? +o.duree : nb(+o.fin) && nb(d0) ? +o.fin - d0 : defaut;
    return nb(d0) && du > 0 ? Math.max(0, Math.min(1, (jeu.temps - d0) / du)) : 0;
  }
  const VX = { actif: false, coffres: [], points: [], sacs: [], signaux: [], ouvert: false, ouvreA: null, ouvreDans: 0, sac: { liste: [], n: 0, max: 0, valeur: 0, plein: false, cle: false, ralenti: 0 }, ouverture: null, extraction: null, extrait: false, aTerre: null, releve: null, relever: null, proche: null, plus: null, largage: null, prime: null, boss: null, format: 'ensemble' };
  const SIG = [];
  const COF = [], PTS = [], SACS = []; // réutilisés
  function lireExtraction(jeu, id) {
    const V = VX; V.actif = estExt(jeu); V.coffres = COF; V.points = PTS; V.sacs = SACS; COF.length = 0; PTS.length = 0; SACS.length = 0;
    V.ouverture = V.extraction = V.aTerre = V.releve = V.relever = V.proche = V.plus = V.largage = V.prime = V.boss = null; V.extrait = false; V.signaux = SIG; SIG.length = 0; V.sac.liste = []; V.sac.n = 0; V.sac.max = 0; V.sac.valeur = 0; V.sac.plein = false;
    if (!V.actif) return V;
    const S = jeu.extraction && typeof jeu.extraction === 'object' ? jeu.extraction : {}, t = +jeu.temps || 0;
    const cs = Array.isArray(S.coffres) ? S.coffres : crochet(jeu, 'coffres') || jeu.coffres || [];
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (!c) continue; const x = px2(c, 0), z = px2(c, 1); if (!nb(x) || !nb(z)) continue;
      COF.push({ id: c.id != null ? c.id : 'c' + i, x, z, rarete: rarete(c), ouvert: !!(c.ouvert || c.etat === 'ouvert' || c.vide || c.dispo === false || c.ouvertPar != null), vide: !!c.vide, fort: !!(c.fort || c.verrou || c.special === 'coffre-fort' || c.special === 'mairie' || c.type === 'coffre-fort'), largage: c.special === 'largage' }); }
    let ouvreA = nb(+S.ouvreA) ? +S.ouvreA : nb(+S.ouvertureA) ? +S.ouvertureA : nb(+S.ouverture) ? +S.ouverture : nb(+S.mi) ? +S.mi : jeu.duree > 0 ? (+jeu.debutChrono || 0) + jeu.duree / 2 : null;
    V.ouvert = S.ouvert != null ? !!S.ouvert : S.ouvertes != null ? !!S.ouvertes : ouvreA != null ? t >= ouvreA : false;
    V.ouvreA = ouvreA; V.ouvreDans = V.ouvert || ouvreA == null ? 0 : Math.max(0, ouvreA - t);
    const ps = Array.isArray(S.points) ? S.points : Array.isArray(S.sorties) ? S.sorties : Array.isArray(S.extractions) ? S.extractions : Array.isArray(S.balises) ? S.balises : crochet(jeu, 'points') || [];
    const NOMS = ['Le pont', 'La cale de la rivière'];
    for (let i = 0; i < ps.length; i++) { const p = ps[i]; if (!p) continue; const x = px2(p, 0), z = px2(p, 1); if (!nb(x) || !nb(z)) continue;
      PTS.push({ id: p.id != null ? p.id : 'x' + i, nom: p.nom || p.n || NOMS[i] || 'Sortie', x, z, rayon: +p.rayon > 0 ? +p.rayon : +p.r > 0 ? +p.r : 10, ouvert: p.ouvert != null ? !!p.ouvert : V.ouvert }); }
    const ss = Array.isArray(S.sacs) ? S.sacs : Array.isArray(S.sacsAuSol) ? S.sacsAuSol : crochet(jeu, 'sacs') || [];
    for (let i = 0; i < ss.length; i++) { const b = ss[i]; if (!b || b.pris || b.dispo === false) continue; const x = px2(b, 0), z = px2(b, 1); if (!nb(x) || !nb(z)) continue; const l = Array.isArray(b.objets) ? b.objets : Array.isArray(b.contenu) ? b.contenu : [];
      SACS.push({ id: b.id != null ? b.id : 's' + i, x, z, valeur: b.valeur != null ? valeur(b) : l.reduce((a, o) => a + valeur(o), 0), de: b.de || null, attend: !!(b.attend && b.attend[id]) }); }
    V.format = S.format || opt(jeu).formatExtraction || 'ensemble';
    // le largage (annoncé, qui tombe, posé : un coffre de plus), la prime (le plus riche révélé), le Gardien, les signaux de mon équipe
    const L = S.largage && typeof S.largage === 'object' ? S.largage : null;
    if (L && (L.annonce || L.tombe) && nb(+L.x)) { const c = L.coffre && L.coffre.id != null ? COF.find((k) => k.id === L.coffre.id) : null; if (!(c && c.ouvert)) V.largage = { x: +L.x, z: +L.z, tombe: !!L.tombe, dans: L.tombe ? 0 : Math.max(0, (+L.A || t) - t), rarete: c ? c.rarete : 'epique' }; }
    const P = S.prime && typeof S.prime === 'object' ? S.prime : null;
    if (P && P.id != null) { const c = trouver(jeu, P.id); if (c && c.vivant !== false && !c.extrait) V.prime = { id: P.id, nom: c.nom, valeur: +P.valeur || 0, montant: +P.montant || +P.prime || 0, x: nb(+P.x) ? +P.x : c.x, z: nb(+P.z) ? +P.z : c.z, depuis: nb(+P.reveleA) ? +P.reveleA : null }; }
    for (const c of jeu.entites) if (c.boss && c.vivant !== false) { V.boss = { id: c.id, nom: (c.boss && c.boss.nom) || c.nom || 'Le Gardien', vie: Math.max(0, c.vie), vieMax: +(c.boss && c.boss.vieMax) || 600, armure: c.armure || 0, x: c.x, y: c.y, z: c.z }; break; }
    const e = trouver(jeu, id); if (!e) return V;
    if (Array.isArray(S.signaux)) for (const g of S.signaux) { if (!g || !nb(+g.x) || (g.equipe != null && g.equipe !== e.equipe) || (nb(+g.jusqua) && g.jusqua < t)) continue; SIG.push({ id: g.id, type: g.type || 'ici', x: +g.x, y: nb(+g.y) ? +g.y : null, z: +g.z, de: g.de }); }
    // le sac
    const sc = e.sac, l = Array.isArray(sc) ? sc : sc && typeof sc === 'object' ? (Array.isArray(sc.objets) ? sc.objets : Array.isArray(sc.contenu) ? sc.contenu : Array.isArray(sc.items) ? sc.items : []) : [];
    V.sac.liste = l; V.sac.valeur = sc && !Array.isArray(sc) && sc.valeur != null ? valeur(sc) : l.reduce((a, o) => a + valeur(o), 0);
    V.sac.n = l.reduce((a, o) => a + (+objetDe(o).cases || 1), 0); // les cases prises (PBUTIN : 1 à 3 par objet)
    V.sac.max = +(sc && !Array.isArray(sc) && (sc.cases || sc.max || sc.places || sc.capacite)) || +e.sacMax || 0; V.sac.plein = V.sac.max > 0 && V.sac.n >= V.sac.max;
    V.sac.cle = !!e.cle || l.some((o) => /^cle/.test(String(objetDe(o).id || objetDe(o).type || ''))); // la clé du coffre-fort
    V.sac.ralenti = Math.max(0, +e.ralenti || 0); // le poids du sac ralentit (0 à 0,2)
    // les actions en cours
    const it = e.interaction && typeof e.interaction === 'object' ? e.interaction : null, iq = it ? it.quoi : null;
    const ov = it && iq !== 'relever' ? it : e.ouverture || e.ouvre || null, pO = progres(ov && ov.prog != null ? { p: ov.prog } : ov, jeu, 1.2);
    if (pO >= 0 && ov) { const cid = typeof ov === 'object' ? (ov.cible != null ? ov.cible : ov.coffre != null ? ov.coffre : ov.id) : null, c = COF.find((k) => k.id === cid);
      V.ouverture = { p: pO, coffre: cid, quoi: iq === 'sac' ? 'sac' : 'coffre', rarete: c ? c.rarete : 'commun', fort: !!(c && c.fort), duree: +ov.duree || 1.2 }; }
    const DX = (typeof PREGLES !== 'undefined' && PREGLES.MODES.extraction && PREGLES.MODES.extraction.extraction && PREGLES.MODES.extraction.extraction.duree) || 8;
    if (e.sortiePoint != null && nb(+e.sortie)) { const pt = PTS.find((k) => k.id === e.sortiePoint), pX = Math.max(0, Math.min(1, +e.sortie / DX)); V.extraction = { p: pX, point: pt ? pt.nom : null, reste: Math.max(0, DX - +e.sortie) }; }
    else { const ex = e.extraction && typeof e.extraction === 'object' ? e.extraction : null, pX = progres(ex, jeu, DX); if (pX >= 0 && ex) { const pid = ex.point != null ? ex.point : ex.id, pt = PTS.find((k) => k.id === pid); V.extraction = { p: pX, point: pt ? pt.nom : null, reste: nb(+ex.duree) ? Math.max(0, (+ex.duree) * (1 - pX)) : DX * (1 - pX) }; } }
    V.extrait = !!(e.extrait || e.sorti || e.etat === 'extrait');
    const terre = !!(e.aTerre || e.aterre || e.etat === 'a-terre' || e.etat === 'aterre');
    if (terre) { const fin = nb(+e.aTerreJusqua) && e.aTerreJusqua > 0 ? +e.aTerreJusqua : nb(+e.aTerreDepuis) ? +e.aTerreDepuis + 30 : nb(+e.mortDepuis) ? +e.mortDepuis + 30 : t + 30; V.aTerre = { reste: Math.max(0, fin - t) };
      for (const c of jeu.entites) { const ci = c.interaction; if (c !== e && ci && ci.quoi === 'relever' && (ci.cible === e.id || ci.cible == null)) { V.releve = { p: Math.max(0, Math.min(1, +ci.prog || 0)), par: c.id }; break; } } // on me relève
      const r = e.releve || e.relevePar; if (!V.releve && r) { const pr = progres(r, jeu, 4); if (pr >= 0) V.releve = { p: pr, par: typeof r === 'object' ? r.par || r.id : r }; } }
    if (iq === 'relever') V.relever = { p: Math.max(0, Math.min(1, +it.prog || 0)), cible: it.cible };
    else { const rl = e.relever || e.releveCible || null, pR = progres(rl, jeu, 4); if (pR >= 0 && rl) V.relever = { p: pR, cible: typeof rl === 'object' ? rl.cible || rl.id : rl }; }
    // ce qui est à portée (le bouton d'action) : relever un équipier à terre, ramasser un sac, ouvrir un coffre
    if (e.vivant !== false && !V.extrait && !terre) {
      let best = null, bd = 1e9;
      for (const c of jeu.entites) { if (c === e || !(c.aTerre || c.aterre || c.etat === 'a-terre') || (c.equipe !== e.equipe)) continue; const d = Math.hypot(c.x - e.x, c.z - e.z); if (d < 2.6 && d < bd) { bd = d; best = { quoi: 'relever', id: c.id, texte: 'Relever', d, nom: c.nom }; } }
      if (!best) for (const c of COF) { if (c.ouvert) continue; const d = Math.hypot(c.x - e.x, c.z - e.z); if (d < 2.4 && d < bd) { bd = d; best = { quoi: 'ouvrir', id: c.id, texte: c.fort ? (!V.sac.cle ? 'Il faut la clé' : 'Coffre-fort') : 'Ouvrir', d, rarete: c.fort ? 'legendaire' : c.rarete, ferme: !!(c.fort && !V.sac.cle) }; } }
      if (!best) for (const b of SACS) { if (b.attend) continue; const d = Math.hypot(b.x - e.x, b.z - e.z); if (d < 2.2 && d < bd) { bd = d; const autre = b.de && b.de !== e.id ? trouver(jeu, b.de) : null; best = { quoi: 'ramasser', id: b.id, texte: autre ? 'Fouiller' : 'Ramasser', d, de: autre ? autre.nom : null }; } }
      if (V.relever) best = { quoi: 'relever', texte: 'Relever', p: V.relever.p };
      else if (V.ouverture) best = { quoi: V.ouverture.quoi === 'sac' ? 'ramasser' : 'ouvrir', texte: V.ouverture.quoi === 'sac' ? 'Fouiller' : V.ouverture.fort ? 'Coffre-fort' : 'Ouvrir', p: V.ouverture.p, rarete: V.ouverture.rarete };
      V.proche = best;
    }
    // la sortie la plus proche (la boussole)
    let bp = null, bd2 = 1e18; for (const p of PTS) { const d = (p.x - e.x) * (p.x - e.x) + (p.z - e.z) * (p.z - e.z); if ((p.ouvert || !V.ouvert) && d < bd2) { bd2 = d; bp = p; } }
    V.plus = bp ? { nom: bp.nom, x: bp.x, z: bp.z, d: Math.sqrt(bd2), ouvert: bp.ouvert, dedans: Math.sqrt(bd2) <= bp.rayon } : null;
    return V;
  }
  // le bilan d'une partie pour l'écran de fin et le coffre : PEXTRACTION.resultat (res.joueurs [{ id, extrait | sorti, objets, valeur,
  // perdus, kills }], ou res.extraits [ids] et res.butin { id: [objets] }), sinon l'état des entités (extrait, sac)
  function bilanExtraction(res, jeu, id) {
    res = res && typeof res === 'object' ? res : {};
    const X = res.extraction && typeof res.extraction === 'object' ? res.extraction : res, js = Array.isArray(X.joueurs) ? X.joueurs : Array.isArray(res.bilan) ? res.bilan : null, es = jeu ? jeu.entites : [];
    const ligne = (e) => { const r = js ? js.find((x) => x && x.id === e.id) : null, sc = e.sac, l = Array.isArray(sc) ? sc : sc && (sc.objets || sc.contenu) || [];
      const sorti = r ? !!(r.extrait || r.sorti || r.etat === 'extrait') : Array.isArray(res.extraits) ? res.extraits.indexOf(e.id) >= 0 : !!(e.extrait || e.sorti);
      const objets = (r && Array.isArray(r.objets) ? r.objets : res.butin && Array.isArray(res.butin[e.id]) ? res.butin[e.id] : sorti ? l : []).concat(r && Array.isArray(r.materiel) ? r.materiel : []);
      const perdus = (r && Array.isArray(r.perdu) ? r.perdu : r && Array.isArray(r.perdus) ? r.perdus : sorti ? [] : l).concat(r && Array.isArray(r.materielPerdu) ? r.materielPerdu : []);
      const val = r && r.valeur != null ? Math.round(+r.valeur || 0) : objets.reduce((a, o) => a + valeur(o), 0);
      const kills = r && r.kills != null ? +r.kills : e.score ? e.score.kills || 0 : 0, kJ = r && r.joueurs != null ? +r.joueurs : r && r.killsJoueurs != null ? +r.killsJoueurs : null;
      return { id: e.id, nom: e.id === id ? (e.nom || 'Toi') : e.nom, couleur: e.couleur, equipe: e.equipe, bot: !!e.bot, sorti, mort: !sorti && (e.vivant === false || !!(r && r.mort)), objets, perdus, valeur: sorti ? val : 0,
        perdu: r && r.valeurPerdue != null ? +r.valeurPerdue : perdus.reduce((a, o) => a + valeur(o), 0), kills, killsJoueurs: kJ, killsRobots: r && r.gardiens != null ? +r.gardiens : r && r.killsRobots != null ? +r.killsRobots : kJ != null ? kills - kJ : null,
        primes: r && r.primes != null ? +r.primes : r && r.prime != null ? +r.prime : 0, score: r && r.score != null ? +r.score : val, ligne: r || null };
    };
    const joueurs = es.filter((e) => !e.bot).map(ligne), moiL = joueurs.find((l) => l.id === id) || { sorti: false, mort: false, objets: [], perdus: [], valeur: 0, perdu: 0, kills: 0, pieces: null };
    return Object.assign({}, moiL, { joueurs, gardiens: es.filter((e) => e.bot && e.vivant === false).length, duree: res.duree != null ? res.duree : jeu ? jeu.temps : 0 });
  }
  // ─── l'affichage, à chaque image (rien n'est écrit si rien ne change) ───
  const coffresVus = new Set(); let vusExtT = -1, ouvertVu = null, contexte = null;
  function majExtraction(jeu, now) {
    const V = lireExtraction(jeu, idMoi), on = V.actif; moiJeu = jeu;
    if (on !== vu.ext) { vu.ext = on; racine.classList.toggle('extraction', on); el.sac.hidden = !on; el.boussole.hidden = !on; if (!on) { el.jauge.hidden = true; el.voileExt.hidden = true; el.largage.hidden = true; el.boss.hidden = true; el.contrat.hidden = true; cacherEtiquettes(); } }
    contexte = null; if (!on) return;
    // le poids (les cases prises), la clé
    const pk = Math.round((V.sac.max ? V.sac.n / V.sac.max : 0) * 20) + (V.sac.ralenti > 0 ? 100 : 0) + (V.sac.cle ? 1000 : 0);
    if (pk !== vu.poids) { vu.poids = pk; el.poids.style.transform = `scaleX(${(V.sac.max ? Math.min(1, V.sac.n / V.sac.max) : 0).toFixed(2)})`; el.sac.classList.toggle('lourd', V.sac.ralenti > 0); el.sac.classList.toggle('cle', V.sac.cle); el.sac.title = V.sac.ralenti > 0 ? `Sac lourd : −${Math.round(V.sac.ralenti * 100)} % de vitesse` : ''; }
    // le bruit que je fais (jeu.bruits : tirs, pas de course, coffres) : une onde près de la posture
    let br = 0; const B = jeu.bruits; if (Array.isArray(B)) for (let i = 0; i < B.length; i++) { const b = B[i]; if (b && b.e === moi && jeu.temps - b.t < 0.45 && b.portee > br) br = b.portee; }
    const bk = br <= 0 ? 0 : br >= 16 ? 2 : 1; if (bk !== vu.bruit) { vu.bruit = bk; el.bruit.classList.toggle('vu', bk > 0); el.bruit.classList.toggle('fort', bk === 2); }
    // le largage : une seconde boussole (annoncé : dans combien de temps ; posé : la distance)
    if (V.largage && !V.extrait) {
      const dx = V.largage.x - moi.x, dz = V.largage.z - moi.z, cy = Math.cos(moi.yaw || 0), sy = Math.sin(moi.yaw || 0), ang = Math.round(Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy) / DEG / 3) * 3;
      if (ang !== vu.laAng) { vu.laAng = ang; el.laFl.style.transform = `rotate(${ang}deg)`; }
      ecrire('laS', el.laS, V.largage.tombe ? `${Math.round(Math.hypot(dx, dz))} m · fumée rouge` : `tombe dans ${Math.ceil(V.largage.dans)} s · ${Math.round(Math.hypot(dx, dz))} m`);
      if (vu.laVis !== true) { vu.laVis = true; el.largage.hidden = false; }
    } else if (vu.laVis !== false) { vu.laVis = false; el.largage.hidden = true; }
    // le Gardien : sa barre de vie en haut, quand on le voit (ou qu'il est tout près)
    const Bo = V.boss, bv = !!Bo && (vusCache.get(Bo.id) || Math.hypot(Bo.x - moi.x, Bo.z - moi.z) < 20);
    if (bv !== vu.bossVis) { vu.bossVis = bv; el.boss.hidden = !bv; }
    if (bv) { ecrire('bossN', el.bossN, Bo.nom); const k = Math.round(Math.min(1, Bo.vie / Bo.vieMax) * 100); if (k !== vu.bossK) { vu.bossK = k; el.bossB.style.transform = `scaleX(${(k / 100).toFixed(2)})`; } }
    // le contrat du jour (rappel discret)
    const ct = contratPartie ? `Contrat : ${contratPartie.texte} ${contratPartie.prog}/${contratPartie.but}` : '';
    if (ct !== vu.contrat) { vu.contrat = ct; el.contrat.hidden = !ct; el.contrat.textContent = ct; }
    etiquettes(jeu, V);
    // le sac : « 3/8 · 420 »
    const sacK = V.sac.n + '/' + V.sac.max + '/' + V.sac.valeur;
    if (sacK !== vu.sacK) { const plus = vu.sacV != null && V.sac.valeur > vu.sacV; vu.sacK = sacK; vu.sacV = V.sac.valeur; el.sacN.textContent = String(V.sac.n); el.sacMax.textContent = V.sac.max ? '/' + V.sac.max : ''; el.sacV.textContent = String(V.sac.valeur); el.sac.classList.toggle('plein', V.sac.plein); if (plus) relance(el.sac, 'pique'); }
    // les coffres vus (minicarte) : à moins de 18 m, ou en vue à moins de 45 m (testé quatre fois par seconde)
    if (jeu.temps - vusExtT > 0.25 || vusExtT < 0) { vusExtT = jeu.temps; const m = jeu.monde || mondeCarte, oy = moi.y + 1.5;
      for (const c of V.coffres) { if (coffresVus.has(c.id)) continue; const d = Math.hypot(c.x - moi.x, c.z - moi.z); let ok = d < 18; if (!ok && d < 45) { try { ok = !!(m && m.vue && m.vue(moi.x, oy, moi.z, c.x, (m.hauteur ? m.hauteur(c.x, c.z) : moi.y) + 0.6, c.z)); } catch (e) { ok = false; } } if (ok) coffresVus.add(c.id); } }
    // l'ouverture des sorties : le bandeau (une fois), sinon le compte à rebours
    if (ouvertVu === null) ouvertVu = V.ouvert;
    if (V.ouvert && !ouvertVu) { ouvertVu = true; bandeau('ext-ouv', 'Les sorties sont ouvertes !', V.points.map((p) => p.nom).join(' · ') || 'Rejoins une balise', 'ext'); }
    // la boussole : la sortie la plus proche (flèche, nom, distance), ou le temps avant l'ouverture
    if (V.plus && !V.extrait) {
      const dx = V.plus.x - moi.x, dz = V.plus.z - moi.z, cy = Math.cos(moi.yaw || 0), sy = Math.sin(moi.yaw || 0), av = -dx * sy - dz * cy, dr = dx * cy - dz * sy, ang = Math.round(Math.atan2(dr, av) / DEG / 3) * 3;
      if (ang !== vu.boAng) { vu.boAng = ang; el.boFl.style.transform = `rotate(${ang}deg)`; }
      const t1 = V.plus.dedans && V.ouvert ? `${V.plus.nom} : tu y es !` : `${V.plus.nom} · ${Math.round(V.plus.d)} m`, t2 = V.ouvert ? 'Sortie ouverte' : `Ouvre dans ${Math.floor(Math.ceil(V.ouvreDans) / 60)}:${String(Math.ceil(V.ouvreDans) % 60).padStart(2, '0')}`;
      ecrire('boT', el.boT, t1); ecrire('boS', el.boS, t2); if (V.ouvert !== vu.boOuv) { vu.boOuv = V.ouvert; el.boussole.classList.toggle('ouverte', V.ouvert); }
      if (vu.boVis !== true) { vu.boVis = true; el.boussole.hidden = false; }
    } else if (vu.boVis !== false) { vu.boVis = false; el.boussole.hidden = true; }
    // la jauge : extraction (8 s dans le cercle), ouverture d'un coffre, relever, se faire relever
    let j = null;
    if (V.extraction) j = { cls: 'sortie', p: V.extraction.p, t: `Extraction… ${Math.ceil(V.extraction.reste)} s · ne te fais pas toucher` };
    else if (V.releve) j = { cls: 'relever', p: V.releve.p, t: 'On te relève…' };
    else if (V.relever) j = { cls: 'relever', p: V.relever.p, t: 'Tu relèves ton équipier…' };
    else if (V.ouverture) j = { cls: 'r-' + V.ouverture.rarete, p: V.ouverture.p, t: `Ouverture du coffre ${NOM_RAR[V.ouverture.rarete]}…` };
    if (j) { const pq = Math.round(j.p * 100); if (vu.jaugeVis !== true) { vu.jaugeVis = true; el.jauge.hidden = false; } if (j.cls !== vu.jaugeCls) { vu.jaugeCls = j.cls; el.jauge.className = 'h-jauge ' + j.cls; } ecrire('jaugeT', el.jaugeT, j.t); if (pq !== vu.jaugeP) { vu.jaugeP = pq; el.jaugeB.style.transform = `scaleX(${(pq / 100).toFixed(2)})`; } }
    else if (vu.jaugeVis !== false) { vu.jaugeVis = false; el.jauge.hidden = true; }
    // à terre (un équipier peut relever), ou sorti (la partie continue pour les autres)
    let vo = null;
    if (V.extrait) vo = { cls: 'sorti', p: 'Extrait !', b: `${V.sac.valeur} pièces à l’abri`, s: 'Les autres continuent : attends la fin de la partie.' };
    else if (V.aTerre) vo = { cls: 'terre', p: 'À terre !', b: V.releve ? 'On te relève…' : `Un équipier peut te relever : ${Math.ceil(V.aTerre.reste)} s`, s: 'Ton sac reste avec toi tant qu’on peut te relever.' };
    const voK = vo ? vo.cls + vo.b : '';
    if (voK !== vu.voK) { vu.voK = voK; el.voileExt.hidden = !vo; if (vo) { el.voileExt.className = 'h-voile-ext ' + vo.cls; el.voileP.textContent = vo.p; el.voileB.textContent = vo.b; el.voileS.textContent = vo.s; } }
    contexte = V.proche;
  }
  let moiJeu = null;
  function dessinerExtraction(g, R, s, c, sn) { // les coffres vus, les sacs au sol, les sorties (dans le cercle de la minicarte ; une sortie au loin : au bord)
    const V = VX; if (!V.actif) return;
    const pos = (x, z) => { const u = (x - moi.x) * s, v = (z - moi.z) * s; P2[0] = R + u * c - v * sn; P2[1] = R + u * sn + v * c; return (P2[0] - R) * (P2[0] - R) + (P2[1] - R) * (P2[1] - R); };
    const lim = (R - 6 * DPR) * (R - 6 * DPR);
    for (const k of V.coffres) { if (!coffresVus.has(k.id) || pos(k.x, k.z) > lim) continue; const w = (k.rarete === 'legendaire' ? 4.6 : 3.8) * DPR;
      g.beginPath(); g.rect(P2[0] - w, P2[1] - w * 0.8, w * 2, w * 1.6); if (k.ouvert) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fill(); g.lineWidth = 1.2 * DPR; g.strokeStyle = 'rgba(43,42,76,.7)'; g.stroke(); } else { g.fillStyle = COUL_RAR[k.rarete]; g.fill(); g.lineWidth = 1.6 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke(); } }
    for (const b of V.sacs) { if (pos(b.x, b.z) > lim) continue; g.beginPath(); g.arc(P2[0], P2[1], 3.6 * DPR, 0, TAU); g.fillStyle = '#D88F4E'; g.fill(); g.lineWidth = 1.6 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke(); }
    const bordure = (x, z) => { const d2 = pos(x, z); if (d2 > (R - 9 * DPR) * (R - 9 * DPR)) { const a = Math.atan2(P2[1] - R, P2[0] - R), rr = R - 9 * DPR; P2[0] = R + Math.cos(a) * rr; P2[1] = R + Math.sin(a) * rr; } };
    for (const s of V.signaux) { bordure(s.x, s.z); g.beginPath(); g.moveTo(P2[0], P2[1] + 5 * DPR); g.lineTo(P2[0] + 4.5 * DPR, P2[1] - 3 * DPR); g.lineTo(P2[0] - 4.5 * DPR, P2[1] - 3 * DPR); g.closePath(); g.fillStyle = '#FFC84A'; g.fill(); g.lineWidth = 1.6 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke(); }
    if (V.largage) { bordure(V.largage.x, V.largage.z); const w = 4.5 * DPR; g.beginPath(); g.rect(P2[0] - w, P2[1] - w, 2 * w, 2 * w); g.fillStyle = '#FF6B5A'; g.fill(); g.lineWidth = 1.8 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke(); g.beginPath(); g.arc(P2[0], P2[1] - w * 1.6, w * 1.2, Math.PI, 0); g.strokeStyle = '#FFFFFF'; g.lineWidth = 1.6 * DPR; g.stroke(); }
    if (V.prime && V.prime.id !== idMoi) { const c = moiJeu && trouver(moiJeu, V.prime.id), vuP = c && vusCache.get(c.id); bordure(vuP ? c.x : V.prime.x, vuP ? c.z : V.prime.z); const k = 0.5 + 0.5 * Math.sin(performance.now() / 160); g.beginPath(); g.arc(P2[0], P2[1], (6 + 3 * k) * DPR, 0, TAU); g.fillStyle = `rgba(255,77,109,${(0.35 + 0.3 * k).toFixed(2)})`; g.fill(); g.beginPath(); g.arc(P2[0], P2[1], 4 * DPR, 0, TAU); g.fillStyle = '#FF4D6D'; g.fill(); g.lineWidth = 1.6 * DPR; g.strokeStyle = '#FFFFFF'; g.stroke(); }
    for (const p of V.points) {
      const d2 = pos(p.x, p.z), loin = d2 > (R - 9 * DPR) * (R - 9 * DPR);
      if (loin) { const a = Math.atan2(P2[1] - R, P2[0] - R), rr = R - 9 * DPR; P2[0] = R + Math.cos(a) * rr; P2[1] = R + Math.sin(a) * rr; }
      else { g.beginPath(); g.arc(P2[0], P2[1], Math.max(5 * DPR, p.rayon * s), 0, TAU); g.fillStyle = p.ouvert ? 'rgba(95,211,164,.35)' : 'rgba(255,255,255,.18)'; g.fill(); g.lineWidth = 1.6 * DPR; g.strokeStyle = p.ouvert ? '#36B585' : 'rgba(43,42,76,.55)'; g.setLineDash(p.ouvert ? [] : [3 * DPR, 3 * DPR]); g.stroke(); g.setLineDash([]); }
      g.beginPath(); g.moveTo(P2[0], P2[1] - 6 * DPR); g.lineTo(P2[0] + 5 * DPR, P2[1] + 4 * DPR); g.lineTo(P2[0] - 5 * DPR, P2[1] + 4 * DPR); g.closePath();
      g.fillStyle = p.ouvert ? '#5FD3A4' : '#FFFFFF'; g.fill(); g.lineWidth = 1.8 * DPR; g.strokeStyle = '#2B2A4C'; g.stroke();
    }
  }
  const P2 = [0, 0];
  // les étiquettes posées dans la vue (PRENDU.projeter) : les signaux de mon équipe (au bord de l'écran s'ils sont hors champ), la prime
  // au-dessus du plus riche quand on le voit, les sacs au sol (« Sac de Léa »), le coffre-fort (la clé)
  const NOMS_SIGNAL = { coffre: 'Coffre ici', ennemi: 'Ennemi', sortie: 'On sort par là', ici: 'Ici' };
  let contratPartie = null;
  function poserEtq(i, cle, txt, cls, x, y, z, bord) {
    const E = el.etqs[i]; if (!E) return false;
    const pr = projeter(x, y, z); if (!pr) return false;
    let px = pr.x, py = pr.y, auBord = false;
    if (!pr.devant || px < 20 || px > W - 20 || py < 20 || py > H - 20) { if (!bord) return false; // hors champ : au bord, dans sa direction
      let dx = px - W / 2, dy = py - H / 2; if (!pr.devant) { dx = -dx; dy = -dy; } const k = Math.min((W / 2 - 40) / Math.max(1e-3, Math.abs(dx)), (H / 2 - 30) / Math.max(1e-3, Math.abs(dy))); px = W / 2 + dx * k; py = H / 2 + dy * k; auBord = true; }
    const k2 = cle + '|' + txt; if (E._k !== k2) { E._k = k2; E.textContent = txt; E.className = 'h-etq ' + cls + (auBord ? ' bord' : ''); } else E.classList.toggle('bord', auBord);
    E.style.transform = `translate3d(${px.toFixed(0)}px, ${py.toFixed(0)}px, 0) translate(-50%, -100%)`; if (E._vu !== true) { E._vu = true; E.style.opacity = '1'; } return true;
  }
  function etiquettes(jeu, V) {
    let n = 0; const m = jeu.monde || mondeCarte, H0 = (x, z) => { try { return m && m.hauteur ? m.hauteur(x, z) : moi.y; } catch (e) { return moi.y; } };
    for (const g of V.signaux) { if (n >= el.etqs.length) break; const d = Math.round(Math.hypot(g.x - moi.x, g.z - moi.z)); if (poserEtq(n, 'g' + g.id, `${NOMS_SIGNAL[g.type] || 'Ici'} · ${d} m`, 'signal', g.x, (g.y != null ? g.y : H0(g.x, g.z)) + 1.2, g.z, true)) n++; }
    if (V.prime && V.prime.id !== idMoi && n < el.etqs.length && vusCache.get(V.prime.id)) { const c = trouver(jeu, V.prime.id); if (c && poserEtq(n, 'p', `Prime ${V.prime.montant || V.prime.valeur}`, 'prime', c.x, c.y + 2.3, c.z, false)) n++; }
    for (const b of V.sacs) { if (n >= el.etqs.length) break; if (!b.de || b.de === idMoi) continue; const d = Math.hypot(b.x - moi.x, b.z - moi.z); if (d > 22) continue; const c = trouver(jeu, b.de); if (c && poserEtq(n, 's' + b.id, `Sac de ${c.nom}`, '', b.x, H0(b.x, b.z) + 0.9, b.z, false)) n++; }
    for (const c of V.coffres) { if (n >= el.etqs.length) break; if (!c.fort || c.ouvert || Math.hypot(c.x - moi.x, c.z - moi.z) > 18) continue; if (poserEtq(n, 'f' + c.id, V.sac.cle ? 'Coffre-fort : tu as la clé' : 'Coffre-fort : il faut la clé', 'signal', c.x, H0(c.x, c.z) + 1.3, c.z, false)) n++; }
    for (; n < el.etqs.length; n++) { const E = el.etqs[n]; if (E._vu) { E._vu = false; E.style.opacity = '0'; } }
  }
  function cacherEtiquettes() { if (el.etqs) for (const E of el.etqs) { E._vu = false; E._k = ''; E.style.opacity = '0'; } }

  // ─── la mise à jour, une fois par image ───
  function maj(jeu, id, evs, aide) {
    if (!racine || !jeu) return;
    if (jeu !== jeuVu) { jeuVu = jeu; idMoi = id; moi = trouver(jeu, id); px = moi ? moi.x : 0; pz = moi ? moi.z : 0; tPrec = +jeu.temps || 0; }
    idMoi = id; moi = trouver(jeu, id); // retrouvé à chaque image (sept entités au plus) : rien ne casse si le jeu remplace l'objet
    if (!moi) return;
    const tj = +jeu.temps || 0, now = performance.now(), dt = Math.max(0, Math.min(0.1, tj - tPrec)); tPrec = tj;
    if (evs && evs.length) lireEvenements(jeu, evs);
    // vitesse lissée (le viseur s'ouvre en courant)
    if (dt > 0) { const v = Math.sqrt((moi.x - px) * (moi.x - px) + (moi.z - pz) * (moi.z - pz)) / dt; vitesse += (Math.min(8, v) - vitesse) * Math.min(1, dt * 10); }
    px = moi.x; pz = moi.z; gonfle = Math.max(0, gonfle - dt * 3.2);
    const R = RG(), A = armeDe(moi.arme) || { dispersion: 0.02, dispersionMouvement: 0.02, recharge: 1.6, chargeur: 30, visee: null };
    // la visée : z = 1 + (zoom − 1)·smoothstep(vise) ; le viseur de hanche s'efface entre vise 0,3 et 0,7 et disparaît en course
    const vise = Math.max(0, Math.min(1, +moi.vise || 0)), sv = vise * vise * (3 - 2 * vise), zoom = A.visee && A.visee.zoom > 1 ? A.visee.zoom : 1, z = 1 + (zoom - 1) * sv;
    const viseur = viseurDe(A), lunette = viseur === 'lunette' && vise >= 0.85 && moi.vivant !== false, pr = viseur === 'point' && vise >= 0.7 && moi.vivant !== false;
    // viseur : écart = dispersion convertie en pixels avec le champ de vision vertical affiché (PRENDU.fovVue s'il existe : zoom compris ;
    // sinon PRENDU.fov, la base, divisée par le zoom de la visée)
    const fovVue = typeof PRENDU !== 'undefined' && PRENDU.fovVue > 0 ? PRENDU.fovVue : 0, fov0 = (typeof PRENDU !== 'undefined' && PRENDU.fov) || 70;
    const fov = fovVue || 2 * Math.atan(Math.tan(fov0 * DEG / 2) / z) / DEG, pxRad = (H / 2) / Math.tan(fov * DEG / 2);
    let disp = NaN;
    if (moi.equip && typeof PARMES !== 'undefined' && PARMES.dispersion) { try { disp = PARMES.dispersion(moi, A); } catch (e) { disp = NaN; } } // la dispersion v2 de la simulation (§ 4)
    if (!(disp >= 0)) { const vmax = R ? R.JOUEUR.vitesse : 5.2, mvt = Math.min(1, vitesse / vmax) + (moi.auSol === false ? 0.6 : 0); disp = (A.dispersionAvantVisee != null ? A.dispersionAvantVisee : A.dispersion) * (moi.accroupi ? 0.7 : 1) + (A.dispersionMouvement || 0) * mvt + gonfle * (A.recul || 0.02) * 1.6; }
    const ecart = Math.round(Math.max(4, Math.min(80, disp * pxRad)) * 2) / 2, classe = classeArme(moi.arme);
    if (ecart !== vu.ecart || classe !== vu.classeV) {
      vu.ecart = ecart; vu.classeV = classe; el.viseur.dataset.classe = classe;
      el.viseur.style.setProperty('--e', ecart + 'px');
    }
    const oLignes = moi.course || lunette ? 0 : Math.round((1 - Math.max(0, Math.min(1, (vise - 0.3) / 0.4))) * 20) / 20; // les branches
    const oPoint = moi.course || lunette || pr ? 0 : viseur === 'fer' ? 1 : oLignes; // le petit point blanc reste aux organes de visée
    if (oLignes !== vu.oL) { vu.oL = oLignes; el.viseur.style.setProperty('--o', String(oLignes)); }
    if (oPoint !== vu.oP) { vu.oP = oPoint; el.viseur.style.setProperty('--op', String(oPoint)); }
    if (lunette !== vu.lunette) { vu.lunette = lunette; el.lunette.classList.toggle('vu', lunette); racine.classList.toggle('lunette', lunette); }
    if (pr !== vu.pr) { vu.pr = pr; el.pr.classList.toggle('vu', pr); }
    const cible = !!(aide && aide.surCible) && moi.vivant;
    if (cible !== vu.cible) { vu.cible = cible; el.viseur.classList.toggle('cible', cible); el.pr.classList.toggle('cible', cible); }
    // marqueur de touche
    const at = toucheT < 0 ? 1 : (jeu.temps - toucheT) / 0.28;
    if (at < 1) { if (vu.toucheType !== toucheType) { vu.toucheType = toucheType; el.touche.className = 'h-touche ' + toucheType; } el.touche.style.opacity = (1 - at * at).toFixed(2); el.touche.style.transform = `scale(${(toucheType === 'mort' ? 1.35 : 1.1) - at * 0.25})`; vu.toucheVis = true; }
    else if (vu.toucheVis) { vu.toucheVis = false; el.touche.style.opacity = '0'; }
    // recharge : l'anneau autour du viseur
    let p = -1; if (moi.rechargeJusqua > jeu.temps) p = 1 - (moi.rechargeJusqua - jeu.temps) / (A.recharge || 1.6);
    const pq = p < 0 ? -1 : Math.round(Math.max(0, Math.min(1, p)) * 100);
    if (pq !== vu.rech) { vu.rech = pq; el.recharge.classList.toggle('vu', pq >= 0); if (pq >= 0) el.rechargeArc.style.strokeDashoffset = String(100 - pq); }
    // vie, armure
    const vie = Math.max(0, Math.round(moi.vie || 0)), arm = Math.max(0, Math.round(moi.armure || 0));
    const vieMax = jeu.vieMax > 0 ? jeu.vieMax : R ? R.JOUEUR.vie : 100, armMax = jeu.armureMax > 0 ? jeu.armureMax : R ? R.JOUEUR.armureMax : 50;
    if (vie !== vu.vie) {
      el.vieBarre.style.transform = `scaleX(${(vie / vieMax).toFixed(3)})`; el.vieN.textContent = String(vie);
      if (vu.vie != null && vie < vu.vie) { vu.fant = Math.max(vu.fant || 0, vu.vie); vu.fantT = now; }
      el.vie.classList.toggle('bas', vie > 0 && vie <= 30); vu.vie = vie;
    }
    if (vu.fant) { const k = (now - vu.fantT) / 600; const f = k < 0.5 ? vu.fant : vie + (vu.fant - vie) * Math.max(0, 1 - (k - 0.5) * 2); el.vieFant.style.transform = `scaleX(${(f / vieMax).toFixed(3)})`; if (k > 1) { vu.fant = 0; el.vieFant.style.transform = 'scaleX(0)'; } } // la vie perdue s'efface doucement
    if (arm !== vu.arm) { vu.arm = arm; el.armureBarre.style.transform = `scaleX(${(arm / armMax).toFixed(3)})`; el.armureN.textContent = String(arm); el.armureL.classList.toggle('vide', arm <= 0); }
    const inv = (moi.invincible || 0) > 0; if (inv !== vu.inv) { vu.inv = inv; el.vie.classList.toggle('protege', inv); }
    // la posture (près de la vie)
    const posture = moi.course ? 'course' : moi.vers || moi.posture || (moi.accroupi ? 'accroupi' : 'debout');
    if (posture !== vu.posture) { vu.posture = posture; el.posture.innerHTML = ICO(posture) || ICO('debout'); el.posture.dataset.p = posture; }
    // les deux emplacements : icône, « 30 | 120 » (« ∞ » : la réserve de l'arme de secours, qui ne tombe jamais en panne)
    let secours = null; try { secours = typeof PARMES !== 'undefined' && PARMES.secours ? PARMES.secours(moi) : moi.equip ? moi.armes[1] : 'rafale'; } catch (e) { secours = null; }
    const armes = Array.isArray(moi.armes) ? moi.armes : [moi.arme];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], id = armes[i] || null;
      if (id !== s.id) { s.id = id; s.el.hidden = !id; s.ico.innerHTML = iconeArme(id); s.el.setAttribute('aria-label', id ? `${i ? 'Secondaire' : 'Principale'} : ${nomArme(id)}` : ''); s.el.title = id ? nomArme(id) : ''; }
      if (!id) continue;
      const m = moi.munitions && moi.munitions[id] != null ? moi.munitions[id] : 0, r = id === secours ? '∞' : moi.reserve && moi.reserve[id] != null ? moi.reserve[id] : 0;
      if (m !== s.m) { s.m = m; s.n.textContent = String(m); }
      if (r !== s.res) { s.res = r; s.r.textContent = '| ' + r; }
      const main = id === moi.arme; if (main !== s.main) { s.main = main; s.el.classList.toggle('main', main); }
      const Ai = armeDe(id), bas = !!(Ai && Ai.chargeur) && m <= Math.ceil(Ai.chargeur * 0.25); if (bas !== s.bas) { s.bas = bas; s.el.classList.toggle('bas', bas); }
    }
    const mun = moi.munitions ? moi.munitions[moi.arme] : 0;
    const vide = mun === 0 && !(moi.rechargeJusqua > jeu.temps) && moi.vivant; if (vide !== vu.vide) { vu.vide = vide; el.centre.classList.toggle('vide', vide); }
    // chrono (« ∞ » sans limite de durée) et scores
    // sans limite : la partie le dit (jeu.reste indéfini) et les réglages aussi (durée 0) ; une partie qui compte encore son temps le montre
    const sansFin = typeof jeu.reste === 'number' && jeu.reste - jeu.reste === 0 ? false : opt(jeu).duree === 0;
    const reste = Math.max(0, typeof jeu.reste === 'number' && jeu.reste - jeu.reste === 0 ? jeu.reste : duree(jeu) - (jeu.temps || 0)), sec = sansFin ? -1 : Math.ceil(reste);
    if (sec !== vu.sec) { vu.sec = sec; el.chrono.textContent = sec < 0 ? '∞' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; el.chrono.parentNode.classList.toggle('fin', sec >= 0 && sec <= 15); }
    majScores(jeu);
    // « dernier debout » : « Manche 2/3 » sous le chrono ; le bandeau au début (dès que la partie tourne) et à la fin de chaque manche
    const M = mancheDe(jeu), mTxt = M && M.total > 1 ? `Manche ${M.n}/${M.total}` : '';
    if (mTxt !== vu.manche) { vu.manche = mTxt; el.manche.hidden = !mTxt; el.manche.textContent = mTxt; }
    if (M && tj > 0) {
      if (M.n !== vu.mancheN) { vu.mancheN = M.n; mancheDebut(M.n, M.total); }
      if (M.fin && vu.mancheFin !== M.n) { vu.mancheFin = M.n; const f = M.fin; mancheFin(jeu, M.n, M.total, f && typeof f === 'object' ? (f.vainqueur !== undefined ? f.vainqueur : f.gagnant) : null, f && typeof f === 'object' ? f.equipe : null); }
    }
    if (bandeauT >= 0 && now - bandeauT > 3200) { bandeauT = -1; el.bandeau.classList.remove('vu'); }
    // l'Extraction : sac, boussole vers la sortie, jauges, à terre / extrait, le bouton d'action
    majExtraction(jeu, now);
    // « Limite de la zone » à moins de 3 m du bord (la forme de jeu.zone.limite ou de monde.limite : cercles, polygones, carré, arêtes, distance())
    zoneDuJeu(jeu);
    if (jeu.temps - limiteT > 0.2 || limiteT < 0) {
      limiteT = jeu.temps; let d = Infinity;
      try { if (formeVue) d = distanceBord(formeVue, moi.x, moi.z); } catch (e) { d = Infinity; }
      const pres = moi.vivant !== false && d < 3; if (pres !== vu.limite) { vu.limite = pres; el.limite.hidden = !pres; }
    }
    // vignette de dégâts et vie basse
    vignette = Math.max(vie > 0 && vie <= 30 ? 0.35 + 0.12 * Math.sin(now / 260) : 0, vignette - dt * 1.4);
    const vg = Math.round(vignette * 50) / 50; if (vg !== vu.vg) { vu.vg = vg; el.vignette.style.opacity = String(vg); }
    const fk = flashT < 0 ? 1 : (now - flashT) / 260; if (fk < 1) { el.flash.style.opacity = (0.55 * (1 - fk)).toFixed(2); vu.flashVis = true; } else if (vu.flashVis) { vu.flashVis = false; el.flash.style.opacity = '0'; }
    // flèches de direction des dégâts (elles suivent ton cap)
    const cy = Math.cos(moi.yaw || 0), sy = Math.sin(moi.yaw || 0);
    for (let i = 0; i < fleches.length; i++) {
      const f = fleches[i]; if (f.t < 0) continue; const k = (jeu.temps - f.t) / 1.2;
      if (k >= 1 || k < 0) { f.t = -1; f.el.style.opacity = '0'; continue; }
      const dx = f.x - moi.x, dz = f.z - moi.z, av = -dx * sy - dz * cy, dr = dx * cy - dz * sy, ang = Math.atan2(dr, av);
      f.el.style.transform = `rotate(${(ang / DEG).toFixed(1)}deg)`; f.el.style.opacity = (1 - k * k).toFixed(2);
    }
    // chiffres de dégâts
    for (let i = 0; i < nombres.length; i++) {
      const n = nombres[i]; if (n.t < 0) continue; const k = (jeu.temps - n.t) / 0.85;
      if (k >= 1 || k < 0) { n.t = -1; n.el.style.opacity = '0'; continue; }
      const pr = projeter(n.x, n.y + k * 0.7, n.z);
      if (pr && pr.devant === false) { n.el.style.opacity = '0'; continue; }
      const nx = pr ? pr.x : W / 2 + 26, ny = pr ? pr.y : H / 2 - 30 - k * 30; // sans projection : au-dessus du viseur
      n.el.style.transform = `translate3d(${(nx + n.dx * k).toFixed(1)}px, ${ny.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3).toFixed(2)})`;
      n.el.style.opacity = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2);
    }
    // noms des alliés au-dessus des têtes
    majNoms(jeu);
    // fil : on efface les vieilles lignes
    const fil = el.fil; if (fil.lastChild && now - fil.lastChild._t > 6000) fil.lastChild.remove();
    // repeint : l'écran d'attente
    const mort = !moi.vivant && tMort >= 0 && !(VX.actif && (VX.aTerre || VX.extrait)); // (Extraction : à terre ou sorti, le voile du mode le dit)
    if (mort !== vu.mort) { vu.mort = mort; el.mort.hidden = !mort; racine.classList.toggle('mort', mort); if (mort) { el.mortPar.textContent = parQui && parQui !== idMoi ? `Repeint par ${nomDe(jeu, parQui)} !` : 'Repeint !'; el.mortArme.innerHTML = iconeArme(armeMort); } }
    if (mort) {
      const lice = M ? M.lice : 0, sr = !!M || VX.actif; // « dernier debout » : pas de retour, on attend la manche suivante ; Extraction : pas de retour non plus
      if (sr !== vu.mortSr) { vu.mortSr = sr; el.mortRetourL.hidden = sr; el.mortLice.hidden = !sr; el.mortPetit.textContent = sr ? 'Éliminé !' : 'Oups !'; }
      if (VX.actif) { const t = 'Ton sac est tombé : ce que tu portais est perdu. Attends la fin de la partie.'; if (t !== vu.mortLice) { vu.mortLice = t; el.mortLice.textContent = t; } }
      else if (sr) { const t = `Encore en lice : ${lice} · ${M.n < M.total ? 'attends la manche suivante' : 'attends la fin de la manche'}`; if (t !== vu.mortLice) { vu.mortLice = t; el.mortLice.textContent = t; } }
      else { const rr = Math.max(0, delaiRetour(jeu) - (jeu.temps - tMort)); ecrire('retour', el.mortRetour, Math.ceil(rr)); }
    }
    // minicarte
    if (jeu.temps - objetsT > 0.5 || objetsT < 0) { objetsT = jeu.temps; try { const M = jeu.mode && jeu.mode.objets ? jeu.mode : typeof PARENE !== 'undefined' ? PARENE : null; objets = M && M.objets ? M.objets(jeu) || [] : []; } catch (e) { objets = []; } }
    majVus(jeu); if (now - carteT > 32) { carteT = now; dessinerCarte(jeu); } // la minicarte à ~30 images/s
    if (scoresOuverts && now - scoresT > 300) remplirScores(jeu);
  }
  function majScores(jeu) {
    const es = jeu.entites, eq = estEquipes(jeu);
    let a = 0, b = 0, cB = '#FF6B8B', rang = 1;
    if (eq) { for (let i = 0; i < es.length; i++) { const e = es[i]; if (e.equipe === moi.equipe) a += kills(e); else { b += kills(e); cB = e.couleur || cB; } } }
    else { a = kills(moi); let meil = null; for (let i = 0; i < es.length; i++) { const e = es[i]; if (e === moi) continue; if (!meil || kills(e) > kills(meil)) meil = e; if (kills(e) > kills(moi) || (kills(e) === kills(moi) && points(e) > points(moi))) rang++; } b = meil ? kills(meil) : 0; cB = meil ? meil.couleur : cB; } // le rang : les repeints, puis les points (comme la fin)
    ecrire('sa', el.scoreMoi, a); ecrire('sb', el.scoreEux, b);
    const cA = moi.couleur || '#FFC84A'; if (cA !== vu.cA) { vu.cA = cA; el.pastMoi.style.background = cA; } // en équipes, la couleur de l'équipe (celle du joueur)
    if (cB !== vu.cB) { vu.cB = cB; el.pastEux.style.background = cB; }
    if (VX.actif) { const t = VX.extrait ? 'Tu es sorti' : VX.ouvert ? 'Sorties ouvertes' : `sorties dans ${Math.floor(Math.ceil(VX.ouvreDans) / 60)}:${String(Math.ceil(VX.ouvreDans) % 60).padStart(2, '0')}`; if (t !== vu.obj) { vu.obj = t; el.objectif.textContent = t; } return; }
    const M = mancheDe(jeu); if (M) { const n = M.lice; if ('lice' + n !== vu.obj) { const moins = typeof vu.obj === 'string' && +vu.obj.slice(4) > n; vu.obj = 'lice' + n; el.objectif.textContent = `Encore en lice : ${n}`; if (moins) relance(el.objectif, 'pique'); } return; }
    const cleObj = eq ? -1 : rang; if (cleObj !== vu.obj) { vu.obj = cleObj; el.objectif.textContent = `${eq ? 'équipe' : rang === 1 ? '1er' : rang + 'e'} · premier à ${objectif(jeu)}`; }
  }
  function majNoms(jeu) {
    const eq = estEquipes(jeu), es = jeu.entites; let k = 0;
    if (eq) for (let i = 0; i < es.length && k < noms.length; i++) {
      const e = es[i]; if (e === moi || !e.vivant || e.equipe !== moi.equipe) continue;
      const pr = projeter(e.x, e.y + 2.15, e.z); if (!pr || pr.devant === false) continue;
      const n = noms[k++]; if (n.txt !== e.nom) { n.txt = e.nom; n.el.textContent = e.nom; }
      n.el.style.transform = `translate3d(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px, 0) translate(-50%, -100%)`; if (!n.vu) { n.vu = true; n.el.style.opacity = '1'; }
    }
    for (; k < noms.length; k++) if (noms[k].vu) { noms[k].vu = false; noms[k].el.style.opacity = '0'; }
  }

  // ─── tableau des scores ───
  function lignes(jeu) { // les entités triées (classement du jeu s'il existe)
    let c = null; try { c = jeu.classement ? jeu.classement() : null; } catch (e) { c = null; }
    if (!Array.isArray(c) || !c.length) c = jeu.entites.slice().sort((x, y) => kills(y) - kills(x) || points(y) - points(x));
    const m = jeu.manche && typeof jeu.manche === 'object' ? jeu.manche : null, g = m && m.gagnees && typeof m.gagnees === 'object' ? m.gagnees : null, dd = !!mancheDe(jeu);
    return c.map((x) => { const e = x && x.score ? x : trouver(jeu, x && x.id) || x || {}; const s = e.score || x || {};
      const manches = s.manches != null ? s.manches : g && g[e.id] != null ? g[e.id] : dd ? 0 : null;
      return { id: e.id, nom: e.id === idMoi ? (e.nom || 'Toi') : e.nom, couleur: e.couleur, equipe: e.equipe, bot: e.bot, kills: s.kills || 0, morts: s.morts || 0, points: s.points || 0, manches, horsJeu: dd && e.vivant === false }; });
  }
  function tableHtml(jeu, ls) {
    const eq = estEquipes(jeu), avecManches = ls.some((l) => l.manches != null);
    return `<table class="h-table${avecManches ? ' manches' : ''}"><thead><tr><th></th><th>Joueur</th>${avecManches ? '<th>Manches</th>' : ''}<th>Repeints</th><th>Subis</th><th>Points</th></tr></thead><tbody>${ls.map((l, i) => `<tr class="${l.id === idMoi ? 'moi' : ''}${eq ? (l.equipe === (moi && moi.equipe) ? ' allie' : ' ennemi') : ''}${l.horsJeu ? ' hors' : ''}"><td>${i + 1}</td><td><i style="background:${esc(l.couleur || '#ccc')}"></i>${esc(l.nom)}${l.bot ? ' <small>robot</small>' : ''}</td>${avecManches ? `<td><b>${l.manches != null ? l.manches : 0}</b></td>` : ''}<td>${l.kills}</td><td>${l.morts}</td><td>${avecManches ? l.points : `<b>${l.points}</b>`}</td></tr>`).join('')}</tbody></table>`;
  }
  function objectifTxt(jeu) { // l'en-tête du tableau : « Premier à 25 repeints · 2:41 » ; « Dernier debout · manche 2/3 · encore en lice : 3 »
    const M = mancheDe(jeu), r = jeu.reste, t = typeof r === 'number' && r - r === 0 ? `${Math.floor(Math.ceil(r) / 60)}:${String(Math.ceil(r) % 60).padStart(2, '0')}` : opt(jeu).duree === 0 ? 'sans limite de temps' : '';
    if (M) return `Dernier debout${M.total > 1 ? ` · manche ${M.n}/${M.total}` : ''} · encore en lice : ${M.lice}`;
    return `Premier à ${objectif(jeu)} repeints${estEquipes(jeu) ? ' (par équipe)' : ''}${t ? ' · ' + t : ''}`;
  }
  function remplirScores(jeu) { scoresT = performance.now(); if (!jeu) return; el.scoresCarte.innerHTML = `<h2>Scores</h2><p class="h-obj">${esc(objectifTxt(jeu))}</p>${tableHtml(jeu, lignes(jeu).slice(0, 6))}<p class="h-note">Touche pour fermer</p>`; }
  function scores(on) { scoresOuverts = !!on && !!jeuVu && !finie; if (!el.scores) return; el.scores.hidden = !scoresOuverts; if (scoresOuverts) remplirScores(jeuVu); if (actions.scores) actions.scores(scoresOuverts); }

  // ─── écran de fin ───
  function fin(res, jeu, id, infos) {
    if (!racine) return; finie = true; scores(false); infos = infos || {};
    el.lunette.classList.remove('vu'); vu.lunette = false; racine.classList.remove('lunette');
    jeu = jeu || jeuVu; idMoi = id || idMoi;
    if (infos.extraction) return finExtraction(jeu, infos);
    let ls = []; try { ls = jeu ? lignes(jeu) : []; } catch (e) { ls = []; }
    const eq = jeu ? estEquipes(jeu) : false, me = ls.find((l) => l.id === idMoi) || { points: 0, kills: 0, morts: 0 }, rang = ls.findIndex((l) => l.id === idMoi) + 1;
    let titre, gagne;
    if (eq) { const mien = me.equipe; let a = 0, b = 0; ls.forEach((l) => { if (l.equipe === mien) a += l.kills; else b += l.kills; }); gagne = a > b; titre = a > b ? 'Victoire de ton équipe !' : a === b ? 'Égalité !' : 'Défaite… revanche ?'; }
    else { gagne = rang === 1; titre = rang === 1 ? 'Victoire !' : rang === 2 ? '2e place, presque !' : `${rang}e place`; }
    if (infos.titre) { titre = infos.titre; gagne = false; } // une partie interrompue (l'hôte est parti) : ni victoire ni place
    const podium = ls.slice(0, 3).map((l, i) => `<div class="h-pod p${i + 1}${l.id === idMoi ? ' moi' : ''}"><span class="h-pod-nom"><i style="background:${esc(l.couleur || '#ccc')}"></i>${esc(l.nom)}</span><div class="h-pod-socle"><b>${i + 1}</b><small>${l.points} pts</small></div></div>`);
    const ordre = [podium[1] || '', podium[0] || '', podium[2] || ''].join('');
    const boutons = Array.isArray(infos.boutons) && infos.boutons.length ? infos.boutons : [{ fin: 'rejouer', texte: 'Rejouer', cls: 'menthe' }, { fin: 'menu', texte: 'Menu', cls: 'blanc' }];
    el.fin.innerHTML = `<div class="h-fin-carte ${gagne ? 'gagne' : ''}">
      <div class="h-fin-g"><small>${esc(infos.mode || 'Arène')} · fin de partie</small><h2>${esc(titre)}</h2>
        ${infos.message ? `<div class="h-fin-msg">${esc(infos.message)}</div>` : ''}
        <div class="h-podium">${ordre}</div>
        <div class="h-fin-moi"><span><b>${me.points}</b> points</span><span><b>${me.kills}</b> repeints</span><span><b>${me.morts}</b> fois repeint</span></div>
        ${infos.record ? '<div class="h-record">Nouveau record !</div>' : infos.meilleur ? `<div class="h-record ancien">Record : ${infos.meilleur} points</div>` : ''}
      </div>
      <div class="h-fin-d">${tableHtml(jeu || { entites: [] }, ls.slice(0, 6))}
        ${infos.attente ? `<p class="h-fin-attente">${esc(infos.attente)}</p>` : ''}
        <div class="h-fin-btns${boutons.length > 2 ? ' trois' : ''}">${boutons.map((b) => `<button type="button" class="bouton ${esc(b.cls || 'blanc')}" data-fin="${esc(b.fin)}"${b.disabled ? ' disabled' : ''}>${esc(b.texte)}</button>`).join('')}</div></div>
    </div>`;
    el.fin.hidden = false; el.mort.hidden = true; vu.mort = false; racine.classList.add('finie'); racine.classList.remove('mort');
    return { gagne, rang, points: me.points, kills: me.kills };
  }
  // l'écran de fin d'une Extraction : ce qui est sorti (et rejoint le coffre) ou ce qui est perdu ; l'équipe ; Rejouer, Coffre, Menu
  function puce(o, perdu) { o = objetDe(o); const r = rarete(o), a = o && (o.arme || (o.type === 'arme' && o.id)), id = typeof a === 'string' && estArme(a) ? a : null;
    return `<span class="h-obj r-${r}${perdu ? ' perdu' : ''}">${id ? `<span class="h-obj-ico">${iconeArme(id)}</span>` : '<i aria-hidden="true"></i>'}<b>${esc((o && (o.nom || (id ? nomArme(id) : o.id))) || 'Objet')}</b><small>${valeur(o)}</small></span>`; }
  function finExtraction(jeu, infos) {
    const b = infos.extraction, sorti = !!b.sorti, objets = sorti ? b.objets || [] : b.perdus || [];
    const titre = infos.titre || (sorti ? 'Extrait !' : b.mort ? 'Repeint… le sac est perdu' : 'Pas sorti à temps…');
    const bout = Array.isArray(infos.boutons) && infos.boutons.length ? infos.boutons : [{ fin: 'rejouer', texte: 'Rejouer', cls: 'menthe' }, { fin: 'menu', texte: 'Menu', cls: 'blanc' }];
    const etat = (l) => (l.sorti ? '<em class="ok">Sorti</em>' : l.mort ? '<em class="ko">Repeint</em>' : '<em class="ko">Resté</em>');
    const js = (b.joueurs || []).slice().sort((x, y) => (y.score || 0) - (x.score || 0) || y.valeur - x.valeur), best = js.length > 1 && (js[0].score || js[0].valeur) > 0 ? js[0].id : null, rival = js.length > 1;
    const lignesJ = js.map((l) => `<tr class="${l.id === idMoi ? 'moi' : ''}${l.id === best ? ' meilleur' : ''}"><td><i style="background:${esc(l.couleur || '#ccc')}"></i>${esc(l.nom)}</td><td>${etat(l)}</td><td><b>${l.sorti ? l.valeur : 0}</b></td><td>${l.killsRobots != null ? l.killsRobots : l.kills}</td>${rival ? `<td>${l.killsJoueurs != null ? l.killsJoueurs : '–'}</td><td>${l.primes || 0}</td>` : ''}</tr>`).join('');
    el.fin.innerHTML = `<div class="h-fin-carte ext ${sorti ? 'gagne' : 'rate'}">
      <div class="h-fin-g"><small>${esc(infos.mode || 'Extraction')} · fin de partie</small><h2>${esc(titre)}</h2>
        <div class="h-fin-butin"><span class="h-fin-gros">${sorti ? '+' : ''}${sorti ? b.valeur : b.perdu || 0}<i class="h-piece" aria-hidden="true"></i></span><small>${sorti ? `${objets.length} objet${objets.length > 1 ? 's' : ''} rapporté${objets.length > 1 ? 's' : ''} dans ton coffre` : objets.length ? `${objets.length} objet${objets.length > 1 ? 's' : ''} perdu${objets.length > 1 ? 's' : ''}` : 'Ton sac était vide'}</small></div>
        <div class="h-fin-objs${sorti ? '' : ' perdus'}">${objets.slice(0, 8).map((o) => puce(o, !sorti)).join('')}${objets.length > 8 ? `<span class="h-obj plus">+${objets.length - 8}</span>` : ''}</div>
        ${infos.record ? '<div class="h-record">Meilleure sortie !</div>' : infos.meilleur ? `<div class="h-record ancien">Meilleure sortie : ${infos.meilleur}</div>` : ''}
      </div>
      <div class="h-fin-d"><table class="h-table ext${rival ? ' rivaux' : ''}"><thead><tr><th>Joueur</th><th></th><th>Butin</th><th>Robots</th>${rival ? '<th>Joueurs</th><th>Primes</th>' : ''}</tr></thead><tbody>${lignesJ}</tbody></table>
        ${(infos.contrats || []).length ? `<div class="cf-contrats h-fin-contrats">${infos.contrats.map((c) => `<div class="cf-contrat${c.fait ? ' fait' : ''}"><span><b>${esc(c.texte)}</b><small>${c.prog | 0}/${c.but || 1} · ${c.recompense} pièces</small></span>${c.fait && !c.reclame ? `<button type="button" class="bouton menthe" data-fin="reclamer" data-i="${c.i}">Réclamer</button>` : ''}</div>`).join('')}</div>` : ''}
        ${infos.semaine ? `<p class="h-fin-semaine">Zone de la semaine : +${infos.semaine} % de pièces</p>` : ''}
        <p class="h-fin-attente">${b.gardiens ? `${b.gardiens} gardien${b.gardiens > 1 ? 's' : ''} repeint${b.gardiens > 1 ? 's' : ''} · ` : ''}${infos.pieces != null ? `Ton coffre : ${infos.pieces} pièces` : ''}</p>
        <div class="h-fin-btns${bout.length > 2 ? ' trois' : ''}">${bout.map((x) => `<button type="button" class="bouton ${esc(x.cls || 'blanc')}" data-fin="${esc(x.fin)}">${esc(x.texte)}</button>`).join('')}</div></div>
    </div>`;
    el.fin.hidden = false; el.mort.hidden = true; vu.mort = false; el.voileExt.hidden = true; vu.voK = ''; el.jauge.hidden = true; racine.classList.add('finie'); racine.classList.remove('mort');
    return { gagne: sorti, rang: 1, points: b.valeur, kills: b.kills };
  }
  function reinit(o) { // une nouvelle partie (o : { equipes, reglages } ; reglages : les réglages normalisés du lancement, si le jeu ne les expose pas)
    if (!racine) return; equipesPartie = !!(o && o.equipes); reglagesPartie = o && o.reglages && typeof o.reglages === 'object' ? o.reglages : null; optJeu = null;
    mancheEv = null; bandeauCle = ''; bandeauT = -1; if (el.bandeau) el.bandeau.classList.remove('vu');
    finie = false; jeuVu = null; moi = null; tMort = -1; parQui = null; gonfle = 0; vitesse = 0; vignette = 0; toucheT = -1; flashT = -1; limiteT = -1; objets = []; objetsT = -1; vusT = -1;
    coupsDe.clear(); vusCache.clear(); for (const k in vu) delete vu[k]; vu.ecart = -1; carteT = 0;
    racine.classList.remove('finie', 'mort'); el.fil.innerHTML = ''; el.fin.hidden = true; el.fin.innerHTML = ''; el.mort.hidden = true; el.scores.hidden = true; scoresOuverts = false;
    el.touche.style.opacity = '0'; el.flash.style.opacity = '0'; el.lunette.classList.remove('vu'); el.pr.classList.remove('vu'); el.vignette.style.opacity = '0'; el.vieFant.style.transform = 'scaleX(0)';
    for (const n of nombres) { n.t = -1; n.el.style.opacity = '0'; } for (const f of fleches) { f.t = -1; f.el.style.opacity = '0'; } for (const n of noms) { n.vu = false; n.el.style.opacity = '0'; }
    el.annonce.classList.remove('vu'); el.sous.classList.remove('vu'); el.ramasse.classList.remove('vu'); el.refus.classList.remove('vu');
    for (const s of slots) { s.id = null; s.m = null; s.res = null; s.main = null; s.bas = null; }
    contratPartie = o && o.contrat && o.contrat.texte ? o.contrat : null;
    coffresVus.clear(); vusExtT = -1; ouvertVu = null; contexte = null; cacherEtiquettes(); racine.classList.remove('extraction'); el.sac.hidden = true; el.boussole.hidden = true; el.jauge.hidden = true; el.voileExt.hidden = true;
  }
  return { init, carte, taille, maj, fin, reinit, annonce, scores, iconeArme, nomArme, classeArme, nomClasse, vignette: vignetteZone, formeZone, formeDe, distanceBord,
    extraction: (jeu, id) => lireExtraction(jeu, id || idMoi), bilanExtraction, rarete, COUL_RAR, get contexte() { return contexte; }, SVG_SAC,
    get zone() { return formeVue ? { cle: formeVue.cle, englobant: Object.assign({}, formeVue.englobant), fond: fondCle } : null; }, get scoresOuverts() { return scoresOuverts; }, get finie() { return finie; } };
})();
