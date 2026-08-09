import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Les polices de marque pour satori.
 *
 * Satori n'accepte que des `ArrayBuffer` de TTF/OTF. Il ne sait pas lire une
 * feuille de style Google Fonts — or c'est tout ce que produit
 * `src/lib/site-builder/google-fonts.ts` (des `href` CSS). Les binaires doivent
 * donc être versés dans le dépôt.
 *
 * Le kit d'identité fixe deux familles : **Cormorant Garamond** pour les titres
 * et **DM Sans** pour le texte (cf. `AuditShared.tsx` et le rendu mobile de
 * l'audit). Poser les fichiers ici les fait entrer dans la carte :
 *
 *   src/lib/og/fonts/CormorantGaramond-Light.ttf
 *   src/lib/og/fonts/DMSans-Regular.ttf
 *   src/lib/og/fonts/DMSans-Medium.ttf
 *
 * TANT QU'ILS SONT ABSENTS, ce module renvoie `undefined` et `ImageResponse`
 * retombe sur le Noto Sans qu'il embarque. C'est délibéré : la chaîne complète
 * (capture → carte → storage → unfurl) doit pouvoir être validée avant qu'on
 * s'occupe de fidélité typographique. Une police manquante dégrade l'allure,
 * elle ne casse jamais la génération.
 */

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 300 | 400 | 500 | 600 | 700;
  style: "normal" | "italic";
}

type FontSpec = { file: string; name: string; weight: OgFont["weight"]; style: OgFont["style"] };

const FONT_SPECS: FontSpec[] = [
  { file: "CormorantGaramond-Light.ttf", name: "Cormorant Garamond", weight: 300, style: "normal" },
  { file: "CormorantGaramond-LightItalic.ttf", name: "Cormorant Garamond", weight: 300, style: "italic" },
  { file: "DMSans-Regular.ttf", name: "DM Sans", weight: 400, style: "normal" },
  { file: "DMSans-Medium.ttf", name: "DM Sans", weight: 500, style: "normal" },
];

const FONT_DIR = path.join(process.cwd(), "src", "lib", "og", "fonts");

/** Mémoïsé : lire les binaires à chaque carte serait du gaspillage pur. */
let cached: OgFont[] | null | undefined;

/**
 * Renvoie les polices disponibles, ou `undefined` s'il n'y en a aucune —
 * signature attendue par `ImageResponse`, qui traite `undefined` comme
 * « utilise ta police par défaut ».
 */
export async function loadOgFonts(): Promise<OgFont[] | undefined> {
  if (cached !== undefined) return cached ?? undefined;

  const loaded: OgFont[] = [];
  for (const spec of FONT_SPECS) {
    try {
      const buf = await readFile(path.join(FONT_DIR, spec.file));
      loaded.push({
        name: spec.name,
        // `Buffer` est un `Uint8Array` : on découpe la vue exacte, sinon satori
        // reçoit le pool interne de Node en entier et refuse le fichier.
        data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
        weight: spec.weight,
        style: spec.style,
      });
    } catch {
      // Fichier absent : on continue. Voir l'en-tête — c'est un mode dégradé
      // prévu, pas une anomalie.
    }
  }

  cached = loaded.length > 0 ? loaded : null;
  return cached ?? undefined;
}

/** Les familles réellement disponibles, pour choisir la pile CSS de la carte. */
export function fontStack(fonts: OgFont[] | undefined, kind: "display" | "body"): string {
  const has = (n: string) => fonts?.some((f) => f.name === n) ?? false;
  if (kind === "display" && has("Cormorant Garamond")) return "Cormorant Garamond, serif";
  if (kind === "body" && has("DM Sans")) return "DM Sans, sans-serif";
  return "sans-serif";
}

/** Remet le cache à zéro (tests uniquement). */
export function __resetFontCachePourTests() {
  cached = undefined;
}
