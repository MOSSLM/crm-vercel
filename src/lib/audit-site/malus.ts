import type { ContexteEntreprise, SignauxSite } from "./types";

/**
 * La note se construit par soustraction, et chaque point perdu porte son nom.
 *
 * POURQUOI ON A ABANDONNÉ LA MOYENNE PONDÉRÉE. Personne ne pouvait répondre à
 * « pourquoi 63 ? ». Une moyenne d'axes eux-mêmes moyennés ne se raconte pas :
 * elle se subit. Et elle produisait des résultats indéfendables — un site noté
 * 70/100 qui mettait 18,6 secondes à s'afficher, parce que le calcul ne
 * regardait que le temps de réponse du serveur.
 *
 * Un malus, lui, se montre : « 100, moins 35 pour un affichage à 18,6 secondes,
 * moins 10 parce qu'aucun formulaire ne permet de vous écrire ». Le prospect
 * peut contester ligne par ligne, ce qui est l'argument central de tout le
 * document. C'est aussi ce qui rend la note DÉRIVABLE des constats affichés :
 * elle cesse d'être un chiffre parallèle à ce qu'on lui montre.
 *
 * TROIS RÈGLES D'ÉCRITURE DE CE BARÈME.
 *
 * 1. **Un défaut, un malus.** Rien ne doit être compté deux fois. C'est la
 *    raison pour laquelle ce fichier remplace le calcul de la note globale au
 *    lieu de le corriger : ajouter des malus à une moyenne qui pénalise déjà les
 *    mêmes signaux aurait puni deux fois les sites mal faits.
 * 2. **Ce qui coûte des clients pèse lourd, la forme pèse peu.** Un formulaire
 *    absent vaut dix points ; une méta-description trop courte en vaut trois. Un
 *    barème qui traite les deux à égalité produit des audits qui parlent de
 *    balises à des artisans.
 * 3. **Chaque ligne se vérifie en dix secondes**, sur le téléphone du prospect.
 *    Un malus qu'on ne peut pas lui montrer n'a rien à faire ici.
 */

export interface LigneMalus {
  /** La phrase telle qu'elle s'affiche : « Affichage en 18,6 s ». */
  libelle: string;
  /** Points retirés. Toujours positif. */
  points: number;
}

export interface NoteParMalus {
  note: number;
  /** Le détail, du plus lourd au plus léger. C'est la démonstration. */
  lignes: LigneMalus[];
  /** Vrai quand le plancher a mordu : la somme dépassait ce qu'on publie. */
  plancherAtteint: boolean;
}

/**
 * En dessous, on humilie sans convaincre.
 *
 * Un artisan qui reçoit 12/100 ne décroche pas son téléphone : il se vexe et
 * ferme le document. Le plancher n'efface pas les constats — ils restent tous
 * affichés, avec leurs malus — il refuse seulement de transformer un diagnostic
 * en jugement de valeur. Un site injoignable, lui, ne reçoit aucune note du
 * tout : c'est un cas à part, traité en amont.
 */
export const NOTE_PLANCHER = 35;

/** Les paliers d'affichage, du plus grave au plus léger. */
const PALIERS_LCP: Array<{ seuilMs: number; points: number }> = [
  { seuilMs: 12_000, points: 35 },
  { seuilMs: 10_000, points: 25 },
  { seuilMs: 8_000, points: 18 },
  { seuilMs: 5_000, points: 10 },
  { seuilMs: 3_000, points: 5 },
];

/** « 18,6 s », « 950 ms » — même règle d'unité que partout ailleurs. */
function secondes(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(ms)} ms`;
}

/**
 * Le seul malus que la mesure maison ne peut pas produire.
 *
 * Notre analyseur chronomètre la réponse du serveur — le premier octet. Le temps
 * réellement vécu par le visiteur exige d'exécuter le JavaScript et de charger
 * les images : seul PageSpeed le fait. Sans mesure Google, ce malus n'existe
 * pas, et c'est assumé — c'est aussi ce qui rend la mesure Google indispensable
 * avant d'envoyer un audit.
 */
function malusAffichage(lcpMs: number | null | undefined): LigneMalus | null {
  if (lcpMs == null || !Number.isFinite(lcpMs)) return null;
  const palier = PALIERS_LCP.find((p) => lcpMs > p.seuilMs);
  if (!palier) return null;
  return { libelle: `Votre page s’affiche en ${secondes(lcpMs)}`, points: palier.points };
}

/**
 * Ce qui empêche un visiteur convaincu de vous joindre. Les plus lourds du
 * barème, parce que ce sont les seuls dont le coût se compte en clients perdus.
 */
function malusContact(s: SignauxSite): LigneMalus[] {
  const out: LigneMalus[] = [];
  if (!s.formulaire && !s.mailto) {
    out.push({ libelle: "Aucun moyen de vous écrire en ligne", points: 10 });
  }
  if (!s.telCliquable) {
    out.push({ libelle: "Votre numéro ne se compose pas en un clic", points: 10 });
  }
  if (s.nbCta < 2) {
    out.push({ libelle: "Presque aucun bouton pour vous contacter", points: 5 });
  }
  return out;
}

/** La confiance : ce qui fait hésiter au moment de choisir. */
function malusConfiance(s: SignauxSite, ctx: ContexteEntreprise): LigneMalus[] {
  const out: LigneMalus[] = [];
  if (!s.avisDansLaPage && !s.widgetAvis) {
    out.push({ libelle: "Vos avis clients n’apparaissent pas sur le site", points: 5 });
  }
  if (!s.mentionsLegales) {
    out.push({ libelle: "Mentions légales absentes", points: 3 });
  }
  if (!s.https) {
    out.push({ libelle: "Connexion non sécurisée : le navigateur affiche un avertissement", points: 10 });
  }
  /*
   * PAS DE MALUS SUR LE NOMBRE D'AVIS GOOGLE, et c'est une règle ancienne que
   * cette réécriture a failli emporter. La note porte sur LE SITE. Le nombre
   * d'avis reçus n'est pas le site : c'est la réputation, elle ne se répare pas
   * en achetant un site, et « votre site : 62/100 » cesserait de vouloir dire
   * quelque chose si elle y entrait. L'axe popularité existe, s'affiche et
   * produit des constats vendables — il pèse zéro dans la note, comme avant.
   */
  return out;
}

/** Ce qui empêche Google de vous trouver ou de vous comprendre. */
function malusVisibilite(s: SignauxSite, ctx: ContexteEntreprise): LigneMalus[] {
  const out: LigneMalus[] = [];
  if (s.noindex) {
    // Le plus grave du barème après l'affichage : la page existe et personne
    // ne peut la trouver.
    out.push({ libelle: "Votre page demande à Google de ne pas l’afficher", points: 15 });
  }
  if (!s.title?.trim()) {
    out.push({ libelle: "Titre de page absent", points: 3 });
  }
  if (!s.metaDescription?.trim()) {
    out.push({ libelle: "Aucun résumé sous votre résultat Google", points: 3 });
  }
  if (s.nbImagesSansAlt > 2) {
    out.push({
      libelle: `${s.nbImagesSansAlt} photos sans description lisible par Google`,
      points: 3,
    });
  }
  if (!s.jsonLdLocalBusiness) {
    out.push({ libelle: "Fiche d’entreprise non déclarée à Google", points: 2 });
  }
  if (ctx.ville && s.villeDansTitre === false) {
    out.push({ libelle: `Votre ville n’apparaît pas dans le titre du site`, points: 3 });
  }
  return out;
}

/**
 * La note d'un site, par soustraction depuis 100.
 *
 * `lcpMs` vient de PageSpeed et n'est donc pas toujours là. Le reste se lit dans
 * le HTML qu'on a déjà téléchargé : ce sont des faits binaires — la balise est
 * présente ou elle ne l'est pas — sans seuil inventé, donc sans risque d'être à
 * côté de la plaque.
 */
export function noteParMalus(
  s: SignauxSite,
  ctx: ContexteEntreprise = {},
  lcpMs?: number | null,
): NoteParMalus {
  /*
   * UN SITE INJOIGNABLE N'A PAS DE NOTE, il a un constat.
   *
   * Le piège du barème par soustraction : sans HTML à lire, presque aucun malus
   * ne se déclenche, et le site absent ressortait à 90/100 — mieux noté que tous
   * ceux qui existent. L'absence de mesure n'est pas une bonne mesure. On rend
   * zéro, et l'appelant n'écrit de toute façon aucune note pour ces lignes.
   */
  if (!s.joignable) {
    return { note: 0, lignes: [{ libelle: "Site injoignable", points: 100 }], plancherAtteint: false };
  }

  const affichage = malusAffichage(lcpMs);

  const lignes = [
    ...(affichage ? [affichage] : []),
    ...malusContact(s),
    ...malusConfiance(s, ctx),
    ...malusVisibilite(s, ctx),
  ].sort((a, b) => b.points - a.points);

  const total = lignes.reduce((somme, l) => somme + l.points, 0);
  const brute = 100 - total;

  return {
    note: Math.max(NOTE_PLANCHER, brute),
    lignes,
    plancherAtteint: brute < NOTE_PLANCHER,
  };
}
