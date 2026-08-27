import type { LucideIcon } from "lucide-react";
import { Hammer, Headset, ListTodo, Users } from "lucide-react";

/**
 * Ce que le téléphone montre — et RIEN D'AUTRE.
 *
 * ── LE DÉFAUT QU'ON CORRIGE ──────────────────────────────────────────────
 * La barre du bas versait dans un téléphone la totalité du menu de bureau :
 * huit catégories, dont quatre en accès direct et le reste dans une feuille
 * « Plus » qui rouvrait tout le CRM. On y arrivait donc, en trois taps, sur le
 * Site builder, le Form builder ou le câblage d'une automatisation — des écrans
 * qui demandent deux mains, un clavier et 1 400 px de large. Le menu promettait
 * un travail que l'appareil ne peut pas faire.
 *
 * ── LA RÈGLE, ET ELLE EST COURTE ─────────────────────────────────────────
 * Une entrée n'est ici que si l'écran a été FAIT ou VÉRIFIÉ pour le pouce. Pas
 * « ça passe à peu près » : chaque `pourquoi` ci-dessous doit pouvoir se
 * défendre devant l'appareil. La liste est donc volontairement pauvre, et c'est
 * la seule chose qui l'empêche de regonfler — sans critère, tout finit par
 * mériter sa place.
 *
 * ── CE QUI N'EST PAS ICI RESTE ATTEIGNABLE ───────────────────────────────
 * Aucune route n'est bloquée. Ce qui sort de la liste passe par la RECHERCHE du
 * haut (`⌘K`, le bouton loupe), qui indexe tous les outils de `spaces.ts`. La
 * distinction : le menu propose, la recherche permet. Un écran de bureau ouvert
 * depuis un téléphone reste un écran de bureau — mais on l'aura demandé.
 *
 * ── UNE SEULE LIGNE, JAMAIS DEUX, JAMAIS DE « PLUS » ─────────────────────
 * Cinq colonnes est le maximum tenable sur 360 px (72 px par cible). En ajouter
 * une sixième ne rendrait pas la barre plus utile, elle rendrait les six
 * illisibles. Si une destination doit entrer, une autre doit sortir — et c'est
 * une bonne contrainte.
 */

export type DestinationMobile = {
  /** Identifiant stable, comparé à la destination active. */
  cle: string;
  /** Court : il doit tenir sous une icône de 72 px de large. */
  titre: string;
  href: string;
  icone: LucideIcon;
  /**
   * Les chemins qui allument cette entrée. Le premier sert aussi de `href`
   * quand il n'y a rien d'autre. Un préfixe allume ses sous-chemins.
   */
  prefixes: string[];
  /** La défense de sa présence. Pas un commentaire : le critère d'entrée. */
  pourquoi: string;
};

/**
 * Les destinations de l'admin, dans l'ordre de la journée : on prépare
 * (atelier), on démarche (terrain), on coche (tâches), on regarde l'équipe.
 */
export const DESTINATIONS_ADMIN: DestinationMobile[] = [
  {
    cle: "atelier",
    titre: "Atelier",
    href: "/atelier",
    icone: Hammer,
    prefixes: ["/atelier"],
    pourquoi:
      "Écrit pour le pouce : des cartes, aucune table, toutes les cibles à 44 px au moins. C'est le seul écran du CRM dont le format mobile est le format d'origine.",
  },
  {
    cle: "terrain",
    titre: "Terrain",
    href: "/terrain",
    icone: Headset,
    prefixes: ["/terrain"],
    pourquoi:
      "Les trois colonnes de `dem-skin` s'empilent sous 1 100 px, et les compteurs passent à deux colonnes. Ce n'est pas né mobile — c'est vérifié mobile, ce qui suffit pour la file du jour.",
  },
  {
    cle: "taches",
    titre: "Tâches",
    href: "/prospection/taches",
    icone: ListTodo,
    prefixes: ["/prospection/taches"],
    pourquoi:
      "Le tableau cède la place à des cartes sous 768 px, en gardant les colonnes de la vue enregistrée. Une table de neuf colonnes sur 360 px ne se lit pas, quel que soit le défilement.",
  },
  {
    cle: "equipe",
    titre: "Équipe",
    href: "/equipe",
    icone: Users,
    prefixes: ["/equipe"],
    pourquoi:
      "Une carte par personne, cinq nombres en grille auto-ajustée. Écrit mobile d'abord — c'est l'écran qu'on ouvre entre deux rendez-vous pour savoir si quelqu'un a décroché.",
  },
];

/**
 * Les destinations de l'agent freelance. Plus courte encore : son métier tient
 * en deux écrans, et les lui donner en grand vaut mieux que lui rouvrir le
 * portail entier.
 */
export const DESTINATIONS_AGENT: DestinationMobile[] = [
  {
    cle: "demarchage",
    titre: "Démarchage",
    href: "/espace-agent/demarchage",
    icone: Headset,
    prefixes: ["/espace-agent/demarchage"],
    pourquoi: "Le même écran que `/terrain`, dans la coque agent. Vérifié aux mêmes largeurs.",
  },
  {
    cle: "taches",
    titre: "Tâches",
    href: "/espace-agent/taches",
    icone: ListTodo,
    prefixes: ["/espace-agent/taches"],
    pourquoi:
      "Le même `TachesTableau`, en périmètre agent : il bascule en cartes sous 768 px comme celui de l'admin.",
  },
];

/** Le nombre de colonnes que la barre accepte. Au-delà, on ne vise plus. */
export const MAX_DESTINATIONS = 5;

/**
 * La destination allumée par un chemin, ou `null` — et `null` est un état
 * NORMAL, pas une anomalie : c'est ce qui se passe dès qu'on ouvre par la
 * recherche un écran qui n'est pas dans la barre. La barre n'allume alors rien,
 * plutôt que de laisser croire qu'on est ailleurs.
 *
 * Le plus long préfixe gagne : `/prospection/taches` doit l'emporter sur
 * `/prospection` si les deux venaient à coexister.
 */
export const destinationActive = (
  chemin: string,
  destinations: DestinationMobile[],
): string | null => {
  let gagnante: string | null = null;
  let longueur = -1;
  for (const d of destinations) {
    for (const p of d.prefixes) {
      if ((chemin === p || chemin.startsWith(p + "/")) && p.length > longueur) {
        gagnante = d.cle;
        longueur = p.length;
      }
    }
  }
  return gagnante;
};
