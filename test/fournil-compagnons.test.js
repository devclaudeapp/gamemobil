#!/usr/bin/env node
// Les compagnons du Fournil (src/game.js) : le catalogue (simples, gagné, payants de plus en plus loufoques), les prix en minutes des gains de
// la boutique (avec un plancher pour les débutants), acheter, choisir, une vieille sauvegarde avec un chat roux ou noir, la nouvelle boutique
// qui garde tout, et le pelage noir d'office pendant la Maison hantée, seulement pour un chat.
// Lancer : TZ=Europe/Paris node test/fournil-compagnons.test.js
'use strict';
const G = require('../src/game.js');
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? '  ok   ' : '  FAIL ') + m); if (!ok) fails++; };
const T0 = Date.UTC(2026, 9, 7, 8, 0); // un mercredi (pas de marché)
const C = G.COMPAGNONS, ids = C.map((c) => c.id);

console.log('── le catalogue ──');
check(C.every((c) => typeof c.id === 'string' && c.nom && c.phrase && (c.prix === null || c.prix > 0) && (c.condition === null || typeof c.condition === 'function') && c.nomDefaut && c.espece) && new Set(ids).size === C.length, `${C.length} compagnons : { id, nom, phrase, prix: null | minutes, condition } (+ espèce, nom par défaut, cri)`);
check(['chat-roux', 'chien', 'lapin'].every((id) => G.compagnon(id).prix === null && G.compagnon(id).condition === null), 'les simples, gratuits : chat roux, chien, lapin');
check(G.compagnon('chat-noir').prix === null && typeof G.compagnon('chat-noir').condition === 'function' && /Maison hantée/.test(G.compagnon('chat-noir').gagne), 'le chat noir : gagné à la Maison hantée');
const payants = C.filter((c) => c.prix != null);
check(payants.map((c) => c.id).join() === 'poule,canard,herisson,pingouin,raton,escargot,teckel,croissant,dragon', `les payants, de plus en plus loufoques : ${payants.map((c) => c.nom).join(', ')}`);
check(payants.every((c, k) => k === 0 || c.prix > payants[k - 1].prix) && payants[0].prix === 20 && payants[payants.length - 1].prix === 480, `des prix qui montent : ${payants.map((c) => c.prix + ' min').join(', ')} (la poule 20 min, le mini-dragon 8 h)`);
check(G.estChat('chat-roux') && G.estChat('chat-noir') && !G.estChat('chien') && !G.estChat('dragon') && !G.estChat('inconnu'), 'deux chats ; les autres non');

console.log('── les prix : max(plancher, rythme × 60 × minutes) ──');
let st = G.newState(T0);
const r0 = G.rythme(st);
check(payants.every((c) => G.prixCompagnon(st, c.id) === G.arrondi(G.COMPAGNON_PLANCHER * c.prix)) && G.prixCompagnon(st, 'poule') === 20000 && G.prixCompagnon(st, 'dragon') === 480000, `au tout début (rythme ${G.fmtEur(r0)}/s) : le plancher, ${G.fmtEur(G.COMPAGNON_PLANCHER)} par minute (la poule ${G.fmtEur(G.prixCompagnon(st, 'poule'))}, le mini-dragon ${G.fmtEur(G.prixCompagnon(st, 'dragon'))})`);
check(['chat-roux', 'chien', 'lapin', 'chat-noir', 'inconnu'].every((id) => G.prixCompagnon(st, id) === null), 'les gratuits et le chat noir ne s’achètent pas (prix null)');
const riche = G.newState(T0); for (let i = 0; i < 4; i++) { riche.stations[i].niv = 400; riche.stations[i].staff = true; }
const r1 = G.rythme(riche);
check(r1 * 60 * 20 > 20000 && payants.every((c) => G.prixCompagnon(riche, c.id) === G.arrondi(r1 * 60 * c.prix)), `une boutique lancée (rythme ${G.fmtEur(r1)}/s) : le temps de gains compte (la poule ${G.fmtEur(G.prixCompagnon(riche, 'poule'))} = 20 min, le mini-dragon ${G.fmtEur(G.prixCompagnon(riche, 'dragon'))} = 8 h)`);
check(Math.abs(G.prixCompagnon(riche, 'dragon') / G.prixCompagnon(riche, 'poule') - 24) < 0.5, 'le mini-dragon coûte 24 poules');
{ // les prix aux étapes du jeu (un joueur régulier simulé, test/longevite.js)
  const L = require('./longevite.js'), log = console.log; console.log = () => {}; const etapes = [1, 7, 30].map((j) => ({ j, st: L.simuler('regulier', j).st })); console.log = log;
  for (const e of etapes) console.log(`        jour ${String(e.j).padStart(2)} : rythme ${G.fmtEur(G.rythme(e.st))}/s · ${payants.map((c) => `${c.nom.split(' ')[0].toLowerCase()} ${G.fmtEur(G.prixCompagnon(e.st, c.id))}`).join(' · ')}`);
  check(etapes.every((e, k) => k === 0 || G.prixCompagnon(e.st, 'poule') > G.prixCompagnon(etapes[k - 1].st, 'poule')) && etapes.every((e) => G.prixCompagnon(e.st, 'poule') > 20000), 'aux étapes du jeu (jours 1, 7, 30), les prix grandissent avec la boutique, au-dessus du plancher');
}

console.log('── acheter, choisir ──');
st = G.newState(T0);
check(Array.isArray(st.compagnons) && st.compagnons.length === 0 && st.compagnon === null && G.compagnonActif(st) === 'chat-roux', 'newState : aucun acheté, aucun choisi (le chat roux par défaut)');
check(G.aCompagnon(st, 'chat-roux') && G.aCompagnon(st, 'chien') && G.aCompagnon(st, 'lapin') && !G.aCompagnon(st, 'chat-noir') && !G.aCompagnon(st, 'poule') && !G.aCompagnon(st, 'licorne'), 'à soi d’office : les trois gratuits ; pas le chat noir ni les payants');
let r = G.acheterCompagnon(st, 'poule');
check(!r.ok && r.raison === 'argent' && r.prix === 20000 && st.coins === 0 && !st.compagnons.length, 'pas assez d’argent : refusé, rien ne bouge');
check(G.acheterCompagnon(st, 'chien').raison === 'possede' && G.acheterCompagnon(st, 'chat-noir').raison === 'gratuit' && G.acheterCompagnon(st, 'licorne').raison === 'inconnu', 'un gratuit (déjà à soi), le chat noir (il se gagne), un id inconnu : refusés');
check(!G.choisirCompagnon(st, 'poule').ok && !G.choisirCompagnon(st, 'chat-noir').ok && !G.choisirCompagnon(st, 'licorne').ok && st.chat === null, 'choisir un compagnon qu’on n’a pas : refusé (le chat noir aussi, tant qu’il n’est pas gagné)');
r = G.choisirCompagnon(st, 'lapin');
check(r.ok && r.adopte && st.chat && st.chat.nom === 'Pompon' && st.chat.caresses === 0 && st.compagnon === 'lapin' && !G.chatPossible(st), 'choisi avant l’arrivée du chat : le lapin est adopté tout de suite (« Pompon »), plus de chat à la porte');
st.coins = 25000; const xp0 = st.xp;
r = G.acheterCompagnon(st, 'poule');
check(r.ok && r.prix === 20000 && st.coins === 5000 && st.compagnons.join() === 'poule' && st.compagnon === 'poule' && st.chat.nom === 'Pompon' && st.xp > xp0, 'assez d’argent : la poule achetée (20 000 €), choisie tout de suite ; le compagnon garde son nom');
check(G.acheterCompagnon(st, 'poule').raison === 'possede' && st.coins === 5000 && st.compagnons.length === 1, 'déjà achetée : pas de second paiement');
check(G.choisirCompagnon(st, 'chien').ok && G.compagnonActif(st) === 'chien' && G.choisirCompagnon(st, 'poule').ok && G.compagnonActif(st) === 'poule', 'on passe de l’un à l’autre : un gratuit, puis la poule achetée');
st.now = T0 + 120e3; st.mystereTimer = 100; r = G.caresser(st);
check(r.ok && r.chance && st.chat.caresses === 1 && Math.abs(st.mystereTimer - 80) < 1e-9, 'la caresse porte chance, quel que soit l’animal');
G.renommerChat(st, ''); check(st.chat.nom === 'Cocotte', 'un nom vide : le nom par défaut de l’animal (« Cocotte »)');
G.renommerChat(st, 'Pompon');
check(G.donnerChatNoir(st).nouveau && G.aCompagnon(st, 'chat-noir') && G.choisirCompagnon(st, 'chat-noir').ok && st.chatPelage === 'noir' && G.pelageChat(st, false) === 'noir', 'le chat noir gagné : au catalogue, choisi (l’ancien champ du pelage suit)');
check(G.choisirPelage(st, 'roux') && G.compagnonActif(st) === 'chat-roux' && G.choisirPelage(st, 'noir') && G.compagnonActif(st) === 'chat-noir', 'l’ancien choix du pelage mène aux deux chats');
{ const c = G.newState(T0); c.stations[4].niv = 1; const a = G.adopterChat(c, ''); check(a.ok && c.chat.nom === 'Brioche' && c.compagnon === 'chat-roux', 'le premier compagnon arrive comme avant : le chat roux, avec les éclairs (« Brioche »)'); }
{ const c = G.newState(T0); c.compagnons = ['poule', 'poule', 'licorne', 'chien', 42]; c.compagnon = 'dragon'; G.compagnons(c); check(c.compagnons.join() === 'poule' && c.compagnon === null, 'remis d’aplomb : doublons, ids inconnus et gratuits retirés de la liste ; un compagnon choisi qu’on n’a pas est oublié'); }

console.log('── une vieille sauvegarde ──');
const vieille = (o) => { const s = JSON.parse(JSON.stringify(G.newState(T0))); delete s.compagnons; delete s.compagnon; Object.assign(s, o); const fresh = G.newState(T0); for (const k in fresh) if (!(k in s)) s[k] = fresh[k]; G.compagnons(s); return s; }; // comme ui.js (lire) : les champs neufs, puis remis d'aplomb
let v = vieille({ chat: { nom: 'Mistigri', caresses: 140, dernier: 0, adopte: T0 }, chatNoir: false, chatPelage: 'roux', trophees: { ronron: T0 } });
check(v.compagnon === 'chat-roux' && v.chat.nom === 'Mistigri' && v.chat.caresses === 140 && v.trophees.ronron && Array.isArray(v.compagnons) && !v.compagnons.length, 'un chat roux adopté : le compagnon « chat-roux », son nom, ses caresses et le trophée Ronron gardés');
v = vieille({ chat: { nom: 'Réglisse', caresses: 3, dernier: 0, adopte: T0 }, chatNoir: true, chatPelage: 'noir' });
check(v.compagnon === 'chat-noir' && G.pelageChat(v, false) === 'noir' && G.aCompagnon(v, 'chat-noir'), 'un pelage noir choisi : le compagnon « chat-noir »');
v = vieille({ chat: { nom: 'Réglisse', caresses: 3, dernier: 0, adopte: T0 }, chatNoir: true, chatPelage: 'roux' });
check(v.compagnon === 'chat-roux' && G.aCompagnon(v, 'chat-noir') && G.choisirCompagnon(v, 'chat-noir').ok, 'le chat noir gagné mais pas choisi : le roux, et le noir reste au catalogue');
v = vieille({ chat: null, chatNoir: false });
check(v.compagnon === null && G.compagnonActif(v) === 'chat-roux' && G.chatPossible(Object.assign(v, { stations: v.stations.map((s, i) => (i === 4 ? Object.assign({}, s, { niv: 1 }) : s)) })), 'pas encore de chat : rien de choisi, le chat viendra avec les éclairs');
{ const s = G.newState(T0); s.chat = { nom: 'Réglisse' }; s.chatNoir = true; s.chatPelage = 'noir'; check(G.modeleCompagnon(s, false) === 'chat-noir', 'une boutique rebâtie sans st.compagnon (la photo du classement) : son chat noir'); }

console.log('── le chien du quartier : gagné au palier 11 du Quartier ──');
{
  const Q = require('../src/quartier.js'), c = G.compagnon('chien-quartier');
  check(c && c.prix === null && typeof c.condition === 'function' && c.espece === 'chien' && /Quartier/.test(c.gagne) && /palier 11/.test(c.verrou) && c.cri === 'woufgrave' && c.phrase.length > 30, `au catalogue : « ${c && c.nom} », ${c && c.gagne}, « ${c && c.phrase} » (cri ${c && c.cri})`);
  check(!G.estChat('chien-quartier') && G.prixCompagnon(G.newState(T0), 'chien-quartier') === null && G.acheterCompagnon(G.newState(T0), 'chien-quartier').raison === 'gratuit', 'pas un chat, et il ne s’achète pas : il se gagne');
  const s = G.newState(T0);
  check(!G.aCompagnon(s, 'chien-quartier') && !G.choisirCompagnon(s, 'chien-quartier').ok && s.chat === null, 'une boutique neuve : verrouillé, on ne peut pas le choisir');
  const q = Q.etat(s, T0); Q.gagner(q, Q.PALIERS[9].total); for (const p of Q.paliersDus(q)) Q.marquerPalier(q, p.n);
  check(q.paliers.length === 10 && !G.aCompagnon(s, 'chien-quartier'), 'au palier 10 du Quartier : toujours verrouillé');
  Q.gagner(q, Q.PALIERS[10].total - q.total); check(!G.aCompagnon(s, 'chien-quartier'), 'le seuil du 11e atteint mais le palier pas encore remis : pas encore');
  Q.marquerPalier(q, 11);
  check(q.decos.includes('chien') && G.aCompagnon(s, 'chien-quartier'), 'le palier 11 remis (la déco « chien ») : le chien du quartier est à soi');
  const r = G.choisirCompagnon(s, 'chien-quartier');
  check(r.ok && r.adopte && s.chat.nom === 'Caïd' && G.compagnonActif(s) === 'chien-quartier' && G.modeleCompagnon(s, true) === 'chien-quartier', 'choisi : adopté sous le nom « Caïd », lui-même pendant la Maison hantée');
  const sv = JSON.parse(JSON.stringify(s)); G.compagnons(sv);
  check(G.compagnonActif(sv) === 'chien-quartier', 'la sauvegarde (JSON) le garde');
  sv.lifetimeRun = 1e15; check(G.nouvelleBoutique(sv, T0).ok && G.compagnonActif(sv) === 'chien-quartier', 'une nouvelle boutique : il reste (st.quartier aussi)');
  // une sauvegarde d'avant cette version : le Quartier fini, la déco « chien » reçue, rien d'autre de neuf
  const vieille = { quartier: { postes: [{ niv: 1 }], total: 6e14, paliers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], decos: ['graffiti', 'neon', 'scooter', 'chien'], ameliorations: {} } };
  const v2 = Object.assign(JSON.parse(JSON.stringify(G.newState(T0))), JSON.parse(JSON.stringify(vieille))); delete v2.compagnons; delete v2.compagnon; G.compagnons(v2);
  check(G.aCompagnon(v2, 'chien-quartier') && G.choisirCompagnon(v2, 'chien-quartier').ok, 'une vieille sauvegarde qui a fini le Quartier (la déco « chien ») : choisissable tout de suite');
  check(G.aCompagnon({ quartier: { paliers: [11], decos: [] } }, 'chien-quartier') && !G.aCompagnon({ quartier: { paliers: [12], decos: ['neon'] } }, 'chien-quartier') && !G.aCompagnon({ quartier: null }, 'chien-quartier') && !G.aCompagnon({ quartier: { decos: 'chien' } }, 'chien-quartier'), 'le palier 11 marqué suffit aussi ; une sauvegarde abîmée ne le donne pas');
  const sansQ = Object.assign(JSON.parse(JSON.stringify(v2)), { quartier: undefined }); G.compagnons(sansQ);
  check(G.compagnonActif(sansQ) === 'chat-roux' && sansQ.chat && sansQ.chat.nom === 'Caïd', 'sans st.quartier (une sauvegarde abîmée) : le choix est oublié, retour au chat roux (le nom reste)');
}

console.log('── la chauve-souris : gagnée au bestiaire de la Maison hantée ──');
{
  const HT = require('../src/hantee.js'), c = G.compagnon('chauve-souris');
  check(c && c.prix === null && typeof c.condition === 'function' && c.espece === 'chauve-souris' && /bestiaire/.test(c.gagne) && /neuf monstres/.test(c.verrou) && c.cri === 'couic' && c.nomDefaut === 'Myrtille' && c.phrase.length > 30, `au catalogue : « ${c && c.nom} », ${c && c.gagne}, « ${c && c.phrase} » (cri ${c && c.cri})`);
  check(!G.estChat('chauve-souris') && G.prixCompagnon(G.newState(T0), 'chauve-souris') === null && G.acheterCompagnon(G.newState(T0), 'chauve-souris').raison === 'gratuit', 'pas un chat, et elle ne s’achète pas : elle se gagne');
  const s = G.newState(T0), t = HT.DEBUT + 864e5, q = HT.etat(s, t); q.now = t; HT.gagner(q, 1e6);
  check(!G.aCompagnon(s, 'chauve-souris') && !G.choisirCompagnon(s, 'chauve-souris').ok, 'une boutique neuve : verrouillée');
  let id = 0; const servir = (k) => { q.manoir.file.push({ id: ++id, sorte: k, commande: [{ i: 0, n: 1, servi: false }], arrive: q.now }); return HT.servir(q, id, 0); };
  for (const k of HT.SORTES.slice(0, 8)) for (let n = 0; n < 10; n++) servir(k);
  for (let n = 0; n < 9; n++) servir('loup');
  check(!G.aCompagnon(s, 'chauve-souris'), 'huit sortes et neuf loups-garous : toujours verrouillée');
  servir('loup');
  check(q.chauvesouris && G.aCompagnon(s, 'chauve-souris'), 'le dixième loup-garou (les neuf sortes complètes) : la chauve-souris est à soi');
  const r = G.choisirCompagnon(s, 'chauve-souris');
  check(r.ok && r.adopte && s.chat.nom === 'Myrtille' && G.modeleCompagnon(s, true) === 'chauve-souris', 'choisie : adoptée sous le nom « Myrtille », elle-même pendant la Maison hantée');
  const sv = JSON.parse(JSON.stringify(s)); G.compagnons(sv); sv.lifetimeRun = 1e15;
  check(G.compagnonActif(sv) === 'chauve-souris' && G.nouvelleBoutique(sv, T0).ok && G.compagnonActif(sv) === 'chauve-souris', 'la sauvegarde (JSON) la garde, une nouvelle boutique aussi (st.hantee reste)');
  check(!G.aCompagnon({ hantee: { chauvesouris: 'oui' } }, 'chauve-souris') && !G.aCompagnon({ hantee: null }, 'chauve-souris') && !G.aCompagnon({}, 'chauve-souris') && G.aCompagnon({ hantee: { chauvesouris: true } }, 'chauve-souris'), 'une sauvegarde abîmée ou sans Manoir ne la donne pas');
}

console.log('── la nouvelle boutique ──');
st.lifetimeRun = 1e15; st.compagnons.push('dragon'); G.compagnons(st); G.choisirCompagnon(st, 'dragon'); const avant = JSON.stringify([st.compagnons, st.compagnon, st.chat]);
check(G.nouvelleBoutique(st, st.now).ok && JSON.stringify([st.compagnons, st.compagnon, st.chat]) === avant && st.coins === 0 && G.compagnonActif(st) === 'dragon', 'une nouvelle boutique : les compagnons achetés, l’animal choisi et son nom restent (pour toujours)');

console.log('── la Maison hantée : noir d’office, seulement pour un chat ──');
const h = G.newState(T0); G.choisirCompagnon(h, 'chat-roux');
check(G.modeleCompagnon(h, true) === 'chat-noir' && G.pelageChat(h, true) === 'noir' && G.modeleCompagnon(h, false) === 'chat-roux', 'le chat roux : noir pendant la Maison hantée, roux après');
G.choisirCompagnon(h, 'chien');
check(G.modeleCompagnon(h, true) === 'chien' && G.pelageChat(h, true) === 'roux' && G.modeleCompagnon(h, false) === 'chien', 'le chien : lui-même pendant la Maison hantée (pas de chat noir)');
h.coins = 1e9; G.acheterCompagnon(h, 'dragon');
check(G.modeleCompagnon(h, true) === 'dragon', 'le mini-dragon aussi reste lui-même');
const sv = JSON.parse(JSON.stringify(h)); G.compagnons(sv);
check(sv.compagnon === 'dragon' && sv.compagnons.join() === 'dragon' && G.compagnonActif(sv) === 'dragon', 'la sauvegarde (JSON) garde l’achat et le choix');

console.log('── les bonus : seulement le compagnon montré ──');
{
  check(C.every((c) => c.bonus && G.texteBonus(c.bonus).length === 1), `chaque compagnon a un bonus : ${C.map((c) => `${c.nom} (${G.texteBonus(c.bonus).join('')})`).join(', ')}`);
  check(C.every((c) => (!c.bonus.gains || c.bonus.gains.pct <= 5) && (c.bonus.vitesse || 0) <= 7 && (c.bonus.absence || 0) <= 1.5 && (c.bonus.pourboire || 0) <= 10), 'tous petits : gains ≤ 5 %, cuisson ≤ 7 %, absence ≤ 1,5 h, pourboires ≤ 10 %');
  const base = () => { const b = G.newState(T0); for (let i = 0; i < 4; i++) { b.stations[i].niv = 50; b.stations[i].staff = true; } return b; };
  const sans = base(); // pas encore de compagnon : aucun bonus
  check(JSON.stringify(G.bonusCompagnon(sans)) === '{}' && G.compagnonGains(sans) === 1, 'pas encore adopté : aucun bonus');
  const avec = (id) => { const b = base(); b.coins = 1e12; b.lifetimeRun = 0; if (G.compagnon(id).prix != null) G.acheterCompagnon(b, id); else if (id === 'chien-quartier') b.quartier = { paliers: [11], decos: ['chien'] }; else if (id === 'chat-noir') b.chatNoir = true; else if (id === 'chauve-souris') b.hantee = { chauvesouris: true }; G.choisirCompagnon(b, id); return b; };
  const r0 = G.rythme(sans), h0 = G.heuresAbsence(sans), p0 = G.pourboire(sans);
  const cq = avec('chien-quartier'), dr = avec('dragon'), ch = avec('chien'), ca = avec('canard');
  check(Math.abs(G.rythme(cq) / r0 - 1.05) < 1e-9, `le chien du quartier : tous les gains +5 % (${G.fmtEur(r0)}/s → ${G.fmtEur(G.rythme(cq))}/s)`);
  check(Math.abs(G.rythme(dr) / r0 - 1 / 0.93) < 1e-9, `le mini-dragon : cuisson 7 % plus rapide (rythme ×${(G.rythme(dr) / r0).toFixed(3)})`);
  check(G.heuresAbsence(ch) === h0 + 0.5 && G.rythme(ch) === r0, `le chien : +0,5 h d’absence (${h0} h → ${G.heuresAbsence(ch)} h), le rythme ne bouge pas`);
  const cs = avec('chauve-souris'); check(G.compagnonActif(cs) === 'chauve-souris' && G.heuresAbsence(cs) === h0 + 1 && G.rythme(cs) === r0, `la chauve-souris : +1 h d’absence (elle veille la nuit : ${G.heuresAbsence(cs)} h), le rythme ne bouge pas`);
  check(G.pourboire(ca) > p0 * 1.05 && G.pourboire(ca) <= p0 * 1.11, `le canard : pourboires +10 % (${G.fmtEur(p0)} → ${G.fmtEur(G.pourboire(ca))})`);
  G.choisirCompagnon(dr, 'chat-roux');
  check(G.rythme(dr) === r0 && G.pourboire(dr) > p0 && G.pourboire(dr) <= p0 * 1.06 && G.bonusCompagnon(dr).pourboire === 5, 'le mini-dragon gardé mais le chat roux montré : seul le bonus du chat (pourboires +5 %) compte');
  const lit = JSON.parse(JSON.stringify(cq)); G.compagnons(lit);
  check(G.rythme(lit) === G.rythme(cq), 'la sauvegarde (JSON) garde le bonus');
}

console.log(fails ? `${fails} échec(s) sur ${n}` : `Tout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
