// types.ts — formes partagées entre les composants du poste de travail Démarchage.
// Reflètent exactement ce que renvoient `GET /api/agent/tasks` et
// `GET /api/agent/demarchage/company` : un seul endroit à corriger si l'une
// des deux routes change de forme.

import type { ProspectionTaskPayload } from "@/components/automations/types";
import type { StageRole } from "@/lib/opportunites/stage-roles";

/** Les canaux réellement possibles dans notre file (`wait` = attente-réponse). */
export type DemKind = "call" | "whatsapp" | "linkedin" | "wait";

/**
 * La cohorte de la campagne d'août : « A » a déjà un site (mauvais), « B » n'a
 * rien en ligne. Les deux se comparent AU MÊME ÂGE (J+1, J+3, J+7, J+14), d'où
 * une colonne dédiée plutôt qu'une étiquette libre — un libellé qui dérive d'un
 * jour à l'autre rendrait la comparaison ininterprétable.
 *
 * `null` = hors campagne : tout ce qui vivait dans la file avant le 17 août.
 */
export type DemCohorte = "A_site_faible" | "B_sans_site";

export type DemarchageContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  tel: string | null;
  email: string | null;
};

export type DemarchageEntrepriseRef = {
  id: number;
  name: string | null;
  ville: string | null;
  telephone: string | null;
};

/** Une étape de séquence, telle que la frise la dessine. */
export type DemStep = { kind: string; day: number; label: string };

export type DemarchageSequenceInfo = {
  name: string | null;
  stepLabel: string;
  stepIndex: number | null;
  totalSteps: number;
  steps: DemStep[];
};

/**
 * Ce que le prospect a fait de sa démo, mesuré par GA4 (cf.
 * src/lib/analytics-radar/site-intent.ts). `null` quand aucun site démo n'est
 * rattaché à l'entreprise, ou quand GA4 n'a rien vu — jamais un score inventé.
 */
export type DemarchageIntent = {
  score: number;
  tier: "none" | "tiede" | "chaud" | "tres_chaud" | "brulant";
  flame: string;
  callWhen: "maintenant" | "aujourdhui" | "j1" | "j2" | "plus_tard";
  reasons: string[];
  sessions: number;
  pageViews: number;
  engagementSec: number;
  lastDay: string | null;
  /** Signal chaud jamais rappelé passé le délai de grâce — une fuite. */
  missed: boolean;
  /** Jours écoulés depuis la dernière visite mesurée. */
  daysSinceVisit: number | null;
};

export type DemarchageTask = {
  id: string;
  kind: DemKind;
  status: string;
  title: string | null;
  due_at: string | null;
  contact_id: string | null;
  entreprise_id: number | null;
  opportunite_id: string | null;
  automation_id: string | null;
  enrollment_id: string | null;
  step_id: string | null;
  payload: ProspectionTaskPayload;
  contact: DemarchageContact | DemarchageContact[] | null;
  entreprise: DemarchageEntrepriseRef | DemarchageEntrepriseRef[] | null;
  sequence: DemarchageSequenceInfo | null;
  intent: DemarchageIntent | null;
  /**
   * L'inscription a déjà enregistré une réponse du prospect : la discussion est
   * ouverte. C'est ce qui sort la tâche du quota quotidien — celui-ci plafonne
   * les premiers contacts, pas les échanges avec ceux qui ont répondu.
   */
  in_conversation?: boolean;
  /**
   * La cohorte de campagne de l'entreprise. Absente sur tout ce qui a été
   * enrôlé avant la campagne — d'où l'optionnel, qui n'est pas de la prudence
   * mais l'état réel de la moitié de la file.
   */
  cohorte?: DemCohorte | null;
  /**
   * Appel à FROID : aucune séquence, aucune étape, aucun script préparé. C'est
   * le mode de travail principal de la campagne (100 entreprises par jour), et
   * c'est aussi le cas que tout l'écran ne prévoyait pas — il déduisait la
   * moitié de ce qu'il affiche de `sequence`.
   */
  hors_sequence?: boolean;
  /**
   * Quand l'entreprise a été touchée pour la PREMIÈRE fois, `null` si jamais.
   * C'est ce qui sépare les deux files du poste de travail : sans date, la ligne
   * est un premier contact ; avec, c'est un suivi (cf. `estPremierContact`).
   */
  premiere_touche_le?: string | null;
};

/**
 * Ce que la file annonce en tête de rail. `done_today_by_kind` alimente le plan
 * du jour (cf. `demarchage-buckets`) : une tâche déjà bouclée a consommé une
 * place de la cadence quotidienne de son canal.
 */
export type DemarchageQueueMeta = {
  done_today: number;
  /**
   * L'AVANCEMENT DE L'OBJECTIF : combien d'entreprises ont été abordées pour la
   * PREMIÈRE fois aujourd'hui, canal par canal. C'est le « 12 / 20 » de la file
   * des premiers contacts.
   *
   * Ni les discussions ni les relances n'y entrent — aucune des deux n'a
   * d'objectif à tenir. La frontière est `entreprises.premiere_touche_le`, la
   * même que celle qui sépare les deux files de l'écran.
   */
  done_today_by_kind: Record<string, number>;
  /** Messages de discussion bouclés aujourd'hui — hors cadence, pour mémoire. */
  done_today_conversation: number;
  /**
   * Les cadences quotidiennes EFFECTIVES de l'agent, par canal
   * (`{"call":20,"whatsapp":60}`). Réglables par agent : la campagne d'août ne
   * tient pas aux mêmes chiffres que le régime ordinaire.
   *
   * Absent ou incomplet, on retombe canal par canal sur `DAILY_QUOTA` — un
   * agent sans réglage doit voir la cadence par défaut, jamais un plafond vide.
   * Le contenu vient d'un `jsonb` : il se relit, il ne se croit pas.
   */
  quotas?: Record<string, number> | null;
};

export type DemarchagePatchBody = {
  id: string;
  status: string;
  opportunite_id?: string;
  outcome?: StageRole;
  step_outcome?: string;
  note?: string;
  snooze_until?: string;
};

export type CompanyContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tel: string | null;
  role_title: string | null;
  is_decision_maker: boolean | null;
  linkedin_url: string | null;
};

export type CompanyEntreprise = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  telephone: string | null;
  email: string | null;
  site_web_canonique: string | null;
  siret: string | null;
  owner_id: string | null;
};

export type CompanyDonneesPubliques = {
  entreprise_id: number;
  denomination: string | null;
  date_creation: string | null;
  etat_administratif: string | null;
  naf_code: string | null;
  categorie_entreprise: string | null;
  tranche_effectif_code: string | null;
  tranche_effectif_annee: string | null;
  chiffre_affaires: number | null;
  resultat_net: number | null;
  exercice_annee: number | null;
  dirigeants: unknown[] | null;
} | null;

export type CompanySite = {
  id: string;
  name: string | null;
  published_subdomain: string | null;
  published_domain: string | null;
  is_published: boolean | null;
  build_stage: string | null;
  paywall_enabled: boolean | null;
} | null;

export type CompanyUpcomingBooking = {
  id: string;
  event_title: string;
  start_at: string;
  end_at: string;
  status: string;
  invitee_name: string;
} | null;

export type CompanyOpportunite = {
  id: string;
  name: string | null;
  montant: number | null;
  stageNom: string | null;
} | null;

export type CompanyBundle = {
  entreprise: CompanyEntreprise;
  donneesPubliques: CompanyDonneesPubliques;
  contacts: CompanyContact[];
  site: CompanySite;
  upcomingBooking: CompanyUpcomingBooking;
  opportunite: CompanyOpportunite;
};

/** L'audit, tel que `/api/audit-site/[entrepriseId]` le renvoie. */
export type DemAudit = {
  note_globale: number | null;
  libelle: string | null;
  axes: { id: string; note: number }[];
  capture_url: string | null;
  url_analysee: string | null;
  injoignable: boolean;
} | null;
