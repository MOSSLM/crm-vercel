/**
 * Le vocabulaire de l'explorateur d'entreprises — partagé par la route API et
 * l'écran, pour qu'une clé de palier ne soit jamais écrite deux fois.
 *
 * Les clés (`moins_100k`, `de_10_49`, `prete`…) sont produites par la fonction
 * SQL `explorateur_entreprises` : les changer ici sans changer le SQL casserait
 * silencieusement les filtres. Voir sql/20260817_explorateur_entreprises.sql.
 */

/** Un tri-état : « oui », « non », ou pas de filtre du tout. */
export type Ternaire = "oui" | "non" | undefined;

export type FiltresExplorateur = {
  q?: string;
  qualifie?: Ternaire;
  opportunite?: Ternaire;
  fiche_google?: Ternaire;
  demarche?: Ternaire;
  rge?: Ternaire;
  email?: Ternaire;
  telephone?: Ternaire;
  siret?: Ternaire;
  logo?: Ternaire;
  /** Que faire des fiches masquées / archivées. Par défaut : les exclure. */
  masquees?: "exclure" | "inclure" | "seulement";
  archivees?: "exclure" | "inclure" | "seulement";
  avis_min?: number;
  avis_max?: number;
  note_min?: number;
  ca_min?: number;
  ca_max?: number;
  site?: string[];
  demo?: string[];
  ca?: string[];
  effectif?: string[];
  avis?: string[];
  departements?: string[];
  villes?: string[];
  sources?: string[];
  cohortes?: string[];
  /** CMS/plateforme détectés — "wordpress", "wix"… voir techno.ts. */
  technologies?: string[];
  /** Un lot se choisit, pas se coche : un seul à la fois. */
  lot_id?: number;
};

export type TriExplorateur =
  | "nom"
  | "ville"
  | "avis"
  | "note"
  | "ca"
  | "recent"
  | "touche"
  | "anciennete";

export const TRIS: { valeur: TriExplorateur; label: string }[] = [
  { valeur: "nom", label: "Nom" },
  { valeur: "ville", label: "Ville" },
  { valeur: "avis", label: "Nombre d'avis" },
  { valeur: "note", label: "Note Google" },
  { valeur: "ca", label: "Chiffre d'affaires" },
  { valeur: "recent", label: "Date d'ajout" },
  { valeur: "touche", label: "Première touche" },
  { valeur: "anciennete", label: "Ancienneté technique (ascendant = plus vieux d'abord)" },
];

export type LigneEntreprise = {
  id: number;
  nom: string | null;
  ville: string | null;
  code_postal: string | null;
  departement: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site: string | null;
  domaine: string | null;
  logo_url: string | null;
  google_place_id: string | null;
  google_maps_url: string | null;
  note_moyenne: number | null;
  nombre_avis: number | null;
  qualifie: boolean;
  masquee: boolean;
  archivee: boolean;
  siret: string | null;
  sources: string[];
  metier: string | null;
  etat_site: "present" | "absent" | "inconnu";
  etat_demo: "aucune" | "brouillon" | "framer" | "echec" | "prete" | "publiee";
  palier_ca: string;
  palier_avis: string;
  palier_effectif: string;
  chiffre_affaires: number | null;
  exercice_annee: number | null;
  tranche_effectif_code: string | null;
  categorie_entreprise: string | null;
  date_creation: string | null;
  rge: boolean;
  opportunite_id: string | null;
  stage_id: number | null;
  opportunite_montant: number | null;
  site_demo_id: string | null;
  demo_sous_domaine: string | null;
  demo_domaine: string | null;
  premiere_touche_le: string | null;
  cohorte: string | null;
  owner_id: string | null;
  created_at: string;
  /** "wordpress", "wix"… "inconnu" quand jamais analysé ou non reconnu. */
  cms: string | null;
  cms_version: string | null;
  theme: string | null;
  /** La plus récente des dates constatées, tous indices confondus — voir techno.ts. */
  derniere_modif_site: string | null;
  /** Première capture Wayback connue — proxy d'ancienneté du site. */
  en_ligne_depuis: string | null;
};

export type Facettes = {
  qualification: { qualifiee: number; non_qualifiee: number };
  opportunite: { avec: number; sans: number };
  fiche_google: { avec: number; sans: number };
  demarchage: { demarchee: number; jamais: number };
  contact: { email: number; telephone: number; aucun: number };
  rge: { oui: number; non: number };
  site: Record<string, number>;
  demo: Record<string, number>;
  ca: Record<string, number>;
  avis: Record<string, number>;
  effectif: Record<string, number>;
  cohorte: Record<string, number>;
  sources: Record<string, number>;
  technologie: Record<string, number>;
  departements: { cle: string; n: number }[];
  villes: { cle: string; n: number }[];
};

export type ReponseExplorateur = {
  total: number;
  page: number;
  taille: number;
  tri: string;
  sens: string;
  facettes: Facettes;
  lignes: LigneEntreprise[];
};

/* ------------------------------------------------------------------ */
/* Libellés — une clé technique ne s'affiche jamais telle quelle.       */
/* ------------------------------------------------------------------ */

export const LABELS_SITE: Record<string, string> = {
  present: "A un site",
  absent: "Sans site (vérifié)",
  inconnu: "Site inconnu",
};

export const LABELS_DEMO: Record<string, string> = {
  aucune: "Aucune démo",
  brouillon: "Démo en brouillon",
  framer: "Démo Framer",
  echec: "Démo en échec",
  prete: "Démo prête",
  publiee: "Démo publiée",
};

export const LABELS_CA: Record<string, string> = {
  inconnu: "CA inconnu",
  moins_100k: "< 100 k€",
  de_100k_500k: "100 – 500 k€",
  de_500k_1m: "500 k€ – 1 M€",
  de_1m_5m: "1 – 5 M€",
  plus_5m: "> 5 M€",
};

export const LABELS_AVIS: Record<string, string> = {
  inconnu: "Avis inconnus",
  aucun: "Aucun avis",
  de_1_9: "1 à 9 avis",
  de_10_49: "10 à 49 avis",
  de_50_199: "50 à 199 avis",
  plus_200: "200 avis et plus",
};

/** Tranches d'effectif INSEE, telles que l'API Recherche d'entreprises les rend. */
export const LABELS_EFFECTIF: Record<string, string> = {
  inconnu: "Effectif inconnu",
  NN: "Non employeur",
  "00": "0 salarié",
  "01": "1 ou 2 salariés",
  "02": "3 à 5 salariés",
  "03": "6 à 9 salariés",
  "11": "10 à 19 salariés",
  "12": "20 à 49 salariés",
  "21": "50 à 99 salariés",
  "22": "100 à 199 salariés",
  "31": "200 à 249 salariés",
  "32": "250 à 499 salariés",
  "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés",
  "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};

export const LABELS_SOURCE: Record<string, string> = {
  ademe_rge: "ADEME (RGE)",
  api_gouv: "API Recherche d'entreprises",
  google_maps: "Google Maps",
  reseau_proeco: "ProÉco",
  claude_qualification: "Qualification IA",
  claude_masque: "Masquée par l'IA",
  claude_fusion: "Fusion IA",
};

export const LABELS_COHORTE: Record<string, string> = {
  aucune: "Hors cohorte",
  A_site_faible: "A — site faible",
  B_sans_site: "B — sans site",
};

/** Voir techno.ts pour la liste des signatures reconnues. */
export const LABELS_CMS: Record<string, string> = {
  inconnu: "Non analysé / non reconnu",
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  webflow: "Webflow",
  joomla: "Joomla",
  drupal: "Drupal",
  prestashop: "PrestaShop",
  jimdo: "Jimdo",
  duda: "Duda",
  "e-monsite": "e-monsite",
  "google-sites": "Google Sites",
};

/** Un ordre d'affichage stable, pour que les camemberts ne dansent pas. */
export const ORDRE_SITE = ["present", "absent", "inconnu"];
export const ORDRE_DEMO = ["publiee", "prete", "framer", "brouillon", "echec", "aucune"];
export const ORDRE_CA = ["moins_100k", "de_100k_500k", "de_500k_1m", "de_1m_5m", "plus_5m", "inconnu"];
export const ORDRE_AVIS = ["aucun", "de_1_9", "de_10_49", "de_50_199", "plus_200", "inconnu"];
export const ORDRE_EFFECTIF = ["NN", "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53", "inconnu"];

export const libelle = (table: Record<string, string>, cle: string): string => table[cle] ?? cle;

/** Les filtres réellement posés — sert au bandeau « ce que vous regardez ». */
export function filtresActifs(f: FiltresExplorateur): number {
  let n = 0;
  for (const [cle, valeur] of Object.entries(f)) {
    if (valeur === undefined || valeur === null || valeur === "") continue;
    // Les deux réglages de périmètre ne comptent pas tant qu'ils sont au défaut.
    if ((cle === "masquees" || cle === "archivees") && valeur === "exclure") continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    n += 1;
  }
  return n;
}
