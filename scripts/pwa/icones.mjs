/**
 * Fabrique les icônes de la PWA depuis une source vectorielle.
 *
 * POURQUOI UN SCRIPT PLUTÔT QUE QUATRE PNG POSÉS À LA MAIN
 * Une icône de PWA se décline en quatre tailles et deux formes (carrée et
 * « maskable »). Posées à la main, elles divergent au premier changement de
 * charte : on en corrige trois, on oublie la quatrième, et c'est celle-là que
 * l'écran d'accueil d'un téléphone affiche. Ici la source est le SVG ci-dessous
 * et les PNG en sont des sorties — les regénérer coûte une commande.
 *
 *   node scripts/pwa/icones.mjs
 *
 * ── LA ZONE DE SÉCURITÉ N'EST PAS UNE MARGE DÉCORATIVE ───────────────────
 * Android rogne une icône `maskable` selon la forme du lanceur — cercle,
 * goutte, carré arrondi, ça dépend du constructeur. La spec réserve les 20 %
 * extérieurs à ce rognage : un dessin qui remplit toute la surface se fait
 * couper. La variante maskable dessine donc le même signe dans 60 % centraux,
 * sur fond plein. C'est le seul écart entre les deux variantes.
 *
 * Le signe est un entonnoir, pas un « S » : il faut qu'il se lise à 48 px dans
 * un onglet, et une lettre à cette taille demande une fonte — dépendance que ce
 * script n'a pas et n'aura pas.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const NUIT = "#0A1B33";
const AZUR = "#2F7AE0";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SORTIE = path.join(RACINE, "public", "pwa");

/**
 * Le signe, dessiné dans une grille de 100 × 100 et centré.
 * `echelle` < 1 le rétrécit pour dégager la zone de sécurité maskable.
 */
function svg({ taille, echelle, rayon }) {
  const d = 100 * echelle;
  const o = (100 - d) / 2;
  const u = (v) => o + (v * d) / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${taille}" height="${taille}">
  <rect width="100" height="100" rx="${rayon}" fill="${NUIT}"/>
  <path fill="${AZUR}" d="
    M ${u(22)} ${u(26)}
    L ${u(78)} ${u(26)}
    L ${u(58)} ${u(52)}
    L ${u(58)} ${u(76)}
    L ${u(42)} ${u(68)}
    L ${u(42)} ${u(52)}
    Z"/>
</svg>`;
}

const VARIANTES = [
  { fichier: "icone-192.png", taille: 192, echelle: 1, rayon: 22 },
  { fichier: "icone-512.png", taille: 512, echelle: 1, rayon: 22 },
  // Maskable : fond plein d'un bord à l'autre (rayon 0) et signe rentré à 60 %.
  { fichier: "icone-maskable-192.png", taille: 192, echelle: 0.6, rayon: 0 },
  { fichier: "icone-maskable-512.png", taille: 512, echelle: 0.6, rayon: 0 },
  // iOS ignore le manifest pour l'icône d'accueil et lit `apple-touch-icon`.
  // Il applique son propre masque arrondi : on livre donc des angles droits.
  { fichier: "apple-touch-icon.png", taille: 180, echelle: 1, rayon: 0 },
];

await mkdir(SORTIE, { recursive: true });

for (const v of VARIANTES) {
  const png = await sharp(Buffer.from(svg(v))).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(path.join(SORTIE, v.fichier), png);
  console.log(`${v.fichier} — ${v.taille}px — ${(png.length / 1024).toFixed(1)} ko`);
}
