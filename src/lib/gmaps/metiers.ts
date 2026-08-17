import { SERVICE_TAGS_TAXONOMY, serviceTagKey } from "@/utils/serviceTags";

/**
 * Les métiers qu'on va chercher sur Google Maps.
 *
 * DEUX VOCABULAIRES, ET ILS NE SE VALENT PAS
 * `SERVICE_TAGS_TAXONOMY` est le vocabulaire du CRM : ce qu'une fiche porte,
 * ce qu'une page de site reconnaît. Il est fait pour classer, pas pour chercher.
 * Taper « plomberie » dans Google Maps rend des magasins de sanitaire ; taper
 * « plombier » rend les artisans qu'on démarche. « ventilation » rend des
 * fabricants de gaines ; « VMC » rend les installateurs. Le mot qu'on TAPE et
 * le tag qu'on RANGE sont donc deux choses distinctes — d'où `motCle` à côté
 * de `tag`, et non un seul libellé qui servirait aux deux.
 *
 * La taxonomie reste la source : ajouter un métier ici sans l'y ajouter le
 * rendrait invisible partout ailleurs dans le CRM. `verifierAlignement` ci-
 * dessous refuse ce décalage plutôt que de le laisser filer.
 *
 * `synonymes` sert à l'inverse : relire ce qui est DÉJÀ en base. Les recherches
 * passées ont été lancées avec les mots de l'époque (« clim », « Climatisation »
 * avec une majuscule, « plombier »), et il faut les recompter sous le bon
 * métier, sinon une ville parcourue trois fois s'affiche encore comme vierge.
 */
export type Metier = {
  /** Libellé de référence, tel qu'il figure dans `SERVICE_TAGS_TAXONOMY`. */
  tag: string;
  /** Ce qu'on envoie réellement au scraper comme `businessTypes`. */
  motCle: string;
  /** Autres graphies déjà rencontrées en base, à recompter sous ce métier. */
  synonymes: readonly string[];
};

export const METIERS: readonly Metier[] = [
  {
    tag: "climatisation",
    motCle: "climatisation",
    synonymes: ["clim", "climatiseur", "climaticien", "frigoriste"],
  },
  {
    tag: "pompe à chaleur",
    motCle: "pompe à chaleur",
    // « PAC » seul est ambigu (Pacific, PAC Auto…) : on ne le cherche pas, on
    // se contente de le reconnaître dans l'historique.
    synonymes: ["pac", "pompes à chaleur", "installateur pompe à chaleur"],
  },
  {
    tag: "chauffage",
    motCle: "chauffagiste",
    synonymes: ["chauffage", "chaudière", "chauffagiste"],
  },
  {
    tag: "ventilation",
    motCle: "VMC",
    synonymes: ["vmc", "ventilation"],
  },
  {
    tag: "plomberie",
    motCle: "plombier",
    synonymes: ["plombier", "plomberie", "plombier chauffagiste"],
  },
  {
    tag: "électricité",
    motCle: "électricien",
    synonymes: ["électricien", "électricité", "electricien"],
  },
  {
    tag: "photovoltaïque",
    motCle: "photovoltaïque",
    synonymes: ["solaire", "panneau solaire", "panneaux solaires", "photovoltaique"],
  },
  {
    tag: "rénovation générale",
    motCle: "rénovation énergétique",
    synonymes: ["rénovation", "rénovation générale", "renovation"],
  },
  {
    tag: "bornes IRVE",
    motCle: "borne de recharge",
    synonymes: ["irve", "bornes irve", "borne de recharge véhicule électrique"],
  },
] as const;

/** Métier proposé quand rien n'est demandé : celui que le CRM démarche le plus. */
export const METIER_PAR_DEFAUT = METIERS[0];

/**
 * Index mot → métier. Une même graphie ne peut appartenir qu'à un seul métier :
 * deux entrées en conflit feraient dépendre le comptage de l'ordre de la liste,
 * et la ville basculerait de « vierge » à « couverte » au gré d'un tri.
 */
const PAR_CLEF = (() => {
  const index = new Map<string, Metier>();
  for (const metier of METIERS) {
    for (const mot of [metier.tag, metier.motCle, ...metier.synonymes]) {
      const clef = serviceTagKey(mot);
      if (!clef) continue;
      const dejaPris = index.get(clef);
      if (dejaPris && dejaPris !== metier) {
        throw new Error(
          `Vocabulaire métier ambigu : « ${mot} » est revendiqué par « ${dejaPris.tag} » et « ${metier.tag} »`,
        );
      }
      index.set(clef, metier);
    }
  }
  return index;
})();

/**
 * À quel métier se rattache un mot-clé de recherche ? `null` s'il n'en relève
 * d'aucun.
 *
 * `null` est la bonne réponse pour beaucoup de lignes en base : « serrurier »
 * (essai), « Réseau Proéco Énergies » (import d'un réseau, pas un métier). Les
 * compter au hasard sur un métier voisin gonflerait la couverture d'une ville
 * qu'on n'a jamais parcourue pour ce métier-là.
 */
export function metierDuMotCle(motCle: string | null | undefined): Metier | null {
  if (!motCle) return null;
  return PAR_CLEF.get(serviceTagKey(String(motCle))) ?? null;
}

/** Retrouve un métier par son tag de taxonomie. */
export function metierParTag(tag: string | null | undefined): Metier | null {
  if (!tag) return null;
  const trouve = METIERS.find((m) => serviceTagKey(m.tag) === serviceTagKey(String(tag)));
  return trouve ?? null;
}

/**
 * Les tags de `METIERS` qui ne sont pas dans la taxonomie du CRM, et
 * inversement. Doit rendre deux listes vides — c'est ce que vérifie le test.
 * Un métier proposé ici mais absent de la taxonomie poserait sur les fiches un
 * tag qu'aucune page de site ne reconnaît.
 */
export function verifierAlignement(): { enTrop: string[]; manquants: string[] } {
  const dIci = new Set(METIERS.map((m) => serviceTagKey(m.tag)));
  const duCrm = new Set(SERVICE_TAGS_TAXONOMY.map((t) => serviceTagKey(t)));
  return {
    enTrop: [...dIci].filter((c) => !duCrm.has(c)),
    manquants: [...duCrm].filter((c) => !dIci.has(c)),
  };
}
