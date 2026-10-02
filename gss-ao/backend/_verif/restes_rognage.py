"""Compare les PNG de restes_rognage.ts : le contenu (pixels non blancs) est le même avant et après recadrage, à
l'endroit près ; marges restantes et gain de hauteur. Usage : python3 _verif/restes_rognage.py <sortie>"""
import sys, os
from PIL import Image, ImageChops
d = sys.argv[1]
ko = 0; gains = []
for f in sorted(os.listdir(os.path.join(d, 'avant'))):
    a = Image.open(os.path.join(d, 'avant', f)).convert('RGB')
    p = os.path.join(d, 'apres', f)
    if not os.path.exists(p):
        print('KO absent', f); ko += 1; continue
    b = Image.open(p).convert('RGB')
    blanc = lambda im: ImageChops.difference(im, Image.new('RGB', im.size, (255, 255, 255))).convert('L').point(lambda v: 255 if v > 6 else 0)
    ba, bb = blanc(a).getbbox(), blanc(b).getbbox()
    if not ba or not bb:
        print('KO vide', f); ko += 1; continue
    ca, cb = a.crop(ba), b.crop(bb)
    if ca.size != cb.size:
        print('KO taille du contenu', f, ca.size, cb.size); ko += 1; continue
    diff = ImageChops.difference(ca, cb).convert('L').point(lambda v: 255 if v > 24 else 0)
    n = sum(1 for v in diff.getdata() if v)
    marges = (bb[0], bb[1], b.size[0] - bb[2], b.size[1] - bb[3])
    if n > 0.002 * ca.size[0] * ca.size[1] or min(marges) < 8:
        print('KO', f, 'pixels différents', n, 'marges', marges); ko += 1; continue
    gains.append((1 - b.size[1] / a.size[1], f, a.size, b.size))
gains.sort(reverse=True)
print('plus gros gains de hauteur :', [(round(g, 2), f, s0, s1) for g, f, s0, s1 in gains[:6]])
print('schémas inchangés (pas de recadrage) :', sum(1 for g in gains if g[0] == 0), '/', len(gains))
print('TOUT OK' if not ko else f'{ko} KO')
