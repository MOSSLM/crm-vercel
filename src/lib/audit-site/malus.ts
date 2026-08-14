import type { ContexteEntreprise, SignauxSite } from "./types";

/**
 * La note du DOCUMENT : celle de Google, ajustée par ce que Google ne voit pas.
 *
 * DEUX NOTES COEXISTENT, ET ELLES NE S'ADRESSENT PAS AU MÊME PUBLIC.
 *
 * `scorer()` produit une note de TRI : elle classe 2 795 entreprises pour
 * décider lesquelles valent un appel, gratuitement et en une seconde. À ce
 * métier-là elle suffit — il lui faut ordonner, pas être exacte.
 *
 * Celle-ci est la note montrée à l'artisan. Elle part de la performance mesurée
 * par PageSpeed, parce que c'est la seule que le prospect peut refaire lui-même
 * en trente secondes sur pagespeed.web.dev — et parce que la nôtre s'est révélée
 * fausse dans les deux sens : un site noté 70/100 mettait 18,6 secondes à
 * s'afficher, notre chronomètre ne regardant que la réponse du serveur.
 *
 * POURQUOI LA PERFORMANCE SEULE, ET PAS LA MOYENNE DES QUATRE CATÉGORIES. La
 * moyenne dilue : sur le site à 18,6 secondes, elle remonte à 75 parce que ses
 * bonnes pratiques sont à 96. On retomberait exactement dans le travers qu'on
 * vient de corriger. La performance est ce que le visiteur subit.
 *
 * POURQUOI PAS DE MALUS SUR LE TEMPS D'AFFICHAGE. Il est DÉJÀ dans la note de
 * Google. L'y ajouter compterait deux fois la même chose — la règle « un défaut,
 * un malus » vaut ici comme ailleurs. Les malus ci-dessous ne portent que sur ce
 * que Lighthouse ne regarde pas : peut-on vous joindre, peut-on vous croire,
 * vous trouve-t-on là où on vous cherche.
 *
 * LEUR TAILLE EST VOLONTAIREMENT PETITE — un à trois points. Ce sont des
 * ajustements sur une mesure qui existe déjà, pas un barème parallèle. Ensemble
 * ils retirent sept à dix-huit points sur les sites réels : assez pour compter,
 * pas assez pour écraser la mesure de Google.
 */

export interface LigneMalus {
  /** La phrase telle qu'elle s'affiche : « numéro non cliquable ». */
  libelle: string;
  /** Points retirés. Toujours positif. */
  points: number;
}

export interface NoteDocument {
  /** `null` quand rien de publiable n'a pu être mesuré. */
  note: number | null;
  /** La base avant ajustement, pour pouvoir montrer la soustraction. */
  base: number | null;
  /** Le détail, du plus lourd au plus léger. C'est la démonstration. */
  lignes: LigneMalus[];
  /** Vrai quand le plafond « contenu » a mordu. */
  plafondAtteint: boolean;
}

/**
 * LE POIDS DE CHAQUE AXE DANS LA NOTE MONTRÉE.
 *
 * POURQUOI CETTE TABLE REMPLACE « LA PERFORMANCE, ET RIEN D'AUTRE ». La note
 * valait la seule catégorie performance de Google, moins des malus. Elle
 * affichait donc 35 au-dessus d'une carte « Visibilité sur Google · 100 », et
 * aucun lecteur ne pouvait retomber sur le grand nombre en regardant les
 * petits. Un document qu'on ne peut pas recalculer de tête ne se défend pas.
 *
 * Désormais la note EST la moyenne pondérée des axes affichés, et les poids
 * s'impriment à côté. Le prospect refait l'addition s'il veut ; c'est
 * exactement ce qu'on veut qu'il puisse faire.
 *
 * OÙ SONT LES POIDS, ET POURQUOI LÀ. Ils tombent sur ce que l'offre répare :
 * contenu et prise de contact valent 40 à eux deux. La rapidité garde le plus
 * gros poids unitaire parce que c'est la seule mesure que le prospect peut
 * refaire lui-même en trente secondes sur pagespeed.web.dev.
 *
 * DEUX AXES À ZÉRO, ET C'EST DÉLIBÉRÉ. La notoriété ne parle pas du site — elle
 * ne se répare pas en achetant un site, et « votre site : 62 » cesserait de
 * vouloir dire quelque chose si elle y entrait. Les bonnes pratiques de
 * Lighthouse mesurent des erreurs de console et des ratios d'image : vrai, mais
 * illisible pour un artisan, et jamais ce qu'on vend. Les deux s'affichent avec
 * leurs constats sans peser sur le chiffre.
 */
export const POIDS_DOCUMENT: Record<string, number> = {
  vitesse: 25,
  seo: 20,
  contenu: 20,
  conversion: 20,
  accessibilite: 15,
  // Notre axe mobile ne sort que si Google n'a pas rendu l'accessibilité, qui
  // dit la même chose en mieux. Il en hérite donc le poids, jamais les deux.
  mobile: 15,
  netlinking: 10,
  bonnes_pratiques: 0,
  popularite: 0,
};

/**
 * Sous ce seuil, l'axe contenu est « mauvais ».
 *
 * C'EST LA RÉPONSE AU SITE VIDE QUI CHARGE VITE. PageSpeed récompense le vide :
 * moins de pages, moins d'images, moins de scripts, donc meilleur affichage.
 * Un site de trois pages bâclé battait un vrai site de quarante. Avec les seuls
 * poids ci-dessus il décrochait encore 67 — rapidité 100, technique 85,
 * accessibilité 95 suffisent à porter un document indigent.
 *
 * Le plafond coupe court : quoi qu'il arrive par ailleurs, un site sans contenu
 * ne dépasse pas la moyenne. Une pondération ne pouvait pas le faire sans
 * donner au contenu un poids que rien ne justifierait.
 */
export const SEUIL_CONTENU_MAUVAIS = 50;
export const PLAFOND_SANS_CONTENU = 50;

/**
 * La moyenne pondérée des axes RÉELLEMENT PUBLIÉS.
 *
 * Normalisée sur les axes présents : un axe absent — Google n'a pas rendu sa
 * catégorie, la confiance est trop faible, l'entreprise n'a pas de site — sort
 * du dénominateur au lieu de valoir zéro. On ne punit jamais un site pour ce
 * qu'on n'a pas su regarder ; c'est la règle de tout ce module depuis le début,
 * et elle vaut aussi pour la note du document.
 */
export function baseDocument(
  axes: ReadonlyArray<{ id: string; note: number }>,
): number | null {
  const retenus = axes.filter((a) => (POIDS_DOCUMENT[a.id] ?? 0) > 0);
  const total = retenus.reduce((somme, a) => somme + POIDS_DOCUMENT[a.id], 0);
  if (total === 0) return null;
  const obtenus = retenus.reduce((somme, a) => somme + a.note * POIDS_DOCUMENT[a.id], 0);
  return Math.round(obtenus / total);
}

/**
 * Le barème, en un seul endroit et dans l'ordre du poids.
 *
 * Chaque entrée doit passer deux épreuves pour figurer ici : Google ne la mesure
 * pas, et le prospect peut la vérifier sur son téléphone en dix secondes. Une
 * ligne qui échoue à l'une des deux crée soit un double comptage, soit une
 * affirmation qu'on ne saura pas défendre.
 */
const BAREME: Array<{ points: number; quand: (s: SignauxSite, c: ContexteEntreprise) => boolean; libelle: string }> = [
  { points: 3, libelle: "Aucun moyen de vous écrire en ligne", quand: (s) => !s.formulaire && !s.mailto },
  { points: 3, libelle: "Votre numéro ne se compose pas en un clic", quand: (s) => !s.telCliquable },
  { points: 3, libelle: "Connexion non sécurisée", quand: (s) => !s.https },
  { points: 2, libelle: "Vos avis clients n’apparaissent pas sur le site", quand: (s) => !s.avisDansLaPage && !s.widgetAvis },
  { points: 2, libelle: "Mentions légales absentes", quand: (s) => !s.mentionsLegales },
  { points: 2, libelle: "Presque aucun bouton pour vous contacter", quand: (s) => s.nbCta < 2 },
  { points: 2, libelle: "Titre de page absent", quand: (s) => !s.title?.trim() },
  { points: 2, libelle: "Aucun résumé sous votre résultat Google", quand: (s) => !s.metaDescription?.trim() },
  { points: 2, libelle: "Votre ville n’apparaît pas dans le titre du site", quand: (s, c) => Boolean(c.ville) && s.villeDansTitre === false },
  { points: 1, libelle: "Fiche d’entreprise non déclarée à Google", quand: (s) => !s.jsonLdLocalBusiness },
];

/*
 * PAS DE MALUS SUR LES AVIS GOOGLE, et c'est une règle ancienne qu'une première
 * version de ce fichier avait emportée. La note porte sur LE SITE. Le nombre
 * d'avis reçus n'est pas le site : il ne se répare pas en achetant un site, et
 * « votre site : 62/100 » cesserait de vouloir dire quelque chose s'il y entrait.
 * L'axe popularité existe, s'affiche et produit des constats vendables — il ne
 * pèse pas sur le chiffre.
 *
 * PAS DE MALUS SUR LES PHOTOS SANS DESCRIPTION non plus : Lighthouse les compte
 * déjà, dans sa catégorie accessibilité comme dans son SEO.
 */

/**
 * La note publiée, ou `null`.
 *
 * `base` est la moyenne pondérée des axes affichés — voir `baseDocument`. Sans
 * un seul axe publiable, aucune note : on ne publie pas un chiffre qu'on n'a
 * pas mesuré.
 *
 * `noteContenu` sert au plafond, et seulement à lui. `null` quand l'axe n'a pas
 * été relevé : on ne plafonne pas sur une absence de mesure, sinon tout dossier
 * non préparé tomberait à 50 sans que rien ne l'ait constaté.
 */
export function noteDocument(
  base: number | null | undefined,
  s: SignauxSite,
  ctx: ContexteEntreprise = {},
  noteContenu: number | null = null,
): NoteDocument {
  if (base == null || !Number.isFinite(base) || !s.joignable) {
    return { note: null, base: null, lignes: [], plafondAtteint: false };
  }

  const lignes = BAREME.filter((m) => {
    try {
      return m.quand(s, ctx);
    } catch {
      // Un signal absent d'une ligne ancienne ne doit pas faire échouer la note.
      return false;
    }
  }).map(({ libelle, points }) => ({ libelle, points }));

  const total = lignes.reduce((somme, l) => somme + l.points, 0);
  const brute = Math.max(0, base - total);
  const plafonne = noteContenu != null && noteContenu < SEUIL_CONTENU_MAUVAIS;

  return {
    note: plafonne ? Math.min(PLAFOND_SANS_CONTENU, brute) : brute,
    base,
    lignes,
    plafondAtteint: plafonne && brute > PLAFOND_SANS_CONTENU,
  };
}
