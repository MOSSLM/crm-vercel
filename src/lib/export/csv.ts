/**
 * Fabriquer un CSV qu'Excel français ouvre correctement du premier coup.
 *
 * ── TROIS DÉTAILS, ET CHACUN CASSE LE FICHIER À LUI SEUL ─────────────────
 *
 * 1. **LE SÉPARATEUR EST LE POINT-VIRGULE.** Excel choisit son séparateur selon
 *    le séparateur décimal de la machine ; en France c'est la virgule, donc
 *    Excel attend `;`. Un CSV à virgules s'ouvre en une seule colonne, et
 *    l'utilisateur conclut que l'export est cassé — il l'est, de son point de
 *    vue.
 *
 * 2. **LE BOM N'EST PAS OPTIONNEL.** Sans lui, Excel lit le fichier en ANSI :
 *    « Plomberie Générale » devient « Plomberie GÃ©nÃ©rale ». Sur un fichier
 *    d'artisans français, c'est une ligne sur deux.
 *
 * 3. **LES FINS DE LIGNE SONT CRLF.** C'est ce que la RFC 4180 demande et ce
 *    que les vieux tableurs exigent ; les autres l'acceptent tous.
 *
 * ── L'INJECTION DE FORMULE EST UN VRAI RISQUE, PAS UNE COQUETTERIE ───────
 * Un champ qui commence par `=`, `+`, `-` ou `@` est interprété comme une
 * FORMULE à l'ouverture. Nos données viennent de scrapers et de formulaires
 * publics : un nom d'entreprise valant `=HYPERLINK(...)` s'exécuterait chez qui
 * ouvre le fichier. On préfixe donc ces champs d'une apostrophe, qui force le
 * texte sans être affichée par le tableur.
 */

/** Le séparateur attendu par un Excel configuré en français. */
const SEP = ";";

const DEBUTS_DANGEREUX = ["=", "+", "-", "@", "\t", "\r"];

/** Échappe une valeur : neutralise la formule, puis protège les guillemets. */
export function champCsv(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";

  let texte: string;
  if (valeur instanceof Date) texte = valeur.toISOString();
  else if (typeof valeur === "object") texte = JSON.stringify(valeur);
  else texte = String(valeur);

  if (texte === "") return "";

  if (DEBUTS_DANGEREUX.includes(texte[0])) texte = `'${texte}`;

  // Guillemets doublés, et champ encadré dès qu'il contient un caractère de
  // structure. Le retour à la ligne EST autorisé dans un champ encadré : le
  // remplacer perdrait le contenu d'une note.
  if (texte.includes('"') || texte.includes(SEP) || texte.includes("\n") || texte.includes("\r")) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
}

export function ligneCsv(valeurs: unknown[]): string {
  return valeurs.map(champCsv).join(SEP) + "\r\n";
}

/** L'en-tête, BOM compris. À écrire en premier, une seule fois. */
export function enTeteCsv(colonnes: string[]): string {
  // Le BOM est écrit par son point de code : collé littéralement, il est
  // invisible à la relecture et se fait supprimer par le premier outil qui
  // « nettoie » le fichier.
  return "\uFEFF" + ligneCsv(colonnes);
}

/**
 * Un nom de fichier horodaté. La date est dans le nom parce qu'un export
 * s'accumule dans le dossier Téléchargements : `entreprises.csv`,
 * `entreprises (1).csv`, `entreprises (2).csv` ne se distinguent plus.
 */
export function nomFichier(base: string, extension: string): string {
  const d = new Date();
  const horodatage = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("");
  return `${base}-${horodatage}.${extension}`;
}
