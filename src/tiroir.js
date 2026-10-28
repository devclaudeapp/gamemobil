/* LE FOURNIL — le tiroir : un panneau qu'on tire au doigt et qui s'arrête à des crans (la boutique, src/ui.js : ouvert, mi, fermé ; les
   écrans d'événement, src/evenement.js : haut, mi, fermé). Une seule mécanique pour les deux :
   · posé, il est à un cran exact : Y[cran], en px depuis le haut de son cadre ; l'appelant le pose vraiment (o.poser : la variable CSS
     qui le place et donne sa hauteur à la liste, ses data-…) ;
   · tiré, il suit le doigt par une translation (élastique au-delà des crans du bout : un quart du dépassement) ;
   · lâché, il va au cran le plus proche du geste projeté 160 ms plus loin ; une pichenette (plus de 0,8 px/ms) avance toujours d'un cran ;
   · une simple touche sur la poignée (ou Entrée) : fermé → mi → ouvert → fermé.
   Le glisser vient de la poignée (T.poignee : au doigt et à la souris, capturé) ou d'ailleurs (T.prendre / T.suivre / T.lacher : la barre
   de l'écran d'événement, sa liste) avec un seuil : en dessous, le tiroir ne bouge pas (un toucher sur un bouton reste un toucher). */
const TIROIR = (() => {
  // o : { ordre (les crans, de haut en bas), Y (leur place), depart, reduit() (mouvement réduit), poser(p, y, anime), bouge(v) (pendant la
  //       course), touche() (une simple touche sur la poignée, avant de basculer), permis(e) (un appui sur la poignée est-il pris ?) }
  function creer(o) {
    const ORDRE = o.ordre, Y = o.Y; let pos = o.depart, y = Y[pos], drag = null, el = null;
    const plusProche = (v) => ORDRE.reduce((a, b) => (Math.abs(Y[b] - v) < Math.abs(Y[a] - v) ? b : a));
    const suivant = (sens) => ORDRE[Math.max(0, Math.min(ORDRE.length - 1, ORDRE.indexOf(pos) + sens))];
    const bascule = () => (pos === ORDRE[0] ? ORDRE[ORDRE.length - 1] : suivant(-1));
    function poser(p, anime) {
      pos = p; y = Y[p]; if (!el) return;
      el.classList.toggle('glisse', !anime); el.style.transform = '';
      o.poser(p, y, !!anime);
      if (!anime) requestAnimationFrame(() => el.classList.remove('glisse'));
    }
    const aller = (p, anime) => { if (Y[p] != null && el) poser(p, anime == null ? !o.reduit() : anime); };
    // un glisser : y0 (où le doigt s'est posé), id (le doigt), seuil (0 : il suit dès le premier pixel, comme la poignée)
    function prendre(y0, id, seuil) {
      if (drag || !el) return false;
      drag = { id, y0, depart: y, pts: [[performance.now(), y0]], bouge: false, seuil: seuil || 0, suit: !seuil };
      if (drag.suit) el.classList.add('glisse');
      return true;
    }
    function suivre(cy) {
      if (!drag) return false;
      const dy = cy - drag.y0; if (Math.abs(dy) > Math.max(6, drag.seuil)) drag.bouge = true;
      if (!drag.suit) { if (!drag.bouge) return false; drag.suit = true; el.classList.add('glisse'); }
      let v = drag.depart + dy; // élastique au-delà des bornes
      const haut = Y[ORDRE[0]], bas = Y[ORDRE[ORDRE.length - 1]];
      if (v < haut) v = haut - (haut - v) * 0.25;
      if (v > bas) v = bas + (v - bas) * 0.25;
      y = v; el.style.transform = `translateY(${v}px)`; if (o.bouge) o.bouge(v);
      drag.pts.push([performance.now(), cy]); if (drag.pts.length > 6) drag.pts.shift();
      return true;
    }
    // lâché : true s'il a glissé (le toucher qui l'a tiré n'est pas un clic) ; tap : une simple touche bascule (la poignée)
    function lacher(tap) {
      const d = drag; drag = null; if (!d) return false;
      if (!d.bouge) { if (tap) { if (o.touche) o.touche(); aller(bascule()); } else if (d.suit) aller(pos); else el.classList.remove('glisse'); return false; }
      const [t0, p0] = d.pts[0], [t1, p1] = d.pts[d.pts.length - 1], vit = t1 > t0 ? (p1 - p0) / (t1 - t0) : 0; // px/ms
      let cible = plusProche(y + vit * 160); // on projette le geste 160 ms plus loin
      if (Math.abs(vit) > 0.8 && cible === pos) cible = suivant(Math.sign(vit)); // une pichenette avance toujours d'un cran
      aller(cible);
      return true;
    }
    // la poignée : au doigt et à la souris, le pointeur capturé ; une simple touche (ou Entrée, Espace) bascule
    function poignee(p) {
      p.addEventListener('pointerdown', (e) => {
        if (drag || (o.permis && !o.permis(e))) return; e.preventDefault(); try { p.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
        prendre(e.clientY, e.pointerId, 0);
      });
      p.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) suivre(e.clientY); });
      const fin = (e) => { if (drag && e.pointerId === drag.id) lacher(true); };
      p.addEventListener('pointerup', fin); p.addEventListener('pointercancel', fin);
      p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (o.touche) o.touche(); aller(bascule()); } });
    }
    return { brancher(e) { el = e; }, poignee, aller, poser, prendre, suivre, lacher, annuler() { drag = null; }, // annuler : le doigt oublié (l'écran se ferme)
      crans(nv) { Object.assign(Y, nv); if (el) poser(pos, false); }, // de nouvelles places (une autre taille d'écran) : il y reste, au même cran
      get pos() { return pos; }, get y() { return y; }, get Y() { return Y; }, get glisse() { return !!drag; }, get doigt() { return drag && drag.id; } };
  }
  return { creer };
})();
