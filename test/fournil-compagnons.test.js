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

console.log(fails ? `${fails} échec(s) sur ${n}` : `Tout passe (${n} vérifications).`);
process.exit(fails ? 1 : 0);
