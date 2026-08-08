#!/usr/bin/env python3
"""Normalisation optique des logos de qualification RGE.

Le probleme n'est pas la taille des fichiers mais le POIDS OPTIQUE : a hauteur
egale, un macaron carre parait plus gros qu'un bandeau large. On met donc a
l'echelle sur l'AIRE (racine carree), pas sur la hauteur, puis on centre sur un
canvas unique. Resultat : une rangee de logos visuellement equilibree.
"""
import json, math, os, subprocess, sys

CANVAS = (360, 180)   # canvas final, ratio 2:1
MAXW, MAXH = 300, 130  # bornes dures a l'interieur du canvas
AREA = 21000           # aire optique cible en pixels
DENSITY = 1200         # rasterisation des SVG

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
os.makedirs('norm', exist_ok=True)


def sh(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"{' '.join(a)}\n{r.stderr[:300]}")
    return r.stdout.strip()


def taille(p):
    return tuple(int(x) for x in sh('magick', 'identify', '-format', '%w %h', p).split())


def normalise(src, nom):
    tmp = f'norm/.{nom}.tmp.png'
    if src.endswith('.svg'):
        sh('magick', '-background', 'none', '-density', str(DENSITY), src, tmp)
    elif src.endswith(('.jpg', '.jpeg')):
        # JPEG = fond blanc opaque : on le rend transparent, tolerance faible
        sh('magick', src, '-fuzz', '4%', '-transparent', 'white', tmp)
    else:
        sh('magick', src, tmp)

    sh('magick', tmp, '-trim', '+repage', tmp)
    w, h = taille(tmp)

    s = min(math.sqrt(AREA / (w * h)), MAXW / w, MAXH / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))

    out = f'norm/{nom}.png'
    sh('magick', tmp, '-resize', f'{nw}x{nh}!', '-background', 'none',
       '-gravity', 'center', '-extent', f'{CANVAS[0]}x{CANVAS[1]}', '-strip', out)
    sh('magick', out, '-resize', '200%', '-strip', f'norm/{nom}@2x.png')
    os.remove(tmp)
    print(f"  {nom:<17} {w:>4}x{h:<4} -> {nw:>3}x{nh:<3}  (ratio {w/h:.2f})")
    return {'w_src': w, 'h_src': h, 'w': nw, 'h': nh}


LOGOS = [
    ('qualipac.png', 'qualipac'), ('qualibois.png', 'qualibois'),
    ('qualipv.png', 'qualipv'), ('qualisol.png', 'qualisol'),
    ('chauffageplus.png', 'chauffage-plus'), ('ventilationplus.png', 'ventilation-plus'),
    ('qualibat.svg', 'qualibat'), ('qualifelec.png', 'qualifelec'),
    ('opqibi.svg', 'opqibi'),
    ('certiforage.jpg', 'certiforage'), ('rechargeelec.jpg', 'recharge-elec'),
    ('opqibi-rge.svg', 'opqibi-rge'),
]

print(f"Normalisation — aire optique {AREA}px, canvas {CANVAS[0]}x{CANVAS[1]} :")
infos = {}
for src, nom in LOGOS:
    if os.path.exists(src):
        infos[nom] = normalise(src, nom)
    else:
        print(f"  {nom:<17} SOURCE ABSENTE")

# Table de correspondance : nom_certificat ADEME -> fichier logo
MAPPING = {
    'QUALIBAT-RGE': 'qualibat',
    'QualiPAC module Chauffage et ECS': 'qualipac',
    'QualiPAC module CET': 'qualipac',
    'Qualibois Eau': 'qualibois',
    'Qualibois Air': 'qualibois',
    'QualiPV 36': 'qualipv',
    'QualiPV 500': 'qualipv',
    'Qualisol CESI': 'qualisol',
    'Qualisol Combi': 'qualisol',
    'Qualisol Collectif': 'qualisol',
    'Chauffage +': 'chauffage-plus',
    'Ventilation +': 'ventilation-plus',
    'Certificat Qualifelec RGE': 'qualifelec',
    'Certificat OPQIBI': 'opqibi',
    'Certification forage module Sonde': 'certiforage',
    'Certification forage module Nappe': 'certiforage',
}
json.dump({'canvas': {'w': CANVAS[0], 'h': CANVAS[1]}, 'certificat_vers_logo': MAPPING,
           'dimensions': infos},
          open('mapping.json', 'w'), ensure_ascii=False, indent=1)

noms = [n for _, n in LOGOS if os.path.exists(f'norm/{n}.png')]
# planche de controle : `montage` exige une police, on assemble donc a la main
rows = []
for i in range(0, len(noms), 4):
    r = f'norm/.row{i}.png'
    sh('magick', *[f'norm/{n}.png' for n in noms[i:i + 4]], '-background', '#eeeeee', '+append', r)
    rows.append(r)
sh('magick', *rows, '-background', '#eeeeee', '-gravity', 'center', '-append', 'planche.png')
for r in rows:
    os.remove(r)
print(f"\nplanche de controle : planche.png ({sh('magick','identify','-format','%wx%h','planche.png')})")
print(f"correspondance : mapping.json — {len(MAPPING)} certificats ADEME -> {len(noms)} logos")
