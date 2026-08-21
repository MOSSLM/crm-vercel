/**
 * Le branchement des gabarits de plaquette sur un prospect réel.
 *
 * UN SEUL ENDROIT REMPLACE LES MARQUEURS, pour les deux formats. L'A4 part par
 * mail, le mobile part par WhatsApp, et ils portent les MÊMES six valeurs :
 * séparer leur remplissage, c'est se réveiller un jour avec un prix à jour sur
 * l'un et périmé sur l'autre, envoyés au même prospect à trois jours d'écart.
 *
 * CHAQUE MARQUEUR A SON CONTEXTE, ET UN SEUL ÉCHAPPEMENT NE SUFFIT PAS :
 *
 *  - `NOM_ENTREPRISE`, `SECTEUR_VILLE`, `PRIX_SITE`, `DATE` sont du texte HTML.
 *  - `DEMO_URL` est à la fois du texte ET la fin d'un `href="https://…"`. Il
 *    est donc servi SANS SCHÉMA — le gabarit pose `https://` lui-même — et un
 *    guillemet dans la valeur casserait l'attribut.
 *  - `CAPTURE_DEMO` vit dans `style="background-image:url('…')"`. Une
 *    apostrophe ou une parenthèse y refermerait l'expression CSS, et tout ce
 *    qui suit deviendrait de la déclaration. On n'échappe donc pas : on REFUSE
 *    ce qui n'est pas une URL https simple, et le squelette dessiné en CSS
 *    reprend la place — il est fait pour ça.
 *
 * LA COUVERTURE SE CHOISIT TOUTE SEULE. Trois situations, deux couvertures :
 * démo publiée avec sa capture (la fenêtre de navigateur), démo publiée sans
 * capture (la même fenêtre, squelette au lieu de l'image), pas de démo du tout
 * (`#doc.sc` : « votre aperçu est en préparation »). C'est la seule règle, et
 * elle évite la faute qui coûte le plus cher — annoncer « voici votre site » en
 * pointant une page qui n'existe pas.
 */

import { esc } from "@/utils/audit/htmlShared";
import { CORPS_PLAQUETTE_A4, CSS_PLAQUETTE_A4 } from "@/lib/audit/plaquette-a4.gabarit";
import { CORPS_PLAQUETTE_MOBILE, CSS_PLAQUETTE_MOBILE } from "@/lib/audit/plaquette-mobile.gabarit";

export type FormatPlaquette = "a4" | "mobile";

export interface DonneesPlaquette {
  /** Le nom de l'entreprise, tel qu'il s'écrit sur la couverture. */
  nom: string;
  /** La ligne du dessous : « Secteur · Ville ». Vide si on ne sait pas. */
  meta: string;
  /** L'adresse de la démo, avec ou sans schéma — il est retiré ici. */
  demoUrl: string;
  /** `sites.og_shot_url`, ou null : le squelette prend la place. */
  captureDemo: string | null;
  /** Le montant déjà formaté (`prixPlaquette`), ou null si on ne sait pas. */
  prix: string | null;
  /** La date d'établissement, en toutes lettres. */
  date: string;
}

const GABARITS: Record<FormatPlaquette, { css: string; corps: string }> = {
  a4: { css: CSS_PLAQUETTE_A4, corps: CORPS_PLAQUETTE_A4 },
  mobile: { css: CSS_PLAQUETTE_MOBILE, corps: CORPS_PLAQUETTE_MOBILE },
};

/**
 * L'adresse telle que le gabarit l'attend : sans schéma, sans barre finale.
 *
 * Le gabarit écrit `href="https://{{DEMO_URL}}"` et affiche la même valeur en
 * clair juste à côté. Laisser le schéma donnerait `https://https://…` dans le
 * lien — cassé — et une adresse à rallonge sous les yeux du prospect.
 */
const hoteSeul = (url: string): string =>
  url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");

/**
 * L'URL d'image, ou une chaîne vide.
 *
 * Liste blanche plutôt qu'échappement : la valeur entre dans une expression
 * CSS, où le seul remède sûr est de ne laisser passer que ce qu'on reconnaît.
 * Nos captures sont toutes des URL Supabase en https, sans apostrophe.
 */
const urlImageSure = (url: string | null | undefined): string => {
  const v = (url ?? "").trim();
  if (!/^https:\/\/[^\s'"()\\]+$/i.test(v)) return "";
  return v;
};

/** Ce qu'on écrit quand le catalogue n'a pas su dire le prix. */
const PRIX_INCONNU = "sur devis";

/**
 * Le document prêt à servir : sa feuille de style et son corps.
 *
 * Les deux sont rendus ensemble parce qu'ils ne vont jamais l'un sans l'autre —
 * le corps du gabarit ne veut rien dire sans ses 18 ko de mise en page.
 */
export function rendrePlaquette(
  format: FormatPlaquette,
  d: DonneesPlaquette,
): { css: string; html: string } {
  const { css, corps } = GABARITS[format];
  const demo = hoteSeul(d.demoUrl);
  const capture = urlImageSure(d.captureDemo);

  const valeurs: Record<string, string> = {
    NOM_ENTREPRISE: esc(d.nom.trim() || "Votre entreprise"),
    SECTEUR_VILLE: esc(d.meta),
    DEMO_URL: esc(demo),
    CAPTURE_DEMO: capture,
    PRIX_SITE: esc(d.prix?.trim() || PRIX_INCONNU),
    DATE: esc(d.date),
  };

  const rempli = corps.replace(/\{\{([A-Z_]+)\}\}/g, (brut, cle: string) =>
    // Un marqueur inconnu est laissé tel quel plutôt que vidé : il se voit à la
    // relecture, alors qu'un trou silencieux se découvre chez le prospect.
    Object.prototype.hasOwnProperty.call(valeurs, cle) ? valeurs[cle] : brut,
  );

  // Sans démo, la couverture bascule sur « votre aperçu est en préparation ».
  const html = demo ? rempli : rempli.replace('<div id="doc">', '<div id="doc" class="sc">');

  return { css, html };
}
