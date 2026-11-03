/* LE FOURNIL — les vignettes du carnet « Mes décos », de l'étagère des trophées et du carnet du croupier (global VIGNETTES).
   GÉNÉRÉ par outils/vignettes/cuire.cjs : ne pas éditer à la main (relancer l'outil : voir outils/vignettes/README.md).
   Chaque objet du carnet qui a un objet 3D a sa vignette : fournil/img/carnet/<famille>/<id>.webp (256 × 256, fond transparent), rendue
   dans le même studio que toutes les autres. La table : famille → id → l'empreinte du fichier (dans l'adresse : une vignette refaite change
   d'adresse, et le service worker ne garde que la dernière, fournil/sw.js). src(famille, id) : son adresse, ou '' (pas de vignette : l'icône
   dessinée). Sans les fichiers (l'artefact Claude : pas de window.FOURNIL_VERSION, que seule la page du jeu porte), aucune adresse : les
   icônes restent.
   img(famille, id, gagne, repli) : le HTML d'une vignette (grisée si pas gagnée) ; sans vignette, le repli tel quel. Le repli (le HTML
   d'avant : l'icône, l'aperçu dessiné, la carte de l'étagère), gardé à côté dans un <template>, reprend sa place si l'image ne se charge
   pas (le fichier manque ; hors ligne avant sa mise en cache, le service worker répond 204, sans erreur dans la console) : il remplace
   le bloc marqué data-vig qui la contient (la carte de l'étagère, la pastille d'un trophée du croupier, l'aperçu d'un skin : leur style
   d'avant revient tel quel, grisé ou non), sinon l'image seule ; sans repli, l'image s'efface. Un seul écouteur, en capture sur le document. */
const VIGNETTES = (() => {
  'use strict';
  const T = {
    'quartier': { 'graffiti': '2e9d8a70', 'neon': 'b9712f82', 'scooter': 'a4659cf4', 'chien': 'b1e71408', 'toque-or': 'cea4e22b' },
    'hantee': { 'citrouilles': 'b4d25e84', 'toiles': 'af0049d3', 'chaudron': '4067d6c9', 'bestiaire': 'abf28d8d', 'legende': '300873e0', 'toque-citrouille': 'a7bf5e2a' },
    'podium': { 'vitrine-coupes': '67f60a02', 'rosette': '9ecc9235' },
    'chaine': { 'souvenir-village': '7f739796', 'souvenir-paris': '926007d0', 'souvenir-mer': '8ef68485', 'souvenir-montagne': 'df19220e', 'souvenir-ville': 'ff6a95b8', 'souvenir-gare': '8594d05d', 'souvenir-ile': 'bd45bbd0', 'souvenir-chateau': '54ed3497', 'souvenir-cimes': '65c42c45', 'souvenir-capitale': '46946c78', 'chaine-plan': '4ca36770', 'chaine-cloche': '838d5410', 'chaine-globe': 'fa16278d', 'chaine-statue': '74c18e03', 'chaine-enseigne': '18be9f9c' },
    'trophees': { 'premiere': 'b1938048', 'cent': 'cc7c28b1', 'dixmille': '28d54c4e', 'million': '5dff0429', 'equipe': 'd89568b5', 'grande-equipe': 'ba19805a', 'livreur': '10c27988', 'traiteur': '35227a9a', 'presse': 'e7f8744c', 'etoile': 'ebb02d56', 'bras': '7b67a67f', 'eclair': 'b9cce6e3', 'bricoleur': '4ce33bfd', 'mystere': 'cc126607', 'genereux': '13ee6b0a', 'etoiles10': '51a14b3e', 'etoiles100': '3e3c4b8b', 'etoiles1000': '853901db', 'boutique2': 'f6e25c33', 'boutique5': '99e42eae', 'boutique10': '741c6a36', 'semaine': 'a4802b7d', 'defi': '8c4554b2', 'piece': '355a92e6', 'recette-boutique': 'b7847c97', 'carte': '5cc431c3', 'franchise': '945f9278', 'compagnon': 'f5d9a292', 'mof': '4a613cea', 'fidele': 'a6ab6036', 'salon': '4869f50d', 'decorateur': 'c9dbaec3', 'grade': '0f6b6e03', 'brigade': '4b7a7fb2', 'ronron': '01c56c37', 'saison1': '29890ace', 'saisons4': '0577e409', 'medaille': '5bfd8f9c', 'medaille-or': 'd4a5bd65', 'batisseur': '84e934c0', 'caresses': 'cd29f475', 'aube': '8d2947e7', 'nouvel-an': 'b1392d09', 'vendredi13': 'cf3dc76b', 'retour': 'ce0dc770', 'petrin': '218045db', 'bapteme': '4b6117a6', 'curieux': '5b60912b' },
    'compagnons': { 'chat-roux': '283c3b8a', 'chien': 'f8571904', 'lapin': '186dd477', 'chat-noir': '0c960187', 'chien-quartier': '36eb1d7b', 'chauve-souris': '1db19d12', 'poule': '52da9a29', 'canard': '266aa0d6', 'herisson': 'a98e39e2', 'pingouin': '22cba57e', 'raton': 'c49f471b', 'escargot': '880cac22', 'teckel': 'e1f35a48', 'croissant': 'fdd95fe4', 'dragon': '02e3373c', 'paon': '30a7d359', 'renard': 'f0c5b2f4', 'pigeon': '553a1d4f' },
    'tenues': { 'toque-blanche': '3b34b1bb', 'tablier-blanc': 'a89a084d', 'sabots': 'a80a9470', 'lunettes-rondes': '02cd41be', 'or-toque': '152d1977', 'or-tablier': 'a95f9489', 'or-chaussures': 'c9ebd706', 'or-foulard': 'ecbf206a', 'argent-toque': '427f7e1b', 'argent-tablier': '63b8a5de', 'argent-chaussures': '3d2627db', 'argent-foulard': '8622bc90', 'bronze-toque': '10ccfab9', 'bronze-tablier': '1bc77011', 'bronze-chaussures': '8f4d5e2c', 'bronze-foulard': 'b90362ea', 'quartier-casquette': '0b051e2d', 'quartier-sweat': '0d6534aa', 'quartier-baskets': '99a3c53e', 'quartier-chaine': 'a6a62381', 'quartier-or-casquette': 'd4650e22', 'quartier-or-sweat': 'c75e0b8d', 'quartier-or-baskets': '64d3ad95', 'quartier-or-chaine': '5105afc9', 'quartier-neon-casquette': 'ff42edb3', 'parcours-toque': 'bbdbe07e', 'parcours-tablier': '22acbfbf', 'parcours-chaussures': '91b11989', 'parcours-foulard': '36d43ffe', 'hantee-chapeau': '1421e1d8', 'hantee-cape': '2569951f', 'hantee-bottes': '03ea5fc1', 'hantee-lanterne': 'e803667d', 'hantee-or-chapeau': '1be67222', 'hantee-or-cape': '3c0bd9fb', 'hantee-or-bottes': '37591731', 'hantee-or-lanterne': 'c861c534', 'hantee-lueur-chapeau': '98b3832f', 'etoile-toque': '72751bcf', 'etoile-tablier': '2f45fc06', 'chaine-toque': '99f7a60c', 'chaine-veste': '7285f43e', 'chaine-souliers': 'e8411715', 'chaine-cles': '652eac6b', 'aura-lueur': '6375df31' },
    'saison': { 'galette': '6bd1fe0b', 'crepe': '755aa47c', 'paques': 'fe3a41a0', 'glace': '41695689', 'citrouille': 'c29d1edc', 'buche': 'eba5896a' },
    'palier': { 'horloge-comtoise': '5e21da74', 'piano': '2c737703' },
    'casino-trophees': { 'premiere-main': 'cf8b27f3', 'blackjack': '5a5b9971', 'cinq-cartes': '083aa871', 'partage': 'eb173bf7', 'double': '94a58c33', 'paire-parfaite': '797cdbc0', 'plein': '01d46418', 'zero': 'd76979e2', 'habitue': 'c06088c5', 'serie-10': '3390949d', 'assidu': 'cc5436fd' },
    'casino-skins': { 'tapis-vert': 'ce401871', 'dos-classique': 'a924d400', 'jetons-classique': '7e039fe7', 'roue-classique': '774e34dd', 'tapis-bordeaux': '86b2812d', 'tapis-bleu-nuit': '9f6801f9', 'tapis-noir-or': '071f8d4f', 'tapis-prune': '0d808304', 'dos-or': '849ae83c', 'dos-fournil': '5427395f', 'dos-damier': 'a4e64cd4', 'jetons-nacre': '50c5d695', 'jetons-pastel': '1f34eccb', 'roue-fournil': '4eabf509', 'roue-ebene': 'ed2465a8', 'roue-or': 'e2a7b2cd' },
  };
  const actif = typeof window !== 'undefined' && !!window.FOURNIL_VERSION;
  const src = (f, id) => { const h = actif && T[f] && T[f][id]; return h ? `img/carnet/${f}/${id}.webp?v=${h}` : ''; };
  const img = (f, id, gagne, repli) => { const s = src(f, id); if (!s) return repli || ''; return `<img class="vig${gagne ? '' : ' gris'}" src="${s}" alt="" loading="lazy" decoding="async">${repli ? `<template class="vig-repli">${repli}</template>` : ''}`; };
  if (actif && typeof document !== 'undefined') document.addEventListener('error', (e) => { // (une image qui manque : son repli à la place de son bloc, ou d'elle seule)
    const im = e.target; if (!im || im.tagName !== 'IMG' || !im.classList.contains('vig')) return;
    const t = im.nextElementSibling, repli = t && t.classList.contains('vig-repli') ? t : null, bloc = repli && im.closest('[data-vig]');
    if (!repli) im.remove(); else if (bloc) bloc.replaceWith(repli.content.cloneNode(true)); else { im.replaceWith(repli.content.cloneNode(true)); repli.remove(); }
  }, true);
  return { T, actif, src, img };
})();
if (typeof module !== 'undefined') module.exports = VIGNETTES;
