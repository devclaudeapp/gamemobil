#!/bin/bash
# Les rendus de la maquette (voir boutique.cjs) : le temps JS à l'horloge (une variante à la fois, machine calme), les captures, gros plans,
# mesures et vidéos de 9 s (deux à la fois), la comparaison avec master (le point de départ de la branche, pixel à pixel : le jeu par
# défaut doit être identique), le temps processeur (schedstat), et la planche.
# usage : bash outils/maquette-clients/rendus.sh   (après node build.js ; ports 9061-9068 et 9031 ; Playwright dans NODE_PATH, ffmpeg, ImageMagick)
# Sorties dans $MAQUETTE_TRAVAIL (par défaut <tmp>/maquette-clients) : captures/, videos/, tmp/, planche/.
set -u
ICI=$(cd "$(dirname "$0")" && pwd); DEPOT=$(cd "$ICI/../.." && pwd)
export MAQUETTE_TRAVAIL=${MAQUETTE_TRAVAIL:-${TMPDIR:-/tmp}/maquette-clients}; D=$MAQUETTE_TRAVAIL; mkdir -p "$D/tmp"
# une seule heure de jeu pour tous les rendus (le débit, donc la cadence des clients, dépend de l'heure) : les mêmes clients partout
H=$(date -u +%Y-%m-%dT%H:00:00Z)
V=("0-actuelle|" "1-cam-actuelle-pack-a|clients=a" "2-cam-actuelle-pack-b|clients=b" "3-cam-basse-pack-a|clients=a&cam=basse" "4-cam-basse-pack-c|clients=c&cam=basse")
for cfg in "${V[@]}"; do id=${cfg%%|*}; rq=${cfg#*|}
  timeout 1200 node "$ICI/boutique.cjs" "m-$id" "$rq" --port 9067 --mesures --horloge "$H" > "$D/tmp/log-m-$id.txt" 2>&1; echo "processeur $id : $(grep mesures "$D/tmp/log-m-$id.txt" | cut -c1-300)"
done
run() { timeout 2400 node "$ICI/boutique.cjs" "$1" "$2" --port "$3" --loupe "p:190,250,2.3" --mesures --sans-cpu --video 9 --horloge "$H" > "$D/tmp/log-$1.txt" 2>&1; echo "rendu $1 ($?)"; }
run 0-actuelle "" 9061 & run 1-cam-actuelle-pack-a "clients=a" 9062 & wait
run 2-cam-actuelle-pack-b "clients=b" 9063 & run 3-cam-basse-pack-a "clients=a&cam=basse" 9064 & wait
rm -rf "$D/master" && mkdir -p "$D/master" && git -C "$DEPOT" archive "$(git -C "$DEPOT" merge-base HEAD origin/master 2>/dev/null || git -C "$DEPOT" merge-base HEAD master)" fournil vendor icons index.html | tar -x -C "$D/master"
run 4-cam-basse-pack-c "clients=c&cam=basse" 9065 &
timeout 900 node "$ICI/boutique.cjs" 0-master "" --port 9066 --racine "$D/master" --horloge "$H" > "$D/tmp/log-0-master.txt" 2>&1; echo "rendu 0-master ($?)"
wait
# (le canevas 3D, l'horloge murale masquée : ses aiguilles, le bouton ★ qui pulse et les pastilles des onglets suivent l'horloge réelle)
for f in 0-actuelle 0-master; do convert "$D/captures/$f.png" -fill black -draw "rectangle 380,215 430,262" -crop 780x1350+0+130 +repage "$D/tmp/scene3d-$f.png"; done
echo "jeu par défaut contre master : $(compare -metric AE "$D/tmp/scene3d-0-actuelle.png" "$D/tmp/scene3d-0-master.png" null: 2>&1) pixels différents dans la scène 3D, $(compare -metric AE "$D/captures/0-actuelle.png" "$D/captures/0-master.png" null: 2>&1) sur tout l'écran"
# le temps processeur du fil principal (schedstat : l'attente et la préemption n'y comptent pas), une variante à la fois
for cfg in "${V[@]}"; do id=${cfg%%|*}; rq=${cfg#*|}
  timeout 1500 node "$ICI/boutique.cjs" "c-$id" "$rq" --port 9068 --mesures --sans-cpu --cpu-temps --horloge "$H" > "$D/tmp/log-c-$id.txt" 2>&1; echo "temps processeur $id : $(grep cpu-temps "$D/tmp/log-c-$id.txt" | cut -c1-300)"
done
node "$ICI/planche.cjs"
