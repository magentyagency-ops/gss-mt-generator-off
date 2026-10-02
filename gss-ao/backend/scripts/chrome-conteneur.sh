#!/bin/sh
# Lanceur de Chrome pour le rendu PDF par Marp CLI en conteneur Linux (Railway).
#
# Dans un conteneur, la mémoire partagée /dev/shm est souvent limitée à 64 Mo : un mémoire de 140 pages peut alors
# faire planter l'onglet de Chrome (« Target closed », « Page crashed »). L'option --disable-dev-shm-usage le
# fait écrire dans /tmp à la place. Marp CLI 4.4 n'a aucune option pour transmettre des arguments à Chrome : il lance
# l'exécutable désigné par CHROME_PATH. marp_generator.ts désigne donc ce lanceur (CHROME_PATH) et lui passe le vrai
# Chrome dans GSS_CHROME_REEL ; le lanceur ajoute l'option puis remplace son propre processus par Chrome (exec : mêmes
# entrées / sorties, mêmes canaux de pilotage, mêmes arguments que ceux de Marp).
# Si CHROME_PATH désigne directement ce lanceur (réglage manuel), le vrai Chrome est celui installé par puppeteer.
if [ -z "$GSS_CHROME_REEL" ]; then
  GSS_CHROME_REEL="$(cd "$(dirname "$0")/.." && node -e "process.stdout.write(require('puppeteer').executablePath())")"
fi
if [ -z "$GSS_CHROME_REEL" ]; then
  echo "chrome-conteneur.sh : chemin du vrai Chrome introuvable (GSS_CHROME_REEL vide, puppeteer absent)." >&2
  exit 127
fi
exec "$GSS_CHROME_REEL" --disable-dev-shm-usage "$@"
