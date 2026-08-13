// types.ts — formes partagées entre les composants du poste de travail Démarchage.
// Reflètent exactement ce que renvoient `GET /api/agent/tasks` et
// `GET /api/agent/demarchage/company` : un seul endroit à corriger si l'une
// des deux routes change de forme.

import type { ProspectionTaskPayload } from "@/components/automations/types";
import type { StageRole } from "@/lib/opportunites/stage-roles";

/** Les canaux réellement possibles dans notre file (`wait` = attente-réponse). */
export type DemKind = "call" | "whatsapp" | "linkedin" | "wait";

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
};

export type DemarchageQueueMeta = { due_today: number; done_today: number };

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

export type DemTemplates = {
  whatsapp: { id: string; name: string; body: string }[];
  email: { id: string; name: string; subject: string | null; body: string }[];
};
