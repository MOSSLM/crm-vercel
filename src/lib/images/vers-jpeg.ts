import "server-only";
import sharp from "sharp";

/**
 * PNG → JPEG, sous une cible de poids.
 *
 * POURQUOI CE FICHIER EXISTE, et pourquoi ce n'est pas une optimisation.
 *
 * WhatsApp ne se contente pas d'ignorer une vignette trop lourde : il la
 * RÉTROGRADE. On perd la grande carte — image en haut, titre et description
 * dessous — au profit d'une vignette carrée minuscule collée à gauche du titre.
 * Le lien reste cliquable, mais toute la composition est perdue et l'image est
 * rognée au carré. Le symptôme ne ressemble pas à une erreur, juste à un
 * affichage raté, ce qui le rend d'autant plus difficile à diagnostiquer.
 *
 * Or `ImageResponse` (`next/og`) ne sait produire que du PNG, format SANS
 * PERTE. Mesuré sur une carte 1200×630 contenant une capture de site :
 *
 *   PNG (sortie brute de next/og) ...................... 1 856 Ko
 *   PNG compressé au maximum ........................... 1 859 Ko  (aucun gain)
 *   JPEG qualité 85 ....................................   105 Ko
 *
 * Dix-huit fois plus léger. Aucune option PNG ne rattrape ça : le format n'est
 * pas fait pour la photographie.
 *
 * Module à part plutôt qu'une fonction de `render-card` : celui-ci importe
 * `next/og`, qui exige un environnement web au chargement et casse les tests
 * Jest. Une conversion d'image n'a de toute façon rien à faire dans le module
 * qui compose une carte.
 */

/** Cible de poids. En dessous, WhatsApp garde la grande carte. */
export const CIBLE_CARTE_OCTETS = 280 * 1024;

/** Paliers de qualité. On s'arrête au premier qui passe sous la cible. */
const PALIERS_QUALITE = [88, 82, 75, 68, 60];

export interface ResultatJpeg {
  bytes: Buffer;
  qualite: number;
}

export async function versJpegSousLimite(
  png: Uint8Array,
  cible = CIBLE_CARTE_OCTETS,
): Promise<ResultatJpeg> {
  // Une instance neuve par palier plutôt que `.clone()` : ce dernier s'appuie
  // sur `structuredClone`, absent de l'environnement de test de ce dépôt (jsdom).
  // Recréer depuis le tampon coûte un décodage de plus et rend la fonction
  // testable partout — le bon échange pour une opération qui tourne une fois
  // par carte.
  const source = Buffer.from(png);
  let dernier: Buffer | null = null;
  let qualite = PALIERS_QUALITE[PALIERS_QUALITE.length - 1];

  for (const q of PALIERS_QUALITE) {
    const out = await sharp(source)
      // `4:4:4` protège les aplats et le texte fin : le sous-échantillonnage
      // par défaut fait baver les lettres claires sur fond sombre, ce qui est
      // exactement la composition de la carte.
      .jpeg({ quality: q, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    dernier = out;
    qualite = q;
    if (out.length <= cible) break;
  }

  // Le dernier palier est rendu tel quel : une carte un peu lourde vaut mieux
  // que pas de carte, et à ce stade le poids a déjà été divisé par plus de dix.
  return { bytes: dernier as Buffer, qualite };
}
