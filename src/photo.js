/* LE FOURNIL — les photos choisies par le joueur, allégées par le téléphone avant de partir : partagé par le chat (src/chat.js) et les
   idées et bugs (src/retours.js, la capture d'un bug). Le plus grand côté ramené à 1280 px, du WebP (du JPEG sur un vieux Safari), la
   qualité qui descend jusqu'à tenir sous le plafond, puis l'image plus petite s'il le faut. Un GIF de la galerie part tel quel (animé)
   s'il est assez léger et si l'appelant l'accepte ; sinon il passe par la toile comme les autres (sa première image). Rien ne touche au DOM
   de la page : une toile hors écran, vidée à la fin. */
const PHOTOS = (() => {
  'use strict';
  const SORTIE_OK = /^data:image\/(webp|jpeg);base64,/, GIF_OK = /^data:image\/gif;base64,/;
  const lireUrl = (f) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result || '')); fr.onerror = () => rej(fr.error); fr.readAsDataURL(f); });
  async function decoder(f) {
    if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(f); } catch (e) { /* l'image classique */ } }
    const u = URL.createObjectURL(f);
    try { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; }); } finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
  }
  // o : { max (la data URL entière, en caractères ; 350 000 par défaut), cote (le plus grand côté, 1280), gif (un GIF accepté tel quel) }
  // → { ok: true, data, w, h, type, q } ou { ok: false, raison: 'gif' (un GIF trop lourd) | 'illisible' | 'lourd' }
  async function preparer(f, o) {
    o = o || {};
    const max = o.max || 350e3, cote = o.cote || 1280;
    if (!f) return { ok: false, raison: 'illisible' };
    if (f.type === 'image/gif' && o.gif) {
      if (f.size > max) return { ok: false, raison: 'gif' };
      const u = await lireUrl(f).catch(() => '');
      return u.length <= max && GIF_OK.test(u) ? { ok: true, data: u, type: 'image/gif' } : { ok: false, raison: u ? 'gif' : 'illisible' };
    }
    let src = null; try { src = await decoder(f); } catch (e) { src = null; }
    const w0 = src ? src.naturalWidth || src.width : 0, h0 = src ? src.naturalHeight || src.height : 0;
    if (!w0 || !h0) return { ok: false, raison: 'illisible' };
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d');
    let k = Math.min(1, cote / Math.max(w0, h0)), webp = null, fini = null;
    try {
      for (let essai = 0; essai < 6 && !fini; essai++, k *= 0.75) { // trop lourde même à la plus basse qualité : plus petite
        const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
        cv.width = w; cv.height = h; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(src, 0, 0, w, h); // le fond blanc : la transparence d'un PNG ne vire pas au noir en JPEG
        if (webp === null) webp = /^data:image\/webp/.test(cv.toDataURL('image/webp', 0.5)); // un vieux Safari ne sait pas faire de WebP : du JPEG
        const type = webp ? 'image/webp' : 'image/jpeg';
        for (const q of [0.82, 0.72, 0.62, 0.52, 0.42, 0.34]) { const u = cv.toDataURL(type, q); if (u.length <= max && SORTIE_OK.test(u)) { fini = { ok: true, data: u, w, h, type, q }; break; } }
      }
    } finally { try { if (src && src.close) src.close(); } catch (e) { /* rien */ } cv.width = cv.height = 0; }
    return fini || { ok: false, raison: 'lourd' };
  }
  return { preparer };
})();
