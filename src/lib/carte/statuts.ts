/**
 * Modèle de statut de la carte du territoire.
 *
 * Le CRM ne stocke pas un « statut » unique par entreprise : l'information est
 * répartie entre la fiche (`qualifie`, `hidden_in_qualification`, `archived_at`)
 * et ses affaires (`opportunites` → `etapes_pipeline`). Ce module fait la
 * synthèse en une seule valeur, celle que la carte colorie.
 */

export type StatutCarte = "prospect" | "qualifie" | "contact" | "client" | "masquee" | "ecartee";

export type StatutMeta = {
  id: StatutCarte;
  label: string;
  description: string;
  color: string;
};

/** Ordre d'affichage : progression commerciale, puis les fiches sorties du flux. */
export const STATUTS: StatutMeta[] = [
  {
    id: "prospect",
    label: "Prospect",
    description: "Fiche collectée, pas encore qualifiée",
    color: "#C8881F",
  },
  {
    id: "qualifie",
    label: "Qualifiée",
    description: "Cible validée, prête à être démarchée",
    color: "#2F7AE0",
  },
  {
    id: "contact",
    label: "Contact entamé",
    description: "Approche lancée : affaire au-delà de la qualification",
    color: "#7A5AE0",
  },
  {
    id: "client",
    label: "Client",
    description: "Signature ou acompte encaissé",
    color: "#1F8A5B",
  },
  {
    id: "masquee",
    label: "Masquée",
    description: "Retirée de la file de qualification",
    color: "#8AA0C0",
  },
  {
    id: "ecartee",
    label: "Écartée",
    description: "Archivée, ou affaire perdue",
    color: "#B5322F",
  },
];

export const STATUT_BY_ID: Record<StatutCarte, StatutMeta> = Object.fromEntries(
  STATUTS.map((s) => [s.id, s]),
) as Record<StatutCarte, StatutMeta>;

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Étapes d'entrée : l'affaire existe mais personne n'a encore approché. */
const ETAPES_AVANT_CONTACT = new Set(["qualifie", "lm deploye", "nouveau lead"]);
const ETAPES_CLIENT = new Set(["signature", "acompte", "client signe"]);
const ETAPES_PERDU = new Set(["lost", "perdu"]);

/** Ce qu'une affaire dit du rapport commercial avec l'entreprise. */
export type AvancementAffaire = "aucun" | "contact" | "client" | "perdu";

/**
 * Les pipelines sont éditables : on classe d'abord par nom d'étape (ce qui
 * couvre tous les pipelines existants), et on retombe sur `ordre` pour une
 * étape ajoutée après coup — les deux premières places d'un pipeline sont, par
 * convention, « Qualifié » puis « LM Déployé ».
 */
export function avancementDeLEtape(nom: string, ordre: number): AvancementAffaire {
  const n = normalize(nom);
  if (ETAPES_PERDU.has(n)) return "perdu";
  if (ETAPES_CLIENT.has(n)) return "client";
  if (ETAPES_AVANT_CONTACT.has(n)) return "aucun";
  if (n === "en attente" || ordre >= 3) return "contact";
  return "aucun";
}

const RANG: Record<AvancementAffaire, number> = { aucun: 0, perdu: 1, contact: 2, client: 3 };

/** Garde l'affaire la plus avancée quand une entreprise en porte plusieurs. */
export function avancementLePlusAvance(a: AvancementAffaire, b: AvancementAffaire): AvancementAffaire {
  return RANG[b] > RANG[a] ? b : a;
}

export type EntrepriseStatutInput = {
  qualifie: boolean;
  hidden_in_qualification?: boolean | null;
  archived_at?: string | null;
};

/**
 * Statut affiché sur la carte, du plus fort au plus faible.
 *
 * « Masquée » passe avant « Qualifiée » : c'est un geste humain explicite
 * (« ne me la remontre plus »), et la carte sert justement à retrouver ces
 * fiches-là. Une entreprise à la fois masquée et qualifiée compte donc comme
 * masquée.
 */
export function statutEntreprise(
  entreprise: EntrepriseStatutInput,
  avancement: AvancementAffaire = "aucun",
): StatutCarte {
  if (entreprise.archived_at) return "ecartee";
  if (avancement === "client") return "client";
  if (avancement === "contact") return "contact";
  if (avancement === "perdu") return "ecartee";
  if (entreprise.hidden_in_qualification) return "masquee";
  if (entreprise.qualifie) return "qualifie";
  return "prospect";
}
