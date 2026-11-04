/* DERNIER REMPART — le HUD de la partie, en DOM par-dessus la 3D. En haut à gauche la vie et la mini-carte ; en haut au centre les
   zombies tués, la ferraille, la vague (« V3 · 42 restants »), le score et la série (×2, ×3, ×4) ; en haut à droite la pause ; à droite
   l'atelier repliable (défenses à poser : prix et « posées / permises » ; améliorations : crans et prix) ; en bas au centre les deux
   emplacements d'armes (le pistolet sans fin, l'arme trouvée et ses munitions) ; au milieu les annonces (vague, boss, série), le compte
   à rebours de la pause et son bouton « Lancer la vague » ; la barre du boss (son nom) ; l'écran qui rougit quand on est touché.
   Rien n'est réécrit si la valeur n'a pas changé (les écritures DOM coûtent cher sur un téléphone).
   API : ZHUD.init(racine, { construire(type), ameliorer(type), arme(i), pause(), passer() }), maj(jeu, idMoi, dt, evs), annonce(texte, sous), toast(texte) */
const ZHUD = (() => {
  'use strict';
  const D = typeof ZDONNEES !== 'undefined' ? ZDONNEES : null;
  const J = typeof ZJEU !== 'undefined' ? ZJEU : null;
  const ICO = {
    tourelle: '<svg viewBox="0 0 40 40"><rect x="9" y="27" width="22" height="7" rx="2" fill="#5D6470"/><rect x="18" y="19" width="4" height="9" fill="#4A505A"/><rect x="10" y="12" width="16" height="10" rx="2" fill="#9AA3B2" stroke="#2B2A33" stroke-width="2"/><rect x="25" y="14" width="11" height="3" fill="#2B2A33"/><rect x="25" y="18" width="11" height="3" fill="#2B2A33"/></svg>',
    barricade: '<svg viewBox="0 0 40 40"><rect x="5" y="10" width="30" height="6" rx="1.5" fill="#C99B62" stroke="#5A3D22" stroke-width="2"/><rect x="5" y="19" width="30" height="6" rx="1.5" fill="#B98E5A" stroke="#5A3D22" stroke-width="2"/><rect x="5" y="28" width="30" height="6" rx="1.5" fill="#C99B62" stroke="#5A3D22" stroke-width="2"/></svg>',
    mine: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="27" rx="14" ry="6" fill="#5E6347" stroke="#2B2A33" stroke-width="2"/><rect x="16" y="18" width="8" height="7" rx="2" fill="#3B3E2E"/><circle cx="20" cy="16" r="3" fill="#FF4A3A"/></svg>',
    mortier: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="31" rx="13" ry="4.5" fill="#6B6F57"/><rect x="15" y="8" width="9" height="22" rx="3" transform="rotate(28 20 20)" fill="#4B5040" stroke="#2B2A33" stroke-width="2"/></svg>',
    epouvantail: '<svg viewBox="0 0 40 40"><rect x="18.5" y="8" width="3" height="28" fill="#7A5634"/><rect x="6" y="15" width="28" height="3" fill="#7A5634"/><rect x="13" y="16" width="14" height="12" rx="2" fill="#C94F3D"/><circle cx="20" cy="10" r="5" fill="#E9D18C"/><path d="M12 7h16l-3-5h-10z" fill="#C9A24E"/></svg>',
    degats: '<svg viewBox="0 0 40 40"><path d="M12 30l14-14 4 4-14 14z" fill="#E8C547" stroke="#2B2A33" stroke-width="2" stroke-linejoin="round"/><path d="M26 16l4-8 2 2-2 10z" fill="#F2F2F2" stroke="#2B2A33" stroke-width="2" stroke-linejoin="round"/></svg>',
    cadence: '<svg viewBox="0 0 40 40"><path d="M23 4L9 23h9l-3 13 15-20h-9z" fill="#FFD84A" stroke="#2B2A33" stroke-width="2" stroke-linejoin="round"/></svg>',
    vie: '<svg viewBox="0 0 40 40"><path d="M20 34S5 25 5 15a7.5 7.5 0 0 1 15-2 7.5 7.5 0 0 1 15 2c0 10-15 19-15 19z" fill="#E5533D" stroke="#2B2A33" stroke-width="2"/></svg>',
    aimant: '<svg viewBox="0 0 40 40"><path d="M9 8h7v13a4 4 0 0 0 8 0V8h7v13a11 11 0 0 1-22 0z" fill="#D9534F" stroke="#2B2A33" stroke-width="2"/><rect x="9" y="8" width="7" height="5" fill="#E8E8E8"/><rect x="24" y="8" width="7" height="5" fill="#E8E8E8"/></svg>',
    defense: '<svg viewBox="0 0 40 40"><path d="M27 5a8 8 0 0 0-8 10L6 28l6 6 13-13a8 8 0 0 0 10-8l-5 3-5-3v-5z" fill="#B8C2CC" stroke="#2B2A33" stroke-width="2" stroke-linejoin="round"/></svg>',
    ecrou: '<svg viewBox="0 0 24 24"><path d="M12 2l8.7 5v10L12 22l-8.7-5V7z" fill="#B8C2CC" stroke="#2B2A33" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="#2B2A33"/></svg>',
    crane: '<svg viewBox="0 0 24 24"><path d="M12 2C6.5 2 3 5.8 3 10.5c0 2.8 1.3 4.6 3 5.6V20h3v-2h2v2h2v-2h2v2h3v-3.9c1.7-1 3-2.8 3-5.6C21 5.8 17.5 2 12 2z" fill="#F2F2F2" stroke="#2B2A33" stroke-width="1.6"/><circle cx="8.5" cy="11" r="2.2" fill="#2B2A33"/><circle cx="15.5" cy="11" r="2.2" fill="#2B2A33"/></svg>',
    coeur: '<svg viewBox="0 0 40 40"><path d="M20 35S4 25.5 4 14.5A8 8 0 0 1 20 12a8 8 0 0 1 16 2.5C36 25.5 20 35 20 35z" fill="#E5533D" stroke="#2B2A33" stroke-width="2.5"/><path d="M10 13a4 4 0 0 1 4-3" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".7"/></svg>',
    pause: '<svg viewBox="0 0 40 40"><rect x="11" y="9" width="6" height="22" rx="1.5" fill="#fff"/><rect x="23" y="9" width="6" height="22" rx="1.5" fill="#fff"/></svg>',
    multi: '<svg viewBox="0 0 40 40"><path d="M6 14h18l-3-4M6 26h18l-3 4" stroke="#2B2A33" stroke-width="3" fill="none" stroke-linecap="round"/><rect x="24" y="11" width="10" height="6" rx="3" fill="#E8C547" stroke="#2B2A33" stroke-width="2"/><rect x="24" y="23" width="10" height="6" rx="3" fill="#E8C547" stroke="#2B2A33" stroke-width="2"/></svg>',
    perce: '<svg viewBox="0 0 40 40"><circle cx="13" cy="20" r="6" fill="#8DBF6A" stroke="#2B2A33" stroke-width="2"/><circle cx="26" cy="20" r="6" fill="#8DBF6A" stroke="#2B2A33" stroke-width="2"/><path d="M3 20h34" stroke="#E8C547" stroke-width="4" stroke-linecap="round"/><path d="M33 16l4 4-4 4" stroke="#2B2A33" stroke-width="2.5" fill="none"/></svg>',
    critique: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="#fff" stroke="#2B2A33" stroke-width="3"/><circle cx="20" cy="20" r="6" fill="#E5533D" stroke="#2B2A33" stroke-width="2"/><path d="M20 3v8M20 29v8M3 20h8M29 20h8" stroke="#2B2A33" stroke-width="3"/></svg>',
    regen: '<svg viewBox="0 0 40 40"><rect x="7" y="13" width="26" height="14" rx="4" fill="#F2D2A9" stroke="#2B2A33" stroke-width="2.5" transform="rotate(-30 20 20)"/><path d="M17 17h6M20 14v6" stroke="#E5533D" stroke-width="3" transform="rotate(-30 20 20)"/></svg>',
    vitesse: '<svg viewBox="0 0 40 40"><path d="M8 27c6 0 9-2 12-8l3-6 7 3-2 5h5l1 6c-8 2-18 3-26 0z" fill="#5B8BD9" stroke="#2B2A33" stroke-width="2.5" stroke-linejoin="round"/><path d="M3 14h9M2 20h7" stroke="#2B2A33" stroke-width="2.5" stroke-linecap="round"/></svg>',
    portee: '<svg viewBox="0 0 40 40"><rect x="4" y="17" width="26" height="7" rx="3" fill="#6C6F7D" stroke="#2B2A33" stroke-width="2.5"/><rect x="12" y="9" width="14" height="7" rx="3" fill="#9B6BD6" stroke="#2B2A33" stroke-width="2.5"/><path d="M30 20h7" stroke="#2B2A33" stroke-width="3"/></svg>',
    butin: '<svg viewBox="0 0 40 40"><path d="M8 16h24l-2 18H10z" fill="#B98E5A" stroke="#2B2A33" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 16a6 6 0 0 1 12 0" stroke="#2B2A33" stroke-width="2.5" fill="none"/><path d="M20 21l5 3v6l-5 3-5-3v-6z" fill="#B8C2CC" stroke="#2B2A33" stroke-width="2"/></svg>',
    grenade: '<svg viewBox="0 0 40 40"><ellipse cx="19" cy="24" rx="11" ry="12" fill="#5E7A3E" stroke="#2B2A33" stroke-width="2.5"/><path d="M11 20h16M11 27h16M19 13v22" stroke="#3E5228" stroke-width="2"/><rect x="15" y="7" width="9" height="6" rx="1.5" fill="#9AA0A8" stroke="#2B2A33" stroke-width="2"/><path d="M24 9c5 0 7 3 6 7" stroke="#2B2A33" stroke-width="2.5" fill="none"/><circle cx="30" cy="17" r="2.5" fill="#FFD84A" stroke="#2B2A33" stroke-width="1.5"/></svg>',
    medaille: '<svg viewBox="0 0 24 24"><path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill="#D9534F"/><circle cx="12" cy="15" r="7" fill="#FFD84A" stroke="#2B2A33" stroke-width="1.8"/><path d="M12 11l1.2 2.5 2.7.3-2 1.8.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2-1.8 2.7-.3z" fill="#E0A61E"/></svg>',
    cadenas: '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" fill="#9AA0A8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="#9AA0A8" stroke-width="2.4" fill="none"/></svg>',
  };
  // les armes en silhouette (vues de côté)
  const ARME_ICO = {
    pistolet: '<svg viewBox="0 0 64 32"><path d="M10 8h40v8H30l-3 4h-6l-2 9h-8l3-13h-4z" fill="#5B8BD9" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/></svg>',
    revolver: '<svg viewBox="0 0 64 32"><path d="M6 9h36l2 3h12v5H38l-4 3h-7l-3 10h-9l4-12h-4l-2-3h-5z" fill="#9AA0A8" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="14" r="4" fill="#5C6068"/></svg>',
    pompe: '<svg viewBox="0 0 64 32"><path d="M2 14l12-4h40v6H40v3H26l-2 8h-8l1-8-15 2z" fill="#8A5A2B" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/><rect x="30" y="16" width="14" height="5" rx="2" fill="#5A3D22" stroke="#1F2533" stroke-width="2"/></svg>',
    mitraillette: '<svg viewBox="0 0 64 32"><path d="M8 9h42v8H36v12h-7V17h-5l-2 6h-7l2-6h-9z" fill="#3E9C6B" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/></svg>',
    fusil: '<svg viewBox="0 0 64 32"><path d="M2 12l14-3h44v5H44l-2 4h-6v9h-7v-9h-6l-3 5h-7l2-6H2z" fill="#6C6F7D" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/></svg>',
    precision: '<svg viewBox="0 0 64 32"><path d="M2 15l14-4h46v4H40l-3 4H24l-3 6h-7l2-7H2z" fill="#9B6BD6" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/><rect x="24" y="6" width="14" height="5" rx="2" fill="#2B2A33"/></svg>',
  };
  // les familles (les armes sans silhouette à elles) : la couleur vient de l'arme
  const FAMILLE_ICO = {
    pistolet: ARME_ICO.pistolet.replace('#5B8BD9', 'currentColor'), mitraillette: ARME_ICO.mitraillette.replace('#3E9C6B', 'currentColor'), pompe: ARME_ICO.pompe.replace('#8A5A2B', 'currentColor'),
    fusil: ARME_ICO.fusil.replace('#6C6F7D', 'currentColor'), sniper: ARME_ICO.precision.replace('#9B6BD6', 'currentColor'),
    lanceur: '<svg viewBox="0 0 64 32"><path d="M4 9h48l6 3v6l-6 3H34l-2 8h-8l2-8H4z" fill="currentColor" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/><circle cx="12" cy="15" r="3" fill="#1F2533"/></svg>',
    energie: '<svg viewBox="0 0 64 32"><path d="M6 10h38l10-4v20l-10-4H34l-3 7h-8l2-7H6z" fill="currentColor" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/><path d="M40 9l-5 7h5l-4 7" stroke="#FFF" stroke-width="2" fill="none"/></svg>',
    flamme: '<svg viewBox="0 0 64 32"><path d="M4 12h30l8-3h10v14H42l-8-3h-4l-2 9h-8l2-9H4z" fill="currentColor" stroke="#1F2533" stroke-width="2.5" stroke-linejoin="round"/><rect x="8" y="18" width="12" height="8" rx="3" fill="#C0392B" stroke="#1F2533" stroke-width="2"/></svg>',
  };
  const iconeArme = (id) => { const A = ZDONNEES.ARMES[id]; if (ARME_ICO[id]) return ARME_ICO[id]; if (!A) return ''; return `<span class="ico-arme" style="color:${A.couleur}">${FAMILLE_ICO[A.famille] || FAMILLE_ICO.pistolet}</span>`; };
  const DEFS1 = ['tourelle', 'barricade', 'mine', 'mortier', 'epouvantail'], DEFS2 = ['tourellefeu', 'tourelletesla', 'claymore', 'baril', 'radio'], DEFS = DEFS1.concat(DEFS2), AMS = ['degats', 'cadence', 'vie', 'aimant', 'defense'];
  Object.assign(ICO, {
    tourellefeu: '<svg viewBox="0 0 40 40"><rect x="9" y="27" width="22" height="7" rx="2" fill="#5D6470"/><rect x="18" y="19" width="4" height="9" fill="#4A505A"/><rect x="10" y="12" width="16" height="10" rx="2" fill="#D9824B" stroke="#2B2A33" stroke-width="2"/><path d="M26 17h5c4-3 6 1 3 3 3 1 1 5-3 3h-5z" fill="#FFB347" stroke="#C0392B" stroke-width="1.5"/></svg>',
    tourelletesla: '<svg viewBox="0 0 40 40"><rect x="10" y="29" width="20" height="6" rx="2" fill="#5D6470"/><rect x="17" y="14" width="6" height="16" fill="#7C8696" stroke="#2B2A33" stroke-width="2"/><circle cx="20" cy="10" r="6" fill="#6FD3FF" stroke="#2B2A33" stroke-width="2"/><path d="M27 6l4 2-3 2 4 2" stroke="#BFF0FF" stroke-width="2" fill="none"/></svg>',
    claymore: '<svg viewBox="0 0 40 40"><path d="M7 14q13-6 26 0v11q-13-5-26 0z" fill="#6B7A3A" stroke="#2B2A33" stroke-width="2.2"/><path d="M12 30l-3 5M28 30l3 5" stroke="#2B2A33" stroke-width="2.2"/><circle cx="20" cy="18" r="2" fill="#FF4A3A"/></svg>',
    baril: '<svg viewBox="0 0 40 40"><rect x="10" y="7" width="20" height="27" rx="4" fill="#D64534" stroke="#2B2A33" stroke-width="2.2"/><path d="M10 14h20M10 27h20" stroke="#8C2A1E" stroke-width="2"/><path d="M20 15l-3 6h4l-3 6" stroke="#FFE07A" stroke-width="2" fill="none"/></svg>',
    radio: '<svg viewBox="0 0 40 40"><path d="M24 6l-8 9" stroke="#2B2A33" stroke-width="2"/><rect x="6" y="15" width="28" height="18" rx="4" fill="#5B8BD9" stroke="#2B2A33" stroke-width="2.2"/><circle cx="14" cy="24" r="5" fill="#2B2A33"/><rect x="22" y="20" width="8" height="3" fill="#FFE07A"/><rect x="22" y="25" width="8" height="3" fill="#FFE07A"/></svg>',
  });
  const NB_CHIFFRES = 40, chiffres = [], derniers = [], cumul = new Map(); let iChiffre = 0, projeter = null, nbChiffres = 0;
  let R = null, A = null, el = {}, vu = {}, carteFond = null, carteJeu = null, carteT = 0, rougeur = 0, toastT = 0, annonceT = 0, ouvert = true;
  const $ = (s) => R.querySelector(s);
  const ecrire = (cle, e, v, attr) => { if (vu[cle] === v) return; vu[cle] = v; if (attr) e.setAttribute(attr, v); else e.textContent = v; };

  function init(racine, actions) {
    R = racine; A = actions || {}; projeter = A.projeter || null;
    R.innerHTML = `
      <div class="h-vie"><span class="h-coeur">${ICO.coeur}</span><div class="h-barre"><i></i></div><b class="h-vie-n contour">100</b></div>
      <div class="h-xp"><span class="h-niv">N1</span><div class="h-xp-barre"><i></i></div></div>
      <canvas class="h-carte" width="132" height="132" aria-label="Mini-carte"></canvas>
      <div class="h-centre">
        <div class="h-ligne"><span class="h-tues contour"><span class="ico">${ICO.crane}</span><b>0</b></span><span class="h-ferraille contour"><span class="ico">${ICO.ecrou}</span><b>0</b><small>FERRAILLE</small></span></div>
        <div class="h-vague"><span class="h-v">V1</span><span class="h-rest contour">—</span></div>
        <div class="h-serie" hidden>SÉRIE ×2</div>
        <div class="h-objectif contour" hidden></div>
      </div>
      <div class="h-score contour">SCORE <b>0</b></div>
      <button class="h-pause" type="button" aria-label="Pause">${ICO.pause}</button>
      <div class="h-atelier ouvert">
        <button class="h-poignee" type="button" aria-label="Replier l’atelier"><span>‹</span></button>
        <div class="h-cols">
          <div class="h-col">${AMS.map((k) => `<button type="button" class="h-btn am" data-am="${k}"><span class="ico">${ICO[k]}</span><small class="niv"></small><b class="prix"></b></button>`).join('')}</div>
          ${[DEFS1, DEFS2].map((L) => `<div class="h-col">${L.map((k) => `<button type="button" class="h-btn def" data-def="${k}"><span class="nb"></span><span class="ico">${ICO[k]}</span><b class="prix"></b></button>`).join('')}</div>`).join('')}
        </div>
        <div class="h-info" hidden></div>
      </div>
      <div class="h-armes"><div class="h-arme-nom contour">PISTOLET</div><div class="h-slots"><button type="button" class="h-slot" data-i="0"></button><button type="button" class="h-slot" data-i="1"></button><button type="button" class="h-grenade" aria-label="Lancer une grenade"><span class="ico">${ICO.grenade}</span><span class="h-gren-voile"></span></button></div></div>
      <div class="h-milieu">
        <div class="h-entre" hidden><div class="contour h-entre-t">Vague 1 dans 4</div><button type="button" class="h-lancer">Lancer la vague</button></div>
        <div class="h-annonce" hidden><b class="contour"></b><small class="contour"></small></div>
      </div>
      <div class="h-trouve" hidden></div>
      <div class="h-boss" hidden><span class="contour">MASTODONTE</span><div class="h-barre rouge"><i></i></div></div>
      <div class="h-toast" hidden></div>
      <div class="h-rouge"></div>
      <div class="h-flash"></div>
      <div class="h-degats" aria-hidden="true"></div>
      <div class="h-noms" aria-hidden="true"><span hidden></span><span hidden></span><span hidden></span><span hidden></span></div>
      <div class="h-bulles" aria-hidden="true"><span hidden></span><span hidden></span><span hidden></span><span hidden></span></div>
      <button type="button" class="h-emote" aria-label="Émotes">💬</button>
      <div class="h-emotes" hidden></div>
      <div class="h-choix" hidden role="dialog" aria-label="Choisis un atout"><div class="h-choix-t contour">NIVEAU 2 !</div><div class="h-choix-sous contour">Choisis un atout</div><div class="h-cartes"></div></div>`;
    el = {
      vie: $('.h-barre i'), vieN: $('.h-vie-n'), carte: $('.h-carte'), tues: $('.h-tues b'), fer: $('.h-ferraille b'), v: $('.h-v'), rest: $('.h-rest'), serie: $('.h-serie'),
      score: $('.h-score b'), atelier: $('.h-atelier'), info: $('.h-info'), armeNom: $('.h-arme-nom'), slots: [...R.querySelectorAll('.h-slot')], entre: $('.h-entre'), entreT: $('.h-entre-t'),
      objectif: $('.h-objectif'), annonce: $('.h-annonce'), annB: $('.h-annonce b'), annS: $('.h-annonce small'), boss: $('.h-boss'), bossB: $('.h-boss i'), bossN: $('.h-boss span'), toast: $('.h-toast'), rouge: $('.h-rouge'),
      defs: {}, ams: {}, xp: $('.h-xp-barre i'), niv: $('.h-niv'), gren: $('.h-grenade'), grenVoile: $('.h-gren-voile'), degats: $('.h-degats'), noms: [...R.querySelectorAll('.h-noms span')], bulles: [...R.querySelectorAll('.h-bulles span')], emote: $('.h-emote'), emotes: $('.h-emotes'), choix: $('.h-choix'), choixT: $('.h-choix-t'), cartes: $('.h-cartes'),
    };
    for (const k of DEFS) el.defs[k] = R.querySelector(`[data-def="${k}"]`);
    for (const k of AMS) el.ams[k] = R.querySelector(`[data-am="${k}"]`);
    const sur = (e, f) => e.addEventListener('click', (ev) => { ev.preventDefault(); f(ev); });
    for (const k of DEFS) sur(el.defs[k], () => { if (A.construire) A.construire(k); info(k, 'def'); });
    for (const k of AMS) sur(el.ams[k], () => { if (A.ameliorer) A.ameliorer(k); info(k, 'am'); });
    el.slots.forEach((b, i) => sur(b, () => A.arme && A.arme(i)));
    sur($('.h-pause'), () => A.pause && A.pause());
    sur($('.h-lancer'), () => A.passer && A.passer());
    sur(el.gren, () => A.grenade && A.grenade());
    // les émotes : le bouton ouvre la rangée de celles qu'on a ; une touche l'envoie (et la referme)
    sur(el.emote, () => {
      if (!el.emotes.hidden) { el.emotes.hidden = true; return; }
      const l = (A.emotesDispo && A.emotesDispo()) || Object.keys(ZDONNEES.EMOTES);
      el.emotes.innerHTML = l.map((k) => `<button type="button" data-emote="${k}" aria-label="${ZDONNEES.EMOTES[k].nom}">${ZDONNEES.EMOTES[k].signe}</button>`).join('');
      el.emotes.querySelectorAll('[data-emote]').forEach((b) => sur(b, () => { el.emotes.hidden = true; if (A.emote) A.emote(b.dataset.emote); }));
      el.emotes.hidden = false;
    });
    el.cartes.addEventListener('click', (ev) => { const b = ev.target.closest('.h-carte-atout'); if (b && A.atout) { ev.preventDefault(); A.atout(b.dataset.atout); } });
    // les chiffres de dégâts : une réserve d'étiquettes réutilisées
    for (let k = 0; k < NB_CHIFFRES; k++) { const d = document.createElement('span'); d.className = 'num'; d.hidden = true; el.degats.appendChild(d); chiffres.push({ d, t: 0, x: 0, y: 0, z: 0, dx: 0 }); }
    sur($('.h-poignee'), () => replier(!ouvert));
    try { ouvert = localStorage.getItem('zombies.atelier') !== 'ferme'; } catch (e) { /* rien */ }
    replier(!ouvert ? false : true, true);
    vu = {};
  }
  // l'atelier replié : sa poignée pulse quand quelque chose devient abordable ou se débloque (jusqu'à ce qu'on l'ouvre)
  function signaler() { if (!ouvert) $('.h-poignee').classList.add('signal'); }
  function replier(o, silence) { ouvert = o; if (o) $('.h-poignee').classList.remove('signal'); el.atelier.classList.toggle('ouvert', o); $('.h-poignee').setAttribute('aria-label', o ? 'Replier l’atelier' : 'Ouvrir l’atelier'); if (!silence) try { localStorage.setItem('zombies.atelier', o ? 'ouvert' : 'ferme'); } catch (e) { /* rien */ } }
  let infoT = 0;
  function info(k, quoi) {
    const d = quoi === 'def' ? D.DEFENSES[k] : D.AMELIORATIONS[k];
    el.info.innerHTML = `<b>${d.nom}</b> ${d.desc}`; el.info.hidden = false; infoT = 2.2;
  }
  // un éclair blanc (le coup de grâce sur un boss)
  function flash() { const f = R.querySelector('.h-flash'); if (!f) return; f.classList.remove('vu'); void f.offsetWidth; f.classList.add('vu'); }
  function toast(t) { el.toast.textContent = t; el.toast.hidden = false; el.toast.classList.remove('vu'); void el.toast.offsetWidth; el.toast.classList.add('vu'); toastT = 1.8; }
  function annonce(t, s, duree) { el.annB.textContent = t; el.annS.textContent = s || ''; el.annonce.hidden = false; el.annonce.classList.remove('vu'); void el.annonce.offsetWidth; el.annonce.classList.add('vu'); annonceT = duree || 2.2; }

  // la mini-carte : le fond (obstacles) dessiné une fois par arène ; par-dessus, toutes les 3 images, les zombies, les défenses, les caisses, le survivant
  function fondCarte(jeu) {
    const c = document.createElement('canvas'); c.width = c.height = 132; const g = c.getContext('2d'), k = 132 / jeu.A.taille, h = jeu.A.taille / 2;
    g.fillStyle = '#16202B'; g.fillRect(0, 0, 132, 132);
    g.fillStyle = '#5E6E80';
    for (const r of jeu.monde.rects) g.fillRect((r.x0 + h) * k, (r.z0 + h) * k, Math.max(2, (r.x1 - r.x0) * k), Math.max(2, (r.z1 - r.z0) * k));
    for (const o of jeu.monde.cercles) { g.beginPath(); g.arc((o.x + h) * k, (o.z + h) * k, Math.max(1.5, o.r * k), 0, Math.PI * 2); g.fill(); }
    carteFond = c; carteJeu = jeu.A;
  }
  function dessinerCarte(jeu, idMoi) {
    if (carteJeu !== jeu.A) fondCarte(jeu);
    const g = el.carte.getContext('2d'), k = 132 / jeu.A.taille, h = jeu.A.taille / 2;
    g.drawImage(carteFond, 0, 0);
    g.fillStyle = '#F2C230'; for (const o of jeu.objets) if (o.type === 'caisse') g.fillRect((o.x + h) * k - 3, (o.z + h) * k - 3, 6, 6);
    g.fillStyle = '#7FD3FF'; for (const d of jeu.defenses) g.fillRect((d.x + h) * k - 2, (d.z + h) * k - 2, 4, 4);
    g.fillStyle = '#FF5A4A'; for (const z of jeu.zombies) { const s = D.ZOMBIES[z.type].boss ? 6 : 3; g.fillRect((z.x + h) * k - s / 2, (z.z + h) * k - s / 2, s, s); }
    for (const j of jeu.joueurs) { if (!j.vivant) continue; g.fillStyle = j.id === idMoi ? '#FFFFFF' : '#9AD0FF'; g.fillRect((j.x + h) * k - 3, (j.z + h) * k - 3, 6, 6); }
  }

  function maj(jeu, idMoi, dt, evs) {
    const j = jeu.joueurs.find((x) => x.id === idMoi) || jeu.joueurs[0]; if (!j) return;
    // la vie
    const f = Math.max(0, j.vie / j.vieMax);
    const w = `${(f * 100).toFixed(1)}%`;
    if (vu.vie !== w) { vu.vie = w; el.vie.style.width = w; el.vie.style.background = f > 0.5 ? '' : f > 0.25 ? '#F2C230' : '#E5533D'; }
    ecrire('vieN', el.vieN, String(Math.ceil(j.vie)));
    ecrire('tues', el.tues, String(j.tues));
    ecrire('fer', el.fer, String(j.ferraille));
    ecrire('score', el.score, String(j.score));
    ecrire('v', el.v, `V${Math.max(1, jeu.vague)}`);
    ecrire('rest', el.rest, jeu.phase === 'vague' ? `${J.restants(jeu)} RESTANTS` : jeu.vague ? 'VAGUE FINIE' : 'PRÉPARE-TOI');
    // la série
    const m = jeu.serie.mult > 1 && jeu.t - jeu.serie.t <= D.SERIE.fenetre ? jeu.serie.mult : 1;
    if (vu.serie !== m) { vu.serie = m; el.serie.hidden = m <= 1; el.serie.textContent = `SÉRIE ×${m}`; el.serie.dataset.m = m; }
    // la pause entre deux vagues
    const entre = jeu.phase === 'pause' && !jeu.fini;
    if (vu.entre !== entre) { vu.entre = entre; el.entre.hidden = !entre; }
    if (entre) ecrire('entreT', el.entreT, `Vague ${jeu.vague + 1} dans ${Math.max(0, Math.ceil(jeu.chrono))}`);
    // l'atelier : prix, nombre posé / permis, grisé si trop cher ou verrouillé
    for (const k of DEFS) {
      const T = D.DEFENSES[k], b = el.defs[k], verrou = Math.max(1, jeu.vague) < T.depuis, mx = J.maxDefenses(jeu, k), n = J.compteDefenses(jeu, k);
      const etat = verrou ? 'verrou' : n >= mx ? 'max' : j.ferraille >= T.prix ? 'ok' : 'cher';
      const cle = `${etat}|${n}/${mx}`;
      if (vu['d' + k] !== cle) {
        const avant = vu['d' + k] ? vu['d' + k].split('|')[0] : null;
        if (avant === 'verrou' && etat !== 'verrou') { b.classList.add('neuf'); setTimeout(() => b.classList.remove('neuf'), 3200); toast(`Nouveau à l’atelier : ${T.nom}`); signaler(); } // (débloqué : il apparaît, et le dit)
        else if (avant && avant !== 'ok' && etat === 'ok') signaler();
        vu['d' + k] = cle; b.dataset.etat = etat;
        b.querySelector('.prix').innerHTML = verrou ? `V${T.depuis}` : `<span class="ico">${ICO.ecrou}</span>${T.prix}`;
        b.querySelector('.nb').textContent = verrou ? '' : `${n}/${mx}`;
        b.setAttribute('aria-label', `${T.nom} : ${verrou ? `à partir de la vague ${T.depuis}` : `${T.prix} ferraille, ${n} sur ${mx}`}`);
      }
    }
    for (const k of AMS) {
      const a = D.AMELIORATIONS[k], b = el.ams[k], n = j.niveaux[k] || 0, p = J.prixAmelioration(j, k), etat = p === Infinity ? 'max' : j.ferraille >= p ? 'ok' : 'cher';
      const cle = `${etat}|${n}|${p}`;
      if (vu['a' + k] !== cle) {
        if (vu['a' + k] && vu['a' + k].split('|')[0] !== 'ok' && etat === 'ok') signaler();
        vu['a' + k] = cle; b.dataset.etat = etat;
        b.querySelector('.prix').innerHTML = p === Infinity ? 'MAX' : `<span class="ico">${ICO.ecrou}</span>${p}`;
        b.querySelector('.niv').textContent = n ? `${n}/${a.crans}` : '';
        b.setAttribute('aria-label', `${a.nom} : ${a.desc}, cran ${n} sur ${a.crans}${p === Infinity ? '' : `, ${p} ferraille`}`);
      }
    }
    if (infoT > 0) { infoT -= dt; if (infoT <= 0) el.info.hidden = true; }
    // les armes
    for (let i = 0; i < 2; i++) {
      const s = j.armes[i], b = el.slots[i], fin = s && j.finitions ? j.finitions[s.id] : null, img = s && A.portraitArme ? A.portraitArme(s.id, fin) : null;
      const cle = s ? `${s.id}|${s.mun === Infinity ? '∞' : s.mun}|${j.main === i}|${img ? 1 : 0}` : 'vide';
      if (vu['s' + i] === cle) continue; vu['s' + i] = cle;
      b.classList.toggle('actif', !!s && j.main === i); b.disabled = !s;
      b.innerHTML = s ? `${img ? `<img class="h-slot-img" alt="" src="${img}">` : iconeArme(s.id)}<b>${s.mun === Infinity ? '∞' : s.mun}</b>` : '<small>vide</small>';
      b.setAttribute('aria-label', s ? `${D.ARMES[s.id].nom}${s.mun === Infinity ? '' : `, ${s.mun} munitions`}` : 'Emplacement vide');
    }
    const a = j.armes[j.main]; ecrire('armeNom', el.armeNom, (a ? D.ARMES[a.id].nom : 'Pistolet').toUpperCase());
    // l'objectif de l'échelon (l'Ascension)
    const O = jeu.objectif, mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const txtO = !O ? '' : O.type === 'vagues' ? `Vagues tenues ${O.fait || 0}/${O.n}` : O.type === 'tues' ? `Zombies ${Math.min(O.n, O.fait || 0)}/${O.n}` : O.type === 'chrono' ? `Tiens encore ${mmss(Math.max(0, O.s - (jeu.tempsVague || 0)))}` : O.type === 'contrat' ? (O.lance ? `Contrat : ${mmss(O.reste == null ? O.s : O.reste)}` : `Contrat : ${D.ZOMBIES[O.cible].nom} d’élite`) : `Générateur ${Math.round((O.vie == null ? 1 : O.vie) * 100)} % · vagues ${O.fait || 0}/${O.n}`;
    if (vu.obj !== txtO) { vu.obj = txtO; el.objectif.textContent = txtO; el.objectif.hidden = !txtO; el.objectif.classList.toggle('urgent', !!O && ((O.type === 'contrat' && O.reste != null && O.reste < 15) || (O.type === 'generateur' && O.vie < 0.3))); }
    // le boss (ou l'élite d'un contrat)
    const boss = jeu.zombies.find((z) => D.ZOMBIES[z.type].boss) || jeu.zombies.find((z) => z.elite && z.vie > 0);
    if (vu.boss !== !!boss) { vu.boss = !!boss; el.boss.hidden = !boss; }
    if (boss && vu.bossNom !== boss.type + (boss.elite ? 'e' : '')) { vu.bossNom = boss.type + (boss.elite ? 'e' : ''); el.bossN.textContent = (D.ZOMBIES[boss.type].nom + (boss.elite ? ' d’élite' : '')).toUpperCase(); }
    if (boss) el.bossB.style.width = `${Math.max(0, boss.vie / boss.vieMax) * 100}%`;
    // les événements : rougeur, annonces, messages
    if (evs) for (const e of evs) {
      if (e.t === 'blesse' && e.id === idMoi) rougeur = Math.min(1, rougeur + 0.35 + e.degats / 60);
      else if (e.t === 'vague') annonce(`VAGUE ${e.n}`, e.boss ? `${D.ZOMBIES[e.boss] ? D.ZOMBIES[e.boss].nom : 'Un boss'} arrive !` : `${e.total} zombies`, 2.4);
      else if (e.t === 'vagueFinie') annonce('VAGUE TERMINÉE', `+${e.prime} points · construis, améliore`, 2.4);
      else if (e.t === 'arme' && e.id === idMoi && D.ARMES[e.arme] && e.arme !== 'pistolet' && !e.trouvee) toast(`${D.ARMES[e.arme].nom} !`); // (trouvée : sa carte le dit déjà)
      else if (e.t === 'vide' && e.id === idMoi) toast('Plus de munitions : retour au pistolet');
      else if (e.t === 'serie' && e.mult >= 3) el.serie.classList.remove('pulse'), void el.serie.offsetWidth, el.serie.classList.add('pulse');
      else if (e.t === 'casse') toast(`${D.DEFENSES[e.type].nom} détruite`);
    }
    rougeur = Math.max(f < 0.3 ? 0.25 + Math.sin(performance.now() / 260) * 0.12 : 0, rougeur - dt * 1.8);
    el.rouge.style.opacity = rougeur.toFixed(2);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.hidden = true; }
    if (annonceT > 0) { annonceT -= dt; if (annonceT <= 0) el.annonce.hidden = true; }
    if (++carteT % 3 === 0) dessinerCarte(jeu, idMoi);
    // le niveau et l'expérience
    const xpf = Math.min(1, j.xp / D.XP.pour(j.niveau)), xw = `${(xpf * 100).toFixed(1)}%`;
    if (vu.xp !== xw) { vu.xp = xw; el.xp.style.width = xw; }
    ecrire('niv', el.niv, `N${j.niveau}`);
    // la grenade : le voile descend pendant le rechargement
    const gr = j.grenadeT > 0 ? j.grenadeT / Math.max(0.1, ZJEU.rechargeGrenade ? ZJEU.rechargeGrenade(j) : D.GRENADE.recharge) : 0, gk = gr > 0 ? Math.ceil(gr * 20) : 0;
    if (vu.gren !== gk) { vu.gren = gk; el.grenVoile.style.height = `${Math.min(100, gr * 100)}%`; el.gren.classList.toggle('prete', gk === 0); }
    // le choix d'un atout (la partie attend)
    const c = j.choix || (jeu.choix && jeu.choix.id === idMoi ? jeu.choix : null), cc = c ? c.niveau + ':' + c.options.join() : '';
    if (vu.choix !== cc) {
      vu.choix = cc; el.choix.hidden = !c; R.classList.toggle('choix-ouvert', !!c); // (le haut du HUD s'efface derrière le choix)
      if (c) {
        el.choixT.textContent = `NIVEAU ${c.niveau} !`;
        el.cartes.innerHTML = c.options.map((k, i) => { const At = D.ATOUTS[k], r = j.atouts[k] || 0; return `<button type="button" class="h-carte-atout" data-atout="${k}"><span class="ico">${ICO[At.ico] || ''}</span><b>${At.nom}</b><small>${At.desc}</small><span class="rangs">${'●'.repeat(r)}<i>${'●'.repeat(Math.max(0, Math.min(At.max, r + 1) - r))}</i>${'○'.repeat(Math.max(0, At.max - r - 1))}</span><kbd>${i + 1}</kbd></button>`; }).join('');
      }
    }
    // la coop : le pseudo des copains au-dessus d'eux (« à terre » et la relève en cours) ; les annonces quand quelqu'un tombe ou se relève
    // les bulles d'émotes, au-dessus de chaque survivant (le sien compris)
    if (projeter) {
      let b = 0;
      for (const p of jeu.joueurs) {
        if (!p.emote || p.parti || b >= el.bulles.length) continue;
        const sp = el.bulles[b++], q = projeter(p.x, 3.7, p.z), E = ZDONNEES.EMOTES[p.emote.id], txt = E ? E.signe : '';
        if (sp.textContent !== txt) sp.textContent = txt;
        sp.hidden = false; sp.style.transform = `translate(${q[0].toFixed(0)}px, ${q[1].toFixed(0)}px) translate(-50%, -100%) scale(${Math.min(1, (2.4 - p.emote.t) * 6 + 0.3).toFixed(2)})`;
      }
      for (; b < el.bulles.length; b++) el.bulles[b].hidden = true;
    }
    if (projeter) {
      let k = 0;
      for (const p of jeu.joueurs) {
        if (p.id === idMoi || p.parti || k >= el.noms.length) continue;
        const sp = el.noms[k++], q = projeter(p.x, 3.1, p.z), txt = p.vivant ? p.pseudo : `${p.pseudo} · à terre${p.releve > 0 ? ' ' + Math.min(100, Math.round(p.releve / 2.5 * 100)) + ' %' : ''}`;
        if (sp.textContent !== txt) sp.textContent = txt;
        sp.classList.toggle('terre', !p.vivant); sp.hidden = false; sp.style.transform = `translate(${q[0].toFixed(0)}px, ${q[1].toFixed(0)}px) translate(-50%, -50%)`;
      }
      for (; k < el.noms.length; k++) el.noms[k].hidden = true;
    }
    if (evs && jeu.joueurs.length > 1) for (const e of evs) {
      const p = jeu.joueurs.find((x) => x.id === e.id);
      if (e.t === 'tombe' && p) { if (e.id === idMoi) { if (jeu.joueurs.some((x) => x.vivant)) annonce('À TERRE', 'Un copain doit rester près de toi pour te relever', 3); } else toast(`${p.pseudo} est à terre : va le relever !`); }
      else if (e.t === 'releve' && p) toast(e.id === idMoi ? 'Relevé ! Merci les copains' : `${p.pseudo} est relevé`);
    }
    // les chiffres de dégâts : un par zombie touché et par image (les plombs d'un même coup s'additionnent), les critiques en grand
    if (evs && projeter) {
      const parCible = new Map();
      for (const e of evs) {
        if (e.t === 'touche' && e.petit) { const q = cumul.get(e.cible) || { x: e.x, z: e.z, d: 0, t: 0.45, boss: e.boss }; q.d += e.degats; q.x = e.x; q.z = e.z; cumul.set(e.cible, q); } // (flammes, brûlure, acide : cumulés)
        else if (e.t === 'touche') { const q = parCible.get(e.cible) || { x: e.x, z: e.z, d: 0, crit: false, boss: e.boss }; q.d += e.degats; q.crit = q.crit || e.crit; parCible.set(e.cible, q); }
        else if (e.t === 'blesse' && e.id === idMoi) chiffre(j.x, 2.4, j.z, `−${e.degats}`, 'moi');
        else if (e.t === 'niveau' && e.id === idMoi) chiffre(j.x, 2.8, j.z, 'NIVEAU +1', 'niveau');
        else if (e.t === 'ramasse' && e.id === idMoi && e.quoi === 'ferraille' && e.x != null) voler(e.x, e.z);
        else if (e.t === 'ramasse' && e.id === idMoi && e.quoi === 'caisse' && e.arme) carteArme(e.arme, j.finitions ? j.finitions[e.arme] : null);
      }
      for (const [, q] of parCible) chiffre(q.x, q.boss ? 4.6 : 2.5, q.z, String(q.d), q.crit ? 'crit' : '');
      for (const [k, q] of cumul) { q.t -= dt; if (q.t <= 0) { cumul.delete(k); chiffre(q.x, q.boss ? 4.6 : 2.5, q.z, String(Math.round(q.d)), 'petit'); } }
    }
    for (const c2 of chiffres) {
      if (c2.t <= 0) continue; c2.t -= dt;
      if (c2.t <= 0) { c2.d.hidden = true; continue; }
      const k = 1 - c2.t / c2.duree, p2 = projeter(c2.x, c2.y + k * 1.2, c2.z);
      c2.d.style.transform = `translate(${(p2[0] + c2.dx).toFixed(1)}px, ${p2[1].toFixed(1)}px) translate(-50%, -50%) scale(${(k < 0.15 ? 0.6 + k * 4 : 1.2 - k * 0.3).toFixed(2)})`;
      c2.d.style.opacity = k > 0.6 ? ((1 - k) / 0.4).toFixed(2) : '1';
    }
  }
  // la ferraille ramassée vole jusqu'à son compteur, qui sursaute (au plus 10 en vol à la fois)
  const vols = []; let iVol = 0;
  function voler(x, z) {
    if (!projeter || !el.fer || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    if (!vols.length) for (let k = 0; k < 10; k++) { const d = document.createElement('span'); d.className = 'h-vol'; d.innerHTML = ICO.ecrou; d.hidden = true; R.appendChild(d); vols.push(d); }
    const d = vols[iVol]; iVol = (iVol + 1) % vols.length;
    const de = projeter(x, 0.6, z), cible = el.fer.getBoundingClientRect(), ax = cible.left + cible.width / 2, ay = cible.top + cible.height / 2;
    d.hidden = false; if (d.anim) d.anim.cancel();
    d.anim = d.animate([{ transform: `translate(${de[0]}px, ${de[1]}px) scale(.6)`, opacity: 1 }, { transform: `translate(${(de[0] + ax) / 2}px, ${Math.min(de[1], ay) - 40}px) scale(1.15)`, opacity: 1, offset: 0.45 }, { transform: `translate(${ax}px, ${ay}px) scale(.7)`, opacity: .9 }], { duration: 560, easing: 'cubic-bezier(.4,0,.7,1)' });
    d.anim.onfinish = () => { d.hidden = true; const f = el.fer.parentElement; f.classList.remove('pulse'); void f.offsetWidth; f.classList.add('pulse'); };
  }
  // une caisse ouverte : la carte de l'arme trouvée (son portrait, son nom, sa rareté), un instant au milieu de l'écran
  const RARS = { commune: 'Commune', rare: 'Rare', epique: 'Épique', legendaire: 'Légendaire' };
  function carteArme(id, fin) {
    const Ar = D.ARMES[id], c = R.querySelector('.h-trouve'); if (!Ar || !c) return;
    if (annonceT > 0 && !el.annonce.hidden) { setTimeout(() => carteArme(id, fin), annonceT * 1000 + 80); return; } // (une annonce au milieu : la carte attend qu'elle finisse)
    const rar = D.RARETE(Ar), img = A.portraitArme ? A.portraitArme(id, fin) : null;
    c.className = `h-trouve rar-${rar}`; c.innerHTML = `${img ? `<img alt="" src="${img}">` : iconeArme(id)}<span><small>ARME TROUVÉE · ${RARS[rar].toUpperCase()}</small><b>${Ar.nom}</b></span>`;
    c.hidden = false; void c.offsetWidth; c.classList.add('vu'); clearTimeout(c.minuterie); c.minuterie = setTimeout(() => { c.hidden = true; }, 1900);
  }
  function chiffre(x, y, z, texte, classe) {
    const c = chiffres[iChiffre]; iChiffre = (iChiffre + 1) % NB_CHIFFRES;
    c.x = x; c.y = y; c.z = z; c.dx = (Math.random() - 0.5) * 26; c.duree = classe === 'crit' ? 0.9 : classe === 'niveau' ? 1.4 : 0.7; c.t = c.duree;
    c.d.textContent = texte; c.d.className = 'num' + (classe ? ' ' + classe : ''); c.d.hidden = false;
    nbChiffres++; derniers.push(texte); if (derniers.length > 8) derniers.shift();
  }
  function reinit() { const tr = R && R.querySelector('.h-trouve'); if (tr) tr.hidden = true; for (const c of chiffres) { c.t = 0; c.d.hidden = true; } vu = {}; rougeur = 0; toastT = 0; annonceT = 0; if (el.toast) { el.toast.hidden = true; el.annonce.hidden = true; el.info.hidden = true; } carteJeu = null; }
  return { init, maj, annonce, toast, flash, reinit, chiffre, get chiffres() { return { n: nbChiffres, derniers: derniers.slice() }; }, ICO, ARME_ICO, iconeArme, get atelierOuvert() { return ouvert; } };
})();
