/**
 * Du `nom_certificat` de l'ADEME au fichier de logo.
 *
 * `public/rge/mapping.json` fait foi : c'est le même fichier qui sert au CRM et
 * aux templates Claude Design, et les noms de fichiers sont la clé partagée
 * entre les deux. On l'importe plutôt que de recopier la table — une copie ne
 * reste pas alignée.
 *
 * LE POINT À NE PAS « CORRIGER » : l'énumération ADEME compte **40** valeurs de
 * `nom_certificat`, le mapping n'en couvre que **16**. Ce n'est pas un trou à
 * combler : la vingtaine de `CERTIFICAT_*` et `CERTIFACT_*` sont des certificats
 * d'audit NOMINATIFS (« CERTIFICAT_CABINET_DENIZOU »), délivrés à un bureau
 * d'études précis. Ils n'ont pas de logo public, et n'en auront jamais.
 *
 * Une qualification sans logo reste donc une qualification VALIDE — elle compte
 * dans le total, elle s'affiche en texte, elle n'a simplement pas d'image.
 * Confondre « pas de logo » avec « pas de qualification » ferait disparaître des
 * certifications réelles.
 */

import mapping from "../../../public/rge/mapping.json";

const CERTIFICAT_VERS_LOGO = mapping.certificat_vers_logo as Record<string, string>;
const CANVAS = mapping.canvas as { w: number; h: number };

export type LogoRge = {
  /** Clé stable, aussi le nom de fichier : 'qualipac', 'qualibois'… */
  cle: string;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  /**
   * Texte alternatif. Le NOM DU CERTIFICAT, pas « logo RGE » : un lecteur
   * d'écran doit entendre laquelle des qualifications l'entreprise détient.
   */
  alt: string;
};

/** Le fichier de logo d'un certificat, ou `null` s'il n'en a pas. */
export const logoPourCertificat = (nomCertificat: string | null | undefined): string | null => {
  if (!nomCertificat) return null;
  return CERTIFICAT_VERS_LOGO[nomCertificat.trim()] ?? null;
};

/**
 * Le logo complet, prêt à poser dans un `<img>`.
 *
 * Toutes les images sont normalisées sur le MÊME gabarit (360×180, plus une
 * version @2x) et déjà équilibrées sur leur aire optique. Une rangée s'aligne
 * donc sans ajustement : il ne faut ni les redimensionner une par une, ni leur
 * imposer une hauteur commune — ce serait défaire le travail de normalisation.
 */
export const logoRge = (nomCertificat: string | null | undefined): LogoRge | null => {
  const cle = logoPourCertificat(nomCertificat);
  if (!cle) return null;
  return {
    cle,
    src: `/rge/${cle}.png`,
    srcSet: `/rge/${cle}.png 1x, /rge/${cle}@2x.png 2x`,
    width: CANVAS.w,
    height: CANVAS.h,
    alt: (nomCertificat ?? "").trim(),
  };
};

/**
 * Les logos DISTINCTS d'une liste de qualifications, dans l'ordre rencontré.
 *
 * Déduplication indispensable : une entreprise peut détenir « QualiPAC module
 * Chauffage et ECS » sur deux domaines (pompe à chaleur ET chauffe-eau
 * thermodynamique), ce qui fait deux lignes ADEME pour un seul logo. Sans ça,
 * le bandeau afficherait deux fois la même image.
 *
 * Cas réel : Chaleur et Confort a 6 qualifications pour 4 logos distincts.
 */
export const logosDistincts = (
  qualifications: Array<{ nom_certificat?: string | null }>,
): LogoRge[] => {
  const vus = new Set<string>();
  const logos: LogoRge[] = [];
  for (const q of qualifications) {
    const logo = logoRge(q.nom_certificat);
    if (!logo || vus.has(logo.cle)) continue;
    vus.add(logo.cle);
    logos.push(logo);
  }
  return logos;
};

/** Nombre de certificats connus du mapping — utile aux tests et au diagnostic. */
export const NB_CERTIFICATS_MAPPES = Object.keys(CERTIFICAT_VERS_LOGO).length;
