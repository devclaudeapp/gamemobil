#!/bin/bash
# Les rendus des clients 3D (voir boutique.cjs) : la boutique à 390×844, tout le mobilier, 13 h, le même hasard partout (les mêmes clients) :
# en qualité haute avec les clients 3D, en haute avec les chibis (clients=0, pour comparer) et en éco (les chibis) : captures, gros plans (et, en haute, une vue de côté),
# mesures (appels de dessin, triangles, poids), une vidéo de 9 s en haute ; puis le temps processeur (schedstat, une configuration à la fois).
# usage : bash outils/clients3d/rendus.sh   (après node build.js ; ports PORT_RENDUS à PORT_RENDUS+4, 9461 par défaut ; Playwright dans NODE_PATH,
# ffmpeg, ImageMagick). Sorties dans $CLIENTS3D_TRAVAIL (par défaut <tmp>/clients3d) : captures/, videos/, tmp/.
set -u
ICI=$(cd "$(dirname "$0")" && pwd)
export CLIENTS3D_TRAVAIL=${CLIENTS3D_TRAVAIL:-${TMPDIR:-/tmp}/clients3d}; D=$CLIENTS3D_TRAVAIL; mkdir -p "$D/tmp"; P=${PORT_RENDUS:-9461}
# une seule heure de jeu pour tous les rendus (le débit, donc la cadence des clients, dépend de l'heure) : les mêmes clients partout
H=$(date -u +%Y-%m-%dT%H:00:00Z)
# (gros plans : les premières tables, puis la file au comptoir ; en haute, une vue de côté de la table du milieu : l'assise, les pieds au sol)
run() { timeout 2400 node "$ICI/boutique.cjs" "$1" "$2" --port "$3" --loupe "p:190,250,2.3;p:235,175,2.6" --mesures --sans-cpu --horloge "$H" "${@:4}" > "$D/tmp/log-$1.txt" 2>&1; echo "rendu $1 ($?) : $(grep mesures "$D/tmp/log-$1.txt" | cut -c1-200)"; }
run haute "" "$P" --video 9 --cote "218,272,120,z" & run haute-chibis "clients=0" "$((P + 1))" & wait
run eco "qualite=eco" "$((P + 2))"
for cfg in "haute|" "haute-chibis|clients=0"; do id=${cfg%%|*}; rq=${cfg#*|}
  timeout 1500 node "$ICI/boutique.cjs" "cpu-$id" "$rq" --port "$((P + 3))" --mesures --sans-cpu --cpu-temps --horloge "$H" > "$D/tmp/log-cpu-$id.txt" 2>&1; echo "temps processeur $id : $(grep cpu-temps "$D/tmp/log-cpu-$id.txt" | cut -c1-300)"
  timeout 1500 node "$ICI/boutique.cjs" "x4-$id" "$rq" --port "$((P + 4))" --mesures --horloge "$H" > "$D/tmp/log-x4-$id.txt" 2>&1; echo "processeur ×1 / ×4 $id : $(grep mesures "$D/tmp/log-x4-$id.txt" | cut -c1-400)"
done
