# Blaster Kit (Kenney) — les blasters jouets d'Opération Poncin

- Pack : **Blaster Kit** de Kenney, https://kenney.nl/assets/blaster-kit (version 2.1)
- Licence : **CC0 1.0** (domaine public, aucune attribution requise ; on crédite quand même « Kenney.nl ») — voir License.txt
- Récupéré le 2026-10-09 par le workflow `.github/workflows/armes.yml` depuis : https://kenney.nl/media/pages/assets/blaster-kit/261d80a716-1753959510/kenney_blaster-kit_2.1.zip
- Zip d'origine : sha256 91e3093e95427d59625e7e2ce2d0399b861600160fd0b4ada7714796b67cea8c

Contenu : les modèles GLB du dossier « GLB format » du pack, tels quels. Ils ne contiennent pas leur texture :
chacun pointe vers `Textures/colormap.png` (une petite palette de couleurs, UV vers des aplats), copiée ici
avec les variantes de couleurs. Garder ce dossier tel quel pour que `THREE.GLTFLoader` retrouve la texture.
Mesuré (three r158 + GLTFLoader) : canon vers −z, dessus vers +y ; unités du pack ≈ 1,5 × nos mètres (×0,65 pour la
taille de nos blasters) ; l'origine varie d'un modèle à l'autre (blaster-e : origine à la bouche) : placer d'après la boîte
englobante. Nœuds séparés « magazine » (a, d, e, f, j, p, r : animation de recharge) et « scope » (e, f : lunette, pleine,
on ne voit pas au travers). Matériau unique MeshStandard (métal 0, rugosité 1, double face) sur la palette 512×512 ;
Textures/variation-a.png = la même palette en version sombre.
