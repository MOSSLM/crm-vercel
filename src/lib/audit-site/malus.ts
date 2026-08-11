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
  /** `null` quand PageSpeed n'a pas rendu de performance : on ne publie rien. */
  note: number | null;
  /** La note de Google avant ajustement, pour pouvoir montrer la soustraction. */
  base: number | null;
  /** Le détail, du plus lourd au plus léger. C'est la démonstration. */
  lignes: LigneMalus[];
  /** Vrai quand le plancher a mordu. */
  plancherAtteint: boolean;
}

/**
 * En dessous, on humilie sans convaincre.
 *
 * Un artisan qui reçoit 12/100 ne décroche pas son téléphone : il se vexe et
 * ferme le document. Le plancher n'efface pas les constats — ils restent tous
 * affichés avec leurs malus — il refuse seulement de transformer un diagnostic
 * en jugement de valeur.
 */
export const NOTE_PLANCHER = 35;

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
  // `=== false` et non `!` : le signal est à TROIS états. `analyze.ts` ne rend
  // `false` que s'il connaissait la ville au moment de la lecture, et `null`
  // sinon. Le test d'égalité stricte suffit donc à lui seul — une garde
  // supplémentaire sur le contexte désarmerait la règle partout où la note se
  // calcule sans jointure sur `entreprises`, ce qui est le cas à la lecture.
  { points: 2, libelle: "Votre ville n’apparaît pas dans le titre du site", quand: (s) => s.villeDansTitre === false },
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
 * `perfPsi` est la performance rendue par PageSpeed. Sans elle, aucune note :
 * on ne publie pas un chiffre qu'on n'a pas mesuré, et c'est le pendant de la
 * décision de ne plus publier nos axes vitesse et mobile sans Google.
 */
export function noteDocument(
  perfPsi: number | null | undefined,
  s: SignauxSite,
  ctx: ContexteEntreprise = {},
): NoteDocument {
  if (perfPsi == null || !Number.isFinite(perfPsi) || !s.joignable) {
    return { note: null, base: null, lignes: [], plancherAtteint: false };
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
  const brute = perfPsi - total;

  return {
    note: Math.max(NOTE_PLANCHER, brute),
    base: perfPsi,
    lignes,
    plancherAtteint: brute < NOTE_PLANCHER,
  };
}
